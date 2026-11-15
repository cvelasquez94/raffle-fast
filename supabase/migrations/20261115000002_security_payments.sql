-- ============================================
-- PASO 2 de 2: seguridad y pagos
-- ============================================
-- Requiere haber ejecutado antes 20261115000001_paid_status.sql.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Qué hace:
--   1. Saca los tokens de Mercado Pago de `profiles` (tabla pública) y los
--      mueve a `mp_credentials`, accesible solo con service role.
--   2. Deja de exponer datos personales: teléfono del organizador y
--      nombre/email/teléfono de los compradores.
--   3. Reemplaza el UPDATE público sobre `raffle_numbers` por la función
--      `reserve_numbers` (atómica, con tope por reserva y por IP).
--   4. Agrega `payment_orders` y `apply_order_payment` para confirmar pagos
--      desde el servidor (webhook de Mercado Pago).
--   5. Libera reservas vencidas automáticamente (pg_cron).
--
-- IMPORTANTE: desplegar las Edge Functions y el frontend nuevo junto con
-- esta migración. El frontend anterior deja de funcionar al aplicarla.
-- ============================================

-- ============================================
-- 1. COLUMNAS
-- ============================================

ALTER TABLE raffle_numbers
  ADD COLUMN IF NOT EXISTS payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS order_id UUID;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mp_connected BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- 2. CREDENCIALES DE MERCADO PAGO (solo service role)
-- ============================================

CREATE TABLE IF NOT EXISTS mp_credentials (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  public_key TEXT,
  mp_user_id TEXT,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mp_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mp_credentials FROM anon, authenticated;

-- `profiles.mp_connected` es el único dato público sobre la conexión.
CREATE OR REPLACE FUNCTION sync_mp_connected()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE profiles SET mp_connected = false WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE profiles SET mp_connected = true WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_mp_connected ON mp_credentials;
CREATE TRIGGER trigger_sync_mp_connected
  AFTER INSERT OR DELETE ON mp_credentials
  FOR EACH ROW
  EXECUTE FUNCTION sync_mp_connected();

-- Migrar los tokens que hoy están en `profiles` y borrar esas columnas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'mp_access_token'
  ) THEN
    EXECUTE $sql$
      INSERT INTO mp_credentials (user_id, access_token, refresh_token, public_key, mp_user_id, connected_at)
      SELECT id, mp_access_token, mp_refresh_token, mp_public_key, mp_user_id, COALESCE(mp_connected_at, now())
      FROM profiles
      WHERE mp_access_token IS NOT NULL
      ON CONFLICT (user_id) DO NOTHING
    $sql$;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_profiles_mp_user_id;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS mp_access_token,
  DROP COLUMN IF EXISTS mp_refresh_token,
  DROP COLUMN IF EXISTS mp_public_key,
  DROP COLUMN IF EXISTS mp_user_id,
  DROP COLUMN IF EXISTS mp_connected_at;

-- Columna vieja (token por rifa, en una tabla de lectura pública). Ya no se usa.
ALTER TABLE raffles
  DROP COLUMN IF EXISTS mercadopago_access_token,
  DROP COLUMN IF EXISTS mercadopago_enabled;

-- Estados temporales del flujo OAuth (evita vincular una cuenta de MP a otro usuario).
CREATE TABLE IF NOT EXISTS mp_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE mp_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mp_oauth_states FROM anon, authenticated;

-- Estado de la conexión del usuario logueado (para el dashboard).
CREATE OR REPLACE FUNCTION get_my_mp_connection()
RETURNS TABLE (connected BOOLEAN, mp_user_id TEXT, connected_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true, c.mp_user_id, c.connected_at
  FROM mp_credentials c
  WHERE c.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION disconnect_mercadopago()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM mp_credentials WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION get_my_mp_connection() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION disconnect_mercadopago() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_mp_connection() TO authenticated;
GRANT EXECUTE ON FUNCTION disconnect_mercadopago() TO authenticated;

-- ============================================
-- 3. PROFILES: solo columnas públicas
-- ============================================

REVOKE SELECT, UPDATE ON profiles FROM anon, authenticated;
GRANT SELECT (id, created_at, full_name, mp_connected) ON profiles TO anon, authenticated;
GRANT UPDATE (full_name, phone) ON profiles TO authenticated;

-- ============================================
-- 4. ÓRDENES DE PAGO
-- ============================================

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  number_ids UUID[] NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  buyer_name TEXT NOT NULL,
  buyer_email TEXT,
  buyer_phone TEXT,
  preference_id TEXT,
  mp_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'conflict')),
  status_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_raffle_id ON payment_orders(raffle_id);
CREATE INDEX IF NOT EXISTS idx_raffle_numbers_order_id ON raffle_numbers(order_id);

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_orders FROM anon, authenticated;
GRANT SELECT ON payment_orders TO authenticated;

DROP POLICY IF EXISTS "Owners can view payment orders" ON payment_orders;
CREATE POLICY "Owners can view payment orders"
  ON payment_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM raffles
      WHERE raffles.id = payment_orders.raffle_id
      AND raffles.user_id = auth.uid()
    )
  );

-- ============================================
-- 5. CONSTRAINT estado/campos, ahora con "paid"
-- ============================================

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.raffle_numbers'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%buyer_name%'
  LOOP
    EXECUTE format('ALTER TABLE raffle_numbers DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- NOT VALID: se aplica a escrituras nuevas sin fallar por filas viejas inconsistentes.
ALTER TABLE raffle_numbers
  ADD CONSTRAINT raffle_numbers_status_fields_check
  CHECK (
    (status::text = 'available' AND buyer_name IS NULL) OR
    (status::text = 'reserved' AND buyer_name IS NOT NULL AND reserved_at IS NOT NULL AND reserved_until IS NOT NULL) OR
    (status::text = 'paid' AND buyer_name IS NOT NULL) OR
    (status::text = 'sold' AND buyer_name IS NOT NULL AND sold_at IS NOT NULL)
  ) NOT VALID;

-- ============================================
-- 6. RESERVAS: función atómica en lugar de UPDATE público
-- ============================================

CREATE TABLE IF NOT EXISTS reservation_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  raffle_id UUID NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservation_log_ip_created ON reservation_log(ip, created_at);

ALTER TABLE reservation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reservation_log FROM anon, authenticated;

-- Límites: 20 números por reserva, 40 números por IP por hora.
CREATE OR REPLACE FUNCTION reserve_numbers_internal(
  p_raffle_id UUID,
  p_number_ids UUID[],
  p_buyer_name TEXT,
  p_buyer_email TEXT,
  p_buyer_phone TEXT,
  p_ip TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_qty INTEGER;
  v_count INTEGER;
  v_recent INTEGER;
  v_raffle_status TEXT;
  v_name TEXT := btrim(COALESCE(p_buyer_name, ''));
  v_email TEXT := NULLIF(btrim(COALESCE(p_buyer_email, '')), '');
  v_phone TEXT := NULLIF(btrim(COALESCE(p_buyer_phone, '')), '');
  v_until TIMESTAMPTZ := now() + interval '24 hours';
BEGIN
  v_ids := ARRAY(SELECT DISTINCT unnest(p_number_ids));
  v_qty := COALESCE(array_length(v_ids, 1), 0);

  IF v_qty = 0 THEN
    RAISE EXCEPTION 'Seleccioná al menos un número';
  END IF;
  IF v_qty > 20 THEN
    RAISE EXCEPTION 'Podés reservar hasta 20 números por vez';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 100 caracteres';
  END IF;
  IF length(COALESCE(v_email, '')) > 254 OR length(COALESCE(v_phone, '')) > 30 THEN
    RAISE EXCEPTION 'Email o teléfono inválido';
  END IF;

  SELECT status::text INTO v_raffle_status FROM raffles WHERE id = p_raffle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El talonario no existe';
  END IF;
  IF v_raffle_status <> 'active' THEN
    RAISE EXCEPTION 'Este talonario ya no acepta reservas';
  END IF;

  IF p_ip IS NOT NULL THEN
    SELECT COALESCE(sum(quantity), 0) INTO v_recent
    FROM reservation_log
    WHERE ip = p_ip AND created_at > now() - interval '1 hour';

    IF v_recent + v_qty > 40 THEN
      RAISE EXCEPTION 'Hiciste demasiadas reservas. Probá de nuevo más tarde.';
    END IF;
  END IF;

  -- Liberar reservas vencidas de este talonario antes de reservar.
  UPDATE raffle_numbers
  SET status = 'available',
      buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL,
      reserved_at = NULL, reserved_until = NULL,
      payment_id = NULL, payment_status = NULL, payment_link = NULL, order_id = NULL
  WHERE raffle_id = p_raffle_id
    AND status = 'reserved'
    AND reserved_until < now();

  UPDATE raffle_numbers
  SET status = 'reserved',
      buyer_name = v_name, buyer_email = v_email, buyer_phone = v_phone,
      reserved_at = now(), reserved_until = v_until,
      payment_id = NULL, payment_status = NULL, payment_link = NULL, order_id = NULL
  WHERE raffle_id = p_raffle_id
    AND id = ANY(v_ids)
    AND status = 'available';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Todo o nada: la excepción revierte también las filas ya actualizadas.
  IF v_count <> v_qty THEN
    RAISE EXCEPTION 'Alguno de los números ya no está disponible. Actualizá la página y elegí de nuevo.';
  END IF;

  INSERT INTO reservation_log (ip, raffle_id, quantity) VALUES (p_ip, p_raffle_id, v_qty);

  RETURN v_until;
END;
$$;

-- Versión pública: toma la IP de los headers del request de PostgREST.
CREATE OR REPLACE FUNCTION reserve_numbers(
  p_raffle_id UUID,
  p_number_ids UUID[],
  p_buyer_name TEXT,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers JSON := NULLIF(current_setting('request.headers', true), '')::json;
  v_ip TEXT := NULLIF(btrim(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1)), '');
BEGIN
  RETURN reserve_numbers_internal(p_raffle_id, p_number_ids, p_buyer_name, p_buyer_email, p_buyer_phone, v_ip);
END;
$$;

REVOKE EXECUTE ON FUNCTION reserve_numbers_internal(UUID, UUID[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_numbers_internal(UUID, UUID[], TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_numbers(UUID, UUID[], TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================
-- 7. CONFIRMACIÓN DE PAGOS (la llaman las Edge Functions)
-- ============================================

CREATE OR REPLACE FUNCTION apply_order_payment(
  p_order_id UUID,
  p_mp_payment_id TEXT,
  p_status TEXT,
  p_status_detail TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order payment_orders%ROWTYPE;
  v_count INTEGER;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_order FROM payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden inexistente';
  END IF;

  -- Idempotente: Mercado Pago reenvía las notificaciones.
  IF v_order.status IN ('approved', 'conflict') THEN
    RETURN v_order.status;
  END IF;

  IF p_status = 'approved' THEN
    -- Marca como pagados los números que siguen reservados para esta orden,
    -- o que quedaron libres porque la reserva venció mientras se pagaba.
    UPDATE raffle_numbers
    SET status = 'paid',
        buyer_name = v_order.buyer_name,
        buyer_email = v_order.buyer_email,
        buyer_phone = v_order.buyer_phone,
        reserved_at = NULL, reserved_until = NULL,
        payment_status = 'approved',
        payment_id = p_mp_payment_id,
        order_id = p_order_id
    WHERE raffle_id = v_order.raffle_id
      AND id = ANY(v_order.number_ids)
      AND (
        (status::text = 'reserved' AND order_id = p_order_id)
        OR status::text = 'available'
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 'conflict': se cobró pero algún número ya lo tiene otra persona.
    -- El organizador lo ve en payment_orders y debe devolver o reasignar.
    v_new_status := CASE
      WHEN v_count = array_length(v_order.number_ids, 1) THEN 'approved'
      ELSE 'conflict'
    END;
  ELSIF p_status IN ('rejected', 'cancelled') THEN
    v_new_status := p_status;
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE payment_orders
  SET status = v_new_status,
      status_detail = p_status_detail,
      mp_payment_id = p_mp_payment_id,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_order_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_order_payment(UUID, TEXT, TEXT, TEXT) TO service_role;

-- Función vieja: SECURITY DEFINER ejecutable por cualquiera. Ya no se usa.
DROP FUNCTION IF EXISTS confirm_payment(TEXT, UUID);

DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow insert payment transactions" ON payment_transactions;
    REVOKE INSERT ON payment_transactions FROM anon, authenticated;
  END IF;
END $$;

-- ============================================
-- 8. RAFFLE_NUMBERS: sin datos personales para el público
-- ============================================

DROP POLICY IF EXISTS "Anyone can reserve available numbers" ON raffle_numbers;

REVOKE SELECT, UPDATE ON raffle_numbers FROM anon, authenticated;
GRANT SELECT (id, created_at, raffle_id, number, status, reserved_at, reserved_until, sold_at)
  ON raffle_numbers TO anon, authenticated;
-- Los dueños siguen editando por la política "Owners can update their raffle numbers".
GRANT UPDATE ON raffle_numbers TO authenticated;

-- Los dueños leen los datos completos (con compradores) por esta función.
CREATE OR REPLACE FUNCTION get_raffle_numbers_for_owner(p_raffle_id UUID)
RETURNS SETOF raffle_numbers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.*
  FROM raffle_numbers n
  JOIN raffles r ON r.id = n.raffle_id
  WHERE n.raffle_id = p_raffle_id
    AND r.user_id = auth.uid()
  ORDER BY n.number;
$$;

REVOKE EXECUTE ON FUNCTION get_raffle_numbers_for_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_raffle_numbers_for_owner(UUID) TO authenticated;

-- ============================================
-- 9. LIBERAR RESERVAS VENCIDAS AUTOMÁTICAMENTE
-- ============================================

CREATE OR REPLACE FUNCTION clean_expired_reservations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE raffle_numbers
  SET status = 'available',
      buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL,
      reserved_at = NULL, reserved_until = NULL,
      payment_id = NULL, payment_status = NULL, payment_link = NULL, order_id = NULL
  WHERE status = 'reserved'
    AND reserved_until < now();

  DELETE FROM reservation_log WHERE created_at < now() - interval '7 days';
  DELETE FROM mp_oauth_states WHERE expires_at < now();
END;
$$;

REVOKE EXECUTE ON FUNCTION clean_expired_reservations() FROM PUBLIC, anon, authenticated;

-- Cada 10 minutos. Si pg_cron no está disponible en el proyecto, avisa y sigue:
-- en ese caso activarlo en Dashboard > Database > Extensions y re-ejecutar este bloque.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'clean-expired-reservations',
    '*/10 * * * *',
    'SELECT public.clean_expired_reservations()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar la limpieza con pg_cron: %', SQLERRM;
END $$;
