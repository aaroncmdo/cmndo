-- BUG-21: Storage Buckets fuer Dokument-Uploads
-- Buckets: dokumente (Haupt), schadensfotos, gutachten, kanzlei (privat), unterschriften, profile
-- RLS: Authentifizierte User koennen uploaden und lesen

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('dokumente', 'dokumente', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('schadensfotos', 'schadensfotos', true, 52428800, ARRAY['image/jpeg','image/png','image/webp']),
  ('gutachten', 'gutachten', true, 52428800, ARRAY['application/pdf','image/jpeg','image/png']),
  ('kanzlei', 'kanzlei', false, 52428800, ARRAY['application/pdf']),
  ('profile', 'profile', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
