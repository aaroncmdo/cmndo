-- Makler-Selbstregistrierung: Rechtsform erheben (Aaron 15.07. — "bei der
-- maklerregistrierung fehlt die rechtsform"). Additiv + nullable; Bestand bleibt null.
-- USt-relevant im Zusammenspiel mit makler.ist_kleinunternehmer (partner-billing-ust).
ALTER TABLE public.makler ADD COLUMN rechtsform text;
COMMENT ON COLUMN public.makler.rechtsform IS 'Rechtsform des Maklerbetriebs (Einzelunternehmen/GbR/GmbH/...) — erhoben bei der Selbstregistrierung; USt-/Abrechnungs-relevant zusammen mit ist_kleinunternehmer.';
