-- Security CRITICAL (Personal-Audit #2173, anon-Leak): sachverstaendige.gcal_* Legacy-
-- OAuth-Token waren ueber die anon-Map-Policy lesbar (lebendes Google-Token-Paar an anon).
-- profiles.google_* ist kanonisch (PR #534); sachverstaendige.gcal_{access,refresh}_token +
-- gcal_token_expiry werden NIRGENDS mehr gelesen (callback schreibt sie nicht mehr, nur
-- disconnect nullt sie; einzig gcal_connected ist live als UI-Flag). One-time-Null entfernt
-- die lebenden Token sofort (Worst-Case Calendar-Takeover), breakage-frei. Die Policy/View-
-- Haertung (stripe_customer_id/ust_id) folgt im selben Fix-PR (Expand/Contract).
UPDATE public.sachverstaendige
SET gcal_access_token = NULL,
    gcal_refresh_token = NULL,
    gcal_token_expiry = NULL
WHERE gcal_access_token IS NOT NULL
   OR gcal_refresh_token IS NOT NULL
   OR gcal_token_expiry IS NOT NULL;
