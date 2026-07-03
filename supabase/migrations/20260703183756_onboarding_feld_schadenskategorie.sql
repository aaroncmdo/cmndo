-- Werkstatt-Matching SP1: Kunde-Chip "Was ist beschaedigt?" (physische Schadenskategorie).
-- phase_id DYNAMISCH via (flow_key,phase_key) resolven (NIE hardcoden -> Lehre 1069c2a2/c4bfe730a:
-- onboarding_phasen-ids sind per-Environment random -> Hardcode bricht Supabase-Preview/db-reset).
-- conditional_on-Form = {"feld","equals"} (gegen Bestandsfeld verifiziert). db_target -> leads.
INSERT INTO public.onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, pflicht, optionen, db_target, conditional_on, audience, sektion)
SELECT
  p.id, 145, 'schadenskategorie', 'toggle-cards',
  'Was ist an deinem Fahrzeug beschädigt?', false,
  '[{"label":"Karosserie / Blech","value":"karosserie"},{"label":"Lackierung / Kratzer","value":"lackierung"},{"label":"Mechanik / Motor","value":"mechanik"},{"label":"Glas","value":"glas"},{"label":"Weiß ich nicht","value":"unbekannt"}]'::jsonb,
  '{"tabelle":"leads","spalte":"schadenskategorie"}'::jsonb,
  '{"feld":"reparaturwunsch","equals":"reparatur"}'::jsonb,
  'beide', 'schaden'
FROM public.onboarding_phasen p
WHERE p.flow_key = 'lead-erfassung' AND p.phase_key = 'schaden'
ON CONFLICT DO NOTHING;
