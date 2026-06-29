-- #updates-rebuild Phase 0: Read-Marker fuer den Info-Feed des Updates-Felds.
-- Ein Timestamp pro User; "Alles gesehen" setzt updates_last_seen_at=now().
-- Treibt NICHT den Badge (der zaehlt nur abgeleitete offene Action-Items).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updates_last_seen_at timestamptz;
