import type { FailureCategory } from "../types.js";
import { categorizeFailure, fingerprintError, firstLine, stripAnsi } from "../normalize.js";
import type { NormalizedError } from "../types.js";

export function buildError(message?: string, stack?: string, location?: NormalizedError["location"]): NormalizedError | undefined {
  if (!message && !stack) return undefined;
  const raw = stripAnsi(message || stack || "Unknown error");
  return {
    message: firstLine(raw) || raw.slice(0, 400),
    stack: stack ? stripAnsi(stack) : undefined,
    category: categorizeFailure(raw, stack) as FailureCategory,
    fingerprint: fingerprintError(raw),
    location,
  };
}
