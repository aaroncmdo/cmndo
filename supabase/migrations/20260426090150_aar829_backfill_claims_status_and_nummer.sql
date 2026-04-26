-- AAR-829: Backfill claims.status + claims.claim_nummer (separate Transaktion)
-- Getrennt von DDL weil CREATE INDEX + UPDATE in derselben Transaktion
-- Pending-Trigger-Events-Fehler auslöst (PostgreSQL SQLSTATE 55006).

-- Bestehende 'offen'-Claims → 'dispatch_done'
UPDATE public.claims
   SET status = 'dispatch_done'
 WHERE status = 'offen';

-- claim_nummer für bestehende Rows ohne Nummer
UPDATE public.claims
   SET claim_nummer = 'CLM-'
     || to_char(created_at, 'YYYY') || '-'
     || lpad(nextval('claims_claim_nummer_seq')::text, 5, '0')
 WHERE claim_nummer IS NULL;

-- Statistik
DO $$
DECLARE
  v_total     INT;
  v_mit_num   INT;
  v_dispatch  INT;
BEGIN
  SELECT count(*) INTO v_total    FROM public.claims;
  SELECT count(*) INTO v_mit_num  FROM public.claims WHERE claim_nummer IS NOT NULL;
  SELECT count(*) INTO v_dispatch FROM public.claims WHERE status = 'dispatch_done';

  RAISE NOTICE '
    AAR-829 Backfill abgeschlossen.
    claims gesamt:          %
    mit claim_nummer:       %
    status=dispatch_done:   %

    Nächste Schritte:
      AAR-830: claims.phase Trigger (Phase-Resolver)
      AAR-831: Rollen-RLS (Dispatcher/KB/Admin)',
    v_total, v_mit_num, v_dispatch;
END $$;
