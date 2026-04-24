// @ts-nocheck
/**
 * Parser de factura Mayorista Diet.
 *
 * Formato por fila:
 *   CODIGO DESCRIPCION CANT BONIFICACION PRECIO SUBTOTAL
 *   IVA
 *
 * Las filas están separadas por el IVA (1-2 dígitos solos en una "posición")
 * pero como normalizamos espacios, tenemos que detectarlas por patrón.
 *
 * Anatomía de una fila típica:
 *   [CODIGO]  [DESCRIPCION + UNIDAD]  [cant]  [NN,NN bonif]  [precio con . y ,]  [subtotal]
 *   Después viene el IVA (21 o 10,50) en la siguiente "posición".
 *
 * Ejemplos REALES:
 *   3410 ACEITE DE CHIA X150 CC SOL AZTECA 4 05,00 5.460,00 20.748,00
 *   21
 *   4222 MOSTAZA MOLIDA KG 3 05,00 5.611,62 15.993,12
 *   21
 *
 * Al concatenar todo en una línea queda:
 *   ... 3410 ACEITE DE CHIA X150 CC SOL AZTECA 4 05,00 5.460,00 20.748,00 21 4222 MOSTAZA MOLIDA KG 3 05,00 ...
 *
 * Estrategia: usar el patrón "N NN,NN X.XXX,XX Y.YYY,YY ZZ[.ZZ]" (cant bonif precio subtotal iva)
 * como terminador de fila. Todo lo que viene antes = código + descripción.
 */

export interface ItemMayorista {
  codigo: string;
  descripcion: string;
  cantidad: number;
  kg_totales: number;
  es_granel: boolean;
  bonif_pct: number;
  precio_unitario: number;
  subtotal: number;
  iva_pct: number;
}

export interface FacturaMayoristaParseada {
  items: ItemMayorista[];
  warnings: string[];
}

function parseNumAR(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseCant(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function parsearFacturaMayorista(texto: string): FacturaMayoristaParseada {
  const warnings: string[] = [];
  const normalizado = texto.replace(/\s+/g, ' ').trim();

  // Estrategia: buscar terminadores de fila por el patrón
  //   cant(digitos) NN,NN (bonif) precio,XX subtotal,XX iva
  //
  // Donde:
  //   cant = \d+(?:,\d+)?  (ej "4" o "1,5")
  //   bonif = \d{2},\d{2}  (ej "00,00" o "05,00")
  //   precio = (\d+\.)*\d+,\d{2}  (ej "5.460,00" o "290,77")
  //   subtotal = idem precio
  //   iva = \d{1,2}(?:,\d{1,2})? (ej "21" o "10,50")
  //
  // Todo lo que viene antes hasta el match anterior = código + descripción
  const terminadorRegex =
    /(\d+(?:,\d+)?)\s+(\d{2},\d{2})\s+((?:\d+\.)*\d+,\d{2})\s+((?:\d+\.)*\d+,\d{2})\s+(\d{1,2}(?:,\d{1,2})?)/g;

  const matches: Array<{ start: number; end: number; cant: string; bonif: string; precio: string; subtotal: string; iva: string }> = [];
  let m;
  while ((m = terminadorRegex.exec(normalizado)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      cant: m[1],
      bonif: m[2],
      precio: m[3],
      subtotal: m[4],
      iva: m[5],
    });
  }

  const items: ItemMayorista[] = [];
  let lastEnd = 0;

  for (const mt of matches) {
    // Texto entre el fin del match anterior y el inicio de este
    let descCompleta = normalizado.slice(lastEnd, mt.start).trim();

    // Limpiar basura del principio: fechas, "Hoja X de Y", "SHUK SRL", etc.
    // Nos quedamos con lo que empiece en el primer token que parezca código
    // (número de 3+ dígitos o alfanumérico tipo "T00130" o código de barras largo)
    const codigoRegex = /(?:^|\s)(T?\d{2,}|\d+[A-Z0-9]{3,})\s+(.+)$/;
    const match = descCompleta.match(codigoRegex);

    if (match) {
      let codigo = match[1];
      let descripcion = match[2].trim();

      // Caso especial: si la descripción contiene otro código al principio
      // (pasa con el primer item donde el código real va precedido por el header de la página),
      // intentamos re-extraer. Buscamos el ÚLTIMO patrón "código descripción" antes del fin.
      // Ej: "86... Sistema... SHUK... 17/04/2026 733 CARAMELOS..."
      // queremos codigo=733 y desc="CARAMELOS..."
      const reExtraer = descripcion.match(/(?:^|\s)(\d{2,6})\s+([A-ZÁÉÍÓÚÑ].+)$/);
      if (reExtraer && /^(?:86|77|79|17|27|Hoja|Sistema|SHUK|BON|CONTADO|Resp|AV|RAFAELA|Santa)/i.test(codigo + ' ' + descripcion.slice(0, 30))) {
        codigo = reExtraer[1];
        descripcion = reExtraer[2].trim();
      }

      // Filtrar encabezados accidentales
      if (/^(Hoja|17\/04|SHUK|AV|BON|Sistema|Resp|Santa|Rafaela|CONTADO)/i.test(codigo)) {
        lastEnd = mt.end;
        continue;
      }

      const cantidad = parseCant(mt.cant);
      const esGranelKg = /(?:^|\s)KG\s*$/i.test(descripcion);
      const esGranelXKG = /\sXKG\s+\w+/i.test(descripcion);
      const esGranel = esGranelKg || esGranelXKG;

      items.push({
        codigo,
        descripcion,
        cantidad,
        kg_totales: esGranel ? cantidad : 0,
        es_granel: esGranel,
        bonif_pct: parseNumAR(mt.bonif),
        precio_unitario: parseNumAR(mt.precio),
        subtotal: parseNumAR(mt.subtotal),
        iva_pct: parseCant(mt.iva),
      });
    }

    lastEnd = mt.end;
  }

  if (items.length === 0) {
    warnings.push('No se pudo parsear ningún item de la factura Mayorista Diet.');
  }

  return { items, warnings };
}
