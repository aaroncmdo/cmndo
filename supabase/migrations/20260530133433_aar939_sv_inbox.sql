-- AAR-939 · Monika-Embed · Stream 7 — SV-Lead-Inbox.
-- (1) SELECT-Policy: SV sieht seine sv_embed-Anfragen. Owner-Scope ueber
--     embed_site_id -> embed_sites.inhaber_profile_id (zugeordneter_sv_id ist bei
--     sv_embed immer NULL). auth.uid() in (select ...) gewickelt (InitPlan-Opt).
-- (2) Spaltenreduzierte View (security_invoker=true -> gfa-RLS + Policy greifen;
--     gclid/utm/page_url/origin_domain bleiben bewusst aussen vor, Datenschutz).

DROP POLICY IF EXISTS gfa_select_sv_own ON public.gutachter_finder_anfragen;
CREATE POLICY gfa_select_sv_own ON public.gutachter_finder_anfragen
  FOR SELECT TO authenticated
  USING (
    source = 'sv_embed'
    AND embed_site_id IN (
      SELECT id FROM public.embed_sites WHERE inhaber_profile_id = (select auth.uid())
    )
  );

CREATE OR REPLACE VIEW public.v_sv_inbox WITH (security_invoker = true) AS
SELECT
  a.id, a.vorname, a.nachname, a.telefon, a.email,
  a.schadentyp, a.schadens_kurzbeschreibung, a.schadenort,
  a.wunschtermin_wann, a.bevorzugter_kanal,
  a.status, a.variante, a.embed_site_id, a.termin_id,
  a.konvertiert_zu_lead_id, a.abrechnungs_relevant, a.abrechnungs_betrag_eur,
  a.erstellt_am,
  s.name AS site_name, s.slug AS site_slug
FROM public.gutachter_finder_anfragen a
JOIN public.embed_sites s ON s.id = a.embed_site_id
WHERE a.source = 'sv_embed';

GRANT SELECT ON public.v_sv_inbox TO authenticated;
