// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { duxGetVentas } from '@/lib/dux/api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { desde, hasta } = await req.json();
    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Requerido: desde, hasta (YYYY-MM-DD)' }, { status: 400 });
    }

    // Traer ventas de DUX
    const ventasDux = await duxGetVentas(desde, hasta);

    if (!Array.isArray(ventasDux) || ventasDux.length === 0) {
      return NextResponse.json({ ok: true, insertados: 0, mensaje: 'Sin ventas en ese período' });
    }

    // Normalizar items — la estructura exacta depende de la respuesta real de DUX
    // Ajustar cuando tengamos la respuesta real
    const rows: any[] = [];
    for (const venta of ventasDux) {
      const fecha = venta.fecha ? venta.fecha.split('T')[0] : desde;
      const sucursalId = venta.sucursal?.toLowerCase().includes('2') ? 2 : 1;
      const items = venta.items || venta.detalle || [];
      for (const item of items) {
        const codigo = String(item.codigo || item.id_articulo || '').split('.')[0];
        if (!codigo) continue;
        rows.push({
          codigo,
          nombre: item.descripcion || item.nombre || '',
          sucursal_id: sucursalId,
          fecha,
          cantidad: Number(item.cantidad || 0),
          producto_id: null, // se resuelve después con JOIN
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, insertados: 0, mensaje: 'Sin items parseables' });
    }

    // Resolver producto_ids
    const codigos = [...new Set(rows.map(r => r.codigo))];
    const { data: productos } = await supabase
      .from('productos').select('id, codigo').in('codigo', codigos);
    const mapProd = new Map((productos || []).map(p => [p.codigo, p.id]));
    const rowsConId = rows
      .map(r => ({ ...r, producto_id: mapProd.get(r.codigo) || null }))
      .filter(r => r.producto_id);

    // Borrar período y reinsertar (idempotente)
    await supabase.from('ventas_historico')
      .delete().gte('fecha', desde).lte('fecha', hasta);

    const BATCH = 500;
    let insertados = 0;
    for (let i = 0; i < rowsConId.length; i += BATCH) {
      const { error } = await supabase.from('ventas_historico').insert(rowsConId.slice(i, i + BATCH));
      if (error) throw error;
      insertados += Math.min(BATCH, rowsConId.length - i);
    }

    return NextResponse.json({ ok: true, insertados, ventas: ventasDux.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
