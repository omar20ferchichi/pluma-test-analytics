import { computeQualityScore, matchCaseFromArtifactPath, summarizeCaseTree, uniqueRecordingName } from "@qa/shared";
import { prisma } from "./prisma.js";
import { groupResultsIntoTestCases, type CaseTreeCase } from "./case-tree.js";

const resultInclude = {
  testPoint: { include: { testCase: true } },
  testCase: true,
} as const;

function alreadyCaseLevel(
  execution: { totalTests: number; passed: number; failed: number; skipped: number; flaky: number; blocked: number; passRate: number },
  summary: ReturnType<typeof summarizeCaseTree>,
) {
  return (
    execution.totalTests === summary.totalTests &&
    execution.passed === summary.passed &&
    execution.failed === summary.failed &&
    execution.skipped === summary.skipped &&
    execution.flaky === summary.flaky &&
    execution.blocked === summary.blocked &&
    Math.abs(execution.passRate - summary.passRate) < 1e-9
  );
}

export async function loadCaseTree(executionId: string): Promise<CaseTreeCase[]> {
  const rows = await prisma.testResult.findMany({
    where: { executionId },
    include: resultInclude,
    orderBy: [{ sortIndex: "asc" }, { startedAt: "asc" }],
  });
  return groupResultsIntoTestCases(rows);
}

export async function bindUnlinkedRecordings(executionId: string) {
  const artifacts = await prisma.artifact.findMany({
    where: { executionId, kind: { in: ["video", "trace"] } },
  });
  const unlinked = artifacts.filter((item) => !item.resultId);
  if (!unlinked.length) return 0;
  const results = await prisma.testResult.findMany({
    where: { executionId },
    include: resultInclude,
    orderBy: [{ sortIndex: "asc" }, { startedAt: "asc" }],
  });
  const cases = groupResultsIntoTestCases(results).map((item) => ({
    id: item.id,
    name: item.name,
    resultId: item.steps[0]?.resultId,
    testPointId: item.steps[0]?.id,
  }));
  let updated = 0;
  for (const artifact of unlinked) {
    const caseId = matchCaseFromArtifactPath(artifact.storagePath, cases);
    const owner = cases.find((item) => item.id === caseId);
    if (!owner?.resultId) continue;
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: {
        resultId: owner.resultId,
        testPointExternalId: artifact.testPointExternalId || owner.testPointId,
        name: uniqueRecordingName(artifact.storagePath, artifact.name),
      },
    });
    updated += 1;
  }
  return updated;
}

export async function persistExecutionCaseStats(executionId: string) {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { results: { include: resultInclude } },
  });
  if (!execution) return null;
  await bindUnlinkedRecordings(executionId);
  const cases = groupResultsIntoTestCases(execution.results);
  const summary = summarizeCaseTree(cases);
  if (alreadyCaseLevel(execution, summary)) {
    return { execution, cases, summary };
  }
  const quality = computeQualityScore({
    passRate: summary.passRate,
    failed: summary.failed,
    criticalFailures: summary.failed,
    regressions: 0,
    flakinessScore: summary.flaky / Math.max(1, summary.totalTests),
    performanceRegressions: 0,
    coverageScore: summary.totalTests > 0 ? 1 : 0,
  });
  const updated = await prisma.execution.update({
    where: { id: executionId },
    data: {
      totalTests: summary.totalTests,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      flaky: summary.flaky,
      blocked: summary.blocked,
      passRate: summary.passRate,
      qualityScore: quality.score,
    },
  });
  return { execution: { ...execution, ...updated }, cases, summary };
}

export async function persistProjectCaseStats(projectId: string) {
  const executions = await prisma.execution.findMany({
    where: { projectId },
    select: { id: true },
  });
  for (const item of executions) {
    await persistExecutionCaseStats(item.id);
  }
}
