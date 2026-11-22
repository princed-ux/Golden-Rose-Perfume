
-- Golden Rose Perfume
-- Fix invalid UUID session validation in inventory summary.
-- Already applied to hosted Supabase. Do not execute again manually.
-- Preserves the existing function's calculations and permissions.

DO $migration$
DECLARE
  source_definition text;

  original_pattern text :=
    '^[0-9a-f]{8}' ||
    repeat('-[0-9a-f]{4}', 5) ||
    '-[0-9a-f]{12}$';

  correct_pattern text :=
    '^[0-9a-f]{8}' ||
    repeat('-[0-9a-f]{4}', 3) ||
    '-[0-9a-f]{12}$';
BEGIN
  SELECT pg_get_functiondef(
    'public.gr_workspace_inventory_summary()'::regprocedure
  )
  INTO source_definition;

  IF source_definition IS NULL
    OR (
      length(source_definition) -
      length(replace(source_definition, original_pattern, ''))
    ) <> length(original_pattern)
  THEN
    RAISE EXCEPTION
      'The installed session-validation pattern differs; no changes applied';
  END IF;

  EXECUTE replace(
    source_definition,
    original_pattern,
    correct_pattern
  );
END;
$migration$;

NOTIFY pgrst, 'reload schema';
