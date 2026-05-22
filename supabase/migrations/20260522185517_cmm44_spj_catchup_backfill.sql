-- CMM-44 SP-J PR3 — Catch-up Backfill der 8 Bucket-B-Spalten claims <- faelle.
--
-- Idempotenter COALESCE: fuellt claims-NULLs aus faelle. Faengt Schreibvorgaenge
-- ab, die nach dem PR1-Backfill (Migration 20260522133422) aber vor dem PR2-main-
-- Deploy noch auf faelle gingen (alter Prod-Code schrieb Bucket-B auf faelle).
-- Seit PR2 auf main (#1547 via #1548) schreiben alle Pfade auf claims -> faelle
-- ist eingefroren, dieser Catch-up ist die finale Synchronisation.
--
-- Live-gemessen VOR Apply (2026-05-22): 0 Divergenz ueber alle 49 verknuepften
-- Claims fuer alle 8 Bucket-B-Spalten (pre-launch, kein echtes Billing). Die
-- Migration ist daher de facto ein No-Op und dient als reproduzierbarer
-- Safety-Net + db-reset-Konsistenz (SP-D-Praezedenz #1533).
--
-- Hinweis guthaben_verrechnet_netto: NOT NULL DEFAULT 0 -> COALESCE(c,f)=c
-- (claims gewinnt, kein NULL zu fuellen). Es ist im SET aus Vollstaendigkeit,
-- triggert aber die WHERE-Bedingung nie. Die 7 nullable Spalten werden nur
-- befuellt, wenn claims NULL ist UND faelle einen Wert hat (echter Catch-up-Fall);
-- ein bereits gesetzter claims-Wert (PR2-Truth) wird NIE ueberschrieben.
BEGIN;

UPDATE public.claims c SET
  guthaben_verrechnet_netto           = COALESCE(c.guthaben_verrechnet_netto, f.guthaben_verrechnet_netto),
  schlussabrechnung_am                = COALESCE(c.schlussabrechnung_am, f.schlussabrechnung_am),
  auszahlung_gutachter_betrag         = COALESCE(c.auszahlung_gutachter_betrag, f.auszahlung_gutachter_betrag),
  auszahlung_gutachter_eingegangen_am = COALESCE(c.auszahlung_gutachter_eingegangen_am, f.auszahlung_gutachter_eingegangen_am),
  auszahlung_zahlungsweg              = COALESCE(c.auszahlung_zahlungsweg, f.auszahlung_zahlungsweg),
  sv_nachzahlung_netto                = COALESCE(c.sv_nachzahlung_netto, f.sv_nachzahlung_netto),
  abrechnung_id                       = COALESCE(c.abrechnung_id, f.abrechnung_id),
  kanzlei_abrechnung_id               = COALESCE(c.kanzlei_abrechnung_id, f.kanzlei_abrechnung_id)
FROM public.faelle f
WHERE f.claim_id = c.id
  AND (
       (c.schlussabrechnung_am IS NULL AND f.schlussabrechnung_am IS NOT NULL)
    OR (c.auszahlung_gutachter_betrag IS NULL AND f.auszahlung_gutachter_betrag IS NOT NULL)
    OR (c.auszahlung_gutachter_eingegangen_am IS NULL AND f.auszahlung_gutachter_eingegangen_am IS NOT NULL)
    OR (c.auszahlung_zahlungsweg IS NULL AND f.auszahlung_zahlungsweg IS NOT NULL)
    OR (c.sv_nachzahlung_netto IS NULL AND f.sv_nachzahlung_netto IS NOT NULL)
    OR (c.abrechnung_id IS NULL AND f.abrechnung_id IS NOT NULL)
    OR (c.kanzlei_abrechnung_id IS NULL AND f.kanzlei_abrechnung_id IS NOT NULL)
  );

COMMIT;
