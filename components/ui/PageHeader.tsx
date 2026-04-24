// @ts-nocheck
import { BackButton } from './BackButton';

export function PageHeader({
  title,
  subtitle,
  backHref,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-bg-base/80 border-b border-border">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <BackButton href={backHref} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-sm text-neutral-400 truncate">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
