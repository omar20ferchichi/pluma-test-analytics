import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { api, qs } from "../lib/api";
import { formatDate, formatDuration, formatPct, shortSha } from "../lib/format";

export function ExecutionsPage() {
  const projectId = useProjectId();
  const [q, setQ] = useState("");
  const [env, setEnv] = useState("");
  const { data, loading, error, reload } = useApi<any>(
    projectId ? `/api/executions${qs({ projectId, q, environment: env, limit: 50 })}` : null,
    [projectId, q, env],
  );

  async function remove(id: string) {
    if (!confirm("Delete this execution?")) return;
    await api(`/api/executions/${id}`, { method: "DELETE" });
    reload();
  }

  async function archive(id: string) {
    await api(`/api/executions/${id}/archive`, { method: "POST" });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Execution history</h1>
          <p className="text-sm text-slate-400">Search, filter, compare, archive.</p>
        </div>
        <Link to="/import" className="rounded-lg bg-mint-500 px-4 py-2 text-sm font-semibold text-ink-950">Import</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" placeholder="Search branch, SHA, name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" placeholder="Environment" value={env} onChange={(e) => setEnv(e.target.value)} />
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : (
        <div className="overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
              <tr>
                {["ID", "When", "Branch", "SHA", "Env", "Browser", "Duration", "TestCases", "Pass", "Fail", "Skip", "Pass rate", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((row: any) => (
                <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 font-mono"><Link className="text-mint-400" to={`/executions/${row.id}`}>#{row.sequentialId}</Link></td>
                  <td className="px-3 py-2 text-slate-400">{formatDate(row.startedAt)}</td>
                  <td className="px-3 py-2">{row.branch ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{shortSha(row.commitSha)}</td>
                  <td className="px-3 py-2">{row.environment ?? "—"}</td>
                  <td className="px-3 py-2">{row.browser ?? "—"}</td>
                  <td className="px-3 py-2">{formatDuration(row.durationMs)}</td>
                  <td className="px-3 py-2">{row.totalTests}</td>
                  <td className="px-3 py-2 text-mint-400">{row.passed}</td>
                  <td className="px-3 py-2 text-rose-300">{row.failed}</td>
                  <td className="px-3 py-2">{row.skipped}</td>
                  <td className="px-3 py-2"><StatusBadge status={row.failed ? "failed" : "passed"} /> {formatPct(row.passRate)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link className="mr-2 text-xs text-slate-400 hover:text-white" to={`/compare?current=${row.id}`}>Compare</Link>
                    <button className="mr-2 text-xs text-slate-400" onClick={() => archive(row.id)}>Archive</button>
                    <button className="text-xs text-rose-300" onClick={() => remove(row.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
