-- AAR-940 Self-Service: Token + Expiry auf der Anfrage (gutachter_finder_anfragen)
-- fuer die token-gebundene Self-Service-Strecke (/anfrage/[token]). Promotion
-- Anfrage->Lead erst beim FlowLink-Klick (service_role-validiert). flow_links
-- kann den Token nicht halten (lead_id NOT NULL -> kein Link vor Lead).
-- Nullable + ohne Default: kein Table-Rewrite/Lock (parallele GFA-Writer);
-- Token wird erst bei FlowLink-Ausgabe gesetzt. Partial-Unique fuer Lookups.
-- Kein RLS-Change: Zugriff laeuft ueber service_role-Server-Actions (Muster
-- /kunde-termin/[token]); anon liest GFA nie direkt per Token.

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS self_service_token text,
  ADD COLUMN IF NOT EXISTS self_service_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS gfa_self_service_token_uq
  ON public.gutachter_finder_anfragen (self_service_token)
  WHERE self_service_token IS NOT NULL;
