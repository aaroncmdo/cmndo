-- 2026-07-07 SECURITY: kalender_verbindungen anon-Leak schliessen.
--
-- Befund (Supabase Advisor ERROR rls_disabled_in_public, EXTERNAL/SECURITY):
-- public.kalender_verbindungen (Legacy-Tabelle, abgeloest durch
-- sv_kalender_verbindungen) hatte RLS AUS + 0 Policies + volle Grants fuer
-- anon UND authenticated (SELECT/INSERT/UPDATE/DELETE/TRUNCATE). Damit konnte
-- JEDER mit dem public anon-Key via PostgREST alle Zeilen CalDAV-Credentials
-- (password_encrypted, username, server_url, calendar_url) lesen und sogar
-- loeschen/truncaten. App-Code referenziert die Tabelle NICHT mehr (nur
-- sv_kalender_verbindungen, RLS-gegatet mit 2 Policies).
--
-- Fix: dichtmachen. Non-destruktiv (4 Zeilen bleiben erhalten); service_role,
-- Trigger und SECURITY-DEFINER-Funktionen bleiben unberuehrt (bypassen RLS/Grants).
-- Angewandt via apply_migration (Regel 2), Version == Dateiname == 20260707124217.
ALTER TABLE public.kalender_verbindungen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kalender_verbindungen FROM anon, authenticated;
