-- T2 (operativer-schaden-flow): FM-WhatsApp-Kontaktnummer fuer Schaden-Benachrichtigungen.
-- Nullable, additiv (Metadaten-only, kein Table-Rewrite). Idempotent via IF NOT EXISTS.
alter table public.firmen_flotten_konten
  add column if not exists whatsapp_nummer text;

comment on column public.firmen_flotten_konten.whatsapp_nummer is
  'E.164 WhatsApp-Kontaktnummer des Flottenmanagers fuer Schaden-Benachrichtigungen (T2 operativer-schaden-flow). Nullable; NULL => keine WA-Notif, Fallback greift.';
