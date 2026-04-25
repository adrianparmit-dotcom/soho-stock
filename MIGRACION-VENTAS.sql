-- ============================================================
-- MIGRACIÓN VENTAS — Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS ventas (
  id serial PRIMARY KEY,
  codigo text NOT NULL,
  producto_nombre text,
  sucursal text NOT NULL,   -- 'SOHO' o 'SOHO 2'
  sucursal_id integer REFERENCES sucursales(id),
  fecha date NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  precio_unitario numeric DEFAULT 0,
  total numeric DEFAULT 0,
  forma_pago text,
  comprobante text,
  importado_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ventas_codigo_idx ON ventas(codigo);
CREATE INDEX IF NOT EXISTS ventas_fecha_idx ON ventas(fecha);
CREATE INDEX IF NOT EXISTS ventas_sucursal_idx ON ventas(sucursal_id);

-- Vista para promedio diario de ventas por producto (últimos 60 días)
CREATE OR REPLACE VIEW ventas_promedio_diario AS
SELECT
  codigo,
  sucursal_id,
  SUM(cantidad) as total_vendido,
  COUNT(DISTINCT fecha) as dias_con_venta,
  MIN(fecha) as primera_venta,
  MAX(fecha) as ultima_venta,
  (MAX(fecha) - MIN(fecha) + 1) as dias_periodo,
  ROUND(SUM(cantidad)::numeric / NULLIF((MAX(fecha) - MIN(fecha) + 1), 0), 2) as promedio_diario
FROM ventas
GROUP BY codigo, sucursal_id;
