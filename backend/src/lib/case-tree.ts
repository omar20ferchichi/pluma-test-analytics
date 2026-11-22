type ResultLike = {
  id: string;
  status: string;
  description?: string | null;
  durationMs: number;
  startedAt?: Date | null;
  errorMessage?: string | null;
  stackTrace?: string | null;
  failureCategory?: string | null;
  lastSuccessfulStep?: string | null;
  retries?: number | null;
  browser?: string | null;
  testCaseId?: string | null;
  testPoint: {
    id: string;
    externalId: string;
    description: string;
    ticketId?: string | null;
    testCaseId?: string | null;
    testCase?: {
      id: string;
      externalId: string;
      name: string;
      ticketId?: string | null;
    } | null;
  };
  testCase?: {
    id: string;
    externalId: string;
    name: string;
    ticketId?: string | null;
  } | null;
  artifacts?: Array<{ id: string; kind: string; name: string }>;
  sortIndex?: number | null;
};

export interface CaseTreeStep {
  id: string;
  name: string;
  status: string;
  durationMs: number;
  ticketId?: string | null;
  error?: string | null;
  stack?: string | null;
  category?: string | null;
  lastSuccessfulStep?: string | null;
  retries?: number | null;
  browser?: string | null;
  resultId: string;
  videoArtifactId?: string | null;
  traceArtifactId?: string | null;
}

export interface CaseTreeCase {
  id: string;
  name: string;
  status: string;
  durationMs: number;
  ticketId?: string | null;
  steps: CaseTreeStep[];
}

export function groupResultsIntoTestCases(results: ResultLike[]): CaseTreeCase[] {
  const ordered = results.slice().sort((a, b) => {
    const byIndex = (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER);
    if (byIndex) return byIndex;
    return (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0);
  });
  const groups = new Map<string, { parent?: ResultLike["testCase"]; rows: ResultLike[] }>();
  for (const row of ordered) {
    // The result's own case wins: a reused TestPoint (setup/cleanup) belongs to many cases.
    const parent = row.testCase ?? row.testPoint.testCase ?? null;
    const key = parent?.id ?? parent?.externalId ?? `ungrouped:${row.testPoint.id}`;
    const group = groups.get(key) ?? { parent: parent ?? undefined, rows: [] };
    group.rows.push(row);
    if (!group.parent && parent) group.parent = parent;
    groups.set(key, group);
  }

  return [...groups.values()].map(({ parent, rows }) => {
    const first = rows[0]!;
    const steps: CaseTreeStep[] = [];
    for (const row of rows) {
      const artifacts = row.artifacts ?? [];
      steps.push({
        id: row.testPoint.externalId,
        name: row.description ?? row.testPoint.description,
        status: row.status,
        durationMs: row.durationMs,
        ticketId: row.testPoint.ticketId,
        error: row.errorMessage,
        stack: row.stackTrace,
        category: row.failureCategory,
        lastSuccessfulStep: row.lastSuccessfulStep,
        retries: row.retries,
        browser: row.browser,
        resultId: row.id,
        videoArtifactId: artifacts.find((item) => item.kind === "video")?.id ?? null,
        traceArtifactId: artifacts.find((item) => item.kind === "trace" || item.name.endsWith("trace.zip"))?.id ?? null,
      });
    }
    const failed = steps.some((step) => step.status === "failed" || step.status === "timedOut");
    const passed = steps.length > 0 && steps.every((step) => step.status === "passed" || step.status === "flaky");
    return {
      id: parent?.externalId ?? first.testPoint.externalId,
      name: parent?.name ?? first.testPoint.description,
      ticketId: parent?.ticketId ?? first.testPoint.ticketId,
      status: failed ? "failed" : passed ? "passed" : first.status,
      durationMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
      steps: shareCaseRecordings(steps),
    };
  });
}

/** Playwright records one video/trace per TestCase. Every TestPoint in that case can Watch it. */
function shareCaseRecordings(steps: CaseTreeStep[]): CaseTreeStep[] {
  const videoArtifactId = steps.find((step) => step.videoArtifactId)?.videoArtifactId ?? null;
  const traceArtifactId = steps.find((step) => step.traceArtifactId)?.traceArtifactId ?? null;
  if (!videoArtifactId && !traceArtifactId) return steps;
  return steps.map((step) => ({
    ...step,
    videoArtifactId: step.videoArtifactId ?? videoArtifactId,
    traceArtifactId: step.traceArtifactId ?? traceArtifactId,
  }));
}
