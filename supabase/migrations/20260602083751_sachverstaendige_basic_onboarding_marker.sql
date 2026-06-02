-- P2a Task 6: Completion-Marker fuer den Basic-Onboarding-Flow. willkommen/page.tsx
-- verzweigt bei paket='basic': Marker gesetzt -> "Pruefung laeuft"-Seite, sonst Wizard.
-- Bewusst KEIN onboarding_status/verifizierung_status — eigener, kollisionsfreier Marker.
ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS basic_onboarding_abgeschlossen_am timestamptz;
COMMENT ON COLUMN public.sachverstaendige.basic_onboarding_abgeschlossen_am IS
  'P2a: Zeitpunkt des Basic-Self-Service-Onboarding-Abschlusses. Steuert die willkommen-Routing-Weiche (Wizard vs. Pending-Review). Live-Schaltung erst durch P3-Freigabe (verifiziert/ist_aktiv/portal_zugang).';
