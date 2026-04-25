// @ts-nocheck
'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { Upload, CheckCircle2, AlertTriangle, Info, Loader2, TrendingUp } from 'lucide-react';

const SUCURSAL_MAP: Record<string, number> = {
  'SOHO': 1, 'SOHO 2': 2, 'soho': 1, 'soho 2': 2,
};

function encontrarCabecera(lineas: string[]): { idx: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(lineas.length, 10); i++) {
    const cols = lineas[i].split('\t').map(c => c.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    );
    // Buscar la línea que tenga 'empresa', 'sucursal' y 'cantidad'
    if (cols.some(c => c === 'empresa') && cols.some(c => c === 'sucursal') && cols.some(c => c === 'cantidad')) {
      return { idx: i, headers: cols };
    }
  }
  return null;
}

export default function ImportarVentasPage() {
  const router = useRouter();
  const supabase = createClient();
  const [textoXls, setTextoXls] = useState('');
  const [parseError, setParseError] = useState('');
  const [paso, setPaso] = useState<'pegar' | 'preview' | 'cargando' | 'listo'>('pegar');
  const [filasParsed, setFilasParsed] = useState<any[]>([]);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0, errores: [] as string[] });
  const [periodoInfo, setPeriodoInfo] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
    });
  }, []);

  const parsearTexto = () => {
    setParseError('');
    const lineas = textoXls.trim().split('\n').map(l => l.trimEnd()).filter(Boolean);

    if (lineas.length < 3) {
      setParseError('Muy pocas líneas. Copiá toda la hoja con Ctrl+A → Ctrl+C.');
      return;
    }

    // Encontrar la fila de cabecera
    const cabecera = encontrarCabecera(lineas);
    if (!cabecera) {
      // Debug: mostrar primeras líneas
      const muestra = lineas.slice(0, 3).map(l => l.split('\t').slice(0, 5).join(' | ')).join(' // ');
      setParseError(`No se encontró la cabecera (Empresa, Sucursal, Cantidad). Primeras columnas: ${muestra}`);
      return;
    }

    const { idx: cabeceraIdx, headers } = cabecera;

    // Encontrar índices de columnas clave (sin tildes, lowercase)
    const idxEmpresa  = headers.findIndex(h => h === 'empresa');
    const idxSucursal = headers.findIndex(h => h === 'sucursal');
    const idxFecha    = headers.findIndex(h => h.includes('fecha comp'));
    const idxCodigo   = headers.findIndex(h => h.includes('codigo producto') || h.includes('c?digo producto'));
    const idxProducto = headers.findIndex(h => h === 'producto');
    const idxCantidad = headers.findIndex(h => h === 'cantidad');

    if (idxCodigo < 0) {
      setParseError(`No se encontró columna "Código Producto". Headers: ${headers.slice(0, 12).join(', ')}`);
      return;
    }
    if (idxCantidad < 0) {
      setParseError(`No se encontró columna "Cantidad". Headers: ${headers.slice(0, 12).join(', ')}`);
      return;
    }
    if (idxFecha < 0) {
      setParseError(`No se encontró columna "Fecha Comp". Headers: ${headers.slice(0, 12).join(', ')}`);
      return;
    }

    const filas: any[] = [];
    let fechaMin = '', fechaMax = '';
    const anioActual = new Date().getFullYear();

    for (const linea of lineas.slice(cabeceraIdx + 1)) {
      const cols = linea.split('\t');
      if (cols.length < 5) continue;

      const sucursalRaw = (cols[idxSucursal] || '').trim();
      const codigoRaw   = (cols[idxCodigo]   || '').trim().split('.')[0];
      const nombre      = (cols[idxProducto] || '').trim();
      const cantidadRaw = (cols[idxCantidad] || '').trim().replace(',', '.');
      const fechaRaw    = (cols[idxFecha]    || '').trim();

      if (!codigoRaw || codigoRaw === 'nan' || codigoRaw === '') continue;
      const cantidad = parseFloat(cantidadRaw);
      if (!cantidad || cantidad <= 0 || isNaN(cantidad)) continue;

      // Parsear fecha: "2026-02-25 03:00:00" → "2026-02-25"
      const fechaMatch = fechaRaw.match(/(\d{4}-\d{2}-\d{2})/);
      if (!fechaMatch) continue;
      const fechaISO = fechaMatch[1];
      const anio = parseInt(fechaISO.split('-')[0]);
      if (anio < anioActual - 3 || anio > anioActual + 1) continue;

      if (!fechaMin || fechaISO < fechaMin) fechaMin = fechaISO;
      if (!fechaMax || fechaISO > fechaMax) fechaMax = fechaISO;

      const sucursalId = SUCURSAL_MAP[sucursalRaw] || SUCURSAL_MAP[sucursalRaw.toUpperCase()] || 1;

      filas.push({
        sucursal: sucursalRaw,
        sucursal_id: sucursalId,
        fecha: fechaISO,
        codigo: codigoRaw,
        nombre,
        cantidad,
      });
    }

    if (filas.length === 0) {
      setParseError('Se encontró la cabecera pero no hay filas de venta válidas. Verificá que el archivo tiene datos de ventas con fechas y cantidades.');
      return;
    }

    const diasPeriodo = fechaMin && fechaMax
      ? Math.max(1, Math.round((new Date(fechaMax + 'T12:00:00').getTime() - new Date(fechaMin + 'T12:00:00').getTime()) / 86400000))
      : 1;

    setPeriodoInfo({ fechaMin, fechaMax, diasPeriodo, totalFilas: filas.length });
    setFilasParsed(filas);
    setPaso('preview');
  };

  // Agrupar para preview
  const resumenPreview = (() => {
    if (!filasParsed.length) return [];
    const map = new Map<string, { codigo: string; nombre: string; soho1: number; soho2: number }>();
    for (const f of filasParsed) {
      if (!map.has(f.codigo)) map.set(f.codigo, { codigo: f.codigo, nombre: f.nombre, soho1: 0, soho2: 0 });
      const e = map.get(f.codigo)!;
      if (f.sucursal_id === 1) e.soho1 += f.cantidad;
      else e.soho2 += f.cantidad;
    }
    return Array.from(map.values()).sort((a, b) => (b.soho1 + b.soho2) - (a.soho1 + a.soho2));
  })();

  const handleCargar = async () => {
    setPaso('cargando');
    const errores: string[] = [];

    // Borrar ventas del mismo período para evitar duplicados
    if (periodoInfo?.fechaMin && periodoInfo?.fechaMax) {
      await supabase.from('ventas_historico')
        .delete()
        .gte('fecha', periodoInfo.fechaMin)
        .lte('fecha', periodoInfo.fechaMax);
    }

    // Buscar product_ids
    const codigos = [...new Set(filasParsed.map(f => f.codigo))];
    const { data: productos } = await supabase.from('productos').select('id, codigo').in('codigo', codigos);
    const mapProd = new Map<string, number>();
    (productos || []).forEach(p => mapProd.set(p.codigo, p.id));

    const rows = filasParsed
      .map(f => ({
        producto_id: mapProd.get(f.codigo) || null,
        codigo: f.codigo,
        nombre: f.nombre,
        sucursal_id: f.sucursal_id,
        fecha: f.fecha,
        cantidad: f.cantidad,
      }))
      .filter(r => r.producto_id);

    const BATCH = 500;
    let actual = 0;
    setProgreso({ actual: 0, total: rows.length, errores: [] });

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase.from('ventas_historico').insert(batch);
      if (error) errores.push(`Batch ${i}-${i + BATCH}: ${error.message}`);
      actual += batch.length;
      setProgreso({ actual, total: rows.length, errores: [...errores] });
    }

    setPaso('listo');
  };

  if (paso === 'listo') return (
    <>
      <PageHeader title="Importar ventas" backHref="/" />
      <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
        <div className="inline-flex w-20 h-20 rounded-full bg-success/15 items-center justify-center">
          <CheckCircle2 size={44} className="text-success" />
        </div>
        <h2 className="text-2xl font-bold">¡Ventas importadas!</h2>
        <p className="text-neutral-400">{progreso.actual} registros cargados en {periodoInfo?.diasPeriodo}d de período.</p>
        {progreso.errores.length > 0 && (
          <Card className="p-4 text-left border-warning/40">
            <div className="text-xs text-warning font-semibold mb-1">Errores:</div>
            <ul className="text-xs text-neutral-400 space-y-1">{progreso.errores.map((e, i) => <li key={i}>• {e}</li>)}</ul>
          </Card>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <BigButton onClick={() => router.push('/reportes/compras')}>Ver sugerencias de compra</BigButton>
        </div>
      </div>
    </>
  );

  if (paso === 'cargando') {
    const pct = progreso.total > 0 ? Math.round((progreso.actual / progreso.total) * 100) : 0;
    return (
      <>
        <PageHeader title="Importar ventas" backHref="/" />
        <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
          <Loader2 size={48} className="animate-spin text-accent mx-auto" />
          <h2 className="text-xl font-bold">Importando...</h2>
          <p className="text-neutral-400">{progreso.actual} / {progreso.total}</p>
          <div className="h-2 bg-bg-card rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-neutral-500">No cerrés esta ventana</p>
        </div>
      </>
    );
  }

  if (paso === 'preview') return (
    <>
      <PageHeader title="Importar ventas · confirmar" backHref="/" />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {periodoInfo && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Período', value: `${periodoInfo.fechaMin} → ${periodoInfo.fechaMax}` },
              { label: 'Días cubiertos', value: `${periodoInfo.diasPeriodo}d` },
              { label: 'Productos', value: resumenPreview.length },
            ].map(({ label, value }) => (
              <Card key={label} className="p-3 text-center">
                <div className="text-lg font-black text-accent">{value}</div>
                <div className="text-[10px] uppercase text-neutral-500 mt-0.5">{label}</div>
              </Card>
            ))}
          </div>
        )}
        <Card className="p-4 border-accent/20 bg-accent/5">
          <div className="flex items-start gap-2">
            <Info className="text-accent flex-shrink-0 mt-0.5" size={16} />
            <div className="text-sm text-neutral-300">Si ya existe data del mismo período, se reemplaza para evitar duplicados.</div>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-border text-xs uppercase text-neutral-500 font-semibold">
            Top productos por ventas
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-card">
                <tr className="text-[10px] uppercase text-neutral-500">
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">SOHO 1</th>
                  <th className="text-right px-3 py-2">SOHO 2</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumenPreview.slice(0, 100).map(f => (
                  <tr key={f.codigo} className="border-t border-border hover:bg-bg-hover">
                    <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{f.codigo}</td>
                    <td className="px-3 py-1.5 text-xs truncate max-w-[220px]">{f.nombre}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums">{f.soho1 || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums">{f.soho2 || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums font-semibold text-accent">{f.soho1 + f.soho2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="flex gap-3">
          <BigButton variant="secondary" onClick={() => setPaso('pegar')} className="flex-1">Volver</BigButton>
          <BigButton onClick={handleCargar} className="flex-1" icon={<Upload size={18} />}>
            Importar {periodoInfo?.totalFilas?.toLocaleString()} registros
          </BigButton>
        </div>
      </div>
    </>
  );

  return (
    <>
      <PageHeader title="Importar ventas" backHref="/" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-4 border-accent/20 bg-accent/5">
          <div className="flex items-start gap-3">
            <Info className="text-accent flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-neutral-300 space-y-2">
              <p><b>Cómo exportar desde DUX:</b></p>
              <ol className="list-decimal list-inside space-y-1 text-neutral-400">
                <li>Ir a <b>Consulta de Ventas Detallada</b> en DUX</li>
                <li>Filtrar el período deseado (máx. 60 días por exportación)</li>
                <li>Exportar a Excel → abrirlo</li>
                <li><b>Ctrl+A</b> → <b>Ctrl+C</b></li>
                <li>Pegar acá abajo con <b>Ctrl+V</b></li>
              </ol>
              <p className="text-xs text-neutral-500">Podés importar múltiples períodos — se acumulan sin duplicar.</p>
            </div>
          </div>
        </Card>
        <div>
          <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2">Contenido del Excel</label>
          <textarea value={textoXls} onChange={e => setTextoXls(e.target.value)} rows={12}
            placeholder="Pegá acá el contenido copiado del Excel de ventas detalladas..."
            className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-accent resize-y" />
        </div>
        {parseError && (
          <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm flex gap-2 break-words">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {parseError}
          </div>
        )}
        <BigButton onClick={parsearTexto} size="xl" className="w-full" disabled={!textoXls.trim()} icon={<TrendingUp size={22} />}>
          Parsear ventas
        </BigButton>
      </div>
    </>
  );
}
