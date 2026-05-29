-- AAR-939 · Monika-Embed · Stream 1 (1/3): embed_sites
--
-- SV-konfigurierte Quell-Seite mit Monika-Snippet (eigene Webseite des SVs).
-- Variante A (free) = nur Capture/WhatsApp · Variante B (paid, 70€/Termin).
--
-- Theme-Strategie (Aaron 29.05.2026): Default aus sachverstaendige.brand_*
-- (bestehendes Whitelabel: brand_primary/brand_secondary/brand_accent/brand_logo_url),
-- optionale per-Site-Overrides hier (NULL = erbt vom SV). Bei Variante A wird im
-- Config-Endpoint ohnehin das Claimondo-Default-Theme erzwungen.
--
-- Writes laufen über service_role (Stream-6-Server-Actions mit createAdminClient +
-- Feld-Validierung) → KEIN authenticated-Write-Policy (verhindert einzelpreis/variante-
-- Mass-Assignment, vgl. Live-RLS-Audit 12.05.). Der cross-origin Widget-Config-Endpoint
-- liest embed_sites server-seitig via service_role → KEINE public/anon-SELECT-Policy.
--
-- Timestamp-Pattern folgt cmm32a (erstellt_am + updated_at + update_updated_at_column).

CREATE TABLE IF NOT EXISTS public.embed_sites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  inhaber_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sv_id              uuid REFERENCES public.sachverstaendige(id) ON DELETE SET NULL,
  name               text NOT NULL,

  -- Variante steuert Theme-Verhalten + Billing
  variante           text NOT NULL DEFAULT 'A' CHECK (variante IN ('A', 'B')),
  einzelpreis_eur    numeric(10,2) NOT NULL DEFAULT 70.00,

  -- Theme-Overrides — NULL = erbt aus sachverstaendige.brand_* (nur Variante B wirksam).
  -- Namen an die echten sachverstaendige-Spalten angelehnt.
  brand_primary_override   text,
  brand_secondary_override text,
  brand_accent_override    text,
  brand_logo_url_override   text,

  -- Routing
  empfaenger_email       text NOT NULL DEFAULT 'info@claimondo.de',
  cc_email               text,
  baileys_routing_nummer text NOT NULL,

  -- Security
  erlaubte_domains   text[] NOT NULL DEFAULT '{}',
  max_anfragen_pro_h int NOT NULL DEFAULT 20,
  aktiv              boolean NOT NULL DEFAULT true,
  paused_grund       text,

  -- AGB-/Kooperations-Zustimmung (Variante B): Checkbox + Timestamp + Versions-Hash
  agb_akzeptiert_am  timestamptz,
  agb_version        text,

  -- Tracking-Integration (Stream 8b)
  tracking_webhook_url        text,
  tracking_webhook_secret     text,
  tracking_ga4_measurement_id text,
  tracking_gads_customer_id   text,

  -- Telemetrie
  anfragen_gesamt    int NOT NULL DEFAULT 0,
  letzte_anfrage_am  timestamptz,
  erstellt_am        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embed_sites_inhaber ON public.embed_sites(inhaber_profile_id);
CREATE INDEX IF NOT EXISTS idx_embed_sites_sv ON public.embed_sites(sv_id);

-- updated_at via geteilte Trigger-Funktion (cmm32a-Standard: setzt NEW.updated_at = now()).
-- ACHTUNG: public.update_updated_at_column() existiert NICHT (nur in storage-Schema) —
-- die kanonische geteilte Funktion ist public.tg_auftraege_set_updated_at().
DROP TRIGGER IF EXISTS embed_sites_updated_at ON public.embed_sites;
CREATE TRIGGER embed_sites_updated_at
  BEFORE UPDATE ON public.embed_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auftraege_set_updated_at();

ALTER TABLE public.embed_sites ENABLE ROW LEVEL SECURITY;

-- Admin/Dispatch: alles (is_admin() short-circuit)
DROP POLICY IF EXISTS embed_sites_admin_all ON public.embed_sites;
CREATE POLICY embed_sites_admin_all ON public.embed_sites
  FOR ALL TO authenticated USING (public.is_admin());

-- Inhaber (SV) sieht eigene Sites — Writes laufen über service_role (Server-Actions)
DROP POLICY IF EXISTS embed_sites_owner_select ON public.embed_sites;
CREATE POLICY embed_sites_owner_select ON public.embed_sites
  FOR SELECT TO authenticated
  USING (inhaber_profile_id = auth.uid());

-- Kein authenticated INSERT/UPDATE/DELETE → default-deny; service_role bypasst RLS.

COMMENT ON TABLE public.embed_sites IS
  'AAR-939 Monika-Embed: SV-konfigurierte Quell-Seite. variante A=free/Capture, B=70€/Termin. Theme-Overrides NULL=erbt sachverstaendige.brand_*. Writes nur service_role.';
