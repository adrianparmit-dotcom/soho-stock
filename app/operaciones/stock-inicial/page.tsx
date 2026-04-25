// @ts-nocheck
'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { Upload, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';

const VENC_SIN_FECHA = '2099-12-31';

// Mapeo depósito → sucursal_id
const DEPOSITO_SUCURSAL: Record<string, number> = {
  LOCAL: 1, PIEZA: 1, LOCAL2: 2, DEP_LOCAL2: 2,
};

export default function StockInicialPage() {
  const router = useRouter();
  const supabase = createClient();

  const [textoXls, setTextoXls] = useState('');
  const [filasParsed, setFilasParsed] = useState<any[]>([]);
  const [parseError, setParseError] = useState('');
  const [paso, setPaso] = useState<'pegar' | 'preview' | 'cargando' | 'listo'>('pegar');
  const [progreso, setProgreso] = useState({ actual: 0, total: 0, errores: [] as string[] });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
  }, []);

  const parsearTexto = () => {
    setParseError('');
    const lineas = textoXls.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const cabeceraIdx = lineas.findIndex(l =>
      l.toLowerCase().includes('código') || l.toLowerCase().includes('codigo') || l.includes('LOCAL')
    );
    const dataLineas = cabeceraIdx >= 0 ? lineas.slice(cabeceraIdx + 1) : lineas;

    if (dataLineas.length === 0) {
      setParseError('No se encontraron datos. Copiá toda la hoja con Ctrl+A → Ctrl+C.');
      return;
    }

    const filas: any[] = [];
    for (const linea of dataLineas) {
      const cols = linea.split(/\t/).map(c => c.trim());
      if (cols.length < 7) continue;
      const codigo = cols[0].replace(/\.0$/, '').trim();
      const nombre = cols[1].trim();
      if (!codigo || codigo === 'Código Producto' || codigo === 'Codigo Producto') continue;

      // Columnas: codigo | nombre | unidad | LOCAL | PIEZA | LOCAL2 | DEP_LOCAL2 | TOTAL
      const local = parseFloat(cols[3]) || 0;
      const pieza = parseFloat(cols[4]) || 0;
      const local2 = parseFloat(cols[5]) || 0;
      const dep2 = parseFloat(cols[6]) || 0;

      // Solo filas con algo != 0
      if (local === 0 && pieza === 0 && local2 === 0 && dep2 === 0) continue;

      filas.push({ codigo, nombre, LOCAL: local, PIEZA: pieza, LOCAL2: local2, DEP_LOCAL2: dep2 });
    }

    if (filas.length === 0) {
      setParseError('No se pudieron parsear filas. Copiá directamente desde el Excel con Ctrl+A → Ctrl+C.');
      return;
    }

    setFilasParsed(filas);
    setPaso('preview');
  };

  const negativos = filasParsed.filter(f =>
    f.LOCAL < 0 || f.PIEZA < 0 || f.LOCAL2 < 0 || f.DEP_LOCAL2 < 0
  );

  // Contar lotes a crear (un lote por depósito con stock > 0)
  const lotesACrear = filasParsed.reduce((acc, f) => {
    ['LOCAL','PIEZA','LOCAL2','DEP_LOCAL2'].forEach(dep => {
      if (f[dep] > 0) acc++;
    });
    return acc;
  }, 0);

  const handleCargar = async () => {
    setPaso('cargando');
    const codigos = filasParsed.map(f => f.codigo);
    const { data: productos } = await supabase
      .from('productos').select('id, codigo').in('codigo', codigos);
    const mapProd = new Map<string, number>();
    (productos || []).forEach(p => mapProd.set(p.codigo, p.id));

    const errores: string[] = [];
    let actual = 0;
    const total = lotesACrear;
    setProgreso({ actual: 0, total, errores: [] });

    for (const fila of filasParsed) {
      const pid = mapProd.get(fila.codigo);
      if (!pid) {
        errores.push(`[${fila.codigo}] no encontrado en catálogo`);
        continue;
      }

      for (const dep of ['LOCAL','PIEZA','LOCAL2','DEP_LOCAL2']) {
        const cant = fila[dep];
        if (cant <= 0) continue;

        const { error } = await supabase.from('lotes').insert({
          producto_id: pid,
          sucursal_id: DEPOSITO_SUCURSAL[dep],
          deposito: dep,
          cantidad: cant,
          fecha_vencimiento: VENC_SIN_FECHA,
          costo: 0,
          tipo_lote: 'venta',
        });
        if (error) errores.push(`[${fila.codigo}] ${dep}: ${error.message}`);
        actual++;
        setProgreso({ actual, total, errores: [...errores] });
      }
    }

    setPaso('listo');
    setProgreso(p => ({ ...p, errores }));
  };

  // ===== LISTO =====
  if (paso === 'listo') {
    return (
      <>
        <PageHeader title="Stock inicial" backHref="/" />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 text-center">
          <div className="inline-flex w-20 h-20 rounded-full bg-success/15 items-center justify-center mb-2">
            <CheckCircle2 size={44} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">¡Stock cargado!</h2>
          <p className="text-neutral-400">{progreso.actual} lote(s) creados.{progreso.errores.length > 0 && ` ${progreso.errores.length} error(es).`}</p>
          {progreso.errores.length > 0 && (
            <Card className="p-4 text-left border-warning/40">
              <div className="text-xs text-warning font-semibold mb-2">Errores:</div>
              <ul className="text-xs text-neutral-400 space-y-1 max-h-40 overflow-y-auto">
                {progreso.errores.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </Card>
          )}
          <div className="flex gap-3 justify-center pt-4">
            <BigButton onClick={() => router.push('/reportes/stock')}>Ver stock</BigButton>
          </div>
        </div>
      </>
    );
  }

  // ===== CARGANDO =====
  if (paso === 'cargando') {
    const pct = progreso.total > 0 ? Math.round((progreso.actual / progreso.total) * 100) : 0;
    return (
      <>
        <PageHeader title="Stock inicial" backHref="/" />
        <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
          <Loader2 size={48} className="animate-spin text-accent mx-auto" />
          <h2 className="text-xl font-bold">Cargando stock...</h2>
          <p className="text-neutral-400">{progreso.actual} / {progreso.total} lotes</p>
          <div className="h-2 bg-bg-card rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-neutral-500">No cerrés esta ventana</p>
        </div>
      </>
    );
  }

  // ===== PREVIEW =====
  if (paso === 'preview') {
    return (
      <>
        <PageHeader title="Stock inicial · confirmar" backHref="/" />
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Productos', value: filasParsed.length },
              { label: 'Lotes a crear', value: lotesACrear },
              { label: 'Con negativos', value: negativos.length, danger: negativos.length > 0 },
            ].map(({ label, value, danger }) => (
              <Card key={label} className="p-3 text-center">
                <div className={`text-2xl font-black ${danger ? 'text-danger' : 'text-neutral-200'}`}>{value}</div>
                <div className="text-[10px] uppercase text-neutral-500 mt-0.5">{label}</div>
              </Card>
            ))}
          </div>

          {negativos.length > 0 && (
            <Card className="p-4 border-warning/40 bg-warning/5">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={16} />
                <div className="text-sm font-semibold text-warning">
                  {negativos.length} producto(s) con valores negativos — esos depósitos NO se cargan
                </div>
              </div>
              <div className="max-h-32 overflow-y-auto">
                {negativos.map(f => (
                  <div key={f.codigo} className="text-xs text-neutral-400 py-0.5">
                    [{f.codigo}] {f.nombre} — LOCAL:{f.LOCAL} PIEZA:{f.PIEZA} LOCAL2:{f.LOCAL2} DEP:{f.DEP_LOCAL2}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 border-accent/20 bg-accent/5">
            <div className="flex items-start gap-2">
              <Info className="text-accent flex-shrink-0 mt-0.5" size={16} />
              <div className="text-sm text-neutral-300">
                Se crea <b>un lote por depósito</b> (LOCAL, PIEZA, LOCAL 2, DEPÓSITO LOCAL 2) con <b>fecha de vencimiento abierta</b>.
                En el stock aparecen con badge "Stock inicial".
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="p-3 border-b border-border text-xs uppercase text-neutral-500 font-semibold">
              Vista previa — {filasParsed.length} productos
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-card">
                  <tr className="text-[10px] uppercase text-neutral-500">
                    <th className="text-left px-3 py-2">Código</th>
                    <th className="text-left px-3 py-2">Producto</th>
                    <th className="text-right px-3 py-2">LOCAL</th>
                    <th className="text-right px-3 py-2">PIEZA</th>
                    <th className="text-right px-3 py-2">LOCAL 2</th>
                    <th className="text-right px-3 py-2">DEP</th>
                  </tr>
                </thead>
                <tbody>
                  {filasParsed.map(f => (
                    <tr key={f.codigo} className="border-t border-border hover:bg-bg-hover">
                      <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{f.codigo}</td>
                      <td className="px-3 py-1.5 text-xs truncate max-w-[200px]">{f.nombre}</td>
                      {['LOCAL','PIEZA','LOCAL2','DEP_LOCAL2'].map(dep => (
                        <td key={dep} className={`px-3 py-1.5 text-right tabular-nums text-xs font-semibold ${
                          f[dep] > 0 ? 'text-success' : f[dep] < 0 ? 'text-danger' : 'text-neutral-600'
                        }`}>
                          {f[dep] !== 0 ? f[dep] : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex gap-3">
            <BigButton variant="secondary" onClick={() => setPaso('pegar')} className="flex-1">Volver</BigButton>
            <BigButton onClick={handleCargar} className="flex-1" icon={<Upload size={18} />}>
              Cargar {lotesACrear} lotes
            </BigButton>
          </div>
        </div>
      </>
    );
  }

  // ===== PEGAR =====
  return (
    <>
      <PageHeader title="Stock inicial · carga masiva" backHref="/" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-4 border-accent/20 bg-accent/5">
          <div className="flex items-start gap-3">
            <Info className="text-accent flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-neutral-300 space-y-1">
              <p><b>Cómo usar:</b></p>
              <ol className="list-decimal list-inside space-y-1 text-neutral-400">
                <li>Abrí el Excel de consulta de stock del DUX</li>
                <li>Hacé <b>Ctrl+A</b> para seleccionar toda la hoja</li>
                <li>Hacé <b>Ctrl+C</b> para copiar</li>
                <li>Pegá acá abajo con <b>Ctrl+V</b></li>
              </ol>
              <p className="text-neutral-500 text-xs mt-2">Columnas esperadas: Código · Producto · Unidad · LOCAL · PIEZA · LOCAL 2 · DEPOSITO LOCAL 2 · TOTAL</p>
            </div>
          </div>
        </Card>

        <div>
          <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2">Contenido del Excel</label>
          <textarea
            value={textoXls}
            onChange={e => setTextoXls(e.target.value)}
            rows={10}
            placeholder="Pegá acá el contenido copiado del Excel DUX..."
            className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-accent resize-y"
          />
        </div>

        {parseError && (
          <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm flex gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {parseError}
          </div>
        )}

        <BigButton onClick={parsearTexto} size="xl" className="w-full" disabled={!textoXls.trim()} icon={<Upload size={22} />}>
          Parsear y revisar
        </BigButton>
      </div>
    </>
  );
}
