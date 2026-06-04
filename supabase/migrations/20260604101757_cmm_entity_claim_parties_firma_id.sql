-- CMM Entity (b1): Party-<->-Firma-Link, spiegelt person_id. Eine Partei ist Person (person_id)
-- ODER Firma (firma_id). Loest die flachen claim_parties.firma/ist_gewerbe/ust_id ab (Legacy
-- bis Writer-Wiring; additiv, kein Drop).
ALTER TABLE public.claim_parties
  ADD COLUMN firma_id uuid REFERENCES public.firmen(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.claim_parties.firma_id IS
  'CMM Entity: FK -> firmen (Firmen-Entitaet), spiegelt person_id fuer natuerliche Personen. Loest die flachen firma/ist_gewerbe/ust_id ab (Legacy bis Writer-Wiring).';

CREATE INDEX idx_claim_parties_firma_id ON public.claim_parties (firma_id);
