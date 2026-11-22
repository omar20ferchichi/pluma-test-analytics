import { randomBytes, randomUUID } from "node:crypto";

export function id(prefix?: string): string {
  const value = randomUUID().replace(/-/g, "");
  return prefix ? `${prefix}_${value.slice(0, 16)}` : value;
}

export function token(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}
