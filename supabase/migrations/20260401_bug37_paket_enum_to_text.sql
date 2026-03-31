-- BUG-37: paket ENUM sv_paket → TEXT (alte Werte auf neue migriert)
ALTER TABLE sachverstaendige ALTER COLUMN paket DROP DEFAULT;
ALTER TABLE sachverstaendige ALTER COLUMN paket TYPE TEXT USING paket::TEXT;
ALTER TABLE sachverstaendige ALTER COLUMN paket SET DEFAULT 'standard';

UPDATE sachverstaendige SET paket = 'standard' WHERE paket IN ('starter-10', 'starter', 'Starter');
UPDATE sachverstaendige SET paket = 'pro' WHERE paket IN ('standard-25', 'Pro');
UPDATE sachverstaendige SET paket = 'premium' WHERE paket IN ('premium-50', 'Premium');

DROP TYPE IF EXISTS sv_paket;
UPDATE sachverstaendige SET ist_aktiv = true WHERE ist_aktiv IS NULL;
