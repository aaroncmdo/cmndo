-- Makler-Suche (global-suche Slice 2c) — consent-gegatete SECURITY-DEFINER-RPC.
--
-- Problem: search_global ist SECURITY INVOKER; Makler haben KEIN claims-RLS -> die drei
-- Claim-Zweige liefern fuer Makler 0 Treffer. Der Lead-Zweig liefert zwar (via leads-RLS
-- ueber promotion_code), aber routeForEntity schickt Lead-Treffer nach /dispatch/leads/[id]
-- (403 fuer Makler). Ergo: Makler konnte seine eigenen Faelle nicht finden.
--
-- Loesung (idiomatisch, KEINE Makler-claims-RLS — die waere zu breit und spraengte den
-- makler_fall_consent.scope): eine DEFINER-RPC, die STRIKT auf die konsentierten Faelle des
-- aufrufenden Maklers scoped und NUR sichere Anzeige-Spalten liefert.
--
-- Scope-Treue: consent_scope ('vollzugriff' vs 'minimal') staffelt in getMaklerFallDetail nur
-- die KONTAKT-PII des Geschaedigten (Telefon/Email/Adresse). Die hier gematchten/rueckgegebenen
-- Felder (claim_nummer, Kennzeichen, Name des Beteiligten, Schadenort) zeigt die Detail-View bei
-- JEDEM aktiven Consent (minimal = 'nur Name') -> die Suche leakt nichts, was die Detail-View
-- verbirgt. Es werden NIE interne Spalten (interne_notizen/lead_preis/honorar) beruehrt.
--
-- id = fall_id (nicht claim_id): routeForEntity('claim','<id>','makler') -> /makler/akten/<id>,
-- und getMaklerFallDetail keyt auf fall_id. Damit kein claim_id->fall_id-Aufloeser noetig.

create or replace function public.search_makler(q text, limit_per_type integer default 6)
returns table(entity_type text, id uuid, label text, sub text, status text, score real)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_makler_id uuid;
begin
  if length(coalesce(q,'')) < 2 then return; end if;

  -- Strikte Selbst-Gatung: Aufrufer MUSS ein Makler sein (sonst leer). DEFINER -> wir gaten selbst.
  select m.id into v_makler_id from makler m where m.user_id = auth.uid();
  if v_makler_id is null then return; end if;

  return query
  with consented as (
    -- nur nicht-widerrufene Consents des aufrufenden Maklers, nur konvertierte Faelle (claim vorhanden)
    select distinct mfc.claim_id, mfc.fall_id
    from makler_fall_consent mfc
    where mfc.makler_id = v_makler_id
      and mfc.widerrufen_am is null
      and mfc.claim_id is not null
      and mfc.fall_id is not null
  )
  select * from (
    -- Fall via claim_nummer / Schadenort
    select 'claim'::text, con.fall_id, c.claim_nummer::text,
           c.schadenort_ort::text, c.operative_status::text,
           greatest(similarity(coalesce(c.claim_nummer,''), q),
                    similarity(coalesce(c.schadenort_ort,''), q))::real as s
    from consented con join claims c on c.id = con.claim_id
    where c.claim_nummer % q or c.schadenort_ort % q
    union
    -- Fahrzeug -> Fall (Kennzeichen)
    select 'claim'::text, con.fall_id, v.kennzeichen_aktuell::text, c.claim_nummer::text,
           c.operative_status::text, similarity(coalesce(v.kennzeichen_normalized,''), q)::real as s
    from consented con join claims c on c.id = con.claim_id
    join vehicles v on v.id = c.vehicle_id
    where v.kennzeichen_normalized % q
    union
    -- Person -> Fall (Name/Firma via claim_parties)
    select 'claim'::text, con.fall_id, concat_ws(' ', p.vorname, p.nachname)::text, c.claim_nummer::text,
           c.operative_status::text,
           greatest(similarity(coalesce(p.vorname,''), q),
                    similarity(coalesce(p.nachname,''), q),
                    similarity(coalesce(p.firma,''), q))::real as s
    from consented con join claims c on c.id = con.claim_id
    join claim_parties cp on cp.claim_id = c.id and cp.ist_aktiv
    join personen p on p.id = cp.person_id
    where p.vorname % q or p.nachname % q or p.firma % q
  ) x
  order by s desc
  limit limit_per_type;
end;
$function$;

revoke all on function public.search_makler(text,integer) from public;
grant execute on function public.search_makler(text,integer) to authenticated, anon;

comment on function public.search_makler(text,integer) is
  'Global-Suche fuer Makler: consent-gegatet (makler_fall_consent, nicht widerrufen), nur sichere Anzeige-Spalten, id=fall_id (Route /makler/akten). Ersetzt search_global fuer die Makler-Rolle (die dort 0 Claims + misgeroutete Leads bekaeme).';
