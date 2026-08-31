-- Testdaten-Marker am Claim -- ueberlebt die Loeschung des Leads.
--
-- ROOT CAUSE (gemessen 31.08.2026 auf prod): claims_lead_id_fkey ist ON DELETE SET NULL.
-- Loescht ein Smoke-/Ops-Test-Cleanup seinen Test-Lead, setzt Postgres claims.lead_id auf
-- NULL -- und mit dem Lead verschwindet der EINZIGE Testmarker (Email/Name). Der Claim ist
-- danach von einem echten Kundenfall nicht mehr unterscheidbar: kein Lead, kein
-- created_by_user_id, kein fall_typ, kein vermittler_typ.
--
-- Folge: 26 von 57 Komplettservice-Claims ohne Lead; darunter ~11 aus dem Ops-Test vom
-- 11.08. (erkennbar nur noch an der Zeit-Signatur: 11 Claims in 13 Minuten, fortlaufende
-- claim_nummer). Jede Kennzahl -- Funnel, Durchlaufzeit, Konversion -- war dadurch
-- unbrauchbar, und ein Kundenbetreuer haette Phantome abgearbeitet.
--
-- Namenskonvention folgt dem etablierten sachverstaendige.ist_testaccount (#3438).
-- Gesetzt wird das Flag in convert-lead-to-claim.ts aus einer RFC-2606-reservierten
-- Absender-Domain -- bewusst NICHT ueber die breite istTestEmail-Heuristik: dort waere ein
-- False-Positive harmlos (eine Mail geht nicht raus), hier wuerde er einen ECHTEN
-- Schadensfall aus der operativen Liste entfernen.
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS ist_testfall boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.claims.ist_testfall IS
  'Testdaten-Marker (Seed/Smoke/Ops-Test). Wird bei der Lead->Claim-Konversion aus einer '
  'RFC-2606-reservierten Absender-Domain (@*.test, @example.com/org/net, @*.invalid) '
  'abgeleitet und PERSISTIERT, damit er eine spaetere Lead-Loeschung ueberlebt '
  '(claims_lead_id_fkey = ON DELETE SET NULL). Operative Listen und Kennzahlen filtern '
  'darauf. Bewusst enger als lib/testdaten/istTestEmail: ein False-Positive wuerde hier '
  'einen echten Schadensfall verstecken.';
