# Spec: Claimondo Liquid-Glass Design-System

**Datum:** 2026-05-12
**Status:** 🟡 DRAFT — wartet auf Aaron-Review
**Ableitung aus:** Brainstorming-Mockup v12 (`.superpowers/brainstorm/717145-1778577255/content/ios-glass-v12.html`)
**Bezug:** Memory `project_design_system` (AAR-769, existing design-tokens.ts), Memory `project_brand_identity`
**Vorbedingung:** `docs/12.05.2026/branding-rollout-spec.md` Phase 1 (Tailwind-Tokens auf Brand-Vars umbiegen) **muss zuerst** durch sein, sonst überschreibt Glass die Brand-Identity verifizierter SVs.

## Verhältnis zum Branding-System

Das Glass-Design-System operiert **on top of** dem Branding-System (AAR-220 ff). Das Branding-System liefert `--brand-primary`, `--brand-surface`, `--brand-border` etc. pro SV/Kunde. Glass nutzt diese als **Tint-Quelle**, statt hartem Weiß.

**Konkret:**
- `--glass-bg` = 3-Stop-Gradient aus `color-mix(in srgb, white 78%, var(--brand-surface) 22%)` etc. — leichter Brand-Wash, nicht reines Weiß
- Pure-White-Variante (`--glass-bg-neutral`) bleibt für Marketing-Pages ohne Brand-Context (keine `--brand-*`-Vars vorhanden, `color-mix` fällt auf Pure-White zurück via Fallback)
- `--cta-gradient` = bereits Brand-Color (Ondo→Dark-Navy) — bei branded SVs leitet das auf `--brand-primary` + `color-mix(black 25%, var(--brand-primary))` durch
- `--brand-surface-gradient` (für Marketing-Pages ohne Map) zieht ebenfalls aus Brand-Vars mit Claimondo-Fallback

**Resultat:** Verifizierter SV mit Knallrot-Brand bekommt rosé-getönte Glass-Pills, rote CTA-Buttons, rote Map-Wash. Marketing-Pages ohne User-Context bekommen Claimondo-getönte (navy/ondo) Glass-Pills. Dieselben Components, derselbe Glass-Effekt, andere Tönung — alles über Variablen-Resolution.

---

## Ziel

Ein durchgängig anwendbares "Liquid-Glass"-Design für **alle** Claimondo-Oberflächen — Marketing-Pages, Wizard, Portale (Admin/Dispatch/Kunde/Gutachter/Kanzlei/Makler). Token-zentralisiert, sodass spätere Design-Anpassungen (Blur-Stärke, Transparenz, Radien) durch **eine** Variablen-Änderung wirken, nicht durch File-für-File-Refactor.

## Visuelle Vision (aus v12)

- **Karte / Brand-Hintergrund** ist die unterste Ebene
- **Glass-Pills + Cards** schweben darüber mit `backdrop-filter: blur + saturate`, semi-transparentem 3-Stop-White-Gradient und subtler weißer Border
- **Inputs sind Pills** mit Ondo-farbigem Placeholder, beim Tippen Navy
- **Primary-CTA** ist Brand-Gradient-Fill (Ondo → Dark-Navy), **Secondary** ist Glass-Pill in Navy — beide identische Höhe (44px), nur Hintergrund + Color trennen Hierarchie
- **Icons** sind Stroke-Icons (Lucide-Stil) in Schriftfarbe — **keine** Background-Kreise mehr
- **"Beratung vereinbaren"** als ständig sichtbare sekundäre Aktion (oben rechts global + neben jedem primary CTA)

---

## Design-Tokens (Source of Truth)

### Glass-Token

```ts
// src/lib/design-tokens.ts (Ergänzung)
export const glassTokens = {
  // Background: 3-Stop weiß-Gradient für die Glas-Tiefe
  bg: 'linear-gradient(135deg, rgba(255,255,255,.82) 0%, rgba(255,255,255,.62) 60%, rgba(255,255,255,.52) 100%)',
  // Background für nested Glass (Card mit Pills drin — Card ist transparenter)
  bgNested: 'linear-gradient(135deg, rgba(255,255,255,.48) 0%, rgba(255,255,255,.32) 60%, rgba(255,255,255,.26) 100%)',

  // Filter (CSS prefixt via -webkit- für Safari)
  blur: 'blur(32px) saturate(200%)',
  blurStrong: 'blur(40px) saturate(200%)', // für Glass-Cards mit nested Pills

  // Border
  border: '1px solid rgba(255,255,255,.75)',
  borderNested: '1px solid rgba(255,255,255,.6)',

  // Shadow: außen weiches navy, innen oben highlight, innen unten subtle dark
  shadow: [
    '0 8px 28px rgba(13,27,62,.10)',
    'inset 0 1px 0 rgba(255,255,255,.85)',
    'inset 0 -1px 0 rgba(13,27,62,.05)',
  ].join(', '),
  shadowCard: [
    '0 20px 60px rgba(13,27,62,.18)',
    'inset 0 1px 0 rgba(255,255,255,.65)',
    'inset 0 -1px 0 rgba(13,27,62,.04)',
  ].join(', '),

  // Radien
  radiusPill: '999px',     // Pills, Inputs, Buttons (alle)
  radiusCard: '24px',      // Glass-Card-Wrapper (Multi-Field-Container)
} as const
```

### Brand-Color-Token (existing, hier wiederholt)

```ts
export const brandColors = {
  navy: '#0D1B3E',
  ondo: '#4573A2',
  shield: '#7BA3CC',
  bg: '#f8f9fb',
  white: '#ffffff',
}
```

### Font-Token

```ts
export const fonts = {
  heading: '"Montserrat", system-ui, sans-serif',  // H1/H2/H3, Eyebrows, Labels, Step-Labels, "oder"-Separator
  body: '"Noto Sans", system-ui, sans-serif',      // Body, Placeholder, Buttons, Description
}
```

### CTA-Gradient-Token

```ts
export const ctaGradient = 'linear-gradient(135deg, rgba(69,115,162,.95), rgba(44,81,128,.92) 70%, rgba(26,61,107,.95))'
```

### CSS-Custom-Properties (auf `:root` in `globals.css`)

Glass-Vars mit `color-mix()`-Brand-Tint. `color-mix` auf `var(--brand-*, fallback)` greift sauber: wo kein Brand-Provider drüber gewrappt ist (Marketing), fällt jeder Wert auf den Claimondo-Default zurück.

```css
:root {
  /* Token-Internals — werden nicht direkt konsumiert, dienen color-mix() */
  --glass-tint-soft: var(--brand-surface, var(--claimondo-bg));
  --glass-tint-strong: var(--brand-primary, var(--claimondo-navy));

  /* Glass-Background — leichter Brand-Wash, kein hartes Weiß mehr */
  --glass-bg: linear-gradient(
    135deg,
    color-mix(in srgb, white 88%, var(--glass-tint-soft) 12%) 0%,
    color-mix(in srgb, white 70%, var(--glass-tint-soft) 30%) 60%,
    color-mix(in srgb, white 62%, var(--glass-tint-soft) 38%) 100%
  );
  /* Nested-Variante: transparenter (für Cards die andere Pills enthalten) */
  --glass-bg-nested: linear-gradient(
    135deg,
    color-mix(in srgb, transparent 52%, color-mix(in srgb, white 80%, var(--glass-tint-soft) 20%)) 0%,
    color-mix(in srgb, transparent 68%, color-mix(in srgb, white 70%, var(--glass-tint-soft) 30%)) 60%,
    color-mix(in srgb, transparent 74%, color-mix(in srgb, white 65%, var(--glass-tint-soft) 35%)) 100%
  );

  /* Filter */
  --glass-blur: blur(32px) saturate(200%);
  --glass-blur-strong: blur(40px) saturate(200%);

  /* Border — weißlich, leicht Brand-getönt */
  --glass-border: 1px solid color-mix(in srgb, white 80%, var(--glass-tint-strong) 4%);
  --glass-border-nested: 1px solid color-mix(in srgb, white 70%, var(--glass-tint-strong) 5%);

  /* Shadow */
  --glass-shadow:
    0 8px 28px color-mix(in srgb, transparent 90%, var(--glass-tint-strong)),
    inset 0 1px 0 rgba(255,255,255,.85),
    inset 0 -1px 0 color-mix(in srgb, transparent 95%, var(--glass-tint-strong));
  --glass-shadow-card:
    0 20px 60px color-mix(in srgb, transparent 82%, var(--glass-tint-strong)),
    inset 0 1px 0 rgba(255,255,255,.65),
    inset 0 -1px 0 color-mix(in srgb, transparent 96%, var(--glass-tint-strong));

  /* Radien */
  --glass-radius-pill: 999px;
  --glass-radius-card: 24px;

  /* Claimondo-Defaults — werden via color-mix() Fallback verwendet wenn kein Brand-Provider */
  --claimondo-navy: #0D1B3E;
  --claimondo-ondo: #4573A2;
  --claimondo-shield: #7BA3CC;
  --claimondo-bg: #f8f9fb;

  /* CTA-Gradient — zieht aus Brand-Primary, fallt auf Claimondo zurück */
  --cta-gradient: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand-primary, var(--claimondo-ondo)) 95%, transparent) 0%,
    color-mix(in srgb, var(--brand-primary, var(--claimondo-ondo)) 80%, black 12%) 70%,
    color-mix(in srgb, var(--brand-primary, var(--claimondo-ondo)) 70%, black 22%) 100%
  );

  /* Brand-Surface-Gradient für Marketing-Pages ohne Map */
  --brand-surface-gradient:
    radial-gradient(circle at 22% 25%, color-mix(in srgb, transparent 82%, var(--brand-shield, var(--claimondo-shield))) , transparent 38%),
    radial-gradient(circle at 78% 70%, color-mix(in srgb, transparent 86%, var(--brand-primary, var(--claimondo-ondo))), transparent 42%),
    linear-gradient(135deg, #f8fafd 0%, #ecf1f7 35%, #e0e8f0 65%, #d4dee9 100%);

  /* Fonts */
  --font-heading: 'Montserrat', system-ui, sans-serif;
  --font-body: 'Noto Sans', system-ui, sans-serif;
}
```

**Browser-Support:** `color-mix()` ist Chrome 111+, Firefox 113+, Safari 16.2+ — alle aktuellen Browser. Bei extrem alten Browsern (Safari ≤ 16.1) fällt CSS auf `unset` zurück und der `var(--brand-*, claimondo-fallback)` greift direkt — Glass sieht dann etwas heller aus, bleibt aber funktional.

---

## Shared Components (neu, `src/components/shared/glass/`)

Alle Components nehmen `className` für Compose + sind ohne harte Layout-Annahmen (kein hartes Margin, Caller positioniert).

### 1. `<GlassPill>`

Status-Pill / Step-Indicator / Generic-Container.

```tsx
interface Props {
  children: React.ReactNode
  className?: string
}
```

CSS: `padding: 10px 22px`, `gap: 10px`, `border-radius: var(--glass-radius-pill)`, alle Glass-Tokens, `line-height: 1.1`, `white-space: nowrap`.

**Beispiel:**
```tsx
<GlassPill>
  <LiveDot />
  <span className="font-heading text-[11px] font-bold uppercase tracking-[.14em] text-claimondo-ondo">
    62 SVs in Ihrer Nähe
  </span>
</GlassPill>
```

### 2. `<GlassInput>`

Pill-Form-Input mit Label.

```tsx
interface Props {
  label: string             // z.B. "Straße, PLZ, Ort"
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
  type?: 'text' | 'email' | 'tel'
  className?: string
}
```

Renders:
```tsx
<div className="flex flex-col gap-1.5 w-full min-w-0">
  <span className="font-heading text-[11px] font-bold uppercase tracking-[.1em] text-claimondo-navy/75 px-[22px]">
    {label}
  </span>
  <div className="glass flex items-center px-[26px] py-[13px] min-h-[44px] min-w-0 w-full rounded-[999px] text-[14.5px] font-medium font-body">
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className="flex-1 min-w-0 bg-transparent border-none outline-none text-claimondo-navy placeholder:text-claimondo-ondo"
    />
  </div>
</div>
```

### 3. `<GlassButton>`

Primary-CTA (Brand-Gradient-Fill) oder Secondary (transparent Glass + Navy Text).

```tsx
interface Props {
  variant: 'cta' | 'secondary'
  children: React.ReactNode
  icon?: React.ReactNode  // Lucide-Icon
  iconPosition?: 'left' | 'right'
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}
```

Beide Varianten: identisches `padding: 13px 26px`, `min-height: 44px`, `font-size: 14px`, `font-weight: 600`, `border-radius: var(--glass-radius-pill)`. **Unterschied nur:** CTA hat `--cta-gradient` als Background + weißen Text + großen Brand-Shadow; Secondary hat Glass-Background + Navy-Text.

Icon: 14-15px Stroke-Icon (Lucide), Stroke-Color = Text-Color, kein Background-Kreis.

### 4. `<GlassCard>`

Multi-Field-Container. Eigene transparentere bg + stärkerer blur damit nested Glass-Pills dahinter durchscheinen.

```tsx
interface Props {
  children: React.ReactNode
  className?: string
}
```

CSS: `padding: 24px`, `border-radius: var(--glass-radius-card)` (= 24px), `background: var(--glass-bg-nested)`, `backdrop-filter: var(--glass-blur-strong)`, `box-shadow: var(--glass-shadow-card)`. **`*` innerhalb hat `box-sizing: border-box`** (sonst brechen Pills über den Rand).

Verwendet **nur** für Multi-Field-Phasen (z.B. Phase 5 Kontakt mit 7 Feldern). Single-Field-Phasen rendern Felder freischwebend ohne Wrapper.

### 5. `<GlassFieldGrid>`

Helper für Pair-Layouts (Vorname + Nachname etc.).

```tsx
<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
  {children}
</div>
```

`minmax(0, 1fr)` ist Pflicht — sonst rutschen Pills über den Card-Rand.

### 6. `<GlassStepIndicator>`

Step-Pills für Wizard-Progress.

```tsx
interface Props {
  current: number            // 1-based
  total: number
  className?: string
}
```

Render: `<GlassPill>` mit Label `Schritt {current} / {total}` + N step-Pills (16px×4px), wobei der aktuelle einen Brand-Gradient-Fill bekommt, vorherige Ondo-55%-Solid, kommende Ondo-25%-Solid.

### 7. `<BeratungVereinbarenButton>`

Wrapper um `<GlassButton variant="secondary" icon={<PhoneIcon />}>Beratung vereinbaren</GlassButton>`. Wird global (z.B. in einem `<TopRightSlot>` per Layout) und kontextuell (neben jedem Primary-CTA) eingesetzt. Click öffnet `tel:` oder einen Modal-Calendly (entscheiden wir später).

---

## Layout-Pattern

### Pattern A — Freischwebende Phase (Default für single-field oder leichte Phasen)

```tsx
<MapBackground>
  <BeratungVereinbarenButton className="absolute top-8 right-8" />
  <div className="flex flex-col gap-4 w-[400px] mt-15">
    <GlassPill> {/* Status */} </GlassPill>
    <GlassStepIndicator current={1} total={5} />
    <h1 className="font-heading text-3xl font-extrabold text-claimondo-navy">{phaseTitel}</h1>
    <p className="font-body text-claimondo-navy/70">{phaseBeschreibung}</p>
    <GlassInput label="Straße, PLZ, Ort" placeholder="..." />
    <div className="flex gap-3 items-center mt-2.5">
      <GlassButton variant="cta" icon={<ArrowRight />} iconPosition="right">Weiter</GlassButton>
      <span className="font-heading text-[11px] uppercase tracking-[.1em] text-claimondo-navy/55">oder</span>
      <BeratungVereinbarenButton />
    </div>
  </div>
</MapBackground>
```

### Pattern B — Glass-Card-Wrapper (für Multi-Field-Phasen)

Wenn ≥ 4 Felder oder Pair-Layout nötig → `<GlassCard>` als Container, alles drin freischwebend (Step-Pill, Titel, Felder, CTA-Row).

```tsx
<MapBackground>
  <BeratungVereinbarenButton className="absolute top-8 right-8" />
  <GlassCard className="w-[420px] max-w-[420px] mt-15">
    <GlassStepIndicator current={5} total={5} />
    <h3 className="font-heading text-[22px] font-extrabold">Ihre Kontaktdaten</h3>
    <p className="font-body text-sm text-claimondo-navy/70">Damit wir den Termin bestätigen können.</p>
    <GlassFieldGrid>
      <GlassInput label="Vorname" placeholder="Max" />
      <GlassInput label="Nachname" placeholder="Mustermann" />
    </GlassFieldGrid>
    <GlassFieldGrid>
      <GlassInput label="E-Mail" type="email" placeholder="max@beispiel.de" />
      <GlassInput label="Telefon" type="tel" placeholder="+49 151 …" />
    </GlassFieldGrid>
    <GlassInput label="Bevorzugter Kanal" placeholder="WhatsApp" />
    <GlassCheckboxPill label="Ich stimme der Verarbeitung meiner Daten gemäß der Datenschutzerklärung zu." />
    <div className="flex gap-3 items-center justify-end mt-1.5">
      <BeratungVereinbarenButton />
      <GlassButton variant="cta" icon={<ArrowRight />} iconPosition="right">Bestätigen</GlassButton>
    </div>
  </GlassCard>
</MapBackground>
```

### Pattern C — Marketing-Page ohne Map

Bei Pages ohne Karten-Hintergrund (vorteile, faq, ueber-uns) bekommt der `<body>` einen subtilen Brand-Gradient-Background (auch Token in design-tokens.ts), und Hero/Form-Sections nutzen die gleichen Glass-Components.

Background-Token (neu):
```ts
export const brandSurfaceGradient =
  'radial-gradient(circle at 22% 25%, rgba(123,163,204,.18), transparent 38%), ' +
  'radial-gradient(circle at 78% 70%, rgba(69,115,162,.14), transparent 42%), ' +
  'linear-gradient(135deg, #f8fafd 0%, #ecf1f7 35%, #e0e8f0 65%, #d4dee9 100%)'
```

---

## Migrations-Reihenfolge (Sprint-Decomposition)

### Sprint 0 — Branding-Rollout Phase 1 (PFLICHT-Vorbedingung, ~1-2h)
Aus `docs/12.05.2026/branding-rollout-spec.md`:
1. `globals.css:69-75` Tailwind-Tokens auf Brand-Vars umbiegen (`--color-claimondo-navy: var(--brand-primary, var(--claimondo-navy))` etc.)
2. `globals.css:101/107/112` shadcn-Tokens analog
3. Smoke mit Test-SV der Custom-Brand hat (z.B. Knallrot)

**Acceptance:** Ein SV mit Brand-Theme sieht sein Brand im SV-Portal durch Tailwind-Utilities transitiv. Ohne diese Phase greift mein Glass-`color-mix(... var(--brand-surface))` nirgendwo, weil `--brand-surface` nicht propagiert ist.

### Sprint 1 — Tokens + Shared Components + gutachter-finden Pilot (~1 Tag)
1. `src/lib/design-tokens.ts` um Glass-Tokens erweitern
2. `src/app/globals.css` um CSS-Custom-Properties erweitern + Brand-Surface-Gradient als utility-class
3. `src/components/shared/glass/{GlassPill, GlassInput, GlassButton, GlassCard, GlassFieldGrid, GlassStepIndicator, GlassCheckboxPill, BeratungVereinbarenButton}.tsx` neu anlegen
4. `gutachter-finden/GutachterFinderMapClient.tsx` + `WizardClient.tsx` (DynamicWizard) auf die Glass-Components umstellen — wird der erste sichtbare Test
5. Smoke auf staging

**Acceptance:** gutachter-finden zeigt das v12-Design auf staging, Tokens isoliert testbar.

### Sprint 2 — Marketing-Pages (~1 Tag)
Alle Public-Pages migrieren: `vorteile`, `wie-es-funktioniert`, `faq`, `ueber-uns`, `kfz-gutachter`, `gutachter-partner` (WaitlistApply), `schaden-melden`, `ersteinschaetzung`, `beratung-anfragen`, `makler/partner-werden`, `schadensreport-2026`. Brand-Surface-Gradient als Background, Glass-Components für Hero + Form-Sections.

**Acceptance:** alle Marketing-Routes nutzen `<GlassPill>`/`<GlassButton>`/`<GlassInput>`, keine hartkodierten Card-Wrapper mehr.

### Sprint 3 — DynamicWizard Form-Fields (~0.5 Tage)
Alle existierenden Field-Types unter `src/components/onboarding/fields/` (TextField, TextareaField, SegmentedField, ToggleCardsField, SelectField, CheckboxField, SlotField, SignatureField, FileField, **Zb1UploadField**) auf das Glass-Pill-Pattern umstellen. Reuse von `<GlassInput>` wo passend.

**Acceptance:** Onboarding-Wizard rendert alle Phasen mit Glass-Tokens. Kein eigener Style-Sheet pro Field-Type mehr.

### Sprint 4 — App-Portals (~2–3 Tage)
Migrieren in dieser Reihenfolge:
1. **Kunde-Portal** (`/kunde/*`) — höchste User-Sichtbarkeit
2. **Gutachter-Portal** (`/gutachter/*`) — SV-Tool
3. **Dispatch-Portal** (`/dispatch/*`)
4. **Admin-Portal** (`/admin/*`)
5. **Kanzlei-Portal** (`/kanzlei/*`)
6. **Makler-Portal** (`/makler/*`)

Pro Portal: Layout-Frame (Nav/Sidebar) + Top-Level-Pages umstellen, Tab-Wrapper / Card-Sections durch `<GlassCard>` ersetzen.

**Acceptance:** alle internen Portale rendern Glass-Pattern, alte hartkodierte `bg-white rounded-3xl shadow-...` Wrapper sind entfernt oder migriert.

### Sprint 5 — Edge-Cases & Polish (~0.5 Tage)
- Print-Styles (PDFs / Druckansicht müssen Glass-Effekte ausschalten — sonst weiße Lücken)
- Reduced-Motion: `backdrop-filter` ist GPU-intensiv, optional reduzierte Variante für `prefers-reduced-transparency`
- A11y: Kontrast-Check (Ondo-Placeholder auf weiß-translucent — WCAG AA?)
- Performance-Audit: zu viele Glass-Layer in einer Page = Frame-Drop auf Mobile

---

## Out of Scope

- **Dark-Mode** — separater Sprint, eigene Token-Override-Strategie
- **Native-Mobile-App** (falls jemals): React-Native braucht Glass-Equivalent (`BlurView`), nicht jetzt
- **3D-Map / Cesium / Feldmodus-Glass-Adaption** — Feldmodus hat eigene cinematic Layer, nicht im selben Token-System

---

## Risiken & Mitigationen

- **`backdrop-filter` Performance** auf älteren Mobile-Geräten — Mitigation: max 5-7 Glass-Layer pro Viewport, Cache via `will-change: backdrop-filter` nur wo sinnvoll
- **Safari-Quirks** mit `-webkit-backdrop-filter` — Mitigation: Token enthält beide Präfixe, getestet auf iOS Safari 14+
- **Lesbarkeit über unruhigem Map-Hintergrund** — Mitigation: `text-shadow` auf H1/Desc bei Map-direkter Anzeige, sonst Glass-Pill als Träger
- **Cumulative-Glass-Cost** wenn ganze Page nur aus Glass besteht — Mitigation: Pages ohne Map nutzen `brandSurfaceGradient` als statischen Background statt Glass-Layer

---

## Verwandte Docs

- `docs/12.05.2026/branding-rollout-spec.md` — **Vorbedingung**, das existierende 27-Var-Brand-System (AAR-220 ff). Sprint 0 dieser Spec entspricht "Phase 1" dort.
- `docs/12.05.2026/gutachter-finden-smoke-fixes.md` — voriger Smoke-Fix-Cycle (gleicher Pfad, der jetzt das Glass-Design bekommt)
- `docs/12.05.2026/staging-slot-plan.md` — Staging-Infra (zum Smoken pro Sprint)
- Memory `project_design_system` — bestehendes Token-System (wird hier erweitert)
- Memory `project_brand_identity` — Brand-Voice, Mission, Vision
- Mockup-Source: `.superpowers/brainstorm/717145-1778577255/content/ios-glass-v12.html`
