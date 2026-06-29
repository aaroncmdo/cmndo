# Mobile- & Inkonsistenz-Audit: KB / Admin / Dispatch (2026-06-29)

Read-only Audit (3 parallele Agents je Portal, Desktop- **und** Mobile-Lens). Folge-Audit zum Desktop-only `2026-06-29-screen-layout-contrast-audit.md`. Aaron: „gibt es weitere Unstimmigkeiten vor allem bei KB, Admin, Dispatch — und das auch mobil".

## TL;DR

**Desktop ist abgehangen. Mobile ist strukturell halbfertig.** Quer durch alle drei Portale wiederholt sich **eine Wurzel + vier Muster**:

1. **WURZEL — Mobile-Navigation unvollständig/fehlend** (`PortalNav.tsx`, shared, **verifiziert**):
   - `light`-Variante (**KB/Mitarbeiter + Kanzlei**) hat **gar keinen** Mobile-Bottom-Nav-Block — nur die `hidden md:flex`-Sidebar. → unter 768px **keine Navigation**, Portal nur per URL bedienbar.
   - `dark`-Variante (**Admin + Dispatch**) hat einen Bottom-Nav, rendert aber nur die vom Caller übergebenen `mobileItems` **ohne Overflow**: Admin zeigt 5/17 Routen, Dispatch 6/9. Finanzen, Team, Einstellungen, **Sicherheit/2FA** sind am Handy unerreichbar.
   - **Ein Fix in `PortalNav` heilt alle vier Portale** (light-Bottom-Nav + „Mehr"-Overflow-Sheet).
2. **Muster B — Kalender-Grids brechen mobil** (Admin `grid-cols-7`, Dispatch fix-5-Spalten, beide ohne Mobile-Fallback/Tag-Ansicht).
3. **Muster C — Fixe-Breiten-Panels stapeln nicht** (`w-72`/`w-80`/`w-[340px]` ohne `md:`-Breakpoint → quetschen den Content auf 375px): KB Nachrichten, Admin SV-Detail, Dispatch Karte + Rückrufe.
4. **Muster D — Tabellen ohne Mobile-Card-Fallback** (Admin: 1 von ~33 Tabellen hat Cards, Rest = horizontaler Scroll).
5. **Neuer Desktop-Befund + Regression in eigenem Fix** (Dispatch Lead-Detail-Header umgeht `.has-corner-pill` aus #3320 → sitzt unter der Pill).

---

## WURZEL: PortalNav Mobile-Nav (`src/components/shared/portal-nav/PortalNav.tsx`)

**Verifiziert (Read L130–269):** `dark`-Variante rendert `mobileItems` als Bottom-Nav (L182–226, `min-w-[48px] min-h-[48px]` ✓). `light`-Variante (L232–...) rendert **nur** das `<aside>` — kein Mobile-Block. Die Caller `MitarbeiterNav`/`KanzleiNav` übergeben deshalb auch kein `mobileItems`.

**Fix (heilt 4 Portale):**
1. `light`-Variante: Mobile-Bottom-Nav-Block analog `dark` ergänzen (hell gestylt: weißer/glass-light Bar, `text-claimondo-ondo`/aktiv `bg-claimondo-navy text-white`).
2. `MitarbeiterNav` + `KanzleiNav`: `mobileItems`-Auswahl der ~5 Kern-Routen durchreichen.
3. **Overflow für >5 Items** (Admin 17, Dispatch 9): 6. Slot „Mehr" öffnet ein `Sheet` mit der vollen `NAV_ITEMS`-Liste. In `PortalNav` als generischer Mechanismus, sobald `mobileItems.length > 5` (oder explizites `mobileOverflow`-Prop).

Blast-Radius: shared, alle Portale rendern PortalNav → sorgfältig + Preview-Visual-Check. Aber genau **ein** Ort, der das Kern-Problem aller drei Portale löst.

---

## Pattern A — Mobile-Nav je Portal

| Portal | Befund | Datei | Sev |
|---|---|---|---|
| **KB** | Komplett unnavigierbar mobil (light = kein Bottom-Nav) | `mitarbeiter/_components/MitarbeiterNav.tsx:30` + `PortalNav.tsx` light | 🔴 |
| **Admin** | 5/17 Routen mobil, kein Hamburger/Overflow; Spotlight nur Cmd+K (mobil nicht auslösbar) + sucht nur Entitäten, navigiert keine Routen | `admin/_components/AdminNav.tsx:39` (`MOBILE_HREFS`) | 🔴 |
| **Dispatch** | 6/9 Routen mobil; `NAV_NACHSCHLAGEN` (Sachverständige, Isochrone, **konto/2FA**) ohne Mobile-Einstieg | `dispatch/_components/DispatchNav.tsx:47` (`mobileItems={NAV_ARBEIT}`) | 🔴 |

---

## Pattern B — Kalender mobil

- **Admin** `admin/kalender/KalenderClient.tsx:324,330,338` — `grid grid-cols-7` + `min-h-24` + `text-[10px]`-Chips, kein Breakpoint, kein Agenda-Fallback. ~50px/Tag auf 375px → unlesbar/untreffbar. 🔴 Mobile.
- **Dispatch** `dispatch/kalender/KalenderClient.tsx:324` — `gridTemplateColumns:'60px repeat(5,1fr)'` hartcodiert, kein `overflow-x-auto` (schrumpft statt scrollt), Termin-Blöcke 2-zeilig in ~59px. 🔴 Mobile.
- **Fix beide:** unter `md` auf vertikale Tages-/Agenda-Ansicht (Events untereinander) umschalten, Wochengrid erst ab `md:`.

## Pattern C — Fixe-Breiten-Panels stapeln nicht

| Befund | Datei | Sev |
|---|---|---|
| KB Nachrichten: `<aside className="w-80 … shrink-0">` permanent neben Chat-Detail, kein `md:` → Chat ~55px auf 375px (shared, auch Admin-Nachrichten) | `components/chat/ChatInboxLayout.tsx:66` | 🔴 Mobile |
| KB Nachrichten: `h-full` ohne Höhen-Anker (KB-Shell ist nicht `h-screen overflow-hidden` wie Kanzlei) → Höhe kollabiert | `mitarbeiter/layout.tsx:52` vs `ChatInboxLayout:66` | 🟡 beide |
| Admin SV-Detail: `<div className="… flex">` mit `flex-1`-Form + fixem `w-[340px]`-Panel, kein `flex-col md:flex-row` → Form auf ~35px (rendert auch im `@drawer`-Intercept mobil) | `admin/sachverstaendige/[id]/page.tsx:375` | 🔴 Mobile |
| Dispatch Karte: `absolute right-3 top-3 … w-72`-Overlay (288px) verdeckt Karte + kollidiert mit `LayerChipBar` (`left-3 top-3`) | `dispatch/karte/UnlocalizedSidebar.tsx:15` + `LayerChipBar.tsx:19` | 🔴 Mobile |
| Dispatch Rückrufe: `w-72`-Aktionspanel **inline** in `flex`-Zeile → Overflow; Meta-Zeile ohne `flex-wrap` | `dispatch/rueckrufe/RueckrufActions.tsx:70` + `rueckrufe/page.tsx:88,105` | 🟠 Mobile |
| **Fix-Pattern (alle):** fix-Breite → `w-full md:w-[…]`; bei Master/Detail mobil auf Toggle/Sheet (Detail nur bei aktiver Auswahl) statt Dauer-Split. |

## Pattern D — Tabellen ohne Mobile-Card-Fallback (Admin)

`components/shared/DataTable.tsx:47` liefert nur `overflow-x-auto` (Kommentar: „Mobile-Karten-Fallbacks bleiben Caller-Sache"). Von ~33 Admin-Tabellen nutzt **nur** `FinanceClient.tsx:206/253` echte Mobile-Cards; alle anderen (Team 6 Spalten, Abrechnungen 7, SV-Leads 6, Provisionen `min-w-[800px]`) = horizontaler Scroll. Inkonsistent: gleiche App, mal Cards, mal 7-Spalten-Scrollwüste. **Fix:** Card-Pattern als `<DataTable mobileCard={…}>`-Variante extrahieren, mind. High-Traffic-Listen nachziehen. 🟡 Mobile.

## Zwei Kanban-Boards, gegensätzliche Mobile-Strategie (Admin)

`admin/faelle/(hub)/FaelleKanban.tsx:120` = `flex; overflowX:auto`, 4 Spalten à `minWidth:220` (~900px, erzwingt H-Scroll) **vs** `admin/tasks/KanbanBoard.tsx:320` = `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` (stapelt sauber). Zusätzlich: Tasks-Statuswechsel nur per Drag&Drop (`@hello-pangea/dnd`) — auf Touch unzuverlässig → Kanban mobil faktisch read-only. **Fix:** FaelleKanban mobil stapeln; Tasks mobil ein Status-Select pro Card als DnD-Fallback. 🟡 Mobile.

---

## Neue Desktop-Befunde

- 🟡 **Dispatch Lead-Detail-Header umgeht `.has-corner-pill` (Regression aus #3320):** `dispatch/leads/[id]/DispatchLeadForm.tsx:173–180` baut Titel + `SaveIndicator` als eigenes `<div>` (kein `PageHeader`/`[data-page-header]`). Die #3320-Regel `.has-corner-pill [data-page-header]{pr:9rem}` greift nicht → `SaveIndicator` sitzt ≥768px unter der fixen UpdatesNav-Pill. **Vorher** schützte das full-height `md:pr-36` diesen Header mit; mein Scoping hat ihn freigelegt. **Fix:** Wrapper `md:pr-36` ODER `data-page-header` setzen. *(Mein eigener Fix-Gap — vorrangig.)*
- 🟢 **Admin Finance Chart-Tooltip dunkel auf hellem Hub:** `admin/finance/(hub)/FinanceClient.tsx:154–177` hartkodierte Dark-Hex (`#18181b`/`#27272a`) — Data-Viz darf raw Hex, aber visuell fremd zum Light-Theme. Fix: Light-Palette/Claimondo-Töne.
- 🟢 **KB Radius-Drift:** `performance/PerformanceClient.tsx` + `profil/MitarbeiterProfilClient.tsx` durchgängig `rounded-2xl` statt `rounded-ios-*` (Radii-Ratchet-Konvention); Dashboard/Fälle korrekt. Zwei Radius-Systeme nebeneinander.
- 🟢 **KB Header-Inkonsistenz:** Performance-Seite `py-8` + `PageHeader` ohne `size="lg"` (alle Schwester-Views mit) → abweichender Rhythmus. KB-Header ohne Portal-Badge + ohne Shield (Kanzlei/Dispatch haben beides).

## Token-Verstöße (Status-Ratchet, Bestand)

- KB `termine/page.tsx:15` `TYP_META`: raw `bg-amber-50/text-amber-700`, `bg-emerald-50/text-emerald-700` → `bg-warning-soft/text-warning-strong` etc. (`reklamationen/page.tsx:59` macht's korrekt).
- KB `performance/PerformanceClient.tsx`: raw `text-green-400`/`text-red-400`/`text-amber-400` — teils Status (→ Token), teils Medaillen/Data-Viz (→ `// Token-Audit-Skip`-Header).

---

## Was mobil OK ist (geprüft, kein Befund)

- Primitives `Modal.web.tsx`/`Drawer.web.tsx` sauber responsiv (`w-full md:w-[…]`, `mobileFullscreen`, `maxHeight`-Clamp). SV-Detail-Drawer (920px) wird mobil korrekt fullscreen.
- Admin SV-Karte `KarteHubClient.tsx:286` stapelt (`flex-col lg:flex-row`).
- Bottom-Nav-Touch-Targets `min-w-[48px] min-h-[48px]` ≥44px ✓.
- KPI-Grids `grid-cols-2 lg:grid-cols-6` mobil 2-spaltig (vertretbar).
- Dispatch: Dashboard/Gutachter-Finder/Isochrone-Splits `lg:`-responsiv; Leads-Tabelle `overflow-x-auto`; NeuLeadDrawer/SpontanTermin-Modal mobil sauber.

---

## Priorisierte Roadmap (Leverage × Kosten × Kollision)

**Kollisionslage (7 aktive Sessions):** keine fasst `PortalNav`/`*Nav.tsx`/Kalender/Chat an (aar-956=termine/embed, auth-csprng, filmcheck, rls-safety-net, admin-canon-fixes=cfefdf75=Admin-**Daten/Views**, nicht Nav-UI). Vor jedem Fix den konkreten File gegen die aktive Session prüfen (v.a. cfefdf75 für `admin/**`).

1. **🥇 PortalNav Mobile-Nav** (größter Hebel, heilt KB+Kanzlei+Admin+Dispatch). Shared/feature-sized. PR allein.
2. **🥈 Dispatch #3320-Regression** (eigener Fix-Gap, 1 File, billig, sofort).
3. **Fixe-Breiten-Stapler** (ChatInboxLayout [+Admin-Nachrichten], SV-Detail, Karte/Rückrufe) — portal-lokal, je kleiner PR.
4. **Kalender-Mobile-Fallback** (Admin + Dispatch, Tag/Agenda-Ansicht) — feature-sized, 2 Files.
5. **DataTable mobileCard + FaelleKanban-Stack** — Muster-Extraktion, mittel.
6. **Kosmetik/Token** (KB Radii/Header/termine-Tokens, Finance-Tooltip) — Boy-Scout.
