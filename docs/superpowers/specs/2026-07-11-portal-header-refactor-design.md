# Portal-Header-Refactor — `PageHeader` → Weiche Floating-Card (portalweit, shared)

- **Datum:** 2026-07-11
- **Status:** Design approved (Brainstorming abgeschlossen), pre-plan
- **Branch:** `kitta/pageheader-floating-card` (off `origin/staging`)
- **Autor:** Aaron + Claude

> Ersetzt einen früheren Entwurf desselben Files (globale „PortalTopBar"). Der
> Top-Bar-Ansatz war eine Fehl-Interpretation — Aaron meint **den Seiten-Header
> (`PageHeader`)**. Die globale Top-Bar-Idee ist **fallengelassen**; die Sidebars
> (inkl. Logo) bleiben unangetastet.

---

## 1 · Kontext & Problem

Aaron: *„dieser eckige header ist nicht gut … vor allem die page header."*

Der „eckige Header" ist der **Seiten-Header** — konkret das Muster, in dem `<PageHeader>` in eine flache, rechteckige Leiste gewrappt wird:

```jsx
// src/app/admin/finance/(hub)/page.tsx — der eckige Prototyp
<div className="px-4 py-3 bg-white border-b border-claimondo-border flex-shrink-0">
  <PageHeader title="Finanzen" … />
</div>
```

Weißer Kasten, **harte Unterkante** (`border-b`), eckige Ecken.

**Zweitproblem — Wrapper-Wildwuchs.** Der shared `PageHeader`
(`src/components/shared/PageHeader.tsx`) wird von **52 Stellen** unterschiedlich
gewrappt: `p-6`, `py-8`, `p-4 md:p-6`, `px-4 py-6 max-w-5xl`, ~18× in der eckigen
`bg-white border-b`-Leiste. Keine zwei Seiten framen ihren Header gleich.

**PageHeader ist bereits portalweit im Einsatz** (52 Consumer):

| Portal | Consumer |
|---|---|
| admin | 28 |
| dispatch | 5 |
| makler | 5 |
| kanzlei | 4 |
| kunde | 3 |
| login (auth) | 2 |
| werkstatt / shared-components / dev | je 1–2 |

**SV (gutachter) nutzt `PageHeader` NICHT** (eigenes `SvPageChrome`, Titel wird in
die Shell-Bar registriert). „SV = Referenz, nicht anfassen" gilt damit automatisch.
Die **Dashboards** (`admin/page.tsx`, `mitarbeiter/page.tsx`) nutzen `PageHeader`
ebenfalls nicht (eigene Greeting-Zeile „Guten Tag") → unberührt.

## 2 · Ziel

Der Seiten-Header wird **portalweit** eine **weiche, gerundete, helle Floating-Card**
— konsistent und an **einer** Stelle definiert (dem shared `PageHeader`). Die eckigen
`bg-white border-b`-Leisten verschwinden.

## 3 · Entscheidungen (aus dem Brainstorming)

1. **Look = Weiche Floating-Card** — `rounded-ios-lg`, weicher Schatten, helles Glas,
   schwebt auf dem Seiten-BG. (Nicht: eckige Leiste; nicht luftig-ohne-Kasten; nicht navy.)
2. **Portalweit + shared** — die Card wird in den shared `PageHeader` **gebacken**
   (Default), sodass alle 52 Consumer den Look **ohne Einzel-Edit** bekommen.
3. **Top-Bar-Idee fallengelassen**, Sidebars (inkl. Logo) unangetastet.
4. **Brand-aware** — branded Portale (kunde, makler) tinten die Card über
   `var(--brand-surface)`.

## 4 · Nicht-Ziele

- **Keine** globale Top-Bar / Sidebar-Änderung.
- **SV / Dashboards** unberührt (nutzen `PageHeader` nicht).
- **Keine** DDL, keine Migration.
- Kein Umbau der Seiten-Inhalte — nur der Header + sein Wrapper.

## 5 · Design

### 5.1 Shared `PageHeader` — Card by default

`src/components/shared/PageHeader.tsx` erweitern (API-kompatibel):

- Der Titelblock (`leadingSlot` + `icon` + `title` + `description` + `actions`) wird
  in eine **Floating-Card** gerendert.
- **Neue Props:**
  - `children?: ReactNode` — innerhalb der Card **unter** der Titelzeile gerendert
    (für Hub-Tabs + Untertitel → alles in **einer** Card, s. 5.3).
  - `bare?: boolean` — Opt-out: rendert wie heute **ohne** Card (Auth/Login, Sonderfälle).
    `align="center"` impliziert `bare` (zentrierte Auth-/Wizard-Layouts).
  - `sticky?: boolean` — Card `sticky top-3` statt in-flow (für Hub-/Listen-Seiten, die
    heute eine Sticky-Leiste haben, z. B. finance-hub).
- Bestehende Props (`title/description/icon/actions/size/useBranding/leadingSlot/align`)
  bleiben unverändert kompatibel.

### 5.2 Optik — `.page-header-card` Utility

Neue Utility in `globals.css` (neben `.glass-light`/`.glass-dark`), `--brand-*`-getrieben:

```css
.page-header-card {
  background-color: color-mix(in srgb, var(--brand-surface, #ffffff) 82%, transparent);
  backdrop-filter: saturate(160%) blur(16px);
  -webkit-backdrop-filter: saturate(160%) blur(16px);
  border: 1px solid color-mix(in srgb, var(--brand-primary, #0D1B3E) 8%, transparent);
  box-shadow:
    0 8px 24px color-mix(in srgb, #0D1B3E 8%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
```

- Radius `rounded-ios-lg` (24px), Innen-Padding ~`px-5 py-4`.
- Fallback `#ffffff`/`#0D1B3E` für die internen Portale (kein Brand gesetzt); branded
  Portale tinten automatisch. Token-audit-safe (kein bracket-/inline-hex in `className`).

### 5.3 Hub-Header in EINER Card

Hub-Header (`admin/faelle/(hub)/FaelleHubHeader.tsx` + analoge) rendern heute
`<PageHeader/>`, `<RouteTabBar/>` und Untertitel als **Geschwister**. Migration →
Tabs + Untertitel als `children`, damit die Card **Titel + Tabs + Untertitel** umschließt:

```jsx
<PageHeader title="Fälle" size="lg">
  <RouteTabBar tabs={tabs} />
  <p className="text-sm text-claimondo-ondo">{active.subtitle}</p>
</PageHeader>
```

### 5.4 Eckige Leisten raus + Wrapper normalisieren

~18 Files wrappen `PageHeader` in die eckige `bg-white border-b border-claimondo-border`-
Leiste (finance-hub + 3 Sub-Seiten, statistiken + ki-usage, kalender, sv-leads,
partner-leads, werkstaetten, makler, team/incentives + leaderboard,
sachverstaendige/basic-freigaben, kunde/profil, kunde/termine, dev/phases). Für diese:

- Den `bg-white border-b`-Wrapper **entfernen** — die Card ersetzt ihn.
- Sticky-Fälle (finance-hub: `h-full flex flex-col overflow-hidden` + Sticky-Header) →
  `PageHeader sticky` (5.1) statt Leiste: bleibt scroll-fixiert, aber weich + gerundet.
- Außen-Padding auf **ein** Muster bringen.

### 5.5 Consumer-Migration (52)

- **Kern (0-Edit):** Card-Default in `PageHeader` → alle 52 bekommen den Look sofort.
- **Cleanup (per-File):** die ~18 eckigen Leisten raus, Hub-`children`, Padding-Norm.
  Priorität **admin/dispatch** (intern, kaum Kollision) → dann **makler/kanzlei/kunde**
  (branded + andere aktive Sessions) zuletzt/optional.

## 6 · Isolation & Boundaries

- **Ein Ort** für den Look: `.page-header-card` + `PageHeader`. Kein Consumer muss
  Branding oder Card-Styling kennen.
- `bare` / `align="center"` = klare Opt-out-Grenze (Auth/Wizard boxless).
- `sticky` = klar abgegrenzter Opt-in für Hub-/Listen-Seiten.

## 7 · Risiken & Mitigation

- **Broad visual change (52 Header auf einmal):** Playwright + Screenshots über
  admin/dispatch/makler/kanzlei/kunde + Auth; Vorher/Nachher. Edge-Cases (PageHeader
  bereits in einer `SectionCard`, ungewöhnliche Layouts) per `bare` abfangen.
- **Branded Portale (kunde/makler):** Card via `var(--brand-surface)` — auf einem
  branded Kunde-Portal verifizieren, dass die Tint sitzt (nicht weiß bleibt).
- **Auth/Login (2 Consumer):** `bare` sicherstellen — keine Card auf zentrierten
  Auth-Cards. (`align="center"`-Count heute 0 → Login nutzt Standard-Align; explizit
  `bare` setzen.)
- **Kollision (andere Sessions):** Kern = **1 shared File** (`PageHeader.tsx`) + 1
  CSS-Utility → minimal. `git status` auf `aar-956` berührt `PageHeader` nicht.
  kunde/makler-Cleanup zuletzt/optional, um Trampeln zu vermeiden.
- **Ratchets:** Card-Werte in CSS-Utility, `rounded-ios-lg`, keine raw hex/Status →
  token-audit/radii/status/component-set grün. **Achtung:** finance-hub hat inline
  `bg-emerald-50 text-emerald-600`-Status-Pills — NICHT Teil dieses Refactors, aber
  beim Leisten-Entfernen **nicht** neu einführen/verschlimmern.
- **Sticky-Verhalten:** finance-hub etc. — `PageHeader sticky` testen (kein Stacking
  mit seiten-eigenem Content, korrektes `top`-Offset).

## 8 · Testing

- `npx tsc --noEmit` **und** `npm run build` (shared Component + viele Consumer +
  Routen/Layouts → voller Next-15-Build).
- 4 Ratchets grün (`check:token-audit`, `check:component-set`, `check:status-registry`, `check:knip`).
- **Playwright:** je Portal 1–2 Seiten (admin/finance [sticky], admin/statistiken,
  dispatch, makler, kanzlei, kunde/profil [branded], login [bare]) — Card sichtbar,
  Hub-Tabs in Card, Auth boxless, branded Kunde tint.
- Visuelle Vorher/Nachher-Screenshots.

## 9 · Rollout

- Branch `kitta/pageheader-floating-card` off `staging` → PR **gegen staging** →
  Review → Merge (Regel 1: nie direkt `main`).
- **Phasen:** P1 = `PageHeader`-Card + `.page-header-card` + `bare`/`children`/`sticky`
  + Hub-Migration + admin/dispatch-Leisten. P2 (optional/separat) = makler/kanzlei/kunde-
  Leisten + Rest-Padding-Norm.
- 7-Punkte-Audit im Commit-Body.

## 10 · Offene Fragen

Keine — Look (Floating-Card), Scope (portalweit/shared), Top-Bar-Drop, Sidebar-Logo
alle geklärt.
