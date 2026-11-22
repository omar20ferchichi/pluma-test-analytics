import { Link, useParams } from "react-router-dom";
import { JsonReport } from "../components/JsonReport";
import { LogViewer } from "../components/LogViewer";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { Screencast } from "../components/Screencast";
import { useApi } from "../hooks/useApi";
import { artifactUrl } from "../lib/api";
import { formatDate, formatDuration } from "../lib/format";
import { HistoryDots } from "./TestPointsPage";
import { Card } from "./DashboardPage";

export function TestPointDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useApi<any>(id ? `/api/testpoints/${id}` : null, [id]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const tp = data.testPoint;
  const latest = tp.results[0];
  const video = latest?.artifacts?.find((a: any) => a.kind === "video");
  const shots = latest?.artifacts?.filter((a: any) => a.kind === "screenshot") ?? [];
  const caseRecording = data.testCaseRun?.steps?.find((step: any) => step.videoArtifactId || step.traceArtifactId);
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm text-slate-500">TestPoint</div>
        <h1 className="font-mono text-2xl text-mint-400">{tp.externalId}</h1>
        <p className="text-slate-300">{tp.description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Status" value={<StatusBadge status={latest?.status} />} />
        <Meta label="TestCase" value={tp.testCase?.name ?? "—"} />
        <Meta label="Jira" value={tp.ticketId ?? "—"} />
        <Meta label="Duration" value={formatDuration(latest?.durationMs)} />
        <Meta label="Browser" value={latest?.browser ?? "—"} />
        <Meta label="Environment" value={latest?.environment ?? "—"} />
        <Meta label="Retries" value={latest?.retries ?? 0} />
        <Meta label="Last run" value={formatDate(latest?.startedAt)} />
      </div>
      <HistoryDots history={[...tp.results].reverse().map((r: any) => r.status)} />
      <div className="flex flex-wrap gap-2 text-xs">
        {data.flags?.newFailure ? <span className="rounded-full bg-rose-500/20 px-2 py-1">New failure</span> : null}
        {data.flags?.regression ? <span className="rounded-full bg-amber-500/20 px-2 py-1">Regression</span> : null}
        {data.flags?.flaky ? <span className="rounded-full bg-violet-500/20 px-2 py-1">Flaky</span> : null}
        {data.flags?.slowdown ? <span className="rounded-full bg-orange-500/20 px-2 py-1">Slowdown</span> : null}
      </div>
      <Card title="Playwright trace">
        {latest?.executionId || latest?.execution?.id ? (
          <div className="mb-2">
            <Link
              className="text-sm text-mint-400"
              to={`/videos?execution=${latest.executionId ?? latest.execution?.id}&case=${encodeURIComponent(tp.testCase?.externalId ?? "")}`}
            >
              Watch full TestCase
            </Link>
          </div>
        ) : null}
        <Screencast
          resultId={latest?.id}
          videoArtifactId={video?.id ?? caseRecording?.videoArtifactId}
          traceArtifactId={latest?.artifacts?.find((a: any) => a.kind === "trace" || a.name?.endsWith("trace.zip"))?.id ?? caseRecording?.traceArtifactId}
          title={tp.externalId}
          durationMs={latest?.durationMs}
        />
      </Card>
      <Card title="Failure">
        {latest?.errorMessage ? (
          <div>
            <div className="text-sm text-rose-300">{latest.failureCategory}</div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-rose-100/80">{latest.errorMessage}</pre>
            {latest.stackTrace ? <details className="mt-2"><summary className="cursor-pointer text-sm">Stack</summary><pre className="whitespace-pre-wrap text-xs">{latest.stackTrace}</pre></details> : null}
            {latest.lastSuccessfulStep ? <p className="mt-2 text-sm text-slate-400">Last successful step: {latest.lastSuccessfulStep}</p> : null}
          </div>
        ) : <p className="text-sm text-slate-400">No failure on the latest run.</p>}
      </Card>
      <Card title="Timeline">
        <ol className="space-y-2 text-sm">
          {(latest?.logs ?? []).slice(0, 30).map((line: any) => (
            <li key={line.id} className="flex gap-3">
              <span className="w-16 font-mono text-xs text-slate-500">{line.level}</span>
              <span>{line.message}</span>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Logs">
        <LogViewer lines={latest?.logs ?? []} />
      </Card>
      <JsonReport cases={data.testCaseRun ? [data.testCaseRun] : undefined} executionId={latest?.executionId ?? latest?.execution?.id} value={latest?.rawJson} title="JSON report — full TestCase" />
      {shots.length ? (
        <Card title="Screenshots">
          <div className="grid gap-3 md:grid-cols-2">
            {shots.map((shot: any) => (
              <img key={shot.id} src={artifactUrl(shot.id)} alt={shot.name} className="rounded-lg border border-white/10" />
            ))}
          </div>
        </Card>
      ) : null}
      <Card title="History">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Run</th><th>Status</th><th>Duration</th></tr></thead>
            <tbody>
              {tp.results.map((row: any) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="py-2"><Link className="text-mint-400" to={`/executions/${row.execution.id}`}>#{row.execution.sequentialId}</Link></td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{formatDuration(row.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
