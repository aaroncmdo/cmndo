-- Tranche W (W2-Backfill): werkstatt-gebundene Claims ohne jegliche reparatur_termine-Row
-- bekommen die offene 'angefragt'-Row (wunschtermin NULL = "Terminvorschlag offen"), damit
-- die Werkstatt-Termin-Sektion rendert und die Werkstatt proaktiv vorschlagen kann
-- (Spec 2026-08-05 §4.9 W2; Bestand 08.08.: 8 Claims — Quellen qr_referral/kunde/null).
-- Terminale Cursor (abgeschlossen/storniert) + 'abgelehnt' bewusst ausgenommen;
-- NULL-Cursor zaehlt als offen. Claims MIT Termin-Historie (auch erledigt) unberuehrt.
insert into public.reparatur_termine (claim_id, werkstatt_id, status, erstellt_von)
select c.id, c.reparatur_werkstatt_id, 'angefragt', null
from public.claims c
where c.reparatur_werkstatt_id is not null
  and coalesce(c.operative_status, 'offen') not in ('abgeschlossen', 'storniert', 'abgelehnt')
  and not exists (select 1 from public.reparatur_termine rt where rt.claim_id = c.id);
