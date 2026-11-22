import type {
  NormalizedArtifact,
  NormalizedStep,
  NormalizedTestCase,
  NormalizedTestPoint,
  ValidationIssue,
} from "../types.js";
import {
  asArray,
  asRecord,
  deriveStatusFromOk,
  pickNumber,
  pickString,
  stripAnsi,
  synthesizeTestPointId,
} from "../normalize.js";
import { buildError } from "../analytics/error.js";

const TP_RUN_RE = /Running TestPoint\s+([A-Za-z0-9._-]+)\s*:\s*(.+)$/i;

interface PlaywrightResult {
  status?: string;
  duration?: number;
  retry?: number;
  startTime?: string;
  error?: { message?: string; stack?: string; location?: { file?: string; line?: number; column?: number } };
  errors?: Array<{ message?: string; stack?: string }>;
  stdout?: Array<{ text?: string }>;
  attachments?: Array<{ name?: string; contentType?: string; path?: string }>;
}

function flattenSuites(node: unknown, acc: unknown[] = []): unknown[] {
  const rec = asRecord(node);
  if (!rec) return acc;
  acc.push(rec);
  for (const child of asArray(rec.suites)) flattenSuites(child, acc);
  return acc;
}

function stdoutText(result: PlaywrightResult): string {
  return (result.stdout ?? []).map((chunk) => chunk.text ?? "").join("");
}

function extractPointsFromStdout(
  result: PlaywrightResult,
  fallbackStatus: NormalizedTestPoint["status"],
  browser?: string,
): NormalizedTestPoint[] {
  const lines = stdoutText(result).split("\n");
  const points: NormalizedTestPoint[] = [];
  for (const line of lines) {
    const cleaned = stripAnsi(line).replace(/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?\s*-\s*(INFO|ERROR|WARN)\s*-\s*/i, "");
    const match = cleaned.match(TP_RUN_RE);
    if (!match) continue;
    const description = match[2]?.trim() ?? "TestPoint";
    const id = synthesizeTestPointId(match[1], description);
    points.push({
      id,
      description,
      status: fallbackStatus,
      durationMs: 0,
      retries: result.retry ?? 0,
      startedAt: result.startTime,
      browser,
      steps: [],
      artifacts: [],
      raw: { source: "playwright-stdout", line: cleaned },
    });
  }
  return points;
}

function attachmentsOf(result: PlaywrightResult, testCaseId: string): NormalizedArtifact[] {
  return (result.attachments ?? [])
    .filter((item) => item.path)
    .map((item) => {
      const contentType = item.contentType ?? "";
      const name = item.name ?? item.path!.split("/").pop() ?? "artifact";
      let kind: NormalizedArtifact["kind"] = "other";
      if (contentType.startsWith("video/") || name.endsWith(".webm") || name.endsWith(".mp4")) kind = "video";
      else if (contentType.startsWith("image/") || name.includes("screenshot")) kind = "screenshot";
      else if (name.includes("trace") || contentType.includes("zip")) kind = "trace";
      else if (name.endsWith(".har")) kind = "har";
      return {
        kind,
        name,
        path: item.path as string,
        contentType,
        testCaseId,
      };
    });
}

export function isPlaywrightJson(value: unknown): boolean {
  const rec = asRecord(value);
  if (!rec) return false;
  return Array.isArray(rec.suites) && Boolean(rec.config || rec.errors || rec.stats);
}

export function parsePlaywrightJson(doc: unknown): {
  testCases: NormalizedTestCase[];
  artifacts: NormalizedArtifact[];
  issues: ValidationIssue[];
  metadata: {
    browser?: string;
    playwrightVersion?: string;
    workers?: number;
    startedAt?: string;
    durationMs?: number;
  };
} {
  const root = asRecord(doc) ?? {};
  const config = asRecord(root.config) ?? {};
  const projects = asArray(config.projects);
  const firstProject = asRecord(projects[0]) ?? {};
  const browser = pickString(firstProject, ["name", "id"]) ?? "chromium";
  const issues: ValidationIssue[] = [];
  const testCases: NormalizedTestCase[] = [];
  const artifacts: NormalizedArtifact[] = [];

  const suites = flattenSuites(root);
  for (const suite of suites) {
    const suiteRec = asRecord(suite);
    if (!suiteRec) continue;
    for (const spec of asArray(suiteRec.specs)) {
      const specRec = asRecord(spec);
      if (!specRec) continue;
      const title = pickString(specRec, ["title"]) ?? "Untitled spec";
      const file = pickString(specRec, ["file"]);
      const tests = asArray(specRec.tests);
      const testRec = asRecord(tests[0]) ?? {};
      const results = asArray(testRec.results) as PlaywrightResult[];
      const last = results[results.length - 1] ?? {};
      const retries = Math.max(0, results.length - 1);
      const status = deriveStatusFromOk(specRec.ok as boolean | undefined, last.status ?? testRec.status);
      const duration = pickNumber(last as unknown as Record<string, unknown>, ["duration"]) ?? 0;
      const err = last.error ?? last.errors?.[0];
      const error = buildError(err?.message, err?.stack ?? last.error?.stack, last.error?.location);
      const caseId = pickString(specRec, ["id"]) ?? `${file ?? "spec"}::${title}`;
      const caseArtifacts = attachmentsOf(last, caseId);

      let points = extractPointsFromStdout(last, status === "failed" ? "passed" : status, browser);
      if (!points.length) {
        const titleIsPoint = /^(TP[-_]?\d+|[A-Z0-9]+-TP|TP-[A-Z0-9._-]+)/i.test(title);
        const id = titleIsPoint ? title.split(/\s+/)[0]! : synthesizeTestPointId(undefined, title);
        points = [
          {
            id,
            description: titleIsPoint ? title.slice(id.length).trim() || title : title,
            status,
            durationMs: duration,
            retries,
            startedAt: last.startTime,
            browser,
            error: status === "failed" ? error : undefined,
            steps: [],
            artifacts: caseArtifacts.map((item) => ({ ...item, testPointId: id })),
            raw: specRec,
          },
        ];
      } else if (status === "failed") {
        const stdout = stdoutText(last);
        const failMatch = stdout.match(/TestPoint\s+([A-Za-z0-9._-]+)\s+failed/i);
        let failedPoint = points[points.length - 1];
        if (failMatch?.[1] && failMatch[1] !== "TP") {
          failedPoint = points.find((point) => point.id === failMatch[1]) ?? failedPoint;
        }
        if (failedPoint) {
          for (const point of points) {
            if (point !== failedPoint && point.status === "failed") point.status = "passed";
          }
          failedPoint.status = "failed";
          failedPoint.error = error;
          const lastSuccess = points.filter((point) => point !== failedPoint && point.status === "passed").at(-1);
          failedPoint.lastSuccessfulStep = lastSuccess?.description;
        }
      }

      if (points.length && duration) {
        const share = Math.round(duration / points.length);
        for (const point of points) {
          if (!point.durationMs) point.durationMs = share;
        }
      }

      const owner = points.find((point) => point.status === "failed" || point.status === "timedOut") ?? points[points.length - 1];
      const recordings = caseArtifacts.filter((item) => item.kind === "video" || item.kind === "trace");
      const otherAttachments = caseArtifacts.filter((item) => item.kind !== "video" && item.kind !== "trace");
      artifacts.push(...caseArtifacts.map((item) => ({ ...item, testPointId: owner?.id, testCaseId: caseId })));
      if (owner) {
        for (const item of otherAttachments) {
          const stamped = { ...item, testPointId: owner.id, testCaseId: caseId };
          if (!owner.artifacts.some((existing) => existing.path === stamped.path)) owner.artifacts.push(stamped);
        }
      }
      for (const point of points) {
        for (const item of recordings) {
          const stamped = { ...item, testPointId: point.id, testCaseId: caseId };
          if (!point.artifacts.some((existing) => existing.path === stamped.path)) point.artifacts.push(stamped);
        }
      }

      const steps: NormalizedStep[] = points.map((point) => ({
        name: `${point.id}: ${point.description}`,
        status: point.status,
        startedAt: point.startedAt,
        durationMs: point.durationMs,
      }));
      for (const point of points) point.steps = steps;

      const flaky = retries > 0 && status === "passed";
      testCases.push({
        id: caseId,
        name: title,
        file,
        status: flaky ? "flaky" : status,
        durationMs: duration,
        startedAt: last.startTime,
        retries,
        testPoints: points,
        error: status === "failed" ? error : undefined,
      });
    }
  }

  if (!testCases.length) {
    issues.push({
      severity: "error",
      code: "PLAYWRIGHT_EMPTY",
      message: "Playwright JSON contained no specs/tests.",
    });
  }

  return {
    testCases,
    artifacts,
    issues,
    metadata: {
      browser,
      playwrightVersion: pickString(config, ["version"]),
      workers: pickNumber(config, ["workers"]),
    },
  };
}
