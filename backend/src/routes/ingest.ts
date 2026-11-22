import type { FastifyInstance } from "fastify";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { importExecution } from "../services/import-execution.js";
import { id } from "../lib/ids.js";
import { artifactDir, copyStoredFile, ensureDir } from "../lib/storage.js";
import { audit } from "../lib/audit.js";
import { saveMultipartToFile, withTempDir } from "../lib/multipart-file.js";
import { defaultReportsDir, importReportsDir } from "../lib/pluma-reports.js";

export async function ingestRoutes(app: FastifyInstance) {
  app.post("/api/executions", { preHandler: app.authenticate }, async (request, reply) => {
    const body = z.object({
      projectId: z.string().optional(),
      name: z.string().optional(),
      branch: z.string().optional(),
      commitSha: z.string().optional(),
      environment: z.string().optional(),
      browser: z.string().optional(),
      pipeline: z.string().optional(),
      ciProvider: z.string().optional(),
    }).parse(request.body ?? {});
    const projectId = request.apiProjectId ?? body.projectId;
    if (!projectId) return reply.code(400).send({ error: "projectId required" });
    const last = await prisma.execution.findFirst({
      where: { projectId },
      orderBy: { sequentialId: "desc" },
    });
    const sequentialId = (last?.sequentialId ?? 100) + 1;
    const execution = await prisma.execution.create({
      data: {
        id: id("ex"),
        projectId,
        sequentialId,
        status: "open",
        name: body.name ?? `CI execution #${sequentialId}`,
        branch: body.branch,
        commitSha: body.commitSha,
        environment: body.environment,
        browser: body.browser,
        pipeline: body.pipeline,
        ciProvider: body.ciProvider,
      },
    });
    await ensureDir(artifactDir(projectId, execution.id));
    return { execution };
  });

  app.post("/api/executions/:id/artifacts", { preHandler: app.authenticate }, async (request, reply) => {
    const { id: executionId } = request.params as { id: string };
    const execution = await prisma.execution.findUnique({ where: { id: executionId } });
    if (!execution) return reply.code(404).send({ error: "Execution not found" });
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "Missing file" });
    const artifact = await withTempDir(async (dir) => {
      const dest = path.join(dir, (data.filename || "artifact.bin").replace(/[/\\]/g, "_"));
      const saved = await saveMultipartToFile(data, dest);
      const relative = (data.fields as Record<string, { value?: string }>)?.path?.value ?? data.filename ?? "artifact.bin";
      const stored = await copyStoredFile(artifactDir(execution.projectId, execution.id), relative, dest);
      return prisma.artifact.create({
        data: {
          id: id("art"),
          executionId,
          kind: guessKind(relative),
          name: relative.split("/").pop() ?? relative,
          storagePath: stored,
          contentType: data.mimetype,
          size: saved.size,
        },
      });
    });
    return { artifact };
  });

  app.post("/api/executions/:id/complete", { preHandler: app.authenticate }, async (request, reply) => {
    const { id: executionId } = request.params as { id: string };
    const execution = await prisma.execution.findUnique({ where: { id: executionId } });
    if (!execution) return reply.code(404).send({ error: "Execution not found" });
    await prisma.execution.update({ where: { id: executionId }, data: { status: "ready", finishedAt: new Date() } });
    return { ok: true };
  });

  /** Pull every new run from test_entretien/reports (TEST_ENTRETIEN_REPORTS overrides the folder). */
  app.get("/api/projects/:id/reports-sync", { preHandler: app.authenticate }, async () => ({ dir: defaultReportsDir() }));
  app.post("/api/projects/:id/reports-sync", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const { id: projectId } = request.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ error: "Project not found" });
    const dir = defaultReportsDir();
    const result = await importReportsDir(projectId, dir, (line) => request.log.info(line));
    return { dir, ...result };
  });

  for (const provider of ["github", "gitlab", "jenkins"] as const) {
    app.post(`/api/ingest/${provider}`, { preHandler: app.authenticate }, async (request, reply) => {
      if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
      const data = await request.file();
      if (!data) return reply.code(400).send({ error: "Upload a ZIP of execution artifacts" });
      const result = await withTempDir(async (dir) => {
        const dest = path.join(dir, data.filename || "execution.zip");
        await saveMultipartToFile(data, dest);
        const fields = data.fields as Record<string, { value?: string } | undefined>;
        const projectId = request.apiProjectId ?? fields.projectId?.value;
        if (!projectId) {
          throw Object.assign(new Error("projectId required"), { statusCode: 400 });
        }
        return importExecution({
          projectId,
          zipPath: dest,
          metadata: {
            ciProvider: provider,
            branch: fields.branch?.value,
            commitSha: fields.sha?.value ?? fields.commit?.value,
            pipeline: fields.pipeline?.value ?? fields.runId?.value,
            environment: fields.environment?.value,
            browser: fields.browser?.value,
          },
        });
      });
      await audit("execution.ingest", "execution", result.executionId, request.authUser?.id, { provider });
      return result;
    });
  }
}

function guessKind(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm") || lower.endsWith(".mp4")) return "video";
  if (lower.endsWith(".png") || lower.endsWith(".jpg")) return "screenshot";
  if (lower.endsWith(".log")) return "log";
  if (/(^|\/)trace\.zip$/i.test(lower) || lower.endsWith(".trace") || /\/trace\/.*\.zip$/i.test(lower) || lower.endsWith("trace.zip")) return "trace";
  if (lower.endsWith(".json")) return "json";
  return "other";
}
