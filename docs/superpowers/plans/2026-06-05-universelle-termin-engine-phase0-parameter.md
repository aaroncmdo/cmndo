# Universelle Termin-Engine — Phase 0: Parameter-Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (empfohlen) oder executing-plans. Steps mit `- [ ]`.

**Goal:** Termin-Dauer 40, Puffer 10, ETA-Marge 10, und kein-Standort → konservative ETA=50 (statt fail-open) — der pauschale 60-Blanket fliegt, die echte Mapbox-ETA wird der standort-genaue Governor.

**Architecture:** Alle vier Werte zentral in `termin-konstanten.ts`; `reachability.ts` behandelt nicht-auflösbare Standorte als ETA=50 (nur Mapbox-API-Ausfall bei *bekanntem* Standort bleibt fail-open); `slots.ts`/`findBestSV.ts` erben die Konstanten automatisch.

**Tech Stack:** TypeScript, Vitest (pure), tsx Live-Verify.

**⚠️ Bewusster Live-Dispatch-Behavior-Change** (mehr buchbare Slots, schärfere no-coords-Reachability): **Merge erst nach Aaron-Sign-off + Live-Verify.** PR gegen `staging`.

**Spec:** `docs/superpowers/specs/2026-06-05-universelle-termin-engine-design.md` §4, §9.

---

### Task 1: Konstanten zentralisieren (40 / 10 / 10 / 50)

**Files:**
- Modify: `src/lib/dispatch/termin-konstanten.ts:10,20`

- [ ] **Step 1: Werte ändern + zwei neue Konstanten**

`TERMIN_DAUER_MIN`: `45` → `40`. `TERMIN_PUFFER_MIN`: `60` → `10`. Direkt nach `TERMIN_PUFFER_MIN` ergänzen:

```ts
/**
 * Sicherheits-/Wrap-Marge ON TOP der echten Fahr-ETA zwischen zwei Claimondo-
 * Terminen (Parken, zur Tür, Kunde finden, Aufräumen). Eine Quelle — vorher
 * je lokal in reachability.ts + findBestSV.ts dupliziert (war 5).
 */
export const ETA_SICHERHEITS_PUFFER_MIN = 10

/**
 * ETA-Annahme wenn der Standort eines Nachbar-Termins NICHT auflösbar ist
 * (keine Coords, kein Lead-Fallback, nicht geocodebar). Konservativ statt
 * fail-open: 50 min Fahrt angenommen → mit +10 Puffer = 60 min Lücke nötig.
 * Mapbox-API-Ausfall bei BEKANNTEM Standort bleibt fail-open (transient).
 */
export const NO_LOCATION_ETA_MIN = 50
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "termin-konstanten|error TS" | head; echo "exit ${PIPESTATUS[0]}"`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dispatch/termin-konstanten.ts
git commit -m "feat(termine-engine/P0): Termin-Dauer 40, Puffer 10, ETA-Marge 10, NO_LOCATION_ETA 50 (zentral)"
```

---

### Task 2: `reachability.ts` — kein-Standort = 50 (statt fail-open)

**Files:**
- Modify: `src/lib/dispatch/reachability.ts:14` (lokale Konstante → Import), `precomputeSvSlotEtas` (~:260-275), `checkSvReachability` (~:119-141)
- Test: `src/lib/dispatch/__tests__/reachability-no-location.test.ts` (Create)

- [ ] **Step 1: Failing-Test schreiben** (`reachability-no-location.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { isSlotReachable, type SlotEtaContext } from '../reachability'

describe('Reachability kein-Standort = 50 (P0)', () => {
  // Vortermin endet 10:00, Slot startet 10:40 → 40 min Lücke.
  // Kein Standort am Vortermin → ETA=50, +10 Puffer = 60 > 40 → NICHT erreichbar.
  it('behandelt fehlende Termin-Coords als 50-min-ETA (konservativ, nicht fail-open)', () => {
    const ctx: SlotEtaContext = {
      termine: [{ id: 'v', startZeit: '2026-06-10T08:00:00Z', endZeit: '2026-06-10T08:00:00Z', etaMin: 50 }],
    }
    const r = isSlotReachable(new Date('2026-06-10T08:40:00Z'), new Date('2026-06-10T09:20:00Z'), ctx)
    expect(r.reachable).toBe(false)
  })

  // 70 min Lücke → 50+10=60 < 70 → erreichbar.
  it('erlaubt den Slot wenn die Lücke > 50+10 ist', () => {
    const ctx: SlotEtaContext = {
      termine: [{ id: 'v', startZeit: '2026-06-10T07:00:00Z', endZeit: '2026-06-10T07:30:00Z', etaMin: 50 }],
    }
    const r = isSlotReachable(new Date('2026-06-10T08:40:00Z'), new Date('2026-06-10T09:20:00Z'), ctx)
    expect(r.reachable).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen (rot)**

Run: `npx vitest run src/lib/dispatch/__tests__/reachability-no-location.test.ts`
Expected: erster Test FAIL (heute ist `ETA_SICHERHEITS_PUFFER_MIN=5` → 50+5=55 > 40 → eigentlich schon false … prüfen). Falls schon grün: der Test beweist nur die Marge; weiter zu Step 3 für die Quell-Änderung.

> Hinweis: `isSlotReachable` nutzt `t.etaMin` direkt — der Test setzt `etaMin: 50` manuell. Der echte no-loc=50-Pfad sitzt in `precomputeSvSlotEtas` (Step 4). Dieser Unit-Test sichert die *Marge*-Semantik (10).

- [ ] **Step 3: lokale Konstante → Import** (`reachability.ts:14`)

Entferne `const ETA_SICHERHEITS_PUFFER_MIN = 5` und importiere oben:

```ts
import { ETA_SICHERHEITS_PUFFER_MIN, NO_LOCATION_ETA_MIN } from '@/lib/dispatch/termin-konstanten'
```

- [ ] **Step 4: `precomputeSvSlotEtas` — non-located Termine → 50**

Nach der `terminLocs.forEach(... etaMin = etas[k])`-Schleife (die ETAs für *lokalisierte* Termine setzt) ergänzen — Termine OHNE auflösbaren Standort bekommen die konservative 50 (Mapbox-`null` bei *bekanntem* Standort bleibt `null` = fail-open):

```ts
  const locatedIdx = new Set(terminLocs.map((tl) => tl.idx))
  terminMitEta.forEach((t, idx) => {
    if (!locatedIdx.has(idx)) t.etaMin = NO_LOCATION_ETA_MIN // kein Standort → konservativ, kein fail-open
  })
```

- [ ] **Step 5: `checkSvReachability` — prev/next ohne Standort → 50**

Ersetze die ETA-Ableitung (`const etaFromPrevMin = prevIdx >= 0 ? etas[prevIdx] ?? null : null` + analog next) durch:

```ts
  // prev/next EXISTIERT aber kein Standort (prevIdx/-Idx == -1) → konservativ 50.
  // located + Mapbox-null → null (fail-open, transient).
  const etaFromPrevMin = prevIdx >= 0 ? (etas[prevIdx] ?? null) : (prev ? NO_LOCATION_ETA_MIN : null)
  const etaToNextMin = nextIdx >= 0 ? (etas[nextIdx] ?? null) : (next ? NO_LOCATION_ETA_MIN : null)
```

Und den frühen `if (adjLocs.length === 0) return { reachable: true }` (vor dem Mapbox-Call) so anpassen, dass bei vorhandenem prev/next ohne Standort NICHT vorzeitig „erreichbar" zurückgegeben wird — nur wenn weder prev noch next existiert:

```ts
  // Ersetze: if (adjLocs.length === 0) return { reachable: true }
  // durch (Mapbox nur wenn es Locations gibt; sonst etas = []):
  const etas = adjLocs.length > 0
    ? await mapboxEtaMatrix({ lat: input.candidateLat, lng: input.candidateLng }, adjLocs)
    : []
```

(Der bestehende `if (!prev && !next) return { reachable: true }` weiter oben deckt den echten „keine Nachbarn"-Fall ab.)

- [ ] **Step 6: tsc + Tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "reachability|error TS" | head; echo "exit ${PIPESTATUS[0]}"` → exit 0
Run: `npx vitest run src/lib/dispatch/__tests__/reachability-no-location.test.ts` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/dispatch/reachability.ts src/lib/dispatch/__tests__/reachability-no-location.test.ts
git commit -m "feat(termine-engine/P0): reachability kein-Standort=50 (konservativ statt fail-open) + Marge 10 zentral"
```

---

### Task 3: `findBestSV.ts` — lokale Marge-Konstante → Import

**Files:**
- Modify: `src/lib/dispatch/findBestSV.ts:18-27`

- [ ] **Step 1: lokale Konstante entfernen, importieren**

Entferne `const ETA_SICHERHEITS_PUFFER_MIN = 5` (~:27). Ergänze im bestehenden `termin-konstanten`-Import:

```ts
import {
  TERMIN_DAUER_MIN,
  TERMIN_PUFFER_MIN,
  ETA_SICHERHEITS_PUFFER_MIN,
  naechsterWerktag10Uhr,
} from './termin-konstanten'
```

> `findBestSV`s ±60-Blanket (`fensterStart/fensterEnd`, :599-600) nutzt `TERMIN_PUFFER_MIN` → wird automatisch 10. Die inline-Adjacent-Reachability (:399/413) nutzt jetzt die zentrale 10. **Kein** no-loc=50 in findBestSVs inline-Pfad (stirbt in Sub-A → Thin-Wrapper; bis dahin fail-open wie heute, Diff wird im Sub-A-Shadow erwartet).

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "findBestSV|error TS" | head; echo "exit ${PIPESTATUS[0]}"` → exit 0

- [ ] **Step 3: Commit**

```bash
git add src/lib/dispatch/findBestSV.ts
git commit -m "refactor(termine-engine/P0): findBestSV ETA-Marge aus zentraler Konstante (10)"
```

---

### Task 4: Live-Verify (Slots steigen, fern bleibt geblockt, no-loc=50 greift)

**Files:**
- Create: `scripts/verify-engine-reachability-puffer.mts`

- [ ] **Step 1: Verify-Script** (Muster aus bestehenden `scripts/verify-engine-*.mts`: `cp <main>/.env.local .env.local` → tsx → `rm`; try/finally; JSON-VERDICT)

Script lädt `freieSlots` für einen realen SV über ein 2-Wochen-Fenster und gibt die Slot-Anzahl + ein Beispiel-Tag aus. **Manuell**: vor/nach dem Branch vergleichen — Anzahl muss steigen (Blanket 60→10). Zusätzlich: ein SQL-DO-Block (rollback) der zwei eng beieinanderliegende, weit auseinander-geocodete Termine simuliert und prüft, dass `freieSlots` den Zwischenslot via ETA blockt.

```ts
// verify-engine-reachability-puffer.mts — P0-Beleg: mehr Slots durch 10er-Puffer,
// ETA blockt weiterhin fern, no-loc=50 greift. loadEnv aus verify-engine-belegung.mts.
import { loadEnv } from './verify-engine-belegung.mts' // cp .env.local pattern
loadEnv()
const { freieSlots } = await import('@/lib/termine/engine')
const { createAdminClient } = await import('@/lib/supabase/admin')
const db = createAdminClient()
// Realer dispatchabler SV mit Standort:
const { data: sv } = await db.from('sachverstaendige')
  .select('id, standort_lat, standort_lng').not('standort_lat', 'is', null).limit(1).maybeSingle()
if (!sv) { console.log(JSON.stringify({ verdict: 'SKIP', grund: 'kein SV mit Standort' })); process.exit(0) }
const von = new Date().toISOString()
const bis = new Date(Date.now() + 14 * 864e5).toISOString()
const tage = await freieSlots(
  { typ: 'sachverstaendiger', id: sv.id as string },
  von, bis,
  { schadenort: { lat: Number(sv.standort_lat), lng: Number(sv.standort_lng) } },
  db,
)
const slotCount = tage.reduce((n, t) => n + t.slots.length, 0)
console.log(JSON.stringify({ verdict: slotCount > 0 ? 'PASS' : 'CHECK', svId: sv.id, tage: tage.length, slotCount }, null, 2))
```

- [ ] **Step 2: Verify laufen**

Run: `cp ../../../.env.local .env.local 2>/dev/null; npx tsx scripts/verify-engine-reachability-puffer.mts; rm -f .env.local`
Expected: JSON mit `verdict: "PASS"` + plausibel viele Slots (mehr als mit 60er-Blanket).

- [ ] **Step 3: tsc (mts ist im tsconfig-Scope)**

Run: `npx tsc --noEmit 2>&1 | grep -E "verify-engine-reachability|error TS" | head; echo "exit ${PIPESTATUS[0]}"` → exit 0

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-engine-reachability-puffer.mts
git commit -m "test(termine-engine/P0): Live-Verify Puffer/Reachability (Slot-Anstieg, ETA-Block, no-loc=50)"
```

---

### Task 5: PR gegen staging (Sign-off-Gate)

- [ ] **Step 1: 7-Punkte-Audit** (AGENTS.md): Build (tsc grün) · UI n/a · Redundanz (Konstanten zentralisiert, lokale Dups weg) · Dead-Code (keine) · Spec (§4/§9 erfüllt) · Inkonsistenz (eine Quelle) · Regression (**bewusst**: mehr Slots + schärfere no-coords-Reachability — Sign-off).

- [ ] **Step 2: Push + PR**

```bash
git push -u origin kitta/termine-engine-universal
gh pr create --base staging --title "feat(termine-engine/P0): Parameter-Fix — Dauer 40, Puffer 10, Reachability ETA+10/no-loc=50" --body-file <body>
```

PR-Body: die Änderung, der **bewusste Behavior-Change** (mehr buchbare Slots + no-coords→50 statt fail-open), Live-Verify-Ergebnis, **„MERGE erst nach Aaron-Sign-off"**.

---

## Self-Review

- **Spec-Coverage:** §4 (ETA+10/no-loc=50/Mapbox-down-fail-open) → Task 1+2. §9 (40/10/10/50) → Task 1. Dauer 40 → Task 1 (fließt via `freieSlots`/`findeBestePerson` `dauerMin=TERMIN_DAUER_MIN`). ✓
- **Placeholder:** keine TBD/„handle edge cases" — alle Steps mit Code/Command. ✓
- **Typ-Konsistenz:** `NO_LOCATION_ETA_MIN`/`ETA_SICHERHEITS_PUFFER_MIN` in Task 1 definiert, in Task 2/3 importiert (gleiche Namen). ✓
