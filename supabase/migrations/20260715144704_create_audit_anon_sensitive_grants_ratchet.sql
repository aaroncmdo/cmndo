-- Grant-Audit-Ratchet (generalisiert): Backing-RPC fuer check:anon-sensitive-grants.
-- Listet anon-lesbare Spalten in public-Basistabellen, deren NAME auf ein sensibles Muster
-- passt (iban/steuer/geburtsdatum/fuehrerschein/kontonummer/access|refresh|session_token/
-- secret/password/encrypted/provision/honorar/notiz). Verallgemeinert den claims-spezifischen
-- audit_claims_column_grants() auf die ganze anon-Grant-Klasse (systematischer Grant-Audit 15.07.).
-- Zweck: Praevention gegen NEUE anon-SELECT-Grants auf sensible Spalten. Die 4 Fixes
-- (claims/auftraege/anon-7/leads) schlossen konkrete Lecks; dieser Ratchet haelt die Klasse
-- dauerhaft zu. Read-only, service_role-only. Semantische False-Positives (Timestamps wie
-- *_provisioned_am, Token-Counts *_tokens) filtert das Node-Script (SEMANTIC_ALLOWLIST),
-- damit FP-Pflege ohne Migration geht.
create or replace function public.audit_anon_sensitive_grants()
returns table(table_name text, column_name text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.relname::text, a.attname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and a.attname ~* '(iban|steuernummer|steuer_id|geburtsdatum|fuehrerschein|kontonummer|(access|refresh|session)_token|_secret|secret_|password_encrypted|password_hash|passwort|_encrypted|provision|honorar|notiz)'
    and has_column_privilege('anon', c.oid, a.attname, 'SELECT')
  order by c.relname, a.attname;
$$;

revoke all on function public.audit_anon_sensitive_grants() from public;
grant execute on function public.audit_anon_sensitive_grants() to service_role;

comment on function public.audit_anon_sensitive_grants() is
  'Grant-Audit-Ratchet: anon-lesbare Spalten mit sensiblem Namensmuster. Backing-RPC fuer check:anon-sensitive-grants (baseline+boy-scout). service_role-only, read-only.';
