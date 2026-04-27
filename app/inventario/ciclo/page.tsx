// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils/format';
import { CheckCircle2, AlertTriangle, Download, Plus, Search } from 'lucide-react';

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

export default function InventarioCicloPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [cicloActivo, setCicloActivo] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [sucursalId, setSucursalId] = useState(1);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      const { data: ua } = await supabase.from('usuarios_app').select('rol').eq('id', data.user.id).single();
      setIsAdmin(ua?.rol === 'admin');
    });
    supabase.from('sucursales').select('id,nombre').order('id').then(({ data }) => setSucursales(data || []));
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    const { data: ciclos } = await supabase.from('inventario_ciclos')
      .select('*').order('semana_inicio', { ascending: false }).limit(20);
    const activo = (ciclos || []).find(c => c.estado !== 'completado');
    const completados = (ciclos || []).filter(c => c.estado === 'completado');
    setCicloActivo(activo || null);
    setHistorial(completados);
    if (activo) {
      const { data: its } = await supabase.from('inventario_items')
        .select('*, producto:productos(id,codigo,nombre,rubro,sub_rubro)')
        .eq('ciclo_id', activo.id).order('id');
      setItems(its || []);
    }
    setLoading(false);
  };

  const generarCiclo = async () => {
    setGenerando(true);
    try {
      const { data: todos } = await supabase.from('productos')
        .select('id,codigo,nombre,rubro').order('rubro').order('nombre');
      if (!todos?.length) { alert('No hay productos'); return; }
      const { count } = await supabase.from('inventario_ciclos').select('*', { count: 'exact', head: true });
      const ci = ((count || 0) * PRODUCTOS_POR_SEMANA) % todos.length;
      let sel = todos.slice(ci, ci + PRODUCTOS_POR_SEMANA);
      if (sel.length < PRODUCTOS_POR_SEMANA) sel = [...sel, ...todos.slice(0, PRODUCTOS_POR_SEMANA - sel.length)];

      const pids = sel.map(p => p.id);
      const { data: lotes } = await supabase.from('lotes').select('producto_id,cantidad,sucursal_id')
        .in('producto_id', pids).eq('sucursal_id', sucursalId).gt('cantidad', 0);
      const stockMap = new Map<number, number>();
      (lotes || []).forEach(l => stockMap.set(l.producto_id, (stockMap.get(l.producto_id) || 0) + Number(l.cantidad)));

      const rubros = sel.map(p => p.rubro).filter(Boolean);
      const rubroFoco = rubros.length > 0
        ? Object.entries(rubros.reduce((acc: any, r) => { acc[r] = (acc[r]||0)+1; return acc; }, {})).sort((a:any,b:any) => b[1]-a[1])[0][0]
        : 'General';

      const { data: ciclo, error } = await supabase.from('inventario_ciclos').insert({
        semana_inicio: getLunes(), semana_fin: getViernes(),
        sucursal_id: sucursalId, rubro_foco: rubroFoco,
        total_productos: sel.length, estado: 'en_curso',
      }).select('id').single();
      if (error) throw error;

      const itemsData = sel.map(p => ({
        ciclo_id: ciclo.id, producto_id: p.id, stock_sistema: stockMap.get(p.id) || 0,
      }));
      for (let i = 0; i < itemsData.length; i += 100) {
        const { error: e } = await supabase.from('inventario_items').insert(itemsData.slice(i, i+100));
        if (e) throw e;
      }
      await cargarDatos();
    } catch(e: any) { alert('Error: ' + e.message); }
    setGenerando(false);
  };

  const actualizarConteo = async (itemId: number, valor: string) => {
    const num = parseFloat(valor);
    if (isNaN(num)) return;
    await supabase.from('inventario_items').update({ stock_contado: num, contado_at: new Date().toISOString() }).eq('id', itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, stock_contado: num } : i));
  };

  const completarCiclo = async () => {
    if (!cicloActivo) return;
    const sinContar = items.filter(i => i.stock_contado === null).length;
    if (sinContar > 0 && !confirm(`${sinContar} sin contar. ¿Completar igual?`)) return;
    await supabase.from('inventario_ciclos').update({ estado: 'completado' }).eq('id', cicloActivo.id);
    setCicloActivo(null); setItems([]); await cargarDatos();
  };

  const exportarExcel = async () => {
    setExportando(true);
    const XLSX = await import('xlsx');
    const sucNombre = sucursales.find(s => s.id === cicloActivo?.sucursal_id)?.nombre || '';
    const filas: any[][] = [
      [`INVENTARIO ${cicloActivo?.semana_inicio} → ${cicloActivo?.semana_fin} · ${sucNombre}`],
      [`Rubro: ${cicloActivo?.rubro_foco}`],
      [],
      ['CÓDIGO','PRODUCTO','RUBRO','STOCK SISTEMA','STOCK CONTADO','DIFERENCIA','OBSERVACIONES'],
    ];
    for (const item of items) {
      const dif = item.stock_contado !== null ? item.stock_contado - item.stock_sistema : '';
      filas.push([item.producto?.codigo||'', item.producto?.nombre||'', item.producto?.rubro||'',
        item.stock_sistema, item.stock_contado??'', dif, item.observaciones||'']);
    }
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [{ wch:8 },{ wch:45 },{ wch:20 },{ wch:14 },{ wch:14 },{ wch:12 },{ wch:25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `inventario-${cicloActivo?.semana_inicio}.xlsx`);
    setExportando(false);
  };

  const itemsFiltrados = useMemo(() => {
    if (!busqueda.trim()) return items;
    const q = busqueda.toLowerCase();
    return items.filter(i => i.producto?.nombre?.toLowerCase().includes(q) || i.producto?.codigo?.includes(q) || i.producto?.rubro?.toLowerCase().includes(q));
  }, [items, busqueda]);

  const contados = items.filter(i => i.stock_contado !== null).length;
  const conDif = items.filter(i => i.stock_contado !== null && Math.abs(i.stock_contado - i.stock_sistema) > 0.001).length;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <>
      <PageHeader title="Inventario rotativo" backHref="/" />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {!cicloActivo && isAdmin && (
          <Card className="p-5">
            <h2 className="font-bold text-lg mb-1">Generar ciclo semanal</h2>
            <p className="text-sm text-neutral-400 mb-4">~{PRODUCTOS_POR_SEMANA} productos automáticos, rotando por rubros. Todo el catálogo se cubre en ~10 semanas.</p>
            <div className="flex gap-2 mb-4">
              {sucursales.map(s => (
                <button key={s.id} onClick={() => setSucursalId(s.id)}
                  className={`flex-1 py-2 rounded-xl font-semibold text-sm transition ${sucursalId===s.id?'bg-accent text-black':'bg-bg-card border border-border'}`}>
                  {s.nombre}
                </button>
              ))}
            </div>
            <BigButton onClick={generarCiclo} loading={generando} icon={<Plus size={18}/>}>
              Generar {getLunes()} → {getViernes()}
            </BigButton>
          </Card>
        )}

        {!cicloActivo && !isAdmin && (
          <Card className="py-12 text-center text-neutral-500">Sin ciclo activo esta semana. Pedile al admin que genere uno.</Card>
        )}

        {cicloActivo && (
          <>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-lg">{formatDate(cicloActivo.semana_inicio)} → {formatDate(cicloActivo.semana_fin)}</div>
                  <div className="text-sm text-neutral-400">{sucursales.find(s=>s.id===cicloActivo.sucursal_id)?.nombre} · Rubro: {cicloActivo.rubro_foco}</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-accent">{contados}</div>
                  <div className="text-xs text-neutral-500">de {items.length}</div>
                </div>
              </div>
              <div className="mt-3 h-2 bg-bg-card rounded-full overflow-hidden flex">
                <div className="h-full bg-success transition-all" style={{ width: `${items.length>0?(contados/items.length)*100:0}%` }}/>
              </div>
              {conDif > 0 && <div className="flex items-center gap-2 mt-2 text-sm text-warning"><AlertTriangle size={14}/> {conDif} diferencia(s)</div>}
            </Card>

            <div className="flex gap-3 flex-wrap">
              <button onClick={exportarExcel} disabled={exportando}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 transition">
                <Download size={16}/> {exportando?'...':'Exportar Excel'}
              </button>
              {isAdmin && contados >= items.length && (
                <button onClick={completarCiclo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-black text-sm font-semibold hover:bg-accent-hover transition">
                  <CheckCircle2 size={16}/> Completar ciclo
                </button>
              )}
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"/>
              <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar..."
                className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent"/>
            </div>

            <div className="space-y-2">
              {itemsFiltrados.map(item => {
                const contado = item.stock_contado !== null;
                const dif = contado ? item.stock_contado - item.stock_sistema : null;
                const hayDif = dif !== null && Math.abs(dif) > 0.001;
                return (
                  <Card key={item.id} className={`p-3 border-l-4 ${contado?(hayDif?'border-warning':'border-success'):'border-neutral-700'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-neutral-500">[{item.producto?.codigo}]</span>
                          {item.producto?.rubro && <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{item.producto.rubro}</span>}
                        </div>
                        <div className="font-medium text-sm truncate">{item.producto?.nombre}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Sistema: <b className="text-neutral-200">{item.stock_sistema}</b>
                          {contado && dif !== null && (
                            <span className={`ml-2 font-semibold ${hayDif?'text-warning':'text-success'}`}>
                              → Contado: {item.stock_contado} {hayDif?`(${dif>0?'+':''}${dif.toFixed(1)})`:'✓'}
                            </span>
                          )}
                        </div>
                      </div>
                      <input type="number" min="0" step="0.5"
                        defaultValue={item.stock_contado ?? ''}
                        onBlur={e => actualizarConteo(item.id, e.target.value)}
                        placeholder="Contar"
                        className="w-20 bg-bg-card border border-border rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:border-accent tabular-nums"/>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {historial.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Historial</h3>
            <div className="space-y-2">
              {historial.map(c => (
                <Card key={c.id} className="p-3 flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-success flex-shrink-0"/>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{formatDate(c.semana_inicio)} → {formatDate(c.semana_fin)}</div>
                    <div className="text-xs text-neutral-500">{c.rubro_foco} · {c.total_productos} productos</div>
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
