export default function Input({ label, error, name, register, className = '', ...rest }) {
  const registered = register ? register(name) : {};
  const stateClass = error
    ? 'ring-rose-300 focus:ring-rose-400'
    : 'ring-slate-200 focus:ring-brand-violet/60';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        id={name}
        name={name}
        className={`rounded-xl bg-white/70 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none ring-1 ring-inset transition-all placeholder:text-slate-400 focus:bg-white focus:ring-2 ${stateClass}`}
        {...registered}
        {...rest}
      />
      {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
    </div>
  );
}
