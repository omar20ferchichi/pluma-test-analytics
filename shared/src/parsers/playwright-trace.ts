export interface TraceAction {
  callId: string;
  title: string;
  className?: string;
  method?: string;
  startTime: number;
  endTime?: number;
  error?: string;
}

export interface TraceFrameMeta {
  sha1: string;
  timestamp: number;
  width: number;
  height: number;
  pageId?: string;
}

export interface ParsedPlaywrightTrace {
  frames: TraceFrameMeta[];
  actions: TraceAction[];
  startTime: number;
  endTime: number;
}

export function parsePlaywrightTraceEvents(traceText: string): ParsedPlaywrightTrace {
  const frames: TraceFrameMeta[] = [];
  const before = new Map<string, TraceAction>();
  const actions: TraceAction[] = [];
  let startTime = Number.POSITIVE_INFINITY;
  let endTime = 0;

  for (const rawLine of traceText.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = String(event.type ?? "");
    if (type === "screencast-frame" && typeof event.sha1 === "string") {
      const timestamp = Number(event.timestamp ?? event.frameSwapWallTime ?? 0);
      frames.push({
        sha1: event.sha1,
        timestamp,
        width: Number(event.width ?? 0),
        height: Number(event.height ?? 0),
        pageId: typeof event.pageId === "string" ? event.pageId : undefined,
      });
      startTime = Math.min(startTime, timestamp);
      endTime = Math.max(endTime, timestamp);
    }
    if (type === "before" && typeof event.callId === "string") {
      const className = typeof event.class === "string" ? event.class : undefined;
      const method = typeof event.method === "string" ? event.method : undefined;
      const title =
        (typeof event.title === "string" && event.title) ||
        [className, method].filter(Boolean).join(".") ||
        event.callId;
      const action: TraceAction = {
        callId: event.callId,
        title,
        className,
        method,
        startTime: Number(event.startTime ?? 0),
      };
      before.set(event.callId, action);
      startTime = Math.min(startTime, action.startTime || startTime);
    }
    if (type === "after" && typeof event.callId === "string") {
      const existing = before.get(event.callId);
      const errorObj = event.error as { error?: { message?: string }; message?: string } | undefined;
      const error = errorObj?.error?.message || errorObj?.message;
      if (existing) {
        existing.endTime = Number(event.endTime ?? existing.startTime);
        existing.error = error;
        actions.push(existing);
        endTime = Math.max(endTime, existing.endTime ?? 0);
      }
    }
  }

  frames.sort((a, b) => a.timestamp - b.timestamp);
  actions.sort((a, b) => a.startTime - b.startTime);
  if (!Number.isFinite(startTime)) startTime = 0;
  return { frames, actions, startTime, endTime };
}

export function sampleTraceFrames(frames: TraceFrameMeta[], max = 300): TraceFrameMeta[] {
  if (frames.length <= max) return frames;
  const step = frames.length / max;
  const sampled: TraceFrameMeta[] = [];
  for (let i = 0; i < max; i += 1) {
    sampled.push(frames[Math.min(frames.length - 1, Math.floor(i * step))]!);
  }
  const last = frames[frames.length - 1]!;
  if (sampled[sampled.length - 1]?.sha1 !== last.sha1) sampled.push(last);
  return sampled;
}

export function remapArtifactPath(absolutePath: string, packagePaths: string[]): string | undefined {
  const abs = absolutePath.replace(/\\/g, "/");
  const exact = packagePaths.find((rel) => abs.endsWith(rel) || abs.endsWith(`/${rel}`));
  if (exact) return exact;
  const parent = abs.split("/").slice(-2).join("/");
  const parentHit = packagePaths.find((rel) => rel.endsWith(parent) || rel.endsWith(`/${parent}`));
  if (parentHit) return parentHit;
  const base = abs.split("/").pop();
  if (!base) return undefined;
  const sameName = packagePaths.filter((rel) => rel.split("/").pop() === base);
  if (sameName.length === 1) return sameName[0];
  const folder = abs.split("/").slice(-2, -1)[0];
  if (folder && sameName.length > 1) {
    const folderHits = sameName.filter((rel) => rel.includes(`/${folder}/`) || rel.endsWith(`/${folder}/${base}`));
    if (folderHits.length === 1) return folderHits[0];
    let best: string | undefined;
    let bestLen = 0;
    for (const rel of sameName) {
      const normalized = rel.replace(/\\/g, "/");
      if (abs.endsWith(normalized) && normalized.length > bestLen) {
        best = rel;
        bestLen = normalized.length;
      }
    }
    if (best) return best;
  }
  return undefined;
}
