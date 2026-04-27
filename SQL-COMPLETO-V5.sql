-- ============================================================
-- SOHO STOCK V5 — SQL COMPLETO
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ============================================================
-- MIGRACIONES BASE (si no se corrieron antes)
-- ============================================================
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS deposito text
  CHECK (deposito IN ('LOCAL','PIEZA','LOCAL2','DEP_LOCAL2'));
UPDATE lotes SET deposito='LOCAL' WHERE sucursal_id=1 AND deposito IS NULL;
UPDATE lotes SET deposito='LOCAL2' WHERE sucursal_id=2 AND deposito IS NULL;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS no_fraccionar boolean DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS rubro text;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS sub_rubro text;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS granel_por_defecto boolean DEFAULT false;
UPDATE proveedores SET granel_por_defecto=true WHERE cuit='30716335808';

-- Fix movimientos
ALTER TABLE movimientos ALTER COLUMN lote_id DROP NOT NULL;

-- ============================================================
-- TABLA VENTAS HISTORICO
-- ============================================================
CREATE TABLE IF NOT EXISTS ventas_historico (
  id serial PRIMARY KEY,
  producto_id integer REFERENCES productos(id),
  codigo text NOT NULL,
  nombre text,
  sucursal_id integer REFERENCES sucursales(id),
  fecha date NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ventas_historico_codigo_idx ON ventas_historico(codigo);
CREATE INDEX IF NOT EXISTS ventas_historico_fecha_idx ON ventas_historico(fecha);
CREATE INDEX IF NOT EXISTS ventas_historico_sucursal_idx ON ventas_historico(sucursal_id);

-- ============================================================
-- TABLA USUARIOS APP
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios_app (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  nombre text,
  rol text NOT NULL DEFAULT 'normal' CHECK (rol IN ('admin','normal')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.usuarios_app(id, email, nombre)
  VALUES(new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.email))
  ON CONFLICT(id) DO NOTHING;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE PROCEDURE handle_new_user();

-- ============================================================
-- TABLA RECEPCIONES BORRADOR
-- ============================================================
CREATE TABLE IF NOT EXISTS recepciones_borrador (
  id serial PRIMARY KEY,
  sucursal_id integer REFERENCES sucursales(id),
  texto_dux text,
  texto_factura text,
  estado_json jsonb,
  creado_por uuid REFERENCES auth.users(id),
  nombre_proveedor text,
  numero_comprobante text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS recepciones_borrador_updated_at ON recepciones_borrador;
CREATE TRIGGER recepciones_borrador_updated_at
  BEFORE UPDATE ON recepciones_borrador FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at();

-- ============================================================
-- INVENTARIO ROTATIVO
-- ============================================================
CREATE TABLE IF NOT EXISTS inventario_ciclos (
  id serial PRIMARY KEY,
  semana_inicio date NOT NULL,
  semana_fin date NOT NULL,
  sucursal_id integer REFERENCES sucursales(id),
  rubro_foco text,
  total_productos integer,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','completado')),
  generado_at timestamptz DEFAULT now()
);

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

-- ============================================================
-- SEGURIDAD — ROW LEVEL SECURITY (RLS)
-- Solo usuarios autenticados pueden leer/escribir
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencia_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraccionados ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE recepciones_borrador ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_ciclos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_items ENABLE ROW LEVEL SECURITY;

-- Política base: solo usuarios autenticados pueden acceder
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['lotes','productos','proveedores','sucursales','movimientos',
    'remitos','transferencias','transferencia_items','fraccionados','ventas_historico',
    'recepciones_borrador','inventario_ciclos','inventario_items'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_only" ON %I', t);
    EXECUTE format('CREATE POLICY "auth_only" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END;
$$;

-- usuarios_app: cada uno ve solo su fila, admins ven todo
DROP POLICY IF EXISTS "user_own" ON usuarios_app;
DROP POLICY IF EXISTS "admin_all" ON usuarios_app;
CREATE POLICY "user_own" ON usuarios_app FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "admin_all" ON usuarios_app FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios_app WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios_app WHERE id = auth.uid() AND rol = 'admin'));

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS lotes_producto_idx ON lotes(producto_id);
CREATE INDEX IF NOT EXISTS lotes_sucursal_idx ON lotes(sucursal_id);
CREATE INDEX IF NOT EXISTS lotes_vencimiento_idx ON lotes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS lotes_tipo_idx ON lotes(tipo_lote);
CREATE INDEX IF NOT EXISTS productos_codigo_idx ON productos(codigo);
CREATE INDEX IF NOT EXISTS proveedores_cuit_idx ON proveedores(cuit);

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT table_name,
  (SELECT COUNT(*) FROM information_schema.table_constraints tc
   WHERE tc.table_name = t.table_name AND tc.constraint_type = 'CHECK') as checks
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;
