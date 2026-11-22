import { useProjectId } from "../components/Layout";
import { Card } from "./DashboardPage";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { formatPct } from "../lib/format";
import { qs } from "../lib/api";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ExecutivePage() {
  const projectId = useProjectId();
  const { data, loading, error } = useApi<any>(projectId ? `/api/executive${qs({ projectId })}` : null, [projectId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const latest = data?.latest;
  const trend = (data?.trend ?? []).map((item: any) => ({
    name: `#${item.id}`,
    quality: item.qualityScore,
    pass: Math.round(item.passRate * 100),
    failed: item.failed,
  }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Executive summary</h1>
        <p className="text-sm text-slate-400">Quality, stability, and regression trend without raw logs.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Score label="Quality score" value={latest?.qualityScore ?? "—"} />
        <Score label="Pass rate" value={formatPct(latest?.passRate)} />
        <Score label="Failed TestCases" value={latest?.failed ?? 0} />
        <Score label="Stability" value={formatPct(data?.stability)} />
      </div>
      <Card title="Quality trend">
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={trend}>
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Line dataKey="quality" stroke="#2ee6a6" strokeWidth={2} />
              <Line dataKey="pass" stroke="#5b8cff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Score({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-mint-500/10 to-transparent p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-4xl font-semibold text-mint-400">{value}</div>
    </div>
  );
}
