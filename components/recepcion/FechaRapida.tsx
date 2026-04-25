// @ts-nocheck
'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

/**
 * Selector de fecha con popover 3 pasos:
 * Paso 1 — elegís año (flechas ← →)
 * Paso 2 — elegís mes (grilla 3×4)
 * Paso 3 — elegís día (grilla calendario)
 * Emite ISO "YYYY-MM-DD"
 */

interface Props {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  compact?: boolean;
  autoFocus?: boolean;
}

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function diasEnMes(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function parseISO(iso: string) {
  if (!iso || iso.length < 10) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function formatDisplay(iso: string): string {
  const p = parseISO(iso);
  if (!p) return '';
  const dd = String(p.day).padStart(2, '0');
  const mm = String(p.month + 1).padStart(2, '0');
  return `${dd}/${mm}/${p.year}`;
}

function estaVencido(iso: string): boolean {
  if (!iso) return false;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const f = new Date(iso + 'T00:00:00');
  return !isNaN(f.getTime()) && f < hoy;
}

type Paso = 'año' | 'mes' | 'dia';

export function FechaRapida({ value, onChange, className = '', compact }: Props) {
  const hoy = new Date();
  const parsed = parseISO(value);

  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<Paso>('año');
  const [viewYear, setViewYear] = useState(parsed?.year ?? hoy.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? hoy.getMonth());

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (value && value.length === 10) {
      const p = parseISO(value);
      if (p) { setViewYear(p.year); setViewMonth(p.month); }
    }
  }, [value]);

  const abrirCalendario = () => {
    const p = parseISO(value);
    setViewYear(p?.year ?? hoy.getFullYear());
    setViewMonth(p?.month ?? hoy.getMonth());
    setPaso('año');
    setOpen(true);
  };

  const seleccionarMes = (m: number) => {
    setViewMonth(m);
    setPaso('dia');
  };

  const seleccionarDia = (d: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setOpen(false);
  };

  const vencido = estaVencido(value);
  const display = formatDisplay(value);

  // Para grilla de días: qué día de semana cae el 1ro (lunes=0)
  const primerDia = new Date(viewYear, viewMonth, 1).getDay();
  const offsetLunes = primerDia === 0 ? 6 : primerDia - 1;
  const totalDias = diasEnMes(viewYear, viewMonth);

  // Título del popover según paso
  const titulo = paso === 'año'
    ? 'Elegí el año'
    : paso === 'mes'
    ? `${viewYear} — elegí el mes`
    : `${MESES_CORTO[viewMonth]} ${viewYear} — elegí el día`;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={abrirCalendario}
        className={`inline-flex items-center gap-1.5 bg-bg-base border rounded-lg px-2 ${compact ? 'py-1.5' : 'py-2'} text-sm
          ${vencido ? 'border-danger text-danger' : 'border-border hover:border-accent text-neutral-200'}
          focus:outline-none focus:border-accent transition-colors min-w-[130px]`}
      >
        <Calendar size={13} className={vencido ? 'text-danger' : 'text-neutral-500'} />
        <span className={`flex-1 text-left tabular-nums ${!display ? 'text-neutral-600' : ''}`}>
          {display || 'DD/MM/AAAA'}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-bg-card border border-border rounded-2xl shadow-2xl p-3 w-64">

          {/* Título */}
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 text-center mb-2">
            {titulo}
          </div>

          {/* ======== PASO 1: AÑO ======== */}
          {paso === 'año' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setViewYear(y => y - 1)}
                  className="p-2 rounded-xl hover:bg-bg-hover text-neutral-400 hover:text-neutral-100"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setPaso('mes')}
                  className="text-2xl font-black text-accent hover:text-accent-hover px-4 py-2 rounded-xl hover:bg-accent/10 transition-colors"
                >
                  {viewYear}
                </button>
                <button
                  onClick={() => setViewYear(y => y + 1)}
                  className="p-2 rounded-xl hover:bg-bg-hover text-neutral-400 hover:text-neutral-100"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              {/* Años rápidos */}
              <div className="grid grid-cols-4 gap-1">
                {[hoy.getFullYear(), hoy.getFullYear()+1, hoy.getFullYear()+2, hoy.getFullYear()+3].map(y => (
                  <button
                    key={y}
                    onClick={() => { setViewYear(y); setPaso('mes'); }}
                    className={`py-2 rounded-xl text-sm font-semibold transition-colors
                      ${viewYear === y ? 'bg-accent text-black' : 'hover:bg-bg-hover text-neutral-300'}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPaso('mes')}
                className="w-full py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-sm font-semibold transition-colors"
              >
                Continuar con {viewYear} →
              </button>
            </div>
          )}

          {/* ======== PASO 2: MES ======== */}
          {paso === 'mes' && (
            <>
              <button
                onClick={() => setPaso('año')}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100 mb-2 px-1"
              >
                <ChevronLeft size={12} /> {viewYear}
              </button>
              <div className="grid grid-cols-3 gap-1.5">
                {MESES_CORTO.map((mes, i) => {
                  const esHoy = i === hoy.getMonth() && viewYear === hoy.getFullYear();
                  const esSel = parsed && i === parsed.month && viewYear === parsed.year;
                  return (
                    <button
                      key={i}
                      onClick={() => seleccionarMes(i)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors
                        ${esSel ? 'bg-accent text-black'
                          : esHoy ? 'bg-accent/20 text-accent hover:bg-accent/30'
                          : 'hover:bg-bg-hover text-neutral-200'}`}
                    >
                      {mes}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ======== PASO 3: DÍA ======== */}
          {paso === 'dia' && (
            <>
              <button
                onClick={() => setPaso('mes')}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100 mb-2 px-1"
              >
                <ChevronLeft size={12} /> {MESES_CORTO[viewMonth]} {viewYear}
              </button>
              {/* Cabecera días */}
              <div className="grid grid-cols-7 mb-0.5">
                {['L','M','X','J','V','S','D'].map(d => (
                  <div key={d} className="text-center text-[10px] text-neutral-600 font-medium py-0.5">{d}</div>
                ))}
              </div>
              {/* Días */}
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: offsetLunes }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: totalDias }).map((_, i) => {
                  const dia = i + 1;
                  const esHoyDia = dia === hoy.getDate() && viewMonth === hoy.getMonth() && viewYear === hoy.getFullYear();
                  const esSel = parsed && dia === parsed.day && viewMonth === parsed.month && viewYear === parsed.year;
                  return (
                    <button
                      key={dia}
                      onClick={() => seleccionarDia(dia)}
                      className={`aspect-square rounded-lg text-xs font-medium transition-colors
                        ${esSel ? 'bg-accent text-black'
                          : esHoyDia ? 'bg-accent/20 text-accent hover:bg-accent/30'
                          : 'hover:bg-bg-hover text-neutral-200'}`}
                    >
                      {dia}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
