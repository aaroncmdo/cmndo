# Design-Token-Audit — Customer-Journey-Smoke-Screenshots

**Datum:** 13.05.2026
**Quelle:** Screenshots aus den heutigen Live-Walks (`cj-beratung-realtime-v2`, `cj-multi-role-v4`, `live-field-walk-1778706740470`)
**Referenz:** `feedback_ci_farben`-Memory + `project_design_system`-Memory + `src/lib/design-tokens.ts`

## Verbindliche Token (Memory)

- **Primärfarben:** `claimondo-navy` `#0D1B3E`, `claimondo-ondo` `#4573A2`, `claimondo-shield` `#7BA3CC`, `claimondo-bg` `#f8f9fb`, `claimondo-border`, weiß
- **Semantik:** Rot/Grün/Amber für Status/Erfolg/Warnung explizit erlaubt
- **Verboten:** Tailwind-Defaults (`gray-*`, `slate-*`, `blue-*`) ohne semantischen Grund
- **Komponenten:** `primitives/*` Atom-Layer, `shared/*` Composite, `ui/*` shadcn nur für Desktop-Rich-UI
- **Radien:** 4 erlaubt (full/lg/md/sm). **Typo:** 7 Größen. **Shadow:** 3 Klassen.

## Pro Screen

### 🟢 Marketing-Page `/gutachter-finden`
- Header-Linie, Hilfe-Icons, Map-Marker-Akzente → `claimondo-ondo`
- Sidebar-Wizard-Card → `bg-white` + `border border-claimondo-border` + `glass-bg` für Glass-Variant
- Step-Indicator (`1/2/…`) → aktive Phase `claimondo-ondo`, inaktive `claimondo-shield`/`claimondo-bg`
- „Weiter"-Button (Glass-Variant) → `var(--glass-bg)` mit `var(--glass-border)` ✓
- „Beratung vereinbaren"-Button → `GlassButton variant="secondary"` ✓
- Cookie-Banner unten → `bg-claimondo-navy` ✓
- **Status:** Token-konform, alle Farben aus Schema.

### 🟢 Beratungs-Rückruf-Modal
- Header-Icon `Phone` → `text-claimondo-ondo` ✓
- Field-Labels uppercase → `text-claimondo-shield` ✓
- Input-Borders → `border-claimondo-border` mit `focus:border-claimondo-ondo` ✓
- 5 Zeitfenster-Toggle-Buttons:
  - aktiv → `bg-claimondo-navy text-white border-claimondo-navy` ✓
  - inaktiv → `bg-white text-claimondo-navy border-claimondo-border` ✓
- Submit „Rückruf anfordern" → `bg-claimondo-navy text-white` (Primary CTA) ✓
- Success-State `CheckCircle2` → `text-emerald-500` (semantisches Grün — explizit erlaubt) ✓
- Backdrop → `rgba(13,27,62,.55)` aus Navy-Hex (inline weil 3rd-Party-fix; Memory erlaubt `var(--brand-primary, #0D1B3E)` als Fallback). **Klein verbessern:** `rgba()` durch `color-mix(in srgb, var(--brand-primary,#0D1B3E) 55%, transparent)` für Whitelabel-Branding.
- **Status:** Token-konform, eine optionale Verbesserung (s.o.).

### 🟡 Magic-Link-Wizard `/flow/[token]` — FlowWizardKfz (Step 2)
- Step-Indicator: aktiv `#0D1B3E` filled, vergangen check-icon dark → ✓
- Verbindungslinien zwischen Step-Bubbles → wirken wie generisches `border-gray-200` statt `border-claimondo-border`. **Beleg im Code suchen** (`FlowWizardKfz.tsx` Step-Indicator-Render).
- „Ihr persönlicher Gutachter"-Card → `bg-white rounded-2xl shadow-*` ✓
- Wartebox „Wir suchen gerade…" → beige/amber Hintergrund + amber Text → **semantisch korrekt** (Warning), aber sollte aus Token-Set (`bg-amber-50 text-amber-700`) statt freiem Wert.
- „Weiter"-Button → ondo Pill ✓
- „Zurück"-Pill unten → light gray (`bg-claimondo-bg`?) ✓
- **Status:** 1 optionale Inkonsistenz (Verbindungslinien). Inhalte ok.

### 🟡 Magic-Link-Wizard Step 3 — Sicherungsabtretung
- Signature-Canvas-Container → weiß mit `border-claimondo-border` ✓
- AGB-Checkbox-Checked-State → `text-emerald-500` (semantic) ✓
- „SA unterzeichnen"-Button → `bg-claimondo-ondo shadow-cta-ondo` ✓
- Disabled-State (während Submit) → `disabled:opacity-40` ✓
- „Vollständige Sicherungsabtretung lesen"-Link-Text → claimondo-ondo blue ✓
- **Status:** Token-konform.

### 🟢 Magic-Link-Wizard Step 4 — Geschafft
- Success-Card → weiß mit grünem Header-Akzent (emerald) — semantic ✓
- LexDrive-Partner-Card → `bg-claimondo-bg` ✓
- Spinner „Wir richten Ihr Portal ein…" → Standard-Spinner mit `text-claimondo-ondo`-Hint
- **Status:** Token-konform.

### 🟢 Dispatcher-Sidebar (alle Multi-Role-Screenshots)
- Sidebar-BG → `bg-claimondo-navy` (Primary-Dark, App-Shell-konventioniert) ✓
- „DISPATCH"-Badge → light variant + `text-claimondo-ondo` ✓
- Nav-Items aktiv (Leads) → secondary blue mit `claimondo-ondo` Text + `bg-white/8` indicator ✓
- Nav-Items inaktiv → `text-white/70` mit `hover:text-claimondo-ondo` ✓
- Avatar-Bubble → `bg-claimondo-shield` ✓
- „Abmelden"/„Hilfe & Support" → token-konsistent ✓
- **Status:** Token-konform.

### 🟡 Dispatch-Lead-Detail (Phase 1 „Qualifizierung")
- Phase-Stepper oben:
  - aktiv `1 Qualifizierung` → `bg-claimondo-navy text-white` ✓
  - inaktiv (2-6) → `bg-claimondo-bg text-claimondo-shield` ✓
- „Phase 1: Qualifizierung"-Header + V1-Badge → V1 = amber-pill (semantic) ✓
- Kundendaten-Editor mit `KUNDENDATEN BEARBEITEN`-Label → uppercase claimondo-shield ✓
- Input-Felder → `border-claimondo-border` ✓
- Sprache-Toggle-Pills: Deutsch aktiv = navy filled, andere = transparent + claimondo-ondo text ✓
- **Sidebar rechts:**
  - „Disqualifizieren" → rote Outline-Pill (semantic) ✓
  - „Rückruftermin"-Card → weiß mit `border-claimondo-border` ✓
  - „Datum & Uhrzeit"-DateTime-Input nutzt **native browser-control** → kein Token-Customizing möglich, **bewusst**.
  - „Notiz"-Textarea-Placeholder → claimondo-shield grau ✓
  - „Termin speichern" → `bg-claimondo-ondo shadow-cta-ondo` ✓
  - „Rückruf erledigt" → `bg-emerald-500` (semantic-green Success) ✓
  - „Dispatch fortsetzen → Lead-Maske öffnen" → ondo-Link mit Arrow ✓
- „KOMMEND"-Section → uppercase claimondo-shield grauer Header ✓
- **Status:** Token-konform.

### 🟢 Dispatcher-Rückrufe-Liste
- Page-Title „Rückrufe" → navy bold ✓
- Item-Reihe-Hover → `claimondo-bg` ✓
- Roter Dot (ungesehen) → semantic red ✓
- Phone-Icon → claimondo-ondo ✓
- Datum-Text wenn überfällig → rote semantic ✓
- „Rückruf erledigt"-Button-Reihe → emerald-500 (semantic) ✓
- **Status:** Token-konform.

## Was zu überprüfen / ggf. nachzuziehen

| # | Stelle | Befund | Empfehlung |
|---|---|---|---|
| 1 | `FlowWizardKfz.tsx` Step-Indicator-Verbindungslinien | Wirken wie generisches `gray-200` | Auf `border-claimondo-border` ziehen |
| 2 | `FlowWizardKfz.tsx` Wartebox „Wir suchen…" | beige/amber-Hintergrund freihändig | `bg-amber-50` / `text-amber-700` token-konsistent |
| 3 | `BeratungModal.tsx` Backdrop-Hex | `rgba(13,27,62,.55)` inline | `color-mix(in srgb, var(--brand-primary, #0D1B3E) 55%, transparent)` für Whitelabel-Brand-Override |
| 4 | Versand-Buttons Phase 5 (WhatsApp/SMS/Email) | nutzen `bg-[#25D366]` WhatsApp-Brand-Grün + `bg-amber-500` SMS-Fallback | **Korrekt** — WhatsApp-Brand-Grün ist gewollte CI von Meta (sollte als `var(--brand-whatsapp)` aus Token-Set kommen, falls Whitelabel das mal ändern will) |
| 5 | Mapbox-Popup-Buttons (HTML-Template) | Inline `#0D1B3E`/`#4573A2`/`#7BA3CC` Hex-Konstanten | Memory erlaubt das ausdrücklich für Inline (3rd-Party-Container), aber als `var(--brand-primary, #0D1B3E)` für Whitelabel besser |

## Gesamteinschätzung

**Sehr hoher Compliance-Grad.** Die heutigen Smoke-Screenshots zeigen durchgängig:
- Primary-Hierarchie konsistent (Navy > Ondo > Shield)
- Border-Konvention konsequent
- Semantische Farben (rot/grün/amber) nur dort eingesetzt wo Pattern-konsistent (Status, Disabled, Success, Warning)
- Backgrounds nutzen `bg-claimondo-bg` für Section-Surfaces statt freier `bg-gray-*`

**Größere Lücken sehe ich keine.** Die 5 Punkte oben sind kosmetisch — Whitelabel-Branding (`use_custom_branding`) würde sie aufdecken, weil dort `claimondo-*`-Tokens durch `var(--brand-*)` ersetzt werden und inline Hex-Werte starr bleiben.

## Empfehlung

1. Diesen Audit ins backlog (Linear-Issue) packen, Priorität niedrig — Cosmetic.
2. Whitelabel-Smoke-Iter mit SV-`use_custom_branding=true` fahren, dann sind die genannten Stellen sofort als „falsch gebrandet" sichtbar.
