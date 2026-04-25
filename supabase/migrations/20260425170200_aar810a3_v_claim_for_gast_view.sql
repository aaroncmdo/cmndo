-- AAR-810 A.3.3: v_claim_for_gast — limitierte claim-Sicht für Gast-Accounts
-- Gast sieht nur was er selbst beigetragen hat + öffentliche claim-Daten.
-- Interne Felder (gegner_aktenzeichen, hergang_sv_text, SV-Daten) werden nicht exposed.

CREATE OR REPLACE VIEW public.v_claim_for_gast
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.schadentag,
  c.schadenzeit,
  c.schadenort_ort,
  c.schadenort_plz,
  c.schadenort_land,
  c.schadenort_kategorie,
  c.hergang_kunde_text,
  c.schadenart,
  c.unfall_konstellation,
  c.fahrerflucht,
  c.polizei_aktenzeichen,
  c.polizei_bericht_vorhanden,
  c.bkat_unfallart,
  c.gegner_versicherung_id,
  c.hat_personenschaden,
  c.hat_mietwagen,
  c.unfallskizze_url,
  c.unfallskizze_svg,
  c.status,
  c.created_at,
  c.updated_at
  -- NICHT exposed: geschaedigter_user_id, verursacher_user_id (Privacy),
  --   gegner_aktenzeichen, gegner_versicherungsnummer (Tanners Daten),
  --   hergang_sv_text (interne SV-Reformulierung),
  --   created_via, created_by_user_id (interne Audit-Daten)
FROM public.claims c
WHERE
  EXISTS (
    SELECT 1 FROM public.claim_parties cp
    WHERE cp.claim_id = c.id
      AND cp.user_id = auth.uid()
      AND cp.ist_aktiv = TRUE
  );

COMMENT ON VIEW public.v_claim_for_gast IS
  'AAR-810 A.3: Limitierte claim-Sicht für Gast-Accounts und alle Beteiligten. Zeigt öffentliche claim-Daten ohne interne Felder (gegner_aktenzeichen, hergang_sv_text, etc.).';

GRANT SELECT ON public.v_claim_for_gast TO authenticated;
