-- Wegwerf-Werkstaetten aus Smoke-Laeufen standen im PRODUKTIVEN Angebot.
-- Gefunden 31.08.2026 im Kundenfluss-Smoke: der Flow sagte einem Kunden woertlich
-- "Ihr Fahrzeug wird zu SMOKE WF-Werkstatt mth00495-d9bb2b54, Koeln gebracht."
-- Beide Matching-Pfade (werkstatt/matching/lade-vorschlaege.ts, werkstatt/finder.ts)
-- filtern auf status='aktiv' -> 'gesperrt' nimmt sie aus dem Angebot. Reversibel.
--
-- Bewusst eng gefasst, drei Schutzbedingungen:
--   1. nur der maschinelle Praefix '^SMOKE ' (Wegwerf-Fixtures mit Stamp-Suffix).
--      Die benannten 'Test Werkstatt' / 'Test-Werkstatt Bremerhaven' bleiben unberuehrt —
--      erstere traegt 8 echte Claims.
--   2. keine Claims daran (sonst wuerde eine bestehende Zuweisung entwertet).
--   3. aelter als 6 Stunden — ein GERADE laufender fremder Smoke soll nicht brechen
--      (beim Messen war eine 0.0 h alte Zeile aktiv; die Population fluktuiert, manche
--      Laeufe raeumen selbst auf).
-- Kein UUID-Literal: adressiert wird ueber den fachlichen Schluessel, damit ein
-- Migrations-Replay auf einem Preview nicht bricht.
--
-- ⚠ Die URSACHE bleibt offen: die Smoke-Laeufe raeumen ihre Werkstaetten nicht
-- zuverlaessig ab. Solange das so ist, laufen neue Leichen auf.

update werkstaetten
set status = 'gesperrt'
where name ~ '^SMOKE '
  and status = 'aktiv'
  and created_at < now() - interval '6 hours'
  and not exists (
    select 1 from claims c where c.werkstatt_id = werkstaetten.id
  );