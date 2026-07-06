-- Partner-Payout-Gutschrift (P3) Task 1: Daten-Prereq
-- Additive tax-data fields so a legally valid self-billing Gutschrift can be issued.
-- werkstaetten: add ust_id (already has name + adresse_* + ist_kleinunternehmer + bank_iban).
-- marketing_partner: add ust_id + adresse_* (had only name + ist_kleinunternehmer).
-- makler already complete (firma, adresse_*, ust_id, ist_kleinunternehmer) -> unchanged.

ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ust_id text;

ALTER TABLE public.marketing_partner
  ADD COLUMN IF NOT EXISTS ust_id text,
  ADD COLUMN IF NOT EXISTS adresse_strasse text,
  ADD COLUMN IF NOT EXISTS adresse_plz text,
  ADD COLUMN IF NOT EXISTS adresse_ort text;
