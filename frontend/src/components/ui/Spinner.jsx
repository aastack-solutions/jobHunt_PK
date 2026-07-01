const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-7 w-7 border-2',
  lg: 'h-11 w-11 border-[3px]',
};

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent text-brand-violet ${SIZES[size] || SIZES.md} ${className}`}
    />
  );
}
