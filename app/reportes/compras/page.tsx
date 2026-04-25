// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/utils/format';
import { calcularSugerenciasCompra } from '@/lib/business/compras';
import { Search, ShoppingCart, AlertTriangle, CheckCircle2, XCircle, TrendingUp, RefreshCw } from 'lucide-react';

type Filtro = 'todos' | 'urgente' | 'comprar' | 'no_comprar' | 'ok';

const URGENCIA_CONFIG = {
  urgente:    { label: 'Urgente',    color: 'text-danger',   bg: 'bg-danger/10',   border: 'border-danger/40',   icon: '🚨' },
  comprar:    { label: 'Comprar',    color: 'text-warning',  bg: 'bg-warning/10',  border: 'border-warning/40',  icon: '🛒' },
  no_comprar: { label: 'No comprar', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40', icon: '⛔' },
  revisar:    { label: 'Revisar',    color: 'text-neutral-400', bg: 'bg-neutral-800', border: 'border-neutral-700', icon: '👀' },
  ok:         { label: 'OK',         color: 'text-success',  bg: 'bg-success/10',  border: 'border-success/40',  icon: '✅' },
};

export default function ComprasPage() {
  const supabase = createClient();
  const [lotes, setLotes] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sinVentas, setSinVentas] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [diasPeriodo, setDiasPeriodo] = useState(58);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('lotes')
        .select('producto_id, cantidad, fecha_vencimiento, producto:productos(id, codigo, nombre)')
        .gt('cantidad', 0),
      supabase.from('ventas_historico')
        .select('codigo, cantidad, fecha, sucursal_id'),
    ]).then(([lotesRes, ventasRes]) => {
      setLotes(lotesRes.data || []);

      const ventasData = ventasRes.data || [];
      if (ventasData.length === 0) {
        setSinVentas(true);
      } else {
        // Calcular días del período
        const fechas = ventasData.map(v => v.fecha).sort();
        const dias = Math.max(1, Math.round(
          (new Date(fechas[fechas.length-1]).getTime() - new Date(fechas[0]).getTime()) / 86400000
        ));
        setDiasPeriodo(dias);

        // Agrupar ventas por código → ventas_por_dia
        const map = new Map<string, number>();
        for (const v of ventasData) {
          map.set(v.codigo, (map.get(v.codigo) || 0) + Number(v.cantidad));
        }
        const ventasAgrupadas = Array.from(map.entries()).map(([codigo, total]) => ({
          codigo,
          ventas_por_dia: total / dias,
        }));
        setVentas(ventasAgrupadas);
      }
      setLoading(false);
    });
  }, []);

  const sugerencias = useMemo(() => {
    if (!lotes.length) return [];
    return calcularSugerenciasCompra({ lotes, ventas });
  }, [lotes, ventas]);

  const filtradas = useMemo(() => {
    let base = sugerencias;
    if (filtro !== 'todos') base = base.filter(s => s.urgencia === filtro);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      base = base.filter(s => s.nombre.toLowerCase().includes(q) || s.codigo.includes(q));
    }
    return base;
  }, [sugerencias, filtro, busqueda]);

  const contadores = useMemo(() => ({
    urgente: sugerencias.filter(s => s.urgencia === 'urgente').length,
    comprar: sugerencias.filter(s => s.urgencia === 'comprar').length,
    no_comprar: sugerencias.filter(s => s.urgencia === 'no_comprar').length,
    ok: sugerencias.filter(s => s.urgencia === 'ok').length,
  }), [sugerencias]);

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
                <div className="text-sm text-neutral-300 mt-1">
                  Para calcular sugerencias precisas necesitás importar el historial de ventas del DUX.
                  Las sugerencias actuales se basan solo en stock disponible.
                </div>
                <a href="/operaciones/importar-ventas"
                  className="inline-flex items-center gap-2 mt-3 text-sm bg-accent text-black font-semibold px-4 py-2 rounded-xl hover:bg-accent-hover transition">
                  <TrendingUp size={16} /> Importar ventas
                </a>
              </div>
            </div>
          </Card>
        )}

        {!sinVentas && (
          <Card className="p-3 text-xs text-neutral-500 flex items-center gap-2">
            <RefreshCw size={12} />
            Basado en {diasPeriodo} días de historial · Lead time: 7d · Colchón: 14d · Target: 21 días de stock
          </Card>
        )}

        {/* Chips de filtro */}
        <div className="flex gap-2 flex-wrap">
          <ChipFiltro label="Todos" count={sugerencias.length} active={filtro === 'todos'} onClick={() => setFiltro('todos')} color="bg-neutral-500" />
          <ChipFiltro label="🚨 Urgente" count={contadores.urgente} active={filtro === 'urgente'} onClick={() => setFiltro('urgente')} color="bg-danger" />
          <ChipFiltro label="🛒 Comprar" count={contadores.comprar} active={filtro === 'comprar'} onClick={() => setFiltro('comprar')} color="bg-warning" />
          <ChipFiltro label="⛔ No comprar" count={contadores.no_comprar} active={filtro === 'no_comprar'} onClick={() => setFiltro('no_comprar')} color="bg-orange-500" />
          <ChipFiltro label="✅ OK" count={contadores.ok} active={filtro === 'ok'} onClick={() => setFiltro('ok')} color="bg-success" />
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent" />
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-500">Calculando sugerencias...</div>
        ) : filtradas.length === 0 ? (
          <Card className="py-12 text-center text-neutral-500">Sin resultados.</Card>
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
                      </div>
                      <div className="font-medium text-sm truncate mt-0.5">{s.nombre}</div>
                      <div className="text-xs text-neutral-500 mt-1">{s.razon}</div>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <div className="text-xs text-neutral-500">
                        Stock: <span className="text-neutral-200 font-semibold">{s.stock_total} un</span>
                      </div>
                      {s.ventas_por_dia > 0 && (
                        <div className="text-xs text-neutral-500">
                          Venta/día: <span className="text-neutral-200 font-semibold">{s.ventas_por_dia.toFixed(1)}</span>
                        </div>
                      )}
                      {s.dias_cobertura < 999 && (
                        <div className="text-xs text-neutral-500">
                          Cobertura: <span className={`font-semibold ${s.dias_cobertura <= 7 ? 'text-danger' : s.dias_cobertura <= 21 ? 'text-warning' : 'text-success'}`}>
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

function ChipFiltro({ label, count, active, onClick, color }: any) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
        active ? 'bg-bg-elevated border-accent/40' : 'bg-bg-card border-border hover:bg-bg-hover'}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
      <span className="text-xs text-neutral-400">({count})</span>
    </button>
  );
}
