# Anspruch-Totalschaden (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Anspruch-Foto-Tool erkennt den wirtschaftlichen Totalschaden (Reparatur > 90 % WBW) und zeigt beide Wege transparent, statt nur Reparaturkosten.

**Architecture:** Vision liefert zusätzlich WBW + Restwert; eine pure Plausibilisierung (`wbw.ts`) gleicht sie gegen eine Heuristik-Tabelle ab; `berechneAnspruchsSpanne` schaltet nach Reparatur/WBW-Verhältnis in 3 Zonen; der Renderer zeigt im Totalschaden-Fall beide Wege. Zone A (Normalfall) bleibt exakt wie heute.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest, Supabase (DB-Config via Plugin-Migration).

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/anspruch-totalschaden`, PR gegen `staging`, kein Direct-Push main.
- **Regel 2:** DDL NUR via `mcp__plugin_supabase_supabase__apply_migration` → `list_migrations` → File==Version. `execute_sql` nur READ.
- **Zone A = keine Regression:** Ist `reparaturMitte < 0.9 × wbwMitte` (oder kein WBW vorhanden), MUSS `berechneAnspruchsSpanne` exakt das heutige Ergebnis liefern (kein `totalschaden`-Block).
- **UI-Umlaute** Pflicht in Frontend-Strings (ä/ö/ü/ß).
- **Schwellen:** Totalschaden ab **90 %** WBW, 130 %-Reparaturgrenze — als DB-Config (`totalschaden_schwelle_prozent`, `reparatur_grenze_prozent`), nicht hardcoded.
- **Phase-1-Scope:** WBW/Restwert + Plausibilisierung + Zonen-Logik + Darstellung + Wertminderung im Reparatur-Weg. **Nicht** in Phase 1: Anwaltskosten/Mietwagen/An-Abmeldung/Verbringung, Prompt-Kalibrierung (= Phase 2).
- Server-Actions: Result-Object `{ ok }` (kein throw). Commits mit 7-Punkt-Audit + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: DB-Migration (WBW-Config + Heuristik-Tabelle)

**Files:**
- Create: `supabase/migrations/<V>_anspruch_totalschaden_config.sql` (Name == getrackte Version aus `list_migrations`)

**Interfaces:**
- Produces: `anspruch_config`-Keys `totalschaden_schwelle_prozent`(90), `reparatur_grenze_prozent`(130), `wiederbeschaffungsdauer_min_tage`(10), `wiederbeschaffungsdauer_max_tage`(14); Tabelle `wbw_segment_alter(segment text, alter_bis_jahre int, wbw_min_eur numeric, wbw_max_eur numeric, restwert_faktor numeric, primary key(segment, alter_bis_jahre))` mit anon+authenticated SELECT-RLS (wie die bestehenden Rate-Tabellen).

- [ ] **Step 1: DDL via Plugin anwenden**

`apply_migration({ name: "anspruch_totalschaden_config", query: <DDL> })`. DDL (illustrative Bänder — vor Live fachlich prüfen):
```sql
create table if not exists public.wbw_segment_alter (
  segment text not null,
  alter_bis_jahre integer not null,
  wbw_min_eur numeric not null,
  wbw_max_eur numeric not null,
  restwert_faktor numeric not null,
  created_at timestamptz not null default now(),
  primary key (segment, alter_bis_jahre)
);
alter table public.wbw_segment_alter enable row level security;
grant select on public.wbw_segment_alter to anon, authenticated;
drop policy if exists wbwsa_read on public.wbw_segment_alter;
create policy wbwsa_read on public.wbw_segment_alter for select to anon, authenticated using (true);

insert into public.wbw_segment_alter (segment, alter_bis_jahre, wbw_min_eur, wbw_max_eur, restwert_faktor) values
  ('kleinwagen',3,9000,15000,0.30),('kleinwagen',8,4000,9000,0.25),('kleinwagen',99,1500,4000,0.20),
  ('kompakt',3,14000,22000,0.30),('kompakt',8,7000,14000,0.25),('kompakt',99,2500,7000,0.20),
  ('mittelklasse',3,20000,32000,0.30),('mittelklasse',8,10000,20000,0.25),('mittelklasse',99,3500,10000,0.20),
  ('oberklasse',3,35000,60000,0.32),('oberklasse',8,16000,35000,0.27),('oberklasse',99,6000,16000,0.22),
  ('suv',3,26000,45000,0.32),('suv',8,13000,26000,0.27),('suv',99,5000,13000,0.22),
  ('transporter',3,20000,35000,0.30),('transporter',8,9000,20000,0.25),('transporter',99,3000,9000,0.20)
on conflict do nothing;

insert into public.anspruch_config (key, wert) values
  ('totalschaden_schwelle_prozent',90),('reparatur_grenze_prozent',130),
  ('wiederbeschaffungsdauer_min_tage',10),('wiederbeschaffungsdauer_max_tage',14)
on conflict (key) do nothing;
```

- [ ] **Step 2: Version ablesen + File committen**

`list_migrations` → Version `<V>` ablesen. Migration-File exakt als `supabase/migrations/<V>_anspruch_totalschaden_config.sql` mit obigem DDL anlegen. `git add` + commit `feat(anspruch): DB-Config Totalschaden (WBW-Heuristik + Schwellen)`.

- [ ] **Step 3: READ-Verifikation**

`execute_sql`: `select count(*) from wbw_segment_alter;` (=18) und `select wert from anspruch_config where key='totalschaden_schwelle_prozent';` (=90). Expected: 18 und 90.

---

### Task 2: Types + Rates-Loader erweitern

**Files:**
- Modify: `src/lib/anspruch/types.ts`
- Modify: `src/lib/anspruch/rates.ts`
- Test: `src/lib/anspruch/rates.test.ts` (falls existiert, sonst skip-Hinweis)

**Interfaces:**
- Consumes: DB aus Task 1.
- Produces: erweiterte Types (unten) + `ladeAnspruchRates()` liefert zusätzlich `wbwHeuristik: WbwHeuristikBand[]` und `config` enthält `totalschadenSchwelleProzent`, `reparaturGrenzeProzent`, `wiederbeschaffungsdauerTage:{min,max}`.

- [ ] **Step 1: `types.ts` erweitern**

`VisionResult` um optionale Felder ergänzen (Vision liefert sie ab Task 5; alt-Sessions haben sie nicht → optional):
```ts
export type VisionResult = {
  beschaedigte_teile: string[]
  schweregrad: Schweregrad
  segment: Segment
  geschaetzte_kosten_min: number
  geschaetzte_kosten_max: number
  wiederbeschaffungswert_min?: number | null
  wiederbeschaffungswert_max?: number | null
  restwert_min?: number | null
  restwert_max?: number | null
  beschreibung: string
}
```
`SchaetzInput` um WBW ergänzen:
```ts
export type SchaetzInput = {
  reparaturMinEur: number
  reparaturMaxEur: number
  schweregrad: Schweregrad
  segment: Segment
  fahrbereit: boolean
  ezJahr: number | null
  aktuellesJahr: number
  wbwMinEur: number | null
  wbwMaxEur: number | null
  restwertMinEur: number | null
  restwertMaxEur: number | null
}
```
Neue Types:
```ts
export type WbwHeuristikBand = { segment: Segment; alterBisJahre: number; wbwMinEur: number; wbwMaxEur: number; restwertFaktor: number }

export type AnspruchWeg = { titel: string; positionen: AnspruchPosition[]; summeMinEur: number; summeMaxEur: number }
export type TotalschadenInfo = {
  wbwMinEur: number; wbwMaxEur: number; restwertMinEur: number; restwertMaxEur: number
  reparaturWeg: AnspruchWeg | null   // null ab Zone C (>130%)
  totalschadenWeg: AnspruchWeg
  reparaturBis130Moeglich: boolean
  guenstiger: 'reparatur' | 'totalschaden'
}
```
`AnspruchSpanne` um `totalschaden?: TotalschadenInfo` erweitern.
`AnspruchConfig` um `totalschadenSchwelleProzent: number; reparaturGrenzeProzent: number; wiederbeschaffungsdauerTage: { min: number; max: number }`.

- [ ] **Step 2: `rates.ts` — WBW-Heuristik + neue Config laden**

`ladeAnspruchRates()` zusätzlich `wbw_segment_alter` selecten → `WbwHeuristikBand[]` (Feldnamen mappen: `wbw_min_eur`→`wbwMinEur` etc.), und die 4 neuen `anspruch_config`-Keys in `config` mappen (`totalschaden_schwelle_prozent`→`totalschadenSchwelleProzent`/100 als Faktor 0.9, `reparatur_grenze_prozent`→1.3, `wiederbeschaffungsdauer_min/max_tage`→`{min,max}`). Rückgabe-Objekt um `wbwHeuristik` ergänzen. Exakte Query-/Map-Struktur an das bestehende `rates.ts`-Muster anlehnen (erst Datei lesen).

- [ ] **Step 3: Typecheck**

Run (worktree root): `npx tsc --noEmit` → 0 Fehler (Consumer folgen in späteren Tasks; die optionalen Felder brechen nichts).

- [ ] **Step 4: Commit**

`git add src/lib/anspruch/types.ts src/lib/anspruch/rates.ts` + commit `feat(anspruch): Types + Rates-Loader um WBW/Totalschaden erweitern`.

---

### Task 3: `wbw.ts` — Plausibilisierung (pure, TDD)

**Files:**
- Create: `src/lib/anspruch/wbw.ts`
- Test: `src/lib/anspruch/wbw.test.ts`

**Interfaces:**
- Consumes: `WbwHeuristikBand`, `Segment` (Task 2).
- Produces: `plausibilisiereWbw(vision, segment, alterJahre, heuristik): WbwErgebnis`.

- [ ] **Step 1: Failing test** — `src/lib/anspruch/wbw.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { plausibilisiereWbw } from './wbw'
import type { WbwHeuristikBand } from './types'

const H: WbwHeuristikBand[] = [
  { segment: 'mittelklasse', alterBisJahre: 3, wbwMinEur: 20000, wbwMaxEur: 32000, restwertFaktor: 0.30 },
  { segment: 'mittelklasse', alterBisJahre: 99, wbwMinEur: 3500, wbwMaxEur: 10000, restwertFaktor: 0.20 },
]

describe('plausibilisiereWbw', () => {
  it('nutzt Vision-WBW wenn im Heuristik-Korridor', () => {
    const r = plausibilisiereWbw({ wiederbeschaffungswert_min: 24000, wiederbeschaffungswert_max: 28000, restwert_min: 6000, restwert_max: 8000 }, 'mittelklasse', 3, H)
    expect(r.wbwMin).toBe(24000); expect(r.wbwMax).toBe(28000); expect(r.quelle).toBe('vision')
  })
  it('klemmt Vision-Ausreisser auf den Korridor', () => {
    const r = plausibilisiereWbw({ wiederbeschaffungswert_min: 90000, wiederbeschaffungswert_max: 120000, restwert_min: null, restwert_max: null }, 'mittelklasse', 3, H)
    expect(r.wbwMax).toBeLessThanOrEqual(32000 * 1.6); expect(r.quelle).toBe('vision-geklemmt')
  })
  it('faellt auf Heuristik zurueck wenn Vision keinen WBW liefert', () => {
    const r = plausibilisiereWbw({ wiederbeschaffungswert_min: null, wiederbeschaffungswert_max: null, restwert_min: null, restwert_max: null }, 'mittelklasse', 3, H)
    expect(r.wbwMin).toBe(20000); expect(r.wbwMax).toBe(32000); expect(r.quelle).toBe('heuristik')
    // Restwert aus Faktor: 0.30 * wbw
    expect(r.restwertMin).toBe(6000); expect(r.restwertMax).toBe(9600)
  })
})
```

- [ ] **Step 2: Test rot** — `npx vitest run src/lib/anspruch/wbw.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung** — `src/lib/anspruch/wbw.ts`:
```ts
import type { Segment, WbwHeuristikBand } from './types'

export type WbwErgebnis = {
  wbwMin: number; wbwMax: number
  restwertMin: number; restwertMax: number
  quelle: 'vision' | 'vision-geklemmt' | 'heuristik'
}

type VisionWbw = {
  wiederbeschaffungswert_min?: number | null
  wiederbeschaffungswert_max?: number | null
  restwert_min?: number | null
  restwert_max?: number | null
}

const KORRIDOR_MIN = 0.6
const KORRIDOR_MAX = 1.6

function findeBand(segment: Segment, alter: number, heuristik: WbwHeuristikBand[]): WbwHeuristikBand | null {
  const kandidaten = heuristik.filter((b) => b.segment === segment).sort((a, b) => a.alterBisJahre - b.alterBisJahre)
  return kandidaten.find((b) => alter <= b.alterBisJahre) ?? kandidaten[kandidaten.length - 1] ?? null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function plausibilisiereWbw(
  vision: VisionWbw,
  segment: Segment,
  alterJahre: number | null,
  heuristik: WbwHeuristikBand[],
): WbwErgebnis {
  const band = findeBand(segment, alterJahre ?? 99, heuristik)
  const hMin = band?.wbwMinEur ?? 0
  const hMax = band?.wbwMaxEur ?? 0
  const rFaktor = band?.restwertFaktor ?? 0.25

  const vMin = vision.wiederbeschaffungswert_min
  const vMax = vision.wiederbeschaffungswert_max
  const hatVision = typeof vMin === 'number' && typeof vMax === 'number' && vMin > 0 && vMax > 0

  if (!hatVision || !band) {
    return {
      wbwMin: hMin, wbwMax: hMax,
      restwertMin: Math.round(hMin * rFaktor), restwertMax: Math.round(hMax * rFaktor),
      quelle: 'heuristik',
    }
  }

  const lo = hMin * KORRIDOR_MIN
  const hi = hMax * KORRIDOR_MAX
  const imKorridor = (vMin as number) >= lo && (vMax as number) <= hi
  const wbwMin = Math.round(clamp(vMin as number, lo, hi))
  const wbwMax = Math.round(clamp(vMax as number, lo, hi))

  const rMin = typeof vision.restwert_min === 'number' && vision.restwert_min > 0 ? vision.restwert_min : wbwMin * rFaktor
  const rMax = typeof vision.restwert_max === 'number' && vision.restwert_max > 0 ? vision.restwert_max : wbwMax * rFaktor

  return {
    wbwMin, wbwMax,
    restwertMin: Math.round(rMin), restwertMax: Math.round(rMax),
    quelle: imKorridor ? 'vision' : 'vision-geklemmt',
  }
}
```

- [ ] **Step 4: Test gruen** — `npx vitest run src/lib/anspruch/wbw.test.ts` → PASS (3).

- [ ] **Step 5: Commit** — `git add src/lib/anspruch/wbw.ts src/lib/anspruch/wbw.test.ts` + `feat(anspruch): plausibilisiereWbw (Vision + Heuristik, TDD)`.

---

### Task 4: `positionen.ts` — Totalschaden-Zonen (TDD)

**Files:**
- Modify: `src/lib/anspruch/positionen.ts`
- Test: `src/lib/anspruch/positionen.test.ts` (Totalschaden-Fälle ergänzen)

**Interfaces:**
- Consumes: `SchaetzInput` (mit WBW, Task 2), `AnspruchConfig` (mit Schwellen), `TotalschadenInfo`/`AnspruchWeg` (Task 2).
- Produces: `berechneAnspruchsSpanne` liefert bei Reparatur ≥ 90 % WBW zusätzlich `totalschaden: TotalschadenInfo`; Zone A unverändert.

- [ ] **Step 1: Failing tests** — in `positionen.test.ts` ergänzen:
```ts
// Zone A Regression: kein WBW -> kein totalschaden-Block, Ergebnis wie bisher
it('Zone A: ohne WBW kein Totalschaden-Block', () => {
  const s = berechneAnspruchsSpanne({ ...baseInput, wbwMinEur: null, wbwMaxEur: null, restwertMinEur: null, restwertMaxEur: null }, saetze, faktoren, config)
  expect(s.totalschaden).toBeUndefined()
})
// Zone C: Reparatur weit ueber WBW -> nur Totalschaden-Weg
it('Zone C: Reparatur > 130% WBW -> reparaturWeg null, guenstiger totalschaden', () => {
  const s = berechneAnspruchsSpanne({ ...baseInput, reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 }, saetze, faktoren, config)
  expect(s.totalschaden).toBeDefined()
  expect(s.totalschaden!.reparaturWeg).toBeNull()
  expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBeGreaterThan(0)
})
// Zone B: Grenzbereich -> beide Wege
it('Zone B: 90-130% WBW -> beide Wege, Wertminderung im Reparatur-Weg', () => {
  const s = berechneAnspruchsSpanne({ ...baseInput, reparaturMinEur: 20000, reparaturMaxEur: 26000, ezJahr: 2023, wbwMinEur: 22000, wbwMaxEur: 28000, restwertMinEur: 6000, restwertMaxEur: 8000 }, saetze, faktoren, config)
  expect(s.totalschaden!.reparaturWeg).not.toBeNull()
  expect(s.totalschaden!.reparaturWeg!.positionen.some((p) => p.typ === 'wertminderung')).toBe(true)
})
```
(`baseInput` = das bestehende Test-Fixture + die 4 WBW-Felder; falls das File noch keine WBW-Felder im Fixture hat, ergänzen.)

- [ ] **Step 2: Tests rot** — `npx vitest run src/lib/anspruch/positionen.test.ts` → FAIL.

- [ ] **Step 3: Implementierung** — in `berechneAnspruchsSpanne`, NACH dem bestehenden Aufbau von `positionen` (Zone-A-Liste) und VOR dem `return`, folgenden Block einfügen. Die bestehende Rückgabe `{ positionen, gesamtMinEur, gesamtMaxEur, hinweise }` bleibt; nur `totalschaden` wird konditional ergänzt:
```ts
  // --- Totalschaden-Zonen (nur wenn WBW vorhanden) ---
  let totalschaden: TotalschadenInfo | undefined
  const wbwMitte = input.wbwMinEur != null && input.wbwMaxEur != null ? (input.wbwMinEur + input.wbwMaxEur) / 2 : null
  if (wbwMitte != null && wbwMitte > 0) {
    const verhaeltnis = reparaturMitte / wbwMitte
    if (verhaeltnis >= config.totalschadenSchwelleProzent) {
      const restMin = input.restwertMinEur ?? 0
      const restMax = input.restwertMaxEur ?? 0
      const dauer = config.wiederbeschaffungsdauerTage
      const satz = saetze[input.segment]
      // Totalschaden-Weg: WBW - Restwert + Nutzungsausfall (Wiederbeschaffungsdauer) + Auslagenpauschale
      const tsPositionen: AnspruchPosition[] = [
        { typ: 'reparatur', label: 'Fahrzeugschaden (Wiederbeschaffung − Restwert)', minEur: runde(input.wbwMinEur! - restMax), maxEur: runde(input.wbwMaxEur! - restMin) },
        { typ: 'nutzungsausfall', label: 'Nutzungsausfall (Wiederbeschaffung)', minEur: runde(satz.tagessatzMinEur * dauer.min), maxEur: runde(satz.tagessatzMaxEur * dauer.max), hinweis: `${satz.tagessatzMinEur}–${satz.tagessatzMaxEur} €/Tag × ${dauer.min}–${dauer.max} Tage` },
        { typ: 'kostenpauschale', label: 'Auslagenpauschale', minEur: config.kostenpauschaleEur, maxEur: config.kostenpauschaleEur },
      ]
      const tsMin = runde(tsPositionen.reduce((s, p) => s + (p.minEur ?? 0), 0))
      const tsMax = runde(tsPositionen.reduce((s, p) => s + (p.maxEur ?? 0), 0))
      const totalschadenWeg: AnspruchWeg = { titel: 'Totalschaden abrechnen', positionen: tsPositionen, summeMinEur: tsMin, summeMaxEur: tsMax }

      // Reparatur-Weg nur bis 130% WBW (Zone B). Enthaelt die schon berechneten Zone-A-Positionen (inkl. Wertminderung).
      const bis130 = verhaeltnis <= config.reparaturGrenzeProzent
      const reparaturWeg: AnspruchWeg | null = bis130
        ? { titel: 'Reparieren & Fahrzeug behalten', positionen, summeMinEur: gesamtMinEur, summeMaxEur: gesamtMaxEur }
        : null

      const guenstiger: 'reparatur' | 'totalschaden' =
        reparaturWeg && reparaturWeg.summeMaxEur >= tsMax ? 'reparatur' : 'totalschaden'

      totalschaden = {
        wbwMinEur: input.wbwMinEur!, wbwMaxEur: input.wbwMaxEur!,
        restwertMinEur: restMin, restwertMaxEur: restMax,
        reparaturWeg, totalschadenWeg, reparaturBis130Moeglich: bis130, guenstiger,
      }
    }
  }

  return { positionen, gesamtMinEur, gesamtMaxEur, hinweise, ...(totalschaden ? { totalschaden } : {}) }
```
(Imports `AnspruchWeg`, `TotalschadenInfo` oben in `positionen.ts` ergänzen. `runde` existiert bereits.)

- [ ] **Step 4: Tests gruen** — `npx vitest run src/lib/anspruch/positionen.test.ts` → PASS (inkl. der bestehenden Zone-A-Tests = Regression).

- [ ] **Step 5: Commit** — `git add src/lib/anspruch/positionen.ts src/lib/anspruch/positionen.test.ts` + `feat(anspruch): Totalschaden-Zonen in berechneAnspruchsSpanne (TDD)`.

---

### Task 5: Vision-Prompt (WBW/Restwert) + berechneAnspruch verdrahten

**Files:**
- Modify: `src/app/embed/anspruch-pruefen/actions.ts`

**Interfaces:**
- Consumes: `plausibilisiereWbw` (Task 3), erweiterte `ladeAnspruchRates` (Task 2), erweiterter `SchaetzInput` (Task 2).

- [ ] **Step 1: `VISION_SYSTEM` um WBW/Restwert erweitern**

Im JSON-Schema-Prompt zwei Felder ergänzen: `"wiederbeschaffungswert_min": number, "wiederbeschaffungswert_max": number, "restwert_min": number, "restwert_max": number` und im Erläuterungssatz: *„`wiederbeschaffungswert` = geschätzter aktueller Marktwert des Fahrzeugs (Wiederbeschaffung) in €; `restwert` = geschätzter Wert des beschädigten Fahrzeugs. Beide als BRUTTO-Spanne."* Kalibrierungs-Wortlaut („sei konservativ") bleibt Phase-1-unverändert.

- [ ] **Step 2: `parseVision` — neue Felder tolerant übernehmen**

Nach den bestehenden Validierungen: die vier WBW/Restwert-Felder nur übernehmen wenn `typeof === 'number'`, sonst `null` setzen (nicht `return null` — sie sind optional; Heuristik fängt Fehlen ab).

- [ ] **Step 3: `berechneAnspruch` verdrahten**

`ladeAnspruchRates()` liefert jetzt `wbwHeuristik`. Vor `berechneAnspruchsSpanne`:
```ts
const alter = eingabe.ezJahr != null ? new Date().getFullYear() - eingabe.ezJahr : null
const wbw = plausibilisiereWbw(
  { wiederbeschaffungswert_min: vision.wiederbeschaffungswert_min, wiederbeschaffungswert_max: vision.wiederbeschaffungswert_max, restwert_min: vision.restwert_min, restwert_max: vision.restwert_max },
  eingabe.segment, alter, wbwHeuristik,
)
```
und die 4 WBW-Felder in den `SchaetzInput` geben (`wbwMinEur: wbw.wbwMin` etc.). Import `plausibilisiereWbw` ergänzen.

- [ ] **Step 4: Build (Route!)**

Run: `npm run build` (8 GB Heap) → grün. `analysiereSchaden`/`berechneAnspruch` sind Server-Actions in einer Route → voller Build Pflicht.

- [ ] **Step 5: Commit** — `git add src/app/embed/anspruch-pruefen/actions.ts` + `feat(anspruch): Vision schaetzt WBW/Restwert + berechneAnspruch verdrahtet plausibilisiereWbw`.

---

### Task 6: Renderer — Totalschaden-Darstellung (beide Wege)

**Files:**
- Modify: `src/components/shared/AnspruchPositionsListe.tsx`
- Modify: `src/app/embed/anspruch-pruefen/_components/AnspruchSummaryStep.tsx`

**Interfaces:**
- Consumes: `AnspruchSpanne.totalschaden` (Task 2/4).

- [ ] **Step 1: `AnspruchSummaryStep.tsx` — Totalschaden-Weiche**

Wenn `spanne.totalschaden` gesetzt: statt der einfachen `AnspruchPositionsListe` einen Totalschaden-Block rendern — Hinweis („Bei diesem Schaden liegt möglicherweise ein wirtschaftlicher Totalschaden vor. Ihre Optionen:"), dann die Wege. Für den Reparatur-Weg (falls `!= null`) und den Totalschaden-Weg je eine `AnspruchPositionsListe` mit dem jeweiligen `AnspruchWeg` (dazu eine dünne Adapter-Spanne bauen: `{ positionen: weg.positionen, gesamtMinEur: weg.summeMinEur, gesamtMaxEur: weg.summeMaxEur, hinweise: [] }`), Titel = `weg.titel`, der `guenstiger`-Weg mit Badge „günstiger für Sie" markiert. Sonst (kein `totalschaden`): heutige Ansicht unverändert. UI-Strings mit Umlauten.

- [ ] **Step 2: `AnspruchPositionsListe.tsx` — optionaler Titel**

Optionales Prop `titel?: string` ergänzen; wenn gesetzt, oberhalb der Liste als kleine Überschrift rendern. Bestehende Consumer (ohne Prop) unverändert. (Kein weiterer Umbau — die Liste rendert schon Positionen + Gesamt-Band, das reicht pro Weg.)

- [ ] **Step 3: Typecheck + Build** — `npx tsc --noEmit` und `npm run build` → grün.

- [ ] **Step 4: Commit** — `git add …` + `feat(anspruch): Totalschaden-Darstellung — beide Wege im Summary`.

---

### Task 7: Gates + PR

- [ ] **Step 1: Volle Gates** (worktree root): `npx tsc --noEmit` (0) · `npm run build` (0, 8 GB) · `npx vitest run src/lib/anspruch/` (wbw + positionen grün) · `npm run check:token-audit` (0) · `check:component-set`/`check:knip` `-- --ratchet` (0 neu).
- [ ] **Step 2: PR gegen staging** mit 7-Punkt-Audit im Body: `git push -u origin kitta/anspruch-totalschaden` + `gh pr create --base staging`.
- [ ] **Step 3: Prod-Smoke nach Deploy** (Playwright, wie `prod-vision-e2e.py`): denselben schweren Schaden hochladen → Summary zeigt **Totalschaden-Block mit beiden Wegen** (Zone C, da 18–32k Reparatur > 130 % von ~18k WBW); Gegenprobe leichter Schaden → unveränderte Einzel-Ansicht (Zone A). `anspruch_schaetzungen.positionen` der Session enthält den Totalschaden-Fall.

---

## Self-Review

**Spec coverage:** WBW-Quelle Vision+Heuristik (Task 3) ✓ · Schwelle 90 %/130 % als Config (Task 1) ✓ · 3 Zonen (Task 4) ✓ · beide Wege transparent (Task 6) ✓ · Wertminderung im Reparatur-Weg (Task 4 Step 3: Reparatur-Weg = Zone-A-`positionen` inkl. Wertminderung) ✓ · Zone A keine Regression (Task 4 Step 1 Regressions-Test) ✓ · Phase-2-Positionen bewusst ausgelassen ✓.

**Placeholder-Scan:** wbw.ts + positionen.ts + Migration mit vollem Code; Verdrahtung (rates/actions/renderer) mit exakten Interfaces + Code-Blöcken. rates.ts-Map-Detail bewusst „an bestehendes Muster anlehnen" (Datei muss zur Implementierung gelesen werden) — kein erfundenes Schema.

**Typ-Konsistenz:** `plausibilisiereWbw(vision, segment, alterJahre, heuristik): WbwErgebnis` Task 3↔5. `TotalschadenInfo`/`AnspruchWeg` Task 2↔4↔6. `SchaetzInput.wbwMinEur` etc. Task 2↔4↔5. `config.totalschadenSchwelleProzent` (als Faktor 0.9) Task 1→2→4.
