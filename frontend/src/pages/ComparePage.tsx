import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";
import { formatDuration, formatPct } from "../lib/format";
import { Card } from "./DashboardPage";

export function ComparePage() {
  const projectId = useProjectId();
  const [params, setParams] = useSearchParams();
  const list = useApi<any>(projectId ? `/api/executions${qs({ projectId, limit: 20 })}` : null, [projectId]);
  const current = params.get("current") || list.data?.items?.[0]?.id;
  const previous = params.get("previous") || list.data?.items?.[1]?.id;
  const cmp = useApi<any>(current && previous ? `/api/executions/${current}/compare/${previous}` : null, [current, previous]);
  const delta = cmp.data?.delta;
  const items = list.data?.items ?? [];

  const rows = useMemo(() => ([
    ["TestCases", delta?.previous.totalTests, delta?.current.totalTests],
    ["Passed", delta?.previous.passed, delta?.current.passed],
    ["Failed", delta?.previous.failed, delta?.current.failed],
    ["Pass rate", formatPct(delta?.previous.passRate), formatPct(delta?.current.passRate)],
  ]), [delta]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Execution comparison</h1>
      <div className="flex flex-wrap gap-3">
        <Select label="Previous" value={previous ?? ""} items={items} onChange={(v) => setParams({ current: current ?? "", previous: v })} />
        <Select label="Current" value={current ?? ""} items={items} onChange={(v) => setParams({ current: v, previous: previous ?? "" })} />
      </div>
      {cmp.loading ? <LoadingState /> : cmp.error ? <ErrorState message={cmp.error} /> : delta ? (
        <>
          <div className="overflow-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
                <tr><th className="px-3 py-2"></th><th>Previous</th><th>Current</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row[0]} className="border-t border-white/5"><td className="px-3 py-2 text-slate-400">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <List title={`New failures (${delta.newFailures.length})`} items={delta.newFailures} />
            <List title={`Fixed (${delta.fixedFailures.length})`} items={delta.fixedFailures} />
            <List title={`Still failing (${delta.stillFailing.length})`} items={delta.stillFailing} />
          </div>
          <Card title="Performance regressions">
            {(delta.performanceRegressions ?? []).length ? delta.performanceRegressions.map((row: any) => (
              <div key={row.testCaseId || row.testPointId} className="flex justify-between border-b border-white/5 py-2 text-sm">
                <span className="font-mono text-mint-400">{row.testCaseId || row.testPointId}</span>
                <span>{formatDuration(row.previousMs)} → {formatDuration(row.currentMs)} ({Math.round(row.deltaPct)}%)</span>
              </div>
            )) : <p className="text-sm text-slate-400">None</p>}
          </Card>
        </>
      ) : <p className="text-slate-400">Select two executions.</p>}
    </div>
  );
}

function Select({ label, value, items, onChange }: { label: string; value: string; items: any[]; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      {label}
      <select className="ml-2 rounded-lg border border-white/10 bg-ink-800 px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((item) => <option key={item.id} value={item.id}>#{item.sequentialId} {item.name}</option>)}
      </select>
    </label>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <Card title={title}>
      <ul className="space-y-1 font-mono text-sm">
        {items.length ? items.map((id) => <li key={id} className="text-mint-400">{id}</li>) : <li className="text-slate-500">None</li>}
      </ul>
    </Card>
  );
}
