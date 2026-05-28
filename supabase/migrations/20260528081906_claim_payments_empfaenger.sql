-- CMM-44 DE-4: Auszahlungs-Empfaenger-Dimension auf claim_payments.
--
-- Ein Payment-Row pro Empfaenger (kunde|sv) -> skaliert auf Teilzahlungen pro
-- Partei (mapping-doc cmm44-subphasen-mapping.md DE-4 / §8.4: der Auszahlungs-
-- Split Kunde/SV hatte bisher keine saubere Quelle).
--
-- Additiv + sicher: bestehende Rows + Code bleiben unberuehrt — Default 'kunde'
-- = der primaere Claimant-Payout (claim_payments trackt heute den Regulierungs-
-- Eingang, der primaer an den Kunden geht). Tabelle ist pre-launch 0 Rows.
-- Bestehende INSERTs (upsertCurrentClaimPayment, ohne empfaenger) fallen auf
-- 'kunde' zurueck -> kein Verhaltens-Change.
--
-- NICHT Teil dieser Migration (= Folge-Feature, wenn SV-Payout/Split gebaut wird):
-- claim-payments.ts auf per-(claim, empfaenger)-Upsert/Read + kunde/sv-Split-UI +
-- Reader die nach Empfaenger aggregieren.

alter table public.claim_payments
  add column empfaenger text not null default 'kunde';

alter table public.claim_payments
  add constraint claim_payments_empfaenger_check
  check (empfaenger in ('kunde', 'sv'));
