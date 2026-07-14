-- Slice 2a Publishing-Workflow: publish_status (entwurf/gepostet) + gepostet_am.
-- Macht video_fertig-Clips postbar + trackbar (manuelles Posten). Additiv/backward-compatible;
-- Bestand -> publish_status='entwurf'. 2b (Auto-Draft-Push) erweitert die CHECK-Werte spaeter.
ALTER TABLE marketing_content_jobs
  ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'entwurf' CHECK (publish_status IN ('entwurf', 'gepostet')),
  ADD COLUMN gepostet_am TIMESTAMPTZ;
