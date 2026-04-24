// @ts-nocheck
/**
 * Parser para transferencias entre depósitos del DUX.
 *
 * Estructura del texto pegado:
 *   DEPÓSITO ORIGEN: LOCAL
 *   DEPÓSITO DESTINO: LOCAL 2
 *   USUARIO: VISCARDI, YAMILA
 *   OBSERVACIONES:
 *   TRANSFERENCIA ENTRE DEPÓSITOS Nº: 15289-0000000411
 *   FECHA: 01/04/2026
 *   CÓD. ITEM ITEM CANTIDAD
 *   [codigo] [descripcion...] [cantidad]
 *   ...
 */

export interface ItemTransferencia {
  codigo: string;
  descripcion: string;
  cantidad: number;
}

export interface TransferenciaParseada {
  numero: string;
  fecha: string; // ISO YYYY-MM-DD
  deposito_origen: string;
  deposito_destino: string;
  usuario: string;
  items: ItemTransferencia[];
  warnings: string[];
}

function parseNumAR(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseFechaAR(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function extraerCampo(texto: string, regex: RegExp): string {
  const m = texto.match(regex);
  return m ? m[1].trim() : '';
}

export function parsearTransferenciaDux(texto: string): TransferenciaParseada {
  const warnings: string[] = [];

  // ---------- Encabezado ----------
  // Depósito origen/destino: puede venir con o sin tilde en "DEPÓSITO"
  const origen = extraerCampo(
    texto,
    /DEP[ÓO]SITO\s+ORIGEN:\s*(.+?)\s+DEP[ÓO]SITO\s+DESTINO/i
  );
  const destino = extraerCampo(
    texto,
    /DEP[ÓO]SITO\s+DESTINO:\s*(.+?)\s+USUARIO:/i
  );
  const usuario = extraerCampo(
    texto,
    /USUARIO:\s*(.+?)\s+OBSERVACIONES:/i
  );
  const numero = extraerCampo(
    texto,
    /TRANSFERENCIA\s+ENTRE\s+DEP[ÓO]SITOS\s+N[°º]?:\s*([\d\-]+)/i
  );
  const fechaStr = extraerCampo(texto, /FECHA:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const fecha = parseFechaAR(fechaStr);

  if (!origen) warnings.push('No se pudo leer el depósito origen');
  if (!destino) warnings.push('No se pudo leer el depósito destino');
  if (!numero) warnings.push('No se pudo leer el número de transferencia');
  if (!fecha) warnings.push('No se pudo leer la fecha');

  // ---------- Items ----------
  // Normalizamos espacios
  const normalizado = texto.replace(/\s+/g, ' ').trim();

  // Cortamos por la cabecera de tabla "CÓD. ITEM ITEM CANTIDAD"
  // (puede venir sin tilde también)
  const partes = normalizado.split(
    /C[ÓO]D\.\s+ITEM\s+ITEM\s+CANTIDAD/i
  );
  const bloqueItems = partes.slice(1).join(' ');

  // Regex de fila:
  //   codigo → 2-6 dígitos
  //   descripcion → texto hasta la cantidad
  //   cantidad → entero o decimal (N o N,NN)
  //
  // La cantidad siempre está al final (del item o del bloque), por eso
  // la detectamos por lookahead de "fin de item" o "fin de string".
  const filaRegex =
    /(\d{2,6})\s+(.+?)\s+(\d{1,6}(?:,\d{1,3})?)(?=\s+\d{2,6}\s|\s*$)/g;

  const items: ItemTransferencia[] = [];
  let match;
  while ((match = filaRegex.exec(bloqueItems)) !== null) {
    const [, codigo, desc, cantStr] = match;
    items.push({
      codigo: codigo.trim(),
      descripcion: desc.trim().replace(/\s+/g, ' '),
      cantidad: parseNumAR(cantStr),
    });
  }

  if (items.length === 0) {
    warnings.push(
      'No se pudo parsear ningún item. Verificá el formato del texto pegado.'
    );
  }

  return {
    numero,
    fecha,
    deposito_origen: origen,
    deposito_destino: destino,
    usuario,
    items,
    warnings,
  };
}
