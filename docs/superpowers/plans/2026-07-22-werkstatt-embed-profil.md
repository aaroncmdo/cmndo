# Werkstatt-Embed-Profil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein geteiltes Werkstatt-Profil (analog zum SV-Profil, abgespeckt) in der Werkstatt-Empfehlung-Card **und** im Werkstatt-Finder-Embed-Map-Pin-Popup.

**Architecture:** Eine neue reine Anzeige-Komponente `WerkstattProfileInhalt` (ohne Surface, wie `SvProfileInhalt`) rendert die schon vorhandenen Trust-Felder aus `WerkstattVorschlag`. Die geteilte `WerkstattFinder`-Card wird um die `GoogleBewertungBadge` angereichert (trifft Empfehlung + Embed-Liste). Das Embed-Map-Pin-Popup (`WerkstattFinderShell`) tauscht seinen `setText(name)`-Popup gegen einen React-gerenderten `WerkstattProfilePopup` (GlassSurface + `WerkstattProfileInhalt`, `createRoot`+`setDOMContent`-Muster von `FinderMap.openSvPopup`).

**Tech Stack:** Next.js 15 (App Router, RSC/Client), React 18 (`react-dom/client` `createRoot`), TypeScript, mapbox-gl, vitest + @testing-library/react, Tailwind v4 (Design-Tokens).

## Global Constraints

- **Kein DB-/Schema-Change.** Alle Felder liegen in `WerkstattVorschlag` (`SELECT_COLS` in `src/lib/werkstatt/matching/lade-vorschlaege.ts`: `google_rating,google_review_count,marken,faehigkeiten,verifiziert,fahrzeug_gruppen`).
- **Named, nicht anonym** — Werkstatt-Firmenname wird gezeigt (Kunde wählt gezielt; Unterschied zum anonymen SV).
- **Abgespeckt:** KEIN Partner-Rang, KEINE SV-Credentials, KEIN Einsatzgebiet-km, KEINE Schadenarten, KEINE Bio.
- **Reuse:** `GoogleBewertungBadge` (`@/components/shared/GoogleBewertungBadge`), die Embed-`GlassSurface` (`src/app/embed/werkstatt-finder/_components/GlassSurface.tsx`), das `gruende`-Chip-Muster, das `openSvPopup`-Render-Muster.
- **UI-Strings:** Deutsch mit echten Umlauten (ä/ö/ü/ß).
- **Server-Actions:** Result-Object `{ ok, error? }`, kein throw (n/a hier — keine neue Action).
- **Ratchets:** `WerkstattProfileInhalt` spiegelt die Klassen von `SvProfileInhalt` (die passieren token-audit/component-set — Chips sind `<span>`, kein handrolled Button/Card). Keine neuen raw-Status-Scales/Akzente/Default-Radii.
- **TDD, häufige Commits.** Nach jedem PR Regel-4-Prod-Smoke (Task 5).
- **Branch:** `kitta/werkstatt-embed-profil` (off `origin/staging`, bereits angelegt).

---

## File Structure

- **Create** `src/components/werkstatt/finder/WerkstattProfileInhalt.tsx` — reiner Profil-Inhalt (Anzeige) + der `WerkstattProfilData`-Typ. Geteilt.
- **Create** `src/components/werkstatt/finder/__tests__/WerkstattProfileInhalt.test.tsx` — Render-Tests (graceful degradation).
- **Modify** `src/components/werkstatt/finder/WerkstattFinder.tsx` — Row-Typ um `google_rating?`/`google_review_count?` erweitern; `GoogleBewertungBadge` rendern wenn vorhanden.
- **Modify** `src/app/werkstatt-empfehlung/[token]/actions.ts` — `WERKSTATT_COLS` um `google_rating,google_review_count`; in den `werkstaetten`-Map durchreichen.
- **Create** `src/app/embed/werkstatt-finder/_components/WerkstattProfilePopup.tsx` — GlassSurface-Shell + `WerkstattProfileInhalt` (embed-lokal, wie `SvProfilePopup`).
- **Modify** `src/app/embed/werkstatt-finder/_components/WerkstattFinderShell.tsx` — Map-Pin-Popup von `setText(name)` auf React-`WerkstattProfilePopup` (`createRoot`+`setDOMContent`) + `.wf-finder-popup`-CSS + Cleanup.

---

### Task 1: `WerkstattProfileInhalt` — reiner Profil-Inhalt

**Files:**
- Create: `src/components/werkstatt/finder/WerkstattProfileInhalt.tsx`
- Test: `src/components/werkstatt/finder/__tests__/WerkstattProfileInhalt.test.tsx`

**Interfaces:**
- Produces: `export type WerkstattProfilData = { name: string; ort: string | null; verifiziert: boolean; googleRating: number | null; googleAnzahl: number | null; gruende: MatchGrund[]; distanzKm?: number; fahrzeugGruppen?: string[] | null }` und `export function WerkstattProfileInhalt(props: { data: WerkstattProfilData; gross?: boolean; zeigeFahrzeugGruppen?: boolean; zeigeDistanz?: boolean }): JSX.Element`.
- Consumes: `GoogleBewertungBadge` (Props `{ durchschnitt: number|null; anzahl: number|null; size?: 'sm' }`), `MatchGrund` (`{ typ: 'marke'|'gewerk'|'klasse'|'distanz'|'trust'; text: string }`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/werkstatt/finder/__tests__/WerkstattProfileInhalt.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WerkstattProfileInhalt, type WerkstattProfilData } from '../WerkstattProfileInhalt'

const base: WerkstattProfilData = {
  name: 'Autohaus Nord', ort: 'Kiel', verifiziert: true,
  googleRating: 4.6, googleAnzahl: 82,
  gruende: [{ typ: 'marke', text: 'BMW-Vertragswerkstatt' }, { typ: 'gewerk', text: 'Repariert Karosserie' }, { typ: 'distanz', text: '3 km' }],
  distanzKm: 3.4, fahrzeugGruppen: ['pkw', 'transporter'],
}

describe('WerkstattProfileInhalt', () => {
  it('zeigt Firmenname, Region und Verifiziert-Marker', () => {
    render(<WerkstattProfileInhalt data={base} />)
    expect(screen.getByText('Autohaus Nord')).toBeInTheDocument()
    expect(screen.getByText(/Werkstatt in Kiel/)).toBeInTheDocument()
    expect(screen.getByText(/Verifizierter Claimondo-Partner/)).toBeInTheDocument()
  })

  it('zeigt Marken-/Gewerke-Chips, aber NICHT den distanz-Grund als Chip', () => {
    render(<WerkstattProfileInhalt data={base} />)
    expect(screen.getByText('BMW-Vertragswerkstatt')).toBeInTheDocument()
    expect(screen.getByText('Repariert Karosserie')).toBeInTheDocument()
    expect(screen.queryByText('3 km')).not.toBeInTheDocument()
  })

  it('graceful: kein Rating -> kein Google-Badge; kein Ort -> "Ihrer Nähe"; nicht verifiziert -> kein Marker', () => {
    render(<WerkstattProfileInhalt data={{ ...base, name: 'Freie Werkstatt X', ort: null, verifiziert: false, googleRating: null, googleAnzahl: null }} />)
    expect(screen.getByText(/Werkstatt in Ihrer Nähe/)).toBeInTheDocument()
    expect(screen.queryByText(/bei Google/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Verifizierter Claimondo-Partner/)).not.toBeInTheDocument()
  })

  it('Fahrzeug-Gruppen + Distanz nur bei aktiviertem Flag', () => {
    const { rerender } = render(<WerkstattProfileInhalt data={base} />)
    expect(screen.queryByText('Transporter')).not.toBeInTheDocument()
    rerender(<WerkstattProfileInhalt data={base} zeigeFahrzeugGruppen zeigeDistanz />)
    expect(screen.getByText('Transporter')).toBeInTheDocument()
    expect(screen.getByText(/3,4 km entfernt/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/werkstatt/finder/__tests__/WerkstattProfileInhalt.test.tsx`
Expected: FAIL — "Cannot find module '../WerkstattProfileInhalt'".

- [ ] **Step 3: Write the component**

```tsx
// src/components/werkstatt/finder/WerkstattProfileInhalt.tsx
'use client'

// Geteilter Werkstatt-Profil-Inhalt (ohne Surface) — analog SvProfileInhalt, abgespeckt.
// Fuers Embed-Map-Pin-Popup (voll) + wiederverwendbar. Reine Anzeige, keine Logik.
// Named (Werkstatt-Firmenname). KEIN Rang/Credentials/Einsatzgebiet/Schadenarten/Bio.

import { ShieldCheck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import type { MatchGrund } from '@/lib/werkstatt/matching/rank-vorschlaege'

export type WerkstattProfilData = {
  name: string
  ort: string | null
  verifiziert: boolean
  googleRating: number | null
  googleAnzahl: number | null
  gruende: MatchGrund[]
  distanzKm?: number
  fahrzeugGruppen?: string[] | null
}

const GRUPPE_LABEL: Record<string, string> = {
  pkw: 'PKW', transporter: 'Transporter', lkw: 'LKW', wohnmobil: 'Wohnmobil', motorrad: 'Motorrad',
}

// Chip exakt im Marketing-Stil (wie SvProfileInhalt.Chip) — <span>, kein handrolled Button/Card.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-claimondo-border bg-claimondo-bg px-2.5 py-0.5 text-[0.75rem] font-semibold text-claimondo-shield">
      {children}
    </span>
  )
}

export function WerkstattProfileInhalt({
  data,
  gross = false,
  zeigeFahrzeugGruppen = false,
  zeigeDistanz = false,
}: {
  data: WerkstattProfilData
  gross?: boolean
  zeigeFahrzeugGruppen?: boolean
  zeigeDistanz?: boolean
}) {
  const ort = data.ort ?? 'Ihrer Nähe'
  const hatBewertung = data.googleRating != null && data.googleAnzahl != null
  // marke + gewerk als Chips; distanz/trust raus (stehen anderswo — genau wie WerkstattFinder-Card).
  const grundChips = data.gruende.filter((g) => g.typ === 'marke' || g.typ === 'gewerk')
  const gruppen = (data.fahrzeugGruppen ?? []).map((g) => GRUPPE_LABEL[g] ?? g)
  const zeigeDistanzZeile = zeigeDistanz && data.distanzKm != null && Number.isFinite(data.distanzKm)

  return (
    <div className="flex flex-col gap-2.5">
      {/* Kopf: Icon + Firmenname + Region + Verifiziert-Marker */}
      <div className="flex items-center gap-3">
        <div className={cn('flex flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-white', gross ? 'h-14 w-14' : 'h-10 w-10')}>
          <Wrench className={gross ? 'h-6 w-6' : 'h-5 w-5'} />
        </div>
        <div className="min-w-0">
          <div className={cn('font-bold leading-tight text-claimondo-navy', gross ? 'text-body' : 'text-body-sm')}>{data.name}</div>
          <div className="text-[0.8125rem] font-medium text-claimondo-shield/80">Werkstatt in {ort}</div>
          {data.verifiziert && (
            <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Verifizierter Claimondo-Partner
            </div>
          )}
        </div>
      </div>

      {/* Bewertung (+ optional Distanz) */}
      {(hatBewertung || zeigeDistanzZeile) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {hatBewertung && <GoogleBewertungBadge durchschnitt={data.googleRating} anzahl={data.googleAnzahl} size="sm" />}
          {zeigeDistanzZeile && (
            <span className="text-[0.8125rem] font-medium text-claimondo-shield/80">
              {data.distanzKm!.toFixed(1).replace('.', ',')} km entfernt
            </span>
          )}
        </div>
      )}

      {/* Marken- + Gewerke-Chips */}
      {grundChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {grundChips.map((g, i) => (
            <Chip key={`${g.typ}-${i}`}>{g.text}</Chip>
          ))}
        </div>
      )}

      {/* Optional: Fahrzeug-Gruppen */}
      {zeigeFahrzeugGruppen && gruppen.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/60">Bedient</div>
          <div className="flex flex-wrap gap-2">
            {gruppen.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/werkstatt/finder/__tests__/WerkstattProfileInhalt.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/components/werkstatt/finder/WerkstattProfileInhalt.tsx src/components/werkstatt/finder/__tests__/WerkstattProfileInhalt.test.tsx
git commit -m "feat(werkstatt-profil): geteiltes WerkstattProfileInhalt (abgespeckt, named)"
```

---

### Task 2: `WerkstattFinder`-Card um Google-Bewertung anreichern

**Files:**
- Modify: `src/components/werkstatt/finder/WerkstattFinder.tsx`

**Interfaces:**
- Consumes: `GoogleBewertungBadge`, der bestehende `werkstaetten`-Row-Typ.
- Produces: der Row-Typ trägt optional `google_rating?: number | null; google_review_count?: number | null`; die Card rendert die Bewertung wenn vorhanden.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/werkstatt/finder/__tests__/WerkstattFinder.google.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WerkstattFinder } from '../WerkstattFinder'

const row = (over: Record<string, unknown>) => ({
  id: 'w1', name: 'Autohaus Nord', adresse_strasse: null, adresse_plz: '24103', adresse_ort: 'Kiel',
  telefon: null, lat: 54.3, lng: 10.1, status: 'aktiv', faehigkeiten: null, verifiziert: true,
  distanz_km: 3.4, passt: true, ...over,
})

describe('WerkstattFinder — Google-Bewertung', () => {
  it('zeigt das Google-Badge wenn google_rating gesetzt ist', () => {
    render(<WerkstattFinder werkstaetten={[row({ google_rating: 4.6, google_review_count: 82 }) as never]} onSelect={() => {}} />)
    expect(screen.getByText(/4,6/)).toBeInTheDocument()
  })
  it('kein Badge ohne Rating', () => {
    render(<WerkstattFinder werkstaetten={[row({ google_rating: null, google_review_count: null }) as never]} onSelect={() => {}} />)
    expect(screen.queryByText(/bei Google/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/werkstatt/finder/__tests__/WerkstattFinder.google.test.tsx`
Expected: FAIL — kein „4,6" im DOM (Badge noch nicht gerendert).

- [ ] **Step 3: Add the badge to the card**

In `src/components/werkstatt/finder/WerkstattFinder.tsx`:

1. Import ergänzen (oben bei den Imports):
```tsx
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
```

2. Row-Typ im `Props.werkstaetten` erweitern — die Zeile
```tsx
  werkstaetten: (WerkstattFinderRow & { fit?: Fit; gruende?: MatchGrund[] })[]
```
ersetzen durch:
```tsx
  werkstaetten: (WerkstattFinderRow & {
    fit?: Fit
    gruende?: MatchGrund[]
    google_rating?: number | null
    google_review_count?: number | null
  })[]
```

3. Im Card-JSX, direkt NACH dem Block der `grundChips`/`fitChip` (vor `{adresse ? (` ) die Bewertung einsetzen:
```tsx
                    {w.google_rating != null && w.google_review_count != null ? (
                      <div className="mt-1.5">
                        <GoogleBewertungBadge durchschnitt={w.google_rating} anzahl={w.google_review_count} size="sm" />
                      </div>
                    ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/werkstatt/finder/__tests__/WerkstattFinder.google.test.tsx`
Expected: PASS (2/2). Danach die bestehende WerkstattFinder-Suite gegenchecken: `npx vitest run src/components/werkstatt` (kein Regress).

- [ ] **Step 5: Commit**

```bash
git add src/components/werkstatt/finder/WerkstattFinder.tsx src/components/werkstatt/finder/__tests__/WerkstattFinder.google.test.tsx
git commit -m "feat(werkstatt-profil): Google-Bewertung in der WerkstattFinder-Card"
```

---

### Task 3: Empfehlung-Loader `WERKSTATT_COLS` um google_rating ergänzen

**Files:**
- Modify: `src/app/werkstatt-empfehlung/[token]/actions.ts`

**Interfaces:**
- Consumes: bestehender `getWerkstattEmpfehlungByToken`-Loader, `WERKSTATT_COLS`, der `EmpfehlungWerkstatt`-Map.
- Produces: jede `EmpfehlungWerkstatt` trägt `google_rating`/`google_review_count` (die Empfehlung-Card zeigt damit das Badge aus Task 2).

- [ ] **Step 1: Schema-Fakt verifizieren (kein Rate-Risiko)**

Run (MCP `execute_sql`, READ, prod `paizkjajbuxxksdoycev`):
```sql
select count(*) filter (where google_rating is not null) as mit_rating,
       count(*) as aktive
from public.werkstaetten where status='aktiv';
```
Expected: `google_rating` ist eine reale Spalte, ≥1 aktive Werkstatt hat einen Wert (bestätigt, dass das Feld existiert + befüllt ist).

- [ ] **Step 2: `WERKSTATT_COLS` erweitern**

Die Konstante
```tsx
const WERKSTATT_COLS =
  'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert'
```
ersetzen durch:
```tsx
const WERKSTATT_COLS =
  'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert,google_rating,google_review_count'
```

- [ ] **Step 3: Felder in die `werkstaetten`-Map durchreichen**

Im `wById`-Typ (die `Map`-Konstruktion) und im `werkstaetten`-`.map(...)` die zwei Felder mitnehmen. Konkret die Objekt-Literal-Rückgabe im `.map((e) => { … return { …w, verifiziert: …, distanz_km: …, passt: true, gruende: … } })` um:
```tsx
        google_rating: (w as { google_rating?: number | null }).google_rating ?? null,
        google_review_count: (w as { google_review_count?: number | null }).google_review_count ?? null,
```
erweitern, und den `EmpfehlungWerkstatt`-Typ (`export type EmpfehlungWerkstatt = WerkstattFinderRow & { gruende: MatchGrund[] }`) um:
```tsx
export type EmpfehlungWerkstatt = WerkstattFinderRow & {
  gruende: MatchGrund[]
  google_rating?: number | null
  google_review_count?: number | null
}
```

- [ ] **Step 4: tsc grün**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0. (Der `WerkstattEmpfehlungClient` reicht `data.werkstaetten` an `WerkstattFinder` — die neuen optionalen Felder fließen ohne Client-Change durch und triggern das Badge aus Task 2.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/werkstatt-empfehlung/[token]/actions.ts"
git commit -m "feat(werkstatt-profil): Empfehlung-Loader holt google_rating (Card-Badge)"
```

---

### Task 4: Embed-Map-Pin-Popup → React-`WerkstattProfilePopup`

**Files:**
- Create: `src/app/embed/werkstatt-finder/_components/WerkstattProfilePopup.tsx`
- Modify: `src/app/embed/werkstatt-finder/_components/WerkstattFinderShell.tsx`

**Interfaces:**
- Consumes: `WerkstattProfileInhalt` + `WerkstattProfilData` (Task 1), die Embed-`GlassSurface`, `WerkstattVorschlag`, `createRoot` (`react-dom/client`).
- Produces: `export function WerkstattProfilePopup({ w }: { w: WerkstattVorschlag }): JSX.Element`; `WerkstattFinderShell` öffnet es via `setDOMContent` beim Pin-Klick.

- [ ] **Step 1: Write the failing test (Popup-Wrapper rendert das Profil)**

```tsx
// src/app/embed/werkstatt-finder/_components/__tests__/WerkstattProfilePopup.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WerkstattProfilePopup } from '../WerkstattProfilePopup'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

const w = {
  id: 'w1', name: 'Autohaus Nord', adresse_strasse: null, adresse_plz: '24103', adresse_ort: 'Kiel',
  telefon: null, lat: 54.3, lng: 10.1, status: 'aktiv', faehigkeiten: ['karosserie'], verifiziert: true,
  marken: ['BMW'], ist_freie_werkstatt: null, fahrzeug_gruppen: ['pkw'], google_rating: 4.6, google_review_count: 82,
  distanz_km: 3.4, markenMatch: 'marke', gewerkeFit: 'passt', gruppenFit: 'passt', passt: true,
  gruende: [{ typ: 'marke', text: 'BMW-Vertragswerkstatt' }],
} as unknown as WerkstattVorschlag

describe('WerkstattProfilePopup', () => {
  it('rendert Firmenname + Marken-Chip + Bewertung', () => {
    render(<WerkstattProfilePopup w={w} />)
    expect(screen.getByText('Autohaus Nord')).toBeInTheDocument()
    expect(screen.getByText('BMW-Vertragswerkstatt')).toBeInTheDocument()
    expect(screen.getByText(/4,6/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/WerkstattProfilePopup.test.tsx`
Expected: FAIL — Modul `../WerkstattProfilePopup` fehlt.

- [ ] **Step 3: Write `WerkstattProfilePopup`**

```tsx
// src/app/embed/werkstatt-finder/_components/WerkstattProfilePopup.tsx
'use client'

// Embed-Map-Pin-Profil: GlassSurface-Shell (wie SvProfilePopup) + geteiltes WerkstattProfileInhalt.
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { WerkstattProfileInhalt, type WerkstattProfilData } from '@/components/werkstatt/finder/WerkstattProfileInhalt'
import { GlassSurface } from './GlassSurface'

function toProfil(w: WerkstattVorschlag): WerkstattProfilData {
  return {
    name: w.name,
    ort: w.adresse_ort ?? null,
    verifiziert: w.verifiziert === true,
    googleRating: w.google_rating ?? null,
    googleAnzahl: w.google_review_count ?? null,
    gruende: w.gruende,
    distanzKm: w.distanz_km,
    fahrzeugGruppen: w.fahrzeug_gruppen,
  }
}

export function WerkstattProfilePopup({ w }: { w: WerkstattVorschlag }) {
  return (
    <GlassSurface className="min-w-[260px] max-w-[330px] p-4">
      <WerkstattProfileInhalt data={toProfil(w)} gross zeigeDistanz zeigeFahrzeugGruppen />
    </GlassSurface>
  )
}
```

Falls `GlassSurface` einen anderen Prop-Namen als `className` erwartet: `src/app/embed/werkstatt-finder/_components/GlassSurface.tsx` lesen und angleichen (Task-Interface: eine Glass-Card-Shell, die `children` rendert).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/WerkstattProfilePopup.test.tsx`
Expected: PASS.

- [ ] **Step 5: `WerkstattFinderShell` verdrahten**

In `src/app/embed/werkstatt-finder/_components/WerkstattFinderShell.tsx`:

1. Imports ergänzen:
```tsx
import { createRoot, type Root } from 'react-dom/client'
import type { Popup as MapboxPopup } from 'mapbox-gl'
import { WerkstattProfilePopup } from './WerkstattProfilePopup'
```

2. Refs ergänzen (neben den bestehenden Refs in der Komponente):
```tsx
  const popupRef = useRef<MapboxPopup | null>(null)
  const popupRootRef = useRef<Root | null>(null)
```

3. Im Marker-Bau-`useEffect` (`apply`), den Popup-Teil ändern. Die Zeile
```tsx
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(w.name))
```
ENTFERNEN, und im Marker-`click`-Handler zusätzlich das React-Popup öffnen — den bestehenden Listener
```tsx
        el.addEventListener('click', () => onSelectPin(w.id))
```
ersetzen durch:
```tsx
        el.addEventListener('click', () => {
          onSelectPin(w.id)
          openWerkstattPopup(w)
        })
```

4. Innerhalb desselben `useEffect` (vor `apply`) die Popup-Funktion definieren (Muster von `FinderMap.openSvPopup` — Single-Popup, createRoot/setDOMContent, Cleanup):
```tsx
    const openWerkstattPopup = (w: WerkstattVorschlag) => {
      if (w.lat == null || w.lng == null) return
      popupRef.current?.remove()
      popupRootRef.current?.unmount()
      const container = document.createElement('div')
      const root = createRoot(container)
      root.render(<WerkstattProfilePopup w={w} />)
      const popup = new mapboxgl.Popup({ offset: 22, closeButton: true, maxWidth: '330px', className: 'wf-finder-popup' })
        .setLngLat([w.lng, w.lat])
        .setDOMContent(container)
        .addTo(map)
      popup.on('close', () => {
        root.unmount()
        if (popupRef.current === popup) popupRef.current = null
        if (popupRootRef.current === root) popupRootRef.current = null
      })
      popupRef.current = popup
      popupRootRef.current = root
    }
```

5. Im Cleanup des Karten-Init-`useEffect` (der `return () => { map.remove() … }`) vor `map.remove()` ergänzen:
```tsx
      popupRootRef.current?.unmount()
      popupRef.current?.remove()
```

6. Im JSX (im äußeren `<div className="relative w-full">`) den Glass-Popup-Style-Block ergänzen (transparent stellen, damit die GlassSurface die Oberfläche ist — gespiegelt von `FinderMap`s `.sv-finder-popup`):
```tsx
      <style>{`
        .wf-finder-popup .mapboxgl-popup-content { background: transparent; padding: 0; box-shadow: none; }
        .wf-finder-popup .mapboxgl-popup-tip { display: none; }
        .wf-finder-popup.mapboxgl-popup { z-index: 12; }
        .wf-finder-popup .mapboxgl-popup-close-button {
          top: 10px; right: 10px; width: 24px; height: 24px; display: flex; align-items: center;
          justify-content: center; border-radius: 9999px; color: var(--claimondo-navy, #0D1B3E);
          font-size: 16px; line-height: 1; z-index: 3;
        }
      `}</style>
```

- [ ] **Step 6: tsc + Build (Embed-Route = Client-Component-Änderung)**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → exit 0.
Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → REAL_EXIT=0, Route `/embed/werkstatt-finder` im Manifest. (Build weil Client-Component in einer Route; Next-15-Validator.)

- [ ] **Step 7: Ratchets + volle Werkstatt-Suite**

Run: `npx vitest run src/components/werkstatt src/app/embed/werkstatt-finder` → grün.
Run: `npm run --silent check:token-audit && npm run --silent check:component-set && npm run --silent check:use-server-exports` → jeweils exit 0 (die Chips sind `<span>`, keine handrolled Buttons/Cards; keine raw-hex/Status-Scales).

- [ ] **Step 8: Commit**

```bash
git add src/app/embed/werkstatt-finder/_components/WerkstattProfilePopup.tsx src/app/embed/werkstatt-finder/_components/__tests__/WerkstattProfilePopup.test.tsx src/app/embed/werkstatt-finder/_components/WerkstattFinderShell.tsx
git commit -m "feat(werkstatt-profil): Embed-Map-Pin zeigt das Werkstatt-Profil (GlassSurface-Popup)"
```

---

### Task 5: PR + Regel-4-Prod-Smoke

**Files:** keine (Verifikation).

- [ ] **Step 1: Push + PR gegen staging**

```bash
git push -u origin kitta/werkstatt-embed-profil
gh pr create --repo aaroncmdo/cmndo --base staging --head kitta/werkstatt-embed-profil \
  --title "feat(werkstatt-profil): Werkstatt-Profil in Empfehlung-Card + Embed-Map-Pin" \
  --body "Geteiltes WerkstattProfileInhalt (analog SvProfileInhalt, abgespeckt, named). Card: +Google-Badge (alle WerkstattFinder-Consumer, additiv/benigne). Embed-Map-Pin: setText(name) -> React-Profil-Popup (GlassSurface). Loader-Fix: Empfehlung WERKSTATT_COLS +google_rating. Kein DB-/Ranking-Change. Spec: docs/superpowers/specs/2026-07-22-werkstatt-embed-profil-design.md"
```

- [ ] **Step 2: Nach staging→main-Deploy — Regel-4-Prod-Smoke**

Wegwerf-Werkstatt seeden (isoliert, finder-sichtbar): `email='…@….invalid'` (nicht zustellbar, passiert `nurEchte`), `status='aktiv'`, `verifiziert=true`, `google_rating=4.7`, `google_review_count=90`, `marken=['BMW']`, Nordfriesland-Koords (54.88/8.35). Dann per Playwright gegen `https://app.claimondo.de`:

- **(a) Empfehlung-Card:** Batch auf einen Test-Claim seeden (Muster `scratchpad/drive-km.cjs`) → `/werkstatt-empfehlung/<token>` → „weitere anzeigen" → die Werkstatt-Card zeigt **das Google-Badge** (`★ 4,7 …`).
- **(b) Embed-Map-Pin:** `/embed/werkstatt-finder?plz=25924` laden → Pin klicken → **Profil-Popup** erscheint mit Firmenname + „✓ Verifizierter Claimondo-Partner" + Google-Badge + „BMW-Vertragswerkstatt"-Chip.

Cleanup: Werkstatt + Konto + Batch/Claim löschen, **0 leftover** verifizieren. Ergebnis im PR + Marker dokumentieren.

- [ ] **Step 3: Marker**

`COORDINATION-werkstatt-embed-profil.md` schreiben (Feature geliefert + Smoke-Ergebnis), MEMORY.md-Index-Zeile ergänzen (falls Kollisions-Guard frei).

---

## Self-Review

**Spec coverage:** ✅ WerkstattProfileInhalt (Task 1) · Card-Badge (Task 2) · Loader-Col (Task 3) · Embed-Popup (Task 4) · Regel-4-Smoke (Task 5). Feld-Map (name/verifiziert/google/marken/gewerke) in Task 1. „Abgespeckt" = keine Rang/Credentials/Schadenarten/Bio (Task 1 rendert sie nicht). Named = Firmenname (Task 1). Kein DB-Change (Task 3 nur SELECT-Cols). Fahrzeug-Gruppen/Distanz = Popup-Flags (Task 1 + Task 4 `zeige*`).

**Placeholder scan:** kein TBD/TODO; alle Code-Steps enthalten vollständigen Code + exakte Pfade/Commands.

**Type consistency:** `WerkstattProfilData` (Task 1) = exakt konsumiert in `WerkstattProfilePopup.toProfil` (Task 4). `WerkstattProfileInhalt`-Props (`data`/`gross`/`zeigeFahrzeugGruppen`/`zeigeDistanz`) konsistent Task 1↔4. `google_rating`/`google_review_count` als optionale Felder konsistent Task 2 (Card-Row) ↔ Task 3 (EmpfehlungWerkstatt) ↔ `WerkstattVorschlag` (Bestand).
