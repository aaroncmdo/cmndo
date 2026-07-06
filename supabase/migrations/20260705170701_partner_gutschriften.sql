-- Partner-Payout-Gutschrift (P3) Task 2: partner_gutschriften table + RLS
-- Self-billing credit notes (§14 Abs. 2 UStG) issued to partners at payout.
-- Separate from the SV-specific `gutschriften` table (do NOT mix).
-- UNIQUE(ledger_tabelle, ledger_id) = one Gutschrift per payout row (idempotency).

CREATE TABLE IF NOT EXISTS public.partner_gutschriften (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_typ text NOT NULL,
  partner_id uuid NOT NULL,
  gutschrift_nr text NOT NULL,
  ledger_tabelle text NOT NULL,
  ledger_id uuid NOT NULL,
  betrag_netto numeric NOT NULL,
  ust_satz numeric,
  ust_betrag numeric,
  betrag_brutto numeric NOT NULL,
  empfaenger_snapshot jsonb NOT NULL,
  aussteller_snapshot jsonb NOT NULL,
  leistung_text text NOT NULL,
  status text NOT NULL DEFAULT 'erstellt',
  pdf_storage_path text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  versendet_am timestamptz,
  UNIQUE (ledger_tabelle, ledger_id)
);

ALTER TABLE public.partner_gutschriften ENABLE ROW LEVEL SECURITY;

-- Admin-Vollzugriff (Cockpit). is_admin() = SECURITY DEFINER, prueft rolle='admin'.
CREATE POLICY pg_admin_all ON public.partner_gutschriften
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Partner-eigene Lesesicht: makler/werkstatt lesen die eigene Gutschrift ueber user_id.
-- marketing_partner hat keinen user_id-Login (intern) -> kein Self-Read-Zweig.
CREATE POLICY pg_partner_self_read ON public.partner_gutschriften
  FOR SELECT TO authenticated
  USING (
    (partner_typ = 'makler' AND EXISTS (
      SELECT 1 FROM public.makler m
      WHERE m.id = partner_gutschriften.partner_id
        AND m.user_id = (SELECT auth.uid())))
    OR
    (partner_typ = 'werkstatt' AND EXISTS (
      SELECT 1 FROM public.werkstaetten w
      WHERE w.id = partner_gutschriften.partner_id
        AND w.user_id = (SELECT auth.uid())))
  );

-- Lehre v_partner_billing-Leak: Supabase-Default-Privs granten anon sonst -> Leak.
REVOKE ALL ON public.partner_gutschriften FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.partner_gutschriften TO authenticated;
