# Design: Komponenten-Set — Drift-Bremse mit Zähnen (Phase 2)

**Datum:** 2026-05-28
**Status:** Design freigegeben (Aaron), bereit für Implementierungs-Plan
**Branch:** `kitta/aar-component-set-ratchet`
**Vorgeschichte:** Phase 1 = `docs/superpowers/plans/2026-05-12-frontend-konsolidierung-phase-1.md` (hat primitives/*, shared/StatCard+SectionCard+forms, und `scripts/check-component-set.mjs` als `--warn`-Drift-Bremse angelegt).

## 1 · Problem

Die 3-Schicht-Komponenten-Policy (AGENTS.md §claimondo-component-set) ist gut begründet, aber **gewinnt nicht**:

- **~9 % Adoption** der Layer-1-Atoms (`@/components/primitives/*`, 72 Importer). Die 13 Atoms existieren (Badge, Box, Button, Card, CloseButton, Drawer, DropletBadge, Icon, Input, Modal, Row, Stack, Text) — die Schicht ist also da.
- **Handgerolltes Tailwind ist der De-facto-Default:** 135 Files mit handgerollten Buttons, 85 mit handgerollten Cards, 75 mit inline `backdrop-blur` (vs. 9 GlassPanel-Importer). (Quelle: `docs/28.05.2026/frontend-hygiene-audit-2026-05-28.md`.)
- **Die Regel hat keine Zähne:** `scripts/check-component-set.mjs` existiert, läuft aber `--warn` (immer `exit 0`) und ist **nicht** in `.github/workflows/ci.yml` verdrahtet (nur `check:token-audit` gatet). Es gibt keine Baseline, keinen Ratchet.
- **Die Primitive-API hat echte Reibung** (Mit-Ursache der 9 %): `Button` hat **kein `loading`**, **keinen focus-visible-Ring (a11y)**, und nutzt `onPress`/`tone` (React-Native-Sprech) statt des Web-/Industrie-Standards `onClick`/`variant`. Für Web-Devs fremd → handrollen ist der Pfad des geringsten Widerstands.

**Kernursache:** Es ist heute *leichter*, einen Button handzurollen, als das Primitive zu nutzen — und nichts hält einen davon ab. Man fixt 9 % nicht, indem man 220 Files umbaut, sondern indem man (a) die Blutung stoppt und (b) das Primitive zum leichtesten Weg macht.

## 2 · Ziel & bestätigte Annahme

**Mobile-Annahme (von Aaron bestätigt):** Die React-Native-App kommt und soll **dasselbe Design teilen** (web↔native), native darf nur polieren. → Der dual-file-Ansatz (`*.web.tsx` + `*.native.tsx`, gebunden an `design-tokens.ts`) ist damit **architektonisch korrekt**. Wir bauen die Schicht *nicht* um — wir machen sie durchsetzbar und ergonomisch.

**Ziel:** Aus der 9-%-Wunschregel einen Standard mit Zähnen machen, ohne den Repo (11 parallele Sessions) anzuzünden. Adoption steigt monoton, kollisionsfrei.

## 3 · Entscheidungen (recorded)

- **D1 — API-Namen:** `onClick`/`variant` werden **kanonisch** (Web-/Industrie-Standard; ~800 handrolled `<button onClick>` sprechen ihn eh). `onPress`/`tone` bleiben **nur als `@deprecated`-Übergangs-Aliase** und werden nach dem Codemod **entfernt**. → Option-1-Sicherheit auf dem Weg, Option-3-Sauberkeit am Ziel. *Faustregel: Aliase als Brücke mit Ablaufdatum, nie als Ziel.*
- **D2 — Ratchet-Granularität:** Baseline = **Menge der heute verletzenden Files** (nicht nur eine Zahl). Neues verletzendes File → CI rot. Verhindert „einen fixen, woanders neuen bauen".
- **D3 — Lokal vs. CI:** Lokal bleibt `--warn` (exit 0, Dev-Ergonomie). CI nutzt `--ratchet` (exit 1 bei Neu-Verstoß) — analog zur Rolle von `check:token-audit`.

## 4 · Architektur

### Teil A — Ratchet (der eigentliche Unlock, kollisionsfrei)
`scripts/check-component-set.mjs` erweitern (Muster bleiben unverändert):
- **`scripts/component-set-baseline.json`** — committet: `{ "generatedAt": ISO, "count": N, "files": [relPath, …] }`.
- **Modi:**
  - *(kein Flag)* = heutiges `--warn`: listet Verdachts-Files, `exit 0`.
  - `--ratchet` = vergleicht aktuelle Verletzer-Menge mit `baseline.files`. Jedes File **nicht** in der Baseline → `exit 1` (mit Diff-Ausgabe). Baseline-Files, die jetzt sauber sind → Hinweis „Ratchet kann gesenkt werden".
  - `--update-baseline` = schreibt die Baseline auf die aktuelle Menge neu (nach Migrations-PRs).
- **CI:** Step in `.github/workflows/ci.yml` nach dem token-audit-Step: `npm run check:component-set -- --ratchet`.
- **Touch-Surface:** nur `scripts/` + `ci.yml` + `baseline.json`. **Null App-File-Kollision** mit den 11 Sessions — außer jemand baut NEU handrolled. Genau das ist gewollt.

*Bewusster Tradeoff:* File-Set-Granularität ignoriert Mehr-Verstöße in bereits gelisteten Files. Akzeptabel (Boy-Scout drückt sie eh runter); spätere Verschärfung auf per-File-Count möglich, YAGNI für jetzt.

### Teil B — Reibung killen (in `primitives/`, kalt)
- **Button:**
  - `onClick`/`variant` als kanonische Props; `onPress`/`tone` als `@deprecated`-Aliase in `Button.types.ts` (JSDoc `@deprecated`), beide gemappt in `Button.web.tsx` + `Button.native.tsx`.
  - **`loading`-Prop** (Spinner + auto-disabled) — konsolidiert `ui/loading-button`.
  - **focus-visible-Ring** (a11y) zentral — schließt die im Audit gefundene Lücke.
- **Card:** API gegen die häufigsten handgerollten SectionCard-Formen prüfen, Lücken schließen (sonst bleibt handrollen nötig).
- *Kein* Umbau der `tone`-Werte (navy/ondo → primary/secondary) — separater optionaler Cleanup, hier out of scope.

### Teil C — Migration (graduell, kollisions-bewusst)
- **Boy-Scout-Regel** (AGENTS.md): File angefasst → seine Buttons/Cards aufs Primitive ziehen + via `--update-baseline` aus der Baseline streichen.
- **Codemod (nur Rename):** `onPress→onClick`, `tone→variant` über die 72 Bestandsnutzer. Sicherste Codemod-Art (mechanisch, kein Varianten-Raten); `tsc` fängt jeden Rest; `@deprecated`-Aliase puffern übersehene Stellen. **Gestaffelt nach Datei-Temperatur** — heiße Portale (gutachter/kunde/dispatch/consent/i18n) zuletzt, wenn die Sessions gelandet sind.
- **Kalte-Cluster-PRs:** kleine, reviewbare PRs für Files, die keine aktive Session anfasst — Start: die 5 Admin-Table-Widgets (`admin/statistiken/StatistikenClient`, `admin/partner/waitlist/WaitlistTable`, `admin/_components/StripeConnectStatusWidget` / `LeadPreiseVerteilungWidget` / `AusstehendeZahlungenTable`) auf `shared/DataTable`. Jeder PR senkt die Baseline.
- **Fortschrittsmetrik:** `baseline.count` über Zeit (monoton fallend).

### Teil D — AGENTS.md
- Dokumentieren: CI blockt jetzt **neue** Verstöße (Ratchet), `onClick`/`variant` kanonisch, `onPress`/`tone` deprecated.
- Klarstellen (unverändert): Layout-Tailwind auf Wrappern (`flex`/`grid`/`gap`/`px`/`mt`) bleibt erlaubt — die Regel betrifft *Komponenten* (Button/Card/Table/Badge/Modal), nicht Spacing.
- Verweis auf dieses Design als Phase 2.

## 5 · Reihenfolge
1. **Teil A** (Ratchet + Baseline + CI) — sofortiger Win, null Kollision.
2. **Teil B** (Button `loading`/focus-ring/Alias-Props, Card-API).
3. **Teil D** (AGENTS.md).
4. **Teil C** (Rename-Codemod + laufende Cold-Cluster-PRs) — fortlaufend.

## 6 · Non-Goals (YAGNI)
- Kein Big-Bang-Codemod der Styling-Migration (Varianten-Inferenz unzuverlässig, kollidiert mit 11 Sessions).
- Keine cva/tailwind-variants-Recipes als Strategie — bricht das web↔native-Ziel (Klassen laufen nicht in RN).
- Kein Anfassen heißer Portal-Files in dieser Phase.
- Kein Umbenennen der `tone`-Farbwerte.

## 7 · Risiken & Mitigation
- **Rename-Codemod trifft heiße Files** → nach Temperatur staffeln; `@deprecated`-Aliase verhindern Breakage bei übersehenen Stellen; `tsc` als Netz.
- **Baseline-Gaming** → File-Set-Ratchet (D2).
- **Adoptions-Stillstand** → Reibung (Teil B) ist der Hebel; ohne sie bleibt handrollen attraktiv.
- **CI-Performance** → Script nutzt `git ls-files` + Regex, läuft in Sekunden (wie token-audit).

## 8 · Definition of Done (Phase 2)
- `check:component-set -- --ratchet` gatet in CI; Baseline committet.
- Button: `loading` + focus-ring + `onClick`/`variant` kanonisch (Aliase `@deprecated`).
- 72 Bestandsnutzer per Codemod auf `onClick`/`variant`; Aliase entfernbar (Folge-Ticket, sobald 0 Nutzer).
- AGENTS.md aktualisiert.
- Mind. die 5 Admin-Tabellen migriert; Baseline gesunken.
