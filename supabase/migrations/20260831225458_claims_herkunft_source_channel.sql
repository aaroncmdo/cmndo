-- Herkunft am Claim verankern -- dieselbe Klasse wie ist_testfall (Mig 20260831222740).
--
-- BEFUND (31.08.): leads.source_channel und leads.source_domain sind gut gepflegt
-- (15 unterscheidbare Kanaele ueber 90 Tage, nur 7 Leads ohne Wert). claims hat dagegen
-- KEINE einzige Herkunftsspalte. Die Attribution lebt damit ausschliesslich am Lead:
--
--   • claims_lead_id_fkey ist ON DELETE SET NULL -> ein Cleanup kappt die Verbindung und
--     die Herkunft ist unwiederbringlich weg.
--   • Schon ohne Loeschung braucht jede claim-zentrierte Auswertung einen JOIN, der bei
--     lead_id IS NULL ins Leere laeuft -- das betraf 26 von 57 Komplettservice-Claims.
--
-- Folge: Bei laufenden Ads ist nicht bestimmbar, welcher Kanal einen FALL gebracht hat
-- (nur, welcher einen Lead brachte). Genau die Frage entscheidet ueber Budget.
--
-- Gefuellt wird beim Convert (convert-lead-to-claim.ts) aus dem Lead; der Bestand per
-- scripts/backfill-claim-herkunft.mjs aus den noch lebenden Leads.
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_domain  text;

COMMENT ON COLUMN public.claims.source_channel IS
  'Eintrittskanal, beim Lead->Claim-Convert aus leads.source_channel uebernommen und '
  'PERSISTIERT -- damit die Attribution eine Lead-Loeschung ueberlebt '
  '(claims_lead_id_fkey = ON DELETE SET NULL) und claim-zentrierte Auswertungen ohne '
  'JOIN auskommen. Bewusst OHNE CHECK-Constraint: die Wertemenge waechst mit jedem neuen '
  'Eintrittsweg, und ein zu enger CHECK wuerde den Convert still fehlschlagen lassen.';

COMMENT ON COLUMN public.claims.source_domain IS
  'Herkunfts-Domain (Marketing-/Cluster-Landingpage), analog source_channel beim Convert '
  'aus leads.source_domain uebernommen.';
