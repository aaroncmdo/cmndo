-- HOTFIX (revert T1.1c-Tightening 20260531173412): claims_status_check wieder permissiv —
-- dispatch_done + in_bearbeitung re-zulassen.
-- Grund: T1.1c verschaerfte den CHECK auf der GETEILTEN prod+staging-DB, aber NICHT alle Writer
-- liefen schon #2136 (work_state) — andere Sessions/Dev-Branches (+ ggf. der noch nicht
-- redeployte staging/prod-Prozess) schreiben weiter status='dispatch_done'. Folge:
-- "new row for relation claims violates check constraint claims_status_check" -> Fall-Erzeugung
-- gebrochen (verifiziert in Postgres-Logs 17:57 + 1601e3a6-Client-Screenshot). Commit-auf-main
-- != deployter Prozess -> das Tightening war verfrueht.
-- Re-permissiv = un-break in ALLEN Faellen (neuer Code: status=NULL+work_state; alter:
-- status='dispatch_done' -> beide valide). Die T1.1c-Nullung der 75 Bestands-Rows bleibt
-- (harmlos; neuer Reader liest status ?? work_state).
-- Re-Tightening (T1.1c-v2) erst, wenn ALLE Writer bestaetigt auf work_state sind (spaetestens
-- mit dem faelle-Drop) — auf einer geteilten DB darf ein CHECK nie enger sein als der aelteste
-- noch laufende Writer.
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_status_check
  CHECK (status IS NULL OR status = ANY (ARRAY[
    'dispatch_done'::text, 'in_bearbeitung'::text,
    'in_kommunikation_vs'::text, 'reguliert'::text, 'abgelehnt'::text,
    'an_externe_kanzlei_uebergeben'::text, 'storniert'::text, 'reguliert_vollstaendig'::text,
    'klage_rechtsstreit'::text, 'verjaehrt'::text, 'abgelehnt_final'::text, 'termin_durchgefuehrt'::text
  ]));
