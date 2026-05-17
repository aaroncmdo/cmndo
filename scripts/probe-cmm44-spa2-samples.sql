-- CMM-44 SP-A2 — Stichproben der 3 auffaelligen Paare
SELECT f.fall_nummer, c.claim_nummer,
       f.gegner_anzahl_beteiligte, c.anzahl_beteiligte_total,
       f.schadens_ort, c.schadenort_ort,
       c.phase, f.aktuelle_phase
FROM faelle f JOIN claims c ON f.claim_id = c.id
ORDER BY c.created_at DESC
LIMIT 12;
