import type { NormalizedLogLine, ValidationIssue } from "../types.js";
import { parseLogLevel } from "../normalize.js";

const LINE_RE =
  /^(?<ts>\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?)\s*(?:[-|]\s*|\[)(?<level>TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s*(?:\]\s*|[-|:]\s*)(?<message>[\s\S]+)$/i;
const TP_RUN_RE = /Running TestPoint\s+([A-Za-z0-9._-]+)\s*:\s*(.+)$/i;
const TP_FAIL_RE = /TestPoint\s+([A-Za-z0-9._-]+)\s+failed:\s*(.+)$/i;
const START_RE = /^---\s*Starting test:\s*(.+?)\s*---/;
/** test_entretien logger: `2026-11-22T20:22:55.663Z [INFO] Test case "Suite › Title" (tests/x.spec.ts)` */
const PLUMA_START_RE = /\[INFO\]\s*Test case "(?:.*›\s*)?(.+?)"/;

export function parseLogText(content: string, testCaseHint?: string): NormalizedLogLine[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const result: NormalizedLogLine[] = [];
  let currentTestCase = testCaseHint;
  let currentTestPoint: string | undefined;
  let pendingStack: string[] = [];
  let lastIndex = -1;

  const flushStack = () => {
    if (lastIndex >= 0 && pendingStack.length) {
      result[lastIndex]!.stackTrace = pendingStack.join("\n");
      pendingStack = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (!raw.trim()) continue;

    const start = raw.match(START_RE);
    if (start) {
      flushStack();
      currentTestCase = start[1]?.trim();
      currentTestPoint = undefined;
      result.push({
        timestamp: undefined,
        level: "INFO",
        message: raw.trim(),
        testCaseId: currentTestCase,
        raw,
        lineNumber: i + 1,
      });
      lastIndex = result.length - 1;
      continue;
    }

    const isStack =
      /^\s+at\s+/.test(raw) ||
      /^\s+\^/.test(raw) ||
      /^\s+\|/.test(raw) ||
      /^\s+\d+\s+\|/.test(raw);

    if (isStack && lastIndex >= 0) {
      pendingStack.push(raw);
      continue;
    }

    flushStack();
    const plumaStart = raw.match(PLUMA_START_RE);
    if (plumaStart) {
      currentTestCase = plumaStart[1]?.trim();
      currentTestPoint = undefined;
    }
    const match = raw.match(LINE_RE);
    let timestamp: string | undefined;
    let level = parseLogLevel("UNKNOWN");
    let message = raw.trim();

    if (match?.groups) {
      timestamp = match.groups.ts;
      level = parseLogLevel(match.groups.level ?? "UNKNOWN");
      message = (match.groups.message ?? "").trim();
    }

    const run = message.match(TP_RUN_RE);
    const fail = message.match(TP_FAIL_RE);
    if (run) {
      currentTestPoint = run[1] === "TP" ? undefined : run[1];
      if (run[1] === "TP") {
        currentTestPoint = `TP-${run[2]?.trim()}`;
      }
    }
    if (fail) {
      currentTestPoint = fail[1] === "TP" ? currentTestPoint : fail[1];
    }

    result.push({
      timestamp,
      level,
      message,
      testPointId: currentTestPoint,
      testCaseId: currentTestCase,
      raw,
      lineNumber: i + 1,
    });
    lastIndex = result.length - 1;
  }

  flushStack();
  return result;
}

export function logValidation(lines: NormalizedLogLine[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!lines.length) {
    issues.push({
      severity: "warning",
      code: "LOG_EMPTY",
      message: "No log lines were parsed from the execution package.",
    });
  }
  const withoutTs = lines.filter((line) => !line.timestamp).length;
  if (withoutTs && withoutTs === lines.length) {
    issues.push({
      severity: "info",
      code: "LOG_NO_TIMESTAMPS",
      message: "Log lines did not include timestamps in the expected ISO-8601 format.",
    });
  }
  return issues;
}
