-- Políticas de seguridad para permitir reservas públicas
-- Ejecuta este SQL en tu proyecto de Supabase (SQL Editor)

-- Política para permitir que usuarios públicos lean todos los números de rifas
CREATE POLICY "Anyone can view raffle numbers"
ON raffle_numbers
FOR SELECT
TO public
USING (true);

-- Política para permitir que usuarios públicos actualicen números SOLO para reservarlos
-- (cambiar de available a reserved con información del comprador)
CREATE POLICY "Anyone can reserve available numbers"
ON raffle_numbers
FOR UPDATE
TO public
USING (
  status = 'available'
)
WITH CHECK (
  status = 'reserved'
  AND buyer_name IS NOT NULL
  AND reserved_at IS NOT NULL
  AND reserved_until IS NOT NULL
);

-- Política para que los dueños puedan actualizar cualquier número de sus rifas
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

-- Política para permitir que cualquiera vea las rifas
CREATE POLICY "Anyone can view raffles"
ON raffles
FOR SELECT
TO public
USING (true);

-- IMPORTANTE: Si ya existen políticas con estos nombres, primero elimínalas con:
-- DROP POLICY IF EXISTS "Anyone can view raffle numbers" ON raffle_numbers;
-- DROP POLICY IF EXISTS "Anyone can reserve available numbers" ON raffle_numbers;
-- DROP POLICY IF EXISTS "Owners can update their raffle numbers" ON raffle_numbers;
-- DROP POLICY IF EXISTS "Anyone can view raffles" ON raffles;
