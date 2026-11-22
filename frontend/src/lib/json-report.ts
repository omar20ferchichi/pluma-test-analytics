export interface ReportStep {
  id: string;
  name: string;
  status: string;
  durationMs?: number;
  ticketId?: string;
  error?: string;
  stack?: string;
  category?: string;
  lastSuccessfulStep?: string;
  retries?: number;
  browser?: string;
  resultId?: string;
  videoArtifactId?: string | null;
  traceArtifactId?: string | null;
  raw?: unknown;
}

export interface ReportCase {
  id: string;
  name: string;
  status: string;
  durationMs?: number;
  ticketId?: string;
  error?: string;
  stack?: string;
  steps: ReportStep[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function statusOf(value: unknown): string {
  const rec = asRecord(value);
  const raw = rec?.execution ?? rec?.status ?? rec?.result ?? rec?.ok;
  if (raw === true || raw === "passed" || raw === "pass" || raw === "ok") return "passed";
  if (raw === false || raw === "failed" || raw === "fail" || raw === "timedOut") return raw === "timedOut" ? "timedOut" : "failed";
  if (typeof raw === "string" && raw) return raw;
  return "unknown";
}

function pickString(rec: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!rec) return undefined;
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string" && value && value !== "*****") return value;
  }
  return undefined;
}

function pickNumber(rec: Record<string, unknown> | null, keys: string[]): number | undefined {
  if (!rec) return undefined;
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stepFromPoint(raw: unknown, resultId?: string): ReportStep | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = pickString(rec, ["id", "externalId", "testPointId", "test_point_id"]) ?? pickString(rec, ["name", "title"]) ?? "step";
  const name = pickString(rec, ["description", "name", "title"]) ?? id;
  const errorObj = asRecord(rec.error);
  return {
    id,
    name,
    status: statusOf(rec),
    durationMs: pickNumber(rec, ["durationMs", "duration"]),
    ticketId: pickString(rec, ["ticket_id", "ticketId", "jira"]),
    error: pickString(rec, ["error", "errorMessage", "error_message", "message"]) ?? pickString(errorObj, ["message"]),
    stack: pickString(rec, ["stack", "stackTrace", "stack_trace"]) ?? pickString(errorObj, ["stack"]),
    category: pickString(rec, ["failureCategory", "category"]),
    lastSuccessfulStep: pickString(rec, ["lastSuccessfulStep"]),
    retries: pickNumber(rec, ["retries", "retry"]),
    browser: pickString(rec, ["browser"]),
    resultId,
    raw,
  };
}

function caseFromNative(raw: unknown): ReportCase | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const points = rec.testpoints ?? rec.testPoints ?? rec.test_points ?? rec.steps;
  const steps = asArray(points).map((item) => stepFromPoint(item)).filter((item): item is ReportStep => Boolean(item));
  const id = pickString(rec, ["id", "testCaseId", "test_case_id"]) ?? pickString(rec, ["name", "title", "description"]) ?? "case";
  const name = pickString(rec, ["description", "name", "title"]) ?? id;
  if (!steps.length && (rec.execution || rec.status || rec.description || rec.id)) {
    const step = stepFromPoint(rec);
    if (step) steps.push(step);
  }
  if (!steps.length && !name) return null;
  const failed = steps.some((step) => step.status === "failed" || step.status === "timedOut");
  return {
    id,
    name,
    status: failed ? "failed" : statusOf(rec),
    durationMs: pickNumber(rec, ["durationMs", "duration"]) ?? steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0),
    ticketId: pickString(rec, ["ticket_id", "ticketId", "jira"]),
    error: pickString(rec, ["error", "errorMessage", "message"]),
    stack: pickString(rec, ["stack", "stackTrace"]),
    steps,
  };
}

function flattenPlaywrightSuites(node: unknown, acc: unknown[] = []): unknown[] {
  const rec = asRecord(node);
  if (!rec) return acc;
  acc.push(rec);
  for (const child of asArray(rec.suites)) flattenPlaywrightSuites(child, acc);
  return acc;
}

function casesFromPlaywright(doc: unknown): ReportCase[] {
  const root = asRecord(doc);
  if (!root || !Array.isArray(root.suites)) return [];
  const cases: ReportCase[] = [];
  for (const suite of flattenPlaywrightSuites(root)) {
    const suiteRec = asRecord(suite);
    if (!suiteRec) continue;
    for (const spec of asArray(suiteRec.specs)) {
      const specRec = asRecord(spec);
      if (!specRec) continue;
      const title = pickString(specRec, ["title"]) ?? "Untitled spec";
      const tests = asArray(specRec.tests);
      const testRec = asRecord(tests[0]) ?? {};
      const results = asArray(testRec.results);
      const last = asRecord(results[results.length - 1]) ?? {};
      const ok = specRec.ok === true;
      const status = ok ? "passed" : statusOf(last) === "unknown" ? "failed" : statusOf(last);
      const errorObj = asRecord(last.error) ?? asRecord(asArray(last.errors)[0]);
      const native = caseFromNative(specRec);
      const steps = native?.steps?.length
        ? native.steps
        : [
            {
              id: title,
              name: title,
              status,
              durationMs: pickNumber(last, ["duration"]),
              error: pickString(errorObj, ["message"]),
              stack: pickString(errorObj, ["stack"]),
              raw: specRec,
            } satisfies ReportStep,
          ];
      cases.push({
        id: pickString(specRec, ["id"]) ?? title,
        name: title,
        status: steps.some((step) => step.status === "failed" || step.status === "timedOut") ? "failed" : status,
        durationMs: pickNumber(last, ["duration"]),
        error: pickString(errorObj, ["message"]),
        stack: pickString(errorObj, ["stack"]),
        steps,
      });
    }
  }
  return cases;
}

export function parseReportTree(value: unknown): ReportCase[] {
  const parsed = parseJsonValue(value);
  if (parsed == null || parsed === "") return [];
  const rec = asRecord(parsed);
  if (rec?.cases && Array.isArray(rec.cases)) {
    return rec.cases.map((item) => caseFromNative(item) ?? (item as ReportCase)).filter((item) => item?.id || item?.name);
  }
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => parseReportTree(item));
  }
  const fromPw = casesFromPlaywright(parsed);
  if (fromPw.length) return fromPw;
  const fromNative = caseFromNative(parsed);
  return fromNative ? [fromNative] : [];
}

export function isFailedStatus(status?: string): boolean {
  return status === "failed" || status === "timedOut" || status === "interrupted";
}

export function isPassedStatus(status?: string): boolean {
  return status === "passed";
}
