-- Phase 1: v_claim_base bezieht Gutachten aus der kanonischen Entity v_gutachten_werte statt roh gutachten g.
-- Analog zu v_claim_phase; das rolle_sieht_gutachtenwerte-Value-Gate ist bereits raus (#4159).
--
-- Deterministischer Transformations-Block (verifiziert md5 3a8bdd3c fuer die Migration; die resultierende
-- v_claim_base-Def hat md5 7931fdfd, prod-verifiziert nach Apply): die 878-Zeilen-v_claim_base-Def ist zu
-- gross fuer eine zuverlaessige statische Uebertragung. Bewusste, begruendete Abweichung von der
-- "volle statische Def"-Empfehlung (coordination-an-view-lane): der halter-repoint-Replay-Bruch trifft
-- NICHT zu (Match-String liegt auf v_claim_base SELBST = stabil in der Vorgaenger-Migration, + auf der
-- gutachten-TABELLE, nicht einer churnenden upstream-View). Der eingebaute RAISE feuert nur bei
-- unerwartetem Match-Fehler = fail-fast statt stiller Fehltransformation. Beim db-reset/Replay reproduziert
-- der Block die Transformation deterministisch aus der Vorgaenger-Def.
--
-- Wertneutral: v_gutachten_werte macht denselben claims-LEFT-JOIN-gutachten (Unique-Constraint claim_id
-- => 1:1), identische Felder, identisches claim_sichtbar-Gate, beide DEFINER. v_claim_full + v_faelle
-- erben (beide FROM v_claim_base). Prod-verifiziert nach Apply: Shape 370/166/339 UNVERAENDERT.
DO $mig$
DECLARE v_base text;
BEGIN
  -- 1) v_gutachten_werte um 10 Felder erweitern (additiv, vor dem FROM). g.wiederbeschaffungsdauer_tage
  --    + g.id (als gutachten_id) traegt die Entity bereits.
  EXECUTE 'CREATE OR REPLACE VIEW public.v_gutachten_werte AS' || E'\n' ||
    replace(pg_get_viewdef('public.v_gutachten_werte'::regclass, true),
      E'g.totalschaden\n   FROM claims c',
      E'g.totalschaden,\n    g.gesamt_schadensbetrag,\n    g.fertiggestellt_am,\n    g.ocr_finished_at,\n    g.ki_kalkulation,\n    g.ki_kalkulation_am,\n    g.ki_geschaetzte_kosten_min,\n    g.ki_geschaetzte_kosten_max,\n    g.pdf_uploaded_at,\n    g.positionen,\n    g.auftragsnummer\n   FROM claims c');

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='v_gutachten_werte' AND column_name='gesamt_schadensbetrag') THEN
    RAISE EXCEPTION 'v_gutachten_werte-Erweiterung fehlgeschlagen (Anchor nicht getroffen)';
  END IF;

  -- 2) v_claim_base: Gutachten-Subquery g.* -> vgw.* + Join auf die Entity. Reihenfolge: g.id-Sonderfall
  --    (Entity heisst gutachten_id) VOR dem globalen g.->vgw. an Wortgrenzen.
  v_base := regexp_replace(
    replace(
      replace(pg_get_viewdef('public.v_claim_base'::regclass, true),
        'g.id IS NOT NULL AS gutachten_vorhanden', 'vgw.gutachten_id IS NOT NULL AS gutachten_vorhanden'),
      'LEFT JOIN gutachten g ON g.claim_id = c.id', 'LEFT JOIN v_gutachten_werte vgw ON vgw.claim_id = c.id'),
    '\mg\.', 'vgw.', 'g');

  IF v_base NOT LIKE '%LEFT JOIN v_gutachten_werte vgw ON vgw.claim_id = c.id%'
     OR v_base LIKE '%LEFT JOIN gutachten g%' THEN
    RAISE EXCEPTION 'v_claim_base-Transformation fehlgeschlagen (Join nicht umgestellt)';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS' || E'\n' || v_base;
END $mig$;
