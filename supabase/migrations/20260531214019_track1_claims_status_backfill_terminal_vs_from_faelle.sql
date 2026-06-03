-- T1.2 step b''' (CMM-49 Lifecycle-Achse): one-time backfill of existing terminal/VS
-- faelle -> claims.status, so claims.status also carries reality for cases that became
-- terminal BEFORE b' deployed (b' only dual-writes future transitions). Idempotent:
-- only where claims.status IS NULL (no clobber of existing values / direct writers).
-- Mapping is identical to b' (src/lib/faelle/fall-status-claim-mapping.ts).
--
-- As of 31.05.2026 this matches 0 rows (all 75 faelle active: sv-termin/ersterfassung/
-- gutachten-eingegangen, no terminals) -> pure safety-net. zahlung-eingegangen is
-- deliberately NOT mapped (-> claim_payments, no claims.status; same as b'). klage /
-- vs-kuerzt are not fall_status enum values -> not applicable.
UPDATE public.claims c
SET status = CASE f.status
    WHEN 'storniert'          THEN 'storniert'
    WHEN 'abgeschlossen'      THEN 'reguliert_vollstaendig'
    WHEN 'vs-abgelehnt'       THEN 'abgelehnt'
    WHEN 'regulierung'        THEN 'in_kommunikation_vs'
    WHEN 'regulierung-laeuft' THEN 'in_kommunikation_vs'
  END
FROM public.faelle f
WHERE f.claim_id = c.id
  AND c.status IS NULL
  AND f.status IN ('storniert','abgeschlossen','vs-abgelehnt','regulierung','regulierung-laeuft');
