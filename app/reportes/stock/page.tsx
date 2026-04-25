// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatMoney, formatDate, semaforoVencimiento } from '@/lib/utils/format';
import { Search, Scale, Package, AlertTriangle, ArrowRightLeft } from 'lucide-react';

type Filtro = 'todos' | 'rojo' | 'naranja' | 'amarillo' | 'verde';
type TipoView = 'venta' | 'granel' | 'alertas';

const VENC_SIN_FECHA = '2099-12-31';

export default function StockPage() {
  const supabase = createClient();

  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [rowsTodas, setRowsTodas] = useState<any[]>([]); // lotes de AMBAS sucursales para alertas
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [tipoView, setTipoView] = useState<TipoView>('venta');

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').order('id').then(({ data }) => {
      setSucursales(data || []);
      if (data?.length) setSucursalId(data[0].id);
    });
  }, []);

  // Cargar lotes de la sucursal seleccionada
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

  // Cargar lotes de TODAS las sucursales para calcular alertas de transferencia
  useEffect(() => {
    supabase
      .from('lotes')
      .select('id, cantidad, sucursal_id, deposito, tipo_lote, producto:productos(id, codigo, nombre)')
      .gt('cantidad', 0)
      .then(({ data }) => setRowsTodas(data || []));
  }, []);

  // ===== ALERTAS =====
  // Prioridad de búsqueda por depósito:
  // Si LOCAL=0 → buscar PIEZA → DEP_LOCAL2 → LOCAL2
  // Si LOCAL2=0 → buscar DEP_LOCAL2 → PIEZA → LOCAL
  const PRIORIDAD_DESDE: Record<string, string[]> = {
    LOCAL:     ['PIEZA', 'DEP_LOCAL2', 'LOCAL2'],
    PIEZA:     ['LOCAL', 'DEP_LOCAL2', 'LOCAL2'],
    LOCAL2:    ['DEP_LOCAL2', 'PIEZA', 'LOCAL'],
    DEP_LOCAL2:['LOCAL2', 'PIEZA', 'LOCAL'],
  };

  const DEP_LABEL: Record<string, string> = {
    LOCAL: 'LOCAL (SOHO 1)', PIEZA: 'PIEZA (SOHO 1)',
    LOCAL2: 'LOCAL 2 (SOHO 2)', DEP_LOCAL2: 'DEP. LOCAL 2 (SOHO 2)',
  };

  // Transferencias recomendadas: por depósito con prioridad
  const transferenciasRecomendadas = useMemo(() => {
    if (!sucursalId) return [];

    const stockPorDep = new Map();
    const infoProd = new Map();

    rowsTodas.filter(r => r.tipo_lote !== 'granel').forEach(r => {
      const pid = String(r.producto?.id);
      if (!pid || pid === 'undefined') return;
      const dep = r.deposito || (r.sucursal_id === 1 ? 'LOCAL' : 'LOCAL2');
      if (!stockPorDep.has(pid)) {
        stockPorDep.set(pid, { LOCAL: 0, PIEZA: 0, LOCAL2: 0, DEP_LOCAL2: 0 });
        infoProd.set(pid, { nombre: r.producto.nombre, codigo: r.producto.codigo });
      }
      stockPorDep.get(pid)[dep] += Number(r.cantidad);
    });

    const result: any[] = [];
    stockPorDep.forEach((stock, pid) => {
      const info = infoProd.get(pid);
      const deps = ['LOCAL','PIEZA','LOCAL2','DEP_LOCAL2'];
      for (const dep of deps) {
        if (stock[dep] > 0) continue;
        const prioridad = PRIORIDAD_DESDE[dep] || [];
        for (const fuente of prioridad) {
          if (stock[fuente] > 0) {
            result.push({
              codigo: info.codigo,
              nombre: info.nombre,
              depSinStock: dep,
              depConStock: fuente,
              cantidad: stock[fuente],
              labelSinStock: DEP_LABEL[dep],
              labelConStock: DEP_LABEL[fuente],
            });
            break;
          }
        }
      }
    });

    return result
      .sort((a, b) => a.depSinStock.localeCompare(b.depSinStock) || b.cantidad - a.cantidad)
      .slice(0, 100);
  }, [rowsTodas, sucursalId]);

  const rowsDelTipo = useMemo(
    () => rows.filter((r) => (r.tipo_lote || 'venta') === tipoView),
    [rows, tipoView]
  );

  const contadoresTipo = useMemo(() => ({
    venta: rows.filter((r) => (r.tipo_lote || 'venta') === 'venta').length,
    granel: rows.filter((r) => r.tipo_lote === 'granel').length,
  }), [rows]);

  const filtradas = useMemo(() => {
    return rowsDelTipo.filter((r) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        if (
          !r.producto?.nombre?.toLowerCase().includes(q) &&
          !r.producto?.codigo?.toLowerCase().includes(q)
        ) return false;
      }
      if (filtro !== 'todos') {
        const sem = semaforoVencimiento(r.fecha_vencimiento);
        if (sem.color !== filtro) return false;
      }
      // Ocultar lotes de carga inicial (venc 2099) en el semáforo verde si se filtra
      return true;
    });
  }, [rowsDelTipo, busqueda, filtro]);

  const contadoresSem = useMemo(() => {
    const c = { rojo: 0, naranja: 0, amarillo: 0, verde: 0 };
    rowsDelTipo.forEach((r) => { c[semaforoVencimiento(r.fecha_vencimiento).color]++; });
    return c;
  }, [rowsDelTipo]);

  const esCargaInicial = (fecha: string) => fecha === VENC_SIN_FECHA;

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={`${sucursales.find(s => s.id === sucursalId)?.nombre || ''}`}
        backHref="/"
      />
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Selector sucursal */}
        <div className="flex gap-2">
          {sucursales.map((s) => (
            <button
              key={s.id}
              onClick={() => setSucursalId(s.id)}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${
                sucursalId === s.id ? 'bg-accent text-black' : 'bg-bg-card border border-border text-neutral-300'
              }`}
            >
              {s.nombre}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2 flex-wrap">
          <TabBtn active={tipoView === 'venta'} onClick={() => setTipoView('venta')} icon={<Package size={14}/>}>
            Venta ({contadoresTipo.venta})
          </TabBtn>
          <TabBtn active={tipoView === 'granel'} onClick={() => setTipoView('granel')} icon={<Scale size={14}/>}>
            Granel ({contadoresTipo.granel})
          </TabBtn>
          <TabBtn
            active={tipoView === 'alertas'}
            onClick={() => setTipoView('alertas')}
            icon={<AlertTriangle size={14}/>}
            danger={transferenciasRecomendadas.length > 0}
          >
            Alertas {transferenciasRecomendadas.length > 0 && `(${transferenciasRecomendadas.length})`}
          </TabBtn>
        </div>

        {/* ===== TAB ALERTAS ===== */}
        {tipoView === 'alertas' && (
          <div className="space-y-4">
            {transferenciasRecomendadas.length === 0 ? (
              <Card className="py-12 text-center text-neutral-500">
                Sin alertas de transferencia para esta sucursal.
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="p-3 border-b border-border flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-warning" />
                  <div className="text-sm font-semibold text-warning">
                    {transferenciasRecomendadas.length} transferencias recomendadas
                  </div>
                </div>
                <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                  {transferenciasRecomendadas.map((t, i) => (
                    <div key={`${t.codigo}-${t.depSinStock}`} className="px-3 py-2.5 flex items-center gap-3 hover:bg-bg-hover">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-neutral-500">[{t.codigo}]</div>
                        <div className="text-sm font-medium truncate">{t.nombre}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          <span className="text-danger">{t.labelSinStock}</span>
                          <span className="mx-1">←</span>
                          <span className="text-success">{t.labelConStock}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-success">{t.cantidad} un</div>
                        <div className="text-[10px] text-neutral-500">disponibles</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ===== TABS VENTA / GRANEL ===== */}
        {tipoView !== 'alertas' && (
          <>
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
                  ? 'No hay lotes a granel. Las recepciones con factura del proveedor crean lotes granel.'
                  : 'Sin resultados para los filtros aplicados.'}
              </Card>
            ) : (
              <div className="space-y-2">
                {filtradas.map((r) => {
                  const esInicial = esCargaInicial(r.fecha_vencimiento);
                  const sem = esInicial
                    ? { color: 'verde', label: 'Sin venc.', border: 'border-l-neutral-600', text: 'text-neutral-400' }
                    : semaforoVencimiento(r.fecha_vencimiento);
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
                            {esInicial && (
                              <span className="text-[10px] uppercase font-bold bg-neutral-700 text-neutral-400 px-1.5 py-0.5 rounded">
                                Stock inicial
                              </span>
                            )}
                          </div>
                          <div className="font-medium text-sm truncate">{r.producto?.nombre}</div>
                          <div className="text-xs text-neutral-400 mt-0.5">
                            {esInicial ? 'Vencimiento no registrado' : `Vence ${formatDate(r.fecha_vencimiento)}`}
                            {r.costo > 0 && ` · Costo ${formatMoney(r.costo)}`}
                          </div>
                        </div>
                        <div className={`text-right ${sem.text}`}>
                          <div className="font-bold text-lg leading-tight">
                            {Number(r.cantidad).toLocaleString('es-AR')}
                            <span className="text-xs font-normal ml-1">{esGranel ? 'kg' : 'un'}</span>
                          </div>
                          <div className="text-[10px] uppercase font-semibold">{sem.label}</div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TabBtn({ active, onClick, icon, children, danger }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
        active
          ? danger ? 'bg-warning/20 text-warning border border-warning/40' : 'bg-accent text-black'
          : danger
          ? 'bg-bg-card border border-warning/30 text-warning'
          : 'bg-bg-card text-neutral-300 border border-border'
      }`}
    >
      {icon}{children}
    </button>
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
