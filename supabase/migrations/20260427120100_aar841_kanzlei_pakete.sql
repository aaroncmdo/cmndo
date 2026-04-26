-- AAR-841 Step 2/3: kanzlei_pakete-Tabelle + RLS
--
-- Pattern: analog zu claim_mietwagen / claim_payments. Hybrid-Empfänger-Modell:
--   empfaenger_typ='partnerkanzlei' → Settings (LexDrive)
--   empfaenger_typ='eigene_kanzlei' → Felder direkt am Paket gesnapshot
--
-- has_role-Function existiert nicht — RLS nutzt Profile-Pattern wie AAR-824.

CREATE TABLE IF NOT EXISTS public.kanzlei_pakete (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                        UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Empfänger
  empfaenger_typ                  TEXT NOT NULL CHECK (empfaenger_typ IN ('partnerkanzlei','eigene_kanzlei')),
  empfaenger_kanzlei_name         TEXT NOT NULL,
  empfaenger_kanzlei_email        TEXT,
  empfaenger_kanzlei_telefon      TEXT,
  empfaenger_kanzlei_kontaktperson TEXT,

  -- Inhalt (Audit)
  inhalt_dokumente_jsonb          JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Workflow
  status                          TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN (
                                     'entwurf','versendet','bestaetigt','fehlgeschlagen'
                                   )),
  versendet_am                    TIMESTAMPTZ,
  versendet_durch_user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  versand_methode                 TEXT CHECK (versand_methode IN ('email','post','portal_lexdrive')),
  versand_external_id             TEXT,
  bestaetigt_am                   TIMESTAMPTZ,

  -- Audit
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notiz                           TEXT
);

CREATE INDEX IF NOT EXISTS idx_kanzlei_pakete_claim ON public.kanzlei_pakete(claim_id);
CREATE INDEX IF NOT EXISTS idx_kanzlei_pakete_pending
  ON public.kanzlei_pakete(status, created_at)
  WHERE status IN ('entwurf','fehlgeschlagen');

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.set_kanzlei_pakete_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_kp_updated_at ON public.kanzlei_pakete;
CREATE TRIGGER trg_kp_updated_at
  BEFORE UPDATE ON public.kanzlei_pakete
  FOR EACH ROW EXECUTE FUNCTION public.set_kanzlei_pakete_updated_at();

-- RLS
ALTER TABLE public.kanzlei_pakete ENABLE ROW LEVEL SECURITY;

CREATE POLICY kanzlei_pakete_admin_all ON public.kanzlei_pakete FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);

CREATE POLICY kanzlei_pakete_kb_all ON public.kanzlei_pakete FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = kanzlei_pakete.claim_id
      AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = kanzlei_pakete.claim_id
      AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);

-- Geschädigter sieht eigene versendete Pakete (für QR-Block AAR-842)
CREATE POLICY kanzlei_pakete_geschaedigter_select ON public.kanzlei_pakete FOR SELECT USING (
  status = 'versendet'
  AND EXISTS (
    SELECT 1 FROM public.claims c
    WHERE c.id = kanzlei_pakete.claim_id
      AND c.geschaedigter_user_id = auth.uid()
  )
);

COMMENT ON TABLE public.kanzlei_pakete IS
  'AAR-841: Kanzleipaket-Versand pro Claim. Drei Wege: Partnerkanzlei (LexDrive), '
  'eigene Kanzlei (Kunde nennt), keine. Bei eigene_kanzlei wird claim auf '
  'an_externe_kanzlei_uebergeben gesetzt (Endzustand für uns, siehe AAR-840). '
  'AAR-842 zeigt QR-Block sobald status=versendet.';
