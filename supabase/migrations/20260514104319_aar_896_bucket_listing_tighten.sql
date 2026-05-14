-- AAR-896 — Public-Bucket SELECT-Policies einengen
--
-- Advisor `public_bucket_allows_listing`: 3 Buckets haben breite SELECT-Policy
-- die clients erlaubt alle Files zu listen. Public-URLs (getPublicUrl()) brauchen
-- die SELECT-Policy NICHT — Object-GETs laufen via CDN/Edge ohne RLS-Eval,
-- weil die Buckets public=true sind.
--
-- Code-Audit:
--   avatare          → 1 .list()-Caller in lib/profile/avatar.ts:59 (removeAvatar,
--                      listet eigenes Folder zum Löschen)
--   gutachter-logos  → 0 .list()-Caller, nur getPublicUrl() in 3 Files
--   profile          → 0 Caller im Code
--
-- Fix:
--   gutachter-logos + profile: SELECT-Policy DROP (Public-URLs bleiben)
--   avatare: DROP + REPLACE mit eingeengter Policy für authenticated, die nur
--            das eigene <user_id>/-Folder listbar macht

-- ─────────────────────────────────────────────────────────────────────
-- 1. gutachter-logos: SELECT-Policy droppen
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "gutachter_logos_select" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────
-- 2. profile: SELECT-Policy droppen
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profile_select" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────
-- 3. avatare: SELECT-Policy einengen auf eigenes <user_id>/-Folder
--    User listet nur sein eigenes Avatar-Folder (für removeAvatar()).
--    Public-Read von Avatar-URLs bleibt funktional via public=true Bucket.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "avatare_public_read" ON storage.objects;

CREATE POLICY "avatare_owner_list" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatare'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
