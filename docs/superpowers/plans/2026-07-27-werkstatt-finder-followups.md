# Werkstatt-Finder Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umkreis-gecapptes, distanz-primaeres Werkstatt-Ranking mit Verifizierungs-Gate fuer den Marken-Bonus (PR 1) plus Markenoffen-Toggle, Admin-Badges und Geo-Selbstheilung (PR 2).

**Architecture:** Alle Ranking-Aenderungen leben in der puren Engine `rank-vorschlaege.ts` (TDD-freundlich); der Loader `lade-vorschlaege.ts` reicht nur den neuen Cap durch. UI-Aenderungen sind additive Bausteine an bestehenden Pflege-Stellen (MarkenGruppenEditor, WerkstattSettings-MarkenCard, WerkstaettenClient, WerkstattDetailClient) nach deren etablierten Mustern.

**Tech Stack:** Next.js 15 Server-Actions, Supabase (SSR-Client mit RLS bzw. Admin-Client), vitest, Tailwind-Tokens (`rounded-ios-*`, `claimondo-*`), primitives.Button.

**Spec:** `docs/superpowers/specs/2026-07-27-werkstatt-finder-followups-design.md`

## Global Constraints

- Frontend-Strings mit echten Umlauten (ä/ö/ü/ß); Commits/Kommentare ASCII erlaubt.
- Server-Actions: Result-Object `{ ok, error? }`, kein throw; `revalidatePath` bei Writes.
- `MAX_UMKREIS_KM = 50`, Tiebreak-Rundung = ganze km (`Math.round`).
- Branch PR 1: `kitta/aar-956-wf-followups` (Spec+Plan liegen schon drauf), Base `staging`.
- Branch PR 2: NACH Merge von PR 1 frisch ab `origin/staging` (Stacked-PR-Falle vermeiden).
- Vor jedem PR: `npx vitest run <betroffene Suites>` gruen, `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` gruen, `npm run build` gruen (Server-Actions/Routen betroffen).

---

# PR 1 — Engine: Umkreis + Distanz-primaer + D4-Gate + Leer-Zustand

### Task 1: Engine-Kern (`rank-vorschlaege.ts`): D1 + D4

**Files:**
- Modify: `src/lib/werkstatt/matching/rank-vorschlaege.ts`
- Test: `src/lib/werkstatt/matching/__tests__/rank-vorschlaege.test.ts`

**Interfaces:**
- Produces: `export const MAX_UMKREIS_KM = 50`; `MatchingKontext.maxUmkreisKm?: number | null` (undefined = Default 50, null = ungecappt); Sortierung distanz-primaer; `bewerteMarke` mit Verifizierungs-Gate; Chip „Repariert {Marke}" bei unverifiziertem Treffer.
- Consumes: bestehende Typen `WerkstattKandidat`, `MatchGrund`, `Fit`, `MarkenMatch` (unveraendert).

- [x] **Step 1: Failing Tests schreiben** — im bestehenden Test-File einen neuen describe-Block ergaenzen und ZWEI bestehende Erwartungen an D4 anpassen:

Neuer Block (ans Datei-Ende; `werkstatt()`/`KONTEXT`-Fixtures existieren dort bereits — `werkstatt()` liefert default `verifiziert: false`, `lat/lng` nahe am `KONTEXT`-Anker):

```ts
// D1 (Aaron 27.07.): "Es koennen nur Werkstaetten in der Naehe gezeigt werden; Distanz
// muss immer schlagen." + D4: Vertragswerkstatt-Rang nur verifiziert.
describe('D1: Umkreis-Filter + Distanz primaer', () => {
  it('jenseits MAX_UMKREIS_KM unsichtbar — auch verifiziert (kein Fern-Fallback mehr)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'fern-verifiziert', verifiziert: true, lat: 53.54, lng: 8.58 }), // ~280 km
        werkstatt({ id: 'nah' }),
      ],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['nah'])
  })

  it('ohne Geo bei vorhandenem Anker unsichtbar (Naehe nicht belegbar)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-geo', lat: null, lng: null }), werkstatt({ id: 'mit-geo' })],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['mit-geo'])
  })

  it('ohne Anker bleibt alles sichtbar (kein Distanz-Wissen = kein Ausschluss)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-geo', lat: null, lng: null }), werkstatt({ id: 'mit-geo' })],
      { ...KONTEXT, anker: null },
    )
    expect(r).toHaveLength(2)
  })

  it('maxUmkreisKm=null hebt den Cap (interne Tools)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'fern', lat: 53.54, lng: 8.58 })],
      { ...KONTEXT, maxUmkreisKm: null },
    )
    expect(r.map((v) => v.id)).toEqual(['fern'])
  })

  it('Distanz schlaegt verifiziert: 2-km-unverifiziert vor 4-km-verifiziert', () => {
    // KONTEXT.anker aus dem Fixture; ~0,018 Grad Lat ~ 2 km.
    const a = KONTEXT.anker!
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'verifiziert-4km', verifiziert: true, lat: a.lat + 0.036, lng: a.lng }),
        werkstatt({ id: 'unverifiziert-2km', lat: a.lat + 0.018, lng: a.lng }),
      ],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['unverifiziert-2km', 'verifiziert-4km'])
  })

  it('gleiche km-Klasse: verifiziert gewinnt (Tiebreak-Kaskade lebt)', () => {
    const a = KONTEXT.anker!
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'unverif', lat: a.lat + 0.001, lng: a.lng }),
        werkstatt({ id: 'verif', verifiziert: true, lat: a.lat + 0.002, lng: a.lng }),
      ],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['verif', 'unverif'])
  })

  it('Eignungs-Fallback bleibt im Umkreis (liefert nie Ferne nach)', () => {
    // Bedarf hart (confidence >= HART_SCHWELLE), keiner im Umkreis passt, fern wuerde passen:
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'nah-passt-nicht', faehigkeiten: ['glas'] }),
        werkstatt({ id: 'fern-passt', faehigkeiten: ['karosserie'], lat: 53.54, lng: 8.58 }),
      ],
      { ...KONTEXT, bedarf: ['karosserie'], bedarfConfidence: 80 },
    )
    expect(r.map((v) => v.id)).toEqual(['nah-passt-nicht'])
  })
})

describe('D4: Marken-Rang nur verifiziert (Verifizierungs-Gate)', () => {
  it('verifiziert + Treffer -> marke + Vertragswerkstatt-Chip', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'w', marken: ['BMW'], verifiziert: true })],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('marke')
    expect(r[0].gruende.map((g) => g.text)).toContain('BMW-Vertragswerkstatt')
  })

  it('unverifiziert + Treffer -> frei-Rang, Chip "Repariert BMW", KEIN Vertrags-/Frei-Chip', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'w', marken: ['BMW'], verifiziert: false, ist_freie_werkstatt: false })],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('frei')
    const texte = r[0].gruende.map((g) => g.text)
    expect(texte).toContain('Repariert BMW')
    expect(texte).not.toContain('BMW-Vertragswerkstatt')
    expect(texte).not.toContain('Freie Werkstatt (alle Marken)')
  })

  it('lange Marken-Liste unverifiziert bringt keinen Bonus gegenueber markenoffen', () => {
    const a = KONTEXT.anker!
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'gamer', marken: ['BMW', 'Audi', 'VW', 'Opel', 'Ford'], lat: a.lat + 0.002, lng: a.lng }),
        werkstatt({ id: 'offen', ist_freie_werkstatt: true, lat: a.lat + 0.001, lng: a.lng }),
      ],
      { ...KONTEXT, marke: 'BMW' },
    )
    // gleiche km-Klasse, beide 'frei' -> naechster Tiebreak entscheidet, KEIN marke-Sprung des Gamers
    expect(r[0].markenMatch).toBe('frei')
    expect(r[1].markenMatch).toBe('frei')
  })

  it('Spezialist-Guard unveraendert: gepflegte Marken ohne Treffer bleiben unbekannt', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'w', marken: ['Audi'], verifiziert: true, ist_freie_werkstatt: false })],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('unbekannt')
  })
})
```

Bestehende Tests an die neue Semantik anpassen (bewusster Spec-Wechsel):
1. Alle Tests, die bei Marken-Treffer `markenMatch === 'marke'` erwarten (u. a. Zeilen ~43-50, ~124-138, „Marke schlaegt frei"): im Fixture `verifiziert: true` ergaenzen.
2. Der bestehende „ohne-geo"-Test (~Zeile 252, erwartet Distanz-Chip-Verhalten bei Infinity): auf `{ ...KONTEXT, anker: null }` umstellen (ohne Anker bleibt ohne-Geo sichtbar).
3. Sortier-Tests mit identischen Fixture-Koordinaten bleiben unveraendert gueltig (gleiche km-Klasse -> alte Kaskade).

- [x] **Step 2: Tests laufen lassen — neue muessen FAIL** — `npx vitest run src/lib/werkstatt/matching/__tests__/rank-vorschlaege.test.ts` → neue Tests rot (Cap/Gate existieren nicht), angepasste ggf. rot.

- [x] **Step 3: Implementierung in `rank-vorschlaege.ts`:**

(a) Konstante + Kontext:
```ts
/** D1 (Aaron 27.07.): nur Werkstaetten im Umkreis zeigen — Default-Cap in km. */
export const MAX_UMKREIS_KM = 50
```
```ts
export type MatchingKontext = {
  // ... bestehende Felder ...
  /** D1: Anzeige-Umkreis in km. undefined = MAX_UMKREIS_KM; null = ungecappt (interne Tools). */
  maxUmkreisKm?: number | null
}
```

(b) `bewerteMarke` (D4) ersetzen:
```ts
function bewerteMarke(w: WerkstattKandidat, marke: string | null): MarkenMatch {
  const trifft = trifftMarke(w, marke)
  // D4 (Aaron 27.07.): Vertragswerkstatt-Rang NUR beglaubigt (Verifizierungs-Gate) —
  // lange Marken-Listen duerfen den Bonus nicht vervielfachen.
  if (trifft && w.verifiziert === true) return 'marke'
  const hatMarken = (w.marken?.length ?? 0) > 0
  if (w.ist_freie_werkstatt === true || !hatMarken) return 'frei'
  // Unverifizierter Treffer: im Ranking wie markenoffen (Behauptung ist keine Strafe,
  // aber auch kein Bonus). Chip-Wahrheit regelt baueGruende via markenTreffer.
  if (trifft) return 'frei'
  return 'unbekannt'
}

/** Fuehrt die Werkstatt die gesuchte Marke (case-insensitiv)? */
function trifftMarke(w: WerkstattKandidat, marke: string | null): boolean {
  const gesucht = marke?.trim().toUpperCase()
  return !!gesucht && !!w.marken?.some((m) => m.trim().toUpperCase() === gesucht)
}
```

(c) `baueGruende`: Parameter `markenTreffer: boolean` ergaenzen (nach `markenMatch`); Marken-Chip-Block ersetzen:
```ts
  if (markenMatch === 'marke' && k.marke) {
    gruende.push({ typ: 'marke', text: `${k.marke.trim()}-Vertragswerkstatt` })
  } else if (markenTreffer && k.marke) {
    // D4: Treffer ohne Verifizierung — neutrale Faehigkeits-Aussage statt Vertrags-/Frei-Chip.
    gruende.push({ typ: 'marke', text: `Repariert ${k.marke.trim()}` })
  } else if (markenMatch === 'frei') {
    gruende.push({ typ: 'marke', text: 'Freie Werkstatt (alle Marken)' })
  }
```
In `bewerte()`: `const markenTreffer = trifftMarke(w, k.marke)` und an `baueGruende(w, k, markenMatch, markenTreffer, gewerkeFit, gruppenFit, distanz_km)` durchreichen.

(d) `vergleiche` (D1) ersetzen:
```ts
/** D1 (Aaron 27.07.): Distanz schlaegt immer — primaer nach ganzen km; die alte Kaskade
 *  (Marke > Gewerke > Gruppe > verifiziert) lebt nur noch als Tiebreak in derselben km-Klasse. */
function vergleiche(a: WerkstattVorschlag, b: WerkstattVorschlag): number {
  const kmA = Math.round(a.distanz_km)
  const kmB = Math.round(b.distanz_km)
  // Infinity !== Infinity ist false -> beide ohne Geo fallen in die Kaskade statt NaN.
  if (kmA !== kmB) return kmA - kmB

  const marke = MARKEN_RANG[a.markenMatch] - MARKEN_RANG[b.markenMatch]
  if (marke !== 0) return marke
  const gewerk = FIT_RANG[a.gewerkeFit] - FIT_RANG[b.gewerkeFit]
  if (gewerk !== 0) return gewerk
  const gruppe = FIT_RANG[a.gruppenFit] - FIT_RANG[b.gruppenFit]
  if (gruppe !== 0) return gruppe
  const trust = Number(b.verifiziert === true) - Number(a.verifiziert === true)
  if (trust !== 0) return trust
  const rest = a.distanz_km - b.distanz_km
  return Number.isNaN(rest) ? 0 : rest
}
```

(e) Umkreis-Filter in `rankeWerkstattVorschlaege` (Fallback-Basis wird `sichtbar`, nie `bewertet`):
```ts
export function rankeWerkstattVorschlaege(
  kandidaten: WerkstattKandidat[],
  kontext: MatchingKontext,
  limit: number = MAX_VORSCHLAEGE,
): WerkstattVorschlag[] {
  const bewertet = kandidaten
    .filter((w) => w.status === STATUS_AKTIV)
    .map((w) => bewerte(w, kontext))

  // D1: harter Anzeige-Umkreis (nur mit Anker sinnvoll). Infinity <= cap ist false ->
  // Werkstaetten ohne Geo fallen mit raus; Heilung siehe Spec §3.
  const cap = kontext.maxUmkreisKm === undefined ? MAX_UMKREIS_KM : kontext.maxUmkreisKm
  const sichtbar =
    kontext.anker && cap != null ? bewertet.filter((v) => v.distanz_km <= cap) : bewertet

  const gefiltert = sichtbar.filter((v) => {
    if (v.gruppenFit === 'passt_nicht') return false
    if (kontext.bedarfConfidence >= HART_SCHWELLE && v.gewerkeFit === 'passt_nicht') return false
    return true
  })

  const basis = gefiltert.length > 0 ? gefiltert : sichtbar
  return [...basis].sort(vergleiche).slice(0, limit)
}
```
Den Doc-Kommentar ueber der Funktion um den Umkreis-Satz ergaenzen und den FALLBACK-Satz praezisieren („innerhalb des Umkreises").

- [x] **Step 4: Tests gruen** — `npx vitest run src/lib/werkstatt/matching/__tests__/rank-vorschlaege.test.ts` → PASS komplett.

- [x] **Step 5: Nachbar-Suiten** — `npx vitest run src/lib/werkstatt/ src/app/embed/werkstatt-finder/` → PASS (bei Fixture-Distanz-Bruechen: Koordinaten der Fixtures unter 50 km vom jeweiligen Test-Anker ruecken, Erwartung NICHT aufweichen).

- [x] **Step 6: Commit** — `git add src/lib/werkstatt/matching/ && git commit -m "feat(werkstatt/AAR-956): D1+D4 Engine — Umkreis-Cap, Distanz primaer, Marken-Rang nur verifiziert"`

### Task 2: Loader-Durchreichung (`lade-vorschlaege.ts`)

**Files:**
- Modify: `src/lib/werkstatt/matching/lade-vorschlaege.ts`

**Interfaces:**
- Produces: `ladeWerkstattVorschlaege({ ..., maxUmkreisKm?: number | null })` — undefined laesst den Ranker-Default (50) greifen.
- Consumes: `MatchingKontext.maxUmkreisKm` aus Task 1.

- [x] **Step 1: Input-Typ + Kontext erweitern** (kein eigener Test — pure Durchreichung, von Task-1-Tests abgedeckt):
```ts
  /** D1: Anzeige-Umkreis in km. Weglassen = MAX_UMKREIS_KM (50); null = ungecappt (interne Tools). */
  maxUmkreisKm?: number | null
```
und im Kontext-Objekt: `maxUmkreisKm: input.maxUmkreisKm,` — `findWerkstattVorschlaegeFuer` bleibt unveraendert (alle heutigen Caller sind kundengerichtet, Default 50 ist korrekt; Sweep-Beleg: einzige Engine-Caller sind embed/actions.ts:110+138, flow/self-service-actions.ts:673+710, gutachter fall page.tsx:488 + _actions/werkstatt-empfehlung.ts:47, werkstatt-empfehlung/actions.ts:47 — Angebot und Confirm-Validierung laufen ueber dieselbe Funktion und bleiben deckungsgleich).

- [x] **Step 2: Kommentar am Funktionskopf** um den Cap-Satz ergaenzen; `npx tsc --noEmit`-Spotcheck via `npx vitest run src/lib/werkstatt/matching/` → PASS.

- [x] **Step 3: Commit** — `git commit -am "feat(werkstatt/AAR-956): Loader reicht maxUmkreisKm durch (Default 50)"`

### Task 3: Embed-Leer-Zustand (Wizard + Client)

**Files:**
- Modify: `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx`
- Modify: `src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx`
- Test: `src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx`

**Interfaces:**
- Produces: `WerkstattWizardProps.hatGesucht: boolean`; Leer-Hinweis-Text (exakt): „Noch keine Partner-Werkstatt in Ihrer Nähe — senden Sie Ihre Anfrage trotzdem ab, wir kümmern uns um Gutachten und Abwicklung."
- Consumes: bestehenden Suchfluss (`runSuche`, `rows`, `loading`).

- [x] **Step 1: Failing Test** (im bestehenden Wizard-Test-File; dessen Render-Helper um `hatGesucht` erweitern, Default false):
```tsx
it('zeigt den Leer-Hinweis im Schaden-Schritt, wenn gesucht wurde und nichts im Umkreis ist', async () => {
  renderWizard({ rows: [], loading: false, hatGesucht: true })
  // bis zum Schaden-Schritt klicken (Standort + Hersteller wie in den Nachbar-Tests)
  await bisSchadenStep()
  expect(screen.getByText(/Noch keine Partner-Werkstatt in Ihrer Nähe/)).toBeInTheDocument()
})

it('ohne abgeschlossene Suche KEIN Leer-Hinweis (kein Flackern vor der ersten Antwort)', async () => {
  renderWizard({ rows: [], loading: false, hatGesucht: false })
  await bisSchadenStep()
  expect(screen.queryByText(/Noch keine Partner-Werkstatt/)).not.toBeInTheDocument()
})
```
(Existiert kein `renderWizard`/`bisSchadenStep`-Helper, die vorhandenen Test-Muster der Datei 1:1 nachziehen — Props inline, Steps per `fireEvent`/`userEvent` wie dort ueblich.)

- [x] **Step 2: Rot laufen lassen** — `npx vitest run src/app/embed/werkstatt-finder/_components/__tests__/WerkstattWizard.test.tsx` → FAIL (Prop existiert nicht).

- [x] **Step 3: Implementierung.** Client (`WerkstattFinderEmbedClient.tsx`):
```ts
const [hatGesucht, setHatGesucht] = useState(false)
```
in `runSuche` nach erfolgreichem `setRows(...)` UND im catch (aktuelle Antwort): `setHatGesucht(true)`; im `initialPlz`-Pfad im `.then(...)` ebenso. Prop durchreichen: `<WerkstattWizard ... hatGesucht={hatGesucht} />`.

Wizard: Props-Typ += `hatGesucht: boolean`; im `'schaden'`-Block NACH dem bestehenden `{(loading || rows.length > 0) && (...)}`:
```tsx
{hatGesucht && !loading && rows.length === 0 && (
  <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3 text-body-sm text-claimondo-navy">
    Noch keine Partner-Werkstatt in Ihrer Nähe — senden Sie Ihre Anfrage trotzdem ab, wir
    kümmern uns um Gutachten und Abwicklung.
  </div>
)}
```
Denselben Block im `'kontakt'`-Step unter der (leeren) Liste einfuegen.

- [x] **Step 4: Gruen** — Wizard-Suite PASS.

- [x] **Step 5: Commit** — `git commit -am "feat(werkstatt/AAR-956): Embed-Leerzustand — Hinweis statt stummer Liste bei 0 Umkreis-Treffern"`

### Task 4: werkstatt-empfehlung Leer-Text („weitere")

**Files:**
- Modify: `src/app/werkstatt-empfehlung/[token]/WerkstattEmpfehlungClient.tsx`

- [x] **Step 1:** Stelle finden: `grep -n "weitere" src/app/werkstatt-empfehlung/[token]/WerkstattEmpfehlungClient.tsx` — dort, wo die nachgeladene „weitere Werkstaetten"-Liste gerendert wird, den Leer-Fall ergaenzen (leeres Ergebnis nach Klick auf „Weitere anzeigen"):
```tsx
{weitereGeladen && weitere.length === 0 && (
  <p className="text-body-sm text-claimondo-shield">
    Keine weiteren Werkstätten im Umkreis von 50 km gefunden.
  </p>
)}
```
(Variablennamen an die realen State-Namen der Datei anpassen; existiert bereits ein Leer-Text, nur die Formulierung auf den Umkreis-Bezug schaerfen.)

- [x] **Step 2:** `npx vitest run src/lib/werkstatt/empfehlung/` (build-rows-Suite) → PASS; Commit `git commit -am "feat(werkstatt/AAR-956): Empfehlung — Umkreis-Leertext fuer weitere Werkstaetten"`.

### Task 5: PR-1-Verifikation + PR

- [x] **Step 1:** `npx vitest run src/lib/werkstatt/ src/app/embed/werkstatt-finder/ src/app/werkstatt/registrieren/ src/app/admin/werkstaetten/` → alles PASS.
- [x] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler; `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (background) → exit 0; `npm run check:token-audit` + `npm run check:component-set` → keine neuen Verstoesse.
- [x] **Step 3:** Push + `gh pr create --base staging` (Body: D1/D4-Zusammenfassung + 7-Punkte-Audit) → CI watch → bei gruen squash-merge.

---

# PR 2 — Pflege: Markenoffen-Toggle, Admin-Badges, Geo-Selbstheilung

> Branch NACH PR-1-Merge frisch: `git fetch origin && git checkout -b kitta/aar-956-wf-pflege origin/staging`

### Task 6: Actions `setWerkstattMarkenoffen` + `setMeineMarkenoffen`

**Files:**
- Modify: `src/app/admin/werkstaetten/actions.ts` (nach `setWerkstattMarken`)
- Modify: `src/lib/actions/werkstatt-settings.ts` (nach `setMeineMarken`)
- Test: `src/app/admin/werkstaetten/__tests__/actions.test.ts`, `src/lib/actions/__tests__/werkstatt-settings-marken-gruppen.test.ts`

**Interfaces:**
- Produces: `setWerkstattMarkenoffen(werkstattId: string, markenoffen: boolean): Promise<{ ok: boolean; error?: string }>`; `setMeineMarkenoffen(markenoffen: boolean): Promise<{ ok: boolean; error?: string }>` — beide schreiben `werkstaetten.ist_freie_werkstatt`.

- [x] **Step 1: Failing Tests** — Admin-Suite (Mock-Muster der Datei: `mockConfig` + generischer from-Mock, update ist gemockt):
```ts
describe('setWerkstattMarkenoffen', () => {
  it('gibt ok:false zurück wenn nicht Admin', async () => {
    mockConfig.authUser = { id: 'u' }; mockConfig.profileRolle = 'dispatch'
    const { setWerkstattMarkenoffen } = await import('../actions')
    expect((await setWerkstattMarkenoffen('w-1', true)).ok).toBe(false)
  })
  it('admin -> ok:true', async () => {
    mockConfig.authUser = { id: 'a' }; mockConfig.profileRolle = 'admin'
    const { setWerkstattMarkenoffen } = await import('../actions')
    expect((await setWerkstattMarkenoffen('w-1', false)).ok).toBe(true)
  })
})
```
Settings-Suite analog zum dortigen `setMeineMarken`-Testmuster (Auth-Fail → ok:false; Happy-Path → update mit `{ ist_freie_werkstatt: true }` und `eq('user_id', ...)`).

- [x] **Step 2: Rot**, dann **Step 3: Implementierung** (Muster der Geschwister exakt):
```ts
// Admin (actions.ts):
export async function setWerkstattMarkenoffen(
  werkstattId: string,
  markenoffen: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen das Marken-Profil ändern.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('werkstaetten')
    .update({ ist_freie_werkstatt: markenoffen })
    .eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
```
```ts
// Self-Service (werkstatt-settings.ts):
export async function setMeineMarkenoffen(
  markenoffen: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { error } = await supabase
    .from('werkstaetten')
    .update({ ist_freie_werkstatt: markenoffen })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/werkstatt/einstellungen')
  return { ok: true }
}
```
- [x] **Step 4: Gruen**; **Step 5: Commit** `feat(werkstatt/AAR-956): Markenoffen-Actions (Admin + Self-Service)`.

### Task 7: Toggle-UI Admin (`MarkenGruppenEditor`) + Portal (`MarkenCard`)

**Files:**
- Modify: `src/app/admin/werkstaetten/[id]/MarkenGruppenEditor.tsx` (Props += `istFreieWerkstatt: boolean | null`)
- Modify: `src/app/admin/werkstaetten/[id]/detail-data.ts` (Select += `ist_freie_werkstatt`; Typ `WerkstattDetail` entsprechend)
- Modify: `src/app/admin/werkstaetten/[id]/WerkstattDetailClient.tsx` (Prop durchreichen)
- Modify: `src/components/werkstatt/WerkstattSettings.tsx` (MarkenCard += Toggle; Props += `ist_freie_werkstatt?: boolean | null`)
- Modify: `src/app/werkstatt/(shell)/einstellungen/page.tsx` (Select += `ist_freie_werkstatt`, Prop durchreichen)

**Interfaces:**
- Consumes: Actions aus Task 6.
- UI-Texte (exakt, Umlaute!): Label „Nimmt alle Marken an (markenoffen)"; Hinweis „Auch mit gepflegten Marken können Sie markenoffen bleiben — reine Spezialisten schalten das aus."; D4-Zusatz „Der Vertragswerkstatt-Rang für gepflegte Marken gilt erst nach Verifizierung durch Claimondo."; Ableitungs-Anzeige „markenoffen (abgeleitet — keine Marken gepflegt)".

- [x] **Step 1:** Editor-Toggle (beide Stellen gleiches Muster; hier Admin, Portal analog mit `setMeineMarkenoffen()`):
```tsx
const [markenoffen, setMarkenoffen] = useState<boolean>(istFreieWerkstatt === true)
const [markenoffenBusy, setMarkenoffenBusy] = useState(false)

async function toggleMarkenoffen() {
  const next = !markenoffen
  setMarkenoffenBusy(true)
  try {
    const res = await setWerkstattMarkenoffen(werkstattId, next)
    if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
    setMarkenoffen(next)
    toast.success(next ? 'Als markenoffen markiert' : 'Markenoffen entfernt')
    router.refresh()
  } finally { setMarkenoffenBusy(false) }
}
```
JSX direkt ueber dem Marken-Chip-Block:
```tsx
<label className="flex items-start gap-3 text-body-sm text-claimondo-navy">
  <input type="checkbox" checked={markenoffen} onChange={toggleMarkenoffen}
         disabled={markenoffenBusy}
         className="mt-0.5 h-4 w-4 shrink-0 rounded border-claimondo-border" />
  <span>
    Nimmt alle Marken an (markenoffen)
    <span className="block text-caption text-claimondo-shield/70">
      Auch mit gepflegten Marken können Sie markenoffen bleiben — reine Spezialisten
      schalten das aus. Der Vertragswerkstatt-Rang für gepflegte Marken gilt erst nach
      Verifizierung durch Claimondo.
    </span>
    {istFreieWerkstatt == null && markenSel.length === 0 && (
      <span className="block text-caption text-claimondo-ondo">markenoffen (abgeleitet — keine Marken gepflegt)</span>
    )}
  </span>
</label>
```
- [x] **Step 2:** Selects + Props verdrahten (detail-data, DetailClient, einstellungen/page, WerkstattSettings-Props + `<MarkenCard marken={...} istFreieWerkstatt={props.ist_freie_werkstatt ?? null} />`).
- [x] **Step 3:** `npx vitest run src/app/admin/werkstaetten/ src/lib/actions/__tests__/werkstatt-settings-marken-gruppen.test.ts` → PASS; Commit `feat(werkstatt/AAR-956): Markenoffen-Toggle in Admin-Editor + Portal-Settings`.

### Task 8: Verifizieren-Flow-Hinweis (D4)

**Files:**
- Modify: `src/app/admin/werkstaetten/[id]/WerkstattDetailClient.tsx` (im Verify-Abschnitt um Zeile ~205-224)

- [x] **Step 1:** Direkt beim Verifizieren-Button/Notiz-Feld (vor dem Aufruf-Block) ergaenzen:
```tsx
<p className="text-caption text-claimondo-shield/70">
  Mit der Verifizierung beglaubigen Sie auch die gepflegten Marken
  {w.marken && w.marken.length > 0 ? ` (${w.marken.join(', ')})` : ' (aktuell keine gepflegt)'} —
  erst dann greift der Vertragswerkstatt-Rang im Finder.
</p>
```
- [x] **Step 2:** Sichtpruefung via `npx vitest run src/app/admin/werkstaetten/` (kein eigener Komponententest — reiner Text) + Commit `feat(werkstatt/AAR-956): Verifizieren beglaubigt Markenbindung (Hinweis)`.

### Task 9: Admin-Listen-Badges „Ohne Standort / Ohne Gewerke"

**Files:**
- Modify: `src/app/admin/werkstaetten/page.tsx` (Select += `lat, lng`)
- Modify: `src/app/admin/werkstaetten/WerkstaettenClient.tsx` (Badge in der Name-Zelle)

- [x] **Step 1:** Select erweitern: `'id, name, adresse_ort, adresse_plz, status, provision_betrag_netto, aktiviert_am, email, telefon, faehigkeiten, lat, lng'`. Row-Typ des Clients entsprechend ergaenzen.
- [x] **Step 2:** In der Name-`<Td>` (erste Spalte, ~Zeile 100-108) unter dem Namen:
```tsx
{(w.lat == null || w.lng == null) && (
  <StatusBadge tone="warning">Ohne Standort</StatusBadge>
)}
{(!w.faehigkeiten || w.faehigkeiten.length === 0) && (
  <StatusBadge tone="neutral">Ohne Gewerke</StatusBadge>
)}
```
(`StatusBadge` aus `@/components/shared/StatusBadge` importieren; exakte Prop-API der Komponente vor Nutzung pruefen — `tone`-Werte wie in bestehenden Consumern.)
- [x] **Step 3:** Commit `feat(werkstatt/AAR-956): Admin-Badges fuer unvollstaendige Werkstatt-Profile`.

### Task 10: Geo-Selbstheilung im Portal-Profil-Save

**Files:**
- Modify: `src/lib/actions/werkstatt-settings.ts` (`updateWerkstattProfil`)
- Test: bestehende Settings-Suite (`src/lib/actions/__tests__/…werkstatt-settings…`) um einen Fall ergaenzen

**Interfaces:**
- Consumes: `geocodeAdresse` aus `@/lib/mapbox/geocode` (dynamischer Import wie in `registriereWerkstattSelf` — vermeidet Modulgraph-Ballast).

- [x] **Step 1: Failing Test** (Mock-Muster der Suite; geocode-Mock analog registrieren-Tests):
```ts
it('Profil-Save mit vollstaendiger Adresse re-geocodiert best-effort (lat/lng im Update)', async () => {
  geocodeMock.mockResolvedValue({ lat: 50.94, lng: 6.96 })
  const res = await updateWerkstattProfil(profilInput({ adresse_strasse: 'Neue Str. 1', adresse_plz: '50667', adresse_ort: 'Köln' }))
  expect(res.ok).toBe(true)
  expect(capturedUpdate).toMatchObject({ lat: 50.94, lng: 6.96 })
})

it('Geocode-Fehler blockiert den Save nicht (lat/lng bleiben unangetastet)', async () => {
  geocodeMock.mockRejectedValue(new Error('mapbox down'))
  const res = await updateWerkstattProfil(profilInput())
  expect(res.ok).toBe(true)
  expect('lat' in (capturedUpdate ?? {})).toBe(false)
})
```
- [x] **Step 2: Rot**, dann **Step 3: Implementierung** in `updateWerkstattProfil` VOR dem `.update(update)`:
```ts
  // Geo-Selbstheilung (Spec §3): vollstaendige Adresse -> best-effort re-geocoden. Heilt
  // Signups mit Mapbox-Aussetzer beim naechsten Save; mit dem Umkreis-Cap (D1) waere eine
  // geo-lose Werkstatt im Kunden-Finder sonst dauerhaft unsichtbar. Fehler = non-fatal.
  const strasse = (update.adresse_strasse as string | null) ?? null
  const plz = (update.adresse_plz as string | null) ?? null
  const ort = (update.adresse_ort as string | null) ?? null
  if (strasse && plz && ort) {
    try {
      const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
      const geo = await geocodeAdresse(`${strasse}, ${plz} ${ort}`)
      if (geo) {
        update.lat = geo.lat as unknown as string // Record-Typ der Map erweitern: string | boolean | number | null
        update.lng = geo.lng as unknown as string
      }
    } catch (err) {
      console.error('[updateWerkstattProfil] Geocoding fehlgeschlagen (non-blocking):', err)
    }
  }
```
Dabei den `update`-Record-Typ auf `Record<string, string | boolean | number | null>` erweitern (statt Cast-Hack — die zwei `as unknown as string` entfallen dann).
- [x] **Step 4: Gruen**; **Step 5: Commit** `feat(werkstatt/AAR-956): Geo-Selbstheilung beim Portal-Profil-Save`.

### Task 11: PR-2-Verifikation + PR + Regel-4

- [x] **Step 1:** Suiten: `npx vitest run src/app/admin/werkstaetten/ src/lib/actions/ src/lib/werkstatt/` → PASS; tsc (8GB) → 0; `npm run build` → exit 0; beide Ratchets ohne neue Verstoesse.
- [x] **Step 2:** Push, PR gegen staging (Audit-Body), CI, squash-merge.
- [ ] **Step 3 (nach staging→main-Deploy, Regel-4 prod anon):** `.invalid`-Wegwerf-Rezept (Scripts im Session-Scratchpad 614ebbaf): Werkstatt A nah (<50 km, Bremerhaven-Anker) + Werkstatt B fern (>100 km, `verifiziert=true`) seeden → Embed anon: A sichtbar, B NICHT (vorher Rang 1!); Anker ohne Umkreis-Treffer → Leer-Hinweis-Text sichtbar; Cleanup 0 Leftover. Ergebnis im Memory-File `coordination-werkstatt-anlage-frei-flag-gewerke` nachtragen.

## Self-Review (erledigt)

- Spec-Coverage: D1→Tasks 1-5; D2→6-7; D3→9-10; D4→1+8; §4-Tests→1,3,6,10; Regel-4→11. Keine Luecke.
- Platzhalter: keine (Task 4 und 9 enthalten bewusste Verifikations-Anker mit konkretem Code).
- Typ-Konsistenz: `maxUmkreisKm?: number | null` identisch in Kontext+Loader; Action-Signaturen in Task 6 = Nutzung in Task 7.
