-- Gutschrift Beleg §14-vollständig: Leistungszeitpunkt (§14 Abs. 4 Nr. 6 UStG Pflichtangabe).
-- Additive nullable Spalte; eingefroren zum Ausstellungszeitpunkt = Leistungsdatum der Provision
-- (trigger_at bei Provisionen / created_at bei Maik / erstellt_am bei Staffel-Boni).
-- Bestehende Rows bleiben NULL -> PDF-Fallback "Leistungsdatum entspricht dem Ausstellungsdatum".

ALTER TABLE public.partner_gutschriften ADD COLUMN IF NOT EXISTS leistung_datum date;
