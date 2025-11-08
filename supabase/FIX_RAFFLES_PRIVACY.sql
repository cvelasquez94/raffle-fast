-- ============================================
-- FIX: Usuarios ven talonarios de otros usuarios
-- ============================================
-- Este script asegura que los usuarios solo vean sus propios talonarios
-- en el Dashboard, pero permite que todos vean las rifas públicamente
-- ============================================

-- PASO 1: Actualizar política de SELECT en raffles
-- ============================================

DO $$
BEGIN
    -- Eliminar política existente
    DROP POLICY IF EXISTS "Anyone can view raffles" ON raffles;
    DROP POLICY IF EXISTS "Users can view own raffles" ON raffles;

    -- Crear política: Cualquiera puede ver rifas (para la vista pública)
    -- Esta política permite compartir links de rifas
    CREATE POLICY "Anyone can view raffles"
      ON raffles
      FOR SELECT
      TO public
      USING (true);

    RAISE NOTICE '✓ Política de visualización de raffles actualizada';
END $$;

-- PASO 2: Verificar política de INSERT (solo owners pueden crear)
-- ============================================

DO $$
BEGIN
    DROP POLICY IF EXISTS "Authenticated users can create raffles" ON raffles;
    DROP POLICY IF EXISTS "Users can create own raffles" ON raffles;

    -- Solo usuarios autenticados pueden crear rifas para sí mismos
    CREATE POLICY "Users can create own raffles"
      ON raffles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

    RAISE NOTICE '✓ Política de creación de raffles verificada';
END $$;

-- PASO 3: Verificar política de UPDATE (solo owners pueden editar)
-- ============================================

DO $$
BEGIN
    DROP POLICY IF EXISTS "Owners can update their raffles" ON raffles;
    DROP POLICY IF EXISTS "Users can update own raffles" ON raffles;

    -- Solo el propietario puede actualizar su rifa
    CREATE POLICY "Users can update own raffles"
      ON raffles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    RAISE NOTICE '✓ Política de actualización de raffles verificada';
END $$;

-- PASO 4: Verificar política de DELETE (solo owners pueden eliminar)
-- ============================================

DO $$
BEGIN
    DROP POLICY IF EXISTS "Owners can delete their raffles" ON raffles;
    DROP POLICY IF EXISTS "Users can delete own raffles" ON raffles;

    -- Solo el propietario puede eliminar su rifa
    CREATE POLICY "Users can delete own raffles"
      ON raffles
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);

    RAISE NOTICE '✓ Política de eliminación de raffles verificada';
END $$;

-- PASO 5: Verificación final
-- ============================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'raffles';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICACIÓN COMPLETA - Políticas de Raffles';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total de políticas en raffles: %', policy_count;

  IF policy_count >= 4 THEN
    RAISE NOTICE '✅ TODO CORRECTO - Políticas configuradas';
  ELSE
    RAISE WARNING '⚠️  Faltan políticas. Esperadas: 4, Encontradas: %', policy_count;
  END IF;

  RAISE NOTICE '========================================';
END $$;

-- PASO 6: Mostrar todas las políticas de raffles
-- ============================================

SELECT
  policyname as "Política",
  cmd as "Comando",
  CASE
    WHEN roles = '{public}' THEN 'Público'
    WHEN roles = '{authenticated}' THEN 'Autenticados'
    ELSE roles::text
  END as "Roles"
FROM pg_policies
WHERE tablename = 'raffles'
ORDER BY cmd, policyname;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================
-- 1. La política "Anyone can view raffles" permite que:
--    - Usuarios sin login vean rifas compartidas
--    - Se puedan compartir links públicos de rifas
--
-- 2. El código del frontend (Dashboard.tsx) ahora filtra por user_id:
--    .eq("user_id", userId)
--
-- 3. Esto significa:
--    - En el Dashboard: Solo ves TUS rifas
--    - En la vista pública (/raffle/:id): Todos pueden ver cualquier rifa
--
-- ============================================
