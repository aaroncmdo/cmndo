-- AAR-939 Pay-Auslöser 2 (Billing-Contract 98044b6b, rev 00:15): SV-No-Show.
-- Distinkt von meldeNoShow (claims.kunde_no_show_count = KUNDE-No-Show) und von
-- claims.letzter_sv_no_show_am (claims-Aggregat). Der Billing-Trigger (98044b6b)
-- hoert AFTER UPDATE ON gutachter_termine auf NULL->NOT NULL dieser Spalte.
-- Rein additiv (nullable), kein Backfill noetig.
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS sv_no_show_am timestamptz;

COMMENT ON COLUMN public.gutachter_termine.sv_no_show_am IS
  'AAR-939 Pay-Ausloeser 2: Team markiert, dass der SV zum (committeten) Termin nicht erschienen ist. Distinkt von claims.kunde_no_show_count (meldeNoShow = KUNDE) und claims.letzter_sv_no_show_am (Aggregat). Billing-Trigger (98044b6b) liest es.';
