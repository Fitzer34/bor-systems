import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { validatePassword } from "../services/password-policy.js";
import { sendStaffInvite } from "../services/invites.js";
import { getPermissions, requirePermission } from "../services/permissions.js";
import { userSiteIds } from "../services/site-membership.js";
import { audit } from "../services/audit.js";
import { inArray } from "drizzle-orm";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users/me", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const [u] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!u) return null;
    const [org] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, c.orgId)).limit(1);
    const permissions = await getPermissions(c.orgId, u.role);
    // Sites this user belongs to. Empty means unrestricted (admins, or not yet
    // assigned) — clients use it for scope + the landing page.
    const siteIds = await userSiteIds(c.orgId, u.id);
    return {
      id: u.id, email: u.email, name: u.name, role: u.role, onDuty: u.onDuty, locale: u.locale,
      siteIds,
      phoneE164: u.phoneE164,
      avatarUrl: u.avatarUrl,
      lastActiveAt: u.lastActiveAt,
      createdAt: u.createdAt,
      organisationId: u.organisationId,
      organisationName: org?.name ?? "",
      // Effective module-visibility + sensitive-action permissions for this
      // user's role (defaults merged with any org override; admin = all true).
      permissions,
    };
  });

  app.post("/users/me/push-token", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ pushToken: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    await db
      .update(schema.users)
      .set({ pushToken: body.data.pushToken })
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)));
    return { ok: true };
  });

  app.patch("/users/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).nullable().optional(),
        locale: z.string().min(2).max(10).optional(),
        // Profile avatar — URL of an image already uploaded via /uploads. Empty
        // string clears it back to null.
        avatarUrl: z.string().max(1000).nullable().optional(),
        // Self-service email change. Re-checks org-email uniqueness below.
        email: z.string().email().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);

    const updates: Record<string, unknown> = {};
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.phoneE164 !== undefined) updates.phoneE164 = body.data.phoneE164;
    if (body.data.locale !== undefined) updates.locale = body.data.locale;
    if (body.data.avatarUrl !== undefined) updates.avatarUrl = body.data.avatarUrl?.trim() || null;
    if (body.data.email !== undefined) updates.email = body.data.email.toLowerCase();
    if (Object.keys(updates).length === 0) return { ok: true };

    try {
      await db
        .update(schema.users)
        .set(updates)
        .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)));
    } catch (err: any) {
      // The (organisation_id, email) unique index rejects a clashing email.
      if (String(err).includes("users_org_email_unique")) return reply.code(409).send({ error: "email_taken" });
      throw err;
    }
    await db.insert(schema.auditLog).values({
      organisationId: c.orgId,
      actorUserId: c.sub,
      action: "user.profile_updated",
      targetType: "user",
      targetId: c.sub,
      metadata: updates,
    });
    return { ok: true };
  });

  app.post("/users/me/password", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const pwCheck = validatePassword(body.data.newPassword);
    if (!pwCheck.ok) return reply.code(400).send({ error: pwCheck.reason });
    const c = ctx(req);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!user) return reply.code(404).send({ error: "not_found" });
    const ok = await argon2.verify(user.passwordHash, body.data.currentPassword);
    if (!ok) return reply.code(401).send({ error: "wrong_current_password" });
    const newHash = await argon2.hash(body.data.newPassword);
    await db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, c.sub));
    await db.insert(schema.auditLog).values({
      organisationId: c.orgId,
      actorUserId: c.sub,
      action: "user.password_changed",
      targetType: "user",
      targetId: c.sub,
    });
    return { ok: true };
  });

  app.get("/users", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        onDuty: schema.users.onDuty,
        deactivatedAt: schema.users.deactivatedAt,
        // Surface invite state so the UI can show "Invited — pending" and a
        // Resend action. A pending invite = invitedAt set, inviteAcceptedAt null.
        invitedAt: schema.users.invitedAt,
        inviteAcceptedAt: schema.users.inviteAcceptedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.organisationId, c.orgId));
    const memberships = await db
      .select({ userId: schema.userSites.userId, buildingId: schema.userSites.buildingId })
      .from(schema.userSites)
      .where(eq(schema.userSites.organisationId, c.orgId));
    const byUser = new Map<string, string[]>();
    for (const m of memberships) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m.buildingId]);
    return { users: rows.map((r) => ({ ...r, siteIds: byUser.get(r.id) ?? [] })) };
  });

  /* Replace a user's site membership. Admin only. Every id must be one of
   * this org's buildings. An empty list = unrestricted again. */
  app.put("/users/:id/sites", { preHandler: [app.authenticate, requireRole(["admin"]), requirePermission("action.manage_users")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ buildingIds: z.array(z.string().uuid()).max(500) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [target] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!target) return reply.code(404).send({ error: "not_found" });
    const wanted = [...new Set(body.data.buildingIds)];
    if (wanted.length) {
      const owned = await db
        .select({ id: schema.buildings.id })
        .from(schema.buildings)
        .where(and(eq(schema.buildings.organisationId, c.orgId), inArray(schema.buildings.id, wanted)));
      if (owned.length !== wanted.length) return reply.code(400).send({ error: "unknown_building" });
    }
    await db.transaction(async (tx) => {
      await tx.delete(schema.userSites).where(and(eq(schema.userSites.organisationId, c.orgId), eq(schema.userSites.userId, id)));
      if (wanted.length) {
        await tx.insert(schema.userSites).values(wanted.map((b) => ({ organisationId: c.orgId, userId: id, buildingId: b })));
      }
    });
    audit(c.orgId, c.sub, "user.sites_changed", "user", id, { name: target.name, buildingIds: wanted });
    return { ok: true, siteIds: wanted };
  });

  app.post("/users", { preHandler: [app.authenticate, requireRole(["admin"]), requirePermission("action.manage_users")] }, async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        // Optional now: when omitted (or sendInvite is true), we email the new
        // hire a one-time link to set their own password instead.
        password: z.string().min(8).optional(),
        role: z.enum(["admin", "supervisor", "cleaner"]),
        phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
        locale: z.string().default("en-GB"),
        sendInvite: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input", details: body.error.flatten() });

    // Invite mode is the default — admins add a staff member and we email the
    // link. They can still hand-set a password by sending one (and not asking
    // for an invite), which keeps the old behaviour + API back-compat.
    const invite = body.data.sendInvite ?? !body.data.password;
    if (!invite) {
      const pwCheck = validatePassword(body.data.password!);
      if (!pwCheck.ok) return reply.code(400).send({ error: pwCheck.reason });
    }

    const c = ctx(req);
    // Pending invites get an unusable placeholder hash — it can never verify
    // against any password (argon2.verify throws on a non-PHC string, which the
    // login loop treats as "no match"), so the account is unreachable until the
    // invite is accepted and a real hash is set.
    const passwordHash = invite ? "invite_pending" : await argon2.hash(body.data.password!);
    try {
      const [created] = await db
        .insert(schema.users)
        .values({
          organisationId: c.orgId,
          email: body.data.email.toLowerCase(),
          name: body.data.name,
          passwordHash,
          role: body.data.role,
          phoneE164: body.data.phoneE164,
          locale: body.data.locale,
          createdBy: c.sub,
        })
        .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role });

      if (!created) return reply.code(500).send({ error: "create_failed" });

      if (invite) {
        const [org] = await db
          .select({ name: schema.organisations.name })
          .from(schema.organisations)
          .where(eq(schema.organisations.id, c.orgId))
          .limit(1);
        const res = await sendStaffInvite({
          userId: created.id,
          email: created.email,
          name: created.name,
          orgName: org?.name ?? "HazardLink",
          inviterName: c.name,
        });
        await db.insert(schema.auditLog).values({
          organisationId: c.orgId,
          actorUserId: c.sub,
          action: "user.invited",
          targetType: "user",
          targetId: created.id,
          metadata: { email: created.email, role: created.role },
        });
        // If SMTP isn't configured / the send failed, hand back the raw link so
        // the admin can pass it on manually rather than silently failing.
        return { user: created, invited: true, emailSent: !res.emailError, inviteUrl: res.emailError ? res.url : undefined };
      }

      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "user.created",
        targetType: "user",
        targetId: created.id,
        metadata: { email: created.email, role: created.role },
      });
      return { user: created };
    } catch (err: any) {
      if (String(err).includes("users_org_email_unique")) return reply.code(409).send({ error: "email_taken" });
      throw err;
    }
  });

  // Re-send (or first-send) a staff invite. Admin-only. Used when the original
  // email was lost or the link expired. No-op once the user has accepted.
  app.post("/users/:id/resend-invite",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      const [u] = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.id, id), eq(schema.users.organisationId, c.orgId)))
        .limit(1);
      if (!u) return reply.code(404).send({ error: "not_found" });
      if (u.deactivatedAt) return reply.code(409).send({ error: "deactivated" });
      if (u.inviteAcceptedAt) return reply.code(409).send({ error: "already_accepted" });

      const [org] = await db
        .select({ name: schema.organisations.name })
        .from(schema.organisations)
        .where(eq(schema.organisations.id, c.orgId))
        .limit(1);
      const res = await sendStaffInvite({
        userId: u.id,
        email: u.email,
        name: u.name,
        orgName: org?.name ?? "HazardLink",
        inviterName: c.name,
      });
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "user.invite_resent",
        targetType: "user",
        targetId: u.id,
      });
      return { ok: true, emailSent: !res.emailError, inviteUrl: res.emailError ? res.url : undefined };
    },
  );

  app.post("/users/:id/deactivate",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"]), requirePermission("action.delete_records")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      // You can't lock yourself out — someone else has to deactivate you.
      if (id === c.sub) return reply.code(400).send({ error: "cannot_deactivate_self" });
      await db.update(schema.users)
        .set({ deactivatedAt: new Date(), onDuty: false })
        .where(and(eq(schema.users.id, id), eq(schema.users.organisationId, c.orgId)));
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "user.deactivated",
        targetType: "user",
        targetId: id,
      });
      return { ok: true };
    },
  );

  // Reactivate a deactivated account — clears the flag so they can sign in
  // again with their existing credentials.
  app.post("/users/:id/reactivate",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"]), requirePermission("action.manage_users")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      const [u] = await db.select({ id: schema.users.id, deactivatedAt: schema.users.deactivatedAt })
        .from(schema.users)
        .where(and(eq(schema.users.id, id), eq(schema.users.organisationId, c.orgId)))
        .limit(1);
      if (!u) return reply.code(404).send({ error: "not_found" });
      if (!u.deactivatedAt) return reply.code(409).send({ error: "not_deactivated" });
      await db.update(schema.users)
        .set({ deactivatedAt: null })
        .where(eq(schema.users.id, id));
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "user.reactivated",
        targetType: "user",
        targetId: id,
      });
      return { ok: true };
    },
  );

  // Change another user's role. Admin-only; you can't change your own role
  // (prevents the last admin demoting themselves into a locked-out org).
  app.patch("/users/:id/role",
    { preHandler: [app.authenticate, requireRole(["admin"]), requirePermission("action.manage_users")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z.object({ role: z.enum(["admin", "supervisor", "cleaner"]) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      if (id === c.sub) return reply.code(400).send({ error: "cannot_change_own_role" });
      const [u] = await db.select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(and(eq(schema.users.id, id), eq(schema.users.organisationId, c.orgId)))
        .limit(1);
      if (!u) return reply.code(404).send({ error: "not_found" });
      await db.update(schema.users)
        .set({ role: parsed.data.role })
        .where(eq(schema.users.id, id));
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "user.role_changed",
        targetType: "user",
        targetId: id,
        metadata: { from: u.role, to: parsed.data.role },
      });
      return { ok: true, role: parsed.data.role };
    },
  );

  app.delete("/users/:id",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"]), requirePermission("action.delete_records")] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      await db
        .update(schema.users)
        .set({
          email: `deleted-${id}@example.invalid`,
          name: "[deleted user]",
          passwordHash: "x",
          phoneE164: null,
          pushToken: null,
          deactivatedAt: new Date(),
          onDuty: false,
        })
        .where(and(eq(schema.users.id, id), eq(schema.users.organisationId, c.orgId)));
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "user.erased",
        targetType: "user",
        targetId: id,
      });
      return { ok: true };
    },
  );
}
