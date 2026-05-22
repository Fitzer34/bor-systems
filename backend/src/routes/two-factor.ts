import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  qrDataUrl,
  verifyTotp,
} from "../services/totp.js";

const authRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `2fa:${req.ip}`,
    },
  },
};

export default async function twoFactorRoutes(app: FastifyInstance): Promise<void> {
  // --------- Start enrolment ---------
  app.post("/auth/2fa/enrol", { preHandler: [app.authenticate] }, async (req, reply) => {
    const c = ctx(req);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!user) return reply.code(404).send({ error: "not_found" });
    if (user.totpSecret) return reply.code(400).send({ error: "already_enrolled" });

    const secret = generateTotpSecret();
    await db
      .update(schema.users)
      .set({ totpPendingSecret: secret })
      .where(eq(schema.users.id, c.sub));

    const url = otpauthUrl({ secret, email: user.email, issuer: "Zero Slip Systems" });
    const qr = await qrDataUrl(url);
    return { secret, otpauth: url, qrDataUrl: qr };
  });

  // --------- Confirm enrolment ---------
  app.post("/auth/2fa/enrol/confirm", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!user || !user.totpPendingSecret) return reply.code(400).send({ error: "no_pending_enrolment" });

    if (!verifyTotp(body.data.code, user.totpPendingSecret)) {
      return reply.code(401).send({ error: "wrong_code" });
    }

    const plain = generateRecoveryCodes();
    const hashed = await Promise.all(plain.map((code) => argon2.hash(code)));

    await db
      .update(schema.users)
      .set({
        totpSecret: user.totpPendingSecret,
        totpPendingSecret: null,
        totpEnrolledAt: new Date(),
        recoveryCodes: hashed,
      })
      .where(eq(schema.users.id, c.sub));

    await db.insert(schema.auditLog).values({
      organisationId: c.orgId,
      actorUserId: c.sub,
      action: "user.2fa_enrolled",
      targetType: "user",
      targetId: c.sub,
    });

    // Return the plain recovery codes ONCE. The UI must tell the user to save them.
    return { ok: true, recoveryCodes: plain };
  });

  // --------- Disable 2FA ---------
  app.post("/auth/2fa/disable", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({
      code: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });

    const c = ctx(req);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!user?.totpSecret) return reply.code(400).send({ error: "not_enrolled" });

    const codeOk = verifyTotp(body.data.code, user.totpSecret);
    let recoveryOk = false;
    if (!codeOk && Array.isArray(user.recoveryCodes)) {
      for (const hashed of user.recoveryCodes as string[]) {
        try {
          if (await argon2.verify(hashed, body.data.code)) {
            recoveryOk = true;
            break;
          }
        } catch { /* malformed hash — skip */ }
      }
    }
    if (!codeOk && !recoveryOk) return reply.code(401).send({ error: "wrong_code" });

    await db
      .update(schema.users)
      .set({
        totpSecret: null,
        totpPendingSecret: null,
        totpEnrolledAt: null,
        recoveryCodes: null,
      })
      .where(eq(schema.users.id, c.sub));

    await db.insert(schema.auditLog).values({
      organisationId: c.orgId,
      actorUserId: c.sub,
      action: "user.2fa_disabled",
      targetType: "user",
      targetId: c.sub,
    });

    return { ok: true };
  });

  // --------- Status (for settings page) ---------
  app.get("/auth/2fa/status", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const [user] = await db
      .select({
        totpSecret: schema.users.totpSecret,
        totpEnrolledAt: schema.users.totpEnrolledAt,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    return {
      enrolled: Boolean(user?.totpSecret),
      enrolledAt: user?.totpEnrolledAt ?? null,
      required: user?.role === "admin", // policy: admins should enable 2FA
    };
  });

  // --------- Second step at sign-in time ---------
  // The client receives a short-lived "challenge" JWT from /auth/login if the
  // user has 2FA enrolled. It then POSTs that JWT here with the 6-digit code
  // (or a recovery code) to exchange it for a real session token.
  app.post("/auth/login/2fa", authRateLimit, async (req, reply) => {
    const body = z.object({
      challengeToken: z.string().min(1),
      code: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });

    let payload: { sub: string; orgId: string; role: string; chal: string; name?: string };
    try {
      payload = app.jwt.verify(body.data.challengeToken);
    } catch {
      return reply.code(401).send({ error: "invalid_challenge" });
    }
    if (payload.chal !== "totp") return reply.code(401).send({ error: "invalid_challenge" });

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, payload.sub), eq(schema.users.organisationId, payload.orgId)))
      .limit(1);
    if (!user?.totpSecret || user.deactivatedAt) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const codeOk = verifyTotp(body.data.code, user.totpSecret);

    // Allow recovery codes — but burn them after use (single-use semantics).
    let recoveryIdx = -1;
    if (!codeOk && Array.isArray(user.recoveryCodes)) {
      const hashes = user.recoveryCodes as string[];
      for (let i = 0; i < hashes.length; i++) {
        try {
          if (await argon2.verify(hashes[i]!, body.data.code)) {
            recoveryIdx = i;
            break;
          }
        } catch { /* malformed hash */ }
      }
    }
    if (!codeOk && recoveryIdx < 0) return reply.code(401).send({ error: "wrong_code" });

    if (recoveryIdx >= 0) {
      const remaining = (user.recoveryCodes as string[]).filter((_, i) => i !== recoveryIdx);
      await db
        .update(schema.users)
        .set({ recoveryCodes: remaining })
        .where(eq(schema.users.id, user.id));
      await db.insert(schema.auditLog).values({
        organisationId: user.organisationId,
        actorUserId: user.id,
        action: "user.2fa_recovery_used",
        targetType: "user",
        targetId: user.id,
        metadata: { remaining: remaining.length },
      });
    }

    const [org] = await db
      .select()
      .from(schema.organisations)
      .where(eq(schema.organisations.id, user.organisationId))
      .limit(1);

    const token = app.jwt.sign({
      sub: user.id,
      orgId: user.organisationId,
      role: user.role,
      name: user.name,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        onDuty: user.onDuty,
        organisationId: user.organisationId,
        organisationName: org?.name ?? "",
      },
    });
  });
}
