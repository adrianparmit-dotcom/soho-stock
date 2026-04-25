// @ts-nocheck
'use client';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

export interface LoteDraft {
  cantidad: number;
  vencimiento: string; // YYYY-MM-DD
}

function estaVencido(fecha: string): boolean {
  if (!fecha) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha + 'T00:00:00');
  return f < hoy;
}

function diasHastaVenc(fecha: string): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha + 'T00:00:00');
  return Math.floor((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export function LoteSplitter({
  cantidadTotal,
  lotes,
  onChange,
}: {
  cantidadTotal: number;
  lotes: LoteDraft[];
  onChange: (lotes: LoteDraft[]) => void;
}) {
  const sumCant = lotes.reduce((a, l) => a + (Number(l.cantidad) || 0), 0);
  const diff = cantidadTotal - sumCant;

  const actualizar = (i: number, patch: Partial<LoteDraft>) => {
    const next = lotes.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    onChange(next);
  };

  const agregar = () => {
    const ultimo = lotes[lotes.length - 1];
    onChange([
      ...lotes,
      { cantidad: Math.max(diff, 0), vencimiento: ultimo?.vencimiento || '' },
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
        const dias = diasHastaVenc(l.vencimiento);
        return (
          <div key={i}>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="block text-[10px] uppercase text-neutral-500">
                  Cantidad
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={l.cantidad}
                  onChange={(e) => actualizar(i, { cantidad: parseFloat(e.target.value) || 0 })}
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
                    vencido
                      ? 'border-danger text-danger'
                      : 'border-border focus:border-accent'
                  }`}
                />
              </div>
              {lotes.length > 1 && (
                <button
                  onClick={() => quitar(i)}
                  className="mt-4 p-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger"
                  title="Quitar lote"
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
            {sumCant} / {cantidadTotal}
          </span>
          {Math.abs(diff) > 0.001 && (
            <span className="text-warning ml-1">
              (falta {diff.toFixed(2)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
