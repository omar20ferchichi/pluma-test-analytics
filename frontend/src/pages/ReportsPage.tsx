import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { useProjectId } from "../components/Layout";
import { ErrorState, LoadingState } from "../components/States";
import { JsonReport } from "../components/JsonReport";
import { useApi } from "../hooks/useApi";
import { getToken, qs } from "../lib/api";

export function ReportsPage() {
  const projectId = useProjectId();
  const [params] = useSearchParams();
  const list = useApi<any>(projectId ? `/api/executions${qs({ projectId, limit: 20 })}` : null, [projectId]);
  const [kind, setKind] = useState("qualification");
  const [executionId, setExecutionId] = useState(params.get("execution") ?? "");
  const items = list.data?.items ?? [];
  const selectedId = executionId || items[0]?.id;
  const report = useApi<any>(selectedId ? `/api/executions/${selectedId}/reports/${kind}?format=json` : null, [selectedId, kind]);
  const token = getToken();
  const documentSrc = selectedId
    ? `/api/executions/${selectedId}/reports/qualification?format=html&token=${encodeURIComponent(token ?? "")}`
    : "";
  const htmlSrc = selectedId
    ? `/api/executions/${selectedId}/reports/qualification?format=html&preview=1&token=${encodeURIComponent(token ?? "")}`
    : "";

  function openReport(format: string, download = false) {
    if (!selectedId) return;
    const search = new URLSearchParams({ format, token: token ?? "" });
    if (download) search.set("download", "1");
    window.open(`/api/executions/${selectedId}/reports/${kind}?${search}`, "_blank");
  }

  function printPdf() {
    if (!htmlSrc) return;
    const frame = document.getElementById("qualification-preview") as HTMLIFrameElement | null;
    if (frame?.contentWindow) {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      return;
    }
    window.open(documentSrc || htmlSrc, "_blank");
  }

  const qualification = report.data?.qualification;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-slate-400">
          Qualification KPIs, defects, and CSV are counted at TestCase level — a case fails if any step fails. Print the report to save a PDF. The JSON tree below stays grouped by TestCase.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
          value={selectedId ?? ""}
          onChange={(e) => setExecutionId(e.target.value)}
        >
          {items.map((item: any) => (
            <option key={item.id} value={item.id}>
              #{item.sequentialId} · {item.name || item.environment}
            </option>
          ))}
        </select>
        <select className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="qualification">Qualification report</option>
          <option value="execution">Execution JSON</option>
          <option value="regression">Regression JSON</option>
          <option value="failure">Failure JSON</option>
        </select>
        <button className="inline-flex items-center gap-2 rounded-lg bg-mint-500 px-3 py-2 text-sm font-semibold text-ink-950" onClick={printPdf}>
          <Printer size={14} /> Print / Save as PDF
        </button>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={() => openReport("html", true)}>
          Export HTML
        </button>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={() => openReport("csv", true)}>
          Export CSV
        </button>
      </div>
      {report.loading ? (
        <LoadingState label="Loading qualification report" />
      ) : report.error ? (
        <ErrorState message={report.error} />
      ) : (
        <>
          {htmlSrc ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#d9e2ec]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
                <div>
                  <div className="font-semibold">{qualification?.title ?? "Qualification report"}</div>
                  <div className="text-xs text-slate-500">
                    {qualification?.subtitle} · Editor {qualification?.editor?.name} · {qualification?.editor?.date}
                    {qualification?.signedOff ? " · Signed off" : " · Not signed off"}
                  </div>
                </div>
                <a className="text-sm text-mint-700" href={documentSrc} target="_blank" rel="noreferrer">
                  Open full document
                </a>
              </div>
              <iframe
                id="qualification-preview"
                title="Qualification report"
                src={htmlSrc}
                className="h-[1400px] w-full bg-white"
              />
            </div>
          ) : null}
          <JsonReport
            cases={report.data?.cases}
            executionId={selectedId}
            title={`JSON report — ${report.data?.execution?.project ?? ""} #${report.data?.execution?.sequentialId ?? ""}`}
          />
        </>
      )}
    </div>
  );
}
