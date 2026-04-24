// @ts-nocheck
import { differenceInDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatMoney(n: number): string {
  if (n == null || isNaN(n)) return '$0,00';
  return '$' + n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return '-';
  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy');
  } catch {
    return isoDate;
  }
}

export function formatDateLong(isoDate: string): string {
  if (!isoDate) return '-';
  try {
    return format(parseISO(isoDate), "d 'de' MMMM 'de' yyyy", { locale: es });
  } catch {
    return isoDate;
  }
}

/**
 * Semáforo de vencimientos para stock:
 *   verde  → +60 días
 *   amarillo → 30-60
 *   naranja → 15-30
 *   rojo → <15 (o vencido)
 */
export type SemaforoColor = 'verde' | 'amarillo' | 'naranja' | 'rojo';

export function semaforoVencimiento(fechaVenc: string): {
  color: SemaforoColor;
  dias: number;
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = parseISO(fechaVenc);
  const dias = differenceInDays(venc, hoy);

  if (dias < 15) {
    return {
      color: 'rojo',
      dias,
      label: dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : `${dias}d`,
      bg: 'bg-danger/15',
      text: 'text-danger',
      border: 'border-danger/40',
    };
  }
  if (dias < 30) {
    return {
      color: 'naranja',
      dias,
      label: `${dias}d`,
      bg: 'bg-orange-500/15',
      text: 'text-orange-400',
      border: 'border-orange-500/40',
    };
  }
  if (dias < 60) {
    return {
      color: 'amarillo',
      dias,
      label: `${dias}d`,
      bg: 'bg-warning/15',
      text: 'text-warning',
      border: 'border-warning/40',
    };
  }
  return {
    color: 'verde',
    dias,
    label: `${dias}d`,
    bg: 'bg-success/15',
    text: 'text-success',
    border: 'border-success/40',
  };
}
