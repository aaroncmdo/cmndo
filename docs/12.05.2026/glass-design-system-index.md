# Glass-Design-System — Index

**Datum:** 2026-05-12
**Status:** 🟡 SPEC FERTIG — wartet auf Aaron-Review

## Was ist passiert

Aaron-Feedback nach gutachter-finden-Smoke (v12-Mockup): "Das Design ist unnormal geil — durchziehen über die ganze App + Marketing-Seiten."

Daraus wurde:
1. **12 Mockup-Iterationen** (v1-v12) im Brainstorm-Companion → final approved v12
2. **Brand-Spec** unter `docs/superpowers/specs/2026-05-12-claimondo-glass-design-system.md`
3. **Erkenntnis:** das Glass-System muss auf dem **existierenden Branding-System** aufsetzen (AAR-220 ff, siehe `branding-rollout-spec.md`). Glass-Token nutzt `color-mix()` auf `--brand-surface` / `--brand-primary` mit Claimondo-Default-Fallback — verifizierte SVs bekommen Brand-getöntes Glass, alles andere Claimondo-Glass.

## Locked-in Design-Decisions

- **Pills 999px Radius** (Liquid-iOS-Look), Card-Wrapper 24px
- **Backdrop-filter:** `blur(32px) saturate(200%)` (Strong-Variante 40px für Cards)
- **Background:** 3-Stop-Gradient white → brand-surface-mix (12/30/38%)
- **Border:** weiß mit subtler Brand-Tint
- **Shadow:** weiches navy-Outer-Shadow + inset-highlight oben + inset-shade unten
- **Buttons:** identische 44px-Höhe, 13/26 padding, 14px font. Hierarchie nur via Fill (CTA Brand-Gradient, Secondary Glass + Navy)
- **Icons:** Stroke-Style (Lucide), in Schriftfarbe, kein Background-Kreis
- **Fonts:** Montserrat (Heading/Label/Eyebrow), Noto Sans (Body/Placeholder/Button-Text)
- **Inputs:** Placeholder = Ondo (oder Brand-Primary), Typed = Navy (oder Brand-Primary-Dark)
- **"Beratung vereinbaren"** ist permanenter Secondary-CTA (oben rechts global + neben jedem Primary-CTA)

## Sprint-Plan (Kurzfassung)

- **Sprint 0 (PFLICHT)** — Branding-Rollout Phase 1 (`globals.css:69-75` Tailwind-Tokens auf Brand-Vars), 1-2h
- **Sprint 1** — Glass-Tokens + Shared-Components + gutachter-finden Pilot, ~1d
- **Sprint 2** — Marketing-Pages migrieren (vorteile/faq/ueber-uns/etc.), ~1d
- **Sprint 3** — DynamicWizard Field-Types, ~0.5d
- **Sprint 4** — App-Portals (Kunde → SV → Dispatch → Admin → Kanzlei → Makler), ~2-3d
- **Sprint 5** — Polish (Print, Reduced-Motion, A11y, Performance), ~0.5d

## Nächster Schritt

Aaron reviewed die Spec → wenn OK, schreibe ich den **Implementation-Plan für Sprint 0 + 1** (Branding-Foundation + Glass-Pilot auf gutachter-finden). Folge-Sprints werden ihre eigenen Plans bekommen.

## Verwandte Docs

- **Spec (Hauptdokument):** `docs/superpowers/specs/2026-05-12-claimondo-glass-design-system.md`
- **Vorbedingung:** `docs/12.05.2026/branding-rollout-spec.md`
- **Vorheriger Smoke:** `docs/12.05.2026/gutachter-finden-smoke-fixes.md`
- **Staging-Infra:** `docs/12.05.2026/staging-slot-plan.md`
- **Mockup-Source:** `.superpowers/brainstorm/717145-1778577255/content/ios-glass-v12.html`
