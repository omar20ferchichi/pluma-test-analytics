import type { FastifyInstance } from "fastify";
import { buildQualificationReport, type QualificationCaseInput, type QualificationRunInput } from "@qa/shared";
import { prisma } from "../lib/prisma.js";
import { groupResultsIntoTestCases, type CaseTreeCase } from "../lib/case-tree.js";
import { persistExecutionCaseStats } from "../lib/execution-stats.js";
import { renderQualificationHtml } from "../lib/qualification-html.js";

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseMeta(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toRunInput(
  execution: {
    sequentialId: number;
    name: string | null;
    environment: string | null;
    browser: string | null;
    branch: string | null;
    commitSha: string | null;
    pipeline: string | null;
    ciProvider: string | null;
    sourceFormat: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number;
    qualityScore: number;
    metadataJson: string;
    project: { name: string };
  },
): QualificationRunInput {
  const meta = parseMeta(execution.metadataJson);
  return {
    sequentialId: execution.sequentialId,
    name: execution.name,
    projectName: execution.project.name,
    environment: execution.environment ?? asString(meta.environment),
    browser: execution.browser ?? asString(meta.browser),
    branch: execution.branch ?? asString(meta.branch),
    commitSha: execution.commitSha ?? asString(meta.commitSha),
    pipeline: execution.pipeline ?? asString(meta.pipeline),
    ciProvider: execution.ciProvider ?? asString(meta.ciProvider),
    sourceFormat: execution.sourceFormat,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    qualityScore: execution.qualityScore,
    playwrightVersion: asString(meta.playwrightVersion),
    baseUrl: asString(meta.baseUrl),
    workers: asNumber(meta.workers),
  };
}

function toCaseInput(cases: CaseTreeCase[]): QualificationCaseInput[] {
  return cases.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    durationMs: item.durationMs,
    steps: item.steps.map((step) => ({
      id: step.id,
      name: step.name,
      status: step.status,
      durationMs: step.durationMs,
      category: step.category,
      error: step.error,
    })),
  }));
}

function fileStem(project: string, sequentialId: number): string {
  const safe = project.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "execution";
  return `${safe}-execution-${sequentialId}-qualification-report`;
}

const resultInclude = {
  testPoint: { include: { testCase: true } },
  testCase: true,
  failure: true,
  artifacts: true,
} as const;

export async function reportRoutes(app: FastifyInstance) {
  app.get("/api/executions/:id/reports/:kind", { preHandler: app.authenticate }, async (request, reply) => {
    const { id, kind } = request.params as { id: string; kind: string };
    const query = request.query as { format?: string; download?: string; preview?: string };
    const format = query.format ?? "json";
    await persistExecutionCaseStats(id);
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: {
        results: { orderBy: [{ sortIndex: "asc" }, { startedAt: "asc" }], include: resultInclude },
        clusters: true,
        project: true,
      },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found" });

    const previous = await prisma.execution.findFirst({
      where: {
        projectId: execution.projectId,
        archivedAt: null,
        sequentialId: { lt: execution.sequentialId },
      },
      orderBy: { sequentialId: "desc" },
      include: {
        results: {
          orderBy: [{ sortIndex: "asc" }, { startedAt: "asc" }],
          include: { testPoint: { include: { testCase: true } }, testCase: true },
        },
        project: true,
      },
    });

    const cases = groupResultsIntoTestCases(execution.results);
    const previousCases = previous ? groupResultsIntoTestCases(previous.results) : [];
    const qualification = buildQualificationReport({
      current: toRunInput(execution),
      cases: toCaseInput(cases),
      previous: previous
        ? { run: toRunInput(previous), cases: toCaseInput(previousCases) }
        : undefined,
      editorName: request.authUser?.name ?? "QA",
      editorRole: request.authUser?.role === "admin" ? "Qualification Manager" : request.authUser?.role ?? "QA",
    });

    const payload = {
      kind,
      generatedAt: qualification.generatedAt,
      execution: {
        id: execution.id,
        sequentialId: execution.sequentialId,
        name: execution.name,
        project: execution.project.name,
        branch: execution.branch,
        commitSha: execution.commitSha,
        environment: execution.environment,
        browser: execution.browser,
        qualityScore: execution.qualityScore,
        passRate: execution.passRate,
        totals: {
          total: execution.totalTests,
          passed: execution.passed,
          failed: execution.failed,
          skipped: execution.skipped,
          flaky: execution.flaky,
        },
      },
      qualification,
      cases,
      failedTests: cases
        .filter((item) => item.status === "failed" || item.status === "timedOut")
        .map((item) => {
          const step = item.steps.find((row) => row.status === "failed" || row.status === "timedOut");
          return {
            testCase: item.id,
            name: item.name,
            failedStep: step?.id,
            description: step?.name ?? item.name,
            category: step?.category,
            message: step?.error,
            durationMs: item.durationMs,
          };
        }),
      clusters: execution.clusters.map((cluster) => ({
        message: cluster.sampleMessage,
        category: cluster.category,
        count: cluster.count,
      })),
    };

    if (format === "csv") {
      const header = ["testCaseId", "testCase", "status", "module", "durationMs", "failedStep", "category", "message"];
      const rows = qualification.cases.map((item) => {
        const source = cases.find((row) => row.id === item.id);
        const step = source?.steps.find((row) => row.status === "failed" || row.status === "timedOut");
        return [
          item.id,
          item.name,
          item.status,
          item.module,
          item.durationMs,
          step?.id ?? "",
          step?.category ?? "",
          step?.error ?? "",
        ].map(csvEscape).join(",");
      });
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename=execution-${execution.sequentialId}.csv`);
      return reply.send([header.join(","), ...rows].join("\n"));
    }

    if (format === "html" || format === "pdf") {
      const html = renderQualificationHtml(qualification, {
        autoPrint: format === "pdf",
        preview: query.preview === "1",
      });
      reply.header("Content-Type", "text/html; charset=utf-8");
      if (query.download === "1") {
        reply.header("Content-Disposition", `attachment; filename=${fileStem(execution.project.name, execution.sequentialId)}.html`);
      }
      return reply.send(html);
    }

    return payload;
  });
}

