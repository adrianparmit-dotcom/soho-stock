// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { SucursalPicker } from '@/components/ui/SucursalPicker';
import { formatDate } from '@/lib/utils/format';
import { FechaRapida } from '@/components/recepcion/FechaRapida';
import {
  Check,
  AlertTriangle,
  CheckCircle2,
  Search,
  Package,
  Plus,
  Trash2,
  ChevronRight,
  Scale,
} from 'lucide-react';

type Paso = 'sucursal' | 'origen' | 'datos' | 'confirmado';

interface LoteGranel {
  id: number;
  cantidad: number;       // kg disponibles (tipo_lote = 'granel')
  peso_kg: number | null;
  fecha_vencimiento: string;
  producto: { id: number; codigo: string; nombre: string };
}

interface SalidaFraccionada {
  cantidad_bolsas: number;
  gramos_por_bolsa: number;
  vencimiento: string;
}

export default function FraccionadoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [paso, setPaso] = useState<Paso>('sucursal');
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  const [lotesGranel, setLotesGranel] = useState<LoteGranel[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loteOrigenId, setLoteOrigenId] = useState<number | null>(null);

  const [salidas, setSalidas] = useState<SalidaFraccionada[]>([
    { cantidad_bolsas: 0, gramos_por_bolsa: 0, vencimiento: '' },
  ]);
  const [operador, setOperador] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [resumen, setResumen] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
    supabase
      .from('sucursales')
      .select('id, nombre')
      .order('id')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => {
    if (!sucursalId) return;
    supabase
      .from('lotes')
      .select('id, cantidad, peso_kg, fecha_vencimiento, tipo_lote, producto:productos(id, codigo, nombre)')
      .eq('sucursal_id', sucursalId)
      .eq('tipo_lote', 'granel')
      .gt('cantidad', 0)
      .order('fecha_vencimiento', { ascending: true })
      .then(({ data }) => setLotesGranel(data || []));
  }, [sucursalId]);

  const lotesFiltrados = useMemo(() => {
    if (!busqueda.trim()) return lotesGranel;
    const q = busqueda.toLowerCase();
    return lotesGranel.filter((l) => {
      const n = l.producto?.nombre?.toLowerCase() || '';
      const c = l.producto?.codigo?.toLowerCase() || '';
      return n.includes(q) || c.includes(q);
    });
  }, [lotesGranel, busqueda]);

  const loteOrigen = lotesGranel.find((l) => l.id === loteOrigenId);
  const kgDisponibles = Number(loteOrigen?.cantidad || 0);

  // ============== SALIDAS ==============

  const actualizarSalida = (i: number, patch: Partial<SalidaFraccionada>) => {
    setSalidas((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const agregarSalida = () => {
    const ultima = salidas[salidas.length - 1];
    setSalidas((prev) => [
      ...prev,
      { cantidad_bolsas: 0, gramos_por_bolsa: 0, vencimiento: ultima?.vencimiento || '' },
    ]);
  };
  const quitarSalida = (i: number) => {
    if (salidas.length <= 1) return;
    setSalidas((prev) => prev.filter((_, idx) => idx !== i));
  };

  const totalFraccionadoG = salidas.reduce(
    (a, s) => a + s.cantidad_bolsas * s.gramos_por_bolsa,
    0
  );
  const totalFraccionadoKg = totalFraccionadoG / 1000;
  const mermaKg = Math.max(kgDisponibles - totalFraccionadoKg, 0);
  const mermaPct = kgDisponibles > 0 ? (mermaKg / kgDisponibles) * 100 : 0;
  const excede = totalFraccionadoKg > kgDisponibles * 1.01;
  const mermaAlta = mermaPct > 5;

  const puedeConfirmar = () => {
    if (!sucursalId || !loteOrigenId) return false;
    if (salidas.length === 0) return false;
    for (const s of salidas) {
      if (s.cantidad_bolsas <= 0) return false;
      if (s.gramos_por_bolsa <= 0) return false;
      if (!s.vencimiento) return false;
    }
    if (excede) return false;
    return true;
  };

  const handleConfirmar = async () => {
    setGuardando(true);
    try {
      // 1. Cerrar lote granel (cantidad = 0)
      await supabase
        .from('lotes')
        .update({ cantidad: 0 })
        .eq('id', loteOrigenId);

      // 2. Movimiento egreso del granel
      await supabase.from('movimientos').insert({
        lote_id: loteOrigenId,
        tipo: 'fraccionamiento',
        cantidad: kgDisponibles,
        notas: `Fraccionamiento: ${kgDisponibles}kg bruto → ${totalFraccionadoKg.toFixed(3)}kg netos (merma ${mermaPct.toFixed(2)}%)`,
      });

      // 3. Registro en fraccionados (auditoría)
      const { data: fracRow, error: fracErr } = await supabase
        .from('fraccionados')
        .insert({
          sucursal_id: sucursalId,
          lote_origen_id: loteOrigenId,
          bultos_usados: 1,
          peso_total_kg: kgDisponibles,
          peso_fraccionado_kg: totalFraccionadoKg,
          operador: operador || null,
          observaciones: observaciones || null,
        })
        .select('id')
        .single();
      if (fracErr) throw fracErr;

      // 4. Crear lote NUEVO de venta por cada tipo de bolsa
      //    Todas van al MISMO producto (el del lote origen)
      //    Si hay múltiples salidas, sumamos las bolsas agrupando por gramos+vencimiento
      const salidasGuardadas: any[] = [];
      for (const s of salidas) {
        const { data: loteDestino, error: loteErr } = await supabase
          .from('lotes')
          .insert({
            producto_id: loteOrigen.producto.id,
            sucursal_id: sucursalId,
            cantidad: s.cantidad_bolsas,
            peso_kg: null,
            fecha_vencimiento: s.vencimiento,
            tipo_lote: 'venta',
            origen_fraccionado_id: fracRow.id,
          })
          .select('id')
          .single();
        if (loteErr) throw loteErr;

        await supabase.from('movimientos').insert({
          lote_id: loteDestino.id,
          tipo: 'ingreso',
          cantidad: s.cantidad_bolsas,
          notas: `Fraccionamiento #${fracRow.id}: ${s.cantidad_bolsas} bolsas × ${s.gramos_por_bolsa}g`,
        });

        salidasGuardadas.push({
          bolsas: s.cantidad_bolsas,
          gramos: s.gramos_por_bolsa,
          total_kg: (s.cantidad_bolsas * s.gramos_por_bolsa) / 1000,
          vencimiento: s.vencimiento,
        });
      }

      setResumen({
        fraccionado_id: fracRow.id,
        producto: loteOrigen.producto.nombre,
        codigo: loteOrigen.producto.codigo,
        kgBruto: kgDisponibles,
        kgFraccionado: totalFraccionadoKg,
        merma: mermaKg,
        mermaPct,
        salidas: salidasGuardadas,
      });
      setPaso('confirmado');
    } catch (err: any) {
      alert('Error al guardar: ' + (err.message || String(err)));
    } finally {
      setGuardando(false);
    }
  };

  const reset = () => {
    setPaso('sucursal');
    setLoteOrigenId(null);
    setSalidas([{ cantidad_bolsas: 0, gramos_por_bolsa: 0, vencimiento: '' }]);
    setOperador('');
    setObservaciones('');
    setBusqueda('');
    setResumen(null);
  };

  // ============== CONFIRMADO ==============
  if (paso === 'confirmado' && resumen) {
    return (
      <>
        <PageHeader title="Fraccionado" backHref="/" />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="text-center mb-4">
            <div className="inline-flex w-20 h-20 rounded-full bg-success/15 items-center justify-center mb-4">
              <CheckCircle2 size={44} className="text-success" />
            </div>
            <h2 className="text-2xl font-bold mb-1">Fraccionamiento registrado</h2>
            <p className="text-neutral-400 text-sm">
              [{resumen.codigo}] {resumen.producto}
            </p>
          </div>

          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Bruto</div>
                <div className="font-bold">{resumen.kgBruto.toFixed(3)} kg</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Fraccionado</div>
                <div className="font-bold">{resumen.kgFraccionado.toFixed(3)} kg</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Merma</div>
                <div className={`font-bold ${resumen.mermaPct > 5 ? 'text-warning' : 'text-success'}`}>
                  {resumen.merma.toFixed(3)} kg
                  <span className="block text-xs font-normal">
                    ({resumen.mermaPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs uppercase text-neutral-400 mb-2">Bolsas generadas</div>
            <ul className="text-sm space-y-1.5">
              {resumen.salidas.map((s: any, i: number) => (
                <li key={i} className="flex items-center justify-between">
                  <span>
                    <b>{s.bolsas}</b> × {s.gramos}g
                  </span>
                  <span className="text-neutral-400 text-xs">
                    {s.total_kg.toFixed(3)} kg · vence {formatDate(s.vencimiento)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {resumen.mermaPct > 5 && (
            <Card className="p-4 border-warning/40 bg-warning/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm">
                  <div className="font-semibold text-warning">Merma alta: {resumen.mermaPct.toFixed(2)}%</div>
                  <div className="text-neutral-400 text-xs mt-0.5">
                    Queda registrado en el informe mensual para análisis.
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div className="flex gap-3 justify-center flex-wrap pt-4">
            <BigButton onClick={reset} variant="secondary">
              Cargar otro
            </BigButton>
            <BigButton onClick={() => router.push('/reportes/stock')}>Ver stock</BigButton>
          </div>
        </div>
      </>
    );
  }

  // ============== PASO 1: SUCURSAL ==============
  if (paso === 'sucursal') {
    return (
      <>
        <PageHeader title="Fraccionado · paso 1 de 3" subtitle="Elegí la sucursal" backHref="/" />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <SucursalPicker value={sucursalId} onChange={setSucursalId} sucursales={sucursales} />
          {sucursalId && (
            <BigButton
              onClick={() => setPaso('origen')}
              size="xl"
              className="w-full"
              icon={<ChevronRight size={22} />}
            >
              Continuar
            </BigButton>
          )}
        </div>
      </>
    );
  }

  // ============== PASO 2: ORIGEN ==============
  if (paso === 'origen') {
    return (
      <>
        <PageHeader
          title="Fraccionado · paso 2 de 3"
          subtitle="Elegí el lote a granel"
          backHref="/"
          right={
            <BigButton size="md" variant="ghost" onClick={() => setPaso('sucursal')}>
              ← Sucursal
            </BigButton>
          }
        />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
              placeholder="Buscar producto por nombre o código..."
              className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          {lotesFiltrados.length === 0 ? (
            <Card className="py-12 text-center text-neutral-500">
              {lotesGranel.length === 0
                ? 'No hay lotes a granel en esta sucursal. Cargá una recepción con factura del proveedor primero.'
                : 'Sin resultados.'}
            </Card>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {lotesFiltrados.map((l) => (
                <Card
                  key={l.id}
                  onClick={() => {
                    setLoteOrigenId(l.id);
                    setPaso('datos');
                  }}
                  className="p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                      <Scale size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-neutral-500">[{l.producto?.codigo}]</div>
                      <div className="font-medium text-sm truncate">{l.producto?.nombre}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">
                        <b>{l.cantidad} kg</b> a granel · Vence {formatDate(l.fecha_vencimiento)}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-neutral-500" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // ============== PASO 3: DATOS ==============
  return (
    <>
      <PageHeader
        title="Fraccionado · paso 3 de 3"
        subtitle={loteOrigen?.producto?.nombre || ''}
        backHref="/"
        right={
          <BigButton size="md" variant="ghost" onClick={() => setPaso('origen')}>
            ← Cambiar
          </BigButton>
        }
      />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Info del lote origen */}
        <Card className="p-4 bg-accent/5 border-accent/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-accent flex items-center gap-1">
                <Scale size={12} /> Lote a granel
              </div>
              <div className="font-bold text-lg mt-0.5">{kgDisponibles} kg</div>
              <div className="text-xs text-neutral-400">
                Vence {formatDate(loteOrigen?.fecha_vencimiento)}
              </div>
            </div>
          </div>
        </Card>

        {/* Salidas */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase text-neutral-400">
              Bolsas generadas
            </div>
            <button
              onClick={agregarSalida}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <Plus size={14} /> Otro tamaño
            </button>
          </div>

          <div className="space-y-3">
            {salidas.map((s, i) => {
              const totalG = s.cantidad_bolsas * s.gramos_por_bolsa;
              return (
                <div key={i} className="bg-bg-base rounded-xl p-3 border border-border space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        Bolsas
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={s.cantidad_bolsas || ''}
                        onChange={(e) =>
                          actualizarSalida(i, { cantidad_bolsas: parseInt(e.target.value) || 0 })
                        }
                        className="w-full bg-bg-card border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        Gramos c/u
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={s.gramos_por_bolsa || ''}
                        onChange={(e) =>
                          actualizarSalida(i, { gramos_por_bolsa: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-bg-card border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        Total
                      </label>
                      <div className="bg-bg-card/50 border border-border rounded-lg px-2 py-2 text-sm text-accent font-semibold">
                        {(totalG / 1000).toFixed(3)} kg
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        Vencimiento
                      </label>
                      <FechaRapida
                        value={s.vencimiento}
                        onChange={(iso) => actualizarSalida(i, { vencimiento: iso })}
                        compact
                      />
                    </div>
                    {salidas.length > 1 && (
                      <button
                        onClick={() => quitarSalida(i)}
                        className="p-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Merma */}
        <Card className={`p-4 ${mermaAlta ? 'border-warning/40 bg-warning/5' : ''}`}>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Bruto</div>
              <div className="font-bold">{kgDisponibles.toFixed(3)} kg</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Neto</div>
              <div className="font-bold">{totalFraccionadoKg.toFixed(3)} kg</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Merma</div>
              <div className={`font-bold ${mermaAlta ? 'text-warning' : 'text-success'}`}>
                {mermaKg.toFixed(3)} kg
                <span className="block text-xs font-normal">
                  ({mermaPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
          {mermaAlta && (
            <div className="flex items-start gap-2 mt-3 pt-3 border-t border-warning/20">
              <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={14} />
              <div className="text-xs text-warning">
                Merma &gt; 5%. Se registra en el informe mensual.
              </div>
            </div>
          )}
          {excede && (
            <div className="flex items-start gap-2 mt-3 pt-3 border-t border-danger/20">
              <AlertTriangle className="text-danger flex-shrink-0 mt-0.5" size={14} />
              <div className="text-xs text-danger font-semibold">
                El total fraccionado supera el bruto. Revisá los valores.
              </div>
            </div>
          )}
        </Card>

        {/* Operador */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1.5">
              Operador
            </label>
            <input
              type="text"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1.5">
              Observaciones
            </label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Opcional"
              className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <BigButton
          onClick={handleConfirmar}
          loading={guardando}
          disabled={!puedeConfirmar()}
          size="xl"
          className="w-full"
          icon={<Check size={22} />}
        >
          Confirmar fraccionamiento
        </BigButton>
      </div>
    </>
  );
}
