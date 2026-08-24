# SV-LevelUp P3 — Der öffentliche Check bis zum Befund

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein echter Sichtbarkeits-Check läuft von der Modus-Wahl bis zum ausgelieferten Befund durch — öffentlich erreichbar unter `/check/[token]`, mit drei tatsächlich messenden Modulen.

**Architecture:** Next-16-App-Router-Routen im Standalone-Projekt `sv-levelup/`. Server Actions lösen den Token serverseitig auf (Vorbild `flow_links`), die Messmaschine läuft als Worker über den `status`-Zustand der Zeile. Jedes Modul ist eine reine Funktion hinter einem gemeinsamen Vertrag; externe Zugriffe (Google Places) liegen hinter einem Adapter, damit der spätere Wechsel Legacy → New ein Modultausch bleibt.

**Tech Stack:** Next.js 16.2.1 (App Router, Turbopack, `output: 'standalone'`), React 19.2.4, Supabase (service_role, ungetypt), Vitest 4, TypeScript 5.

## Global Constraints

- **`params`, `searchParams`, `cookies()`, `headers()` sind Promises.** Synchroner Zugriff ist in Next 16 **entfernt**, nicht deprecated. Immer `await props.params`. Typ-Helper via `npx next typegen` → `PageProps<'/check/[token]'>`.
- **`middleware.ts` heißt in Next 16 `proxy.ts`.** Wird in P3 nicht gebraucht, aber nicht versehentlich als `middleware` anlegen.
- **Kein `next/font/google`.** Der Build-Zeit-Download hat im Projekt wiederholt rote Builds ohne Code-Ursache erzeugt. Archivo wird selbst gehostet oder es greift der System-Stack.
- **Design-Tokens aus `_specs/sv-levelup/mockup-levelup-v2.html`**, nicht das Claimondo-Schema: `--nacht #0a121c`, `--asphalt #111c29`, `--chrom #e6ebf2`, `--signal #ff4d1c`, `--blau #1668d6`, `--linie #dfe7ef`, Status `--good #0ca30c` / `--warning #fab219` / `--serious #ec835a` / `--critical #d03b3b`.
- **R-A:** Jeder Befundwert trägt `quelle` und `erhoben`. Ohne beides wird er verworfen und als Fehlstelle ausgegeben.
- **R-B:** `wert: null` heißt „nicht erhoben" und trägt immer ein `grund`. **Nie `0` als Ersatz** und nie ein Balken auf 0.
- **R-E:** Das Feld `massnahmen` existiert in der Antwort von F-05 **nicht**. Nicht leer, nicht `null`, keine Überschriften. Die DB-Spalte `levelup_checks.massnahmen` wird befüllt — die *Antwort* enthält sie nie.
- **R-F1/F2:** Kein serverseitiges Scraping von Google-Suchergebnisseiten. Places nur über die offizielle API.
- **R-G:** robots.txt wird respektiert (die Prüfung aus `lib/anreicherung/lauf.ts` wird wiederverwendet, nicht neu gebaut).
- **R-M:** Kein Schreibzugriff auf `leads`, `partner_leads`, `faelle`, `claims`. P3 schreibt ausschließlich in `levelup_checks` und `levelup_events`.
- Server Actions liefern `{ ok: true, … } | { ok: false, error: string }`. Kein `throw` für Fachfehler.
- Jeder Supabase-Write prüft `error` **und** bei RLS-Clients die Zeilenzahl via `.select()`.

---

## Was in P3 NICHT gebaut wird

13 der 17 Module. P3 baut den **Rahmen** plus drei Module, die den Rahmen beweisen (`web`, `verz`, `wett` — je eines ohne externe Abhängigkeit, eines mit reiner HTTP-Prüfung, eines über den Places-Adapter). Die übrigen kommen in P3b.

**Drei Module sind ohne Aaron-Aktion überhaupt nicht baubar** (A-6): `kwg` (Google-Ads-Konto), `kwm` (Meta-Konto), `gsc` (Search-Console-OAuth) — zusammen 34 der 150 Punkte. Ohne sie sind **116 Punkte** erreichbar; da die Teilbefund-Schwelle bei 75 liegt, entsteht trotzdem ein echter Score. Das ist kein Mangel des Bauplans, sondern eine Kontenfrage.

---

## File Structure

```
sv-levelup/
├── lib/places/
│   ├── adapter.ts              Vertrag: suchText, suchUmkreis, details
│   ├── legacy.ts               maps.googleapis.com — läuft heute
│   ├── neu.ts                  places.googleapis.com — wartet auf A-1
│   ├── index.ts                Auswahl per ENV, ein einziger Schaltpunkt
│   └── __tests__/adapter.test.ts
├── lib/levelup/
│   ├── token.ts                erzeugen + auflösen
│   ├── ratelimit.ts            5 je IP-Hash je Stunde
│   ├── standort.ts             PLZ/Ort → lat/lng über plz_geo
│   ├── modul-vertrag.ts        Messfunktion, Befund, Fehlstelle
│   ├── messmaschine.ts         führt die gewählten Module aus
│   ├── validator.ts            R-A/R-B-Prüfung vor dem Speichern
│   ├── befund.ts               F-05-Antwort bauen (ohne massnahmen)
│   └── module/
│       ├── web.ts              HTTPS, Impressum, Datenschutz, Ladezeit
│       ├── verz.ts             Branchenverzeichnisse & NAP
│       └── wett.ts             Wettbewerber im 50-km-Umkreis
└── app/
    ├── (levelup)/check/[token]/page.tsx
    ├── (levelup)/check/[token]/actions.ts     F-02 … F-05
    ├── (levelup)/check/[token]/CheckClient.tsx
    └── actions.ts                             F-01 (Einstieg, tokenlos)
```

---

### Task 1: Places-Adapter

Schließt die offene Entscheidung aus Design-Spec §7.6. Legacy läuft heute, New ist die Zukunft — der Adapter macht daraus einen Modultausch statt einer Migration.

**Files:**
- Create: `sv-levelup/lib/places/adapter.ts`, `legacy.ts`, `neu.ts`, `index.ts`
- Test: `sv-levelup/lib/places/__tests__/adapter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Betrieb = {
    placeId: string; name: string; adresse: string | null
    lat: number; lng: number
    website: string | null; bewertung: number | null; bewertungen: number | null
  }
  export type PlacesAdapter = {
    suchText(q: string, umkreis: { lat: number; lng: number; km: number }): Promise<Betrieb[]>
    suchUmkreis(stichwort: string, umkreis: { lat: number; lng: number; km: number }): Promise<Betrieb[]>
    details(placeId: string): Promise<Betrieb | null>
  }
  export function holeAdapter(): PlacesAdapter   // ENV LEVELUP_PLACES_API=legacy|neu
  ```

- [ ] **Step 1: Failing test schreiben** — `adapter.test.ts` mit injiziertem `fetch`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { erzeugeLegacy } from '../legacy'

let aufrufe: string[] = []
const fakeFetch = (async (url: string) => {
  aufrufe.push(String(url))
  return { ok: true, json: async () => ({
    status: 'OK',
    results: [{
      place_id: 'P1', name: 'Gutachter Meyer', formatted_address: 'Hafenweg 3, 48143 Münster',
      geometry: { location: { lat: 51.96, lng: 7.62 } },
      website: 'https://meyer.de', rating: 4.8, user_ratings_total: 42,
    }],
  }) }
}) as unknown as typeof fetch

beforeEach(() => { aufrufe = [] })

describe('Legacy-Adapter', () => {
  it('bildet die Antwort auf den gemeinsamen Vertrag ab', async () => {
    const a = erzeugeLegacy('KEY', fakeFetch)
    const r = await a.suchText('Kfz-Sachverständiger', { lat: 51.96, lng: 7.62, km: 50 })
    expect(r[0]).toEqual({
      placeId: 'P1', name: 'Gutachter Meyer', adresse: 'Hafenweg 3, 48143 Münster',
      lat: 51.96, lng: 7.62, website: 'https://meyer.de', bewertung: 4.8, bewertungen: 42,
    })
  })

  it('rechnet km in Meter um', async () => {
    const a = erzeugeLegacy('KEY', fakeFetch)
    await a.suchUmkreis('Autohaus', { lat: 51.96, lng: 7.62, km: 25 })
    expect(aufrufe[0]).toContain('radius=25000')
  })

  it('meldet ZERO_RESULTS als leere Liste, nicht als Fehler', async () => {
    const leer = (async () => ({ ok: true, json: async () => ({ status: 'ZERO_RESULTS', results: [] }) })) as unknown as typeof fetch
    const a = erzeugeLegacy('KEY', leer)
    await expect(a.suchText('x', { lat: 0, lng: 0, km: 1 })).resolves.toEqual([])
  })

  // Ein API-Fehler darf NICHT als "keine Wettbewerber" durchgehen — das waere
  // ein Befund, den es nicht gibt (R-B).
  it('wirft bei REQUEST_DENIED, statt leer zurueckzugeben', async () => {
    const denied = (async () => ({ ok: true, json: async () => ({ status: 'REQUEST_DENIED', error_message: 'key blocked' }) })) as unknown as typeof fetch
    const a = erzeugeLegacy('KEY', denied)
    await expect(a.suchText('x', { lat: 0, lng: 0, km: 1 })).rejects.toThrow(/REQUEST_DENIED/)
  })

  it('holt weitere Seiten ueber next_page_token', async () => {
    let n = 0
    const paged = (async (url: string) => {
      aufrufe.push(String(url)); n++
      return { ok: true, json: async () => ({
        status: 'OK',
        results: [{ place_id: `P${n}`, name: `B${n}`, geometry: { location: { lat: 1, lng: 2 } } }],
        ...(n === 1 ? { next_page_token: 'TOK' } : {}),
      }) }
    }) as unknown as typeof fetch
    const a = erzeugeLegacy('KEY', paged)
    const r = await a.suchText('x', { lat: 0, lng: 0, km: 1 })
    expect(r).toHaveLength(2)
    expect(aufrufe[1]).toContain('pagetoken=TOK')
  })
})
```

- [ ] **Step 2: Rot prüfen** — `npx vitest run lib/places` → `Cannot find module '../legacy'`
- [ ] **Step 3: `adapter.ts` mit den Typen, `legacy.ts` mit `erzeugeLegacy(key, fetchImpl?)`.** Endpunkte: `https://maps.googleapis.com/maps/api/place/textsearch/json` und `.../nearbysearch/json`. Paging: nach `next_page_token` **2 Sekunden warten** (Google gibt das Token verzögert frei), höchstens 3 Seiten. Fehlerstatus außer `OK`/`ZERO_RESULTS` → `throw`.
- [ ] **Step 4: `neu.ts` als Skelett** mit derselben Signatur, das beim Aufruf `throw new Error('Places New API nicht freigeschaltet — A-1')` wirft. Kein toter Code: `index.ts` wählt per `LEVELUP_PLACES_API` (Default `legacy`).
- [ ] **Step 5: Grün prüfen** — `npx vitest run lib/places` → 5 passed
- [ ] **Step 6: Legacy-SKU-Kosten klären** — die offene Frage aus Design-Spec §7.6. Aktuelle Preisseite prüfen (Legacy hat **eigene** SKUs und ein eigenes Gratis-Kontingent, die New-Rechnung aus §7.1/§7.2 gilt dort nicht) und das Ergebnis in §7.6 nachtragen. **Nicht schätzen.**
- [ ] **Step 7: Commit** — `feat(sv-levelup): Places-Adapter, Legacy-Implementierung`

---

### Task 2: Token, Rate-Limit, Standort — F-01

**Files:**
- Create: `sv-levelup/lib/levelup/token.ts`, `ratelimit.ts`, `standort.ts`, `sv-levelup/app/actions.ts`
- Test: `sv-levelup/lib/levelup/__tests__/token.test.ts`, `ratelimit.test.ts`, `standort.test.ts`

**Interfaces:**
- Consumes: `Db` aus `lib/anreicherung/schreiben`
- Produces:
  ```ts
  export function erzeugeToken(): string                       // 32 Zeichen [A-Za-z0-9_-]
  export function hashIp(ip: string): Promise<string>          // SHA-256, hex
  export async function darfNoch(db: Db, ipHash: string): Promise<boolean>   // < 5 in 60 min
  export async function loeseStandortAuf(db: Db, e: { plz?: string; ort?: string }):
    Promise<{ lat: number; lng: number; ort: string | null; plz: string | null } | null>
  export async function legeCheckAn(db: Db, e: {
    modus: 'aufbau' | 'bestand'; websiteUrl?: string; ort?: string; plz?: string
    ipHash: string; userAgent?: string
  }): Promise<{ ok: true; token: string } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Failing tests** — Token: 32 Zeichen, nur erlaubtes Alphabet, 1000 Ziehungen ohne Dublette. Rate-Limit: bei 4 vorhandenen Einträgen `true`, bei 5 `false`, Einträge älter als 60 Minuten zählen nicht. Standort: PLZ trifft `plz_geo`; unbekannte PLZ → `null` (**kein Raten**); nur Ort ohne PLZ → Treffer über `ort`.
- [ ] **Step 2: Rot prüfen**
- [ ] **Step 3: Implementieren.** Token via `crypto.getRandomValues` + Alphabet-Mapping (**nicht** `Math.random`). `hashIp` über `crypto.subtle.digest('SHA-256', …)`. `legeCheckAn` schreibt `status='neu'`, `module_gewaehlt='{}'`, `module_gewuenscht='{}'`, `quelle='levelup'`, `gueltig_bis = now + 90 Tage` und ein `levelup_events`-Ereignis `typ='modus_gewaehlt'`.
- [ ] **Step 4: Grün prüfen**
- [ ] **Step 5: Ungültige URL fällt still weg** — Test: `websiteUrl: 'nicht-mal-fast-eine-url'` → Check entsteht **mit** `website_url = null` und **ohne** Fehler (F-01-Regel: Weg A funktioniert ohne Website).
- [ ] **Step 6: Commit**

---

### Task 3: Prüfumfang — F-02

Der Kern dieses Tasks ist die Trennung, die der Wellenplan als „der Fehler aus der ersten Umsetzung" markiert.

**Files:**
- Create: `sv-levelup/app/(levelup)/check/[token]/actions.ts`
- Modify: `sv-levelup/lib/levelup/sperrlogik.ts` (falls die serverseitige Prüfung dort fehlt)
- Test: `sv-levelup/app/(levelup)/check/[token]/__tests__/actions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function setzePruefumfang(token: string, moduleGewuenscht: string[]): Promise<
    | { ok: true; moduleAkzeptiert: string[]; moduleVerworfen: { id: string; grund: string }[]; punkteErhebbar: number }
    | { ok: false; error: string }>
  ```

- [ ] **Step 1: Failing tests**

```ts
it('speichert den WUNSCH getrennt vom Messbaren', async () => {
  // Ohne URL ist 'web' gesperrt — der Wunsch bleibt aber erhalten
  const r = await setzePruefumfang('T1', ['web', 'verz'])
  expect(r.ok && r.moduleAkzeptiert).toEqual(['verz'])
  expect(state.update.module_gewuenscht).toEqual(['web', 'verz'])
  expect(state.update.module_gewaehlt).toEqual(['verz'])
})

it('gibt ein Modul ZURUECK, sobald die URL nachgetragen ist', async () => {
  state.check.module_gewuenscht = ['web', 'verz']
  state.check.website_url = 'https://x.de'
  const r = await setzePruefumfang('T1', ['web', 'verz'])
  expect(r.ok && r.moduleAkzeptiert).toEqual(['web', 'verz'])
})

it('verwirft ein Modul, das der Client trotz Sperre schickt', async () => {
  // gbp ist nur fuer modus='bestand' vorgesehen
  state.check.modus = 'aufbau'
  const r = await setzePruefumfang('T1', ['gbp', 'verz'])
  expect(r.ok && r.moduleVerworfen[0]).toMatchObject({ id: 'gbp' })
})

it('lehnt eine leere Auswahl ab', async () => {
  const r = await setzePruefumfang('T1', [])
  expect(r).toEqual({ ok: false, error: 'kein_modul' })
})

it('lehnt ab, wenn der Check nicht mehr neu ist', async () => {
  state.check.status = 'laeuft'
  const r = await setzePruefumfang('T1', ['verz'])
  expect(r.ok).toBe(false)
})

it('rechnet punkteErhebbar aus den AKZEPTIERTEN Modulen', async () => {
  const r = await setzePruefumfang('T1', ['verz', 'nach'])   // 12 + 8
  expect(r.ok && r.punkteErhebbar).toBe(20)
})
```

- [ ] **Step 2: Rot prüfen**
- [ ] **Step 3: Implementieren.** Token auflösen, `status === 'neu'` erzwingen (sonst `{ ok:false, error:'falscher_status' }`), Sperrlogik **serverseitig** über `lib/levelup/sperrlogik.ts` erneut anwenden, beide Spalten schreiben, `levelup_events` mit `typ='umfang_bestaetigt'` und `payload={module, verworfen}`.
- [ ] **Step 4: Grün prüfen**
- [ ] **Step 5: Commit**

---

### Task 4: Modul-Vertrag, Messmaschine und drei Module

**Files:**
- Create: `sv-levelup/lib/levelup/modul-vertrag.ts`, `messmaschine.ts`, `module/web.ts`, `module/verz.ts`, `module/wett.ts`
- Test: je eine Testdatei unter `lib/levelup/__tests__/`

**Interfaces:**
- Produces:
  ```ts
  export type Befund = {
    schluessel: string; label: string
    wert: string | number | boolean | null
    punkte: number; maximum: number
    quelle: string            // R-A: Pflicht
    erhoben: string           // R-A: ISO-Zeitstempel, Pflicht
    grund?: string            // R-B: Pflicht wenn wert === null
  }
  export type Fehlstelle = { schluessel: string; grund: string }
  export type Messergebnis = { befunde: Befund[]; fehlstellen: Fehlstelle[] }
  export type Messkontext = {
    modus: 'aufbau' | 'bestand'
    websiteUrl: string | null
    standort: { lat: number; lng: number; ort: string | null; plz: string | null } | null
    hole: Holer                 // aus lib/anreicherung/lauf — robots.txt-konform
    places: PlacesAdapter
  }
  export type Messfunktion = (k: Messkontext) => Promise<Messergebnis>
  export const MESSFUNKTIONEN: Partial<Record<ModulId, Messfunktion>>
  ```

- [ ] **Step 1: Failing tests für `web`** — HTTPS erreichbar, Impressum verlinkt, Datenschutz verlinkt, Antwortzeit. Jeder Befund trägt `quelle` und `erhoben`. Eine nicht erreichbare Seite ergibt **Fehlstellen mit Grund**, keine Nullpunkte-Befunde.
- [ ] **Step 2: Failing tests für `verz`** — Präsenz in Branchenverzeichnissen und NAP-Konsistenz (Name/Adresse/Telefon). Ein nicht erreichbares Verzeichnis ist eine **Fehlstelle**, kein „nicht gelistet".
- [ ] **Step 3: Failing tests für `wett`** — über den Places-Adapter: Anzahl Betriebe im 50-km-Umkreis, eigener Rang nach Bewertungszahl, Median. Wirft der Adapter, entsteht eine Fehlstelle für das ganze Modul — **nie „0 Wettbewerber"**.
- [ ] **Step 4: Rot prüfen** (alle drei)
- [ ] **Step 5: Implementieren.** `web`/`verz` nutzen den **bestehenden** `erzeugeHoler` aus `lib/anreicherung/netz.ts` (robots.txt-konform, gedrosselt, gecacht) — nicht neu bauen. `wett` nutzt den Adapter aus Task 1.
- [ ] **Step 6: Messmaschine** — führt die Module aus `module_gewaehlt` **sequenziell** aus, schreibt nach jedem Modul inkrementell in `levelup_checks.befunde` (damit F-04 echten Fortschritt zeigt), fängt einen Modulfehler ab und macht mit dem nächsten weiter.
- [ ] **Step 7: Grün prüfen**
- [ ] **Step 8: Commit**

---

### Task 5: Messung starten und Fortschritt — F-03 / F-04

**Files:**
- Modify: `sv-levelup/app/(levelup)/check/[token]/actions.ts`
- Test: dieselbe Testdatei

- [ ] **Step 1: Failing tests** — `starteMessung` setzt `status='laeuft'` und schreibt `messung_gestartet`; ein **zweiter Aufruf bei `laeuft` startet nichts neu** und gibt denselben Zustand zurück (Idempotenz); ein Lauf, der älter als 10 Minuten ist, wird auf `status='fehler'` mit `fehler_text` gesetzt. `holeFortschritt` leitet je Modul `wartet|laeuft|fertig|fehler` ab und enthält **keine Befunddaten**.
- [ ] **Step 2: Rot prüfen**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Der Fortschritt darf nichts ausplaudern** — Test: `expect(JSON.stringify(fortschritt)).not.toContain('quelle')`
- [ ] **Step 5: Grün prüfen**
- [ ] **Step 6: Commit**

---

### Task 6: Validator und Befund — F-05

**Files:**
- Create: `sv-levelup/lib/levelup/validator.ts`, `befund.ts`
- Test: `sv-levelup/lib/levelup/__tests__/validator.test.ts`, `befund.test.ts`

- [ ] **Step 1: Failing tests Validator** — Befund ohne `quelle` → verworfen + Fehlstelle; ohne `erhoben` → dito; `wert: null` ohne `grund` → verworfen; **`wert: 0` zusammen mit einem „nicht erhebbar"-Zustand ist ein Fehler**, kein gültiger Wert.
- [ ] **Step 2: Failing tests Befund** — Score `round(ist / erhebbar * 100)`; `punkteErhebbar < 75` → `keinScore: true` und `score: null` (Design-Spec §3.2 — **relativ**, nicht die 60 aus dem alten Wellenplan); Tresor enthält **nur** Anzahl je Phase und Aufwandssumme.
- [ ] **Step 3: DER SICHERHEITSTEST**

```ts
// R-E: automatisiert, nicht von Hand
it('liefert keine Massnahmen aus — auch keine Ueberschriften', async () => {
  const antwort = await baueBefund(db, 'T1')
  const roh = JSON.stringify(antwort).toLowerCase()
  expect(roh).not.toContain('massnahme')
  expect(roh).not.toContain('massnahmen')
  expect(roh).not.toContain('empfehlung')
  expect(roh).not.toContain('handlungs')
})

it('erzeugt das Feld nicht einmal leer', async () => {
  const antwort = await baueBefund(db, 'T1')
  expect('massnahmen' in (antwort as object)).toBe(false)
})
```

- [ ] **Step 4: Rot prüfen**
- [ ] **Step 5: Implementieren.** `baueBefund` liest die Zeile, filtert je Modul auf `{ id, punkte, maximum, befunde, fehlstellen }`, berechnet den Score über das bestehende `lib/levelup/score.ts` und schreibt `levelup_events` `typ='tresor_gesehen'`. **Die Spalte `massnahmen` wird nicht gelesen** — was nicht gelesen wird, kann nicht durchrutschen.
- [ ] **Step 6: Grün prüfen**
- [ ] **Step 7: Commit**

---

### Task 7: Oberfläche — Zustände 1 bis 4

**Files:**
- Create: `sv-levelup/app/(levelup)/check/[token]/page.tsx`, `CheckClient.tsx`, `sv-levelup/app/page.tsx` (Einstieg)
- Modify: `sv-levelup/app/globals.css` (Tokens aus dem Mockup)

- [ ] **Step 1: Design-Tokens übernehmen** — die CSS-Variablen aus `mockup-levelup-v2.html` in `globals.css`. Archivo **selbst hosten oder System-Stack**, kein `next/font/google`.
- [ ] **Step 2: `app/page.tsx` — Zustand 1.** Modus-Karten (`aufbau` / `bestand`); das URL-Feld erscheint **erst nach der Wahl**. Absenden ruft F-01 und leitet auf `/check/<token>`.
- [ ] **Step 3: `check/[token]/page.tsx` — Server Component.**

```tsx
export default async function Page(props: PageProps<'/check/[token]'>) {
  const { token } = await props.params        // Next 16: params ist ein Promise
  const check = await ladeCheck(token)
  if (!check) notFound()                       // ungueltiger Token -> 404, kein Hinweis worauf
  return <CheckClient check={check} />
}
```

- [ ] **Step 4: Zustand 2 — Modulkacheln** mit Kippschalter, Bilanzleiste (gewählte Punkte / Dauer) und **Sperrgrund im Klartext auf der Kachel**. Gruppierung in die vier Gruppen aus der Registry (`auftritt`, `umfeld`, `nachfrage`, `markt`).
- [ ] **Step 5: Zustand 3 — Prüfliste** `wartet → läuft → fertig`, Abfrage **höchstens alle 2 Sekunden** (F-04-Regel).
- [ ] **Step 6: Zustand 4 — Befund**, je Modus verschieden: `aufbau` → „Das Feld, in das Sie eintreten" mit Position („154. von 154"); `bestand` → „Wo Sie im Feld stehen" mit Gesamtscore. **Nicht erhobene Werte erscheinen als „nicht erhoben — <grund>", niemals als Balken auf 0.**
- [ ] **Step 7: Build prüfen** — `npm run build` (nicht nur `tsc`): Next 16 findet Routen-/Validator-Fehler erst im vollen Build.
- [ ] **Step 8: Commit**

---

## Abnahme P3

- [ ] Ein Check läuft über die Oberfläche von der Modus-Wahl bis zum Befund durch
- [ ] `npm run build`, `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` grün
- [ ] Der R-E-Test ist automatisiert und grün
- [ ] Ungültiger Token → 404 ohne Hinweis
- [ ] Rate-Limit greift ab dem 6. Check je IP-Hash und Stunde
- [ ] `module_gewuenscht` und `module_gewaehlt` sind nachweislich getrennt (Test)
- [ ] `leads` = 78, `partner_leads` = 126, `sv_leads` = 62 unverändert
- [ ] **Regel 4:** Prod-Smoke ist erst möglich, wenn `sv-levelup.claimondo.de` steht (A-3). Bis dahin geht die Smoke-Pflicht **mit ausformuliertem Soll** an die Deploy-Session — die Aufgabe bleibt offen.
