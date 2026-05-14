ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS anzahlung_bezahlt_am;

COMMENT ON COLUMN sachverstaendige.stripe_anzahlung_bezahlt_am IS
  'Zeitpunkt der Anzahlung durch Stripe-Webhook bestaetigt. Kanonische Quelle seit AAR-549 S5 (ersetzt anzahlung_bezahlt_am).';;
