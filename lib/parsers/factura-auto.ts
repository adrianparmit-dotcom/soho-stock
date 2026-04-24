// @ts-nocheck
import { parsearFacturaAnkas, FacturaAnkasParseada, ItemFacturaAnkas } from './factura-ankas';
import { parsearFacturaMayorista, FacturaMayoristaParseada, ItemMayorista } from './factura-mayorista';

export type FormatoFactura = 'ankas' | 'mayorista' | 'desconocido';

export interface ItemUnificado {
  codigo: string | null;       // solo Mayorista trae código
  descripcion: string;
  cantidad: number;
  kg_totales: number;
  es_granel: boolean;
  precio_unitario: number;
  subtotal: number;
  bultos: number | null;       // solo Ankas lo trae
  peso_por_bulto_kg: number | null;
}

export interface FacturaParseada {
  formato: FormatoFactura;
  items: ItemUnificado[];
  warnings: string[];
}

function detectarFormato(texto: string): FormatoFactura {
  const t = texto.toUpperCase();
  // Ankas: suele tener "CHEQUE", "C.A.E.", columnas KG/UN claras, "Total de Bultos:", "Cantidad total:"
  const ankasScore =
    (t.includes('TOTAL DE BULTOS') ? 2 : 0) +
    (t.includes('CANTIDAD TOTAL') ? 2 : 0) +
    ((t.match(/\d+\.\d{2}\s+KG\s/g) || []).length > 3 ? 2 : 0);

  // Mayorista Diet: tiene "Sistema de Gestion", "Hoja X de Y", "Resp. Inscripto",
  // descripciones terminadas en " KG" sin valor numérico
  const mayoristaScore =
    (t.includes('SISTEMA DE GESTION') ? 2 : 0) +
    (t.includes('RESP. INSCRIPTO') ? 1 : 0) +
    ((t.match(/\s(?:KG|XKG)\s+\d+\s+\d{2},\d{2}/g) || []).length > 2 ? 2 : 0);

  if (ankasScore > mayoristaScore && ankasScore >= 2) return 'ankas';
  if (mayoristaScore > ankasScore && mayoristaScore >= 2) return 'mayorista';
  return 'desconocido';
}

export function parsearFacturaAutomatico(texto: string): FacturaParseada {
  const formato = detectarFormato(texto);

  if (formato === 'ankas') {
    const r = parsearFacturaAnkas(texto);
    const items: ItemUnificado[] = r.items.map((it: ItemFacturaAnkas) => ({
      codigo: null,
      descripcion: it.descripcion_raw,
      cantidad: it.cantidad,
      kg_totales: it.kg_totales,
      es_granel: it.es_granel,
      precio_unitario: it.precio_unitario,
      subtotal: it.subtotal,
      bultos: it.bultos,
      peso_por_bulto_kg: it.peso_por_bulto_kg,
    }));
    return { formato, items, warnings: r.warnings };
  }

  if (formato === 'mayorista') {
    const r = parsearFacturaMayorista(texto);
    const items: ItemUnificado[] = r.items.map((it: ItemMayorista) => ({
      codigo: it.codigo,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      kg_totales: it.kg_totales,
      es_granel: it.es_granel,
      precio_unitario: it.precio_unitario,
      subtotal: it.subtotal,
      bultos: null,
      peso_por_bulto_kg: null,
    }));
    return { formato, items, warnings: r.warnings };
  }

  return {
    formato: 'desconocido',
    items: [],
    warnings: [
      'No pudimos detectar el formato de la factura. Soportamos Ankas y Mayorista Diet.',
    ],
  };
}
