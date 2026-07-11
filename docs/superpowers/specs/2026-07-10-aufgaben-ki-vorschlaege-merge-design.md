# Aufgaben + KI-Vorschläge zusammenführen — ein Pill-Board

**Datum:** 2026-07-10
**Status:** Design freigegeben (Brainstorming abgeschlossen), bereit für Umsetzungsplan
**Branch:** `kitta/aufgaben-vorschlaege-merge` (Worktree off staging)
**DB:** kein Change, keine Migration — reines UI/Routing-Refactor

## Motivation

`/admin/aufgaben` (Task-Kanban mit Sub-Tabs *Meine*/*Alle*) und `/admin/ai-vorschlaege`
(KI-Vorschlags-Inbox + `GraduierungPanel`) sind heute getrennte Nav-Einträge — obwohl sie
**ein Workflow** sind: einen KI-Vorschlag *annehmen* ruft `buildTaskFromProposal` auf und
**erzeugt genau einen Task**. Vorschläge sind also der *Eingang* der Task-Pipeline. Die
Trennung fragmentiert die „was ist zu tun"-Sicht und kostet einen zusätzlichen Nav-Slot.

Ziel: **eine** Fläche, oben eine **Pill-Reihe** (kein großer `PageHeader`), ein Nav-Eintrag.

## Entscheidungen (aus dem Brainstorming, fix)

1. **Struktur = „Zwei Bereiche, Kanban bleibt"** (nicht Kanban→Liste). Das 4-Spalten-Kanban
   mit Drag&Drop bleibt unangetastet; Vorschläge kommen als eigene Pill dazu.
2. **3 Pills** (die bestehenden *Meine*/*Alle*-Tabs verschmelzen mit den Vorschlägen):
   `KI-Vorschläge (N) · Alle Aufgaben · Meine Aufgaben`.
3. **Ein Nav-Eintrag** „Aufgaben"; Badge = **Anzahl offener KI-Vorschläge**. Der separate
   „KI-Vorschläge"-Nav-Eintrag entfällt. `KI-Aufsicht` bleibt separat (andere Funktion).
4. **Route-basierte Pills** (neue Sub-Route `vorschlaege` neben `alle`/`meine`) — erweitert
   das bestehende Layout-Muster, kein Umbau auf Query-Params.
5. **Kein großer Header** — die Pill-Leiste (im Layout) ist die einzige geteilte Top-Chrome.
   Die Pill-Leiste bleibt **rein** (nur Pills). Kontextuelle Aktionen (`+ Neuer Task`,
   `Auto-erledigte anzeigen`) leben **auf der `alle`-Seite** (eigene schlanke Aktionszeile über
   dem Board), nicht in der geteilten Leiste — hält das Layout von Routen-Wissen entkoppelt.

## Ausgangslage (verifiziert auf main)

- `src/app/admin/aufgaben/layout.tsx` — `'use client'`, rendert bereits eine Tab-Nav
  (Underline-Style) mit *Meine Tasks* (`/admin/aufgaben/meine`) + *Alle Tasks*
  (`/admin/aufgaben/alle`) via `usePathname`.
- `src/app/admin/aufgaben/alle/page.tsx` — lädt Tasks, rendert `KanbanBoard`
  (aus `src/app/admin/tasks/KanbanBoard.tsx`) inkl. eigenem `PageHeader` „Tasks".
- `src/app/admin/aufgaben/meine/page.tsx` — re-exportiert `../../meine-tasks/page`.
- **Kein** `src/app/admin/aufgaben/page.tsx` (bare index) → Nav `/admin/aufgaben` löst
  vermutlich über bestehenden `next.config`-Redirect auf `/admin/aufgaben/alle` auf
  (beim Bau verifizieren; sonst Redirect ergänzen).
- `src/app/admin/ai-vorschlaege/page.tsx` — admin-gated; lädt `listOpenProposals`
  (Orchestrator-Quelle) + `getTypeStats`; rendert `AiVorschlaegeClient` (Liste,
  Annehmen/Verwerfen) + `GraduierungPanel`.
- `AiVorschlaegeClient.tsx` rendert ein eigenes `<h1>KI-Vorschläge</h1>` + Zähler.
- `AdminNav.tsx` — zwei Einträge: `/admin/aufgaben` (Badge `meineTasksCount`) und
  `/admin/ai-vorschlaege` (Badge `AdminAiVorschlaegeBadge`).

## Zielarchitektur

### Routen
| Route | Inhalt | Status |
|---|---|---|
| `/admin/aufgaben` | → Redirect auf `/admin/aufgaben/alle` (Default-Pill) | bestehend/prüfen |
| `/admin/aufgaben/vorschlaege` | **NEU** — Vorschlags-Inbox + `GraduierungPanel` | neu |
| `/admin/aufgaben/alle` | Kanban (headerless) | bestehend, enthärtet |
| `/admin/aufgaben/meine` | Meine Tasks (unverändert) | bestehend |
| `/admin/ai-vorschlaege` | **308-Redirect** → `/admin/aufgaben/vorschlaege` | Page gelöscht |

### Layout & Pills
- `aufgaben/layout.tsx` wird **Server-Component**: lädt die Counts (offene Vorschläge via
  `getOffeneVorschlaegeCount`; Task-Counts optional) und rendert
  `<AufgabenPillNav counts=… />` + `{children}`.
- **`AufgabenPillNav`** (neuer Client-Component) — `usePathname` für Active-State, rendert
  3 Pills im **Pill-Stil** (nicht Underline), `KI-Vorschläge` mit Count-Badge. **Reine Pills,
  keine Aktionen** (entkoppelt vom aktiven Sub-Route).
- Die `alle`-Seite verliert `KanbanBoard`s `PageHeader` und rendert stattdessen eine schlanke
  Aktionszeile (`Auto-erledigte anzeigen` + `+ Neuer Task`) direkt über dem Board.
- **Pill-Komponente wiederverwenden**, nicht neu bauen. Kandidaten: `shared/fall-tabs`,
  `components/onboarding/fields/SegmentedField`, `shared/glass/GlassPill`. ⚠️ Siehe *Koordination*.

### Vorschläge-Seite (`aufgaben/vorschlaege/page.tsx`, neu)
- 1:1 die bisherige `ai-vorschlaege/page.tsx`-Logik: admin-Guard, `listOpenProposals` +
  `getTypeStats`, rendert `AiVorschlaegeClient` + `GraduierungPanel`.
- **`AiVorschlaegeClient` bekommt einen `headerless`-Modus** (kein `<h1>`), da die Pill der Titel ist.

### Kanban (`alle`)
- `KanbanBoard` bekommt einen `headerless`-Modus (oder das Board-Grid wird aus dem
  `PageHeader`-Wrapper gelöst). Drag&Drop, Spalten, `+ Neuer Task`, Reassign — **unverändert**.

### Nav
- `AdminNav`: **ein** Eintrag „Aufgaben" (`/admin/aufgaben`, `ClipboardListIcon`). Badge =
  offene KI-Vorschläge (die `AdminAiVorschlaegeBadge`-Logik wandert auf diesen Eintrag).
  Der `/admin/ai-vorschlaege`-Eintrag wird entfernt. `MOBILE_HREFS` ggf. anpassen.

### Server-Actions
- `annehmenVorschlag` / `verwerfenVorschlag` / `graduiereTyp` / `zuruecksetzenTyp`:
  `revalidatePath('/admin/ai-vorschlaege')` → `revalidatePath('/admin/aufgaben/vorschlaege')`.

## Counts & Badges
- Pill `KI-Vorschläge (N)` — N = offene Orchestrator-Vorschläge (`getOffeneVorschlaegeCount`).
- Pill `Alle Aufgaben (M)` — M = sichtbare Tasks (wie heute im Kanban-Header gezählt) — optional.
- Pill `Meine Aufgaben (K)` — K = `meineTasksCount`.
- Nav-Badge „Aufgaben" = N (offene Vorschläge).

## Nicht-Ziele (YAGNI)
- KI-Aufsicht (`/admin/ki-aufsicht`) wird **nicht** mit-gemergt.
- Keine Quelle-Sub-Filter in der Vorschläge-Pill (Copilot/Aufsicht haben eigene Flächen).
- Kanban wird **nicht** zu Listen umgebaut; keine neuen Vorschlags-Features.

## Tests
- `AufgabenPillNav`: Active-State je Route, Count-Badge-Rendering (Unit/Component).
- Redirect `/admin/ai-vorschlaege` → `/admin/aufgaben/vorschlaege` (308, anon-curl, kein Login).
- Redirect `/admin/aufgaben` → `/admin/aufgaben/alle`.
- Annehmen eines Vorschlags → Task erscheint danach im `alle`-Kanban (Prod-Smoke/Playwright).
- Nav-Badge zeigt offene-Vorschläge-Count.
- Regression: `alle`/`meine` unverändert funktionsfähig; `GraduierungPanel` funktioniert.
- Playwright-Smoke: Nav „Aufgaben" → Pills durchklicken → Annehmen → Task in „Alle".

## Audit & Risiken (7-Punkte-Vorschau)
- **Build:** `tsc` + `npm run build` (Routen/Layout geändert → voller Build Pflicht).
- **UI-Erreichbarkeit:** ein Nav-Eintrag + 3 Pills; alte Bookmarks per 308-Redirect.
- **Redundanz:** Pill-Komponente wiederverwenden (Component-Set-Policy); `AiVorschlaegeClient`/
  `KanbanBoard`/`GraduierungPanel` werden **reused**, nicht kopiert.
- **Dead-Code:** `ai-vorschlaege/page.tsx` gelöscht; knip-Baseline prüfen (verschobene Imports;
  `AiVorschlaegeClient`/`actions.ts` bleiben genutzt).
- **Redirect-Stub-Gate:** Redirects **nur** via `next.config.ts` (KEINE Redirect-`page.tsx`).
- **Inkonsistenz:** Claimondo-Tokens, echte Umlaute in UI-Strings, `{ ok }`-Result-Shape der Actions.
- **Regression:** `alle`/`meine`/`GraduierungPanel`/Nav-Badges/andere Admin-Routen intakt.

## Koordination
- ⚠️ Session `386b3bd8` (`kitta/vertrieb-konsolidierung`) baut **parallel** „Vertrieb → 1 Cockpit
  + Pills". Wir sollten **eine** Pill-Komponente teilen statt zweier. Abstimmung per Marker
  `COORDINATION-aufgaben-vorschlaege-merge.md` → an die Vertrieb-Session.
- `AdminNav.tsx` ist ein **shared-touch** File (Vertrieb-Session ergänzt dort `/admin/vertrieb`).
  Merge-Konflikte klein halten; im Marker dokumentieren.
- Isolierter Worktree; PR gegen `staging` (Regel 1). Kein DDL (Regel 2 n/a).

## Rollout
Worktree off staging → TDD/Subagent-Bau → 7-Punkte-Audit → PR gegen `staging` →
Prod-Smoke nach Deploy (Nav → Pills → Annehmen → Task in „Alle").
