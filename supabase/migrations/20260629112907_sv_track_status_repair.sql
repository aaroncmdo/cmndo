-- SV-Track Daten-Repair (29.06.2026).
-- Behebt operative_status-Inkonsistenzen (Status ueber den Fakten) + quarantaeniert einen
-- Test-Self-Service-Claim auf den Smoke-SV. Idempotent + no-op auf frischen DBs.
-- Befund: 59 Claims auf 'sv-termin' OHNE irgendeinen gutachter_termin (seed-/at-creation-
-- gesetzt) + CLM-2026-00278 (ruby24 = Test-Self-Service-Signup) ohne SV.
-- Trigger-Check (pg_trigger): bei operative_status/sv_id-Update feuert NUR trg_claims_updated_at
-- (harmlos) -> kein Notification-Trigger -> kein echter Gutachter wird benachrichtigt.

-- (1) operative_status='sv-termin' OHNE echten gutachter_termin -> auf faktischen Stand zurueck.
--     Alle betroffenen haben sv_id (kein Gutachten/Filmcheck) -> sv-zugewiesen.
update claims
set operative_status = 'sv-zugewiesen', updated_at = now()
where operative_status = 'sv-termin'
  and sv_id is not null
  and not exists (select 1 from gutachter_termine t where t.claim_id = claims.id)
  and not exists (select 1 from gutachten g where g.claim_id = claims.id and g.fertiggestellt_am is not null);

-- (1b) Defensiv: sv-termin ohne Termin UND ohne sv -> ersterfassung (aktuell 0, aber robust).
update claims
set operative_status = 'ersterfassung', updated_at = now()
where operative_status = 'sv-termin'
  and sv_id is null
  and not exists (select 1 from gutachter_termine t where t.claim_id = claims.id)
  and not exists (select 1 from gutachten g where g.claim_id = claims.id and g.fertiggestellt_am is not null);

-- (2) CLM-2026-00278 (ruby24 = Test-Self-Service: Fake-Telefon, null Schadentyp, 34s-Auto-
--     Konversion) dem Smoke-SV zuweisen. Smoke-SV per Email aufgeloest (kein hardcoded
--     generated ID; no-op falls nicht vorhanden). Status konsistent auf sv-zugewiesen.
update claims c
set sv_id = sv.id, operative_status = 'sv-zugewiesen', updated_at = now()
from (
  select s.id from sachverstaendige s join profiles p on p.id = s.profile_id
  where p.email = 'smoke-sv@claimondo.test' limit 1
) sv
where c.claim_nummer = 'CLM-2026-00278' and c.sv_id is null;
