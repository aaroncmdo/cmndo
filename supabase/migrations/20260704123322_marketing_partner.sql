-- P1 Kanonische Partner-Abrechnung: Marketing-Partner-Entitaet (Maik) fuer USt-Status.
-- Maik hatte bisher keine Partner-Tabelle (nur provisionen_maik-Ledger). Additiv.
CREATE TABLE IF NOT EXISTS public.marketing_partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  ist_kleinunternehmer boolean,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_partner ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_partner_admin_all ON public.marketing_partner;
CREATE POLICY marketing_partner_admin_all ON public.marketing_partner
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.marketing_partner (name, email)
  SELECT 'Maik (Marketing)', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.marketing_partner WHERE name = 'Maik (Marketing)');
ALTER TABLE public.provisionen_maik ADD COLUMN IF NOT EXISTS marketing_partner_id uuid REFERENCES public.marketing_partner(id);
