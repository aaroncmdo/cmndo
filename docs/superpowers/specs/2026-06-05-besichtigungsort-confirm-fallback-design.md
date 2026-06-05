# Besichtigungsort-Bestätigung & Korrektur — Fallback-Layer (Design)

**Datum:** 2026-06-05 · **Owner:** Termin-Engine-Session (`ab96fed4`) · **Status:** Design approved (Aaron 05.06.)

## Kontext & Problem
Die Termin-Engine garantiert beim Buchen ein geocodetes Vor-Ort-Ziel (P2.3b Geocoding-Garantie) — der SV soll verlässlich am Besichtigungsort ankommen. Das **Sicherheitsnetz** dahinter (Aaron-Kernpunkt) fehlt: wenn das geocodete Ziel falsch/ungenau ist (schlechte Intake-Adresse), kann es heute niemand korrigieren. Die ETA-Tracking-Infra (`KundeTrackingClient`: Live-Position, „SV ist X Min entfernt", Map) steht; eine besichtigungsort-Korrektur-Action existiert (`updateBesichtigungsortVomKunden`), ist aber **unverdrahtet/tot** (kein Caller) + auth-gekoppelt. Weder Kunde-Tracking noch SV-Feldmodus haben ein Bestätigen/Korrigieren-Affordance.

## Ziel
Ein proaktives, getracktes Sicherheitsnetz über **beide** Akteure:
- **Kunde** (Tracking-Seite, token-basiert): wird proaktiv gefragt „Ist [Adresse] der richtige Ort?" → bestätigt oder korrigiert. Bestätigung getrackt → der SV sieht „vom Kunden bestätigt".
- **SV** (Feldmodus): korrigiert reaktiv den Ort, wenn er unterwegs merkt, dass die Adresse falsch ist.

Jede Korrektur aktualisiert die **geocodeten** `besichtigungsort_lat/lng/adresse` → Route + ETA bleiben konsistent.

## Scope
- **IN:** Kunde Bestätigen+Korrigieren (Tracking-Seite), SV Korrigieren (Feldmodus), getrackter Bestätigt-Zustand, geocodete Korrektur via bestehendem `GooglePlaceAutocomplete`.
- **OUT (YAGNI):** proaktiver Prompt bei Termin-Bestätigung (nur Tracking-Seite); Foto-vom-Ort; user_id-Audit; „unklar"-Sonderfälle; Remote-Termine (video/telefon haben kein Vor-Ort-Ziel → Affordance ausgeblendet).

## Architektur (Approach A — Engine-Primitive)
Die Termin-Engine ist die besichtigungsort-SSoT-Ownerin (`gutachter_termine.besichtigungsort_*`, P2.3b-gecacht). **Eine** Schreibstelle, dünne Auth-Wrapper — konsistent mit `reserviere`/`bestaetige`.

### 1 · Datenmodell (additiv, Supabase-Plugin/Regel 2)
`gutachter_termine`:
- `besichtigungsort_bestaetigt_am timestamptz NULL`
- `besichtigungsort_bestaetigt_von text NULL` mit CHECK `besichtigungsort_bestaetigt_von IN ('kunde','sv')`

Auf `gutachter_termine` (= besichtigungsort-Home) → faelle-frei. Kein Backfill (0 bestehende Bestätigungen). Types via generate_typescript_types nach Migration.

### 2 · Engine (`src/lib/termine/engine/besichtigungsort-write.ts`)
```
type BestaetigtVon = 'kunde' | 'sv'

korrigiereBesichtigungsort(terminId, ort: { adresse, lat, lng }, von: BestaetigtVon, opts?: { db? })
  : Promise<{ ok: boolean; error?: string }>
  // validiert lat/lng vorhanden; updatet besichtigungsort_adresse/lat/lng
  // + bestaetigt_am=now + bestaetigt_von=von; Timeline-Audit (non-critical).
  // Korrektur = implizite Bestätigung durch den Korrigierenden.

bestaetigeBesichtigungsort(terminId, von: BestaetigtVon, opts?: { db? })
  : Promise<{ ok: boolean; error?: string }>
  // setzt nur bestaetigt_am=now + bestaetigt_von=von (kein Coord-Change). Idempotent.
```
Export aus `engine/index.ts`. Result-Object-Pattern (AGENTS.md). **Kein kunde_id**, kein faelle.

### 3 · Actions (kein `kunde_id` → keine Kollision mit dem laufenden kunde_id-Sweep)
- **Kunde (Token-basiert)** — `src/app/kunde/termin/[token]/actions.ts`:
  - `bestaetigeBesichtigungsortViaToken(token)`
  - `korrigiereBesichtigungsortViaToken(token, { adresse, lat, lng })`
  - Token (`gutachter_termine.kunden_tracking_token`) → terminId auflösen → Engine mit `von='kunde'`. Token = Auth (kein Login).
- **SV** — `src/lib/termine/actions.ts`:
  - `korrigiereBesichtigungsortAlsSv(terminId, { adresse, lat, lng })`
  - SV-owns-Termin-Guard (`getGutachterForUser` + `termin.sv_id === sv.id`) → Engine mit `von='sv'`.

### 4 · UI
- **Kunde-Tracking** (`KundeTrackingClient` + neue `BesichtigungsortCheck.tsx`):
  - „vorbereitet"-State (vor losgefahren), **nach** Termin-Annahme (NICHT während der Gegenvorschlag-Entscheidung der Termin-Zeit — kein Doppel-Prompt): **proaktive Karte** „Besichtigungsort: [Adresse] — Stimmt der Ort? **[Ja, stimmt]** / **[Ort korrigieren]**". Korrigieren → `GooglePlaceAutocomplete` → Coords → Action. Nach Bestätigung „bestätigt ✓".
  - „unterwegs"-State: dezenter „Ort korrigieren"-Link im Footer (neben Adresse).
  - Nicht bei `angekommen`/`besichtigung läuft`; nur Vor-Ort (kein Remote).
- **SV-Feldmodus** (`gutachter/feldmodus` Termin-Sicht): „Ort korrigieren"-Affordance (gleiches `GooglePlaceAutocomplete`-Pattern) + **Trust-Signal** „Vom Kunden bestätigt ✓" wenn `bestaetigt_von='kunde'`.

### 5 · i18n
Neue Keys `kunde.tracking.besichtigungsort.*` + `gutachter.feldmodus.besichtigungsort.*` (de + aktive Locales; echte UTF-8-Umlaute, Frontend-Pflicht).

## Datenfluss
Kunde/SV korrigiert → Action (Auth) → Engine `korrigiereBesichtigungsort` → `gutachter_termine.besichtigungsort_*` + `bestaetigt_*` → Realtime (KundeTrackingClient hört bereits `gutachter_termine`-UPDATEs) + ETA/Route (lesen `besichtigungsort_*`) aktualisieren sich konsistent. Coords aus `GooglePlaceAutocomplete` (Google-geocodet) sind universal → Mapbox-Routing/ETA bleiben korrekt.

## Error-Handling / Edge-Cases
- Token invalid / Termin nicht gefunden → `{ ok:false }` → Fehler-Hinweis.
- lat/lng fehlt (Freitext ohne Auswahl) → „bitte Vorschlag aus der Liste wählen".
- Engine-Write-Fehler → Fehler-Toast; Timeline non-critical (kein Block).
- Korrektur erlaubt bis `angekommen`; danach ausgeblendet.
- Remote-Termin (`kanal IN ('video','telefon')`) → kein Affordance.
- Confirm nach Correct = idempotent (gleiche bestaetigt-Felder).

## Testing
- **Engine vitest:** `korrigiere`/`bestaetige` (Stub-db; verifiziert besichtigungsort_* + bestaetigt_*; lat/lng-Guard; Result-Shape).
- **Action-Guards:** Token-Validierung + SV-owns-Guard (Negativ-Fälle).
- **Live-Verify** (`scripts/verify-engine-*.mts`-Pattern): echter Termin, Korrektur via Token + via SV; besichtigungsort_*/bestaetigt_* gesetzt; 0 Residue (Cleanup try/finally).
- Build-Gate `tsc --noEmit` (PIPESTATUS); Staging-Browser-Smoke post-merge (Tracking-Seite + Feldmodus).

## Koordination
Token/SV-basiert → **kein kunde_id** → keine Kollision mit dem laufenden kunde_id-Sweep (fb34de27). besichtigungsort-Spalten auf `gutachter_termine` → faelle-frei, kein CMM-49-Konflikt. `termine/*` + `kunde/termin/[token]` + `gutachter/feldmodus` = Termin-Engine-Revier (AKTIV-MARKER).

## Bestehendes / Reuse (Aaron-Check: abändern statt neu bauen)
- **`GooglePlaceAutocomplete`** (`src/components/GooglePlaceAutocomplete.tsx`): reuse 1:1 als Adress-Picker. `onSelect` liefert `{ adresse, lat, lng, plz, strasse, stadt, place_id }` (Google-geocodet) — genau die Coords für die Action; Freitext→Server-Geocode-Fallback (onBlur) schon drin.
- **`DispatchPlaceField.tsx`** (`dispatch/leads/[id]/_v2/`): UI-Pattern-Referenz (GooglePlaceAutocomplete → `besichtigungsort_*`-Write) — die Kunde/SV-Korrektur-UI spiegelt das.
- **`updateBesichtigungsortVomKunden`** (`kunde/faelle/[id]/_actions/besichtigungsort.ts`): **0 Caller = toter Code** (auth/fallId-basiert, faelle-Fallback). → Write-Logik wandert in die Engine-Primitive; die tote Action wird **gelöscht** (kein paralleler Schreibpfad).
- **Realtime/Token-Infra** (`KundeTrackingClient` hört `gutachter_termine`-UPDATEs; `kunde/termin/[token]/actions.ts` Token-Pattern): reuse.

→ Netto NEU: Engine-Primitive (konsolidiert den toten Write) + 2 Spalten + bestaetigt-Tracking + 1 UI-Affordance (gespiegelt) + i18n. **Kein Rebuild.**

## Implementierungs-Reihenfolge (für writing-plans)
1. DDL (2 Spalten) + Types.
2. Engine `besichtigungsort-write.ts` + vitest + Export.
3. Kunde-Token-Actions + SV-Action (+ Guard-Tests).
4. `BesichtigungsortCheck.tsx` + Einbau in `KundeTrackingClient` (vorbereitet + unterwegs).
5. SV-Feldmodus-Affordance + Trust-Signal.
6. i18n.
7. Live-Verify + tsc.
