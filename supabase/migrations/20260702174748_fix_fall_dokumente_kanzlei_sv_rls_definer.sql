-- fall_dokumente RLS: kanzlei + SV Policies lasen claims INLINE (JOIN claims c WHERE
-- service_typ='komplett' bzw. c.sv_id IN ...). Nach CMM-49 (service_typ/sv_id-Ownership
-- zog von faelle nach claims) kann WEDER kanzlei NOCH sv die claims-Tabelle per RLS lesen
-- (claims-SELECT-Policy grantet nur admin/dispatch/kunde/party/KB) -> der policy-interne
-- claims-JOIN liefert 0 -> beide Rollen sahen 0 Dokumente. Selbe Root-Cause wie der
-- mandate/kanban-Innerjoin-Bug (#3466), nur auf RLS-Ebene.
--
-- Fix: inline-claims-Join durch SECURITY-DEFINER-Funktionen ersetzen, die claims intern
-- lesen duerfen. Leak-safe: is_kanzlei()/is_sv_for_claim() scopen die Policy auf die
-- jeweilige Rolle; claim_sichtbar_fuer_aktuellen_user ist fuer kanzlei komplett-gescoped.

DROP POLICY IF EXISTS "Kanzlei liest fall_dokumente" ON public.fall_dokumente;
CREATE POLICY "Kanzlei liest fall_dokumente" ON public.fall_dokumente
FOR SELECT TO public
USING (
  public.is_kanzlei()
  AND public.claim_sichtbar_fuer_aktuellen_user(claim_id)
  AND (sichtbar_fuer @> ARRAY['kanzlei'::text])
);

DROP POLICY IF EXISTS "SV liest sichtbare Fall-Dokumente" ON public.fall_dokumente;
CREATE POLICY "SV liest sichtbare Fall-Dokumente" ON public.fall_dokumente
FOR SELECT TO public
USING (
  public.is_sv_for_claim(claim_id)
  AND (sichtbar_fuer @> ARRAY['sachverstaendiger'::text])
);
