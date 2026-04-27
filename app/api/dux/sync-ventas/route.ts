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

async function duxGet(endpoint: string) {
  const token = process.env.DUX_TOKEN;
  const empresa = process.env.DUX_EMPRESA_ID;
  if (!token || !empresa) throw new Error('DUX_TOKEN o DUX_EMPRESA_ID no configurados en Vercel');
  const url = `${DUX_BASE}${endpoint}&empresa_id=${empresa}`;
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

    // Consultar facturas de venta a DUX
    const facturas = await duxGet(`/facturas?tipo_comprobante=VENTA&fecha_desde=${duxFecha(desde)}&fecha_hasta=${duxFecha(hasta)}&`);

    if (!Array.isArray(facturas) || facturas.length === 0) {
      return NextResponse.json({ ok: true, insertados: 0, ventas: 0, mensaje: 'Sin ventas en ese período' });
    }

    // Normalizar items desde la estructura de DUX
    const rows: any[] = [];
    for (const factura of facturas) {
      // DUX puede devolver sucursal como string o id
      const sucursalNombre = (factura.sucursal || factura.nombre_sucursal || '').toString().toLowerCase();
      const sucursalId = sucursalNombre.includes('2') ? 2 : 1;

      // La fecha puede venir en varios formatos
      let fecha = desde;
      if (factura.fecha) {
        const f = factura.fecha.toString();
        if (f.includes('/')) {
          const [d, m, y] = f.split('/');
          fecha = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        } else if (f.includes('-')) {
          fecha = f.split('T')[0];
        }
      }

      const items = factura.items || factura.detalle || factura.articulos || [];
      for (const item of items) {
        const codigo = String(item.codigo || item.id_articulo || item.codigo_articulo || '').split('.')[0].trim();
        const cantidad = Number(item.cantidad || 0);
        if (!codigo || cantidad <= 0) continue;
        rows.push({
          codigo,
          nombre: item.descripcion || item.nombre || '',
          sucursal_id: sucursalId,
          fecha,
          cantidad,
          producto_id: null,
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, insertados: 0, ventas: facturas.length, mensaje: 'Sin items parseables en las facturas' });
    }

    // Resolver producto_ids
    const codigos = [...new Set(rows.map(r => r.codigo))];
    const { data: productos } = await supabase.from('productos').select('id, codigo').in('codigo', codigos);
    const mapProd = new Map((productos || []).map((p: any) => [p.codigo, p.id]));
    const rowsConId = rows.map(r => ({ ...r, producto_id: mapProd.get(r.codigo) || null })).filter(r => r.producto_id);

    // Borrar período anterior e insertar
    await supabase.from('ventas_historico').delete().gte('fecha', desde).lte('fecha', hasta);

    let insertados = 0;
    const BATCH = 500;
    for (let i = 0; i < rowsConId.length; i += BATCH) {
      const { error } = await supabase.from('ventas_historico').insert(rowsConId.slice(i, i + BATCH));
      if (error) throw new Error(`Insert error: ${error.message}`);
      insertados += Math.min(BATCH, rowsConId.length - i);
    }

    return NextResponse.json({ ok: true, insertados, ventas: facturas.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
