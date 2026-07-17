-- CMM-49 Feststellung-doppelt Config-Seed: safe-set Unfall-Fakten in die BESTEHENDE
-- kunde-onboarding 'hergang'-Phase, db_target -> claims. Geschrieben vom #3025
-- ownership-gated claims-Writer (saveClaimsOnboardingFacts; geschaedigter==auth.uid()).
--
-- NUR der saubere safe-set (claim-level, in CLAIMS_ONBOARDING_WRITABLE, kein Constraint-
-- Risiko): personenschaden/sachschaden(+beschr)/polizei(+az)/zeugen. BEWUSST NICHT:
--   * schadentyp -> schadenart: claims_schadenart_check {haftpflicht..} != flow-Werte
--     {spurwechsel,auffahrunfall..} -> Constraint-Verletzung. (Folge: eigene Spalte/Mapping.)
--   * hergang_kunde_text: schon in der 'hergang'-Phase (claims, pflicht) vorhanden.
--   * gegner_* -> verursacher-Party / vorschaeden -> Entity = Folge-PRs (entity-bound).
-- Platzierung in 'hergang' (statt eigener Phase): die Phase ist via pflicht
-- hergang_kunde_text gegated -> wird gezeigt wenn der Hergang fehlt (= der Approach-C-
-- Hauptfall "Flow geskippt"); eine eigene Phase nur mit optionalen Feldern wuerde
-- ladeNoetigePhasen leer-skippen. segmented-Werte 'true'/'false' -> Writer-Bool-Coercion.
-- Additiv + idempotent.
DO $seed$
DECLARE
  v_phase_id uuid;
BEGIN
  SELECT id INTO v_phase_id FROM onboarding_phasen
   WHERE flow_key = 'kunde-onboarding' AND phase_key = 'hergang';
  IF v_phase_id IS NULL THEN
    -- Replay-Toleranz (Preview-Chain-Fix 17.07.): die kunde-onboarding/hergang-Phase wird NICHT in
    -- der Migrations-Kette erzeugt (auf prod vorhanden, aber es existiert kein Phasen-Seed im Chain)
    -- -> auf der Blank-Replay-DB der Supabase-Preview fehlt sie. Statt hart RAISE (killt den Replay
    -- fuer alle folgenden Migrationen) hier sauber ueberspringen. Auf prod existiert die Phase
    -- (verifiziert: target_phase_exists=1) -> dieser Zweig wird nie erreicht = reines No-op.
    RAISE NOTICE 'kunde-onboarding hergang-Phase nicht gefunden — Seed uebersprungen (Replay-Toleranz)';
    RETURN;
  END IF;

  INSERT INTO onboarding_felder
    (phase_id, reihenfolge, feld_key, typ, label, placeholder, pflicht, optionen, db_target, conditional_on, audience)
  VALUES
    (v_phase_id, 500, 'personenschaden_flag', 'segmented', 'Personenschaden?', NULL, false,
     '[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]'::jsonb,
     '{"tabelle":"claims","spalte":"hat_personenschaden"}'::jsonb, NULL, 'beide'),
    (v_phase_id, 510, 'sachschaden_flag', 'segmented', 'Sachschäden an Dritten?', NULL, false,
     '[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]'::jsonb,
     '{"tabelle":"claims","spalte":"hat_sachschaden"}'::jsonb, NULL, 'beide'),
    (v_phase_id, 520, 'sachschaden_beschreibung', 'textarea', 'Was wurde beschädigt?', 'z.B. Leitplanke, Handy …', false,
     NULL,
     '{"tabelle":"claims","spalte":"sachschaden_beschreibung"}'::jsonb,
     '{"feld":"sachschaden_flag","equals":"true"}'::jsonb, 'beide'),
    (v_phase_id, 530, 'polizei_vor_ort', 'segmented', 'Polizei vor Ort?', NULL, false,
     '[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]'::jsonb,
     '{"tabelle":"claims","spalte":"polizei_vor_ort"}'::jsonb, NULL, 'beide'),
    (v_phase_id, 540, 'polizei_aktenzeichen', 'text', 'Aktenzeichen', NULL, false,
     NULL,
     '{"tabelle":"claims","spalte":"polizei_aktenzeichen"}'::jsonb,
     '{"feld":"polizei_vor_ort","equals":"true"}'::jsonb, 'beide'),
    (v_phase_id, 550, 'zeugen', 'segmented', 'Zeugen vorhanden?', NULL, false,
     '[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]'::jsonb,
     '{"tabelle":"claims","spalte":"zeugen_vorhanden"}'::jsonb, NULL, 'beide')
  ON CONFLICT (phase_id, feld_key) DO NOTHING;
END $seed$;
