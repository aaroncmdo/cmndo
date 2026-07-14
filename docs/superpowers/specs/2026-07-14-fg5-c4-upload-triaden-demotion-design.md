# FG5 Cluster 4 — Upload-Präsenz-Triaden: Design & Entscheidung

**Datum:** 2026-07-14
**Session:** f48be874 (brainstorming-first mit Aaron)
**Herkunft:** FG5 „Derivable-Duplicate Demotions", Cluster 4. C1/C3/C5/C5d gemergt, C2 = NO-OP, C4 war „deferred".
**Status:** Entschieden — **won't-demote** (die Demotion wird nicht gebaut) + ein realer Bug wird gefixt.

## Kontext

FG5 klassifiziert sechs Spalten auf `public.leads` als abgeleitete Duplikate von `fall_dokumente`:

```
polizeibericht_status  · polizeibericht_url  · polizeibericht_hochgeladen_am
zeugenaussage_status   · zeugenaussage_url   · zeugenaussage_hochgeladen_am
```

Nicht betroffen (distinkte Konzepte, kein Duplikat): `*_pflicht` (Anforderungs-Flag), `*_token`
(Upload-Magic-Link), `*_gesendet_am` (wann die Anforderung rausging).

Die Aufgabe lautete: diese sechs Spalten demoten (physisch entfernen, Werte aus `fall_dokumente`
ableiten). C4 war als einziges FG5-Item bewusst deferred, weil es „keine mechanische Demotion" sei.

## Befund: die „abgeleitetes-Duplikat"-Prämisse trägt nicht

Drei unabhängige Befunde aus der Exploration widerlegen die Klassifikation:

### 1. Der Lead ist die Ingest-Quelle, nicht das Duplikat

Flow-Upload (`flow/[token]/*`) und Twilio-Inbound (`inbound/process-inbound-media.ts`) schreiben
`*_status/_url/_hochgeladen_am` auf den **Lead** — zu einem Zeitpunkt, an dem noch **kein Fall und
damit keine `fall_dokumente`-Row** existiert. Und `src/lib/dokumente/sync-lead-zu-pflicht.ts`
propagiert **vom Lead zu den `pflichtdokumente`-Slots** (`polizeibericht_url` → Slots
`polizeibericht` + `polizeiliche_unfallmitteilung`), nicht umgekehrt. Die Kausalität ist also
Lead → Dokument. Am Schreibzeitpunkt gibt es nichts, woraus man ableiten könnte; ein „View leitet
aus `fall_dokumente` ab" bräche die gesamte Lead-Phase.

### 2. `_status` ist ein Anforderungs-Lebenszyklus, keine Präsenz-Flag

Der CHECK-Constraint auf `leads.polizeibericht_status` erlaubt:

```
gesendet · geoeffnet · hochgeladen · fehlgeschlagen · abgelehnt   (oder NULL)
```

Das ist ein Upload-Request-Lebenszyklus (Link gesendet → Kunde hat geöffnet → hochgeladen / bzw.
fehlgeschlagen / abgelehnt), konzeptuell dieselbe Familie wie `polizeibericht_gesendet_am` (das
der Handoff selbst als „nicht anfassen" markiert). `fall_dokumente` kann davon **nur einen** Zustand
bestätigen: `hochgeladen` (eine Row existiert). Die anderen vier sind nicht ableitbar — es gibt
keine Row, solange nur gesendet/geöffnet/fehlgeschlagen wurde.

### 3. `_status` ist schreibbar + sichtbar; `_url`/`_hochgeladen_am` sind post-claim ungelesen

* `polizeibericht_status` steht in der **Admin-Override-Edit-Allowlist** von
  `faelle/[id]/_actions/stammdaten.ts` (Kommentar: „Admin-Override … falls falsch geflaggt") — ein
  Admin kann den Wert manuell setzen. Es ist ein **schreibbares** Feld, kein Read-Only-Derivat.
* Es wird in fünf Post-Claim-Views angezeigt (SV-Fallakte via `get-claim-for-role`, Kunde-Onboarding,
  AI-Panel, Admin-Debug, Gutachten-Stellungnahme).
* `_url` und `_hochgeladen_am` werden **post-claim von keinem Reader gelesen** (die zwei
  Post-Claim-Reader lesen nur `status`; BKat liest die Polizeibericht-Bilder ohnehin aus
  `fall_dokumente`, nicht aus der Lead-Spalte).

Eine `COALESCE(fall_dokumente-'hochgeladen', Lead-status)`-Bridge bräche entweder den Admin-Override
(sobald eine Datei existiert, überschreibt `hochgeladen` ein manuelles `abgelehnt`) oder wäre
wirkungslos (Lead-Priorität → Bridge liefert nie etwas Neues). Es gibt keine Semantik, die beides
erfüllt.

## Verworfene Optionen

| Option | Warum verworfen |
|---|---|
| **A — Lead→`fall_dokumente`-Bridge** | `status` nicht ableitbar (Anforderungs-Lebenszyklus + Admin-Override); `url`/`hochgeladen_am` haben post-claim keinen Reader → die Bridge wäre toter Code oder bräche den Override. |
| **B — nur `zeugenaussage_*` demoten** | Dasselbe Lead-Stage-First-Problem; `zeugenaussage_*` ist zwar weniger load-bearing (nicht in `sync-lead-zu-pflicht`, nicht in BKat), aber ebenso Ingest-Quelle, kein Duplikat. |
| **„voll durchziehen"** | Baut entweder gebrochene Funktionalität (`status`-Override) oder toten Code (`url`/`hochgeladen_am`-Bridge ohne Consumer). |

## Entscheidung

### Teil 1 — won't-demote (kein Code)

Die sechs Spalten werden **nicht** demotet. Sie sind ein schreibbarer Anforderungs-Workflow plus
eine Lead-Stage-Ingest-Quelle, keine abgeleiteten `fall_dokumente`-Duplikate. FG5-C4 wird damit
formal von „deferred" auf **„won't-demote"** geschlossen. FG5 ist programm-seitig fertig
(C1/C3/C5/C5d gemergt, C2 NO-OP, C4 won't-demote).

### Teil 2 — den einen realen Bug fixen (Code, minimal)

`src/app/dispatch/leads/[id]/_actions/bkat-inference.ts` liest die Polizeibericht-URLs aus
`fall_dokumente.select('dokument_url')`. Die Spalte **`dokument_url` existiert nicht** (sie heißt
`storage_path`) → die Query schlägt still fehl (im `try/catch`, „non-critical") → `polizeibericht_urls`
bleibt leer → `inferBkat` überspringt die Vision-OCR-Analyse (Aktenzeichen/TBNR aus den
Polizeibericht-Bildern) und fällt auf den reinen Text-Fallback zurück. Das BKat-Feature ist damit
seit dem Spaltennamen-Drift halb kaputt.

**Fix:** die bereits vorhandene `leads.polizeibericht_url` nutzen. Sie wird beim Upload und beim
Twilio-Inbound als **public-URL** (`getPublicUrl`) gespeichert → direkt fetchbar, **kein Signieren
nötig**. Der Lead wird in `bkat-inference.ts` ohnehin schon geladen; die SELECT-Liste wird um
`polizeibericht_url` erweitert und `polizeibericht_urls` daraus gebildet. Der tote
`fall_dokumente`-Block entfällt. Konsistent mit der won't-demote-Entscheidung: der Lead ist die
Quelle.

Der alte (tote) Pfad selektierte potenziell mehrere `fall_dokumente`-Rows; die Lead-Spalte hält
eine primäre URL → `polizeibericht_urls` ist `[url]` oder `[]`. Das ist bewusst: BKat braucht für
Aktenzeichen-/TBNR-Erkennung den Polizeibericht, nicht jede Einzelseite; eine URL genügt und ist
strikt besser als der Ist-Zustand (immer `[]`). Falls später mehrere Bilder nötig werden, ist das
ein eigenes Ticket (Lead-Upload speichert dann mehrere URLs) — nicht Teil dieses Fixes.

## Scope, Nicht-Ziele, Koordination

* **Berührt genau eine Code-Datei:** `bkat-inference.ts` (dispatch-lead-stage). **Keine**
  aar-956-Flow-Files, kein Column-Drop, kein AAR-599-Reader-first-Risiko.
* **Nicht angetastet:** alle Lead-Stage-Writer (flow/twilio/upload = aar-956/Ingest) und
  Lead-Stage-Reader (dispatch-UI). Die sechs Spalten bleiben physisch.
* **Überschneidung:** der BKat-Fix ist auch ein Fund aus dem 63-Query-Sweep
  (`coordination-prod-query-parse-sweep-63-broken`) — dort wird vermerkt, dass er hier erledigt wird,
  damit die Release/Platform-Lane ihn nicht doppelt angeht.

## Testing

* **Unit:** eine pure Hilfsfunktion, die aus einem Lead-Objekt die `polizeibericht_urls` bildet
  (URL vorhanden → `[url]`, sonst `[]`), unit-getestet.
* **tsc + vitest** grün; die vier Token-/Status-Ratchets 0-neu.
* **Regel-4-Prod-Smoke:** BKat-Inferenz über einen Dispatch-Lead mit einem Polizeibericht anstoßen
  und verifizieren, dass `polizeibericht_urls` befüllt ankommt (Vision-Pfad statt Text-Fallback).
  Test-Login self-bootstrap per `reference-prod-playwright-smoke-seed-auth-user` (Go-Live-Cleanup hat
  die Test-Konten entfernt). Da BKat-Inferenz keine externen Comms auslöst, ist der Smoke
  nebenwirkungsfrei.

## Referenzen

* Handoff: `handoff-fg5-c4-upload-triaden-demotion` (Memory)
* Reader-first-Blaupause (C5/C5d): `coordination-fg5-cluster1-pr4173`
* Sweep-Kontext des BKat-Bugs: `coordination-prod-query-parse-sweep-63-broken`
