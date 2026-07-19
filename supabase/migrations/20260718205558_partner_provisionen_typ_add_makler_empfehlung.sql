ALTER TABLE public.partner_provisionen DROP CONSTRAINT partner_provisionen_partner_typ_check;
ALTER TABLE public.partner_provisionen ADD CONSTRAINT partner_provisionen_partner_typ_check
  CHECK (partner_typ = ANY (ARRAY['makler','werkstatt','firmen_flotte','makler_empfehlung']));
