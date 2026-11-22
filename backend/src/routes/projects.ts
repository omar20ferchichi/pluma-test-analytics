import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { id, token } from "../lib/ids.js";
import { hashApiKey } from "../plugins/auth.js";
import { audit } from "../lib/audit.js";

export async function projectRoutes(app: FastifyInstance) {
  app.get("/api/projects", { preHandler: app.authenticate }, async () => {
    const projects = await prisma.project.findMany({
      include: {
        org: true,
        _count: { select: { executions: true, testPoints: true } },
      },
      orderBy: { name: "asc" },
    });
    return { projects };
  });

  app.post("/api/projects", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const body = z.object({
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
      orgId: z.string().optional(),
    }).parse(request.body);
    const org = body.orgId
      ? await prisma.organization.findUnique({ where: { id: body.orgId } })
      : await prisma.organization.findFirst();
    if (!org) return reply.code(400).send({ error: "No organization found" });
    const project = await prisma.project.create({
      data: {
        id: id("prj"),
        orgId: org.id,
        name: body.name,
        slug: body.slug,
        description: body.description ?? "",
        qualityConfig: {
          create: { id: id("qc") },
        },
      },
    });
    await audit("project.create", "project", project.id, request.authUser?.id);
    return { project };
  });

  app.get("/api/projects/:projectId/quality-config", { preHandler: app.authenticate }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const config = await prisma.qualityConfig.findUnique({ where: { projectId } });
    return { config };
  });

  app.put("/api/projects/:projectId/quality-config", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const { projectId } = request.params as { projectId: string };
    const body = z.object({
      passRate: z.number(),
      criticalFailures: z.number(),
      regressions: z.number(),
      flakiness: z.number(),
      performance: z.number(),
      coverage: z.number(),
    }).parse(request.body);
    const config = await prisma.qualityConfig.upsert({
      where: { projectId },
      update: body,
      create: { id: id("qc"), projectId, ...body },
    });
    return { config };
  });

  app.get("/api/projects/:projectId/api-keys", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role === "viewer") return reply.code(403).send({ error: "Forbidden" });
    const { projectId } = request.params as { projectId: string };
    const keys = await prisma.apiKey.findMany({
      where: { projectId },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { keys };
  });

  app.post("/api/projects/:projectId/api-keys", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "Admin only" });
    const { projectId } = request.params as { projectId: string };
    const body = z.object({ name: z.string().min(1) }).parse(request.body);
    const raw = `qatk_${token(24)}`;
    const record = await prisma.apiKey.create({
      data: {
        id: id("key"),
        projectId,
        name: body.name,
        prefix: raw.slice(0, 12),
        hash: hashApiKey(raw),
      },
    });
    await audit("apikey.create", "apiKey", record.id, request.authUser?.id);
    return { key: { ...record, secret: raw } };
  });

  app.post("/api/projects/:projectId/api-keys/:keyId/revoke", { preHandler: app.authenticate }, async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "Admin only" });
    const { keyId } = request.params as { keyId: string };
    await prisma.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    return { ok: true };
  });
}
