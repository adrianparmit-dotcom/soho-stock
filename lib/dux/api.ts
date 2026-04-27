// @ts-nocheck
const DUX_BASE = 'https://api.duxsoftware.com.ar/api';

function getToken() { return process.env.DUX_TOKEN; }
function getEmpresa() { return process.env.DUX_EMPRESA_ID; }

function duxFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

async function duxFetch(endpoint: string) {
  const token = getToken();
  const empresa = getEmpresa();
  if (!token || !empresa) throw new Error('DUX_TOKEN o DUX_EMPRESA_ID no configurados');
  const url = `${DUX_BASE}${endpoint}&empresa_id=${empresa}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DUX API ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function duxGetVentas(desde: string, hasta: string) {
  return duxFetch(`/facturas?tipo=venta&fecha_desde=${duxFecha(desde)}&fecha_hasta=${duxFecha(hasta)}`);
}

export async function duxGetCompras(desde: string, hasta: string) {
  return duxFetch(`/compras?fecha_desde=${duxFecha(desde)}&fecha_hasta=${duxFecha(hasta)}`);
}

export async function duxGetRubros() {
  return duxFetch(`/rubros?`);
}

export async function duxGetSubRubros() {
  return duxFetch(`/subrubros?`);
}

export async function duxGetItems() {
  return duxFetch(`/items?`);
}
