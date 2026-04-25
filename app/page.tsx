// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  PackagePlus,
  DatabaseZap,
  TrendingUp,
  ShoppingCart,
  Scissors,
  ArrowRightLeft,
  Boxes,
  Tag,
  FileBarChart,
  LogOut,
  Truck,
  Users,
} from 'lucide-react';

interface ModuleCard {
  href: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
}

const operaciones: ModuleCard[] = [
  { href: '/operaciones/recepcion', label: 'Recepción', icon: <PackagePlus size={32} />, desc: 'Cargar compra desde DUX' },
  { href: '/operaciones/fraccionado', label: 'Fraccionado', icon: <Scissors size={32} />, desc: 'Fraccionado masivo con merma' },
  { href: '/operaciones/transferencias', label: 'Transferencias', icon: <ArrowRightLeft size={32} />, desc: 'Entre sucursales SOHO' },
];

const reportes: ModuleCard[] = [
  { href: '/reportes/stock', label: 'Stock', icon: <Boxes size={32} />, desc: 'Semáforo de vencimientos' },
  { href: '/reportes/promociones', label: 'Promociones', icon: <Tag size={32} />, desc: 'Suave · Media · Fuerte · Liquidación' },
  { href: '/reportes/mensual', label: 'Informe mensual', icon: <FileBarChart size={32} />, desc: 'Solo admin · PDF' },
  { href: '/reportes/compras', label: 'Sugerencias compra', icon: <ShoppingCart size={32} />, desc: 'Qué comprar y cuánto' },
];

const configuracion: ModuleCard[] = [
  { href: '/configuracion/proveedores', label: 'Proveedores', icon: <Truck size={32} />, desc: 'Margen, CUIT y contacto' },
  { href: '/configuracion/usuarios', label: 'Usuarios', icon: <Users size={32} />, desc: 'Accesos y roles del equipo' },
  { href: '/operaciones/stock-inicial', label: 'Stock inicial', icon: <DatabaseZap size={32} />, desc: 'Carga masiva desde DUX' },
  { href: '/operaciones/importar-ventas', label: 'Importar ventas', icon: <TrendingUp size={32} />, desc: 'Historial de ventas desde DUX' },
];

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login');
      } else {
        setUser(data.user);
        setLoading(false);
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

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
              <p className="text-xs text-neutral-400 leading-tight">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl bg-bg-card border border-border hover:bg-bg-hover"
            title="Cerrar sesión"
          >
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

function Section({ title, items }: { title: string; items: ModuleCard[] }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-3 px-1">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group p-5 bg-bg-card hover:bg-bg-hover border border-border hover:border-accent/40 rounded-2xl transition-all active:scale-[0.98] flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-black transition-colors">
              {m.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{m.label}</div>
              <div className="text-sm text-neutral-400 truncate">{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
