-- AAR-Stufe-0.5 Punkt 2 (14.05.2026)
-- Drop von claims.firma_ustid.
--
-- Vorab-Verifikation:
--   - claims.firma_ustid: 0/11 Coverage, kein Writer, kein Reader
--   - Kein Trigger/Function referenziert firma_ustid (geprueft via pg_proc)
--   - Keine View referenziert firma_ustid (geprueft via pg_views)
--   - SSoT fuer USt-ID: claim_parties.ust_id (Gewerbe-Parties)
--   - faelle.ust_id bleibt drin (Legacy-Pfad)
--
-- Hintergrund: Spalte stammt aus Backfill-Migration 20260503185148
-- (claims.firma_ustid <- faelle.ust_id). Backfill war einmalig, kein
-- laufender Sync. Spalte war Schema-Vorbereitung, nie befuellt.

BEGIN;

ALTER TABLE public.claims DROP COLUMN IF EXISTS firma_ustid;

COMMIT;
