-- AAR-825 Step 1: DEPRECATED-Comments auf alle ~98 Drop-Kandidaten in faelle
--
-- Diese Migration ist nicht-destruktiv (nur COMMENT ON COLUMN).
-- Die eigentlichen DROP COLUMN-Migrations kommen in separaten Step-PRs
-- nachdem der Code-Cleanup abgeschlossen ist (30+ Files referenzieren noch diese Spalten).
--
-- Buckets:
--   A.6 (~44): Halter / Fahrer / Fahrzeug / Cardentity / Vorschäden / SV-Briefing
--   B.1 (  7): Gutachten-Beträge  → jetzt in: gutachten
--   B.5 ( 32): VS-Workflow        → jetzt in: vs_korrespondenz + claim_payments
--   B.6 ( 15): Mietwagen          → jetzt in: claim_mietwagen

-- ─── A.6: Halter / Fahrer / Fahrzeug / SV-Briefing / Cardentity ─────────────

COMMENT ON COLUMN public.faelle.halter_vorname            IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_vorname. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_nachname           IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_nachname. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_name               IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_name. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_strasse            IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_strasse. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_plz                IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_plz. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_stadt              IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_stadt. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_telefon            IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_telefon. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_email              IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_email. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_geburtsdatum       IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_geburtsdatum. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.halter_ungleich_fahrer_flag IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.halter_ungleich_fahrer_flag. Drop in C.1.a nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.fahrzeug_typ              IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.typ. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fahrzeug_hersteller       IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.hersteller. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fahrzeug_modell           IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.modell. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fahrzeug_baujahr          IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.baujahr. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fahrzeug_farbe            IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.farbe. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fahrzeug_ausstattung      IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.ausstattung_jsonb. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fahrzeug_fahrbereit       IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fahrbereit. Drop in C.1.a nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.fin_vin                   IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fin_vin. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fin_quelle                IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fin_quelle. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.fin_extrahiert_am         IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.fin_extrahiert_am. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.erstzulassung             IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.erstzulassung. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.kilometerstand            IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.kilometerstand. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.kennzeichen               IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.kennzeichen. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.gegner_kennzeichen        IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: claim_parties.kennzeichen. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.auslandskennzeichen       IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.auslandskennzeichen. Drop in C.1.a nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.vorschaden_geprueft       IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_geprueft. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vorschaden_anzahl         IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_anzahl. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vorschaden_letzter_datum  IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_letzter_datum. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vorschaden_typ_a_ergebnis IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_typ_a_ergebnis. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vorschaden_typ_b_bericht  IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_typ_b_bericht. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vorschaden_typ_b_pdf_url  IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_typ_b_pdf_url. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vorschaden_erkannt        IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.vorschaden_erkannt. Drop in C.1.a nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.cardentity_abfrage_am     IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.cardentity_abfrage_am. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.cardentity_enriched_at    IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.cardentity_enriched_at. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.cardentity_report         IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.cardentity_report_jsonb. Drop in C.1.a nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.finanzierung_leasing      IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.finanzierung_leasing. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.finanzierungsgeber_name   IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.finanzierungsgeber_name. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.finanzierungsgeber_adresse IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.finanzierungsgeber_adresse. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.finanzierungsgeber_vertragsnr IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles.finanzierungsgeber_vertragsnr. Drop in C.1.a nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.sv_briefing_text          IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles (SV-Briefing). Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.sv_briefing_generated_at  IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.sv_briefing_model         IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.sv_briefing_version       IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.sv_briefing_struktur      IS 'AAR-810 A.6 DEPRECATED — Daten jetzt in: vehicles. Drop in C.1.a nach Code-Cleanup.';

-- ─── B.1: Gutachten-Beträge ──────────────────────────────────────────────────

COMMENT ON COLUMN public.faelle.schadens_hoehe_netto      IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten.gesamt_schadensbetrag. Drop in C.1.c nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.wiederbeschaffungswert    IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten (Positionsliste). Drop in C.1.c nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.restwert                  IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten (Positionsliste). Drop in C.1.c nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.reparaturdauer_tage       IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: repairs.geplanter_beginn+abgeschlossen_am. Drop in C.1.c nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.totalschaden              IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten (Positionsliste). Drop in C.1.c nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.reparaturkosten           IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: repairs.tatsaechliche_kosten. Drop in C.1.c nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.wertminderung             IS 'AAR-810 B.1 DEPRECATED — Daten jetzt in: gutachten_positionen. Drop in C.1.c nach Code-Cleanup.';

-- ─── B.5: VS-Workflow ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.faelle.regulierung_betrag        IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.erhaltener_betrag. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.regulierung_am            IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.zahlungseingang_am. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.regulierung_angekuendigt_am IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.regulierungsweise         IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.zahlungsweg. Drop in C.1.d nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.gegner_versicherung       IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.versicherung. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.gegner_versicherung_id    IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.gegner_versicherungsnummer IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.aktenzeichen. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.gegner_versicherung_anfrage_datum IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.datum. Drop in C.1.d nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.vs_eskalationsstufe       IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz (Lifecycle). Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_reaktion_typ           IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_reaktion_am            IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.datum. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_ablehnungsgrund        IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.notiz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_frist_bis              IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_kuerzung_grund         IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.notiz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_kuerzungs_typ          IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.kuerzungs_betrag          IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.differenz_betrag. Drop in C.1.d nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.vs_quote_prozent          IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_quote_grund            IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.notiz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_quote_akzeptiert_am    IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.zahlungseingang_am. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.vs_quote_betrag_ausgezahlt IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: claim_payments.erhaltener_betrag. Drop in C.1.d nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.ruege_erhalten_am         IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.ruege_grund               IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.betreff. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.ruege_gesendet_am         IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.ruege_betrag              IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.ruege_counter             IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz (COUNT). Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.ruege_frist_tage          IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.as_geforderte_summe       IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.as_frist                  IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.as_vs_reaktion_text       IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.notiz. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.as_salesforce_id          IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.aktenzeichen. Drop in C.1.d nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.as_zuletzt_synced_am      IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz. Drop in C.1.d nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.klage_uebergeben_am       IS 'AAR-810 B.5 DEPRECATED — Daten jetzt in: vs_korrespondenz.datum (kanal=portal, richtung=ausgehend). Drop in C.1.d nach Code-Cleanup.';

-- ─── B.6: Mietwagen + Nutzungsausfall ────────────────────────────────────────

COMMENT ON COLUMN public.faelle.mietwagen_flag            IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen (EXISTS-Check). Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_hat             IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen (EXISTS-Check). Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_seit_datum      IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.beginn_datum. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_limit_tage      IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen (Endberechnung). Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_limit_grund     IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.notiz. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_rechnung_vorhanden IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_rechnung_url    IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_argumentations_puffer IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_vermieter       IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.anbieter. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_kanzlei_informiert IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.notiz. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.mietwagen_kanzlei_informiert_am IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.notiz. Drop in C.1.b nach Code-Cleanup.';

COMMENT ON COLUMN public.faelle.nutzungsausfall           IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen (nutzungsausfall als Sonderfall). Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.nutzungsausfall_tage      IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.tage_gesamt. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.nutzungsausfall_tagessatz IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.tagespreis_netto. Drop in C.1.b nach Code-Cleanup.';
COMMENT ON COLUMN public.faelle.nutzungsausfall_gesamt    IS 'AAR-810 B.6 DEPRECATED — Daten jetzt in: claim_mietwagen.gesamtkosten_netto. Drop in C.1.b nach Code-Cleanup.';

DO $$
DECLARE v_deprecated_count INT;
BEGIN
  SELECT count(*) INTO v_deprecated_count
    FROM pg_description d
    JOIN pg_class c ON d.objoid = c.oid
   WHERE c.relname = 'faelle'
     AND d.description LIKE 'AAR-810%DEPRECATED%';

  RAISE NOTICE '
    AAR-825 Step 1 abgeschlossen: % DEPRECATED-Comments in faelle gesetzt.
    Nächste Schritte:
    1. Code-Audit: rg auf alle 98 Spalten bis Treffer = 0
    2. Backfill-Prüfung: vehicles/claim_mietwagen/vs_korrespondenz mit Prod-Daten befüllt?
    3. Step 2: Drop A.6 (44 Spalten) — eigener Branch + PR
    4. Step 3: Drop B.6 (15 Spalten)
    5. Step 4: Drop B.1 (7 Spalten)
    6. Step 5: Drop B.5 (32 Spalten)
    7. VACUUM FULL ANALYZE faelle (Wartungsfenster)',
    v_deprecated_count;
END $$;
