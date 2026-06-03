import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { validatePassword } from "../services/password-policy.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organisationName: z.string().optional(),
});

const registerSchema = z.object({
  organisationName: z.string().min(1).max(120),
  adminName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

// Tight per-IP rate-limit for credential endpoints. 10/min slows credential
// stuffing to a crawl without inconveniencing real users.
const authRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `auth:${req.ip}`,
    },
  },
};

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // --------- Sign in ---------
  app.post("/auth/login", authRateLimit, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.toLowerCase();

    // If multiple orgs share an email (shouldn't normally happen — email is
    // unique per-org), the optional `organisationName` disambiguates.
    let candidates = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));

    if (candidates.length === 0) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    if (parsed.data.organisationName) {
      const orgs = await db
        .select()
        .from(schema.organisations)
        .where(eq(schema.organisations.name, parsed.data.organisationName));
      const orgIds = new Set(orgs.map((o) => o.id));
      candidates = candidates.filter((c) => orgIds.has(c.organisationId));
    }

    let user = candidates[0];
    let okPassword = false;
    for (const c of candidates) {
      try {
        if (await argon2.verify(c.passwordHash, parsed.data.password)) {
          user = c;
          okPassword = true;
          break;
        }
      } catch { /* keep checking */ }
    }
    if (!user || !okPassword || user.deactivatedAt) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const [org] = await db
      .select()
      .from(schema.organisations)
      .where(eq(schema.organisations.id, user.organisationId))
      .limit(1);

    // If the user has 2FA enabled, the password was the first factor —
    // hand back a short-lived "challenge" token that /auth/login/2fa will
    // exchange for a real session once the 6-digit code is verified.
    if (user.totpSecret) {
      const challenge = app.jwt.sign(
        {
          sub: user.id,
          orgId: user.organisationId,
          role: user.role,
          name: user.name,
          chal: "totp",
        },
        { expiresIn: "5m" },
      );
      return reply.send({ challenge: "totp", challengeToken: challenge });
    }

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
        phoneE164: user.phoneE164,
        organisationId: user.organisationId,
        organisationName: org?.name ?? "",
      },
    });
  });

  // --------- Create new organisation ---------
  app.post("/auth/register-organisation", authRateLimit, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    }

    const pwCheck = validatePassword(parsed.data.password);
    if (!pwCheck.ok) return reply.code(400).send({ error: pwCheck.reason });

    const email = parsed.data.email.toLowerCase();
    const passwordHash = await argon2.hash(parsed.data.password);

    try {
      const result = await db.transaction(async (tx) => {
        const [org] = await tx
          .insert(schema.organisations)
          .values({ name: parsed.data.organisationName })
          .returning();

        const [admin] = await tx
          .insert(schema.users)
          .values({
            organisationId: org!.id,
            email,
            name: parsed.data.adminName,
            passwordHash,
            role: "admin",
          })
          .returning();

        await tx.insert(schema.auditLog).values({
          organisationId: org!.id,
          actorUserId: admin!.id,
          action: "organisation.created",
          targetType: "organisation",
          targetId: org!.id,
        });

        return { org: org!, admin: admin! };
      });

      const token = app.jwt.sign({
        sub: result.admin.id,
        orgId: result.org.id,
        role: result.admin.role,
        name: result.admin.name,
      });
      return reply.code(201).send({
        token,
        user: {
          id: result.admin.id,
          email: result.admin.email,
          name: result.admin.name,
          role: result.admin.role,
          onDuty: result.admin.onDuty,
          organisationId: result.org.id,
          organisationName: result.org.name,
        },
      });
    } catch (err: any) {
      if (String(err).includes("users_org_email_unique")) {
        return reply.code(409).send({ error: "email_taken_in_org" });
      }
      app.log.error(err, "register-organisation failed");
      return reply.code(500).send({ error: "registration_failed" });
    }
  });

  // --------- Toggle on / off duty ---------
  app.post("/auth/duty", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ onDuty: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    await db
      .update(schema.users)
      .set({ onDuty: body.data.onDuty })
      .where(and(eq(schema.users.id, c.sub), eq(schema.users.organisationId, c.orgId)));
    return reply.send({ onDuty: body.data.onDuty });
  });
}
