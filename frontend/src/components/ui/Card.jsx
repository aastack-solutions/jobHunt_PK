export default function Card({ children, className = '', padding = 'p-5', hover = false }) {
  return (
    <div
      className={`glass rounded-3xl ${hover ? 'glass-hover' : ''} ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
