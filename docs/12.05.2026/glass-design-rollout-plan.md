# Glass-Design-System — Implementation-Plan (alle Pages)

**Datum:** 2026-05-12
**Status:** ⏳ PLANNED — wartet auf Aaron-Approval
**Spec:** `docs/superpowers/specs/2026-05-12-claimondo-glass-design-system.md`
**Index:** `docs/12.05.2026/glass-design-system-index.md`
**Vorbedingung:** Branding-Rollout Phase 1 (`docs/12.05.2026/branding-rollout-spec.md` §Phase 1) — **MUSS zuerst** durch Sprint 0

---

## Ausgangslage (wichtig!)

Es gibt bereits eine **iOS-Glass-Polish-Welle** in `main` (PRs #748, #771–#775, 2026-05-08 bis -10):
- **#748** — Token-Migration app- und websiteweit
- **#771** — Admin-Portal Glass-Polish
- **#772** — Marketing Glass-Polish
- **#773** — SV-Portal Glass-Polish
- **#774** — Dispatch Glass-Polish
- **#775** — FlowWizard / DynamicWizard / schaden-melden / Token-Pages Glass-Polish

**Konsequenz:** Dieser Plan ist **kein Neu-Aufbau**, sondern der **zweite Pass**:
1. Erste Welle (#748–#775) hat hartkodierte Glass-Styles pro Page eingestreut
2. Diese Welle zentralisiert die Glass-Definition in **Tokens + Shared-Components**, sodass spätere Anpassungen (Aaron-Memory: "wenn ich noch was anpasse ist das dann ein drama") **ein** Variablenwechsel sind, nicht 80 File-Refactors
3. Konkret: alte hartkodierte `bg-white/82 backdrop-blur-[22px] backdrop-saturate-150 ...` Strings werden durch `<GlassPill>` / `className="glass"` ersetzt, die ihren Style aus `--glass-*`-CSS-Vars ziehen

**Jeder Sprint enthält einen "Audit-Step" zu Beginn:** alle Glass-Stellen der jeweiligen Pages identifizieren, dann auf Tokens migrieren.

---

## B2C / B2B Marketing-Unterscheidung (Aaron-Input)

B2C-Marketing (Kunde, Leads) = aktuelle helle Liquid-Glass-Variante (Tokens wie in v12-Mockup).
B2B-Marketing (SV/Makler/Kanzlei-Akquise) = **dunkler**, eigenes Surface-Theme.

| Page | Zielgruppe | Surface |
|---|---|---|
| `/` | Mixed (Landing) | **B2C-light** (Default) |
| `/vorteile` | B2C | B2C-light |
| `/wie-es-funktioniert` | B2C | B2C-light |
| `/faq` | B2C | B2C-light |
| `/ueber-uns` | B2C | B2C-light |
| `/kfz-gutachter` | B2C-SEO | B2C-light |
| `/schaden-melden` | B2C | B2C-light |
| `/ersteinschaetzung` | B2C | B2C-light |
| `/beratung-anfragen` | B2C | B2C-light |
| `/gutachter-finden` | B2C | B2C-light (Map dominiert) |
| `/schadensreport-2026` | B2C | B2C-light |
| `/gutachter-partner` | **B2B SV** | **B2B-dark** |
| `/makler/partner-werden` | **B2B Makler** | **B2B-dark** |

B2B-Dark-Token wird als zweite Surface-Variante in `globals.css` definiert, aktiviert per `<body data-surface="b2b-dark">` oder Layout-Wrapper.

---

## Sprint-Übersicht

| Sprint | Was | Aufwand | Reihenfolge |
|---|---|---:|---|
| **0** | Branding-Foundation (globals.css Token-Bridge) — PFLICHT | 1-2h | zuerst |
| **1** | Glass-Tokens + Shared-Components + gutachter-finden Pilot | ~1d | dann |
| **2** | DynamicWizard Field-Types (alle Wizard-Felder auf Glass-Pills) | ~0.5d | parallel zu Sprint 3 möglich |
| **3** | Marketing-Pages B2C-light (vorteile/faq/wie-es-funktioniert/etc.) | ~1d | parallel zu Sprint 2 |
| **4** | Marketing-Pages B2B-dark (gutachter-partner/makler/etc.) | ~0.5d | nach Sprint 3 |
| **5** | App-Portals (Kunde → SV → Dispatch → Admin → Kanzlei → Makler) | ~2-3d | sequentiell oder parallel-Subagents |
| **6** | Polish (Print, Reduced-Motion, A11y, Performance) | ~0.5d | letzter Schritt |

**Gesamt:** ~6-8 Tage konzentriert, oder ~2 Wochen mit Reviews & Smokes pro Sprint.

---

# Sprint 0 — Branding-Foundation (PFLICHT-Vorbedingung)

**Ziel:** Tailwind-Utility-Klassen + shadcn-Tokens auf Brand-Vars umbiegen, damit verifizierte SVs ihr Brand-Theme transitiv durch die App sehen — und damit der `color-mix()`-Mechanismus im Glass-System überhaupt greift.

**Quelle:** `docs/12.05.2026/branding-rollout-spec.md` §Phase 1

## Tasks

### S0.T1 — `globals.css` Tailwind-Tokens auf Brand-Vars umbiegen

**File:** `src/app/globals.css:69-75`

**Alt:**
```css
--color-claimondo-navy: var(--claimondo-navy);
--color-claimondo-ondo: var(--claimondo-ondo);
--color-claimondo-shield: var(--claimondo-shield);
--color-claimondo-light-blue: var(--claimondo-light-blue);
--color-claimondo-bg: var(--claimondo-bg);
--color-claimondo-card: var(--claimondo-card);
--color-claimondo-border: var(--claimondo-border);
```

**Neu:**
```css
--color-claimondo-navy: var(--brand-primary, var(--claimondo-navy));
--color-claimondo-ondo: var(--brand-secondary, var(--claimondo-ondo));
--color-claimondo-shield: var(--brand-sidebar-active, var(--claimondo-shield));
--color-claimondo-light-blue: var(--brand-accent, var(--claimondo-light-blue));
--color-claimondo-bg: var(--brand-background, var(--claimondo-bg));
--color-claimondo-card: var(--brand-surface, var(--claimondo-card));
--color-claimondo-border: var(--brand-border, var(--claimondo-border));
```

### S0.T2 — shadcn-Tokens analog

**File:** `src/app/globals.css:101/107/112`

```css
--primary: var(--brand-primary, #0D1B3E);
--accent: var(--brand-accent, #4573A2);
--ring: var(--brand-secondary, #4573A2);
```

### S0.T3 — Smoke mit Test-SV

```sql
-- via mcp__plugin_supabase_supabase__execute_sql
UPDATE sachverstaendige
SET use_custom_branding = true, brand_primary = '#E11D48', verifiziert = true
WHERE id = '<TEST-SV-ID>';
```

Mit Test-SV einloggen → SV-Portal-Sidebar/Cards/Buttons werden rot. Marketing-Pages unverändert claimondo-navy. Kunde-Portal mit verifiziertem branded SV → rot (vollständige Coverage erst nach Sprint 1).

### S0.T4 — Build + Commit + PR + Merge

```bash
git checkout -b kitta/aar-glass-s0-branding-foundation
# Edits aus S0.T1 + S0.T2
npx tsc --noEmit
npm run build  # NODE_OPTIONS=--max-old-space-size=8192
git add src/app/globals.css
git commit -m "feat(branding): Tailwind+shadcn-Tokens auf Brand-Vars umbiegen"
git push -u origin kitta/aar-glass-s0-branding-foundation
gh pr create --base main --title "feat(branding): Sprint-0-Foundation — Tailwind-Tokens auf Brand-Vars"
```

**Acceptance:** Smoke 1-6 aus `branding-rollout-spec.md` §Phase 1 grün. Test-SV-Brand greift transitiv. Marketing bleibt Claimondo.

**Risiko:** Niedrig. Fallback-Hex schützt alle Stellen ohne Provider.

---

# Sprint 1 — Glass-Tokens + Shared-Components + gutachter-finden Pilot

**Ziel:** Glass-System als Token-Schicht über Sprint-0 stapeln. Erste sichtbare Anwendung auf `/gutachter-finden` (Aaron-Smoke-Path).

## Tasks

### S1.T1 — Glass-Tokens in `globals.css` definieren

**File:** `src/app/globals.css` (am Anfang nach `:root {` ergänzen, vor den existierenden Brand-Vars)

```css
:root {
  /* ─── Glass-System Token-Internals ────────────────────────────── */
  --glass-tint-soft: var(--brand-surface, var(--claimondo-bg));
  --glass-tint-strong: var(--brand-primary, var(--claimondo-navy));

  /* B2C-light Glass-Background (Default) */
  --glass-bg: linear-gradient(
    135deg,
    color-mix(in srgb, white 88%, var(--glass-tint-soft) 12%) 0%,
    color-mix(in srgb, white 70%, var(--glass-tint-soft) 30%) 60%,
    color-mix(in srgb, white 62%, var(--glass-tint-soft) 38%) 100%
  );
  --glass-bg-nested: linear-gradient(
    135deg,
    color-mix(in srgb, transparent 52%, color-mix(in srgb, white 80%, var(--glass-tint-soft) 20%)) 0%,
    color-mix(in srgb, transparent 68%, color-mix(in srgb, white 70%, var(--glass-tint-soft) 30%)) 60%,
    color-mix(in srgb, transparent 74%, color-mix(in srgb, white 65%, var(--glass-tint-soft) 35%)) 100%
  );

  --glass-blur: blur(32px) saturate(200%);
  --glass-blur-strong: blur(40px) saturate(200%);

  --glass-border: 1px solid color-mix(in srgb, white 80%, var(--glass-tint-strong) 4%);
  --glass-border-nested: 1px solid color-mix(in srgb, white 70%, var(--glass-tint-strong) 5%);

  --glass-shadow:
    0 8px 28px color-mix(in srgb, transparent 90%, var(--glass-tint-strong)),
    inset 0 1px 0 rgba(255,255,255,.85),
    inset 0 -1px 0 color-mix(in srgb, transparent 95%, var(--glass-tint-strong));
  --glass-shadow-card:
    0 20px 60px color-mix(in srgb, transparent 82%, var(--glass-tint-strong)),
    inset 0 1px 0 rgba(255,255,255,.65),
    inset 0 -1px 0 color-mix(in srgb, transparent 96%, var(--glass-tint-strong));

  --glass-radius-pill: 999px;
  --glass-radius-card: 24px;

  --cta-gradient: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand-primary, var(--claimondo-ondo)) 95%, transparent) 0%,
    color-mix(in srgb, var(--brand-primary, var(--claimondo-ondo)) 80%, black 12%) 70%,
    color-mix(in srgb, var(--brand-primary, var(--claimondo-ondo)) 70%, black 22%) 100%
  );

  --brand-surface-gradient:
    radial-gradient(circle at 22% 25%, color-mix(in srgb, transparent 82%, var(--brand-shield, var(--claimondo-shield))) , transparent 38%),
    radial-gradient(circle at 78% 70%, color-mix(in srgb, transparent 86%, var(--brand-primary, var(--claimondo-ondo))), transparent 42%),
    linear-gradient(135deg, #f8fafd 0%, #ecf1f7 35%, #e0e8f0 65%, #d4dee9 100%);

  --font-heading: 'Montserrat', system-ui, sans-serif;
  --font-body: 'Noto Sans', system-ui, sans-serif;
}

/* B2B-dark Surface Override — aktivierbar per <body data-surface="b2b-dark"> */
:root[data-surface="b2b-dark"],
body[data-surface="b2b-dark"],
[data-surface="b2b-dark"] {
  --glass-tint-soft: #0D1B3E;
  --glass-tint-strong: #4573A2;
  --glass-bg: linear-gradient(
    135deg,
    color-mix(in srgb, black 78%, var(--glass-tint-strong) 22%) 0%,
    color-mix(in srgb, black 68%, var(--glass-tint-strong) 32%) 60%,
    color-mix(in srgb, black 62%, var(--glass-tint-strong) 38%) 100%
  );
  --glass-bg-nested: linear-gradient(
    135deg,
    color-mix(in srgb, transparent 40%, color-mix(in srgb, black 70%, var(--glass-tint-strong) 30%)) 0%,
    color-mix(in srgb, transparent 55%, color-mix(in srgb, black 65%, var(--glass-tint-strong) 35%)) 60%,
    color-mix(in srgb, transparent 62%, color-mix(in srgb, black 60%, var(--glass-tint-strong) 40%)) 100%
  );
  --glass-border: 1px solid color-mix(in srgb, white 10%, transparent);
  --glass-border-nested: 1px solid color-mix(in srgb, white 6%, transparent);
  --glass-shadow:
    0 8px 28px rgba(0,0,0,.4),
    inset 0 1px 0 rgba(255,255,255,.1),
    inset 0 -1px 0 rgba(0,0,0,.2);
  --glass-shadow-card:
    0 20px 60px rgba(0,0,0,.55),
    inset 0 1px 0 rgba(255,255,255,.08),
    inset 0 -1px 0 rgba(0,0,0,.25);
  --brand-surface-gradient:
    radial-gradient(circle at 22% 25%, color-mix(in srgb, transparent 72%, var(--brand-secondary, #4573A2)), transparent 38%),
    radial-gradient(circle at 78% 70%, color-mix(in srgb, transparent 78%, var(--brand-primary, #0D1B3E)), transparent 42%),
    linear-gradient(135deg, #0a142b 0%, #0d1b3e 35%, #122253 65%, #1a2d6b 100%);
  /* Text-Colors auf hell für B2B-Dark */
  color: white;
}
```

### S1.T2 — `design-tokens.ts` erweitern

**File:** `src/lib/design-tokens.ts` (existing — ergänzen, nicht überschreiben)

Glass-Token als TypeScript-Konstanten (für Native-Side + Tests):

```ts
export const glassTokens = {
  blur: 'blur(32px) saturate(200%)',
  blurStrong: 'blur(40px) saturate(200%)',
  radiusPill: '999px',
  radiusCard: '24px',
} as const

export const fonts = {
  heading: '"Montserrat", system-ui, sans-serif',
  body: '"Noto Sans", system-ui, sans-serif',
} as const
```

### S1.T3 — Shared Components anlegen

**Files (alle neu unter `src/components/shared/glass/`):**

- `GlassPill.tsx` — Status / Generic Pill
- `GlassInput.tsx` — Pill-Form-Input mit Label
- `GlassButton.tsx` — variants: `cta` | `secondary`
- `GlassCard.tsx` — Multi-Field-Container mit box-sizing-Schutz
- `GlassFieldGrid.tsx` — `grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` Pair-Layout
- `GlassStepIndicator.tsx` — Wizard-Progress-Pill
- `GlassCheckboxPill.tsx` — Checkbox-Pill mit Glass-Background
- `BeratungVereinbarenButton.tsx` — wrapper um `<GlassButton variant="secondary" icon={<Phone/>}>`
- `index.ts` — Re-Exports

Vorlage `GlassPill.tsx`:
```tsx
'use client'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
  asChild?: boolean
}

export function GlassPill({ children, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-[22px] py-[10px] whitespace-nowrap leading-[1.1]',
        '[background:var(--glass-bg)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]',
        '[border:var(--glass-border)] [box-shadow:var(--glass-shadow)] [border-radius:var(--glass-radius-pill)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

(Vollständige Templates für jede Component im PR.)

### S1.T4 — Existing Glass-Stellen in `gutachter-finden` auditieren

Bevor refactored wird, dokumentieren was schon da ist (PR #748/#772 hat hier vermutlich was angefasst):

```bash
grep -n "backdrop-blur\|backdrop-filter\|backdrop-saturate" src/app/gutachter-finden/
grep -n "rounded-full\|rounded-\[28px\]" src/app/gutachter-finden/
```

Befund als Comment in `gutachter-finden-smoke-fixes.md` ergänzen.

### S1.T5 — `GutachterFinderMapClient.tsx` auf Shared-Components umstellen

**Refactor-Punkte (siehe v12-Mockup):**
- Header-Status-Pill (Zeile ~262) → `<GlassPill>`
- Sidebar/BottomSheet → `<GlassCard>` (für Phase 5) bzw. freischwebende Pills (Phase 1-4)
- "Beratung vereinbaren"-Button oben rechts → `<BeratungVereinbarenButton>` als `absolute top-8 right-8`
- Inline-Styles ersetzen durch utility-Classes + CSS-Vars
- Geolocation-Logik bleibt (aus PR #808), Mobile-Sheet-Trigger-Label „Karte zeigen" überarbeiten

### S1.T6 — `DynamicWizard` + `WizardClient` minimal anpassen

Damit die Wizard-Sidebar im gutachter-finden-Layout das neue Glass-Pattern rendert, müssen die existing Field-Renderer (`TextField`, `ToggleCardsField`, `SegmentedField` etc.) **noch nicht** umgestellt werden — das ist Sprint 2. Wir wrappen sie nur in `<GlassCard>` als Container.

### S1.T7 — Smoke auf staging

```bash
git push origin staging  # staging reset + Re-Merge wie bewohnt
```

Check: `https://app.staging.claimondo.de/gutachter-finden` zeigt v12-Look. Phase 1 freischwebend, Phase 5 Glass-Card mit nested Pills.

### S1.T8 — Commit + PR + Smoke + Merge

PR `kitta/aar-glass-s1-tokens-pilot` gegen main. Acceptance: gutachter-finden zeigt v12 + Tests grün.

---

# Sprint 2 — DynamicWizard Field-Types

**Ziel:** Alle Field-Renderer in `src/components/onboarding/fields/` auf Glass-Pills umstellen.

## Tasks

### S2.T1 — Existing Glass-State in `fields/` auditieren
```bash
grep -rn "backdrop-blur\|class=.*rounded-full" src/components/onboarding/fields/
```

### S2.T2 — Field-für-Field migrieren

Pro File:
- `TextField.tsx` → nutzt `<GlassInput>`
- `TextareaField.tsx` → eigene Textarea-Variante mit Glass-Pill (mehrzeilig, etwas größerer Radius z.B. 24px statt 999px)
- `SegmentedField.tsx` → Glass-Pill-Group (Selected = CTA-Gradient, Unselected = Glass)
- `ToggleCardsField.tsx` → Cards bekommen `<GlassCard>`-Background
- `SelectField.tsx` → Glass-Input mit Custom-Dropdown
- `CheckboxField.tsx` → `<GlassCheckboxPill>`
- `SlotField.tsx` → Termin-Slots als Glass-Pill-Group
- `SignatureField.tsx` → Canvas in Glass-Card
- `FileField.tsx` → Upload-Drop-Zone als Glass-Card
- `Zb1UploadField.tsx` → analog FileField + Preview-Cards in Glass

### S2.T3 — Smoke + PR `kitta/aar-glass-s2-wizard-fields`

Acceptance: Onboarding-Wizard auf `/kunde/onboarding-details` rendert komplett mit neuen Tokens, ZB1-Field weiter funktional.

---

# Sprint 3 — Marketing-Pages B2C-light

**Ziel:** Alle Public-B2C-Marketing-Routes auf Glass-Pattern + brand-surface-gradient als Background.

## Pages (in dieser Reihenfolge)

1. `/` (Landing) — Hero-Section
2. `/vorteile` — Feature-Cards
3. `/wie-es-funktioniert` — Step-Sections
4. `/faq` — Akkordeon-Items
5. `/ueber-uns` — Team-Cards
6. `/kfz-gutachter` — SEO-Content
7. `/schaden-melden` — Form-Page (Glass-Inputs)
8. `/ersteinschaetzung` — Form-Page (Glass-Inputs)
9. `/beratung-anfragen` — Form-Page (Glass-Inputs)
10. `/schadensreport-2026` — Content + Tabellen

## Pattern

```tsx
// app/vorteile/page.tsx (skeleton)
export default function Vorteile() {
  return (
    <main className="min-h-screen [background:var(--brand-surface-gradient)]">
      <HeroSection /> {/* nutzt GlassPill für Eyebrow, brand-gradient für H1 */}
      <FeatureGrid> {/* GlassCard pro Feature */}
      </FeatureGrid>
    </main>
  )
}
```

## Audit-Step pro Page (vorher)
- existing Glass-Patches aus PR #772 katalogisieren
- bestimmen welche Sections umgestellt werden, welche bleiben (z.B. Footer ggf. bewusst eigen)

## Acceptance Sprint 3
Alle 10 B2C-Marketing-Pages zeigen den Brand-Surface-Gradient + Glass-Components. Footer + Header (PortalNav) bleiben aus Lesbarkeitsgründen unverändert wenn sie bereits ein eigenes konsistentes Pattern haben.

**PR:** `kitta/aar-glass-s3-marketing-b2c`

---

# Sprint 4 — Marketing-Pages B2B-dark

**Ziel:** B2B-Akquise-Pages auf **dunkleres** Surface-Theme (siehe S1.T1 `[data-surface="b2b-dark"]`).

## Pages

1. `/gutachter-partner` (SV-Waitlist mit Mapbox) — B2B-dark Wrapper + Glass-Components zeigen sich auf dunkler Map-Variante
2. `/makler/partner-werden` — B2B-dark Hero + Value-Proposition Cards
3. Eventuell zukünftig: `/kanzlei/partner-werden` (existiert noch nicht) — out of scope

## Aktivierungs-Pattern

```tsx
// app/gutachter-partner/layout.tsx
export default function Layout({ children }) {
  return (
    <body data-surface="b2b-dark">
      <main className="min-h-screen [background:var(--brand-surface-gradient)] text-white">
        {children}
      </main>
    </body>
  )
}
```

**Wichtig:** Text-Colors in B2B-dark sind weiß/hell, nicht navy. Lucide-Icons werden auf `stroke-white` umgestellt. CTA-Button bleibt brand-gradient-fill (gut sichtbar auf dunkel). Secondary-Button kriegt eine helle Variante (Glass + white text).

## Audit-Step
PR #772 hat `/gutachter-partner` schon angefasst — bestehende Patches katalogisieren, dann neu auf Tokens.

## Acceptance
B2B-Pages dunkler Surface mit hellen Glass-Pills, lesbar auf dunklem Hintergrund. WCAG-Kontrast-Check.

**PR:** `kitta/aar-glass-s4-marketing-b2b`

---

# Sprint 5 — App-Portals

**Ziel:** Alle Portal-Routes auf Tokens. Reihenfolge nach User-Sichtbarkeit + Risiko.

## Sub-Sprints

### 5a — Kunde-Portal (~0.5d, höchste User-Sichtbarkeit)
- `src/app/kunde/layout.tsx` — Wrapper-Div mit `style={themeStyle}` aus Branding-Rollout Phase 2
- `kunde/faelle/[id]/FallDetailSections.tsx` (40 Treffer in Branding-Audit)
- `kunde/chat/page.tsx`
- `kunde/einstellungen/page.tsx`
- `kunde/faelle/page.tsx`
- `kunde/profil/*`
- `kunde/onboarding/*`, `kunde/onboarding-details/*` (ZB1 bleibt, wird Sprint-2-Felder erbender)

### 5b — Gutachter-Portal (~0.5d)
- `gutachter/GutachterShell.tsx` — Sidebar + Topbar
- `gutachter/willkommen/WillkommenClient.tsx` (82 hardcoded Treffer)
- `gutachter/abrechnung/page.tsx` (94 Treffer, Finanz-Cockpit)
- `gutachter/profil/ProfilClient.tsx` (105 Treffer)
- `gutachter/gebiet/page.tsx` (55 Treffer)
- `gutachter/fall/[id]/_components/*.tsx` (~12 Files)
- `gutachter/feldmodus/*` — explizit OUT, eigenes cinematic Layer

### 5c — Dispatch-Portal (~0.5d)
PR #774 hat hier schon was gemacht. Audit-Step zuerst.

### 5d — Admin-Portal (~0.5d)
PR #771 hat hier schon was gemacht. Audit-Step zuerst.

### 5e — Kanzlei-Portal (~0.3d, kleinere Surface)

### 5f — Makler-Portal (~0.3d)

## Pro Sub-Sprint
- Audit-Step (grep nach bestehenden Glass-Klassen + hardcoded `bg-white rounded-3xl shadow-...`)
- File-für-File auf Shared-Components umstellen
- Smoke pro Portal
- Eigener PR `kitta/aar-glass-s5a-kunde`, `-s5b-sv`, etc.

---

# Sprint 6 — Polish

**Ziel:** Production-Ready-Härtung.

## Tasks

### S6.T1 — Print-Styles
Glass-Effekte ausschalten beim Drucken (PDFs / Browser-Print):
```css
@media print {
  .glass, [class*="backdrop"] {
    background: white !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
    border: 1px solid #ccc !important;
  }
}
```

### S6.T2 — Reduced-Transparency
```css
@media (prefers-reduced-transparency: reduce) {
  :root {
    --glass-bg: rgba(255,255,255,.96);
    --glass-blur: blur(0) saturate(100%);
  }
}
```

### S6.T3 — Reduced-Motion
Pulsierende Live-Dot-Animation ausschalten:
```css
@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
}
```

### S6.T4 — A11y-Kontrast-Check
- Ondo-Placeholder auf weiß-translucent Background — WCAG-AA?
- Status-Pill-Text auf hell-getöntem Glass — Kontrast-Validation
- B2B-dark white-Text auf navy-dark Glass — WCAG-AAA Ziel

### S6.T5 — Performance-Audit
- Chrome-DevTools-Performance-Tab auf `/gutachter-finden` Mobile
- `backdrop-filter` GPU-Cost messen
- Lazy-Glass-Activation per `will-change: backdrop-filter` nur on-screen

**PR:** `kitta/aar-glass-s6-polish`

---

## Cross-Sprint-Risiken

1. **Existing PR #748–#775 sind in main** — alle Sprint-Audit-Steps müssen das checken, sonst entstehen Mischformen. Bei Konflikten: alte Glass-Patches **ersetzen** durch Token-Bezüge, nicht koexistieren lassen.
2. **`backdrop-filter` Performance auf Low-End-Mobile** — max 5-7 Glass-Layer pro Viewport, Sprint 6 misst final.
3. **Safari-Quirks** — `-webkit-backdrop-filter` Präfix in allen Components, Sprint 6 validiert auf iOS Safari 14+.
4. **`color-mix()` Browser-Support** — Chrome 111+, Firefox 113+, Safari 16.2+. Sprint 0 prüft analytics ob Aaron-Userbase das hat (vermutlich >95%). Fallback via `var(... , default)` greift in jeder Variable.
5. **B2B-dark Theme + verifizierter SV mit Brand** — Aaron-Entscheidung: priorisiert SV-Brand auch in B2B-Pages oder bleibt B2B-dark hartgezogen? Default-Vorschlag: B2B-dark gewinnt (Marketing-Identität wichtiger als per-SV-Branding auf der Akquise-Page).

---

## Execution-Strategie

**Variante A — Sequentiell (sicher, ~6-8 Tage):** Sprint 0 → 1 → 2 → 3 → 4 → 5 (a→b→c→d→e→f) → 6. Jeder Sprint smoket sauber.

**Variante B — Parallel-Subagents nach Sprint 1 (~4-5 Tage):** Sprint 0+1 sequentiell zuerst, dann Sprint 2/3/4 parallel als Subagents, dann Sprint 5 a-f parallel als Subagents. Sprint 6 final.

**Empfehlung:** Variante B — die Audit-Steps sind isoliert je Page-Group, kein Shared-State zwischen Sprints. Parallele Subagents skalieren gut.

---

## Verwandte Docs

- `docs/superpowers/specs/2026-05-12-claimondo-glass-design-system.md` — Haupt-Spec
- `docs/12.05.2026/glass-design-system-index.md` — Index
- `docs/12.05.2026/branding-rollout-spec.md` — Sprint-0-Quelle
- `docs/12.05.2026/branch-audit-unmerged.md` — keine offenen Branches blockieren
- `docs/12.05.2026/staging-slot-plan.md` — Smoke-Infrastructure
- `.superpowers/brainstorm/717145-1778577255/content/ios-glass-v12.html` — Visual-Source
