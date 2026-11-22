import type {
  ExecutionMetadata,
  NormalizedArtifact,
  NormalizedExecution,
  NormalizedTestCase,
  NormalizedTestPoint,
  ValidationIssue,
  ValidationReport,
} from "../types.js";
import { asRecord, pickString, slugify } from "../normalize.js";
import { parseLogText, logValidation } from "./logs.js";
import { isPlaywrightJson, parsePlaywrightJson } from "./playwright-json.js";
import { isNativeTestCaseDocument, parseNativeTestCaseDocuments } from "./testcase-native.js";
import { associateArtifacts, bestSlugMatch, guessKind, matchCaseFromArtifactPath, uniqueRecordingName } from "./artifacts.js";
import { remapArtifactPath } from "./playwright-trace.js";

export interface PackageFile {
  relativePath: string;
  content?: string;
  buffer?: Uint8Array;
  size?: number;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function findFiles(files: PackageFile[], matcher: (path: string) => boolean): PackageFile[] {
  return files.filter((file) => matcher(normalizePath(file.relativePath).toLowerCase()));
}

function parseJsonFile(file: PackageFile): unknown {
  if (!file.content) return null;
  try {
    return JSON.parse(file.content);
  } catch {
    return { __parseError: true, path: file.relativePath };
  }
}

function mergePoint(target: NormalizedTestPoint, source: NormalizedTestPoint) {
  if (source.status && source.status !== "unknown") target.status = source.status;
  if (!target.durationMs && source.durationMs) target.durationMs = source.durationMs;
  if (!target.error && source.error) target.error = source.error;
  if (!target.lastSuccessfulStep && source.lastSuccessfulStep) target.lastSuccessfulStep = source.lastSuccessfulStep;
  if (!target.ticketId) target.ticketId = source.ticketId;
  if (!target.description) target.description = source.description;
  target.retries = Math.max(target.retries, source.retries);
  target.browser = target.browser ?? source.browser;
  for (const artifact of source.artifacts) {
    if (!target.artifacts.some((item) => item.path === artifact.path)) target.artifacts.push(artifact);
  }
  if (source.raw && (target.raw == null || (typeof target.raw === "object" && Object.keys(target.raw as object).length === 0))) {
    target.raw = source.raw;
  }
}

function playwrightMatchesNative(native: NormalizedTestCase, playwright: NormalizedTestCase): boolean {
  if (playwright.id === native.id || playwright.name === native.name) return true;
  if (slugify(playwright.name) === slugify(native.id) || slugify(playwright.name) === slugify(native.name)) return true;
  const nativeIds = new Set(native.testPoints.map((point) => point.id));
  if (playwright.testPoints.some((point) => nativeIds.has(point.id))) return true;
  const file = `${playwright.file ?? ""} ${playwright.id} ${playwright.name}`.toLowerCase();
  return Boolean(native.id) && native.id.length >= 4 && file.includes(native.id.toLowerCase());
}

function pickPlaywrightMatch(native: NormalizedTestCase, playwright: NormalizedTestCase[], used: Set<string>): NormalizedTestCase | undefined {
  let best: NormalizedTestCase | undefined;
  let bestScore = 0;
  for (const item of playwright) {
    if (used.has(item.id) || !playwrightMatchesNative(native, item)) continue;
    let score = 1;
    if (item.id === native.id || item.name === native.name) score += 1000;
    if (slugify(item.name) === slugify(native.id) || slugify(item.name) === slugify(native.name)) score += 500;
    const nativeIds = new Set(native.testPoints.map((point) => point.id));
    score += item.testPoints.filter((point) => nativeIds.has(point.id)).length * 50;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function shareRecordingsWithAllPoints(testCase: NormalizedTestCase, recordings: NormalizedArtifact[]) {
  if (!recordings.length) return;
  for (const point of testCase.testPoints) {
    for (const artifact of recordings) {
      const stamped = { ...artifact, testPointId: point.id, testCaseId: testCase.id };
      if (!point.artifacts.some((item) => item.path === stamped.path)) point.artifacts.push(stamped);
    }
  }
}

/** Native TestCase JSON is the case tree. Playwright specs enrich it; they are not extra cases. */
function attachPlaywrightToNative(native: NormalizedTestCase[], playwright: NormalizedTestCase[]): NormalizedTestCase[] {
  if (!native.length) return playwright;
  if (!playwright.length) return native;
  const used = new Set<string>();
  for (const testCase of native) {
    const match = pickPlaywrightMatch(testCase, playwright, used);
    if (!match) continue;
    used.add(match.id);
    const byId = new Map(testCase.testPoints.map((point) => [point.id, point]));
    for (const point of match.testPoints) {
      const existing = byId.get(point.id);
      if (existing) mergePoint(existing, point);
    }
    if (!testCase.error && match.error) testCase.error = match.error;
    testCase.file = testCase.file ?? match.file;
    testCase.retries = Math.max(testCase.retries, match.retries);
    testCase.durationMs = testCase.testPoints.reduce((sum, point) => sum + point.durationMs, 0);
    if (testCase.testPoints.some((point) => point.status === "failed" || point.status === "timedOut")) {
      testCase.status = "failed";
    }
    const recordings = match.testPoints.flatMap((point) => point.artifacts).filter((item) => item.kind === "video" || item.kind === "trace");
    for (const artifact of recordings) artifact.testCaseId = testCase.id;
    shareRecordingsWithAllPoints(testCase, recordings);
  }
  // test_entretien only writes testcases/*.json for tests that run TestPoints. Keep the other
  // Playwright tests (framework/unit specs) so totals match the run's summary.json.
  const extras = playwright.filter((item) => !used.has(item.id) && !native.some((testCase) => testCase.id === item.id));
  return [...native, ...extras];
}

function recordingPresent(artifactPath: string, packagePaths: string[]): boolean {
  const remapped = remapArtifactPath(artifactPath, packagePaths);
  if (remapped) return true;
  const abs = artifactPath.replace(/\\/g, "/");
  return packagePaths.some((rel) => abs.endsWith(rel) || abs.endsWith(`/${rel}`));
}

function bindArtifactsToCases(artifacts: NormalizedArtifact[], testCases: NormalizedTestCase[]) {
  for (const artifact of artifacts) {
    if (artifact.kind !== "video" && artifact.kind !== "trace") continue;
    const owner =
      testCases.find((item) => item.testPoints.some((point) => point.id === artifact.testPointId)) ??
      testCases.find((item) => item.id === artifact.testCaseId) ??
      testCases.find((item) => item.id === matchCaseFromArtifactPath(artifact.path, testCases)) ??
      testCases.find((item) => item.id === bestSlugMatch(testCases.map((row) => row.id), artifact.path));
    if (!owner?.testPoints.length) continue;
    artifact.testCaseId = owner.id;
    if (!owner.testPoints.some((point) => point.id === artifact.testPointId)) {
      artifact.testPointId = owner.testPoints[0]?.id;
    }
    shareRecordingsWithAllPoints(owner, [artifact]);
  }
}

function isReportNoise(relativePath: string): boolean {
  const path = normalizePath(relativePath).toLowerCase();
  return /(^|\/)html\//.test(path) || /(^|\/)playwright-report\//.test(path);
}

function detectRunRoots(files: PackageFile[]): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    const path = normalizePath(file.relativePath);
    if (/^(results\.json|playwright-results\.json)$/i.test(path)) roots.add("");
    const nested = path.match(/^(.*)\/(results\.json|playwright-results\.json)$/i);
    if (nested?.[1] && !isReportNoise(nested[1])) roots.add(nested[1]);
  }
  return [...roots];
}

function pickRunRoot(roots: string[]): { root: string | null; ignored: number } {
  if (!roots.length) return { root: null, ignored: 0 };
  if (roots.length === 1) return { root: roots[0]!, ignored: 0 };
  const usable = roots.filter((root) => !/(^|\/)latest$/i.test(root));
  const stamps = usable
    .filter((root) => /\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(root))
    .sort();
  const chosen = (stamps.length ? stamps : usable.sort()).at(-1) ?? roots[0]!;
  return { root: chosen, ignored: roots.length - 1 };
}

function filesInRun(files: PackageFile[], root: string | null): PackageFile[] {
  return files.filter((file) => {
    const path = normalizePath(file.relativePath);
    if (isReportNoise(path)) return false;
    if (root == null || root === "") return true;
    return path === root || path.startsWith(`${root}/`);
  });
}

function playwrightJsonScore(relativePath: string): number {
  const base = normalizePath(relativePath).split("/").pop() ?? "";
  if (/^results\.json$/i.test(base)) return 0;
  if (/^playwright-results\.json$/i.test(base)) return 1;
  return 2;
}

export function parseExecutionPackage(files: PackageFile[]): NormalizedExecution {
  const issues: ValidationIssue[] = [];
  const run = pickRunRoot(detectRunRoots(files));
  const scoped = filesInRun(files, run.root);
  if (run.ignored > 0 && run.root) {
    issues.push({
      severity: "info",
      code: "MULTI_RUN_PACKAGE",
      message: `Package contained ${run.ignored + 1} Playwright run folders. Imported only ${run.root}. Zip reports/latest (one iteration) instead of the whole reports/ directory.`,
    });
  }

  const jsonFiles = findFiles(scoped, (path) => path.endsWith(".json"));
  const logFiles = findFiles(scoped, (path) => path.endsWith(".log")).sort((a, b) =>
    normalizePath(a.relativePath).localeCompare(normalizePath(b.relativePath)),
  );
  const videoFiles = findFiles(scoped, (path) => path.endsWith(".webm") || path.endsWith(".mp4"));
  const screenshotFiles = findFiles(
    scoped,
    (path) => path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg"),
  );
  const traceFiles = findFiles(scoped, (path) => /(^|\/)trace\.zip$/i.test(path) || path.endsWith("trace.zip"));
  const otherFiles = scoped.filter((file) => {
    const path = normalizePath(file.relativePath).toLowerCase();
    return !path.endsWith(".json") && !path.endsWith(".log") && !path.endsWith(".webm") && !path.endsWith(".mp4") && !path.endsWith(".png");
  });

  if (!jsonFiles.length && !logFiles.length) {
    issues.push({
      severity: "error",
      code: "PACKAGE_EMPTY",
      message: "Execution package has no JSON results or log files.",
    });
  }

  let metadata: ExecutionMetadata = {};
  const metadataFile = jsonFiles.find((file) => /metadata\.json$/i.test(normalizePath(file.relativePath)));
  if (metadataFile?.content) {
    const parsed = parseJsonFile(metadataFile);
    const rec = asRecord(parsed);
    if (rec && !rec.__parseError) {
      metadata = {
        name: pickString(rec, ["name", "executionName"]),
        startedAt: pickString(rec, ["startedAt", "started_at", "startTime"]),
        finishedAt: pickString(rec, ["finishedAt", "finished_at", "endTime"]),
        browser: pickString(rec, ["browser"]),
        environment: pickString(rec, ["environment", "env"]),
        branch: pickString(rec, ["branch"]),
        commitSha: pickString(rec, ["commit", "commitSha", "sha", "commit_sha"]),
        pipeline: pickString(rec, ["pipeline", "pipelineId"]),
        ciProvider: pickString(rec, ["ci", "ciProvider", "provider"]),
        projectName: pickString(rec, ["project", "projectName"]),
        baseUrl: pickString(rec, ["baseUrl", "base_url"]),
      };
    }
  }
  if (!metadata.name && run.root) {
    metadata.name = run.root.split("/").filter(Boolean).at(-1);
  }

  let testCases: NormalizedTestCase[] = [];
  let artifacts: NormalizedArtifact[] = [];
  let sourceFormat = "unknown";
  let rawJson: unknown;

  const playwrightFile = [...jsonFiles]
    .sort((a, b) => playwrightJsonScore(a.relativePath) - playwrightJsonScore(b.relativePath))
    .find((file) => isPlaywrightJson(parseJsonFile(file)));

  const nativeDocs = jsonFiles
    .filter((file) => {
      const path = normalizePath(file.relativePath);
      if (/metadata\.json$/i.test(path)) return false;
      if (playwrightFile && normalizePath(playwrightFile.relativePath) === path) return false;
      return true;
    })
    .map((file) => ({ file, parsed: parseJsonFile(file) }))
    .filter((item) => item.parsed && !(asRecord(item.parsed)?.__parseError) && isNativeTestCaseDocument(item.parsed));

  for (const jsonFile of jsonFiles) {
    const parsed = parseJsonFile(jsonFile);
    if (asRecord(parsed)?.__parseError) {
      issues.push({
        severity: "error",
        code: "JSON_INVALID",
        message: `Could not parse JSON file ${jsonFile.relativePath}.`,
        path: jsonFile.relativePath,
      });
    }
  }

  let playwrightCases: NormalizedTestCase[] = [];
  if (playwrightFile) {
    const parsed = parseJsonFile(playwrightFile);
    rawJson = parsed;
    const result = parsePlaywrightJson(parsed);
    playwrightCases = result.testCases;
    artifacts = result.artifacts;
    issues.push(...result.issues);
    metadata = {
      ...metadata,
      browser: metadata.browser ?? result.metadata.browser,
      playwrightVersion: result.metadata.playwrightVersion,
      workers: result.metadata.workers,
    };
  }

  if (nativeDocs.length) {
    const native = parseNativeTestCaseDocuments(nativeDocs.map((item) => item.parsed));
    issues.push(...native.issues);
    testCases = attachPlaywrightToNative(native.testCases, playwrightCases);
    sourceFormat = playwrightFile ? "playwright-json+testcase-native" : "testcase-native";
    rawJson = nativeDocs.length === 1 ? nativeDocs[0]?.parsed : nativeDocs.map((item) => item.parsed);
  } else if (playwrightCases.length) {
    testCases = playwrightCases;
    sourceFormat = "playwright-json";
  }

  if (!playwrightFile && !nativeDocs.length) {
    const resultsFile = jsonFiles.find((file) => /results\.json$/i.test(normalizePath(file.relativePath))) ?? jsonFiles[0];
    if (resultsFile) {
      const parsed = parseJsonFile(resultsFile);
      const rec = asRecord(parsed);
      if (rec && Array.isArray(rec.tests ?? rec.results ?? rec.testCases)) {
        issues.push({
          severity: "warning",
          code: "FORMAT_GENERIC",
          message: "JSON did not match Playwright or TestCase-native schemas. Attempted generic mapping.",
          path: resultsFile.relativePath,
        });
        sourceFormat = "generic-json";
        rawJson = parsed;
      }
    }
  }

  const logs = logFiles.flatMap((file, index) => {
    const prior = logFiles.slice(0, index).reduce((sum, item) => sum + (item.content ?? "").split("\n").length, 0);
    const hint = normalizePath(file.relativePath).split("/").pop()?.replace(/\.log$/i, "");
    return parseLogText(file.content ?? "", hint).map((line) => ({ ...line, lineNumber: line.lineNumber + prior }));
  });
  issues.push(...logValidation(logs));

  const packagePaths = scoped.map((file) => normalizePath(file.relativePath));
  artifacts = artifacts.map((artifact) => {
    const remapped = remapArtifactPath(artifact.path, packagePaths);
    return remapped ? { ...artifact, path: remapped } : artifact;
  });

  const fileArtifacts: NormalizedArtifact[] = scoped
    .filter((file) => !normalizePath(file.relativePath).toLowerCase().endsWith(".json"))
    .map((file) => {
      const relative = normalizePath(file.relativePath);
      const name = relative.split("/").pop() ?? file.relativePath;
      return {
        kind: guessKind(file.relativePath),
        name: uniqueRecordingName(relative, name),
        path: relative,
        size: file.size ?? file.buffer?.byteLength,
      };
    });

  artifacts = associateArtifacts(
    [...artifacts, ...fileArtifacts],
    testCases.flatMap((item) => item.testPoints.map((point) => point.id)),
    testCases.map((item) => item.id),
    testCases.map((item) => ({ id: item.id, name: item.name })),
  );

  bindArtifactsToCases(artifacts, testCases);

  for (const artifact of artifacts.filter((item) => item.kind === "video" || item.kind === "trace")) {
    const owner =
      testCases.find((item) => item.id === artifact.testCaseId) ??
      testCases.find((item) => item.testPoints.some((point) => point.id === artifact.testPointId));
    if (owner) shareRecordingsWithAllPoints(owner, [artifact]);
  }

  const packagePathList = packagePaths;
  const missingRecordings = artifacts.filter((artifact) => {
    if (artifact.kind !== "video" && artifact.kind !== "trace") return false;
    return !recordingPresent(artifact.path, packagePathList);
  });
  if (missingRecordings.length) {
    issues.push({
      severity: "warning",
      code: "TRACE_MISSING_ON_DISK",
      message: `${missingRecordings.length} Playwright video/trace attachment(s) are listed in JSON but the files are not in the package. Include this run's artifacts/ (or test-results/) folder. Zip reports/latest with npm run pack:execution.`,
    });
  }

  if (!videoFiles.length && !traceFiles.length) {
    issues.push({
      severity: "info",
      code: "NO_VIDEOS",
      message: "No video or trace.zip files were found. Playwright often stores the screencast inside trace.zip.",
    });
  } else if (!videoFiles.length && traceFiles.length) {
    issues.push({
      severity: "info",
      code: "TRACE_SCREENCAST",
      message: `${traceFiles.length} Playwright trace.zip file(s) found. Screencast frames and any embedded videos will be extracted.`,
    });
  }

  const startedAt =
    metadata.startedAt ??
    testCases.map((item) => item.startedAt).filter(Boolean).sort()[0];
  const durationMs =
    metadata.durationMs ?? testCases.reduce((sum, item) => sum + item.durationMs, 0);

  const validation: ValidationReport = {
    ok: !issues.some((issue) => issue.severity === "error"),
    format: sourceFormat,
    issues,
    detected: {
      jsonFiles: jsonFiles.length,
      logFiles: logFiles.length,
      videos: videoFiles.length,
      screenshots: screenshotFiles.length,
      traces: traceFiles.length,
      other: otherFiles.length,
    },
  };

  return {
    sourceFormat,
    metadata: { ...metadata, startedAt, durationMs },
    testCases,
    logs,
    artifacts,
    rawJson,
    validation,
  };
}
