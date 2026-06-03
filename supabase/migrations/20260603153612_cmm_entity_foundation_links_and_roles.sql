-- CMM Entity-Model Phase 1c: additive Links + Rollen-Widening. Alle Spalten nullable,
-- FK auf existierende/neue Entitaeten, kein Consumer -> zero-risk/zero-collision.

-- Werkstatt terminfaehig machen (Standort + ISO + Ansprechpartner)
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS isochrone jsonb;
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ansprechpartner_person_id uuid REFERENCES public.personen(id) ON DELETE SET NULL;

-- Reparatur: welches Fahrzeug
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- Mietwagen: Mietfahrzeug + Unternehmen (anbieter-TEXT bleibt vorerst, FK additiv daneben)
ALTER TABLE public.claim_mietwagen ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.claim_mietwagen ADD COLUMN IF NOT EXISTS mietwagenunternehmen_id uuid REFERENCES public.mietwagenunternehmen(id) ON DELETE SET NULL;

-- Person<->Claim-Rolle-Link: person_id auf claim_parties (Person-Daten ziehen spaeter nach personen)
ALTER TABLE public.claim_parties ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.personen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_claim_parties_person_id ON public.claim_parties (person_id) WHERE person_id IS NOT NULL;

-- Fahrzeug-Rolle 'mietwagen' ergaenzen (Superset -> verletzt keine Bestands-Zeile)
ALTER TABLE public.claim_vehicle_involvements DROP CONSTRAINT IF EXISTS claim_vehicle_involvements_rolle_check;
ALTER TABLE public.claim_vehicle_involvements ADD CONSTRAINT claim_vehicle_involvements_rolle_check
  CHECK (rolle = ANY (ARRAY['geschaedigter'::text,'verursacher'::text,'beteiligter'::text,'unbekannt'::text,'mietwagen'::text]));
