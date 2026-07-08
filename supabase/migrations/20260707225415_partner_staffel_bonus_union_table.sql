-- Provisions-Ledger-Unifikation Phase 0 (additiv): partner_staffel_bonus als Union von
-- makler_staffel_bonus + werkstatt_staffel_bonus (Spalten identisch) mit partner_typ.
-- Rein additiv -> verhaltensneutral. Gleiche RLS-Semantik wie partner_provisionen.
CREATE TABLE public.partner_staffel_bonus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_typ text NOT NULL CHECK (partner_typ IN ('makler','werkstatt')),
  partner_id uuid NOT NULL,
  stufe_id uuid,
  schwelle integer,
  bonus_betrag_netto numeric,
  ust_satz numeric,
  ust_betrag numeric,
  betrag_brutto numeric,
  status text,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_staffel_bonus ENABLE ROW LEVEL SECURITY;

CREATE POLICY psb_admin_all ON public.partner_staffel_bonus FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid())
    AND (p.rolle = 'admin'::user_role
      OR (p.rolle = 'kundenbetreuer'::user_role AND partner_staffel_bonus.partner_typ = 'makler'))))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid())
    AND (p.rolle = 'admin'::user_role
      OR (p.rolle = 'kundenbetreuer'::user_role AND partner_staffel_bonus.partner_typ = 'makler'))));

CREATE POLICY psb_partner_read ON public.partner_staffel_bonus FOR SELECT
  USING (
    (partner_staffel_bonus.partner_typ = 'makler'
       AND EXISTS (SELECT 1 FROM makler m WHERE m.id = partner_staffel_bonus.partner_id AND m.user_id = (SELECT auth.uid())))
    OR
    (partner_staffel_bonus.partner_typ = 'werkstatt'
       AND EXISTS (SELECT 1 FROM werkstaetten w WHERE w.id = partner_staffel_bonus.partner_id AND w.user_id = (SELECT auth.uid())))
  );

REVOKE ALL ON public.partner_staffel_bonus FROM anon;
