import type { ExecutionSummary, FailureCluster, NormalizedExecution, NormalizedTestPoint, TestStatus } from "../types.js";

export function flattenTestPoints(execution: NormalizedExecution): NormalizedTestPoint[] {
  return execution.testCases.flatMap((testCase) => testCase.testPoints);
}

export function rollupCaseStatus(statuses: TestStatus[]): TestStatus {
  if (!statuses.length) return "unknown";
  if (statuses.some((status) => status === "failed" || status === "timedOut")) return "failed";
  if (statuses.some((status) => status === "interrupted")) return "interrupted";
  if (statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "flaky") && statuses.every((status) => status === "passed" || status === "flaky")) {
    return "flaky";
  }
  if (statuses.every((status) => status === "passed" || status === "flaky")) return "passed";
  return statuses[0] ?? "unknown";
}

export function summarizeCaseTree(items: Array<{ status: string; durationMs: number }>): ExecutionSummary {
  const totalTests = items.length;
  const passed = items.filter((item) => item.status === "passed").length;
  const failed = items.filter((item) => item.status === "failed" || item.status === "timedOut").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const flaky = items.filter((item) => item.status === "flaky").length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  const totalDurationMs = items.reduce((sum, item) => sum + (item.durationMs || 0), 0);
  return {
    totalTests,
    passed,
    failed,
    skipped,
    flaky,
    blocked,
    passRate: totalTests ? (passed + flaky) / totalTests : 0,
    failureRate: totalTests ? failed / totalTests : 0,
    totalDurationMs,
    averageDurationMs: totalTests ? totalDurationMs / totalTests : 0,
  };
}

export function summarizeExecution(execution: NormalizedExecution): ExecutionSummary {
  return summarizeCaseTree(
    execution.testCases.map((testCase) => ({
      status: testCase.testPoints.length
        ? rollupCaseStatus(testCase.testPoints.map((point) => point.status))
        : testCase.status,
      durationMs: testCase.durationMs || testCase.testPoints.reduce((sum, point) => sum + (point.durationMs || 0), 0),
    })),
  );
}

export function clusterFailures(execution: NormalizedExecution): FailureCluster[] {
  const map = new Map<string, FailureCluster>();
  for (const testCase of execution.testCases) {
    for (const point of testCase.testPoints) {
      if (point.status !== "failed" && point.status !== "timedOut") continue;
      const fingerprint = point.error?.fingerprint ?? "unknown-error";
      const existing = map.get(fingerprint);
      if (existing) {
        existing.count += 1;
        existing.testPointIds.push(point.id);
        if (!existing.testCaseIds.includes(testCase.id)) existing.testCaseIds.push(testCase.id);
      } else {
        map.set(fingerprint, {
          fingerprint,
          category: point.error?.category ?? "Unknown",
          sampleMessage: point.error?.message ?? "Unknown error",
          count: 1,
          testPointIds: [point.id],
          testCaseIds: [testCase.id],
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
