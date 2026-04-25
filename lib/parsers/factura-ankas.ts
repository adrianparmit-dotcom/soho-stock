// @ts-nocheck
/**
 * Parser de factura Ankas del Sur — versión robusta para texto de PDF
 *
 * El PDF al copiarse con Ctrl+A sale en dos posibles formatos:
 *
 * FORMATO A (limpio - segunda factura):
 *   QUINOA BLANCA LAVADA 1 KG  3.00  KG  6,097.00  18,291.00  3.00  10.50
 *
 * FORMATO B (caótico - primera factura):
 *   Las descripciones y números están mezclados en el texto
 *   pero los bloques numéricos siempre siguen el patrón:
 *   N.00 KG PRECIO.00 SUBTOTAL.00 BULTOS.00 IVA.00
 *   o
 *   N.00 UN PRECIO.00 SUBTOTAL.00 BULTOS.00 IVA.00
 *
 * Estrategia: extraer todos los bloques numéricos con su unidad,
 * y emparejarlos con las descripciones en el mismo orden que el DUX.
 */

export interface ItemFacturaAnkas {
  descripcion_raw: string;
  cantidad: number;
  unidad: string;        // KG o UN
  precio_unitario: number;
  subtotal: number;
  bultos: number;
  iva_pct: number;
  peso_por_bulto_kg: number | null;
  kg_totales: number;
  es_granel: boolean;
}

export interface FacturaAnkasParseada {
  items: ItemFacturaAnkas[];
  total_bultos: number;
  cantidad_total: number;
  warnings: string[];
}

function parseNumAR(s: string): number {
  if (!s) return 0;
  // Formato argentino: 6,820.00 o 68,200.00
  const clean = s.replace(/,/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function extraerPesoDescripcion(desc: string): number | null {
  // Busca patrón como "5 KG", "2,5 KG", "3KG" al final o en el medio
  const m = desc.match(/(\d+(?:[,.]\d+)?)\s*KG/i);
  if (!m) return null;
  const peso = parseFloat(m[1].replace(',', '.'));
  return isNaN(peso) ? null : peso;
}

export function parsearFacturaAnkas(texto: string): FacturaAnkasParseada {
  const warnings: string[] = [];

  // Normalizar espacios pero preservar estructura
  const norm = texto.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();

  // Cortar en ORIGINAL/DUPLICADO — tomar solo la primera mitad
  const dupIdx = norm.indexOf('DUPLICADO');
  const textoLimpio = dupIdx > 100 ? norm.slice(0, dupIdx) : norm;

  // Estrategia: buscar todos los bloques de datos numéricos de una fila Ankas
  // Patrón: CANTIDAD.NN UNIDAD PRECIO.NN SUBTOTAL.NN BULTOS.NN IVA.NN
  // Ej: "10.00 KG 6,820.00 68,200.00 2.00 21.00"
  // Ej: "2.00 UN 13,089.00 26,178.00 2.00 21.00"
  const bloqueRegex = /(\d+\.\d{2})\s+(KG|UN|UNI)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d+\.\d{2})\s+(\d{1,2}(?:\.\d{1,2})?)/g;

  const bloques: Array<{
    cantidad: number;
    unidad: string;
    precio: number;
    subtotal: number;
    bultos: number;
    iva: number;
    index: number;
  }> = [];

  let m;
  while ((m = bloqueRegex.exec(textoLimpio)) !== null) {
    const cantidad = parseFloat(m[1]);
    const subtotal = parseNumAR(m[4]);
    // Filtrar bloques que no tienen sentido (subtotal 0 o cantidad 0)
    if (cantidad <= 0 || subtotal <= 0) continue;

    bloques.push({
      cantidad,
      unidad: m[2].toUpperCase(),
      precio: parseNumAR(m[3]),
      subtotal,
      bultos: parseFloat(m[5]),
      iva: parseFloat(m[6]),
      index: m.index,
    });
  }

  if (bloques.length === 0) {
    // Fallback: intentar con el regex original de formato limpio
    return parsearFormatoLimpio(texto, warnings);
  }

  // Ahora extraer las descripciones — todo el texto que NO es parte de bloques numéricos
  // Las descripciones están intercaladas, en el mismo orden que los bloques
  // Estrategia: dividir el texto en segmentos entre bloques y extraer descripciones

  const items: ItemFacturaAnkas[] = [];

  // Para cada bloque, buscar la descripción que lo precede
  // Tomamos el texto entre el bloque anterior y el bloque actual
  let textoAnterior = textoLimpio;

  // Extraer todas las posiciones de los bloques
  const posiciones = bloques.map(b => ({
    ...b,
    texto: textoLimpio.slice(b.index),
  }));

  // Reconstruir descripción buscando texto que parezca descripción de producto
  // Dividimos el texto completo en tokens y separamos texto de números
  const tokens = textoLimpio.split(/\s+/);
  const descripcionesExtraidas: string[] = [];

  // Buscar secuencias de palabras (mayúsculas) entre los bloques numéricos
  // Cada descripción termina cuando empieza el patrón numérico del bloque
  let descActual = '';
  let bloqueIdx = 0;
  let i = 0;

  while (i < tokens.length && bloqueIdx < bloques.length) {
    const token = tokens[i];
    const bloque = bloques[bloqueIdx];

    // Detectar si los próximos tokens forman el inicio de este bloque
    const cantStr = bloque.cantidad.toFixed(2);
    if (token === cantStr && i + 1 < tokens.length &&
        (tokens[i + 1] === 'KG' || tokens[i + 1] === 'UN' || tokens[i + 1] === 'UNI')) {

      // Llegamos al bloque — guardar descripción acumulada
      const desc = descActual.trim();
      if (desc.length > 2) {
        descripcionesExtraidas.push(desc);
      } else {
        descripcionesExtraidas.push(`PRODUCTO ${bloqueIdx + 1}`);
      }
      descActual = '';
      bloqueIdx++;
      i += 6; // saltar el bloque completo (cant + unidad + precio + subtotal + bultos + iva)
    } else {
      // Es parte de descripción — agregar si parece texto de producto
      // Filtrar tokens que son claramente basura del header/footer
      const isBasura = /^(ORIGINAL|DUPLICADO|FACTURA|ELECTRONICA|COD|SHUK|SRL|AGEO|CULZONI|RAFAELA|Responsable|inscripto|CHEQUE|CUIT|Santa|TOTAL|IVA|C\.A\.E|Vto|Total|Bultos|Cantidad|total|Lugar|Entrega|AV\.|ZOBOLLI|Comentarios|TRANSP|PERGAMINO|VD|\$|00003|10656|33-|30-)/.test(token);
      if (!isBasura && token.length > 0 && !/^\d{4,}$/.test(token)) {
        descActual += (descActual ? ' ' : '') + token;
      }
      i++;
    }
  }

  // Construir items combinando bloques con descripciones
  for (let idx = 0; idx < bloques.length; idx++) {
    const bloque = bloques[idx];
    const descripcion = descripcionesExtraidas[idx] || `PRODUCTO ${idx + 1}`;
    const pesoPorBulto = extraerPesoDescripcion(descripcion);

    let kgTotales = 0;
    let esGranel = false;

    if (bloque.unidad === 'KG') {
      kgTotales = bloque.cantidad;
      esGranel = true;
    } else if (pesoPorBulto !== null) {
      kgTotales = bloque.cantidad * pesoPorBulto;
      esGranel = true;
    } else {
      kgTotales = 0;
      esGranel = false;
    }

    items.push({
      descripcion_raw: descripcion,
      cantidad: bloque.cantidad,
      unidad: bloque.unidad,
      precio_unitario: bloque.precio,
      subtotal: bloque.subtotal,
      bultos: bloque.bultos,
      iva_pct: bloque.iva,
      peso_por_bulto_kg: pesoPorBulto,
      kg_totales: kgTotales,
      es_granel: esGranel,
    });
  }

  const total_bultos = items.reduce((a, i) => a + i.bultos, 0);
  const cantidad_total = items.reduce((a, i) => a + i.cantidad, 0);

  if (items.length === 0) {
    warnings.push('No se pudo parsear ningún item de la factura Ankas.');
  }

  return { items, total_bultos, cantidad_total, warnings };
}

/**
 * Fallback para formato limpio (texto bien ordenado)
 */
function parsearFormatoLimpio(texto: string, warnings: string[]): FacturaAnkasParseada {
  const norm = texto.replace(/\s+/g, ' ').trim();
  const dupIdx = norm.indexOf('DUPLICADO');
  const textoLimpio = dupIdx > 100 ? norm.slice(0, dupIdx) : norm;

  const filaRegex =
    /([A-ZÁÉÍÓÚÑ][A-Z0-9ÁÉÍÓÚÑ\s\/\.\-,]+?)\s+(\d+(?:\.\d{1,3})?)\s+(KG|KILOS?|UN|UNI|U)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d+(?:\.\d{1,2})?)\s+(\d{1,2}(?:\.\d{1,2})?)/g;

  const items: ItemFacturaAnkas[] = [];
  const vistos = new Set<string>();
  let match;

  while ((match = filaRegex.exec(textoLimpio)) !== null) {
    const [, descRaw, cantStr, unidad, precioStr, subStr, bultosStr, ivaStr] = match;
    const descripcion = descRaw.trim();
    const cantidad = parseFloat(cantStr);
    const subtotal = parseNumAR(subStr);
    const clave = `${descripcion}|${cantidad}|${subtotal}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const unidadUpper = unidad.toUpperCase();
    const pesoPorBulto = extraerPesoDescripcion(descripcion);
    let kgTotales = 0;
    let esGranel = false;

    if (unidadUpper === 'KG' || unidadUpper.startsWith('KILO')) {
      kgTotales = cantidad;
      esGranel = true;
    } else if (pesoPorBulto !== null) {
      kgTotales = cantidad * pesoPorBulto;
      esGranel = true;
    }

    items.push({
      descripcion_raw: descripcion,
      cantidad,
      unidad: unidadUpper,
      precio_unitario: parseNumAR(precioStr),
      subtotal,
      bultos: parseFloat(bultosStr),
      iva_pct: parseFloat(ivaStr),
      peso_por_bulto_kg: pesoPorBulto,
      kg_totales: kgTotales,
      es_granel: esGranel,
    });
  }

  const total_bultos = items.reduce((a, i) => a + i.bultos, 0);
  const cantidad_total = items.reduce((a, i) => a + i.cantidad, 0);

  if (items.length === 0) warnings.push('No se pudo parsear ningún item de la factura Ankas.');

  return { items, total_bultos, cantidad_total, warnings };
}
