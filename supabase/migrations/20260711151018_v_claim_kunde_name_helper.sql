-- v_claim_kunde_name: kanonischer Kunde-Name-Resolver (geschaedigter-Party -> personen/firmen),
-- deckungsgleich mit der geschaedigter-Lateral in v_claim_base / v_claim_full.
-- Zweck: v_claim_listing als Namensquelle dienen, damit der Listen-Name == Detail-Name ist
-- (View-Konsistenz kunde-name). Read-only Helper ohne RLS-Praedikat (wird nur intern von
-- bereits gegateten Views konsumiert), daher REVOKE von anon/authenticated.
--
-- DISTINCT ON (claim_id) ... ORDER BY claim_id, reihenfolge, created_at bildet exakt
-- LIMIT 1 der v_claim_base-Lateral nach (erster geschaedigter-Party pro Claim).
create or replace view public.v_claim_kunde_name as
 SELECT kcp.claim_id,
    kpe.vorname AS kunde_vorname,
    kpe.nachname AS kunde_nachname,
    COALESCE(NULLIF(btrim(COALESCE(kfi.name, kpe.firma)), ''::text), NULLIF(btrim(concat_ws(' '::text, kpe.vorname, kpe.nachname)), ''::text)) AS kunde_anzeigename
   FROM ( SELECT DISTINCT ON (claim_parties.claim_id) claim_parties.claim_id,
            claim_parties.person_id,
            claim_parties.firma_id
           FROM claim_parties
          WHERE claim_parties.rolle = 'geschaedigter'::text
          ORDER BY claim_parties.claim_id, claim_parties.reihenfolge, claim_parties.created_at) kcp
     LEFT JOIN personen kpe ON kpe.id = kcp.person_id
     LEFT JOIN firmen kfi ON kfi.id = kcp.firma_id;

revoke all on public.v_claim_kunde_name from anon, authenticated;
