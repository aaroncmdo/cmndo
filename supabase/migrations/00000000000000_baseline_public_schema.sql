-- Baseline: vollstaendiges public-Schema (Stand 2026-05-30, pg_dump 17.6, schema-only, --no-owner).
-- Konsolidiert die historischen Migrationen, damit der Supabase-Preview-Replay (from-empty)
-- die Basis aufbaut. Auf Prod recorded-only via migration repair 00000000000000 --status applied (0 SQL).
-- Aus echtem pg_dump; Branch-inkompatible Zeilen entfernt (psql-Meta, CREATE SCHEMA, supabase_admin default privs).

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: betreuungspaket; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.betreuungspaket AS ENUM (
    'vollservice',
    'sv-only'
);


--
-- Name: bkat_schuldindiz; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bkat_schuldindiz AS ENUM (
    'gegner_klar',
    'gegner_wahrscheinlich',
    'geteilt',
    'kunde_verdacht',
    'neutral'
);


--
-- Name: bkat_unfallart; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bkat_unfallart AS ENUM (
    'auffahrunfall',
    'vorfahrt',
    'kreuzung_rotlicht',
    'spurwechsel',
    'ueberholen',
    'abbiegen',
    'rueckwaerts_parken',
    'einfahren_anfahren',
    'dooring',
    'fussgaenger',
    'geschwindigkeit',
    'fahrerflucht',
    'alkohol_drogen',
    'grundregeln',
    'sonstiges'
);


--
-- Name: dokument_kategorie; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dokument_kategorie AS ENUM (
    'stammdaten',
    'unfall',
    'personenschaden',
    'fahrzeug',
    'kosten',
    'kanzlei',
    'gutachten',
    'sonstiges',
    'gutachter_verifizierung'
);


--
-- Name: dokument_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dokument_typ AS ENUM (
    'foto-schaden',
    'foto-vorher',
    'mietvertrag',
    'uebergabeprotokoll',
    'gutachten',
    'abtretung',
    'vollmacht',
    'rechnung',
    'korrespondenz',
    'buchungsbestaetigung',
    'sonstiges',
    'fahrzeugschein',
    'fuehrerschein',
    'schadensfotos',
    'schadensfoto',
    'gegner-daten',
    'eigene-versicherung',
    'polizeibericht',
    'eigene-versicherungspolice',
    'leasingvertrag',
    'finanzierungsvertrag',
    'gewerbenachweis',
    'gf-vollmacht',
    'halter-ausweis',
    'aerztliches-attest',
    'mietwagenvertrag',
    'kunde-nachreichung',
    'kanzlei-paket',
    'anschlussschreiben',
    'regulierungsbescheid',
    'gutachter-foto',
    'whatsapp-foto',
    'sa-unterschrift',
    'kundendokument',
    'kanzlei',
    'unterschrift'
);


--
-- Name: fall_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fall_status AS ENUM (
    'ersterfassung',
    'onboarding',
    'sv-gesucht',
    'sv-zugewiesen',
    'sv-termin',
    'besichtigung',
    'begutachtung-laeuft',
    'gutachten-eingegangen',
    'filmcheck',
    'qc-pruefung',
    'kanzlei-uebergeben',
    'anschlussschreiben',
    'regulierung',
    'regulierung-laeuft',
    'nachbesichtigung-laeuft',
    'zahlung-eingegangen',
    'vs-abgelehnt',
    'abgeschlossen',
    'storniert'
);


--
-- Name: lead_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_status AS ENUM (
    'neu',
    'rueckruf',
    'quali-offen',
    'flow-gesendet',
    'umgewandelt',
    'umgewandelt-sv',
    'disqualifiziert',
    'kalt'
);


--
-- Name: partei_rolle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partei_rolle AS ENUM (
    'geschaedigter',
    'schaediger'
);


--
-- Name: schadens_kategorie; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.schadens_kategorie AS ENUM (
    'boden',
    'wand',
    'decke',
    'moebel',
    'kueche',
    'bad',
    'elektro',
    'sanitaer',
    'fenster',
    'tuer',
    'fassade',
    'sonstiges'
);


--
-- Name: schadens_ursache; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.schadens_ursache AS ENUM (
    'wasserschaden',
    'sachbeschaedigung',
    'brand',
    'einbruch',
    'sturmschaden',
    'vandalismus',
    'verschleiss',
    'sonstiges'
);


--
-- Name: sv_paket_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sv_paket_typ AS ENUM (
    'solo',
    'buero_inhaber',
    'sub_buero',
    'akademie_verwalter',
    'akademie_sub'
);


--
-- Name: TYPE sv_paket_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.sv_paket_typ IS 'AAR-748: Orthogonales SV-Paket zur profiles.rolle=sachverstaendiger. Bestimmt Permissions innerhalb der Büro-/Akademie-Struktur. Community-Zugehörigkeit ist über profiles.community_id separat.';


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'offen',
    'in-bearbeitung',
    'erledigt',
    'blockiert'
);


--
-- Name: task_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_typ AS ENUM (
    'filmcheck',
    'kanzlei-anschlussschreiben',
    'kanzlei-nachfrage',
    'versicherung-kontakt',
    'kunde-rueckfrage',
    'sv-termin',
    'zahlung-pruefen',
    'sonstiges'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'kunde',
    'sachverstaendiger',
    'admin',
    'kanzlei',
    'leadbearbeiter',
    'dispatch',
    'kundenbetreuer',
    'makler'
);


--
-- Name: vertrag_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vertrag_typ AS ENUM (
    'mietvertrag',
    'airbnb',
    'gewerbemietvertrag',
    'nachbarschaft',
    'dienstvertrag',
    'sonstiges'
);


--
-- Name: airdrop_status_consistency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.airdrop_status_consistency() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- Wenn status='geoeffnet' aber opened_at NULL → setze opened_at
  IF NEW.status IN ('geoeffnet','daten_eingegeben','konvertiert') AND NEW.opened_at IS NULL THEN
    NEW.opened_at := now();
  END IF;

  -- Wenn status='daten_eingegeben' aber responded_at NULL → setze responded_at
  IF NEW.status IN ('daten_eingegeben','konvertiert') AND NEW.responded_at IS NULL THEN
    NEW.responded_at := now();
  END IF;

  -- Wenn status='widerrufen' aber withdrawn_at NULL → setze withdrawn_at
  IF NEW.status = 'widerrufen' AND NEW.withdrawn_at IS NULL THEN
    NEW.withdrawn_at := now();
  END IF;

  RETURN NEW;
END $$;


--
-- Name: anonymisiere_claim_party(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anonymisiere_claim_party() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.ist_anonymisiert = TRUE AND OLD.ist_anonymisiert = FALSE THEN
    NEW.vorname := NULL;
    NEW.nachname := '(anonymisiert)';
    NEW.geburtsdatum := NULL;
    NEW.telefon := NULL;
    NEW.mobil := NULL;
    NEW.email := NULL;
    NEW.adresse_strasse := NULL;
    NEW.adresse_plz := NULL;
    NEW.adresse_ort := NULL;
    NEW.fuehrerscheinnummer := NULL;
    NEW.versicherungsnummer := NULL;
    NEW.versicherungs_aktenzeichen := NULL;
    NEW.anonymisiert_am := COALESCE(NEW.anonymisiert_am, now());
  END IF;
  RETURN NEW;
END $$;


--
-- Name: apply_gutachten_ocr(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_gutachten_ocr(p_claim_id uuid, p_values jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_sv_id uuid;
BEGIN
  -- Brauchen sv_id für NOT-NULL-Constraint auf gutachten.
  SELECT f.sv_id INTO v_sv_id FROM public.faelle f WHERE f.claim_id = p_claim_id;

  -- Wenn kein SV zugeordnet: kein gutachten-Row anlegen.
  -- Caller müssen das tolerieren — typisch OCR-Werte landen erst sobald ein SV
  -- zugewiesen ist, vorher ist der Wert „verloren" (kein Fallback mehr seit PR-2b).
  IF v_sv_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.gutachten (
    claim_id, sv_id, status,
    gutachten_datum, gutachten_ocr_processed_at, gutachten_ocr_raw,
    gutachten_ocr_error, gutachten_ocr_manuell_ueberschrieben,
    gutachten_fin, gutachten_kennzeichen, gutachten_erstzulassung,
    gutachten_laufleistung_km, gutachten_tuv_bis, gutachten_fahrzeug_typ,
    gutachten_farbe, gutachten_farbcode, gutachten_kraftstoff,
    gutachten_vorschaeden_text, gutachten_lackmesswert_max_my,
    gutachten_karosseriezustand,
    gutachten_zeit_ak_std, gutachten_zeit_kar_std, gutachten_zeit_lack_std,
    gutachten_lohnsatz_ak_eur, gutachten_lohnsatz_kar_eur, gutachten_lohnsatz_lack_eur,
    gutachten_materialkosten_eur, gutachten_lackmaterial_eur, gutachten_verbringung_eur,
    gutachten_mietwagen_klasse, gutachten_mietwagen_tagessatz_eur,
    gutachten_nutzungsausfall_tagessatz_eur,
    gutachten_sv_honorar_netto, gutachten_sv_honorar_brutto,
    gutachten_kalkulationssystem, gutachten_seitenzahl,
    reparaturkosten_netto, reparaturkosten_brutto, minderwert, restwert,
    wiederbeschaffungswert, wiederbeschaffungsdauer_tage,
    nutzungsausfall_tage, totalschaden
  )
  VALUES (
    p_claim_id, v_sv_id, 'final',
    (p_values->>'gutachten_datum')::date,
    (p_values->>'gutachten_ocr_processed_at')::timestamptz,
    p_values->'gutachten_ocr_raw',
    NULLIF(p_values->>'gutachten_ocr_error', ''),
    COALESCE((p_values->>'gutachten_ocr_manuell_ueberschrieben')::boolean, false),
    p_values->>'gutachten_fin',
    p_values->>'gutachten_kennzeichen',
    (p_values->>'gutachten_erstzulassung')::date,
    (p_values->>'gutachten_laufleistung_km')::integer,
    (p_values->>'gutachten_tuv_bis')::date,
    p_values->>'gutachten_fahrzeug_typ',
    p_values->>'gutachten_farbe',
    p_values->>'gutachten_farbcode',
    p_values->>'gutachten_kraftstoff',
    p_values->>'gutachten_vorschaeden_text',
    (p_values->>'gutachten_lackmesswert_max_my')::numeric,
    p_values->>'gutachten_karosseriezustand',
    (p_values->>'gutachten_zeit_ak_std')::numeric,
    (p_values->>'gutachten_zeit_kar_std')::numeric,
    (p_values->>'gutachten_zeit_lack_std')::numeric,
    (p_values->>'gutachten_lohnsatz_ak_eur')::numeric,
    (p_values->>'gutachten_lohnsatz_kar_eur')::numeric,
    (p_values->>'gutachten_lohnsatz_lack_eur')::numeric,
    (p_values->>'gutachten_materialkosten_eur')::numeric,
    (p_values->>'gutachten_lackmaterial_eur')::numeric,
    (p_values->>'gutachten_verbringung_eur')::numeric,
    p_values->>'gutachten_mietwagen_klasse',
    (p_values->>'gutachten_mietwagen_tagessatz_eur')::numeric,
    (p_values->>'gutachten_nutzungsausfall_tagessatz_eur')::numeric,
    (p_values->>'gutachten_sv_honorar_netto')::numeric,
    (p_values->>'gutachten_sv_honorar_brutto')::numeric,
    p_values->>'gutachten_kalkulationssystem',
    (p_values->>'gutachten_seitenzahl')::integer,
    (p_values->>'reparaturkosten_netto')::numeric,
    (p_values->>'reparaturkosten_brutto')::numeric,
    (p_values->>'minderwert')::numeric,
    (p_values->>'restwert')::numeric,
    (p_values->>'wiederbeschaffungswert')::numeric,
    (p_values->>'wiederbeschaffungsdauer_tage')::integer,
    (p_values->>'nutzungsausfall_tage')::integer,
    (p_values->>'totalschaden')::boolean
  )
  ON CONFLICT (claim_id) DO UPDATE SET
    gutachten_datum                     = COALESCE(EXCLUDED.gutachten_datum, public.gutachten.gutachten_datum),
    gutachten_ocr_processed_at          = COALESCE(EXCLUDED.gutachten_ocr_processed_at, public.gutachten.gutachten_ocr_processed_at),
    gutachten_ocr_raw                   = COALESCE(EXCLUDED.gutachten_ocr_raw, public.gutachten.gutachten_ocr_raw),
    gutachten_ocr_error                 = EXCLUDED.gutachten_ocr_error,
    gutachten_ocr_manuell_ueberschrieben = COALESCE(EXCLUDED.gutachten_ocr_manuell_ueberschrieben, public.gutachten.gutachten_ocr_manuell_ueberschrieben),
    gutachten_fin                       = COALESCE(EXCLUDED.gutachten_fin, public.gutachten.gutachten_fin),
    gutachten_kennzeichen               = COALESCE(EXCLUDED.gutachten_kennzeichen, public.gutachten.gutachten_kennzeichen),
    gutachten_erstzulassung             = COALESCE(EXCLUDED.gutachten_erstzulassung, public.gutachten.gutachten_erstzulassung),
    gutachten_laufleistung_km           = COALESCE(EXCLUDED.gutachten_laufleistung_km, public.gutachten.gutachten_laufleistung_km),
    gutachten_tuv_bis                   = COALESCE(EXCLUDED.gutachten_tuv_bis, public.gutachten.gutachten_tuv_bis),
    gutachten_fahrzeug_typ              = COALESCE(EXCLUDED.gutachten_fahrzeug_typ, public.gutachten.gutachten_fahrzeug_typ),
    gutachten_farbe                     = COALESCE(EXCLUDED.gutachten_farbe, public.gutachten.gutachten_farbe),
    gutachten_farbcode                  = COALESCE(EXCLUDED.gutachten_farbcode, public.gutachten.gutachten_farbcode),
    gutachten_kraftstoff                = COALESCE(EXCLUDED.gutachten_kraftstoff, public.gutachten.gutachten_kraftstoff),
    gutachten_vorschaeden_text          = COALESCE(EXCLUDED.gutachten_vorschaeden_text, public.gutachten.gutachten_vorschaeden_text),
    gutachten_lackmesswert_max_my       = COALESCE(EXCLUDED.gutachten_lackmesswert_max_my, public.gutachten.gutachten_lackmesswert_max_my),
    gutachten_karosseriezustand         = COALESCE(EXCLUDED.gutachten_karosseriezustand, public.gutachten.gutachten_karosseriezustand),
    gutachten_zeit_ak_std               = COALESCE(EXCLUDED.gutachten_zeit_ak_std, public.gutachten.gutachten_zeit_ak_std),
    gutachten_zeit_kar_std              = COALESCE(EXCLUDED.gutachten_zeit_kar_std, public.gutachten.gutachten_zeit_kar_std),
    gutachten_zeit_lack_std             = COALESCE(EXCLUDED.gutachten_zeit_lack_std, public.gutachten.gutachten_zeit_lack_std),
    gutachten_lohnsatz_ak_eur           = COALESCE(EXCLUDED.gutachten_lohnsatz_ak_eur, public.gutachten.gutachten_lohnsatz_ak_eur),
    gutachten_lohnsatz_kar_eur          = COALESCE(EXCLUDED.gutachten_lohnsatz_kar_eur, public.gutachten.gutachten_lohnsatz_kar_eur),
    gutachten_lohnsatz_lack_eur         = COALESCE(EXCLUDED.gutachten_lohnsatz_lack_eur, public.gutachten.gutachten_lohnsatz_lack_eur),
    gutachten_materialkosten_eur        = COALESCE(EXCLUDED.gutachten_materialkosten_eur, public.gutachten.gutachten_materialkosten_eur),
    gutachten_lackmaterial_eur          = COALESCE(EXCLUDED.gutachten_lackmaterial_eur, public.gutachten.gutachten_lackmaterial_eur),
    gutachten_verbringung_eur           = COALESCE(EXCLUDED.gutachten_verbringung_eur, public.gutachten.gutachten_verbringung_eur),
    gutachten_mietwagen_klasse          = COALESCE(EXCLUDED.gutachten_mietwagen_klasse, public.gutachten.gutachten_mietwagen_klasse),
    gutachten_mietwagen_tagessatz_eur   = COALESCE(EXCLUDED.gutachten_mietwagen_tagessatz_eur, public.gutachten.gutachten_mietwagen_tagessatz_eur),
    gutachten_nutzungsausfall_tagessatz_eur = COALESCE(EXCLUDED.gutachten_nutzungsausfall_tagessatz_eur, public.gutachten.gutachten_nutzungsausfall_tagessatz_eur),
    gutachten_sv_honorar_netto          = COALESCE(EXCLUDED.gutachten_sv_honorar_netto, public.gutachten.gutachten_sv_honorar_netto),
    gutachten_sv_honorar_brutto         = COALESCE(EXCLUDED.gutachten_sv_honorar_brutto, public.gutachten.gutachten_sv_honorar_brutto),
    gutachten_kalkulationssystem        = COALESCE(EXCLUDED.gutachten_kalkulationssystem, public.gutachten.gutachten_kalkulationssystem),
    gutachten_seitenzahl                = COALESCE(EXCLUDED.gutachten_seitenzahl, public.gutachten.gutachten_seitenzahl),
    reparaturkosten_netto               = COALESCE(EXCLUDED.reparaturkosten_netto, public.gutachten.reparaturkosten_netto),
    reparaturkosten_brutto              = COALESCE(EXCLUDED.reparaturkosten_brutto, public.gutachten.reparaturkosten_brutto),
    minderwert                          = COALESCE(EXCLUDED.minderwert, public.gutachten.minderwert),
    restwert                            = COALESCE(EXCLUDED.restwert, public.gutachten.restwert),
    wiederbeschaffungswert              = COALESCE(EXCLUDED.wiederbeschaffungswert, public.gutachten.wiederbeschaffungswert),
    wiederbeschaffungsdauer_tage        = COALESCE(EXCLUDED.wiederbeschaffungsdauer_tage, public.gutachten.wiederbeschaffungsdauer_tage),
    nutzungsausfall_tage                = COALESCE(EXCLUDED.nutzungsausfall_tage, public.gutachten.nutzungsausfall_tage),
    totalschaden                        = COALESCE(EXCLUDED.totalschaden, public.gutachten.totalschaden);
END;
$$;


--
-- Name: FUNCTION apply_gutachten_ocr(p_claim_id uuid, p_values jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_gutachten_ocr(p_claim_id uuid, p_values jsonb) IS 'AAR Cluster F+G PR-1: Atomic Dual-Write OCR-Werte auf claims + gutachten. p_values = jsonb-Map ColumnName -> Wert. NULL-Values im jsonb fuehren COALESCE auf bestehende DB-Werte (keine accidental NULL-Overwrites). Wird in PR-2 zurueck auf gutachten-only umgestellt + claims-Write entfernt.';


--
-- Name: audit_rls_function_grants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_rls_function_grants() RETURNS TABLE(proname text, fn_sig text, auth_exec boolean, svc_exec boolean, policy_refs bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  WITH secdef AS (
    SELECT
      p.oid,
      p.proname::text AS proname,
      (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text AS fn_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  ),
  refs AS (
    SELECT DISTINCT s.oid, s.proname, s.fn_sig
    FROM pg_policies pol
    CROSS JOIN secdef s
    WHERE
      (pol.qual       IS NOT NULL AND pol.qual       LIKE '%' || s.proname || '(%')
      OR (pol.with_check IS NOT NULL AND pol.with_check LIKE '%' || s.proname || '(%')
  )
  SELECT
    r.proname,
    r.fn_sig,
    has_function_privilege('authenticated', r.oid, 'EXECUTE') AS auth_exec,
    has_function_privilege('service_role',  r.oid, 'EXECUTE') AS svc_exec,
    (SELECT count(*) FROM pg_policies pol
       WHERE (pol.qual       LIKE '%' || r.proname || '(%')
          OR (pol.with_check LIKE '%' || r.proname || '(%')) AS policy_refs
  FROM refs r
  ORDER BY r.proname;
$$;


--
-- Name: FUNCTION audit_rls_function_grants(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.audit_rls_function_grants() IS 'AAR-921 RLS-Drift-Audit: liefert SECDEF-Functions in pg_policies + EXECUTE-Grant-Status. Wird von scripts/check-rls-function-grants.mjs in CI gecallt.';


--
-- Name: auftraege_sync_claim_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auftraege_sync_claim_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id
    FROM public.faelle
    WHERE id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION auftraege_sync_claim_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.auftraege_sync_claim_id() IS 'CMM Phase 1.5b: füllt auftraege.claim_id aus faelle.claim_id wenn nicht explizit gesetzt. Caller können claim_id auch direkt mitgeben.';


--
-- Name: auftraege_validate_typ_requires_kanzleifall(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auftraege_validate_typ_requires_kanzleifall() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.typ IN ('nachbesichtigung', 'stellungnahme') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.kanzlei_faelle WHERE claim_id = NEW.claim_id
    ) THEN
      RAISE EXCEPTION
        'Auftrag-Typ % nur zulässig wenn der Claim einen Kanzleifall hat (claim_id=%)',
        NEW.typ, NEW.claim_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION auftraege_validate_typ_requires_kanzleifall(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.auftraege_validate_typ_requires_kanzleifall() IS 'CMM Phase 1.5c: Verhindert dass Nachbesichtigungs- oder Stellungnahme-Auftraege ohne existierenden Kanzleifall angelegt werden. Erstgutachten ist ausgenommen.';


--
-- Name: can_access_fall(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_fall(p_fall_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
    OR
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN claims c ON c.id = f.claim_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = p_fall_id
        AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = auth.uid()
    );
$$;


--
-- Name: FUNCTION can_access_fall(p_fall_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_access_fall(p_fall_id uuid) IS 'CMM-21: leadbearbeiter-Branch entfernt (Rolle existiert nicht mehr im user_role-Enum, Spalte faelle.leadbearbeiter_id wurde gedroppt).';


--
-- Name: check_fall_claim_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_fall_claim_id() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- claim_id darf beim INSERT noch NULL sein (wird im nächsten Statement via
  -- createClaimForFall gesetzt). AFTER INSERT prüft 0 Sekunden nach INSERT.
  -- Bei NULL: RAISE WARNING damit es im Supabase-Log sichtbar ist.
  IF NEW.claim_id IS NULL THEN
    RAISE WARNING
      'AAR-816: Fall % wurde ohne claim_id angelegt. '
      'createClaimForFall() muss unmittelbar danach aufgerufen werden.',
      NEW.id;
  END IF;
  RETURN NULL;  -- AFTER trigger, kein RETURN NEW nötig
END $$;


--
-- Name: check_gfa_rate_limit(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_gfa_rate_limit(p_ip_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_count integer;
  v_limit constant integer := 5;
  v_window constant interval := '1 hour';
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 8 THEN
    -- ohne IP-Hash kein Rate-Limit möglich, prophylaktisch deny
    RETURN false;
  END IF;

  -- Lazy-Cleanup: alte Einträge entfernen (> 24h)
  DELETE FROM public.gfa_rate_limit
  WHERE created_at < now() - interval '24 hours';

  -- Count im Sliding-Window
  SELECT count(*) INTO v_count
  FROM public.gfa_rate_limit
  WHERE ip_hash = p_ip_hash
    AND created_at >= now() - v_window;

  IF v_count >= v_limit THEN
    RETURN false;
  END IF;

  -- Eintrag schreiben + true returnen
  INSERT INTO public.gfa_rate_limit (ip_hash) VALUES (p_ip_hash);
  RETURN true;
END;
$$;


--
-- Name: FUNCTION check_gfa_rate_limit(p_ip_hash text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_gfa_rate_limit(p_ip_hash text) IS 'AAR-915 — Sliding-Window-Rate-Limit (5 Anfragen / 1h) für anonyme Gutachter-Finder-Anfragen. Wird von saveOnboardingStep aufgerufen.';


--
-- Name: convert_anfrage_zu_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_anfrage   public.anfragen;
  v_lead_id   uuid;
  v_vorname   text;
  v_nachname  text;
  v_telefon   text;
BEGIN
  -- 1. Anfrage holen mit Row-Lock (verhindert parallele Convert-Race)
  SELECT * INTO v_anfrage
  FROM public.anfragen
  WHERE id = p_anfrage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurueck
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split "Max Mustermann" → vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')),
                         length(v_vorname) + 2),
                  ''
                );
  v_telefon := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- 3. Lead anlegen
  -- AAR-1478: source_channel + status explizit. Vorher fehlten beide →
  -- source_channel war NULL, status fiel auf DB-Default 'neu' zurueck.
  -- v_anfrage.quelle entspricht den source_channel-Werten der anderen
  -- Lead-Eintrittspunkte ('kfzgutachter-ads-lp', 'gutachter-finder-termin',
  -- 'makler-partner-form', etc. — wie in den Side-Effect-Stubs unten gemappt).
  INSERT INTO public.leads (
    vorname, nachname, telefon, email, kunde_plz,
    source_channel, status
  )
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt,
    v_anfrage.quelle,
    'neu'::lead_status
  )
  RETURNING id INTO v_lead_id;

  -- 4. Channel-spezifische Side-Effects
  --
  -- Gutachter-Termin-Channel: aktuell DEAKTIVIERT, weil admin_termine.erstellt_von
  -- NOT NULL ist und auth.uid() bei service_role-Call NULL liefert → garantierter
  -- Crash. Aktivierung erfordert entweder:
  --   a) Eine Migration die admin_termine.erstellt_von nullable macht
  --   b) Einen designierten System-User (uuid-Konstante) als COALESCE-Fallback
  --
  -- IF v_anfrage.quelle = 'gutachter-finder-termin'
  --    AND v_anfrage.payload ? 'vorgesehener_gutachter_id'
  --    AND v_anfrage.payload ? 'termin_start' THEN
  --   INSERT INTO public.admin_termine (
  --     typ, titel, lead_id, sv_id, start_zeit, end_zeit, status, erstellt_von
  --   ) VALUES (
  --     'vor-ort-besichtigung',
  --     'Besichtigung (aus Anfrage)',
  --     v_lead_id,
  --     (v_anfrage.payload->>'vorgesehener_gutachter_id')::uuid,
  --     (v_anfrage.payload->>'termin_start')::timestamptz,
  --     (v_anfrage.payload->>'termin_start')::timestamptz + interval '1 hour',
  --     'offen',
  --     auth.uid()
  --   );
  -- END IF;

  -- Makler-Channel: ebenfalls DEAKTIVIERT (leads.vermittelnder_makler_id existiert nicht).
  -- IF v_anfrage.quelle = 'makler-partner-form'
  --    AND v_anfrage.payload ? 'vermittelnder_makler_id' THEN
  --   UPDATE public.leads
  --      SET vermittelnder_makler_id = (v_anfrage.payload->>'vermittelnder_makler_id')::uuid
  --    WHERE id = v_lead_id;
  -- END IF;

  -- 5. Anfrage als konvertiert markieren
  UPDATE public.anfragen
     SET lead_id           = v_lead_id,
         konvertiert_am    = now(),
         konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  -- Best-effort Failure-Persistence: in plpgsql ist die EXCEPTION-Block-UPDATE
  -- Teil einer impliziten Subtransaction. Bei RAISE wird die outer-Transaction
  -- abgebrochen, wenn der Caller im autocommit-Modus laeuft (z.B. RPC-Call der
  -- Server-Action) — dann persistiert dieses UPDATE NICHT. In transaktionalen
  -- Caller-Contexts (wo der Caller catched + committed) bleibt es bestehen.
  -- Caller-side-Logging (Server-Action console.error mit anfrage_id) ist die
  -- verlaessliche Failure-Trace.
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$$;


--
-- Name: FUNCTION convert_anfrage_zu_lead(p_anfrage_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid) IS 'Atomic Convert Anfrage -> Lead. Idempotent (re-runs returnen lead_id). source_channel = anfragen.quelle, status = neu (explizit gesetzt seit AAR-1478, vorher NULL bzw. DB-Default). Bei Failure: best-effort konvertier_status=failed (rollt bei autocommit-RPC zurueck). Verlaessliche Failure-Trace: Caller-side-Logging mit anfrage_id.';


--
-- Name: count_unread_updates(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_unread_updates(p_fall_id uuid, p_since timestamp with time zone) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT COALESCE(
    (SELECT count(*)::int FROM tasks
     WHERE fall_id = p_fall_id AND created_at > p_since) +
    (SELECT count(*)::int FROM timeline
     WHERE fall_id = p_fall_id AND created_at > p_since AND typ IN ('system', 'status', 'dokument')) +
    (SELECT count(*)::int FROM fall_dokumente
     WHERE fall_id = p_fall_id AND hochgeladen_am > p_since AND geloescht_am IS NULL),
  0);
$$;


--
-- Name: cron_airdrop_token_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_airdrop_token_cleanup() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM public.airdrop_invitations
   WHERE status = 'abgelaufen'
     AND (
       abgelaufen_am < now() - INTERVAL '30 days'
       OR (abgelaufen_am IS NULL AND expires_at < now() - INTERVAL '30 days')
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_cron_job_run('airdrop_token_cleanup', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('airdrop_token_cleanup', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_airdrop_token_cleanup(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_airdrop_token_cleanup() IS 'AAR-826: Löscht Einladungen die > 30d abgelaufen sind. Täglich 03:00.';


--
-- Name: cron_airdrop_token_expiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_airdrop_token_expiry() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.airdrop_invitations
     SET status       = 'abgelaufen',
         abgelaufen_am = now()
   WHERE status IN ('offen','geoeffnet')
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_cron_job_run(
    'airdrop_token_expiry', 'success', v_count,
    NULL, jsonb_build_object('run_at', now())
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('airdrop_token_expiry', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_airdrop_token_expiry(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_airdrop_token_expiry() IS 'AAR-826: Setzt abgelaufene Einladungen auf status=abgelaufen. Stündlich.';


--
-- Name: cron_dsgvo_hard_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_dsgvo_hard_delete() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE v_count INT := 0;
BEGIN
  -- Stub: nur aktiv wenn dsgvo_delete_requests existiert
  IF to_regclass('public.dsgvo_delete_requests') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.claim_parties cp
         SET vorname    = 'Anonymisiert',
             nachname   = 'Person',
             email      = NULL,
             telefon    = NULL,
             adresse_strasse = NULL,
             adresse_plz     = NULL,
             adresse_ort     = NULL,
             geburtsdatum    = NULL
       WHERE EXISTS (
         SELECT 1 FROM public.dsgvo_delete_requests dr
         WHERE dr.user_id = cp.created_by_user_id
           AND dr.status = 'approved'
           AND dr.approved_at < now() - INTERVAL '30 days'
       )
    $sql$;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  PERFORM public.log_cron_job_run(
    'dsgvo_hard_delete',
    'success',
    v_count,
    NULL,
    jsonb_build_object(
      'note', CASE WHEN v_count > 0
        THEN format('%s claim_parties anonymisiert nach 30d Karenz', v_count)
        ELSE 'Keine pending Delete-Requests oder Tabelle nicht vorhanden'
      END
    )
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_hard_delete', 'error', NULL, SQLERRM);
END $_$;


--
-- Name: FUNCTION cron_dsgvo_hard_delete(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_dsgvo_hard_delete() IS 'AAR-826: DSGVO Hard-Delete nach 30d Karenz. Aktiv sobald dsgvo_delete_requests-Tabelle existiert. Täglich 04:00.';


--
-- Name: cron_gutachten_ocr_recovery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_gutachten_ocr_recovery() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_recovered INT;
BEGIN
  -- 1) Stuck "running" → zurück auf "pending"
  WITH stuck AS (
    SELECT id, ocr_run_id
      FROM public.gutachten
     WHERE ocr_status = 'running'
       AND ocr_started_at < now() - INTERVAL '10 minutes'
  )
  UPDATE public.gutachten g
     SET ocr_status = 'pending'
    FROM stuck
   WHERE g.id = stuck.id;

  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  -- Stuck ocr_runs auf 'superseded' setzen damit klar ist dass sie obsolet sind
  UPDATE public.ocr_runs
     SET status = 'superseded',
         finished_at = now(),
         error_jsonb = jsonb_build_object('reason','stuck_recovery','recovered_at',now())
   WHERE status = 'running'
     AND started_at < now() - INTERVAL '10 minutes';

  PERFORM public.log_cron_job_run('gutachten_ocr_recovery', 'success', v_recovered);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('gutachten_ocr_recovery', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_gutachten_ocr_recovery(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_gutachten_ocr_recovery() IS 'AAR-838: Recovery-Job alle 5 Min. Stuck running→pending nach 10 Min. Edge Function trigger für pending-Rows ist fire-and-forget aus Server-Action — Recovery hier setzt nur Status zurück, Edge-Trigger passiert via separater Logik.';


--
-- Name: cron_kanzlei_paket_pending_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_kanzlei_paket_pending_check() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_count int;
begin
  if to_regclass('public.notification_events') is null then
    perform public.log_cron_job_run('kanzlei_paket_pending_check', 'success', 0, null,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    return;
  end if;

  with pending_claims as (
    select
      c.id              as claim_id,
      c.kanzlei_wunsch,
      vcp.main_phase,
      vcp.sub_phase,
      f.id              as fall_id,
      c.kundenbetreuer_id
      from public.claims c
      join public.faelle f on f.claim_id = c.id
      left join public.v_claim_phase vcp on vcp.claim_id = c.id
     where c.kanzlei_wunsch in ('partnerkanzlei','eigene_kanzlei','nicht_gefragt')
       -- CMM-44 MP-6c: war c.phase IN ('4_gutachten_fertig','5_in_reparatur','6_kommunikation_versicherung')
       and vcp.main_phase = 'regulierung'
       and not exists (
         select 1 from public.kanzlei_pakete kp
          where kp.claim_id = c.id
            and kp.status in ('versendet','bestaetigt')
       )
       and coalesce(
             (select max(transition_at) from public.phase_transitions pt where pt.fall_id = f.id),
             c.created_at
           ) < now() - interval '12 hours'
       and not exists (
         select 1 from public.notification_events ne
          where ne.event_type = 'claim.kanzlei_paket_pending'
            and (ne.payload->>'claim_id')::uuid = c.id
            and ne.created_at > now() - interval '7 days'
       )
  )
  insert into public.notification_events (event_type, payload, fall_id, status)
  select
    'claim.kanzlei_paket_pending',
    jsonb_build_object(
      'claim_id',          pc.claim_id,
      'fall_id',           pc.fall_id,
      'kanzlei_wunsch',    pc.kanzlei_wunsch,
      'main_phase',        pc.main_phase,
      'sub_phase',         pc.sub_phase,
      'kundenbetreuer_id', pc.kundenbetreuer_id
    ),
    pc.fall_id,
    'pending'
  from pending_claims pc;

  get diagnostics v_count = row_count;
  perform public.log_cron_job_run('kanzlei_paket_pending_check', 'success', v_count);
exception when others then
  perform public.log_cron_job_run('kanzlei_paket_pending_check', 'error', null, sqlerrm);
end $$;


--
-- Name: FUNCTION cron_kanzlei_paket_pending_check(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_kanzlei_paket_pending_check() IS 'AAR-844: KB-Notification für Claims in Phase 4+ mit gewünschter Kanzlei aber keinem versendeten Paket. Schließt Auto-Paket-Lücke aus AAR-841. Workaround für fehlendes claims.phase_updated_at: nutzt MAX(phase_transitions.transition_at).';


--
-- Name: cron_konsistenz_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_konsistenz_check() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_findings     JSONB   := '{}'::JSONB;
  v_count_total  INT     := 0;
  v_count        INT;
  v_slack_url    TEXT;
  v_response_id  BIGINT;
BEGIN
  -- Check 1: faelle ohne claim_id
  SELECT count(*) INTO v_count FROM public.faelle WHERE claim_id IS NULL;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('faelle_ohne_claim', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 2: claims ohne vehicle_id
  SELECT count(*) INTO v_count FROM public.claims WHERE vehicle_id IS NULL;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('claims_ohne_vehicle', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 3: gutachten mit claim_id die nicht existiert
  SELECT count(*) INTO v_count
    FROM public.gutachten g
   WHERE NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.id = g.claim_id);
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('gutachten_orphan', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 4: vs_korrespondenz wartet_auf_antwort ohne Frist-Datum
  SELECT count(*) INTO v_count
    FROM public.vs_korrespondenz
   WHERE status = 'wartet_auf_antwort' AND wartet_auf_antwort_bis IS NULL;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('vs_wartet_ohne_frist', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 5: claim_parties mit doppelter Hauptrolle pro claim
  SELECT count(*) INTO v_count
    FROM (
      SELECT claim_id, rolle
        FROM public.claim_parties
       WHERE rolle IN ('geschaedigter','verursacher')
       GROUP BY claim_id, rolle
       HAVING count(*) > 1
    ) doubles;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('claim_parties_doppelt', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 6: repairs mit claim_id die nicht existiert
  SELECT count(*) INTO v_count
    FROM public.repairs r
   WHERE NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.id = r.claim_id);
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('repairs_orphan', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Slack-Alert wenn Findings
  IF v_count_total > 0 THEN
    -- Slack-Webhook aus settings holen (falls Tabelle existiert)
    IF to_regclass('public.settings') IS NOT NULL THEN
      EXECUTE $sql$
        SELECT value FROM public.settings WHERE key = 'slack_konsistenz_webhook'
      $sql$ INTO v_slack_url;
    END IF;

    IF v_slack_url IS NOT NULL THEN
      SELECT net.http_post(
        url     := v_slack_url,
        headers := '{"Content-Type": "application/json"}'::JSONB,
        body    := jsonb_build_object(
          'text', format(
            ':warning: *Claimondo Konsistenz-Check* — %s Issues gefunden%s```%s```',
            v_count_total,
            chr(10),
            v_findings::TEXT
          )
        )::TEXT
      ) INTO v_response_id;
    END IF;
  END IF;

  PERFORM public.log_cron_job_run(
    'konsistenz_check', 'success', v_count_total, NULL, v_findings
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('konsistenz_check', 'error', NULL, SQLERRM);
END $_$;


--
-- Name: FUNCTION cron_konsistenz_check(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_konsistenz_check() IS 'AAR-826: Tägliche Konsistenz-Prüfung (faelle/claims/gutachten/vs_korrespondenz). Slack-Alert via pg_net wenn Findings. Ergebnis in cron_jobs_audit.metadata_jsonb.';


--
-- Name: cron_mark_durchgefuehrt_fallback(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_mark_durchgefuehrt_fallback() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public.gutachter_termine
  SET durchgefuehrt_am = NOW()
  WHERE durchgefuehrt_am IS NULL
    AND sv_angekommen_am IS NOT NULL
    AND end_zeit < NOW() - INTERVAL '30 minutes'
    AND typ = 'sv_begutachtung';
END;
$$;


--
-- Name: FUNCTION cron_mark_durchgefuehrt_fallback(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_mark_durchgefuehrt_fallback() IS 'CMM-32: Cron-Fallback wenn Geofence-Out via App nicht greift (App geschlossen). End-Zeit + 30 min Puffer.';


--
-- Name: cron_mietwagen_lange_anmietung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_mietwagen_lange_anmietung() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('mietwagen_lange_anmietung', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH lange_anmietungen AS (
    SELECT cm.id, cm.claim_id, cm.beginn_datum,
           EXTRACT(DAY FROM (now() - cm.beginn_datum::TIMESTAMPTZ))::INTEGER AS tage
      FROM public.claim_mietwagen cm
     WHERE cm.status IN ('aktiv','beendet')
       AND cm.rechnung_url IS NULL
       AND cm.beginn_datum IS NOT NULL
       AND cm.beginn_datum::TIMESTAMPTZ < now() - INTERVAL '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'mietwagen.lange_anmietung'
           AND (ne.payload->>'mietwagen_id')::UUID = cm.id
           AND ne.created_at > now() - INTERVAL '7 days'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'mietwagen.lange_anmietung',
    jsonb_build_object(
      'mietwagen_id', la.id,
      'claim_id',     la.claim_id,
      'tage',         la.tage,
      'message',      format('Mietwagen seit %s Tagen ohne Rechnung — Status prüfen', la.tage)
    ),
    'pending'
  FROM lange_anmietungen la;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('mietwagen_lange_anmietung', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('mietwagen_lange_anmietung', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_mietwagen_lange_anmietung(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_mietwagen_lange_anmietung() IS 'AAR-826: Aktive Anmietung > 30d ohne Rechnung → KB-Notification. Täglich 09:20.';


--
-- Name: cron_mietwagen_sla_tracking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_mietwagen_sla_tracking() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('mietwagen_sla_tracking', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH sla_verstossen AS (
    SELECT cm.id, cm.claim_id,
           EXTRACT(DAY FROM (now() - cm.beginn_datum::TIMESTAMPTZ))::INTEGER AS tage_bisher
      FROM public.claim_mietwagen cm
     WHERE cm.status = 'aktiv'
       AND cm.beginn_datum IS NOT NULL
       AND cm.erstattbar_max_tage IS NOT NULL
       AND EXTRACT(DAY FROM (now() - cm.beginn_datum::TIMESTAMPTZ))::INTEGER > cm.erstattbar_max_tage
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'mietwagen.sla_verstossen'
           AND (ne.payload->>'mietwagen_id')::UUID = cm.id
           AND ne.created_at > now() - INTERVAL '24 hours'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'mietwagen.sla_verstossen',
    jsonb_build_object(
      'mietwagen_id', sv.id,
      'claim_id',     sv.claim_id,
      'tage_bisher',  sv.tage_bisher
    ),
    'pending'
  FROM sla_verstossen sv;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('mietwagen_sla_tracking', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('mietwagen_sla_tracking', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_mietwagen_sla_tracking(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_mietwagen_sla_tracking() IS 'AAR-826: Mietwagen aktiv + dauer > erstattbar_max_tage → SLA-Notification. Täglich 09:15.';


--
-- Name: cron_pflicht_foto_validation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_pflicht_foto_validation() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('pflicht_foto_validation', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH unvollstaendig AS (
    SELECT g.id AS gutachten_id, g.claim_id
      FROM public.gutachten g
     WHERE g.created_at < now() - INTERVAL '24 hours'
       AND g.status NOT IN ('storniert','final')
       AND NOT EXISTS (
         SELECT 1 FROM public.gutachten_fotos gf
         WHERE gf.gutachten_id = g.id AND gf.kategorie = 'uebersicht'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'gutachten.pflicht_fotos_unvollstaendig',
    jsonb_build_object('gutachten_id', u.gutachten_id, 'claim_id', u.claim_id),
    'pending'
  FROM unvollstaendig u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notification_events ne
    WHERE ne.event_type = 'gutachten.pflicht_fotos_unvollstaendig'
      AND (ne.payload->>'gutachten_id')::UUID = u.gutachten_id
      AND ne.created_at > now() - INTERVAL '12 hours'
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('pflicht_foto_validation', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('pflicht_foto_validation', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_pflicht_foto_validation(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_pflicht_foto_validation() IS 'AAR-826: Gutachten ohne Pflicht-Foto uebersicht > 24h → notification. Stündlich.';


--
-- Name: cron_rate_limit_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_rate_limit_reset() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.log_cron_job_run(
    'rate_limit_reset', 'success', 0, NULL,
    jsonb_build_object('note', 'Rate-Limits sind query-basiert — kein Tabellen-Cleanup nötig')
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('rate_limit_reset', 'error', NULL, SQLERRM);
END $$;


--
-- Name: cron_trigger_exif_worker(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_trigger_exif_worker() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_url         TEXT;
  v_pending     INT;
  v_response_id BIGINT;
BEGIN
  SELECT count(*) INTO v_pending
    FROM public.gutachten_fotos
   WHERE exif_processed = FALSE;

  -- Kein Trigger wenn keine pending Fotos
  IF v_pending = 0 THEN
    PERFORM public.log_cron_job_run('exif_worker_trigger', 'success', 0);
    RETURN;
  END IF;

  -- URL aus settings laden
  IF to_regclass('public.settings') IS NOT NULL THEN
    EXECUTE $sql$ SELECT value FROM public.settings WHERE key = 'edge_fn_exif_worker_url' $sql$
    INTO v_url;
  END IF;

  IF v_url IS NULL THEN
    PERFORM public.log_cron_job_run(
      'exif_worker_trigger', 'error', v_pending,
      'edge_fn_exif_worker_url nicht in settings konfiguriert'
    );
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-source',     'pg_cron'
    ),
    body    := jsonb_build_object('pending', v_pending)::TEXT
  ) INTO v_response_id;

  PERFORM public.log_cron_job_run(
    'exif_worker_trigger', 'success', v_pending, NULL,
    jsonb_build_object('response_id', v_response_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('exif_worker_trigger', 'error', NULL, SQLERRM);
END $_$;


--
-- Name: FUNCTION cron_trigger_exif_worker(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_trigger_exif_worker() IS 'AAR-826: Triggert Edge Function exif-worker wenn pending gutachten_fotos vorhanden. Alle 5min.';


--
-- Name: cron_trigger_salesforce_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_trigger_salesforce_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_url         TEXT;
  v_pending     INT;
  v_response_id BIGINT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('salesforce_sync_trigger', 'success', 0);
    RETURN;
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.notification_events
   WHERE event_type = 'vs_korrespondenz.salesforce_sync_pending'
     AND status = 'pending';

  IF v_pending = 0 THEN
    PERFORM public.log_cron_job_run('salesforce_sync_trigger', 'success', 0);
    RETURN;
  END IF;

  IF to_regclass('public.settings') IS NOT NULL THEN
    EXECUTE $sql$ SELECT value FROM public.settings WHERE key = 'edge_fn_salesforce_sync_url' $sql$
    INTO v_url;
  END IF;

  IF v_url IS NOT NULL THEN
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-source', 'pg_cron'),
      body    := jsonb_build_object('pending_count', v_pending)::TEXT
    ) INTO v_response_id;
  END IF;

  PERFORM public.log_cron_job_run(
    'salesforce_sync_trigger', 'success', v_pending, NULL,
    jsonb_build_object('response_id', v_response_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('salesforce_sync_trigger', 'error', NULL, SQLERRM);
END $_$;


--
-- Name: FUNCTION cron_trigger_salesforce_sync(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_trigger_salesforce_sync() IS 'AAR-826: Triggert Edge Function salesforce-sync bei pending notification_events. Alle 15min.';


--
-- Name: cron_verjaehrungs_warner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_verjaehrungs_warner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('verjaehrungs_warner', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH bald_verjaehrt AS (
    SELECT c.id, c.verjaehrt_am, c.vehicle_id,
           EXTRACT(DAY FROM (c.verjaehrt_am::TIMESTAMPTZ - now()))::INTEGER AS tage_bis_verjaehrt
      FROM public.claims c
     WHERE c.status NOT IN ('reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')
       AND c.verjaehrt_am IS NOT NULL
       AND c.verjaehrt_am::TIMESTAMPTZ BETWEEN now() AND now() + INTERVAL '90 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'claim.verjaehrung_naht'
           AND (ne.payload->>'claim_id')::UUID = c.id
           AND ne.created_at > now() - INTERVAL '7 days'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'claim.verjaehrung_naht',
    jsonb_build_object(
      'claim_id',            bv.id,
      'vehicle_id',          bv.vehicle_id,
      'verjaehrt_am',        bv.verjaehrt_am,
      'tage_bis_verjaehrt',  bv.tage_bis_verjaehrt
    ),
    'pending'
  FROM bald_verjaehrt bv;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('verjaehrungs_warner', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('verjaehrungs_warner', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_verjaehrungs_warner(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_verjaehrungs_warner() IS 'AAR-826/AAR-839: Cron warnt 90 Tage vor verjaehrt_am via notification_events. Filter auf neuen Endzustand-Set (reguliert/abgelehnt/an_externe_kanzlei_uebergeben/storniert).';


--
-- Name: cron_vs_frist_reminder(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_vs_frist_reminder() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run(
      'vs_frist_reminder', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events-Tabelle nicht gefunden — NoOp')
    );
    RETURN;
  END IF;

  WITH faellige AS (
    SELECT vk.id, vk.claim_id, vk.typ, vk.wartet_auf_antwort_bis,
           EXTRACT(DAY FROM (vk.wartet_auf_antwort_bis - now()))::INTEGER AS tage_bis_frist
      FROM public.vs_korrespondenz vk
     WHERE vk.status = 'wartet_auf_antwort'
       AND vk.wartet_auf_antwort_bis BETWEEN now() AND now() + INTERVAL '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'vs_korrespondenz.frist_in_3_tagen'
           AND (ne.payload->>'korrespondenz_id')::UUID = vk.id
           AND ne.created_at > now() - INTERVAL '24 hours'
       )
  )
  INSERT INTO public.notification_events (event_type, fall_id, payload, status)
  SELECT
    'vs_korrespondenz.frist_in_3_tagen',
    (SELECT f.id FROM public.faelle f
      JOIN public.claims c ON c.id = faellige.claim_id
      WHERE f.claim_id = faellige.claim_id LIMIT 1),
    jsonb_build_object(
      'korrespondenz_id', faellige.id,
      'claim_id', faellige.claim_id,
      'typ', faellige.typ,
      'frist_bis', faellige.wartet_auf_antwort_bis,
      'tage_bis_frist', faellige.tage_bis_frist
    ),
    'pending'
  FROM faellige;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('vs_frist_reminder', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('vs_frist_reminder', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_vs_frist_reminder(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_vs_frist_reminder() IS 'AAR-826: 3-Tage-Frist-Reminder an KB via notification_events. Täglich 09:00.';


--
-- Name: cron_vs_frist_tick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_vs_frist_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.vs_korrespondenz
     SET status = 'ohne_antwort_abgelaufen'
   WHERE status = 'wartet_auf_antwort'
     AND wartet_auf_antwort_bis IS NOT NULL
     AND wartet_auf_antwort_bis < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_cron_job_run('vs_frist_tick', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('vs_frist_tick', 'error', NULL, SQLERRM);
END $$;


--
-- Name: FUNCTION cron_vs_frist_tick(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cron_vs_frist_tick() IS 'AAR-826: wartet_auf_antwort + Frist abgelaufen → ohne_antwort_abgelaufen. Alle 6h.';


--
-- Name: delete_fall_komplett(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_fall_komplett(p_fall_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_fall_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: fall_id ist NULL';
  END IF;

  SELECT COUNT(*) INTO v_count FROM faelle WHERE id = p_fall_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ABBRUCH: Fall % nicht gefunden', p_fall_id;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ABBRUCH: Mehrere Faelle gefunden fuer %', p_fall_id;
  END IF;

  BEGIN DELETE FROM lead_historie WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM pflichtdokumente WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM qc_checkliste WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM forderungspositionen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM zahlungseingaenge WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM technische_probleme WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_abrechnungspositionen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_abrechnungen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_termine WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_mitteilungen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM benachrichtigungen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM timeline WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM tasks WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM nachrichten WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM dokumente WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM termine WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM flow_links WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  DELETE FROM faelle WHERE id = p_fall_id;
END;
$$;


--
-- Name: delete_gutachter_komplett(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_gutachter_komplett(p_sv_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_count INTEGER;
  v_user_id UUID;
  v_profile_id UUID;
BEGIN
  -- SICHERHEITS-CHECK
  IF p_sv_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: sv_id ist NULL';
  END IF;

  SELECT COUNT(*) INTO v_count FROM sachverstaendige WHERE id = p_sv_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'ABBRUCH: Gutachter nicht gefunden'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'ABBRUCH: Mehrere Gutachter gefunden'; END IF;

  SELECT user_id, profile_id INTO v_user_id, v_profile_id FROM sachverstaendige WHERE id = p_sv_id;

  -- Fälle freigeben (sv_id = NULL)
  BEGIN UPDATE faelle SET sv_id = NULL WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- FK-Tabellen löschen
  BEGIN DELETE FROM gutachter_abrechnungen WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_termine WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_mitteilungen WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Sachverständiger löschen
  DELETE FROM sachverstaendige WHERE id = p_sv_id;

  -- Profil löschen
  IF v_profile_id IS NOT NULL THEN
    BEGIN DELETE FROM benachrichtigungen WHERE user_id = v_profile_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM profiles WHERE id = v_profile_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Auth-User löschen
  IF v_user_id IS NOT NULL THEN
    BEGIN DELETE FROM auth.sessions WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.identities WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.mfa_factors WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.users WHERE id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END;
$$;


--
-- Name: delete_lead_komplett(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_lead_komplett(p_lead_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_count INTEGER;
  v_fall RECORD;
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: lead_id ist NULL';
  END IF;

  SELECT COUNT(*) INTO v_count FROM leads WHERE id = p_lead_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ABBRUCH: Lead % nicht gefunden', p_lead_id;
  END IF;

  FOR v_fall IN SELECT id FROM faelle WHERE lead_id = p_lead_id LOOP
    PERFORM delete_fall_komplett(v_fall.id);
  END LOOP;

  BEGIN DELETE FROM flow_links WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM lead_historie WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM timeline WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_termine WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  DELETE FROM leads WHERE id = p_lead_id;
END;
$$;


--
-- Name: dispatcher_owns_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatcher_owns_lead(p_lead_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads
    WHERE id = p_lead_id
      AND konvertiert_durch_user_id = auth.uid()
  )
$$;


--
-- Name: dokument_katalog_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dokument_katalog_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: dsgvo_anonymize_user_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_anon_email text := 'deleted-' || p_user_id::text || '@deleted.invalid';
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- profiles
  UPDATE public.profiles
     SET vorname = NULL, nachname = NULL,
         anzeigename = 'Anonymisiert', email = v_anon_email,
         telefon = NULL, avatar_url = NULL, profilbeschreibung = NULL
   WHERE id = p_user_id;

  -- claims (Kunden-Snapshot in der SSoT)
  UPDATE public.claims c
     SET kunde_vorname = 'Anonymisiert', kunde_nachname = NULL,
         kunde_email = v_anon_email, kunde_telefon = NULL,
         kunde_strasse = NULL, kunde_plz = NULL, kunde_stadt = NULL
   WHERE c.kunde_id = p_user_id
      OR c.id IN (SELECT claim_id FROM public.faelle WHERE kunde_id = p_user_id);

  -- faelle (Snapshot; kunde_email per CMM-44 SP-A entfernt -> claims ist SSoT)
  UPDATE public.faelle
     SET kunde_vorname = 'Anonymisiert', kunde_nachname = NULL,
         kunde_telefon = NULL,
         kunde_strasse = NULL, kunde_plz = NULL, kunde_stadt = NULL
   WHERE kunde_id = p_user_id;

  -- leads
  UPDATE public.leads
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         schadens_hergang = '[Anonymisiert nach DSGVO Art. 17]'
   WHERE kunde_id = p_user_id OR email = v_user_email;

  -- gutachter_finder_anfragen (Self-Dispatch)
  UPDATE public.gutachter_finder_anfragen
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         halter_vorname = NULL, halter_nachname = NULL,
         halter_strasse = NULL, halter_plz = NULL, halter_stadt = NULL,
         sa_signatur_data_url = NULL, ocr_rohdaten = NULL
   WHERE konvertiert_zu_user_id = p_user_id OR email = v_user_email;

  -- airdrop_invitations (aus AAR-826 erweitert)
  UPDATE public.airdrop_invitations
     SET empfaenger_name = 'Anonymisiert',
         empfaenger_email = NULL, empfaenger_telefon = NULL
   WHERE invited_by = p_user_id;

  -- claim_parties (Geschaedigter/Verursacher-Stammdaten)
  UPDATE public.claim_parties cp
     SET vorname = 'Anonymisiert', nachname = 'Person',
         email = NULL, telefon = NULL,
         adresse_strasse = NULL, adresse_plz = NULL,
         adresse_ort = NULL, geburtsdatum = NULL
   WHERE cp.created_by_user_id = p_user_id
      OR cp.fall_id IN (SELECT id FROM public.faelle WHERE kunde_id = p_user_id);

  PERFORM public.log_cron_job_run(
    'dsgvo_anonymize', 'success', NULL, NULL,
    jsonb_build_object('user_id', p_user_id, 'timestamp', now())
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_anonymize', 'error', NULL, SQLERRM);
  RAISE;
END $$;


--
-- Name: FUNCTION dsgvo_anonymize_user_data(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid) IS 'DSGVO Art. 17 Anonymisierung. Wirkt auf profiles, claims, faelle, leads, gutachter_finder_anfragen, airdrop_invitations, claim_parties.';


--
-- Name: expire_geblockte_termine_ohne_sa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_geblockte_termine_ohne_sa() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.gutachter_termine
       SET status = 'storniert',
           updated_at = now()
     WHERE status = 'reserviert'
       AND fall_id IS NULL
       AND created_at < now() - interval '1 hour'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION expire_geblockte_termine_ohne_sa(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.expire_geblockte_termine_ohne_sa() IS 'CMM-25: Storniert vom Dispatcher geblockte Termine, die nach 1h noch keine SA-Unterschrift erhalten haben (fall_id IS NULL).';


--
-- Name: fall_validate_kb_rolle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fall_validate_kb_rolle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  kb_rolle text;
BEGIN
  IF NEW.kundenbetreuer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rolle INTO kb_rolle
  FROM public.profiles
  WHERE id = NEW.kundenbetreuer_id;

  IF kb_rolle IS NULL THEN
    RAISE EXCEPTION
      'kundenbetreuer_id %: profiles-Eintrag nicht gefunden',
      NEW.kundenbetreuer_id;
  END IF;

  IF kb_rolle NOT IN ('kundenbetreuer', 'admin') THEN
    RAISE EXCEPTION
      'kundenbetreuer_id % hat unzulaessige Rolle "%". Erlaubt: kundenbetreuer, admin',
      NEW.kundenbetreuer_id, kb_rolle;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION fall_validate_kb_rolle(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fall_validate_kb_rolle() IS 'Verhindert dass faelle.kundenbetreuer_id auf einen Dispatcher zeigt. Erlaubt nur Rolle kundenbetreuer oder admin.';


--
-- Name: get_sv_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sv_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM sachverstaendige
  WHERE profile_id = auth.uid()
  ORDER BY ist_parent_account ASC NULLS LAST
  LIMIT 1;
$$;


--
-- Name: get_user_rolle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_rolle() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT rolle::text FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;


--
-- Name: guard_claims_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_claims_created_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      -- Kundenbetreuer-Insert: created_by auf eigene auth.uid() zwingen
      NEW.created_by_user_id := (SELECT auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen claims.created_by_user_id ändern (versucht an claims.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_claims_created_by(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_claims_created_by() IS 'AAR-919 — Audit-Spoofing-Lock: created_by_user_id darf nur von Admins/service_role auf fremde UUID gesetzt werden. KB-INSERT defaultet auf auth.uid().';


--
-- Name: guard_makler_privilegien(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_makler_privilegien() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.status := 'pending';
      NEW.provision_betrag_komplett_netto := 0;
      NEW.provision_betrag_nur_gutachter_netto := 0;
      NEW.provision_aktiv := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provision_betrag_komplett_netto IS DISTINCT FROM OLD.provision_betrag_komplett_netto
    OR NEW.provision_betrag_nur_gutachter_netto IS DISTINCT FROM OLD.provision_betrag_nur_gutachter_netto
    OR NEW.provision_aktiv IS DISTINCT FROM OLD.provision_aktiv
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen Provisions-/Status-/user_id-Felder ändern (versucht an makler.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_makler_privilegien(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_makler_privilegien() IS 'AAR-893/AAR-913 — Self-Update auf Provisions-/Status-/user_id-Felder blocken';


--
-- Name: guard_profiles_rolle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_profiles_rolle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged AND NEW.rolle IS DISTINCT FROM 'kunde'::public.user_role THEN
      NEW.rolle := 'kunde'::public.user_role;
    END IF;
    -- Neue Selbst-Anlegen-Defaults: Premium-Paket + aktiv-Flag dürfen nicht via INSERT gesetzt werden
    IF NOT privileged THEN
      NEW.sv_paket := NULL;
      NEW.aktiv := true;  -- Default aus Schema, aber explizit setzen für Klarheit
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NOT privileged AND (
       NEW.rolle IS DISTINCT FROM OLD.rolle
    OR NEW.sv_paket IS DISTINCT FROM OLD.sv_paket
    OR NEW.aktiv IS DISTINCT FROM OLD.aktiv
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen rolle/sv_paket/aktiv ändern (versucht an profiles.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_profiles_rolle(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_profiles_rolle() IS 'AAR-893/AAR-913 — Self-Update-Eskalation auf rolle/sv_paket/aktiv blocken';


--
-- Name: guard_sachverstaendige_privilegien(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_sachverstaendige_privilegien() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.verifiziert := false;
      NEW.werbebudget_guthaben_netto := 0;
      NEW.ist_aktiv := false;
      NEW.use_custom_branding := false;
      -- Paket-Defaults: keine Selbst-Bedienung
      NEW.paket := NULL;
      NEW.paket_faelle_gesamt := 0;
      NEW.paket_preis := 0;
      NEW.paket_umkreis_km := 0;
      -- Sperr-Status + Verifizierung kommt nur via Admin-Pfad
      NEW.gesperrt_grund := NULL;
      NEW.gesperrt_seit := NULL;
      NEW.verifizierung_status := 'pending';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND (
       NEW.verifiziert IS DISTINCT FROM OLD.verifiziert
    OR NEW.werbebudget_guthaben_netto IS DISTINCT FROM OLD.werbebudget_guthaben_netto
    OR NEW.ist_aktiv IS DISTINCT FROM OLD.ist_aktiv
    OR NEW.use_custom_branding IS DISTINCT FROM OLD.use_custom_branding
    OR NEW.paket IS DISTINCT FROM OLD.paket
    OR NEW.paket_faelle_gesamt IS DISTINCT FROM OLD.paket_faelle_gesamt
    OR NEW.paket_preis IS DISTINCT FROM OLD.paket_preis
    OR NEW.paket_umkreis_km IS DISTINCT FROM OLD.paket_umkreis_km
    OR NEW.gesperrt_grund IS DISTINCT FROM OLD.gesperrt_grund
    OR NEW.gesperrt_seit IS DISTINCT FROM OLD.gesperrt_seit
    OR NEW.verifizierung_status IS DISTINCT FROM OLD.verifizierung_status
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen Verifizierungs-/Paket-/Sperr-Felder ändern (versucht an sachverstaendige.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_sachverstaendige_privilegien(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_sachverstaendige_privilegien() IS 'AAR-893/AAR-913 — Self-Update auf Verifizierungs-/Paket-/Sperr-Felder blocken';


--
-- Name: gutachter_waitlist_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gutachter_waitlist_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.zuletzt_geaendert_am = now();
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  INSERT INTO profiles (id, email, rolle)
  VALUES (NEW.id, NEW.email, 'kunde');
  RETURN NEW;
END;
$$;


--
-- Name: haversine_km(numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select 6371.0 * 2 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) *
    sin(radians(lng2 - lng1) / 2) ^ 2
  ))
$$;


--
-- Name: FUNCTION haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) IS 'Entfernung zwischen zwei Geopunkten in Kilometern (Haversine)';


--
-- Name: increment_offene_faelle(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_offene_faelle(sv_id_param uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  update public.sachverstaendige
  set offene_faelle = offene_faelle + 1,
      updated_at = now()
  where id = sv_id_param;
$$;


--
-- Name: invalidate_whatsapp_cache_on_phone_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invalidate_whatsapp_cache_on_phone_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.telefon IS DISTINCT FROM OLD.telefon THEN
    NEW.whatsapp_verfuegbar := NULL;
    NEW.whatsapp_geprueft_am := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'admin'::user_role
  );
$$;


--
-- Name: is_claim_user_party(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_claim_user_party(p_claim_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM claim_parties cp
    WHERE cp.claim_id = p_claim_id
      AND cp.user_id = auth.uid()
      AND cp.ist_aktiv = true
  )
$$;


--
-- Name: FUNCTION is_claim_user_party(p_claim_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_claim_user_party(p_claim_id uuid) IS 'CMM-19: SECURITY DEFINER bypass für claim_parties-Policy-Recursion.';


--
-- Name: is_dispatcher(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_dispatcher() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'dispatch'::user_role
  )
$$;


--
-- Name: is_kanzlei(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_kanzlei() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'kanzlei'
  );
$$;


--
-- Name: FUNCTION is_kanzlei(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_kanzlei() IS 'Returns true if current user has the kanzlei role. Wird in Policies fuer Kanzlei-spezifischen Zugriff verwendet.';


--
-- Name: is_kundenbetreuer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_kundenbetreuer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'kundenbetreuer'::user_role
  )
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND rolle IN ('admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role)
  );
$$;


--
-- Name: FUNCTION is_staff(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_staff() IS 'CMM-23 + 2026-05-14: leadbearbeiter-Branch entfernt; EXECUTE fuer authenticated explizit gegranted.';


--
-- Name: is_sv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_sv() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'sachverstaendiger'
  );
$$;


--
-- Name: is_sv_for_claim(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_sv_for_claim(p_claim_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM claims c
    JOIN sachverstaendige sv ON sv.id = c.sv_id
    WHERE c.id = p_claim_id
      AND sv.profile_id = auth.uid()
  )
$$;


--
-- Name: kanzlei_faelle_sync_claim_fall(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kanzlei_faelle_sync_claim_fall() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- Wenn nur fall_id gesetzt: claim_id daraus ableiten.
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id FROM public.faelle WHERE id = NEW.fall_id;
  END IF;
  -- Wenn nur claim_id gesetzt: fall_id daraus ableiten (gewinnt der
  -- erste passende Fall — bei 1:1 eindeutig).
  IF NEW.fall_id IS NULL AND NEW.claim_id IS NOT NULL THEN
    SELECT id INTO NEW.fall_id FROM public.faelle WHERE claim_id = NEW.claim_id LIMIT 1;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: link_lead_data_to_fall(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  cnt_calls INTEGER := 0;
  cnt_tasks INTEGER := 0;
  cnt_emails INTEGER := 0;
  cnt_termine INTEGER := 0;
  cnt_nachrichten INTEGER := 0;
  cnt_nachrichten_prov INTEGER := 0;
  cnt_dokumente INTEGER := 0;
BEGIN
  -- Calls: fall_id setzen wo noch NULL (Lead-Phase Calls → Fall zuordnen)
  UPDATE calls SET fall_id = p_fall_id, updated_at = now()
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_calls = ROW_COUNT;

  -- Tasks: fall_id setzen wo noch NULL
  UPDATE tasks SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_tasks = ROW_COUNT;

  -- Email-Log: lead_id auf bestehende fall-emails setzen (Provenance)
  UPDATE email_log SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_emails = ROW_COUNT;

  -- Gutachter-Termine: fall_id setzen wo noch NULL
  UPDATE gutachter_termine SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_termine = ROW_COUNT;

  -- Nachrichten: Lead-Phase → Fall zuordnen
  UPDATE nachrichten SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_nachrichten = ROW_COUNT;

  -- Nachrichten: Fall-Nachrichten → Lead-Provenance setzen
  UPDATE nachrichten SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_nachrichten_prov = ROW_COUNT;

  -- Fall-Dokumente: lead_id für Provenance setzen
  UPDATE fall_dokumente SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_dokumente = ROW_COUNT;

  RETURN jsonb_build_object(
    'calls', cnt_calls,
    'tasks', cnt_tasks,
    'emails', cnt_emails,
    'termine', cnt_termine,
    'nachrichten', cnt_nachrichten + cnt_nachrichten_prov,
    'dokumente', cnt_dokumente
  );
END;
$$;


--
-- Name: log_cron_job_run(text, text, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_cron_job_run(p_job_name text, p_status text DEFAULT 'success'::text, p_rows integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.cron_jobs_audit (
    job_name, started_at, ended_at, status,
    rows_processed, error_message, metadata_jsonb, duration_ms
  )
  VALUES (
    p_job_name, now(), now(), p_status,
    p_rows, p_error, p_metadata, 0
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


--
-- Name: FUNCTION log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb) IS 'AAR-826: Einheitliches Audit-Logging für alle Cron-Jobs. SECURITY DEFINER damit pg_cron-Jobs ohne RLS schreiben können.';


--
-- Name: log_lead_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_lead_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  col text;
  old_val text;
  new_val text;
  skip_cols text[] := ARRAY['id', 'created_at', 'updated_at'];
  changed_by uuid;
BEGIN
  BEGIN
    changed_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    changed_by := NULL;
  END;
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'leads' AND table_schema = 'public'
    AND column_name != ALL(skip_cols)
  LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
      INTO old_val, new_val
      USING OLD, NEW;
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO lead_historie (lead_id, feld, alter_wert, neuer_wert, geaendert_von)
      VALUES (NEW.id, col, old_val, new_val, changed_by);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$_$;


--
-- Name: log_phase_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_phase_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF (OLD.aktuelle_phase IS DISTINCT FROM NEW.aktuelle_phase) THEN
    -- Skip: wenn neue Phase NULL ist, ist das ein Reset — nicht loggen
    -- (faelle.aktuelle_phase=NULL bedeutet 'noch keine Phase zugewiesen')
    IF NEW.aktuelle_phase IS NULL THEN
      RETURN NEW;
    END IF;

    -- Dedup: wenn Helper bereits inserted hat in den letzten 2s, skip
    IF NOT EXISTS (
      SELECT 1 FROM public.phase_transitions 
      WHERE fall_id = NEW.id 
        AND to_phase = NEW.aktuelle_phase
        AND transition_at > NOW() - INTERVAL '2 seconds'
    ) THEN
      INSERT INTO public.phase_transitions (
        fall_id, from_phase, to_phase, 
        transition_at, trigger_type, actor_rolle
      ) VALUES (
        NEW.id, OLD.aktuelle_phase, NEW.aktuelle_phase,
        NOW(), 'auto', 'system'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION log_phase_transition(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_phase_transition() IS 'AAR-571: Triggert bei UPDATE auf faelle.aktuelle_phase → log in phase_transitions. 
   Skip bei NULL (Reset). Dedupliziert wenn Helper bereits inserted hat (2s-Window).';


--
-- Name: mark_expired_leads(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_expired_leads() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE leads
  SET
    status                    = 'disqualifiziert',
    disqualifiziert           = true,
    disqualifiziert_grund     = 'Timeout nach 7 Tagen ohne Konvertierung',
    disqualifiziert_grund_key = 'timeout',
    updated_at                = now()
  WHERE
    status          = 'neu'
    AND disqualifiziert = false
    AND created_at  < now() - INTERVAL '7 days';
END;
$$;


--
-- Name: FUNCTION mark_expired_leads(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_expired_leads() IS 'AAR-477 C11: Disqualifiziert Leads > 7 Tage ohne Fall';


--
-- Name: next_rechnungs_nr(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_rechnungs_nr(p_serie text, p_jahr integer) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_nr INTEGER;
BEGIN
  INSERT INTO rechnungs_nr_counter (serie, jahr, laufende_nr, updated_at)
  VALUES (p_serie, p_jahr, 1, now())
  ON CONFLICT (serie, jahr)
  DO UPDATE SET
    laufende_nr = rechnungs_nr_counter.laufende_nr + 1,
    updated_at = now()
  RETURNING laufende_nr INTO v_nr;
  RETURN v_nr;
END;
$$;


--
-- Name: FUNCTION next_rechnungs_nr(p_serie text, p_jahr integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.next_rechnungs_nr(p_serie text, p_jahr integer) IS 'AAR-416: Atomarer Counter-Increment für fortlaufende Rechnungs-Nr. pro (Serie, Jahr).';


--
-- Name: notify_admins(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_admins(p_titel text, p_nachricht text DEFAULT NULL::text, p_link text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.benachrichtigungen (user_id, titel, nachricht, link)
  select p.id, p_titel, p_nachricht, p_link
  from public.profiles p
  where p.rolle = 'admin';
end;
$$;


--
-- Name: personenschaden_personen_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.personenschaden_personen_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: safe_to_date(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.safe_to_date(p_text text) RETURNS date
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE v date;
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN RETURN NULL; END IF;
  -- ISO YYYY-MM-DD oder YYYY-MM-DDTHH:MM:SS
  IF p_text ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN v := substring(p_text, 1, 10)::date; RETURN v;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  -- DD.MM.YYYY
  IF p_text ~ '^\d{1,2}\.\d{1,2}\.\d{4}' THEN
    BEGIN v := to_date(substring(p_text, 1, 10), 'DD.MM.YYYY'); RETURN v;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  -- MM.YYYY (z.B. Cardentity "10.2019")
  IF p_text ~ '^\d{1,2}\.\d{4}$' THEN
    BEGIN v := to_date('01.' || p_text, 'DD.MM.YYYY'); RETURN v;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN NULL;
END $_$;


--
-- Name: FUNCTION safe_to_date(p_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.safe_to_date(p_text text) IS 'AAR-773: parsed unterschiedliche Date-Strings sicher ohne Exception';


--
-- Name: safe_to_time(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.safe_to_time(p_text text) RETURNS time without time zone
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE v time;
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN RETURN NULL; END IF;

  -- HH:MM oder HH:MM:SS
  IF p_text ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
    BEGIN v := p_text::time; RETURN v;
    EXCEPTION WHEN others THEN RETURN NULL; END;
  END IF;

  -- HH.MM (Punkt statt Doppelpunkt)
  IF p_text ~ '^\d{1,2}\.\d{2}$' THEN
    BEGIN v := replace(p_text, '.', ':')::time; RETURN v;
    EXCEPTION WHEN others THEN RETURN NULL; END;
  END IF;

  RETURN NULL;
END $_$;


--
-- Name: FUNCTION safe_to_time(p_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.safe_to_time(p_text text) IS 'AAR-810 A.1: parsed unterschiedliche Time-Strings sicher ohne Exception. Akzeptiert HH:MM, HH:MM:SS, HH.MM.';


--
-- Name: set_airdrop_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_airdrop_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_claim_mietwagen_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_claim_mietwagen_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_claim_nummer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_claim_nummer() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.claim_nummer IS NULL THEN
    NEW.claim_nummer := 'CLM-'
      || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('claims_claim_nummer_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_claim_parties_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_claim_parties_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_claim_payments_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_claim_payments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_claims_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_claims_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_claims_verjaehrung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_claims_verjaehrung() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.verjaehrt_am IS NULL AND NEW.schadenart = 'haftpflicht' THEN
    NEW.verjaehrt_am := NEW.schadentag + INTERVAL '3 years';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_gutachten_positionen_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gutachten_positionen_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_gutachten_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gutachten_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_kanzlei_pakete_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_kanzlei_pakete_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_laeufer_report_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_laeufer_report_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_lead_nummer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_lead_nummer() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.lead_nummer IS NULL THEN
    NEW.lead_nummer := 'LEAD-'
      || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('leads_lead_nummer_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_repairs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_repairs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_sv_buero_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sv_buero_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_sv_org_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sv_org_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_updated_at_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_now() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_vehicle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_vehicle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_werkstaetten_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_werkstaetten_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: sv_kalender_verbindungen_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sv_kalender_verbindungen_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: sv_private_stops_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sv_private_stops_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: sync_claims_sv_id_to_faelle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_claims_sv_id_to_faelle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.sv_id IS DISTINCT FROM OLD.sv_id THEN
    UPDATE public.faelle f
    SET sv_id = NEW.sv_id
    WHERE f.claim_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION sync_claims_sv_id_to_faelle(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_claims_sv_id_to_faelle() IS 'CMM-60 Schritt 3: spiegelt claims.sv_id -> faelle.sv_id. pg_trigger_depth-Guard gegen Loop mit trg_sync_faelle_sv_id_to_claims. Faellt mit dem faelle-Drop (Phase 6) weg.';


--
-- Name: sync_faelle_sv_id_to_claims(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_faelle_sv_id_to_claims() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.claim_id IS NOT NULL
     AND NEW.sv_id IS DISTINCT FROM OLD.sv_id THEN
    UPDATE public.claims c
    SET sv_id = NEW.sv_id
    WHERE c.id = NEW.claim_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_fall_dokumente_claim_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_fall_dokumente_claim_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id
    FROM public.faelle
    WHERE id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: tg_auftraege_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_auftraege_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: tg_termin_sync_auftrag_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_termin_sync_auftrag_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_neu_status text;
BEGIN
  IF NEW.auftrag_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Phase ableiten:
  --   durchgefuehrt_am gesetzt → 'gutachten' (Termin durch, Gutachten kommt noch)
  --   sv_angekommen_am gesetzt → 'besichtigung'
  --   sonst → 'termin'
  IF NEW.durchgefuehrt_am IS NOT NULL THEN
    v_neu_status := 'gutachten';
  ELSIF NEW.sv_angekommen_am IS NOT NULL THEN
    v_neu_status := 'besichtigung';
  ELSE
    v_neu_status := 'termin';
  END IF;

  -- Nur fortschreiten, nicht zurück. 'abgeschlossen' wird nur explizit per
  -- App gesetzt (QC-Freigabe), nicht hier.
  UPDATE public.auftraege
  SET status = v_neu_status
  WHERE id = NEW.auftrag_id
    AND status != 'abgeschlossen'
    AND CASE status
          WHEN 'termin' THEN 1
          WHEN 'besichtigung' THEN 2
          WHEN 'gutachten' THEN 3
          WHEN 'abgeschlossen' THEN 4
        END < CASE v_neu_status
          WHEN 'termin' THEN 1
          WHEN 'besichtigung' THEN 2
          WHEN 'gutachten' THEN 3
        END;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_termin_sync_auftrag_status(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_termin_sync_auftrag_status() IS 'CMM-32d: spiegelt gutachter_termine-State (sv_angekommen_am, durchgefuehrt_am) auf auftraege.status. Nur Fortschritt, kein Rückwärts. abgeschlossen wird per QC-Pfad gesetzt.';


--
-- Name: touch_claim_recency(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_claim_recency(p_claim_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.claim_recency (claim_id, last_activity_at)
  VALUES (p_claim_id, now())
  ON CONFLICT (claim_id) DO UPDATE SET last_activity_at = now();
$$;


--
-- Name: trg_fall_dokumente_autotask(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fall_dokumente_autotask() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_kb_id UUID;
  v_slot_label TEXT;
  v_doc_desc TEXT;
BEGIN
  IF NEW.uploaded_by_kunde IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT c.kundenbetreuer_id INTO v_kb_id
  FROM public.faelle f
  JOIN public.claims c ON c.id = f.claim_id
  WHERE f.id = NEW.fall_id;

  IF v_kb_id IS NULL THEN
    SELECT id INTO v_kb_id FROM public.profiles WHERE rolle = 'admin' LIMIT 1;
  END IF;
  IF v_kb_id IS NULL THEN RETURN NEW; END IF;

  SELECT label INTO v_slot_label
  FROM public.dokument_katalog WHERE slot_id = NEW.dokument_typ;
  IF v_slot_label IS NULL THEN
    v_slot_label := COALESCE(NEW.original_filename, NEW.dokument_typ, 'Dokument');
  END IF;
  v_doc_desc := COALESCE(NEW.original_filename, v_slot_label);

  INSERT INTO public.tasks (
    fall_id, empfaenger_user_id, empfaenger_rolle,
    typ, task_typ, titel, status, prioritaet,
    entity_type, entity_id, auto_erstellt
  )
  SELECT
    NEW.fall_id, v_kb_id, 'kundenbetreuer',
    'dokument-pruefen', 'dokument-pruefen',
    'Dokument prüfen: ' || v_slot_label,
    'offen'::task_status, 'normal',
    'fall_dokumente', NEW.id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE fall_id = NEW.fall_id
      AND entity_type = 'fall_dokumente'
      AND entity_id = NEW.id
      AND task_typ = 'dokument-pruefen'
      AND status IN ('offen', 'in-bearbeitung')
  );

  IF NEW.dokument_typ IN ('kunde-nachreichung', 'sonstiges') OR NEW.dokument_typ IS NULL THEN
    INSERT INTO public.tasks (
      fall_id, empfaenger_user_id, empfaenger_rolle,
      typ, task_typ, titel, status, prioritaet,
      entity_type, entity_id, auto_erstellt
    )
    SELECT
      NEW.fall_id, v_kb_id, 'kundenbetreuer',
      'dokument-zuordnen', 'dokument-zuordnen',
      'Dokument zuordnen: ' || v_doc_desc,
      'offen'::task_status, 'dringend',
      'fall_dokumente', NEW.id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE fall_id = NEW.fall_id
        AND entity_type = 'fall_dokumente'
        AND entity_id = NEW.id
        AND task_typ = 'dokument-zuordnen'
        AND status IN ('offen', 'in-bearbeitung')
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_fall_dokumente_autotask(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_fall_dokumente_autotask() IS 'AAR-325 (Child 5 von AAR-320): Erzeugt bei Kunden-Upload automatisch einen KB-Task zum Prüfen (und ggf. Zuordnen, bei unklaren Slots).';


--
-- Name: trg_filmcheck_benachrichtigung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_filmcheck_benachrichtigung() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (OLD.filmcheck_ok is distinct from true) and NEW.filmcheck_ok = true then
    perform public.notify_admins(
      'Filmcheck abgeschlossen',
      'Fall ' || coalesce(NEW.fall_nummer, left(NEW.id::text, 8)) || ' — an Kanzlei übergeben',
      '/admin/faelle/' || NEW.id
    );
  end if;
  return NEW;
end;
$$;


--
-- Name: trg_fn_sync_kanzlei_paket_to_faelle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'versendet' AND (OLD.status IS NULL OR OLD.status != 'versendet') THEN
    UPDATE public.faelle
       SET aktuelle_phase = 'kanzlei_fallakte_angelegt',
           updated_at = now()
     WHERE claim_id = NEW.claim_id
       AND aktuelle_phase NOT IN ('vollzahlung_eingegangen','fall_akzeptiert_storniert');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: FUNCTION trg_fn_sync_kanzlei_paket_to_faelle(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle() IS 'AAR-854: Sync von kanzlei_pakete.status=versendet → faelle.aktuelle_phase. Schutz vor Endzustand-Override.';


--
-- Name: trg_gutachten_benachrichtigung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_gutachten_benachrichtigung() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if OLD.gutachten_eingegangen_am is null and NEW.gutachten_eingegangen_am is not null then
    perform public.notify_admins(
      'Gutachten eingegangen',
      'Fall ' || coalesce(NEW.fall_nummer, left(NEW.id::text, 8)) || ' — Gutachten wurde hochgeladen',
      '/admin/faelle/' || NEW.id
    );
  end if;
  return NEW;
end;
$$;


--
-- Name: trg_kanzlei_admin_termine_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_kanzlei_admin_termine_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_lead_benachrichtigung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_lead_benachrichtigung() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
begin
  v_name := coalesce(nullif(trim(coalesce(NEW.vorname,'') || ' ' || coalesce(NEW.nachname,'')), ''), NEW.email, 'Unbekannt');
  perform public.notify_admins(
    'Neuer Lead',
    v_name || ' hat sich registriert',
    '/admin/leads/' || NEW.id
  );
  return NEW;
end;
$$;


--
-- Name: trg_regulierung_benachrichtigung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_regulierung_benachrichtigung() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_betrag text;
begin
  if OLD.regulierung_am is null and NEW.regulierung_am is not null then
    v_betrag := coalesce(to_char(NEW.regulierung_betrag, 'FM999G999D00 €'), '');
    perform public.notify_admins(
      'Regulierung eingegangen',
      'Fall ' || coalesce(NEW.fall_nummer, left(NEW.id::text, 8)) || ' — ' || v_betrag,
      '/admin/faelle/' || NEW.id
    );
  end if;
  return NEW;
end;
$$;


--
-- Name: trigger_kanzlei_provision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_kanzlei_provision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- Nur ausloesen wenn: vollmacht neu signiert UND mandatstyp = kanzlei-claimondo
  IF NEW.vollmacht_signiert_am IS NOT NULL
     AND OLD.vollmacht_signiert_am IS NULL
     AND NEW.mandatstyp = 'kanzlei-claimondo'
  THEN
    INSERT INTO finance_eintraege (typ, betrag, status, beschreibung, referenz_id, referenz_typ)
    VALUES (
      'kanzlei-provision',
      150,
      'offen',
      'Kanzlei-Provision 150 EUR netto - Vollmacht signiert: ' || COALESCE(NEW.vorname, '') || ' ' || COALESCE(NEW.nachname, ''),
      NEW.id,
      'leads'
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_sa_bestaetigt_termin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_sa_bestaetigt_termin() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- Wenn sa_unterschrieben von false/null auf true wechselt
  IF NEW.sa_unterschrieben = true AND (OLD.sa_unterschrieben IS NULL OR OLD.sa_unterschrieben = false) THEN
    -- gutachter_termin_status auf bestaetigt setzen
    IF NEW.gutachter_termin_status = 'reserviert' OR NEW.gutachter_termin_status IS NULL THEN
      NEW.gutachter_termin_status := 'bestaetigt';
    END IF;
    -- gutachter_termine Tabelle auch updaten
    UPDATE gutachter_termine
      SET status = 'bestaetigt'
      WHERE fall_id = NEW.id AND status = 'reserviert';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_aktualisiert_am_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_aktualisiert_am_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.aktualisiert_am = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_versicherungen_aktualisiert_am(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_versicherungen_aktualisiert_am() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.aktualisiert_am = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: upsert_vehicle_by_fin(character varying, character varying, character varying, character varying, text, text, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_vehicle_by_fin(p_fin character varying, p_kennzeichen character varying DEFAULT NULL::character varying, p_hsn character varying DEFAULT NULL::character varying, p_tsn character varying DEFAULT NULL::character varying, p_hersteller text DEFAULT NULL::text, p_modell text DEFAULT NULL::text, p_owner_id uuid DEFAULT NULL::uuid, p_quelle text DEFAULT 'manual'::text, p_kilometerstand integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id UUID;
  v_old_owner UUID;
BEGIN
  -- FIN-Validierung (defensive — Edge-Function sollte vorher prüfen)
  IF p_fin IS NULL OR length(trim(p_fin)) <> 17 THEN
    RAISE EXCEPTION 'FIN muss genau 17 Zeichen lang sein. Erhalten: %', p_fin
      USING ERRCODE = '22023';
  END IF;
  IF p_fin ~ '[ILOQ]' THEN
    RAISE EXCEPTION 'FIN enthält ungültige Zeichen (I, L, O, Q sind in ISO 3779 nicht erlaubt). Erhalten: %', p_fin
      USING ERRCODE = '22023';
  END IF;

  -- Bestehenden Owner für Halterwechsel-Detection holen
  SELECT current_owner_id INTO v_old_owner FROM public.vehicles WHERE fin = p_fin;

  -- Vehicle anlegen oder ergänzen
  INSERT INTO public.vehicles (
    fin, kennzeichen_aktuell, hsn, tsn, hersteller, modell_haupttyp,
    current_owner_id, aktueller_kilometerstand, aktueller_kilometerstand_at
  )
  VALUES (
    p_fin, p_kennzeichen, p_hsn, p_tsn,
    COALESCE(p_hersteller, 'Unbekannt'),
    p_modell, p_owner_id, p_kilometerstand,
    CASE WHEN p_kilometerstand IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (fin) DO UPDATE SET
    kennzeichen_aktuell = COALESCE(EXCLUDED.kennzeichen_aktuell, public.vehicles.kennzeichen_aktuell),
    hsn = COALESCE(EXCLUDED.hsn, public.vehicles.hsn),
    tsn = COALESCE(EXCLUDED.tsn, public.vehicles.tsn),
    hersteller = CASE
                   WHEN public.vehicles.hersteller = 'Unbekannt'
                        AND EXCLUDED.hersteller IS NOT NULL
                        AND EXCLUDED.hersteller <> 'Unbekannt'
                   THEN EXCLUDED.hersteller
                   ELSE public.vehicles.hersteller
                 END,
    modell_haupttyp = COALESCE(EXCLUDED.modell_haupttyp, public.vehicles.modell_haupttyp),
    current_owner_id = COALESCE(EXCLUDED.current_owner_id, public.vehicles.current_owner_id),
    aktueller_kilometerstand = GREATEST(
      COALESCE(public.vehicles.aktueller_kilometerstand, 0),
      COALESCE(EXCLUDED.aktueller_kilometerstand, 0)
    ),
    aktueller_kilometerstand_at = CASE
      WHEN EXCLUDED.aktueller_kilometerstand IS NOT NULL
        AND (public.vehicles.aktueller_kilometerstand IS NULL
             OR EXCLUDED.aktueller_kilometerstand > public.vehicles.aktueller_kilometerstand)
      THEN now()
      ELSE public.vehicles.aktueller_kilometerstand_at
    END,
    updated_at = now()
  RETURNING id INTO v_id;

  -- Halterwechsel-Detection: Wenn neuer Owner abweicht, alte Ownership schließen + neue öffnen
  IF p_owner_id IS NOT NULL AND v_old_owner IS DISTINCT FROM p_owner_id THEN
    UPDATE public.vehicle_ownership_history
       SET bis = CURRENT_DATE
     WHERE vehicle_id = v_id
       AND bis IS NULL
       AND user_id IS DISTINCT FROM p_owner_id;

    INSERT INTO public.vehicle_ownership_history (vehicle_id, user_id, von, quelle)
    SELECT v_id, p_owner_id, CURRENT_DATE, p_quelle
    WHERE NOT EXISTS (
      SELECT 1 FROM public.vehicle_ownership_history
      WHERE vehicle_id = v_id AND user_id = p_owner_id AND bis IS NULL
    );
  END IF;

  RETURN v_id;
END $$;


--
-- Name: FUNCTION upsert_vehicle_by_fin(p_fin character varying, p_kennzeichen character varying, p_hsn character varying, p_tsn character varying, p_hersteller text, p_modell text, p_owner_id uuid, p_quelle text, p_kilometerstand integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.upsert_vehicle_by_fin(p_fin character varying, p_kennzeichen character varying, p_hsn character varying, p_tsn character varying, p_hersteller text, p_modell text, p_owner_id uuid, p_quelle text, p_kilometerstand integer) IS 'AAR-773: Idempotente Vehicle-Erstellung über FIN. SECURITY DEFINER für Server-Action-Aufrufe. Detektiert Halterwechsel und pflegt vehicle_ownership_history automatisch.';


--
-- Name: validate_gutachter_termine_claim_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_gutachter_termine_claim_id() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.fall_id IS NOT NULL AND NEW.claim_id IS NULL THEN
    RAISE EXCEPTION 'gutachter_termine.claim_id darf nicht NULL sein wenn fall_id gesetzt ist (fall_id=%). CMM-44 SP-G2: der Writer muss claim_id setzen.', NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abrechnung_positionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abrechnung_positionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abrechnung_id uuid NOT NULL,
    fall_id uuid NOT NULL,
    fall_datum date NOT NULL,
    kennzeichen text,
    schadenhoehe_netto numeric(10,2) NOT NULL,
    lead_preis_netto numeric(10,2) NOT NULL,
    lead_preis_typ text NOT NULL,
    guthaben_verrechnet_netto numeric(10,2) DEFAULT 0 NOT NULL,
    sv_nachzahlung_netto numeric(10,2) DEFAULT 0 NOT NULL,
    position_nr integer NOT NULL
);


--
-- Name: abrechnung_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abrechnung_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abrechnung_id uuid NOT NULL,
    reminder_typ text NOT NULL,
    versendet_am timestamp with time zone DEFAULT now() NOT NULL,
    details jsonb,
    CONSTRAINT abrechnung_reminders_typ_check CHECK ((reminder_typ = ANY (ARRAY['reminder_7d'::text, 'reminder_3d'::text, 'reminder_1d'::text, 'reminder_5d'::text, 'reminder_10d'::text, 'reminder_13d'::text, 'einzug_versucht'::text, 'einzug_fehlgeschlagen'::text, 'gesperrt'::text])))
);


--
-- Name: abrechnungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abrechnungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empfaenger_typ text NOT NULL,
    empfaenger_id uuid,
    empfaenger_email text NOT NULL,
    empfaenger_name text NOT NULL,
    abrechnungs_nr text NOT NULL,
    abrechnungs_zeitraum_start date NOT NULL,
    abrechnungs_zeitraum_ende date NOT NULL,
    positionen jsonb NOT NULL,
    summe_netto numeric(10,2) NOT NULL,
    ust_satz numeric(4,2) DEFAULT 19.00 NOT NULL,
    ust_betrag numeric(10,2) NOT NULL,
    summe_brutto numeric(10,2) NOT NULL,
    versand_datum timestamp with time zone,
    faellig_am date,
    status text DEFAULT 'entwurf'::text NOT NULL,
    bezahlt_am timestamp with time zone,
    bezahlt_betrag numeric(10,2),
    pdf_path text,
    email_log_id uuid,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    storniert_am timestamp with time zone,
    storniert_grund text,
    ersetzt_durch_abrechnung_id uuid,
    reminder_gesendet_am timestamp with time zone,
    einzug_versucht_am timestamp with time zone,
    einzug_fehler text,
    stripe_payment_intent_id text,
    whatsapp_gesendet_am timestamp with time zone,
    CONSTRAINT abrechnungen_empfaenger_typ_check CHECK ((empfaenger_typ = ANY (ARRAY['marketing'::text, 'kanzlei'::text, 'sv'::text, 'makler'::text]))),
    CONSTRAINT abrechnungen_status_check CHECK ((status = ANY (ARRAY['entwurf'::text, 'versendet'::text, 'bezahlt'::text, 'ueberfaellig'::text, 'storniert'::text, 'fehlgeschlagen'::text])))
);


--
-- Name: admin_termine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_termine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    typ text NOT NULL,
    titel text NOT NULL,
    beschreibung text,
    start_zeit timestamp with time zone NOT NULL,
    end_zeit timestamp with time zone NOT NULL,
    fall_id uuid,
    kunde_id uuid,
    erstellt_von uuid NOT NULL,
    zugewiesen_an uuid,
    status text DEFAULT 'offen'::text NOT NULL,
    erinnerung_min_vorher integer,
    notizen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid,
    google_event_id text,
    google_calendar_id text,
    google_event_synced_at timestamp with time zone,
    gesehen_am timestamp with time zone,
    CONSTRAINT admin_termine_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'erledigt'::text, 'abgesagt'::text]))),
    CONSTRAINT admin_termine_typ_check CHECK ((typ = ANY (ARRAY['rueckruf'::text, 'kunde'::text, 'intern'::text])))
);


--
-- Name: COLUMN admin_termine.lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_termine.lead_id IS 'AAR-637: Optionaler Bezug zu einem Lead (pre-Fall). Für Rückrufe aus Dispatch vor Lead→Fall-Konversion. Entweder fall_id oder lead_id oder keins von beiden (z.B. interne Termine). ON DELETE SET NULL — Lead-Delete soll den Termin nicht hart löschen.';


--
-- Name: COLUMN admin_termine.google_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_termine.google_event_id IS 'AAR-698: Google-Calendar-Event-ID im Kalender des zugewiesen_an-Users.';


--
-- Name: COLUMN admin_termine.google_calendar_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_termine.google_calendar_id IS 'AAR-698: Calendar-ID (meist primary).';


--
-- Name: COLUMN admin_termine.google_event_synced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_termine.google_event_synced_at IS 'AAR-698: Zeitstempel des letzten erfolgreichen Sync.';


--
-- Name: COLUMN admin_termine.gesehen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_termine.gesehen_am IS 'AAR-724: Zeitpunkt, zu dem der zugewiesene Dispatcher/Admin den Termin/Rückruf angesehen hat. NULL = noch nicht gesehen.';


--
-- Name: ai_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    endpoint text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_input_tokens integer DEFAULT 0 NOT NULL,
    cache_read_input_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ai_usage_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_usage_log IS 'AAR-436: Token-Usage pro Anthropic-Call inkl. Cache-Hit-Tracking. Writes nur via service_role.';


--
-- Name: aircall_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aircall_calls (
    id bigint NOT NULL,
    aircall_id text NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration integer,
    from_number text NOT NULL,
    to_number text NOT NULL,
    aircall_user_id text,
    aircall_user_email text,
    lead_id uuid,
    fall_id uuid,
    initiated_by_profile_id uuid,
    recording_url text,
    voicemail_url text,
    comments text,
    tags text[],
    raw_event jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT aircall_calls_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT aircall_calls_status_check CHECK ((status = ANY (ARRAY['answered'::text, 'missed'::text, 'voicemail'::text, 'failed'::text])))
);


--
-- Name: aircall_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aircall_calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aircall_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aircall_calls_id_seq OWNED BY public.aircall_calls.id;


--
-- Name: aircall_relay_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aircall_relay_seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aircall_user_id bigint NOT NULL,
    aircall_user_email text NOT NULL,
    aircall_number_id bigint NOT NULL,
    bezeichnung text NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    zuletzt_verwendet timestamp with time zone,
    belegt boolean DEFAULT false NOT NULL,
    belegt_seit timestamp with time zone,
    belegt_call_id uuid,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: airdrop_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    invited_by_user_id uuid,
    invited_by_party_id uuid,
    token_hash text NOT NULL,
    token_lookup_prefix character varying(8) NOT NULL,
    invited_via text NOT NULL,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    opened_at timestamp with time zone,
    responded_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    withdrawn_by_user_id uuid,
    withdrawn_grund text,
    status text DEFAULT 'offen'::text NOT NULL,
    resulting_party_id uuid,
    resulting_user_id uuid,
    konvertiert_zu_voll_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address_open text,
    user_agent_open text,
    abgelaufen_am timestamp with time zone,
    CONSTRAINT airdrop_invitations_invited_via_check CHECK ((invited_via = ANY (ARRAY['qr_code'::text, 'airdrop'::text, 'whatsapp'::text, 'sms'::text, 'email'::text, 'manual_link'::text, 'telegram'::text, 'signal'::text]))),
    CONSTRAINT airdrop_invitations_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'geoeffnet'::text, 'daten_eingegeben'::text, 'widerrufen'::text, 'abgelaufen'::text, 'konvertiert'::text]))),
    CONSTRAINT chk_airdrop_expires_after_invite CHECK ((expires_at > invited_at)),
    CONSTRAINT chk_airdrop_konvertiert_braucht_user CHECK (((konvertiert_zu_voll_am IS NULL) OR (resulting_user_id IS NOT NULL))),
    CONSTRAINT chk_airdrop_responded_after_opened CHECK (((responded_at IS NULL) OR (opened_at IS NULL) OR (responded_at >= opened_at))),
    CONSTRAINT chk_airdrop_widerrufen_konsistenz CHECK ((((withdrawn_at IS NULL) AND (withdrawn_by_user_id IS NULL)) OR ((withdrawn_at IS NOT NULL) AND (withdrawn_by_user_id IS NOT NULL))))
);


--
-- Name: TABLE airdrop_invitations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.airdrop_invitations IS 'AAR-810 A.3: Magic-Link-Einladungen für Gegner-Halter, die nicht unsere Kunden sind. Token gehashed gespeichert (analog auth_remember_tokens). Lifecycle: offen → geoeffnet → daten_eingegeben → ggf. konvertiert. Cron-Job markiert abgelaufen nach 7 Tagen.';


--
-- Name: COLUMN airdrop_invitations.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.airdrop_invitations.token_hash IS 'SHA-256-Hash des Klartext-Tokens. Klartext wird nie persistiert.';


--
-- Name: COLUMN airdrop_invitations.token_lookup_prefix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.airdrop_invitations.token_lookup_prefix IS 'Erste 8 Zeichen des Klartext-Tokens für indexed O(1)-Lookup vor Hash-Verify.';


--
-- Name: COLUMN airdrop_invitations.abgelaufen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.airdrop_invitations.abgelaufen_am IS 'AAR-826: Zeitpunkt zu dem status=abgelaufen gesetzt wurde. Cleanup-Cron löscht nach > 30 Tagen.';


--
-- Name: anfragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anfragen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quelle text NOT NULL,
    quelle_variant text,
    quelle_url text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    kontakt_name text,
    kontakt_telefon text,
    kontakt_email text,
    kontakt_plz_oder_stadt text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    client_ip inet,
    user_agent text,
    lead_id uuid,
    konvertiert_am timestamp with time zone,
    konvertier_status text DEFAULT 'pending'::text NOT NULL,
    konvertier_fehler text,
    disqualifiziert_grund text,
    disqualifiziert_am timestamp with time zone,
    disqualifiziert_durch uuid,
    dsgvo_zustimmung_am timestamp with time zone,
    CONSTRAINT anfragen_konvertier_status_check CHECK ((konvertier_status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text, 'disqualifiziert'::text])))
);


--
-- Name: TABLE anfragen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.anfragen IS 'Inbox für rohe Eingangs-Anfragen aus allen Channels (LP-Forms, Rückruf-Modal, Telefon-Bot, WA, Partner-APIs). Atomar konvertiert zu leads via convert_anfrage_zu_lead(). Audit-Trail-Tabelle, niemals DELETE — nur disqualifizieren.';


--
-- Name: COLUMN anfragen.quelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anfragen.quelle IS 'Maschinenlesbarer Channel-Slug. Eine Quelle = ein Slug (z.B. kfzgutachter-ads-lp).';


--
-- Name: COLUMN anfragen.payload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anfragen.payload IS 'Channel-spezifischer Rohdaten-Puffer. Felder die regelmäßig abgefragt werden, sollten später zu echten Spalten promoviert werden.';


--
-- Name: COLUMN anfragen.konvertier_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anfragen.konvertier_status IS 'pending | success | failed | disqualifiziert — vollständiger Convert-Audit-Trail inkl. Fehlerfällen.';


--
-- Name: COLUMN anfragen.dsgvo_zustimmung_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anfragen.dsgvo_zustimmung_am IS 'Zeitstempel der DSGVO-Einwilligung beim Formular-Submit. NULL = keine erfasste Einwilligung. Server-Action setzt now() bei Consent. Spiegelt gutachter_finder_anfragen.dsgvo_zustimmung_am.';


--
-- Name: anruf_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anruf_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    zeitpunkt timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    notiz text,
    erstellt_von uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anruf_log_status_check CHECK ((status = ANY (ARRAY['erreicht'::text, 'nicht_erreicht'::text])))
);


--
-- Name: auftraege; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auftraege (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    sv_id uuid NOT NULL,
    typ text NOT NULL,
    status text NOT NULL,
    reihenfolge integer DEFAULT 1 NOT NULL,
    vorheriger_auftrag_id uuid,
    gutachten_url text,
    gutachten_final_freigegeben boolean DEFAULT false NOT NULL,
    abgeschlossen_am timestamp with time zone,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    zurueckweisung_grund text,
    zurueckgewiesen_am timestamp with time zone,
    grundhonorar_netto numeric(10,2),
    grundhonorar_brutto numeric(10,2),
    claim_id uuid NOT NULL,
    filmcheck_ok boolean DEFAULT false,
    filmcheck_am timestamp with time zone,
    filmcheck_notizen text,
    storniert_am timestamp with time zone,
    storno_grund text,
    storno_durch_user_id uuid,
    besichtigung_gestartet_am timestamp with time zone,
    sv_briefing_text text,
    sv_briefing_generated_at timestamp with time zone,
    sv_briefing_model text,
    sv_briefing_version integer DEFAULT 0 NOT NULL,
    sv_briefing_struktur jsonb,
    sv_notizen_vor_ort text,
    technische_stellungnahme_status text DEFAULT 'nicht-angefordert'::text,
    technische_stellungnahme_notiz_sv text,
    technische_stellungnahme_beauftragt_am timestamp with time zone,
    technische_stellungnahme_hochgeladen_am timestamp with time zone,
    technische_stellungnahme_freigabe_am timestamp with time zone,
    CONSTRAINT auftraege_status_check CHECK ((status = ANY (ARRAY['termin'::text, 'besichtigung'::text, 'gutachten'::text, 'abgeschlossen'::text]))),
    CONSTRAINT auftraege_typ_check CHECK ((typ = ANY (ARRAY['erstgutachten'::text, 'nachbesichtigung'::text, 'stellungnahme'::text])))
);

ALTER TABLE ONLY public.auftraege REPLICA IDENTITY FULL;


--
-- Name: TABLE auftraege; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auftraege IS 'CMM-32: SV-Auftrags-Sub-Entity. Backfill 32b: jeder bestehende fall mit sv_id hat einen erstgutachten-Auftrag; aktive Nachbesichtigungen sind als zweiter Auftrag (typ=nachbesichtigung, vorheriger_auftrag_id verlinkt). gutachter_termine.auftrag_id ist auf den erstgutachten-Auftrag gesetzt.';


--
-- Name: COLUMN auftraege.zurueckweisung_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auftraege.zurueckweisung_grund IS 'CMM-32e: KB-Begründung bei Nachbesserung. Bleibt nach Re-Upload als Audit-Spur stehen.';


--
-- Name: COLUMN auftraege.zurueckgewiesen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auftraege.zurueckgewiesen_am IS 'CMM-32e: Wenn gesetzt, wartet der Auftrag auf SV-Korrektur. Beim erfolgreichen Re-Upload zurück auf NULL.';


--
-- Name: COLUMN auftraege.grundhonorar_netto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auftraege.grundhonorar_netto IS 'Vom SV gefordertes Grundhonorar netto (vor Lead-Abzug). Sichtbar fuer SV im Kanzleifall-Lifecycle.';


--
-- Name: COLUMN auftraege.grundhonorar_brutto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auftraege.grundhonorar_brutto IS 'Vom SV gefordertes Grundhonorar brutto. Sichtbar fuer SV im Kanzleifall-Lifecycle.';


--
-- Name: COLUMN auftraege.claim_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auftraege.claim_id IS 'Direktverlinkung zum Claim (Phase 1.5b). Wird via Trigger aus faelle.claim_id befüllt wenn Caller es nicht selbst setzt.';


--
-- Name: auth_remember_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_remember_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    user_agent text,
    ip_address text,
    device_name text,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: benachrichtigungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.benachrichtigungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    titel text NOT NULL,
    nachricht text,
    gelesen boolean DEFAULT false NOT NULL,
    link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    typ text DEFAULT 'system'::text,
    beschreibung text,
    erstellt_am timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE benachrichtigungen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.benachrichtigungen IS 'In-App Benachrichtigungen für Nutzer';


--
-- Name: bkat_tatbestaende; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bkat_tatbestaende (
    tbnr character(6) NOT NULL,
    vorschrift character(1) NOT NULL,
    paragraph text NOT NULL,
    paragraph_num smallint NOT NULL,
    bezeichnung text NOT NULL,
    kurzform text NOT NULL,
    unfallart public.bkat_unfallart NOT NULL,
    schuldindiz public.bkat_schuldindiz NOT NULL,
    mit_gefaehrdung boolean DEFAULT false,
    mit_sachbeschaedigung boolean DEFAULT false,
    mit_unfall boolean DEFAULT false,
    bussgeld_cent integer,
    punkte smallint DEFAULT 0,
    fahrverbot_monate smallint DEFAULT 0,
    bkat_version text DEFAULT '2023-09-01'::text NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now(),
    aktualisiert_am timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE bkat_tatbestaende; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bkat_tatbestaende IS 'AAR-503: Bundeseinheitlicher Tatbestandskatalog (BKat) Lookup. Quelle: KBA 01.09.2023 (15. Auflage). Unfall-relevante Tatbestände. Bußgeld in Cent, Punkte 0-2.';


--
-- Name: branchen_benchmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branchen_benchmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metrik text NOT NULL,
    beschreibung text NOT NULL,
    branchen_wert numeric(10,2) NOT NULL,
    einheit text NOT NULL,
    quelle text,
    gueltig_ab date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_copilot_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_copilot_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid NOT NULL,
    zeitpunkt_offset_sek integer DEFAULT 0 NOT NULL,
    ausloeser text NOT NULL,
    vorschlag text NOT NULL,
    kategorie text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT call_copilot_suggestions_kategorie_check CHECK ((kategorie = ANY (ARRAY['einwand'::text, 'fachinfo'::text, 'closing'::text, 'smalltalk'::text, 'warnung'::text])))
);


--
-- Name: call_transcription_utterances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_transcription_utterances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid NOT NULL,
    aircall_call_id text NOT NULL,
    speaker text,
    text text NOT NULL,
    start_time numeric,
    end_time numeric,
    empfangen_am timestamp with time zone DEFAULT now() NOT NULL,
    verarbeitet boolean DEFAULT false NOT NULL
);


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aircall_call_id text NOT NULL,
    fall_id uuid,
    lead_id uuid,
    initiator_user_id uuid,
    richtung text NOT NULL,
    status text NOT NULL,
    von_nummer text,
    zu_nummer text,
    gestartet_am timestamp with time zone,
    beantwortet_am timestamp with time zone,
    beendet_am timestamp with time zone,
    dauer_sekunden integer,
    recording_url text,
    transkript jsonb,
    transkript_text text,
    sentiment text,
    ki_zusammenfassung text,
    ki_naechste_schritte text,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bridge jsonb,
    CONSTRAINT calls_richtung_check CHECK ((richtung = ANY (ARRAY['outbound'::text, 'inbound'::text, 'bridge'::text]))),
    CONSTRAINT calls_status_check CHECK ((status = ANY (ARRAY['initiiert'::text, 'klingelt'::text, 'aktiv'::text, 'beendet'::text, 'verpasst'::text, 'abgebrochen'::text, 'failed'::text])))
);


--
-- Name: claim_mietwagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_mietwagen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    status text DEFAULT 'beantragt'::text NOT NULL,
    fahrzeugklasse text,
    anbieter text,
    mietvertrag_nr text,
    beginn_datum date,
    ende_datum date,
    tatsaechliches_ende date,
    tagespreis_netto numeric(8,2),
    tage_gesamt integer GENERATED ALWAYS AS (
CASE
    WHEN ((tatsaechliches_ende IS NOT NULL) AND (beginn_datum IS NOT NULL)) THEN (tatsaechliches_ende - beginn_datum)
    WHEN ((ende_datum IS NOT NULL) AND (beginn_datum IS NOT NULL)) THEN (ende_datum - beginn_datum)
    ELSE NULL::integer
END) STORED,
    gesamtkosten_netto numeric(10,2),
    erstattet_durch_vs boolean DEFAULT false,
    erstattungsbetrag numeric(10,2),
    erstattung_am date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    notiz text,
    erstattbar_max_tage integer,
    rechnung_url text,
    CONSTRAINT claim_mietwagen_status_check CHECK ((status = ANY (ARRAY['beantragt'::text, 'genehmigt'::text, 'aktiv'::text, 'beendet'::text, 'abgelehnt'::text, 'storniert'::text])))
);


--
-- Name: TABLE claim_mietwagen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.claim_mietwagen IS 'AAR-824: Mietwagen-Anspruch pro Claim. tage_gesamt + gesamtkosten_netto für Schadensabrechnung. Keine eigene Phase-Kopplung — Phase läuft über Gutachten/Repairs/Payments.';


--
-- Name: claim_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    rolle text NOT NULL,
    reihenfolge integer,
    user_id uuid,
    anrede text,
    titel text,
    vorname text,
    nachname text,
    firma text,
    geburtsdatum date,
    ist_gewerbe boolean DEFAULT false NOT NULL,
    ust_id text,
    telefon text,
    mobil text,
    email text,
    adresse_strasse text,
    adresse_plz character varying(10),
    adresse_ort text,
    adresse_land character varying(2) DEFAULT 'DE'::character varying NOT NULL,
    ist_halter boolean DEFAULT false NOT NULL,
    ist_fahrer boolean DEFAULT false NOT NULL,
    fuehrerscheinklassen text[],
    fuehrerscheinnummer text,
    kennzeichen character varying(20),
    fahrzeugtyp_klartext text,
    vehicle_id uuid,
    versicherung_id uuid,
    versicherung_klartext text,
    versicherungsnummer text,
    versicherungs_aktenzeichen text,
    hat_personenschaden boolean DEFAULT false NOT NULL,
    verletzungsart text,
    krankenhaus_name text,
    arbeitsunfaehig_seit date,
    arbeitsunfaehig_bis date,
    ist_fahrzeuginsasse boolean,
    ist_eingeladen_via_airdrop boolean DEFAULT false NOT NULL,
    airdrop_token character varying(64),
    airdrop_eingeladen_am timestamp with time zone,
    airdrop_response_am timestamp with time zone,
    ist_aktiv boolean DEFAULT true NOT NULL,
    ist_anonymisiert boolean DEFAULT false NOT NULL,
    anonymisiert_am timestamp with time zone,
    quelle text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    notiz text,
    beziehung_zum_halter text,
    kennzeichen_kreis text,
    kennzeichen_buchstaben text,
    kennzeichen_zahl text,
    kennzeichen_suffix text,
    CONSTRAINT chk_airdrop_token_only_for_airdrop CHECK ((((airdrop_token IS NULL) AND (ist_eingeladen_via_airdrop = false)) OR ((airdrop_token IS NOT NULL) AND (ist_eingeladen_via_airdrop = true) AND (rolle = 'gegner_airdrop'::text)))),
    CONSTRAINT chk_anonymisiert_konsistenz CHECK ((((ist_anonymisiert = false) AND (anonymisiert_am IS NULL)) OR ((ist_anonymisiert = true) AND (anonymisiert_am IS NOT NULL)))),
    CONSTRAINT chk_arbeitsunfaehig_konsistenz CHECK (((arbeitsunfaehig_bis IS NULL) OR (arbeitsunfaehig_seit IS NULL) OR (arbeitsunfaehig_bis >= arbeitsunfaehig_seit))),
    CONSTRAINT claim_parties_quelle_check CHECK ((quelle = ANY (ARRAY['lead_konvertierung'::text, 'manuell_kb'::text, 'sv_besichtigung'::text, 'airdrop'::text, 'kunde_self'::text, 'backfill_aar810_a2'::text, 'backfill_aar810_a2_zeugen'::text, 'backfill_aar810_a2_personenschaden'::text]))),
    CONSTRAINT claim_parties_rolle_check CHECK ((rolle = ANY (ARRAY['geschaedigter'::text, 'verursacher'::text, 'fahrer_nicht_halter'::text, 'beifahrer'::text, 'zeuge'::text, 'gegner_airdrop'::text, 'gutachter_gegen'::text, 'versicherungssachbearbeiter'::text])))
);


--
-- Name: TABLE claim_parties; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.claim_parties IS 'AAR-810 A.2: Beteiligte am Claim. Hybrid-Modell: Hauptbeteiligte (geschaedigter, verursacher) zusätzlich als Direct-FK auf claims.geschaedigter_party_id/verursacher_party_id für Performance. UNIQUE pro Rolle und claim.';


--
-- Name: COLUMN claim_parties.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.user_id IS 'FK auf profiles. NULL bei Snapshot-only (Gegner ohne Account). Wird via Airdrop-Konversion (Phase A.3) später gefüllt.';


--
-- Name: COLUMN claim_parties.airdrop_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.airdrop_token IS 'Magic-Link-Token für Gegner-Einladung (Phase A.3). Nur bei rolle=gegner_airdrop nicht NULL.';


--
-- Name: COLUMN claim_parties.beziehung_zum_halter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.beziehung_zum_halter IS 'Beziehung des Ansprechpartners zum Halter wenn rolle != halter. Werte: ehepartner, familie, mitarbeiter, flotte_dispatcher, freund, sonstiges. Nur informativ — keine formelle Berechtigungsprüfung.';


--
-- Name: COLUMN claim_parties.kennzeichen_kreis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.kennzeichen_kreis IS 'Kennzeichen-Unterscheidungszeichen (z. B. M, B, HH)';


--
-- Name: COLUMN claim_parties.kennzeichen_buchstaben; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.kennzeichen_buchstaben IS 'Erkennungsnummer Buchstaben-Teil';


--
-- Name: COLUMN claim_parties.kennzeichen_zahl; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.kennzeichen_zahl IS 'Erkennungsnummer Zahlen-Teil';


--
-- Name: COLUMN claim_parties.kennzeichen_suffix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claim_parties.kennzeichen_suffix IS 'E-Kennzeichen-Suffix (E, H, ...) oder null';


--
-- Name: claim_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    status text DEFAULT 'ausstehend'::text NOT NULL,
    forderungsbetrag numeric(12,2),
    erhaltener_betrag numeric(12,2),
    differenz_betrag numeric(12,2) GENERATED ALWAYS AS ((COALESCE(forderungsbetrag, (0)::numeric) - COALESCE(erhaltener_betrag, (0)::numeric))) STORED,
    zahlungseingang_am timestamp with time zone,
    zahlungsweg text,
    zahlungsreferenz text,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    empfaenger text DEFAULT 'kunde'::text NOT NULL,
    CONSTRAINT claim_payments_empfaenger_check CHECK ((empfaenger = ANY (ARRAY['kunde'::text, 'sv'::text]))),
    CONSTRAINT claim_payments_status_check CHECK ((status = ANY (ARRAY['ausstehend'::text, 'teilweise'::text, 'erhalten'::text, 'final'::text, 'abgelehnt'::text]))),
    CONSTRAINT claim_payments_zahlungsweg_check CHECK ((zahlungsweg = ANY (ARRAY['überweisung'::text, 'scheck'::text, 'bar'::text, 'verrechnung'::text])))
);


--
-- Name: TABLE claim_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.claim_payments IS 'AAR-823 + AAR-839: Zahlungseingänge vom Versicherer — KEIN Phase-Trigger mehr (Phase 7+8 entfallen mit AAR-839, claim_payments ist reine Buchhaltung). KB entscheidet manuell via markClaimAsReguliert (AAR-840) wann ein Claim als reguliert gilt. status=ausstehend/teilweise/erhalten/final/abgelehnt. differenz_betrag GENERATED ALWAYS (Forderung minus Erhalten).';


--
-- Name: claim_recency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_recency (
    claim_id uuid NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE claim_recency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.claim_recency IS 'CMM-66/SV-Realtime: leak-freie Recency-SSoT pro Claim. Quelle fuer View-Recency (fall_updated_at/updated_at) + uniforme Realtime-Subscription aller Portale. Nur touch_claim_recency()/echte Aktivitaet schreiben — KEIN moddatetime (backfill-resistent).';


--
-- Name: claim_vehicle_involvements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_vehicle_involvements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    rolle text NOT NULL,
    beschaedigung_grad text,
    reihenfolge integer,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT claim_vehicle_involvements_beschaedigung_grad_check CHECK (((beschaedigung_grad IS NULL) OR (beschaedigung_grad = ANY (ARRAY['totalschaden'::text, 'reparaturschaden'::text, 'bagatelle'::text, 'keine_beschaedigung'::text])))),
    CONSTRAINT claim_vehicle_involvements_rolle_check CHECK ((rolle = ANY (ARRAY['geschaedigter'::text, 'verursacher'::text, 'beteiligter'::text, 'unbekannt'::text])))
);


--
-- Name: TABLE claim_vehicle_involvements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.claim_vehicle_involvements IS 'AAR-810 A.1: Sub-Table für claims mit mehreren beteiligten Vehicles (Multi-Vehicle-Crashes). claims.vehicle_id zeigt auf primäres Vehicle (Geschädigter); diese Sub-Table erfasst alle weiteren Beteiligten.';


--
-- Name: claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid,
    schadentag date NOT NULL,
    schadenzeit time without time zone,
    entdeckt_am date,
    schadenort_adresse text,
    schadenort_plz character varying(5),
    schadenort_ort text,
    schadenort_land character varying(2) DEFAULT 'DE'::character varying NOT NULL,
    schadenort_lat numeric(10,7),
    schadenort_lng numeric(10,7),
    schadenort_kategorie text,
    hergang_kunde_text text,
    hergang_sv_text text,
    schadenart text DEFAULT 'unbekannt'::text NOT NULL,
    fall_typ text,
    unfall_konstellation text,
    fahrerflucht boolean,
    auslandskennzeichen boolean,
    polizei_aktenzeichen text,
    polizei_bericht_vorhanden boolean DEFAULT false NOT NULL,
    polizei_vor_ort boolean DEFAULT false NOT NULL,
    polizeibericht_status text,
    geschaedigter_user_id uuid,
    gegnerisches_vehicle_id uuid,
    gegner_versicherung_id uuid,
    gegner_versicherungsnummer text,
    gegner_aktenzeichen text,
    gegner_bekannt boolean DEFAULT true NOT NULL,
    anzahl_beteiligte_total integer DEFAULT 1 NOT NULL,
    hat_personenschaden boolean DEFAULT false NOT NULL,
    hat_mietwagen boolean DEFAULT false NOT NULL,
    hat_nutzungsausfall boolean DEFAULT false NOT NULL,
    hat_sachschaden boolean DEFAULT false NOT NULL,
    hat_abschleppung boolean DEFAULT false NOT NULL,
    sachschaden_beschreibung text,
    halter_ungleich_fahrer boolean DEFAULT false NOT NULL,
    kunden_konstellation text,
    unfallskizze_url text,
    unfallskizze_svg text,
    unfallskizze_bestaetigt boolean,
    unfallskizze_ablehnung_grund text,
    unfallskizze_generiert_am timestamp with time zone,
    status text DEFAULT 'offen'::text NOT NULL,
    abgeschlossen_am timestamp with time zone,
    verjaehrt_am date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    created_via text DEFAULT 'manuell_admin'::text NOT NULL,
    claim_nummer text,
    lead_id uuid,
    kundenbetreuer_id uuid,
    vs_ablehnungs_grund text,
    regulierungs_betrag numeric(10,2),
    endzustand_gesetzt_durch_user_id uuid,
    endzustand_gesetzt_am timestamp with time zone,
    endzustand_grund text,
    kanzlei_wunsch text DEFAULT 'nicht_gefragt'::text NOT NULL,
    kanzlei_wunsch_gefragt_am timestamp with time zone,
    kanzlei_wunsch_gefragt_in_phase text,
    kunde_no_show_count integer DEFAULT 0 NOT NULL,
    letzter_no_show_am timestamp with time zone,
    sv_no_show_count integer DEFAULT 0 NOT NULL,
    letzter_sv_no_show_am timestamp with time zone,
    kanzlei_uebergeben_am timestamp with time zone,
    kanzlei_ansprechpartner_name text,
    kanzlei_ansprechpartner_email text,
    kanzlei_ansprechpartner_telefon text,
    kunde_email text,
    gewerbe_flag boolean DEFAULT false NOT NULL,
    vorsteuerabzugsberechtigt boolean DEFAULT false NOT NULL,
    finanzierung_leasing text DEFAULT 'keine'::text NOT NULL,
    finanzierungsgeber_name text,
    finanzierungsgeber_adresse text,
    finanzierungsgeber_vertragsnr text,
    brn text,
    zeugen_kontakte jsonb,
    spezifikation text,
    vorschaden_mit_vs_abgerechnet text,
    sv_id uuid,
    makler_id uuid,
    betreuungspaket public.betreuungspaket DEFAULT 'vollservice'::public.betreuungspaket,
    notizen text,
    prioritaet text DEFAULT 'normal'::text,
    onboarding_complete boolean DEFAULT false,
    status_changed_at timestamp with time zone DEFAULT now(),
    google_review_gesendet boolean DEFAULT false,
    datenschutz_akzeptiert boolean DEFAULT false,
    datenschutz_akzeptiert_am timestamp with time zone,
    interne_notizen text,
    ist_aktiv boolean DEFAULT true,
    deaktiviert_am timestamp with time zone,
    deaktiviert_grund text,
    deaktiviert_notiz text,
    szenario text DEFAULT 'normalfall'::text,
    service_typ text DEFAULT 'komplett'::text NOT NULL,
    geschlossen_grund text,
    bevorzugter_kanal text,
    sprache text DEFAULT 'de'::text,
    fallakte_angelegt_am timestamp with time zone,
    google_review_prompt_gezeigt_am timestamp with time zone,
    sv_zugewiesen_am timestamp with time zone,
    kundenbetreuer_fallback_flag boolean DEFAULT false NOT NULL,
    kundenbetreuer_zugewiesen_am timestamp with time zone,
    eskaliert_an_admin_id uuid,
    eskaliert_am timestamp with time zone,
    eskaliert_grund text,
    abtretung_pdf text,
    vollmacht_pdf text,
    abtretung_signiert_am timestamp with time zone,
    vollmacht_signiert_am timestamp with time zone,
    sa_unterschrieben boolean DEFAULT false,
    sa_unterschrieben_am timestamp with time zone,
    sa_pdf_url text,
    sa_unterschrift_url text,
    vollmacht_status text DEFAULT 'ausstehend'::text,
    vollmacht_geprueft_am timestamp with time zone,
    vollmacht_geprueft_von text,
    vollmacht_pruefung_status text,
    vollmacht_pruefung_begruendung text,
    mietwagen_seit_datum date,
    mietwagen_limit_tage integer,
    mietwagen_limit_grund text,
    mietwagen_rechnung_vorhanden boolean DEFAULT false NOT NULL,
    mietwagen_rechnung_url text,
    mietwagen_argumentations_puffer integer DEFAULT 3 NOT NULL,
    mietwagen_vermieter text,
    schadens_hoehe_netto numeric(10,2),
    schadens_ursache text,
    zeugen_vorhanden boolean DEFAULT false NOT NULL,
    bkat_unfallart public.bkat_unfallart,
    werkstatt_seit_datum date,
    fahrzeug_fahrbereit boolean,
    fahrzeugschaden_beschreibung text,
    abrechnungsart_besprochen text,
    abrechnungsart_notiz text,
    abrechnungsart_besprochen_am timestamp with time zone,
    unfallmitteilung_status text DEFAULT 'nicht_erforderlich'::text,
    dokumente_vollstaendig_fuer_phase text,
    dokumente_vollstaendig_am_phase timestamp with time zone,
    dokumente_reminder_whatsapp_letzte_sendung timestamp with time zone,
    zb1_status text,
    kanzlei_ansprechpartner_position text,
    leasinggeber_informiert boolean DEFAULT false,
    guthaben_verrechnet_netto numeric(10,2) DEFAULT 0 NOT NULL,
    schlussabrechnung_am timestamp with time zone,
    auszahlung_gutachter_betrag numeric,
    auszahlung_gutachter_eingegangen_am timestamp with time zone,
    auszahlung_zahlungsweg text,
    sv_nachzahlung_netto numeric(10,2),
    abrechnung_id uuid,
    kanzlei_abrechnung_id uuid,
    marketing_provision numeric(10,2),
    marketing_provision_status text,
    marketing_quelle text,
    zahlungsweg text,
    kanzlei_honorar numeric(10,2),
    kanzlei_provision_status text DEFAULT 'offen'::text,
    kanzlei_provision_ausgezahlt_am timestamp with time zone,
    iban text,
    bic text,
    kontoinhaber text,
    bankdaten_hinterlegt_am timestamp with time zone,
    lead_preis_netto numeric(10,2),
    lead_preis_typ text,
    lead_preis_berechnet_am timestamp with time zone,
    CONSTRAINT chk_claims_abgeschlossen_nach_schadentag CHECK (((abgeschlossen_am IS NULL) OR ((abgeschlossen_am)::date >= schadentag))),
    CONSTRAINT chk_claims_verjaehrt_nach_schadentag CHECK (((verjaehrt_am IS NULL) OR (verjaehrt_am >= schadentag))),
    CONSTRAINT claims_anzahl_beteiligte_total_check CHECK ((anzahl_beteiligte_total >= 1)),
    CONSTRAINT claims_created_via_check CHECK ((created_via = ANY (ARRAY['lead_konvertierung'::text, 'cardentity_befund'::text, 'manuell_admin'::text, 'airdrop'::text, 'sv_anlage'::text, 'backfill_aar810_a1'::text]))),
    CONSTRAINT claims_finanzierung_leasing_check CHECK ((finanzierung_leasing = ANY (ARRAY['keine'::text, 'leasing'::text, 'finanzierung'::text]))),
    CONSTRAINT claims_kanzlei_gefragt_in_phase_check CHECK (((kanzlei_wunsch_gefragt_in_phase IS NULL) OR (kanzlei_wunsch_gefragt_in_phase = ANY (ARRAY['lead_konvertierung'::text, 'phase_4_re_frage'::text, 'kb_override'::text])))),
    CONSTRAINT claims_kanzlei_wunsch_check CHECK ((kanzlei_wunsch = ANY (ARRAY['partnerkanzlei'::text, 'eigene_kanzlei'::text, 'keine_kanzlei'::text, 'noch_unentschieden'::text, 'nicht_gefragt'::text]))),
    CONSTRAINT claims_schadenart_check CHECK ((schadenart = ANY (ARRAY['haftpflicht'::text, 'vollkasko'::text, 'teilkasko'::text, 'eigenverschulden'::text, 'unbekannt'::text]))),
    CONSTRAINT claims_status_check CHECK ((status = ANY (ARRAY['dispatch_done'::text, 'in_bearbeitung'::text, 'in_kommunikation_vs'::text, 'reguliert'::text, 'abgelehnt'::text, 'an_externe_kanzlei_uebergeben'::text, 'storniert'::text, 'reguliert_vollstaendig'::text, 'klage_rechtsstreit'::text, 'verjaehrt'::text, 'abgelehnt_final'::text]))),
    CONSTRAINT claims_vorschaden_mit_vs_abgerechnet_check CHECK ((vorschaden_mit_vs_abgerechnet = ANY (ARRAY['ja'::text, 'nein'::text, 'teilweise'::text, 'unbekannt'::text])))
);

ALTER TABLE ONLY public.claims REPLICA IDENTITY FULL;


--
-- Name: TABLE claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.claims IS 'AAR-810 A.1: Schadensereignis als eigenständiges Asset (parallel zu vehicles, faelle, gutachten). Lebenszyklus: schadentag bis verjaehrt_am. Kann ohne faelle existieren (Cardentity-Befund, Airdrop-Beitrag).';


--
-- Name: COLUMN claims.vehicle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.vehicle_id IS 'FK auf primäres vehicle des Geschädigten. Nullable in A.1, wird NOT NULL in Phase 4 / AAR-776. Multi-Vehicle-Beteiligungen via claim_vehicle_involvements.';


--
-- Name: COLUMN claims.verjaehrt_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.verjaehrt_am IS 'AAR-826: Verjährungs-Datum des Anspruchs. Typisch: schadentag + 3 Jahre. cron_verjaehrungs_warner alarmiert 90d vorher.';


--
-- Name: COLUMN claims.created_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.created_via IS 'Quelle der Claim-Anlage. Wichtig für Audit (z.B. cardentity_befund = ohne unseren Auftrag entstanden).';


--
-- Name: COLUMN claims.claim_nummer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.claim_nummer IS 'AAR-829: Human-readable Claim-ID (CLM-2026-00042). Auto-generiert via Trigger.';


--
-- Name: COLUMN claims.lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.lead_id IS 'AAR-829: FK auf leads.id — gesetzt wenn Claim aus Lead-Konversion entstand. NULL = direkt angelegt (KB-Tool, Cardentity, Airdrop).';


--
-- Name: COLUMN claims.kundenbetreuer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.kundenbetreuer_id IS 'AAR-829/831: Zugewiesener Kundenbetreuer. NULL = Phase 1_neu (Pool, noch nicht übernommen).';


--
-- Name: COLUMN claims.vs_ablehnungs_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.vs_ablehnungs_grund IS 'AAR-839: Bei status=abgelehnt — z.B. verjaehrung, vs_lehnt_ab, kein_versicherungsschutz, kunde_storniert';


--
-- Name: COLUMN claims.regulierungs_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.regulierungs_betrag IS 'AAR-839: Bei status=reguliert — Gesamt-Regulierungsbetrag in EUR (Detail in claim_payments)';


--
-- Name: COLUMN claims.endzustand_gesetzt_durch_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.endzustand_gesetzt_durch_user_id IS 'AAR-839: Audit — welcher User hat den manuellen Endzustand gesetzt (KB/Admin)';


--
-- Name: COLUMN claims.endzustand_gesetzt_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.endzustand_gesetzt_am IS 'AAR-839: Audit — Zeitstempel des manuellen Endzustand-Wechsels';


--
-- Name: COLUMN claims.endzustand_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.endzustand_grund IS 'AAR-839: Frei-Text-Begründung für Audit, immer pflicht beim manuellen Endzustand';


--
-- Name: COLUMN claims.kanzlei_wunsch; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.kanzlei_wunsch IS 'AAR-841: Onboarding-Antwort des Kunden zur Kanzlei-Frage. partnerkanzlei = LexDrive einbinden. eigene_kanzlei = Kunde nennt Anwalt. keine_kanzlei = ohne. noch_unentschieden = Re-Frage nach Phase 4. nicht_gefragt = noch keine Antwort (Default).';


--
-- Name: COLUMN claims.kunde_no_show_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.kunde_no_show_count IS 'Anzahl der verpassten Besichtigungstermine des Kunden bei diesem Claim. Inkrementiert bei jedem als verpasst markierten Termin.';


--
-- Name: COLUMN claims.letzter_no_show_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.letzter_no_show_am IS 'Zeitstempel des letzten verpassten Besichtigungstermins.';


--
-- Name: COLUMN claims.sv_no_show_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.sv_no_show_count IS 'Anzahl der Termine die der Sachverstaendige verpasst hat (sv_angekommen_am IS NULL und Termin verstrichen). Komplementaer zu kunde_no_show_count.';


--
-- Name: COLUMN claims.letzter_sv_no_show_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.letzter_sv_no_show_am IS 'Zeitstempel des letzten verpassten Termins durch den Sachverstaendigen.';


--
-- Name: COLUMN claims.brn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.brn IS 'Bundesweite Registriernummer aus ZB1-OCR (z.B. DE123456789)';


--
-- Name: COLUMN claims.zeugen_kontakte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.zeugen_kontakte IS 'Zeugen-Kontakte als JSONB-Array [{name, telefon, email, anschrift}]';


--
-- Name: COLUMN claims.spezifikation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.spezifikation IS 'Sonderausstattung / Spezifikations-Notiz des Dispatchers';


--
-- Name: COLUMN claims.vorschaden_mit_vs_abgerechnet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.vorschaden_mit_vs_abgerechnet IS 'Wurde der Vorschaden mit der Versicherung abgerechnet? Beeinflusst die Rechtslage bei der aktuellen Schadensregulierung — wenn nicht abgerechnet, bleibt der Anspruch grundsätzlich bestehen, wird aber mit dem aktuellen Schaden verrechnet.';


--
-- Name: COLUMN claims.sv_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.claims.sv_id IS 'CMM-60: native, kanonische SV-Zuweisung des Claims. Bis zur Writer-Migration (CMM-60 Schritt 3) via Trigger aus faelle.sv_id gespiegelt. auftraege.sv_id / gutachter_termine.sv_id bleiben per-Lifecycle-Detail.';


--
-- Name: claims_claim_nummer_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.claims_claim_nummer_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: communities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    beschreibung text,
    zentrum_lat numeric(10,7),
    zentrum_lng numeric(10,7),
    zentrum_adresse text,
    zentrum_plz text,
    radius_km integer,
    polygon jsonb,
    faelle_pro_monat integer DEFAULT 0 NOT NULL,
    faelle_genutzt_aktueller_monat integer DEFAULT 0 NOT NULL,
    budget_verteilung text DEFAULT 'first_come'::text NOT NULL,
    exklusiv boolean DEFAULT false NOT NULL,
    ist_aktiv boolean DEFAULT true NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    erstellt_von uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT communities_budget_verteilung_check CHECK ((budget_verteilung = ANY (ARRAY['first_come'::text, 'round_robin'::text, 'nach_naehe'::text, 'fair_share'::text]))),
    CONSTRAINT communities_faelle_genutzt_aktueller_monat_check CHECK ((faelle_genutzt_aktueller_monat >= 0)),
    CONSTRAINT communities_faelle_pro_monat_check CHECK ((faelle_pro_monat >= 0)),
    CONSTRAINT communities_radius_km_check CHECK (((radius_km IS NULL) OR (radius_km > 0)))
);


--
-- Name: TABLE communities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.communities IS 'AAR-749: Einkaufsgemeinschaft von Sachverständigen — Peer-Network mit Pool-Budget und gemeinsamem Einsatzgebiet. Mitgliedschaft über community_memberships.';


--
-- Name: COLUMN communities.polygon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.communities.polygon IS 'GeoJSON Polygon {type:"Polygon",coordinates:[[[lng,lat], ...]]} — overridet zentrum_lat/lng+radius_km falls gesetzt.';


--
-- Name: COLUMN communities.budget_verteilung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.communities.budget_verteilung IS 'first_come=wer zuerst kommt; round_robin=rotiert; nach_naehe=geografisch nächster SV; fair_share=gleichmäßig über Monat.';


--
-- Name: community_leaderboard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_leaderboard (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    sv_id uuid NOT NULL,
    zeitraum_monat integer NOT NULL,
    zeitraum_jahr integer NOT NULL,
    faelle_count integer DEFAULT 0 NOT NULL,
    umsatz_netto numeric(10,2) DEFAULT 0 NOT NULL,
    durchschnitt_bearbeitungsdauer_h numeric(6,2),
    rang integer,
    letzte_aktualisierung timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_memberships (
    community_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    rolle_in_community text DEFAULT 'mitglied'::text NOT NULL,
    beigetreten_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_memberships_rolle_in_community_check CHECK ((rolle_in_community = ANY (ARRAY['verwalter'::text, 'mitglied'::text])))
);


--
-- Name: TABLE community_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.community_memberships IS 'AAR-749: Mitgliedschaft eines SV in einer Community. rolle_in_community=verwalter darf die Community bearbeiten, mitglied nur lesen.';


--
-- Name: consent_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categories jsonb NOT NULL,
    policy_version text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_hash text NOT NULL,
    target_locale text NOT NULL,
    translated_text text NOT NULL,
    provider text DEFAULT 'anthropic'::text NOT NULL,
    model text,
    source_table text,
    source_id text,
    field text,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_translations_target_locale_check CHECK ((target_locale = ANY (ARRAY['de'::text, 'en'::text, 'tr'::text, 'ar'::text, 'ru'::text, 'pl'::text])))
);


--
-- Name: TABLE content_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.content_translations IS 'Content-adressierter MT-Cache fuer Falldaten (Anzeige-Hilfe). Original bleibt SSoT, nie rechtsverbindlich. Zugriff nur via service-role. Siehe _specs/portal-i18n CONTEXT B1/B6.';


--
-- Name: conversion_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversion_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_key text NOT NULL,
    phase_key text NOT NULL,
    event_type text NOT NULL,
    anfrage_id uuid,
    service_typ text,
    kanzlei_wunsch text,
    session_id text,
    user_agent text,
    ts timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE conversion_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conversion_events IS 'Service-Role-only (AAR-895). Marketing-Conversion-Tracking, Caller: lib/analytics/track-conversion.ts.';


--
-- Name: cron_jobs_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_jobs_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    rows_processed integer,
    error_message text,
    duration_ms integer,
    metadata_jsonb jsonb,
    CONSTRAINT cron_jobs_audit_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text, 'timeout'::text])))
);


--
-- Name: TABLE cron_jobs_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cron_jobs_audit IS 'AAR-826: Audit jedes Cron-Job-Runs. Status running/success/error/timeout. Schreibend: service_role via log_cron_job_run(). Lesend: Admin-Dashboard.';


--
-- Name: dokument_katalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokument_katalog (
    slot_id text NOT NULL,
    label text NOT NULL,
    beschreibung text,
    kategorie public.dokument_kategorie NOT NULL,
    freigeschaltet_wenn jsonb,
    pflicht_wenn jsonb,
    sichtbar_fuer text[] DEFAULT ARRAY['admin'::text] NOT NULL,
    anforderbar_von text[] DEFAULT ARRAY['admin'::text, 'kundenbetreuer'::text] NOT NULL,
    uploadbar_von text[] DEFAULT ARRAY['admin'::text, 'kundenbetreuer'::text] NOT NULL,
    multi_file boolean DEFAULT false NOT NULL,
    akzeptierte_mime_types text[] DEFAULT ARRAY['image/jpeg'::text, 'image/png'::text, 'application/pdf'::text] NOT NULL,
    max_mb integer DEFAULT 10 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    maps_to_qualifikation text,
    steuert_kundensichtbarkeit boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE dokument_katalog; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dokument_katalog IS 'Einheitlicher Katalog aller Dokument-Slots (SV-Verifizierung + Fall-Dokumente). Upload-Endpoint siehe uploadSvPflichtdokument() für SV-seitige Pflicht-Uploads. Pro Slot mit aktiv=true + uploadbar_von[] = wer darf hochladen.';


--
-- Name: COLUMN dokument_katalog.pflicht_wenn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dokument_katalog.pflicht_wenn IS 'CMM-23: Single Source für Pflicht-Status. NULL = optional. JSON-Rule wie freigeschaltet_wenn.';


--
-- Name: COLUMN dokument_katalog.maps_to_qualifikation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dokument_katalog.maps_to_qualifikation IS 'AAR-515: Wert aus QUALIFIKATIONEN-Array (constants.ts) oder Spezial-String „dat-gutachter" für den DAT-Fall (gutachter_typ). Verbindet einen Upload-Slot mit einer externen Qualifikation — wird von get_sichtbare_qualifikationen() als Join-Kriterium genutzt.';


--
-- Name: COLUMN dokument_katalog.steuert_kundensichtbarkeit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dokument_katalog.steuert_kundensichtbarkeit IS 'AAR-515: true wenn die Freigabe des Slots eine Qualifikation in Kundenkommunikation (Flow-Link, /kunde/*, Email, WhatsApp, SEO) freischaltet. Default false — Haftpflicht/Gewerbe sind Tier-2-Pflicht aber nicht extern-sichtbar-relevant.';


--
-- Name: dokument_upload_anfragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokument_upload_anfragen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    token text NOT NULL,
    slots jsonb NOT NULL,
    kanal text NOT NULL,
    status text DEFAULT 'gesendet'::text NOT NULL,
    gesendet_am timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    erstellt_von uuid,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dokument_upload_anfragen_kanal_check CHECK ((kanal = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'onboarding-wizard'::text]))),
    CONSTRAINT dokument_upload_anfragen_status_check CHECK ((status = ANY (ARRAY['gesendet'::text, 'teilweise'::text, 'komplett'::text, 'abgelaufen'::text])))
);


--
-- Name: TABLE dokument_upload_anfragen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dokument_upload_anfragen IS 'AAR-352: Multi-Slot-Upload-Anfragen (ZB1 + Polizeibericht + sonstige in einem Link).';


--
-- Name: COLUMN dokument_upload_anfragen.slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dokument_upload_anfragen.slots IS 'JSONB-Array: [{slot_id, ocr?, hochgeladen, doc_url?, hochgeladen_am?}]';


--
-- Name: dsgvo_loeschauftraege; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsgvo_loeschauftraege (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    status text DEFAULT 'eingereicht'::text NOT NULL,
    grund text,
    eingereicht_am timestamp with time zone DEFAULT now() NOT NULL,
    eingereicht_von text DEFAULT 'self_service'::text NOT NULL,
    bestaetigt_am timestamp with time zone,
    bestaetigt_von_user_id uuid,
    ausgefuehrt_am timestamp with time zone,
    abgelehnt_grund text,
    audit_payload jsonb,
    CONSTRAINT chk_bestaetigt_logic CHECK (((status = ANY (ARRAY['eingereicht'::text, 'storniert'::text, 'abgelehnt'::text])) OR ((status = ANY (ARRAY['bestaetigt'::text, 'ausgefuehrt'::text])) AND (bestaetigt_am IS NOT NULL)))),
    CONSTRAINT dsgvo_loeschauftraege_eingereicht_von_check CHECK ((eingereicht_von = ANY (ARRAY['self_service'::text, 'email_anfrage'::text, 'admin_manuell'::text]))),
    CONSTRAINT dsgvo_loeschauftraege_status_check CHECK ((status = ANY (ARRAY['eingereicht'::text, 'bestaetigt'::text, 'ausgefuehrt'::text, 'abgelehnt'::text, 'storniert'::text])))
);


--
-- Name: TABLE dsgvo_loeschauftraege; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dsgvo_loeschauftraege IS 'DSGVO Art. 17 Loesch-Antraege. 14d-Karenz nach Bestaetigung. Cron fuehrt aus.';


--
-- Name: email_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    empfaenger text NOT NULL,
    empfaenger_typ text NOT NULL,
    template text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    message_id text,
    fehler text,
    versuche integer DEFAULT 0 NOT NULL,
    attachments jsonb,
    gesendet_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid,
    richtung text DEFAULT 'outbound'::text NOT NULL,
    gesendet_von_user_id uuid,
    provider text DEFAULT 'unknown'::text NOT NULL,
    CONSTRAINT email_log_empfaenger_typ_check CHECK ((empfaenger_typ = ANY (ARRAY['kunde'::text, 'sv'::text, 'kanzlei'::text, 'admin'::text]))),
    CONSTRAINT email_log_provider_check CHECK ((provider = ANY (ARRAY['resend'::text, 'google_smtp'::text, 'unknown'::text]))),
    CONSTRAINT email_log_richtung_check CHECK ((richtung = ANY (ARRAY['outbound'::text, 'inbound'::text]))),
    CONSTRAINT email_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'bounced'::text])))
);


--
-- Name: email_otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verifiziert_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE email_otp_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_otp_codes IS 'AAR-494: 6-stellige OTP-Codes für Email-2FA. Hash-only, 5 Min TTL, 3/h Rate-Limit.';


--
-- Name: embed_abrechnung_positionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embed_abrechnung_positionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abrechnung_id uuid NOT NULL,
    embed_site_id uuid NOT NULL,
    anfrage_id uuid,
    termin_id uuid,
    einzelpreis_eur numeric(10,2) DEFAULT 70.00 NOT NULL,
    leistung_text text NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE embed_abrechnung_positionen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.embed_abrechnung_positionen IS 'AAR-939 Monika-Embed: Einzelpositionen (70 Euro/Termin) zur Monats-Sammelrechnung. Kopf = abrechnungen(empfaenger_typ=sv). Partieller UNIQUE(anfrage_id) sperrt Doppelabrechnung.';


--
-- Name: embed_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embed_sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    inhaber_profile_id uuid NOT NULL,
    sv_id uuid,
    name text NOT NULL,
    variante text DEFAULT 'A'::text NOT NULL,
    einzelpreis_eur numeric(10,2) DEFAULT 70.00 NOT NULL,
    brand_primary_override text,
    brand_secondary_override text,
    brand_accent_override text,
    brand_logo_url_override text,
    empfaenger_email text DEFAULT 'info@claimondo.de'::text NOT NULL,
    cc_email text,
    baileys_routing_nummer text NOT NULL,
    erlaubte_domains text[] DEFAULT '{}'::text[] NOT NULL,
    max_anfragen_pro_h integer DEFAULT 20 NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    paused_grund text,
    agb_akzeptiert_am timestamp with time zone,
    agb_version text,
    tracking_webhook_url text,
    tracking_webhook_secret text,
    tracking_ga4_measurement_id text,
    tracking_gads_customer_id text,
    anfragen_gesamt integer DEFAULT 0 NOT NULL,
    letzte_anfrage_am timestamp with time zone,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT embed_sites_variante_check CHECK ((variante = ANY (ARRAY['A'::text, 'B'::text])))
);


--
-- Name: TABLE embed_sites; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.embed_sites IS 'AAR-939 Monika-Embed: SV-konfigurierte Quell-Seite. variante A=free/Capture, B=70 Euro/Termin. Theme-Overrides NULL=erbt sachverstaendige.brand_*. Writes nur service_role.';


--
-- Name: faelle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faelle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    kunde_id uuid,
    status public.fall_status DEFAULT 'ersterfassung'::public.fall_status NOT NULL,
    betreuungspaket public.betreuungspaket DEFAULT 'vollservice'::public.betreuungspaket,
    abtretung_pdf text,
    vollmacht_pdf text,
    abtretung_signiert_am timestamp with time zone,
    vollmacht_signiert_am timestamp with time zone,
    sv_id uuid,
    sv_zugewiesen_am timestamp with time zone,
    gutachten_eingegangen_am timestamp with time zone,
    gutachten_betrag numeric(10,2),
    anschlussschreiben_am timestamp with time zone,
    regulierung_am timestamp with time zone,
    filmcheck_ok boolean DEFAULT false,
    filmcheck_am timestamp with time zone,
    filmcheck_notizen text,
    notizen text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    kennzeichen text,
    fahrzeug_typ text,
    fahrzeug_hersteller text,
    fahrzeug_modell text,
    fahrzeug_baujahr integer,
    gegner_name text,
    gegner_versicherung text,
    gegner_kennzeichen text,
    ust_id text,
    leasinggeber_name text,
    leasinggeber_informiert boolean DEFAULT false,
    bank_name text,
    prioritaet text DEFAULT 'normal'::text,
    onboarding_complete boolean DEFAULT false,
    dispatch_id uuid,
    konvertiert_am timestamp with time zone,
    status_changed_at timestamp with time zone DEFAULT now(),
    regulierung_angekuendigt_am timestamp with time zone,
    zahlung_eingegangen_am timestamp with time zone,
    google_review_gesendet boolean DEFAULT false,
    vs_eskalationsstufe text DEFAULT 'vs-01'::text,
    fin_quelle text,
    fin_extrahiert_am timestamp with time zone,
    vorschaden_geprueft boolean DEFAULT false,
    vorschaden_anzahl integer,
    vorschaden_letzter_datum date,
    vorschaden_typ_a_ergebnis jsonb,
    vorschaden_typ_b_bericht jsonb,
    vorschaden_typ_b_pdf_url text,
    cardentity_abfrage_am timestamp with time zone,
    schadens_hoehe_netto numeric(10,2),
    nutzungsausfall_tagessatz numeric(10,2),
    reparaturdauer_tage integer,
    gutachter_honorar numeric(10,2),
    ocr_extrahiert_am timestamp with time zone,
    ocr_rohdaten jsonb,
    ki_kalkulation jsonb,
    ki_kalkulation_am timestamp with time zone,
    ki_geschaetzte_kosten_min numeric(10,2),
    ki_geschaetzte_kosten_max numeric(10,2),
    kanzlei_ansprechpartner_position text,
    mandatsnummer text,
    losfahren_erinnerung_gesendet boolean DEFAULT false,
    termin_erinnerung_5min_gesendet boolean DEFAULT false,
    geschaetzte_fahrzeit_min integer,
    geschaetzte_fahrdistanz_km numeric(6,1),
    gcal_event_id text,
    gutachten_vorhanden boolean DEFAULT false,
    gutachten_hochgeladen_am timestamp with time zone,
    gutachten_positionen jsonb,
    gutachten_nummer text,
    reparaturkosten numeric(10,2),
    wertminderung numeric(10,2),
    nutzungsausfall_gesamt numeric(10,2),
    regulierungsweise text,
    sa_unterschrieben boolean DEFAULT false,
    sa_unterschrieben_am timestamp with time zone,
    sa_pdf_url text,
    sa_unterschrift_url text,
    datenschutz_akzeptiert boolean DEFAULT false,
    datenschutz_akzeptiert_am timestamp with time zone,
    vollmacht_status text DEFAULT 'ausstehend'::text,
    unfallmitteilung_status text DEFAULT 'nicht_erforderlich'::text,
    interne_notizen text,
    anschlussschreiben_url text,
    anschlussschreiben_sendedatum date,
    anschlussschreiben_unterschrift boolean DEFAULT false,
    anschlussschreiben_ocr_am timestamp with time zone,
    besichtigungsort_adresse text,
    besichtigungsort_lat numeric(10,7),
    besichtigungsort_lng numeric(10,7),
    besichtigungsort_place_id text,
    ist_aktiv boolean DEFAULT true,
    deaktiviert_am timestamp with time zone,
    deaktiviert_grund text,
    deaktiviert_notiz text,
    szenario text DEFAULT 'normalfall'::text,
    ruege_erhalten_am timestamp with time zone,
    ruege_grund text,
    fahrzeug_farbe text,
    erstzulassung text,
    kilometerstand integer,
    firma_name text,
    marketing_quelle text,
    marketing_provision numeric(10,2),
    marketing_provision_status text,
    gutachten_stundensatz numeric(10,2),
    kanzlei_id uuid,
    kanzlei_honorar numeric(10,2),
    zahlung_erwartet_am date,
    zahlung_betrag numeric(10,2),
    lead_preis_netto numeric(10,2),
    lead_preis_typ text,
    lead_preis_berechnet_am timestamp with time zone,
    guthaben_verrechnet_netto numeric(10,2) DEFAULT 0 NOT NULL,
    sv_nachzahlung_netto numeric(10,2),
    abrechnung_id uuid,
    storniert_am timestamp with time zone,
    storno_grund text,
    storno_durch_user_id uuid,
    no_show_gemeldet_am timestamp with time zone,
    organisation_id uuid,
    dokumente_vollstaendig_fuer_phase text,
    dokumente_vollstaendig_am_phase timestamp with time zone,
    gegner_anzahl_beteiligte integer DEFAULT 1,
    gegner_fahrzeugtyp text,
    dokumente_reminder_whatsapp_letzte_sendung timestamp with time zone,
    fin_vin text,
    source_channel text,
    source_domain text,
    schadens_ursache text,
    kanzlei_abrechnung_id uuid,
    kanzlei_provision_status text DEFAULT 'offen'::text,
    kanzlei_provision_ausgezahlt_am timestamp with time zone,
    service_typ text DEFAULT 'komplett'::text NOT NULL,
    vs_reaktion_typ text,
    vs_reaktion_am timestamp with time zone,
    ruege_gesendet_am timestamp with time zone,
    ruege_betrag numeric(10,2),
    kuerzungs_betrag numeric(10,2),
    vs_frist_bis timestamp with time zone,
    ruege_counter integer DEFAULT 0,
    schlussabrechnung_am timestamp with time zone,
    iban text,
    bic text,
    kontoinhaber text,
    bankdaten_hinterlegt_am timestamp with time zone,
    ist_fahrzeughalter boolean DEFAULT true,
    halter_vorname text,
    halter_nachname text,
    halter_strasse text,
    halter_plz text,
    halter_stadt text,
    halter_telefon text,
    halter_email text,
    zahlungsweg text,
    hat_vorschaeden boolean DEFAULT false,
    vorschaeden_beschreibung text,
    technische_stellungnahme_status text DEFAULT 'nicht-angefordert'::text,
    technische_stellungnahme_beauftragt_am timestamp with time zone,
    technische_stellungnahme_hochgeladen_am timestamp with time zone,
    technische_stellungnahme_freigabe_am timestamp with time zone,
    nachbesichtigung_status text DEFAULT 'nicht-angefordert'::text,
    nachbesichtigung_angefordert_am timestamp with time zone,
    nachbesichtigung_termin_datum timestamp with time zone,
    nachbesichtigung_konfrontation boolean DEFAULT false,
    as_geforderte_summe numeric,
    as_frist date,
    as_vs_reaktion_text text,
    as_salesforce_id text,
    as_zuletzt_synced_am timestamp with time zone,
    lexdrive_case_id text,
    eskalation_tag_14_am timestamp with time zone,
    eskalation_tag_21_am timestamp with time zone,
    eskalation_tag_28_am timestamp with time zone,
    fahrzeug_ausstattung jsonb,
    cardentity_enriched_at timestamp with time zone,
    cardentity_report jsonb,
    vollmacht_geprueft_am timestamp with time zone,
    vollmacht_geprueft_von text,
    vollmacht_pruefung_status text,
    vollmacht_pruefung_begruendung text,
    lexdrive_ocr_data jsonb,
    lexdrive_ocr_received_at timestamp with time zone,
    vs_kuerzung_grund text,
    geschlossen_grund text,
    nachbesichtigung_ergebnis text,
    bevorzugter_kanal text,
    werkstatt_seit_datum date,
    fahrzeug_fahrbereit boolean,
    mietwagen_kanzlei_informiert boolean DEFAULT false,
    mietwagen_kanzlei_informiert_am timestamp with time zone,
    halter_geburtsdatum date,
    abrechnungsart_besprochen text,
    abrechnungsart_notiz text,
    abrechnungsart_besprochen_am timestamp with time zone,
    gegner_versicherung_anfrage_datum date,
    sprache text DEFAULT 'de'::text,
    zeugen_vorhanden boolean DEFAULT false NOT NULL,
    vorschaden_erkannt boolean DEFAULT false NOT NULL,
    sv_termin_dokument_reminder_gesendet_am timestamp with time zone,
    kundenbetreuer_fallback_flag boolean DEFAULT false NOT NULL,
    kundenbetreuer_zugewiesen_am timestamp with time zone,
    sv_briefing_text text,
    sv_briefing_generated_at timestamp with time zone,
    sv_briefing_model text,
    sv_briefing_version integer DEFAULT 0 NOT NULL,
    sv_briefing_struktur jsonb,
    sv_notizen_vor_ort text,
    makler_id uuid,
    halter_name text GENERATED ALWAYS AS (NULLIF(TRIM(BOTH FROM ((COALESCE(halter_vorname, ''::text) || ' '::text) || COALESCE(halter_nachname, ''::text))), ''::text)) STORED,
    wunschtermin timestamp with time zone,
    vs_quote_prozent numeric(5,2),
    vs_quote_grund text,
    vs_quote_akzeptiert_am timestamp with time zone,
    vs_quote_betrag_ausgezahlt numeric(10,2),
    vs_kuerzungs_typ text,
    auszahlung_kunde_betrag numeric(10,2),
    auszahlung_kunde_eingegangen_am timestamp with time zone,
    auszahlung_gutachter_eingegangen_am timestamp with time zone,
    auszahlung_zahlungsweg text,
    eskalation_tag_14_ergebnis text,
    eskalation_tag_14_ergebnis_am timestamp with time zone,
    eskalation_tag_14_ergebnis_von uuid,
    eskalation_tag_21_ergebnis text,
    eskalation_tag_21_ergebnis_am timestamp with time zone,
    eskalation_tag_21_ergebnis_von uuid,
    eskalation_tag_28_ergebnis text,
    eskalation_tag_28_ergebnis_am timestamp with time zone,
    eskalation_tag_28_ergebnis_von uuid,
    nachbesichtigung_kunde_termin_vorschlaege jsonb DEFAULT '[]'::jsonb,
    nachbesichtigung_kunde_termin_eingereicht_am timestamp with time zone,
    nachbesichtigung_sv_konfrontation_gewuenscht boolean,
    nachbesichtigung_sv_termin_vereinbart_am timestamp with time zone,
    auszahlung_gutachter_betrag numeric,
    ruege_frist_tage integer DEFAULT 14,
    klage_uebergeben_am timestamp with time zone,
    fallakte_angelegt_am timestamp with time zone,
    kunde_vorname text,
    kunde_nachname text,
    kunde_telefon text,
    kunde_strasse text,
    kunde_plz text,
    kunde_stadt text,
    kunde_adresse text,
    kunde_lat numeric,
    kunde_lng numeric,
    hsn text,
    tsn text,
    technische_stellungnahme_notiz_sv text,
    zb1_status text,
    bkat_unfallart public.bkat_unfallart,
    fahrzeugschaden_beschreibung text,
    mietwagen_seit_datum date,
    mietwagen_limit_tage integer,
    mietwagen_limit_grund text,
    mietwagen_rechnung_vorhanden boolean DEFAULT false NOT NULL,
    mietwagen_rechnung_url text,
    mietwagen_argumentations_puffer integer DEFAULT 3 NOT NULL,
    mietwagen_vermieter text,
    claim_id uuid NOT NULL,
    lackfarbe_code text,
    besichtigung_gestartet_am timestamp with time zone,
    kunde_match_via text,
    eskaliert_an_admin_id uuid,
    eskaliert_am timestamp with time zone,
    eskaliert_grund text,
    kennzeichen_kreis text,
    kennzeichen_buchstaben text,
    kennzeichen_zahl text,
    kennzeichen_suffix text,
    fahrzeug_aufbau text,
    google_review_prompt_gezeigt_am timestamp with time zone,
    besichtigungsort_notiz text,
    re_termin_token uuid,
    re_termin_token_eingelaufen_am timestamp with time zone,
    re_termin_eskalation_an_kb_am timestamp with time zone,
    CONSTRAINT check_gegner_fahrzeugtyp CHECK (((gegner_fahrzeugtyp IS NULL) OR (gegner_fahrzeugtyp = ANY (ARRAY['pkw'::text, 'lkw'::text, 'transporter'::text, 'motorrad'::text, 'fahrrad'::text, 'fussgaenger'::text, 'bus'::text, 'sonstiges'::text])))),
    CONSTRAINT faelle_abrechnungsart_besprochen_check CHECK (((abrechnungsart_besprochen IS NULL) OR (abrechnungsart_besprochen = ANY (ARRAY['fiktiv'::text, 'konkret'::text, 'noch-offen'::text])))),
    CONSTRAINT faelle_auszahlung_zahlungsweg_check CHECK (((auszahlung_zahlungsweg IS NULL) OR (auszahlung_zahlungsweg = ANY (ARRAY['banktransfer_direkt'::text, 'fremdkonto_kanzlei'::text, 'sammelueberweisung'::text])))),
    CONSTRAINT faelle_bevorzugter_kanal_check CHECK (((bevorzugter_kanal IS NULL) OR (bevorzugter_kanal = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text])))),
    CONSTRAINT faelle_fahrzeug_aufbau_chk CHECK (((fahrzeug_aufbau IS NULL) OR (fahrzeug_aufbau = ANY (ARRAY['limousine'::text, 'kombi'::text, 'suv'::text, 'coupe'::text, 'cabrio'::text, 'transporter'::text, 'caravan'::text, 'motorrad'::text, 'oldtimer'::text, 'lkw'::text, 'sonstiges'::text])))),
    CONSTRAINT faelle_kanzlei_provision_status_check CHECK ((kanzlei_provision_status = ANY (ARRAY['offen'::text, 'berechtigt'::text, 'abgerechnet'::text, 'ausgezahlt'::text]))),
    CONSTRAINT faelle_kennzeichen_suffix_chk CHECK (((kennzeichen_suffix IS NULL) OR (kennzeichen_suffix = ANY (ARRAY['E'::text, 'H'::text])))),
    CONSTRAINT faelle_lackfarbe_code_check CHECK (((lackfarbe_code IS NULL) OR (lackfarbe_code = ANY (ARRAY['schwarz'::text, 'weiss'::text, 'silber'::text, 'grau'::text, 'blau'::text, 'rot'::text, 'gruen'::text, 'gelb'::text, 'orange'::text, 'braun'::text, 'beige'::text, 'sonstige'::text])))),
    CONSTRAINT faelle_marketing_provision_status_check CHECK (((marketing_provision_status = ANY (ARRAY['offen'::text, 'ausgezahlt'::text])) OR (marketing_provision_status IS NULL))),
    CONSTRAINT faelle_mietwagen_argumentations_puffer_check CHECK ((mietwagen_argumentations_puffer >= 0)),
    CONSTRAINT faelle_mietwagen_limit_tage_check CHECK (((mietwagen_limit_tage IS NULL) OR (mietwagen_limit_tage > 0))),
    CONSTRAINT faelle_nachbesichtigung_status_check CHECK ((nachbesichtigung_status = ANY (ARRAY['nicht-angefordert'::text, 'angefordert'::text, 'termin-gewaehlt'::text, 'durchgefuehrt'::text, 'ergebnis-eingegangen'::text]))),
    CONSTRAINT faelle_service_typ_check CHECK ((service_typ = ANY (ARRAY['komplett'::text, 'nur_gutachter'::text]))),
    CONSTRAINT faelle_sprache_check CHECK ((sprache = ANY (ARRAY['de'::text, 'tr'::text, 'ar'::text, 'ru'::text, 'pl'::text, 'en'::text, 'other'::text]))),
    CONSTRAINT faelle_szenario_check CHECK (((szenario IS NULL) OR (szenario = ANY (ARRAY['normalfall'::text, 'ruegefall'::text, 'klagefall'::text, 'haftpflicht_eindeutig'::text, 'haftpflicht_strittig'::text, 'bewertung'::text, 'leasingrueckgabe'::text, 'totalschaden'::text, 'gerichtsgutachten'::text])))),
    CONSTRAINT faelle_technische_stellungnahme_status_check CHECK ((technische_stellungnahme_status = ANY (ARRAY['nicht-angefordert'::text, 'beauftragt'::text, 'hochgeladen'::text, 'freigegeben'::text, 'abgelehnt'::text]))),
    CONSTRAINT faelle_vollmacht_pruefung_status_check CHECK ((vollmacht_pruefung_status = ANY (ARRAY['akzeptiert'::text, 'abgelehnt'::text, 'nachfrage'::text]))),
    CONSTRAINT faelle_vs_eskalationsstufe_check CHECK ((vs_eskalationsstufe = ANY (ARRAY['vs-01'::text, 'vs-02'::text, 'vs-03'::text, 'vs-04'::text, 'vs-05'::text, 'vs-06'::text, 'vs-07'::text]))),
    CONSTRAINT faelle_vs_kuerzungs_typ_check CHECK (((vs_kuerzungs_typ IS NULL) OR (vs_kuerzungs_typ = ANY (ARRAY['technisch'::text, 'argumentativ'::text, 'gemischt'::text])))),
    CONSTRAINT faelle_vs_reaktion_typ_check CHECK (((vs_reaktion_typ IS NULL) OR (vs_reaktion_typ = ANY (ARRAY['voll_reguliert'::text, 'gekuerzt'::text, 'abgelehnt'::text, 'mehr_zeit'::text, 'nachbesichtigung'::text, 'quotiert'::text])))),
    CONSTRAINT faelle_zahlungsweg_check CHECK ((zahlungsweg = ANY (ARRAY['kundenkonto'::text, 'werkstatt_direkt'::text])))
);

ALTER TABLE ONLY public.faelle REPLICA IDENTITY FULL;


--
-- Name: COLUMN faelle.regulierung_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.regulierung_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.zahlungseingang_am. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.kennzeichen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kennzeichen IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.kennzeichen. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fahrzeug_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_typ IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.typ. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fahrzeug_hersteller; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_hersteller IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.hersteller. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fahrzeug_modell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_modell IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.modell. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fahrzeug_baujahr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_baujahr IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.baujahr. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.gegner_versicherung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.gegner_versicherung IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.versicherung. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.gegner_kennzeichen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.gegner_kennzeichen IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: claim_parties.kennzeichen. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.regulierung_angekuendigt_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.regulierung_angekuendigt_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_eskalationsstufe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_eskalationsstufe IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz (Lifecycle). Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fin_quelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fin_quelle IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fin_quelle. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fin_extrahiert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fin_extrahiert_am IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fin_extrahiert_am. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vorschaden_geprueft; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_geprueft IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_geprueft. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vorschaden_anzahl; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_anzahl IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_anzahl. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vorschaden_letzter_datum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_letzter_datum IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_letzter_datum. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vorschaden_typ_a_ergebnis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_typ_a_ergebnis IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_typ_a_ergebnis. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vorschaden_typ_b_bericht; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_typ_b_bericht IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_typ_b_bericht. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vorschaden_typ_b_pdf_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_typ_b_pdf_url IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_typ_b_pdf_url. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.cardentity_abfrage_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.cardentity_abfrage_am IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.cardentity_abfrage_am. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.schadens_hoehe_netto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.schadens_hoehe_netto IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten.gesamt_schadensbetrag. Drop in C.1.c nach Code-Cleanup.';


--
-- Name: COLUMN faelle.nutzungsausfall_tagessatz; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nutzungsausfall_tagessatz IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.tagespreis_netto. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.reparaturdauer_tage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.reparaturdauer_tage IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: repairs.geplanter_beginn+abgeschlossen_am. Drop in C.1.c nach Code-Cleanup.';


--
-- Name: COLUMN faelle.gutachter_honorar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.gutachter_honorar IS 'Soll-Honorar SV (unverändert seit Fallanlage)';


--
-- Name: COLUMN faelle.reparaturkosten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.reparaturkosten IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: repairs.tatsaechliche_kosten. Drop in C.1.c nach Code-Cleanup.';


--
-- Name: COLUMN faelle.wertminderung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.wertminderung IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten_positionen. Drop in C.1.c nach Code-Cleanup.';


--
-- Name: COLUMN faelle.nutzungsausfall_gesamt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nutzungsausfall_gesamt IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.gesamtkosten_netto. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.regulierungsweise; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.regulierungsweise IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.zahlungsweg. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.ruege_erhalten_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.ruege_erhalten_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.ruege_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.ruege_grund IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.betreff. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fahrzeug_farbe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_farbe IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.farbe. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.erstzulassung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.erstzulassung IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.erstzulassung. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.kilometerstand; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kilometerstand IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.kilometerstand. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.zahlung_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.zahlung_betrag IS 'Kanzlei → Kunde: Auszahlung an Kunden nach Abzug Kanzlei-Honorar + ggf. gutachter_honorar. Gefüllt wenn zahlung_eingegangen_am beim Kunden eintrifft. Ersetzt NICHT regulierung_betrag (das ist der VS-Betrag, zahlung ist Netto-Kunde).';


--
-- Name: COLUMN faelle.fin_vin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fin_vin IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fin_vin. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_reaktion_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_reaktion_typ IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_reaktion_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_reaktion_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.datum. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.ruege_gesendet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.ruege_gesendet_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.ruege_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.ruege_betrag IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.kuerzungs_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kuerzungs_betrag IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.differenz_betrag. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_frist_bis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_frist_bis IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.ruege_counter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.ruege_counter IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz (COUNT). Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_vorname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_vorname IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_vorname. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_nachname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_nachname IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_nachname. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_strasse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_strasse IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_strasse. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_plz; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_plz IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_plz. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_stadt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_stadt IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_stadt. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_telefon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_telefon IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_telefon. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_email IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_email. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.hat_vorschaeden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.hat_vorschaeden IS 'User-Self-Report beim Schaden-Melden: "Gab es frühere Schäden?". Default false. NICHT Truth — kann gegen vorschaden_erkannt abweichen (dann lügt User oder CardEntity hat was gefunden).';


--
-- Name: COLUMN faelle.nachbesichtigung_konfrontation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nachbesichtigung_konfrontation IS 'Realität: war SV vor Ort?';


--
-- Name: COLUMN faelle.as_geforderte_summe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.as_geforderte_summe IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.as_frist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.as_frist IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.as_vs_reaktion_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.as_vs_reaktion_text IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.notiz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.as_salesforce_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.as_salesforce_id IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.aktenzeichen. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.as_zuletzt_synced_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.as_zuletzt_synced_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fahrzeug_ausstattung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_ausstattung IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.ausstattung_jsonb. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.cardentity_enriched_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.cardentity_enriched_at IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.cardentity_enriched_at. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.cardentity_report; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.cardentity_report IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.cardentity_report_jsonb. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_kuerzung_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_kuerzung_grund IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.notiz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.geschlossen_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.geschlossen_grund IS 'AAR-161 W1: Grund beim Fall-Abschluss (abgeschlossen / mit Klage / storniert)';


--
-- Name: COLUMN faelle.nachbesichtigung_ergebnis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nachbesichtigung_ergebnis IS 'AAR-161 W1: Ergebnis der Nachbesichtigung (reguliert/kuerzt/ablehnt)';


--
-- Name: COLUMN faelle.bevorzugter_kanal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.bevorzugter_kanal IS 'AAR-183: Letzter erfolgreicher Kanal — wird als Primary beim nächsten Send genutzt.';


--
-- Name: COLUMN faelle.werkstatt_seit_datum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.werkstatt_seit_datum IS 'AAR-305: Gespiegelt vom Lead beim Fall-Anlegen.';


--
-- Name: COLUMN faelle.fahrzeug_fahrbereit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_fahrbereit IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fahrbereit. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_kanzlei_informiert; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_kanzlei_informiert IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.notiz. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_kanzlei_informiert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_kanzlei_informiert_am IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.notiz. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.halter_geburtsdatum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_geburtsdatum IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_geburtsdatum. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.abrechnungsart_besprochen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.abrechnungsart_besprochen IS 'AAR-315: Was der SV nach Besichtigung mit dem Kunden zur Abrechnungsart besprochen hat. fiktiv|konkret|noch-offen.';


--
-- Name: COLUMN faelle.abrechnungsart_notiz; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.abrechnungsart_notiz IS 'AAR-315: Freitext-Notiz vom SV (z.B. „Kunde will erst nachdenken, ruft zurück").';


--
-- Name: COLUMN faelle.gegner_versicherung_anfrage_datum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.gegner_versicherung_anfrage_datum IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.datum. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sprache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sprache IS 'AAR-316: Aus leads.sprache übernommen — steuert Portal-Übersetzungen.';


--
-- Name: COLUMN faelle.zeugen_vorhanden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.zeugen_vorhanden IS 'AAR-321: Aus leads.zeugen_vorhanden beim Fall-Anlegen kopiert; nachträglich via KB editierbar.';


--
-- Name: COLUMN faelle.vorschaden_erkannt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vorschaden_erkannt IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_erkannt. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sv_termin_dokument_reminder_gesendet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_termin_dokument_reminder_gesendet_am IS 'AAR-354: Zeitpunkt des 24h-vor-SV-Termin WhatsApp-Reminders bei offenen Pflichtdokumenten. NULL = noch nicht gesendet.';


--
-- Name: COLUMN faelle.kundenbetreuer_fallback_flag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kundenbetreuer_fallback_flag IS 'AAR-427: True wenn kundenbetreuer_id via Admin-Fallback gesetzt wurde (kein KB verfügbar zum Zuweisungs-Zeitpunkt). Hilft bei KB-Kapazitätsplanung.';


--
-- Name: COLUMN faelle.kundenbetreuer_zugewiesen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kundenbetreuer_zugewiesen_am IS 'AAR-427: Zeitpunkt der (ersten) KB-Zuweisung. Wird beim Wechsel nicht aktualisiert — separate Audit-Timeline übernimmt Verlaufs-Tracking.';


--
-- Name: COLUMN faelle.sv_briefing_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_briefing_text IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles (SV-Briefing). Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sv_briefing_generated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_briefing_generated_at IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sv_briefing_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_briefing_model IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sv_briefing_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_briefing_version IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sv_briefing_struktur; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_briefing_struktur IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.sv_notizen_vor_ort; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.sv_notizen_vor_ort IS 'AAR-386: SV-spezifische Vor-Ort-Notizen aus dem Fokus-Modus (Feldmodus-Fallakte). Getrennt von faelle.notizen.';


--
-- Name: COLUMN faelle.halter_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.halter_name IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_name. Drop in C.1.a nach Code-Cleanup.';


--
-- Name: COLUMN faelle.wunschtermin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.wunschtermin IS 'Kunden-Wunschtermin für SV-Besichtigung (timestamptz, analog leads.wunschtermin). Source aus Lead-Qualifizierung (Phase 2 Termin/Service-Typ). Seit AAR-555 A: text → timestamptz für Type-Konsistenz mit leads.';


--
-- Name: COLUMN faelle.vs_quote_prozent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_quote_prozent IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_quote_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_quote_grund IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.notiz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_quote_akzeptiert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_quote_akzeptiert_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.zahlungseingang_am. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_quote_betrag_ausgezahlt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_quote_betrag_ausgezahlt IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.erhaltener_betrag. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.vs_kuerzungs_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.vs_kuerzungs_typ IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.auszahlung_kunde_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.auszahlung_kunde_betrag IS 'Ist-Eingang Kunden-Anteil';


--
-- Name: COLUMN faelle.auszahlung_kunde_eingegangen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.auszahlung_kunde_eingegangen_am IS 'Ist-Datum Eingang Kunde';


--
-- Name: COLUMN faelle.auszahlung_gutachter_eingegangen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.auszahlung_gutachter_eingegangen_am IS 'Ist-Datum Eingang SV';


--
-- Name: COLUMN faelle.nachbesichtigung_kunde_termin_vorschlaege; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nachbesichtigung_kunde_termin_vorschlaege IS 'JSONB Array [{datum, uhrzeit}] vom Kunden';


--
-- Name: COLUMN faelle.nachbesichtigung_sv_konfrontation_gewuenscht; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nachbesichtigung_sv_konfrontation_gewuenscht IS 'Kunden-Wunsch: SV soll vor Ort sein';


--
-- Name: COLUMN faelle.nachbesichtigung_sv_termin_vereinbart_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.nachbesichtigung_sv_termin_vereinbart_am IS 'SV hat den Termin bestätigt';


--
-- Name: COLUMN faelle.auszahlung_gutachter_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.auszahlung_gutachter_betrag IS 'SV-Auszahlungs-Betrag. SICHTBAR im SV-Portal (AAR-559). NICHT sichtbar im Kunde-Portal (Regel #26 Column-Level-Filter).';


--
-- Name: COLUMN faelle.ruege_frist_tage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.ruege_frist_tage IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.klage_uebergeben_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.klage_uebergeben_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.datum (kanal=portal, richtung=ausgehend). Drop in C.1.d nach Code-Cleanup.';


--
-- Name: COLUMN faelle.fallakte_angelegt_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fallakte_angelegt_am IS 'Zeitpunkt der Fallakte-Anlage (aus SA-Signatur oder manuell). Kann abweichen von created_at.';


--
-- Name: COLUMN faelle.kunde_vorname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kunde_vorname IS 'AAR-575: Kunde-Vorname bei ist_fahrzeughalter=false';


--
-- Name: COLUMN faelle.kunde_strasse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kunde_strasse IS 'AAR-575: Anschrift bei Kunde ≠ Halter';


--
-- Name: COLUMN faelle.hsn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.hsn IS 'AAR-576: Herstellerschlüsselnummer aus ZB1-OCR (oder Admin-Inline-Edit). Blocker für DAT-API.';


--
-- Name: COLUMN faelle.tsn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.tsn IS 'AAR-576: Typschlüsselnummer aus ZB1-OCR (oder Admin-Inline-Edit). Blocker für DAT-API.';


--
-- Name: COLUMN faelle.zb1_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.zb1_status IS 'AAR-630/AAR-182: Upload-Workflow-Status.';


--
-- Name: COLUMN faelle.bkat_unfallart; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.bkat_unfallart IS 'AAR-504/505: BKat-konforme Unfallart-Klassifikation (15 Werte). Wird aus leads.bkat_unfallart beim convertLeadToFall uebernommen.';


--
-- Name: COLUMN faelle.fahrzeugschaden_beschreibung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeugschaden_beschreibung IS 'AAR-665: Was ist am eigenen Fahrzeug kaputt. Kommt aus leads.fahrzeugschaden_beschreibung via convertLeadToFall.';


--
-- Name: COLUMN faelle.mietwagen_seit_datum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_seit_datum IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.beginn_datum. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_limit_tage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_limit_tage IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen (Endberechnung). Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_limit_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_limit_grund IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.notiz. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_rechnung_vorhanden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_rechnung_vorhanden IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_rechnung_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_rechnung_url IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_argumentations_puffer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_argumentations_puffer IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.mietwagen_vermieter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.mietwagen_vermieter IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.anbieter. Drop in C.1.b nach Code-Cleanup.';


--
-- Name: COLUMN faelle.claim_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.claim_id IS 'AAR-810 A.1: FK auf claims. Jeder fall MUSS einen claim haben (NOT NULL ab Phase A.6). Ein claim kann mehrere oder keinen fall haben.';


--
-- Name: COLUMN faelle.lackfarbe_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.lackfarbe_code IS 'CMM-32: Strukturierter Code fuer Imagin-Render-Mapping (analog leads.lackfarbe_code, vom Lead vererbt).';


--
-- Name: COLUMN faelle.besichtigung_gestartet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.besichtigung_gestartet_am IS 'Denormalisiert aus gutachter_termine.besichtigung_gestartet_am des aktiven sv_begutachtung-Termins. Wird beim Auto-Arrive synchron geschrieben.';


--
-- Name: COLUMN faelle.kunde_match_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kunde_match_via IS 'Wie wurde kunde_id gesetzt? Werte: neu (default — neuer Account beim Onboarding), dispatch_match (Dispatcher hat aus Match-Vorschlag gewählt), admin_manuell (Admin-Override). NULL = kunde_id noch nicht gesetzt.';


--
-- Name: COLUMN faelle.eskaliert_an_admin_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.eskaliert_an_admin_id IS 'Admin der den Fall vom KB eskaliert uebernommen hat. NULL = nicht eskaliert.';


--
-- Name: COLUMN faelle.kennzeichen_kreis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kennzeichen_kreis IS 'Stadt-/Kreis-Kuerzel, 1-3 Buchstaben (z.B. "K", "AS", "MK")';


--
-- Name: COLUMN faelle.kennzeichen_buchstaben; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kennzeichen_buchstaben IS 'Erkennungsbuchstaben, 1-2 (z.B. "AS", "B")';


--
-- Name: COLUMN faelle.kennzeichen_zahl; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kennzeichen_zahl IS 'Erkennungszahl, 1-4 Ziffern (text wegen evtl. fuehrender Nullen)';


--
-- Name: COLUMN faelle.kennzeichen_suffix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.kennzeichen_suffix IS 'Optional: E (Elektro), H (Oldtimer)';


--
-- Name: COLUMN faelle.fahrzeug_aufbau; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.fahrzeug_aufbau IS 'limousine | kombi | suv | coupe | cabrio | transporter | caravan | motorrad | oldtimer | lkw | sonstiges';


--
-- Name: COLUMN faelle.re_termin_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.re_termin_token IS 'CMM-39: Einmal-Token fuer /kunde/re-termin/[token]. Wird gesetzt wenn SV no-show meldet (meldeNoShow), entwertet via re_termin_token_eingelaufen_am sobald Kunde reagiert.';


--
-- Name: COLUMN faelle.re_termin_token_eingelaufen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.re_termin_token_eingelaufen_am IS 'CMM-39: Zeitpunkt der Kunden-Reaktion auf den Re-Termin-Link. NULL = noch nicht reagiert. Storno-Cron skipt Faelle wo dieser Wert gesetzt ist.';


--
-- Name: COLUMN faelle.re_termin_eskalation_an_kb_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faelle.re_termin_eskalation_an_kb_am IS 'CMM-41: Zeitpunkt der KB-Eskalation per cron/re-termin-eskalation. NULL = noch nicht eskaliert. Idempotenz-Marker — verhindert doppelte Mitteilungen.';


--
-- Name: gutachter_termine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_termine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    fall_id uuid,
    start_zeit timestamp with time zone NOT NULL,
    end_zeit timestamp with time zone NOT NULL,
    status text DEFAULT 'bestaetigt'::text,
    externer_kalender_id text,
    ablehnungsgrund text,
    gegenvorschlag_zeit timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    erinnerung_24h_gesendet boolean DEFAULT false,
    erinnerung_2h_gesendet boolean DEFAULT false,
    erinnerung_48h_docs_gesendet boolean DEFAULT false,
    ankunft_zeit timestamp with time zone,
    abschluss_zeit timestamp with time zone,
    uebersprungen boolean DEFAULT false,
    uebersprung_grund text,
    notizen_vor_ort text,
    gps_lat_ankunft numeric(10,7),
    gps_lng_ankunft numeric(10,7),
    lead_id uuid,
    ablehnen_token uuid DEFAULT gen_random_uuid(),
    abgelehnt_am timestamp with time zone,
    abgelehnt_grund text,
    vorgeschlagenes_datum timestamp with time zone,
    gegenvorschlag_grund text,
    gegenvorschlag_von text,
    ankunft_via text,
    verspaetung_minuten integer,
    losgefahren_am timestamp with time zone,
    kunden_tracking_token text,
    notification_losgefahren_gesendet_am timestamp with time zone,
    notification_5min_gesendet_am timestamp with time zone,
    notification_angekommen_gesendet_am timestamp with time zone,
    ablehnen_token_expires_at timestamp with time zone,
    final_verbindlich_ab timestamp with time zone,
    sv_ablehnung_grund text,
    sv_ablehnung_am timestamp with time zone,
    sv_vorgeschlagene_slots jsonb,
    typ text DEFAULT 'sv_begutachtung'::text NOT NULL,
    kanal text,
    video_link text,
    kb_id uuid,
    notiz_kunde text,
    notiz_intern text,
    reminder_sent_at timestamp with time zone,
    reminder_1h_sent_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    navigation_started_at timestamp with time zone,
    sv_unterwegs_seit timestamp with time zone,
    sv_eta_minuten integer,
    sv_eta_letzte_berechnung timestamp with time zone,
    sv_angekommen_am timestamp with time zone,
    reminder_15min_sent_at timestamp with time zone,
    reminder_5min_sent_at timestamp with time zone,
    durchgefuehrt_am timestamp with time zone,
    kunde_tracking_aktiviert boolean DEFAULT false,
    kunde_losgefahren_am timestamp with time zone,
    kunde_eta_minuten integer,
    kunde_eta_letzte_berechnung timestamp with time zone,
    kunde_angekommen_am timestamp with time zone,
    kunde_verspaetung_gemeldet_am timestamp with time zone,
    bezahlt boolean DEFAULT true NOT NULL,
    honorar_betrag numeric(10,2),
    google_event_id text,
    google_calendar_id text,
    google_event_synced_at timestamp with time zone,
    kunde_response_token text,
    kunde_response_token_expires_at timestamp with time zone,
    gesehen_am timestamp with time zone,
    geschaetzte_fahrtzeit_min integer,
    auftrag_id uuid,
    verlegung_quelle_id uuid,
    verlegung_grund text,
    verlegung_kunde_benachrichtigt_an timestamp with time zone,
    verlegung_eskalation_an_kb_an timestamp with time zone,
    verlegung_initiator_kunde boolean DEFAULT false NOT NULL,
    besichtigung_gestartet_am timestamp with time zone,
    caldav_object_url text,
    caldav_event_uid text,
    caldav_synced_at timestamp with time zone,
    erinnerung_morgen_gesendet boolean DEFAULT false NOT NULL,
    sv_lead_id uuid,
    claim_id uuid,
    besichtigungsort_adresse text,
    besichtigungsort_lat numeric(10,7),
    besichtigungsort_lng numeric(10,7),
    besichtigungsort_place_id text,
    besichtigungsort_notiz text,
    geschaetzte_fahrdistanz_km numeric(6,1),
    termin_erinnerung_5min_gesendet boolean DEFAULT false,
    losfahren_erinnerung_gesendet boolean DEFAULT false,
    sv_termin_dokument_reminder_gesendet_am timestamp with time zone,
    wunschtermin timestamp with time zone,
    no_show_gemeldet_am timestamp with time zone,
    re_termin_token uuid,
    re_termin_token_eingelaufen_am timestamp with time zone,
    re_termin_eskalation_an_kb_am timestamp with time zone,
    nachbesichtigung_status text DEFAULT 'nicht-angefordert'::text,
    nachbesichtigung_angefordert_am timestamp with time zone,
    nachbesichtigung_termin_datum timestamp with time zone,
    nachbesichtigung_konfrontation boolean DEFAULT false,
    nachbesichtigung_ergebnis text,
    nachbesichtigung_kunde_termin_vorschlaege jsonb DEFAULT '[]'::jsonb,
    nachbesichtigung_kunde_termin_eingereicht_am timestamp with time zone,
    nachbesichtigung_sv_konfrontation_gewuenscht boolean,
    nachbesichtigung_sv_termin_vereinbart_am timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gutachter_termine_ankunft_via_check CHECK (((ankunft_via IS NULL) OR (ankunft_via = ANY (ARRAY['gps'::text, 'manual_swipe'::text])))),
    CONSTRAINT gutachter_termine_gegenvorschlag_von_check CHECK (((gegenvorschlag_von = ANY (ARRAY['sv'::text, 'kunde'::text])) OR (gegenvorschlag_von IS NULL))),
    CONSTRAINT gutachter_termine_kanal_check CHECK ((kanal = ANY (ARRAY['telefon'::text, 'video'::text]))),
    CONSTRAINT gutachter_termine_status_check CHECK ((status = ANY (ARRAY['reserviert'::text, 'bestaetigt'::text, 'abgelehnt'::text, 'abgesagt'::text, 'storniert'::text, 'abgeschlossen'::text, 'sv_gesucht'::text, 'gegenvorschlag'::text, 'verschoben'::text, 'verlegt'::text, 'verlegung_pending'::text]))),
    CONSTRAINT gutachter_termine_typ_check CHECK ((typ = ANY (ARRAY['sv_begutachtung'::text, 'kb_beratung'::text, 'konfrontation'::text])))
);

ALTER TABLE ONLY public.gutachter_termine REPLICA IDENTITY FULL;


--
-- Name: COLUMN gutachter_termine.typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.typ IS 'sv_begutachtung (Standard, bezahlt) | kb_beratung (KB-Videotermin) | konfrontation (Nachbesichtigung mit SV, NICHT bezahlt, AAR-561)';


--
-- Name: COLUMN gutachter_termine.kunde_tracking_aktiviert; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.kunde_tracking_aktiviert IS 'AAR-380: Kunde hat Live-Tracking per Opt-In aktiviert.';


--
-- Name: COLUMN gutachter_termine.bezahlt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.bezahlt IS 'AAR-561: false für Konfrontations-Begleit-Termine (SV-Reuse ohne neue Bezahlung). Default true für Standard-Termine.';


--
-- Name: COLUMN gutachter_termine.honorar_betrag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.honorar_betrag IS 'AAR-561: Honorar für diesen konkreten Termin in EUR. NULL für Altrows, 0 für Konfrontations-Termine.';


--
-- Name: COLUMN gutachter_termine.google_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.google_event_id IS 'AAR-694: Google-Calendar-Event-ID im Kalender des SV. NULL wenn SV nicht per OAuth verbunden oder Sync fehlgeschlagen.';


--
-- Name: COLUMN gutachter_termine.google_calendar_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.google_calendar_id IS 'AAR-694: Calendar-ID (meist ''primary'') fuer delete/update-Calls. Redundant zu google_event_id, aber macht das Loeschen autark.';


--
-- Name: COLUMN gutachter_termine.google_event_synced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.google_event_synced_at IS 'AAR-694: Zeitstempel des letzten erfolgreichen create/update. NULL wenn noch nie synced.';


--
-- Name: COLUMN gutachter_termine.kunde_response_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.kunde_response_token IS 'AAR-702: Magic-Link-Token für Kunden-Response auf SV-Gegenvorschlag (7d TTL).';


--
-- Name: COLUMN gutachter_termine.gesehen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.gesehen_am IS 'AAR-724: Zeitpunkt, zu dem der SV den Termin angesehen hat. NULL = noch nicht gesehen (rote Markierung + Counter in Navbar).';


--
-- Name: COLUMN gutachter_termine.geschaetzte_fahrtzeit_min; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.geschaetzte_fahrtzeit_min IS 'CMM-36: Einmalig beim Anlegen via Mapbox berechnete Fahrtzeit von SV-Standort zur Schadens-Adresse. Baseline für Departure-Time-Heuristik.';


--
-- Name: COLUMN gutachter_termine.auftrag_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.auftrag_id IS 'CMM-32: Termin gehört zu genau einem Auftrag. Backfill in CMM-32b.';


--
-- Name: COLUMN gutachter_termine.verlegung_quelle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.verlegung_quelle_id IS 'AAR-864: FK auf den alten Termin. NEUE Slot-Row zeigt auf den ALTEN Termin (status=verlegt).';


--
-- Name: COLUMN gutachter_termine.verlegung_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.verlegung_grund IS 'AAR-864: Grund den der SV beim Verlegungs-Vorschlag angegeben hat.';


--
-- Name: COLUMN gutachter_termine.verlegung_kunde_benachrichtigt_an; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.verlegung_kunde_benachrichtigt_an IS 'AAR-864: Wann der Kunde über die Verlegung benachrichtigt wurde (WhatsApp + In-App).';


--
-- Name: COLUMN gutachter_termine.verlegung_eskalation_an_kb_an; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.verlegung_eskalation_an_kb_an IS 'AAR-864: Wann der KB+Admin eskaliert wurde, weil Kunde innerhalb 48h vor altem Termin nicht reagiert hat. Idempotenz-Marker.';


--
-- Name: COLUMN gutachter_termine.verlegung_initiator_kunde; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.verlegung_initiator_kunde IS 'AAR-864: TRUE wenn die Verlegung vom Kunden initiiert wurde — SV muss bestätigen. FALSE = SV-Initiator (Default), Kunde bestätigt.';


--
-- Name: COLUMN gutachter_termine.besichtigung_gestartet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.besichtigung_gestartet_am IS 'Auto-Arrive-Trigger. Wird gesetzt wenn beide Parteien am Besichtigungsort sind (Geofence) oder als Fallback wenn die Terminuhrzeit erreicht ist. Quelle für die "Besichtigung läuft"-Anzeige in SV- und Kunden-Portal.';


--
-- Name: COLUMN gutachter_termine.caldav_object_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.caldav_object_url IS 'AAR-716: URL des iCal-Objekts auf dem CalDAV-Server (Apple iCloud / Fastmail / Custom). Für PUT (Update) und DELETE benötigt. NULL = noch nicht synchronisiert oder SV hat keine CalDAV-Verbindung.';


--
-- Name: COLUMN gutachter_termine.caldav_event_uid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.caldav_event_uid IS 'AAR-716: iCal-UID (RFC5545) — UUID @ Domain. Bleibt über Updates identisch, wird vom Server zur Event-Identifikation genutzt.';


--
-- Name: COLUMN gutachter_termine.caldav_synced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.caldav_synced_at IS 'AAR-716: Zeitstempel des letzten erfolgreichen CalDAV-Sync (Create oder Update). NULL = noch nie synchronisiert.';


--
-- Name: COLUMN gutachter_termine.erinnerung_morgen_gesendet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.erinnerung_morgen_gesendet IS 'Morgen-Erinnerung am Termintag (07:00) an Kunden gesendet. Verhindert Duplikate bei Cron-Restart.';


--
-- Name: COLUMN gutachter_termine.sv_lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.sv_lead_id IS '2026-05-11 Funnel v2: gesetzt bei Free-Tier-Termin (sv_leads). Genau einer von sv_id ODER sv_lead_id.';


--
-- Name: COLUMN gutachter_termine.claim_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_termine.claim_id IS 'CMM-58: FK auf claims. Vom Trigger sync_gutachter_termine_claim_id aus fall_id abgeleitet. Phase-2-Voraussetzung der Claim-SSoT-Migration.';


--
-- Name: kanzlei_faelle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzlei_faelle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    status text NOT NULL,
    vs_kontakt_am timestamp with time zone,
    ausgezahlt_am timestamp with time zone,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_id uuid NOT NULL,
    lexdrive_case_id text,
    lexdrive_ocr_data jsonb,
    lexdrive_ocr_received_at timestamp with time zone,
    klage_uebergeben_am timestamp with time zone,
    anschlussschreiben_am timestamp with time zone,
    anschlussschreiben_url text,
    anschlussschreiben_sendedatum date,
    anschlussschreiben_unterschrift boolean DEFAULT false,
    anschlussschreiben_ocr_am timestamp with time zone,
    as_geforderte_summe numeric,
    as_frist date,
    as_vs_reaktion_text text,
    as_salesforce_id text,
    as_zuletzt_synced_am timestamp with time zone,
    mandatsnummer text,
    regulierung_am timestamp with time zone,
    regulierung_angekuendigt_am timestamp with time zone,
    vs_eskalationsstufe text DEFAULT 'vs-01'::text,
    regulierungsweise text,
    vs_reaktion_typ text,
    vs_reaktion_am timestamp with time zone,
    kuerzungs_betrag numeric(10,2),
    vs_frist_bis timestamp with time zone,
    vs_kuerzung_grund text,
    vs_quote_prozent numeric(5,2),
    vs_quote_grund text,
    vs_quote_akzeptiert_am timestamp with time zone,
    vs_quote_betrag_ausgezahlt numeric(10,2),
    vs_kuerzungs_typ text,
    eskalation_tag_14_am timestamp with time zone,
    eskalation_tag_14_ergebnis text,
    eskalation_tag_14_ergebnis_am timestamp with time zone,
    eskalation_tag_14_ergebnis_von uuid,
    eskalation_tag_21_am timestamp with time zone,
    eskalation_tag_21_ergebnis text,
    eskalation_tag_21_ergebnis_am timestamp with time zone,
    eskalation_tag_21_ergebnis_von uuid,
    eskalation_tag_28_am timestamp with time zone,
    eskalation_tag_28_ergebnis text,
    eskalation_tag_28_ergebnis_am timestamp with time zone,
    eskalation_tag_28_ergebnis_von uuid,
    ruege_erhalten_am timestamp with time zone,
    ruege_grund text,
    ruege_gesendet_am timestamp with time zone,
    ruege_betrag numeric(10,2),
    ruege_counter integer DEFAULT 0,
    ruege_frist_tage integer DEFAULT 14,
    kanzlei_id uuid,
    CONSTRAINT kanzlei_faelle_status_check CHECK ((status = ANY (ARRAY['versicherungskontakt'::text, 'auszahlung'::text])))
);

ALTER TABLE ONLY public.kanzlei_faelle REPLICA IDENTITY FULL;


--
-- Name: TABLE kanzlei_faelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kanzlei_faelle IS 'CMM-32: Regulierungs-Sub-Entity. Genau ein kanzlei_fall pro fall (UNIQUE). Lifecycle: versicherungskontakt → auszahlung. Wird angelegt sobald Erstgutachten QC-freigegeben ist.';


--
-- Name: COLUMN kanzlei_faelle.claim_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kanzlei_faelle.claim_id IS 'CMM-37: Direkter FK auf claims. Ist seit Phase 1 die kanonische Beziehung; fall_id bleibt waehrend der Uebergangsphase parallel gepflegt (Sync-Trigger). Phase 4 entscheidet ueber Drop von fall_id.';


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vorname text,
    nachname text,
    email text,
    telefon text,
    status public.lead_status DEFAULT 'neu'::public.lead_status NOT NULL,
    source_channel text,
    source_domain text,
    kontaktversuche integer DEFAULT 0,
    verpasste_anrufe integer DEFAULT 0,
    missed_call_times jsonb DEFAULT '[]'::jsonb,
    qualifizierung_data jsonb DEFAULT '{}'::jsonb,
    aircall_contact_id text,
    timeline jsonb DEFAULT '[]'::jsonb,
    wa_gesendet boolean DEFAULT false,
    kanzlei_triggered boolean DEFAULT false,
    notiz text,
    zugewiesen_an uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    schadens_fall_typ text,
    kunden_konstellation text,
    personenschaden_flag boolean DEFAULT false,
    mietwagen_flag boolean DEFAULT false,
    gewerbe_flag boolean DEFAULT false,
    halter_ungleich_fahrer_flag boolean DEFAULT false,
    gegner_bekannt boolean DEFAULT true,
    polizeibericht_pflicht boolean DEFAULT false,
    gutachter_termin timestamp with time zone,
    kennzeichen text,
    fahrzeug_hersteller text,
    fahrzeug_modell text,
    wunschtermin timestamp with time zone,
    fahrzeug_standort_adresse text,
    fahrzeug_standort_plz text,
    sa_unterschrieben boolean DEFAULT false,
    sa_unterschrieben_am timestamp with time zone,
    qualifizierungs_phase text DEFAULT 'neu'::text,
    sf_variante text,
    gegner_name text,
    gegner_versicherung text,
    gegner_kennzeichen text,
    eigene_versicherung text,
    eigene_policennr text,
    polizei_aktenzeichen text,
    leasing_geber text,
    finanzierung_bank text,
    firma_name text,
    halter_name text,
    sa_datum timestamp with time zone,
    vollmacht_datum timestamp with time zone,
    mandatstyp text DEFAULT 'claimondo'::text,
    anruf_versuche integer DEFAULT 0,
    letzter_anruf_am timestamp with time zone,
    letzter_anruf_status text,
    flow_link_geoeffnet boolean DEFAULT false,
    flow_link_abgeschlossen boolean DEFAULT false,
    disqualifiziert boolean DEFAULT false,
    disqualifiziert_grund text,
    disqualifiziert_notiz text,
    disqualifiziert_am timestamp with time zone,
    unfallhergang text,
    polizei_vor_ort boolean DEFAULT false,
    unfallmitteilung_hochgeladen boolean DEFAULT false,
    fahrzeug_farbe text,
    erstzulassung text,
    fin text,
    kilometerstand integer,
    unfallort text,
    unfallort_lat numeric(10,7),
    unfallort_lng numeric(10,7),
    unfalldatum date,
    kunde_adresse text,
    kunde_lat numeric(10,7),
    kunde_lng numeric(10,7),
    konvertiert_zu_fall_id uuid,
    spezifikation text,
    schadens_art text,
    unfall_konstellation text,
    gegner_anzahl_beteiligte integer DEFAULT 1,
    gegner_fahrzeugtyp text,
    service_typ text DEFAULT 'komplett'::text NOT NULL,
    ist_fahrzeughalter boolean DEFAULT true,
    finanzierung_leasing text DEFAULT 'keine'::text,
    vorsteuerabzugsberechtigt boolean DEFAULT false,
    halter_vorname text,
    halter_nachname text,
    halter_strasse text,
    halter_plz text,
    halter_stadt text,
    halter_telefon text,
    halter_email text,
    finanzierungsgeber_name text,
    finanzierungsgeber_adresse text,
    finanzierungsgeber_vertragsnr text,
    kunde_strasse text,
    kunde_plz text,
    kunde_stadt text,
    schadens_hergang text,
    hat_vorschaeden boolean DEFAULT false,
    vorschaeden_beschreibung text,
    schuldfrage text,
    aufklaerung_teilschuld_bestaetigt boolean DEFAULT false,
    schaden_sichtbar boolean,
    nutzungsausfall boolean DEFAULT false,
    hat_haftpflicht boolean,
    schadentyp text,
    schadentyp_freitext text,
    parkplatz_kamera boolean,
    unfallort_kategorie text,
    unfallskizze_url text,
    zeuge_name text,
    zeuge_anschrift text,
    zeuge_telefon text,
    zeuge_email text,
    fahrzeug_ausstattung jsonb,
    cardentity_enriched_at timestamp with time zone,
    cardentity_report jsonb,
    gespraech_gestartet_am timestamp with time zone,
    gespraech_beendet_am timestamp with time zone,
    gespraech_dauer_sekunden integer,
    fahrerflucht boolean DEFAULT false,
    auslandskennzeichen boolean DEFAULT false,
    zeugen boolean,
    gegner_schadennummer text,
    unfall_uhrzeit text,
    fahrzeug_fahrbereit boolean,
    fahrzeug_baujahr integer,
    zb1_token text,
    zb1_status text,
    zb1_url text,
    zb1_ocr_daten jsonb,
    zb1_gesendet_am timestamp with time zone,
    zb1_hochgeladen_am timestamp with time zone,
    bevorzugter_kanal text,
    hsn text,
    tsn text,
    gegner_versicherung_id uuid,
    polizeibericht_token text,
    polizeibericht_status text,
    polizeibericht_gesendet_am timestamp with time zone,
    polizeibericht_hochgeladen_am timestamp with time zone,
    polizeibericht_url text,
    polizeibericht_ocr_daten jsonb,
    wunschtermin_wochentage integer[],
    zb1_token_expires_at timestamp with time zone,
    zb1_upload_versuche integer DEFAULT 0,
    zeugen_kontakte jsonb,
    werkstatt_seit_datum date,
    halter_geburtsdatum date,
    gegner_versicherung_anfrage_datum date,
    sprache text DEFAULT 'de'::text,
    schadensfoto_urls jsonb DEFAULT '[]'::jsonb,
    unfallskizze_svg text,
    unfallskizze_bestaetigt boolean DEFAULT false,
    unfallskizze_ablehnung_grund text,
    unfallskizze_generiert_am timestamp with time zone,
    zeugen_vorhanden boolean DEFAULT false NOT NULL,
    promotion_code_id uuid,
    claude_vision_analyse jsonb,
    dat_einschaetzung jsonb,
    dat_pdf_url text,
    voice_input_quelle boolean DEFAULT false NOT NULL,
    reminder_token uuid DEFAULT gen_random_uuid(),
    reminder_1_sent_at timestamp with time zone,
    reminder_2_sent_at timestamp with time zone,
    reminder_3_sent_at timestamp with time zone,
    sachschaden_flag boolean DEFAULT false NOT NULL,
    sachschaden_beschreibung text,
    disqualifiziert_grund_key text,
    besichtigungsort_adresse text,
    besichtigungsort_lat numeric,
    besichtigungsort_lng numeric,
    besichtigungsort_place_id text,
    vollmacht_signiert_am timestamp with time zone,
    bkat_unfallart public.bkat_unfallart,
    fahrzeug_standort_lat numeric,
    fahrzeug_standort_lng numeric,
    fahrzeug_standort_place_id text,
    fahrzeugschaden_beschreibung text,
    vehicle_id uuid,
    lead_nummer text,
    konvertiert_zu_claim_id uuid,
    konvertiert_am timestamp with time zone,
    konvertiert_durch_user_id uuid,
    fehlende_felder_jsonb jsonb,
    anrede text,
    lackfarbe_code text,
    rueckruf_geplant_am timestamp with time zone,
    ansprechpartner_beziehung text,
    kunde_id uuid,
    kennzeichen_kreis text,
    kennzeichen_buchstaben text,
    kennzeichen_zahl text,
    kennzeichen_suffix text,
    fahrzeug_aufbau text,
    besichtigungsort_notiz text,
    brn text,
    whatsapp_verfuegbar boolean,
    whatsapp_geprueft_am timestamp with time zone,
    hat_whatsapp boolean,
    ga_client_id text,
    CONSTRAINT leads_anrede_check CHECK (((anrede IS NULL) OR (anrede = ANY (ARRAY['herr'::text, 'frau'::text, 'divers'::text])))),
    CONSTRAINT leads_bevorzugter_kanal_check CHECK (((bevorzugter_kanal IS NULL) OR (bevorzugter_kanal = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text])))),
    CONSTRAINT leads_fahrzeug_aufbau_chk CHECK (((fahrzeug_aufbau IS NULL) OR (fahrzeug_aufbau = ANY (ARRAY['limousine'::text, 'kombi'::text, 'suv'::text, 'coupe'::text, 'cabrio'::text, 'transporter'::text, 'caravan'::text, 'motorrad'::text, 'oldtimer'::text, 'lkw'::text, 'sonstiges'::text])))),
    CONSTRAINT leads_finanzierung_leasing_check CHECK ((finanzierung_leasing = ANY (ARRAY['keine'::text, 'finanzierung'::text, 'leasing'::text]))),
    CONSTRAINT leads_kennzeichen_suffix_chk CHECK (((kennzeichen_suffix IS NULL) OR (kennzeichen_suffix = ANY (ARRAY['E'::text, 'H'::text])))),
    CONSTRAINT leads_lackfarbe_code_check CHECK (((lackfarbe_code IS NULL) OR (lackfarbe_code = ANY (ARRAY['schwarz'::text, 'weiss'::text, 'silber'::text, 'grau'::text, 'blau'::text, 'rot'::text, 'gruen'::text, 'gelb'::text, 'orange'::text, 'braun'::text, 'beige'::text, 'sonstige'::text])))),
    CONSTRAINT leads_polizeibericht_status_check CHECK (((polizeibericht_status IS NULL) OR (polizeibericht_status = ANY (ARRAY['gesendet'::text, 'geoeffnet'::text, 'hochgeladen'::text, 'fehlgeschlagen'::text, 'abgelehnt'::text])))),
    CONSTRAINT leads_qualifizierungs_phase_check CHECK ((qualifizierungs_phase = ANY (ARRAY['neu'::text, 'nicht-erreicht'::text, 'rueckruf'::text, 'in-qualifizierung'::text, 'erstkontakt'::text, 'schadentyp-erfasst'::text, 'konstellation-erfasst'::text, 'gegner-daten'::text, 'gutachtertermin'::text, 'flow-versendet'::text, 'flow-gesendet'::text, 'sa-ausstehend'::text, 'sa-unterschrieben'::text, 'konvertiert'::text, 'abgeschlossen'::text, 'disqualifiziert'::text, 'kalt'::text]))),
    CONSTRAINT leads_schadentyp_check CHECK ((schadentyp = ANY (ARRAY['spurwechsel'::text, 'auffahrunfall'::text, 'vorfahrtsverletzung'::text, 'parkplatz'::text, 'sonstiges'::text]))),
    CONSTRAINT leads_schuldfrage_check CHECK ((schuldfrage = ANY (ARRAY['gegner'::text, 'unklar'::text, 'eigenverantwortung'::text]))),
    CONSTRAINT leads_service_typ_check CHECK ((service_typ = ANY (ARRAY['komplett'::text, 'nur_gutachter'::text]))),
    CONSTRAINT leads_sprache_check CHECK ((sprache = ANY (ARRAY['de'::text, 'tr'::text, 'ar'::text, 'ru'::text, 'pl'::text, 'en'::text, 'other'::text]))),
    CONSTRAINT leads_unfallort_kategorie_check CHECK ((unfallort_kategorie = ANY (ARRAY['parkluecke'::text, 'kreuzung'::text, 'autobahn'::text, 'landstrasse'::text, 'innerorts'::text, 'sonstiges'::text]))),
    CONSTRAINT leads_zb1_status_check CHECK (((zb1_status IS NULL) OR (zb1_status = ANY (ARRAY['ausstehend'::text, 'gesendet'::text, 'geoeffnet'::text, 'hochgeladen'::text, 'fehlgeschlagen'::text, 'abgelehnt'::text]))))
);


--
-- Name: COLUMN leads.unfallskizze_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.unfallskizze_url IS 'AAR-317: Optionale Public-URL (wenn in Storage abgelegt) — wird erst bei Freigabe + Kanzlei-Paket gefüllt.';


--
-- Name: COLUMN leads.gespraech_gestartet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.gespraech_gestartet_am IS 'AAR-114: Zeitpunkt an dem der MA den Gespraechs-Timer gestartet hat';


--
-- Name: COLUMN leads.gespraech_beendet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.gespraech_beendet_am IS 'AAR-114: Zeitpunkt an dem der MA das Gespraech beendet hat';


--
-- Name: COLUMN leads.gespraech_dauer_sekunden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.gespraech_dauer_sekunden IS 'AAR-114: Effektive Gespraechsdauer in Sekunden (Ziel: max 480)';


--
-- Name: COLUMN leads.fahrerflucht; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.fahrerflucht IS 'AAR-135 W1: Unfallgegner ist geflüchtet';


--
-- Name: COLUMN leads.auslandskennzeichen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.auslandskennzeichen IS 'AAR-135 W1: Gegner hat Auslandskennzeichen (braucht erweiterte Recherche)';


--
-- Name: COLUMN leads.zeugen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zeugen IS 'AAR-135 W1: Zeugen am Unfallort vorhanden';


--
-- Name: COLUMN leads.gegner_schadennummer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.gegner_schadennummer IS 'AAR-135 W1: Schadennummer der gegnerischen Versicherung';


--
-- Name: COLUMN leads.unfall_uhrzeit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.unfall_uhrzeit IS 'AAR-135 W1: Uhrzeit des Unfalls (Text, ca-Angabe erlaubt)';


--
-- Name: COLUMN leads.fahrzeug_fahrbereit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.fahrzeug_fahrbereit IS 'AAR-135 W1: Fahrzeug ist nach Unfall noch fahrbereit (für Termin-Logistik)';


--
-- Name: COLUMN leads.fahrzeug_baujahr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.fahrzeug_baujahr IS 'AAR-181: Baujahr — Pflichtfeld in Dispatch-Phase 4, wird beim Fall-Mapping übernommen.';


--
-- Name: COLUMN leads.zb1_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zb1_status IS 'AAR-182: ausstehend / gesendet / geoeffnet / hochgeladen / fehlgeschlagen';


--
-- Name: COLUMN leads.zb1_ocr_daten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zb1_ocr_daten IS 'AAR-182: Extrahierte Felder aus Google Vision + Rohtext';


--
-- Name: COLUMN leads.bevorzugter_kanal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.bevorzugter_kanal IS 'AAR-183: Letzter erfolgreicher Kanal — wird als Primary beim nächsten Send genutzt.';


--
-- Name: COLUMN leads.hsn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.hsn IS 'AAR-208: Herstellerschlüsselnummer aus ZB1-OCR (4 Ziffern)';


--
-- Name: COLUMN leads.tsn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.tsn IS 'AAR-208: Typschlüsselnummer aus ZB1-OCR (3 alphanumerisch)';


--
-- Name: COLUMN leads.gegner_versicherung_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.gegner_versicherung_id IS 'AAR-265: FK auf versicherungen-Stammdaten. NULL = Freitext-Fallback in gegner_versicherung.';


--
-- Name: COLUMN leads.polizeibericht_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.polizeibericht_status IS 'AAR-263: gesendet|geoeffnet|hochgeladen|fehlgeschlagen|abgelehnt — analog zb1_status';


--
-- Name: COLUMN leads.polizeibericht_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.polizeibericht_url IS 'AAR-263: Public URL des polizeilichen Unfallmitteilungs-Fotos in Storage';


--
-- Name: COLUMN leads.wunschtermin_wochentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.wunschtermin_wochentage IS 'AAR-270: ISO-Wochentage 1=Mo..7=So, mehrfach erlaubt. NULL=Egal/kein Filter.';


--
-- Name: COLUMN leads.zb1_token_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zb1_token_expires_at IS 'AAR-296: Token-Ablaufdatum (default 7 Tage nach Generierung). NULL=kein Token.';


--
-- Name: COLUMN leads.zb1_upload_versuche; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zb1_upload_versuche IS 'AAR-296: Counter für Upload-Versuche via /upload/zb1/[token]-Page.';


--
-- Name: COLUMN leads.zeugen_kontakte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zeugen_kontakte IS 'AAR-298: Array von Zeugen-Kontaktdaten [{name, telefon, email?, notiz?}]';


--
-- Name: COLUMN leads.werkstatt_seit_datum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.werkstatt_seit_datum IS 'AAR-305: Datum seit dem das Fahrzeug in der Werkstatt steht.';


--
-- Name: COLUMN leads.halter_geburtsdatum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.halter_geburtsdatum IS 'AAR-318: Geburtsdatum des Fahrzeughalters — manuell oder aus Kundendaten (steht nicht im Fahrzeugschein/ZB1).';


--
-- Name: COLUMN leads.gegner_versicherung_anfrage_datum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.gegner_versicherung_anfrage_datum IS 'AAR-314: Datum der Anfrage beim Deutschen Büro Grüne Karte (deutsches-buero-gruene-karte.de). Nach 10 Tagen kommt die DE-Versicherungs-Eintrittsadresse per Mail.';


--
-- Name: COLUMN leads.sprache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.sprache IS 'AAR-316: ISO-Code der Kundensprache — DE Standard. Werte: de/tr/ar/ru/pl/en/other.';


--
-- Name: COLUMN leads.schadensfoto_urls; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.schadensfoto_urls IS 'AAR-305: Array von Public-URLs der vom Kunden im Onboarding hochgeladenen Schadensfotos. Werden bei Fall-Anlage in dokumente (fall-bound) übertragen.';


--
-- Name: COLUMN leads.unfallskizze_svg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.unfallskizze_svg IS 'AAR-317: Roh-SVG der von Claude generierten Unfallskizze (base64-frei, inline einbettbar).';


--
-- Name: COLUMN leads.unfallskizze_bestaetigt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.unfallskizze_bestaetigt IS 'AAR-317: Kunde hat die Skizze im FlowLink bestätigt (später — MVP: MA-Freigabe genügt).';


--
-- Name: COLUMN leads.unfallskizze_ablehnung_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.unfallskizze_ablehnung_grund IS 'AAR-317: Kunde hat abgelehnt — Freitext-Korrekturbeschreibung.';


--
-- Name: COLUMN leads.zeugen_vorhanden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.zeugen_vorhanden IS 'AAR-321: Dispatch-Abfrage — waren Zeugen am Unfall anwesend? Schaltet Pflicht-Slot zeugenbericht frei.';


--
-- Name: COLUMN leads.reminder_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.reminder_token IS 'AAR-477 C11: UUID für /schaden-melden/fortsetzen/{token}';


--
-- Name: COLUMN leads.reminder_1_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.reminder_1_sent_at IS 'AAR-477 C11: Timestamp Reminder-1 (2h) Versand';


--
-- Name: COLUMN leads.reminder_2_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.reminder_2_sent_at IS 'AAR-477 C11: Timestamp Reminder-2 (24h) Versand';


--
-- Name: COLUMN leads.reminder_3_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.reminder_3_sent_at IS 'AAR-477 C11: Timestamp Reminder-3 (72h) Versand';


--
-- Name: COLUMN leads.sachschaden_flag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.sachschaden_flag IS 'AAR-357: Sachschäden an Dritten beim Unfall (Leitplanke, Zaun, Handy etc.) — unabhängig vom KFZ-Schaden.';


--
-- Name: COLUMN leads.sachschaden_beschreibung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.sachschaden_beschreibung IS 'AAR-357: Freitext des Dispatchers — was wurde beschädigt?';


--
-- Name: COLUMN leads.bkat_unfallart; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.bkat_unfallart IS 'AAR-504/505: BKat-konforme Unfallart-Klassifikation (15 Werte). Gesetzt durch KI-Analyse aus Unfallhergang-Text oder Polizeibericht-OCR, vom Dispatcher bestaetigt. Legacy-Pendant: leads.schadentyp (text, 5 Werte).';


--
-- Name: COLUMN leads.fahrzeugschaden_beschreibung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.fahrzeugschaden_beschreibung IS 'AAR-665: Was ist am eigenen Fahrzeug kaputt. Wird in Phase 4 vom Dispatcher gepflegt oder automatisch von Claude-Haiku-Vision aus Unfallfotos gefüllt. Getrennt von sachschaden_beschreibung (Drittschaden in Phase 1, z.B. Leitplanke).';


--
-- Name: COLUMN leads.vehicle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.vehicle_id IS 'AAR-773: FK auf vehicles. Nullable in Phase 1, NOT NULL ab Phase 7.';


--
-- Name: COLUMN leads.lead_nummer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.lead_nummer IS 'AAR-829: Human-readable Lead-ID (LEAD-2026-00042). Auto-generiert via Trigger.';


--
-- Name: COLUMN leads.konvertiert_zu_claim_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.konvertiert_zu_claim_id IS 'AAR-829: FK auf claims.id — gesetzt wenn Lead konvertiert wurde. NULL = noch kein Claim.';


--
-- Name: COLUMN leads.konvertiert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.konvertiert_am IS 'AAR-829: Zeitpunkt der Claim-Konversion. Wichtig für Konversions-Dauer-Tracking.';


--
-- Name: COLUMN leads.fehlende_felder_jsonb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.fehlende_felder_jsonb IS 'AAR-829: Liste fehlender Pflicht-Felder bei unvollständigen Leads (für Dispatcher-Nacharbeit).';


--
-- Name: COLUMN leads.anrede; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.anrede IS 'CMM-32: Anrede des Geschaedigten (herr/frau/divers). Wird beim Konvertieren auf parteien.anrede vererbt.';


--
-- Name: COLUMN leads.lackfarbe_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.lackfarbe_code IS 'CMM-32: Strukturierter Code fuer Imagin-Render-Mapping. Freitext fahrzeug_farbe bleibt fuer Detail-Bezeichnungen.';


--
-- Name: COLUMN leads.rueckruf_geplant_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.rueckruf_geplant_am IS 'Geplanter Rückruf-Termin (Datum + Uhrzeit). Denormalisiert aus admin_termine.start_zeit (typ=rueckruf). Wird von saveRueckruf() synchron gesetzt und auf NULL gesetzt wenn erledigt/abgesagt.';


--
-- Name: COLUMN leads.ansprechpartner_beziehung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.ansprechpartner_beziehung IS 'Wenn ist_fahrzeughalter=false: Beziehung des Anrufers (Ansprechpartner) zum Halter. Wandert beim Lead→Fall-Convert auf claim_parties.beziehung_zum_halter.';


--
-- Name: COLUMN leads.kunde_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.kunde_id IS 'Optional: bestehender profiles.id des Kunden. NULL = neuer Kunde, wird beim Onboarding angelegt. Vom Dispatcher gesetzt via Match-Modal.';


--
-- Name: COLUMN leads.kennzeichen_kreis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.kennzeichen_kreis IS 'Stadt-/Kreis-Kuerzel, 1-3 Buchstaben (z.B. "K", "AS", "MK")';


--
-- Name: COLUMN leads.kennzeichen_buchstaben; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.kennzeichen_buchstaben IS 'Erkennungsbuchstaben, 1-2 (z.B. "AS", "B")';


--
-- Name: COLUMN leads.kennzeichen_zahl; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.kennzeichen_zahl IS 'Erkennungszahl, 1-4 Ziffern (text wegen evtl. fuehrender Nullen)';


--
-- Name: COLUMN leads.kennzeichen_suffix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.kennzeichen_suffix IS 'Optional: E (Elektro), H (Oldtimer)';


--
-- Name: COLUMN leads.fahrzeug_aufbau; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.fahrzeug_aufbau IS 'limousine | kombi | suv | coupe | cabrio | transporter | caravan | motorrad | oldtimer | lkw | sonstiges';


--
-- Name: COLUMN leads.brn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.brn IS 'Bundesweite Registriernummer (ZB1 Feld I bzw. Sicherheitsdruck)';


--
-- Name: COLUMN leads.whatsapp_verfuegbar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.whatsapp_verfuegbar IS 'Ob die Telefonnummer ein WhatsApp-Konto hat. NULL = noch nie geprüft. Wird via lib/whatsapp/availability.ts gesetzt + bei Phone-Update auto-invalidiert.';


--
-- Name: COLUMN leads.whatsapp_geprueft_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.whatsapp_geprueft_am IS 'AAR-901: Zeitstempel des letzten Baileys-Lookups. Re-Check nach 90 Tagen.';


--
-- Name: COLUMN leads.hat_whatsapp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.hat_whatsapp IS 'AAR-901: TRUE wenn Telefonnummer per Baileys-Lookup auf WhatsApp registriert ist. NULL = noch nicht geprueft.';


--
-- Name: COLUMN leads.ga_client_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.ga_client_id IS 'GA4 client_id (_ga-Cookie) fuer Measurement-Protocol-Attribution. Aus der Anfrage propagiert / beim Mini-Wizard-Submit gesetzt.';


--
-- Name: v_claim_phase; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_phase WITH (security_invoker='true') AS
 SELECT c.id AS claim_id,
        CASE
            WHEN (c.status = ANY (ARRAY['reguliert_vollstaendig'::text, 'storniert'::text, 'klage_rechtsstreit'::text, 'verjaehrt'::text, 'abgelehnt_final'::text, 'an_externe_kanzlei_uebergeben'::text])) THEN 'abschluss'::text
            WHEN (kf.lexdrive_case_id IS NOT NULL) THEN 'regulierung'::text
            WHEN (c.status = ANY (ARRAY['in_kommunikation_vs'::text, 'abgelehnt'::text])) THEN 'regulierung'::text
            WHEN (kf.claim_id IS NOT NULL) THEN 'begutachtung'::text
            WHEN ((eg.status IS NOT NULL) AND (eg.status <> 'abgeschlossen'::text)) THEN 'begutachtung'::text
            ELSE 'erfassung'::text
        END AS main_phase,
        CASE
            WHEN (c.status = 'reguliert_vollstaendig'::text) THEN 'erfolgreich_reguliert'::text
            WHEN (c.status = 'storniert'::text) THEN 'storniert'::text
            WHEN (c.status = 'klage_rechtsstreit'::text) THEN 'klage_rechtsstreit'::text
            WHEN (c.status = 'verjaehrt'::text) THEN 'verjaehrt'::text
            WHEN (c.status = 'abgelehnt_final'::text) THEN 'abgelehnt_final'::text
            WHEN (c.status = 'an_externe_kanzlei_uebergeben'::text) THEN 'an_externe_kanzlei'::text
            WHEN (kf.lexdrive_case_id IS NOT NULL) THEN
            CASE
                WHEN (kf.status = 'auszahlung'::text) THEN 'auszahlung'::text
                ELSE 'versicherungskontakt'::text
            END
            WHEN (c.status = 'in_kommunikation_vs'::text) THEN 'versicherungskontakt'::text
            WHEN (c.status = 'abgelehnt'::text) THEN 'nachforderung'::text
            WHEN (kf.claim_id IS NOT NULL) THEN 'kanzlei_uebergabe'::text
            WHEN ((eg.status IS NOT NULL) AND (eg.status <> 'abgeschlossen'::text)) THEN eg.status
            WHEN (l.id IS NOT NULL) THEN
            CASE
                WHEN (l.vollmacht_signiert_am IS NOT NULL) THEN 'onboarding_offen'::text
                WHEN l.sa_unterschrieben THEN 'vollmacht_offen'::text
                ELSE 'sa_offen'::text
            END
            ELSE 'sa_offen'::text
        END AS sub_phase
   FROM (((public.claims c
     LEFT JOIN public.kanzlei_faelle kf ON ((kf.claim_id = c.id)))
     LEFT JOIN public.leads l ON ((l.id = c.lead_id)))
     LEFT JOIN LATERAL ( SELECT a.status
           FROM public.auftraege a
          WHERE ((a.claim_id = c.id) AND (a.typ = 'erstgutachten'::text))
          ORDER BY a.reihenfolge
         LIMIT 1) eg ON (true));


--
-- Name: faelle_kunde_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.faelle_kunde_view AS
 SELECT f.id,
    f.status,
    c.hergang_kunde_text AS schadens_beschreibung,
    c.schadentag AS schadens_datum,
    c.schadenort_adresse AS schadens_adresse,
    (c.schadenort_plz)::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    f.kennzeichen,
    f.fahrzeug_hersteller,
    f.fahrzeug_modell,
    f.fahrzeug_baujahr,
    f.auszahlung_kunde_betrag,
    f.auszahlung_kunde_eingegangen_am,
    c.auszahlung_zahlungsweg,
    kf.eskalation_tag_14_ergebnis,
    kf.eskalation_tag_14_ergebnis_am,
    kf.eskalation_tag_21_ergebnis,
    kf.eskalation_tag_21_ergebnis_am,
    kf.eskalation_tag_28_ergebnis,
    kf.eskalation_tag_28_ergebnis_am,
    spd_termin.nachbesichtigung_status,
    spd_termin.nachbesichtigung_termin_datum,
    spd_termin.nachbesichtigung_kunde_termin_vorschlaege,
    spd_termin.nachbesichtigung_kunde_termin_eingereicht_am,
    spd_termin.nachbesichtigung_sv_konfrontation_gewuenscht,
    kf.vs_quote_prozent,
    kf.vs_quote_grund,
    kf.vs_quote_akzeptiert_am,
    kf.vs_quote_betrag_ausgezahlt,
    kf.vs_reaktion_typ,
    kf.vs_reaktion_am,
    spd_termin.besichtigungsort_adresse,
    c.abgeschlossen_am,
    f.kunde_id,
    f.sv_id,
    c.claim_nummer,
    vcp.main_phase,
    vcp.sub_phase
   FROM ((((public.faelle f
     LEFT JOIN public.claims c ON ((c.id = f.claim_id)))
     LEFT JOIN public.kanzlei_faelle kf ON ((kf.claim_id = c.id)))
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse,
            gt.nachbesichtigung_status,
            gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_kunde_termin_vorschlaege,
            gt.nachbesichtigung_kunde_termin_eingereicht_am,
            gt.nachbesichtigung_sv_konfrontation_gewuenscht
           FROM public.gutachter_termine gt
          WHERE (gt.claim_id = c.id)
          ORDER BY gt.start_zeit DESC NULLS LAST
         LIMIT 1) spd_termin ON (true))
     LEFT JOIN public.v_claim_phase vcp ON ((vcp.claim_id = c.id)));


--
-- Name: gutachten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    sv_id uuid NOT NULL,
    status text DEFAULT 'beauftragt'::text NOT NULL,
    auftragsnummer text,
    besichtigungstermin timestamp with time zone,
    besichtigt_am timestamp with time zone,
    fertiggestellt_am timestamp with time zone,
    unterschrieben_am timestamp with time zone,
    gesamt_schadensbetrag numeric(12,2),
    unterschrift_sv_url text,
    bericht_pdf_url text,
    laeufer_report_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    notiz text,
    pdf_uploaded_at timestamp with time zone,
    pdf_uploaded_by_user_id uuid,
    pdf_size_bytes integer,
    ocr_status text DEFAULT 'nicht_gestartet'::text NOT NULL,
    ocr_engine text,
    ocr_engine_version text,
    ocr_started_at timestamp with time zone,
    ocr_finished_at timestamp with time zone,
    ocr_run_id uuid,
    ocr_confidence numeric(3,2),
    ocr_error_jsonb jsonb,
    gutachter_anbieter text,
    felder_quelle_jsonb jsonb,
    editable_for_sv boolean DEFAULT false NOT NULL,
    editable_for_kb boolean DEFAULT true NOT NULL,
    gutachten_datum date,
    gutachten_ocr_processed_at timestamp with time zone,
    gutachten_ocr_raw jsonb,
    gutachten_ocr_error text,
    gutachten_ocr_manuell_ueberschrieben boolean DEFAULT false NOT NULL,
    gutachten_fin text,
    gutachten_kennzeichen text,
    gutachten_erstzulassung date,
    gutachten_laufleistung_km integer,
    gutachten_tuv_bis date,
    gutachten_fahrzeug_typ text,
    gutachten_farbe text,
    gutachten_farbcode text,
    gutachten_kraftstoff text,
    gutachten_vorschaeden_text text,
    gutachten_lackmesswert_max_my numeric(6,1),
    gutachten_karosseriezustand text,
    gutachten_zeit_ak_std numeric(6,2),
    gutachten_zeit_kar_std numeric(6,2),
    gutachten_zeit_lack_std numeric(6,2),
    gutachten_lohnsatz_ak_eur numeric(8,2),
    gutachten_lohnsatz_kar_eur numeric(8,2),
    gutachten_lohnsatz_lack_eur numeric(8,2),
    gutachten_materialkosten_eur numeric(10,2),
    gutachten_lackmaterial_eur numeric(10,2),
    gutachten_verbringung_eur numeric(10,2),
    gutachten_mietwagen_klasse text,
    gutachten_mietwagen_tagessatz_eur numeric(8,2),
    gutachten_nutzungsausfall_tagessatz_eur numeric(8,2),
    gutachten_sv_honorar_netto numeric(10,2),
    gutachten_sv_honorar_brutto numeric(10,2),
    gutachten_kalkulationssystem text,
    gutachten_seitenzahl integer,
    reparaturkosten_netto numeric(10,2),
    reparaturkosten_brutto numeric(10,2),
    minderwert numeric(10,2),
    restwert numeric(10,2),
    wiederbeschaffungswert numeric(10,2),
    wiederbeschaffungsdauer_tage integer,
    nutzungsausfall_tage integer,
    totalschaden boolean,
    ki_kalkulation jsonb,
    ki_kalkulation_am timestamp with time zone,
    ki_geschaetzte_kosten_min numeric,
    ki_geschaetzte_kosten_max numeric,
    positionen jsonb,
    CONSTRAINT gutachten_anbieter_check CHECK (((gutachter_anbieter IS NULL) OR (gutachter_anbieter = ANY (ARRAY['audatex'::text, 'dat'::text, 'combiplus'::text, 'solera'::text, 'schwacke'::text, 'sonstiges'::text, 'unbekannt'::text])))),
    CONSTRAINT gutachten_kalkulationssystem_check CHECK (((gutachten_kalkulationssystem IS NULL) OR (gutachten_kalkulationssystem = ANY (ARRAY['audatex'::text, 'dat'::text, 'autoixpert'::text, 'sonstiges'::text])))),
    CONSTRAINT gutachten_karosseriezustand_check CHECK (((gutachten_karosseriezustand IS NULL) OR (gutachten_karosseriezustand = ANY (ARRAY['makellos'::text, 'gebrauchsspuren'::text, 'unfallbeschaedigt'::text, 'sonstiges'::text])))),
    CONSTRAINT gutachten_kraftstoff_check CHECK (((gutachten_kraftstoff IS NULL) OR (gutachten_kraftstoff = ANY (ARRAY['benzin'::text, 'diesel'::text, 'hybrid'::text, 'elektro'::text, 'gas'::text, 'sonstiges'::text])))),
    CONSTRAINT gutachten_ocr_engine_check CHECK (((ocr_engine IS NULL) OR (ocr_engine = ANY (ARRAY['claude_vision'::text, 'google_vision'::text, 'manual'::text])))),
    CONSTRAINT gutachten_ocr_status_check CHECK ((ocr_status = ANY (ARRAY['nicht_gestartet'::text, 'pending'::text, 'running'::text, 'done'::text, 'failed'::text, 'manuell_uebersteuert'::text]))),
    CONSTRAINT gutachten_status_check CHECK ((status = ANY (ARRAY['beauftragt'::text, 'besichtigt'::text, 'in_erstellung'::text, 'final'::text, 'storniert'::text])))
);


--
-- Name: TABLE gutachten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gutachten IS 'AAR-818: Sachverständigen-Gutachten als Sub-Asset des Claims. Status-Änderungen triggern calc_claims_phase() → claims.phase aktualisiert. sv_id = unterzeichnender SV (Läufer-Berichte in sv_organisation_laeufer_reports).';


--
-- Name: COLUMN gutachten.felder_quelle_jsonb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachten.felder_quelle_jsonb IS 'AAR-838: Pro Feld dokumentiert ob Wert vom OCR oder manuell kam. Schema: { "wbw_brutto": "ocr", "rk_netto": "ocr_manual_korrigiert", "schadenort_text": "manual" }';


--
-- Name: COLUMN gutachten.editable_for_sv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachten.editable_for_sv IS 'AAR-838: SV darf nur PDF (re-)hochladen, alle Felder kommen aus dem PDF. editable_for_sv=FALSE als Default — UI rendert Felder read-only für SV.';


--
-- Name: faelle_sv_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.faelle_sv_view AS
 SELECT f.id,
    f.status,
    c.hergang_kunde_text AS schadens_beschreibung,
    c.schadentag AS schadens_datum,
    c.schadenort_adresse AS schadens_adresse,
    (c.schadenort_plz)::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    f.kennzeichen,
    f.fahrzeug_hersteller,
    f.fahrzeug_modell,
    f.fahrzeug_baujahr,
    g.gutachten_sv_honorar_netto AS gutachter_honorar,
    c.auszahlung_gutachter_eingegangen_am,
    kf.eskalation_tag_14_ergebnis,
    kf.eskalation_tag_14_ergebnis_am,
    kf.eskalation_tag_21_ergebnis,
    kf.eskalation_tag_21_ergebnis_am,
    kf.eskalation_tag_28_ergebnis,
    kf.eskalation_tag_28_ergebnis_am,
    cur_auftrag.technische_stellungnahme_status,
    cur_auftrag.technische_stellungnahme_beauftragt_am,
    cur_auftrag.technische_stellungnahme_hochgeladen_am,
    cur_auftrag.technische_stellungnahme_freigabe_am,
    kf.vs_kuerzung_grund,
    kf.vs_kuerzungs_typ,
    kf.kuerzungs_betrag,
    spd_termin.nachbesichtigung_status,
    spd_termin.nachbesichtigung_termin_datum,
    spd_termin.nachbesichtigung_sv_konfrontation_gewuenscht,
    spd_termin.nachbesichtigung_sv_termin_vereinbart_am,
    kf.vs_reaktion_typ,
    kf.vs_reaktion_am,
    spd_termin.besichtigungsort_adresse,
    f.sv_id,
    f.kunde_id,
    c.claim_nummer,
    kf.mandatsnummer,
    kf.lexdrive_case_id,
    vcp.main_phase,
    vcp.sub_phase
   FROM ((((((public.faelle f
     LEFT JOIN public.claims c ON ((c.id = f.claim_id)))
     LEFT JOIN public.gutachten g ON ((g.claim_id = c.id)))
     LEFT JOIN public.kanzlei_faelle kf ON ((kf.claim_id = c.id)))
     LEFT JOIN LATERAL ( SELECT a.technische_stellungnahme_status,
            a.technische_stellungnahme_beauftragt_am,
            a.technische_stellungnahme_hochgeladen_am,
            a.technische_stellungnahme_freigabe_am
           FROM public.auftraege a
          WHERE (a.claim_id = c.id)
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON (true))
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse,
            gt.nachbesichtigung_status,
            gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_sv_konfrontation_gewuenscht,
            gt.nachbesichtigung_sv_termin_vereinbart_am
           FROM public.gutachter_termine gt
          WHERE (gt.claim_id = c.id)
          ORDER BY gt.start_zeit DESC NULLS LAST
         LIMIT 1) spd_termin ON (true))
     LEFT JOIN public.v_claim_phase vcp ON ((vcp.claim_id = c.id)));


--
-- Name: fall_dokumente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fall_dokumente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    dokument_typ text NOT NULL,
    ist_pflicht boolean DEFAULT false NOT NULL,
    ab_phase text,
    storage_path text NOT NULL,
    original_filename text,
    mime_type text,
    groesse_bytes integer,
    ocr_status text DEFAULT 'pending'::text,
    ocr_extracted_data jsonb,
    ocr_processed_at timestamp with time zone,
    hochgeladen_von_user_id uuid,
    hochgeladen_am timestamp with time zone DEFAULT now() NOT NULL,
    geloescht_am timestamp with time zone,
    lead_id uuid,
    discrepancy_flag boolean DEFAULT false,
    ocr_result jsonb,
    uploaded_by_sv boolean DEFAULT false,
    uploaded_by_kunde boolean DEFAULT false,
    schaden_position text,
    beschreibung text,
    idempotency_key uuid,
    kategorie text,
    quelle text,
    sichtbar_fuer text[] DEFAULT ARRAY['admin'::text, 'kundenbetreuer'::text],
    position_id uuid,
    pflichtdokument_id uuid,
    abgelehnt_am timestamp with time zone,
    zurueckweisung_kommentar text,
    kb_gesehen_am timestamp with time zone,
    claim_id uuid NOT NULL,
    CONSTRAINT fall_dokumente_ocr_status_check CHECK ((ocr_status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'skipped'::text])))
);

ALTER TABLE ONLY public.fall_dokumente REPLICA IDENTITY FULL;


--
-- Name: COLUMN fall_dokumente.beschreibung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.beschreibung IS 'Freitext-Beschreibung des Kunden bei Onboarding-Upload (AAR-324). Wird im KB-Zuordnungs-Modal (AAR-326) als Kontext angezeigt.';


--
-- Name: COLUMN fall_dokumente.idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.idempotency_key IS 'AAR-388: Client-generierte UUID. Wird bei Upload aus Offline-Outbox gesetzt, damit Retry nach partiellem Sync (Storage-OK / DB-FAIL) idempotent bleibt. UNIQUE-Index faengt Doppel-Inserts ab.';


--
-- Name: COLUMN fall_dokumente.kategorie; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.kategorie IS 'UI-Kategorie (unterschrift, foto, zulassungsbescheinigung, gutachten, sonstiges). Treibt Farbcodierung und Filter in DokumenteTab. AAR-553 G1.';


--
-- Name: COLUMN fall_dokumente.quelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.quelle IS 'Herkunfts-Trail: flowlink, whatsapp, email, gutachter-portal, admin-upload, seed. Für Audit und Debugging. AAR-553 G1.';


--
-- Name: COLUMN fall_dokumente.sichtbar_fuer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.sichtbar_fuer IS 'ACL-Array: welche Rollen dürfen das Dokument sehen. Default admin+kundenbetreuer. Werte aus profiles.rolle. AAR-553 G1.';


--
-- Name: COLUMN fall_dokumente.position_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.position_id IS 'FK auf schadenspositionen, wenn Dokument (Foto) an eine konkrete Schaden-Position gebunden ist. Optional. AAR-553 G1.';


--
-- Name: COLUMN fall_dokumente.pflichtdokument_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.pflichtdokument_id IS 'CMM-21: Direkte FK zur pflichtdokumente-Slot-Row. Erlaubt Multi-File pro Slot (eine fall_dokumente-Row pro File, aggregiert über die FK).';


--
-- Name: COLUMN fall_dokumente.abgelehnt_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.abgelehnt_am IS 'CMM-32e: Wenn gesetzt, gehört das Dokument zu einer abgelehnten Iteration. Nur Admin/KB sehen es; SV/Kunde sehen es nicht mehr in ihren Listen.';


--
-- Name: COLUMN fall_dokumente.zurueckweisung_kommentar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.zurueckweisung_kommentar IS 'CMM-32e: Optionaler KB-Kommentar wenn dieses Dokument bei einer Zurückweisung explizit als fehlerhaft markiert wurde.';


--
-- Name: COLUMN fall_dokumente.kb_gesehen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.kb_gesehen_am IS 'A4: Zeitpunkt wo KB diesen Kunde-Upload zur Kenntnis genommen hat. NULL = ungelesen, zeigt rote Badge im Kanban.';


--
-- Name: COLUMN fall_dokumente.claim_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_dokumente.claim_id IS 'Direkte FK auf claims(id) für claim-zentrierte Storage-Pfade (AAR-862). Wird automatisch via Trigger aus faelle.claim_id gesetzt, wenn Caller nur fall_id übergibt.';


--
-- Name: fall_read_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fall_read_state (
    user_id uuid NOT NULL,
    fall_id uuid NOT NULL,
    last_read_chat_at timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    last_read_update_at timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fall_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fall_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    kunden_anliegen text,
    zusammenfassung text NOT NULL,
    empfohlene_naechste_schritte text,
    ai_modell text DEFAULT 'claude-sonnet-4-6'::text NOT NULL,
    prompt_tokens integer,
    completion_tokens integer,
    generated_by_user_id uuid,
    generated_at timestamp with time zone DEFAULT now(),
    fall_status_at_generation text,
    anzahl_dokumente_at_generation integer,
    anzahl_nachrichten_at_generation integer,
    letzte_timeline_event_at_generation timestamp with time zone
);


--
-- Name: COLUMN fall_summaries.ai_modell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fall_summaries.ai_modell IS 'Claude-Modell für diese Zusammenfassung. Default claude-sonnet-4-6 (AAR-437).';


--
-- Name: finance_eintraege; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_eintraege (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    typ text NOT NULL,
    betrag numeric,
    status text DEFAULT 'offen'::text,
    beschreibung text,
    referenz_id uuid,
    referenz_typ text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: finance_monatsberichte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_monatsberichte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    monat text NOT NULL,
    jahr integer NOT NULL,
    neue_faelle integer DEFAULT 0,
    aktive_faelle integer DEFAULT 0,
    einzelabverkauf_faelle integer DEFAULT 0,
    vollmacht_faelle integer DEFAULT 0,
    aktive_vm_faelle integer DEFAULT 0,
    leads_gesamt integer DEFAULT 0,
    lead_conversion_rate numeric(5,2) DEFAULT 0.60,
    vollmacht_quote numeric(5,2) DEFAULT 0.60,
    delta_paket_einnahmen numeric(10,2) DEFAULT 0,
    delta_einzel_einnahmen numeric(10,2) DEFAULT 0,
    kanzlei_provision numeric(10,2) DEFAULT 0,
    gesamt_einnahmen numeric(10,2) DEFAULT 0,
    fixkosten numeric(10,2) DEFAULT 0,
    betreuungskosten numeric(10,2) DEFAULT 0,
    db_ii numeric(10,2) DEFAULT 0,
    kum_db_ii numeric(10,2) DEFAULT 0,
    claimondo_gewinn_75 numeric(10,2) DEFAULT 0,
    kanzlei_gewinn_25 numeric(10,2) DEFAULT 0,
    marketing_budget_netto numeric(10,2) DEFAULT 0,
    marketing_budget_brutto numeric(10,2) DEFAULT 0,
    maik_google_cpl numeric(10,2) DEFAULT 0,
    maik_cpa_fix numeric(10,2) DEFAULT 150,
    maik_provision numeric(10,2) DEFAULT 0,
    kontingent_gutachter integer DEFAULT 0,
    gutachter_anzahlungen_gesamt numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: flow_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    geoeffnet_am timestamp with time zone,
    abgeschlossen_am timestamp with time zone,
    status text DEFAULT 'erstellt'::text NOT NULL,
    fall_id uuid,
    expires_at timestamp with time zone,
    service_typ text DEFAULT 'komplett'::text,
    sprache text DEFAULT 'de'::text,
    CONSTRAINT flow_links_sprache_check CHECK ((sprache = ANY (ARRAY['de'::text, 'tr'::text, 'ar'::text, 'ru'::text, 'pl'::text, 'en'::text, 'other'::text])))
);


--
-- Name: TABLE flow_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.flow_links IS 'Service-Role-only (AAR-895). Magic-Link-Token-Gate für /flow/[token]-Flow, Token-Resolution ausschließlich server-side via createAdminClient.';


--
-- Name: COLUMN flow_links.sprache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flow_links.sprache IS 'AAR-316: Aus leads.sprache übernommen — steuert FlowLink-Übersetzungen.';


--
-- Name: forderungspositionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forderungspositionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    typ text NOT NULL,
    bezeichnung text NOT NULL,
    betrag_gefordert numeric,
    betrag_reguliert numeric,
    betrag_gekuerzt numeric,
    quelle text,
    dokument_id uuid,
    erstellt_am timestamp with time zone DEFAULT now(),
    CONSTRAINT forderungspositionen_quelle_check CHECK ((quelle = ANY (ARRAY['anspruchsschreiben'::text, 'ruegeschreiben'::text, 'gutachten'::text, 'manuell'::text]))),
    CONSTRAINT forderungspositionen_typ_check CHECK ((typ = ANY (ARRAY['reparatur'::text, 'wertminderung'::text, 'nutzungsausfall'::text, 'mietwagen'::text, 'gutachterkosten'::text, 'abschleppkosten'::text, 'anwaltskosten'::text, 'kostenpauschale'::text, 'schmerzensgeld'::text, 'wbw'::text, 'restwert'::text, 'sonstiges'::text])))
);


--
-- Name: gebiet_exklusivitaeten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebiet_exklusivitaeten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    isochron_geojson jsonb NOT NULL,
    aktiv_seit timestamp with time zone DEFAULT now() NOT NULL,
    aktiv_bis timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gfa_rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gfa_rate_limit (
    id bigint NOT NULL,
    ip_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE gfa_rate_limit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gfa_rate_limit IS 'AAR-915 — Audit-Trail für Rate-Limit (nur IP-Hash, kein Klartext). Lazy-Cleanup nach 24h.';


--
-- Name: gfa_rate_limit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gfa_rate_limit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gfa_rate_limit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gfa_rate_limit_id_seq OWNED BY public.gfa_rate_limit.id;


--
-- Name: google_bewertungen_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_bewertungen_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    durchschnitt numeric(3,1),
    anzahl_bewertungen integer,
    zuletzt_aktualisiert_am timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_reference text
);


--
-- Name: gutachten_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachten_fotos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gutachten_id uuid NOT NULL,
    claim_id uuid NOT NULL,
    upload_quelle text NOT NULL,
    uploaded_by uuid,
    storage_path text NOT NULL,
    original_filename text,
    mime_type text,
    file_size_bytes integer,
    aufnahme_zeitpunkt timestamp with time zone,
    beschreibung text,
    position_nr integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    exif_processed boolean DEFAULT false NOT NULL,
    kategorie text,
    CONSTRAINT gutachten_fotos_kategorie_check CHECK ((kategorie = ANY (ARRAY['uebersicht'::text, 'vin'::text, 'kennzeichen'::text, 'tacho'::text, 'schadenstelle'::text, 'innen'::text, 'sonstiges'::text]))),
    CONSTRAINT gutachten_fotos_upload_quelle_check CHECK ((upload_quelle = ANY (ARRAY['sv'::text, 'laeufer'::text, 'kunde'::text, 'admin'::text])))
);


--
-- Name: TABLE gutachten_fotos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gutachten_fotos IS 'AAR-821: Schadensfotos zu einem Gutachten. upload_quelle: sv/laeufer/kunde/admin. Storage-Bucket: gutachten-fotos. Keine eigene Phase-Kopplung — läuft über gutachten.status.';


--
-- Name: gutachten_positionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachten_positionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gutachten_id uuid NOT NULL,
    claim_id uuid NOT NULL,
    position_nr integer NOT NULL,
    bezeichnung text NOT NULL,
    kategorie text,
    schadensbetrag_netto numeric(10,2),
    schadensbetrag_brutto numeric(10,2),
    mwst_satz numeric(5,2) DEFAULT 19.00,
    reparaturart text,
    ersatzteil_nr text,
    arbeitszeit_aw numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gutachten_positionen_kategorie_check CHECK ((kategorie = ANY (ARRAY['karosserie'::text, 'lack'::text, 'mechanik'::text, 'glas'::text, 'interieur'::text, 'elektrik'::text, 'sonstiges'::text]))),
    CONSTRAINT gutachten_positionen_reparaturart_check CHECK ((reparaturart = ANY (ARRAY['instandsetzung'::text, 'ersatz'::text, 'lackierung'::text, 'keine'::text])))
);


--
-- Name: TABLE gutachten_positionen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gutachten_positionen IS 'AAR-819: Einzelne Schadenspositionen eines Gutachtens. Phase-Kopplung läuft über gutachten.status (AAR-818). position_nr eindeutig je Gutachten.';


--
-- Name: gutachter_abrechnungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_abrechnungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    fall_id uuid,
    schadenhoehe numeric(10,2),
    leadpreis numeric(10,2),
    preistyp text,
    guthaben_vorher numeric(10,2),
    guthaben_nachher numeric(10,2),
    monat text,
    abgerechnet_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: gutachter_abrechnungspositionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_abrechnungspositionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abrechnung_id uuid,
    fall_id uuid,
    kunde_name text,
    kennzeichen text,
    schadenshoehe numeric(10,2),
    leadpreis numeric(10,2),
    leadpreis_typ text,
    termin_datum date,
    erstellt_am timestamp with time zone DEFAULT now()
);


--
-- Name: gutachter_einzahlungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_einzahlungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    betrag numeric(10,2) NOT NULL,
    typ text,
    beschreibung text,
    eingezahlt_am timestamp with time zone DEFAULT now()
);


--
-- Name: gutachter_finder_anfragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_finder_anfragen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vorname text NOT NULL,
    nachname text NOT NULL,
    email text NOT NULL,
    telefon text,
    kennzeichen text,
    fahrzeug_beschreibung text,
    schadentyp text NOT NULL,
    schadenort text,
    schadenort_lat double precision,
    schadenort_lng double precision,
    wunschtermin timestamp with time zone,
    zugeordneter_sv_id uuid,
    zugeordneter_sv_lead_id uuid,
    matching_typ text,
    sa_signatur_data_url text,
    sa_unterzeichnet_am timestamp with time zone,
    status text DEFAULT 'neu'::text NOT NULL,
    bestaetigung_gesendet_am timestamp with time zone,
    fall_id uuid,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    abgebrochen_am timestamp with time zone,
    abbruch_phase text,
    regulierungs_modus text,
    fin_vin text,
    hsn text,
    tsn text,
    erstzulassung text,
    fahrzeug_baujahr integer,
    fahrzeug_hersteller text,
    fahrzeug_modell text,
    fahrzeug_farbe text,
    halter_vorname text,
    halter_nachname text,
    halter_strasse text,
    halter_plz text,
    halter_stadt text,
    ocr_extrahiert_am timestamp with time zone,
    ocr_rohdaten jsonb,
    imagin_url text,
    vorschaden_check_status text,
    vorschaden_check_payload jsonb,
    konvertiert_zu_user_id uuid,
    konvertiert_zu_lead_id uuid,
    konvertiert_zu_fall_id uuid,
    konvertiert_am timestamp with time zone,
    magic_link_gesendet_am timestamp with time zone,
    konvertierung_fehler text,
    am_unfallort_flag boolean DEFAULT false,
    aufnahme_fotos jsonb DEFAULT '[]'::jsonb,
    aufgenommen_am timestamp with time zone,
    whatsapp_verfuegbar boolean,
    whatsapp_geprueft_am timestamp with time zone,
    schuldfrage text,
    fahrzeug_fahrbereit boolean,
    schadens_kurzbeschreibung text,
    fahrzeugtyp text,
    wunschtermin_wann text,
    bevorzugter_kanal text,
    dsgvo_zustimmung_am timestamp with time zone,
    reservierter_slot_von timestamp with time zone,
    reservierter_slot_bis timestamp with time zone,
    reservierter_sv_id uuid,
    unterschrift_data_url text,
    kanzlei_wunsch text,
    besichtigungsort_adresse text,
    ga_client_id text,
    embed_site_id uuid,
    source text,
    variante text,
    cluster text,
    stadt_slug text,
    gclid text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    page_url text,
    origin_domain text,
    termin_id uuid,
    abrechnungs_relevant boolean DEFAULT false NOT NULL,
    abrechnungs_betrag_eur numeric(10,2),
    abrechnung_id uuid,
    abgerechnet_am timestamp with time zone,
    CONSTRAINT gfa_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['kfz_gutachter_lp'::text, 'sv_embed'::text])))),
    CONSTRAINT gfa_variante_check CHECK (((variante IS NULL) OR (variante = ANY (ARRAY['A'::text, 'B'::text])))),
    CONSTRAINT gutachter_finder_anfragen_bevorzugter_kanal_check CHECK ((bevorzugter_kanal = ANY (ARRAY['whatsapp'::text, 'email'::text, 'anruf'::text]))),
    CONSTRAINT gutachter_finder_anfragen_fahrzeugtyp_check CHECK ((fahrzeugtyp = ANY (ARRAY['pkw'::text, 'motorrad'::text, 'transporter'::text, 'lkw'::text, 'wohnmobil'::text]))),
    CONSTRAINT gutachter_finder_anfragen_kanzlei_wunsch_check CHECK (((kanzlei_wunsch = ANY (ARRAY['partnerkanzlei'::text, 'eigene_kanzlei'::text, 'keine_kanzlei'::text, 'noch_unentschieden'::text])) OR (kanzlei_wunsch IS NULL))),
    CONSTRAINT gutachter_finder_anfragen_regulierungs_modus_check CHECK (((regulierungs_modus IS NULL) OR (regulierungs_modus = ANY (ARRAY['komplett'::text, 'nur_gutachter'::text, 'vollstaendig'::text, 'nur_gutachten'::text])))),
    CONSTRAINT gutachter_finder_anfragen_schuldfrage_check CHECK ((schuldfrage = ANY (ARRAY['gegner'::text, 'unklar'::text, 'teilschuld'::text]))),
    CONSTRAINT gutachter_finder_anfragen_vorschaden_check_status_check CHECK ((vorschaden_check_status = ANY (ARRAY['ausstehend'::text, 'kein_vorschaden'::text, 'vorschaden_erkannt'::text, 'nicht_verfuegbar'::text]))),
    CONSTRAINT gutachter_finder_anfragen_wunschtermin_wann_check CHECK ((wunschtermin_wann = ANY (ARRAY['sofort'::text, 'heute'::text, 'tage'::text])))
);


--
-- Name: COLUMN gutachter_finder_anfragen.regulierungs_modus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.regulierungs_modus IS 'Z35-Wahl: vollstaendig=Anwalt+alle Positionen, nur_gutachten=Selbst-Regulierung';


--
-- Name: COLUMN gutachter_finder_anfragen.fahrzeug_baujahr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.fahrzeug_baujahr IS 'Baujahr des beschädigten Fahrzeugs';


--
-- Name: COLUMN gutachter_finder_anfragen.fahrzeug_hersteller; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.fahrzeug_hersteller IS 'Hersteller / Marke des Fahrzeugs, z.B. BMW, VW';


--
-- Name: COLUMN gutachter_finder_anfragen.fahrzeug_modell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.fahrzeug_modell IS 'Modell des Fahrzeugs, z.B. 3er, Golf';


--
-- Name: COLUMN gutachter_finder_anfragen.imagin_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.imagin_url IS 'Imagin-Studio CDN-URL fuer Fahrzeug-Visualisierung, gebaut aus make/model/year';


--
-- Name: COLUMN gutachter_finder_anfragen.vorschaden_check_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.vorschaden_check_status IS 'CarDentity Typ-A Ergebnis: kein_vorschaden | vorschaden_erkannt | nicht_verfuegbar';


--
-- Name: COLUMN gutachter_finder_anfragen.konvertiert_zu_fall_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.konvertiert_zu_fall_id IS 'Endziel der Self-Dispatch-Strecke — Kunde landet via Magic-Link in /kunde/faelle/{id}';


--
-- Name: COLUMN gutachter_finder_anfragen.am_unfallort_flag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.am_unfallort_flag IS 'Aaron 10.05.: User hat im Routing-Step "ja, am Unfallort" geklickt — Soforthilfe-Pfad statt klassischer Termin-Buchung';


--
-- Name: COLUMN gutachter_finder_anfragen.aufnahme_fotos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.aufnahme_fotos IS 'Array aus Storage-URLs der vor Ort aufgenommenen Fotos (Übersicht / Schaden nah / Kennzeichen / Umfeld)';


--
-- Name: COLUMN gutachter_finder_anfragen.aufgenommen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.aufgenommen_am IS 'Zeitpunkt der Foto-Aufnahme — kombiniert mit schadenort_lat/lng als Beweismittel';


--
-- Name: COLUMN gutachter_finder_anfragen.whatsapp_verfuegbar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.whatsapp_verfuegbar IS 'Ob die Telefonnummer ein WhatsApp-Konto hat. NULL = noch nie geprüft.';


--
-- Name: COLUMN gutachter_finder_anfragen.whatsapp_geprueft_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.whatsapp_geprueft_am IS 'Letzter erfolgreicher Lookup. Cache-TTL 30 Tage.';


--
-- Name: COLUMN gutachter_finder_anfragen.schuldfrage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.schuldfrage IS 'Schuldfrage aus Phase Schaden: gegner | unklar | teilschuld';


--
-- Name: COLUMN gutachter_finder_anfragen.fahrzeug_fahrbereit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.fahrzeug_fahrbereit IS 'Ist das Fahrzeug noch fahrbereit?';


--
-- Name: COLUMN gutachter_finder_anfragen.schadens_kurzbeschreibung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.schadens_kurzbeschreibung IS 'Freitext-Kurzbeschreibung des Schadens (ergänzt schadentyp)';


--
-- Name: COLUMN gutachter_finder_anfragen.fahrzeugtyp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.fahrzeugtyp IS 'Fahrzeugkategorie für SV-Spezialisierung: pkw | motorrad | transporter | lkw | wohnmobil';


--
-- Name: COLUMN gutachter_finder_anfragen.wunschtermin_wann; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.wunschtermin_wann IS 'Zeitpräferenz aus Phase Termin: sofort | heute | tage';


--
-- Name: COLUMN gutachter_finder_anfragen.bevorzugter_kanal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.bevorzugter_kanal IS 'Bevorzugter Kontaktkanal: whatsapp | email | anruf';


--
-- Name: COLUMN gutachter_finder_anfragen.dsgvo_zustimmung_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.dsgvo_zustimmung_am IS 'Zeitstempel der DSGVO-Einwilligung — muss vor erstem saveOnboardingStep gesetzt sein';


--
-- Name: COLUMN gutachter_finder_anfragen.reservierter_slot_von; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.reservierter_slot_von IS 'PR 4: Beginn des reservierten Slots — wird beim SlotField-Submit gesetzt, nach 30 Min TTL-Cron freigegeben.';


--
-- Name: COLUMN gutachter_finder_anfragen.reservierter_slot_bis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.reservierter_slot_bis IS 'PR 4: Ende des reservierten Slots (typisch +60 Min). EXCLUSION CONSTRAINT verhindert Kollision.';


--
-- Name: COLUMN gutachter_finder_anfragen.reservierter_sv_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.reservierter_sv_id IS 'PR 4: SV für den der Slot reserviert ist — Teil des EXCLUSION CONSTRAINT.';


--
-- Name: COLUMN gutachter_finder_anfragen.unterschrift_data_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.unterschrift_data_url IS 'PR 5: Base64 Data-URL der Kunden-Signatur aus dem Wizard-Abschluss-Step.';


--
-- Name: COLUMN gutachter_finder_anfragen.kanzlei_wunsch; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.kanzlei_wunsch IS '2026-05-12 Funnel v3: vom Wizard gesetzt, wird in konvertiereAnfrageZuFall an claims.kanzlei_wunsch propagiert.';


--
-- Name: COLUMN gutachter_finder_anfragen.besichtigungsort_adresse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.besichtigungsort_adresse IS 'Freitext-Adresse aus Wizard-Phase 10 (Strasse, PLZ, Ort). Geocoding nach lat/lng erfolgt nicht hier — beim finalize wird der Wert nach faelle.besichtigungsort_adresse übertragen.';


--
-- Name: COLUMN gutachter_finder_anfragen.ga_client_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gutachter_finder_anfragen.ga_client_id IS 'GA4 client_id (_ga-Cookie) fuer Measurement-Protocol-Attribution. Nur gesetzt bei erteiltem Tracking-Consent.';


--
-- Name: gutachter_mitteilungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_mitteilungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    fall_id uuid,
    typ text NOT NULL,
    titel text NOT NULL,
    nachricht text NOT NULL,
    gelesen boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: gutachter_monatsabrechnungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_monatsabrechnungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    monat date NOT NULL,
    faelle_im_paket integer DEFAULT 0,
    faelle_einzel integer DEFAULT 0,
    summe_paket numeric(10,2) DEFAULT 0,
    summe_einzel numeric(10,2) DEFAULT 0,
    gesamtbetrag numeric(10,2) DEFAULT 0,
    status text DEFAULT 'offen'::text,
    faellig_am date,
    bezahlt_am date,
    erstellt_am timestamp with time zone DEFAULT now()
);


--
-- Name: gutachter_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutachter_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vorname text NOT NULL,
    nachname text NOT NULL,
    email text NOT NULL,
    telefon text,
    plz text NOT NULL,
    ort text,
    standort_lat numeric(10,7),
    standort_lng numeric(10,7),
    dat_expert_nummer text,
    bvsk_mitgliedsnummer text,
    ihk_zertifikat_nummer text,
    oebuv_bestellungsnummer text,
    unternehmen text,
    jahre_erfahrung integer,
    aktuelle_auftraege_pro_monat integer,
    schwerpunkte text,
    status text DEFAULT 'neu'::text NOT NULL,
    notizen_admin text,
    konvertiert_zu_sv_id uuid,
    quelle text,
    user_agent text,
    ip_hash text,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    zuletzt_geaendert_am timestamp with time zone DEFAULT now() NOT NULL,
    bearbeitet_von_user_id uuid,
    CONSTRAINT gutachter_waitlist_email_format CHECK ((email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)),
    CONSTRAINT gutachter_waitlist_plz_format CHECK ((plz ~ '^[0-9]{5}$'::text)),
    CONSTRAINT gutachter_waitlist_status_check CHECK ((status = ANY (ARRAY['neu'::text, 'kontaktiert'::text, 'qualifiziert'::text, 'onboarding'::text, 'aktiv'::text, 'abgelehnt'::text, 'kein_interesse'::text])))
);


--
-- Name: TABLE gutachter_waitlist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gutachter_waitlist IS 'Bewerbungen von Sachverständigen über gutachter.claimondo.de. Vor-Onboarding-Stufe — wird vom Admin triagt und in sachverstaendige konvertiert wenn passend.';


--
-- Name: gutschriften; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gutschriften (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    betrag_netto numeric(10,2) NOT NULL,
    mwst_betrag numeric(10,2) NOT NULL,
    betrag_brutto numeric(10,2) NOT NULL,
    grund text NOT NULL,
    referenz_fall_id uuid,
    referenz_abrechnung_id uuid,
    status text DEFAULT 'offen'::text NOT NULL,
    verrechnet_in_abrechnung_id uuid,
    ausgezahlt_am timestamp with time zone,
    stripe_refund_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: incentive_auszahlungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incentive_auszahlungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incentive_id uuid,
    mitarbeiter_id uuid,
    monat text,
    betrag numeric(10,2),
    status text DEFAULT 'offen'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT incentive_auszahlungen_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'genehmigt'::text, 'ausgezahlt'::text])))
);


--
-- Name: incentives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incentives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titel text NOT NULL,
    beschreibung text,
    kategorie text,
    typ text,
    bedingung text NOT NULL,
    wert numeric(10,2),
    aktiv boolean DEFAULT true,
    gueltig_ab date,
    gueltig_bis date,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT incentives_kategorie_check CHECK ((kategorie = ANY (ARRAY['dispatch'::text, 'kundenbetreuer'::text, 'alle'::text]))),
    CONSTRAINT incentives_typ_check CHECK ((typ = ANY (ARRAY['bonus'::text, 'provision'::text, 'sachleistung'::text, 'freizeit'::text])))
);


--
-- Name: individuelle_anfragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.individuelle_anfragen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    gewuenschte_faelle integer,
    gewuenschter_radius_km integer,
    nachricht text,
    status text DEFAULT 'neu'::text,
    erstellt_am timestamp with time zone DEFAULT now()
);


--
-- Name: kanzlei_abrechnung_positionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzlei_abrechnung_positionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kanzlei_abrechnung_id uuid NOT NULL,
    fall_id uuid NOT NULL,
    fall_nr text NOT NULL,
    kunde_name text NOT NULL,
    vollmacht_unterschrieben_am timestamp with time zone NOT NULL,
    betrag_netto numeric(10,2) DEFAULT 150 NOT NULL,
    position_nr integer NOT NULL
);


--
-- Name: kanzlei_abrechnung_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzlei_abrechnung_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kanzlei_abrechnung_id uuid NOT NULL,
    reminder_typ text NOT NULL,
    gesendet_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kanzlei_abrechnungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzlei_abrechnungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kanzlei_id uuid,
    abrechnungsmonat integer NOT NULL,
    abrechnungsjahr integer NOT NULL,
    rechnungsnummer text NOT NULL,
    anzahl_vollmachten integer NOT NULL,
    betrag_pro_vollmacht_netto numeric(10,2) DEFAULT 150 NOT NULL,
    endbetrag_netto numeric(10,2) NOT NULL,
    mwst_betrag numeric(10,2) NOT NULL,
    endbetrag_brutto numeric(10,2) NOT NULL,
    pdf_storage_path text,
    magic_link_token text NOT NULL,
    magic_link_expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'erstellt'::text NOT NULL,
    faelligkeitsdatum date NOT NULL,
    stripe_payment_intent_id text,
    stripe_checkout_session_id text,
    versendet_am timestamp with time zone,
    bezahlt_am timestamp with time zone,
    fehlgeschlagen_am timestamp with time zone,
    fehlgeschlagen_grund text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kanzlei_abrechnungen_status_check CHECK ((status = ANY (ARRAY['erstellt'::text, 'versendet'::text, 'bezahlt'::text, 'fehlgeschlagen'::text, 'storniert'::text])))
);


--
-- Name: kanzlei_admin_termine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzlei_admin_termine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kanzlei_user_id uuid NOT NULL,
    admin_user_id uuid NOT NULL,
    fall_id uuid,
    start_zeit timestamp with time zone NOT NULL,
    end_zeit timestamp with time zone NOT NULL,
    typ text NOT NULL,
    titel text NOT NULL,
    beschreibung text,
    status text DEFAULT 'gebucht'::text NOT NULL,
    google_event_id text,
    google_meet_link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kanzlei_admin_termine_status_check CHECK ((status = ANY (ARRAY['gebucht'::text, 'abgesagt'::text, 'durchgefuehrt'::text]))),
    CONSTRAINT kanzlei_admin_termine_typ_check CHECK ((typ = ANY (ARRAY['video'::text, 'vor_ort'::text])))
);


--
-- Name: kanzlei_pakete; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzlei_pakete (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    empfaenger_typ text NOT NULL,
    empfaenger_kanzlei_name text NOT NULL,
    empfaenger_kanzlei_email text,
    empfaenger_kanzlei_telefon text,
    empfaenger_kanzlei_kontaktperson text,
    inhalt_dokumente_jsonb jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'entwurf'::text NOT NULL,
    versendet_am timestamp with time zone,
    versendet_durch_user_id uuid,
    versand_methode text,
    versand_external_id text,
    bestaetigt_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notiz text,
    CONSTRAINT kanzlei_pakete_empfaenger_typ_check CHECK ((empfaenger_typ = ANY (ARRAY['partnerkanzlei'::text, 'eigene_kanzlei'::text]))),
    CONSTRAINT kanzlei_pakete_status_check CHECK ((status = ANY (ARRAY['entwurf'::text, 'versendet'::text, 'bestaetigt'::text, 'fehlgeschlagen'::text]))),
    CONSTRAINT kanzlei_pakete_versand_methode_check CHECK ((versand_methode = ANY (ARRAY['email'::text, 'post'::text, 'portal_lexdrive'::text])))
);


--
-- Name: TABLE kanzlei_pakete; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kanzlei_pakete IS 'AAR-841: Kanzleipaket-Versand pro Claim. Drei Wege: Partnerkanzlei (LexDrive), eigene Kanzlei (Kunde nennt), keine. Bei eigene_kanzlei wird claim auf an_externe_kanzlei_uebergeben gesetzt (Endzustand für uns, siehe AAR-840). AAR-842 zeigt QR-Block sobald status=versendet.';


--
-- Name: kanzleien; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanzleien (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    adresse text,
    ust_id text,
    iban text,
    ansprechpartner text,
    aktiv boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ki_gespraeche; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ki_gespraeche (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    rolle text NOT NULL,
    user_id uuid,
    nachrichten jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ki_gespraeche_rolle_check CHECK ((rolle = ANY (ARRAY['kunde'::text, 'kundenbetreuer'::text, 'makler'::text])))
);


--
-- Name: TABLE ki_gespraeche; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ki_gespraeche IS 'AAR-319: Multi-Turn-Chat für FAQ-Bot (Kunde) + KB-Assistent. Ein Gespräch pro Fall+Rolle+User.';


--
-- Name: kunde_gutachten_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kunde_gutachten_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    empfaenger_email text NOT NULL,
    magic_link_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accessed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE kunde_gutachten_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kunde_gutachten_requests IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';


--
-- Name: COLUMN kunde_gutachten_requests.magic_link_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kunde_gutachten_requests.magic_link_token IS 'Unguessable Token (crypto.randomUUID). Expiry 48h.';


--
-- Name: COLUMN kunde_gutachten_requests.accessed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kunde_gutachten_requests.accessed_at IS 'Erstmaliger Abruf — weitere Abrufe sind erlaubt, accessed_at bleibt beim ersten Zeitpunkt.';


--
-- Name: kunde_live_position; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kunde_live_position (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kunde_id uuid,
    termin_id uuid NOT NULL,
    lat numeric NOT NULL,
    lng numeric NOT NULL,
    accuracy_m numeric,
    speed_kmh numeric,
    distance_to_target_meters integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE kunde_live_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kunde_live_position IS 'AAR-380: Live-Position des Kunden auf Anfahrt. Symmetrie zu sv_live_position.';


--
-- Name: COLUMN kunde_live_position.kunde_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kunde_live_position.kunde_id IS 'Auth-User-ID des Kunden falls eingeloggt. NULL für Token-Flow (AAR-384) — Server-Action verifiziert dann gutachter_termine.kunden_tracking_token.';


--
-- Name: lead_historie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_historie (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    feld text NOT NULL,
    alter_wert text,
    neuer_wert text,
    geaendert_von uuid,
    geaendert_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE lead_historie; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_historie IS 'Service-Role-only (AAR-895). Lead-Audit-Trail aus Dispatch-Actions, kein User-facing Lese-Pfad.';


--
-- Name: leadpreise_tabelle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leadpreise_tabelle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schadenhoehe_bis_netto numeric(10,2) NOT NULL,
    paketpreis_netto numeric(10,2) NOT NULL,
    einzelpreis_netto numeric(10,2) NOT NULL,
    version text DEFAULT 'v1'::text NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads_lead_nummer_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leads_lead_nummer_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: makler; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.makler (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    firma text NOT NULL,
    ansprechpartner_vorname text NOT NULL,
    ansprechpartner_nachname text NOT NULL,
    ihk_nummer text,
    email text NOT NULL,
    telefon text,
    adresse_strasse text,
    adresse_plz text,
    adresse_ort text,
    bank_iban text,
    bank_bic text,
    bank_kontoinhaber text,
    provision_betrag_komplett_netto numeric(10,2) DEFAULT 100.00 NOT NULL,
    provision_betrag_nur_gutachter_netto numeric(10,2) DEFAULT 50.00 NOT NULL,
    provision_aktiv boolean DEFAULT true NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    aktiviert_am timestamp with time zone,
    aktiviert_von uuid,
    gesperrt_am timestamp with time zone,
    gesperrt_grund text,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    aktualisiert_am timestamp with time zone DEFAULT now() NOT NULL,
    notification_preferences jsonb DEFAULT '{"neuer_lead": true, "kanzlei_uebergabe": true, "monats_abrechnung": true, "provision_freigegeben": true, "woechentlicher_report": false}'::jsonb,
    CONSTRAINT makler_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'aktiv'::text, 'gesperrt'::text, 'deaktiviert'::text])))
);


--
-- Name: COLUMN makler.notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.makler.notification_preferences IS 'AAR-492: Email-Benachrichtigungs-Präferenzen (Opt-In/Out). Schema: neuer_lead|kanzlei_uebergabe|provision_freigegeben|monats_abrechnung|woechentlicher_report : bool.';


--
-- Name: makler_fall_consent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.makler_fall_consent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    makler_id uuid NOT NULL,
    consent_scope text DEFAULT 'minimal'::text NOT NULL,
    consent_gegeben_am timestamp with time zone DEFAULT now() NOT NULL,
    widerrufen_am timestamp with time zone,
    widerrufen_von uuid,
    CONSTRAINT makler_fall_consent_consent_scope_check CHECK ((consent_scope = ANY (ARRAY['minimal'::text, 'vollzugriff'::text])))
);


--
-- Name: makler_provisionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.makler_provisionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    makler_id uuid NOT NULL,
    lead_id uuid,
    fall_id uuid,
    promotion_code_id uuid,
    betrag_netto_eur numeric(10,2) NOT NULL,
    service_typ text NOT NULL,
    trigger_event text NOT NULL,
    trigger_at timestamp with time zone NOT NULL,
    hold_until timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    storniert_am timestamp with time zone,
    storno_grund text,
    abrechnung_id uuid,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT makler_provisionen_service_typ_check CHECK ((service_typ = ANY (ARRAY['komplett'::text, 'nur_gutachter'::text]))),
    CONSTRAINT makler_provisionen_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'freigegeben'::text, 'storniert'::text, 'ausgezahlt'::text])))
);


--
-- Name: matelso_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matelso_calls (
    id bigint NOT NULL,
    external_call_id text NOT NULL,
    direction text DEFAULT 'inbound'::text NOT NULL,
    status text,
    status_raw text,
    from_number text,
    to_number text,
    duration integer,
    quelle text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid,
    fall_id uuid,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: matelso_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.matelso_calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matelso_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.matelso_calls_id_seq OWNED BY public.matelso_calls.id;


--
-- Name: mitarbeiter_performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mitarbeiter_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mitarbeiter_id uuid,
    monat text NOT NULL,
    jahr integer NOT NULL,
    leads_qualifiziert integer DEFAULT 0,
    leads_konvertiert integer DEFAULT 0,
    faelle_abgeschlossen integer DEFAULT 0,
    aktive_faelle integer DEFAULT 0,
    durchschnittliche_bearbeitungszeit_tage numeric(5,1),
    kundenzufriedenheit numeric(3,1),
    umsatz_generiert numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mitteilungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mitteilungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empfaenger_id uuid NOT NULL,
    empfaenger_rolle text NOT NULL,
    kategorie text NOT NULL,
    titel text NOT NULL,
    inhalt text,
    kontext_typ text,
    kontext_id uuid,
    route_url text,
    gelesen boolean DEFAULT false NOT NULL,
    gelesen_am timestamp with time zone,
    absender_id uuid,
    absender_name text,
    icon text,
    prioritaet text DEFAULT 'normal'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mitteilungen_kategorie_check CHECK ((kategorie = ANY (ARRAY['update'::text, 'task'::text, 'nachricht'::text, 'anruf'::text]))),
    CONSTRAINT mitteilungen_prioritaet_check CHECK ((prioritaet = ANY (ARRAY['normal'::text, 'hoch'::text, 'dringend'::text])))
);


--
-- Name: nachrichten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nachrichten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    kanal text NOT NULL,
    sender_id uuid,
    sender_rolle text,
    nachricht text NOT NULL,
    hat_anhang boolean DEFAULT false,
    anhang_url text,
    anhang_typ text,
    gelesen boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    empfaenger_id uuid,
    is_system boolean DEFAULT false NOT NULL,
    system_event text,
    lead_id uuid,
    kb_empfaenger_id uuid,
    external_id text,
    richtung text DEFAULT 'outbound'::text,
    external_message_id text,
    empfaenger_kontakt text,
    template_key text,
    fehlermeldung text,
    status text,
    CONSTRAINT nachrichten_kanal_check CHECK ((kanal = ANY (ARRAY['whatsapp'::text, 'chat_kb_kunde'::text, 'gruppenchat'::text, 'chat_kunde_sv'::text, 'chat_kb_sv'::text, 'chat_gruppe_mit_makler'::text]))),
    CONSTRAINT nachrichten_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['gesendet'::text, 'fehlgeschlagen'::text, 'zugestellt'::text, 'gelesen'::text, 'queued'::text]))))
);


--
-- Name: COLUMN nachrichten.external_message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nachrichten.external_message_id IS 'ID des externen Provider-Messages (Baileys jid+id, Twilio MessageSid, Resend message-id). Für Delivery-Webhook-Lookup.';


--
-- Name: COLUMN nachrichten.empfaenger_kontakt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nachrichten.empfaenger_kontakt IS 'Konkrete Kontakt-Adresse (Phone für WA/SMS, Email-Adresse für Email). Komplementär zu empfaenger_id welche auf einen User-Eintrag zeigt.';


--
-- Name: COLUMN nachrichten.template_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nachrichten.template_key IS 'Identifier des Message-Templates für Reporting + A/B-Testing.';


--
-- Name: COLUMN nachrichten.fehlermeldung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nachrichten.fehlermeldung IS 'Fehler-Detail wenn status=fehlgeschlagen.';


--
-- Name: COLUMN nachrichten.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nachrichten.status IS 'Send-Status: queued, gesendet, zugestellt, gelesen, fehlgeschlagen.';


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    recipient_role text NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    skip_reason text,
    external_id text,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_deliveries_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'web_push'::text, 'native_push'::text, 'in_app'::text]))),
    CONSTRAINT notification_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: TABLE notification_deliveries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_deliveries IS 'AAR-497 N2: Per-Empfänger × Channel Delivery-Log. status=pending → sent/failed/skipped. external_id referenziert Twilio-MessageSID / Web-Push-Endpoint / etc.';


--
-- Name: notification_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    fall_id uuid,
    triggered_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    CONSTRAINT notification_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE notification_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_events IS 'AAR-497 N2: Zentrale Event-Tabelle. Jeder Domain-Event (fall.sv_assigned, task.created, etc.) wird hier appended. Worker verarbeitet status=pending mit FOR UPDATE SKIP LOCKED und fan-outed auf notification_deliveries.';


--
-- Name: COLUMN notification_events.next_retry_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_events.next_retry_at IS 'AAR-497: Zeitpunkt für den nächsten Retry-Versuch bei failed-Events (exp. Backoff: 1min → 5min → 30min → 2h → dead-letter).';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    timezone text DEFAULT 'Europe/Berlin'::text NOT NULL,
    channel_opt_outs jsonb DEFAULT '[]'::jsonb NOT NULL,
    event_opt_outs jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'AAR-500 N5: Per-User Benachrichtigungs-Praeferenzen. channel_opt_outs: string[] ("whatsapp","email","web_push","in_app"). event_opt_outs: Record<eventType, channel[]>. urgent-priority-Events umgehen Quiet-Hours.';


--
-- Name: ocr_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ocr_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gutachten_id uuid NOT NULL,
    run_nummer integer NOT NULL,
    engine text NOT NULL,
    engine_version text NOT NULL,
    prompt_hash text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    raw_response_jsonb jsonb,
    parsed_fields_jsonb jsonb,
    confidence_per_field_jsonb jsonb,
    overall_confidence numeric(3,2),
    validation_errors_jsonb jsonb,
    validation_passed boolean,
    ai_usage_log_id uuid,
    cost_usd numeric(8,4),
    status text DEFAULT 'running'::text NOT NULL,
    error_jsonb jsonb,
    triggered_by text NOT NULL,
    triggered_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ocr_runs_engine_check CHECK ((engine = ANY (ARRAY['claude_vision'::text, 'google_vision'::text]))),
    CONSTRAINT ocr_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'superseded'::text]))),
    CONSTRAINT ocr_runs_triggered_by_check CHECK ((triggered_by = ANY (ARRAY['auto_after_upload'::text, 'manual_kb_retry'::text, 'manual_admin_retry'::text, 'cron_recovery'::text])))
);


--
-- Name: TABLE ocr_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ocr_runs IS 'AAR-838: Audit-Trail pro OCR-Lauf. Run_nummer inkrementiert bei Re-Run. Letzter erfolgreicher Run via gutachten.ocr_run_id verlinkt. cost_usd via ai_usage_log_id traceable.';


--
-- Name: onboarding_felder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_felder (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid NOT NULL,
    reihenfolge integer NOT NULL,
    feld_key text NOT NULL,
    typ text NOT NULL,
    label text NOT NULL,
    hint text,
    placeholder text,
    pflicht boolean DEFAULT false NOT NULL,
    optionen jsonb,
    validation jsonb,
    db_target jsonb NOT NULL,
    conditional_on jsonb,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    i18n jsonb,
    CONSTRAINT onboarding_felder_typ_check CHECK ((typ = ANY (ARRAY['text'::text, 'email'::text, 'tel'::text, 'number'::text, 'textarea'::text, 'segmented'::text, 'toggle-cards'::text, 'select'::text, 'slot'::text, 'signature'::text, 'file'::text, 'checkbox'::text, 'zb1-upload'::text])))
);


--
-- Name: TABLE onboarding_felder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.onboarding_felder IS 'Konfig-Tabelle: Felder pro Phase. Wizard rendert nach typ und persistiert via db_target.';


--
-- Name: COLUMN onboarding_felder.typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_felder.typ IS 'Field-Renderer-Typ — bestimmt welche React-Komponente gerendert wird.';


--
-- Name: COLUMN onboarding_felder.optionen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_felder.optionen IS 'Für segmented/toggle-cards/select: Array [{value, label, icon?}].';


--
-- Name: COLUMN onboarding_felder.validation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_felder.validation IS 'Optional: {pattern, min, max, minLength, maxLength}.';


--
-- Name: COLUMN onboarding_felder.db_target; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_felder.db_target IS 'Zielspalte: {tabelle: "gutachter_finder_anfragen", spalte: "schuldfrage"}.';


--
-- Name: COLUMN onboarding_felder.conditional_on; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_felder.conditional_on IS 'Optional: Feld nur zeigen wenn Bedingung erfüllt.';


--
-- Name: COLUMN onboarding_felder.i18n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_felder.i18n IS 'i18n-Overrides je Locale: {"en":{"label","hint","placeholder","optionen":{"<value>":"<label>"}},...}. de bleibt in den Basis-Spalten (Fallback). Doc 48 Phase 2 Track A.';


--
-- Name: onboarding_phasen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_phasen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_key text NOT NULL,
    reihenfolge integer NOT NULL,
    phase_key text NOT NULL,
    titel text NOT NULL,
    eyebrow text,
    beschreibung text,
    conditional_on jsonb,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    i18n jsonb
);


--
-- Name: TABLE onboarding_phasen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.onboarding_phasen IS 'Konfig-Tabelle: Phasen pro Onboarding-Flow für DynamicWizard.';


--
-- Name: COLUMN onboarding_phasen.flow_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_phasen.flow_key IS 'Logischer Flow-Identifier, z.B. gutachter-finden, sv-onboarding.';


--
-- Name: COLUMN onboarding_phasen.phase_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_phasen.phase_key IS 'Stable-key für eine Phase, wird im Wizard-State referenziert.';


--
-- Name: COLUMN onboarding_phasen.conditional_on; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_phasen.conditional_on IS 'Optional: Phase nur zeigen wenn Bedingung erfüllt — z.B. {"feld": "service_typ", "equals": "komplett"}.';


--
-- Name: COLUMN onboarding_phasen.i18n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.onboarding_phasen.i18n IS 'i18n-Overrides je Locale: {"en":{"titel","eyebrow","beschreibung"},"tr":{...},...}. de bleibt in den Basis-Spalten (Fallback). Doc 48 Phase 2 Track A.';


--
-- Name: organisationen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisationen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    parent_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    typ text,
    rechtsform text,
    anschrift text,
    steuernummer text,
    ust_id text,
    hauptansprechpartner_user_id uuid,
    parent_stripe_customer_id text,
    parent_stripe_default_pm_id text,
    einsatzgebiet_isochron_geojson jsonb,
    einsatzgebiet_radius_km numeric(6,2),
    einsatzgebiet_zentrum_lat numeric(10,6),
    einsatzgebiet_zentrum_lng numeric(10,6),
    akademie_max_faelle_monat integer,
    community_exklusiv boolean DEFAULT false NOT NULL,
    community_max_faelle_monat integer,
    community_leaderboard_aktiv boolean DEFAULT true NOT NULL,
    onboarding_status text DEFAULT 'pending'::text NOT NULL,
    vertrag_unterzeichnet_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_url text,
    brand_primary text,
    brand_secondary text,
    brand_accent text,
    brand_extracted_at timestamp with time zone,
    use_custom_branding boolean DEFAULT false NOT NULL,
    akademie_erst_anzahlung_eur numeric(10,2),
    akademie_radius_km integer,
    standort_lat numeric,
    standort_lng numeric,
    standort_adresse text,
    standort_plz text,
    standort_place_id text,
    einsatzgebiet_km numeric,
    isochrone_polygon jsonb,
    brand_theme jsonb,
    CONSTRAINT chk_organisationen_onboarding_status CHECK ((onboarding_status = ANY (ARRAY['pending'::text, 'vertrag_unterzeichnet'::text, 'anzahlung_offen'::text, 'aktiv'::text, 'blockiert'::text]))),
    CONSTRAINT chk_organisationen_typ CHECK (((typ IS NULL) OR (typ = ANY (ARRAY['einzel'::text, 'buero'::text, 'akademie'::text, 'community'::text]))))
);


--
-- Name: COLUMN organisationen.logo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisationen.logo_url IS 'KFZ-157: Buero-Logo URL — alle Sub-SVs der Org erben dieses Branding';


--
-- Name: COLUMN organisationen.brand_primary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisationen.brand_primary IS 'KFZ-157: Buero-Primaerfarbe — Sub-SVs erben diese Farbe';


--
-- Name: COLUMN organisationen.brand_secondary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisationen.brand_secondary IS 'KFZ-157: Buero-Sekundaerfarbe — Sub-SVs erben diese Farbe';


--
-- Name: COLUMN organisationen.brand_accent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisationen.brand_accent IS 'KFZ-157: Buero-Akzentfarbe (DarkVibrant) — Sub-SVs erben diese Farbe';


--
-- Name: COLUMN organisationen.brand_theme; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisationen.brand_theme IS 'JSONB-Whitelabel-Theme. Siehe sachverstaendige.brand_theme für Schema. Büro-Level-Theme wird an Sub-SVs vererbt (KFZ-157).';


--
-- Name: paket_upgrades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paket_upgrades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    altes_paket text NOT NULL,
    neues_paket text NOT NULL,
    differenz_anzahlung numeric(10,2) NOT NULL,
    status text DEFAULT 'angefragt'::text,
    angefragt_am timestamp with time zone DEFAULT now(),
    bezahlt_am date,
    aktiviert_am date,
    CONSTRAINT paket_upgrades_status_check CHECK ((status = ANY (ARRAY['angefragt'::text, 'bezahlt'::text, 'aktiv'::text, 'abgelehnt'::text])))
);


--
-- Name: parteien; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parteien (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    rolle public.partei_rolle NOT NULL,
    name text NOT NULL,
    adresse text,
    plz text,
    ort text,
    telefon text,
    email text,
    versicherung_name text,
    versicherung_nr text,
    vertrag_typ public.vertrag_typ,
    vertrag_details text,
    created_at timestamp with time zone DEFAULT now(),
    anrede text,
    CONSTRAINT parteien_anrede_check CHECK (((anrede IS NULL) OR (anrede = ANY (ARRAY['herr'::text, 'frau'::text, 'divers'::text]))))
);


--
-- Name: COLUMN parteien.anrede; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parteien.anrede IS 'CMM-32: Anrede der Partei (geschaedigter/schaediger/zeuge usw.). Quelle fuer WhatsApp/Email-Templates.';


--
-- Name: personenschaden_personen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personenschaden_personen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    fall_id uuid,
    vorname text,
    nachname text,
    geburtsdatum date,
    verletzungsart text,
    ist_fahrzeuginsasse boolean DEFAULT true NOT NULL,
    notizen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT person_hat_parent CHECK (((lead_id IS NOT NULL) OR (fall_id IS NOT NULL)))
);


--
-- Name: TABLE personenschaden_personen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.personenschaden_personen IS 'AAR-358: Pro verletzte Person (Fahrzeuginsasse, Fußgänger, Gegner) — Personalien + Verletzungsart. Wird im Dispatch mit lead_id angelegt und beim Fall-Anlegen mit fall_id upgegradet.';


--
-- Name: pflichtdokumente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pflichtdokumente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    dokument_typ text NOT NULL,
    status text DEFAULT 'ausstehend'::text,
    pflicht boolean DEFAULT true,
    quelle text DEFAULT 'flowlink'::text,
    dokument_url text,
    hochgeladen_am timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    angefordert_von_rolle text,
    angefordert_von_user_id uuid,
    angefordert_am timestamp with time zone,
    begruendung text,
    frist timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    spaeter_nachreichen_markiert_am timestamp with time zone,
    sv_id uuid,
    gueltig_bis date,
    person_id uuid,
    CONSTRAINT pflichtdokumente_fall_or_gutachter_required CHECK (((fall_id IS NOT NULL) OR (sv_id IS NOT NULL))),
    CONSTRAINT pflichtdokumente_status_check CHECK ((status = ANY (ARRAY['ausstehend'::text, 'hochgeladen'::text, 'geprueft'::text, 'abgelehnt'::text, 'nachgereicht_angefordert'::text])))
);


--
-- Name: COLUMN pflichtdokumente.dokument_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pflichtdokumente.dokument_typ IS 'AAR-322: Slot-ID, referenziert dokument_katalog.slot_id (lose gekoppelt).';


--
-- Name: COLUMN pflichtdokumente.quelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pflichtdokumente.quelle IS 'AAR-322: Freitext. system/flowlink/portal/gutachter/admin/kanzlei.';


--
-- Name: COLUMN pflichtdokumente.spaeter_nachreichen_markiert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pflichtdokumente.spaeter_nachreichen_markiert_am IS 'AAR-390: Zeitpunkt an dem der Kunde den Slot auf „später nachreichen" gesetzt hat. Verhindert nicht die Pflicht, dedupliziert aber Reminder-Versand für 48h.';


--
-- Name: COLUMN pflichtdokumente.gueltig_bis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pflichtdokumente.gueltig_bis IS 'AAR-389: Ablaufdatum des Dokuments (primär Berufshaftpflicht). NULL = kein Ablauf relevant. Der Cron /api/cron/haftpflicht-ablauf prüft täglich und legt Reminder-Tasks an den Gutachter an (-30/-14/-7/0 Tage vor Ablauf).';


--
-- Name: COLUMN pflichtdokumente.person_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pflichtdokumente.person_id IS 'AAR-358: Bei personenbezogenen Pflichtdokumenten (Attest, AU, Krankenhausbericht) die betroffene Person — NULL bei fall-globalen Dokumenten.';


--
-- Name: phase_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phase_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    from_phase text,
    to_phase text NOT NULL,
    transition_at timestamp with time zone DEFAULT now() NOT NULL,
    transitioned_by uuid,
    actor_rolle text,
    trigger_type text NOT NULL,
    grund text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT phase_transitions_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['auto'::text, 'manual'::text, 'webhook'::text, 'scheduled'::text])))
);


--
-- Name: TABLE phase_transitions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.phase_transitions IS 'AAR-571: Audit-Log aller Phase-Wechsel auf faelle.aktuelle_phase. Foundation für V7 Override + Zeitmess-Analyse.';


--
-- Name: plz_geo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plz_geo (
    plz text NOT NULL,
    lat numeric NOT NULL,
    lng numeric NOT NULL,
    ort text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE plz_geo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.plz_geo IS 'PLZ→Centroid Lookup für Karten-Fallback wenn leads keine eigene Geo haben. AAR-894.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    rolle public.user_role DEFAULT 'kunde'::public.user_role NOT NULL,
    vorname text,
    nachname text,
    telefon text,
    firma text,
    adresse text,
    plz text,
    ort text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    force_password_change boolean DEFAULT true,
    auth_provider text DEFAULT 'email'::text,
    "position" text,
    gehaltsstufe text,
    gehalt_brutto numeric(10,2),
    eingestellt_am date,
    kategorie text,
    kapazitaet_max integer DEFAULT 100,
    aktiv boolean DEFAULT true,
    audio_settings jsonb DEFAULT '{}'::jsonb,
    anrede text,
    titel text,
    twilio_whatsapp_nummer text,
    twilio_phone_sid text,
    twilio_nummer_provisioned_am timestamp with time zone,
    twofa_aktiviert boolean DEFAULT false NOT NULL,
    twofa_telefon text,
    twofa_telefon_verifiziert_am timestamp with time zone,
    working_hours jsonb DEFAULT '{"di": ["09:00", "17:00"], "do": ["09:00", "17:00"], "fr": ["09:00", "17:00"], "mi": ["09:00", "17:00"], "mo": ["09:00", "17:00"]}'::jsonb,
    google_refresh_token text,
    google_access_token text,
    google_token_expires_at timestamp with time zone,
    google_email text,
    google_connected_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    aircall_user_id text,
    aircall_email text,
    anzeigename text,
    profilbeschreibung text,
    twofa_email_aktiviert boolean DEFAULT false NOT NULL,
    twofa_email_verifiziert_am timestamp with time zone,
    zweit_email text,
    sv_paket public.sv_paket_typ,
    community_id uuid,
    account_typ text DEFAULT 'voll'::text NOT NULL,
    entstanden_via text,
    entstanden_aus_claim_id uuid,
    upgrade_to_voll_at timestamp with time zone,
    entstanden_aus_airdrop_id uuid,
    google_place_id text,
    whatsapp_verfuegbar boolean,
    whatsapp_geprueft_am timestamp with time zone,
    sprache text,
    CONSTRAINT profiles_account_typ_check CHECK ((account_typ = ANY (ARRAY['voll'::text, 'gast'::text, 'interner_user'::text]))),
    CONSTRAINT profiles_entstanden_via_check CHECK (((entstanden_via IS NULL) OR (entstanden_via = ANY (ARRAY['self_signup'::text, 'airdrop'::text, 'lead_konvertierung'::text, 'manuelle_anlage_admin'::text, 'kanzlei_einladung'::text, 'makler_einladung'::text, 'mitarbeiter_anlage'::text])))),
    CONSTRAINT profiles_sprache_check CHECK (((sprache IS NULL) OR (sprache = ANY (ARRAY['de'::text, 'en'::text, 'tr'::text, 'ar'::text, 'ru'::text, 'pl'::text])))),
    CONSTRAINT profiles_sv_paket_only_for_sv CHECK (((sv_paket IS NULL) OR (rolle = 'sachverstaendiger'::public.user_role)))
);


--
-- Name: COLUMN profiles.avatar_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.avatar_url IS 'AAR-369: Public URL des Profilbilds aus dem avatare-Bucket. NULL = Initialen-Fallback.';


--
-- Name: COLUMN profiles.twofa_aktiviert; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.twofa_aktiviert IS '2FA per SMS aktiv. DEFAULT false — nur true wenn User Telefonnummer verifiziert hat.';


--
-- Name: COLUMN profiles.anzeigename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.anzeigename IS 'AAR-369: Optionaler Anzeigename für Kunden-UI (z. B. "Max M."). Fallback: vorname + nachname.';


--
-- Name: COLUMN profiles.profilbeschreibung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.profilbeschreibung IS 'AAR-369: Kurzer Profiltext (z. B. "Ihr persönlicher Kundenbetreuer"), sichtbar in Kunden-Karten.';


--
-- Name: COLUMN profiles.twofa_email_aktiviert; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.twofa_email_aktiviert IS 'AAR-494: True, wenn der Nutzer Email-2FA als Methode gewählt hat.';


--
-- Name: COLUMN profiles.zweit_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.zweit_email IS 'AAR-703: Sekundäre Kontakt-Email (nur Kunden). Optional, kein UNIQUE.';


--
-- Name: COLUMN profiles.sv_paket; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sv_paket IS 'AAR-748: SV-Paket-Typ (solo/buero_inhaber/sub_buero/akademie_*). NULL außer wenn rolle=sachverstaendiger. Bestimmt Permissions innerhalb Büro/Akademie.';


--
-- Name: COLUMN profiles.community_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.community_id IS 'AAR-748/AAR-749: Community-Mitgliedschaft (Peer-Network Einkaufsgemeinschaft). NULL = kein Mitglied. Orthogonal zu sv_paket — ein Solo-SV kann Community-Mitglied sein.';


--
-- Name: COLUMN profiles.account_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.account_typ IS 'AAR-810 A.3: voll = normaler Kunde (Default), gast = Airdrop-Gast (limitierter Zugriff), interner_user = admin/dispatch/kb/sv (siehe rolle für Detail).';


--
-- Name: COLUMN profiles.entstanden_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.entstanden_via IS 'AAR-810 A.3: Quelle der Account-Anlage. Wichtig für Lead-Tracking und Konvertierungs-Metriken.';


--
-- Name: COLUMN profiles.upgrade_to_voll_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.upgrade_to_voll_at IS 'AAR-810 A.3: Zeitpunkt der Konversion von gast zu voll. NULL solange Gast oder direkt Voll angelegt.';


--
-- Name: COLUMN profiles.entstanden_aus_airdrop_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.entstanden_aus_airdrop_id IS 'AAR-810 A.3: FK auf airdrop_invitations. Gesetzt bei Gast-Accounts, die durch Airdrop-Annahme entstanden sind.';


--
-- Name: COLUMN profiles.whatsapp_verfuegbar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.whatsapp_verfuegbar IS 'Ob die Telefonnummer ein WhatsApp-Konto hat. NULL = noch nie geprüft.';


--
-- Name: COLUMN profiles.whatsapp_geprueft_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.whatsapp_geprueft_am IS 'Letzter erfolgreicher Lookup. Cache-TTL 30 Tage.';


--
-- Name: COLUMN profiles.sprache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sprache IS 'Bevorzugte Portal-Sprache (ISO-639-1, 6 Locales). NULL -> Cookie/DEFAULT_LOCALE-Fallback. App-SSoT, siehe _specs/portal-i18n.';


--
-- Name: promo_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_code_id uuid NOT NULL,
    clicked_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text,
    referer text,
    ip_hash text
);


--
-- Name: TABLE promo_clicks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promo_clicks IS 'AAR-491: Klicks auf ?p=MK-xxxx Landing-URLs. Insert über Service-Role aus Tracking-Endpoint, keine client-seitigen Inserts.';


--
-- Name: promotion_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    makler_id uuid NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provisionen_maik; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provisionen_maik (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    monat text NOT NULL,
    basis_provision numeric(10,2) DEFAULT 150.00 NOT NULL,
    cpl_actual numeric(10,2),
    netto_provision numeric(10,2) GENERATED ALWAYS AS ((basis_provision - COALESCE(cpl_actual, (0)::numeric))) STORED,
    status text DEFAULT 'pending'::text NOT NULL,
    source_channel text,
    reversed_grund text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    CONSTRAINT provisionen_maik_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'paid'::text, 'reversed'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh_key text NOT NULL,
    auth_key text NOT NULL,
    user_agent text,
    platform text DEFAULT 'web'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expired_at timestamp with time zone
);


--
-- Name: TABLE push_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.push_subscriptions IS 'AAR-499 N4: Web-Push-Subscriptions. Jeder Browser/Gerät = eigene Row. platform=web|native (native für Capacitor). expired_at gesetzt wenn Push-Service 410 Gone liefert.';


--
-- Name: qc_checkliste; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_checkliste (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    gutachten_vorhanden boolean DEFAULT false,
    gutachten_vollstaendig boolean DEFAULT false,
    fin_17_zeichen boolean DEFAULT false,
    schadenspositionen_erfasst boolean DEFAULT false,
    fotos_ausreichend boolean DEFAULT false,
    sa_vorhanden boolean DEFAULT false,
    vollmacht_vorhanden boolean DEFAULT false,
    kundendaten_vollstaendig boolean DEFAULT false,
    vorschaeden_beruecksichtigt boolean,
    kommentar text,
    geprueft_von uuid,
    geprueft_am timestamp with time zone,
    status text DEFAULT 'offen'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT qc_checkliste_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'bestanden'::text, 'nachbesserung'::text])))
);


--
-- Name: rechnungs_konfiguration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rechnungs_konfiguration (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gueltig_ab date NOT NULL,
    gueltig_bis date,
    rechnungssteller text NOT NULL,
    firmenname text NOT NULL,
    strasse text NOT NULL,
    plz text NOT NULL,
    ort text NOT NULL,
    steuernummer text,
    ust_id text,
    hrb text,
    geschaeftsfuehrer text,
    zahlungsempfaenger_name text NOT NULL,
    zahlungsempfaenger_iban text NOT NULL,
    zahlungsempfaenger_bic text NOT NULL,
    zahlungsempfaenger_bank text NOT NULL,
    zahlungsempfaenger_hinweis text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rechnungs_konfiguration_rechnungssteller_check CHECK ((rechnungssteller = ANY (ARRAY['claimondo_gmbh_igr'::text, 'claimondo_gmbh'::text, 'gbr'::text])))
);


--
-- Name: TABLE rechnungs_konfiguration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rechnungs_konfiguration IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';


--
-- Name: rechnungs_nr_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rechnungs_nr_counter (
    serie text NOT NULL,
    jahr integer NOT NULL,
    laufende_nr integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE rechnungs_nr_counter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rechnungs_nr_counter IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';


--
-- Name: regulierungs_klassifizierung; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulierungs_klassifizierung (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    regulierungs_status text NOT NULL,
    kuerzungsgrund text,
    kuerzung_betrag_netto numeric(10,2),
    reguliert_betrag_netto numeric(10,2),
    geltend_gemacht_netto numeric(10,2),
    versicherer text,
    begruendung_versicherer text,
    notiz_intern text,
    erfasst_von uuid NOT NULL,
    erfasst_am timestamp with time zone DEFAULT now() NOT NULL,
    updated_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regulierungs_klassifizierung_kuerzungsgrund_check CHECK ((kuerzungsgrund = ANY (ARRAY['honorarkuerzung_pauschal'::text, 'mithaftung_kunde'::text, 'gutachten_formaler_mangel'::text, 'gutachten_inhaltlicher_mangel'::text, 'verspaetete_meldung'::text, 'bagatelle'::text, 'verweigerung_versicherer'::text, 'sonstiges'::text]))),
    CONSTRAINT regulierungs_klassifizierung_regulierungs_status_check CHECK ((regulierungs_status = ANY (ARRAY['voll_reguliert'::text, 'teilweise_reguliert'::text, 'abgelehnt'::text, 'ausstehend'::text])))
);


--
-- Name: reklamationen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reklamationen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    sv_id uuid NOT NULL,
    grund text NOT NULL,
    begruendung text NOT NULL,
    nachweis_storage_path text,
    eingereicht_am timestamp with time zone DEFAULT now() NOT NULL,
    bearbeitet_am timestamp with time zone,
    bearbeitet_von uuid,
    status text DEFAULT 'eingereicht'::text NOT NULL,
    admin_begruendung text,
    frist_bis timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: repairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repairs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    werkstatt_id uuid,
    status text DEFAULT 'geplant'::text NOT NULL,
    auftragsnummer text,
    geplanter_beginn timestamp with time zone,
    tatsaechlicher_beginn timestamp with time zone,
    abgeschlossen_am timestamp with time zone,
    kostenvoranschlag numeric(12,2),
    tatsaechliche_kosten numeric(12,2),
    gutachten_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    notiz text,
    CONSTRAINT repairs_status_check CHECK ((status = ANY (ARRAY['geplant'::text, 'in_arbeit'::text, 'abgeschlossen'::text, 'storniert'::text])))
);


--
-- Name: TABLE repairs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.repairs IS 'AAR-822: Reparaturauftrag als Sub-Asset des Claims. Status geplant/in_arbeit → Phase 5_reparatur_laeuft, abgeschlossen → 6_reparatur_fertig. Kostenverfolgung Soll (kostenvoranschlag) vs. Ist (tatsaechliche_kosten).';


--
-- Name: routing_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routing_cache (
    von_hash text NOT NULL,
    nach_hash text NOT NULL,
    fahrtzeit_sek integer NOT NULL,
    cached_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sachverstaendige; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sachverstaendige (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    gebiet_plz text[] DEFAULT '{}'::text[] NOT NULL,
    paket text DEFAULT 'standard'::text NOT NULL,
    offene_faelle integer DEFAULT 0 NOT NULL,
    partner_seit date DEFAULT CURRENT_DATE NOT NULL,
    ist_aktiv boolean DEFAULT true,
    notizen text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    paket_faelle_gesamt integer DEFAULT 10,
    paket_faelle_genutzt integer DEFAULT 0,
    paket_umkreis_km integer DEFAULT 20,
    anzahlung_betrag numeric(10,2) DEFAULT 0,
    standort_adresse text,
    standort_plz text,
    standort_lat numeric(10,7),
    standort_lng numeric(10,7),
    standort_place_id text,
    organisation_id uuid,
    ist_parent_account boolean DEFAULT false,
    kalender_typ text DEFAULT 'keiner'::text,
    kalender_sync_aktiv boolean DEFAULT false,
    kalender_sync_letzte timestamp with time zone,
    gutachter_typ text DEFAULT 'kfz-gutachter'::text,
    anzahlung_faellig numeric(10,2) DEFAULT 0,
    anzahlung_status text DEFAULT 'offen'::text,
    isochrone_polygon jsonb,
    urlaub_von date,
    urlaub_bis date,
    logo_url text,
    brand_primary text,
    brand_secondary text,
    gcal_access_token text,
    gcal_refresh_token text,
    gcal_token_expiry timestamp with time zone,
    gcal_connected boolean DEFAULT false,
    gcal_calendar_id text DEFAULT 'primary'::text,
    vertrag_unterschrieben boolean DEFAULT false,
    vertrag_unterschrieben_am timestamp with time zone,
    vertrag_pdf_url text,
    unterschrift_url text,
    geloescht_am timestamp with time zone,
    deaktiviert_grund text,
    deaktiviert_am timestamp with time zone,
    paket_preis numeric(10,2),
    use_custom_branding boolean DEFAULT false NOT NULL,
    onboarding_status text DEFAULT 'pending'::text NOT NULL,
    onboarding_anzahlung_betrag numeric(10,2),
    onboarding_anzahlung_faellig_am timestamp with time zone,
    stripe_customer_id text,
    stripe_anzahlung_payment_intent_id text,
    stripe_anzahlung_bezahlt_am timestamp with time zone,
    portal_zugang_freigeschaltet boolean DEFAULT false NOT NULL,
    werbebudget_guthaben_netto numeric(10,2) DEFAULT 0 NOT NULL,
    stripe_default_payment_method_id text,
    gesperrt_grund text,
    gesperrt_seit timestamp with time zone,
    rolle_in_organisation text,
    firmenname text,
    rechtsform text,
    steuernummer text,
    ust_id text,
    hrb text,
    brand_accent text,
    brand_extracted_at timestamp with time zone,
    qualifikationen_neu text[] DEFAULT '{}'::text[] NOT NULL,
    spezifikationen text[] DEFAULT '{}'::text[] NOT NULL,
    schadenarten text[] DEFAULT '{}'::text[] NOT NULL,
    community_anonym boolean DEFAULT false NOT NULL,
    live_tracking_enabled boolean DEFAULT true,
    ablehnungen_30_tage integer DEFAULT 0 NOT NULL,
    brand_theme jsonb,
    sa_vorlage_status text,
    sa_vorlage_storage_path text,
    sa_vorlage_hochgeladen_am timestamp with time zone,
    sa_vorlage_geprueft_am timestamp with time zone,
    sa_vorlage_geprueft_von_user_id uuid,
    sa_vorlage_admin_notiz text,
    verifizierung_status text,
    verifizierung_frist_bis timestamp with time zone,
    verifiziert_am timestamp with time zone,
    verifizierung_admin_notiz text,
    gesperrt_von_user_id uuid,
    dat_nummer text,
    verifizierung_reminder_7d_gesendet_am timestamp with time zone,
    verifizierung_frist_ueberschritten_am timestamp with time zone,
    verifiziert boolean DEFAULT false NOT NULL,
    verifiziert_von uuid,
    sa_vorlage_signatur_konfig jsonb,
    bvsk_mitgliedsnummer text,
    ihk_zertifikat_nummer text,
    oebuv_bestellungsnummer text,
    oeffentlich_bestellt boolean DEFAULT false NOT NULL,
    bestellungs_kammer text,
    arbeitet_eigenstaendig boolean DEFAULT true NOT NULL,
    kapazitaeten_jsonb jsonb,
    blockierte_wochentage integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    arbeitszeiten jsonb,
    stripe_einzug_fehlgeschlagen_am timestamp with time zone,
    CONSTRAINT chk_sv_rolle_in_organisation CHECK (((rolle_in_organisation IS NULL) OR (rolle_in_organisation = ANY (ARRAY['inhaber'::text, 'buero_admin'::text, 'mitarbeiter'::text, 'community_member'::text, 'akademie_sub'::text])))),
    CONSTRAINT sachverstaendige_anzahlung_status_check CHECK ((anzahlung_status = ANY (ARRAY['offen'::text, 'teilweise'::text, 'bezahlt'::text]))),
    CONSTRAINT sachverstaendige_blockierte_wochentage_chk CHECK ((blockierte_wochentage <@ ARRAY[0, 1, 2, 3, 4, 5, 6])),
    CONSTRAINT sachverstaendige_gutachter_typ_check CHECK ((gutachter_typ = ANY (ARRAY['kfz-gutachter'::text, 'dat-gutachter'::text, 'akademie'::text, 'gutachterbuero'::text]))),
    CONSTRAINT sachverstaendige_sa_vorlage_status_check CHECK (((sa_vorlage_status IS NULL) OR (sa_vorlage_status = ANY (ARRAY['ausstehend'::text, 'geprueft'::text, 'zurueckgewiesen'::text])))),
    CONSTRAINT sachverstaendige_verifizierung_status_check CHECK (((verifizierung_status IS NULL) OR (verifizierung_status = ANY (ARRAY['ausstehend'::text, 'geprueft'::text, 'frist_ueberschritten'::text]))))
);


--
-- Name: COLUMN sachverstaendige.profile_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.profile_id IS 'Die einzige FK zu auth.users / profiles. Früher gab es eine parallele user_id-Spalte (Legacy aus Pre-AAR-185) — diese wurde konsolidiert. Alle Gutachter-Lookups nutzen getGutachterForUser() in src/lib/gutachter.ts mit .eq(profile_id, userId).';


--
-- Name: COLUMN sachverstaendige.ist_aktiv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.ist_aktiv IS 'Automatischer Onboarding-Flag. false beim Anlegen durch alle Wizards, true wenn Stripe-Webhook die Anzahlung bestätigt + portal_zugang_freigeschaltet auf true setzt. NIEMALS manuell vom Admin setzen — dafür ist gesperrt_seit da.';


--
-- Name: COLUMN sachverstaendige.paket_faelle_gesamt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.paket_faelle_gesamt IS 'Monatliches Fall-Kontingent — kanonische Quelle (ersetzt max_faelle_monat, kontingent_soll seit AAR-549 S2).';


--
-- Name: COLUMN sachverstaendige.paket_umkreis_km; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.paket_umkreis_km IS 'Einsatzradius in km — kanonische Quelle (ersetzt radius_km, paket_radius_km seit AAR-549 S1).';


--
-- Name: COLUMN sachverstaendige.brand_primary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.brand_primary IS 'DEPRECATED (AAR-549 S7): Legacy-Feld, wird synchron aus brand_theme.primary gespiegelt. Nicht für Neuentwicklung verwenden — brand_theme ist kanonisch.';


--
-- Name: COLUMN sachverstaendige.brand_secondary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.brand_secondary IS 'DEPRECATED (AAR-549 S7): Legacy-Feld, wird synchron aus brand_theme.secondary gespiegelt. Nicht für Neuentwicklung verwenden — brand_theme ist kanonisch.';


--
-- Name: COLUMN sachverstaendige.gcal_access_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.gcal_access_token IS 'Google OAuth Access-Token. Kanonische Quelle seit AAR-549 S6 (ersetzt google_calendar_token). Wird via /api/auth/google-calendar/callback befüllt.';


--
-- Name: COLUMN sachverstaendige.gcal_refresh_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.gcal_refresh_token IS 'Google OAuth Refresh-Token. Gepaart mit gcal_access_token + gcal_token_expiry.';


--
-- Name: COLUMN sachverstaendige.onboarding_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.onboarding_status IS 'Onboarding-Status-Enum (text). Werte: pending, vom_admin_angelegt, vertrag_unterzeichnet, anzahlung_offen, bezahlt, aktiv, blockiert. Kanonische Quelle seit AAR-549 S3 (ersetzt den redundanten onboarding_abgeschlossen bool).';


--
-- Name: COLUMN sachverstaendige.stripe_anzahlung_bezahlt_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.stripe_anzahlung_bezahlt_am IS 'Zeitpunkt der Anzahlung durch Stripe-Webhook bestaetigt. Kanonische Quelle seit AAR-549 S5 (ersetzt anzahlung_bezahlt_am).';


--
-- Name: COLUMN sachverstaendige.portal_zugang_freigeschaltet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.portal_zugang_freigeschaltet IS 'Business-Gate: erst wenn true darf der SV Fälle bekommen (Anzahlung muss durch sein). Wird vom Stripe-Webhook + gutachter/willkommen/actions.ts gesetzt. Zusammen mit ist_aktiv die zwei Conditions die applyDispatchableFilter prüft.';


--
-- Name: COLUMN sachverstaendige.gesperrt_seit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.gesperrt_seit IS 'Manueller Admin-Toggle für SV-Sperre. Setzt deactivateGutachter() in karte/actions.ts. Ein SV mit gesperrt_seit IS NOT NULL bekommt keine Fälle (Filter in lib/sv/queries.ts applyDispatchableFilter).';


--
-- Name: COLUMN sachverstaendige.brand_accent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.brand_accent IS 'DEPRECATED (AAR-549 S7): Legacy-Feld, wird synchron aus brand_theme.accent gespiegelt. Nicht für Neuentwicklung verwenden — brand_theme ist kanonisch.';


--
-- Name: COLUMN sachverstaendige.brand_extracted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.brand_extracted_at IS 'KFZ-157: Zeitpunkt der letzten Farbextraktion aus dem Logo';


--
-- Name: COLUMN sachverstaendige.brand_theme; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.brand_theme IS 'Branding-Tokens (jsonb, 25 Keys inkl. primary, secondary, accent, info, success, warning, danger, sidebarBg etc.). Kanonische Quelle seit AAR-378. brand_primary/secondary/accent sind redundante Legacy-Spiegel und werden via /api/branding/save synchron gehalten — Full-Drop in AAR-549 Follow-Up geplant.';


--
-- Name: COLUMN sachverstaendige.verifiziert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.verifiziert_am IS 'AAR-418: Zeitpunkt der Verifizierung durch Admin.';


--
-- Name: COLUMN sachverstaendige.verifizierung_reminder_7d_gesendet_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.verifizierung_reminder_7d_gesendet_am IS 'AAR-359 W4: Zeitpunkt an dem die Tag-7-Halbzeit-Erinnerung rausging. NULL = noch nicht gesendet.';


--
-- Name: COLUMN sachverstaendige.verifizierung_frist_ueberschritten_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.verifizierung_frist_ueberschritten_am IS 'AAR-359 W4: Zeitpunkt an dem der Cron den Übergang ausstehend → frist_ueberschritten gemacht hat. Als separate Audit-Spur neben verifizierung_status.';


--
-- Name: COLUMN sachverstaendige.verifiziert; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.verifiziert IS 'AAR-418: Gate für Custom-Branding auf der Kunden-Token-Seite. Wird NUR für SVs auf true gesetzt, die Aaron/Team persönlich kennen und denen vertraut wird. Nicht automatisch setzen, auch nicht durch Verträge oder Portal-Zugang — nur durch explizite persönliche Freigabe. Default false (Retention-Schutz).';


--
-- Name: COLUMN sachverstaendige.verifiziert_von; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.verifiziert_von IS 'Admin-User der Tier-2-Verifizierung freigegeben hat (FK -> profiles). Kanonische Quelle seit AAR-549 S4 (ersetzt verifiziert_von_user_id).';


--
-- Name: COLUMN sachverstaendige.sa_vorlage_signatur_konfig; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.sa_vorlage_signatur_konfig IS 'AAR-360: Position-Konfig für SA-Tool-PDF-Merge (Kunden-Unterschrift + Datum + Name auf Gutachter-SA-Vorlage). NULL => Default-Position (unten links). Admin-UI-Editor folgt nach MVP.';


--
-- Name: COLUMN sachverstaendige.bvsk_mitgliedsnummer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.bvsk_mitgliedsnummer IS 'AAR-515: BVSK-Mitgliedsnummer (optional). Wird beim Wizard erfasst wenn Quali „BVSK-Mitglied" gewählt, plausibilisiert vom Admin bei Tier-2-Freigabe von sv_bvsk_mitgliedschaft.';


--
-- Name: COLUMN sachverstaendige.ihk_zertifikat_nummer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.ihk_zertifikat_nummer IS 'AAR-515: IHK-Zertifikats-Nummer (optional). Erfassung + Plausibilisierung analog zu BVSK — Slot sv_ihk_zertifikat ist neu in v4.1.';


--
-- Name: COLUMN sachverstaendige.oebuv_bestellungsnummer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.oebuv_bestellungsnummer IS 'AAR-515: Bestellungsnummer ö.b.u.v. (optional). Für „Öffentlich bestellt und vereidigt"-Qualifikation — Plausibilisierung beim Tier-2-Freigabe des Slots sv_bestellungsurkunde_oebuv.';


--
-- Name: COLUMN sachverstaendige.oeffentlich_bestellt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.oeffentlich_bestellt IS 'AAR-832: Öffentlich bestellter und vereidigter SV (z.B. IHK/HWK-Bestellung).';


--
-- Name: COLUMN sachverstaendige.bestellungs_kammer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.bestellungs_kammer IS 'AAR-832: z.B. "IHK Berlin", "HWK München". Nur relevant wenn oeffentlich_bestellt=TRUE.';


--
-- Name: COLUMN sachverstaendige.arbeitet_eigenstaendig; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.arbeitet_eigenstaendig IS 'AAR-832: TRUE = eigenständiger SV. FALSE = ausschließlich über Büro/Organisation tätig.';


--
-- Name: COLUMN sachverstaendige.kapazitaeten_jsonb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.kapazitaeten_jsonb IS 'AAR-832: Aktuelle Kapazität — z.B. {offene_auftraege: 3, max_auftraege: 5}. Auto-Match halbiert Score wenn offene_auftraege > 5.';


--
-- Name: COLUMN sachverstaendige.blockierte_wochentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.blockierte_wochentage IS 'AAR-2026-05-07: Wochentage an denen der SV keine Termine annimmt. 0=So..6=Sa (JS Date.getDay()).';


--
-- Name: COLUMN sachverstaendige.arbeitszeiten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.arbeitszeiten IS 'PR 4: Arbeitszeit-Konfig für Slot-Berechnung.
   Format: {"mo":{"von":"08:00","bis":"18:00"},"di":{...},...}
   NULL = Default Mo-Fr 08:00-18:00. Wochentage: mo, di, mi, do, fr, sa, so.';


--
-- Name: COLUMN sachverstaendige.stripe_einzug_fehlgeschlagen_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sachverstaendige.stripe_einzug_fehlgeschlagen_am IS 'Zeitpunkt eines fehlgeschlagenen Stripe-Einzugs. Nachgezogen 2026-05-29 wegen Live-Drift (fehlende Migration). Typ als naheliegende Annahme - bei Original-Migration im Repo ggf. angleichen.';


--
-- Name: schadenspositionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schadenspositionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    kategorie public.schadens_kategorie NOT NULL,
    bezeichnung text NOT NULL,
    beschreibung text,
    alter_jahre integer,
    zustand_vorher text,
    geschaetzter_wert numeric(10,2),
    reparaturkosten numeric(10,2),
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sla_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    sla_typ text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    breach_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    eskalation_task_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    target_rolle text DEFAULT 'sv'::text,
    blocker_rolle text,
    blocker_grund text,
    phase text,
    n_mahnungen integer DEFAULT 0,
    letzte_mahnung_am timestamp with time zone,
    CONSTRAINT sla_tracking_sla_typ_check CHECK ((sla_typ = ANY (ARRAY['gutachter_zuweisung'::text, 'termin_bestaetigung'::text, 'besichtigung'::text, 'gutachten_upload'::text, 'vs_antwort_14'::text, 'vs_antwort_ruege1_14'::text, 'vs_antwort_ruege2_7'::text, 'qc_filmcheck'::text, 'kanzlei_uebergabe'::text, 'zahlung_eingang'::text]))),
    CONSTRAINT sla_tracking_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'breached'::text])))
);


--
-- Name: COLUMN sla_tracking.target_rolle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sla_tracking.target_rolle IS 'AAR-431: Wer sollte liefern — sv | kanzlei | kunde';


--
-- Name: COLUMN sla_tracking.blocker_rolle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sla_tracking.blocker_rolle IS 'AAR-431: Wer blockt aktuell (bei breach gesetzt)';


--
-- Name: COLUMN sla_tracking.blocker_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sla_tracking.blocker_grund IS 'AAR-431: Menschlich lesbarer Grund';


--
-- Name: stripe_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    sv_id uuid,
    payload jsonb NOT NULL,
    verarbeitet boolean DEFAULT false NOT NULL,
    fehler text,
    empfangen_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_rate_limits (
    user_id uuid NOT NULL,
    hour_bucket timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE support_rate_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.support_rate_limits IS 'AAR-518: Rate-Limit-Counter pro User/Stunde für /api/support/chat. Service-Role-only Writes.';


--
-- Name: support_ticket_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    linear_issue_id text,
    action_type text DEFAULT 'new'::text NOT NULL,
    page_url text,
    turn_count integer DEFAULT 1 NOT NULL,
    has_screenshot boolean DEFAULT false NOT NULL,
    has_voice boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_typ text DEFAULT 'bug'::text,
    CONSTRAINT support_ticket_log_action_type_check CHECK ((action_type = ANY (ARRAY['new'::text, 'comment'::text, 'no_action'::text]))),
    CONSTRAINT support_ticket_log_ticket_typ_check CHECK ((ticket_typ = ANY (ARRAY['bug'::text, 'feature'::text, 'comment'::text, 'no_action'::text])))
);


--
-- Name: TABLE support_ticket_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.support_ticket_log IS 'AAR-518: Audit-Log aller AI-Support-Aktionen (neues Ticket, Kommentar, kein Action). action_type=new|comment|no_action.';


--
-- Name: COLUMN support_ticket_log.action_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_ticket_log.action_type IS 'AAR-518 Nachtrag: Unterscheidet Duplikat-Kommentar vs. neues Ticket vs. "Bug war schon gemeldet, nichts getan".';


--
-- Name: COLUMN support_ticket_log.ticket_typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_ticket_log.ticket_typ IS 'AAR-625: bug | feature | comment | no_action. Basis für Feature-Request-Tageslimit (3/Tag).';


--
-- Name: support_ticket_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_ticket_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_ticket_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_ticket_log_id_seq OWNED BY public.support_ticket_log.id;


--
-- Name: sv_buero; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_buero (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    rechtsform text,
    ust_id text,
    adresse_strasse text,
    adresse_plz character varying(5),
    adresse_ort text,
    adresse_land character varying(2) DEFAULT 'DE'::character varying NOT NULL,
    telefon text,
    email text,
    geo_lat numeric(10,7),
    geo_lng numeric(10,7),
    aggregierte_rechnungsstellung boolean DEFAULT false NOT NULL,
    status text DEFAULT 'aktiv'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notiz text,
    CONSTRAINT sv_buero_rechtsform_check CHECK ((rechtsform = ANY (ARRAY['GmbH'::text, 'GbR'::text, 'Einzelunternehmen'::text, 'UG'::text, 'AG'::text, 'e.K.'::text, 'KG'::text, 'OHG'::text]))),
    CONSTRAINT sv_buero_status_check CHECK ((status = ANY (ARRAY['aktiv'::text, 'pausiert'::text, 'deaktiviert'::text])))
);


--
-- Name: TABLE sv_buero; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_buero IS 'AAR-832: SV-Büros — Zusammenschlüsse mehrerer eigenständiger SVs unter einem Büro-Admin. Büro-Admin sieht alle Gutachten der Büro-Mitglieder. SVs handeln eigenständig.';


--
-- Name: sv_buero_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_buero_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    buero_id uuid NOT NULL,
    rolle text NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_svbuero_end_after_start CHECK (((end_date IS NULL) OR (end_date > start_date))),
    CONSTRAINT sv_buero_memberships_rolle_check CHECK ((rolle = ANY (ARRAY['mitglied'::text, 'admin'::text, 'partner'::text])))
);


--
-- Name: TABLE sv_buero_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_buero_memberships IS 'AAR-832: Many-to-many SV ↔ Büro. Rollen: mitglied (handelt eigenständig), admin (sieht Büro-Aggregat), partner (assoziiert).';


--
-- Name: sv_community; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_community (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    beschreibung text,
    status text DEFAULT 'aktiv'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_community_status_check CHECK ((status = ANY (ARRAY['aktiv'::text, 'archiviert'::text])))
);


--
-- Name: TABLE sv_community; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_community IS 'AAR-832: SV-Communities (Einkaufsgemeinschaften) — Schema-Stub. UI und Membership-Logik kommen später. Nicht aktiv in Welle 7.';


--
-- Name: sv_kalender_events_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_kalender_events_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    source text NOT NULL,
    external_event_id text,
    start_zeit timestamp with time zone NOT NULL,
    end_zeit timestamp with time zone NOT NULL,
    titel text,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_kalender_events_cache_source_check CHECK ((source = ANY (ARRAY['google'::text, 'caldav'::text])))
);

ALTER TABLE ONLY public.sv_kalender_events_cache REPLICA IDENTITY FULL;


--
-- Name: TABLE sv_kalender_events_cache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_kalender_events_cache IS 'Cache für externe Kalender-Events (Google FreeBusy + CalDAV). Cron sync-external-calendars schreibt alle 5 Min.';


--
-- Name: sv_kalender_verbindungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_kalender_verbindungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    provider text NOT NULL,
    server_url text NOT NULL,
    username text NOT NULL,
    password_encrypted text NOT NULL,
    calendar_url text,
    calendar_display_name text,
    provider_label text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    fehler_task_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_kalender_verbindungen_provider_check CHECK ((provider = ANY (ARRAY['caldav'::text, 'outlook'::text])))
);


--
-- Name: TABLE sv_kalender_verbindungen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_kalender_verbindungen IS 'AAR-717: Multi-Provider-Kalender-Verbindungen pro SV (CalDAV/Outlook). Credentials AES-256-GCM-verschlüsselt. Google-OAuth-Tokens bleiben vorerst auf profiles — separate Migration zieht sie später um.';


--
-- Name: sv_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    firma text,
    adresse text NOT NULL,
    plz text,
    ort text,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    telefon text,
    email text,
    dat_id text,
    dat_url text,
    quelle text DEFAULT 'dat_expert'::text NOT NULL,
    ist_aktiv boolean DEFAULT true NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    aktualisiert_am timestamp with time zone DEFAULT now() NOT NULL,
    vorname text,
    nachname text,
    qualifikationen text[],
    dat_expert_nr text,
    bvsk_nr text,
    ihk_zertifikat boolean DEFAULT false,
    oebuv_nr text,
    jahre_erfahrung integer,
    auftraege_monat integer,
    fachschwerpunkte text,
    radius_km integer DEFAULT 30,
    warteliste_status text DEFAULT 'ausstehend'::text NOT NULL,
    warteliste_am timestamp with time zone DEFAULT now(),
    isochrone_polygon jsonb,
    paket_umkreis_km integer DEFAULT 25,
    CONSTRAINT sv_leads_warteliste_status_check CHECK ((warteliste_status = ANY (ARRAY['ausstehend'::text, 'kontaktiert'::text, 'aktiv'::text, 'abgelehnt'::text])))
);


--
-- Name: COLUMN sv_leads.warteliste_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sv_leads.warteliste_status IS 'ausstehend = neu eingetragen, kontaktiert = Dispatch hat angerufen, aktiv = onboarded, abgelehnt = nicht aufgenommen';


--
-- Name: sv_live_location; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_live_location (
    sv_id uuid NOT NULL,
    fall_id uuid,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    accuracy double precision,
    eta_minuten integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sv_live_position; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_live_position (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    lat numeric(10,7) NOT NULL,
    lng numeric(10,7) NOT NULL,
    accuracy_m numeric(8,2),
    heading numeric(5,2),
    speed_kmh numeric(5,2),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    route_polyline text,
    distance_to_target_meters integer,
    captured_at timestamp with time zone
);


--
-- Name: COLUMN sv_live_position.captured_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sv_live_position.captured_at IS 'AAR-388: Client-Zeitstempel der GPS-Messung. Offline gesammelte Positionen werden beim Reconnect gebatcht uebertragen und behalten ihre echten Messzeiten.';


--
-- Name: sv_onboarding_rechnungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_onboarding_rechnungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    organisation_id uuid,
    rechnungs_nr text NOT NULL,
    rechnungs_datum date DEFAULT CURRENT_DATE NOT NULL,
    leistungs_datum date NOT NULL,
    paket text,
    netto_cent integer NOT NULL,
    ust_cent integer NOT NULL,
    brutto_cent integer NOT NULL,
    ust_satz_pct numeric(4,2) DEFAULT 19.00 NOT NULL,
    stripe_payment_intent_id text,
    stripe_session_id text,
    pdf_storage_path text,
    kv_pdf_storage_path text,
    nb_pdf_storage_path text,
    versendet_am timestamp with time zone,
    typ text NOT NULL,
    rechnungssteller text DEFAULT 'claimondo_gmbh_igr'::text NOT NULL,
    rechnungs_konfiguration_id uuid,
    konfig_version integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_onboarding_rechnungen_rechnungssteller_check CHECK ((rechnungssteller = ANY (ARRAY['claimondo_gmbh_igr'::text, 'claimondo_gmbh'::text, 'gbr'::text]))),
    CONSTRAINT sv_onboarding_rechnungen_typ_check CHECK ((typ = ANY (ARRAY['solo'::text, 'buero'::text, 'akademie'::text]))),
    CONSTRAINT sv_or_org_required CHECK (((sv_id IS NOT NULL) OR (organisation_id IS NOT NULL)))
);


--
-- Name: TABLE sv_onboarding_rechnungen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_onboarding_rechnungen IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';


--
-- Name: sv_organisation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_organisation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    inhaber_sv_id uuid NOT NULL,
    rechtsform text,
    ust_id text,
    adresse_strasse text,
    adresse_plz character varying(5),
    adresse_ort text,
    adresse_land character varying(2) DEFAULT 'DE'::character varying NOT NULL,
    telefon text,
    email text,
    geo_lat numeric(10,7),
    geo_lng numeric(10,7),
    status text DEFAULT 'aktiv'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notiz text,
    CONSTRAINT sv_organisation_status_check CHECK ((status = ANY (ARRAY['aktiv'::text, 'pausiert'::text, 'deaktiviert'::text])))
);


--
-- Name: TABLE sv_organisation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_organisation IS 'AAR-832: SV-Organisationen — SV-Inhaber mit Läufern (Hilfskräfte die vor Ort Fotos + Daten sammeln). Inhaber kompiliert und unterzeichnet das Gutachten.';


--
-- Name: sv_organisation_laeufer_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_organisation_laeufer_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    laeufer_user_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    claim_id uuid NOT NULL,
    status text DEFAULT 'aufgenommen'::text NOT NULL,
    fotos_count integer DEFAULT 0 NOT NULL,
    daten_jsonb jsonb,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_organisation_laeufer_reports_status_check CHECK ((status = ANY (ARRAY['aufgenommen'::text, 'an_sv_uebergeben'::text, 'sv_freigegeben'::text])))
);


--
-- Name: TABLE sv_organisation_laeufer_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_organisation_laeufer_reports IS 'AAR-832: Läufer-Reports — Vor-Ort-Datensammlung durch Läufer, übergabe an SV-Inhaber zur Gutachten-Kompilierung. Status-Flow: aufgenommen → an_sv_uebergeben → sv_freigegeben.';


--
-- Name: sv_organisation_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_organisation_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    rolle text NOT NULL,
    einsatzgebiet_geo jsonb,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_svorg_end_after_start CHECK (((end_date IS NULL) OR (end_date > start_date))),
    CONSTRAINT sv_organisation_memberships_rolle_check CHECK ((rolle = ANY (ARRAY['inhaber_sv'::text, 'laeufer'::text, 'admin_org'::text])))
);


--
-- Name: TABLE sv_organisation_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_organisation_memberships IS 'AAR-832: Many-to-many User ↔ SV-Organisation. Rollen: inhaber_sv (besitzt Org), laeufer (Vor-Ort-Hilfskraft), admin_org (Organisations-Verwaltung).';


--
-- Name: sv_payment_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_payment_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    reminder_typ text NOT NULL,
    versendet_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_payment_reminders_reminder_typ_check CHECK ((reminder_typ = ANY (ARRAY['email_3d'::text, 'email_7d'::text, 'email_14d'::text, 'admin_task_call_3d'::text, 'admin_task_call_10d'::text, 'final_warnung'::text])))
);


--
-- Name: sv_private_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_private_stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    datum date NOT NULL,
    source text NOT NULL,
    external_event_id text NOT NULL,
    titel text,
    start_zeit timestamp with time zone NOT NULL,
    end_zeit timestamp with time zone NOT NULL,
    address text NOT NULL,
    place_id text,
    lat numeric NOT NULL,
    lng numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_private_stops_source_check CHECK ((source = ANY (ARRAY['gcal'::text, 'caldav'::text]))),
    CONSTRAINT sv_private_stops_zeit_chk CHECK ((end_zeit > start_zeit))
);


--
-- Name: TABLE sv_private_stops; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_private_stops IS 'AAR-872: SV-Privat-Termine aus GCal/CalDAV als Tagesroute-Stops mit gecachetem lat/lng.';


--
-- Name: sv_tages_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sv_tages_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid NOT NULL,
    datum date NOT NULL,
    status text DEFAULT 'idle'::text NOT NULL,
    aktueller_termin_id uuid,
    reihenfolge_termin_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    paused_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sv_tages_session_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'en_route'::text, 'arrived'::text, 'completing'::text, 'finished'::text, 'paused'::text])))
);


--
-- Name: TABLE sv_tages_session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sv_tages_session IS 'AAR-380: Field-Modus Session-State pro SV/Tag. Überlebt Tab-Wechsel und Reload.';


--
-- Name: task_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    reminder_typ text NOT NULL,
    geplant_fuer timestamp with time zone NOT NULL,
    empfaenger_rolle text,
    kanal text DEFAULT 'system'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    versendet_am timestamp with time zone,
    versuche integer DEFAULT 0 NOT NULL,
    fehler text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE task_reminders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task_reminders IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    typ text NOT NULL,
    titel text NOT NULL,
    beschreibung text,
    status public.task_status DEFAULT 'offen'::public.task_status NOT NULL,
    zugewiesen_an uuid,
    faellig_am timestamp with time zone,
    erledigt_am timestamp with time zone,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    task_typ text,
    deadline timestamp with time zone,
    auto_erstellt boolean DEFAULT false,
    erinnerung_gesendet boolean DEFAULT false,
    prioritaet text DEFAULT 'normal'::text,
    lead_id uuid,
    empfaenger_rolle text,
    empfaenger_user_id uuid,
    phase text,
    task_code text,
    trigger_event text,
    gate_task_id uuid,
    entity_type text,
    entity_id uuid,
    auto_resolved_am timestamp with time zone,
    auto_resolved_grund text,
    erstellt_von_id uuid,
    eskaliert_am timestamp with time zone,
    CONSTRAINT chk_tasks_entity_type CHECK (((entity_type IS NULL) OR (entity_type = ANY (ARRAY['fall'::text, 'lead'::text, 'abrechnung'::text, 'reklamation'::text, 'sv_onboarding'::text, 'gutachter'::text, 'kunde'::text, 'case'::text, 'termin'::text, 'gutschrift'::text, 'fall_dokumente'::text])))),
    CONSTRAINT tasks_prioritaet_check CHECK ((prioritaet = ANY (ARRAY['normal'::text, 'dringend'::text, 'kritisch'::text])))
);


--
-- Name: COLUMN tasks.eskaliert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.eskaliert_am IS 'AAR-764: Zeitstempel wann der Task via Eskalations-Cron an eine höhere Rolle weitergegeben wurde. NULL = noch nicht eskaliert.';


--
-- Name: technische_probleme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technische_probleme (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fall_id uuid,
    kategorie text NOT NULL,
    beschreibung text NOT NULL,
    screenshot_url text,
    browser text,
    aktuelle_url text,
    status text DEFAULT 'neu'::text,
    antwort text,
    erstellt_am timestamp with time zone DEFAULT now(),
    CONSTRAINT technische_probleme_status_check CHECK ((status = ANY (ARRAY['neu'::text, 'in-bearbeitung'::text, 'geloest'::text, 'geschlossen'::text])))
);


--
-- Name: termin_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.termin_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    termin_id uuid NOT NULL,
    empfaenger text NOT NULL,
    reminder_typ text NOT NULL,
    geplant_fuer timestamp with time zone NOT NULL,
    versendet_am timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    fehler text,
    versuche integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT termin_reminders_empfaenger_check CHECK ((empfaenger = ANY (ARRAY['kunde'::text, 'sv'::text]))),
    CONSTRAINT termin_reminders_reminder_typ_check CHECK ((reminder_typ = ANY (ARRAY['kunde_morgen'::text, 'kunde_1h'::text, 'sv_route'::text]))),
    CONSTRAINT termin_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: termine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.termine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    kunde_user_id uuid,
    betreuer_user_id uuid,
    typ text DEFAULT 'telefonat'::text NOT NULL,
    datum timestamp with time zone NOT NULL,
    dauer_minuten integer DEFAULT 30 NOT NULL,
    betreff text,
    notiz text,
    meet_link text,
    status text DEFAULT 'geplant'::text NOT NULL,
    ergebnis_notiz text,
    erstellt_am timestamp with time zone DEFAULT now(),
    verschiebung_grund text,
    google_event_id text,
    google_calendar_id text,
    event_synced_at timestamp with time zone,
    event_sync_status text DEFAULT 'pending'::text
);


--
-- Name: TABLE termine; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.termine IS 'AAR-642: KB↔Kunde-Beratungstermine mit Google-Calendar-Sync.

   Scope: Videocalls und Telefonate zwischen Kundenbetreuer (betreuer_user_id)
   und Kunde (kunde_user_id) im Kontext eines Falls (fall_id). Einziger
   Termin-Typ der Google-Meet-Links + Calendar-Sync pflegt.

   NICHT für: Rückrufe (→ admin_termine typ=rueckruf, AAR-637),
              SV-Besichtigungen (→ gutachter_termine, AAR-638),
              KB-Beratungen als Video-Termin im SV-Flow (→ gutachter_termine typ=kb_beratung, AAR-640),
              Kanzlei-Termine (→ admin_termine typ=kunde, AAR-641).

   Writer: /faelle/[id]/actions.ts (createKundeTermin), /admin/DashboardClient (Quick-Add).
   Reader: /admin/DashboardClient, /admin/kalender, /admin/TageskalenderWidget,
           /mitarbeiter/performance, /faelle/[id]/actions (Read-back).';


--
-- Name: COLUMN termine.kunde_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.termine.kunde_user_id IS 'Kunde (auth.users) — Zielgruppe des Termins. Wird beim Insert aus
   faelle.kunde_id befüllt. NULL nur wenn Fall keinen Kunden hat (selten).';


--
-- Name: COLUMN termine.betreuer_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.termine.betreuer_user_id IS 'Kundenbetreuer (auth.users) — hält den Termin. MA-Performance-View
   filtert hierauf (betreuer_user_id = user.id).';


--
-- Name: COLUMN termine.typ; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.termine.typ IS 'Termin-Kanal. Erwartete Werte: video-call | telefonat.
   Nicht als ENUM modelliert — legacy plain text. Bei Erweiterung bitte
   konsistent in allen Writern ergänzen.';


--
-- Name: COLUMN termine.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.termine.status IS 'Termin-Lifecycle. Erwartete Werte:
     geplant       → Initial-Zustand nach createKundeTermin
     bestaetigt    → Kunde hat bestätigt (Admin-UI + MA-Performance filtern darauf)
     durchgefuehrt → Termin fand statt (ergebnis_notiz wird dann gesetzt)
     abgesagt      → vom KB oder Kunde abgesagt (wird in Heute-Listen gefiltert)
     verschoben    → mit verschiebung_grund
   Nicht als ENUM modelliert — legacy plain text. State-Transition über
   updateTerminStatus() in /faelle/[id]/actions.ts.';


--
-- Name: COLUMN termine.verschiebung_grund; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.termine.verschiebung_grund IS 'AAR-161 W1: SV-Terminverschiebung (nachbesichtigung/krankheit/fahrzeug_nicht_verfuegbar/technische_stellungnahme_ausstehend)';


--
-- Name: COLUMN termine.google_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.termine.google_event_id IS 'Google-Calendar-Event-ID — gesetzt wenn Termin via Google-Calendar-API
   erstellt wurde. Zusammen mit google_calendar_id + meet_link und
   event_sync_status (synced | not_synced) die einzige Termin-Tabelle mit
   Google-Sync.';


--
-- Name: timeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid,
    lead_id uuid,
    typ text NOT NULL,
    titel text NOT NULL,
    beschreibung text,
    erstellt_von uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_claim_for_gast; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_for_gast WITH (security_invoker='true') AS
 SELECT id,
    schadentag,
    schadenzeit,
    schadenort_ort,
    schadenort_plz,
    schadenort_land,
    schadenort_kategorie,
    hergang_kunde_text,
    schadenart,
    unfall_konstellation,
    fahrerflucht,
    polizei_aktenzeichen,
    polizei_bericht_vorhanden,
    gegner_versicherung_id,
    hat_personenschaden,
    hat_mietwagen,
    unfallskizze_url,
    unfallskizze_svg,
    status,
    created_at,
    updated_at
   FROM public.claims c
  WHERE (EXISTS ( SELECT 1
           FROM public.claim_parties cp
          WHERE ((cp.claim_id = c.id) AND (cp.user_id = auth.uid()) AND (cp.ist_aktiv = true))));


--
-- Name: VIEW v_claim_for_gast; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_claim_for_gast IS 'AAR-810 A.3 / Stufe-0-Final: Limitierte claim-Sicht fuer Gast-Accounts und alle Beteiligten. Zeigt oeffentliche claim-Daten ohne interne Felder (gegner_aktenzeichen, hergang_sv_text, etc.).';


--
-- Name: vs_korrespondenz; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vs_korrespondenz (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    richtung text NOT NULL,
    kanal text NOT NULL,
    betreff text,
    versicherung text,
    aktenzeichen text,
    notiz text,
    attachment_url text,
    datum timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    status text DEFAULT 'gesendet'::text NOT NULL,
    wartet_auf_antwort_bis timestamp with time zone,
    typ text,
    naechste_frist timestamp with time zone,
    CONSTRAINT vs_korrespondenz_kanal_check CHECK ((kanal = ANY (ARRAY['email'::text, 'post'::text, 'fax'::text, 'telefon'::text, 'portal'::text]))),
    CONSTRAINT vs_korrespondenz_richtung_check CHECK ((richtung = ANY (ARRAY['eingehend'::text, 'ausgehend'::text]))),
    CONSTRAINT vs_korrespondenz_status_check CHECK ((status = ANY (ARRAY['gesendet'::text, 'wartet_auf_antwort'::text, 'ohne_antwort_abgelaufen'::text, 'beantwortet'::text, 'archiviert'::text])))
);


--
-- Name: TABLE vs_korrespondenz; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vs_korrespondenz IS 'AAR-823: VS-Kommunikation (ein- und ausgehend) pro Claim. Kanäle: email/post/fax/telefon/portal. Aktenzeichen der Gegner-Versicherung.';


--
-- Name: COLUMN vs_korrespondenz.naechste_frist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vs_korrespondenz.naechste_frist IS 'CMM-42: Naechster erwarteter Schritt der Versicherung (z.B. zugesagte Zahlung). NULL = kein konkreter Folge-Termin. Wird vom CMM-43-Cron fuer prioritaerte Mitteilungen genutzt.';


--
-- Name: v_claim_full; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_full AS
 SELECT c.id,
    c.vehicle_id,
    c.schadentag,
    c.schadenzeit,
    c.entdeckt_am,
    c.schadenort_adresse,
    c.schadenort_plz,
    c.schadenort_ort,
    c.schadenort_land,
    c.schadenort_lat,
    c.schadenort_lng,
    c.schadenort_kategorie,
    c.hergang_kunde_text,
    c.hergang_sv_text,
    c.schadenart,
    c.fall_typ,
    c.unfall_konstellation,
    c.fahrerflucht,
    c.auslandskennzeichen,
    c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden,
    c.polizei_vor_ort,
    c.polizeibericht_status,
    c.geschaedigter_user_id,
    c.gegnerisches_vehicle_id,
    c.gegner_versicherung_id,
    c.gegner_versicherungsnummer,
    c.gegner_aktenzeichen,
    c.gegner_bekannt,
    c.anzahl_beteiligte_total,
    c.hat_personenschaden,
    c.hat_mietwagen,
    c.hat_nutzungsausfall,
    c.hat_sachschaden,
    c.hat_abschleppung,
    c.sachschaden_beschreibung,
    c.halter_ungleich_fahrer,
    c.kunden_konstellation,
    c.unfallskizze_url,
    c.unfallskizze_svg,
    c.unfallskizze_bestaetigt,
    c.unfallskizze_ablehnung_grund,
    c.unfallskizze_generiert_am,
    c.status,
    c.abgeschlossen_am,
    c.verjaehrt_am,
    c.created_at,
    c.updated_at,
    c.created_by_user_id,
    c.created_via,
    c.claim_nummer,
    c.lead_id,
    c.kundenbetreuer_id,
    c.vs_ablehnungs_grund,
    c.regulierungs_betrag,
    c.endzustand_gesetzt_durch_user_id,
    c.endzustand_gesetzt_am,
    c.endzustand_grund,
    c.kanzlei_wunsch,
    c.kanzlei_wunsch_gefragt_am,
    c.kanzlei_wunsch_gefragt_in_phase,
    f.id AS fall_id,
    f.sv_id,
    c.service_typ,
    f.status AS fall_status,
    f.created_at AS fall_created_at,
    COALESCE(( SELECT cr.last_activity_at
           FROM public.claim_recency cr
          WHERE (cr.claim_id = c.id)), c.created_at) AS fall_updated_at,
    c.kundenbetreuer_fallback_flag,
    c.szenario,
    c.dokumente_vollstaendig_fuer_phase,
    c.dokumente_reminder_whatsapp_letzte_sendung,
    spd_termin.no_show_gemeldet_am,
    spd_termin.re_termin_token,
    c.sa_unterschrieben_am,
    c.vollmacht_signiert_am,
    kf.mandatsnummer,
    spd_termin.re_termin_token_eingelaufen_am,
    spd_termin.re_termin_eskalation_an_kb_am,
    cur_auftrag.storniert_am,
    kf.anschlussschreiben_am,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    f.kennzeichen,
    f.fahrzeug_hersteller,
    f.fahrzeug_modell,
    f.fahrzeug_typ,
    c.sa_unterschrieben,
    kf.regulierung_am,
    c.regulierungs_betrag AS regulierung_betrag,
    (g.gesamt_schadensbetrag)::numeric(10,2) AS gutachten_betrag,
    g.fertiggestellt_am AS gutachten_eingegangen_am,
    c.sv_zugewiesen_am,
    c.schadens_ursache,
    (c.schadenort_plz)::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    c.fall_typ AS schadens_fall_typ,
    f.gegner_anzahl_beteiligte,
    f.gegner_fahrzeugtyp,
    f.organisation_id,
    f.dispatch_id,
    f.kunde_id,
    c.ist_aktiv,
    c.deaktiviert_grund,
    f.hat_vorschaeden,
    f.vorschaden_anzahl,
    f.vorschaden_letzter_datum,
    f.vorschaden_typ_b_bericht,
    f.cardentity_abfrage_am,
    spd_termin.besichtigungsort_adresse,
    spd_termin.besichtigungsort_lat,
    spd_termin.besichtigungsort_lng,
    spd_termin.besichtigungsort_notiz,
    spd_termin.besichtigungsort_place_id,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge, cp.created_at) AS jsonb_agg
           FROM public.claim_parties cp
          WHERE (cp.claim_id = c.id)), '[]'::jsonb) AS parties,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at) AS jsonb_agg
           FROM public.claim_vehicle_involvements cvi
          WHERE (cvi.claim_id = c.id)), '[]'::jsonb) AS vehicle_involvements,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at) AS jsonb_agg
           FROM public.claim_payments cp2
          WHERE (cp2.claim_id = c.id)), '[]'::jsonb) AS payments,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at) AS jsonb_agg
           FROM public.claim_mietwagen cm
          WHERE (cm.claim_id = c.id)), '[]'::jsonb) AS mietwagen,
    COALESCE(( SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum) AS jsonb_agg
           FROM public.vs_korrespondenz vk
          WHERE (vk.claim_id = c.id)), '[]'::jsonb) AS vs_korrespondenz,
    COALESCE(( SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at) AS jsonb_agg
           FROM public.repairs r
          WHERE (r.claim_id = c.id)), '[]'::jsonb) AS repairs,
    vcp.main_phase,
    vcp.sub_phase
   FROM ((((((public.claims c
     LEFT JOIN public.faelle f ON ((f.claim_id = c.id)))
     LEFT JOIN public.gutachten g ON ((g.claim_id = c.id)))
     LEFT JOIN public.kanzlei_faelle kf ON ((kf.claim_id = c.id)))
     LEFT JOIN LATERAL ( SELECT a.storniert_am
           FROM public.auftraege a
          WHERE (a.claim_id = c.id)
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON (true))
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse,
            gt.besichtigungsort_lat,
            gt.besichtigungsort_lng,
            gt.besichtigungsort_notiz,
            gt.besichtigungsort_place_id,
            gt.no_show_gemeldet_am,
            gt.re_termin_token,
            gt.re_termin_token_eingelaufen_am,
            gt.re_termin_eskalation_an_kb_am
           FROM public.gutachter_termine gt
          WHERE (gt.claim_id = c.id)
          ORDER BY gt.start_zeit DESC NULLS LAST
         LIMIT 1) spd_termin ON (true))
     LEFT JOIN public.v_claim_phase vcp ON ((vcp.claim_id = c.id)));


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fin character varying(17) NOT NULL,
    kennzeichen_aktuell character varying(20),
    hsn character varying(4),
    tsn character varying(3),
    hersteller text NOT NULL,
    modell_haupttyp text,
    modell_untertyp text,
    variante text,
    bauart text,
    aufbau text,
    farbe_klartext text,
    farbcode text,
    ist_metallic boolean,
    kraftstoff text,
    leistung_kw integer,
    hubraum_ccm integer,
    zylinder integer,
    getriebe text,
    antriebsart text,
    co2_g_km integer,
    abgasnorm text,
    tuerzahl integer,
    achsen integer,
    sitze integer,
    erstzulassung date,
    baujahr_monat date,
    produktionszeit_von date,
    produktionszeit_bis date,
    laenge_mm integer,
    breite_mm integer,
    hoehe_mm integer,
    radstand_mm integer,
    leermasse_kg integer,
    zul_gesamtmasse_kg integer,
    tankvolumen_l integer,
    aktueller_kilometerstand integer,
    aktueller_kilometerstand_at timestamp with time zone,
    status text DEFAULT 'aktiv'::text NOT NULL,
    current_owner_id uuid,
    zb1_dokument_id uuid,
    cardentity_letzter_pull timestamp with time zone,
    data_completeness_score numeric(3,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicles_aktueller_kilometerstand_check CHECK (((aktueller_kilometerstand IS NULL) OR (aktueller_kilometerstand >= 0))),
    CONSTRAINT vehicles_data_completeness_score_check CHECK (((data_completeness_score IS NULL) OR ((data_completeness_score >= (0)::numeric) AND (data_completeness_score <= (1)::numeric)))),
    CONSTRAINT vehicles_fin_check CHECK ((length((fin)::text) = 17)),
    CONSTRAINT vehicles_status_check CHECK ((status = ANY (ARRAY['aktiv'::text, 'stillgelegt'::text, 'verkauft'::text, 'totalschaden'::text, 'exportiert'::text])))
);


--
-- Name: TABLE vehicles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vehicles IS 'AAR-770/773: Vehicle als zentrale Asset-Entität. FIN als ISO-3779-Anker, UUID als technischer PK.';


--
-- Name: COLUMN vehicles.fin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicles.fin IS 'Fahrzeug-Identifizierungsnummer (17 Zeichen, ISO 3779). UNIQUE über alle Vehicles.';


--
-- Name: COLUMN vehicles.aktueller_kilometerstand; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicles.aktueller_kilometerstand IS 'Letzter bekannter KM-Stand. Wird via Trigger aus vehicle_mileage_readings synchronisiert (Phase 2 / AAR-774).';


--
-- Name: v_claim_listing; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_listing AS
 SELECT c.id AS claim_id,
    c.claim_nummer,
    c.status,
    c.schadentag,
    c.kunden_konstellation,
    c.created_at,
    c.updated_at,
    f.id AS fall_id,
    f.sv_id,
    c.kundenbetreuer_id AS faelle_kundenbetreuer_id,
    c.kundenbetreuer_id AS claim_kundenbetreuer_id,
    c.service_typ,
    p.anzeigename AS kunde_anzeigename,
    p.vorname AS kunde_vorname,
    p.nachname AS kunde_nachname,
    v.kennzeichen_aktuell AS kennzeichen,
    vcp.main_phase,
    vcp.sub_phase
   FROM ((((public.claims c
     LEFT JOIN public.faelle f ON ((f.claim_id = c.id)))
     LEFT JOIN public.profiles p ON ((p.id = c.geschaedigter_user_id)))
     LEFT JOIN public.vehicles v ON ((v.id = c.vehicle_id)))
     LEFT JOIN public.v_claim_phase vcp ON ((vcp.claim_id = c.id)));


--
-- Name: v_claim_parties_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_parties_safe WITH (security_invoker='true') AS
 SELECT id,
    claim_id,
    rolle,
    reihenfolge,
    user_id,
    vorname,
        CASE
            WHEN (user_id = auth.uid()) THEN nachname
            WHEN (EXISTS ( SELECT 1
               FROM public.profiles
              WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))) THEN nachname
            ELSE COALESCE(("left"(nachname, 1) || '.'::text), ''::text)
        END AS nachname,
    firma,
    ist_gewerbe,
        CASE
            WHEN ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.profiles
              WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) THEN telefon
            ELSE NULL::text
        END AS telefon,
        CASE
            WHEN ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.profiles
              WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) THEN email
            ELSE NULL::text
        END AS email,
        CASE
            WHEN ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.profiles
              WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) THEN adresse_strasse
            ELSE NULL::text
        END AS adresse_strasse,
        CASE
            WHEN ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.profiles
              WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) THEN geburtsdatum
            ELSE NULL::date
        END AS geburtsdatum,
    ist_halter,
    ist_fahrer,
    kennzeichen,
    fahrzeugtyp_klartext,
    vehicle_id,
        CASE
            WHEN ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.profiles
              WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) THEN versicherungsnummer
            ELSE NULL::text
        END AS versicherungsnummer,
    versicherung_id,
    ist_aktiv,
    ist_anonymisiert,
    quelle,
    created_at,
    updated_at
   FROM public.claim_parties;


--
-- Name: VIEW v_claim_parties_safe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_claim_parties_safe IS 'AAR-810 A.2: DSGVO-konforme Cross-Party-Sicht. Eigene Daten + Staff sehen alles, andere Co-Parties nur Vorname + Initiale + öffentliche Felder (Kennzeichen, Versicherer-ID).';


--
-- Name: v_claim_sv; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_sv WITH (security_invoker='false') AS
 SELECT id,
    claim_nummer,
    status,
    fall_typ,
    abgeschlossen_am,
    anzahl_beteiligte_total,
    auslandskennzeichen,
    brn,
    created_at,
    entdeckt_am,
    fahrerflucht,
    finanzierung_leasing,
    gegner_aktenzeichen,
    gegner_bekannt,
    gegner_versicherung_id,
    gegner_versicherungsnummer,
    gegnerisches_vehicle_id,
    gewerbe_flag,
    halter_ungleich_fahrer,
    hat_abschleppung,
    hat_mietwagen,
    hat_nutzungsausfall,
    hat_personenschaden,
    hat_sachschaden,
    hergang_kunde_text,
    hergang_sv_text,
    kunde_no_show_count,
    kunden_konstellation,
    kundenbetreuer_id,
    letzter_no_show_am,
    letzter_sv_no_show_am,
    polizei_aktenzeichen,
    polizei_bericht_vorhanden,
    polizei_vor_ort,
    polizeibericht_status,
    sachschaden_beschreibung,
    schadenart,
    schadenort_adresse,
    schadenort_kategorie,
    schadenort_land,
    schadenort_lat,
    schadenort_lng,
    schadenort_ort,
    schadenort_plz,
    schadentag,
    schadenzeit,
    spezifikation,
    sv_id,
    sv_no_show_count,
    unfall_konstellation,
    unfallskizze_ablehnung_grund,
    unfallskizze_bestaetigt,
    unfallskizze_generiert_am,
    unfallskizze_svg,
    unfallskizze_url,
    updated_at,
    vehicle_id,
    vorschaden_mit_vs_abgerechnet,
    vorsteuerabzugsberechtigt,
    zeugen_kontakte
   FROM public.claims c
  WHERE public.is_sv_for_claim(id);


--
-- Name: v_claim_timeline; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_claim_timeline AS
 SELECT event_id,
    claim_id,
    fall_id,
    event_at,
    event_typ,
    event_kategorie,
    actor_user_id,
    actor_rolle,
    payload_jsonb,
    sichtbar_fuer_kunde,
    sichtbar_fuer_sv,
    detail_url_path
   FROM ( SELECT (md5(('lead-aufgenommen-'::text || l.id)))::uuid AS event_id,
            l.konvertiert_zu_claim_id AS claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = l.konvertiert_zu_claim_id)
                 LIMIT 1) AS fall_id,
            l.created_at AS event_at,
            'lead.aufgenommen'::text AS event_typ,
            'phase'::text AS event_kategorie,
            NULL::uuid AS actor_user_id,
            'system'::text AS actor_rolle,
            jsonb_build_object('lead_id', l.id, 'quelle', l.source_channel) AS payload_jsonb,
            true AS sichtbar_fuer_kunde,
            false AS sichtbar_fuer_sv,
            NULL::text AS detail_url_path
           FROM public.leads l
          WHERE (l.konvertiert_zu_claim_id IS NOT NULL)
        UNION ALL
         SELECT (md5(('lead-konvertiert-'::text || l.id)))::uuid AS md5,
            l.konvertiert_zu_claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = l.konvertiert_zu_claim_id)
                 LIMIT 1) AS id,
            l.konvertiert_am,
            'lead.konvertiert'::text AS text,
            'phase'::text AS text,
            l.konvertiert_durch_user_id,
            'dispatcher'::text AS text,
            jsonb_build_object('lead_id', l.id) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.leads l
          WHERE ((l.konvertiert_zu_claim_id IS NOT NULL) AND (l.konvertiert_am IS NOT NULL))
        UNION ALL
         SELECT (md5(('phase-'::text || (pt.id)::text)))::uuid AS md5,
            f.claim_id,
            pt.fall_id,
            pt.transition_at,
            'phase.geaendert'::text AS text,
            'phase'::text AS text,
            pt.transitioned_by,
            COALESCE(pt.actor_rolle, 'system'::text) AS "coalesce",
            jsonb_build_object('from_phase', pt.from_phase, 'to_phase', pt.to_phase, 'trigger_type', pt.trigger_type, 'grund', pt.grund) AS jsonb_build_object,
            true,
            true,
            NULL::text AS text
           FROM (public.phase_transitions pt
             JOIN public.faelle f ON ((f.id = pt.fall_id)))
          WHERE (f.claim_id IS NOT NULL)
        UNION ALL
         SELECT (md5(((('endzustand-'::text || (c.id)::text) || '-'::text) || c.status)))::uuid AS md5,
            c.id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = c.id)
                 LIMIT 1) AS id,
            c.endzustand_gesetzt_am,
            ('claim.'::text || c.status),
            'phase'::text AS text,
            c.endzustand_gesetzt_durch_user_id,
            'kb'::text AS text,
            jsonb_build_object('status', c.status, 'regulierungs_betrag', c.regulierungs_betrag, 'vs_ablehnungs_grund', c.vs_ablehnungs_grund, 'endzustand_grund', c.endzustand_grund) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.claims c
          WHERE ((c.endzustand_gesetzt_am IS NOT NULL) AND (c.status = ANY (ARRAY['in_kommunikation_vs'::text, 'reguliert'::text, 'abgelehnt'::text, 'an_externe_kanzlei_uebergeben'::text, 'storniert'::text])))
        UNION ALL
         SELECT (md5(('gutachten-beauftragt-'::text || (g.id)::text)))::uuid AS md5,
            g.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = g.claim_id)
                 LIMIT 1) AS id,
            g.created_at,
            'gutachten.beauftragt'::text AS text,
            'gutachten'::text AS text,
            NULL::uuid AS uuid,
            'kb'::text AS text,
            jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id) AS jsonb_build_object,
            true,
            true,
            ('/faelle/'::text || (( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = g.claim_id)
                 LIMIT 1))::text)
           FROM public.gutachten g
          WHERE (g.claim_id IS NOT NULL)
        UNION ALL
         SELECT (md5(('gutachten-final-'::text || (g.id)::text)))::uuid AS md5,
            g.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = g.claim_id)
                 LIMIT 1) AS id,
            g.updated_at,
            'gutachten.fertig'::text AS text,
            'gutachten'::text AS text,
            NULL::uuid AS uuid,
            'sv'::text AS text,
            jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id) AS jsonb_build_object,
            true,
            true,
            ('/faelle/'::text || (( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = g.claim_id)
                 LIMIT 1))::text)
           FROM public.gutachten g
          WHERE ((g.claim_id IS NOT NULL) AND (g.status = 'final'::text))
        UNION ALL
         SELECT (md5(((('repair-'::text || (r.id)::text) || '-'::text) || r.status)))::uuid AS md5,
            r.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = r.claim_id)
                 LIMIT 1) AS id,
            r.updated_at,
            ('repair.'::text || r.status),
            'reparatur'::text AS text,
            NULL::uuid AS uuid,
            'system'::text AS text,
            jsonb_build_object('repair_id', r.id, 'werkstatt_id', r.werkstatt_id, 'status', r.status) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.repairs r
          WHERE ((r.claim_id IS NOT NULL) AND (r.status = ANY (ARRAY['geplant'::text, 'in_arbeit'::text, 'abgeschlossen'::text])))
        UNION ALL
         SELECT (md5(('vsk-'::text || (vk.id)::text)))::uuid AS md5,
            vk.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = vk.claim_id)
                 LIMIT 1) AS id,
            vk.datum,
            'vs.brief_versendet'::text AS text,
            'vs'::text AS text,
            vk.created_by_user_id,
            'kb'::text AS text,
            jsonb_build_object('typ', vk.typ, 'kanal', vk.kanal, 'richtung', vk.richtung, 'versicherung', vk.versicherung, 'aktenzeichen', vk.aktenzeichen) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.vs_korrespondenz vk
          WHERE ((vk.claim_id IS NOT NULL) AND (vk.status <> 'archiviert'::text))
        UNION ALL
         SELECT (md5(((('payment-'::text || (cp.id)::text) || '-'::text) || cp.status)))::uuid AS md5,
            cp.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = cp.claim_id)
                 LIMIT 1) AS id,
            cp.updated_at,
            ('payment.'::text || cp.status),
            'zahlung'::text AS text,
            NULL::uuid AS uuid,
            'kb'::text AS text,
            jsonb_build_object('payment_id', cp.id, 'erhaltener_betrag', cp.erhaltener_betrag, 'forderungsbetrag', cp.forderungsbetrag, 'status', cp.status) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.claim_payments cp
          WHERE ((cp.claim_id IS NOT NULL) AND (cp.status = ANY (ARRAY['erhalten'::text, 'teilweise'::text, 'final'::text])))
        UNION ALL
         SELECT (md5(('mietwagen-start-'::text || (cm.id)::text)))::uuid AS md5,
            cm.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = cm.claim_id)
                 LIMIT 1) AS id,
            (cm.beginn_datum)::timestamp with time zone AS beginn_datum,
            'mietwagen.gestartet'::text AS text,
            'reparatur'::text AS text,
            NULL::uuid AS uuid,
            'system'::text AS text,
            jsonb_build_object('mietwagen_id', cm.id, 'anbieter', cm.anbieter, 'fahrzeugklasse', cm.fahrzeugklasse) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.claim_mietwagen cm
          WHERE ((cm.claim_id IS NOT NULL) AND (cm.beginn_datum IS NOT NULL) AND (cm.status = ANY (ARRAY['aktiv'::text, 'beendet'::text])))
        UNION ALL
         SELECT (md5(('mietwagen-ende-'::text || (cm.id)::text)))::uuid AS md5,
            cm.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = cm.claim_id)
                 LIMIT 1) AS id,
            (cm.tatsaechliches_ende)::timestamp with time zone AS tatsaechliches_ende,
            'mietwagen.beendet'::text AS text,
            'reparatur'::text AS text,
            NULL::uuid AS uuid,
            'system'::text AS text,
            jsonb_build_object('mietwagen_id', cm.id, 'tage_gesamt', cm.tage_gesamt, 'gesamtkosten_netto', cm.gesamtkosten_netto) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.claim_mietwagen cm
          WHERE ((cm.claim_id IS NOT NULL) AND (cm.tatsaechliches_ende IS NOT NULL))
        UNION ALL
         SELECT (md5(('termin-'::text || (gt.id)::text)))::uuid AS md5,
            gt.claim_id,
            gt.fall_id,
            COALESCE(gt.durchgefuehrt_am, gt.created_at) AS "coalesce",
                CASE
                    WHEN (gt.durchgefuehrt_am IS NOT NULL) THEN 'termin.durchgefuehrt'::text
                    ELSE 'termin.gebucht'::text
                END AS "case",
            'gutachten'::text AS text,
            NULL::uuid AS uuid,
            'sv'::text AS text,
            jsonb_build_object('termin_id', gt.id, 'typ', gt.typ, 'status', gt.status) AS jsonb_build_object,
            true,
            true,
            NULL::text AS text
           FROM public.gutachter_termine gt
          WHERE (gt.claim_id IS NOT NULL)
        UNION ALL
         SELECT (md5(('airdrop-versendet-'::text || (ai.id)::text)))::uuid AS md5,
            ai.claim_id,
            ( SELECT f.id
                   FROM public.faelle f
                  WHERE (f.claim_id = ai.claim_id)
                 LIMIT 1) AS id,
            ai.created_at,
            'airdrop.versendet'::text AS text,
            'kommunikation'::text AS text,
            NULL::uuid AS uuid,
            'kb'::text AS text,
            jsonb_build_object('invitation_id', ai.id, 'status', ai.status) AS jsonb_build_object,
            true,
            false,
            NULL::text AS text
           FROM public.airdrop_invitations ai
          WHERE (ai.claim_id IS NOT NULL)
        UNION ALL
         SELECT (md5(('manuell-'::text || (tl.id)::text)))::uuid AS md5,
            f.claim_id,
            tl.fall_id,
            tl.created_at,
            'manuell.notiz'::text AS text,
            'manuell'::text AS text,
            tl.erstellt_von,
            'kb'::text AS text,
            jsonb_build_object('titel', tl.titel, 'beschreibung', tl.beschreibung, 'typ', tl.typ) AS jsonb_build_object,
            (COALESCE(((tl.metadata ->> 'intern'::text))::boolean, false) = false),
            false,
            NULL::text AS text
           FROM (public.timeline tl
             JOIN public.faelle f ON ((f.id = tl.fall_id)))
          WHERE (f.claim_id IS NOT NULL)) sub;


--
-- Name: VIEW v_claim_timeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_claim_timeline IS 'AAR-843: Aggregierte Verlaufs-Sicht über 11 Quellen (leads, phase_transitions, claims-Endzustand, gutachten, repairs, vs_korrespondenz, claim_payments, claim_mietwagen, gutachter_termine, airdrop_invitations, timeline). Anti-Pattern 14.9: KEINE eigene Tabelle — Single Source bleibt pro Underlying-Tabelle.';


--
-- Name: v_faelle_mit_aktuellem_termin; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_faelle_mit_aktuellem_termin AS
 SELECT f.id,
    f.lead_id,
    f.kunde_id,
    f.status,
    c.betreuungspaket,
    c.hergang_kunde_text AS schadens_beschreibung,
    c.schadentag AS schadens_datum,
    c.entdeckt_am AS schadens_entdeckt_am,
    c.schadenort_adresse AS schadens_adresse,
    (c.schadenort_plz)::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    c.abtretung_pdf,
    c.vollmacht_pdf,
    c.abtretung_signiert_am,
    c.vollmacht_signiert_am,
    f.sv_id,
    c.sv_zugewiesen_am,
    g.fertiggestellt_am AS gutachten_eingegangen_am,
    (g.gesamt_schadensbetrag)::numeric(10,2) AS gutachten_betrag,
    c.kanzlei_uebergeben_am,
    kf.anschlussschreiben_am,
    c.regulierungs_betrag AS regulierung_betrag,
    kf.regulierung_am,
    cur_auftrag.filmcheck_ok,
    cur_auftrag.filmcheck_am,
    cur_auftrag.filmcheck_notizen,
    c.notizen,
    c.created_at,
    COALESCE(( SELECT cr.last_activity_at
           FROM public.claim_recency cr
          WHERE (cr.claim_id = c.id)), c.created_at) AS updated_at,
    c.fall_typ AS schadens_fall_typ,
    c.kunden_konstellation,
    f.kennzeichen,
    f.fahrzeug_typ,
    f.fahrzeug_hersteller,
    f.fahrzeug_modell,
    f.fahrzeug_baujahr,
    f.gegner_name,
    f.gegner_versicherung,
    f.gegner_kennzeichen,
    c.gegner_bekannt,
    c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden,
    c.hat_personenschaden AS personenschaden_flag,
    c.hat_mietwagen AS mietwagen_flag,
    c.gewerbe_flag,
    c.halter_ungleich_fahrer AS halter_ungleich_fahrer_flag,
    f.ust_id,
    f.leasinggeber_name,
    c.leasinggeber_informiert,
    f.bank_name,
    c.prioritaet,
    c.onboarding_complete,
    f.dispatch_id,
    c.kundenbetreuer_id,
    f.konvertiert_am,
    c.lead_id AS konvertiert_von_lead,
    c.status_changed_at,
    kf.regulierung_angekuendigt_am,
    NULL::timestamp with time zone AS zahlung_eingegangen_am,
    c.abgeschlossen_am,
    c.google_review_gesendet,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    f.fin_quelle,
    f.fin_extrahiert_am,
    f.vorschaden_geprueft,
    f.vorschaden_anzahl,
    f.vorschaden_letzter_datum,
    f.vorschaden_typ_a_ergebnis,
    f.vorschaden_typ_b_bericht,
    f.vorschaden_typ_b_pdf_url,
    f.cardentity_abfrage_am,
    c.schadens_hoehe_netto,
    (g.gutachten_nutzungsausfall_tagessatz_eur)::numeric(10,2) AS nutzungsausfall_tagessatz,
    g.wiederbeschaffungsdauer_tage AS reparaturdauer_tage,
    g.gutachten_sv_honorar_netto AS gutachter_honorar,
    g.ocr_finished_at AS ocr_extrahiert_am,
    g.gutachten_ocr_raw AS ocr_rohdaten,
    g.ki_kalkulation,
    g.ki_kalkulation_am,
    (g.ki_geschaetzte_kosten_min)::numeric(10,2) AS ki_geschaetzte_kosten_min,
    (g.ki_geschaetzte_kosten_max)::numeric(10,2) AS ki_geschaetzte_kosten_max,
    c.kanzlei_ansprechpartner_name,
    c.kanzlei_ansprechpartner_email,
    c.kanzlei_ansprechpartner_telefon,
    c.kanzlei_ansprechpartner_position,
    kf.mandatsnummer,
    t.losfahren_erinnerung_gesendet,
    t.termin_erinnerung_5min_gesendet,
    t.geschaetzte_fahrtzeit_min AS geschaetzte_fahrzeit_min,
    t.geschaetzte_fahrdistanz_km,
    t.google_event_id AS gcal_event_id,
    (g.id IS NOT NULL) AS gutachten_vorhanden,
    g.pdf_uploaded_at AS gutachten_hochgeladen_am,
    g.positionen AS gutachten_positionen,
    g.auftragsnummer AS gutachten_nummer,
    g.reparaturkosten_netto AS reparaturkosten,
    g.minderwert AS wertminderung,
    ((g.gutachten_nutzungsausfall_tagessatz_eur * (g.nutzungsausfall_tage)::numeric))::numeric(10,2) AS nutzungsausfall_gesamt,
    kf.regulierungsweise,
    c.gegner_versicherungsnummer,
    c.sa_unterschrieben,
    c.sa_unterschrieben_am,
    c.sa_pdf_url,
    c.sa_unterschrift_url,
    c.datenschutz_akzeptiert,
    c.datenschutz_akzeptiert_am,
    c.vollmacht_status,
    c.polizei_vor_ort,
    c.hergang_kunde_text AS unfallhergang,
    c.unfallmitteilung_status,
    c.schadenort_adresse AS unfallort,
    c.schadentag AS unfalldatum,
    c.interne_notizen,
    kf.anschlussschreiben_url,
    kf.anschlussschreiben_sendedatum,
    COALESCE(kf.anschlussschreiben_unterschrift, false) AS anschlussschreiben_unterschrift,
    kf.anschlussschreiben_ocr_am,
    t.besichtigungsort_adresse,
    t.besichtigungsort_lat,
    t.besichtigungsort_lng,
    t.besichtigungsort_place_id,
    c.ist_aktiv,
    c.deaktiviert_am,
    c.deaktiviert_grund,
    c.deaktiviert_notiz,
    c.szenario,
    kf.ruege_erhalten_am,
    kf.ruege_grund,
    f.fahrzeug_farbe,
    f.erstzulassung,
    f.kilometerstand,
    f.firma_name,
    c.marketing_quelle,
    c.marketing_provision,
    c.marketing_provision_status,
    NULL::numeric(10,2) AS gutachten_stundensatz,
    kf.kanzlei_id,
    c.kanzlei_honorar,
    f.zahlung_erwartet_am,
    NULL::numeric(10,2) AS zahlung_betrag,
    c.lead_preis_netto,
    c.lead_preis_typ,
    c.lead_preis_berechnet_am,
    c.guthaben_verrechnet_netto,
    c.sv_nachzahlung_netto,
    c.abrechnung_id,
    cur_auftrag.storniert_am,
    cur_auftrag.storno_grund,
    cur_auftrag.storno_durch_user_id,
    t.no_show_gemeldet_am,
    c.spezifikation,
    c.schadenart AS schadens_art,
    f.organisation_id,
    c.dokumente_vollstaendig_fuer_phase,
    c.dokumente_vollstaendig_am_phase,
    c.unfall_konstellation,
    f.gegner_anzahl_beteiligte,
    f.gegner_fahrzeugtyp,
    c.dokumente_reminder_whatsapp_letzte_sendung,
    f.fin_vin,
    f.source_channel,
    f.source_domain,
    c.schadens_ursache,
    c.kanzlei_abrechnung_id,
    c.kanzlei_provision_status,
    c.kanzlei_provision_ausgezahlt_am,
    c.service_typ,
    kf.vs_reaktion_typ,
    kf.vs_reaktion_am,
    c.vs_ablehnungs_grund AS vs_ablehnungsgrund,
    kf.ruege_gesendet_am,
    kf.ruege_betrag,
    c.kunde_no_show_count AS no_show_count,
    kf.kuerzungs_betrag,
    kf.vs_frist_bis,
    COALESCE(kf.ruege_counter, 0) AS ruege_counter,
    c.schlussabrechnung_am,
    c.iban,
    c.bic,
    c.kontoinhaber,
    c.bankdaten_hinterlegt_am,
    f.ist_fahrzeughalter,
    c.finanzierung_leasing,
    c.vorsteuerabzugsberechtigt,
    c.hergang_kunde_text AS schadens_hergang,
    f.halter_vorname,
    f.halter_nachname,
    f.halter_strasse,
    f.halter_plz,
    f.halter_stadt,
    f.halter_telefon,
    f.halter_email,
    c.finanzierungsgeber_name,
    c.finanzierungsgeber_adresse,
    c.finanzierungsgeber_vertragsnr,
    c.zahlungsweg,
    f.hat_vorschaeden,
    f.vorschaeden_beschreibung,
    cur_auftrag.technische_stellungnahme_status,
    cur_auftrag.technische_stellungnahme_beauftragt_am,
    cur_auftrag.technische_stellungnahme_hochgeladen_am,
    cur_auftrag.technische_stellungnahme_freigabe_am,
    t.nachbesichtigung_status,
    t.nachbesichtigung_angefordert_am,
    t.nachbesichtigung_termin_datum,
    t.nachbesichtigung_konfrontation,
    kf.as_geforderte_summe,
    kf.as_frist,
    kf.as_vs_reaktion_text,
    kf.as_salesforce_id,
    kf.as_zuletzt_synced_am,
    kf.lexdrive_case_id,
    kf.eskalation_tag_14_am,
    kf.eskalation_tag_21_am,
    kf.eskalation_tag_28_am,
    c.schadenort_kategorie AS unfallort_kategorie,
    c.unfallskizze_url,
    f.fahrzeug_ausstattung,
    f.cardentity_enriched_at,
    f.cardentity_report,
    c.vollmacht_geprueft_am,
    c.vollmacht_geprueft_von,
    c.vollmacht_pruefung_status,
    c.vollmacht_pruefung_begruendung,
    kf.lexdrive_ocr_data,
    kf.lexdrive_ocr_received_at,
    kf.vs_kuerzung_grund,
    c.geschlossen_grund,
    t.nachbesichtigung_ergebnis,
    c.bevorzugter_kanal,
    c.gegner_versicherung_id,
    c.zeugen_kontakte,
    c.werkstatt_seit_datum,
    c.fahrzeug_fahrbereit,
    c.hat_nutzungsausfall AS nutzungsausfall,
    f.mietwagen_kanzlei_informiert,
    f.mietwagen_kanzlei_informiert_am,
    f.halter_geburtsdatum,
    c.abrechnungsart_besprochen,
    c.abrechnungsart_notiz,
    c.abrechnungsart_besprochen_am,
    f.gegner_versicherung_anfrage_datum,
    c.sprache,
    c.unfallskizze_svg,
    c.unfallskizze_bestaetigt,
    c.unfallskizze_ablehnung_grund,
    c.unfallskizze_generiert_am,
    c.zeugen_vorhanden,
    f.vorschaden_erkannt,
    t.sv_termin_dokument_reminder_gesendet_am,
    c.kundenbetreuer_fallback_flag,
    c.kundenbetreuer_zugewiesen_am,
    cur_auftrag.sv_briefing_text,
    cur_auftrag.sv_briefing_generated_at,
    cur_auftrag.sv_briefing_model,
    cur_auftrag.sv_briefing_version,
    cur_auftrag.sv_briefing_struktur,
    cur_auftrag.sv_notizen_vor_ort,
    c.makler_id,
    c.hat_sachschaden AS sachschaden_flag,
    c.sachschaden_beschreibung,
    c.gegner_aktenzeichen AS gegner_schadennummer,
    f.halter_name,
    t.wunschtermin,
    kf.vs_quote_prozent,
    kf.vs_quote_grund,
    kf.vs_quote_akzeptiert_am,
    kf.vs_quote_betrag_ausgezahlt,
    kf.vs_kuerzungs_typ,
    f.auszahlung_kunde_betrag,
    f.auszahlung_kunde_eingegangen_am,
    c.auszahlung_gutachter_eingegangen_am,
    c.auszahlung_zahlungsweg,
    kf.eskalation_tag_14_ergebnis,
    kf.eskalation_tag_14_ergebnis_am,
    kf.eskalation_tag_14_ergebnis_von,
    kf.eskalation_tag_21_ergebnis,
    kf.eskalation_tag_21_ergebnis_am,
    kf.eskalation_tag_21_ergebnis_von,
    kf.eskalation_tag_28_ergebnis,
    kf.eskalation_tag_28_ergebnis_am,
    kf.eskalation_tag_28_ergebnis_von,
    t.nachbesichtigung_kunde_termin_vorschlaege,
    t.nachbesichtigung_kunde_termin_eingereicht_am,
    t.nachbesichtigung_sv_konfrontation_gewuenscht,
    t.nachbesichtigung_sv_termin_vereinbart_am,
    c.auszahlung_gutachter_betrag,
    COALESCE(kf.ruege_frist_tage, 14) AS ruege_frist_tage,
    kf.klage_uebergeben_am,
    c.fallakte_angelegt_am,
    cp_g.vorname AS kunde_vorname,
    cp_g.nachname AS kunde_nachname,
    cp_g.telefon AS kunde_telefon,
    c.kunde_email,
    cp_g.adresse_strasse AS kunde_strasse,
    (cp_g.adresse_plz)::text AS kunde_plz,
    cp_g.adresse_ort AS kunde_stadt,
    cp_g.adresse_strasse AS kunde_adresse,
    f.kunde_lat,
    f.kunde_lng,
    f.hsn,
    f.tsn,
    cur_auftrag.technische_stellungnahme_notiz_sv,
    c.fahrerflucht,
    c.auslandskennzeichen,
    c.polizeibericht_status,
    c.zb1_status,
    (c.schadenzeit)::text AS unfall_uhrzeit,
    (c.schadenort_lat)::numeric AS unfallort_lat,
    (c.schadenort_lng)::numeric AS unfallort_lng,
    c.bkat_unfallart,
    c.fahrzeugschaden_beschreibung,
    c.hat_mietwagen AS mietwagen_hat,
    c.mietwagen_seit_datum,
    c.mietwagen_limit_tage,
    c.mietwagen_limit_grund,
    c.mietwagen_rechnung_vorhanden,
    c.mietwagen_rechnung_url,
    c.mietwagen_argumentations_puffer,
    c.mietwagen_vermieter,
    c.vehicle_id,
    f.claim_id,
    f.lackfarbe_code,
    t.id AS aktueller_termin_id,
    t.start_zeit AS aktueller_termin_start,
    t.end_zeit AS aktueller_termin_end,
    t.status AS aktueller_termin_status,
    t.sv_id AS aktueller_termin_sv_id,
    t.kanal AS aktueller_termin_kanal,
    t.typ AS aktueller_termin_typ,
    t.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab,
    t.start_zeit AS sv_termin,
    t.status AS gutachter_termin_status,
    (t.status = 'bestaetigt'::text) AS gutachter_termin_bestaetigt,
    t.vorgeschlagenes_datum AS gutachter_gegenvorschlag_datum,
    t.gegenvorschlag_grund AS gutachter_gegenvorschlag_grund,
    c.claim_nummer,
    vcp.main_phase,
    vcp.sub_phase
   FROM (((((((public.faelle f
     LEFT JOIN public.claims c ON ((c.id = f.claim_id)))
     LEFT JOIN public.gutachten g ON ((g.claim_id = c.id)))
     LEFT JOIN public.kanzlei_faelle kf ON ((kf.claim_id = c.id)))
     LEFT JOIN LATERAL ( SELECT gt.id,
            gt.sv_id,
            gt.fall_id,
            gt.start_zeit,
            gt.end_zeit,
            gt.status,
            gt.externer_kalender_id,
            gt.ablehnungsgrund,
            gt.gegenvorschlag_zeit,
            gt.created_at,
            gt.erinnerung_24h_gesendet,
            gt.erinnerung_2h_gesendet,
            gt.erinnerung_48h_docs_gesendet,
            gt.ankunft_zeit,
            gt.abschluss_zeit,
            gt.uebersprungen,
            gt.uebersprung_grund,
            gt.notizen_vor_ort,
            gt.gps_lat_ankunft,
            gt.gps_lng_ankunft,
            gt.lead_id,
            gt.ablehnen_token,
            gt.abgelehnt_am,
            gt.abgelehnt_grund,
            gt.vorgeschlagenes_datum,
            gt.gegenvorschlag_grund,
            gt.gegenvorschlag_von,
            gt.ankunft_via,
            gt.verspaetung_minuten,
            gt.losgefahren_am,
            gt.kunden_tracking_token,
            gt.notification_losgefahren_gesendet_am,
            gt.notification_5min_gesendet_am,
            gt.notification_angekommen_gesendet_am,
            gt.ablehnen_token_expires_at,
            gt.final_verbindlich_ab,
            gt.sv_ablehnung_grund,
            gt.sv_ablehnung_am,
            gt.sv_vorgeschlagene_slots,
            gt.typ,
            gt.kanal,
            gt.video_link,
            gt.kb_id,
            gt.notiz_kunde,
            gt.notiz_intern,
            gt.reminder_sent_at,
            gt.reminder_1h_sent_at,
            gt.cancelled_at,
            gt.navigation_started_at,
            gt.sv_unterwegs_seit,
            gt.sv_eta_minuten,
            gt.sv_eta_letzte_berechnung,
            gt.sv_angekommen_am,
            gt.reminder_15min_sent_at,
            gt.reminder_5min_sent_at,
            gt.durchgefuehrt_am,
            gt.kunde_tracking_aktiviert,
            gt.kunde_losgefahren_am,
            gt.kunde_eta_minuten,
            gt.kunde_eta_letzte_berechnung,
            gt.kunde_angekommen_am,
            gt.kunde_verspaetung_gemeldet_am,
            gt.bezahlt,
            gt.honorar_betrag,
            gt.google_event_id,
            gt.google_calendar_id,
            gt.google_event_synced_at,
            gt.kunde_response_token,
            gt.kunde_response_token_expires_at,
            gt.gesehen_am,
            gt.geschaetzte_fahrtzeit_min,
            gt.auftrag_id,
            gt.verlegung_quelle_id,
            gt.verlegung_grund,
            gt.verlegung_kunde_benachrichtigt_an,
            gt.verlegung_eskalation_an_kb_an,
            gt.verlegung_initiator_kunde,
            gt.besichtigung_gestartet_am,
            gt.caldav_object_url,
            gt.caldav_event_uid,
            gt.caldav_synced_at,
            gt.erinnerung_morgen_gesendet,
            gt.sv_lead_id,
            gt.besichtigungsort_adresse,
            gt.besichtigungsort_lat,
            gt.besichtigungsort_lng,
            gt.besichtigungsort_place_id,
            gt.geschaetzte_fahrdistanz_km,
            gt.termin_erinnerung_5min_gesendet,
            gt.sv_termin_dokument_reminder_gesendet_am,
            gt.losfahren_erinnerung_gesendet,
            gt.wunschtermin,
            gt.no_show_gemeldet_am,
            gt.nachbesichtigung_status,
            gt.nachbesichtigung_angefordert_am,
            gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_konfrontation,
            gt.nachbesichtigung_ergebnis,
            gt.nachbesichtigung_kunde_termin_vorschlaege,
            gt.nachbesichtigung_kunde_termin_eingereicht_am,
            gt.nachbesichtigung_sv_konfrontation_gewuenscht,
            gt.nachbesichtigung_sv_termin_vereinbart_am
           FROM public.gutachter_termine gt
          WHERE ((gt.claim_id = c.id) AND (gt.status = ANY (ARRAY['bestaetigt'::text, 'verlegung_pending'::text, 'reserviert'::text, 'durchgefuehrt'::text, 'gegenvorschlag'::text])))
          ORDER BY
                CASE gt.status
                    WHEN 'bestaetigt'::text THEN 1
                    WHEN 'verlegung_pending'::text THEN 2
                    WHEN 'gegenvorschlag'::text THEN 3
                    WHEN 'reserviert'::text THEN 4
                    WHEN 'durchgefuehrt'::text THEN 5
                    ELSE 6
                END, gt.start_zeit DESC NULLS LAST
         LIMIT 1) t ON (true))
     LEFT JOIN LATERAL ( SELECT a.filmcheck_ok,
            a.filmcheck_am,
            a.filmcheck_notizen,
            a.storniert_am,
            a.storno_grund,
            a.storno_durch_user_id,
            a.sv_briefing_text,
            a.sv_briefing_generated_at,
            a.sv_briefing_model,
            a.sv_briefing_version,
            a.sv_briefing_struktur,
            a.sv_notizen_vor_ort,
            a.technische_stellungnahme_status,
            a.technische_stellungnahme_notiz_sv,
            a.technische_stellungnahme_beauftragt_am,
            a.technische_stellungnahme_hochgeladen_am,
            a.technische_stellungnahme_freigabe_am
           FROM public.auftraege a
          WHERE (a.claim_id = c.id)
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON (true))
     LEFT JOIN LATERAL ( SELECT cp.vorname,
            cp.nachname,
            cp.telefon,
            cp.adresse_strasse,
            cp.adresse_plz,
            cp.adresse_ort
           FROM public.claim_parties cp
          WHERE ((cp.claim_id = c.id) AND (cp.rolle = 'geschaedigter'::text))
          ORDER BY cp.created_at, cp.id
         LIMIT 1) cp_g ON (true))
     LEFT JOIN public.v_claim_phase vcp ON ((vcp.claim_id = c.id)));


--
-- Name: v_gutachten_werte; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_gutachten_werte AS
 SELECT c.id AS claim_id,
    c.lead_id,
    g.id AS gutachten_id,
    g.sv_id,
    g.status AS gutachten_status,
    g.gutachten_datum,
    g.gutachten_ocr_processed_at,
    g.gutachten_ocr_raw,
    g.gutachten_ocr_error,
    g.gutachten_ocr_manuell_ueberschrieben,
    g.gutachten_fin,
    g.gutachten_kennzeichen,
    g.gutachten_erstzulassung,
    g.gutachten_laufleistung_km,
    g.gutachten_tuv_bis,
    g.gutachten_fahrzeug_typ,
    g.gutachten_farbe,
    g.gutachten_farbcode,
    g.gutachten_kraftstoff,
    g.gutachten_vorschaeden_text,
    g.gutachten_lackmesswert_max_my,
    g.gutachten_karosseriezustand,
    g.gutachten_zeit_ak_std,
    g.gutachten_zeit_kar_std,
    g.gutachten_zeit_lack_std,
    g.gutachten_lohnsatz_ak_eur,
    g.gutachten_lohnsatz_kar_eur,
    g.gutachten_lohnsatz_lack_eur,
    g.gutachten_materialkosten_eur,
    g.gutachten_lackmaterial_eur,
    g.gutachten_verbringung_eur,
    g.gutachten_mietwagen_klasse,
    g.gutachten_mietwagen_tagessatz_eur,
    g.gutachten_nutzungsausfall_tagessatz_eur,
    g.gutachten_sv_honorar_netto,
    g.gutachten_sv_honorar_brutto,
    g.gutachten_kalkulationssystem,
    g.gutachten_seitenzahl,
    g.reparaturkosten_netto,
    g.reparaturkosten_brutto,
    g.minderwert,
    g.restwert,
    g.wiederbeschaffungswert,
    g.wiederbeschaffungsdauer_tage,
    g.nutzungsausfall_tage,
    g.totalschaden
   FROM (public.claims c
     LEFT JOIN public.gutachten g ON ((g.claim_id = c.id)));


--
-- Name: vehicle_ownership_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_ownership_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid NOT NULL,
    user_id uuid,
    halter_label_anon text,
    von date NOT NULL,
    bis date,
    erwerbsart text,
    kilometerstand_bei_uebernahme integer,
    quelle text,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_voh_von_vor_bis CHECK (((bis IS NULL) OR (bis >= von))),
    CONSTRAINT vehicle_ownership_history_erwerbsart_check CHECK (((erwerbsart IS NULL) OR (erwerbsart = ANY (ARRAY['kauf'::text, 'geschenk'::text, 'erbe'::text, 'leasing'::text, 'firmen'::text, 'unbekannt'::text])))),
    CONSTRAINT vehicle_ownership_history_kilometerstand_bei_uebernahme_check CHECK (((kilometerstand_bei_uebernahme IS NULL) OR (kilometerstand_bei_uebernahme >= 0)))
);


--
-- Name: TABLE vehicle_ownership_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vehicle_ownership_history IS 'AAR-773: Halterwechsel-Historie pro Vehicle. Aktiver Halter: Row mit bis IS NULL (per UNIQUE-Index). DSGVO: bei User-Löschung user_id -> NULL und halter_label_anon wird gesetzt.';


--
-- Name: versicherungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.versicherungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    schaden_telefon text,
    schaden_email text,
    hotline_telefon text,
    webseite text,
    adresse text,
    plz text,
    stadt text,
    bafin_nummer text,
    logo_url text,
    ist_aktiv boolean DEFAULT true,
    erstellt_am timestamp with time zone DEFAULT now(),
    aktualisiert_am timestamp with time zone DEFAULT now()
);


--
-- Name: vertraege_unterzeichnet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vertraege_unterzeichnet (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sv_id uuid,
    vorlage_id uuid NOT NULL,
    vorlage_typ text NOT NULL,
    vorlage_version text NOT NULL,
    unterschrift_name text NOT NULL,
    unterschrift_datum timestamp with time zone DEFAULT now() NOT NULL,
    unterschrift_ip text,
    unterschrift_user_agent text,
    pdf_storage_path text,
    email_log_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organisation_id uuid,
    pdf_generiert_am timestamp with time zone,
    CONSTRAINT chk_vertrag_target CHECK (((sv_id IS NOT NULL) OR (organisation_id IS NOT NULL)))
);


--
-- Name: COLUMN vertraege_unterzeichnet.pdf_generiert_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vertraege_unterzeichnet.pdf_generiert_am IS 'AAR-401: Zeitstempel des finalen PDF-Builds (für Re-Gen-Detection).';


--
-- Name: vertragsvorlagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vertragsvorlagen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    typ text NOT NULL,
    version text NOT NULL,
    titel text NOT NULL,
    inhalt_html text NOT NULL,
    pflicht_unterschrift boolean DEFAULT true NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    gueltig_ab timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vertragsvorlagen_typ_check CHECK ((typ = ANY (ARRAY['nutzungsbedingungen'::text, 'kooperationsvertrag_muster'::text, 'sa_kunde'::text, 'akademie_kooperation'::text, 'community_kooperation'::text])))
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    fall_id uuid,
    fall_nr text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    source text DEFAULT 'lexdrive'::text NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    CONSTRAINT webhook_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: werkstaetten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werkstaetten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    adresse_strasse text,
    adresse_plz text,
    adresse_ort text,
    telefon text,
    email text,
    website text,
    partner boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE werkstaetten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.werkstaetten IS 'AAR-822: Werkstätten-Stub. Vorerst manuell gepflegt, später Partner-Verzeichnis.';


--
-- Name: whatsapp_inbound_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_inbound_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    twilio_message_sid text NOT NULL,
    from_phone text NOT NULL,
    to_phone text NOT NULL,
    body text,
    media_urls jsonb,
    num_media integer DEFAULT 0,
    matched_lead_id uuid,
    matched_fall_id uuid,
    matched_termin_id uuid,
    intent text,
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE whatsapp_inbound_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.whatsapp_inbound_messages IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';


--
-- Name: zahlungseingaenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zahlungseingaenge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fall_id uuid NOT NULL,
    zahlungsdatum date NOT NULL,
    gesamtbetrag numeric(10,2) NOT NULL,
    referenz text,
    erfasst_von uuid,
    erstellt_am timestamp with time zone DEFAULT now()
);


--
-- Name: zahlungspositionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zahlungspositionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zahlung_id uuid NOT NULL,
    fall_id uuid NOT NULL,
    "position" text NOT NULL,
    gefordert numeric(10,2) DEFAULT 0 NOT NULL,
    gezahlt numeric(10,2) DEFAULT 0,
    notiz text,
    erstellt_am timestamp with time zone DEFAULT now()
);


--
-- Name: aircall_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_calls ALTER COLUMN id SET DEFAULT nextval('public.aircall_calls_id_seq'::regclass);


--
-- Name: gfa_rate_limit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gfa_rate_limit ALTER COLUMN id SET DEFAULT nextval('public.gfa_rate_limit_id_seq'::regclass);


--
-- Name: matelso_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matelso_calls ALTER COLUMN id SET DEFAULT nextval('public.matelso_calls_id_seq'::regclass);


--
-- Name: support_ticket_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_log ALTER COLUMN id SET DEFAULT nextval('public.support_ticket_log_id_seq'::regclass);


--
-- Name: abrechnung_positionen abrechnung_positionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnung_positionen
    ADD CONSTRAINT abrechnung_positionen_pkey PRIMARY KEY (id);


--
-- Name: abrechnung_reminders abrechnung_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnung_reminders
    ADD CONSTRAINT abrechnung_reminders_pkey PRIMARY KEY (id);


--
-- Name: abrechnungen abrechnungen_abrechnungs_nr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnungen
    ADD CONSTRAINT abrechnungen_abrechnungs_nr_key UNIQUE (abrechnungs_nr);


--
-- Name: abrechnungen abrechnungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnungen
    ADD CONSTRAINT abrechnungen_pkey PRIMARY KEY (id);


--
-- Name: admin_termine admin_termine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_termine
    ADD CONSTRAINT admin_termine_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_log ai_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_pkey PRIMARY KEY (id);


--
-- Name: aircall_calls aircall_calls_aircall_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_calls
    ADD CONSTRAINT aircall_calls_aircall_id_key UNIQUE (aircall_id);


--
-- Name: aircall_calls aircall_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_calls
    ADD CONSTRAINT aircall_calls_pkey PRIMARY KEY (id);


--
-- Name: aircall_relay_seats aircall_relay_seats_aircall_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_relay_seats
    ADD CONSTRAINT aircall_relay_seats_aircall_user_id_key UNIQUE (aircall_user_id);


--
-- Name: aircall_relay_seats aircall_relay_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_relay_seats
    ADD CONSTRAINT aircall_relay_seats_pkey PRIMARY KEY (id);


--
-- Name: airdrop_invitations airdrop_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_pkey PRIMARY KEY (id);


--
-- Name: airdrop_invitations airdrop_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: anfragen anfragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anfragen
    ADD CONSTRAINT anfragen_pkey PRIMARY KEY (id);


--
-- Name: anruf_log anruf_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anruf_log
    ADD CONSTRAINT anruf_log_pkey PRIMARY KEY (id);


--
-- Name: auftraege auftraege_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auftraege
    ADD CONSTRAINT auftraege_pkey PRIMARY KEY (id);


--
-- Name: auth_remember_tokens auth_remember_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_remember_tokens
    ADD CONSTRAINT auth_remember_tokens_pkey PRIMARY KEY (id);


--
-- Name: benachrichtigungen benachrichtigungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.benachrichtigungen
    ADD CONSTRAINT benachrichtigungen_pkey PRIMARY KEY (id);


--
-- Name: bkat_tatbestaende bkat_tatbestaende_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bkat_tatbestaende
    ADD CONSTRAINT bkat_tatbestaende_pkey PRIMARY KEY (tbnr);


--
-- Name: branchen_benchmarks branchen_benchmarks_metrik_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branchen_benchmarks
    ADD CONSTRAINT branchen_benchmarks_metrik_key UNIQUE (metrik);


--
-- Name: branchen_benchmarks branchen_benchmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branchen_benchmarks
    ADD CONSTRAINT branchen_benchmarks_pkey PRIMARY KEY (id);


--
-- Name: call_copilot_suggestions call_copilot_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_copilot_suggestions
    ADD CONSTRAINT call_copilot_suggestions_pkey PRIMARY KEY (id);


--
-- Name: call_transcription_utterances call_transcription_utterances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transcription_utterances
    ADD CONSTRAINT call_transcription_utterances_pkey PRIMARY KEY (id);


--
-- Name: calls calls_aircall_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_aircall_call_id_key UNIQUE (aircall_call_id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: claim_mietwagen claim_mietwagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_mietwagen
    ADD CONSTRAINT claim_mietwagen_pkey PRIMARY KEY (id);


--
-- Name: claim_parties claim_parties_airdrop_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_airdrop_token_key UNIQUE (airdrop_token);


--
-- Name: claim_parties claim_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_pkey PRIMARY KEY (id);


--
-- Name: claim_payments claim_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_payments
    ADD CONSTRAINT claim_payments_pkey PRIMARY KEY (id);


--
-- Name: claim_recency claim_recency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_recency
    ADD CONSTRAINT claim_recency_pkey PRIMARY KEY (claim_id);


--
-- Name: claim_vehicle_involvements claim_vehicle_involvements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_vehicle_involvements
    ADD CONSTRAINT claim_vehicle_involvements_pkey PRIMARY KEY (id);


--
-- Name: claims claims_claim_nummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_claim_nummer_key UNIQUE (claim_nummer);


--
-- Name: claims claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_pkey PRIMARY KEY (id);


--
-- Name: communities communities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_pkey PRIMARY KEY (id);


--
-- Name: community_leaderboard community_leaderboard_organisation_id_sv_id_zeitraum_monat__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_leaderboard
    ADD CONSTRAINT community_leaderboard_organisation_id_sv_id_zeitraum_monat__key UNIQUE (organisation_id, sv_id, zeitraum_monat, zeitraum_jahr);


--
-- Name: community_leaderboard community_leaderboard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_leaderboard
    ADD CONSTRAINT community_leaderboard_pkey PRIMARY KEY (id);


--
-- Name: community_memberships community_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_pkey PRIMARY KEY (community_id, profile_id);


--
-- Name: consent_records consent_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_records
    ADD CONSTRAINT consent_records_pkey PRIMARY KEY (id);


--
-- Name: content_translations content_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_translations
    ADD CONSTRAINT content_translations_pkey PRIMARY KEY (id);


--
-- Name: content_translations content_translations_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_translations
    ADD CONSTRAINT content_translations_unique UNIQUE (source_hash, target_locale);


--
-- Name: conversion_events conversion_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversion_events
    ADD CONSTRAINT conversion_events_pkey PRIMARY KEY (id);


--
-- Name: cron_jobs_audit cron_jobs_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_jobs_audit
    ADD CONSTRAINT cron_jobs_audit_pkey PRIMARY KEY (id);


--
-- Name: dokument_katalog dokument_katalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_katalog
    ADD CONSTRAINT dokument_katalog_pkey PRIMARY KEY (slot_id);


--
-- Name: dokument_upload_anfragen dokument_upload_anfragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_upload_anfragen
    ADD CONSTRAINT dokument_upload_anfragen_pkey PRIMARY KEY (id);


--
-- Name: dokument_upload_anfragen dokument_upload_anfragen_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_upload_anfragen
    ADD CONSTRAINT dokument_upload_anfragen_token_key UNIQUE (token);


--
-- Name: dsgvo_loeschauftraege dsgvo_loeschauftraege_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsgvo_loeschauftraege
    ADD CONSTRAINT dsgvo_loeschauftraege_pkey PRIMARY KEY (id);


--
-- Name: email_log email_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);


--
-- Name: email_otp_codes email_otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_otp_codes
    ADD CONSTRAINT email_otp_codes_pkey PRIMARY KEY (id);


--
-- Name: embed_abrechnung_positionen embed_abrechnung_positionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_abrechnung_positionen
    ADD CONSTRAINT embed_abrechnung_positionen_pkey PRIMARY KEY (id);


--
-- Name: embed_sites embed_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sites
    ADD CONSTRAINT embed_sites_pkey PRIMARY KEY (id);


--
-- Name: embed_sites embed_sites_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sites
    ADD CONSTRAINT embed_sites_slug_key UNIQUE (slug);


--
-- Name: faelle faelle_mandatsnummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_mandatsnummer_key UNIQUE (mandatsnummer);


--
-- Name: faelle faelle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_pkey PRIMARY KEY (id);


--
-- Name: fall_dokumente fall_dokumente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_dokumente
    ADD CONSTRAINT fall_dokumente_pkey PRIMARY KEY (id);


--
-- Name: fall_read_state fall_read_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_read_state
    ADD CONSTRAINT fall_read_state_pkey PRIMARY KEY (user_id, fall_id);


--
-- Name: fall_summaries fall_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_summaries
    ADD CONSTRAINT fall_summaries_pkey PRIMARY KEY (id);


--
-- Name: finance_eintraege finance_eintraege_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_eintraege
    ADD CONSTRAINT finance_eintraege_pkey PRIMARY KEY (id);


--
-- Name: finance_monatsberichte finance_monatsberichte_monat_jahr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_monatsberichte
    ADD CONSTRAINT finance_monatsberichte_monat_jahr_key UNIQUE (monat, jahr);


--
-- Name: finance_monatsberichte finance_monatsberichte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_monatsberichte
    ADD CONSTRAINT finance_monatsberichte_pkey PRIMARY KEY (id);


--
-- Name: flow_links flow_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_links
    ADD CONSTRAINT flow_links_pkey PRIMARY KEY (id);


--
-- Name: flow_links flow_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_links
    ADD CONSTRAINT flow_links_token_key UNIQUE (token);


--
-- Name: forderungspositionen forderungspositionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forderungspositionen
    ADD CONSTRAINT forderungspositionen_pkey PRIMARY KEY (id);


--
-- Name: gebiet_exklusivitaeten gebiet_exklusivitaeten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebiet_exklusivitaeten
    ADD CONSTRAINT gebiet_exklusivitaeten_pkey PRIMARY KEY (id);


--
-- Name: gfa_rate_limit gfa_rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gfa_rate_limit
    ADD CONSTRAINT gfa_rate_limit_pkey PRIMARY KEY (id);


--
-- Name: gutachter_finder_anfragen gfa_slot_exclusion; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gfa_slot_exclusion EXCLUDE USING gist (reservierter_sv_id WITH =, tstzrange(reservierter_slot_von, reservierter_slot_bis) WITH &&) WHERE (((reservierter_sv_id IS NOT NULL) AND (reservierter_slot_von IS NOT NULL) AND (reservierter_slot_bis IS NOT NULL) AND (status <> ALL (ARRAY['abgeschlossen'::text, 'storniert'::text, 'entwurf'::text]))));


--
-- Name: google_bewertungen_cache google_bewertungen_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_bewertungen_cache
    ADD CONSTRAINT google_bewertungen_cache_pkey PRIMARY KEY (id);


--
-- Name: google_bewertungen_cache google_bewertungen_cache_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_bewertungen_cache
    ADD CONSTRAINT google_bewertungen_cache_profile_id_key UNIQUE (profile_id);


--
-- Name: gutachten gutachten_auftragsnummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_auftragsnummer_key UNIQUE (auftragsnummer);


--
-- Name: gutachten gutachten_claim_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_claim_id_unique UNIQUE (claim_id);


--
-- Name: gutachten_fotos gutachten_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_fotos
    ADD CONSTRAINT gutachten_fotos_pkey PRIMARY KEY (id);


--
-- Name: gutachten gutachten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_pkey PRIMARY KEY (id);


--
-- Name: gutachten_positionen gutachten_positionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_positionen
    ADD CONSTRAINT gutachten_positionen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_abrechnungen gutachter_abrechnungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_abrechnungen
    ADD CONSTRAINT gutachter_abrechnungen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_abrechnungspositionen gutachter_abrechnungspositionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_abrechnungspositionen
    ADD CONSTRAINT gutachter_abrechnungspositionen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_einzahlungen gutachter_einzahlungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_einzahlungen
    ADD CONSTRAINT gutachter_einzahlungen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_mitteilungen gutachter_mitteilungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_mitteilungen
    ADD CONSTRAINT gutachter_mitteilungen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_monatsabrechnungen gutachter_monatsabrechnungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_monatsabrechnungen
    ADD CONSTRAINT gutachter_monatsabrechnungen_pkey PRIMARY KEY (id);


--
-- Name: gutachter_termine gutachter_termine_kunden_tracking_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_kunden_tracking_token_key UNIQUE (kunden_tracking_token);


--
-- Name: gutachter_termine gutachter_termine_no_sv_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_no_sv_overlap EXCLUDE USING gist (sv_id WITH =, tstzrange(start_zeit, end_zeit) WITH &&) WHERE ((status = ANY (ARRAY['bestaetigt'::text, 'reserviert'::text, 'verlegt'::text, 'verlegung_pending'::text])));


--
-- Name: CONSTRAINT gutachter_termine_no_sv_overlap ON gutachter_termine; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT gutachter_termine_no_sv_overlap ON public.gutachter_termine IS 'AAR-864/865: Verhindert Doppelbuchung pro SV. Greift nur für blockierende Status; abgesagte/storniere/abgelehnte Slots dürfen sich überlappen.';


--
-- Name: gutachter_termine gutachter_termine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_pkey PRIMARY KEY (id);


--
-- Name: gutachter_waitlist gutachter_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_waitlist
    ADD CONSTRAINT gutachter_waitlist_pkey PRIMARY KEY (id);


--
-- Name: gutschriften gutschriften_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutschriften
    ADD CONSTRAINT gutschriften_pkey PRIMARY KEY (id);


--
-- Name: incentive_auszahlungen incentive_auszahlungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incentive_auszahlungen
    ADD CONSTRAINT incentive_auszahlungen_pkey PRIMARY KEY (id);


--
-- Name: incentives incentives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incentives
    ADD CONSTRAINT incentives_pkey PRIMARY KEY (id);


--
-- Name: individuelle_anfragen individuelle_anfragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individuelle_anfragen
    ADD CONSTRAINT individuelle_anfragen_pkey PRIMARY KEY (id);


--
-- Name: kanzlei_abrechnung_positionen kanzlei_abrechnung_positionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnung_positionen
    ADD CONSTRAINT kanzlei_abrechnung_positionen_pkey PRIMARY KEY (id);


--
-- Name: kanzlei_abrechnung_reminders kanzlei_abrechnung_reminders_kanzlei_abrechnung_id_reminder_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnung_reminders
    ADD CONSTRAINT kanzlei_abrechnung_reminders_kanzlei_abrechnung_id_reminder_key UNIQUE (kanzlei_abrechnung_id, reminder_typ);


--
-- Name: kanzlei_abrechnung_reminders kanzlei_abrechnung_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnung_reminders
    ADD CONSTRAINT kanzlei_abrechnung_reminders_pkey PRIMARY KEY (id);


--
-- Name: kanzlei_abrechnungen kanzlei_abrechnungen_kanzlei_id_abrechnungsmonat_abrechnung_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnungen
    ADD CONSTRAINT kanzlei_abrechnungen_kanzlei_id_abrechnungsmonat_abrechnung_key UNIQUE (kanzlei_id, abrechnungsmonat, abrechnungsjahr);


--
-- Name: kanzlei_abrechnungen kanzlei_abrechnungen_magic_link_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnungen
    ADD CONSTRAINT kanzlei_abrechnungen_magic_link_token_key UNIQUE (magic_link_token);


--
-- Name: kanzlei_abrechnungen kanzlei_abrechnungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnungen
    ADD CONSTRAINT kanzlei_abrechnungen_pkey PRIMARY KEY (id);


--
-- Name: kanzlei_abrechnungen kanzlei_abrechnungen_rechnungsnummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnungen
    ADD CONSTRAINT kanzlei_abrechnungen_rechnungsnummer_key UNIQUE (rechnungsnummer);


--
-- Name: kanzlei_admin_termine kanzlei_admin_termine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_admin_termine
    ADD CONSTRAINT kanzlei_admin_termine_pkey PRIMARY KEY (id);


--
-- Name: kanzlei_faelle kanzlei_faelle_claim_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_faelle
    ADD CONSTRAINT kanzlei_faelle_claim_id_unique UNIQUE (claim_id);


--
-- Name: CONSTRAINT kanzlei_faelle_claim_id_unique ON kanzlei_faelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT kanzlei_faelle_claim_id_unique ON public.kanzlei_faelle IS 'Genau ein Kanzleifall pro Claim — der Regulierungsvorgang gehoert dem ganzen Schadensvorgang, nicht einer einzelnen Akte.';


--
-- Name: kanzlei_faelle kanzlei_faelle_fall_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_faelle
    ADD CONSTRAINT kanzlei_faelle_fall_id_key UNIQUE (fall_id);


--
-- Name: kanzlei_faelle kanzlei_faelle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_faelle
    ADD CONSTRAINT kanzlei_faelle_pkey PRIMARY KEY (id);


--
-- Name: kanzlei_pakete kanzlei_pakete_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_pakete
    ADD CONSTRAINT kanzlei_pakete_pkey PRIMARY KEY (id);


--
-- Name: kanzleien kanzleien_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzleien
    ADD CONSTRAINT kanzleien_pkey PRIMARY KEY (id);


--
-- Name: ki_gespraeche ki_gespraeche_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ki_gespraeche
    ADD CONSTRAINT ki_gespraeche_pkey PRIMARY KEY (id);


--
-- Name: kunde_gutachten_requests kunde_gutachten_requests_magic_link_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_gutachten_requests
    ADD CONSTRAINT kunde_gutachten_requests_magic_link_token_key UNIQUE (magic_link_token);


--
-- Name: kunde_gutachten_requests kunde_gutachten_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_gutachten_requests
    ADD CONSTRAINT kunde_gutachten_requests_pkey PRIMARY KEY (id);


--
-- Name: kunde_live_position kunde_live_position_kunde_id_termin_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_live_position
    ADD CONSTRAINT kunde_live_position_kunde_id_termin_id_key UNIQUE (kunde_id, termin_id);


--
-- Name: kunde_live_position kunde_live_position_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_live_position
    ADD CONSTRAINT kunde_live_position_pkey PRIMARY KEY (id);


--
-- Name: kunde_live_position kunde_live_position_termin_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_live_position
    ADD CONSTRAINT kunde_live_position_termin_id_key UNIQUE (termin_id);


--
-- Name: lead_historie lead_historie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_historie
    ADD CONSTRAINT lead_historie_pkey PRIMARY KEY (id);


--
-- Name: leadpreise_tabelle leadpreise_tabelle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadpreise_tabelle
    ADD CONSTRAINT leadpreise_tabelle_pkey PRIMARY KEY (id);


--
-- Name: leads leads_lead_nummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_lead_nummer_key UNIQUE (lead_nummer);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leads leads_zb1_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_zb1_token_key UNIQUE (zb1_token);


--
-- Name: makler makler_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler
    ADD CONSTRAINT makler_email_key UNIQUE (email);


--
-- Name: makler_fall_consent makler_fall_consent_fall_id_makler_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_fall_consent
    ADD CONSTRAINT makler_fall_consent_fall_id_makler_id_key UNIQUE (fall_id, makler_id);


--
-- Name: makler_fall_consent makler_fall_consent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_fall_consent
    ADD CONSTRAINT makler_fall_consent_pkey PRIMARY KEY (id);


--
-- Name: makler makler_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler
    ADD CONSTRAINT makler_pkey PRIMARY KEY (id);


--
-- Name: makler_provisionen makler_provisionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_provisionen
    ADD CONSTRAINT makler_provisionen_pkey PRIMARY KEY (id);


--
-- Name: matelso_calls matelso_calls_external_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matelso_calls
    ADD CONSTRAINT matelso_calls_external_call_id_key UNIQUE (external_call_id);


--
-- Name: matelso_calls matelso_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matelso_calls
    ADD CONSTRAINT matelso_calls_pkey PRIMARY KEY (id);


--
-- Name: mitarbeiter_performance mitarbeiter_performance_mitarbeiter_id_monat_jahr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitarbeiter_performance
    ADD CONSTRAINT mitarbeiter_performance_mitarbeiter_id_monat_jahr_key UNIQUE (mitarbeiter_id, monat, jahr);


--
-- Name: mitarbeiter_performance mitarbeiter_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitarbeiter_performance
    ADD CONSTRAINT mitarbeiter_performance_pkey PRIMARY KEY (id);


--
-- Name: mitteilungen mitteilungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitteilungen
    ADD CONSTRAINT mitteilungen_pkey PRIMARY KEY (id);


--
-- Name: nachrichten nachrichten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nachrichten
    ADD CONSTRAINT nachrichten_pkey PRIMARY KEY (id);


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: notification_events notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: ocr_runs ocr_runs_gutachten_id_run_nummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_runs
    ADD CONSTRAINT ocr_runs_gutachten_id_run_nummer_key UNIQUE (gutachten_id, run_nummer);


--
-- Name: ocr_runs ocr_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_runs
    ADD CONSTRAINT ocr_runs_pkey PRIMARY KEY (id);


--
-- Name: onboarding_felder onboarding_felder_phase_feldkey_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_felder
    ADD CONSTRAINT onboarding_felder_phase_feldkey_uq UNIQUE (phase_id, feld_key);


--
-- Name: onboarding_felder onboarding_felder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_felder
    ADD CONSTRAINT onboarding_felder_pkey PRIMARY KEY (id);


--
-- Name: onboarding_phasen onboarding_phasen_flow_phasekey_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_phasen
    ADD CONSTRAINT onboarding_phasen_flow_phasekey_uq UNIQUE (flow_key, phase_key);


--
-- Name: onboarding_phasen onboarding_phasen_flow_reihenfolge_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_phasen
    ADD CONSTRAINT onboarding_phasen_flow_reihenfolge_uq UNIQUE (flow_key, reihenfolge);


--
-- Name: onboarding_phasen onboarding_phasen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_phasen
    ADD CONSTRAINT onboarding_phasen_pkey PRIMARY KEY (id);


--
-- Name: organisationen organisationen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisationen
    ADD CONSTRAINT organisationen_pkey PRIMARY KEY (id);


--
-- Name: paket_upgrades paket_upgrades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paket_upgrades
    ADD CONSTRAINT paket_upgrades_pkey PRIMARY KEY (id);


--
-- Name: parteien parteien_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parteien
    ADD CONSTRAINT parteien_pkey PRIMARY KEY (id);


--
-- Name: personenschaden_personen personenschaden_personen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personenschaden_personen
    ADD CONSTRAINT personenschaden_personen_pkey PRIMARY KEY (id);


--
-- Name: pflichtdokumente pflichtdokumente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pflichtdokumente
    ADD CONSTRAINT pflichtdokumente_pkey PRIMARY KEY (id);


--
-- Name: phase_transitions phase_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase_transitions
    ADD CONSTRAINT phase_transitions_pkey PRIMARY KEY (id);


--
-- Name: plz_geo plz_geo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plz_geo
    ADD CONSTRAINT plz_geo_pkey PRIMARY KEY (plz);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: promo_clicks promo_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_clicks
    ADD CONSTRAINT promo_clicks_pkey PRIMARY KEY (id);


--
-- Name: promotion_codes promotion_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_codes
    ADD CONSTRAINT promotion_codes_code_key UNIQUE (code);


--
-- Name: promotion_codes promotion_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_codes
    ADD CONSTRAINT promotion_codes_pkey PRIMARY KEY (id);


--
-- Name: provisionen_maik provisionen_maik_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provisionen_maik
    ADD CONSTRAINT provisionen_maik_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: qc_checkliste qc_checkliste_fall_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checkliste
    ADD CONSTRAINT qc_checkliste_fall_id_key UNIQUE (fall_id);


--
-- Name: qc_checkliste qc_checkliste_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checkliste
    ADD CONSTRAINT qc_checkliste_pkey PRIMARY KEY (id);


--
-- Name: rechnungs_konfiguration rechnungs_konfiguration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rechnungs_konfiguration
    ADD CONSTRAINT rechnungs_konfiguration_pkey PRIMARY KEY (id);


--
-- Name: rechnungs_nr_counter rechnungs_nr_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rechnungs_nr_counter
    ADD CONSTRAINT rechnungs_nr_counter_pkey PRIMARY KEY (serie, jahr);


--
-- Name: regulierungs_klassifizierung regulierungs_klassifizierung_fall_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulierungs_klassifizierung
    ADD CONSTRAINT regulierungs_klassifizierung_fall_id_key UNIQUE (fall_id);


--
-- Name: regulierungs_klassifizierung regulierungs_klassifizierung_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulierungs_klassifizierung
    ADD CONSTRAINT regulierungs_klassifizierung_pkey PRIMARY KEY (id);


--
-- Name: reklamationen reklamationen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reklamationen
    ADD CONSTRAINT reklamationen_pkey PRIMARY KEY (id);


--
-- Name: repairs repairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repairs
    ADD CONSTRAINT repairs_pkey PRIMARY KEY (id);


--
-- Name: routing_cache routing_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_cache
    ADD CONSTRAINT routing_cache_pkey PRIMARY KEY (von_hash, nach_hash);


--
-- Name: sachverstaendige sachverstaendige_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sachverstaendige
    ADD CONSTRAINT sachverstaendige_pkey PRIMARY KEY (id);


--
-- Name: schadenspositionen schadenspositionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schadenspositionen
    ADD CONSTRAINT schadenspositionen_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: sla_tracking sla_tracking_fall_id_sla_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_tracking
    ADD CONSTRAINT sla_tracking_fall_id_sla_typ_key UNIQUE (fall_id, sla_typ);


--
-- Name: sla_tracking sla_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_tracking
    ADD CONSTRAINT sla_tracking_pkey PRIMARY KEY (id);


--
-- Name: stripe_events stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_events
    ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);


--
-- Name: stripe_events stripe_events_stripe_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_events
    ADD CONSTRAINT stripe_events_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: support_rate_limits support_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_rate_limits
    ADD CONSTRAINT support_rate_limits_pkey PRIMARY KEY (user_id, hour_bucket);


--
-- Name: support_ticket_log support_ticket_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_log
    ADD CONSTRAINT support_ticket_log_pkey PRIMARY KEY (id);


--
-- Name: sv_buero_memberships sv_buero_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_buero_memberships
    ADD CONSTRAINT sv_buero_memberships_pkey PRIMARY KEY (id);


--
-- Name: sv_buero_memberships sv_buero_memberships_sv_id_buero_id_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_buero_memberships
    ADD CONSTRAINT sv_buero_memberships_sv_id_buero_id_start_date_key UNIQUE (sv_id, buero_id, start_date);


--
-- Name: sv_buero sv_buero_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_buero
    ADD CONSTRAINT sv_buero_pkey PRIMARY KEY (id);


--
-- Name: sv_community sv_community_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_community
    ADD CONSTRAINT sv_community_pkey PRIMARY KEY (id);


--
-- Name: sv_kalender_events_cache sv_kalender_events_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_events_cache
    ADD CONSTRAINT sv_kalender_events_cache_pkey PRIMARY KEY (id);


--
-- Name: sv_kalender_events_cache sv_kalender_events_cache_sv_id_source_external_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_events_cache
    ADD CONSTRAINT sv_kalender_events_cache_sv_id_source_external_event_id_key UNIQUE (sv_id, source, external_event_id);


--
-- Name: sv_kalender_verbindungen sv_kalender_verbindungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_verbindungen
    ADD CONSTRAINT sv_kalender_verbindungen_pkey PRIMARY KEY (id);


--
-- Name: sv_kalender_verbindungen sv_kalender_verbindungen_sv_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_verbindungen
    ADD CONSTRAINT sv_kalender_verbindungen_sv_id_provider_key UNIQUE (sv_id, provider);


--
-- Name: sv_leads sv_leads_dat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_leads
    ADD CONSTRAINT sv_leads_dat_id_key UNIQUE (dat_id);


--
-- Name: sv_leads sv_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_leads
    ADD CONSTRAINT sv_leads_pkey PRIMARY KEY (id);


--
-- Name: sv_live_location sv_live_location_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_live_location
    ADD CONSTRAINT sv_live_location_pkey PRIMARY KEY (sv_id);


--
-- Name: sv_live_position sv_live_position_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_live_position
    ADD CONSTRAINT sv_live_position_pkey PRIMARY KEY (id);


--
-- Name: sv_onboarding_rechnungen sv_onboarding_rechnungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_onboarding_rechnungen
    ADD CONSTRAINT sv_onboarding_rechnungen_pkey PRIMARY KEY (id);


--
-- Name: sv_onboarding_rechnungen sv_onboarding_rechnungen_rechnungs_nr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_onboarding_rechnungen
    ADD CONSTRAINT sv_onboarding_rechnungen_rechnungs_nr_key UNIQUE (rechnungs_nr);


--
-- Name: sv_organisation_laeufer_reports sv_organisation_laeufer_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_laeufer_reports
    ADD CONSTRAINT sv_organisation_laeufer_reports_pkey PRIMARY KEY (id);


--
-- Name: sv_organisation_memberships sv_organisation_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_memberships
    ADD CONSTRAINT sv_organisation_memberships_pkey PRIMARY KEY (id);


--
-- Name: sv_organisation_memberships sv_organisation_memberships_user_id_organisation_id_start_d_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_memberships
    ADD CONSTRAINT sv_organisation_memberships_user_id_organisation_id_start_d_key UNIQUE (user_id, organisation_id, start_date);


--
-- Name: sv_organisation sv_organisation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation
    ADD CONSTRAINT sv_organisation_pkey PRIMARY KEY (id);


--
-- Name: sv_payment_reminders sv_payment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_payment_reminders
    ADD CONSTRAINT sv_payment_reminders_pkey PRIMARY KEY (id);


--
-- Name: sv_private_stops sv_private_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_private_stops
    ADD CONSTRAINT sv_private_stops_pkey PRIMARY KEY (id);


--
-- Name: sv_tages_session sv_tages_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_tages_session
    ADD CONSTRAINT sv_tages_session_pkey PRIMARY KEY (id);


--
-- Name: sv_tages_session sv_tages_session_sv_id_datum_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_tages_session
    ADD CONSTRAINT sv_tages_session_sv_id_datum_key UNIQUE (sv_id, datum);


--
-- Name: task_reminders task_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_pkey PRIMARY KEY (id);


--
-- Name: task_reminders task_reminders_task_id_reminder_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_task_id_reminder_typ_key UNIQUE (task_id, reminder_typ);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: technische_probleme technische_probleme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technische_probleme
    ADD CONSTRAINT technische_probleme_pkey PRIMARY KEY (id);


--
-- Name: termin_reminders termin_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termin_reminders
    ADD CONSTRAINT termin_reminders_pkey PRIMARY KEY (id);


--
-- Name: termin_reminders termin_reminders_termin_id_reminder_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termin_reminders
    ADD CONSTRAINT termin_reminders_termin_id_reminder_typ_key UNIQUE (termin_id, reminder_typ);


--
-- Name: termine termine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termine
    ADD CONSTRAINT termine_pkey PRIMARY KEY (id);


--
-- Name: timeline timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline
    ADD CONSTRAINT timeline_pkey PRIMARY KEY (id);


--
-- Name: claim_vehicle_involvements uniq_claim_vehicle; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_vehicle_involvements
    ADD CONSTRAINT uniq_claim_vehicle UNIQUE (claim_id, vehicle_id);


--
-- Name: gutachten_positionen uq_gutachten_position_nr; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_positionen
    ADD CONSTRAINT uq_gutachten_position_nr UNIQUE (gutachten_id, position_nr);


--
-- Name: vehicle_ownership_history vehicle_ownership_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_ownership_history
    ADD CONSTRAINT vehicle_ownership_history_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_fin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_fin_key UNIQUE (fin);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: versicherungen versicherungen_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versicherungen
    ADD CONSTRAINT versicherungen_name_key UNIQUE (name);


--
-- Name: versicherungen versicherungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versicherungen
    ADD CONSTRAINT versicherungen_pkey PRIMARY KEY (id);


--
-- Name: vertraege_unterzeichnet vertraege_unterzeichnet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vertraege_unterzeichnet
    ADD CONSTRAINT vertraege_unterzeichnet_pkey PRIMARY KEY (id);


--
-- Name: vertragsvorlagen vertragsvorlagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vertragsvorlagen
    ADD CONSTRAINT vertragsvorlagen_pkey PRIMARY KEY (id);


--
-- Name: vs_korrespondenz vs_korrespondenz_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vs_korrespondenz
    ADD CONSTRAINT vs_korrespondenz_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: werkstaetten werkstaetten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkstaetten
    ADD CONSTRAINT werkstaetten_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_inbound_messages whatsapp_inbound_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbound_messages
    ADD CONSTRAINT whatsapp_inbound_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_inbound_messages whatsapp_inbound_messages_twilio_message_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbound_messages
    ADD CONSTRAINT whatsapp_inbound_messages_twilio_message_sid_key UNIQUE (twilio_message_sid);


--
-- Name: zahlungseingaenge zahlungseingaenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zahlungseingaenge
    ADD CONSTRAINT zahlungseingaenge_pkey PRIMARY KEY (id);


--
-- Name: zahlungspositionen zahlungspositionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zahlungspositionen
    ADD CONSTRAINT zahlungspositionen_pkey PRIMARY KEY (id);


--
-- Name: anfragen_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anfragen_created_at_idx ON public.anfragen USING btree (created_at DESC);


--
-- Name: anfragen_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anfragen_lead_id_idx ON public.anfragen USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: anfragen_quelle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anfragen_quelle_idx ON public.anfragen USING btree (quelle, created_at DESC);


--
-- Name: anfragen_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anfragen_status_idx ON public.anfragen USING btree (konvertier_status) WHERE (konvertier_status <> 'success'::text);


--
-- Name: anfragen_telefon_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anfragen_telefon_idx ON public.anfragen USING btree (kontakt_telefon) WHERE (kontakt_telefon IS NOT NULL);


--
-- Name: anruf_log_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anruf_log_lead_id_idx ON public.anruf_log USING btree (lead_id, zeitpunkt DESC);


--
-- Name: content_translations_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_translations_lookup_idx ON public.content_translations USING btree (source_hash, target_locale);


--
-- Name: dsgvo_loeschauftraege_status_bestaetigt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dsgvo_loeschauftraege_status_bestaetigt_idx ON public.dsgvo_loeschauftraege USING btree (status, bestaetigt_am) WHERE (status = 'bestaetigt'::text);


--
-- Name: dsgvo_loeschauftraege_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dsgvo_loeschauftraege_user_id_idx ON public.dsgvo_loeschauftraege USING btree (user_id);


--
-- Name: email_otp_codes_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_otp_codes_user_created_idx ON public.email_otp_codes USING btree (user_id, created_at DESC);


--
-- Name: email_otp_codes_user_unverified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_otp_codes_user_unverified_idx ON public.email_otp_codes USING btree (user_id, expires_at) WHERE (verifiziert_am IS NULL);


--
-- Name: fall_dokumente_idempotency_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fall_dokumente_idempotency_key_uniq ON public.fall_dokumente USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: gfa_status_erstellt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gfa_status_erstellt_idx ON public.gutachter_finder_anfragen USING btree (status, erstellt_am DESC);


--
-- Name: idx_abrechnung_positionen_abrechnung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abrechnung_positionen_abrechnung_id ON public.abrechnung_positionen USING btree (abrechnung_id);


--
-- Name: idx_abrechnung_positionen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abrechnung_positionen_fall_id ON public.abrechnung_positionen USING btree (fall_id);


--
-- Name: idx_abrechnung_reminders_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_abrechnung_reminders_unique ON public.abrechnung_reminders USING btree (abrechnung_id, reminder_typ);


--
-- Name: idx_abrechnungen_einzug_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abrechnungen_einzug_pending ON public.abrechnungen USING btree (faellig_am) WHERE ((bezahlt_am IS NULL) AND (einzug_versucht_am IS NULL));


--
-- Name: idx_abrechnungen_empfaenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abrechnungen_empfaenger ON public.abrechnungen USING btree (empfaenger_typ, empfaenger_id);


--
-- Name: idx_abrechnungen_faellig; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abrechnungen_faellig ON public.abrechnungen USING btree (faellig_am) WHERE (status = ANY (ARRAY['versendet'::text, 'ueberfaellig'::text]));


--
-- Name: idx_abrechnungen_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abrechnungen_status ON public.abrechnungen USING btree (status);


--
-- Name: idx_admin_termine_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_termine_fall ON public.admin_termine USING btree (fall_id);


--
-- Name: idx_admin_termine_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_termine_lead_id ON public.admin_termine USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_admin_termine_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_termine_start ON public.admin_termine USING btree (start_zeit);


--
-- Name: idx_admin_termine_typ; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_termine_typ ON public.admin_termine USING btree (typ);


--
-- Name: idx_admin_termine_zugewiesen_gesehen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_termine_zugewiesen_gesehen ON public.admin_termine USING btree (zugewiesen_an) WHERE (gesehen_am IS NULL);


--
-- Name: idx_ai_usage_log_created_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_log_created_endpoint ON public.ai_usage_log USING btree (created_at DESC, endpoint);


--
-- Name: idx_ai_usage_log_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_log_fall ON public.ai_usage_log USING btree (fall_id) WHERE (fall_id IS NOT NULL);


--
-- Name: idx_aircall_calls_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aircall_calls_fall_id ON public.aircall_calls USING btree (fall_id);


--
-- Name: idx_aircall_calls_from_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aircall_calls_from_number ON public.aircall_calls USING btree (from_number);


--
-- Name: idx_aircall_calls_initiated_by_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aircall_calls_initiated_by_profile_id ON public.aircall_calls USING btree (initiated_by_profile_id);


--
-- Name: idx_aircall_calls_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aircall_calls_lead_id ON public.aircall_calls USING btree (lead_id);


--
-- Name: idx_aircall_calls_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aircall_calls_started_at ON public.aircall_calls USING btree (started_at DESC);


--
-- Name: idx_aircall_relay_seats_belegt_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aircall_relay_seats_belegt_call_id ON public.aircall_relay_seats USING btree (belegt_call_id);


--
-- Name: idx_airdrop_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_claim ON public.airdrop_invitations USING btree (claim_id);


--
-- Name: idx_airdrop_invitations_invited_by_party_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_invitations_invited_by_party_id ON public.airdrop_invitations USING btree (invited_by_party_id);


--
-- Name: idx_airdrop_invitations_resulting_party_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_invitations_resulting_party_id ON public.airdrop_invitations USING btree (resulting_party_id);


--
-- Name: idx_airdrop_invitations_withdrawn_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_invitations_withdrawn_by_user_id ON public.airdrop_invitations USING btree (withdrawn_by_user_id);


--
-- Name: idx_airdrop_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_invited_by ON public.airdrop_invitations USING btree (invited_by_user_id) WHERE (invited_by_user_id IS NOT NULL);


--
-- Name: idx_airdrop_offen_expired; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_offen_expired ON public.airdrop_invitations USING btree (expires_at) WHERE ((status = ANY (ARRAY['offen'::text, 'geoeffnet'::text])) AND (expires_at IS NOT NULL));


--
-- Name: idx_airdrop_resulting_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_resulting_user ON public.airdrop_invitations USING btree (resulting_user_id) WHERE (resulting_user_id IS NOT NULL);


--
-- Name: idx_airdrop_token_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_token_prefix ON public.airdrop_invitations USING btree (token_lookup_prefix) WHERE (status = ANY (ARRAY['offen'::text, 'geoeffnet'::text]));


--
-- Name: idx_anruf_log_erstellt_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anruf_log_erstellt_von ON public.anruf_log USING btree (erstellt_von);


--
-- Name: idx_auftraege_claim_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auftraege_claim_id ON public.auftraege USING btree (claim_id);


--
-- Name: idx_auftraege_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auftraege_fall ON public.auftraege USING btree (fall_id);


--
-- Name: idx_auftraege_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auftraege_status ON public.auftraege USING btree (status) WHERE (status <> 'abgeschlossen'::text);


--
-- Name: idx_auftraege_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auftraege_sv ON public.auftraege USING btree (sv_id);


--
-- Name: idx_auftraege_vorheriger_auftrag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auftraege_vorheriger_auftrag_id ON public.auftraege USING btree (vorheriger_auftrag_id);


--
-- Name: idx_auftraege_zurueckgewiesen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auftraege_zurueckgewiesen ON public.auftraege USING btree (zurueckgewiesen_am) WHERE (zurueckgewiesen_am IS NOT NULL);


--
-- Name: idx_auszahl_incentive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auszahl_incentive ON public.incentive_auszahlungen USING btree (incentive_id);


--
-- Name: idx_auszahl_mitarbeiter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auszahl_mitarbeiter ON public.incentive_auszahlungen USING btree (mitarbeiter_id);


--
-- Name: idx_benachrichtigungen_gelesen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_benachrichtigungen_gelesen ON public.benachrichtigungen USING btree (user_id, gelesen);


--
-- Name: idx_benachrichtigungen_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_benachrichtigungen_user ON public.benachrichtigungen USING btree (user_id);


--
-- Name: idx_benachrichtigungen_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_benachrichtigungen_user_unread ON public.benachrichtigungen USING btree (user_id, gelesen, created_at DESC);


--
-- Name: idx_bkat_paragraph; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bkat_paragraph ON public.bkat_tatbestaende USING btree (vorschrift, paragraph_num);


--
-- Name: idx_bkat_schuldindiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bkat_schuldindiz ON public.bkat_tatbestaende USING btree (schuldindiz);


--
-- Name: idx_bkat_unfallart; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bkat_unfallart ON public.bkat_tatbestaende USING btree (unfallart);


--
-- Name: idx_calls_bridge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_bridge ON public.calls USING btree (((bridge ->> 'typ'::text))) WHERE (bridge IS NOT NULL);


--
-- Name: idx_calls_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_fall ON public.calls USING btree (fall_id);


--
-- Name: idx_calls_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_lead ON public.calls USING btree (lead_id);


--
-- Name: idx_claim_mietwagen_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_mietwagen_created_by_user_id ON public.claim_mietwagen USING btree (created_by_user_id);


--
-- Name: idx_claim_parties_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_parties_created_by_user_id ON public.claim_parties USING btree (created_by_user_id);


--
-- Name: idx_claim_parties_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_parties_email_lower ON public.claim_parties USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: idx_claim_parties_telefon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_parties_telefon ON public.claim_parties USING btree (telefon) WHERE (telefon IS NOT NULL);


--
-- Name: idx_claim_parties_versicherung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_parties_versicherung_id ON public.claim_parties USING btree (versicherung_id);


--
-- Name: idx_claim_payments_claim_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_payments_claim_id ON public.claim_payments USING btree (claim_id);


--
-- Name: idx_claim_payments_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claim_payments_created_by_user_id ON public.claim_payments USING btree (created_by_user_id);


--
-- Name: idx_claims_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_created_by_user_id ON public.claims USING btree (created_by_user_id);


--
-- Name: idx_claims_endzustand_gesetzt_durch_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_endzustand_gesetzt_durch_user_id ON public.claims USING btree (endzustand_gesetzt_durch_user_id);


--
-- Name: idx_claims_gegner_versicherung; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_gegner_versicherung ON public.claims USING btree (gegner_versicherung_id);


--
-- Name: idx_claims_gegnerisches_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_gegnerisches_vehicle_id ON public.claims USING btree (gegnerisches_vehicle_id);


--
-- Name: idx_claims_geschaedigter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_geschaedigter ON public.claims USING btree (geschaedigter_user_id);


--
-- Name: idx_claims_kundenbetreuer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_kundenbetreuer ON public.claims USING btree (kundenbetreuer_id) WHERE (kundenbetreuer_id IS NOT NULL);


--
-- Name: idx_claims_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_lead_id ON public.claims USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_claims_schadentag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_schadentag ON public.claims USING btree (schadentag DESC);


--
-- Name: idx_claims_status_dispatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_status_dispatch ON public.claims USING btree (status) WHERE (status = 'dispatch_done'::text);


--
-- Name: idx_claims_status_offen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_status_offen ON public.claims USING btree (status) WHERE (status = 'offen'::text);


--
-- Name: idx_claims_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_sv_id ON public.claims USING btree (sv_id);


--
-- Name: idx_claims_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_vehicle ON public.claims USING btree (vehicle_id);


--
-- Name: idx_cm_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cm_claim ON public.claim_mietwagen USING btree (claim_id);


--
-- Name: idx_cm_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cm_status ON public.claim_mietwagen USING btree (status) WHERE (status <> ALL (ARRAY['beendet'::text, 'storniert'::text, 'abgelehnt'::text]));


--
-- Name: idx_communities_erstellt_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communities_erstellt_von ON public.communities USING btree (erstellt_von);


--
-- Name: idx_community_leaderboard_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_leaderboard_sv_id ON public.community_leaderboard USING btree (sv_id);


--
-- Name: idx_community_memberships_community_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_memberships_community_id ON public.community_memberships USING btree (community_id);


--
-- Name: idx_community_memberships_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_memberships_profile_id ON public.community_memberships USING btree (profile_id);


--
-- Name: idx_conversion_events_anfrage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversion_events_anfrage ON public.conversion_events USING btree (anfrage_id) WHERE (anfrage_id IS NOT NULL);


--
-- Name: idx_conversion_events_flow_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversion_events_flow_phase ON public.conversion_events USING btree (flow_key, phase_key, ts DESC);


--
-- Name: idx_conversion_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversion_events_session ON public.conversion_events USING btree (session_id, ts);


--
-- Name: idx_copilot_call; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copilot_call ON public.call_copilot_suggestions USING btree (call_id);


--
-- Name: idx_cp_airdrop_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_airdrop_token ON public.claim_parties USING btree (airdrop_token) WHERE (airdrop_token IS NOT NULL);


--
-- Name: idx_cp_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_claim ON public.claim_parties USING btree (claim_id);


--
-- Name: idx_cp_kennzeichen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_kennzeichen ON public.claim_parties USING btree (kennzeichen) WHERE (kennzeichen IS NOT NULL);


--
-- Name: idx_cp_rolle_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_rolle_aktiv ON public.claim_parties USING btree (claim_id, rolle) WHERE (ist_aktiv = true);


--
-- Name: idx_cp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_status ON public.claim_payments USING btree (status) WHERE (status <> ALL (ARRAY['abgelehnt'::text, 'final'::text]));


--
-- Name: idx_cp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_user ON public.claim_parties USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_cp_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cp_vehicle ON public.claim_parties USING btree (vehicle_id) WHERE (vehicle_id IS NOT NULL);


--
-- Name: idx_cron_audit_job_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_audit_job_started ON public.cron_jobs_audit USING btree (job_name, started_at DESC);


--
-- Name: idx_cron_audit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_audit_status ON public.cron_jobs_audit USING btree (status) WHERE (status = ANY (ARRAY['error'::text, 'timeout'::text, 'running'::text]));


--
-- Name: idx_cvi_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cvi_claim ON public.claim_vehicle_involvements USING btree (claim_id);


--
-- Name: idx_cvi_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cvi_vehicle ON public.claim_vehicle_involvements USING btree (vehicle_id);


--
-- Name: idx_dokument_upload_anfragen_erstellt_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dokument_upload_anfragen_erstellt_von ON public.dokument_upload_anfragen USING btree (erstellt_von);


--
-- Name: idx_dokument_upload_anfragen_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dokument_upload_anfragen_lead ON public.dokument_upload_anfragen USING btree (lead_id, gesendet_am DESC);


--
-- Name: idx_dsgvo_loeschauftraege_bestaetigt_von_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsgvo_loeschauftraege_bestaetigt_von_user_id ON public.dsgvo_loeschauftraege USING btree (bestaetigt_von_user_id);


--
-- Name: idx_email_log_empfaenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_empfaenger ON public.email_log USING btree (empfaenger, created_at DESC);


--
-- Name: idx_email_log_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_fall ON public.email_log USING btree (fall_id);


--
-- Name: idx_email_log_fall_zeit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_fall_zeit ON public.email_log USING btree (fall_id, gesendet_am DESC);


--
-- Name: idx_email_log_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_lead ON public.email_log USING btree (lead_id);


--
-- Name: idx_email_log_provider_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_provider_status ON public.email_log USING btree (provider, status, created_at DESC);


--
-- Name: idx_email_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_status ON public.email_log USING btree (status);


--
-- Name: idx_embed_abr_pos_abrechnung; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embed_abr_pos_abrechnung ON public.embed_abrechnung_positionen USING btree (abrechnung_id);


--
-- Name: idx_embed_abr_pos_anfrage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_embed_abr_pos_anfrage ON public.embed_abrechnung_positionen USING btree (anfrage_id) WHERE (anfrage_id IS NOT NULL);


--
-- Name: idx_embed_abr_pos_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embed_abr_pos_site ON public.embed_abrechnung_positionen USING btree (embed_site_id);


--
-- Name: idx_embed_sites_inhaber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embed_sites_inhaber ON public.embed_sites USING btree (inhaber_profile_id);


--
-- Name: idx_embed_sites_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embed_sites_sv ON public.embed_sites USING btree (sv_id);


--
-- Name: idx_exkl_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exkl_aktiv ON public.gebiet_exklusivitaeten USING btree (organisation_id) WHERE (aktiv_bis IS NULL);


--
-- Name: idx_exkl_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exkl_org ON public.gebiet_exklusivitaeten USING btree (organisation_id);


--
-- Name: idx_faelle_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_claim ON public.faelle USING btree (claim_id);


--
-- Name: idx_faelle_dispatch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_dispatch_id ON public.faelle USING btree (dispatch_id);


--
-- Name: idx_faelle_eskalation_tag_14_ergebnis_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_eskalation_tag_14_ergebnis_von ON public.faelle USING btree (eskalation_tag_14_ergebnis_von);


--
-- Name: idx_faelle_eskalation_tag_21_ergebnis_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_eskalation_tag_21_ergebnis_von ON public.faelle USING btree (eskalation_tag_21_ergebnis_von);


--
-- Name: idx_faelle_eskalation_tag_28_ergebnis_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_eskalation_tag_28_ergebnis_von ON public.faelle USING btree (eskalation_tag_28_ergebnis_von);


--
-- Name: idx_faelle_eskaliert_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_eskaliert_admin ON public.faelle USING btree (eskaliert_an_admin_id) WHERE (eskaliert_an_admin_id IS NOT NULL);


--
-- Name: idx_faelle_ist_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_ist_aktiv ON public.faelle USING btree (ist_aktiv);


--
-- Name: idx_faelle_kanzlei_abrechnung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_kanzlei_abrechnung_id ON public.faelle USING btree (kanzlei_abrechnung_id);


--
-- Name: idx_faelle_kanzlei_provision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_kanzlei_provision ON public.faelle USING btree (kanzlei_provision_status);


--
-- Name: idx_faelle_kennzeichen_kreis_buchst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_kennzeichen_kreis_buchst ON public.faelle USING btree (kennzeichen_kreis, kennzeichen_buchstaben);


--
-- Name: idx_faelle_kunde_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_kunde_id ON public.faelle USING btree (kunde_id);


--
-- Name: idx_faelle_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_lead_id ON public.faelle USING btree (lead_id);


--
-- Name: idx_faelle_makler; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_makler ON public.faelle USING btree (makler_id) WHERE (makler_id IS NOT NULL);


--
-- Name: idx_faelle_organisation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_organisation_id ON public.faelle USING btree (organisation_id) WHERE (organisation_id IS NOT NULL);


--
-- Name: idx_faelle_re_termin_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_re_termin_token ON public.faelle USING btree (re_termin_token) WHERE (re_termin_token IS NOT NULL);


--
-- Name: idx_faelle_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_status ON public.faelle USING btree (status);


--
-- Name: idx_faelle_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faelle_sv ON public.faelle USING btree (sv_id);


--
-- Name: idx_fall_dokumente_abgelehnt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_abgelehnt ON public.fall_dokumente USING btree (abgelehnt_am) WHERE (abgelehnt_am IS NOT NULL);


--
-- Name: idx_fall_dokumente_claim_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_claim_id ON public.fall_dokumente USING btree (claim_id);


--
-- Name: idx_fall_dokumente_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_fall ON public.fall_dokumente USING btree (fall_id) WHERE (geloescht_am IS NULL);


--
-- Name: idx_fall_dokumente_kunde_ungesehen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_kunde_ungesehen ON public.fall_dokumente USING btree (fall_id) WHERE ((uploaded_by_kunde = true) AND (kb_gesehen_am IS NULL) AND (geloescht_am IS NULL));


--
-- Name: idx_fall_dokumente_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_lead ON public.fall_dokumente USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_fall_dokumente_pflicht; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_pflicht ON public.fall_dokumente USING btree (fall_id, ist_pflicht) WHERE (geloescht_am IS NULL);


--
-- Name: idx_fall_dokumente_pflichtdokument_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_pflichtdokument_id ON public.fall_dokumente USING btree (pflichtdokument_id) WHERE (pflichtdokument_id IS NOT NULL);


--
-- Name: idx_fall_dokumente_position_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_dokumente_position_id ON public.fall_dokumente USING btree (position_id);


--
-- Name: idx_fall_read_state_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_read_state_fall_id ON public.fall_read_state USING btree (fall_id);


--
-- Name: idx_fall_read_state_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_read_state_user ON public.fall_read_state USING btree (user_id, fall_id);


--
-- Name: idx_fall_summaries_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_summaries_fall_id ON public.fall_summaries USING btree (fall_id, generated_at DESC);


--
-- Name: idx_fall_summaries_generated_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fall_summaries_generated_by_user_id ON public.fall_summaries USING btree (generated_by_user_id);


--
-- Name: idx_flow_links_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flow_links_fall_id ON public.flow_links USING btree (fall_id);


--
-- Name: idx_flow_links_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flow_links_lead_id ON public.flow_links USING btree (lead_id);


--
-- Name: idx_forderungspositionen_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forderungspositionen_fall ON public.forderungspositionen USING btree (fall_id);


--
-- Name: idx_gf_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gf_claim ON public.gutachten_fotos USING btree (claim_id);


--
-- Name: idx_gf_exif_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gf_exif_pending ON public.gutachten_fotos USING btree (id) WHERE (exif_processed = false);


--
-- Name: idx_gf_gutachten; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gf_gutachten ON public.gutachten_fotos USING btree (gutachten_id);


--
-- Name: idx_gf_quelle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gf_quelle ON public.gutachten_fotos USING btree (upload_quelle);


--
-- Name: idx_gfa_billing_offen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gfa_billing_offen ON public.gutachter_finder_anfragen USING btree (abrechnung_id) WHERE ((abrechnungs_relevant = true) AND (abgerechnet_am IS NULL));


--
-- Name: idx_gfa_embed_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gfa_embed_site ON public.gutachter_finder_anfragen USING btree (embed_site_id) WHERE (embed_site_id IS NOT NULL);


--
-- Name: idx_gfa_rate_limit_ip_hash_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gfa_rate_limit_ip_hash_created_at ON public.gfa_rate_limit USING btree (ip_hash, created_at DESC);


--
-- Name: idx_gfa_slot_ttl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gfa_slot_ttl ON public.gutachter_finder_anfragen USING btree (reservierter_slot_von) WHERE ((reservierter_slot_von IS NOT NULL) AND (status = 'entwurf'::text));


--
-- Name: idx_gfa_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gfa_source ON public.gutachter_finder_anfragen USING btree (source) WHERE (source IS NOT NULL);


--
-- Name: idx_gfa_termin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gfa_termin ON public.gutachter_finder_anfragen USING btree (termin_id) WHERE (termin_id IS NOT NULL);


--
-- Name: idx_gp_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gp_claim ON public.gutachten_positionen USING btree (claim_id);


--
-- Name: idx_gp_gutachten; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gp_gutachten ON public.gutachten_positionen USING btree (gutachten_id);


--
-- Name: idx_gutachten_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_created_by_user_id ON public.gutachten USING btree (created_by_user_id);


--
-- Name: idx_gutachten_fotos_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_fotos_uploaded_by ON public.gutachten_fotos USING btree (uploaded_by);


--
-- Name: idx_gutachten_laeufer_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_laeufer_report_id ON public.gutachten USING btree (laeufer_report_id);


--
-- Name: idx_gutachten_ocr_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_ocr_pending ON public.gutachten USING btree (ocr_status) WHERE (ocr_status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- Name: idx_gutachten_ocr_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_ocr_run_id ON public.gutachten USING btree (ocr_run_id);


--
-- Name: idx_gutachten_pdf_uploaded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_pdf_uploaded ON public.gutachten USING btree (pdf_uploaded_at DESC) WHERE (pdf_uploaded_at IS NOT NULL);


--
-- Name: idx_gutachten_pdf_uploaded_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_pdf_uploaded_by_user_id ON public.gutachten USING btree (pdf_uploaded_by_user_id);


--
-- Name: idx_gutachten_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_status ON public.gutachten USING btree (status) WHERE (status <> 'storniert'::text);


--
-- Name: idx_gutachten_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachten_sv ON public.gutachten USING btree (sv_id);


--
-- Name: idx_gutachter_abrechnungen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_abrechnungen_fall_id ON public.gutachter_abrechnungen USING btree (fall_id);


--
-- Name: idx_gutachter_abrechnungen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_abrechnungen_sv_id ON public.gutachter_abrechnungen USING btree (sv_id);


--
-- Name: idx_gutachter_abrechnungspositionen_abrechnung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_abrechnungspositionen_abrechnung_id ON public.gutachter_abrechnungspositionen USING btree (abrechnung_id);


--
-- Name: idx_gutachter_abrechnungspositionen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_abrechnungspositionen_fall_id ON public.gutachter_abrechnungspositionen USING btree (fall_id);


--
-- Name: idx_gutachter_einzahlungen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_einzahlungen_sv_id ON public.gutachter_einzahlungen USING btree (sv_id);


--
-- Name: idx_gutachter_finder_anfragen_erstellt_am_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_erstellt_am_desc ON public.gutachter_finder_anfragen USING btree (erstellt_am DESC);


--
-- Name: idx_gutachter_finder_anfragen_konvertiert_zu_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_konvertiert_zu_fall_id ON public.gutachter_finder_anfragen USING btree (konvertiert_zu_fall_id);


--
-- Name: idx_gutachter_finder_anfragen_konvertiert_zu_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_konvertiert_zu_lead_id ON public.gutachter_finder_anfragen USING btree (konvertiert_zu_lead_id);


--
-- Name: idx_gutachter_finder_anfragen_konvertiert_zu_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_konvertiert_zu_user_id ON public.gutachter_finder_anfragen USING btree (konvertiert_zu_user_id);


--
-- Name: idx_gutachter_finder_anfragen_whatsapp_geprueft_am; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_whatsapp_geprueft_am ON public.gutachter_finder_anfragen USING btree (whatsapp_geprueft_am) WHERE (whatsapp_geprueft_am IS NOT NULL);


--
-- Name: idx_gutachter_finder_anfragen_zugeordneter_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_zugeordneter_sv_id ON public.gutachter_finder_anfragen USING btree (zugeordneter_sv_id);


--
-- Name: idx_gutachter_finder_anfragen_zugeordneter_sv_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_finder_anfragen_zugeordneter_sv_lead_id ON public.gutachter_finder_anfragen USING btree (zugeordneter_sv_lead_id);


--
-- Name: idx_gutachter_mitteilungen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_mitteilungen_fall_id ON public.gutachter_mitteilungen USING btree (fall_id);


--
-- Name: idx_gutachter_mitteilungen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_mitteilungen_sv_id ON public.gutachter_mitteilungen USING btree (sv_id);


--
-- Name: idx_gutachter_monatsabrechnungen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_monatsabrechnungen_sv_id ON public.gutachter_monatsabrechnungen USING btree (sv_id);


--
-- Name: idx_gutachter_termine_ablehnen_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_ablehnen_token ON public.gutachter_termine USING btree (ablehnen_token) WHERE (ablehnen_token IS NOT NULL);


--
-- Name: idx_gutachter_termine_auftrag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_auftrag ON public.gutachter_termine USING btree (auftrag_id);


--
-- Name: idx_gutachter_termine_besichtigung_gestartet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_besichtigung_gestartet ON public.gutachter_termine USING btree (besichtigung_gestartet_am) WHERE (besichtigung_gestartet_am IS NOT NULL);


--
-- Name: idx_gutachter_termine_claim_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_claim_id ON public.gutachter_termine USING btree (claim_id);


--
-- Name: idx_gutachter_termine_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_fall_id ON public.gutachter_termine USING btree (fall_id);


--
-- Name: idx_gutachter_termine_kunde_response_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_kunde_response_token ON public.gutachter_termine USING btree (kunde_response_token) WHERE (kunde_response_token IS NOT NULL);


--
-- Name: idx_gutachter_termine_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_lead_id ON public.gutachter_termine USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_gutachter_termine_sv_gesehen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_sv_gesehen ON public.gutachter_termine USING btree (sv_id) WHERE (gesehen_am IS NULL);


--
-- Name: idx_gutachter_termine_sv_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_sv_lead_id ON public.gutachter_termine USING btree (sv_lead_id) WHERE (sv_lead_id IS NOT NULL);


--
-- Name: idx_gutachter_termine_verlegung_quelle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_termine_verlegung_quelle ON public.gutachter_termine USING btree (verlegung_quelle_id) WHERE (verlegung_quelle_id IS NOT NULL);


--
-- Name: idx_gutachter_waitlist_bearbeitet_von_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_waitlist_bearbeitet_von_user_id ON public.gutachter_waitlist USING btree (bearbeitet_von_user_id);


--
-- Name: idx_gutachter_waitlist_erstellt_am; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_waitlist_erstellt_am ON public.gutachter_waitlist USING btree (erstellt_am DESC);


--
-- Name: idx_gutachter_waitlist_konvertiert_zu_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_waitlist_konvertiert_zu_sv_id ON public.gutachter_waitlist USING btree (konvertiert_zu_sv_id);


--
-- Name: idx_gutachter_waitlist_plz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_waitlist_plz ON public.gutachter_waitlist USING btree (plz);


--
-- Name: idx_gutachter_waitlist_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutachter_waitlist_status ON public.gutachter_waitlist USING btree (status);


--
-- Name: idx_gutschriften_referenz_abrechnung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutschriften_referenz_abrechnung_id ON public.gutschriften USING btree (referenz_abrechnung_id);


--
-- Name: idx_gutschriften_referenz_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutschriften_referenz_fall_id ON public.gutschriften USING btree (referenz_fall_id);


--
-- Name: idx_gutschriften_sv_offen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gutschriften_sv_offen ON public.gutschriften USING btree (sv_id, status);


--
-- Name: idx_individuelle_anfragen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_individuelle_anfragen_sv_id ON public.individuelle_anfragen USING btree (sv_id);


--
-- Name: idx_kanzlei_abrechnung_positionen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_abrechnung_positionen_fall_id ON public.kanzlei_abrechnung_positionen USING btree (fall_id);


--
-- Name: idx_kanzlei_abrechnungen_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_abrechnungen_status ON public.kanzlei_abrechnungen USING btree (status, faelligkeitsdatum);


--
-- Name: idx_kanzlei_admin_termine_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_admin_termine_admin ON public.kanzlei_admin_termine USING btree (admin_user_id, start_zeit);


--
-- Name: idx_kanzlei_admin_termine_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_admin_termine_fall ON public.kanzlei_admin_termine USING btree (fall_id);


--
-- Name: idx_kanzlei_admin_termine_kanzlei; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_admin_termine_kanzlei ON public.kanzlei_admin_termine USING btree (kanzlei_user_id, start_zeit);


--
-- Name: idx_kanzlei_pakete_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_pakete_claim ON public.kanzlei_pakete USING btree (claim_id);


--
-- Name: idx_kanzlei_pakete_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_pakete_pending ON public.kanzlei_pakete USING btree (status, created_at) WHERE (status = ANY (ARRAY['entwurf'::text, 'fehlgeschlagen'::text]));


--
-- Name: idx_kanzlei_pakete_versendet_durch_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_pakete_versendet_durch_user_id ON public.kanzlei_pakete USING btree (versendet_durch_user_id);


--
-- Name: idx_kanzlei_positionen_abrechnung; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanzlei_positionen_abrechnung ON public.kanzlei_abrechnung_positionen USING btree (kanzlei_abrechnung_id);


--
-- Name: idx_katalog_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_katalog_aktiv ON public.dokument_katalog USING btree (aktiv) WHERE (aktiv = true);


--
-- Name: idx_katalog_kategorie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_katalog_kategorie ON public.dokument_katalog USING btree (kategorie);


--
-- Name: idx_ki_gespraeche_fall_rolle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ki_gespraeche_fall_rolle ON public.ki_gespraeche USING btree (fall_id, rolle);


--
-- Name: idx_ki_gespraeche_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ki_gespraeche_unique ON public.ki_gespraeche USING btree (fall_id, rolle, user_id);


--
-- Name: idx_ki_gespraeche_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ki_gespraeche_user_id ON public.ki_gespraeche USING btree (user_id);


--
-- Name: idx_kunde_gutachten_requests_fall_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kunde_gutachten_requests_fall_created ON public.kunde_gutachten_requests USING btree (fall_id, created_at DESC);


--
-- Name: idx_laeufer_reports_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laeufer_reports_claim ON public.sv_organisation_laeufer_reports USING btree (claim_id);


--
-- Name: idx_laeufer_reports_laeufer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laeufer_reports_laeufer ON public.sv_organisation_laeufer_reports USING btree (laeufer_user_id);


--
-- Name: idx_laeufer_reports_offen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laeufer_reports_offen ON public.sv_organisation_laeufer_reports USING btree (status) WHERE (status = 'aufgenommen'::text);


--
-- Name: idx_lead_historie_geaendert_am; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_historie_geaendert_am ON public.lead_historie USING btree (geaendert_am DESC);


--
-- Name: idx_lead_historie_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_historie_lead_id ON public.lead_historie USING btree (lead_id);


--
-- Name: idx_leaderboard_org_zeit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leaderboard_org_zeit ON public.community_leaderboard USING btree (organisation_id, zeitraum_jahr, zeitraum_monat);


--
-- Name: idx_leadpreise_aktiv_grenze; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadpreise_aktiv_grenze ON public.leadpreise_tabelle USING btree (aktiv, schadenhoehe_bis_netto);


--
-- Name: idx_leads_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_email_lower ON public.leads USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: idx_leads_gegner_versicherung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_gegner_versicherung_id ON public.leads USING btree (gegner_versicherung_id) WHERE (gegner_versicherung_id IS NOT NULL);


--
-- Name: idx_leads_halter_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_halter_email_lower ON public.leads USING btree (lower(halter_email)) WHERE (halter_email IS NOT NULL);


--
-- Name: idx_leads_kennzeichen_kreis_buchst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_kennzeichen_kreis_buchst ON public.leads USING btree (kennzeichen_kreis, kennzeichen_buchstaben);


--
-- Name: idx_leads_konvertiert_durch_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_konvertiert_durch_user_id ON public.leads USING btree (konvertiert_durch_user_id);


--
-- Name: idx_leads_konvertiert_zu_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_konvertiert_zu_claim ON public.leads USING btree (konvertiert_zu_claim_id) WHERE (konvertiert_zu_claim_id IS NOT NULL);


--
-- Name: idx_leads_konvertiert_zu_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_konvertiert_zu_fall_id ON public.leads USING btree (konvertiert_zu_fall_id);


--
-- Name: idx_leads_kunde_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_kunde_id ON public.leads USING btree (kunde_id) WHERE (kunde_id IS NOT NULL);


--
-- Name: idx_leads_promotion_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_promotion_code ON public.leads USING btree (promotion_code_id) WHERE (promotion_code_id IS NOT NULL);


--
-- Name: idx_leads_reminder_candidates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_reminder_candidates ON public.leads USING btree (created_at) WHERE ((status = 'neu'::public.lead_status) AND (disqualifiziert = false));


--
-- Name: idx_leads_reminder_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_leads_reminder_token ON public.leads USING btree (reminder_token);


--
-- Name: idx_leads_rueckruf_geplant_am; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_rueckruf_geplant_am ON public.leads USING btree (rueckruf_geplant_am) WHERE (rueckruf_geplant_am IS NOT NULL);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- Name: idx_leads_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_vehicle ON public.leads USING btree (vehicle_id);


--
-- Name: idx_leads_whatsapp_geprueft_am; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_whatsapp_geprueft_am ON public.leads USING btree (whatsapp_geprueft_am) WHERE (whatsapp_geprueft_am IS NOT NULL);


--
-- Name: idx_leads_zb1_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_zb1_token ON public.leads USING btree (zb1_token) WHERE (zb1_token IS NOT NULL);


--
-- Name: idx_leads_zugewiesen_an; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_zugewiesen_an ON public.leads USING btree (zugewiesen_an);


--
-- Name: idx_makler_aktiviert_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_aktiviert_von ON public.makler USING btree (aktiviert_von);


--
-- Name: idx_makler_fall_consent_makler_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_fall_consent_makler_id ON public.makler_fall_consent USING btree (makler_id);


--
-- Name: idx_makler_fall_consent_widerrufen_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_fall_consent_widerrufen_von ON public.makler_fall_consent USING btree (widerrufen_von);


--
-- Name: idx_makler_provisionen_abrechnung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_provisionen_abrechnung_id ON public.makler_provisionen USING btree (abrechnung_id);


--
-- Name: idx_makler_provisionen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_provisionen_fall_id ON public.makler_provisionen USING btree (fall_id);


--
-- Name: idx_makler_provisionen_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_provisionen_lead_id ON public.makler_provisionen USING btree (lead_id);


--
-- Name: idx_makler_provisionen_promotion_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_provisionen_promotion_code_id ON public.makler_provisionen USING btree (promotion_code_id);


--
-- Name: idx_makler_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_status ON public.makler USING btree (status);


--
-- Name: idx_makler_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_makler_user_id ON public.makler USING btree (user_id);


--
-- Name: idx_matelso_calls_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matelso_calls_fall_id ON public.matelso_calls USING btree (fall_id);


--
-- Name: idx_matelso_calls_from_num; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matelso_calls_from_num ON public.matelso_calls USING btree (from_number);


--
-- Name: idx_matelso_calls_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matelso_calls_lead_id ON public.matelso_calls USING btree (lead_id);


--
-- Name: idx_matelso_calls_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matelso_calls_started_at ON public.matelso_calls USING btree (started_at DESC);


--
-- Name: idx_mfc_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfc_fall ON public.makler_fall_consent USING btree (fall_id) WHERE (widerrufen_am IS NULL);


--
-- Name: idx_mitteilungen_absender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mitteilungen_absender_id ON public.mitteilungen USING btree (absender_id);


--
-- Name: idx_mitteilungen_empfaenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mitteilungen_empfaenger ON public.mitteilungen USING btree (empfaenger_id, gelesen, created_at DESC);


--
-- Name: idx_mitteilungen_kategorie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mitteilungen_kategorie ON public.mitteilungen USING btree (empfaenger_id, kategorie, gelesen);


--
-- Name: idx_mp_makler_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_makler_status ON public.makler_provisionen USING btree (makler_id, status);


--
-- Name: idx_mp_pending_release; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_pending_release ON public.makler_provisionen USING btree (hold_until) WHERE (status = 'pending'::text);


--
-- Name: idx_nachrichten_external_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_external_message_id ON public.nachrichten USING btree (external_message_id) WHERE (external_message_id IS NOT NULL);


--
-- Name: idx_nachrichten_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_fall_id ON public.nachrichten USING btree (fall_id);


--
-- Name: idx_nachrichten_fall_kanal_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_fall_kanal_created ON public.nachrichten USING btree (fall_id, kanal, created_at DESC);


--
-- Name: idx_nachrichten_kanal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_kanal ON public.nachrichten USING btree (fall_id, kanal);


--
-- Name: idx_nachrichten_kb_empfaenger_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_kb_empfaenger_id ON public.nachrichten USING btree (kb_empfaenger_id);


--
-- Name: idx_nachrichten_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_lead ON public.nachrichten USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_nachrichten_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_sender_id ON public.nachrichten USING btree (sender_id);


--
-- Name: idx_nachrichten_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_status ON public.nachrichten USING btree (status) WHERE (status IS NOT NULL);


--
-- Name: idx_nachrichten_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nachrichten_unread ON public.nachrichten USING btree (empfaenger_id, gelesen) WHERE (gelesen = false);


--
-- Name: idx_notif_deliv_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_deliv_event ON public.notification_deliveries USING btree (event_id);


--
-- Name: idx_notif_deliv_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_deliv_recipient ON public.notification_deliveries USING btree (recipient_user_id, created_at DESC);


--
-- Name: idx_notif_events_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_events_fall ON public.notification_events USING btree (fall_id, created_at DESC);


--
-- Name: idx_notif_events_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_events_pending ON public.notification_events USING btree (status, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_notif_events_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_events_retry ON public.notification_events USING btree (status, next_retry_at) WHERE ((status = 'failed'::text) AND (next_retry_at IS NOT NULL));


--
-- Name: idx_notification_events_triggered_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_events_triggered_by_user_id ON public.notification_events USING btree (triggered_by_user_id);


--
-- Name: idx_ocr_runs_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocr_runs_failed ON public.ocr_runs USING btree (status, started_at DESC) WHERE (status = 'failed'::text);


--
-- Name: idx_ocr_runs_gutachten; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocr_runs_gutachten ON public.ocr_runs USING btree (gutachten_id, run_nummer DESC);


--
-- Name: idx_ocr_runs_running_stuck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocr_runs_running_stuck ON public.ocr_runs USING btree (started_at) WHERE (status = 'running'::text);


--
-- Name: idx_ocr_runs_triggered_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocr_runs_triggered_by_user_id ON public.ocr_runs USING btree (triggered_by_user_id);


--
-- Name: idx_onboarding_felder_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_felder_phase ON public.onboarding_felder USING btree (phase_id, reihenfolge);


--
-- Name: idx_org_onboarding_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_onboarding_status ON public.organisationen USING btree (onboarding_status);


--
-- Name: idx_org_typ; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_typ ON public.organisationen USING btree (typ);


--
-- Name: idx_organisationen_parent_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organisationen_parent_user_id ON public.organisationen USING btree (parent_user_id);


--
-- Name: idx_organisationen_vertrag_unterzeichnet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organisationen_vertrag_unterzeichnet_id ON public.organisationen USING btree (vertrag_unterzeichnet_id);


--
-- Name: idx_paket_upgrades_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paket_upgrades_sv_id ON public.paket_upgrades USING btree (sv_id);


--
-- Name: idx_parteien_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parteien_fall ON public.parteien USING btree (fall_id);


--
-- Name: idx_payment_reminders_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payment_reminders_unique ON public.sv_payment_reminders USING btree (sv_id, reminder_typ);


--
-- Name: idx_perf_mitarbeiter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perf_mitarbeiter ON public.mitarbeiter_performance USING btree (mitarbeiter_id);


--
-- Name: idx_perf_monat_jahr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perf_monat_jahr ON public.mitarbeiter_performance USING btree (monat, jahr);


--
-- Name: idx_personenschaden_personen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personenschaden_personen_fall_id ON public.personenschaden_personen USING btree (fall_id);


--
-- Name: idx_personenschaden_personen_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personenschaden_personen_lead_id ON public.personenschaden_personen USING btree (lead_id);


--
-- Name: idx_pflichtdokumente_angefordert_von_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pflichtdokumente_angefordert_von_user_id ON public.pflichtdokumente USING btree (angefordert_von_user_id);


--
-- Name: idx_pflichtdokumente_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pflichtdokumente_fall_id ON public.pflichtdokumente USING btree (fall_id);


--
-- Name: idx_pflichtdokumente_fall_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pflichtdokumente_fall_sort ON public.pflichtdokumente USING btree (fall_id, sort_order);


--
-- Name: idx_pflichtdokumente_gueltig_bis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pflichtdokumente_gueltig_bis ON public.pflichtdokumente USING btree (gueltig_bis) WHERE (gueltig_bis IS NOT NULL);


--
-- Name: idx_pflichtdokumente_person_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pflichtdokumente_person_id ON public.pflichtdokumente USING btree (person_id) WHERE (person_id IS NOT NULL);


--
-- Name: idx_pflichtdokumente_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pflichtdokumente_sv ON public.pflichtdokumente USING btree (sv_id) WHERE (sv_id IS NOT NULL);


--
-- Name: idx_phase_transitions_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phase_transitions_actor ON public.phase_transitions USING btree (transitioned_by, transition_at DESC) WHERE (transitioned_by IS NOT NULL);


--
-- Name: idx_phase_transitions_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phase_transitions_fall_id ON public.phase_transitions USING btree (fall_id, transition_at DESC);


--
-- Name: idx_phase_transitions_trigger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phase_transitions_trigger_type ON public.phase_transitions USING btree (trigger_type, transition_at DESC);


--
-- Name: idx_profiles_account_typ; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_account_typ ON public.profiles USING btree (account_typ);


--
-- Name: idx_profiles_community_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_community_id ON public.profiles USING btree (community_id) WHERE (community_id IS NOT NULL);


--
-- Name: idx_profiles_entstanden_aus_airdrop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_entstanden_aus_airdrop_id ON public.profiles USING btree (entstanden_aus_airdrop_id);


--
-- Name: idx_profiles_entstanden_aus_claim_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_entstanden_aus_claim_id ON public.profiles USING btree (entstanden_aus_claim_id);


--
-- Name: idx_profiles_entstanden_via; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_entstanden_via ON public.profiles USING btree (entstanden_via) WHERE (entstanden_via IS NOT NULL);


--
-- Name: idx_profiles_google_connected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_google_connected ON public.profiles USING btree (id) WHERE (google_refresh_token IS NOT NULL);


--
-- Name: idx_profiles_twilio_nummer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_twilio_nummer ON public.profiles USING btree (twilio_whatsapp_nummer) WHERE (twilio_whatsapp_nummer IS NOT NULL);


--
-- Name: idx_profiles_whatsapp_geprueft_am; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_whatsapp_geprueft_am ON public.profiles USING btree (whatsapp_geprueft_am) WHERE (whatsapp_geprueft_am IS NOT NULL);


--
-- Name: idx_promo_clicks_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_clicks_code ON public.promo_clicks USING btree (promotion_code_id, clicked_at DESC);


--
-- Name: idx_promo_code_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_code_lookup ON public.promotion_codes USING btree (code) WHERE (aktiv = true);


--
-- Name: idx_promotion_codes_makler_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_codes_makler_id ON public.promotion_codes USING btree (makler_id);


--
-- Name: idx_provisionen_maik_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provisionen_maik_lead ON public.provisionen_maik USING btree (lead_id);


--
-- Name: idx_provisionen_maik_monat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provisionen_maik_monat ON public.provisionen_maik USING btree (monat);


--
-- Name: idx_provisionen_maik_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provisionen_maik_status ON public.provisionen_maik USING btree (status);


--
-- Name: idx_push_sub_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_sub_user ON public.push_subscriptions USING btree (user_id) WHERE (expired_at IS NULL);


--
-- Name: idx_qc_checkliste_geprueft_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qc_checkliste_geprueft_von ON public.qc_checkliste USING btree (geprueft_von);


--
-- Name: idx_rechnungs_konfig_gueltig; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rechnungs_konfig_gueltig ON public.rechnungs_konfiguration USING btree (gueltig_ab, gueltig_bis);


--
-- Name: idx_regulierung_kuerzungsgrund; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulierung_kuerzungsgrund ON public.regulierungs_klassifizierung USING btree (kuerzungsgrund) WHERE (kuerzungsgrund IS NOT NULL);


--
-- Name: idx_regulierung_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulierung_status ON public.regulierungs_klassifizierung USING btree (regulierungs_status);


--
-- Name: idx_regulierungs_klassifizierung_erfasst_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulierungs_klassifizierung_erfasst_von ON public.regulierungs_klassifizierung USING btree (erfasst_von);


--
-- Name: idx_reklamationen_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reklamationen_fall ON public.reklamationen USING btree (fall_id);


--
-- Name: idx_reklamationen_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reklamationen_status ON public.reklamationen USING btree (status);


--
-- Name: idx_reklamationen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reklamationen_sv_id ON public.reklamationen USING btree (sv_id);


--
-- Name: idx_relay_seats_belegt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relay_seats_belegt ON public.aircall_relay_seats USING btree (belegt) WHERE (aktiv = true);


--
-- Name: idx_remember_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remember_tokens_hash ON public.auth_remember_tokens USING btree (token_hash) WHERE (revoked_am IS NULL);


--
-- Name: idx_remember_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remember_tokens_user ON public.auth_remember_tokens USING btree (user_id) WHERE (revoked_am IS NULL);


--
-- Name: idx_repairs_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repairs_claim ON public.repairs USING btree (claim_id);


--
-- Name: idx_repairs_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repairs_created_by_user_id ON public.repairs USING btree (created_by_user_id);


--
-- Name: idx_repairs_gutachten_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repairs_gutachten_id ON public.repairs USING btree (gutachten_id);


--
-- Name: idx_repairs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repairs_status ON public.repairs USING btree (status) WHERE (status <> 'storniert'::text);


--
-- Name: idx_repairs_werkstatt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repairs_werkstatt ON public.repairs USING btree (werkstatt_id);


--
-- Name: idx_routing_cache_age; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_cache_age ON public.routing_cache USING btree (cached_at);


--
-- Name: idx_sachverstaendige_gesperrt_von_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sachverstaendige_gesperrt_von_user_id ON public.sachverstaendige USING btree (gesperrt_von_user_id);


--
-- Name: idx_sachverstaendige_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sachverstaendige_profile_id ON public.sachverstaendige USING btree (profile_id);


--
-- Name: idx_sachverstaendige_sa_vorlage_geprueft_von_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sachverstaendige_sa_vorlage_geprueft_von_user_id ON public.sachverstaendige USING btree (sa_vorlage_geprueft_von_user_id);


--
-- Name: idx_sachverstaendige_verifiziert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sachverstaendige_verifiziert ON public.sachverstaendige USING btree (verifiziert) WHERE (verifiziert = true);


--
-- Name: idx_sachverstaendige_verifiziert_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sachverstaendige_verifiziert_von ON public.sachverstaendige USING btree (verifiziert_von);


--
-- Name: idx_schadenspositionen_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schadenspositionen_fall ON public.schadenspositionen USING btree (fall_id);


--
-- Name: idx_sla_tracking_breach_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_tracking_breach_at ON public.sla_tracking USING btree (breach_at) WHERE (status = 'pending'::text);


--
-- Name: idx_sla_tracking_eskalation_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_tracking_eskalation_task_id ON public.sla_tracking USING btree (eskalation_task_id);


--
-- Name: idx_sla_tracking_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_tracking_fall_id ON public.sla_tracking USING btree (fall_id);


--
-- Name: idx_sla_tracking_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_tracking_status ON public.sla_tracking USING btree (status);


--
-- Name: idx_sla_tracking_target_rolle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_tracking_target_rolle ON public.sla_tracking USING btree (target_rolle) WHERE (status = ANY (ARRAY['pending'::text, 'breached'::text]));


--
-- Name: idx_stripe_events_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_events_sv_id ON public.stripe_events USING btree (sv_id);


--
-- Name: idx_stripe_events_typ; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_events_typ ON public.stripe_events USING btree (event_type);


--
-- Name: idx_support_ticket_log_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_log_user_created ON public.support_ticket_log USING btree (user_id, created_at DESC);


--
-- Name: idx_sv_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_aktiv ON public.sachverstaendige USING btree (ist_aktiv);


--
-- Name: idx_sv_kalender_events_sv_zeit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_kalender_events_sv_zeit ON public.sv_kalender_events_cache USING btree (sv_id, start_zeit);


--
-- Name: idx_sv_kalender_verbindungen_fehler_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_kalender_verbindungen_fehler_task_id ON public.sv_kalender_verbindungen USING btree (fehler_task_id);


--
-- Name: idx_sv_kalender_verbindungen_last_error; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_kalender_verbindungen_last_error ON public.sv_kalender_verbindungen USING btree (last_error_at) WHERE (last_error IS NOT NULL);


--
-- Name: idx_sv_kalender_verbindungen_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_kalender_verbindungen_sv_id ON public.sv_kalender_verbindungen USING btree (sv_id);


--
-- Name: idx_sv_live_location_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_live_location_fall_id ON public.sv_live_location USING btree (fall_id);


--
-- Name: idx_sv_live_position_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_live_position_sv ON public.sv_live_position USING btree (sv_id, updated_at DESC);


--
-- Name: idx_sv_onb_rechnungen_datum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_onb_rechnungen_datum ON public.sv_onboarding_rechnungen USING btree (rechnungs_datum);


--
-- Name: idx_sv_onb_rechnungen_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_onb_rechnungen_org ON public.sv_onboarding_rechnungen USING btree (organisation_id);


--
-- Name: idx_sv_onb_rechnungen_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_onb_rechnungen_sv ON public.sv_onboarding_rechnungen USING btree (sv_id);


--
-- Name: idx_sv_onboarding_rechnungen_rechnungs_konfiguration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_onboarding_rechnungen_rechnungs_konfiguration_id ON public.sv_onboarding_rechnungen USING btree (rechnungs_konfiguration_id);


--
-- Name: idx_sv_organisation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_organisation ON public.sachverstaendige USING btree (organisation_id) WHERE (organisation_id IS NOT NULL);


--
-- Name: idx_sv_organisation_inhaber_sv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_organisation_inhaber_sv_id ON public.sv_organisation USING btree (inhaber_sv_id);


--
-- Name: idx_sv_organisation_laeufer_reports_organisation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_organisation_laeufer_reports_organisation_id ON public.sv_organisation_laeufer_reports USING btree (organisation_id);


--
-- Name: idx_sv_qualifikationen_neu_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_qualifikationen_neu_gin ON public.sachverstaendige USING gin (qualifikationen_neu);


--
-- Name: idx_sv_schadenarten_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_schadenarten_gin ON public.sachverstaendige USING gin (schadenarten);


--
-- Name: idx_sv_spezifikationen_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_spezifikationen_gin ON public.sachverstaendige USING gin (spezifikationen);


--
-- Name: idx_sv_tages_session_aktueller_termin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_tages_session_aktueller_termin_id ON public.sv_tages_session USING btree (aktueller_termin_id);


--
-- Name: idx_sv_tages_session_datum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_tages_session_datum ON public.sv_tages_session USING btree (datum);


--
-- Name: idx_sv_tages_session_sv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sv_tages_session_sv_status ON public.sv_tages_session USING btree (sv_id, status);


--
-- Name: idx_svbuero_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svbuero_aktiv ON public.sv_buero_memberships USING btree (sv_id, buero_id) WHERE (end_date IS NULL);


--
-- Name: idx_svbuero_buero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svbuero_buero ON public.sv_buero_memberships USING btree (buero_id);


--
-- Name: idx_svbuero_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svbuero_sv ON public.sv_buero_memberships USING btree (sv_id);


--
-- Name: idx_svorgmem_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svorgmem_aktiv ON public.sv_organisation_memberships USING btree (user_id) WHERE (end_date IS NULL);


--
-- Name: idx_svorgmem_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svorgmem_org ON public.sv_organisation_memberships USING btree (organisation_id);


--
-- Name: idx_svorgmem_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svorgmem_user ON public.sv_organisation_memberships USING btree (user_id);


--
-- Name: idx_task_reminders_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_reminders_pending ON public.task_reminders USING btree (geplant_fuer) WHERE (status = 'pending'::text);


--
-- Name: idx_task_reminders_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_reminders_task ON public.task_reminders USING btree (task_id);


--
-- Name: idx_tasks_auto_not_eskaliert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_auto_not_eskaliert ON public.tasks USING btree (trigger_event, empfaenger_rolle) WHERE ((auto_erstellt = true) AND (status = 'offen'::public.task_status) AND (eskaliert_am IS NULL));


--
-- Name: idx_tasks_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_entity ON public.tasks USING btree (entity_type, entity_id) WHERE (entity_type IS NOT NULL);


--
-- Name: idx_tasks_erstellt_von_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_erstellt_von_id ON public.tasks USING btree (erstellt_von_id);


--
-- Name: idx_tasks_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_fall ON public.tasks USING btree (fall_id);


--
-- Name: idx_tasks_gate_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_gate_task_id ON public.tasks USING btree (gate_task_id);


--
-- Name: idx_tasks_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_lead ON public.tasks USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_tasks_offen_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_offen_entity ON public.tasks USING btree (entity_type, entity_id) WHERE ((status = 'offen'::public.task_status) AND (entity_type IS NOT NULL));


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_zugewiesen_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_zugewiesen_status ON public.tasks USING btree (zugewiesen_an, status) WHERE (status <> 'erledigt'::public.task_status);


--
-- Name: idx_technische_probleme_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technische_probleme_fall_id ON public.technische_probleme USING btree (fall_id);


--
-- Name: idx_termin_reminders_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_termin_reminders_pending ON public.termin_reminders USING btree (geplant_fuer, status) WHERE (status = 'pending'::text);


--
-- Name: idx_termine_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_termine_fall_id ON public.termine USING btree (fall_id);


--
-- Name: idx_termine_google_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_termine_google_event ON public.termine USING btree (google_event_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: idx_termine_kb_beratung; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_termine_kb_beratung ON public.gutachter_termine USING btree (kb_id, typ, status) WHERE (typ = 'kb_beratung'::text);


--
-- Name: idx_termine_tracking_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_termine_tracking_token ON public.gutachter_termine USING btree (kunden_tracking_token) WHERE (kunden_tracking_token IS NOT NULL);


--
-- Name: idx_timeline_erstellt_von; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_erstellt_von ON public.timeline USING btree (erstellt_von);


--
-- Name: idx_timeline_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_fall ON public.timeline USING btree (fall_id);


--
-- Name: idx_timeline_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_lead ON public.timeline USING btree (lead_id);


--
-- Name: idx_utterances_call_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_utterances_call_time ON public.call_transcription_utterances USING btree (call_id, empfangen_am);


--
-- Name: idx_vehicles_hsn_tsn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_hsn_tsn ON public.vehicles USING btree (hsn, tsn);


--
-- Name: idx_vehicles_kennzeichen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_kennzeichen ON public.vehicles USING btree (kennzeichen_aktuell);


--
-- Name: idx_vehicles_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_owner ON public.vehicles USING btree (current_owner_id);


--
-- Name: idx_vehicles_status_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_status_aktiv ON public.vehicles USING btree (status) WHERE (status = 'aktiv'::text);


--
-- Name: idx_vehicles_zb1_dokument_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_zb1_dokument_id ON public.vehicles USING btree (zb1_dokument_id);


--
-- Name: idx_versicherungen_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versicherungen_aktiv ON public.versicherungen USING btree (ist_aktiv);


--
-- Name: idx_vertraege_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vertraege_org ON public.vertraege_unterzeichnet USING btree (organisation_id) WHERE (organisation_id IS NOT NULL);


--
-- Name: idx_vertraege_sv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vertraege_sv ON public.vertraege_unterzeichnet USING btree (sv_id);


--
-- Name: idx_vertraege_unterzeichnet_vorlage_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vertraege_unterzeichnet_vorlage_id ON public.vertraege_unterzeichnet USING btree (vorlage_id);


--
-- Name: idx_vertragsvorlagen_typ_aktiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vertragsvorlagen_typ_aktiv ON public.vertragsvorlagen USING btree (typ, aktiv);


--
-- Name: idx_voh_one_active_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_voh_one_active_owner ON public.vehicle_ownership_history USING btree (vehicle_id) WHERE (bis IS NULL);


--
-- Name: idx_voh_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voh_user ON public.vehicle_ownership_history USING btree (user_id);


--
-- Name: idx_voh_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voh_vehicle ON public.vehicle_ownership_history USING btree (vehicle_id);


--
-- Name: idx_vs_korrespondenz_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vs_korrespondenz_created_by_user_id ON public.vs_korrespondenz USING btree (created_by_user_id);


--
-- Name: idx_vsk_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vsk_claim ON public.vs_korrespondenz USING btree (claim_id);


--
-- Name: idx_vsk_datum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vsk_datum ON public.vs_korrespondenz USING btree (datum);


--
-- Name: idx_vsk_frist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vsk_frist ON public.vs_korrespondenz USING btree (wartet_auf_antwort_bis) WHERE ((wartet_auf_antwort_bis IS NOT NULL) AND (status = 'wartet_auf_antwort'::text));


--
-- Name: idx_vsk_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vsk_status ON public.vs_korrespondenz USING btree (status) WHERE (status <> ALL (ARRAY['beantwortet'::text, 'archiviert'::text]));


--
-- Name: idx_wa_inbound_fall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_inbound_fall ON public.whatsapp_inbound_messages USING btree (matched_fall_id);


--
-- Name: idx_wa_inbound_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_inbound_phone ON public.whatsapp_inbound_messages USING btree (from_phone);


--
-- Name: idx_wa_inbound_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_inbound_processed ON public.whatsapp_inbound_messages USING btree (processed);


--
-- Name: idx_webhook_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_created ON public.webhook_events USING btree (created_at DESC);


--
-- Name: idx_webhook_events_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_fall_id ON public.webhook_events USING btree (fall_id);


--
-- Name: idx_webhook_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_user_id ON public.webhook_events USING btree (user_id);


--
-- Name: idx_whatsapp_inbound_messages_matched_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_inbound_messages_matched_lead_id ON public.whatsapp_inbound_messages USING btree (matched_lead_id);


--
-- Name: idx_whatsapp_inbound_messages_matched_termin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_inbound_messages_matched_termin_id ON public.whatsapp_inbound_messages USING btree (matched_termin_id);


--
-- Name: idx_zahlungseingaenge_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zahlungseingaenge_fall_id ON public.zahlungseingaenge USING btree (fall_id);


--
-- Name: idx_zahlungspositionen_fall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zahlungspositionen_fall_id ON public.zahlungspositionen USING btree (fall_id);


--
-- Name: idx_zahlungspositionen_zahlung_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zahlungspositionen_zahlung_id ON public.zahlungspositionen USING btree (zahlung_id);


--
-- Name: leads_polizeibericht_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_polizeibericht_token_idx ON public.leads USING btree (polizeibericht_token) WHERE (polizeibericht_token IS NOT NULL);


--
-- Name: plz_geo_lat_lng_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plz_geo_lat_lng_idx ON public.plz_geo USING btree (lat, lng);


--
-- Name: sv_leads_ist_aktiv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sv_leads_ist_aktiv_idx ON public.sv_leads USING btree (ist_aktiv);


--
-- Name: sv_leads_lat_lng_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sv_leads_lat_lng_idx ON public.sv_leads USING btree (lat, lng);


--
-- Name: sv_private_stops_event_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sv_private_stops_event_uq ON public.sv_private_stops USING btree (sv_id, source, external_event_id, datum);


--
-- Name: sv_private_stops_sv_datum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sv_private_stops_sv_datum_idx ON public.sv_private_stops USING btree (sv_id, datum);


--
-- Name: uniq_cp_geschaedigter_per_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_cp_geschaedigter_per_claim ON public.claim_parties USING btree (claim_id) WHERE ((rolle = 'geschaedigter'::text) AND (ist_aktiv = true));


--
-- Name: uniq_cp_verursacher_per_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_cp_verursacher_per_claim ON public.claim_parties USING btree (claim_id) WHERE ((rolle = 'verursacher'::text) AND (ist_aktiv = true));


--
-- Name: auftraege auftraege_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auftraege_updated_at BEFORE UPDATE ON public.auftraege FOR EACH ROW EXECUTE FUNCTION public.tg_auftraege_set_updated_at();


--
-- Name: embed_abrechnung_positionen embed_abr_pos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER embed_abr_pos_updated_at BEFORE UPDATE ON public.embed_abrechnung_positionen FOR EACH ROW EXECUTE FUNCTION public.tg_auftraege_set_updated_at();


--
-- Name: embed_sites embed_sites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER embed_sites_updated_at BEFORE UPDATE ON public.embed_sites FOR EACH ROW EXECUTE FUNCTION public.tg_auftraege_set_updated_at();


--
-- Name: fall_dokumente fall_dokumente_autotask; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fall_dokumente_autotask AFTER INSERT ON public.fall_dokumente FOR EACH ROW EXECUTE FUNCTION public.trg_fall_dokumente_autotask();


--
-- Name: fall_dokumente fall_dokumente_sync_claim_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fall_dokumente_sync_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.fall_dokumente FOR EACH ROW EXECUTE FUNCTION public.sync_fall_dokumente_claim_id();


--
-- Name: gutachter_finder_anfragen gfa_whatsapp_invalidate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gfa_whatsapp_invalidate BEFORE UPDATE OF telefon ON public.gutachter_finder_anfragen FOR EACH ROW EXECUTE FUNCTION public.invalidate_whatsapp_cache_on_phone_change();


--
-- Name: claims guard_claims_created_by_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_claims_created_by_ins BEFORE INSERT ON public.claims FOR EACH ROW EXECUTE FUNCTION public.guard_claims_created_by();


--
-- Name: claims guard_claims_created_by_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_claims_created_by_upd BEFORE UPDATE OF created_by_user_id ON public.claims FOR EACH ROW EXECUTE FUNCTION public.guard_claims_created_by();


--
-- Name: makler guard_makler_privilegien_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_makler_privilegien_ins BEFORE INSERT ON public.makler FOR EACH ROW EXECUTE FUNCTION public.guard_makler_privilegien();


--
-- Name: makler guard_makler_privilegien_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_makler_privilegien_upd BEFORE UPDATE OF status, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv, user_id ON public.makler FOR EACH ROW EXECUTE FUNCTION public.guard_makler_privilegien();


--
-- Name: profiles guard_profiles_rolle_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_profiles_rolle_ins BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_rolle();


--
-- Name: profiles guard_profiles_rolle_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_profiles_rolle_upd BEFORE UPDATE OF rolle, sv_paket, aktiv ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_rolle();


--
-- Name: sachverstaendige guard_sachverstaendige_privilegien_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_sachverstaendige_privilegien_ins BEFORE INSERT ON public.sachverstaendige FOR EACH ROW EXECUTE FUNCTION public.guard_sachverstaendige_privilegien();


--
-- Name: sachverstaendige guard_sachverstaendige_privilegien_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_sachverstaendige_privilegien_upd BEFORE UPDATE OF verifiziert, werbebudget_guthaben_netto, ist_aktiv, use_custom_branding, paket, paket_faelle_gesamt, paket_preis, paket_umkreis_km, gesperrt_grund, gesperrt_seit, verifizierung_status ON public.sachverstaendige FOR EACH ROW EXECUTE FUNCTION public.guard_sachverstaendige_privilegien();


--
-- Name: gutachter_waitlist gutachter_waitlist_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gutachter_waitlist_touch BEFORE UPDATE ON public.gutachter_waitlist FOR EACH ROW EXECUTE FUNCTION public.gutachter_waitlist_touch_updated_at();


--
-- Name: kanzlei_faelle kanzlei_faelle_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kanzlei_faelle_updated_at BEFORE UPDATE ON public.kanzlei_faelle FOR EACH ROW EXECUTE FUNCTION public.tg_auftraege_set_updated_at();


--
-- Name: leads kanzlei_provision_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kanzlei_provision_trigger AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trigger_kanzlei_provision();


--
-- Name: leads lead_changes_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_changes_trigger AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();


--
-- Name: leads leads_whatsapp_invalidate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_whatsapp_invalidate BEFORE UPDATE OF telefon ON public.leads FOR EACH ROW EXECUTE FUNCTION public.invalidate_whatsapp_cache_on_phone_change();


--
-- Name: faelle on_filmcheck_done; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_filmcheck_done AFTER UPDATE ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.trg_filmcheck_benachrichtigung();


--
-- Name: faelle on_gutachten_eingegangen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_gutachten_eingegangen AFTER UPDATE ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.trg_gutachten_benachrichtigung();


--
-- Name: leads on_lead_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_lead_created AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trg_lead_benachrichtigung();


--
-- Name: faelle on_regulierung; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_regulierung AFTER UPDATE ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.trg_regulierung_benachrichtigung();


--
-- Name: profiles profiles_whatsapp_invalidate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_whatsapp_invalidate BEFORE UPDATE OF telefon ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.invalidate_whatsapp_cache_on_phone_change();


--
-- Name: gutachter_termine set_gutachter_termine_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_gutachter_termine_updated_at BEFORE UPDATE ON public.gutachter_termine FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: kunde_live_position set_kunde_live_position_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_kunde_live_position_updated_at BEFORE UPDATE ON public.kunde_live_position FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: makler set_makler_aktualisiert_am; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_makler_aktualisiert_am BEFORE UPDATE ON public.makler FOR EACH ROW EXECUTE FUNCTION public.update_aktualisiert_am_column();


--
-- Name: sv_tages_session set_sv_tages_session_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_sv_tages_session_updated_at BEFORE UPDATE ON public.sv_tages_session FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: sv_private_stops sv_private_stops_touch_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sv_private_stops_touch_trg BEFORE UPDATE ON public.sv_private_stops FOR EACH ROW EXECUTE FUNCTION public.sv_private_stops_touch_updated_at();


--
-- Name: gutachter_termine termin_sync_auftrag_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER termin_sync_auftrag_status AFTER INSERT OR UPDATE OF sv_angekommen_am, durchgefuehrt_am, auftrag_id ON public.gutachter_termine FOR EACH ROW EXECUTE FUNCTION public.tg_termin_sync_auftrag_status();


--
-- Name: airdrop_invitations trg_airdrop_status_consistency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_airdrop_status_consistency BEFORE INSERT OR UPDATE OF status ON public.airdrop_invitations FOR EACH ROW EXECUTE FUNCTION public.airdrop_status_consistency();


--
-- Name: airdrop_invitations trg_airdrop_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_airdrop_updated_at BEFORE UPDATE ON public.airdrop_invitations FOR EACH ROW EXECUTE FUNCTION public.set_airdrop_updated_at();


--
-- Name: claim_parties trg_anonymisiere_claim_party; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_anonymisiere_claim_party BEFORE UPDATE OF ist_anonymisiert ON public.claim_parties FOR EACH ROW EXECUTE FUNCTION public.anonymisiere_claim_party();


--
-- Name: auftraege trg_auftraege_sync_claim_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auftraege_sync_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.auftraege FOR EACH ROW EXECUTE FUNCTION public.auftraege_sync_claim_id();


--
-- Name: auftraege trg_auftraege_validate_typ_requires_kanzleifall; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auftraege_validate_typ_requires_kanzleifall BEFORE INSERT OR UPDATE OF typ, claim_id ON public.auftraege FOR EACH ROW EXECUTE FUNCTION public.auftraege_validate_typ_requires_kanzleifall();


--
-- Name: claim_parties trg_claim_parties_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_claim_parties_updated_at BEFORE UPDATE ON public.claim_parties FOR EACH ROW EXECUTE FUNCTION public.set_claim_parties_updated_at();


--
-- Name: claims trg_claim_validate_kb_rolle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_claim_validate_kb_rolle BEFORE INSERT OR UPDATE OF kundenbetreuer_id ON public.claims FOR EACH ROW EXECUTE FUNCTION public.fall_validate_kb_rolle();


--
-- Name: claims trg_claims_claim_nummer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_claims_claim_nummer BEFORE INSERT ON public.claims FOR EACH ROW EXECUTE FUNCTION public.set_claim_nummer();


--
-- Name: claims trg_claims_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_claims_updated_at BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.set_claims_updated_at();


--
-- Name: claims trg_claims_verjaehrung; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_claims_verjaehrung BEFORE INSERT OR UPDATE OF schadentag, schadenart ON public.claims FOR EACH ROW EXECUTE FUNCTION public.set_claims_verjaehrung();


--
-- Name: claim_mietwagen trg_cm_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cm_updated_at BEFORE UPDATE ON public.claim_mietwagen FOR EACH ROW EXECUTE FUNCTION public.set_claim_mietwagen_updated_at();


--
-- Name: communities trg_communities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_communities_updated_at BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: claim_payments trg_cp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cp_updated_at BEFORE UPDATE ON public.claim_payments FOR EACH ROW EXECUTE FUNCTION public.set_claim_payments_updated_at();


--
-- Name: dokument_katalog trg_dokument_katalog_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dokument_katalog_updated_at BEFORE UPDATE ON public.dokument_katalog FOR EACH ROW EXECUTE FUNCTION public.dokument_katalog_set_updated_at();


--
-- Name: faelle trg_fall_claim_id_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fall_claim_id_check AFTER INSERT ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.check_fall_claim_id();


--
-- Name: gutachten_positionen trg_gp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gp_updated_at BEFORE UPDATE ON public.gutachten_positionen FOR EACH ROW EXECUTE FUNCTION public.set_gutachten_positionen_updated_at();


--
-- Name: gutachten trg_gutachten_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gutachten_updated_at BEFORE UPDATE ON public.gutachten FOR EACH ROW EXECUTE FUNCTION public.set_gutachten_updated_at();


--
-- Name: kanzlei_admin_termine trg_kanzlei_admin_termine_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kanzlei_admin_termine_updated_at BEFORE UPDATE ON public.kanzlei_admin_termine FOR EACH ROW EXECUTE FUNCTION public.trg_kanzlei_admin_termine_updated_at();


--
-- Name: kanzlei_faelle trg_kanzlei_faelle_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kanzlei_faelle_sync BEFORE INSERT OR UPDATE OF fall_id, claim_id ON public.kanzlei_faelle FOR EACH ROW EXECUTE FUNCTION public.kanzlei_faelle_sync_claim_fall();


--
-- Name: kanzlei_pakete trg_kp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kp_updated_at BEFORE UPDATE ON public.kanzlei_pakete FOR EACH ROW EXECUTE FUNCTION public.set_kanzlei_pakete_updated_at();


--
-- Name: sv_organisation_laeufer_reports trg_laeufer_report_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_laeufer_report_updated_at BEFORE UPDATE ON public.sv_organisation_laeufer_reports FOR EACH ROW EXECUTE FUNCTION public.set_laeufer_report_updated_at();


--
-- Name: leads trg_leads_lead_nummer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_lead_nummer BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_lead_nummer();


--
-- Name: personenschaden_personen trg_personenschaden_personen_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_personenschaden_personen_updated_at BEFORE UPDATE ON public.personenschaden_personen FOR EACH ROW EXECUTE FUNCTION public.personenschaden_personen_set_updated_at();


--
-- Name: repairs trg_repairs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_repairs_updated_at BEFORE UPDATE ON public.repairs FOR EACH ROW EXECUTE FUNCTION public.set_repairs_updated_at();


--
-- Name: faelle trg_sa_bestaetigt_termin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sa_bestaetigt_termin BEFORE UPDATE ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.trigger_sa_bestaetigt_termin();


--
-- Name: sv_buero trg_sv_buero_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sv_buero_updated_at BEFORE UPDATE ON public.sv_buero FOR EACH ROW EXECUTE FUNCTION public.set_sv_buero_updated_at();


--
-- Name: sv_kalender_verbindungen trg_sv_kalender_verbindungen_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sv_kalender_verbindungen_updated_at BEFORE UPDATE ON public.sv_kalender_verbindungen FOR EACH ROW EXECUTE FUNCTION public.sv_kalender_verbindungen_set_updated_at();


--
-- Name: sv_organisation trg_sv_org_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sv_org_updated_at BEFORE UPDATE ON public.sv_organisation FOR EACH ROW EXECUTE FUNCTION public.set_sv_org_updated_at();


--
-- Name: claims trg_sync_claims_sv_id_to_faelle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_claims_sv_id_to_faelle AFTER INSERT OR UPDATE OF sv_id ON public.claims FOR EACH ROW EXECUTE FUNCTION public.sync_claims_sv_id_to_faelle();


--
-- Name: faelle trg_sync_faelle_sv_id_to_claims; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_faelle_sv_id_to_claims AFTER INSERT OR UPDATE OF sv_id ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.sync_faelle_sv_id_to_claims();


--
-- Name: gutachter_termine trg_validate_gutachter_termine_claim_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gutachter_termine_claim_id BEFORE INSERT OR UPDATE OF fall_id, claim_id ON public.gutachter_termine FOR EACH ROW EXECUTE FUNCTION public.validate_gutachter_termine_claim_id();


--
-- Name: vehicles trg_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_vehicle_updated_at();


--
-- Name: versicherungen trg_versicherungen_aktualisiert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_versicherungen_aktualisiert BEFORE UPDATE ON public.versicherungen FOR EACH ROW EXECUTE FUNCTION public.update_versicherungen_aktualisiert_am();


--
-- Name: werkstaetten trg_werkstaetten_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_werkstaetten_updated_at BEFORE UPDATE ON public.werkstaetten FOR EACH ROW EXECUTE FUNCTION public.set_werkstaetten_updated_at();


--
-- Name: faelle update_faelle_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_faelle_updated_at BEFORE UPDATE ON public.faelle FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: sachverstaendige update_sv_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sv_updated_at BEFORE UPDATE ON public.sachverstaendige FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: abrechnung_positionen abrechnung_positionen_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnung_positionen
    ADD CONSTRAINT abrechnung_positionen_abrechnung_id_fkey FOREIGN KEY (abrechnung_id) REFERENCES public.abrechnungen(id) ON DELETE CASCADE;


--
-- Name: abrechnung_positionen abrechnung_positionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnung_positionen
    ADD CONSTRAINT abrechnung_positionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: abrechnung_reminders abrechnung_reminders_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnung_reminders
    ADD CONSTRAINT abrechnung_reminders_abrechnung_id_fkey FOREIGN KEY (abrechnung_id) REFERENCES public.abrechnungen(id) ON DELETE CASCADE;


--
-- Name: admin_termine admin_termine_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_termine
    ADD CONSTRAINT admin_termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: admin_termine admin_termine_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_termine
    ADD CONSTRAINT admin_termine_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: ai_usage_log ai_usage_log_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: aircall_calls aircall_calls_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_calls
    ADD CONSTRAINT aircall_calls_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: aircall_calls aircall_calls_initiated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_calls
    ADD CONSTRAINT aircall_calls_initiated_by_profile_id_fkey FOREIGN KEY (initiated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: aircall_calls aircall_calls_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_calls
    ADD CONSTRAINT aircall_calls_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: aircall_relay_seats aircall_relay_seats_belegt_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aircall_relay_seats
    ADD CONSTRAINT aircall_relay_seats_belegt_call_id_fkey FOREIGN KEY (belegt_call_id) REFERENCES public.calls(id);


--
-- Name: airdrop_invitations airdrop_invitations_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: airdrop_invitations airdrop_invitations_invited_by_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_invited_by_party_id_fkey FOREIGN KEY (invited_by_party_id) REFERENCES public.claim_parties(id) ON DELETE SET NULL;


--
-- Name: airdrop_invitations airdrop_invitations_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: airdrop_invitations airdrop_invitations_resulting_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_resulting_party_id_fkey FOREIGN KEY (resulting_party_id) REFERENCES public.claim_parties(id) ON DELETE SET NULL;


--
-- Name: airdrop_invitations airdrop_invitations_resulting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_resulting_user_id_fkey FOREIGN KEY (resulting_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: airdrop_invitations airdrop_invitations_withdrawn_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_invitations
    ADD CONSTRAINT airdrop_invitations_withdrawn_by_user_id_fkey FOREIGN KEY (withdrawn_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: anfragen anfragen_disqualifiziert_durch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anfragen
    ADD CONSTRAINT anfragen_disqualifiziert_durch_fkey FOREIGN KEY (disqualifiziert_durch) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: anfragen anfragen_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anfragen
    ADD CONSTRAINT anfragen_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: anruf_log anruf_log_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anruf_log
    ADD CONSTRAINT anruf_log_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: anruf_log anruf_log_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anruf_log
    ADD CONSTRAINT anruf_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: auftraege auftraege_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auftraege
    ADD CONSTRAINT auftraege_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE SET NULL;


--
-- Name: auftraege auftraege_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auftraege
    ADD CONSTRAINT auftraege_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: auftraege auftraege_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auftraege
    ADD CONSTRAINT auftraege_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE RESTRICT;


--
-- Name: auftraege auftraege_vorheriger_auftrag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auftraege
    ADD CONSTRAINT auftraege_vorheriger_auftrag_id_fkey FOREIGN KEY (vorheriger_auftrag_id) REFERENCES public.auftraege(id) ON DELETE SET NULL;


--
-- Name: auth_remember_tokens auth_remember_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_remember_tokens
    ADD CONSTRAINT auth_remember_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: benachrichtigungen benachrichtigungen_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.benachrichtigungen
    ADD CONSTRAINT benachrichtigungen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: call_copilot_suggestions call_copilot_suggestions_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_copilot_suggestions
    ADD CONSTRAINT call_copilot_suggestions_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;


--
-- Name: call_transcription_utterances call_transcription_utterances_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transcription_utterances
    ADD CONSTRAINT call_transcription_utterances_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;


--
-- Name: calls calls_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: calls calls_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: claim_mietwagen claim_mietwagen_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_mietwagen
    ADD CONSTRAINT claim_mietwagen_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_mietwagen claim_mietwagen_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_mietwagen
    ADD CONSTRAINT claim_mietwagen_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claim_parties claim_parties_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_parties claim_parties_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claim_parties claim_parties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claim_parties claim_parties_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: claim_parties claim_parties_versicherung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_parties
    ADD CONSTRAINT claim_parties_versicherung_id_fkey FOREIGN KEY (versicherung_id) REFERENCES public.versicherungen(id) ON DELETE SET NULL;


--
-- Name: claim_payments claim_payments_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_payments
    ADD CONSTRAINT claim_payments_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_payments claim_payments_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_payments
    ADD CONSTRAINT claim_payments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claim_recency claim_recency_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_recency
    ADD CONSTRAINT claim_recency_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_vehicle_involvements claim_vehicle_involvements_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_vehicle_involvements
    ADD CONSTRAINT claim_vehicle_involvements_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_vehicle_involvements claim_vehicle_involvements_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_vehicle_involvements
    ADD CONSTRAINT claim_vehicle_involvements_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;


--
-- Name: claims claims_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claims claims_endzustand_gesetzt_durch_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_endzustand_gesetzt_durch_user_id_fkey FOREIGN KEY (endzustand_gesetzt_durch_user_id) REFERENCES public.profiles(id);


--
-- Name: claims claims_gegner_versicherung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_gegner_versicherung_id_fkey FOREIGN KEY (gegner_versicherung_id) REFERENCES public.versicherungen(id) ON DELETE SET NULL;


--
-- Name: claims claims_gegnerisches_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_gegnerisches_vehicle_id_fkey FOREIGN KEY (gegnerisches_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: claims claims_geschaedigter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_geschaedigter_user_id_fkey FOREIGN KEY (geschaedigter_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claims claims_kanzlei_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_kanzlei_abrechnung_id_fkey FOREIGN KEY (kanzlei_abrechnung_id) REFERENCES public.kanzlei_abrechnungen(id);


--
-- Name: claims claims_kundenbetreuer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_kundenbetreuer_id_fkey FOREIGN KEY (kundenbetreuer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claims claims_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: claims claims_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE SET NULL;


--
-- Name: claims claims_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;


--
-- Name: communities communities_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: community_leaderboard community_leaderboard_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_leaderboard
    ADD CONSTRAINT community_leaderboard_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisationen(id) ON DELETE CASCADE;


--
-- Name: community_leaderboard community_leaderboard_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_leaderboard
    ADD CONSTRAINT community_leaderboard_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: community_memberships community_memberships_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_memberships community_memberships_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: dokument_upload_anfragen dokument_upload_anfragen_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_upload_anfragen
    ADD CONSTRAINT dokument_upload_anfragen_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: dokument_upload_anfragen dokument_upload_anfragen_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_upload_anfragen
    ADD CONSTRAINT dokument_upload_anfragen_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: dsgvo_loeschauftraege dsgvo_loeschauftraege_bestaetigt_von_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsgvo_loeschauftraege
    ADD CONSTRAINT dsgvo_loeschauftraege_bestaetigt_von_user_id_fkey FOREIGN KEY (bestaetigt_von_user_id) REFERENCES auth.users(id);


--
-- Name: dsgvo_loeschauftraege dsgvo_loeschauftraege_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsgvo_loeschauftraege
    ADD CONSTRAINT dsgvo_loeschauftraege_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: email_log email_log_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: email_log email_log_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: email_otp_codes email_otp_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_otp_codes
    ADD CONSTRAINT email_otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: embed_abrechnung_positionen embed_abrechnung_positionen_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_abrechnung_positionen
    ADD CONSTRAINT embed_abrechnung_positionen_abrechnung_id_fkey FOREIGN KEY (abrechnung_id) REFERENCES public.abrechnungen(id) ON DELETE CASCADE;


--
-- Name: embed_abrechnung_positionen embed_abrechnung_positionen_anfrage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_abrechnung_positionen
    ADD CONSTRAINT embed_abrechnung_positionen_anfrage_id_fkey FOREIGN KEY (anfrage_id) REFERENCES public.gutachter_finder_anfragen(id) ON DELETE SET NULL;


--
-- Name: embed_abrechnung_positionen embed_abrechnung_positionen_embed_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_abrechnung_positionen
    ADD CONSTRAINT embed_abrechnung_positionen_embed_site_id_fkey FOREIGN KEY (embed_site_id) REFERENCES public.embed_sites(id) ON DELETE RESTRICT;


--
-- Name: embed_abrechnung_positionen embed_abrechnung_positionen_termin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_abrechnung_positionen
    ADD CONSTRAINT embed_abrechnung_positionen_termin_id_fkey FOREIGN KEY (termin_id) REFERENCES public.gutachter_termine(id) ON DELETE SET NULL;


--
-- Name: embed_sites embed_sites_inhaber_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sites
    ADD CONSTRAINT embed_sites_inhaber_profile_id_fkey FOREIGN KEY (inhaber_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: embed_sites embed_sites_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sites
    ADD CONSTRAINT embed_sites_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE SET NULL;


--
-- Name: faelle faelle_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE RESTRICT;


--
-- Name: faelle faelle_dispatch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_dispatch_id_fkey FOREIGN KEY (dispatch_id) REFERENCES public.profiles(id);


--
-- Name: faelle faelle_eskalation_tag_14_ergebnis_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_eskalation_tag_14_ergebnis_von_fkey FOREIGN KEY (eskalation_tag_14_ergebnis_von) REFERENCES public.profiles(id);


--
-- Name: faelle faelle_eskalation_tag_21_ergebnis_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_eskalation_tag_21_ergebnis_von_fkey FOREIGN KEY (eskalation_tag_21_ergebnis_von) REFERENCES public.profiles(id);


--
-- Name: faelle faelle_eskalation_tag_28_ergebnis_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_eskalation_tag_28_ergebnis_von_fkey FOREIGN KEY (eskalation_tag_28_ergebnis_von) REFERENCES public.profiles(id);


--
-- Name: faelle faelle_eskaliert_an_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_eskaliert_an_admin_id_fkey FOREIGN KEY (eskaliert_an_admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: faelle faelle_kanzlei_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_kanzlei_abrechnung_id_fkey FOREIGN KEY (kanzlei_abrechnung_id) REFERENCES public.kanzlei_abrechnungen(id);


--
-- Name: faelle faelle_kunde_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_kunde_id_fkey FOREIGN KEY (kunde_id) REFERENCES public.profiles(id);


--
-- Name: faelle faelle_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: faelle faelle_makler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_makler_id_fkey FOREIGN KEY (makler_id) REFERENCES public.makler(id);


--
-- Name: faelle faelle_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisationen(id) ON DELETE SET NULL;


--
-- Name: faelle faelle_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faelle
    ADD CONSTRAINT faelle_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: fall_dokumente fall_dokumente_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_dokumente
    ADD CONSTRAINT fall_dokumente_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE SET NULL;


--
-- Name: fall_dokumente fall_dokumente_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_dokumente
    ADD CONSTRAINT fall_dokumente_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: fall_dokumente fall_dokumente_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_dokumente
    ADD CONSTRAINT fall_dokumente_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: fall_dokumente fall_dokumente_pflichtdokument_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_dokumente
    ADD CONSTRAINT fall_dokumente_pflichtdokument_id_fkey FOREIGN KEY (pflichtdokument_id) REFERENCES public.pflichtdokumente(id) ON DELETE SET NULL;


--
-- Name: fall_dokumente fall_dokumente_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_dokumente
    ADD CONSTRAINT fall_dokumente_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.schadenspositionen(id) ON DELETE SET NULL;


--
-- Name: fall_read_state fall_read_state_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_read_state
    ADD CONSTRAINT fall_read_state_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: fall_read_state fall_read_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_read_state
    ADD CONSTRAINT fall_read_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fall_summaries fall_summaries_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_summaries
    ADD CONSTRAINT fall_summaries_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: fall_summaries fall_summaries_generated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fall_summaries
    ADD CONSTRAINT fall_summaries_generated_by_user_id_fkey FOREIGN KEY (generated_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gutachten fk_gutachten_ocr_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT fk_gutachten_ocr_run FOREIGN KEY (ocr_run_id) REFERENCES public.ocr_runs(id) ON DELETE SET NULL;


--
-- Name: sachverstaendige fk_organisation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sachverstaendige
    ADD CONSTRAINT fk_organisation FOREIGN KEY (organisation_id) REFERENCES public.organisationen(id);


--
-- Name: flow_links flow_links_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_links
    ADD CONSTRAINT flow_links_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: flow_links flow_links_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_links
    ADD CONSTRAINT flow_links_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: forderungspositionen forderungspositionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forderungspositionen
    ADD CONSTRAINT forderungspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: gebiet_exklusivitaeten gebiet_exklusivitaeten_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebiet_exklusivitaeten
    ADD CONSTRAINT gebiet_exklusivitaeten_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisationen(id) ON DELETE CASCADE;


--
-- Name: google_bewertungen_cache google_bewertungen_cache_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_bewertungen_cache
    ADD CONSTRAINT google_bewertungen_cache_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gutachten gutachten_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: gutachten gutachten_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gutachten_fotos gutachten_fotos_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_fotos
    ADD CONSTRAINT gutachten_fotos_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: gutachten_fotos gutachten_fotos_gutachten_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_fotos
    ADD CONSTRAINT gutachten_fotos_gutachten_id_fkey FOREIGN KEY (gutachten_id) REFERENCES public.gutachten(id) ON DELETE CASCADE;


--
-- Name: gutachten_fotos gutachten_fotos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_fotos
    ADD CONSTRAINT gutachten_fotos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gutachten gutachten_laeufer_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_laeufer_report_id_fkey FOREIGN KEY (laeufer_report_id) REFERENCES public.sv_organisation_laeufer_reports(id) ON DELETE SET NULL;


--
-- Name: gutachten gutachten_pdf_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_pdf_uploaded_by_user_id_fkey FOREIGN KEY (pdf_uploaded_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gutachten_positionen gutachten_positionen_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_positionen
    ADD CONSTRAINT gutachten_positionen_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: gutachten_positionen gutachten_positionen_gutachten_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten_positionen
    ADD CONSTRAINT gutachten_positionen_gutachten_id_fkey FOREIGN KEY (gutachten_id) REFERENCES public.gutachten(id) ON DELETE CASCADE;


--
-- Name: gutachten gutachten_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachten
    ADD CONSTRAINT gutachten_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE RESTRICT;


--
-- Name: gutachter_abrechnungen gutachter_abrechnungen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_abrechnungen
    ADD CONSTRAINT gutachter_abrechnungen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: gutachter_abrechnungen gutachter_abrechnungen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_abrechnungen
    ADD CONSTRAINT gutachter_abrechnungen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_abrechnungspositionen gutachter_abrechnungspositionen_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_abrechnungspositionen
    ADD CONSTRAINT gutachter_abrechnungspositionen_abrechnung_id_fkey FOREIGN KEY (abrechnung_id) REFERENCES public.gutachter_monatsabrechnungen(id);


--
-- Name: gutachter_abrechnungspositionen gutachter_abrechnungspositionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_abrechnungspositionen
    ADD CONSTRAINT gutachter_abrechnungspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: gutachter_einzahlungen gutachter_einzahlungen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_einzahlungen
    ADD CONSTRAINT gutachter_einzahlungen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_abrechnung_id_fkey FOREIGN KEY (abrechnung_id) REFERENCES public.abrechnungen(id) ON DELETE SET NULL;


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_embed_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_embed_site_id_fkey FOREIGN KEY (embed_site_id) REFERENCES public.embed_sites(id) ON DELETE SET NULL;


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey FOREIGN KEY (konvertiert_zu_fall_id) REFERENCES public.faelle(id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey FOREIGN KEY (konvertiert_zu_lead_id) REFERENCES public.leads(id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_konvertiert_zu_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_konvertiert_zu_user_id_fkey FOREIGN KEY (konvertiert_zu_user_id) REFERENCES auth.users(id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_reservierter_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_reservierter_sv_id_fkey FOREIGN KEY (reservierter_sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_termin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_termin_id_fkey FOREIGN KEY (termin_id) REFERENCES public.gutachter_termine(id) ON DELETE SET NULL;


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_zugeordneter_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_zugeordneter_sv_id_fkey FOREIGN KEY (zugeordneter_sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_finder_anfragen gutachter_finder_anfragen_zugeordneter_sv_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_finder_anfragen
    ADD CONSTRAINT gutachter_finder_anfragen_zugeordneter_sv_lead_id_fkey FOREIGN KEY (zugeordneter_sv_lead_id) REFERENCES public.sv_leads(id);


--
-- Name: gutachter_mitteilungen gutachter_mitteilungen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_mitteilungen
    ADD CONSTRAINT gutachter_mitteilungen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: gutachter_mitteilungen gutachter_mitteilungen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_mitteilungen
    ADD CONSTRAINT gutachter_mitteilungen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_monatsabrechnungen gutachter_monatsabrechnungen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_monatsabrechnungen
    ADD CONSTRAINT gutachter_monatsabrechnungen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_termine gutachter_termine_auftrag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_auftrag_id_fkey FOREIGN KEY (auftrag_id) REFERENCES public.auftraege(id) ON DELETE SET NULL;


--
-- Name: gutachter_termine gutachter_termine_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE SET NULL;


--
-- Name: gutachter_termine gutachter_termine_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: gutachter_termine gutachter_termine_kb_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES public.profiles(id);


--
-- Name: gutachter_termine gutachter_termine_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: gutachter_termine gutachter_termine_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: gutachter_termine gutachter_termine_sv_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_sv_lead_id_fkey FOREIGN KEY (sv_lead_id) REFERENCES public.sv_leads(id) ON DELETE SET NULL;


--
-- Name: gutachter_termine gutachter_termine_verlegung_quelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_termine
    ADD CONSTRAINT gutachter_termine_verlegung_quelle_id_fkey FOREIGN KEY (verlegung_quelle_id) REFERENCES public.gutachter_termine(id) ON DELETE SET NULL;


--
-- Name: gutachter_waitlist gutachter_waitlist_bearbeitet_von_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_waitlist
    ADD CONSTRAINT gutachter_waitlist_bearbeitet_von_user_id_fkey FOREIGN KEY (bearbeitet_von_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: gutachter_waitlist gutachter_waitlist_konvertiert_zu_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutachter_waitlist
    ADD CONSTRAINT gutachter_waitlist_konvertiert_zu_sv_id_fkey FOREIGN KEY (konvertiert_zu_sv_id) REFERENCES public.sachverstaendige(id) ON DELETE SET NULL;


--
-- Name: gutschriften gutschriften_referenz_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutschriften
    ADD CONSTRAINT gutschriften_referenz_abrechnung_id_fkey FOREIGN KEY (referenz_abrechnung_id) REFERENCES public.abrechnungen(id);


--
-- Name: gutschriften gutschriften_referenz_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutschriften
    ADD CONSTRAINT gutschriften_referenz_fall_id_fkey FOREIGN KEY (referenz_fall_id) REFERENCES public.faelle(id);


--
-- Name: gutschriften gutschriften_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gutschriften
    ADD CONSTRAINT gutschriften_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: incentive_auszahlungen incentive_auszahlungen_incentive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incentive_auszahlungen
    ADD CONSTRAINT incentive_auszahlungen_incentive_id_fkey FOREIGN KEY (incentive_id) REFERENCES public.incentives(id) ON DELETE CASCADE;


--
-- Name: incentive_auszahlungen incentive_auszahlungen_mitarbeiter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incentive_auszahlungen
    ADD CONSTRAINT incentive_auszahlungen_mitarbeiter_id_fkey FOREIGN KEY (mitarbeiter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: individuelle_anfragen individuelle_anfragen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individuelle_anfragen
    ADD CONSTRAINT individuelle_anfragen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: kanzlei_abrechnung_positionen kanzlei_abrechnung_positionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnung_positionen
    ADD CONSTRAINT kanzlei_abrechnung_positionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: kanzlei_abrechnung_positionen kanzlei_abrechnung_positionen_kanzlei_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnung_positionen
    ADD CONSTRAINT kanzlei_abrechnung_positionen_kanzlei_abrechnung_id_fkey FOREIGN KEY (kanzlei_abrechnung_id) REFERENCES public.kanzlei_abrechnungen(id) ON DELETE CASCADE;


--
-- Name: kanzlei_abrechnung_reminders kanzlei_abrechnung_reminders_kanzlei_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnung_reminders
    ADD CONSTRAINT kanzlei_abrechnung_reminders_kanzlei_abrechnung_id_fkey FOREIGN KEY (kanzlei_abrechnung_id) REFERENCES public.kanzlei_abrechnungen(id) ON DELETE CASCADE;


--
-- Name: kanzlei_abrechnungen kanzlei_abrechnungen_kanzlei_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_abrechnungen
    ADD CONSTRAINT kanzlei_abrechnungen_kanzlei_id_fkey FOREIGN KEY (kanzlei_id) REFERENCES public.kanzleien(id);


--
-- Name: kanzlei_admin_termine kanzlei_admin_termine_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_admin_termine
    ADD CONSTRAINT kanzlei_admin_termine_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: kanzlei_admin_termine kanzlei_admin_termine_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_admin_termine
    ADD CONSTRAINT kanzlei_admin_termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: kanzlei_admin_termine kanzlei_admin_termine_kanzlei_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_admin_termine
    ADD CONSTRAINT kanzlei_admin_termine_kanzlei_user_id_fkey FOREIGN KEY (kanzlei_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kanzlei_faelle kanzlei_faelle_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_faelle
    ADD CONSTRAINT kanzlei_faelle_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: kanzlei_faelle kanzlei_faelle_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_faelle
    ADD CONSTRAINT kanzlei_faelle_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: kanzlei_pakete kanzlei_pakete_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_pakete
    ADD CONSTRAINT kanzlei_pakete_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: kanzlei_pakete kanzlei_pakete_versendet_durch_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanzlei_pakete
    ADD CONSTRAINT kanzlei_pakete_versendet_durch_user_id_fkey FOREIGN KEY (versendet_durch_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ki_gespraeche ki_gespraeche_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ki_gespraeche
    ADD CONSTRAINT ki_gespraeche_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: ki_gespraeche ki_gespraeche_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ki_gespraeche
    ADD CONSTRAINT ki_gespraeche_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: kunde_gutachten_requests kunde_gutachten_requests_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_gutachten_requests
    ADD CONSTRAINT kunde_gutachten_requests_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: kunde_live_position kunde_live_position_kunde_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_live_position
    ADD CONSTRAINT kunde_live_position_kunde_id_fkey FOREIGN KEY (kunde_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kunde_live_position kunde_live_position_termin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kunde_live_position
    ADD CONSTRAINT kunde_live_position_termin_id_fkey FOREIGN KEY (termin_id) REFERENCES public.gutachter_termine(id) ON DELETE CASCADE;


--
-- Name: lead_historie lead_historie_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_historie
    ADD CONSTRAINT lead_historie_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leads leads_gegner_versicherung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_gegner_versicherung_id_fkey FOREIGN KEY (gegner_versicherung_id) REFERENCES public.versicherungen(id) ON DELETE SET NULL;


--
-- Name: leads leads_konvertiert_durch_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_konvertiert_durch_user_id_fkey FOREIGN KEY (konvertiert_durch_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_konvertiert_zu_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_konvertiert_zu_claim_id_fkey FOREIGN KEY (konvertiert_zu_claim_id) REFERENCES public.claims(id) ON DELETE SET NULL;


--
-- Name: leads leads_konvertiert_zu_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_konvertiert_zu_fall_id_fkey FOREIGN KEY (konvertiert_zu_fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: leads leads_kunde_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_kunde_id_fkey FOREIGN KEY (kunde_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_promotion_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_codes(id);


--
-- Name: leads leads_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: leads leads_zugewiesen_an_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_zugewiesen_an_fk FOREIGN KEY (zugewiesen_an) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: makler makler_aktiviert_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler
    ADD CONSTRAINT makler_aktiviert_von_fkey FOREIGN KEY (aktiviert_von) REFERENCES auth.users(id);


--
-- Name: makler_fall_consent makler_fall_consent_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_fall_consent
    ADD CONSTRAINT makler_fall_consent_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: makler_fall_consent makler_fall_consent_makler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_fall_consent
    ADD CONSTRAINT makler_fall_consent_makler_id_fkey FOREIGN KEY (makler_id) REFERENCES public.makler(id) ON DELETE CASCADE;


--
-- Name: makler_fall_consent makler_fall_consent_widerrufen_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_fall_consent
    ADD CONSTRAINT makler_fall_consent_widerrufen_von_fkey FOREIGN KEY (widerrufen_von) REFERENCES auth.users(id);


--
-- Name: makler_provisionen makler_provisionen_abrechnung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_provisionen
    ADD CONSTRAINT makler_provisionen_abrechnung_id_fkey FOREIGN KEY (abrechnung_id) REFERENCES public.abrechnungen(id);


--
-- Name: makler_provisionen makler_provisionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_provisionen
    ADD CONSTRAINT makler_provisionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: makler_provisionen makler_provisionen_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_provisionen
    ADD CONSTRAINT makler_provisionen_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: makler_provisionen makler_provisionen_makler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_provisionen
    ADD CONSTRAINT makler_provisionen_makler_id_fkey FOREIGN KEY (makler_id) REFERENCES public.makler(id);


--
-- Name: makler_provisionen makler_provisionen_promotion_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler_provisionen
    ADD CONSTRAINT makler_provisionen_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_codes(id);


--
-- Name: makler makler_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.makler
    ADD CONSTRAINT makler_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: matelso_calls matelso_calls_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matelso_calls
    ADD CONSTRAINT matelso_calls_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: matelso_calls matelso_calls_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matelso_calls
    ADD CONSTRAINT matelso_calls_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: mitarbeiter_performance mitarbeiter_performance_mitarbeiter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitarbeiter_performance
    ADD CONSTRAINT mitarbeiter_performance_mitarbeiter_id_fkey FOREIGN KEY (mitarbeiter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mitteilungen mitteilungen_absender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitteilungen
    ADD CONSTRAINT mitteilungen_absender_id_fkey FOREIGN KEY (absender_id) REFERENCES public.profiles(id);


--
-- Name: mitteilungen mitteilungen_empfaenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitteilungen
    ADD CONSTRAINT mitteilungen_empfaenger_id_fkey FOREIGN KEY (empfaenger_id) REFERENCES public.profiles(id);


--
-- Name: nachrichten nachrichten_empfaenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nachrichten
    ADD CONSTRAINT nachrichten_empfaenger_id_fkey FOREIGN KEY (empfaenger_id) REFERENCES auth.users(id);


--
-- Name: nachrichten nachrichten_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nachrichten
    ADD CONSTRAINT nachrichten_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: nachrichten nachrichten_kb_empfaenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nachrichten
    ADD CONSTRAINT nachrichten_kb_empfaenger_id_fkey FOREIGN KEY (kb_empfaenger_id) REFERENCES auth.users(id);


--
-- Name: nachrichten nachrichten_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nachrichten
    ADD CONSTRAINT nachrichten_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: nachrichten nachrichten_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nachrichten
    ADD CONSTRAINT nachrichten_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: notification_deliveries notification_deliveries_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.notification_events(id) ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notification_events notification_events_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: notification_events notification_events_triggered_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ocr_runs ocr_runs_gutachten_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_runs
    ADD CONSTRAINT ocr_runs_gutachten_id_fkey FOREIGN KEY (gutachten_id) REFERENCES public.gutachten(id) ON DELETE CASCADE;


--
-- Name: ocr_runs ocr_runs_triggered_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_runs
    ADD CONSTRAINT ocr_runs_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: onboarding_felder onboarding_felder_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_felder
    ADD CONSTRAINT onboarding_felder_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.onboarding_phasen(id) ON DELETE CASCADE;


--
-- Name: organisationen organisationen_parent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisationen
    ADD CONSTRAINT organisationen_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES public.profiles(id);


--
-- Name: organisationen organisationen_vertrag_unterzeichnet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisationen
    ADD CONSTRAINT organisationen_vertrag_unterzeichnet_id_fkey FOREIGN KEY (vertrag_unterzeichnet_id) REFERENCES public.vertraege_unterzeichnet(id);


--
-- Name: paket_upgrades paket_upgrades_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paket_upgrades
    ADD CONSTRAINT paket_upgrades_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: parteien parteien_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parteien
    ADD CONSTRAINT parteien_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: personenschaden_personen personenschaden_personen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personenschaden_personen
    ADD CONSTRAINT personenschaden_personen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: personenschaden_personen personenschaden_personen_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personenschaden_personen
    ADD CONSTRAINT personenschaden_personen_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: pflichtdokumente pflichtdokumente_angefordert_von_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pflichtdokumente
    ADD CONSTRAINT pflichtdokumente_angefordert_von_user_id_fkey FOREIGN KEY (angefordert_von_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pflichtdokumente pflichtdokumente_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pflichtdokumente
    ADD CONSTRAINT pflichtdokumente_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: pflichtdokumente pflichtdokumente_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pflichtdokumente
    ADD CONSTRAINT pflichtdokumente_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.personenschaden_personen(id) ON DELETE CASCADE;


--
-- Name: pflichtdokumente pflichtdokumente_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pflichtdokumente
    ADD CONSTRAINT pflichtdokumente_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: phase_transitions phase_transitions_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase_transitions
    ADD CONSTRAINT phase_transitions_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: phase_transitions phase_transitions_transitioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase_transitions
    ADD CONSTRAINT phase_transitions_transitioned_by_fkey FOREIGN KEY (transitioned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_entstanden_aus_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_entstanden_aus_airdrop_id_fkey FOREIGN KEY (entstanden_aus_airdrop_id) REFERENCES public.airdrop_invitations(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_entstanden_aus_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_entstanden_aus_claim_id_fkey FOREIGN KEY (entstanden_aus_claim_id) REFERENCES public.claims(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: promo_clicks promo_clicks_promotion_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_clicks
    ADD CONSTRAINT promo_clicks_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_codes(id) ON DELETE CASCADE;


--
-- Name: promotion_codes promotion_codes_makler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_codes
    ADD CONSTRAINT promotion_codes_makler_id_fkey FOREIGN KEY (makler_id) REFERENCES public.makler(id) ON DELETE CASCADE;


--
-- Name: provisionen_maik provisionen_maik_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provisionen_maik
    ADD CONSTRAINT provisionen_maik_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qc_checkliste qc_checkliste_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checkliste
    ADD CONSTRAINT qc_checkliste_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: qc_checkliste qc_checkliste_geprueft_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checkliste
    ADD CONSTRAINT qc_checkliste_geprueft_von_fkey FOREIGN KEY (geprueft_von) REFERENCES public.profiles(id);


--
-- Name: regulierungs_klassifizierung regulierungs_klassifizierung_erfasst_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulierungs_klassifizierung
    ADD CONSTRAINT regulierungs_klassifizierung_erfasst_von_fkey FOREIGN KEY (erfasst_von) REFERENCES auth.users(id);


--
-- Name: regulierungs_klassifizierung regulierungs_klassifizierung_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulierungs_klassifizierung
    ADD CONSTRAINT regulierungs_klassifizierung_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: reklamationen reklamationen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reklamationen
    ADD CONSTRAINT reklamationen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: reklamationen reklamationen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reklamationen
    ADD CONSTRAINT reklamationen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id);


--
-- Name: repairs repairs_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repairs
    ADD CONSTRAINT repairs_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: repairs repairs_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repairs
    ADD CONSTRAINT repairs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: repairs repairs_gutachten_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repairs
    ADD CONSTRAINT repairs_gutachten_id_fkey FOREIGN KEY (gutachten_id) REFERENCES public.gutachten(id) ON DELETE SET NULL;


--
-- Name: repairs repairs_werkstatt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repairs
    ADD CONSTRAINT repairs_werkstatt_id_fkey FOREIGN KEY (werkstatt_id) REFERENCES public.werkstaetten(id) ON DELETE SET NULL;


--
-- Name: sachverstaendige sachverstaendige_gesperrt_von_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sachverstaendige
    ADD CONSTRAINT sachverstaendige_gesperrt_von_user_id_fkey FOREIGN KEY (gesperrt_von_user_id) REFERENCES public.profiles(id);


--
-- Name: sachverstaendige sachverstaendige_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sachverstaendige
    ADD CONSTRAINT sachverstaendige_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sachverstaendige sachverstaendige_sa_vorlage_geprueft_von_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sachverstaendige
    ADD CONSTRAINT sachverstaendige_sa_vorlage_geprueft_von_user_id_fkey FOREIGN KEY (sa_vorlage_geprueft_von_user_id) REFERENCES public.profiles(id);


--
-- Name: sachverstaendige sachverstaendige_verifiziert_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sachverstaendige
    ADD CONSTRAINT sachverstaendige_verifiziert_von_fkey FOREIGN KEY (verifiziert_von) REFERENCES public.profiles(id);


--
-- Name: schadenspositionen schadenspositionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schadenspositionen
    ADD CONSTRAINT schadenspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: sla_tracking sla_tracking_eskalation_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_tracking
    ADD CONSTRAINT sla_tracking_eskalation_task_id_fkey FOREIGN KEY (eskalation_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: sla_tracking sla_tracking_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_tracking
    ADD CONSTRAINT sla_tracking_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: stripe_events stripe_events_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_events
    ADD CONSTRAINT stripe_events_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE SET NULL;


--
-- Name: support_rate_limits support_rate_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_rate_limits
    ADD CONSTRAINT support_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_ticket_log support_ticket_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_log
    ADD CONSTRAINT support_ticket_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sv_buero_memberships sv_buero_memberships_buero_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_buero_memberships
    ADD CONSTRAINT sv_buero_memberships_buero_id_fkey FOREIGN KEY (buero_id) REFERENCES public.sv_buero(id) ON DELETE CASCADE;


--
-- Name: sv_buero_memberships sv_buero_memberships_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_buero_memberships
    ADD CONSTRAINT sv_buero_memberships_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_kalender_events_cache sv_kalender_events_cache_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_events_cache
    ADD CONSTRAINT sv_kalender_events_cache_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_kalender_verbindungen sv_kalender_verbindungen_fehler_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_verbindungen
    ADD CONSTRAINT sv_kalender_verbindungen_fehler_task_id_fkey FOREIGN KEY (fehler_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: sv_kalender_verbindungen sv_kalender_verbindungen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_kalender_verbindungen
    ADD CONSTRAINT sv_kalender_verbindungen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_live_location sv_live_location_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_live_location
    ADD CONSTRAINT sv_live_location_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: sv_live_location sv_live_location_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_live_location
    ADD CONSTRAINT sv_live_location_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_live_position sv_live_position_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_live_position
    ADD CONSTRAINT sv_live_position_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_onboarding_rechnungen sv_onboarding_rechnungen_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_onboarding_rechnungen
    ADD CONSTRAINT sv_onboarding_rechnungen_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisationen(id) ON DELETE SET NULL;


--
-- Name: sv_onboarding_rechnungen sv_onboarding_rechnungen_rechnungs_konfiguration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_onboarding_rechnungen
    ADD CONSTRAINT sv_onboarding_rechnungen_rechnungs_konfiguration_id_fkey FOREIGN KEY (rechnungs_konfiguration_id) REFERENCES public.rechnungs_konfiguration(id);


--
-- Name: sv_onboarding_rechnungen sv_onboarding_rechnungen_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_onboarding_rechnungen
    ADD CONSTRAINT sv_onboarding_rechnungen_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE SET NULL;


--
-- Name: sv_organisation sv_organisation_inhaber_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation
    ADD CONSTRAINT sv_organisation_inhaber_sv_id_fkey FOREIGN KEY (inhaber_sv_id) REFERENCES public.sachverstaendige(id) ON DELETE RESTRICT;


--
-- Name: sv_organisation_laeufer_reports sv_organisation_laeufer_reports_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_laeufer_reports
    ADD CONSTRAINT sv_organisation_laeufer_reports_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: sv_organisation_laeufer_reports sv_organisation_laeufer_reports_laeufer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_laeufer_reports
    ADD CONSTRAINT sv_organisation_laeufer_reports_laeufer_user_id_fkey FOREIGN KEY (laeufer_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sv_organisation_laeufer_reports sv_organisation_laeufer_reports_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_laeufer_reports
    ADD CONSTRAINT sv_organisation_laeufer_reports_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.sv_organisation(id) ON DELETE CASCADE;


--
-- Name: sv_organisation_memberships sv_organisation_memberships_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_memberships
    ADD CONSTRAINT sv_organisation_memberships_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.sv_organisation(id) ON DELETE CASCADE;


--
-- Name: sv_organisation_memberships sv_organisation_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_organisation_memberships
    ADD CONSTRAINT sv_organisation_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sv_payment_reminders sv_payment_reminders_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_payment_reminders
    ADD CONSTRAINT sv_payment_reminders_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_private_stops sv_private_stops_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_private_stops
    ADD CONSTRAINT sv_private_stops_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: sv_tages_session sv_tages_session_aktueller_termin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_tages_session
    ADD CONSTRAINT sv_tages_session_aktueller_termin_id_fkey FOREIGN KEY (aktueller_termin_id) REFERENCES public.gutachter_termine(id) ON DELETE SET NULL;


--
-- Name: sv_tages_session sv_tages_session_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sv_tages_session
    ADD CONSTRAINT sv_tages_session_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: task_reminders task_reminders_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_erstellt_von_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_erstellt_von_id_fkey FOREIGN KEY (erstellt_von_id) REFERENCES auth.users(id);


--
-- Name: tasks tasks_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_gate_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_gate_task_id_fkey FOREIGN KEY (gate_task_id) REFERENCES public.tasks(id);


--
-- Name: tasks tasks_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: tasks tasks_zugewiesen_an_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_zugewiesen_an_fkey FOREIGN KEY (zugewiesen_an) REFERENCES public.profiles(id);


--
-- Name: technische_probleme technische_probleme_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technische_probleme
    ADD CONSTRAINT technische_probleme_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id);


--
-- Name: termin_reminders termin_reminders_termin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termin_reminders
    ADD CONSTRAINT termin_reminders_termin_id_fkey FOREIGN KEY (termin_id) REFERENCES public.gutachter_termine(id) ON DELETE CASCADE;


--
-- Name: termine termine_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termine
    ADD CONSTRAINT termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: timeline timeline_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline
    ADD CONSTRAINT timeline_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: timeline timeline_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline
    ADD CONSTRAINT timeline_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: timeline timeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline
    ADD CONSTRAINT timeline_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: vehicle_ownership_history vehicle_ownership_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_ownership_history
    ADD CONSTRAINT vehicle_ownership_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vehicle_ownership_history vehicle_ownership_history_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_ownership_history
    ADD CONSTRAINT vehicle_ownership_history_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: vehicles vehicles_current_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_current_owner_id_fkey FOREIGN KEY (current_owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_zb1_dokument_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_zb1_dokument_id_fkey FOREIGN KEY (zb1_dokument_id) REFERENCES public.fall_dokumente(id) ON DELETE SET NULL;


--
-- Name: vertraege_unterzeichnet vertraege_unterzeichnet_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vertraege_unterzeichnet
    ADD CONSTRAINT vertraege_unterzeichnet_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisationen(id) ON DELETE SET NULL;


--
-- Name: vertraege_unterzeichnet vertraege_unterzeichnet_sv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vertraege_unterzeichnet
    ADD CONSTRAINT vertraege_unterzeichnet_sv_id_fkey FOREIGN KEY (sv_id) REFERENCES public.sachverstaendige(id) ON DELETE CASCADE;


--
-- Name: vertraege_unterzeichnet vertraege_unterzeichnet_vorlage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vertraege_unterzeichnet
    ADD CONSTRAINT vertraege_unterzeichnet_vorlage_id_fkey FOREIGN KEY (vorlage_id) REFERENCES public.vertragsvorlagen(id);


--
-- Name: vs_korrespondenz vs_korrespondenz_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vs_korrespondenz
    ADD CONSTRAINT vs_korrespondenz_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: vs_korrespondenz vs_korrespondenz_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vs_korrespondenz
    ADD CONSTRAINT vs_korrespondenz_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: webhook_events webhook_events_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE SET NULL;


--
-- Name: webhook_events webhook_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: whatsapp_inbound_messages whatsapp_inbound_messages_matched_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbound_messages
    ADD CONSTRAINT whatsapp_inbound_messages_matched_fall_id_fkey FOREIGN KEY (matched_fall_id) REFERENCES public.faelle(id);


--
-- Name: whatsapp_inbound_messages whatsapp_inbound_messages_matched_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbound_messages
    ADD CONSTRAINT whatsapp_inbound_messages_matched_lead_id_fkey FOREIGN KEY (matched_lead_id) REFERENCES public.leads(id);


--
-- Name: whatsapp_inbound_messages whatsapp_inbound_messages_matched_termin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbound_messages
    ADD CONSTRAINT whatsapp_inbound_messages_matched_termin_id_fkey FOREIGN KEY (matched_termin_id) REFERENCES public.gutachter_termine(id);


--
-- Name: zahlungseingaenge zahlungseingaenge_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zahlungseingaenge
    ADD CONSTRAINT zahlungseingaenge_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: zahlungspositionen zahlungspositionen_fall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zahlungspositionen
    ADD CONSTRAINT zahlungspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle(id) ON DELETE CASCADE;


--
-- Name: zahlungspositionen zahlungspositionen_zahlung_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zahlungspositionen
    ADD CONSTRAINT zahlungspositionen_zahlung_id_fkey FOREIGN KEY (zahlung_id) REFERENCES public.zahlungseingaenge(id) ON DELETE CASCADE;


--
-- Name: community_leaderboard Admin full access community_leaderboard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin full access community_leaderboard" ON public.community_leaderboard USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: gebiet_exklusivitaeten Admin full access gebiet_exklusivitaeten; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin full access gebiet_exklusivitaeten" ON public.gebiet_exklusivitaeten USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: gutachter_monatsabrechnungen Admin volle Abrechnungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin volle Abrechnungen" ON public.gutachter_monatsabrechnungen USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))));


--
-- Name: gutachter_abrechnungspositionen Admin volle Positionen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin volle Positionen" ON public.gutachter_abrechnungspositionen USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))));


--
-- Name: organisationen Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.organisationen USING ((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::public.user_role));


--
-- Name: parteien Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.parteien TO authenticated USING (public.is_admin());


--
-- Name: pflichtdokumente Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.pflichtdokumente USING ((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::public.user_role));


--
-- Name: sachverstaendige Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.sachverstaendige TO authenticated USING (public.is_admin());


--
-- Name: schadenspositionen Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.schadenspositionen TO authenticated USING (public.is_admin());


--
-- Name: settings Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.settings TO authenticated USING (public.is_admin());


--
-- Name: timeline Admins full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access" ON public.timeline TO authenticated USING (public.is_admin());


--
-- Name: branchen_benchmarks Authenticated users can read branchen_benchmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read branchen_benchmarks" ON public.branchen_benchmarks FOR SELECT TO authenticated USING (true);


--
-- Name: benachrichtigungen Eigene lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Eigene lesen" ON public.benachrichtigungen FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: benachrichtigungen Eigene updaten; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Eigene updaten" ON public.benachrichtigungen FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: leads Flow anon select leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Flow anon select leads" ON public.leads FOR SELECT TO anon USING ((status = 'flow-gesendet'::public.lead_status));


--
-- Name: qc_checkliste Gutachter read own qc_checkliste; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gutachter read own qc_checkliste" ON public.qc_checkliste FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((f.id = qc_checkliste.fall_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: kanzlei_admin_termine Kanzlei legt Termine an; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kanzlei legt Termine an" ON public.kanzlei_admin_termine FOR INSERT WITH CHECK (((kanzlei_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kanzlei'::public.user_role))))));


--
-- Name: fall_dokumente Kanzlei liest fall_dokumente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kanzlei liest fall_dokumente" ON public.fall_dokumente FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.faelle
     JOIN public.profiles ON ((profiles.id = ( SELECT auth.uid() AS uid))))
  WHERE ((faelle.id = fall_dokumente.fall_id) AND (profiles.rolle = 'kanzlei'::public.user_role) AND (faelle.service_typ = 'komplett'::text)))));


--
-- Name: gutachter_termine Kanzlei liest gutachter_termine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kanzlei liest gutachter_termine" ON public.gutachter_termine FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.faelle
     JOIN public.profiles ON ((profiles.id = ( SELECT auth.uid() AS uid))))
  WHERE ((faelle.id = gutachter_termine.fall_id) AND (profiles.rolle = 'kanzlei'::public.user_role) AND (faelle.service_typ = 'komplett'::text)))));


--
-- Name: timeline Kanzlei liest timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kanzlei liest timeline" ON public.timeline FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.faelle
     JOIN public.profiles ON ((profiles.id = ( SELECT auth.uid() AS uid))))
  WHERE ((faelle.id = timeline.fall_id) AND (profiles.rolle = 'kanzlei'::public.user_role) AND (faelle.service_typ = 'komplett'::text)))));


--
-- Name: kanzlei_admin_termine Kanzlei saegt eigene Termine ab; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kanzlei saegt eigene Termine ab" ON public.kanzlei_admin_termine FOR UPDATE USING (((kanzlei_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kanzlei'::public.user_role)))))) WITH CHECK ((kanzlei_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: pflichtdokumente Kunden eigene Dokumente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kunden eigene Dokumente" ON public.pflichtdokumente FOR SELECT USING ((fall_id IN ( SELECT faelle.id
   FROM public.faelle
  WHERE (faelle.kunde_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: provisionen_maik Mitarbeiter provisionen_maik; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mitarbeiter provisionen_maik" ON public.provisionen_maik USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: profiles Profil bearbeiten; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profil bearbeiten" ON public.profiles FOR UPDATE TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));


--
-- Name: profiles Profil erstellen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profil erstellen" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: POLICY "Profil erstellen" ON profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Profil erstellen" ON public.profiles IS 'AAR-perf 15.05.2026: auth.uid() in (select)-Wrap für InitPlan-Caching.';


--
-- Name: profiles Profil lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profil lesen" ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));


--
-- Name: gutachter_monatsabrechnungen SV eigene Abrechnungen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SV eigene Abrechnungen lesen" ON public.gutachter_monatsabrechnungen FOR SELECT USING ((sv_id IN ( SELECT s.id
   FROM public.sachverstaendige s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: fall_dokumente SV eigene Fall-Dokumente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SV eigene Fall-Dokumente" ON public.fall_dokumente USING ((fall_id IN ( SELECT faelle.id
   FROM public.faelle
  WHERE (faelle.sv_id IN ( SELECT sachverstaendige.id
           FROM public.sachverstaendige
          WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: gutachter_abrechnungspositionen SV eigene Positionen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SV eigene Positionen lesen" ON public.gutachter_abrechnungspositionen FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.gutachter_monatsabrechnungen m
  WHERE ((m.id = gutachter_abrechnungspositionen.abrechnung_id) AND (m.sv_id IN ( SELECT s.id
           FROM public.sachverstaendige s
          WHERE (s.profile_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: paket_upgrades SV eigene Upgrades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SV eigene Upgrades" ON public.paket_upgrades TO authenticated USING (((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role))))));


--
-- Name: community_leaderboard SV sieht eigene Community; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SV sieht eigene Community" ON public.community_leaderboard FOR SELECT USING ((organisation_id IN ( SELECT sachverstaendige.organisation_id
   FROM public.sachverstaendige
  WHERE ((sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)) AND (sachverstaendige.organisation_id IS NOT NULL)))));


--
-- Name: sv_kalender_verbindungen SV verwaltet eigene Kalender-Verbindungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SV verwaltet eigene Kalender-Verbindungen" ON public.sv_kalender_verbindungen TO authenticated USING ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: branchen_benchmarks Service-Role bypass branchen_benchmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service-Role bypass branchen_benchmarks" ON public.branchen_benchmarks TO service_role USING (true) WITH CHECK (true);


--
-- Name: fall_read_state Service-Role bypass fall_read_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service-Role bypass fall_read_state" ON public.fall_read_state TO service_role USING (true) WITH CHECK (true);


--
-- Name: regulierungs_klassifizierung Service-Role bypass regulierungs_klassifizierung; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service-Role bypass regulierungs_klassifizierung" ON public.regulierungs_klassifizierung TO service_role USING (true) WITH CHECK (true);


--
-- Name: benachrichtigungen User eigene Benachrichtigungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User eigene Benachrichtigungen" ON public.benachrichtigungen USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: fall_read_state Users can manage own read state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own read state" ON public.fall_read_state TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: versicherungen Versicherungen lesbar fuer alle authentifizierten; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Versicherungen lesbar fuer alle authentifizierten" ON public.versicherungen FOR SELECT TO authenticated USING (true);


--
-- Name: versicherungen Versicherungen schreibbar nur fuer admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Versicherungen schreibbar nur fuer admin" ON public.versicherungen TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: abrechnung_positionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abrechnung_positionen ENABLE ROW LEVEL SECURITY;

--
-- Name: abrechnung_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abrechnung_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: abrechnungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abrechnungen ENABLE ROW LEVEL SECURITY;

--
-- Name: abrechnungen abrechnungen_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY abrechnungen_select_consolidated ON public.abrechnungen FOR SELECT TO authenticated USING ((public.is_admin() OR ((empfaenger_typ = 'makler'::text) AND (empfaenger_id IN ( SELECT makler.id
   FROM public.makler
  WHERE (makler.user_id = ( SELECT auth.uid() AS uid))))) OR ((empfaenger_typ = 'sv'::text) AND (empfaenger_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: gutachter_abrechnungen admin_abrechnungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_abrechnungen ON public.gutachter_abrechnungen USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: gutachter_waitlist admin_all_gutachter_waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_gutachter_waitlist ON public.gutachter_waitlist TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: admin_termine admin_dispatch_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_dispatch_access ON public.admin_termine TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))) OR (zugewiesen_an = ( SELECT auth.uid() AS uid)))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))) OR (zugewiesen_an = ( SELECT auth.uid() AS uid))));


--
-- Name: aircall_relay_seats admin_dispatch_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_dispatch_access ON public.aircall_relay_seats TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: kanzlei_abrechnung_positionen admin_dispatch_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_dispatch_read ON public.kanzlei_abrechnung_positionen FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: kanzlei_abrechnungen admin_dispatch_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_dispatch_read ON public.kanzlei_abrechnungen FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: kanzleien admin_dispatch_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_dispatch_read ON public.kanzleien FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: gutachter_einzahlungen admin_einzahlungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_einzahlungen ON public.gutachter_einzahlungen USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: finance_monatsberichte admin_finance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_finance ON public.finance_monatsberichte USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: profiles admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full ON public.profiles TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: incentive_auszahlungen admin_full_auszahlungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_auszahlungen ON public.incentive_auszahlungen USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: mitarbeiter_performance admin_full_performance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_performance ON public.mitarbeiter_performance USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: reklamationen admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage ON public.reklamationen FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: gutachter_mitteilungen admin_mitteilungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_mitteilungen ON public.gutachter_mitteilungen USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: nachrichten admin_nachrichten; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_nachrichten ON public.nachrichten USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: abrechnung_reminders admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only ON public.abrechnung_reminders TO authenticated USING (public.is_admin());


--
-- Name: email_log admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only ON public.email_log TO authenticated USING (public.is_admin());


--
-- Name: kanzlei_abrechnung_reminders admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only ON public.kanzlei_abrechnung_reminders TO authenticated USING (public.is_admin());


--
-- Name: stripe_events admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only ON public.stripe_events TO authenticated USING (public.is_admin());


--
-- Name: sv_payment_reminders admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only ON public.sv_payment_reminders TO authenticated USING (public.is_admin());


--
-- Name: qc_checkliste admin_qc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_qc ON public.qc_checkliste USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: admin_termine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_termine ENABLE ROW LEVEL SECURITY;

--
-- Name: gutschriften admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.gutschriften TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: individuelle_anfragen admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.individuelle_anfragen FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: kanzlei_abrechnung_positionen admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.kanzlei_abrechnung_positionen TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: kanzlei_abrechnungen admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.kanzlei_abrechnungen TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: kanzleien admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.kanzleien TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: leadpreise_tabelle admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.leadpreise_tabelle TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: vertraege_unterzeichnet admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.vertraege_unterzeichnet TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: vertragsvorlagen admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_write ON public.vertragsvorlagen TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: ai_usage_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_log ai_usage_log_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_log_admin_read ON public.ai_usage_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))));


--
-- Name: ai_usage_log ai_usage_log_no_client_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_log_no_client_write ON public.ai_usage_log FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: aircall_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aircall_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: aircall_calls aircall_calls_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aircall_calls_staff ON public.aircall_calls USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: aircall_relay_seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aircall_relay_seats ENABLE ROW LEVEL SECURITY;

--
-- Name: airdrop_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.airdrop_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: airdrop_invitations airdrop_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY airdrop_select_consolidated ON public.airdrop_invitations FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.claim_parties cp
  WHERE ((cp.claim_id = airdrop_invitations.claim_id) AND (cp.user_id = ( SELECT auth.uid() AS uid)) AND (cp.ist_aktiv = true)))) OR (invited_by_user_id = ( SELECT auth.uid() AS uid)) OR (resulting_user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: airdrop_invitations airdrop_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY airdrop_staff_all ON public.airdrop_invitations USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: anfragen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anfragen ENABLE ROW LEVEL SECURITY;

--
-- Name: anfragen anfragen_select_admin_dispatch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anfragen_select_admin_dispatch ON public.anfragen FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: anfragen anfragen_update_admin_dispatch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anfragen_update_admin_dispatch ON public.anfragen FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: anruf_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anruf_log ENABLE ROW LEVEL SECURITY;

--
-- Name: anruf_log anruf_log_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anruf_log_insert ON public.anruf_log FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['dispatch'::public.user_role, 'kundenbetreuer'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: anruf_log anruf_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anruf_log_select ON public.anruf_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['dispatch'::public.user_role, 'kundenbetreuer'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: auftraege; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auftraege ENABLE ROW LEVEL SECURITY;

--
-- Name: auftraege auftraege_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auftraege_admin_all ON public.auftraege USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: auftraege auftraege_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auftraege_select_consolidated ON public.auftraege FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role, 'kanzlei'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.faelle f
  WHERE ((f.id = auftraege.fall_id) AND (f.kunde_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM public.sachverstaendige sv
  WHERE ((sv.id = auftraege.sv_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: leadpreise_tabelle auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_read ON public.leadpreise_tabelle FOR SELECT TO authenticated USING (true);


--
-- Name: auth_remember_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_remember_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_remember_tokens auth_remember_tokens_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_remember_tokens_all_public_consol ON public.auth_remember_tokens USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: benachrichtigungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.benachrichtigungen ENABLE ROW LEVEL SECURITY;

--
-- Name: bkat_tatbestaende; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bkat_tatbestaende ENABLE ROW LEVEL SECURITY;

--
-- Name: bkat_tatbestaende bkat_tatbestaende_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bkat_tatbestaende_read_authenticated ON public.bkat_tatbestaende FOR SELECT TO authenticated USING (true);


--
-- Name: branchen_benchmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branchen_benchmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: call_copilot_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_copilot_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: call_transcription_utterances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_transcription_utterances ENABLE ROW LEVEL SECURITY;

--
-- Name: calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

--
-- Name: claim_mietwagen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_mietwagen ENABLE ROW LEVEL SECURITY;

--
-- Name: claim_mietwagen claim_mietwagen_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_mietwagen_all_public_consol ON public.claim_mietwagen USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = claim_mietwagen.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = claim_mietwagen.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: claim_parties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_parties ENABLE ROW LEVEL SECURITY;

--
-- Name: claim_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: claim_payments claim_payments_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_payments_all_public_consol ON public.claim_payments USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = claim_payments.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = claim_payments.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: claim_recency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_recency ENABLE ROW LEVEL SECURITY;

--
-- Name: claim_recency claim_recency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_recency_select ON public.claim_recency FOR SELECT TO authenticated USING ((public.is_admin() OR public.is_sv_for_claim(claim_id) OR public.is_claim_user_party(claim_id) OR (EXISTS ( SELECT 1
   FROM public.claims c
  WHERE ((c.id = claim_recency.claim_id) AND ((c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR (public.is_dispatcher() AND public.dispatcher_owns_lead(c.lead_id))))))));


--
-- Name: claim_vehicle_involvements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_vehicle_involvements ENABLE ROW LEVEL SECURITY;

--
-- Name: claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

--
-- Name: claims claims_kunde_sv_dispatch_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_kunde_sv_dispatch_select_consolidated ON public.claims FOR SELECT USING (((public.is_dispatcher() AND public.dispatcher_owns_lead(lead_id)) OR (geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR public.is_claim_user_party(id)));


--
-- Name: claims claims_staff_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_staff_all_consolidated ON public.claims TO authenticated USING ((public.is_admin() OR (public.is_kundenbetreuer() AND ((kundenbetreuer_id = ( SELECT auth.uid() AS uid)) OR (kundenbetreuer_id IS NULL))))) WITH CHECK ((public.is_admin() OR (public.is_kundenbetreuer() AND ((kundenbetreuer_id = ( SELECT auth.uid() AS uid)) OR (kundenbetreuer_id IS NULL)))));


--
-- Name: claim_mietwagen cm_kunde_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cm_kunde_select ON public.claim_mietwagen FOR SELECT USING ((claim_id IN ( SELECT f.claim_id
   FROM (public.faelle f
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((f.kunde_id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'kunde'::public.user_role)))));


--
-- Name: communities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

--
-- Name: communities communities_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY communities_admin_all ON public.communities USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: communities communities_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY communities_member_select ON public.communities FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.community_memberships cm
  WHERE ((cm.community_id = communities.id) AND (cm.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: communities communities_verwalter_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY communities_verwalter_update ON public.communities FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.community_memberships cm
  WHERE ((cm.community_id = communities.id) AND (cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.rolle_in_community = 'verwalter'::text)))));


--
-- Name: community_leaderboard; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_leaderboard ENABLE ROW LEVEL SECURITY;

--
-- Name: community_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: community_memberships community_memberships_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_memberships_admin_all ON public.community_memberships USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: community_memberships community_memberships_peer_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_memberships_peer_select ON public.community_memberships FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.community_memberships self
  WHERE ((self.community_id = community_memberships.community_id) AND (self.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: community_memberships community_memberships_verwalter_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_memberships_verwalter_delete ON public.community_memberships FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.community_memberships cm
  WHERE ((cm.community_id = community_memberships.community_id) AND (cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.rolle_in_community = 'verwalter'::text)))));


--
-- Name: community_memberships community_memberships_verwalter_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_memberships_verwalter_write ON public.community_memberships FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.community_memberships cm
  WHERE ((cm.community_id = community_memberships.community_id) AND (cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.rolle_in_community = 'verwalter'::text)))));


--
-- Name: consent_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_records consent_records_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_records_insert ON public.consent_records FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: content_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversion_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

--
-- Name: conversion_events conversion_events_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversion_events_service_only ON public.conversion_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: claim_parties cp_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cp_select_consolidated ON public.claim_parties FOR SELECT USING ((public.is_claim_user_party(claim_id) OR public.is_sv_for_claim(claim_id) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: claim_parties cp_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cp_staff_all ON public.claim_parties TO authenticated USING ((public.is_admin() OR public.is_dispatcher() OR public.is_kundenbetreuer()));


--
-- Name: claim_parties cp_sv_assigned_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cp_sv_assigned_insert ON public.claim_parties FOR INSERT WITH CHECK (((rolle = 'zeuge'::text) AND public.is_sv_for_claim(claim_id)));


--
-- Name: cron_jobs_audit cron_audit_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cron_audit_admin_select ON public.cron_jobs_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: cron_jobs_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cron_jobs_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: claim_vehicle_involvements cvi_select_via_claim; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cvi_select_via_claim ON public.claim_vehicle_involvements FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.claims c
  WHERE (c.id = claim_vehicle_involvements.claim_id))));


--
-- Name: claim_vehicle_involvements cvi_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cvi_staff_all ON public.claim_vehicle_involvements USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: dokument_katalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dokument_katalog ENABLE ROW LEVEL SECURITY;

--
-- Name: dokument_katalog dokument_katalog_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dokument_katalog_read ON public.dokument_katalog FOR SELECT TO authenticated USING (((aktiv = true) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role))))));


--
-- Name: dokument_katalog dokument_katalog_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dokument_katalog_write_admin ON public.dokument_katalog TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))));


--
-- Name: dokument_upload_anfragen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dokument_upload_anfragen ENABLE ROW LEVEL SECURITY;

--
-- Name: dsgvo_loeschauftraege dsgvo_loesch_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dsgvo_loesch_self_insert ON public.dsgvo_loeschauftraege FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: dsgvo_loeschauftraege dsgvo_loesch_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dsgvo_loesch_self_read ON public.dsgvo_loeschauftraege FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: dsgvo_loeschauftraege; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dsgvo_loeschauftraege ENABLE ROW LEVEL SECURITY;

--
-- Name: dokument_upload_anfragen dua_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dua_service_all ON public.dokument_upload_anfragen TO service_role USING (true) WITH CHECK (true);


--
-- Name: dokument_upload_anfragen dua_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dua_staff_read ON public.dokument_upload_anfragen FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: email_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

--
-- Name: email_otp_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: email_otp_codes email_otp_codes_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_otp_codes_service_role ON public.email_otp_codes TO service_role USING (true) WITH CHECK (true);


--
-- Name: embed_abrechnung_positionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.embed_abrechnung_positionen ENABLE ROW LEVEL SECURITY;

--
-- Name: embed_abrechnung_positionen embed_pos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY embed_pos_admin_all ON public.embed_abrechnung_positionen TO authenticated USING (public.is_admin());


--
-- Name: embed_abrechnung_positionen embed_pos_sv_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY embed_pos_sv_select ON public.embed_abrechnung_positionen FOR SELECT TO authenticated USING ((embed_site_id IN ( SELECT embed_sites.id
   FROM public.embed_sites
  WHERE (embed_sites.inhaber_profile_id = auth.uid()))));


--
-- Name: embed_sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.embed_sites ENABLE ROW LEVEL SECURITY;

--
-- Name: embed_sites embed_sites_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY embed_sites_admin_all ON public.embed_sites TO authenticated USING (public.is_admin());


--
-- Name: embed_sites embed_sites_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY embed_sites_owner_select ON public.embed_sites FOR SELECT TO authenticated USING ((inhaber_profile_id = auth.uid()));


--
-- Name: faelle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faelle ENABLE ROW LEVEL SECURITY;

--
-- Name: faelle faelle_kunde_sv_kanzlei_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY faelle_kunde_sv_kanzlei_select_consolidated ON public.faelle FOR SELECT USING ((((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kanzlei'::public.user_role)))) AND (service_typ = 'komplett'::text)) OR (kunde_id = ( SELECT auth.uid() AS uid)) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: faelle faelle_makler_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY faelle_makler_read ON public.faelle FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.makler_fall_consent mfc
     JOIN public.makler m ON ((m.id = mfc.makler_id)))
  WHERE ((mfc.fall_id = faelle.id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (mfc.widerrufen_am IS NULL)))));


--
-- Name: POLICY faelle_makler_read ON faelle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY faelle_makler_read ON public.faelle IS 'AAR-483 M1: Makler liest nur Fälle mit aktivem Consent.';


--
-- Name: faelle faelle_staff_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY faelle_staff_all_consolidated ON public.faelle TO authenticated USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'dispatch'::public.user_role)))) OR ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kundenbetreuer'::public.user_role)))) AND (EXISTS ( SELECT 1
   FROM public.claims c
  WHERE ((c.id = faelle.claim_id) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'dispatch'::public.user_role)))) OR ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kundenbetreuer'::public.user_role)))) AND (EXISTS ( SELECT 1
   FROM public.claims c
  WHERE ((c.id = faelle.claim_id) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: fall_dokumente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fall_dokumente ENABLE ROW LEVEL SECURITY;

--
-- Name: fall_dokumente fall_dokumente_kunde_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fall_dokumente_kunde_insert ON public.fall_dokumente FOR INSERT TO authenticated WITH CHECK (((uploaded_by_kunde = true) AND (EXISTS ( SELECT 1
   FROM public.faelle f
  WHERE ((f.id = fall_dokumente.fall_id) AND (f.kunde_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fall_dokumente fall_dokumente_kunde_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fall_dokumente_kunde_read ON public.fall_dokumente FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.faelle f
  WHERE ((f.id = fall_dokumente.fall_id) AND (f.kunde_id = ( SELECT auth.uid() AS uid))))) AND (sichtbar_fuer @> ARRAY['kunde'::text])));


--
-- Name: fall_read_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fall_read_state ENABLE ROW LEVEL SECURITY;

--
-- Name: fall_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fall_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: fall_summaries fall_summaries_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fall_summaries_staff ON public.fall_summaries USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: finance_eintraege; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_eintraege ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_eintraege finance_eintraege_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_eintraege_select_admin ON public.finance_eintraege FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: finance_monatsberichte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_monatsberichte ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flow_links ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_links flow_links_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY flow_links_service_only ON public.flow_links TO service_role USING (true) WITH CHECK (true);


--
-- Name: forderungspositionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forderungspositionen ENABLE ROW LEVEL SECURITY;

--
-- Name: gebiet_exklusivitaeten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gebiet_exklusivitaeten ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachten_fotos gf_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gf_all_consolidated ON public.gutachten_fotos USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = gutachten_fotos.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (gutachten_id IN ( SELECT g.id
   FROM (public.gutachten g
     JOIN public.sachverstaendige sv ON ((sv.id = g.sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = gutachten_fotos.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (gutachten_id IN ( SELECT g.id
   FROM (public.gutachten g
     JOIN public.sachverstaendige sv ON ((sv.id = g.sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gutachten_fotos gf_kunde_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gf_kunde_own ON public.gutachten_fotos FOR SELECT USING (((upload_quelle = 'kunde'::text) AND (uploaded_by = ( SELECT auth.uid() AS uid))));


--
-- Name: gutachter_finder_anfragen gfa_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_admin_delete ON public.gutachter_finder_anfragen FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: gutachter_finder_anfragen gfa_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_admin_select ON public.gutachter_finder_anfragen FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: gutachter_finder_anfragen gfa_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_admin_update ON public.gutachter_finder_anfragen FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: gutachter_finder_anfragen gfa_anon_select_recent_window; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_anon_select_recent_window ON public.gutachter_finder_anfragen FOR SELECT TO authenticated, anon USING (((source IS NULL) AND (erstellt_am > (now() - '00:05:00'::interval))));


--
-- Name: gutachter_finder_anfragen gfa_anon_update_entwurf; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen FOR UPDATE TO authenticated, anon USING (((source IS NULL) AND (status = 'entwurf'::text))) WITH CHECK (((source IS NULL) AND ((status = 'entwurf'::text) OR (status = 'eingegangen'::text))));


--
-- Name: gutachter_finder_anfragen gfa_insert_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_insert_public ON public.gutachter_finder_anfragen FOR INSERT WITH CHECK ((source IS NULL));


--
-- Name: gfa_rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gfa_rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: gfa_rate_limit gfa_rate_limit_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gfa_rate_limit_service_only ON public.gfa_rate_limit TO service_role USING (true) WITH CHECK (true);


--
-- Name: google_bewertungen_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_bewertungen_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: google_bewertungen_cache google_bewertungen_cache_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY google_bewertungen_cache_select ON public.google_bewertungen_cache FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: gutachten_positionen gp_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gp_all_consolidated ON public.gutachten_positionen USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = gutachten_positionen.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (gutachten_id IN ( SELECT g.id
   FROM (public.gutachten g
     JOIN public.sachverstaendige sv ON ((sv.id = g.sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = gutachten_positionen.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (gutachten_id IN ( SELECT g.id
   FROM (public.gutachten g
     JOIN public.sachverstaendige sv ON ((sv.id = g.sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gutachten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachten ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachten gutachten_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gutachten_all_consolidated ON public.gutachten USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = gutachten.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = gutachten.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gutachten gutachten_buero_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gutachten_buero_admin_select ON public.gutachten FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.sv_buero_memberships m
     JOIN public.sachverstaendige sv ON ((sv.id = m.sv_id)))
  WHERE ((m.buero_id IN ( SELECT m2.buero_id
           FROM (public.sv_buero_memberships m2
             JOIN public.sachverstaendige sv2 ON ((sv2.id = m2.sv_id)))
          WHERE ((sv2.profile_id = ( SELECT auth.uid() AS uid)) AND (m2.rolle = 'admin'::text) AND (m2.end_date IS NULL)))) AND (m.sv_id = gutachten.sv_id) AND (m.end_date IS NULL)))));


--
-- Name: gutachten_fotos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachten_fotos ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachten_positionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachten_positionen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_abrechnungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_abrechnungen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_abrechnungspositionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_abrechnungspositionen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_einzahlungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_einzahlungen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_finder_anfragen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_finder_anfragen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_mitteilungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_mitteilungen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_monatsabrechnungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_monatsabrechnungen ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_termine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_termine ENABLE ROW LEVEL SECURITY;

--
-- Name: gutachter_termine gutachter_termine_admin_sv_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gutachter_termine_admin_sv_all_consolidated ON public.gutachter_termine USING (((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::public.user_role) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::public.user_role) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gutachter_termine gutachter_termine_kunde_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gutachter_termine_kunde_select_consolidated ON public.gutachter_termine FOR SELECT TO authenticated USING (((fall_id IN ( SELECT faelle.id
   FROM public.faelle
  WHERE (faelle.kunde_id = ( SELECT auth.uid() AS uid)))) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.faelle f2
  WHERE ((f2.id = gutachter_termine.fall_id) AND (f2.claim_id IS NOT NULL) AND public.is_claim_user_party(f2.claim_id)))))));


--
-- Name: gutachter_waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutachter_waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: gutschriften; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gutschriften ENABLE ROW LEVEL SECURITY;

--
-- Name: incentive_auszahlungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incentive_auszahlungen ENABLE ROW LEVEL SECURITY;

--
-- Name: incentive_auszahlungen incentive_auszahlungen_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incentive_auszahlungen_own ON public.incentive_auszahlungen FOR SELECT USING ((mitarbeiter_id = ( SELECT auth.uid() AS uid)));


--
-- Name: incentives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incentives ENABLE ROW LEVEL SECURITY;

--
-- Name: incentives incentives_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incentives_admin_all ON public.incentives TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: incentives incentives_staff_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY incentives_staff_select_active ON public.incentives FOR SELECT TO authenticated USING (((aktiv = true) AND public.is_staff()));


--
-- Name: individuelle_anfragen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.individuelle_anfragen ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_abrechnung_positionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzlei_abrechnung_positionen ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_abrechnung_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzlei_abrechnung_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_abrechnungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzlei_abrechnungen ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_admin_termine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzlei_admin_termine ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_admin_termine kanzlei_admin_termine_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanzlei_admin_termine_select_public_consol ON public.kanzlei_admin_termine FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR ((kanzlei_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kanzlei'::public.user_role)))))));


--
-- Name: kanzlei_faelle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzlei_faelle ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_faelle kanzlei_faelle_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanzlei_faelle_admin_all ON public.kanzlei_faelle USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: kanzlei_faelle kanzlei_faelle_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanzlei_faelle_select_consolidated ON public.kanzlei_faelle FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role, 'kanzlei'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.faelle f
  WHERE ((f.id = kanzlei_faelle.fall_id) AND (f.kunde_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((f.id = kanzlei_faelle.fall_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: kanzlei_pakete; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzlei_pakete ENABLE ROW LEVEL SECURITY;

--
-- Name: kanzlei_pakete kanzlei_pakete_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanzlei_pakete_all_public_consol ON public.kanzlei_pakete USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = kanzlei_pakete.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = kanzlei_pakete.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: kanzlei_pakete kanzlei_pakete_geschaedigter_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanzlei_pakete_geschaedigter_select ON public.kanzlei_pakete FOR SELECT USING (((status = 'versendet'::text) AND (EXISTS ( SELECT 1
   FROM public.claims c
  WHERE ((c.id = kanzlei_pakete.claim_id) AND (c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: kanzleien; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanzleien ENABLE ROW LEVEL SECURITY;

--
-- Name: ki_gespraeche; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ki_gespraeche ENABLE ROW LEVEL SECURITY;

--
-- Name: ki_gespraeche ki_gespraeche_kunde_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ki_gespraeche_kunde_insert ON public.ki_gespraeche FOR INSERT TO authenticated WITH CHECK (((rolle = 'kunde'::text) AND (user_id = ( SELECT auth.uid() AS uid)) AND (fall_id IN ( SELECT faelle.id
   FROM public.faelle
  WHERE (faelle.kunde_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: ki_gespraeche ki_gespraeche_kunde_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ki_gespraeche_kunde_read ON public.ki_gespraeche FOR SELECT TO authenticated USING (((rolle = 'kunde'::text) AND (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: ki_gespraeche ki_gespraeche_kunde_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ki_gespraeche_kunde_update ON public.ki_gespraeche FOR UPDATE TO authenticated USING (((rolle = 'kunde'::text) AND (user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((rolle = 'kunde'::text) AND (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: ki_gespraeche ki_gespraeche_staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ki_gespraeche_staff_fall_scoped ON public.ki_gespraeche TO authenticated USING ((((fall_id IS NOT NULL) AND public.can_access_fall(fall_id)) OR ((fall_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))))) WITH CHECK ((((fall_id IS NOT NULL) AND public.can_access_fall(fall_id)) OR ((fall_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))))));


--
-- Name: kunde_gutachten_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kunde_gutachten_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: kunde_gutachten_requests kunde_gutachten_requests_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kunde_gutachten_requests_service_only ON public.kunde_gutachten_requests TO service_role USING (true) WITH CHECK (true);


--
-- Name: kunde_live_position; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kunde_live_position ENABLE ROW LEVEL SECURITY;

--
-- Name: kunde_live_position kunde_live_position_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kunde_live_position_own ON public.kunde_live_position USING ((kunde_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((kunde_id = ( SELECT auth.uid() AS uid)));


--
-- Name: kunde_live_position kunde_live_position_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kunde_live_position_select_public_consol ON public.kunde_live_position FOR SELECT USING ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.gutachter_termine gt
  WHERE ((gt.id = kunde_live_position.termin_id) AND (gt.sv_id = public.get_sv_id()))))));


--
-- Name: sv_organisation_laeufer_reports laeufer_report_inhaber; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY laeufer_report_inhaber ON public.sv_organisation_laeufer_reports FOR SELECT USING ((organisation_id IN ( SELECT o.id
   FROM (public.sv_organisation o
     JOIN public.sachverstaendige sv ON ((sv.id = o.inhaber_sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: lead_historie; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_historie ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_historie lead_historie_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_historie_service_only ON public.lead_historie TO service_role USING (true) WITH CHECK (true);


--
-- Name: leadpreise_tabelle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leadpreise_tabelle ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_kanzlei_kb_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_kanzlei_kb_select_consolidated ON public.leads FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.faelle
     JOIN public.profiles ON ((profiles.id = ( SELECT auth.uid() AS uid))))
  WHERE ((faelle.lead_id = leads.id) AND (profiles.rolle = 'kanzlei'::public.user_role) AND (faelle.service_typ = 'komplett'::text)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.lead_id = leads.id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: leads leads_makler_sv_select_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_makler_sv_select_consolidated ON public.leads FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.promotion_codes pc
     JOIN public.makler m ON ((m.id = pc.makler_id)))
  WHERE ((pc.id = leads.promotion_code_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM ((public.faelle f
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
     JOIN public.profiles p ON ((p.id = sv.profile_id)))
  WHERE ((f.lead_id = leads.id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'sachverstaendiger'::public.user_role))))));


--
-- Name: leads leads_staff_all_consolidated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_staff_all_consolidated ON public.leads TO authenticated USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM ((public.faelle f
     JOIN public.claims c ON ((c.id = f.claim_id)))
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((f.lead_id = leads.id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM ((public.faelle f
     JOIN public.claims c ON ((c.id = f.claim_id)))
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((f.lead_id = leads.id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: makler; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.makler ENABLE ROW LEVEL SECURITY;

--
-- Name: makler makler_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY makler_admin_all ON public.makler TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: makler_fall_consent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.makler_fall_consent ENABLE ROW LEVEL SECURITY;

--
-- Name: makler_provisionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.makler_provisionen ENABLE ROW LEVEL SECURITY;

--
-- Name: makler makler_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY makler_self_read ON public.makler FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: makler makler_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY makler_self_update ON public.makler FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: POLICY makler_self_update ON makler; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY makler_self_update ON public.makler IS 'AAR-483 M1: Makler darf eigene Stammdaten editieren.';


--
-- Name: matelso_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matelso_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: matelso_calls matelso_calls_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matelso_calls_staff ON public.matelso_calls USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'leadbearbeiter'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: makler_fall_consent mfc_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfc_admin_all ON public.makler_fall_consent TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: makler_fall_consent mfc_makler_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfc_makler_read ON public.makler_fall_consent FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.makler m
  WHERE ((m.id = makler_fall_consent.makler_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: makler_fall_consent mfc_self_revoke; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfc_self_revoke ON public.makler_fall_consent FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.makler m
  WHERE ((m.id = makler_fall_consent.makler_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((widerrufen_am IS NOT NULL));


--
-- Name: POLICY mfc_self_revoke ON makler_fall_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY mfc_self_revoke ON public.makler_fall_consent IS 'AAR-483 M1: Makler darf eigenes Consent widerrufen (WITH CHECK erzwingt widerrufen_am != NULL).';


--
-- Name: mitarbeiter_performance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mitarbeiter_performance ENABLE ROW LEVEL SECURITY;

--
-- Name: mitarbeiter_performance mitarbeiter_performance_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mitarbeiter_performance_own ON public.mitarbeiter_performance FOR SELECT USING ((mitarbeiter_id = ( SELECT auth.uid() AS uid)));


--
-- Name: mitteilungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mitteilungen ENABLE ROW LEVEL SECURITY;

--
-- Name: mitteilungen mitteilungen_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mitteilungen_select ON public.mitteilungen FOR SELECT USING ((empfaenger_id = ( SELECT auth.uid() AS uid)));


--
-- Name: mitteilungen mitteilungen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mitteilungen_update ON public.mitteilungen FOR UPDATE USING ((empfaenger_id = ( SELECT auth.uid() AS uid)));


--
-- Name: makler_provisionen mp_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mp_admin_all ON public.makler_provisionen TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: makler_provisionen mp_makler_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mp_makler_read ON public.makler_provisionen FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.makler m
  WHERE ((m.id = makler_provisionen.makler_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: nachrichten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nachrichten ENABLE ROW LEVEL SECURITY;

--
-- Name: nachrichten nachrichten_insert_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nachrichten_insert_public_consol ON public.nachrichten FOR INSERT WITH CHECK ((((kanal = 'portal-kunde-gutachter'::text) AND (sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige s ON ((s.id = f.sv_id)))
  WHERE ((f.id = nachrichten.fall_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))) OR ((kanal = ANY (ARRAY['portal-kunde-claimondo'::text, 'portal-kunde-gutachter'::text])) AND (sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.faelle
  WHERE ((faelle.id = nachrichten.fall_id) AND (faelle.kunde_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: nachrichten nachrichten_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nachrichten_select_public_consol ON public.nachrichten FOR SELECT USING ((((kanal = 'portal-kunde-gutachter'::text) AND (EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige s ON ((s.id = f.sv_id)))
  WHERE ((f.id = nachrichten.fall_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))) OR ((kanal = ANY (ARRAY['chat_kb_kunde'::text, 'chat_kunde_sv'::text, 'gruppenchat'::text, 'portal-kunde-claimondo'::text, 'portal-kunde-gutachter'::text])) AND ((sender_id = ( SELECT auth.uid() AS uid)) OR (empfaenger_id = ( SELECT auth.uid() AS uid)) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.faelle f
  WHERE ((f.id = nachrichten.fall_id) AND (f.kunde_id = ( SELECT auth.uid() AS uid))))))))));


--
-- Name: notification_events notif_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_events_admin_read ON public.notification_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: notification_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_deliveries notification_deliveries_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_deliveries_select_public_consol ON public.notification_deliveries FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (recipient_user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: notification_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: ocr_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ocr_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ocr_runs ocr_runs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ocr_runs_admin_all ON public.ocr_runs USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: ocr_runs ocr_runs_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ocr_runs_select_public_consol ON public.ocr_runs FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ((public.gutachten g
     JOIN public.claims c ON ((c.id = g.claim_id)))
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((g.id = ocr_runs.gutachten_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (public.gutachten g
     JOIN public.sachverstaendige sv ON ((sv.id = g.sv_id)))
  WHERE ((g.id = ocr_runs.gutachten_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: onboarding_felder; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_felder ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_felder onboarding_felder_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY onboarding_felder_public_read ON public.onboarding_felder FOR SELECT TO authenticated, anon USING (true);


--
-- Name: onboarding_phasen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_phasen ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_phasen onboarding_phasen_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY onboarding_phasen_public_read ON public.onboarding_phasen FOR SELECT TO authenticated, anon USING (true);


--
-- Name: organisationen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organisationen ENABLE ROW LEVEL SECURITY;

--
-- Name: organisationen organisationen_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organisationen_select_public_consol ON public.organisationen FOR SELECT USING (((id IN ( SELECT sachverstaendige.organisation_id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))) OR (parent_user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: paket_upgrades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paket_upgrades ENABLE ROW LEVEL SECURITY;

--
-- Name: parteien; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parteien ENABLE ROW LEVEL SECURITY;

--
-- Name: personenschaden_personen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personenschaden_personen ENABLE ROW LEVEL SECURITY;

--
-- Name: personenschaden_personen personenschaden_personen_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personenschaden_personen_all_public_consol ON public.personenschaden_personen USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.faelle
  WHERE ((faelle.id = personenschaden_personen.fall_id) AND (faelle.kunde_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.faelle
  WHERE ((faelle.id = personenschaden_personen.fall_id) AND (faelle.kunde_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: pflichtdokumente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pflichtdokumente ENABLE ROW LEVEL SECURITY;

--
-- Name: pflichtdokumente pflichtdokumente_select_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pflichtdokumente_select_authenticated_consol ON public.pflichtdokumente FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.faelle
  WHERE ((faelle.id = pflichtdokumente.fall_id) AND (faelle.kunde_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((f.id = pflichtdokumente.fall_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: pflichtdokumente pflichtdokumente_update_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pflichtdokumente_update_authenticated_consol ON public.pflichtdokumente FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.faelle
  WHERE ((faelle.id = pflichtdokumente.fall_id) AND (faelle.kunde_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((f.id = pflichtdokumente.fall_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.faelle
  WHERE ((faelle.id = pflichtdokumente.fall_id) AND (faelle.kunde_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (public.faelle f
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((f.id = pflichtdokumente.fall_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: phase_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phase_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: phase_transitions phase_transitions_own_fall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY phase_transitions_own_fall ON public.phase_transitions FOR SELECT TO authenticated USING ((fall_id IN ( SELECT f.id
   FROM public.faelle f
  WHERE ((f.kunde_id = ( SELECT auth.uid() AS uid)) OR (f.sv_id IN ( SELECT s.id
           FROM public.sachverstaendige s
          WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (f.makler_id IN ( SELECT m.id
           FROM public.makler m
          WHERE (m.user_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: phase_transitions phase_transitions_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY phase_transitions_staff_all ON public.phase_transitions USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: plz_geo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plz_geo ENABLE ROW LEVEL SECURITY;

--
-- Name: plz_geo plz_geo_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plz_geo_read ON public.plz_geo FOR SELECT TO authenticated USING (true);


--
-- Name: plz_geo plz_geo_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plz_geo_read_authenticated ON public.plz_geo FOR SELECT TO authenticated USING (true);


--
-- Name: notification_preferences prefs_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prefs_self ON public.notification_preferences TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_codes promo_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promo_admin_all ON public.promotion_codes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: promo_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_clicks promo_clicks_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promo_clicks_admin_all ON public.promo_clicks TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))));


--
-- Name: promo_clicks promo_clicks_makler_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promo_clicks_makler_read ON public.promo_clicks FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.promotion_codes pc
     JOIN public.makler m ON ((m.id = pc.makler_id)))
  WHERE ((pc.id = promo_clicks.promotion_code_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: promotion_codes promo_makler_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promo_makler_read ON public.promotion_codes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.makler m
  WHERE ((m.id = promotion_codes.makler_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: promotion_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: provisionen_maik; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provisionen_maik ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_sub_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_sub_self ON public.push_subscriptions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_checkliste; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_checkliste ENABLE ROW LEVEL SECURITY;

--
-- Name: rechnungs_konfiguration; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rechnungs_konfiguration ENABLE ROW LEVEL SECURITY;

--
-- Name: rechnungs_konfiguration rechnungs_konfiguration_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rechnungs_konfiguration_service_only ON public.rechnungs_konfiguration TO service_role USING (true) WITH CHECK (true);


--
-- Name: rechnungs_nr_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rechnungs_nr_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: rechnungs_nr_counter rechnungs_nr_counter_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rechnungs_nr_counter_service_only ON public.rechnungs_nr_counter TO service_role USING (true) WITH CHECK (true);


--
-- Name: regulierungs_klassifizierung reg_klass_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reg_klass_insert_staff ON public.regulierungs_klassifizierung FOR INSERT TO authenticated WITH CHECK (public.is_staff());


--
-- Name: regulierungs_klassifizierung reg_klass_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reg_klass_select_staff ON public.regulierungs_klassifizierung FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: regulierungs_klassifizierung reg_klass_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reg_klass_update_staff ON public.regulierungs_klassifizierung FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: regulierungs_klassifizierung; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regulierungs_klassifizierung ENABLE ROW LEVEL SECURITY;

--
-- Name: reklamationen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reklamationen ENABLE ROW LEVEL SECURITY;

--
-- Name: repairs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

--
-- Name: repairs repairs_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY repairs_all_public_consol ON public.repairs USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = repairs.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = repairs.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: routing_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routing_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: routing_cache routing_cache_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routing_cache_service_only ON public.routing_cache USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: sachverstaendige; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sachverstaendige ENABLE ROW LEVEL SECURITY;

--
-- Name: sachverstaendige sachverstaendige_anon_select_map_ready; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sachverstaendige_anon_select_map_ready ON public.sachverstaendige FOR SELECT TO anon USING (((verifiziert = true) AND (ist_aktiv = true) AND (geloescht_am IS NULL) AND (standort_lat IS NOT NULL) AND (standort_lng IS NOT NULL) AND (isochrone_polygon IS NOT NULL)));


--
-- Name: POLICY sachverstaendige_anon_select_map_ready ON sachverstaendige; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY sachverstaendige_anon_select_map_ready ON public.sachverstaendige IS 'Marketing-Page /gutachter-finden braucht anonymen Lese-Zugriff für die Mapbox-Marker. Filter stellt sicher dass nur map-ready Zeilen sichtbar sind (verifiziert + aktiv + geo + isochrone + nicht gelöscht).';


--
-- Name: sachverstaendige sachverstaendige_select_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sachverstaendige_select_authenticated_consol ON public.sachverstaendige FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))) OR (profile_id = ( SELECT auth.uid() AS uid))));


--
-- Name: schadenspositionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schadenspositionen ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: sla_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sla_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: abrechnung_positionen staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.abrechnung_positionen TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: call_copilot_suggestions staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.call_copilot_suggestions USING ((EXISTS ( SELECT 1
   FROM public.calls c
  WHERE ((c.id = call_copilot_suggestions.call_id) AND (((c.fall_id IS NOT NULL) AND public.can_access_fall(c.fall_id)) OR ((c.fall_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))))))));


--
-- Name: call_transcription_utterances staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.call_transcription_utterances USING ((EXISTS ( SELECT 1
   FROM public.calls c
  WHERE ((c.id = call_transcription_utterances.call_id) AND (((c.fall_id IS NOT NULL) AND public.can_access_fall(c.fall_id)) OR ((c.fall_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))))))));


--
-- Name: calls staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.calls USING ((((fall_id IS NOT NULL) AND public.can_access_fall(fall_id)) OR ((fall_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))))));


--
-- Name: fall_dokumente staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.fall_dokumente TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: forderungspositionen staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.forderungspositionen TO authenticated USING ((public.can_access_fall(fall_id) OR public.is_kanzlei())) WITH CHECK ((public.can_access_fall(fall_id) OR public.is_kanzlei()));


--
-- Name: gutachter_termine staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.gutachter_termine TO authenticated USING ((((fall_id IS NOT NULL) AND public.can_access_fall(fall_id)) OR ((fall_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))))) WITH CHECK ((((fall_id IS NOT NULL) AND public.can_access_fall(fall_id)) OR ((fall_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role]))))))));


--
-- Name: nachrichten staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.nachrichten TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: parteien staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.parteien TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: pflichtdokumente staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.pflichtdokumente TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: qc_checkliste staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.qc_checkliste TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: reklamationen staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.reklamationen TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: schadenspositionen staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.schadenspositionen TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: timeline staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.timeline TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: zahlungseingaenge staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.zahlungseingaenge TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: zahlungspositionen staff_fall_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_fall_scoped ON public.zahlungspositionen TO authenticated USING (public.can_access_fall(fall_id)) WITH CHECK (public.can_access_fall(fall_id));


--
-- Name: profiles staff_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_read_all ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR public.is_staff()));


--
-- Name: sla_tracking staff_read_sla_tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_read_sla_tracking ON public.sla_tracking FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: stripe_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

--
-- Name: support_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: support_rate_limits support_rl_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_rl_admin_read ON public.support_rate_limits FOR SELECT USING ((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role])));


--
-- Name: support_ticket_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_log ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_log support_ticket_log_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_ticket_log_select_public_consol ON public.support_ticket_log FOR SELECT USING (((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role])) OR (( SELECT auth.uid() AS uid) = user_id)));


--
-- Name: gutachter_abrechnungen sv_abrechnungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_abrechnungen ON public.gutachter_abrechnungen FOR SELECT USING ((sv_id IN ( SELECT s.id
   FROM (public.sachverstaendige s
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE (p.rolle = 'sachverstaendiger'::public.user_role))));


--
-- Name: tasks sv_adhoc_task_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_adhoc_task_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (((auto_erstellt = false) AND (erstellt_von_id = ( SELECT auth.uid() AS uid)) AND public.is_sv() AND (fall_id IN ( SELECT f.id
   FROM (public.faelle f
     JOIN public.sachverstaendige s ON ((s.id = f.sv_id)))
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: POLICY sv_adhoc_task_insert ON tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY sv_adhoc_task_insert ON public.tasks IS 'AAR-307: SV kann manuelle Tasks nur für ihm zugewiesene Fälle anlegen (auto_erstellt=false, erstellt_von_id=auth.uid()).';


--
-- Name: sv_buero; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_buero ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_buero sv_buero_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_buero_admin_all ON public.sv_buero USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: sv_buero sv_buero_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_buero_member_select ON public.sv_buero FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.sv_buero_memberships m
     JOIN public.sachverstaendige sv ON ((sv.id = m.sv_id)))
  WHERE ((m.buero_id = sv_buero.id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)) AND (m.end_date IS NULL)))));


--
-- Name: sv_buero_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_buero_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_buero_memberships sv_buero_memberships_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_buero_memberships_all_public_consol ON public.sv_buero_memberships USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.sv_buero_memberships m2
     JOIN public.sachverstaendige sv ON ((sv.id = m2.sv_id)))
  WHERE ((m2.buero_id = sv_buero_memberships.buero_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)) AND (m2.rolle = 'admin'::text) AND (m2.end_date IS NULL)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.sv_buero_memberships m2
     JOIN public.sachverstaendige sv ON ((sv.id = m2.sv_id)))
  WHERE ((m2.buero_id = sv_buero_memberships.buero_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)) AND (m2.rolle = 'admin'::text) AND (m2.end_date IS NULL)))));


--
-- Name: sv_live_position sv_can_insert_own_position; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_can_insert_own_position ON public.sv_live_position FOR INSERT WITH CHECK ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_community; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_community ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_community sv_community_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_community_admin_all ON public.sv_community USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: individuelle_anfragen sv_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_insert ON public.individuelle_anfragen FOR INSERT TO authenticated WITH CHECK (((sv_id = public.get_sv_id()) OR public.is_admin()));


--
-- Name: reklamationen sv_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_insert ON public.reklamationen FOR INSERT TO authenticated WITH CHECK (((sv_id = public.get_sv_id()) OR public.is_admin()));


--
-- Name: sv_kalender_events_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_kalender_events_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_kalender_verbindungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_kalender_verbindungen ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_kalender_verbindungen sv_kalender_verbindungen_select_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_kalender_verbindungen_select_authenticated_consol ON public.sv_kalender_verbindungen FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sv_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_leads sv_leads_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_leads_admin_all ON public.sv_leads USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: sv_leads sv_leads_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_leads_select_public ON public.sv_leads FOR SELECT USING ((ist_aktiv = true));


--
-- Name: sv_kalender_events_cache sv_liest_eigene_cache_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_liest_eigene_cache_events ON public.sv_kalender_events_cache FOR SELECT USING ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_live_location; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_live_location ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_live_location sv_live_location_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_live_location_own ON public.sv_live_location USING ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_live_position; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_live_position ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_live_position sv_live_position_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_live_position_select_public_consol ON public.sv_live_position FOR SELECT USING (((( SELECT profiles.rolle
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'admin'::public.user_role) OR (sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gutachter_mitteilungen sv_mitteilungen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_mitteilungen ON public.gutachter_mitteilungen FOR SELECT USING ((sv_id IN ( SELECT s.id
   FROM (public.sachverstaendige s
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE (p.rolle = 'sachverstaendiger'::public.user_role))));


--
-- Name: sv_onboarding_rechnungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_onboarding_rechnungen ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_onboarding_rechnungen sv_onboarding_rechnungen_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_onboarding_rechnungen_service_only ON public.sv_onboarding_rechnungen TO service_role USING (true) WITH CHECK (true);


--
-- Name: sv_organisation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_organisation ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_organisation sv_organisation_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_organisation_all_public_consol ON public.sv_organisation USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (inhaber_sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((inhaber_sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_organisation_laeufer_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_organisation_laeufer_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_organisation_laeufer_reports sv_organisation_laeufer_reports_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_organisation_laeufer_reports_all_public_consol ON public.sv_organisation_laeufer_reports USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (laeufer_user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((laeufer_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: sv_organisation_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_organisation_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_organisation_memberships sv_organisation_memberships_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_organisation_memberships_all_public_consol ON public.sv_organisation_memberships USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (organisation_id IN ( SELECT o.id
   FROM (public.sv_organisation o
     JOIN public.sachverstaendige sv ON ((sv.id = o.inhaber_sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((organisation_id IN ( SELECT o.id
   FROM (public.sv_organisation o
     JOIN public.sachverstaendige sv ON ((sv.id = o.inhaber_sv_id)))
  WHERE (sv.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: gutschriften sv_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_own ON public.gutschriften FOR SELECT TO authenticated USING (((sv_id = public.get_sv_id()) OR public.is_admin()));


--
-- Name: individuelle_anfragen sv_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_own ON public.individuelle_anfragen FOR SELECT TO authenticated USING (((sv_id = public.get_sv_id()) OR public.is_admin()));


--
-- Name: reklamationen sv_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_own_read ON public.reklamationen FOR SELECT TO authenticated USING (((sv_id = public.get_sv_id()) OR public.can_access_fall(fall_id)));


--
-- Name: vertraege_unterzeichnet sv_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_own_read ON public.vertraege_unterzeichnet FOR SELECT TO authenticated USING (((sv_id = public.get_sv_id()) OR public.is_staff()));


--
-- Name: sv_payment_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_payment_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_private_stops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_private_stops ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_private_stops sv_private_stops_self_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_private_stops_self_delete ON public.sv_private_stops FOR DELETE TO authenticated USING ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_private_stops sv_private_stops_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_private_stops_self_insert ON public.sv_private_stops FOR INSERT TO authenticated WITH CHECK ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_private_stops sv_private_stops_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_private_stops_self_select ON public.sv_private_stops FOR SELECT TO authenticated USING ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_private_stops sv_private_stops_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_private_stops_self_update ON public.sv_private_stops FOR UPDATE TO authenticated USING ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((sv_id IN ( SELECT sachverstaendige.id
   FROM public.sachverstaendige
  WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: sv_tages_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sv_tages_session ENABLE ROW LEVEL SECURITY;

--
-- Name: sv_tages_session sv_tages_session_all_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_tages_session_all_authenticated_consol ON public.sv_tages_session TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))) OR (sv_id = public.get_sv_id()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'admin'::public.user_role)))) OR (sv_id = public.get_sv_id())));


--
-- Name: sv_tages_session sv_tages_session_dispatch_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_tages_session_dispatch_select ON public.sv_tages_session FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = 'dispatch'::public.user_role)))));


--
-- Name: POLICY sv_tages_session_dispatch_select ON sv_tages_session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY sv_tages_session_dispatch_select ON public.sv_tages_session IS 'Smoke-2026-05-08 F-14: Dispatch sieht alle Tages-Sessions read-only.';


--
-- Name: sachverstaendige sv_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sv_update_own ON public.sachverstaendige FOR UPDATE TO authenticated USING ((profile_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));


--
-- Name: sv_buero_memberships svbuero_mem_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY svbuero_mem_member_select ON public.sv_buero_memberships FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.sachverstaendige sv
  WHERE ((sv.id = sv_buero_memberships.sv_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sv_organisation_memberships svorgmem_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY svorgmem_self_select ON public.sv_organisation_memberships FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: task_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: task_reminders task_reminders_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_reminders_service_only ON public.task_reminders TO service_role USING (true) WITH CHECK (true);


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_all_public_consol ON public.tasks TO authenticated USING ((public.is_admin() OR (((fall_id IS NOT NULL) AND public.can_access_fall(fall_id)) OR ((fall_id IS NULL) AND (lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))) OR (zugewiesen_an = ( SELECT auth.uid() AS uid)) OR (empfaenger_user_id = ( SELECT auth.uid() AS uid)) OR ((fall_id IS NULL) AND (lead_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role])))))))));


--
-- Name: tasks tasks_select_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select_authenticated_consol ON public.tasks FOR SELECT TO authenticated USING (((zugewiesen_an = ( SELECT auth.uid() AS uid)) OR (fall_id IN ( SELECT faelle.id
   FROM public.faelle
  WHERE (faelle.kunde_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: technische_probleme; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technische_probleme ENABLE ROW LEVEL SECURITY;

--
-- Name: technische_probleme technische_probleme_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY technische_probleme_all_public_consol ON public.technische_probleme USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: termin_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.termin_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: termin_reminders termin_reminders_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY termin_reminders_service_only ON public.termin_reminders USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: termine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.termine ENABLE ROW LEVEL SECURITY;

--
-- Name: termine termine_all_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY termine_all_auth ON public.termine USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: timeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline timeline_select_authenticated_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_select_authenticated_consol ON public.timeline FOR SELECT TO authenticated USING (((fall_id IN ( SELECT f.id
   FROM (public.faelle f
     JOIN public.sachverstaendige s ON ((s.id = f.sv_id)))
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (fall_id IN ( SELECT faelle.id
   FROM public.faelle
  WHERE (faelle.kunde_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: vehicle_ownership_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_ownership_history ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_ownership_history vehicle_ownership_history_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicle_ownership_history_select_public_consol ON public.vehicle_ownership_history FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ((public.faelle f
     JOIN public.claims c ON ((c.id = f.claim_id)))
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((c.vehicle_id = vehicle_ownership_history.vehicle_id) AND (sv.profile_id = ( SELECT auth.uid() AS uid))))) OR (user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.vehicles v
  WHERE ((v.id = vehicle_ownership_history.vehicle_id) AND (v.current_owner_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles vehicles_select_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_select_public_consol ON public.vehicles FOR SELECT USING (((current_owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM ((public.faelle f
     JOIN public.claims c ON ((c.id = f.claim_id)))
     JOIN public.sachverstaendige sv ON ((sv.id = f.sv_id)))
  WHERE ((c.vehicle_id = vehicles.id) AND (sv.profile_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: vehicles vehicles_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_staff_all ON public.vehicles USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: versicherungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.versicherungen ENABLE ROW LEVEL SECURITY;

--
-- Name: vertraege_unterzeichnet; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vertraege_unterzeichnet ENABLE ROW LEVEL SECURITY;

--
-- Name: vertragsvorlagen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vertragsvorlagen ENABLE ROW LEVEL SECURITY;

--
-- Name: vertragsvorlagen vertragsvorlagen_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vertragsvorlagen_staff_read ON public.vertragsvorlagen FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: POLICY vertragsvorlagen_staff_read ON vertragsvorlagen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY vertragsvorlagen_staff_read ON public.vertragsvorlagen IS 'Admin/Dispatch/Kundenbetreuer dürfen alle Vorlagen-Versionen sehen (Management). Audit 2.2b 13.05.2026.';


--
-- Name: vertragsvorlagen vertragsvorlagen_sv_active_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vertragsvorlagen_sv_active_read ON public.vertragsvorlagen FOR SELECT TO authenticated USING ((public.is_sv() AND (aktiv = true)));


--
-- Name: POLICY vertragsvorlagen_sv_active_read ON vertragsvorlagen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY vertragsvorlagen_sv_active_read ON public.vertragsvorlagen IS 'SVs (auch in Onboarding) lesen nur aktiv=true Vorlagen (Nutzungsbedingungen + Kollegen-Vorlage in /gutachter/willkommen). Audit 2.2b 13.05.2026.';


--
-- Name: vehicle_ownership_history voh_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voh_staff_all ON public.vehicle_ownership_history USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'dispatch'::public.user_role, 'kundenbetreuer'::public.user_role]))))));


--
-- Name: vs_korrespondenz; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vs_korrespondenz ENABLE ROW LEVEL SECURITY;

--
-- Name: vs_korrespondenz vs_korrespondenz_all_public_consol; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_korrespondenz_all_public_consol ON public.vs_korrespondenz USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = vs_korrespondenz.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.claims c
     JOIN public.profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = vs_korrespondenz.claim_id) AND (p.rolle = 'kundenbetreuer'::public.user_role) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events webhook_events_admin_kb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_events_admin_kb_read ON public.webhook_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: werkstaetten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.werkstaetten ENABLE ROW LEVEL SECURITY;

--
-- Name: werkstaetten werkstaetten_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY werkstaetten_admin_all ON public.werkstaetten USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::public.user_role)))));


--
-- Name: werkstaetten werkstaetten_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY werkstaetten_staff_select ON public.werkstaetten FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = ANY (ARRAY['admin'::public.user_role, 'kundenbetreuer'::public.user_role, 'sachverstaendiger'::public.user_role, 'dispatch'::public.user_role]))))));


--
-- Name: whatsapp_inbound_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_inbound_messages whatsapp_inbound_messages_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_inbound_messages_service_only ON public.whatsapp_inbound_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: zahlungseingaenge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zahlungseingaenge ENABLE ROW LEVEL SECURITY;

--
-- Name: zahlungspositionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zahlungspositionen ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION airdrop_status_consistency(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.airdrop_status_consistency() TO anon;
GRANT ALL ON FUNCTION public.airdrop_status_consistency() TO authenticated;
GRANT ALL ON FUNCTION public.airdrop_status_consistency() TO service_role;


--
-- Name: FUNCTION anonymisiere_claim_party(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.anonymisiere_claim_party() TO anon;
GRANT ALL ON FUNCTION public.anonymisiere_claim_party() TO authenticated;
GRANT ALL ON FUNCTION public.anonymisiere_claim_party() TO service_role;


--
-- Name: FUNCTION apply_gutachten_ocr(p_claim_id uuid, p_values jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_gutachten_ocr(p_claim_id uuid, p_values jsonb) TO anon;
GRANT ALL ON FUNCTION public.apply_gutachten_ocr(p_claim_id uuid, p_values jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_gutachten_ocr(p_claim_id uuid, p_values jsonb) TO service_role;


--
-- Name: FUNCTION audit_rls_function_grants(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_rls_function_grants() FROM PUBLIC;
GRANT ALL ON FUNCTION public.audit_rls_function_grants() TO service_role;


--
-- Name: FUNCTION auftraege_sync_claim_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auftraege_sync_claim_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auftraege_sync_claim_id() TO service_role;


--
-- Name: FUNCTION auftraege_validate_typ_requires_kanzleifall(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auftraege_validate_typ_requires_kanzleifall() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auftraege_validate_typ_requires_kanzleifall() TO service_role;


--
-- Name: FUNCTION can_access_fall(p_fall_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_fall(p_fall_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_fall(p_fall_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_access_fall(p_fall_id uuid) TO authenticated;


--
-- Name: FUNCTION check_fall_claim_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_fall_claim_id() TO anon;
GRANT ALL ON FUNCTION public.check_fall_claim_id() TO authenticated;
GRANT ALL ON FUNCTION public.check_fall_claim_id() TO service_role;


--
-- Name: FUNCTION check_gfa_rate_limit(p_ip_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_gfa_rate_limit(p_ip_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_gfa_rate_limit(p_ip_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.check_gfa_rate_limit(p_ip_hash text) TO service_role;
GRANT ALL ON FUNCTION public.check_gfa_rate_limit(p_ip_hash text) TO anon;


--
-- Name: FUNCTION convert_anfrage_zu_lead(p_anfrage_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid) TO service_role;


--
-- Name: FUNCTION count_unread_updates(p_fall_id uuid, p_since timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.count_unread_updates(p_fall_id uuid, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.count_unread_updates(p_fall_id uuid, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.count_unread_updates(p_fall_id uuid, p_since timestamp with time zone) TO service_role;


--
-- Name: FUNCTION cron_airdrop_token_cleanup(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_airdrop_token_cleanup() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_airdrop_token_cleanup() TO service_role;


--
-- Name: FUNCTION cron_airdrop_token_expiry(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_airdrop_token_expiry() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_airdrop_token_expiry() TO service_role;


--
-- Name: FUNCTION cron_dsgvo_hard_delete(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_dsgvo_hard_delete() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_dsgvo_hard_delete() TO service_role;


--
-- Name: FUNCTION cron_gutachten_ocr_recovery(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_gutachten_ocr_recovery() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_gutachten_ocr_recovery() TO service_role;


--
-- Name: FUNCTION cron_kanzlei_paket_pending_check(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_kanzlei_paket_pending_check() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_kanzlei_paket_pending_check() TO service_role;


--
-- Name: FUNCTION cron_konsistenz_check(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_konsistenz_check() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_konsistenz_check() TO service_role;


--
-- Name: FUNCTION cron_mark_durchgefuehrt_fallback(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_mark_durchgefuehrt_fallback() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_mark_durchgefuehrt_fallback() TO service_role;


--
-- Name: FUNCTION cron_mietwagen_lange_anmietung(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_mietwagen_lange_anmietung() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_mietwagen_lange_anmietung() TO service_role;


--
-- Name: FUNCTION cron_mietwagen_sla_tracking(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_mietwagen_sla_tracking() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_mietwagen_sla_tracking() TO service_role;


--
-- Name: FUNCTION cron_pflicht_foto_validation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_pflicht_foto_validation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_pflicht_foto_validation() TO service_role;


--
-- Name: FUNCTION cron_rate_limit_reset(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_rate_limit_reset() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_rate_limit_reset() TO service_role;


--
-- Name: FUNCTION cron_trigger_exif_worker(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_trigger_exif_worker() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_trigger_exif_worker() TO service_role;


--
-- Name: FUNCTION cron_trigger_salesforce_sync(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_trigger_salesforce_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_trigger_salesforce_sync() TO service_role;


--
-- Name: FUNCTION cron_verjaehrungs_warner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_verjaehrungs_warner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_verjaehrungs_warner() TO service_role;


--
-- Name: FUNCTION cron_vs_frist_reminder(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_vs_frist_reminder() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_vs_frist_reminder() TO service_role;


--
-- Name: FUNCTION cron_vs_frist_tick(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cron_vs_frist_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cron_vs_frist_tick() TO service_role;


--
-- Name: FUNCTION delete_fall_komplett(p_fall_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_fall_komplett(p_fall_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_fall_komplett(p_fall_id uuid) TO service_role;


--
-- Name: FUNCTION delete_gutachter_komplett(p_sv_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_gutachter_komplett(p_sv_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_gutachter_komplett(p_sv_id uuid) TO service_role;


--
-- Name: FUNCTION delete_lead_komplett(p_lead_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_lead_komplett(p_lead_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_lead_komplett(p_lead_id uuid) TO service_role;


--
-- Name: FUNCTION dispatcher_owns_lead(p_lead_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dispatcher_owns_lead(p_lead_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dispatcher_owns_lead(p_lead_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.dispatcher_owns_lead(p_lead_id uuid) TO authenticated;


--
-- Name: FUNCTION dokument_katalog_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dokument_katalog_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.dokument_katalog_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.dokument_katalog_set_updated_at() TO service_role;


--
-- Name: FUNCTION dsgvo_anonymize_user_data(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION expire_geblockte_termine_ohne_sa(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.expire_geblockte_termine_ohne_sa() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_geblockte_termine_ohne_sa() TO service_role;


--
-- Name: FUNCTION fall_validate_kb_rolle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fall_validate_kb_rolle() TO anon;
GRANT ALL ON FUNCTION public.fall_validate_kb_rolle() TO authenticated;
GRANT ALL ON FUNCTION public.fall_validate_kb_rolle() TO service_role;


--
-- Name: FUNCTION get_sv_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_sv_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_sv_id() TO service_role;
GRANT ALL ON FUNCTION public.get_sv_id() TO authenticated;


--
-- Name: FUNCTION get_user_rolle(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_rolle() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_rolle() TO service_role;


--
-- Name: FUNCTION guard_claims_created_by(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_claims_created_by() TO anon;
GRANT ALL ON FUNCTION public.guard_claims_created_by() TO authenticated;
GRANT ALL ON FUNCTION public.guard_claims_created_by() TO service_role;


--
-- Name: FUNCTION guard_makler_privilegien(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_makler_privilegien() TO anon;
GRANT ALL ON FUNCTION public.guard_makler_privilegien() TO authenticated;
GRANT ALL ON FUNCTION public.guard_makler_privilegien() TO service_role;


--
-- Name: FUNCTION guard_profiles_rolle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_profiles_rolle() TO anon;
GRANT ALL ON FUNCTION public.guard_profiles_rolle() TO authenticated;
GRANT ALL ON FUNCTION public.guard_profiles_rolle() TO service_role;


--
-- Name: FUNCTION guard_sachverstaendige_privilegien(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_sachverstaendige_privilegien() TO anon;
GRANT ALL ON FUNCTION public.guard_sachverstaendige_privilegien() TO authenticated;
GRANT ALL ON FUNCTION public.guard_sachverstaendige_privilegien() TO service_role;


--
-- Name: FUNCTION gutachter_waitlist_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gutachter_waitlist_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.gutachter_waitlist_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.gutachter_waitlist_touch_updated_at() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) TO anon;
GRANT ALL ON FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) TO authenticated;
GRANT ALL ON FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) TO service_role;


--
-- Name: FUNCTION increment_offene_faelle(sv_id_param uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_offene_faelle(sv_id_param uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_offene_faelle(sv_id_param uuid) TO service_role;


--
-- Name: FUNCTION invalidate_whatsapp_cache_on_phone_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invalidate_whatsapp_cache_on_phone_change() TO anon;
GRANT ALL ON FUNCTION public.invalidate_whatsapp_cache_on_phone_change() TO authenticated;
GRANT ALL ON FUNCTION public.invalidate_whatsapp_cache_on_phone_change() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO anon;


--
-- Name: FUNCTION is_claim_user_party(p_claim_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_claim_user_party(p_claim_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_claim_user_party(p_claim_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_claim_user_party(p_claim_id uuid) TO authenticated;


--
-- Name: FUNCTION is_dispatcher(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_dispatcher() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_dispatcher() TO service_role;
GRANT ALL ON FUNCTION public.is_dispatcher() TO authenticated;


--
-- Name: FUNCTION is_kanzlei(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_kanzlei() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_kanzlei() TO service_role;
GRANT ALL ON FUNCTION public.is_kanzlei() TO authenticated;


--
-- Name: FUNCTION is_kundenbetreuer(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_kundenbetreuer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_kundenbetreuer() TO service_role;
GRANT ALL ON FUNCTION public.is_kundenbetreuer() TO authenticated;


--
-- Name: FUNCTION is_staff(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_staff() TO service_role;
GRANT ALL ON FUNCTION public.is_staff() TO authenticated;


--
-- Name: FUNCTION is_sv(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_sv() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_sv() TO service_role;
GRANT ALL ON FUNCTION public.is_sv() TO authenticated;


--
-- Name: FUNCTION is_sv_for_claim(p_claim_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_sv_for_claim(p_claim_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_sv_for_claim(p_claim_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_sv_for_claim(p_claim_id uuid) TO authenticated;


--
-- Name: FUNCTION kanzlei_faelle_sync_claim_fall(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kanzlei_faelle_sync_claim_fall() TO anon;
GRANT ALL ON FUNCTION public.kanzlei_faelle_sync_claim_fall() TO authenticated;
GRANT ALL ON FUNCTION public.kanzlei_faelle_sync_claim_fall() TO service_role;


--
-- Name: FUNCTION link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid) TO service_role;


--
-- Name: FUNCTION log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION log_lead_changes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_lead_changes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_lead_changes() TO service_role;


--
-- Name: FUNCTION log_phase_transition(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_phase_transition() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_phase_transition() TO service_role;


--
-- Name: FUNCTION mark_expired_leads(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_expired_leads() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_expired_leads() TO service_role;


--
-- Name: FUNCTION next_rechnungs_nr(p_serie text, p_jahr integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.next_rechnungs_nr(p_serie text, p_jahr integer) TO anon;
GRANT ALL ON FUNCTION public.next_rechnungs_nr(p_serie text, p_jahr integer) TO authenticated;
GRANT ALL ON FUNCTION public.next_rechnungs_nr(p_serie text, p_jahr integer) TO service_role;


--
-- Name: FUNCTION notify_admins(p_titel text, p_nachricht text, p_link text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_admins(p_titel text, p_nachricht text, p_link text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_admins(p_titel text, p_nachricht text, p_link text) TO service_role;


--
-- Name: FUNCTION personenschaden_personen_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.personenschaden_personen_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.personenschaden_personen_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.personenschaden_personen_set_updated_at() TO service_role;


--
-- Name: FUNCTION safe_to_date(p_text text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.safe_to_date(p_text text) TO anon;
GRANT ALL ON FUNCTION public.safe_to_date(p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.safe_to_date(p_text text) TO service_role;


--
-- Name: FUNCTION safe_to_time(p_text text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.safe_to_time(p_text text) TO anon;
GRANT ALL ON FUNCTION public.safe_to_time(p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.safe_to_time(p_text text) TO service_role;


--
-- Name: FUNCTION set_airdrop_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_airdrop_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_airdrop_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_airdrop_updated_at() TO service_role;


--
-- Name: FUNCTION set_claim_mietwagen_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_claim_mietwagen_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_claim_mietwagen_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_claim_mietwagen_updated_at() TO service_role;


--
-- Name: FUNCTION set_claim_nummer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_claim_nummer() TO anon;
GRANT ALL ON FUNCTION public.set_claim_nummer() TO authenticated;
GRANT ALL ON FUNCTION public.set_claim_nummer() TO service_role;


--
-- Name: FUNCTION set_claim_parties_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_claim_parties_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_claim_parties_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_claim_parties_updated_at() TO service_role;


--
-- Name: FUNCTION set_claim_payments_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_claim_payments_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_claim_payments_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_claim_payments_updated_at() TO service_role;


--
-- Name: FUNCTION set_claims_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_claims_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_claims_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_claims_updated_at() TO service_role;


--
-- Name: FUNCTION set_claims_verjaehrung(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_claims_verjaehrung() TO anon;
GRANT ALL ON FUNCTION public.set_claims_verjaehrung() TO authenticated;
GRANT ALL ON FUNCTION public.set_claims_verjaehrung() TO service_role;


--
-- Name: FUNCTION set_gutachten_positionen_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_gutachten_positionen_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_gutachten_positionen_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_gutachten_positionen_updated_at() TO service_role;


--
-- Name: FUNCTION set_gutachten_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_gutachten_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_gutachten_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_gutachten_updated_at() TO service_role;


--
-- Name: FUNCTION set_kanzlei_pakete_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_kanzlei_pakete_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_kanzlei_pakete_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_kanzlei_pakete_updated_at() TO service_role;


--
-- Name: FUNCTION set_laeufer_report_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_laeufer_report_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_laeufer_report_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_laeufer_report_updated_at() TO service_role;


--
-- Name: FUNCTION set_lead_nummer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_lead_nummer() TO anon;
GRANT ALL ON FUNCTION public.set_lead_nummer() TO authenticated;
GRANT ALL ON FUNCTION public.set_lead_nummer() TO service_role;


--
-- Name: FUNCTION set_repairs_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_repairs_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_repairs_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_repairs_updated_at() TO service_role;


--
-- Name: FUNCTION set_sv_buero_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_sv_buero_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_sv_buero_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_sv_buero_updated_at() TO service_role;


--
-- Name: FUNCTION set_sv_org_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_sv_org_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_sv_org_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_sv_org_updated_at() TO service_role;


--
-- Name: FUNCTION set_updated_at_now(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at_now() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at_now() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at_now() TO service_role;


--
-- Name: FUNCTION set_vehicle_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_vehicle_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_vehicle_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_vehicle_updated_at() TO service_role;


--
-- Name: FUNCTION set_werkstaetten_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_werkstaetten_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_werkstaetten_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_werkstaetten_updated_at() TO service_role;


--
-- Name: FUNCTION sv_kalender_verbindungen_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sv_kalender_verbindungen_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.sv_kalender_verbindungen_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.sv_kalender_verbindungen_set_updated_at() TO service_role;


--
-- Name: FUNCTION sv_private_stops_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sv_private_stops_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.sv_private_stops_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.sv_private_stops_touch_updated_at() TO service_role;


--
-- Name: FUNCTION sync_claims_sv_id_to_faelle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_claims_sv_id_to_faelle() TO anon;
GRANT ALL ON FUNCTION public.sync_claims_sv_id_to_faelle() TO authenticated;
GRANT ALL ON FUNCTION public.sync_claims_sv_id_to_faelle() TO service_role;


--
-- Name: FUNCTION sync_faelle_sv_id_to_claims(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_faelle_sv_id_to_claims() TO anon;
GRANT ALL ON FUNCTION public.sync_faelle_sv_id_to_claims() TO authenticated;
GRANT ALL ON FUNCTION public.sync_faelle_sv_id_to_claims() TO service_role;


--
-- Name: FUNCTION sync_fall_dokumente_claim_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_fall_dokumente_claim_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_fall_dokumente_claim_id() TO service_role;


--
-- Name: FUNCTION tg_auftraege_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_auftraege_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tg_auftraege_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tg_auftraege_set_updated_at() TO service_role;


--
-- Name: FUNCTION tg_termin_sync_auftrag_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_termin_sync_auftrag_status() TO anon;
GRANT ALL ON FUNCTION public.tg_termin_sync_auftrag_status() TO authenticated;
GRANT ALL ON FUNCTION public.tg_termin_sync_auftrag_status() TO service_role;


--
-- Name: FUNCTION touch_claim_recency(p_claim_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_claim_recency(p_claim_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_claim_recency(p_claim_id uuid) TO anon;
GRANT ALL ON FUNCTION public.touch_claim_recency(p_claim_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.touch_claim_recency(p_claim_id uuid) TO service_role;


--
-- Name: FUNCTION trg_fall_dokumente_autotask(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_fall_dokumente_autotask() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_fall_dokumente_autotask() TO service_role;


--
-- Name: FUNCTION trg_filmcheck_benachrichtigung(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_filmcheck_benachrichtigung() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_filmcheck_benachrichtigung() TO service_role;


--
-- Name: FUNCTION trg_fn_sync_kanzlei_paket_to_faelle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle() TO anon;
GRANT ALL ON FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle() TO authenticated;
GRANT ALL ON FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle() TO service_role;


--
-- Name: FUNCTION trg_gutachten_benachrichtigung(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_gutachten_benachrichtigung() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_gutachten_benachrichtigung() TO service_role;


--
-- Name: FUNCTION trg_kanzlei_admin_termine_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_kanzlei_admin_termine_updated_at() TO anon;
GRANT ALL ON FUNCTION public.trg_kanzlei_admin_termine_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.trg_kanzlei_admin_termine_updated_at() TO service_role;


--
-- Name: FUNCTION trg_lead_benachrichtigung(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_lead_benachrichtigung() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_lead_benachrichtigung() TO service_role;


--
-- Name: FUNCTION trg_regulierung_benachrichtigung(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_regulierung_benachrichtigung() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_regulierung_benachrichtigung() TO service_role;


--
-- Name: FUNCTION trigger_kanzlei_provision(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trigger_kanzlei_provision() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trigger_kanzlei_provision() TO service_role;


--
-- Name: FUNCTION trigger_sa_bestaetigt_termin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trigger_sa_bestaetigt_termin() TO anon;
GRANT ALL ON FUNCTION public.trigger_sa_bestaetigt_termin() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_sa_bestaetigt_termin() TO service_role;


--
-- Name: FUNCTION update_aktualisiert_am_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_aktualisiert_am_column() TO anon;
GRANT ALL ON FUNCTION public.update_aktualisiert_am_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_aktualisiert_am_column() TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION update_versicherungen_aktualisiert_am(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_versicherungen_aktualisiert_am() TO anon;
GRANT ALL ON FUNCTION public.update_versicherungen_aktualisiert_am() TO authenticated;
GRANT ALL ON FUNCTION public.update_versicherungen_aktualisiert_am() TO service_role;


--
-- Name: FUNCTION upsert_vehicle_by_fin(p_fin character varying, p_kennzeichen character varying, p_hsn character varying, p_tsn character varying, p_hersteller text, p_modell text, p_owner_id uuid, p_quelle text, p_kilometerstand integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.upsert_vehicle_by_fin(p_fin character varying, p_kennzeichen character varying, p_hsn character varying, p_tsn character varying, p_hersteller text, p_modell text, p_owner_id uuid, p_quelle text, p_kilometerstand integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_vehicle_by_fin(p_fin character varying, p_kennzeichen character varying, p_hsn character varying, p_tsn character varying, p_hersteller text, p_modell text, p_owner_id uuid, p_quelle text, p_kilometerstand integer) TO service_role;


--
-- Name: FUNCTION validate_gutachter_termine_claim_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_gutachter_termine_claim_id() TO anon;
GRANT ALL ON FUNCTION public.validate_gutachter_termine_claim_id() TO authenticated;
GRANT ALL ON FUNCTION public.validate_gutachter_termine_claim_id() TO service_role;


--
-- Name: TABLE abrechnung_positionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.abrechnung_positionen TO authenticated;
GRANT ALL ON TABLE public.abrechnung_positionen TO service_role;


--
-- Name: TABLE abrechnung_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.abrechnung_reminders TO authenticated;
GRANT ALL ON TABLE public.abrechnung_reminders TO service_role;


--
-- Name: TABLE abrechnungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.abrechnungen TO authenticated;
GRANT ALL ON TABLE public.abrechnungen TO service_role;


--
-- Name: TABLE admin_termine; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_termine TO anon;
GRANT ALL ON TABLE public.admin_termine TO authenticated;
GRANT ALL ON TABLE public.admin_termine TO service_role;


--
-- Name: TABLE ai_usage_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_usage_log TO anon;
GRANT ALL ON TABLE public.ai_usage_log TO authenticated;
GRANT ALL ON TABLE public.ai_usage_log TO service_role;


--
-- Name: TABLE aircall_calls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aircall_calls TO anon;
GRANT ALL ON TABLE public.aircall_calls TO authenticated;
GRANT ALL ON TABLE public.aircall_calls TO service_role;


--
-- Name: SEQUENCE aircall_calls_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.aircall_calls_id_seq TO anon;
GRANT ALL ON SEQUENCE public.aircall_calls_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.aircall_calls_id_seq TO service_role;


--
-- Name: TABLE aircall_relay_seats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aircall_relay_seats TO anon;
GRANT ALL ON TABLE public.aircall_relay_seats TO authenticated;
GRANT ALL ON TABLE public.aircall_relay_seats TO service_role;


--
-- Name: TABLE airdrop_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.airdrop_invitations TO anon;
GRANT ALL ON TABLE public.airdrop_invitations TO authenticated;
GRANT ALL ON TABLE public.airdrop_invitations TO service_role;


--
-- Name: TABLE anfragen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.anfragen TO anon;
GRANT ALL ON TABLE public.anfragen TO authenticated;
GRANT ALL ON TABLE public.anfragen TO service_role;


--
-- Name: TABLE anruf_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.anruf_log TO anon;
GRANT ALL ON TABLE public.anruf_log TO authenticated;
GRANT ALL ON TABLE public.anruf_log TO service_role;


--
-- Name: TABLE auftraege; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auftraege TO anon;
GRANT ALL ON TABLE public.auftraege TO authenticated;
GRANT ALL ON TABLE public.auftraege TO service_role;


--
-- Name: TABLE auth_remember_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auth_remember_tokens TO anon;
GRANT ALL ON TABLE public.auth_remember_tokens TO authenticated;
GRANT ALL ON TABLE public.auth_remember_tokens TO service_role;


--
-- Name: TABLE benachrichtigungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.benachrichtigungen TO anon;
GRANT ALL ON TABLE public.benachrichtigungen TO authenticated;
GRANT ALL ON TABLE public.benachrichtigungen TO service_role;


--
-- Name: TABLE bkat_tatbestaende; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bkat_tatbestaende TO anon;
GRANT ALL ON TABLE public.bkat_tatbestaende TO authenticated;
GRANT ALL ON TABLE public.bkat_tatbestaende TO service_role;


--
-- Name: TABLE branchen_benchmarks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branchen_benchmarks TO anon;
GRANT ALL ON TABLE public.branchen_benchmarks TO authenticated;
GRANT ALL ON TABLE public.branchen_benchmarks TO service_role;


--
-- Name: TABLE call_copilot_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.call_copilot_suggestions TO anon;
GRANT ALL ON TABLE public.call_copilot_suggestions TO authenticated;
GRANT ALL ON TABLE public.call_copilot_suggestions TO service_role;


--
-- Name: TABLE call_transcription_utterances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.call_transcription_utterances TO anon;
GRANT ALL ON TABLE public.call_transcription_utterances TO authenticated;
GRANT ALL ON TABLE public.call_transcription_utterances TO service_role;


--
-- Name: TABLE calls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calls TO anon;
GRANT ALL ON TABLE public.calls TO authenticated;
GRANT ALL ON TABLE public.calls TO service_role;


--
-- Name: TABLE claim_mietwagen; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.claim_mietwagen TO anon;
GRANT ALL ON TABLE public.claim_mietwagen TO authenticated;
GRANT ALL ON TABLE public.claim_mietwagen TO service_role;


--
-- Name: TABLE claim_parties; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.claim_parties TO anon;
GRANT ALL ON TABLE public.claim_parties TO authenticated;
GRANT ALL ON TABLE public.claim_parties TO service_role;


--
-- Name: TABLE claim_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.claim_payments TO authenticated;
GRANT ALL ON TABLE public.claim_payments TO service_role;


--
-- Name: TABLE claim_recency; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.claim_recency TO anon;
GRANT ALL ON TABLE public.claim_recency TO authenticated;
GRANT ALL ON TABLE public.claim_recency TO service_role;


--
-- Name: TABLE claim_vehicle_involvements; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.claim_vehicle_involvements TO anon;
GRANT ALL ON TABLE public.claim_vehicle_involvements TO authenticated;
GRANT ALL ON TABLE public.claim_vehicle_involvements TO service_role;


--
-- Name: TABLE claims; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.claims TO anon;
GRANT ALL ON TABLE public.claims TO authenticated;
GRANT ALL ON TABLE public.claims TO service_role;


--
-- Name: SEQUENCE claims_claim_nummer_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.claims_claim_nummer_seq TO anon;
GRANT ALL ON SEQUENCE public.claims_claim_nummer_seq TO authenticated;
GRANT ALL ON SEQUENCE public.claims_claim_nummer_seq TO service_role;


--
-- Name: TABLE communities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.communities TO anon;
GRANT ALL ON TABLE public.communities TO authenticated;
GRANT ALL ON TABLE public.communities TO service_role;


--
-- Name: TABLE community_leaderboard; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_leaderboard TO anon;
GRANT ALL ON TABLE public.community_leaderboard TO authenticated;
GRANT ALL ON TABLE public.community_leaderboard TO service_role;


--
-- Name: TABLE community_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_memberships TO anon;
GRANT ALL ON TABLE public.community_memberships TO authenticated;
GRANT ALL ON TABLE public.community_memberships TO service_role;


--
-- Name: TABLE consent_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.consent_records TO anon;
GRANT ALL ON TABLE public.consent_records TO authenticated;
GRANT ALL ON TABLE public.consent_records TO service_role;


--
-- Name: TABLE content_translations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.content_translations TO anon;
GRANT ALL ON TABLE public.content_translations TO authenticated;
GRANT ALL ON TABLE public.content_translations TO service_role;


--
-- Name: TABLE conversion_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversion_events TO service_role;


--
-- Name: TABLE cron_jobs_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cron_jobs_audit TO anon;
GRANT ALL ON TABLE public.cron_jobs_audit TO authenticated;
GRANT ALL ON TABLE public.cron_jobs_audit TO service_role;


--
-- Name: TABLE dokument_katalog; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dokument_katalog TO anon;
GRANT ALL ON TABLE public.dokument_katalog TO authenticated;
GRANT ALL ON TABLE public.dokument_katalog TO service_role;


--
-- Name: TABLE dokument_upload_anfragen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dokument_upload_anfragen TO anon;
GRANT ALL ON TABLE public.dokument_upload_anfragen TO authenticated;
GRANT ALL ON TABLE public.dokument_upload_anfragen TO service_role;


--
-- Name: TABLE dsgvo_loeschauftraege; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dsgvo_loeschauftraege TO anon;
GRANT ALL ON TABLE public.dsgvo_loeschauftraege TO authenticated;
GRANT ALL ON TABLE public.dsgvo_loeschauftraege TO service_role;


--
-- Name: TABLE email_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_log TO anon;
GRANT ALL ON TABLE public.email_log TO authenticated;
GRANT ALL ON TABLE public.email_log TO service_role;


--
-- Name: TABLE email_otp_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_otp_codes TO anon;
GRANT ALL ON TABLE public.email_otp_codes TO authenticated;
GRANT ALL ON TABLE public.email_otp_codes TO service_role;


--
-- Name: TABLE embed_abrechnung_positionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.embed_abrechnung_positionen TO anon;
GRANT ALL ON TABLE public.embed_abrechnung_positionen TO authenticated;
GRANT ALL ON TABLE public.embed_abrechnung_positionen TO service_role;


--
-- Name: TABLE embed_sites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.embed_sites TO anon;
GRANT ALL ON TABLE public.embed_sites TO authenticated;
GRANT ALL ON TABLE public.embed_sites TO service_role;


--
-- Name: TABLE faelle; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faelle TO anon;
GRANT ALL ON TABLE public.faelle TO authenticated;
GRANT ALL ON TABLE public.faelle TO service_role;


--
-- Name: TABLE gutachter_termine; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.gutachter_termine TO anon;
GRANT ALL ON TABLE public.gutachter_termine TO authenticated;
GRANT ALL ON TABLE public.gutachter_termine TO service_role;


--
-- Name: TABLE kanzlei_faelle; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanzlei_faelle TO anon;
GRANT ALL ON TABLE public.kanzlei_faelle TO authenticated;
GRANT ALL ON TABLE public.kanzlei_faelle TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads TO anon;
GRANT ALL ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: TABLE v_claim_phase; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_claim_phase TO anon;
GRANT ALL ON TABLE public.v_claim_phase TO authenticated;
GRANT ALL ON TABLE public.v_claim_phase TO service_role;


--
-- Name: TABLE faelle_kunde_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faelle_kunde_view TO anon;
GRANT ALL ON TABLE public.faelle_kunde_view TO authenticated;
GRANT ALL ON TABLE public.faelle_kunde_view TO service_role;


--
-- Name: TABLE gutachten; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.gutachten TO anon;
GRANT ALL ON TABLE public.gutachten TO authenticated;
GRANT ALL ON TABLE public.gutachten TO service_role;


--
-- Name: TABLE faelle_sv_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faelle_sv_view TO anon;
GRANT ALL ON TABLE public.faelle_sv_view TO authenticated;
GRANT ALL ON TABLE public.faelle_sv_view TO service_role;


--
-- Name: TABLE fall_dokumente; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fall_dokumente TO anon;
GRANT ALL ON TABLE public.fall_dokumente TO authenticated;
GRANT ALL ON TABLE public.fall_dokumente TO service_role;


--
-- Name: TABLE fall_read_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fall_read_state TO anon;
GRANT ALL ON TABLE public.fall_read_state TO authenticated;
GRANT ALL ON TABLE public.fall_read_state TO service_role;


--
-- Name: TABLE fall_summaries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fall_summaries TO anon;
GRANT ALL ON TABLE public.fall_summaries TO authenticated;
GRANT ALL ON TABLE public.fall_summaries TO service_role;


--
-- Name: TABLE finance_eintraege; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.finance_eintraege TO authenticated;
GRANT ALL ON TABLE public.finance_eintraege TO service_role;


--
-- Name: TABLE finance_monatsberichte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.finance_monatsberichte TO authenticated;
GRANT ALL ON TABLE public.finance_monatsberichte TO service_role;


--
-- Name: TABLE flow_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.flow_links TO service_role;


--
-- Name: TABLE forderungspositionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forderungspositionen TO anon;
GRANT ALL ON TABLE public.forderungspositionen TO authenticated;
GRANT ALL ON TABLE public.forderungspositionen TO service_role;


--
-- Name: TABLE gebiet_exklusivitaeten; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gebiet_exklusivitaeten TO anon;
GRANT ALL ON TABLE public.gebiet_exklusivitaeten TO authenticated;
GRANT ALL ON TABLE public.gebiet_exklusivitaeten TO service_role;


--
-- Name: TABLE gfa_rate_limit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gfa_rate_limit TO service_role;


--
-- Name: SEQUENCE gfa_rate_limit_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.gfa_rate_limit_id_seq TO anon;
GRANT ALL ON SEQUENCE public.gfa_rate_limit_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.gfa_rate_limit_id_seq TO service_role;


--
-- Name: TABLE google_bewertungen_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.google_bewertungen_cache TO anon;
GRANT ALL ON TABLE public.google_bewertungen_cache TO authenticated;
GRANT ALL ON TABLE public.google_bewertungen_cache TO service_role;


--
-- Name: TABLE gutachten_fotos; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.gutachten_fotos TO anon;
GRANT ALL ON TABLE public.gutachten_fotos TO authenticated;
GRANT ALL ON TABLE public.gutachten_fotos TO service_role;


--
-- Name: TABLE gutachten_positionen; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.gutachten_positionen TO anon;
GRANT ALL ON TABLE public.gutachten_positionen TO authenticated;
GRANT ALL ON TABLE public.gutachten_positionen TO service_role;


--
-- Name: TABLE gutachter_abrechnungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_abrechnungen TO authenticated;
GRANT ALL ON TABLE public.gutachter_abrechnungen TO service_role;


--
-- Name: TABLE gutachter_abrechnungspositionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_abrechnungspositionen TO authenticated;
GRANT ALL ON TABLE public.gutachter_abrechnungspositionen TO service_role;


--
-- Name: TABLE gutachter_einzahlungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_einzahlungen TO anon;
GRANT ALL ON TABLE public.gutachter_einzahlungen TO authenticated;
GRANT ALL ON TABLE public.gutachter_einzahlungen TO service_role;


--
-- Name: TABLE gutachter_finder_anfragen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_finder_anfragen TO anon;
GRANT ALL ON TABLE public.gutachter_finder_anfragen TO authenticated;
GRANT ALL ON TABLE public.gutachter_finder_anfragen TO service_role;


--
-- Name: TABLE gutachter_mitteilungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_mitteilungen TO anon;
GRANT ALL ON TABLE public.gutachter_mitteilungen TO authenticated;
GRANT ALL ON TABLE public.gutachter_mitteilungen TO service_role;


--
-- Name: TABLE gutachter_monatsabrechnungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_monatsabrechnungen TO authenticated;
GRANT ALL ON TABLE public.gutachter_monatsabrechnungen TO service_role;


--
-- Name: TABLE gutachter_waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutachter_waitlist TO anon;
GRANT ALL ON TABLE public.gutachter_waitlist TO authenticated;
GRANT ALL ON TABLE public.gutachter_waitlist TO service_role;


--
-- Name: TABLE gutschriften; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gutschriften TO anon;
GRANT ALL ON TABLE public.gutschriften TO authenticated;
GRANT ALL ON TABLE public.gutschriften TO service_role;


--
-- Name: TABLE incentive_auszahlungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incentive_auszahlungen TO authenticated;
GRANT ALL ON TABLE public.incentive_auszahlungen TO service_role;


--
-- Name: TABLE incentives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incentives TO authenticated;
GRANT ALL ON TABLE public.incentives TO service_role;


--
-- Name: TABLE individuelle_anfragen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.individuelle_anfragen TO anon;
GRANT ALL ON TABLE public.individuelle_anfragen TO authenticated;
GRANT ALL ON TABLE public.individuelle_anfragen TO service_role;


--
-- Name: TABLE kanzlei_abrechnung_positionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanzlei_abrechnung_positionen TO authenticated;
GRANT ALL ON TABLE public.kanzlei_abrechnung_positionen TO service_role;


--
-- Name: TABLE kanzlei_abrechnung_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanzlei_abrechnung_reminders TO authenticated;
GRANT ALL ON TABLE public.kanzlei_abrechnung_reminders TO service_role;


--
-- Name: TABLE kanzlei_abrechnungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanzlei_abrechnungen TO authenticated;
GRANT ALL ON TABLE public.kanzlei_abrechnungen TO service_role;


--
-- Name: TABLE kanzlei_admin_termine; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanzlei_admin_termine TO anon;
GRANT ALL ON TABLE public.kanzlei_admin_termine TO authenticated;
GRANT ALL ON TABLE public.kanzlei_admin_termine TO service_role;


--
-- Name: TABLE kanzlei_pakete; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.kanzlei_pakete TO anon;
GRANT ALL ON TABLE public.kanzlei_pakete TO authenticated;
GRANT ALL ON TABLE public.kanzlei_pakete TO service_role;


--
-- Name: TABLE kanzleien; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanzleien TO anon;
GRANT ALL ON TABLE public.kanzleien TO authenticated;
GRANT ALL ON TABLE public.kanzleien TO service_role;


--
-- Name: TABLE ki_gespraeche; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ki_gespraeche TO anon;
GRANT ALL ON TABLE public.ki_gespraeche TO authenticated;
GRANT ALL ON TABLE public.ki_gespraeche TO service_role;


--
-- Name: TABLE kunde_gutachten_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kunde_gutachten_requests TO service_role;


--
-- Name: TABLE kunde_live_position; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kunde_live_position TO anon;
GRANT ALL ON TABLE public.kunde_live_position TO authenticated;
GRANT ALL ON TABLE public.kunde_live_position TO service_role;


--
-- Name: TABLE lead_historie; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_historie TO service_role;


--
-- Name: TABLE leadpreise_tabelle; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leadpreise_tabelle TO anon;
GRANT ALL ON TABLE public.leadpreise_tabelle TO authenticated;
GRANT ALL ON TABLE public.leadpreise_tabelle TO service_role;


--
-- Name: SEQUENCE leads_lead_nummer_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.leads_lead_nummer_seq TO anon;
GRANT ALL ON SEQUENCE public.leads_lead_nummer_seq TO authenticated;
GRANT ALL ON SEQUENCE public.leads_lead_nummer_seq TO service_role;


--
-- Name: TABLE makler; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.makler TO anon;
GRANT ALL ON TABLE public.makler TO authenticated;
GRANT ALL ON TABLE public.makler TO service_role;


--
-- Name: TABLE makler_fall_consent; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.makler_fall_consent TO anon;
GRANT ALL ON TABLE public.makler_fall_consent TO authenticated;
GRANT ALL ON TABLE public.makler_fall_consent TO service_role;


--
-- Name: TABLE makler_provisionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.makler_provisionen TO authenticated;
GRANT ALL ON TABLE public.makler_provisionen TO service_role;


--
-- Name: TABLE matelso_calls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.matelso_calls TO anon;
GRANT ALL ON TABLE public.matelso_calls TO authenticated;
GRANT ALL ON TABLE public.matelso_calls TO service_role;


--
-- Name: SEQUENCE matelso_calls_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.matelso_calls_id_seq TO anon;
GRANT ALL ON SEQUENCE public.matelso_calls_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.matelso_calls_id_seq TO service_role;


--
-- Name: TABLE mitarbeiter_performance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mitarbeiter_performance TO anon;
GRANT ALL ON TABLE public.mitarbeiter_performance TO authenticated;
GRANT ALL ON TABLE public.mitarbeiter_performance TO service_role;


--
-- Name: TABLE mitteilungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mitteilungen TO anon;
GRANT ALL ON TABLE public.mitteilungen TO authenticated;
GRANT ALL ON TABLE public.mitteilungen TO service_role;


--
-- Name: TABLE nachrichten; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nachrichten TO anon;
GRANT ALL ON TABLE public.nachrichten TO authenticated;
GRANT ALL ON TABLE public.nachrichten TO service_role;


--
-- Name: TABLE notification_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_deliveries TO anon;
GRANT ALL ON TABLE public.notification_deliveries TO authenticated;
GRANT ALL ON TABLE public.notification_deliveries TO service_role;


--
-- Name: TABLE notification_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_events TO anon;
GRANT ALL ON TABLE public.notification_events TO authenticated;
GRANT ALL ON TABLE public.notification_events TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE ocr_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ocr_runs TO anon;
GRANT ALL ON TABLE public.ocr_runs TO authenticated;
GRANT ALL ON TABLE public.ocr_runs TO service_role;


--
-- Name: TABLE onboarding_felder; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.onboarding_felder TO anon;
GRANT ALL ON TABLE public.onboarding_felder TO authenticated;
GRANT ALL ON TABLE public.onboarding_felder TO service_role;


--
-- Name: TABLE onboarding_phasen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.onboarding_phasen TO anon;
GRANT ALL ON TABLE public.onboarding_phasen TO authenticated;
GRANT ALL ON TABLE public.onboarding_phasen TO service_role;


--
-- Name: TABLE organisationen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organisationen TO anon;
GRANT ALL ON TABLE public.organisationen TO authenticated;
GRANT ALL ON TABLE public.organisationen TO service_role;


--
-- Name: TABLE paket_upgrades; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.paket_upgrades TO anon;
GRANT ALL ON TABLE public.paket_upgrades TO authenticated;
GRANT ALL ON TABLE public.paket_upgrades TO service_role;


--
-- Name: TABLE parteien; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parteien TO anon;
GRANT ALL ON TABLE public.parteien TO authenticated;
GRANT ALL ON TABLE public.parteien TO service_role;


--
-- Name: TABLE personenschaden_personen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personenschaden_personen TO anon;
GRANT ALL ON TABLE public.personenschaden_personen TO authenticated;
GRANT ALL ON TABLE public.personenschaden_personen TO service_role;


--
-- Name: TABLE pflichtdokumente; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pflichtdokumente TO anon;
GRANT ALL ON TABLE public.pflichtdokumente TO authenticated;
GRANT ALL ON TABLE public.pflichtdokumente TO service_role;


--
-- Name: TABLE phase_transitions; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.phase_transitions TO anon;
GRANT ALL ON TABLE public.phase_transitions TO authenticated;
GRANT ALL ON TABLE public.phase_transitions TO service_role;


--
-- Name: TABLE plz_geo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plz_geo TO anon;
GRANT ALL ON TABLE public.plz_geo TO authenticated;
GRANT ALL ON TABLE public.plz_geo TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE promo_clicks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_clicks TO anon;
GRANT ALL ON TABLE public.promo_clicks TO authenticated;
GRANT ALL ON TABLE public.promo_clicks TO service_role;


--
-- Name: TABLE promotion_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promotion_codes TO anon;
GRANT ALL ON TABLE public.promotion_codes TO authenticated;
GRANT ALL ON TABLE public.promotion_codes TO service_role;


--
-- Name: TABLE provisionen_maik; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provisionen_maik TO authenticated;
GRANT ALL ON TABLE public.provisionen_maik TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE qc_checkliste; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qc_checkliste TO anon;
GRANT ALL ON TABLE public.qc_checkliste TO authenticated;
GRANT ALL ON TABLE public.qc_checkliste TO service_role;


--
-- Name: TABLE rechnungs_konfiguration; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rechnungs_konfiguration TO service_role;


--
-- Name: TABLE rechnungs_nr_counter; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rechnungs_nr_counter TO service_role;


--
-- Name: TABLE regulierungs_klassifizierung; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.regulierungs_klassifizierung TO anon;
GRANT ALL ON TABLE public.regulierungs_klassifizierung TO authenticated;
GRANT ALL ON TABLE public.regulierungs_klassifizierung TO service_role;


--
-- Name: TABLE reklamationen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reklamationen TO anon;
GRANT ALL ON TABLE public.reklamationen TO authenticated;
GRANT ALL ON TABLE public.reklamationen TO service_role;


--
-- Name: TABLE repairs; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.repairs TO anon;
GRANT ALL ON TABLE public.repairs TO authenticated;
GRANT ALL ON TABLE public.repairs TO service_role;


--
-- Name: TABLE routing_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routing_cache TO anon;
GRANT ALL ON TABLE public.routing_cache TO authenticated;
GRANT ALL ON TABLE public.routing_cache TO service_role;


--
-- Name: TABLE sachverstaendige; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sachverstaendige TO anon;
GRANT ALL ON TABLE public.sachverstaendige TO authenticated;
GRANT ALL ON TABLE public.sachverstaendige TO service_role;


--
-- Name: TABLE schadenspositionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schadenspositionen TO anon;
GRANT ALL ON TABLE public.schadenspositionen TO authenticated;
GRANT ALL ON TABLE public.schadenspositionen TO service_role;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.settings TO anon;
GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;


--
-- Name: TABLE sla_tracking; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sla_tracking TO anon;
GRANT ALL ON TABLE public.sla_tracking TO authenticated;
GRANT ALL ON TABLE public.sla_tracking TO service_role;


--
-- Name: TABLE stripe_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stripe_events TO anon;
GRANT ALL ON TABLE public.stripe_events TO authenticated;
GRANT ALL ON TABLE public.stripe_events TO service_role;


--
-- Name: TABLE support_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_rate_limits TO anon;
GRANT ALL ON TABLE public.support_rate_limits TO authenticated;
GRANT ALL ON TABLE public.support_rate_limits TO service_role;


--
-- Name: TABLE support_ticket_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_ticket_log TO anon;
GRANT ALL ON TABLE public.support_ticket_log TO authenticated;
GRANT ALL ON TABLE public.support_ticket_log TO service_role;


--
-- Name: SEQUENCE support_ticket_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.support_ticket_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.support_ticket_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.support_ticket_log_id_seq TO service_role;


--
-- Name: TABLE sv_buero; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_buero TO anon;
GRANT ALL ON TABLE public.sv_buero TO authenticated;
GRANT ALL ON TABLE public.sv_buero TO service_role;


--
-- Name: TABLE sv_buero_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_buero_memberships TO anon;
GRANT ALL ON TABLE public.sv_buero_memberships TO authenticated;
GRANT ALL ON TABLE public.sv_buero_memberships TO service_role;


--
-- Name: TABLE sv_community; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_community TO anon;
GRANT ALL ON TABLE public.sv_community TO authenticated;
GRANT ALL ON TABLE public.sv_community TO service_role;


--
-- Name: TABLE sv_kalender_events_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_kalender_events_cache TO anon;
GRANT ALL ON TABLE public.sv_kalender_events_cache TO authenticated;
GRANT ALL ON TABLE public.sv_kalender_events_cache TO service_role;


--
-- Name: TABLE sv_kalender_verbindungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_kalender_verbindungen TO anon;
GRANT ALL ON TABLE public.sv_kalender_verbindungen TO authenticated;
GRANT ALL ON TABLE public.sv_kalender_verbindungen TO service_role;


--
-- Name: TABLE sv_leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_leads TO anon;
GRANT ALL ON TABLE public.sv_leads TO authenticated;
GRANT ALL ON TABLE public.sv_leads TO service_role;


--
-- Name: TABLE sv_live_location; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_live_location TO anon;
GRANT ALL ON TABLE public.sv_live_location TO authenticated;
GRANT ALL ON TABLE public.sv_live_location TO service_role;


--
-- Name: TABLE sv_live_position; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_live_position TO anon;
GRANT ALL ON TABLE public.sv_live_position TO authenticated;
GRANT ALL ON TABLE public.sv_live_position TO service_role;


--
-- Name: TABLE sv_onboarding_rechnungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_onboarding_rechnungen TO service_role;


--
-- Name: TABLE sv_organisation; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_organisation TO anon;
GRANT ALL ON TABLE public.sv_organisation TO authenticated;
GRANT ALL ON TABLE public.sv_organisation TO service_role;


--
-- Name: TABLE sv_organisation_laeufer_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_organisation_laeufer_reports TO anon;
GRANT ALL ON TABLE public.sv_organisation_laeufer_reports TO authenticated;
GRANT ALL ON TABLE public.sv_organisation_laeufer_reports TO service_role;


--
-- Name: TABLE sv_organisation_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_organisation_memberships TO anon;
GRANT ALL ON TABLE public.sv_organisation_memberships TO authenticated;
GRANT ALL ON TABLE public.sv_organisation_memberships TO service_role;


--
-- Name: TABLE sv_payment_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_payment_reminders TO authenticated;
GRANT ALL ON TABLE public.sv_payment_reminders TO service_role;


--
-- Name: TABLE sv_private_stops; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_private_stops TO anon;
GRANT ALL ON TABLE public.sv_private_stops TO authenticated;
GRANT ALL ON TABLE public.sv_private_stops TO service_role;


--
-- Name: TABLE sv_tages_session; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sv_tages_session TO anon;
GRANT ALL ON TABLE public.sv_tages_session TO authenticated;
GRANT ALL ON TABLE public.sv_tages_session TO service_role;


--
-- Name: TABLE task_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_reminders TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE technische_probleme; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.technische_probleme TO anon;
GRANT ALL ON TABLE public.technische_probleme TO authenticated;
GRANT ALL ON TABLE public.technische_probleme TO service_role;


--
-- Name: TABLE termin_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.termin_reminders TO anon;
GRANT ALL ON TABLE public.termin_reminders TO authenticated;
GRANT ALL ON TABLE public.termin_reminders TO service_role;


--
-- Name: TABLE termine; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.termine TO anon;
GRANT ALL ON TABLE public.termine TO authenticated;
GRANT ALL ON TABLE public.termine TO service_role;


--
-- Name: TABLE timeline; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline TO anon;
GRANT ALL ON TABLE public.timeline TO authenticated;
GRANT ALL ON TABLE public.timeline TO service_role;


--
-- Name: TABLE v_claim_for_gast; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_claim_for_gast TO anon;
GRANT ALL ON TABLE public.v_claim_for_gast TO authenticated;
GRANT ALL ON TABLE public.v_claim_for_gast TO service_role;


--
-- Name: TABLE vs_korrespondenz; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.vs_korrespondenz TO anon;
GRANT ALL ON TABLE public.vs_korrespondenz TO authenticated;
GRANT ALL ON TABLE public.vs_korrespondenz TO service_role;


--
-- Name: TABLE v_claim_full; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_claim_full TO anon;
GRANT ALL ON TABLE public.v_claim_full TO authenticated;
GRANT ALL ON TABLE public.v_claim_full TO service_role;


--
-- Name: TABLE vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicles TO anon;
GRANT ALL ON TABLE public.vehicles TO authenticated;
GRANT ALL ON TABLE public.vehicles TO service_role;


--
-- Name: TABLE v_claim_listing; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_claim_listing TO anon;
GRANT ALL ON TABLE public.v_claim_listing TO authenticated;
GRANT ALL ON TABLE public.v_claim_listing TO service_role;


--
-- Name: TABLE v_claim_parties_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_claim_parties_safe TO anon;
GRANT ALL ON TABLE public.v_claim_parties_safe TO authenticated;
GRANT ALL ON TABLE public.v_claim_parties_safe TO service_role;


--
-- Name: TABLE v_claim_sv; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_claim_sv TO anon;
GRANT ALL ON TABLE public.v_claim_sv TO authenticated;
GRANT ALL ON TABLE public.v_claim_sv TO service_role;


--
-- Name: TABLE v_claim_timeline; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.v_claim_timeline TO anon;
GRANT ALL ON TABLE public.v_claim_timeline TO authenticated;
GRANT ALL ON TABLE public.v_claim_timeline TO service_role;


--
-- Name: TABLE v_faelle_mit_aktuellem_termin; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_faelle_mit_aktuellem_termin TO anon;
GRANT ALL ON TABLE public.v_faelle_mit_aktuellem_termin TO authenticated;
GRANT ALL ON TABLE public.v_faelle_mit_aktuellem_termin TO service_role;


--
-- Name: TABLE v_gutachten_werte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_gutachten_werte TO anon;
GRANT ALL ON TABLE public.v_gutachten_werte TO authenticated;
GRANT ALL ON TABLE public.v_gutachten_werte TO service_role;


--
-- Name: TABLE vehicle_ownership_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicle_ownership_history TO anon;
GRANT ALL ON TABLE public.vehicle_ownership_history TO authenticated;
GRANT ALL ON TABLE public.vehicle_ownership_history TO service_role;


--
-- Name: TABLE versicherungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.versicherungen TO anon;
GRANT ALL ON TABLE public.versicherungen TO authenticated;
GRANT ALL ON TABLE public.versicherungen TO service_role;


--
-- Name: TABLE vertraege_unterzeichnet; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vertraege_unterzeichnet TO anon;
GRANT ALL ON TABLE public.vertraege_unterzeichnet TO authenticated;
GRANT ALL ON TABLE public.vertraege_unterzeichnet TO service_role;


--
-- Name: TABLE vertragsvorlagen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vertragsvorlagen TO anon;
GRANT ALL ON TABLE public.vertragsvorlagen TO authenticated;
GRANT ALL ON TABLE public.vertragsvorlagen TO service_role;


--
-- Name: TABLE webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_events TO anon;
GRANT ALL ON TABLE public.webhook_events TO authenticated;
GRANT ALL ON TABLE public.webhook_events TO service_role;


--
-- Name: TABLE werkstaetten; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.werkstaetten TO anon;
GRANT ALL ON TABLE public.werkstaetten TO authenticated;
GRANT ALL ON TABLE public.werkstaetten TO service_role;


--
-- Name: TABLE whatsapp_inbound_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_inbound_messages TO service_role;


--
-- Name: TABLE zahlungseingaenge; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zahlungseingaenge TO anon;
GRANT ALL ON TABLE public.zahlungseingaenge TO authenticated;
GRANT ALL ON TABLE public.zahlungseingaenge TO service_role;


--
-- Name: TABLE zahlungspositionen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zahlungspositionen TO anon;
GRANT ALL ON TABLE public.zahlungspositionen TO authenticated;
GRANT ALL ON TABLE public.zahlungspositionen TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


