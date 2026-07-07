-- Payment-Ledger-Normalisierung Phase 0 (Design: docs/superpowers/specs/2026-07-07-payment-ledger-normalisierung-design.md)
-- Rein additiv: partei/richtung-Diskriminatoren + ein-Row-pro-(claim,partei). Bestehende Rows
-- sind VS-Eingaenge (COMMENT ON TABLE: "Zahlungseingaenge vom Versicherer") -> DEFAULT 'vs'/'eingang'.
ALTER TABLE public.claim_payments
  ADD COLUMN partei text NOT NULL DEFAULT 'vs'
    CHECK (partei IN ('vs','kunde','sv')),
  ADD COLUMN richtung text NOT NULL DEFAULT 'eingang'
    CHECK (richtung IN ('eingang','auszahlung'));

CREATE UNIQUE INDEX claim_payments_claim_partei_uidx
  ON public.claim_payments (claim_id, partei);

COMMENT ON COLUMN public.claim_payments.partei IS
  'Geldbewegungs-Partei: vs (VS-Eingang) | kunde (Auszahlung) | sv (Honorar-Auszahlung). Ersetzt das tote empfaenger-Split-Schema (Payment-Ledger-Normalisierung).';
COMMENT ON COLUMN public.claim_payments.richtung IS
  'eingang (VS->Claimondo) | auszahlung (Claimondo->kunde/sv). Aus partei ableitbar, explizit fuer Klarheit.';
