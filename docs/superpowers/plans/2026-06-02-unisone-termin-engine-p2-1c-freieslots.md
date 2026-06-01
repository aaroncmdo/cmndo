# Unisone Termin-Engine — Phase 2.1c (freieSlots) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die assignee-generische `freieSlots(assignee, fenster, opts)` in `lib/termine/engine` bauen — Arbeitszeiten (je Assignee-Typ) **minus** `ladeBelegung` (v_belegung: Buchungen ∪ extern ∪ ausnahme, P2.1a/b) **minus** optionale Reachability/ETA. Konsolidiert `ladeFreieSlots` (SV) + `getAvailableKbSlots` (KB) zu **einer** Slot-Engine.

**Architecture:** Reine **Code-only**-Schicht, **0 DDL**. Baut auf `ladeBelegung` (P2.1a, gemergt) + dem `ausnahme`-Branch (P2.1b). Der Belegungs-Kern kommt aus `v_belegung`; die **Arbeitszeiten-Auflösung** ist per Assignee-Typ unterschiedlich (SV: `sachverstaendige.arbeitszeiten`/`blockierte_wochentage`; KB: `profiles.working_hours`). Die reine Slot-Mathematik (`slotsFuerTag`) ist DB-frei unit-testbar; Reachability (`precomputeSvSlotEtas`/`isSlotReachable`, vorhanden) ist integrations-verifiziert. **Kein Consumer-Repoint** (das ist Phase 3) → die alten Generatoren laufen unverändert weiter.

**Tech Stack:** TypeScript/Next.js 16, Supabase (`v_belegung` via `createAdminClient`), Vitest (pure Slot-Mathematik), tsx-Verify (Muster `verify-engine-belegung.mts`).

---

## ⚠️ Koordination
- **0 DDL** → kein Schema-Touch, keine Migration, kein DDL-Koordinations-Dance. Branch frisch `kitta/unisone-termin-engine-p2-1c` aus `origin/staging` (nach #2209-Merge, damit der `ausnahme`-Branch + `ladeBelegung` drin sind). Branch-Lesson (P2.1a): pro Sub-Phase frisch aus staging.
- **Regel 1:** PR gegen `staging`. **Regel 3:** kein unbegleiteter Stash. 7-Punkte-Audit je Commit. **[[Write-Tool </content>-Artefakt]]** nach jedem Write scannen.

---

## Grounding (gelesen 02.06.)
- `ladeFreieSlots` (`src/lib/onboarding/slots.ts`): SV-Arbeitszeiten `{tag:{von,bis}}` + `blockierte_wochentage` (ISO 1–7), `SLOT_DAUER=TERMIN_DAUER_MIN` (45), Puffer `TERMIN_PUFFER_MIN` beidseitig (`istPeriodBelegt`), optional Reachability via `precomputeSvSlotEtas`/`isSlotReachable` wenn `schadenort` gesetzt. Tages-Loop → `TagVerfuegbarkeit[]`.
- `getAvailableKbSlots` (`src/lib/termine/kb-slots.ts`): KB-`working_hours` `{day:[from,to]}`, `KB_BERATUNG_DURATION_MIN` (30), `KB_BERATUNG_VORLAUF_H` (2), `KB_BERATUNG_REICHWEITE_TAGE` (14), **keine** Reachability. Flache `{datum,uhrzeit}[]`.
- **v_belegung deckt** Buchungen (`gutachter_termine` aktiv) ∪ extern ∪ **ausnahme** ab → `ladeBelegung` ist der Belegungs-Kern. **Nicht** abgedeckt: GFA-`pre_flowlink_reserviert`-Holds (SV Tier-3) + `admin_termine` (KB) → s. „Bewusst verschoben".
- `precomputeSvSlotEtas(db, svId, {lat,lng}, fromIso, toIso)` + `isSlotReachable(slotStart: Date, slotEnd: Date, ctx)` sind vorhanden + assignee-agnostisch genug (lesen `gutachter_termine`-Adjazenz).

---

## Abweichung / Scope (dokumentiert)
1. **freieSlots liest den Belegungs-Kern aus `ladeBelegung` (v_belegung)** — nicht direkt `gutachter_termine`+`getSvBusySlots`. Damit kommen Buchungen ∪ extern ∪ ausnahme aus EINER Quelle (Konsolidierungs-Gewinn).
2. **Nicht-v_belegung-Quellen (GFA-Holds, `admin_termine`) sind in P2.1c NICHT subtrahiert.** Grund: sie sind consumer-spezifisch (GFA = Self-Service-Wizard-Artefakt → wird in P2.3 durch die Engine-Reservierungs-TTL ersetzt; `admin_termine` = KB-interne Tasks → in Phase 3 entweder in v_belegung gefaltet oder vom Caller via `opts.zusaetzlicheBelegung` injiziert). `freieSlots` bietet dafür einen **optionalen `zusaetzlicheBelegung`-Hook** an, ohne die Engine an diese Tabellen zu koppeln. Wie P2.1a den Consumer-Repoint deferte → Phase 3.
3. **sachverstaendiger + kundenbetreuer** werden implementiert (klare Arbeitszeiten-Quelle). **sv_lead/kanzlei** werfen einen klaren Fehler (deferred — keine saubere Arbeitszeiten-Quelle; YAGNI bis Consumer).

---

## File Structure
| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/lib/termine/engine/types.ts` | + `TagSlot`, `TagVerfuegbarkeit`, `FreieSlotsOpts` (engine-eigen) | Modify |
| `src/lib/termine/engine/slots.ts` | reine Helfer (`zeitZuMin`/`minZuZeit`/`slotsFuerTag`) + `arbeitszeitenFuerAssignee` (DB, per Typ) + `freieSlots` (Orchestrierung) | Create |
| `src/lib/termine/engine/slots.test.ts` | Vitest für `slotsFuerTag` (pure: Arbeitszeit − Belegung − Puffer) | Create |
| `src/lib/termine/engine/index.ts` | `freieSlots` + Slot-Typen re-exportieren | Modify |
| `scripts/verify-engine-slots.mts` | Live-Verify: freieSlots(SV) plausibel + Ausnahme-Injektion entfernt Slots im Fenster | Create |

---

## Task 1: Engine-Slot-Typen
**Files:** Modify `src/lib/termine/engine/types.ts`

- [ ] **Step 1:** Anhängen:
```typescript
/** Ein freier Slot (engine-eigen; spiegelt onboarding/slots.ts, aber Engine-besessen). */
export interface TagSlot {
  uhrzeit: string // 'HH:MM' (Berlin)
  dauer: number // Minuten
}

/** Tages-Verfügbarkeit eines Assignees (Rückgabe von freieSlots). */
export interface TagVerfuegbarkeit {
  datum: string // 'YYYY-MM-DD'
  wochentag: string // 'Mo' | 'Di' | …
  frei: boolean
  anzahl_slots: number
  slots: TagSlot[]
}

/** Optionen für freieSlots. */
export interface FreieSlotsOpts {
  /** Schadenort für ETA-Reachability (nur sachverstaendiger). Ohne → kein Reachability-Filter. */
  schadenort?: { lat: number; lng: number } | null
  /** Zusätzliche Belegungs-Fenster, die (noch) nicht in v_belegung stehen (z.B. admin_termine,
   *  GFA-Holds) — vom Caller injizierbar bis Phase 3 sie in v_belegung faltet. */
  zusaetzlicheBelegung?: { start: string; end: string }[]
}
```

- [ ] **Step 2:** Commit (7-Punkt-Audit; tsc folgt Task 2).

---

## Task 2: Reine Slot-Mathematik `slotsFuerTag` (TDD)
**Files:** Create `src/lib/termine/engine/slots.ts`, `src/lib/termine/engine/slots.test.ts`

- [ ] **Step 1: Failing-Test** (`slots.test.ts`) — `slotsFuerTag(arbeitszeit, belegung, slotDauerMin, pufferMin)` erzeugt Slots, lässt belegte (inkl. Puffer) aus:
```typescript
import { describe, it, expect } from 'vitest'
import { slotsFuerTag } from './slots'

describe('slotsFuerTag', () => {
  const tag = new Date('2026-07-06T00:00:00Z') // Mo
  it('erzeugt 45-Min-Slots in 09:00–11:00 (0 Puffer, keine Belegung)', () => {
    const slots = slotsFuerTag(tag, { vonMin: 540, bisMin: 660 }, [], 45, 0)
    expect(slots.map((s) => s.uhrzeit)).toEqual(['09:00', '09:45'])
  })
  it('lässt einen belegten Slot aus (mit Puffer)', () => {
    const belegt = [{ von: new Date('2026-07-06T09:45:00'), bis: new Date('2026-07-06T10:30:00') }]
    const slots = slotsFuerTag(tag, { vonMin: 540, bisMin: 720 }, belegt, 45, 15)
    // 09:00 frei; 09:45 belegt; 10:30/11:15 evtl. durch Puffer beeinflusst
    expect(slots.some((s) => s.uhrzeit === '09:45')).toBe(false)
    expect(slots.some((s) => s.uhrzeit === '09:00')).toBe(true)
  })
})
```

- [ ] **Step 2: RED** — `npm test -- src/lib/termine/engine/slots.test.ts` → FAIL (slotsFuerTag fehlt).

- [ ] **Step 3: Implementieren** (`slots.ts`) — reine Helfer (aus `onboarding/slots.ts` übernommen, engine-eigen):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, TagSlot, TagVerfuegbarkeit, FreieSlotsOpts } from './types'
import { ladeBelegung } from './belegung'

const WOCHENTAG_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
type BelegtPeriod = { von: Date; bis: Date }

export function zeitZuMin(z: string): number {
  const [h, m] = z.split(':').map(Number)
  return h * 60 + (m ?? 0)
}
export function minZuZeit(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Reine Slot-Generierung für einen Tag: Arbeitszeit − belegte Perioden (inkl. Puffer). */
export function slotsFuerTag(
  tag: Date,
  arbeitszeit: { vonMin: number; bisMin: number },
  belegt: BelegtPeriod[],
  slotDauerMin: number,
  pufferMin: number,
): TagSlot[] {
  const out: TagSlot[] = []
  for (let s = arbeitszeit.vonMin; s + slotDauerMin <= arbeitszeit.bisMin; s += slotDauerMin) {
    const von = new Date(tag)
    von.setHours(Math.floor(s / 60), s % 60, 0, 0)
    const bis = new Date(von.getTime() + slotDauerMin * 60_000)
    const vonP = new Date(von.getTime() - pufferMin * 60_000)
    const bisP = new Date(bis.getTime() + pufferMin * 60_000)
    const kollidiert = belegt.some((p) => p.von < bisP && p.bis > vonP)
    if (!kollidiert) out.push({ uhrzeit: minZuZeit(s), dauer: slotDauerMin })
  }
  return out
}
```

- [ ] **Step 4: GREEN** — `npm test -- src/lib/termine/engine/slots.test.ts` → PASS. (tsc nach Task 3.)

- [ ] **Step 5: Commit.**

---

## Task 3: Arbeitszeiten-Resolver + `freieSlots`-Orchestrierung
**Files:** Modify `src/lib/termine/engine/slots.ts`, `src/lib/termine/engine/index.ts`

- [ ] **Step 1:** In `slots.ts` ergänzen — Arbeitszeiten je Assignee-Typ + Default-Dauer/Puffer + Orchestrierung:
```typescript
type TagArbeitszeit = { vonMin: number; bisMin: number } | null
type AssigneeKalenderKonfig = {
  proWochentag: (dowJs: number) => TagArbeitszeit // dowJs 0=So..6=Sa
  slotDauerMin: number
  pufferMin: number
  reachability: boolean
}

const SV_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']

async function konfigFuerAssignee(
  db: SupabaseClient,
  assignee: Assignee,
): Promise<AssigneeKalenderKonfig & { profileId: string | null }> {
  if (assignee.typ === 'sachverstaendiger') {
    const { data } = await db
      .from('sachverstaendige')
      .select('arbeitszeiten, blockierte_wochentage, profile_id')
      .eq('id', assignee.id)
      .maybeSingle()
    const az = (data?.arbeitszeiten as Record<string, { von: string; bis: string } | undefined> | null) ?? {}
    const blocked = (data?.blockierte_wochentage as number[] | null) ?? []
    return {
      slotDauerMin: 45, pufferMin: 15, reachability: true,
      profileId: (data?.profile_id as string | null) ?? null,
      proWochentag: (dowJs) => {
        const dowIso = dowJs === 0 ? 7 : dowJs
        if (blocked.includes(dowIso)) return null
        const t = az[SV_KEYS[dowJs]]
        return t ? { vonMin: zeitZuMin(t.von), bisMin: zeitZuMin(t.bis) } : null
      },
    }
  }
  if (assignee.typ === 'kundenbetreuer') {
    const { data } = await db.from('profiles').select('working_hours').eq('id', assignee.id).maybeSingle()
    const wh = (data?.working_hours as Record<string, [string, string] | null | undefined> | null) ?? {}
    return {
      slotDauerMin: 30, pufferMin: 0, reachability: false, profileId: assignee.id,
      proWochentag: (dowJs) => {
        const t = wh[SV_KEYS[dowJs]]
        return Array.isArray(t) && t.length >= 2 ? { vonMin: zeitZuMin(t[0]), bisMin: zeitZuMin(t[1]) } : null
      },
    }
  }
  throw new Error(`freieSlots: assignee_typ '${assignee.typ}' noch nicht unterstützt (P2.1c: nur sachverstaendiger/kundenbetreuer)`)
}

/**
 * Freie Slots eines Assignees im Fenster [vonIso, bisIso]. Arbeitszeit (je Typ) MINUS
 * ladeBelegung (v_belegung: Buchung ∪ extern ∪ ausnahme) MINUS opts.zusaetzlicheBelegung
 * MINUS (nur sachverstaendiger) Reachability. Liest v_belegung via service_role.
 */
export async function freieSlots(
  assignee: Assignee,
  vonIso: string,
  bisIso: string,
  opts: FreieSlotsOpts = {},
  db?: SupabaseClient,
): Promise<TagVerfuegbarkeit[]> {
  const client: SupabaseClient = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const konfig = await konfigFuerAssignee(client, assignee)

  const belegung = await ladeBelegung(assignee, vonIso, bisIso, client)
  const belegt: BelegtPeriod[] = [
    ...belegung.map((f) => ({ von: new Date(f.start), bis: new Date(f.end) })),
    ...(opts.zusaetzlicheBelegung ?? []).map((b) => ({ von: new Date(b.start), bis: new Date(b.end) })),
  ]

  // Reachability nur für sachverstaendiger + wenn schadenort gesetzt.
  let etaCtx: Awaited<ReturnType<typeof import('@/lib/dispatch/reachability').precomputeSvSlotEtas>> | null = null
  if (konfig.reachability && opts.schadenort?.lat != null && opts.schadenort?.lng != null) {
    try {
      const { precomputeSvSlotEtas } = await import('@/lib/dispatch/reachability')
      etaCtx = await precomputeSvSlotEtas(client, assignee.id, { lat: opts.schadenort.lat, lng: opts.schadenort.lng }, vonIso, bisIso)
    } catch {
      /* Mapbox nicht verfügbar → ohne Reachability */
    }
  }

  const result: TagVerfuegbarkeit[] = []
  const cur = new Date(vonIso); cur.setHours(0, 0, 0, 0)
  const ende = new Date(bisIso)
  while (cur <= ende) {
    const dowJs = cur.getDay()
    const az = konfig.proWochentag(dowJs)
    let slots: TagSlot[] = az ? slotsFuerTag(cur, az, belegt, konfig.slotDauerMin, konfig.pufferMin) : []
    if (slots.length && etaCtx) {
      const { isSlotReachable } = await import('@/lib/dispatch/reachability')
      slots = slots.filter((s) => {
        const sv = new Date(cur); const [h, m] = s.uhrzeit.split(':').map(Number); sv.setHours(h, m, 0, 0)
        return isSlotReachable(sv, new Date(sv.getTime() + s.dauer * 60_000), etaCtx!).reachable
      })
    }
    result.push({ datum: cur.toISOString().split('T')[0], wochentag: WOCHENTAG_LABELS[dowJs], frei: slots.length > 0, anzahl_slots: slots.length, slots })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}
```

- [ ] **Step 2:** `index.ts` ergänzen:
```typescript
export type { TagSlot, TagVerfuegbarkeit, FreieSlotsOpts } from './types'
export { freieSlots, slotsFuerTag, zeitZuMin, minZuZeit } from './slots'
```

- [ ] **Step 3: GREEN + tsc** — `npm test` (slotsFuerTag weiterhin grün) + `npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit.**

---

## Task 4: Live-Verify (Controller)
**Files:** Create `scripts/verify-engine-slots.mts`

- [ ] **Step 1:** Script (Muster `verify-engine-ausnahmen.mts`): wählt einen realen SV; ruft `freieSlots({typ:'sachverstaendiger',id},von,bis)` → erwartet ≥1 freien Tag in 30 Tagen; injiziert dann eine **ganztägige Ausnahme** an einem freien Tag → erwartet, dass dieser Tag danach **0 Slots** hat (beweist v_belegung-Integration end-to-end); Cleanup (try/finally). VERDICT GRUEN/FEHLER.

- [ ] **Step 2:** Ausführen (Controller, env-copy → tsx → cleanup) → `VERDICT: GRUEN`. `</content>`-Scan.

- [ ] **Step 3: Commit.**

---

## Task 5: Build-Gate + PR
- [ ] `npx tsc --noEmit` grün; `npm test` grün; knip lokal sichten (index.ts an Vitest-Entry → kein unused).
- [ ] Push `kitta/unisone-termin-engine-p2-1c`; `gh pr create --base staging` (Body: Audit + Verify-VERDICT + „konsolidiert ladeFreieSlots/getAvailableKbSlots, Consumer-Repoint = Phase 3").
- [ ] Post-Merge: Verify gegen staging.

---

## Self-Review
**Spec-Coverage:** Spec §5 `freieSlots` ✓ (Task 3); §6b Reachability first-class ✓; §6c Arbeitszeiten + Ausnahmen (via ladeBelegung) ✓. **Bewusst verschoben:** GFA-Holds/admin_termine-Subtraktion (Phase-3-Repoint, via `zusaetzlicheBelegung`-Hook), sv_lead/kanzlei-Arbeitszeiten (YAGNI), Slot-Caller-Repoint (Phase 3).
**Placeholder-Scan:** keine TBD; vollständiger Code + Verify.
**Typ-Konsistenz:** `slotsFuerTag`/`freieSlots`/`TagVerfuegbarkeit` durchgängig; `ladeBelegung`-Signatur == P2.1a; Reachability-Helfer-Signaturen == `dispatch/reachability`.

## Roadmap
- **P2.2** (Schema-Adds + Exclusion-Constraint-Generalisierung, riskanteste DDL), **P2.3** (Writes + Geocoding-Garantie + fail-closed pruefeBelegung + CMM-73), **P2.4** (findeBestePerson + Org-Dedup), **P2.5** (syncTerminToExternalCalendar). **Phase 3** = Consumer-Repoint (ladeFreieSlots/getAvailableKbSlots → freieSlots; dabei GFA-Holds/admin_termine in v_belegung falten oder via opts injizieren; sv_id/lead_id-Kompat droppen).
