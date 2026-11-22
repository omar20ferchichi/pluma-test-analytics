import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useProjectId } from "../components/Layout";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";
import { formatDuration } from "../lib/format";
import { Card } from "./DashboardPage";

export function PerformancePage() {
  const projectId = useProjectId();
  const { data, loading, error } = useApi<any>(projectId ? `/api/performance${qs({ projectId })}` : null, [projectId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const dist = (data.distribution ?? []).slice(0, 40).map((ms: number, i: number) => ({ i, ms }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Performance analytics</h1>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Average" value={formatDuration(data.stats?.average)} />
        <Stat label="Median" value={formatDuration(data.stats?.median)} />
        <Stat label="P95" value={formatDuration(data.stats?.p95)} />
        <Stat label="Suite total" value={formatDuration(data.stats?.total)} />
      </div>
      <Card title="Duration distribution">
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart data={dist}><XAxis dataKey="i" hide /><Tooltip /><Bar dataKey="ms" fill="#5b8cff" /></BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Duration regressions">
        {(data.regressions ?? []).length ? data.regressions.map((row: any) => (
          <div key={row.testCaseId || row.testPointId} className="flex justify-between border-b border-white/5 py-2 text-sm">
            <span className="font-mono text-mint-400">{row.name || row.testCaseId || row.testPointId}</span>
            <span>{formatDuration(row.previousMs)} → {formatDuration(row.currentMs)} (+{Math.round(row.deltaPct)}%)</span>
          </div>
        )) : <p className="text-sm text-slate-400">No significant slowdowns vs previous execution.</p>}
      </Card>
      <Card title="Slowest TestCases">
        {(data.slowest ?? []).map((row: any) => (
          <div key={row.id} className="flex justify-between py-1 text-sm">
            <Link className="font-mono text-mint-400" to={data.latestId ? `/executions/${data.latestId}` : "/executions"}>{row.name || row.id}</Link>
            <span>{formatDuration(row.durationMs)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
