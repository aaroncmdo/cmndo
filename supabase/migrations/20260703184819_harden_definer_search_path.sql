-- Security hardening: pin search_path on the last 3 SECURITY DEFINER functions that had a
-- mutable (caller-controlled) search_path. Flagged by the Supabase linter as
-- `function_search_path_mutable`. All three already fully-qualify their public.* tables and
-- only call pg_catalog built-ins, so pinning to `public` (pg_catalog is implicitly searched
-- first) is behavior-preserving and removes the search_path-injection surface. Matches the
-- majority convention (61/90 already-pinned DEFINER funcs use search_path=public).
-- Idempotent: ALTER FUNCTION ... SET is re-runnable.
ALTER FUNCTION public.create_makler_provision() SET search_path = public;
ALTER FUNCTION public.create_werkstatt_provision() SET search_path = public;
ALTER FUNCTION public.sv_lead_upsert(p jsonb) SET search_path = public;
