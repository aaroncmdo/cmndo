-- WS2a (Reduced-Repair, Kasko-frei): Werkstattbindung der eigenen Kasko-Police.
-- null = nicht gefragt/unbekannt · true = freie Werkstattwahl (wir vermitteln) ·
-- false = an Versicherer-Werkstatt gebunden (KaskoEndansicht, keine Vermittlung).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS freie_werkstattwahl boolean;
