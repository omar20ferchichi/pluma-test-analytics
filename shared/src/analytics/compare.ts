import type { CompareDelta, ExecutionSummary, TestStatus } from "../types.js";

export interface ComparablePoint {
  id: string;
  status: TestStatus;
  durationMs: number;
}

export function compareExecutions(
  previousId: string,
  currentId: string,
  previousSummary: ExecutionSummary,
  currentSummary: ExecutionSummary,
  previousPoints: ComparablePoint[],
  currentPoints: ComparablePoint[],
): CompareDelta {
  const prevMap = new Map(previousPoints.map((point) => [point.id, point]));
  const currMap = new Map(currentPoints.map((point) => [point.id, point]));

  const newFailures: string[] = [];
  const fixedFailures: string[] = [];
  const stillFailing: string[] = [];
  const newTestPoints: string[] = [];
  const removedTestPoints: string[] = [];
  const statusChanges: CompareDelta["statusChanges"] = [];
  const performanceRegressions: CompareDelta["performanceRegressions"] = [];

  for (const [id, current] of currMap) {
    const previous = prevMap.get(id);
    if (!previous) {
      newTestPoints.push(id);
      if (current.status === "failed" || current.status === "timedOut") newFailures.push(id);
      continue;
    }
    if (previous.status !== current.status) {
      statusChanges.push({ testPointId: id, from: previous.status, to: current.status });
    }
    const prevFailed = previous.status === "failed" || previous.status === "timedOut";
    const currFailed = current.status === "failed" || current.status === "timedOut";
    if (!prevFailed && currFailed) newFailures.push(id);
    if (prevFailed && !currFailed) fixedFailures.push(id);
    if (prevFailed && currFailed) stillFailing.push(id);
    if (previous.durationMs > 0 && current.durationMs > previous.durationMs * 1.5 && current.durationMs - previous.durationMs >= 2000) {
      performanceRegressions.push({
        testPointId: id,
        previousMs: previous.durationMs,
        currentMs: current.durationMs,
        deltaPct: ((current.durationMs - previous.durationMs) / previous.durationMs) * 100,
      });
    }
  }

  for (const id of prevMap.keys()) {
    if (!currMap.has(id)) removedTestPoints.push(id);
  }

  return {
    previousId,
    currentId,
    previous: previousSummary,
    current: currentSummary,
    newFailures,
    fixedFailures,
    stillFailing,
    newTestPoints,
    removedTestPoints,
    statusChanges,
    performanceRegressions,
  };
}
