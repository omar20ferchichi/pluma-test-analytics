import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { Screencast } from "../components/Screencast";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";
import { formatDate, formatDuration } from "../lib/format";

export function VideosPage() {
  const projectId = useProjectId();
  const [params, setParams] = useSearchParams();
  const list = useApi<any>(projectId ? `/api/executions${qs({ projectId, limit: 20 })}` : null, [projectId]);
  const executions = list.data?.items ?? [];
  const executionId = params.get("execution") || executions[0]?.id;
  const videos = useApi<any>(executionId ? `/api/executions/${executionId}/videos` : null, [executionId]);
  const [failedOnly, setFailedOnly] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const rawItems = videos.data?.items ?? [];
  const items = useMemo(
    () => rawItems.filter((item: any) => !failedOnly || item.result?.status === "failed"),
    [rawItems, failedOnly],
  );
  const cases = useMemo(() => groupByTestCase(items), [items]);
  const artifactId = params.get("artifact");
  const caseId = params.get("case");

  useEffect(() => {
    const fromArtifact = items.find((item: any) => item.id === artifactId);
    const fromCase = cases.find((item) => item.id === caseId)
      ?? cases.find((item) => item.name === caseId);
    const next = fromArtifact || fromCase?.recordings[0] || (caseId ? null : items[0]) || null;
    setActive(next);
    const expandId = fromCase?.id ?? cases.find((item) => item.recordings.some((row) => row.id === next?.id))?.id;
    if (expandId) setOpen((current) => ({ ...current, [expandId]: true }));
  }, [items, cases, artifactId, caseId]);

  function chooseExecution(id: string) {
    setParams({ execution: id }, { replace: true });
    setActive(null);
    setOpen({});
  }

  function chooseRecording(item: any, caseId: string) {
    setActive(item);
    setOpen((current) => ({ ...current, [caseId]: true }));
    const next = new URLSearchParams();
    if (executionId) next.set("execution", executionId);
    next.set("case", caseId);
    next.set("artifact", item.id);
    setParams(next, { replace: true });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Video & trace center</h1>
          <p className="text-sm text-slate-400">Pick a TestCase, then a recording. Playwright video and trace.zip play in the platform.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-lg border border-white/10 bg-ink-800 px-3 py-1.5 text-sm"
            value={executionId ?? ""}
            onChange={(e) => chooseExecution(e.target.value)}
          >
            {executions.map((item: any) => (
              <option key={item.id} value={item.id}>
                #{item.sequentialId} · {item.name || item.environment || "execution"}
              </option>
            ))}
          </select>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} /> Failed only</label>
        </div>
      </div>
      {videos.loading ? <LoadingState /> : videos.error ? <ErrorState message={videos.error} /> : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(280px,380px)_1fr]">
          <div className="min-h-0 overflow-auto rounded-2xl border border-white/10">
            {cases.map((item) => {
              const expanded = open[item.id] ?? item.status === "failed";
              return (
                <div key={item.id} className="border-b border-white/5 last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                    onClick={() => {
                      const next = !expanded;
                      setOpen((current) => ({ ...current, [item.id]: next }));
                      if (next && item.recordings[0] && active?.id !== item.recordings[0].id) {
                        chooseRecording(item.recordings[0], item.id);
                      }
                    }}
                  >
                    {expanded ? <ChevronDown size={14} className="shrink-0 text-slate-500" /> : <ChevronRight size={14} className="shrink-0 text-slate-500" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] uppercase text-slate-500">TestCase {item.id}</div>
                      <div className="truncate text-sm font-medium">{item.name}</div>
                    </div>
                    <span className="text-[11px] text-slate-500">{item.recordings.length}</span>
                    <StatusBadge status={item.status} />
                  </button>
                  {expanded ? (
                    <ul className="pb-2">
                      {item.recordings.map((row: any) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-2 pl-9 text-left text-sm hover:bg-white/[0.03] ${active?.id === row.id ? "bg-mint-500/10" : ""}`}
                            onClick={() => chooseRecording(row, item.id)}
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-mint-400">{row.testPointExternalId || row.result?.testPoint?.externalId}</span>
                            <span className="text-[11px] text-slate-500">{row.kind === "trace" ? "trace" : "video"}</span>
                            <StatusBadge status={row.result?.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
            {!cases.length ? <p className="p-6 text-sm text-slate-400">No videos or trace.zip files in this execution. Import the Playwright test-results folder (including trace.zip) with the package.</p> : null}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            {active ? (
              <>
                <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {active.result?.testCase?.name || active.result?.testPoint?.testCase?.name || "TestCase"}
                    {" · "}
                    {formatDate(active.result?.startedAt)}
                    {" · "}
                    {formatDuration(active.result?.durationMs)}
                  </span>
                  {active.result?.testPoint ? (
                    <Link className="text-sm text-mint-400" to={`/testpoints/${active.result.testPoint.externalId}`}>Open TestPoint</Link>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1">
                  <Screencast
                    fill
                    resultId={active.result?.id}
                    videoArtifactId={active.kind === "video" ? active.id : undefined}
                    traceArtifactId={active.kind === "trace" ? active.id : undefined}
                    title={active.name}
                    durationMs={active.result?.durationMs}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                {caseId
                  ? "No video or trace is stored for this TestCase. Import the Playwright test-results folder (including trace.zip / video) with the package."
                  : "Select a TestCase to watch its recording."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function groupByTestCase(items: any[]) {
  const map = new Map<string, { id: string; name: string; status: string; recordings: any[] }>();
  for (const item of items) {
    const parent = item.result?.testCase ?? item.result?.testPoint?.testCase;
    const folder = String(item.storagePath ?? "")
      .replace(/\\/g, "/")
      .split("/")
      .slice(-2, -1)[0];
    const id = parent?.externalId ?? parent?.name ?? item.testPointExternalId ?? folder ?? item.id;
    const name = parent?.name ?? parent?.externalId ?? item.result?.testPoint?.description ?? folder ?? item.name ?? id;
    const group = map.get(id) ?? { id, name, status: "passed", recordings: [] as any[] };
    group.recordings.push(item);
    const status = item.result?.status;
    if (status === "failed" || status === "timedOut") group.status = "failed";
    else if (group.status !== "failed" && status && status !== "passed") group.status = status;
    map.set(id, group);
  }
  return [...map.values()];
}
