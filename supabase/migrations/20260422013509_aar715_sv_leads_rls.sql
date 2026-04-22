-- AAR-715: leads-RLS — Sachverständiger darf Lead seines zugewiesenen Falls lesen.
--
-- Symptom: In /gutachter/fall/<id> tauchten Kunden-Stammdaten (Name, Telefon,
-- Email, FIN, Vorschäden) nicht auf — der SELECT auf leads lieferte null,
-- weil keine RLS-Policy für sachverstaendiger existierte. Vorhandene Policies
-- decken nur admin/dispatch/leadbearbeiter/kundenbetreuer/kanzlei/makler ab.
--
-- Scope: SV liest Lead nur dann, wenn ein zugehöriger Fall existiert dessen
-- sv_id seinem eigenen Sachverständigen-Profil entspricht. Kein Read über
-- den Lead-Pool hinaus, keine UPDATE/INSERT-Rechte.

CREATE POLICY "leads_sv_read"
ON public.leads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.faelle f
    JOIN public.sachverstaendige sv ON sv.id = f.sv_id
    JOIN public.profiles p ON p.id = sv.profile_id
    WHERE f.lead_id = leads.id
      AND p.id = auth.uid()
      AND p.rolle = 'sachverstaendiger'::user_role
  )
);
