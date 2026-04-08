-- KFZ-139: SV White-Label Branding
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS brand_primary TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS brand_secondary TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS use_custom_branding BOOLEAN NOT NULL DEFAULT FALSE;

-- Storage Bucket fuer Gutachter-Logos
INSERT INTO storage.buckets (id, name, public) VALUES ('gutachter-logos', 'gutachter-logos', true) ON CONFLICT DO NOTHING;
