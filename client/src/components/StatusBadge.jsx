const statusConfig = {
  running: { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green', border: 'border-accent-green/20' },
  deploying: { bg: 'bg-accent-yellow/10', text: 'text-accent-yellow', dot: 'bg-accent-yellow animate-pulse', border: 'border-accent-yellow/20' },
  updating: { bg: 'bg-accent-blue/10', text: 'text-accent-blue', dot: 'bg-accent-blue animate-pulse', border: 'border-accent-blue/20' },
  failed: { bg: 'bg-accent-red/10', text: 'text-accent-red', dot: 'bg-accent-red', border: 'border-accent-red/20' },
  stopped: { bg: 'bg-accent-orange/10', text: 'text-accent-orange', dot: 'bg-accent-orange', border: 'border-accent-orange/20' },
  unknown: { bg: 'bg-text-dim/10', text: 'text-text-dim', dot: 'bg-text-dim', border: 'border-text-dim/20' },
};

export default function StatusBadge({ status }) {
  const s = status || 'unknown';
  const cfg = statusConfig[s] || statusConfig.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[10px] font-['JetBrains_Mono'] font-semibold tracking-[1px] uppercase ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {s}
    </span>
  );
}
