# Embed Gutachter-Finder: Reservierung erzeugt genau einen Rückruf (AAR-956)

- **Datum:** 2026-06-18
- **Branch:** `kitta/aar-956-reservierung-auto-rueckruf` (Basis: `staging`)
- **Status:** Design — wartet auf Review

## Problem / Ist-Zustand

Befund DB `paizkjajbuxxksdoycev` (2026-06-18):

- Gutachter-Finder-Reservierungen landen **korrekt**: `gutachter_finder_anfragen` (gfa) → `leads` → `flow_links` → `gutachter_termine` (Partner `bestaetigt` / Dead-Pin `dispatch_pending`). Jüngstes Beispiel: Nicolas Kitt, Köln, 16.06., bestätigter Termin.
- **Aber:** zu **keiner** Reservierung gehört ein Rückruf. Seit Embed-Livegang (12.06.) **0** `admin_termine` `typ='rueckruf'` aus dem Embed — über keinen Pfad (weder Danke-Seite `bucheRueckrufBeimDispatcher`, noch Header-CTA `erstelleOeffentlichenRueckruf`, noch `leads.rueckruf_geplant_am`). Die einzigen Rückrufe im System sind alte Smoke-Tests (≤ 13.05.).

**Debug-Befund (Anforderung 2):** `bucheRueckrufBeimDispatcher` hat **keinen Code-Defekt**:

- UI rendert (Gate `gebucht.dispatcher && buchungToken` erfüllt; zugewiesener Dispatcher `aa000002` = „Nicolas Kitta" hat Vornamen → `ladeLeadDispatcher` liefert Profil).
- `admin_termine` erlaubt `typ='rueckruf'` + `status='offen'` (CHECK-Constraints), **keine** FK auf `zugewiesen_an`, einziger Trigger `derive_claim_id` ist bei `fall_id=null` harmlos.
- Zeitformat OK: derselbe `WunschterminPicker` + `berlinWallClockToUtc` befüllt erfolgreich `gfa.wunschtermin`.

→ **0 Zeilen** = der Danke-Seiten-Rückruf ist optional und wurde nie abgeschlossen, **und nichts legt automatisch einen Rückruf an**. Die Lücke ist Anforderung 1.

## Ziel

1. Jede Finder-Reservierung erzeugt automatisch **genau einen** Rückruf-Task (`admin_termine` `typ='rueckruf'`, `status='offen'`) beim dem Lead zugewiesenen Dispatcher — fest am Lead. Auch im 0-Verfügbarkeit-Fall (`auswahl=null`).
2. Stellt der Kunde auf der Danke-Seite **zusätzlich** eine Rückruf-Wunschzeit ein, wird diese in **denselben** Rückruf übernommen (Update), **nicht** als zweiter angelegt.

**Invariante:** pro Reservierung/Lead höchstens ein `admin_termine` `typ='rueckruf'`.

## Nicht-Ziele / Scope-Grenzen

- Der Header-CTA „Beratung vereinbaren" (`BeratungModal` → `erstelleOeffentlichenRueckruf`) bleibt **unverändert**. Er legt einen **eigenen** Lead an (vor/ohne Reservierung), ist nicht an eine Reservierung gebunden → nicht Teil der „2 Rückrufe"-Sorge.
- **Kein DDL.** Kein neuer Unique-Index (ein globaler `admin_termine(lead_id) WHERE typ='rueckruf'` könnte Sibling-Flows brechen). Dedup app-seitig.
- Kein Eingriff in `bucheTerminFlow` / die Termin-Engine.

## Design — App-Level-Upsert über gemeinsamen Helper

### Neue Dateien (Pattern wie `anfrage.ts` / `anfrage-columns.ts`)

**1. `src/lib/embed/reservierungs-rueckruf-columns.ts`** — PURE (kein `'server-only'`, vitest-testbar)

`buildReservierungsRueckruf(input)` liefert das Spalten-Objekt.

- **Input:** `{ leadId: string; dispId: string; name: string; startIso: string; vonKunde: boolean }`
- **Output-Spalten:**
  - `typ: 'rueckruf'`
  - `titel`: `vonKunde ? "Beratungsgespräch: {name}" : "Rückruf: {name}"`
  - `beschreibung`:
    - auto: `"Automatischer Rückruf aus Gutachter-Finder-Reservierung — bitte Termin/Anliegen mit dem Kunden bestätigen.\nQuelle: embed-gutachter-finder"`
    - vonKunde: `"Rückruf-Wunsch aus dem Gutachter-Finder (Danke-Seite). Wunschzeit vom Kunden gewählt.\nQuelle: embed-gutachter-finder"`
  - `start_zeit: startIso`
  - `end_zeit`: `startIso + 30 min`
  - `status: 'offen'`
  - `lead_id: leadId`
  - `erstellt_von: dispId`
  - `zugewiesen_an: dispId`
  - `erinnerung_min_vorher: 10`

**2. `src/lib/embed/reservierungs-rueckruf.ts`** — `'server-only'`

`upsertReservierungsRueckruf(admin, { leadId, startIso, vonKunde }): Promise<{ ok: boolean; terminId?: string; dispId?: string; error?: string }>`

1. Lead lesen (`vorname, nachname, telefon, zugewiesen_an`). Fehlt → `{ ok:false, error }`.
2. `dispId = lead.zugewiesen_an ?? erstes profiles.rolle='dispatch'`. Kein Dispatcher → `{ ok:false }`.
3. `name = "{vorname} {nachname}".trim() || "Kunde"`.
4. Existierenden Rückruf suchen: `admin_termine where lead_id=leadId and typ='rueckruf'`, `order by created_at desc`, `limit 1`, `maybeSingle` (`limit 1` schützt vor `maybeSingle`-Fehler bei evtl. Alt-Duplikaten).
5. `columns = buildReservierungsRueckruf({ leadId, dispId, name, startIso, vonKunde })`.
6. **Vorhanden → UPDATE** `id=existing.id` SET `start_zeit, end_zeit, beschreibung, titel, zugewiesen_an, status='offen'` (`erstellt_von` bleibt). **Sonst → INSERT** `columns`.
7. `revalidatePath('/dispatch/rueckrufe')` + `revalidatePath('/dispatch/dashboard')`.
8. `return { ok:true, terminId, dispId }`.

**3. `src/lib/embed/reservierungs-rueckruf-columns.test.ts`** — vitest für `buildReservierungsRueckruf` (auto vs. `vonKunde`).

### Verdrahtung (`src/app/embed/gutachter-finder/actions.ts`)

**Eingang 1 — `reserviereEmbedTermin`:** nach Auflösung von `leadId` (existiert bereits für die Conversion-Dedupe), **vor** dem `if (!input.auswahl)`-Return, damit es in allen Pfaden (Partner / Dead-Pin / 0-Verfügbarkeit) läuft:

```
try {
  await upsertReservierungsRueckruf(admin, {
    leadId,
    startIso: new Date(Date.now() + 5 * 60_000).toISOString(), // ASAP-Hinweis
    vonKunde: false,
  })
} catch (err) { console.error('[embed-auto-rueckruf] non-critical:', err) }
```

Non-critical: ein Fehler bricht die Reservierung **nie** (konsistent zur „non-critical sub-ops"-Regel). **Keine** zusätzliche Kunden-/Team-Benachrichtigung (die Reservierungs-WA an Kunde + Team existiert bereits separat; die Auto-Zeile ist still).

**Eingang 2 — `bucheRueckrufBeimDispatcher`:**

- `startIso = berlinWallClockToUtc(wunschzeitLokal)` (wie heute).
- Statt direktem `admin_termine`-Insert: `const r = await upsertReservierungsRueckruf(admin, { leadId, startIso, vonKunde:true })`. Bei `!r.ok` → `{ ok:false, error:r.error }`.
- **Dispatcher-Mitteilung** (`route /dispatch/rueckrufe?open={r.terminId}`, Empfänger `r.dispId`) + **Kunden-WA**-Bestätigung „Beratungsgespräch vereinbart" **bleiben** (nur hier).

### Benachrichtigungs-Matrix

| Auslöser | DB | Dispatcher-Mitteilung | Kunden-WA |
|---|---|---|---|
| Reservierung (auto) | Insert (still) | – | – (Reservierungs-WA existiert separat) |
| Danke-Seite (Kunde) | Update derselben Zeile | ✓ | ✓ |

## Fehlerbehandlung

- Helper: Result-Object `{ ok, terminId?, dispId?, error? }` (AGENTS.md ok-Shape), **kein** throw.
- Eingang 1: non-critical (try/catch + `console.error`), Reservierung bleibt atomar erfolgreich.
- Eingang 2: Result an den Client (Danke-Seite zeigt `rueckrufFehler` bei `!ok`), UX unverändert.

## Tests

- **vitest** `buildReservierungsRueckruf`: auto vs. `vonKunde` → `typ`, `status`, `titel`, `beschreibung`-Marker, `end_zeit = start + 30min`, `erinnerung_min_vorher`.
- (Plan-Detail) optionaler Upsert-Test mit Minimal-Mock: `select→row` ⇒ Update-Pfad; `select→null` ⇒ Insert-Pfad.
- `tsc --noEmit`, `npm run build`, vitest grün (im Worktree).

## Audit-Vorausschau (7 Punkte)

1. **Build:** voller `npm run build` (Server-Action geändert).
2. **UI-Erreichbarkeit:** kein neuer UI-Einstieg; Danke-Seiten-Button bleibt → n/a.
3. **Redundanz:** gemeinsamer Helper statt dupliziertem Insert (DRY).
4. **Dead-Code:** alter Inline-Insert in `bucheRueckrufBeimDispatcher` entfällt.
5. **Spec-Treue:** exakt die 2 Anforderungen + Dedup-Invariante.
6. **Inkonsistenz:** ok-Shape, `revalidatePath`, korrekte Umlaute in Dispatch-Strings.
7. **Regression:** `erstelleOeffentlichenRueckruf` unberührt; manueller Pfad behält Mitteilung + WA; `reserviereEmbedTermin`-Hauptpfad nur additiv (non-critical Zeile).

## Rollout

- Branch `kitta/aar-956-reservierung-auto-rueckruf` → PR gegen `staging`. Kein DDL, keine Env.
- Nach Merge — manuelle Verifikation: 1 Test-Reservierung im Embed → `/dispatch/rueckrufe` zeigt **genau 1** offenen Rückruf; danach Danke-Seiten-Rückruf-Zeit setzen → **derselbe** Eintrag wird aktualisiert (kein zweiter).
