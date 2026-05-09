-- Self-Dispatch → Fall + Account: Tracking welche Anfrage zu welchem Lead/Fall
-- konvertiert wurde, plus Magic-Link-Versand-Marker damit Re-Send idempotent
-- bleibt.
--
-- konvertiert_zu_user_id: auth.users-FK des angelegten Kunden-Accounts
-- konvertiert_zu_lead_id: leads-FK (Zwischenstufe vor convertLeadToClaim)
-- konvertiert_zu_fall_id: faelle-FK (Endziel — landet in /kunde/faelle/[id])
-- konvertiert_am: Zeitstempel der erfolgreichen Konvertierung
-- magic_link_gesendet_am: Zeitstempel der Email-Versendung (otp signInWithOtp)
-- konvertierung_fehler: Fehlerstring bei fehlgeschlagener Konvertierung,
--                        damit Dispatch sehen kann was schiefging

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS konvertiert_zu_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS konvertiert_zu_lead_id uuid REFERENCES public.leads(id),
  ADD COLUMN IF NOT EXISTS konvertiert_zu_fall_id uuid REFERENCES public.faelle(id),
  ADD COLUMN IF NOT EXISTS konvertiert_am timestamptz,
  ADD COLUMN IF NOT EXISTS magic_link_gesendet_am timestamptz,
  ADD COLUMN IF NOT EXISTS konvertierung_fehler text;

COMMENT ON COLUMN public.gutachter_finder_anfragen.konvertiert_zu_fall_id IS
  'Endziel der Self-Dispatch-Strecke — Kunde landet via Magic-Link in /kunde/faelle/{id}';
