-- AAR-956 Funnel: Schadenfotos ins kunde-onboarding (Aaron-Entscheidung 05.06.) — NICHT in den /flow.
-- Der /flow-Feststellungs-Step schliesst typ=file ohnehin aus; die Decision verortet die
-- Schadenfotos im post-Login Onboarding-Wizard (SV fotografiert beim Termin eh -> Kundenfotos
-- = optionaler Onboarding-Rest). Kopiert die bestehende schadensfotos-Felddefinition aus
-- lead-erfassung/schaden in kunde-onboarding/hergang. db_target leads.schadensfoto_urls bleibt
-- = konsistent mit den anderen kunde-onboarding-Upload-Feldern (z.B. fahrzeugschein_foto -> leads).
-- Phasen per (flow_key, phase_key) referenziert (keine hardcoded IDs); idempotent.
INSERT INTO onboarding_felder (id, phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, validation, db_target, conditional_on, i18n, audience, sektion)
SELECT gen_random_uuid(),
       (SELECT id FROM onboarding_phasen WHERE flow_key='kunde-onboarding' AND phase_key='hergang'),
       20, src.feld_key, src.typ, src.label, src.hint, src.placeholder, src.pflicht, src.optionen, src.validation, src.db_target, src.conditional_on, src.i18n, 'beide', src.sektion
FROM onboarding_felder src
WHERE src.feld_key='schadensfotos'
  AND src.phase_id = (SELECT id FROM onboarding_phasen WHERE flow_key='lead-erfassung' AND phase_key='schaden')
  -- Replay-Toleranz (Preview-Chain-Fix 17.07.): nur seeden, wenn die Ziel-Phase kunde-onboarding/hergang
  -- existiert. Fehlt sie (Blank-Replay der Supabase-Preview-Kette), projiziert der SELECT sonst NULL in die
  -- NOT-NULL-Spalte phase_id -> Replay-Crash, der die ~450 folgenden Migrationen nie erreicht. Auf prod
  -- existiert die Phase (verifiziert: target_phase_exists=1, Feld bereits geseedet) -> reines No-op.
  AND EXISTS (SELECT 1 FROM onboarding_phasen WHERE flow_key='kunde-onboarding' AND phase_key='hergang')
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_felder x
    WHERE x.phase_id = (SELECT id FROM onboarding_phasen WHERE flow_key='kunde-onboarding' AND phase_key='hergang')
      AND x.feld_key='schadensfotos'
  );
