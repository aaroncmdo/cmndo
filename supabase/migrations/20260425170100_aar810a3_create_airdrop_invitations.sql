-- AAR-810 A.3.2: airdrop_invitations — Magic-Link-Einladungen für Gegner

CREATE TABLE IF NOT EXISTS public.airdrop_invitations (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                        UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Wer hat eingeladen
  invited_by_user_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_by_party_id             UUID REFERENCES public.claim_parties(id) ON DELETE SET NULL,

  -- Token (gehashed — Klartext wird nie persistiert)
  token_hash                      TEXT NOT NULL UNIQUE,
  token_lookup_prefix             VARCHAR(8) NOT NULL,  -- erste 8 chars für O(1)-Suche

  -- Channel
  invited_via                     TEXT NOT NULL CHECK (invited_via IN (
    'qr_code','airdrop','whatsapp','sms','email','manual_link','telegram','signal'
  )),

  -- Lifecycle
  invited_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                      TIMESTAMPTZ NOT NULL,
  opened_at                       TIMESTAMPTZ,
  responded_at                    TIMESTAMPTZ,
  withdrawn_at                    TIMESTAMPTZ,
  withdrawn_by_user_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  withdrawn_grund                 TEXT,

  status                          TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'offen','geoeffnet','daten_eingegeben','widerrufen','abgelaufen','konvertiert'
  )),

  -- Resultate
  resulting_party_id              UUID REFERENCES public.claim_parties(id) ON DELETE SET NULL,
  resulting_user_id               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  konvertiert_zu_voll_am          TIMESTAMPTZ,

  -- Audit
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address_open                 TEXT,
  user_agent_open                 TEXT,

  -- Geschäftliche Constraints
  CONSTRAINT chk_airdrop_expires_after_invite CHECK (expires_at > invited_at),
  CONSTRAINT chk_airdrop_konvertiert_braucht_user CHECK (
    konvertiert_zu_voll_am IS NULL OR resulting_user_id IS NOT NULL
  ),
  CONSTRAINT chk_airdrop_widerrufen_konsistenz CHECK (
    (withdrawn_at IS NULL AND withdrawn_by_user_id IS NULL)
    OR (withdrawn_at IS NOT NULL AND withdrawn_by_user_id IS NOT NULL)
  ),
  CONSTRAINT chk_airdrop_responded_after_opened CHECK (
    responded_at IS NULL OR opened_at IS NULL OR responded_at >= opened_at
  )
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_airdrop_claim          ON public.airdrop_invitations(claim_id);
CREATE INDEX IF NOT EXISTS idx_airdrop_invited_by     ON public.airdrop_invitations(invited_by_user_id) WHERE invited_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_airdrop_resulting_user ON public.airdrop_invitations(resulting_user_id) WHERE resulting_user_id IS NOT NULL;

-- Token-Lookup: Prefix-Index für O(1)-Hash-Verify
CREATE INDEX IF NOT EXISTS idx_airdrop_token_prefix
  ON public.airdrop_invitations(token_lookup_prefix)
  WHERE status IN ('offen','geoeffnet');

-- Status-Index für Cron-Jobs (abgelaufene Tokens markieren)
CREATE INDEX IF NOT EXISTS idx_airdrop_offen_expired
  ON public.airdrop_invitations(expires_at)
  WHERE status IN ('offen','geoeffnet') AND expires_at IS NOT NULL;

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.set_airdrop_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_airdrop_updated_at ON public.airdrop_invitations;
CREATE TRIGGER trg_airdrop_updated_at
  BEFORE UPDATE ON public.airdrop_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_airdrop_updated_at();

-- Status-Konsistenz-Trigger: Zeitstempel automatisch setzen
CREATE OR REPLACE FUNCTION public.airdrop_status_consistency()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Wenn status='geoeffnet' aber opened_at NULL → setze opened_at
  IF NEW.status IN ('geoeffnet','daten_eingegeben','konvertiert') AND NEW.opened_at IS NULL THEN
    NEW.opened_at := now();
  END IF;

  -- Wenn status='daten_eingegeben' aber responded_at NULL → setze responded_at
  IF NEW.status IN ('daten_eingegeben','konvertiert') AND NEW.responded_at IS NULL THEN
    NEW.responded_at := now();
  END IF;

  -- Wenn status='widerrufen' aber withdrawn_at NULL → setze withdrawn_at
  IF NEW.status = 'widerrufen' AND NEW.withdrawn_at IS NULL THEN
    NEW.withdrawn_at := now();
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_airdrop_status_consistency ON public.airdrop_invitations;
CREATE TRIGGER trg_airdrop_status_consistency
  BEFORE INSERT OR UPDATE OF status ON public.airdrop_invitations
  FOR EACH ROW EXECUTE FUNCTION public.airdrop_status_consistency();

COMMENT ON TABLE public.airdrop_invitations IS
  'AAR-810 A.3: Magic-Link-Einladungen für Gegner-Halter, die nicht unsere Kunden sind. Token gehashed gespeichert (analog auth_remember_tokens). Lifecycle: offen → geoeffnet → daten_eingegeben → ggf. konvertiert. Cron-Job markiert abgelaufen nach 7 Tagen.';

COMMENT ON COLUMN public.airdrop_invitations.token_hash IS
  'SHA-256-Hash des Klartext-Tokens. Klartext wird nie persistiert.';

COMMENT ON COLUMN public.airdrop_invitations.token_lookup_prefix IS
  'Erste 8 Zeichen des Klartext-Tokens für indexed O(1)-Lookup vor Hash-Verify.';

-- FK-Spalte auf profiles nachziehen (musste warten weil airdrop_invitations gerade erst angelegt)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS entstanden_aus_airdrop_id UUID REFERENCES public.airdrop_invitations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.entstanden_aus_airdrop_id IS
  'AAR-810 A.3: FK auf airdrop_invitations. Gesetzt bei Gast-Accounts, die durch Airdrop-Annahme entstanden sind.';

-- RLS aktivieren
ALTER TABLE public.airdrop_invitations ENABLE ROW LEVEL SECURITY;

-- Policy 1: Einlader sieht eigene
CREATE POLICY airdrop_invited_by_select ON public.airdrop_invitations
  FOR SELECT USING (invited_by_user_id = auth.uid());

-- Policy 2: Gast (Eingeladener) sieht eigene
CREATE POLICY airdrop_resulting_user_select ON public.airdrop_invitations
  FOR SELECT USING (resulting_user_id = auth.uid());

-- Policy 3: Staff voll
CREATE POLICY airdrop_staff_all ON public.airdrop_invitations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  );

-- Policy 4: Claim-Beteiligte sehen Invitations am gleichen claim
CREATE POLICY airdrop_claim_party_select ON public.airdrop_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.claim_parties cp
      WHERE cp.claim_id = airdrop_invitations.claim_id
        AND cp.user_id = auth.uid()
        AND cp.ist_aktiv = TRUE
    )
  );
