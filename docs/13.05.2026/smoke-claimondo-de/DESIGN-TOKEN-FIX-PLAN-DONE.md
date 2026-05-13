# Design-Token-Fix-Plan — Claimondo — 13.05.2026

Quelle: Audit-Funde aus `AUDIT.md` (statisch) + `aar-745c-color-tokens-app.mjs`-Dry-Run.
Tokens: `src/lib/design-tokens.ts`. Policy: `AGENTS.md §claimondo-component-set`.

Der existierende Sweep `scripts/aar-745b-color-tokens.mjs` läuft **nur über `src/components/shared/`** — die Portal-Verstöße in `src/app/**` und `src/components/{admin,kunde,gutachter,landing,claims,kb,sv}/**` werden gar nicht erfasst. **Das ist der blinde Fleck, den die Audit-Funde sichtbar gemacht haben.**

---

## Phasen, in Aufwand-pro-Win-Reihenfolge

### Phase 1 — Sweep auf `src/app/**` und `src/components/**` (1 PR, ~30 Min Review)

**Was:** Neues Skript `scripts/aar-745c-color-tokens-app.mjs` (gleiches Mapping wie `b`, breiterer Scope, skipt `src/components/ui/` (shadcn) und `GlassPanel.tsx`).

**Dry-Run-Ergebnis:** **42 Files, 129 Replacements** ohne manuelle Eingriffe.

**Top-10 betroffene Files (Hit-Count):**

| Hits | File |
|---|---|
| 20 | `src/components/landing/HauptseiteClient.tsx` |
| 14 | `src/app/dispatch/gutachter-finder/GutachterFinderUebersichtClient.tsx` |
| 13 | `src/app/dispatch/gutachter-finder/[id]/GutachterFinderDetailClient.tsx` |
| 12 | `src/app/dispatch/leads/[id]/SvKalenderVergleichModal.tsx` |
| 6 | `src/app/admin/finance/(hub)/page.tsx` |
| 5 | `src/app/gutachter/feldmodus/NaviHud.tsx` |
| 4 | `src/app/admin/tasks/KanbanBoard.tsx` |
| 4 | `src/components/kunde/FallStatusCard.tsx` |
| 3 | `src/app/admin/faelle/(hub)/FaelleKanban.tsx` |
| 3 | `src/app/gutachter/profil/ProfilClient.tsx` |

**Entscheidung gebraucht:** `HauptseiteClient.tsx` ist Marketing-Hero. Gerade hier können „bewusste" Tailwind-Gradient-Töne legitim sein. Vor dem Lauf manuell prüfen, ob `HauptseiteClient` in die `SKIP_FILES`-Liste soll.

**Risiken:**
- Wenn ein File sowohl Claimondo-Tokens als auch Tailwind-Defaults nutzt und der File-Autor damit absichtlich differenziert hat, frisst der Sweep diese Differenzierung. **Mitigation:** PR mit Pixel-Diff-Smoke gegen Staging.
- `GutachterFinderUebersichtClient` + `Detail` (14+13 Hits) sind funktionale Listen-Views — der Sweep ist hier sicher.

**Empfohlene Reihenfolge:**
1. Dry-Run nochmal, `HauptseiteClient` in `SKIP_FILES` (Marketing) eintragen, Dry-Run wiederholen
2. Sweep ausführen, build + tsc grün?
3. PR aufmachen, mergen
4. Smoke gegen Staging laufen lassen (Re-Smoke-Skript existiert)

---

### Phase 2 — Tailwind-Tokens vollständig ausnutzen + Mass-Sweep

**Re-Befund nach tieferem Audit:** Tailwind v4 ist im Einsatz, kein `tailwind.config.ts` — Tokens sind via `@theme inline` in `src/app/globals.css`. Es existieren **bereits** die CSS-Vars:

```css
--shadow-claimondo-sm: 0 1px 2px rgba(13, 27, 62, 0.04), 0 1px 3px rgba(13, 27, 62, 0.06);
--shadow-claimondo-md: 0 4px 6px -1px rgba(13, 27, 62, 0.06), 0 2px 4px -2px rgba(13, 27, 62, 0.04);
--shadow-claimondo-lg: 0 10px 25px -5px rgba(13, 27, 62, 0.1), 0 8px 10px -6px rgba(13, 27, 62, 0.06);
```

Tailwind v4 generiert daraus automatisch `shadow-claimondo-sm/md/lg`-Utilities — **werden aber nur an 13 Stellen genutzt** (5+3+5 Vorkommen, immer via Umweg `shadow-[var(--shadow-claimondo-md)]`). Der Rest schreibt inline.

**Was fehlt strukturell:**
1. `--radius-claimondo-sm/md/lg` Vars (Tokens existieren in TS, aber nicht als CSS-Var)
2. `--radius-claimondo-sheet` für die 6× `rounded-[36px]`-Sheets
3. Semantische Shadow-Tokens für die wiederkehrenden Spezial-Pattern (siehe unten)

**Empirische Top-Pattern (echte Häufigkeit aus `grep | sort | uniq -c`):**

| Hits | Pattern | Vorgeschlagener Token |
|---|---|---|
| **31×** | `shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)]` | `shadow-claimondo-md` (Approximation) |
| **24×** | `shadow-[0_0_0_4px_rgba(69,115,162,.12)]` (Focus-Ring) | **NEU** `--shadow-focus-ondo` → `shadow-focus-ondo` |
| **20×** | `shadow-[0_4px_12px_rgba(69,115,162,.30),0_1px_2px_rgba(69,115,162,.18)]` (Ondo-Button) | **NEU** `--shadow-cta-ondo` |
| **15×** | `shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)]` (Sheet) | **NEU** `--shadow-sheet` |
| **13×** | `shadow-[0_4px_20px_rgba(13,27,62,0.06)]` (Glass-Card) | **NEU** `--shadow-glass-card` |
| **10×** | `shadow-[0_8px_28px_rgba(69,115,162,0.45)]` (CTA-Button) | gleich wie 20× → `shadow-cta-ondo` |
| **9×** | `shadow-[0_2px_12px_rgba(13,27,62,0.06)]` (Marketing-Pill) | **NEU** `--shadow-glass-pill` |
| **7×** | `shadow-[0_8px_22px_rgba(69,115,162,.36),0_2px_4px_rgba(69,115,162,.20)]` (Ondo-Button-Hover) | `--shadow-cta-ondo-hover` |
| **8×** | `rounded-[14px]` | `rounded-claimondo-md` (NEU) |
| **6×** | `rounded-[36px]` | `rounded-claimondo-sheet` (NEU) |
| **4×** | `rounded-[18px]` (KbChat-Bubbles) | dedizierter Chat-Token oder `rounded-2xl` |
| **2×** | `rounded-[22px]` | nicht extrahieren — Einzelfall |

**Konkret hinzufügen in `globals.css` `@theme inline`:**

```css
--radius-claimondo-sm: 8px;
--radius-claimondo-md: 14px;
--radius-claimondo-lg: 20px;
--radius-claimondo-sheet: 36px;

--shadow-focus-ondo: 0 0 0 4px rgba(69, 115, 162, 0.12);
--shadow-cta-ondo: 0 4px 12px rgba(69, 115, 162, 0.30), 0 1px 2px rgba(69, 115, 162, 0.18);
--shadow-cta-ondo-hover: 0 8px 22px rgba(69, 115, 162, 0.36), 0 2px 4px rgba(69, 115, 162, 0.20);
--shadow-sheet: 0 6px 18px rgba(15, 30, 68, 0.07), 0 24px 48px rgba(15, 30, 68, 0.06);
--shadow-glass-card: 0 4px 20px rgba(13, 27, 62, 0.06);
--shadow-glass-pill: 0 2px 12px rgba(13, 27, 62, 0.06);
```

Tailwind v4 generiert daraus automatisch die Utilities. Danach Sweep-Skript `aar-745d-shadow-radius-sweep.mjs` mit obigem Mapping. **~120-140 Inline-Pattern werden zu Token-Klassen.**

**Mass-Sweep für die häufigsten Inline-Shadow-Pattern:**

| Inline-Pattern | Token-Ersatz |
|---|---|
| `shadow-[0_1px_2px_rgba(13,27,62,0.04),0_1px_3px_rgba(13,27,62,0.06)]` | `shadow-claimondo-sm` |
| `shadow-[0_4px_6px_-1px_rgba(13,27,62,0.06),0_2px_4px_-2px_rgba(13,27,62,0.04)]` | `shadow-claimondo-md` |
| `shadow-[0_10px_25px_-5px_rgba(13,27,62,0.1),0_8px_10px_-6px_rgba(13,27,62,0.06)]` | `shadow-claimondo-lg` |
| `shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)]` | **Approximation auf** `shadow-claimondo-md` |
| `shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)]` | **Approximation auf** `shadow-claimondo-lg` |
| `rounded-[14px]` | `rounded-claimondo-md` |
| `rounded-[20px]` | `rounded-claimondo-lg` |
| `rounded-[8px]` | `rounded-claimondo-sm` |

**Sonderfall `rounded-[36px]`:** wird 7× in Sheet-/Modal-Containers benutzt (`upload/dokumente`, `kunde/termin`, `flow/FlowWizardKfz`, `schaden-melden/selbstverschulden`). Das ist 16px über dem `lg`-Token. **Zwei Optionen:**
- (A) Neuen Token `radius.sheet = 36` einführen → `rounded-claimondo-sheet`
- (B) Auf `radius.lg = 20` runterziehen → schmalere Sheets, einheitlicher

Empfehlung: **(A)** — die Sheet-Größe ist visuell etabliert, abrupte Verkleinerung ändert das Look-and-Feel auf 5+ Pages.

**Aufwand:** Token-Erweiterung 15 Min, Sweep-Skript 30 Min, manuelle Review der Approximations-Mappings.

---

**Re-Befund:** `src/components/primitives/Input.*` und `src/components/shared/SheetCard.tsx` existieren **NOCH NICHT** — Phase 3 + 4 sind also keine „Adoption", sondern echte Neu-Komponenten.

---

### Phase 3 — `<SheetCard>` als neue Shared-Component (~1 Tag)

5+ Stellen reproduzieren das gleiche „Sheet"-Pattern:

```tsx
<div className="rounded-[36px] bg-white p-10 shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)] animate-[sheetIn_.42s_cubic-bezier(.16,1,.3,1)_both]">
```

Vorkommen:
- `src/app/upload/dokumente/[token]/page.tsx` (2×)
- `src/app/schaden-melden/selbstverschulden/page.tsx`
- `src/app/kunde/termin/[token]/page.tsx` (2×)
- `src/app/flow/[token]/FlowWizardKfz.tsx`

Component-Extract nach `src/components/shared/SheetCard.tsx` mit Props `padding="sm" | "md" | "lg"`. Spart Code + zementiert das Pattern.

---

### Phase 4 — `primitives.Input` neu anlegen (Liquid-Glass-Input-Style) (~½ Tag)

Wiederholtes Input-Pattern in 4 Stellen (`FlowWizardKfz`, `FaelleFilterBar`, `ReklamationenClient` 3×):

```tsx
className="w-full rounded-[14px] border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy tracking-[-.005em] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-[0_0_0_4px_rgba(69,115,162,.12)] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
```

Das ist der Liquid-Glass-Inputstil. Gehört nach `src/components/primitives/Input.web.tsx` + `Input.native.tsx` (Atom-Layer-Pflicht laut AGENTS.md). Wenn `primitives/Input` schon existiert, eintauschen und die 4 Vorkommen migrieren.

---

### Phase 5 — Naked-Empty-States adoptieren (~½ Tag)

7 Stellen in `src/app/dispatch/` haben Inline-Texte ohne `<EmptyState>`-Component:

- `dispatch/dashboard/page.tsx` (4×)
- `dispatch/kalender/KalenderClient.tsx`
- `dispatch/leads/_components/LeadsViewToggle.tsx` (4×)
- `dispatch/rueckrufe/page.tsx`
- `dispatch/sachverstaendige/[id]/page.tsx`
- `dispatch/leads/[id]/SvDispatchPanel.tsx`
- `dispatch/isochrone/IsochroneClient.tsx`

`<EmptyState>` aus `src/components/shared/EmptyState.tsx` ist da, hat Icon + Headline + Sub-Text + optionalen CTA. Migration ist mechanisch.

---

### Phase 6 — GutachterFinder-Spezial-Review (~½ Tag)

Die zwei GutachterFinder-Files (`Uebersicht` 14 Hits + `Detail` 13 Hits) sind nach Phase 1 noch nicht ganz sauber:
- Einzelne `bg-blue-100 text-blue-700`-Status-Pills brauchen evtl. den semantischen `info`-Token statt navy/ondo
- Spacing + Card-Layout sollten gegen `shared/SectionCard` geprüft werden (kein `shadow-[…]`-Inline mehr)

Nach Phase 1+2 reviewen, gezielt nachbessern.

---

## Phase-Zusammenfassung

| # | Was | Aufwand | Hits weg | Priorität |
|---|---|---|---|---|
| 1 | Sweep auf `src/app/` + `src/components/` | 30 Min | ~129 Farb-Verstöße | **P1** |
| 2 | Tailwind-Aliase + Shadow/Radius-Sweep | 1-2 h | ~143 + 19 = 162 | **P1** |
| 3 | `SheetCard`-Extract | 1 Tag | 7 Duplikat-Blocks | P2 |
| 4 | `primitives.Input`-Adoption | ½ Tag | 4 Duplikat-Blocks | P2 |
| 5 | EmptyState-Adoption Dispatch | ½ Tag | 7 Naked-States | P2 |
| 6 | GutachterFinder-Polish | ½ Tag | Rest-Verstöße | P3 |

**Geschätzte Reduktion:** ~300 hardcoded Token-Verstöße → < 30 berechtigte Ausnahmen.

---

## Vorgeschlagene PR-Sequenz

1. **PR `kitta/aar-745c-tokens-app-sweep`** — Phase 1 (Sweep, breit, niedrig-Risiko)
2. **PR `kitta/aar-745d-shadow-radius-tokens`** — Phase 2 (Tailwind-Aliase + Shadow/Radius-Sweep)
3. **PR `kitta/aar-shared-sheet-card`** — Phase 3 (Component-Extract)
4. **PR `kitta/aar-primitives-input-adoption`** — Phase 4
5. **PR `kitta/aar-dispatch-empty-states`** — Phase 5
6. **PR `kitta/aar-gutachter-finder-polish`** — Phase 6

Jede PR isoliert smokebar, mit Re-Smoke-Skript verifizierbar.
