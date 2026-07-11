# Mobile-First Portal-Navigation — „Bottom-only" (Ziel A)

**Datum:** 2026-07-11
**Branch:** `kitta/mobile-nav-bottom-only`
**Status:** Design — wartet auf Aaron-Review

## Problem

Der mobile Nav-Zustand (live auf app.claimondo.de verifiziert) ist zwar überall
eine Bottom-Nav, aber uneinheitlich und desktop-adaptiert:

- **Drei getrennte Implementierungen** der mobilen Bottom-Nav:
  1. `PortalNav.renderMobileBar` (admin, dispatch, kanzlei, makler, mitarbeiter, werkstatt, faelle)
  2. `GutachterShell` eigene Bar (SV)
  3. `KundeNav mobile` (kunde)
- **Inkonsistente Top-Bar:** admin hat oben eine Navy-Bar (Logo + Updates), kanzlei gar keine.
- **Zusätzliches Chrome:** `GlobalPosteingangFab` schwebt bei admin/SV/mitarbeiter über der Bottom-Bar.
- **Overflow unklar:** item-reiche Rollen (admin ~15 Nav-Punkte) zeigen nur 4 + „Mehr".

## Ziel

**Eine** mobile-first Bottom-Navigation für **alle** Rollen — konsistent, gebrandet, entschlackt.

### Aaron-Entscheidungen (2026-07-11)

- **Zielbild A — Bottom-only:** keine Top-Bar auf Mobile. Alles unten.
- **Bottom-Bar-Stil:** schwebende Navy-Pille (on-brand mit der Desktop-Floating-Sidebar).
- **Posteingang:** wandert in die Menü-Sheet (FAB entfällt auf Mobile).

### Nicht-Ziele

- Desktop-Navigation (Floating-Sidebar / SV-Glass-Pills / Kunde-Aside) bleibt **unangetastet**.
- Content-Mobile-Optimierung (z.B. horizontal überlaufende Tabellen) — separates Thema.
- Grundlegende Änderung der Nav-**Inhalte** pro Rolle (nur Anordnung Primär/Overflow).

## Architektur

Ein geteilter Composite **`@/components/shared/mobile-nav/`**:

| Datei | Zweck |
|---|---|
| `MobileNav.tsx` | Schwebende Bottom-Pille (4 Primär-Tabs + „Menü"), rendert die Sheet |
| `MobileNavSheet.tsx` | Vollbild-Sheet (Brand-Header · Updates · komplette Nav · Posteingang · Profil · Abmelden) |
| `split.ts` | Reine Helper (Primär/Overflow-Split, Badge-Bedingung) — vitest-testbar ohne DOM |
| `types.ts` | `MobileNavItem`, `MobileNavSection`, `MobileNavProps` |
| `index.ts` | Barrel |

Gebaut auf `primitives/*` (Sheet/Modal, Box/Stack, Text, Icon, Badge, Button), token-gebunden.

**Consumer (nur `md:hidden`-Breakpoint):**

- `PortalNav` → rendert `<MobileNav>` statt `renderMobileBar`/`renderMobileSheet` (deckt 7 Rollen ab)
- `GutachterShell` (SV) → `<MobileNav>` statt eigener Bar
- `kunde/layout.tsx` → `<MobileNav>` statt `KundeNav mobile` + Kunde-Top-/Bottom-Bar

**Desktop bleibt je Shell unverändert.** Nur der Mobile-Zweig wird ersetzt.

## Komponenten-API (Skizze)

```ts
type MobileNavItem = {
  href: string; label: string; icon: LucideIcon
  exact?: boolean; badge?: number | boolean
}
type MobileNavSection = { label?: string; items: MobileNavItem[] }

type MobileNavProps = {
  primary: MobileNavItem[]        // die 4 Bottom-Tabs (Consumer wählt)
  sections: MobileNavSection[]    // vollständige Nav (gruppiert) für die Sheet
  brand: { name: ReactNode; logo?: ReactNode }   // Sheet-Header (ersetzt Top-Bar-Logo)
  updates?: ReactNode             // Updates-Panel-Trigger (bestehendes UpdatesNav)
  hasUnread?: boolean             // → Badge-Punkt am „Menü"-Tab
  posteingang?: ReactNode         // ehemaliger FAB, jetzt Sheet-Eintrag
  extras?: ReactNode              // Support, Sprach-Switcher (kunde) etc.
  profile: { name: string; initials: string; href?: string }
  logoutAction?: string           // <form action> für Abmelden
  ariaLabel?: string
}
```

## Bottom-Pille (Detail)

- Schwebende Navy-Pille: `bg-claimondo-navy` (→ `var(--brand-primary)`), `fixed` unten,
  `m-2`, `rounded-ios-*`, `shadow-ios-*`, `md:hidden`, `env(safe-area-inset-bottom)`.
- **5 Slots:** 4 `primary`-Items + Slot 5 „Menü".
- Aktiver Tab: `aria-current`, hervorgehobene Pille (`bg-claimondo-shield`/Brand).
- „Menü"-Slot: Icon (☰) + Label; **Badge-Punkt wenn `hasUnread`** (offene Updates/Tasks) →
  hält Updates trotz fehlender Top-Bar auf einen Blick sichtbar.
- 48×48 Touch-Targets.

## Menü-Sheet (Detail)

Slot „Menü" öffnet ein Vollbild-Sheet von unten (primitives Sheet/Modal), scrollbar. Aufbau:

1. **Header:** Brand-Logo/Name (links) + Close (X) rechts.
2. **Updates-Zeile** (falls `updates`): Bell + Count → öffnet das bestehende Updates-Panel.
3. **Nav:** alle `sections`, gruppiert (mit `section.label`), aktive Route markiert.
4. **Posteingang** (falls `posteingang`): ehemaliger FAB als Zeile.
5. **extras:** Support / Sprach-Switcher (kunde).
6. **Footer:** Profil (Avatar + Name → `href`) + Abmelden (`<form action>`).

Dismiss: X · Backdrop-Tap · Swipe-down · Escape. Body-Scroll-Lock solange offen.
Focus-Trap, `aria-modal`. Route-Change schließt das Sheet.

## Branding / Whitelabel

- Alle Marken-Farben via `bg-claimondo-*`/`text-claimondo-*` (→ `var(--brand-*)`) — **kein raw hex**.
- Brand-Logo im Sheet-Header liefert der Consumer (`brand.logo`); gebrandete Portale
  (verifizierter SV mit `use_custom_branding`, Kunde-Portal) branden Pille + Sheet
  automatisch über die bestehenden CSS-Custom-Properties.

## Per-Rollen-Primär-Items (Vorschlag)

Mechanismus: Consumer liefert `primary` (4) + volle `sections`; Rest landet automatisch im Menü.

| Rolle | 4 Primär-Tabs | Rest → Menü |
|---|---|---|
| admin | Dashboard, Fälle, Aufgaben, Kalender | Dispatch, KI-*, Vertrieb, Partner, Finanzen, Embed-*, Marketing, Wissen, Team |
| dispatch | Dashboard, Leads, Rückrufe, Karte | Gutachter-Finder, Kalender, Sachverständige, Isochrone, Sicherheit |
| kanzlei | Mandate, Pipeline, Termin, Sicherheit | (alle 4 → Menü nur Profil/Abmelden/Updates) |
| makler | Dashboard, Leads, Akten, Abrechnungen | Promo, Netzwerk, Einstellungen, Sicherheit |
| SV | Heute, Aufträge, Fälle, Kalender | Netzwerk, Abrechnung, Vertrag, Statistiken, Reklamationen |
| kunde | Mein Fall, Termine, Dokumente, Nachrichten | Rest + Sprache |

(mitarbeiter/werkstatt/faelle analog; exakte Listen beim Implementieren mit Aaron feinschleifen.)

## Edge-Cases

- < 4 `primary` → Pille zeigt was da ist; Menü **immer** vorhanden (für Profil/Abmelden/Updates).
- Kein `updates` → kein Badge, keine Updates-Zeile.
- Kein `posteingang` → Eintrag entfällt.
- Hydration: Sheet-State client-only; Pille rendert server-side (Links funktionieren ohne JS).

## Testing

- **vitest (node-env):** reine Helper in `split.ts` — Primär/Overflow-Split, `hasUnread`-Logik.
- **Playwright (Mobile-Viewport 390×844, gegen Prod-analog/staging):** Pille sichtbar mit 4 Tabs +
  Menü; Menü öffnet Sheet; Sheet enthält Updates/Nav/Posteingang/Profil/Abmelden; Route-Change
  schließt; aktive Route markiert. Über mind. admin (PortalNav), SV, kunde.
- **Ratchets:** component-set (neuer Composite baut auf primitives — erlaubt), token-audit
  (`rounded-ios-*`, keine hex), knip (alte Mobile-Renderer als Dead-Code entfernen).

## Rollout (phasenweise)

1. `shared/mobile-nav` bauen + `split.ts`-Unit-Tests (RED→GREEN).
2. `PortalNav` umstellen (ein Consumer → 7 Rollen). Playwright-Smoke.
3. `GutachterShell` (SV) umstellen.
4. `kunde/layout` umstellen.
5. `GlobalPosteingangFab` auf Mobile entfernen (Posteingang lebt jetzt in MobileNav).
6. Alte Mobile-Renderer löschen (Dead-Code), knip-Baseline senken.

Jede Phase: Boy-Scout, Ratchets grün, tsc grün, Playwright-Mobile-Smoke. Desktop unberührt.

## Offene Punkte

- Exakte `primary`-Listen pro Rolle (Feinschliff bei Implementierung).
- `GlobalPosteingangFab` Desktop-Verhalten (hier nur Mobile-Entfernung; Desktop separat, falls überhaupt).
