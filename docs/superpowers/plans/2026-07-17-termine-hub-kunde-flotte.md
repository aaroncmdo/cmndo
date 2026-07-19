# Termine-Hub (Kunde + Flotte) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunde und Flottenmanager bekommen eine "Termine"-View: eine chronologische Timeline aller Termine mit Typ-Badges (Besichtigung/Nachbesichtigung/Reparatur/Beratung/Konfrontation), verlinkt zur Detail-View, mit Inline-Quick-Actions.

**Architecture:** Ein geteilter `<TermineHub>` (extrahiert aus dem heutigen `KundeTermineClient`), gefuettert von zwei Ownership-Resolvern (Kunde: `getOwnedClaimIds`; Flotte: `firma -> vehicles -> claims`), die beide denselben `getKundeTermine`-Loader nutzen. Die Typ-Ableitung ist eine reine, getestete Funktion; Nachbesichtigung ist ein synthetischer 2. Timeline-Eintrag aus `nachbesichtigung_termin_datum`.

**Tech Stack:** Next.js 15 (App Router, RSC + `force-dynamic`), Supabase (Admin/Service-Role-Reads), TypeScript, Tailwind v4 + Design-Tokens, next-intl, vitest (co-located `*.test.ts`).

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/termine-hub-kunde-flotte`, PR gegen `staging`. NIE auf `main` pushen.
- **Regel 4:** Nach Prod-Deploy vollstaendiger Playwright-Smoke gegen `https://app.claimondo.de` (Test-Konten `telefon=NULL`).
- **Umlaute Pflicht** in ALLEN UI-Strings: echte `ä/ö/ü/ß` (JSX-Literale, Labels, Toasts).
- **Component-Set:** `Card`/`Badge`-Primitive, `PageHeader`/`StatusBadge` aus `shared/*`. Kein handgerolltes Button/Card-Markup.
- **Status-Registry-Gate:** Status-Farbe NUR via `TerminStatusBadge`. Typ-Badge = Label-Map ohne Status-Farb-Ternary.
- **Termin-Bezug-Gate:** `gutachter_termine`-Filter bezug-aware via `bezugOrExpr` aus `@/lib/termine/bezug-filter` — nie naiv `.in('fall_id')`.
- **Server-Actions/Routes:** Result-Shape konsistent; `revalidatePath` bei Writes; Non-critical-Sends in try/catch.
- **Token-Audit:** keine Inline-Hex; Marken-Toene `claimondo-*`/`var(--brand-*)`; Radien `rounded-ios-*`.
- **7-Punkte-Audit** im Commit-Body jedes Commits (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression).

**Spec:** `docs/superpowers/specs/2026-07-17-termine-hub-kunde-flotte-design.md`

---

## File Structure

**Neu:**
- `src/lib/termine/termin-typ.ts` — `TerminTyp`-Typ + `TERMIN_TYP_META` (Label-Key + Icon-Key) + `basisTypVonGutachterTermin()`. Rein, getestet.
- `src/lib/termine/termin-typ.test.ts` — Tests dazu.
- `src/lib/claims/kunde-termin-entries.ts` — `deriveKundeTerminEntries(row)` (SV-Row -> 1-2 Eintraege inkl. synthetische Nachbesichtigung). Rein, getestet.
- `src/lib/claims/kunde-termin-entries.test.ts` — Tests dazu.
- `src/components/termine/TerminTypBadge.tsx` — Typ-Badge (Label + Icon, token-basiert).
- `src/components/termine/TermineHub.tsx` — geteilte Container-Komponente (Liste/Kalender-Toggle, Kommend/Verlauf, Pending-Bucket).
- `src/components/termine/TermineRow.tsx` — Zeilen-Card (Typ-Badge + Status-Badge + Inline-Quick-Actions + Detail-Link).
- `src/lib/flotte/flotte-termine.ts` — `getFlotteTermine(admin, firmaId)` (Fleet-Fan-out).
- `src/lib/termine/kann-termin-verwalten.ts` — `kannTerminVerwalten(admin, user, fallId)` (geteilter Owner-Guard: Kunde ODER Firma).
- `src/lib/termine/kann-termin-verwalten.test.ts` — Tests dazu.
- `src/app/flotte/(shell)/termine/page.tsx` — Flotten-Termine-Seite.

**Geaendert:**
- `src/lib/claims/kunde-termine.ts` — Select um `nachbesichtigung_termin_datum`, `nachbesichtigung_status` erweitern; bezug-aware Filter; `deriveKundeTerminEntries` einziehen; Rueckgabe-Typ um `terminTyp`.
- `scripts/termin-bezug-baseline.json` — `kunde-termine.ts`-Eintrag entfernen (Boy-Scout, via `--update-baseline`).
- `src/app/kunde/termine/page.tsx` — auf vereinte Liste + `<TermineHub context="kunde">` umstellen.
- `src/app/kunde/termine/KundeTermineClient.tsx` — Thin-Wrapper um `<TermineHub>` (alte Inline-Cards raus).
- `src/components/flotte/FlotteManagerShell.tsx` — Nav-Eintrag "Termine".
- `src/app/api/kunde/termin/verschieben/route.ts` + `absagen/route.ts` — geteilter Owner-Guard (Flotte-Branch + bezug-native fall).
- `src/i18n/messages/{de,en,tr,ru,pl,ar}.json` — Typ-Label-Keys unter `kunde.termine.typ.*`.

---

# PHASE 1 — Kunde

## Task 1: Typ-Taxonomie (`termin-typ.ts`)

**Files:**
- Create: `src/lib/termine/termin-typ.ts`
- Test: `src/lib/termine/termin-typ.test.ts`

**Interfaces:**
- Produces: `type TerminTyp = 'besichtigung' | 'nachbesichtigung' | 'reparatur' | 'beratung' | 'konfrontation'`; `TERMIN_TYP_META: Record<TerminTyp, { labelKey: string; icon: 'hardhat'|'search'|'wrench'|'video'|'users' }>`; `basisTypVonGutachterTermin(typ: string | null): Exclude<TerminTyp,'nachbesichtigung'|'reparatur'>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/termine/termin-typ.test.ts
import { describe, it, expect } from 'vitest'
import { basisTypVonGutachterTermin, TERMIN_TYP_META } from './termin-typ'

describe('basisTypVonGutachterTermin', () => {
  it('mappt sv_begutachtung -> besichtigung', () => {
    expect(basisTypVonGutachterTermin('sv_begutachtung')).toBe('besichtigung')
  })
  it('mappt kb_beratung -> beratung', () => {
    expect(basisTypVonGutachterTermin('kb_beratung')).toBe('beratung')
  })
  it('mappt konfrontation -> konfrontation', () => {
    expect(basisTypVonGutachterTermin('konfrontation')).toBe('konfrontation')
  })
  it('faellt bei null/unbekannt auf besichtigung zurueck', () => {
    expect(basisTypVonGutachterTermin(null)).toBe('besichtigung')
    expect(basisTypVonGutachterTermin('foo')).toBe('besichtigung')
  })
})

describe('TERMIN_TYP_META', () => {
  it('hat einen Eintrag fuer jeden Typ', () => {
    for (const t of ['besichtigung','nachbesichtigung','reparatur','beratung','konfrontation'] as const) {
      expect(TERMIN_TYP_META[t]).toBeTruthy()
      expect(typeof TERMIN_TYP_META[t].labelKey).toBe('string')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/termine/termin-typ.test.ts`
Expected: FAIL — `Cannot find module './termin-typ'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/termine/termin-typ.ts
// Typ-Taxonomie fuer die Termine-Hub-View (Kunde + Flotte). Rein, ohne JSX.

export type TerminTyp =
  | 'besichtigung'
  | 'nachbesichtigung'
  | 'reparatur'
  | 'beratung'
  | 'konfrontation'

/** i18n-Label-Key (unter kunde.termine.typ.*) + Icon-Key (aufgeloest in TerminTypBadge). */
export const TERMIN_TYP_META: Record<
  TerminTyp,
  { labelKey: string; icon: 'hardhat' | 'search' | 'wrench' | 'video' | 'users' }
> = {
  besichtigung: { labelKey: 'typ.besichtigung', icon: 'hardhat' },
  nachbesichtigung: { labelKey: 'typ.nachbesichtigung', icon: 'search' },
  reparatur: { labelKey: 'typ.reparatur', icon: 'wrench' },
  beratung: { labelKey: 'typ.beratung', icon: 'video' },
  konfrontation: { labelKey: 'typ.konfrontation', icon: 'users' },
}

/** Basis-Typ aus gutachter_termine.typ (ohne Nachbesichtigung — die ist synthetisch). */
export function basisTypVonGutachterTermin(
  typ: string | null,
): 'besichtigung' | 'beratung' | 'konfrontation' {
  if (typ === 'kb_beratung') return 'beratung'
  if (typ === 'konfrontation') return 'konfrontation'
  return 'besichtigung'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/termine/termin-typ.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/termine/termin-typ.ts src/lib/termine/termin-typ.test.ts
git commit -m "feat(termine): Typ-Taxonomie fuer Termine-Hub

Audit: Build gruen (vitest) | UI n/a (pure lib) | Redundanz: neue geteilte
Taxonomie | Dead-Code: nichts | Spec: §4 | Inkonsistenz: n/a | Regression: neue Datei

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Entry-Ableitung (`kunde-termin-entries.ts`) — Nachbesichtigung-Split

**Files:**
- Create: `src/lib/claims/kunde-termin-entries.ts`
- Test: `src/lib/claims/kunde-termin-entries.test.ts`

**Interfaces:**
- Consumes: `TerminTyp`, `basisTypVonGutachterTermin` (Task 1).
- Produces: `type SvTerminRow` (Roh-Row-Shape); `type KundeTerminEntry = { id: string; art: 'sv'|'reparatur'; terminTyp: TerminTyp; start: string | null; status: string | null; claim_id: string | null; fall_id: string | null; kanal: string | null; werkstatt_id: string | null }`; `deriveKundeTerminEntries(row: SvTerminRow): KundeTerminEntry[]` (1-2 Eintraege).

**Kontext (verifiziert):** Nachbesichtigung lebt als Sub-Cluster auf der aktuellen `gutachter_termine`-Zeile des Claims (`nachbesichtigung_termin_datum` = Re-Begutachtungs-Datum, `nachbesichtigung_status` ∈ `angefordert|termin-gewaehlt|durchgefuehrt|ergebnis-eingegangen`). Same-Row-Modell -> eine SV-Zeile ergibt die Besichtigung (start_zeit) UND — wenn `nachbesichtigung_termin_datum` gesetzt — einen synthetischen Nachbesichtigung-Eintrag.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/claims/kunde-termin-entries.test.ts
import { describe, it, expect } from 'vitest'
import { deriveKundeTerminEntries } from './kunde-termin-entries'

const base = {
  id: 't1', start_zeit: '2026-07-21T12:00:00Z', status: 'bestaetigt', typ: 'sv_begutachtung',
  kanal: null, fall_id: 'f1', claim_id: 'c1',
  nachbesichtigung_status: null, nachbesichtigung_termin_datum: null,
}

describe('deriveKundeTerminEntries', () => {
  it('SV-Begutachtung ohne Nachbesichtigung -> 1 Besichtigungs-Eintrag', () => {
    const out = deriveKundeTerminEntries(base)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 't1', art: 'sv', terminTyp: 'besichtigung', start: base.start_zeit, fall_id: 'f1' })
  })

  it('kb_beratung -> terminTyp beratung', () => {
    const out = deriveKundeTerminEntries({ ...base, typ: 'kb_beratung' })
    expect(out[0].terminTyp).toBe('beratung')
  })

  it('mit nachbesichtigung_termin_datum -> 2 Eintraege (Besichtigung + Nachbesichtigung)', () => {
    const out = deriveKundeTerminEntries({
      ...base, nachbesichtigung_status: 'termin-gewaehlt', nachbesichtigung_termin_datum: '2026-08-05T09:00:00Z',
    })
    expect(out).toHaveLength(2)
    const nb = out.find(e => e.terminTyp === 'nachbesichtigung')!
    expect(nb.id).toBe('t1:nb')
    expect(nb.start).toBe('2026-08-05T09:00:00Z')
    expect(nb.status).toBe('reserviert')      // termin-gewaehlt -> wartet auf SV
    expect(nb.fall_id).toBe('f1')
  })

  it('nachbesichtigung durchgefuehrt -> status abgeschlossen', () => {
    const out = deriveKundeTerminEntries({
      ...base, nachbesichtigung_status: 'durchgefuehrt', nachbesichtigung_termin_datum: '2026-06-01T09:00:00Z',
    })
    expect(out.find(e => e.terminTyp === 'nachbesichtigung')!.status).toBe('abgeschlossen')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/claims/kunde-termin-entries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/claims/kunde-termin-entries.ts
// Same-Row-Nachbesichtigung: eine gutachter_termine-Zeile -> Besichtigung (+ ggf. Nachbesichtigung).
import { basisTypVonGutachterTermin, type TerminTyp } from '@/lib/termine/termin-typ'

export type SvTerminRow = {
  id: string
  start_zeit: string | null
  status: string | null
  typ: string | null
  kanal: string | null
  fall_id: string | null
  claim_id: string | null
  nachbesichtigung_status: string | null
  nachbesichtigung_termin_datum: string | null
}

export type KundeTerminEntry = {
  id: string
  art: 'sv' | 'reparatur'
  terminTyp: TerminTyp
  start: string | null
  status: string | null
  claim_id: string | null
  fall_id: string | null
  kanal: string | null
  werkstatt_id: string | null
}

// Nachbesichtigung-Substatus -> gutachter_termine-Farbstatus (fuer TerminStatusBadge).
function nbStatusToTerminStatus(nb: string | null): string {
  if (nb === 'durchgefuehrt' || nb === 'ergebnis-eingegangen') return 'abgeschlossen'
  if (nb === 'termin-gewaehlt') return 'reserviert'
  return nb ?? 'reserviert'
}

export function deriveKundeTerminEntries(row: SvTerminRow): KundeTerminEntry[] {
  const besichtigung: KundeTerminEntry = {
    id: row.id,
    art: 'sv',
    terminTyp: basisTypVonGutachterTermin(row.typ),
    start: row.start_zeit,
    status: row.status,
    claim_id: row.claim_id,
    fall_id: row.fall_id,
    kanal: row.kanal,
    werkstatt_id: null,
  }
  const out = [besichtigung]

  if (row.nachbesichtigung_termin_datum) {
    out.push({
      id: `${row.id}:nb`,
      art: 'sv',
      terminTyp: 'nachbesichtigung',
      start: row.nachbesichtigung_termin_datum,
      status: nbStatusToTerminStatus(row.nachbesichtigung_status),
      claim_id: row.claim_id,
      fall_id: row.fall_id,
      kanal: row.kanal,
      werkstatt_id: null,
    })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/claims/kunde-termin-entries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify the Same-Row assumption against Live-DB (READ)**

Bestaetige, dass `nachbesichtigung_termin_datum` auf Zeilen mit `start_zeit` sitzt (nicht auf separaten Zeilen). Supabase-Plugin `execute_sql` (READ, prod `paizkjajbuxxksdoycev`):

```sql
select count(*) filter (where start_zeit is not null and nachbesichtigung_termin_datum is not null) as same_row,
       count(*) filter (where start_zeit is null and nachbesichtigung_termin_datum is not null) as separate_row
from public.gutachter_termine;
```
Expected: `separate_row = 0` (bestaetigt Same-Row). Falls `separate_row > 0`: im Marker notieren + `deriveKundeTerminEntries` um den Separate-Row-Fall erweitern (dann emittiert der Loader die Nachbesichtigung-Zeile direkt statt synthetisch).

- [ ] **Step 6: Commit**

```bash
git add src/lib/claims/kunde-termin-entries.ts src/lib/claims/kunde-termin-entries.test.ts
git commit -m "feat(termine): Nachbesichtigung-Split (Same-Row) fuer Termine-Hub

Audit: Build gruen (vitest) | UI n/a | Redundanz: geteilte Ableitung | Dead-Code: nichts
| Spec: §4.1 (Same-Row, DB-verifiziert) | Inkonsistenz: n/a | Regression: neue Datei

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `getKundeTermine` erweitern — bezug-aware + Typ + Nachbesichtigung

**Files:**
- Modify: `src/lib/claims/kunde-termine.ts`
- Modify: `scripts/termin-bezug-baseline.json` (Boy-Scout: Eintrag entfernen)

**Interfaces:**
- Consumes: `deriveKundeTerminEntries`, `KundeTerminEntry` (Task 2); `bezugOrExpr` (`@/lib/termine/bezug-filter`).
- Produces: geaendertes `getKundeTermine(admin, {fallIds, claimIds}): Promise<KundeTerminEntry[]>` (jetzt mit `terminTyp`).

- [ ] **Step 1: Replace the SV-branch + return type**

Ersetze in `src/lib/claims/kunde-termine.ts` den kompletten Inhalt der `getKundeTermine`-Funktion und den `KundeTermin`-Typ. Der neue Typ ist `KundeTerminEntry` (aus Task 2 re-exportiert). Wichtige Aenderungen: (a) Select um `nachbesichtigung_status, nachbesichtigung_termin_datum` erweitern; (b) bezug-aware Filter via `bezugOrExpr` statt `.in('fall_id')`; (c) SV-Rows durch `deriveKundeTerminEntries` schleusen; (d) Reparatur-Rows mit `terminTyp: 'reparatur'`.

```ts
// src/lib/claims/kunde-termine.ts  (Kopf-Kommentar behalten)
import type { SupabaseClient } from '@supabase/supabase-js'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import { deriveKundeTerminEntries, type KundeTerminEntry, type SvTerminRow } from './kunde-termin-entries'

export type { KundeTerminEntry } from './kunde-termin-entries'

type Ids = { fallIds: string[]; claimIds: string[] }

const SV_AUSGESCHLOSSEN = '(verschoben,verlegt,storniert,abgesagt)'

// bezug-aware Filter fuer viele fallIds: pro id die or-Gruppe, komma-gejoint (PostgREST-or).
function bezugOrForFallIds(fallIds: string[]): string {
  return fallIds.map((id) => bezugOrExpr('fall', id)).join(',')
}

export async function getKundeTermine(
  admin: SupabaseClient,
  { fallIds, claimIds }: Ids,
): Promise<KundeTerminEntry[]> {
  if (fallIds.length === 0 && claimIds.length === 0) return []

  const [svRes, repRes] = await Promise.all([
    fallIds.length > 0
      ? admin
          .from('gutachter_termine')
          .select('id, start_zeit, status, typ, kanal, fall_id, claim_id, nachbesichtigung_status, nachbesichtigung_termin_datum')
          .or(bezugOrForFallIds(fallIds))
          .is('cancelled_at', null)
          .not('status', 'in', SV_AUSGESCHLOSSEN)
          .order('start_zeit', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    claimIds.length > 0
      ? admin
          .from('reparatur_termine')
          .select('id, status, wunschtermin, bestaetigter_termin, claim_id, werkstatt_id')
          .in('claim_id', claimIds)
          .neq('status', 'storniert')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const sv: KundeTerminEntry[] = ((svRes.data ?? []) as SvTerminRow[]).flatMap(deriveKundeTerminEntries)

  const rep: KundeTerminEntry[] = ((repRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    art: 'reparatur',
    terminTyp: 'reparatur',
    start: (r.bestaetigter_termin as string | null) ?? (r.wunschtermin as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    claim_id: (r.claim_id as string | null) ?? null,
    fall_id: null,
    kanal: null,
    werkstatt_id: (r.werkstatt_id as string | null) ?? null,
  }))

  return [...sv, ...rep].sort((a, b) => {
    if (a.start === b.start) return 0
    if (a.start == null) return 1
    if (b.start == null) return -1
    return a.start < b.start ? 1 : -1
  })
}
```

- [ ] **Step 2: Drop the termin-bezug baseline entry (Boy-Scout)**

Run: `npm run check:termin-bezug -- --update-baseline`
Dann pruefen, dass `src/lib/claims/kunde-termine.ts` NICHT mehr in `scripts/termin-bezug-baseline.json` steht:
Run: `git diff scripts/termin-bezug-baseline.json`
Expected: die Zeile `"src/lib/claims/kunde-termine.ts",` ist entfernt (Baseline schrumpft um 1).

- [ ] **Step 3: Typecheck the consumers compile**

Run: `npx tsc --noEmit` (mit `NODE_OPTIONS=--max-old-space-size=8192` falls OOM)
Expected: GRUEN. (Falls `kunde/termine/page.tsx` jetzt Typfehler wirft — es liest `x.art`/`x.typ` — wird es in Task 5 umgebaut; hier ggf. der Page-Umbau vorziehen falls tsc blockt. Erwartung: die alten Feldnamen `art`/`typ`/`kanal`/`start`/`status`/`claim_id`/`fall_id`/`werkstatt_id` bleiben kompatibel, nur `terminTyp` kommt hinzu -> tsc bleibt gruen.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/claims/kunde-termine.ts src/lib/claims/kunde-termin-entries.ts scripts/termin-bezug-baseline.json
git commit -m "feat(termine): getKundeTermine bezug-aware + terminTyp + Nachbesichtigung

Bezug-aware Filter (bezugOrExpr) statt .in(fall_id) -> bezug-native Termine
sichtbar; nachbesichtigung_* im Select; deriveKundeTerminEntries eingezogen.
Boy-Scout: kunde-termine.ts aus termin-bezug-baseline entfernt.

Audit: Build gruen (tsc) | UI n/a | Redundanz: geteilter Loader | Dead-Code: nichts
| Spec: §5.1 | Inkonsistenz: bezug-Gate erfuellt | Regression: Consumer tsc-gruen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `TerminTypBadge` + `TermineRow` + `TermineHub` (geteilte Komponenten)

**Files:**
- Create: `src/components/termine/TerminTypBadge.tsx`
- Create: `src/components/termine/TermineRow.tsx`
- Create: `src/components/termine/TermineHub.tsx`

**Interfaces:**
- Consumes: `TerminTyp`, `TERMIN_TYP_META` (Task 1); `KundeTerminEntry` (Task 2); `TerminStatusBadge` (`@/components/shared/TerminStatusBadge`); `Card` (`@/components/primitives`); `PageHeader` (`@/components/shared/PageHeader`).
- Produces: `<TerminTypBadge typ={TerminTyp} />`; `type TermineRowProps`; `<TermineRow …>`; `type TermineHubProps = { termine: KundeTerminEntry[]; fallMap: Record<string, FallInfo>; linkFor: (t: KundeTerminEntry) => string | null; showActions: boolean; onAction?: 'kunde' }`; `<TermineHub …>`; re-export `type FallInfo`.

- [ ] **Step 1: `TerminTypBadge` — Label + Icon (token-basiert, kein Status-Farb-Ternary)**

```tsx
// src/components/termine/TerminTypBadge.tsx
'use client'
import { useTranslations } from 'next-intl'
import { HardHatIcon, SearchIcon, WrenchIcon, VideoIcon, UsersIcon } from 'lucide-react'
import { TERMIN_TYP_META, type TerminTyp } from '@/lib/termine/termin-typ'

const ICONS = { hardhat: HardHatIcon, search: SearchIcon, wrench: WrenchIcon, video: VideoIcon, users: UsersIcon } as const

export function TerminTypBadge({ typ }: { typ: TerminTyp }) {
  const t = useTranslations('kunde.termine')
  const meta = TERMIN_TYP_META[typ]
  const Icon = ICONS[meta.icon]
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-claimondo-border bg-claimondo-bg px-2.5 py-1 text-[11px] font-medium text-claimondo-navy">
      <Icon className="w-3 h-3" />
      {t(meta.labelKey)}
    </span>
  )
}
```

- [ ] **Step 2: `TermineRow` — Zeilen-Card (Typ-Badge + Status-Badge + Inline-Actions + Detail-Link)**

Uebernimmt Struktur/Styling aus `KundeTermineClient.tsx` (heutige `TerminCard`, Zeilen 372-441) — aber typ-getrieben + mit optionalen Inline-Quick-Actions. `FallInfo` wie heute (`KundeTermineClient.tsx:38-43`).

```tsx
// src/components/termine/TermineRow.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronRightIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import { TerminStatusBadge } from '@/components/shared/TerminStatusBadge'
import { TerminTypBadge } from './TerminTypBadge'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export type FallInfo = { id: string; claimId: string; claim_nummer: string | null; fahrzeug: string }

// Status, auf denen Verschieben/Absagen erlaubt ist (analog kommend-Filter).
const AKTIONEN_STATUS = new Set(['reserviert', 'bestaetigt', 'gegenvorschlag'])
// Nur ECHTE gutachter_termine-Zeilen sind per termin_id aktionierbar. Nachbesichtigung
// ist ein synthetischer Eintrag (id `${rowId}:nb`, kein eigener DB-Row) -> keine Inline-
// Action (wird ueber den Nachbesichtigung-Flow verwaltet); Beratung ist kein SV-Termin.
const AKTIONIERBARE_TYPEN = new Set(['besichtigung', 'konfrontation'])

export function TermineRow({
  termin, fall, href, muted, showActions,
}: {
  termin: KundeTerminEntry
  fall?: FallInfo
  href: string | null
  muted?: boolean
  showActions: boolean
}) {
  const t = useTranslations('kunde.termine')
  const format = useFormatter()
  const [busy, setBusy] = useState(false)

  const start = termin.start ? new Date(termin.start) : null
  const statusLabel = termin.status ? t(`statusLabel.${termin.status}`, { defaultValue: termin.status }) : ''
  const kann = showActions && termin.art === 'sv' && AKTIONIERBARE_TYPEN.has(termin.terminTyp)
    && termin.status != null && AKTIONEN_STATUS.has(termin.status)

  async function post(url: string) {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termin_id: termin.id }),
      })
      if (res.ok) location.reload()
    } finally { setBusy(false) }
  }

  const inner = (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <TerminTypBadge typ={termin.terminTyp} />
          {termin.status && <TerminStatusBadge status={termin.status} label={statusLabel} />}
        </div>
        <p className="text-sm text-claimondo-navy mt-1.5">
          {start
            ? `${format.dateTime(start, { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Berlin' })} · ${format.dateTime(start, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`
            : t('card.terminOffen')}
        </p>
        {fall && (
          <p className="text-xs text-claimondo-ondo mt-0.5">
            {t('card.fallPrefix')} {fall.claim_nummer ?? fall.claimId.slice(0, 8)} · {fall.fahrzeug}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {kann && (
            <>
              <button type="button" disabled={busy}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); post('/api/kunde/termin/verschieben') }}
                className="rounded-ios-lg border border-claimondo-border px-2.5 py-1 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg disabled:opacity-50">
                {t('actions.verschieben')}
              </button>
              <button type="button" disabled={busy}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); post('/api/kunde/termin/absagen') }}
                className="rounded-ios-lg border border-claimondo-border px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50">
                {t('actions.absagen')}
              </button>
            </>
          )}
          {href && <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-claimondo-ondo">{t('card.detailsOeffnen')}<ChevronRightIcon className="w-3.5 h-3.5" /></span>}
        </div>
      </div>
    </div>
  )

  const card = <Card p={4}>{inner}</Card>
  return href ? <Link href={href} className={`block transition hover:opacity-90 ${muted ? 'opacity-80' : ''}`}>{card}</Link> : <div className={muted ? 'opacity-80' : ''}>{card}</div>
}
```

- [ ] **Step 3: `TermineHub` — Container (unified Timeline + Kalender-Toggle)**

Uebernimmt Kalender-Raster + Kommend/Verlauf-Logik verbatim aus `KundeTermineClient.tsx` (Zeilen 66-278 fuer Kalender; 90-132 fuer byDay/kommend/vergangen; DOT_CLS 58-64). Aenderungen: rendert `<TermineRow>` statt der alten `TerminCard`; `linkFor(t)` + `showActions` als Props; Reparatur ist Teil derselben `termine`-Liste (kein Sonder-Section mehr); null-`start`-Eintraege in einen "Anstehend – Datum offen"-Block oben.

```tsx
// src/components/termine/TermineHub.tsx
'use client'
import { useState, useMemo } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import { CalendarIcon, ListIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { TermineRow, type FallInfo } from './TermineRow'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export type { FallInfo } from './TermineRow'

const DOT_CLS: Record<string, string> = {
  bestaetigt: 'bg-success', reserviert: 'bg-warning', gegenvorschlag: 'bg-warning',
  abgelehnt: 'bg-danger', abgeschlossen: 'bg-claimondo-border',
}
const VERSTECKT = new Set(['verschoben', 'verlegt', 'storniert', 'abgesagt'])
function toDateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

export type TermineHubProps = {
  termine: KundeTerminEntry[]
  fallMap: Record<string, FallInfo>
  linkFor: (t: KundeTerminEntry) => string | null
  showActions: boolean
}

export function TermineHub({ termine, fallMap, linkFor, showActions }: TermineHubProps) {
  const t = useTranslations('kunde.termine')
  const format = useFormatter()
  const [view, setView] = useState<'liste' | 'kalender'>('liste')
  const now = new Date()

  const sichtbar = termine.filter((tr) => !(tr.status && VERSTECKT.has(tr.status)))
  const offen = sichtbar.filter((tr) => tr.start == null)                                   // Datum offen (Reparatur/Nachbesichtigung angefragt)
  const mitDatum = sichtbar.filter((tr) => tr.start != null)
  const kommend = mitDatum.filter((tr) => new Date(tr.start as string) >= now && tr.status !== 'abgelehnt')
  const vergangen = mitDatum.filter((tr) => new Date(tr.start as string) < now || tr.status === 'abgelehnt' || tr.status === 'abgeschlossen')

  function fallFor(tr: KundeTerminEntry) {
    return (tr.fall_id && fallMap[tr.fall_id]) || (tr.claim_id && fallMap[tr.claim_id]) || undefined
  }

  // ── Kalender-Raster: byDay/calDays/month verbatim aus KundeTermineClient.tsx (94-119) ──
  // (Hier zur Kuerze weggelassen; beim Umsetzen 1:1 uebernehmen, `termine`->`mitDatum`,
  //  Termin-Render via <TermineRow href={linkFor(tr)} showActions={showActions} …/>.)

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <PageHeader
        title={t('liste.title')} description={t('liste.description')} size="lg"
        actions={
          <div className="flex items-center rounded-ios-xl border border-claimondo-border bg-white p-0.5 gap-0.5 shrink-0">
            <button type="button" onClick={() => setView('liste')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors ${view==='liste'?'bg-claimondo-navy text-white':'text-claimondo-ondo hover:text-claimondo-navy'}`}><ListIcon className="w-3.5 h-3.5" />{t('toggle.liste')}</button>
            <button type="button" onClick={() => setView('kalender')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors ${view==='kalender'?'bg-claimondo-navy text-white':'text-claimondo-ondo hover:text-claimondo-navy'}`}><CalendarIcon className="w-3.5 h-3.5" />{t('toggle.kalender')}</button>
          </div>
        }
      />

      {sichtbar.length === 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-10 text-center">
          <CalendarIcon className="w-6 h-6 text-claimondo-ondo/50 mx-auto mb-2" />
          <p className="text-sm text-claimondo-ondo/70">{t('liste.empty')}</p>
        </div>
      )}

      {view === 'liste' && (
        <>
          {offen.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.offen')}</h2>
              <div className="space-y-2">{offen.map((tr) => <TermineRow key={tr.id} termin={tr} fall={fallFor(tr)} href={linkFor(tr)} showActions={showActions} />)}</div>
            </section>
          )}
          {kommend.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.kommend')}</h2>
              <div className="space-y-2">{kommend.map((tr) => <TermineRow key={tr.id} termin={tr} fall={fallFor(tr)} href={linkFor(tr)} showActions={showActions} />)}</div>
            </section>
          )}
          {vergangen.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.verlauf')}</h2>
              <div className="space-y-2 opacity-80">{vergangen.map((tr) => <TermineRow key={tr.id} termin={tr} fall={fallFor(tr)} href={linkFor(tr)} showActions={false} muted />)}</div>
            </section>
          )}
        </>
      )}

      {/* view === 'kalender': Monatsraster verbatim aus KundeTermineClient.tsx (174-278),
          Termin-Render via <TermineRow>. DOT_CLS oben bereits uebernommen. */}
    </div>
  )
}
```

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: GRUEN.

- [ ] **Step 5: Commit**

```bash
git add src/components/termine/
git commit -m "feat(termine): geteilte TermineHub/TermineRow/TerminTypBadge

Unified Timeline + Typ-Badges + Inline-Quick-Actions (Kunde+Flotte-faehig).

Audit: Build gruen (tsc) | UI: TermineHub (Einstieg via Kunde/Flotte-Pages)
| Redundanz: aus KundeTermineClient extrahiert | Dead-Code: alte Cards folgen Task 5
| Spec: §3.2/§6 | Inkonsistenz: Primitive+StatusBadge, kein Status-Farb-Ternary
| Regression: neue Dateien

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `/kunde/termine` auf `<TermineHub>` umstellen

**Files:**
- Modify: `src/app/kunde/termine/page.tsx`
- Modify: `src/app/kunde/termine/KundeTermineClient.tsx`

**Interfaces:**
- Consumes: `getKundeTermine` (Task 3), `<TermineHub>` + `FallInfo` (Task 4).

- [ ] **Step 1: Page — vereinte Liste + linkFor durchreichen**

In `src/app/kunde/termine/page.tsx`: die `termine`/`reparaturTermine`-Aufspaltung (Zeilen 65-89) ENTFERNEN; stattdessen `alleTermine` (jetzt `KundeTerminEntry[]` mit `terminTyp`) direkt an den Client geben. `fallMap` bleibt (unter fall_id UND claim_id gekeyed — Zeilen 45-55 behalten).

```tsx
// Ersetze ab Zeile 60 (const alleTermine …) bis return:
  const termine =
    fallIds.length > 0 || claimIds.length > 0
      ? await getKundeTermine(adminT, { fallIds, claimIds })
      : []

  return <KundeTermineClient termine={termine} fallMap={fallMap} />
```
(Imports: `TerminRow`/`ReparaturTerminRow` raus; `KundeTerminEntry` implizit ueber den Client.)

- [ ] **Step 2: KundeTermineClient — Thin-Wrapper**

Ersetze den KOMPLETTEN Inhalt von `src/app/kunde/termine/KundeTermineClient.tsx`:

```tsx
'use client'
import { TermineHub, type FallInfo } from '@/components/termine/TermineHub'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export type { FallInfo }

export default function KundeTermineClient({
  termine, fallMap,
}: {
  termine: KundeTerminEntry[]
  fallMap: Record<string, FallInfo>
}) {
  // Kunde-Link: SV-Termine -> Termin-Detail; Nachbesichtigung/Beratung/Reparatur -> Fallakte.
  function linkFor(tr: KundeTerminEntry): string | null {
    if (tr.terminTyp === 'besichtigung' || tr.terminTyp === 'konfrontation') return `/kunde/termine/${tr.id}`
    const fall = (tr.fall_id && fallMap[tr.fall_id]) || (tr.claim_id && fallMap[tr.claim_id])
    return fall ? `/kunde/faelle/${fall.claimId}` : null
  }
  return <TermineHub termine={termine} fallMap={fallMap} linkFor={linkFor} showActions />
}
```

- [ ] **Step 3: Build check (voller Build — Route/RSC)**

Run: `npm run build`
Expected: GRUEN (Next.js 15 validiert Routen/RSC zur Build-Zeit).

- [ ] **Step 4: Commit**

```bash
git add src/app/kunde/termine/page.tsx src/app/kunde/termine/KundeTermineClient.tsx
git commit -m "feat(termine): /kunde/termine auf geteilten TermineHub umgestellt

Vereinte Timeline mit Typ-Badges; alte Inline-Cards + separate Reparatur-Sektion raus.

Audit: Build gruen (npm run build) | UI: /kunde/termine (Nav vorhanden KundeNav:17)
| Redundanz: TermineHub statt Inline | Dead-Code: alte TerminCard/ReparaturTerminCard entfernt
| Spec: §7 | Inkonsistenz: ok | Regression: Detail-Links (/kunde/termine/[id], /kunde/faelle/[id]) unveraendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: i18n — Typ-Labels + neue Keys

**Files:**
- Modify: `src/i18n/messages/de.json` (+ en, tr, ru, pl, ar)

**Interfaces:** Keys unter `kunde.termine.*`: `typ.{besichtigung,nachbesichtigung,reparatur,beratung,konfrontation}`, `actions.{verschieben,absagen}`, `liste.offen`, `card.terminOffen` (falls fehlt). Bestehende `statusLabel.*`, `liste.{title,description,kommend,verlauf,empty}`, `toggle.*`, `card.{fallPrefix,detailsOeffnen}` bleiben.

- [ ] **Step 1: de.json ergaenzen**

Unter `kunde.termine`:
```json
"typ": {
  "besichtigung": "Besichtigung",
  "nachbesichtigung": "Nachbesichtigung",
  "reparatur": "Reparatur",
  "beratung": "Beratung",
  "konfrontation": "Konfrontation"
},
"actions": { "verschieben": "Verschieben", "absagen": "Absagen" },
"liste": { "offen": "Terminvereinbarung läuft" }
```
(In die bestehende `liste`-Gruppe mergen, nicht ueberschreiben. Echte Umlaute.)

- [ ] **Step 2: en/tr/ru/pl/ar analog** (uebersetzt; en z.B. `"besichtigung": "Inspection"`, `"nachbesichtigung": "Re-inspection"`, `"reparatur": "Repair"`, `"beratung": "Consultation"`, `"konfrontation": "Confrontation"`, `actions` "Reschedule"/"Cancel", `liste.offen` "Scheduling in progress").

- [ ] **Step 3: Verify i18n keys resolve**

Run: `npx tsc --noEmit && npm run build`
Expected: GRUEN; keine `MISSING_MESSAGE`-Warnings fuer die neuen Keys im Build-Log.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/
git commit -m "feat(termine): i18n Typ-Labels + Aktions-Keys (6 Locales)

Audit: Build gruen | UI: Labels der Typ-Badges | Redundanz: n/a | Dead-Code: nichts
| Spec: §9 | Inkonsistenz: echte Umlaute | Regression: bestehende Keys unveraendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Phase-1 Build + Regel-4 Prod-Smoke (Kunde)

- [ ] **Step 1: Voller Build**

Run: `npm run build`
Expected: GRUEN.

- [ ] **Step 2: Ratchets lokal**

Run: `npm run check:termin-bezug && npm run check:status-registry && npm run check:token-audit && npm run check:component-set`
Expected: alle exit 0 (lokal `--warn`).

- [ ] **Step 3: PR gegen staging + Merge-Deploy abwarten**

PR erstellen; nach Deploy (`gh run list --workflow=deploy-vps.yml --branch=main` completed/success) weiter.

- [ ] **Step 4: Regel-4-Smoke (Kunde) gegen Prod**

Test-Konto: `test-kunde@claimondo.de` (bzw. `smoke-kunde@…`, s. reference-internal-test-account-logins). Flow (Playwright/`app.claimondo.de`): Login -> `/kunde/termine` -> assert: Timeline sichtbar; Typ-Badges (mind. Besichtigung + ggf. Reparatur/Nachbesichtigung) korrekt; Liste/Kalender-Toggle; Klick auf SV-Termin -> `/kunde/termine/[id]`; Inline "Verschieben" auf kommendem Termin -> 200 + Status-Wechsel in DB (READ verifizieren). Ergebnis (gruen/rot + Screenshots) im PR/Marker.

---

# PHASE 2 — Flotte

## Task 8: Fleet-Fan-out (`getFlotteTermine`)

**Files:**
- Create: `src/lib/flotte/flotte-termine.ts`

**Interfaces:**
- Consumes: `getKundeFlotte` (`@/lib/kunde/firma-flotte`), `getKundeTermine` (Task 3).
- Produces: `getFlotteTermine(admin, firmaId): Promise<{ termine: KundeTerminEntry[]; fallMap: Record<string,FallInfo>; vehicleByClaim: Record<string,string> }>`.

- [ ] **Step 1: Implementation**

```ts
// src/lib/flotte/flotte-termine.ts
// Fleet-Fan-out: firma -> Flotten-Fahrzeuge -> claims -> v_claim_full -> getKundeTermine.
// Reiner Admin/Service-Role-Read; Ownership-Gate = Firma-Zugehoerigkeit (getKundeFlotte).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import { getKundeTermine, type KundeTerminEntry } from '@/lib/claims/kunde-termine'
import type { FallInfo } from '@/components/termine/TermineRow'

export async function getFlotteTermine(
  admin: SupabaseClient, firmaId: string,
): Promise<{ termine: KundeTerminEntry[]; fallMap: Record<string, FallInfo>; vehicleByClaim: Record<string, string> }> {
  const flotte = await getKundeFlotte(admin, firmaId)
  const vehicleIds = flotte.map((v) => v.vehicleId).filter(Boolean)
  if (vehicleIds.length === 0) return { termine: [], fallMap: {}, vehicleByClaim: {} }

  const { data: claims } = await admin.from('claims').select('id, vehicle_id').in('vehicle_id', vehicleIds)
  const claimIds = (claims ?? []).map((c) => c.id as string)
  const vehicleByClaim: Record<string, string> = {}
  for (const c of claims ?? []) vehicleByClaim[c.id as string] = c.vehicle_id as string
  if (claimIds.length === 0) return { termine: [], fallMap: {}, vehicleByClaim: {} }

  const { data: faelle } = await admin
    .from('v_claim_full')
    .select('id, fall_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claim_nummer')
    .in('id', claimIds)

  const fallIds = (faelle ?? []).map((f) => f.fall_id as string).filter(Boolean)
  const fallMap: Record<string, FallInfo> = {}
  for (const f of faelle ?? []) {
    const info: FallInfo = {
      id: f.fall_id as string, claimId: f.id as string,
      claim_nummer: (f.claim_nummer as string | null) ?? null,
      fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || (f.kennzeichen as string | null) || '—',
    }
    if (f.fall_id) fallMap[f.fall_id as string] = info
    fallMap[f.id as string] = info
  }

  const termine = await getKundeTermine(admin, { fallIds, claimIds })
  return { termine, fallMap, vehicleByClaim }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: GRUEN.

- [ ] **Step 3: Verify claims.vehicle_id fan-out against Live-DB (READ)**

`execute_sql` (READ, prod): fuer eine Test-Firma bestaetigen, dass `claims.vehicle_id` die Fleet-Claims liefert (>=1). Falls `claims` kein `vehicle_id` haette (Typfehler in Step 2 faengt das), stattdessen `claim_parties.firma_id` als Fan-out — aber `getFahrzeugSchaeden` nutzt `claims.vehicle_id`, also erwartet OK.

- [ ] **Step 4: Commit**

```bash
git add src/lib/flotte/flotte-termine.ts
git commit -m "feat(termine): getFlotteTermine Fleet-Fan-out (firma->vehicles->claims)

Audit: Build gruen (tsc) | UI n/a | Redundanz: reused getKundeTermine/getKundeFlotte
| Dead-Code: nichts | Spec: §5.2 | Inkonsistenz: Nested-FK normalisiert | Regression: neue Datei

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Geteilter Owner-Guard + Routes generalisieren

**Files:**
- Create: `src/lib/termine/kann-termin-verwalten.ts`
- Test: `src/lib/termine/kann-termin-verwalten.test.ts`
- Modify: `src/app/api/kunde/termin/verschieben/route.ts`
- Modify: `src/app/api/kunde/termin/absagen/route.ts`

**Interfaces:**
- Consumes: `getFlottenmanagerFirma` (`@/lib/flotte/konto-firma`), `getKundeFlotte`.
- Produces: `type TerminOwnerCtx`; `resolveEffektiveFallId(admin, terminId): Promise<{ terminId; fallId: string | null; typ: string | null; status: string | null; startZeit: string | null } | null>`; `kannTerminFallVerwalten(admin, user, fallId): Promise<boolean>`.

- [ ] **Step 1: Test the pure fleet-branch decision**

```ts
// src/lib/termine/kann-termin-verwalten.test.ts
import { describe, it, expect } from 'vitest'
import { istKundeOwner } from './kann-termin-verwalten'

describe('istKundeOwner', () => {
  it('true wenn kunde_id === userId', () => {
    expect(istKundeOwner({ kunde_id: 'u1', lead_email: null }, { id: 'u1', email: 'a@b.de' })).toBe(true)
  })
  it('true wenn lead_email === user.email (case-insensitive)', () => {
    expect(istKundeOwner({ kunde_id: null, lead_email: 'A@B.de' }, { id: 'u1', email: 'a@b.de' })).toBe(true)
  })
  it('false sonst', () => {
    expect(istKundeOwner({ kunde_id: 'x', lead_email: 'z@z.de' }, { id: 'u1', email: 'a@b.de' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/termine/kann-termin-verwalten.test.ts` -> FAIL (module not found).

- [ ] **Step 3: Implementation**

```ts
// src/lib/termine/kann-termin-verwalten.ts
// Geteilter Owner-Guard fuer Termin-Aktionen (Kunde ODER Flottenmanager-Firma).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'

type User = { id: string; email: string | null | undefined }

/** Reiner Kunde-Owner-Check (testbar). */
export function istKundeOwner(
  fall: { kunde_id: string | null; lead_email: string | null }, user: User,
): boolean {
  if (fall.kunde_id && fall.kunde_id === user.id) return true
  if (fall.lead_email && user.email && fall.lead_email.toLowerCase() === user.email.toLowerCase()) return true
  return false
}

/** Effektive fall_id + Termin-Metadaten (bezug-native fall_id NULL -> aus bezug_typ/bezug_id). */
export async function resolveTerminFall(admin: SupabaseClient, terminId: string) {
  const { data: t } = await admin
    .from('gutachter_termine')
    .select('id, fall_id, typ, status, start_zeit, bezug_typ, bezug_id')
    .eq('id', terminId).maybeSingle()
  if (!t) return null
  const fallId = (t.fall_id as string | null) ?? (t.bezug_typ === 'fall' ? (t.bezug_id as string | null) : null)
  return { terminId: t.id as string, fallId, typ: t.typ as string | null, status: t.status as string | null, startZeit: t.start_zeit as string | null }
}

/** Kunde ODER Flottenmanager-Firma darf diesen Fall verwalten. */
export async function kannTerminFallVerwalten(admin: SupabaseClient, user: User, fallId: string): Promise<boolean> {
  const { data: fallRow } = await admin
    .from('v_claim_full').select('id, fall_id, kunde_id, lead_id').eq('fall_id', fallId).maybeSingle()
  if (!fallRow) return false
  let leadEmail: string | null = null
  if (fallRow.lead_id) {
    const { data: lead } = await admin.from('leads').select('email').eq('id', fallRow.lead_id as string).maybeSingle()
    leadEmail = (lead?.email as string | null) ?? null
  }
  if (istKundeOwner({ kunde_id: fallRow.kunde_id as string | null, lead_email: leadEmail }, user)) return true

  // Flotte: Firma des Flottenmanagers -> Fleet-Fahrzeug des Claims?
  const firma = await getFlottenmanagerFirma(admin, user.id)
  if (!firma) return false
  const { data: claim } = await admin.from('claims').select('vehicle_id').eq('id', fallRow.id as string).maybeSingle()
  const vehicleId = (claim?.vehicle_id as string | null) ?? null
  if (!vehicleId) return false
  const flotte = await getKundeFlotte(admin, firma.id)
  return flotte.some((v) => v.vehicleId === vehicleId)
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/termine/kann-termin-verwalten.test.ts` -> PASS.

- [ ] **Step 5: Wire into `verschieben/route.ts`**

Ersetze in `src/app/api/kunde/termin/verschieben/route.ts` den Block, der `termin` laedt (34-44) + den Owner-Check (46-84), durch die geteilten Helfer. Konkret: nach dem User-Check:

```ts
    const admin = createAdminClient()
    const { resolveTerminFall, kannTerminFallVerwalten } = await import('@/lib/termine/kann-termin-verwalten')
    const termin = await resolveTerminFall(admin, body.termin_id)
    if (!termin || !termin.fallId) {
      return NextResponse.json({ success: false, error: 'Termin nicht gefunden.' }, { status: 404 })
    }
    if (!(await kannTerminFallVerwalten(admin, { id: user.id, email: user.email }, termin.fallId))) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 })
    }
    // fuer Task/Timeline weiterhin claim_nummer + kundenbetreuer_id laden:
    const { data: fallRow } = await admin
      .from('v_claim_full').select('fall_id, kundenbetreuer_id, claim_nummer').eq('fall_id', termin.fallId).maybeSingle()
    const fall = { id: termin.fallId }
    const kundenbetreuerId = (fallRow?.kundenbetreuer_id as string | null) ?? null
    const claimNummer = (fallRow?.claim_nummer as string | null) ?? null
```
Danach die bestehenden `.update({status:'verschoben',…})` + Task/Timeline-Bloecke behalten, aber `termin.typ`->`termin.typ`, `termin.start_zeit`->`termin.startZeit`, `claim?.claim_nummer`->`claimNummer`, `fall.id`->`termin.fallId` anpassen.

- [ ] **Step 6: Wire into `absagen/route.ts`** — identisches Muster (dort `.update({status:'abgesagt', cancelled_at, notiz_kunde:grund})`).

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: GRUEN.

- [ ] **Step 8: Commit**

```bash
git add src/lib/termine/kann-termin-verwalten.ts src/lib/termine/kann-termin-verwalten.test.ts src/app/api/kunde/termin/verschieben/route.ts src/app/api/kunde/termin/absagen/route.ts
git commit -m "feat(termine): Termin-Aktions-Guard generalisiert (Kunde+Flotte) + bezug-native fall

Flottenmanager darf Firmen-Fahrzeug-Termine verwalten; bezug-native Termine
(fall_id NULL) ueber bezug_typ/bezug_id aufgeloest.

Audit: Build gruen | UI n/a (API) | Redundanz: geteilter Guard | Dead-Code: alter Inline-Check ersetzt
| Spec: §8 | Inkonsistenz: Result-Shape unveraendert | Regression: Kunde-Pfad testgedeckt + Fremd-Claim 403

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `/flotte/termine` Page + Nav-Eintrag

**Files:**
- Create: `src/app/flotte/(shell)/termine/page.tsx`
- Modify: `src/components/flotte/FlotteManagerShell.tsx`

**Interfaces:**
- Consumes: `getFlotteTermine` (Task 8), `<TermineHub>` (Task 4), `requirePortalAccess`, `getFlottenmanagerFirma`.

- [ ] **Step 1: Nav-Eintrag in FlotteManagerShell**

In `src/components/flotte/FlotteManagerShell.tsx`: Import `CalendarIcon` ergaenzen (Zeile 7) und `FLOTTE_NAV_ITEMS` (20-23) erweitern:
```tsx
import { TruckIcon, CreditCardIcon, CalendarIcon, LogOutIcon } from 'lucide-react'
// …
const FLOTTE_NAV_ITEMS: PortalNavItem[] = [
  { href: '/flotte/flotte', label: 'Flotte', icon: TruckIcon },
  { href: '/flotte/termine', label: 'Termine', icon: CalendarIcon },
  { href: '/flotte/karten', label: 'Karten', icon: CreditCardIcon },
]
```

- [ ] **Step 2: Page (Client-Komponente mit Flotte-linkFor)**

Da `linkFor` fuer die Flotte `vehicleByClaim` braucht (Client-seitige Prop), einen kleinen Client-Wrapper analog `KundeTermineClient`:

```tsx
// src/app/flotte/(shell)/termine/page.tsx
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getFlotteTermine } from '@/lib/flotte/flotte-termine'
import FlotteTermineClient from './FlotteTermineClient'

export const dynamic = 'force-dynamic'

export default async function FlotteTerminePage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  const { termine, fallMap, vehicleByClaim } = firma
    ? await getFlotteTermine(db, firma.id)
    : { termine: [], fallMap: {}, vehicleByClaim: {} }
  return <FlotteTermineClient termine={termine} fallMap={fallMap} vehicleByClaim={vehicleByClaim} />
}
```

```tsx
// src/app/flotte/(shell)/termine/FlotteTermineClient.tsx
'use client'
import { TermineHub, type FallInfo } from '@/components/termine/TermineHub'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export default function FlotteTermineClient({
  termine, fallMap, vehicleByClaim,
}: {
  termine: KundeTerminEntry[]
  fallMap: Record<string, FallInfo>
  vehicleByClaim: Record<string, string>
}) {
  // Flotte-Link: Fahrzeug->Schaden-Detail (volle Rechte). Braucht vehicleId + claimId.
  function linkFor(tr: KundeTerminEntry): string | null {
    const claimId = tr.claim_id ?? (tr.fall_id ? fallMap[tr.fall_id]?.claimId : undefined) ?? null
    if (!claimId) return null
    const vehicleId = vehicleByClaim[claimId]
    return vehicleId ? `/flotte/fahrzeug/${vehicleId}/schaden/${claimId}` : null
  }
  return <TermineHub termine={termine} fallMap={fallMap} linkFor={linkFor} showActions />
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: GRUEN (`/flotte/termine` rendert Content -> kein Redirect-Stub).

- [ ] **Step 4: Commit**

```bash
git add "src/app/flotte/(shell)/termine/" src/components/flotte/FlotteManagerShell.tsx
git commit -m "feat(termine): /flotte/termine Page + Nav-Eintrag (Flottenmanager)

Fleet-weite Timeline; Zeile -> /flotte/fahrzeug/[id]/schaden/[claimId]; volle Rechte.

Audit: Build gruen | UI: Nav-Eintrag 'Termine' in FlotteManagerShell + /flotte/termine
| Redundanz: geteilter TermineHub | Dead-Code: nichts | Spec: §7 | Inkonsistenz: PortalNav config-driven
| Regression: bestehende Flotte-Routen unveraendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Phase-2 Build + Regel-4 Prod-Smoke (Flotte, inkl. Negativ)

- [ ] **Step 1: Voller Build + Ratchets**

Run: `npm run build && npm run check:termin-bezug && npm run check:component-set && npm run check:redirect-stubs`
Expected: alle gruen/exit 0.

- [ ] **Step 2: PR gegen staging + Deploy abwarten** (wie Task 7 Step 3).

- [ ] **Step 3: Regel-4-Smoke (Flotte) gegen Prod**

Test: Flottenmanager-Konto (aus `firmen_flotten_konten`, `status='aktiv'` — falls keins existiert, via Admin `/admin/firmen-flotte` provisionieren ODER Seed-Skript `scripts/smoke/*`). Fleet mit >=2 Fahrzeugen + >=1 Claim + Termin. Flow (Playwright/`app.claimondo.de`):
  1. Login Flottenmanager -> Nav zeigt "Termine" -> `/flotte/termine`.
  2. Timeline zeigt Termine ueber mehrere Fahrzeuge mit Typ-Badges.
  3. Klick Termin -> `/flotte/fahrzeug/[id]/schaden/[claimId]` (200, richtiges Fahrzeug/Claim).
  4. Inline "Verschieben" auf kommendem SV-Termin -> 200 + Status-Wechsel (DB-READ).
  5. **Negativ:** POST `/api/kunde/termin/verschieben` mit einer `termin_id` eines FREMDEN (nicht-Firmen-)Claims als Flottenmanager -> **403**.

- [ ] **Step 4: Ergebnis dokumentieren** (gruen/rot + Screenshots + DB-Verifikation) im PR/Marker. Rot -> Fix-PR; Aufgabe bleibt offen bis gruen.

---

## Self-Review-Ergebnis (beim Schreiben durchgefuehrt)

- **Spec-Coverage:** §3 (Task 3/4/5/8), §4+§4.1 (Task 1/2), §5 (Task 3/8), §6 (Task 4), §7 (Task 5/10), §8 (Task 9), §9 (Task 6), §10-Ratchets (Task 3/7/11), §11-Phasen (Task 1-7 / 8-11), §13-Smoke (Task 7/11). Alle abgedeckt.
- **Typ-Konsistenz:** `KundeTerminEntry` (Task 2) durchgaengig; `FallInfo` in `TermineRow` definiert + re-exportiert (Task 4) + in `flotte-termine` konsumiert (Task 8); `deriveKundeTerminEntries`/`getKundeTermine`/`getFlotteTermine`/`kannTerminFallVerwalten` Signaturen konsistent.
- **Offene Verifikationen (in-Task, kein Blocker):** Same-Row-Annahme (Task 2 Step 5), `claims.vehicle_id`-Fan-out (Task 8 Step 3) — beide mit konkretem Fallback dokumentiert.
