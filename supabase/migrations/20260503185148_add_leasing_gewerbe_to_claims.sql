-- CMM-32: Leasing / Gewerbe / Finanzierungs-Felder auf claims.
-- Diese Felder existierten nur auf faelle (Übergangstabelle) und gingen
-- beim Claim-Insert verloren. Jetzt direkt auf claims als SSoT.

ALTER TABLE claims
  -- Gewerbe / Privat
  ADD COLUMN IF NOT EXISTS gewerbe_flag               boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vorsteuerabzugsberechtigt  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS firma_name                 text,
  ADD COLUMN IF NOT EXISTS firma_ustid                text,

  -- Leasing / Finanzierung
  ADD COLUMN IF NOT EXISTS finanzierung_leasing       text     NOT NULL DEFAULT 'keine',
  ADD COLUMN IF NOT EXISTS leasinggeber_name          text,
  ADD COLUMN IF NOT EXISTS finanzierungsgeber_name    text,
  ADD COLUMN IF NOT EXISTS finanzierungsgeber_adresse text,
  ADD COLUMN IF NOT EXISTS finanzierungsgeber_vertragsnr text,
  ADD COLUMN IF NOT EXISTS finanzierung_bank          text;

-- CHECK damit nur valide Enum-Werte landen (spiegelt faelle-Konvention)
ALTER TABLE claims
  ADD CONSTRAINT claims_finanzierung_leasing_check
    CHECK (finanzierung_leasing IN ('keine', 'leasing', 'finanzierung'));

-- Bestehende Rows backfillen: Werte aus faelle übernehmen (1:1 via claim_id)
UPDATE claims c
SET
  gewerbe_flag                  = COALESCE(f.gewerbe_flag, false),
  vorsteuerabzugsberechtigt     = COALESCE(f.vorsteuerabzugsberechtigt, false),
  firma_name                    = f.firma_name,
  firma_ustid                   = f.ust_id,
  finanzierung_leasing          = COALESCE(f.finanzierung_leasing, 'keine'),
  leasinggeber_name             = f.leasinggeber_name,
  finanzierungsgeber_name       = f.finanzierungsgeber_name,
  finanzierungsgeber_adresse    = f.finanzierungsgeber_adresse,
  finanzierungsgeber_vertragsnr = f.finanzierungsgeber_vertragsnr,
  finanzierung_bank             = f.bank_name
FROM faelle f
WHERE f.claim_id = c.id;
