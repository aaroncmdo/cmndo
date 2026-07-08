-- Provisions-Ledger-Unifikation Phase 0 (additiv): partner_provisionen als Union von
-- makler_provisionen + werkstatt_provisionen mit partner_typ-Diskriminator. Reader/Writer
-- ziehen erst in Phase 1/2 um; hier rein additiv -> verhaltensneutral.
-- Design: docs/superpowers/specs/2026-07-08-provision-gutschrift-ledger-assessment.md §3.
CREATE TABLE public.partner_provisionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_typ text NOT NULL CHECK (partner_typ IN ('makler','werkstatt')),
  partner_id uuid NOT NULL,
  claim_id uuid,
  fall_id uuid,
  lead_id uuid,                 -- makler-spezifisch (werkstatt: null)
  promotion_code_id uuid,       -- makler-spezifisch
  service_typ text,             -- makler-spezifisch
  abrechnung_id uuid,           -- makler-spezifisch
  claim_nummer text,            -- werkstatt-spezifisch (makler: null)
  ausgezahlt_am timestamptz,    -- werkstatt-spezifisch
  betrag_netto_eur numeric,
  ust_satz numeric,
  ust_betrag numeric,
  betrag_brutto numeric,
  trigger_event text,
  trigger_at timestamptz,
  hold_until timestamptz,
  status text,
  storniert_am timestamptz,
  storno_grund text,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_provisionen ENABLE ROW LEVEL SECURITY;

-- Admin/KB-Policy bewahrt die Quell-Asymmetrie: makler_provisionen erlaubte admin+kundenbetreuer,
-- werkstatt_provisionen nur admin -> hier KB nur fuer partner_typ='makler'.
-- FLAG: moegliche Alt-Inkonsistenz (werkstatt hatte kein KB) -> Haertung auf admin-only waere
-- eine SEPARATE bewusste Entscheidung, nicht Teil dieser verhaltensneutralen Migration.
CREATE POLICY pp_admin_all ON public.partner_provisionen FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid())
    AND (p.rolle = 'admin'::user_role
      OR (p.rolle = 'kundenbetreuer'::user_role AND partner_provisionen.partner_typ = 'makler'))))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid())
    AND (p.rolle = 'admin'::user_role
      OR (p.rolle = 'kundenbetreuer'::user_role AND partner_provisionen.partner_typ = 'makler'))));

-- Partner-self-read (wie mp_makler_read / wp_werkstatt_read, typ-verzweigt).
CREATE POLICY pp_partner_read ON public.partner_provisionen FOR SELECT
  USING (
    (partner_provisionen.partner_typ = 'makler'
       AND EXISTS (SELECT 1 FROM makler m WHERE m.id = partner_provisionen.partner_id AND m.user_id = (SELECT auth.uid())))
    OR
    (partner_provisionen.partner_typ = 'werkstatt'
       AND EXISTS (SELECT 1 FROM werkstaetten w WHERE w.id = partner_provisionen.partner_id AND w.user_id = (SELECT auth.uid())))
  );

REVOKE ALL ON public.partner_provisionen FROM anon;
