// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { BigButton } from '@/components/ui/BigButton';
import { User, Shield, UserCheck, UserX, Info } from 'lucide-react';

export default function UsuariosPage() {
  const supabase = createClient();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('usuarios_app')
      .select('*')
      .order('created_at', { ascending: true });
    setUsuarios(data || []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const cambiarRol = async (id: string, nuevoRol: string) => {
    setSavingId(id);
    await supabase.from('usuarios_app').update({ rol: nuevoRol }).eq('id', id);
    setSavingId(null);
    cargar();
  };

  const toggleActivo = async (id: string, activo: boolean) => {
    setSavingId(id);
    await supabase.from('usuarios_app').update({ activo: !activo }).eq('id', id);
    setSavingId(null);
    cargar();
  };

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle={`${usuarios.length} persona${usuarios.length !== 1 ? 's' : ''}`}
        backHref="/"
      />
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <Card className="p-4 bg-accent/5 border-accent/30">
          <div className="flex items-start gap-3">
            <Info className="text-accent flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm">
              <div className="font-semibold">Cómo invitar a alguien nuevo</div>
              <div className="text-neutral-400 text-xs mt-1">
                La persona entra a <b>sohostock.vercel.app/login</b> y hace clic en "Continuar con Google"
                con su cuenta. Automáticamente se crea su usuario como "normal". Desde acá vos le podés
                cambiar el rol a "admin" o desactivar el acceso.
              </div>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="py-12 text-center text-neutral-500">Cargando...</div>
        ) : (
          <div className="space-y-2">
            {usuarios.map((u) => (
              <Card key={u.id} className={`p-4 ${!u.activo ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    u.rol === 'admin' ? 'bg-accent/20 text-accent' : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {u.rol === 'admin' ? <Shield size={18} /> : <User size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{u.nombre || u.email}</div>
                    <div className="text-xs text-neutral-400 truncate">{u.email}</div>
                  </div>
                  {u.rol === 'admin' && (
                    <span className="text-[10px] uppercase font-bold bg-accent/20 text-accent px-2 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                  {!u.activo && (
                    <span className="text-[10px] uppercase font-bold bg-danger/20 text-danger px-2 py-0.5 rounded">
                      Inactivo
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {u.rol === 'normal' ? (
                    <button
                      onClick={() => cambiarRol(u.id, 'admin')}
                      disabled={savingId === u.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-medium disabled:opacity-50"
                    >
                      Hacer admin
                    </button>
                  ) : (
                    <button
                      onClick={() => cambiarRol(u.id, 'normal')}
                      disabled={savingId === u.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover text-neutral-300 font-medium disabled:opacity-50"
                    >
                      Quitar admin
                    </button>
                  )}
                  <button
                    onClick={() => toggleActivo(u.id, u.activo)}
                    disabled={savingId === u.id}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 inline-flex items-center gap-1 ${
                      u.activo
                        ? 'bg-danger/10 hover:bg-danger/20 text-danger'
                        : 'bg-success/10 hover:bg-success/20 text-success'
                    }`}
                  >
                    {u.activo ? (
                      <><UserX size={12} /> Desactivar</>
                    ) : (
                      <><UserCheck size={12} /> Activar</>
                    )}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
