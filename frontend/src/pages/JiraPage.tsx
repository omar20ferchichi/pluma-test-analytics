import { Link } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";

export function JiraPage() {
  const projectId = useProjectId();
  const { data, loading, error } = useApi<any>(projectId ? `/api/jira${qs({ projectId })}` : null, [projectId]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Jira tickets</h1>
        <p className="text-sm text-slate-400">Ticket keys come from TestPoint `ticket_id`. Jira API sync is optional and not required.</p>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {(data?.tickets ?? []).map((ticket: any) => (
            <div key={ticket.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="font-mono text-lg text-mint-400">{ticket.key}</div>
              <div className="text-sm text-slate-400">{ticket.testPoints.length} TestPoints · {ticket.failures} currently failing</div>
              <ul className="mt-3 space-y-1 text-sm">
                {ticket.testPoints.map((point: any) => (
                  <li key={point.id} className="flex items-center justify-between">
                    <Link className="font-mono text-mint-400" to={`/testpoints/${point.externalId}`}>{point.externalId}</Link>
                    <StatusBadge status={point.results[0]?.status} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
