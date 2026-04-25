// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { Search, Save, Check, Package, Percent } from 'lucide-react';

export default function ProveedoresPage() {
  const supabase = createClient();
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Record<number, any>>({});
  const [guardando, setGuardando] = useState<Record<number, boolean>>({});
  const [guardadoOk, setGuardadoOk] = useState<Record<number, boolean>>({});
  const [conteoProductos, setConteoProductos] = useState<Record<number, number>>({});

  const cargar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('proveedores')
      .select('id, nombre, margen_pct, cuit, contacto, notas, granel_por_defecto')
      .order('nombre');
    setProveedores(data || []);

    // Contar productos por proveedor
    const { data: prods } = await supabase
      .from('productos')
      .select('proveedor_id')
      .not('proveedor_id', 'is', null);
    const c: Record<number, number> = {};
    (prods || []).forEach((p: any) => {
      c[p.proveedor_id] = (c[p.proveedor_id] || 0) + 1;
    });
    setConteoProductos(c);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return proveedores;
    const q = busqueda.toLowerCase();
    return proveedores.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(q) ||
        p.cuit?.includes(q)
    );
  }, [proveedores, busqueda]);

  const setField = (id: number, field: string, value: any) => {
    setEditando((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
    setGuardadoOk((prev) => ({ ...prev, [id]: false }));
  };

  const getField = (p: any, field: string) => {
    return editando[p.id]?.[field] ?? p[field] ?? '';
  };

  const hasChanges = (p: any) => {
    const e = editando[p.id];
    if (!e) return false;
    return Object.keys(e).some((k) => (e[k] ?? '') !== (p[k] ?? ''));
  };

  const guardar = async (p: any) => {
    const cambios = editando[p.id];
    if (!cambios) return;
    setGuardando((prev) => ({ ...prev, [p.id]: true }));
    const { error } = await supabase
      .from('proveedores')
      .update({
        margen_pct: cambios.margen_pct !== undefined ? parseFloat(cambios.margen_pct) || 0 : p.margen_pct,
        cuit: cambios.cuit !== undefined ? (cambios.cuit || null) : p.cuit,
        contacto: cambios.contacto !== undefined ? (cambios.contacto || null) : p.contacto,
        notas: cambios.notas !== undefined ? (cambios.notas || null) : p.notas,
        granel_por_defecto: cambios.granel_por_defecto !== undefined ? cambios.granel_por_defecto : (p.granel_por_defecto || false),
      })
      .eq('id', p.id);

    setGuardando((prev) => ({ ...prev, [p.id]: false }));
    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        alert('Error: ese CUIT ya está asignado a otro proveedor.');
      } else {
        alert('Error al guardar: ' + error.message);
      }
      return;
    }
    // Actualizar local
    setProveedores((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, ...cambios } : x))
    );
    setEditando((prev) => {
      const n = { ...prev };
      delete n[p.id];
      return n;
    });
    setGuardadoOk((prev) => ({ ...prev, [p.id]: true }));
    setTimeout(() => {
      setGuardadoOk((prev) => ({ ...prev, [p.id]: false }));
    }, 2000);
  };

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle={`${filtrados.length} de ${proveedores.length}`}
        backHref="/"
      />
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o CUIT..."
            className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-accent"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-500">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <Card className="py-12 text-center text-neutral-500">
            No hay proveedores.
          </Card>
        ) : (
          <div className="space-y-2">
            {filtrados.map((p) => {
              const changed = hasChanges(p);
              const ok = guardadoOk[p.id];
              return (
                <Card
                  key={p.id}
                  className={`p-4 ${changed ? 'border-accent/40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{p.nombre}</div>
                      <div className="flex items-center gap-1 text-xs text-neutral-400 mt-0.5">
                        <Package size={11} />
                        {conteoProductos[p.id] || 0} productos
                      </div>
                    </div>
                    {ok && (
                      <div className="flex items-center gap-1 text-xs text-success font-semibold">
                        <Check size={14} /> Guardado
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        Margen %
                      </label>
                      <div className="relative">
                        <Percent size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="number"
                          step="0.1"
                          value={getField(p, 'margen_pct')}
                          onChange={(e) => setField(p.id, 'margen_pct', e.target.value)}
                          className="w-full bg-bg-base border border-border rounded-lg pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        CUIT
                      </label>
                      <input
                        type="text"
                        value={getField(p, 'cuit')}
                        onChange={(e) => setField(p.id, 'cuit', e.target.value)}
                        placeholder="Sin CUIT"
                        className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 mt-3">
                    <div>
                      <label className="block text-[10px] uppercase text-neutral-500 mb-1">
                        Contacto
                      </label>
                      <input
                        type="text"
                        value={getField(p, 'contacto')}
                        onChange={(e) => setField(p.id, 'contacto', e.target.value)}
                        placeholder="Teléfono, email, vendedor..."
                        className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  {changed && (
                    <div className="flex justify-end mt-3">
                      <BigButton
                        size="md"
                        onClick={() => guardar(p)}
                        loading={guardando[p.id]}
                        icon={<Save size={14} />}
                      >
                        Guardar cambios
                      </BigButton>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
