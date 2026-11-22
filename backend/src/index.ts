import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });
import { authPlugin } from "./plugins/auth.js";
import { traceViewerPlugin } from "./plugins/trace-viewer.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { executionRoutes } from "./routes/executions.js";
import { reportRoutes } from "./routes/reports.js";
import { ingestRoutes } from "./routes/ingest.js";
import { aiRoutes } from "./routes/ai.js";
import { prisma } from "./lib/prisma.js";
import { maxUploadBytes, tooLargeMessage } from "./lib/upload-limits.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const uploadLimit = maxUploadBytes();
  const app = Fastify({
    logger: true,
    bodyLimit: uploadLimit,
    requestTimeout: 0,
    connectionTimeout: 0,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  });
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret" });
  await app.register(multipart, {
    limits: {
      fileSize: uploadLimit,
      fieldSize: 2 * 1024 * 1024,
      fields: 32,
      files: 5,
      parts: 40,
    },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (request) => request.url.split("?")[0].startsWith("/trace"),
  });
  await app.register(authPlugin);
  await app.register(traceViewerPlugin);

  app.get("/api/health", async () => ({ ok: true, service: "qa-testpoint-analytics" }));

  await app.register(authRoutes);
  await app.register(projectRoutes);
  await app.register(executionRoutes);
  await app.register(reportRoutes);
  await app.register(ingestRoutes);
  await app.register(aiRoutes);

  app.setErrorHandler((error, _request, reply) => {
    const errCode = (error as { code?: string }).code;
    const status =
      (error as { statusCode?: number }).statusCode ??
      (errCode === "P2003" ? 400 : 500);
    app.log.error(error);
    if (errCode === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({ error: tooLargeMessage() });
    }
    const message =
      errCode === "P2003"
        ? "Import target is invalid. Select a current project in the header and try again."
        : (error as Error).message ?? "Internal error";
    reply.code(status).send({ error: message });
  });

  return app;
}

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "0.0.0.0";
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (process.argv[1]?.includes("index.ts") || process.argv[1]?.includes("index.js")) {
  start();
}
