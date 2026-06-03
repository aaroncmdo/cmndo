# P4 Minor — kunde-Geocoding (DispatchPlaceField `target='kunde'`)

**Datum:** 2026-06-03 · **Strecke:** dispatch-config-unify P4 (4. Minor-Gap) · **Branch:** `kitta/aar-956-p4-kunde-geocoding`

## Problem
Die Kundenadresse war im v2-`DispatchLeadForm` nur Freitext (3 Felder kunde_strasse/plz/stadt) → **kein `kunde_lat/lng`-Geocode**. Diese Koordinaten werden aber echt genutzt: `convert-lead-to-claim` (schadenort_lat/lng-Fallback), `dispatch/isochrone`, `_actions/sv-termin` (15 Consumer).

## Design (mirror der besichtigungsort/unfallort-Overrides, P2d-2)
`PlaceResult` (GooglePlaceAutocomplete) liefert die Adresse **strukturiert** (`{ strasse, plz, stadt, lat, lng, place_id }`), daher saubere 3-Feld-Befüllung ohne String-Parsing:

- **`DispatchPlaceField`** um `PlaceTarget='kunde'` erweitert:
  - `selektionZuSpalten('kunde', r)` → `{ kunde_strasse, kunde_plz, kunde_stadt, kunde_lat, kunde_lng }`
  - `freetextZuSpalten('kunde', addr)` → `{ kunde_strasse: addr, kunde_lat: null, kunde_lng: null }` (Koordinaten-Stale-Guard; plz/stadt unberührt)
  - `adresseSpalte('kunde')` → `kunde_strasse` (Initialwert)
- **Override** `kunde_strasse` in `DISPATCH_FIELD_OVERRIDE_KEYS` + Renderer `<DispatchPlaceField target="kunde">` (`OVERRIDES`-Record erzwingt key↔renderer via tsc).
- **Allowlist:** `STAMMDATEN_ALLOWED_FIELDS` enthielt `kunde_strasse/plz/stadt/lat/lng` bereits → keine Änderung.
- `kunde_plz`/`kunde_stadt` bleiben normale FieldRenderer-Felder (das Autocomplete füllt sie mit). **Kunden-Flow unberührt** — der Override ist dispatcher-only (geteilter FieldRenderer bleibt rein).

## Files
- **Geändert:** `_v2/DispatchPlaceField.tsx`, `_v2/dispatch-field-override-keys.ts`, `_v2/dispatch-field-overrides.tsx`.
- **Keine Migration** (Spalten existieren), keine Allowlist-Änderung.

## Gates / Smoke
tsc grün · Dispatch-vitest 22/22 (inkl. dispatch-field-overrides.test) · token-audit 0 · component-set 0-neu · knip 0-neu. Dispatcher-UI-Smoke (Login → kunde_strasse-Autocomplete → Auswahl → DB kunde_lat/lng) = post-merge auf staging (mirror eines bewährten Patterns).
