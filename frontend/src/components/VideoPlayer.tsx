import { artifactUrl } from "../lib/api";
import { formatDuration } from "../lib/format";

export function VideoPlayer({
  artifactId,
  title,
  durationMs,
  fill = false,
}: {
  artifactId?: string | null;
  title?: string;
  durationMs?: number;
  fill?: boolean;
}) {
  if (!artifactId) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-white/10 bg-black/40 text-sm text-slate-400 ${fill ? "h-full min-h-0" : "aspect-video"}`}>
        No video retained for this TestPoint
      </div>
    );
  }
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black ${fill ? "h-full min-h-0" : ""}`}>
      <video
        className={`w-full ${fill ? "min-h-0 flex-1 object-contain" : "aspect-video"}`}
        controls
        preload="metadata"
        src={artifactUrl(artifactId)}
      />
      <div className="flex shrink-0 items-center justify-between px-3 py-2 text-xs text-slate-400">
        <span>{title ?? "Playwright video"}</span>
        <span className="flex items-center gap-3">
          {durationMs != null ? formatDuration(durationMs) : null}
        </span>
      </div>
    </div>
  );
}
