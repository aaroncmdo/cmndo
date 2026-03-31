-- BUG-34: Fix paket values that may still have old keys
UPDATE sachverstaendige SET paket = 'standard' WHERE paket IN ('starter', 'Starter', 'starter-10');
UPDATE sachverstaendige SET paket = 'pro' WHERE paket IN ('Pro', 'standard-25');
UPDATE sachverstaendige SET paket = 'premium' WHERE paket IN ('Premium', 'premium-50');

-- Ensure all SVs have ist_aktiv set (not NULL)
UPDATE sachverstaendige SET ist_aktiv = true WHERE ist_aktiv IS NULL;
