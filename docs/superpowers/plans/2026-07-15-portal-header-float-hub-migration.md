# Portal-Header Floating + Client-State-Hub-Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Seiten-Header portalweit weich-freischwebend machen (Schatten-Fix) und die Admin-Finance-Hub-Tabs von Routen auf reine Client-State-Detail-Views umstellen (erreichbar über den Header), als Referenz für die übrigen Admin-Hubs.

**Architecture:** `.page-header-card` (globals.css) + shared `PageHeader` sind auf staging **bereits live** (#4149-Sweep). P0 fixt nur den zu starken Schatten portalweit. P1 ersetzt die eckige Finance-Tab-Leiste (`layout.tsx`) durch eine Client-State-Segmented-Control **in** der Header-Card; die 8 Sub-Views werden als server-gerenderte Slots in eine `FinanceHubShell` (client) gereicht, die den aktiven zeigt; alte Sub-Routen werden Redirect-Stubs; alle `revalidatePath` zeigen auf `/admin/finance`.

**Tech Stack:** Next.js 15 (App Router, RSC + Client Components), Tailwind v4 (`@theme` Tokens), Vitest (`PageHeader.test.tsx`), Playwright (Regel-4-Smoke).

## Global Constraints

- Base = `origin/staging`; Branch `kitta/portal-header-float-hub-migration`; PR gegen **staging** (AGENTS.md Regel 1 — nie direkt main).
- **Umlaute** in nutzersichtbaren UI-Strings (echte `ä/ö/ü/ß`). Backend/Kommentare frei.
- Token-Ratchets grün: **kein** bracket-hex in `className`, Radien nur `rounded-ios-*`, Status nur `bg-success`/etc. (finance-hub hat Bestand `bg-emerald-50 text-emerald-600`-Pills — **nicht** neu einführen).
- Server-Actions liefern `{ ok: boolean; error?: string }` — kein `throw`.
- Jede mutierende Action `revalidatePath` nachziehen.
- Commit-Body = 7-Punkt-Audit (AGENTS.md).
- Voller `tsc` braucht `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.

---

## Task 0: `--shadow-header` Token — Schatten portalweit weich (P0)

**Files:**
- Modify: `src/app/globals.css` (`@theme` ~Z.160, `:root` ~Z.318, `.page-header-card` Z.646-654)

**Interfaces:**
- Produces: CSS-Var `--shadow-header` + Tailwind-Utility `shadow-header`; `.page-header-card` nutzt `--shadow-header` statt inline `0 8px 24px /8%`.

- [ ] **Step 1: Ist-Schatten bestätigen (Baseline)**

Run: `grep -n "box-shadow" src/app/globals.css | sed -n '/page-header-card/,/}/p'; sed -n '646,655p' src/app/globals.css`
Expected: `.page-header-card` box-shadow = `0 8px 24px color-mix(in srgb, #0D1B3E 8%, transparent), inset 0 1px 0 rgba(255,255,255,0.7)`.

- [ ] **Step 2: `--shadow-header` in `@theme` exposen** (nach `--shadow-glass-card: var(--shadow-glass-card);`, ~Z.160)

```css
  --shadow-glass-card: var(--shadow-glass-card);
  --shadow-header: var(--shadow-header);
```

- [ ] **Step 3: `--shadow-header` Wert im `:root`** (nach `--shadow-glass-card: 0 4px 20px rgba(13, 27, 62, 0.06);`, ~Z.318)

```css
  --shadow-glass-card: 0 4px 20px rgba(13, 27, 62, 0.06);
  /* Header-Elevation: eine weiche Stufe ueber shadow-ios-sm-Cards. War 0 8px 24px/8% (zu stark, #4149). */
  --shadow-header: 0 4px 16px rgba(13, 27, 62, 0.05);
```

- [ ] **Step 4: `.page-header-card` auf den Token umbiegen** (Z.646-654)

Ersetze den `box-shadow`-Block der `.page-header-card`:
```css
  box-shadow: var(--shadow-header), inset 0 1px 0 rgba(255, 255, 255, 0.7);
```
(Rest der Utility — background/backdrop/border/radius — unverändert lassen.)

- [ ] **Step 5: Ratchets + Build grün**

Run: `npm run check:token-audit && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: token-audit PASS (Wert in CSS-Var, kein bracket-hex); tsc keine neuen Fehler.

- [ ] **Step 6: Visuell verifizieren** (Header schwebt weich, erschlägt Cards nicht)

Run: siehe „Verifikation" unten (Playwright-Screenshot `/admin/finance` — Header-Schatten dezent).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(portal-header): --shadow-header Token — .page-header-card Schatten weich (0 8px 24px/8% -> 0 4px 16px/5%)"
```

---

## Task 1: `FinanceHubShell` — Client-State-Tab-Gerüst

**Files:**
- Create: `src/app/admin/finance/(hub)/FinanceHubShell.tsx`
- Reference: `src/app/faelle/[id]/FallakteShell.tsx:143,234` (Muster), `src/app/dispatch/leads/_components/LeadsViewToggle.tsx` (Segment-Optik), `src/components/shared/PageHeader.tsx` (children-Slot Z.97)

**Interfaces:**
- Produces: `FinanceHubShell({ tabs, defaultTab, title, description?, actions?, views })` — client component. `tabs: {id: string, label: string}[]`; `defaultTab: string`; `views: Record<string, ReactNode>` (server-gerenderte Slots). Rendert `<PageHeader title description actions>` mit Segmented-Control (`<button>` je Tab) als `children` + zeigt `views[active]`, versteckt Rest via `hidden`.

- [ ] **Step 1: Shell schreiben** (Client-State + Segmented-Control in der Header-Card)

```tsx
'use client'
import { useState } from 'react'
import type { ReactNode } from 'react'
import PageHeader from '@/components/shared/PageHeader'

export type FinanceTab = { id: string; label: string }

type Props = {
  tabs: FinanceTab[]
  defaultTab: string
  title: string
  description?: string
  actions?: ReactNode
  views: Record<string, ReactNode>
}

export default function FinanceHubShell({ tabs, defaultTab, title, description, actions, views }: Props) {
  const [active, setActive] = useState(defaultTab)
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-4 flex-shrink-0">
        <PageHeader title={title} description={description} actions={actions}>
          <nav className="flex gap-1 overflow-x-auto" aria-label="Finanzen-Ansichten">
            {tabs.map((t) => {
              const on = active === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActive(t.id)}
                  className={`px-3.5 py-2 text-sm rounded-ios-lg whitespace-nowrap transition-colors ${
                    on
                      ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                      : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </PageHeader>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tabs.map((t) => (
          <div key={t.id} className={active === t.id ? '' : 'hidden'}>
            {views[t.id]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc grün**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/finance/(hub)/FinanceHubShell.tsx"
git commit -m "feat(finance-hub): FinanceHubShell — Client-State-Tabs in der Header-Card (Geruest)"
```

---

## Task 2: Sub-Views als Slot-Komponenten extrahieren

Die 8 Tab-Inhalte werden server-gerenderte Slots. **Der Übersicht-Inhalt** lebt heute in `(hub)/page.tsx` (Body ab dem Scroll-Container, Z.792+). **Die 7 anderen** sind eigene `(hub)/<sub>/page.tsx`. Jede wird eine **View-Komponente**, die ihre Daten selbst lädt (Server Component, bleibt wie heute) — nur der Header/Wrapper fällt weg.

**Files:**
- Create: `src/app/admin/finance/(hub)/_views/UebersichtView.tsx` (Body aus `page.tsx`)
- Create: `src/app/admin/finance/(hub)/_views/{Abrechnungen,SaeumigeSvs,OffeneFaelle,PerSvBalance,Kanzlei,Provisionen,PartnerAbrechnungen}View.tsx`
- Reference (Quelle je View): `(hub)/<sub>/page.tsx` + `(hub)/abrechnungen/page.tsx` (2 Z., re-export), `(hub)/kanzlei/page.tsx` (2 Z.), `(hub)/provisionen/page.tsx` (→ `ProvisionenClient`)

**Interfaces:**
- Produces: je `default async function <X>View()` — Server Component ohne `PageHeader`/eigenen Sticky-Wrapper, rendert **nur** den Inhalt (die heutige `return`-JSX der Sub-Page minus `<PageHeader>` + `p-4`-Wrapper).

- [ ] **Step 1: `UebersichtView` extrahieren.** Lies `(hub)/page.tsx`. Verschiebe die gesamte Daten-Fetch-Logik (`FinancePage`-Body) + die Scroll-Content-JSX (`page.tsx:792`-Ende, ohne den äußeren `h-full flex flex-col` + den `<PageHeader>`-Block Z.774-790) in `_views/UebersichtView.tsx` als `export default async function UebersichtView()`. Die MRR/SVs/Mandate-Werte, die heute in `actions` des PageHeaders stehen, werden in Task 3 als `actions`-Prop an die Shell gereicht → dafür exportiere zusätzlich `export async function ladeFinanceHeaderStats(): Promise<{ mrr: number; svCount: number; mandateMonat: number }>` (die 3 Werte aus dem heutigen Fetch).

- [ ] **Step 2: Die 7 Sub-Views extrahieren.** Für jede `(hub)/<sub>/page.tsx`: kopiere die Server-Component 1:1 nach `_views/<X>View.tsx`, **entferne** den `<PageHeader …/>` + den `p-4 md:p-6`/Sticky-Wrapper, behalte Fetch + Inhalt. (Bei `abrechnungen`/`kanzlei` = 2-Zeilen-Re-Exports: die View re-exportiert dieselbe Zielkomponente.) Für `provisionen`: `ProvisionenClient` bleibt, `ProvisionenView` lädt Daten wie `provisionen/page.tsx` und rendert `<ProvisionenClient .../>` (ohne Header).

- [ ] **Step 3: tsc grün**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler (Views kompilieren isoliert).

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/finance/(hub)/_views/"
git commit -m "refactor(finance-hub): 8 Sub-Views nach _views/ extrahiert (Header/Wrapper raus)"
```

---

## Task 3: Hub-Page = Server-Parent, der die Shell rendert

**Files:**
- Modify: `src/app/admin/finance/(hub)/page.tsx` (wird dünner Server-Parent)
- Modify: `src/app/admin/finance/(hub)/layout.tsx` (Tab-Leiste RAUS)
- Delete: `src/app/admin/finance/(hub)/FinanceHubTabs.tsx` (Route-Tabs obsolet)

**Interfaces:**
- Consumes: `FinanceHubShell` (Task 1), `_views/*` + `ladeFinanceHeaderStats` (Task 2).

- [ ] **Step 1: `layout.tsx` — Tab-Leiste entfernen.** Die eckige `<div className="shrink-0 border-b border-claimondo-border bg-white …"><FinanceHubTabs/></div>` (Z.13-16) löschen; das Layout gibt nur noch `{children}` in einem `h-full`-Container aus (die Shell bringt Header+Tabs selbst).

```tsx
export default function FinanceHubLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full">{children}</div>
}
```

- [ ] **Step 2: `page.tsx` → Server-Parent.** Ersetze den `return (<div h-full…><PageHeader/>…)` durch: lade Header-Stats, render `<FinanceHubShell>` mit den 8 Views als Slots.

```tsx
import FinanceHubShell from './FinanceHubShell'
import UebersichtView, { ladeFinanceHeaderStats } from './_views/UebersichtView'
import AbrechnungenView from './_views/AbrechnungenView'
// … die übrigen 6 View-Imports …

export default async function FinancePage() {
  // (Auth-Guard wie bisher belassen)
  const { mrr, svCount, mandateMonat } = await ladeFinanceHeaderStats()
  const eur = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
  return (
    <FinanceHubShell
      defaultTab="uebersicht"
      title="Finanzen"
      description="Umsatz, Provision & Kennzahlen"
      actions={
        <div className="flex items-center gap-2 text-[10px] font-medium">
          <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">MRR {eur(mrr)}</span>
          <span className="bg-claimondo-ondo/5 text-claimondo-ondo px-2 py-0.5 rounded-full">{svCount} SVs</span>
          {mandateMonat > 0 && (
            <span className="bg-claimondo-ondo/[0.06] text-claimondo-navy px-2 py-0.5 rounded-full">{mandateMonat} Mandate</span>
          )}
        </div>
      }
      tabs={[
        { id: 'uebersicht', label: 'Übersicht' },
        { id: 'abrechnungen', label: 'Abrechnungen' },
        { id: 'saeumige-svs', label: 'Säumige SVs' },
        { id: 'offene-faelle', label: 'Offene Berechnungen' },
        { id: 'per-sv-balance', label: 'Per-SV Balance' },
        { id: 'kanzlei', label: 'Kanzlei-Abr.' },
        { id: 'provisionen', label: 'Provisionen' },
        { id: 'partner-abrechnungen', label: 'Partner-Abr.' },
      ]}
      views={{
        'uebersicht': <UebersichtView />,
        'abrechnungen': <AbrechnungenView />,
        'saeumige-svs': <SaeumigeSvsView />,
        'offene-faelle': <OffeneFaelleView />,
        'per-sv-balance': <PerSvBalanceView />,
        'kanzlei': <KanzleiView />,
        'provisionen': <ProvisionenView />,
        'partner-abrechnungen': <PartnerAbrechnungenView />,
      }}
    />
  )
}
```

- [ ] **Step 3: `FinanceHubTabs.tsx` löschen + Import-Leichen prüfen**

Run: `git rm "src/app/admin/finance/(hub)/FinanceHubTabs.tsx" && grep -rn "FinanceHubTabs" src`
Expected: keine Referenzen mehr.

- [ ] **Step 4: Build grün** (Routen/Layout-Change → voller Build)

Run: `npm run build`
Expected: PASS; `/admin/finance` baut, keine Validator-Fehler.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/admin/finance/(hub)/"
git commit -m "feat(finance-hub): Route-Tabs -> Client-State-Views in der Header-Card; eckige Tab-Leiste weg"
```

---

## Task 4: Alte Sub-Routen → Redirect-Stubs (kein 404 für Deeplinks)

**Files:**
- Modify: `(hub)/{abrechnungen,saeumige-svs,offene-faelle,per-sv-balance,kanzlei,provisionen,partner-abrechnungen}/page.tsx`

**Interfaces:**
- Consumes: nichts. Produces: 7 Server-Pages, die auf `/admin/finance` redirecten.

- [ ] **Step 1: Jede Sub-`page.tsx` durch einen Stub ersetzen** (Body durch `redirect` ersetzen; `?monat=`/`?nr=` gehen verloren = bewusst, s. Spec §7)

```tsx
import { redirect } from 'next/navigation'
export default function Page() { redirect('/admin/finance') }
```
(Bei `provisionen`: `ProvisionenClient` + `actions.ts` bleiben — sie werden jetzt von `_views/ProvisionenView` konsumiert; nur `provisionen/page.tsx` wird der Stub.)

- [ ] **Step 2: Deeplink-Regression testen** (alte Route → 200 via Redirect, nicht 404)

Run: `npm run build` und im Smoke (Task 6) `curl -I` / Playwright auf `/admin/finance/provisionen` → landet auf `/admin/finance`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/finance/(hub)/"
git commit -m "feat(finance-hub): alte Sub-Routen -> Redirect-Stubs auf /admin/finance"
```

---

## Task 5: `revalidatePath` auf `/admin/finance` umbiegen

**Files (exakte Stellen, staging-verifiziert):**
- Modify: `src/app/admin/abrechnungen/actions.ts:173,186,197,207,241,361,407`
- Modify: `src/app/admin/finance/(hub)/provisionen/actions.ts:26,42,68,88`
- Modify: `src/app/api/stripe/webhook/route.ts:424`
- Modify: `src/lib/finance/partner-billing-actions.ts:56,76,97,118,137,149,192,194`

- [ ] **Step 1: Alle `revalidatePath('/admin/finance/<sub>', …)` → `revalidatePath('/admin/finance')`.** Die Sub-Views leben jetzt unter `/admin/finance` — nur dieser Pfad rendert sie.

Run (Verifikation danach): `grep -rn "revalidatePath('/admin/finance/" src`
Expected: 0 Treffer (alle auf `/admin/finance` umgebogen).

- [ ] **Step 2: tsc grün**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/abrechnungen/actions.ts "src/app/admin/finance/(hub)/provisionen/actions.ts" src/app/api/stripe/webhook/route.ts src/lib/finance/partner-billing-actions.ts
git commit -m "fix(finance-hub): revalidatePath('/admin/finance/*') -> '/admin/finance' (Views leben jetzt im Hub)"
```

---

## Task 6: Verifikation — Build, Ratchets, Regel-4-Smoke

- [ ] **Step 1: Voller Build + alle Ratchets**

Run: `npm run build && npm run check:token-audit && npm run check:component-set && npm run check:knip`
Expected: alle PASS. (Knip: gelöschte `FinanceHubTabs` darf keine „unused"-Neu-Verletzung erzeugen; ggf. Baseline mit `-- --update-baseline` senken.)

- [ ] **Step 2: Playwright-Smoke `/admin/finance`** (Login smoke-admin, siehe Memory `reference-smoke-admin-prod-password`; lokal `npm run dev`):
  - Header ist eine **weiche Card** (kein eckiges `border-b`-Band darüber), Schatten dezent.
  - Segmented-Control **in** der Card; Klick auf „Provisionen" → View wechselt, **URL bleibt** `/admin/finance`.
  - `/admin/finance/provisionen` direkt → redirect auf `/admin/finance` (kein 404).
  - Vorher/Nachher-Screenshot.

- [ ] **Step 3: Commit (Smoke-Doku/Spec falls Playwright-Spec-File)**

```bash
git add tests/ docs/
git commit -m "test(finance-hub): Regel-4-Smoke — Client-State-Tabs + Redirect-Stub + weicher Header"
```

---

## Verifikation (Definition of Done, P0+P1)

- `npm run build` grün; `tsc --noEmit` (8GB) keine neuen Fehler.
- 4 Ratchets grün.
- `grep -rn "revalidatePath('/admin/finance/" src` = 0.
- `/admin/finance`: weicher Header-Schatten, Tabs in der Card, Tab-Wechsel ohne URL-Change, alte Sub-Route → Redirect (kein 404).
- Kein neuer raw-Status/bracket-hex/Default-Radius.

## Risiken (Plan-spezifisch)

- **Eager-Load aller 8 Views:** die Slots rendern server-seitig alle (alle Queries laufen pro Hub-Aufruf). Für internes Low-Traffic-Admin akzeptiert; falls `/admin/finance` spürbar träge → Follow-up: Lazy-Load per View (client-fetch on activate). **Hier bewusst eager** (YAGNI, FallakteShell-Muster).
- **`UebersichtView`-Extraktion** ist die heikelste (839-Z.-`page.tsx`): Auth-Guard + alle Fetches sauber mitnehmen; `ladeFinanceHeaderStats` darf die 3 Header-Werte nicht doppelt/abweichend berechnen.
- **`hidden`-Slots** halten 8 DOM-Bäume gleichzeitig — bei sehr großen Tabellen ggf. `active`-only mounten (dann Views client-fähig machen). Erst messen.

## Nachfolge-Pläne (nicht in diesem Plan)

- **P2** — `faelle`/`partner`/`aufgaben`-Hubs nach dem Finance-Muster (je eigener Plan/PR).
- **P3** — Achse-B-Rest: eckige Leisten in den übrigen Portalen (gegen **staging** re-auditieren, nicht aar-956) auf Card normalisieren.
- **P4** — `/faelle/[id]`-Shell-Topbar angleichen.
