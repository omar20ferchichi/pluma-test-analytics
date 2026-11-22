import { clsx } from "../lib/format";

const styles: Record<string, string> = {
  passed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  skipped: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  flaky: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  blocked: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  timedOut: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  unknown: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  ready: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
};

export function StatusBadge({ status }: { status?: string | null }) {
  const key = status || "unknown";
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1", styles[key] ?? styles.unknown)}>
      {key}
    </span>
  );
}

export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "mint" | "rose" | "amber" }) {
  const map = {
    slate: "bg-white/5 text-slate-300",
    mint: "bg-mint-500/15 text-mint-400",
    rose: "bg-rose-500/15 text-rose-300",
    amber: "bg-amber-500/15 text-amber-300",
  };
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs", map[tone])}>{children}</span>;
}
