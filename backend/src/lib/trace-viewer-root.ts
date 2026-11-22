import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A trace can only be opened by a Trace Viewer at least as new as the Playwright that recorded it.
 * Order: TRACE_VIEWER_DIR → the suite's own installed Playwright (always matches its traces) →
 * the copy bundled in backend/vendor (Playwright 1.65.1).
 */
export function resolveTraceViewerRoot(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(here, "../../..");
  const suiteRoot = process.env.TEST_ENTRETIEN_REPORTS
    ? path.resolve(process.env.TEST_ENTRETIEN_REPORTS, "..")
    : path.resolve(projectRoot, "../test_entretien");
  const candidates = [
    process.env.TRACE_VIEWER_DIR,
    path.join(suiteRoot, "node_modules/playwright-core/lib/vite/traceViewer"),
    path.resolve(here, "../../vendor/playwright-trace-viewer"),
    path.resolve(here, "../vendor/playwright-trace-viewer"),
    path.resolve(process.cwd(), "vendor/playwright-trace-viewer"),
    path.resolve(process.cwd(), "node_modules/playwright-core/lib/vite/traceViewer"),
  ].filter((dir): dir is string => Boolean(dir));
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html")) && existsSync(path.join(dir, "sw.bundle.js"))) {
      return dir;
    }
  }
  return null;
}
