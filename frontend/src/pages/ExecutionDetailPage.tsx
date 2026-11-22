import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { formatDate, formatDuration, formatPct } from "../lib/format";
import { Card } from "./DashboardPage";

export function ExecutionDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useApi<any>(id ? `/api/executions/${id}` : null, [id]);
  const results = useApi<any>(id ? `/api/executions/${id}/results` : null, [id]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cases = useMemo(() => groupByTestCase(results.data?.items ?? [], id), [results.data, id]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const ex = data.execution;
  const validation = data.validation;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Execution</div>
          <h1 className="text-2xl font-semibold">#{ex.sequentialId} · {ex.name}</h1>
          <p className="text-sm text-slate-400">{ex.branch} · {ex.commitSha} · {ex.environment} · {ex.browser}</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm" to={`/compare?current=${ex.id}`}>Compare</Link>
          <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm" to={`/failures?execution=${ex.id}`}>Failures</Link>
          <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm" to={`/videos?execution=${ex.id}`}>Videos</Link>
          <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm" to={`/reports?execution=${ex.id}`}>Qualification report</Link>
          <Link className="rounded-lg bg-mint-500 px-3 py-2 text-sm font-semibold text-ink-950" to={`/logs?execution=${ex.id}`}>Logs</Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Mini label="Quality" value={ex.qualityScore} />
        <Mini label="Pass rate" value={formatPct(ex.passRate)} />
        <Mini label="TestCases" value={cases.length} />
        <Mini label="Passed" value={ex.passed} />
        <Mini label="Failed" value={ex.failed} />
        <Mini label="Duration" value={formatDuration(ex.durationMs)} />
        <Mini label="Started" value={formatDate(ex.startedAt)} />
      </div>
      {validation?.issues?.length ? (
        <Card title="Import validation">
          <ul className="space-y-1 text-sm">
            {validation.issues.map((issue: any, i: number) => (
              <li key={i} className={issue.severity === "error" ? "text-rose-300" : issue.severity === "warning" ? "text-amber-300" : "text-slate-400"}>
                [{issue.severity}] {issue.code}: {issue.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="space-y-2">
        {cases.map((item) => {
          const expanded = open[item.id] ?? item.status === "failed";
          return (
            <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10">
              <div className="flex items-center gap-3 bg-white/[0.03] px-4 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setOpen((current) => ({ ...current, [item.id]: !expanded }))}
                >
                  {expanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] uppercase text-slate-500">TestCase {item.id}</div>
                    <div className="truncate font-medium">{item.name}</div>
                  </div>
                </button>
                <span className="text-xs text-slate-500">{item.steps.length} TestPoints</span>
                {item.watchHref ? (
                  <Link className="shrink-0 rounded-md border border-mint-500/30 px-2 py-1 text-xs text-mint-400" to={item.watchHref}>
                    Watch
                  </Link>
                ) : null}
                <StatusBadge status={item.status} />
                <span className="w-16 text-right text-xs text-slate-400">{formatDuration(item.durationMs)}</span>
              </div>
              {expanded ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
                    <tr>
                      {["TestPoint", "Status", "Duration", "Category", "Jira", "Recording"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {item.steps.map((row: any) => (
                      <tr key={row.resultId} className="border-t border-white/5">
                        <td className="px-3 py-2">
                          <Link className="font-mono text-mint-400" to={`/testpoints/${row.id}`}>{row.id}</Link>
                          <div className="text-xs text-slate-400">{row.name}</div>
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                        <td className="px-3 py-2">{formatDuration(row.durationMs)}</td>
                        <td className="px-3 py-2 text-slate-400">{row.category ?? "—"}</td>
                        <td className="px-3 py-2">{row.ticketId ?? "—"}</td>
                        <td className="px-3 py-2">
                          {row.watchHref ? <Link to={row.watchHref} className="mr-2 text-xs text-mint-400">Watch</Link> : <span className="mr-2 text-xs text-slate-600">—</span>}
                          <Link to={`/results/${row.resultId}`} className="text-xs text-mint-400">Details</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByTestCase(items: any[], executionId?: string) {
  const ordered = [...items].sort((a, b) => {
    const byIndex = (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER);
    if (byIndex) return byIndex;
    return new Date(a.startedAt ?? 0).getTime() - new Date(b.startedAt ?? 0).getTime();
  });
  const map = new Map<string, any[]>();
  for (const row of ordered) {
    const parent = row.testCase ?? row.testPoint?.testCase;
    const key = parent?.id ?? parent?.externalId ?? `tp:${row.testPoint?.id}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.values()].map((rows) => {
    const first = rows[0];
    const parent = first.testCase ?? first.testPoint?.testCase;
    const execId = executionId ?? first.executionId;
    const seen = new Set<string>();
    const steps = [];
    for (const row of rows) {
      const id = row.testPoint?.externalId;
      // Repeated TestPoints (reload, cleanup) are real steps: dedupe by result, not TestPoint id.
      if (!id || seen.has(row.id)) continue;
      seen.add(row.id);
      const artifacts = row.artifacts ?? [];
      const videoId = artifacts.find((item: any) => item.kind === "video")?.id;
      const traceId = artifacts.find((item: any) => item.kind === "trace" || item.name?.endsWith("trace.zip"))?.id;
      const artifactId = traceId || videoId;
      const caseId = parent?.externalId ?? id;
      steps.push({
        id,
        name: row.description ?? row.testPoint?.description,
        status: row.status,
        durationMs: row.durationMs,
        category: row.failureCategory,
        ticketId: row.testPoint?.ticketId,
        resultId: row.id,
        artifactId,
        watchHref: null,
      });
    }
    const failed = steps.some((step: any) => step.status === "failed" || step.status === "timedOut");
    const caseId = parent?.externalId ?? first.testPoint?.externalId;
    const caseWatch = execId && caseId
      ? `/videos?execution=${execId}&case=${encodeURIComponent(caseId)}`
      : null;
    const sharedArtifactId = steps.find((step: any) => step.artifactId)?.artifactId;
    return {
      id: caseId,
      name: parent?.name ?? first.testPoint?.description,
      status: failed ? "failed" : steps.every((step: any) => step.status === "passed") ? "passed" : first.status,
      durationMs: steps.reduce((sum: number, step: any) => sum + (step.durationMs ?? 0), 0),
      watchHref: caseWatch,
      steps: steps.map((step: any) => ({
        ...step,
        watchHref: caseWatch
          ? (step.artifactId || sharedArtifactId)
            ? `${caseWatch}&artifact=${step.artifactId || sharedArtifactId}`
            : caseWatch
          : null,
      })),
    };
  });
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
