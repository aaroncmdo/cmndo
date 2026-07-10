# SV Header → Top-Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PageHeader` aus allen 24 SV-Seiten entfernen; Seitentitel + primäre Actions in eine Top-Bar der `GutachterShell` heben (Desktop + Mobile-Capsule).

**Architecture:** Hybrid-Wiring. Ein `SvPageChromeProvider` (Context) in der `GutachterShell` hält `{title, actions}`. Statische Titel liefert eine Pathname-Map (`matchSvTitle`, instant, kein Nav-Flash). Dynamische Titel + Actions melden Seiten über den Client-Hook `useSvPageChrome` bzw. den server-tauglichen `<SvPageChrome>`-Helper. Desktop-Bar + Mobile-Header werden als Komponenten **innerhalb** des Providers gerendert (nur so lesen sie den Context — die Inline-JSX der `GutachterShell` ist der Provider-Parent und kann ihn nicht konsumieren).

**Tech Stack:** Next.js 15 App Router (RSC + 'use client'), React Context, TypeScript, Tailwind (Design-Tokens), Vitest (nur reine Logik).

## Global Constraints

- **Kein `layout.tsx`-Edit** — Provider lebt in `GutachterShell` (Kollisionsschutz ggü. 3 offenen `layout.tsx`-Branches).
- **Branch** `kitta/sv-header-topbar`, gestackt auf `kitta/sv-profil-rebuild` (#3996). Nicht auf `main`/`staging` pushen außer via PR.
- **Umlaute** in allen UI-Strings (echte `ä/ö/ü/ß`).
- **`PageHeader` NICHT löschen** — andere Portale (admin/dispatch/kunde/kanzlei) nutzen die Shared-Component weiter; nur die SV-Consumer entfernen.
- **Design-Tokens**: `text-[var(--brand-primary,#0D1B3E)]` für den Titel (wie `PageHeader useBranding`), `rounded-ios-*`, keine raw Hex/Status-Scales. Keine neuen handgerollten Buttons (component-set-Ratchet) — Actions sind bestehende `<Link>`/Primitives aus den Seiten.
- **Testing-Realität dieses Repos**: Kein React-Component-Test-Harness. Reine Logik (`page-titles.ts`) → Vitest. Komponenten/Shell → `tsc --noEmit`-Checkpoint pro Task (8GB-Heap: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`; erwartet: 0 Fehler in `src/app/gutachter`, die ~17 env-only TS2307 aus borrowed node_modules sind Vorbestand). End-to-End → Playwright `test-sv` in Task 10.
- **Commit pro Task.** Commit-Body mit 7-Punkt-Audit (AGENTS.md).

---

### Task 1: Pathname-Titel-Map (`page-titles.ts`)

**Files:**
- Create: `src/app/gutachter/_shell/page-titles.ts`
- Test: `src/app/gutachter/_shell/page-titles.test.ts`

**Interfaces:**
- Produces: `SV_PAGE_TITLES: Array<{prefix: string; title: string}>`; `matchSvTitle(pathname: string): string | null` (längster passender Prefix gewinnt; Segment-Grenze).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/gutachter/_shell/page-titles.test.ts
import { describe, it, expect } from 'vitest'
import { matchSvTitle } from './page-titles'

describe('matchSvTitle', () => {
  it('matcht exakte Top-Level-Route', () => {
    expect(matchSvTitle('/gutachter/kalender')).toBe('Kalender')
  })
  it('matcht Sub-Route auf ihren Prefix', () => {
    expect(matchSvTitle('/gutachter/faelle/123')).toBe('Meine Fälle')
  })
  it('längster Prefix gewinnt (einstellungen/verfuegbarkeit vor einstellungen)', () => {
    expect(matchSvTitle('/gutachter/einstellungen/verfuegbarkeit')).toBe('Verfügbarkeit')
    expect(matchSvTitle('/gutachter/einstellungen')).toBe('Einstellungen')
  })
  it('kein falscher Teil-Segment-Match', () => {
    // '/gutachter/fael' darf NICHT 'Meine Fälle' matchen
    expect(matchSvTitle('/gutachter/fael')).toBeNull()
  })
  it('unbekannte Route -> null', () => {
    expect(matchSvTitle('/gutachter/voll-unbekannt')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/gutachter/_shell/page-titles.test.ts`
Expected: FAIL (`matchSvTitle` not found / module missing).

- [ ] **Step 3: Write the implementation**

```ts
// src/app/gutachter/_shell/page-titles.ts
// Fallback-Titel je SV-Route. Statische Seiten brauchen NUR ihren PageHeader
// raus — der Titel kommt hierher. Dynamische Titel/Actions überschreiben via
// useSvPageChrome. Längster passender Prefix gewinnt (Segment-Grenze).
export const SV_PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/gutachter/einstellungen/verfuegbarkeit', title: 'Verfügbarkeit' },
  { prefix: '/gutachter/einstellungen/kalender', title: 'Kalender' },
  { prefix: '/gutachter/einstellungen/embed', title: 'Embed-Sites' },
  { prefix: '/gutachter/einstellungen', title: 'Einstellungen' },
  { prefix: '/gutachter/heute', title: 'Heute' },
  { prefix: '/gutachter/auftraege', title: 'Meine Aufträge' },
  { prefix: '/gutachter/faelle', title: 'Meine Fälle' },
  { prefix: '/gutachter/kalender', title: 'Kalender' },
  { prefix: '/gutachter/netzwerk', title: 'Netzwerk' },
  { prefix: '/gutachter/abrechnung', title: 'Abrechnung' },
  { prefix: '/gutachter/leadpreise', title: 'Lead-Preis-Tabelle' },
  { prefix: '/gutachter/vertrag', title: 'Vertrag' },
  { prefix: '/gutachter/statistiken', title: 'Statistiken' },
  { prefix: '/gutachter/reklamationen', title: 'Reklamationen' },
  { prefix: '/gutachter/verifizierung', title: 'Verifizierung' },
  { prefix: '/gutachter/team', title: 'Team' },
  { prefix: '/gutachter/community', title: 'Community' },
  { prefix: '/gutachter/tasks', title: 'Meine Tasks' },
  { prefix: '/gutachter/gebiet', title: 'Mein Gebiet' },
  { prefix: '/gutachter/profil', title: 'Mein Profil' },
  { prefix: '/gutachter', title: 'Heute' }, // Index
]

export function matchSvTitle(pathname: string): string | null {
  let best: { prefix: string; title: string } | null = null
  for (const e of SV_PAGE_TITLES) {
    const isMatch = pathname === e.prefix || pathname.startsWith(e.prefix + '/')
    if (isMatch && (!best || e.prefix.length > best.prefix.length)) best = e
  }
  return best?.title ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/gutachter/_shell/page-titles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/gutachter/_shell/page-titles.ts src/app/gutachter/_shell/page-titles.test.ts
git commit -m "feat(sv): Pathname-Titel-Map fuer SV-Top-Bar"
```

---

### Task 2: Chrome-Context (`page-chrome-context.tsx`)

**Files:**
- Create: `src/app/gutachter/_shell/page-chrome-context.tsx`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `<SvPageChromeProvider>{children}</SvPageChromeProvider>`
  - `useSvPageChrome({ title?: string; actions?: React.ReactNode }): void` — Client-Hook, setzt Chrome per Effect, resettet in Cleanup.
  - `useSvPageChromeState(): { title: string | null; actions: React.ReactNode | null }` — liest Chrome (für die Bars).
- **Zwei-Context-Split** (kritisch gegen Render-Loop): Setter-Context ist stabil (Seiten, die nur setzen, re-rendern NICHT bei Chrome-Änderung); Value-Context konsumieren nur die Bars.

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/gutachter/_shell/page-chrome-context.tsx
'use client'
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type Chrome = { title: string | null; actions: ReactNode | null }
const ValueCtx = createContext<Chrome>({ title: null, actions: null })
const SetCtx = createContext<(c: Chrome) => void>(() => {})

export function SvPageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>({ title: null, actions: null })
  const set = useCallback((c: Chrome) => setChrome(c), [])
  return (
    <SetCtx.Provider value={set}>
      <ValueCtx.Provider value={chrome}>{children}</ValueCtx.Provider>
    </SetCtx.Provider>
  )
}

/** Liest den aktuellen Chrome-State — NUR die Bars nutzen das. */
export function useSvPageChromeState(): Chrome {
  return useContext(ValueCtx)
}

/**
 * Seiten melden ihren Titel/Actions. Nutzt NUR den stabilen Setter-Context
 * -> die Seite re-rendert nicht, wenn der Chrome-State sich ändert (kein Loop).
 * Cleanup resettet auf null -> nächste Seite ohne Hook fällt auf die Map zurück.
 */
export function useSvPageChrome({ title, actions }: { title?: string; actions?: ReactNode }) {
  const set = useContext(SetCtx)
  const t = title ?? null
  const a = actions ?? null
  useEffect(() => {
    set({ title: t, actions: a })
    return () => set({ title: null, actions: null })
  }, [set, t, a])
}
```

- [ ] **Step 2: tsc-Checkpoint**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep "src/app/gutachter/_shell" || echo "clean"`
Expected: `clean` (keine Fehler in `_shell`).

- [ ] **Step 3: Commit**

```bash
git add src/app/gutachter/_shell/page-chrome-context.tsx
git commit -m "feat(sv): SvPageChrome-Context (Zwei-Context-Split, kein Render-Loop)"
```

---

### Task 3: `<SvPageChrome>`-Helper (server-tauglich)

**Files:**
- Create: `src/app/gutachter/_shell/SvPageChrome.tsx`

**Interfaces:**
- Consumes: `useSvPageChrome` (Task 2).
- Produces: `<SvPageChrome title? actions? />` — Client-Component, rendert `null`. Server-Pages dürfen sie rendern (Actions müssen server-renderbar sein: `<Link>`/reine Markup; für `onClick`-Actions eine eigene Client-Subcomponent als `actions` übergeben).

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/gutachter/_shell/SvPageChrome.tsx
'use client'
import { type ReactNode } from 'react'
import { useSvPageChrome } from './page-chrome-context'

/**
 * Deklarativer Weg für eine Seite, ihren Top-Bar-Titel/-Actions zu setzen.
 * Rendert nichts. Auch aus Server-Components heraus rendernbar (Client-Boundary).
 */
export function SvPageChrome({ title, actions }: { title?: string; actions?: ReactNode }) {
  useSvPageChrome({ title, actions })
  return null
}
```

- [ ] **Step 2: tsc-Checkpoint**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep "src/app/gutachter/_shell" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/app/gutachter/_shell/SvPageChrome.tsx
git commit -m "feat(sv): SvPageChrome-Helper (deklarativer Titel/Actions-Setter)"
```

---

### Task 4: Desktop-Bar (`SvTopBar.tsx`)

**Files:**
- Create: `src/app/gutachter/_shell/SvTopBar.tsx`

**Interfaces:**
- Consumes: `useSvPageChromeState` (Task 2), `matchSvTitle` (Task 1), `WeatherBanner` (`@/components/shared/WeatherBanner`).
- Produces: `<SvTopBar standortLat={number|null} standortLng={number|null} trailingSlot={ReactNode} />`. Rendert Titel-`<h1>` links + Actions + `WeatherBanner` (mit `trailingSlot`) rechts. Nur Desktop (`hidden lg:flex`). Muss **innerhalb** des `SvPageChromeProvider` gerendert werden.

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/gutachter/_shell/SvTopBar.tsx
'use client'
import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import WeatherBanner from '@/components/shared/WeatherBanner'
import { useSvPageChromeState } from './page-chrome-context'
import { matchSvTitle } from './page-titles'

export function SvTopBar({
  standortLat,
  standortLng,
  trailingSlot,
}: {
  standortLat: number | null
  standortLng: number | null
  trailingSlot: ReactNode
}) {
  const pathname = usePathname()
  const chrome = useSvPageChromeState()
  const title = chrome.title ?? matchSvTitle(pathname) ?? ''

  return (
    <div className="hidden lg:flex lg:items-center lg:gap-4 lg:pl-4 lg:pt-4">
      <h1 className="text-lg font-semibold text-[var(--brand-primary,#0D1B3E)] truncate shrink-0">
        {title}
      </h1>
      <div className="flex-1" />
      {chrome.actions ? (
        <div className="flex items-center gap-3 shrink-0">{chrome.actions}</div>
      ) : null}
      <div className="shrink-0">
        <WeatherBanner
          standortLat={standortLat}
          standortLng={standortLng}
          trailingSlot={trailingSlot}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc-Checkpoint** — `... | grep "src/app/gutachter/_shell" || echo "clean"` → `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/app/gutachter/_shell/SvTopBar.tsx
git commit -m "feat(sv): SvTopBar (Desktop-Titel + Actions + WeatherBanner)"
```

---

### Task 5: Mobile-Header (`SvMobileHeader.tsx`)

**Files:**
- Create: `src/app/gutachter/_shell/SvMobileHeader.tsx`

**Interfaces:**
- Consumes: `useSvPageChromeState`, `matchSvTitle`, `UpdatesNav` (`@/components/shared/updates`).
- Produces: `<SvMobileHeader logoUrl useBrand firmenname />`. Auf `/heute`+`/gutachter`: Logo + Glocke. Sonst: Back-Button + Titel + Glocke. Nur Mobile (`lg:hidden fixed`). Innerhalb des Providers.

- [ ] **Step 1: Write the implementation**

```tsx
// src/app/gutachter/_shell/SvMobileHeader.tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeftIcon } from 'lucide-react'
import UpdatesNav from '@/components/shared/updates'
import { useSvPageChromeState } from './page-chrome-context'
import { matchSvTitle } from './page-titles'

export function SvMobileHeader({
  logoUrl,
  useBrand,
  firmenname,
}: {
  logoUrl?: string | null
  useBrand: boolean
  firmenname?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const chrome = useSvPageChromeState()
  const isHome = pathname === '/gutachter' || pathname === '/gutachter/heute'
  const title = chrome.title ?? matchSvTitle(pathname) ?? ''

  return (
    <div
      className="lg:hidden fixed left-3 right-3 z-40 flex items-center justify-between gap-3"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        backgroundColor: 'color-mix(in srgb, var(--brand-sidebar-bg) 55%, transparent)',
        backdropFilter: 'saturate(180%) blur(22px)',
        WebkitBackdropFilter: 'saturate(180%) blur(22px)',
        border: '1px solid color-mix(in srgb, white 22%, transparent)',
        borderRadius: 22,
        padding: '8px 14px',
        color: 'var(--brand-text-on-primary)',
        boxShadow:
          '0 14px 36px color-mix(in srgb, var(--brand-sidebar-bg) 45%, transparent), inset 0 1px 0 color-mix(in srgb, white 25%, transparent)',
      }}
    >
      {isHome ? (
        logoUrl ? (
          <Link href="/gutachter" className="inline-flex items-center justify-center">
            <img
              src={logoUrl}
              alt={useBrand ? (firmenname ? `${firmenname} Logo` : 'Logo') : 'Claimondo Logo'}
              className={`h-6 w-auto max-w-28 object-contain ${useBrand ? '' : 'brightness-0 invert'}`}
            />
          </Link>
        ) : (
          <Link href="/gutachter" className="text-base font-bold tracking-tight" style={{ fontFamily: 'var(--brand-font-heading, inherit)' }}>
            <span className="text-white">Claim</span>
            <span style={{ color: 'var(--brand-sidebar-text, #7BA3CC)' }}>ondo</span>
          </Link>
        )
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => router.back()} aria-label="Zurück" className="shrink-0 -ml-1 p-1">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <span className="font-semibold text-base truncate" style={{ fontFamily: 'var(--brand-font-heading, inherit)' }}>
            {title}
          </span>
        </div>
      )}
      <UpdatesNav variant="dark" />
    </div>
  )
}
```

- [ ] **Step 2: tsc-Checkpoint** — `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/app/gutachter/_shell/SvMobileHeader.tsx
git commit -m "feat(sv): SvMobileHeader (Back + Titel in der Capsule)"
```

---

### Task 6: `GutachterShell` verdrahten

**Files:**
- Modify: `src/app/gutachter/GutachterShell.tsx`

**Interfaces:**
- Consumes: `SvPageChromeProvider`, `SvTopBar`, `SvMobileHeader`.

- [ ] **Step 1: Imports ergänzen** (nach den bestehenden `_components`/shared-Imports, z. B. nach `import WeatherBanner ...`):

```tsx
import { SvPageChromeProvider } from './_shell/page-chrome-context'
import { SvTopBar } from './_shell/SvTopBar'
import { SvMobileHeader } from './_shell/SvMobileHeader'
```

- [ ] **Step 2: Provider um die Content-Spalte legen.** Der `return (<> <div className="h-screen flex ...">` bleibt; die **Content-Spalte** `<div className={`flex-1 flex flex-col min-w-0 h-screen ...`}>` (aktuell ~Zeile 566) wird in den Provider gewickelt. Ersetze die öffnende Zeile der Content-Spalte durch:

```tsx
      <SvPageChromeProvider>
      <div
        className={`flex-1 flex flex-col min-w-0 h-screen ${
          floatingMode ? 'lg:pl-64' : ''
        }`}
      >
```

und die zugehörige schließende `</div>` dieser Spalte (vor dem `#sv-modal-root`-Block, aktuell ~Zeile 686) durch:

```tsx
      </div>
      </SvPageChromeProvider>
```

- [ ] **Step 3: Mobile-Capsule ersetzen.** Den kompletten mobilen Header-Block (`<div className="lg:hidden fixed left-3 right-3 z-40 ...">...</div>`, aktuell ~Zeilen 578–620) ersetzen durch:

```tsx
        <SvMobileHeader logoUrl={logoUrl} useBrand={useBrand} firmenname={firmenname} />
```

- [ ] **Step 4: Desktop-Wetter-Zeile ersetzen.** Den Desktop-Block (`<div className="hidden lg:block lg:pl-4 lg:pt-4"><WeatherBanner ... trailingSlot={<><OutboxBadge/><UpdatesNav variant="dark"/></>} /></div>`, aktuell ~Zeilen 626–637) ersetzen durch:

```tsx
        <SvTopBar
          standortLat={standortLat ?? null}
          standortLng={standortLng ?? null}
          trailingSlot={
            <>
              <OutboxBadge />
              <UpdatesNav variant="dark" />
            </>
          }
        />
```

- [ ] **Step 5: tsc-Checkpoint** — `... | grep "src/app/gutachter/GutachterShell" || echo "clean"` → `clean`. (Falls `WeatherBanner` jetzt nur noch in `SvTopBar` genutzt wird, bleibt der Import in der Shell ggf. ungenutzt → entfernen; ebenso prüfen ob der mobile `Link`/Logo-Zweig noch andere Consumer hat.)

- [ ] **Step 6: Commit**

```bash
git add src/app/gutachter/GutachterShell.tsx
git commit -m "feat(sv): Top-Bar in GutachterShell verdrahtet (Provider + Desktop-Bar + Mobile-Header)"
```

---

### Task 7: Statische Seiten migrieren (nur Map — PageHeader raus)

**Files (PageHeader entfernen; Titel kommt aus der Map):**
- `src/app/gutachter/statistiken/page.tsx`
- `src/app/gutachter/verifizierung/page.tsx`
- `src/app/gutachter/einstellungen/page.tsx`
- `src/app/gutachter/einstellungen/kalender/KalenderEinstellungenClient.tsx`
- `src/app/gutachter/einstellungen/verfuegbarkeit/VerfuegbarkeitClient.tsx`
- `src/app/gutachter/profil/ProfilClient.tsx`
- `src/app/gutachter/leadpreise/page.tsx`
- `src/app/gutachter/faelle/page.tsx` (3 PageHeader-States) + `src/app/gutachter/faelle/FaelleFilterBar.tsx`
- `src/app/gutachter/auftraege/page.tsx` (2 States)
- `src/app/gutachter/reklamationen/ReklamationenClient.tsx`
- `src/app/gutachter/einstellungen/embed/[id]/page.tsx`
- `src/app/gutachter/einstellungen/embed/[id]/tracking-anleitung/page.tsx`

**Muster pro Datei:**
1. `<PageHeader ... />`-Block entfernen (alle Vorkommen in der Datei).
2. Den zugehörigen `import PageHeader from '@/components/shared/PageHeader'` entfernen.
3. Wenn eine Beschreibung echten Wert trägt, als schlichte Zeile in den Seitenkörper übernehmen: leadpreise „Stand: …" (bereits als `<p>` unter dem Header vorhanden → nur PageHeader raus, `<p>` bleibt). Fälle/Aufträge-Count: entfällt (steht redundant zur Liste) oder als kleine Zeile an die FilterTabs.
4. Verwaiste Imports (Icons, die nur der PageHeader nutzte — `FolderIcon`, `BriefcaseIcon`, `TagIcon`, `BarChart3Icon`, …) entfernen.

- [ ] **Step 1** je Datei: PageHeader-Block + Import + verwaiste Icon-Imports entfernen (Muster oben).
- [ ] **Step 2: tsc-Checkpoint** — `... | grep "src/app/gutachter" || echo "clean"` → nur bekannte env-only Fehler, 0 neue in diesen Dateien.
- [ ] **Step 3: Ratchets** — `npm run check:component-set -- --ratchet` (0 neue), `npm run check:knip -- --ratchet` (PageHeader NICHT als unused gemeldet — andere Portale nutzen es weiter).
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(sv): PageHeader aus statischen SV-Seiten raus (Titel via Map)"
```

---

### Task 8: Dynamische-Titel-Seiten migrieren (Hook)

**Files:**
- `src/app/gutachter/community/page.tsx` — Titel `org.name` (dynamisch).
- `src/app/gutachter/team/TeamClient.tsx` — Titel `orgName` (dynamisch).
- Prüfen (pro Datei entscheiden, statisch→Task-7-Muster / dynamisch→hier): `src/app/gutachter/termine/[id]/page.tsx`, `src/app/gutachter/fall/[id]/stellungnahme/StellungnahmeClient.tsx`.

**Muster:**
1. `<PageHeader title={<dynamisch>} ... />` entfernen + PageHeader-Import raus.
2. Server-Page: `import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'` und `<SvPageChrome title={org.name} />` an der Stelle rendern (rendert null). Client-Component (`TeamClient`): stattdessen `import { useSvPageChrome } from '@/app/gutachter/_shell/page-chrome-context'` und `useSvPageChrome({ title: orgName })` oben in der Komponente aufrufen.

Beispiel `community/page.tsx` (Server):

```tsx
import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'
// ...
// statt <PageHeader title={org.name} .../>:
<SvPageChrome title={org.name} />
```

Beispiel `TeamClient.tsx` (Client):

```tsx
import { useSvPageChrome } from '@/app/gutachter/_shell/page-chrome-context'
// oben in der Komponente:
useSvPageChrome({ title: orgName })
// <PageHeader title={orgName} .../> entfernen
```

- [ ] **Step 1** je Datei: PageHeader raus, Hook/Helper mit dynamischem Titel rein.
- [ ] **Step 2: tsc-Checkpoint** → 0 neue Fehler.
- [ ] **Step 3: Commit** `refactor(sv): dynamische SV-Titel via useSvPageChrome`

---

### Task 9: Action-Seiten migrieren (Hook mit `actions`)

**Files (Titel via Map/Hook + Actions in die Bar):**
- `src/app/gutachter/kalender/page.tsx` — Actions = View-Toggle (Kalender/Liste, `<Link>`).
- `src/app/gutachter/abrechnung/page.tsx` — Actions = Lead-Preise-`<Link>`.
- `src/app/gutachter/gebiet/page.tsx` — Actions = View-Tabs (`<Link>`/Buttons); Titel „Mein Gebiet" (Map).
- `src/app/gutachter/einstellungen/embed/page.tsx` — Actions = „Neu"-Button.
- Count-Badges (`tasks`, `einstellungen/embed/anfragen`): PageHeader raus, Count entfällt (description-artig) oder als kleine In-Page-Zeile.

**Muster (Server-Page mit Link-Actions):**
```tsx
import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'
// den bisherigen actions-JSX-Block aus dem PageHeader übernehmen:
<SvPageChrome
  title="Kalender"
  actions={
    <div className="flex gap-1 bg-claimondo-bg rounded-ios-lg p-0.5">
      {/* exakt der bestehende View-Toggle-JSX aus dem alten PageHeader actions={} */}
    </div>
  }
/>
```
Actions sind bestehende `<Link>` → server-renderbar, keine neuen handgerollten Buttons (component-set bleibt grün). Bulky Controls (FilterBar-Suche etc.) NICHT in die Bar — im Seitenkörper lassen.

- [ ] **Step 1** je Datei: PageHeader raus; `<SvPageChrome title actions={…bestehender actions-JSX…} />` rein; PageHeader-Import raus.
- [ ] **Step 2: tsc-Checkpoint** → 0 neue Fehler.
- [ ] **Step 3: Ratchets** — component-set (0 neu), token-audit (0), knip (0 neu).
- [ ] **Step 4: Commit** `refactor(sv): SV-Actions in die Top-Bar (SvPageChrome actions)`

---

### Task 10: A11y-Pass + Voll-Verifikation

**Files:** ggf. kleine Fixes in migrierten Seiten.

- [ ] **Step 1: h1-Eindeutigkeit prüfen.** `grep -rn "<h1" src/app/gutachter` — außer der Bar (`SvTopBar`) darf keine SV-Seite mehr ein eigenes `<h1>` rendern (PageHeader war deren einziges). Verbleibende Seiten-`<h1>` → in `<h2>`/Section-Titel umwandeln, damit die Bar das einzige `<h1>` ist.
- [ ] **Step 2: Voll-tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler in `src/app/gutachter` (nur ~17 env-only TS2307 Vorbestand).
- [ ] **Step 3: Alle Ratchets** — `npm run check:component-set -- --ratchet`, `npm run check:token-audit`, `npm run check:knip -- --ratchet` → alle 0 neu. `PageHeader` darf NICHT als unused file gemeldet werden (andere Portale nutzen es).
- [ ] **Step 4: Playwright `test-sv`** Vorher/Nachher-Sichtprüfung (Login via bestehenden e2e-Harness, TOTP aus env) auf: `/gutachter/kalender` (Action=View-Toggle sichtbar in Bar), `/gutachter/community` (dynamischer Titel), `/gutachter/statistiken` (Map-Titel), `/gutachter/fall/[id]` bzw. eine Detail-Route (Titel), + Mobile-Viewport (Capsule Back+Titel). Screenshots ablegen.
- [ ] **Step 5: Commit** etwaiger Fixes `refactor(sv): a11y h1-Eindeutigkeit + Verifikation Top-Bar`

---

## Nach dem Plan
- Whole-Branch-Review (adversarial) + `finishing-a-development-branch` → PR gegen `staging` (Basis: `kitta/sv-profil-rebuild`, bis #3996 merged; danach Rebase auf staging).
- Koordinations-Marker aktualisieren.
