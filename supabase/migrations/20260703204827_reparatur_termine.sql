-- SP2: Reparaturtermin-Lifecycle. Neue Tabelle reparatur_termine.
-- Kunde schlaegt Wunschtermin vor (angefragt), Werkstatt bestaetigt/ruft an/lehnt ab.
-- Claim-Phase wird abgeleitet (kein operative_status-Eingriff).

CREATE TABLE public.reparatur_termine (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id             uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  werkstatt_id         uuid NOT NULL REFERENCES public.werkstaetten(id),
  wunschtermin         timestamptz NOT NULL,
  bestaetigter_termin  timestamptz,
  status               text NOT NULL DEFAULT 'angefragt'
                         CHECK (status IN ('angefragt','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert')),
  absage_grund         text,
  erstellt_von         uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reparatur_termine_claim_id_idx     ON public.reparatur_termine(claim_id);
CREATE INDEX reparatur_termine_werkstatt_id_idx ON public.reparatur_termine(werkstatt_id);

ALTER TABLE public.reparatur_termine ENABLE ROW LEVEL SECURITY;

-- Lesen: Staff + die fuer den Claim zustaendige Werkstatt. (Kunde-SELECT folgt in SP4.)
CREATE POLICY reparatur_termine_select ON public.reparatur_termine
  FOR SELECT TO authenticated
  USING ( is_staff() OR is_werkstatt_for_claim(claim_id) );

-- INSERT: nur Staff. Die Conversion laeuft ueber den Admin-Client (Service-Role bypassed RLS ohnehin).
CREATE POLICY reparatur_termine_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK ( is_staff() );

-- UPDATE: Staff + die zustaendige Werkstatt (bestaetigt/ruft an/lehnt ab ueber ihre Session).
CREATE POLICY reparatur_termine_update ON public.reparatur_termine
  FOR UPDATE TO authenticated
  USING ( is_staff() OR is_werkstatt_for_claim(claim_id) )
  WITH CHECK ( is_staff() OR is_werkstatt_for_claim(claim_id) );

COMMENT ON TABLE public.reparatur_termine IS
  'Reparaturtermin-Lifecycle (SP2). Kunde schlaegt Wunschtermin vor (angefragt), Werkstatt bestaetigt/ruft an/lehnt ab. Phase abgeleitet, kein operative_status-Eingriff.';
