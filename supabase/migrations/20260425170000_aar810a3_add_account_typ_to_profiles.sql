-- AAR-810 A.3.1: profiles erweitern um Gast-Account-Felder

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_typ TEXT NOT NULL DEFAULT 'voll'
    CHECK (account_typ IN ('voll','gast','interner_user'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS entstanden_via TEXT
    CHECK (entstanden_via IS NULL OR entstanden_via IN (
      'self_signup','airdrop','lead_konvertierung','manuelle_anlage_admin',
      'kanzlei_einladung','makler_einladung','mitarbeiter_anlage'
    ));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS entstanden_aus_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL;

-- entstanden_aus_airdrop_id wird in File 2 hinzugefügt (nach airdrop_invitations-Anlage)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upgrade_to_voll_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_account_typ ON public.profiles(account_typ);
CREATE INDEX IF NOT EXISTS idx_profiles_entstanden_via ON public.profiles(entstanden_via) WHERE entstanden_via IS NOT NULL;

COMMENT ON COLUMN public.profiles.account_typ IS
  'AAR-810 A.3: voll = normaler Kunde (Default), gast = Airdrop-Gast (limitierter Zugriff), interner_user = admin/dispatch/kb/sv (siehe rolle für Detail).';

COMMENT ON COLUMN public.profiles.entstanden_via IS
  'AAR-810 A.3: Quelle der Account-Anlage. Wichtig für Lead-Tracking und Konvertierungs-Metriken.';

COMMENT ON COLUMN public.profiles.upgrade_to_voll_at IS
  'AAR-810 A.3: Zeitpunkt der Konversion von gast zu voll. NULL solange Gast oder direkt Voll angelegt.';
