// @ts-nocheck
import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.DUX_TOKEN;
  const empresa = process.env.DUX_EMPRESA_ID;
  
  if (!token) return NextResponse.json({ error: 'DUX_TOKEN no configurado' });

  const resultados: any = {};

  // Test 1: Consultar empresas
  try {
    const r1 = await fetch('https://erp.duxsoftware.com.ar/WSERP/rest/services/empresas', {
      headers: { 'authorization': token, 'accept': 'application/json' },
      cache: 'no-store',
    });
    resultados.empresas = await r1.json();
  } catch(e: any) { resultados.empresas_error = e.message; }

  // Esperar 5 segundos por rate limit
  await new Promise(r => setTimeout(r, 5500));

  // Test 2: Consultar sucursales
  try {
    const r2 = await fetch(`https://erp.duxsoftware.com.ar/WSERP/rest/services/sucursales?empresa_id=${empresa}`, {
      headers: { 'authorization': token, 'accept': 'application/json' },
      cache: 'no-store',
    });
    resultados.sucursales = await r2.json();
  } catch(e: any) { resultados.sucursales_error = e.message; }

  return NextResponse.json({ empresa_id_configurado: empresa, resultados });
}
