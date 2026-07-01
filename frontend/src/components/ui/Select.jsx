import { ChevronDown } from 'lucide-react';

export default function Select({
  label,
  options = [],
  error,
  name,
  register,
  placeholder,
  className = '',
  ...rest
}) {
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
      <div className="relative">
        <select
          id={name}
          name={name}
          className={`w-full appearance-none rounded-xl bg-white/70 px-3.5 py-2.5 pr-9 text-sm text-slate-800 shadow-sm outline-none ring-1 ring-inset transition-all focus:bg-white focus:ring-2 ${stateClass}`}
          {...registered}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
    </div>
  );
}
