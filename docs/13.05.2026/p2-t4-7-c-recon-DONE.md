# P2-T4.7-C — Recon: Custom-Wrapper im LeadSchema

**Datum:** 13.05.2026
**Vorgänger:** PR #870 (Phase A — Halter-Block), PR #871 (Phase B — visibleWhen + Vorschäden/Gegner)
**Status:** Planungs-MD, kein Code

## Ziel

Bestandsaufnahme der ~30 % nicht-trivialen Felder in `Phase4Stammdaten.tsx`, die heute inline-JSX-rendered sind, und Empfehlung wie sie in das `LeadSchema`-Pattern eingehängt werden — oder ob nicht.

## Inventar — die 7 Custom-Cluster

| Cluster | Felder | Komplexität | Wo in Phase4Stammdaten |
|---|---|---|---|
| **KennzeichenPartsField** | `kennzeichen` (composed) + `kennzeichen_kreis`/`_buchstaben`/`_zahl`/`_suffix` | Hoch — 4-Feld-Split + live-Format (`formatKennzeichen` Greedy-Backtracking-fix AAR-224) + Tab-Navigation | KennzeichenPartsField-Component (lokal, ~120 LOC) |
| **CarQuery-Fahrzeug** | `fahrzeug_hersteller`, `fahrzeug_modell`, `fahrzeug_baujahr`, `fin`, `hsn`, `tsn` | Mittel — Hersteller-Dropdown (KFZ_MARKEN-Liste, 21 Marken) + CarQuery-Autocomplete für Modell + `formatBaujahr` (4-stellig 1990–jetzt+1) + DAT-API-Hint für HSN/TSN | Inline in Fahrzeug-Block, lebt mit `useCarQuery`-Hook |
| **Imagin-Lackfarbe** | `lackfarbe_code`, `fahrzeug_farbe` (Freitext) | Mittel — `LACKFARBE_OPTIONS` (12 Optionen) + Freitext + Live-Render via `FahrzeugRenderImage` (Imagin-API) | Inline-Select + Freitext + Render-Preview |
| **VersicherungField** | `gegner_versicherung_id` (FK) + `gegner_versicherung` (denormalisierter Name) | Hoch — Autocomplete gegen `versicherungen`-Stammdaten + Freitext-Fallback + 2-Feld-Atomic-Save | Eigene Component `VersicherungField` (lokal, ~80 LOC, AAR-265) |
| **GooglePlace-Adresse** | `kunde_adresse` (display) + `kunde_strasse`/`kunde_plz`/`kunde_stadt`/`kunde_lat`/`kunde_lng` (6 Felder via 1 Autocomplete) | Hoch — Place-Autocomplete + Lat/Lng-Snapshot + Distance-Recompute (SV-Matching) | `GooglePlaceAutocomplete`-Component |
| **KZ-Live-Flag** | `gegner_kennzeichen` → live-berechnet `fahrerflucht` + `auslandskennzeichen` | Hoch — `checkKZFlags(kz)` läuft on-blur, setzt 2 Boolean-Flags ATOMISCH mit dem KZ-Save (Admin-Override-Banner möglich) | Custom on-blur-Handler im Gegner-Block, `_lib/gegner-kz-flags.ts` |
| **Button-Toggles** | `hat_vorschaeden`, `ist_fahrzeughalter`, `zeugen`, `parkplatz_kamera`, `finanzierung_leasing` (3-Wege: keine/finanzierung/leasing), `vorsteuerabzugsberechtigt` | Niedrig pro Stück, aber Vielfalt (Ja/Nein, 3-Wege, Auto-Fill-Effekt) | Lokale `saveToggle`-Helper + `<button>`-Cluster |

## API-Optionen für Schema-Integration

### Option 1 — „Trivial-only" festschreiben

LeadSchema bleibt strikt nur für simple `<InlineField>`-Konsumenten. Phase C macht NICHTS am Schema. Phase4Stammdaten behält die Custom-Cluster als inline-JSX.

**Pro:** Kein API-Overhead, keine Risiko-Migration. Phase B-Stand bleibt.
**Contra:** Schema modelliert nur ~25 % der Felder. Drift-Risiko bei Label-Änderungen bleibt für die anderen 75 %.

### Option 2 — `customRenderer: string` als Registry-Key

Schema-Eintrag bekommt optional `customRenderer: 'kennzeichen-parts' | 'versicherung-autocomplete' | …`. `LeadSchemaFields` mappt den Key auf eine Renderer-Component aus einer Registry.

```ts
{ block: 'fahrzeug', key: 'kennzeichen', label: 'Kennzeichen', customRenderer: 'kennzeichen-parts' }
```

Registry-Tabelle (separate Datei, importiert von LeadSchemaFields):
```ts
const CUSTOM_RENDERERS = {
  'kennzeichen-parts': KennzeichenPartsField,
  'versicherung-autocomplete': VersicherungField,
  …
}
```

**Pro:** Schema bleibt pure-Daten (kein React-Import). Registry-Lookup ist O(1). Renderer-Component lebt weiter wo sie heute lebt.
**Contra:** String-Key statt Typ-sicher. Indirektion. Phase4Stammdaten muss die Block-Aufrufe noch koordinieren (`<LeadSchemaFields block="fahrzeug">` würde 4 unterschiedliche Custom-Renderer triggern — was passt das Layout-grid an?).

### Option 3 — Composite-Block-Components (kein Schema-Eintrag, aber Shared)

Für jeden Custom-Cluster eine eigene Shared-Component bauen, die ihre Props selber zieht:

```tsx
<KennzeichenBlock lead={l} leadId={leadId} />
<FahrzeugCarQueryBlock lead={l} leadId={leadId} />
<VersicherungBlock lead={l} leadId={leadId} />
<GooglePlaceBlock lead={l} leadId={leadId} />
<KzLiveFlagBlock lead={l} leadId={leadId} onKzChange={…} />
<ToggleBlock lead={l} leadId={leadId} field="hat_vorschaeden" />
```

Wandern aus `Phase4Stammdaten.tsx` raus nach `src/components/shared/lead-stammdaten/*.tsx`. Schema bleibt für Trivial-Felder. Composite-Blocks sind dokumentierte „spezielle" Komponenten.

**Pro:** Klare Trennung. Jeder Composite-Block ist eine eigene testbare Einheit. Re-Use in Phase 1/5 möglich.
**Contra:** Phase4Stammdaten wird zu einem Composite-Block-Aggregator — verliert die direkte Inline-Lesbarkeit. Migrationsaufwand höher als Option 2 (mehrere File-Moves).

### Option 4 — Hybrid (Schema + Composite-Blocks)

Schema modelliert ALLES (auch Custom). Aber statt `customRenderer: string` ist der Schema-Eintrag einer „Hint"-Typ wie:

```ts
{ block: 'fahrzeug', key: 'kennzeichen', label: 'Kennzeichen', renderHint: 'composite' }
```

`LeadSchemaFields` rendert nur `<InlineField>` für Default-Typen. Composite-Renderer („Hint = composite") werden NICHT von LeadSchemaFields gerendert — sie sind Schema-Einträge für Dokumentation / Inventar-Zwecke, aber Phase4Stammdaten holt sie sich manuell via `<KennzeichenBlock>` ab.

**Pro:** Schema ist „source of truth" über ALLE Felder. Documentation-Wert hoch (man kann das Schema iterieren um zu wissen welche Felder leben). Trivial-Fall bleibt schmal.
**Contra:** Schema-Einträge ohne Render-Effekt sind verwirrend („für was ist das gut?"). Risiko dass `renderHint`-Pflege rottet.

## Empfehlung

**Option 1 (Trivial-only)** im ersten Schritt, mit **kleinem Pre-Cleanup** für klare Composite-Boundary. Begründung:

1. **Yield ist niedrig.** Phase C würde ~1500 LOC Custom-JSX umverteilen. Die Felder ändern sich selten (`KennzeichenPartsField` ist seit AAR-224 stabil, `formatKennzeichen` ist getuned). Drift-Risiko ist gering — alle Custom-Cluster sind durch ihre Komplexität schon eigene Komponenten.

2. **Smoke-Risiko ist hoch.** Die Lead-Phase 4 ist das Herzstück des Dispatch-Flows. Jeder Refactor riskiert Funnel-Bruch. Aus 0 % Smoke-Verifikation in den letzten 2 PRs (PR #870/871 blockten auf EmptyState-Issue + leerer DB) hätten wir nicht den Hebel um 7 Custom-Cluster gleichzeitig zu migrieren.

3. **Phase A+B haben Sache getrieben.** ~150 LOC InlineField-Boilerplate raus + visibleWhen-Pattern etabliert. Die low-hanging-fruit ist gepflückt. Phase C wäre Premium-Yield → niedrig.

**Konkret in Phase C ausliefern:**

- **Phase C.1 — Composite-Boundary-MD** (~1 Tag): Diese MD pflegt das Inventar + die Empfehlung. Phase4Stammdaten bekommt am Anfang einen Banner-Kommentar: „Trivial-Felder via LeadSchemaFields, Custom-Cluster bleiben inline siehe AGENTS.md §Phase-2-T4.7".
- **Phase C.2 — Optional bei tatsächlichem Pain** (Reaktiv, nicht jetzt): Wenn ein Feld umbenannt werden muss (z.B. `gegner_versicherungsnummer` → `gegner_versicherer_id`) und der Aufwand schmerzt, ZUM Zeitpunkt des Schmerzes die betroffene Cluster auf Option 3 (Composite-Component) migrieren. Einzelfall-basiert.
- **Phase C.3 — `gegner_versicherungsnummer` ins Schema zurück** (~30 Min, jederzeit): Wenn das Feld doch InlineField-rendered wird (CMM-26 Folge), wieder ins Schema mit visibleWhen.

## Risiken / offene Fragen

- **GooglePlaceAutocomplete + Lat/Lng:** Wenn man das in ein Composite migriert, muss der Distance-Recompute (SV-Matching) weiter laufen — Trigger ist heute on-blur in Phase4Stammdaten. Migration darf den Hook nicht brechen.
- **KZ-Live-Flag bei Migration:** `checkKZFlags(kz)` setzt fahrerflucht + auslandskennzeichen IM SELBEN Save wie das KZ. Wenn das in ein Composite geht, muss der Atomic-Save erhalten bleiben (sonst Race-Condition zwischen 3 Server-Action-Calls).
- **`ist_fahrzeughalter`-Toggle:** Der Halter-Auto-Fill (Klick auf „Gleich wie Kunde?" → kopiert kunde_strasse → halter_strasse etc.) ist heute ein patchLead-Effekt PLUS saveStammdaten. Migration in ein generisches `<ToggleBlock>` würde diesen Side-Effect übersehen.

## Größenschätzung (falls Phase C voll gemacht wird)

| Aufwand | Phase C voll | Phase C minimal (Empfehlung) |
|---|---:|---:|
| Files neu/geändert | ~12 | 1 |
| LOC moved | ~1500 | ~5 (Comment-Banner) |
| Smoke-Cycles nötig | mind. 3 (Fahrzeug, Versicherung, Adresse je separat) | 0 |
| Regressions-Risiko | Hoch (Funnel-kritisch) | Praktisch 0 |
| Yield (DRY-Gewinn) | ~30 % Code-Reduktion in Phase4Stammdaten | ~0 % |

## Entscheidung

Empfehle **Option 1 + Phase C.1 Banner**. Phase C als „erledigt" markieren, weiter zu Phase B-Smoke + Verifikation auf staging.

Wenn Aaron's `de5e40bd` auf staging gemerged ist UND ein Schmerzpunkt im Funnel auftritt (z.B. ein Feld-Rename brennt), Phase C.2 reaktiv aufmachen.
