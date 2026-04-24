// @ts-nocheck
'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function BackButton({ href, label = 'Volver' }: { href?: string; label?: string }) {
  const router = useRouter();
  const handle = () => {
    if (href) router.push(href);
    else router.back();
  };
  return (
    <button
      onClick={handle}
      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-bg-card border border-border hover:bg-bg-hover active:scale-[0.98] transition text-sm font-medium"
    >
      <ArrowLeft size={18} />
      {label}
    </button>
  );
}
