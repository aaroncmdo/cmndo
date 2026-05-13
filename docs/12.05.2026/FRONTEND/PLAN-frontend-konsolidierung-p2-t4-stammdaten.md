# P2-T4 — Stammdaten: Feld-Schema extrahieren, Renderer darauf umstellen

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Steps mit `- [ ]`-Checkbox-Syntax. Vor Branch-Arbeit: `superpowers:using-git-worktrees`.

**Goal:** Die ~50 Stammdaten-Felder (Kunde / Fahrzeug / Schadensort / eigene VS / Gegner / Halter / Unfall / Vorschäden / Kernwerte) als **eine kanonische Schema-Liste** in `src/lib/stammdaten/schema.ts` extrahieren, sodass die heute 3-fach hand-codierten Feld-Metadaten (Label / Typ / Options / Hint / Sichtbarkeit) nur noch an einer Stelle leben — und die Renderer (Admin-Inline-Edit, Read-Views, Kunde-Summary, SV-Feldmodus) darauf aufsetzen. **Reine Refactors — keine Verhaltensänderung.**

**Architecture:** Kern ist `src/lib/stammdaten/schema.ts` (`STAMMDATEN_FIELD_SCHEMA: StammdatenFieldDef[]`, gruppiert nach `block`) + ein dünner Schema-Renderer `src/components/shared/stammdaten/SchemaFields.tsx` für den Edit-Pfad (`<SchemaFields block="kunde" />` → mappt über das Schema → `<InlineEditField …>` aus `_stammdaten/InlineEditField.tsx`). Die Read-Views ziehen Label/Reihenfolge aus dem Schema; `StammdatenReadSection` (existiert, bespoke Layout) wird der eine Read-Renderer für SV/Kunde/Makler/Feldmodus. **KEIN** Mega-Renderer der alle Präsentationen vereint — die Edit-Grid- vs. Icon-Row- vs. Key-Value-Layouts bleiben getrennt; geteilt wird die **Feld-Metadaten** (DRY) und, wo das Layout passt, der `StammdatenReadSection`-Wrapper.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind v4. Verifikation: `npx tsc --noEmit` + voller `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Fallakte- + dispatch-Routen sind betroffen → **immer** voller Build, nicht nur tsc). Kein lokales Browser-Smoke-Tooling → bei jeder Fallakte-/Dispatch-/Kunde-Änderung manuellen Klick-Smoke vor Merge empfehlen (Fallakte ist die Kern-Produktfläche).

---

## ⚠️ Scope-Hinweis (vor T4.1 lesen)

Das ist **L–XL**. Es zerfällt sauber in zwei Hälften:
- **A (dieser Plan, T4.1–T4.6):** Schema extrahieren + die 5 *fall-basierten* Renderer darauf umstellen (`_stammdaten/Sections.tsx` Admin-Edit, `StammdatenReadSection`, `StammdatenDetail`, `ClaimSummary` Stammdaten-Teil, `SvFallakteView`). Mittlerer Aufwand, je Renderer 1 PR.
- **B (eigener Folge-Plan, T4.7 als Stub):** `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` (1645 LOC, **Lead**-Felder statt Fall-Felder, plus SA-Tool / Kennzeichen-Parts / Auto-Flags / Cardentity-Trigger) auf das Schema umstellen. **XL, eigenes Risiko** (öffentlicher Dispatch-Flow, andere Datenquelle, viele Sonderfelder) — bekommt einen eigenen Plan, nicht in dieser Runde anfassen.

Wenn du Phase 2 weiter parallelisieren willst: T4.4 / T4.5 / T4.6 sind nach T4.1+T4.3 unabhängig (verschiedene Files) → je ein „Hund"-Agent. T4.1 → T4.2 → T4.3 müssen sequentiell zuerst (Schema → Edit-Renderer → Read-Renderer hängen aufeinander).

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/lib/stammdaten/schema.ts` | **Neu.** `StammdatenBlock`-Type, `StammdatenFieldDef`-Type, `STAMMDATEN_FIELD_SCHEMA: StammdatenFieldDef[]` (die ~50 Felder, gruppiert nach `block`), `fieldsForBlock(block)`-Helper. Pure Daten + Typen, **keine** React/Tailwind-Importe (analog `lib/statusLabels.ts`). Die `getValue`-/`visibleWhen`-Closures nehmen `(fall: Record<string, unknown>, lead?: Record<string, unknown> | null)`. |
| `src/components/shared/stammdaten/SchemaFields.tsx` | **Neu.** `<SchemaFields block="kunde" fall={…} lead={…} />` → mappt über `fieldsForBlock(block)`, filtert per `visibleWhen`, rendert pro Feld `<InlineEditField label fieldName value type options hint placeholder />`. `'use client'` (nutzt `useFall()` über `InlineEditField`). ~50 LOC. |
| `src/app/faelle/[id]/_stammdaten/Sections.tsx` | **Modify.** Die ~14 `*Section()`-Exports rendern statt hand-codierter `<InlineEditField …>`-Listen nur noch `<SchemaFields block="…" fall={fall} lead={lead} />` (Card-Header + Section-Logik bleiben; `SectionFieldCard`-Adapter bleibt). |
| `src/components/shared/stammdaten/StammdatenReadSection.tsx` | **Modify.** Bezieht Reihenfolge/Sichtbarkeit der Felder aus `STAMMDATEN_FIELD_SCHEMA` (das bespoke Icon-Row-Layout + die FahrzeugRenderImage-Logik bleiben — nur die „welche Felder, in welcher Reihenfolge, mit welchem Label"-Entscheidung wird aufs Schema verlagert). |
| `src/components/fall/StammdatenDetail.tsx` | **Modify.** Die `function Field({label,value})`-Key/Value-Grid-Sections mappen über `STAMMDATEN_FIELD_SCHEMA` (Block für Block) statt hand-codierter `<Field label="…" value={…}>`-Listen. |
| `src/components/kunde/ClaimSummary.tsx` | **Modify.** Der **Stammdaten-Teil** (Fahrzeug-/Unfall-/Vorschäden-Daten als `function Field({icon,label,value})`-Cards) → `StammdatenReadSection` mit `rolle="kunde"` (der `StammdatenReadSection`-Kommentar nennt genau dieses Replace-Ziel). Der Rest von `ClaimSummary` (Status-Banner, Termin-Info, Doku-Liste etc.) bleibt. |
| `src/app/gutachter/feldmodus/SvFallakteView.tsx` | **Modify.** Stammdaten-Teil → `StammdatenReadSection` mit `rolle="sv"` (oder, falls die Feldmodus-Optik zu eng/cinematic ist und `StammdatenReadSection` nicht passt: per Schema-`getValue` die Felder ziehen, eigenes kompaktes Layout behalten — Entscheidung beim Lesen der Datei). |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` | **NICHT in diesem Plan** — T4.7 ist ein Stub für den Folge-Plan (Lead-Felder, SA-Tool, ~1645 LOC). |
| `scripts/check-component-set.mjs` (optional, T4.8) | Pattern für hand-codierte `<InlineEditField label="…" fieldName="…">`-Blöcke außerhalb von `SchemaFields` → --warn. |

**Wie das Schema befüllt wird:** Die kanonische Feld-Liste = die **Union der `<InlineEditField …>`-Aufrufe in `src/app/faelle/[id]/_stammdaten/Sections.tsx`** (das ist heute die vollständigste Liste — Admin sieht alles). Jeder dortige `<InlineEditField label="X" fieldName="Y" value={…} type? options? hint? placeholder?>` wird ein `{ block, key:'Y', label:'X', type?, options?, hint?, placeholder?, getValue:(fall,lead)=>…, visibleWhen?:(fall)=>… }`. Die `getValue`-Closures bilden die heutigen `value={…}`-Ausdrücke ab (`f(fall,'kunde_strasse')` → `(fall)=>f(fall,'kunde_strasse')`; `vorname` mit Lead-Fallback → `(fall,lead)=>(fall.kunde_vorname as string|null) ?? (lead?.vorname as string|null) ?? null`; Date-Slicing → `(fall)=>typeof fall.x==='string'?fall.x.slice(0,10):null`). Die `visibleWhen`-Closures bilden die heutigen `{cond && <InlineEditField …>}`-Bedingungen ab (`{!gegner_bekannt && …}` → `visibleWhen:(fall)=>fall.gegner_bekannt!==false`). **Der ausführende Agent extrahiert das 1:1 aus `Sections.tsx`** — der Plan unten gibt die Typen + einen vollständigen Block (Kunde) + die Block-Liste vor; der Rest ist mechanisch.

---

## Task T4.1 — `lib/stammdaten/schema.ts` + `shared/stammdaten/SchemaFields.tsx`

**Files:**
- Create: `src/lib/stammdaten/schema.ts`
- Create: `src/components/shared/stammdaten/SchemaFields.tsx`
- Modify: `src/components/shared/stammdaten/index.ts` (Re-Export ergänzen)

- [ ] **Step 1:** `src/lib/stammdaten/schema.ts` — Typen + Helper + den **Kunde-Block** vollständig, die übrigen Blöcke als Gerüst das der Agent aus `_stammdaten/Sections.tsx` füllt:

```ts
// AAR-frontend-konsolidierung-p2 (P2-T4): Kanonische Stammdaten-Feld-Liste.
// Single Source für Label / Typ / Options / Hint / Sichtbarkeit aller Fall-
// Stammdaten-Felder. Konsumiert von shared/stammdaten/SchemaFields (Admin-Edit)
// + StammdatenReadSection + StammdatenDetail + (Folge) Phase4Stammdaten.
// Pure Daten + Typen — KEINE React/Tailwind-Importe (analog lib/statusLabels.ts).

export type StammdatenBlock =
  | 'kunde'
  | 'fahrzeug'
  | 'halter'
  | 'unfall'
  | 'gegner'
  | 'vorschaeden'
  | 'kernwerte'
  | 'besichtigung'
  | 'nutzungsausfall'
  | 'notizen'

export type StammdatenFieldType =
  | 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea' | 'select'

export type StammdatenFieldDef = {
  block: StammdatenBlock
  /** DB-Spaltenname (= InlineEditField.fieldName). */
  key: string
  label: string
  type?: StammdatenFieldType
  /** Bei type='select' nötig. */
  options?: { value: string; label: string }[]
  hint?: string
  placeholder?: string
  /**
   * Liest den Anzeige-/Edit-Wert aus dem Fall-Objekt (+ optional Lead-Fallback).
   * Default wenn nicht gesetzt: `(fall) => fallToDisplay(fall[key])`.
   */
  getValue?: (
    fall: Record<string, unknown>,
    lead?: Record<string, unknown> | null,
  ) => string | number | boolean | null
  /** Feld nur rendern wenn true. Default: immer. */
  visibleWhen?: (fall: Record<string, unknown>) => boolean
}

/** Default-Wert-Getter: string|number|boolean durchreichen, null bei leer. */
export function fallToDisplay(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}

const dateOnly = (v: unknown): string | null =>
  typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null

// Lackfarbe-Optionen — identisch zur Liste in _stammdaten/Sections.tsx
// (CMM-32). Beim Extrahieren aus Sections.tsx 1:1 übernehmen.
const LACKFARBE_OPTIONS: { value: string; label: string }[] = [
  { value: 'schwarz', label: 'Schwarz' },
  { value: 'weiss', label: 'Weiß' },
  { value: 'silber', label: 'Silber' },
  { value: 'grau', label: 'Grau' },
  { value: 'blau', label: 'Blau' },
  { value: 'rot', label: 'Rot' },
  { value: 'gruen', label: 'Grün' },
  { value: 'gelb', label: 'Gelb' },
  { value: 'orange', label: 'Orange' },
  { value: 'braun', label: 'Braun' },
  { value: 'beige', label: 'Beige' },
  { value: 'sonstige', label: 'Sonstige' },
]

export const STAMMDATEN_FIELD_SCHEMA: StammdatenFieldDef[] = [
  // ── Kunde ───────────────────────────────────────────────────────────────
  { block: 'kunde', key: 'kunde_vorname', label: 'Vorname',
    getValue: (f, l) => (f.kunde_vorname as string | null) ?? (l?.vorname as string | null) ?? null },
  { block: 'kunde', key: 'kunde_nachname', label: 'Nachname',
    getValue: (f, l) => (f.kunde_nachname as string | null) ?? (l?.nachname as string | null) ?? null },
  { block: 'kunde', key: 'kunde_email', label: 'E-Mail', type: 'email',
    getValue: (f, l) => (f.kunde_email as string | null) ?? (l?.email as string | null) ?? null },
  { block: 'kunde', key: 'kunde_telefon', label: 'Telefon', type: 'tel',
    getValue: (f, l) => (f.kunde_telefon as string | null) ?? (l?.telefon as string | null) ?? null },
  { block: 'kunde', key: 'kunde_strasse', label: 'Straße' },
  { block: 'kunde', key: 'kunde_plz', label: 'PLZ' },
  { block: 'kunde', key: 'kunde_stadt', label: 'Stadt' },
  { block: 'kunde', key: 'sprache', label: 'Sprache (de/tr/ar/ru/pl/en/other)', hint: 'AAR-316: Portal-Übersetzung' },

  // ── Fahrzeug ────────────────────────────────────────────────────────────
  // (Aus _stammdaten/Sections.tsx FahrzeugdatenSection extrahieren — die
  //  ~22 Felder kennzeichen / fahrzeug_hersteller / fahrzeug_modell / fin_vin /
  //  hsn / tsn / fahrzeug_baujahr [type:number, hint:AAR-181] /
  //  lackfarbe_code [type:select, options:LACKFARBE_OPTIONS, hint] /
  //  fahrzeug_farbe [placeholder] / fahrzeug_typ [hint] / erstzulassung [date] /
  //  kilometerstand [number] / finanzierung_leasing [hint] /
  //  vorsteuerabzugsberechtigt [placeholder 'Ja/Nein'] / werkstatt_seit_datum
  //  [date, getValue:dateOnly, hint:AAR-305] / fahrzeug_fahrbereit. Plus die
  //  Halter-Felder gehören in den 'halter'-Block, NICHT 'fahrzeug'.)

  // ── Halter ──────────────────────────────────────────────────────────────
  // halter_vorname / halter_nachname / halter_geburtsdatum [date, getValue:
  //  dateOnly, hint:AAR-318] / halter_email / halter_telefon / halter_strasse /
  //  halter_plz / halter_stadt / ist_fahrzeughalter [placeholder 'Ja/Nein',
  //  hint:AAR-318] — alle aus FahrzeugdatenSection.

  // ── Unfall ──────────────────────────────────────────────────────────────
  // schadens_datum [date, getValue:dateOnly] / schadens_art / schadens_adresse /
  //  schadens_plz / schadens_ort / unfallort [hint] / unfallort_kategorie [hint] /
  //  unfall_uhrzeit [hint] / unfallort_lat [number] / unfallort_lng [number] /
  //  polizeibericht_status [hint] / zb1_status [hint] / fahrerflucht [placeholder
  //  'Ja/Nein', hint:AAR-135] / auslandskennzeichen [placeholder 'Ja/Nein', hint] /
  //  schadens_ursache [textarea] / schadens_hergang [textarea] /
  //  fahrzeugschaden_beschreibung [textarea] / sachschaden_beschreibung [textarea] /
  //  schadens_beschreibung [textarea] — aus UnfallSection.

  // ── Gegner ──────────────────────────────────────────────────────────────
  // gegner_bekannt [placeholder 'Ja/Nein'] / gegner_name [visibleWhen:(f)=>
  //  f.gegner_bekannt!==false] / gegner_kennzeichen / gegner_fahrzeugtyp /
  //  gegner_versicherung / gegner_versicherungsnummer / gegner_schadennummer /
  //  gegner_versicherung_anfrage_datum [date, getValue:dateOnly, hint:AAR-314] —
  //  aus GegnerSection.

  // ── Vorschäden ──────────────────────────────────────────────────────────
  // hat_vorschaeden [placeholder 'Ja/Nein'] / vorschaden_anzahl [number] /
  //  vorschaeden_beschreibung [textarea, visibleWhen:(f)=>f.hat_vorschaeden===true]
  //  — aus VorschaedenSection.

  // ── Besichtigung ────────────────────────────────────────────────────────
  // besichtigungsort_adresse — aus BesichtigungSection.

  // ── Kernwerte ───────────────────────────────────────────────────────────
  // reparaturkosten [number] / wiederbeschaffungswert [number] / restwert [number] /
  //  wertminderung [number] / schadens_hoehe_netto [number] — aus KernwerteSection.

  // ── Nutzungsausfall ─────────────────────────────────────────────────────
  // (aus NutzungsausfallSection — Felder beim Extrahieren ablesen)

  // ── Notizen ─────────────────────────────────────────────────────────────
  { block: 'notizen', key: 'notizen', label: 'Interne Notizen', type: 'textarea' },
]

export function fieldsForBlock(block: StammdatenBlock): StammdatenFieldDef[] {
  return STAMMDATEN_FIELD_SCHEMA.filter((f) => f.block === block)
}

// (LACKFARBE_OPTIONS + dateOnly werden oben in den Schema-Einträgen genutzt;
//  beim Extrahieren der restlichen Blöcke aus Sections.tsx mitverdrahten.)
void dateOnly
void LACKFARBE_OPTIONS
```

  *(Anm.: `void dateOnly`/`void LACKFARBE_OPTIONS` nur damit das Gerüst ohne tsc-`noUnusedLocals`-Fehler kompiliert — sobald die übrigen Blöcke befüllt sind und die Helper genutzt werden, raus damit.)*

- [ ] **Step 2:** `src/components/shared/stammdaten/SchemaFields.tsx`:

```tsx
'use client'

// AAR-frontend-konsolidierung-p2 (P2-T4): Schema-getriebener Edit-Renderer für
// einen Stammdaten-Block. Mappt STAMMDATEN_FIELD_SCHEMA → <InlineEditField …>
// (das gegen FallContext speichert). `fall`/`lead` werden für getValue/visibleWhen
// gebraucht. Ersetzt die ~14 hand-codierten <InlineEditField …>-Listen in
// faelle/[id]/_stammdaten/Sections.tsx.

import InlineEditField from '@/app/faelle/[id]/_stammdaten/InlineEditField'
import { fieldsForBlock, fallToDisplay, type StammdatenBlock } from '@/lib/stammdaten/schema'

export function SchemaFields({
  block,
  fall,
  lead,
}: {
  block: StammdatenBlock
  fall: Record<string, unknown>
  lead?: Record<string, unknown> | null
}) {
  const fields = fieldsForBlock(block)
  return (
    <>
      {fields.map((def) => {
        if (def.visibleWhen && !def.visibleWhen(fall)) return null
        const value = def.getValue ? def.getValue(fall, lead) : fallToDisplay(fall[def.key])
        return (
          <InlineEditField
            key={def.key}
            label={def.label}
            fieldName={def.key}
            value={value}
            type={def.type}
            options={def.options}
            hint={def.hint}
            placeholder={def.placeholder}
          />
        )
      })}
    </>
  )
}
```

  *(Vorher prüfen: `InlineEditField`'s Default-Export-Pfad ist `@/app/faelle/[id]/_stammdaten/InlineEditField` — ein `shared/*`-Import auf einen `app/*`-Pfad ist unschön, aber `InlineEditField` lebt nun mal dort und ist `FallContext`-gebunden. Alternative: `InlineEditField` nach `src/components/shared/stammdaten/InlineEditField.tsx` verschieben (mit Re-Export am alten Pfad für die `_actions`-Importe) — sauberer, aber +1 Move. Für den ersten Wurf: Direkt-Import wie oben, im PR-Body als „Folge-Cleanup" notieren.)*

- [ ] **Step 3:** `src/components/shared/stammdaten/index.ts` → `export { SchemaFields } from './SchemaFields'` ergänzen (neben dem bestehenden `StammdatenReadSection`-Export).

- [ ] **Step 4:** `npx tsc --noEmit` grün. (Schema ist pure TS; `SchemaFields` ist `'use client'` aber wird noch nirgends gerendert → kein Build-Risiko, tsc reicht hier.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/stammdaten/schema.ts src/components/shared/stammdaten/SchemaFields.tsx src/components/shared/stammdaten/index.ts
git commit -m "$(cat <<'EOF'
refactor(frontend): P2-T4.1 — Stammdaten-Feld-Schema (lib/stammdaten/schema.ts) + SchemaFields-Renderer

src/lib/stammdaten/schema.ts: STAMMDATEN_FIELD_SCHEMA — kanonische Liste aller
~50 Fall-Stammdaten-Felder (block/key/label/type/options/hint/placeholder/getValue/
visibleWhen), extrahiert 1:1 aus faelle/[id]/_stammdaten/Sections.tsx. + fieldsForBlock-Helper.
src/components/shared/stammdaten/SchemaFields.tsx: mappt einen Block → <InlineEditField …>.
Noch ohne Consumer (Adoption in T4.2+).

Audit:
- Build: tsc --noEmit grün (pure TS + ungenutzte 'use client'-Component)
- UI: keine Änderung (kein Consumer)
- Redundanz: Vorbereitung — entdoppelt künftig die 3-fach hand-codierten Feld-Metadaten
- Dead-Code: nichts
- Spec: KOMPONENTEN-SET-POLICY (shared/* Composite) + P2-T4-Plan
- Inkonsistenz: eine Quelle für Stammdaten-Feld-Metadaten; Umlaute ok
- Regression: keine (kein Consumer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T4.2 — Admin `_stammdaten/Sections.tsx` → `<SchemaFields>`

**Files:**
- Modify: `src/app/faelle/[id]/_stammdaten/Sections.tsx`

- [ ] **Step 1:** Pro `*Section()`-Export (KundendatenSection, FahrzeugdatenSection, HalterSection [falls separat — sonst Teil von Fahrzeug], UnfallSection, GegnerSection, VorschaedenSection, BesichtigungSection, KernwerteSection, NutzungsausfallSection, NotizenSection, …): den hand-codierten `<InlineEditField …>`-Block im `<SectionFieldCard>` ersetzen durch `<SchemaFields block="…" fall={fall} lead={lead} />`. Beispiel:

```tsx
// vorher
export function KundendatenSection() {
  const { fall, lead } = useFall()
  const vorname = (fall.kunde_vorname as string | null) ?? (lead?.vorname as string | null) ?? null
  // … weitere lokale value-Ableitungen …
  return (
    <SectionFieldCard icon={<UserIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Kundendaten">
      <InlineEditField label="Vorname" fieldName="kunde_vorname" value={vorname} />
      {/* … 7 weitere … */}
    </SectionFieldCard>
  )
}
// nachher
export function KundendatenSection() {
  const { fall, lead } = useFall()
  return (
    <SectionFieldCard icon={<UserIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Kundendaten">
      <SchemaFields block="kunde" fall={fall} lead={lead} />
    </SectionFieldCard>
  )
}
```

  - Felder die heute *außerhalb* des Schema-Musters gerendert werden (z.B. CardentityTypBButton in der Fahrzeug-Section, ZeugenKontakteSection mit eigener Listen-Logik, NutzungsausfallSection wenn sie eigene Subkomponenten hat) bleiben **zusätzlich** im JSX neben `<SchemaFields>` — `SchemaFields` rendert nur die Schema-Felder, der Rest steht weiter drumherum.
  - Import: `import { SchemaFields } from '@/components/shared/stammdaten'`. Den `InlineEditField`-Import entfernen falls keine Inline-Edit-Felder mehr direkt in `Sections.tsx` stehen; sonst lassen.
  - Den `f(fall, key)`-Helper + die lokalen `value`-Ableitungen entfernen wo sie nur noch fürs Schema gebraucht wurden (sie leben jetzt als `getValue` im Schema).

- [ ] **Step 2:** `grep -rn "<InlineEditField" "src/app/faelle/[id]/_stammdaten/Sections.tsx"` → idealerweise leer (oder nur noch die paar Sonderfälle). `npx tsc --noEmit` grün.

- [ ] **Step 3:** **Voller Build** (`faelle/[id]`-Routen): `NODE_OPTIONS=--max-old-space-size=8192 npm run build` grün. *(Windows-EBUSY beim `.next/standalone`-Copy → `.next` löschen + neu; GitHub-Linux-`build`-Check ist maßgeblich.)*

- [ ] **Step 4: Commit + PR** `kitta/aar-stammdaten-admin-schema`, Titel `refactor(frontend): P2-T4.2 — Admin-Stammdaten-Sections → SchemaFields`. Body: „die ~14 hand-codierten <InlineEditField>-Listen in faelle/[id]/_stammdaten/Sections.tsx durch <SchemaFields block=…> ersetzt; Feld-Metadaten kommen jetzt aus lib/stammdaten/schema.ts. Optik/Verhalten unverändert (gleiche Felder, gleiche Reihenfolge, gleiche Edit-/Save-Semantik via InlineEditField/FallContext). Voller Build grün. **Browser-Smoke der Fallakte-Stammdaten-Tabs empfohlen.**" Commit-Body mit 7-Punkte-Audit. **Nicht selbst mergen.**

---

## Task T4.3 — `StammdatenReadSection` zieht Felder/Labels aus dem Schema

**Files:**
- Modify: `src/components/shared/stammdaten/StammdatenReadSection.tsx`

- [ ] **Step 1:** Die hart kodierten `str(fall.x)` / Label-Strings in `StammdatenReadSection` durch Lookups gegen `STAMMDATEN_FIELD_SCHEMA` ersetzen, wo es ohne Layout-Bruch geht: das *Icon-Row-Layout* + `FahrzeugRenderImage` + die Rollen-Filter (`zeigeKunde`/`zeigeHalter`/`zeigeEigeneVs`) bleiben; aber die „welches Feld, welches Label" kommt aus dem Schema (z.B. `fieldsForBlock('kunde')` für die Kunde-Zeile, `fieldsForBlock('gegner')` für den Gegner-Block — Label/Reihenfolge aus dem Schema, Präsentation bleibt die bestehende). Wo das Layout zu speziell ist (z.B. die kombinierte „KZ: … · FIN: …"-Zeile) bleibt der Code wie er ist — kein Zwang, alles über das Schema zu jagen; Ziel ist „Labels nicht doppelt pflegen", nicht „Layout vereinheitlichen".
  - Import: `import { STAMMDATEN_FIELD_SCHEMA, fieldsForBlock, fallToDisplay } from '@/lib/stammdaten/schema'`.

- [ ] **Step 2:** `npx tsc --noEmit` grün. **Voller Build** grün (StammdatenReadSection wird in mehreren Portalen gerendert).

- [ ] **Step 3: Commit + PR** `kitta/aar-stammdaten-readsection-schema`, Titel `refactor(frontend): P2-T4.3 — StammdatenReadSection zieht Feld-Metadaten aus dem Schema`. 7-Punkte-Audit. Nicht mergen.

---

## Task T4.4 — `StammdatenDetail.tsx` → Schema-getriebene Read-Sections

**Files:**
- Modify: `src/components/fall/StammdatenDetail.tsx`

- [ ] **Step 1:** Datei lesen (427 LOC). Die `function Field({label,value})`-Key/Value-Grid + die Block-Sections (FahrzeugDetail, UnfallDetail, …): pro Block über `fieldsForBlock(block)` mappen → `<Field label={def.label} value={fmt(def.getValue?.(fall, lead) ?? fallToDisplay(fall[def.key]))} />` statt hand-codierter `<Field label="…" value={str(fall.x)} />`-Listen. Die `function Field`-Komponente selbst bleibt (oder, falls eine `shared/DataRow` existiert/gewünscht ist, dorthin — aber das ist Scope für später, nicht hier). Den `str()`/`bool()`-Helper an die Schema-`getValue`-Ergebnisse anpassen.
  - Falls `StammdatenDetail` exakt dasselbe wie `StammdatenReadSection` rendert (Read-Only, ähnliches Layout) → erwägen, `StammdatenDetail` ganz durch `<StammdatenReadSection rolle="…" fall={fall} lead={lead} />` zu ersetzen. Entscheidung beim Lesen: wenn die Layouts ≥80% übereinstimmen → ersetzen + `StammdatenDetail.tsx` löschen + Consumer auf `StammdatenReadSection` umstellen; sonst nur schema-driven machen. Im PR-Body dokumentieren welche Variante.

- [ ] **Step 2:** `npx tsc --noEmit` + **voller Build** grün.

- [ ] **Step 3: Commit + PR** `kitta/aar-stammdaten-detail-schema`, Titel `refactor(frontend): P2-T4.4 — StammdatenDetail schema-getrieben (bzw. → StammdatenReadSection)`. 7-Punkte-Audit. Nicht mergen.

---

## Task T4.5 — `ClaimSummary.tsx` Stammdaten-Teil → `StammdatenReadSection`

**Files:**
- Modify: `src/components/kunde/ClaimSummary.tsx`

- [ ] **Step 1:** Datei lesen (753 LOC). Den **Stammdaten-Abschnitt** (Fahrzeug-/Unfall-/Vorschäden-Daten als `function Field({icon,label,value})`-Cards — der `StammdatenReadSection`-Header-Kommentar nennt „Kunde-`FallDetailSections` Fahrzeug/Unfall/Vorschäden-Sections" als Replace-Ziel) durch `<StammdatenReadSection rolle="kunde" lead={lead} fall={fall} title="…" />` ersetzen. Der Rest von `ClaimSummary` (Status-Banner, Termin-Block, Doku-Liste, Provision-Hinweis etc.) bleibt unangetastet. `function Field` löschen falls danach unbenutzt.
  - Vorher prüfen: hat `ClaimSummary` Zugriff auf ein `lead`-Objekt mit `{vorname,nachname,email,telefon,fin,hat_vorschaeden,eigene_versicherung,eigene_policennr}` (das `LeadLike` von `StammdatenReadSection`)? Falls nicht direkt: aus den `fall.kunde_*`/`fall.eigene_*`-Spalten ein `LeadLike`-Objekt bauen und reingeben (oder `lead={null}` wenn die Kunde-Zeile eh per `rolle="kunde"`-Filter ausgeblendet wird).

- [ ] **Step 2:** `npx tsc --noEmit` + **voller Build** grün (Kunde-Portal-Route).

- [ ] **Step 3: Commit + PR** `kitta/aar-claimsummary-stammdaten`, Titel `refactor(frontend): P2-T4.5 — ClaimSummary Stammdaten-Teil → shared/StammdatenReadSection`. 7-Punkte-Audit. Nicht mergen. **Browser-Smoke der Kunde-Fall-Detail-Page empfohlen.**

---

## Task T4.6 — `SvFallakteView.tsx` Stammdaten-Teil → `StammdatenReadSection`

**Files:**
- Modify: `src/app/gutachter/feldmodus/SvFallakteView.tsx`

- [ ] **Step 1:** Datei lesen (351 LOC). Den Stammdaten-Abschnitt der Feldmodus-Fallakte-Ansicht → `<StammdatenReadSection rolle="sv" lead={…} fall={…} />` (bzw. — falls die Feldmodus-Optik bewusst cinematic/anders ist und `StammdatenReadSection`'s weiße-Card-Layout dort fehl am Platz wäre — die Felder via `fieldsForBlock`/`getValue` aus dem Schema ziehen und das Feldmodus-eigene Layout behalten; **kein Zwang**, das weiße `StammdatenReadSection`-Layout in den Feldmodus zu pressen wenn es dort nicht passt — dann reicht „Labels aus dem Schema"). Entscheidung beim Lesen, im PR-Body dokumentieren.

- [ ] **Step 2:** `npx tsc --noEmit` + **voller Build** grün (gutachter/feldmodus-Route — Feldmodus hat Offline-SW + GPS-Stuff, ein voller Build ist hier besonders wichtig).

- [ ] **Step 3: Commit + PR** `kitta/aar-svfallakteview-stammdaten`, Titel `refactor(frontend): P2-T4.6 — SvFallakteView Stammdaten-Teil → shared (StammdatenReadSection bzw. Schema-Labels)`. 7-Punkte-Audit. Nicht mergen.

---

## Task T4.7 — STUB: `Phase4Stammdaten.tsx` (Folge-Plan, NICHT in dieser Runde)

`src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` (1645 LOC) editiert **Lead**-Felder (`leads.*`), nicht Fall-Felder, plus: SA-Tool, Kennzeichen-Parts-Field, Auto-Flags (Fahrerflucht/Auslandskennzeichen), Cardentity-Typ-B-Trigger, Grüne-Karte-Trigger, FahrzeugRenderImage. Es auf `STAMMDATEN_FIELD_SCHEMA` umzustellen heißt: das Schema um eine `leadKey`-Spalte / einen `entity: 'fall' | 'lead'`-Parameter erweitern, oder ein paralleles `LEAD_STAMMDATEN_SCHEMA` ableiten — plus die Lead-Edit-Action statt `FallContext`. **Eigener Plan + eigener Smoke** (öffentlicher Dispatch-Lead-Flow, hohe Stakes). Nicht jetzt.

---

## Self-Review (durchgeführt)

- **Spec-Coverage:** Schema extrahieren ✓ (T4.1, Typen + Kunde-Block voll, Rest als annotiertes Gerüst + klare Extraktions-Regel aus `Sections.tsx`). Admin-Edit-Renderer → Schema ✓ (T4.2). `StammdatenReadSection` → Schema-Labels ✓ (T4.3). `StammdatenDetail` ✓ (T4.4). `ClaimSummary` ✓ (T4.5). `SvFallakteView` ✓ (T4.6). `Phase4Stammdaten` als bewusster Stub ✓ (T4.7 — eigener Plan). **Gap:** das Schema in T4.1 ist NICHT verbatim alle ~50 Felder ausgeschrieben — der Kunde-Block ist vollständig, die übrigen Blöcke sind als kommentiertes Gerüst mit exakter Quell-Datei (`Sections.tsx`) + Pro-Feld-Hinweisen (welcher `type`/`hint`/`getValue`) drin. Bewusst: 50 Felder verbatim + die heutigen `value=`-Closures hätten den Plan auf ~600 Zeilen aufgebläht, und der ausführende Agent kopiert das eh 1:1 aus `Sections.tsx` — die Extraktions-Regel ist eindeutig. Das ist ein dokumentiertes mechanisches Verfahren, kein „TODO".
- **Placeholder-Scan:** kein „TBD/implement later/add error handling". `schema.ts` (Typen + Helper + Kunde-Block + `fieldsForBlock`) und `SchemaFields.tsx` sind vollständig ausgeschrieben. Die Block-Gerüste enthalten die konkreten Feldnamen + Typen, nicht „etc.".
- **Type-Konsistenz:** `StammdatenBlock` / `StammdatenFieldDef` / `STAMMDATEN_FIELD_SCHEMA` / `fieldsForBlock` / `fallToDisplay` durchgängig identisch in T4.1, `SchemaFields`, und allen Folge-Tasks. `<SchemaFields block fall lead>`-Signatur konsistent. `StammdatenReadSection`-Props (`rolle: 'sv'|'kunde'|'makler'`, `lead: LeadLike`, `fall`) wie in der bestehenden Datei.

---

## Execution Handoff

Zwei Ausführungs-Optionen:
1. **Subagent-Driven** (empfohlen) — pro Task ein frischer Subagent, Review dazwischen (`superpowers:subagent-driven-development`). T4.1→T4.2→T4.3 sequentiell (Abhängigkeit), danach T4.4/T4.5/T4.6 parallel (je „Hund"-Agent, disjunkte Files).
2. **Inline** — Tasks in dieser Session abarbeiten, Checkpoints zum Review (`superpowers:executing-plans`).

**T4.7** (`Phase4Stammdaten`) bleibt in beiden Fällen draußen — eigener Plan, wenn A (T4.1–T4.6) durch + gesmoked ist.
