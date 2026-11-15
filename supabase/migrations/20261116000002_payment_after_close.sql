-- ============================================
-- Pagos que llegan con el talonario ya cerrado
-- ============================================
-- Requiere 20261115000002_security_payments.sql. Idempotente.
--
-- Si Mercado Pago confirma un pago cuando el talonario ya fue sorteado,
-- finalizado o cancelado, los números NO se marcan como pagados: la orden
-- queda en 'conflict' para que el organizador devuelva el dinero. Antes se
-- marcaban como pagados en un talonario cerrado (incluso después del sorteo).
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
  v_raffle_status TEXT;
  v_count INTEGER;
  v_new_status TEXT;
  v_detail TEXT := p_status_detail;
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
    -- El bloqueo evita que el pago y el sorteo se crucen.
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
      v_new_status := CASE
        WHEN v_count = array_length(v_order.number_ids, 1) THEN 'approved'
        ELSE 'conflict'
      END;
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
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_order_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_order_payment(UUID, TEXT, TEXT, TEXT) TO service_role;
