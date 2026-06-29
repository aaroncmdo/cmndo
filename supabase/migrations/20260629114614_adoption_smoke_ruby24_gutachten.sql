-- Adoption-Smoke (29.06.2026): ruby24 (CLM-2026-00278, Test-Self-Service, im SV-Track-Repair
-- dem Smoke-SV zugewiesen) durch den Input-Bottleneck treiben. Der Smoke-SV "erstellt" das
-- Gutachten -> der Fall erreicht die Kanzlei-Strecke (operative_status='filmcheck' = QC-Gate
-- vor dem Kanzlei-Handoff). Exerziert SV-Track -> Kanzlei-Eintritt end-to-end auf prod mit dem
-- Test-SV (NIE ein echter Gutachter). Idempotent + no-op falls Smoke-SV/Claim fehlen (frische DB).
--
-- Trigger-Check (verifiziert): gutachten-Insert feuert trg_reparatur_freigabe_task -> no-op,
-- weil claims.werkstatt_id IS NULL (Funktion RETURNt NEW ohne Insert); selbst im Werkstatt-Fall
-- nur eine In-App-tasks-Zeile, KEINE externe Comm. claims-Update feuert nur trg_claims_updated_at.

-- (1) Gutachten durch den Smoke-SV (status 'final', fertiggestellt). Nur wenn noch keins existiert.
insert into gutachten (claim_id, sv_id, status, fertiggestellt_am)
select c.id, sv.id, 'final', now()
from claims c
cross join (
  select s.id from sachverstaendige s join profiles p on p.id = s.profile_id
  where p.email = 'smoke-sv@claimondo.test' limit 1
) sv
where c.claim_nummer = 'CLM-2026-00278'
  and not exists (select 1 from gutachten g where g.claim_id = c.id);

-- (2) Fall auf 'filmcheck' = abgeleiteter Stand fuer (komplett + Gutachten-fertig). Getesteter
--     Fixpunkt der autophase-decision-Kaskade (sv-termin -> begutachtung-laeuft ->
--     gutachten-eingegangen -> filmcheck, dann STOPP an der Halb-Automatik-Grenze: KB macht
--     den Kanzlei-Handoff via saveFilmcheck). Idempotent (nur aus sv-zugewiesen).
update claims c
set operative_status = 'filmcheck', updated_at = now()
where c.claim_nummer = 'CLM-2026-00278'
  and c.operative_status = 'sv-zugewiesen'
  and c.service_typ = 'komplett'
  and exists (select 1 from gutachten g where g.claim_id = c.id and g.fertiggestellt_am is not null);
