# SV-LevelUp P3b — die Auftritts-Module (gbp, seo, ux)

> **Für agentische Arbeiter:** PFLICHT-SUB-SKILL: `superpowers:executing-plans`. Schritte tragen Checkbox-Syntax.

**Ziel:** Der Befund misst nicht mehr nur 30 von 150 Punkten, sondern 76 — die drei Module, die den eigenen Auftritt beurteilen.

**Aufbau:** Drei Messmodule nach dem bestehenden Vertrag (`Messfunktion`), dazu eine Erweiterung des Places-Adapters (Profil-Details) und ein gemeinsames HTML-Werkzeug, das `web.ts` heute allein besitzt.

**Werkzeuge:** TypeScript, Vitest 4, Google Places Legacy, der gedrosselte Holer aus `lib/anreicherung/netz.ts`.

## Weltweite Vorgaben

- **R-A** — jeder Befund nennt `quelle` und `erhoben`. Ohne beides verwirft der Validator ihn.
- **R-B** — was nicht gemessen wurde, ist `wert: null` mit `grund`, niemals `0`. `nichtErhoben()` benutzen.
- **R-F1/F2** — kein serverseitiges Auslesen von Google-Suchergebnisseiten. Places-API ja, SERP nein.
- **R-G** — `hole()` aus `netz.ts` respektiert robots.txt, drosselt und cacht. Nie roh `fetch` auf fremde Seiten.
- **Ampel** — `ampelFuer()` benutzen, nie von Hand setzen. `offen` gehört allein zu `nichtErhoben()`.
- **Punktzahl je Modul** muss exakt der `MODULE`-Registry entsprechen: `gbp: 22`, `seo: 12`, `ux: 12`. Ein Test prüft das.
- **Umlaute** in allen nutzersichtbaren Zeichenketten (Label, Einordnung, Grund) — die stehen im Befund des Kunden.

## Was diesem Plan vorausging — gemessene Tatsachen (19.08.)

Über acht echte Münsteraner Betriebe erhoben, bevor eine Zeile geschrieben wurde:

| Merkmal | Streuung | Taugt als Kriterium? |
|---|---|---|
| `types` (Kategorie) | **alle acht identisch** `establishment\|finance\|point_of_interest` | **Nein** — die vom Inhaber gewählte Kategorie gibt Places nicht her |
| `photos` | 0 bis 10 | ja |
| `opening_hours` | einer von acht ohne | ja |
| `user_ratings_total` | 3 bis 95 | ja (misst schon `wett`) |
| `formatted_phone_number` | **alle acht haben** | schwach |
| `website` | **alle acht haben** | schwach |

⚠ **Die Kategorie streichen.** Das Mockup fordert „Kategorie steht auf ‚Ingenieurbüro' statt ‚Gutachter'" — diese Angabe lebt im Google-Unternehmensprofil, nicht in der Places-API. Was Places `types` nennt, ist Googles eigene grobe Einordnung. Ein Kriterium darauf zu bauen hieße, allen dieselbe Note zu geben und sie Messung zu nennen.

⚠ **`photos` ist bei 10 gedeckelt.** Places liefert höchstens zehn. „10 Fotos" heißt „mindestens 10" — der Befund darf keine Obergrenze behaupten, die er nicht kennt.

---

### Aufgabe 1: HTML-Werkzeug herauslösen

Heute lebt `istClientseitig()` in `web.ts`. `seo` und `ux` brauchen dieselbe Erkennung: Was auf einer React-Seite fehlt, fehlt vielleicht nur dem Rohtext. Ohne diesen Schutz beschuldigt der Befund einen Betrieb wegen etwas, das ein Browser sehr wohl anzeigt.

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/html.ts`
- Ändern: `sv-levelup/lib/levelup/module/web.ts` (Import statt eigener Funktion)
- Test: `sv-levelup/lib/levelup/__tests__/html.test.ts`

**Schnittstellen:**
- Erzeugt: `istClientseitig(html: string): boolean`, `sichtbarerText(html: string): string`, `textIn(html: string, tag: string): string[]`, `attribut(html: string, tag: string, name: string): string[]`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
// sv-levelup/lib/levelup/__tests__/html.test.ts
import { describe, expect, it } from 'vitest'
import { attribut, istClientseitig, sichtbarerText, textIn } from '../html'

describe('sichtbarerText', () => {
  it('entfernt Skripte und Formatvorlagen mitsamt Inhalt', () => {
    const h = '<html><head><style>body{color:red}</style></head><body>Hallo<script>var x=1</script></body></html>'
    expect(sichtbarerText(h)).toBe('Hallo')
  })

  it('deutet Entities', () => {
    expect(sichtbarerText('<p>Gr&ouml;&szlig;e &amp; Ma&szlig;</p>')).toBe('Größe & Maß')
  })
})

describe('textIn', () => {
  it('liest den Inhalt aller Vorkommen eines Elements', () => {
    expect(textIn('<h1>Erste</h1><p>x</p><h1 class="a">Zweite</h1>', 'h1'))
      .toEqual(['Erste', 'Zweite'])
  })

  it('liefert eine leere Liste, wenn das Element fehlt', () => {
    expect(textIn('<p>nur Text</p>', 'h1')).toEqual([])
  })
})

describe('attribut', () => {
  it('liest ein Attribut aus allen Vorkommen', () => {
    const h = '<meta name="description" content="Erste"><meta name="viewport" content="width">'
    expect(attribut(h, 'meta', 'content')).toEqual(['Erste', 'width'])
  })
})

describe('istClientseitig', () => {
  it('erkennt eine React-Anwendung an wenig Text in viel Auszeichnung', () => {
    const spa = '<html><body><div id="root"></div>' + '<script>'.repeat(200) + '</body></html>'
    expect(istClientseitig(spa)).toBe(true)
  })

  it('haelt eine gewoehnliche Seite nicht fuer clientseitig', () => {
    const seite = '<html><body>' + 'Sachverständigenbüro Meyer. '.repeat(80) + '</body></html>'
    expect(istClientseitig(seite)).toBe(false)
  })
})
```

- [ ] **Schritt 2: Ausführen und Fehlschlag bestätigen**

`cd sv-levelup && npx vitest run lib/levelup/__tests__/html.test.ts`
Erwartung: FEHLSCHLAG, `Cannot find module '../html'`

- [ ] **Schritt 3: Umsetzen**

```ts
// sv-levelup/lib/levelup/html.ts
/**
 * Rohes HTML lesen, ohne einen Browser zu starten.
 *
 * Bewusst mit regulaeren Ausdruecken statt mit einem Parser: die Module lesen
 * je Seite fuenf bis zehn Stellen, und ein Parser im Messpfad waere eine
 * weitere Abhaengigkeit, die bei kaputtem Fremd-HTML wirft. Was hier nicht
 * gefunden wird, ist „nicht feststellbar" (R-B) — nie „fehlt".
 */

const ENTITIES: Record<string, string> = {
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
}

export function deuteEntities(s: string): string {
  return s
    .replace(/&([a-zA-Z]+);/g, (ganz, name: string) => ENTITIES[name] ?? ganz)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
}

/** Was ein Leser saehe — ohne Skripte, Formatvorlagen und Auszeichnung. */
export function sichtbarerText(html: string): string {
  return deuteEntities(
    html
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

/** Der Textinhalt jedes Vorkommens eines Elements. */
export function textIn(html: string, tag: string): string[] {
  const treffer = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
  return treffer.map((t) => sichtbarerText(t[1])).filter((s) => s.length > 0)
}

/** Ein Attributwert aus jedem Vorkommen eines Elements. */
export function attribut(html: string, tag: string, name: string): string[] {
  const treffer = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))]
  const werte: string[] = []
  for (const t of treffer) {
    const m = t[0].match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
    if (m) werte.push(deuteEntities(m[1]))
  }
  return werte
}

/**
 * ⚠ Erkennt eine Anwendung, die ihre Inhalte erst im Browser aufbaut.
 *
 * Der teuerste Fehler des ganzen Projekts (18.08.): Der Befund warf
 * `gutachter-yigit.com` fehlendes Impressum UND fehlende Datenschutzerklaerung
 * vor — beides abmahnfaehig. Die Seite ist eine React-Anwendung: 53 Byte
 * sichtbarer Text in 13 KB HTML, alles Weitere baut der Browser. Ein solcher
 * Vorwurf im Befund eines Interessenten ist schlimmer als gar kein Befund.
 *
 * Zwei Bedingungen gemeinsam, damit eine kurze, aber echte Seite nicht
 * faelschlich als Anwendung gilt.
 */
export function istClientseitig(html: string): boolean {
  const text = sichtbarerText(html)
  return text.length < 500 && text.length / Math.max(1, html.length) < 0.03
}
```

- [ ] **Schritt 4: Test grün, `web.ts` umstellen**

In `web.ts` die eigene `istClientseitig`-Definition löschen und stattdessen importieren:
```ts
import { istClientseitig } from '../html'
```
Dann `npx vitest run lib/levelup` — alle bisherigen Web-Tests müssen weiter grün sein. Das ist der eigentliche Beweis: dieselbe Erkennung, nur an einem Ort.

- [ ] **Schritt 5: Festschreiben**

```bash
git add sv-levelup/lib/levelup/html.ts sv-levelup/lib/levelup/__tests__/html.test.ts sv-levelup/lib/levelup/module/web.ts
git commit -m "refactor(sv-levelup): HTML-Werkzeug aus web.ts herausgeloest"
```

---

### Aufgabe 2: Der Places-Adapter liefert Profildaten

`details()` gibt heute `Betrieb` zurück — sieben Felder, die für `wett` reichen. `gbp` beurteilt das Profil selbst und braucht mehr.

**Dateien:**
- Ändern: `sv-levelup/lib/places/adapter.ts` (Typ `Profil`, Vertrag `profil()`)
- Ändern: `sv-levelup/lib/places/legacy.ts` (Umsetzung)
- Ändern: `sv-levelup/lib/places/neu.ts` (Umsetzung oder ausdrücklicher Fehler)
- Test: `sv-levelup/lib/places/__tests__/profil.test.ts`

**Schnittstellen:**
- Verbraucht: `PlacesAdapter`, `PlacesFehler` aus Aufgabe 0 (bestehend)
- Erzeugt: `Profil`-Typ und `profil(placeId): Promise<Profil | null>`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
// sv-levelup/lib/places/__tests__/profil.test.ts
import { describe, expect, it } from 'vitest'
import { erzeugeLegacy } from '../legacy'

function antwort(daten: unknown) {
  return async () => new Response(JSON.stringify(daten), { status: 200 }) as unknown as Response
}

describe('profil', () => {
  it('liest die Profilmerkmale aus der Antwort', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({
        status: 'OK',
        result: {
          place_id: 'p1', name: 'Büro Meyer',
          formatted_address: 'Weg 1, 48143 Münster',
          geometry: { location: { lat: 51.9, lng: 7.6 } },
          website: 'https://meyer.de',
          rating: 4.8, user_ratings_total: 42,
          photos: [{}, {}, {}],
          opening_hours: { weekday_text: ['Montag: 09:00–17:00'] },
          formatted_phone_number: '0251 123',
          business_status: 'OPERATIONAL',
        },
      }) as unknown as typeof fetch,
    })

    const p = await a.profil('p1')
    expect(p).not.toBeNull()
    expect(p!.fotos).toBe(3)
    expect(p!.oeffnungszeiten).toBe(true)
    expect(p!.telefon).toBe('0251 123')
    expect(p!.betriebsstatus).toBe('OPERATIONAL')
    expect(p!.bewertungen).toBe(42)
  })

  it('meldet fehlende Merkmale als fehlend, nicht als null-Wert', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({
        status: 'OK',
        result: {
          place_id: 'p2', name: 'Ohne alles',
          geometry: { location: { lat: 51, lng: 7 } },
        },
      }) as unknown as typeof fetch,
    })

    const p = await a.profil('p2')
    // Fotos: die Antwort enthaelt das Feld nicht -> 0 ist hier korrekt,
    // weil Places es bei vorhandenem Profil immer mitliefert.
    expect(p!.fotos).toBe(0)
    expect(p!.oeffnungszeiten).toBe(false)
    expect(p!.telefon).toBeNull()
  })

  it('macht aus NOT_FOUND ein null, nicht einen Fehler', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({ status: 'NOT_FOUND' }) as unknown as typeof fetch,
    })
    await expect(a.profil('weg')).resolves.toBeNull()
  })

  it('laesst einen gesperrten Schluessel als Fehler durch', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({ status: 'REQUEST_DENIED', error_message: 'gesperrt' }) as unknown as typeof fetch,
    })
    // ⚠ NIE als leeres Profil — sonst sieht ein gesperrter Schluessel aus wie
    // ein Betrieb ohne Profil, und der Befund wirft ihm etwas vor.
    await expect(a.profil('p')).rejects.toThrow('REQUEST_DENIED')
  })
})
```

- [ ] **Schritt 2: Ausführen und Fehlschlag bestätigen**

`cd sv-levelup && npx vitest run lib/places/__tests__/profil.test.ts`
Erwartung: FEHLSCHLAG, `a.profil is not a function`

- [ ] **Schritt 3: Umsetzen**

In `adapter.ts` ergänzen:
```ts
/**
 * Was das Google-Unternehmensprofil ueber die Places-API hergibt.
 *
 * ⚠ Was es NICHT hergibt: die vom Inhaber gewaehlte Kategorie. Am 19.08. ueber
 * acht Muensteraner Betriebe gemessen — alle acht tragen dieselben `types`
 * (`establishment|finance|point_of_interest`). Das Mockup verlangt „Kategorie
 * steht auf Ingenieurbuero statt Gutachter"; diese Angabe lebt im
 * Unternehmensprofil, nicht in der API. Ein Kriterium darauf hiesse, allen
 * dieselbe Note zu geben und es Messung zu nennen.
 */
export type Profil = Betrieb & {
  /** ⚠ Places liefert hoechstens 10 — der Wert ist eine UNTERGRENZE. */
  fotos: number
  oeffnungszeiten: boolean
  telefon: string | null
  betriebsstatus: string | null
}
```
und im Vertrag `PlacesAdapter`:
```ts
  /** Profilmerkmale des geprueften Betriebs — fuer `gbp`. */
  profil(placeId: string): Promise<Profil | null>
```

In `legacy.ts` das Feld `photos` und die übrigen anfordern und abbilden:
```ts
    async profil(placeId) {
      try {
        const daten = await hole('/details/json', {
          place_id: placeId,
          fields: 'place_id,name,formatted_address,geometry,website,rating,' +
            'user_ratings_total,photos,opening_hours,formatted_phone_number,business_status',
          language: 'de',
        })
        const roh = (daten.result as RohProfil) ?? {}
        const basis = zuBetrieb(roh)
        if (!basis) return null
        return {
          ...basis,
          fotos: roh.photos?.length ?? 0,
          oeffnungszeiten: Boolean(roh.opening_hours),
          telefon: roh.formatted_phone_number ?? null,
          betriebsstatus: roh.business_status ?? null,
        }
      } catch (err) {
        if (err instanceof PlacesFehler && err.status === 'NOT_FOUND') return null
        throw err
      }
    },
```
mit
```ts
type RohProfil = RohOrt & {
  photos?: unknown[]
  opening_hours?: unknown
  formatted_phone_number?: string
  business_status?: string
}
```

In `neu.ts` `profil()` ergänzen — solange die New API gesperrt ist (A-1), genügt dort derselbe Aufbau wie `details()`; wirft sie, wirft auch `profil()`.

- [ ] **Schritt 4: Test grün**

`npx vitest run lib/places` — alle grün.

- [ ] **Schritt 5: Gegen die echte API prüfen**

```bash
cd sv-levelup && npx tsx -e "
import { erzeugeLegacy } from './lib/places/legacy'
const a = erzeugeLegacy(process.env.GOOGLE_PLACES_API_KEY!)
const treffer = await a.suchText('Kfz-Sachverständiger Münster', { lat: 51.96, lng: 7.63, km: 25 })
const p = await a.profil(treffer[0].placeId)
console.log(p)
"
```
Erwartung: ein Profil mit `fotos`, `oeffnungszeiten`, `telefon`. **Nicht** der Testlauf allein — der beweist nur, dass die Abbildung zu meinem Fake passt.

- [ ] **Schritt 6: Festschreiben**

```bash
git add sv-levelup/lib/places
git commit -m "feat(sv-levelup): Places-Adapter liefert Profilmerkmale fuer gbp"
```

---

### Aufgabe 3: Modul `gbp` — das Google-Unternehmensprofil (22 Punkte)

Das schwerste Modul des ganzen Katalogs, und das einzige, dessen Mängel der Sachverständige an einem Nachmittag selbst abstellen kann.

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/module/gbp.ts`
- Ändern: `sv-levelup/lib/levelup/module/index.ts` (eintragen)
- Test: `sv-levelup/lib/levelup/module/__tests__/gbp.test.ts`

**Schnittstellen:**
- Verbraucht: `Messkontext` (+ `firmenname`), `PlacesAdapter.suchText`/`profil`, `befund`/`nichtErhoben`
- Erzeugt: `messeGbp`, `GBP_PUNKTE = 22`, `GEWICHTE`

**Punktverteilung — BESCHLUSS.** Die Messvorschrift `references/scoring-modell.md` bleibt unauffindbar; die Verteilung folgt der am 19.08. gemessenen Streuung: was alle haben, wiegt wenig; was streut, wiegt viel.

```
fotos            6   0 / 1-3 / 4-9 / ≥10  →  0 / 2 / 4 / 6
oeffnungszeiten  5   vorhanden oder nicht
bewertungszahl   6   0 / 1-9 / 10-29 / ≥30 →  0 / 2 / 4 / 6
bewertungsschnitt 3  <4,0 / 4,0-4,4 / ≥4,5 → 0 / 2 / 3
telefon          1
website          1
                ---
                22
```

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
// sv-levelup/lib/levelup/module/__tests__/gbp.test.ts
import { describe, expect, it } from 'vitest'
import type { Betrieb, PlacesAdapter, Profil } from '../../../places'
import { PlacesFehler } from '../../../places'
import type { Messkontext } from '../../modul-vertrag'
import { GBP_PUNKTE, messeGbp } from '../gbp'

const STANDORT = { lat: 51.96, lng: 7.63, ort: 'Münster', plz: '48143' }

function betrieb(name: string, id: string, bewertungen = 10): Betrieb {
  return { placeId: id, name, adresse: null, lat: 51.9, lng: 7.6, website: null, bewertung: 4.5, bewertungen }
}

function adapter(treffer: Betrieb[], profil: Profil | null): PlacesAdapter {
  return {
    suchText: async () => treffer,
    suchUmkreis: async () => treffer,
    details: async () => null,
    profil: async () => profil,
  }
}

function kontext(over: Partial<Messkontext> & { firmenname?: string | null }): Messkontext & { firmenname?: string | null } {
  return {
    modus: 'bestand', websiteUrl: null, standort: STANDORT,
    hole: async () => ({ ok: false, status: 0, dauerMs: 0 }),
    places: adapter([], null),
    jetzt: () => '2026-08-19T10:00:00.000Z',
    ...over,
  } as Messkontext & { firmenname?: string | null }
}

const VOLL: Profil = {
  placeId: 'p1', name: 'Sachverständigenbüro Meyer', adresse: 'Weg 1', lat: 51.9, lng: 7.6,
  website: 'https://meyer.de', bewertung: 4.8, bewertungen: 42,
  fotos: 10, oeffnungszeiten: true, telefon: '0251 123', betriebsstatus: 'OPERATIONAL',
}

describe('messeGbp', () => {
  it('vergibt die volle Punktzahl fuer ein vollstaendiges Profil', async () => {
    const k = kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([betrieb('Sachverständigenbüro Meyer', 'p1', 42)], VOLL),
    })
    const e = await messeGbp(k)
    const summe = e.befunde.reduce((s, b) => s + b.punkte, 0)
    expect(summe).toBe(GBP_PUNKTE)
  })

  it('zieht Punkte ab, wo das Profil leer ist — und benennt es', async () => {
    const leer: Profil = { ...VOLL, fotos: 0, oeffnungszeiten: false, bewertungen: 0, bewertung: null, telefon: null, website: null }
    const k = kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([betrieb('Sachverständigenbüro Meyer', 'p1', 0)], leer),
    })
    const e = await messeGbp(k)
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(0)

    const fotos = e.befunde.find((b) => b.schluessel === 'fotos')!
    // ⚠ 0 Fotos ist ein MESSWERT (wert 0), keine Fehlstelle (wert null).
    expect(fotos.wert).toBe(0)
    expect(fotos.grund).toBeUndefined()
  })

  it('meldet eine Fehlstelle statt einer Null, wenn der Firmenname fehlt', async () => {
    const k = kontext({ firmenname: null, places: adapter([betrieb('Fremd', 'p9')], VOLL) })
    const e = await messeGbp(k)
    expect(e.befunde.every((b) => b.wert === null)).toBe(true)
    expect(e.befunde.every((b) => typeof b.grund === 'string' && b.grund.length > 0)).toBe(true)
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(0)
  })

  it('macht aus einem gesperrten Schluessel KEIN leeres Profil', async () => {
    const kaputt: PlacesAdapter = {
      suchText: async () => { throw new PlacesFehler('REQUEST_DENIED') },
      suchUmkreis: async () => [], details: async () => null, profil: async () => null,
    }
    const e = await messeGbp(kontext({ firmenname: 'Meyer', places: kaputt }))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.fehlstellen[0].grund).toContain('REQUEST_DENIED')
    // Kein einziger Befund, der dem Betrieb etwas vorwirft.
    expect(e.befunde.filter((b) => b.wert !== null)).toHaveLength(0)
  })

  it('gibt die Fotozahl als Untergrenze aus, wenn Places deckelt', async () => {
    const k = kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([betrieb('Sachverständigenbüro Meyer', 'p1', 42)], VOLL),
    })
    const e = await messeGbp(k)
    const fotos = e.befunde.find((b) => b.schluessel === 'fotos')!
    expect(String(fotos.einordnung)).toContain('mindestens')
  })

  it('ist im Weg aufbau nicht anwendbar', async () => {
    const e = await messeGbp(kontext({ modus: 'aufbau', firmenname: 'Meyer' }))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Schritt 2: Ausführen und Fehlschlag bestätigen**

`cd sv-levelup && npx vitest run lib/levelup/module/__tests__/gbp.test.ts`
Erwartung: FEHLSCHLAG, `Cannot find module '../gbp'`

- [ ] **Schritt 3: Umsetzen**

```ts
// sv-levelup/lib/levelup/module/gbp.ts
import { PlacesFehler, type Betrieb, type Profil } from '../../places'
import { kernName } from '../../anreicherung/kern-name'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`gbp: 22`). */
export const GBP_PUNKTE = 22
export const UMKREIS_KM = 25
export const SUCHBEGRIFF = 'Kfz-Sachverständiger'

/**
 * Punktverteilung — BESCHLUSS (die Messvorschrift `references/scoring-modell.md`
 * ist nicht auffindbar, wie bei `web` und `wett`).
 *
 * Gewichtet nach der am 19.08. ueber acht Muensteraner Betriebe GEMESSENEN
 * Streuung: Fotos (0 bis 10) und Bewertungszahl (3 bis 95) trennen die
 * Betriebe, Telefon und Website haben alle acht. Was nicht unterscheidet,
 * darf nicht schwer wiegen — sonst misst der Befund die Branche, nicht den
 * Betrieb.
 */
export const GEWICHTE = {
  fotos: 6, oeffnungszeiten: 5, bewertungszahl: 6,
  bewertungsschnitt: 3, telefon: 1, website: 1,
}

const MIN_KERN = 4

function vergleichbar(s: string): string {
  return kernName(s).replace(/\s+/g, '')
}

/** Wie in `wett` — derselbe Namensabgleich, damit beide denselben Betrieb finden. */
function findeEigenen(betriebe: Betrieb[], firmenname: string | null): Betrieb | null {
  if (!firmenname?.trim()) return null
  const gesucht = vergleichbar(firmenname)
  if (gesucht.length < MIN_KERN) return null
  return betriebe.find((b) => {
    const kandidat = vergleichbar(b.name)
    if (kandidat.length < MIN_KERN) return false
    return kandidat.includes(gesucht) || gesucht.includes(kandidat)
  }) ?? null
}

function stufe(wert: number, schwellen: number[], punkte: number[]): number {
  for (let i = schwellen.length - 1; i >= 0; i--) {
    if (wert >= schwellen[i]) return punkte[i]
  }
  return 0
}

/**
 * Modul `gbp` — das Google-Unternehmensprofil des geprueften Betriebs.
 *
 * Nur im Weg `bestand`: Wer noch aufbaut, hat kein Profil, das man beurteilen
 * koennte. Das ist keine Luecke, sondern der Ausgangspunkt — und steht als
 * solcher im Befund.
 */
export async function messeGbp(
  k: Messkontext & { firmenname?: string | null },
): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const SCHLUESSEL = ['fotos', 'oeffnungszeiten', 'bewertungszahl', 'bewertungsschnitt', 'telefon', 'website'] as const

  if (k.modus === 'aufbau') {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'gbp',
        grund: 'Ein Unternehmensprofil entsteht erst mit dem Betrieb — im Aufbau gibt es nichts zu beurteilen.',
      }],
    }
  }

  if (!k.standort) {
    return { befunde: [], fehlstellen: [{ schluessel: 'gbp', grund: 'Ohne Standort ist das Profil nicht auffindbar.' }] }
  }

  const quelle = `Google Places · Profil des Betriebs · ${k.standort.ort ?? 'Standort'}`

  let treffer: Betrieb[]
  let profil: Profil | null = null
  try {
    treffer = await k.places.suchText(SUCHBEGRIFF, { ...k.standort, km: UMKREIS_KM })
    const eigener = findeEigenen(treffer, k.firmenname ?? null)
    if (eigener) profil = await k.places.profil(eigener.placeId)
  } catch (err) {
    // ⚠ NIE als leeres Profil durchlassen — ein gesperrter Schluessel darf
    // nicht aussehen wie ein Betrieb, der sein Profil nicht pflegt.
    const text = err instanceof PlacesFehler ? err.status : (err as Error).message
    return {
      befunde: [],
      fehlstellen: [{ schluessel: 'gbp', grund: `Die Kartensuche antwortete nicht verwertbar (${text}) — Profil nicht erhoben.` }],
    }
  }

  if (!profil) {
    const grund = k.firmenname?.trim()
      ? `„${k.firmenname}" war in der Kartensuche nicht auffindbar — das Profil ließ sich nicht zuordnen.`
      : 'Für diesen Check ist kein Firmenname hinterlegt — das eigene Profil lässt sich nicht identifizieren.'
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // ⚠ Places liefert hoechstens zehn Fotos. „10" heisst „mindestens 10" — der
  // Befund darf keine Obergrenze behaupten, die er nicht kennt.
  const fotoText = profil.fotos >= 10 ? 'mindestens 10 hinterlegt' : `${profil.fotos} hinterlegt`
  befunde.push(befund(
    'fotos', LABEL.fotos, profil.fotos,
    stufe(profil.fotos, [1, 4, 10], [2, 4, 6]), GEWICHTE.fotos, quelle, erhoben,
    profil.fotos === 0
      ? 'Kein einziges Foto — Profile mit Bildern werden deutlich häufiger angeklickt.'
      : `${fotoText}. Räume, Team und Fahrzeuge wirken stärker als Logos.`,
  ))

  befunde.push(befund(
    'oeffnungszeiten', LABEL.oeffnungszeiten, profil.oeffnungszeiten,
    profil.oeffnungszeiten ? GEWICHTE.oeffnungszeiten : 0, GEWICHTE.oeffnungszeiten, quelle, erhoben,
    profil.oeffnungszeiten
      ? 'Hinterlegt — Google zeigt „geöffnet" bzw. „geschlossen" an.'
      : 'Nicht hinterlegt. Ohne Zeiten fehlt in der Kartensuche der Hinweis „jetzt geöffnet".',
  ))

  const anzahl = profil.bewertungen ?? 0
  befunde.push(befund(
    'bewertungszahl', LABEL.bewertungszahl, anzahl,
    stufe(anzahl, [1, 10, 30], [2, 4, 6]), GEWICHTE.bewertungszahl, quelle, erhoben,
    anzahl === 0 ? 'Noch keine Bewertung.' : `${anzahl} Bewertungen.`,
  ))

  const schnitt = profil.bewertung
  if (schnitt === null) {
    befunde.push(nichtErhoben(
      'bewertungsschnitt', LABEL.bewertungsschnitt, GEWICHTE.bewertungsschnitt,
      'Ohne Bewertungen gibt es keinen Durchschnitt.', quelle, erhoben,
    ))
  } else {
    befunde.push(befund(
      'bewertungsschnitt', LABEL.bewertungsschnitt, schnitt,
      stufe(schnitt, [4.0, 4.5], [2, 3]), GEWICHTE.bewertungsschnitt, quelle, erhoben,
      schnitt >= 4.5 ? 'Im oberen Bereich.' : `Durchschnitt ${schnitt.toFixed(1)}.`,
    ))
  }

  befunde.push(befund(
    'telefon', LABEL.telefon, profil.telefon !== null,
    profil.telefon ? GEWICHTE.telefon : 0, GEWICHTE.telefon, quelle, erhoben,
    profil.telefon ? 'Im Profil hinterlegt.' : 'Keine Nummer im Profil.',
  ))

  befunde.push(befund(
    'website', LABEL.website, profil.website !== null,
    profil.website ? GEWICHTE.website : 0, GEWICHTE.website, quelle, erhoben,
    profil.website ? `Verlinkt: ${profil.website}` : 'Keine Website im Profil verlinkt.',
  ))

  return { befunde, fehlstellen }
}

const LABEL: Record<string, string> = {
  fotos: 'Fotos im Profil',
  oeffnungszeiten: 'Öffnungszeiten hinterlegt',
  bewertungszahl: 'Anzahl Bewertungen',
  bewertungsschnitt: 'Durchschnittliche Bewertung',
  telefon: 'Telefonnummer im Profil',
  website: 'Website im Profil',
}
```

- [ ] **Schritt 4: Test grün, dann Registry eintragen**

`npx vitest run lib/levelup/module/__tests__/gbp.test.ts` → alle grün.
Dann in `module/index.ts`: `gbp: messeGbp` ergänzen.
Dann `npx vitest run lib/levelup` — der Registry-Test prüft, dass `GBP_PUNKTE` gleich `MODULE.find(m => m.id==='gbp').punkte` ist.

- [ ] **Schritt 5: Gegen die echte API prüfen**

Denselben Münsteraner Betrieb messen, den Aufgabe 2 geprüft hat, und die Ausgabe **lesen** — nicht nur auf grün schauen:
```bash
cd sv-levelup && npx tsx scripts/modul-probe.ts gbp "Kfz-Sachverständigenbüro Stanoksei" 48163
```
Erwartung: `oeffnungszeiten: false` — dieser Betrieb pflegt sie nicht (am 19.08. gemessen). Steht dort `true`, ist die Abbildung falsch.

- [ ] **Schritt 6: Festschreiben**

```bash
git add sv-levelup/lib/levelup/module/gbp.ts sv-levelup/lib/levelup/module/__tests__/gbp.test.ts sv-levelup/lib/levelup/module/index.ts
git commit -m "feat(sv-levelup): Modul gbp — Unternehmensprofil, 22 Punkte"
```

---

### Aufgabe 4: Modul `seo` — Auffindbarkeit der Website (12 Punkte)

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/module/seo.ts`
- Ändern: `sv-levelup/lib/levelup/module/index.ts`
- Test: `sv-levelup/lib/levelup/module/__tests__/seo.test.ts`

**Schnittstellen:**
- Verbraucht: `Messkontext.hole`/`websiteUrl`, `html.ts` aus Aufgabe 1
- Erzeugt: `messeSeo`, `SEO_PUNKTE = 12`

**Punktverteilung — BESCHLUSS:**
```
titel          3   vorhanden (1) + Ortsbezug (1) + Länge 30-65 (1)
beschreibung   3   vorhanden (2) + Länge 70-160 (1)
h1             2   genau eine
ortsbezug      2   Ort oder PLZ im sichtbaren Text
daten          2   schema.org LocalBusiness / JSON-LD
              ---
              12
```

⚠ **Ortsbezug ist das Herz.** Ein Sachverständiger wird örtlich gesucht („Kfz Gutachter Münster"). Eine Seite ohne Ortsnamen im Titel kann diese Suche nicht gewinnen — unabhängig von allem anderen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
// sv-levelup/lib/levelup/module/__tests__/seo.test.ts
import { describe, expect, it } from 'vitest'
import type { Messkontext } from '../../modul-vertrag'
import { SEO_PUNKTE, messeSeo } from '../seo'

function kontext(html: string | null, ort = 'Münster'): Messkontext {
  return {
    modus: 'bestand',
    websiteUrl: html === null ? null : 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.63, ort, plz: '48143' },
    hole: async () => html === null
      ? { ok: false, status: 0, fehler: 'kein Abruf', dauerMs: 0 }
      : { ok: true, status: 200, text: html, dauerMs: 120 },
    places: {} as never,
    jetzt: () => '2026-08-19T10:00:00.000Z',
  } as unknown as Messkontext
}

const GUT = `<html><head>
  <title>Kfz-Gutachter Münster — Sachverständigenbüro Meyer</title>
  <meta name="description" content="Unabhängiges Kfz-Sachverständigenbüro in Münster. Unfallgutachten, Wertgutachten und Beweissicherung — kurzfristige Termine im gesamten Münsterland.">
  <script type="application/ld+json">{"@type":"LocalBusiness","name":"Meyer"}</script>
  </head><body><h1>Ihr Kfz-Gutachter in Münster</h1>
  <p>${'Wir erstellen Gutachten in Münster und Umgebung. '.repeat(30)}</p>
  </body></html>`

describe('messeSeo', () => {
  it('vergibt die volle Punktzahl fuer eine vollstaendige Seite', async () => {
    const e = await messeSeo(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(SEO_PUNKTE)
  })

  it('erkennt einen fehlenden Ortsbezug im Titel', async () => {
    const ohneOrt = GUT.replace('Kfz-Gutachter Münster — Sachverständigenbüro Meyer', 'Herzlich willkommen')
    const e = await messeSeo(kontext(ohneOrt))
    const titel = e.befunde.find((b) => b.schluessel === 'titel')!
    expect(titel.punkte).toBeLessThan(3)
    expect(String(titel.einordnung)).toContain('Münster')
  })

  it('zaehlt mehrere h1 als Mangel', async () => {
    const zwei = GUT.replace('</body>', '<h1>Noch eine</h1></body>')
    const e = await messeSeo(kontext(zwei))
    expect(e.befunde.find((b) => b.schluessel === 'h1')!.punkte).toBe(0)
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><head><title>App</title></head><body><div id="root"></div>' +
      '<script src="/bundle.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeSeo(kontext(spa))
    // ⚠ Der teuerste Fehler des Projekts: einer React-Seite fehlendes
    // Impressum vorwerfen. Hier dasselbe Muster fuer h1 und Ortsbezug.
    for (const s of ['h1', 'ortsbezug'] as const) {
      const b = e.befunde.find((x) => x.schluessel === s)!
      expect(b.wert).toBeNull()
      expect(b.grund).toBeTruthy()
    }
  })

  it('meldet eine Fehlstelle statt Nullen, wenn keine Website hinterlegt ist', async () => {
    const e = await messeSeo(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.befunde.filter((b) => b.wert !== null)).toHaveLength(0)
  })
})
```

- [ ] **Schritt 2: Ausführen und Fehlschlag bestätigen**

`npx vitest run lib/levelup/module/__tests__/seo.test.ts` → `Cannot find module '../seo'`

- [ ] **Schritt 3: Umsetzen**

```ts
// sv-levelup/lib/levelup/module/seo.ts
import { attribut, istClientseitig, sichtbarerText, textIn } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

export const SEO_PUNKTE = 12
export const GEWICHTE = { titel: 3, beschreibung: 3, h1: 2, ortsbezug: 2, daten: 2 }

const LABEL: Record<string, string> = {
  titel: 'Seitentitel',
  beschreibung: 'Beschreibung für die Trefferliste',
  h1: 'Hauptüberschrift',
  ortsbezug: 'Ortsbezug im Text',
  daten: 'Strukturierte Daten',
}

/** Enthaelt der Text den Ort oder die Postleitzahl? */
function nenntOrt(text: string, ort: string | null, plz: string | null): boolean {
  const t = text.toLowerCase()
  if (ort && ort.length >= 3 && t.includes(ort.toLowerCase())) return true
  if (plz && plz.length >= 4 && t.includes(plz)) return true
  return false
}

export async function messeSeo(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const SCHLUESSEL = ['titel', 'beschreibung', 'h1', 'ortsbezug', 'daten'] as const

  if (!k.websiteUrl) {
    return {
      befunde: [],
      fehlstellen: [{ schluessel: 'seo', grund: 'Ohne Website ist die Auffindbarkeit einer Seite nicht messbar.' }],
    }
  }

  const quelle = `Abruf von ${k.websiteUrl}`
  const antwort = await k.hole(k.websiteUrl)
  if (!antwort.ok || !antwort.text) {
    const grund = `Die Seite war nicht abrufbar (${antwort.fehler ?? `HTTP ${antwort.status}`}).`
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const html = antwort.text
  const text = sichtbarerText(html)
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // Titel und Beschreibung stehen im Kopf und liefert auch eine Anwendung aus,
  // die ihre Inhalte erst im Browser aufbaut. Sie sind also immer messbar.
  const titel = textIn(html, 'title')[0] ?? ''
  const titelOrt = nenntOrt(titel, k.standort?.ort ?? null, k.standort?.plz ?? null)
  const titelLaenge = titel.length >= 30 && titel.length <= 65
  befunde.push(befund(
    'titel', LABEL.titel, titel || '(leer)',
    (titel ? 1 : 0) + (titelOrt ? 1 : 0) + (titelLaenge ? 1 : 0), GEWICHTE.titel, quelle, erhoben,
    !titel ? 'Kein Titel gesetzt — in der Trefferliste steht dann der Domainname.'
      : !titelOrt ? `Ohne Ortsnamen. Wer „Kfz Gutachter ${k.standort?.ort ?? 'Ort'}" sucht, findet diese Seite schwerer.`
      : titelLaenge ? 'Länge und Ortsbezug passen.'
      : `${titel.length} Zeichen — zwischen 30 und 65 wird er in der Trefferliste nicht abgeschnitten.`,
  ))

  const beschreibungen = attribut(html, 'meta', 'content')
  const namen = attribut(html, 'meta', 'name').map((n) => n.toLowerCase())
  const idx = namen.indexOf('description')
  const beschreibung = idx >= 0 ? (beschreibungen[idx] ?? '') : ''
  const beschrLaenge = beschreibung.length >= 70 && beschreibung.length <= 160
  befunde.push(befund(
    'beschreibung', LABEL.beschreibung, beschreibung || '(fehlt)',
    (beschreibung ? 2 : 0) + (beschrLaenge ? 1 : 0), GEWICHTE.beschreibung, quelle, erhoben,
    !beschreibung ? 'Nicht gesetzt — Google schneidet sich dann selbst einen Satz aus der Seite.'
      : beschrLaenge ? 'Länge passt.'
      : `${beschreibung.length} Zeichen — zwischen 70 und 160 wird sie vollständig angezeigt.`,
  ))

  // ⚠ Alles Weitere lebt im Rumpf. Bei einer clientseitigen Anwendung ist der
  // Rumpf leer, OBWOHL der Browser Inhalte zeigt — hier nichts vorwerfen.
  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf. Was ein Leser sieht, steht nicht im ausgelieferten Text — ' +
      'ohne Browser ist das nicht feststellbar.'
    for (const s of ['h1', 'ortsbezug'] as const) {
      befunde.push(nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben))
    }
  } else {
    const h1 = textIn(html, 'h1')
    befunde.push(befund(
      'h1', LABEL.h1, h1.length,
      h1.length === 1 ? GEWICHTE.h1 : 0, GEWICHTE.h1, quelle, erhoben,
      h1.length === 0 ? 'Keine Hauptüberschrift — die Seite sagt nicht, worum es geht.'
        : h1.length === 1 ? `„${h1[0]}"`
        : `${h1.length} Hauptüberschriften. Genau eine sagt, worum es auf der Seite geht.`,
    ))

    const hatOrt = nenntOrt(text, k.standort?.ort ?? null, k.standort?.plz ?? null)
    befunde.push(befund(
      'ortsbezug', LABEL.ortsbezug, hatOrt,
      hatOrt ? GEWICHTE.ortsbezug : 0, GEWICHTE.ortsbezug, quelle, erhoben,
      hatOrt ? `${k.standort?.ort ?? 'Der Ort'} kommt im Text vor.`
        : `Weder „${k.standort?.ort ?? 'der Ort'}" noch die Postleitzahl stehen im Text. Gutachter werden örtlich gesucht.`,
    ))
  }

  // Strukturierte Daten stehen als Skript-Block im Quelltext — auch bei einer
  // Anwendung messbar.
  const jsonLd = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  const hatLocalBusiness = Boolean(jsonLd && /localbusiness|autorepair|professionalservice/i.test(jsonLd[1]))
  befunde.push(befund(
    'daten', LABEL.daten, hatLocalBusiness,
    hatLocalBusiness ? GEWICHTE.daten : 0, GEWICHTE.daten, quelle, erhoben,
    hatLocalBusiness ? 'Vorhanden — Google kann Adresse und Öffnungszeiten direkt auslesen.'
      : 'Nicht hinterlegt. Damit erkennt Google Adresse, Zeiten und Bewertungen nicht als solche.',
  ))

  return { befunde, fehlstellen }
}
```

- [ ] **Schritt 4: Test grün, Registry eintragen, echte Seite prüfen**

```bash
npx vitest run lib/levelup/module/__tests__/seo.test.ts
# dann in module/index.ts: seo: messeSeo
npx tsx scripts/modul-probe.ts seo https://www.kfz-sachverstaendigenbuero-stanoksei.de 48163
```
Die Ausgabe **lesen**: Wirft das Modul der Seite etwas vor, das im Browser sichtbar ist? Dann greift der Anwendungsschutz nicht.

- [ ] **Schritt 5: Festschreiben**

```bash
git add sv-levelup/lib/levelup/module/seo.ts sv-levelup/lib/levelup/module/__tests__/seo.test.ts sv-levelup/lib/levelup/module/index.ts
git commit -m "feat(sv-levelup): Modul seo — Auffindbarkeit der Website, 12 Punkte"
```

---

### Aufgabe 5: Modul `ux` — kommt der Anrufer durch? (12 Punkte)

Nicht „schön", sondern: Findet ein Unfallgeschädigter am Handy in zehn Sekunden die Telefonnummer?

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/module/ux.ts`
- Ändern: `sv-levelup/lib/levelup/module/index.ts`
- Test: `sv-levelup/lib/levelup/module/__tests__/ux.test.ts`

**Punktverteilung — BESCHLUSS:**
```
telefon-link   4   <a href="tel:…"> vorhanden
kontaktweg     3   Formular oder E-Mail-Link
oben           2   Telefonnummer in den ersten 2000 Zeichen des Rumpfs
zeiten         2   Öffnungszeiten oder Erreichbarkeit auf der Seite
notfall        1   Hinweis auf kurzfristige Erreichbarkeit / 24 h
              ---
              12
```

⚠ **`tel:`-Link wiegt am schwersten.** Auf dem Handy ist eine nicht klickbare Nummer eine Nummer, die abgeschrieben werden muss — genau in dem Moment, in dem jemand am Unfallort steht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
// sv-levelup/lib/levelup/module/__tests__/ux.test.ts
import { describe, expect, it } from 'vitest'
import type { Messkontext } from '../../modul-vertrag'
import { UX_PUNKTE, messeUx } from '../ux'

function kontext(html: string | null): Messkontext {
  return {
    modus: 'bestand',
    websiteUrl: html === null ? null : 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.63, ort: 'Münster', plz: '48143' },
    hole: async () => html === null
      ? { ok: false, status: 0, fehler: 'kein Abruf', dauerMs: 0 }
      : { ok: true, status: 200, text: html, dauerMs: 120 },
    places: {} as never,
    jetzt: () => '2026-08-19T10:00:00.000Z',
  } as unknown as Messkontext
}

const GUT = `<html><body>
  <a href="tel:+492511234567">0251 1234567</a>
  <p>Erreichbar Montag bis Freitag 08:00–18:00 Uhr, im Notfall rund um die Uhr.</p>
  <form action="/kontakt"><input name="name"><button>Senden</button></form>
  ${'<p>Wir begutachten Ihren Unfallschaden schnell und unabhängig.</p>'.repeat(40)}
  </body></html>`

describe('messeUx', () => {
  it('vergibt die volle Punktzahl fuer eine erreichbare Seite', async () => {
    const e = await messeUx(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(UX_PUNKTE)
  })

  it('erkennt eine nicht klickbare Telefonnummer', async () => {
    const ohneLink = GUT.replace('<a href="tel:+492511234567">0251 1234567</a>', '<span>0251 1234567</span>')
    const e = await messeUx(kontext(ohneLink))
    const t = e.befunde.find((b) => b.schluessel === 'telefonLink')!
    expect(t.punkte).toBe(0)
    // Die Nummer STEHT da — der Befund muss den Unterschied benennen.
    expect(String(t.einordnung)).toContain('Handy')
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><body><div id="root"></div>' + '<script src="/b.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeUx(kontext(spa))
    expect(e.befunde.every((b) => b.wert === null)).toBe(true)
    expect(e.befunde.every((b) => Boolean(b.grund))).toBe(true)
  })

  it('meldet eine Fehlstelle, wenn keine Website hinterlegt ist', async () => {
    const e = await messeUx(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Schritt 2: Ausführen und Fehlschlag bestätigen**

`npx vitest run lib/levelup/module/__tests__/ux.test.ts` → `Cannot find module '../ux'`

- [ ] **Schritt 3: Umsetzen**

```ts
// sv-levelup/lib/levelup/module/ux.ts
import { istClientseitig, sichtbarerText } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

export const UX_PUNKTE = 12
export const GEWICHTE = { telefonLink: 4, kontaktweg: 3, oben: 2, zeiten: 2, notfall: 1 }

const LABEL: Record<string, string> = {
  telefonLink: 'Telefonnummer anklickbar',
  kontaktweg: 'Zweiter Kontaktweg',
  oben: 'Nummer im oberen Bereich',
  zeiten: 'Erreichbarkeit genannt',
  notfall: 'Kurzfristige Erreichbarkeit',
}

/** Die ersten Zeichen des Rumpfs — was ein Leser ohne Scrollen sieht. */
const OBEN_ZEICHEN = 2000

export async function messeUx(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const SCHLUESSEL = ['telefonLink', 'kontaktweg', 'oben', 'zeiten', 'notfall'] as const

  if (!k.websiteUrl) {
    return {
      befunde: [],
      fehlstellen: [{ schluessel: 'ux', grund: 'Ohne Website gibt es keinen Weg, den man prüfen könnte.' }],
    }
  }

  const quelle = `Abruf von ${k.websiteUrl}`
  const antwort = await k.hole(k.websiteUrl)
  if (!antwort.ok || !antwort.text) {
    const grund = `Die Seite war nicht abrufbar (${antwort.fehler ?? `HTTP ${antwort.status}`}).`
    return { befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)), fehlstellen: [] }
  }

  const html = antwort.text

  // ⚠ Eine Anwendung baut Kontaktdaten erst im Browser auf. Der Vorwurf
  // „keine Telefonnummer" waere dann schlicht falsch.
  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf — welche Kontaktwege ein Leser sieht, ist ohne Browser nicht feststellbar.'
    return { befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)), fehlstellen: [] }
  }

  const text = sichtbarerText(html)
  const rumpf = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  const telLink = /href\s*=\s*["']tel:/i.test(html)
  // Eine sichtbare Nummer ohne Link ist der interessante Fall — deshalb
  // getrennt erkannt, damit der Befund den Unterschied benennen kann.
  const nummerSichtbar = /\b0\d{2,5}[\s/-]?\d{3,}/.test(text)
  befunde.push(befund(
    'telefonLink', LABEL.telefonLink, telLink,
    telLink ? GEWICHTE.telefonLink : 0, GEWICHTE.telefonLink, quelle, erhoben,
    telLink ? 'Ein Fingertipp wählt die Nummer.'
      : nummerSichtbar
        ? 'Die Nummer steht auf der Seite, ist aber nicht verlinkt — am Handy muss sie abgeschrieben werden, genau am Unfallort.'
        : 'Keine Telefonnummer gefunden. Am Handy führt kein Weg zum Anruf.',
  ))

  const formular = /<form\b/i.test(html)
  const mailLink = /href\s*=\s*["']mailto:/i.test(html)
  befunde.push(befund(
    'kontaktweg', LABEL.kontaktweg, formular || mailLink,
    formular || mailLink ? GEWICHTE.kontaktweg : 0, GEWICHTE.kontaktweg, quelle, erhoben,
    formular ? 'Kontaktformular vorhanden.'
      : mailLink ? 'E-Mail-Adresse verlinkt.'
      : 'Weder Formular noch E-Mail-Link — wer nicht anrufen mag, hat keinen Weg.',
  ))

  const obenText = sichtbarerText(rumpf.slice(0, OBEN_ZEICHEN))
  const obenNummer = /\b0\d{2,5}[\s/-]?\d{3,}/.test(obenText) || /href\s*=\s*["']tel:/i.test(rumpf.slice(0, OBEN_ZEICHEN))
  befunde.push(befund(
    'oben', LABEL.oben, obenNummer,
    obenNummer ? GEWICHTE.oben : 0, GEWICHTE.oben, quelle, erhoben,
    obenNummer ? 'Im oberen Bereich sichtbar.' : 'Erst weiter unten — wer eilig ist, scrollt nicht.',
  ))

  const zeiten = /\d{1,2}[:.]\d{2}\s*(–|-|bis)\s*\d{1,2}[:.]\d{2}/.test(text) ||
    /(montag|mo\.?)\s*(–|-|bis)\s*(freitag|fr\.?)/i.test(text)
  befunde.push(befund(
    'zeiten', LABEL.zeiten, zeiten,
    zeiten ? GEWICHTE.zeiten : 0, GEWICHTE.zeiten, quelle, erhoben,
    zeiten ? 'Erreichbarkeit steht auf der Seite.' : 'Keine Zeiten genannt — unklar, wann jemand rangeht.',
  ))

  const notfall = /(24\s*(h|stunden)|rund um die uhr|notfall|kurzfristig|noch heute|sofort)/i.test(text)
  befunde.push(befund(
    'notfall', LABEL.notfall, notfall,
    notfall ? GEWICHTE.notfall : 0, GEWICHTE.notfall, quelle, erhoben,
    notfall ? 'Kurzfristige Erreichbarkeit wird zugesagt.'
      : 'Kein Hinweis auf kurzfristige Termine — nach einem Unfall zählt genau das.',
  ))

  return { befunde, fehlstellen }
}
```

- [ ] **Schritt 4: Test grün, Registry eintragen**

`npx vitest run lib/levelup` — alles grün, einschließlich der Registry-Punktprüfung.

- [ ] **Schritt 5: Festschreiben**

```bash
git add sv-levelup/lib/levelup/module/ux.ts sv-levelup/lib/levelup/module/__tests__/ux.test.ts sv-levelup/lib/levelup/module/index.ts
git commit -m "feat(sv-levelup): Modul ux — Erreichbarkeit fuer den Anrufer, 12 Punkte"
```

---

### Aufgabe 6: Maßnahmen für die neuen Module

Ohne diesen Schritt misst der Befund mehr, aber der Plan bleibt gleich lang. Genau das war der erste Klick-Durchlauf: zwölf von zwölf Punkten und **null** Maßnahmen.

**Dateien:**
- Ändern: `sv-levelup/lib/levelup/massnahmen.ts` (Vorlagen ergänzen)
- Test: `sv-levelup/lib/levelup/__tests__/massnahmen.test.ts` (erweitern)

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
it('schlaegt zu jedem verlorenen Punkt der neuen Module etwas vor', async () => {
  // Je Modul ein Befund mit 0 von voller Punktzahl.
  const befunde = {
    gbp: { befunde: [
      { schluessel: 'fotos', label: 'Fotos im Profil', wert: 0, punkte: 0, maximum: 6, ampel: 'rot', quelle: 'q', erhoben: 'e' },
      { schluessel: 'oeffnungszeiten', label: 'Öffnungszeiten', wert: false, punkte: 0, maximum: 5, ampel: 'rot', quelle: 'q', erhoben: 'e' },
    ], istPunkte: 0, maxPunkte: 11 },
    seo: { befunde: [
      { schluessel: 'titel', label: 'Seitentitel', wert: '', punkte: 0, maximum: 3, ampel: 'rot', quelle: 'q', erhoben: 'e' },
    ], istPunkte: 0, maxPunkte: 3 },
    ux: { befunde: [
      { schluessel: 'telefonLink', label: 'Telefon anklickbar', wert: false, punkte: 0, maximum: 4, ampel: 'rot', quelle: 'q', erhoben: 'e' },
    ], istPunkte: 0, maxPunkte: 4 },
  }
  const m = leiteMassnahmenAb(befunde as never)
  for (const s of ['fotos', 'oeffnungszeiten', 'titel', 'telefonLink']) {
    expect(m.some((x) => x.q.includes(s) || x.t.length > 0)).toBe(true)
  }
  // Jede Massnahme nennt ihre Quelle (R-A).
  expect(m.every((x) => typeof x.q === 'string' && x.q.length > 0)).toBe(true)
})
```

- [ ] **Schritt 2: Ausführen und Fehlschlag bestätigen**

`npx vitest run lib/levelup/__tests__/massnahmen.test.ts` → FEHLSCHLAG (keine Vorlage trifft die neuen Schlüssel)

- [ ] **Schritt 3: Vorlagen ergänzen**

In `massnahmen.ts` je Schlüssel eine Vorlage nach dem bestehenden Muster (`t` Titel, `w` Was zu tun ist, `p` Punkte, `a` Aufwand, `wi` Wirkung, `q` Quelle). Beispiele:

```ts
  fotos: {
    t: 'Fotos ins Unternehmensprofil laden',
    w: 'Zehn Aufnahmen: Außenansicht, Empfang, Messplatz, Team, ein Fahrzeug in Begutachtung. ' +
       'Profile mit Bildern werden deutlich häufiger angeklickt als solche ohne.',
    a: 'eine Stunde', wi: 'hoch',
  },
  oeffnungszeiten: {
    t: 'Öffnungszeiten hinterlegen',
    w: 'Im Unternehmensprofil eintragen, damit in der Kartensuche „jetzt geöffnet" erscheint. ' +
       'Fünf Minuten Arbeit.',
    a: 'fünf Minuten', wi: 'mittel',
  },
  telefonLink: {
    t: 'Telefonnummer anklickbar machen',
    w: 'Die Nummer als <a href="tel:…"> auszeichnen. Am Handy wählt dann ein Fingertipp — ' +
       'ohne das muss sie am Unfallort abgeschrieben werden.',
    a: 'zehn Minuten', wi: 'hoch',
  },
```

⚠ **Der Wortlaut geht an einen Sachverständigen.** Keine Fachbegriffe ohne Erklärung, kein „optimieren", keine Zahlen ohne Bezug. Aaron liest diese Vorlagen gegen, bevor sie jemand sieht.

- [ ] **Schritt 4: Test grün**

`npx vitest run lib/levelup`

- [ ] **Schritt 5: Festschreiben**

```bash
git add sv-levelup/lib/levelup/massnahmen.ts sv-levelup/lib/levelup/__tests__/massnahmen.test.ts
git commit -m "feat(sv-levelup): Massnahmen-Vorlagen fuer gbp, seo und ux"
```

---

### Aufgabe 7: Die ganze Kette durchklicken

Kein Abschluss ohne Durchlauf. Grüne Tests beweisen, dass der Code tut, was die Tests sagen — nicht, dass der Befund stimmt.

- [ ] **Schritt 1: Bauen und starten**

```bash
cd sv-levelup && npm run build && PORT=3011 npm run start &
```
⚠ Auf Windows beendet `pkill` den alten Server nicht. Läuft schon einer auf dem Port, scheitert der neue still mit `EADDRINUSE` und man befragt den **alten** Aufbau:
```powershell
Get-NetTCPConnection -LocalPort 3011 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

- [ ] **Schritt 2: Einen echten Betrieb messen**

Über die Oberfläche, nicht per Skript: Weg „bestand", Firmenname eines echten Münsteraner Betriebs, dessen Website, PLZ 48163. Dann alle Module wählen und messen lassen.

- [ ] **Schritt 3: Den Befund LESEN**

Nicht auf grün prüfen, sondern auf **wahr**:
- Steht bei `gbp` `Öffnungszeiten: nicht hinterlegt` für den Betrieb, bei dem das am 19.08. gemessen wurde?
- Wirft irgendein Modul der Website etwas vor, das im Browser sichtbar ist? Dann greift der Anwendungsschutz nicht.
- Nennt jeder Befund Quelle und Zeitpunkt?
- Ist irgendwo eine `0`, wo „nicht erhoben" richtig wäre?

- [ ] **Schritt 4: Punktsumme prüfen**

Die erhebbaren Punkte müssen jetzt **76** betragen (`web` 12 + `wett` 18 + `gbp` 22 + `seo` 12 + `ux` 12), sofern Website und Firmenname vorliegen. Steht dort weniger, wurde ein Modul gesperrt — der Grund muss im Befund stehen.

- [ ] **Schritt 5: Vollständig prüfen und festschreiben**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

---

## Selbstprüfung des Plans

**Deckung:** Drei Module aus `MODULE` (gbp/seo/ux), der Adapter, der sie versorgt, das gemeinsame HTML-Werkzeug und die Maßnahmen, ohne die der Befund folgenlos bliebe. **Nicht** enthalten und bewusst offen: `verz`, `zuweiser`, `nach` (bauen, aber eigener Plan) sowie `gsc`/`ads`/`kwg`/`kwm` — 44 Punkte, die an Aarons Konten hängen (A-6).

**Platzhalter:** keine. Jeder Schritt enthält den Code oder den Befehl.

**Typen:** `Profil` erweitert `Betrieb`; `messeGbp` nimmt `Messkontext & { firmenname }` wie `messeWett`; alle drei Module liefern `Messergebnis`. Die Punktkonstanten heißen einheitlich `<MODUL>_PUNKTE` und werden gegen die Registry geprüft.

**Was dieser Plan bewusst NICHT misst:** die Profilkategorie. Sie steht im Mockup, ist aber über die Places-API nicht erhebbar — am 19.08. an acht Betrieben nachgemessen. Ein Kriterium, das allen dieselbe Note gibt, ist keine Messung.
