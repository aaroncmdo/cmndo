-- P2.2 (Unisone Termin-Engine): additive Schema-Adds. Rein additiv, low-risk.
-- quelle/bezug_typ als text+CHECK (Muster: bestehendes gutachter_termine_assignee_typ_check),
-- bewusst KEIN enum. bezug_typ-Werte = claim/fall/lead (== v_belegung-Ableitung + engine BezugTyp).
ALTER TABLE public.gutachter_termine
  ADD COLUMN quelle         text,
  ADD COLUMN bezug_typ      text,
  ADD COLUMN bezug_id       uuid,
  ADD COLUMN reserviert_bis timestamptz;

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_quelle_check
    CHECK (quelle IS NULL OR quelle = ANY (ARRAY['dispatch','self_service','manuell'])),
  ADD CONSTRAINT gutachter_termine_bezug_typ_check
    CHECK (bezug_typ IS NULL OR bezug_typ = ANY (ARRAY['claim','fall','lead'])),
  -- bezug_typ und bezug_id sind ein Paar: beide NULL oder beide gesetzt.
  ADD CONSTRAINT gutachter_termine_bezug_paar_check
    CHECK ((bezug_typ IS NULL) = (bezug_id IS NULL));

-- Backfill bezug_* aus bestehenden FKs (Praezedenz wie v_belegung: claim > fall > lead).
UPDATE public.gutachter_termine
SET bezug_typ = CASE
      WHEN claim_id IS NOT NULL THEN 'claim'
      WHEN fall_id  IS NOT NULL THEN 'fall'
      WHEN lead_id  IS NOT NULL THEN 'lead'
    END,
    bezug_id = COALESCE(claim_id, fall_id, lead_id)
WHERE bezug_typ IS NULL
  AND (claim_id IS NOT NULL OR fall_id IS NOT NULL OR lead_id IS NOT NULL);
