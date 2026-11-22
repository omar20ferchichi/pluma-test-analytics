import { useMemo, useRef, useState } from "react";

export interface LogRow {
  id: string;
  lineNumber: number;
  timestamp?: string | null;
  level: string;
  message: string;
  stackTrace?: string | null;
  testPointId?: string | null;
}

export function LogViewer({
  lines,
  query = "",
  regex = false,
}: {
  lines: LogRow[];
  query?: string;
  regex?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const matcher = useMemo(() => {
    if (!query) return null;
    try {
      return regex ? new RegExp(query, "i") : query.toLowerCase();
    } catch {
      return query.toLowerCase();
    }
  }, [query, regex]);

  const filtered = lines.filter((line) => {
    if (!matcher) return true;
    const hay = `${line.message} ${line.stackTrace ?? ""}`;
    if (matcher instanceof RegExp) return matcher.test(hay);
    return hay.toLowerCase().includes(matcher);
  });

  return (
    <div ref={scroller} className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-[#070d18] font-mono text-[12px] leading-6">
      {filtered.map((line) => {
        const isError = line.level === "ERROR";
        const isWarn = line.level === "WARN";
        return (
          <div key={line.id} className="border-b border-white/5 px-3 py-1 hover:bg-white/[0.03]">
            <div className="flex gap-3">
              <span className="w-10 shrink-0 text-right text-slate-600">{line.lineNumber}</span>
              <span className="w-40 shrink-0 text-slate-500">{line.timestamp ? new Date(line.timestamp).toISOString().slice(11, 23) : ""}</span>
              <span className={isError ? "w-14 text-rose-400" : isWarn ? "w-14 text-amber-300" : "w-14 text-mint-500"}>{line.level}</span>
              <button
                className="min-w-0 flex-1 text-left text-slate-200"
                onClick={() => line.stackTrace && setOpen((s) => ({ ...s, [line.id]: !s[line.id] }))}
              >
                <Highlight text={line.message} query={query} regex={regex} />
              </button>
            </div>
            {line.stackTrace && open[line.id] ? (
              <pre className="ml-[13.5rem] whitespace-pre-wrap text-rose-200/80">{line.stackTrace}</pre>
            ) : null}
          </div>
        );
      })}
      {!filtered.length ? <div className="px-4 py-8 text-center text-slate-500">No log lines match.</div> : null}
    </div>
  );
}

function Highlight({ text, query, regex }: { text: string; query: string; regex: boolean }) {
  if (!query) return <>{text}</>;
  try {
    const re = regex ? new RegExp(query, "ig") : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const parts = text.split(re);
    const matches = text.match(re) ?? [];
    return (
      <>
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {matches[i] ? <mark className="rounded bg-amber-400/40 px-0.5 text-amber-50">{matches[i]}</mark> : null}
          </span>
        ))}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}
