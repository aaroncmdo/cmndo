-- AAR-939 Embed-B (T1e) — Funnel-Entry-Modus pro SV-Embed.
-- callback (Default) = Lead-Capture + SV-Rueckruf (heutiges Verhalten).
-- flowlink = Self-Service: Kunde bekommt /flow-Link via issueCanonicalFlowLinkForAnfrage.
-- Orthogonal zu embed_sites.variante (free/paid). Additiv, default-callback = value-neutral.

ALTER TABLE public.embed_sites
  ADD COLUMN funnel_modus text NOT NULL DEFAULT 'callback'
  CONSTRAINT embed_sites_funnel_modus_check CHECK (funnel_modus IN ('callback', 'flowlink'));

COMMENT ON COLUMN public.embed_sites.funnel_modus IS
  'AAR-939 Embed-B: Funnel-Entry-Modus pro SV-Embed. callback = Lead-Capture + SV-Rueckruf (Default); flowlink = Self-Service, Kunde bekommt /flow-Link via issueCanonicalFlowLinkForAnfrage. Orthogonal zu variante (free/paid).';
