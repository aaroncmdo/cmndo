# Werkstatt-Finder-EMBED — Phase 3: db-driven Übergabe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** Die im Phase-2-Wizard gesammelten Felder db-driven auf den Lead schreiben, sodass sie via `convert-lead-to-claim` in Claim/Feststellung/Firma-Entität fließen — kein Datenverlust beim Übergang Embed → Lead → FlowLink → Portal/Auftrag.

**Architecture:** Der Wizard sammelt bereits alle Felder (Phase 2). Phase 3 reicht sie durch: SchadenStep-Freitext wird gehoben (analog `onFotos`), `WerkstattWizard.absenden` übergibt sie an `erstelleWerkstattFinderLead`, das sie via `buildWerkstattFinderLeadExtra` in den `createLead`-INSERT schreibt. **Kein DDL** — alle Spalten existieren (prod-verifiziert).

**Tech Stack:** Next.js (App Router), TypeScript, Supabase, Vitest.

## Global Constraints
- **Regel 1:** Branch `kitta/werkstatt-embed-phase3` (Worktree, gestackt auf `kitta/werkstatt-embed-phase2`), PR gegen `staging` (bzw. gestackt auf phase-2 bis #4407 merged). Kein Direct-Push auf main.
- **Regel 2:** Kein DDL nötig (Spalten prod-verifiziert 15.07.: `fahrzeug_hersteller/_modell/klasse text`, `fahrzeugschaden_beschreibung text`, `gewerbe_flag boolean`, `fahrzeug_standort_* text/numeric` — alle nullable).
- **Regel 4:** Prod-Smoke nach Deploy (Test-Lead `telefon=NULL`).
- **Ungetypter Pfad:** `buildWerkstattFinderLeadExtra` liefert `Record<string, unknown>` → Spaltennamen NICHT tsc-geprüft. Die Namen wurden gegen prod + `convert-lead-to-claim.ts` verifiziert (die liest `lead.fahrzeug_hersteller`:128, `lead.fahrzeug_modell`:129, `lead.fahrzeugschaden_beschreibung`:296/380, `lead.gewerbe_flag`:359/629/801). NICHT raten.
- **Umlaute:** nutzersichtbare Strings mit echten ä/ö/ü/ß (Phase 3 kaum UI).
- **Subagent-cwd-Bug:** inline bauen (Controller-cwd = Worktree) ODER Subagenten `cd`-Zwang. [[coordination-subagent-cwd-worktree-contamination]]

## Feld-Mapping (Wizard → Lead-Spalte → Claim)
| Wizard-State | Lead-Spalte | Claim (convert) |
|---|---|---|
| `standort.{lat,lng,adresse}` | `fahrzeug_standort_{lat,lng,adresse}` | ✅ **schon Phase 1** (buildWerkstattFinderLeadExtra) |
| `hersteller` | `fahrzeug_hersteller` | vehicle.hersteller (:128/167) |
| `fahrzeugtyp` → `fahrzeugtypZuEuKlasse` | `fahrzeugklasse` | vehicle (Feld J) |
| `gewerbe` | `gewerbe_flag` | claims.gewerbe_flag :359 + claim_parties.ist_gewerbe :629 + Firma :801 |
| `modell` | `fahrzeug_modell` | vehicle.modell (:129/168) |
| Schaden-Freitext `beschreibung` | `fahrzeugschaden_beschreibung` | Feststellung (:296/380/914) |
| `bedarf`, `fotos` | `bedarf_*`, `schadensfoto_urls` | ✅ **schon Phase 1/2** |

**NICHT im Embed** (später im Flow): `firma_name`, `vorsteuerabzugsberechtigt`, Kennzeichen, Wunschtermin. Der Embed setzt nur `gewerbe_flag`; die Firma-Entität entsteht erst, wenn der Flow `firma_name` nachträgt (convert :801 gate `gewerbe_flag && firma_name`).

## Doppel-Lead-Falle — BEWUSST DEFERRED (koordinieren, nicht spekulativ bauen)
Spec §10 („optional leadId/Token → UPDATE statt INSERT") braucht einen **Token-basierten Entry-Point** (ein roher client-übergebener `leadId` = IDOR-Risiko). Diesen Entry-Point (Embed aus einem bestehenden Lead/Reservierung) besitzt/überschneidet die aktive `aar-956-embed-reservierung-rueckruf`-Lane. → NICHT hier bauen; als Follow-up mit aar-956 abstimmen (Token → server-validiert → leadId → UPDATE). Aktuelle Entry (`?lat&lng&plz`) hat keinen Lead → immer INSERT, kein Doppel-Lead-Risiko heute.

---

### Task 1: Contract-Felder in `buildWerkstattFinderLeadExtra` + `erstelleWerkstattFinderLead`

**Files:**
- Modify: `src/lib/werkstatt/embed-finder-core.ts` (`WerkstattFinderLeadInput` + `buildWerkstattFinderLeadExtra`)
- Modify: `src/app/embed/werkstatt-finder/actions.ts` (`WerkstattFinderLeadPayload` + `erstelleWerkstattFinderLead`)
- Test: `src/lib/werkstatt/__tests__/embed-finder-core.test.ts` (neu, falls nicht vorhanden) + `src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts`

**Interfaces:**
- Produces: `buildWerkstattFinderLeadExtra` setzt zusätzlich `fahrzeug_hersteller`, `fahrzeugklasse`, `fahrzeug_modell`, `gewerbe_flag`, `fahrzeugschaden_beschreibung`.

- [ ] **Step 1: Failing test (embed-finder-core)**
```ts
// src/lib/werkstatt/__tests__/embed-finder-core.test.ts
import { describe, it, expect } from 'vitest'
import { buildWerkstattFinderLeadExtra } from '../embed-finder-core'

describe('buildWerkstattFinderLeadExtra — Phase-3-Felder', () => {
  it('schreibt hersteller/klasse/modell/gewerbe/beschreibung in den extra', () => {
    const e = buildWerkstattFinderLeadExtra({
      werkstattId: null, werkstattEmail: null, kundeEmail: 'a@b.de',
      lat: 50.9, lng: 6.9, ort: 'Köln',
      hersteller: 'BMW', fahrzeugklasse: 'M1', gewerbe: true, modell: '3er', beschreibung: 'Kratzer im Lack',
    })
    expect(e.fahrzeug_hersteller).toBe('BMW')
    expect(e.fahrzeugklasse).toBe('M1')
    expect(e.fahrzeug_modell).toBe('3er')
    expect(e.gewerbe_flag).toBe(true)
    expect(e.fahrzeugschaden_beschreibung).toBe('Kratzer im Lack')
    expect(e.fahrzeug_standort_adresse).toBe('Köln')
  })
  it('leere/fehlende Strings -> null; gewerbe default false', () => {
    const e = buildWerkstattFinderLeadExtra({ werkstattId: null, werkstattEmail: null, kundeEmail: 'a@b.de', hersteller: '', modell: '' })
    expect(e.fahrzeug_hersteller).toBeNull()
    expect(e.fahrzeug_modell).toBeNull()
    expect(e.gewerbe_flag).toBe(false)
  })
})
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/werkstatt/__tests__/embed-finder-core.test.ts` → FAIL (Felder undefined).

- [ ] **Step 3: `WerkstattFinderLeadInput` + `buildWerkstattFinderLeadExtra` erweitern**
```ts
export type WerkstattFinderLeadInput = {
  werkstattId: string | null
  werkstattEmail: string | null
  kundeEmail: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
  // Phase 3: db-driven Übergabe der Wizard-Felder
  hersteller?: string | null
  fahrzeugklasse?: string | null
  gewerbe?: boolean | null
  modell?: string | null
  beschreibung?: string | null
}
```
Im `extra`-Objekt ergänzen (vor dem werkstattId-Block):
```ts
  const extra: Record<string, unknown> = {
    fahrzeug_standort_lat: input.lat ?? null,
    fahrzeug_standort_lng: input.lng ?? null,
    fahrzeug_standort_adresse: input.ort ?? null,
    fahrzeug_hersteller: input.hersteller?.trim() || null,
    fahrzeugklasse: input.fahrzeugklasse ?? null,
    fahrzeug_modell: input.modell?.trim() || null,
    gewerbe_flag: input.gewerbe ?? false,
    fahrzeugschaden_beschreibung: input.beschreibung?.trim() || null,
  }
```

- [ ] **Step 4: GREEN** — vitest → PASS.

- [ ] **Step 5: `erstelleWerkstattFinderLead` durchreichen**
`WerkstattFinderLeadPayload` (actions.ts) um `hersteller?`, `fahrzeugklasse?`, `gewerbe?`, `modell?`, `beschreibung?` erweitern; im `buildWerkstattFinderLeadExtra(...)`-Call ergänzen:
```ts
  const extra = buildWerkstattFinderLeadExtra({
    werkstattId: payload.werkstattId ?? null,
    werkstattEmail,
    kundeEmail: payload.email,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    ort: payload.ort ?? null,
    hersteller: payload.hersteller ?? null,
    fahrzeugklasse: payload.fahrzeugklasse ?? null,
    gewerbe: payload.gewerbe ?? null,
    modell: payload.modell ?? null,
    beschreibung: payload.beschreibung ?? null,
  })
```
Test-Case in `embed-actions.test.ts`: mock `buildWerkstattFinderLeadExtra` ODER `createLead` und assert, dass die Felder ankommen (dem File-Stil folgen).

- [ ] **Step 6: vitest embed + tsc-grep + Commit**
`npx vitest run src/lib/werkstatt src/app/embed/werkstatt-finder` → PASS. `npx tsc --noEmit | grep -E "embed-finder-core|werkstatt-finder/actions"` → leer.
```
feat(werkstatt-embed): Phase 3 — Contract-Felder auf den Lead (hersteller/klasse/modell/gewerbe/beschreibung)
```

---

### Task 2: Wizard liefert die Felder (beschreibung heben + absenden)

**Files:**
- Modify: `src/app/embed/werkstatt-finder/_components/SchadenStep.tsx` (`onBeschreibung`-Callback)
- Modify: `src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx` (beschreibung-State + absenden)

**Interfaces:**
- Consumes: `fahrzeugtypZuEuKlasse` (wizard-logic).

- [ ] **Step 1: SchadenStep — Freitext heben**
`onBeschreibung?: (text: string) => void` zu Props; im `onBlur`/`analysiereText` **und** onChange den Text hochreichen: `onBeschreibung?.(beschreibung)` (bei Änderung + bei Analyse). So landet der Roh-Freitext im Wizard, unabhängig vom KI-Ergebnis (Spec §14: „Text-Beschreibung wird immer persistiert").

- [ ] **Step 2: WerkstattWizard — State + Übergabe**
`const [beschreibung, setBeschreibung] = useState('')`; `<SchadenStep ... onBeschreibung={setBeschreibung} />`. In `absenden` den `erstelleWerkstattFinderLead`-Payload erweitern:
```ts
        hersteller: state.hersteller.trim() || null,
        fahrzeugklasse: fahrzeugtypZuEuKlasse(state.fahrzeugtyp),
        gewerbe: state.gewerbe,
        modell: state.modell.trim() || null,
        beschreibung: beschreibung.trim() || null,
```
Import `fahrzeugtypZuEuKlasse` aus `./wizard-logic` (bereits `wizardStateZuSuche` etc. importiert — ergänzen).

- [ ] **Step 3: Smoke bleibt grün + tsc + Commit**
`npx vitest run src/app/embed/werkstatt-finder` → PASS (Smokes unverändert grün). `npx tsc --noEmit | grep -E "SchadenStep|WerkstattWizard"` → leer.
```
feat(werkstatt-embed): Phase 3 — Wizard reicht alle Contract-Felder ans Lead-Absenden
```

---

### Task 3: Verifikation (Regel 4, nach Deploy)
- [ ] Prod-Smoke: Test-Lead über den Embed anlegen (`telefon=NULL`), dann `select fahrzeug_hersteller, fahrzeugklasse, fahrzeug_modell, gewerbe_flag, fahrzeugschaden_beschreibung, fahrzeug_standort_adresse from leads where id=<neu>` → alle gesetzt. Danach Lead→Claim converten und prüfen, dass claims.gewerbe_flag + vehicle.hersteller/modell + Feststellung.beschreibung ankommen. Im PR dokumentieren.

## Self-Review
**Spec-Coverage:** §3 Contract-Felder (hersteller/klasse/modell/gewerbe/beschreibung) → Task 1+2. §9 gewerbe-Durchlauf → convert prod-verifiziert (kein Embed-Code nötig außer Flag). §10 Doppel-Lead → **bewusst deferred** (Token-Entry + aar-956-Koordination). Standort + bedarf + fotos = schon Phase 1/2.
**Placeholder-Scan:** keine; Spaltennamen gegen prod + convert verifiziert.
**Typ-Konsistenz:** `gewerbe_flag: boolean`; Strings `?.trim() || null`; `fahrzeugklasse` = eu_klasse aus `fahrzeugtypZuEuKlasse` (M1/N1/N2/L3e/O2).
