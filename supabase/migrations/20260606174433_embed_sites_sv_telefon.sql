-- AAR-939 Monika-A-Flow — public tel: number fuer den Anruf-Button (sv_embed).
-- NICHT baileys_routing_nummer (die bleibt intern). Cluster-LP nutzt data-phone.
ALTER TABLE embed_sites ADD COLUMN IF NOT EXISTS sv_telefon text;
COMMENT ON COLUMN embed_sites.sv_telefon IS 'Public tel: number for the Monika widget Anruf-button (sv_embed). NOT baileys_routing_nummer.';
