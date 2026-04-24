# SOHO Stock V3

App de gestión de stock para SOHO Natural Center — 2 sucursales, carga desde DUX por texto pegado.

---

## Stack

- Next.js 14 (App Router)
- TypeScript con `// @ts-nocheck` (build sin errores estrictos)
- Supabase (auth + DB)
- Tailwind CSS
- Cliente: `@supabase/ssr` → `createBrowserClient`

## Módulos

**Operaciones**
- **Recepción** → pegá el texto del comprobante de compra del DUX → parser automático → preview editable con división en lotes por vencimiento → guarda en `remitos` + `lotes` + `movimientos`
- **Fraccionado** → selección de lote granel → peso bruto/neto → cálculo automático de merma → crea lote fraccionado
- **Transferencias** → pegá el texto de transferencia del DUX → parser → descuenta lotes origen (FIFO) → crea lotes destino

**Reportes**
- **Stock** → listado con semáforo de vencimientos (verde +60d, amarillo 30-60, naranja 15-30, rojo <15)
- **Promociones sugeridas** → cálculo automático de descuentos sobre lotes próximos a vencer, combinando urgencia y margen del proveedor
- **Informe mensual** (admin) → KPIs, compras, transferencias y mermas del mes, exportable a PDF vía Imprimir

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.local.example .env.local
# (ya vienen cargadas las de SOHO)

# 3. Correr en dev
npm run dev
```

Abrí `http://localhost:3000` y logueate con tu cuenta Supabase.

## Deploy a Vercel

1. Subí el proyecto a GitHub
2. Importalo en Vercel
3. Cargá las 2 variables de entorno en Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## Estructura

```
soho-stock-v3/
├── app/
│   ├── layout.tsx                Layout raíz
│   ├── page.tsx                  Home (Operaciones + Reportes)
│   ├── globals.css               Tailwind + tema oscuro
│   ├── login/page.tsx            Auth
│   ├── operaciones/
│   │   ├── recepcion/page.tsx
│   │   ├── transferencias/page.tsx
│   │   └── fraccionado/page.tsx
│   └── reportes/
│       ├── stock/page.tsx
│       ├── promociones/page.tsx
│       └── mensual/page.tsx      (solo admin)
├── components/
│   ├── ui/                       BigButton, Card, PageHeader, SucursalPicker, BackButton
│   └── recepcion/LoteSplitter.tsx
├── lib/
│   ├── supabase/client.ts        createBrowserClient
│   ├── parsers/
│   │   ├── dux-compra.ts         Parser texto → comprobante estructurado
│   │   └── dux-transferencia.ts  Parser texto → transferencia estructurada
│   └── utils/format.ts           Moneda/fecha AR + semáforo vencimientos
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## Migración de DB aplicada

Antes de usar la app se corrió esta migración en Supabase (ya está aplicada):

```sql
-- Depósitos (4 físicos mapeados a 2 sucursales)
CREATE TABLE depositos ...

-- Productos: código DUX + precios + fraccionable
ALTER TABLE productos ADD COLUMN codigo, precio_costo, precio_venta, fraccionable ...

-- Lotes: cantidad decimal + referencia depósito
ALTER TABLE lotes ...

-- Proveedores: CUIT para matcheo
ALTER TABLE proveedores ADD COLUMN cuit ...

-- Transferencias: cabecera + items
CREATE TABLE transferencia_items ...
```

Ver el mensaje original del asistente para el SQL completo.

## Cómo funciona el parseo DUX

### Comprobante de compra
Copiá todo el texto del comprobante desde el DUX (Ctrl+A + Ctrl+C en la ventana). El parser:
1. Detecta encabezado: número, fecha, proveedor, CUIT, subtotal, IVA, total
2. Detecta tabla: extrae cada fila (código, descripción, cantidad, precio, %IVA, subtotal c/IVA)
3. Maneja comprobantes paginados (cabecera repetida) automáticamente
4. Valida suma de subtotales contra total declarado

### Transferencia
Mismo principio:
1. Detecta depósito origen/destino (LOCAL, PIEZA, LOCAL 2, DEPOSITO LOCAL 2)
2. Los mapea a sucursales (SOHO 1 / SOHO 2)
3. Extrae items (código, descripción, cantidad)
4. Busca stock disponible en sucursal origen
5. Descuenta por FIFO (lote que vence primero se usa primero)

## Mapeo depósito DUX → sucursal

| DUX | Sucursal |
|---|---|
| LOCAL | SOHO 1 |
| PIEZA | SOHO 1 |
| LOCAL 2 | SOHO 2 |
| DEPOSITO LOCAL 2 | SOHO 2 |

## Reglas de negocio

- **Proveedor no encontrado** → freno, pedís alta manual antes de continuar
- **Producto no encontrado** → lo creo automáticamente y muestro alerta amarilla en la preview
- **Múltiples vencimientos en un mismo producto** → botón "Dividir en otro lote" en la preview
- **Todos los lotes requieren fecha de vencimiento**
- **Transferencias** → siempre entre sucursales distintas (no dentro de la misma)

## Ajustes pendientes / TODO

- Lista de admins en `app/reportes/mensual/page.tsx` (`ADMIN_EMAILS`) — ajustar con los mails reales
- La sugerencia de promociones usa margen del proveedor + urgencia. Cuando haya ventas_dux sincronizado se puede incorporar rotación real.
- Si querés editar precios_venta en lote, armar un módulo aparte de "mantenimiento de productos"
