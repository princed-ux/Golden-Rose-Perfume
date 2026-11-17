BEGIN;
CREATE FUNCTION public.gr_staff_session(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM golden_rose.staff_members
  WHERE user_id=p_actor_id AND status='active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('isStaff',false);
  END IF;
  RETURN jsonb_build_object('isStaff',true,'role',v_role);
END;
$$;
REVOKE ALL ON FUNCTION public.gr_staff_session(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gr_staff_session(uuid) TO service_role;
COMMIT;
