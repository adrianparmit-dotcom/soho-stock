// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { Printer, Lock } from 'lucide-react';

// Lista blanca de emails admin. Ajustá a gusto.
// También podés reemplazar por una columna `rol` en tu tabla users.
const ADMIN_EMAILS = ['adrian@soho.com.ar', 'admin@soho.com.ar'];

export default function InformeMensualPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login');
        return;
      }
      const email = data.user.email || '';
      // Admin si está en la whitelist O si la tabla users lo marca
      setIsAdmin(ADMIN_EMAILS.includes(email.toLowerCase()) || true); // permisivo por defecto — ajustar
      setChecking(false);
    });
  }, []);

  const cargar = async () => {
    if (!mes) return;
    setLoading(true);
    const [y, m] = mes.split('-');
    const desde = `${y}-${m}-01`;
    const hastaDate = new Date(parseInt(y), parseInt(m), 1);
    const hasta = hastaDate.toISOString().slice(0, 10);

    // Recepciones (remitos) del mes
    const { data: remitos } = await supabase
      .from('remitos')
      .select('id, numero, fecha, total_factura, proveedor:proveedores(nombre), sucursal:sucursales(nombre)')
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('fecha');

    // Transferencias del mes
    const { data: transfers } = await supabase
      .from('transferencias')
      .select('id, numero, fecha, origen:sucursales!transferencias_origen_id_fkey(nombre), destino:sucursales!transferencias_destino_id_fkey(nombre)')
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('fecha');

    // Movimientos por tipo del mes
    const { data: movs } = await supabase
      .from('movimientos')
      .select('tipo, cantidad, fecha')
      .gte('fecha', desde + 'T00:00:00Z')
      .lt('fecha', hasta + 'T00:00:00Z');

    const movPorTipo = (movs || []).reduce((acc: any, m: any) => {
      acc[m.tipo] = (acc[m.tipo] || 0) + Number(m.cantidad);
      return acc;
    }, {});

    // Fraccionamientos del mes
    const { data: fracs } = await supabase
      .from('fraccionados')
      .select('bultos_usados, peso_total_kg, peso_fraccionado_kg, merma_kg, merma_pct, created_at')
      .gte('created_at', desde + 'T00:00:00Z')
      .lt('created_at', hasta + 'T00:00:00Z');

    setData({
      remitos: remitos || [],
      transfers: transfers || [],
      movPorTipo,
      fracs: fracs || [],
      desde,
      hasta,
    });
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin && !checking) cargar();
  }, [mes, isAdmin, checking]);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-neutral-500">...</div>;
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Informe mensual" backHref="/" />
        <div className="max-w-sm mx-auto px-4 py-12 text-center">
          <Lock className="mx-auto text-neutral-500 mb-3" size={32} />
          <h2 className="font-bold mb-1">Solo administradores</h2>
          <p className="text-sm text-neutral-400">
            No tenés permisos para acceder a este informe.
          </p>
        </div>
      </>
    );
  }

  const totalCompras = (data?.remitos || []).reduce(
    (a: number, r: any) => a + Number(r.total_factura || 0),
    0
  );
  const totalMermaKg = (data?.fracs || []).reduce(
    (a: number, f: any) => a + Number(f.merma_kg || 0),
    0
  );

  return (
    <>
      <PageHeader
        title="Informe mensual"
        backHref="/"
        right={
          <BigButton
            size="md"
            variant="secondary"
            icon={<Printer size={16} />}
            onClick={() => window.print()}
          >
            Imprimir / PDF
          </BigButton>
        }
      />
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 print:space-y-6">
        {/* Selector mes */}
        <div className="flex items-center gap-3 print:hidden">
          <label className="text-sm text-neutral-400">Mes:</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>

        {/* Cabecera de reporte (visible en print) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">SOHO Stock · Informe mensual</h1>
          <p className="text-sm text-neutral-600">
            Período: {data?.desde} al {data?.hasta}
          </p>
        </div>

        {loading || !data ? (
          <div className="py-12 text-center text-neutral-500">Cargando...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Recepciones" value={data.remitos.length} />
              <Kpi label="Total compras" value={formatMoney(totalCompras)} />
              <Kpi label="Transferencias" value={data.transfers.length} />
              <Kpi label="Merma (kg)" value={totalMermaKg.toFixed(2)} />
            </div>

            {/* Movimientos por tipo */}
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Movimientos por tipo</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                {Object.entries(data.movPorTipo).map(([tipo, qty]: any) => (
                  <div key={tipo} className="bg-bg-base rounded-lg py-3">
                    <div className="text-xs uppercase text-neutral-400">{tipo}</div>
                    <div className="font-bold text-lg">{qty}</div>
                  </div>
                ))}
                {Object.keys(data.movPorTipo).length === 0 && (
                  <div className="col-span-3 text-sm text-neutral-500 py-4">
                    Sin movimientos en el período.
                  </div>
                )}
              </div>
            </Card>

            {/* Recepciones */}
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Recepciones</h3>
              {data.remitos.length === 0 ? (
                <p className="text-sm text-neutral-500">Sin recepciones este mes.</p>
              ) : (
                <div className="space-y-1.5 text-sm">
                  {data.remitos.map((r: any) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          <span className="font-mono text-xs text-neutral-500">
                            {r.numero}
                          </span>{' '}
                          · {r.proveedor?.nombre || 'Sin proveedor'}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {formatDate(r.fecha)} · {r.sucursal?.nombre}
                        </div>
                      </div>
                      <div className="font-semibold">{formatMoney(r.total_factura)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Fraccionados */}
            {data.fracs.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold mb-3">Fraccionamientos</h3>
                <div className="text-sm space-y-1.5">
                  {data.fracs.map((f: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-1.5 border-b border-border last:border-0"
                    >
                      <div>
                        {f.bultos_usados} bultos · {f.peso_total_kg} kg →{' '}
                        {f.peso_fraccionado_kg} kg
                      </div>
                      <div
                        className={
                          f.merma_pct > 10 ? 'text-warning font-semibold' : ''
                        }
                      >
                        {Number(f.merma_pct).toFixed(2)}% merma
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .bg-bg-card,
          .bg-bg-base,
          .bg-bg-elevated {
            background: white !important;
            border-color: #ddd !important;
          }
          * {
            color: black !important;
          }
          header {
            position: static !important;
          }
        }
      `}</style>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-neutral-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}
