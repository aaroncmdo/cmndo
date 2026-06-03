-- CMM-50.2: business-Domaene faelle -> claims. leasinggeber_name (Leasing-Gesellschaft,
-- distinkt von finanzierungsgeber_name = Kredit-Finanzierer) + finanzierung_bank
-- (aus faelle.bank_name, bewusste Umbenennung). Additiv + Backfill via claim_id.
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS leasinggeber_name text,
  ADD COLUMN IF NOT EXISTS finanzierung_bank text;

COMMENT ON COLUMN public.claims.leasinggeber_name IS 'CMM-50.2: Leasinggeber (Leasing-Gesellschaft; distinkt von finanzierungsgeber_name = Kredit-Finanzierer). Quelle faelle.leasinggeber_name / lead.leasing_geber.';
COMMENT ON COLUMN public.claims.finanzierung_bank IS 'CMM-50.2: Finanzierungs-Bank (bewusste Umbenennung von faelle.bank_name). Quelle faelle.bank_name / lead.finanzierung_bank.';

-- Backfill aus faelle (claim_id-Join; IS-NOT-NULL-guarded; live 0 Zeilen mit Daten,
-- aber Prod-Pattern + reproduzierbar). COALESCE schuetzt evtl. schon gesetzte claims-Werte.
UPDATE public.claims c
SET leasinggeber_name = COALESCE(c.leasinggeber_name, f.leasinggeber_name),
    finanzierung_bank = COALESCE(c.finanzierung_bank, f.bank_name)
FROM public.faelle f
WHERE f.claim_id = c.id
  AND (f.leasinggeber_name IS NOT NULL OR f.bank_name IS NOT NULL);
