# Web ↔ Native Primitive-Drift Audit

**Datum:** 2026-05-12
**Scope:** Konsistenz aller Dual-File-Primitives in `src/components/primitives/` (AAR-769 Design-System)
**Methodik:** 1 Subagent gegen alle 12 Web/Native-Paare + Token-Konsistenz-Check

---

## TL;DR

🟢 **Sauber.** Alle 12 Primitives sind in beiden Plattformen (Web + Native) vorhanden, nutzen die zentralen Design-Tokens, und haben identische Public-APIs. Drift ist **plattformgerecht** (RN ≠ DOM) und in keinem Fall ein Bug. Kein Showstopper für den Mobile-Launch.

| Metrik | Status |
|---|---|
| 12 Primitives, beide Plattformen | ✅ vollständig |
| Token-Konsistenz (`design-tokens.ts`) | ✅ stark |
| API-Drift (Props/Varianten) | 🟡 2 dokumentierbare Asymmetrien |
| Glass-Blur Native-Fallback | 🟡 Backlog (Mobile-Launch) |
| Hardcoded Werte | 🟡 minimal (Hover-States, rgba-Alphas) |

---

## Übersicht

| Primitive | Web L | Native L | API | Tokens | Notiz |
|---|---:|---:|---|---|---|
| Badge | 67 | 66 | identisch | OK | rgba-Alphas inline (identisch beidseits) |
| Box | 50 | 59 | identisch | OK | — |
| Button | 113 | 83 | identisch | OK | `DANGER_HOVER`/`SUCCESS_HOVER` Hex inline auf Web (Hover-only) |
| Card | 83 | 64 | identisch | OK | Backdrop-rgba inline |
| CloseButton | 44 | 55 | identisch | OK | — |
| Drawer | 76 | 52 | klein-drift | OK | `placement='bottom-sheet'` nur Web |
| DropletBadge | 43 | 35 | identisch | OK | — |
| Icon | 11 | 27 | identisch | OK | — |
| Modal | 94 | 54 | klein-drift | OK | `closeOnEsc` auf Native No-Op |
| Row | 38 | 35 | identisch | OK | — |
| Stack | 31 | 28 | identisch | OK | — |
| Text | 40 | 36 | identisch | OK | `as` auf Native ignoriert (kein DOM) |

---

## Stärken

### Token-Konsistenz ist stark
Alle 12 Primitives importieren aus `src/lib/design-tokens.ts`:
- `colors` (navy/ondo/shield/border/bg/white + semantic)
- `spacing` (4er-Basis)
- `radius` (sm/md/lg/full)
- `shadow` (Web) bzw. `shadowNative` (RN-Style)
- `typo` (7 Stufen)
- `glass` (light/dark mit bg/border/blur)

Keine Primitive nutzt Tailwind-Default-Farben (`bg-blue-100` etc.) — Single-Source-of-Truth-Disziplin sauber eingehalten.

### API-Symmetrie hoch
Props-Definitionen leben in `*.types.ts`-Sibling-Files und werden von beiden Plattformen importiert. Caller können dieselbe Component-Signature nutzen, die Bundle-Selektion erfolgt via Metro/Webpack-Platform-Suffix-Resolution.

### Plattform-gerechte Implementations-Details
- Web: Tailwind + inline-Styles + `createPortal` (Modal) / `backdropFilter` CSS (Glass)
- Native: `StyleSheet.create()` + `<RNModal>` + `Pressable`-States statt Hover
- Asymmetrien sind **intentional** und im Code teils kommentiert

---

## Drift-Punkte (3 — alle dokumentierbar, kein Bug)

### 1. `Modal.closeOnEsc` — Native ignoriert
- **Wo:** `Modal.native.tsx` — RNModal hat keinen Keyboard-Listener
- **Web:** registriert `document.addEventListener('keydown')`
- **Native:** Prop wird stillschweigend ignoriert (`// @ts-expect-error RN optional`)
- **Action:** In `Modal.types.ts` JSDoc-Kommentar ergänzen: `/** Web-only. On native, this prop has no effect. */`

### 2. `Drawer.placement='bottom-sheet'` — Native ohne Äquivalent
- **Wo:** `Drawer.web.tsx` nutzt Media-Query `md:items-center` (Desktop center, Mobile bottom)
- **Native:** kein Layout-Branching, Default-Slide-In von rechts
- **Action:** Entweder Native auf `placement` reagieren lassen (UIM-Sheets-Pattern via `react-native-bottom-sheet`) oder API-Doc-Hinweis "native: defaults to right-slide"

### 3. Glass-Blur Native-Fallback
- **Wo:** Native hat kein eingebautes Backdrop-Blur
- **Aktuell:** `Glass.native` rendert nur `rgba(255,255,255,0.85)`-Hintergrund, kein Blur
- **Action vor Mobile-Launch:** Entscheiden ob `@react-native-community/blur` oder `expo-blur` einsetzbar — und ob Glass-Optik essentiell oder akzeptabel-degraded ist

---

## Hardcoded-Werte (minimal — keine Drift-Gefahr)

### Hover-States (nur Web-relevant)
```tsx
// Button.web.tsx
const DANGER_HOVER = '#be123c'   // rose-700, nicht in tokens
const SUCCESS_HOVER = '#059669'  // emerald-600, nicht in tokens
```
**Bewertung:** Hover ist Web-Konzept, Native nutzt `Pressable`-States. Keine Drift-Möglichkeit, weil Native nie Hover hat.

### rgba-Alphas
- Badge: `'rgba(69, 115, 162, 0.12)'` (Ondo-Tint) — identisch in `.web` und `.native`
- Card: `'rgba(13, 27, 62, 0.22)'` Navy-Backdrop — identisch
- Modal: `'rgba(13, 27, 62, 0.22)'` Backdrop-Overlay — identisch

**Bewertung:** Werte sind manuell synchron. **Drift-Risiko niedrig** (selten geändert), aber als Convention-Item könnten Alphas in `tokens.glass.alphaLight/alphaDark` extrahiert werden.

---

## Empfehlung

**Aktuell keine Akut-Aktion.** Der Dual-File-Pattern ist diszipliniert umgesetzt, alle 12 Paare sind komplett, Token-Konsistenz ist solide.

**Vor Mobile-App-Launch (Backlog):**

1. **Drift-Dokumentation** in `Modal.types.ts` und `Drawer.types.ts` — JSDoc für die 2 Web-only Props (`closeOnEsc`, `placement='bottom-sheet'`). 30 Min.
2. **Glass-Blur Native-Plan** — Lib-Wahl `@react-native-community/blur` vs `expo-blur` + Bundle-Cost-Check. Spec separat.
3. **rgba-Alphas → Tokens** — `tokens.glass.alphaSoft = 0.12`, `alphaBackdrop = 0.22` als Konstanten in `design-tokens.ts` aufnehmen. Cleanup, ~1 h.
4. **Visual-Regression-Tests vor Mobile-Launch** — Screenshot-Diffs Web/Native pro Primitive auf gleichen Storybook-Stories. Eigenes Ticket.

---

## Nicht in diesem Audit

- **Higher-Order Components** (z.B. `PageHeader`, `Avatar`, `StatusBadge`) die auf Primitives aufbauen — eigene Drift-Wahrscheinlichkeit, eigener Audit-Scope
- **Form-Inputs** (TextField, Select, Checkbox) — bisher nur Web, kein Native-Pendant
- **Mapbox-Components** — Web-only, kein Native-Replacement (Mapbox-RN-SDK separat)
- **Touch-vs-Pointer-Events** — Web nutzt PointerEvents, Native Pressable. Werden über Wrapper-API abstrahiert, eigener Vergleich nicht in diesem Audit

---

## Anhang

- 1 Subagent-Audit gegen alle 12 Primitive-Paare
- AAR-769 Design-System (Single-Source-of-Truth in `src/lib/design-tokens.ts`)
- Cross-Reference: `dead-code-audit.md` — Knip hat alle 12 Native-Files als "unused" markiert (False-Positive, by-design — Mobile-App nicht live, Files-Vorbereitung im Repo gewollt)
