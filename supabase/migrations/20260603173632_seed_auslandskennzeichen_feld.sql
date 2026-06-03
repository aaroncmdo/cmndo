-- P4-D: Config-Feld auslandskennzeichen in lead-erfassung/unfall (audience beide).
-- Spalte leads.auslandskennzeichen existiert bereits; reiner onboarding_felder-Seed.
-- Idempotent via NOT EXISTS; Phase via Subquery (kein hardcoded UUID).
insert into onboarding_felder
  (phase_id, feld_key, typ, label, optionen, db_target, pflicht, audience, sektion, reihenfolge)
select
  p.id,
  'auslandskennzeichen',
  'segmented',
  'Auslandskennzeichen des Gegners?',
  '[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]'::jsonb,
  '{"spalte":"auslandskennzeichen","tabelle":"leads"}'::jsonb,
  false,
  'beide',
  'unfall',
  65
from onboarding_phasen p
where p.flow_key = 'lead-erfassung'
  and p.phase_key = 'unfall'
  and not exists (
    select 1 from onboarding_felder f2
    where f2.phase_id = p.id and f2.feld_key = 'auslandskennzeichen'
  );
