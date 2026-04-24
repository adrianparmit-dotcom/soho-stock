// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { differenceInDays, parseISO } from 'date-fns';
import { AlertTriangle, Flame, Zap, Tag, Snowflake } from 'lucide-react';

/**
 * Categorías de promoción por días al vencimiento:
 *   LIQUIDACIÓN — 0 a 5 días (descuento máximo dejando algo de margen)
 *   FUERTE      — 0 a 10 días (descuento agresivo: gran parte del margen)
 *   MEDIA       — 10 a 20 días (descuento medio)
 *   SUAVE       — 20 a 30 días (descuento chico, promo preventiva)
 *
 * % descuento por nivel (aplicado sobre el margen del proveedor):
 *   LIQUIDACIÓN → 90% del margen (siempre queda margen positivo)
 *   FUERTE      → 70% del margen
 *   MEDIA       → 40% del margen
 *   SUAVE       → 20% del margen
 *
 * Excepción: si el lote está VENCIDO (días < 0), se permite llegar al costo
 * para liquidar sin perder plata (ya es rescate, no venta normal).
 */

type Nivel = 'liquidacion' | 'fuerte' | 'media' | 'suave';

interface Sugerencia {
  lote_id: number;
  producto_codigo: string;
  producto_nombre: string;
  cantidad: number;
  vencimiento: string;
  sucursal: string;
  costo: number;
  precio_venta: number;
  margen_pct: number;
  proveedor_nombre: string;
  dias: number;
  nivel: Nivel;
  descuento_pct: number;
  precio_sugerido: number;
  prioridad: number;
}

function clasificar(dias: number): Nivel | null {
  if (dias < 0) return 'liquidacion'; // vencido también liquidar
  if (dias <= 5) return 'liquidacion';
  if (dias <= 10) return 'fuerte';
  if (dias <= 20) return 'media';
  if (dias <= 30) return 'suave';
  return null; // más de 30 días no va a promo
}

const NIVEL_CONFIG: Record<Nivel, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  text: string;
  descuentoFactor: number; // fracción del margen a descontar
}> = {
  liquidacion: {
    label: 'Liquidación',
    icon: <Snowflake size={14} />,
    color: 'critical',
    bg: 'bg-red-700/15',
    border: 'border-red-700',
    text: 'text-red-400',
    descuentoFactor: 0.9, // deja al menos 10% del margen positivo (salvo vencidos)
  },
  fuerte: {
    label: 'Promo fuerte',
    icon: <Flame size={14} />,
    color: 'danger',
    bg: 'bg-danger/15',
    border: 'border-danger',
    text: 'text-danger',
    descuentoFactor: 0.7,
  },
  media: {
    label: 'Promo media',
    icon: <Zap size={14} />,
    color: 'warning',
    bg: 'bg-orange-500/15',
    border: 'border-orange-500',
    text: 'text-orange-400',
    descuentoFactor: 0.4,
  },
  suave: {
    label: 'Promo suave',
    icon: <Tag size={14} />,
    color: 'yellow',
    bg: 'bg-warning/15',
    border: 'border-warning',
    text: 'text-warning',
    descuentoFactor: 0.2,
  },
};

type Filtro = 'todos' | Nivel;

export default function PromocionesPage() {
  const supabase = createClient();
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Solo lotes con ≤30 días (incluyendo vencidos)
      const hoy = new Date();
      const limite = new Date();
      limite.setDate(limite.getDate() + 30);

      const { data: lotes } = await supabase
        .from('lotes')
        .select(`
          id, cantidad, fecha_vencimiento, costo,
          producto:productos(id, codigo, nombre, precio_venta, proveedor_id,
            proveedor_ref:proveedores(id, nombre, margen_pct)
          ),
          sucursal:sucursales(id, nombre)
        `)
        .gt('cantidad', 0)
        .lte('fecha_vencimiento', limite.toISOString().slice(0, 10));

      if (!lotes) {
        setSugerencias([]);
        setLoading(false);
        return;
      }

      const hoyMid = new Date();
      hoyMid.setHours(0, 0, 0, 0);

      const sug: Sugerencia[] = lotes
        .map((l: any) => {
          const venc = parseISO(l.fecha_vencimiento);
          const dias = differenceInDays(venc, hoyMid);
          const nivel = clasificar(dias);
          if (!nivel) return null; // fuera de ventana

          const producto = l.producto;
          if (!producto) return null;

          // Margen REAL del proveedor
          const margenProv = producto.proveedor_ref?.margen_pct != null
            ? Number(producto.proveedor_ref.margen_pct)
            : 35;
          const proveedorNombre = producto.proveedor_ref?.nombre || '—';

          const costo = Number(l.costo) || Number(producto.precio_costo) || 0;
          // Precio de venta SIEMPRE calculado como costo + margen del proveedor
          const precioVenta = costo * (1 + margenProv / 100);

          // Descuento = factor del nivel * margen
          const descuentoPct = margenProv * NIVEL_CONFIG[nivel].descuentoFactor;
          let precioSugerido = precioVenta * (1 - descuentoPct / 100);

          // Piso según estado del lote:
          //  - Si NO está vencido → piso = costo × 1.10 (mínimo 10% de margen)
          //  - Si ESTÁ vencido → piso = costo (puede liquidarse al costo como último recurso)
          const pisoMinimo = dias < 0 ? costo : costo * 1.10;
          if (precioSugerido < pisoMinimo) precioSugerido = pisoMinimo;

          // Prioridad: urgencia + valor en riesgo (al costo)
          const valorRiesgo = costo * Number(l.cantidad);
          const urgencia = Math.max(30 - dias, 0); // más chico = más urgente
          const prioridad = urgencia * 10000 + valorRiesgo / 1000;

          return {
            lote_id: l.id,
            producto_codigo: producto.codigo || '-',
            producto_nombre: producto.nombre,
            cantidad: Number(l.cantidad),
            vencimiento: l.fecha_vencimiento,
            sucursal: l.sucursal?.nombre || '-',
            costo,
            precio_venta: precioVenta,
            margen_pct: margenProv,
            proveedor_nombre: proveedorNombre,
            dias,
            nivel,
            descuento_pct: Math.round(descuentoPct * 10) / 10,
            precio_sugerido: precioSugerido,
            prioridad,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b!.prioridad - a!.prioridad) as Sugerencia[];

      setSugerencias(sug);
      setLoading(false);
    })();
  }, []);

  const contadores = useMemo(() => {
    const c: Record<Nivel, number> = { liquidacion: 0, fuerte: 0, media: 0, suave: 0 };
    sugerencias.forEach((s) => {
      c[s.nivel]++;
    });
    return c;
  }, [sugerencias]);

  const filtradas = useMemo(() => {
    if (filtro === 'todos') return sugerencias;
    return sugerencias.filter((s) => s.nivel === filtro);
  }, [sugerencias, filtro]);

  const valorEnRiesgo = sugerencias.reduce(
    (a, s) => a + s.costo * s.cantidad,
    0
  );

  return (
    <>
      <PageHeader
        title="Promociones sugeridas"
        subtitle={`${sugerencias.length} lote${sugerencias.length !== 1 ? 's' : ''} dentro de 30 días`}
        backHref="/"
      />
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* KPI top */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-neutral-400 uppercase">
            <AlertTriangle size={12} className="text-warning" /> Capital comprometido (al costo)
          </div>
          <div className="text-2xl font-bold text-warning mt-1">
            {formatMoney(valorEnRiesgo)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Plata invertida en mercadería próxima a vencer
          </div>
        </Card>

        {/* Filtros por nivel */}
        <div className="grid grid-cols-5 gap-2">
          <NivelChip
            label="Todos"
            count={sugerencias.length}
            active={filtro === 'todos'}
            onClick={() => setFiltro('todos')}
            colorClass="bg-neutral-500"
          />
          <NivelChip
            label="Liquidación"
            subLabel="0-5d"
            count={contadores.liquidacion}
            active={filtro === 'liquidacion'}
            onClick={() => setFiltro('liquidacion')}
            colorClass="bg-red-700"
          />
          <NivelChip
            label="Fuerte"
            subLabel="0-10d"
            count={contadores.fuerte}
            active={filtro === 'fuerte'}
            onClick={() => setFiltro('fuerte')}
            colorClass="bg-danger"
          />
          <NivelChip
            label="Media"
            subLabel="10-20d"
            count={contadores.media}
            active={filtro === 'media'}
            onClick={() => setFiltro('media')}
            colorClass="bg-orange-500"
          />
          <NivelChip
            label="Suave"
            subLabel="20-30d"
            count={contadores.suave}
            active={filtro === 'suave'}
            onClick={() => setFiltro('suave')}
            colorClass="bg-warning"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-500">Calculando...</div>
        ) : filtradas.length === 0 ? (
          <Card className="py-12 text-center text-neutral-500">
            {sugerencias.length === 0
              ? 'No hay lotes próximos a vencer en los próximos 30 días. 🎉'
              : 'Sin resultados en este nivel.'}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtradas.map((s) => {
              const cfg = NIVEL_CONFIG[s.nivel];
              return (
                <Card key={s.lote_id} className={`p-4 border-l-4 ${cfg.border}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs font-mono text-neutral-500">
                          [{s.producto_codigo}]
                        </span>
                        <span className="text-[10px] text-neutral-500">· {s.sucursal}</span>
                      </div>
                      <div className="font-medium text-sm leading-snug">
                        {s.producto_nombre}
                      </div>
                      <div className={`text-xs ${cfg.text} mt-0.5`}>
                        {s.dias < 0
                          ? `VENCIDO hace ${Math.abs(s.dias)}d`
                          : `Vence en ${s.dias}d · ${formatDate(s.vencimiento)}`}
                        {' · '}
                        <span className="text-neutral-500">
                          {s.proveedor_nombre} · margen {s.margen_pct}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-400">Stock</div>
                      <div className="font-bold">{s.cantidad}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center bg-bg-base rounded-xl p-2">
                    <div>
                      <div className="text-[10px] uppercase text-neutral-500">Costo</div>
                      <div className="text-xs text-neutral-300">
                        {formatMoney(s.costo)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-neutral-500">Precio normal</div>
                      <div className="text-xs line-through text-neutral-500">
                        {formatMoney(s.precio_venta)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-neutral-500">Desc.</div>
                      <div className={`text-sm font-bold ${cfg.text}`}>
                        -{s.descuento_pct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-neutral-500">Promo</div>
                      <div className={`text-sm font-bold ${cfg.text}`}>
                        {formatMoney(s.precio_sugerido)}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-neutral-500 text-center pt-2 space-y-1">
          <span className="block">
            Descuentos sugeridos sobre el margen del proveedor:
          </span>
          <span className="block">
            Suave 20% · Media 40% · Fuerte 70% · Liquidación 90%
          </span>
          <span className="block mt-1 text-neutral-600">
            Piso: 10% de margen sobre el costo (salvo lotes ya vencidos, que pueden ir al costo).
          </span>
        </p>
      </div>
    </>
  );
}

function NivelChip({
  label,
  subLabel,
  count,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  subLabel?: string;
  count: number;
  active: boolean;
  onClick: () => void;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-2 rounded-xl border transition text-center ${
        active
          ? 'bg-bg-elevated border-accent/40'
          : 'bg-bg-card border-border hover:bg-bg-hover'
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        <span className={`w-2 h-2 rounded-full ${colorClass}`} />
        <span className="text-[10px] font-semibold text-neutral-300">{label}</span>
      </div>
      {subLabel && (
        <div className="text-[9px] text-neutral-500">{subLabel}</div>
      )}
      <div className="text-base font-bold mt-0.5">{count}</div>
    </button>
  );
}
