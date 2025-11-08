-- ============================================
-- DATOS DE EJEMPLO (SEED DATA)
-- ============================================
-- Este archivo crea datos de prueba para tu aplicación
-- IMPORTANTE: Solo ejecuta esto DESPUÉS de haber ejecutado schema.sql
-- ============================================

-- ============================================
-- NOTA IMPORTANTE SOBRE USUARIOS
-- ============================================
-- Supabase maneja la autenticación de forma especial.
-- Los usuarios se crean a través de la interfaz de Supabase Auth,
-- no directamente en la base de datos.

-- Para crear usuarios de prueba:
-- 1. Ve a Dashboard > Authentication > Add User
-- 2. O regístrate normalmente en la aplicación
-- 3. Luego obtén el UUID del usuario de la tabla auth.users
-- 4. Usa ese UUID en lugar de 'REEMPLAZA-CON-TU-USER-ID' abajo

-- ============================================
-- MÉTODO 1: Crear perfil para usuario existente
-- ============================================

-- Primero, obtén tu user ID ejecutando:
-- SELECT id, email FROM auth.users LIMIT 5;

-- Luego reemplaza 'REEMPLAZA-CON-TU-USER-ID' con el UUID real

-- Ejemplo de perfil (descomenta y reemplaza el ID):
/*
INSERT INTO profiles (id, full_name, phone)
VALUES (
  'REEMPLAZA-CON-TU-USER-ID',
  'Carlos Velasquez',
  '+5491112345678'
)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone;
*/

-- ============================================
-- MÉTODO 2: Crear rifas de ejemplo
-- ============================================

-- Una vez que tengas un perfil, puedes crear rifas de ejemplo:
/*
-- Rifa 1: iPhone
INSERT INTO raffles (
  user_id,
  title,
  description,
  price_per_number,
  total_numbers,
  whatsapp_number,
  status
) VALUES (
  'REEMPLAZA-CON-TU-USER-ID',
  'Rifa iPhone 15 Pro Max 256GB',
  'Sorteo de un iPhone 15 Pro Max nuevo sellado de 256GB. Color: Titanio Natural. Incluye cargador y cable. El sorteo se realizará el 31 de diciembre de 2024 mediante transmisión en vivo.',
  1500.00,
  50,
  '+5491112345678',
  'active'
);

-- Rifa 2: PlayStation 5
INSERT INTO raffles (
  user_id,
  title,
  description,
  price_per_number,
  total_numbers,
  whatsapp_number,
  status
) VALUES (
  'REEMPLAZA-CON-TU-USER-ID',
  'PlayStation 5 + 2 Juegos',
  'PlayStation 5 versión disco nueva + FIFA 24 + Spider-Man 2. El sorteo se realizará cuando se vendan todos los números.',
  2000.00,
  100,
  '+5491112345678',
  'active'
);

-- Rifa 3: Bicicleta
INSERT INTO raffles (
  user_id,
  title,
  description,
  price_per_number,
  total_numbers,
  whatsapp_number,
  status
) VALUES (
  'REEMPLAZA-CON-TU-USER-ID',
  'Bicicleta Mountain Bike',
  'Bicicleta rodado 29, 21 velocidades, frenos a disco. Marca reconocida. Estado: nueva. Sorteo el 15 de enero de 2025.',
  500.00,
  50,
  '+5491112345678',
  'active'
);
*/

-- ============================================
-- MÉTODO 3: Simular algunas ventas/reservas
-- ============================================

-- Primero obtén el ID de una rifa:
-- SELECT id, title FROM raffles LIMIT 1;

-- Luego marca algunos números como vendidos o reservados:
/*
-- Marcar números como vendidos
UPDATE raffle_numbers
SET
  status = 'sold',
  buyer_name = 'Juan Pérez',
  buyer_email = 'juan@ejemplo.com',
  buyer_phone = '+5491123456789',
  sold_at = now()
WHERE raffle_id = 'REEMPLAZA-CON-RAFFLE-ID'
AND number IN (1, 7, 13, 21, 42);

-- Marcar números como reservados (por 24 horas)
UPDATE raffle_numbers
SET
  status = 'reserved',
  buyer_name = 'María García',
  buyer_email = 'maria@ejemplo.com',
  buyer_phone = '+5491187654321',
  reserved_at = now(),
  reserved_until = now() + interval '24 hours'
WHERE raffle_id = 'REEMPLAZA-CON-RAFFLE-ID'
AND number IN (3, 11, 25);

-- Marcar más números reservados
UPDATE raffle_numbers
SET
  status = 'reserved',
  buyer_name = 'Pedro Rodríguez',
  buyer_phone = '+5491156781234',
  reserved_at = now(),
  reserved_until = now() + interval '24 hours'
WHERE raffle_id = 'REEMPLAZA-CON-RAFFLE-ID'
AND number IN (5, 15, 35);
*/

-- ============================================
-- MÉTODO 4: Ver estadísticas de tus rifas
-- ============================================

-- Ejecuta estos queries para ver el estado de tus rifas:

-- Ver todas las rifas con conteo de números por estado
/*
SELECT
  r.id,
  r.title,
  r.status,
  COUNT(CASE WHEN rn.status = 'available' THEN 1 END) as disponibles,
  COUNT(CASE WHEN rn.status = 'reserved' THEN 1 END) as reservados,
  COUNT(CASE WHEN rn.status = 'sold' THEN 1 END) as vendidos,
  r.price_per_number,
  COUNT(CASE WHEN rn.status = 'sold' THEN 1 END) * r.price_per_number as total_recaudado
FROM raffles r
LEFT JOIN raffle_numbers rn ON r.id = rn.raffle_id
GROUP BY r.id, r.title, r.status, r.price_per_number
ORDER BY r.created_at DESC;
*/

-- Ver números vendidos de una rifa específica
/*
SELECT
  number,
  buyer_name,
  buyer_email,
  buyer_phone,
  sold_at
FROM raffle_numbers
WHERE raffle_id = 'REEMPLAZA-CON-RAFFLE-ID'
AND status = 'sold'
ORDER BY number;
*/

-- Ver reservas activas
/*
SELECT
  r.title,
  rn.number,
  rn.buyer_name,
  rn.buyer_phone,
  rn.reserved_at,
  rn.reserved_until,
  CASE
    WHEN rn.reserved_until > now() THEN 'Activa'
    ELSE 'Expirada'
  END as estado_reserva
FROM raffle_numbers rn
JOIN raffles r ON r.id = rn.raffle_id
WHERE rn.status = 'reserved'
ORDER BY rn.reserved_until DESC;
*/

-- ============================================
-- MÉTODO 5: Limpiar datos de prueba
-- ============================================

-- Si quieres eliminar todos los datos de prueba:
/*
-- Eliminar todos los números (se eliminarán automáticamente con las rifas por CASCADE)
-- DELETE FROM raffles WHERE user_id = 'REEMPLAZA-CON-TU-USER-ID';

-- O eliminar solo una rifa específica
-- DELETE FROM raffles WHERE id = 'REEMPLAZA-CON-RAFFLE-ID';
*/

-- ============================================
-- COMANDOS ÚTILES
-- ============================================

-- Limpiar todas las reservas expiradas manualmente:
-- SELECT clean_expired_reservations();

-- Ver todas las tablas:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Ver todas las políticas de seguridad:
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Ver todos los triggers:
-- SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public';
