
-- Golden Rose Perfume
-- Owner-managed product photography
--
-- Run once, after testing against a disposable database.
-- Does not publish products, modify stock or alter POS sales.
-- Requires the existing Golden Rose product and staff schemas.

BEGIN;

CREATE OR REPLACE FUNCTION
  golden_rose_catalogue.media_owner_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  session_text text := auth.jwt()->>'session_id';
  session_claim uuid;
  permitted boolean := false;
BEGIN
  IF actor IS NULL
    OR coalesce(session_text, '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN
    RETURN false;
  END IF;

  session_claim := session_text::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions session
    WHERE session.id = session_claim
      AND session.user_id = actor
  ) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM golden_rose.staff_members staff
    JOIN auth.users identity
      ON identity.id = staff.user_id
    WHERE staff.user_id = actor
      AND staff.role IN ('owner', 'manager')
      AND staff.status = 'active'
      AND staff.revoked_at IS NULL
      AND identity.email_confirmed_at IS NOT NULL
      AND NOT coalesce(identity.is_anonymous, false)
      AND (
        identity.banned_until IS NULL
        OR identity.banned_until <= now()
      )
  )
  INTO permitted;

  IF NOT permitted THEN
    RETURN false;
  END IF;

  IF public.gr_employee_session_allowed(
    actor,
    session_claim
  ) IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF public.gr_employee_password_state()
    IS DISTINCT FROM 'none' THEN
    RETURN false;
  END IF;

  RETURN true;

EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$function$;

REVOKE ALL
  ON FUNCTION golden_rose_catalogue.media_owner_allowed()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION golden_rose_catalogue.media_owner_allowed()
  TO authenticated;

-- The bucket already exists in Golden Rose.
-- Apply an explicit maximum size consistent with the UI.

UPDATE storage.buckets
SET
  file_size_limit = 4000000,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
  ]::text[]
WHERE id = 'golden-rose-products';

-- PERMISSIVE policies provide the permissions required
-- to upload, read metadata and delete owner-managed photos.

CREATE POLICY "GR product photos owner insert"
ON storage.objects
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'golden-rose-products'
  AND golden_rose_catalogue.media_owner_allowed()
  AND name ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
);

CREATE POLICY "GR product photos owner select"
ON storage.objects
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  bucket_id = 'golden-rose-products'
  AND golden_rose_catalogue.media_owner_allowed()
);

CREATE POLICY "GR product photos owner delete"
ON storage.objects
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  bucket_id = 'golden-rose-products'
  AND golden_rose_catalogue.media_owner_allowed()
);

-- Restrictive policies prevent other permissive policies
-- from unintentionally granting customer write access
-- to this product-photo bucket in the future.

CREATE POLICY "GR product photos insert guard"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id <> 'golden-rose-products'
  OR (
    golden_rose_catalogue.media_owner_allowed()
    AND name ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
  )
);

CREATE POLICY "GR product photos update guard"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  bucket_id <> 'golden-rose-products'
  OR golden_rose_catalogue.media_owner_allowed()
)
WITH CHECK (
  bucket_id <> 'golden-rose-products'
  OR golden_rose_catalogue.media_owner_allowed()
);

CREATE POLICY "GR product photos delete guard"
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  bucket_id <> 'golden-rose-products'
  OR golden_rose_catalogue.media_owner_allowed()
);

-- A storage object must not be associated with
-- multiple products.

CREATE UNIQUE INDEX IF NOT EXISTS
  gr_product_images_storage_path_unique
ON golden_rose.product_images(storage_path);

-- Attach or remove product-image records.
-- The server must upload the actual file first.
-- The database independently checks the staff role,
-- product identity, file type, file size and gallery limit.

CREATE OR REPLACE FUNCTION public.gr_manage_product_media(
  p_action text,
  p_product_id uuid,
  p_storage_path text,
  p_alt_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  image_count integer := 0;
  next_sort integer := 0;
  product_name text;
  gallery jsonb := '[]'::jsonb;
BEGIN
  IF NOT golden_rose_catalogue.media_owner_allowed() THEN
    RAISE EXCEPTION
      'Owner or manager access required.'
      USING ERRCODE = 'GR403';
  END IF;

  IF p_action IS NULL
    OR p_action NOT IN ('attach', 'remove')
    OR p_product_id IS NULL
    OR p_storage_path IS NULL
    OR length(p_storage_path) > 255
    OR p_storage_path !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
    OR left(p_storage_path, 37) <>
      p_product_id::text || '/'
    OR length(coalesce(p_alt_text, '')) > 180
  THEN
    RAISE EXCEPTION
      'Invalid product photo request.'
      USING ERRCODE = 'GR422';
  END IF;

  SELECT name
  INTO product_name
  FROM golden_rose.products
  WHERE id = p_product_id
    AND is_active
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'The product does not exist or is inactive.'
      USING ERRCODE = 'GR404';
  END IF;

  IF p_action = 'attach' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = 'golden-rose-products'
        AND object.name = p_storage_path
        AND lower(
          coalesce(object.metadata->>'mimetype', '')
        ) IN (
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/avif'
        )
        AND coalesce(
          nullif(object.metadata->>'size', '')::bigint,
          0
        ) BETWEEN 1 AND 4000000
    ) THEN
      RAISE EXCEPTION
        'Upload a valid product photo before attaching it.'
        USING ERRCODE = 'GR422';
    END IF;

    SELECT
      count(*),
      coalesce(max(sort_order), -1) + 1
    INTO image_count, next_sort
    FROM golden_rose.product_images
    WHERE product_id = p_product_id;

    IF image_count >= 8 THEN
      RAISE EXCEPTION
        'Each product supports up to eight photos.'
        USING ERRCODE = 'GR409';
    END IF;

    INSERT INTO golden_rose.product_images (
      product_id,
      storage_path,
      alt_text,
      sort_order
    )
    VALUES (
      p_product_id,
      p_storage_path,
      coalesce(
        nullif(trim(p_alt_text), ''),
        product_name
      ),
      next_sort
    );

  ELSE
    DELETE FROM golden_rose.product_images
    WHERE product_id = p_product_id
      AND storage_path = p_storage_path;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'The photograph is no longer attached.'
        USING ERRCODE = 'GR404';
    END IF;
  END IF;

  UPDATE golden_rose.products
  SET updated_at = clock_timestamp()
  WHERE id = p_product_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'storagePath', photo.storage_path,
        'altText', photo.alt_text
      )
      ORDER BY
        photo.sort_order,
        photo.created_at,
        photo.id
    ),
    '[]'::jsonb
  )
  INTO gallery
  FROM golden_rose.product_images photo
  WHERE photo.product_id = p_product_id;

  RETURN jsonb_build_object(
    'images',
    gallery
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION
      'This photograph is already attached.'
      USING ERRCODE = 'GR409';
END;
$function$;

REVOKE ALL
  ON FUNCTION public.gr_manage_product_media(
    text, uuid, text, text
  )
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION public.gr_manage_product_media(
    text, uuid, text, text
  )
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
