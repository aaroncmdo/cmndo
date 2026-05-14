-- AAR-901: Spalten fuer WhatsApp-Verfuegbarkeitscheck am Lead.
-- Wird von der dispatchMagicLink-Logik (AAR-899) genutzt, um zu entscheiden,
-- ob der Magic-Link per WhatsApp (Baileys, AAR-898) oder per Email gehen
-- soll. hat_whatsapp ist nullable (= noch nicht geprueft).
-- whatsapp_geprueft_am dient als Cache-Stempel — Re-Check nach z.B. 90 Tagen,
-- weil Nummern den WA-Account wechseln koennen.
--
-- Constraint leads_qualifizierungs_phase_check fasst bereits 'disqualifiziert'
-- (siehe Live-Schema 14.05.2026) — keine zusaetzliche Constraint-Aenderung
-- noetig. Mini-Wizard kann 'disqualifiziert' beim Selbstverschulden-Path
-- direkt eintragen.
--
-- Spec: docs/14.05.2026/mini-wizard-magic-link-konzept.md §Datenmodell-Aenderungen.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS hat_whatsapp BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_geprueft_am TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.hat_whatsapp IS
  'AAR-901: TRUE wenn Telefonnummer per Baileys-Lookup auf WhatsApp registriert ist. NULL = noch nicht geprueft.';

COMMENT ON COLUMN public.leads.whatsapp_geprueft_am IS
  'AAR-901: Zeitstempel des letzten Baileys-Lookups. Re-Check nach 90 Tagen.';
