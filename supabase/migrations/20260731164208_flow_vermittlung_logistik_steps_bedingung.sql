-- P4 UX-Follow-up (Smoke-MINOR 31.07., PR #4897): Vermittlungs-Kunden (SV hat das Gutachten
-- bereits erstellt, source_channel='gutachter-vermittlung') sehen die Logistik-Steps nicht mehr —
-- Besichtigungsort/Termin/Gutachter-Wahl/Fahrzeug-Standort/Werkstatt sind fuer den Sofort-Claim
-- sinnfrei (Gutachten existiert; Werkstatt-Wahl kommt im Portal). Quali/Feststellung/SA/Account
-- bleiben. Mechanik: bauFlowKontext liefert gutachten_vermittelt='ja' bei Vermittlung, sonst NULL;
-- die AND-only-Bedingung {"gutachten_vermittelt": null} zeigt den Step nur auf normalen Wegen.
-- Reines Config-DML (keine Schema-Aenderung); jsonb-Merge erhaelt bestehende Bedingungen
-- (z.B. termin {"sv_id": null}).
UPDATE flow_szenario_steps
SET bedingung = COALESCE(bedingung, '{}'::jsonb) || '{"gutachten_vermittelt": null}'::jsonb
WHERE step_id IN ('ort_besichtigung', 'termin', 'gutachter', 'ort_fahrzeug', 'werkstatt', 'werkstatt_anzeige');
