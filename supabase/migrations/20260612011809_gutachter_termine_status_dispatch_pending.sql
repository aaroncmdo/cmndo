-- AAR-956 Dead-Pin-Fallback (b2): status='dispatch_pending' fuer Dead-Pin-Buchungen
-- (assignee_typ='sv_lead'). Exclusion-Constraint gutachter_termine_no_assignee_overlap
-- listet diesen Status NICHT -> Dead-Pins sind "immer buchbar"; beim Dispatch-Reassign
-- (-> reserviert/bestaetigt) greift die Constraint wieder und schuetzt den Partner.
-- Superset des bestehenden CHECK -> alle Bestands-Zeilen bleiben valide.
ALTER TABLE public.gutachter_termine DROP CONSTRAINT gutachter_termine_status_check;
ALTER TABLE public.gutachter_termine ADD CONSTRAINT gutachter_termine_status_check
  CHECK (status = ANY (ARRAY[
    'reserviert'::text, 'bestaetigt'::text, 'abgelehnt'::text, 'abgesagt'::text,
    'storniert'::text, 'abgeschlossen'::text, 'sv_gesucht'::text, 'gegenvorschlag'::text,
    'verschoben'::text, 'verlegt'::text, 'verlegung_pending'::text, 'dispatch_pending'::text
  ]));
