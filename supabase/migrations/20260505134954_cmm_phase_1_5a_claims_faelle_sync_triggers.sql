-- CMM Phase 1.5a (2026-05-05) — Bidirektionale Sync-Trigger claims ↔ faelle
--
-- Ziel: claims ist künftig SoT, faelle ist die operative Read-Replica plus
-- Assignment-/Workflow-Tabelle. Bis Reader durchmigriert sind, müssen beide
-- Tabellen für duplizierte Datenspalten synchron bleiben — egal welcher
-- Caller (Server-Action, Cron-Job, Edge Function, Trigger) schreibt.
--
-- Strategie:
--   • Primär-Richtung claims → faelle: jeder Update auf einer der gelisteten
--     Spalten propagiert nach faelle WHERE faelle.claim_id = NEW.id.
--   • Reverse-Richtung faelle → claims: nur als Sicherheitsnetz für Legacy-
--     Caller die noch direkt auf faelle schreiben. Wird nach Phase 3 (Write-
--     Migration) entfernt.
--   • Ping-Pong-Schutz: pg_trigger_depth() > 1 — der Trigger feuert nicht
--     wenn er rekursiv aus dem Gegen-Trigger heraus aufgerufen wird.
--
-- Spalten-Liste:
--   Alle 40 in beiden Tabellen vorhandenen Daten-Spalten — ausgenommen sind:
--   id, created_at, updated_at, lead_id (Meta) + status (claim-Lifecycle ≠
--   fall-Workflow, ABSICHTLICH unterschiedliche Enums).
--
-- Nicht in dieser Migration:
--   • auftraege.claim_id FK (separate Migration 1.5b)
--   • Reader-Migration (Phase 2)
--   • DROP der faelle-Spalten (Phase 4)

-- ─── Sektion 0: Drift-Backfill vor Trigger-Aktivierung ──────────────────
-- claims ist SoT. Wenn aktuell ein Wert auf claims existiert UND auf faelle
-- abweicht, wird faelle nachgezogen. Idempotent (IS DISTINCT FROM ist
-- NULL-safe). Begrenzt auf Rows mit f.claim_id NOT NULL.

UPDATE public.faelle f
SET
  abgeschlossen_am = c.abgeschlossen_am,
  auslandskennzeichen = c.auslandskennzeichen,
  bkat_unfallart = c.bkat_unfallart::public.bkat_unfallart,
  brn = c.brn,
  fahrerflucht = c.fahrerflucht,
  finanzierung_leasing = c.finanzierung_leasing,
  finanzierungsgeber_adresse = c.finanzierungsgeber_adresse,
  finanzierungsgeber_name = c.finanzierungsgeber_name,
  finanzierungsgeber_vertragsnr = c.finanzierungsgeber_vertragsnr,
  firma_name = c.firma_name,
  gegner_bekannt = c.gegner_bekannt,
  gegner_versicherung_id = c.gegner_versicherung_id,
  gegner_versicherungsnummer = c.gegner_versicherungsnummer,
  gewerbe_flag = c.gewerbe_flag,
  kanzlei_ansprechpartner_email = c.kanzlei_ansprechpartner_email,
  kanzlei_ansprechpartner_name = c.kanzlei_ansprechpartner_name,
  kanzlei_ansprechpartner_telefon = c.kanzlei_ansprechpartner_telefon,
  kanzlei_uebergeben_am = c.kanzlei_uebergeben_am,
  kunde_email = c.kunde_email,
  kunden_konstellation = c.kunden_konstellation,
  kundenbetreuer_id = c.kundenbetreuer_id,
  nutzungsausfall_tage = c.nutzungsausfall_tage,
  polizei_aktenzeichen = c.polizei_aktenzeichen,
  polizei_bericht_vorhanden = c.polizei_bericht_vorhanden,
  polizei_vor_ort = c.polizei_vor_ort,
  polizeibericht_status = c.polizeibericht_status,
  restwert = c.restwert,
  sachschaden_beschreibung = c.sachschaden_beschreibung,
  spezifikation = c.spezifikation,
  totalschaden = c.totalschaden,
  unfall_konstellation = c.unfall_konstellation,
  unfallskizze_ablehnung_grund = c.unfallskizze_ablehnung_grund,
  unfallskizze_bestaetigt = c.unfallskizze_bestaetigt,
  unfallskizze_generiert_am = c.unfallskizze_generiert_am,
  unfallskizze_svg = c.unfallskizze_svg,
  unfallskizze_url = c.unfallskizze_url,
  vehicle_id = c.vehicle_id,
  vorsteuerabzugsberechtigt = c.vorsteuerabzugsberechtigt,
  wiederbeschaffungswert = c.wiederbeschaffungswert,
  zeugen_kontakte = c.zeugen_kontakte
FROM public.claims c
WHERE f.claim_id = c.id
  AND (
    f.abgeschlossen_am IS DISTINCT FROM c.abgeschlossen_am OR
    f.auslandskennzeichen IS DISTINCT FROM c.auslandskennzeichen OR
    f.bkat_unfallart::text IS DISTINCT FROM c.bkat_unfallart OR
    f.brn IS DISTINCT FROM c.brn OR
    f.fahrerflucht IS DISTINCT FROM c.fahrerflucht OR
    f.finanzierung_leasing IS DISTINCT FROM c.finanzierung_leasing OR
    f.finanzierungsgeber_adresse IS DISTINCT FROM c.finanzierungsgeber_adresse OR
    f.finanzierungsgeber_name IS DISTINCT FROM c.finanzierungsgeber_name OR
    f.finanzierungsgeber_vertragsnr IS DISTINCT FROM c.finanzierungsgeber_vertragsnr OR
    f.firma_name IS DISTINCT FROM c.firma_name OR
    f.gegner_bekannt IS DISTINCT FROM c.gegner_bekannt OR
    f.gegner_versicherung_id IS DISTINCT FROM c.gegner_versicherung_id OR
    f.gegner_versicherungsnummer IS DISTINCT FROM c.gegner_versicherungsnummer OR
    f.gewerbe_flag IS DISTINCT FROM c.gewerbe_flag OR
    f.kanzlei_ansprechpartner_email IS DISTINCT FROM c.kanzlei_ansprechpartner_email OR
    f.kanzlei_ansprechpartner_name IS DISTINCT FROM c.kanzlei_ansprechpartner_name OR
    f.kanzlei_ansprechpartner_telefon IS DISTINCT FROM c.kanzlei_ansprechpartner_telefon OR
    f.kanzlei_uebergeben_am IS DISTINCT FROM c.kanzlei_uebergeben_am OR
    f.kunde_email IS DISTINCT FROM c.kunde_email OR
    f.kunden_konstellation IS DISTINCT FROM c.kunden_konstellation OR
    f.kundenbetreuer_id IS DISTINCT FROM c.kundenbetreuer_id OR
    f.nutzungsausfall_tage IS DISTINCT FROM c.nutzungsausfall_tage OR
    f.polizei_aktenzeichen IS DISTINCT FROM c.polizei_aktenzeichen OR
    f.polizei_bericht_vorhanden IS DISTINCT FROM c.polizei_bericht_vorhanden OR
    f.polizei_vor_ort IS DISTINCT FROM c.polizei_vor_ort OR
    f.polizeibericht_status IS DISTINCT FROM c.polizeibericht_status OR
    f.restwert IS DISTINCT FROM c.restwert OR
    f.sachschaden_beschreibung IS DISTINCT FROM c.sachschaden_beschreibung OR
    f.spezifikation IS DISTINCT FROM c.spezifikation OR
    f.totalschaden IS DISTINCT FROM c.totalschaden OR
    f.unfall_konstellation IS DISTINCT FROM c.unfall_konstellation OR
    f.unfallskizze_ablehnung_grund IS DISTINCT FROM c.unfallskizze_ablehnung_grund OR
    f.unfallskizze_bestaetigt IS DISTINCT FROM c.unfallskizze_bestaetigt OR
    f.unfallskizze_generiert_am IS DISTINCT FROM c.unfallskizze_generiert_am OR
    f.unfallskizze_svg IS DISTINCT FROM c.unfallskizze_svg OR
    f.unfallskizze_url IS DISTINCT FROM c.unfallskizze_url OR
    f.vehicle_id IS DISTINCT FROM c.vehicle_id OR
    f.vorsteuerabzugsberechtigt IS DISTINCT FROM c.vorsteuerabzugsberechtigt OR
    f.wiederbeschaffungswert IS DISTINCT FROM c.wiederbeschaffungswert OR
    f.zeugen_kontakte IS DISTINCT FROM c.zeugen_kontakte
  );

-- ─── Sektion 1: claims → faelle Sync-Funktion ────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_claims_to_faelle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  UPDATE public.faelle f
  SET
    abgeschlossen_am = NEW.abgeschlossen_am,
    auslandskennzeichen = NEW.auslandskennzeichen,
    bkat_unfallart = NEW.bkat_unfallart::public.bkat_unfallart,
    brn = NEW.brn,
    fahrerflucht = NEW.fahrerflucht,
    finanzierung_leasing = NEW.finanzierung_leasing,
    finanzierungsgeber_adresse = NEW.finanzierungsgeber_adresse,
    finanzierungsgeber_name = NEW.finanzierungsgeber_name,
    finanzierungsgeber_vertragsnr = NEW.finanzierungsgeber_vertragsnr,
    firma_name = NEW.firma_name,
    gegner_bekannt = NEW.gegner_bekannt,
    gegner_versicherung_id = NEW.gegner_versicherung_id,
    gegner_versicherungsnummer = NEW.gegner_versicherungsnummer,
    gewerbe_flag = NEW.gewerbe_flag,
    kanzlei_ansprechpartner_email = NEW.kanzlei_ansprechpartner_email,
    kanzlei_ansprechpartner_name = NEW.kanzlei_ansprechpartner_name,
    kanzlei_ansprechpartner_telefon = NEW.kanzlei_ansprechpartner_telefon,
    kanzlei_uebergeben_am = NEW.kanzlei_uebergeben_am,
    kunde_email = NEW.kunde_email,
    kunden_konstellation = NEW.kunden_konstellation,
    kundenbetreuer_id = NEW.kundenbetreuer_id,
    nutzungsausfall_tage = NEW.nutzungsausfall_tage,
    polizei_aktenzeichen = NEW.polizei_aktenzeichen,
    polizei_bericht_vorhanden = NEW.polizei_bericht_vorhanden,
    polizei_vor_ort = NEW.polizei_vor_ort,
    polizeibericht_status = NEW.polizeibericht_status,
    restwert = NEW.restwert,
    sachschaden_beschreibung = NEW.sachschaden_beschreibung,
    spezifikation = NEW.spezifikation,
    totalschaden = NEW.totalschaden,
    unfall_konstellation = NEW.unfall_konstellation,
    unfallskizze_ablehnung_grund = NEW.unfallskizze_ablehnung_grund,
    unfallskizze_bestaetigt = NEW.unfallskizze_bestaetigt,
    unfallskizze_generiert_am = NEW.unfallskizze_generiert_am,
    unfallskizze_svg = NEW.unfallskizze_svg,
    unfallskizze_url = NEW.unfallskizze_url,
    vehicle_id = NEW.vehicle_id,
    vorsteuerabzugsberechtigt = NEW.vorsteuerabzugsberechtigt,
    wiederbeschaffungswert = NEW.wiederbeschaffungswert,
    zeugen_kontakte = NEW.zeugen_kontakte,
    updated_at = NOW()
  WHERE f.claim_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_claims_to_faelle ON public.claims;
CREATE TRIGGER trg_sync_claims_to_faelle
AFTER UPDATE OF
  abgeschlossen_am, auslandskennzeichen, bkat_unfallart, brn, fahrerflucht,
  finanzierung_leasing, finanzierungsgeber_adresse, finanzierungsgeber_name,
  finanzierungsgeber_vertragsnr, firma_name, gegner_bekannt,
  gegner_versicherung_id, gegner_versicherungsnummer, gewerbe_flag,
  kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name,
  kanzlei_ansprechpartner_telefon, kanzlei_uebergeben_am, kunde_email,
  kunden_konstellation, kundenbetreuer_id, nutzungsausfall_tage,
  polizei_aktenzeichen, polizei_bericht_vorhanden, polizei_vor_ort,
  polizeibericht_status, restwert, sachschaden_beschreibung, spezifikation,
  totalschaden, unfall_konstellation, unfallskizze_ablehnung_grund,
  unfallskizze_bestaetigt, unfallskizze_generiert_am, unfallskizze_svg,
  unfallskizze_url, vehicle_id, vorsteuerabzugsberechtigt,
  wiederbeschaffungswert, zeugen_kontakte
ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.sync_claims_to_faelle();

-- ─── Sektion 2: faelle → claims Sync-Funktion (Legacy-Schutz) ────────────
CREATE OR REPLACE FUNCTION public.sync_faelle_to_claims()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.claim_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.claims c
  SET
    abgeschlossen_am = NEW.abgeschlossen_am,
    auslandskennzeichen = NEW.auslandskennzeichen,
    bkat_unfallart = NEW.bkat_unfallart::text,
    brn = NEW.brn,
    fahrerflucht = NEW.fahrerflucht,
    finanzierung_leasing = NEW.finanzierung_leasing,
    finanzierungsgeber_adresse = NEW.finanzierungsgeber_adresse,
    finanzierungsgeber_name = NEW.finanzierungsgeber_name,
    finanzierungsgeber_vertragsnr = NEW.finanzierungsgeber_vertragsnr,
    firma_name = NEW.firma_name,
    gegner_bekannt = NEW.gegner_bekannt,
    gegner_versicherung_id = NEW.gegner_versicherung_id,
    gegner_versicherungsnummer = NEW.gegner_versicherungsnummer,
    gewerbe_flag = NEW.gewerbe_flag,
    kanzlei_ansprechpartner_email = NEW.kanzlei_ansprechpartner_email,
    kanzlei_ansprechpartner_name = NEW.kanzlei_ansprechpartner_name,
    kanzlei_ansprechpartner_telefon = NEW.kanzlei_ansprechpartner_telefon,
    kanzlei_uebergeben_am = NEW.kanzlei_uebergeben_am,
    kunde_email = NEW.kunde_email,
    kunden_konstellation = NEW.kunden_konstellation,
    kundenbetreuer_id = NEW.kundenbetreuer_id,
    nutzungsausfall_tage = NEW.nutzungsausfall_tage,
    polizei_aktenzeichen = NEW.polizei_aktenzeichen,
    polizei_bericht_vorhanden = NEW.polizei_bericht_vorhanden,
    polizei_vor_ort = NEW.polizei_vor_ort,
    polizeibericht_status = NEW.polizeibericht_status,
    restwert = NEW.restwert,
    sachschaden_beschreibung = NEW.sachschaden_beschreibung,
    spezifikation = NEW.spezifikation,
    totalschaden = NEW.totalschaden,
    unfall_konstellation = NEW.unfall_konstellation,
    unfallskizze_ablehnung_grund = NEW.unfallskizze_ablehnung_grund,
    unfallskizze_bestaetigt = NEW.unfallskizze_bestaetigt,
    unfallskizze_generiert_am = NEW.unfallskizze_generiert_am,
    unfallskizze_svg = NEW.unfallskizze_svg,
    unfallskizze_url = NEW.unfallskizze_url,
    vehicle_id = NEW.vehicle_id,
    vorsteuerabzugsberechtigt = NEW.vorsteuerabzugsberechtigt,
    wiederbeschaffungswert = NEW.wiederbeschaffungswert,
    zeugen_kontakte = NEW.zeugen_kontakte,
    updated_at = NOW()
  WHERE c.id = NEW.claim_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_faelle_to_claims ON public.faelle;
CREATE TRIGGER trg_sync_faelle_to_claims
AFTER UPDATE OF
  abgeschlossen_am, auslandskennzeichen, bkat_unfallart, brn, fahrerflucht,
  finanzierung_leasing, finanzierungsgeber_adresse, finanzierungsgeber_name,
  finanzierungsgeber_vertragsnr, firma_name, gegner_bekannt,
  gegner_versicherung_id, gegner_versicherungsnummer, gewerbe_flag,
  kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name,
  kanzlei_ansprechpartner_telefon, kanzlei_uebergeben_am, kunde_email,
  kunden_konstellation, kundenbetreuer_id, nutzungsausfall_tage,
  polizei_aktenzeichen, polizei_bericht_vorhanden, polizei_vor_ort,
  polizeibericht_status, restwert, sachschaden_beschreibung, spezifikation,
  totalschaden, unfall_konstellation, unfallskizze_ablehnung_grund,
  unfallskizze_bestaetigt, unfallskizze_generiert_am, unfallskizze_svg,
  unfallskizze_url, vehicle_id, vorsteuerabzugsberechtigt,
  wiederbeschaffungswert, zeugen_kontakte
ON public.faelle
FOR EACH ROW
EXECUTE FUNCTION public.sync_faelle_to_claims();

COMMENT ON FUNCTION public.sync_claims_to_faelle() IS
  'CMM Phase 1.5a: claims -> faelle Sync für 40 duplizierte Datenspalten. Primärrichtung — claims ist SoT.';

COMMENT ON FUNCTION public.sync_faelle_to_claims() IS
  'CMM Phase 1.5a: faelle -> claims Sync (Legacy). Schützt vor Drift wenn Caller noch direkt auf faelle schreiben. Wird nach Phase 3 entfernt.';
