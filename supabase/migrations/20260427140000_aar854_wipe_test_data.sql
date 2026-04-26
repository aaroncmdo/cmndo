-- AAR-854 Migration 1/4: Test-Data-Wipe
--
-- Aaron-Mandat 2026-04-26 19:45 CET: Die 4 produktiven Akten (CLM-2026-00001
-- bis 00004) sind Test-Daten und können gelöscht werden. Damit entfällt das
-- Reverse-Backfill-Problem für AAR-854 Sync-Trigger.
--
-- Behält: Auth-User-Accounts, Lookup-Tabellen (versicherungen, plz_geo, etc.),
--         sachverstaendige-Stammdaten, settings, ai_prompts.

BEGIN;

-- ─── Pre-Audit (Audit-Trail im DB-Log) ──────────────────────────────────
DO $$
DECLARE
  v_claims_count INT;
  v_faelle_count INT;
  v_email_count  INT;
BEGIN
  SELECT COUNT(*) INTO v_claims_count FROM public.claims;
  SELECT COUNT(*) INTO v_faelle_count FROM public.faelle;
  SELECT COUNT(*) INTO v_email_count  FROM public.email_log
   WHERE fall_id IN (SELECT id FROM public.faelle);

  RAISE NOTICE 'AAR-854 Pre-Wipe: % claims, % faelle, % email_log entries',
    v_claims_count, v_faelle_count, v_email_count;

  IF v_claims_count > 10 OR v_faelle_count > 10 THEN
    RAISE EXCEPTION 'AAR-854 SAFETY-STOP: Mehr als 10 claims/faelle gefunden — manuell prüfen.';
  END IF;
END $$;

-- ─── Layer 1: Sub-Asset-Daten der claims ────────────────────────────────
DELETE FROM public.kanzlei_pakete                  WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.gutachten_positionen            WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.gutachten_fotos                 WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.gutachten                       WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.repairs                         WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.vs_korrespondenz                WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.claim_payments                  WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.claim_mietwagen                 WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.claim_vehicle_involvements      WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.claim_parties                   WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.airdrop_invitations             WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.sv_organisation_laeufer_reports WHERE claim_id IN (SELECT id FROM public.claims);
DELETE FROM public.ocr_runs                        WHERE gutachten_id IN (SELECT id FROM public.gutachten);

-- ─── Layer 2: faelle-bezogene Daten ─────────────────────────────────────
DELETE FROM public.email_log           WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.timeline            WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.nachrichten         WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.ai_usage_log        WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.tasks               WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.pflichtdokumente    WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.webhook_events      WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.notification_events WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.gutachter_termine   WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.admin_termine       WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.phase_transitions   WHERE fall_id IN (SELECT id FROM public.faelle);
DELETE FROM public.fall_read_state     WHERE fall_id IN (SELECT id FROM public.faelle);

-- ─── Layer 3: faelle und claims selbst ──────────────────────────────────
DELETE FROM public.faelle;
DELETE FROM public.claims;

-- ─── Verify ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_claims INT;
  v_faelle INT;
  v_pt     INT;
BEGIN
  SELECT COUNT(*) INTO v_claims FROM public.claims;
  SELECT COUNT(*) INTO v_faelle FROM public.faelle;
  SELECT COUNT(*) INTO v_pt     FROM public.phase_transitions;

  IF v_claims != 0 OR v_faelle != 0 OR v_pt != 0 THEN
    RAISE EXCEPTION 'AAR-854 Post-Wipe-Check failed: % claims, % faelle, % pt', v_claims, v_faelle, v_pt;
  END IF;

  RAISE NOTICE 'AAR-854 Wipe complete: clean slate ✓';
END $$;

COMMIT;
