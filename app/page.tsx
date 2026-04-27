// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  PackagePlus, DatabaseZap, TrendingUp, ShoppingCart,
  Scissors, ArrowRightLeft, Boxes, Tag, FileBarChart,
  LogOut, Truck, Users, ClipboardList,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState({ urgentes: 0, alertasStock: 0, promos: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      setUser(data.user);
      // Verificar rol
      const { data: ua } = await supabase.from('usuarios_app').select('rol, activo').eq('id', data.user.id).single();
      if (ua && !ua.activo) { await supabase.auth.signOut(); router.replace('/login'); return; }
      const admin = ua?.rol === 'admin';
      setIsAdmin(admin);
      // Cargar badges
      cargarBadges(admin);
      setLoading(false);
    });
  }, []);

  const cargarBadges = async (admin: boolean) => {
    try {
      // Alertas de stock: lotes próximos a vencer (<15 días)
      const hoy = new Date();
      const en15 = new Date(hoy); en15.setDate(hoy.getDate() + 15);
      const { count: promos } = await supabase.from('lotes')
        .select('*', { count: 'exact', head: true })
        .gt('cantidad', 0)
        .lte('fecha_vencimiento', en15.toISOString().split('T')[0])
        .neq('fecha_vencimiento', '2099-12-31');

      // Alertas de transferencia: calculadas del lado cliente con los datos
      // Para el badge solo contamos lotes con stock 0 en locales
      setBadges(prev => ({
        ...prev,
        promos: promos || 0,
      }));
    } catch {}
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </main>
  );

  const operaciones = [
    { href: '/operaciones/recepcion', label: 'Recepción', icon: <PackagePlus size={32} />, desc: 'Cargar compra desde DUX' },
    { href: '/operaciones/fraccionado', label: 'Fraccionado', icon: <Scissors size={32} />, desc: 'Fraccionado masivo con merma' },
    { href: '/operaciones/transferencias', label: 'Transferencias', icon: <ArrowRightLeft size={32} />, desc: 'Entre sucursales SOHO' },
  ];

  const reportes = [
    { href: '/reportes/stock', label: 'Stock', icon: <Boxes size={32} />, desc: 'Semáforo de vencimientos y alertas' },
    { href: '/reportes/promociones', label: 'Promociones', icon: <Tag size={32} />, desc: 'Ofertas · Liquidación · Última oportunidad', badge: badges.promos > 0 ? badges.promos : 0 },
    ...(isAdmin ? [
      { href: '/reportes/compras', label: 'Sugerencias compra', icon: <ShoppingCart size={32} />, desc: 'Qué comprar y cuánto · Solo admin' },
      { href: '/reportes/mensual', label: 'Informe mensual', icon: <FileBarChart size={32} />, desc: 'Solo admin · PDF' },
    ] : []),
  ];

  const configuracion = [
    { href: '/inventario/ciclo', label: 'Inventario rotativo', icon: <ClipboardList size={32} />, desc: 'Control semanal por rubros' },
    ...(isAdmin ? [
      { href: '/configuracion/proveedores', label: 'Proveedores', icon: <Truck size={32} />, desc: 'Margen, CUIT y contacto' },
      { href: '/configuracion/usuarios', label: 'Usuarios', icon: <Users size={32} />, desc: 'Accesos y roles del equipo' },
      { href: '/operaciones/stock-inicial', label: 'Stock inicial', icon: <DatabaseZap size={32} />, desc: 'Carga masiva desde DUX' },
      { href: '/operaciones/importar-ventas', label: 'Importar ventas', icon: <TrendingUp size={32} />, desc: 'Historial de ventas desde DUX' },
      { href: '/configuracion/dux', label: 'Sync DUX API', icon: <Zap size={32} />, desc: 'Sincronizar ventas automáticamente' },
    ] : []),
  ];

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur bg-bg-base/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
              <span className="text-accent font-black">S</span>
            </div>
            <div>
              <h1 className="font-bold leading-tight">SOHO Stock</h1>
              <p className="text-xs text-neutral-400 leading-tight">{user?.email} {isAdmin && <span className="text-accent">· admin</span>}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2.5 rounded-xl bg-bg-card border border-border hover:bg-bg-hover" title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <Section title="Operaciones" items={operaciones} />
        <Section title="Reportes" items={reportes} />
        <Section title="Configuración" items={configuracion} />
      </div>
    </main>
  );
}

function Section({ title, items }: any) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-3 px-1">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((m: any) => (
          <Link key={m.href} href={m.href}
            className="group p-5 bg-bg-card hover:bg-bg-hover border border-border hover:border-accent/40 rounded-2xl transition-all active:scale-[0.98] flex items-center gap-4 relative">
            <div className="w-14 h-14 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-black transition-colors flex-shrink-0">
              {m.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{m.label}</div>
              <div className="text-sm text-neutral-400 truncate">{m.desc}</div>
            </div>
            {m.badge > 0 && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-danger flex items-center justify-center text-[10px] font-black text-white">
                {m.badge > 99 ? '99+' : m.badge}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
