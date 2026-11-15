-- ============================================
-- PRODUCTO: sorteo, imagen del premio, fecha de sorteo y conflictos de pago
-- ============================================
-- Requiere haber ejecutado antes 20261115000002_security_payments.sql.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Qué hace:
--   1. Agrega a `raffles` la imagen del premio, la fecha de sorteo y el
--      resultado del sorteo (número ganador, nombre público y fecha).
--   2. Impide que el organizador escriba el resultado a mano: las columnas
--      del sorteo solo las modifica la función `draw_raffle_winner`.
--   3. Agrega `draw_raffle_winner`, que sortea en el servidor entre los
--      números vendidos o pagados.
--   4. Permite al organizador marcar como resuelto un pago en conflicto
--      (`resolve_payment_conflict`).
--   5. Crea el bucket público `raffle-images` en Supabase Storage con sus
--      políticas (cada usuario escribe solo en su propia carpeta).
-- ============================================

-- ============================================
-- 1. COLUMNAS
-- ============================================

-- Todas son públicas (la tabla `raffles` se lee completa con la anon key):
-- no guardar acá datos de contacto del ganador.
ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS draw_date DATE,
  ADD COLUMN IF NOT EXISTS winning_number INTEGER,
  ADD COLUMN IF NOT EXISTS winner_display_name TEXT,
  ADD COLUMN IF NOT EXISTS drawn_at TIMESTAMPTZ;

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE raffles DROP CONSTRAINT IF EXISTS raffles_image_url_check;
ALTER TABLE raffles
  ADD CONSTRAINT raffles_image_url_check
  CHECK (image_url IS NULL OR (image_url ~ '^https?://' AND length(image_url) <= 1000));

-- Un talonario sorteado queda finalizado: no se puede reabrir.
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS raffles_drawn_is_completed_check;
ALTER TABLE raffles
  ADD CONSTRAINT raffles_drawn_is_completed_check
  CHECK (
    (winning_number IS NULL AND winner_display_name IS NULL AND drawn_at IS NULL) OR
    (winning_number IS NOT NULL AND drawn_at IS NOT NULL AND status::text = 'completed')
  );

-- ============================================
-- 2. RAFFLES: el organizador no puede escribir el resultado del sorteo
-- ============================================

-- La lectura sigue siendo completa. La escritura pasa a ser por columna, sin
-- incluir winning_number / winner_display_name / drawn_at.
REVOKE INSERT, UPDATE ON raffles FROM anon, authenticated;
GRANT INSERT (user_id, title, description, price_per_number, total_numbers, whatsapp_number, image_url, draw_date)
  ON raffles TO authenticated;
GRANT UPDATE (title, description, price_per_number, whatsapp_number, status, image_url, draw_date)
  ON raffles TO authenticated;

-- ============================================
-- 3. SORTEO
-- ============================================

-- Nombre que se muestra públicamente: primer nombre + inicial del apellido.
-- Si el "nombre" parece un email o un teléfono, no se muestra.
CREATE OR REPLACE FUNCTION format_winner_name(p_buyer_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_parts TEXT[];
  v_first TEXT;
  v_last TEXT;
BEGIN
  v_parts := regexp_split_to_array(btrim(COALESCE(p_buyer_name, '')), '\s+');
  v_first := v_parts[1];

  IF v_first IS NULL OR v_first = '' OR p_buyer_name ~ '@' OR p_buyer_name ~ '\d{5,}' THEN
    RETURN 'Participante';
  END IF;

  v_first := left(v_first, 30);

  IF array_length(v_parts, 1) > 1 THEN
    v_last := v_parts[array_length(v_parts, 1)];
    RETURN v_first || ' ' || upper(left(v_last, 1)) || '.';
  END IF;

  RETURN v_first;
END;
$$;

REVOKE EXECUTE ON FUNCTION format_winner_name(TEXT) FROM PUBLIC, anon, authenticated;

-- Sortea un ganador entre los números vendidos o pagados. Solo la puede
-- ejecutar el organizador, una única vez por talonario.
CREATE OR REPLACE FUNCTION draw_raffle_winner(p_raffle_id UUID)
RETURNS raffles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raffle raffles%ROWTYPE;
  v_number INTEGER;
  v_buyer_name TEXT;
BEGIN
  -- FOR UPDATE: dos sorteos simultáneos no pueden elegir dos ganadores.
  SELECT * INTO v_raffle FROM raffles WHERE id = p_raffle_id FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR v_raffle.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Solo el organizador puede realizar el sorteo';
  END IF;
  IF v_raffle.winning_number IS NOT NULL THEN
    RAISE EXCEPTION 'Este talonario ya fue sorteado';
  END IF;
  IF v_raffle.status::text = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede sortear un talonario cancelado';
  END IF;

  -- gen_random_uuid() usa el generador criptográfico de Postgres
  -- (random() es predecible).
  SELECT n.number, n.buyer_name INTO v_number, v_buyer_name
  FROM raffle_numbers n
  WHERE n.raffle_id = p_raffle_id
    AND n.status::text IN ('sold', 'paid')
  ORDER BY gen_random_uuid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay números vendidos para sortear';
  END IF;

  UPDATE raffles
  SET winning_number = v_number,
      winner_display_name = format_winner_name(v_buyer_name),
      drawn_at = now(),
      status = 'completed'
  WHERE id = p_raffle_id
  RETURNING * INTO v_raffle;

  RETURN v_raffle;
END;
$$;

REVOKE EXECUTE ON FUNCTION draw_raffle_winner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION draw_raffle_winner(UUID) TO authenticated;

-- ============================================
-- 4. CONFLICTOS DE PAGO: marcar como resuelto
-- ============================================

-- El organizador ya devolvió el dinero o asignó otro número. La orden sigue
-- en estado 'conflict' (queda el registro) pero deja de mostrarse como pendiente.
CREATE OR REPLACE FUNCTION resolve_payment_conflict(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE payment_orders o
  SET resolved_at = now(),
      updated_at = now()
  FROM raffles r
  WHERE o.id = p_order_id
    AND r.id = o.raffle_id
    AND r.user_id = auth.uid()
    AND o.status = 'conflict'
    AND o.resolved_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró un pago en conflicto pendiente';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_payment_conflict(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_payment_conflict(UUID) TO authenticated;

-- ============================================
-- 5. STORAGE: imágenes de los premios
-- ============================================

-- Bucket público (se lee por URL sin login), solo imágenes, hasta 5 MB.
-- Cada usuario sube, reemplaza y borra únicamente dentro de la carpeta con su
-- propio id: raffle-images/<user_id>/<archivo>.
-- No hay política de SELECT pública a propósito: las URLs públicas no la
-- necesitan y evitarla impide listar los archivos de otros usuarios.
-- Si el esquema `storage` no existe (por ejemplo en una base de pruebas),
-- avisa y sigue.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Esquema storage no disponible: no se creó el bucket raffle-images';
    RETURN;
  END IF;

  EXECUTE $sql$
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('raffle-images', 'raffle-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
  $sql$;

  EXECUTE $sql$DROP POLICY IF EXISTS "Raffle images: owners can view own folder" ON storage.objects$sql$;
  EXECUTE $sql$
    CREATE POLICY "Raffle images: owners can view own folder"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'raffle-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  $sql$;

  EXECUTE $sql$DROP POLICY IF EXISTS "Raffle images: owners can upload to own folder" ON storage.objects$sql$;
  EXECUTE $sql$
    CREATE POLICY "Raffle images: owners can upload to own folder"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'raffle-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  $sql$;

  EXECUTE $sql$DROP POLICY IF EXISTS "Raffle images: owners can update own folder" ON storage.objects$sql$;
  EXECUTE $sql$
    CREATE POLICY "Raffle images: owners can update own folder"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'raffle-images' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'raffle-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  $sql$;

  EXECUTE $sql$DROP POLICY IF EXISTS "Raffle images: owners can delete from own folder" ON storage.objects$sql$;
  EXECUTE $sql$
    CREATE POLICY "Raffle images: owners can delete from own folder"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'raffle-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  $sql$;
END $$;
