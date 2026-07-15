# Portal-Header Floating + Client-State-Hub-Migration — Design

- **Datum:** 2026-07-15
- **Status:** Design approved (Aaron: "das passt, alle migrieren"), pre-plan
- **Branch:** `kitta/portal-header-float-hub-migration` (Base = `origin/staging`, Regel 1)
- **Autor:** Aaron + Claude

> **Baut auf `2026-07-11-portal-header-refactor-design.md`** (#4149). Jener Versuch
> (Achse B: Floating-Card in `PageHeader`) ist **inzwischen auf main UND staging
> gelandet** (via Sweep-Squash — die Original-SHA 8b24603e8 ist nicht in der Ancestry,
> der Inhalt schon). **Verifiziert (staging):** `PageHeader.tsx:105-113` rendert
> `.page-header-card` by default + `bare`/`children`; `globals.css:646` definiert die
> Utility. Der zuerst gelesene naked `PageHeader` stammt aus dem **stale aar-956-Worktree**
> (alter Base) — daher waren die ersten Audit-Reads + Subagent-Sweeps teilweise für
> aar-956 statt staging. **Ist-Stand daher: Achse B ist ~fertig**; offen sind (1) der
> **zu starke Schatten** (`.page-header-card`), (2) die **eckigen Tab-Leisten** der
> Hub-Layouts (`layout.tsx`), (3) **Achse A** (Route→Client-State-Views).

## 0 · KORREKTUR — verifizierter Ist-Stand (staging)

| Baustein | Status auf staging/main | Beleg |
|---|---|---|
| `.page-header-card` Utility | **LIVE** (Schatten `0 8px 24px /8%` = „zu stark") | `globals.css:646` |
| `PageHeader` Card-by-default + `bare`/`children` | **LIVE** | `PageHeader.tsx:105-113` (kein `sticky`-Prop — Positionierung beim Consumer) |
| finance `page.tsx` Header de-eckigt (Card, `flex-shrink-0`) | **LIVE** | `page.tsx:774-790` |
| finance `layout.tsx` Tab-Leiste (`border-b bg-white`, Route-`<Link>`) | **NOCH ECKIG + Route-basiert** | `layout.tsx:14` + `FinanceHubTabs.tsx` |

→ Diese Spec setzt ab hier auf dem verifizierten Ist-Stand auf: **kein Neu-Bau der Card**,
sondern Schatten-Fix + Tab-Leiste-in-Card + Achse A. Passagen unten, die vom „Bauen"
der Card sprechen, sind als „**verifizieren, existiert schon**" zu lesen.

---

## 1 · Kontext & Problem

Zwei orthogonale Probleme, die im Code verschränkt liegen (Audit 2026-07-15):

- **Achse B — Surface/Elevation.** Der Seiten-Header ist entweder eine angeklebte
  Edge-to-Edge-Leiste (`bg-white border-b border-claimondo-border`, ~18 Consumer;
  finance-hub baut sogar **zwei** gestapelte Leisten) oder ein nackter `PageHeader`
  auf dem BG — nie eine freischwebende Fläche, obwohl die Shell drumherum schwebt
  (PortalNav floating-pills + atmosphärischer BG). Aaron: *„ist portal weil nicht
  freischwebend"*.
- **Achse A — Navigationsmodell.** Die Admin-Hubs (`finance`, `faelle`, `partner`,
  `aufgaben`) navigieren zwischen Sub-Views über **echte Routen** (`(hub)`-Route-Group
  + `<Link>`-Tabs). Aaron: die Tabs sollen *„keine Routen mehr sein sondern detail
  views und über den header erreichbar"*.

**Schatten-Befund (die „zu stark"-Ursache).** Der 2026-07-11-Versuch gab
`.page-header-card` den Schatten `0 8px 24px color-mix(#0D1B3E 8%)` — Offset 8 / Blur
24 / 8 %. Die Produkt-Karten darunter nutzen `shadow-ios-sm` (`0 1px 2px /.04`) bzw.
`--shadow-glass-card` (`0 4px 20px /.06`). Der Header-Schatten war **eine ganze
Gewichtsklasse zu schwer** und erschlug die Karten. Aaron: *„der schatten passt nicht
zu den cards. er ist zu stark."* Das ist mit hoher Wahrscheinlichkeit der Grund, warum
#4149 stehen blieb.

## 2 · Ziel

1. Der Seiten-Header wird **portalweit** eine **weiche, freischwebende Glass-Card** —
   an **einer** Stelle definiert (shared `PageHeader` + eine CSS-Utility). Die eckigen
   `bg-white border-b`-Leisten verschwinden.
2. Der Header trägt einen **karten-harmonischen** Schatten (`--shadow-header`, s. 5.2)
   — genau **eine** weiche Stufe über den Karten, nie darüber.
3. Die 4 Admin-Hub-Tabs werden **In-Header-Client-State-Views** (kein URL-Wechsel),
   erreichbar über die Segmented-Control **in** der Header-Card.

## 3 · Entscheidungen

1. **Look = weiche Floating-Card**, `rounded-ios-lg`, `--shadow-header`, helles Glas,
   Inset-Margin statt `border-b`. Brand-aware (`var(--brand-surface)`).
2. **In `PageHeader` gebacken (Default)** — die 52 Consumer erben den Look ohne
   Einzel-Edit (Achse B). `bare`/`children`/`sticky` als Opt-outs/Slots (aus dem
   2026-07-11-Design übernommen).
3. **Achse A = reine Client-State-Tabs** (Aarons Wahl) — `useState` + conditional
   render analog `FallakteShell`, **kein** `?tab=`. Alte Routen → Redirect-Stubs.
4. **Scope = alle Portale** für Achse B; **die 4 Admin-Hubs** für Achse A. SV/Gutachter
   (eigenes `SvPageChrome`) + Dashboards (Greeting statt `PageHeader`) bleiben unberührt.

## 4 · Nicht-Ziele

- Keine globale Top-Bar / Sidebar-Änderung (PortalNav bleibt). Kein Logo-Umbau.
- SV/Gutachter-Shell + admin/mitarbeiter-Dashboards unberührt (nutzen `PageHeader` nicht).
- Keine DDL/Migration.
- Kein Umbau der eigentlichen View-Inhalte — nur Header, Wrapper, Nav-Modell.
- Mobile-Header (`glass-dark`, `md:hidden`) unverändert — **nur Desktop** im Fokus.

## 5 · Design — Achse B (Floating-Header, portalweit)

### 5.1 Shared `PageHeader` — Card by default (API-kompatibel)
`src/components/shared/PageHeader.tsx` erweitern (neue Props alle optional →
abwärtskompatibel für alle 52 Consumer):
- Titelblock (`leadingSlot`/`icon`/`title`/`description`/`actions`) in eine
  **`.page-header-card`**.
- `children?: ReactNode` — in der Card **unter** der Titelzeile (Hub-Tabs + Untertitel
  → alles in **einer** Card).
- `bare?: boolean` — Opt-out ohne Card (Auth/Login, in `SectionCard` verschachtelt).
  `align="center"` impliziert `bare`.
- `sticky?: boolean` — Card `sticky top-3` (Hub-/Listen-Seiten, die heute Sticky-Leisten
  haben).

### 5.2 `.page-header-card` Utility + `--shadow-header` (der Schatten-Fix)
Neue Utility in `globals.css`, `--brand-*`-getrieben. **Delta zum 2026-07-11-Versuch:
der Schatten wird weich.** Neuer semantischer Token (wie `--shadow-cta-ondo`,
`--shadow-glass-card`):

```css
/* design-tokens.ts spiegelt den Wert; globals.css @theme exposed shadow-header */
--shadow-header: 0 4px 16px rgba(13, 27, 62, 0.05);

.page-header-card {
  background-color: color-mix(in srgb, var(--brand-surface, #ffffff) 82%, transparent);
  backdrop-filter: saturate(160%) blur(16px);
  -webkit-backdrop-filter: saturate(160%) blur(16px);
  border: 1px solid color-mix(in srgb, var(--brand-primary, #0D1B3E) 8%, transparent);
  box-shadow: var(--shadow-header), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-ios-lg); /* 24px — freischwebend, weich */
}
```
- `0 4px 16px /5%` vs. vorher `0 8px 24px /8%`: Offset halbiert, Blur −33 %, Opazität
  −37 %. Sitzt zwischen `shadow-ios-sm` (Karten) und `--shadow-glass-card` — „eine
  Stufe drüber", nicht erschlagend. Inset-Highlight + Blur bleiben (Glass-Feel).
- Token-audit-safe: Werte in CSS-Utility/`@theme`, `rounded-ios-*`, kein bracket-hex.

### 5.3 Hub-Header in EINER Card
Hub rendert heute `<PageHeader/>`, Tab-Bar und Untertitel als Geschwister →
Tabs + Untertitel als `children`, damit die Card **Titel + Tabs + Untertitel** umschließt.

### 5.4 Eckige Leisten raus (~18 Consumer)
`bg-white border-b border-claimondo-border`-Wrapper entfernen (Card ersetzt sie).
Sticky-Fälle (finance-hub `h-full flex flex-col overflow-hidden` + Sticky-Header) →
`PageHeader sticky`. Außen-Padding auf **ein** Muster. **Doppel-Surface vermeiden**
(finance-hub: Tab-Leiste + Header-Leiste → **eine** Card; war der Final-Review-Fund #4149).

## 6 · Design — Achse A (Route → Client-State-Views, 4 Admin-Hubs)

Muster = **`FallakteShell`** (`src/app/faelle/[id]/FallakteShell.tsx:143/234`): Client-
Component hält `const [tab, setTab] = useState<TabId>()`, conditional render
`{tab === 'x' && <XView {...props}/>}`. Daten eager vom Server-Parent geladen, als Props
gereicht. Kein URL-Wechsel = „reine Client-State-Tabs".

Pro Hub:
1. `…HubShell.tsx` (client) — hält `tab`-State, rendert `<PageHeader … children={<Tabs/>}/>`
   + conditional den aktiven View.
2. Sub-Page-Bodies der `(hub)/<sub>/page.tsx` → View-Komponenten (`_views/*`), Daten-Fetch
   in den Hub-Server-Parent gehoben, als Props gereicht.
3. **Redirect-Stubs:** alte `(hub)/<sub>/page.tsx` → `redirect('/admin/<hub>')` (kein 404
   für Deeplinks/E-Mail-CTA/KPI-Links).
4. **`revalidatePath('/admin/<hub>/<sub>')` → `revalidatePath('/admin/<hub>')`** an allen
   Write-Stellen.

**Finance-spezifisch:** die async-Server-Sub-Sektionen (`AbrechnungenSectionWrapper`,
`MonatsUmsatzForecast`, …) dürfen als server-gerenderte Slots in die Shell gereicht
werden, falls Prop-Lifting zu invasiv ist (dokumentierter Fallback; nur der Default-View
ist eh eager sichtbar). Finance ist die schwerste Umstellung → **Referenz-Hub zuerst**.

## 7 · Regressions-Fläche (Achse A, nicht kosmetisch)

Deep-Links/Revalidation auf die Finance-Sub-Routen (analog je Hub prüfen):
- `src/lib/email.ts:129` — **E-Mail-CTA** `/admin/finance/provisionen?monat=`.
- `admin/_components/KpiCards.tsx`, `AusstehendeZahlungenWidget/Table.tsx` — KPI-Deeplinks.
- `admin/finance/(hub)/saeumige-svs:95` — interner Link.
- **~12× `revalidatePath('/admin/finance/<sub>')`**: `stripe/webhook/route.ts:389`,
  `finance/(hub)/provisionen/actions.ts` (×4), `admin/abrechnungen/actions.ts` (×6).

Alle Sub-Routen bleiben als Redirect-Stubs → kein 404. **Bewusster Präzisionsverlust
(Aarons Wahl, rein Client-State):** die Provisionen-E-Mail (`?monat=`) landet auf dem
Hub-Default statt exakt auf der Provisionen-View. Kein `?tab=`-Fallback.

## 8 · Isolation & Boundaries

- **Ein Ort** für den Look: `.page-header-card` + `PageHeader` + `--shadow-header`.
- `bare`/`align="center"` = Opt-out-Grenze (Auth/Wizard boxless). `sticky` = Opt-in.
- Jede `…HubShell` = dumme controlled Client-Component; Views = isolierte Präsentations-
  Komponenten mit Props-Interface.

## 9 · Risiken & Mitigation

- **#4149 blieb stehen (Schatten):** primär gefixt via 5.2. Vor dem breiten Achse-B-
  Rollout kurz die #4149-Review-Notes gegenlesen, falls weitere Gründe.
- **Staleness:** kein Rebase des alten Branches — Neu-Implementierung auf aktuellem main/
  staging; alter Branch nur als Referenz (CSS, API, Test).
- **Breiter Visual-Change (52 Header):** Playwright + Vorher/Nachher über admin/dispatch/
  makler/kanzlei/kunde + Auth. Edge-Cases (`PageHeader` in `SectionCard`) via `bare`.
- **Branded Portale (kunde/makler):** Card via `var(--brand-surface)` — auf branded
  Kunde verifizieren (tint sitzt, nicht weiß).
- **Andere Sessions:** Kern = 1 shared File (`PageHeader.tsx`) + 1 CSS-Utility → minimal.
  Eigener Worktree. Achse A trampelt nur die 4 Admin-Hubs (kaum Kollision).
- **Ratchets:** token-audit/radii/status/component-set/knip grün. finance-hub hat inline
  `bg-emerald-50 text-emerald-600`-Status-Pills — **nicht** neu einführen beim Leisten-Entfernen.
- **Client-State-Tradeoffs:** kein Deep-Link/Browser-Back zwischen Tabs (bewusst gewählt).

## 10 · Testing

- `npx tsc --noEmit` (8GB-Heap) **und** `npm run build` (shared Component + Routen/Layouts).
- 4 Ratchets grün (`check:token-audit`, `check:component-set`, `check:status-registry`, `check:knip`).
- **Playwright / Regel-4-Smoke:** je Portal 1–2 Seiten (Card sichtbar, Auth boxless,
  branded Kunde tint); je Admin-Hub: Tab-Wechsel **ohne** URL-Change, Redirect-Stub greift
  (alte Route → 200 statt 404), Daten laden pro View.
- Visuelle Vorher/Nachher-Screenshots.

## 11 · Rollout (phasenweise PRs → staging)

- **P0** — **`.page-header-card`-Schatten weich machen** (`globals.css:646`,
  `0 8px 24px /8%` → `--shadow-header 0 4px 16px /5%`). Card + `PageHeader`-Props existieren
  bereits (main/staging, #4149-Sweep) — **nur** der Schatten wird gefixt. Alle 52 Consumer
  sofort weicher; winziger, portalweiter PR. Direkt Aarons „zu stark".
- **P1** — Finance-Hub Referenz: Achse A (Client-State-Views + Redirects + revalidatePath)
  **und** Leisten-Cleanup/Doppel-Surface. Das Muster-Template.
- **P2** — `faelle`/`partner`/`aufgaben` nach dem P1-Muster (Achse A+B).
- **P3** — Achse-B-Leisten-Cleanup überall sonst (dispatch, kanzlei, mitarbeiter, kunde,
  makler, admin-Listen). Pro Portal/kleine Gruppe je PR.
- **P4** — `/faelle/[id]`-Shell-Topbar (flat `bg-claimondo-navy`) an den Hub-Look angleichen.

## 12 · Offene Punkte

- **Base-Branch (mit Aaron klären):** AGENTS.md Regel 1 + Memory + der 2026-07-11-Vorgänger
  sagen off `staging`, PR gegen `staging`. ABER: `origin/main` ist 5261 Commits **vor** dem
  Merge-Base, `origin/staging` nur 1048 (starke Divergenz; main = aktive Integration laut
  Env + recent Sweeps). Meine Zielfiles (`finance/(hub)`, `PageHeader.tsx`) sind auf beiden
  **identisch** → Arbeit läuft basis-neutral. Worktree steht aktuell auf `origin/main`;
  finaler PR-Target vor P0-Merge fixieren.
- **SvPageChrome** (`gutachter/_shell/page-chrome-context.tsx`, definiert aber unbenutzt):
  optionaler späterer Angleich der SV-Shell — hier **nicht** im Scope.
