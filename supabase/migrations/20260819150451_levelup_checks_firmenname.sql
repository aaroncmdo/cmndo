-- SV-LevelUp — Firmenname am Check
--
-- Die Luecke, die beim Bau von `wett` auffiel (19.08.): `levelup_checks` fuehrt
-- nur `sv_lead_id`. Beim Massenlauf kommt der Name aus `sv_leads.firma`, beim
-- OEFFENTLICHEN Check ist er unbekannt — und dann findet das Modul `wett` den
-- eigenen Eintrag in der Kartensuche nicht. Es weist den Rang dann korrekt als
-- Fehlstelle aus (R-B: keinen falschen Rang behaupten), aber die zentrale
-- Aussage des Wegs `bestand` („Wo Sie im Feld stehen") bleibt leer.
--
-- Zweiter Nutzen: F-06 leitet daraus den Namen des entstehenden Leads ab.
-- Ohne ihn bleibt nur die Domain (`sv-bergk.de`) oder „Unbenannt (Ort)".
--
-- Optional und nullable: der Check laeuft weiter ohne Angabe, und die drei
-- bestehenden Smoke-Checks bleiben unberuehrt.
--
-- Spec: docs/superpowers/specs/2026-08-18-sv-levelup-design.md
-- Plan: docs/superpowers/plans/2026-08-19-sv-levelup-p4-termin-lead-funnel.md

alter table public.levelup_checks
  add column firmenname text;

comment on column public.levelup_checks.firmenname is
  'Firmenname, wie der Sachverstaendige ihn angibt. Optional — der Check laeuft auch ohne. Wird an ZWEI Stellen gebraucht: das Modul `wett` findet ohne ihn den eigenen Eintrag in der Kartensuche nicht (und weist den Rang dann als Fehlstelle aus statt einen falschen zu behaupten), und F-06 leitet daraus den Namen des Leads ab (sonst nur aus der Domain).';
