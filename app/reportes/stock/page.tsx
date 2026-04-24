// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatMoney, formatDate, semaforoVencimiento } from '@/lib/utils/format';
import { Search, Scale, Package } from 'lucide-react';

type Filtro = 'todos' | 'rojo' | 'naranja' | 'amarillo' | 'verde';
type TipoView = 'venta' | 'granel';

export default function StockPage() {
  const supabase = createClient();

  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [tipoView, setTipoView] = useState<TipoView>('venta');

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('id, nombre')
      .order('id')
      .then(({ data }) => {
        setSucursales(data || []);
        if (data?.length) setSucursalId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!sucursalId) return;
    setLoading(true);
    supabase
      .from('lotes')
      .select('id, cantidad, peso_kg, fecha_vencimiento, costo, tipo_lote, producto:productos(id, codigo, nombre)')
      .eq('sucursal_id', sucursalId)
      .gt('cantidad', 0)
      .order('fecha_vencimiento', { ascending: true })
      .then(({ data }) => {
        setRows(data || []);
        setLoading(false);
      });
  }, [sucursalId]);

  const rowsDelTipo = useMemo(
    () => rows.filter((r) => (r.tipo_lote || 'venta') === tipoView),
    [rows, tipoView]
  );

  const contadoresTipo = useMemo(() => {
    return {
      venta: rows.filter((r) => (r.tipo_lote || 'venta') === 'venta').length,
      granel: rows.filter((r) => r.tipo_lote === 'granel').length,
    };
  }, [rows]);

  const filtradas = useMemo(() => {
    return rowsDelTipo.filter((r) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const nombre = r.producto?.nombre?.toLowerCase() || '';
        const codigo = r.producto?.codigo?.toLowerCase() || '';
        if (!nombre.includes(q) && !codigo.includes(q)) return false;
      }
      if (filtro !== 'todos') {
        const sem = semaforoVencimiento(r.fecha_vencimiento);
        if (sem.color !== filtro) return false;
      }
      return true;
    });
  }, [rowsDelTipo, busqueda, filtro]);

  const contadoresSem = useMemo(() => {
    const c = { rojo: 0, naranja: 0, amarillo: 0, verde: 0 };
    rowsDelTipo.forEach((r) => {
      const sem = semaforoVencimiento(r.fecha_vencimiento);
      c[sem.color]++;
    });
    return c;
  }, [rowsDelTipo]);

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={`${filtradas.length} lote${filtradas.length !== 1 ? 's' : ''} · ${sucursales.find(s => s.id === sucursalId)?.nombre || ''}`}
        backHref="/"
      />
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Sucursal */}
        <div className="flex gap-2">
          {sucursales.map((s) => (
            <button
              key={s.id}
              onClick={() => setSucursalId(s.id)}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${
                sucursalId === s.id
                  ? 'bg-accent text-black'
                  : 'bg-bg-card border border-border text-neutral-300'
              }`}
            >
              {s.nombre}
            </button>
          ))}
        </div>

        {/* Tabs Venta / Granel */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            onClick={() => setTipoView('venta')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              tipoView === 'venta' ? 'bg-accent text-black' : 'bg-bg-card text-neutral-300 border border-border'
            }`}
          >
            <Package size={14} /> Venta ({contadoresTipo.venta})
          </button>
          <button
            onClick={() => setTipoView('granel')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              tipoView === 'granel' ? 'bg-accent text-black' : 'bg-bg-card text-neutral-300 border border-border'
            }`}
          >
            <Scale size={14} /> A granel ({contadoresTipo.granel})
          </button>
        </div>

        {/* Semáforo */}
        <div className="grid grid-cols-5 gap-2">
          <SemaforoChip label="Todos" count={rowsDelTipo.length} active={filtro === 'todos'} onClick={() => setFiltro('todos')} color="bg-neutral-500" />
          <SemaforoChip label="<15d" count={contadoresSem.rojo} active={filtro === 'rojo'} onClick={() => setFiltro('rojo')} color="bg-danger" />
          <SemaforoChip label="15-30d" count={contadoresSem.naranja} active={filtro === 'naranja'} onClick={() => setFiltro('naranja')} color="bg-orange-500" />
          <SemaforoChip label="30-60d" count={contadoresSem.amarillo} active={filtro === 'amarillo'} onClick={() => setFiltro('amarillo')} color="bg-warning" />
          <SemaforoChip label="+60d" count={contadoresSem.verde} active={filtro === 'verde'} onClick={() => setFiltro('verde')} color="bg-success" />
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent"
          />
        </div>

        {/* Listado */}
        {loading ? (
          <div className="py-12 text-center text-neutral-500">Cargando stock...</div>
        ) : filtradas.length === 0 ? (
          <Card className="py-12 text-center text-neutral-500">
            {tipoView === 'granel'
              ? 'No hay lotes a granel. Las recepciones con factura del proveedor (Ankas, Mayorista Diet) crean lotes granel.'
              : 'Sin resultados para los filtros aplicados.'}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtradas.map((r) => {
              const sem = semaforoVencimiento(r.fecha_vencimiento);
              const esGranel = r.tipo_lote === 'granel';
              return (
                <Card key={r.id} className={`p-3 border-l-4 ${sem.border}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-500">[{r.producto?.codigo}]</span>
                        {esGranel && (
                          <span className="text-[10px] uppercase font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <Scale size={9} /> granel
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-sm truncate">{r.producto?.nombre}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">
                        Vence {formatDate(r.fecha_vencimiento)}
                        {r.costo && ` · Costo ${formatMoney(r.costo)}`}
                      </div>
                    </div>
                    <div className={`text-right ${sem.text}`}>
                      <div className="font-bold text-lg leading-tight">
                        {Number(r.cantidad).toLocaleString('es-AR')}
                        <span className="text-xs font-normal ml-1">
                          {esGranel ? 'kg' : 'un'}
                        </span>
                      </div>
                      <div className="text-[10px] uppercase font-semibold">{sem.label}</div>
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

function SemaforoChip({ label, count, active, onClick, color }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-2 rounded-xl border transition text-center ${
        active ? 'bg-bg-elevated border-accent/40' : 'bg-bg-card border-border hover:bg-bg-hover'
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[10px] font-semibold text-neutral-400">{label}</span>
      </div>
      <div className="text-base font-bold">{count}</div>
    </button>
  );
}
