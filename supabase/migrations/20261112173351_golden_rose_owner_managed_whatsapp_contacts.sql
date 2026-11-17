
BEGIN;

CREATE TABLE golden_rose.whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 80),
  phone_digits text NOT NULL UNIQUE CHECK (phone_digits ~ '^[1-9][0-9]{7,14}$'),
  purpose text NOT NULL DEFAULT 'orders' CHECK (purpose IN ('orders','support','branch')),
  is_active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_primary_requires_active CHECK (NOT is_primary OR is_active)
);
CREATE UNIQUE INDEX whatsapp_one_primary_idx ON golden_rose.whatsapp_numbers((true)) WHERE is_primary;
ALTER TABLE golden_rose.whatsapp_numbers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON golden_rose.whatsapp_numbers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golden_rose.whatsapp_numbers TO service_role;

-- A customer-visible projection: only contacts intentionally enabled for use.
-- This RPC is called through a public Edge Function with server-side credentials.
CREATE FUNCTION public.gr_public_whatsapp_contacts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'primaryId', (SELECT id FROM golden_rose.whatsapp_numbers WHERE is_active AND is_primary LIMIT 1),
    'numbers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'number', phone_digits, 'purpose', purpose, 'isPrimary', is_primary
      ) ORDER BY is_primary DESC, created_at ASC, id), '[]'::jsonb)
      FROM golden_rose.whatsapp_numbers
      WHERE is_active
    )
  );
$$;

-- Owner-only registry includes disabled numbers, but is never public to customers.
CREATE FUNCTION public.gr_owner_whatsapp_contacts(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_numbers jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM golden_rose.staff_members
    WHERE user_id = p_actor_id AND role = 'owner' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active owner permission required' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'label',label,'number',phone_digits,'purpose',purpose,
    'isActive',is_active,'isPrimary',is_primary,'createdAt',created_at,'updatedAt',updated_at
  ) ORDER BY is_primary DESC, created_at, id), '[]'::jsonb)
  INTO v_numbers FROM golden_rose.whatsapp_numbers;
  RETURN jsonb_build_object('numbers',v_numbers);
END;
$$;

-- Mutations are serialized; setting a primary number cannot create two primaries.
CREATE FUNCTION public.gr_owner_manage_whatsapp(
  p_actor_id uuid,
  p_action text,
  p_id uuid DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_phone_digits text DEFAULT NULL,
  p_purpose text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
DECLARE v_active boolean;
DECLARE v_was_primary boolean;
DECLARE v_target uuid;
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM golden_rose.staff_members
    WHERE user_id = p_actor_id AND role = 'owner' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active owner permission required' USING ERRCODE = '42501';
  END IF;

  -- A single-business registry: serialize edits including auto-selection.
  PERFORM pg_catalog.pg_advisory_xact_lock(4876391990::bigint);

  IF p_action = 'create' THEN
    IF p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 2 AND 80
       OR p_phone_digits IS NULL OR p_phone_digits !~ '^[1-9][0-9]{7,14}$'
       OR coalesce(p_purpose,'orders') NOT IN ('orders','support','branch') THEN
      RAISE EXCEPTION 'Invalid WhatsApp label, phone or purpose' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_count FROM golden_rose.whatsapp_numbers;
    IF v_count >= 20 THEN
      RAISE EXCEPTION 'Maximum of 20 WhatsApp contacts' USING ERRCODE = '22023';
    END IF;
    INSERT INTO golden_rose.whatsapp_numbers (
      label,phone_digits,purpose,is_primary,created_by,updated_by
    ) VALUES (
      btrim(p_label),p_phone_digits,coalesce(p_purpose,'orders'),
      NOT EXISTS(SELECT 1 FROM golden_rose.whatsapp_numbers WHERE is_primary),
      p_actor_id,p_actor_id
    ) RETURNING id INTO v_id;

  ELSIF p_action = 'edit' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'Contact ID required' USING ERRCODE='22023'; END IF;
    IF (p_label IS NOT NULL AND length(btrim(p_label)) NOT BETWEEN 2 AND 80)
       OR (p_phone_digits IS NOT NULL AND p_phone_digits !~ '^[1-9][0-9]{7,14}$')
       OR (p_purpose IS NOT NULL AND p_purpose NOT IN ('orders','support','branch')) THEN
      RAISE EXCEPTION 'Invalid WhatsApp contact update' USING ERRCODE='22023';
    END IF;
    UPDATE golden_rose.whatsapp_numbers
    SET label=coalesce(btrim(p_label),label),
        phone_digits=coalesce(p_phone_digits,phone_digits),
        purpose=coalesce(p_purpose,purpose),
        updated_by=p_actor_id,
        updated_at=now()
    WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Contact not found' USING ERRCODE='P0002'; END IF;

  ELSIF p_action = 'set_primary' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'Contact ID required' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM golden_rose.whatsapp_numbers WHERE id=p_id AND is_active) THEN
      RAISE EXCEPTION 'Primary contact must be enabled' USING ERRCODE='22023';
    END IF;
    UPDATE golden_rose.whatsapp_numbers
    SET is_primary=false,updated_at=now(),updated_by=p_actor_id
    WHERE is_primary;
    UPDATE golden_rose.whatsapp_numbers
    SET is_primary=true,updated_at=now(),updated_by=p_actor_id
    WHERE id=p_id;
    v_id:=p_id;

  ELSIF p_action IN ('enable','disable','delete') THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'Contact ID required' USING ERRCODE='22023'; END IF;
    SELECT is_active,is_primary INTO v_active,v_was_primary
    FROM golden_rose.whatsapp_numbers WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found' USING ERRCODE='P0002'; END IF;

    IF p_action = 'enable' THEN
      UPDATE golden_rose.whatsapp_numbers
      SET is_active=true,updated_by=p_actor_id,updated_at=now()
      WHERE id=p_id;
      IF NOT EXISTS (SELECT 1 FROM golden_rose.whatsapp_numbers WHERE is_primary) THEN
        UPDATE golden_rose.whatsapp_numbers SET is_primary=true,updated_by=p_actor_id,updated_at=now()
        WHERE id=p_id;
      END IF;
    ELSIF p_action = 'disable' THEN
      UPDATE golden_rose.whatsapp_numbers
      SET is_active=false,is_primary=false,updated_by=p_actor_id,updated_at=now()
      WHERE id=p_id;
    ELSE
      DELETE FROM golden_rose.whatsapp_numbers WHERE id=p_id;
    END IF;

    IF v_was_primary THEN
      SELECT id INTO v_target FROM golden_rose.whatsapp_numbers
      WHERE is_active AND NOT is_primary ORDER BY created_at,id LIMIT 1;
      IF v_target IS NOT NULL THEN
        UPDATE golden_rose.whatsapp_numbers
        SET is_primary=true,updated_by=p_actor_id,updated_at=now() WHERE id=v_target;
      END IF;
    END IF;
    v_id:=p_id;

  ELSE
    RAISE EXCEPTION 'Unsupported WhatsApp action' USING ERRCODE='22023';
  END IF;

  RETURN jsonb_build_object(
    'action',p_action,'contactId',v_id,
    'primaryId',(SELECT id FROM golden_rose.whatsapp_numbers WHERE is_primary LIMIT 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gr_public_whatsapp_contacts() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_owner_whatsapp_contacts(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_owner_manage_whatsapp(uuid,text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gr_public_whatsapp_contacts() TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_owner_whatsapp_contacts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_owner_manage_whatsapp(uuid,text,uuid,text,text,text) TO service_role;

COMMIT;
