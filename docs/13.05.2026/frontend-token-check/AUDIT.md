# Frontend Token-Check — 13.05.2026

Vollständige Bestandsaufnahme aller Tailwind-Default-Farb-Verstöße gegen die CI-Tokens-Policy:
- `feedback_ci_farben` (Memory): „Nur navy/ondo/shield/border/#f8f9fb/weiß für UI-Neutral; Semantic-Rot/Grün/Amber weiter erlaubt. Keine gray/slate/blue-Tailwind-Defaults."
- `AGENTS.md §branding-rules`: `bg-claimondo-*` / `text-claimondo-*` / `border-claimondo-*` als Default.

Stand: staging-Head `1c4f303a` (Merge PR #988).

## Bestandsaufnahme

| Farbe | Hits | Ersatz-Mapping (Proposal) | Anmerkung |
|---|---:|---|---|
| `violet-` | **74** | → `claimondo-ondo` (oder emerald wenn Success) | Premium/Akzent-Banner |
| `rose-` | **71** | → `red-*` | Semantic-Danger-Alias, klar 1:1 |
| `purple-` | 19 | → `claimondo-ondo` | Akzent-Variante |
| `indigo-` | 6 | → `claimondo-navy` | Navy-Tone-Substitut |
| `slate-` | 5 | → `claimondo-shield` | Grau-Tone |
| `zinc-` | 5 | → `claimondo-shield`/`claimondo-border` | Grau-Tone |
| `pink-` | 3 | Manuell prüfen (status-spezifisch) | `statusLabels.ts`, `KanbanBoard` |
| `cyan-` | 3 | Manuell prüfen | `statusLabels.ts` (sturmschaden) |
| `blue-` | 2 | → `claimondo-ondo` | `NaviHud`, Karten-Border |
| `sky-` | 1 | → `claimondo-ondo` | — |
| **Summe** | **~189** | | |

Sweep-Scripts `aar-745b/c/d` finden **0 hits** im aktuellen Stand — diese Verstöße sind **außerhalb des bestehenden Mappings**. Brauchen `aar-745e`-Erweiterung.

## Top-Files

### violet (74)
- `src/components/gutachter/GutachtenUploadBanner.tsx` — 17
- `src/components/kb/VollstaendigkeitsCheckCard.tsx` — 11
- `src/components/kunde/EigeneKanzleiPaketCard.tsx` — 8
- `src/app/faelle/[id]/_prozess/Sections.tsx` — 5
- `src/components/gutachter/AuftragHeaderPanel.tsx` — 4
- diverse Kunde-/Gutachter-Cards — ~30 verteilt

### rose (71)
- `src/components/shared/fall-phases/PhaseStep.tsx` — 4 (`blocked`-Status)
- `src/components/kunde/KundeAusfallEntschaedigungCard.tsx` — 4
- `src/components/WeatherWidget.tsx` — 3
- `src/components/shared/claims/EndzustandModal.tsx` — 3
- diverse Cards/Status-Badges — ~57 verteilt

### purple (19)
- `src/app/admin/finance/(hub)/page.tsx`
- `src/app/admin/kalender/KalenderClient.tsx`
- `src/app/admin/_components/WichtigeUpdatesWidget.tsx`
- `src/components/Spotlight.tsx`

## Mapping-Detail

Konkrete Tailwind-Shade-Mappings (für Sweep-Script):

```
violet-50  → claimondo-ondo/[0.06] | claimondo-bg
violet-100 → claimondo-ondo/[0.10]
violet-200 → claimondo-ondo/30
violet-300 → claimondo-ondo/50
violet-500 → claimondo-ondo
violet-600 → claimondo-ondo
violet-700 → claimondo-navy
violet-900 → claimondo-navy

rose-50    → red-50
rose-100   → red-100
rose-200   → red-200
rose-300   → red-300
rose-400   → red-400
rose-500   → red-500
rose-600   → red-600
rose-700   → red-700
rose-900   → red-900

purple-*   → wie violet-*

indigo-50  → claimondo-navy/[0.06]
indigo-100 → claimondo-navy/[0.10]
indigo-700 → claimondo-navy
indigo-800 → claimondo-navy

slate-*    → claimondo-shield (/ border bei 200/300)
zinc-*     → claimondo-shield (/ border bei 200/300)
blue-300/400 → claimondo-ondo/40-60 (border-Tones)
blue-500/600 → claimondo-ondo
sky-*      → claimondo-ondo
cyan-*     → claimondo-ondo (außer statusLabels — manuell)
pink-*     → manuell (status-spezifisch)
```

## Edge-Cases (manuell prüfen, NICHT autom. sweep)

1. **`src/lib/statusLabels.ts`** — `vandalismus: 'bg-pink-50 text-pink-700'`, `sturmschaden: 'bg-cyan-50 text-cyan-700'` — Status-Color-Map. Möglicherweise gewollt für eindeutige Unterscheidung. Aaron-Decision nötig.
2. **`src/app/dispatch/leads/[id]/GespraechsleitfadenTimer.tsx`** — `bg-pink-50` für Timer-Phase. Phase-Color-Code, evtl. bewusst.
3. **`src/components/Spotlight.tsx`** — Spotlight-Effekt mit purple. Vielleicht Animation/Glow.
4. **`src/components/WeatherWidget.tsx`** — rose für Regen-Variante? Wetter-Semantik.

## Vorgehen

1. **`aar-745e-extended-tokens-sweep.mjs`** schreiben mit obigen Mappings (skipt statusLabels.ts, KanbanBoard, Spotlight, WeatherWidget, GespraechsleitfadenTimer)
2. Dry-Run → 68 Files, 252 Replacements ✅ angewendet
3. **Override-Audit unten** für die Stellen die noch DRÜBER rendern
4. UI-Diff stichprobenartig auf Staging prüfen
5. PR mit Audit-Trail

---

## Token-Override-Audit (was rendert ÜBER den Tokens)

Tokens können noch unsichtbar werden wenn drüber-liegender Code sie überschreibt:

| Pattern | Count | Status |
|---|---:|---|
| `style={{ ...hex... }}` inline | **126** | manuell, Hex-Werte → Token oder `var(--brand-*)` |
| `class!` (Tailwind v4 important-suffix) | **81** | meist legit (DataTable-Caller-Override mit Token-Wert), kein Fix |
| `(bg\|text\|border)-[#xxx]` arbitrary hex | **170** | **bulk-mapbar** wenn Hex = CI-Token |
| CSS-Modules `.module.css` | **0** | n/a |

### 1:1 Hex→Token Quick-Wins (kein visuelles Diff, identische Farbe)

| Hex | Tokens-Ersatz | Vorkommen |
|---|---|---:|
| `#E2E8F3` | `claimondo-border` | **28** |
| `#3a6290` | `claimondo-shield` | 15 |
| `#3a6291` | `claimondo-shield` | 13 |
| `#8a93a6` | (Aaron-Placeholder-Tone, im Input-Atom default) | 15 |
| `#f8f9fb` | `claimondo-bg` | 5 |
| `#EBF1F8` / `#eef4fb` | `claimondo-ondo/[0.06]` (light-blue-Tint) | 9 |
| `#0D1B3E` | `claimondo-navy` | (siehe AGENTS.md branding-rules) |
| `#4573A2` | `claimondo-ondo` | — |
| `#7BA3CC` | `claimondo-light-blue` | — |

**Brand-Fremde Farben (NICHT ersetzen):**
- `#25D366` (7×) — WhatsApp-Grün, offizielles WA-Brand
- `#1fa855` (4×) — Success-Variant (semantic)
- `#a855f7` (3×) — Spotlight/Animation
- `#0e5be9` (4×) — externer Link/Quelle?

### Inline-Style-Audit (126)

Top-Files:
- `src/lib/email/google/templates/*` (~27) — Email-HTML rendert nicht via Tailwind, **inline-Style ist Pflicht** (Resend/Gmail-Rendering). Aber Hex sollte `var(--brand-primary, #0D1B3E)`-Fallback nutzen.
- `src/app/gutachter-finden/opengraph-image.tsx` (7) — `next/og` API, inline-only
- `src/components/kunde/TerminReschedulingModal.tsx` (5)
- `src/components/onboarding/fields/SlotField.tsx` (4)

→ **Email/OG-Templates skippen** (kein Tailwind-Context). Restliche ~85 inline-styles in normalen Components müssen auditiert werden.

### Important-Suffix (81)

Pattern: `<Td className="text-claimondo-ondo!">` — Caller-Override mit Token. Kein „Override gegen Token", sondern „Override gegen DataTable-Default mit Token". **Legitim**, könnte aber durch saubere DataTable-Defaults reduziert werden (eigener Refactor).

### Empfehlung — STATUS (13.05.2026 Abend)

**Phase 1 ✅ DONE** — PR #992 (Token-Sweep 745e+f, 327 Verstöße, violet/rose/purple/indigo + Hex-1:1).

**Phase 2 ✅ DONE** — PR #1005 (Inline-Style → `var(--brand-*, #fallback)`, 65 Stellen) + PR #1012 (undefinierte Brand-Vars + Status-Soft-Varianten) + PR #1016 (Token-Audit-Skip-Header an 15 Skip-Files).

**Phase 3 ✅ DONE** — PR #1025 (Drift-Bremse `check:token-audit` + 10 verbleibende Hex-Reste) + PR #1030 (CI-Wire + AGENTS.md §branding-rules-Doku-Erweiterung).

**Endzustand:**
- `npm run check:token-audit` → ✓ 1613 Files, 0 Verstöße
- CI-erzwungen ab Merge PR #1030 (vor Build)
- 35 dokumentierte Brand-Hex-Ausnahmen in `src/lib/external-brand-colors.ts`
- 17 `// Token-Audit-Skip:`-Header für legitime Ausnahmen (Email/PDF/Error-Boundary/Mapbox/SVG-Replikat)
- Theme-System um `success-soft`/`warning-soft`/`danger-soft` Vars erweitert

**Important-Suffix-Refactor (81 Stellen)** — NICHT angefasst, da legit Tailwind-v4-Override-Pattern mit Token-Werten. AGENTS.md §komponenten-set dokumentiert es als bewussten DataTable-Caller-Override. Eigener Refactor wäre ergonomisch (DataTable-Default-Tuning) aber nicht Token-Compliance.
