BEGIN;

-- ========================================================
-- GOLDEN ROSE PERFUME
-- INDIVIDUAL EMPLOYEE PERMISSIONS
-- ========================================================

CREATE TABLE golden_rose_employment.staff_module_access (
    user_id uuid PRIMARY KEY
        REFERENCES golden_rose.staff_members(user_id)
        ON DELETE CASCADE,

    overrides jsonb NOT NULL DEFAULT '{}'::jsonb,

    revision integer NOT NULL DEFAULT 1
        CHECK (revision > 0),

    updated_by uuid NOT NULL,

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT gr_staff_module_access_object
        CHECK (jsonb_typeof(overrides) = 'object')
);

CREATE TABLE golden_rose_employment.staff_module_access_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    employee_id uuid NOT NULL,

    performed_by uuid NOT NULL,

    previous_overrides jsonb NOT NULL,

    new_overrides jsonb NOT NULL,

    revision integer NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gr_staff_module_audit_employee_idx
    ON golden_rose_employment.staff_module_access_audit
        (employee_id, created_at DESC);

ALTER TABLE golden_rose_employment.staff_module_access
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE golden_rose_employment.staff_module_access_audit
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    golden_rose_employment.staff_module_access,
    golden_rose_employment.staff_module_access_audit
FROM PUBLIC, anon, authenticated;

-- ========================================================
-- VERIFIED STAFF CONTEXT
--
-- Reuse the existing employee-session safeguards.
-- Never trust an actor ID supplied by the browser.
-- ========================================================

CREATE OR REPLACE FUNCTION
golden_rose_employment.permission_staff_context()
RETURNS golden_rose.staff_members
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    v_actor uuid := auth.uid();

    v_session_text text :=
        auth.jwt()->>'session_id';

    v_session uuid;

    v_staff golden_rose.staff_members%ROWTYPE;
BEGIN
    IF v_actor IS NULL
       OR coalesce(v_session_text, '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(
           auth.jwt()->>'is_anonymous',
           'false'
       ) = 'true'
    THEN
        RAISE EXCEPTION
            'An authenticated staff session is required.'
            USING ERRCODE = '42501';
    END IF;

    v_session := v_session_text::uuid;

    PERFORM 1
    FROM auth.sessions
    WHERE id = v_session
      AND user_id = v_actor;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'The staff session has expired.'
            USING ERRCODE = '42501';
    END IF;

    PERFORM
        golden_rose_employment.lock_staff_session(
            v_actor,
            v_session
        );

    SELECT staff.*
    INTO v_staff
    FROM golden_rose.staff_members staff
    JOIN auth.users usr
        ON usr.id = staff.user_id
    WHERE staff.user_id = v_actor
      AND staff.status = 'active'
      AND staff.revoked_at IS NULL
      AND usr.email_confirmed_at IS NOT NULL
      AND (
          usr.banned_until IS NULL
          OR usr.banned_until <= now()
      )
    FOR SHARE OF staff;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Active employee access is required.'
            USING ERRCODE = '42501';
    END IF;

    IF v_staff.role <> 'owner' THEN
        PERFORM 1
        FROM golden_rose.locations loc
        WHERE loc.id = v_staff.location_id
          AND loc.is_active
          AND loc.location_type = 'store'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'An active assigned store is required.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN v_staff;
END;
$function$;

-- ========================================================
-- EFFECTIVE ACCESS TO NEW SALES MODULES
--
-- Employees receive no new wholesale or dispatch access
-- automatically. The owner must grant it explicitly.
--
-- The dispatch role restriction preserves the existing
-- stock-selling service's authorization policy.
-- ========================================================

CREATE OR REPLACE FUNCTION
golden_rose_employment.wholesale_module_allowed(
    p_module text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    v_staff golden_rose.staff_members%ROWTYPE;

    v_overrides jsonb;
BEGIN
    IF p_module IS NULL
       OR p_module NOT IN (
           'wholesale',
           'dispatch'
       )
    THEN
        RETURN false;
    END IF;

    v_staff :=
        golden_rose_employment
            .permission_staff_context();

    IF v_staff.role = 'owner' THEN
        RETURN true;
    END IF;

    IF p_module = 'dispatch'
       AND v_staff.role NOT IN (
           'manager',
           'cashier',
           'sales_staff'
       )
    THEN
        RETURN false;
    END IF;

    SELECT access.overrides
    INTO v_overrides
    FROM golden_rose_employment.staff_module_access access
    WHERE access.user_id = v_staff.user_id;

    RETURN coalesce(
        v_overrides->>p_module = 'allow',
        false
    );
END;
$function$;

-- ========================================================
-- OWNER PERMISSION MANAGEMENT RPC
--
-- own:  Read the current employee's overrides.
-- list: Read employee directory and permission revisions.
-- save: Update one employee's overrides.
--
-- Existing modules remain locked to their current
-- role-based policies until their enforcement is migrated.
-- ========================================================

CREATE OR REPLACE FUNCTION public.gr_staff_permissions(
    p_action text,

    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_staff golden_rose.staff_members%ROWTYPE;

    v_employee golden_rose.staff_members%ROWTYPE;

    v_employee_id uuid;

    v_overrides jsonb;

    v_previous jsonb := '{}'::jsonb;

    v_expected_revision integer;

    v_revision integer := 0;

    v_entry record;

    v_items jsonb;
BEGIN
    v_staff :=
        golden_rose_employment
            .permission_staff_context();

    IF p_payload IS NULL
       OR jsonb_typeof(p_payload) <> 'object'
       OR octet_length(p_payload::text) > 16000
    THEN
        RAISE EXCEPTION
            'Invalid permission request.'
            USING ERRCODE = '22023';
    END IF;

    -- Every authenticated employee may read
    -- their own configuration only.

    IF p_action = 'own' THEN
        SELECT access.overrides, access.revision
        INTO v_previous, v_revision
        FROM golden_rose_employment.staff_module_access access
        WHERE access.user_id = v_staff.user_id;

        RETURN jsonb_build_object(
            'ok', true,
            'userId', v_staff.user_id,
            'role', v_staff.role,

            'revision',
                coalesce(v_revision, 0),

            'overrides',
                coalesce(v_previous, '{}'::jsonb),

            'wholesaleAllowed',
                golden_rose_employment
                    .wholesale_module_allowed('wholesale'),

            'dispatchAllowed',
                golden_rose_employment
                    .wholesale_module_allowed('dispatch')
        );
    END IF;

    -- No employee may administer access,
    -- including managers and sales staff.

    IF v_staff.role <> 'owner' THEN
        RAISE EXCEPTION
            'Only the business owner can manage permissions.'
            USING ERRCODE = '42501';
    END IF;

    IF p_action = 'list' THEN
        SELECT coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'userId', employee.user_id,
                    'email', usr.email,

                    'displayName',
                        coalesce(
                            nullif(
                                usr.raw_user_meta_data
                                    ->>'full_name',
                                ''
                            ),
                            usr.email,
                            'Employee'
                        ),

                    'role', employee.role,
                    'status', employee.status,
                    'locationId', employee.location_id,
                    'locationName', loc.name,

                    'revision',
                        coalesce(access.revision, 0),

                    'overrides',
                        coalesce(
                            access.overrides,
                            '{}'::jsonb
                        )
                )
                ORDER BY usr.email, employee.user_id
            ),
            '[]'::jsonb
        )
        INTO v_items
        FROM golden_rose.staff_members employee
        JOIN auth.users usr
            ON usr.id = employee.user_id
        LEFT JOIN golden_rose.locations loc
            ON loc.id = employee.location_id
        LEFT JOIN
            golden_rose_employment.staff_module_access access
            ON access.user_id = employee.user_id
        WHERE employee.role <> 'owner'
          AND employee.revoked_at IS NULL;

        RETURN jsonb_build_object(
            'ok', true,
            'items', v_items,

            'editableModules',
                jsonb_build_array(
                    'wholesale',
                    'dispatch'
                )
        );
    END IF;

    IF p_action <> 'save' THEN
        RAISE EXCEPTION
            'Unsupported permission action.'
            USING ERRCODE = '22023';
    END IF;

    v_employee_id :=
        nullif(p_payload->>'employeeId', '')::uuid;

    v_overrides := p_payload->'overrides';

    IF v_employee_id IS NULL
       OR v_overrides IS NULL
       OR jsonb_typeof(v_overrides) <> 'object'
       OR coalesce(
           p_payload->>'expectedRevision',
           ''
       ) !~ '^[0-9]{1,9}$'
    THEN
        RAISE EXCEPTION
            'Invalid employee permission configuration.'
            USING ERRCODE = '22023';
    END IF;

    v_expected_revision :=
        (p_payload->>'expectedRevision')::integer;

    -- Serialize permission changes against employee
    -- authorization checks and other owner edits.

    SELECT *
    INTO v_employee
    FROM golden_rose.staff_members
    WHERE user_id = v_employee_id
      AND role <> 'owner'
      AND status = 'active'
      AND revoked_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'An active non-owner employee is required.'
            USING ERRCODE = '42501';
    END IF;

    FOR v_entry IN
        SELECT key, value
        FROM jsonb_each(v_overrides)
    LOOP
        IF v_entry.key NOT IN (
               'wholesale',
               'dispatch'
           )
           OR v_entry.value NOT IN (
               '"allow"'::jsonb,
               '"deny"'::jsonb
           )
        THEN
            RAISE EXCEPTION
                'This permission is protected or not yet enabled.'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF v_overrides->>'dispatch' = 'allow'
       AND v_employee.role NOT IN (
           'manager',
           'cashier',
           'sales_staff'
       )
    THEN
        RAISE EXCEPTION
            'Dispatch requires an authorized selling role.'
            USING ERRCODE = '22023';
    END IF;

    SELECT access.overrides, access.revision
    INTO v_previous, v_revision
    FROM golden_rose_employment.staff_module_access access
    WHERE access.user_id = v_employee_id
    FOR UPDATE;

    v_previous :=
        coalesce(v_previous, '{}'::jsonb);

    v_revision :=
        coalesce(v_revision, 0);

    IF v_revision <> v_expected_revision THEN
        RAISE EXCEPTION
            'Permissions changed since this page was opened. Reload before saving.'
            USING ERRCODE = '40001';
    END IF;

    -- Identical saves do not create unnecessary
    -- revisions or duplicate audit entries.

    IF v_previous = v_overrides THEN
        RETURN jsonb_build_object(
            'ok', true,
            'userId', v_employee_id,
            'revision', v_revision,
            'overrides', v_previous
        );
    END IF;

    v_revision := v_revision + 1;

    INSERT INTO
        golden_rose_employment.staff_module_access (
            user_id,
            overrides,
            revision,
            updated_by,
            updated_at
        )
    VALUES (
        v_employee_id,
        v_overrides,
        v_revision,
        v_staff.user_id,
        now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        overrides = EXCLUDED.overrides,
        revision = EXCLUDED.revision,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO
        golden_rose_employment.staff_module_access_audit (
            employee_id,
            performed_by,
            previous_overrides,
            new_overrides,
            revision
        )
    VALUES (
        v_employee_id,
        v_staff.user_id,
        v_previous,
        v_overrides,
        v_revision
    );

    RETURN jsonb_build_object(
        'ok', true,
        'userId', v_employee_id,
        'revision', v_revision,
        'overrides', v_overrides
    );
END;
$function$;

-- ========================================================
-- PRIVILEGES
-- ========================================================

REVOKE ALL ON FUNCTION
    golden_rose_employment.permission_staff_context()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    golden_rose_employment.wholesale_module_allowed(text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.gr_staff_permissions(text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.gr_staff_permissions(text, jsonb)
TO authenticated;

COMMIT;