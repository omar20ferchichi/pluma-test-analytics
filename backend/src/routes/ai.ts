import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function aiRoutes(app: FastifyInstance) {
  app.post("/api/executions/:id/ai-analysis", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: { clusters: true, failures: { take: 20 } },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found" });

    if (!process.env.OPENAI_API_KEY) {
      const top = execution.clusters[0];
      return {
        enabled: false,
        notice: "AI analysis is optional and currently disabled. Set OPENAI_API_KEY to enable model-backed summaries.",
        deterministicSummary: {
          headline: top
            ? `${top.count} failures share “${top.sampleMessage}” (${top.category}).`
            : "No failures to summarize.",
          likelyEnvironmentWide: Boolean(top && top.count >= Math.max(3, Math.floor(execution.failed * 0.6))),
          investigation: top
            ? [`Inspect cluster “${top.sampleMessage}”`, "Confirm environment/data preconditions", "Watch the associated TestPoint videos"]
            : ["No failed TestPoints in this execution"],
        },
      };
    }

    return reply.code(501).send({
      error: "Model-backed AI analysis is configured but the provider adapter is not wired in this environment.",
    });
  });
}
