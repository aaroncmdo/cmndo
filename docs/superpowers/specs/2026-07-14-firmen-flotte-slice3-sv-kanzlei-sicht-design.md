# Firmen-Flotte Slice 3 — SV-Sicht + Kanzlei-Detail-View (Design)

**Datum:** 2026-07-14
**Branch:** `kitta/firmen-flotte-slice3` (off origin/staging)
**Status:** Design — bereit für Review
**Vorgänger:** Slice 2c (SMS-Verify + VS-Meldung, PR #4247). Baut auf den Gegner-Flow-Daten auf, die Slice 2a/2b/2c erzeugen.

---

## 1 · Kontext & Ziel

Der Firmen-Flotte-Gegner-Flow erzeugt bei einem Haftpflicht-Unfall einen Claim mit **Gegner-Daten** (Verursacher-Partei: Name, Kennzeichen, Haftpflicht + Police), **Gegner-Fotos** (`fall_dokumente` mit `sichtbar_fuer ⊇ sachverstaendiger, kanzlei`), **Unfall-Hergang** und — seit Slice 2c — **VS-Korrespondenz** (`vs_korrespondenz`, die Unfallmeldung an die Gegner-Haftpflicht). Zwei nachgelagerte Rollen müssen diese Daten sehen können:

- **Sachverständiger (SV):** begutachtet den Schaden, braucht Gegner + Unfall + Fotos.
- **Kanzlei:** macht die Ansprüche gegen die Gegner-Haftpflicht geltend (§ 249 BGB), braucht die volle Gegner-Sicht.

**Ziel:** Beide Rollen sehen die Gegner-/Unfall-Daten inkl. Fotos. Für die Kanzlei entsteht dazu eine **neue read-only Fall-Detailseite** (die heute komplett fehlt).

**Leitprinzip — Reuse, kein Neubau:** Der SV hat die Anzeige-Bausteine bereits; die Kanzlei-Detailseite komponiert bestehende Loader + Components. **Kein DDL.** (Die saubere Spalte `hergang_gegner_text` ist bewusst NICHT Teil dieses Slices — siehe §2.)

---

## 2 · Nicht-Ziele / Scope-Grenzen

- **Kein `hergang_gegner_text`.** Die Spalte existiert nicht auf `claims` und ist doppelt blockiert: (a) claims-DDL ist an die a6c863e2-Lane gegated (Aaron-Lock „warten"), (b) sie sauber zu *befüllen* bräuchte eine Änderung an `convert-lead-to-claim` — das ist aar-956-Territorium (nur importieren, nie editieren). Der Gegner-Hergang ist heute über `hergang_kunde_text` sichtbar (dort landet er via `convert-lead-to-claim`), und `v_claim_sv` trägt diese Spalte bereits. Für den SV/die Kanzlei geht damit keine Information verloren; nur das saubere Label fehlt (akzeptiert, späterer Slice).
- **Kein DDL.** Alle Tabellen/Spalten/Views existieren. `apply_migration` wird nicht gebraucht.
- **Kein Kasko** (separater Slice).
- **Keine neuen Foto-Uploads.** Slice 2c erzeugt die Gegner-Fotos bereits; Slice 3 ist rein die Read-/Anzeige-Seite.
- **Kein Edit im Kanzlei-Portal.** Die Kanzlei-Detailseite ist strikt read-only (wie das restliche Kanzlei-Portal).
- **`aar-956`-Territorium** (`convert-lead-to-claim`, `src/lib/leads/*`, `flow/[token]`) wird NICHT berührt.

---

## 3 · Bestand (verifiziert 14.07. — Code + prod-DB)

- **`v_claim_sv`** (60 Spalten) trägt bereits: `gegner_versicherung_id/-nummer`, `gegner_aktenzeichen`, `gegnerisches_vehicle_id`, `gegner_bekannt`, `hergang_kunde_text`, `hergang_sv_text`, `unfall_konstellation`, `unfallskizze_*`. **Wird im App-Code aber nicht gequeried** — das SV-Portal lädt über `v_faelle_mit_aktuellem_termin` + `parteien` + `fall_dokumente` (nicht über `v_claim_sv`).
- **SV-Fall-Detailseite:** `src/app/gutachter/fall/[id]/page.tsx` → `FallDetailClient` → `StammdatenAccordion` (`src/components/fall/StammdatenAccordion.tsx`) mit festen Tabs (Historie, **Unfall**, Schaden, Kunde, **Gegner**) → `StammdatenDetail` (`src/components/fall/StammdatenDetail.tsx`) rendert `GegnerDetail` (`:292`, aus Partei `rolle='verursacher'`) + `UnfallDetail` (`:320`). **Rein textbasiert, keine Fotos.**
- **Dokument-Sichtbarkeit funktioniert bereits** (KEIN Bug): `getSichtbarFuerRolle` (`src/lib/dokumente/sichtbarkeit.ts:120`) prüft **zuerst** das DB-Array `d.sichtbar_fuer` (`:125-127`) und fällt nur ohne dieses auf die `DOKUMENT_SICHTBAR_FUER`-Map zurück. Slice-2c-Gegner-Fotos setzen `sichtbar_fuer` explizit → SV + Kanzlei passieren beide Filter (Server `.contains('sichtbar_fuer',['sachverstaendiger'])` + Client-Array-Check). Sie erscheinen heute in der **generischen** Doku-Liste (`WeitereDokumenteCard`), nicht als gruppierte Galerie.
- **`Rolle`-Union** (`sichtbarkeit.ts:12`) kennt `flottenmanager` NICHT → `getSichtbarFuerRolle(docs, 'flottenmanager')` ist ein Typfehler. Das Flotten-Portal umgeht das heute über eigene scoped Queries; sauber ist es trotzdem nicht (Master-Handoff TODO-5).
- **Kanzlei-Portal:** Routen `/kanzlei/mandate`, `/kanzlei/kanban`, `/kanzlei/termin`. **`/kanzlei/fall/[id]` existiert NICHT** — `mandate/page.tsx:134/:158` verlinkt dorthin (toter Link), Kommentar `:10` sagt „Read-only-Fallakte, kommt in PR 2b". Das Portal liest nur `v_claim_full` (ohne Gegner-Felder) + `fall_dokumente` (via `DokumenteDrawer`). Liest **nicht** `parteien` oder `vs_korrespondenz`.
- **RLS-Scope-Muster (Kanzlei)** — `mandate/page.tsx:44-48`: User-Client (`createClient()`), `faelle_claim_bridge` mit `claims:claim_id!inner(service_typ)` + `.eq('claims.service_typ','komplett')` liefert die autorisierten `claim_id`s; Display via `v_claim_full` (SECURITY DEFINER) nur für diese IDs → leak-safe. Die Bridge-RLS spiegelt `service_typ='komplett' AND rolle='kanzlei'`.
- **VS-Korrespondenz-Anzeige:** `VsKorrespondenzCard` (`src/components/kb/VsKorrespondenzCard.tsx`) ist eine Protokoll-UI **mit** Insert-Form (nicht read-only). Für die Kanzlei brauchen wir nur die **Anzeige** (read-only Liste).

---

## 4 · Architektur — zwei Teile

### Teil A — SV/Kanzlei-Foto-Sicht + `flottenmanager`-Rolle (klein)

**A1 · `flottenmanager` in die `Rolle`-Union + Map (Boy-Scout, korrektheitsrelevant).**
`sichtbarkeit.ts:Rolle` um `'flottenmanager'` erweitern. Die Slice-2c-Gegner-Dokument-Typen als explizite Map-Einträge ergänzen (Defense-in-Depth — falls je ein Consumer das DB-Array nicht mitlädt, greift die Map statt „nur admin"):
```
gegner_fahrzeug_foto:  ['admin','kundenbetreuer','sachverstaendiger','kanzlei','flottenmanager']
eigenes_fahrzeug_foto: ['admin','kundenbetreuer','sachverstaendiger','kanzlei','flottenmanager']
unfallort_foto:        ['admin','kundenbetreuer','sachverstaendiger','kanzlei','flottenmanager']
gegner_unterschrift:   ['admin','kundenbetreuer','sachverstaendiger','kanzlei','flottenmanager']
```
Das ist die einzige Stelle, an der Teil A **Verhalten** ändert (macht die Map konsistent mit dem, was die DB-Rows schon tragen; heute divergieren sie, was nur deshalb nicht beißt, weil das DB-Array Vorrang hat).

**A2 · Gegner-Fotos als Galerie im SV-Portal.**
Die bereits geladenen Gegner-Fotos (`dokument_typ ∈ {gegner_fahrzeug_foto, eigenes_fahrzeug_foto, unfallort_foto}`) in einer kompakten Bild-Galerie am „Gegner"/„Unfall"-Tab rendern, statt nur in der generischen Doku-Liste. Neue, rollen-agnostische Component `GegnerFotoGalerie` (`src/components/shared/`) — Thumbnails + Klick öffnet das bestehende Vorschau-Modal (aus dem Dokument-Vorschau-Feature). Wird von SV **und** Kanzlei (Teil B) genutzt.

### Teil B — Kanzlei-Fall-Detailseite `/kanzlei/fall/[id]` (Neubau, der Wert)

**B1 · Route + RLS-Guard.** `src/app/kanzlei/fall/[id]/page.tsx` (Server Component). Autorisierung **exakt** nach dem `mandate/page.tsx`-Muster: User-Client, prüfen dass `[id]` (claim_id) in den `faelle_claim_bridge`-Rows der Kanzlei mit `service_typ='komplett'` liegt. Nicht autorisiert / nicht gefunden → `notFound()`. **Kritisch:** die Row-Autorisierung läuft auf dem User-Client (RLS = Gate), Display-Reads dürfen den DEFINER-View `v_claim_full` nutzen, aber nur für die autorisierte ID (Slice-2c-Lehre: mit Admin-Client *abfragen* würde die service_typ-Beschränkung aushebeln).

**B2 · Datenladung** (alles read-only, für die autorisierte claim_id):
- Kern: `v_claim_full` (Kunde/Kennzeichen/Status/Mandat) — wie `mandate/page.tsx`.
- Gegner: **`claim_parties`** `rolle='verursacher'` (kanonisch — `parteien(16)` ist legacy-stale, `claim_parties(40)` ist die Quelle, die auch Slice 2c nutzt). Name via `person_id → personen` (claim_parties hat kein `nachname`). Kennzeichen, `versicherung_id`, `versicherungsnummer`, `versicherungs_aktenzeichen`.
- Unfall/Hergang: aus `v_claim_full` bzw. `faelle` (Hergang, Datum, Ort, Polizei) — dieselben Felder, die `UnfallDetail` erwartet.
- Fotos + Dokumente: `fall_dokumente` gefiltert über `getSichtbarFuerRolle(docs, 'kanzlei')`.
- **VS-Korrespondenz:** `vs_korrespondenz` für die claim_id (die Slice-2c-Unfallmeldung an die Gegner-Haftpflicht) — read-only Liste. Das ist neu für das Kanzlei-Portal und der eigentliche Mehrwert: die Kanzlei sieht, dass/wann/womit der Schaden der Gegner-VS gemeldet wurde.

**B3 · Rendering** (Reuse):
- Gegner/Unfall: die `GegnerDetail`/`UnfallDetail`-Darstellung aus `StammdatenDetail` wiederverwenden. `StammdatenDetail` nimmt `{ category, data: StammdatenAccordionData, onClose, inline }` — rollen-agnostisch (nur Daten). Entweder das `StammdatenAccordionData`-Objekt für den Kanzlei-Claim aufbauen und `StammdatenDetail inline` nutzen, oder — falls das Mapping zu schwer wiegt — die beiden Sub-Renderer in eine gemeinsame präsentationsreine Component ziehen (Entscheidung im Plan, nach Prüfung der `StammdatenAccordionData`-Form).
- Fotos: `GegnerFotoGalerie` aus A2.
- VS-Korrespondenz: read-only Liste — die Anzeige-Teile aus `VsKorrespondenzCard` als präsentationsreine `VsKorrespondenzListe` extrahieren (ohne Insert-Form), von der Kanzlei-Seite genutzt. (`VsKorrespondenzCard` selbst bleibt für Admin/KB unverändert.)
- Dokumente: bestehende Doku-Anzeige (`WeitereDokumenteCard` o.ä.) mit `getSichtbarFuerRolle(docs,'kanzlei')`.
- Layout: liegt unter `kanzlei/layout.tsx` (KanzleiNav bleibt unverändert — die Seite ist aus `mandate` verlinkt, kein neuer Nav-Eintrag).

**B4 · Der tote Link wird lebendig.** `mandate/page.tsx:134/:158` verlinkt schon auf `/kanzlei/fall/${fallId}` — nach B1 funktioniert er. Kein Link-Change nötig (nur verifizieren, dass `fallId` == der Wert ist, den B1 als `[id]` erwartet; laut Bestand ist `fall_id === claim_id`).

---

## 5 · Isolation & Testbarkeit

- `GegnerFotoGalerie` (A2): präsentationsrein, Props = `fotos: {storagePath, dateiname, typ}[]` + `onOpen`. Unit-testbar (rendert N Thumbnails, Klick ruft onOpen), von SV + Kanzlei geteilt.
- `VsKorrespondenzListe` (B3): präsentationsrein, Props = `eintraege: VsKorrespondenzRow[]`. Unit-testbar.
- RLS-Guard (B1): der sicherheitskritische Teil. Test: autorisierte claim_id → lädt; fremde claim_id (nicht in der Kanzlei-Bridge) → `notFound`. Muster + Assertion wie Slice 2c's Storage-RLS-Tests.
- Sichtbarkeits-Map (A1): Test, dass `getSichtbarFuerRolle` die Gegner-Fototypen für `sachverstaendiger`/`kanzlei` durchlässt und für `kunde` sperrt — sowohl mit als auch ohne gesetztes DB-Array.

---

## 6 · Umsetzung in Schnitten

- **Teil A** (klein): A1 Map/Rolle + Test → A2 `GegnerFotoGalerie` + SV-Portal-Andock. Eigenständig testbar/mergebar.
- **Teil B** (Neubau): B1 Route+RLS-Guard → B2 Loader → B3 Rendering (inkl. `VsKorrespondenzListe`-Extraktion) → B4 Link-Verifikation.

Jeder Schnitt: 7-Punkte-Audit + `sichtbar_fuer`-Semantik verifizieren + Prod-Smoke (Regel 4, mit Kanzlei-Test-Konto) nach Deploy.

---

## 7 · Koordination

- **Shared File `src/lib/dokumente/sichtbarkeit.ts`** (A1) — wird breit konsumiert. Additive Änderung (neue Rolle + neue Map-Keys), aber Marker vor Touch (andere Lanes könnten die `Rolle`-Union berühren).
- **`StammdatenDetail`/`VsKorrespondenzCard`** — bei Extraktion (B3) die Original-Consumer (SV-Portal / Admin-KB) unberührt lassen (präsentationsreine Sub-Component herausziehen, Original re-nutzt sie).
- **aar-956** (`convert-lead-to-claim`) — nicht berührt (kein `hergang_gegner_text`).
- **Slice 2c** (PR #4247) — Slice 3 liest die Daten, die 2c schreibt; wartet nicht auf 2c-Merge (die Spalten/Tabellen existieren unabhängig).

---

## 8 · Offene Fragen (für Review)

1. **Teil-A-Umfang:** Reicht die `GegnerFotoGalerie` am bestehenden SV-Gegner-Tab, oder soll auch ein sauberes „Gegner-Sicht"-Panel (Gestaendnis/Unterschrift-Status aus Slice 2c) dazu? (Empfehlung: erst nur Fotos — Gestaendnis/Unterschrift ist ohne `unfallberichte`-Tabelle ohnehin nur als Dokument sichtbar.)
2. **`VsKorrespondenzListe`-Extraktion vs. neue Component:** Extraktion aus `VsKorrespondenzCard` (DRY, aber berührt eine KB-Component) oder eine schlanke neue read-only Liste (isoliert, minimale Duplikation)? (Empfehlung: Extraktion, weil die Zeilen-Darstellung identisch sein soll.)
