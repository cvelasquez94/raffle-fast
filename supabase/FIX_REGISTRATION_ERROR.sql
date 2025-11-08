-- ============================================
-- FIX: "Database error saving new user"
-- ============================================
-- Este script soluciona el error al crear nuevos usuarios
-- Ejecuta este SQL completo en Supabase SQL Editor
-- ============================================

-- PASO 1: Verificar que la tabla profiles existe
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        RAISE NOTICE 'CREANDO tabla profiles...';

        CREATE TABLE profiles (
          id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT
        );

        -- Habilitar RLS
        ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE '✓ Tabla profiles creada';
    ELSE
        RAISE NOTICE '✓ Tabla profiles ya existe';
    END IF;
END $$;

-- PASO 2: Eliminar trigger existente (si hay problemas)
-- ============================================

DO $$
BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    RAISE NOTICE '✓ Trigger anterior eliminado (si existía)';
END $$;

-- PASO 3: Recrear la función con manejo de errores mejorado
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER -- Importante: ejecuta con permisos elevados
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Intentar insertar el perfil
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log el error pero no fallar la creación del usuario
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- PASO 4: Crear el trigger
-- ============================================

DO $$
BEGIN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION handle_new_user();

    RAISE NOTICE '✓ Trigger on_auth_user_created creado';
END $$;

-- PASO 5: Dar permisos necesarios
-- ============================================

DO $$
BEGIN
    -- Dar permisos a la función para acceder a auth schema
    GRANT USAGE ON SCHEMA auth TO postgres, authenticated, anon;

    -- Dar permisos sobre la tabla profiles
    GRANT SELECT, INSERT, UPDATE ON profiles TO postgres, authenticated;

    RAISE NOTICE '✓ Permisos configurados';
END $$;

-- PASO 6: Crear/Verificar políticas RLS
-- ============================================

DO $$
BEGIN
    -- Eliminar políticas existentes
    DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
    DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;

    -- Crear políticas
    CREATE POLICY "Users can insert own profile"
      ON profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);

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

    CREATE POLICY "Anyone can view profiles"
      ON profiles
      FOR SELECT
      TO public
      USING (true);

    RAISE NOTICE '✓ Políticas RLS creadas';
END $$;

-- PASO 7: Arreglar usuarios existentes sin perfil
-- ============================================

INSERT INTO profiles (id, full_name, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Usuario'),
  u.raw_user_meta_data->>'phone'
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- PASO 8: Verificación final
-- ============================================

DO $$
DECLARE
  users_count INTEGER;
  profiles_count INTEGER;
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM auth.users;
  SELECT COUNT(*) INTO profiles_count FROM profiles;

  missing_count := users_count - profiles_count;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICACIÓN COMPLETA';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Usuarios en auth.users: %', users_count;
  RAISE NOTICE 'Perfiles en profiles: %', profiles_count;
  RAISE NOTICE 'Usuarios sin perfil: %', missing_count;
  RAISE NOTICE '';

  IF missing_count = 0 THEN
    RAISE NOTICE '✅ TODO CORRECTO - Todos los usuarios tienen perfil';
  ELSE
    RAISE WARNING '⚠️  Hay % usuarios sin perfil', missing_count;
  END IF;

  RAISE NOTICE '========================================';
END $$;

-- PASO 9: Mostrar configuración actual
-- ============================================

-- Mostrar trigger creado
SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Mostrar políticas creadas
SELECT
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- ============================================
-- INSTRUCCIONES POST-EJECUCIÓN
-- ============================================
-- 1. Ejecuta todo este script en SQL Editor
-- 2. Verifica que veas: "✅ TODO CORRECTO"
-- 3. Intenta crear un nuevo usuario
-- 4. Si aún falla, revisa Authentication > Providers > Email
--    y desactiva "Confirm email"
-- ============================================
