// @ts-nocheck
export const VENC_SIN_FECHA = '2099-12-31';

export const DEPOSITO_SUCURSAL: Record<string, number> = {
  LOCAL: 1, PIEZA: 1, LOCAL2: 2, DEP_LOCAL2: 2,
};

export const DEPOSITO_LABEL: Record<string, string> = {
  LOCAL: 'LOCAL (SOHO 1)',
  PIEZA: 'PIEZA (SOHO 1)',
  LOCAL2: 'LOCAL 2 (SOHO 2)',
  DEP_LOCAL2: 'DEP. LOCAL 2 (SOHO 2)',
};

export const PRIORIDAD_TRANSFERENCIA: Record<string, string[]> = {
  LOCAL:  ['PIEZA', 'DEP_LOCAL2', 'LOCAL2'],
  LOCAL2: ['DEP_LOCAL2', 'PIEZA', 'LOCAL'],
};

export const LOCALES_VENTA = ['LOCAL', 'LOCAL2'];

export function getExpirationStatus(fechaVenc: string) {
  if (fechaVenc === VENC_SIN_FECHA) {
    return { color: 'inicial', dias: 9999, label: 'Sin venc.', bg: 'bg-neutral-800', text: 'text-neutral-500', border: 'border-neutral-700', esInicial: true };
  }
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(fechaVenc + 'T00:00:00');
  const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
  if (dias < 15) return { color: 'rojo', dias, label: dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : `${dias}d`, bg: 'bg-danger/15', text: 'text-danger', border: 'border-danger/40', esInicial: false };
  if (dias < 30) return { color: 'naranja', dias, label: `${dias}d`, bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/40', esInicial: false };
  if (dias < 60) return { color: 'amarillo', dias, label: `${dias}d`, bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/40', esInicial: false };
  return { color: 'verde', dias, label: `${dias}d`, bg: 'bg-success/15', text: 'text-success', border: 'border-success/40', esInicial: false };
}

export function calcularTransferenciasRecomendadas(lotes: any[]) {
  const stockPorDep = new Map();
  const infoProd = new Map();
  lotes.filter(r => r.tipo_lote !== 'granel').forEach(r => {
    const pid = String(r.producto?.id);
    if (!pid || pid === 'undefined') return;
    const dep = r.deposito || (r.sucursal_id === 1 ? 'LOCAL' : 'LOCAL2');
    if (!stockPorDep.has(pid)) {
      stockPorDep.set(pid, { LOCAL: 0, PIEZA: 0, LOCAL2: 0, DEP_LOCAL2: 0 });
      infoProd.set(pid, { nombre: r.producto.nombre, codigo: r.producto.codigo });
    }
    stockPorDep.get(pid)[dep] += Number(r.cantidad);
  });
  const result: any[] = [];
  stockPorDep.forEach((stock, pid) => {
    const info = infoProd.get(pid);
    for (const dep of LOCALES_VENTA) {
      if (stock[dep] > 0) continue;
      for (const fuente of (PRIORIDAD_TRANSFERENCIA[dep] || [])) {
        if (stock[fuente] > 0) {
          result.push({ codigo: info.codigo, nombre: info.nombre, depSinStock: dep, depConStock: fuente, cantidad: stock[fuente], labelSinStock: DEPOSITO_LABEL[dep], labelConStock: DEPOSITO_LABEL[fuente] });
          break;
        }
      }
    }
  });
  return result.sort((a, b) => a.depSinStock.localeCompare(b.depSinStock) || b.cantidad - a.cantidad);
}

export function suggestPromotion(dias: number) {
  if (dias < 0)  return { nivel: 'Liquidación', descuento: 90, urgencia: 'critica' };
  if (dias < 5)  return { nivel: 'Liquidación', descuento: 90, urgencia: 'critica' };
  if (dias < 10) return { nivel: 'Fuerte',      descuento: 70, urgencia: 'alta' };
  if (dias < 20) return { nivel: 'Media',       descuento: 40, urgencia: 'media' };
  if (dias < 30) return { nivel: 'Suave',       descuento: 20, urgencia: 'baja' };
  return null;
}
