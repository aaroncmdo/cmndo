-- KFZ-71: Isochrone Polygon Cache Spalte
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS isochrone_polygon JSONB;
