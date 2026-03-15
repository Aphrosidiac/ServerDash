import { useEffect, useRef } from 'react';

export default function Terminal({ lines }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const colorMap = {
    info: 'text-accent-blue',
    stdout: 'text-accent-green/80',
    stderr: 'text-accent-yellow',
    error: 'text-accent-red',
  };

  return (
    <div className="bg-bg-card border border-border p-4 font-['JetBrains_Mono'] text-xs max-h-96 overflow-auto">
      {lines.length === 0 && (
        <span className="text-text-dim">
          {'>'} awaiting_signal<span className="animate-pulse">_</span>
        </span>
      )}
      {lines.map((line, i) => (
        <div key={i} className={`${colorMap[line.type] || 'text-text-muted'} leading-relaxed`}>
          {line.data}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
