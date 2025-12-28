-- ============================================
-- MIGRACIÓN: Integración de Mercado Pago
-- ============================================
-- Este script agrega soporte para pagos con Mercado Pago
-- Ejecuta este script en tu proyecto Supabase
-- Dashboard > SQL Editor > New Query > Pega y ejecuta
-- ============================================

-- ============================================
-- 1. AGREGAR CAMPOS DE MERCADO PAGO A RAFFLES
-- ============================================

ALTER TABLE raffles
ADD COLUMN IF NOT EXISTS mercadopago_access_token TEXT,
ADD COLUMN IF NOT EXISTS mercadopago_enabled BOOLEAN DEFAULT false;

-- ============================================
-- 2. AGREGAR CAMPOS DE PAGO A RAFFLE_NUMBERS
-- ============================================

ALTER TABLE raffle_numbers
ADD COLUMN IF NOT EXISTS payment_id TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT,
ADD COLUMN IF NOT EXISTS payment_link TEXT;

-- ============================================
-- 3. CREAR TABLA DE TRANSACCIONES (OPCIONAL)
-- ============================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  raffle_number_id UUID NOT NULL REFERENCES raffle_numbers(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  payer_email TEXT,
  external_reference TEXT,
  metadata JSONB,
  UNIQUE(payment_id)
);

-- ============================================
-- 4. CREAR ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_payment_transactions_raffle_number_id
ON payment_transactions(raffle_number_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id
ON payment_transactions(payment_id);

CREATE INDEX IF NOT EXISTS idx_raffle_numbers_payment_id
ON raffle_numbers(payment_id);

-- ============================================
-- 5. HABILITAR ROW LEVEL SECURITY
-- ============================================

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. POLÍTICAS DE SEGURIDAD
-- ============================================

-- Los propietarios pueden ver las transacciones de sus rifas
CREATE POLICY IF NOT EXISTS "Owners can view payment transactions"
  ON payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM raffle_numbers rn
      JOIN raffles r ON r.id = rn.raffle_id
      WHERE rn.id = payment_transactions.raffle_number_id
      AND r.user_id = auth.uid()
    )
  );

-- Permitir inserción de transacciones (webhook de Mercado Pago)
CREATE POLICY IF NOT EXISTS "Allow insert payment transactions"
  ON payment_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 7. FUNCIÓN PARA CONFIRMAR PAGO
-- ============================================

CREATE OR REPLACE FUNCTION confirm_payment(
  p_payment_id TEXT,
  p_raffle_number_id UUID
)
RETURNS void AS $$
BEGIN
  -- Actualizar el estado del número a vendido
  UPDATE raffle_numbers
  SET
    status = 'sold',
    sold_at = timezone('utc'::text, now()),
    payment_status = 'approved',
    reserved_at = NULL,
    reserved_until = NULL
  WHERE id = p_raffle_number_id
  AND payment_id = p_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. PERMISOS
-- ============================================

GRANT SELECT ON payment_transactions TO authenticated;
GRANT INSERT ON payment_transactions TO authenticated;

-- ============================================
-- FIN DE LA MIGRACIÓN
-- ============================================

-- Para verificar que todo se creó correctamente:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name LIKE 'mercadopago%';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'raffle_numbers' AND column_name LIKE 'payment%';
-- SELECT * FROM pg_tables WHERE tablename = 'payment_transactions';
