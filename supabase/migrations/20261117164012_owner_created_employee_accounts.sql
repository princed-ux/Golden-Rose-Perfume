-- Review after the staff-management migration. No existing accounts are changed.
BEGIN;

CREATE TABLE golden_rose_employment.account_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE golden_rose_employment.password_enrollment (
  user_id uuid PRIMARY KEY REFERENCES golden_rose.staff_members(user_id) ON DELETE CASCADE,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  phase text NOT NULL CHECK (phase IN ('replacing','change_required','complete')),
  fingerprint bytea,
  work_email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now(),
  ready_after timestamptz
);

ALTER TABLE golden_rose_employment.account_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_employment.password_enrollment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON golden_rose_employment.account_provisions, golden_rose_employment.password_enrollment
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION golden_rose_employment.require_rotation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status='active' AND EXISTS (
    SELECT 1 FROM golden_rose_employment.password_enrollment
    WHERE user_id=NEW.user_id AND phase<>'complete'
  ) THEN
    IF TG_OP='UPDATE' AND OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL AND EXISTS (
      SELECT 1 FROM golden_rose_employment.password_enrollment e JOIN auth.users u ON u.id=e.user_id
      WHERE e.user_id=NEW.user_id AND e.phase='change_required' AND u.email_confirmed_at IS NOT NULL
        AND coalesce(u.encrypted_password,'')<>'' AND e.fingerprint<>sha256(convert_to(u.encrypted_password,'UTF8'))
    ) THEN
      -- A rehired employee must still establish a new password.
      UPDATE golden_rose_employment.password_enrollment
      SET phase='complete',fingerprint=NULL,ready_after=clock_timestamp()
      WHERE user_id=NEW.user_id;
    ELSE
      RAISE EXCEPTION 'The employee must change their temporary password before access can be restored.' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION golden_rose_employment.require_rotation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER enforce_staff_password_rotation
  BEFORE INSERT OR UPDATE ON golden_rose.staff_members
  FOR EACH ROW EXECUTE FUNCTION golden_rose_employment.require_rotation();

CREATE FUNCTION golden_rose_employment.check_staff_suspension(p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM golden_rose.staff_members WHERE user_id=auth.uid() AND role='owner' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active owner account is required.' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(109071,3);
  IF EXISTS (
    SELECT 1 FROM golden_rose_employment.password_enrollment e
    JOIN golden_rose.staff_members s ON s.user_id=e.user_id
    WHERE e.user_id=p_target AND e.phase<>'complete' AND s.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This employee is blocked during onboarding. Revoke access to cancel their onboarding.' USING ERRCODE='22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION golden_rose_employment.check_staff_suspension(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION golden_rose_employment.check_staff_suspension(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.gr_staff_manage(p_action text,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_action='suspend' THEN
    PERFORM golden_rose_employment.check_staff_suspension(nullif(p_payload->>'id','')::uuid);
  END IF;
  RETURN golden_rose_employment.manage(p_action,p_payload);
END $$;

-- Only the authenticated application server can call this operation, after verifying the
-- owner token. The owner and target are checked again in the database for every write.
CREATE FUNCTION public.gr_owner_employee_account(p_owner uuid, p_action text, p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient text := lower(btrim(p_payload->>'email'));
  full_name text := btrim(p_payload->>'fullName');
  username_input text := nullif(lower(btrim(p_payload->>'username')),'');
  role_input text := p_payload->>'role';
  store uuid := nullif(p_payload->>'locationId','')::uuid;
  target uuid := nullif(p_payload->>'id','')::uuid;
  requested_version uuid := nullif(p_payload->>'version','')::uuid;
  provision golden_rose_employment.account_provisions%ROWTYPE;
  enrollment golden_rose_employment.password_enrollment%ROWTYPE;
  member golden_rose.staff_members%ROWTYPE;
  identity auth.users%ROWTYPE;
BEGIN
  PERFORM 1 FROM golden_rose.staff_members s JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=p_owner AND s.role='owner' AND s.status='active'
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active, verified owner access is required.' USING ERRCODE='42501'; END IF;
  IF p_action='list' THEN
    RETURN (SELECT coalesce(jsonb_object_agg(e.user_id,
      CASE WHEN e.phase='complete' THEN 'ready'
        WHEN e.phase='change_required' AND e.expires_at<=now() THEN 'expired'
        WHEN e.phase='change_required' AND u.email_confirmed_at IS NULL THEN 'awaiting_verification'
        ELSE e.phase END
    ), '{}') FROM golden_rose_employment.password_enrollment e
      JOIN golden_rose.staff_members s ON s.user_id=e.user_id
      JOIN auth.users u ON u.id=e.user_id
      WHERE s.revoked_at IS NULL);
  END IF;
  -- Share the lock used by the invitation and staff management pipeline.
  PERFORM pg_advisory_xact_lock(109071,3);

  IF p_action IN ('reserve','complete_creation') THEN
    IF coalesce(recipient,'') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' OR length(recipient)>254
      OR coalesce(length(full_name),0) NOT BETWEEN 2 AND 120
      OR (username_input IS NOT NULL AND username_input !~ '^[a-z0-9][a-z0-9._-]{2,31}$')
      OR role_input IS NULL OR role_input NOT IN ('manager','cashier','inventory_staff','sales_staff','accountant')
      OR NOT EXISTS (SELECT 1 FROM golden_rose.locations WHERE id=store AND is_active AND location_type='store')
    THEN RAISE EXCEPTION 'Check the name, work email, username, role and active store.' USING ERRCODE='22023'; END IF;

    SELECT * INTO provision FROM golden_rose_employment.account_provisions WHERE work_email=recipient;
    SELECT * INTO identity FROM auth.users u WHERE lower(u.email)=recipient AND u.email IS NOT NULL LIMIT 1;
    IF identity.id IS NOT NULL AND (provision.id IS NULL OR
        identity.raw_app_meta_data->>'gr_staff_provision' IS DISTINCT FROM provision.id::text)
    THEN RAISE EXCEPTION 'An account already uses this email. Use an employee invitation instead.' USING ERRCODE='22023'; END IF;
    IF provision.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'This employee account already exists. Manage it in the directory.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM golden_rose_employment.profiles WHERE work_email=recipient OR username=username_input)
      OR EXISTS (SELECT 1 FROM golden_rose_employment.invitations WHERE (work_email=recipient OR username=username_input)
        AND expires_at>now() AND accepted_at IS NULL AND cancelled_at IS NULL)
    THEN RAISE EXCEPTION 'An employee or pending invitation already uses that email or username.' USING ERRCODE='22023'; END IF;

    IF p_action='reserve' THEN
      IF provision.id IS NULL THEN
        INSERT INTO golden_rose_employment.account_provisions(work_email) VALUES(recipient) RETURNING * INTO provision;
      END IF;
      RETURN jsonb_build_object('version',provision.id,'userId',identity.id);
    END IF;
    IF provision.id IS NULL OR identity.id IS NULL OR identity.id IS DISTINCT FROM target OR
       coalesce(identity.encrypted_password,'')='' OR coalesce(identity.is_anonymous,false)
    THEN RAISE EXCEPTION 'The Auth account is not linked to this provisioning request.' USING ERRCODE='22023'; END IF;
    IF identity.email_confirmed_at IS NOT NULL
      THEN RAISE EXCEPTION 'Provisioned work emails must be unconfirmed at creation. Check Supabase Auth confirmation settings.' USING ERRCODE='22023'; END IF;
    -- Recover only the Auth user carrying our reservation marker, never a customer.
    INSERT INTO golden_rose.staff_members(user_id,role,status,location_id)
      VALUES(target,role_input,'suspended',store);
    INSERT INTO golden_rose_employment.profiles(user_id,full_name,work_email,username)
      VALUES(target,full_name,recipient,username_input);
    INSERT INTO golden_rose_employment.password_enrollment(user_id,phase,fingerprint,work_email,expires_at,ready_after)
      VALUES(target,'change_required',sha256(convert_to(identity.encrypted_password,'UTF8')),recipient,now()+interval '24 hours',clock_timestamp());
    UPDATE golden_rose_employment.account_provisions SET user_id=target WHERE id=provision.id;
    INSERT INTO golden_rose_employment.events(actor,subject,action,detail)
      VALUES(p_owner,recipient,'account_created',jsonb_build_object('role',role_input,'store',store));
    RETURN jsonb_build_object('email',recipient,'confirmed',identity.email_confirmed_at IS NOT NULL);
  END IF;

  SELECT * INTO member FROM golden_rose.staff_members WHERE user_id=target AND role<>'owner' AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an employee whose access has not been revoked.' USING ERRCODE='22023'; END IF;
  SELECT * INTO identity FROM auth.users WHERE id=target;
  SELECT * INTO enrollment FROM golden_rose_employment.password_enrollment WHERE user_id=target FOR UPDATE;
  IF p_action='confirmation' AND enrollment.phase='change_required' AND enrollment.expires_at>now()
    AND identity.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('email',identity.email);
  END IF;
  IF p_action='begin_reset' THEN
    IF NOT EXISTS (SELECT 1 FROM golden_rose_employment.account_provisions
      WHERE user_id=target AND id::text=identity.raw_app_meta_data->>'gr_staff_provision'
        AND work_email=lower(identity.email)) THEN
      RAISE EXCEPTION 'Only dedicated employee accounts can receive temporary passwords. Other employees should recover their own account by email.' USING ERRCODE='22023';
    END IF;
    IF member.status<>'active' AND coalesce(enrollment.phase,'complete')='complete' THEN
      RAISE EXCEPTION 'Restore this suspended employee separately before replacing their password.' USING ERRCODE='22023';
    END IF;
    IF enrollment.phase='replacing' AND enrollment.expires_at>now() THEN
      RAISE EXCEPTION 'A password replacement is in progress. Wait two minutes before retrying.' USING ERRCODE='22023';
    END IF;
    UPDATE golden_rose.staff_members SET status='suspended',updated_at=now() WHERE user_id=target AND status='active';
    INSERT INTO golden_rose_employment.password_enrollment(user_id,phase,work_email,expires_at,ready_after)
      VALUES(target,'replacing',lower(identity.email),now()+interval '2 minutes',clock_timestamp())
      ON CONFLICT(user_id) DO UPDATE SET version=gen_random_uuid(),phase='replacing',
        fingerprint=NULL,expires_at=excluded.expires_at,ready_after=excluded.ready_after
      RETURNING * INTO enrollment;
    INSERT INTO golden_rose_employment.events(actor,subject,action)
      VALUES(p_owner,identity.email,'password_replacement_started');
    RETURN jsonb_build_object('version',enrollment.version);
  ELSIF p_action='complete_reset' AND enrollment.phase='replacing' AND enrollment.version=requested_version
    AND identity.raw_app_meta_data->>'gr_staff_reset' = requested_version::text THEN
    UPDATE golden_rose_employment.password_enrollment SET phase='change_required',
      fingerprint=sha256(convert_to(identity.encrypted_password,'UTF8')),expires_at=now()+interval '24 hours',ready_after=clock_timestamp()
      WHERE user_id=target;
    INSERT INTO golden_rose_employment.events(actor,subject,action)
      VALUES(p_owner,identity.email,'temporary_password_replaced');
    RETURN jsonb_build_object('email',identity.email,'confirmed',identity.email_confirmed_at IS NOT NULL);
  END IF;
  RAISE EXCEPTION 'This account operation is no longer available.' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.gr_owner_employee_account(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gr_owner_employee_account(uuid,text,jsonb) TO service_role;

CREATE FUNCTION golden_rose_employment.session_allowed(p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM golden_rose_employment.password_enrollment e WHERE e.user_id=p_actor
      AND (e.phase<>'complete' OR NOT EXISTS (
        SELECT 1 FROM auth.sessions a WHERE a.id=p_session AND a.user_id=p_actor AND a.created_at>=e.ready_after
      ))
  )
$$;
REVOKE ALL ON FUNCTION golden_rose_employment.session_allowed(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA golden_rose_employment TO service_role;
GRANT EXECUTE ON FUNCTION golden_rose_employment.session_allowed(uuid,uuid) TO service_role;
CREATE FUNCTION public.gr_employee_session_allowed(p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT golden_rose_employment.session_allowed(p_actor,p_session)
$$;
REVOKE ALL ON FUNCTION public.gr_employee_session_allowed(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gr_employee_session_allowed(uuid,uuid) TO service_role;

-- Hold the staff row until the POS request finishes. Credential eligibility and
-- the existing store, price and stock checks run in the same transaction.
CREATE FUNCTION golden_rose_employment.lock_staff_session(p_actor uuid,p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM golden_rose.staff_members WHERE user_id=p_actor AND status='active' FOR SHARE;
  IF NOT FOUND OR p_session IS NULL OR NOT golden_rose_employment.session_allowed(p_actor,p_session) THEN
    RAISE EXCEPTION 'An active staff session is required.' USING ERRCODE='GR403';
  END IF;
END $$;
REVOKE ALL ON FUNCTION golden_rose_employment.lock_staff_session(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION golden_rose_employment.lock_staff_session(uuid,uuid) TO service_role;

CREATE FUNCTION public.gr_pos_session_request(p_actor_id uuid,p_session_id uuid,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM golden_rose_employment.lock_staff_session(p_actor_id,p_session_id);
  IF p_action='checkout' THEN
    RETURN public.gr_pos_checked_checkout(p_actor_id,p_payload);
  ELSIF p_action IN ('catalog','receipt') THEN
    RETURN public.gr_pos_register(p_actor_id,p_action,p_payload);
  END IF;
  RAISE EXCEPTION 'Unsupported POS action.' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.gr_pos_session_request(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gr_pos_session_request(uuid,uuid,text,jsonb) TO service_role;

CREATE FUNCTION golden_rose_employment.password_state(actor uuid,token_session uuid,p_finish boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  member golden_rose.staff_members%ROWTYPE;
  enrollment golden_rose_employment.password_enrollment%ROWTYPE;
  identity auth.users%ROWTYPE;
BEGIN
  IF actor IS NULL OR token_session IS NULL THEN RETURN 'denied'; END IF;
  SELECT * INTO enrollment FROM golden_rose_employment.password_enrollment WHERE user_id=actor;
  IF NOT FOUND THEN RETURN 'none'; END IF;
  IF enrollment.phase='complete' THEN
    RETURN CASE WHEN golden_rose_employment.session_allowed(actor,token_session) THEN 'none' ELSE 'denied' END;
  END IF;
  IF p_finish THEN
    PERFORM pg_advisory_xact_lock(109071,3);
    SELECT * INTO enrollment FROM golden_rose_employment.password_enrollment WHERE user_id=actor FOR UPDATE;
  END IF;
  SELECT * INTO identity FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL
    AND lower(email)=enrollment.work_email
    AND NOT coalesce(is_anonymous,false) AND (banned_until IS NULL OR banned_until<=now());
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id=token_session AND user_id=actor AND created_at>=enrollment.ready_after)
    THEN RETURN 'denied'; END IF;
  SELECT * INTO member FROM golden_rose.staff_members WHERE user_id=actor AND role<>'owner' AND revoked_at IS NULL;
  IF NOT FOUND OR member.status<>'suspended' THEN RETURN 'denied'; END IF;
  IF enrollment.phase<>'change_required' OR enrollment.expires_at<=now() THEN RETURN 'expired'; END IF;
  IF NOT p_finish THEN RETURN 'change_required'; END IF;
  IF enrollment.fingerprint IS NULL OR coalesce(identity.encrypted_password,'')='' OR
      enrollment.fingerprint=sha256(convert_to(identity.encrypted_password,'UTF8')) THEN RETURN 'change_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM golden_rose.locations WHERE id=member.location_id AND is_active AND location_type='store')
    THEN RETURN 'store_unavailable'; END IF;
  UPDATE golden_rose_employment.password_enrollment SET phase='complete',fingerprint=NULL,ready_after=clock_timestamp()
    WHERE user_id=actor;
  UPDATE golden_rose.staff_members SET status='active',updated_at=now() WHERE user_id=actor;
  INSERT INTO golden_rose_employment.events(actor,subject,action)
    VALUES(actor,identity.email,'password_changed');
  RETURN 'complete';
END $$;
REVOKE ALL ON FUNCTION golden_rose_employment.password_state(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.gr_employee_password_state()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT golden_rose_employment.password_state(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,false)
$$;
REVOKE ALL ON FUNCTION public.gr_employee_password_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gr_employee_password_state() TO authenticated;
CREATE FUNCTION public.gr_employee_password_complete(p_actor uuid,p_session uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT golden_rose_employment.password_state(p_actor,p_session,true)
$$;
REVOKE ALL ON FUNCTION public.gr_employee_password_complete(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gr_employee_password_complete(uuid,uuid) TO service_role;

COMMIT;
