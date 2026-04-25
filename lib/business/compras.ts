// @ts-nocheck
/**
 * BUSINESS RULES — SISTEMA DE COMPRAS INTELIGENTE
 */

export interface VentaDiaria {
  codigo: string;
  sucursal: string; // 'SOHO' | 'SOHO 2'
  cantidad_total: number;
  dias_periodo: number;
  ventas_por_dia: number;
}

export interface SugerenciaCompra {
  codigo: string;
  nombre: string;
  stock_total: number;
  ventas_por_dia: number;
  dias_cobertura: number;
  dias_a_vencer: number | null; // null = sin vencimiento registrado
  sugerido: number;
  razon: string;
  urgencia: 'ok' | 'revisar' | 'comprar' | 'urgente' | 'no_comprar';
}

// Parámetros configurables
const LEAD_TIME_DIAS = 7;       // días que tarda en llegar un pedido
const SAFETY_DIAS = 14;         // días extra de colchón
const STOCK_TARGET_DIAS = LEAD_TIME_DIAS + SAFETY_DIAS; // = 21 días

export function calcularSugerenciasCompra(params: {
  lotes: Array<{
    producto_id: number;
    cantidad: number;
    fecha_vencimiento: string;
    producto: { id: number; codigo: string; nombre: string };
  }>;
  ventas: Array<{
    codigo: string;
    ventas_por_dia: number;
  }>;
}): SugerenciaCompra[] {
  const VENC_SIN_FECHA = '2099-12-31';
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // Agrupar stock por código
  const stockPorCodigo = new Map<string, { total: number; minDiasVenc: number | null; nombre: string }>();
  for (const lote of params.lotes) {
    const codigo = lote.producto?.codigo;
    if (!codigo) continue;
    const existing = stockPorCodigo.get(codigo) || { total: 0, minDiasVenc: null, nombre: lote.producto?.nombre || '' };
    existing.total += Number(lote.cantidad);

    if (lote.fecha_vencimiento !== VENC_SIN_FECHA) {
      const venc = new Date(lote.fecha_vencimiento + 'T00:00:00');
      const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
      if (existing.minDiasVenc === null || dias < existing.minDiasVenc) {
        existing.minDiasVenc = dias;
      }
    }
    stockPorCodigo.set(codigo, existing);
  }

  // Mapear ventas por código
  const ventasMap = new Map<string, number>();
  for (const v of params.ventas) {
    ventasMap.set(v.codigo, v.ventas_por_dia);
  }

  const resultado: SugerenciaCompra[] = [];

  stockPorCodigo.forEach((stock, codigo) => {
    const ventasDia = ventasMap.get(codigo) || 0;
    const diasCobertura = ventasDia > 0 ? Math.round(stock.total / ventasDia) : 999;
    const diasVencer = stock.minDiasVenc;

    let sugerido = 0;
    let razon = '';
    let urgencia: SugerenciaCompra['urgencia'] = 'ok';

    if (ventasDia === 0) {
      // Sin historial de ventas
      if (stock.total <= 0) {
        urgencia = 'revisar';
        razon = 'Sin ventas registradas y sin stock — revisar si se sigue vendiendo';
      } else {
        urgencia = 'ok';
        razon = 'Sin ventas registradas — stock disponible';
      }
    } else if (diasVencer !== null && diasVencer < diasCobertura && diasVencer < 30) {
      // Va a vencer antes de venderlo
      urgencia = 'no_comprar';
      razon = `No comprar — vence en ${diasVencer}d pero cobertura actual es ${diasCobertura}d`;
      sugerido = 0;
    } else if (stock.total <= 0) {
      // Sin stock
      sugerido = Math.ceil(ventasDia * STOCK_TARGET_DIAS);
      urgencia = 'urgente';
      razon = `Sin stock — comprar para ${STOCK_TARGET_DIAS} días de venta`;
    } else if (diasCobertura <= LEAD_TIME_DIAS) {
      // Menos días que el lead time — urgente
      sugerido = Math.ceil(ventasDia * STOCK_TARGET_DIAS - stock.total);
      urgencia = 'urgente';
      razon = `Cobertura ${diasCobertura}d ≤ lead time ${LEAD_TIME_DIAS}d — pedido urgente`;
    } else if (diasCobertura <= STOCK_TARGET_DIAS) {
      // Hay que comprar
      sugerido = Math.ceil(ventasDia * STOCK_TARGET_DIAS - stock.total);
      urgencia = 'comprar';
      razon = `Cobertura ${diasCobertura}d — reponer para llegar a ${STOCK_TARGET_DIAS}d`;
    } else {
      urgencia = 'ok';
      razon = `Cobertura ${diasCobertura}d — suficiente`;
    }

    // Solo incluir en el resultado si hay ventas o si hay problema
    if (ventasDia > 0 || urgencia === 'revisar') {
      resultado.push({
        codigo,
        nombre: stock.nombre,
        stock_total: stock.total,
        ventas_por_dia: ventasDia,
        dias_cobertura: diasCobertura,
        dias_a_vencer: diasVencer,
        sugerido: Math.max(0, sugerido),
        razon,
        urgencia,
      });
    }
  });

  // Ordenar: urgente → comprar → no_comprar → revisar → ok
  const orden = { urgente: 0, comprar: 1, no_comprar: 2, revisar: 3, ok: 4 };
  return resultado.sort((a, b) => orden[a.urgencia] - orden[b.urgencia] || b.ventas_por_dia - a.ventas_por_dia);
}
