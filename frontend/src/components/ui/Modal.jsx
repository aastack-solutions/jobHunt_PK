import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// `size` added 2026-08-19 (F11): the live-view renders a full browser screenshot,
// which is unreadable at the default dialog width. Default is unchanged, so every
// existing caller keeps the width it had.
const SIZES = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export default function Modal({ isOpen, onClose, title, size = 'md', children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    // Move focus into the panel for accessibility.
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-strong w-full ${SIZES[size] || SIZES.md} rounded-3xl outline-none animate-slide-up`}
      >
        <div className="flex items-center justify-between border-b border-white/40 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
