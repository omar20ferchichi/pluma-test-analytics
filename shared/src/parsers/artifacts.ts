import type { NormalizedArtifact } from "../types.js";
import { GENERIC_TESTPOINT_IDS } from "../types.js";
import { slugify } from "../normalize.js";

const VIDEO_EXT = /\.(webm|mp4|ogg)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const TP_IN_NAME = /(TP[A-Z0-9._-]*)/i;

export function guessKind(relativePath: string): NormalizedArtifact["kind"] {
  const lower = relativePath.toLowerCase();
  if (VIDEO_EXT.test(lower)) return "video";
  if (IMAGE_EXT.test(lower)) return "screenshot";
  if (lower.endsWith(".log")) return "log";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".har")) return "har";
  if (lower.endsWith(".html")) return "html-report";
  if (lower.endsWith(".xml")) return "junit";
  if (/(^|\/)trace\.zip$/i.test(lower) || lower.endsWith(".trace") || /\/trace\/.*\.zip$/i.test(lower)) return "trace";
  if (lower.includes("allure")) return "allure";
  return "other";
}

export function testPointIdFromFilename(filename: string): string | undefined {
  const base = filename.split("/").pop() ?? filename;
  const stem = base.replace(/\.[^.]+$/, "");
  const match = stem.match(TP_IN_NAME);
  if (match?.[1] && !GENERIC_TESTPOINT_IDS.has(match[1])) return match[1];
  if (/^tp[-_]/i.test(stem)) return stem.toUpperCase();
  return undefined;
}

/** Longest id whose slug appears in the path wins, so short/first TestCases do not steal later recordings. */
export function bestSlugMatch(ids: string[], haystack: string): string | undefined {
  const slug = slugify(haystack);
  const lower = haystack.toLowerCase();
  let best: string | undefined;
  let bestLen = 0;
  for (const id of ids) {
    if (!id || GENERIC_TESTPOINT_IDS.has(id)) continue;
    const idSlug = slugify(id);
    if (idSlug.length < 4) continue;
    const hit = slug.includes(idSlug) || lower.includes(id.toLowerCase());
    if (hit && idSlug.length > bestLen) {
      best = id;
      bestLen = idSlug.length;
    }
  }
  return best;
}

const CASE_KEY_RE = /\b([A-Za-z]{2,8}-\d{1,4})\b/g;
const GENERIC_RECORDING_NAME = /^(trace(\.zip)?|video(\.webm|\.mp4)?)$/i;

export function uniqueRecordingName(path: string, name: string): string {
  const base = (name.split("/").pop() ?? name).trim() || "artifact";
  if (!GENERIC_RECORDING_NAME.test(base)) return base;
  const folder = path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").slice(-2, -1)[0];
  return folder ? `${folder}/${base}` : base;
}

export function caseKeysInPath(path: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of path.matchAll(CASE_KEY_RE)) {
    const key = match[1]!.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function matchCaseFromArtifactPath(
  path: string,
  cases: Array<{ id: string; name?: string }>,
): string | undefined {
  if (!cases.length) return undefined;
  const ids = cases.map((item) => item.id);
  const names = cases.map((item) => item.name).filter((item): item is string => Boolean(item));
  const slugHit = bestSlugMatch([...ids, ...names], path);
  if (slugHit) {
    const byId = cases.find((item) => item.id === slugHit);
    if (byId) return byId.id;
    const byName = cases.find((item) => item.name === slugHit);
    if (byName) return byName.id;
  }

  const keys = caseKeysInPath(path);
  let best: { id: string; score: number } | undefined;
  for (const item of cases) {
    const idUpper = item.id.toUpperCase();
    const nameUpper = (item.name ?? "").toUpperCase();
    let score = 0;
    for (const key of keys) {
      if (idUpper === key || idUpper.startsWith(`${key}_`) || idUpper.startsWith(`${key}-`)) score += 100 + key.length;
      else if (nameUpper.startsWith(key) || nameUpper.includes(`${key} `) || nameUpper.includes(`${key}_`)) score += 50 + key.length;
      else if (idUpper.includes(key) || nameUpper.includes(key)) score += 20 + key.length;
    }
    if (score && (!best || score > best.score)) best = { id: item.id, score };
    else if (best && score === best.score && score > 0) best = { id: "", score }; // tie
  }
  return best?.id || undefined;
}

export function associateArtifacts(
  artifacts: NormalizedArtifact[],
  testPointIds: string[],
  testCaseIds: string[],
  testCases?: Array<{ id: string; name?: string }>,
): NormalizedArtifact[] {
  const pointSet = new Set(testPointIds.map((id) => id.toLowerCase()));
  const caseSet = new Set(testCaseIds.map((id) => id.toLowerCase()));
  const caseRows = testCases?.length ? testCases : testCaseIds.map((id) => ({ id }));

  return artifacts.map((artifact) => {
    let next = artifact;
    if (!next.testPointId) {
      const fromName = testPointIdFromFilename(artifact.path);
      if (fromName && pointSet.has(fromName.toLowerCase())) {
        next = { ...next, testPointId: testPointIds.find((id) => id.toLowerCase() === fromName.toLowerCase()) };
      } else {
        const pointHit = bestSlugMatch(testPointIds, artifact.path);
        if (pointHit) next = { ...next, testPointId: pointHit };
      }
    }
    const knownCase = next.testCaseId && caseSet.has(next.testCaseId.toLowerCase());
    if (!knownCase) {
      const caseHit = matchCaseFromArtifactPath(next.path, caseRows) ?? bestSlugMatch(testCaseIds, next.path);
      if (caseHit) next = { ...next, testCaseId: caseHit };
    }
    if ((next.kind === "video" || next.kind === "trace") && next.path) {
      next = { ...next, name: uniqueRecordingName(next.path, next.name) };
    }
    return next;
  });
}
