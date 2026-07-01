export default function Badge({ color = 'bg-slate-100 text-slate-600 ring-slate-200', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${color} ${className}`}
    >
      {children}
    </span>
  );
}
