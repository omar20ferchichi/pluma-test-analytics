import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { LogViewer } from "../components/LogViewer";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { qs } from "../lib/api";

export function LogsPage() {
  const projectId = useProjectId();
  const [params] = useSearchParams();
  const list = useApi<any>(projectId ? `/api/executions${qs({ projectId, limit: 8 })}` : null, [projectId]);
  const executionId = params.get("execution") || list.data?.items?.[0]?.id;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [regex, setRegex] = useState(false);
  const [level, setLevel] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const logs = useApi<any>(
    executionId ? `/api/executions/${executionId}/logs${qs({ q: regex ? undefined : q, level: errorsOnly ? "ERROR" : level || undefined, limit: 1500 })}` : null,
    [executionId, q, level, errorsOnly, regex],
  );
  const lines = useMemo(() => logs.data?.items ?? [], [logs.data]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Log explorer</h1>
      <div className="flex flex-wrap gap-2">
        <input className="min-w-64 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" placeholder="Full-text or regex" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> Regex</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Errors only</label>
        <select className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {["INFO", "WARN", "ERROR"].map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      {logs.loading ? <LoadingState /> : logs.error ? <ErrorState message={logs.error} /> : (
        <LogViewer lines={lines} query={q} regex={regex} />
      )}
    </div>
  );
}
