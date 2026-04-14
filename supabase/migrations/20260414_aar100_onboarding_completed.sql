-- AAR-100: Kunden-Portal Onboarding-Tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
