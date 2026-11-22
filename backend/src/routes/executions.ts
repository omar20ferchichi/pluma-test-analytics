import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { importExecution } from "../services/import-execution.js";
import { audit } from "../lib/audit.js";
import { compareExecutions, classifyHistory, percentile, type TestStatus } from "@qa/shared";
import { groupResultsIntoTestCases } from "../lib/case-tree.js";
import { persistExecutionCaseStats, persistProjectCaseStats, bindUnlinkedRecordings } from "../lib/execution-stats.js";
import { saveMultipartToFile, withTempDir } from "../lib/multipart-file.js";

function projectFilter(request: { query: unknown; apiProjectId?: string }) {
  const q = request.query as Record<string, string | undefined>;
  return request.apiProjectId ?? q.projectId;
}

export async function executionRoutes(app: FastifyInstance) {
  app.post("/api/projects/:projectId/executions/import", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const { projectId } = request.params as { projectId: string };
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "Upload a ZIP or results file" });
    const result = await withTempDir(async (dir) => {
      const filename = data.filename ?? "upload.bin";
      const dest = path.join(dir, filename.replace(/[/\\]/g, "_") || "upload.bin");
      await saveMultipartToFile(data, dest);
      const fields = data.fields as Record<string, { value?: string } | undefined>;
      const metadata = {
        branch: fields?.branch?.value,
        commitSha: fields?.commit?.value ?? fields?.commitSha?.value,
        environment: fields?.environment?.value,
        browser: fields?.browser?.value,
        pipeline: fields?.pipeline?.value,
        ciProvider: fields?.ciProvider?.value,
        name: fields?.name?.value,
      };
      const isZip = filename.toLowerCase().endsWith(".zip") || data.mimetype === "application/zip";
      return importExecution({
        projectId,
        zipPath: isZip ? dest : undefined,
        files: isZip ? undefined : [{ relativePath: filename, buffer: await readFile(dest) }],
        metadata,
      });
    });
    await audit("execution.import", "execution", result.executionId, request.authUser?.id, result.validation);
    return result;
  });

  app.get("/api/executions", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const projectId = projectFilter(request);
    const take = Math.min(100, Number(q.limit ?? 25));
    const skip = Number(q.offset ?? 0);
    const where = {
      archivedAt: q.archived === "true" ? { not: null } : q.includeArchived === "true" ? undefined : null,
      projectId: projectId || undefined,
      environment: q.environment || undefined,
      browser: q.browser || undefined,
      branch: q.branch || undefined,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q } },
              { commitSha: { contains: q.q } },
              { branch: { contains: q.q } },
              { id: { contains: q.q } },
            ],
          }
        : {}),
    };
    if (projectId) await persistProjectCaseStats(projectId);
    const [items, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        orderBy: { sequentialId: "desc" },
        take,
        skip,
      }),
      prisma.execution.count({ where }),
    ]);
    return { items, total, take, skip };
  });

  app.get("/api/executions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await persistExecutionCaseStats(id);
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: {
        project: true,
        clusters: true,
        artifacts: { select: { id: true, kind: true, name: true, size: true, testPointExternalId: true, resultId: true } },
      },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found" });
    return { execution, validation: JSON.parse(execution.validationJson), metadata: JSON.parse(execution.metadataJson) };
  });

  app.delete("/api/executions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params as { id: string };
    await prisma.execution.delete({ where: { id } });
    await audit("execution.delete", "execution", id, request.authUser?.id);
    return { ok: true };
  });

  app.post("/api/executions/:id/archive", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params as { id: string };
    await prisma.execution.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  });

  app.get("/api/executions/:id/results", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    await bindUnlinkedRecordings(id);
    const q = request.query as Record<string, string | undefined>;
    const where = {
      executionId: id,
      status: q.status || undefined,
      failureCategory: q.failureCategory || undefined,
      browser: q.browser || undefined,
      environment: q.environment || undefined,
      ...(q.q
        ? {
            OR: [
              { errorMessage: { contains: q.q } },
              { testPoint: { externalId: { contains: q.q } } },
              { testPoint: { description: { contains: q.q } } },
              { testCase: { name: { contains: q.q } } },
            ],
          }
        : {}),
    };
    const items = await prisma.testResult.findMany({
      where,
      include: { testPoint: { include: { testCase: true } }, testCase: true, artifacts: true, failure: true },
      orderBy: [{ sortIndex: "asc" }, { startedAt: "asc" }],
    });
    return { items };
  });

  app.get("/api/executions/:id/failures", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const items = await prisma.failure.findMany({
      where: { executionId: id },
      include: { result: { include: { testPoint: true, testCase: true, artifacts: true } } },
    });
    return { items };
  });

  app.post("/api/failures/:id/reclassify", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { category?: string };
    if (!body.category) return reply.code(400).send({ error: "category required" });
    const failure = await prisma.failure.update({
      where: { id },
      data: { manualCategory: body.category, category: body.category },
    });
    await prisma.testResult.update({
      where: { id: failure.resultId },
      data: { failureCategory: body.category },
    });
    return { failure };
  });

  app.get("/api/executions/:id/clusters", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const items = await prisma.failureClusterRow.findMany({
      where: { executionId: id },
      orderBy: { count: "desc" },
    });
    return {
      items: items.map((item) => ({
        ...item,
        testPointIds: JSON.parse(item.testPointIds),
        testCaseIds: JSON.parse(item.testCaseIds),
      })),
    };
  });

  app.get("/api/executions/:id/logs", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string | undefined>;
    const take = Math.min(2000, Number(q.limit ?? 500));
    const skip = Number(q.offset ?? 0);
    const where = {
      executionId: id,
      level: q.level || undefined,
      testPointId: q.testPointId || undefined,
      ...(q.errorsOnly === "true" ? { level: "ERROR" } : {}),
      ...(q.warningsOnly === "true" ? { level: "WARN" } : {}),
      ...(q.q ? { message: { contains: q.q } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.logLine.findMany({ where, orderBy: { lineNumber: "asc" }, take, skip }),
      prisma.logLine.count({ where }),
    ]);
    return { items, total };
  });

  app.get("/api/executions/:id/videos", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    await bindUnlinkedRecordings(id);
    const items = await prisma.artifact.findMany({
      where: { executionId: id, kind: { in: ["video", "trace"] } },
      include: { result: { include: { testPoint: { include: { testCase: true } }, testCase: true } } },
      orderBy: { name: "asc" },
    });
    return { items: items.filter(isPlaywrightRecording) };
  });

  app.get("/api/artifacts/:id", { preHandler: optionalTokenAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await prisma.artifact.findUnique({ where: { id } });
    if (!artifact) return reply.code(404).send({ error: "Artifact not found" });
    try {
      const info = await stat(artifact.storagePath);
      const range = request.headers.range;
      const contentType = artifact.contentType || guessType(artifact.name);
      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        const start = match ? Number(match[1]) : 0;
        const end = match?.[2] ? Number(match[2]) : info.size - 1;
        reply.header("Content-Range", `bytes ${start}-${end}/${info.size}`);
        reply.header("Accept-Ranges", "bytes");
        reply.header("Content-Length", end - start + 1);
        reply.header("Content-Type", contentType);
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Cross-Origin-Resource-Policy", "cross-origin");
        return reply.code(206).send(createReadStream(artifact.storagePath, { start, end }));
      }
      reply.header("Content-Length", info.size);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Type", contentType);
      reply.header("Content-Disposition", `inline; filename="${artifact.name}"`);
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      return reply.send(createReadStream(artifact.storagePath));
    } catch {
      return reply.code(404).send({ error: "Artifact file missing on disk" });
    }
  });

  app.get("/api/executions/:id/compare/:otherId", { preHandler: app.authenticate }, async (request, reply) => {
    const { id, otherId } = request.params as { id: string; otherId: string };
    await persistExecutionCaseStats(id);
    await persistExecutionCaseStats(otherId);
    const include = { results: { include: { testPoint: { include: { testCase: true } }, testCase: true } } };
    const [previous, current] = await Promise.all([
      prisma.execution.findUnique({ where: { id: otherId }, include }),
      prisma.execution.findUnique({ where: { id }, include }),
    ]);
    if (!previous || !current) return reply.code(404).send({ error: "Execution not found" });
    const map = (exec: typeof current) =>
      groupResultsIntoTestCases(exec!.results).map((row) => ({
        id: row.id,
        status: row.status as TestStatus,
        durationMs: row.durationMs,
      }));
    const summaryOf = (exec: NonNullable<typeof current>) => ({
      totalTests: exec.totalTests,
      passed: exec.passed,
      failed: exec.failed,
      skipped: exec.skipped,
      flaky: exec.flaky,
      blocked: exec.blocked,
      passRate: exec.passRate,
      failureRate: exec.totalTests ? exec.failed / exec.totalTests : 0,
      totalDurationMs: exec.durationMs,
      averageDurationMs: exec.totalTests ? exec.durationMs / exec.totalTests : 0,
    });
    const delta = compareExecutions(
      previous.id,
      current.id,
      summaryOf(previous),
      summaryOf(current),
      map(previous),
      map(current),
    );
    return { delta, previous, current };
  });

  app.get("/api/testpoints", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const items = await prisma.testPoint.findMany({
      where: {
        projectId: q.projectId,
        ...(q.q
          ? {
              OR: [
                { externalId: { contains: q.q } },
                { description: { contains: q.q } },
                { ticketId: { contains: q.q } },
              ],
            }
          : {}),
      },
      include: {
        testCase: true,
        results: { orderBy: { startedAt: "desc" }, take: 20, include: { execution: true } },
      },
      orderBy: { externalId: "asc" },
    });
    return {
      items: items.map((item) => {
        const latest = item.results[0];
        const history = [...item.results].reverse().map((row) => row.status as TestStatus);
        const durations = [...item.results].reverse().map((row) => row.durationMs);
        const flags = classifyHistory(history, durations);
        const passed = item.results.filter((row) => row.status === "passed" || row.status === "flaky").length;
        return {
          ...item,
          latest,
          history,
          flags,
          passRate: item.results.length ? passed / item.results.length : 0,
          failureCount: item.results.filter((row) => row.status === "failed").length,
        };
      }),
    };
  });

  app.get("/api/testpoints/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string | undefined>;
    const point = await prisma.testPoint.findFirst({
      where: q.projectId ? { projectId: q.projectId, externalId: id } : { OR: [{ id }, { externalId: id }] },
      include: {
        testCase: true,
        results: {
          orderBy: { startedAt: "desc" },
          include: { execution: true, artifacts: true, failure: true, logs: { take: 200, orderBy: { lineNumber: "asc" } } },
        },
      },
    });
    if (!point) return reply.code(404).send({ error: "TestPoint not found" });
    const history = [...point.results].reverse().map((row) => row.status as TestStatus);
    const durations = [...point.results].reverse().map((row) => row.durationMs);
    const latest = point.results[0];
    const testCaseRun = latest
      ? await loadTestCaseRun(latest.executionId, point.testCaseId ?? latest.testCaseId)
      : null;
    return { testPoint: point, flags: classifyHistory(history, durations), testCaseRun };
  });

  app.get("/api/test-results/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.testResult.findUnique({
      where: { id },
      include: {
        testPoint: true,
        testCase: true,
        execution: true,
        artifacts: true,
        failure: true,
        logs: { orderBy: { lineNumber: "asc" } },
      },
    });
    if (!result) return reply.code(404).send({ error: "Result not found" });
    const testCaseRun = await loadTestCaseRun(result.executionId, result.testPoint.testCaseId ?? result.testCaseId);
    return { result, testCaseRun };
  });

  app.get("/api/test-results/:id/screencast", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.testResult.findUnique({
      where: { id },
      include: { artifacts: true, testPoint: true },
    });
    if (!result) return reply.code(404).send({ error: "Result not found" });
    const video = result.artifacts.find((item) => item.kind === "video");
    const zip = result.artifacts.find((item) => item.kind === "trace" || item.name.endsWith("trace.zip"));
    const indexArt = result.artifacts.find((item) => item.kind === "trace-index");
    let index: { frames?: unknown[]; actions?: unknown[]; zipArtifactId?: string } = {};
    if (indexArt) {
      try {
        const { readFile } = await import("node:fs/promises");
        index = JSON.parse(await readFile(indexArt.storagePath, "utf8"));
      } catch {
        index = {};
      }
    }
    return {
      resultId: result.id,
      testPointId: result.testPoint.externalId,
      videoArtifactId: video?.id ?? null,
      zipArtifactId: zip?.id ?? index.zipArtifactId ?? null,
      frames: index.frames ?? result.artifacts
        .filter((item) => item.kind === "trace-frame")
        .map((item) => ({ artifactId: item.id, timestamp: 0, width: 0, height: 0 })),
      actions: index.actions ?? [],
    };
  });

  app.get("/api/dashboard", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const projectId = q.projectId;
    if (projectId) await persistProjectCaseStats(projectId);
    const executions = await prisma.execution.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { sequentialId: "asc" },
      take: 30,
    });
    const latest = executions[executions.length - 1] ?? null;
    const results = latest
      ? await prisma.testResult.findMany({
          where: { executionId: latest.id },
          include: { testPoint: { include: { testCase: true } }, testCase: true },
        })
      : [];
    const cases = groupResultsIntoTestCases(results);
    const failedCases = cases.filter((item) => item.status === "failed" || item.status === "timedOut");
    const byTicket: Record<string, number> = {};
    const byEnv: Record<string, number> = {};
    const byBrowser: Record<string, number> = {};
    const seenCase = new Set<string>();
    for (const row of results) {
      const parent = row.testCase ?? row.testPoint.testCase;
      const key = parent?.externalId ?? parent?.id;
      if (!key || seenCase.has(key)) continue;
      if (!failedCases.some((item) => item.id === key)) continue;
      seenCase.add(key);
      const ticket = parent?.ticketId ?? row.testPoint.ticketId ?? "none";
      byTicket[ticket] = (byTicket[ticket] ?? 0) + 1;
      const env = row.environment ?? latest?.environment ?? "unknown";
      byEnv[env] = (byEnv[env] ?? 0) + 1;
      const browser = row.browser ?? latest?.browser ?? "unknown";
      byBrowser[browser] = (byBrowser[browser] ?? 0) + 1;
    }
    const frequentFails = failedCases.map((item) => ({
      id: item.id,
      description: item.name,
      fails: 1,
      duration: item.durationMs,
    }));
    const slowest = [...cases]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 8)
      .map((item) => ({ id: item.id, description: item.name, duration: item.durationMs }));
    return {
      latest,
      executions,
      byTicket,
      byEnv,
      byBrowser,
      frequentFails,
      slowest,
      byTestCase: countBy(cases.map((item) => item.name)),
      byTestCaseStatus: countBy(cases.map((item) => item.status)),
    };
  });

  app.get("/api/executive", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    if (q.projectId) await persistProjectCaseStats(q.projectId);
    const executions = await prisma.execution.findMany({
      where: { projectId: q.projectId, archivedAt: null },
      orderBy: { sequentialId: "asc" },
      take: 20,
    });
    const latest = executions[executions.length - 1];
    const previous = executions[executions.length - 2];
    const trend = executions.map((item) => ({
      id: item.sequentialId,
      passRate: item.passRate,
      qualityScore: item.qualityScore,
      failed: item.failed,
      date: item.startedAt,
    }));
    return {
      latest,
      previous,
      trend,
      stability: executions.length
        ? executions.reduce((sum, item) => sum + item.passRate, 0) / executions.length
        : 0,
    };
  });

  app.get("/api/performance", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const latest = await prisma.execution.findFirst({
      where: { projectId: q.projectId, archivedAt: null },
      orderBy: { sequentialId: "desc" },
      include: { results: { include: { testPoint: { include: { testCase: true } }, testCase: true } } },
    });
    if (!latest) return { stats: null, slowest: [], distribution: [] };
    await persistExecutionCaseStats(latest.id);
    const cases = groupResultsIntoTestCases(latest.results);
    const durations = cases.map((item) => item.durationMs).sort((a, b) => a - b);
    const previous = await prisma.execution.findFirst({
      where: { projectId: q.projectId, archivedAt: null, sequentialId: { lt: latest.sequentialId } },
      orderBy: { sequentialId: "desc" },
      include: { results: { include: { testPoint: { include: { testCase: true } }, testCase: true } } },
    });
    const prevCases = previous ? groupResultsIntoTestCases(previous.results) : [];
    const prevMap = new Map(prevCases.map((item) => [item.id, item.durationMs]));
    const regressions = cases
      .map((row) => {
        const prev = prevMap.get(row.id);
        if (!prev || prev <= 0) return null;
        const deltaPct = ((row.durationMs - prev) / prev) * 100;
        if (deltaPct < 50 || row.durationMs - prev < 2000) return null;
        return {
          testCaseId: row.id,
          testPointId: row.id,
          name: row.name,
          previousMs: prev,
          currentMs: row.durationMs,
          deltaPct,
        };
      })
      .filter(Boolean);
    return {
      latestId: latest.id,
      stats: {
        average: durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length),
        median: percentile(durations, 50),
        p95: percentile(durations, 95),
        total: latest.durationMs,
      },
      slowest: [...cases]
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 15)
        .map((item) => ({ id: item.id, name: item.name, durationMs: item.durationMs })),
      regressions,
      distribution: durations,
    };
  });

  app.get("/api/jira", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const tickets = await prisma.jiraTicket.findMany({ where: { projectId: q.projectId } });
    const points = await prisma.testPoint.findMany({
      where: { projectId: q.projectId, ticketId: { not: null } },
      include: { results: { orderBy: { startedAt: "desc" }, take: 1 } },
    });
    return {
      tickets: tickets.map((ticket) => ({
        ...ticket,
        testPoints: points.filter((point) => point.ticketId === ticket.key),
        failures: points.filter((point) => point.ticketId === ticket.key && point.results[0]?.status === "failed").length,
      })),
    };
  });

  app.get("/api/search", { preHandler: app.authenticate }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const term = q.q?.trim();
    if (!term) return { results: [] };
    const projectId = q.projectId;
    const [points, cases, executions, logs, failures] = await Promise.all([
      prisma.testPoint.findMany({
        where: { projectId, OR: [{ externalId: { contains: term } }, { description: { contains: term } }, { ticketId: { contains: term } }] },
        take: 10,
      }),
      prisma.testCase.findMany({
        where: { projectId, OR: [{ externalId: { contains: term } }, { name: { contains: term } }, { ticketId: { contains: term } }] },
        take: 10,
      }),
      prisma.execution.findMany({
        where: { projectId, OR: [{ id: { contains: term } }, { name: { contains: term } }, { commitSha: { contains: term } }] },
        take: 8,
      }),
      prisma.logLine.findMany({
        where: { message: { contains: term }, execution: { projectId } },
        take: 8,
        include: { execution: true },
      }),
      prisma.failure.findMany({
        where: { OR: [{ message: { contains: term } }, { stackTrace: { contains: term } }], execution: { projectId } },
        take: 8,
        include: { result: { include: { testPoint: true } } },
      }),
    ]);
    return {
      results: [
        ...points.map((item) => ({ type: "testpoint", id: item.id, title: item.externalId, subtitle: item.description })),
        ...cases.map((item) => ({ type: "testcase", id: item.id, title: item.externalId, subtitle: item.name })),
        ...executions.map((item) => ({ type: "execution", id: item.id, title: `#${item.sequentialId}`, subtitle: item.name })),
        ...failures.map((item) => ({ type: "failure", id: item.resultId, title: item.result.testPoint.externalId, subtitle: item.message })),
        ...logs.map((item) => ({ type: "log", id: item.executionId, title: item.level, subtitle: item.message })),
      ],
    };
  });
}

async function loadTestCaseRun(executionId: string, testCaseId?: string | null) {
  if (!testCaseId) return null;
  const rows = await prisma.testResult.findMany({
    where: { executionId, OR: [{ testCaseId }, { testPoint: { testCaseId } }] },
    include: { testPoint: { include: { testCase: true } }, testCase: true, artifacts: true },
    orderBy: [{ sortIndex: "asc" }, { startedAt: "asc" }],
  });
  return groupResultsIntoTestCases(rows)[0] ?? null;
}

async function optionalTokenAuth(request: Parameters<FastifyInstance["authenticate"]>[0], reply: Parameters<FastifyInstance["authenticate"]>[1]) {
  const q = request.query as { token?: string };
  if (!request.headers.authorization && q.token) {
    request.headers.authorization = `Bearer ${q.token}`;
  }
  return (request.server as FastifyInstance).authenticate(request, reply);
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function isPlaywrightRecording(item: { kind: string; name: string; contentType: string | null; resultId: string | null }) {
  if (item.kind === "video") return true;
  if (item.kind !== "trace") return false;
  const name = item.name.toLowerCase();
  const base = name.split("/").pop() ?? name;
  if (/\.(js|mjs|css|map|ttf|woff2?|svg|webmanifest|html|png|ico)$/.test(base)) return false;
  return base === "trace" || base.endsWith("trace.zip") || base.endsWith(".zip") || name.endsWith("trace.zip") || (item.contentType ?? "").includes("zip") || Boolean(item.resultId);
}

function guessType(name: string): string {
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".log") || name.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}
