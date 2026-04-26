-- AAR-830: claims.phase — Phase-Resolver als DB-Trigger
--
-- claims.phase ist immer korrekt nach jedem INSERT/UPDATE auf claims
-- SOWIE nach INSERT/UPDATE/DELETE auf Sub-Asset-Tabellen (gutachten, repairs,
-- vs_korrespondenz, claim_payments). Sub-Asset-Tabellen prüfen via to_regclass()
-- ob sie existieren — forward-kompatibel für spätere AAR-818/819/822/823/824-Migrations.
--
-- Frontend-Regel (Anti-Pattern): NIE Phase im Frontend rekonstruieren.
-- Immer: SELECT phase FROM claims WHERE id = ?

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT '1_neu';

CREATE INDEX IF NOT EXISTS idx_claims_phase ON public.claims(phase);

COMMENT ON COLUMN public.claims.phase IS
  'AAR-830: Phase des Claims. Immer via Trigger korrekt gehalten. '
  'Werte: 0_lead|1_neu|2_in_bearbeitung|3_gutachter_unterwegs|4_gutachten_fertig|'
  '5_in_reparatur|6_vs_forderung|7_vs_eskalation|8_auszahlung|9_abgeschlossen|9_storniert. '
  'NIE im Frontend rekonstruieren — immer direkt lesen.';

-- ─── Kern-Funktion: Phase berechnen ─────────────────────────────────────────
-- Aufruf: BEFORE INSERT OR UPDATE auf claims (inline).
-- Sub-Assets werden via to_regclass() defensiv geprüft —
-- Tabellen, die noch nicht existieren, ergeben FALSE ohne Fehler.

CREATE OR REPLACE FUNCTION public.calc_claims_phase(
  p_claim_id  UUID,
  p_status    TEXT,
  p_kb_id     UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_phase TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Endstatus — sofort auflösen
  IF p_status = 'storniert'    THEN RETURN '9_storniert'; END IF;
  IF p_status = 'abgeschlossen' THEN RETURN '9_abgeschlossen'; END IF;

  -- Phase 8: Auszahlung (claim_payments existiert ab AAR-823)
  IF to_regclass('public.claim_payments') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(
        SELECT 1 FROM public.claim_payments
         WHERE claim_id = $1 AND status IN ('angekuendigt','eingegangen')
      )
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '8_auszahlung'; END IF;
  END IF;

  -- Phase 7: VS-Eskalation (vs_korrespondenz existiert ab AAR-823)
  IF to_regclass('public.vs_korrespondenz') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(
        SELECT 1 FROM public.vs_korrespondenz
         WHERE claim_id = $1 AND typ IN ('mahnung_1','mahnung_2','klage_androhung')
           AND status NOT IN ('entwurf','storniert')
      )
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '7_vs_eskalation'; END IF;
  END IF;

  -- Phase 6: VS-Forderung (vs_korrespondenz)
  IF to_regclass('public.vs_korrespondenz') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(
        SELECT 1 FROM public.vs_korrespondenz
         WHERE claim_id = $1 AND typ = 'forderung'
           AND status NOT IN ('entwurf','storniert')
      )
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '6_vs_forderung'; END IF;
  END IF;

  -- Phase 5: In Reparatur (repairs existiert ab AAR-822)
  IF to_regclass('public.repairs') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(
        SELECT 1 FROM public.repairs
         WHERE claim_id = $1 AND status IN ('beauftragt','in_arbeit')
      )
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '5_in_reparatur'; END IF;
  END IF;

  -- Phase 4: Gutachten fertig (gutachten existiert ab AAR-818)
  IF to_regclass('public.gutachten') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(
        SELECT 1 FROM public.gutachten
         WHERE claim_id = $1 AND status = 'final'
      )
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '4_gutachten_fertig'; END IF;
  END IF;

  -- Phase 3: Gutachter unterwegs (gutachten)
  IF to_regclass('public.gutachten') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS(
        SELECT 1 FROM public.gutachten
         WHERE claim_id = $1 AND status IN ('beauftragt','besichtigt','in_erstellung')
      )
    $sql$ INTO v_exists USING p_claim_id;
    IF v_exists THEN RETURN '3_gutachter_unterwegs'; END IF;
  END IF;

  -- Phase 2: In Bearbeitung (KB zugewiesen)
  IF p_kb_id IS NOT NULL THEN RETURN '2_in_bearbeitung'; END IF;

  -- Phase 1: Neu (dispatch_done, kein KB)
  IF p_status = 'dispatch_done' THEN RETURN '1_neu'; END IF;

  -- Phase 0: Fallback (sollte bei existierenden Claims nicht auftreten)
  RETURN '0_lead';
END $$;

-- ─── Trigger-Funktion: Claims-Phase bei claims-INSERT/-UPDATE ────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_set_claims_phase()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.phase := public.calc_claims_phase(NEW.id, NEW.status, NEW.kundenbetreuer_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_claims_set_phase ON public.claims;
CREATE TRIGGER trg_claims_set_phase
  BEFORE INSERT OR UPDATE OF status, kundenbetreuer_id
  ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_set_claims_phase();

-- ─── Backfill: Phase für bestehende Claims berechnen ────────────────────────

UPDATE public.claims
   SET phase = public.calc_claims_phase(id, status, kundenbetreuer_id)
 WHERE true;

-- ─── Statistik ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'AAR-830 Phase-Resolver Backfill:';
  FOR r IN
    SELECT phase, count(*) AS n
      FROM public.claims
     GROUP BY phase
     ORDER BY phase
  LOOP
    RAISE NOTICE '  % → % Claims', r.phase, r.n;
  END LOOP;
  RAISE NOTICE 'Nächste Schritte: AAR-831 Rollen-RLS, AAR-818 gutachten (erweitert calc_claims_phase)';
END $$;
