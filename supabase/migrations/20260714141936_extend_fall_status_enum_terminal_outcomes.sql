-- B1b-1 der Status-Achsen-Konsolidierung: die 7 feinen Terminal/Outcome-Werte der alten
-- status-Achse werden gueltige operative_status-Werte, damit endzustand-actions sie in B1b-2
-- DIREKT in operative_status schreiben koennen (statt der coarse 'abgeschlossen'). Enum-Extend
-- zuerst, damit der v_claim_base-Cast operative_status::fall_status sie vertraegt (Cast-Bug-Klasse
-- #4267). Werte = exakt die von den endzustand-Settern geschriebenen status-Werte (verifiziert
-- in endzustand-actions.ts): 5 harte Terminals (in ENDZUSTAENDE) + 2 nicht-terminale
-- (in_kommunikation_vs, abgelehnt = bleiben aktiv, nicht in ENDZUSTAENDE). = die claims.status-
-- Outcomes ohne die 3 toten + storniert[schon im Enum] + termin_durchgefuehrt[separate AAR-939-
-- Action]. Additiv, ADD VALUE non-destruktiv. (CHECK-Widening = separate Folge-Migration.)
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'in_kommunikation_vs';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'abgelehnt';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'an_externe_kanzlei_uebergeben';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'reguliert_vollstaendig';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'klage_rechtsstreit';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'verjaehrt';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'abgelehnt_final';
