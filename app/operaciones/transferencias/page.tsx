// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { parsearTransferenciaDux } from '@/lib/parsers/dux-transferencia';
import { formatDate } from '@/lib/utils/format';
import {
  ClipboardPaste,
  Check,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Layers,
} from 'lucide-react';

const MAPEO_DEPOSITO_SUCURSAL: Record<string, number> = {
  'LOCAL': 1,
  'PIEZA': 1,
  'LOCAL 2': 2,
  'DEPOSITO LOCAL 2': 2,
};

type Paso = 'pegar' | 'preview' | 'confirmado';

interface LoteDisponible {
  id: number;
  cantidad: number;
  fecha_vencimiento: string;
}

interface AsignacionLote {
  lote_id: number;
  cantidad: number; // cuánto tomar de ese lote
  fecha_vencimiento: string;
  stock_disponible: number;
}

interface FilaTransfer {
  codigo: string;
  descripcion: string;
  cantidad: number; // la que pide la transferencia
  producto_id: number | null;
  lotes_disponibles: LoteDisponible[];
  stock_total: number;
  asignaciones: AsignacionLote[]; // editable: qué lote(s) usar
  stock_suficiente: boolean;
}

export default function TransferenciasPage() {
  const router = useRouter();
  const supabase = createClient();

  const [paso, setPaso] = useState<Paso>('pegar');
  const [texto, setTexto] = useState('');
  const [parseError, setParseError] = useState('');
  const [encabezado, setEncabezado] = useState<any>(null);
  const [sucursalOrigen, setSucursalOrigen] = useState<number | null>(null);
  const [sucursalDestino, setSucursalDestino] = useState<number | null>(null);
  const [filas, setFilas] = useState<FilaTransfer[]>([]);
  const [productosFaltantes, setProductosFaltantes] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [transferenciaId, setTransferenciaId] = useState<number | null>(null);

  const handleParsear = async () => {
    setParseError('');
    if (!texto.trim()) {
      setParseError('Pegá el texto de la transferencia.');
      return;
    }

    const parsed = parsearTransferenciaDux(texto);

    if (parsed.items.length === 0) {
      setParseError('No se pudo parsear la transferencia.');
      return;
    }

    const origen = parsed.deposito_origen.toUpperCase().trim();
    const destino = parsed.deposito_destino.toUpperCase().trim();
    const sucOrigen = MAPEO_DEPOSITO_SUCURSAL[origen];
    const sucDestino = MAPEO_DEPOSITO_SUCURSAL[destino];

    if (!sucOrigen || !sucDestino) {
      setParseError(
        `Depósitos no reconocidos. Origen: "${origen}", Destino: "${destino}".`
      );
      return;
    }
    if (sucOrigen === sucDestino) {
      setParseError('Origen y destino son la misma sucursal.');
      return;
    }

    // Productos por código
    const codigos = parsed.items.map((it) => it.codigo);
    const { data: prods } = await supabase
      .from('productos')
      .select('id, codigo')
      .in('codigo', codigos);
    const mapProd = new Map<string, number>();
    (prods || []).forEach((p) => mapProd.set(p.codigo, p.id));

    // Lotes disponibles en origen (solo de venta, no granel)
    const prodIds = (prods || []).map((p) => p.id);
    const { data: lotes } = await supabase
      .from('lotes')
      .select('id, producto_id, cantidad, fecha_vencimiento, tipo_lote')
      .in('producto_id', prodIds.length ? prodIds : [0])
      .eq('sucursal_id', sucOrigen)
      .eq('tipo_lote', 'venta')
      .gt('cantidad', 0)
      .order('fecha_vencimiento', { ascending: true });

    const mapLotes = new Map<number, any[]>();
    (lotes || []).forEach((l) => {
      if (!mapLotes.has(l.producto_id)) mapLotes.set(l.producto_id, []);
      mapLotes.get(l.producto_id)!.push({
        id: l.id,
        cantidad: Number(l.cantidad),
        fecha_vencimiento: l.fecha_vencimiento,
      });
    });

    const faltantes: string[] = [];
    const filasIniciales: FilaTransfer[] = parsed.items.map((it) => {
      const pid = mapProd.get(it.codigo) ?? null;
      const lotesProd = pid ? mapLotes.get(pid) || [] : [];
      const stockTotal = lotesProd.reduce((a, l) => a + l.cantidad, 0);
      const stockSuf = !!pid && stockTotal >= it.cantidad;

      if (!pid) {
        faltantes.push(`[${it.codigo}] ${it.descripcion} — producto no existe`);
      } else if (!stockSuf) {
        faltantes.push(
          `[${it.codigo}] ${it.descripcion} — stock ${stockTotal} < ${it.cantidad} pedidos`
        );
      }

      // Asignación inicial FIFO: tomar del lote que vence primero
      const asignaciones: AsignacionLote[] = [];
      if (stockSuf) {
        let restante = it.cantidad;
        for (const l of lotesProd) {
          if (restante <= 0) break;
          const aTomar = Math.min(restante, l.cantidad);
          asignaciones.push({
            lote_id: l.id,
            cantidad: aTomar,
            fecha_vencimiento: l.fecha_vencimiento,
            stock_disponible: l.cantidad,
          });
          restante -= aTomar;
        }
      }

      return {
        codigo: it.codigo,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        producto_id: pid,
        lotes_disponibles: lotesProd,
        stock_total: stockTotal,
        asignaciones,
        stock_suficiente: stockSuf,
      };
    });

    setEncabezado(parsed);
    setSucursalOrigen(sucOrigen);
    setSucursalDestino(sucDestino);
    setFilas(filasIniciales);
    setProductosFaltantes(faltantes);
    setPaso('preview');
  };

  const cambiarLote = (i: number, asigIdx: number, nuevoLoteId: number) => {
    const fila = filas[i];
    const lote = fila.lotes_disponibles.find((l) => l.id === nuevoLoteId);
    if (!lote) return;

    const nuevasAsig = fila.asignaciones.map((a, idx) =>
      idx === asigIdx
        ? {
            lote_id: nuevoLoteId,
            cantidad: Math.min(a.cantidad, lote.cantidad),
            fecha_vencimiento: lote.fecha_vencimiento,
            stock_disponible: lote.cantidad,
          }
        : a
    );
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, asignaciones: nuevasAsig } : f)));
  };

  const cambiarCantidadAsig = (i: number, asigIdx: number, cant: number) => {
    setFilas((prev) =>
      prev.map((f, idx) => {
        if (idx !== i) return f;
        const nuevas = f.asignaciones.map((a, ai) =>
          ai === asigIdx ? { ...a, cantidad: cant } : a
        );
        return { ...f, asignaciones: nuevas };
      })
    );
  };

  const agregarAsignacion = (i: number) => {
    const fila = filas[i];
    const idsUsados = new Set(fila.asignaciones.map((a) => a.lote_id));
    const libre = fila.lotes_disponibles.find((l) => !idsUsados.has(l.id));
    if (!libre) return;
    setFilas((prev) =>
      prev.map((f, idx) =>
        idx === i
          ? {
              ...f,
              asignaciones: [
                ...f.asignaciones,
                {
                  lote_id: libre.id,
                  cantidad: 0,
                  fecha_vencimiento: libre.fecha_vencimiento,
                  stock_disponible: libre.cantidad,
                },
              ],
            }
          : f
      )
    );
  };

  const quitarAsignacion = (i: number, asigIdx: number) => {
    setFilas((prev) =>
      prev.map((f, idx) =>
        idx === i
          ? { ...f, asignaciones: f.asignaciones.filter((_, ai) => ai !== asigIdx) }
          : f
      )
    );
  };

  const puedeConfirmar = () => {
    if (filas.length === 0) return false;
    for (const f of filas) {
      if (!f.stock_suficiente) return false;
      const suma = f.asignaciones.reduce((a, x) => a + (x.cantidad || 0), 0);
      if (Math.abs(suma - f.cantidad) > 0.001) return false;
      for (const a of f.asignaciones) {
        if (a.cantidad <= 0) return false;
        if (a.cantidad > a.stock_disponible) return false;
      }
    }
    return true;
  };

  const handleConfirmar = async () => {
    setGuardando(true);
    try {
      // 1. Cabecera
      const { data: transf, error: tErr } = await supabase
        .from('transferencias')
        .insert({
          origen_id: sucursalOrigen,
          destino_id: sucursalDestino,
          numero: encabezado.numero,
          fecha: encabezado.fecha,
          nota: `Usuario DUX: ${encabezado.usuario}`,
          lote_id: filas[0]?.asignaciones[0]?.lote_id || null,
          cantidad: 0,
        })
        .select('id')
        .single();
      if (tErr) throw tErr;

      // 2. Procesar cada fila
      for (const f of filas) {
        for (const a of f.asignaciones) {
          if (a.cantidad <= 0) continue;

          // Descontar del lote origen
          const nuevaCant = a.stock_disponible - a.cantidad;
          await supabase.from('lotes').update({ cantidad: nuevaCant }).eq('id', a.lote_id);

          // Egreso
          await supabase.from('movimientos').insert({
            lote_id: a.lote_id,
            tipo: 'egreso',
            cantidad: a.cantidad,
            notas: `Transferencia ${encabezado.numero}`,
          });

          // Crear lote destino (mismo vencimiento)
          const { data: loteDest } = await supabase
            .from('lotes')
            .insert({
              producto_id: f.producto_id,
              sucursal_id: sucursalDestino,
              cantidad: a.cantidad,
              fecha_vencimiento: a.fecha_vencimiento,
              tipo_lote: 'venta',
            })
            .select('id')
            .single();

          if (loteDest) {
            await supabase.from('movimientos').insert({
              lote_id: loteDest.id,
              tipo: 'ingreso',
              cantidad: a.cantidad,
              notas: `Transferencia ${encabezado.numero}`,
            });
            await supabase.from('transferencia_items').insert({
              transferencia_id: transf.id,
              lote_origen_id: a.lote_id,
              lote_destino_id: loteDest.id,
              cantidad: a.cantidad,
            });
          }
        }
      }

      setTransferenciaId(transf.id);
      setPaso('confirmado');
    } catch (err: any) {
      alert('Error: ' + (err.message || String(err)));
    } finally {
      setGuardando(false);
    }
  };

  const reset = () => {
    setTexto('');
    setPaso('pegar');
    setEncabezado(null);
    setFilas([]);
    setParseError('');
    setProductosFaltantes([]);
    setTransferenciaId(null);
  };

  const nombreSuc = (id: number) => (id === 1 ? 'SOHO 1' : 'SOHO 2');

  // ============== CONFIRMADO ==============
  if (paso === 'confirmado' && transferenciaId) {
    return (
      <>
        <PageHeader title="Transferencia" backHref="/" />
        <div className="max-w-lg mx-auto px-4 py-10 text-center">
          <div className="inline-flex w-20 h-20 rounded-full bg-success/15 items-center justify-center mb-6">
            <CheckCircle2 size={44} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold mb-2">¡Transferencia confirmada!</h2>
          <p className="text-neutral-400 mb-2">
            <b>{nombreSuc(sucursalOrigen!)}</b>
            <ArrowRight size={16} className="inline mx-2" />
            <b>{nombreSuc(sucursalDestino!)}</b>
          </p>
          <p className="text-neutral-400 mb-6">
            {filas.length} producto{filas.length > 1 ? 's' : ''} movidos.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <BigButton onClick={reset} variant="secondary">Cargar otra</BigButton>
            <BigButton onClick={() => router.push('/')}>Volver al inicio</BigButton>
          </div>
        </div>
      </>
    );
  }

  // ============== PREVIEW ==============
  if (paso === 'preview') {
    return (
      <>
        <PageHeader
          title="Confirmar transferencia"
          subtitle={`Nº ${encabezado.numero} · ${formatDate(encabezado.fecha)}`}
          backHref="/"
        />
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <Card className="p-4 flex items-center justify-center gap-3 text-lg font-bold">
            <span>{nombreSuc(sucursalOrigen!)}</span>
            <ArrowRight className="text-accent" />
            <span>{nombreSuc(sucursalDestino!)}</span>
          </Card>

          <div className="text-xs text-neutral-500 text-center">
            Origen DUX: {encabezado.deposito_origen} · Destino DUX: {encabezado.deposito_destino} · Usuario: {encabezado.usuario}
          </div>

          {productosFaltantes.length > 0 && (
            <div className="bg-danger/10 border border-danger/40 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="text-danger flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <div className="font-semibold text-danger">
                  {productosFaltantes.length} problema{productosFaltantes.length > 1 ? 's' : ''} con el stock
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-neutral-300">
                  {productosFaltantes.map((p, i) => <li key={i}>• {p}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filas.map((f, i) => (
              <FilaCard
                key={i}
                fila={f}
                onCambiarLote={(asigIdx, loteId) => cambiarLote(i, asigIdx, loteId)}
                onCambiarCantidad={(asigIdx, cant) => cambiarCantidadAsig(i, asigIdx, cant)}
                onAgregar={() => agregarAsignacion(i)}
                onQuitar={(asigIdx) => quitarAsignacion(i, asigIdx)}
              />
            ))}
          </div>

          <div className="sticky bottom-0 bg-gradient-to-t from-bg-base via-bg-base to-transparent pt-6 pb-4 -mx-4 px-4">
            <BigButton
              onClick={handleConfirmar}
              loading={guardando}
              disabled={!puedeConfirmar()}
              size="xl"
              className="w-full"
              icon={<Check size={22} />}
            >
              Confirmar transferencia
            </BigButton>
          </div>
        </div>
      </>
    );
  }

  // ============== PEGAR ==============
  return (
    <>
      <PageHeader title="Transferencia entre sucursales" backHref="/" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2">
            Pegá el texto de la transferencia desde DUX
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            placeholder="DEPÓSITO ORIGEN: LOCAL DEPÓSITO DESTINO: LOCAL 2 ..."
            className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-accent resize-y"
          />
        </div>

        {parseError && (
          <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm flex gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            {parseError}
          </div>
        )}

        <BigButton
          onClick={handleParsear}
          size="xl"
          className="w-full"
          icon={<ClipboardPaste size={22} />}
        >
          Parsear transferencia
        </BigButton>
      </div>
    </>
  );
}

// ============== Fila ==============

function FilaCard({
  fila,
  onCambiarLote,
  onCambiarCantidad,
  onAgregar,
  onQuitar,
}: {
  fila: FilaTransfer;
  onCambiarLote: (asigIdx: number, loteId: number) => void;
  onCambiarCantidad: (asigIdx: number, cant: number) => void;
  onAgregar: () => void;
  onQuitar: (asigIdx: number) => void;
}) {
  const varios = fila.lotes_disponibles.length > 1;
  const sumaAsig = fila.asignaciones.reduce((a, x) => a + (x.cantidad || 0), 0);
  const dif = sumaAsig - fila.cantidad;
  const idsUsados = new Set(fila.asignaciones.map((a) => a.lote_id));
  const hayLotesLibres = fila.lotes_disponibles.some((l) => !idsUsados.has(l.id));

  return (
    <Card className={`p-4 ${!fila.stock_suficiente ? 'border-danger/40' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-500">[{fila.codigo}]</span>
            {!fila.stock_suficiente && <AlertTriangle size={12} className="text-danger" />}
            {varios && fila.stock_suficiente && (
              <span className="text-[10px] uppercase font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Layers size={10} /> varios lotes
              </span>
            )}
          </div>
          <div className="text-sm leading-snug">{fila.descripcion}</div>
          <div className="text-xs text-neutral-400 mt-0.5">
            Stock disponible: <b>{fila.stock_total}</b> ·
            {' '}{fila.lotes_disponibles.length} lote{fila.lotes_disponibles.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-400">Cant. pedida</div>
          <div className="font-bold text-lg">{fila.cantidad}</div>
        </div>
      </div>

      {fila.stock_suficiente && (
        <div className="bg-bg-base rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-neutral-500 mb-1">
            Lotes a transferir
          </div>
          {fila.asignaciones.map((asig, ai) => (
            <div key={ai} className="flex gap-2 items-center">
              {varios ? (
                <select
                  value={asig.lote_id}
                  onChange={(e) => onCambiarLote(ai, parseInt(e.target.value))}
                  className="flex-1 bg-bg-card border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent"
                >
                  {fila.lotes_disponibles.map((l) => {
                    const yaUsado = idsUsados.has(l.id) && l.id !== asig.lote_id;
                    return (
                      <option key={l.id} value={l.id} disabled={yaUsado}>
                        Vence {formatDate(l.fecha_vencimiento)} · stock {l.cantidad}
                        {yaUsado ? ' (ya usado)' : ''}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="flex-1 px-3 py-2 bg-bg-card/50 rounded-lg text-xs text-neutral-400">
                  Vence {formatDate(asig.fecha_vencimiento)} · stock {asig.stock_disponible}
                </div>
              )}
              <input
                type="number"
                step="0.01"
                min={0}
                max={asig.stock_disponible}
                value={asig.cantidad}
                onChange={(e) => onCambiarCantidad(ai, parseFloat(e.target.value) || 0)}
                className="w-20 bg-bg-card border border-border rounded-lg px-2 py-2 text-sm text-right font-semibold focus:outline-none focus:border-accent"
              />
              {fila.asignaciones.length > 1 && (
                <button
                  onClick={() => onQuitar(ai)}
                  className="p-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger"
                  title="Quitar"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            {hayLotesLibres && (
              <button
                onClick={onAgregar}
                className="text-xs text-accent hover:text-accent-hover font-medium"
              >
                + Agregar otro lote
              </button>
            )}
            <div className={`text-xs ml-auto ${
              Math.abs(dif) < 0.001 ? 'text-success' : 'text-warning'
            }`}>
              {sumaAsig} / {fila.cantidad}
              {Math.abs(dif) > 0.001 && (
                <span> ({dif > 0 ? '+' : ''}{dif.toFixed(2)})</span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
