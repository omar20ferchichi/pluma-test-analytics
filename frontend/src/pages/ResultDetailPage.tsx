import { Link, useParams } from "react-router-dom";
import { JsonReport } from "../components/JsonReport";
import { LogViewer } from "../components/LogViewer";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { Screencast } from "../components/Screencast";
import { useApi } from "../hooks/useApi";
import { Card } from "./DashboardPage";
import { formatDuration } from "../lib/format";

export function ResultDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useApi<any>(id ? `/api/test-results/${id}` : null, [id]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const r = data.result;
  const video = r.artifacts?.find((a: any) => a.kind === "video");
  const caseRecording = data.testCaseRun?.steps?.find((step: any) => step.videoArtifactId || step.traceArtifactId);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-slate-500">TestPoint result</div>
        <h1 className="font-mono text-2xl text-mint-400">{r.testPoint.externalId}</h1>
        <p>{r.description ?? r.testPoint.description}</p>
        <div className="mt-2 flex gap-2">
          <StatusBadge status={r.status} />
          <Link className="text-sm text-mint-400" to={`/executions/${r.executionId}`}>Execution #{r.execution.sequentialId}</Link>
        </div>
      </div>
      <Screencast
        resultId={r.id}
        videoArtifactId={video?.id ?? caseRecording?.videoArtifactId}
        traceArtifactId={r.artifacts?.find((a: any) => a.kind === "trace" || a.name?.endsWith("trace.zip"))?.id ?? caseRecording?.traceArtifactId}
        durationMs={r.durationMs}
        title={r.testPoint.externalId}
      />
      <Card title="Error">
        <div className="text-sm text-rose-300">{r.failureCategory}</div>
        <pre className="mt-2 whitespace-pre-wrap text-xs">{r.errorMessage}</pre>
        {r.stackTrace ? <details className="mt-2"><summary>Stack</summary><pre className="whitespace-pre-wrap text-xs">{r.stackTrace}</pre></details> : null}
        <div className="mt-2 text-sm text-slate-400">{formatDuration(r.durationMs)} · retries {r.retries}</div>
      </Card>
      <LogViewer lines={r.logs ?? []} />
      <JsonReport cases={data.testCaseRun ? [data.testCaseRun] : undefined} executionId={r.executionId} value={r.rawJson} title="JSON report — full TestCase" />
    </div>
  );
}
