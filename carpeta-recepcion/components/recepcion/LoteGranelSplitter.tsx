// @ts-nocheck
'use client';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

export interface LoteGranelDraft {
  kg: number;
  vencimiento: string;
}

function estaVencido(fecha: string): boolean {
  if (!fecha) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha + 'T00:00:00');
  return f < hoy;
}

function diasHasta(fecha: string): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha + 'T00:00:00');
  return Math.floor((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export function LoteGranelSplitter({
  kgTotal,
  lotes,
  onChange,
}: {
  kgTotal: number;
  lotes: LoteGranelDraft[];
  onChange: (lotes: LoteGranelDraft[]) => void;
}) {
  const sumKg = lotes.reduce((a, l) => a + (Number(l.kg) || 0), 0);
  const diff = kgTotal - sumKg;

  const actualizar = (i: number, patch: Partial<LoteGranelDraft>) => {
    const next = lotes.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    onChange(next);
  };

  const agregar = () => {
    const ultimo = lotes[lotes.length - 1];
    onChange([
      ...lotes,
      { kg: Math.max(diff, 0), vencimiento: ultimo?.vencimiento || '' },
    ]);
  };

  const quitar = (i: number) => {
    if (lotes.length <= 1) return;
    onChange(lotes.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      {lotes.map((l, i) => {
        const vencido = estaVencido(l.vencimiento);
        const dias = diasHasta(l.vencimiento);
        return (
          <div key={i}>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="block text-[10px] uppercase text-neutral-500">
                  Kilos
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  value={l.kg}
                  onChange={(e) => actualizar(i, { kg: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex-[1.3]">
                <label className="block text-[10px] uppercase text-neutral-500">
                  Vencimiento
                </label>
                <input
                  type="date"
                  value={l.vencimiento}
                  onChange={(e) => actualizar(i, { vencimiento: e.target.value })}
                  className={`w-full bg-bg-base border rounded-lg px-3 py-2 text-sm focus:outline-none ${
                    vencido ? 'border-danger text-danger' : 'border-border focus:border-accent'
                  }`}
                />
              </div>
              {lotes.length > 1 && (
                <button
                  onClick={() => quitar(i)}
                  className="mt-4 p-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {vencido && (
              <div className="flex items-center gap-1.5 text-xs text-danger mt-1 ml-1">
                <AlertTriangle size={12} />
                Vencido hace {Math.abs(dias!)} día{Math.abs(dias!) === 1 ? '' : 's'}
              </div>
            )}
            {!vencido && dias !== null && dias < 15 && (
              <div className="flex items-center gap-1.5 text-xs text-warning mt-1 ml-1">
                <AlertTriangle size={12} />
                Vence en {dias} día{dias === 1 ? '' : 's'}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={agregar}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
        >
          <Plus size={14} /> Dividir en otro lote
        </button>
        <div className="text-xs">
          <span className="text-neutral-400">Asignado: </span>
          <span
            className={
              Math.abs(diff) < 0.001
                ? 'text-success font-semibold'
                : 'text-warning font-semibold'
            }
          >
            {sumKg.toFixed(3)} / {kgTotal.toFixed(3)} kg
          </span>
          {Math.abs(diff) > 0.001 && (
            <span className="text-warning ml-1">
              (falta {diff.toFixed(3)} kg)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
