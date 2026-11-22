import type { FailureCategory, LogLevel, TestStatus } from "./types.js";

const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "item";
}

export function synthesizeTestPointId(id: string | undefined, description: string): string {
  const trimmed = (id ?? "").trim();
  if (trimmed && !["TP", "tp", "TESTPOINT", "testpoint"].includes(trimmed)) {
    return trimmed;
  }
  return `TP-${slugify(description).toUpperCase()}`;
}

export function normalizeStatus(value: unknown): TestStatus {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "ok" || raw === "pass" || raw === "passed" || raw === "success") return "passed";
  if (raw === "fail" || raw === "failed" || raw === "unexpected" || raw === "error") return "failed";
  if (raw === "skip" || raw === "skipped" || raw === "ignored") return "skipped";
  if (raw === "not-run" || raw === "not_run" || raw === "notrun" || raw === "not run") return "skipped";
  if (raw === "flaky" || raw === "flakey") return "flaky";
  if (raw === "blocked") return "blocked";
  if (raw === "timedout" || raw === "timed_out" || raw === "timeout") return "timedOut";
  if (raw === "interrupted") return "interrupted";
  return "unknown";
}

export function deriveStatusFromOk(ok: boolean | undefined, status?: unknown): TestStatus {
  if (status !== undefined && status !== null && String(status).length > 0) {
    const normalized = normalizeStatus(status);
    if (normalized !== "unknown") return normalized;
  }
  if (ok === true) return "passed";
  if (ok === false) return "failed";
  return "unknown";
}

export function parseLogLevel(value: string): LogLevel {
  const raw = value.toUpperCase();
  if (raw === "TRACE" || raw === "DEBUG" || raw === "INFO" || raw === "WARN" || raw === "WARNING" || raw === "ERROR") {
    return raw === "WARNING" ? "WARN" : (raw as LogLevel);
  }
  return "UNKNOWN";
}

export function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() && value.trim() !== "*****") {
      return value.trim();
    }
  }
  return undefined;
}

export function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ULID_RE = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g;
const ISO_RE = /\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g;
const PATH_RE = /(?:[A-Za-z]:)?(?:\/[\w.-]+)+\.\w+/g;
const HEX_ID_RE = /\b[0-9a-f]{16,}\b/gi;
const NUMBER_RE = /\b\d{2,}\b/g;

export function fingerprintError(message: string): string {
  const cleaned = stripAnsi(message)
    .split("\n")[0]
    .replace(UUID_RE, "<id>")
    .replace(ULID_RE, "<id>")
    .replace(ISO_RE, "<ts>")
    .replace(PATH_RE, "<path>")
    .replace(HEX_ID_RE, "<id>")
    .replace(NUMBER_RE, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 240);
  return cleaned || "unknown-error";
}

export function categorizeFailure(message: string, stack?: string): FailureCategory {
  const text = `${stripAnsi(message)}\n${stack ?? ""}`.toLowerCase();

  if (
    /timeout|timed out|waiting for|test timeout|locator\.waitfor|exceeded/.test(text) &&
    !/expect\(/.test(text.split("\n")[0] ?? "")
  ) {
    if (/timeout|timed out|waiting for/.test(text)) return "Timeout";
  }
  if (/timeout|timed out|waiting for/.test(text)) return "Timeout";
  if (
    /locator|element not found|dropdown option|option '.+' not found|strict mode violation|not visible|no node found|waiting for locator|selector/.test(
      text,
    )
  ) {
    return "Element Not Found";
  }
  if (/unauthorized|401|403|login failed|authentication|invalid credentials/.test(text)) {
    return "Authentication";
  }
  if (/econnrefused|enetunreach|network|net::err_|fetch failed|socket hang up/.test(text)) {
    return "Network Error";
  }
  if (/\b50[0-9]\b|status code 5|expected 200|received 50/.test(text)) {
    return "API Failure";
  }
  if (/table is empty|no data|sql|database|prisma|constraint|foreign key/.test(text)) {
    return "Database/Data Issue";
  }
  if (/navigation|goto|err_name_not_resolved|net::err_aborted|page crashed/.test(text)) {
    return "Navigation Failure";
  }
  if (/environment|staging|502|service unavailable|econnreset/.test(text)) {
    return "Environment Issue";
  }
  if (/expect|assert|tobe|toequal|tohavetext|tobevisible|tohaveurl|received|expected/.test(text)) {
    return "Assertion Failure";
  }
  return "Unknown";
}

export function firstLine(text: string): string {
  return stripAnsi(text).split("\n").find((line) => line.trim())?.trim() ?? "";
}
