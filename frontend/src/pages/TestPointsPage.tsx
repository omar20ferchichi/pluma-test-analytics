import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";
import { formatDuration, formatPct } from "../lib/format";

export function TestPointsPage() {
  const projectId = useProjectId();
  const [q, setQ] = useState("");
  const { data, loading, error } = useApi<any>(projectId ? `/api/testpoints${qs({ projectId, q })}` : null, [projectId, q]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">TestPoint explorer</h1>
      <input className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" placeholder="TP id, description, Jira…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.items ?? []).map((item: any) => (
            <Link key={item.id} to={`/testpoints/${item.externalId}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-mint-500/40">
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono text-mint-400">{item.externalId}</div>
                <StatusBadge status={item.latest?.status} />
              </div>
              <div className="mt-2 text-sm">{item.description}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                <span>{item.testCase?.name}</span>
                {item.ticketId ? <span>Jira {item.ticketId}</span> : null}
                <span>{formatDuration(item.latest?.durationMs)}</span>
                <span>{formatPct(item.passRate)} pass</span>
              </div>
              <HistoryDots history={item.history ?? []} />
              <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                {item.flags?.newFailure ? <Flag>New failure</Flag> : null}
                {item.flags?.regression ? <Flag>Regression</Flag> : null}
                {item.flags?.flaky ? <Flag>Flaky</Flag> : null}
                {item.flags?.slowdown ? <Flag>Slowdown</Flag> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryDots({ history }: { history: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {history.map((status, i) => (
        <span
          key={i}
          title={status}
          className={`h-2.5 w-2.5 rounded-full ${status === "passed" || status === "flaky" ? "bg-mint-500" : status === "failed" || status === "timedOut" ? "bg-rose-400" : "bg-slate-500"}`}
        />
      ))}
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-200">{children}</span>;
}
