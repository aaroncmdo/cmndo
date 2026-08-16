# Hyperlokal P3 — Linknetz der Stadtseiten + kleinere Städte

**Stand:** 16.08.2026 · **Vorgänger:** P1 (#5198), P2 (#5204), Spec `2026-08-12-hyperlokal-geo-content-design.md`
**Auftrag Aaron (16.08.):** kleinere Städte als Marketing-Seiten — **und** die Verlinkung auf den Marketing-Seiten so bauen, dass aus den Städten ein **Linknetz** entsteht.

---

## 0 · Warum diese Spec mit einer Korrektur beginnt

Der Koordinations-Marker `COORDINATION-hyperlokal-geo-content-programm.md` behauptet, P1 habe den Nachbarstädte-Fehler behoben:

> „Fix: neue pure Lib `lib/kfz-gutachter/nachbarstaedte.ts` (`naechsteStaedte(slug, limit)`, Haversine, Tie-Break über Slug), **10 Unit-Tests**."

**Das ist nicht auf prod, und es existiert auch nicht im Repo.** Am 16.08. gegen `origin/main` geprüft:

```
git ls-tree -r --name-only origin/main | grep -i nachbar     -> 0 Treffer
git grep -l "naechsteStaedte" origin/main                    -> 0 Treffer
git show --name-status <merge #5198>                         -> nur page.tsx, 6× messages.json, staedte.ts
```

Der Code auf `main` ist unverändert die kaputte Fassung:

```ts
// claimondo-marketing/app/[locale]/kfz-gutachter/[stadt]/page.tsx, Z. 169-175 (origin/main)
const nachbarn = STAEDTE
  .filter((x) => x.slug !== s.slug && x.bundesland === s.bundesland)
  .slice(0, 6)                        // <- die ersten SECHS ARRAY-Eintraege, nicht die naechsten
const fallback = nachbarn.length < 6
  ? STAEDTE.filter((x) => x.slug !== s.slug && !nachbarn.some(n => n.slug === x.slug)).slice(0, 6 - nachbarn.length)
  : []
const crossCity = [...nachbarn, ...fallback]   // gerendert in Z. 665 als /kfz-gutachter/<slug>-Links
```

Und live nachgemessen (16.08., `curl` auf prod):

| Stadtseite | verlinkte „Nachbarn" |
|---|---|
| **berlin** | aachen · bonn · dortmund · duesseldorf · essen · koeln |
| **hamburg** | aachen · bonn · dortmund · duesseldorf · essen · koeln |
| muenchen | augsburg · fuerth · ingolstadt · nuernberg · regensburg · wuerzburg |
| koeln | aachen · bonn · dortmund · duesseldorf · duisburg · essen |

Berlin und Hamburg verweisen auf NRW-Städte in 400–500 km Entfernung. München und Köln stimmen **zufällig**, weil Bayern bzw. NRW genug Einträge vor dem `slice` haben.

⚠ **Konsequenz für die neue Session:** Nichts aus dem Marker ungeprüft übernehmen. Jede Behauptung „ist schon gefixt" gegen `origin/main` verifizieren, nicht gegen die Erinnerung. Dieser Fehler hat vier Tage überlebt, weil niemand nachgesehen hat.

---

## 1 · Ist-Zustand, gemessen (16.08.2026)

### 1.1 Städte und Tiefe

```
Stadtseiten auf prod:      92        (origin/main == origin/staging, byte-identisch)
davon mit Ortstiefe:       23        7 Hubs (HYPERLOCAL_DATA) + 16 Spokes (spokeLocal)
ohne jedes Ortsfaktum:     69
Sitemap-Eintraege Stadt:  101
```

**Jede** Stadt trägt bereits (Typ `Stadt` in `claimondo-marketing/lib/kfz-gutachter/staedte.ts`):
`slug · name · bundesland · plzPrefix · bevoelkerung · **lat** · **lng** · lokal.{landgericht, amtsgericht, kammer} · bvskHonorarSpanne · h1Anker`

→ **Die Koordinaten liegen für alle 92 Städte vor.** Eine geografisch korrekte Nachbarberechnung braucht keine neue Datenquelle, nur die vorhandene zu benutzen.

### 1.2 Das Linknetz heute

**Eingehend auf Stadtseiten:**

| Quelle | Stadt-Links |
|---|---|
| `/kfz-gutachter` (Übersicht) | **100** |
| `/` (Startseite) | 16 |
| `/ratgeber` | 13 |
| `/gutachter-finden` | **0** |

**Ausgehend von einer Stadtseite:** ~6 „Nachbarn" (s. o. teils falsch) + 3 Ratgeber-Links (`ablauf`, `kosten`, `wertminderung` — auf **jeder** Seite dieselben) + 1 Link zurück auf `/kfz-gutachter`.

**Was fehlt:**

* **Hub → Spoke:** 16 Spoke-Städte existieren als Daten (`spokeLocal`), die Hub-Seite verlinkt sie **nicht**. Köln verlinkt Aachen und Dortmund, aber nicht Solingen, Leverkusen oder Hilden.
* **Spoke → Hub:** ebenso wenig in eine Richtung verankert.
* **`angrenzendeOrte`** (auf Hubs gepflegt) ist reiner Fließtext, kein Link.
* **Reziprozität:** ergibt sich heute nur zufällig aus der Array-Reihenfolge.
* **Thematische Kanten:** Stadt ↔ Ratgeber ist pauschal, nicht themenbezogen.

### 1.3 Weitere gemessene Altlast

* **Die NRW-Karte steht auf jeder Stadtseite** — auch auf Berlin, Hamburg, München (`/marketing-landing-koeln/nrw-karte.png`, Alt-Text „Schwerpunkt Nordrhein-Westfalen"). Im P1-Audit als Beobachtung notiert, nie behoben.
* **`/kfz-gutachter/bocholt` = HTTP 404** — im P1-Audit als Lücke benannt, nicht geschlossen.

### 1.4 P2-Pipeline: was existiert, was fehlt

| Baustein | Pfad | Stand |
|---|---|---|
| Substanz-Gate (Quellenzwang) | `src/lib/lokalinhalt/gate.ts` (185 Z.) + `gate.test.ts` | ✅ |
| Generator (Claude Tool-Use) | `src/lib/lokalinhalt/generate.ts` (179 Z.) | ✅ |
| Stadt-Stammdaten-Snapshot | `src/lib/lokalinhalt/staedte-stammdaten.json` (92 Städte, 6 Nachbarn vorberechnet) | ✅ |
| Snapshot-Builder | `scripts/build-stadt-stammdaten.mjs` | ✅ |
| Admin-Actions | `src/app/admin/marketing/lokal-content/actions.ts` (207 Z.) | ✅ |
| Admin-Seite | `src/app/admin/marketing/lokal-content/page.tsx` (146 Z.) | ✅ |
| Tabelle | `stadt_lokalinhalte` (Migration `20260812100446`, getrackt) | ✅ |
| **Marketing-Read** | `claimondo-marketing/lib/kfz-gutachter/lokalinhalt.ts` | ❌ **FEHLT** |

```
select count(*) from public.stadt_lokalinhalte;   ->  0   (16.08.)
```

**Der Befund in einem Satz:** Es ist alles gebaut, um Inhalte zu erzeugen und freizugeben — aber **nichts**, um sie anzuzeigen. Ohne den Marketing-Read bliebe die Tabelle auch mit 500 Zeilen unsichtbar.

⚠ Das ist exakt dasselbe Muster wie bei `wissen_artikel`: 60 Zeilen, 55 „veröffentlicht", **0 Consumer im gesamten Repo**. `status='veroeffentlicht'` beweist nichts — erst der Consumer beweist, dass etwas online ist. Siehe `AUDIT-automatische-beitraege-nicht-online.md`.

---

## 2 · Teil A — Linknetz (zuerst, weil es ohne neue Inhalte wirkt)

Diese Pakete verbessern **die 92 bestehenden Seiten sofort** und brauchen keine KI-Generierung. Sie sind deshalb vorne einsortiert.

### A1 · Geografisch korrekte Nachbarn — ersetzt `slice(0,6)`

Neue reine Lib `claimondo-marketing/lib/kfz-gutachter/nachbarstaedte.ts`:

```ts
export function naechsteStaedte(slug: string, limit = 6): Stadt[]
```

* Haversine über die vorhandenen `lat`/`lng`.
* Deterministischer Tie-Break über `slug` (sonst wackeln Snapshots und Sitemaps).
* **Kein** Bundesland-Filter als Primärkriterium — Distanz entscheidet; das Bundesland darf höchstens Tie-Break sein.
* Unit-Tests (Vitest) mit mindestens: Berlin bekommt **keine** NRW-Stadt · Köln bekommt Bonn/Düsseldorf/Leverkusen · Selbstausschluss · stabile Reihenfolge bei gleicher Distanz · `limit` wird eingehalten.

**Akzeptanz:** Die Tabelle aus §0 neu gemessen zeigt für Berlin und Hamburg ausschließlich Städte < 150 km.

⚠ `src/lib/lokalinhalt/staedte-stammdaten.json` enthält bereits **vorberechnete 6 Nachbarn** je Stadt. Prüfen, ob diese nach derselben (dann ebenfalls kaputten?) Regel entstanden sind — falls ja, `scripts/build-stadt-stammdaten.mjs` mitziehen und den Snapshot neu erzeugen. **Beide Wege müssen dieselbe Funktion benutzen**, sonst laufen Marketing-Anzeige und KI-Kontext auseinander.

### A2 · Hub ↔ Spoke verankern

* Hub-Seite: eigener Block „Auch im Umland" mit Links auf die zugehörigen Spokes (Datenbasis: `spokeLocal` bzw. `hyperlocal.angrenzendeOrte`, soweit die Orte eigene Seiten haben).
* Spoke-Seite: sichtbarer Rückverweis auf den Hub („Ihr Gutachter kommt aus **Köln** — 18 km").
* `angrenzendeOrte` von Fließtext auf Link umstellen, **wo eine Seite existiert**; sonst weiterhin Text (keine 404-Links erzeugen).

### A3 · Reziprozität und Netz-Metrik

Ein Skript `scripts/check-stadt-linknetz.mjs`, das den Graph aus den Daten aufbaut und meldet:

* Städte ohne eingehenden Link (Waisen)
* einseitige Kanten A→B ohne B→A
* Städte mit < N eingehenden Links
* tote Links (Ziel-Slug ohne Seite — fängt Fälle wie `bocholt` ab)

Als `--check` CI-tauglich. **Das ist die Messgrundlage für „Linknetz" — ohne sie ist der Auftrag nicht abnehmbar.**

### A4 · Thematische Kanten statt drei fixer Ratgeber-Links

Heute steht auf jeder Stadtseite dieselbe Dreier-Auswahl. Sinnvoller: Stadt → Ratgeber-Artikel, der zur Stadt passt (Gerichtsstand/Amtsgericht → passender Rechts-Artikel; Honorar-Spanne → Kosten-Artikel), und **umgekehrt** Ratgeber → Städte, für die der Artikel besonders einschlägig ist.

⚠ Vor dem Bauen prüfen, woher die Ratgeber-Inhalte kommen: **90 statische Markdown-Dateien** unter `claimondo-marketing/content/claimondo/**` (letzte Änderung 15.06., letzter Commit 01.06.). **Nicht** aus `wissen_artikel`.

### A5 · Karte und Bildsprache je Region

Die NRW-Karte gehört nicht auf Berlin. Entweder pro Bundesland/Region ein passendes Asset, oder auf Nicht-NRW-Seiten weglassen. Kein Platzhalter, der etwas Falsches behauptet.

### A6 · `/gutachter-finden` ins Netz hängen

Null Stadt-Links auf der Finder-Seite ist eine verschenkte Kante — dort sucht jemand genau nach einem Gutachter an einem Ort.

---

## 3 · Teil B — kleinere Städte

### B1 · Zuerst das offene Ende schließen: Marketing-Read

`claimondo-marketing/lib/kfz-gutachter/lokalinhalt.ts` + Einbau in `[stadt]/page.tsx`:

* liest **nur** `status='veroeffentlicht'` (partieller Unique-Index sichert „genau eine veröffentlichte Fassung je Stadt")
* mischt die Inhalte in die bestehenden Sektionen, statt einen fremd wirkenden Block anzuhängen
* fällt sauber auf den heutigen Zustand zurück, wenn keine Zeile existiert (92 Seiten dürfen nicht brechen)
* Quellenangaben werden **mitgerendert** — der Quellenzwang aus dem Gate ist sonst wertlos

**Ohne B1 ist jede weitere Generierung sinnlos.** Erst dieser Read macht aus einer Datenbankzeile eine Seite.

### B2 · Substanz vor Fläche — welche kleineren Städte überhaupt?

Das Gate steht (`gate.ts`): **≥ 3 harte, extern verifizierbare Fakten**, Unfallschwerpunkte **nur mit belegbarer Quell-URL**.

Was eine kleinere Stadt schon „geschenkt" mitbringt, wenn sie in `staedte.ts` aufgenommen wird: Amtsgericht, Landgericht, Anwaltskammer, PLZ-Bereich, Einwohnerzahl, BVSK-Honorarspanne, Koordinaten. Das sind belegbare Fakten — aber sie sind **generisch pflegbar**, nicht ortsspezifisch im Sinne des Gates.

→ Die Session muss **definieren und dokumentieren**, welche Fakten als „hart" zählen, und die Kandidatenliste danach filtern. Vorschlag als Ausgangspunkt (zu prüfen, nicht zu übernehmen):

1. **Zulassungsstelle / Kfz-Zulassungsbehörde** des Kreises (Adresse, Zuständigkeit) — amtlich, verlinkbar
2. **Amtsgericht** mit Zuständigkeit bis 5.000 € Streitwert (§ 23 Nr. 1 GVG) — bereits im Datensatz
3. **Unfallschwerpunkte** aus dem Unfallatlas / Landespolizei — **nur mit URL**
4. **Hauptverkehrsachsen** (A/B-Straßen durch den Ort) — aus offenen Geodaten belegbar

⚠ **Nicht** erfinden: keine geschätzten Partnerzahlen. Das Feld `partnerSVs` wurde am 12.08. genau deshalb entfernt — es summierte sich auf 473 behauptete Partner bei 15 realen SVs.

⚠ **Realitäts-Check zur Abdeckung:** Gegen die echten `isochrone_polygon` gemessen (12.08.) hatten Abdeckung: Köln 3 · Leverkusen/Mönchengladbach/Wuppertal je 2 · Duisburg/Krefeld je 1 · **alles andere 0**. Ein naiver Radius über `paket_umkreis_km` überschätzt massiv. Wer „wir sind in X vor Ort" schreibt, muss das an Polygonen prüfen (Muster: `app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts` + `_lib.ts`, `pointInRing`).

### B3 · Erzeugen, prüfen, freigeben

* Generierung über die bestehenden Admin-Actions (`generiereEntwurf` → Gate → `in_review`).
* **Kein Auto-Publish.** Redaktionelle Freigabe ist Pflicht (UWG-Risiko bei generierten Zahlen — dieselbe Regel wie „nie erfundene Bewertungen").
* `verworfen[]` aus dem Gate sichtbar machen: Was rausgeflogen ist, ist die interessantere Hälfte.

### B4 · Erst Pilot, dann Fläche

**Drei** kleinere Städte vollständig durchziehen (Generierung → Gate → Freigabe → live sichtbar → im Linknetz verankert), Ergebnis vorlegen, **dann** erst skalieren. Eine Stadt, die durch alle Stufen läuft, sagt mehr als dreißig Entwürfe.

`bocholt` bietet sich als erste an: bereits als Lücke bekannt (404), Größenordnung passt, und der Fall ist damit gleich mit erledigt.

---

## 4 · Reihenfolge

| Paket | Inhalt | warum in dieser Position |
|---|---|---|
| **P3-A1** | Nachbarn geografisch korrekt + Tests | wirkt auf alle 92 Seiten, kein neuer Inhalt nötig, behebt einen live sichtbaren Fehler |
| **P3-A3** | Linknetz-Prüfskript | ohne Messung ist „Linknetz" nicht abnehmbar — kommt vor dem Ausbau |
| **P3-A2** | Hub ↔ Spoke, `angrenzendeOrte` verlinken | größter Netz-Zugewinn aus vorhandenen Daten |
| **P3-B1** | Marketing-Read | schließt das offene Ende; ohne ihn ist Teil B wirkungslos |
| **P3-A4/A5/A6** | thematische Kanten, Karte, Finder | Feinschliff, unabhängig testbar |
| **P3-B2/B3/B4** | kleinere Städte, Pilot mit 3 | zuletzt, weil es auf allem darüber aufsetzt |

Jedes Paket ein eigener PR gegen `staging`. Kein Sammel-PR — die Drain-Session muss sie einzeln bewerten können.

---

## 5 · Regeln und Fallen für diese Lane

**Hart (AGENTS.md):**
1. Nie auf `main` pushen. Feature-Branch → PR gegen `staging`.
2. DDL nur über `mcp__plugin_supabase_supabase__apply_migration`; `execute_sql` ist **READ-only**. Nach `apply_migration` die getrackte Version aus `list_migrations` ablesen und das committete File **exakt so** benennen (sonst Twin-Drift).
3. Kein unbegleiteter Stash am Session-Ende.
4. Umlaute in allen nutzersichtbaren Texten.
5. 7-Punkte-Audit im Commit-Body.

**Fallen, die diese Lane konkret treffen:**

* ⚠ **CI baut `claimondo-marketing/` NICHT.** `ci.yml` kompiliert nur `src/`. Ein grüner PR-Build sagt für Marketing-Änderungen wenig — der erste echte `tsc`-Lauf ist die Deploy-Lane **nach** dem Merge. Vor dem Merge lokal `cd claimondo-marketing && npm run build`.
* ⚠ **Der Haupt-Checkout hängt auf einem alten Branch.** Alles gegen `origin/main` / `origin/staging` lesen (`git show origin/main:<pfad>`), nicht gegen den Arbeitsbaum. Eigener Worktree ist Pflicht — auf `kitta/aar-956-…` arbeiten mehrere Sessions.
* ⚠ **prod-Supabase-Ref = `paizkjajbuxxksdoycev`.** Nicht die Preview-Instanz.
* ⚠ **Rote Builds ohne Code-Ursache:** `next/font/google` lädt Schriften zur Build-Zeit von `fonts.gstatic.com` und liefert zeitweise 404. Signatur „Received response with status 404 when requesting https://fonts.gstatic.com/…". Sofortmaßnahme `gh run rerun <id> --failed`, nicht am Code suchen.
* ⚠ **Ahrefs ist als Messinstrument tot** — der Tarif weist jeden Abruf ab, auch die als *free* deklarierten Endpunkte. Nicht erneut probieren, ist geklärt. Messung läuft manuell.

---

## 6 · Regel-4-Soll (woran das Ergebnis gemessen wird)

Nicht „gebaut", sondern **am lebenden System nachgewiesen**:

1. **Nachbarn:** `curl` auf `/kfz-gutachter/berlin` und `/kfz-gutachter/hamburg` — keine NRW-Stadt mehr in den Nachbar-Links, alle Ziele < 150 km. **Gegenprobe:** Köln behält Bonn/Düsseldorf/Leverkusen.
2. **Hub↔Spoke:** Köln verlinkt Solingen/Leverkusen/Hilden, und diese verlinken zurück auf Köln.
3. **Netz:** `scripts/check-stadt-linknetz.mjs` meldet 0 Waisen, 0 tote Links; Kennzahl „Ø eingehende Links je Stadt" vorher/nachher dokumentiert.
4. **Marketing-Read:** eine freigegebene Zeile in `stadt_lokalinhalte` ist auf der zugehörigen Stadtseite **im HTML sichtbar**, samt Quellenangabe. **Gegenprobe:** Zeile auf `entwurf` zurücksetzen → Inhalt verschwindet, Seite bleibt 200.
5. **Pilot:** drei kleinere Städte live, jede mit ≥ 3 belegten Fakten und je Faktum einer abrufbaren Quell-URL.
6. **Keine Regression:** alle 92 bestehenden Seiten weiterhin HTTP 200, Sitemap-Zahl erklärbar verändert.

⚠ **Beweis-Disziplin:** Statusfelder beweisen nichts. Erst der Consumer beweist, dass etwas online ist — die Prüfreihenfolge ist *wer liest die Tabelle?* → *welche Route rendert das?* → *antwortet die Route mit dem Inhalt?*

---

## 7 · Was diese Spec bewusst offen lässt

* **Zielgröße der Fläche.** Empfehlung bleibt eine **Regel** statt einer Zahl: „jeder Ort mit 3 harten Fakten bekommt eine Seite". Wer 200 Städte als Ziel setzt, erzwingt Erfindungen.
* **Redaktionelle Freigabe:** wer gibt frei? Ungeklärt seit P2.
* **Externe Datenquellen** (Gerichtsstand, Unfallschwerpunkte) einmalig einpflegen oder automatisiert holen? Für den Pilot reicht einmalig.
