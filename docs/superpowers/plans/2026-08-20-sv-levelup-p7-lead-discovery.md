# SV-LevelUp P7 — Lead-Discovery über die Kartensuche

> **Für agentische Arbeiter:** PFLICHT-SUB-SKILL: `superpowers:executing-plans`.

**Ziel:** Brennstoff. Die Software steht, aber sie läuft auf 64 Leads — 45 Firmen, davon 14 erreichbar. Der Markt hat rund 5.500 freie Kfz-Sachverständige. Ohne Zufluss ergeben die 64 zwei bis fünf Antworten, einmalig.

**Aufbau:** Ein Quadtree über Deutschland, Text Search je Kachel, Verfeinerung dort, wo die Kartensuche bei 60 Treffern deckelt. Dedup über `google_place_id` (hart) und Name plus Umkreis (weich). Ziel ist `sv_leads`, keine Datei.

## Weltweite Vorgaben

R-A, R-B, `{ ok, error }` statt `throw`, `.select()` + Zeilenprüfung bei jedem Write, Umlaute in nutzersichtbaren Texten. Dazu:

- **R-M** — geschrieben wird ausschließlich in `sv_leads`. Nie `leads`, `faelle`, `claims`, `partner_leads`.
- **Trockenlauf ist der Standard.** `--schreiben` schaltet scharf, wie bei `npm run anreicherung`.
- **`cold_mail_sequenzen.aktiv` und `auto_enroll` rührt dieser Lauf nicht an.** Leads gewinnen und Leads anschreiben sind getrennte Vorgänge mit getrennter Rechtsgrundlage: Erhebung aus öffentlichen Quellen ist Art. 6 I f, werbliche Ansprache ist § 7 II UWG.

## Was der Bestand schon hergibt — geprüft, nicht angenommen

| | Stand |
|---|---|
| `sv_leads` | **64** Zeilen (nicht 62 — zwei kamen aus meinen eigenen Testläufen, `quelle='sv-levelup'`) |
| `google_place_id` | Spalte da, **UNIQUE-Index** `sv_leads_google_place_id_uidx`, **0** gefüllt |
| `entdeckt_am`, `entdeckt_lauf` | da, leer |
| `normalized_name` | ⚠ **GENERATED ALWAYS** aus `name` (`lower` + Leerraum) — **nicht setzbar**. Ein Insert, der sie mitschickt, schlägt fehl. Die erste Fassung dieses Plans wollte sie füllen; der Bestandscode in `dubletten.ts` sagt ausdrücklich, warum sie für den Abgleich ohnehin untauglich ist (keine Gattungswort-Entfernung) |
| `ist_aktiv` | ⚠ Vorgabewert **`true`** — ohne ausdrückliches `false` erscheint jeder neue Lead sofort auf den öffentlichen Karten |
| `name` | NOT NULL, kein Vorgabewert → `nameAusQuelle()` aus P4 füllt ihn |
| Dedup weich | `istDublette()` aus P4 — `kernName` + Haversine ≤ 10 km |

⚠ **Kosten gelten auch für den Trockenlauf.** Er unterdrückt das Schreiben, nicht die Abrufe. Ein Trockenlauf über ganz Deutschland kostet genauso viel wie ein scharfer. Deshalb: erst eine Region, dann das Land.

⚠ **Legacy zahlt anders als New.** Die Spec rechnet mit der New API, wo Discovery ohne Enterprise-Felder in die Pro-Stufe fällt (5.000 gratis). Legacy kennt keine Field-Mask bei Text Search — die Antwort enthält, was sie enthält, und der Preis richtet sich nach der SKU. Was ein Lauf tatsächlich kostet, **misst Aufgabe 5 an einer Region**, statt es hochzurechnen.

---

### Aufgabe 1: Der Quadtree

**Dateien:** `sv-levelup/lib/discovery/kacheln.ts` + Test

Reine Rechenlogik, kein Netz — deshalb zuerst und vollständig testbar.

**Schnittstellen:**
```ts
export type Kachel = { sued: number; west: number; nord: number; ost: number; tiefe: number }
export const DEUTSCHLAND: Kachel   // 47.27–55.06 N, 5.87–15.04 O, tiefe 0
export function mittelpunkt(k: Kachel): { lat: number; lng: number }
export function radiusKm(k: Kachel): number      // halbe Diagonale, deckt die Ecken ab
export function vierteile(k: Kachel): Kachel[]   // NW, NO, SW, SO
export function startKacheln(gebiet: Kachel, maxRadiusKm: number): Kachel[]
```

**Vier Entscheidungen, die der Test festhält:**

1. **Der Radius ist die halbe Diagonale, nicht die halbe Kantenlänge.** Ein Kreis um den Mittelpunkt mit halber Kante lässt die Ecken frei — dort säßen Büros, die niemand findet. Der größere Kreis überlappt mit den Nachbarn; das ist gewollt, Dedup fängt es.
2. **Google deckelt `radius` bei 50.000 m.** `startKacheln` teilt vor, bis jede Kachel darunter liegt. Eine zu große Kachel würde stillschweigend beschnitten — und die Lücke fiele niemandem auf.
3. **Ein Längengrad ist in Flensburg kürzer als in Konstanz.** Die Umrechnung Grad → km nimmt `cos(lat)` für die Ost-West-Richtung. Ohne das sind die nördlichen Kacheln zu breit gerechnet und ihr Radius zu klein.
4. **`vierteile` erhöht die Tiefe.** Die Tiefe begrenzt die Verfeinerung (Aufgabe 3) — ohne Grenze teilt ein dichtes Stadtgebiet unbegrenzt weiter.

- [ ] **Schritt 1–5:** Test → rot → bauen → grün → festschreiben

---

### Aufgabe 2: Der Schreibpfad

**Dateien:** `sv-levelup/lib/discovery/schreiben.ts` + Test

**Schnittstellen:**
```ts
export type Fund = { placeId: string; name: string; adresse: string | null; lat: number; lng: number }
export type Entscheidung = 'neu' | 'dublette_place_id' | 'dublette_name' | 'unbrauchbar'
export function beurteile(f: Fund, bestand: BestandsZeile[]): Entscheidung
export async function schreibeFund(db, f: Fund, laufId: string): Promise<{ ok: boolean; error?: string }>
```

**Fünf Fälle:**

1. **`place_id` schon da** → nichts tun. Der härteste Schlüssel: er ist stabil, während Namen variieren.
2. **Name + Umkreis treffen** → nichts tun, aber **`google_place_id` am Bestandsdatensatz nachtragen**, wenn dort noch keine steht. So wird die weiche Dublette beim nächsten Lauf zur harten.
3. **Neu** → einfügen mit `quelle='places_discovery'`, `entdeckt_am`, `entdeckt_lauf`, `normalized_name` kleingeschrieben, `ist_aktiv=false`.
4. **Unbrauchbar** → Name kürzer als vier Zeichen oder ohne Koordinaten. Ein Datensatz ohne Ort ist im Vertrieb wertlos und im Finder ein Geisterstift.
5. **Ein Fehlschlag beim Schreiben bricht den Lauf nicht** — er wird gezählt und am Ende genannt.

⚠ **`ist_aktiv=false`.** Die 64 Bestandsleads sind als Dead-Pins auf zwei öffentlichen Karten sichtbar (`/embed/gutachter-finder` auf **fremden** Websites). Ein Discovery-Lauf, der tausende Datensätze aktiv einfügt, füllt diese Karten schlagartig mit Büros, die nie zugestimmt haben. Sichtbarkeit ist eine eigene Entscheidung, kein Nebeneffekt der Erhebung.

- [ ] **Schritt 1–5** wie gehabt.

---

### Aufgabe 3: Der Lauf

**Dateien:** `sv-levelup/lib/discovery/lauf.ts` + Test

```ts
export async function entdecke(opts: {
  places: PlacesAdapter
  db: Db
  gebiet: Kachel
  begriffe: string[]          // „Kfz-Sachverständiger", „Kfz-Gutachter"
  maxTiefe: number
  schreiben: boolean
  laufId: string
  fortschritt?: (s: Stand) => void
}): Promise<Bericht>
```

**Der Kern:** Je Kachel und Begriff eine Text Search. Liefert sie **60 Treffer** (die Deckelung), ist die Kachel zu dicht → `vierteile()` und die vier Teile in die Warteschlange, solange `tiefe < maxTiefe`.

⚠ **60 Treffer heißen „mindestens 60", nicht „genau 60".** Wer bei 60 aufhört, ohne zu verfeinern, verliert genau die dichten Gebiete — also die Städte, in denen die meisten Büros sitzen.

⚠ **Bei erreichter Maximaltiefe wird das GEZÄHLT und im Bericht genannt.** Eine Kachel, die auch auf der letzten Stufe deckelt, ist eine bekannte Lücke. Sie stillschweigend hinzunehmen hieße, eine Vollerhebung zu behaupten, die keine ist.

⚠ **Ein Places-Fehler beendet den Lauf nicht** — die Kachel wird als Fehlstelle vermerkt und der Lauf geht weiter. Sonst entscheidet ein einzelner Ausfall über zehntausend Abrufe.

**Der Bericht** trägt: Kacheln gesamt/verfeinert/gedeckelt, Abrufe, Funde brutto, je Entscheidung eine Zahl, Fehler, Dauer.

- [ ] **Schritt 1–5** wie gehabt.

---

### Aufgabe 4: Das Kommando

**Dateien:** `sv-levelup/scripts/discovery.ts`, `package.json`

```
npm run discovery                          # Trockenlauf, Gebiet = Vorgabe
npm run discovery -- --gebiet muenster     # eine benannte Region
npm run discovery -- --schreiben           # scharf
npm run discovery -- --max-tiefe 3
```

⚠ Der Trockenlauf **ruft trotzdem ab**. Das Kommando sagt das vor dem Start und nennt die geschätzte Zahl der Abrufe.

⚠ **Ohne `--schreiben` wird nichts geschrieben** — wie bei `npm run anreicherung`. Ein Massenlauf, der von sich aus schreibt, ist ein Massenlauf, den niemand entschieden hat.

- [ ] **Schritt 1–5** wie gehabt.

---

### Aufgabe 5: Ein kleiner scharfer Lauf mit Sichtprüfung

⭐ **Die teuerste Lehre aus P2:** 140 grüne Tests und zwei vollständige Trockenläufe zeigten nichts — der erste **scharfe** Lauf auf fünf echte Leads förderte vier Fehler zutage, alle in der Form „Wert vorhanden, Wert unbrauchbar". Trockenläufe zeigen das nicht, weil dort niemand die Werte anschaut.

- [ ] **Schritt 1:** Trockenlauf über **eine** Region (Münsterland), Bericht lesen
- [ ] **Schritt 2:** Scharfer Lauf über dieselbe Region
- [ ] **Schritt 3: Jeden neuen Datensatz einzeln ansehen** — Name, Adresse, PLZ, Ort, Koordinaten. Steht die PLZ zum Ort? Ist der Name ein Büro oder ein Autohaus? Sitzen die Koordinaten im Ort?
- [ ] **Schritt 4:** Dublettenprüfung messen — wurden die 64 Bestandsleads erkannt oder doppelt angelegt?
- [ ] **Schritt 5:** Die **gemessene** Website-Quote festhalten (Spec §5.5.5 wartet darauf). Nicht hochrechnen.
- [ ] **Schritt 6:** Rückwärtsgang prüfen: `delete from sv_leads where entdeckt_lauf = '<id>'` muss den Lauf vollständig zurücknehmen.

⚠ **Der Deutschland-Lauf ist Aarons Entscheidung**, nicht Teil dieses Plans. Er legt tausende echte Vertriebsdatensätze an.

---

### Aufgabe 6: Das Nebenprodukt

**Dateien:** `sv-levelup/lib/levelup/module/wett.ts`, `messmaschine.ts`

Jeder `wett`-Lauf ruft bis zu 60 Büros im 50-km-Umkreis ab. Diese Daten sind **bereits bezahlt**. Sie in `sv_leads` zu schreiben ist ein zusätzlicher Schreibpfad, kein zusätzlicher Abruf (Spec §5.5.3).

⚠ **Hinter derselben Schranke wie der Massenlauf.** Ein Modul, das im Vorbeigehen Vertriebsdatensätze anlegt, ist ein Massenlauf ohne Entscheidung — nur langsamer. Der Schreibpfad hängt an einer ausdrücklichen Umgebungsvariablen (`LEVELUP_WETT_LEADS=1`), Vorgabe ist aus.

- [ ] **Schritt 1–5** wie gehabt.

---

### Aufgabe 7: Abschluss

- [ ] `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
- [ ] Bericht des Regionallaufs in den Commit

---

## Selbstprüfung des Plans

**Deckung:** Spec §5.5.2 (Discovery), §5.5.3 (Nebenprodukt), §5.5.5 (die Website-Quote, die der erste Lauf misst). **Nicht** enthalten: Stufen ② bis ④ des Apotheken-Musters (Impressum holen, Regex, KI-Ergänzung) — die existieren bereits als `lib/anreicherung/*` und laufen über `npm run anreicherung` gegen die neu entdeckten Leads.

**Platzhalter:** keine. Die Schritte folgen dem Muster aus P3–P6; Schnittstellen und Fallunterscheidungen sind ausgeschrieben.

**Typen:** `Kachel`, `Fund` und `Bericht` sind neu; `PlacesAdapter` und `Db` unverändert; die weiche Dublettenprüfung nutzt `istDublette` aus P4.

**Was dieser Plan bewusst NICHT tut:** den Deutschland-Lauf fahren. Er ist technisch derselbe Aufruf mit einem anderen Gebiet — aber er legt tausende echte Vertriebsdatensätze an, und das ist eine operative Entscheidung. Der Regionallauf beweist die Mechanik und misst die Zahlen, auf denen sie beruht.
