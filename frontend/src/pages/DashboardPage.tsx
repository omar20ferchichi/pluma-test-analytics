import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, BarChart, Bar } from "recharts";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { formatDuration, formatPct } from "../lib/format";
import { qs } from "../lib/api";

export function DashboardPage() {
  const projectId = useProjectId();
  const { data, loading, error } = useApi<any>(projectId ? `/api/dashboard${qs({ projectId })}` : null, [projectId]);
  if (loading) return <LoadingState label="Loading dashboard" />;
  if (error) return <ErrorState message={error} />;
  const latest = data?.latest;
  if (!latest) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Execution dashboard</h1>
        <p className="text-slate-400">Import a Playwright execution package to populate TestCase stats.</p>
        <Link className="mt-4 inline-block text-mint-400" to="/import">Go to import →</Link>
      </div>
    );
  }
  const donut = [
    { name: "Passed", value: latest.passed, color: "#2ee6a6" },
    { name: "Failed", value: latest.failed, color: "#ff5d73" },
    { name: "Skipped", value: latest.skipped, color: "#94a3b8" },
    { name: "Flaky", value: latest.flaky, color: "#c084fc" },
  ].filter((item) => item.value > 0);
  const trend = (data.executions ?? []).map((item: any) => ({
    name: `#${item.sequentialId}`,
    pass: Math.round(item.passRate * 1000) / 10,
    fail: item.failed,
    duration: Math.round(item.durationMs / 1000),
    quality: item.qualityScore,
  }));
  const tickets = Object.entries(data.byTicket ?? {}).map(([name, value]) => ({ name, value }));
  const envs = Object.entries(data.byEnv ?? {}).map(([name, value]) => ({ name, value }));
  const browsers = Object.entries(data.byBrowser ?? {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Execution dashboard</h1>
          <p className="text-sm text-slate-400">
            Latest run #{latest.sequentialId} · {latest.environment} · {latest.browser} · quality {latest.qualityScore}
          </p>
        </div>
        <Link to={`/executions/${latest.id}`} className="rounded-lg bg-mint-500 px-4 py-2 text-sm font-semibold text-ink-950">
          Open execution
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="TestCases" value={latest.totalTests} />
        <Stat label="Passed" value={latest.passed} tone="mint" />
        <Stat label="Failed" value={latest.failed} tone="rose" />
        <Stat label="Pass rate" value={formatPct(latest.passRate)} />
        <Stat label="Duration" value={formatDuration(latest.durationMs)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Pass / fail">
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={3}>
                  {donut.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Pass rate trend" className="xl:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Line type="monotone" dataKey="pass" stroke="#2ee6a6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="quality" stroke="#5b8cff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Failures">
          <MiniBars data={trend} dataKey="fail" color="#ff5d73" />
        </Card>
        <Card title="Duration (s)">
          <MiniBars data={trend} dataKey="duration" color="#5b8cff" />
        </Card>
        <Card title="Failures by Jira">
          <MiniBars data={tickets} dataKey="value" color="#fbbf24" nameKey="name" />
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most frequent failing TestCases">
          <ul className="space-y-2">
            {(data.frequentFails ?? []).map((item: any) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <Link className="truncate font-mono text-mint-400" to={`/executions/${latest.id}`}>{item.id}</Link>
                <span className="min-w-0 truncate text-slate-400">{item.description}</span>
                <StatusBadge status={item.fails ? "failed" : "passed"} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Slowest TestCases">
          <ul className="space-y-2">
            {(data.slowest ?? []).map((item: any) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <Link className="truncate font-mono text-mint-400" to={`/executions/${latest.id}`}>{item.id}</Link>
                <span>{formatDuration(item.duration)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Failures by environment">
          <MiniBars data={envs} dataKey="value" color="#fb7185" nameKey="name" />
        </Card>
        <Card title="Failures by browser">
          <MiniBars data={browsers} dataKey="value" color="#38bdf8" nameKey="name" />
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "mint" | "rose" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === "rose" ? "text-rose-300" : tone === "mint" ? "text-mint-400" : ""}`}>{value}</div>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </section>
  );
}

function MiniBars({ data, dataKey, color, nameKey = "name" }: { data: any[]; dataKey: string; color: string; nameKey?: string }) {
  return (
    <div className="h-44">
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey={nameKey} stroke="#64748b" hide={data.length > 8} />
          <Tooltip />
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
