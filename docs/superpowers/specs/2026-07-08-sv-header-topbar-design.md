# SV Header → Top-Bar — Design

**Datum:** 2026-07-08
**Auslöser:** Aaron: „im gesamten SV-UI passen die Header nicht — lass uns die rausnehmen und sauber bauen." (Sub-Projekt B aus `2026-07-08-sv-profil-rebuild-header-topbar-design.md`; Sub-Projekt A = Profil-Rebuild ist als PR #3996 gebaut.)
**Entscheidungen (brainstorming, Aaron):** Top-Bar-Umfang = **Titel + Actions** (Beschreibungen entfallen). Mobile = **Logo + Titel** in der Capsule.

## 1. Problem

Jede der 24 SV-Seiten rendert ihren eigenen `<PageHeader title description actions icon leadingSlot>` im Seiteninhalt. Auf Desktop steht darüber bereits die `WeatherBanner`-Zeile (Wetter + Outbox + Glocke). Ergebnis: zwei header-artige Zeilen gestapelt, inkonsistente Größen (`size="lg"` + Icon-Kreise auf manchen, nackt auf anderen) — „passt nicht". Ziel: `PageHeader` app-weit raus; Seitentitel + primäre Actions in einen schlanken Top-Bar-Slot der `GutachterShell`.

## 2. Architektur — Wiring (Kernentscheidung)

Die `GutachterShell` (Client, gerendert von `gutachter/layout.tsx`) liegt im Baum **über** den Seiten. Seiten können nicht direkt nach oben reichen. Gewählt: **Hybrid** aus Pathname-Titel-Map (statische Titel, instant, kein Nav-Flash) + Context-Hook (dynamische Titel + Actions).

Verworfene Alternativen: **nur Map** (verliert Actions + dynamische Titel wie Community-/Team-Name); **nur Hook** (Server-Pages können keine Hooks; Nav-Flash weil Effect erst nach Render läuft).

### 2.1 Datenfluss
```
Seite (client od. server)
  └─ optional: <SvPageChrome title actions />  ──►  Context-State {title, actions}
GutachterShell
  └─ SvTopBar: title = chrome.title ?? matchTitle(pathname) ?? ''
               actions = chrome.actions
```

### 2.2 Reset-Mechanismus (kein Stale-State, kein Clobber)
Kein separater Pathname-Reset-Effect (der würde als Parent-Effect den Child-Set der neuen Seite überschreiben). Stattdessen resettet die **Cleanup-Funktion des Hooks**: Seite A unmountet → Cleanup setzt `{title:null, actions:null}` → Seite B mountet → B-Hook setzt B-Werte (oder B hat keinen Hook → bleibt null → Map greift). React-Reihenfolge (Child-Cleanup vor Child-Setup) garantiert: `A-Werte → null → B-Werte`, sauber. Für Map-Only-Seiten aktualisiert sich der Titel ohnehin instant über `usePathname()` (kein Flash).

## 3. Neue Bausteine (alle neu — keine Fremd-Files, kein `layout.tsx`-Edit)

Verzeichnis: `src/app/gutachter/_shell/` (neu).

| Datei | Zweck | Interface |
|---|---|---|
| `page-chrome-context.tsx` | Context + Provider + Hook | `useSvPageChrome({title?, actions?}: {title?: string; actions?: React.ReactNode})` (Client-Hook, Effect-set + Cleanup-reset); `useSvPageChromeState()` (liest `{title, actions}` in der Shell); `<SvPageChromeProvider>` |
| `SvPageChrome.tsx` | Server-taugliche Deklaration | `<SvPageChrome title actions />` — Client, rendert `null`, ruft `useSvPageChrome`. Server-Pages rendern das mit Titel + (server-renderbaren) `<Link>`-Actions. |
| `page-titles.ts` | Fallback-Titel-Map | `SV_PAGE_TITLES: Array<{prefix: string; title: string}>` (längster Prefix zuerst gematcht) + `matchSvTitle(pathname): string \| null` |
| `SvTopBar.tsx` | die Bar (Desktop + Mobile-Titel) | Props: `{title, actions, weatherSlot, trailingSlot}` |

`SvPageChromeProvider` wird **in `GutachterShell`** um `{children}` gelegt (nicht in `layout.tsx`) → keine Kollision mit den offenen `layout.tsx`-Branches.

## 4. Desktop-Layout

Die bestehende `hidden lg:block`-Wetter-Zeile wird zur Top-Bar. `WeatherBanner` bleibt unverändert (behält seinen `trailingSlot` = Outbox + UpdatesNav):
```
┌───────────────────────────────────────────────────────────────┐
│ H1: {Titel}          …flex-spacer…     {actions}  [WeatherBanner]│
└───────────────────────────────────────────────────────────────┘
```
`SvTopBar` rendert Titel links (`<h1>`), Actions + `WeatherBanner` rechts. Bulky Controls (Fälle-Suchfeld, Filter-Tabs) sind **keine** Bar-Actions → bleiben im Seitenkörper.

## 5. Mobile

Die Floating-Capsule (`lg:hidden fixed`) zeigt künftig Titel:
- `/heute` (Home): Logo + Glocke (wie bisher).
- Unterseiten: `‹`(Back, `router.back()`) + kleines Logo-Mark + `{Titel}` + Glocke.
Titel aus demselben Chrome-Context/Map. Actions erscheinen auf Mobile **nicht** in der Capsule (zu schmal) → In-Page-Toolbar.

## 6. Seiten-Migration (24 `PageHeader`-Vorkommen)

Alle `<PageHeader>` entfernen. Die **exakte Zuordnung jedes der 24 Vorkommen** (inkl. reklamationen, fall/[id]/stellungnahme, termine/[id]) macht der Implementierungsplan; hier die Behandlungs-Regeln nach Kategorie:

- **Statischer Titel, keine Action → nur Map** (PageHeader raus, Prefix in `SV_PAGE_TITLES`): statistiken, verifizierung, einstellungen, einstellungen/kalender, einstellungen/verfuegbarkeit, profil, leadpreise, faelle (3 PageHeader-States → alle raus, Count wandert an die FilterTabs), einstellungen/embed/[id], einstellungen/embed/[id]/tracking-anleitung, reklamationen.
- **Dynamischer Titel → Hook** (`<SvPageChrome title={…}/>`): community (`org.name`), team (`orgName`); jede Detail-/Client-Seite mit laufzeit-berechnetem Titel (termine/[id], fall/[id]/stellungnahme etc.) — der Plan prüft pro Datei, ob der Titel statisch (→ Map) oder dynamisch (→ Hook) ist.
- **Actions → Hook** (`<SvPageChrome actions={…}/>`): abrechnung (Lead-Preise-Link), kalender (View-Toggle Kalender/Liste), gebiet (View-Tabs + Titel), einstellungen/embed (Neu-Button), auftraege (2 States → Map-Titel; `TagesvorbereitungButton` bleibt in-page).
- **Reine Count-Badges** (tasks „N offen", embed/anfragen „N Anfragen") = description-artig → **entfallen** (konsistent mit „Beschreibungen weg"); Count bei Bedarf in-page.

Regel bei Unsicherheit: statischer Titel → Map (kein Seiten-Code außer PageHeader-Entfernung); dynamischer Titel oder echte Action → `<SvPageChrome>`.

Info-Beschreibungen mit echtem Wert (leadpreise „Stand: Version") wandern als kleine Zeile in den Seitenkörper.

## 7. A11y

Der Top-Bar-Titel ist das **einzige `<h1>`** je Seite (übernimmt PageHeaders Semantik). Nach Migration prüfen: kein verwaistes zweites `<h1>` in Seitenkörpern. `SvTopBar` `<header>`-Landmark; Mobile-Back-Button mit `aria-label="Zurück"`.

## 8. Branch-Strategie / Kollision

- Branch `kitta/sv-header-topbar` **gestackt auf `kitta/sv-profil-rebuild`** (PR #3996) — weil die Migration `PageHeader` aus `ProfilClient.tsx` (dort in #3996 neu gebaut) + `einstellungen/page.tsx` entfernt; off `staging` gäbe es einen katastrophalen ProfilClient-Konflikt. Nach #3996-Merge → Rebase auf staging (dann konfliktfrei, da Profil-Änderungen bereits drin).
- **Kein `layout.tsx`-Edit** → kein Trampeln mit `aar-360-sv-vorlage-review-retire` / `sv-onb-deaktiviert-banner-fix` / `sv-portal-tz-singlerow-audit` (die nur `layout.tsx` anfassen).
- Shell-Umbau kollidiert **nicht** mit portal-shell-floating (`sidebar-detached-panel` #3990) — das fasst nur `PortalNav` (Nicht-SV-Rollen) an, `GutachterShell` = Referenz, unangetastet.

## 9. Testing

- **tsc** (0 Fehler in `src/app/gutachter`).
- **Ratchets**: component-set (`SvTopBar` nutzt Primitives/`SectionCard`-Stil, keine neuen handgerollten Buttons), token-audit, knip (keine toten Files; `PageHeader`-Import bleibt genutzt? — falls 0 Consumer nach Migration, ist der Shared-`PageHeader` weiterhin von anderen Portalen genutzt → nicht löschen).
- **Playwright `test-sv`** Vorher/Nachher-Screenshots auf 4 repräsentativen Seiten: kalender (Action=View-Toggle), community (dynamischer Titel), statistiken (Map-statisch), fall/[id] (Detail) + Mobile-Viewport (Capsule-Titel).

## 10. Umsetzungs-Reihenfolge (Plan-Vorschau)

1. `_shell/`-Bausteine: Context/Hook + `SvPageChrome` + `page-titles.ts` + `SvTopBar`.
2. `GutachterShell` verdrahten: Provider um `{children}`, Wetter-Zeile → `SvTopBar`, Mobile-Capsule → Titel.
3. Map befüllen + statische Seiten migrieren (PageHeader raus).
4. Dynamische-Titel-Seiten (community/team/detail) → Hook.
5. Action-Seiten (kalender/abrechnung/gebiet/embed) → `SvPageChrome actions`.
6. A11y-Pass (h1-Eindeutigkeit) + Verifikation (tsc/Ratchets/Playwright).

## 11. Out-of-Scope

- `WeatherBanner`-Inhalt/-Platzierung (bleibt wie ist, nur in die Bar integriert).
- Andere Portale (Admin/Dispatch/Kunde) — deren Header/PortalNav sind eigene Lanes.
- `PageHeader`-Shared-Component selbst (bleibt — andere Portale nutzen sie).
