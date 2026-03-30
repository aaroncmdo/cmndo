-- KFZ-16: User-Erstellung + Einmalpasswort + Erster Login

-- Add force_password_change and auth_provider to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telefon TEXT;
