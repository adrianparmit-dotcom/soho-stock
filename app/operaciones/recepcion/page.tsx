// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { SucursalPicker } from '@/components/ui/SucursalPicker';
import { FechaRapida } from '@/components/recepcion/FechaRapida';
import { parsearCompraDux } from '@/lib/parsers/dux-compra';
import { parsearFacturaAutomatico } from '@/lib/parsers/factura-auto';
import { formatMoney, formatDate } from '@/lib/utils/format';
import {
  ClipboardPaste,
  Check,
  AlertTriangle,
  Info,
  Sparkles,
  CheckCircle2,
  Edit3,
  Package,
  Scale,
  Search,
  Plus,
  Trash2,
  FileClock,
  Save,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

type Paso = 'pegar' | 'preview' | 'confirmado';

interface LoteCarga {
  cantidad: number;   // para venta: unidades. Para granel: kg.
  vencimiento: string;
}

interface FilaRecepcion {
  codigo: string;
  descripcion: string;
  cantidad_facturada: number;
  precio_unitario: number;
  subtotal: number;
  producto_id: number | null;
  es_nuevo: boolean;

  factura_descripcion?: string;
  factura_cantidad?: number;
  kg_reales?: number;
  es_granel: boolean;

  // Lotes: para venta son unidades, para granel son kg
  lotes: LoteCarga[];
}

function estaVencido(fecha: string): boolean {
  if (!fecha) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha + 'T00:00:00');
  if (isNaN(f.getTime())) return false;
  return f < hoy;
}

function fechaValida(fecha: string): boolean {
  if (!fecha || fecha.length < 10) return false;
  const f = new Date(fecha + 'T00:00:00');
  return !isNaN(f.getTime());
}

/** Estado de carga de cada fila para ordenar y mostrar progreso */
function estadoFila(f: FilaRecepcion): 'vacio' | 'parcial' | 'completo' {
  const lotesValidos = f.lotes.filter((l) => l.cantidad > 0 && fechaValida(l.vencimiento));
  if (lotesValidos.length === 0) return 'vacio';
  const sumaCargada = lotesValidos.reduce((a, l) => a + l.cantidad, 0);
  const objetivo = f.es_granel ? (f.kg_reales || f.cantidad_facturada) : f.cantidad_facturada;
  if (Math.abs(sumaCargada - objetivo) < 0.001) return 'completo';
  return 'parcial';
}

export default function RecepcionPage() {
  const router = useRouter();
  const supabase = createClient();

  const [paso, setPaso] = useState<Paso>('pegar');
  const [textoDux, setTextoDux] = useState('');
  const [textoFactura, setTextoFactura] = useState('');
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [deposito, setDeposito] = useState<string>('LOCAL'); // LOCAL | PIEZA | LOCAL2 | DEP_LOCAL2

  const [parseError, setParseError] = useState('');
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [encabezado, setEncabezado] = useState<any>(null);
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [proveedorNoEncontrado, setProveedorNoEncontrado] = useState(false);
  const [formatoFactura, setFormatoFactura] = useState<string>('');
  const [errorMatcheo, setErrorMatcheo] = useState<any>(null);

  const [filas, setFilas] = useState<FilaRecepcion[]>([]);
  const [productosNuevos, setProductosNuevos] = useState<string[]>([]);
  const [confirmadoVencidos, setConfirmadoVencidos] = useState(false);

  // UI estado
  const [busqueda, setBusqueda] = useState('');
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  // Borrador
  const [borradorId, setBorradorId] = useState<number | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState<string>('');
  const [borradoresDisponibles, setBorradoresDisponibles] = useState<any[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  // ============== INICIAL ==============

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
    supabase
      .from('sucursales')
      .select('id, nombre')
      .order('id')
      .then(({ data }) => {
        setSucursales(data || []);
        if (data?.length === 1) setSucursalId(data[0].id);
      });
  }, []);

  // Cargar borradores de la sucursal elegida
  useEffect(() => {
    if (!sucursalId) {
      setBorradoresDisponibles([]);
      return;
    }
    if (paso !== 'pegar') return;
    supabase
      .from('recepciones_borrador')
      .select('id, nombre_proveedor, numero_comprobante, updated_at')
      .eq('sucursal_id', sucursalId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setBorradoresDisponibles(data || []));
  }, [sucursalId, paso]);

  // ============== AUTOSAVE ==============
  // Debounce de 1.5s tras cada cambio
  const autosaveTimer = useRef<any>(null);
  useEffect(() => {
    if (paso !== 'preview') return;
    if (!sucursalId || !encabezado) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      guardarBorrador();
    }, 1500);
    return () => clearTimeout(autosaveTimer.current);
  }, [filas, confirmadoVencidos, paso]);

  const guardarBorrador = async () => {
    if (!sucursalId || !encabezado) return;
    setAutosaving(true);
    const estado = {
      encabezado,
      proveedorId,
      proveedorNoEncontrado,
      formatoFactura,
      filas,
      productosNuevos,
      parseWarnings,
      confirmadoVencidos,
      deposito,
    };
    try {
      const { data: user } = await supabase.auth.getUser();
      const payload = {
        sucursal_id: sucursalId,
        texto_dux: textoDux,
        texto_factura: textoFactura,
        estado_json: estado,
        nombre_proveedor: encabezado.proveedor_nombre || null,
        numero_comprobante: encabezado.numero_comprobante || null,
        creado_por: user.user?.id,
      };
      if (borradorId) {
        await supabase.from('recepciones_borrador').update(payload).eq('id', borradorId);
      } else {
        const { data } = await supabase.from('recepciones_borrador').insert(payload).select('id').single();
        if (data) setBorradorId(data.id);
      }
      setUltimoGuardado(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      // silencioso
    } finally {
      setAutosaving(false);
    }
  };

  const borrarBorrador = async (id: number) => {
    await supabase.from('recepciones_borrador').delete().eq('id', id);
    setBorradoresDisponibles((prev) => prev.filter((b) => b.id !== id));
  };

  const retomarBorrador = async (id: number) => {
    const { data } = await supabase
      .from('recepciones_borrador')
      .select('*')
      .eq('id', id)
      .single();
    if (!data) return;
    const e = data.estado_json;
    setTextoDux(data.texto_dux);
    setTextoFactura(data.texto_factura || '');
    setEncabezado(e.encabezado);
    setProveedorId(e.proveedorId);
    setProveedorNoEncontrado(e.proveedorNoEncontrado);
    setFormatoFactura(e.formatoFactura || '');
    setFilas(e.filas || []);
    setProductosNuevos(e.productosNuevos || []);
    setParseWarnings(e.parseWarnings || []);
    setConfirmadoVencidos(e.confirmadoVencidos || false);
    setDeposito(e.deposito || (data.sucursal_id === 1 ? 'LOCAL' : 'LOCAL2'));
    setBorradorId(id);
    setSucursalId(data.sucursal_id);
    setPaso('preview');
  };

  // ============== PARSER ==============

  const handleParsear = async () => {
    setParseError('');
    setParseWarnings([]);
    setErrorMatcheo(null);

    if (!sucursalId) {
      setParseError('Seleccioná la sucursal de destino.');
      return;
    }
    if (!textoDux.trim()) {
      setParseError('Pegá el texto del DUX.');
      return;
    }

    const dux = parsearCompraDux(textoDux);

    if (dux.productos.length === 0) {
      setParseError('No se pudo parsear el DUX. Verificá el texto pegado.');
      return;
    }

    let facturaItems: any[] = [];
    let formato = '';
    if (textoFactura.trim()) {
      const fact = parsearFacturaAutomatico(textoFactura);
      formato = fact.formato;
      facturaItems = fact.items;
      if (fact.formato === 'desconocido') {
        setParseWarnings((w) => [...w, 'Formato de factura no reconocido. Se ignora.']);
      }
      if (facturaItems.length > 0 && dux.productos.length !== facturaItems.length) {
        setErrorMatcheo({
          dux: dux.productos.length,
          factura: facturaItems.length,
          mensaje:
            dux.productos.length > facturaItems.length
              ? `DUX tiene ${dux.productos.length} productos pero la factura ${facturaItems.length}.`
              : `DUX tiene ${dux.productos.length} pero la factura tiene ${facturaItems.length}.`,
        });
        return;
      }
    }
    setFormatoFactura(formato);

    // Proveedor
    let provId = null;
    let noEncontrado = false;
    if (dux.proveedor_cuit) {
      const { data: prov } = await supabase
        .from('proveedores')
        .select('id, nombre')
        .eq('cuit', dux.proveedor_cuit)
        .maybeSingle();
      if (prov) provId = prov.id;
      else noEncontrado = true;
    } else {
      noEncontrado = true;
    }

    // Productos
    const codigos = dux.productos.map((p) => p.codigo);
    const { data: prods } = await supabase
      .from('productos')
      .select('id, codigo, nombre')
      .in('codigo', codigos);
    const mapProd = new Map<string, number>();
    (prods || []).forEach((p) => mapProd.set(p.codigo, p.id));

    const nuevos: string[] = [];
    const filasIniciales: FilaRecepcion[] = dux.productos.map((p, idx) => {
      const pid = mapProd.get(p.codigo) ?? null;
      if (!pid) nuevos.push(`[${p.codigo}] ${p.descripcion}`);

      const facItem = facturaItems[idx];
      const esGranel = facItem?.es_granel || false;
      const kgReales = facItem?.kg_totales || 0;

      return {
        codigo: p.codigo,
        descripcion: p.descripcion,
        cantidad_facturada: p.cantidad,
        precio_unitario: p.precio_unitario,
        subtotal: p.subtotal,
        producto_id: pid,
        es_nuevo: !pid,
        factura_descripcion: facItem?.descripcion,
        factura_cantidad: facItem?.cantidad,
        kg_reales: kgReales,
        es_granel: esGranel,
        lotes: [], // Arranca vacío — se va cargando caja por caja
      };
    });

    setEncabezado(dux);
    setProveedorId(provId);
    setProveedorNoEncontrado(noEncontrado);
    setFilas(filasIniciales);
    setProductosNuevos(nuevos);
    setParseWarnings(dux.warnings);
    setConfirmadoVencidos(false);
    setBorradorId(null); // nuevo, no tiene borrador
    setExpandidos(new Set()); // todo colapsado al inicio
    setPaso('preview');
  };

  // ============== HANDLERS FILAS ==============

  const agregarLote = (i: number) => {
    setFilas((prev) =>
      prev.map((f, idx) =>
        idx === i
          ? {
              ...f,
              lotes: [...f.lotes, { cantidad: 0, vencimiento: f.lotes[f.lotes.length - 1]?.vencimiento || '' }],
            }
          : f
      )
    );
  };

  const actualizarLote = (i: number, loteIdx: number, patch: Partial<LoteCarga>) => {
    setFilas((prev) =>
      prev.map((f, idx) => {
        if (idx !== i) return f;
        return {
          ...f,
          lotes: f.lotes.map((l, li) => (li === loteIdx ? { ...l, ...patch } : l)),
        };
      })
    );
  };

  const quitarLote = (i: number, loteIdx: number) => {
    setFilas((prev) =>
      prev.map((f, idx) =>
        idx === i ? { ...f, lotes: f.lotes.filter((_, li) => li !== loteIdx) } : f
      )
    );
  };

  const toggleExpandir = (i: number) => {
    setExpandidos((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  // ============== DERIVADOS ==============

  const filasConEstado = useMemo(() => {
    return filas.map((f, idx) => ({
      fila: f,
      idx,
      estado: estadoFila(f),
    }));
  }, [filas]);

  const filasFiltradas = useMemo(() => {
    let base = filasConEstado;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      base = base.filter(
        ({ fila }) =>
          fila.codigo.toLowerCase().includes(q) ||
          fila.descripcion.toLowerCase().includes(q)
      );
    }
    // Ordenar: vacio → parcial → completo
    const peso: Record<string, number> = { vacio: 0, parcial: 1, completo: 2 };
    return [...base].sort((a, b) => peso[a.estado] - peso[b.estado]);
  }, [filasConEstado, busqueda]);

  const progreso = useMemo(() => {
    const total = filas.length;
    const completos = filasConEstado.filter((f) => f.estado === 'completo').length;
    const parciales = filasConEstado.filter((f) => f.estado === 'parcial').length;
    return { total, completos, parciales, vacios: total - completos - parciales };
  }, [filas, filasConEstado]);

  const lotesVencidos = useMemo(() => {
    const v: { codigo: string; descripcion: string; vencimiento: string }[] = [];
    filas.forEach((f) => {
      f.lotes.forEach((l) => {
        if (l.vencimiento && estaVencido(l.vencimiento)) {
          v.push({ codigo: f.codigo, descripcion: f.descripcion, vencimiento: l.vencimiento });
        }
      });
    });
    return v;
  }, [filas]);

  const diferenciasCant = useMemo(() => {
    return filas.filter((f) => {
      const sumaCargada = f.lotes.reduce((a, l) => a + (l.cantidad || 0), 0);
      const objetivo = f.es_granel ? (f.kg_reales || 0) : f.cantidad_facturada;
      return Math.abs(sumaCargada - objetivo) > 0.001;
    });
  }, [filas]);

  const puedeConfirmar = () => {
    if (proveedorNoEncontrado) return false;
    if (filas.length === 0) return false;
    // Al menos un producto tiene que tener algo cargado
    const algunoCargado = filas.some(f => f.lotes.length > 0 && f.lotes.some(l => l.cantidad > 0));
    if (!algunoCargado) return false;
    // Los productos CON lotes cargados deben tener cantidad > 0 y fecha válida
    for (const f of filas) {
      if (f.lotes.length === 0) continue; // sin cajas = no recibido, se omite
      const sumaCargada = f.lotes.reduce((a, l) => a + (l.cantidad || 0), 0);
      if (sumaCargada <= 0) return false;
      for (const l of f.lotes) {
        if (l.cantidad <= 0) return false;
        if (!fechaValida(l.vencimiento)) return false;
      }
    }
    if (lotesVencidos.length > 0 && !confirmadoVencidos) return false;
    return true;
  };

  // ============== GUARDAR FINAL ==============

  const handleConfirmar = async () => {
    setGuardando(true);
    try {
      const nuevos = filas.filter((f) => f.es_nuevo);
      if (nuevos.length > 0) {
        const payload = nuevos.map((f) => ({
          codigo: f.codigo,
          nombre: f.descripcion,
          proveedor_id: proveedorId,
          precio_costo: f.precio_unitario,
        }));
        const { data: creados, error } = await supabase
          .from('productos')
          .insert(payload)
          .select('id, codigo');
        if (error) throw error;
        const mapCreados = new Map<string, number>();
        (creados || []).forEach((p) => mapCreados.set(p.codigo, p.id));
        filas.forEach((f) => {
          if (f.es_nuevo) f.producto_id = mapCreados.get(f.codigo) || null;
        });
      }

      for (const f of filas) {
        if (f.producto_id && !f.es_nuevo) {
          await supabase.from('productos').update({ precio_costo: f.precio_unitario }).eq('id', f.producto_id);
        }
      }

      let notaRemito = '';
      if (diferenciasCant.length > 0) {
        notaRemito = 'Diferencias: ' + diferenciasCant
          .map((f) => {
            const suma = f.lotes.reduce((a, l) => a + l.cantidad, 0);
            const obj = f.es_granel ? f.kg_reales : f.cantidad_facturada;
            const u = f.es_granel ? 'kg' : 'un';
            return `[${f.codigo}] ${obj}→${suma}${u}`;
          })
          .join('; ');
      }

      const { data: remito, error: remitoErr } = await supabase
        .from('remitos')
        .insert({
          sucursal_id: sucursalId,
          numero: encabezado.numero_comprobante,
          proveedor_id: proveedorId,
          fecha: encabezado.fecha,
          total_factura: encabezado.total,
          origen: formatoFactura ? `dux+${formatoFactura}` : 'dux',
        })
        .select('id')
        .single();
      if (remitoErr) throw remitoErr;

      let totalLotesGranel = 0;
      let totalLotesVenta = 0;

      for (const f of filas) {
        if (!f.producto_id) continue;

        for (const l of f.lotes) {
          if (l.cantidad <= 0) continue;
          const tipo = f.es_granel ? 'granel' : 'venta';
          const { data: lote, error: loteErr } = await supabase
            .from('lotes')
            .insert({
              producto_id: f.producto_id,
              sucursal_id: sucursalId,
              cantidad: l.cantidad,
              peso_kg: f.es_granel ? l.cantidad : null,
              fecha_vencimiento: l.vencimiento,
              costo: f.precio_unitario,
              tipo_lote: tipo,
              deposito: deposito,
            })
            .select('id')
            .single();
          if (loteErr) throw loteErr;

          const esVencido = estaVencido(l.vencimiento);
          await supabase.from('movimientos').insert({
            lote_id: lote.id,
            tipo: 'ingreso',
            cantidad: l.cantidad,
            notas: `Recepción ${encabezado.numero_comprobante}` +
              (f.es_granel ? ` · GRANEL ${l.cantidad}kg` : '') +
              (esVencido ? ' · VENCIDO al ingreso' : '') +
              (notaRemito ? ' · ' + notaRemito : ''),
          });

          if (f.es_granel) totalLotesGranel++;
          else totalLotesVenta++;
        }
      }

      // Borrar borrador si existía
      if (borradorId) {
        await supabase.from('recepciones_borrador').delete().eq('id', borradorId);
      }

      setResultado({
        remito_id: remito.id,
        total_filas: filas.length,
        total_granel: totalLotesGranel,
        total_venta: totalLotesVenta,
        diferencias: diferenciasCant.map((f) => {
          const suma = f.lotes.reduce((a, l) => a + l.cantidad, 0);
          return {
            codigo: f.codigo,
            descripcion: f.descripcion,
            es_granel: f.es_granel,
            esperado: f.es_granel ? f.kg_reales : f.cantidad_facturada,
            recibido: suma,
          };
        }),
        vencidos: lotesVencidos,
      });
      setPaso('confirmado');
    } catch (err: any) {
      alert('Error al guardar: ' + (err.message || String(err)));
    } finally {
      setGuardando(false);
    }
  };

  const reset = () => {
    setTextoDux('');
    setTextoFactura('');
    setPaso('pegar');
    setEncabezado(null);
    setFilas([]);
    setResultado(null);
    setParseError('');
    setParseWarnings([]);
    setProductosNuevos([]);
    setProveedorNoEncontrado(false);
    setConfirmadoVencidos(false);
    setFormatoFactura('');
    setErrorMatcheo(null);
    setBorradorId(null);
    setExpandidos(new Set());
    setBusqueda('');
  };

  // ============== RENDER: CONFIRMADO ==============
  if (paso === 'confirmado' && resultado) {
    return (
      <>
        <PageHeader title="Recepción" backHref="/" />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="text-center mb-4">
            <div className="inline-flex w-20 h-20 rounded-full bg-success/15 items-center justify-center mb-4">
              <CheckCircle2 size={44} className="text-success" />
            </div>
            <h2 className="text-2xl font-bold mb-1">¡Recepción guardada!</h2>
            <p className="text-neutral-400">Remito <b>{encabezado.numero_comprobante}</b></p>
            <p className="text-xs text-neutral-500 mt-1">
              {resultado.total_granel > 0 && <span>{resultado.total_granel} lote(s) granel · </span>}
              {resultado.total_venta > 0 && <span>{resultado.total_venta} lote(s) venta</span>}
            </p>
          </div>

          {resultado.vencidos.length > 0 && (
            <Card className="p-4 border-danger/40 bg-danger/5">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="text-danger flex-shrink-0 mt-0.5" size={18} />
                <div className="font-semibold text-danger">
                  {resultado.vencidos.length} lote(s) VENCIDO(S)
                </div>
              </div>
              <ul className="text-xs text-neutral-300 space-y-1 pl-6">
                {resultado.vencidos.map((v: any, i: number) => (
                  <li key={i}>• [{v.codigo}] {v.descripcion} — venció {formatDate(v.vencimiento)}</li>
                ))}
              </ul>
            </Card>
          )}

          {resultado.diferencias.length > 0 && (
            <Card className="p-4 border-warning/40 bg-warning/5">
              <div className="flex items-start gap-2 mb-2">
                <Edit3 className="text-warning flex-shrink-0 mt-0.5" size={18} />
                <div className="font-semibold text-warning">
                  {resultado.diferencias.length} diferencia(s) entre esperado y recibido
                </div>
              </div>
              <ul className="text-xs text-neutral-300 space-y-1 pl-6">
                {resultado.diferencias.map((d: any, i: number) => {
                  const delta = d.recibido - d.esperado;
                  const u = d.es_granel ? 'kg' : 'un';
                  return (
                    <li key={i}>
                      • [{d.codigo}] {d.descripcion} — esperado <b>{d.esperado} {u}</b>, recibido <b>{d.recibido} {u}</b>{' '}
                      <span className={delta < 0 ? 'text-danger' : 'text-success'}>
                        ({delta > 0 ? '+' : ''}{delta.toFixed(3)})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="flex gap-3 justify-center flex-wrap pt-4">
            <BigButton onClick={reset} variant="secondary">Cargar otra</BigButton>
            <BigButton onClick={() => router.push('/reportes/stock')}>Ver stock</BigButton>
          </div>
        </div>
      </>
    );
  }

  // ============== RENDER: PREVIEW ==============
  if (paso === 'preview') {
    return (
      <>
        <PageHeader
          title="Confirmar recepción"
          subtitle={`${encabezado.proveedor_nombre} · ${formatDate(encabezado.fecha)}`}
          backHref="/"
          right={
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              {autosaving ? (
                <><Save size={12} className="animate-pulse" /> Guardando...</>
              ) : ultimoGuardado ? (
                <><Save size={12} className="text-success" /> {ultimoGuardado}</>
              ) : null}
            </div>
          }
        />
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          {/* Badge formato */}
          {formatoFactura && formatoFactura !== 'desconocido' && (
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 flex items-center gap-2 text-sm">
              <Scale size={16} className="text-accent" />
              <span>Factura detectada: <b>{formatoFactura === 'ankas' ? 'Ankas' : 'Mayorista Diet'}</b></span>
            </div>
          )}

          {proveedorNoEncontrado && (
            <div className="bg-danger/10 border border-danger/40 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="text-danger flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <div className="font-semibold text-danger">Proveedor no encontrado</div>
                <div className="text-sm text-neutral-300 mt-1">
                  CUIT <b>{encabezado.proveedor_cuit}</b> no está en la base.{' '}
                  <a href="/configuracion/proveedores" className="underline text-accent">Cargá el CUIT</a> antes de continuar.
                </div>
              </div>
            </div>
          )}

          {productosNuevos.length > 0 && (
            <div className="bg-warning/10 border border-warning/40 rounded-xl p-3 flex gap-2">
              <Sparkles className="text-warning flex-shrink-0 mt-0.5" size={16} />
              <div className="flex-1 text-sm">
                <b className="text-warning">{productosNuevos.length} producto(s) nuevo(s)</b> se crearán automáticamente.
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-neutral-400">Ver lista</summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-400">
                    {productosNuevos.map((n) => <li key={n}>• {n}</li>)}
                  </ul>
                </details>
              </div>
            </div>
          )}

          {/* Totales compactos */}
          <Card className="p-3 grid grid-cols-4 gap-3 text-center text-xs">
            <div>
              <div className="text-neutral-500">Subtotal</div>
              <div className="font-bold">{formatMoney(encabezado.subtotal)}</div>
            </div>
            <div>
              <div className="text-neutral-500">IVA</div>
              <div className="font-bold">{formatMoney(encabezado.iva)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Total</div>
              <div className="font-bold text-accent">{formatMoney(encabezado.total)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Progreso</div>
              <div className="font-bold">
                <span className="text-success">{progreso.completos}</span>
                {' / '}
                <span>{progreso.total}</span>
              </div>
            </div>
          </Card>

          {/* Barra de progreso */}
          <div className="h-1.5 bg-bg-card rounded-full overflow-hidden flex">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${(progreso.completos / progreso.total) * 100}%` }}
            />
            {progreso.parciales > 0 && (
              <div
                className="h-full bg-warning transition-all"
                style={{ width: `${(progreso.parciales / progreso.total) * 100}%` }}
              />
            )}
          </div>

          {/* Buscador fijo */}
          <div className="sticky top-[62px] z-10 bg-bg-base py-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código (ej. 6918) o nombre..."
                autoFocus
                className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-12 py-3 text-sm focus:outline-none focus:border-accent"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-500 hover:text-neutral-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Alertas */}
          {lotesVencidos.length > 0 && (
            <div className="bg-danger/10 border-2 border-danger rounded-xl p-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="text-danger flex-shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <div className="font-bold text-danger text-sm">
                    ⚠ {lotesVencidos.length} lote(s) VENCIDO(S) cargado(s)
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 bg-bg-base rounded-lg p-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={confirmadoVencidos}
                  onChange={(e) => setConfirmadoVencidos(e.target.checked)}
                  className="w-4 h-4 accent-danger"
                />
                Sé que hay vencidos y los quiero ingresar igual
              </label>
            </div>
          )}

          {/* Lista de productos */}
          <div className="space-y-2">
            {filasFiltradas.map(({ fila, idx, estado }) => (
              <ProductoFila
                key={idx}
                fila={fila}
                estado={estado}
                expandido={expandidos.has(idx)}
                onToggle={() => toggleExpandir(idx)}
                onAgregarLote={() => {
                  agregarLote(idx);
                  setExpandidos((prev) => new Set(prev).add(idx));
                }}
                onActualizarLote={(li, patch) => actualizarLote(idx, li, patch)}
                onQuitarLote={(li) => quitarLote(idx, li)}
              />
            ))}
          </div>

          {/* Footer confirmar */}
          <div className="sticky bottom-0 bg-gradient-to-t from-bg-base via-bg-base to-transparent pt-6 pb-4 -mx-4 px-4">
            <BigButton
              onClick={handleConfirmar}
              loading={guardando}
              disabled={!puedeConfirmar() || proveedorNoEncontrado}
              size="xl"
              className="w-full"
              icon={<Check size={22} />}
            >
              Confirmar recepción · {progreso.completos} de {progreso.total} listos
            </BigButton>
            {!puedeConfirmar() && !proveedorNoEncontrado && (
              <p className="text-center text-xs text-neutral-500 mt-2">
                {lotesVencidos.length > 0 && !confirmadoVencidos
                  ? 'Tildá el checkbox de vencidos para continuar.'
                  : 'Cargá al menos una caja con cantidad y fecha válida para confirmar.'}
              </p>
            )}
          </div>
        </div>
      </>
    );
  }

  // ============== RENDER: PEGAR ==============
  return (
    <>
      <PageHeader title="Recepción · cargar compra" backHref="/" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <SucursalPicker
          value={sucursalId}
          onChange={(id) => {
            setSucursalId(id);
            setDeposito(id === 1 ? 'LOCAL' : 'LOCAL2');
          }}
          sucursales={sucursales}
          label="Sucursal de destino"
        />

        {/* Selector de depósito */}
        {sucursalId && (
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2">
              Depósito de destino
            </label>
            <div className="flex gap-2">
              {(sucursalId === 1
                ? [{ id: 'LOCAL', label: 'LOCAL (frente)' }, { id: 'PIEZA', label: 'PIEZA (depósito)' }]
                : [{ id: 'LOCAL2', label: 'LOCAL 2 (frente)' }, { id: 'DEP_LOCAL2', label: 'DEPÓSITO LOCAL 2' }]
              ).map(d => (
                <button
                  key={d.id}
                  onClick={() => setDeposito(d.id)}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm transition ${
                    deposito === d.id
                      ? 'bg-accent text-black'
                      : 'bg-bg-card border border-border text-neutral-300 hover:border-accent/40'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Borradores disponibles */}
        {borradoresDisponibles.length > 0 && (
          <Card className="p-4 border-accent/30 bg-accent/5">
            <div className="flex items-center gap-2 mb-3">
              <FileClock className="text-accent" size={18} />
              <div className="text-sm font-semibold">
                Borrador{borradoresDisponibles.length > 1 ? 'es' : ''} pendiente{borradoresDisponibles.length > 1 ? 's' : ''} en esta sucursal
              </div>
            </div>
            <div className="space-y-2">
              {borradoresDisponibles.map((b) => (
                <div key={b.id} className="flex items-center gap-2 bg-bg-base rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {b.nombre_proveedor || '(sin proveedor)'}
                      {b.numero_comprobante && (
                        <span className="text-neutral-400 font-normal ml-2 font-mono text-xs">
                          {b.numero_comprobante}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Último cambio: {new Date(b.updated_at).toLocaleString('es-AR')}
                    </div>
                  </div>
                  <button
                    onClick={() => retomarBorrador(b.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold"
                  >
                    Retomar
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('¿Descartar este borrador?')) borrarBorrador(b.id);
                    }}
                    className="p-2 rounded-lg text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div>
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400 mb-2">
            <Package size={14} /> 1. Texto del DUX
          </label>
          <textarea
            value={textoDux}
            onChange={(e) => setTextoDux(e.target.value)}
            rows={7}
            placeholder="SHUK SRL SOHO ... COMPROBANTE COMPRA Nº A-... FECHA: ..."
            className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-accent resize-y"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400 mb-2">
            <Scale size={14} /> 2. Factura del proveedor <span className="text-neutral-600 normal-case">(opcional, para fraccionables)</span>
          </label>
          <textarea
            value={textoFactura}
            onChange={(e) => setTextoFactura(e.target.value)}
            rows={7}
            placeholder="Factura de Ankas, Mayorista Diet, etc."
            className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-accent resize-y"
          />
        </div>

        {parseError && (
          <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm flex gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            {parseError}
          </div>
        )}

        {errorMatcheo && (
          <div className="bg-danger/10 border-2 border-danger rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-danger">No coinciden las cantidades</div>
                <div className="text-sm text-neutral-300 mt-1">{errorMatcheo.mensaje}</div>
                <div className="flex gap-4 text-sm mt-2">
                  <div>DUX: <b>{errorMatcheo.dux}</b> líneas</div>
                  <div>Factura: <b>{errorMatcheo.factura}</b> líneas</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <BigButton
          onClick={handleParsear}
          size="xl"
          className="w-full"
          icon={<ClipboardPaste size={22} />}
        >
          Parsear comprobante
        </BigButton>
      </div>
    </>
  );
}

// ============== FILA DE PRODUCTO (colapsable) ==============

function ProductoFila({
  fila,
  estado,
  expandido,
  onToggle,
  onAgregarLote,
  onActualizarLote,
  onQuitarLote,
}: {
  fila: FilaRecepcion;
  estado: 'vacio' | 'parcial' | 'completo';
  expandido: boolean;
  onToggle: () => void;
  onAgregarLote: () => void;
  onActualizarLote: (i: number, patch: Partial<LoteCarga>) => void;
  onQuitarLote: (i: number) => void;
}) {
  const sumaCargada = fila.lotes.reduce((a, l) => a + (l.cantidad || 0), 0);
  const objetivo = fila.es_granel ? (fila.kg_reales || 0) : fila.cantidad_facturada;
  const unidad = fila.es_granel ? 'kg' : 'un';

  const colorEstado =
    estado === 'completo' ? 'border-l-success bg-success/5'
    : estado === 'parcial' ? 'border-l-warning bg-warning/5'
    : 'border-l-neutral-700';

  return (
    <Card className={`border-l-4 ${colorEstado} transition-all`}>
      <div
        onClick={onToggle}
        className="p-3 cursor-pointer select-none hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {expandido
              ? <ChevronDown size={18} className="text-neutral-400" />
              : <ChevronRight size={18} className="text-neutral-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-neutral-500">[{fila.codigo}]</span>
              {fila.es_nuevo && (
                <span className="text-[10px] uppercase font-bold bg-warning/20 text-warning px-1.5 py-0.5 rounded">Nuevo</span>
              )}
              {fila.es_granel && (
                <span className="text-[10px] uppercase font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                  <Scale size={10} /> Granel
                </span>
              )}
            </div>
            <div className="font-medium text-sm leading-snug truncate">{fila.descripcion}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-sm font-bold tabular-nums ${
              estado === 'completo' ? 'text-success'
              : estado === 'parcial' ? 'text-warning'
              : 'text-neutral-400'
            }`}>
              {sumaCargada.toFixed(fila.es_granel ? 3 : 0)} / {objetivo.toFixed(fila.es_granel ? 3 : 0)} {unidad}
            </div>
            {estado === 'completo' && (
              <div className="text-[10px] text-success uppercase font-semibold">✓ listo</div>
            )}
          </div>
        </div>
      </div>

      {expandido && (
        <div className="px-3 pb-3 border-t border-border bg-bg-base/40">
          <div className="text-xs text-neutral-400 py-2">
            {fila.factura_descripcion ? (
              <>
                {fila.es_granel
                  ? <span>Proveedor facturó: <b className="text-neutral-200">{fila.kg_reales} kg</b> · {formatMoney(fila.precio_unitario)} c/u</span>
                  : <span>Proveedor facturó: <b className="text-neutral-200">{fila.factura_cantidad} {fila.factura_descripcion.toLowerCase().includes('kg') ? 'kg' : 'un'}</b> · {formatMoney(fila.precio_unitario)} c/u</span>
                }
                <span className="ml-2 text-neutral-600">· DUX: {fila.cantidad_facturada} un</span>
              </>
            ) : (
              <span>DUX facturó: {fila.cantidad_facturada} un · {formatMoney(fila.precio_unitario)} c/u</span>
            )}
          </div>

          {fila.lotes.length > 0 && (
            <div className="space-y-2 mb-2">
              {fila.lotes.map((l, li) => (
                <div key={li} className="flex items-center gap-2">
                  <div className="text-[10px] text-neutral-500 w-16">Caja {li + 1}</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={fila.es_granel ? 0.01 : 1}
                    value={l.cantidad || ''}
                    onChange={(e) => onActualizarLote(li, { cantidad: parseFloat(e.target.value) || 0 })}
                    placeholder={fila.es_granel ? 'kg' : 'un'}
                    className="w-20 bg-bg-base border border-border rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-neutral-500">{unidad}</span>
                  <FechaRapida
                    value={l.vencimiento}
                    onChange={(iso) => onActualizarLote(li, { vencimiento: iso })}
                    compact
                  />
                  {li > 0 && fila.lotes[li - 1].vencimiento && !l.vencimiento && (
                    <button
                      onClick={() => onActualizarLote(li, { vencimiento: fila.lotes[li - 1].vencimiento })}
                      className="text-[10px] px-2 py-1 rounded bg-bg-elevated hover:bg-bg-hover text-neutral-300"
                      title="Copiar fecha del lote anterior"
                    >
                      ↑ igual
                    </button>
                  )}
                  <button
                    onClick={() => onQuitarLote(li)}
                    className="p-1.5 rounded text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onAgregarLote}
            className="w-full py-2 rounded-lg border border-dashed border-border hover:border-accent hover:bg-accent/5 text-sm text-neutral-300 hover:text-accent transition inline-flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            {fila.lotes.length === 0 ? 'Agregar primera caja' : 'Agregar otra caja'}
          </button>
        </div>
      )}
    </Card>
  );
}
