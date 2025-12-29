-- ============================================
-- MIGRACIÓN: Agregar estado "paid"
-- ============================================
-- Este script agrega el estado "paid" para números que fueron
-- pagados con Mercado Pago pero esperan confirmación del owner
-- ============================================

-- Nota: En PostgreSQL, los tipos ENUM no se pueden modificar directamente
-- Si ya tienes un constraint CHECK, primero necesitas eliminarlo y recrearlo

-- 1. Eliminar constraint existente si existe
ALTER TABLE raffle_numbers
DROP CONSTRAINT IF EXISTS raffle_numbers_status_check;

-- 2. Agregar nuevo constraint con el estado "paid"
ALTER TABLE raffle_numbers
ADD CONSTRAINT raffle_numbers_status_check
CHECK (status IN ('available', 'reserved', 'paid', 'sold'));

select * from raffle_numbers;

SELECT unnest(enum_range(NULL::number_status));
ALTER TYPE number_status ADD VALUE 'paid';

-- 3. Agregar índice para búsquedas rápidas por estado
CREATE INDEX IF NOT EXISTS idx_raffle_numbers_status
ON raffle_numbers(status);

-- 4. Agregar índice compuesto para consultas del owner
CREATE INDEX IF NOT EXISTS idx_raffle_numbers_raffle_status
ON raffle_numbers(raffle_id, status);

-- Verificación
-- SELECT DISTINCT status FROM raffle_numbers;
