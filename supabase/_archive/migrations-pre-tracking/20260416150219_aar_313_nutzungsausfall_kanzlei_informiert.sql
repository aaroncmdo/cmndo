-- AAR-313: Nutzungsausfall-Flag in faelle (lead.nutzungsausfall war nicht in Mapping).
-- Plus Tracking ob die Kanzlei wegen Mietwagen/Nutzungsausfall informiert wurde.
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS nutzungsausfall boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mietwagen_kanzlei_informiert boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mietwagen_kanzlei_informiert_am timestamptz;

COMMENT ON COLUMN faelle.nutzungsausfall IS 'AAR-313: aus leads.nutzungsausfall übertragen — Kunde hat Nutzungsausfall geltend gemacht.';
COMMENT ON COLUMN faelle.mietwagen_kanzlei_informiert IS 'AAR-313: KB hat die Kanzlei informiert dass eine Mietwagen-/Nutzungsausfall-Abfrage bei der VS notwendig ist.';;
