-- Feststellung-Skip-Marker fuer kasko/selbstzahler umstellen (Aaron 16.07.):
-- fahrzeugschaden_beschreibung wird seit dem Werkstatt-Embed Phase 3 (#4412) bereits im Embed
-- vorbelegt -> haette die komplette Feststellung (ZB1/Kennzeichen/Halter/Vorschaeden) fuer
-- Embed-Leads geskippt (Spec §3: Kennzeichen kommt ERST im Flow). Neuer Marker = hat_vorschaeden:
-- letzter Feststellung-Micro-Step (Kapitel Fahrzeug, im schaden-Zweig enthalten), wird von keinem
-- Vor-Flow-Writer gesetzt (Embed nie, Dispatch-Erfassung nie; kunde-onboarding/stammdaten = post-Flow).
-- false zaehlt als beantwortet (istLeer wertet nur null/undefined/'' als leer).
update flow_szenario_steps
set bedingung = '{"hat_vorschaeden": null}'::jsonb
where szenario_id in ('kasko','selbstzahler') and step_id = 'feststellung';
