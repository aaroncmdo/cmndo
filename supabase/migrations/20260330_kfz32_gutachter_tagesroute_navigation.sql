-- KFZ-32: Gutachter Tagesroute In-App Navigation + Offline-Dokumente

ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS ankunft_zeit TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS abschluss_zeit TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS uebersprungen BOOLEAN DEFAULT false;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS uebersprung_grund TEXT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS notizen_vor_ort TEXT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS gps_lat_ankunft DECIMAL(10,7);
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS gps_lng_ankunft DECIMAL(10,7);
