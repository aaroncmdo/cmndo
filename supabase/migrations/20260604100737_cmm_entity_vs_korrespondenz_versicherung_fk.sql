-- CMM Entity (a1): semantische Link-Luecke schliessen. vs_korrespondenz.versicherung war TEXT
-- (Freitext), obwohl die versicherungen-Entitaet existiert (95 Zeilen). Additiv: FK-Spalte
-- versicherung_id -> versicherungen(id). Das flache versicherung(text) bleibt als Legacy-/Freitext-
-- Fallback bis das Writer-Wiring versicherung_id setzt (Tabelle aktuell 0 Zeilen -> kein Backfill).
ALTER TABLE public.vs_korrespondenz
  ADD COLUMN versicherung_id uuid REFERENCES public.versicherungen(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vs_korrespondenz.versicherung_id IS
  'CMM Entity: FK -> versicherungen (Entitaet). Kanonische Quelle des Versicherers. Das flache versicherung(text) ist Legacy-Freitext-Fallback bis Writer-Wiring.';

CREATE INDEX IF NOT EXISTS idx_vs_korrespondenz_versicherung_id
  ON public.vs_korrespondenz(versicherung_id);
