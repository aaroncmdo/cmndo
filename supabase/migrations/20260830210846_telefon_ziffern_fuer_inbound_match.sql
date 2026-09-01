-- Befund 3 (Teil 2) aus docs/2026-08-30-auftrag-check-lead-datenverlust.md
--
-- matchInboundToFall (src/lib/inbound/match-fall.ts) normalisiert die SUCHNADEL
-- (phone.replace(/[^0-9]/g,'') -> letzte 9 Ziffern), sucht damit aber per
-- ilike '%suffix%' im UNNORMALISIERTEN Spaltenwert. Steht im gespeicherten
-- telefon ein Trennzeichen mitten im Suffix, kann der Match nicht greifen:
--
--   Lead 5c39b0ac (Ernest Sefa)  telefon = '+49 177 5799941'
--   eingehende WhatsApp          phone   = '491775799941' -> suffix '775799941'
--   ilike '%775799941%'          -> 0 Treffer  (Leerzeichen zwischen 177 und 5799941)
--
-- Folge: die WhatsApp an den Kunden wurde mit lead_id = NULL protokolliert,
-- der Vorgang blieb ohne Kommunikationsspur (prod 30.08. 20:12:44).
--
-- Fix: eine generierte Ziffern-Spalte, gegen die verglichen wird. Damit sind
-- Nadel UND Heuhaufen normalisiert. STORED + GENERATED = kein Schreibpfad kann
-- sie vergessen (im Gegensatz zu einer per Trigger gepflegten Spalte).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS telefon_ziffern text
  GENERATED ALWAYS AS (regexp_replace(COALESCE(telefon, ''), '[^0-9]', '', 'g')) STORED;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefon_ziffern text
  GENERATED ALWAYS AS (regexp_replace(COALESCE(telefon, ''), '[^0-9]', '', 'g')) STORED;

COMMENT ON COLUMN public.leads.telefon_ziffern IS
  'Nur-Ziffern-Form von telefon (generiert). Vergleichsspalte fuer den Inbound-Telefon-Match — telefon selbst traegt gemischte Formate ("+49 177 5799941" neben "+491775799941"), ein ilike darauf verfehlt formatierte Nummern.';
COMMENT ON COLUMN public.profiles.telefon_ziffern IS
  'Nur-Ziffern-Form von telefon (generiert). Siehe leads.telefon_ziffern.';