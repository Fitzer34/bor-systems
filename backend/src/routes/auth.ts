import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, schema } from "../db/client.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    if (!user || user.deactivatedAt) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const ok = await argon2.verify(user.passwordHash, parsed.data.password);
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });

    const token = app.jwt.sign({ sub: user.id, role: user.role, name: user.name });
    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, onDuty: user.onDuty },
    });
  });

  app.post("/auth/duty", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ onDuty: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const userId = (req.user as { sub: string }).sub;
    await db.update(schema.users).set({ onDuty: body.data.onDuty }).where(eq(schema.users.id, userId));
    return reply.send({ onDuty: body.data.onDuty });
  });
}
