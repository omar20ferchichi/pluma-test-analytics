import { useMemo } from "react";
import { traceViewerSrc } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { VideoPlayer } from "./VideoPlayer";

export function Screencast({
  resultId,
  videoArtifactId,
  traceArtifactId,
  title,
  durationMs,
  fill = false,
}: {
  resultId?: string | null;
  videoArtifactId?: string | null;
  traceArtifactId?: string | null;
  title?: string;
  durationMs?: number;
  fill?: boolean;
}) {
  const skipFetch = Boolean(traceArtifactId || videoArtifactId);
  const { data, loading } = useApi<any>(
    !skipFetch && resultId ? `/api/test-results/${resultId}/screencast` : null,
    [resultId, skipFetch],
  );
  const zipId = traceArtifactId || data?.zipArtifactId;
  const videoId = videoArtifactId || data?.videoArtifactId;

  if (zipId) {
    return <TraceViewerFrame artifactId={zipId} title={title} fill={fill} />;
  }
  if (videoId) {
    return <VideoPlayer artifactId={videoId} title={title} durationMs={durationMs} fill={fill} />;
  }
  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-white/10 bg-black/40 text-sm text-slate-400">
        Loading Playwright trace…
      </div>
    );
  }
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-white/10 bg-black/40 p-6 text-center text-sm text-slate-400">
      No Playwright trace for this TestPoint. Import the execution with <code>test-results/**/trace.zip</code>.
    </div>
  );
}

function TraceViewerFrame({ artifactId, title, fill }: { artifactId: string; title?: string; fill?: boolean }) {
  const src = useMemo(() => traceViewerSrc(artifactId), [artifactId]);
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-[#1e1e1e] ${fill ? "h-full min-h-0" : ""}`}>
      <iframe
        key={artifactId}
        title={title ?? "Playwright Trace Viewer"}
        src={src}
        className={`w-full border-0 bg-[#1e1e1e] ${fill ? "h-full" : "h-[min(62vh,640px)]"}`}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
