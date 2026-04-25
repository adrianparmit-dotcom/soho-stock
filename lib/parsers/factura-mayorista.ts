// @ts-nocheck
/**
 * Parser factura Mayorista Diet (Sistema de Gestion)
 *
 * Formato multi-hoja. Cada hoja tiene:
 * 1. Header: "Hoja N de M", número factura, fecha, cliente, etc.
 * 2. Bloque de CÓDIGOS: uno por línea (solo dígitos)
 * 3. Bloque de DESCRIPCIONES: texto en mayúsculas
 * 4. Bloque de IVA: "21" repetido (uno por producto)
 * 5. Datos de transporte y CUIT
 * 6. Bloque de CANTIDADES: "4 05,00" (cant + descuento%)
 *    También pueden aparecer códigos de barra intercalados (7-13 dígitos)
 * 7. Bloque de PRECIOS/SUBTOTALES intercalados:
 *    precio_unit, subtotal, precio_unit, subtotal, ...
 *
 * Verificación: subtotal = precio × cantidad × (1 - descuento/100)
 */

export interface ItemMayorista {
  codigo: string;
  descripcion: string;
  cantidad: number;
  descuento_pct: number;
  precio_unitario: number;
  subtotal: number;
  iva_pct: number;
}

export interface FacturaMayoristaParseada {
  numero: string;
  fecha: string;
  items: ItemMayorista[];
  total: number;
  warnings: string[];
}

function parseNumAR(s: string): number {
  if (!s) return 0;
  // Formato AR: "5.460,00" → quitar puntos, reemplazar coma por punto
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function esCodigo(s: string): boolean {
  // Código de producto DUX: 3-5 dígitos
  return /^\d{3,5}$/.test(s.trim());
}

function esCodigoBarra(s: string): boolean {
  // EAN/código de barra: 7-14 dígitos
  return /^\d{7,14}$/.test(s.trim());
}

function esDescripcion(s: string): boolean {
  // Descripción: contiene letras y es relativamente larga
  return /[A-ZÁÉÍÓÚÑ]/.test(s) && s.trim().length > 3 &&
    !s.includes('Sistema de Gestion') &&
    !s.includes('SANTA ROSA') &&
    !s.includes('SHUK SRL') &&
    !s.includes('RAFAELA') &&
    !s.includes('Resp.') &&
    !s.includes('CONTADO') &&
    !s.includes('AV SANTA FE') &&
    !s.includes('OBS.:') &&
    !s.includes('IVA ');
}

function esCantidad(s: string): boolean {
  // "4 00,00" o "4 05,00" o "1,5 00,00"
  return /^\d+(?:,\d+)?\s+(?:00|05),00$/.test(s.trim());
}

function parseCantidad(s: string): { cantidad: number; descuento: number } {
  const m = s.trim().match(/^(\d+(?:,\d+)?)\s+(00|05),00$/);
  if (!m) return { cantidad: 0, descuento: 0 };
  const cantidad = parseFloat(m[1].replace(',', '.'));
  const descuento = parseInt(m[2]);
  return { cantidad, descuento };
}

function esPrecioOSubtotal(s: string): boolean {
  // Número con formato AR: "5.460,00" o "20.748,00"
  return /^[\d.]+,\d{2}$/.test(s.trim()) && s.trim().length > 4;
}

function esHojaHeader(s: string): boolean {
  return /^Hoja\s+\d+\s+de\s+\d+$/i.test(s.trim());
}

export function parsearFacturaMayorista(texto: string): FacturaMayoristaParseada {
  const warnings: string[] = [];
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  // Extraer número de factura y fecha
  let numero = '';
  let fecha = '';
  for (let i = 0; i < Math.min(lineas.length, 10); i++) {
    if (/^\d{4}\s*-\s*\d{8}$/.test(lineas[i])) numero = lineas[i];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(lineas[i]) && !fecha) fecha = lineas[i];
  }

  // Dividir en hojas
  const hojas: string[][] = [];
  let hojaActual: string[] = [];
  for (const linea of lineas) {
    if (esHojaHeader(linea) && hojaActual.length > 0) {
      hojas.push(hojaActual);
      hojaActual = [];
    }
    hojaActual.push(linea);
  }
  if (hojaActual.length > 0) hojas.push(hojaActual);

  const todosItems: ItemMayorista[] = [];

  for (const hoja of hojas) {
    const codigos: string[] = [];
    const descripciones: string[] = [];
    const cantidades: Array<{ cantidad: number; descuento: number }> = [];
    const numerosFinancieros: number[] = [];

    let fase: 'header' | 'codigos' | 'descripciones' | 'post' = 'header';

    for (const linea of hoja) {
      // Saltar headers de hoja
      if (esHojaHeader(linea)) continue;
      if (/^\d{4}\s*-\s*\d{8}$/.test(linea)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(linea)) continue;
      if (/^(SHUK|AV SANTA|RAFAELA|Resp\.|CONTADO|SANTA ROSA|3492598783|33-71723858|BON|86161960|OBS\.:)/i.test(linea)) continue;
      if (linea === '21') continue; // fila de IVA

      if (esCodigo(linea)) {
        codigos.push(linea);
        if (fase === 'header') fase = 'codigos';
        continue;
      }

      if (esCodigoBarra(linea)) continue; // ignorar códigos de barra

      if (esDescripcion(linea) && fase === 'codigos') {
        fase = 'descripciones';
      }

      if (fase === 'descripciones' && esDescripcion(linea)) {
        descripciones.push(linea);
        continue;
      }

      if (esCantidad(linea)) {
        if (fase === 'descripciones') fase = 'post';
        cantidades.push(parseCantidad(linea));
        continue;
      }

      if (esPrecioOSubtotal(linea) && fase === 'post') {
        const n = parseNumAR(linea);
        if (n > 0) numerosFinancieros.push(n);
        continue;
      }
    }

    // Combinar: precio y subtotal vienen intercalados
    // precio1, subtotal1, precio2, subtotal2, ...
    // Pero pueden aparecer otros números grandes al final (total de hoja, etc.)
    // Filtramos usando la verificación: subtotal ≈ precio × cantidad × (1 - desc/100)

    const nProd = Math.min(codigos.length, descripciones.length, cantidades.length);

    // Emparejar precios y subtotales
    // Los primeros nProd×2 números son precio+subtotal intercalados
    for (let i = 0; i < nProd; i++) {
      const { cantidad, descuento } = cantidades[i];
      if (cantidad <= 0) continue;

      // Buscar el par precio/subtotal correcto
      // Pueden estar en posición i*2 y i*2+1, o puede haber números extra
      let precioUnit = 0;
      let subtotal = 0;

      if (numerosFinancieros.length >= (i + 1) * 2) {
        const candidatoA = numerosFinancieros[i * 2];
        const candidatoB = numerosFinancieros[i * 2 + 1];
        // Verificar cuál es el precio y cuál el subtotal
        const calcB = Math.round(candidatoA * cantidad * (1 - descuento / 100));
        const calcA = Math.round(candidatoB * cantidad * (1 - descuento / 100));
        if (Math.abs(calcB - Math.round(candidatoB)) < 5) {
          precioUnit = candidatoA;
          subtotal = candidatoB;
        } else if (Math.abs(calcA - Math.round(candidatoA)) < 5) {
          precioUnit = candidatoB;
          subtotal = candidatoA;
        } else {
          // No matchea exacto, tomar como viene
          precioUnit = candidatoA;
          subtotal = candidatoB;
        }
      } else if (numerosFinancieros.length > i * 2) {
        precioUnit = numerosFinancieros[i * 2];
      }

      todosItems.push({
        codigo: codigos[i],
        descripcion: descripciones[i] || `PRODUCTO ${codigos[i]}`,
        cantidad,
        descuento_pct: descuento,
        precio_unitario: precioUnit,
        subtotal,
        iva_pct: 21,
      });
    }
  }

  if (todosItems.length === 0) {
    warnings.push('No se pudieron parsear items del Mayorista. Verificá que el texto es de la factura correcta.');
  }

  // Total
  const totalMatch = texto.match(/([\d.]+,\d{2})\s*$/) ||
                     texto.match(/(\d[\d.]+,\d{2})\s*IVA\s+21/);
  const total = todosItems.reduce((a, i) => a + i.subtotal, 0);

  return {
    numero,
    fecha,
    items: todosItems,
    total,
    warnings,
  };
}
