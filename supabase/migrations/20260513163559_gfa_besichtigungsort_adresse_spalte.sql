-- Fix: gutachter_finder_anfragen.besichtigungsort_adresse fehlt
--
-- Aufgefallen im CJ-Smoke-Lauf am 13.05.2026 — Phase-10-Save schlägt fehl mit
-- "Could not find the 'besichtigungsort_adresse' column of 'gutachter_finder_anfragen'".
--
-- Ursache: Wizard-Seed-Migration 20260511232934_funnel_v2_gutachter_finden_phasen.sql
-- hat in onboarding_felder.db_target → {tabelle: 'gutachter_finder_anfragen',
-- spalte: 'besichtigungsort_adresse'} gesetzt, aber keine begleitende ALTER-TABLE-
-- Migration hat die Spalte tatsächlich angelegt. Drift seit ~2 Tagen — niemand
-- hat den /gutachter-finden-Wizard durchgeklickt seitdem.
--
-- Fix: Spalte additiv anlegen, analog zu faelle.besichtigungsort_adresse aus
-- 20260504094314_add_besichtigungsort_notiz.sql. lat/lng/place_id ziehen wir
-- jetzt NICHT mit, weil der Wizard aktuell nur Freitext entgegen nimmt und
-- die strukturierte Geocoding-Übernahme nach faelle erst beim finalize passiert
-- (siehe finalizeAnfrage.ts). Bei Bedarf später separate Migration.

ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS besichtigungsort_adresse text;

COMMENT ON COLUMN gutachter_finder_anfragen.besichtigungsort_adresse IS
  'Freitext-Adresse aus Wizard-Phase 10 (Strasse, PLZ, Ort). Geocoding nach lat/lng erfolgt nicht hier — beim finalize wird der Wert nach faelle.besichtigungsort_adresse übertragen.';
