import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectId } from "../components/Layout";
import { api } from "../lib/api";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function ImportPage() {
  const projectId = useProjectId();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ branch: "main", environment: "QA", browser: "chromium", commit: "" });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [sync, setSync] = useState<{ dir: string; imported: string[]; skipped: Array<{ run: string; reason: string }> } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncReports() {
    if (!projectId) return;
    setSyncing(true);
    setError("");
    try {
      setSync(await api(`/api/projects/${projectId}/reports-sync`, { method: "POST" }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  function onFile(next: File | null) {
    setResult(null);
    if (next && next.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError(`This file is ${formatSize(next.size)}. Maximum upload is 3 GB.`);
      return;
    }
    setError("");
    setFile(next);
  }

  async function submit() {
    if (!file || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      Object.entries(meta).forEach(([k, v]) => body.append(k, v));
      body.append("file", file);
      const res = await api<any>(`/api/projects/${projectId}/executions/import`, { method: "POST", body });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import execution</h1>
      <p className="max-w-2xl text-sm text-slate-400">
        Upload one <code>test_entretien</code> run: zip a single <code>reports/&lt;timestamp&gt;</code> folder (results.json, summary.json, testcases/, logs/, artifacts/). Do not zip the whole reports/ folder. To pull every new run at once, run <code>npm run import:reports</code> or use the button below.
        Packages up to <strong className="text-slate-200">3 GB</strong> are accepted; a large import is streamed to disk and can take several minutes.
      </p>
      <div className="rounded-2xl border border-dashed border-mint-500/40 bg-mint-500/5 p-6">
        <input type="file" accept=".zip,.json,.log" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        {file ? <p className="mt-2 text-sm text-slate-400">{file.name} · {formatSize(file.size)}</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(meta).map(([key, value]) => (
            <label key={key} className="text-sm capitalize">
              {key}
              <input className="mt-1 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2" value={value} onChange={(e) => setMeta({ ...meta, [key]: e.target.value })} />
            </label>
          ))}
        </div>
        <button disabled={!file || busy || !projectId} className="mt-4 rounded-lg bg-mint-500 px-4 py-2 font-semibold text-ink-950 disabled:opacity-50" onClick={submit}>
          {busy ? "Importing… this can take a while for large ZIPs" : "Import package"}
        </button>
        {!projectId ? <p className="mt-2 text-sm text-amber-300">No project selected. Choose one in the header.</p> : null}
      </div>
      <div className="rounded-2xl border border-white/10 p-6">
        <div className="font-medium">Sync from test_entretien</div>
        <p className="mt-1 text-sm text-slate-400">Imports every <code>reports/&lt;timestamp&gt;</code> run that is not in this project yet.</p>
        <button disabled={syncing || !projectId} className="mt-3 rounded-lg border border-mint-500/50 px-4 py-2 text-mint-400 disabled:opacity-50" onClick={syncReports}>
          {syncing ? "Importing runs…" : "Sync reports folder"}
        </button>
        {sync ? (
          <div className="mt-3 text-sm text-slate-300">
            <div className="text-slate-500">{sync.dir}</div>
            <div>{sync.imported.length} imported · {sync.skipped.filter((s) => s.reason === "already imported").length} already present</div>
            <ul className="mt-1 text-amber-300">
              {sync.skipped.filter((s) => s.reason !== "already imported").map((s) => <li key={s.run}>{s.run}: {s.reason}</li>)}
            </ul>
            {sync.imported.length ? <button className="mt-2 text-mint-400" onClick={() => navigate("/executions")}>Open executions →</button> : null}
          </div>
        ) : null}
      </div>
      {error ? <div className="text-rose-300">{error}</div> : null}
      {result ? (
        <div className="rounded-2xl border border-white/10 p-4">
          <div className="font-medium">Imported #{result.sequentialId}</div>
          <div className="text-sm text-slate-400">Quality {result.quality} · format {result.validation?.format}</div>
          <ul className="mt-2 text-sm">
            {(result.validation?.issues ?? []).map((issue: any, i: number) => (
              <li key={i} className={issue.severity === "error" ? "text-rose-300" : "text-amber-300"}>{issue.message}</li>
            ))}
          </ul>
          <button className="mt-3 text-mint-400" onClick={() => navigate(`/executions/${result.executionId}`)}>Open execution →</button>
        </div>
      ) : null}
    </div>
  );
}
