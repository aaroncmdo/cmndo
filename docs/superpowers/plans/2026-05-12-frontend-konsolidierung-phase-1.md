# Frontend-Konsolidierung Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Quick-Wins der Frontend-Redundanz-Beseitigung umsetzen — inline-reimplementierte Primitive durch die `shared/*`-/`ui/*`-Pendants ersetzen, 3 neue `shared/*`-Komponenten extrahieren, `MaklerShell` auf `PortalNav` migrieren, 5 Layouts auf `requirePortalAccess()`, 2 Drift-Bugs fixen, überlappende `ui/*`-Atoms löschen, eine Lint-Bremse einbauen.

**Architecture:** Folgt der `KOMPONENTEN-SET-POLICY.md`: Atom-Layer = `@/components/primitives/*`, Composite-Layer = `@/components/shared/*` (gebaut auf primitives), web-only Rich = `@/components/ui/*`. Jeder Task ist ein eigenständiger Refactor (eigener Commit), alle auf einem Branch `kitta/aar-frontend-konsolidierung-p1`. Reine Refactors — keine Verhaltensänderung; Verifikation = `npx tsc --noEmit` + (bei Route/Layout-Änderungen) `npm run build`.

**Tech Stack:** Next.js 16, TypeScript, Tailwind, `@/components/primitives` (Dual-File Web+Native, `lib/design-tokens.ts`), `@/components/shared/*`, `@/components/ui/*` (shadcn/Radix), lucide-react.

**Spec:** `docs/12.05.2026/FRONTEND/FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md` + `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md`. **Branch:** `kitta/aar-frontend-konsolidierung-p1` (von `origin/main`; Empfehlung: eigener Worktree wegen paralleler Agenten — `superpowers:using-git-worktrees`).

---

## File Structure (Übersicht aller Touches)

**Neu:** `src/components/shared/StatCard.tsx` · `src/components/shared/SectionCard.tsx` · `src/components/shared/forms/TextField.tsx` · `src/components/shared/forms/SelectField.tsx` · `src/components/shared/forms/index.ts` · `scripts/check-component-set.mjs`
**Gelöscht:** `src/components/ui/card.tsx` · `src/components/ui/badge.tsx` · `src/components/ui/avatar.tsx` · `src/components/tasks/TaskCreateModal.tsx`
**Geändert (Auswahl):** `src/components/makler/{MaklerShell,MaklerLeadsTable,MaklerAktenList,MaklerDashboard,MaklerPromo}.tsx` · `src/app/{admin,gutachter,kunde,mitarbeiter}/layout.tsx` + `src/app/makler/(shell)/layout.tsx` · `src/app/admin/_components/{AdminNav,KpiCards}.tsx` · `src/app/dispatch/_components/DispatchNav.tsx` · `src/app/gutachter/GutachterShell.tsx` · `src/app/admin/finance/(hub)/FinanceClient.tsx` · `src/app/gutachter/team/TeamClient.tsx` · `src/app/admin/partner/waitlist/WaitlistTable.tsx` · `src/components/fall/PflichtdokumenteSection.tsx` · `src/app/.../branding/LivePreview.tsx` · `src/app/faelle/[id]/_stammdaten/Sections.tsx` · `src/app/faelle/[id]/_prozess/Sections.tsx` · `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` · `src/app/kanzlei/dashboard/page.tsx` · `src/app/admin/sachverstaendige/anlegen/{Solo,Buero,Akademie}AnlegenWizard.tsx` + die übrigen `function Field`-Files · `src/app/schaden-melden/**` + `src/components/claims/InviteGegnerModal.tsx` (ui/button → primitives.Button)

---

## Task 1: Drift-Bugs B1 + B2 fixen

**Files:**
- Modify: `src/app/gutachter/GutachterShell.tsx` (~Z. 452-468)
- Modify: `src/app/admin/_components/AdminNav.tsx` (Datei-Kopf, ~Z. 1-9)
- Modify: `src/app/dispatch/_components/DispatchNav.tsx` (Datei-Kopf)

- [ ] **Step 1: Doppelten "Einstellungen"-Link in GutachterShell entfernen**
Öffne `src/app/gutachter/GutachterShell.tsx`. Um Z. 452-468 steht der `<Link href="/gutachter/einstellungen">…</Link>`-Block **zweimal hintereinander** (zwei identische JSX-Blöcke, beide mit Kommentar `// AAR-720: Einstellungen-Knopf unter Profil`). Lösche **eine** der beiden Kopien.

- [ ] **Step 2: Doppelten Kopf-Kommentar entfernen**
In `src/app/admin/_components/AdminNav.tsx` steht der 3-Zeilen-Kommentarblock (`// AAR-778: Migriert auf shared PortalNav (dark variant). / // Vorher: 187-Zeilen … / // Jetzt: Thin Wrapper …`) **zweimal hintereinander** (Z. 1-9). Lösche die zweite Kopie. Dasselbe in `src/app/dispatch/_components/DispatchNav.tsx`, falls dort auch doppelt.

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**
```bash
git add src/app/gutachter/GutachterShell.tsx src/app/admin/_components/AdminNav.tsx src/app/dispatch/_components/DispatchNav.tsx
git commit -m "fix(frontend): doppelter Einstellungen-Link in GutachterShell + doppelter Kommentar in AdminNav/DispatchNav

Audit:
- Build: tsc --noEmit grün
- UI: GutachterShell zeigt jetzt nur einen Einstellungen-Eintrag im Sidebar-Footer
- Redundanz: 2 Merge-Artefakte entfernt
- Dead-Code: doppelte JSX-/Kommentar-Blöcke weg
- Spec: FRONTEND-REDUNDANZ-AUDIT B1+B2
- Inkonsistenz: Umlaute ok
- Regression: rein subtraktiv, kein Verhalten geändert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `function FilterChip` → `@/components/ui/Chip`

**Files:**
- Modify: `src/components/makler/MaklerLeadsTable.tsx` (lokales `function FilterChip`, ~Z. 325 + Aufrufe)
- Modify: `src/components/makler/MaklerAktenList.tsx` (lokales `function FilterChip`, ~Z. 348 + Aufrufe)
- Modify: `src/app/admin/partner/waitlist/WaitlistTable.tsx` (lokales `function FilterChip`, ~Z. 111 + Aufrufe)

`ui/Chip` (existiert, `src/components/ui/Chip.tsx`): `<Chip variant?='default'|'selected'|'ghost' count?={number} className?>{label}</Chip>` — Button-Variante per `onClick`/`type`, Link-Variante per `href`. `<ChipRow>` umrahmt eine scrollbare Reihe.

- [ ] **Step 1: `MaklerLeadsTable.tsx` migrieren**
Lösche `function FilterChip(...)`. Ersetze jeden Aufruf `<FilterChip active={isActive} onClick={...}>{label} <span>{count}</span></FilterChip>` durch `<Chip variant={isActive ? 'selected' : 'default'} count={count} onClick={...}>{label}</Chip>`. Import: `import { Chip } from '@/components/ui/Chip'` (ggf. `ChipRow` für den Wrapper-`<div className="flex gap-2 …">` um die Chips).

- [ ] **Step 2: `MaklerAktenList.tsx` migrieren** — analog Step 1.
- [ ] **Step 3: `WaitlistTable.tsx` migrieren** — analog Step 1.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → keine Fehler. Greppe nach übrig gebliebenen `FilterChip`: `grep -rn "FilterChip" src` → nur noch ggf. in Tests/Docs, nicht in `src/components`/`src/app`.

- [ ] **Step 5: Commit**
```bash
git add src/components/makler/MaklerLeadsTable.tsx src/components/makler/MaklerAktenList.tsx src/app/admin/partner/waitlist/WaitlistTable.tsx
git commit -m "refactor(frontend): inline FilterChip → @/components/ui/Chip (3 Files)

Audit:
- Build: tsc --noEmit grün
- UI: keine sichtbare Änderung (ui/Chip ist 1:1 dafür gebaut, gleicher 44px-Tap-Target)
- Redundanz: 3× dupliziertes function FilterChip entfernt (~75 LOC)
- Dead-Code: lokale FilterChip-Funktionen weg
- Spec: KOMPONENTEN-SET-POLICY (ui/* Rich-Components) + Audit R4
- Inkonsistenz: ui/Chip ist die offizielle Filter-Chip-Komponente; Umlaute ok
- Regression: gleiche Props-Semantik (variant/count/onClick); Filter-Logik unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `function StatusPill` → `@/components/shared/StatusBadge` + inline `EmptyState` → `@/components/shared/EmptyState`

**Files:**
- Modify: `src/components/makler/MaklerLeadsTable.tsx` (lokales `function StatusPill` ~Z. 263 + lokales `function EmptyState` ~Z. 417)
- Modify: `src/components/makler/MaklerAktenList.tsx` (lokales `function EmptyState` ~Z. 442)
- Modify: `src/components/fall/PflichtdokumenteSection.tsx` (lokales `function StatusPill` ~Z. 73)
- Modify: `src/app/**/branding/LivePreview.tsx` (lokales `function StatusPill` ~Z. 178)

`shared/StatusBadge`: `<StatusBadge tone?='neutral'|'info'|'success'|'warning'|'danger'|'brand'|'ondo' size?='xs'|'sm' colorCls? className?>{children}</StatusBadge>` — `colorCls` ist der Escape-Hatch für eigene Tailwind-Klassen wenn keine der Tones passt. `shared/EmptyState` (**default export**): `<EmptyState icon?={LucideIcon} title description? action?={{label,onClick?,href?,variant?:'primary'|'secondary'|'ghost'}} variant?='default'|'compact' className?>`.

- [ ] **Step 1: `StatusPill` → `StatusBadge`**
In jedem der 3 Files: lösche `function StatusPill(...)` (inkl. seiner lokalen `cfg`-Map). Ersetze die Aufrufe durch `<StatusBadge tone={...}>{label}</StatusBadge>` — Tone-Mapping anhand der bisherigen `cfg`-Farben: `amber/orange`→`'warning'`, `emerald/green`→`'success'`, `rose/red`→`'danger'`, `blue/sky`→`'info'`, `gray/slate`→`'neutral'`, `claimondo-navy`→`'brand'`, `claimondo-ondo`→`'ondo'`. Wo die bisherige Pill eine Farbe nutzte, die zu keiner Tone passt (z.B. `violet` für Kanzlei-Phasen, oder Org-/Anforderungs-Hex-Werte), nutze `colorCls="<die bisherige Tailwind-Klasse>"`. Import: `import { StatusBadge } from '@/components/shared/StatusBadge'`.

- [ ] **Step 2: inline `EmptyState` → `shared/EmptyState`**
In `MaklerLeadsTable.tsx` und `MaklerAktenList.tsx`: lösche `function EmptyState(...)`. Ersetze `<EmptyState icon={Icon} title="…" description="…" />` durch `import EmptyState from '@/components/shared/EmptyState'` + `<EmptyState icon={Icon} title="…" description="…" variant="compact" />` (für die schmalen Listen-Empty-States — `compact` falls die bisherige Inline-Variante kompakt war; sonst `default`).

- [ ] **Step 3: Typecheck + Grep** — `npx tsc --noEmit` → keine Fehler. `grep -rn "function StatusPill\|function EmptyState" src/components src/app` → leer.

- [ ] **Step 4: Commit**
```bash
git add src/components/makler/MaklerLeadsTable.tsx src/components/makler/MaklerAktenList.tsx src/components/fall/PflichtdokumenteSection.tsx src/app
git commit -m "refactor(frontend): inline StatusPill → shared/StatusBadge, inline EmptyState → shared/EmptyState

Audit:
- Build: tsc --noEmit grün
- UI: StatusBadge nutzt dieselben Semantic-Tints (amber/emerald/rose/…); colorCls-Escape-Hatch für Sonderfarben
- Redundanz: 3× StatusPill + 2× EmptyState inline entfernt (~150 LOC)
- Dead-Code: lokale cfg-Maps weg
- Spec: KOMPONENTEN-SET-POLICY (shared/*) + Audit R5/R7
- Inkonsistenz: einheitliche Status-Badges/Empty-States; Umlaute ok
- Regression: gleiche Semantik; Listen-/Doku-Logik unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `shared/StatCard` extrahieren + 5 Inline-Implementierungen migrieren

**Files:**
- Create: `src/components/shared/StatCard.tsx`
- Modify: `src/app/admin/_components/KpiCards.tsx`, `src/app/admin/finance/(hub)/FinanceClient.tsx`, `src/app/gutachter/team/TeamClient.tsx`, `src/components/makler/MaklerDashboard.tsx` (`StatCard` + `StatCardProvisionen`), `src/components/makler/MaklerPromo.tsx`

- [ ] **Step 1: `shared/StatCard.tsx` anlegen** (gebaut auf `primitives/*` + `lib/design-tokens.ts`):
```tsx
// AAR-frontend-konsolidierung-p1: Zentrale Metrik-Kachel.
// Ersetzt 5 inline-reimplementierte StatCard/KpiCard/KpiBox-Varianten
// (siehe FRONTEND-REDUNDANZ-AUDIT R3). Gebaut auf den Primitives.
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'

type StatCardTone = 'navy' | 'ondo' | 'success' | 'warning' | 'danger' | 'neutral'

const ACCENT_BORDER: Record<StatCardTone, string> = {
  navy: 'border-l-claimondo-navy',
  ondo: 'border-l-claimondo-ondo',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-rose-500',
  neutral: 'border-l-claimondo-border',
}
const ICON_BG: Record<StatCardTone, string> = {
  navy: 'bg-claimondo-navy/[0.06] text-claimondo-navy',
  ondo: 'bg-claimondo-ondo/10 text-claimondo-ondo',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
  neutral: 'bg-claimondo-bg text-claimondo-shield',
}

export type StatCardProps = {
  label: string
  value: string | number
  icon?: LucideIcon
  /** Akzentbalken links + Icon-Tint. Default 'neutral'. */
  tone?: StatCardTone
  /** Kleine Sub-Zeile unter dem Wert (z.B. „davon 3 abgeschlossen", Delta zum Vormonat). */
  hint?: React.ReactNode
  /** Macht die ganze Karte zu einem Link. */
  href?: string
  className?: string
}

export function StatCard({ label, value, icon, tone = 'neutral', hint, href, className }: StatCardProps) {
  const body = (
    <Card className={`border-l-4 ${ACCENT_BORDER[tone]} p-5 ${href ? 'transition-shadow hover:shadow-claimondo-md' : ''} ${className ?? ''}`}>
      <Row className="items-start justify-between gap-3">
        <Stack className="gap-1.5 min-w-0">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-claimondo-shield">{label}</Text>
          <Text className="text-2xl font-black tabular-nums text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{value}</Text>
          {hint != null ? <Text className="text-xs text-claimondo-shield">{hint}</Text> : null}
        </Stack>
        {icon ? (
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${ICON_BG[tone]}`}>
            <Icon icon={icon} className="h-5 w-5" />
          </span>
        ) : null}
      </Row>
    </Card>
  )
  return href ? <Link href={href} className="block">{body}</Link> : body
}
```
*(Hinweis: `Card`/`Stack`/`Row`/`Text`/`Icon` aus `@/components/primitives` — prüfe deren exakte Props in `src/components/primitives/*/*.types.ts` und passe an, falls `Icon` z.B. `name` statt `icon` erwartet bzw. `Card` keine `className` durchreicht; dann den Wrapper mit `primitives.Box className=…` lösen. Die Token-Anbindung — `var(--brand-*)`-Toleranz für die SV-Whitelabel-Welt — kommt automatisch über die `claimondo-*`-Tailwind-Klassen, weil `globals.css` die auf `var(--brand-*)` umbiegt.)*

- [ ] **Step 2: `KpiCards.tsx` migrieren** — lösche die lokale Card-Map/-Component, importiere `{ StatCard } from '@/components/shared/StatCard'`, rendere `<StatCard label=… value=… icon=… tone=… hint=… href=… />` pro KPI (die bisherigen `bg`/`iconColor`/`hint`/`href`-Werte mappen auf `tone`/`hint`/`href`).
- [ ] **Step 3: `FinanceClient.tsx` migrieren** (lokales `function KpiCard`) — analog.
- [ ] **Step 4: `TeamClient.tsx` migrieren** (lokales `function StatCard`) — analog.
- [ ] **Step 5: `MaklerDashboard.tsx` migrieren** — `function StatCard` UND `function StatCardProvisionen` löschen; `StatCardProvisionen` wird zu `<StatCard label="Provision …" value={…} tone="success" hint={…} />`.
- [ ] **Step 6: `MaklerPromo.tsx` migrieren** (lokales `function StatCard`) — analog.

- [ ] **Step 7: Typecheck** — `npx tsc --noEmit` → keine Fehler. `grep -rn "function StatCard\|function KpiCard\|function KpiBox\|StatCardProvisionen" src/components src/app` → leer.

- [ ] **Step 8: Commit**
```bash
git add src/components/shared/StatCard.tsx src/app/admin/_components/KpiCards.tsx "src/app/admin/finance/(hub)/FinanceClient.tsx" src/app/gutachter/team/TeamClient.tsx src/components/makler/MaklerDashboard.tsx src/components/makler/MaklerPromo.tsx
git commit -m "refactor(frontend): shared/StatCard extrahiert, 5 Inline-StatCard/KpiCard migriert

Audit:
- Build: tsc --noEmit grün
- UI: gleiche Optik (weiße Card, 4px-Akzentbalken, Icon-Badge, großer tabular-nums-Wert)
- Redundanz: 5× inline StatCard/KpiCard/KpiBox + StatCardProvisionen entfernt (~200 LOC); gebaut auf primitives/*
- Dead-Code: lokale Card-Komponenten weg
- Spec: KOMPONENTEN-SET-POLICY (shared/* auf primitives) + Audit R3/R-S3
- Inkonsistenz: eine StatCard für alle Portale; Umlaute ok
- Regression: gleiche Props; Dashboard-Daten unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `shared/SectionCard` extrahieren + 3 Inline-`function Card` migrieren + `TaskCreateModal.tsx` löschen

**Files:**
- Create: `src/components/shared/SectionCard.tsx`
- Delete: `src/components/tasks/TaskCreateModal.tsx` (0 externe Consumer — verifiziert per `grep -rln "TaskCreateModal" src` → nur die Datei selbst)
- Modify: `src/app/faelle/[id]/_stammdaten/Sections.tsx` (lokales `function Card` ~Z. 38), `src/app/faelle/[id]/_prozess/Sections.tsx` (lokales `function Card` ~Z. 40), `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` (lokales `function Card` ~Z. 447), `src/components/makler/MaklerSettings.tsx` (lokales `function SectionCard` ~Z. 112), `src/app/kunde/KundeBetreuerStrip.tsx` (lokales `function Card` ~Z. 23)

- [ ] **Step 1: `shared/SectionCard.tsx` anlegen**:
```tsx
// AAR-frontend-konsolidierung-p1: Zentrale Section-Card (weiße Card mit
// optionalem Icon-Badge-Header + Body). Ersetzt ~5 inline-reimplementierte
// function Card/SectionCard (siehe FRONTEND-REDUNDANZ-AUDIT R6). Gebaut auf
// primitives.Card.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/primitives'

export type SectionCardProps = {
  title?: string
  icon?: LucideIcon
  /** Kleine Zeile unter dem Titel. */
  hint?: ReactNode
  /** Rechts im Header (z.B. ein „Bearbeiten"-Button). */
  headerAction?: ReactNode
  children: ReactNode
  className?: string
  /** padding-Variante: 'md' (default, p-5) oder 'lg' (p-7/p-8 für Settings-Sektionen). */
  size?: 'md' | 'lg'
}

export function SectionCard({ title, icon: IconRef, hint, headerAction, children, className, size = 'md' }: SectionCardProps) {
  const pad = size === 'lg' ? 'p-7 sm:p-8' : 'p-5'
  return (
    <Card className={`${pad} ${className ?? ''}`}>
      {(title || headerAction) ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {IconRef ? (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
                <IconRef className="h-4.5 w-4.5 text-claimondo-ondo" />
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? <h3 className="text-base font-bold text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{title}</h3> : null}
              {hint ? <p className="text-xs text-claimondo-shield mt-0.5">{hint}</p> : null}
            </div>
          </div>
          {headerAction ? <div className="flex-shrink-0">{headerAction}</div> : null}
        </div>
      ) : null}
      {children}
    </Card>
  )
}
```
*(Wenn `primitives.Card` keine `className` durchreicht oder kein `p-`-Padding erlaubt: stattdessen `primitives.Box` mit `bg-white rounded-ios-md border border-claimondo-border` nutzen — aber prüfe zuerst `Card.types.ts`/`Card.web.tsx`.)*

- [ ] **Step 2: 3 Inline-`function Card` (Fall-Stammdaten/-Prozess + Phase4) migrieren** — in `_stammdaten/Sections.tsx`, `_prozess/Sections.tsx`, `Phase4Stammdaten.tsx`: lösche `function Card({icon,title,children}) {…}`, importiere `{ SectionCard } from '@/components/shared/SectionCard'`, ersetze `<Card icon={…} title="…">…</Card>` durch `<SectionCard icon={…} title="…">…</SectionCard>`.
- [ ] **Step 3: `MaklerSettings.tsx` migrieren** — `function SectionCard` löschen, `shared/SectionCard` mit `size="lg"` nutzen.
- [ ] **Step 4: `KundeBetreuerStrip.tsx` migrieren** (lokales `function Card`) — analog.
- [ ] **Step 5: `TaskCreateModal.tsx` löschen** — `git rm src/components/tasks/TaskCreateModal.tsx`. (Vorher nochmal `grep -rn "TaskCreateModal" src` → muss leer sein außer der Datei selbst.)

- [ ] **Step 6: Typecheck + Build** (Routen unter `faelle/[id]` betroffen → voller Build) — `npm run build` → grün. `grep -rn "function Card\b" src/components src/app | grep -v "ui/\|primitives/\|shared/"` → leer (bzw. nur noch nicht-relevante Treffer).

- [ ] **Step 7: Commit**
```bash
git add src/components/shared/SectionCard.tsx "src/app/faelle/[id]/_stammdaten/Sections.tsx" "src/app/faelle/[id]/_prozess/Sections.tsx" "src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx" src/components/makler/MaklerSettings.tsx src/app/kunde/KundeBetreuerStrip.tsx
git rm src/components/tasks/TaskCreateModal.tsx
git commit -m "refactor(frontend): shared/SectionCard extrahiert (5 Inline-Card migriert), TaskCreateModal gelöscht

Audit:
- Build: npm run build grün (faelle/[id]-Routen betroffen)
- UI: gleiche Optik (weiße Card + optionaler Icon-Badge-Header)
- Redundanz: 5× inline function Card/SectionCard entfernt (~80 LOC + ~78 latente Stellen jetzt mit Ziel-Komponente); TaskCreateModal (107 LOC, 0-Consumer-Dup von TaskAnlegenModal) gelöscht
- Dead-Code: lokale Card-Funktionen + TaskCreateModal weg
- Spec: KOMPONENTEN-SET-POLICY (shared/* auf primitives) + Audit R6/R15
- Inkonsistenz: eine SectionCard; Umlaute ok
- Regression: gleiche Semantik; TaskAnlegenModal (der echte Consumer-Pfad) unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `shared/forms/TextField` + `SelectField` extrahieren + ~13 Inline-`function Field` migrieren

**Files:**
- Create: `src/components/shared/forms/TextField.tsx`, `src/components/shared/forms/SelectField.tsx`, `src/components/shared/forms/index.ts`
- Modify: `src/app/admin/sachverstaendige/anlegen/SoloAnlegenWizard.tsx`, `…/BueroAnlegenWizard.tsx`, `…/AkademieAnlegenWizard.tsx`, `src/app/admin/faelle/anlegen/AnlegenFallClient.tsx`, `src/app/admin/communities/CommunityAnlegenWizard.tsx`, `src/app/admin/einstellungen/vertraege/VertraegeEditorClient.tsx`, `src/app/admin/team/[id]/MitarbeiterDetail.tsx`, `src/app/gutachter/onboarding/buero/BueroOnboardingClient.tsx`, `src/app/gutachter-partner/WaitlistApply.tsx`, `src/app/**/mietwagen/MietwagenEditCard.tsx`, `src/components/kb/VsKorrespondenzCard.tsx`, `src/app/kunde/ClaimSummary.tsx` (jeweils lokales `function Field` ~ identisch)

> **Achtung:** Das ist die **solid**-Field-Variante (`bg-claimondo-bg border rounded-xl px-3 py-2.5 focus:ring-[#1E3A5F]`), NICHT die Glass-Variante (`shared/glass/GlassInput`, `onboarding/fields/TextField`). Glass-Felder bleiben unangetastet (gehören zur Wizard-Vereinheitlichung in Phase 2).

- [ ] **Step 1: `shared/forms/TextField.tsx` anlegen**:
```tsx
// AAR-frontend-konsolidierung-p1: Zentrales Solid-Text-Feld (Label oben +
// Input + optionaler Error). Ersetzt ~13 inline-reimplementierte function Field
// (siehe FRONTEND-REDUNDANZ-AUDIT R1). Controlled.
import type { InputHTMLAttributes, ReactNode } from 'react'

const INPUT_CLS =
  'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-60'

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label?: ReactNode
  error?: string | null
  hint?: ReactNode
  className?: string
  inputClassName?: string
}

export function TextField({ label, error, hint, className, inputClassName, id, ...inputProps }: TextFieldProps) {
  const fieldId = id ?? (typeof label === 'string' ? `tf-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {label ? <label htmlFor={fieldId} className="text-xs font-semibold text-claimondo-shield">{label}</label> : null}
      <input id={fieldId} className={`${INPUT_CLS} ${error ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-300/30' : ''} ${inputClassName ?? ''}`} {...inputProps} />
      {error ? <span className="text-xs text-rose-700">{error}</span> : hint ? <span className="text-xs text-claimondo-shield">{hint}</span> : null}
    </div>
  )
}
```

- [ ] **Step 2: `shared/forms/SelectField.tsx` anlegen** (analog, mit `<select>` statt `<input>`; `options?: Array<{value:string;label:string}>` ODER `children` für `<option>`s):
```tsx
import type { SelectHTMLAttributes, ReactNode } from 'react'
const SELECT_CLS = 'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-60'
export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  label?: ReactNode; error?: string | null; hint?: ReactNode; className?: string
  options?: Array<{ value: string; label: string }>
}
export function SelectField({ label, error, hint, className, options, children, id, ...rest }: SelectFieldProps) {
  const fieldId = id ?? (typeof label === 'string' ? `sf-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {label ? <label htmlFor={fieldId} className="text-xs font-semibold text-claimondo-shield">{label}</label> : null}
      <select id={fieldId} className={`${SELECT_CLS} ${error ? 'border-rose-400' : ''}`} {...rest}>
        {options ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : children}
      </select>
      {error ? <span className="text-xs text-rose-700">{error}</span> : hint ? <span className="text-xs text-claimondo-shield">{hint}</span> : null}
    </div>
  )
}
```

- [ ] **Step 3: `shared/forms/index.ts`** — `export { TextField } from './TextField'; export { SelectField } from './SelectField'`.

- [ ] **Step 4: Migrieren — exemplarisch `SoloAnlegenWizard.tsx`** — lösche `function Field({label, ...props}) {…}`, importiere `{ TextField } from '@/components/shared/forms'`, ersetze `<Field label="Firma" value={…} onChange={…} />` durch `<TextField label="Firma" value={…} onChange={…} />`. (Die bisherigen `function Field` sind praktisch byte-gleich — die Migration ist mechanisch: `Field` → `TextField`, ggf. `error`-Prop durchreichen.)

- [ ] **Step 5: Die übrigen ~12 Files migrieren** — gleiche Mechanik wie Step 4 in: `BueroAnlegenWizard`, `AkademieAnlegenWizard`, `AnlegenFallClient`, `CommunityAnlegenWizard`, `VertraegeEditorClient`, `MitarbeiterDetail`, `BueroOnboardingClient`, `WaitlistApply` (gutachter-partner), `MietwagenEditCard`, `VsKorrespondenzCard`, `ClaimSummary` (kunde). Wo ein File ein lokales `function Select`/Dropdown hat: → `SelectField`.

- [ ] **Step 6: Typecheck + Build** (Routen betroffen → `npm run build`) → grün. `grep -rn "function Field\b" src/app src/components | grep -v "shared/forms\|onboarding/fields\|primitives/"` → leer.

- [ ] **Step 7: Commit**
```bash
git add src/components/shared/forms/ src/app src/components
git commit -m "refactor(frontend): shared/forms/{TextField,SelectField} extrahiert, ~13 Inline-Field migriert

Audit:
- Build: npm run build grün
- UI: gleiche Optik (Label oben, Solid-Input, Focus-Ring) — Token-konsistent (rounded-ios-sm, claimondo-ondo statt Hex-#1E3A5F)
- Redundanz: ~13× nahezu byte-gleiches function Field entfernt (~260 LOC)
- Dead-Code: lokale Field-Funktionen weg
- Spec: KOMPONENTEN-SET-POLICY (shared/*) + Audit R1
- Inkonsistenz: ein Solid-Text-/Select-Feld; Glass-Felder (shared/glass, onboarding/fields) bewusst unangetastet (Phase 2); Umlaute ok
- Regression: controlled, gleiche value/onChange-Semantik

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `MaklerShell` → `@/components/shared/portal-nav/PortalNav` (dark-Variante)

**Files:**
- Modify: `src/components/makler/MaklerShell.tsx` (178 Z. → ~50-60 Z. Thin-Wrapper)

**Template:** `src/app/admin/_components/AdminNav.tsx` (Thin-Wrapper über `PortalNav` mit `NAV_ITEMS: PortalNavItem[]`, `MOBILE_ITEMS`, Footer-/Top-Slots). Lies vor dem Umbau: `src/components/shared/portal-nav/PortalNav.tsx` (Props: `variant='dark'|'light'`, `items`, `mobileItems`, plus die Slot-Props — exakte Namen aus der Datei) + `src/app/dispatch/_components/DispatchNav.tsx` (zweites Beispiel).

- [ ] **Step 1: `MaklerShell.tsx` als Thin-Wrapper neu schreiben**
- Behalte die Props-Signatur (`makler{id,firma,ansprechpartner_vorname,status}`, `email`, `userId`, `children`).
- Definiere `MAKLER_NAV_ITEMS: PortalNavItem[]` aus den bisherigen Sidebar-Links (Dashboard `/makler`, Leads `/makler/leads`, Akten `/makler/akten`, Abrechnungen `/makler/abrechnungen`, Promo & QR `/makler/promo`, Einstellungen `/makler/einstellungen`) — mit den passenden lucide-Icons.
- `MAKLER_MOBILE_ITEMS` = die 4-5 wichtigsten für die Bottom-Nav.
- Rendere `<PortalNav variant="dark" items={MAKLER_NAV_ITEMS} mobileItems={MAKLER_MOBILE_ITEMS} email={email} userId={userId} initials={…} {/* + Footer-/Top-Slots: Logout-Form, ggf. TasksPill/UpdatesNav/SupportButton — wie in AdminNav */}>{children}</PortalNav>`.
- Die atmosphärischen Background-Radials, das `style={{ background: '#f2f3f7' }}` und die `text-claimondo-shield`-Inkonsistenz verschwinden, weil `PortalNav` das alles standardisiert macht (B3 geheilt).
- Falls `MaklerShell` aktuell noch `children` in ein eigenes `<main className="…">`-Wrapper legt mit Makler-spezifischem Padding: das übernimmt `PortalNav` (bzw. der `children`-Slot dort) — angleichen an `AdminNav`/Admin-Layout.

- [ ] **Step 2: Typecheck + Build** (Layout-Komponente → `npm run build`) → grün.

- [ ] **Step 3: Smoke (lokal, optional)** — `npm run start` + `curl -s -H "Host: localhost:3000" http://localhost:3000/makler/...` (braucht Login — alternativ visuell prüfen wenn ein Dev-Server läuft): Makler-Sidebar zeigt die 6 Items, aktives Item korrekt hervorgehoben (Navy-BG, weiße Schrift — nicht mehr Shield), Mobile-Bottom-Nav vorhanden, Logout funktioniert.

- [ ] **Step 4: Commit**
```bash
git add src/components/makler/MaklerShell.tsx
git commit -m "refactor(frontend): MaklerShell → shared PortalNav (dark-Variante)

Audit:
- Build: npm run build grün
- UI: Sidebar/Mobile-Nav jetzt im PortalNav-Standard; aktives Item Navy statt Shield (B3 geheilt); 6 Items unverändert erreichbar
- Redundanz: ~120 LOC dupliziertes Shell-Markup (Sidebar, Mobile-Bottom-Nav, Logout-Form, Background-Radials) entfernt — jetzt Thin-Wrapper wie AdminNav/DispatchNav
- Dead-Code: eigene isActive-/Item-Render-Logik + Hard-Hex #f2f3f7 weg
- Spec: KOMPONENTEN-SET-POLICY + Audit R-S1/B3
- Inkonsistenz: einheitliche Portal-Nav; Umlaute ok
- Regression: gleiche Routen/Items; GutachterShell + Kunde-Layout bewusst NICHT migriert (Whitelabel/Feldmodus/Branding)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 5 Layouts → `requirePortalAccess()`

**Files:**
- Modify: `src/app/admin/layout.tsx`, `src/app/gutachter/layout.tsx`, `src/app/kunde/layout.tsx`, `src/app/mitarbeiter/layout.tsx`, `src/app/makler/(shell)/layout.tsx`

**Template:** `src/app/dispatch/layout.tsx` + `src/app/kanzlei/layout.tsx` (nutzen `requirePortalAccess()` bereits). Helper: `src/lib/auth/portal-guard.ts` → `requirePortalAccess(allowedRollen: UserRolle[])` → `{ supabase, user:{id,email}, profile:{rolle,vorname,nachname}, displayName, initials }`. **Wirft via `redirect()`** — die Promise löst nur, wenn der User berechtigt ist.

- [ ] **Step 1: `admin/layout.tsx` migrieren**
Ersetze den Block (`createClient` → `getUser` → redirect `/login` → `profiles.select('rolle')` → `profileErr`-Check → `profileRolle !== 'admin'`-Redirect → `initials` bauen) durch:
```tsx
const { supabase, user, displayName, initials } = await requirePortalAccess(['admin'])
```
(`import { requirePortalAccess } from '@/lib/auth/portal-guard'`). **Behalte** alle Admin-spezifischen Folge-Queries unverändert (z.B. `meineTasksCount` aus `tasks`). `user.email` statt `user.email ?? ''` anpassen (`user.email` ist `string | null`).

- [ ] **Step 2: `gutachter/layout.tsx` migrieren** — `requirePortalAccess(['sachverstaendiger'])`; **behalte** den `getGutachterForUser`-Lookup + alles was die GutachterShell mit `theme`/`standortLat/Lng`/Whitelabel braucht. (Die Shell selbst bleibt unverändert — nur der Guard-Block am Anfang.)
- [ ] **Step 3: `kunde/layout.tsx` migrieren** — `requirePortalAccess(['kunde'])`; **behalte** `resolveKundenTheme`, die `claimFaelleByEmail`/Onboarding-Redirect-Logik, die Sidebar-Kontakt-Cards.
- [ ] **Step 4: `mitarbeiter/layout.tsx` migrieren** — `requirePortalAccess(['kundenbetreuer'])` (Rollenname gegen `UserRolle` in `src/lib/auth/guards.ts` prüfen); behalte mitarbeiter-spezifische Queries.
- [ ] **Step 5: `makler/(shell)/layout.tsx` migrieren** — `requirePortalAccess(['makler'])`; **behalte** den `makler`-Row-Lookup + die `status !== 'aktiv'` → `/makler/pending` / fehlende Row → `/makler/onboarding`-Weiche.

- [ ] **Step 6: Typecheck + Build** (Layouts → `npm run build`) → grün.

- [ ] **Step 7: Memory-Hinweis** (kein Code) — `project_appshell_refactor`-Memory aktualisieren: der Guard-Teil *ist* extrahiert + jetzt überall genutzt; nur der Render-Teil der Shells bleibt getrennt.

- [ ] **Step 8: Commit**
```bash
git add src/app/admin/layout.tsx src/app/gutachter/layout.tsx src/app/kunde/layout.tsx src/app/mitarbeiter/layout.tsx "src/app/makler/(shell)/layout.tsx"
git commit -m "refactor(frontend): 5 Portal-Layouts → requirePortalAccess()

Audit:
- Build: npm run build grün
- UI: keine sichtbare Änderung (gleicher Auth-/Rollen-Guard, nur dedupliziert)
- Redundanz: ~80 LOC dupliziertes Guard-Boilerplate (getUser+profile-select+role-check+redirect+initials) entfernt — dispatch+kanzlei zeigten das Pattern schon
- Dead-Code: 5× Inline-Guard weg
- Spec: KOMPONENTEN-SET-POLICY + Audit R-S2
- Inkonsistenz: einheitlicher Portal-Guard; Portal-spezifische Folge-Queries (sv-Lookup, makler-Status, kunde-Onboarding) bleiben im jeweiligen Layout; Umlaute ok
- Regression: identisches Guard-Verhalten (Query-Error → /login, falsche Rolle → roleToPath); Render-Teil der Shells unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Status-Maps zentralisieren — `kanzlei/dashboard` + `MaklerAktenList`

**Files:**
- Modify: `src/app/kanzlei/dashboard/page.tsx` (lokales `STATUS_PILL` ~Z. 18-65 + `PHASE_LABEL`)
- Modify: `src/components/makler/MaklerAktenList.tsx` (lokales `PHASE_COLORS` ~Z. 266-330)
- Ggf. Modify: `src/lib/statusLabels.ts` (Label-Texte ergänzen falls Makler/Kanzlei welche brauchen die fehlen)

`src/lib/statusLabels.ts` exportiert: `FALL_STATUS_LABELS`, `FALL_STATUS_COLORS`, `LEAD_PHASE_LABELS`, `getStatusLabel`, … · `src/components/shared/FallStatusBadge.tsx` rendert `<FallStatusBadge status={…} />` (nutzt intern die zentralen Maps).

- [ ] **Step 1: `kanzlei/dashboard/page.tsx`** — lösche `STATUS_PILL` (die eigene Hex-Map) + den lokalen `PHASE_LABEL`. Ersetze `<span className={STATUS_PILL[f.status]…}>` durch `<FallStatusBadge status={f.status} />` (`import { FallStatusBadge } from '@/components/shared/FallStatusBadge'`). Phase-Labels: nutze `LEAD_PHASE_LABELS` aus `lib/statusLabels.ts` (oder `FALL_STATUS_LABELS` je nachdem welches Feld angezeigt wird) statt der lokalen Map. → heilt die optische Inkonsistenz (Kanzlei zeigte Fall-Status in anderen Farben als alle anderen Portale).

- [ ] **Step 2: `MaklerAktenList.tsx` `PHASE_COLORS`** — wenn die ~25 Einträge ein Superset/Variante der zentralen `FALL_STATUS_COLORS`/`FALL_STATUS_LABELS` sind: ersetze `PHASE_COLORS[phase]` durch die zentralen Maps; wo Makler kürzere Labels braucht (z.B. „Gutachten da" statt „Gutachten eingegangen"), ergänze diese als optionalen `FALL_STATUS_LABELS_SHORT`-Export in `lib/statusLabels.ts` und nutze den — **nicht** eine neue lokale Map bauen. Die `PhasePill`-Komponente in `MaklerAktenList` bleibt (oder → `FallStatusBadge`, falls die Optik passt).

- [ ] **Step 3: Typecheck + Build** (kanzlei/dashboard-Route → `npm run build`) → grün.

- [ ] **Step 4: Commit**
```bash
git add src/app/kanzlei/dashboard/page.tsx src/components/makler/MaklerAktenList.tsx src/lib/statusLabels.ts
git commit -m "refactor(frontend): kanzlei-Dashboard + MaklerAktenList → zentrale Status-Maps + FallStatusBadge

Audit:
- Build: npm run build grün
- UI: Kanzlei zeigt Fall-Status jetzt in denselben Farben wie alle anderen Portale (vorher abweichende Hex-Werte → Inkonsistenz behoben)
- Redundanz: lokale STATUS_PILL/PHASE_LABEL/PHASE_COLORS-Maps entfernt (~75 LOC), nutzen jetzt lib/statusLabels.ts
- Dead-Code: lokale Maps weg; ggf. ein FALL_STATUS_LABELS_SHORT-Export ergänzt
- Spec: KOMPONENTEN-SET-POLICY + Audit R8 (Teil)
- Inkonsistenz: eine Status-Farb-/Label-Quelle; Umlaute ok
- Regression: gleiche Status-Werte, nur konsistente Farben/Labels

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `ui/button`-App-Consumer → `primitives.Button`; überlappende `ui/*`-Atoms löschen

**Files:**
- Modify: `src/app/schaden-melden/schritt-1/Schritt1Client.tsx`, `…/schritt-1/voice/VoiceRecorderClient.tsx`, `…/schritt-2/analyse/AnalyseClient.tsx`, `…/schritt-2/gegner/GegnerClient.tsx`, `…/schritt-2/Schritt2aClient.tsx`, `…/schritt-3/Schritt3Client.tsx`, `…/schritt-4/SignupClient.tsx`, `src/components/claims/InviteGegnerModal.tsx` (alle importieren `@/components/ui/button`)
- Delete: `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/avatar.tsx` (0 Importe — verifiziert)

> **`ui/button.tsx` NICHT löschen** — `src/components/ui/dialog.tsx` und `src/components/ui/sheet.tsx` (beide bleiben als Rich-Components) importieren es intern. Nur die **App-Consumer** auf `primitives.Button` migrieren, damit App-Code der Policy folgt.

- [ ] **Step 1: Die 8 App-Consumer migrieren** — in jedem File: `import { Button } from '@/components/ui/button'` → `import { Button } from '@/components/primitives'` (bzw. den primitives-Barrel-Pfad — prüfe `src/components/primitives/index.ts`). Props anpassen: shadcn-`<Button variant="…" size="…">` → `primitives.Button`-Props (`tone`/`size` lt. `Button.types.ts` — typisch `tone='navy'|'ondo'|'ghost'|'destructive'|'success'`, `size='sm'|'md'|'lg'`; das shadcn-`variant="outline"` → `tone="ghost"` mit `outline`-Prop falls vorhanden, `variant="ghost"` → `tone="ghost"`, `variant="destructive"` → `tone="destructive"`, default → `tone="navy"`). Lies `src/components/primitives/Button/Button.types.ts` für die exakte API.

- [ ] **Step 2: Verifizieren dass `ui/card`/`ui/badge`/`ui/avatar` wirklich 0 Importe haben** — `grep -rn "from '@/components/ui/card'\|from '@/components/ui/badge'\|from '@/components/ui/avatar'" src` → leer. Dann `git rm src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/avatar.tsx`.

- [ ] **Step 3: Typecheck + Build** (schaden-melden-Routen → `npm run build`) → grün.

- [ ] **Step 4: Commit**
```bash
git add src/app/schaden-melden src/components/claims/InviteGegnerModal.tsx
git rm src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/avatar.tsx
git commit -m "refactor(frontend): ui/button-App-Consumer → primitives.Button; ui/{card,badge,avatar} gelöscht (0 Importe)

Audit:
- Build: npm run build grün
- UI: keine sichtbare Änderung (primitives.Button mappt die shadcn-Varianten 1:1 auf tone/size)
- Redundanz: 8 App-Consumer von ui/button auf den Atom-Layer migriert; ui/card/badge/avatar (je 0 Importe, Atom-Duplikate) gelöscht
- Dead-Code: 3 ungenutzte ui/*-Files weg; ui/button bleibt (wird von ui/dialog + ui/sheet intern genutzt)
- Spec: KOMPONENTEN-SET-POLICY (Atoms = primitives/*, ui/* nur Rich) + Audit
- Inkonsistenz: App-Buttons kommen jetzt aus primitives/*; Umlaute ok
- Regression: gleiche Button-Semantik; ui/dialog/ui/sheet unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Drift-Bremse — `scripts/check-component-set.mjs`

**Files:**
- Create: `scripts/check-component-set.mjs`
- Modify: `package.json` (Script-Eintrag `"check:component-set": "node scripts/check-component-set.mjs"`)
- Optional: `.github/workflows/ci.yml` (Schritt `node scripts/check-component-set.mjs || true` — als `--warn`, CI nicht hart blocken)

- [ ] **Step 1: `scripts/check-component-set.mjs` anlegen**:
```js
#!/usr/bin/env node
// Drift-Bremse: warnt bei handgerollten Komponenten in src/app + src/components
// (ausgenommen ui/, primitives/, shared/). Nur --warn — blockt CI nicht hart.
// Siehe AGENTS.md §claimondo-component-set + docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files "src/app/**/*.tsx" "src/components/**/*.tsx"', { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter(f => !f.includes('/components/ui/') && !f.includes('/components/primitives/') && !f.includes('/components/shared/'))

const PATTERNS = [
  { re: /<button\b[^>]*className=["'`][^"'`]*\b(rounded|bg-claimondo-(navy|ondo|shield))\b/, msg: 'handgerollter <button> mit Styling → primitives.Button' },
  { re: /<div\b[^>]*className=["'`][^"'`]*bg-white[^"'`]*rounded[^"'`]*border[^"'`]*claimondo-border/, msg: 'handgerollte Section-Card-<div> → primitives.Card / shared/SectionCard' },
  { re: /function\s+(StatCard|KpiCard|KpiBox|FilterChip|StatusPill|MiniDrawer|SectionCard|InfoRow|InfoCard)\b/, msg: 'lokale Reimplementierung eines shared-Pendants' },
]
let hits = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const { re, msg } of PATTERNS) {
    if (re.test(src)) { console.warn(`[component-set] ${f}: ${msg}`); hits++; break }
  }
}
console.log(`[component-set] ${hits} Datei(en) mit Drift-Verdacht (${files.length} geprüft). Policy: AGENTS.md §claimondo-component-set`)
process.exit(0) // immer 0 — nur --warn
```

- [ ] **Step 2: `package.json`-Script ergänzen** — unter `"scripts"`: `"check:component-set": "node scripts/check-component-set.mjs"`.

- [ ] **Step 3: Lokal laufen lassen** — `node scripts/check-component-set.mjs` → gibt die Anzahl der Drift-Verdachts-Dateien aus (zur Baseline-Dokumentation; nach Phase 1 sollte sie deutlich kleiner sein als vor Phase 1).

- [ ] **Step 4: Commit**
```bash
git add scripts/check-component-set.mjs package.json
git commit -m "chore(frontend): Drift-Bremse scripts/check-component-set.mjs (--warn)

Audit:
- Build: node scripts/check-component-set.mjs läuft (exit 0, nur Warnungen)
- UI: n/a
- Redundanz: n/a (Tooling)
- Dead-Code: nichts
- Spec: KOMPONENTEN-SET-POLICY (Lint-Bremse)
- Inkonsistenz: macht künftige Handroll-Drift sichtbar; Umlaute ok
- Regression: blockt CI nicht (exit 0), rein informativ

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Voller Build + Push + PR

**Files:** keine — Verifikation + Integration.

- [ ] **Step 1: Voller Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün. (Reine Refactors — keine neuen Routes/Validatoren, aber Layouts + viele Komponenten geändert → voller Build.)
- [ ] **Step 2: `npx tsc --noEmit`** → keine Fehler. `node scripts/check-component-set.mjs` → die Drift-Zahl ist deutlich kleiner als vor Phase 1.
- [ ] **Step 3: Push** — `git push -u origin kitta/aar-frontend-konsolidierung-p1`
- [ ] **Step 4: PR öffnen** — `gh pr create --base main --title "refactor(frontend): Konsolidierung Phase 1 — Inline-Primitive entdoppeln, MaklerShell→PortalNav, Layouts→requirePortalAccess, ui/*-Atoms aufräumen" --body "<Zusammenfassung der 11 Tasks + Verweis auf docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md + docs/superpowers/plans/2026-05-12-frontend-konsolidierung-phase-1.md. ~1.000+ LOC dedupliziert. CI: build grün, e2e testet Prod (siehe Memory ci-e2e-tests-prod) — pre-merge nicht grün, ist erwartet.>"`
- [ ] **Step 5: PR-Link an Aaron melden** — nicht selbst mergen (Memory `kein_auto_merge`).

---

## Self-Review

- **Spec-Coverage:** Quick-Wins aus `KOMPONENTEN-SET-POLICY.md` §Cleanup: FilterChip→ui/Chip (T2) ✓ · StatusPill→StatusBadge + inline-EmptyState→shared (T3) ✓ · shared/StatCard (T4) ✓ · shared/forms/TextField (T6) ✓ · shared/SectionCard + TaskCreateModal löschen (T5) ✓ · MaklerShell→PortalNav (T7) ✓ · 5 Layouts→requirePortalAccess (T8) ✓ · B1/B2-Bugs (T1) ✓ · kanzlei-/Makler-Status-Maps (T9) ✓ · überlappende ui/*-Atoms löschen + ui/button-Consumer migrieren (T10) ✓ · Lint-Bremse (T11) ✓ · Build+PR (T12) ✓. Mid-Term-Punkte (MaklerAkteDetail→shared/fall-*, Wizard-Engine, Stammdaten-Renderer-Konsolidierung, restliche Status-Maps, `<table>`→`ui/table`) sind **bewusst NICHT** in Phase 1 — kommen in Phase 2 (eigener Plan).
- **Placeholder-Scan:** Code-Steps zeigen konkreten Code (die 3 neuen shared-Komponenten + das Lint-Script vollständig); Migrations-Tasks zeigen das Before/After-Pattern + die vollständige Datei-Liste. Wo der executing Agent die exakte Primitives-/PortalNav-API selbst nachlesen muss, ist das explizit als Hinweis vermerkt (kein Placeholder, sondern bewusste Delegation an die Quelle, weil die API hier nicht 1:1 reproduziert werden kann ohne sie zu raten).
- **Typ-Konsistenz:** `StatCard`/`StatCardProps`/`StatCardTone`, `SectionCard`/`SectionCardProps`, `TextField`/`TextFieldProps`, `SelectField`/`SelectFieldProps` durchgängig so benannt; `requirePortalAccess` mit dem Return-Shape aus `portal-guard.ts`; `Chip`/`StatusBadge`/`EmptyState`-APIs wie in den existierenden Files.

---

*Reihenfolge: T1 (Bugs, risikolos) → T2/T3 (Drop-in-Ersatz) → T4/T5/T6 (neue shared-Komponenten + Migration) → T7/T8 (Shell/Layout) → T9 (Status-Maps) → T10 (ui/*-Aufräumen) → T11 (Lint) → T12 (Build+PR). Jeder Task ist ein eigener Commit; bei subagent-getriebener Ausführung: ein Subagent pro Task, Review dazwischen. Empfehlung: in einem eigenen git-Worktree (parallele Agenten).*
