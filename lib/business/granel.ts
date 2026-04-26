// @ts-nocheck
/**
 * Extrae el peso en gramos de la descripción de un producto fraccionado.
 * Ejemplos:
 *   "CACAO AMARGO X 100G ANK" → 100
 *   "MIX FRUTOS SECOS X 250 GR SA" → 250
 *   "GRANOLA X 500G" → 500
 *   "LENTEJON X 1KG" → 1000
 *   "ALMOHADITAS FRUTILLA LASFOR X 2,5 KG" → 2500
 */
export function extraerGramosDesdNombre(nombre: string): number | null {
  if (!nombre) return null;
  const n = nombre.toUpperCase();

  // Patrón: número seguido de KG (con posible decimal)
  const mKG = n.match(/X\s*(\d+(?:[.,]\d+)?)\s*KG\b/);
  if (mKG) {
    const val = parseFloat(mKG[1].replace(',', '.'));
    return Math.round(val * 1000); // convertir a gramos
  }

  // Patrón: número seguido de G o GR
  const mG = n.match(/X\s*(\d+(?:[.,]\d+)?)\s*(?:GR?)\b/);
  if (mG) {
    return Math.round(parseFloat(mG[1].replace(',', '.')));
  }

  return null;
}

/**
 * Calcula unidades disponibles de un lote granel dado el tamaño de bolsa.
 * Si no se puede determinar el tamaño, devuelve null.
 */
export function calcularUnidadesDesdeKg(kgDisponibles: number, nombreProducto: string): number | null {
  const gramos = extraerGramosDesdNombre(nombreProducto);
  if (!gramos || gramos <= 0) return null;
  return Math.floor((kgDisponibles * 1000) / gramos);
}
