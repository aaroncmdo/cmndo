# PageHeader Floating-Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Seiten-Header (`PageHeader`) wird portalweit eine weiche, gerundete, helle Floating-Card statt der eckigen `bg-white border-b`-Leiste — an einer Stelle (dem shared `PageHeader`) definiert.

**Architecture:** Eine neue CSS-Utility `.page-header-card` (helles Glas, brand-var-getrieben) wird in den shared `src/components/shared/PageHeader.tsx` gebacken (Card by default für `align="start"`); `bare` und `align="center"` rendern ohne Card; ein `children`-Slot bringt Hub-Tabs/Untertitel in dieselbe Card. Danach werden die ~konkreten eckigen `bg-white border-b`-Wrapper der Consumer entfernt (die Card liefert die Surface) und Auth/verschachtelte Fälle via `bare` ausgenommen.

**Tech Stack:** Next.js 15 (App Router), React, TypeScript, Tailwind (Token-Utilities `rounded-ios-*`, `claimondo-*`, `--brand-*`), Vitest (env=node, `renderToStaticMarkup`).

## Global Constraints

- **Regel 1:** Arbeit nur auf `kitta/pageheader-floating-card` (off `staging`), PR gegen **staging**, nie direkt `main`.
- **Keine DDL / keine Migration.**
- **Umlaute:** alle nutzersichtbaren Strings (falls neu) mit echten `ä/ö/ü/ß`.
- **Token-Audit-safe:** Marken-Hex nur in `globals.css` (CSS-Definition) oder als `var(--brand-*, #fallback)`; **nie** bracket-hex (`bg-[#…]`) oder raw inline-hex in `.tsx` className. Radien nur `rounded-ios-{sm,md,lg,xl}`. Keine **neuen** raw Status-Scales (`emerald/green/red/amber…`) — bestehende nicht anfassen/verschlimmern.
- **Build-Pflicht:** Bei Änderungen an Routen/Layouts/Server-Components immer `npm run build` (nicht nur `tsc`).
- **Vitest:** Env ist global `node`; Tests via `renderToStaticMarkup` + `html.toContain(...)` (siehe `RouteTabBar.test.tsx`). Command: `npx vitest run <pfad>`.
- **Commit:** 7-Punkte-Audit-Block im Commit-Body; enden mit `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/app/globals.css` | `.page-header-card`-Utility (helles Glas, brand-var) | Modify (nach `.glass-bg`) |
| `src/components/shared/PageHeader.tsx` | Card-by-default + `children` + `bare` | Modify |
| `src/components/shared/PageHeader.test.tsx` | Unit-Tests (Card/ bare/ center/ children) | Create |
| `src/app/admin/faelle/(hub)/FaelleHubHeader.tsx` | Hub-Header: Tabs+Untertitel in EINE Card | Modify |
| `src/app/admin/finance/(hub)/page.tsx` | eckige Flex-Band-Leiste raus (worked example A) | Modify |
| `src/app/admin/statistiken/StatistikenClient.tsx` | eckige Sticky-`<header>`-Leiste raus (worked example B) | Modify |
| *(Sweep)* diverse Consumer mit `bg-white border-b`-Header | Leiste raus per Rezept | Modify |
| *(Bare)* `src/app/login/**`, verschachtelte Consumer | `bare` setzen | Modify |

---

### Task 1: `PageHeader` → Floating-Card by default (+ `.page-header-card`, `children`, `bare`)

**Files:**
- Modify: `src/app/globals.css` (nach dem `.glass-bg`-Block, ~Zeile 640)
- Modify: `src/components/shared/PageHeader.tsx`
- Test: `src/components/shared/PageHeader.test.tsx` (Create)

**Interfaces:**
- Produces: `PageHeader` mit neuen Props `children?: ReactNode` (in der Card unter der Titelzeile) und `bare?: boolean` (rendert ohne Card; `align="center"` impliziert bare). Default (`align="start"`, nicht bare) = Card mit CSS-Klasse `page-header-card`.

- [ ] **Step 1: Failing test schreiben** — `src/components/shared/PageHeader.test.tsx`

```tsx
// env=node (vitest global): renderToStaticMarkup, kein next-Hook -> keine Mocks noetig.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import PageHeader from './PageHeader'

describe('PageHeader', () => {
  it('rendert Titel + Beschreibung standardmaessig in einer Floating-Card', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: 'Finanzen', description: 'Umsatz und Provision' }),
    )
    expect(html).toContain('Finanzen')
    expect(html).toContain('Umsatz und Provision')
    expect(html).toContain('page-header-card') // Card-Surface aktiv
  })

  it('rendert ohne Card wenn bare', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: 'Login', bare: true }),
    )
    expect(html).toContain('Login')
    expect(html).not.toContain('page-header-card')
  })

  it('rendert ohne Card bei align=center (Auth/Wizard)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: 'Anmelden', align: 'center' }),
    )
    expect(html).toContain('Anmelden')
    expect(html).not.toContain('page-header-card')
  })

  it('rendert children innerhalb der Card', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        PageHeader,
        { title: 'Faelle' },
        React.createElement('nav', null, 'HUBTABS'),
      ),
    )
    expect(html).toContain('page-header-card')
    expect(html).toContain('HUBTABS')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss FAILEN**

Run: `npx vitest run src/components/shared/PageHeader.test.tsx`
Expected: FAIL — der erste Test findet `page-header-card` nicht (Card noch nicht implementiert).

- [ ] **Step 3: `.page-header-card`-Utility in `globals.css` ergaenzen** — direkt **nach** dem `.glass-bg`-Block einfügen:

Finde:
```css
.glass-bg {
  background: #f8f9fb;
}
```
Füge **danach** ein:
```css
/* 2026-07-11 (PageHeader-Floating-Card): Weiche, helle Floating-Card fuer den
   Seiten-Header (shared PageHeader). Brand-var-getrieben (kunde/makler branded),
   Claimondo-Fallback fuer interne Portale. Ersetzt die eckigen
   `bg-white border-b`-Header-Leisten. */
.page-header-card {
  background-color: color-mix(in srgb, var(--brand-surface, #ffffff) 82%, transparent);
  backdrop-filter: saturate(160%) blur(16px);
  -webkit-backdrop-filter: saturate(160%) blur(16px);
  border: 1px solid color-mix(in srgb, var(--brand-primary, #0D1B3E) 8%, transparent);
  box-shadow:
    0 8px 24px color-mix(in srgb, #0D1B3E 8%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
```

- [ ] **Step 4: `PageHeader.tsx` neu schreiben** — ganzer Datei-Inhalt:

```tsx
// AAR-727 / AAR-769 Phase 3: Einheitlicher Seiten-Header fuer alle Portale.
// AAR-791: description: ReactNode; useBranding; leadingSlot.
// 2026-07-11 (PageHeader-Floating-Card): Der Start-Header rendert per Default als
// weiche Floating-Card (.page-header-card). `bare` (bzw. align="center") rendert
// wie zuvor ohne Card. `children` erlaubt Hub-Tabs/Untertitel INNERHALB der Card.
// Positionierung (sticky/flex-shrink-0) bleibt beim Consumer.
import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

type Props = {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  /** `md` (default) fuer Sub-Seiten (18px), `lg` fuer Hub-Seiten (24px). */
  size?: 'md' | 'lg'
  /** Title-Color auf var(--brand-primary) statt navy (Whitelabel-SV). */
  useBranding?: boolean
  /** Slot vor dem Title-Block (Avatar-Kreis, Back-Button). */
  leadingSlot?: ReactNode
  /** `start` (default) linksbuendig, `center` fuer Wizard/Auth (impliziert bare). */
  align?: 'start' | 'center'
  /** Inhalt INNERHALB der Card unter der Titelzeile (z.B. Hub-Tabs + Untertitel). */
  children?: ReactNode
  /** Opt-out: rendert ohne Floating-Card (Auth/Login, in SectionCard verschachtelt). */
  bare?: boolean
}

export default function PageHeader({
  title,
  description,
  icon: LucideIconRef,
  actions,
  size = 'md',
  useBranding = false,
  leadingSlot,
  align = 'start',
  children,
  bare = false,
}: Props) {
  const titleSize = size === 'lg' ? 'text-2xl' : 'text-lg'
  const titleColor = useBranding
    ? 'text-[var(--brand-primary,#0D1B3E)]'
    : 'text-claimondo-navy'

  if (align === 'center') {
    return (
      <div className="flex flex-col items-center text-center gap-2" data-page-header>
        {leadingSlot}
        <div className="flex items-center gap-2 justify-center">
          {LucideIconRef ? (
            <LucideIconRef className="w-5 h-5 text-claimondo-ondo shrink-0" />
          ) : null}
          <h1 className={`${titleSize} font-semibold ${titleColor}`}>{title}</h1>
        </div>
        {description ? (
          <p className="text-sm text-claimondo-ondo max-w-prose">{description}</p>
        ) : null}
        {actions ? (
          <div className="flex items-center gap-3 mt-2">{actions}</div>
        ) : null}
      </div>
    )
  }

  const titleRow = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
        {leadingSlot}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {LucideIconRef ? (
              <LucideIconRef className="w-5 h-5 text-claimondo-ondo shrink-0" />
            ) : null}
            <h1 className={`${titleSize} font-semibold ${titleColor} truncate`}>
              {title}
            </h1>
          </div>
          {description ? (
            <p className="text-sm text-claimondo-ondo">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex items-center gap-3 shrink-0">{actions}</div>
      ) : null}
    </div>
  )

  const bodyContent = (
    <>
      {titleRow}
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  )

  if (bare) {
    return <div data-page-header>{bodyContent}</div>
  }

  return (
    <div
      data-page-header
      data-page-header-card
      className="page-header-card rounded-ios-lg px-5 py-4"
    >
      {bodyContent}
    </div>
  )
}
```

- [ ] **Step 5: Test laufen lassen — muss PASSEN**

Run: `npx vitest run src/components/shared/PageHeader.test.tsx`
Expected: PASS (4 Tests grün).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/components/shared/PageHeader.tsx src/components/shared/PageHeader.test.tsx
git commit -m "feat(portal-header): PageHeader rendert Floating-Card by default (+children/bare)

.page-header-card Utility (helles Glas, brand-var). Card fuer align=start;
bare + align=center bleiben boxless. children-Slot fuer Hub-Tabs.

Audit:
- Build: tsc gruen (voller Build in Task 7)
- UI: shared PageHeader-Look, kein neuer Einstiegspunkt
- Redundanz: EIN Ort fuer den Card-Look (Utility + Component)
- Dead-Code: nichts entfernt
- Spec: Floating-Card + children + bare (align=center impliziert bare)
- Inkonsistenz: rounded-ios-lg, Hex nur in globals.css/color-mix, kein bracket-hex
- Regression: Center-Variante unveraendert; Consumer-API abwaertskompatibel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Hub-Header in EINE Card (`FaelleHubHeader`)

**Files:**
- Modify: `src/app/admin/faelle/(hub)/FaelleHubHeader.tsx`

**Interfaces:**
- Consumes: `PageHeader` `children`-Slot (Task 1).

- [ ] **Step 1: `FaelleHubHeader` return anpassen** — Tabs + Untertitel als `children` in `PageHeader`.

Finde:
```tsx
  return (
    <div className="space-y-2 pt-4">
      <PageHeader title="Fälle" size="lg" />
      <RouteTabBar tabs={tabs} />
      <p className="text-sm text-claimondo-ondo">{active.subtitle}</p>
    </div>
  )
```
Ersetze durch:
```tsx
  return (
    <div className="pt-4">
      <PageHeader title="Fälle" size="lg">
        <RouteTabBar tabs={tabs} />
        <p className="mt-2 text-sm text-claimondo-ondo">{active.subtitle}</p>
      </PageHeader>
    </div>
  )
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Visuell prüfen (lokal)** — `/admin/faelle` öffnen: Titel „Fälle" + Tabs + Untertitel sitzen in **einer** Floating-Card (kein loses Tab-Band mehr). (Falls kein lokaler Login: in Task 7 gebündelt visuell prüfen.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/faelle/(hub)/FaelleHubHeader.tsx"
git commit -m "feat(portal-header): Faelle-Hub-Header (Titel+Tabs+Untertitel) in eine Card

Audit:
- Build: tsc gruen
- UI: /admin/faelle Hub-Header, ein Card-Block
- Redundanz: nutzt PageHeader children (Task 1)
- Dead-Code: space-y-2-Wrapper entfallen
- Spec: 5.3 Hub-Header in einer Card
- Inkonsistenz: Umlaute erhalten (Fälle)
- Regression: RouteTabBar/Untertitel-Logik unveraendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Eckige Flex-Band-Leiste raus — worked example A (`admin/finance/(hub)`)

**Files:**
- Modify: `src/app/admin/finance/(hub)/page.tsx`

- [ ] **Step 1: Header-Wrapper de-eckig machen** — nur die Wrapper-`<div>`-Klasse; `PageHeader`-Props unverändert.

Finde:
```tsx
      {/* Sticky Header */}
      <div className="px-4 py-3 bg-white border-b border-claimondo-border flex-shrink-0">
        <PageHeader
          title="Finanzen"
```
Ersetze die Wrapper-Zeile (nur das `<div className=...>`) durch:
```tsx
      {/* Header — die Floating-Card (PageHeader) liefert die Surface, keine eckige Leiste mehr */}
      <div className="px-4 pt-4 flex-shrink-0">
        <PageHeader
          title="Finanzen"
```
(`flex-shrink-0` bleibt, damit die Header-Zeile über dem scrollenden Content-Bereich fix bleibt; `py-3 bg-white border-b border-claimondo-border` fällt weg.)

> **Nicht anfassen:** die bestehenden `bg-emerald-50 text-emerald-600`-Pills in `actions` (grandfathered Status-Ratchet) — unverändert lassen.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/finance/(hub)/page.tsx"
git commit -m "feat(portal-header): finance-hub Header-Leiste -> Floating-Card (kein bg-white/border-b)

Audit:
- Build: tsc gruen
- UI: /admin/finance Header, Card statt eckiger Leiste
- Redundanz: PageHeader-Card (Task 1)
- Dead-Code: Band-Styling entfernt
- Spec: 5.4 eckige Baender raus
- Inkonsistenz: emerald-Pills unangetastet (grandfathered)
- Regression: flex-shrink-0 erhalten (Header bleibt ueber Scroll-Content)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Eckige Sticky-`<header>`-Leiste raus — worked example B (`admin/statistiken`)

**Files:**
- Modify: `src/app/admin/statistiken/StatistikenClient.tsx`

- [ ] **Step 1: Sticky-Header de-eckig, Stickiness erhalten**

Finde:
```tsx
<header className="sticky top-0 z-10 bg-white border-b border-claimondo-border shadow-sm px-4 py-3">
```
Ersetze durch (weiche, opake Sticky-Zone, damit Content beim Scrollen nicht hinter der Card durchscheint):
```tsx
<header className="sticky top-0 z-10 bg-claimondo-bg/90 backdrop-blur px-4 pt-4 pb-3">
```
(`sticky top-0 z-10` bleibt; `bg-white border-b border-claimondo-border shadow-sm` → `bg-claimondo-bg/90 backdrop-blur`. Die `PageHeader`-Card sitzt darin.)

- [ ] **Step 2: Typecheck + Test-Suite**

Run: `npx tsc --noEmit && npx vitest run src/components/shared/PageHeader.test.tsx`
Expected: keine Fehler; 4 Tests grün.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/statistiken/StatistikenClient.tsx
git commit -m "feat(portal-header): statistiken Sticky-Header -> weiche Zone + Card

Audit:
- Build: tsc gruen
- UI: /admin/statistiken Sticky-Header weich, Card statt eckiger Leiste
- Redundanz: PageHeader-Card
- Dead-Code: border-b/shadow-sm/bg-white entfernt
- Spec: 5.4 (Sticky-Variante)
- Inkonsistenz: claimondo-bg-Token statt weiss
- Regression: sticky top-0 erhalten (Header klebt weiter)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Sweep — restliche eckige `bg-white border-b`-Header-Leisten

**Files:**
- Modify: alle weiteren Consumer, deren `PageHeader` in einer `bg-white border-b border-claimondo-border`-Leiste steckt (autoritative Liste via grep unten).

**Rezept (pro File):**
1. Wrapper-Element (`<div>`/`<header>`) finden, das **direkt** `<PageHeader>` umschließt **und** `bg-white border-b border-claimondo-border` trägt.
2. `bg-white border-b border-claimondo-border` (und ggf. `shadow-sm`) **entfernen**. Positionierung (`flex-shrink-0`, `sticky top-0 z-10`) + Padding **behalten** (`py-3` ggf. → `pt-4`).
3. Bei **sticky**-Wrappern zusätzlich `bg-claimondo-bg/90 backdrop-blur` setzen (wie Task 4), sonst scheint Content hinter der Card durch.
4. **Verifizieren**, dass das entfernte `border-b` wirklich der **Header-Wrapper** ist — nicht ein unabhängiger Divider (z.B. `WerkstaettenClient`/`kunde/profil` haben `border-b` an anderer Stelle; deren Header ggf. gar kein Band → nichts zu tun).

- [ ] **Step 1: Autoritative Band-Liste ziehen**

Run (PowerShell):
```powershell
$s="src\app"; Get-ChildItem $s -Recurse -Filter *.tsx |
  Where-Object { (Select-String $_.FullName -Pattern "<PageHeader" -Quiet) -and (Select-String $_.FullName -Pattern "bg-white border-b border-claimondo-border" -Quiet) } |
  ForEach-Object { "--- $($_.FullName)"; Select-String $_.FullName -Pattern "bg-white border-b border-claimondo-border" | ForEach-Object { $_.LineNumber.ToString() + ': ' + $_.Line.Trim() } }
```
Erwartete Kandidaten (Task 3+4 schon erledigt → ausschließen): `admin/finance/(hub)/offene-faelle`, `.../per-sv-balance`, `.../saeumige-svs`, `admin/abrechnungen/AbrechnungenListClient`, `admin/kalender/KalenderClient`, `admin/makler/MaklerAdminClient`, `admin/partner-leads/PartnerLeadsClient`, `admin/sachverstaendige/basic-freigaben`, `admin/statistiken/ki-usage`, `admin/sv-leads/SvLeadsClient`, `admin/team/incentives`, `admin/team/leaderboard`, `dev/phases`, `kunde/termine/KundeTermineClient`. **Pro File Schritt 1 des Rezepts anwenden.**

> **Reihenfolge / Kollision:** zuerst `admin/*` + `dev/*` (intern, kaum Kollision). `kunde/*` + `makler/*` zuletzt — diese Portale sind branded und werden ggf. von anderen Sessions bearbeitet: vor dem Edit `git -C <worktree> fetch origin` + kurz prüfen, ob eine andere Session dieselbe Datei anfasst (Memory-Marker). Bei Konflikt: dieses File in eine P2-Nachlieferung schieben (Plan-Ende).

- [ ] **Step 2: Rezept pro File anwenden** (je File nur die Wrapper-Klasse; `PageHeader`-Props unverändert). Beispiel-Transformation (nicht-sticky):
```
- <div className="px-4 py-3 bg-white border-b border-claimondo-border ...">
+ <div className="px-4 pt-4 ...">
```

- [ ] **Step 3: Typecheck nach jeder Gruppe**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit (gruppiert, z.B. „admin-Sweep" / „finance-subs")**

```bash
git add -A
git commit -m "feat(portal-header): restliche eckige PageHeader-Leisten -> Floating-Card

Audit:
- Build: tsc gruen (voller Build Task 7)
- UI: betroffene Sub-Seiten Header als Card
- Redundanz: PageHeader-Card, kein Inline-Band mehr
- Dead-Code: bg-white/border-b-Wrapper entfernt
- Spec: 5.4/5.5 Consumer-Sweep
- Inkonsistenz: claimondo-Tokens; keine neuen Status-Scales
- Regression: Positionierung (sticky/flex-shrink-0) je File erhalten

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `bare` für Auth/Login + verschachtelte Consumer

**Files:**
- Modify: `src/app/login/**/*.tsx` (die 2 `PageHeader`-Consumer) + jede Seite, die `PageHeader` bereits **in** einer eigenen Card/`SectionCard`/`bg-white rounded`-Fläche rendert (dort würde die neue Card doppeln).

- [ ] **Step 1: Kandidaten finden**

Run (PowerShell):
```powershell
"### login/auth:"; Get-ChildItem "src\app\login" -Recurse -Filter *.tsx | Select-String "<PageHeader" -List | ForEach-Object { $_.Path }
"### PageHeader evtl. in Card verschachtelt (manuell pruefen):"; Get-ChildItem "src\app","src\components" -Recurse -Filter *.tsx | Where-Object { (Select-String $_.FullName "<PageHeader" -Quiet) -and (Select-String $_.FullName "SectionCard|bg-white.*rounded" -Quiet) } | ForEach-Object { $_.FullName }
```

- [ ] **Step 2: `bare` setzen** — bei Auth/Login und jedem verschachtelten Fall `bare` an `PageHeader` ergänzen, z.B.:
```
- <PageHeader title="Anmelden" ... />
+ <PageHeader title="Anmelden" bare ... />
```
(Regel: PageHeader steht bereits auf einer eigenen Fläche/zentriert → `bare`. Steht er frei auf `bg-claimondo-bg` → Card behalten.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(portal-header): bare fuer Auth/Login + verschachtelte PageHeader

Audit:
- Build: tsc gruen
- UI: Auth boxless; keine doppelte Card in verschachtelten Faellen
- Redundanz: bare-Opt-out statt Sonderkomponente
- Dead-Code: nichts
- Spec: 5.1 bare-Grenze
- Inkonsistenz: n/a
- Regression: nur bare-Flag ergaenzt, Layout sonst unveraendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verifikation (Build + Ratchets + visuell)

**Files:** keine (Verifikation).

- [ ] **Step 1: Voller Build**

Run: `npm run build`
Expected: „Compiled successfully" (keine Validator-Fehler; bei OOM lokal → `npx tsc --noEmit` als Minimum + Notiz).

- [ ] **Step 2: Ratchets**

Run: `npm run check:token-audit && npm run check:component-set && npm run check:status-registry && npm run check:knip`
Expected: alle **0 neue** Verstöße (grün). Bei Fund: fixen (Card-Werte gehören in `globals.css`, nicht in className).

- [ ] **Step 3: Test-Suite**

Run: `npx vitest run`
Expected: alle grün (inkl. `PageHeader.test.tsx`).

- [ ] **Step 4: Playwright-Smoke-Spec schreiben** — `tests/e2e/flows/pageheader-floating-card.spec.ts` (Muster: bestehende `tests/e2e/flows/*.spec.ts`, z.B. `werkstatt-finder-smoke.spec.ts`; `// Run:`-Header). Login via Test-Konto (Admin: `nicolas.kitta@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`; Rollen: `test-{dispatch,makler,kunde}@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`). Pro repräsentativer Seite asserten:
  - Header-Container trägt `[data-page-header-card]` (Klasse `page-header-card`) — **außer** Auth/Login: dort `[data-page-header]` **ohne** `page-header-card`.
  - **Kein** `bg-white border-b border-claimondo-border`-Band mehr um `[data-page-header]`.
  - Seite lädt ohne Console-Error.
  - Seiten: `/admin/finance`, `/admin/faelle`, `/admin/statistiken`, `/kunde/profil` (branded tint), `/login` (boxless).

- [ ] **Step 5: Prod-Playwright-Smoke (Aaron-Mandat 11.07. — [[broadcast-alle-sessions-sauber-durchziehen-prod-playwright-smoke]])** — echtes Verhalten verifizieren, nicht nur build-grün:
  - Vor PR lokal: `npm run dev` → `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/flows/pageheader-floating-card.spec.ts` → grün.
  - Nach Merge-auf-prod (Merge-Session zieht grüne staging-PR): die post-merge-CI-e2e-Suite fährt die Spec automatisch gegen `https://app.claimondo.de`. **Zusätzlich** manueller Sicht-Check der obigen Seiten auf prod (Card statt Band, branded kunde getönt, auth boxless, kein Content-Durchscheinen bei sticky).
  - Vorher/Nachher-Screenshots.

- [ ] **Step 6: Voller Build + Ratchets + Tests final + Abschluss-Commit**

Run: `npm run build && npm run check:token-audit && npm run check:component-set && npm run check:status-registry && npm run check:knip && npx vitest run`
Expected: alle grün.
```bash
git add -A
git commit -m "chore(portal-header): Verifikation gruen (Build/Ratchets/vitest/e2e-spec)

Audit: Build gruen; 4 Ratchets 0-neu; vitest gruen; e2e-Smoke-Spec pageheader-floating-card (Card/bare/branded/sticky) lokal grün.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Push + PR gegen `staging` (→ prod via Merge-Session)**

```bash
git -C <worktree> push -u origin kitta/pageheader-floating-card
gh pr create --base staging --head kitta/pageheader-floating-card --title "PageHeader Floating-Card (portalweit, shared)" --body "..."
```
PR **mergeable + grün** halten; die Merge-Session (35660476) zieht grüne staging-PRs auf main/prod (dann läuft der prod-e2e-Smoke automatisch). Greift sie es nicht → der Merge-Session flaggen (Marker `COORDINATION-merge-session-release-state`).

---

## Optional P2 (separat, non-blocking)

- **Padding-Normalisierung:** die uneinheitlichen Außen-Wrapper (`py-8` / `p-6` / `p-4 md:p-6` / `px-4 py-6 max-w-5xl`) auf ein Muster bringen. Rein kosmetisch — eigener kleiner PR, um den Kern-PR review-bar zu halten.
- **kunde/makler-Band-Files**, die wegen aktiver Fremd-Sessions in Task 5 zurückgestellt wurden, hier nachliefern (nach Rebase).

---

## Self-Review (gegen den Spec)

**1. Spec-Coverage:**
- §5.1 PageHeader Card+children+bare → Task 1. (Spec-`sticky`-Prop bewusst **weggelassen** → Positionierung bleibt beim Consumer, sauberer bei den 2 verschiedenen Sticky-Mustern; abgedeckt in Task 3/4/5.)
- §5.2 `.page-header-card` Utility → Task 1 Step 3.
- §5.3 Hub-Header eine Card → Task 2.
- §5.4 eckige Bänder raus (+ sticky-Fälle) → Task 3 (Flex-Band), Task 4 (Sticky-Header), Task 5 (Sweep).
- §5.5 Consumer-Migration → Kern automatisch (Card-Default); Cleanup Task 3–5; `bare`-Ausnahmen Task 6.
- §7 Risiken (broad change, branded, auth, collision, ratchets, sticky) → Task 6 (auth/nested), Task 5 (collision-Reihenfolge), Task 7 (build/ratchets/visuell inkl. branded+auth+sticky).
- §8 Testing → Task 1 (unit), Task 7 (build/ratchets/vitest/visuell).

**2. Placeholder-Scan:** kein TBD/TODO; Task-1-Code vollständig; Sweep/bare als exakte Rezepte + grep + worked examples (kein „similar to").

**3. Type-Konsistenz:** neue Props `children?: ReactNode`, `bare?: boolean` konsistent in Task 1 definiert und in Task 2 (`children`) / Task 6 (`bare`) verwendet. `.page-header-card` Klassenname identisch in globals.css (Task 1 Step 3), Component (Task 1 Step 4) und Tests.

**Abweichung vom Spec:** `sticky`-Prop nicht gebaut (Consumer behalten Positionierung) — im Spec §5.1 als Prop gelistet; hier bewusst vereinfacht, da Consumer-Positionierung variiert (`flex-shrink-0` vs `sticky top-0`). Funktional in Task 3/4/5 abgedeckt.
