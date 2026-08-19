-- SV-LevelUp P4 — Einwilligung nachweisbar am Termin
--
-- F-06 Schritt 1+2 verlangen: ohne Einwilligung kein Lead, und der Consent wird
-- mit Zeitpunkt und IP-Hash festgehalten.
--
-- Warum nicht allein `consent_records`: die Tabelle fuehrt
-- `id, categories, policy_version, user_agent, created_at` — KEINEN Bezug zum
-- Vorgang und keinen IP-Hash. Die Frage „wer hat wann worin eingewilligt?"
-- liesse sich damit nicht beantworten. Der zentrale Eintrag wird trotzdem
-- geschrieben (nach dem Hausmuster aus melde-schaden: `categories` als
-- Zweck-Array) — der ZUORDENBARE Nachweis steht hier.
--
-- Drei nullable Spalten ohne Default: kein Tabellen-Rewrite, kein langer Lock.
-- levelup_termine ist noch leer (0 Zeilen), der Bestand ist also unberuehrt.
--
-- Spec: docs/superpowers/specs/2026-08-18-sv-levelup-design.md
-- Plan: docs/superpowers/plans/2026-08-19-sv-levelup-p4-termin-lead-funnel.md (Task 1)

alter table public.levelup_termine
  add column einwilligung_am      timestamptz,
  add column einwilligung_ip_hash text,
  add column einwilligung_text    text;

comment on column public.levelup_termine.einwilligung_am is
  'Zeitpunkt der Einwilligung in die Kontaktaufnahme. Ohne diesen Wert haette der Termin nicht entstehen duerfen (CONTRACT F-06 Schritt 1).';

comment on column public.levelup_termine.einwilligung_ip_hash is
  'SHA-256 der IP zum Zeitpunkt der Einwilligung. Nie die Adresse selbst.';

comment on column public.levelup_termine.einwilligung_text is
  'Wortlaut, dem zugestimmt wurde — damit spaeter belegbar ist, WORIN eingewilligt wurde, nicht nur DASS. consent_records traegt keinen Bezug zum Vorgang, deshalb steht der Nachweis hier.';
