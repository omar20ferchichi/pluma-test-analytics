import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { clsx, formatDuration } from "../lib/format";
import {
  isFailedStatus,
  isPassedStatus,
  parseReportTree,
  type ReportCase,
  type ReportStep,
} from "../lib/json-report";

export function JsonReport({
  value,
  cases,
  title = "JSON report",
  executionId,
}: {
  value?: unknown;
  cases?: ReportCase[];
  title?: string;
  executionId?: string;
}) {
  const tree = useMemo(() => (cases ? cases : parseReportTree(value)), [cases, value]);
  const treeKey = tree.map((item) => item.id).join("|");
  const [filter, setFilter] = useState<"all" | "failed" | "passed">("all");
  const [openCases, setOpenCases] = useState<Set<string>>(new Set());
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    const failed = tree.filter((item) => isFailedStatus(item.status)).map((item) => item.id);
    setOpenCases(new Set(failed.length ? failed : tree.length === 1 ? [tree[0].id] : []));
    setOpenSteps(new Set());
  }, [tree, treeKey]);

  const visible = tree.filter((item) => {
    if (filter === "failed") return isFailedStatus(item.status) || item.steps.some((step) => isFailedStatus(step.status));
    if (filter === "passed") return isPassedStatus(item.status);
    return true;
  });

  if (!tree.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#070d18] p-6 text-sm text-slate-400">
        No JSON report steps to display.
      </div>
    );
  }

  function toggle(id: string, setter: Dispatch<SetStateAction<Set<string>>>) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070d18]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
          {(["all", "failed", "passed"] as const).map((item) => (
            <button
              key={item}
              className={clsx("rounded-md px-2 py-1 capitalize", filter === item ? "bg-white/10 text-white" : "text-slate-400")}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {visible.map((item) => {
          const opened = openCases.has(item.id);
          return (
            <div key={item.id} className={rowTone(item.status)}>
              <div className="flex w-full items-center gap-2 px-4 py-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(item.id, setOpenCases)}>
                  {opened ? <ChevronDown size={16} className="shrink-0 text-slate-500" /> : <ChevronRight size={16} className="shrink-0 text-slate-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] uppercase tracking-wide text-slate-500">TestCase {item.id}</div>
                    <div className={clsx("truncate font-medium", nameTone(item.status))}>{item.name}</div>
                  </div>
                </button>
                <span className="hidden text-xs text-slate-500 sm:inline">{item.steps.length} steps</span>
                {watchHref(executionId, item) ? (
                  <Link className="shrink-0 rounded-md px-2 py-1 text-xs text-mint-400 hover:bg-white/5" to={watchHref(executionId, item)!}>
                    Watch
                  </Link>
                ) : null}
                <StatusBadge status={item.status} />
                <span className="w-16 shrink-0 text-right text-xs text-slate-500">{formatDuration(item.durationMs)}</span>
              </div>
              {opened ? (
                <div className="space-y-1 px-3 pb-3">
                  {item.steps.map((step) => {
                    const stepKey = `${item.id}:${step.id}:${step.resultId ?? ""}`;
                    const stepOpen = openSteps.has(stepKey);
                    const recording = stepWatchHref(executionId, item, step);
                    return (
                      <div key={stepKey} className={clsx("rounded-xl border border-white/5", rowTone(step.status))}>
                        <div className="flex w-full items-center gap-2 px-3 py-2">
                          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(stepKey, setOpenSteps)}>
                            {stepOpen ? <ChevronDown size={14} className="shrink-0 text-slate-500" /> : <ChevronRight size={14} className="shrink-0 text-slate-500" />}
                            <span className="font-mono text-xs text-slate-400">{step.id}</span>
                            <span className={clsx("min-w-0 flex-1 text-sm", nameTone(step.status))}>{step.name}</span>
                          </button>
                          {recording ? (
                            <Link className="shrink-0 rounded-md px-2 py-0.5 text-xs text-mint-400 hover:bg-white/5" to={recording}>
                              Watch
                            </Link>
                          ) : null}
                          <StatusBadge status={step.status} />
                          <span className="w-16 shrink-0 text-right text-xs text-slate-500">{formatDuration(step.durationMs)}</span>
                        </div>
                        {stepOpen ? <StepDetails step={step} caseItem={item} executionId={executionId} /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepDetails({ step, caseItem, executionId }: { step: ReportStep; caseItem: ReportCase; executionId?: string }) {
  const recording = stepWatchHref(executionId, caseItem, step);
  return (
    <div className="space-y-3 border-t border-white/10 px-4 py-3 text-sm">
      <dl className="grid gap-2 sm:grid-cols-2">
        <Detail label="TestPoint" value={step.id} />
        <Detail label="Ticket" value={step.ticketId ?? "—"} />
        <Detail label="Duration" value={formatDuration(step.durationMs)} />
        <Detail label="Retries" value={step.retries ?? 0} />
        {step.category ? <Detail label="Category" value={step.category} /> : null}
        {step.lastSuccessfulStep ? <Detail label="Last successful step" value={step.lastSuccessfulStep} /> : null}
        {step.browser ? <Detail label="Browser" value={step.browser} /> : null}
      </dl>
      {step.error ? (
        <div>
          <div className="text-[11px] uppercase text-rose-400">Error</div>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-rose-200">{step.error}</pre>
        </div>
      ) : (
        <p className="text-xs text-emerald-300">No error — this step passed.</p>
      )}
      {step.stack ? (
        <details>
          <summary className="cursor-pointer text-xs text-slate-400">Stack</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-400">{step.stack}</pre>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {recording ? (
          <Link className="text-sm text-mint-400" to={recording}>
            Watch video / trace →
          </Link>
        ) : null}
        {step.resultId ? (
          <Link className="text-sm text-mint-400" to={`/results/${step.resultId}`}>
            Open result →
          </Link>
        ) : null}
        {step.id ? (
          <Link className="text-sm text-mint-400" to={`/testpoints/${encodeURIComponent(step.id)}`}>
            Open TestPoint →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function watchHref(executionId: string | undefined, item: ReportCase): string | null {
  if (!executionId) {
    const resultId = item.steps.find((step) => step.resultId)?.resultId;
    return resultId ? `/results/${resultId}` : null;
  }
  return `/videos?execution=${executionId}&case=${encodeURIComponent(item.id)}`;
}

function stepWatchHref(executionId: string | undefined, item: ReportCase, step: ReportStep): string | null {
  const own = step.traceArtifactId || step.videoArtifactId;
  const inherited = item.steps.find((row) => row.traceArtifactId || row.videoArtifactId);
  const artifactId = own || inherited?.traceArtifactId || inherited?.videoArtifactId;
  if (executionId) {
    const href = `/videos?execution=${executionId}&case=${encodeURIComponent(item.id)}`;
    return artifactId ? `${href}&artifact=${artifactId}` : href;
  }
  if (step.resultId) return `/results/${step.resultId}`;
  return null;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-200">{value}</div>
    </div>
  );
}

function rowTone(status?: string): string {
  if (isFailedStatus(status)) return "bg-rose-500/10";
  if (isPassedStatus(status)) return "bg-emerald-500/[0.07]";
  return "bg-white/[0.02]";
}

function nameTone(status?: string): string {
  if (isFailedStatus(status)) return "text-rose-300";
  if (isPassedStatus(status)) return "text-emerald-300";
  return "text-slate-200";
}
