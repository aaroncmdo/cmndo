-- AAR-839 Step 4/8: claims.status CHECK-Constraint umstellen
--
-- Alt (9 Werte): dispatch_done, in_bearbeitung, abgeschlossen, storniert,
--                offen, reguliert_teilweise, reguliert_vollstaendig,
--                abgelehnt, verjaehrt
--
-- Neu (7 Werte): dispatch_done, in_bearbeitung, in_kommunikation_vs,
--                reguliert, abgelehnt, an_externe_kanzlei_uebergeben,
--                storniert
--
-- Reihenfolge: Diese Migration läuft NACH dem Backfill (Step 2). Heißt:
-- alle prod-Rows haben bereits einen der 7 neuen Werte, der CHECK kann
-- ohne Violation aktiviert werden.

ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_status_check;

ALTER TABLE public.claims ADD CONSTRAINT claims_status_check CHECK (
  status = ANY (ARRAY[
    'dispatch_done'::text,
    'in_bearbeitung'::text,
    'in_kommunikation_vs'::text,
    'reguliert'::text,
    'abgelehnt'::text,
    'an_externe_kanzlei_uebergeben'::text,
    'storniert'::text
  ])
);

COMMENT ON CONSTRAINT claims_status_check ON public.claims IS
  'AAR-839: 7 Status-Werte. Endzustände (reguliert/abgelehnt/an_externe_kanzlei_uebergeben/storniert) '
  'werden manuell durch KB/Admin via markClaimAs*-Actions (AAR-840) gesetzt. '
  'Phase 6 wird durch in_kommunikation_vs ODER vs_korrespondenz-Existenz getriggert.';
