-- AAR-939 · Monika-Embed · Stream 1 (2/3): gutachter_finder_anfragen erweitern
--
-- REUSE statt neue `anfragen`-Tabelle (Aaron 29.05.2026): gutachter_finder_anfragen
-- ist die kanonische Roh-Anfrage→Lead-Brücke (Dispatch-Realtime + Konversions-Apparat
-- konvertiereAnfrageZuFall + FK konvertiert_zu_lead_id). Monika-Zeilen werden über
-- `source` diskriminiert; bestehende Native-Funnel-Zeilen behalten source = NULL.
--
-- REIN ADDITIV — kein DROP/RENAME bestehender Spalten. Die Tabelle ist LIVE
-- (gutachter-finder-Funnel + Dispatch-RealtimeLeadAlert auf status='entwurf').
--
-- Scope (Aaron): Anfrage → Lead → Termin. KEIN Claim/Fall/Auftrag.
-- Status-Konvention (Webhook, Stream 2):
--   Variante A (free)              → status='embed_free' (NICHT in Dispatch-Queue; nur WhatsApp an SV)
--   Variante B (paid) + Cluster-LP → status='neu'        (vollständig, geht in Dispatch wie Native-Funnel)
-- ('neu' ist ein bestehender Native-Funnel-Status, vgl. lib/onboarding/slots.ts; kein neuer Wert nötig.)
--
-- Consent: bestehende Spalte dsgvo_zustimmung_am wird wiederverwendet (kein neues Feld).
-- IP wird NICHT gespeichert (Daten-Minimierung) → keine Anonymisierungs-Cron nötig.

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS embed_site_id          uuid REFERENCES public.embed_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source                 text,   -- NULL=native | 'kfz_gutachter_lp' | 'sv_embed'
  ADD COLUMN IF NOT EXISTS variante               text,   -- NULL (native/cluster) | 'A' | 'B'
  ADD COLUMN IF NOT EXISTS cluster                text,   -- 'wuppertal' | 'duesseldorf' | 'bonn'
  ADD COLUMN IF NOT EXISTS stadt_slug             text,
  ADD COLUMN IF NOT EXISTS gclid                  text,
  ADD COLUMN IF NOT EXISTS utm_source             text,
  ADD COLUMN IF NOT EXISTS utm_medium             text,
  ADD COLUMN IF NOT EXISTS utm_campaign           text,
  ADD COLUMN IF NOT EXISTS utm_term               text,
  ADD COLUMN IF NOT EXISTS utm_content            text,
  ADD COLUMN IF NOT EXISTS page_url               text,
  ADD COLUMN IF NOT EXISTS origin_domain          text,
  -- Termin-Verkettung (Stream 3) + Billing (Stream 8)
  ADD COLUMN IF NOT EXISTS termin_id              uuid REFERENCES public.gutachter_termine(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS abrechnungs_relevant   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS abrechnungs_betrag_eur numeric(10,2),
  ADD COLUMN IF NOT EXISTS abrechnung_id          uuid REFERENCES public.abrechnungen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS abgerechnet_am         timestamptz;

-- CHECK erlaubt NULL (Native-Funnel-Bestand) + die Monika-Diskriminatoren.
-- Idempotent: nur anlegen wenn nicht vorhanden.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gfa_source_check' AND conrelid = 'public.gutachter_finder_anfragen'::regclass) THEN
    ALTER TABLE public.gutachter_finder_anfragen
      ADD CONSTRAINT gfa_source_check CHECK (source IS NULL OR source IN ('kfz_gutachter_lp', 'sv_embed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gfa_variante_check' AND conrelid = 'public.gutachter_finder_anfragen'::regclass) THEN
    ALTER TABLE public.gutachter_finder_anfragen
      ADD CONSTRAINT gfa_variante_check CHECK (variante IS NULL OR variante IN ('A', 'B'));
  END IF;
END $$;

-- Indizes — NUR neue. Bewusst NICHT angelegt (existieren live bereits):
--   erstellt_am DESC  → idx_gutachter_finder_anfragen_erstellt_am_desc
--   status(+erstellt) → gfa_status_erstellt_idx
--   konvertiert_zu_*  → idx_gutachter_finder_anfragen_konvertiert_zu_{lead,fall,user}_id
--   zugeordneter_sv_* → idx_gutachter_finder_anfragen_zugeordneter_sv_{id,lead_id}
CREATE INDEX IF NOT EXISTS idx_gfa_source      ON public.gutachter_finder_anfragen(source)        WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gfa_embed_site  ON public.gutachter_finder_anfragen(embed_site_id) WHERE embed_site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gfa_termin      ON public.gutachter_finder_anfragen(termin_id)     WHERE termin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gfa_billing_offen
  ON public.gutachter_finder_anfragen(abrechnung_id)
  WHERE abrechnungs_relevant = true AND abgerechnet_am IS NULL;
