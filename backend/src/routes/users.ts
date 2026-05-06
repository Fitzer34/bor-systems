import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, schema } from "../db/client.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users/me", { preHandler: [app.authenticate] }, async (req) => {
    const userId = (req.user as { sub: string }).sub;
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u) return null;
    return { id: u.id, email: u.email, name: u.name, role: u.role, onDuty: u.onDuty, locale: u.locale };
  });

  app.post("/users/me/push-token", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ pushToken: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const userId = (req.user as { sub: string }).sub;
    await db.update(schema.users).set({ pushToken: body.data.pushToken }).where(eq(schema.users.id, userId));
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
    const userId = (req.user as { sub: string }).sub;
    await db.update(schema.users).set(body.data).where(eq(schema.users.id, userId));
    await db.insert(schema.auditLog).values({
      actorUserId: userId,
      action: "user.profile_updated",
      targetType: "user",
      targetId: userId,
      metadata: body.data,
    });
    return { ok: true };
  });

  app.post("/users/me/password", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const userId = (req.user as { sub: string }).sub;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) return reply.code(404).send({ error: "not_found" });
    const ok = await argon2.verify(user.passwordHash, body.data.currentPassword);
    if (!ok) return reply.code(401).send({ error: "wrong_current_password" });
    const newHash = await argon2.hash(body.data.newPassword);
    await db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, userId));
    await db.insert(schema.auditLog).values({
      actorUserId: userId,
      action: "user.password_changed",
      targetType: "user",
      targetId: userId,
    });
    return { ok: true };
  });

  app.get("/users", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async () => {
    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        onDuty: schema.users.onDuty,
        deactivatedAt: schema.users.deactivatedAt,
      })
      .from(schema.users);
    return { users: rows };
  });

  app.post("/users", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        password: z.string().min(8),
        role: z.enum(["admin", "supervisor", "cleaner"]),
        phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
        locale: z.string().default("en-GB"),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input", details: body.error.flatten() });

    const passwordHash = await argon2.hash(body.data.password);
    const createdBy = (req.user as { sub: string }).sub;
    try {
      const [created] = await db
        .insert(schema.users)
        .values({
          email: body.data.email.toLowerCase(),
          name: body.data.name,
          passwordHash,
          role: body.data.role,
          phoneE164: body.data.phoneE164,
          locale: body.data.locale,
          createdBy,
        })
        .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role });
      return { user: created };
    } catch (err: any) {
      if (String(err).includes("users_email_unique")) return reply.code(409).send({ error: "email_taken" });
      throw err;
    }
  });

  app.post("/users/:id/deactivate", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req) => {
    const { id } = req.params as { id: string };
    await db.update(schema.users).set({ deactivatedAt: new Date(), onDuty: false }).where(eq(schema.users.id, id));
    return { ok: true };
  });

  app.delete("/users/:id", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req) => {
    const { id } = req.params as { id: string };
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
      .where(eq(schema.users.id, id));
    return { ok: true };
  });
}
