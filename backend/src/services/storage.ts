/**
 * File storage abstraction.
 *
 * If R2_* env vars are configured, uploads go to Cloudflare R2 (persistent
 * across deploys/restarts) and `floor_plan_url` stores the full public URL.
 * Otherwise (local dev), uploads write to ./uploads/floorplans/ on disk and
 * `floor_plan_url` is a relative path.
 */

import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const LOCAL_UPLOAD_DIR = join(process.cwd(), "uploads", "floorplans");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

export const usingR2 =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_BUCKET && !!R2_PUBLIC_URL;

let r2: S3Client | null = null;
function getR2(): S3Client {
  if (!r2) {
    r2 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2;
}

export interface UploadInput {
  filename: string;
  mimetype: string;
  body: Buffer;
}

export interface UploadResult {
  /** Value to store in DB. Full public URL when using R2, relative "/uploads/..." path when on local disk. */
  url: string;
}

export async function uploadFloorPlan(input: UploadInput): Promise<UploadResult> {
  return uploadInternal(input, "floorplans");
}

/**
 * Proof-of-resolution photos uploaded by cleaners when closing alerts.
 * Same storage backend as floor plans; separate prefix so admin URLs
 * stay readable in the admin dashboard.
 */
export async function uploadClosePhoto(input: UploadInput): Promise<UploadResult> {
  return uploadInternal(input, "close-photos");
}

async function uploadInternal(input: UploadInput, prefix: string): Promise<UploadResult> {
  const ext = extname(input.filename) || (input.mimetype === "image/png" ? ".png" : ".jpg");
  const key = `${prefix}/${randomUUID()}${ext}`;

  if (usingR2) {
    await getR2().send(new PutObjectCommand({
      Bucket: R2_BUCKET!,
      Key: key,
      Body: input.body,
      ContentType: input.mimetype,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return { url: `${R2_PUBLIC_URL}/${key}` };
  }

  const localDir = join(process.cwd(), "uploads", prefix);
  await fs.mkdir(localDir, { recursive: true });
  const filename = key.slice(prefix.length + 1);
  await fs.writeFile(join(localDir, filename), input.body);
  return { url: `/uploads/${prefix}/${filename}` };
}
