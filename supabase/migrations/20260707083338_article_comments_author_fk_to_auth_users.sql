-- Damit registrierte Partner (ohne community_profiles-Zeile) unter ihrer Firma auf
-- /wissen-Artikeln kommentieren koennen, wird die author_id-FK von community_profiles
-- auf auth.users gelockert. Der Anzeigename kommt dann aus author_display (von
-- submitComment aus community_my_identity gesetzt) statt aus dem community_profiles-Join.
--
-- BACKFILL 11.07.: Diese Migration war auf Prod appliziert (schema_migrations version
-- 20260707083338), aber das File fehlte im Repo (Drift). Inhalt exakt aus
-- schema_migrations.statements rekonstruiert. Kein Re-Apply — nur File-Nachtrag.

-- Schritt 1: Bestandszeilen backfillen, damit ihr Name nach dem Wegfall des Joins erhalten bleibt.
update public.article_comments ac
set author_display = cp.username
from public.community_profiles cp
where ac.author_id = cp.user_id and ac.author_display is null;

-- Schritt 2: FK lockern (community_profiles -> auth.users). Bestehende author_id-Werte sind
-- community_profiles.user_id = auth.users.id, erfuellen also die neue FK. RLS-Insert-Policy
-- (comments_insert_own_pending) erlaubt Partner bereits (NOT EXISTS is_blocked-Zeile = true).
alter table public.article_comments drop constraint if exists article_comments_author_id_fkey;
alter table public.article_comments add constraint article_comments_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete cascade;
