import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./prisma.js";
import { importExecution } from "../services/import-execution.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Where test_entretien writes its runs. Each `npx playwright test` produces
 * reports/<YYYY-MM-DD_HH-MM-SS>/{results.json, summary.json, testcases/, logs/, artifacts/, html/}.
 */
export function defaultReportsDir(): string {
  if (process.env.TEST_ENTRETIEN_REPORTS) return path.resolve(process.env.TEST_ENTRETIEN_REPORTS);
  const sibling = path.resolve(projectRoot, "../test_entretien/reports");
  if (existsSync(sibling)) return sibling;
  return path.join(projectRoot, "samples");
}

const STAMP_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

async function walk(dir: string, rel = "", out: Array<{ relativePath: string; buffer: Buffer }> = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!rel && entry.name === "html") continue; // Playwright HTML report: not imported
      await walk(full, nextRel, out);
    } else if (entry.isFile()) {
      const info = await stat(full);
      if (info.size <= MAX_FILE_BYTES) out.push({ relativePath: nextRel, buffer: await readFile(full) });
    }
  }
  return out;
}

/** Turn the Playwright argv into a short label, e.g. "tests/scenarios/E2E-" → "scenarios/E2E-". */
function suiteLabel(results: Record<string, unknown> | null): string | undefined {
  const argv = (results?.config as { argv?: string[] } | undefined)?.argv;
  if (!Array.isArray(argv)) return undefined;
  const at = argv.indexOf("test");
  const filters = (at >= 0 ? argv.slice(at + 1) : []).filter((arg) => !arg.startsWith("-"));
  if (!filters.length) return "full suite";
  return filters.map((arg) => arg.replace(/^tests\//, "")).join(" ");
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runMetadata(runDir: string, stamp: string): Promise<Record<string, string | undefined>> {
  const summary = await readJson(path.join(runDir, "summary.json"));
  const results = await readJson(path.join(runDir, "results.json"));
  const stats = results?.stats as { startTime?: string; duration?: number } | undefined;
  const startedAt = stats?.startTime;
  const finishedAt =
    (summary?.updatedAt as string | undefined) ??
    (startedAt && stats?.duration ? new Date(Date.parse(startedAt) + stats.duration).toISOString() : undefined);
  const label = suiteLabel(results);
  return {
    name: label ? `${stamp} · ${label}` : stamp,
    startedAt,
    finishedAt,
    browser: "chromium",
    environment: process.env.PLUMA_ENVIRONMENT ?? "app.pluma.ai",
    pipeline: label,
    ciProvider: "local",
  };
}

export interface ImportReportsResult {
  imported: string[];
  skipped: Array<{ run: string; reason: string }>;
}

/** Import every timestamped run folder under `reportsDir` that is not already in the project. */
export async function importReportsDir(projectId: string, reportsDir = defaultReportsDir(), log = console.log): Promise<ImportReportsResult> {
  const result: ImportReportsResult = { imported: [], skipped: [] };
  if (!existsSync(reportsDir)) {
    log(`Reports folder not found: ${reportsDir}`);
    return result;
  }
  const runs = (await readdir(reportsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && STAMP_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const existing = await prisma.execution.findMany({ where: { projectId }, select: { name: true } });
  const known = new Set(existing.map((row) => (row.name ?? "").split(" · ")[0]));

  for (const stamp of runs) {
    const runDir = path.join(reportsDir, stamp);
    if (known.has(stamp)) {
      result.skipped.push({ run: stamp, reason: "already imported" });
      continue;
    }
    // results.json is written when the run ends; testcases/ fill up while it runs.
    if (!existsSync(path.join(runDir, "results.json"))) {
      result.skipped.push({ run: stamp, reason: "no results.json yet (run still in progress, or interrupted)" });
      continue;
    }
    const stats = (await readJson(path.join(runDir, "results.json")))?.stats as Record<string, number> | undefined;
    if (stats && (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0) === 0) {
      result.skipped.push({ run: stamp, reason: "nothing executed (every test skipped: dry run or --list)" });
      continue;
    }
    try {
      const files = await walk(runDir);
      const metadata = await runMetadata(runDir, stamp);
      const out = await importExecution({ projectId, files, metadata });
      result.imported.push(stamp);
      log(`  ✓ ${metadata.name} → #${out.sequentialId} (${out.summary.passed}/${out.summary.totalTests} passed)`);
    } catch (error) {
      result.skipped.push({ run: stamp, reason: (error as Error).message });
      log(`  ✗ ${stamp}: ${(error as Error).message}`);
    }
  }
  return result;
}
