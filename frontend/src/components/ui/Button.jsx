import Spinner from './Spinner';

const VARIANTS = {
  primary: 'btn-gradient text-white shadow-md shadow-brand-violet/25 hover:shadow-lg hover:shadow-brand-violet/30',
  secondary: 'bg-white/70 text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-white',
  ghost: 'bg-transparent text-slate-600 hover:bg-white/60',
  danger: 'bg-rose-500 text-white shadow-md shadow-rose-500/25 hover:bg-rose-600',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  onClick,
  children,
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
}
