-- Werkstatt-getriebener Haftpflicht-Intake: Flag + v_werkstatt_lead-Erweiterung.
-- werkstatt_intake_am/-von markieren einen Lead, dessen Falldaten die Werkstatt selbst
-- gefuellt hat und der jetzt nur noch die SA-Signatur des Kunden braucht (Signatur-only-Pfad
-- in /flow/[token]). v_werkstatt_lead wird um die Gegner-/Unfall-/Standort-Read-Felder
-- erweitert, damit die Werkstatt ALLE Falldaten sieht + editieren kann.
-- Gate + bestehende Spalten unveraendert; neue Spalten NUR ans Ende angehaengt.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS werkstatt_intake_am  timestamptz,
  ADD COLUMN IF NOT EXISTS werkstatt_intake_von uuid;

CREATE OR REPLACE VIEW public.v_werkstatt_lead AS
SELECT id, werkstatt_id, vorname, nachname, telefon, email,
       fahrzeug_hersteller, fahrzeug_modell, kennzeichen, fin, erstzulassung,
       schadens_art, schadens_hergang, unfalldatum, unfallort,
       kostenvoranschlag_netto, kostenvoranschlag_brutto,
       status::text AS status, created_at, schadentyp,
       gegner_name, gegner_versicherung, gegner_kennzeichen, gegner_telefon,
       gegner_email, gegner_bekannt, unfallhergang, unfall_konstellation,
       fahrzeug_standort_adresse, fahrzeug_standort_plz, werkstatt_intake_am
FROM leads l
WHERE werkstatt_id IN (SELECT w.id FROM werkstaetten w WHERE w.user_id = (SELECT auth.uid()))
  AND konvertiert_zu_claim_id IS NULL;
