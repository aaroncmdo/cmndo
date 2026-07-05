-- P1 Kanonische Partner-Abrechnung: USt-Status je Partner (Auszahlungs-Seite).
-- Additiv, nullable. NULL = noch nicht erfragt -> Cockpit blockt Auszahlung bis gesetzt.
ALTER TABLE public.makler ADD COLUMN IF NOT EXISTS ist_kleinunternehmer boolean;
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ist_kleinunternehmer boolean;
COMMENT ON COLUMN public.makler.ist_kleinunternehmer IS 'NULL=noch nicht erfragt; true=Kleinunternehmer §19 UStG (keine USt auf Provision); false=regelbesteuert (19%). Blockt Auszahlung bei NULL.';
COMMENT ON COLUMN public.werkstaetten.ist_kleinunternehmer IS 'analog makler.ist_kleinunternehmer';
