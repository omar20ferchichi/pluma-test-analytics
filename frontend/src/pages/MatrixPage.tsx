import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";
import { formatDate, formatDuration, formatPct } from "../lib/format";

export function MatrixPage() {
  const projectId = useProjectId();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("id");
  const { data, loading, error } = useApi<any>(projectId ? `/api/testpoints${qs({ projectId, q })}` : null, [projectId, q]);
  const rows = useMemo(() => {
    const items = [...(data?.items ?? [])];
    items.sort((a: any, b: any) => {
      if (sort === "fail") return b.failureCount - a.failureCount;
      if (sort === "duration") return (b.latest?.durationMs ?? 0) - (a.latest?.durationMs ?? 0);
      if (sort === "pass") return a.passRate - b.passRate;
      return String(a.externalId).localeCompare(String(b.externalId));
    });
    return items;
  }, [data, sort]);

  function exportCsv() {
    const header = "TestPoint,Status,Duration,Last Run,Pass Rate,Failures\n";
    const body = rows.map((row: any) => [row.externalId, row.latest?.status, row.latest?.durationMs, row.latest?.startedAt, row.passRate, row.failureCount].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "testpoint-matrix.csv";
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">TestPoint matrix</h1>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="flex gap-2">
        <input className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="id">Sort by ID</option>
          <option value="fail">Sort by failures</option>
          <option value="duration">Sort by duration</option>
          <option value="pass">Sort by pass rate</option>
        </select>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : (
        <div className="overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
              <tr>{["TestPoint", "Status", "Duration", "Last run", "Pass rate", "Failures"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono"><Link className="text-mint-400" to={`/testpoints/${row.externalId}`}>{row.externalId}</Link></td>
                  <td className="px-3 py-2"><StatusBadge status={row.latest?.status} /></td>
                  <td className="px-3 py-2 text-right">{formatDuration(row.latest?.durationMs)}</td>
                  <td className="px-3 py-2">{formatDate(row.latest?.startedAt)}</td>
                  <td className="px-3 py-2 text-right">{formatPct(row.passRate)}</td>
                  <td className="px-3 py-2 text-right">{row.failureCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
