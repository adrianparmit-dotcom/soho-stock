// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { FechaRapida } from '@/components/recepcion/FechaRapida';
import { Upload, CheckCircle2, AlertTriangle, Info, Loader2, Calendar } from 'lucide-react';

const VENC_SIN_FECHA = '2099-12-31';
const DEPOSITO_SUCURSAL: Record<string, number> = { LOCAL: 1, PIEZA: 1, LOCAL2: 2, DEP_LOCAL2: 2 };

type Modo = 'pegar' | 'preview' | 'vencimientos' | 'cargando' | 'listo';

export default function StockInicialPage() {
  const router = useRouter();
  const supabase = createClient();
  const [textoXls, setTextoXls] = useState('');
  const [filasParsed, setFilasParsed] = useState<any[]>([]);
  const [parseError, setParseError] = useState('');
  const [modo, setModo] = useState<Modo>('pegar');
  const [progreso, setProgreso] = useState({ actual: 0, total: 0, errores: [] as string[] });
  // Vencimientos: mapa loteTempId → fecha
  const [vencimientos, setVencimientos] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
  }, []);

  const parsearTexto = () => {
    setParseError('');
    const lineas = textoXls.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const cabeceraIdx = lineas.findIndex(l => l.toLowerCase().includes('código') || l.toLowerCase().includes('codigo') || l.includes('LOCAL'));
    const dataLineas = cabeceraIdx >= 0 ? lineas.slice(cabeceraIdx + 1) : lineas;
    if (!dataLineas.length) { setParseError('No se encontraron datos. Copiá toda la hoja con Ctrl+A → Ctrl+C.'); return; }
    const filas: any[] = [];
    for (const linea of dataLineas) {
      const cols = linea.split(/\t/).map(c => c.trim());
      if (cols.length < 7) continue;
      const codigo = cols[0].replace(/\.0$/, '').trim();
      const nombre = cols[1].trim();
      if (!codigo || codigo === 'Código Producto' || codigo === 'Codigo Producto') continue;
      const local = parseFloat(cols[3]) || 0;
      const pieza = parseFloat(cols[4]) || 0;
      const local2 = parseFloat(cols[5]) || 0;
      const dep2 = parseFloat(cols[6]) || 0;
      if (local === 0 && pieza === 0 && local2 === 0 && dep2 === 0) continue;
      filas.push({ codigo, nombre, LOCAL: local, PIEZA: pieza, LOCAL2: local2, DEP_LOCAL2: dep2 });
    }
    if (!filas.length) { setParseError('No se pudieron parsear filas.'); return; }
    setFilasParsed(filas);
    setModo('preview');
  };

  const negativos = filasParsed.filter(f => f.LOCAL < 0 || f.PIEZA < 0 || f.LOCAL2 < 0 || f.DEP_LOCAL2 < 0);
  const lotesACrear = useMemo(() => {
    const result: Array<{ codigo: string; nombre: string; deposito: string; cantidad: number; key: string }> = [];
    for (const f of filasParsed) {
      for (const dep of ['LOCAL','PIEZA','LOCAL2','DEP_LOCAL2']) {
        if (f[dep] > 0) result.push({ codigo: f.codigo, nombre: f.nombre, deposito: dep, cantidad: f[dep], key: `${f.codigo}-${dep}` });
      }
    }
    return result;
  }, [filasParsed]);

  const handleCargar = async () => {
    setModo('cargando');
    const errores: string[] = [];
    const codigos = [...new Set(lotesACrear.map(l => l.codigo))];
    const { data: productos } = await supabase.from('productos').select('id, codigo').in('codigo', codigos);
    const mapProd = new Map((productos || []).map(p => [p.codigo, p.id]));
    let actual = 0;
    setProgreso({ actual: 0, total: lotesACrear.length, errores: [] });
    for (const lote of lotesACrear) {
      const pid = mapProd.get(lote.codigo);
      if (!pid) { errores.push(`[${lote.codigo}] no encontrado`); actual++; setProgreso({ actual, total: lotesACrear.length, errores: [...errores] }); continue; }
      const fechaVenc = vencimientos[lote.key] || VENC_SIN_FECHA;
      const { error } = await supabase.from('lotes').insert({
        producto_id: pid,
        sucursal_id: DEPOSITO_SUCURSAL[lote.deposito],
        deposito: lote.deposito,
        cantidad: lote.cantidad,
        fecha_vencimiento: fechaVenc,
        costo: 0,
        tipo_lote: 'venta',
      });
      if (error) errores.push(`[${lote.codigo}] ${lote.deposito}: ${error.message}`);
      actual++;
      setProgreso({ actual, total: lotesACrear.length, errores: [...errores] });
    }
    setModo('listo');
  };

  if (modo === 'listo') return (
    <>
      <PageHeader title="Stock inicial" backHref="/" />
      <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
        <div className="inline-flex w-20 h-20 rounded-full bg-success/15 items-center justify-center">
          <CheckCircle2 size={44} className="text-success" />
        </div>
        <h2 className="text-2xl font-bold">¡Stock cargado!</h2>
        <p className="text-neutral-400">{progreso.actual} lotes creados.{progreso.errores.length > 0 && ` ${progreso.errores.length} error(es).`}</p>
        {progreso.errores.length > 0 && (
          <Card className="p-4 text-left border-warning/40">
            <div className="text-xs text-warning mb-1 font-semibold">Errores:</div>
            <ul className="text-xs text-neutral-400 space-y-1 max-h-32 overflow-y-auto">{progreso.errores.map((e,i) => <li key={i}>• {e}</li>)}</ul>
          </Card>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <BigButton onClick={() => router.push('/reportes/stock')}>Ver stock</BigButton>
        </div>
      </div>
    </>
  );

  if (modo === 'cargando') {
    const pct = progreso.total > 0 ? Math.round((progreso.actual / progreso.total) * 100) : 0;
    return (
      <>
        <PageHeader title="Stock inicial" backHref="/" />
        <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
          <Loader2 size={48} className="animate-spin text-accent mx-auto" />
          <h2 className="text-xl font-bold">Cargando...</h2>
          <p className="text-neutral-400">{progreso.actual} / {progreso.total}</p>
          <div className="h-2 bg-bg-card rounded-full overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="text-xs text-neutral-500">No cerrés esta ventana</p>
        </div>
      </>
    );
  }

  // MODO VENCIMIENTOS: cargar fechas lote por lote
  if (modo === 'vencimientos') {
    const conVenc = lotesACrear.filter(l => vencimientos[l.key]).length;
    return (
      <>
        <PageHeader title="Stock inicial · vencimientos" backHref="/" />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <Card className="p-4 border-accent/20 bg-accent/5">
            <div className="flex items-start gap-2">
              <Info className="text-accent flex-shrink-0 mt-0.5" size={16} />
              <div className="text-sm text-neutral-300">
                Cargá el vencimiento de cada lote. Los que no tengan fecha asignada se cargan como <b>"Sin vencimiento"</b> y podés actualizarlos después desde el reporte de stock.
                <div className="mt-1 text-xs text-neutral-500">{conVenc} de {lotesACrear.length} con fecha cargada.</div>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {lotesACrear.map(lote => (
              <Card key={lote.key} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-neutral-500">[{lote.codigo}] <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded ml-1">{lote.deposito}</span></div>
                    <div className="text-sm font-medium truncate">{lote.nombre}</div>
                    <div className="text-xs text-neutral-500">Stock: {lote.cantidad} un</div>
                  </div>
                  <FechaRapida
                    value={vencimientos[lote.key] || ''}
                    onChange={iso => setVencimientos(prev => ({ ...prev, [lote.key]: iso }))}
                    compact
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <BigButton variant="secondary" onClick={() => setModo('preview')} className="flex-1">Volver</BigButton>
            <BigButton onClick={handleCargar} className="flex-1" icon={<Upload size={18}/>}>
              Cargar {lotesACrear.length} lotes
            </BigButton>
          </div>
        </div>
      </>
    );
  }

  // MODO PREVIEW
  if (modo === 'preview') return (
    <>
      <PageHeader title="Stock inicial · confirmar" backHref="/" />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Productos', value: filasParsed.length },
            { label: 'Lotes a crear', value: lotesACrear.length },
            { label: 'Negativos (se omiten)', value: negativos.length, danger: negativos.length > 0 },
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
              <AlertTriangle className="text-warning flex-shrink-0" size={16} />
              <div className="text-sm font-semibold text-warning">{negativos.length} producto(s) con negativos — se omiten</div>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="p-3 border-b border-border text-xs uppercase text-neutral-500 font-semibold">Vista previa</div>
          <div className="max-h-80 overflow-y-auto">
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
                {filasParsed.slice(0, 100).map(f => (
                  <tr key={f.codigo} className="border-t border-border hover:bg-bg-hover">
                    <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{f.codigo}</td>
                    <td className="px-3 py-1.5 text-xs truncate max-w-[200px]">{f.nombre}</td>
                    {['LOCAL','PIEZA','LOCAL2','DEP_LOCAL2'].map(dep => (
                      <td key={dep} className={`px-3 py-1.5 text-right text-xs font-semibold tabular-nums ${f[dep]>0?'text-success':f[dep]<0?'text-danger':'text-neutral-600'}`}>
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
          <BigButton variant="secondary" onClick={() => setModo('pegar')} className="flex-1">Volver</BigButton>
          <BigButton onClick={() => setModo('vencimientos')} className="flex-1" icon={<Calendar size={18}/>}>
            Cargar vencimientos
          </BigButton>
          <BigButton onClick={handleCargar} variant="secondary" className="flex-1" icon={<Upload size={18}/>}>
            Sin vencimientos (carga directa)
          </BigButton>
        </div>
      </div>
    </>
  );

  // MODO PEGAR
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
                <li>Hacé <b>Ctrl+A</b> → <b>Ctrl+C</b></li>
                <li>Pegá acá abajo</li>
              </ol>
            </div>
          </div>
        </Card>
        <div>
          <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2">Contenido del Excel</label>
          <textarea value={textoXls} onChange={e => setTextoXls(e.target.value)} rows={10}
            placeholder="Pegá acá..." className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-accent resize-y" />
        </div>
        {parseError && (
          <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm flex gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {parseError}
          </div>
        )}
        <BigButton onClick={parsearTexto} size="xl" className="w-full" disabled={!textoXls.trim()} icon={<Upload size={22}/>}>
          Parsear y revisar
        </BigButton>
      </div>
    </>
  );
}
