import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const storageRoot = path.resolve(
  here,
  "../../",
  process.env.STORAGE_DIR ?? "../storage",
);

export function artifactDir(projectId: string, executionId: string): string {
  return path.join(storageRoot, "artifacts", projectId, executionId);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export function safeJoin(root: string, relative: string): string {
  const cleaned = relative.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(root, cleaned);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error("Path traversal rejected");
  }
  return resolved;
}

export async function writeStoredFile(root: string, relative: string, data: Buffer): Promise<string> {
  const target = safeJoin(root, relative);
  await ensureDir(path.dirname(target));
  await writeFile(target, data);
  return target;
}

export async function copyStoredFile(root: string, relative: string, source: string): Promise<string> {
  const target = safeJoin(root, relative);
  await ensureDir(path.dirname(target));
  if (path.resolve(source) !== target) await copyFile(source, target);
  return target;
}
