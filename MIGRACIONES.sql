-- ============================================================
-- SOHO STOCK V4 — MIGRACIONES COMPLETAS
-- Ejecutar en orden en Supabase SQL Editor
-- ============================================================

-- ============================================================
-- MIGRACIÓN 1: Campo deposito en lotes
-- ============================================================
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS deposito text
  CHECK (deposito IN ('LOCAL', 'PIEZA', 'LOCAL2', 'DEP_LOCAL2'));

-- Backfill lotes existentes sin deposito asignado
UPDATE lotes SET deposito = 'LOCAL'  WHERE sucursal_id = 1 AND deposito IS NULL;
UPDATE lotes SET deposito = 'LOCAL2' WHERE sucursal_id = 2 AND deposito IS NULL;

-- ============================================================
-- MIGRACIÓN 2: Tabla usuarios_app (si no existe)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios_app (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  nombre text,
  rol text NOT NULL DEFAULT 'normal' CHECK (rol IN ('admin', 'normal')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Trigger para crear usuario automáticamente al hacer login
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.usuarios_app (id, email, nombre)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ============================================================
-- MIGRACIÓN 3: Tabla recepciones_borrador (si no existe)
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

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recepciones_borrador_updated_at ON recepciones_borrador;
CREATE TRIGGER recepciones_borrador_updated_at
  BEFORE UPDATE ON recepciones_borrador
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ============================================================
-- VERIFICACIÓN FINAL
-- Corré esto para confirmar que todo quedó bien:
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'lotes' ORDER BY ordinal_position;
-- SELECT COUNT(*) FROM lotes WHERE deposito IS NULL;  -- debe dar 0
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
