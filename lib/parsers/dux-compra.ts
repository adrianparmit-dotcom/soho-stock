// @ts-nocheck
/**
 * Parser para comprobantes de compra del DUX.
 *
 * El texto pegado tiene esta estructura:
 *   Encabezado (se puede repetir si el comprobante pagina):
 *     COMPROBANTE COMPRA Nº A-00004-00001124
 *     FECHA: 20/04/2026
 *     PROVEEDOR: VON TEFILO S. R. L.
 *     CUIT: 30718577469
 *     SUBTOTAL: $ 671.057,90
 *     IVA 21%: $ 140.922,16
 *     TOTAL: $ 811.980,06
 *
 *   Tabla (cabecera se repite en cada página):
 *     Codigo Descripcion Cant. Precio Uni. % Desc Sub Total % IVA Sub Total c/ IVA
 *     [codigo] [descripcion...] [cant] [precio] [desc] [subtotal] [iva] [subtotal_ivainc]
 *
 * Los números usan formato argentino: punto de miles, coma decimal.
 */

export interface ProductoCompra {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  subtotal: number;
  iva_pct: number;
  subtotal_con_iva: number;
}

export interface CompraParseada {
  numero_comprobante: string;
  fecha: string; // ISO date YYYY-MM-DD
  proveedor_nombre: string;
  proveedor_cuit: string;
  subtotal: number;
  iva: number;
  total: number;
  productos: ProductoCompra[];
  warnings: string[];
}

/**
 * Convierte "1.234,56" → 1234.56
 */
function parseNumAR(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Convierte "20/04/2026" → "2026-04-20"
 */
function parseFechaAR(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Extrae un campo del encabezado usando una regex con grupo.
 */
function extraerCampo(texto: string, regex: RegExp): string {
  const m = texto.match(regex);
  return m ? m[1].trim() : '';
}

/**
 * Parsea el texto completo de un comprobante de compra del DUX.
 */
export function parsearCompraDux(texto: string): CompraParseada {
  const warnings: string[] = [];

  // ---------- Encabezado ----------
  const numero = extraerCampo(
    texto,
    /COMPROBANTE COMPRA\s+N[°º]?\s*([A-Z0-9\-]+)/i
  );
  const fechaStr = extraerCampo(texto, /FECHA:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const fecha = parseFechaAR(fechaStr);
  const proveedorNombre = extraerCampo(
    texto,
    /PROVEEDOR:\s*(.+?)\s+IVA:/i
  );
  const cuit = extraerCampo(texto, /CUIT:\s*(\d{11})/i);
  const subtotal = parseNumAR(
    extraerCampo(texto, /SUBTOTAL:\s*\$\s*([\d.,]+)/i)
  );
  const iva = parseNumAR(
    extraerCampo(texto, /IVA\s+\d+%:\s*\$\s*([\d.,]+)/i)
  );
  // TOTAL: tiene que estar precedido de espacio/inicio (no SUBTOTAL ni IMPUESTOS)
  const total = parseNumAR(
    extraerCampo(texto, /(?:^|[^A-Z])TOTAL:\s*\$\s*([\d.,]+)/i)
  );

  if (!numero) warnings.push('No se pudo leer el número de comprobante');
  if (!fecha) warnings.push('No se pudo leer la fecha');
  if (!cuit) warnings.push('No se pudo leer el CUIT del proveedor');
  if (!proveedorNombre) warnings.push('No se pudo leer el nombre del proveedor');

  // ---------- Productos ----------
  // Normalizamos: todo en una sola línea, múltiples espacios → 1 espacio
  const normalizado = texto.replace(/\s+/g, ' ').trim();

  // El DUX repite el encabezado del comprobante cuando la tabla pagina.
  // Estrategia: cortar por "Sub Total c/ IVA" (fin de cada cabecera de tabla)
  // y para cada bloque de productos, cortarlo también antes del siguiente
  // "COMPROBANTE COMPRA" o "Generado por" que marca inicio de otra página.
  const trozos = normalizado.split(/Sub Total c\/\s*IVA/i);

  // Descartamos trozos[0] (es el encabezado antes de la primera tabla).
  // De cada trozo siguiente, tomamos solo hasta el próximo "SHUK SRL" o
  // "Generado por" (lo que aparezca primero), porque a partir de ahí empieza
  // la cabecera repetida de otra página, no productos.
  const bloquesProductos = trozos.slice(1).map((t) => {
    const cortes = [
      t.search(/SHUK SRL/i),
      t.search(/Generado por/i),
      t.search(/COMPROBANTE COMPRA/i),
    ].filter((i) => i >= 0);
    const corte = cortes.length ? Math.min(...cortes) : t.length;
    return t.slice(0, corte);
  });

  const bloqueProductos = bloquesProductos.join(' ');

  // Regex de fila de producto:
  //   codigo → 1 o más dígitos
  //   descripcion → texto hasta llegar a la primera cantidad (formato "N,NN ")
  //   cantidad → N,NN
  //   precio → con miles opcionales N.NNN,NN o N,NN
  //   descuento → N,NN
  //   subtotal → con miles
  //   iva → N,NN (usualmente 21,00 o 10,50 o 0,00)
  //   subtotal_iva → con miles
  const filaRegex =
    /(\d{2,6})\s+(.+?)\s+(\d{1,4},\d{2})\s+([\d.]+,\d{2})\s+(\d{1,3},\d{2})\s+([\d.]+,\d{2})\s+(\d{1,3},\d{2})\s+([\d.]+,\d{2})/g;

  const productos: ProductoCompra[] = [];
  // Para dedupe de páginas repetidas: clave = codigo+cantidad+subtotal
  const vistos = new Set<string>();

  let match;
  while ((match = filaRegex.exec(bloqueProductos)) !== null) {
    const [, codigo, descripcion, cantStr, precioStr, descStr, subStr, ivaStr, subIvaStr] = match;

    const producto: ProductoCompra = {
      codigo: codigo.trim(),
      descripcion: descripcion.trim().replace(/\s+/g, ' '),
      cantidad: parseNumAR(cantStr),
      precio_unitario: parseNumAR(precioStr),
      descuento_pct: parseNumAR(descStr),
      subtotal: parseNumAR(subStr),
      iva_pct: parseNumAR(ivaStr),
      subtotal_con_iva: parseNumAR(subIvaStr),
    };

    const clave = `${producto.codigo}|${producto.cantidad}|${producto.subtotal}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    productos.push(producto);
  }

  if (productos.length === 0) {
    warnings.push('No se pudo parsear ningún producto. Verificá el formato del texto pegado.');
  }

  // Validación cruzada: suma de subtotales vs subtotal declarado
  if (subtotal > 0 && productos.length > 0) {
    const sumaSubtotales = productos.reduce((acc, p) => acc + p.subtotal, 0);
    const diferencia = Math.abs(sumaSubtotales - subtotal);
    if (diferencia > 1) {
      warnings.push(
        `La suma de subtotales ($${sumaSubtotales.toFixed(2)}) difiere del subtotal declarado ($${subtotal.toFixed(2)}) por $${diferencia.toFixed(2)}. Revisá si faltan productos.`
      );
    }
  }

  return {
    numero_comprobante: numero,
    fecha,
    proveedor_nombre: proveedorNombre,
    proveedor_cuit: cuit,
    subtotal,
    iva,
    total,
    productos,
    warnings,
  };
}
