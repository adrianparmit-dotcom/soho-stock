# SOHO Stock V5 — Instrucciones completas

## PASO 1 — SQL en Supabase (PRIMERO Y OBLIGATORIO)

1. Entrá a supabase.com → tu proyecto → **SQL Editor** → **New query**
2. Abrí el archivo `SQL-COMPLETO-V5.sql`, copiá TODO y pegalo
3. Hacé clic en **Run**
4. Tiene que decir "Success" al final

---

## PASO 2 — Variables de entorno en Vercel

1. Vercel → proyecto "sohostock" → **Settings** → **Environment Variables**
2. Verificar que existen (o agregar):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://wnxplyqswwdwzskwtrnr.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_UQbmIl1Y8AAdW_Nn0EaGug_l6A-icMA`
3. Cuando tengas el token de DUX, agregar:
   - `DUX_TOKEN` = (tu token de DUX)
   - `DUX_EMPRESA_ID` = (tu empresa_id de DUX)

---

## PASO 3 — Google OAuth

### En Google Cloud Console:
1. Ir a https://console.cloud.google.com
2. Crear proyecto → nombre "SOHO Stock"
3. APIs & Services → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized redirect URIs → agregar EXACTAMENTE:
   `https://wnxplyqswwdwzskwtrnr.supabase.co/auth/v1/callback`
6. Guardar → copiar **Client ID** y **Client Secret**

### En Supabase:
1. Authentication → **Providers** → **Google**
2. Activar el toggle
3. Pegar Client ID y Client Secret
4. Guardar

El botón "Continuar con Google" ya funciona automáticamente.

---

## PASO 4 — Subir a GitHub

1. Extraer el ZIP
2. Entrar al repo en GitHub → **Add file** → **Upload files**
3. Arrastrar la carpeta `soho-stock-v4` completa
4. Commit: "V5 - features completos"
5. Vercel redeploya automáticamente (~2 minutos)

---

## PASO 5 — Conectar DUX API (cuando tengas el token)

1. En DUX → usuario (arriba derecha) → Configuración → General → Empresa → **API**
2. Generar token (o copiar si ya existe)
3. Para encontrar empresa_id, abrir en el navegador:
   `https://api.duxsoftware.com.ar/api/empresas?token=TU_TOKEN`
4. Anotar el campo `id` del resultado
5. Agregar en Vercel → Environment Variables:
   - `DUX_TOKEN` = el token
   - `DUX_EMPRESA_ID` = el id
6. Redeploy en Vercel

---

## PASO 6 — Marcar admin

La primera vez que alguien entra con Google queda como 'normal'.
Para marcar a Adrian como admin:

```sql
UPDATE usuarios_app SET rol='admin' WHERE email='tu-email@gmail.com';
```

---

## QUÉ HAY EN V5

### Módulos nuevos:
- **Inventario rotativo** — ciclos semanales automáticos, ~310 productos/semana, rotando por rubros
- **Stock inicial con vencimientos** — ahora podés cargar la fecha de vencimiento lote por lote antes de confirmar

### Módulos mejorados:
- **Promociones** — 3 formatos fijos (🟡 OFERTA 15%, 🟠 LIQUIDACIÓN 30%, 🔴 ÚLTIMA OPORTUNIDAD 45%), solo propone promo si el stock NO se vende al ritmo actual antes de vencer
- **Home** — badge rojo con cantidad de lotes próximos a vencer en Promociones, Sugerencias de compra y configuración visible solo para admin
- **Seguridad** — RLS habilitado en todas las tablas, solo usuarios autenticados pueden acceder, usuarios inactivos son bloqueados al entrar

### DUX API (lista para conectar):
- Sync de ventas automático (reemplaza el import manual del Excel)
- Endpoint preparado en `/api/dux/sync-ventas`
