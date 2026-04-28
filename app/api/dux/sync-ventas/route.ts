// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DUX_BASE = 'https://erp.duxsoftware.com.ar/WSERP/rest/services';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function duxFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

function parsearFechaDux(fechaStr: string): string {
  // DUX devuelve "Jun 2, 2025 3:00:00 AM" → necesitamos "2025-06-02"
  try {
    const d = new Date(fechaStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {}
  return fechaStr.split('T')[0] || fechaStr;
}

async function duxGet(endpoint: string, offset = 0) {
  const token = process.env.DUX_TOKEN;
  const empresa = process.env.DUX_EMPRESA_ID;
  if (!token || !empresa) throw new Error('DUX_TOKEN o DUX_EMPRESA_ID no configurados en Vercel');
  const url = `${DUX_BASE}${endpoint}&empresa_id=${empresa}&offset=${offset}&limit=100`;
  const res = await fetch(url, {
    headers: { 'authorization': token, 'accept': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DUX ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { desde, hasta } = await req.json();
    if (!desde || !hasta) return NextResponse.json({ error: 'Requerido: desde, hasta' }, { status: 400 });

    const duxDesde = duxFecha(desde);
    const duxHasta = duxFecha(hasta);
    const endpoint = `/facturas?fecha_desde=${duxDesde}&fecha_hasta=${duxHasta}&tipo_comp=FACTURA&`;

    // Traer todas las páginas (DUX pagina de 100 en 100)
    let todasFacturas: any[] = [];
    let offset = 0;
    let total = 1;

    while (offset < total) {
      const data = await duxGet(endpoint, offset);
      total = data.paging?.total || 0;
      const results = data.results || data || [];
      if (!results.length) break;
      todasFacturas = [...todasFacturas, ...results];
      offset += results.length;
      if (offset >= total) break;
    }

    if (!todasFacturas.length) {
      return NextResponse.json({ ok: true, insertados: 0, ventas: 0, mensaje: 'Sin ventas en ese período' });
    }

    // Normalizar items desde la estructura real de DUX
    const rows: any[] = [];
    for (const factura of todasFacturas) {
      const fecha = parsearFechaDux(factura.fecha_comp || factura.fecha || desde);

      // Mapeo puntos de venta DUX → sucursal SOHO Stock
      // 00004 = SOHO 1, 00007 = SOHO 2 (ecommerce), 00009 = SOHO 2, 00001 = ignorar
      const ptoVta = String(factura.nro_pto_vta || '').replace(/^0+/, '');
      if (ptoVta === '1') continue; // ignorar punto de venta original
      const sucursalId = ptoVta === '4' ? 1 : 2;

      const detalles = factura.detalles_json || factura.items || factura.detalle || [];
      for (const item of detalles) {
        // Estructura real DUX: cod_item = código, ctd = cantidad, item = descripción
        const codigo = String(
          item.cod_item || item.codigo_articulo || item.codigo || ''
        ).split('.')[0].trim();
        const cantidad = Number(item.ctd || item.cantidad || 0);
        if (!codigo || cantidad <= 0) continue;

        rows.push({
          codigo,
          nombre: item.item || item.descripcion || item.nombre || '',
          sucursal_id: sucursalId,
          fecha,
          cantidad,
          producto_id: null,
        });
      }
    }

    if (!rows.length) {
      return NextResponse.json({
        ok: true, insertados: 0, ventas: todasFacturas.length,
        mensaje: 'Facturas encontradas pero sin items parseables. Revisar estructura de detalles_json.'
      });
    }

    // Resolver producto_ids
    const codigos = [...new Set(rows.map(r => r.codigo))];
    const { data: productos } = await supabase.from('productos').select('id, codigo').in('codigo', codigos);
    const mapProd = new Map((productos || []).map((p: any) => [p.codigo, p.id]));
    const rowsConId = rows
      .map(r => ({ ...r, producto_id: mapProd.get(r.codigo) || null }))
      .filter(r => r.producto_id);

    // Borrar período anterior e insertar
    await supabase.from('ventas_historico').delete().gte('fecha', desde).lte('fecha', hasta);

    let insertados = 0;
    const BATCH = 500;
    for (let i = 0; i < rowsConId.length; i += BATCH) {
      const { error } = await supabase.from('ventas_historico').insert(rowsConId.slice(i, i + BATCH));
      if (error) throw new Error(`Insert: ${error.message}`);
      insertados += Math.min(BATCH, rowsConId.length - i);
    }

    return NextResponse.json({
      ok: true,
      insertados,
      ventas: todasFacturas.length,
      sin_match: rows.length - rowsConId.length,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
