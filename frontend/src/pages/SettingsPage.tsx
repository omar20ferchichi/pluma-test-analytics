import { useState } from "react";
import { useProjectId } from "../components/Layout";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

export function SettingsPage() {
  const projectId = useProjectId();
  const config = useApi<any>(projectId ? `/api/projects/${projectId}/quality-config` : null, [projectId]);
  const keys = useApi<any>(projectId ? `/api/projects/${projectId}/api-keys` : null, [projectId]);
  const [secret, setSecret] = useState<string | null>(null);
  const [weights, setWeights] = useState<any>(null);
  const current = weights ?? config.data?.config;

  async function save() {
    if (!projectId || !current) return;
    await api(`/api/projects/${projectId}/quality-config`, { method: "PUT", body: JSON.stringify(current) });
    config.reload();
  }

  async function createKey() {
    if (!projectId) return;
    const name = prompt("API key name", "GitHub Actions") ?? "CI";
    const res = await api<any>(`/api/projects/${projectId}/api-keys`, { method: "POST", body: JSON.stringify({ name }) });
    setSecret(res.key.secret);
    keys.reload();
  }

  if (config.loading) return <LoadingState />;
  if (config.error) return <ErrorState message={config.error} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="rounded-2xl border border-white/10 p-4">
        <h2 className="font-medium">Quality score weights</h2>
        <p className="text-sm text-slate-400">Scoring is configurable. Weights do not have to sum to 100; they are normalized.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {current && ["passRate", "criticalFailures", "regressions", "flakiness", "performance", "coverage"].map((key) => (
            <label key={key} className="text-sm">
              {key}
              <input type="number" className="mt-1 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2" value={current[key]} onChange={(e) => setWeights({ ...current, [key]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <button className="mt-3 rounded-lg bg-mint-500 px-3 py-2 text-sm font-semibold text-ink-950" onClick={save}>Save weights</button>
      </section>
      <section className="rounded-2xl border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">CI API keys</h2>
          <button className="rounded-lg border border-white/10 px-3 py-1.5 text-sm" onClick={createKey}>Create key</button>
        </div>
        {secret ? <p className="mt-2 rounded-lg bg-amber-500/10 p-3 font-mono text-sm text-amber-200">Copy now: {secret}</p> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {(keys.data?.keys ?? []).map((key: any) => (
            <li key={key.id} className="flex justify-between">
              <span>{key.name} · {key.prefix}…</span>
              <span className="text-slate-500">{key.revokedAt ? "revoked" : "active"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
