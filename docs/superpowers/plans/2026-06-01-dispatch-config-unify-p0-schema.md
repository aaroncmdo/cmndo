# Dispatch-Config-Unify P0 — Schema-Fundament (audience/sektion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** `onboarding_felder` bekommt `audience` (kunde|dispatcher|beide) + `sektion`; ein geteilter `filterFelderByAudience`-Helper + die Kunden-Loader filtern nach audience — das Fundament fuer „eine Config, zwei Renderer". Rein additiv (default `beide` -> bestehende Flows unveraendert).

**Architecture:** Additive DDL via Supabase-Plugin (`apply_migration`); pure Filter-Helper (TDD vitest); Loader-Integration in `load-needed-phases` + `lade-beauftragung-phasen`. Spec: `docs/superpowers/specs/2026-06-01-dispatch-leads-config-unify-design.md` §4/§5.

**Tech Stack:** Next.js, Supabase (Plugin-Migration, Projekt `paizkjajbuxxksdoycev`), TypeScript, vitest. Harte Regeln: DDL NUR via apply_migration (Twin-Drift: File==recorded version), PR `--base staging`, nie main, 7-Punkt-Audit, Umlaute UI.

---

### Task 1: `filterFelderByAudience` — pure Helper (TDD)

**Files:**
- Create: `src/lib/onboarding/filter-felder-by-audience.ts`
- Test: `src/lib/onboarding/filter-felder-by-audience.test.ts`

- [ ] **Step 1: Failing test schreiben**
```ts
import { describe, it, expect } from 'vitest'
import { filterFelderByAudience } from './filter-felder-by-audience'
import type { OnboardingFeld } from '@/components/onboarding/types'

const f = (k: string, audience?: string): OnboardingFeld =>
  ({ id: k, phase_id: 'p', reihenfolge: 0, feld_key: k, typ: 'text', label: k,
     pflicht: false, db_target: { tabelle: 'leads', spalte: k }, audience } as unknown as OnboardingFeld)

describe('filterFelderByAudience', () => {
  it('kunde sieht kunde + beide + undefined(=beide)', () => {
    const felder = [f('a', 'kunde'), f('b', 'dispatcher'), f('c', 'beide'), f('d')]
    expect(filterFelderByAudience(felder, 'kunde').map(x => x.feld_key)).toEqual(['a', 'c', 'd'])
  })
  it('dispatcher sieht dispatcher + beide + undefined', () => {
    const felder = [f('a', 'kunde'), f('b', 'dispatcher'), f('c', 'beide'), f('d')]
    expect(filterFelderByAudience(felder, 'dispatcher').map(x => x.feld_key)).toEqual(['b', 'c', 'd'])
  })
})
```

- [ ] **Step 2: Test laufen, FAIL verifizieren**
Run: `npx vitest run src/lib/onboarding/filter-felder-by-audience.test.ts`
Expected: FAIL ("Cannot find module './filter-felder-by-audience'").

- [ ] **Step 3: Minimal-Implementierung**
```ts
import type { OnboardingFeld } from '@/components/onboarding/types'

// audience-Default = 'beide' (fehlt das Feld in der DB-Zeile -> beide Renderer sehen es).
export function filterFelderByAudience(
  felder: OnboardingFeld[],
  audience: 'kunde' | 'dispatcher',
): OnboardingFeld[] {
  return felder.filter((f) => {
    const a = (f as OnboardingFeld & { audience?: string }).audience ?? 'beide'
    return a === 'beide' || a === audience
  })
}
```

- [ ] **Step 4: Test laufen, PASS verifizieren**
Run: `npx vitest run src/lib/onboarding/filter-felder-by-audience.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/onboarding/filter-felder-by-audience.ts src/lib/onboarding/filter-felder-by-audience.test.ts
git commit -m "feat(onboarding): filterFelderByAudience pure helper (TDD)"
```

---

### Task 2: Type-Erweiterung `OnboardingFeld`

**Files:**
- Modify: `src/components/onboarding/types.ts`

- [ ] **Step 1: `audience` + `sektion` zum Typ hinzufuegen**
In `export type OnboardingFeld = { … }` ergaenzen (vor der schliessenden `}`):
```ts
  audience?: 'kunde' | 'dispatcher' | 'beide' | null
  sektion?: string | null
```

- [ ] **Step 2: Build-Gate**
Run: `npx tsc --noEmit` (im Worktree; bei Junction-TS2307-Rauschen ist CI-build das Gate). Erwartet: keine neuen Fehler in geaenderten Files.

- [ ] **Step 3: Commit**
```bash
git add src/components/onboarding/types.ts
git commit -m "feat(onboarding): OnboardingFeld.audience + .sektion types"
```

---

### Task 3: Migration — `onboarding_felder.audience` + `.sektion` (additiv)

**Files:**
- Create: `supabase/migrations/<recorded_version>_onboarding_felder_audience_sektion.sql`

- [ ] **Step 1: DDL via Plugin anwenden** (`mcp__plugin_supabase_supabase__apply_migration`, name `onboarding_felder_audience_sektion`):
```sql
ALTER TABLE onboarding_felder
  ADD COLUMN IF NOT EXISTS audience text DEFAULT 'beide'
    CHECK (audience IS NULL OR audience IN ('kunde', 'dispatcher', 'beide')),
  ADD COLUMN IF NOT EXISTS sektion text;
```

- [ ] **Step 2: Recorded Version ablesen**
`mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT version FROM supabase_migrations.schema_migrations WHERE name='onboarding_felder_audience_sektion';
```
Datei benennen als `supabase/migrations/<version>_onboarding_felder_audience_sektion.sql` mit exakt obigem DDL (Twin-Drift: Filename == recorded version).

- [ ] **Step 3: Spalten verifizieren (READ)**
```sql
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='onboarding_felder' AND column_name IN ('audience','sektion');
```
Expected: `audience` (text, default `'beide'::text`), `sektion` (text, null).

- [ ] **Step 4: File committen**
```bash
git add supabase/migrations/<version>_onboarding_felder_audience_sektion.sql
git commit -m "feat(db): onboarding_felder.audience + .sektion (additiv, default beide)"
```

---

### Task 4: Kunden-Loader nach audience filtern

**Files:**
- Modify: `src/lib/onboarding/load-needed-phases.ts` (kunde-onboarding-Loader)
- Modify: `src/lib/onboarding/lade-beauftragung-phasen.ts` (beauftragung-Render-Loader)

- [ ] **Step 1: `audience`/`sektion` ins Select + Filter (load-needed-phases.ts)**
Im `.select('… onboarding_felder ( …, db_target, conditional_on, i18n )')` ergaenzen: `audience, sektion`. Direkt nach dem `.map(...)`-Build der `felder` (vor dem Pflicht-Skip) den Helper anwenden:
```ts
import { filterFelderByAudience } from './filter-felder-by-audience'
// … nach `const felder: OnboardingFeld[] = (…).map(…)`:
const sichtbareFelder = filterFelderByAudience(felder, 'kunde')
```
und nachfolgend `sichtbareFelder` statt `felder` verwenden (Pflicht-Skip + Phase-Push). `audience`/`sektion` im Feld-Objekt mitmappen.

- [ ] **Step 2: Gleiches in `lade-beauftragung-phasen.ts`**
`audience, sektion` ins Select; nach dem felder-`.map(...)`: `const felder = filterFelderByAudience(<gemappte>, 'kunde')`. `audience`/`sektion` mitmappen.

- [ ] **Step 3: Build-Gate + Regression**
Run: `npx tsc --noEmit` (CI-build autoritativ) + `npx vitest run src/lib/onboarding`. Expected: gruen.
Invariante: da alle bestehenden Felder default `audience='beide'` haben, zeigt der Kunden-Wizard **alle bisherigen Felder unveraendert** (Filter ist ein No-op solange nichts auf `dispatcher` gesetzt ist).

- [ ] **Step 4: Commit**
```bash
git add src/lib/onboarding/load-needed-phases.ts src/lib/onboarding/lade-beauftragung-phasen.ts
git commit -m "feat(onboarding): kunde-Loader filtern nach audience (default beide = no-op)"
```

---

### Self-Review / Verifikation (P0 deckt Spec §4/§5-Fundament)

- **Spec-Coverage:** `audience` (§4) ✓, `sektion`-Spalte (§4) ✓, Kunden-Renderer filtert audience (§5.1) ✓. (Dispatcher-Renderer = P2; Feld-Inventar/sektion-Werte = P1.)
- **Regression:** bestehende kunde-onboarding + beauftragung-Wizards unveraendert (alle Felder default beide).
- **Smoke (nach Merge+Deploy):** `/anfrage/{token}?wizard=v2` zeigt weiter alle 5 beauftragung-Phasen (P0 aendert kein Rendering, nur die Filter-Mechanik mit beide-Default).
- **PR:** `--base staging`, 7-Punkt-Audit im Commit-Body, nicht selbst mergen.

---

## Folge-Plaene (eigener Plan + PR je Phase)

- **P1 — Feld-Inventar-Seed:** exhaustive 1:1-Mapping aller Dispatch-Felder (`_phases/*` + `hard-gate.ts` + `_actions/types.ts` + `qualification-engine.ts`) -> `onboarding_felder` (audience, sektion, db_target). **Braucht vorab den vollstaendigen Feld-Read** (im P1-Plan). + WhatsApp-Check-Feld, Unfallskizze-Feldtyp, Zeugen(+Kontakt), Vorschaeden, Unfallgegner-Kontakt.
- **P2 — `DispatchLeadForm`:** flacher Renderer (audience=dispatcher/beide, sektion-Gruppen, Autosave/Feld, Flags statt Hard-Block) hinter `?v2`. + OCR-always-DB-Fix (token-basiert, §8b). + Checkliste/Anforderung (§8c).
- **P3 — Cutover:** `/dispatch/leads/[id]` default DispatchLeadForm; Phasen-Maschinerie entfernen nach gruenem Smoke.
- **P4 — Re-Smoke** beider Strecken + Disqualifikations-Reporting auf manuelles Flag umstellen.
