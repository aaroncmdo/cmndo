-- AAR-557 (C8) VS-Reaktions-Vollständigkeit — 7 Konzepte + 2 Views

BEGIN;

-- 1. QUOTIERUNG
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS vs_quote_prozent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vs_quote_grund TEXT,
  ADD COLUMN IF NOT EXISTS vs_quote_akzeptiert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vs_quote_betrag_ausgezahlt NUMERIC(10,2);

ALTER TABLE faelle DROP CONSTRAINT IF EXISTS faelle_vs_reaktion_typ_check;
ALTER TABLE faelle
  ADD CONSTRAINT faelle_vs_reaktion_typ_check
  CHECK (vs_reaktion_typ IS NULL OR vs_reaktion_typ = ANY (ARRAY[
    'voll_reguliert'::text,
    'gekuerzt'::text,
    'abgelehnt'::text,
    'mehr_zeit'::text,
    'nachbesichtigung'::text,
    'quotiert'::text
  ]));

-- 2. KÜRZUNGS-TYP
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS vs_kuerzungs_typ TEXT
    CHECK (vs_kuerzungs_typ IS NULL OR vs_kuerzungs_typ IN ('technisch', 'argumentativ', 'gemischt'));

-- 3. AUSZAHLUNGS-SPLIT
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS auszahlung_kunde_betrag NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS auszahlung_kunde_eingegangen_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auszahlung_gutachter_eingegangen_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auszahlung_zahlungsweg TEXT
    CHECK (auszahlung_zahlungsweg IS NULL OR auszahlung_zahlungsweg IN (
      'banktransfer_direkt',
      'fremdkonto_kanzlei',
      'sammelueberweisung'
    ));

COMMENT ON COLUMN faelle.gutachter_honorar IS 'Soll-Honorar SV (unverändert seit Fallanlage)';
COMMENT ON COLUMN faelle.regulierung_betrag IS 'Brutto-Summe von VS (Gesamtzahlung)';
COMMENT ON COLUMN faelle.auszahlung_kunde_betrag IS 'Ist-Eingang Kunden-Anteil';
COMMENT ON COLUMN faelle.auszahlung_kunde_eingegangen_am IS 'Ist-Datum Eingang Kunde';
COMMENT ON COLUMN faelle.auszahlung_gutachter_eingegangen_am IS 'Ist-Datum Eingang SV';

-- 4. RÜGE-2-SLA
ALTER TABLE sla_tracking DROP CONSTRAINT IF EXISTS sla_tracking_sla_typ_check;
ALTER TABLE sla_tracking
  ADD CONSTRAINT sla_tracking_sla_typ_check
  CHECK (sla_typ = ANY (ARRAY[
    'gutachter_zuweisung'::text,
    'termin_bestaetigung'::text,
    'besichtigung'::text,
    'gutachten_upload'::text,
    'vs_antwort_14'::text,
    'vs_antwort_ruege1_14'::text,
    'vs_antwort_ruege2_7'::text,
    'qc_filmcheck'::text,
    'kanzlei_uebergabe'::text,
    'zahlung_eingang'::text
  ]));

-- 5. ESKALATIONS-KONTAKT-ERGEBNIS
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS eskalation_tag_14_ergebnis TEXT,
  ADD COLUMN IF NOT EXISTS eskalation_tag_14_ergebnis_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eskalation_tag_14_ergebnis_von UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS eskalation_tag_21_ergebnis TEXT,
  ADD COLUMN IF NOT EXISTS eskalation_tag_21_ergebnis_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eskalation_tag_21_ergebnis_von UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS eskalation_tag_28_ergebnis TEXT,
  ADD COLUMN IF NOT EXISTS eskalation_tag_28_ergebnis_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eskalation_tag_28_ergebnis_von UUID REFERENCES profiles(id);

-- 6. NACHBESICHTIGUNG
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS nachbesichtigung_kunde_termin_vorschlaege JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_kunde_termin_eingereicht_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_sv_konfrontation_gewuenscht BOOLEAN,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_sv_termin_vereinbart_am TIMESTAMPTZ;

COMMENT ON COLUMN faelle.nachbesichtigung_konfrontation IS 'Realität: war SV vor Ort?';
COMMENT ON COLUMN faelle.nachbesichtigung_sv_konfrontation_gewuenscht IS 'Kunden-Wunsch: SV soll vor Ort sein';
COMMENT ON COLUMN faelle.nachbesichtigung_sv_termin_vereinbart_am IS 'SV hat den Termin bestätigt';
COMMENT ON COLUMN faelle.nachbesichtigung_kunde_termin_vorschlaege IS 'JSONB Array [{datum, uhrzeit}] vom Kunden';

-- 7. webhook_events user_id + RLS
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events_admin_kb_read" ON webhook_events;
CREATE POLICY "webhook_events_admin_kb_read" ON webhook_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.rolle IN ('admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role)
    )
  );

-- 8. VIEWS (Regel #26 Column-Level-Filter)
CREATE OR REPLACE VIEW faelle_kunde_view AS
SELECT
  id, fall_nummer, status, aktuelle_phase,
  schadens_beschreibung, schadens_datum,
  schadens_adresse, schadens_plz, schadens_ort,
  kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr,
  auszahlung_kunde_betrag, auszahlung_kunde_eingegangen_am, auszahlung_zahlungsweg,
  eskalation_tag_14_ergebnis, eskalation_tag_14_ergebnis_am,
  eskalation_tag_21_ergebnis, eskalation_tag_21_ergebnis_am,
  eskalation_tag_28_ergebnis, eskalation_tag_28_ergebnis_am,
  nachbesichtigung_status, nachbesichtigung_termin_datum,
  nachbesichtigung_kunde_termin_vorschlaege,
  nachbesichtigung_kunde_termin_eingereicht_am,
  nachbesichtigung_sv_konfrontation_gewuenscht,
  vs_quote_prozent, vs_quote_grund, vs_quote_akzeptiert_am,
  vs_quote_betrag_ausgezahlt,
  vs_reaktion_typ, vs_reaktion_am,
  besichtigungsort_adresse, abgeschlossen_am,
  kunde_id, sv_id
FROM faelle;

ALTER VIEW faelle_kunde_view SET (security_invoker = true);

CREATE OR REPLACE VIEW faelle_sv_view AS
SELECT
  id, fall_nummer, status, aktuelle_phase,
  schadens_beschreibung, schadens_datum,
  schadens_adresse, schadens_plz, schadens_ort,
  kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr,
  gutachter_honorar, auszahlung_gutachter_eingegangen_am,
  eskalation_tag_14_ergebnis, eskalation_tag_14_ergebnis_am,
  eskalation_tag_21_ergebnis, eskalation_tag_21_ergebnis_am,
  eskalation_tag_28_ergebnis, eskalation_tag_28_ergebnis_am,
  technische_stellungnahme_status, technische_stellungnahme_beauftragt_am,
  technische_stellungnahme_hochgeladen_am, technische_stellungnahme_freigabe_am,
  vs_kuerzung_grund, vs_kuerzungs_typ, kuerzungs_betrag,
  nachbesichtigung_status, nachbesichtigung_termin_datum,
  nachbesichtigung_sv_konfrontation_gewuenscht,
  nachbesichtigung_sv_termin_vereinbart_am,
  vs_reaktion_typ, vs_reaktion_am,
  besichtigungsort_adresse,
  sv_id, kunde_id
FROM faelle;

ALTER VIEW faelle_sv_view SET (security_invoker = true);

COMMENT ON VIEW faelle_kunde_view IS 'AAR-557 Regel #26: Column-Level-Filter für Kunde-Portal. security_invoker=true erbt faelle-RLS.';
COMMENT ON VIEW faelle_sv_view IS 'AAR-557 Regel #26: Column-Level-Filter für SV-Portal. security_invoker=true erbt faelle-RLS.';

COMMIT;
;
