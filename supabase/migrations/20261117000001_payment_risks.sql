-- ============================================
-- Comisión visible y riesgos de pagos
-- ============================================
-- Requiere las migraciones anteriores. Idempotente.
--
--   1. `platform_settings`: la comisión de la plataforma pasa a vivir en la
--      base (lectura pública) para poder mostrársela al organizador.
--   2. Desconectar Mercado Pago ya no borra las credenciales en el momento:
--      se marcan como desconectadas y se conservan 3 días, solo para poder
--      confirmar los pagos que estaban en curso.
--   3. `apply_order_payment` entiende devoluciones, contracargos y pagos
--      aprobados por un monto distinto al de la orden.
-- ============================================

-- ============================================
-- 1. CONFIGURACIÓN DE LA PLATAFORMA
-- ============================================

-- Una sola fila. Para cambiar la comisión:
--   UPDATE platform_settings SET marketplace_fee_percent = 4, updated_at = now();
CREATE TABLE IF NOT EXISTS platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  marketplace_fee_percent NUMERIC NOT NULL DEFAULT 5
    CHECK (marketplace_fee_percent >= 0 AND marketplace_fee_percent < 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_settings FROM anon, authenticated;
GRANT SELECT ON platform_settings TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view platform settings" ON platform_settings;
CREATE POLICY "Anyone can view platform settings"
  ON platform_settings
  FOR SELECT
  TO public
  USING (true);

-- ============================================
-- 2. DESCONEXIÓN DE MERCADO PAGO SIN PERDER PAGOS EN CURSO
-- ============================================

ALTER TABLE mp_credentials
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

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
  UPDATE profiles SET mp_connected = (NEW.disconnected_at IS NULL) WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_mp_connected ON mp_credentials;
CREATE TRIGGER trigger_sync_mp_connected
  AFTER INSERT OR UPDATE OR DELETE ON mp_credentials
  FOR EACH ROW
  EXECUTE FUNCTION sync_mp_connected();

CREATE OR REPLACE FUNCTION get_my_mp_connection()
RETURNS TABLE (connected BOOLEAN, mp_user_id TEXT, connected_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true, c.mp_user_id, c.connected_at
  FROM mp_credentials c
  WHERE c.user_id = auth.uid()
    AND c.disconnected_at IS NULL;
$$;

-- Deja de aceptar pagos nuevos al instante (mp_connected = false). El token
-- se borra a los 3 días, cuando ya venció cualquier pago que estuviera en curso.
CREATE OR REPLACE FUNCTION disconnect_mercadopago()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE mp_credentials
  SET disconnected_at = now(), updated_at = now()
  WHERE user_id = auth.uid()
    AND disconnected_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION get_my_mp_connection() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION disconnect_mercadopago() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_mp_connection() TO authenticated;
GRANT EXECUTE ON FUNCTION disconnect_mercadopago() TO authenticated;

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
  DELETE FROM mp_credentials WHERE disconnected_at < now() - interval '3 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION clean_expired_reservations() FROM PUBLIC, anon, authenticated;

-- ============================================
-- 3. DEVOLUCIONES, CONTRACARGOS Y MONTOS DISTINTOS
-- ============================================

ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'conflict', 'refunded'));

-- p_status es el estado del pago en Mercado Pago, más dos que calculan las
-- Edge Functions: 'amount_mismatch' (aprobado por otro monto o moneda) y
-- 'partially_refunded' (aprobado con devolución parcial).
--
-- Estados de la orden:
--   approved  -> números pagados.
--   conflict  -> hay plata de por medio y el organizador tiene que intervenir.
--                status_detail dice por qué: NULL (número ya tomado),
--                'raffle_closed', 'amount_mismatch', 'partially_refunded',
--                'refunded_needs_review', 'charged_back_needs_review'.
--   refunded  -> el dinero volvió al comprador y no queda nada por hacer.
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
  v_raffle_status TEXT;
  v_total INTEGER;
  v_count INTEGER := 0;
  v_new_status TEXT;
  v_detail TEXT := p_status_detail;
  v_resolved_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_order FROM payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden inexistente';
  END IF;

  v_total := array_length(v_order.number_ids, 1);
  v_resolved_at := v_order.resolved_at;

  -- 'refunded' es final.
  IF v_order.status = 'refunded' THEN
    RETURN v_order.status;
  END IF;

  IF p_status IN ('refunded', 'charged_back') THEN
    IF v_order.status = 'approved' THEN
      -- El bloqueo evita cruzarse con el sorteo.
      SELECT status::text INTO v_raffle_status FROM raffles WHERE id = v_order.raffle_id FOR UPDATE;

      IF v_raffle_status = 'active' THEN
        -- Los números que seguían como "pagados" por esta orden vuelven a estar disponibles.
        UPDATE raffle_numbers
        SET status = 'available',
            buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL,
            reserved_at = NULL, reserved_until = NULL, sold_at = NULL,
            payment_id = NULL, payment_status = NULL, payment_link = NULL, order_id = NULL
        WHERE raffle_id = v_order.raffle_id
          AND id = ANY(v_order.number_ids)
          AND order_id = p_order_id
          AND status::text = 'paid';

        GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;

      IF v_count = v_total THEN
        v_new_status := 'refunded';
        v_detail := p_status;
      ELSE
        -- Algún número ya estaba confirmado como vendido, o el talonario cerró:
        -- no se toca nada y el organizador decide.
        v_new_status := 'conflict';
        v_detail := p_status || '_needs_review';
        v_resolved_at := NULL;
      END IF;
    ELSE
      -- Conflicto ya devuelto, o pago que nunca llegó a asignar números.
      v_new_status := 'refunded';
      v_detail := p_status;
      v_resolved_at := COALESCE(v_order.resolved_at, now());
    END IF;

  ELSIF p_status = 'partially_refunded' THEN
    -- Los números no se tocan; el organizador revisa.
    v_new_status := 'conflict';
    v_detail := 'partially_refunded';
    v_resolved_at := NULL;

  ELSIF v_order.status IN ('approved', 'conflict') THEN
    -- Idempotente: Mercado Pago reenvía las notificaciones.
    RETURN v_order.status;

  ELSIF p_status = 'amount_mismatch' THEN
    -- Se cobró, pero no el total de la orden: no se asignan números.
    v_new_status := 'conflict';
    v_detail := 'amount_mismatch';

  ELSIF p_status = 'approved' THEN
    SELECT status::text INTO v_raffle_status FROM raffles WHERE id = v_order.raffle_id FOR UPDATE;

    IF v_raffle_status IS DISTINCT FROM 'active' THEN
      v_new_status := 'conflict';
      v_detail := 'raffle_closed';
    ELSE
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
      v_new_status := CASE WHEN v_count = v_total THEN 'approved' ELSE 'conflict' END;
    END IF;

  ELSIF p_status IN ('rejected', 'cancelled') THEN
    v_new_status := p_status;
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE payment_orders
  SET status = v_new_status,
      status_detail = v_detail,
      mp_payment_id = p_mp_payment_id,
      resolved_at = v_resolved_at,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_order_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_order_payment(UUID, TEXT, TEXT, TEXT) TO service_role;
