-- 3 Config-Felder (lead-erfassung, sektion schaden, audience beide) — reparaturwunsch (Intent)
-- + Rueckfrage "hast du eine Werkstatt?" (conditional) + Extern-Name (conditional).
-- Persistenz laeuft ueber den config-derived Allowlist-Save (Dispatcher + Flow). Idempotent.
--
-- WICHTIG: phase_id wird DYNAMISCH via (flow_key,phase_key) aufgeloest, NICHT hardcoded.
-- onboarding_phasen.id ist per-Environment random (der Phasen-Seed 20260601194200 setzt
-- keine explizite id -> gen_random_uuid default). Ein hardcoded phase_id waere nur in prod
-- gueltig und wuerde auf einem frischen Branch (Supabase Preview / db reset) die FK verletzen.
-- Der cross join auf die Phase-Subquery macht die Migration reproduzierbar + no-op falls Phase fehlt.
insert into public.onboarding_felder
  (id, phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target, conditional_on, audience, sektion, erstellt_am)
select gen_random_uuid(), p.id, v.reihenfolge, v.feld_key, v.typ, v.label, v.hint, false,
       v.optionen, v.db_target, v.conditional_on, 'beide', 'schaden', now()
from (
  values
    (140, 'reparaturwunsch', 'toggle-cards',
     'Wie möchtest du den Schaden abrechnen?',
     'Reparatur in der Werkstatt oder Auszahlung — wichtig für dein Gutachten.'::text,
     '[{"label":"Reparatur (in der Werkstatt)","value":"reparatur"},{"label":"Fiktiv (Auszahlung, keine Reparatur)","value":"fiktiv"},{"label":"Noch unentschieden","value":"unentschieden"}]'::jsonb,
     '{"tabelle":"leads","spalte":"reparaturwunsch"}'::jsonb,
     null::jsonb),
    (150, 'reparatur_vermittlung_status', 'segmented',
     'Hast du schon eine Werkstatt?',
     null::text,
     '[{"label":"Ja, ich habe eine Werkstatt","value":"eigene"},{"label":"Nein, bitte vermittelt mir eine","value":"offen"}]'::jsonb,
     '{"tabelle":"leads","spalte":"reparatur_vermittlung_status"}'::jsonb,
     '{"feld":"reparaturwunsch","equals":"reparatur"}'::jsonb),
    (160, 'reparatur_werkstatt_extern', 'text',
     'Name deiner Werkstatt',
     'Optional — falls du schon eine Werkstatt hast.'::text,
     null::jsonb,
     '{"tabelle":"leads","spalte":"reparatur_werkstatt_extern"}'::jsonb,
     '{"feld":"reparatur_vermittlung_status","equals":"eigene"}'::jsonb)
) as v(reihenfolge, feld_key, typ, label, hint, optionen, db_target, conditional_on)
cross join (
  select id from public.onboarding_phasen where flow_key = 'lead-erfassung' and phase_key = 'schaden' limit 1
) p
on conflict (phase_id, feld_key) do nothing;
