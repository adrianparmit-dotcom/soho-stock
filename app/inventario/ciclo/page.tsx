// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils/format';
import { CheckCircle2, AlertTriangle, Download, Plus, Search, Minus, RotateCcw, ChevronDown } from 'lucide-react';

const PRODUCTOS_POR_SEMANA = 310;

function getLunes(): string {
  const hoy = new Date();
  const d = hoy.getDay();
  const diff = d === 0 ? -6 : 1 - d;
  const l = new Date(hoy); l.setDate(hoy.getDate() + diff);
  return l.toISOString().split('T')[0];
}
function getViernes(): string {
  const l = new Date(getLunes()); l.setDate(l.getDate() + 4);
  return l.toISOString().split('T')[0];
}

const DEPOSITO_LABEL: Record<string, string> = {
  LOCAL: 'LOCAL (SOHO 1)',
  PIEZA: 'PIEZA (SOHO 1)',
  LOCAL2: 'LOCAL 2 (SOHO 2)',
  DEP_LOCAL2: 'DEP. LOCAL 2',
};

export default function InventarioCicloPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [cicloActivo, setCicloActivo] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [sucursalId, setSucursalId] = useState(1);
  const [deposito, setDeposito] = useState('LOCAL');
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  // Conteos parciales locales (no guardados aún): itemId → valor del input actual
  const [conteosParciales, setConteosParciales] = useState<Record<number, number>>({});
  // Guardado pendiente
  const saveTimers = useRef<Record<number, any>>({});

  const DEPOSITOS_SUCURSAL: Record<number, string[]> = {
    1: ['LOCAL', 'PIEZA'],
    2: ['LOCAL2', 'DEP_LOCAL2'],
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      setUserId(data.user.id);
    });
    supabase.from('sucursales').select('id,nombre').order('id').then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [sucursalId, deposito]);

  const cargarDatos = async () => {
    setLoading(true);
    const { data: ciclos } = await supabase
      .from('inventario_ciclos')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .eq('rubro_foco', deposito) // usamos rubro_foco para guardar el depósito
      .order('semana_inicio', { ascending: false })
      .limit(10);

    const activo = (ciclos || []).find(c => c.estado !== 'completado');
    const completados = (ciclos || []).filter(c => c.estado === 'completado');
    setCicloActivo(activo || null);
    setHistorial(completados.slice(0, 5));

    if (activo) {
      const { data: its } = await supabase
        .from('inventario_items')
        .select('*, producto:productos(id,codigo,nombre,rubro,sub_rubro)')
        .eq('ciclo_id', activo.id)
        .order('id');
      setItems(its || []);
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  const generarCiclo = async () => {
    setGenerando(true);
    try {
      const { data: todos } = await supabase
        .from('productos').select('id,codigo,nombre,rubro').order('rubro').order('nombre');
      if (!todos?.length) { alert('No hay productos'); return; }

      // Calcular qué segmento le toca
      const { count } = await supabase.from('inventario_ciclos')
        .select('*', { count: 'exact', head: true })
        .eq('sucursal_id', sucursalId).eq('rubro_foco', deposito);
      const ci = ((count || 0) * PRODUCTOS_POR_SEMANA) % todos.length;
      let sel = todos.slice(ci, ci + PRODUCTOS_POR_SEMANA);
      if (sel.length < PRODUCTOS_POR_SEMANA) sel = [...sel, ...todos.slice(0, PRODUCTOS_POR_SEMANA - sel.length)];

      // Stock actual del depósito
      const pids = sel.map(p => p.id);
      const { data: lotes } = await supabase.from('lotes')
        .select('producto_id,cantidad').in('producto_id', pids)
        .eq('sucursal_id', sucursalId).eq('deposito', deposito).gt('cantidad', 0);
      const stockMap = new Map<number, number>();
      (lotes || []).forEach(l => stockMap.set(l.producto_id, (stockMap.get(l.producto_id) || 0) + Number(l.cantidad)));

      const { data: ciclo, error } = await supabase.from('inventario_ciclos').insert({
        semana_inicio: getLunes(),
        semana_fin: getViernes(),
        sucursal_id: sucursalId,
        rubro_foco: deposito, // guardamos el depósito aquí
        total_productos: sel.length,
        estado: 'en_curso',
      }).select('id').single();
      if (error) throw error;

      const itemsData = sel.map(p => ({
        ciclo_id: ciclo.id,
        producto_id: p.id,
        stock_sistema: stockMap.get(p.id) || 0,
        stock_contado: null,
      }));
      for (let i = 0; i < itemsData.length; i += 100) {
        const { error: e } = await supabase.from('inventario_items').insert(itemsData.slice(i, i + 100));
        if (e) throw e;
      }
      await cargarDatos();
    } catch (e: any) { alert('Error: ' + e.message); }
    setGenerando(false);
  };

  // Sumar al conteo existente (con debounce para guardar)
  const sumarConteo = async (itemId: number, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const actual = item.stock_contado ?? 0;
    const nuevo = Math.max(0, actual + delta);

    // Actualizar local inmediatamente
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, stock_contado: nuevo } : i));

    // Guardar con debounce de 1 segundo
    if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(async () => {
      await supabase.from('inventario_items').update({
        stock_contado: nuevo,
        contado_at: new Date().toISOString(),
        contado_por: userId,
      }).eq('id', itemId);
    }, 800);
  };

  const marcarCompleto = async (itemId: number) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, completado: true } : i));
    await supabase.from('inventario_items').update({
      contado_at: new Date().toISOString(),
      contado_por: userId,
      observaciones: 'completado',
    }).eq('id', itemId);
  };

  const completarCiclo = async () => {
    if (!cicloActivo) return;
    const sinContar = items.filter(i => i.stock_contado === null).length;
    if (sinContar > 0 && !confirm(`${sinContar} productos sin contar. ¿Finalizar igual?`)) return;
    await supabase.from('inventario_ciclos').update({ estado: 'completado' }).eq('id', cicloActivo.id);
    generarInformeAjuste();
    setCicloActivo(null); setItems([]); await cargarDatos();
  };

  const generarInformeAjuste = async () => {
    const conDif = items.filter(i => i.stock_contado !== null && Math.abs(i.stock_contado - i.stock_sistema) > 0.001);
    if (!conDif.length) { alert('Sin diferencias — no se requieren ajustes.'); return; }

    const XLSX = await import('xlsx');
    const fechaHoy = new Date().toLocaleDateString('es-AR');
    const filas: any[][] = [
      [`INFORME DE AJUSTE DE STOCK — ${fechaHoy}`],
      [`Depósito: ${DEPOSITO_LABEL[deposito]} · Semana: ${cicloActivo?.semana_inicio} → ${cicloActivo?.semana_fin}`],
      [`${conDif.length} producto(s) con diferencia requieren ajuste manual en DUX`],
      [],
      ['CÓDIGO', 'PRODUCTO', 'RUBRO', 'STOCK SISTEMA', 'STOCK CONTADO', 'DIFERENCIA', 'ACCIÓN'],
    ];
    for (const item of conDif) {
      const dif = item.stock_contado - item.stock_sistema;
      filas.push([
        item.producto?.codigo || '',
        item.producto?.nombre || '',
        item.producto?.rubro || '',
        item.stock_sistema,
        item.stock_contado,
        dif > 0 ? `+${dif.toFixed(1)}` : dif.toFixed(1),
        dif > 0 ? 'AUMENTAR stock en DUX' : 'REDUCIR stock en DUX',
      ]);
    }
    filas.push([]);
    filas.push(['', '', '', '', 'TOTAL DIFERENCIAS:', conDif.reduce((a, i) => a + Math.abs(i.stock_contado - i.stock_sistema), 0).toFixed(1), '']);

    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [{ wch: 8 }, { wch: 45 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ajuste de Stock');
    XLSX.writeFile(wb, `ajuste-stock-${cicloActivo?.semana_inicio}.xlsx`);
  };

  const exportarCompleto = async () => {
    setExportando(true);
    const XLSX = await import('xlsx');
    const fechaHoy = new Date().toLocaleDateString('es-AR');
    const filas: any[][] = [
      [`INVENTARIO ${cicloActivo?.semana_inicio} → ${cicloActivo?.semana_fin}`],
      [`Depósito: ${DEPOSITO_LABEL[deposito]}`],
      [],
      ['CÓDIGO', 'PRODUCTO', 'RUBRO', 'STOCK SISTEMA', 'STOCK CONTADO', 'DIFERENCIA'],
    ];
    for (const item of items) {
      const dif = item.stock_contado !== null ? item.stock_contado - item.stock_sistema : '';
      filas.push([item.producto?.codigo || '', item.producto?.nombre || '', item.producto?.rubro || '',
        item.stock_sistema, item.stock_contado ?? '', typeof dif === 'number' ? (dif > 0 ? `+${dif.toFixed(1)}` : dif.toFixed(1)) : '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [{ wch: 8 }, { wch: 45 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `inventario-${cicloActivo?.semana_inicio}.xlsx`);
    setExportando(false);
  };

  const itemsFiltrados = useMemo(() => {
    let base = items;
    if (soloFaltantes) base = base.filter(i => i.stock_contado === null);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      base = base.filter(i => i.producto?.nombre?.toLowerCase().includes(q) || i.producto?.codigo?.includes(q));
    }
    return base;
  }, [items, busqueda, soloFaltantes]);

  const contados = items.filter(i => i.stock_contado !== null).length;
  const conDif = items.filter(i => i.stock_contado !== null && Math.abs(i.stock_contado - i.stock_sistema) > 0.001).length;
  const pct = items.length > 0 ? Math.round((contados / items.length) * 100) : 0;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <>
      <PageHeader title="Inventario rotativo" backHref="/" />
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

        {/* Selector sucursal + depósito */}
        <div className="space-y-2">
          <div className="flex gap-2">
            {sucursales.map(s => (
              <button key={s.id} onClick={() => { setSucursalId(s.id); setDeposito(DEPOSITOS_SUCURSAL[s.id][0]); }}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${sucursalId === s.id ? 'bg-accent text-black' : 'bg-bg-card border border-border text-neutral-300'}`}>
                {s.nombre}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(DEPOSITOS_SUCURSAL[sucursalId] || []).map(dep => (
              <button key={dep} onClick={() => setDeposito(dep)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${deposito === dep ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-bg-card border border-border text-neutral-400'}`}>
                {DEPOSITO_LABEL[dep]}
              </button>
            ))}
          </div>
        </div>

        {/* Sin ciclo activo */}
        {!cicloActivo && (
          <Card className="p-5">
            <h2 className="font-bold text-lg mb-1">Generar ciclo — {DEPOSITO_LABEL[deposito]}</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Se asignan ~{PRODUCTOS_POR_SEMANA} productos automáticamente rotando por rubros. El catálogo completo se cubre en ~10 semanas.
            </p>
            <BigButton onClick={generarCiclo} loading={generando} icon={<Plus size={18} />}>
              Generar ciclo {getLunes()} → {getViernes()}
            </BigButton>
          </Card>
        )}

        {/* Ciclo activo */}
        {cicloActivo && (
          <>
            {/* Header progreso */}
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{formatDate(cicloActivo.semana_inicio)} → {formatDate(cicloActivo.semana_fin)}</div>
                  <div className="text-sm text-neutral-400">{DEPOSITO_LABEL[deposito]}</div>
                  {conDif > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-warning">
                      <AlertTriangle size={12} /> {conDif} diferencia(s) detectada(s)
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-accent">{pct}%</div>
                  <div className="text-xs text-neutral-500">{contados}/{items.length}</div>
                </div>
              </div>
              <div className="mt-3 h-2 bg-bg-card rounded-full overflow-hidden">
                <div className="h-full bg-success transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-neutral-600 mt-2">
                Los cambios se guardan automáticamente. Podés cerrar y continuar después.
              </p>
            </Card>

            {/* Acciones */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={exportarCompleto} disabled={exportando}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 text-sm font-semibold hover:bg-neutral-700 transition">
                <Download size={14} /> {exportando ? '...' : 'Exportar'}
              </button>
              <button onClick={() => setSoloFaltantes(!soloFaltantes)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${soloFaltantes ? 'bg-accent text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}>
                Solo sin contar ({items.filter(i => i.stock_contado === null).length})
              </button>
              <button onClick={completarCiclo}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 transition ml-auto">
                <CheckCircle2 size={14} /> Finalizar y generar ajuste
              </button>
            </div>

            {/* Buscador */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto o código..."
                className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent" />
            </div>

            {/* Lista de productos */}
            <div className="space-y-2">
              {itemsFiltrados.map(item => {
                const contado = item.stock_contado !== null;
                const dif = contado ? item.stock_contado - item.stock_sistema : null;
                const hayDif = dif !== null && Math.abs(dif) > 0.001;
                return (
                  <Card key={item.id} className={`p-3 border-l-4 transition ${contado ? (hayDif ? 'border-l-warning' : 'border-l-success') : 'border-l-neutral-700'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-neutral-500">[{item.producto?.codigo}]</span>
                          {item.producto?.rubro && (
                            <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{item.producto.rubro}</span>
                          )}
                        </div>
                        <div className="font-medium text-sm truncate">{item.producto?.nombre}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Sistema: <b className="text-neutral-300">{item.stock_sistema} un</b>
                          {contado && dif !== null && (
                            <span className={`ml-2 font-semibold ${hayDif ? 'text-warning' : 'text-success'}`}>
                              → Contado: {item.stock_contado} {hayDif ? `(${dif > 0 ? '+' : ''}${dif.toFixed(1)})` : '✓'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contador +/- */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => sumarConteo(item.id, -1)}
                          className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-300 active:scale-95 transition">
                          <Minus size={16} />
                        </button>
                        <div className={`w-12 text-center font-bold text-lg tabular-nums ${contado ? (hayDif ? 'text-warning' : 'text-success') : 'text-neutral-600'}`}>
                          {item.stock_contado ?? '—'}
                        </div>
                        <button onClick={() => sumarConteo(item.id, 1)}
                          className="w-9 h-9 rounded-xl bg-accent/20 hover:bg-accent/30 flex items-center justify-center text-accent active:scale-95 transition">
                          <Plus size={16} />
                        </button>
                        {contado && (
                          <button onClick={() => sumarConteo(item.id, -item.stock_contado)}
                            className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-500 active:scale-95 transition"
                            title="Resetear a 0">
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Historial */}
        {historial.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Historial</h3>
            <div className="space-y-2">
              {historial.map(c => (
                <Card key={c.id} className="p-3 flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-success flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{formatDate(c.semana_inicio)} → {formatDate(c.semana_fin)}</div>
                    <div className="text-xs text-neutral-500">{DEPOSITO_LABEL[c.rubro_foco] || c.rubro_foco} · {c.total_productos} productos</div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
