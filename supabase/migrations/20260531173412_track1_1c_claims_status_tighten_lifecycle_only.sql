-- T1.1c (D2, Lifecycle-Freeze): Abschluss des work_state-Splits. Post-#2136-Deploy (staging+main)
-- leben die Dispatch-Werte ausschliesslich auf work_state; kein Code schreibt sie mehr auf status.
-- Daher: status der 75 Bestands-Dispatch-Rows nullen (Dispatch lebt in work_state) + CHECK auf
-- die reine Lifecycle/Terminal-Menge verschaerfen (NULL = "noch kein Terminal/VS-Override").
UPDATE public.claims SET status = NULL WHERE status IN ('dispatch_done', 'in_bearbeitung');
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_status_check
  CHECK (status IS NULL OR status = ANY (ARRAY[
    'in_kommunikation_vs'::text, 'reguliert'::text, 'abgelehnt'::text,
    'an_externe_kanzlei_uebergeben'::text, 'storniert'::text, 'reguliert_vollstaendig'::text,
    'klage_rechtsstreit'::text, 'verjaehrt'::text, 'abgelehnt_final'::text, 'termin_durchgefuehrt'::text
  ]));
