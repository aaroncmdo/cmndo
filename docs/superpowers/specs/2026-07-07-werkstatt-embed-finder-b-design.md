# B — Werkstatt-Embed-Finder (Design)

**Datum:** 2026-07-07
**Roadmap:** Bau 3 von 4 (D → A → **B** → C), siehe `2026-07-07-werkstatt-auftrag-einstiegspunkte-roadmap-design.md`.
**Branch:** `kitta/werkstatt-embed-finder` (off staging).

## 1. Kontext & Ziel

Ein Selbstzahler-/Unfall-Kunde soll auf einer **oeffentlichen Embed-Seite** eine Reparatur-Werkstatt in seiner Naehe finden und auswaehlen. Die Auswahl vermittelt die Werkstatt **db-driven und sauber** an den entstehenden Lead/Claim — unabhaengig davon, ob es am Ende ein Haftpflicht- oder ein Selbstzahler-Fall wird.

Aaron 07.07.: *"beides — je nach Strecke, aber eine Werkstatt muss sauber vermittelt werden, db driven"* + *"die Werkstatt ist in der Datenbank entweder da oder nicht — sieh es dir as-is an und dann bauen wir es sauber."*

## 2. Ist-Zustand (gegen die Prod-DB verifiziert)

Der Ist-Zustand widerlegt zwei naheliegende Annahmen und praegt das Design:

- **`werkstaetten.partner` (boolean) ist TOT:** 0 von 11 Zeilen haben `partner=true`. Es ist **kein** verlaessliches "in-DB-als-Partner"-Signal. Das saubere Signal ist **die Zeile selbst** (`status='aktiv'`).
- **`findWerkstaetten` (finder.ts) filtert NUR `status='aktiv'`** — **keine** Test-Ausgrenzung. Es liefert heute alle 11 (8 echt + 3 Test) gemischt zurueck. Fuer eine **oeffentliche** Seite ist das ein Leck.
- **8 echte Partner, alle vollstaendig** (Geo + Isochrone + `faehigkeiten`), geclustert in **NRW-West** (Ratingen x3, Heinsberg, Erkelenz, Langenfeld, Bergisch Gladbach, Schwelm). Ausserhalb dieses Clusters findet ein Kunde **nichts** → Supply-Gate ist Pflicht, kein Nice-to-have.

Die Werkstatt-Zuweisung ist bereits **auf dem Lead** (nicht erst auf dem Claim) in drei Zustaenden abbildbar — dieselben Spalten auf `claims` und `leads`:

| Zustand | Feld | Bedeutung | Bestand (claims/leads) |
|---|---|---|---|
| **In DB als Vermittler** | `werkstatt_id` (uuid FK) | hat den Kunden geworben (QR) → 150 EUR Praemie | 7 / 14 |
| **In DB als Reparateur** | `reparatur_werkstatt_id` (uuid FK) | repariert | 3 / — |
| **NICHT in DB** | `reparatur_werkstatt_extern` (text) | Kundes eigene Nicht-Partner-Werkstatt, nur Name | — |

## 3. Kern-Entscheidungen

1. **Finder-Pick = Reparateur, NICHT Vermittler** (Aaron 07.07.). Waehlt ein Kunde Werkstatt X im *unserem* Finder, hat X ihn **nicht geworben** — **wir** haben vermittelt. Also: `reparatur_werkstatt_id = X`, **quelle = `'embed'`**, **keine** 150-EUR-Vermittlungspraemie. Wuerden wir `werkstatt_id` setzen (A-Trigger-Reuse), bekaeme X faelschlich die Praemie + falsche Quelle. Bewusst verworfen.
2. **Db-driven ueber den kanonischen Patch.** Die Zuweisung laeuft ueber `buildZuweisungPatch(werkstattId, null, 'embed')` aus `vermittlung-core.ts` (dieselben 5 Felder wie jede andere Vermittlung) — **kein** neuer Assignment-Pfad. `VermittlungQuelle` kennt `'embed'` bereits.
3. **Test-Guard an der QUELLE (dem pickbaren Set), nicht an der Zuweisung.** Der oeffentliche Finder liefert **nur echte** Partner (Test-Werkstaetten email-basiert via `istInterneEmail` ausgeschlossen). Ein Test-/Smoke-Kontext liefert **nur Test**-Werkstaetten. Folge: ein echter Kunde kann eine Test-Werkstatt gar nicht erst auswaehlen, und ein Test-Claim erreicht **nie** eine echte Werkstatt — konsistent mit A (*"die Claims bis dato nicht an die echten Werkstaetten"*), aber am pickbaren Set durchgesetzt statt am Trigger. Der A-Trigger greift hier nicht (er promotet nur `werkstatt_id`, das B nicht setzt), darum ist der Quell-Guard notwendig **und** ausreichend.
4. **Supply-Gate statt Fern-Treffer.** Findet der Finder 0 Partner im sinnvollen Umkreis, wird **keine** Werkstatt gesetzt — der Lead geht ohne Werkstatt an den Dispatcher ("Wir matchen dich"). Niemals eine 300 km entfernte Werkstatt als Treffer ausgeben.

## 4. Architektur

```
Kunde (oeffentlich, iframe/direct)
      |
      v
/embed/werkstatt-finder  (Server-Page: trusted-origin + tracking + ConsentBridge)
      |  Ort/PLZ + kurze Schaden-Angabe
      v
WerkstattFinderEmbedClient  ── findWerkstaetten({ lat,lng, nurEchte:true }) ──> [echte Partner, geo-ranked]
      |                                                                          (WerkstattFinderMap wiederverwendet)
      |  Pick X  ODER  "keine passende / keiner in der Naehe"
      v
erstelleWerkstattFinderLead(action)
      |
      +-- Pick X:      Lead + reparatur_werkstatt_id=X, quelle='embed', reparaturwunsch='reparatur'
      +-- Supply-Gate: Lead ohne Werkstatt  → Dispatcher matcht
      |
      v
Flow (bestehend) verzweigt je Strecke:
      +-- Haftpflicht:   voller Flow, Werkstatt bleibt gesetzt
      +-- Selbstzahler:  Kurz-Pfad, Werkstatt bleibt gesetzt
      (convertLeadToClaim traegt reparatur_werkstatt_* auf den Claim — im Build zu verifizieren)
```

**Beide Strecken, eine Werkstatt:** Die Werkstatt wird am Lead gesetzt, *bevor* die Strecke feststeht. Der Flow entscheidet Haftpflicht vs. Selbstzahler; die `reparatur_werkstatt_id` ueberlebt beide Wege. Der A-Trigger ueberschreibt sie nicht (`reparatur_werkstatt_id IS NULL`-Guard greift, weil B sie bereits gesetzt hat).

## 5. Komponenten

| Datei | Verantwortung | Reuse / Vorlage |
|---|---|---|
| `src/lib/werkstatt/finder.ts` (modify) | `findWerkstaetten` bekommt `nurEchte?: boolean` → filtert Test-Werkstaetten via `istInterneEmail` (email intern selektiert, **nicht** zurueckgegeben). `rankWerkstaetten` (pure) unveraendert. | `istInterneEmail` aus `src/lib/testdaten/interne-identitaet.ts` |
| `src/app/embed/werkstatt-finder/page.tsx` (create) | Oeffentliche Server-Page: trusted-origin-Gate, Tracking-Params, ConsentBridge, rendert den Client. | `src/app/embed/gutachter-finder/page.tsx` |
| `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` (create) | Ort/PLZ-Eingabe → Karte + Liste → Pick + Kurz-Kontaktformular → ruft die Action. Supply-Gate-Zustand ("Wir matchen dich"). | `WerkstattFinderMap` (vorhanden) + Embed-Finder-Client-Muster |
| `src/app/embed/werkstatt-finder/actions.ts` (create) | `erstelleWerkstattFinderLead(...)`: Lead anlegen/aktualisieren, bei Pick `buildZuweisungPatch(X, null, 'embed')` + `reparaturwunsch='reparatur'`; ohne Pick Lead ohne Werkstatt. Tracking-Attribution. Result-Object-Pattern. | bestehende Embed-Lead-Erzeugung + `buildZuweisungPatch` |

Kein neuer DB-Migrationsbedarf erwartet (Felder + `quelle='embed'` + Trigger existieren). Falls im Build eine View-/Spalten-Luecke auffaellt → Regel-2-Plugin, additiv.

## 6. Test-Guard & Sicherheit

- **Oeffentliche Seite** → dieselben Embed-Schutzmechanismen wie `gutachter-finder` (trusted-origin, kein Auth-Leak, nur Vorname/Ort/Specs der Werkstatt sichtbar — kein Kontakt-Dump; Anti-Skimming wie bei der Finder-Karte).
- **Test-Trennung am Quell-Set** (siehe Entscheidung 3) — verifiziert im Build mit einem gezielten Test: `findWerkstaetten({nurEchte:true})` enthaelt **keine** der 3 Test-Werkstaetten; ein Test-Modus enthaelt **nur** diese.
- **Prod-Smoke** auf frischem SW-freiem Browser (Broadcast) mit dem SMOKE-Werkstatt-/Test-Kunde-Konto — der Pick darf ausschliesslich Test-Werkstaetten treffen.

## 7. Im Build zu nageln ("Detail im Build", Aaron)

1. **`convertLeadToClaim`-Feld-Mapping:** traegt es `reparatur_werkstatt_id`/`_quelle`/`_zugewiesen_*`/`reparatur_vermittlung_status` vom Lead auf den Claim? Wenn nein → ergaenzen (additiv, wie der KB-Skip-Pfad in A).
2. **Exakter Lead-Erzeugungs-Reuse:** welche bestehende Embed-Lead-Action ist die DRY-Vorlage (Tracking, Consent, Dedup) — nicht neu bauen.
3. **Supply-Gate-Copy + Umkreis-Schwelle:** ab welcher Distanz gilt "keiner in der Naehe"? (Isochrone der Partner nutzen vs. simpler km-Radius.)
4. **`nurEchte`-Default:** oeffentliche Caller `true`; Dispatcher/Admin-Caller (bestehend) behalten das ungefilterte Verhalten (Default `false`, damit A/C nicht brechen).

## 8. Out of Scope (Follow-ups)

- **Nicht-Partner-Werkstatt erfassen** (`reparatur_werkstatt_extern` als Freitext im Finder) — eigener kleiner Nachzug, nicht Teil von B.
- **C — Dispatcher-Auto-Matching** (`findReparaturWerkstaettenForTarget`) — separate Lane, kollidiert mit dem Dispatch-Rebuild.
- **Provisions-/Praemien-Logik** — B erzeugt bewusst keine (Reparateur, nicht Vermittler).
