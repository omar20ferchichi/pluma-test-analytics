import type {
  NormalizedArtifact,
  NormalizedTestCase,
  NormalizedTestPoint,
  ValidationIssue,
} from "../types.js";
import { asArray, asRecord, deriveStatusFromOk, pickString, synthesizeTestPointId } from "../normalize.js";
import { buildError } from "../analytics/error.js";

function parseTestPoint(raw: unknown, parentTicket?: string): NormalizedTestPoint | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const description = pickString(rec, ["description", "name", "title", "desc"]) ?? "Untitled TestPoint";
  const id = synthesizeTestPointId(pickString(rec, ["id", "testPointId", "test_point_id", "tpId", "tp_id"]), description);
  const status = deriveStatusFromOk(undefined, rec.execution ?? rec.status ?? rec.result);
  const ticket = pickString(rec, ["ticket_id", "ticketId", "jira", "jiraId", "jira_id"]) ?? parentTicket;
  return {
    id,
    description,
    ticketId: ticket,
    status: status === "unknown" ? (pickString(rec, ["execution"]) === "passed" ? "passed" : status) : status,
    durationMs: typeof rec.duration === "number" ? rec.duration : typeof rec.durationMs === "number" ? rec.durationMs : 0,
    retries: typeof rec.retries === "number" ? rec.retries : 0,
    browser: pickString(rec, ["browser"]),
    environment: pickString(rec, ["environment", "env"]),
    startedAt: pickString(rec, ["startedAt", "started_at"]),
    error: buildError(pickString(rec, ["error", "errorMessage", "error_message"]), pickString(rec, ["stack", "stackTrace", "stack_trace"])),
    steps: [],
    artifacts: [],
    raw,
  };
}

export function isNativeTestCaseDocument(value: unknown): boolean {
  const rec = asRecord(value);
  if (!rec) return false;
  if (Array.isArray(rec.testpoints) || Array.isArray(rec.testPoints) || Array.isArray(rec.test_points)) return true;
  if (rec.id && rec.execution && rec.description && !rec.suites) return true;
  // test_entretien (Pluma) per-test-case report: { testCase, scenarioId?, result, testpoints }
  if (typeof rec.testCase === "string" && typeof rec.result === "string" && !rec.suites) return true;
  return false;
}

export function parseNativeTestCaseDocuments(documents: unknown[]): {
  testCases: NormalizedTestCase[];
  issues: ValidationIssue[];
} {
  const testCases: NormalizedTestCase[] = [];
  const issues: ValidationIssue[] = [];

  for (const doc of documents) {
    const rec = asRecord(doc);
    if (!rec) continue;
    // test_entretien framework self-tests (tests/framework/*) write fixture reports whose TestPoints
    // fail on purpose. The Playwright test is the real result, so skip the fixture document.
    if (/(^|\/)tests\/framework\//.test(pickString(rec, ["spec", "file"]) ?? "")) continue;
    const name = pickString(rec, ["testCase", "description", "name", "title"]) ?? pickString(rec, ["id", "scenarioId"]) ?? "Untitled TestCase";
    const id = pickString(rec, ["id", "scenarioId", "testCaseId", "test_case_id"]) ?? name;
    const ticket = pickString(rec, ["ticket_id", "ticketId", "jira"]);
    const points = asArray(rec.testpoints ?? rec.testPoints ?? rec.test_points)
      .map((point) => parseTestPoint(point, ticket))
      .filter((point): point is NormalizedTestPoint => Boolean(point));

    if (!points.length) {
      issues.push({
        severity: "warning",
        code: "TESTCASE_NO_POINTS",
        message: `TestCase ${id} has no TestPoints.`,
        path: id,
      });
    }

    for (let i = 1; i < points.length; i += 1) {
      const point = points[i]!;
      if (point.status === "failed" && !point.lastSuccessfulStep) {
        const prior = points.slice(0, i).reverse().find((item) => item.status === "passed");
        if (prior) point.lastSuccessfulStep = `${prior.id}: ${prior.description}`;
      }
      if (!point.browser) point.browser = pickString(rec, ["project", "browser"]);
    }

    const failed = points.some((point) => point.status === "failed");
    const status = failed ? "failed" : deriveStatusFromOk(undefined, rec.execution ?? rec.result ?? rec.status);
    const failedPoint = points.find((point) => point.status === "failed");

    const next = {
      id,
      name,
      ticketId: ticket,
      status,
      durationMs: points.reduce((sum, point) => sum + point.durationMs, 0),
      retries: typeof rec.retry === "number" ? rec.retry : 0,
      file: pickString(rec, ["spec", "file"]),
      startedAt: pickString(rec, ["startedAt", "started_at"]),
      error: failedPoint?.error,
      testPoints: points,
    };
    const existing = testCases.find((item) => item.id === id);
    if (existing) {
      if (next.testPoints.length > existing.testPoints.length) {
        existing.name = next.name;
        existing.ticketId = existing.ticketId ?? next.ticketId;
        existing.status = next.status;
        existing.durationMs = next.durationMs;
        existing.testPoints = next.testPoints;
      }
      continue;
    }
    testCases.push(next);
  }

  return { testCases, issues };
}

export function collectNativeArtifacts(
  files: Array<{ relativePath: string; size?: number }>,
): NormalizedArtifact[] {
  return files.map((file) => {
    const lower = file.relativePath.toLowerCase();
    let kind: NormalizedArtifact["kind"] = "other";
    if (lower.endsWith(".webm") || lower.endsWith(".mp4")) kind = "video";
    else if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) kind = "screenshot";
    else if (lower.endsWith(".log")) kind = "log";
    else if (lower.endsWith(".json")) kind = "json";
    else if (lower.includes("trace") && lower.endsWith(".zip")) kind = "trace";
    else if (lower.endsWith(".har")) kind = "har";
    else if (lower.endsWith(".html")) kind = "html-report";
    else if (lower.endsWith(".xml")) kind = "junit";
    return {
      kind,
      name: file.relativePath.split("/").pop() ?? file.relativePath,
      path: file.relativePath,
      size: file.size,
    };
  });
}
