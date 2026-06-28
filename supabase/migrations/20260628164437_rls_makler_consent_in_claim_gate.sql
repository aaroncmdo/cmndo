-- RLS-Haertung Follow-up (28.06., Marker coordination-claim-views-gate-makler-consent-gap):
-- Das Makler-Portal liest Akten via makler_fall_consent (Consent), nicht nur via
-- claims.makler_id (Ownership). Der Consent-Pfad fehlte im Row-Gate -> Makler mit Consent
-- auf eine makler_id-NULL-Akte bekam 0 Rows / 404. Ergaenzt den Consent-Pfad (kanonisch
-- ueber makler_fall_consent.claim_id; fall_id-Fallback nur fuer NULL-claim_id-Legacy).
-- Additiv: grantet nur intendierten Consent-basierten Makler-Zugriff. Re-GRANT nach
-- CREATE OR REPLACE (AAR-921: CREATE OR REPLACE FUNCTION kann Grants resetten).
create or replace function public.claim_sichtbar_fuer_aktuellen_user(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    auth.role() = 'service_role'
    or exists (select 1 from profiles where id = (select auth.uid()) and rolle in ('admin','dispatch'))
    or exists (
      select 1 from claims c where c.id = p_claim_id and (
            c.geschaedigter_user_id = (select auth.uid())
         or is_claim_user_party(c.id)
         or c.sv_id        in (select id from sachverstaendige where profile_id = (select auth.uid()))
         or c.makler_id    in (select id from makler        where user_id    = (select auth.uid()))
         or c.werkstatt_id in (select id from werkstaetten  where user_id    = (select auth.uid()))
         or (exists(select 1 from profiles where id=(select auth.uid()) and rolle='kundenbetreuer')
             and (c.kundenbetreuer_id = (select auth.uid()) or c.kundenbetreuer_id is null))
         or (exists(select 1 from profiles where id=(select auth.uid()) and rolle='kanzlei')
             and c.service_typ = 'komplett')
      ))
    or exists (
      select 1 from makler_fall_consent mfc join makler m on m.id = mfc.makler_id
      where m.user_id = (select auth.uid()) and mfc.widerrufen_am is null
        and (mfc.claim_id = p_claim_id or (mfc.claim_id is null and mfc.fall_id = p_claim_id))
    );
$$;
grant execute on function public.claim_sichtbar_fuer_aktuellen_user(uuid) to authenticated, anon, service_role;
