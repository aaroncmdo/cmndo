-- AAR-557 (C8) — DB-Migration: VS-Reaktions-Vollständigkeit
-- Foundation-Ticket für Epic AAR-537. Muss vor C1/C2/C3/C4/C5/C6/C7 laufen.
--
-- 7 Konzepte:
--   1. Quotierung als 5. VS-Reaktions-Pfad (vs_quote_*)
--   2. Kürzungs-Typ (technisch/argumentativ/gemischt)
--   3. Auszahlungs-Split Kunde vs. Gutachter + Column-Filter-Views
--   4. Rüge-2-SLA 7 Tage (sla_tracking CHECK erweitern)
--   5. Eskalations-Kontakt-Ergebnis (Tag 14/21/28 mit Underscore!)
--   6. Nachbesichtigung Kunden-Termin-Vorschläge + Konfrontations-Wunsch
--   7. webhook_events user_id + RLS aktivieren
--
-- Deltas zum Ticket-Text (dokumentiert, nicht Widerspruch):
--   - faelle_vs_reaktion_typ_check EXISTIERT bereits (Ticket nahm an, dass nicht)
--     → wir erweitern um 'quotiert' statt zu ignorieren
--   - sla_tracking_sla_typ_check EXISTIERT bereits mit 4 Werten
--     → drop + neu mit union (existing + 5 neue)
--   - profiles.rolle hat kein 'leadbearbeiter' → wir nutzen 'dispatch' für
--     webhook_events-Read-Policy (dispatch ≈ leadbearbeiter Fachlich)

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. QUOTIERUNG (5. VS-Reaktions-Pfad)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS vs_quote_prozent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vs_quote_grund TEXT,
  ADD COLUMN IF NOT EXISTS vs_quote_akzeptiert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vs_quote_betrag_ausgezahlt NUMERIC(10,2);

-- CHECK für vs_reaktion_typ erweitern um 'quotiert'
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

-- ───────────────────────────────────────────────────────────────────────────
-- 2. KÜRZUNGS-TYP (technisch / argumentativ / gemischt)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS vs_kuerzungs_typ TEXT
    CHECK (vs_kuerzungs_typ IS NULL OR vs_kuerzungs_typ IN ('technisch', 'argumentativ', 'gemischt'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. AUSZAHLUNGS-SPLIT (Kunde vs. Gutachter Eingangs-Tracking)
-- ───────────────────────────────────────────────────────────────────────────

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

-- Kommentar-Semantik:
--   gutachter_honorar        = Soll-Honorar SV (bleibt unverändert)
--   regulierung_betrag       = Brutto-Summe VS (bleibt unverändert)
--   auszahlung_kunde_betrag  = Ist-Eingang Kunde (= regulierung - gutachter_honorar - sonstige)
--   auszahlung_*_eingegangen_am = Ist-Datum Eingang je Partei
COMMENT ON COLUMN faelle.gutachter_honorar IS 'Soll-Honorar SV (unverändert seit Fallanlage)';
COMMENT ON COLUMN faelle.regulierung_betrag IS 'Brutto-Summe von VS (Gesamtzahlung)';
COMMENT ON COLUMN faelle.auszahlung_kunde_betrag IS 'Ist-Eingang Kunden-Anteil';
COMMENT ON COLUMN faelle.auszahlung_kunde_eingegangen_am IS 'Ist-Datum Eingang Kunde';
COMMENT ON COLUMN faelle.auszahlung_gutachter_eingegangen_am IS 'Ist-Datum Eingang SV';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RÜGE-2-SLA 7 Tage (sla_tracking CHECK erweitern)
-- ───────────────────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────────────────
-- 5. ESKALATIONS-KONTAKT-ERGEBNIS (Tag 14/21/28)
-- ───────────────────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────────────────
-- 6. NACHBESICHTIGUNG (Kunde-Vorschläge + Konfrontations-Wunsch)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS nachbesichtigung_kunde_termin_vorschlaege JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_kunde_termin_eingereicht_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_sv_konfrontation_gewuenscht BOOLEAN,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_sv_termin_vereinbart_am TIMESTAMPTZ;

COMMENT ON COLUMN faelle.nachbesichtigung_konfrontation IS 'Realität: war SV vor Ort? (existing boolean)';
COMMENT ON COLUMN faelle.nachbesichtigung_sv_konfrontation_gewuenscht IS 'Kunden-Wunsch: SV soll vor Ort sein (vorab)';
COMMENT ON COLUMN faelle.nachbesichtigung_sv_termin_vereinbart_am IS 'SV hat den Termin bestätigt';
COMMENT ON COLUMN faelle.nachbesichtigung_kunde_termin_vorschlaege IS 'JSONB Array: [{datum, uhrzeit}] vom Kunden';

-- ───────────────────────────────────────────────────────────────────────────
-- 7. webhook_events: user_id + RLS
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Read: Admin + Kundenbetreuer + Dispatch (kein 'leadbearbeiter' in rolle-enum)
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

-- Insert bleibt service_role-only (bypasst RLS) — keine INSERT-Policy.

-- ───────────────────────────────────────────────────────────────────────────
-- 8. COLUMN-LEVEL-FILTER-VIEWS (Regel #26: Auszahlungs-Split)
-- ───────────────────────────────────────────────────────────────────────────

-- Kunde sieht nur Kunde-relevante Spalten (kein gutachter_honorar, kein SV-Eingang)
CREATE OR REPLACE VIEW faelle_kunde_view AS
SELECT
  id, fall_nummer, status, aktuelle_phase,
  schadens_beschreibung, schadens_datum,
  schadens_adresse, schadens_plz, schadens_ort,
  kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr,
  -- Auszahlung NUR Kunde
  auszahlung_kunde_betrag, auszahlung_kunde_eingegangen_am, auszahlung_zahlungsweg,
  -- Eskalations-Ergebnisse (cross-portal sichtbar)
  eskalation_tag_14_ergebnis, eskalation_tag_14_ergebnis_am,
  eskalation_tag_21_ergebnis, eskalation_tag_21_ergebnis_am,
  eskalation_tag_28_ergebnis, eskalation_tag_28_ergebnis_am,
  -- Nachbesichtigung (Kunden-Input + Status)
  nachbesichtigung_status, nachbesichtigung_termin_datum,
  nachbesichtigung_kunde_termin_vorschlaege,
  nachbesichtigung_kunde_termin_eingereicht_am,
  nachbesichtigung_sv_konfrontation_gewuenscht,
  -- Quote (Kunde muss Akzeptanz bestätigen)
  vs_quote_prozent, vs_quote_grund, vs_quote_akzeptiert_am,
  vs_quote_betrag_ausgezahlt,
  -- VS-Status für Anzeige
  vs_reaktion_typ, vs_reaktion_am,
  -- Termin + Abschluss
  besichtigungsort_adresse, abgeschlossen_am,
  -- RLS-Keys
  kunde_id, sv_id
FROM faelle;

ALTER VIEW faelle_kunde_view SET (security_invoker = true);

-- SV sieht nur SV-relevante Spalten (kein auszahlung_kunde_*, keine Quote-Beträge)
CREATE OR REPLACE VIEW faelle_sv_view AS
SELECT
  id, fall_nummer, status, aktuelle_phase,
  schadens_beschreibung, schadens_datum,
  schadens_adresse, schadens_plz, schadens_ort,
  kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr,
  -- Honorar NUR SV
  gutachter_honorar, auszahlung_gutachter_eingegangen_am,
  -- Eskalations-Ergebnisse (cross-portal)
  eskalation_tag_14_ergebnis, eskalation_tag_14_ergebnis_am,
  eskalation_tag_21_ergebnis, eskalation_tag_21_ergebnis_am,
  eskalation_tag_28_ergebnis, eskalation_tag_28_ergebnis_am,
  -- Stellungnahme (SV-Workflow)
  technische_stellungnahme_status, technische_stellungnahme_beauftragt_am,
  technische_stellungnahme_hochgeladen_am, technische_stellungnahme_freigabe_am,
  -- Kürzungs-Kontext (SV muss wissen WAS gekürzt wurde)
  vs_kuerzung_grund, vs_kuerzungs_typ, kuerzungs_betrag,
  -- Nachbesichtigung mit Konfrontations-Wunsch
  nachbesichtigung_status, nachbesichtigung_termin_datum,
  nachbesichtigung_sv_konfrontation_gewuenscht,
  nachbesichtigung_sv_termin_vereinbart_am,
  -- VS-Reaktion (SV muss Typ sehen)
  vs_reaktion_typ, vs_reaktion_am,
  -- Termin
  besichtigungsort_adresse,
  -- RLS-Keys
  sv_id, kunde_id
FROM faelle;

ALTER VIEW faelle_sv_view SET (security_invoker = true);

COMMENT ON VIEW faelle_kunde_view IS 'AAR-557 Regel #26: Column-Level-Filter für Kunde-Portal. security_invoker=true erbt faelle-RLS "Kunden eigene Faelle" (kunde_id = auth.uid()).';
COMMENT ON VIEW faelle_sv_view IS 'AAR-557 Regel #26: Column-Level-Filter für SV-Portal. security_invoker=true erbt faelle-RLS "SV zugewiesene Faelle" (sv_id via sachverstaendige.profile_id).';

COMMIT;
