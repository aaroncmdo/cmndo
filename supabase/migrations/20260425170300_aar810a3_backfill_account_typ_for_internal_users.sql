-- AAR-810 A.3.4: Backfill account_typ für bestehende interne User
-- Default ist 'voll' für alle existierenden Rows. Interne User bekommen 'interner_user'.

UPDATE public.profiles
   SET account_typ = 'interner_user'
 WHERE rolle::text IN (
   'admin','dispatch','kundenbetreuer','sachverstaendiger',
   'kanzlei','leadbearbeiter','makler'
 )
   AND account_typ = 'voll';

-- Statistik
DO $$
DECLARE
  v_voll    INT;
  v_gast    INT;
  v_intern  INT;
  v_total   INT;
BEGIN
  SELECT count(*) INTO v_voll   FROM public.profiles WHERE account_typ = 'voll';
  SELECT count(*) INTO v_gast   FROM public.profiles WHERE account_typ = 'gast';
  SELECT count(*) INTO v_intern FROM public.profiles WHERE account_typ = 'interner_user';
  SELECT count(*) INTO v_total  FROM public.profiles;

  RAISE NOTICE '
    AAR-810 Phase A.3 Backfill abgeschlossen.
    profiles total:                     %
      account_typ = voll:               %
      account_typ = gast:               % (sollte 0 sein vor Phase A.4)
      account_typ = interner_user:      %

    Nächste Schritte:
      Phase A.4: Server-Action inviteGegnerViaAirdrop + Frontend-Component
      Phase A.5: Gast-Mini-Dashboard /gegner/[token]/...
      Cron-Job für abgelaufene Tokens (eigenes Sub-Ticket)',
    v_total, v_voll, v_gast, v_intern;
END $$;
