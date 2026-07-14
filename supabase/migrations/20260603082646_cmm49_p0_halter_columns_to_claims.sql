-- CMM-49 P0 (halter pilot): migrate faelle.halter_* cluster to claims as flat columns
-- (per HANDOFF docs/03.06.2026 §5 — Aaron 2026-06-03: "neue columns, so wie das handoff es sagt").
-- 8 plain cols + 1 generated (halter_name mirrors faelle.halter_name). Additive, deploy-safe.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS halter_vorname text,
  ADD COLUMN IF NOT EXISTS halter_nachname text,
  ADD COLUMN IF NOT EXISTS halter_strasse text,
  ADD COLUMN IF NOT EXISTS halter_plz text,
  ADD COLUMN IF NOT EXISTS halter_stadt text,
  ADD COLUMN IF NOT EXISTS halter_telefon text,
  ADD COLUMN IF NOT EXISTS halter_email text,
  ADD COLUMN IF NOT EXISTS halter_geburtsdatum date;

-- halter_name: generated, identical expression to faelle.halter_name (references the two cols above).
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS halter_name text
  GENERATED ALWAYS AS (NULLIF(TRIM(BOTH FROM ((COALESCE(halter_vorname, ''::text) || ' '::text) || COALESCE(halter_nachname, ''::text))), ''::text)) STORED;

-- Backfill from faelle (handoff pattern). faelle.halter_* is currently empty (0/75) so this
-- copies 0 rows today; guarded so it never churns updated_at on rows without halter data.
UPDATE public.claims c
SET halter_vorname     = f.halter_vorname,
    halter_nachname    = f.halter_nachname,
    halter_strasse     = f.halter_strasse,
    halter_plz         = f.halter_plz,
    halter_stadt       = f.halter_stadt,
    halter_telefon     = f.halter_telefon,
    halter_email       = f.halter_email,
    halter_geburtsdatum = f.halter_geburtsdatum
FROM public.faelle f
WHERE f.claim_id = c.id
  AND (f.halter_vorname IS NOT NULL OR f.halter_nachname IS NOT NULL
    OR f.halter_strasse IS NOT NULL OR f.halter_plz IS NOT NULL
    OR f.halter_stadt IS NOT NULL OR f.halter_telefon IS NOT NULL
    OR f.halter_email IS NOT NULL OR f.halter_geburtsdatum IS NOT NULL);
