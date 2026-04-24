// @ts-nocheck
/**
 * Parser de factura Ankas del Sur.
 *
 * Formato (columnas):
 *   DESCRIPCION_CON_PESO   CANT.UN  UNIDAD   PRECIO    SUBTOTAL   BULTOS  IVA%
 *
 * Ejemplos:
 *   CASTAÑA DE CAJU W4 BRASIL 5 KG     5.00  KG   11,118.00  55,590.00  1.00  21.00
 *   NUEZ MARIPOSA EXTRA LIGHT 10 KG   20.00  KG   15,319.00 306,380.00  2.00  21.00
 *   ALMOHADITAS FRUTILLA LASFOR 2,5 KG  2.00  UN  13,089.00  26,178.00  2.00  21.00  ← EDGE CASE
 *
 * Lógica para calcular kg_total reales:
 *   - Si la descripción termina en "N KG" o "N,N KG" → N es peso por bulto
 *   - Si unidad = KG: la cantidad ya representa kg totales
 *   - Si unidad = UN + descripción tiene peso: kg_total = cant × peso_por_bulto
 *   - Si unidad = UN sin peso en descripción: producto unitario, no granel
 */

export interface ItemFacturaAnkas {
  descripcion_raw: string;
  cantidad: number;      // valor de la columna Cantidad
  unidad: string;        // KG o UN
  precio_unitario: number;
  subtotal: number;
  bultos: number;
  iva_pct: number;
  peso_por_bulto_kg: number | null; // extraído de la descripción
  kg_totales: number;    // siempre en kg si es granel
  es_granel: boolean;
}

export interface FacturaAnkasParseada {
  items: ItemFacturaAnkas[];
  total_bultos: number;
  cantidad_total: number;
  warnings: string[];
}

function parseNumUS(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/,/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Extrae el peso por bulto de la descripción.
 * Ej: "CASTAÑA 5 KG" → 5
 * Ej: "ALMOHADITAS 2,5 KG" → 2.5
 * Ej: "COCO FILIPINA3 KG" → 3 (sin espacio)
 * Ej: "CACAO SOCAU 351 5 KG" → 5 (el peso es 5, no 3515)
 * Ej: "PRODUCTO X12U" → null (no es KG)
 */
function extraerPesoDescripcion(desc: string): number | null {
  // El peso viene justo antes de "KG", separado por espacio o pegado.
  // Formato: (\d+) o (\d+,\d+) o (\d+.\d+) seguido de "KG"
  // NO aceptamos espacios DENTRO del número.
  const m = desc.match(/(\d+(?:[,.]\d+)?)\s*(?:KG|KILOS?)\s*$/i);
  if (!m) return null;
  const pesoStr = m[1].replace(',', '.');
  const peso = parseFloat(pesoStr);
  return isNaN(peso) ? null : peso;
}

export function parsearFacturaAnkas(texto: string): FacturaAnkasParseada {
  const warnings: string[] = [];
  const normalizado = texto.replace(/\s+/g, ' ').trim();

  // Regex de fila Ankas:
  //   [descripción] [cant.N.NN] [UNIDAD] [precio] [subtotal] [bultos] [iva%]
  const filaRegex =
    /([A-ZÁÉÍÓÚÑ][A-Z0-9ÁÉÍÓÚÑ\s\/\.\-,]+?)\s+(\d+(?:\.\d{1,3})?)\s+(KG|KILOS?|UN|UNI|U)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d+(?:\.\d{1,2})?)\s+(\d{1,2}(?:\.\d{1,2})?)/g;

  const items: ItemFacturaAnkas[] = [];
  const vistos = new Set<string>();
  let match;

  while ((match = filaRegex.exec(normalizado)) !== null) {
    const [, descRaw, cantStr, unidad, precioStr, subStr, bultosStr, ivaStr] = match;
    const descripcion = descRaw.trim().replace(/\s+/g, ' ');
    const cantidad = parseFloat(cantStr);
    const subtotal = parseNumUS(subStr);

    // Dedupe (original + duplicado)
    const clave = `${descripcion}|${cantidad}|${subtotal}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const unidadUpper = unidad.toUpperCase();
    const pesoPorBulto = extraerPesoDescripcion(descripcion);

    // Calcular kg totales según el caso
    let kgTotales = 0;
    let esGranel = false;

    if (unidadUpper === 'KG' || unidadUpper.startsWith('KILO')) {
      // Caso normal: la cantidad ya es kg
      kgTotales = cantidad;
      esGranel = true;
    } else if (pesoPorBulto !== null) {
      // Caso almohaditas: unidad UN pero hay peso por bulto
      kgTotales = cantidad * pesoPorBulto;
      esGranel = true;
    } else {
      // Producto unitario común
      kgTotales = 0;
      esGranel = false;
    }

    items.push({
      descripcion_raw: descripcion,
      cantidad,
      unidad: unidadUpper,
      precio_unitario: parseNumUS(precioStr),
      subtotal,
      bultos: parseFloat(bultosStr),
      iva_pct: parseFloat(ivaStr),
      peso_por_bulto_kg: pesoPorBulto,
      kg_totales: kgTotales,
      es_granel: esGranel,
    });
  }

  // Totales opcionales
  const tbMatch = normalizado.match(/Total\s+de\s+Bultos:\s*(\d+(?:\.\d{1,2})?)/i);
  const ctMatch = normalizado.match(/Cantidad\s+total:\s*(\d+(?:\.\d{1,2})?)/i);

  const total_bultos = tbMatch
    ? parseFloat(tbMatch[1])
    : items.reduce((a, i) => a + i.bultos, 0);
  const cantidad_total = ctMatch
    ? parseFloat(ctMatch[1])
    : items.reduce((a, i) => a + i.cantidad, 0);

  if (items.length === 0) {
    warnings.push('No se pudo parsear ningún item de la factura Ankas.');
  }

  return { items, total_bultos, cantidad_total, warnings };
}
