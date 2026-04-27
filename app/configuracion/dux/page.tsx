// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { RefreshCw, CheckCircle2, AlertTriangle, TrendingUp, ShoppingCart } from 'lucide-react';

export default function DuxSyncPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState('');
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      const { data: ua } = await supabase.from('usuarios_app').select('rol').eq('id', data.user.id).single();
      if (ua?.rol !== 'admin') { router.replace('/'); return; }
    });
  }, []);

  const sincronizarVentas = async () => {
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const res = await fetch('/api/dux/sync-ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde: fechaDesde, hasta: fechaHasta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setResultado(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <>
      <PageHeader title="Sincronización DUX" backHref="/" />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <Card className="p-4 border-accent/20 bg-accent/5">
          <div className="text-sm text-neutral-300 space-y-1">
            <p className="font-semibold text-accent">Sincronización automática con DUX ERP</p>
            <p className="text-neutral-400">Importa las ventas directamente desde DUX sin necesidad de exportar Excel manualmente.</p>
          </div>
        </Card>

        {/* Sync ventas */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-accent" />
            <div>
              <div className="font-semibold">Importar ventas</div>
              <div className="text-xs text-neutral-400">Trae el detalle de ventas SKU por SKU del período seleccionado</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Desde</label>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                className="w-full bg-bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Hasta</label>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                className="w-full bg-bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          <BigButton onClick={sincronizarVentas} loading={loading} icon={<RefreshCw size={18}/>}>
            {loading ? 'Sincronizando...' : 'Sincronizar ventas'}
          </BigButton>

          {error && (
            <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm flex gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {resultado && (
            <div className="bg-success/10 border border-success/40 rounded-xl px-4 py-3 text-sm space-y-1">
              <div className="flex items-center gap-2 text-success font-semibold">
                <CheckCircle2 size={16} /> Sincronización exitosa
              </div>
              <div className="text-neutral-300">
                {resultado.insertados?.toLocaleString()} registros importados de {resultado.ventas} transacciones
              </div>
              {resultado.mensaje && <div className="text-neutral-400 text-xs">{resultado.mensaje}</div>}
            </div>
          )}
        </Card>

        <Card className="p-4 border-neutral-700">
          <div className="text-xs text-neutral-500 space-y-1">
            <p className="font-semibold text-neutral-400">Configuración requerida en Vercel:</p>
            <p>• <code className="bg-neutral-800 px-1 rounded">DUX_TOKEN</code> — token de la API de DUX</p>
            <p>• <code className="bg-neutral-800 px-1 rounded">DUX_EMPRESA_ID</code> — 3455</p>
          </div>
        </Card>
      </div>
    </>
  );
}
