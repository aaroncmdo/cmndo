-- AAR-810 A.2.3: FK-Constraints von claims auf claim_parties nachziehen
-- (claims-Spalten existieren bereits aus Phase A.1, aber ohne FK-Constraint)

ALTER TABLE public.claims
  ADD CONSTRAINT fk_claims_geschaedigter_party
  FOREIGN KEY (geschaedigter_party_id)
  REFERENCES public.claim_parties(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.claims
  ADD CONSTRAINT fk_claims_verursacher_party
  FOREIGN KEY (verursacher_party_id)
  REFERENCES public.claim_parties(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON CONSTRAINT fk_claims_geschaedigter_party ON public.claims IS
  'AAR-810 A.2: FK auf claim_parties.id für Geschädigten. DEFERRABLE für atomic INSERT claim + INSERT party + UPDATE claim.party_id.';

COMMENT ON CONSTRAINT fk_claims_verursacher_party ON public.claims IS
  'AAR-810 A.2: FK auf claim_parties.id für Verursacher. DEFERRABLE für atomic INSERT claim + INSERT party + UPDATE claim.party_id.';
