-- 3 Config-Felder (lead-erfassung, sektion schaden, audience beide) — reparaturwunsch (Intent)
-- + Rueckfrage "hast du eine Werkstatt?" (conditional) + Extern-Name (conditional).
-- Persistenz laeuft ueber den config-derived Allowlist-Save (Dispatcher + Flow). Idempotent.
insert into public.onboarding_felder
  (id, phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target, conditional_on, audience, sektion, erstellt_am)
values
  (gen_random_uuid(), '50ff9d42-5a40-421a-857e-a12b0b202f72', 140, 'reparaturwunsch', 'toggle-cards',
   'Wie möchtest du den Schaden abrechnen?', 'Reparatur in der Werkstatt oder Auszahlung — wichtig für dein Gutachten.', false,
   '[{"label":"Reparatur (in der Werkstatt)","value":"reparatur"},{"label":"Fiktiv (Auszahlung, keine Reparatur)","value":"fiktiv"},{"label":"Noch unentschieden","value":"unentschieden"}]'::jsonb,
   '{"tabelle":"leads","spalte":"reparaturwunsch"}'::jsonb, null, 'beide', 'schaden', now()),
  (gen_random_uuid(), '50ff9d42-5a40-421a-857e-a12b0b202f72', 150, 'reparatur_vermittlung_status', 'segmented',
   'Hast du schon eine Werkstatt?', null, false,
   '[{"label":"Ja, ich habe eine Werkstatt","value":"eigene"},{"label":"Nein, bitte vermittelt mir eine","value":"offen"}]'::jsonb,
   '{"tabelle":"leads","spalte":"reparatur_vermittlung_status"}'::jsonb,
   '{"feld":"reparaturwunsch","equals":"reparatur"}'::jsonb, 'beide', 'schaden', now()),
  (gen_random_uuid(), '50ff9d42-5a40-421a-857e-a12b0b202f72', 160, 'reparatur_werkstatt_extern', 'text',
   'Name deiner Werkstatt', 'Optional — falls du schon eine Werkstatt hast.', false,
   null, '{"tabelle":"leads","spalte":"reparatur_werkstatt_extern"}'::jsonb,
   '{"feld":"reparatur_vermittlung_status","equals":"eigene"}'::jsonb, 'beide', 'schaden', now())
on conflict (phase_id, feld_key) do nothing;
