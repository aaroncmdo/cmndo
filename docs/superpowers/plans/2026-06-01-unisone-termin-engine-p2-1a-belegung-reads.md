# Unisone Termin-Engine — Phase 2.1a (Belegung-Read-Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den assignee-generischen Lese-Kern der Termin-Engine bauen — `lib/termine/engine` mit `pruefeBelegung()` + `ladeBelegung()`, die `v_belegung` (Buchungen ∪ externe Blocks, Phase 1 / PR #2180) als **die EINE Lese-Quelle** lesen.

**Architecture:** Reine **Code-only**-Schicht, **0 DDL**. Die Engine liest `v_belegung` (service_role-only) für ein `{typ, id}`-Assignee-Paar mit Halb-offen-Overlap-Semantik (identisch zu `getCachedBusyWindows`). Keine bestehende Logik wird umgehängt (Consumer-Repoint = Phase 3) → verhaltensneutral, isoliert smoke-/test-bar. Die DB-bindenden Funktionen lazy-importieren den Admin-Client (wie die Verify-Scripts), sodass die reine Mapper-Logik DB-frei unit-testbar bleibt.

**Tech Stack:** TypeScript, Next.js 16, Supabase (`v_belegung` Read via `createAdminClient`), Vitest (`npm test`) für reine Logik, tsx-Verify-Script (`npx tsx scripts/verify-*.mts`, Muster `verify-v-belegung.mts`) für die Live-DB-Integration.

---

## ⚠️ Koordination

- **0 DDL** in P2.1a → **kein** Schema-Touch auf dem geteilten `gutachter_termine`, **keine** Migration. Daher kein DDL-Koordinations-Dance nötig. (Die riskante Exclusion-Constraint-Generalisierung + additive Schema-Adds bleiben in **P2.2**; die `verfuegbarkeits_ausnahmen`-Tabelle + `freieSlots` in **P2.1b**.)
- Branch `kitta/unisone-termin-engine` ist isoliert (eigener Worktree). Vor PR: `git fetch` + Build-Gate.
- **Regel 1:** PR gegen `staging`, nie `main`. **Regel 3:** kein unbegleiteter Stash am Ende.
- **7-Punkte-Audit** (AGENTS.md) in jeder Commit-Message.
- **[[Write-Tool </content>-Artefakt]]:** nach jedem `Write` das Dateiende auf ein literales `</content>` scannen + via Edit strippen (bricht sonst tsc/Vitest).

---

## Abweichung vom Kickoff-Handoff (grounding-getrieben, 01.06. — dokumentiert)

Der Phase-2-Kickoff bündelt **P2.1 = `pruefeBelegung` + `freieSlots`** in einem Schritt und nennt die `verfuegbarkeits_ausnahmen`-Tabelle dort. Live-Grounding + Reader-Inventar (3 Explore-Agents, 01.06.) zeigen, dass eine Zwei-Teilung dependency-sauberer und PR-kleiner ist:

1. **P2.1a (dieser Plan) = Belegung-Read-Core, 0 DDL.** `pruefeBelegung`/`ladeBelegung` über `v_belegung` (existiert). Das ist das Fundament, auf dem `freieSlots` aufsetzt (es subtrahiert genau diese Belegungs-Fenster). 0 DDL → sofort subagent-baubar ohne `gutachter_termine`-Koordination.
2. **P2.1b (Folgeplan) = `freieSlots` + `verfuegbarkeits_ausnahmen`-Tabelle.** `freieSlots` baut auf `ladeBelegung`, konsolidiert `ladeFreieSlots`/`getAvailableKbSlots` (Arbeitszeiten je Assignee-Typ + Reachability/ETA `precomputeSvSlotEtas`/`isSlotReachable`) und braucht die neue (additive) Ausnahmen-Tabelle als einzige DDL.

Begründung: Die `verfuegbarkeits_ausnahmen`-Tabelle wird **nur** von `freieSlots` konsumiert, nicht vom Belegung-Read-Core → sie gehört zu P2.1b, wo sie genutzt wird (kein Schema-Vorlauf ohne Consumer). So bleibt P2.1a strikt Code-only.

**Live-Grounding-Fakten (01.06., verifiziert):**
- `v_belegung` existiert, Spalten: `assignee_typ, assignee_id, start_zeit, end_zeit, belegung_typ, status, termin_typ, bezug_typ, bezug_id, standort_lat, standort_lng, quelle_id`. Lock: `security_invoker=true`, nur `postgres`/`service_role` (kein anon/authenticated) → **Engine liest via Admin-Client**.
- `src/lib/termine/engine/` existiert **noch nicht** (Clean Slate).
- Externe Busy-Reader (`cache-busy.ts`/`freebusy.ts`/`busy-slots.ts`) lesen **nur** `sv_kalender_events_cache` (extern); eigene Buchungen werden separat subtrahiert. `v_belegung` unioniert **beides** → das ist der Konsolidierungs-Gewinn und der Cross-Check.
- Canonical Reader-Signatur: `getCachedBusyWindows(svId, fromIso, toIso): Promise<{start,end}[]>` (`@/lib/kalender/cache-busy`), Overlap `start < to AND end > from`, ordered by start.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/lib/termine/engine/types.ts` | Engine-Kern-Typen: `AssigneeTyp`, `Assignee`, `BelegungsFenster`, `VBelegungRow` | Create |
| `src/lib/termine/engine/belegung.ts` | `rowToFenster` (pure Mapper) + `ladeBelegung` + `pruefeBelegung` (lesen `v_belegung`) | Create |
| `src/lib/termine/engine/belegung.test.ts` | Vitest-Unit-Test für `rowToFenster` (DB-frei) | Create |
| `src/lib/termine/engine/index.ts` | Public Barrel (Typen + Belegung-API) | Create |
| `scripts/verify-engine-belegung.mts` | tsx-Integrations-Verify gegen Live-DB + Cross-Check `getCachedBusyWindows` | Create |

---

## Task 1: Engine-Typen + Barrel-Scaffold

**Files:**
- Create: `src/lib/termine/engine/types.ts`
- Create: `src/lib/termine/engine/index.ts`

- [ ] **Step 1: `types.ts` schreiben**

```typescript
// Termin-Engine — assignee-generische Kern-Typen.
// Lese-Quelle ist die VIEW public.v_belegung (Phase 1, PR #2180): Buchungen
// (gutachter_termine, aktiver Status) UNION externe Blocks (sv_kalender_events_cache).
// v_belegung ist service_role-only (security_invoker + REVOKE anon/authenticated).

export type AssigneeTyp = 'sachverstaendiger' | 'sv_lead' | 'kundenbetreuer' | 'kanzlei'

export interface Assignee {
  typ: AssigneeTyp
  id: string
}

export type BelegungTyp = 'buchung' | 'extern'
export type BezugTyp = 'claim' | 'fall' | 'lead'

/** Ein Belegungs-Fenster aus v_belegung (eine Buchung ODER ein externer Kalender-Block). */
export interface BelegungsFenster {
  start: string // ISO (start_zeit)
  end: string // ISO (end_zeit)
  belegungTyp: BelegungTyp
  status: string | null // null bei 'extern'
  terminTyp: string | null // v_belegung.termin_typ (gutachter_termine.typ); null bei extern
  bezugTyp: BezugTyp | null
  bezugId: string | null
  standortLat: number | null
  standortLng: number | null
  quelleId: string // v_belegung.quelle_id (Quell-Zeilen-id: gutachter_termine.id ODER cache.id)
}

/**
 * Roh-Zeilenform von public.v_belegung. Manuell getippt, weil die generierten
 * DB-Typen v_belegung noch nicht kennen (Regen aufgeschoben, Phase-1 Task 6) —
 * der Lese-Pfad in belegung.ts castet lokal, die Public-API bleibt voll typisiert.
 */
export interface VBelegungRow {
  assignee_typ: string | null
  assignee_id: string | null
  start_zeit: string
  end_zeit: string
  belegung_typ: 'buchung' | 'extern'
  status: string | null
  termin_typ: string | null
  bezug_typ: string | null
  bezug_id: string | null
  standort_lat: number | null
  standort_lng: number | null
  quelle_id: string
}
```

- [ ] **Step 2: `index.ts` Barrel schreiben**

```typescript
// Public API der Termin-Engine.
export type {
  AssigneeTyp,
  Assignee,
  BelegungTyp,
  BezugTyp,
  BelegungsFenster,
  VBelegungRow,
} from './types'
export { rowToFenster, ladeBelegung, pruefeBelegung } from './belegung'
```

> `index.ts` referenziert `./belegung` (Task 2) — bis Task 2 existiert, ist der Re-Export tot. Das ist ok: `tsc` läuft erst nach Task 2 (Step 4). Knip meldet ungenutzte Files erst beim `--ratchet`-CI gegen die Baseline; ein Barrel mit Re-Exports zählt nicht als ungenutzt.

- [ ] **Step 3: Auf `</content>`-Artefakt scannen**

Beide neuen Files am Ende prüfen; ein versehentliches literales `</content>` via Edit entfernen.

- [ ] **Step 4: Commit**

```bash
git add src/lib/termine/engine/types.ts src/lib/termine/engine/index.ts
git commit  # 7-Punkt-Audit im Body (UI: n/a — interne Lib; Build: tsc folgt Task 2)
```

---

## Task 2: `rowToFenster` Mapper (TDD, DB-frei) + DB-Reader

**Files:**
- Create: `src/lib/termine/engine/belegung.ts`
- Create: `src/lib/termine/engine/belegung.test.ts`

- [ ] **Step 1: Failing Vitest-Test für den reinen Mapper schreiben**

`src/lib/termine/engine/belegung.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { rowToFenster } from './belegung'
import type { VBelegungRow } from './types'

describe('rowToFenster', () => {
  it('mappt eine Buchungs-Zeile (buchung) vollständig', () => {
    const row: VBelegungRow = {
      assignee_typ: 'sachverstaendiger',
      assignee_id: 'sv-1',
      start_zeit: '2026-06-02T08:00:00Z',
      end_zeit: '2026-06-02T09:00:00Z',
      belegung_typ: 'buchung',
      status: 'bestaetigt',
      termin_typ: 'sv_begutachtung',
      bezug_typ: 'claim',
      bezug_id: 'claim-1',
      standort_lat: 51.2,
      standort_lng: 7.1,
      quelle_id: 'termin-1',
    }
    expect(rowToFenster(row)).toEqual({
      start: '2026-06-02T08:00:00Z',
      end: '2026-06-02T09:00:00Z',
      belegungTyp: 'buchung',
      status: 'bestaetigt',
      terminTyp: 'sv_begutachtung',
      bezugTyp: 'claim',
      bezugId: 'claim-1',
      standortLat: 51.2,
      standortLng: 7.1,
      quelleId: 'termin-1',
    })
  })

  it('mappt einen externen Block (extern) mit null status/bezug', () => {
    const row: VBelegungRow = {
      assignee_typ: 'sachverstaendiger',
      assignee_id: 'sv-1',
      start_zeit: '2026-06-03T10:00:00Z',
      end_zeit: '2026-06-03T11:00:00Z',
      belegung_typ: 'extern',
      status: null,
      termin_typ: null,
      bezug_typ: null,
      bezug_id: null,
      standort_lat: 51.0,
      standort_lng: 7.0,
      quelle_id: 'cache-9',
    }
    const f = rowToFenster(row)
    expect(f.belegungTyp).toBe('extern')
    expect(f.status).toBeNull()
    expect(f.bezugTyp).toBeNull()
    expect(f.bezugId).toBeNull()
    expect(f.quelleId).toBe('cache-9')
  })
})
```

- [ ] **Step 2: Test laufen lassen → muss fehlschlagen**

Run: `npm test -- src/lib/termine/engine/belegung.test.ts`
Expected: FAIL (`rowToFenster` / `./belegung` existiert nicht → Import-/Resolve-Fehler).

- [ ] **Step 3: `belegung.ts` schreiben (Mapper + DB-Reader)**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BelegungsFenster, BezugTyp, VBelegungRow } from './types'

/** Reiner Mapper: v_belegung-Rohzeile → BelegungsFenster. Keine I/O. */
export function rowToFenster(row: VBelegungRow): BelegungsFenster {
  return {
    start: row.start_zeit,
    end: row.end_zeit,
    belegungTyp: row.belegung_typ,
    status: row.status,
    terminTyp: row.termin_typ,
    bezugTyp: (row.bezug_typ as BezugTyp | null) ?? null,
    bezugId: row.bezug_id,
    standortLat: row.standort_lat,
    standortLng: row.standort_lng,
    quelleId: row.quelle_id,
  }
}

/**
 * Liest alle Belegungs-Fenster (Buchungen ∪ externe Blocks) eines Assignees, die
 * sich mit [vonIso, bisIso) überschneiden. Overlap-Semantik identisch zu
 * getCachedBusyWindows: ein Fenster zählt, wenn start < bisIso UND end > vonIso.
 *
 * v_belegung ist service_role-only → ohne übergebenen Client wird der Admin-Client
 * lazy importiert (hält die Public-API DB-frei unit-testbar).
 */
export async function ladeBelegung(
  assignee: Assignee,
  vonIso: string,
  bisIso: string,
  db?: SupabaseClient,
): Promise<BelegungsFenster[]> {
  const client = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  // v_belegung ist (noch) nicht in den generierten DB-Typen → lokaler Cast,
  // Rückgabe wird sofort auf VBelegungRow normalisiert.
  const { data, error } = await (client as unknown as SupabaseClient)
    .from('v_belegung' as never)
    .select('*')
    .eq('assignee_typ', assignee.typ)
    .eq('assignee_id', assignee.id)
    .lt('start_zeit', bisIso)
    .gt('end_zeit', vonIso)
    .order('start_zeit', { ascending: true })

  if (error) {
    console.error('[termine/engine] ladeBelegung:', error.message)
    return []
  }
  return ((data ?? []) as unknown as VBelegungRow[]).map(rowToFenster)
}

/**
 * Ist der Assignee in [vonIso, bisIso) belegt? Aus ladeBelegung abgeleitet →
 * beweisbar konsistent mit ihr.
 */
export async function pruefeBelegung(
  assignee: Assignee,
  vonIso: string,
  bisIso: string,
  db?: SupabaseClient,
): Promise<'frei' | 'belegt'> {
  const fenster = await ladeBelegung(assignee, vonIso, bisIso, db)
  return fenster.length > 0 ? 'belegt' : 'frei'
}
```

> **TS-Gotcha:** `.from('v_belegung' as never)` umgeht den „Tabelle unbekannt"-Fehler ohne den ganzen Client auf `any` zu casten; `data` wird über `as unknown as VBelegungRow[]` normalisiert. Falls `tsc` an der `.eq()`-Kette auf dem `never`-Builder meckert, stattdessen `const q = (client as any).from('v_belegung')` nutzen und `q` weiter-chainen (ein lokales `any`, kommentiert). Beides ist akzeptabel; bevorzugt die `as never`-Variante.

- [ ] **Step 4: Test laufen lassen → grün + tsc grün**

```bash
npm test -- src/lib/termine/engine/belegung.test.ts   # PASS (beide rowToFenster-Cases)
npx tsc --noEmit                                       # PASS
```
Expected: Vitest PASS, tsc PASS.

- [ ] **Step 5: Auf `</content>`-Artefakt scannen + Commit**

```bash
git add src/lib/termine/engine/belegung.ts src/lib/termine/engine/belegung.test.ts
git commit  # 7-Punkt-Audit im Body
```

---

## Task 3: Live-Integrations-Verify (tsx) gegen `v_belegung`

**Files:**
- Create: `scripts/verify-engine-belegung.mts`

Beweist gegen die geteilte Prod+Staging-DB: (a) `ladeBelegung` liefert für einen realen SV dieselben **externen** Fenster wie der Legacy-Reader `getCachedBusyWindows` (Konsolidierungs-Beweis) und liefert zusätzlich `buchung`-Fenster; (b) `pruefeBelegung` ist `belegt` auf einem bekannten Belegungs-Fenster und `frei` auf einem Leerfenster.

- [ ] **Step 1: RED — Script existiert nicht / Engine-Import schlägt fehl**

Vor dem Schreiben: ein Lauf würde am fehlenden File scheitern. (Kein separater RED-Run nötig — der GREEN-Run in Step 3 ist der Gate.)

- [ ] **Step 2: `scripts/verify-engine-belegung.mts` schreiben (Muster: `verify-v-belegung.mts`)**

```typescript
// P2.1a Verify: Engine-Belegung-Read-Core gegen v_belegung + Cross-Check vs.
// getCachedBusyWindows (Legacy externer Busy-Reader). Run:
//   cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-belegung.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { ladeBelegung, pruefeBelegung } = await import('@/lib/termine/engine')
const { getCachedBusyWindows } = await import('@/lib/kalender/cache-busy')
const db = createAdminClient()

const WIDE_FROM = '2000-01-01T00:00:00Z'
const WIDE_TO = '2999-01-01T00:00:00Z'

// Einen SV mit Cache-Zeilen (externe Belegung) wählen.
const { data: cacheRow } = await db
  .from('sv_kalender_events_cache')
  .select('sv_id')
  .limit(1)
  .maybeSingle()
const svId = (cacheRow?.sv_id as string | undefined) ?? ''
const assignee = { typ: 'sachverstaendiger' as const, id: svId }

const fenster = svId ? await ladeBelegung(assignee, WIDE_FROM, WIDE_TO, db) : []
const externFenster = fenster.filter((f) => f.belegungTyp === 'extern')
const cache = svId ? await getCachedBusyWindows(svId, WIDE_FROM, WIDE_TO) : []

// pruefeBelegung: 'belegt' auf einem realen Fenster, 'frei' auf einem Leerfenster.
const belegtCheck = fenster.length
  ? await pruefeBelegung(assignee, fenster[0].start, fenster[0].end, db)
  : 'n/a'
const freiCheck = await pruefeBelegung(assignee, '2099-01-01T00:00:00Z', '2099-01-01T01:00:00Z', db)

const res = {
  svId,
  engine_total: fenster.length,
  engine_extern: externFenster.length,
  engine_buchung: fenster.length - externFenster.length,
  cache_rows: cache.length,
  extern_deckt_cache: externFenster.length === cache.length,
  pruefe_belegt_auf_fenster: belegtCheck,
  pruefe_frei_auf_leerfenster: freiCheck,
  VERDICT:
    !!svId &&
    externFenster.length === cache.length &&
    (fenster.length === 0 || belegtCheck === 'belegt') &&
    freiCheck === 'frei'
      ? 'GRUEN'
      : 'FEHLER',
}
console.log(JSON.stringify(res, null, 2))
```

- [ ] **Step 3: GREEN — Script ausführen + Cleanup**

```bash
# im Worktree
cp "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" .env.local
npx tsx scripts/verify-engine-belegung.mts   # erwartet VERDICT: "GRUEN"
rm -f .env.local                             # .env.local NICHT committen
```
Expected: JSON mit `extern_deckt_cache: true`, `pruefe_frei_auf_leerfenster: "frei"`, `VERDICT: "GRUEN"`. (`engine_buchung` ≥ 0 — aktive Buchungen erscheinen zusätzlich zu den externen.)

> **[[Smoke = immer Screenshot + Analyse]]** gilt für UI; hier ist der JSON-`VERDICT` der Beweis — im selben Turn auswerten, nicht nur ausgeben.
> Auf `</content>`-Artefakt im neuen `.mts` scannen.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-engine-belegung.mts
git commit  # 7-Punkt-Audit im Body
```

---

## Task 4: Build-Gate + PR

**Files:** keine neuen.

- [ ] **Step 1: Voller Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (kein Consumer außerhalb der Engine + Verify-Script referenziert die neue Lib → keine Fremd-Brüche).

> `npm run build` (next build) OOMt im Worktree ([[Worktree-Build-Gate]]); `tsc --noEmit` ist das Gate. P2.1a berührt **keine** Route/Layout/Server-Action → tsc genügt (kein Next-Validator-Risiko).

- [ ] **Step 2: Dead-Code-/Token-Gates (lokal, non-blocking) sichten**

```bash
npm run check:knip          # neue Engine-Files: index.ts re-exportiert -> nicht "unused file"
npm run check:component-set  # n/a (keine UI)
```
Expected: keine NEUEN Verstöße gegen die Baselines (lokal `--warn`, exit 0).

- [ ] **Step 3: Fetch + Push + PR gegen `staging`**

```bash
git fetch origin
git push -u origin kitta/unisone-termin-engine
gh pr create --base staging \
  --title "feat(termin-engine): P2.1a — Belegung-Read-Core (pruefeBelegung/ladeBelegung über v_belegung)" \
  --body "<Beschreibung + 7-Punkt-Audit + Verify-VERDICT GRUEN>"
```

> Falls bereits ein offener PR für `kitta/unisone-termin-engine` existiert (Phase 1 war PR #2180, gemergt): neuer PR ist korrekt, da P2.1a neue Commits auf demselben Branch nach dem Merge sind. Branch-Stand vor Push prüfen (`git log origin/staging..HEAD --oneline`).

- [ ] **Step 4: Post-Merge-Smoke (staging)**

P2.1a ist verhaltensneutral (kein Consumer-Repoint) → **kein** Portal-Regressions-Risiko. Nach Merge: `verify-engine-belegung.mts` einmal gegen staging laufen lassen (`VERDICT: GRUEN`) als Landungs-Beweis. Voller Portal-Smoke erst bei P3 (Consumer-Repoint).

---

## Self-Review (durchgeführt 01.06.)

**1. Spec-Coverage:** Spec §5 `pruefeBelegung` ✓ (Task 2), `freieSlots` **bewusst → P2.1b** (Abweichung dokumentiert). Spec §4c „v_belegung = EINE Lese-Quelle" ✓ (Engine liest ausschließlich v_belegung). Handoff-P2.1 „konsolidiert verstreute Read-Logik" — P2.1a legt die Read-Primitive (`ladeBelegung`/`pruefeBelegung`) an, die `freieSlots` (P2.1b) + Phase-3-Consumer nutzen; der eigentliche Consumer-Repoint bleibt Phase 3 (Spec §8, kein Doppelzähl-Risiko in P2.1a, da nichts umgehängt wird).

**2. Placeholder-Scan:** keine TBD/TODO; alle Files mit vollständigem Code, alle Verify-Steps mit konkretem Befehl + Erwartung.

**3. Typ-Konsistenz:** `Assignee`/`AssigneeTyp`/`BelegungsFenster`/`VBelegungRow` in `types.ts` definiert, in `belegung.ts` + `index.ts` + Test identisch referenziert. Funktionsnamen `rowToFenster`/`ladeBelegung`/`pruefeBelegung` über Mapper, DB-Reader, Barrel, Verify-Script und Test durchgängig gleich. `getCachedBusyWindows(svId, fromIso, toIso)`-Signatur == Live-Inventar (`@/lib/kalender/cache-busy`). Overlap-Semantik (`start < bis AND end > von`) == getCachedBusyWindows == v_belegung-aktiv-Set.

**Offene Flags (nicht P2.1a-blockierend, für Folge-Phasen notiert):**
- **P2.3 (Writes):** `reserviereSlot` setzt laut Inventar `typ:'vor_ort'`, aber der Live-`typ`-CHECK erlaubt nur `sv_begutachtung/kb_beratung/konfrontation` (Live-Daten: nur `sv_begutachtung`). Beim Bau der Writes verifizieren, ob das ein Bug/Legacy-Wert/anderes Feld ist.
- **P2.3 (Writes) — fail-closed Pflicht:** `ladeBelegung`/`pruefeBelegung` sind fail-open (DB-Fehler → `[]` → `'frei'`), wie die Legacy-Reader — in P2.1a unkritisch (0 Consumer, empirisch bestätigt). Bevor `reserviere`/`bestaetige` `pruefeBelegung` als Buchungs-Gate nutzen, MUSS eine fail-closed Variante (Result-Object) her, sonst Doppelbuchungs-Vektor. JSDoc-Warnung steht an `pruefeBelegung`. (Code-Quality-Review opus, 01.06.)
- **Typ-Regen:** Voller `generate_typescript_types`-Regen aufgeschoben (lokaler Cast in P2.1a) → spätestens wenn breitere Consumer (P3) die generierten v_belegung-Typen brauchen, isoliert nachziehen.

---

**Review-Befunde adressiert (01.06., 2-stufig):** Stufe 1 Spec-Compliance = SPEC-COMPLIANT (genau 5 Files, half-offen-Overlap, `pruefeBelegung` abgeleitet). Stufe 2 adversarialer Code-Quality (opus): 0 CRITICAL; 3 IMPORTANT gefixt (Commit „Review-Haertung"): **I-1** Null-Bounds-Guard (v_belegung = UNION-ALL → katalog-nullable; `ladeBelegung` verwirft null-Grenzen vor dem Mapping, spiegelt `cache-busy.ts`), **I-2** Verify tuple-genau (statt nur Count) + buchung-Pfad end-to-end + SKIPPED-Branch, **I-3** fail-open JSDoc + P2.3-Prerequisite (s. Offene Flags). Minor (pruefeBelegung `select *` statt count) bewusst belassen — „aus ladeBelegung abgeleitet" = beweisbare Konsistenz > Micro-Effizienz bei aktuellem Volumen.

## Roadmap — Folge-Pläne (je eigener Spec→Plan→Build-Zyklus nach Landung des Vorgängers)

- **P2.1b — `freieSlots` + `verfuegbarkeits_ausnahmen`:** additive Tabelle `verfuegbarkeits_ausnahmen` (`assignee_typ, assignee_id, von, bis, typ urlaub|krank|sperre, grund`, RLS, Assignee-Integritäts-Guard analog Phase-1-Trigger). `freieSlots(assignee, fenster, opts)` baut auf `ladeBelegung`, konsolidiert `ladeFreieSlots` (SV-Arbeitszeiten `sachverstaendige.arbeitszeiten`/`blockierte_wochentage`) + `getAvailableKbSlots` (`profiles.working_hours`), Reachability/ETA `precomputeSvSlotEtas`/`isSlotReachable` first-class, Rückgabe `TagVerfuegbarkeit[]`.
- **P2.2 — Schema-Adds + Exclusion-Generalisierung:** `quelle`/`bezug_typ`/`bezug_id`/`reserviert_bis` additiv; **Exclusion-Constraint** `gutachter_termine_no_sv_overlap` von `sv_id` auf `(assignee_typ, assignee_id)` generalisieren (DROP→ADD, btree_gist im `extensions`-Schema qualifizieren; Vorab-Check: 0 aktive Zeilen ohne assignee_id — 01.06. erfüllt). **Riskanteste DDL → voller Koordinations-Dance + Live-Recheck.**
- **P2.3 — Writes (State-Machine) + Geocoding-Garantie:** `reserviere`/`bestaetige`/`sageAb`/`verlege`; `bestaetige` resolved + geocodet das Vor-Ort-Ziel (Mapbox/Google) und lehnt Vor-Ort ohne geocodebares Ziel ab. Reservierungs-TTL-Cleanup zentral. CMM-73-Daten-Fix (`auftraege`-erstgutachten). **Voraussetzung (Review-Flag):** `pruefeBelegung` fail-closed (Result-Object) machen, bevor es ein Buchungs-Gate wird.
- **P2.4 — `findeBestePerson` + Org-Dedup** (`organisationen` gewinnt).
- **P2.5 — `syncTerminToExternalCalendar`** (Google + CalDAV).
