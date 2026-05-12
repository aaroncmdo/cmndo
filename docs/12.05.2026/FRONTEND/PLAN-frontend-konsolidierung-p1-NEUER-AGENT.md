# Plan: Frontend-Konsolidierung Phase 1 — Übergabe an neuen Agenten

> **Selbstständig ausführbar.** Du brauchst kein Vorwissen aus der vorherigen Session.
> Quellen falls du tiefer willst: `docs/12.05.2026/FRONTEND/FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md` (das „Warum") + `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md` (die Set-Entscheidung) + der Original-Plan `docs/superpowers/plans/2026-05-12-frontend-konsolidierung-phase-1.md` (identische Tasks, etwas mehr Prosa).

**Ziel:** Quick-Win-Refactors der Frontend-Redundanz — inline-reimplementierte Primitive durch die `shared/*`-/`ui/*`-Pendants ersetzen, 3 neue `shared/*`-Komponenten extrahieren, `MaklerShell` auf `PortalNav` migrieren, 5 Layouts auf `requirePortalAccess()`, überlappende `ui/*`-Atoms löschen, eine Lint-Bremse. **Reine Refactors — keine Verhaltensänderung.**

**Architektur (Komponenten-Set-Policy):** Atom-Layer = `@/components/primitives/*` (Dual-File Web+Native, `lib/design-tokens.ts`). Composite-Layer = `@/components/shared/*` (gebaut auf primitives). Web-only Rich = `@/components/ui/*` (shadcn/Radix — nur Dialog/Sheet/Chip/Button/Tabs/Select bleiben, der Rest ist tot). Handgerollter Tailwind ist NICHT mehr der Default.

---

## Status — ✅ ABGESCHLOSSEN (12.05.2026), PR #829

Alle Tasks T1–T12 erledigt, gepusht, PR #829 (`--base main`). Voller `npm run build` final grün, `tsc --noEmit` grün nach jedem Task.

| Commit | Task | Inhalt |
|---|---|---|
| `f3296411` | **T1** ✅ | doppelter `<Link>`/Kommentar in `GutachterShell.tsx` / `AdminNav.tsx` raus |
| `bdef9a4c` | **T2** ✅ | inline `function FilterChip` (3×) → `@/components/ui/Chip` |
| `26f91178` | **T3** ✅ | inline `StatusPill` → `shared/StatusBadge`, inline `EmptyState` → `shared/EmptyState` (`MaklerLeadsTable`, `MaklerAktenList`, `PflichtdokumenteSection`). **Abw.:** `LivePreview.StatusPill` nicht migriert (Laufzeit-Theme-Hex, inkompatibel mit StatusBadge tone/colorCls). |
| `17d436de` | **T4** ✅ | `shared/StatCard.tsx` neu + 5 Inline migriert (`KpiCards`, `FinanceClient`, `TeamClient`, `MaklerDashboard`×2, `MaklerPromo`). **Abw.:** `primitives/*` haben keine `className`-API → token-gebundenes Tailwind statt `<Card className=…>`; Optik harmonisiert (FinanceClient ohne glass-light, `StatCardProvisionen` → 1 value + hint). 3× `KpiBox` (ProvisionenClient/kanzlei-board/mitarbeiter) NICHT in der Plan-Dateiliste → Phase 2. |
| `aaa0d5aa` | **T5** ✅ | `shared/SectionCard.tsx` neu + 4 Inline-`Card` migriert via dünne Adapter (`_stammdaten/Sections`, `_prozess/Sections`, `Phase4Stammdaten`, `MaklerSettings`). `TaskCreateModal.tsx` gelöscht (0 Consumer). **Abw.:** `KundeBetreuerStrip.function Card` → `BetreuerCard` umbenannt statt migriert (bespoke Trust-Card, kein Section-Card-Pattern); `SectionCard.icon` ist `ReactNode` nicht `LucideIcon`; voller Build grün. |
| `3b348edc` | **T6** ✅ | `shared/forms/{TextField,SelectField,index}` neu + 8 Inline-`Field`/`SelectField` migriert via Signatur-Adapter (Solo/Buero/AkademieAnlegenWizard, AnlegenFallClient, CommunityAnlegenWizard, VertraegeEditorClient, MitarbeiterDetail, BueroOnboardingClient). **Abw.:** ClaimSummary/StammdatenDetail (Display-Rows), VsKorrespondenzCard/MietwagenEditCard (Label-Wrapper), WaitlistApply (dark) NICHT migriert — keine Solid-Light-Inputs; Adapter behalten Namen → grep `function Field` nicht leer (gewollt); voller Build grün. |
| `91ec40be` | **T7** ✅ | `MaklerShell` → shared `PortalNav` (dark) — Thin-Wrapper wie AdminNav, B3 (`text-claimondo-shield` auf navy) geheilt, Sidebar `w-60`→`w-56`. Voller Build grün. |
| `7a092c8c` | **T8** ✅ | 5 Portal-Layouts (admin/gutachter/kunde/mitarbeiter/makler) → `requirePortalAccess()`. Portal-spezifische Folge-Queries bleiben. Memory `project_appshell_refactor` aktualisiert. **Abw.:** admin/kunde-Avatar-Initialen jetzt aus `profiles.vorname/nachname`. Voller Build grün. |
| `943f8928` | **T9** ✅ | `kanzlei/dashboard` + `MaklerAktenList` → zentrale Status-Maps + `FallStatusBadge`. `lib/statusLabels.ts` erweitert: Welle-7-Status (`in_bearbeitung`/`vs_kontakt`/`reguliert`/`abgelehnt`/`kanzlei`), `FALL_STATUS_LABELS_SHORT`, `AKTUELLE_PHASE_LABELS`. **Abw.:** Optik harmonisiert (Kanzlei-Status in 7-Slot-Tints statt eigener Hex). Voller Build grün. |
| `46c0931b` | **T10** ✅ | `ui/{card,badge,avatar}` gelöscht (0 Importe). **Abw.:** `ui/button`-App-Migration auf `primitives.Button` NICHT gemacht — API inkompatibel (`onPress` required, keine `className`, kein Icon-only-Modus) vs. die 8 Consumer im Schaden-melden-Funnel (`className`/`type="submit"`/`onClick`); `ui/button` bleibt eh (dialog/sheet nutzen es) → Phase 2. |
| `22566160` | **T11** ✅ | `scripts/check-component-set.mjs` (--warn) + `npm run check:component-set`. Baseline 203/639 Files Drift-Verdacht. |
| — | **T12** ✅ | Finaler voller Build grün, tsc grün, PR #829 erstellt. **Nicht selbst gemergt** bis Aaron-Freigabe (dann gemergt am 12.05.2026). |

**Phase-2-Backlog (offen):** `ui/button`-App-Migration (braucht `className`-Escape-Hatch in `primitives.Button`), 3× inline `KpiBox`, `MaklerAkteDetail`→`shared/fall-*`, Wizard-Engine-Vereinheitlichung, Stammdaten-Renderer-Konsolidierung, restliche Status-Maps (Termin/Abrechnung/Provision), `<table>`→`ui/table`, Glass-Felder (`shared/glass/*`, `onboarding/fields/*`).

---

## Harte Regeln (jeder Commit)

- **Nie direkt auf `main` pushen** — Feature-Branch + PR. (Du bleibst auf `kitta/aar-frontend-konsolidierung-p1`, PR erst in T12.)
- **DDL nur über supabase-CLI** — in Phase 1 irrelevant (keine DB-Änderungen).
- **Kein unbegleiteter Stash am Session-Ende.**
- **Umlaute** (echte `ä/ö/ü/ß`) in Commits/Comments/UI — Pre-Commit-Hook (`.claude/hooks/check-umlauts.mjs`) blockt ASCII-Ersatz.
- **7-Punkte-Audit im Commit-Body** (Build / UI / Redundanz / Dead-Code / Spec / Inkonsistenz / Regression). Die Commit-Messages unten sind fertig — übernehmen.
- **Kein Auto-Merge** — PR (T12) nur auf Aarons Freigabe mergen lassen.
- **Kein „Vercel"-Mention** — wir nutzen Vercel nicht mehr. Prod = VPS `app.claimondo.de`, Staging = `app.staging.claimondo.de:3001` hinter nginx-Basic-Auth (User `aaroncmdo`). Deploy via GitHub Actions, nicht erwähnen.

## Verifikation

- Reine TS/TSX-Refactors → `npx tsc --noEmit` reicht.
- **Bei Route/Layout-Änderungen** (T5, T6, T7, T8, T9, T10) → **immer voller Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (lokaler 4-GB-Build OOMt sonst). Next.js 16 findet dort Validator-Fehler die `tsc` nicht sieht.
- CI: nur der `build`-Job gatet PRs. Der `e2e`-Job läuft gegen Prod (`app.claimondo.de`) → vor Merge rot, das ist normal.
- **Prüfe vor jedem Edit** an einer neuen `shared/*`-Komponente die echte API der `primitives/*`-Bausteine in `src/components/primitives/<Name>/<Name>.types.ts` (bzw. `.web.tsx`) — die Code-Vorlagen unten nehmen `Card`/`Stack`/`Row`/`Text`/`Icon` an; falls `Icon` z.B. `name` statt `icon` will oder `Card` keine `className` durchreicht, mit `primitives.Box` + Tailwind lösen.

---

## Task 3 — `function StatusPill` → `shared/StatusBadge`; inline `EmptyState` → `shared/EmptyState`

**Files:** `src/components/makler/MaklerLeadsTable.tsx` (`function StatusPill` + `function EmptyState` + der `<EmptyState />`-Aufruf ~Z. 71), `src/components/makler/MaklerAktenList.tsx` (`function EmptyState`), `src/components/fall/PflichtdokumenteSection.tsx` (`function StatusPill`), `src/app/**/branding/LivePreview.tsx` (`function StatusPill`).

`shared/StatusBadge`: `<StatusBadge tone?='neutral'|'info'|'success'|'warning'|'danger'|'brand'|'ondo' size?='xs'|'sm' colorCls? className?>{children}</StatusBadge>` — `colorCls` = Escape-Hatch für eigene Tailwind-Klassen wenn keine Tone passt.
`shared/EmptyState` (**default export**): `<EmptyState icon?={LucideIcon} title description? action?={{label,onClick?,href?,variant?}} variant?='default'|'compact' className?>`.

- [ ] **Step 1:** In jedem der 3 StatusPill-Files: `function StatusPill(...)` + lokale `cfg`-Map löschen, Aufrufe → `<StatusBadge tone={...}>{label}</StatusBadge>`. Tone-Mapping: `amber/orange`→`warning`, `emerald/green`→`success`, `rose/red`→`danger`, `blue/sky`→`info`, `gray/slate`→`neutral`, `claimondo-navy`→`brand`, `claimondo-ondo`→`ondo`; Sonderfarben (violet, Org-Hex) → `colorCls="<bisherige Tailwind-Klasse>"`. Import: `import { StatusBadge } from '@/components/shared/StatusBadge'`.
- [ ] **Step 2:** In `MaklerLeadsTable.tsx` + `MaklerAktenList.tsx`: `function EmptyState(...)` löschen. `<EmptyState icon={Icon} title="…" description="…" />` → `import EmptyState from '@/components/shared/EmptyState'` + `<EmptyState … variant="compact" />` (falls die Inline-Variante kompakt war).
- [ ] **Step 3:** `npx tsc --noEmit` grün. `grep -rn "function StatusPill\|function EmptyState" src/components src/app` → leer.
- [ ] **Step 4: Commit**
```
refactor(frontend): inline StatusPill → shared/StatusBadge, inline EmptyState → shared/EmptyState

Audit:
- Build: tsc --noEmit grün
- UI: StatusBadge nutzt dieselben Semantic-Tints; colorCls-Escape-Hatch für Sonderfarben
- Redundanz: 3× StatusPill + 2× EmptyState inline entfernt (~150 LOC)
- Dead-Code: lokale cfg-Maps weg
- Spec: KOMPONENTEN-SET-POLICY (shared/*) + Audit R5/R7
- Inkonsistenz: einheitliche Badges/Empty-States; Umlaute ok
- Regression: gleiche Semantik; Listen-/Doku-Logik unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 4 — `shared/StatCard` extrahieren + 5 Inline migrieren

**Create:** `src/components/shared/StatCard.tsx` · **Modify:** `src/app/admin/_components/KpiCards.tsx`, `src/app/admin/finance/(hub)/FinanceClient.tsx` (`function KpiCard`), `src/app/gutachter/team/TeamClient.tsx` (`function StatCard`), `src/components/makler/MaklerDashboard.tsx` (`StatCard` + `StatCardProvisionen`), `src/components/makler/MaklerPromo.tsx`.

- [ ] **Step 1:** `src/components/shared/StatCard.tsx`:
```tsx
// AAR-frontend-konsolidierung-p1: Zentrale Metrik-Kachel. Ersetzt 5 inline
// StatCard/KpiCard/KpiBox-Varianten (FRONTEND-REDUNDANZ-AUDIT R3). Auf primitives.
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'

type StatCardTone = 'navy' | 'ondo' | 'success' | 'warning' | 'danger' | 'neutral'
const ACCENT_BORDER: Record<StatCardTone, string> = {
  navy: 'border-l-claimondo-navy', ondo: 'border-l-claimondo-ondo',
  success: 'border-l-emerald-500', warning: 'border-l-amber-500',
  danger: 'border-l-rose-500', neutral: 'border-l-claimondo-border',
}
const ICON_BG: Record<StatCardTone, string> = {
  navy: 'bg-claimondo-navy/[0.06] text-claimondo-navy', ondo: 'bg-claimondo-ondo/10 text-claimondo-ondo',
  success: 'bg-emerald-50 text-emerald-600', warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600', neutral: 'bg-claimondo-bg text-claimondo-shield',
}
export type StatCardProps = {
  label: string; value: string | number; icon?: LucideIcon
  tone?: StatCardTone; hint?: React.ReactNode; href?: string; className?: string
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
        {icon ? <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${ICON_BG[tone]}`}><Icon icon={icon} className="h-5 w-5" /></span> : null}
      </Row>
    </Card>
  )
  return href ? <Link href={href} className="block">{body}</Link> : body
}
```
*(Prüfe `primitives/Card|Stack|Row|Text|Icon` Props vorher — ggf. `Box` + Tailwind. Token-Anbindung kommt automatisch über die `claimondo-*`-Klassen, weil `globals.css` die auf `var(--brand-*)` umbiegt.)*
- [ ] **Step 2–6:** `KpiCards.tsx`, `FinanceClient.tsx` (`KpiCard`), `TeamClient.tsx` (`StatCard`), `MaklerDashboard.tsx` (`StatCard` UND `StatCardProvisionen` — letzteres → `<StatCard label="Provision …" value={…} tone="success" hint={…}/>`), `MaklerPromo.tsx` (`StatCard`): lokale Komponente löschen, `import { StatCard } from '@/components/shared/StatCard'`, `bg`/`iconColor`/`hint`/`href` auf `tone`/`hint`/`href` mappen.
- [ ] **Step 7:** `npx tsc --noEmit` grün. `grep -rn "function StatCard\|function KpiCard\|function KpiBox\|StatCardProvisionen" src/components src/app` → leer.
- [ ] **Step 8: Commit**
```
refactor(frontend): shared/StatCard extrahiert, 5 Inline-StatCard/KpiCard migriert

Audit:
- Build: tsc --noEmit grün
- UI: gleiche Optik (weiße Card, 4px-Akzentbalken, Icon-Badge, tabular-nums-Wert)
- Redundanz: 5× inline StatCard/KpiCard/KpiBox + StatCardProvisionen entfernt (~200 LOC); auf primitives/*
- Dead-Code: lokale Card-Komponenten weg
- Spec: KOMPONENTEN-SET-POLICY (shared/* auf primitives) + Audit R3/R-S3
- Inkonsistenz: eine StatCard für alle Portale; Umlaute ok
- Regression: gleiche Props; Dashboard-Daten unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 5 — `shared/SectionCard` extrahieren + 5 Inline migrieren + `TaskCreateModal.tsx` löschen

**Create:** `src/components/shared/SectionCard.tsx` · **Delete:** `src/components/tasks/TaskCreateModal.tsx` (0 externe Consumer — vorher `grep -rn "TaskCreateModal" src` checken, darf nur die Datei selbst treffen) · **Modify:** `src/app/faelle/[id]/_stammdaten/Sections.tsx` (`function Card`), `src/app/faelle/[id]/_prozess/Sections.tsx` (`function Card`), `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` (`function Card`), `src/components/makler/MaklerSettings.tsx` (`function SectionCard` → `size="lg"`), `src/app/kunde/KundeBetreuerStrip.tsx` (`function Card`).

- [ ] **Step 1:** `src/components/shared/SectionCard.tsx`:
```tsx
// AAR-frontend-konsolidierung-p1: Zentrale Section-Card (weiße Card + optionaler
// Icon-Badge-Header). Ersetzt ~5 inline function Card/SectionCard (Audit R6). Auf primitives.Card.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/primitives'
export type SectionCardProps = {
  title?: string; icon?: LucideIcon; hint?: ReactNode; headerAction?: ReactNode
  children: ReactNode; className?: string; size?: 'md' | 'lg'
}
export function SectionCard({ title, icon: IconRef, hint, headerAction, children, className, size = 'md' }: SectionCardProps) {
  const pad = size === 'lg' ? 'p-7 sm:p-8' : 'p-5'
  return (
    <Card className={`${pad} ${className ?? ''}`}>
      {(title || headerAction) ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {IconRef ? <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-claimondo-ondo/10"><IconRef className="h-4.5 w-4.5 text-claimondo-ondo" /></span> : null}
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
- [ ] **Step 2–4:** die 5 Inline-`function Card`/`SectionCard` löschen, `<Card icon=… title=…>…</Card>` → `<SectionCard icon=… title=…>…</SectionCard>` (MaklerSettings: `size="lg"`). Import `import { SectionCard } from '@/components/shared/SectionCard'`.
- [ ] **Step 5:** `grep -rn "TaskCreateModal" src` → nur die Datei → `git rm src/components/tasks/TaskCreateModal.tsx`.
- [ ] **Step 6:** **Voller Build** (`faelle/[id]`-Routen betroffen): `NODE_OPTIONS=--max-old-space-size=8192 npm run build` grün. `grep -rn "function Card\b" src/components src/app | grep -v "ui/\|primitives/\|shared/"` → leer.
- [ ] **Step 7: Commit**
```
refactor(frontend): shared/SectionCard extrahiert (5 Inline-Card migriert), TaskCreateModal gelöscht

Audit:
- Build: npm run build grün (faelle/[id]-Routen betroffen)
- UI: gleiche Optik (weiße Card + optionaler Icon-Badge-Header)
- Redundanz: 5× inline function Card/SectionCard entfernt (~80 LOC); TaskCreateModal (107 LOC, 0-Consumer-Dup von TaskAnlegenModal) gelöscht
- Dead-Code: lokale Card-Funktionen + TaskCreateModal weg
- Spec: KOMPONENTEN-SET-POLICY + Audit R6/R15
- Inkonsistenz: eine SectionCard; Umlaute ok
- Regression: gleiche Semantik; TaskAnlegenModal unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 6 — `shared/forms/{TextField,SelectField}` extrahieren + ~13 Inline-`function Field` migrieren

> **Achtung:** Das ist die **Solid**-Field-Variante. NICHT die Glass-Variante (`shared/glass/GlassInput`, `onboarding/fields/TextField`) — die bleibt unangetastet (Phase 2).

**Create:** `src/components/shared/forms/TextField.tsx`, `src/components/shared/forms/SelectField.tsx`, `src/components/shared/forms/index.ts` · **Modify:** `admin/sachverstaendige/anlegen/{Solo,Buero,Akademie}AnlegenWizard.tsx`, `admin/faelle/anlegen/AnlegenFallClient.tsx`, `admin/communities/CommunityAnlegenWizard.tsx`, `admin/einstellungen/vertraege/VertraegeEditorClient.tsx`, `admin/team/[id]/MitarbeiterDetail.tsx`, `gutachter/onboarding/buero/BueroOnboardingClient.tsx`, `gutachter-partner/WaitlistApply.tsx`, `…/mietwagen/MietwagenEditCard.tsx`, `kb/VsKorrespondenzCard.tsx`, `kunde/ClaimSummary.tsx` (jeweils lokales `function Field`).

- [ ] **Step 1:** `src/components/shared/forms/TextField.tsx`:
```tsx
// AAR-frontend-konsolidierung-p1: Zentrales Solid-Text-Feld (Label oben + Input
// + optionaler Error). Ersetzt ~13 inline function Field (Audit R1). Controlled.
import type { InputHTMLAttributes, ReactNode } from 'react'
const INPUT_CLS = 'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-60'
export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label?: ReactNode; error?: string | null; hint?: ReactNode; className?: string; inputClassName?: string
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
- [ ] **Step 2:** `src/components/shared/forms/SelectField.tsx`:
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
- [ ] **Step 3:** `src/components/shared/forms/index.ts` → `export { TextField } from './TextField'; export { SelectField } from './SelectField'`.
- [ ] **Step 4–5:** Pro File: `function Field({label, ...props}) {…}` löschen, `import { TextField } from '@/components/shared/forms'`, `<Field label="…" value=… onChange=… />` → `<TextField label="…" value=… onChange=… />`. Wo ein File ein lokales `function Select`/Dropdown hat → `SelectField`.
- [ ] **Step 6:** **Voller Build** (Routen betroffen): grün. `grep -rn "function Field\b" src/app src/components | grep -v "shared/forms\|onboarding/fields\|primitives/"` → leer.
- [ ] **Step 7: Commit**
```
refactor(frontend): shared/forms/{TextField,SelectField} extrahiert, ~13 Inline-Field migriert

Audit:
- Build: npm run build grün
- UI: gleiche Optik (Label oben, Solid-Input, Focus-Ring) — Token-konsistent (rounded-ios-sm, claimondo-ondo statt Hex)
- Redundanz: ~13× nahezu byte-gleiches function Field entfernt (~260 LOC)
- Dead-Code: lokale Field-Funktionen weg
- Spec: KOMPONENTEN-SET-POLICY (shared/*) + Audit R1
- Inkonsistenz: ein Solid-Text-/Select-Feld; Glass-Felder bewusst unangetastet (Phase 2); Umlaute ok
- Regression: controlled, gleiche value/onChange-Semantik

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 7 — `MaklerShell` → `shared/portal-nav/PortalNav` (dark)

**Modify:** `src/components/makler/MaklerShell.tsx` (178 Z. → ~50-60 Z. Thin-Wrapper). **Vorlage:** `src/app/admin/_components/AdminNav.tsx`. **Vorher lesen:** `src/components/shared/portal-nav/PortalNav.tsx` (Props: `variant`, `items`, `mobileItems`, Slot-Props — exakte Namen aus der Datei) + `src/app/dispatch/_components/DispatchNav.tsx`.

- [ ] **Step 1:** `MaklerShell.tsx` als Thin-Wrapper neu: Props-Signatur behalten (`makler{id,firma,ansprechpartner_vorname,status}`, `email`, `userId`, `children`). `MAKLER_NAV_ITEMS: PortalNavItem[]` aus den bisherigen Links (Dashboard `/makler`, Leads `/makler/leads`, Akten `/makler/akten`, Abrechnungen `/makler/abrechnungen`, Promo & QR `/makler/promo`, Einstellungen `/makler/einstellungen` — passende lucide-Icons). `MAKLER_MOBILE_ITEMS` = die 4-5 wichtigsten. Rendere `<PortalNav variant="dark" items={MAKLER_NAV_ITEMS} mobileItems={MAKLER_MOBILE_ITEMS} email={email} userId={userId} initials={…} {…Footer-/Top-Slots wie AdminNav: Logout-Form etc.}>{children}</PortalNav>`. Background-Radials, `style={{background:'#f2f3f7'}}`, `text-claimondo-shield`-Inkonsistenz fallen weg (B3 geheilt).
- [ ] **Step 2:** **Voller Build** (Layout-Komponente): grün.
- [ ] **Step 3: Commit**
```
refactor(frontend): MaklerShell → shared PortalNav (dark-Variante)

Audit:
- Build: npm run build grün
- UI: Sidebar/Mobile-Nav im PortalNav-Standard; aktives Item Navy statt Shield (B3 geheilt); 6 Items unverändert erreichbar
- Redundanz: ~120 LOC dupliziertes Shell-Markup entfernt — jetzt Thin-Wrapper wie AdminNav/DispatchNav
- Dead-Code: eigene isActive-/Item-Render-Logik + Hard-Hex #f2f3f7 weg
- Spec: KOMPONENTEN-SET-POLICY + Audit R-S1/B3
- Inkonsistenz: einheitliche Portal-Nav; Umlaute ok
- Regression: gleiche Routen/Items; GutachterShell + Kunde-Layout bewusst NICHT migriert (Whitelabel/Feldmodus/Branding)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 8 — 5 Layouts → `requirePortalAccess()`

**Modify:** `src/app/admin/layout.tsx`, `src/app/gutachter/layout.tsx`, `src/app/kunde/layout.tsx`, `src/app/mitarbeiter/layout.tsx`, `src/app/makler/(shell)/layout.tsx`. **Vorlage:** `src/app/dispatch/layout.tsx` + `src/app/kanzlei/layout.tsx`. **Helper:** `src/lib/auth/portal-guard.ts` → `requirePortalAccess(allowedRollen)` → `{ supabase, user:{id,email}, profile:{rolle,vorname,nachname}, displayName, initials }` (wirft via `redirect()`).

- [ ] **Step 1–5:** Pro Layout den Guard-Block (`createClient` → `getUser` → redirect `/login` → `profiles.select('rolle')` → role-check → redirect → `initials`) ersetzen durch `const { supabase, user, displayName, initials } = await requirePortalAccess(['<rolle>'])` (`import { requirePortalAccess } from '@/lib/auth/portal-guard'`). Rollen: admin→`['admin']`, gutachter→`['sachverstaendiger']`, kunde→`['kunde']`, mitarbeiter→Rollenname gegen `src/lib/auth/guards.ts` prüfen (vermutlich `'kundenbetreuer'`), makler→`['makler']`. **Alle Portal-spezifischen Folge-Queries behalten** (sv-Lookup + Whitelabel-Theme in gutachter; `resolveKundenTheme` + Onboarding-Redirect + Sidebar-Cards in kunde; makler-Status-Weiche `status!=='aktiv'→/makler/pending`, fehlende Row→`/makler/onboarding`; `meineTasksCount` in admin; etc.). `user.email` ist `string | null`.
- [ ] **Step 6:** **Voller Build:** grün.
- [ ] **Step 7:** Memory `project_appshell_refactor` aktualisieren: Guard-Teil ist extrahiert + überall genutzt; nur Render-Teil der Shells bleibt getrennt.
- [ ] **Step 8: Commit**
```
refactor(frontend): 5 Portal-Layouts → requirePortalAccess()

Audit:
- Build: npm run build grün
- UI: keine sichtbare Änderung (gleicher Auth-/Rollen-Guard, dedupliziert)
- Redundanz: ~80 LOC dupliziertes Guard-Boilerplate entfernt — dispatch+kanzlei zeigten das Pattern schon
- Dead-Code: 5× Inline-Guard weg
- Spec: KOMPONENTEN-SET-POLICY + Audit R-S2
- Inkonsistenz: einheitlicher Portal-Guard; Portal-spezifische Folge-Queries bleiben; Umlaute ok
- Regression: identisches Guard-Verhalten; Render-Teil der Shells unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 9 — Status-Maps zentralisieren (`kanzlei/dashboard` + `MaklerAktenList`)

**Modify:** `src/app/kanzlei/dashboard/page.tsx` (`STATUS_PILL`-Hex-Map ~Z. 18-65 + `PHASE_LABEL`), `src/components/makler/MaklerAktenList.tsx` (`PHASE_COLORS`-Map), ggf. `src/lib/statusLabels.ts`. **Quellen:** `src/lib/statusLabels.ts` (`FALL_STATUS_LABELS`, `FALL_STATUS_COLORS`, `LEAD_PHASE_LABELS`, `getStatusLabel`, …), `src/components/shared/FallStatusBadge.tsx` (`<FallStatusBadge status={…}/>`).

- [ ] **Step 1:** `kanzlei/dashboard/page.tsx`: `STATUS_PILL` + `PHASE_LABEL` löschen. `<span className={STATUS_PILL[f.status]…}>` → `<FallStatusBadge status={f.status}/>` (`import { FallStatusBadge } from '@/components/shared/FallStatusBadge'`). Phase-Labels → `LEAD_PHASE_LABELS`/`FALL_STATUS_LABELS`. (Heilt die Inkonsistenz: Kanzlei zeigte Fall-Status in anderen Farben als alle anderen.)
- [ ] **Step 2:** `MaklerAktenList.tsx` `PHASE_COLORS` → zentrale Maps; wo Makler kürzere Labels braucht („Gutachten da" statt „Gutachten eingegangen"), optionalen `FALL_STATUS_LABELS_SHORT`-Export in `statusLabels.ts` ergänzen — **nicht** neue lokale Map. `PhasePill`-Komponente bleibt (oder → `FallStatusBadge` falls Optik passt).
- [ ] **Step 3:** **Voller Build** (kanzlei/dashboard-Route): grün.
- [ ] **Step 4: Commit**
```
refactor(frontend): kanzlei-Dashboard + MaklerAktenList → zentrale Status-Maps + FallStatusBadge

Audit:
- Build: npm run build grün
- UI: Kanzlei zeigt Fall-Status jetzt in denselben Farben wie alle anderen Portale (Inkonsistenz behoben)
- Redundanz: lokale STATUS_PILL/PHASE_LABEL/PHASE_COLORS-Maps entfernt (~75 LOC), nutzen jetzt lib/statusLabels.ts
- Dead-Code: lokale Maps weg; ggf. FALL_STATUS_LABELS_SHORT-Export ergänzt
- Spec: KOMPONENTEN-SET-POLICY + Audit R8 (Teil)
- Inkonsistenz: eine Status-Farb-/Label-Quelle; Umlaute ok
- Regression: gleiche Status-Werte, nur konsistente Farben/Labels

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 10 — `ui/button`-App-Consumer → `primitives.Button`; `ui/{card,badge,avatar}` löschen

**Modify:** `src/app/schaden-melden/schritt-1/Schritt1Client.tsx`, `…/schritt-1/voice/VoiceRecorderClient.tsx`, `…/schritt-2/analyse/AnalyseClient.tsx`, `…/schritt-2/gegner/GegnerClient.tsx`, `…/schritt-2/Schritt2aClient.tsx`, `…/schritt-3/Schritt3Client.tsx`, `…/schritt-4/SignupClient.tsx`, `src/components/claims/InviteGegnerModal.tsx` (alle importieren `@/components/ui/button` — exakte Liste per `grep -rln "from '@/components/ui/button'" src/app src/components`). **Delete:** `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/avatar.tsx`.

> **`ui/button.tsx` NICHT löschen** — `ui/dialog.tsx` + `ui/sheet.tsx` importieren es intern.

- [ ] **Step 1:** Pro App-Consumer: `import { Button } from '@/components/ui/button'` → `import { Button } from '@/components/primitives'`. Props anpassen lt. `src/components/primitives/Button/Button.types.ts` (typisch `tone='navy'|'ondo'|'ghost'|'destructive'|'success'`, `size='sm'|'md'|'lg'`): shadcn `variant="outline"`→`tone="ghost"` (+ `outline`-Prop falls vorhanden), `variant="ghost"`→`tone="ghost"`, `variant="destructive"`→`tone="destructive"`, default→`tone="navy"`.
- [ ] **Step 2:** `grep -rn "from '@/components/ui/card'\|from '@/components/ui/badge'\|from '@/components/ui/avatar'" src` → leer → `git rm src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/avatar.tsx`.
- [ ] **Step 3:** **Voller Build** (schaden-melden-Routen): grün.
- [ ] **Step 4: Commit**
```
refactor(frontend): ui/button-App-Consumer → primitives.Button; ui/{card,badge,avatar} gelöscht (0 Importe)

Audit:
- Build: npm run build grün
- UI: keine sichtbare Änderung (primitives.Button mappt die shadcn-Varianten 1:1 auf tone/size)
- Redundanz: 8 App-Consumer von ui/button auf den Atom-Layer migriert; ui/card/badge/avatar (je 0 Importe) gelöscht
- Dead-Code: 3 ungenutzte ui/*-Files weg; ui/button bleibt (ui/dialog + ui/sheet nutzen es intern)
- Spec: KOMPONENTEN-SET-POLICY (Atoms = primitives/*, ui/* nur Rich) + Audit
- Inkonsistenz: App-Buttons aus primitives/*; Umlaute ok
- Regression: gleiche Button-Semantik; ui/dialog/ui/sheet unangetastet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 11 — Drift-Bremse `scripts/check-component-set.mjs`

**Create:** `scripts/check-component-set.mjs` · **Modify:** `package.json` (`"check:component-set": "node scripts/check-component-set.mjs"`) · Optional: `.github/workflows/ci.yml` (`node scripts/check-component-set.mjs || true`).

- [ ] **Step 1:** `scripts/check-component-set.mjs`:
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
  for (const { re, msg } of PATTERNS) { if (re.test(src)) { console.warn(`[component-set] ${f}: ${msg}`); hits++; break } }
}
console.log(`[component-set] ${hits} Datei(en) mit Drift-Verdacht (${files.length} geprüft). Policy: AGENTS.md §claimondo-component-set`)
process.exit(0) // immer 0 — nur --warn
```
- [ ] **Step 2:** `package.json` → unter `"scripts"`: `"check:component-set": "node scripts/check-component-set.mjs"`.
- [ ] **Step 3:** `node scripts/check-component-set.mjs` → Drift-Zahl ausgeben (sollte nach T1–T10 deutlich kleiner sein als die ~78/185/971-Baseline aus dem Audit).
- [ ] **Step 4: Commit**
```
chore(frontend): Drift-Bremse scripts/check-component-set.mjs (--warn)

Audit:
- Build: node scripts/check-component-set.mjs läuft (exit 0)
- UI: n/a
- Redundanz: n/a (Tooling)
- Dead-Code: nichts
- Spec: KOMPONENTEN-SET-POLICY (Lint-Bremse)
- Inkonsistenz: macht künftige Handroll-Drift sichtbar; Umlaute ok
- Regression: blockt CI nicht (exit 0)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 12 — Voller Build + Push + PR

- [ ] **Step 1:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün.
- [ ] **Step 2:** `npx tsc --noEmit` → keine Fehler. `node scripts/check-component-set.mjs` → Drift-Zahl deutlich < Baseline.
- [ ] **Step 3:** `git push` (Branch ist schon `-u origin` getrackt).
- [ ] **Step 4:** `gh pr create --base main --title "refactor(frontend): Konsolidierung Phase 1 — Inline-Primitive entdoppeln, MaklerShell→PortalNav, Layouts→requirePortalAccess, ui/*-Atoms aufräumen" --body "<Zusammenfassung der 12 Tasks + Verweis auf docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md + den Plan. ~1.000+ LOC dedupliziert. CI: build grün; e2e testet Prod → pre-merge rot, erwartet.>"`
- [ ] **Step 5:** PR-Link an Aaron melden — **nicht selbst mergen** (Memory `kein_auto_merge`).

---

## Kontext (offene PRs — nicht von dir mergen lassen)

- **#827** (`kitta/aar-docs-reorg-12-05`): Doc-Ordner-Reorg (FRONTEND/, SECU/, done/) + Plan + Redundanz-Audit + `.gitignore` (`.superpowers/`, `scripts/*.json`, `docs/**/Smoke audits/`). *Hinweis:* dabei sind Doppel-Kopien entstanden (`FRONTEND/branding-rollout-spec.md` neben `docs/12.05.2026/branding-rollout-spec.md`; `SECU/*` neben den Originalen) — Aarons Reorg, ggf. später aufräumen.
- **#825** (`kitta/aar-branding-rollout-rest`): Branding-Rollout Phase 2-Rest + Phase 4 + Phase 5 (Email-Branding). Auf `staging` deployed, nicht auf `main`. (Enthält den `.gitignore`-Block — wenn #825 vor diesem Branch merged, evtl. trivialer `.gitignore`-Merge-Konflikt; harmlos.)

## Test-Login (falls Browser-Smoke gewünscht)

`app.staging.claimondo.de/login` (nginx-Basic-Auth: User `aaroncmdo`) · `test-sv@claimondo.de` / `Test1234!` · SV `Test Aaron Gutachter GmbH`, `verifiziert=true`, `use_custom_branding=true`, `brand_primary=#E11D48`, kein Logo.

## NICHT in Phase 1 (kommt in Phase 2 — eigener Plan)

`MaklerAkteDetail.tsx`→`shared/fall-*` (R14), Wizard-Engine-Vereinheitlichung (R9/R10/R11 — `FlowWizardKfz` löschen nach Deprecation-Frist, `OnboardingWizard`/`BueroOnboardingClient` migrieren, ein Glass-Field-Set), Stammdaten-Renderer-Konsolidierung (R12), restliche Status-Maps (Termin/Abrechnung/Provision), `<table>`→`ui/table` (oder `ui/table` löschen). **Glass-Felder (`shared/glass/*`, `onboarding/fields/*`) in Phase 1 bewusst unangetastet.**
