import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import {
  PERMISSION_KEYS,
  ALL_PERMISSION_KEYS,
  getAllPermissions,
  setPermissions,
  requireRole,
} from "../services/permissions.js";

/**
 * Staff-permissions admin API.
 *
 *   GET  /permissions          → effective per-role maps + the key catalogue
 *   PUT  /permissions/:role    → replace a role's override map
 *
 * Admin-only — this governs what every other role can see/do. The maps returned
 * are the EFFECTIVE permissions (defaults merged with any stored override), so
 * the UI can render a ready-to-edit matrix.
 */
export default async function permissionsRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = requireRole(["admin"]);

  app.get("/permissions", { preHandler: [app.authenticate, adminOnly] }, async (req) => {
    const c = ctx(req);
    const roles = await getAllPermissions(c.orgId);
    return { roles, catalogue: PERMISSION_KEYS };
  });

  const putBody = z.object({ permissions: z.record(z.string(), z.boolean()) });

  app.put("/permissions/:role", { preHandler: [app.authenticate, adminOnly] }, async (req, reply) => {
    const { role } = req.params as { role: string };
    if (!schema.userRole.enumValues.includes(role as any)) {
      return reply.code(400).send({ error: "invalid_role" });
    }
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    // Reject any key that isn't in the catalogue so typos can't silently no-op.
    const unknown = Object.keys(parsed.data.permissions).filter((k) => !ALL_PERMISSION_KEYS.includes(k));
    if (unknown.length) return reply.code(400).send({ error: "unknown_permission_keys", keys: unknown });

    const c = ctx(req);
    const effective = await setPermissions(c.orgId, role as typeof schema.userRole.enumValues[number], parsed.data.permissions);
    await db.insert(schema.auditLog).values({
      organisationId: c.orgId,
      actorUserId: c.sub,
      action: "permissions.updated",
      targetType: "role",
      targetId: role,
      metadata: { permissions: parsed.data.permissions },
    });
    return { role, permissions: effective };
  });
}
