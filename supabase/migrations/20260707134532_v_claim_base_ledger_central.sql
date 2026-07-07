-- Payment-Ledger Phase 2b: v_claim_base surft vs/kunde/sv aus dem claim_payments-Ledger.
-- Technik (367-Spalten-Root-View): pg_get_viewdef holen, 6 chirurgische Substring-Replaces mit
-- Count==1-Guards, als CREATE OR REPLACE re-EXECUTEn. Der DO-Block bewahrt die ~361 unveraenderten
-- Spalten BYTE-genau (kein Hand-Abtippen -> keine Emit-Korruption). RAISE EXCEPTION wenn ein Anchor
-- fehlt/mehrdeutig; Skip wenn schon migriert (idempotent/replay-safe).
-- Aenderungen: regulierung_betrag -> COALESCE(p.vs_ist,p.vs_soll,cache) [Ist-first, Aaron 2026-07-07];
--   auszahlung_gutachter_* -> COALESCE(p.sv_ist/sv_am,cache); + auszahlung_kunde_betrag/_eingegangen_am
--   (neu aus p.kunde_*, war homeless NULL); claim_id qualifiziert (sub.claim_id) gg Pivot-Mehrdeutigkeit;
--   + LEFT JOIN v_claim_payments p ON p.claim_id=sub.id (1 Zeile/Claim -> non-breaking).
-- Verhaltensneutral bei leerem Ledger. Plan: docs/superpowers/plans/2026-07-07-payment-ledger-vclaimbase-centralization.md
DO $mig$
DECLARE
  d  text;
  a1 text := 'WHEN rolle_sieht_regulierung() THEN regulierung_betrag';
  a2 text := E'\n    auszahlung_gutachter_betrag,';
  a3 text := E'\n    auszahlung_gutachter_eingegangen_am,';
  a4 text := E'\n    claim_id,\n    sv_termin_dokument_reminder_gesendet_am,';
  a5 text := E'    fahrzeug_hersteller_raw\n   FROM ( SELECT c.id,';
  a6 text := E') sub\n  WHERE claim_sichtbar_fuer_aktuellen_user(id)';
BEGIN
  d := pg_get_viewdef('public.v_claim_base'::regclass, true);
  IF position('v_claim_payments p' in d) > 0 THEN
    RAISE NOTICE 'v_claim_base bereits ledger-central; skip'; RETURN;
  END IF;
  IF (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 THEN RAISE EXCEPTION 'anchor a1 (regulierung) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 THEN RAISE EXCEPTION 'anchor a2 (gutachter_betrag) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a3,'')))/length(a3) <> 1 THEN RAISE EXCEPTION 'anchor a3 (gutachter_am) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a4,'')))/length(a4) <> 1 THEN RAISE EXCEPTION 'anchor a4 (claim_id) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a5,'')))/length(a5) <> 1 THEN RAISE EXCEPTION 'anchor a5 (append) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a6,'')))/length(a6) <> 1 THEN RAISE EXCEPTION 'anchor a6 (join) count <> 1'; END IF;
  d := replace(d, a1, 'WHEN rolle_sieht_regulierung() THEN COALESCE(p.vs_ist, p.vs_soll, regulierung_betrag)');
  d := replace(d, a2, E'\n    COALESCE(p.sv_ist, auszahlung_gutachter_betrag) AS auszahlung_gutachter_betrag,');
  d := replace(d, a3, E'\n    COALESCE(p.sv_am, auszahlung_gutachter_eingegangen_am) AS auszahlung_gutachter_eingegangen_am,');
  d := replace(d, a4, E'\n    sub.claim_id AS claim_id,\n    sv_termin_dokument_reminder_gesendet_am,');
  d := replace(d, a5, E'    fahrzeug_hersteller_raw,\n    p.kunde_ist::numeric(10,2) AS auszahlung_kunde_betrag,\n    p.kunde_am::timestamp with time zone AS auszahlung_kunde_eingegangen_am\n   FROM ( SELECT c.id,');
  d := replace(d, a6, E') sub\n     LEFT JOIN v_claim_payments p ON p.claim_id = sub.id\n  WHERE claim_sichtbar_fuer_aktuellen_user(id)');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || d;
END $mig$;
