-- WS1c (Reduced-Repair-Aktivierung): Backfill abrechnungsweg fuer bestehende gegner-Leads
-- (deterministisch: schuldfrage='gegner' -> haftpflicht, Gegner-VS reguliert nach § 249) + deren
-- konvertierte Claims. eigenverantwortung-Leads ohne persistierte eigene_versicherung bleiben
-- offen (werden ab jetzt am Konversionspunkt abgeleitet, WS1b in convert-lead-to-claim).
-- Prod-Wirkung (verifiziert): leads 155 -> haftpflicht, claims 9 -> haftpflicht.
UPDATE public.leads SET abrechnungsweg = 'haftpflicht'
  WHERE abrechnungsweg IS NULL AND schuldfrage = 'gegner';

UPDATE public.claims c SET abrechnungsweg = 'haftpflicht'
  FROM public.leads l
  WHERE l.konvertiert_zu_claim_id = c.id
    AND c.abrechnungsweg IS NULL
    AND l.schuldfrage = 'gegner';
