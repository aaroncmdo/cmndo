# PortalShell — Freischwebende Shell-Komposition + Mobile-Nav-Strategie fuer alle Portale

**Datum:** 2026-07-08
**Branch:** `kitta/portal-shell-floating` (Worktree, Base `origin/staging`)
**Status:** Design abgestimmt (Fidelity/Scope/Architektur/Mobile via Brainstorming geklaert), wartet auf Spec-Review

---

## 1. Problem

**Desktop:** Das SV-Portal (`GutachterShell`) hat eine „freischwebende" Optik, die die anderen Rollen-
Portale nicht haben: farbiger Canvas, eine schwebende gerundete Content-Card darauf, Navigation als
transparente Glass-Pills. Aaron ist aufgefallen, dass die Sidebar bei den anderen Rollen nicht so
freischwebend ist. Ziel: die volle SV-Komposition konsistent auf die anderen Portale bringen.

**Mobile:** Die mobilen Ansichten sind „extrem unuebersichtlich, keine klare Linie, die Navbar
schrecklich". Die komplexen Portale (admin/dispatch/KB) quetschen zu viele Nav-Items in eine enge
Bottom-Bar (oder haben gar keine Mobile-Nav). Ziel: eine klare Mobile-Nav-Linie — Seiten-Drawer fuer
die komplexen Portale, saubere Bottom-Bar fuer die schlanken.

**Praezisierung (Aaron):** Die anderen Portale haben „erstmal alle das Claimondo-Standard-Design". Der
Canvas ist also **Claimondo-Navy als Default**, gesteuert ueber Brand-CSS-Vars — wo Branding legitim
greift (Kunde sieht das Brand seines SV), zieht der Canvas automatisch die Brand-Farbe. Kein Portal
hardcodet eine Farbe.

## 2. Ist-Analyse

### 2.1 Floating-Mechanismus existiert bereits (nicht das Problem)

- `useFloatingSidebar()` (`src/lib/branding/use-floating-sidebar.ts`) — Default `true`, Opt-out `?sidebar=bar` (localStorage-persistiert).
- `SidebarModeApplier` (`src/components/branding/SidebarModeApplier.tsx`) — setzt `data-sidebar-mode` auf `<body>` (im Root-`src/app/layout.tsx`).
- `globals.css` (~642–724) — rendert direkte Children eines `aside[data-sidebar-mode="floating"]` als Liquid-Glass-Pills. Body-Level-Pfad `body[data-sidebar-mode="floating"] aside.kunde-sidebar > *` fuer die bespoke Kunde-Sidebar.

**Der eigentliche Unterschied ist die Komposition.** Was SV freischwebend macht (`GutachterShell.tsx`):
1. **Canvas:** `lg:bg-[var(--brand-primary)]` (Desktop navy/brand; Mobile `bg-claimondo-bg`, ruhig).
2. **Schwebende Content-Card:** `<main>` = gerundete weisse Karte auf Canvas (`lg:rounded-l-2xl lg:bg-claimondo-bg lg:shadow-sm`), Content-Spalte `lg:pl-64`.
3. **Glass-Pills:** transparente Sidebar auf dem Canvas.

Die anderen Portale: nahezu weisser Seiten-BG, flush Content (`md:ml-56`), rendern zwar Glass-Pills, aber
ohne farbigen Canvas und ohne schwebende Card → flach statt freischwebend.

### 2.2 Portal-Inventar (Desktop)

| Portal | Nav | Shell-Struktur heute | Desktop-Gruppe |
|---|---|---|---|
| **SV / gutachter** | bespoke `GutachterShell` | ✅ Referenz — schon freischwebend | — |
| **admin** | `PortalNav` dark (`AdminNav`) | sidebar-first, fixed Nav + `md:ml-56` | A |
| **dispatch** | `PortalNav` dark (`DispatchNav`) | sidebar-first, fixed Nav + `md:ml-56` | A |
| **makler** | `PortalNav` dark (`MaklerShell`) | sidebar-first, fixed Nav + `md:ml-56` | A |
| **kunde** | bespoke `aside.kunde-sidebar` + `KundeNav` | sidebar-first, fixed Nav + `lg:ml-64`, Sidebar mit Kontakt-Cards | A |
| **kanzlei** | `PortalNav` **light** (`KanzleiNav`) | **header-first**: Top-Bar + Light-Sidebar darunter | B |
| **mitarbeiter** | `PortalNav` **light** (`MitarbeiterNav`) | **header-first**: Top-Bar + Light-Sidebar darunter, desktop-only | B |

### 2.3 Mobile-Ist-Zustand

- **SV**: `GutachterMobileTabBar` (4 Cockpit-Tabs + „Mehr"-Button → Sidebar-Drawer). Hybrid, bewusst so designt.
- **Kunde**: `KundeNav mobile` (Bottom-Nav) **+** `KundeMobileDrawer` (Hamburger → Full-Screen-Drawer fuer Kontakt-Cards).
- **admin/dispatch/makler**: nur `PortalNav`-`mobileItems`-Bottom-Bar (eng).
- **kanzlei/mitarbeiter**: desktop-only (keine echte Mobile-Nav).

## 3. Ziel

### 3.1 Desktop-Optik (alle Portale)
Volle SV-Komposition: farbiger Canvas + schwebende gerundete Content-Card + Glass-Pills.

```
AKTUELL                            ZIEL
┌──────────────────────┐          ╔═══════════════════════╗  ← Navy/Brand-Canvas
│▓ Sidebar │ content    │    →     ║ ⌇Nav   ╭────────────╮ ║
│▓ Item    │ (flush,    │          ║ ⌇Item  │ content    │ ║  ← schwebende weisse Card
│▓ Item    │  weiss)    │          ║ ⌇Item  │ (gerundet) │ ║
└──────────────────────┘          ║        ╰────────────╯ ║  ← Glass-Pills
                                   ╚═══════════════════════╝
```

### 3.2 Mobile-Nav-Strategie (Aaron)

| Mobile-Muster | Portale | Begruendung |
|---|---|---|
| **Seiten-Drawer** (Hamburger → Slide-out, NEU) | admin, dispatch, mitarbeiter (KB) | Komplexe/interne Portale, zu viele Items fuer eine Bottom-Bar |
| **Bottom-Tab-Bar** (behalten) | makler, kunde, *(werkstatt = Policy)* | Schlanke, saubere Item-Listen; nutzt mobile Flaeche besser |
| **Cockpit-Hybrid** (unveraendert) | SV / gutachter | Bewusst designt, funktioniert, Referenz |
| **Desktop-only** (keine Mobile-Nav) | kanzlei | Kanzleien arbeiten am Desktop |

## 4. Architektur — geteilte `PortalShell`

Eine neue Komponente kapselt den **vollen Portal-Rahmen** (Desktop-Canvas+Card **und** Mobile-Chrome),
sodass alle Portale sie adoptieren statt SV-Logik zu kopieren. `GutachterShell` bleibt Referenz
(zu SV-spezifisch — Wetter/Geo/Feldmodus/Cockpit/Spotlight/Badges — um es jetzt risikofrei mitzurefactoren).

### 4.1 Ort & Natur

- Datei: `src/components/shared/portal-shell/PortalShell.tsx` + `index.ts` (Barrel).
- **`'use client'`** — noetig fuer den Mobile-Drawer-Open-State (`useState`). Die Desktop-Komposition
  selbst ist reines CSS; der Client-Anteil ist duenn. Server-Layouts (admin, kunde, dispatch, kanzlei,
  mitarbeiter sind async Server Components) reichen **server-gerenderte `sidebar`/`children` als Props**
  durch — Standard-Pattern (Client-Shell wrappt Server-Children); Next 15 serialisiert das via RSC. Die
  Layouts selbst bleiben Server Components.
- Composite-Layer gemaess Komponenten-Set-Policy (`@/components/shared/*`), token-gebundenes Tailwind.

### 4.2 Verantwortung (klare Grenze)

`PortalShell` besitzt: **Canvas + Content-Offset + schwebende Content-Card + Mobile-Chrome (Header/
Drawer/Bottom-Slot) + Drawer-Open-State.**
`PortalShell` besitzt **nicht** die Nav-Item-Definitionen — die kommen als `sidebar`-Slot rein. Nav-Items
sind **Daten** (`PortalNav.sections` / `KundeNav.NAV_ITEMS`) → Desktop-Rail und Mobile-Drawer rendern aus
**einer** Quelle, kein Markup-Duplikat.

### 4.3 API (Vertrag)

```typescript
type PortalShellProps = {
  /** Sidebar-Element — PortalNav (dark) oder bespoke Aside (kunde). */
  sidebar: React.ReactNode
  /** Seiteninhalt — wird in die schwebende Card gewrappt. */
  children: React.ReactNode
  /** Desktop-Breakpoint — MUSS zum Sidebar-Breakpoint passen. PortalNav ab 'md'
   *  (768px, w-56); Kunde/SV ab 'lg' (1024px, w-64). Default 'md'. Steuert die
   *  vorgebackenen Canvas- + Card-Klassen-Sets (JIT-sicher). */
  breakpoint?: 'md' | 'lg'
  /** Content-Offset (Sidebar-Breite als linkes Gutter), am SELBEN Breakpoint.
   *  Literal (Tailwind-JIT). Default 'md:pl-56'. Kunde: 'lg:pl-64'. */
  contentOffsetClass?: string
  /** Mobile-Nav-Verhalten von PortalShell:
   *  - 'self' (Default): PortalShell fuegt KEINE Mobile-Chrome hinzu — das Portal
   *    managed Mobile selbst (makler = PortalNav-Bottom, kunde = bespoke, kanzlei = nichts).
   *    Null Aenderung am Mobile-Status-quo dieser Portale.
   *  - 'shell-drawer': PortalShell besitzt Hamburger + Overlay + Slide-in-Panel;
   *    die `sidebar` rendert als Panel (siehe 4.6). Fuer admin/dispatch/KB. */
  mobileNav?: 'self' | 'shell-drawer'
  /** Optionaler Mobile-Header-Inhalt (Logo/Brand-Badge/Trailing). Bei 'shell-drawer'
   *  setzt PortalShell den Hamburger links davor. */
  mobileHeader?: React.ReactNode
  /** Optionaler fixed Top-Right-Slot (Desktop) — z.B. UpdatesNav-Pill (admin/dispatch). */
  desktopTopRight?: React.ReactNode
  /** Zusatzklassen fuer die Content-Card (z.B. 'md:pr-36' fuer die Top-Right-Pill).
   *  Ueber cn()/tailwind-merge gemergt. */
  contentClassName?: string
}
```

**Breakpoint-Korrektheit (kritisch):** Offset, Canvas und Card muessen am selben Breakpoint greifen wie
die *sichtbare* Sidebar — sonst unterlaeuft der Content zwischen 768–1024px die fixed Sidebar. Deshalb
`breakpoint`-Prop + literale, vorgebackene Klassen-Sets (Tailwind-JIT kann keine dynamischen
`${bp}:...`-Klassen bauen):

```typescript
const CANVAS = {
  md: 'md:bg-[var(--brand-primary)]',
  lg: 'lg:bg-[var(--brand-primary)]',
} as const
const CARD = {
  md: 'md:rounded-l-ios-xl md:rounded-r-none md:bg-claimondo-bg md:shadow-sm',
  lg: 'lg:rounded-l-ios-xl lg:rounded-r-none lg:bg-claimondo-bg lg:shadow-sm',
} as const
const CARD_GUTTER = { md: 'md:pl-4 md:pt-4 md:pb-4', lg: 'lg:pl-4 lg:pt-4 lg:pb-4' } as const
```

Portal → Breakpoint/Offset: admin/dispatch/makler = `md` / `md:pl-56`; kanzlei/mitarbeiter (nach Umbau) =
`md` / `md:pl-56`; kunde = `lg` / `lg:pl-64`.

### 4.4 Render-Skelett

```tsx
<div className={cn('h-screen flex overflow-hidden bg-claimondo-bg', CANVAS[breakpoint])}>
  {/* Mobile-Overlay (nur shell-drawer + open) */}
  {mobileNav === 'shell-drawer' && open && (
    <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
  )}
  {/* Sidebar: Desktop-Rail immer; bei shell-drawer zusaetzlich Off-Canvas-Slide auf Mobile */}
  {sidebar}
  <div className={cn('flex-1 flex flex-col min-w-0 h-screen', contentOffsetClass)}>
    {/* Mobile-Header (mit Hamburger bei shell-drawer) */}
    {(mobileHeader || mobileNav === 'shell-drawer') && (
      <header className={cn('flex items-center gap-3 md:hidden', /* glass-dark o.ae. */)}>
        {mobileNav === 'shell-drawer' && (
          <button aria-label="Menue oeffnen" onClick={() => setOpen(true)}><MenuIcon/></button>
        )}
        {mobileHeader}
      </header>
    )}
    {desktopTopRight}
    <div className={cn('flex-1 overflow-hidden', CARD_GUTTER[breakpoint])}>
      <main id="main-content" role="main"
        className={cn('h-full overflow-y-auto', CARD[breakpoint], contentClassName)}>
        {children}
      </main>
    </div>
  </div>
</div>
```

**Compliance-Fallen (bewusst adressiert):**
- Canvas = `[bp]:bg-[var(--brand-primary)]` **ohne** inline-Hex — sonst Token-Audit (bracket-hex `#0D1B3E`). Default global gemappt (wie SV).
- Radius = `rounded-l-ios-xl` (ios-Skala) statt SV's grandfathertem `rounded-l-2xl` (Radii-Ratchet).
  **Verifizieren in Phase 0:** ob `rounded-l-ios-xl` generiert wird (Left-Variante der ios-Radius-Scale);
  falls nicht → inline `style={{ borderTopLeftRadius, borderBottomLeftRadius }}` mit Token-Wert.
- Kein User-sichtbarer Text im Shell → keine Umlaut-Pflicht. Mobile-Header-`aria-label` „Menue oeffnen" ist UI → Umlaut „Menü öffnen".

### 4.5 Koexistenz mit dem bestehenden Floating-Mechanismus

- `?sidebar=bar` / `data-sidebar-mode` bleibt **unangetastet**. Im Bar-Modus wird die Sidebar solid (navy) — auf dem Navy-Canvas nahtlos, Card schwebt weiter. Sauberer Fallback.
- `backdrop-blur` der Glass-Pills zeichnet den soliden Canvas weich (SV-Look = Pills-auf-Navy). Offset via `pl` ist korrekt.
- `--app-sidebar-width` (Modal-Backdrop) wird weiterhin von `PortalNav`/bestehenden Effects gesetzt — `PortalShell` fasst es nicht an.

### 4.6 Mobile-Drawer-Mechanik (`mobileNav='shell-drawer'`)

Eine Nav-Definition dient Desktop-Rail **und** Mobile-Drawer (SV-Modell — ein Element, Translate per State):

- `PortalShell` besitzt `const [open, setOpen] = useState(false)`, rendert Hamburger (Mobile-Header),
  Overlay, und stellt die `sidebar` als Off-Canvas-Panel dar (`-translate-x-full`, bei `open` →
  `translate-x-0`; am `>= breakpoint` statischer Rail).
- Damit **eine** `sidebar` beide Rollen spielt, rendert `PortalNav` im Shell-Drawer-Kontext als **Panel**
  (plain Flex-Spalte, ohne eigenes `fixed`/`hidden md:flex`/Bottom-Nav) — `PortalShell` uebernimmt
  Positionierung. Mechanik: `PortalShell` stellt einen **Context** `PortalShellDrawerContext =
  { inShellDrawer: true; onNavigate: () => void }` bereit; `PortalNav` liest ihn:
  - `inShellDrawer` → Panel-Rendering (kein Self-Positioning, kein `mobileItems`-Bottom-Nav),
  - Nav-Item-`onClick` ruft `onNavigate()` (Drawer schliesst bei Navigation).
  Ohne Provider (Default) = heutiges Verhalten → makler/kunde/kanzlei unveraendert.
- Der Drawer selbst ist auf Mobile **solid** (navy, gute Lesbarkeit — wie `KundeMobileDrawer`), nicht
  translucent; auf Desktop bleibt die Glass-Pill-Optik via `data-sidebar-mode` (Selektor trifft das
  `<aside>` unabhaengig von Positionierung).
- Body-Scroll-Lock + Escape-to-close (Muster aus `KundeMobileDrawer` wiederverwenden — Redundanz-Check).

**Kleiner `PortalNav`-Eingriff:** neuer Context-Read (`inShellDrawer`) + Panel-Branch. Default-Pfad
unveraendert → 0 Impact auf bestehende Caller (makler, sowie kanzlei/mitarbeiter bis zu ihrem Umbau).

## 5. Adoption pro Portal (Phasen)

### Phase 0 — Fundament
- `PortalShell` (Desktop-Komposition **+** `shell-drawer`-Mobile) + Barrel + `PortalNav`-Panel-Mode
  (Context) + Unit-Tests. Noch kein Portal verdrahtet. Radius-Frage klaeren.

### Phase 1 — Desktop Gruppe A (sidebar-first, risikoarm)
Layout-Root-BG → Canvas (via PortalShell), `<main>`-Offset/Card → PortalShell, Nav → `sidebar`-Slot.
- **admin** (`src/app/admin/layout.tsx`): `<AdminNav/>` → `sidebar`; `breakpoint='md'`, `contentOffsetClass='md:pl-56'`;
  `md:pr-36` → `contentClassName`; fixed Top-Right-Div (`OutboxBadge`+`UpdatesNav`) → `desktopTopRight`;
  `<PageContainer>{children}</PageContainer>` als `children`; Mobile-Header → `mobileHeader`. Spotlights auf Navy pruefen.
- **dispatch** (`src/app/dispatch/layout.tsx`): analog admin; `RealtimeLeadAlert` bleibt.
- **makler** (`src/components/makler/MaklerShell.tsx`): `md:ml-56` → Offset; `mobileNav='self'` (Bottom-Nav bleibt); Spotlights pruefen.
- **kunde** (`src/app/kunde/layout.tsx`): komplette `<aside class="kunde-sidebar ...">…</aside>` → `sidebar`;
  `breakpoint='lg'`, `contentOffsetClass='lg:pl-64'`; `mobileNav='self'` (Bottom-Nav + KundeMobileDrawer bleiben);
  `SprachBanner`/`OrphanMatchBanner` in `children`. Canvas `var(--brand-primary)` greift automatisch das SV-Brand.

### Phase 2 — Desktop Gruppe B (kanzlei, mitarbeiter — Umbau, eigener Checkpoint)
Header-first → sidebar-first:
1. `PortalNav variant="light"` → `variant="dark"` (helle Text-Pills auf Navy-Canvas).
2. Full-Width-Top-Bar **entfernen**; Aktionen (Logo, Tasks-Pill, Updates, displayName, Logout) in
   `PortalNav`-`headerSlot`/`footerSlot` (wie admin/makler).
3. In `PortalShell` wrappen. **kanzlei**: `mobileNav='self'` + kein Mobile-Slot (desktop-only; minimaler
   Mobile-Header mit Logo/Logout, damit unter `md` nicht voellig gestrandet). **mitarbeiter**: Desktop hier,
   Mobile-Drawer in Phase 3.
4. **Visueller Check zwingend** — groesserer IA-Wechsel; Screenshot vor/nach.

### Phase 3 — Mobile-Seiten-Drawer (admin, dispatch, mitarbeiter/KB)
- Diese drei Layouts: `mobileNav='shell-drawer'`; ihr `PortalNav` rendert im Panel-Mode (Context).
- Bisherige `mobileItems`-Bottom-Bar bei admin/dispatch **entfernen** (Drawer ersetzt sie).
- KB (mitarbeiter) bekommt hier erstmals echte Mobile-Nav.
- makler/kunde (`self`, Bottom) + SV (Cockpit) + kanzlei (desktop-only) **unangetastet**.

Phasen sind unabhaengig ship-/reviewbar (je eigener Commit, ggf. eigene PR-Iteration). Reihenfolge 0→1→2→3;
1 liefert den groessten sichtbaren Desktop-Gewinn zuerst.

## 6. Tests & Verifikation

- **Unit (PortalShell, jsdom/RTL):** rendert `sidebar`-Slot; `children` in `<main id="main-content">`;
  wendet `CANVAS`/`CARD`/`CARD_GUTTER`[breakpoint] + `contentOffsetClass` + `contentClassName` an; rendert
  Overlay/Hamburger nur bei `mobileNav='shell-drawer'`; `open`-Toggle oeffnet/schliesst; `desktopTopRight`/
  `mobileHeader` nur wenn gesetzt. Context `inShellDrawer` wird bereitgestellt. TDD in Phase 0.
- **Unit (PortalNav Panel-Mode):** mit Provider → kein `fixed`/Bottom-Nav, `onNavigate` bei Item-Click; ohne → heutiges Verhalten.
- **Build-Audit (Pflicht):** `npm run build` gruen — Layouts sind Routen/Server-Components, Next-15-Validator
  faengt Fehler, die tsc allein nicht sieht. (node_modules im Worktree via `npm install` bereitstellen.)
- **Ratchets:** `check:token-audit` (+ Radii/Accent/Status-Sub-Ratchets), `check:component-set`, `check:knip`, `check:status-registry`, `check:redirect-stubs` — 0 neue Verstoesse.
- **Visuell pro Portal (manuell):** Desktop = Canvas + schwebende Card + Pills. Mobile: admin/dispatch/KB =
  Hamburger→Drawer; makler/kunde = Bottom unveraendert; SV = Cockpit unveraendert. Gruppe B + Drawer-Portale
  Screenshot-Vergleich. Optional Playwright-Screenshot-Smoke je Portal (opt-in, nie CI).

## 7. Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| Content-Pages mit eigenem `min-h-screen`/weissem BG kollidieren mit Card | Card wrappt Content; pro Portal visuell pruefen |
| Spotlight-Gradients (admin/makler) auf Navy-Canvas anders/unsichtbar | In Phase 1 pruefen — behalten/entfernen; subtile Ambiance |
| Radii-Ratchet blockt `rounded-l-2xl` | `rounded-l-ios-xl`; in Phase 0 Left-Variante verifizieren, sonst inline-style Token |
| Token-Audit blockt Canvas-Hex | `[bp]:bg-[var(--brand-primary)]` ohne inline-Hex (wie SV) |
| Gruppe-B-IA-Wechsel unerwuenscht | Eigener Checkpoint + Screenshot; notfalls Gruppe B zurueckstellen |
| `PortalNav`-Panel-Mode bricht bestehende Caller | Context-Default = heutiges Verhalten → 0 Impact ohne Provider; Unit-Test beide Pfade |
| Drawer-Doppel-Nav / z-index-Clash mit `data-sidebar-mode`-Glass | EINE `sidebar`-Instanz (kein Doppel-Render); Drawer solid auf Mobile, Glass nur Desktop |
| KB/kanzlei unter `md` gestrandet (kein Nav) | KB kriegt Drawer (Phase 3); kanzlei minimaler Mobile-Header (Logo/Logout) |
| Branch-Kollision (3 Sessions auf aar-956) | Isolierter Worktree `kitta/portal-shell-floating` ab Base staging |

## 8. Out of Scope

- **werkstatt** — auf diesem Branch/Staging kein Layout (parallele Sessions bauen es). Policy = Bottom-Nav,
  Implementierung **hier nicht** → Marker/Handoff an die werkstatt-Sessions.
- **GutachterShell-Refactor / SV-Mobile** — bleibt Referenz + Cockpit; keine Aenderung.
- **Entfernen von `?sidebar=bar` / `data-sidebar-mode`** — bleibt.
- **Nav-Items / IA-Redesign** — nur Shell-Komposition + Mobile-Nav-Muster; keine Aenderung der Navigations-*Inhalte*.
- **kanzlei Mobile-Nav** — bewusst desktop-only.

## 9. Definition of Done

- `PortalShell` (Desktop + shell-drawer) + `PortalNav`-Panel-Mode + Unit-Tests gruen.
- Desktop Gruppe A (admin/dispatch/makler/kunde) freischwebend; Gruppe B (kanzlei/mitarbeiter) adoptiert **oder** bewusst zurueckgestellt (dokumentiert).
- Mobile: admin/dispatch/KB Seiten-Drawer; makler/kunde/SV/kanzlei unveraendert.
- Build gruen, alle Ratchets 0-neu, 7-Punkte-Audit im Commit-Body.
- Kein handgerolltes Canvas+Card-Duplikat in den Layouts (Single Source = PortalShell).
