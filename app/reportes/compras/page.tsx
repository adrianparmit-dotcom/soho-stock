// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/utils/format';
import { calcularSugerenciasCompra } from '@/lib/business/compras';
import { calcularUnidadesDesdeKg } from '@/lib/business/granel';
import { Search, ShoppingCart, AlertTriangle, RefreshCw, Download, TrendingUp } from 'lucide-react';

type Filtro = 'accion' | 'todos';

const URGENCIA_CONFIG = {
  urgente:    { label: 'Urgente',    color: 'text-danger',        bg: 'bg-danger/10',        border: 'border-danger/40',        icon: '🚨' },
  comprar:    { label: 'Comprar',    color: 'text-warning',       bg: 'bg-warning/10',       border: 'border-warning/40',       icon: '🛒' },
  no_comprar: { label: 'No comprar', color: 'text-orange-400',    bg: 'bg-orange-500/10',    border: 'border-orange-500/40',    icon: '⛔' },
  revisar:    { label: 'Revisar',    color: 'text-neutral-400',   bg: 'bg-neutral-800',      border: 'border-neutral-700',      icon: '👀' },
  ok:         { label: 'OK',         color: 'text-success',       bg: 'bg-success/10',       border: 'border-success/40',       icon: '✅' },
};

export default function ComprasPage() {
  const supabase = createClient();
  const [lotes, setLotes] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sinVentas, setSinVentas] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('accion');
  const [diasPeriodo, setDiasPeriodo] = useState(58);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('lotes')
        .select('producto_id, cantidad, fecha_vencimiento, sucursal_id, tipo_lote, producto:productos(id, codigo, nombre, proveedor:proveedores(id, nombre))'),
      supabase.from('ventas_historico')
        .select('codigo, cantidad, fecha, sucursal_id'),
    ]).then(([lotesRes, ventasRes]) => {
      setLotes(lotesRes.data || []);
      const ventasData = ventasRes.data || [];
      if (ventasData.length === 0) {
        setSinVentas(true);
      } else {
        const fechas = ventasData.map(v => v.fecha).sort();
        const dias = Math.max(1, Math.round(
          (new Date(fechas[fechas.length-1] + 'T12:00:00').getTime() - new Date(fechas[0] + 'T12:00:00').getTime()) / 86400000
        ));
        setDiasPeriodo(dias);
        const map = new Map<string, { total: number; soho1: number; soho2: number }>();
        for (const v of ventasData) {
          if (!map.has(v.codigo)) map.set(v.codigo, { total: 0, soho1: 0, soho2: 0 });
          const e = map.get(v.codigo)!;
          e.total += Number(v.cantidad);
          if (v.sucursal_id === 1) e.soho1 += Number(v.cantidad);
          else e.soho2 += Number(v.cantidad);
        }
        const ventasAgrupadas = Array.from(map.entries()).map(([codigo, v]) => ({
          codigo,
          ventas_por_dia: v.total / dias,
          ventas_soho1_dia: v.soho1 / dias,
          ventas_soho2_dia: v.soho2 / dias,
        }));
        setVentas(ventasAgrupadas);
      }
      setLoading(false);
    });
  }, []);

  // Stock por sucursal
  const stockPorSucursal = useMemo(() => {
    const map = new Map<string, { soho1: number; soho2: number; nombre: string; proveedor: string; esGranel: boolean }>();
    for (const l of lotes) {
      const codigo = l.producto?.codigo;
      if (!codigo) continue;
      if (!map.has(codigo)) {
        map.set(codigo, {
          soho1: 0, soho2: 0,
          nombre: l.producto?.nombre || '',
          proveedor: l.producto?.proveedor?.nombre || '—',
          esGranel: l.tipo_lote === 'granel',
        });
      }
      const e = map.get(codigo)!;
      if (l.tipo_lote === 'granel') e.esGranel = true;
      if (l.sucursal_id === 1) e.soho1 += Number(l.cantidad);
      else e.soho2 += Number(l.cantidad);
    }
    return map;
  }, [lotes]);

  const sugerencias = useMemo(() => {
    if (!lotes.length) return [];
    const sug = calcularSugerenciasCompra({ lotes, ventas });
    // Enriquecer con proveedor, stock por sucursal y unidades de granel
    return sug.map(s => {
      const stockInfo = stockPorSucursal.get(s.codigo);
      const proveedor = stockInfo?.proveedor || '—';
      const esGranel = stockInfo?.esGranel || false;
      const soho1 = stockInfo?.soho1 || 0;
      const soho2 = stockInfo?.soho2 || 0;

      // Calcular unidades desde kg para granel
      let unidadesSoho1 = soho1;
      let unidadesSoho2 = soho2;
      let gramosBolsa: number | null = null;
      if (esGranel) {
        gramosBolsa = null;
        const u1 = calcularUnidadesDesdeKg(soho1, s.nombre);
        const u2 = calcularUnidadesDesdeKg(soho2, s.nombre);
        if (u1 !== null) { unidadesSoho1 = u1; gramosBolsa = Math.round(soho1 * 1000 / u1); }
        if (u2 !== null) { unidadesSoho2 = u2; }
      }

      return { ...s, proveedor, esGranel, soho1, soho2, unidadesSoho1, unidadesSoho2, gramosBolsa };
    });
  }, [lotes, ventas, stockPorSucursal]);

  const filtradas = useMemo(() => {
    let base = filtro === 'accion'
      ? sugerencias.filter(s => s.urgencia === 'urgente' || s.urgencia === 'comprar')
      : sugerencias;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      base = base.filter(s => s.nombre.toLowerCase().includes(q) || s.codigo.includes(q) || s.proveedor.toLowerCase().includes(q));
    }
    return base;
  }, [sugerencias, filtro, busqueda]);

  const contadores = useMemo(() => ({
    urgente: sugerencias.filter(s => s.urgencia === 'urgente').length,
    comprar: sugerencias.filter(s => s.urgencia === 'comprar').length,
    accion: sugerencias.filter(s => s.urgencia === 'urgente' || s.urgencia === 'comprar').length,
  }), [sugerencias]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const fechaHoy = new Date().toLocaleDateString('es-AR');

      // ===== HOJA 1: A COMPRAR (urgente + comprar) =====
      const aComprar = sugerencias.filter(s => s.urgencia === 'urgente' || s.urgencia === 'comprar');

      // Agrupar por proveedor
      const porProveedor = new Map<string, any[]>();
      for (const s of aComprar) {
        if (!porProveedor.has(s.proveedor)) porProveedor.set(s.proveedor, []);
        porProveedor.get(s.proveedor)!.push(s);
      }

      const filas1: any[][] = [
        [`SUGERENCIAS DE COMPRA — ${fechaHoy}`],
        [`Período de ventas: ${diasPeriodo} días · Lead time: 7 días · Stock target: 21 días`],
        [],
        ['PROVEEDOR', 'CÓDIGO', 'PRODUCTO', 'URGENCIA', 'STOCK SOHO 1', 'STOCK SOHO 2', 'STOCK TOTAL', 'VENTA/DÍA', 'DÍAS COB.', 'A PEDIR', 'RAZÓN'],
      ];

      for (const [prov, items] of porProveedor) {
        filas1.push([prov, '', '', '', '', '', '', '', '', '', '']);
        for (const s of items) {
          const unidadLabel = s.esGranel && s.gramosBolsa ? ` (${s.gramosBolsa}g/bolsa)` : '';
          filas1.push([
            '',
            s.codigo,
            s.nombre + unidadLabel,
            URGENCIA_CONFIG[s.urgencia]?.label || s.urgencia,
            s.esGranel ? `${s.soho1}kg (≈${s.unidadesSoho1}u)` : `${s.unidadesSoho1}u`,
            s.esGranel ? `${s.soho2}kg (≈${s.unidadesSoho2}u)` : `${s.unidadesSoho2}u`,
            s.esGranel ? `${(s.soho1+s.soho2)}kg` : `${(s.unidadesSoho1+s.unidadesSoho2)}u`,
            s.ventas_por_dia > 0 ? s.ventas_por_dia.toFixed(2) : '—',
            s.dias_cobertura < 999 ? s.dias_cobertura : '—',
            s.sugerido > 0 ? s.sugerido : '—',
            s.razon,
          ]);
        }
        filas1.push([]); // separador entre proveedores
      }

      const ws1 = XLSX.utils.aoa_to_sheet(filas1);

      // Anchos de columna
      ws1['!cols'] = [
        { wch: 25 }, // proveedor
        { wch: 8 },  // código
        { wch: 45 }, // producto
        { wch: 12 }, // urgencia
        { wch: 18 }, // soho1
        { wch: 18 }, // soho2
        { wch: 15 }, // total
        { wch: 10 }, // venta/día
        { wch: 10 }, // días cob
        { wch: 10 }, // a pedir
        { wch: 40 }, // razón
      ];

      XLSX.utils.book_append_sheet(wb, ws1, 'A Comprar');

      // ===== HOJA 2: TODOS LOS PRODUCTOS =====
      const filas2: any[][] = [
        ['CÓDIGO', 'PRODUCTO', 'PROVEEDOR', 'ESTADO', 'STOCK SOHO 1', 'STOCK SOHO 2', 'VENTA/DÍA SOHO 1', 'VENTA/DÍA SOHO 2', 'DÍAS COBERTURA', 'SUGERIDO', 'GRANEL', 'GRAMOS/BOLSA'],
      ];

      for (const s of sugerencias) {
        filas2.push([
          s.codigo,
          s.nombre,
          s.proveedor,
          URGENCIA_CONFIG[s.urgencia]?.label || s.urgencia,
          s.esGranel ? `${s.soho1}kg` : `${s.unidadesSoho1}u`,
          s.esGranel ? `${s.soho2}kg` : `${s.unidadesSoho2}u`,
          s.ventas_por_dia > 0 ? (s.ventas_por_dia / 2).toFixed(3) : '—',
          s.ventas_por_dia > 0 ? (s.ventas_por_dia / 2).toFixed(3) : '—',
          s.dias_cobertura < 999 ? s.dias_cobertura : '—',
          s.sugerido > 0 ? s.sugerido : '—',
          s.esGranel ? 'SÍ' : 'NO',
          s.gramosBolsa ? s.gramosBolsa + 'g' : '—',
        ]);
      }

      const ws2 = XLSX.utils.aoa_to_sheet(filas2);
      ws2['!cols'] = [
        { wch: 8 }, { wch: 45 }, { wch: 25 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 16 }, { wch: 16 },
        { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Todos los productos');

      // Descargar
      XLSX.writeFile(wb, `compras-${fechaHoy.replace(/\//g, '-')}.xlsx`);
    } catch (e) {
      alert('Error al exportar: ' + e.message);
    }
    setExportando(false);
  };

  return (
    <>
      <PageHeader title="Sugerencias de compra" backHref="/" />
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">

        {sinVentas && (
          <Card className="p-5 border-warning/40 bg-warning/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={20} />
              <div>
                <div className="font-semibold text-warning">Sin historial de ventas</div>
                <div className="text-sm text-neutral-300 mt-1">Importá el historial del DUX para calcular sugerencias precisas.</div>
                <a href="/operaciones/importar-ventas" className="inline-flex items-center gap-2 mt-3 text-sm bg-accent text-black font-semibold px-4 py-2 rounded-xl hover:bg-accent-hover transition">
                  <TrendingUp size={16} /> Importar ventas
                </a>
              </div>
            </div>
          </Card>
        )}

        {!sinVentas && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <RefreshCw size={12} />
              {diasPeriodo}d de historial · Lead time: 7d · Target: 21d de stock
            </div>
            <button
              onClick={exportarExcel}
              disabled={exportando || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/15 hover:bg-success/25 text-success text-sm font-semibold transition disabled:opacity-50"
            >
              <Download size={16} />
              {exportando ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>
        )}

        {/* Tabs acción / todos */}
        <div className="flex gap-2">
          <button
            onClick={() => setFiltro('accion')}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${filtro === 'accion' ? 'bg-accent text-black' : 'bg-bg-card border border-border text-neutral-300'}`}
          >
            🚨 A comprar ({contadores.accion})
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${filtro === 'todos' ? 'bg-accent text-black' : 'bg-bg-card border border-border text-neutral-300'}`}
          >
            Ver todos ({sugerencias.length})
          </button>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por producto, código o proveedor..."
            className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent" />
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-500">Calculando sugerencias...</div>
        ) : filtradas.length === 0 ? (
          <Card className="py-12 text-center text-neutral-500">
            {filtro === 'accion' ? '✅ Sin productos urgentes o a comprar.' : 'Sin resultados.'}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtradas.map(s => {
              const cfg = URGENCIA_CONFIG[s.urgencia] || URGENCIA_CONFIG.ok;
              return (
                <Card key={s.codigo} className={`p-3 border-l-4 ${cfg.border}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-neutral-500">[{s.codigo}]</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {s.esGranel && (
                          <span className="text-[10px] font-bold uppercase bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                            GRANEL {s.gramosBolsa ? `·${s.gramosBolsa}g/bolsa` : ''}
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-sm truncate mt-0.5">{s.nombre}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>📦 {s.proveedor}</span>
                        <span>·</span>
                        <span>{s.razon}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <div className="text-xs text-neutral-500">
                        SOHO1: <span className="text-neutral-200 font-semibold">
                          {s.esGranel ? `${s.soho1}kg` : `${s.unidadesSoho1}u`}
                          {s.esGranel && s.gramosBolsa ? ` ≈${s.unidadesSoho1}u` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        SOHO2: <span className="text-neutral-200 font-semibold">
                          {s.esGranel ? `${s.soho2}kg` : `${s.unidadesSoho2}u`}
                          {s.esGranel && s.gramosBolsa ? ` ≈${s.unidadesSoho2}u` : ''}
                        </span>
                      </div>
                      {s.ventas_por_dia > 0 && (
                        <div className="text-xs text-neutral-500">
                          Venta/día: <span className="text-neutral-200 font-semibold">{s.ventas_por_dia.toFixed(1)}</span>
                        </div>
                      )}
                      {s.dias_cobertura < 999 && (
                        <div className="text-xs text-neutral-500">
                          Cob: <span className={`font-semibold ${s.dias_cobertura <= 7 ? 'text-danger' : s.dias_cobertura <= 21 ? 'text-warning' : 'text-success'}`}>
                            {s.dias_cobertura}d
                          </span>
                        </div>
                      )}
                      {s.sugerido > 0 && (
                        <div className={`text-sm font-black ${cfg.color}`}>
                          Pedir: {s.sugerido} un
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
