// @ts-nocheck
'use client';
import { Store } from 'lucide-react';

export interface SucursalOption {
  id: number;
  nombre: string;
}

export function SucursalPicker({
  value,
  onChange,
  sucursales,
  label = 'Sucursal',
}: {
  value: number | null;
  onChange: (id: number) => void;
  sucursales: SucursalOption[];
  label?: string;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-3">
        {sucursales.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`
                p-5 rounded-2xl border-2 transition-all active:scale-[0.98]
                flex items-center gap-3
                ${
                  active
                    ? 'border-accent bg-accent/10 text-accent font-bold'
                    : 'border-border bg-bg-card hover:border-border-strong text-neutral-200'
                }
              `}
            >
              <Store
                size={28}
                className={active ? 'text-accent' : 'text-neutral-400'}
              />
              <span className="text-lg">{s.nombre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
