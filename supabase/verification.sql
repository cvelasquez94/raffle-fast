-- ============================================
-- SCRIPT DE VERIFICACIÓN
-- ============================================
-- Ejecuta este script después de instalar schema.sql
-- para verificar que todo esté configurado correctamente
-- ============================================

-- ============================================
-- 1. VERIFICAR ENUMS
-- ============================================

SELECT 'ENUMS' as verificacion, '✓ Verificando tipos ENUM...' as estado;

SELECT
  t.typname as nombre_enum,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as valores
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN ('number_status', 'raffle_status')
GROUP BY t.typname
ORDER BY t.typname;

-- Resultado esperado:
-- number_status: {available, reserved, sold}
-- raffle_status: {active, completed, cancelled}

-- ============================================
-- 2. VERIFICAR TABLAS
-- ============================================

SELECT 'TABLAS' as verificacion, '✓ Verificando tablas creadas...' as estado;

SELECT
  tablename as tabla,
  schemaname as schema,
  hasindexes as tiene_indices,
  rowsecurity as rls_habilitado
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'raffles', 'raffle_numbers')
ORDER BY tablename;

-- Resultado esperado: 3 tablas con RLS = true

-- ============================================
-- 3. VERIFICAR COLUMNAS
-- ============================================

SELECT 'COLUMNAS' as verificacion, '✓ Verificando estructura de tablas...' as estado;

-- Perfiles
SELECT 'profiles' as tabla, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Rifas
SELECT 'raffles' as tabla, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'raffles'
ORDER BY ordinal_position;

-- Números
SELECT 'raffle_numbers' as tabla, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'raffle_numbers'
ORDER BY ordinal_position;

-- ============================================
-- 4. VERIFICAR ÍNDICES
-- ============================================

SELECT 'INDICES' as verificacion, '✓ Verificando índices...' as estado;

SELECT
  schemaname,
  tablename as tabla,
  indexname as indice,
  indexdef as definicion
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'raffles', 'raffle_numbers')
ORDER BY tablename, indexname;

-- Resultado esperado: ~7-8 índices

-- ============================================
-- 5. VERIFICAR FOREIGN KEYS
-- ============================================

SELECT 'FOREIGN_KEYS' as verificacion, '✓ Verificando relaciones...' as estado;

SELECT
  tc.table_name as tabla,
  kcu.column_name as columna,
  ccu.table_name as tabla_referenciada,
  ccu.column_name as columna_referenciada,
  rc.delete_rule as on_delete
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- Resultado esperado:
-- profiles.id -> auth.users.id (CASCADE)
-- raffles.user_id -> profiles.id (CASCADE)
-- raffle_numbers.raffle_id -> raffles.id (CASCADE)

-- ============================================
-- 6. VERIFICAR TRIGGERS
-- ============================================

SELECT 'TRIGGERS' as verificacion, '✓ Verificando triggers...' as estado;

SELECT
  trigger_name as trigger,
  event_object_table as tabla,
  action_timing as cuando,
  event_manipulation as evento,
  action_statement as accion
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Resultado esperado:
-- update_raffles_updated_at (BEFORE UPDATE)
-- trigger_create_raffle_numbers (AFTER INSERT)
-- on_auth_user_created (AFTER INSERT)

-- ============================================
-- 7. VERIFICAR FUNCIONES
-- ============================================

SELECT 'FUNCIONES' as verificacion, '✓ Verificando funciones...' as estado;

SELECT
  routine_name as funcion,
  routine_type as tipo,
  data_type as tipo_retorno
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'update_updated_at_column',
  'create_raffle_numbers',
  'clean_expired_reservations',
  'handle_new_user'
)
ORDER BY routine_name;

-- Resultado esperado: 4 funciones

-- ============================================
-- 8. VERIFICAR ROW LEVEL SECURITY
-- ============================================

SELECT 'RLS' as verificacion, '✓ Verificando Row Level Security...' as estado;

SELECT
  schemaname,
  tablename as tabla,
  rowsecurity as rls_habilitado
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'raffles', 'raffle_numbers')
ORDER BY tablename;

-- Todas las tablas deben tener rls_habilitado = true

-- ============================================
-- 9. VERIFICAR POLÍTICAS
-- ============================================

SELECT 'POLITICAS' as verificacion, '✓ Verificando políticas de seguridad...' as estado;

SELECT
  schemaname,
  tablename as tabla,
  policyname as politica,
  permissive as tipo,
  roles,
  cmd as comando,
  qual as condicion_using,
  with_check as condicion_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Resultado esperado: ~12 políticas

-- Conteo por tabla:
SELECT
  tablename as tabla,
  COUNT(*) as num_politicas
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Esperado:
-- profiles: ~4 políticas
-- raffles: ~4 políticas
-- raffle_numbers: ~4 políticas

-- ============================================
-- 10. VERIFICAR PERMISOS
-- ============================================

SELECT 'PERMISOS' as verificacion, '✓ Verificando permisos...' as estado;

SELECT
  grantee as rol,
  table_name as tabla,
  string_agg(privilege_type, ', ') as permisos
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
AND grantee IN ('anon', 'authenticated')
AND table_name IN ('profiles', 'raffles', 'raffle_numbers')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

-- Resultado esperado:
-- anon puede SELECT en profiles, raffles
-- anon puede SELECT, UPDATE en raffle_numbers
-- authenticated tiene más permisos

-- ============================================
-- 11. VERIFICAR CONSTRAINTS
-- ============================================

SELECT 'CONSTRAINTS' as verificacion, '✓ Verificando constraints...' as estado;

SELECT
  tc.table_name as tabla,
  tc.constraint_name as constraint,
  tc.constraint_type as tipo,
  cc.check_clause as condicion
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('profiles', 'raffles', 'raffle_numbers')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ============================================
-- 12. TEST BÁSICO DE FUNCIONALIDAD
-- ============================================

SELECT 'TEST' as verificacion, '✓ Ejecutando tests básicos...' as estado;

-- Test: La función de limpieza existe y se puede ejecutar
SELECT clean_expired_reservations();

-- Si no hay error, la función funciona correctamente

-- ============================================
-- 13. RESUMEN FINAL
-- ============================================

SELECT 'RESUMEN' as verificacion, '📊 Resumen de verificación' as titulo;

SELECT
  'Tablas creadas' as item,
  COUNT(*)::text as cantidad,
  '3 esperadas' as esperado
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'raffles', 'raffle_numbers')

UNION ALL

SELECT
  'Políticas RLS' as item,
  COUNT(*)::text as cantidad,
  '~12 esperadas' as esperado
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT
  'Triggers' as item,
  COUNT(*)::text as cantidad,
  '3 esperados' as esperado
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name IN (
  'update_raffles_updated_at',
  'trigger_create_raffle_numbers',
  'on_auth_user_created'
)

UNION ALL

SELECT
  'Funciones' as item,
  COUNT(*)::text as cantidad,
  '4 esperadas' as esperado
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'update_updated_at_column',
  'create_raffle_numbers',
  'clean_expired_reservations',
  'handle_new_user'
)

UNION ALL

SELECT
  'Índices' as item,
  COUNT(*)::text as cantidad,
  '7-8 esperados' as esperado
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'raffles', 'raffle_numbers')

UNION ALL

SELECT
  'ENUMs' as item,
  COUNT(*)::text as cantidad,
  '2 esperados' as esperado
FROM pg_type
WHERE typname IN ('number_status', 'raffle_status');

-- ============================================
-- 14. VALIDACIÓN DE SEGURIDAD
-- ============================================

SELECT 'SEGURIDAD' as verificacion, '🔒 Validando configuración de seguridad...' as titulo;

-- Verificar que RLS esté habilitado en todas las tablas
SELECT
  tablename as tabla,
  CASE
    WHEN rowsecurity THEN '✓ RLS habilitado'
    ELSE '✗ RLS DESHABILITADO - ERROR'
  END as estado
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'raffles', 'raffle_numbers');

-- Verificar que exista política para usuarios públicos en raffle_numbers
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
      AND tablename = 'raffle_numbers'
      AND policyname = 'Anyone can reserve available numbers'
    ) THEN '✓ Política de reservas públicas configurada'
    ELSE '✗ FALTA política de reservas públicas - ERROR'
  END as validacion;

-- ============================================
-- FIN DE LA VERIFICACIÓN
-- ============================================

SELECT
  '✅ VERIFICACIÓN COMPLETA' as resultado,
  'Revisa los resultados arriba para confirmar que todo esté correcto' as instrucciones;
