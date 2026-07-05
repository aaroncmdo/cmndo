-- P1 Kanonische Partner-Abrechnung: USt-Freeze-Spalten auf den 5 Auszahlungs-Ledgern.
-- Nullable, werden beim Auszahlen von auszahlenProvision() eingefroren (Gutschrift-Audit-Trail).
ALTER TABLE public.makler_provisionen      ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.werkstatt_provisionen   ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.provisionen_maik        ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.makler_staffel_bonus    ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.werkstatt_staffel_bonus ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
