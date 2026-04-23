# LexDrive → Claimondo Webhook — Entwickler-Handoff

**Version:** 2026-04-23
**Ansprechpartner Claimondo:** Aaron Sprafke (as.media.onlinesolution@gmail.com)
**Zweck:** Event-Pushes von LexDrive/Salesforce an Claimondo (Vollmachts-Bestätigung, Mandats-Events, VS-Reaktionen, Regulierungs-Status usw.).

---

## 1. Endpoints

| Umgebung | URL |
|---|---|
| Production | `https://<PROD-DOMAIN>/api/webhooks/lexdrive` |
| Staging    | `https://<STAGING-PREVIEW-URL>/api/webhooks/lexdrive` |

*(Exakte URLs werden separat per Mail nachgereicht.)*

Zusätzlich ein **separater** Endpoint nur für die Kanzlei-interne Vollmachts-Prüfung (akzeptiert/abgelehnt/nachfrage) — **nicht** für die Kunden-Unterschrift:

```
POST /api/lexdrive/vollmacht-confirm
```

---

## 2. Authentifizierung — HMAC-SHA256

### Shared-Secret

Ein einzelner 64-Zeichen-Hex-String, der auf beiden Seiten identisch hinterlegt wird. Wird separat per 1Password-Link übermittelt.

```
LEXDRIVE_WEBHOOK_SECRET = <über 1Password>
```

### Signatur berechnen

```
signature = HMAC_SHA256(secret = LEXDRIVE_WEBHOOK_SECRET,
                       message = rawRequestBody)
          → hex-encoded lowercase
```

**Wichtig:** über den **exakten Raw-Body** signieren, nicht über ein re-serialisiertes JSON. Wenn der Body `{"event_type":"vollmacht_bestaetigt", ...}` enthält, muss exakt diese Byte-Sequenz als Message in den HMAC gehen — sonst schlägt die serverseitige Verifikation fehl.

### Header

```
POST /api/webhooks/lexdrive HTTP/1.1
Content-Type: application/json
X-Lexdrive-Signature: sha256=<hex>
```

Der Prefix `sha256=` ist optional, wir akzeptieren beides. Alternativ — falls HMAC in der Salesforce-Umgebung Probleme macht — ist als Fallback auch ein statisches Shared-Secret im Header zugelassen:

```
X-Webhook-Secret: <LEXDRIVE_WEBHOOK_SECRET>
```
oder
```
Authorization: Bearer <LEXDRIVE_WEBHOOK_SECRET>
```

HMAC ist die bevorzugte Variante.

### Beispiel (Apex/Salesforce)

```apex
String body = JSON.serialize(payload);
Blob mac = Crypto.generateMac('HmacSHA256',
                              Blob.valueOf(body),
                              Blob.valueOf(secret));
String signature = EncodingUtil.convertToHex(mac);

HttpRequest req = new HttpRequest();
req.setEndpoint('https://<PROD-DOMAIN>/api/webhooks/lexdrive');
req.setMethod('POST');
req.setHeader('Content-Type', 'application/json');
req.setHeader('X-Lexdrive-Signature', 'sha256=' + signature);
req.setBody(body);
```

---

## 3. Payload — Basis-Schema

Alle Events nutzen dasselbe Envelope:

```json
{
  "event_type": "<siehe Event-Register unten>",
  "event_id":   "<eindeutige UUID pro Event, bei Retries IDENTISCH>",
  "fall_nr":    "<claimondo_fall_nr aus unserem ursprünglichen Mandat-Push>",
  "datum":      "2026-04-23T14:27:08.153Z"
}
```

Pro Event-Typ können zusätzliche Felder dazukommen (siehe Abschnitt 5).

### Fall-Korrelation

- **`fall_nr`** ist der einzige Correlation-Key.
- Es ist die **`claimondo_fall_nr`**, die wir beim ursprünglichen Mandat-Push als `claimondo_fall_nr` in eurem JSON-Body mitgeschickt haben (siehe Abschnitt 6).
- Bitte auf der Mandat-Row in Salesforce persistieren und in **jedem** zurückgesendeten Event mitschicken.
- Wir matchen serverseitig:
  `SELECT id FROM faelle WHERE fall_nummer = :fall_nr`

### Idempotenz

- `event_id` muss pro Event eindeutig sein (UUID v4 empfohlen).
- Bei Retries (Netzwerkfehler, Timeout) muss **die gleiche `event_id`** wiederverwendet werden — sonst verarbeiten wir das Event doppelt (Status-Transitions, WhatsApp-Templates, Reminders würden mehrfach feuern).
- Wir speichern jedes verarbeitete Event in `webhook_events` und skippen Dublikate mit HTTP 200 + `{skipped:true}`.

---

## 4. Responses

| Status | Body | Bedeutung |
|---|---|---|
| `200` | `{"ok":true, "fall_id":"uuid", "event_type":"...", "skipped":false}` | Verarbeitet |
| `200` | `{"ok":true, "skipped":true}` | Replay (bekannte `event_id`) oder Fall nicht gefunden — **kein** Retry nötig |
| `400` | `{"error":"Missing fields: event_type, event_id, fall_nr"}` | Pflichtfelder fehlen |
| `400` | `{"error":"Unknown event_type: xyz"}` | Event-Typ nicht im Register |
| `400` | `{"error":"Invalid JSON"}` | Body ist kein valides JSON |
| `401` | `{"error":"Unauthorized"}` | HMAC/Secret stimmt nicht — **kein** Retry, bitte Config prüfen |
| `500` | `{"error":"Processing failed", "detail":"..."}` | Interner Fehler — Retry erwünscht |

### Retry-Policy (empfohlen)

- Bei `5xx` oder Netzwerk-Fehler: 3 Versuche mit Exponential-Backoff, z. B. 30 s / 2 min / 10 min.
- Bei `4xx` **nicht** retryen — die `event_id` bleibt bei Retries identisch, damit wir deduplizieren können.

---

## 5. Event-Register

### Primär (für MVP)

**`vollmacht_bestaetigt`** — Kunde hat die Vollmacht per WhatsApp unterschrieben.

```json
{
  "event_type": "vollmacht_bestaetigt",
  "event_id":   "ld-evt-7f3a...",
  "fall_nr":    "KFZ-2026-000123",
  "datum":      "2026-04-23T14:27:08.153Z"
}
```

Wir setzen dann serverseitig `vollmacht_unterschrieben_am`, schalten den Besichtigungs-Termin auf `bestaetigt`, generieren Reminders.

---

**`mandatsnummer_vergeben`** — Salesforce hat eine offizielle Mandats-Nummer vergeben (falls abweichend vom initialen Push-Response).

```json
{
  "event_type":   "mandatsnummer_vergeben",
  "event_id":     "...",
  "fall_nr":      "KFZ-2026-000123",
  "mandats_nr":   "0019V00001c5IPOQA2"
}
```

---

### Erweiterte Events (später zuschaltbar)

Alle weiteren Events, die unser Processor bereits kennt:

```
akte_eingegangen_bestaetigt
as_versendet
mahnung_versendet
vs_kuerzt                 → Pflichtfeld vs_kuerzungs_typ
vs_reguliert_voll
vs_fristverlaengerung
vs_ablehnung
vs_nachbesichtigung
vs_nachbesichtigung_angefordert
vs_nachbesichtigung_ergebnis
vs_quotiert
vs_quote_akzeptiert
ruege_1_gesendet          ruege_1_anerkannt
ruege_2_gesendet          ruege_2_anerkannt          ruege_abgelehnt
klage_eingereicht
regulierung_angekuendigt
zahlung_eingegangen
auszahlung_split_eingegangen
technische_stellungnahme_benoetigt
vs_eskalation_kontakt_ergebnis
kb_filmcheck_bestanden
kunde_nachbesichtigung_termine_eingereicht
sv_stellungnahme_eingereicht
sv_konfrontation_anfrage_versendet
sv_konfrontation_bestaetigt
sv_konfrontation_abgelehnt
fall_geschlossen
```

### Ergänzende Payload-Felder pro Event

Häufig genutzte Felder (optional, je nach Event):

| Feld | Typ | Beispiel | Events |
|---|---|---|---|
| `betrag` | number (EUR) | `3450.00` | `vs_reguliert_voll`, `zahlung_eingegangen` |
| `kuerzungs_betrag` | number | `890.00` | `vs_kuerzt` |
| `anerkannt_betrag` | number | `2560.00` | `vs_kuerzt` |
| `vs_kuerzungs_typ` | `"technisch" \| "argumentativ" \| "gemischt"` | — | **`vs_kuerzt` (Pflicht)** |
| `grund` | string | `"Schadenhöhe nicht plausibel"` | `vs_kuerzt`, `vs_ablehnung`, `fall_geschlossen` |
| `frist_bis` | ISO-Date | `2026-05-10` | `vs_fristverlaengerung` |
| `zahlungsweg` | string | `"Überweisung"` | `zahlung_eingegangen` |
| `beschreibung` | string | freier Text | beliebig — landet als Timeline-Beschreibung |

Bei `vs_kuerzt` wichtig: **ohne `vs_kuerzungs_typ` lehnen wir das Event mit 400 ab**, da der nachgelagerte Workflow (Technische Stellungnahme vs. Rüge 1) davon abhängt.

---

## 6. Kontext — der ausgehende Mandat-Push von Claimondo

Damit ihr wisst, woher die `claimondo_fall_nr` kommt:

Wir POSTen bei Fall-Anlage (Service-Typ „komplett") an euren Salesforce-Apex-REST-Endpoint `services/apexrest/mandate` (siehe separate Doku `docs/integrations/kanzlei.md`):

```json
{
  "claimondo_fall_nr": "KFZ-2026-000123",
  "kunde": {
    "anrede": "Herr", "vorname": "...", "nachname": "...",
    "strasse": "...", "plz": "...", "stadt": "...",
    "email": "...", "telefon": "+49...", "wa_faehig": true
  },
  "firma": false,
  "vorsteuerabzugsberechtigt": false,
  "fahrzeug": { "kennzeichen": "..." },
  "meta": {
    "idempotency_key": "KFZ-2026-000123-mandat-<uuid>",
    "created_at": "2026-04-23T14:27:08.153Z"
  }
}
```

Bitte `claimondo_fall_nr` **auf eurer Mandat-Row in Salesforce persistieren** — in jedem Rück-Event als `fall_nr` wieder mitschicken.

Erwartete Response:
- `201 Created` + `{"mandat_id":"<SF-ID>"}` bei Erstanlage
- `200 OK` bei Duplikat (gleicher `claimondo_fall_nr`)

---

## 7. Zweiter Endpoint — Vollmachts-Prüfung durch die Kanzlei

**Nicht** für Kunden-Unterschrift, sondern für das **interne Review-Ergebnis** eurer Kanzlei nach Erhalt der Vollmacht:

```
POST /api/lexdrive/vollmacht-confirm
```

Auth: identisch (HMAC oder Shared-Secret-Header).

Body:
```json
{
  "fall_nr":     "KFZ-2026-000123",
  "status":      "akzeptiert",
  "geprueft_am": "2026-04-23T14:27:08.153Z",
  "geprueft_von": "Vorname Nachname der prüfenden Person",
  "begruendung": "optional, bei abgelehnt/nachfrage empfohlen"
}
```

`status` ∈ `"akzeptiert" | "abgelehnt" | "nachfrage"`.

Bei `abgelehnt` oder `nachfrage` erzeugen wir einen Dringlich-Task für den Kundenbetreuer.

---

## 8. Test-Checkliste (Roundtrip Staging)

1. Wir legen einen Test-Fall mit `service_typ='komplett'` an.
2. Unser Code pusht Mandat an euren Sandbox-Endpoint `ruby-momentum-209--partial2.sandbox.my.salesforce.com`.
3. Ihr bestätigt Receipt mit `201 + mandat_id`.
4. Ihr simuliert die Kunden-Vollmachts-Signatur und feuert
   ```
   POST https://<STAGING>/api/webhooks/lexdrive
   event_type = "vollmacht_bestaetigt"
   fall_nr    = "<die claimondo_fall_nr aus Schritt 2>"
   ```
5. Wir verifizieren in der Fallakte:
   - `faelle.vollmacht_unterschrieben_am` gesetzt
   - Timeline-Eintrag „LexDrive: vollmacht_bestaetigt"
   - `webhook_events.status='processed'`

---

## 9. Kontakt bei Fragen

- Tech Lead Claimondo: Aaron Sprafke — as.media.onlinesolution@gmail.com
- Bei 401-Responses zuerst Secret vergleichen (länge: 64 Hex-Zeichen) und sicherstellen, dass HMAC über den **Raw-Body** läuft (kein Re-Serialize / keine Whitespace-Normalisierung).
- Bei 400-Responses Payload gegen Abschnitt 3 + 5 prüfen.
