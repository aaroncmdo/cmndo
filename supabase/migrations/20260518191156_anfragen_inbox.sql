-- 2026-05-18: Inbox-Tabelle für rohe Eingangs-Anfragen aller Channels.
-- Eine Anfrage wird atomar mit Insert via convert_anfrage_zu_lead() in
-- einen Lead konvertiert (siehe nächste Migration). Die Anfrage bleibt
-- auch bei Convert-Failure persistent — Audit-Trail.
--
-- Quellen-Slugs (Beispiele): 'kfzgutachter-ads-lp', 'rueckruf-modal',
-- 'telefon-aircall', 'gutachter-finder-termin', 'makler-partner-form'.
--
-- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md

CREATE TABLE public.anfragen (
  -- Identität
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Channel-Identifikation (Pflicht-Ursprung)
  quelle            text NOT NULL,
  quelle_variant    text,
  quelle_url        text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,

  -- Kontakt-Felder (kanalübergreifend)
  kontakt_name           text,
  kontakt_telefon        text,
  kontakt_email          text,
  kontakt_plz_oder_stadt text,

  -- Channel-spezifischer Rohdaten-Puffer
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Audit / Spam-Detection
  client_ip  inet,
  user_agent text,

  -- Convert-Spur
  lead_id                uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  konvertiert_am         timestamptz,
  konvertier_status      text NOT NULL DEFAULT 'pending',
  konvertier_fehler      text,
  disqualifiziert_grund  text,
  disqualifiziert_am     timestamptz,
  disqualifiziert_durch  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT anfragen_konvertier_status_check
    CHECK (konvertier_status IN ('pending', 'success', 'failed', 'disqualifiziert'))
);

COMMENT ON TABLE public.anfragen IS
  'Inbox für rohe Eingangs-Anfragen aus allen Channels (LP-Forms, Rückruf-Modal, Telefon-Bot, WA, Partner-APIs). Atomar konvertiert zu leads via convert_anfrage_zu_lead(). Audit-Trail-Tabelle, niemals DELETE — nur disqualifizieren.';

COMMENT ON COLUMN public.anfragen.quelle IS
  'Maschinenlesbarer Channel-Slug. Eine Quelle = ein Slug (z.B. kfzgutachter-ads-lp).';
COMMENT ON COLUMN public.anfragen.payload IS
  'Channel-spezifischer Rohdaten-Puffer. Felder die regelmäßig abgefragt werden, sollten später zu echten Spalten promoviert werden.';
COMMENT ON COLUMN public.anfragen.konvertier_status IS
  'pending | success | failed | disqualifiziert — vollständiger Convert-Audit-Trail inkl. Fehlerfällen.';

-- Indexes (Partial-Strategy für schlanke Footprints)
CREATE INDEX anfragen_created_at_idx ON public.anfragen (created_at DESC);
CREATE INDEX anfragen_quelle_idx     ON public.anfragen (quelle, created_at DESC);
CREATE INDEX anfragen_status_idx     ON public.anfragen (konvertier_status)
  WHERE konvertier_status <> 'success';
CREATE INDEX anfragen_lead_id_idx    ON public.anfragen (lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX anfragen_telefon_idx    ON public.anfragen (kontakt_telefon)
  WHERE kontakt_telefon IS NOT NULL;

-- RLS aktivieren
ALTER TABLE public.anfragen ENABLE ROW LEVEL SECURITY;

-- service_role bypasst RLS automatisch (Server-Action-INSERTs)
-- authenticated Users: nur Admin + Dispatch dürfen lesen
CREATE POLICY anfragen_select_admin_dispatch
  ON public.anfragen
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
  );

-- Admin + Dispatch dürfen disqualifizieren / Notizen ergänzen
CREATE POLICY anfragen_update_admin_dispatch
  ON public.anfragen
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
  );

-- KEINE INSERT-Policy für authenticated → Inserts nur via service_role.
-- KEINE DELETE-Policy → Anfragen werden nie gelöscht (Audit-Trail).
