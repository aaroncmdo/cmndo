-- AAR-956 P1: Versand-State auf flow_links (2-Knopf-Funnel / Dispatcher-Re-Send).
-- gesendet_am IS NULL = nie versandt (z.B. "Direkt"-Pfad). Bei jedem erfolgreichen
-- Versand: gesendet_am=now(), gesendet_kanal=<kanal>, gesendet_anzahl += 1.
-- Additiv, 0 Impact bis ein Writer/Reader sie nutzt (P2/P4).
-- Recorded-Version 20260611161103 == Dateiname (Regel 2, Twin-Drift-Schutz).
ALTER TABLE public.flow_links
  ADD COLUMN gesendet_am     timestamptz,
  ADD COLUMN gesendet_kanal  text,
  ADD COLUMN gesendet_anzahl integer NOT NULL DEFAULT 0;

ALTER TABLE public.flow_links
  ADD CONSTRAINT flow_links_gesendet_kanal_check
    CHECK (gesendet_kanal IS NULL OR gesendet_kanal = ANY (ARRAY['whatsapp','sms','email']));
