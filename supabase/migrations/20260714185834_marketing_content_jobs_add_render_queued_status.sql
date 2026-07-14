-- Slice 3: Render-Worker-Queue. Neuer Status `render_queued` — `freigeben` enqueued nur noch,
-- der Render-Worker (Cron + Fast-Path) holt Jobs aus der Queue und rendert sie serialisiert.
-- Additiv (+1 erlaubter Wert), backward-compatible: bestehende Werte bleiben gueltig.
ALTER TABLE marketing_content_jobs DROP CONSTRAINT marketing_content_jobs_status_check;
ALTER TABLE marketing_content_jobs ADD CONSTRAINT marketing_content_jobs_status_check
  CHECK (status = ANY (ARRAY['entwurf'::text, 'skript_generiert'::text, 'render_queued'::text, 'audio_erzeugt'::text, 'video_fertig'::text, 'fehler'::text]));
