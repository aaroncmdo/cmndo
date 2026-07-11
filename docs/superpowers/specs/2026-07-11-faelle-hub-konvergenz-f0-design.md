# Fälle-Hub-Konvergenz F0 — Shared Case-Shell (`/admin/faelle`)

**Datum:** 2026-07-11
**Programm:** Claim/Case-Management #3 (Fälle-Hub-Konvergenz), Phase **F0**
**Lane-Owner:** ops-cockpit (470d55c9-Nachfolge) · Branch `kitta/faelle-hub-konvergenz-f0` (off `staging`)
**Verwandt:** `PROGRAM-claim-case-management-map`, `AUDIT-faelle-hub-view`, `COORDINATION-claim-case-program-470d55c9-owned`

---

## 1 · Kontext & Motivation

`/admin/faelle` ist heute ein **5-Tab-Kleber**: eine handgerollte Tab-Nav (`FaelleHubTabs`) über heterogenen Seiten. Aaron (10.07.): „wir müssen die view Fälle nochmal komplett neu denken. ohne diesen header und das arrangement, alle funktionen die wir dort finden einmal auditen und sauber ineinanderbringen."

Das Gesamtprogramm (#3) führt den Fälle-Hub schrittweise in die workstate-Foundation über (F0→F3). **Diese Spec deckt nur F0** — das Fundament: EINE kohärente Shell + EIN Header/Arrangement. Board-Konvergenz (F1), Redirect-Entdopplung (F2) und `/admin`-vs-`/admin/faelle`-Entwirrung (F3) sind bewusst **Folge-Phasen** (eigene Specs).

### Ist-Zustand (code-verifiziert, staging `ac7010d98`)
`src/app/admin/faelle/(hub)/`:
- `layout.tsx` — Server-Layout, lädt Reklamationen-Badge, rendert `FaelleHubTabs` + `children`.
- `FaelleHubTabs.tsx` — **handgerollte** route-basierte Tab-Nav (`<Link>`, `usePathname`), Underline-Style, NICHT aus dem Shared-Set.
- `page.tsx` — Liste: lädt `v_claim_listing` + Supplement, rendert `FaelleKanban` (kein PageHeader).
- 4 Tab-Stubs = **literale Re-Exports**: `sla`, `statistiken`, `kanzlei` (→`kanzlei-board`), `reklamationen` je `export { default } from '../../../<x>/page'`.

**Heterogenität (die Wurzel des „Doppel-Header"):**
| Tab | Header-Behandlung |
|---|---|
| Liste (`FaelleKanban`) | kein `PageHeader` |
| SLA (`/admin/sla`) | eigener `<PageHeader>` inline + `py-6 space-y-6` |
| Kanzlei-Board (`/admin/kanzlei-board`) | eigener `<PageHeader>` inline + `py-6 space-y-6` |
| Statistiken (`/admin/statistiken`) | Data-Loader → `StatistikenClient` (Titel im Client) |
| Reklamationen (`/admin/reklamationen`) | Data-Loader → `ReklamationenClient` (Titel im Client) |

5 Tabs, 4 verschiedene Header-Muster. Jeder Re-Export schleppt die Chrome seiner Quell-Seite mit → Doppel-Header + Stil-Bruch.

---

## 2 · Ziele / Nicht-Ziele

**Ziele (F0):**
1. EIN kohärenter Chrome-Block: Hub-Titel „Fälle" + konsistente Tab-Leiste + aktiver Tab-Untertitel.
2. Handgerollte `FaelleHubTabs` → **neues shared `RouteTabBar`** (wiederverwendbares Primitiv für künftige Hubs).
3. Die 4 Tools als **echte header-lose Content-Components** statt literaler Re-Exports (Single-Source, keine divergente Chrome).
4. **Null Daten-/Verhaltensänderung, null Route-Löschung.** Standalone-`/admin/*`-Routen rendern byte-identisch weiter.

**Nicht-Ziele (spätere Phasen):**
- F1: `FaelleKanban` → editierbares Workstate-Board (`v_claim_workstate`/`WorkItemCard`).
- F2: Standalone-Routen → Legacy-Redirect in die unified View; Doppel-Routen weg.
- F3: Cockpit aus `/admin` nach `/admin/faelle` ziehen; `/admin` = schlankes Dashboard.
- KB-Variante `mitarbeiter/faelle` unberührt.

---

## 3 · Design

```
┌ /admin Portal-Shell (PortalNav-Sidebar — UNBERÜHRT) ──────────────────┐
│ ┌ (hub)/layout.tsx → FaelleHubHeader (EIN Chrome-Block) ────────────┐ │
│ │  Fälle                                                            │ │ ← PageHeader (shared, size lg)
│ │  ● Liste   SLA   Statistiken   Kanzlei-Board   Reklamationen④     │ │ ← RouteTabBar (NEU shared)
│ │  „Pipeline-Fristen ab SA-Unterschrift…"                           │ │ ← aktiver-Tab-Untertitel (Map)
│ ├───────────────────────────────────────────────────────────────────┤ │
│ │  {children} — aktiver Tab, header-los, konsistentes Padding        │ │
│ │   Liste        → FaelleKanban             (unverändert)           │ │
│ │   SLA          → <SlaContent/>            (war Re-Export)         │ │
│ │   Statistiken  → <StatistikenContent/>   (war Re-Export)         │ │
│ │   Kanzlei-Board→ <KanzleiBoardContent/>  (war Re-Export)         │ │
│ │   Reklamationen→ <ReklamationenContent/> (war Re-Export)         │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.1 · `RouteTabBar` (NEU, shared)
`src/components/shared/RouteTabBar.tsx` — Client-Component, route-basiert.

```ts
export type RouteTab = {
  href: string
  label: string
  icon?: LucideIcon
  badge?: number
  /** exact match für Index-Route, sonst startsWith */
  exact?: boolean
}
type Props = { tabs: ReadonlyArray<RouteTab>; rightSlot?: ReactNode }
```
- Aktiv-State via `usePathname` (Index-Tab exact, sonst `pathname === href || startsWith(href + '/')`).
- Visuelle Sprache = `FallakteTabs`-Pattern (rounded-ios-lg Pills, `claimondo-navy/ondo`-Tokens, aktiver Ring). Kein Inline-Hex, keine raw Tailwind-Defaults → Token-/component-set-Ratchet-konform.
- Badge = Wassertropfen wie `FallakteTabs` (`bg-danger`).
- **Interface-Grenze:** RouteTabBar ist generisch (kennt keine Fälle-Spezifika). Zweck: „route-basierte Tab-Leiste"; Konsument liefert `tabs`. Wiederverwendbar für alle künftigen route-basierten Hubs.
- `FallakteTabs` bleibt **unangetastet** (anderer Use-Case: State-basiert, `onTabChange`).

### 3.2 · `FaelleHubHeader` (NEU, lokal in `(hub)/`)
`src/app/admin/faelle/(hub)/FaelleHubHeader.tsx` — Client-Component, komponiert `PageHeader` (Titel „Fälle") + `RouteTabBar` + aktiver-Tab-Untertitel.
- Fälle-spezifische **Tab-Map** (Single-Source für Label/Icon/Untertitel/Href) lebt hier.
- Untertitel: aus der Map via `usePathname` bestimmt, unter der Tab-Leiste (`text-sm text-claimondo-ondo`).
- Reklamationen-Badge kommt als Prop (`offeneReklamationen`) vom Server-Layout.

### 3.3 · `layout.tsx` (geändert)
Lädt weiterhin den Reklamationen-Badge (Server), rendert `FaelleHubHeader` statt `FaelleHubTabs`, dann `children`. Ein weißer, unten-berandeter Chrome-Container.

### 3.4 · De-Re-Export der 4 Tools (Content-Extraktion)
Pro Tool: der **Body ohne Top-Level-Header** wandert in eine header-lose Content-Component; beide Routen (Standalone + Hub) rendern sie.

- **SLA / Kanzlei-Board** (Header inline im Page):
  - NEU `admin/sla/SlaContent.tsx` (+ `KanzleiBoardContent.tsx`) — async Server-Component, enthält KPIs + Tabelle/Sections (ohne `<PageHeader>`, ohne den `py-6 space-y-6`-Wrapper).
  - `admin/sla/page.tsx` (Standalone) → `<div py-6 space-y-6><PageHeader…/><SlaContent/></div>` (behält Header).
  - `(hub)/sla/page.tsx` → `<div py-6 space-y-6><SlaContent/></div>` (kein Header; Hub-Header liefert Kontext).
- **Statistiken / Reklamationen** (Data-Loader → Client):
  - NEU `StatistikenContent.tsx` (+ `ReklamationenContent.tsx`) — async, enthält den Daten-Load + `<…Client>`-Render (inkl. Auth-Guard bei Reklamationen).
  - Beide Routen rendern `<…Content/>`.
  - **Verifikation (Plan):** rendert `StatistikenClient`/`ReklamationenClient` einen redundanten Top-Titel? Falls ja → optionales `hideTitle`-Prop, im Hub gesetzt. Falls der Titel akzeptabel/self-contained ist → belassen.
- `export const dynamic = 'force-dynamic'` + Auth-Guards bleiben auf den Route-Files erhalten.

### 3.5 · Was unverändert bleibt
`FaelleKanban` + gesamte Daten-Assembly in `(hub)/page.tsx` (rendert nur neu unter dem Hub-Header — kein Code-Change nötig, das Layout wrappt), `KanbanUploadsRealtime`, alle Tool-Queries, beide Route-Bäume. „+ Fall anlegen" bleibt in `FaelleKanban`.
- **Verifikation (Plan):** rendert `FaelleKanban` einen eigenen „Fälle"-Titel, der jetzt mit dem Hub-Titel doppelt? Falls ja → dort entfernen (Hub-Header liefert ihn).

---

## 4 · Komponenten-Grenzen (Isolation)

| Unit | Zweck | Abhängt von | Wiederverwendbar |
|---|---|---|---|
| `RouteTabBar` | route-basierte Tab-Leiste | `usePathname`, Tokens | ja (generisch) |
| `FaelleHubHeader` | Fälle-Hub-Chrome (Titel+Tabs+Untertitel) | `RouteTabBar`, `PageHeader`, Tab-Map | nein (fälle-spezifisch) |
| `SlaContent` / `KanzleiBoardContent` / `StatistikenContent` / `ReklamationenContent` | header-loser Tool-Inhalt | jeweilige Queries/Clients | ja (Standalone + Hub) |

Jede Unit ist ohne Kenntnis der Interna der anderen verständlich; RouteTabBar ist ohne Fälle-Kontext testbar.

---

## 5 · Testing

- **`RouteTabBar`** = die einzige Unit mit Logik → **TDD** (vitest + testing-library): Aktiv-State (Index exact vs. Sub startsWith), Badge-Render, Icon-Optionalität. Test zuerst (RED), dann Implementierung (GREEN).
- **Content-Extraktionen** = reine Moves → Äquivalenz durch `tsc` + CI-Build (Next-15-Validator) + Smoke der 8 Routen (4 Standalone + 4 Hub-Tabs) + Liste.
- **`FaelleHubHeader`/Tab-Map** = trivial (deklarativ), durch Smoke abgedeckt.

## 6 · Verify-Rezept
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (bekannte Worktree-Modul-Rausch-Fehler ignorieren).
- **4 Ratchets 0-neu** — v.a. component-set (neues `RouteTabBar` muss Tokens/Shared nutzen, keine handgerollten Buttons/Cards) + token-audit (kein Inline-Hex).
- **CI-Build** autoritativ für Route-Änderungen (lokal nicht baubar).
- **Smoke** (nur Test-Accounts, `smoke-admin`): je Tab + je Standalone-Route besuchen, Header/Chrome konsistent, Inhalt identisch.

## 7 · Risiken & Koordination

- **Risiko niedrig** — strukturell/Extraktion, keine Daten-Logik.
- **Care-Points:** (a) Client-interne Titel (Statistiken/Reklamationen) — im Plan prüfen; (b) Standalone-Routen müssen identisch bleiben (Regression); (c) `FaelleKanban`-Eigen-Titel-Doppelung.
- **Nachbar-Lane 386b3bd8 (vertrieb-konsolidierung, Lead-Achse):** könnte `/admin/statistiken` berühren → vor Bau `git log` auf die Tool-Pfade prüfen; Extraktion additiv halten (Content rausziehen, Query unverändert), damit ein späterer Merge sauber bleibt.
- **`FallakteTabs`-Konsumenten:** unberührt (RouteTabBar ist ein NEUES File, kein Edit an FallakteTabs).

## 8 · Datei-Änderungsliste (F0)

**Neu:**
- `src/components/shared/RouteTabBar.tsx` (+ Test)
- `src/app/admin/faelle/(hub)/FaelleHubHeader.tsx`
- `src/app/admin/sla/SlaContent.tsx`
- `src/app/admin/kanzlei-board/KanzleiBoardContent.tsx`
- `src/app/admin/statistiken/StatistikenContent.tsx`
- `src/app/admin/reklamationen/ReklamationenContent.tsx`

**Geändert:**
- `src/app/admin/faelle/(hub)/layout.tsx` (FaelleHubHeader statt FaelleHubTabs)
- `src/app/admin/faelle/(hub)/{sla,statistiken,kanzlei,reklamationen}/page.tsx` (Re-Export → `<…Content/>`)
- `src/app/admin/{sla,statistiken,kanzlei-board,reklamationen}/page.tsx` (Header-Wrapper + `<…Content/>`)
- ggf. `StatistikenClient`/`ReklamationenClient`/`FaelleKanban` (nur falls redundanter Titel)

**Gelöscht:**
- `src/app/admin/faelle/(hub)/FaelleHubTabs.tsx` (durch RouteTabBar+FaelleHubHeader ersetzt) — knip-Baseline ggf. senken.
