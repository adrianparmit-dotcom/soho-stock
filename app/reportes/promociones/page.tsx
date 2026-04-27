// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { Download, Search, Printer } from 'lucide-react';

const FORMATOS = {
  OFERTA: {
    label: 'OFERTA 15% OFF',
    key: 'OFERTA',
    descuento: 15,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-l-yellow-400',
    cartel: '🟡',
    diasMax: 40,
    diasMin: 20,
  },
  LIQUIDACION: {
    label: 'LIQUIDACIÓN 30% OFF',
    key: 'LIQUIDACION',
    descuento: 30,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-l-orange-400',
    cartel: '🟠',
    diasMax: 20,
    diasMin: 7,
  },
  ULTIMA: {
    label: 'ÚLTIMA OPORTUNIDAD 45% OFF',
    key: 'ULTIMA',
    descuento: 45,
    color: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-l-danger',
    cartel: '🔴',
    diasMax: 7,
    diasMin: -999,
  },
};

function getFormato(diasVenc: number) {
  if (diasVenc < FORMATOS.ULTIMA.diasMax) return FORMATOS.ULTIMA;
  if (diasVenc < FORMATOS.LIQUIDACION.diasMax) return FORMATOS.LIQUIDACION;
  if (diasVenc < FORMATOS.OFERTA.diasMax) return FORMATOS.OFERTA;
  return null;
}

export default function PromocionesPage() {
  const supabase = createClient();
  const [lotes, setLotes] = useState<any[]>([]);
  const [ventasMap, setVentasMap] = useState(new Map<string, number>());
  const [loading, setLoading] = useState(true);
  const [sucursalId, setSucursalId] = useState(1);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    supabase.from('sucursales').select('id,nombre').order('id').then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('lotes')
        .select('id,cantidad,costo,fecha_vencimiento,tipo_lote,producto:productos(id,codigo,nombre,precio_venta)')
        .eq('sucursal_id', sucursalId)
        .gt('cantidad', 0)
        .neq('fecha_vencimiento', '2099-12-31')
        .order('fecha_vencimiento', { ascending: true }),
      supabase.from('ventas_historico').select('codigo,cantidad,fecha').eq('sucursal_id', sucursalId),
    ]).then(([lotesRes, ventasRes]) => {
      setLotes(lotesRes.data || []);
      const ventasData = ventasRes.data || [];
      if (ventasData.length > 0) {
        const fechas = ventasData.map(v => v.fecha).sort();
        const dias = Math.max(1, Math.round((new Date(fechas[fechas.length-1]+'T12:00:00').getTime() - new Date(fechas[0]+'T12:00:00').getTime()) / 86400000));
        const map = new Map<string, number>();
        ventasData.forEach(v => map.set(v.codigo, (map.get(v.codigo)||0) + Number(v.cantidad)));
        map.forEach((total, cod) => map.set(cod, total / dias));
        setVentasMap(map);
      }
      setLoading(false);
    });
  }, [sucursalId]);

  const promos = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const result: any[] = [];
    for (const lote of lotes) {
      const venc = new Date(lote.fecha_vencimiento + 'T00:00:00');
      const diasVenc = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
      const formato = getFormato(diasVenc);
      if (!formato) continue;
      const cod = lote.producto?.codigo;
      const ventasDia = ventasMap.get(cod) || 0;
      // Si hay historial: verificar si el stock se vende solo antes de vencer
      if (ventasDia > 0) {
        const diasCobertura = Number(lote.cantidad) / ventasDia;
        // Si se vende antes de vencer Y tiene más de 7 días → no hay promo necesaria
        if (diasCobertura <= diasVenc && diasVenc >= 7) continue;
      }
      const precioOriginal = lote.producto?.precio_venta || 0;
      const costo = lote.costo || 0;
      const piso = costo * 1.05;
      const precioPromo = Math.max(Math.round(precioOriginal * (1 - formato.descuento / 100)), piso > 0 ? Math.round(piso) : 0);
      result.push({ lote, formato, diasVenc, precioOriginal, precioPromo, costo, ventasDia, diasCobertura: ventasDia > 0 ? Math.round(Number(lote.cantidad) / ventasDia) : null, valorRiesgo: costo * Number(lote.cantidad) });
    }
    return result.sort((a, b) => a.diasVenc - b.diasVenc);
  }, [lotes, ventasMap]);

  const filtradas = useMemo(() => {
    let base = filtro === 'todos' ? promos : promos.filter(p => p.formato.key === filtro);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      base = base.filter(p => p.lote.producto?.nombre?.toLowerCase().includes(q) || p.lote.producto?.codigo?.toLowerCase().includes(q));
    }
    return base;
  }, [promos, filtro, busqueda]);

  const contadores = useMemo(() => ({
    OFERTA: promos.filter(p => p.formato.key === 'OFERTA').length,
    LIQUIDACION: promos.filter(p => p.formato.key === 'LIQUIDACION').length,
    ULTIMA: promos.filter(p => p.formato.key === 'ULTIMA').length,
  }), [promos]);

  const exportarExcel = async () => {
    if (!filtradas.length) return;
    setExportando(true);
    const XLSX = await import('xlsx');
    const fechaHoy = new Date().toLocaleDateString('es-AR');
    const filas: any[][] = [
      [`INFORME DE PROMOCIONES — ${fechaHoy}`],
      [`Sucursal: ${sucursales.find(s=>s.id===sucursalId)?.nombre||''}`],
      [],
      ['CARTEL', 'CÓDIGO', 'PRODUCTO', 'FORMATO', 'DÍAS VENCE', 'STOCK', 'VENTA/DÍA', 'DÍAS COB.', 'PRECIO ORIG.', 'PRECIO PROMO', 'VALOR RIESGO'],
    ];
    for (const p of filtradas) {
      filas.push([
        p.formato.cartel,
        p.lote.producto?.codigo || '',
        p.lote.producto?.nombre || '',
        p.formato.label,
        p.diasVenc,
        Number(p.lote.cantidad),
        p.ventasDia > 0 ? p.ventasDia.toFixed(2) : '—',
        p.diasCobertura ?? '—',
        p.precioOriginal,
        p.precioPromo,
        Math.round(p.valorRiesgo),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [{ wch: 6 }, { wch: 8 }, { wch: 45 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Promociones');
    XLSX.writeFile(wb, `promociones-${fechaHoy.replace(/\//g,'-')}.xlsx`);
    setExportando(false);
  };

  return (
    <>
      <PageHeader title="Promociones" subtitle={sucursales.find(s=>s.id===sucursalId)?.nombre||''} backHref="/" />
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Selector sucursal */}
        <div className="flex gap-2">
          {sucursales.map(s => (
            <button key={s.id} onClick={() => setSucursalId(s.id)}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${sucursalId===s.id ? 'bg-accent text-black' : 'bg-bg-card border border-border text-neutral-300'}`}>
              {s.nombre}
            </button>
          ))}
        </div>

        {/* Chips de formato */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltro('todos')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${filtro==='todos' ? 'bg-bg-elevated border-accent/40' : 'bg-bg-card border-border'}`}>
            Todos ({promos.length})
          </button>
          {Object.values(FORMATOS).map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${filtro===f.key ? `${f.bg} ${f.color} border-current` : 'bg-bg-card border-border'}`}>
              {f.cartel} {f.label.split(' ')[0]} ({contadores[f.key]})
            </button>
          ))}
          <button onClick={exportarExcel} disabled={exportando}
            className="ml-auto px-4 py-2 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 transition flex items-center gap-2">
            <Download size={16}/> {exportando ? '...' : 'Excel'}
          </button>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent" />
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-500">Calculando promociones...</div>
        ) : filtradas.length === 0 ? (
          <Card className="py-12 text-center text-neutral-500">
            {promos.length === 0 ? '✅ Sin productos que requieran promoción.' : 'Sin resultados para el filtro.'}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtradas.map(p => (
              <Card key={p.lote.id} className={`p-3 border-l-4 ${p.formato.border}`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">{p.formato.cartel}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-neutral-500">[{p.lote.producto?.codigo}]</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.formato.bg} ${p.formato.color}`}>
                        {p.formato.label}
                      </span>
                    </div>
                    <div className="font-medium text-sm truncate mt-0.5">{p.lote.producto?.nombre}</div>
                    <div className="text-xs text-neutral-500 mt-1 flex gap-3 flex-wrap">
                      <span>Vence en <b className={p.diasVenc <= 0 ? 'text-danger' : p.diasVenc <= 7 ? 'text-danger' : 'text-neutral-200'}>{p.diasVenc <= 0 ? `${Math.abs(p.diasVenc)}d VENCIDO` : `${p.diasVenc}d`}</b></span>
                      <span>Stock: <b className="text-neutral-200">{Number(p.lote.cantidad)} un</b></span>
                      {p.ventasDia > 0 && <span>Venta/día: <b className="text-neutral-200">{p.ventasDia.toFixed(1)}</b></span>}
                      {p.diasCobertura && <span>Cob: <b className="text-neutral-200">{p.diasCobertura}d</b></span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-neutral-500 line-through">{formatMoney(p.precioOriginal)}</div>
                    <div className={`text-lg font-black ${p.formato.color}`}>{formatMoney(p.precioPromo)}</div>
                    <div className="text-xs text-neutral-500">Riesgo: {formatMoney(p.valorRiesgo)}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
