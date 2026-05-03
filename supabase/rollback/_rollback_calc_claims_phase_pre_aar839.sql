-- ROLLBACK-SNAPSHOT: pre-AAR-839 calc_claims_phase + trg_cp_refresh_phase
-- Stand: 2026-04-26 14:00 CET
-- Aufgenommen direkt vor AAR-839-Push. NICHT in supabase/migrations/ — ist
-- ausschließlich Notfall-Rollback. Bei Bedarf: psql diese Datei reinrunnen,
-- danach UPDATE claims SET phase = calc_claims_phase(...) für Backfill.

-- ─── 1) Alte Function (Phase 0_lead..9_abgeschlossen, mit Phase 7+8) ─────

CREATE OR REPLACE FUNCTION public.calc_claims_phase(
  p_claim_id UUID,
  p_status   TEXT,
  p_kb_id    UUID
) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_phase TEXT;
  v_exists BOOLEAN;
BEGIN
  IF p_status = 'storniert'    THEN RETURN '9_storniert'; END IF;
  IF p_status = 'abgeschlossen' THEN RETURN '9_abgeschlossen'; END IF;

  IF to_regclass('public.claim_payments') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(SELECT 1 FROM public.claim_payments
                     WHERE claim_id = $1 AND status IN ('angekuendigt','eingegangen'))
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '8_auszahlung'; END IF;
  END IF;

  IF to_regclass('public.vs_korrespondenz') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(SELECT 1 FROM public.vs_korrespondenz
                     WHERE claim_id = $1 AND typ IN ('mahnung_1','mahnung_2','klage_androhung')
                       AND status NOT IN ('entwurf','storniert'))
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '7_vs_eskalation'; END IF;
  END IF;

  IF to_regclass('public.vs_korrespondenz') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(SELECT 1 FROM public.vs_korrespondenz
                     WHERE claim_id = $1 AND typ = 'forderung'
                       AND status NOT IN ('entwurf','storniert'))
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '6_vs_forderung'; END IF;
  END IF;

  IF to_regclass('public.repairs') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(SELECT 1 FROM public.repairs
                     WHERE claim_id = $1 AND status IN ('beauftragt','in_arbeit'))
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '5_in_reparatur'; END IF;
  END IF;

  IF to_regclass('public.gutachten') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(SELECT 1 FROM public.gutachten
                     WHERE claim_id = $1 AND status = 'final')
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '4_gutachten_fertig'; END IF;
  END IF;

  IF to_regclass('public.gutachten') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(SELECT 1 FROM public.gutachten
                     WHERE claim_id = $1 AND status IN ('beauftragt','besichtigt','in_erstellung'))
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '3_gutachter_unterwegs'; END IF;
  END IF;

  IF p_kb_id IS NOT NULL THEN RETURN '2_in_bearbeitung'; END IF;
  IF p_status = 'dispatch_done' THEN RETURN '1_neu'; END IF;
  RETURN '0_lead';
END $$;

-- ─── 2) Alter Trigger trg_cp_refresh_phase auf claim_payments ─────────────

CREATE TRIGGER trg_cp_refresh_phase
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.claim_payments
  FOR EACH ROW EXECUTE FUNCTION trg_fn_refresh_claim_phase_from_payments();

-- ─── 3) Alter status-CHECK (9 Werte) ─────────────────────────────────────

ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_status_check CHECK (
  status = ANY (ARRAY[
    'dispatch_done','in_bearbeitung','abgeschlossen','storniert','offen',
    'reguliert_teilweise','reguliert_vollstaendig','abgelehnt','verjaehrt'
  ])
);

-- ─── 4) phase-CHECK weg (es gab keinen vor AAR-839) ──────────────────────

ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_phase_check;

-- ─── 5) Alte cron_verjaehrungs_warner mit dem alten Status-Filter ────────

CREATE OR REPLACE FUNCTION public.cron_verjaehrungs_warner()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('verjaehrungs_warner', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH bald_verjaehrt AS (
    SELECT c.id, c.verjaehrt_am, c.vehicle_id,
           EXTRACT(DAY FROM (c.verjaehrt_am::TIMESTAMPTZ - now()))::INTEGER AS tage_bis_verjaehrt
      FROM public.claims c
     WHERE c.status NOT IN ('abgeschlossen','storniert')
       AND c.verjaehrt_am IS NOT NULL
       AND c.verjaehrt_am::TIMESTAMPTZ BETWEEN now() AND now() + INTERVAL '90 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'claim.verjaehrung_naht'
           AND (ne.payload->>'claim_id')::UUID = c.id
           AND ne.created_at > now() - INTERVAL '7 days'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT 'claim.verjaehrung_naht',
         jsonb_build_object('claim_id', bv.id, 'vehicle_id', bv.vehicle_id,
                            'verjaehrt_am', bv.verjaehrt_am, 'tage_bis_verjaehrt', bv.tage_bis_verjaehrt),
         'pending'
    FROM bald_verjaehrt bv;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('verjaehrungs_warner', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('verjaehrungs_warner', 'error', NULL, SQLERRM);
END $$;

-- ─── 6) Phase-Spalte refreshen mit alter Function ────────────────────────

UPDATE public.claims SET phase = public.calc_claims_phase(id, status, kundenbetreuer_id);
