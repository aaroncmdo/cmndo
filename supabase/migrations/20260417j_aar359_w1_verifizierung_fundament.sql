-- AAR-359 Welle 1: DB-Fundament Gutachter-Verifizierung
--
-- Drei-Tier-Verifizierungs-Modell für Sachverständige:
-- - Tier 1: SA-Vorlage (Dispatch-Gate-Blocker)       → sv_sa_vorlage
-- - Tier 2: Nachreich-Pflicht (14-Tage-Frist)         → sv_berufshaftpflicht,
--   sv_gewerbeanmeldung, sv_bestellungsurkunde_oebuv
-- - Tier 3: Optional, jederzeit einreichbar           → sv_bvsk_mitgliedschaft
--
-- Zwei getrennte Status-Felder auf sachverstaendige:
-- - sa_vorlage_status: steuert Dispatch-Gate (Hard-Blocker)
-- - verifizierung_status: Tier-2-Frist-Tracking (Soft-Blocker)
-- + separate Sperre (nie automatisch): gesperrt_am/grund/von
--
-- Pflichtdokumente erweitert um gutachter_id, damit SV-bezogene Slots nicht
-- an einen fall_id hängen müssen. fall_id ist bereits nullable — wir ergänzen
-- nur den CHECK "entweder fall ODER gutachter".

-- ───────────────────────────────────────────────────────────────────
-- Block 1: sachverstaendige erweitern
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS sa_vorlage_status TEXT,
  ADD COLUMN IF NOT EXISTS sa_vorlage_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS sa_vorlage_hochgeladen_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sa_vorlage_geprueft_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sa_vorlage_geprueft_von_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS sa_vorlage_admin_notiz TEXT,
  ADD COLUMN IF NOT EXISTS verifizierung_status TEXT,
  ADD COLUMN IF NOT EXISTS verifizierung_frist_bis TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifiziert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifiziert_von_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS verifizierung_admin_notiz TEXT,
  ADD COLUMN IF NOT EXISTS gesperrt_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gesperrt_grund TEXT,
  ADD COLUMN IF NOT EXISTS gesperrt_von_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS dat_nummer TEXT;

-- CHECK-Constraints als separate Statements, damit IF-NOT-EXISTS-Pattern
-- (Spalten-Ebene) nicht mit Constraint-Syntax kollidiert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sachverstaendige_sa_vorlage_status_check'
  ) THEN
    ALTER TABLE sachverstaendige
      ADD CONSTRAINT sachverstaendige_sa_vorlage_status_check
      CHECK (sa_vorlage_status IS NULL OR sa_vorlage_status IN ('ausstehend','geprueft','zurueckgewiesen'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sachverstaendige_verifizierung_status_check'
  ) THEN
    ALTER TABLE sachverstaendige
      ADD CONSTRAINT sachverstaendige_verifizierung_status_check
      CHECK (verifizierung_status IS NULL OR verifizierung_status IN ('ausstehend','geprueft','frist_ueberschritten'));
  END IF;
END $$;

COMMENT ON COLUMN public.sachverstaendige.sa_vorlage_status IS
  'AAR-359 Tier 1: Steuert Dispatch-Gate. NULL solange Willkommen-Flow nicht durchlaufen, ausstehend nach Upload, geprueft nach Admin-Freigabe (öffnet Dispatch), zurueckgewiesen bei Ablehnung (blockiert + zeigt Grund im Banner).';
COMMENT ON COLUMN public.sachverstaendige.verifizierung_status IS
  'AAR-359 Tier 2: 14-Tage-Frist-Tracking. NULL = noch kein Stripe-Abschluss, ausstehend = Frist läuft, geprueft = alle Tier-2-Docs freigegeben, frist_ueberschritten = Tag 14 erreicht ohne Vollständigkeit.';
COMMENT ON COLUMN public.sachverstaendige.verifizierung_frist_bis IS
  'AAR-359: Wird im Stripe-Webhook auf now() + INTERVAL ''14 days'' gesetzt.';
COMMENT ON COLUMN public.sachverstaendige.dat_nummer IS
  'AAR-359: DAT-Kundennummer bei DAT-Gutachtern (gutachter_typ=dat-gutachter). NULL bei reinen KFZ-Gutachtern.';

-- ───────────────────────────────────────────────────────────────────
-- Block 2: dokument_kategorie um 'gutachter_verifizierung' erweitern
-- ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'dokument_kategorie' AND e.enumlabel = 'gutachter_verifizierung'
  ) THEN
    ALTER TYPE dokument_kategorie ADD VALUE 'gutachter_verifizierung';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- Block 3: pflichtdokumente.gutachter_id + Dual-Owner-CHECK
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS gutachter_id UUID REFERENCES sachverstaendige(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pflichtdokumente_fall_or_gutachter_required'
  ) THEN
    ALTER TABLE pflichtdokumente
      ADD CONSTRAINT pflichtdokumente_fall_or_gutachter_required
      CHECK (fall_id IS NOT NULL OR gutachter_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.pflichtdokumente.gutachter_id IS
  'AAR-359: Verifizierungs-Slots hängen direkt am SV, nicht an einem Fall. Alternative zur bisherigen fall_id-Bindung — CHECK erzwingt dass genau eine der beiden Zuordnungen gesetzt ist.';

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_gutachter
  ON pflichtdokumente(gutachter_id) WHERE gutachter_id IS NOT NULL;
