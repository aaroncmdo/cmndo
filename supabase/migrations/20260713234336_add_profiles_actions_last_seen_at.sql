-- Projekt A / Slice A2: per-user seen-cursor fuer Action-Items (Zwei-Stufen-Badges).
-- Analog zu profiles.updates_last_seen_at (Info-Feed-Cursor). Nullable, additiv, kein Default
-- (kein Table-Rewrite). Die rote Badge-Zahl = Action-Items mit Timestamp > actions_last_seen_at;
-- nach "Alles gesehen" (Cursor vorgeschoben) werden sie grau/gesehen, erledigt loescht sie ganz.
-- Recorded version 20260713234336 (Supabase-Plugin apply_migration, Regel 2).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS actions_last_seen_at timestamptz;
