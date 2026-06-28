-- Task 7 (Spec/Plan 2026-06-27): Backing-RPC fuer den check:claim-view-rls CI-Drift-Guard.
-- Liefert pro Claim-View: enthaelt sie den Row-Gate, referenziert sie v_claim_base
-- (Layer-Views erben den Gate darueber), und ist sie faelschlich anon-lesbar.
-- service_role-only (wie audit_rls_function_grants).
create or replace function public.audit_claim_view_gates()
returns table(view_name text, has_gate boolean, references_base boolean, anon_can_select boolean)
language sql stable security definer set search_path=public as $$
  select c.relname::text,
    position('claim_sichtbar_fuer_aktuellen_user' in pg_get_viewdef(c.oid)) > 0,
    position('v_claim_base' in pg_get_viewdef(c.oid)) > 0,
    has_table_privilege('anon', c.oid, 'SELECT')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
    and c.relname in ('v_claim_base','v_claim_full','v_faelle_mit_aktuellem_termin',
      'faelle_sv_view','faelle_kunde_view','v_claim_phase','v_claim_listing','v_claim_parties_safe');
$$;
revoke execute on function public.audit_claim_view_gates() from anon, authenticated, public;
grant execute on function public.audit_claim_view_gates() to service_role;
