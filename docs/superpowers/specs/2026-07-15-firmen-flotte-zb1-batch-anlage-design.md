# Firmen-Flotte — ZB1-Scan-Fahrzeuganlage (Batch) — Design

**Datum:** 2026-07-15
**Branch:** `kitta/firmen-flotte-zb1-batch-anlage` (off `origin/staging`)
**Session:** b0e963b6 (Firmen-Flotte-Lane)
**Status:** Design — von Aaron freigegeben 15.07.
**Vorgänger:** Schadenkarte-Bogen (PR #4366). Diese Anlage ist das §4.6-Nicht-Ziel des
Schadenkarte-Specs, jetzt als eigenes Feature ausgearbeitet (Aaron 15.07.).

---

## 1 · Kontext & Ziel

Ein Flotten-Fahrzeug entsteht heute nur als **Stub**: `FahrzeugForm = { kennzeichen,
hersteller?, modell?, notiz? }` → `createVehicleStub` → `flotten_fahrzeuge`. **Keine FIN** →
keine Deduplizierung gegen den `vehicles`-SSoT, keine CardEntity-Anreicherung. B-FL 101 in der
prod-DB trägt genau deshalb nur „VW / Golf 8".

Auf der ZB1 (Zulassungsbescheinigung Teil I) stehen FIN, HSN/TSN, Marke, Modell, Farbe,
Erstzulassung und der Halter. Diese Anlage scannt die ZB1, extrahiert die Felder per OCR und
legt ein **vollwertiges, FIN-dedupliziertes** Fahrzeug an — im **Batch** (mehrere ZB1s
hintereinander → Sammel-Review → alle anlegen).

**Ziel:** Flotten-Fahrzeuge per ZB1-Scan als deduplizierte `vehicles`-Zeilen anlegen, im Batch,
mit Pflicht-Review. Zwei Einstiege: Flottenmanager (`/flotte`, Kamera mobil) + Admin-Vertrieb
(`/admin/vertrieb/firmen-flotte/[id]`, Upload Desktop).

**Leitprinzip: Compose-Job.** OCR, FIN-Dedup-Write und Flotten-Binding existieren. Neu sind
eine Batch-Review-UI, zwei dünne Server-Actions und ein reiner Mapper. **Kein DDL.**

---

## 2 · Ist-Stand (verifiziert 15.07., Code + prod-DB)

### 2.1 OCR (reuse, unberührt)
`src/lib/ocr/zb1-parser.ts`:
- `runZB1Ocr(base64: string): Promise<{ fullText: string; extracted: ZB1ExtractedData } | { error: string; status?: number }>` — Google Vision + Regex-Parser, ZB1-Layout-getunt.
- `ZB1ExtractedData` = `{ kennzeichen, erstzulassung, fahrzeug_baujahr, halter_nachname, halter_vorname, halter_strasse, halter_plz, halter_stadt, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_farbe, fin_vin, hsn, tsn, brn }` (alle `string|null` außer `fahrzeug_baujahr: number|null`).

Alternative `src/lib/ocr/claude-extract.ts` (Claude Vision + Zod) existiert — **bewusst NICHT
genutzt** (s. §3, Engine-Entscheidung).

### 2.2 Vehicle-Write-Path (reuse, nur aufrufen)
`src/lib/vehicles/ensure-vehicle.ts` (Dateikopf nennt ZB1-OCR wörtlich als vorgesehenen Aufrufer):
- `ensureVehicleFromFin({ fin: string|null; snapshot?: VehicleSnapshot; ownerId?: string|null; db }): Promise<EnsureVehicleResult>`
  - validiert FIN (17 Zeichen `VIN_REGEX`), **wirft nie** (Result-Object)
  - `upsert_vehicle_by_fin` (SECURITY DEFINER, **`ON CONFLICT(fin) DO UPDATE`** = Dedup)
  - zieht reiche Felder (Farbe/Erstzulassung/Baujahr/…) per Secondary-UPDATE nach (kein NULL-Clobber)
- `VehicleSnapshot` = `{ kennzeichen?, hersteller?, modell?, hsn?, tsn?, kilometerstand?, kennzeichenBuchstaben?, farbe?, farbcode?, baujahr?, erstzulassung?, finQuelle? }`
- `EnsureVehicleResult` = `{ ok: true; vehicleId: string } | { ok: false; error: string }`
- `createVehicleStub({ snapshot, db }): Promise<{ ok: true; vehicleId } | { ok: false; error }>` — der FIN-lose Fallback.

### 2.3 Flotten-Binding (reuse + kleine Extraktion)
`src/lib/flotte/mutate-flotte.ts`:
- `addFahrzeugToFlotte(db, firmaId, form: FahrzeugForm, userId)` — **Stub-Weg** (createVehicleStub + N:M-Insert). Behandelt `23505` bereits sauber: `'Dieses Fahrzeug ist bereits in der Flotte.'`
- Der N:M-Insert-Block (`flotten_fahrzeuge` + 23505-Handling) wird zu `bindeVehicleAnFlotte` extrahiert (Boy-Scout, s. §4.2), damit der ZB1-Weg (ensureVehicleFromFin → vehicleId) ihn ohne Stub nutzt.

### 2.4 DB-Fakten (prod-verifiziert)
- `flotten_fahrzeuge`: `UNIQUE (firma_id, vehicle_id)` → **Doppel-Bind wirft 23505** (der Duplikat-Schutz).
- `flotten_fahrzeuge` Spalten: `id, firma_id, vehicle_id, added_by_user_id, notiz, created_at`.
- `vehicles.zb1_dokument_id → fall_dokumente(id) ON DELETE SET NULL` — **existiert, 0 Consumer** (tote-aber-vorgesehene Spalte, wie `nfc_uid` es war). Ablageort für das gescannte ZB1-Bild.
- **Kein** Flotten-Fahrzeug-CSV/Batch-Import existiert → Einzel-Anlage ist heute der einzige Weg.

### 2.5 UI-Vorlage (reuse-Muster)
`src/app/upload/zb1/[token]/Zb1UploadClient.tsx`: Kamera-Capture (`<input type="file"
accept="image/*" capture="environment">`) + Galerie-Fallback + Preview + `extracted`-Review-State
+ fetch. Vorlage für die Kamera/Upload-Mechanik; die **Batch-Liste** ist neu.

### 2.6 Anlage-Einstiege heute
- Flottenmanager: `src/components/flotte/FlotteClient.tsx` + `src/app/flotte/(shell)/flotte/actions.ts`.
- Admin: `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx` + `_actions/firmen-flotte-fahrzeuge.ts` (`fuegeFahrzeugZuFlotteHinzu`, `requireRole(['admin','dispatch'])`).

---

## 3 · Entscheidungen (Aaron, 15.07. — verbindlich)

1. **Batch von Anfang an** — mehrere ZB1s → Sammel-Review → alle anlegen. Nicht atomar (pro-Zeile-Result).
2. **Beide Einstiege** — `/flotte` (Kamera) + `/admin/vertrieb/firmen-flotte/[id]` (Upload). Gemeinsamer Kern, zwei Einbindungen.
3. **Scan ergänzt** das manuelle `FahrzeugForm`, ersetzt es nicht (zusätzlicher Button).
4. **Review Pflicht** — nie blind schreiben (anders als der Lead-Scan bei Confidence ≥ 0.8).
5. **Keine FIN → Stub-Anlage** (createVehicleStub) mit Markierung „ohne FIN keine Dedup/Anreicherung".
6. **Halter-Verifikation = Warnung, kein Block** (Leasing legitim).
7. **`ownerId` bleibt NULL** — `current_owner_id → profiles` kann keine Firma tragen; Halter = `flotten_fahrzeuge`.
8. **ZB1-Bild** je Fahrzeug → `fall_dokumente` + `vehicles.zb1_dokument_id` (best-effort).

**Engine (selbst entschieden, dokumentiert):** `runZB1Ocr` (Google Vision). Der ZB1-Layout-getunte,
getestete Pfad; der Pflicht-Review fängt Fehltreffer ab. `claude-extract.ts` (genauer, teurer)
ist eine bewusste spätere Alternative, kein Teil dieses Slices.

---

## 4 · Design

### 4.1 Datenfluss

```
SCANNEN (nacheinander, Client sammelt)
  je Bild:  scanZb1FuerFlotte(base64, firmaId)   [NEU]
              → runZB1Ocr → extracted + confidence
              → Duplikat-Check: FIN schon in DIESER Flotte?  (bereitsInFlotte)
              → Halter-Vergleich (halterWarnung)
              → ScanErgebnis   (KEIN Write)
  Client pusht eine editierbare Zeile in die Batch-Liste

SAMMEL-REVIEW (Client-State: ScanZeile[])
  Zeile: kennzeichen · fin · hersteller · modell · farbe · erstzulassung · hsn · tsn
  Status je Zeile (abgeleitet aus ScanErgebnis + Edits, nicht gespeichert):
    ok | niedrige_confidence | keine_fin | bereits_in_flotte | duplikat_im_batch
  editierbar, einzeln entfernbar; Halter-Warnung je Zeile

ANLEGEN ("Alle anlegen")
  legeFlottenFahrzeugeAn(zeilen[], firmaId)   [NEU]
    pro Zeile (NICHT atomar):
      bereitsInFlotte → ensureVehicleFromFin (vehicle refresht), Bind ÜBERSPRINGEN → 'aktualisiert'
      hat FIN         → ensureVehicleFromFin(snapshot) → vehicleId → bindeVehicleAnFlotte → 'angelegt'
      keine FIN       → createVehicleStub → bindeVehicleAnFlotte → 'stub'
      Fehler in dieser Zeile → 'fehler' (andere Zeilen laufen weiter)
      ZB1-Bild → fall_dokumente + vehicles.zb1_dokument_id (best-effort, bricht die Zeile nicht)
    → BatchAnlageErgebnis[]

ERGEBNIS-Screen: "N angelegt · M aktualisiert (bereits in Flotte) · K ohne FIN als Stub · F Fehler"
```

### 4.2 Lib-Schicht

**`zb1ToVehicleSnapshot(e: ZB1ExtractedData): VehicleSnapshot`** (NEU, pure, `src/lib/flotte/zb1-vehicle.ts`)
Reines Mapping, ~20 Zeilen, voll unit-testbar:
```
fin_vin → (übergeben an ensureVehicleFromFin, nicht in Snapshot)
kennzeichen → kennzeichen ; fahrzeug_hersteller → hersteller ; fahrzeug_modell → modell
hsn → hsn ; tsn → tsn ; fahrzeug_farbe → farbe ; fahrzeug_baujahr → baujahr
erstzulassung → erstzulassung ; finQuelle → 'zb1_ocr'
```

**`bindeVehicleAnFlotte(db, { firmaId, vehicleId, userId, notiz? }): Promise<{ ok: boolean; bereitsVorhanden?: boolean; error?: string }>`** (NEU, `src/lib/flotte/mutate-flotte.ts`)
Der `flotten_fahrzeuge`-N:M-Insert, aus `addFahrzeugToFlotte` extrahiert. 23505 → `{ ok: false, bereitsVorhanden: true }` (nicht als Fehler, sondern als „schon da"). **Boy-Scout:** `addFahrzeugToFlotte` ruft danach diese Funktion statt des inline-Inserts — die 4 bestehenden Consumer bleiben unberührt (gleiche Signatur, gleiches 23505-Verhalten via `error`-String-Mapping).

**`scanZb1FuerFlotte(base64, firmaId)`** (NEU, Server-Action je Portal)
`runZB1Ocr` → Confidence → FIN-Duplikat-Check gegen die Firma-Flotte → Halter-Vergleich → `ScanErgebnis`. **Kein Write.**

**`legeFlottenFahrzeugeAn(zeilen[], firmaId)`** (NEU, Server-Action je Portal)
Iteriert über die Zeilen, pro Zeile ein `BatchAnlageErgebnis`. Non-atomar (ein Fehler stoppt die Schleife nicht).

**Die zwei Result-Typen (kanonisch — überall so referenziert):**
```ts
type ScanErgebnis = {
  extracted: ZB1ExtractedData
  // Confidence = Anteil der 5 Kernfelder (fin_vin, hsn, tsn, kennzeichen, erstzulassung),
  // die die OCR erkannt hat — identische Heuristik wie der bestehende Lead-Scan.
  confidence: number
  bereitsInFlotte: boolean        // FIN schon an diese firmaId gebunden
  halterWarnung: boolean          // ZB1-Halter weicht vom Firmennamen ab (fuzzy)
  halterZb1: string | null        // der auf der ZB1 erkannte Halter (fuer die Warnung)
}

type BatchAnlageErgebnis = {
  zeileIndex: number
  kennzeichen: string | null
  status: 'angelegt' | 'aktualisiert' | 'stub' | 'fehler'
  //  angelegt     = neue vehicles-Row (mit FIN) + neuer Flotten-Bind
  //  aktualisiert = FIN existierte schon in der Flotte -> vehicles refresht, Bind uebersprungen
  //  stub         = keine FIN -> createVehicleStub + Bind (ohne Dedup/Anreicherung)
  //  fehler       = diese Zeile scheiterte; die anderen laufen weiter
  error?: string
}
```

### 4.3 Duplikat-Handling (zwei Ebenen)

1. **Im Batch:** zwei Zeilen mit derselben FIN → der Client dedupliziert beim Push (zweiter Scan zeigt „bereits in dieser Liste", wird nicht doppelt hinzugefügt).
2. **Gegen die Flotte:** `scanZb1FuerFlotte` prüft die FIN gegen `flotten_fahrzeuge(firmaId)`. Treffer → Zeile als `bereits_in_flotte`. Beim Anlegen: `vehicles` wird mit den frischen ZB1-Daten **aktualisiert** (ensureVehicleFromFin ist idempotent), der **Bind übersprungen** (kein 23505). Ergebnis-Status: `aktualisiert`.

### 4.4 Fehler-Handling (nicht atomar)

`legeFlottenFahrzeugeAn` fängt pro Zeile ab und liefert `BatchAnlageErgebnis[]` (Typ in §4.2:
Status `angelegt | aktualisiert | stub | fehler`). Ein DB-Fehler / ungültige FIN bei Fahrzeug X
bricht die anderen **nicht** ab. Der Ergebnis-Screen zeigt die Zusammenfassung + pro-Zeile-Status.
Fehlgeschlagene Zeilen bleiben im Review (Retry möglich).

### 4.5 ZB1-Bild-Ablage (best-effort)

Je angelegtem Fahrzeug: Bild → `fall-dokumente`-Bucket unter `vehicles/{vehicleId}/zb1/{uuid}.jpg`
→ `fall_dokumente`-Row (dokument_typ `zb1_fahrzeugschein`) → `vehicles.zb1_dokument_id` setzen.
**Best-effort:** ein Fehler beim Bild-Speichern bricht die Fahrzeug-Anlage **nicht** (try/catch,
console.error). Nutzt die vorgesehene, bisher tote `zb1_dokument_id`-Spalte.

### 4.6 UI

**`Zb1BatchScanner.tsx`** (NEU, `src/components/flotte/`, rollenagnostisch)
Props: `firmaId: string`, `onScan: (base64) => Promise<ScanErgebnis>`, `onAnlegen:
(zeilen) => Promise<BatchAnlageErgebnis[]>`, `onFertig: () => void`.
- Phase `scannen`: Kamera/Upload (Muster aus `Zb1UploadClient`), nach jedem Scan eine Zeile.
- Phase `review`: die Batch-Liste (editierbar, Status-Badges, entfernbar) + „Alle anlegen".
- Phase `ergebnis`: Zusammenfassung + pro-Zeile-Status; fehlgeschlagene Zeilen zurück in Review.
Komponenten aus `@/components/primitives` (Button, Drawer) + `@/components/shared` (SectionCard,
Statusbadge via Registry). Reine Label-/Status-Anzeige — keine neue Farb-Map (Registry nutzen).

**Zwei Einstiege** — je ein „Fahrzeuge per ZB1 scannen"-Button, öffnet `Zb1BatchScanner` in einem Drawer:
- `FlotteClient.tsx` (`/flotte`): `firmaId` aus `getFlottenmanagerFirma`; Actions in `flotte/(shell)/flotte/actions.ts`.
- `FirmenFlotteDetailClient.tsx` (`/admin/vertrieb/firmen-flotte/[id]`): `firmaId` aus der Route; Actions in `_actions/firmen-flotte-fahrzeuge.ts` (`requireRole`).
Die beiden Server-Action-Paare sind dünne Wrapper um dieselbe Lib (unterschiedliches Firma-Scoping).

### 4.7 Halter-Verifikation

Auf der ZB1 steht der Halter (`halter_nachname`/`halter_vorname`, bei Firmenwagen der Firmenname).
`scanZb1FuerFlotte` lädt `firmen.name` und vergleicht **normalisiert/fuzzy** (lowercase, ohne
Rechtsform-Suffixe wie „GmbH"). Abweichung → `{ halterWarnung: true, halterZb1: '<name>' }` → die
Zeile zeigt gelb *„Auf der ZB1 steht ein anderer Halter (»Müller GmbH«). Trotzdem übernehmen?"*.
**Kein Block** — Leasing/Finanzierung weichen legitim ab.

---

## 5 · Nicht-Ziele

- **Kein DDL** — alle Spalten existieren.
- **Kein Claude-OCR** (Vision reuse; s. §3).
- **Kein Chunking** für Riesen-Batches — ein Durchgang deckt komfortabel ~bis 50 Fahrzeuge; die
  200-Fahrzeug-Erst-Anlage bräuchte mehrere Durchgänge. Der echte Massen-Weg wäre ein
  Flotten-CSV-Import (existiert nicht) — bewusst separat.
- **Kein Umbau von `src/lib/ocr/*`** (nur Import) oder `ensure-vehicle.ts` (nur Aufruf).
- **Kein Anfassen von `convert-lead-to-claim.ts` / aar-956** — der ZB1-Flotten-Weg geht über
  `ensureVehicleFromFin`, nicht über den Lead-Convert.

---

## 6 · Koordination

| Fläche | Eigentümer |
|---|---|
| `src/components/flotte/**`, `/flotte/**`, `src/lib/flotte/**` | **diese Lane** |
| `src/app/admin/vertrieb/firmen-flotte/[id]/**` + `_actions/firmen-flotte-fahrzeuge.ts` | geteilt (Detail-View-Lane 7572149e ruht) → Marker vor Touch |
| `src/lib/ocr/**` | geteilt — nur **Import** |
| `src/lib/vehicles/ensure-vehicle.ts` | geteilt — nur **Aufruf** |

`mutate-flotte.ts` (Boy-Scout-Extraktion) ist breit konsumiert — die 4 Consumer von
`addFahrzeugToFlotte` bleiben durch identische Signatur + 23505-Verhalten unberührt.

---

## 7 · Sicherheit

- **Firma-Scoping in beiden Action-Paaren.** Flottenmanager: `getFlottenmanagerFirma(user.id)` →
  nur die eigene Firma. Admin: `requireRole(['admin','dispatch'])` + `firmaId` aus der Route.
  `legeFlottenFahrzeugeAn` schreibt `flotten_fahrzeuge` **nur** für die gescopte `firmaId`.
- **Admin-Client** (`createAdminClient`) für die Writes (`flotten_fahrzeuge`/`vehicles` sind
  deny-all für Clients) — die Autorisierung liegt im Action-Guard davor.
- **OCR-Input**: nur Bild-MIME (`image/*`), Größenlimit wie der Lead-Scan.
- ⚠ **`createAdminClient()` ist ungetypt** → Select-Strings gegen prod proben (READ). Der
  FIN-Duplikat-Join (`vehicles.fin` × `flotten_fahrzeuge.firma_id`) einmal live verifizieren.

---

## 8 · Tests & Verifikation

**Unit (pure, schnell):**
- `zb1ToVehicleSnapshot` — Mapping inkl. fehlender FIN, null-Feldern, Baujahr-Grenzen.
- `bindeVehicleAnFlotte` — 23505 → `bereitsVorhanden:true`; anderer Fehler → `ok:false,error`.
- `legeFlottenFahrzeugeAn` — Batch-Iteration: pro-Zeile-Result, non-atomar (Zeile 2 scheitert,
  Zeile 1+3 werden angelegt); Duplikat → `aktualisiert`+Bind übersprungen; keine FIN → `stub`.

**Integration:**
- `addFahrzeugToFlotte` nach Boy-Scout-Extraktion: bestehendes Verhalten unverändert (23505 →
  gleiche Meldung) — Regressionstest für die 4 Consumer.

**Prod-Smoke (Regel 4), nach Deploy:**
Test-Flotte `flotte.test@claimondo.de` / Firma `dafc57ee`. Ein echtes ZB1-Foto (oder Test-Bild)
→ Scan → Review → Anlegen → DB: `vehicles`-Row mit FIN + `flotten_fahrzeuge`-Bind +
`zb1_dokument_id` gesetzt. Duplikat-Fall: dasselbe Fahrzeug zweimal → zweites `aktualisiert`,
kein Doppel-Bind. Batch-Teilfehler: eine Zeile mit unsinniger FIN → die anderen kommen durch.
Beide Einstiege (Flottenmanager + Admin) einmal durchklicken. Fixtures danach löschen.

⚠ **OCR-Genauigkeit** hängt an der Bildqualität — der Smoke prüft die **Verdrahtung**
(Scan→Review→Anlage→DB), nicht die OCR-Trefferquote. Ein unscharfes Bild landet korrekt im
niedrige-Confidence-Review, das ist erwartetes Verhalten.

---

## 9 · Lieferung

Ein Spec, sinnvoll in Slices (jeder für sich lauffähig/testbar):
| Slice | Inhalt |
|---|---|
| **A** | Lib-Kern: `zb1ToVehicleSnapshot` + `bindeVehicleAnFlotte` (Boy-Scout) + `legeFlottenFahrzeugeAn` (Batch-Anlage, non-atomar) + Unit-Tests. Kein UI. |
| **B** | `scanZb1FuerFlotte` (OCR + Duplikat-Check) + `Zb1BatchScanner`-UI (Scan/Review/Ergebnis). |
| **C** | Zwei Einstiege verdrahtet (`/flotte` + `/admin/vertrieb`) + ZB1-Bild-Ablage. |

Ausführung: subagent-driven (fresh implementer je Task, task-review, finaler Whole-Branch-Review).
