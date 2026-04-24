// @ts-nocheck
export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-bg-card border border-border rounded-2xl ${
        onClick ? 'cursor-pointer hover:bg-bg-hover active:scale-[0.99] transition' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
