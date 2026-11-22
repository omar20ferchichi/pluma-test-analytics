import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string };
    user: { sub: string; email: string; role: string };
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
    apiProjectId?: string;
  }
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const queryToken = (request.query as { token?: string } | undefined)?.token;
    if (queryToken && !request.headers.authorization) {
      request.headers.authorization = `Bearer ${queryToken}`;
    }
    const apiKey = request.headers["x-api-key"];
    if (typeof apiKey === "string" && apiKey.startsWith("qatk_")) {
      const hash = hashKey(apiKey);
      const record = await prisma.apiKey.findFirst({
        where: { hash, revokedAt: null },
        include: { project: true },
      });
      if (!record) {
        return reply.code(401).send({ error: "Invalid API key" });
      }
      await prisma.apiKey.update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      });
      request.apiProjectId = record.projectId;
      request.authUser = {
        id: `apikey:${record.id}`,
        email: `ci@${record.project.slug}`,
        name: record.name,
        role: "ci",
      };
      return;
    }

    try {
      await request.jwtVerify();
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.code(401).send({ error: "Unknown user" });
      request.authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
});

export function hashApiKey(value: string): string {
  return hashKey(value);
}
