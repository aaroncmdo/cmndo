# Token- & Design-Konsistenz — Gesamt-Audit über alle Portale

**Datum:** 2026-06-10
**Scope:** admin · dispatch · gutachter · kunde · makler · kanzlei · mitarbeiter · sv · auth · shared-components
**Methode:** 6 parallele Read-only-Auditoren (ein Cluster pro Portal) + Abgleich gegen Maschinen-Baselines (`check:token-audit`, `check:component-set`).
**Status der Foundation:** #2618 (Token-Foundation + Status-Ratchet) + #2623 (FlowLink-Polish, gestackt) sind die bereits gebaute Antwort auf die hier quantifizierten Muster.

---

## 1 · Executive Summary

Die App hat **kein Hex-Problem** (`check:token-audit` = 0 Verstöße über 1840 Files) und eine **dominante Radius-Skala** (`rounded-ios-*`). Die Inkonsistenz liegt in **fünf systemischen Mustern**, die sich über *alle* Portale ziehen — keines ist portal-lokal:

1. **Raw Status-Scales** (`bg-green-50`/`text-emerald-600`/`text-red-500`/`bg-amber-100`) — **~3115 Vorkommen app-weit / 238 Files**. Das mit Abstand größte Muster. Tokens existieren seit #2618 (`bg-success`/`-soft`/`text-success-strong` + warning/danger/info), die Portale sind nur noch nicht migriert. **Das IST Phase B.**
2. **Whitelabel-Leaks via raw `rgba(...)`** — Marken-Töne hart in Gradients/Shadows/Wortmarken, die *nicht* rebranden. **Vom CI nicht gefangen** (der Audit prüft Hex, nicht rgba). Betrifft genau die kunden-/SV-sichtbaren Flächen. Gleiche Familie wie der Flow-Leak, der in #2623 schon gefixt ist.
3. **`text-[Npx]` Magic-Number-Typo** — **~780+ in den Portalen** (Tokens `text-caption`/`text-body-*` existieren, ungenutzt).
4. **Component-Set-Drift** — handgerollte Buttons/Cards/Tables statt `primitives/*` + `shared/*` (Baseline: 139 Files; dispatch ~0% Button-Adoption).
5. **A11y** — Icon-Buttons ohne `aria-label`, Error-Boxen ohne `role="alert"`, handgerollte Modals ohne Focus-Trap, Muted-Text an der AA-Grenze.

**Kern-Erkenntnis:** Das ist *eine* Strecke, nicht zehn. Der Hebel liegt in der **Shared-Layer** (`FallStatusBadge`, `BeratungModal`, `FallMitteilungenBanner`, `Modal`/`Button`-Primitive) — ein Fix dort kaskadiert in alle Portale.

---

## 2 · Portal-Health-Matrix

| Portal | Health | Dominantes Problem | Whitelabel? |
|---|---|---|---|
| **dispatch** | 4 / 10 | 538 Status-Scales (35 Files), ~166 handgerollte Buttons (0 `primitives.Button`), Modals ohne a11y | intern (N/A) |
| **kunde** | 4 / 10 | **3 rgba-Whitelabel-Leaks** (Gradients + Emerald-Shadow), 101 Status-Scales | **JA — Leaks blockieren** |
| **admin** | 4.5 / 10 | 289 Status-Scales (56 Files), 225 `text-[Npx]`, 10 Muted-Text AA-Fails | intern (N/A) |
| **kanzlei** | 5 / 10 | 14 Status-Scales, 31 `text-[Npx]`, 8 `rounded-2xl` (worst: abrechnung) | intern (N/A) |
| **shared-components** | 6.2 / 10 | **2 rgba-Whitelabel-Leaks** (BeratungModal/FallMitteilungenBanner), 61 Status-Scales in `FallStatusBadge`/`TimelineEventCard`/`PhaseStatusDot` | **JA — höchster Hebel** |
| **makler** | 6 / 10 | 21 Icon-Buttons ohne aria-label, 8 Status-Scales (Radii clean!) | JA (keine Leaks gefunden) |
| **gutachter** | 6.2 / 10 | **Wortmarke "Willkommen bei Claimondo"** + Shadow-rgba-Leaks, 182 Status-Scales, 303/308 Icons ohne aria-label | **JA — Leaks blockieren** |
| **mitarbeiter** | 7 / 10 | 6 Status-Scales (Priority-Badges), sonst sauber | intern (N/A) |
| **auth (login/passwort)** | 7 / 10 | 11 Status-Scales (Error-Boxen ohne `role="alert"`) | intern (N/A) |
| **sv** | 8 / 10 | 5 Status-Scales, 3 `rounded-2xl` — bestes Portal | kunden-sichtbar (keine Leaks) |

---

## 3 · Die fünf systemischen Muster (Cross-Cutting, gerankt)

### P0 — Muster 2: Whitelabel-Leaks via raw `rgba(...)` (CI-unsichtbar)

Branded SV-Kunden sehen an diesen Stellen **Claimondo-Farben statt SV-Brand**. Der `check:token-audit` prüft nur Hex (`#…`), **nicht** `rgba(...)` — diese Leaks rutschen durch CI.

| Datei | Zeile | Leak |
|---|---|---|
| `src/components/shared/glass/BeratungModal.tsx` | 74 | `rgba(13,27,62,.55)` (Navy-Backdrop, kein Fallback) — **über Portale konsumiert** |
| `src/components/shared/fall-mitteilungen/FallMitteilungenBanner.tsx` | 36 | `color: '#4573A2'` (Ondo, hart) — **über Portale konsumiert** |
| `src/app/kunde/termin/[token]/page.tsx` | 45, 65 | radial-gradient `rgba(123,163,204,.18)` + `rgba(69,115,162,.08)` |
| `src/app/kunde/termin/[token]/page.tsx` | 67 | `shadow-[0_8px_24px_rgba(52,199,89,.30)]` (Erfolg-Grün hart) |
| `src/app/kunde/onboarding-details/page.tsx` | 92-93 | gleicher Gradient-Leak |
| `src/app/gutachter/willkommen/WillkommenClient.tsx` | 465 | **Wortmarke** „Willkommen bei Claimondo" statt `{firmenname}` |
| `src/app/gutachter/heute/TagesrouteMap.tsx` | 453, 457 | `rgba(13,27,62,…)` in inline `boxShadow` |
| `src/app/gutachter/heute/TerminCard.tsx` | 79, 82 | `rgba(15,30,68,…)` Shadow |

**Rezept** (schon in #2623 für den Flow gelebt): `color-mix(in srgb, var(--brand-primary, #0D1B3E) 55%, transparent)` statt rohem rgba; Wortmarke → `{logoUrl ? <img/> : firmenname ? <span>{firmenname}</span> : <Claimondo/>}`.

### P0/P1 — Muster 1: Raw Status-Scales (~3115 app-weit)

| Portal | Vorkommen | Files | Worst File |
|---|---|---|---|
| dispatch | 538 | 35 | `DokumenteAnfordernCard.tsx` (32) |
| admin | 289 | 56 | `abrechnungen/AbrechnungenListClient.tsx` |
| gutachter | 182 | 52 | `heute/TagesrouteSidebar.tsx` (11) |
| kunde | 101 | 19 | `onboarding/OnboardingWizard.tsx` (14) |
| shared | 61 | — | `FallStatusBadge` (FALL_STATUS_COLORS-Map) |
| b2b/rest | ~43 | — | `kanzlei/abrechnung/page.tsx` |

Tokens existieren (#2618). Der **Status-Ratchet** (Baseline 3115) blockt bereits *neue* — die Migration des Bestands ist Boy-Scout/wellenweise. **Nicht blind sweepen** (s. Caveats).

### P1 — Muster 4: Component-Set-Drift (Baseline 139 Files)

- **dispatch:** ~166 handgerollte `<button>`, **0** `primitives.Button` — der größte Einzelhebel.
- **admin:** 17 Files mit handgerollten Card-`<div>` statt `SectionCard`.
- **gutachter:** 44 Button- + 12 Card-Handrolls; `abrechnung` baut `<table>` statt `shared/DataTable`.
- **kunde:** `OnboardingWizard` CTAs handgerollt.

### P1/P2 — Muster 5: A11y

- **Icon-Buttons ohne `aria-label`:** gutachter **303/308 Icons**, makler 21, kanzlei 2.
- **Error-Boxen ohne `role="alert"`/`aria-live`:** `login/LoginClient.tsx` (224/251/288), `2fa`, `passwort-aendern`.
- **Handgerollte Modals ohne Focus-Trap:** dispatch `SpontanTerminModal`/`SvKalenderVergleichModal`, gutachter `feldmodus` Bottom-Sheet.
- **Muted-Text an AA-Grenze:** `text-claimondo-ondo/60`-`/70` (admin 10, dispatch 142) — bei Small-Text < 4.5:1.

### P2 — Muster 3: `text-[Npx]` + Restradien

- `text-[Npx]`: shared 260, dispatch 251, admin 225, kanzlei 31, kunde 15.
- Default-Radien `rounded-{2xl,3xl}`: kanzlei 8, kunde ~22, sv 3 + **`Modal.web.tsx`** (`rounded-2xl` statt `rounded-ios-*` — bestätigt offen aus #2618).

---

## 4 · Höchster Hebel: die Shared-Layer zuerst

Ein Fix hier kaskadiert in alle Portale. Reihenfolge nach Konsumenten-Zahl:

1. **`FallStatusBadge.tsx`** — von 40+ Pages konsumiert; Status-Farben aus lokaler Map auf Tokens ziehen.
2. **`glass/BeratungModal.tsx` + `fall-mitteilungen/FallMitteilungenBanner.tsx`** — die 2 Whitelabel-P0-Leaks.
3. **`claims/timeline/TimelineEventCard.tsx`** (TONE_BG-Map) + **`fall-phases/PhaseStatusDot.tsx`** (`bg-emerald-500`/`bg-red-500`).
4. **`primitives/Modal.web.tsx`** — Radius auf `rounded-ios-lg/xl`. (**Verifizieren:** `primitives/Button.web.tsx`-Radius — Auditor meldete inline 8/12/16/20px; vor Fix kurz gegen `tokens.radius` gegenlesen.)
5. **Icon-Buttons in shared** (`PhoneButton`, `TasksPill`, …) — `ariaLabel`-Prop durchziehen.

**CI-Lücke schließen:** `check:token-audit` um eine Regel für raw `rgba(...)` mit Marken-Tönen in inline-Styles erweitern (mind. die bekannten Tripel `13,27,62` / `69,115,162` / `123,163,204`), sonst regressieren die P0-Leaks ungebremst.

---

## 5 · Was bereits gebaut ist

- **#2618 (Token-Foundation, Basis):** semantische Tokens (`bg-success`/`-soft`/`text-success-strong` + warning/danger/info), Typo-Tokens (`text-caption`/`text-body-*`/`text-heading-*`), Radius-Konsolidierung (`--radius-claimondo-*` retired → `rounded-ios-*`), **Status-Ratchet** (stoppt neue Verstöße), AGENTS.md. + 9-File Flow-Pilot.
- **#2623 (FlowLink-Polish, gestackt auf #2618):** fixt im Flow *jedes* der fünf Muster → dient als **Migrations-Rezept** für die Portale (Status-Box-Recipe, Ambient-color-mix rebrand-safe, ondo-Primär, SA-Modal Focus-Trap, Kontrast-AA, Signatur-Whitelabel).

→ Die Foundation steht. Was bleibt, ist die **wellenweise Anwendung des Rezepts** auf die Portale.

---

## 6 · Empfohlene Remediation-Reihenfolge

| Welle | Inhalt | Warum zuerst |
|---|---|---|
| **P0 (sofort)** | 8 Whitelabel-rgba-Leaks (shared 2 + kunde 3 + gutachter Wortmarke+2 Shadows) **+ CI-Regel raw-rgba** | Kleine Fläche, branded Kunden *jetzt* betroffen, CI fängt es nicht |
| **Welle 1 (P1)** | Shared-Layer Status-Migration (FallStatusBadge/StatusBadge/TimelineEventCard/PhaseStatusDot), dann Portale worst-first: dispatch → admin → gutachter → kunde → b2b | Kaskadiert; Ratchet hält den Bestand schon eingefroren |
| **Welle 2 (P2)** | `text-[Npx]`→Typo-Tokens, Restradien (Modal.web + kanzlei/kunde/sv), Component-Set Boy-Scout (dispatch Buttons→`primitives.Button`) | Größter Einzel-Konsistenz-Gewinn nach Status |
| **Welle 3 (P3)** | A11y-Sweep: `aria-label` (gutachter/makler Icons), `role="alert"` (auth), Focus-Traps (dispatch/gutachter-Modals) | Korrektheit, kein visueller Drift |

---

## 7 · Caveats — vor dem Handeln prüfen

- **Hex ist CI-sauber** (0/1840). Die „Hex"-Treffer der Auditoren sind durchweg whitelisted Externals (WhatsApp `#25D366`, LinkedIn `#0A66C2`), `var(--brand-*, #fallback)` (erlaubt) oder skip-headered (`StatistikenClient`-Charts). **Keine** echten Verstöße. Das reale ungefangene Risiko ist **rgba**, nicht Hex.
- **Data-Viz nicht migrieren:** `StatistikenClient`-Chart-Palette, `PerformanceClient` `text-amber-400` sind legitime Nicht-Status-Farben → Skip-Header, *nicht* auf Status-Tokens ziehen.
- **Status-Scales nicht blind sweepen:** WhatsApp-Kanal-Grün, Verifizierungs-/Trust-Badges (`text-emerald-600` für „verifiziert"), echtes Material-Grün sind gewollt (AGENTS.md §branding-rules). Kuratierte Migration, kein Regex-Replace über alle 3115 Vorkommen.
- **Zahlen sind grep-basiert (±10%, direktional).** Das *Ranking* (dispatch worst, shared höchster Hebel, kunde+gutachter Whitelabel-kritisch) ist robust; einzelne Counts nicht auf die Eins nehmen.
- **Primitive-Radius-Claims gegenlesen:** `Modal.web` `rounded-2xl` ist bestätigt offen; `Button.web` (8/12/16/20px-Meldung) vor Fix kurz gegen `tokens.radius` verifizieren.
