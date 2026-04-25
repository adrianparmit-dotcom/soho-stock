# SOHO Stock V4 — Instrucciones de deploy

## PASO 1 — Base de datos (Supabase)

1. Entrá a https://supabase.com → tu proyecto
2. En el menú izquierdo hacé clic en **SQL Editor**
3. Hacé clic en **New query**
4. Abrí el archivo `MIGRACIONES.sql` de este ZIP, copiá TODO el contenido y pegalo en el editor
5. Hacé clic en **Run** (o Ctrl+Enter)
6. Tenés que ver: "Success. No rows returned" — eso está bien

### Verificación opcional
Pegá esto en el SQL Editor y ejecutá:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'lotes' AND column_name = 'deposito';
SELECT COUNT(*) as sin_deposito FROM lotes WHERE deposito IS NULL;
```
- Primera query: tiene que aparecer "deposito"
- Segunda query: tiene que dar 0

---

## PASO 2 — Subir el código a GitHub

1. Entrá a tu repo en GitHub
2. Hacé clic en **Add file** → **Upload files**
3. Arrastrá la carpeta `soho-stock-v4` completa (o su contenido)
4. Escribí en el campo de commit: "V4 - fixes completos"
5. Hacé clic en **Commit changes**

---

## PASO 3 — Variables de entorno en Vercel

1. Entrá a https://vercel.com → tu proyecto "sohostock"
2. Hacé clic en **Settings** → **Environment Variables**
3. Verificá que estén estas dos variables (si ya están, no hace falta hacer nada):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://wnxplyqswwdwzskwtrnr.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_UQbmIl1Y8AAdW_Nn0EaGug_l6A-icMA`
4. Si no están, agregarlas y hacer **Redeploy**

---

## PASO 4 — Deploy automático

Vercel redeploya automático cuando subís código a GitHub.
Esperá ~2 minutos y entrá a https://sohostock.vercel.app para verificar.

---

## QUÉ CAMBIÓ EN V4

### Bug fixes
- **Recepción**: ahora podés confirmar aunque el proveedor mande más o menos de lo facturado
- **Recepción**: los productos sin cajas cargadas se tratan como "no recibido" (no bloquean)
- **Fecha**: calendario con flujo año → mes → día, máximo 4 clics
- **Fraccionado**: usa el mismo calendario que recepción

### Lógica de alertas corregida
- PIEZA y DEP_LOCAL2 **nunca generan alertas** (son depósitos, no locales de venta)
- Solo LOCAL y LOCAL2 generan alertas de transferencia
- **LOCAL sin stock** → busca en: PIEZA → DEP_LOCAL2 → LOCAL2
- **LOCAL2 sin stock** → busca en: DEP_LOCAL2 → PIEZA → LOCAL

### Recepción mejorada
- Selector de depósito (LOCAL / PIEZA para SOHO1; LOCAL2 / DEP_LOCAL2 para SOHO2)
- Cada lote queda registrado en su depósito exacto

### Stock inicial (carga masiva)
- Disponible para todos los usuarios (no solo admins)
- Crea un lote por cada depósito con stock
- Los negativos se omiten

### Arquitectura
- Lógica de negocio centralizada en `lib/business/stock.ts`
- Semáforo, transferencias recomendadas y sugerencias de promoción en un solo lugar

---

## CARGA INICIAL DE STOCK

Si todavía no cargaste el stock inicial:

1. Ir a **Configuración → Stock inicial** en la app
2. Abrir el Excel DUX de consulta de stock
3. **Ctrl+A** → **Ctrl+C**
4. Pegar en el campo de texto
5. Revisar el preview
6. Confirmar

El stock se carga con fecha "sin vencimiento" (31/12/2099).
En el reporte aparece con badge gris "Stock inicial".
A medida que hagas recepciones, los lotes nuevos tendrán fechas reales.

---

## SOPORTE

Si algo no funciona después del deploy, tomá captura del error (o de la consola del navegador con F12 → Console) y compartila.

---

## NUEVOS MÓDULOS EN V4

### Importar ventas (Configuración → Importar ventas)
1. En DUX: **Consulta de Ventas Detallada**
2. Filtrá el período (máx. 60 días por exportación)
3. Exportá a Excel → abrilo → **Ctrl+A** → **Ctrl+C**
4. Pegá en la app → Parsear → Confirmar
5. Podés importar múltiples períodos (se acumulan)

### Sugerencias de compra (Reportes → Sugerencias compra)
Muestra qué productos comprar y cuánto, basado en:
- Stock actual
- Promedio de ventas diarias (del historial importado)
- Lead time de 7 días + colchón de 14 días

Categorías:
- 🚨 **Urgente** — stock para menos de 7 días
- 🛒 **Comprar** — stock para menos de 21 días
- ⛔ **No comprar** — riesgo de vencimiento antes de vender
- ✅ **OK** — stock suficiente

Sin historial de ventas importado, igual funciona pero solo con stock (sin cálculo de días de cobertura).
