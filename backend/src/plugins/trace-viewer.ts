import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { resolveTraceViewerRoot } from "../lib/trace-viewer-root.js";

export async function traceViewerPlugin(app: FastifyInstance) {
  const root = resolveTraceViewerRoot();
  if (!root) {
    app.log.warn("Playwright Trace Viewer assets were not found; traces cannot open in the platform");
    return;
  }
  await app.register(fastifyStatic, {
    root,
    prefix: "/trace/",
    decorateReply: false,
    index: false,
    wildcard: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith("sw.bundle.js")) {
        res.setHeader("Service-Worker-Allowed", "/trace/");
        res.setHeader("Cache-Control", "no-cache");
      }
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  });
  app.get("/trace", async (_request, reply) => reply.redirect("/trace/index.html"));
  app.log.info({ root }, "Playwright Trace Viewer mounted at /trace/");
}
