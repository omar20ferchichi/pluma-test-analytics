import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveTraceViewerRoot(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../vendor/playwright-trace-viewer"),
    path.resolve(here, "../vendor/playwright-trace-viewer"),
    path.resolve(process.cwd(), "vendor/playwright-trace-viewer"),
    path.resolve(process.cwd(), "node_modules/playwright-core/lib/vite/traceViewer"),
    path.resolve(process.cwd(), "../ultimate_test/node_modules/playwright-core/lib/vite/traceViewer"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html")) && existsSync(path.join(dir, "sw.bundle.js"))) {
      return dir;
    }
  }
  return null;
}
