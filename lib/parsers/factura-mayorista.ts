// @ts-nocheck
/**
 * Parser factura Mayorista Diet (Sistema de Gestion) — versión robusta
 *
 * Estructura por hoja:
 * 1. Header (Hoja N de M, fecha, cliente, etc.)
 * 2. Bloque CODIGOS DUX (3-5 dígitos, uno por línea)
 * 3. Bloque DESCRIPCIONES (texto en mayúsculas)
 * 4. Bloque IVA (líneas "21")
 * 5. Datos transporte (SANTA ROSA, CUIT, BON, etc.)
 * 6. Bloque CANTIDADES mezclado con:
 *    - Cantidades propias: "4 00,00" o "4 05,00"
 *    - Códigos de barra de productos extra (7-14 dígitos)
 *    - Descripciones de productos extra
 *    - Cantidades de productos extra
 *    - Código CAE al final (86161960...)
 * 7. Bloque PRECIOS/SUBTOTALES: precio_unit, subtotal intercalados
 * 8. Fecha + "Sistema de Gestion"
 *
 * La lógica clave: los productos "extra" (con código de barra) se intercalan
 * en la sección de cantidades. Hay que detectarlos y procesarlos por separado.
 */

export interface ItemMayorista {
  codigo: string;        // código DUX o código de barra
  descripcion: string;
  cantidad: number;
  descuento_pct: number;
  precio_unitario: number;
  subtotal: number;
  iva_pct: number;
  tiene_codigo_dux: boolean;
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
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function esCodDUX(s: string): boolean {
  return /^\d{3,5}$/.test(s.trim());
}

function esCodigoBarra(s: string): boolean {
  return /^\d{7,14}$/.test(s.trim());
}

function esCAE(s: string): boolean {
  // CAE tiene 14 dígitos y empieza con 86
  return /^86\d{12}$/.test(s.trim());
}

function esCantidad(s: string): boolean {
  return /^\d+(?:,\d+)?\s+(?:00|05),00$/.test(s.trim());
}

function parseCantidad(s: string): { cantidad: number; descuento: number } {
  const m = s.trim().match(/^(\d+(?:,\d+)?)\s+(00|05),00$/);
  if (!m) return { cantidad: 0, descuento: 0 };
  return { cantidad: parseFloat(m[1].replace(',', '.')), descuento: parseInt(m[2]) };
}

function esPrecio(s: string): boolean {
  return /^[\d.]+,\d{2}$/.test(s.trim()) && s.trim().length >= 5 && !esCantidad(s);
}

function esHeaderLinea(s: string): boolean {
  const t = s.trim();
  return /^Hoja\s+\d+\s+de\s+\d+$/i.test(t) ||
    /^\d{4}\s*-\s*\d{8}$/.test(t) ||
    /^\d{2}\/\d{2}\/\d{4}$/.test(t) ||
    t === 'SHUK SRL' || t === 'RAFAELA' ||
    t.startsWith('AV SANTA FE') ||
    t === 'Resp. Inscripto' || t === 'CONTADO' ||
    t.startsWith('SANTA ROSA') ||
    t === '3492598783' || t === '33-71723858-9' || t === 'BON' ||
    t === 'Sistema de Gestion' ||
    /^27\/\d{2}\/\d{4}$/.test(t);
}

function esIVA(s: string): boolean {
  return s.trim() === '21' || s.trim() === '10,50' || s.trim() === '10.50';
}

function esDescripcion(s: string): boolean {
  const t = s.trim();
  return t.length > 3 && /[A-ZÁÉÍÓÚÑ]/.test(t) && !esHeaderLinea(t) && !esIVA(t);
}

export function parsearFacturaMayorista(texto: string): FacturaMayoristaParseada {
  const warnings: string[] = [];
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  // Extraer número y fecha
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
    if (/^Hoja\s+\d+\s+de\s+\d+$/i.test(linea) && hojaActual.length > 0) {
      hojas.push(hojaActual);
      hojaActual = [];
    }
    hojaActual.push(linea);
  }
  if (hojaActual.length > 0) hojas.push(hojaActual);

  const todosItems: ItemMayorista[] = [];

  for (const hoja of hojas) {
    // Fase 1: separar bloques
    const codigosDUX: string[] = [];
    const descripciones: string[] = [];
    let fase: 'header' | 'codigos' | 'descripciones' | 'rest' = 'header';

    // Encontrar dónde terminan los códigos y empiezan las descripciones
    let idxFinCodigos = -1;
    let idxIniDesc = -1;
    let idxFinDesc = -1;

    for (let i = 0; i < hoja.length; i++) {
      const l = hoja[i];
      if (esHeaderLinea(l) || esIVA(l)) continue;

      if (esCodDUX(l) && fase === 'header') fase = 'codigos';
      if (esCodDUX(l) && fase === 'codigos') {
        codigosDUX.push(l);
        idxFinCodigos = i;
        continue;
      }

      if (esDescripcion(l) && fase === 'codigos') {
        fase = 'descripciones';
        idxIniDesc = i;
      }
      if (esDescripcion(l) && fase === 'descripciones') {
        descripciones.push(l);
        idxFinDesc = i;
        continue;
      }

      if (fase === 'descripciones' && !esDescripcion(l)) {
        fase = 'rest';
      }
    }

    // Fase 2: procesar el bloque "rest" (cantidades + precios mezclados con extras)
    const restLineas = idxFinDesc >= 0 ? hoja.slice(idxFinDesc + 1) : [];

    // En el bloque rest, identificar:
    // - Cantidades de productos DUX (en el mismo orden que los códigos)
    // - Productos extra (código de barra → descripción → cantidad)
    // - Números financieros (precio/subtotal)

    const cantidadesDUX: Array<{ cantidad: number; descuento: number }> = [];
    const productosExtra: Array<{ codigoBarra: string; descripcion: string; cantidad: number; descuento: number }> = [];
    const numerosFinancieros: number[] = [];

    let i = 0;
    while (i < restLineas.length) {
      const l = restLineas[i];

      if (esHeaderLinea(l) || esIVA(l)) { i++; continue; }
      if (esCAE(l)) { i++; continue; }

      if (esCodigoBarra(l)) {
        // Producto extra: código de barra → descripción → cantidad
        const codigoBarra = l;
        let desc = '';
        let cantExtra = { cantidad: 0, descuento: 0 };

        // Buscar descripción siguiente
        if (i + 1 < restLineas.length && esDescripcion(restLineas[i + 1])) {
          desc = restLineas[i + 1];
          i += 2;
          // Buscar cantidad siguiente
          if (i < restLineas.length && esCantidad(restLineas[i])) {
            cantExtra = parseCantidad(restLineas[i]);
            i++;
          }
        } else {
          i++;
        }

        if (cantExtra.cantidad > 0) {
          productosExtra.push({ codigoBarra, descripcion: desc, ...cantExtra });
        }
        continue;
      }

      if (esCantidad(l)) {
        // Si todavía faltan cantidades para los DUX, es de DUX
        if (cantidadesDUX.length < codigosDUX.length) {
          cantidadesDUX.push(parseCantidad(l));
        } else {
          // Extra sin código de barra previo — ignorar
        }
        i++;
        continue;
      }

      if (esPrecio(l)) {
        const n = parseNumAR(l);
        if (n > 0) numerosFinancieros.push(n);
        i++;
        continue;
      }

      i++;
    }

    // Fase 3: armar items DUX
    const nDUX = Math.min(codigosDUX.length, descripciones.length, cantidadesDUX.length);

    // Los números financieros vienen intercalados: precio1, sub1, precio2, sub2...
    // Pero pueden tener números extra al final (totales de hoja)
    // Usamos verificación para encontrar el par correcto
    for (let j = 0; j < nDUX; j++) {
      const { cantidad, descuento } = cantidadesDUX[j];
      if (cantidad <= 0) continue;

      let precioUnit = 0;
      let subtotal = 0;

      // Los financieros de DUX vienen primero, luego los de extras mezclados
      // Posición esperada: j*2 y j*2+1
      if (j * 2 + 1 < numerosFinancieros.length) {
        const a = numerosFinancieros[j * 2];
        const b = numerosFinancieros[j * 2 + 1];
        // Verificar cuál es precio y cuál subtotal
        // subtotal ≈ precio × cantidad × (1 - desc/100)
        const checkAB = Math.abs(a * cantidad * (1 - descuento / 100) - b) < Math.max(b * 0.01, 10);
        const checkBA = Math.abs(b * cantidad * (1 - descuento / 100) - a) < Math.max(a * 0.01, 10);
        if (checkAB) { precioUnit = a; subtotal = b; }
        else if (checkBA) { precioUnit = b; subtotal = a; }
        else { precioUnit = a; subtotal = b; } // fallback
      }

      todosItems.push({
        codigo: codigosDUX[j],
        descripcion: descripciones[j] || 'PRODUCTO ' + codigosDUX[j],
        cantidad,
        descuento_pct: descuento,
        precio_unitario: precioUnit,
        subtotal,
        iva_pct: 21,
        tiene_codigo_dux: true,
      });
    }

    // Fase 4: armar items extra (con código de barra)
    // Sus precios vienen DESPUÉS de los de DUX en numerosFinancieros
    const offsetExtra = nDUX * 2;
    productosExtra.forEach((extra, j) => {
      const { cantidad, descuento } = extra;
      let precioUnit = 0;
      let subtotal = 0;

      const posA = offsetExtra + j * 2;
      const posB = offsetExtra + j * 2 + 1;

      if (posB < numerosFinancieros.length) {
        const a = numerosFinancieros[posA];
        const b = numerosFinancieros[posB];
        const checkAB = Math.abs(a * cantidad * (1 - descuento / 100) - b) < Math.max(b * 0.01, 10);
        if (checkAB) { precioUnit = a; subtotal = b; }
        else { precioUnit = a; subtotal = b; }
      }

      todosItems.push({
        codigo: extra.codigoBarra,
        descripcion: extra.descripcion || 'PRODUCTO ' + extra.codigoBarra,
        cantidad,
        descuento_pct: descuento,
        precio_unitario: precioUnit,
        subtotal,
        iva_pct: 21,
        tiene_codigo_dux: false,
      });
    });
  }

  if (todosItems.length === 0) {
    warnings.push('No se pudieron parsear items. Verificá que el texto es de la factura Mayorista Diet.');
  } else {
    warnings.push(`Parseados ${todosItems.length} items (${todosItems.filter(i => i.tiene_codigo_dux).length} con código DUX, ${todosItems.filter(i => !i.tiene_codigo_dux).length} con código de barra)`);
  }

  const total = todosItems.reduce((a, i) => a + i.subtotal, 0);

  return { numero, fecha, items: todosItems, total, warnings };
}
