-- Partner-Vertriebsdashboard Sub-1: kanonisches partner_leads-Modell + partner_rollen_policy.
-- Prospect-Schicht VOR den bestehenden Rollen-Tabellen (sachverstaendige/werkstaetten/makler).
-- partner_rollen_policy parametrisiert die Aktivierungs-Gates pro Rolle (DB-getrieben):
--   makler = auto-konvertieren (sofort aktiv) · sachverstaendiger = review+Stripe · werkstatt = admin-only (kein self_signup).
-- Additiv (kein Drop). Anon per REVOKE + RLS gegated (kein Leak).
CREATE TABLE public.partner_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolle text NOT NULL CHECK (rolle IN ('sachverstaendiger','werkstatt','makler')),
  status text NOT NULL DEFAULT 'neu'
    CHECK (status IN ('neu','kontaktiert','qualifiziert','onboarding','aktiv','abgelehnt','kein_interesse')),
  firma text,
  ansprechpartner_vorname text,
  ansprechpartner_nachname text,
  email text NOT NULL,
  telefon text,
  plz text,
  ort text,
  source_channel text NOT NULL DEFAULT 'admin'
    CHECK (source_channel IN ('self_signup','marketing_bewerbung','dat_import','admin','empfehlung')),
  rollen_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  zugewiesen_an uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  konvertiert_zu_user_id uuid,
  konvertiert_zu_partner_id uuid,
  konvertiert_am timestamptz,
  konvertiert_durch uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_leads_rolle_status ON public.partner_leads (rolle, status);
CREATE INDEX idx_partner_leads_email ON public.partner_leads (lower(email));
CREATE INDEX idx_partner_leads_zugewiesen ON public.partner_leads (zugewiesen_an);

ALTER TABLE public.partner_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_leads FROM anon;
CREATE POLICY partner_leads_staff_all ON public.partner_leads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle IN ('admin','dispatch','leadbearbeiter')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle IN ('admin','dispatch','leadbearbeiter')));

CREATE TABLE public.partner_rollen_policy (
  rolle text PRIMARY KEY CHECK (rolle IN ('sachverstaendiger','werkstatt','makler')),
  self_signup_erlaubt boolean NOT NULL DEFAULT false,
  braucht_review boolean NOT NULL DEFAULT true,
  braucht_zahlung boolean NOT NULL DEFAULT false,
  auto_konvertieren boolean NOT NULL DEFAULT false,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_rollen_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_rollen_policy FROM anon;
CREATE POLICY partner_policy_read ON public.partner_rollen_policy FOR SELECT TO authenticated USING (true);
CREATE POLICY partner_policy_admin_write ON public.partner_rollen_policy FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));

INSERT INTO public.partner_rollen_policy (rolle, self_signup_erlaubt, braucht_review, braucht_zahlung, auto_konvertieren) VALUES
  ('makler',            true,  false, false, true),
  ('sachverstaendiger', true,  true,  true,  false),
  ('werkstatt',         false, true,  false, false);
