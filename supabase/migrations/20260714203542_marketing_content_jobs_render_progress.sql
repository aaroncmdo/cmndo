-- Render-Fortschrittsbalken: Live-Progress fuer den Render. Der Worker schreibt
-- render_fortschritt (0-100) + render_phase (Label-Key) pro Phase; die Detailseite
-- pollt + zeigt einen Balken. Additiv, nullable, backward-compatible.
ALTER TABLE marketing_content_jobs
  ADD COLUMN render_fortschritt SMALLINT CHECK (render_fortschritt BETWEEN 0 AND 100),
  ADD COLUMN render_phase TEXT;
