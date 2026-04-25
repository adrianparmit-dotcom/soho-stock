// @ts-nocheck
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatMoney(n: number): string {
  if (n == null || isNaN(n)) return '$0,00';
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return '-';
  try { return format(parseISO(isoDate), 'dd/MM/yyyy'); } catch { return isoDate; }
}

export function formatDateLong(isoDate: string): string {
  if (!isoDate) return '-';
  try { return format(parseISO(isoDate), "d 'de' MMMM 'de' yyyy", { locale: es }); } catch { return isoDate; }
}

// Wrapper para compatibilidad con código existente que usa semaforoVencimiento
import { getExpirationStatus } from '@/lib/business/stock';
export { getExpirationStatus };
export function semaforoVencimiento(fechaVenc: string) {
  return getExpirationStatus(fechaVenc);
}
