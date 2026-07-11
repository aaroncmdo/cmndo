# Portal-Header-Refactor — Unified Floating Top-Bar (Admin / Dispatch / KB)

- **Datum:** 2026-07-11
- **Status:** Design approved (Brainstorming abgeschlossen), pre-plan
- **Branch:** `kitta/portal-topbar-refactor` (off `origin/staging`)
- **Autor:** Aaron + Claude (Session portal-topbar-refactor)

---

## 1 · Kontext & Problem

Der von Aaron beanstandete „eckige Header" ist die CSS-Utility `.glass-dark`:

```css
.glass-dark {
  background-color: #0D1B3E;                 /* solid navy, opak seit AAR-766 */
  border: 1px solid rgba(255, 255, 255, 0.12);
  /* KEIN border-radius, KEIN backdrop-filter */
}
```

Eine flache, opake, rechteckige Navy-Leiste. Sie erscheint als:

| Portal | Desktop | Mobile |
|---|---|---|
| **Admin** | *keine Top-Bar* — Sidebar (`AdminNav`) + `fixed top-3 right-4` UpdatesNav-Pill | `md:hidden` `glass-dark`-Header |
| **Dispatch** | *keine Top-Bar* — Sidebar + `fixed top-3 right-4` Pill | `md:hidden` `glass-dark`-Header |
| **KB (mitarbeiter)** | **full-width `glass-dark` Top-Bar** (Logo · TasksPill · Updates · Name · Logout) | dieselbe Bar |
| **SV (gutachter)** | *keine Top-Bar* — Floating-Sidebar + WeatherBanner-Strip | moderne **Floating-Glass-Capsule** (radius 22, `color-mix` + backdrop-blur) |

**Zwei Probleme:**

1. **Optik-Drift.** SV + die app-weiten Floating-Sidebar-Pills nutzen längst die moderne Glass-Capsule-Sprache. Admin/Dispatch/KB hängen auf der eckigen `.glass-dark`-Bar fest.
2. **Struktur-Drift.** Auf dem Desktop hat nur KB überhaupt eine Top-Bar. Admin/Dispatch behelfen sich mit einer schwebenden `fixed top-3 right-4`-Pill plus dem `md:pr-36`-Hack (AAR-911), der Platz reserviert, damit `PageHeader`-Actions nicht mit der Pill kollidieren.

## 2 · Ziel

**Eine einzige geteilte, moderne Floating-Top-Bar (`PortalTopBar`)** für Admin, Dispatch und KB — Desktop *und* Mobile. Sie ersetzt die drei eckigen Header, den `fixed`-Pill-Hack (`md:pr-36`) und die doppelten Identity-Blöcke.

## 3 · Entscheidungen (aus dem Brainstorming)

1. **Unified Floating Top-Bar.** Alle drei Portale bekommen dieselbe Bar. Admin/Dispatch bekommen dadurch erstmals eine Desktop-Top-Bar.
2. **Inhalt = Brand + Utilities.** Links Wortmarke + Portal-Badge; rechts der Utility-Cluster. Der **Seiten-Titel bleibt im in-content `PageHeader`** — bewusst *kein* Titel-in-Bar (das wäre der verworfene „Full-App-Bar"-Ansatz mit 30+-Seiten-Migration auf `SvPageChrome`).
3. **Optik = helles Glas (light glass)**, nicht navy. Pairt besser mit den dunklen Admin/Dispatch-Sidebars und der hellen KB-Sidebar; `UpdatesNav` läuft überall in `variant="light"`.
4. **SV = nur Referenz.** SV-Chrome bleibt unangetastet (north star). Die Bar wird aber `--brand-*`-var-fähig gebaut, damit SV sie später ohne Rewrite adoptieren *könnte*.

## 4 · Nicht-Ziele (Scope-Guards)

- **Kein** App-Bar mit Titel; **kein** `SvPageChrome`-Rollout auf die internen Portale.
- **SV / Kunde / Kanzlei / Makler** unangetastet.
- KB bekommt **keine** Mobile-Bottom-Nav (pre-existing Gap — `MitarbeiterNav` ist `hidden md:flex`; eigenes Ticket).
- **Kein** Whitelabel-Branding für die internen Portale (per AGENTS.md sind Admin/Dispatch/KB interne Tools → Claimondo-Navy).

## 5 · Design

### 5.1 Komponenten

**`src/components/shared/portal-nav/PortalTopBar.tsx`** (+ Re-Export aus `portal-nav/index.ts`).

```ts
type PortalTopBarProps = {
  portalLabel: string          // "Admin" | "Dispatch" | "Kundenbetreuer"
  email?: string
  displayName?: string
  initials: string
  userId: string
  tasksHref: string            // "/admin/meine-tasks" | "/dispatch/dashboard" | "/mitarbeiter/tasks"
  profileHref?: string         // Account-Menu → "Mein Profil" (bei Admin weglassen)
  showOutbox?: boolean         // Admin: true; Dispatch/KB: false (matcht heutigen Stand)
}
```

Rendert die Floating-Light-Glass-Capsule:

- **Links:** Claimondo-Wortmarke (navy „Claim" + ondo „ondo") · Portal-Badge-Chip · `TasksPill`.
- **Rechts:** `UpdatesNav variant="light"` · `OutboxBadge` (wenn `showOutbox`) · **`PortalAccountMenu`**.

**`PortalAccountMenu`** (neu, im selben File oder daneben): Avatar-Initials-Kreis öffnet ein `@/components/ui/dropdown-menu` mit „Mein Profil" (wenn `profileHref`) + „Abmelden". „Abmelden" nutzt das bestehende `<form action="/api/auth/logout" method="POST">`. Initialen via `toInitials` aus `@/components/shared/KundeAvatar` (keine neue Avatar-Logik).

### 5.2 Optik — Light Glass

Neue Utility `.portal-topbar` in `globals.css`, direkt neben `.glass-dark` / `.glass-light`. `--brand-*`-var-getrieben mit Claimondo-Fallback (SV-adoptierbar):

```css
.portal-topbar {
  background-color: color-mix(in srgb, var(--brand-surface, #ffffff) 78%, transparent);
  backdrop-filter: saturate(180%) blur(22px);
  -webkit-backdrop-filter: saturate(180%) blur(22px);
  border: 1px solid color-mix(in srgb, var(--brand-primary, #0D1B3E) 10%, transparent);
  box-shadow:
    0 14px 36px color-mix(in srgb, #0D1B3E 12%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}
```

- Radius: `rounded-ios-lg` (24px).
- Children in Dark-on-Light: Wortmarke navy/ondo, Portal-Badge als soft Chip (`bg-claimondo-navy/5 text-claimondo-ondo`), Avatar-Kreis `bg-claimondo-ondo text-white`.
- Ergebnis: weich, gerundet, hell-transluzent, subtiler Lift — das Gegenteil des flachen `#0D1B3E`-Rechtecks.

### 5.3 Positionierung

Floating-Capsule oben im Content-Bereich gepinnt, damit Notifications immer sichtbar bleiben.

- **Primär:** `sticky top-3` innerhalb des scrollenden `<main>`, mit `mx-3` (schwebt mit Rand, Content scrollt/blurrt darunter).
- **Fallback:** Falls `sticky` mit seiten-eigenen Sticky-Sub-Headern stackt → als Flex-Child *über* `<main>` rendern (immer sichtbar, Content scrollt darunter, statisches Glas). Entscheidung per Playwright-Check auf 2–3 repräsentativen Seiten.

### 5.4 Per-Portal Wiring & Deletions

**Admin** (`src/app/admin/layout.tsx`)
- `+ <PortalTopBar portalLabel="Admin" showOutbox tasksHref="/admin/meine-tasks" />` oben im Content-Column.
- `− md:hidden` `glass-dark` `<header>`; `−` `fixed top-3 right-4`-Pill-Div; `−` `md:pr-36` auf `<main>`.
- `AdminNav`: `headerSlot` (Wortmarke + TasksPill + E-Mail) **und** die `footerSlot`-Identity (Avatar/E-Mail/Logout) raus → alles wandert in die Bar. `SupportButton` bleibt im footer. Sidebar wird dadurch **logo-los** (konsistent mit KB) — s. §5.6.

**Dispatch** (`src/app/dispatch/layout.tsx`)
- `+ <PortalTopBar portalLabel="Dispatch" tasksHref="/dispatch/dashboard" profileHref="/mitarbeiter/profil" />` (`showOutbox` = false).
- `−` mobile `glass-dark` `<header>`; `−` `fixed top-3 right-4`-Pill; `−` `md:pr-36`.
- `DispatchNav`: `headerSlot` (Wortmarke + „Dispatch"-Badge + TasksPill + E-Mail) **und** die `footerSlot`-Identity (Avatar/E-Mail/„Mein Profil"/Logout) raus → in die Bar (die „Dispatch"-Badge wird zum Portal-Badge; Profil + Logout ins Account-Menu). `SupportButton` bleibt. Sidebar **logo-los** — s. §5.6.

**KB** (`src/app/mitarbeiter/layout.tsx`)
- Full-width `glass-dark` `<header>` **ersetzt** durch `<PortalTopBar portalLabel="Kundenbetreuer" profileHref="/mitarbeiter/profil" tasksHref="/mitarbeiter/tasks" />` oben im Content-Column (Light-Sidebar bleibt im Flex-Row). KB hatte bisher keinen OutboxBadge → `showOutbox` bleibt aus.
- `MitarbeiterNav` Sidebar-Höhe `min-h-[calc(100vh-60px)]` → volle Höhe (die 60px waren die alte Header-Höhe). KB-Sidebar ist bereits logo-los.

**Netto:** −3 eckige Header, −1 Floating-Pill-Hack (`md:pr-36`), −2 Sidebar-Identity-Blöcke (header + footer), +1 geteilte Komponente (+1 Account-Menu, +1 CSS-Utility). Brand-Identität lebt danach an *einem* Ort pro Portal (die Bar).

### 5.6 Konsequenz: Admin/Dispatch-Sidebars werden logo-los (Review-Flag)

Weil die Wortmarke jetzt in der Bar sitzt, verlieren Admin/Dispatch ihren Sidebar-Kopf (Wortmarke). Das ist **gewollt**: es macht alle drei Portale konsistent (KB-Sidebar ist bereits logo-los) und vermeidet ein doppeltes Logo (Sidebar-Top *und* Bar). **Falls unerwünscht:** Alternative wäre, die Wortmarke aus der Bar zu nehmen und links nur den Portal-Badge zu zeigen (Brand bliebe in der Sidebar). Die approbte Preview zeigt die Wortmarke *in der Bar* → Default = logo-lose Sidebars.

### 5.5 Responsive

- Gleiche Capsule auf Mobile, full-width (`mx-3`); E-Mail unter `sm` ausgeblendet.
- Admin/Dispatch behalten ihre `PortalNav`-Dark-**Bottom**-Nav (`mobileItems`).
- KB-Mobile-Verhalten unverändert (kein Bottom-Nav — s. Nicht-Ziele).

## 6 · Isolation & Boundaries

- **`PortalTopBar`** ist self-contained: rein via Props, keine portal-spezifische Logik intern. Jedes Layout liefert nur seine Config.
- **`PortalAccountMenu`** isoliert (nur Avatar + Logout-Form + optional `profileHref`).
- **`.portal-topbar`** ist die *einzige* Quelle der Glass-Werte → ein Ort für spätere SV-Adoption via Brand-Vars.

## 7 · Risiken & Mitigation

- **Branch-Kollision** (4 Sessions auf `aar-956`): eigener Worktree/Branch (erledigt). Berührte Files: `admin/dispatch/mitarbeiter/layout.tsx`, `AdminNav.tsx` + `DispatchNav.tsx` (header- + footer-Slots) + `MitarbeiterNav.tsx` (Höhe), `globals.css`, neu `PortalTopBar.tsx` + `portal-nav/index.ts`. `PortalNav.tsx` selbst bleibt **unverändert** (nur Config via Wrapper). Diese Files werden von `aar-956` laut `git status` *nicht* angefasst (dort: cron-route, GutachterCard, KundenbetreuerCard, package-files) → geringe Merge-Kollision. Vor Implementierung Files aus dem Worktree (Basis staging) frisch re-lesen.
- **Sticky-Stacking** mit seiten-eigenen Sub-Headern → Fallback Flex-Child (5.3); Playwright-Verifikation.
- **Token-Audit-Ratchets:** Glass-Werte leben in der CSS-Utility (kein bracket-hex / inline-hex in `className`); `ui/dropdown-menu` = sanktioniertes Web-Rich-Primitive; keine neuen raw Status/Accent/Radii/rgba-Gradients → alle vier Ratchets sollten grün bleiben.
- **Content-Offset:** Entfernen von `md:pr-36` — verifizieren, dass `PageHeader`-Actions sauber unter der Bar sitzen (kein Overlap mehr, da die Bar jetzt oberhalb statt overlay-rechts liegt).
- **`glass-dark` bleibt in Benutzung?** Prüfen, ob nach dem Refactor noch Consumer existieren (Marketing/andere Portale) — Utility NICHT löschen ohne grep.

## 8 · Testing

- `npx tsc --noEmit` **und** `npm run build` — Layout/Route-Änderungen → voller Build (Next 15 Validator).
- 4 Ratchets grün: `check:token-audit`, `check:component-set`, `check:knip`.
- **Playwright:** Admin / Dispatch / KB je Desktop + Mobile — Bar sichtbar, Updates-Popover öffnet/schließt, Logout-Form submitted, kein Overlap mit `PageHeader`-Actions.
- Visueller Vorher/Nachher-Vergleich (Screenshots).

## 9 · Rollout

- Branch `kitta/portal-topbar-refactor` off `staging` → PR **gegen staging** → Review → Merge (Regel 1: nie direkt `main`).
- 7-Punkte-Audit im Commit-Body (AGENTS.md).
- Keine DDL, keine Migration.

## 10 · Offene Fragen

Keine — alle im Brainstorming geklärt (Layout-Fork, Titel-Platzierung, Optik hell/dunkel, SV-Scope).
