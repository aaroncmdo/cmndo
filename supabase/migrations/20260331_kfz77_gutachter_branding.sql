-- KFZ-77: Gutachter Logo + Brand Colors
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS brand_primary TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS brand_secondary TEXT;
