-- 2026-05-23: DSGVO-Einwilligungs-Zeitstempel auf der Anfragen-Inbox.
-- Spiegelt das bestehende Pattern von gutachter_finder_anfragen.dsgvo_zustimmung_am
-- (gleicher public-facing Lead-Inbound-Kontext). Die Lead-Server-Actions
-- (submitHomeLead / submitKfzgutachterLead / kuenftig submitAutounfallLead) setzen
-- den Zeitstempel, sobald der Nutzer die DSGVO-Einwilligung erteilt.
-- NULL = keine erfasste Einwilligung (Legacy-Zeilen / Nicht-Form-Channels).
-- Additiv + nullable -> bestehende anfragen-Inserts bleiben kompatibel.
-- Scope: ausschliesslich public.anfragen (NICHT leads, NICHT andere Tabellen).

ALTER TABLE public.anfragen
  ADD COLUMN IF NOT EXISTS dsgvo_zustimmung_am timestamptz;

COMMENT ON COLUMN public.anfragen.dsgvo_zustimmung_am IS
  'Zeitstempel der DSGVO-Einwilligung beim Formular-Submit. NULL = keine erfasste Einwilligung. Server-Action setzt now() bei Consent. Spiegelt gutachter_finder_anfragen.dsgvo_zustimmung_am.';
