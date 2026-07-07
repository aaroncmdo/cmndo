-- 2026-07-07: abrechnungen.status um 'im_einzug' erweitern (SEPA-Lastschrift in-flight).
-- Additiv (Superset der erlaubten Werte). Tabelle leer -> kein Row-Risiko.
-- Angewandt via apply_migration (Regel 2), Version == Dateiname == 20260707083705.
ALTER TABLE public.abrechnungen DROP CONSTRAINT abrechnungen_status_check;
ALTER TABLE public.abrechnungen ADD CONSTRAINT abrechnungen_status_check
  CHECK (status = ANY (ARRAY['entwurf'::text, 'versendet'::text, 'bezahlt'::text, 'ueberfaellig'::text, 'storniert'::text, 'fehlgeschlagen'::text, 'im_einzug'::text]));
