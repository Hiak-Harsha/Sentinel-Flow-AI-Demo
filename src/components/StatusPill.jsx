export function StatusPill({ ready, label, compact = false }) {
  const tone = ready ? "bg-emerald-400" : "bg-amber-400";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-slate-200 ${compact ? "px-2.5 py-1" : "px-3 py-1.5"}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone} ${ready ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
