// @ts-nocheck
'use client';
import { useRef, useEffect, useState } from 'react';

/**
 * Input de fecha rápido: DD / MM / AA con auto-avance.
 * - Acepta 1 o 2 dígitos por campo (auto-avanza al completar 2, o al tipear un dígito
 *   que no puede ser el inicio de un número de 2 dígitos válido)
 * - Año de 2 dígitos: 26 → 2026
 * - Emite ISO "YYYY-MM-DD" cuando los 3 campos están completos
 * - DD siempre se completa como "01" si se ingresa "1" y se avanza
 */

interface Props {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  compact?: boolean;
  autoFocus?: boolean;
}

function parseISO(iso: string): { dd: string; mm: string; aa: string } {
  if (!iso || iso.length < 10) return { dd: '', mm: '', aa: '' };
  const [y, m, d] = iso.split('-');
  const aa = y ? y.slice(2) : '';
  return { dd: d || '', mm: m || '', aa };
}

function toISO(dd: string, mm: string, aa: string): string {
  const d = dd.padStart(2, '0');
  const m = mm.padStart(2, '0');
  if (d.length !== 2 || m.length !== 2 || aa.length !== 2) return '';
  const yyyy = '20' + aa;
  return `${yyyy}-${m}-${d}`;
}

function estaVencido(iso: string): boolean {
  if (!iso) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(iso + 'T00:00:00');
  if (isNaN(f.getTime())) return false;
  return f < hoy;
}

// Auto-avanza si el dígito ingresado no puede ser el primer dígito de un número válido de 2 dígitos
// DD: válido 01-31 → auto-avanza si primer dígito > 3
// MM: válido 01-12 → auto-avanza si primer dígito > 1
// AA: válido 00-99 → nunca auto-avanza con 1 dígito (cualquier decena es posible)
function debeAvanzar(campo: 'dd' | 'mm' | 'aa', digito: string): boolean {
  const n = parseInt(digito);
  if (campo === 'dd') return n > 3;
  if (campo === 'mm') return n > 1;
  return false;
}

export function FechaRapida({ value, onChange, className = '', compact, autoFocus }: Props) {
  const parsed = parseISO(value);
  const [dd, setDDState] = useState(parsed.dd);
  const [mm, setMMState] = useState(parsed.mm);
  const [aa, setAAState] = useState(parsed.aa);

  const refDD = useRef<HTMLInputElement>(null);
  const refMM = useRef<HTMLInputElement>(null);
  const refAA = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && value.length === 10) {
      const p = parseISO(value);
      setDDState(p.dd);
      setMMState(p.mm);
      setAAState(p.aa);
    } else if (value === '') {
      setDDState(''); setMMState(''); setAAState('');
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) refDD.current?.focus();
  }, [autoFocus]);

  const emitir = (d: string, m: string, a: string) => {
    const iso = toISO(d, m, a);
    onChange(iso || '');
  };

  const handleDD = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setDDState(clean);
    emitir(clean, mm, aa);
    if (clean.length === 2 || (clean.length === 1 && debeAvanzar('dd', clean))) {
      refMM.current?.focus();
    }
  };

  const handleMM = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setMMState(clean);
    emitir(dd, clean, aa);
    if (clean.length === 2 || (clean.length === 1 && debeAvanzar('mm', clean))) {
      refAA.current?.focus();
    }
  };

  const handleAA = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setAAState(clean);
    emitir(dd, mm, clean);
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

  const isoActual = toISO(dd, mm, aa);
  const vencido = estaVencido(isoActual);
  const sizeInput = compact ? 'text-sm px-1.5 py-1.5' : 'text-sm px-2 py-2';
  const borderClass = vencido ? 'border-danger' : 'border-border focus-within:border-accent';
  const txt = vencido ? 'text-danger' : '';

  return (
    <div className={`inline-flex items-center gap-1 bg-bg-base border rounded-lg px-1.5 ${borderClass} ${className}`}>
      <input
        ref={refDD}
        inputMode="numeric"
        value={dd}
        onChange={(e) => handleDD(e.target.value)}
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
        onChange={(e) => handleMM(e.target.value)}
        onKeyDown={(e) => handleBackspace(e, mm, refDD)}
        placeholder="MM"
        maxLength={2}
        className={`w-8 ${sizeInput} bg-transparent text-center focus:outline-none tabular-nums ${txt}`}
      />
      <span className="text-neutral-600">/</span>
      <input
        ref={refAA}
        inputMode="numeric"
        value={aa}
        onChange={(e) => handleAA(e.target.value)}
        onKeyDown={(e) => handleBackspace(e, aa, refMM)}
        placeholder="AA"
        maxLength={2}
        className={`w-8 ${sizeInput} bg-transparent text-center focus:outline-none tabular-nums ${txt}`}
      />
    </div>
  );
}
