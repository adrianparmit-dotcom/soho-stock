// @ts-nocheck
'use client';
import { useRef, useEffect } from 'react';

/**
 * Input de fecha rápido: 3 campos numéricos (DD MM AAAA) con auto-avance.
 * Emite el valor como string ISO "YYYY-MM-DD" (igual que <input type="date">).
 *
 * Auto-avance:
 *  - Al completar DD (2 dígitos), foco pasa a MM.
 *  - Al completar MM, foco pasa a AAAA.
 *  - Tecla backspace en campo vacío vuelve al anterior.
 *
 * Validación suave: no impide tipear pero muestra borde rojo si está vencido.
 */

interface Props {
  value: string; // ISO "YYYY-MM-DD" o ''
  onChange: (iso: string) => void;
  className?: string;
  compact?: boolean;
  autoFocus?: boolean;
}

function parseISO(iso: string): { dd: string; mm: string; yyyy: string } {
  if (!iso || iso.length < 10) return { dd: '', mm: '', yyyy: '' };
  const [y, m, d] = iso.split('-');
  return { dd: d || '', mm: m || '', yyyy: y || '' };
}

function toISO(dd: string, mm: string, yyyy: string): string {
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return '';
  return `${yyyy}-${mm}-${dd}`;
}

function estaVencido(iso: string): boolean {
  if (!iso) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(iso + 'T00:00:00');
  if (isNaN(f.getTime())) return false;
  return f < hoy;
}

export function FechaRapida({ value, onChange, className = '', compact, autoFocus }: Props) {
  const { dd, mm, yyyy } = parseISO(value);
  const refDD = useRef<HTMLInputElement>(null);
  const refMM = useRef<HTMLInputElement>(null);
  const refYY = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) refDD.current?.focus();
  }, [autoFocus]);

  const vencido = estaVencido(value);
  const sizeInput = compact
    ? 'text-sm px-1.5 py-1.5'
    : 'text-sm px-2 py-2';

  const setDD = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    const next = toISO(clean, mm, yyyy);
    onChange(next);
    if (clean.length === 2) refMM.current?.focus();
  };
  const setMM = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    const next = toISO(dd, clean, yyyy);
    onChange(next);
    if (clean.length === 2) refYY.current?.focus();
  };
  const setYY = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 4);
    const next = toISO(dd, mm, clean);
    onChange(next);
  };

  const handleBackspace = (
    e: React.KeyboardEvent<HTMLInputElement>,
    actualVal: string,
    prevRef: React.RefObject<HTMLInputElement> | null
  ) => {
    if (e.key === 'Backspace' && actualVal === '' && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  const borderClass = vencido
    ? 'border-danger'
    : 'border-border focus-within:border-accent';
  const txt = vencido ? 'text-danger' : '';

  return (
    <div className={`inline-flex items-center gap-1 bg-bg-base border rounded-lg px-1.5 ${borderClass} ${className}`}>
      <input
        ref={refDD}
        inputMode="numeric"
        value={dd}
        onChange={(e) => setDD(e.target.value)}
        onKeyDown={(e) => handleBackspace(e, dd, null)}
        placeholder="DD"
        maxLength={2}
        className={`w-8 ${sizeInput} bg-transparent text-center focus:outline-none tabular-nums ${txt}`}
      />
      <span className="text-neutral-600">/</span>
      <input
        ref={refMM}
        inputMode="numeric"
        value={mm}
        onChange={(e) => setMM(e.target.value)}
        onKeyDown={(e) => handleBackspace(e, mm, refDD)}
        placeholder="MM"
        maxLength={2}
        className={`w-8 ${sizeInput} bg-transparent text-center focus:outline-none tabular-nums ${txt}`}
      />
      <span className="text-neutral-600">/</span>
      <input
        ref={refYY}
        inputMode="numeric"
        value={yyyy}
        onChange={(e) => setYY(e.target.value)}
        onKeyDown={(e) => handleBackspace(e, yyyy, refMM)}
        placeholder="AAAA"
        maxLength={4}
        className={`w-14 ${sizeInput} bg-transparent text-center focus:outline-none tabular-nums ${txt}`}
      />
    </div>
  );
}
