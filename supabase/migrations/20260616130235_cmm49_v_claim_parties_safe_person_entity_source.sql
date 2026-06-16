-- CMM-49 / Entity Plan-5 (Flat-Drop, Schritt 1): v_claim_parties_safe person-Spalten
-- entity-primaer aus personen sourcen (COALESCE(p.x, cp.x) via LEFT JOIN auf person_id).
-- Transitionaler Schritt: personen wird Primaerquelle, der flat claim_parties.<x>-Wert bleibt
-- Fallback. Output-IDENTISCH (DB-verifiziert: 0 Divergenz ueber alle 84 Zeilen / 8 exponierte
-- Person-Spalten; md5 vor==nach). Unter security_invoker=true ist COALESCE in JEDEM Kontext
-- wertneutral: personen-RLS versteckt eine Zeile -> p.x=NULL -> Fallback cp.x (heutiger Wert);
-- sichtbar -> p.x==cp.x (Audit). GRANT-Gate geprueft: jede Rolle mit View-SELECT (authenticated/
-- service_role) hat auch personen-SELECT; anon ist schon an claim_parties (Base-Table) geblockt.
-- Vehicle-Spalten (kennzeichen, fahrzeugtyp_klartext, vehicle_id) bleiben cp.* (CMM-50);
-- versicherungsnummer/versicherung_id bleiben cp.* (party-level). Masking-CASEs unveraendert.
-- Fallback-Entfernung + DROP COLUMN folgt im finalen Cutover (Aaron-gated).
CREATE OR REPLACE VIEW public.v_claim_parties_safe
WITH (security_invoker = true) AS
SELECT
    cp.id,
    cp.claim_id,
    cp.rolle,
    cp.reihenfolge,
    cp.user_id,
    COALESCE(p.vorname, cp.vorname) AS vorname,
    CASE
        WHEN cp.user_id = auth.uid() THEN COALESCE(p.nachname, cp.nachname)
        WHEN (EXISTS ( SELECT 1
           FROM profiles
          WHERE profiles.id = auth.uid() AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))) THEN COALESCE(p.nachname, cp.nachname)
        ELSE COALESCE("left"(COALESCE(p.nachname, cp.nachname), 1) || '.'::text, ''::text)
    END AS nachname,
    COALESCE(p.firma, cp.firma) AS firma,
    COALESCE(p.ist_gewerbe, cp.ist_gewerbe) AS ist_gewerbe,
    CASE
        WHEN cp.user_id = auth.uid() OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE profiles.id = auth.uid() AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))) THEN COALESCE(p.telefon, cp.telefon)
        ELSE NULL::text
    END AS telefon,
    CASE
        WHEN cp.user_id = auth.uid() OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE profiles.id = auth.uid() AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))) THEN COALESCE(p.email, cp.email)
        ELSE NULL::text
    END AS email,
    CASE
        WHEN cp.user_id = auth.uid() OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE profiles.id = auth.uid() AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))) THEN COALESCE(p.adresse_strasse, cp.adresse_strasse)
        ELSE NULL::text
    END AS adresse_strasse,
    CASE
        WHEN cp.user_id = auth.uid() OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE profiles.id = auth.uid() AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))) THEN COALESCE(p.geburtsdatum, cp.geburtsdatum)
        ELSE NULL::date
    END AS geburtsdatum,
    cp.ist_halter,
    cp.ist_fahrer,
    cp.kennzeichen,
    cp.fahrzeugtyp_klartext,
    cp.vehicle_id,
    CASE
        WHEN cp.user_id = auth.uid() OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE profiles.id = auth.uid() AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))) THEN cp.versicherungsnummer
        ELSE NULL::text
    END AS versicherungsnummer,
    cp.versicherung_id,
    cp.ist_aktiv,
    cp.ist_anonymisiert,
    cp.quelle,
    cp.created_at,
    cp.updated_at
FROM claim_parties cp
LEFT JOIN personen p ON p.id = cp.person_id;
