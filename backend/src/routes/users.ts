import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { validatePassword } from "../services/password-policy.js";
import { sendStaffInvite } from "../services/invites.js";

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
    return {
      id: u.id, email: u.email, name: u.name, role: u.role, onDuty: u.onDuty, locale: u.locale,
      phoneE164: u.phoneE164,
      organisationId: u.organisationId,
      organisationName: org?.name ?? "",
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
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    await db
      .update(schema.users)
      .set(body.data)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)));
    await db.insert(schema.auditLog).values({
      organisationId: c.orgId,
      actorUserId: c.sub,
      action: "user.profile_updated",
      targetType: "user",
      targetId: c.sub,
      metadata: body.data,
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
    return { users: rows };
  });

  app.post("/users", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
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
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
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

  app.delete("/users/:id",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
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
