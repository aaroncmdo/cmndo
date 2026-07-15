# Werkstatt-Finder-EMBED — Phase 2: Karte + Glass-Card-Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Werkstatt-Finder-Embed von der flachen Ein-Seiten-Form auf den Karten-Finder analog Gutachter-Embed heben: full-bleed Karte + mehrstufige Glass-Card (Standort → Fahrzeug → Schaden → Kontakt), Google-Places-Standort + „Aktuellen Standort", Mobile-Bottom-Sheet, scharfe Begründungs-Chips, und der Wizard füttert Marke + Fahrzeugklasse in die gerankte Engine (Live-Re-Rank).

**Architecture:** Ein **client-seitiger Kompositions-Root** (`WerkstattFinderEmbedClient`) hält den geteilten State (`rows`/`center`/`selectedId`/`loading`/`keineSpezialisierte`) und die Such-Funktion. Er rendert die **Shell** (`WerkstattFinderShell` — full-bleed Mapbox-Karte mit Werkstatt-Pins + Fahrzeug-Anker, freischwebende Glass-Spalte auf Desktop, ziehbares Bottom-Sheet auf Mobil) und übergibt ihr den **Wizard** (`WerkstattWizard` — 4-Schritt Glass-Card) als `wizardSlot`. Der Wizard sammelt die Engine-Inputs und ruft bei jeder relevanten Änderung `onSearch` → Re-Rank; die Ergebnisse (`rows`) fließen als Props zurück in Shell (Pins) und Wizard (Ergebnis-Liste). **Bewusste Abweichung vom Gutachter-`FinderMap`:** dort kommunizieren Wizard und Karte über einen DOM-Event-Bus, weil die SV-Pins server-geladen und separat gemountet sind — hier sind die Pins die **dynamischen Suchergebnisse**, also ist gehobener Client-State + Props einfacher und testbarer.

**Tech Stack:** Next.js (App Router), TypeScript, React (Client Components), Mapbox GL (`@/lib/mapbox/client`), Google Places JS + Geocoding, Vitest (env=node, `renderToStaticMarkup`), Playwright (Prod-Smoke).

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/werkstatt-embed-phase2` (Worktree, off `staging` — enthält Phase 1 via gemergtem #4384), PR gegen `staging`, **kein** Direct-Push auf `main`.
- **Regel 2:** Phase 2 braucht **kein DDL** (GBP-Spalten kamen mit Phase 1, Mig `20260715114357`). Sollte doch DDL nötig werden: **nur** via `mcp__plugin_supabase_supabase__apply_migration` + File nach getrackter Version benennen. `execute_sql` nur READ.
- **Regel 4:** Nach Prod-Deploy vollständiger Playwright-Smoke; Test-Konten/-Leads `telefon=NULL`.
- **Umlaute (VERBINDLICH):** Phase 2 ist schwer UI — **alle** nutzersichtbaren Strings mit echten `ä/ö/ü/ß/Ä/Ö/Ü/ß` (nie `ae/oe/ue/ss`). Betrifft jede Headline, jedes Label, jeden Button, jede Fehlermeldung.
- **Komponenten-Set:** Buttons aus `@/components/primitives` (`Button`, `onClick`/`variant`, `loading`). **Ausnahme (dokumentiert, analog bestehendem `FinderWizard`):** die Finder-Glass-Card nutzt das bespoke `GlassSurface` (frosted-glass Marketing-Look) statt `primitives.Card` — das ist die etablierte UI-Sprache des Gutachter-Embeds, kein handgerolltes Card-Muster gegen den Ratchet. Ergebnis-Liste = die geteilte `WerkstattFinder`-Card (nicht neu bauen).
- **Token-Audit:** Kein bracket-hex in `className`; Claimondo-Tokens (`bg-claimondo-*`, `text-*`, `rounded-ios-*`, `text-body*`/`text-heading*`). Mapbox-Marker brauchen raw hex → File bekommt den `// Token-Audit-Skip: Mapbox-GL erwartet raw hex ...`-Header (wie `src/components/kunde/WerkstattFinderMap.tsx`).
- **Mapbox-Import:** **immer** `import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'` — **NICHT** aus `@/lib/mapbox` (Barrel re-exportiert THREE.js/Cesium → „i.Color is not a constructor"-Crash im minified Build). Plus `import 'mapbox-gl/dist/mapbox-gl.css'`.
- **Engine-API:** `ladeWerkstattVorschlaege({ fahrzeugklasse, marke, bedarf: string[], bedarfConfidence, anker, limit, nurEchte })` aus `@/lib/werkstatt/matching/lade-vorschlaege`. `WerkstattVorschlag` (aus `@/lib/werkstatt/matching/rank-vorschlaege`) trägt `gewerkeFit` (**nicht** `fit`), `gruende: MatchGrund[]`, `passt`, `markenMatch`, `distanz_km`, `verifiziert`, Identität (`id,name,adresse_*,telefon,lat,lng`). `HART_SCHWELLE = 60` (ab da hart-gefiltert; Engine fällt bei 0 Treffern auf Geo-nächste zurück).
- **Test-Infra:** Vitest läuft `env=node`; Komponenten werden mit `renderToStaticMarkup` (react-dom/server) gesmoked — **kein** jsdom, **kein** @testing-library. Interaktivität (Klicks/State/Drag) ist damit **nicht** testbar → dafür `tsc` + Build + Playwright. Pure Logik = echtes TDD.
- **Worktree-tsc:** node_modules ist eine Junction aufs Haupt-`node_modules`; `npx tsc --noEmit` zeigt ~11 **vorbestehende** Fehler (jsqr/@turf/remotion). Nur auf geänderte Files filtern (`... | grep <file>`) **oder** IDE-`getDiagnostics` (0 = grün).
- **Phasen-Grenze:** Phase 2 = UI + Such-Inputs (Marke/Fahrzeugklasse/Bedarf → Engine) + scharfe Chips + Geolocation. Die **Lead-Persistenz der neuen Felder** (gewerbe_flag, hersteller, fahrzeugklasse, standort_adresse, beschreibung) und die **Doppel-Lead-Falle** (`leadId`→UPDATE) sind **Phase 3** — der Wizard sammelt die Daten in State, der Submit nutzt die bestehende `erstelleWerkstattFinderLead`-Signatur (email + lat/lng + ort + bedarf + fotos + optional werkstattId).

## Betroffene Files

**Neu (`src/app/embed/werkstatt-finder/_components/`):**
- `wizard-logic.ts` — pure Logik (Fahrzeugtyp→EU-Klasse, Hersteller-Liste, State-Typ, `kannWeiter`, `manuelleGewerkeZuBedarf`, `wizardStateZuSuche`). **TDD.**
- `GlassSurface.tsx` — lokale Kopie der Glass-Card-Fläche (12 Zeilen, wie im Gutachter-Embed).
- `StandortStep.tsx` — Google-Places-Feld + „Aktuellen Standort verwenden".
- `FahrzeugStep.tsx` — Hersteller (Datalist) · Fahrzeugtyp · gewerblich/privat · Modell.
- `SchadenStep.tsx` — eine von: Fotos · Beschreibung · manuelle Gewerke.
- `WerkstattWizard.tsx` — 4-Schritt Glass-Card-Komposition + Fortschritt + Ergebnis-Liste + Submit.
- `WerkstattFinderShell.tsx` — Mapbox-Karte + Desktop-Sidebar + Mobile-Bottom-Sheet (`wizardSlot`).

**Geändert:**
- `src/app/embed/werkstatt-finder/actions.ts` — `sucheEchteWerkstaetten(+marke,+fahrzeugklasse)`; neu `klassifiziereSchadenbeschreibungEmbed`, `holeAdresseFuerStandort`.
- `src/lib/google-geocoding/geocode-address.ts` — neu `reverseGeocodeAddress(lat,lng)`.
- `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` — Rebuild als Kompositions-Root; `ohneChipsFuerPhase1` **entfernen**.

---

### Task 1: Wizard-Logik-Kern (pure)

Die testbaren reinen Funktionen, auf denen der Wizard aufsetzt. Kein React.

**Files:**
- Create: `src/app/embed/werkstatt-finder/_components/wizard-logic.ts`
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/wizard-logic.test.ts`

**Interfaces:**
- Consumes: `Gewerk`, `Reparaturbedarf`, `GEWERKE` aus `@/lib/werkstatt/bedarf/types`.
- Produces: `Fahrzeugtyp`, `FAHRZEUGTYP_OPTIONEN`, `fahrzeugtypZuEuKlasse(typ)`, `HAEUFIGE_HERSTELLER`, `WerkstattWizardState`, `WIZARD_INITIAL`, `WizardStep`, `WIZARD_STEPS`, `kannWeiter(step, state)`, `manuelleGewerkeZuBedarf(gewerke)`, `wizardStateZuSuche(state)`.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/app/embed/werkstatt-finder/_components/__tests__/wizard-logic.test.ts
import { describe, it, expect } from 'vitest'
import {
  fahrzeugtypZuEuKlasse,
  manuelleGewerkeZuBedarf,
  kannWeiter,
  wizardStateZuSuche,
  WIZARD_INITIAL,
  FAHRZEUGTYP_OPTIONEN,
} from '../wizard-logic'

describe('fahrzeugtypZuEuKlasse', () => {
  it('mappt jeden Typ auf seine repräsentative EU-Klasse', () => {
    expect(fahrzeugtypZuEuKlasse('pkw')).toBe('M1')
    expect(fahrzeugtypZuEuKlasse('transporter')).toBe('N1')
    expect(fahrzeugtypZuEuKlasse('lkw')).toBe('N2')
    expect(fahrzeugtypZuEuKlasse('motorrad')).toBe('L3e')
    expect(fahrzeugtypZuEuKlasse('anhaenger')).toBe('O2')
  })
  it('FAHRZEUGTYP_OPTIONEN hat PKW als erste (Default) Option', () => {
    expect(FAHRZEUGTYP_OPTIONEN[0].wert).toBe('pkw')
  })
})

describe('manuelleGewerkeZuBedarf', () => {
  it('quelle=manuell, confidence 70 bei Auswahl, filtert Nicht-Gewerke', () => {
    const b = manuelleGewerkeZuBedarf(['karosserie', 'quatsch' as never, 'lackierung'])
    expect(b.kategorien).toEqual(['karosserie', 'lackierung'])
    expect(b.quelle).toBe('manuell')
    expect(b.confidence).toBe(70)
  })
  it('leere Auswahl → confidence 0', () => {
    expect(manuelleGewerkeZuBedarf([])).toEqual({ kategorien: [], quelle: 'manuell', confidence: 0 })
  })
})

describe('kannWeiter', () => {
  it('standort: nur mit gesetztem Standort', () => {
    expect(kannWeiter('standort', WIZARD_INITIAL)).toBe(false)
    expect(kannWeiter('standort', { ...WIZARD_INITIAL, standort: { adresse: 'x', lat: 1, lng: 2 } })).toBe(true)
  })
  it('fahrzeug: nur mit Hersteller', () => {
    expect(kannWeiter('fahrzeug', WIZARD_INITIAL)).toBe(false)
    expect(kannWeiter('fahrzeug', { ...WIZARD_INITIAL, hersteller: 'BMW' })).toBe(true)
  })
  it('schaden: nur mit Bedarf-Kategorien', () => {
    expect(kannWeiter('schaden', WIZARD_INITIAL)).toBe(false)
    expect(
      kannWeiter('schaden', { ...WIZARD_INITIAL, bedarf: { kategorien: ['glas'], quelle: 'manuell', confidence: 70 } }),
    ).toBe(true)
  })
})

describe('wizardStateZuSuche', () => {
  it('setzt lat/lng aus standort, marke aus hersteller, fahrzeugklasse aus typ', () => {
    const s = {
      ...WIZARD_INITIAL,
      standort: { adresse: 'Köln', lat: 50.9, lng: 6.9 },
      hersteller: '  BMW  ',
      fahrzeugtyp: 'motorrad' as const,
      bedarf: { kategorien: ['mechanik'] as const, quelle: 'manuell' as const, confidence: 70 },
    }
    const r = wizardStateZuSuche(s)
    expect(r.lat).toBe(50.9)
    expect(r.lng).toBe(6.9)
    expect(r.marke).toBe('BMW')
    expect(r.fahrzeugklasse).toBe('L3e')
    expect(r.bedarf?.kategorien).toEqual(['mechanik'])
  })
  it('leerer Hersteller → marke null', () => {
    expect(wizardStateZuSuche(WIZARD_INITIAL).marke).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/wizard-logic.test.ts`
Expected: FAIL — `Cannot find module '../wizard-logic'`.

- [ ] **Step 3: `wizard-logic.ts` implementieren**

```ts
// src/app/embed/werkstatt-finder/_components/wizard-logic.ts
// Pure Logik für den Werkstatt-Finder-Wizard (Phase 2). Kein React — testbar isoliert.
import type { Gewerk, Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'

// Aaron-Vorgabe: PKW/Transporter/LKW/Motorrad/Anhänger, Default PKW. Jeder grobe Typ mappt auf
// eine REPRÄSENTATIVE EU-Klasse — leads.fahrzeugklasse speichert eu_klasse, die Engine löst die
// reparatur_gruppe daraus auf (fahrzeugklassen-Tabelle). Der ZB1/Schein-OCR im /flow verfeinert später.
export type Fahrzeugtyp = 'pkw' | 'transporter' | 'lkw' | 'motorrad' | 'anhaenger'

export const FAHRZEUGTYP_OPTIONEN: { wert: Fahrzeugtyp; label: string; euKlasse: string }[] = [
  { wert: 'pkw', label: 'PKW', euKlasse: 'M1' },
  { wert: 'transporter', label: 'Transporter', euKlasse: 'N1' },
  { wert: 'lkw', label: 'LKW', euKlasse: 'N2' },
  { wert: 'motorrad', label: 'Motorrad', euKlasse: 'L3e' },
  { wert: 'anhaenger', label: 'Anhänger', euKlasse: 'O2' },
]

export function fahrzeugtypZuEuKlasse(typ: Fahrzeugtyp): string {
  return FAHRZEUGTYP_OPTIONEN.find((o) => o.wert === typ)?.euKlasse ?? 'M1'
}

// Datalist-Vorschläge fürs Hersteller-Feld (leads.fahrzeug_hersteller = freier Text; Liste ist Komfort).
export const HAEUFIGE_HERSTELLER = [
  'Audi', 'BMW', 'Mercedes-Benz', 'Volkswagen', 'Opel', 'Ford', 'Toyota', 'Škoda', 'Seat', 'Renault',
  'Peugeot', 'Citroën', 'Fiat', 'Volvo', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Honda', 'Suzuki',
  'Dacia', 'Mini', 'Tesla', 'Porsche', 'Cupra',
] as const

export type WerkstattWizardState = {
  standort: { adresse: string; lat: number; lng: number } | null
  hersteller: string
  fahrzeugtyp: Fahrzeugtyp
  gewerbe: boolean
  modell: string
  bedarf: Reparaturbedarf | null
}

export const WIZARD_INITIAL: WerkstattWizardState = {
  standort: null,
  hersteller: '',
  fahrzeugtyp: 'pkw',
  gewerbe: false,
  modell: '',
  bedarf: null,
}

export type WizardStep = 'standort' | 'fahrzeug' | 'schaden' | 'kontakt'
export const WIZARD_STEPS: WizardStep[] = ['standort', 'fahrzeug', 'schaden', 'kontakt']

// Pflicht-Gate pro Schritt (Spec §4): Standort Pflicht · Hersteller Pflicht (Typ/gewerbe haben
// Defaults, Modell optional) · Schaden Pflicht (eine Bedarfs-Quelle) · Kontakt = im Wizard validiert.
export function kannWeiter(step: WizardStep, s: WerkstattWizardState): boolean {
  switch (step) {
    case 'standort':
      return s.standort != null
    case 'fahrzeug':
      return s.hersteller.trim().length > 0
    case 'schaden':
      return s.bedarf != null && s.bedarf.kategorien.length > 0
    case 'kontakt':
      return true
  }
}

// Manuelle Gewerke-Auswahl → Reparaturbedarf. confidence=70 (> HART_SCHWELLE 60): der Nutzer hat die
// Gewerke bewusst gewählt → hart auf passende Werkstätten filtern (Engine fällt bei 0 auf Geo-nächste zurück).
export function manuelleGewerkeZuBedarf(gewerke: Gewerk[]): Reparaturbedarf {
  const kategorien = gewerke.filter((g) => (GEWERKE as readonly string[]).includes(g))
  return { kategorien, quelle: 'manuell', confidence: kategorien.length ? 70 : 0 }
}

// Wizard-State → Eingabe für sucheEchteWerkstaetten (Task 2).
export function wizardStateZuSuche(s: WerkstattWizardState): {
  lat?: number
  lng?: number
  marke: string | null
  fahrzeugklasse: string | null
  bedarf?: Reparaturbedarf
} {
  return {
    lat: s.standort?.lat,
    lng: s.standort?.lng,
    marke: s.hersteller.trim() || null,
    fahrzeugklasse: fahrzeugtypZuEuKlasse(s.fahrzeugtyp),
    bedarf: s.bedarf ?? undefined,
  }
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/wizard-logic.test.ts`
Expected: PASS (alle Cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/werkstatt-finder/_components/wizard-logic.ts src/app/embed/werkstatt-finder/_components/__tests__/wizard-logic.test.ts
git commit -m "feat(werkstatt-embed): Phase 2 Wizard-Logik-Kern (Fahrzeugtyp/Bedarf/Gate/Sucheingabe)"
```

---

### Task 2: `sucheEchteWerkstaetten` nimmt Marke + Fahrzeugklasse

Die Such-Action reicht jetzt Marke + Fahrzeugklasse an die Engine → Marken-/Gruppen-Ranking wird scharf (bisher hart `null`).

**Files:**
- Modify: `src/app/embed/werkstatt-finder/actions.ts` (`sucheEchteWerkstaetten`)
- Test: `src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts` (Case ergänzen)

**Interfaces:**
- Consumes: `ladeWerkstattVorschlaege` (unverändert), `wizardStateZuSuche`-Output-Shape (aus Task 1).
- Produces: `sucheEchteWerkstaetten(input: { lat?, lng?, plz?, bedarf?, marke?: string | null, fahrzeugklasse?: string | null }) → { werkstaetten: WerkstattVorschlag[]; keineSpezialisierte: boolean }`.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts  (Case ergänzen)
import { describe, it, expect, vi } from 'vitest'

const ladeMock = vi.fn()
vi.mock('@/lib/werkstatt/matching/lade-vorschlaege', () => ({ ladeWerkstattVorschlaege: ladeMock }))

import { sucheEchteWerkstaetten } from '../actions'

describe('sucheEchteWerkstaetten — Marke + Fahrzeugklasse durchreichen', () => {
  it('reicht marke + fahrzeugklasse an die Engine', async () => {
    ladeMock.mockResolvedValue([])
    await sucheEchteWerkstaetten({
      lat: 50.9, lng: 6.9, marke: 'BMW', fahrzeugklasse: 'M1',
      bedarf: { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 80 },
    })
    expect(ladeMock).toHaveBeenCalledWith(
      expect.objectContaining({ marke: 'BMW', fahrzeugklasse: 'M1', anker: { lat: 50.9, lng: 6.9 }, nurEchte: true }),
    )
  })
  it('ohne marke/fahrzeugklasse → null (Rückwärtskompatibel)', async () => {
    ladeMock.mockResolvedValue([])
    await sucheEchteWerkstaetten({ lat: 50.9, lng: 6.9 })
    expect(ladeMock).toHaveBeenCalledWith(expect.objectContaining({ marke: null, fahrzeugklasse: null }))
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts`
Expected: FAIL — heute hardcoded `marke: null, fahrzeugklasse: null` (der `marke:'BMW'`-Case schlägt fehl).

- [ ] **Step 3: `sucheEchteWerkstaetten` erweitern**

In `src/app/embed/werkstatt-finder/actions.ts` das Input-Objekt + den Engine-Call ändern (Rest der Funktion unverändert):

```ts
export async function sucheEchteWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
  bedarf?: Reparaturbedarf
  marke?: string | null
  fahrzeugklasse?: string | null
}): Promise<{ werkstaetten: WerkstattVorschlag[]; keineSpezialisierte: boolean }> {
  const anker = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null
  const b = sanitizeBedarf(input.bedarf)
  const werkstaetten = await ladeWerkstattVorschlaege({
    fahrzeugklasse: input.fahrzeugklasse ?? null,
    marke: input.marke ?? null,
    bedarf: b.kategorien,
    bedarfConfidence: b.confidence,
    anker,
    limit: 5,
    nurEchte: true,
  })
  return { werkstaetten, keineSpezialisierte: keineSpezialisierteGefunden(werkstaetten, b) }
}
```

> Die alten Kommentare „Phase 2: aus dem Wizard" an `fahrzeugklasse`/`marke` **entfernen** (jetzt erfüllt). `sucheWerkstaettenNachOrt` bleibt in diesem Task unverändert (wird in Task 9 auf Verwendung geprüft; der neue Wizard nutzt Places→Koordinaten→`sucheEchteWerkstaetten`).

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts`
Expected: PASS (neue + bestehende Cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/werkstatt-finder/actions.ts src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts
git commit -m "feat(werkstatt-embed): Suche reicht Marke + Fahrzeugklasse an die Engine (scharfes Ranking)"
```

---

### Task 3: Reverse-Geocode + „Aktuellen Standort"-Action

`navigator.geolocation` liefert nur Koordinaten. Für die Adress-Anzeige (Spec §7) fehlt ein Reverse-Geocoder — `geocode-address.ts` kann heute nur **forward** (Adresse→Koordinaten). Wir spiegeln das Muster für **reverse** (Koordinaten→Adresse) und wrappen es in eine schlanke Server-Action.

**Files:**
- Modify: `src/lib/google-geocoding/geocode-address.ts` (neu `reverseGeocodeAddress`)
- Modify: `src/app/embed/werkstatt-finder/actions.ts` (neu `holeAdresseFuerStandort`)
- Test: `src/lib/google-geocoding/__tests__/reverse-geocode.test.ts`

**Interfaces:**
- Consumes: `GeocodeReturn`, `GeocodeResult` (bestehende Typen im File).
- Produces: `reverseGeocodeAddress(lat: number, lng: number): Promise<GeocodeReturn>`; `holeAdresseFuerStandort(lat, lng): Promise<{ ok: true; adresse: string; lat: number; lng: number } | { ok: false; error: string }>`.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/google-geocoding/__tests__/reverse-geocode.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reverseGeocodeAddress } from '../geocode-address'

const originalFetch = global.fetch

describe('reverseGeocodeAddress', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = 'test-key' })
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks() })

  it('ruft die latlng-Geocoding-API und liefert die formatierte Adresse', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ status: 'OK', results: [{ formatted_address: 'Musterstr. 1, 50937 Köln', place_id: 'p1' }] }),
    })
    global.fetch = fetchMock as never
    const r = await reverseGeocodeAddress(50.9, 6.9)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.formatted_address).toBe('Musterstr. 1, 50937 Köln')
    expect(String(fetchMock.mock.calls[0][0])).toContain('latlng=50.9,6.9')
  })
  it('leere Ergebnisse → ok:false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 'ZERO_RESULTS', results: [] }) }) as never
    const r = await reverseGeocodeAddress(0, 0)
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/google-geocoding/__tests__/reverse-geocode.test.ts`
Expected: FAIL — `reverseGeocodeAddress` existiert nicht.

- [ ] **Step 3: `reverseGeocodeAddress` implementieren**

An `src/lib/google-geocoding/geocode-address.ts` **anhängen** (Typen `GeocodeReturn`/`GeocodeResult` sind schon da):

```ts
// Reverse-Geocoding: Koordinaten → formatierte Adresse (für „Aktuellen Standort verwenden" im
// Werkstatt-Finder). Spiegelt geocodeAddress, nur mit latlng-Param + language=de. Server-Key bevorzugt.
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<GeocodeReturn> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'Ungültige Koordinaten' }
  const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) return { ok: false, error: 'Google Maps API Key fehlt' }
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}&region=de&language=de&key=${key}`
    const resp = await fetch(url, { cache: 'no-store' })
    const data = (await resp.json()) as {
      status: string
      results?: Array<{ formatted_address?: string; place_id?: string }>
    }
    if (data.status !== 'OK' || !data.results?.length) {
      return { ok: false, error: `Reverse-Geocoding fehlgeschlagen: ${data.status}` }
    }
    const first = data.results[0]
    return {
      ok: true,
      data: {
        lat,
        lng,
        formatted_address: first.formatted_address ?? '',
        place_id: first.place_id ?? null,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reverse-Geocoding-Exception' }
  }
}
```

- [ ] **Step 4: Test grün bestätigen**

Run: `npx vitest run src/lib/google-geocoding/__tests__/reverse-geocode.test.ts`
Expected: PASS.

- [ ] **Step 5: Server-Action `holeAdresseFuerStandort` ergänzen**

In `src/app/embed/werkstatt-finder/actions.ts` den Import ergänzen und die Action anhängen:

```ts
// (oben bei den Imports)
import { reverseGeocodeAddress } from '@/lib/google-geocoding/geocode-address'

// „Aktuellen Standort verwenden": Client liefert Browser-Koordinaten, wir liefern die Adresse zurück.
// Fällt Reverse-Geocoding aus, reichen dem Anker die Koordinaten (Client zeigt „Aktueller Standort").
export async function holeAdresseFuerStandort(
  lat: number,
  lng: number,
): Promise<{ ok: true; adresse: string; lat: number; lng: number } | { ok: false; error: string }> {
  const r = await reverseGeocodeAddress(lat, lng)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, adresse: r.data.formatted_address, lat, lng }
}
```

- [ ] **Step 6: tsc auf die 2 Files + Commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "geocode-address|werkstatt-finder/actions"` → **kein** Output (0 Fehler auf den geänderten Files).

```bash
git add src/lib/google-geocoding/geocode-address.ts src/lib/google-geocoding/__tests__/reverse-geocode.test.ts src/app/embed/werkstatt-finder/actions.ts
git commit -m "feat(werkstatt-embed): Reverse-Geocode + holeAdresseFuerStandort (Aktuellen Standort)"
```

---

### Task 4: `klassifiziereSchadenbeschreibungEmbed` (Text-KI-Weg)

Die Text-Schadenbeschreibung als dritter Bedarfs-Weg (neben Foto + manuell). Wrappt den in Phase 1 gebauten Klassifikator und mappt das Output auf `Reparaturbedarf` mit `quelle='schadenbeschreibung'`.

**Files:**
- Modify: `src/app/embed/werkstatt-finder/actions.ts` (neu `klassifiziereSchadenbeschreibungEmbed`)
- Test: `src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts` (Case ergänzen)

**Interfaces:**
- Consumes: `klassifiziereSchadenbeschreibung` aus `@/lib/werkstatt/bedarf/schadenbeschreibung-gewerke` (Phase 1; Output `{ kategorien: Gewerk[]; confidence: number }`).
- Produces: `klassifiziereSchadenbeschreibungEmbed(beschreibung: string): Promise<Reparaturbedarf>` (`quelle='schadenbeschreibung'`, fail-safe `unbekannt`).

- [ ] **Step 1: Failing test schreiben**

```ts
// src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts  (Case ergänzen)
const klassMock = vi.fn()
vi.mock('@/lib/werkstatt/bedarf/schadenbeschreibung-gewerke', () => ({
  klassifiziereSchadenbeschreibung: klassMock,
}))

import { klassifiziereSchadenbeschreibungEmbed } from '../actions'

describe('klassifiziereSchadenbeschreibungEmbed', () => {
  it('mappt Klassifikator-Output auf quelle=schadenbeschreibung', async () => {
    klassMock.mockResolvedValue({ kategorien: ['karosserie'], confidence: 75 })
    const r = await klassifiziereSchadenbeschreibungEmbed('Stoßstange eingedrückt')
    expect(r).toEqual({ kategorien: ['karosserie'], quelle: 'schadenbeschreibung', confidence: 75 })
  })
  it('leere Kategorien → unbekannt', async () => {
    klassMock.mockResolvedValue({ kategorien: [], confidence: 0 })
    const r = await klassifiziereSchadenbeschreibungEmbed('unklar')
    expect(r).toEqual({ kategorien: [], quelle: 'unbekannt', confidence: 0 })
  })
})
```

> Hinweis: `vi.mock` wird gehoisted — der neue `vi.mock(...schadenbeschreibung-gewerke...)` gehört an den Anfang der Datei zu den anderen mocks; `klassMock` als weitere Top-Level-`const`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts`
Expected: FAIL — `klassifiziereSchadenbeschreibungEmbed` existiert nicht.

- [ ] **Step 3: Action implementieren**

Import + Action in `actions.ts` (analog `klassifiziereSchadenfotoEmbed`):

```ts
import { klassifiziereSchadenbeschreibung } from '@/lib/werkstatt/bedarf/schadenbeschreibung-gewerke'

// Text-KI-Weg fürs Embed: Freitext-Schadenbeschreibung → Gewerke-Bedarf (Phase-1-Klassifikator,
// fail-safe). Gleiche Output-Form wie klassifiziereSchadenfotoEmbed, quelle='schadenbeschreibung'.
export async function klassifiziereSchadenbeschreibungEmbed(beschreibung: string): Promise<Reparaturbedarf> {
  const text = beschreibung?.trim()
  if (!text) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  const { kategorien, confidence } = await klassifiziereSchadenbeschreibung(text)
  if (kategorien.length === 0) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  return { kategorien, quelle: 'schadenbeschreibung', confidence }
}
```

- [ ] **Step 4: Test grün + Commit**

Run: `npx vitest run src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts` → PASS.

```bash
git add src/app/embed/werkstatt-finder/actions.ts src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts
git commit -m "feat(werkstatt-embed): klassifiziereSchadenbeschreibungEmbed (Text-KI-Bedarfsweg)"
```

---

### Task 5: `GlassSurface` (lokal) + `StandortStep`

Die Glass-Card-Fläche (lokale Kopie, wie im Gutachter-Embed) und der erste Wizard-Schritt: EIN präzises Google-Places-Adressfeld + „Aktuellen Standort verwenden".

**Files:**
- Create: `src/app/embed/werkstatt-finder/_components/GlassSurface.tsx`
- Create: `src/app/embed/werkstatt-finder/_components/StandortStep.tsx`
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/StandortStep.test.tsx`

**Interfaces:**
- Consumes: `GooglePlaceAutocomplete` (default export) + `PlaceResult` aus `@/components/GooglePlaceAutocomplete`; `Button` aus `@/components/primitives`; `holeAdresseFuerStandort` aus `../actions` (Task 3).
- Produces: `GlassSurface({ children, className })`; `StandortStep({ standort, onStandort })` mit `onStandort: (s: { adresse: string; lat: number; lng: number }) => void`.

- [ ] **Step 1: `GlassSurface.tsx` (verbatim, lokale Kopie)**

```tsx
// src/app/embed/werkstatt-finder/_components/GlassSurface.tsx
'use client'

// Glass-Card-Fläche fürs Finder-Overlay — 1:1 die Marketing-Glass-Cards (rounded-ios-lg +
// border-white/60 + bg-white/70 + shadow-glass-card + backdrop-blur-md). Lokale Kopie wie im
// Gutachter-Embed (kein cross-route Import).
import { cn } from '@/lib/utils'

export function GlassSurface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-ios-lg border border-white/60 bg-white/70 shadow-glass-card backdrop-blur-md', className)}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Failing smoke-test schreiben**

```tsx
// src/app/embed/werkstatt-finder/_components/__tests__/StandortStep.test.tsx
// env=node: renderToStaticMarkup. Places + Action gemockt (kein Google-Script, kein Server).
import { describe, it, expect, vi } from 'vitest'
vi.mock('../actions', () => ({ holeAdresseFuerStandort: vi.fn() }))
vi.mock('@/components/GooglePlaceAutocomplete', () => ({
  __esModule: true,
  default: () => { const React = require('react') as typeof import('react'); return React.createElement('input', { 'data-testid': 'places' }) },
}))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { StandortStep } from '../StandortStep'

describe('StandortStep', () => {
  it('zeigt die Standort-Frage + den „Aktuellen Standort"-Button', () => {
    const html = renderToStaticMarkup(React.createElement(StandortStep, { standort: null, onStandort: () => {} }))
    expect(html).toContain('Wo steht das Fahrzeug?')
    expect(html).toContain('Aktuellen Standort verwenden')
  })
  it('zeigt die gewählte Adresse an', () => {
    const html = renderToStaticMarkup(
      React.createElement(StandortStep, { standort: { adresse: 'Musterstr. 1, Köln', lat: 50.9, lng: 6.9 }, onStandort: () => {} }),
    )
    expect(html).toContain('Musterstr. 1, Köln')
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/StandortStep.test.tsx`
Expected: FAIL — `Cannot find module '../StandortStep'`.

- [ ] **Step 4: `StandortStep.tsx` implementieren**

```tsx
// src/app/embed/werkstatt-finder/_components/StandortStep.tsx
'use client'

// Wizard-Schritt 1: Fahrzeugstandort. EIN präzises Google-Places-Adressfeld + „Aktuellen Standort
// verwenden" (Browser-Geolocation → Reverse-Geocode via Server-Action). Schreibt präzise Koordinaten
// (behebt „findet keine Werkstätten" des alten PLZ-only-Pfads).
import { useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { Button } from '@/components/primitives'
import { holeAdresseFuerStandort } from '../actions'

type Props = {
  standort: { adresse: string; lat: number; lng: number } | null
  onStandort: (s: { adresse: string; lat: number; lng: number }) => void
}

export function StandortStep({ standort, onStandort }: Props) {
  const [geoLaeuft, setGeoLaeuft] = useState(false)
  const [geoFehler, setGeoFehler] = useState<string | null>(null)

  function aktuellenStandort() {
    setGeoFehler(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoFehler('Standort wird von diesem Gerät nicht unterstützt.')
      return
    }
    setGeoLaeuft(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const r = await holeAdresseFuerStandort(lat, lng)
        setGeoLaeuft(false)
        if (r.ok) onStandort({ adresse: r.adresse, lat: r.lat, lng: r.lng })
        else onStandort({ adresse: 'Aktueller Standort', lat, lng })
      },
      () => {
        setGeoLaeuft(false)
        setGeoFehler('Standort konnte nicht ermittelt werden — bitte die Adresse eingeben.')
      },
      { timeout: 8000, maximumAge: 60_000 },
    )
  }

  function onSelect(p: PlaceResult) {
    if (p.lat === 0 && p.lng === 0) return // Places-Treffer ohne Geometrie ignorieren
    onStandort({ adresse: p.adresse, lat: p.lat, lng: p.lng })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Wo steht das Fahrzeug?</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Wir finden die passenden Werkstätten in der Nähe des Fahrzeugstandorts.
        </p>
      </div>
      <GooglePlaceAutocomplete
        placeholder="Adresse eingeben…"
        defaultValue={standort?.adresse}
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        onSelect={onSelect}
      />
      <Button type="button" variant="ghost" onClick={aktuellenStandort} loading={geoLaeuft} className="self-start">
        <LocateFixed className="mr-1.5 h-4 w-4" /> Aktuellen Standort verwenden
      </Button>
      {standort && (
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-success-strong">
          <MapPin className="h-4 w-4 flex-shrink-0" /> {standort.adresse}
        </p>
      )}
      {geoFehler && <p className="text-[0.8125rem] text-danger-strong">{geoFehler}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Test grün + tsc + Commit**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/StandortStep.test.tsx` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "StandortStep|GlassSurface"` → kein Output.

```bash
git add src/app/embed/werkstatt-finder/_components/GlassSurface.tsx src/app/embed/werkstatt-finder/_components/StandortStep.tsx src/app/embed/werkstatt-finder/_components/__tests__/StandortStep.test.tsx
git commit -m "feat(werkstatt-embed): GlassSurface + StandortStep (Places + Aktueller Standort)"
```

---

### Task 6: `FahrzeugStep` + `SchadenStep`

Schritt 2 (Fahrzeug: Hersteller · Fahrzeugtyp · gewerblich/privat · Modell) und Schritt 3 (Schaden: eine von Fotos / Beschreibung / manuelle Gewerke).

**Files:**
- Create: `src/app/embed/werkstatt-finder/_components/FahrzeugStep.tsx`
- Create: `src/app/embed/werkstatt-finder/_components/SchadenStep.tsx`
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/FahrzeugStep.test.tsx`
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/SchadenStep.test.tsx`

**Interfaces:**
- Consumes: `FAHRZEUGTYP_OPTIONEN`, `HAEUFIGE_HERSTELLER`, `Fahrzeugtyp`, `manuelleGewerkeZuBedarf` (Task 1); `Button` aus `@/components/primitives`; `Reparaturbedarf`, `Gewerk`, `GEWERKE` aus `@/lib/werkstatt/bedarf/types`; `klassifiziereSchadenbeschreibungEmbed`, `klassifiziereSchadenfotoEmbed` aus `../actions`; `EmbedFoto` aus `@/lib/werkstatt/bedarf/embed-foto-guard`.
- Produces:
  - `FahrzeugStep({ hersteller, fahrzeugtyp, gewerbe, modell, onChange })` mit `onChange: (patch: Partial<{ hersteller: string; fahrzeugtyp: Fahrzeugtyp; gewerbe: boolean; modell: string }>) => void`.
  - `SchadenStep({ bedarf, onBedarf })` mit `onBedarf: (b: Reparaturbedarf | null) => void`.

- [ ] **Step 1: Failing smoke-tests**

```tsx
// src/app/embed/werkstatt-finder/_components/__tests__/FahrzeugStep.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { FahrzeugStep } from '../FahrzeugStep'

describe('FahrzeugStep', () => {
  it('rendert Hersteller-Feld + alle Fahrzeugtyp-Optionen + gewerblich/privat', () => {
    const html = renderToStaticMarkup(
      React.createElement(FahrzeugStep, { hersteller: '', fahrzeugtyp: 'pkw', gewerbe: false, modell: '', onChange: () => {} }),
    )
    expect(html).toContain('Hersteller')
    expect(html).toContain('PKW')
    expect(html).toContain('Transporter')
    expect(html).toContain('Motorrad')
    expect(html).toContain('Anhänger')
    expect(html).toMatch(/gewerblich/i)
  })
})
```

```tsx
// src/app/embed/werkstatt-finder/_components/__tests__/SchadenStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
vi.mock('../actions', () => ({ klassifiziereSchadenbeschreibungEmbed: vi.fn(), klassifiziereSchadenfotoEmbed: vi.fn() }))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { SchadenStep } from '../SchadenStep'

describe('SchadenStep', () => {
  it('bietet alle drei Wege an (Fotos / Beschreibung / manuelle Auswahl)', () => {
    const html = renderToStaticMarkup(React.createElement(SchadenStep, { bedarf: null, onBedarf: () => {} }))
    expect(html).toMatch(/Foto/i)
    expect(html).toMatch(/beschreib/i)
    expect(html).toMatch(/Karosserie/i) // manuelle Gewerke-Auswahl
  })
})
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/FahrzeugStep.test.tsx src/app/embed/werkstatt-finder/_components/__tests__/SchadenStep.test.tsx`
Expected: FAIL — Module existieren nicht.

- [ ] **Step 3: `FahrzeugStep.tsx` implementieren**

```tsx
// src/app/embed/werkstatt-finder/_components/FahrzeugStep.tsx
'use client'

// Wizard-Schritt 2: Fahrzeug. Hersteller (freier Text + Datalist-Vorschläge) · Fahrzeugtyp
// (Button-Gruppe, Default PKW) · gewerblich/privat · Modell (optional). Speist Marke + Fahrzeugklasse
// in die Engine (via wizard-logic).
import { FAHRZEUGTYP_OPTIONEN, HAEUFIGE_HERSTELLER, type Fahrzeugtyp } from './wizard-logic'

type Props = {
  hersteller: string
  fahrzeugtyp: Fahrzeugtyp
  gewerbe: boolean
  modell: string
  onChange: (patch: Partial<{ hersteller: string; fahrzeugtyp: Fahrzeugtyp; gewerbe: boolean; modell: string }>) => void
}

export function FahrzeugStep({ hersteller, fahrzeugtyp, gewerbe, modell, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Ihr Fahrzeug</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Damit wir die passende Werkstatt (Marke &amp; Fahrzeugtyp) finden.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Hersteller
        </span>
        <input
          list="werkstatt-hersteller-liste"
          value={hersteller}
          onChange={(e) => onChange({ hersteller: e.target.value })}
          placeholder="z. B. BMW"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        />
        <datalist id="werkstatt-hersteller-liste">
          {HAEUFIGE_HERSTELLER.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </label>

      <div>
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Fahrzeugtyp
        </span>
        <div className="flex flex-wrap gap-2">
          {FAHRZEUGTYP_OPTIONEN.map((opt) => {
            const aktiv = opt.wert === fahrzeugtyp
            return (
              <button
                key={opt.wert}
                type="button"
                onClick={() => onChange({ fahrzeugtyp: opt.wert })}
                className={`rounded-ios-md border px-3 py-2 text-body-sm font-semibold transition-colors ${
                  aktiv
                    ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                    : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Nutzung
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ gewerbe: false })}
            className={`flex-1 rounded-ios-md border px-3 py-2 text-body-sm font-semibold transition-colors ${
              !gewerbe ? 'border-claimondo-ondo bg-claimondo-ondo text-white' : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
            }`}
          >
            Privat
          </button>
          <button
            type="button"
            onClick={() => onChange({ gewerbe: true })}
            className={`flex-1 rounded-ios-md border px-3 py-2 text-body-sm font-semibold transition-colors ${
              gewerbe ? 'border-claimondo-ondo bg-claimondo-ondo text-white' : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
            }`}
          >
            Gewerblich
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Modell <span className="font-normal normal-case text-claimondo-shield/50">(optional)</span>
        </span>
        <input
          value={modell}
          onChange={(e) => onChange({ modell: e.target.value })}
          placeholder="z. B. 3er, Golf …"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 4: `SchadenStep.tsx` implementieren**

Drei Wege, „eine von" Pflicht. Foto-Upload spiegelt das bestehende Muster aus `WerkstattFinderEmbedClient` (FileReader→base64→`klassifiziereSchadenfotoEmbed`). Beschreibung: Textarea → `klassifiziereSchadenbeschreibungEmbed` (on blur/Button). Manuell: Gewerke-Checkboxen → `manuelleGewerkeZuBedarf`. Jeder Weg ruft `onBedarf(...)`.

```tsx
// src/app/embed/werkstatt-finder/_components/SchadenStep.tsx
'use client'

// Wizard-Schritt 3: Schaden (Pflicht — eine von drei Quellen). Fotos (Vision-KI) · Beschreibung
// (Text-KI) · manuelle Gewerke-Auswahl. Jede Quelle setzt den Reparaturbedarf → Live-Re-Rank.
import { useRef, useState } from 'react'
import { Button } from '@/components/primitives'
import { GEWERKE, type Gewerk, type Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import type { EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'
import { klassifiziereSchadenfotoEmbed, klassifiziereSchadenbeschreibungEmbed } from '../actions'
import { manuelleGewerkeZuBedarf } from './wizard-logic'

const MAX_FOTOS = 3
const GEWERK_LABEL: Record<Gewerk, string> = {
  karosserie: 'Karosserie',
  lackierung: 'Lackierung',
  mechanik: 'Mechanik',
  glas: 'Glas',
  smart_repair: 'Smart Repair',
}

type Props = {
  bedarf: Reparaturbedarf | null
  onBedarf: (b: Reparaturbedarf | null) => void
}

export function SchadenStep({ bedarf, onBedarf }: Props) {
  const [beschreibung, setBeschreibung] = useState('')
  const [fotoLaeuft, setFotoLaeuft] = useState(false)
  const [textLaeuft, setTextLaeuft] = useState(false)
  const [fotoAnzahl, setFotoAnzahl] = useState(0)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const manuell = new Set<Gewerk>(bedarf?.quelle === 'manuell' ? bedarf.kategorien : [])

  async function onFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = Array.from(e.target.files ?? []).slice(0, MAX_FOTOS)
    if (dateien.length === 0) return
    const fotos = await Promise.all(
      dateien.map(
        (datei) =>
          new Promise<EmbedFoto>((resolve) => {
            const reader = new FileReader()
            reader.onerror = () => resolve({ media_type: '', data: '' })
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              if (!dataUrl?.includes(',')) return resolve({ media_type: '', data: '' })
              const [header, data] = dataUrl.split(',')
              resolve({ media_type: header.replace('data:', '').replace(';base64', ''), data })
            }
            reader.readAsDataURL(datei)
          }),
      ),
    )
    setFotoAnzahl(fotos.length)
    setFotoLaeuft(true)
    try {
      const b = await klassifiziereSchadenfotoEmbed(fotos)
      onBedarf(b)
    } finally {
      setFotoLaeuft(false)
    }
  }

  async function analysiereText() {
    if (!beschreibung.trim()) return
    setTextLaeuft(true)
    try {
      onBedarf(await klassifiziereSchadenbeschreibungEmbed(beschreibung))
    } finally {
      setTextLaeuft(false)
    }
  }

  function toggleGewerk(g: Gewerk) {
    const next = new Set(manuell)
    if (next.has(g)) next.delete(g)
    else next.add(g)
    const b = manuelleGewerkeZuBedarf(Array.from(next))
    onBedarf(b.kategorien.length ? b : null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Was ist beschädigt?</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Fotos, kurze Beschreibung oder direkt die Bereiche wählen — eines genügt.
        </p>
      </div>

      {/* Fotos */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="mb-1 text-body-sm font-semibold text-claimondo-navy">Schadenfotos</p>
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="hidden"
          onChange={onFotos}
        />
        <Button type="button" variant="ghost" onClick={() => fotoInputRef.current?.click()} loading={fotoLaeuft}>
          {fotoAnzahl > 0 ? `${fotoAnzahl} Foto${fotoAnzahl > 1 ? 's' : ''} ausgewählt` : 'Fotos auswählen'}
        </Button>
      </div>

      {/* Beschreibung */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="mb-1 text-body-sm font-semibold text-claimondo-navy">Kurze Beschreibung</p>
        <textarea
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          onBlur={analysiereText}
          rows={2}
          placeholder="z. B. Stoßstange eingedrückt, Kratzer im Lack"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        />
        <Button type="button" variant="ghost" onClick={analysiereText} loading={textLaeuft} disabled={!beschreibung.trim()}>
          Beschreibung analysieren
        </Button>
      </div>

      {/* Manuelle Gewerke */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="mb-2 text-body-sm font-semibold text-claimondo-navy">Oder Bereiche direkt wählen</p>
        <div className="flex flex-wrap gap-2">
          {GEWERKE.map((g) => {
            const aktiv = manuell.has(g)
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGewerk(g)}
                className={`rounded-ios-md border px-3 py-1.5 text-body-sm font-semibold transition-colors ${
                  aktiv ? 'border-claimondo-ondo bg-claimondo-ondo text-white' : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
                }`}
              >
                {GEWERK_LABEL[g]}
              </button>
            )
          })}
        </div>
      </div>

      {bedarf && bedarf.kategorien.length > 0 && (
        <p className="text-[0.8125rem] text-success-strong">
          Erkannt: {bedarf.kategorien.map((k) => GEWERK_LABEL[k]).join(', ')}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Tests grün + tsc + Commit**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/FahrzeugStep.test.tsx src/app/embed/werkstatt-finder/_components/__tests__/SchadenStep.test.tsx` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "FahrzeugStep|SchadenStep"` → kein Output.

```bash
git add src/app/embed/werkstatt-finder/_components/FahrzeugStep.tsx src/app/embed/werkstatt-finder/_components/SchadenStep.tsx src/app/embed/werkstatt-finder/_components/__tests__/FahrzeugStep.test.tsx src/app/embed/werkstatt-finder/_components/__tests__/SchadenStep.test.tsx
git commit -m "feat(werkstatt-embed): FahrzeugStep + SchadenStep (Marke/Typ/gewerbe + 3 Bedarfswege)"
```

---

### Task 7: `WerkstattWizard` (4-Schritt Glass-Card-Komposition)

Die Glass-Card, die die Schritte + Fortschritt + Ergebnis-Liste + Submit zusammenhält. Ruft bei jeder such-relevanten Änderung `onSearch` (Live-Re-Rank) und rendert die geteilte `WerkstattFinder`-Liste. Struktur 1:1 nach `gutachter-finder/_components/FinderWizard.tsx` (GlassSurface + Fortschrittsbalken + `useState`-Phase-Machine + Zurück/Weiter).

**Files:**
- Create: `src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx`
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx`

**Interfaces:**
- Consumes: `GlassSurface` (Task 5), `StandortStep` (Task 5), `FahrzeugStep`/`SchadenStep` (Task 6), `WIZARD_INITIAL`/`WIZARD_STEPS`/`WizardStep`/`WerkstattWizardState`/`kannWeiter`/`wizardStateZuSuche` (Task 1); `WerkstattFinder` aus `@/components/werkstatt/finder/WerkstattFinder`; `Button` aus `@/components/primitives`; `WerkstattVorschlag` aus `@/lib/werkstatt/matching/rank-vorschlaege`; `erstelleWerkstattFinderLead` aus `../actions`.
- Produces: `WerkstattWizard(props: WerkstattWizardProps)` (siehe Typ unten).

```ts
export type WerkstattWizardProps = {
  rows: WerkstattVorschlag[]
  selectedId: string | null
  loading: boolean
  keineSpezialisierte: boolean
  onSelectWerkstatt: (id: string) => void
  // Vom Root: führt die Suche aus + hebt center; Wizard ruft es bei Standort/Marke/Typ/Bedarf-Änderung.
  onSuche: (input: ReturnType<typeof wizardStateZuSuche>) => void
}
```

- [ ] **Step 1: Failing smoke-test**

```tsx
// src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx
import { describe, it, expect, vi } from 'vitest'
vi.mock('../actions', () => ({ erstelleWerkstattFinderLead: vi.fn(), holeAdresseFuerStandort: vi.fn(), klassifiziereSchadenfotoEmbed: vi.fn(), klassifiziereSchadenbeschreibungEmbed: vi.fn() }))
vi.mock('@/components/GooglePlaceAutocomplete', () => ({ __esModule: true, default: () => { const R = require('react') as typeof import('react'); return R.createElement('input') } }))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WerkstattWizard } from '../WerkstattWizard'

describe('WerkstattWizard', () => {
  it('startet auf Schritt 1 (Standort) mit 4-Segment-Fortschritt', () => {
    const html = renderToStaticMarkup(
      React.createElement(WerkstattWizard, {
        rows: [], selectedId: null, loading: false, keineSpezialisierte: false,
        onSelectWerkstatt: () => {}, onSuche: () => {},
      }),
    )
    expect(html).toContain('Wo steht das Fahrzeug?')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx` → FAIL (Modul fehlt).

- [ ] **Step 3: `WerkstattWizard.tsx` implementieren**

Struktur (Phase-Machine + Fortschritt exakt wie `FinderWizard`; die Schritt-Inhalte kommen aus Task 5/6; Ergebnis-Liste = `WerkstattFinder`). Kern:

```tsx
// src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx
'use client'

// Werkstatt-Finder-Wizard (Phase 2) — 4-Schritt Glass-Card analog gutachter-finder/FinderWizard.
// Standort → Fahrzeug → Schaden → Kontakt. Jede such-relevante Änderung ruft onSuche (Live-Re-Rank);
// die Ergebnisse (rows) kommen als Props zurück und werden im Schaden-/Kontakt-Schritt als
// WerkstattFinder-Liste (mit Begründungs-Chips) gezeigt. Submit nutzt die bestehende Lead-Action
// (Phase 3 erweitert sie um die db-driven Übergabe der neuen Felder).
import { useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/primitives'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { GlassSurface } from './GlassSurface'
import { StandortStep } from './StandortStep'
import { FahrzeugStep } from './FahrzeugStep'
import { SchadenStep } from './SchadenStep'
import { erstelleWerkstattFinderLead } from '../actions'
import {
  WIZARD_INITIAL,
  WIZARD_STEPS,
  type WizardStep,
  type WerkstattWizardState,
  kannWeiter,
  wizardStateZuSuche,
} from './wizard-logic'

export type WerkstattWizardProps = {
  rows: WerkstattVorschlag[]
  selectedId: string | null
  loading: boolean
  keineSpezialisierte: boolean
  onSelectWerkstatt: (id: string) => void
  onSuche: (input: ReturnType<typeof wizardStateZuSuche>) => void
}

export function WerkstattWizard({
  rows,
  selectedId,
  loading,
  keineSpezialisierte,
  onSelectWerkstatt,
  onSuche,
}: WerkstattWizardProps) {
  const [state, setState] = useState<WerkstattWizardState>(WIZARD_INITIAL)
  const [stepIdx, setStepIdx] = useState(0)
  const [email, setEmail] = useState('')
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [fertig, setFertig] = useState(false)
  const [pending, startTransition] = useTransition()
  const step: WizardStep = WIZARD_STEPS[stepIdx]

  // State ändern + Suche neu auslösen, sobald Standort/Marke/Typ/Bedarf sich ändert.
  function patch(p: Partial<WerkstattWizardState>) {
    setState((prev) => {
      const next = { ...prev, ...p }
      onSuche(wizardStateZuSuche(next))
      return next
    })
  }

  function weiter() {
    if (!kannWeiter(step, state)) return
    setStepIdx((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
  }
  function zurueck() {
    setStepIdx((i) => Math.max(i - 1, 0))
  }

  function absenden() {
    setFehler(null)
    if (!email.trim()) {
      setFehler('Bitte E-Mail angeben.')
      return
    }
    startTransition(async () => {
      const res = await erstelleWerkstattFinderLead({
        vorname: vorname || null,
        nachname: nachname || null,
        email,
        telefon: telefon || null,
        werkstattId: selectedId,
        lat: state.standort?.lat ?? null,
        lng: state.standort?.lng ?? null,
        ort: state.standort?.adresse ?? null,
        bedarf: state.bedarf ?? undefined,
      })
      if (res.ok) window.location.href = `/flow/${res.token}`
      else setFehler(res.error)
    })
  }

  return (
    <GlassSurface className="flex flex-col gap-4 p-5 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out">
      {/* Fortschritt (4 Segmente, wie FinderWizard) */}
      {!fertig && (
        <div className="flex items-center gap-1.5">
          {WIZARD_STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`} />
          ))}
        </div>
      )}

      {step === 'standort' && (
        <StandortStep standort={state.standort} onStandort={(s) => patch({ standort: s })} />
      )}
      {step === 'fahrzeug' && (
        <FahrzeugStep
          hersteller={state.hersteller}
          fahrzeugtyp={state.fahrzeugtyp}
          gewerbe={state.gewerbe}
          modell={state.modell}
          onChange={patch}
        />
      )}
      {step === 'schaden' && (
        <>
          <SchadenStep bedarf={state.bedarf} onBedarf={(b) => patch({ bedarf: b })} />
          {/* Live-Ergebnisse mit Begründungs-Chips (gruende), sobald es Treffer gibt. */}
          {(loading || rows.length > 0) && (
            <WerkstattFinder
              werkstaetten={rows}
              onSelect={onSelectWerkstatt}
              selectedId={selectedId}
              loading={loading}
              keineSpezialisierte={keineSpezialisierte}
            />
          )}
        </>
      )}
      {step === 'kontakt' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-body font-bold text-claimondo-navy">Ihre Kontaktdaten</h3>
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              Damit wir Ihre Werkstatt-Anfrage bestätigen können.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={vorname} onChange={(e) => setVorname(e.target.value)} placeholder="Vorname" autoComplete="given-name"
              className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none" />
            <input value={nachname} onChange={(e) => setNachname(e.target.value)} placeholder="Nachname" autoComplete="family-name"
              className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none" />
          </div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" autoComplete="email"
            className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none" />
          <input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon (optional)" autoComplete="tel"
            className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none" />
          {rows.length > 0 && (
            <WerkstattFinder werkstaetten={rows} onSelect={onSelectWerkstatt} selectedId={selectedId} loading={loading} keineSpezialisierte={keineSpezialisierte} />
          )}
          {fehler && <p className="text-body-sm text-danger-strong">{fehler}</p>}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-1 flex items-center justify-between gap-2">
        {stepIdx > 0 ? (
          <button type="button" onClick={zurueck} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-claimondo-shield/70 hover:text-claimondo-ondo">
            <ChevronLeft className="h-4 w-4" /> Zurück
          </button>
        ) : (
          <span />
        )}
        {step === 'kontakt' ? (
          <Button onClick={absenden} loading={pending} variant="navy">
            {selectedId ? 'Werkstatt anfragen' : 'Anfrage absenden'}
          </Button>
        ) : (
          <Button onClick={weiter} disabled={!kannWeiter(step, state)} variant="navy">
            Weiter <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </GlassSurface>
  )
}
```

> `fertig`/Bestätigungs-Screen wie im FinderWizard ist hier bewusst schlank (Redirect nach `/flow`); die reiche Danke-Seite ist nicht Teil von Phase 2. `state`-Setter über `patch` lösen `onSuche` aus → der Root sucht neu (Task 9).

- [ ] **Step 4: Test grün + tsc + Commit**

Run: `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "WerkstattWizard"` → kein Output.

```bash
git add src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx
git commit -m "feat(werkstatt-embed): WerkstattWizard (4-Schritt Glass-Card + Live-Re-Rank + Chips)"
```

---

### Task 8: `WerkstattFinderShell` (Karte + Sidebar + Bottom-Sheet)

Die Kartenfläche analog Gutachter-`FinderMap`: full-bleed Mapbox mit Werkstatt-Pins + Fahrzeug-Anker-Pin, freischwebende Glass-Spalte (Desktop) und ziehbares Bottom-Sheet (Mobil), das den `wizardSlot` trägt. **Referenz zum 1:1-Adaptieren:** `src/app/embed/gutachter-finder/_components/FinderMap.tsx` — Desktop-Sidebar (Zeilen 828–964), Mobile-Bottom-Sheet (Zeilen 966–1028), Marker-Bau (Zeilen 72–140), Mapbox-Init (Zeilen 294–320). Die SV-Spezifika (Isochrone, Dead-Pins, Routing, DOM-Event-Listener, Profil-Popups) **entfallen** — hier zeichnen wir nur Werkstatt-Pins aus `rows` + einen Anker-Pin auf `center`.

**Files:**
- Create: `src/app/embed/werkstatt-finder/_components/WerkstattFinderShell.tsx`

**Interfaces:**
- Consumes: `ensureMapboxInitialized`, `mapboxgl` aus `@/lib/mapbox/client`; `WerkstattVorschlag` aus `@/lib/werkstatt/matching/rank-vorschlaege`; `mapbox-gl/dist/mapbox-gl.css`.
- Produces: `WerkstattFinderShell({ rows, center, selectedId, onSelectPin, wizardSlot })` mit `center: { lat: number; lng: number } | null`, `onSelectPin: (id: string) => void`, `wizardSlot: React.ReactNode`.

- [ ] **Step 1: Datei-Header + Grundgerüst (mit Token-Audit-Skip)**

Beginne die Datei mit:
```tsx
// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings für Marker-Fills.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

// Werkstatt-Finder-Shell (Phase 2) — full-bleed Mapbox-Karte (Werkstatt-Pins + Fahrzeug-Anker) mit
// freischwebender Glass-Spalte (Desktop) bzw. ziehbarem Bottom-Sheet (Mobil), das den Wizard trägt.
// UI-Sprache analog gutachter-finder/FinderMap, aber ohne SV-Spezifika (Isochrone/Dead-Pins/Routing):
// die Pins SIND die dynamischen Suchergebnisse (rows), Zustand kommt als Props (kein DOM-Event-Bus).
// WICHTIG: mapboxgl aus '@/lib/mapbox/client' (nicht Barrel — THREE.js/Cesium-Bundle-Crash).
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

const COL_NAVY = '#0D1B3E'
const DEFAULT_CENTER: [number, number] = [7.0, 51.0] // NRW
const DEFAULT_ZOOM = 8.5

type Props = {
  rows: WerkstattVorschlag[]
  center: { lat: number; lng: number } | null
  selectedId: string | null
  onSelectPin: (id: string) => void
  wizardSlot: React.ReactNode
}
```

- [ ] **Step 2: Map-Init + Pins + Anker (adaptiert aus `WerkstattFinderMap` + `FinderMap`)**

Nutze das Init-/Pin-Muster aus `src/components/kunde/WerkstattFinderMap.tsx` (Zeilen 43–109) — nummerierte Navy-Pins pro `rows[i]`, `fitBounds`, aber:
- Import aus `@/lib/mapbox/client` (nicht Barrel).
- Zusätzlich einen **Fahrzeug-Anker-Pin** auf `center` (car-Icon-Marker aus `FinderMap` Zeilen 644–655; Anchor `'bottom'`).
- Pin-Klick → `onSelectPin(w.id)` (statt nur lokalem highlight — hier ist `selectedId` ein Prop).
- `center`-Änderung → `map.flyTo`.

Effekt-Struktur:
```tsx
export function WerkstattFinderShell({ rows, center, selectedId, onSelectPin, wizardSlot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<MapboxMarker[]>([])
  const ankerRef = useRef<MapboxMarker | null>(null)
  const [sheetOffen, setSheetOffen] = useState(true)
  const dragStartRef = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Karte einmalig initialisieren.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!ensureMapboxInitialized()) {
      console.error('[werkstatt-finder] Mapbox-Init fehlgeschlagen — NEXT_PUBLIC_MAPBOX_TOKEN fehlt')
      return
    }
    const start: [number, number] = center ? [center.lng, center.lat] : DEFAULT_CENTER
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      language: 'de',
      center: start,
      zoom: center ? 11 : DEFAULT_ZOOM,
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Werkstatt-Pins bei jeder rows-Änderung neu setzen + fitBounds.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      const bounds = new mapboxgl.LngLatBounds()
      if (center) bounds.extend([center.lng, center.lat])
      rows.forEach((w, i) => {
        if (w.lat == null || w.lng == null) return
        const el = document.createElement('div')
        el.style.cssText = [
          'width:30px', 'height:30px', 'border-radius:9999px',
          `background:${COL_NAVY}`, 'border:3px solid #fff', 'box-shadow:0 3px 8px rgba(0,0,0,0.3)',
          'display:flex', 'align-items:center', 'justify-content:center',
          'color:#fff', 'font-weight:700', 'font-size:12px', 'cursor:pointer',
        ].join(';')
        el.textContent = String(i + 1)
        el.addEventListener('click', () => onSelectPin(w.id))
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([w.lng, w.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(w.name))
          .addTo(map)
        markersRef.current.push(marker)
        bounds.extend([w.lng, w.lat])
      })
      if (!bounds.isEmpty()) {
        try { map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 }) } catch { /* single point */ }
      }
    }
    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [rows, center, onSelectPin])

  // Fahrzeug-Anker-Pin auf center.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !center) return
    ankerRef.current?.remove()
    const el = document.createElement('div')
    el.setAttribute('aria-label', 'Fahrzeug-Standort')
    el.innerHTML = `<div style="width:18px;height:18px;border-radius:50%;background:${COL_NAVY};border:3px solid #fff;box-shadow:0 2px 6px rgba(13,27,62,0.35)"></div>`
    ankerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(map)
    map.flyTo({ center: [center.lng, center.lat], zoom: 12, duration: 800, essential: true })
  }, [center])
```

- [ ] **Step 3: Layout-Shell (Desktop-Sidebar + Mobile-Bottom-Sheet) — adaptiert aus `FinderMap`**

Rendere: äußeres `relative`-Wrapper mit `height: '100dvh'`; full-bleed Map-Container mit **inline** `position:absolute; inset:0` (der Mapbox-CSS-Gotcha, `FinderMap` Zeile 839–842); Desktop-Sidebar (`hidden lg:flex ... clamp(440px,33vw,620px)`, `FinderMap` Zeile 928–940) mit `wizardSlot`; Mobile-Bottom-Sheet (`lg:hidden ... translateY`, Chevron-Drag, `FinderMap` Zeile 973–1027) mit `wizardSlot`. Touch-Handler `dragStartRef`/`dragY`/`sheetOffen` exakt wie `FinderMap` Zeilen 989–1013.

```tsx
  return (
    <div className="relative w-full" style={{ height: '100dvh' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: 'var(--brand-surface, #FFFFFF)' }} />

      {/* Desktop: freischwebende Glass-Spalte */}
      <div
        className="hidden lg:flex flex-col absolute top-2 left-1 bottom-1 z-[10] overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ width: 'clamp(440px, 33vw, 620px)', padding: 20, scrollbarWidth: 'none' }}
      >
        {wizardSlot}
      </div>

      {/* Mobil: ziehbares Bottom-Sheet */}
      <div
        ref={sheetRef}
        className="lg:hidden absolute left-0 right-0 bottom-0 z-[10] transition-[transform] duration-500 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{
          transform: `${sheetOffen ? 'translateY(0)' : 'translateY(calc(100% - 56px))'} translateY(${dragY}px)`,
          transition: dragStartRef.current !== null ? 'none' : undefined,
        }}
      >
        <div
          className="rounded-t-[32px] border-x border-t border-white/50 bg-white/70 backdrop-blur-xl max-h-[85dvh] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
          style={{ boxShadow: '0 -14px 36px color-mix(in srgb, transparent 85%, var(--brand-primary, #0D1B3E))', scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => setSheetOffen((v) => !v)}
            onTouchStart={(e) => { dragStartRef.current = e.touches[0].clientY }}
            onTouchMove={(e) => {
              const start = dragStartRef.current
              if (start == null) return
              const dy = e.touches[0].clientY - start
              const maxDrag = Math.max(0, (sheetRef.current?.offsetHeight ?? 600) - 56)
              setDragY(sheetOffen ? Math.max(0, Math.min(dy, maxDrag)) : Math.min(0, Math.max(dy, -maxDrag)))
            }}
            onTouchEnd={(e) => {
              const start = dragStartRef.current
              dragStartRef.current = null
              setDragY(0)
              if (start == null) return
              e.preventDefault()
              const dy = e.changedTouches[0].clientY - start
              if (dy < -24) setSheetOffen(true)
              else if (dy > 24) setSheetOffen(false)
              else setSheetOffen((v) => !v)
            }}
            aria-label={sheetOffen ? 'Schließen' : 'Anfrage öffnen'}
            className="w-full px-5 pt-2.5 pb-1 flex items-center justify-center touch-none"
          >
            <ChevronUp className={`h-6 w-6 transition-transform duration-300 ${sheetOffen ? 'rotate-180' : ''}`} style={{ color: 'var(--brand-secondary, #4573A2)' }} />
          </button>
          <div className="px-1 pb-6 pt-1 [&>div]:bg-transparent [&>div]:border-transparent [&>div]:shadow-none [&>div]:backdrop-blur-none">
            {wizardSlot}
          </div>
        </div>
      </div>
    </div>
  )
}
```

> `selectedId` wird in Phase 2 auf der Karte noch nicht zusätzlich hervorgehoben (die Liste zeigt die Auswahl via Ring) — Pin-Highlight ist optionales Polish, nicht Pflicht. Kein `void`/unused-Var-Rest: falls `selectedId` sonst ungenutzt ist, im Marker-Bau den ausgewählten Pin optisch verstärken **oder** das Prop vorerst weglassen (Dead-Code-Check Task 9).

- [ ] **Step 4: Verifikation (Build, keine Unit-Tests für Mapbox-Shell)**

Run: `npx tsc --noEmit 2>&1 | grep -E "WerkstattFinderShell"` → kein Output.
> Kein renderToStaticMarkup-Test: die Shell ist reine Mapbox-/Touch-Integration (keine sinnvolle Server-Render-Assertion). Interaktivität wird im Prod-Smoke (Task 10) verifiziert.

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/werkstatt-finder/_components/WerkstattFinderShell.tsx
git commit -m "feat(werkstatt-embed): WerkstattFinderShell (Karte + Desktop-Sidebar + Mobile-Bottom-Sheet)"
```

---

### Task 9: Kompositions-Root + `ohneChipsFuerPhase1` entfernen

`WerkstattFinderEmbedClient` wird vom flachen Formular zum State-haltenden Root: hält `rows`/`center`/`selectedId`/`loading`/`keineSpezialisierte`, definiert `runSuche`, rendert `<WerkstattFinderShell wizardSlot={<WerkstattWizard .../>} />`. `ohneChipsFuerPhase1` **entfällt** → die Engine-`gruende` rendern als Chips.

**Files:**
- Modify: `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` (Rebuild)
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/embed-client.test.tsx` (schlanker Smoke)

**Interfaces:**
- Consumes: `WerkstattFinderShell`, `WerkstattWizard`, `sucheEchteWerkstaetten`, `wizardStateZuSuche`-Output-Shape.
- Produces: `WerkstattFinderEmbedClient({ initialLat?, initialLng?, initialPlz? })` (Props unverändert — `page.tsx` bleibt).

- [ ] **Step 1: `WerkstattFinderEmbedClient.tsx` neu schreiben**

```tsx
// src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx
'use client'

// Öffentlicher Werkstatt-Embed-Finder (Phase 2). Kompositions-Root: hält den geteilten Such-State
// und verdrahtet die Karten-Shell (Pins) mit dem Glass-Wizard (wizardSlot). Der Wizard sammelt die
// Engine-Inputs und ruft runSuche → gerankte Werkstätten mit Begründungs-Chips; Pins + Liste teilen
// sich denselben State.
import { useCallback, useEffect, useState } from 'react'
import { WerkstattFinderShell } from './_components/WerkstattFinderShell'
import { WerkstattWizard } from './_components/WerkstattWizard'
import { sucheEchteWerkstaetten } from './actions'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { wizardStateZuSuche } from './_components/wizard-logic'

type Props = { initialLat?: number; initialLng?: number; initialPlz?: string }

export function WerkstattFinderEmbedClient({ initialLat, initialLng, initialPlz }: Props) {
  const [rows, setRows] = useState<WerkstattVorschlag[]>([])
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [keineSpezialisierte, setKeineSpezialisierte] = useState(false)

  const runSuche = useCallback(async (input: ReturnType<typeof wizardStateZuSuche>) => {
    if (input.lat != null && input.lng != null) setCenter({ lat: input.lat, lng: input.lng })
    setLoading(true)
    try {
      const r = await sucheEchteWerkstaetten({
        lat: input.lat,
        lng: input.lng,
        marke: input.marke,
        fahrzeugklasse: input.fahrzeugklasse,
        bedarf: input.bedarf,
      })
      setRows(r.werkstaetten)
      setKeineSpezialisierte(r.keineSpezialisierte)
    } catch {
      setRows([])
      setKeineSpezialisierte(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initiale Suche aus den URL-Koordinaten (Karte zeigt sofort nahe Werkstätten).
  useEffect(() => {
    if (initialLat != null && initialLng != null) {
      void runSuche({ lat: initialLat, lng: initialLng, marke: null, fahrzeugklasse: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLng, initialPlz])

  return (
    <WerkstattFinderShell
      rows={rows}
      center={center}
      selectedId={selectedId}
      onSelectPin={setSelectedId}
      wizardSlot={
        <WerkstattWizard
          rows={rows}
          selectedId={selectedId}
          loading={loading}
          keineSpezialisierte={keineSpezialisierte}
          onSelectWerkstatt={setSelectedId}
          onSuche={runSuche}
        />
      }
    />
  )
}
```

- [ ] **Step 2: Dead-Code-Check**

- `ohneChipsFuerPhase1` ist mit dem Rebuild **weg** (war nur in der alten Datei).
- Prüfen, ob die alten Imports (`Button`, `TextField`, `WerkstattFinderMap`, `klassifiziereSchadenfotoEmbed`, `EmbedFoto`, `Reparaturbedarf`) noch gebraucht werden — im neuen Root **nein** (sie leben jetzt in den `_components`). Alle ungenutzten Imports entfernen.
- `sucheWerkstaettenNachOrt` in `actions.ts`: `grep -rn "sucheWerkstaettenNachOrt" src/` — wird sie außerhalb der alten (jetzt ersetzten) Datei noch konsumiert? Wenn **0** Consumer → in diesem Commit löschen (+ ihren Test-Case anpassen). Wenn Consumer existieren → lassen.

Run: `grep -rn "ohneChipsFuerPhase1\|sucheWerkstaettenNachOrt" src/`

- [ ] **Step 3: Schlanker Client-Smoke**

```tsx
// src/app/embed/werkstatt-finder/_components/__tests__/embed-client.test.tsx
import { describe, it, expect, vi } from 'vitest'
vi.mock('../../actions', () => ({ sucheEchteWerkstaetten: vi.fn().mockResolvedValue({ werkstaetten: [], keineSpezialisierte: false }), erstelleWerkstattFinderLead: vi.fn(), holeAdresseFuerStandort: vi.fn(), klassifiziereSchadenfotoEmbed: vi.fn(), klassifiziereSchadenbeschreibungEmbed: vi.fn() }))
vi.mock('../WerkstattFinderShell', () => ({ WerkstattFinderShell: ({ wizardSlot }: { wizardSlot: React.ReactNode }) => wizardSlot }))
vi.mock('@/components/GooglePlaceAutocomplete', () => ({ __esModule: true, default: () => { const R = require('react') as typeof import('react'); return R.createElement('input') } }))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WerkstattFinderEmbedClient } from '../../WerkstattFinderEmbedClient'

describe('WerkstattFinderEmbedClient', () => {
  it('rendert den Wizard (Schritt 1) über die Shell', () => {
    const html = renderToStaticMarkup(React.createElement(WerkstattFinderEmbedClient, {}))
    expect(html).toContain('Wo steht das Fahrzeug?')
  })
})
```
> Pfad-Hinweis: Test liegt in `_components/__tests__/`, der Client eine Ebene höher → Import `'../../WerkstattFinderEmbedClient'`, actions-Mock `'../../actions'`.

- [ ] **Step 4: Voller Build (Route geändert → Regel: Build, nicht nur tsc)**

Run: `npx vitest run src/app/embed/werkstatt-finder` → alle PASS.
Run: `npm run build` → grün (Next.js validiert die Embed-Route zur Build-Zeit).

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx src/app/embed/werkstatt-finder/_components/__tests__/embed-client.test.tsx src/app/embed/werkstatt-finder/actions.ts
git commit -m "feat(werkstatt-embed): Kompositions-Root (Karte+Wizard) + Chips scharf (ohneChipsFuerPhase1 entfernt)"
```

---

### Task 10: Phase-2-Verifikation (Regel 4, nach Deploy)

**Files:** keine (Smoke).

- [ ] **Step 1: Prod-Smoke planen + im PR dokumentieren**

Nach Merge+Deploy `https://app.claimondo.de/embed/werkstatt-finder?plz=50937` (bzw. `?lat=50.94&lng=6.96`) öffnen und per Playwright verifizieren (Screenshot + `inner_text()`, **nicht** `page.content()`-String-Matching — `&`→`&amp;`/uppercase-CSS lügt):
1. **Karte lädt** full-bleed, Glass-Wizard sichtbar (Desktop links / Mobil Bottom-Sheet).
2. **Schritt 1:** Adresse via Places **oder** „Aktuellen Standort verwenden" → Karte re-zentriert, Anker-Pin + Werkstatt-Pins erscheinen.
3. **Schritt 2:** Hersteller „BMW" + Fahrzeugtyp → Liste re-rankt (Marken-Chip erscheint bei gepflegten Werkstätten).
4. **Schritt 3:** Beschreibung „Kratzer im Lack" → Gewerke erkannt, Liste zeigt Begründungs-Chips (Gewerk).
5. **Schritt 4:** E-Mail (Test-Lead, `telefon=NULL`) → „Werkstatt anfragen" → Redirect `/flow/<token>`.
6. **Mobil:** Bottom-Sheet lässt sich per Chevron/Drag ein-/ausklappen.

Ergebnis (grün/rot + Screenshots) im PR vermerken. **Task bleibt offen bis grüner Smoke** (Regel 4). Verweist auf Task „Regel-4-Prod-Smokes nach Deploy".

> Datenpflege-Hinweis: Marken-/Gruppen-Chips ranken erst scharf, wenn Werkstätten `marken`/`fahrzeug_gruppen` gepflegt haben (Task „Werkstatt-Datenpflege"). Für den Smoke reicht: Werkstätten erscheinen + Gewerke-/Distanz-Chips + Re-Rank sichtbar.

---

## Self-Review

**Spec-Coverage (gegen `2026-07-15-werkstatt-finder-embed-rebuild-design.md`):**
- §4 Anfrage-Wizard (Standort/Fahrzeug/Schaden/Kontakt, Pflichtfelder) → Tasks 1,5,6,7.
- §7 Standort = Google Places + „Aktuellen Standort" (Reverse-Geocode) → Tasks 3,5.
- §8 UI Karte + Glass-Card + Mobile Bottom-Sheet (analog Gutachter) → Tasks 7,8,9.
- §5 Engine-Inputs Marke/Fahrzeugklasse/Bedarf + Chips → Tasks 1,2,6,7,9 (`ohneChipsFuerPhase1` entfernt).
- §14 Text-KI-Weg → Task 4 (+ Phase-1-Klassifikator).
- **Bewusst NICHT in Phase 2** (eigene Phasen/Tasks): db-driven Lead-Übergabe aller Felder + Doppel-Lead-Falle (§9/§10 = Phase 3); Entry-Point claimondo.de + Navbar (§11 = Phase 4); GBP-Trust-Chip-Anzeige/Refresh + Datenpflege-UI (§6 = Datenpflege-Task); KVA-Upload/Kalender/Tiers (§13).

**Placeholder-Scan:** keine „TBD". Task 8 (Mapbox-Shell) gibt vollständigen adaptierbaren Code + exakte Referenz-Zeilen in `FinderMap.tsx` statt Prosa; Task 9 Step 2 listet die konkreten Dead-Code-Checks (`grep`), rät nicht.

**Typ-Konsistenz:** `wizardStateZuSuche`-Output == `sucheEchteWerkstaetten`-Input (marke/fahrzeugklasse/lat/lng/bedarf). `WerkstattVorschlag` (nicht `WerkstattFinderRow`) trägt `gruende` → `WerkstattFinder` rendert Chips. `Reparaturbedarf.quelle` ∈ {schadenbild, schadenbeschreibung, manuell, unbekannt} (alle in `BedarfQuelle`, Phase 1). `Fahrzeugtyp`→eu_klasse deckt sich mit `fahrzeugklassen`-Seed (M1/N1/N2/L3e/O2). `GlassSurface`-Signatur == Gutachter-Kopie.

**Architektur-Divergenz dokumentiert:** lifted client state + props statt FinderMap-DOM-Event-Bus (Begründung im Header). Mapbox-Import aus `/client` (Barrel-Trap). Token-Audit-Skip-Header auf der Shell.

---

## Execution Handoff

Nach Speichern → Ausführung: **Subagent-Driven** (frischer Subagent je Task, Task-Review dazwischen, Whole-Branch-Review am Ende) oder **Inline** (executing-plans, Batch mit Checkpoints). Empfohlen: Subagent-Driven — die Tasks 1–4 sind mechanisch (kompletter Code im Plan → billiges Modell), 5–9 brauchen Integrations-Urteil.
