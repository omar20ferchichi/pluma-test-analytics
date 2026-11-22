export function JsonViewer({ value }: { value: unknown }) {
  const text = typeof value === "string" ? pretty(value) : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-[480px] overflow-auto rounded-xl border border-white/10 bg-[#070d18] p-4 font-mono text-xs leading-5 text-mint-400/90">
      {text || "No JSON payload"}
    </pre>
  );
}

function pretty(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
