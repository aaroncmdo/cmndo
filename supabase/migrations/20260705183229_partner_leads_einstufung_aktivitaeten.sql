-- Partner-CRM Slice A: Lead-Einstufung (Klassifikation) + Aktivitaets-Log (Anrufnotiz etc.).
-- einstufung: heiss/warm/kalt (null = noch einzustufen; "alle Leads muessen eingestuft werden").
-- partner_lead_aktivitaeten: CRM-Interaktions-Timeline pro Lead (Anruf/Notiz/Email/...).
-- Additiv. Anon per REVOKE + RLS gegated (Staff: admin/dispatch/leadbearbeiter).
ALTER TABLE public.partner_leads ADD COLUMN IF NOT EXISTS einstufung text
  CHECK (einstufung IS NULL OR einstufung IN ('heiss','warm','kalt'));

CREATE TABLE public.partner_lead_aktivitaeten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_lead_id uuid NOT NULL REFERENCES public.partner_leads(id) ON DELETE CASCADE,
  typ text NOT NULL CHECK (typ IN ('anruf','notiz','email','status_aenderung','einstufung','sonstiges')),
  text text,
  erstellt_von uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_lead_akt_lead ON public.partner_lead_aktivitaeten (partner_lead_id, erstellt_am DESC);
ALTER TABLE public.partner_lead_aktivitaeten ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_lead_aktivitaeten FROM anon;
CREATE POLICY partner_lead_akt_staff_all ON public.partner_lead_aktivitaeten FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle IN ('admin','dispatch','leadbearbeiter')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle IN ('admin','dispatch','leadbearbeiter')));
