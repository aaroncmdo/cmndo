# P2-T4 — Stammdaten-Renderer-Konsolidierung (Schema + Admin-Edit)

**Datum:** 13.05.2026  
**PRs:** #861 (Plan, `f2355f58`) + #863 (Impl, `8d60f773`) — beide gemergt  
**Branches (gelöscht):** `kitta/aar-p2t4-plan`, `kitta/aar-p2t4-stammdaten`  
**Plan-Doc:** `docs/12.05.2026/FRONTEND/PLAN-frontend-konsolidierung-p2-t4-stammdaten.md`

## Ausgangslage

Vor P2-T4 waren die ~50 Fall-Stammdaten-Felder (Kunde / Fahrzeug / Halter / Schadensort/Unfall / Gegner / Vorschäden / Kernwerte / Besichtigung / Notizen) **drei- bis vierfach hand-codiert**:

1. `src/app/faelle/[id]/_stammdaten/Sections.tsx` — Admin-Inline-Edit (`InlineEditField` × ~30, mit lokalen `value=`-Ableitungen + `<div className="sm:col-span-2">`-Wrappern für Full-Width-Felder + `function f(fall,key)`-Helper).
2. `src/components/shared/stammdaten/StammdatenReadSection.tsx` — Read-Renderer für SV/Kunde/Makler.
3. `src/components/fall/StammdatenDetail.tsx` — CMM-32 Accordion-Detailpanel (eigene `str()`/`bool()`-Helper).
4. `src/components/kunde/ClaimSummary.tsx` + `gutachter/feldmodus/SvFallakteView.tsx` — bespoke Read-Layouts.
5. `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` (1645 LOC) — **Lead**-Felder + SA-Tool + Cardentity-Trigger.

Pflegekosten: jede Label-Änderung, jedes neue Feld, jeder Hint → mehrfach editieren. Bei jeder Übersicht: Risiko von Drift (z.B. „Schadensdatum" vs. „Schadens-Datum" vs. „Datum des Schadens").

## Was gebaut wurde (PR #863)

### T4.1 — `src/lib/stammdaten/schema.ts` + `shared/stammdaten/SchemaFields.tsx`

**`schema.ts`** — pure TS, keine React/Tailwind-Importe (analog `lib/statusLabels.ts`):

```ts
export type StammdatenBlock =
  | 'kunde' | 'fahrzeug' | 'halter' | 'unfall' | 'gegner'
  | 'vorschaeden' | 'kernwerte' | 'besichtigung' | 'nutzungsausfall' | 'notizen'

export type StammdatenFieldDef = {
  block: StammdatenBlock
  key: string          // = DB-Spaltenname = InlineEditField.fieldName
  label: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  hint?: string
  placeholder?: string
  transform?: (raw: string) => string
  fullWidth?: boolean  // ↔ <div className="sm:col-span-2"> im 2-Spalten-Grid
  getValue?: (fall, lead?) => string | number | null
  visibleWhen?: (fall) => boolean
}

export const STAMMDATEN_FIELD_SCHEMA: StammdatenFieldDef[] = [ /* ~63 Felder */ ]
export function fieldsForBlock(block): StammdatenFieldDef[]
export function fallToDisplay(v): string | number | null  // spiegelt das alte f() inkl. Boolean→'Ja'/'Nein'
```

Felder-Verteilung: kunde 8 · fahrzeug 14 · halter 10 · unfall 19 · gegner 8 · vorschaeden 3 · besichtigung 1 · kernwerte 5 · notizen 1 · nutzungsausfall 0 (custom-Toggle, kein `InlineEditField`). **1:1-Extraktion** aus `Sections.tsx` — gleiche Labels/Typen/Options/Hints, `getValue`-Closures spiegeln die alten `value={…}`-Ausdrücke (Fall→Lead-Fallbacks für `kunde_*`/`hsn`/`tsn`, Date-Slicing für `*_datum`, `werkstatt_seit_datum`, `gegner_versicherung_anfrage_datum`).

**`SchemaFields.tsx`** — `'use client'`, ~50 LOC: nimmt `{block, fall, lead}`, mappt `fieldsForBlock(block)` → `<InlineEditField>`, wendet `visibleWhen` an, ruft `getValue` (oder `fallToDisplay(fall[key])` als Default), wrappt `fullWidth: true`-Felder in `<div className="sm:col-span-2">`.

### Spec-Review-Loop (2 Fidelity-Fixes vor Merge)

1. **`fallToDisplay` initial gab Booleans roh zurück** → `InlineEditField` hätte `"true"`/`"false"` gerendert statt `"Ja"`/`"Nein"` (regression für `gegner_bekannt`, `hat_vorschaeden`, `fahrerflucht`, `auslandskennzeichen`, `vorsteuerabzugsberechtigt`, `ist_fahrzeughalter`). Fix: Booleans → `'Ja'`/`'Nein'`, spiegelt das alte `f()` exakt.
2. **`fullWidth`-Flag fehlte initial** → die `<div className="sm:col-span-2">`-Wrapper aus `Sections.tsx` (11 Felder: alle Textareas + `schadens_adresse` + `unfallort` + `gegner_name` + `besichtigungsort_adresse`) wären verloren gegangen → Textareas in einer Spalte gequetscht. Fix: `fullWidth?: boolean` aufs Schema + Wrap in `SchemaFields`.

### T4.2 — `Sections.tsx` → `<SchemaFields>`

8 Sections (Kunde / Fahrzeug+Halter / Unfall / Gegner / Vorschäden / Besichtigung / Kernwerte / Notizen) — hand-codierte `<InlineEditField>`-Listen durch `<SchemaFields block="…" fall={fall} lead={lead} />` ersetzt. **−147 / +16 Zeilen.** Optik + Edit-/Save-Verhalten identisch.

Unangetastet (bewusst):
- `function f(fall, key)` — wird von `VsStatusSection` weiter genutzt (5 Felder nicht im Schema).
- `NutzungsausfallSection` — custom Toggle-Buttons + Checkbox, kein `InlineEditField`.
- `ZeugenKontakteSection` — JSONB-Liste mit Add/Remove.
- `VsStatusSection` — 5 `<InlineEditField>` für VS-Regulierung (`kuerzungs_betrag`, `regulierung_betrag`, `vs_kuerzung_grund`, `nachbesichtigung_ergebnis`, `geschlossen_grund`) — eigene Domain, nicht im Stammdaten-Schema.
- `CardentityTypBButton`-Block + `VersicherungStammdaten`-Embed in `FahrzeugdatenSection`/`GegnerSection`.
- `FahrzeugdatenSection.fin` — bleibt als lokale Ableitung, weil `CardentityTypBButton` `finVorhanden={!!fin}` braucht.

`f()` + `InlineEditField`-Import bleiben deshalb deklariert.

## Was bewusst NICHT gemacht wurde (Plan T4.3–T4.6 nach Code-Review verworfen)

Der Plan-Doc enthielt T4.3–T4.6 als Optionen. Nach dem Lesen der konkreten Files:

- **T4.3 — `StammdatenReadSection` aufs Schema:** Dessen Layout ist **bewusst bespoke** — kuratierter Subset, kombinierte `KZ: <kz> · FIN: <fin>`-Zeile, fahrbereit/Leasing/Finanzierung-Badges, role-filtered (Kunde/Makler/SV), `FahrzeugRenderImage` statt `CarIcon`, Halter-Block nur bei `halter_ungleich_fahrer_flag`. Kein Feld-Listen-Renderer → Schema-Mapping wäre Indirektion **ohne** Entdopplung. Schema-Wert liegt im Edit-Pfad (T4.2 ✅).
- **T4.4 — `fall/StammdatenDetail.tsx`:** CMM-32 Accordion-Detailpanel mit Kategorien (`fahrzeug`/`unfall`/`historie`/`dokumente`/`kunde`). Eigene `str()`/`bool()`/`LACKFARBE_LABEL`-Aufrufe, bespoke Layout per Kategorie (FahrzeugRenderImage, Badges). Schema-Mapping würde nur die Plain-Key-Value-Teile betreffen — moderater Gewinn, deutliches Regressionsrisiko (SV-Fallakte ist Kern-Produktfläche).
- **T4.5 — `kunde/ClaimSummary.tsx`:** `ClaimSummary` ist die **Summary-Karte** im Kunde-Portal (753 LOC, Status-Banner + Termin + Doku + ein paar Kern-Stammdaten). `kunde/FallDetailSections.tsx` nutzt `StammdatenReadSection` **bereits** für die volle Stammdaten-Sicht. Die Summary-Karte zeigt absichtlich nur einen kuratierten Subset — Schema-Adoption würde sie umbauen, kein DRY-Win.
- **T4.6 — `gutachter/feldmodus/SvFallakteView.tsx`:** Feldmodus-cinematic-View (dark, GPS-aware, Offline-SW). Weißes `StammdatenReadSection`-Layout passt optisch nicht. Schema-`getValue` einzelner Felder zu nutzen ginge, aber `SvFallakteView` zeigt nur `fall.kennzeichen` inline → kein Mehrwert.
- **T4.7 — `Phase4Stammdaten.tsx` (1645 LOC, Lead-Felder + SA-Tool):** Eigener XL-Folge-Plan, wie im Plan-Doc vermerkt. Verlangt `LEAD_STAMMDATEN_SCHEMA` (oder `entity: 'fall' | 'lead'` aufs `StammdatenFieldDef`) + dedizierten Lead-Edit-Pfad. Risiko hoch (öffentlicher Dispatch-Lead-Flow), eigener Smoke nötig.

**Tatsächliche Adoption-Lage (Stand 13.05.2026):**
- `StammdatenReadSection` wird **bereits** konsumiert von: `gutachter/fall/[id]/_components/StammdatenCard.tsx` + `kunde/faelle/[id]/FallDetailSections.tsx`. SV-Desktop-Fallakte und Kunde-Fall-Detail-View sind also „durch".
- Verbleibende eigenständige Read-Layouts: `fall/StammdatenDetail` (SV-Accordion-Detailpanel), `kunde/ClaimSummary` (Summary-Karte, absichtlich anders), `gutachter/feldmodus/SvFallakteView` (cinematic).

## Audit (PR #863)

- **Build:** `npm run build` lokal grün (Linux GitHub-Build: `pass 5m36s`); `npx tsc --noEmit` grün
- **e2e:** `pass 2m3s` (testet Prod, nicht den PR — informativ)
- **UI-Erreichbarkeit:** keine Änderung — gleiche Felder in der Admin-Fallakte-Übersicht
- **Redundanz:** ENTDOPPELT — ~30 Feld-Definitionen aus `Sections.tsx` → eine Quelle (`lib/stammdaten/schema.ts`)
- **Dead-Code:** lokale `value`-Ableitungen (vorname/nachname/hsn/tsn etc.) entfernt; `f()`/`InlineEditField` bleiben (VsStatusSection nutzt sie)
- **Spec-Treue:** alle ~30 Schema-Felder 1:1 aus `Sections.tsx` extrahiert; `fallToDisplay` ↔ `f()` Behavior-äquivalent; `fullWidth` ↔ `<div className="sm:col-span-2">` 1:1 abgebildet
- **Inkonsistenz:** eine Quelle für Stammdaten-Feld-Metadaten; Umlaute überall korrekt (ä/ö/ü/ß)
- **Regression:** VsStatus / Nutzungsausfall / Zeugen / CardentityTypBButton / VersicherungStammdaten bewusst nicht angefasst — geprüft, intakt

## Smoke-Bedarf (vor Live-Stellung)

**Empfohlen (nicht durchgeführt — kein lokales Browser-Tooling):**

- Admin → Fallakte-Übersicht → Stammdaten-Tab. Pro Section visuell prüfen:
  - Alle Felder vorhanden, Reihenfolge identisch.
  - Textareas (Schadens-Ursache, Unfallhergang, Fahrzeugschaden, Drittschaden, Weitere Anmerkungen, Beschreibung, Notiz) volle Breite.
  - Adressen (Schadens-Adresse, Unfallort, Gegner Name, Besichtigungsort) volle Breite.
  - `gegner_bekannt`/`hat_vorschaeden`/`fahrerflucht`/`auslandskennzeichen`/`vorsteuerabzugsberechtigt`/`ist_fahrzeughalter` zeigen „Ja"/„Nein" (nicht „true"/„false").
  - Lackfarbe-Dropdown rendert 12 Optionen.
  - Date-Felder (Erstzulassung, Halter Geburtsdatum, Werkstatt seit, Schadensdatum, Grüne-Karte-Anfrage) zeigen `YYYY-MM-DD`.
  - Edit + Tab-out → Save-Spinner → Check-Häkchen → 2s → wieder neutral.
- Nicht-Schema-Sections weiter intakt: NutzungsausfallSection (Toggle-Buttons), ZeugenKontakteSection (Add/Remove), VsStatusSection (5 Felder), CardentityTypBButton in Fahrzeug-Block, VersicherungStammdaten-Embed in Gegner-Block.

## Folge-Backlog

Niedrige Priorität (Phase-2-Rest):

- **T4.4-T4.6 nachholen** falls Field-Label-Drift in den verbliebenen Read-Layouts auftritt — derzeit kein Pain-Signal.
- **T4.7 (`Phase4Stammdaten` schema-driven)** — wenn das nächste Dispatch-Lead-Feld dazu kommt und auffällt, dass es dreifach gepflegt werden muss.
- **`InlineEditField` nach `shared/stammdaten/` verschieben** — derzeit importiert `shared/stammdaten/SchemaFields.tsx` aus `@/app/faelle/[id]/_stammdaten/InlineEditField` (Dependency-Richtung unschön). Move + Re-Export am alten Pfad würde das aufräumen. ~30 Min.

## Lessons

1. **„Pure-Data-Schema + dünner Renderer" trägt nur den Edit-Pfad** — Read-Layouts sind oft kuratiert/bespoke, da bringt Schema-Mapping nichts (Indirektion ohne DRY).
2. **Boolean-Mapping immer prüfen.** `f()` mappte `true`→`'Ja'`; mein `fallToDisplay`-Erstwurf reichte den Boolean durch → `InlineEditField` hätte `"true"` gerendert. Subagent-Spec-Review hat's gefangen.
3. **`<div className="sm:col-span-2">`-Layout-Hints in einem Grid-Renderer extrahieren = explizites Schema-Flag** (`fullWidth`), nicht „CSS macht's schon". Sonst regressiert Textarea-Layout silently.
4. **Plan-Doc darf hedgen.** „Entscheidung beim Lesen, kein Zwang" für T4.3–T4.6 hat erlaubt, nach Code-Recon ehrlich „lohnt nicht" zu sagen — statt 4 Read-Renderer zu churnen für Marginal-Gain + Regressionsrisiko.
