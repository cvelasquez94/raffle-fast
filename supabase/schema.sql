-- ============================================
-- SCHEMA COMPLETO PARA SUPABASE
-- Basado en: src/integrations/supabase/types.ts
-- ============================================
-- Ejecuta este script en tu proyecto Supabase nuevo
-- Dashboard > SQL Editor > New Query > Pega y ejecuta
-- ============================================

-- ============================================
-- 1. CREAR ENUMS (tipos personalizados)
-- ============================================

CREATE TYPE number_status AS ENUM ('available', 'reserved', 'sold');
CREATE TYPE raffle_status AS ENUM ('active', 'completed', 'cancelled');

-- ============================================
-- 2. CREAR TABLAS
-- ============================================

-- Tabla: profiles
-- Nota: Se vincula automáticamente con auth.users de Supabase
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT
);

-- Tabla: raffles (talonarios/rifas)
CREATE TABLE raffles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_per_number NUMERIC NOT NULL CHECK (price_per_number > 0),
  total_numbers INTEGER DEFAULT 50 NOT NULL CHECK (total_numbers > 0),
  whatsapp_number TEXT NOT NULL,
  status raffle_status DEFAULT 'active' NOT NULL
);

-- Tabla: raffle_numbers (números individuales de cada rifa)
CREATE TABLE raffle_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number > 0),
  status number_status DEFAULT 'available' NOT NULL,
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  reserved_at TIMESTAMP WITH TIME ZONE,
  reserved_until TIMESTAMP WITH TIME ZONE,
  sold_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  UNIQUE(raffle_id, number),
  CHECK (
    (status = 'available' AND buyer_name IS NULL) OR
    (status = 'reserved' AND buyer_name IS NOT NULL AND reserved_at IS NOT NULL AND reserved_until IS NOT NULL) OR
    (status = 'sold' AND buyer_name IS NOT NULL AND sold_at IS NOT NULL)
  )
);

-- ============================================
-- 3. CREAR ÍNDICES para mejorar performance
-- ============================================

CREATE INDEX idx_raffles_user_id ON raffles(user_id);
CREATE INDEX idx_raffles_status ON raffles(status);
CREATE INDEX idx_raffle_numbers_raffle_id ON raffle_numbers(raffle_id);
CREATE INDEX idx_raffle_numbers_status ON raffle_numbers(status);
CREATE INDEX idx_raffle_numbers_reserved_until ON raffle_numbers(reserved_until);

-- ============================================
-- 4. CREAR TRIGGER para updated_at automático
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_raffles_updated_at
  BEFORE UPDATE ON raffles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. FUNCIÓN para crear números automáticamente
-- ============================================

CREATE OR REPLACE FUNCTION create_raffle_numbers()
RETURNS TRIGGER AS $$
DECLARE
  i INTEGER;
BEGIN
  -- Crear números del 1 al total_numbers
  FOR i IN 1..NEW.total_numbers LOOP
    INSERT INTO raffle_numbers (raffle_id, number, status)
    VALUES (NEW.id, i, 'available');
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_raffle_numbers
  AFTER INSERT ON raffles
  FOR EACH ROW
  EXECUTE FUNCTION create_raffle_numbers();

-- ============================================
-- 6. FUNCIÓN para limpiar reservas expiradas
-- ============================================

CREATE OR REPLACE FUNCTION clean_expired_reservations()
RETURNS void AS $$
BEGIN
  UPDATE raffle_numbers
  SET
    status = 'available',
    buyer_name = NULL,
    buyer_email = NULL,
    buyer_phone = NULL,
    reserved_at = NULL,
    reserved_until = NULL
  WHERE
    status = 'reserved'
    AND reserved_until < timezone('utc'::text, now());
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffle_numbers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. CREAR POLÍTICAS DE SEGURIDAD (RLS Policies)
-- ============================================

-- ====================
-- Políticas: profiles
-- ====================

-- Cualquiera puede ver perfiles (para mostrar nombres de organizadores)
CREATE POLICY "Anyone can view profiles"
  ON profiles
  FOR SELECT
  TO public
  USING (true);

-- Los usuarios pueden ver y editar su propio perfil
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Los usuarios pueden insertar su propio perfil
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ====================
-- Políticas: raffles
-- ====================

-- Cualquiera puede ver rifas (necesario para vista pública)
CREATE POLICY "Anyone can view raffles"
  ON raffles
  FOR SELECT
  TO public
  USING (true);

-- Solo usuarios autenticados pueden crear rifas
CREATE POLICY "Authenticated users can create raffles"
  ON raffles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Los propietarios pueden actualizar sus rifas
CREATE POLICY "Owners can update their raffles"
  ON raffles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Los propietarios pueden eliminar sus rifas
CREATE POLICY "Owners can delete their raffles"
  ON raffles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ====================
-- Políticas: raffle_numbers
-- ====================

-- Cualquiera puede ver los números
CREATE POLICY "Anyone can view raffle numbers"
  ON raffle_numbers
  FOR SELECT
  TO public
  USING (true);

-- Cualquiera puede reservar números disponibles (CLAVE PARA RESERVAS PÚBLICAS)
CREATE POLICY "Anyone can reserve available numbers"
  ON raffle_numbers
  FOR UPDATE
  TO public
  USING (status = 'available')
  WITH CHECK (
    status = 'reserved'
    AND buyer_name IS NOT NULL
    AND reserved_at IS NOT NULL
    AND reserved_until IS NOT NULL
  );

-- Los propietarios pueden actualizar cualquier número de sus rifas
CREATE POLICY "Owners can update their raffle numbers"
  ON raffle_numbers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM raffles
      WHERE raffles.id = raffle_numbers.raffle_id
      AND raffles.user_id = auth.uid()
    )
  );

-- Los propietarios pueden insertar números en sus rifas
CREATE POLICY "Owners can insert raffle numbers"
  ON raffle_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM raffles
      WHERE raffles.id = raffle_numbers.raffle_id
      AND raffles.user_id = auth.uid()
    )
  );

-- Los propietarios pueden eliminar números de sus rifas
CREATE POLICY "Owners can delete their raffle numbers"
  ON raffle_numbers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM raffles
      WHERE raffles.id = raffle_numbers.raffle_id
      AND raffles.user_id = auth.uid()
    )
  );

-- ============================================
-- 9. CREAR FUNCIÓN para manejar nuevos usuarios
-- ============================================

-- Esta función crea automáticamente un perfil cuando un usuario se registra
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que ejecuta la función cuando se crea un usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 10. DATOS DE EJEMPLO (OPCIONAL - Comentado)
-- ============================================

/*
-- Descomentar si quieres datos de prueba

-- Crear un usuario de prueba (necesitas el ID de un usuario existente)
-- INSERT INTO profiles (id, full_name, phone)
-- VALUES ('tu-user-id-aqui', 'Usuario de Prueba', '+541112345678');

-- Crear una rifa de ejemplo
INSERT INTO raffles (user_id, title, description, price_per_number, whatsapp_number)
VALUES (
  'tu-user-id-aqui',
  'Rifa iPhone 15 Pro',
  'Sorteo de un iPhone 15 Pro nuevo. El sorteo se realizará el 31 de diciembre de 2024.',
  1000.00,
  '+5491112345678'
);

-- Los números se crean automáticamente con el trigger
*/

-- ============================================
-- 11. CONFIGURACIÓN ADICIONAL
-- ============================================

-- Dar permisos al rol anónimo para las operaciones públicas
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON raffles TO anon;
GRANT SELECT, UPDATE ON raffle_numbers TO anon;

GRANT SELECT ON profiles TO authenticated;
GRANT ALL ON raffles TO authenticated;
GRANT ALL ON raffle_numbers TO authenticated;

-- ============================================
-- FIN DEL SCHEMA
-- ============================================

-- Para verificar que todo se creó correctamente, ejecuta:
-- SELECT * FROM pg_tables WHERE schemaname = 'public';
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
