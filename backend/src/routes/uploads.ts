import type { FastifyInstance } from "fastify";
import { uploadPhoto } from "../services/storage.js";

/**
 * Generic evidence-photo upload. Any signed-in worker uploads an image and gets
 * back its URL to attach to an inspection item, incident, or job completion.
 * Storage persists to Cloudflare R2 when configured (else local disk in dev).
 */
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export default async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/uploads/photo", { preHandler: [app.authenticate] }, async (req, reply) => {
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (file.mimetype && !OK_TYPES.includes(file.mimetype)) {
      return reply.code(415).send({ error: "must_be_image" });
    }
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      // @fastify/multipart throws when the 8 MB limit is exceeded.
      return reply.code(413).send({ error: "too_large" });
    }
    const { url } = await uploadPhoto({
      filename: file.filename || "photo.jpg",
      mimetype: file.mimetype || "image/jpeg",
      body: buf,
    });
    return { url };
  });
}
