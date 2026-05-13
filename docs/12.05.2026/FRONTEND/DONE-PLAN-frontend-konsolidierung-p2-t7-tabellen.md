# P2-T7 — Tabellen: `ui/table` ablösen, `shared/DataTable` einführen, ~44 handgerollte `<table>` migrieren

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Steps mit `- [ ]`-Checkbox-Syntax. Vor Branch-Arbeit: `superpowers:using-git-worktrees`.

**Goal:** Das tote, shadcn-getokte `@/components/ui/table` löschen, einen Claimondo-getokten `@/components/shared/DataTable` (Sub-Component-Set: `Table`/`Thead`/`Tbody`/`Tr`/`Th`/`Td`) einführen, und die ~44 handgerollten `<table>` schrittweise darauf migrieren.

**Architecture:** `shared/DataTable` ist ein Composite (wie `SectionCard`/`StatCard`): plain `<table>`-Elemente mit token-gebundenen Tailwind-Klassen (`claimondo-*` → `var(--brand-*)`), kein Primitive (es gibt keinen `<table>`-Primitive, und ein Radix-Table-Pendant existiert nicht). Jede Sub-Component trägt die Default-Tabellen-Konvention; `className` ist Escape-Hatch für Pro-Tabelle-Tweaks. Migration in Batches nach Bereich, je ein PR — nicht alle 44 auf einmal.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind v4 (Token-Klassen aus `globals.css @theme inline`). Verifikation: `npx tsc --noEmit` + voller `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (bei Route/Layout-Changes) + GitHub-`build`-Check. Kein Browser-Smoke-Tooling lokal verfügbar → bei Customer-/Funnel-Tabellen manuellen Smoke vor Merge empfehlen.

---

## ⚠️ Vorab-Entscheid (Aaron) — vor T7.1

Drei Optionen, der Plan unten folgt **Option A**:

- **Option A (empfohlen, Plan unten):** `ui/table` löschen + `shared/DataTable` (Claimondo-getokt) einführen + ~44 Tabellen schrittweise migrieren. Räumt die echte Redundanz auf (44× inline `<thead className="bg-claimondo-bg text-xs uppercase …">` etc.). Großer Aufwand (S+5×M).
- **Option B (minimal):** Nur `ui/table` löschen (0 Consumer, tot), die 44 Inline-Tabellen lassen. 1 PR, S. Aber: die Tabellen-Styling-Redundanz bleibt.
- **Option C (verwerfen):** Die 44 Tabellen auf `ui/table` (shadcn) migrieren. **Nein** — `ui/table` nutzt shadcn-Tokens (`muted`/`border`), nicht `claimondo-*`; das würde die Tabellen optisch verbiegen (neutrale Grautöne statt Navy/Ondo). Außerdem ist es nicht Radix, bringt also keine a11y.

KOMPONENTEN-SET-POLICY-Hinweis: die Policy listet `table` aktuell unter „web-only Rich = `ui/*` (shadcn)". Bei Option A wird das in T7.7 auf „`shared/DataTable` (Claimondo-getokt)" korrigiert.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/components/shared/DataTable.tsx` | **Neu.** Exportiert `Table`, `Thead`, `Tbody`, `Tr`, `Th`, `Td` + `DataTableContainer`. Token-gebundene Default-Klassen, `className`-Passthrough. ~80 LOC. |
| `src/components/ui/table.tsx` | **Löschen** (0 Consumer, shadcn-getokt, kein Radix). |
| `AGENTS.md` (Block `claimondo-component-set`) | T7.7: `table` von „`ui/*`" auf „`shared/DataTable`" umschreiben. |
| `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md` | T7.7: dito. |
| `scripts/check-component-set.mjs` | T7.7: Pattern für handgerollte `<table className="…claimondo-bg…">` ergänzen (--warn). |
| **Migrations-Batches** (je 5–9 Files, je 1 PR) | T7.2 admin/finance · T7.3 admin (team/orga/versicherungen/waitlist/sla/…) · T7.4 gutachter · T7.5 dispatch + makler + kunde · T7.6 statistiken/widgets/misc. Exakte File-Listen in den Tasks. |

**Dominantes Tabellen-Muster** (Basis für `DataTable`-Defaults), gesehen in `MaklerLeadsTable`, `MaklerAktenList`, `ProvisionenClient`, `kanzlei-board/page`, `gutachter/team/TeamClient` u.a.:
```
<div className="bg-white rounded-ios-md border border-claimondo-border overflow-hidden">   ← Card-Wrapper (variiert: manche rounded-ios-lg shadow-ios-md)
  <div className="overflow-x-auto">                                                         ← Horizontal-Scroll
    <table className="w-full text-sm">
      <thead className="bg-claimondo-bg text-left text-xs text-claimondo-ondo uppercase tracking-wider">
        <tr><th className="px-4 py-3 font-medium">…</th></tr>
      </thead>
      <tbody className="divide-y divide-claimondo-border">
        <tr className="hover:bg-claimondo-bg"><td className="px-4 py-3 text-claimondo-navy">…</td></tr>
      </tbody>
    </table>
  </div>
</div>
```
Varianten (per `className`-Override abdecken): `<thead className="border-b border-claimondo-border">` statt `bg-claimondo-bg` (z.B. `AbrechnungenSection`); `text-[10px]` statt `text-xs` thead; `font-semibold` statt `font-medium` th; `text-right` cells; klickbare Rows (`cursor-pointer onClick`); Mobile-Karten-Fallback parallel zur Desktop-Tabelle (bleibt Caller-Sache).

---

## Task T7.1 — `shared/DataTable.tsx` erstellen, `ui/table.tsx` löschen

**Files:**
- Create: `src/components/shared/DataTable.tsx`
- Delete: `src/components/ui/table.tsx`
- Check: `grep -rn "from '@/components/ui/table'" src` → 0 (vor dem Löschen verifizieren)

- [ ] **Step 1: `grep` bestätigt 0 Consumer von `ui/table`**

Run: `grep -rln "from '@/components/ui/table'\|from \"@/components/ui/table\"" src`
Expected: keine Ausgabe (0 Treffer).

- [ ] **Step 2: `src/components/shared/DataTable.tsx` anlegen**

```tsx
'use client'

// AAR-frontend-konsolidierung-p2 (P2-T7): Claimondo-getoktes Tabellen-Set —
// ersetzt das tote, shadcn-getokte ui/table und die ~44 inline-gestylten
// <table>/<thead>/<tr>/<th>/<td> in Listen/Dashboards. Jede Sub-Component trägt
// die Default-Konvention; className ist Escape-Hatch für Pro-Tabelle-Tweaks.
// Token-gebunden (claimondo-* → var(--brand-*)). Mobile-Karten-Fallbacks bleiben
// Caller-Sache (die Regel betrifft die Tabelle, nicht das responsive Layout).

import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
  ReactNode,
} from 'react'

/** Card-Rahmen + Horizontal-Scroll-Container. Optional — Caller kann auch
 *  selbst wrappen. `variant`: 'card' = weiße Card mit Border (Default),
 *  'plain' = nur overflow-x-auto, kein Rahmen. */
export function DataTableContainer({
  children,
  variant = 'card',
  className = '',
}: {
  children: ReactNode
  variant?: 'card' | 'plain'
  className?: string
}) {
  const shell =
    variant === 'card'
      ? 'rounded-ios-md border border-claimondo-border bg-white overflow-hidden'
      : ''
  return (
    <div className={`${shell} ${className}`}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function Table({ className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={`w-full text-sm ${className}`} {...props} />
}

export function Thead({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`bg-claimondo-bg text-left text-xs uppercase tracking-wider text-claimondo-ondo ${className}`}
      {...props}
    />
  )
}

export function Tbody({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={`divide-y divide-claimondo-border ${className}`} {...props} />
}

export function Tr({ className = '', ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} {...props} />
}

/** Klickbare Zeile (Row-Link-Pattern) — bekommt Hover + Pointer + onClick. */
export function ClickableTr({
  className = '',
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`cursor-pointer transition-colors hover:bg-claimondo-bg ${className}`}
      {...props}
    />
  )
}

export function Th({ className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`px-4 py-3 font-medium ${className}`} {...props} />
}

export function Td({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 text-claimondo-navy ${className}`} {...props} />
}
```

- [ ] **Step 3: `ui/table.tsx` löschen**

Run: `git rm src/components/ui/table.tsx`

- [ ] **Step 4: `tsc --noEmit` grün**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe (0 Fehler). (Es gibt 0 Consumer von `ui/table` → kein Bruch.)

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/DataTable.tsx src/components/ui/table.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): P2-T7.1 — shared/DataTable eingeführt, ui/table gelöscht (0 Consumer)

shared/DataTable.tsx (Table/Thead/Tbody/Tr/ClickableTr/Th/Td + DataTableContainer)
— Claimondo-getoktes Tabellen-Set. ui/table.tsx gelöscht: 0 Importe, shadcn-getokt
(muted/border statt claimondo-*), nicht Radix → bringt nichts gegenüber plain <table>.

Audit:
- Build: tsc --noEmit grün (0 ui/table-Consumer); voller Build n/a (neue Datei + Löschung)
- UI: keine Änderung (DataTable noch ohne Consumer; ui/table war tot)
- Redundanz: Vorbereitung für die ~44-Tabellen-Migration (T7.2+)
- Dead-Code: ui/table gelöscht
- Spec: KOMPONENTEN-SET-POLICY (Composite auf Token-Tailwind, wie SectionCard/StatCard) + P2-T7-Plan
- Inkonsistenz: shadcn-getoktes Tabellen-Atom raus; Umlaute ok
- Regression: keine (0 Consumer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Migrations-Tasks T7.2–T7.6 — Prozedur (gilt für jede Datei)

Pro handgerollter `<table>` in einer Datei:
1. Import ergänzen: `import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'` (nur die tatsächlich genutzten).
2. Den Card-Wrapper + `overflow-x-auto`-`<div>` → `<DataTableContainer>` (oder `<DataTableContainer variant="plain">` wenn der Caller keinen Card-Rahmen hatte, oder wenn der Card-Rahmen Sonder-Props hat (`shadow-ios-md`, eigenes `rounded`), den `<DataTableContainer className="…">` mit dem Delta füttern bzw. den Card-Wrapper außen lassen und nur `<div className="overflow-x-auto">`→`<DataTableContainer variant="plain">`).
3. `<table className="w-full text-sm …">` → `<Table className="…rest…">` (das `w-full text-sm` ist im Default → weg; nur Rest behalten, z.B. `min-w-[800px]`).
4. `<thead className="bg-claimondo-bg text-left text-xs text-claimondo-ondo uppercase tracking-wider">` → `<Thead>` (Default deckt das ab). Abweichungen (`border-b` statt `bg-claimondo-bg`, `text-[10px]`) → `<Thead className="…delta…">` (ggf. mit `!`-Prefix wenn ein Default überschrieben werden muss).
5. `<tbody className="divide-y divide-claimondo-border">` → `<Tbody>`. `<tbody>` ohne diese Klasse → `<Tbody className="…">` oder raw `<tbody>` belassen wenn völlig anders.
6. `<tr className="hover:bg-claimondo-bg cursor-pointer" onClick={…}>` → `<ClickableTr onClick={…} className="…rest…">`; sonst `<tr>` → `<Tr className="…">` (oder raw `<tr>` wenn keine Klasse).
7. `<th className="px-4 py-3 font-medium …">` → `<Th className="…rest…">` (das `px-4 py-3 font-medium` im Default → weg; `font-semibold` statt `font-medium` → `<Th className="!font-semibold">`; `text-right` → `<Th className="text-right">`).
8. `<td className="px-4 py-3 text-claimondo-navy …">` → `<Td className="…rest…">`; `text-claimondo-ondo` statt `-navy` → `<Td className="!text-claimondo-ondo">`.
9. Nach jeder Datei: `npx tsc --noEmit` grün.
10. Pro Batch (5–9 Files): voller `NODE_OPTIONS=8192 npm run build` grün, dann Commit + PR. Bei Customer-/öffentlichen Tabellen (z.B. `datenschutz/page`) ist der visuelle Delta minimal (gleiche Tokens), aber im PR-Body notieren: „Tabellen auf shared/DataTable; Optik gleich (Token-Defaults), per-Tabelle-Tweaks via className erhalten".

**Worked example** (`src/app/admin/finance/(hub)/provisionen/ProvisionenClient.tsx`, vorher):
```tsx
<div className="bg-white rounded-ios-lg shadow-ios-md overflow-x-auto">
  <table className="w-full text-sm min-w-[800px]">
    <thead className="bg-claimondo-bg text-xs uppercase text-claimondo-ondo">
      <tr>
        <th className="text-left px-4 py-2">Lead</th>
        …
      </tr>
    </thead>
    <tbody className="divide-y divide-claimondo-border">
      {provisionen.map(p => (
        <tr key={p.id}>
          <td className="px-4 py-3">…</td>
          …
        </tr>
      ))}
    </tbody>
  </table>
</div>
```
nachher:
```tsx
<DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md">
  <Table className="min-w-[800px]">
    <Thead className="text-[10px]">
      <Tr>
        <Th className="!font-normal py-2">Lead</Th>
        …
      </Tr>
    </Thead>
    <Tbody>
      {provisionen.map(p => (
        <Tr key={p.id}>
          <Td>…</Td>
          …
        </Tr>
      ))}
    </Tbody>
  </Table>
</DataTableContainer>
```
*(Anm.: `text-xs` statt `text-[10px]` → den Default `text-xs` lässt man; hier nur als Beispiel für einen Override. `px-4 py-2` statt `px-4 py-3` im th → `<Th className="py-2">` reicht — Tailwind: spätere `py-2` gewinnt nicht automatisch über `py-3`, aber `py-3` ist im DataTable-Default-String *vor* dem `${className}`, also gewinnt `py-2` aus className. Wenn nicht: `!py-2`.)*

---

## Task T7.2 — Batch 1: admin/finance-Tabellen migrieren

**Files (je nach `<table>` migrieren, Prozedur oben):**
- Modify: `src/app/admin/finance/(hub)/provisionen/ProvisionenClient.tsx`
- Modify: `src/app/admin/finance/(hub)/AbrechnungenSection.tsx` (Variante: `<thead><tr className="border-b">` — `<Thead className="!bg-transparent border-b border-claimondo-border">`)
- Modify: `src/app/admin/finance/(hub)/FinanceClient.tsx`
- Modify: `src/app/admin/finance/(hub)/page.tsx`
- Modify: `src/app/admin/abrechnungen/AbrechnungenListClient.tsx`
- Modify: `src/app/admin/kanzlei-abrechnungen/page.tsx`
- Modify: `src/app/admin/kanzlei-board/page.tsx`

- [ ] **Step 1:** Pro File die Prozedur (oben, Schritte 1–8) anwenden.
- [ ] **Step 2:** `npx tsc --noEmit` grün.
- [ ] **Step 3:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` grün (admin/finance + admin/abrechnungen + admin/kanzlei-* Routen betroffen). *(Auf Windows: `.next` vorher löschen wenn `EBUSY` beim standalone-Copy — bekanntes Flake, kein Code-Fehler; GitHub-Linux-`build`-Check ist maßgeblich.)*
- [ ] **Step 4: Commit + PR**

```bash
git add -A && git commit -m "refactor(frontend): P2-T7.2 — admin/finance-Tabellen → shared/DataTable (7 Files)

Audit:
- Build: npm run build grün (NODE_OPTIONS=8192; admin/finance + admin/abrechnungen + admin/kanzlei-* Routen)
- UI: gleiche Optik (DataTable-Token-Defaults = die bisherigen Inline-Klassen); per-Tabelle-Tweaks (min-w, text-right, py-2, border-b-thead) via className erhalten
- Redundanz: ~7× inline <table>/<thead>/<tr>/<th>/<td>-Styling auf shared/DataTable
- Dead-Code: handgerollte Tabellen-className-Strings weg
- Spec: KOMPONENTEN-SET-POLICY + P2-T7-Plan
- Inkonsistenz: einheitliches Tabellen-Set; Umlaute ok
- Regression: gleiche Daten/Spalten; nur Markup-Wrapper getauscht

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push -u origin kitta/aar-datatable-admin-finance
gh pr create --base main --title "refactor(frontend): P2-T7.2 — admin/finance-Tabellen → shared/DataTable" --body "Phase 2, P2-T7.2. 7 admin/finance-Tabellen auf shared/DataTable migriert (Optik gleich — DataTable-Defaults = die bisherigen Inline-Klassen; per-Tabelle-Tweaks via className). tsc + voller Build grün."
```

---

## Task T7.3 — Batch 2: admin-Tabellen (team/orga/versicherungen/waitlist/sla/support/smoke)

**Files:**
- Modify: `src/app/admin/team/TeamClient.tsx`
- Modify: `src/app/admin/team/[id]/MitarbeiterDetail.tsx`
- Modify: `src/app/admin/team/leaderboard/LeaderboardClient.tsx`
- Modify: `src/app/admin/organisationen/OrganisationenClient.tsx`
- Modify: `src/app/admin/versicherungen/VersicherungenClient.tsx`
- Modify: `src/app/admin/partner/waitlist/WaitlistTable.tsx`
- Modify: `src/app/admin/sla/page.tsx`
- Modify: `src/app/admin/support/page.tsx`
- Modify: `src/app/admin/smoke/lifecycle/page.tsx`
- Modify: `src/app/admin/meine-tasks/MyTasksClient.tsx`
- Modify: `src/app/admin/communities/CommunitiesListClient.tsx`

- [ ] **Step 1–4:** Wie T7.2 (Prozedur pro File; `tsc` grün; voller Build grün — viele admin-Routen; Commit + PR `kitta/aar-datatable-admin-rest`, Titel `P2-T7.3 — admin-Tabellen (team/orga/…) → shared/DataTable`).

---

## Task T7.4 — Batch 3: gutachter-Tabellen

**Files:**
- Modify: `src/app/gutachter/abrechnung/page.tsx`
- Modify: `src/app/gutachter/community/page.tsx`
- Modify: `src/app/gutachter/faelle/page.tsx`
- Modify: `src/app/gutachter/leadpreise/page.tsx`
- Modify: `src/app/gutachter/team/TeamClient.tsx`
- *(+ weitere die `grep -rln "<table\b" src/app/gutachter` zeigt — vor Batch-Start greppen, Liste vervollständigen)*

- [ ] **Step 1–4:** Wie T7.2. PR `kitta/aar-datatable-gutachter`, Titel `P2-T7.4 — gutachter-Tabellen → shared/DataTable`. **Hinweis:** Gutachter-Portal ist whitelabel-gebrandet → die `claimondo-*`-Klassen in `DataTable` greifen automatisch das Brand-Theme (`globals.css` biegt sie auf `var(--brand-*)` um); kein Sonderfall. Trotzdem im PR notieren + (wenn möglich) im SV-Test-Login (`test-sv@claimondo.de` / `Test1234!`, `use_custom_branding=true`) durchklicken.

---

## Task T7.5 — Batch 4: dispatch + makler + kunde-Tabellen

**Files (vor Start `grep -rln "<table\b" src/app/dispatch src/components/makler src/app/kunde src/app/makler` für die vollständige Liste — initiale Auswahl):**
- Modify: `src/app/dispatch/leads/_components/LeadsViewToggle.tsx`
- Modify: `src/components/makler/MaklerLeadsTable.tsx`
- Modify: `src/components/makler/MaklerAktenList.tsx`
- Modify: `src/components/makler/MaklerAbrechnungen.tsx`
- *(+ kunde-/dispatch-Tabellen aus dem grep)*

- [ ] **Step 1–4:** Wie T7.2. PR `kitta/aar-datatable-dispatch-makler-kunde`, Titel `P2-T7.5 — dispatch/makler/kunde-Tabellen → shared/DataTable`. **Hinweis:** Makler-Tabellen haben Mobile-Karten-Fallbacks parallel zur Desktop-`<table>` (`hidden md:block` / `md:hidden`) — die bleiben unangetastet; nur der Desktop-`<table>`-Teil wird migriert. Kunde-Portal ist gebrandet (siehe T7.4-Hinweis).

---

## Task T7.6 — Batch 5: statistiken / Widgets / misc

**Files (vor Start vollständig greppen `grep -rln "<table\b" src/app src/components | grep -v "shared/DataTable"` — Rest abarbeiten):**
- Modify: `src/app/admin/statistiken/StatistikenClient.tsx`
- Modify: `src/app/admin/statistiken/ki-usage/page.tsx`
- Modify: `src/app/admin/_components/AusstehendeZahlungenTable.tsx`
- Modify: `src/app/admin/_components/LeadPreiseVerteilungWidget.tsx`
- Modify: `src/app/admin/_components/StripeConnectStatusWidget.tsx`
- Modify: `src/app/datenschutz/page.tsx` *(öffentlich — Optik-Delta minimal, da gleiche Tokens; trotzdem im PR notieren)*
- *(+ Rest)*

- [ ] **Step 1–4:** Wie T7.2. PR `kitta/aar-datatable-rest`, Titel `P2-T7.6 — restliche Tabellen → shared/DataTable`.
- [ ] **Step 5:** `grep -rln "<table\b" src/app src/components | grep -v "components/shared/DataTable"` → sollte jetzt leer (oder nur noch bewusste Sonderfälle, im PR-Body benannt) sein.

---

## Task T7.7 — Policy + Drift-Check nachziehen

**Files:**
- Modify: `AGENTS.md` (Block `<!-- BEGIN:claimondo-component-set -->`)
- Modify: `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md`
- Modify: `scripts/check-component-set.mjs`

- [ ] **Step 1:** In `AGENTS.md` §`claimondo-component-set`, im Abschnitt „3 · Web-only Rich-Components": `table` aus der `ui/*`-Liste streichen; im Abschnitt „2 · Composite-Layer" `DataTable` zur Aufzählung hinzufügen; ein Satz: „Tabellen-Listen: `@/components/shared/DataTable` (Claimondo-getoktes `Table`/`Thead`/`Tbody`/`Tr`/`ClickableTr`/`Th`/`Td`-Set) — kein handgerolltes `<thead className="bg-claimondo-bg …">` mehr."
- [ ] **Step 2:** Dieselbe Änderung in `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md` (die ausführliche Fassung).
- [ ] **Step 3:** In `scripts/check-component-set.mjs` `PATTERNS` ein Eintrag ergänzen:
```js
{
  re: /<table\b/,
  msg: 'handgerollte <table> → shared/DataTable (Table/Thead/Tbody/Tr/Th/Td)',
},
```
(Bleibt `--warn`, exit 0 — die Migration ist progressiv, soll CI nicht blocken.)
- [ ] **Step 4:** `node scripts/check-component-set.mjs` läuft (exit 0); die Drift-Zahl sollte nach T7.2–T7.6 deutlich kleiner sein.
- [ ] **Step 5: Commit + PR** `kitta/aar-datatable-policy`, Titel `chore(frontend): P2-T7.7 — Tabellen-Policy + Drift-Check auf shared/DataTable umgestellt`.

---

## Self-Review (durchgeführt)

- **Spec-Coverage:** Vorab-Entscheid (Aaron) ✓ · `ui/table` löschen ✓ (T7.1) · `shared/DataTable` ✓ (T7.1) · ~44 Tabellen migrieren ✓ (T7.2–T7.6, File-Listen + Prozedur + worked example) · Policy/Drift-Check ✓ (T7.7). **Gap:** die T7.4/T7.5/T7.6-File-Listen sind „initiale Auswahl + grep zum Vervollständigen" — bewusst, weil 44 Files einzeln aufzulisten den Plan aufbläht und der grep-Befehl die Wahrheit liefert; jeder Batch beginnt mit dem grep.
- **Placeholder-Scan:** Kein „TODO/TBD/implement later". Die Migrations-Tasks zeigen die *Prozedur* (8 konkrete Schritte) + ein vollständiges Vorher/Nachher-Beispiel statt 44× Markup zu wiederholen — das ist eine dokumentierte mechanische Prozedur, kein Platzhalter. `shared/DataTable.tsx` ist vollständig ausgeschrieben.
- **Type-Konsistenz:** Sub-Component-Namen `Table`/`Thead`/`Tbody`/`Tr`/`ClickableTr`/`Th`/`Td`/`DataTableContainer` durchgängig identisch in T7.1, der Prozedur und allen Batch-Tasks. `DataTableContainer` `variant: 'card' | 'plain'` konsistent verwendet.

---

## Execution Handoff

Zwei Ausführungs-Optionen:
1. **Subagent-Driven** (empfohlen) — pro Task ein frischer Subagent, Review dazwischen (`superpowers:subagent-driven-development`).
2. **Inline** — Tasks in dieser Session abarbeiten, Checkpoints zum Review (`superpowers:executing-plans`).

**Aber zuerst:** der Vorab-Entscheid (Option A / B / C oben) — der ganze Plan unten setzt Option A voraus.
