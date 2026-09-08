# Screen-Layout- & Kontrast-Audit (alle Portale, Desktop) — 2026-06-29

Read-only Audit (4 parallele Layout-Agents je Portal-Cluster + WCAG-Kontrast-Rechnung der Token-Paare). Keine Code-Änderungen. Ziel: ungenutzter Raum, 3-fach-Splits, unlogische/inkonsistente Komposition — plus Kontrast-Verifikation der Status-Tokens.

---

## TL;DR — die 6 höchsten Hebel (Aufwand↔Wirkung)

1. **Die globale Breiten-Verengung auflösen.** Jede Desktop-Seite läuft durch `md:ml-56` (Sidebar) **+ `md:pr-36` (144px tote Spalte nur für die fixe UpdatesNav-Pill) + `PageContainer md:w-[96%]`**. Auf 1440px bleiben nur ~1031px nutzbar, mittig. Das ist die Wurzel der meisten „ungenutzt/eng"-Befunde. → `pr-36` killen (Pill in `PageHeader`-Actions oder `z-30`-Float ohne Reservierung), EINE zentrale Max-Breiten-Politik statt pro-Seite gestreuter Caps.
2. **Fallakte (`faelle/[id]` + Kunde-Fallakte): Single-Column-Card-Halde → 2-Spalten-Master/Detail.** Beide stapeln 10–15 Cards full-width übereinander (teils `max-w-md` links-bündig = halbe Breite leer). Größter sichtbarer Raum-Verlust, **kundenseitig**.
3. **Admin Finanzen-Hub: 13 voll-breite Sektionen gestapelt, viele halbleere 3-Spalten-Grids → 2-Spalten-Dashboard-Raster.** Endloses Scrollen, breiter Raum tot.
4. **Tool-Views full-bleed machen** (Dispatch `karte`+`kalender`, Gutachter `heute`): die brauchen Vollbreite, werden aber von der `pr-36`/`w-96%`-Klammer beschnitten → eigene Route-Group ohne PageContainer.
5. **Breiten-Konsistenz pro Portal.** Kunde hat 4 verschiedene Seitenbreiten, Admin 1600/1400/keine, Makler 6xl/7xl, Gutachter full-vs-`max-w-2xl`. Beim Navigieren springt die Content-Kante. → kanonische Breite je Portal.
6. **3 Struktur-Bugs** (schnell): Admin `/aufgaben` Doppel-Header (re-exportierte Seiten mit eigenem PageHeader unter Hub-Tabs); Gutachter-Nav doppelter „Abrechnung" + toter `'Geschäft'`-Conditional (Team/Community/Verifizierung werden nie eingehängt); Dispatch-Leads doppelter NeuLead-Trigger (Header + FAB).

---

## Kontrast / A11y (WCAG)

WCAG-Ratios der Token-Paare (AA: 4.5 Normaltext / 3.0 Großtext+UI-Komponenten):

| Paar | Ratio | Verdikt |
|---|---|---|
| `-strong` auf `-soft` (success/warning/danger) | 5.2 / 6.8 / 7.3 | ✅ AA Normaltext |
| `-strong` auf Weiß | 5.5 / 7.1 / 8.0 | ✅ AA Normaltext |
| `warning-soft`/`success-soft` TEXT auf Navy (Dark-Context) | 16.3 / 16.0 | ✅ (Dark-Context-Call korrekt) |
| **`text-success` (#10B981 base) auf Weiß** | **2.54** | ❌ **FAIL** |
| **`text-warning` (#F59E0B base) auf Weiß** | **2.15** | ❌ **FAIL** |
| **`text-danger` (#F43F5E base) auf Weiß** | **3.67** | ⚠️ nur Großtext/UI |
| `text-success`/`-warning`/`-danger` base auf `-soft`-BG | 2.41 / 2.07 / 3.34 | ❌ FAIL |

**Finding:** Die **Basis-Status-Tokens** (`text-success`/`text-warning`/`text-danger` = emerald-500/amber-500/rose-500) sind für **Solid-Fills** gedacht (`bg-success` + weißer Text = hoher Kontrast) — als **Text/Icon auf hellem Grund** fallen sie durch AA. Genau dafür gibt es die `-strong`-Varianten (emerald-700/amber-800/rose-800, alle AA ✓; design-tokens.ts:29-32 „Darker Text-Varianten für Lesbarkeit auf hellem Tint").

**Empfehlung:** Konvention schärfen — **Text/Icon auf hell → immer `-strong`; Basis-Token nur für Solid-Fills + Dark-Context (`-soft` auf Navy)**. Der Token-Rubric mappte `text-*-600 → text-{base}`; für Text-Nutzungen sollte das `→ text-{strong}` sein. Folge-Codemod-Kandidat: `text-success`/`-warning`/`-danger` als Text/Icon auf hellem BG → `-strong` (klein, mechanisch, a11y-Gewinn). `danger` ist grenzwertig (3.67/3.34, UI ok), `warning` am schlimmsten (2.07–2.15).

---

## Querschnitts-Ursachen (über mehrere Portale)

- **Breiten-Kette `ml-56 + pr-36 + w-96% + per-page max-w`** — kumulierte Verengung; `pr-36` opfert 144px global nur für eine ~120px-Pill (Dispatch + Admin bestätigt). Per-Page-Caps uneinheitlich (1600/1400/none).
- **Single-Column-Card-Stacks** wo 2-Spalten-Master/Detail richtig wäre — Fallakte (faelle + gutachter + kunde), Admin-Finance, Dispatch-Dashboard.
- **N-fach-Splits mit dünner/leerer Spalte** — Dispatch Lead-Detail (340px-Aside meist collapsed `<details>`, klaut der Hauptspalte das `xl:grid-cols-3`), Fallakte 3-Spalten kollabiert Mittelspalte auf ~120px bei `lg`, Gutachter `heute` fixe 420px-Overlay (skaliert nicht auf 4K).
- **Inkonsistente Sub-Nav-Idiome** (Admin): `border-b`-Tabs vs Map-Header-Buttons vs Pill-Links — gehört in eine `AdminHubTabs`-Shared-Component.
- **Sparse/leere Flächen** — Makler-Dashboard (dormant → leeres 2/3-Aktivitäts-Panel), Gutachter-Statistiken (eine zentrierte „coming soon"-Card in leerem Viewport).
- **Detail-Views nie auf Desktop-Mehrspaltigkeit gehoben** — Gutachter `termine/[id]`/`profil`/`vor-ort` bleiben `max-w-2xl` Telefon-Säulen trotz Full-Width-Portal-Direktive.

---

## Pro Portal (Top-Befunde, je `file:line`)

### Dispatch
- **[H] Karte beschnitten** `dispatch/karte/page.tsx:16` — Full-Bleed-Map durch `pr-36`+`w-96%` zerschnitten; Map-Controls sitzen an `w-96%`-Kante statt Bildschirmrand → wirkt wie Bug. Kalender (`KalenderClient.tsx:213,324`) gleich beschnitten.
- **[H] Lead-Detail 3-spaltig, Mittelspalte zu schmal** `DispatchLeadForm.tsx:172,202,276` — Nav 224 + Main + Aside 340; Hauptspalte ~620px → `xl:grid-cols-3`-Feldgrid greift nie sinnvoll; 9 Tabs scrollen dauernd; Aside zu 5/6 collapsed `<details>`. → Aside verschlanken/als Drawer, `pr-36` für Route raus.
- **[M] Dashboard** `dashboard/page.tsx:174` — voll-breite Rückruf-Timeline über 2-Spalten-Sektion = unbalanciert; → `lg:grid-cols-3`.
- **[N] Leads doppelter NeuLead-Trigger** `leads/page.tsx:88,134` (Header + Floating-FAB überm Tisch).

### Gutachter + Fallakte
- **[H] Fallakte Pre-Shell-Card-Halde** `faelle/[id]/page.tsx:853-938` — bis zu 10 Worklist-Cards (teils full-width, teils `max-w-md` links = halbe Breite leer) **vor** der 3-Spalten-Shell → man scrollt durch eine Card-Kolonne bevor die Akte beginnt; `calc(100vh-96px)`-Shell startet unter der Falz, verschachtelte Scroll-Kontexte. → Cards in Sidebar/eigenen Tab.
- **[M] Fallakte 3-Spalten kollabiert** `FallakteShell.tsx:162` — `aside lg:w-72/xl:w-80` + `main flex-1` + `FallSidebar lg:w-[340px]`; bei `lg` bleibt Main ~120px. → Seitenspalten erst ab `xl` fest.
- **[H] `heute` fixe 420px-Overlay** `HeuteClient.tsx:231,249` — Map `lg:fixed inset-0`, Liste `lg:absolute w-[420px]`; auf 4K dominiert Map-Totraum, Liste gequetscht. → prozentualer/Flex-Split.
- **[M] Detail-Views `max-w-2xl`-zentriert** `termine/[id]/page.tsx:181`, `profil/page.tsx:68` — trotz Full-Width-Direktive Telefon-Säulen mit Totraum. → 2-Spalten-Desktop oder konsequent zentrieren.
- **[N] Nav-Bug** `GutachterShell.tsx:89,98,167-175` — doppelter „Abrechnung", toter `'Geschäft'`-Conditional → Team/Community/Verifizierung nie eingehängt.

### Admin
- **[H] Finanzen-Hub 13 Sektionen** `finance/(hub)/page.tsx:763-837` — voll-breit gestapelt, viele halbleere `grid-cols-3/4`-Kennzahl-Grids → 2-Spalten-Raster, statische Info-Sektionen in Collapsible.
- **[H] 2 Kanban-Boards gegensätzlich** — Tasks `max-w-[1400px]` umbrechend (`KanbanBoard.tsx:282`) vs Fälle full-bleed `w-[104%]` scroll (`FaelleKanban.tsx:100`). → eine Kanban-Konvention.
- **[H] `/admin/aufgaben` Doppel-Header** `aufgaben/layout.tsx:16` + re-exportierte `tasks/page` mit eigenem PageHeader+`max-w-[1400px]` → 2 Header-Ebenen, nicht-bündig. → re-exportierte Seiten ohne eigenen Header/Cap.
- **[M] Sub-Nav-Wildwuchs** — 4 Hubs `border-b`-Tabs, SV Full-Bleed-Map-Header-Buttons, Team Pill-Links. → `AdminHubTabs`-Shared.
- **[M] Dashboard KPI 6-in-Reihe** `page.tsx:47`/`KpiCards.tsx:193` — `lg:grid-cols-6` → ~190px/Karte gequetscht; `lg:grid-cols-3 2xl:grid-cols-6`. Tageskalender voll-breit aber einspaltig dünn.
- **[N] Finance-Charts Dark-Hex** `FinanceClient.tsx:155,169` — Zinc-Dark-Palette-Relikt auf hellen Karten.

### Kunde / Makler / Kanzlei
- **[H] Kunde-Fallakte Single-Column-Stack** `kunde/faelle/[id]/page.tsx:599` — `md:max-w-none` + ~15 Cards full-width einspaltig; 1-Satz-Banner 1300px breit, sehr lang. → 2-Spalten-Master/Detail (`lg:grid-cols-[minmax(0,1fr)_360px]`).
- **[H] Breiten-Inkonsistenz** — Kunde: Dashboard/Fallakte full, Fälle `max-w-2xl`, Termine `max-w-3xl` (4 Regime). Makler: alles `max-w-6xl` außer Abrechnungen `max-w-7xl`. → kanonische Breite je Portal.
- **[H] Makler-Dashboard halbleer** `MaklerDashboard.tsx:95` — `lg:grid-cols-3`, 2/3-Aktivitäts-Panel im Dormant-Fall leeres Rechteck + 3 QuickActions. → EmptyState mit CTA, Layout-Kollaps bei leer.
- **[M] Kanzlei-Tabelle ungecappt** `kanzlei/mandate/page.tsx:75` — dünne 7-Spalten-Tabelle über volle Breite gestreckt. → `max-w-7xl` im Page-Body (nicht Layout, sonst Kanban-Bleed weg).
- **[N] Kunde-Sidebar `w-64` vs PortalNav `w-56`** — Kunde fällt aus dem geteilten Nav-Pfad (vertretbar wg. Branding/Kontakt-Cards, aber dokumentieren).

---

## Roadmap / Priorität (Vorschlag)

**Phase 1 — globale Hebel (höchste Wirkung, aber Shell-Blast-Radius → Aaron-Buy-in + Koordination):**
1. `pr-36`-Pill-Reservierung auflösen + EINE Max-Breiten-Politik (`PageContainer`/`ContentMaxWidth`).
2. Tool-Views (karte/kalender/heute) full-bleed Route-Group.

**Phase 2 — Komposition (pro Portal, mittlerer Blast-Radius):**
3. Fallakte (faelle + kunde) 2-Spalten-Master/Detail.
4. Admin-Finance-Hub 2-Spalten-Raster.
5. Breiten-Konsistenz pro Portal.

**Phase 3 — schnelle Fixes (klein, isoliert):**
6. Struktur-Bugs (aufgaben-Doppel-Header, gutachter-Nav, dispatch-FAB).
7. Sparse-Dashboards (Makler-EmptyState, gutachter-Statistiken).
8. Kontrast-Codemod (`text-{base}` als Text → `-strong`).

**Kollisions-Hinweis:** Die Shell-Layouts (`*/layout.tsx`, `PageContainer.tsx`, Shells) sind high-leverage aber high-blast-radius — bei 9 aktiven Sessions vor Shell-Eingriffen koordinieren. Die isolierten Fixes (Phase 3) + portal-lokale Kompositions-Fixes sind eher kollisionssicher, aber jeweils gegen die aktive Session des Portals checken (Dashboard-Audit 7acbb005 = admin/kb; aar-956 = termine/embed; werkstatt-Sessions = faelle/[id]).
