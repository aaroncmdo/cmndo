-- CMM Entity-Model Phase-3 Trio: 3 additive, low-risk Schema-Lockerungen.
-- HANDOFF §9-D, Aaron-Freigabe 2026-06-03 (3x ja). Kein Consumer-Code noch;
-- entsperrt Gegner-Fahrzeug (fin-los), reinen Halter, claim-lose Reparatur.

-- 1) vehicles.fin NULLABLE — Gegner-Auto oft nur Kennzeichen; FIN = Dedup-Key wenn da.
--    UNIQUE(fin) erlaubt mehrere NULLs (Postgres); CHECK(length=17) ist NULL-safe.
alter table public.vehicles alter column fin drop not null;

-- 2) claim_parties.rolle += 'halter' — reiner Halter (Leasing/Firma != Geschaedigter).
--    Standardfall bleibt das ist_halter-Flag; 'halter' nur fuer eigene Halter-Partei.
alter table public.claim_parties drop constraint if exists claim_parties_rolle_check;
alter table public.claim_parties add constraint claim_parties_rolle_check
  check (rolle = any (array[
    'geschaedigter','verursacher','fahrer_nicht_halter','beifahrer','zeuge',
    'gegner_airdrop','gutachter_gegen','versicherungssachbearbeiter','halter'
  ]));

-- 3) repairs.claim_id NULLABLE — "nur normale Reparatur" ohne Claim.
--    FK (ON DELETE CASCADE) bleibt; NULL = keine Claim-Referenz.
alter table public.repairs alter column claim_id drop not null;
