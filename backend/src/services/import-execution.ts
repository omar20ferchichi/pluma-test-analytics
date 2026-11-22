import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  clusterFailures,
  computeQualityScore,
  parseExecutionPackage,
  remapArtifactPath,
  rollupCaseStatus,
  summarizeExecution,
  uniqueRecordingName,
  type PackageFile,
} from "@qa/shared";
import { prisma } from "../lib/prisma.js";
import { id } from "../lib/ids.js";
import { artifactDir, copyStoredFile, ensureDir, safeJoin, writeStoredFile } from "../lib/storage.js";
import { extractPlaywrightTraces } from "./extract-traces.js";
import { maxJsonBytes, maxLogBytes, maxUploadBytes, tooLargeMessage, uploadLimitLabel } from "../lib/upload-limits.js";
import { groupResultsIntoTestCases } from "../lib/case-tree.js";
import { bindUnlinkedRecordings } from "../lib/execution-stats.js";

const TEXT_EXT = /\.(json|log|txt|xml|html|md|csv|har)$/i;

function isViewerAsset(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)html\//.test(normalized) || /(^|\/)playwright-report\//.test(normalized);
}

function zipReadError(error: unknown): never {
  throw Object.assign(
    new Error(`Could not read ZIP: ${(error as Error).message}. Upload an execution ZIP, not a random archive.`),
    { statusCode: 400 },
  );
}

function extractZipTo(zip: AdmZip, dest: string) {
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (entry.entryName.includes("..")) continue;
    const relativePath = entry.entryName.replace(/^\/+/, "").replace(/\\/g, "/");
    if (isViewerAsset(relativePath)) continue;
    const target = safeJoin(dest, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.getData());
  }
}

function extractZipPath(zipPath: string, dest: string) {
  try {
    extractZipTo(new AdmZip(zipPath), dest);
  } catch (error) {
    zipReadError(error);
  }
}

function extractZipBuffer(buffer: Buffer, dest: string) {
  try {
    extractZipTo(new AdmZip(buffer), dest);
  } catch (error) {
    zipReadError(error);
  }
}

async function walkPackageDir(root: string): Promise<PackageFile[]> {
  const files: PackageFile[] = [];

  async function walk(current: string, rel = "") {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, nextRel);
        continue;
      }
      if (isViewerAsset(nextRel)) continue;
      const info = await stat(full);
      const file: PackageFile = { relativePath: nextRel.replace(/\\/g, "/"), size: info.size };
      if (TEXT_EXT.test(nextRel) && info.size <= maxLogBytes()) {
        file.content = await readFile(full, "utf8");
      }
      files.push(file);
    }
  }

  await walk(root);
  return files;
}

async function filesFromDirListing(
  files: Array<{ relativePath: string; buffer: Buffer }>,
): Promise<PackageFile[]> {
  return files.map((file) => ({
    relativePath: file.relativePath.replace(/\\/g, "/"),
    buffer: file.buffer,
    size: file.buffer.length,
    content: TEXT_EXT.test(file.relativePath) && file.buffer.length <= maxLogBytes()
      ? file.buffer.toString("utf8")
      : undefined,
  })).filter((file) => !isViewerAsset(file.relativePath));
}

export async function importExecution(options: {
  projectId: string;
  files?: Array<{ relativePath: string; buffer: Buffer }>;
  zip?: Buffer;
  zipPath?: string;
  metadata?: Record<string, string | undefined>;
}) {
  const project = await prisma.project.findUnique({ where: { id: options.projectId } });
  if (!project) {
    throw Object.assign(
      new Error("Selected project no longer exists. Pick Pluma E2E in the header and import again."),
      { statusCode: 404 },
    );
  }

  const last = await prisma.execution.findFirst({
    where: { projectId: options.projectId },
    orderBy: { sequentialId: "desc" },
    select: { sequentialId: true },
  });
  const sequentialId = (last?.sequentialId ?? 100) + 1;
  const executionId = id("ex");
  const storeRoot = artifactDir(options.projectId, executionId);
  await ensureDir(storeRoot);

  let packageFiles: PackageFile[];
  try {
    if (options.zipPath) {
      extractZipPath(options.zipPath, storeRoot);
      packageFiles = await walkPackageDir(storeRoot);
    } else if (options.zip) {
      extractZipBuffer(options.zip, storeRoot);
      packageFiles = await walkPackageDir(storeRoot);
    } else {
      packageFiles = await filesFromDirListing(options.files ?? []);
      for (const file of packageFiles) {
        if (file.buffer) await writeStoredFile(storeRoot, file.relativePath, Buffer.from(file.buffer));
      }
    }
  } catch (error) {
    await rm(storeRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  if (!packageFiles.length) {
    await rm(storeRoot, { recursive: true, force: true }).catch(() => undefined);
    throw Object.assign(new Error("Empty execution package"), { statusCode: 400 });
  }

  const oversized = packageFiles.find((file) => (file.size ?? 0) > maxUploadBytes());
  if (oversized) {
    await rm(storeRoot, { recursive: true, force: true }).catch(() => undefined);
    throw Object.assign(new Error(`File too large: ${oversized.relativePath}. ${tooLargeMessage()}`), { statusCode: 413 });
  }

  const jsonTooBig = packageFiles.find(
    (file) => file.relativePath.toLowerCase().endsWith(".json") && (file.size ?? 0) > maxJsonBytes(),
  );
  if (jsonTooBig) {
    await rm(storeRoot, { recursive: true, force: true }).catch(() => undefined);
    throw Object.assign(
      new Error(`JSON results file exceeds ${uploadLimitLabel(maxJsonBytes())} limit`),
      { statusCode: 413 },
    );
  }

  const parsedOnce = parseExecutionPackage(packageFiles);
  const hydrated = await hydrateAttachmentFiles(packageFiles, parsedOnce, storeRoot);
  const parsed = hydrated === packageFiles ? parsedOnce : parseExecutionPackage(hydrated);
  if (options.metadata) {
    parsed.metadata = { ...parsed.metadata, ...options.metadata };
  }

  const summary = summarizeExecution(parsed);
  const clusters = clusterFailures(parsed);

  if (parsed.rawJson) {
    await writeFile(path.join(storeRoot, "_normalized.json"), JSON.stringify(parsed.rawJson, null, 2));
  }

  const previous = await prisma.execution.findMany({
    where: { projectId: options.projectId, archivedAt: null },
    orderBy: { sequentialId: "desc" },
    take: 8,
    include: { results: { include: { testPoint: { include: { testCase: true } }, testCase: true } } },
  });

  const prevStatus = new Map(
    (previous[0] ? groupResultsIntoTestCases(previous[0].results) : []).map((item) => [item.id, item.status]),
  );
  let regressions = 0;
  for (const testCase of parsed.testCases) {
    const status = rollupCaseStatus(testCase.testPoints.map((point) => point.status));
    if ((status === "failed" || status === "timedOut") && prevStatus.get(testCase.id) === "passed") {
      regressions += 1;
    }
  }

  const quality = computeQualityScore({
    passRate: summary.passRate,
    failed: summary.failed,
    criticalFailures: clusters
      .filter((cluster) => cluster.category === "Environment Issue")
      .reduce((sum, cluster) => sum + cluster.testCaseIds.length, 0),
    regressions,
    flakinessScore: summary.flaky / Math.max(1, summary.totalTests),
    performanceRegressions: 0,
    coverageScore: summary.totalTests > 0 ? 1 : 0,
  });

  const startedAt = parsed.metadata.startedAt ? new Date(parsed.metadata.startedAt) : new Date();

  await prisma.execution.create({
    data: {
      id: executionId,
      projectId: options.projectId,
      sequentialId,
      status: parsed.validation.ok ? "ready" : "imported_with_warnings",
      sourceFormat: parsed.sourceFormat,
      name: parsed.metadata.name ?? `Execution #${sequentialId}`,
      startedAt,
      finishedAt: parsed.metadata.finishedAt ? new Date(parsed.metadata.finishedAt) : new Date(),
      durationMs: Math.round(summary.totalDurationMs),
      browser: parsed.metadata.browser,
      environment: parsed.metadata.environment,
      branch: parsed.metadata.branch,
      commitSha: parsed.metadata.commitSha,
      pipeline: parsed.metadata.pipeline,
      ciProvider: parsed.metadata.ciProvider,
      totalTests: summary.totalTests,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      flaky: summary.flaky,
      blocked: summary.blocked,
      passRate: summary.passRate,
      qualityScore: quality.score,
      validationJson: JSON.stringify(parsed.validation),
      metadataJson: JSON.stringify(parsed.metadata),
      rawJsonPath: path.join(storeRoot, "_normalized.json"),
    },
  });

  // test_entretien reuses TestPoints across test cases (e.g. a cleanup step in every E2E case) and
  // repeats them inside one case, so every occurrence is stored. Lookups prefer the failing one.
  const resultIdByPoint = new Map<string, { id: string; failed: boolean }>();
  const resultIdByCasePoint = new Map<string, { id: string; failed: boolean }>();
  const remember = (map: Map<string, { id: string; failed: boolean }>, key: string, id: string, failed: boolean) => {
    const prev = map.get(key);
    if (!prev || (failed && !prev.failed)) map.set(key, { id, failed });
  };
  const resultFor = (testPointId?: string, testCaseId?: string) => {
    if (!testPointId) return undefined;
    return (testCaseId ? resultIdByCasePoint.get(`${testCaseId}::${testPointId}`)?.id : undefined) ?? resultIdByPoint.get(testPointId)?.id;
  };
  let sortIndex = 0;

  for (const testCase of parsed.testCases) {
    const caseRow = await prisma.testCase.upsert({
      where: { projectId_externalId: { projectId: options.projectId, externalId: testCase.id } },
      update: { name: testCase.name, ticketId: testCase.ticketId },
      create: {
        id: id("tc"),
        projectId: options.projectId,
        externalId: testCase.id,
        name: testCase.name,
        ticketId: testCase.ticketId,
      },
    });

    if (testCase.ticketId) {
      await prisma.jiraTicket.upsert({
        where: { projectId_key: { projectId: options.projectId, key: testCase.ticketId } },
        update: {},
        create: { id: id("jira"), projectId: options.projectId, key: testCase.ticketId },
      });
    }

    for (const point of testCase.testPoints) {
      const pointRow = await prisma.testPoint.upsert({
        where: { projectId_externalId: { projectId: options.projectId, externalId: point.id } },
        update: {
          description: point.description,
          ticketId: point.ticketId,
          testCaseId: caseRow.id,
        },
        create: {
          id: id("tp"),
          projectId: options.projectId,
          externalId: point.id,
          description: point.description,
          ticketId: point.ticketId,
          testCaseId: caseRow.id,
        },
      });

      if (point.ticketId) {
        await prisma.jiraTicket.upsert({
          where: { projectId_key: { projectId: options.projectId, key: point.ticketId } },
          update: {},
          create: { id: id("jira"), projectId: options.projectId, key: point.ticketId },
        });
      }

      const resultId = id("tr");
      const isFailure = point.status === "failed" || point.status === "timedOut";
      remember(resultIdByPoint, point.id, resultId, isFailure);
      remember(resultIdByCasePoint, `${testCase.id}::${point.id}`, resultId, isFailure);
      remember(resultIdByCasePoint, `${testCase.name}::${point.id}`, resultId, isFailure);
      sortIndex += 1;
      await prisma.testResult.create({
        data: {
          id: resultId,
          executionId,
          testPointId: pointRow.id,
          testCaseId: caseRow.id,
          status: point.status,
          description: point.description,
          durationMs: Math.round(point.durationMs || 0),
          startedAt: point.startedAt ? new Date(point.startedAt) : startedAt,
          retries: point.retries,
          browser: point.browser ?? parsed.metadata.browser,
          environment: point.environment ?? parsed.metadata.environment,
          errorMessage: point.error?.message,
          stackTrace: point.error?.stack,
          lastSuccessfulStep: point.lastSuccessfulStep,
          failureCategory: point.error?.category,
          failureFingerprint: point.error?.fingerprint,
          rawJson: JSON.stringify(point.raw ?? {}),
          sortIndex,
        },
      });

      if (point.status === "failed" || point.status === "timedOut") {
        await prisma.failure.create({
          data: {
            id: id("fail"),
            executionId,
            resultId,
            testPointId: pointRow.id,
            category: point.error?.category ?? "Unknown",
            fingerprint: point.error?.fingerprint ?? "unknown-error",
            message: point.error?.message ?? "Unknown error",
            stackTrace: point.error?.stack,
          },
        });
      }
    }
  }

  for (const cluster of clusters) {
    await prisma.failureClusterRow.create({
      data: {
        id: id("cl"),
        executionId,
        fingerprint: cluster.fingerprint,
        category: cluster.category,
        sampleMessage: cluster.sampleMessage,
        count: cluster.count,
        testPointIds: JSON.stringify(cluster.testPointIds),
        testCaseIds: JSON.stringify(cluster.testCaseIds),
      },
    });
  }

  const pointCatalog = await prisma.testPoint.findMany({ where: { projectId: options.projectId } });
  const byExternal = new Map(pointCatalog.map((row) => [row.externalId, row.id]));

  for (const line of parsed.logs) {
    const tpId = line.testPointId ? byExternal.get(line.testPointId) : undefined;
    await prisma.logLine.create({
      data: {
        id: id("log"),
        executionId,
        testPointId: tpId,
        resultId: resultFor(line.testPointId, line.testCaseId),
        lineNumber: line.lineNumber,
        timestamp: line.timestamp ? new Date(line.timestamp) : null,
        level: line.level,
        message: line.message.slice(0, 8000),
        stackTrace: line.stackTrace?.slice(0, 12000),
      },
    });
  }

  const seen = new Set<string>();
  const storedRels = hydrated.map((file) => file.relativePath.replace(/\\/g, "/"));
  for (const artifact of parsed.artifacts) {
    const key = artifact.path.replace(/\\/g, "/");
    if (seen.has(key)) continue;
    seen.add(key);
    const relative = remapArtifactPath(key, storedRels) ?? (storedRels.includes(key) ? key : undefined);
    if (!relative) continue;
    const stored = path.join(storeRoot, relative);
    if (!existsSync(stored)) continue;
    const resultId = resultFor(artifact.testPointId, artifact.testCaseId);
    await prisma.artifact.create({
      data: {
        id: id("art"),
        executionId,
        resultId,
        kind: artifact.kind,
        name: uniqueRecordingName(relative, artifact.name),
        storagePath: stored,
        contentType: artifact.contentType,
        size: artifact.size ?? 0,
        testPointExternalId: artifact.testPointId,
      },
    });
  }

  await extractPlaywrightTraces(executionId).catch((error) => {
    parsed.validation.issues.push({
      severity: "warning",
      code: "TRACE_EXTRACT_FAILED",
      message: `Imported results, but could not unpack Playwright traces: ${(error as Error).message}`,
    });
  });
  await bindUnlinkedRecordings(executionId);

  return {
    executionId,
    sequentialId,
    summary,
    quality: quality.score,
    validation: parsed.validation,
  };
}

async function hydrateAttachmentFiles(
  files: PackageFile[],
  parsed: ReturnType<typeof parseExecutionPackage>,
  storeRoot: string,
): Promise<PackageFile[]> {
  const extra: PackageFile[] = [];
  for (const artifact of parsed.artifacts) {
    const abs = artifact.path.replace(/\\/g, "/");
    if (!abs.startsWith("/")) continue;
    const already = files.some((file) => abs.endsWith(file.relativePath.replace(/\\/g, "/")));
    if (already || !existsSync(artifact.path)) continue;
    const info = await stat(artifact.path);
    if (info.size > maxUploadBytes()) continue;
    const rel = `external/${abs.split("/").filter(Boolean).slice(-4).join("/")}`;
    await copyStoredFile(storeRoot, rel, artifact.path);
    extra.push({ relativePath: rel, size: info.size });
  }
  return extra.length ? [...files, ...extra] : files;
}

export async function readPackageFromDisk(dir: string): Promise<PackageFile[]> {
  return walkPackageDir(dir);
}
