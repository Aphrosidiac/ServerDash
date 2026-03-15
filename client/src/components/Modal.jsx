import { X } from 'lucide-react';

export default function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-bg-card border border-border w-full max-w-lg mx-4 max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between px-6 h-14 border-b border-border">
          <h2 className="font-['Space_Grotesk'] text-base font-bold text-white tracking-[-0.5px]">{title}</h2>
          <button onClick={onClose} className="text-text-dim hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
