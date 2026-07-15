# Schadenkarte vollständig — NFC · Sperren · ZB1-Fahrzeuganlage (Design)

**Datum:** 2026-07-14
**Branch:** `kitta/schadenkarte-nfc-sperren` (off `origin/staging`)
**Session:** b0e963b6 (Firmen-Flotte-Lane, per Aaron-Handoff übernommen)
**Status:** Design — von Aaron freigegeben 14.07.
**Vorgänger:** Layer 0/1 + Slice 1/2a/2b/2c (alle auf prod). Master: `HANDOFF-firmen-flotte-master`.

---

## 1 · Kontext & Ziel

Die NFC-Schadenkarte ist das physische Herz der Firmen-Flotte: sie klebt im Fahrzeug, der
Unfallgegner hält sein Handy dran und erfasst seine Seite des Schadens. Der **Software**-Pfad
dahinter ist gebaut und seit 14.07. auf prod (Mint → Binden → `/schaden/[token]` → Claim →
VS-Meldung, prod-gesmoked).

Die **Karte als physisches Objekt** hat vier Lücken — zwei kaputt, zwei nicht vorhanden:

| # | Lücke | Art |
|---|---|---|
| 1 | QR-URL zeigt auf `claimondo.de` → **404**. Jede gedruckte Karte ist unbenutzbar. | Bug |
| 2 | Fahrzeug gelöscht → Karte bleibt `gebunden` mit `fahrzeug_id=NULL` (Zombie). | Bug |
| 3 | Verlorene/gestohlene Karte lässt sich nicht abschalten. | Feature |
| 4 | `nfc_uid` ist tote Spalte, kein NDEF-Schreiben. Die „NFC-Karte" ist heute eine QR-Karte. | Feature |

Dazu ein fünftes Thema, das Aaron im selben Zug gestellt hat: **ein Flotten-Fahrzeug per
ZB1-Scan anlegen** — heute erzeugt die Flotten-Anlage nur einen Stub (Kennzeichen + Marke +
Modell, **keine FIN** → keine Deduplizierung gegen den Fahrzeug-SSoT).

**Ziel:** Die Karte funktioniert physisch, ist widerrufbar, trägt einen echten NFC-Chip — und
ein Flotten-Fahrzeug entsteht per ZB1-Scan als vollwertige, deduplizierte `vehicles`-Zeile.

---

## 2 · Ist-Stand (verifiziert 14.07., nicht aus Handoffs abgeschrieben)

### 2.1 Was funktioniert

* **`gegner-flow.ts:43-46` gated bereits auf `status='gebunden'`:**
  ```ts
  // Step 2: card must be in 'gebunden' state (frei/bestellt/gesperrt must not open the flow)
  if (karte.status !== 'gebunden') return { ok: false, reason: 'nicht_gebunden' }
  ```
  → **Das Sicherheitsfundament für „Sperren" steht schon.** Status auf `gesperrt` setzen tötet
  den Token in derselben Sekunde. Kein Umbau am Resolve-Pfad nötig.
* **`extractSchadenkarteToken` (token.ts:26)** parst **beides**: eine volle `/schaden/<token>`-URL
  *und* einen nackten `SKT-…`-Token. Chip-Auslesen, QR-Scannen und Tippen konvergieren damit auf
  dieselbe Funktion.
* **Mint + Binden existieren mit UI** in beiden Portalen:
  * `src/app/admin/vertrieb/_actions/firmen-flotte-karten.ts` — Mint **und** Bind (Staff)
  * `src/app/flotte/(shell)/flotte/schadenkarte-actions.ts` — Bind (Flottenmanager)
  * Admin-Akte `/admin/vertrieb/firmen-flotte/[id]` kann Stammdaten · Fahrzeuge · Karten
    (minten + binden) · Schäden · Flottenmanager-Konto.
* **Partial-Unique:** ein Fahrzeug = max. **eine** aktive Karte (`WHERE status='gebunden'`);
  `bindeSchadenkarteAnFahrzeug` fängt `23505` explizit ab.
* **QR-Scanner** (`SchadenkarteScanner.tsx`): Kamera via `BarcodeDetector`, jsQR-Fallback.

### 2.2 Was kaputt ist

* **Tote Karten-URL — beide Bau-Stellen falsch:**
  ```
  src/app/flotte/(shell)/karten/actions.ts:56        `https://claimondo.de/schaden/${token}`   (QR-PDF)
  src/app/flotte/(shell)/fahrzeug/[id]/page.tsx:69   `https://claimondo.de/schaden/${token}`   (Seiten-QR)
  ```
  curl-verifiziert: `claimondo.de/schaden/<t>` → **404**, `app.claimondo.de/schaden/<t>` → **200**.
  nginx: `claimondo.de` → :3006 (Marketing), `app.claimondo.de` → :3000 (App).
  `src/lib/schadenkarte/token.test.ts` nutzt ebenfalls `claimondo.de` → **irreführend**.
  **`NEXT_PUBLIC_APP_URL` ist in `/etc/claimondo/.env.local` NICHT gesetzt** (VPS-verifiziert) →
  der Code-Fallback entscheidet.
* **Zombie-Karte:** `schadenkarten.fahrzeug_id → vehicles ON DELETE SET NULL`. Wird ein Fahrzeug
  gelöscht, wird `fahrzeug_id` NULL, **`status` bleibt `gebunden`**. Live beobachtet an
  `SKT-N9EAA4Y6MJYYCT3W` nach dem Go-Live-Cleanup. Folge: Die Karte ist im Portal „gebunden"
  (niemand bindet sie neu), aber `bindeSchadenkarteAnFahrzeug` verlangt `bestellt|frei` → sie ist
  **unbrauchbar**. Der Gegner-Flow lehnt sie korrekt ab (`kein_fahrzeug`), es ist also **kein**
  Sicherheitsloch, sondern ein Integritäts-/Ops-Defekt.
  **Produktrelevanz:** Löscht ein echter Flottenkunde ein Fahrzeug, wird dessen Karte genauso zur
  Leiche — die physische Karte im Auto ist still tot.

### 2.3 Was fehlt

* **`nfc_uid`**: Spalte existiert, **null Code-Referenzen**. Kein `NDEFReader`, kein NDEF-Schreiben
  irgendwo im Repo.
* **Lebenszyklus:** CHECK erlaubt `bestellt · frei · gebunden · gesperrt · ersetzt`.
  Der Code setzt **nur** `bestellt` (Mint) und `gebunden` (Bind). `frei`, `gesperrt`, `ersetzt`
  werden von **niemandem** gesetzt → kein Entbinden, kein Sperren, kein Ersetzen.
* **Operator-Sicht:** Die Admin-Akte zeigt nur den **Token**, nicht die volle URL / keinen QR.
  Wer eine Karte beschriften/beschreiben soll, kommt an die URL nicht heran.

### 2.4 Fahrzeug-Datenmodell (Antwort auf Aarons Normalisierungs-Frage)

`vehicles` ist **sauber normalisiert** — 10 Tabellen zeigen per FK darauf:

```
claims.vehicle_id · leads.vehicle_id · claim_parties.vehicle_id
claim_vehicle_involvements · claim_mietwagen · repairs
flotten_fahrzeuge.vehicle_id · schadenkarten.fahrzeug_id
vehicle_ownership_history · vehicle_vorschaeden
```

Das Flotten-Fahrzeug **ist** dieselbe Zeile, die im Claim landet — keine Kopie. Über
`leads.vehicle_id` hängt auch der Flowlink-/Lead-Pfad daran.

**Der Write-Path existiert und nennt ZB1-OCR wörtlich als vorgesehenen Aufrufer**
(`src/lib/vehicles/ensure-vehicle.ts`, Dateikopf):

> „alle FIN-Gewinnungs-Punkte (**ZB1-OCR**, Cardentity-Enrich, manuelle FIN-Eingabe,
> Lead-Konversion) rufen ihn, statt die RPC 4× inline zu duplizieren."

`ensureVehicleFromFin({ fin, snapshot, db })`:
* validiert die FIN (17 Zeichen, `VIN_REGEX`), **wirft nie** (Result-Object)
* ruft `upsert_vehicle_by_fin` (SECURITY DEFINER, **`ON CONFLICT(fin) DO UPDATE`** = die Dedup)
* zieht die **reichen** Felder (Farbe, Erstzulassung, Baujahr, Bauart, Ausstattung) per
  Secondary-UPDATE nach — **ohne NULL-Clobber**
* `zb1_ocr` ist dort bereits als `fin_quelle`-Wert vorgesehen

**Aber die Flotte nutzt ihn nicht:** `addFahrzeugToFlotte` → `createVehicleStub` →
`FahrzeugForm = { kennzeichen, hersteller?, modell?, notiz? }` — **keine FIN, keine Dedup.**

### 2.5 ZB1-OCR existiert vollständig

`src/lib/ocr/`: `extract.ts` · `claude-extract.ts` · `zb1-parser.ts` · `zb1-fields.ts` ·
`validation.ts` · `apply-zb1-to-lead.ts` + Tests.

* `runZB1Ocr(base64)` → OCR-Text
* `parseZB1Fields(text)` → `ZB1ExtractedData`:
  ```
  fin_vin · kennzeichen · hsn · tsn · fahrzeug_hersteller · fahrzeug_modell · fahrzeug_farbe
  erstzulassung · fahrzeug_baujahr · brn
  halter_nachname · halter_vorname · halter_strasse · halter_plz · halter_stadt
  ```
* Einziger Consumer heute: `buildZb1LeadUpdate` → schreibt auf einen **Lead**, nicht auf ein
  Flotten-Fahrzeug.

Die ZB1-Felder sind ein **1:1-Match** auf `upsert_vehicle_by_fin`. Es fehlt nur der Mapper.

---

## 3 · Entscheidungen (Aaron, 14.07. — verbindlich)

1. **Ein Spec, alles zusammen** (Karte + NFC + Sperren + ZB1). Umsetzung in 3 PRs.
2. **Chip-Inhalt = Karten-Token-URL**, nicht das Fahrzeug. Fahrzeug bleibt eine DB-Verknüpfung.
3. **Token wird vor-gemintet.** Karten werden bedruckt, der **passende QR wird aufgeklebt**.
   → Der QR ist der universelle Fallback; NFC ist der Premium-Tap obendrauf.
4. **NFC-Beschreiben: Web NFC, selbst geschrieben** — **beide** Rollen (Vertrieb *und*
   Flottenmanager) dürfen es. iPhone-Fallback ist eingeplant.
5. **Sperren ist reversibel:** Entsperren führt auf **`frei`**, nie zurück auf `gebunden`.
6. **Halter:** Die Firma *ist* der Halter — aber `vehicles.current_owner_id` zeigt auf
   `profiles` (Nutzer-Account) und kann eine Firma nicht ausdrücken. → bleibt **NULL**;
   der Halter wird über `flotten_fahrzeuge` abgebildet. Die ZB1-Halterdaten werden zur
   **Verifikation** genutzt (Warnung, kein Block).

---

## 4 · Design

### 4.1 Die Zustandsmaschine der Karte

```
        mint
          ↓
      bestellt ──────┐
                     ├──►  gebunden  ──►  /schaden-Flow offen
      frei ──────────┘         │
        ▲                      │  entbinden  (Fahrzeug verkauft / Karte umziehen)
        ├──────────────────────┘
        │
        ├──◄──  gesperrt  ◄────  sperren  (Karte verloren/gestohlen)  ─── aus bestellt|frei|gebunden
        │       entsperren
        │
        └──◄──  Fahrzeug gelöscht  (Trigger — ersetzt den Zombie)
```

**Invarianten**

* **Nur `gebunden` öffnet den Gegner-Flow.** Bereits erzwungen (`gegner-flow.ts:43-46`) — Sperren
  wirkt daher **sofort**, ohne weitere Prüfung.
* **Ein Fahrzeug = max. eine aktive Karte** (Partial-Unique `WHERE status='gebunden'`).
  Deshalb kann ein Fahrzeug **sofort** eine Ersatzkarte bekommen, sobald die alte `gesperrt` ist —
  ohne die Historie zu verlieren.
* **Sperren behält `fahrzeug_id`** (Historie: „diese Karte saß auf Fahrzeug X").
* **Entsperren → `frei`**, `fahrzeug_id` wird geleert. Die Karte muss **bewusst** neu gebunden
  werden. Verhindert das versehentliche Reaktivieren einer längst ersetzten Karte.
* **`ersetzt` wird NICHT gebaut** (YAGNI). „verloren → sperren → neue minten → binden" deckt den
  Ersatzfall vollständig ab; ein sechster Zustand wäre toter Ballast.

### 4.2 Eine URL, drei Verbraucher

Der tote QR ist kein Tippfehler, sondern ein **Strukturdefekt**: drei Stellen bauen die URL von
Hand. Deshalb **eine** Quelle:

```ts
// src/lib/schadenkarte/url.ts   (NEU)
//
// Diese URL landet auf PHYSISCHEM PLASTIK (QR-Aufkleber + NFC-Chip) und ist danach nicht
// mehr änderbar. Sie MUSS auf die App zeigen: claimondo.de ist die Marketing-Seite (nginx
// :3006) und liefert 404 — app.claimondo.de ist die App (:3000).
// NEXT_PUBLIC_APP_URL ist auf dem VPS NICHT gesetzt (verifiziert 14.07.) -> der Fallback greift.
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export function buildSchadenkarteUrl(token: string): string {
  return `${BASE}/schaden/${token}`
}
```

Verbraucher: **QR-PDF** (`karten/actions.ts`), **Fahrzeugseiten-QR** (`fahrzeug/[id]/page.tsx`),
**NFC-Schreiben** (neu). Damit gilt strukturell: **Chip == Aufkleber == PDF**.

Ein Unit-Test nagelt den Host fest (`expect(...).toContain('app.claimondo.de')`) — der Bug kann
nicht zurückkommen. `token.test.ts` wird auf `app.claimondo.de` korrigiert.

### 4.3 NFC-Beschreiben (Web NFC)

**Ablauf (bewusst „scan-first"):**

```
1. Aufgeklebten QR der Karte scannen   → Token T          [bestehender SchadenkarteScanner]
2. Karte auflegen → NDEFReader.write() → URI-Record: buildSchadenkarteUrl(T)
3. Zurücklesen (NDEFReader.scan())     → URL == erwartet? + serialNumber
4. nfc_uid = serialNumber speichern    → „beschrieben" ist damit belegbar
```

**Warum Schritt 1 nicht verhandelbar ist:** Würde der Operator einen Token aus einer *Liste*
wählen und auf die gerade aufliegende Karte schreiben, könnte er Token X auf die Karte mit
Aufkleber Y schreiben. Diese Karte hätte **zwei Identitäten** — Auflegen → Fahrzeug A, Scannen →
Fahrzeug B. Ein stiller, kaum auffindbarer Datenfehler auf physischem Material. Indem die Karte
sich **selbst** identifiziert (ihr eigener Aufkleber), ist Chip == Aufdruck per Konstruktion.

**NDEF-Record-Typ = `url` (URI-Record), zwingend.** iPhones öffnen beim Auflegen nur
Well-Known-URI-Tags automatisch über das Betriebssystem. Ein Custom-MIME-Record würde auf iOS
**nicht** aufpoppen — die Karte wäre für die Hälfte der Gegner tot.

**Plattform-Realität (ehrlich):**

| | Android-Chrome | iPhone |
|---|---|---|
| Karte **beschreiben** (Web NFC) | ✅ | ❌ nicht möglich (Apple gibt Web NFC nicht frei) |
| Karte **antippen** (Gegner, Ernstfall) | ✅ | ✅ iOS liest NDEF-URI nativ übers OS, ohne App |

Nur der **Setup**-Schritt braucht Android. Der Ernstfall funktioniert auf beiden.
Kein Android-Gerät → **klare Meldung statt totem Button**, und die Karte funktioniert trotzdem
über den aufgeklebten QR. Kein „Karte unbrauchbar, weil falsches Handy".

`nfc_uid` bekommt damit endlich einen Zweck: Nachweis „dieser Token sitzt auf diesem physischen
Chip" + die Ops-Frage „welche Karten sind noch nicht beschrieben?" (`nfc_uid IS NULL`).
**Kein neues DDL** dafür — die Spalte existiert.

**Fehlerfälle (explizit, weil hier Plastik dranhängt):**

| Fall | Verhalten |
|---|---|
| `NDEFReader` nicht verfügbar (iPhone/Desktop) | Klare Meldung *„NFC-Beschreiben braucht ein Android-Gerät mit Chrome. Der aufgeklebte QR funktioniert unabhängig davon."* — kein toter Button |
| Schreiben schlägt fehl (Karte zu früh weg, Chip schreibgeschützt) | Fehler anzeigen, **`nfc_uid` NICHT setzen**, Wiederholung anbieten |
| Schreiben ok, **Zurücklesen schlägt fehl** | **`nfc_uid` NICHT setzen** + Warnung *„Karte konnte nicht verifiziert werden — bitte erneut auflegen."* Die Karte gilt als **nicht** beschrieben. Lieber einmal zu viel schreiben als eine unbestätigte Karte ausliefern. |
| Zurückgelesene URL ≠ erwartete URL | **Harter Fehler.** Die Karte trägt einen fremden Token → sie darf nicht in Umlauf. |
| Karte trägt schon einen anderen Token | Überschreiben nur nach expliziter Bestätigung |

### 4.4 Sperren · Entsperren · Entbinden

Neue Lib-Funktionen in `src/lib/schadenkarte/schadenkarte.ts` (neben `mint`/`binde`/`resolve`):

```ts
sperreSchadenkarte(db, { token|id, firmaId })      // → 'gesperrt', fahrzeug_id bleibt (Historie)
entsperreSchadenkarte(db, { token|id, firmaId })   // 'gesperrt' → 'frei', fahrzeug_id = NULL
entbindeSchadenkarte(db, { token|id, firmaId })    // 'gebunden' → 'frei', fahrzeug_id = NULL
```

* **Muster wie `bindeSchadenkarteAnFahrzeug`:** Admin-Client + **expliziter `firma_id`-Check**
  im Code (`row.firma_id !== params.firmaId → error`) + **Optimistic-Guard** auf den
  Ausgangsstatus (`.eq('status', alterStatus)`) gegen Races.
* **Result-Object**, kein throw (AGENTS.md §Server-Actions).
* `revalidatePath` auf `/flotte/karten`, `/flotte/fahrzeug/[id]` bzw.
  `/admin/vertrieb/firmen-flotte/[id]`.

**Semantik bei „schon im Zielzustand" (explizit, damit es nicht interpretiert wird):**

| Aufruf | Ausgangsstatus | Ergebnis |
|---|---|---|
| `sperre` | `bestellt` · `frei` · `gebunden` | → `gesperrt` |
| `sperre` | `gesperrt` | **no-op, `ok: true`** (idempotent — eine verlorene Karte zweimal zu sperren darf nicht scheitern) |
| `entsperre` | `gesperrt` | → `frei` |
| `entsperre` | jeder andere | **Fehler** („Karte ist nicht gesperrt") — nie stillschweigend etwas anderes tun |
| `entbinde` | `gebunden` | → `frei` |
| `entbinde` | jeder andere | **Fehler** („Karte ist nicht gebunden") |

`sperre` ist bewusst der einzige idempotente Pfad: er ist der Sicherheits-Notfall und muss unter
Doppelklick/Retry robust sein.

**UI:** `/flotte/karten` + Fahrzeug-Detail (meine Lane). Die Admin-Akte ruft dieselben Actions —
die UI dort wird mit der aktiven Detail-View-Lane abgestimmt (§6).

### 4.5 Zombie-Fix (das einzige DDL)

```sql
-- BEFORE DELETE auf vehicles: gebundene Karten freigeben, statt sie als Untote zurückzulassen.
-- Der FK (ON DELETE SET NULL) leert fahrzeug_id, lässt status aber auf 'gebunden' stehen ->
-- die Karte ist danach weder nutzbar (Gegner-Flow lehnt ab: kein_fahrzeug) noch neu bindbar
-- (binde verlangt bestellt|frei). Die physische Karte existiert weiter -> sie gehört auf 'frei'.
-- SECURITY DEFINER, weil schadenkarten RLS hat und der Löschende (z.B. ein Staff-User)
-- kein UPDATE-Recht darauf haben muss. search_path fixiert -> kein Schema-Hijack.
create or replace function public.schadenkarte_freigeben_bei_fahrzeug_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.schadenkarten
     set status = 'frei', fahrzeug_id = null, gebunden_am = null, gebunden_von = null
   where fahrzeug_id = old.id
     and status = 'gebunden';
  return old;
end $$;

create trigger trg_schadenkarte_freigeben_bei_fahrzeug_delete
  before delete on public.vehicles
  for each row execute function public.schadenkarte_freigeben_bei_fahrzeug_delete();
```

**Kein Sicherheitsloch geschlossen** (der Flow lehnte Zombies schon ab) — ein Integritätsdefekt.
Bestehende Zombies werden in derselben Migration einmalig bereinigt (idempotentes UPDATE auf
`status='gebunden' AND fahrzeug_id IS NULL` → `'frei'`).

### 4.6 ZB1-Scan legt ein Flotten-Fahrzeug an

```
ZB1-Foto  →  runZB1Ocr()  →  parseZB1Fields()            [existiert]
          →  REVIEW durch den Nutzer                      [NEU — UI]
          →  zb1ToVehicleSnapshot()                       [NEU — reiner Mapper]
          →  ensureVehicleFromFin({ fin, snapshot, db })  [existiert — Dedup via ON CONFLICT(fin)]
          →  flotten_fahrzeuge (Firma ↔ Fahrzeug)         [existiert]
```

**Neu ist wenig:** ein **reiner Mapper** (`ZB1ExtractedData` → `VehicleSnapshot`, ~20 Zeilen,
voll unit-testbar), eine **Server-Action**, eine **Upload-/Review-UI**.

**Die FIN dedupliziert.** Ist das Auto schon im System (aus einem früheren Claim), wird es
**dieselbe `vehicles`-Zeile** — kein Duplikat, egal ob es zuerst als Flottenwagen oder zuerst als
Schadenfall auftaucht. Genau die Normalisierung aus §2.4. Zusätzlich macht die FIN erst die
CardEntity-Anreicherung möglich (`cardentity_report`, `data_completeness_score`).

**Review ist Pflicht, kein Nice-to-have.** OCR verliest sich (Kennzeichen/FIN sind fehleranfällig).
Die erkannten Felder werden angezeigt und sind **korrigierbar**, bevor gespeichert wird.
**Nie blind übernehmen.**

**Halter-Verifikation (kein Block):**
Auf der ZB1 eines Firmenwagens steht der **Firmenname** im Halter-Feld. Weicht er vom Namen der
Firma ab, in deren Flotte gerade angelegt wird, zeigt der Review-Schritt eine **Warnung**:

> „Auf der ZB1 steht ein anderer Halter (»Müller GmbH«). Trotzdem übernehmen?"

**Bewusst Warnung statt hartem Block:** Bei Leasing/Finanzierung weicht der Eintrag legitim ab
(der Leasinggeber ist *Eigentümer*, die Firma *Halter* — `claims` modelliert das mit
`finanzierung_leasing` / `leasinggeber_name` bereits separat). Ein Block würde echte Fälle
abwürgen. Der Nutzen: jemand fügt versehentlich ein **fremdes** Fahrzeug in die Flotte ein →
wird gefangen.

**Kein FIN lesbar** → Rückfall auf den bestehenden Stub-Pfad (`createVehicleStub`) mit klarer
Warnung, dass ohne FIN keine Deduplizierung/Anreicherung möglich ist.

**`ownerId` bleibt ungesetzt** — siehe §3, Entscheidung 6: `current_owner_id → profiles` kann
keine Firma ausdrücken; ein gesetzter Owner (z.B. der Flottenmanager) wäre sachlich falsch und
erzeugte Ghost-Rows in `vehicle_ownership_history` (davor warnt `ensure-vehicle.ts` explizit).

**Wer darf scannen:** Flottenmanager (eigene Firma) **und** Staff/Vertrieb (cross-firma) — in
beiden Fällen gilt die Firma-Bindung des Ziel-Flottenkontos, nicht die des Scannenden. UI in
`/flotte` (diese Lane) und in der Admin-Akte (abgestimmt, §6).

---

## 5 · Nicht-Ziele

* **Kein `/admin/vertrieb/**`-UI-Bau** (Fahrzeug-Detail-View, Cockpit-Doppel-Einstieg-Cleanup) —
  kollidiert mit der aktiven Detail-View-Lane (§6). Die **Actions** werden so in die Lib gelegt,
  dass deren UI sie nur aufrufen muss.
* **Kein `ersetzt`-Status** (YAGNI, s. §4.1).
* **Kein Batch-/Hersteller-Encode** — Aaron hat Web-NFC-Selbstbeschreiben gewählt.
* **Kein Anti-Clone über `nfc_uid`.** Beim Auflegen liefert das OS nur die URL, nicht die
  Chip-UID → eine Klon-Erkennung zur Tap-Zeit ist mit einem reinen URI-Tag nicht möglich.
  `nfc_uid` ist Inventar/Nachweis, **kein** Sicherheitsmerkmal. (Ehrlich benennen statt
  Scheinsicherheit.)
* **Kein Umbau von `src/lib/ocr/*`** — nur ein **neuer** Mapper daneben.
* **Kein Umbau von `ensure-vehicle.ts`** — nur Aufruf.

---

## 6 · Koordination

| Fläche | Eigentümer |
|---|---|
| `src/lib/schadenkarte/**`, `/flotte/**`, `/schaden/**`, `src/lib/flotte/**` | **diese Lane** |
| `src/app/admin/vertrieb/**` (Karten-Sektion, Fahrzeug-Detail, Cockpit) | ⚠️ **aktive Detail-View-Lane `7572149e`** + Vertrieb-Lane → Marker, **nicht blind bauen** |
| `src/lib/ocr/**` | geteilt — nur **additiv** (neuer Mapper), Parser unberührt |
| `src/lib/vehicles/ensure-vehicle.ts` | geteilt — **nur aufrufen**, nicht editieren |

Übergabe-Kontext: `COORDINATION-AN-b0e963b6-firmen-flotte-fahrzeuge-nfc-uicleanup`.

---

## 7 · Datenmodell & DDL

**Genau eine Migration:** der Zombie-Trigger (§4.5) + einmalige Bereinigung bestehender Zombies.

**Keine neuen Spalten.** `nfc_uid`, `status`-CHECK, Partial-Unique existieren alle bereits.
DDL ausschließlich über das Supabase-Plugin (`apply_migration`), File exakt nach der **getrackten**
Version benannt (Regel 2).

---

## 8 · Sicherheit

* **Token-Entropie — Korrektur:** Der Karten-Token ist `SKT-` + 16 Zeichen aus einem 30er-Alphabet
  = **≈ 78 Bit** (`log2(30^16)`), erzeugt mit `crypto.getRandomValues`. **Nicht 128 Bit** — das
  war eine Verwechslung mit dem Airdrop-Token (`randomBytes(16)`). 78 Bit sind für eine
  netzwerkseitig nicht enumerierbare Capability weiterhin klar ausreichend; die Zahl gehört
  trotzdem korrekt ins Protokoll.
* **Besitz = Berechtigung.** `/schaden/[token]` ist bewusst öffentlich (der Unfallgegner hat kein
  Konto). Genau deshalb muss der Token **widerrufbar** sein → das ist der eigentliche Grund für
  „Sperren".
* **Warum der Token im Chip steht und nicht das Fahrzeug:** Eine Fahrzeug-ID wäre nicht
  widerrufbar (man kann ein Fahrzeug nicht „sperren") und nicht rotierbar; Umbinden erforderte
  physisches Neubeschreiben. Der Token ist ein rotierbares Geheimnis der **Karte** — Fahrzeug
  bleibt eine austauschbare DB-Verknüpfung.
* **Firma-Scoping** in **jeder** neuen Action (`row.firma_id !== params.firmaId → error`), analog
  zum bestehenden Bind.

---

## 9 · Tests & Verifikation

**Unit (pure, schnell):**
* `buildSchadenkarteUrl` — Host ist `app.claimondo.de` (**Regressionssperre für den 404-Bug**)
* Zustandsübergänge: sperren/entsperren/entbinden inkl. Guards (fremde Firma, falscher
  Ausgangsstatus, Race)
* `zb1ToVehicleSnapshot` — Mapping inkl. fehlender FIN, unplausibler Daten, Halter-Mismatch

**Integration:**
* Zombie-Trigger: Fahrzeug löschen → Karte `frei`, `fahrzeug_id` NULL

**Prod-Smoke (Regel 4), nach Deploy:**
`mint → binden → /schaden/<t> lädt → sperren → /schaden/<t> abgewiesen → entsperren → frei → neu binden`

⚠️ **Ehrliche Grenze:** **Web NFC lässt sich nicht per Playwright smoken** — es braucht echte
Hardware (Android + physische Karte). Automatisiert verifiziert werden URL-Bildung, DB-Schreibpfade
und die Zustandsübergänge; **das physische Auflegen bleibt ein manueller Check** (Aaron, Android).
Das wird im PR so benannt und **nicht** als „gesmoked" ausgegeben.

⚠️ **Gegner-Flow-Smoke bleibt gefährlich:** `VS_MELDUNG_ENABLED` ist auf prod scharf und **kein**
Versicherer-Empfänger dort ist intern (0 von 85). Wer den Flow bis zur Bestätigung durchspielt,
schreibt einen **echten** Versicherer an. → nur über einen temporären Test-Versicherer, s.
`COORDINATION-firmen-flotte-live-auf-prod-vs-meldung-scharf`.

---

## 10 · Lieferung

Ein Spec, **drei PRs** (jeder für sich mergebar, aufsteigende Abhängigkeit):

| PR | Inhalt | Warum getrennt |
|---|---|---|
| **1** | URL-Fix (`url.ts` + 3 Call-Sites + Test) · Zombie-Trigger · Sperren/Entsperren/Entbinden + `/flotte`-UI | **Dringend** — die gedruckten Karten sind heute tot, verlorene Karten nicht abschaltbar. Kein neues Browser-Feature, geringes Risiko. |
| **2** | NFC-Beschreiben (Web NFC, scan-first, `nfc_uid`) + „URL/QR anzeigen"-Affordanz | Neue Browser-API, Android-only, eigene Testfläche |
| **3** | ZB1-Fahrzeuganlage (Mapper + Action + Review-UI + Halter-Verifikation) | Eigenständiges Feature, berührt den Vehicle-Write-Path |

---

## 11 · Offene Punkte

* **Admin-UI** (Sperren/NFC/ZB1 in der Vertriebs-Akte) — abhängig von der Abstimmung mit `7572149e`.
* **Manueller Fahrzeug-Anlage-Pfad** (`FahrzeugForm` ohne FIN) bleibt bestehen. Ein optionales
  FIN-Feld dort würde die Dedup auch ohne ZB1 ermöglichen — **nicht** Teil dieses Specs,
  bewusst notiert.
* **3 verwaiste `Test-Flotte GmbH (Smoke)`-Firmen auf prod** (ohne `firmen_flotten_konten`, im
  Roster unsichtbar). Aufräumen entscheiden — diese Lane besitzt die Firmen-Flotte.
