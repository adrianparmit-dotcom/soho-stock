-- ============================================================
-- MIGRACIÓN: Inventario rotativo + rubros en productos
-- ============================================================

-- Agregar rubro y sub_rubro a productos (sincronizado desde DUX)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS rubro text;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS sub_rubro text;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS rubro_dux_id integer;

-- Tabla de ciclos de inventario (se genera automáticamente cada semana)
CREATE TABLE IF NOT EXISTS inventario_ciclos (
  id serial PRIMARY KEY,
  semana_inicio date NOT NULL,
  semana_fin date NOT NULL,
  sucursal_id integer REFERENCES sucursales(id),
  rubro_foco text,          -- rubro principal de la semana
  total_productos integer,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','completado')),
  generado_at timestamptz DEFAULT now()
);

-- Items del ciclo (productos a contar esa semana)
CREATE TABLE IF NOT EXISTS inventario_items (
  id serial PRIMARY KEY,
  ciclo_id integer REFERENCES inventario_ciclos(id) ON DELETE CASCADE,
  producto_id integer REFERENCES productos(id),
  stock_sistema numeric DEFAULT 0,
  stock_contado numeric,
  diferencia numeric GENERATED ALWAYS AS (
    CASE WHEN stock_contado IS NOT NULL THEN stock_contado - stock_sistema ELSE NULL END
  ) STORED,
  contado_por uuid REFERENCES auth.users(id),
  contado_at timestamptz,
  observaciones text
);

CREATE INDEX IF NOT EXISTS inventario_items_ciclo_idx ON inventario_items(ciclo_id);
CREATE INDEX IF NOT EXISTS inventario_items_producto_idx ON inventario_items(producto_id);

-- Verificar
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('inventario_ciclos','inventario_items')
ORDER BY table_name;
