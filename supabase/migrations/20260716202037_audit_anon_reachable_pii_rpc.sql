-- Backing-RPC fuer den Reachability-Ratchet (16.07.2026, Reachability-Achse).
--
-- Ergaenzt audit_anon_sensitive_grants() (Spalten-NAMEN-Achse) um die Policy-REACHABILITY:
-- eine anon-SELECT-Policy mit einem OR-Zweig, der auth.uid() nicht braucht, laesst true-anon
-- (uid NULL) echte Zeilen sehen. Auf einer Tabelle mit Kontakt-PII = aktives Leck
-- (Fund gutachter_finder_anfragen, Mig 20260716200848). Der Spalten-Namen-Ratchet fing das
-- strukturell nicht (telefon/email/vorname nicht im Muster).
--
-- Diese RPC liefert nur die ROHDATEN (anon-SELECT-Policies auf anon-lesbaren Tabellen mit
-- >=1 Kontakt-PII-Spalte, samt qual). Die Reachability-Heuristik (top-level-OR-Split +
-- uid-Gate-Token) lebt unit-getestet in scripts/lib/anon-reachability-scan.mjs.
-- service_role-only, read-only (pg_catalog + information_schema).
create or replace function public.audit_anon_reachable_pii()
returns table(table_name text, policy_name text, qual text, pii_columns text[])
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.relname::text as table_name,
    p.polname::text as policy_name,
    pg_get_expr(p.polqual, p.polrelid)::text as qual,
    array(
      select col.column_name::text
      from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name = c.relname
        and col.column_name ~* '(email|telefon|phone|mobil|iban|bic|steuernummer|geburt|fuehrerschein|ausweis|kennzeichen|hausnummer|vorname|nachname)'
      order by col.ordinal_position
    ) as pii_columns
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles r on r.oid = any(p.polroles)
  where n.nspname = 'public'
    and r.rolname = 'anon'
    and p.polcmd in ('r', '*')
    and p.polpermissive
    and has_table_privilege('anon', c.oid, 'SELECT')
    and exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = c.relname
        and col.column_name ~* '(email|telefon|phone|mobil|iban|bic|steuernummer|geburt|fuehrerschein|ausweis|kennzeichen|hausnummer|vorname|nachname)'
    );
$$;

revoke all on function public.audit_anon_reachable_pii() from public;
revoke all on function public.audit_anon_reachable_pii() from anon;
revoke all on function public.audit_anon_reachable_pii() from authenticated;
grant execute on function public.audit_anon_reachable_pii() to service_role;
