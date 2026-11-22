import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { MultipartFile } from "@fastify/multipart";
import { maxUploadBytes, tooLargeMessage } from "./upload-limits.js";

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qa-upload-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function saveMultipartToFile(file: MultipartFile, dest: string): Promise<{ filename: string; mimetype: string; size: number }> {
  await pipeline(file.file, createWriteStream(dest));
  if (file.file.truncated) {
    throw Object.assign(new Error(tooLargeMessage()), { statusCode: 413, code: "FST_REQ_FILE_TOO_LARGE" });
  }
  const info = await stat(dest);
  if (info.size > maxUploadBytes()) {
    throw Object.assign(new Error(tooLargeMessage()), { statusCode: 413, code: "FST_REQ_FILE_TOO_LARGE" });
  }
  return {
    filename: file.filename || "upload.bin",
    mimetype: file.mimetype,
    size: info.size,
  };
}
