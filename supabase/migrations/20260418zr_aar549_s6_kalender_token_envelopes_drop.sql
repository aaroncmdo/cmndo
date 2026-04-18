-- AAR-549 S6: Alte Kalender-Token-Envelopes auf sachverstaendige gedroppt.
--
-- Vorher: zwei parallele Kalender-Integration-Systeme auf sachverstaendige:
--   System A (alt, JSON-Envelope):
--     - google_calendar_token  (Json, enthielt {access,refresh,expiry})
--     - outlook_calendar_token (Json, für Outlook — OAuth nie gebaut)
--     - kalender_typ, kalender_sync_aktiv, kalender_sync_letzte
--     Nur /api/kalender-eintragen + /api/kalender-sync lasen diese Felder,
--     beide Routes waren orphan (keine Caller in der Codebasis).
--
--   System B (neu, detailliert):
--     - gcal_access_token, gcal_refresh_token, gcal_token_expiry
--     - gcal_connected, gcal_calendar_id
--     Kompletter OAuth-Flow via /api/auth/google-calendar/{connect,callback,disconnect}
--     + /api/gutachter/calendar für Token-Refresh.
--
-- Nachher: nur noch System B (gcal_*). Keine Outlook-Integration — der
-- Envelope war nie an OAuth angeschlossen.
--
-- Regel #14 Verification (Stand 2026-04-18):
--   - 4/4 SVs haben google_calendar_token IS NULL
--   - 4/4 SVs haben outlook_calendar_token IS NULL
--   - 4/4 SVs haben gcal_access_token IS NULL
--   - 4/4 SVs haben gcal_connected=false oder IS NULL
--   - 0 aktive Integration in Prod → keine Daten gehen verloren
--
-- Code-Sweep (siehe Commit-Body):
--   - src/app/api/kalender-eintragen/route.ts → GELÖSCHT (orphan)
--   - src/app/api/kalender-sync/route.ts → GELÖSCHT (orphan)
--   - database.types.ts: Row/Insert/Update-Einträge für die 2 Spalten entfernt
--
-- kalender_typ + kalender_sync_aktiv + kalender_sync_letzte bleiben:
-- UI in gutachter/profil zeigt darauf Status-Text an, ist aber UI-only.
-- Die Felder werden von KalenderConnectStep-Opt-Out-Pfad gesetzt.
-- Cleaner Konsolidierung (kalender_* → gcal_*) ist ein separates Ticket.

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS google_calendar_token;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS outlook_calendar_token;

COMMENT ON COLUMN sachverstaendige.gcal_access_token IS
  'Google OAuth Access-Token. Kanonische Quelle seit AAR-549 S6 (ersetzt google_calendar_token). Wird via /api/auth/google-calendar/callback befüllt.';

COMMENT ON COLUMN sachverstaendige.gcal_refresh_token IS
  'Google OAuth Refresh-Token. Gepaart mit gcal_access_token + gcal_token_expiry.';
