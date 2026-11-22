import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { Screencast } from "../components/Screencast";
import { useApi } from "../hooks/useApi";
import { api, qs } from "../lib/api";
import { formatDuration } from "../lib/format";

const CATEGORIES = [
  "Assertion Failure", "Timeout", "Element Not Found", "Network Error", "Authentication",
  "API Failure", "Database/Data Issue", "Environment Issue", "Navigation Failure", "Unknown",
];

export function FailuresPage() {
  const projectId = useProjectId();
  const [params] = useSearchParams();
  const executions = useApi<any>(projectId ? `/api/executions${qs({ projectId, limit: 8 })}` : null, [projectId]);
  const executionId = params.get("execution") || executions.data?.items?.[0]?.id;
  const failures = useApi<any>(executionId ? `/api/executions/${executionId}/failures` : null, [executionId]);
  const clusters = useApi<any>(executionId ? `/api/executions/${executionId}/clusters` : null, [executionId]);
  const ai = useApi<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [category, setCategory] = useState("");

  const filtered = useMemo(() => {
    const items = failures.data?.items ?? [];
    if (!category) return items;
    return items.filter((item: any) => (item.manualCategory || item.category) === category);
  }, [failures.data, category]);

  async function reclassify(id: string, next: string) {
    await api(`/api/failures/${id}/reclassify`, { method: "POST", body: JSON.stringify({ category: next }) });
    failures.reload();
    clusters.reload();
  }

  async function runAi() {
    if (!executionId) return;
    const res = await api<any>(`/api/executions/${executionId}/ai-analysis`, { method: "POST" });
    ai.setData(res);
  }

  if (executions.loading) return <LoadingState />;
  if (executions.error) return <ErrorState message={executions.error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Failure Analysis Center</h1>
          <p className="text-sm text-slate-400">Cluster first, then open the TestPoint, video, and logs.</p>
        </div>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={runAi}>Optional AI summary</button>
      </div>
      {ai.data ? (
        <div className="rounded-2xl border border-dashed border-mint-500/30 bg-mint-500/5 p-4 text-sm">
          <div className="text-xs uppercase text-mint-400">AI layer (not a test result)</div>
          <p className="mt-2">{ai.data.deterministicSummary?.headline || ai.data.notice}</p>
          <ul className="mt-2 list-disc pl-5 text-slate-300">
            {(ai.data.deterministicSummary?.investigation ?? []).map((item: string) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {(clusters.data?.items ?? []).map((cluster: any, i: number) => (
            <button key={cluster.id} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-rose-400/40" onClick={() => setCategory(cluster.category)}>
              <div className="text-xs text-slate-500">Cluster #{i + 1} · {cluster.count} tests</div>
              <div className="mt-1 font-medium">{cluster.sampleMessage}</div>
              <div className="mt-1 text-xs text-rose-300">{cluster.category}</div>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          {failures.loading ? <LoadingState /> : (
            <div className="overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
                  <tr>{["TestPoint", "TestCase", "Reason", "Duration", "Retry", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map((item: any) => (
                    <tr key={item.id} className="border-t border-white/5 hover:bg-white/[0.03]" onClick={() => setSelected(item)}>
                      <td className="px-3 py-2 font-mono"><Link className="text-mint-400" to={`/testpoints/${item.result.testPoint.externalId}`}>{item.result.testPoint.externalId}</Link></td>
                      <td className="px-3 py-2">{item.result.testCase?.name}</td>
                      <td className="px-3 py-2">
                        <div className="text-rose-300">{item.manualCategory || item.category}</div>
                        <div className="max-w-xl truncate text-xs text-slate-400">{item.message}</div>
                      </td>
                      <td className="px-3 py-2">{formatDuration(item.result.durationMs)}</td>
                      <td className="px-3 py-2">{item.result.retries}</td>
                      <td className="px-3 py-2"><StatusBadge status="failed" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {selected ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div>
            <h2 className="font-mono text-mint-400">{selected.result.testPoint.externalId}</h2>
            <p className="text-sm">{selected.message}</p>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-400">{selected.stackTrace}</pre>
            <label className="mt-3 block text-sm">
              Reclassify
              <select className="mt-1 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2" defaultValue={selected.category} onChange={(e) => reclassify(selected.id, e.target.value)}>
                {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <Screencast
            resultId={selected.result.id}
            videoArtifactId={selected.result.artifacts?.find((a: any) => a.kind === "video")?.id}
            traceArtifactId={selected.result.artifacts?.find((a: any) => a.kind === "trace" || a.name?.endsWith("trace.zip"))?.id}
            title={selected.result.testPoint.externalId}
          />
        </div>
      ) : null}
    </div>
  );
}
