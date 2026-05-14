-- AAR-461 F3: Makler-Tabellen + Check-Erweiterungen + Leads/Faelle-Felder.
-- Parent-Epic: AAR-458 Self-Service. Blocker für C1/C2/C6/C7/C10 + M1.

-- ============================================================
-- 1) Generische Trigger-Function für aktualisiert_am
-- ============================================================
-- Existiert noch nicht (nur versicherungen-spezifisch vorhanden).
-- Wird für makler-Tabelle + ggf. zukünftige genutzt.
CREATE OR REPLACE FUNCTION public.update_aktualisiert_am_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.aktualisiert_am = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2) Check-Constraints erweitern (existierende Werte bleiben valid)
-- ============================================================
ALTER TABLE abrechnungen DROP CONSTRAINT IF EXISTS abrechnungen_empfaenger_typ_check;
ALTER TABLE abrechnungen ADD CONSTRAINT abrechnungen_empfaenger_typ_check
  CHECK (empfaenger_typ = ANY (ARRAY['marketing','kanzlei','sv','makler']));

ALTER TABLE ki_gespraeche DROP CONSTRAINT IF EXISTS ki_gespraeche_rolle_check;
ALTER TABLE ki_gespraeche ADD CONSTRAINT ki_gespraeche_rolle_check
  CHECK (rolle = ANY (ARRAY['kunde','kundenbetreuer','makler']));

ALTER TABLE nachrichten DROP CONSTRAINT IF EXISTS nachrichten_kanal_check;
ALTER TABLE nachrichten ADD CONSTRAINT nachrichten_kanal_check
  CHECK (kanal = ANY (ARRAY['whatsapp','chat_kb_kunde','gruppenchat','chat_kunde_sv','chat_kb_sv','chat_gruppe_mit_makler']));

-- ============================================================
-- 3) makler — Stammdaten + duale Provisions-Sätze
-- ============================================================
CREATE TABLE IF NOT EXISTS public.makler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  firma TEXT NOT NULL,
  ansprechpartner_vorname TEXT NOT NULL,
  ansprechpartner_nachname TEXT NOT NULL,
  ihk_nummer TEXT,
  email TEXT NOT NULL UNIQUE,
  telefon TEXT,
  adresse_strasse TEXT,
  adresse_plz TEXT,
  adresse_ort TEXT,
  bank_iban TEXT,
  bank_bic TEXT,
  bank_kontoinhaber TEXT,
  provision_betrag_komplett_netto NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  provision_betrag_nur_gutachter_netto NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  provision_aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','aktiv','gesperrt','deaktiviert'])),
  aktiviert_am TIMESTAMPTZ,
  aktiviert_von UUID REFERENCES auth.users(id),
  gesperrt_am TIMESTAMPTZ,
  gesperrt_grund TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_makler_user_id ON public.makler(user_id);
CREATE INDEX IF NOT EXISTS idx_makler_status ON public.makler(status);

DROP TRIGGER IF EXISTS set_makler_aktualisiert_am ON public.makler;
CREATE TRIGGER set_makler_aktualisiert_am
  BEFORE UPDATE ON public.makler
  FOR EACH ROW
  EXECUTE FUNCTION public.update_aktualisiert_am_column();

-- ============================================================
-- 4) promotion_codes — kurze Werbe-Codes pro Makler
-- ============================================================
CREATE TABLE IF NOT EXISTS public.promotion_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  makler_id UUID NOT NULL REFERENCES public.makler(id) ON DELETE CASCADE,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_code_lookup
  ON public.promotion_codes(code) WHERE aktiv = TRUE;

-- ============================================================
-- 5) makler_fall_consent — zweistufige Einsicht (minimal/vollzugriff)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.makler_fall_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES public.faelle(id) ON DELETE CASCADE,
  makler_id UUID NOT NULL REFERENCES public.makler(id) ON DELETE CASCADE,
  consent_scope TEXT NOT NULL DEFAULT 'minimal'
    CHECK (consent_scope = ANY (ARRAY['minimal','vollzugriff'])),
  consent_gegeben_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  widerrufen_am TIMESTAMPTZ,
  widerrufen_von UUID REFERENCES auth.users(id),
  UNIQUE(fall_id, makler_id)
);
CREATE INDEX IF NOT EXISTS idx_mfc_fall
  ON public.makler_fall_consent(fall_id) WHERE widerrufen_am IS NULL;

-- ============================================================
-- 6) makler_provisionen — Provisions-Einträge mit Hold-Period
-- ============================================================
CREATE TABLE IF NOT EXISTS public.makler_provisionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  makler_id UUID NOT NULL REFERENCES public.makler(id),
  lead_id UUID REFERENCES public.leads(id),
  fall_id UUID REFERENCES public.faelle(id),
  promotion_code_id UUID REFERENCES public.promotion_codes(id),
  betrag_netto_eur NUMERIC(10,2) NOT NULL,
  service_typ TEXT NOT NULL
    CHECK (service_typ = ANY (ARRAY['komplett','nur_gutachter'])),
  trigger_event TEXT NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  hold_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','freigegeben','storniert','ausgezahlt'])),
  storniert_am TIMESTAMPTZ,
  storno_grund TEXT,
  abrechnung_id UUID REFERENCES public.abrechnungen(id),
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_pending_release
  ON public.makler_provisionen(hold_until) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mp_makler_status
  ON public.makler_provisionen(makler_id, status);

-- ============================================================
-- 7) leads-Additionen — promo, vision, DAT, voice
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS promotion_code_id UUID REFERENCES public.promotion_codes(id),
  ADD COLUMN IF NOT EXISTS claude_vision_analyse JSONB,
  ADD COLUMN IF NOT EXISTS dat_einschaetzung JSONB,
  ADD COLUMN IF NOT EXISTS dat_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_input_quelle BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_leads_promotion_code
  ON public.leads(promotion_code_id) WHERE promotion_code_id IS NOT NULL;

-- ============================================================
-- 8) faelle.makler_id
-- ============================================================
ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS makler_id UUID REFERENCES public.makler(id);
CREATE INDEX IF NOT EXISTS idx_faelle_makler
  ON public.faelle(makler_id) WHERE makler_id IS NOT NULL;

-- ============================================================
-- 9) RLS enable + Minimal-Policies
-- Full-Policies folgen in Makler-Portal-Epic (AAR-483+).
-- ============================================================
ALTER TABLE public.makler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.makler_fall_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.makler_provisionen ENABLE ROW LEVEL SECURITY;

-- makler — Admin/KB volle Rechte, Makler sieht sich selbst
DROP POLICY IF EXISTS "makler_admin_all" ON public.makler;
CREATE POLICY "makler_admin_all" ON public.makler FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ));
DROP POLICY IF EXISTS "makler_self_read" ON public.makler;
CREATE POLICY "makler_self_read" ON public.makler FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- promotion_codes — Admin/KB volle Rechte, Makler liest eigene
DROP POLICY IF EXISTS "promo_admin_all" ON public.promotion_codes;
CREATE POLICY "promo_admin_all" ON public.promotion_codes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ));
DROP POLICY IF EXISTS "promo_makler_read" ON public.promotion_codes;
CREATE POLICY "promo_makler_read" ON public.promotion_codes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.makler m
    WHERE m.id = promotion_codes.makler_id AND m.user_id = auth.uid()
  ));

-- makler_fall_consent — Admin/KB volle Rechte, Makler liest eigene
DROP POLICY IF EXISTS "mfc_admin_all" ON public.makler_fall_consent;
CREATE POLICY "mfc_admin_all" ON public.makler_fall_consent FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ));
DROP POLICY IF EXISTS "mfc_makler_read" ON public.makler_fall_consent;
CREATE POLICY "mfc_makler_read" ON public.makler_fall_consent FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.makler m
    WHERE m.id = makler_fall_consent.makler_id AND m.user_id = auth.uid()
  ));

-- makler_provisionen — Admin/KB volle Rechte, Makler liest eigene
DROP POLICY IF EXISTS "mp_admin_all" ON public.makler_provisionen;
CREATE POLICY "mp_admin_all" ON public.makler_provisionen FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer')
  ));
DROP POLICY IF EXISTS "mp_makler_read" ON public.makler_provisionen;
CREATE POLICY "mp_makler_read" ON public.makler_provisionen FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.makler m
    WHERE m.id = makler_provisionen.makler_id AND m.user_id = auth.uid()
  ));;
