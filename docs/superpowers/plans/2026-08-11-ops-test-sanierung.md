# Ops-Test-Sanierung + Sweep-Rückstände — Implementierungsplan

> **Für agentische Worker:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** Die 26 Befunde des Ops-Tests vom 11.08.2026 entlang ihrer 10 Wurzeln beheben — und die echten Rückstände aus dem Voll-Sweep desselben Tages mit aufnehmen, statt sie parallel laufen zu lassen.

**Architecture:** Acht Lanes (A–H) mit stabilen IDs. Lane A (Termin-Wahrheit) ist vollständig ausgeplant, Lane G1/G2 ebenfalls; der Rest ist Stufe 2. Zwei Leitprinzipien ziehen sich durch: **die Termin-Engine ist die Wahrheit** — Aufrufer dürfen ihr Urteil weder überschreiben noch verschlucken; und **eine Datenquelle pro Fakt**.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Supabase (Postgres + RLS) · vitest · Playwright · Tailwind v4 + Claimondo-Token-System

**Quellen:**
- `docs/2026-08-11-ops-test-rca-embed-bis-claim.md` — RCA mit Code- und DB-Belegen (Symptome #1–#26, Wurzeln RC-1…RC-10)
- Memory-Marker `HANDOFF-offene-aufgaben-sweep-2026-08-11` — Voll-Sweep aus Session `81215cc3` (Lanes G/H)

---

## ⚠ Code-Stand — vor der ersten Zeile lesen

**Alle Zeilennummern in diesem Plan beziehen sich auf `origin/staging` @ `a2d7dac83` (11.08.2026).**

Die RCA wurde ursprünglich im Haupt-Checkout erhoben — der steht auf dem **11.07.** und ist **451 Commits** hinter `origin/staging`. Die inhaltlichen Befunde wurden anschließend **einzeln gegen staging gegengeprüft und bestätigt** (siehe Verifikationstabelle unten); die Zeilennummern sind hier bereits auf staging nachgezogen.

**Konsequenz für dich:** Niemals im Haupt-Checkout arbeiten. Frischer Worktree von `origin/staging`:

```bash
node scripts/new-session-worktree.mjs <dein-slug>
cd .claude/worktrees/session-<short>
git fetch origin && git checkout -B <slug> origin/staging
git log -1 --format="%h %ad" --date=short   # muss 2026-08-11 oder neuer sein
```

### Verifikationsstand gegen `origin/staging`

| Befund | Datei @ staging | Status |
|---|---|---|
| RC-1 synthetische Wunschzeiten | `embed/gutachter-finder/actions.ts:146-176` | ✅ unverändert vorhanden |
| RC-1 verschluckter Fehlschlag | `embed/gutachter-finder/actions.ts:320, 410` | ✅ unverändert vorhanden |
| RC-1 Engine lehnt korrekt ab | `lib/termine/engine/writes.ts:43-45` | ✅ |
| RC-3 ZB1-Korrektur 4 Felder | `kunde/onboarding-details/zb1-actions.ts:18-24` | ✅ |
| G2 Subphase-Filter unvollständig | `lib/fall/subphase-resolver.ts:215` | ✅ |
| G3 tote Spalten | `lib/faelle/claim-duplicate-columns.ts:120, 272` | ✅ |
| G1 Top-Level-`readFileSync` | `tests/e2e/flows/feststellung-flow-gate.spec.ts:15` | ✅ |

**Zwei Deltas gegenüber dem alten Stand, die Lane A betreffen:**
1. `ladeEmbedMatching` hat einen zusätzlichen Parameter `ownerProfilId` (relationaler Owner-Boost) — beim Umbau **durchreichen**.
2. Die Bestätigungs-Sends stehen hinter einem `intern`-Gate: `if (!intern) void sendeEmbedTerminBestaetigung(…)` (Send-Isolation, PR #5085) — beim Umbau **erhalten**.

---

## Global Constraints

Gelten für **jede** Task — aus `AGENTS.md`, nicht verhandelbar:

- **Nie direkt auf `main` pushen.** Feature-Branch `kitta/aar-<nr>-<slug>`, PR gegen `staging`.
- **DDL ausschließlich über `mcp__plugin_supabase_supabase__apply_migration`**, danach `list_migrations` → Migration-File exakt nach getrackter Version benennen (Twin-Drift). `execute_sql` ist READ-only.
- **Regel 4 (neu via #5122):** **operatives Soll ZUERST definieren, dann smoken — alles per UI.** Kein Smoke ohne vorher formuliertes Soll.
- **Kein unbegleiteter Stash am Session-Ende.**
- **7-Punkte-Post-Task-Audit vor jedem Commit**, Audit-Block im Commit-Body. Bei Routen/Layouts/Server-Actions **immer** `npm run build`.
- **Frontend-Umlaute:** echte `ä ö ü ß` in allen nutzersichtbaren Texten.
- **Server-Actions liefern Result-Objects** (`{ ok, error? }`), kein `throw`; `revalidatePath` nicht vergessen.
- **Komponenten-Set:** `primitives/*` → `shared/*` → `ui/*`. Kein handgerolltes Button-/Card-Markup.
- **Token-System:** keine Inline-Hex, keine rohen Status-Scales, Radien nur `rounded-ios-*`.
- **Prod-Ref ist `paizkjajbuxxksdoycev`** (nicht Preview).
- **Next.js:** vor Arbeit an Routing/Server-Actions den Guide in `node_modules/next/dist/docs/` lesen.

**Gates vor jedem Commit:**

```bash
npm run typecheck && npm test && npm run check:token-audit && npm run check:component-set -- --ratchet
```

**Merge:** Die Merge/Drain-Session zieht deinen PR automatisch, sobald er non-draft + build/vitest grün + mergeable ist. Nichts selbst nach `main` bringen.

**Doku-Disziplin (Lehre aus dem Sweep):** Wer einen Plan abschließt, setzt einen `ABGESCHLOSSEN`-Header. Der Sweep fand 3775 offene Checkboxen, davon ~95 % stale — gebaut, nie abgehakt. Checkbox-Zählung ist kein Fortschrittsmaß.

---

## Koordinationslage

| Zone | Datei(en) | Wer |
|---|---|---|
| aar-956 | `app/embed/gutachter-finder/*`, `app/flow/[token]/actions.ts` | Lane A **und** H2 — untereinander abstimmen |
| Gegner-Pflichtdok | C2b-1 | **VERGEBEN** an Session `59cdebcb` — nicht doppelt anfangen |
| Ortseingaben-AC | Partner-/Admin-Formulare | laufende Lane (#5117 / #5123) — D1 dort einreihen |
| Admin-SV-Detail | `admin/…/[id]/page.tsx` | PR #5027 |

---

## Lanes im Überblick

| Lane | Thema | Herkunft | Symptome / Punkte | Prio | Status |
|---|---|---|---|---|---|
| **G** | Infra & Hygiene | Sweep A1–A5 | CI-rot, Subphase-Bug, tote Spalten, Ratchets, Doku | **P0/P1** | G1+G2 ausgeplant |
| **A** | Termin-Wahrheit im Embed | Ops-Test RC-1 | #1, 2, 4, 5, 19 | **P0** | ausgeplant |
| **B** | Datenintegrität Fahrzeug + ZB1 | RC-2, RC-3 | #15–18 | P1 | Stufe 2 |
| **C** | Richtige Abzweigung | RC-4, RC-5 | #9, 20, 21, 22 | P1 | Stufe 2 |
| **H** | Fundament-Lanes | Sweep B0–B4 | C4-Abschluss, C3c, C2b, C1-Rest | P1/P2 | Pläne liegen vor |
| **D** | Erfassungsqualität | RC-6, RC-8 | #10–14 | P2 | Stufe 2 |
| **E** | Werkstatt als Beteiligte | RC-9 | #6, 7, 8, 23 | P2 | Erkundung zuerst |
| **F** | UI-Korrekturen | RC-7, RC-10 | #3, 24, 25, 26 | P3 | Stufe 2 |

### ID-Mapping Sweep-Handoff → dieser Plan

Das Handoff nutzt eigene A/B/C-IDs, die mit meinen kollidieren. Verbindlich ist **diese** Zuordnung:

| Handoff | hier | Thema |
|---|---|---|
| A1 | **G2** | Subphase nach Absage |
| A2 | **G3** | tote Spalten-Referenzen |
| A3 | **G1** | main-CI-e2e rot |
| A4 | **G4** | zwei Ratchet-Guards |
| A5 | **G5** | Doku-Hygiene |
| B0 | **H0** | C4-Formalabschluss + §2/§9-Sync |
| B1 | **H2** | C3c SA-Moment 7→3 WhatsApp |
| B2 | **H3** | C2b create-case-Lücken |
| B3 | **H4** | C1-Rest |
| B4 | **H5** | unaufgenommene Handoffs |
| Teil C | **Anhang** | Aaron-only, nicht Bau-Scope |

---

## Querbezüge — hier steckt die eigentliche Arbeit des Zusammenführens

Ops-Test und Sweep sind nicht zwei Stapel nebeneinander. Sechs Stellen greifen ineinander:

**1. G1 blockiert die Wirkung von A6.**
`feststellung-flow-gate.spec.ts:15` liest auf Modul-Top-Level einen gitignorierten Seed. Auf CI fehlt die Datei → ENOENT beim Import → **die gesamte Playwright-Collection crasht**. Mein Regressionstest A6 wäre lokal grün und auf CI **nie gelaufen**. → **G1 vor A6.**

**2. G2 und RC-1 sind dasselbe Muster.**
G2: Termin abgesagt/abgelehnt → Fallakte zeigt weiter „SV unterwegs". RC-1: Termin nie gebucht → Kunde bekommt „reserviert". Beide Male **behauptet die Oberfläche einen Terminzustand, den es nicht gibt.** Wer A4/A5 baut, sollte G2 direkt mitnehmen — gleicher Kopf, gleiche Denkweise, minimaler Zusatzaufwand.

**3. Der Hänger-Detektor ist das Sicherheitsnetz für RC-1.**
Das Handoff meldet unter Aaron-only: Fall `CLM-2026-01011` hängt seit 13 Tagen ohne Termin, ein Auto-Detektor existiert nicht. **RC-1 produziert genau solche Hänger systematisch** — jede verschluckte Buchung erzeugt einen Lead mit Terminzusage ohne Termin. Lane A schließt die Quelle; der Detektor fängt, was trotzdem durchrutscht. Empfehlung: nach Lane A als eigenen Auftrag vorschlagen (braucht Aarons Go).

**4. Zielkonflikt: E2 gegen #4804.**
E2 will den KVA-Blocker im Haftpflichtfall **entfernen** (dort gilt das Gutachten). #4804 (J4) will KVA-Betrag serverseitig **zur Pflicht machen**. Beides kann richtig sein — aber nur, wenn die Pflicht abrechnungsweg-abhängig ist. **Vor E2 und vor #4804 klären**, sonst baut eine Lane die andere kaputt.

**5. D1 gehört in die laufende Ortseingaben-Lane.**
Der Unfallort braucht `GooglePlaceAutocomplete` — genau das rollt die Lane aus `AUDIT-ortseingaben-autocomplete-branding` gerade aus (P1 #5102 live, P2 #5117, P3 #5123, P4 offen). D1 dort als weitere Fundstelle einreihen statt parallel zu bauen.

**6. Lane A und H2 fassen beide Kunden-WhatsApp an.**
A5 ändert die Embed-Bestätigungstexte, H2 konsolidiert die 6–7 WhatsApp im SA-Moment auf 3. Verschiedene Dateien, gemeinsame Wirkung auf denselben Kunden. Reihenfolge abstimmen, sonst widersprechen sich die Texte.

---

# Lane G — Infra & Hygiene

## Task G1: main-CI-e2e entroten (P0 — vor A6)

**Warum zuerst:** Der `e2e`-Job ist seit Wochen rot und maskiert echte Regressionen für **alle** Lanes. Kein Prod-Bug, reine Test-Infra — aber solange er crasht, ist jeder neue Smoke wirkungslos.

**Files:**
- Modify: `tests/e2e/flows/feststellung-flow-gate.spec.ts:11-15`
- Create: `scripts/check-e2e-toplevel-fs.mjs`
- Modify: `package.json` (Script `check:e2e-toplevel-fs`)

**Interfaces:**
- Produces: Guard-Script nach dem Muster der bestehenden Ratchets (`--ratchet` / `--warn` / `--update-baseline`).

- [ ] **Schritt 1: Fehlschlag reproduzieren**

```bash
mv scripts/smoke/.feststellung-flow-gate-seed.json /tmp/seed-backup.json
npx playwright test --list 2>&1 | head -20
```

Erwartet: ENOENT — und zwar beim **Auflisten**, nicht beim Ausführen. Das ist der Beweis, dass die ganze Collection stirbt, nicht nur ein Test.

- [ ] **Schritt 2: Env-Gate einbauen**

In `tests/e2e/flows/feststellung-flow-gate.spec.ts` den Top-Level-Read (Zeile 15) ersetzen:

```ts
// Ops-Sweep 11.08.: Der Seed ist local-only (dot-prefixed => gitignored). Ein
// unbedingter fs-Read auf MODULEBENE crasht auf CI die gesamte Playwright-
// Collection (ENOENT beim Import) — nicht nur diesen Spec. Daher Env-Gate +
// lazy Read, Muster wie smoke-kundenfunnel-szenarien-prod.spec.ts.
const RUN = process.env.RUN_FESTSTELLUNG_GATE === '1'

function ladeSeed() {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/smoke/.feststellung-flow-gate-seed.json'), 'utf8'),
  )
}
```

Danach `test.skip(!RUN, 'Seed ist local-only — mit RUN_FESTSTELLUNG_GATE=1 laufen lassen')` in die `describe`-Ebene und `ladeSeed()` **innerhalb** der Tests aufrufen. Die bisherige Top-Level-Konstante `seed` entfällt; alle Verwendungen auf den lokalen Aufruf umstellen.

- [ ] **Schritt 3: Verifizieren, dass die Collection ohne Seed hält**

```bash
npx playwright test --list 2>&1 | tail -5
```

Erwartet: Liste wird vollständig aufgebaut, kein ENOENT. Danach Seed zurücklegen:

```bash
mv /tmp/seed-backup.json scripts/smoke/.feststellung-flow-gate-seed.json
```

- [ ] **Schritt 4: Guard gegen die Wiederkehr**

`scripts/check-e2e-toplevel-fs.mjs` — scannt `tests/e2e/**/*.spec.ts` auf `readFileSync`/`existsSync` außerhalb von Funktionskörpern. Aufbau 1:1 wie `scripts/check-token-audit.mjs`: Baseline-JSON, `--ratchet` blockt Neues, ohne Flag `--warn` (exit 0). Script in `package.json` als `check:e2e-toplevel-fs` registrieren.

- [ ] **Schritt 5: Gates + Commit**

```bash
node scripts/check-e2e-toplevel-fs.mjs --ratchet
npm run typecheck
git add tests/e2e/flows/feststellung-flow-gate.spec.ts scripts/check-e2e-toplevel-fs.mjs package.json
git commit -m "fix(e2e): Top-Level-Seed-Read gated — CI-Collection crasht nicht mehr (Sweep A3)"
```

- [ ] **Schritt 6: CI beobachten**

Nach dem Merge prüfen, dass der `e2e`-Job auf `main` grün wird. **Erst dann ist A6 sinnvoll.**

---

## Task G2: Fallakte zeigt nach Absage keine tote Subphase mehr (P1)

**Files:**
- Modify: `src/lib/fall/subphase-resolver.ts:204-209`
- Modify/Create: Vitest-Datei zum Resolver

**Befund (verifiziert):** Der `aktTermin`-Filter schließt `storniert`, `verlegt`, `verschoben` aus — **nicht** `abgesagt` und `abgelehnt`. Nach Kunden-Absage (`api/kunde/termin/absagen`) oder SV-Ablehnung (`sv-ablehnung.ts`) zeigt die Fallakte weiter „SV unterwegs" / „Termin-Erinnerung".

- [ ] **Schritt 1: Failing Test**

```ts
it('ignoriert abgesagte und abgelehnte Termine als aktiven Termin', () => {
  const res = resolveSubphase({
    ...basisFall,
    gutachter_termine: [
      { status: 'abgesagt', sv_unterwegs_seit: '2026-08-10T08:00:00Z', durchgefuehrt_am: null, sv_angekommen_am: null },
    ],
  })
  expect(res.subphase).not.toBe('SV unterwegs')
})

it('ignoriert vom SV abgelehnte Termine', () => {
  const res = resolveSubphase({
    ...basisFall,
    gutachter_termine: [
      { status: 'abgelehnt', sv_unterwegs_seit: '2026-08-10T08:00:00Z', durchgefuehrt_am: null, sv_angekommen_am: null },
    ],
  })
  expect(res.subphase).not.toBe('SV unterwegs')
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run src/lib/fall/__tests__/subphase-resolver.test.ts
```

Erwartet: FAIL — der Resolver liefert weiterhin die Unterwegs-Subphase.

- [ ] **Schritt 3: Filter ergänzen** (`subphase-resolver.ts:209`)

```ts
  // AAR-864 + Ops-Sweep 11.08.: 'verlegt'/'verschoben' (Verlegung) und
  // 'abgesagt'/'abgelehnt' (Kunden-Absage bzw. SV-Ablehnung) gehoeren NICHT in
  // den aktiven Termin — sonst zeigt der Resolver "SV unterwegs" anhand alter
  // Tracking-Felder, obwohl kein Termin mehr steht.
  const aktTermin = (gutachter_termine ?? [])
    .filter((t) => !['storniert', 'verlegt', 'verschoben', 'abgesagt', 'abgelehnt'].includes(t.status ?? ''))
```

- [ ] **Schritt 4: Tests grün + Commit**

```bash
npx vitest run src/lib/fall/__tests__/subphase-resolver.test.ts && npm test
git add src/lib/fall/
git commit -m "fix(fallakte): abgesagte/abgelehnte Termine nicht mehr als aktiv werten (Sweep A1)"
```

---

## Task G3: Tote Spalten-Referenzen entfernen (P1, Stufe 2)

`src/lib/faelle/claim-duplicate-columns.ts:120-121, 272` listet `auszahlung_gutachter_betrag`, `auszahlung_gutachter_eingegangen_am` und das Mapping `regulierung_betrag → regulierungs_betrag`. Diese `claims`-Spalten sind gedroppt (payment-ledger-cache-drop, Slice 4).
Heute inert, weil `stammdaten.ts` sie vorher abfängt und ins Ledger routet. Rest-Risiko: einer der ~6 übrigen `splitOrKeepFaelleUpdate`-Aufrufer reicht die Keys durch → `column does not exist`.
*Aufgabe:* Einträge entfernen, **alle** Aufrufer gegenprüfen.

## Task G4: Zwei fehlende Ratchet-Guards (P2, Stufe 2)

- `check:gutachter-termine-status` (aus FG2) — blockt ungültige Status-Literale gegen den CHECK-Constraint.
- `check:faelle-refs` (aus FG8) — blockt neue `.from('faelle')`-Referenzen (aktuell 0 live Refs).

Muster: `scripts/check-*.mjs` + Baseline-JSON + `--ratchet`/`--warn`/`--update-baseline`. Risiko heute 0, reine Zukunftsabsicherung.

## Task G5: Doku-Hygiene (P2, Stufe 2)

- `docs/superpowers/plans/2026-08-01-apotheken-scraper.md` → `ABGESCHLOSSEN` (Verweis: Sibling-Repo `apo-scraper`, 30 Commits 01.–03.08.)
- `docs/superpowers/specs/2026-08-01-apotheken-scraper-design.md` → „Implementiert"
- FG1, FG3, FG4, FG5, FG6, FG7 → `ABGESCHLOSSEN` bzw. `UEBERHOLT` mit je einer Zeile Begründung (FG1+FG6: durch `claims.status`-Drop strukturell gelöst)
- `docs/fundament/FUNDAMENT.md` §2 — siehe H0

---

# Lane A — Termin-Wahrheit im Embed (P0)

**Warum:** Der Kunde bekommt heute „✅ Ihr Termin ist reserviert" für einen Termin, der nie in der DB stand. Einziger Befund mit direktem Außenschaden.

**Belegte Kausalkette (RC-1):**
1. `actions.ts:146-176` ersetzt bei gesetztem Wunschtermin die echten Engine-Slots durch drei aus der Wunschstunde gerechnete Uhrzeiten (±2h/±4h) — ohne Belegung, Arbeitszeit oder Raster.
2. Die Engine lehnt beim Buchen korrekt ab (`writes.ts:43-45` → `code: 'belegt'`).
3. `actions.ts:410` verschluckt die Ablehnung (`requestModus`); die Bestätigung geht trotzdem raus.

**Entscheidung (gesetzt, revidierbar):** Der Wunschtermin bleibt anfragbar — aber als **klar gekennzeichnete Anfrage neben** den echten Slots, und nur wenn er tatsächlich frei ist. Erhält Aarons Request-Modell vom 12.06. und ist trotzdem ehrlich.

**File Structure:**

| Datei | Verantwortung |
|---|---|
| `src/lib/sv-matching-modul/wunschzeit-optionen.ts` | **neu** — pure Erzeugung + Belegungsprüfung |
| `src/lib/sv-matching-modul/__tests__/wunschzeit-optionen.test.ts` | **neu** — Tests inkl. RC-1-Regression |
| `src/lib/sv-matching-modul/types.ts:14` | `matchType` um `'wunschtermin_anfrage'` |
| `src/lib/sv-matching-modul/ranking.ts:19-24` | `PRIO` ergänzen |
| `src/app/embed/gutachter-finder/actions.ts:146-176, 410-415` | Kern-Umbau |
| `src/components/self-service/SvSlotAuswahl.tsx:176` | Anfrage optisch trennen |
| `src/app/embed/gutachter-finder/_components/DeadPinSlotStep.tsx` | dito |
| `tests/e2e/flows/embed-wunschtermin-kollision.spec.ts` | **neu** — Regression (braucht G1) |

---

### Task A1: Wunschzeit-Option als pures, testbares Modul

**Interfaces:**
- Consumes: `berlinWallClockToUtc` (`@/lib/google-calendar/timezone`, String → ISO-String) · `TERMIN_DAUER_MIN` (`@/lib/dispatch/termin-konstanten`, = 40)
- Produces: `baueWunschzeitOption(wunschterminLokal: string | null): WunschzeitOption | null`, `WunschzeitOption = { start: string; end: string }` — von A2/A3 genutzt.

- [ ] **Schritt 1: Failing Test schreiben**

`src/lib/sv-matching-modul/__tests__/wunschzeit-optionen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baueWunschzeitOption } from '../wunschzeit-optionen'

describe('baueWunschzeitOption', () => {
  it('konvertiert Berlin-Wall-Clock in den korrekten UTC-Instant (CEST = UTC+2)', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00')
    expect(o).not.toBeNull()
    expect(new Date(o!.start).toISOString()).toBe('2026-08-11T10:00:00.000Z')
  })

  it('liefert null ohne Wunschtermin', () => {
    expect(baueWunschzeitOption(null)).toBeNull()
    expect(baueWunschzeitOption('')).toBeNull()
  })

  it('liefert null bei unvollstaendiger Eingabe', () => {
    expect(baueWunschzeitOption('2026-08-11')).toBeNull()
  })

  // RC-1-Regression: der alte Inline-IIFE erzeugte [H, H+2, H-2] Zeiten und
  // ERSETZTE damit die echten Engine-Slots. Es darf genau EINE Option geben.
  it('erfindet keine Alternativstunden', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00')
    expect(Array.isArray(o)).toBe(false)
    expect(new Date(o!.start).getUTCHours()).toBe(10)
  })

  it('setzt das Ende auf start + TERMIN_DAUER_MIN (40)', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00')
    const dauer = (new Date(o!.end).getTime() - new Date(o!.start).getTime()) / 60_000
    expect(dauer).toBe(40)
  })
})
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
npx vitest run src/lib/sv-matching-modul/__tests__/wunschzeit-optionen.test.ts
```

Erwartet: FAIL — `Failed to resolve import "../wunschzeit-optionen"`.

- [ ] **Schritt 3: Implementierung**

`src/lib/sv-matching-modul/wunschzeit-optionen.ts`:

```ts
// Ops-Test 11.08.2026 (RC-1): Wunschzeit-Option fuer den Embed — PURE + testbar.
//
// Loest den Inline-IIFE `dreiZeiten` aus embed/gutachter-finder/actions.ts ab.
// Der erzeugte drei synthetische Uhrzeiten (Wunschstunde +/-2h/+/-4h) und
// ERSETZTE damit die echten Engine-Slots — ohne Belegung, Arbeitszeit oder
// Raster. Im Ops-Test wurde so 12:00 als frei angeboten, obwohl der SV um
// 12:30 einen Kalendertermin hatte.
//
// Neu: genau EINE Option (die tatsaechliche Wunschzeit), die der Aufrufer
// NEBEN die echten Slots stellt und als Anfrage kennzeichnet — nie als Slot.

import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'

export type WunschzeitOption = {
  /** ISO/UTC */
  start: string
  /** ISO/UTC — start + TERMIN_DAUER_MIN */
  end: string
}

/**
 * Baut aus der Berlin-Wall-Clock des Wunschtermin-Pickers ("YYYY-MM-DDTHH:MM")
 * die eine Wunschzeit-Option. Liefert null bei fehlender/ungueltiger Eingabe.
 */
export function baueWunschzeitOption(wunschterminLokal: string | null): WunschzeitOption | null {
  if (!wunschterminLokal) return null
  const [datum, zeit] = wunschterminLokal.split('T')
  if (!datum || !zeit) return null
  try {
    const start = berlinWallClockToUtc(`${datum}T${zeit.slice(0, 5)}`)
    if (Number.isNaN(new Date(start).getTime())) return null
    const end = new Date(new Date(start).getTime() + TERMIN_DAUER_MIN * 60_000).toISOString()
    return { start, end }
  } catch {
    return null
  }
}
```

- [ ] **Schritt 4: Grün bestätigen**

```bash
npx vitest run src/lib/sv-matching-modul/__tests__/wunschzeit-optionen.test.ts
```

Erwartet: PASS, 5 Tests.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/sv-matching-modul/wunschzeit-optionen.ts src/lib/sv-matching-modul/__tests__/wunschzeit-optionen.test.ts
git commit -m "feat(embed): pure Wunschzeit-Option statt Inline-IIFE (RC-1 Vorarbeit)"
```

---

### Task A2: Belegte Wunschzeit erkennen (fail-closed)

**Interfaces:**
- Consumes: `pruefeBelegungStrict` (`@/lib/termine/engine/belegung`) · `berechneBlockadeFenster` (`@/lib/dispatch/termin-konstanten`)
- Produces: `istWunschzeitFrei(svId, option, db?): Promise<boolean>` — **fail-closed**, DB-Fehler → `false`.

**Wiederverwendung (Audit-Punkt 3):** `berechneBlockadeFenster` existiert bereits und rechnet exakt `[start − Puffer, start + Dauer + Puffer]`. Nicht neu bauen.

- [ ] **Schritt 1: Failing Test anhängen**

```ts
import { istWunschzeitFrei } from '../wunschzeit-optionen'

describe('istWunschzeitFrei', () => {
  // Fake-Client: liefert die uebergebenen Zeilen fuer jede v_belegung-Query.
  const fakeDb = (rows: unknown[], error: { message: string } | null = null) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'gt', 'order']) chain[m] = () => chain
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error })
    return { from: () => chain } as never
  }

  const option = { start: '2026-08-11T10:00:00.000Z', end: '2026-08-11T10:40:00.000Z' }

  it('frei, wenn keine Belegung im Fenster liegt', async () => {
    expect(await istWunschzeitFrei('sv-1', option, fakeDb([]))).toBe(true)
  })

  it('belegt, wenn ein externer Kalenderblock ueberlappt (Ops-Test-Fall)', async () => {
    // SV-Block Di 12:30-13:30 Berlin = 10:30-11:30 UTC.
    const rows = [{ start_zeit: '2026-08-11T10:30:00+00', end_zeit: '2026-08-11T11:30:00+00' }]
    expect(await istWunschzeitFrei('sv-1', option, fakeDb(rows))).toBe(false)
  })

  it('fail-closed: DB-Fehler gilt als belegt', async () => {
    expect(await istWunschzeitFrei('sv-1', option, fakeDb([], { message: 'boom' }))).toBe(false)
  })
})
```

- [ ] **Schritt 2: Fehlschlag bestätigen** — `istWunschzeitFrei is not a function`.

- [ ] **Schritt 3: Implementierung anhängen**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { pruefeBelegungStrict } from '@/lib/termine/engine/belegung'
import { berechneBlockadeFenster } from '@/lib/dispatch/termin-konstanten'

/**
 * Ist die Wunschzeit beim SV tatsaechlich frei? Prueft das volle Blockade-
 * Fenster (Dauer + Puffer beidseitig) gegen v_belegung — Buchungen UND externe
 * Kalender-Blocks UND Ausnahmen.
 *
 * FAIL-CLOSED: bei DB-Fehler false. Eine faelschlich als frei angebotene
 * Wunschzeit ist genau der Ops-Test-Bug — im Zweifel nicht anbieten.
 */
export async function istWunschzeitFrei(
  svId: string,
  option: WunschzeitOption,
  db?: SupabaseClient,
): Promise<boolean> {
  const fenster = berechneBlockadeFenster(option.start)
  if (!fenster) return false
  const res = await pruefeBelegungStrict(
    { typ: 'sachverstaendiger', id: svId },
    fenster.start,
    fenster.end,
    db,
  )
  return res.ok ? res.frei : false
}
```

- [ ] **Schritt 4: Grün bestätigen** — PASS, 8 Tests.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/sv-matching-modul/
git commit -m "feat(embed): fail-closed Belegungspruefung fuer die Wunschzeit (RC-1)"
```

---

### Task A3: Engine-Slots wieder führend machen

**Files:** `types.ts:14` · `ranking.ts:19-24` · `actions.ts:146-176`

- [ ] **Schritt 1: matchType erweitern** (`types.ts:14`)

```ts
  matchType: 'wunschtermin' | 'wunschtermin_anfrage' | 'gleicher_tag' | 'nahe' | 'nach'
```

`ranking.ts:19-24` — der neue Typ rankt direkt hinter dem echten Treffer:

```ts
const PRIO: Record<SlotVorschlag['matchType'], number> = {
  wunschtermin: 0,
  wunschtermin_anfrage: 1,
  gleicher_tag: 2,
  nahe: 3,
  nach: 4,
}
```

- [ ] **Schritt 2: Typecheck — findet alle erschöpfenden Records**

```bash
npm run typecheck
```

Bei Fehlern in `switch`/Record über `matchType`: dort `wunschtermin_anfrage` wie `wunschtermin` behandeln.

- [ ] **Schritt 3: Block ersetzen** (`actions.ts`, Zeilen 146–176, von `const dreiZeiten` bis inkl. der drei `return`-Zeilen)

```ts
    // Ops-Test 11.08. (RC-1): Die echten Engine-Slots bleiben FUEHREND. Der
    // Wunschtermin kommt als zusaetzliche, klar gekennzeichnete ANFRAGE dazu —
    // und nur, wenn er beim jeweiligen SV wirklich frei ist. Vorher ersetzte
    // ein synthetisches Zeit-Tripel die Engine-Slots komplett; dadurch wurde
    // im Test 12:00 angeboten, obwohl der SV um 12:30 belegt war.
    const wunschOption = baueWunschzeitOption(input.wunschterminLokal ?? null)

    const mitWunschAnfrage = async <T extends { svId: string; slots: SlotVorschlag[] }>(
      items: T[],
    ): Promise<T[]> => {
      if (!wunschOption) return items
      return Promise.all(
        items.map(async (it) => {
          const frei = await istWunschzeitFrei(it.svId, wunschOption)
          if (!frei) return it
          // Deckt sich die Anfrage mit einem echten Slot, gewinnt der echte Slot.
          if (it.slots.some((s) => s.start === wunschOption.start)) return it
          const anfrage: SlotVorschlag = {
            start: wunschOption.start,
            end: wunschOption.end,
            matchType: 'wunschtermin_anfrage',
          }
          return { ...it, slots: [anfrage, ...it.slots] }
        }),
      )
    }

    if (input.forceFallback) {
      const deadPins = await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
      return { kind: 'fallback', deadPins }
    }
    const res = await planeTerminMitFallback({
      lat: input.lat,
      lng: input.lng,
      wunschterminIso,
      ownerProfilId: input.ownerProfilId ?? null,
    })
    if (res.kind === 'partner') return { kind: 'partner', svs: await mitWunschAnfrage(res.svs) }
    return { kind: 'fallback', deadPins: res.deadPins }
```

Import ergänzen:

```ts
import { baueWunschzeitOption, istWunschzeitFrei } from '@/lib/sv-matching-modul/wunschzeit-optionen'
```

> **`ownerProfilId` nicht verlieren** — der Owner-Boost kam nach der RCA dazu und muss durchgereicht bleiben.
> **Dead-Pins bekommen keine Wunsch-Anfrage:** unclaimte `sv_leads` haben keinen Kalender, ihre Verfügbarkeit ist nicht prüfbar. Ihre generischen Slots bleiben; die Beschriftung klärt A5.

- [ ] **Schritt 4: Typecheck + Tests**

```bash
npm run typecheck && npm test
```

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/sv-matching-modul/types.ts src/lib/sv-matching-modul/ranking.ts src/app/embed/gutachter-finder/actions.ts
git commit -m "fix(embed): Engine-Slots wieder fuehrend, Wunschzeit nur als geprüfte Anfrage (RC-1)"
```

---

### Task A4: Buchungs-Fehlschlag nicht mehr verschlucken

**Files:** `actions.ts:320, 405-420`

**Interfaces:** `reserviereEmbedTermin` liefert zusätzlich `bestaetigt: boolean` — `true` = Termin steht in der DB, `false` = unbestätigte Anfrage. Von A5 gelesen.

- [ ] **Schritt 1: Rückgabe-Typ erweitern**

```ts
  | { ok: true; bestaetigt: boolean; token: string; leadId: string | null; svVorname: string | null; ortLabel: string | null; startIso: string | null; dispatcher: EmbedDispatcher | null; gutachter: EmbedGutachterProfil | null }
  | { ok: false; error: string; slotWeg?: boolean }
```

- [ ] **Schritt 2: Partner-Zweig ehrlich machen** (`actions.ts:408-415`)

```ts
    // Ops-Test 11.08. (RC-1): Ein fehlgeschlagener Buchungsversuch wurde im
    // Request-Modus in Erfolg umgedeutet — der Kunde bekam "Termin reserviert"
    // fuer einen Termin, den es nie gab. Jetzt wird der Ausgang durchgereicht:
    // gebucht => bestaetigt, sonst Anfrage (Lead + Wunschzeit stehen, Dispatch
    // bestaetigt). Ohne Wunschtermin bleibt der harte Abbruch.
    if (!b.ok && !requestModus) {
      return { ok: false, error: b.error ?? 'Der gewählte Termin ist nicht mehr verfügbar.', slotWeg: true }
    }
    const bestaetigt = b.ok === true
    if (!bestaetigt) {
      console.warn('[reserviereEmbedTermin] Wunschzeit nicht buchbar, laeuft als Anfrage:', b.error)
    }
    if (!intern) {
      void sendeEmbedTerminBestaetigung({
        token,
        svVorname: input.auswahl.svVorname,
        startIso: input.auswahl.start,
        bestaetigt,
      })
    }
    const gutachter = await ladeGutachterProfil(input.auswahl.svId)
    return { ok: true, bestaetigt, token, leadId, svVorname: input.auswahl.svVorname, ortLabel: null, startIso: input.auswahl.start, dispatcher, gutachter }
```

> **`intern`-Gate erhalten** — es ist die Send-Isolation gegen Team-Spam bei internen Test-Identitäten (#5085). Nicht wegrefactoren.

- [ ] **Schritt 3: Übrige Erfolgs-Returns ergänzen**

```ts
  // kein Slot waehlbar:
  if (!input.auswahl) return { ok: true, bestaetigt: false, token, leadId, svVorname: null, ortLabel: null, startIso: null, dispatcher, gutachter: null }

  // Dead-Pin: dispatch_pending ist nie eine Bestaetigung.
  return { ok: true, bestaetigt: false, token, leadId, svVorname: null, ortLabel: input.auswahl.ort, startIso: input.auswahl.start, dispatcher, gutachter: null }
```

- [ ] **Schritt 4: Typecheck deckt die Consumer auf**

```bash
npm run typecheck
```

Erwartet: Fehler in `FinderWizard.tsx` — `bestaetigt` dort durchreichen (Anzeige in A5).

- [ ] **Schritt 5: Build + Commit**

```bash
npm run build
git add src/app/embed/gutachter-finder/
git commit -m "fix(embed): Buchungs-Fehlschlag nicht mehr als Erfolg melden (RC-1)"
```

---

### Task A5: Texte und Darstellung an die Wahrheit anpassen

**Files:** `actions.ts` (`sendeEmbedTerminBestaetigung`, `sendeEmbedDeadPinBestaetigung`) · `SvSlotAuswahl.tsx:176` · `DeadPinSlotStep.tsx` · `FinderWizard.tsx`

- [ ] **Schritt 1: WhatsApp-Text vom Ausgang abhängig machen**

Signatur um `bestaetigt: boolean` erweitern, Kundentext ersetzen:

```ts
      const kundeText = bestaetigt
        ? [
            '✅ Ihr Termin ist bestätigt',
            '',
            `Hallo ${vorname || name},`,
            `Ihr Kfz-Gutachter ${input.svVorname} kommt am ${wann} Uhr.`,
            '',
            'Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
            '',
            'Ihr Claimondo-Team',
          ].join('\n')
        : [
            '📩 Ihre Terminanfrage ist eingegangen',
            '',
            `Hallo ${vorname || name},`,
            `Sie haben ${wann} Uhr bei ${input.svVorname} angefragt. Diese Zeit ist noch nicht bestätigt — wir prüfen sie und melden uns kurzfristig mit einer festen Zusage.`,
            '',
            'Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
            '',
            'Ihr Claimondo-Team',
          ].join('\n')
```

Team-Text — die Zeile `🕐 ${wann} Uhr` ersetzen durch:

```ts
      bestaetigt ? `🕐 ${wann} Uhr (bestätigt)` : `🕐 ${wann} Uhr — ⚠️ ANFRAGE, nicht gebucht — bitte Zeit klären`,
```

- [ ] **Schritt 2: Dead-Pin-Text angleichen** (nie bestätigt)

```ts
      const kundeText = [
        '📩 Ihre Terminanfrage ist eingegangen',
        '',
        `Hallo ${vorname || name},`,
        `Sie haben ${wann} Uhr bei einem ${gutachterLabel} angefragt. Wir prüfen die Zeit und bestätigen sie in Kürze.`,
        '',
        'Ihr Claimondo-Team',
      ].join('\n')
```

- [ ] **Schritt 3: Slot-Chips visuell trennen** (`SvSlotAuswahl.tsx:176`)

```tsx
                      {slot.matchType === 'wunschtermin' && (
                        <span className="ml-1 text-[10px] font-semibold text-claimondo-ondo">{t('slot.wunschzeit')}</span>
                      )}
                      {slot.matchType === 'wunschtermin_anfrage' && (
                        <span className="ml-1 text-[10px] font-semibold text-claimondo-shield/70">auf Anfrage</span>
                      )}
```

Gleiche Ergänzung in `DeadPinSlotStep.tsx`; dort zusätzlich der Hinweistext: „Wählen Sie eine Wunschzeit — wir bestätigen sie in Kürze."

- [ ] **Schritt 4: Danke-Seite** — in `FinderWizard.tsx` auf `bestaetigt` verzweigen: `true` → „Ihr Termin steht", `false` → „Ihre Anfrage ist eingegangen — wir bestätigen die Zeit in Kürze." Keine Formulierung, die eine feste Zusage suggeriert.

- [ ] **Schritt 5: Gates + Commit**

```bash
npm run build && npm test && npm run check:token-audit && npm run check:component-set -- --ratchet
git add src/app/embed/ src/components/self-service/SvSlotAuswahl.tsx
git commit -m "fix(embed): Termintexte und Slot-Chips sagen die Wahrheit (RC-1)"
```

---

### Task A6: Regressionstest — **setzt G1 voraus**

> ⛔ **Nicht vor G1 beginnen.** Solange `feststellung-flow-gate.spec.ts:15` die Collection crasht, läuft dieser Test auf CI nie — er wäre lokal grün und wertlos.

**Files:** Create `tests/e2e/flows/embed-wunschtermin-kollision.spec.ts`

**Regel 4 — operatives Soll zuerst.** Bevor eine Zeile Testcode entsteht, wird das Soll formuliert:
> *Ein Kunde, der über das Embed eine Wunschzeit anfragt, zu der der gewählte Gutachter laut Kalender belegt ist, bekommt diese Zeit nicht als buchbaren Slot angeboten. Wählt er sie dennoch (Anfrage), erhält er eine Anfrage-Bestätigung — nie eine Terminzusage. Es entsteht kein Termin-Phantom.*

**Fallen (aus `BROADCAST-prod-playwright-smoke-drei-fallen`):**
- `getByTestId` greift auf prod ins Leere (testids nur auf staging) → gegen prod über sichtbaren Text selektieren.
- Hydration-Race: `count()` direkt nach `goto` liefert 0 → erst auf ein stabiles Element warten.
- Cleanup gehört in `afterEach`, **nicht** in `try/finally` — ein Test-Timeout überspringt `finally` und hinterlässt Prod-Residue.

- [ ] **Schritt 1: Szenario umsetzen**

1. Seed: externer Kalenderblock für den Test-SV, Di 12:30–13:30 Berlin. **Achtung:** in `sv_kalender_events_cache` über `profile_id` seeden — der CalDAV-Sync füllt `sv_id` nicht, der View-Join läuft über `profile_id` (in prod verifiziert: 126 Zeilen, alle `sv_id` NULL).
2. Embed öffnen, Besichtigungsort im Einzugsgebiet, Wunschtermin Di 12:00.
3. **Assertion 1:** kein Chip „12:00" ohne den Zusatz „auf Anfrage"; bei belegter Zeit gar keiner.
4. Buchung abschließen.
5. **Assertion 2:** entweder `gutachter_finder_anfragen.termin_id` gesetzt **und** passende `gutachter_termine`-Zeile vorhanden, **oder** die Oberfläche zeigt „Anfrage". Nie: Bestätigung ohne Termin.
6. Cleanup in `afterEach`.

- [ ] **Schritt 2: Lokal gegen staging laufen lassen**

```bash
npx playwright test tests/e2e/flows/embed-wunschtermin-kollision.spec.ts
```

- [ ] **Schritt 3: Gegenprobe — der Test muss den alten Bug fangen**

A3-Änderung kurz zurücknehmen, Test laufen lassen: er **muss** rot werden. Ein Regressionstest, der den Bug nicht fängt, ist wertlos. Danach sofort wiederherstellen — **kein Stash überlebt die Session** (AGENTS.md Regel 3).

- [ ] **Schritt 4: Commit**

```bash
git add tests/e2e/flows/embed-wunschtermin-kollision.spec.ts
git commit -m "test(embed): Regression — belegte Wunschzeit erzeugt keine Terminzusage (RC-1)"
```

---

### Task A7: Prod-Verifikation (Regel 4)

- [ ] PR gegen `staging`; Merge/Drain-Session zieht ihn automatisch, sobald grün.
- [ ] Nach Deploy (VPS via `deploy-vps*.yml`, **nicht** Vercel) auf prod per UI nachstellen: Kalenderblock beim Test-SV, kollidierende Wunschzeit über das Embed anfragen.
- [ ] DB-Gegenprobe:

```sql
select a.id, a.wunschtermin, a.termin_id, t.status, t.start_zeit
from gutachter_finder_anfragen a
left join gutachter_termine t on t.id = a.termin_id
where a.email = '<test-email>'
order by a.erstellt_am desc limit 3;
```

Erwartet: `termin_id` gesetzt **mit** existierendem Termin, **oder** `termin_id` NULL **und** Anfrage-Wortlaut beim Kunden.
- [ ] Ergebnis im Marker `COORDINATION-ops-test-11-08-lane-a` festhalten, Testdaten aufräumen.

---

# Lane B — Datenintegrität (P1, Stufe 2)

### B1: Lead→`vehicles`-Rück-Sync — **Entscheidung offen**
`dispatch/leads/[id]/_actions/stammdaten.ts` schreibt `kennzeichen` & Co. nach `leads`; der Claim liest via `v_claim_full` aus `vehicles`. `vehicles`-Updates gibt es nur in `ensure-vehicle.ts` / `cardentity/*` — keines wird vom Lead-Save ausgelöst.
- **(a) Nachziehen:** Lead-Save aktualisiert bei konvertiertem Lead die `vehicles`-Row. Wenig invasiv, zwei schreibende Quellen bleiben.
- **(b) Sperren (empfohlen):** Fahrzeugfelder im Lead nach Konversion read-only, Bearbeitung nur am Claim. Beseitigt die Doppelquelle.

*Akzeptanz:* Kennzeichen-Korrektur nach Konversion ist im Claim sichtbar — oder im Lead gar nicht mehr möglich.

### B2: ZB1-Korrektur auf alle 15 Felder
`Zb1Korrekturen` (`zb1-actions.ts:18-24`) kennt 4 Felder, `apply-zb1-to-lead.ts` extrahiert 15. Fehlend: `halter_strasse`, `halter_plz`, `halter_stadt`, `fin`, `hsn`, `tsn`, `fahrzeug_baujahr`, `erstzulassung`, `fahrzeug_farbe`, `brn`. Preview in `components/onboarding/fields/Zb1UploadField.tsx` mitziehen.
*Akzeptanz:* Jedes gelesene Feld ist sichtbar und korrigierbar.

### B3: Warum hat das OCR nichts geschrieben?
Lead `bea4fa1d` hat `zb1_status='hochgeladen'`, aber alle `halter_*` und `fahrzeug_hersteller` NULL. Hat `zb1-parser.ts` nichts erkannt, oder hat `setIfEmpty` blockiert? **Ohne diese Antwort behebt B2 nur die Oberfläche.**

---

# Lane C — Richtige Abzweigung (P1, Stufe 2)

### C1: Schuldfrage-Weiche im Gutachter-Finder
`EmbedBuchungInput` kennt kein `schuldfrage`-Feld; der Wizard fragt sie nicht ab → immer `schuldfrage='gegner'` → `abrechnungsweg='haftpflicht'`. Bei Selbstverschulden muss der Kunde in die Reparatur-Lane und **es darf kein Gutachter zugeordnet werden** (`zugeordneter_sv_id=null`, kein Termin).
> Vorlage: PR #5091 hat dieselbe Weiche für den nativen `schaden-melden`-Pfad gebaut.

### C2: Onboarding-Vorlauf „was ist schon da"
`kunde/onboarding/OnboardingWizard.tsx`: Fahrzeugschein-Step überspringen bei `zb1_status='hochgeladen'` (#20) · „Wir suchen einen Gutachter" unterdrücken bei gesetztem `claims.sv_id` (#21) · Dokumenten-Zähler gegen den Ist-Bestand statt gegen die Soll-Liste rechnen (#22).

---

# Lane H — Fundament (aus dem Sweep)

Alle Dependencies (A1–A4, B1–B3, C1, C5) sind grün → **C2 und C3 sind unblockiert.**

### H0: C4-Formalabschluss + §2/§9-Sync — größter Hebel, kein neuer Code
Die §2-Tabelle in `docs/fundament/FUNDAMENT.md` ist für C2, C3 und C4 stale („Plan done, Code gated"), obwohl C4a–e komplett gemergt sind (#4940, #4977), C2a (#4986/#4992) und C3a/b + Teile c (#5011/#5090/#5095, #5017/#5044/#5059, #5068) ebenfalls.
**§9 steht real bei 2/9; reines Nachziehen bringt 4–5/9.** Für #7 („Eine Akte, Alt-Code gelöscht") fehlt der DoD-Nachweis: knip/Alt-Code-Check + Journey-Smokes pro Rolle führen, dann haken.
*Ein PR, fast nur Doku.*

### H2: C3c — SA-Moment feuert 6–7 WhatsApp
Meistzitierter offener Punkt (J1, J3, A3, §9-#6). `signSAandCreateFall` löst bis zu 7 Kunden-WhatsApp gleichzeitig aus.
Analyse + Zielbild (7→3): Marker `COORDINATION-sa-moment-wa-konsolidierung-handoff`; Plan `docs/fundament/plans/c3-notification-outbox-plan.md` §4.
⚠ Territorium `app/flow/[token]/actions.ts` (aar-956) · offene Produktentscheidung: **welche WA bleibt kanonisch?**
⚠ **Mit A5 abstimmen** — beide ändern Kunden-WhatsApp.

### H3: C2b — create-case-Lücken
Nur 1 von ~15 Meldewegen läuft über `createCase` (§9-#5). Plan: `docs/fundament/plans/c2-create-case-plan.md` §4.
- Gegner-Pflichtdok (A-3) — ⛔ **VERGEBEN** an Session `59cdebcb`
- Aircall-Dedup (D-4b) — frei
- Embed-Finder-Dedup (B-1) — frei

### H4: C1-Rest
Regel-4-Prod-Smoke-Nachweis (deploy-gated) → §9-#4 · `lexdrive manual_status_override` schreibt kein Event-Log (kleiner Folge-PR).

### H5: Unaufgenommene Handoffs
- `HANDOFF-fundament-c3a-outbox-retarget` — teilweise gelaufen (#5095, #5109), Rest prüfen, Marker schließen
- **#4804 (J4)** KVA-Betrag serverseitig Pflicht — kein Owner. ⚠ **Zielkonflikt mit E2, siehe Querbezug 4**
- `AUDIT-ortseingaben-autocomplete-branding` P3 (#5123 nicht gepusht?) + P4 (Marketing) — ⚠ **D1 hier einreihen**
- Partner-Cockpit System-Events `provision` + `statuswechsel` — prüfen ob die blockierenden Lanes ruhig sind
- C5-Folgetranche: `from('claims')` → `v_claim_full` an 17 Stellen

---

# Lane D — Erfassungsqualität (P2, Stufe 2)

### D1: Unfallort mit Places-Autocomplete + Geocoding
`unfallort` (`feststellung-steps.ts:28`) ist Freitext (Beleg: `'Ecke Wiesenstraße'`, `unfallort_lat/lng` NULL). ⚠ **In die laufende Ortseingaben-Lane einreihen** (H5), nicht parallel bauen. **Vorbedingung für D2.**

### D2: Unfallskizze im Kunden-Flow
`lib/unfallskizze/generate.ts` existiert, ist aber nur im Dispatch verdrahtet. Trigger im Feststellungs-Flow ergänzen. Braucht D1.

### D3: Datumsfelder auf deutsches Format
`WunschterminPicker.tsx:3-7` dokumentiert und löst das Problem bereits — Ansatz übernehmen.

### D4: Live-Transkript — **Entscheidung offen**
`useVoiceRecorder.ts` ist MediaRecorder + Batch-Whisper; Wort-für-Wort ist ausgeschlossen. Web Speech API (`interimResults`) oder Streaming-STT? Zweite Frage: **wo soll überhaupt diktiert werden?** Heute einziger Consumer ist der Support-Chat, im Flow gar keiner.

---

# Lane E — Werkstatt als Beteiligte (P2, Erkundung zuerst)

### E0: Bestandsaufnahme Werkstatt-Pfad — **blockiert E1–E3**
Welche Route sieht die Werkstatt? Wie wird sie an einen Claim gebunden? Warum bleibt `werkstatt_id` NULL? Wo sitzt das „Kostenvoranschlag ausstehend"-Gate (**nicht** in `lib/dokumente/erwartung.ts` — dort ist `sachschaden_rechnung` mit `pflicht: false` geführt)?

### E1: Werkstatt an den Claim binden (#7, #6)
`werkstatt_id` bei Vermittlung setzen; Werkstatt als Ansprechpartner; Werkstatt-Termin im Claim; bei „Fahrzeug steht in der Werkstatt" den Gutachtertermin spiegeln.

### E2: KVA-Blocker im Haftpflichtfall entfernen (#8)
⚠ **Zielkonflikt mit #4804 (H5) — vorher klären.** Im Haftpflichtfall gilt das Gutachten, nicht der KVA. Wenn #4804 die KVA-Pflicht einführt, muss sie abrechnungsweg-abhängig sein.

### E3: „Partnerwerkstatt vermitteln" neu bauen (#23)
Auftrag anlegen statt Unterschrift anfordern; Kunde sieht seinen Claim und wählt die Werkstatt; OCR für Gutachten **und** SV-Rechnung am Anfang, Claim-Anlage per Klick.

---

# Lane F — UI-Korrekturen (P3, Stufe 2)

### F1: SA-Upload in den SV-Einstellungen (#24)
Sicherungsabtretung existiert nur in `gutachter/verifizierung` und `gutachter/willkommen` (Onboarding). `app/gutachter/einstellungen/` um Nachreich-Upload ergänzen.

### F2: Chat-Hintergrund (#25) — fehlende Flächen-Klasse in `app/kunde/_components/KundeKbChat.tsx`.

### F3: Aufgabe „Termin bestätigen" nur mit Vorbedingung (#3) — Task-Generator prüft nicht, ob ein bestätigungsbedürftiger Termin existiert. Verwandt mit G2.

### F4: Kunden-Einstieg auf Fahrzeuge umstellen (#26) — **Produktarbeit, kein Bugfix.** `KundeNav.tsx:12` setzt bei einem Fall `href=/kunde/faelle/${singleFallId}`; die aktive Markierung fällt danach auf einen anderen Eintrag. Sollzustand ist eine Umstellung (Einstieg über Fahrzeuge, Claim von dort) — eigener Scope.

---

# Empfohlene Reihenfolge

1. **G1** — CI entroten. Klein, entblockt die Regressionserkennung für alle Lanes und ist Vorbedingung für A6.
2. **A1–A5** — Außenschaden stoppen. **G2 direkt mitnehmen** (gleiches Muster, siehe Querbezug 2).
3. **A6–A7** — Regression + Prod-Nachweis, sobald G1 auf `main` grün ist.
4. **H0** — größter Programm-Hebel ohne neuen Code.
5. **G3, G4, G5** — Aufräumen, gebündelt in einem PR.
6. **B, C** — Datenintegrität und Abzweigung.
7. **H2/H3, D, E, F** — als eigene Lanes aufnehmen (H3-1 ist vergeben!).

---

# Entscheidungspunkte

| # | Frage | Default | Betrifft |
|---|---|---|---|
| 1 | Wunschtermin: kennzeichnen oder filtern? | **beides** — geprüfte Anfrage neben echten Slots | A2, A3, A5 |
| 2 | Fahrzeugfelder: nachziehen oder sperren? | offen — Empfehlung **sperren** | B1 |
| 3 | Live-Transkript: Web Speech API oder Streaming-STT? | offen | D4 |
| 4 | Fahrzeug-zentrierte Navigation: eigener Produkt-Scope? | **ja** | F4 |
| 5 | **KVA-Pflicht (#4804) vs. KVA-Blocker weg (E2)** | offen — Vorschlag: **abrechnungsweg-abhängig** | E2, H5 |
| 6 | Welche SA-WhatsApp bleibt kanonisch? | offen (aus Sweep) | H2 |
| 7 | **Hänger-Detektor als Folgeauftrag?** | offen — Empfehlung **ja**, nach Lane A | neu |

Nur 1 ist gesetzt und umgesetzt. 2–7 blockieren ihre Lanes, nicht aber Lane A oder G.

---

# Anhang — Aaron-only (nicht Bau-Scope)

Aus dem Sweep, nur zur Kenntnis. Melden, wenn es im Weg steht.

**Operativ dringend:**
- **2 echte SV-Registrierungen nie freigeschaltet** — `ing-hagag` seit **24.06.** (7 Wochen), `sv-muensterland` seit 21.07.
- **Kundenfall `CLM-2026-01011` hängt seit 13 Tagen ohne Termin.** Kein Auto-Detektor vorhanden → siehe Querbezug 3, Entscheidungspunkt 7.

**Blocker/Zugänge:** Auth-Mails über Supabase-Built-in-SMTP (Rate-Limit ~2–4/h, kein Branding) · Cardentity-API tot (401) · Stripe `sk_live` + VPS-root-Passwort standen im Klartext im Chat, Rotation unbestätigt · Steuernummer/USt-IdNr „beantragt" → B2B-Rechnungen formal nicht voll §14-konform.

**Entscheidungen:** Eniola-Go fehlt (4.000 € netto) · **PR #5058 seit 08.08. CONFLICTING** — rebasen oder schließen · Werkstatt-Self-Signup schreibt Firmenname in `profiles.vorname`.

**Braucht physisches Gerät:** 3 Regel-4-Smokes (HEIC-Upload iPhone, mobile Zustandsdoku, NFC Android) · NFC-Karten: 0 von 20 haben je eine UID gespeichert · Telefon-Verify-Livetest · erster echter 29,99-€-Abo-Kauf.

---

# Nachträge

> **Hier andocken.** Neue Aufgaben in die passende Lane (nächste freie IDs: A8, B4, C3, D5, E4, F5, G6, H6) oder als **Lane I** anlegen. Pro Nachtrag mindestens: Dateien, Akzeptanzkriterium, Prio, Abhängigkeiten.

*(noch leer)*

---

# Selbstprüfung

**Abdeckung Ops-Test:** alle 26 Symptome zugeordnet — A: #1,2,4,5,19 · B: #15–18 · C: #9,20,21,22 · D: #10–14 · E: #6,7,8,23 · F: #3,24,25,26.
**Abdeckung Sweep:** Teil A → G1–G5 · Teil B → H0–H5 · Teil C → Anhang. Vollständig.
**Typkonsistenz:** `WunschzeitOption` (A1) → `istWunschzeitFrei` (A2) → `mitWunschAnfrage` (A3) durchgehend `{ start, end }` als ISO-Strings. `matchType: 'wunschtermin_anfrage'` in A3 eingeführt, in A5 gelesen. `bestaetigt: boolean` in A4 eingeführt, in A5 gelesen.
**Staging-Deltas berücksichtigt:** `ownerProfilId` (A3) und `intern`-Gate (A4) sind in den Snippets erhalten.

**Bewusste Schwächen:**
- Lanes B–F und H sind Stufe 2 — vor Aufnahme ausdetaillieren.
- A6 beschreibt das Szenario statt fertigen Playwright-Codes: Seed-Helper und Selektoren hängen an der Umgebung (staging vs. prod). Die Assertions sind präzise genug, um den Test daraus zu schreiben.
- E hat keine Detailplanung, weil die Faktenlage fehlt — deshalb E0 als Gate.
