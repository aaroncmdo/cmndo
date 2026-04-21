# Kanzlei-Integration — Contract v0.1 (Draft)

Dieses Dokument beschreibt die bidirektionale API-Schnittstelle zwischen **Claimondo** und der Kanzlei-Software (LexDrive / Salesforce-intern). Es ist die Verhandlungsbasis für das Erst-Meeting mit dem Kanzlei-Entwickler.

**Stand:** 2026-04-21 (Draft, vor erstem Meeting)
**Status:** nur Schritt 1 + 2 (Mandat anlegen + Vollmacht bestätigen). Alle weiteren Events folgen nach Go-Live.

---

## 1. Flow-Sequenz (MVP)

```
┌─────────────┐                           ┌──────────┐
│  Claimondo  │                           │ Kanzlei  │
└─────────────┘                           └──────────┘
       │                                        │
       │  (Kunde signiert SA im FlowLink)       │
       │                                        │
  (1)  │ POST /mandate                         │
       ├───────────────────────────────────────▶│
       │        HMAC-SHA256 signed              │
       │                                        │
  (2)  │        201 { mandat_id }              │
       │◀───────────────────────────────────────┤
       │                                        │
       │                          (Kanzlei legt │
       │                          Mandat in SF  │
       │                          an, schickt   │
       │                          Vollmacht per │
       │                          WA an Kunden) │
       │                                        │
       │                        (Kunde signiert │
       │                         Vollmacht)     │
       │                                        │
  (3)  │ POST /api/webhooks/lexdrive           │
       │◀───────────────────────────────────────┤
       │  { event_type: "vollmacht_bestaetigt" }│
       │        HMAC-SHA256 signed              │
       │                                        │
  (4)  │        200 { ok: true }               │
       ├───────────────────────────────────────▶│
       │                                        │
   (Claimondo triggert confirmVollmacht:         │
    Termin wird verbindlich, Reminder + ICS)    │
```

---

## 2. Endpoint (1): Outbound `POST /mandate`

**Von:** Claimondo → Kanzlei
**Trigger:** Kunde signiert SA im FlowLink (service_typ = `komplett`)
**URL:** `${KANZLEI_API_URL}/mandate`
**Auth:** HMAC-SHA256 Header (siehe §4)

### Request-Header

| Header | Wert | Beschreibung |
|---|---|---|
| `Content-Type` | `application/json` | — |
| `X-Claimondo-Signature` | `sha256=<hex>` | HMAC des Raw-Body mit Shared-Secret |
| `X-Claimondo-Event-Id` | String | Idempotency-Key (UUIDv4). Bei Retry denselben Wert senden. |

### Request-Body

```json
{
  "claimondo_fall_nr": "CLM-20260421-007",
  "kunde": {
    "anrede": "Herr",
    "vorname": "Max",
    "nachname": "Mustermann",
    "strasse": "Musterstraße 12",
    "plz": "10115",
    "stadt": "Berlin",
    "email": "max.mustermann@example.de"
  },
  "firma": false,
  "vorsteuerabzugsberechtigt": false,
  "fahrzeug": {
    "kennzeichen": "B-MM 1234"
  },
  "meta": {
    "idempotency_key": "CLM-20260421-007-mandat-a3f8c2...",
    "created_at": "2026-04-21T13:47:22.103Z"
  }
}
```

### Pflichtfeld-Semantik

| Feld | Typ | Pflicht | Bemerkung |
|---|---|---|---|
| `claimondo_fall_nr` | string | ✅ | Canonical-Key. MUSS in allen Rück-Events (Webhooks) gespiegelt werden. |
| `kunde.anrede` | `"Herr" \| "Frau" \| "Divers" \| null` | optional | Nicht immer erfasst |
| `kunde.vorname`, `kunde.nachname` | string | ✅ | — |
| `kunde.strasse`, `kunde.plz`, `kunde.stadt` | string\|null | optional | Wenn noch nicht im Lead erfasst |
| `kunde.email` | string\|null | optional | Für WA-Fallback |
| `firma` | bool | ✅ | Wenn `true`: Kunde ist Gewerbe |
| `vorsteuerabzugsberechtigt` | bool | ✅ | Steuerrechtlich relevant für Regulierung |
| `fahrzeug.kennzeichen` | string\|null | optional | Falls noch kein ZB1-OCR gelaufen |

### Erwartete Response (Success)

```json
{
  "mandat_id": "KZ-2026-00417"
}
```

- **HTTP 201** (Created) — Kanzlei hat Mandat angelegt, versendet nun Vollmacht an Kunden
- **HTTP 200** (OK) — idempotent: Mandat existiert bereits (gleicher `X-Claimondo-Event-Id`) → idempotency_key gibt dieselbe `mandat_id` zurück
- Claimondo speichert `mandat_id` als `faelle.mandatsnummer`

### Fehler-Responses

| HTTP | Bedeutung | Claimondo-Verhalten |
|---|---|---|
| 400 | Payload invalid | Timeline-Warnung, KB benachrichtigt — manuell nachziehen |
| 401 | HMAC falsch | Alarmieren (Monitoring), Secret-Rotation prüfen |
| 409 | Duplicate ohne idempotency_key | Timeline-Warnung |
| 5xx | Transient | Retry 3× mit exponential backoff (1 min → 5 min → 30 min) |

### Restliche Fall-Daten

**Bewusst NICHT im Payload** — Kanzlei bekommt diese aus dem **Kanzlei-Paket** (Email mit PDF-Bundle), das Claimondo separat sendet:
Schadenshergang · Gegner-Daten · VS-Policennr · Polizei-Az · Gutachten · Fotos · Unfallskizze · etc.

---

## 3. Endpoint (2): Inbound `POST /api/webhooks/lexdrive`

**Von:** Kanzlei → Claimondo
**URL:** `https://cmndo.vercel.app/api/webhooks/lexdrive` (Prod) / `https://cmndo-staging.vercel.app/api/webhooks/lexdrive` (Staging)
**Auth:** HMAC-SHA256 Header (siehe §4)

### Request-Header

| Header | Wert | Beschreibung |
|---|---|---|
| `Content-Type` | `application/json` | — |
| `X-Lexdrive-Signature` | `sha256=<hex>` | HMAC des Raw-Body |

### MVP-Event: `vollmacht_bestaetigt`

```json
{
  "event_id": "evt_K2R8JX9W",
  "event_type": "vollmacht_bestaetigt",
  "fall_nr": "CLM-20260421-007",
  "mandat_id": "KZ-2026-00417",
  "signiert_am": "2026-04-23T09:15:00.000Z",
  "payload": {
    "signatur_methode": "whatsapp_tan",
    "vollmacht_pdf_url": "https://kanzlei.example/vollmacht/xyz.pdf"
  }
}
```

### Pflichtfelder

| Feld | Typ | Pflicht | Bemerkung |
|---|---|---|---|
| `event_id` | string | ✅ | Idempotency. Claimondo dedupliziert darauf. |
| `event_type` | string | ✅ | `"vollmacht_bestaetigt"` (andere Events später) |
| `fall_nr` | string | ✅ | Unser Canonical-Key aus dem Outbound |
| `mandat_id` | string | optional | Kanzlei-ID — nützlich für Querverweis |
| `signiert_am` | ISO-Timestamp | ✅ | Wann hat der Kunde signiert |
| `payload.vollmacht_pdf_url` | URL | optional | Signierte Vollmacht als PDF (für Fallakte) |

### Response

```json
{ "ok": true, "fall_id": "a93f947f-...", "event_type": "vollmacht_bestaetigt", "skipped": false }
```

- **skipped=true** wenn `event_id` bereits verarbeitet wurde (duplicate)

### Claimondo-Verhalten bei Empfang

1. HMAC-Signatur prüfen → 401 wenn ungültig
2. `event_id` gegen `webhook_events`-Tabelle prüfen → 200 + `skipped=true` bei Duplicate
3. Fall über `fall_nr` finden → 400 wenn nicht gefunden
4. `confirmVollmacht(fallId)` ausführen:
   - Termin-Status: `reserviert` → `bestaetigt`
   - `gutachter_termine.final_verbindlich_ab` gesetzt
   - `faelle.vollmacht_signiert_am` + `vollmacht_datum` gesetzt
   - Reminder-Cron für SV + Kunde generiert (T-24h, T-1h ICS)
5. Timeline-Eintrag + KB-Mitteilung
6. 200 OK zurück

---

## 4. HMAC-Authentifizierung (beide Richtungen)

### Prinzip

Jeder Request wird mit einem **Shared-Secret** signiert. Empfänger berechnet dieselbe Signatur aus dem Raw-Body und vergleicht. Verhindert Manipulation + Fälschung.

### Secrets (getrennt pro Richtung!)

| Env-Variable | Wert | Wo gesetzt |
|---|---|---|
| `KANZLEI_API_URL` | `https://api.kanzlei.example/v1` | Claimondo (Outbound-Target) |
| `KANZLEI_API_SECRET` | 64-char Hex, generiert von Kanzlei | Claimondo (Outbound-HMAC) |
| `KANZLEI_API_ENABLED` | `"true"` | Claimondo (Feature-Flag) |
| `LEXDRIVE_WEBHOOK_SECRET` | 64-char Hex, generiert von Claimondo | Kanzlei (Inbound-HMAC-Verify) |

Generierung: `openssl rand -hex 32` → 64 Zeichen Hex-String.

### Signier-Algorithmus

```javascript
// Sender-Seite (Node.js)
import { createHmac } from 'crypto'

const body = JSON.stringify(payload) // WICHTIG: exakt so verwenden, KEIN Re-Serialize
const signature = createHmac('sha256', SHARED_SECRET).update(body).digest('hex')

// Request:
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Claimondo-Signature': `sha256=${signature}`, // oder X-Lexdrive-Signature
  },
  body, // wichtig: raw string, nicht erneut JSON.stringify(payload)
})
```

```javascript
// Empfänger-Seite (verify)
const rawBody = await req.text() // wichtig: raw, vor JSON.parse
const provided = req.headers['x-claimondo-signature']?.replace('sha256=', '')
const computed = createHmac('sha256', SHARED_SECRET).update(rawBody).digest('hex')

// Timing-safe compare gegen Timing-Attacks
const ok = crypto.timingSafeEqual(
  Buffer.from(provided, 'hex'),
  Buffer.from(computed, 'hex'),
)
```

**Fallstricke:**
- Raw-Body signieren, NICHT das geparste Objekt neu serialisieren — ein extra Space kippt die Signatur
- Case-sensitiv: `sha256=` Präfix muss exakt passen
- Timing-safe Compare benutzen (normaler String-Vergleich ist angreifbar)

### Staging vs. Prod

Getrennte Secrets pro Umgebung. Nie Prod-Secret in Staging committen.

---

## 5. Idempotenz

Beide Seiten senden einen `event_id` / `idempotency_key` pro Request. Bei Wiederholung (z. B. Netzwerk-Timeout auf Sender-Seite → Retry) verarbeitet der Empfänger den Request **nicht** erneut, sondern gibt die ursprüngliche Response zurück.

**Claimondo-seitig** implementiert in `process-event.ts`: `webhook_events.event_id` UNIQUE-Constraint → Duplicate → `skipped: true`.

**Kanzlei-seitig** erwartet: `X-Claimondo-Event-Id`-Header persistieren → bei Wiederholung dieselbe `mandat_id` zurück.

---

## 6. Meeting-Checkliste

Diese Punkte mit dem Kanzlei-Dev klären:

- [ ] **Staging-URL** für `POST /mandate` — URL + Test-Credentials
- [ ] **Shared-Secrets austauschen** (Staging + Prod separat, über sicheren Kanal — 1Password/Bitwarden)
- [ ] **API-Versionierung** — Header `X-Api-Version: 1` oder URL-Segment `/v1/mandate`?
- [ ] **Idempotenz auf Kanzlei-Seite** — persistieren sie `X-Claimondo-Event-Id`?
- [ ] **Retry-Policy** — wenn unser Webhook 500 gibt, wie oft und in welchem Abstand retryen sie?
- [ ] **Kanzlei-seitiger Vollmacht-Timeout** — wann schicken sie `mandat_storniert` (Event noch nicht im Katalog, muss ergänzt werden) wenn Kunde nicht signiert?
- [ ] **PDF-URLs Zugriff** — sind die `vollmacht_pdf_url` in der Webhook-Response dauerhaft abrufbar oder signed mit TTL?
- [ ] **DSGVO / Datenminimierung** — reicht der Minimal-Payload (oben §2)?
- [ ] **Nächste Events** nach MVP — `mandatsnummer_vergeben`, `akte_eingegangen_bestaetigt`, `as_versendet`, `vs_kuerzt` etc. (37 Events im Katalog, siehe `src/lib/lexdrive/process-event.ts`)

---

## 7. Bereits implementiert (Claimondo-seitig)

- [x] Inbound-Webhook `/api/webhooks/lexdrive` mit HMAC-Verify + Idempotenz
- [x] 37 Event-Types im Katalog (`VALID_LEXDRIVE_EVENTS`)
- [x] Handler `vollmacht_bestaetigt` → `confirmVollmacht(fallId)` (PR #xxx, 2026-04-21)
- [x] Outbound-Push `pushMandatToKanzlei` (Feature-Flag `KANZLEI_API_ENABLED=true`, PR #xxx)
- [x] Trigger in `signSAandCreateFall` nach Fall-Insert (fire-and-forget)
- [x] `confirmVollmacht`-Handler setzt Termin auf `bestaetigt`, `final_verbindlich_ab`, generiert Reminders, schreibt Timeline

## 8. Offen (auf Kanzlei-Seite oder Gemeinsam)

- [ ] Kanzlei-Endpoint `POST /mandate` implementieren
- [ ] Kanzlei triggert Webhook `vollmacht_bestaetigt` nach Kundensignatur
- [ ] `mandat_storniert`-Event-Type gemeinsam spezifizieren (wenn Kunde ablehnt / Timeout)
- [ ] Monitoring: HMAC-Failures alarmieren auf beiden Seiten

---

## 9. Salesforce-spezifische Umsetzungs-Notizen (für den Kanzlei-Dev)

Die Schnittstelle ist **plain REST + JSON + HMAC** — am Contract ändert Salesforce nichts. Aber die Kanzlei muss das SF-typische Plumbing drumherum bauen. Diese Sektion sammelt alles Salesforce-spezifische an einer Stelle.

**Kern-Aussage:** Nicht Salesforce-Outbound-Messages verwenden (kein HMAC-Header-Support, kein Retry, XML statt JSON). Stattdessen Apex-REST + Apex-Callouts.

### 9.1 Inbound-Endpoint `POST /mandate` bauen

Drei Bauvarianten — eine wählen:

| Variante | Wie | Aufwand | Passt wenn |
|---|---|---|---|
| **Apex REST Service** | `@RestResource(urlMapping='/mandate')` + `@HttpPost`-Methode | Klein (1-2 Tage) | Interner API-Traffic überschaubar, keine Middleware vorhanden |
| **API-Gateway + Apex-Callout** | Nginx / AWS API-Gateway empfängt, validiert HMAC, pusht via REST in SF | Mittel | Bereits Gateway vorhanden, SF-Governor-Limits kritisch |
| **MuleSoft / Boomi / iPaaS** | iPaaS macht HMAC-Verify + SF-Insert | Groß | Enterprise-iPaaS-Setup schon da |

Apex-REST ist der Standard-Weg.

**Must-haves bei Apex-REST:**

- Raw-Body lesen über `RestContext.request.requestBody.toString()` — **nicht** das bereits geparste JSON-Objekt neu serialisieren, sonst kippt die HMAC-Signatur durch ein Leerzeichen oder andere Key-Reihenfolge
- Idempotency-Key (`X-Claimondo-Event-Id`) in Custom-Object `Integration_Idempotency__c` persistieren mit Unique-Constraint. Bei Duplicate: gespeicherte `mandat_id` zurückgeben, HTTP 200, **kein** Re-Insert
- HTTP 401 bei HMAC-Mismatch
- Response-Body als JSON mit `{ "mandat_id": "KZ-2026-00417" }`

**Apex-HMAC-Hex-Snippet (SHA256, Hex-Output):**

```apex
String body = RestContext.request.requestBody.toString();
String secret = getSecretFromNamedCredentialOrCustomMetadata();

Blob mac = Crypto.generateMac('HmacSHA256', Blob.valueOf(body), Blob.valueOf(secret));
String signatureHex = EncodingUtil.convertToHex(mac);

String providedHeader = RestContext.request.headers.get('X-Claimondo-Signature');
String provided = providedHeader != null ? providedHeader.replace('sha256=', '') : null;

if (provided == null || !constantTimeEquals(signatureHex, provided)) {
    RestContext.response.statusCode = 401;
    RestContext.response.responseBody = Blob.valueOf('{"error":"invalid_signature"}');
    return;
}

// constantTimeEquals vermeidet Timing-Attacks. Einfache Apex-Implementation:
private static Boolean constantTimeEquals(String a, String b) {
    if (a == null || b == null || a.length() != b.length()) return false;
    Integer diff = 0;
    for (Integer i = 0; i < a.length(); i++) {
        diff |= a.charAt(i) ^ b.charAt(i);
    }
    return diff == 0;
}
```

**Idempotency-Check in Apex:**

```apex
String eventId = RestContext.request.headers.get('X-Claimondo-Event-Id');
List<Integration_Idempotency__c> existing = [
    SELECT Id, Response_Body__c
    FROM Integration_Idempotency__c
    WHERE Event_Id__c = :eventId
    LIMIT 1
];
if (!existing.isEmpty()) {
    RestContext.response.statusCode = 200;
    RestContext.response.responseBody = Blob.valueOf(existing[0].Response_Body__c);
    return;
}
// ... neuen Mandat anlegen ...
insert new Integration_Idempotency__c(
    Event_Id__c = eventId,
    Response_Body__c = JSON.serialize(responsePayload)
);
```

### 9.2 Outbound-Webhook triggern (SF → Claimondo)

Zwei Varianten:

| Variante | Wann greifen | Wie |
|---|---|---|
| **Platform-Event + Apex-Trigger** | Wenn `Vollmacht__c.Status` auf `bestaetigt` wechselt | Trigger ruft async `Queueable` mit `HttpCallout` |
| **Flow + Apex-Invocable-Action** | Low-Code-Variante via Record-Triggered-Flow | Dieselbe Callout-Logik, nur Flow-Entry |

**Wichtig: Apex-Callouts aus Triggers sind synchron NICHT erlaubt.** Salesforce wirft `CalloutException: You have uncommitted work pending`. Praktischer Ausweg: Trigger schreibt einen Row in `Integration_Outbound_Queue__c`, ein `Queueable`-Job liest die Queue und macht die Callouts async.

**Muss drin sein:**

- **Remote-Site-Setting** anlegen: Setup → Security → Remote Site Settings → Claimondo-Webhook-URL (Staging + Prod jeweils eigene Einträge)
- HMAC-Signatur im Header `X-Lexdrive-Signature: sha256=<hex>`
- HTTP-Timeout auf 120s (Default 10s ist zu niedrig bei Cold-Start)
- Retry-Logic bei 5xx: 3× mit Backoff (Queueable chained, nicht inline sleepen — SF hat kein `sleep()`)
- Callout-Log in `Integration_Webhook_Log__c` für Audit

**Apex-Outbound-Snippet:**

```apex
public class VollmachtWebhookCallout implements Queueable, Database.AllowsCallouts {
    private Id mandatId;
    private Integer attempt;

    public VollmachtWebhookCallout(Id mandatId, Integer attempt) {
        this.mandatId = mandatId;
        this.attempt = attempt;
    }

    public void execute(QueueableContext ctx) {
        Mandat__c m = [SELECT Claimondo_Fall_Nr__c, Mandat_Id__c, Vollmacht_Signiert_Am__c
                      FROM Mandat__c WHERE Id = :mandatId];
        Map<String, Object> payload = new Map<String, Object>{
            'event_id' => 'evt_' + GuidUtil.generate(),
            'event_type' => 'vollmacht_bestaetigt',
            'fall_nr' => m.Claimondo_Fall_Nr__c,
            'mandat_id' => m.Mandat_Id__c,
            'signiert_am' => m.Vollmacht_Signiert_Am__c
        };
        String body = JSON.serialize(payload);
        String secret = getLexdriveWebhookSecret();
        Blob mac = Crypto.generateMac('HmacSHA256', Blob.valueOf(body), Blob.valueOf(secret));
        String signatureHex = EncodingUtil.convertToHex(mac);

        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Claimondo_Webhook/api/webhooks/lexdrive');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-Lexdrive-Signature', 'sha256=' + signatureHex);
        req.setBody(body);
        req.setTimeout(120000);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() >= 500 && attempt < 3) {
            // Retry mit Backoff via System.enqueueJob, Minimum-Delay simulieren
            System.enqueueJob(new VollmachtWebhookCallout(mandatId, attempt + 1));
        }
        // Log
        insert new Integration_Webhook_Log__c(
            Mandat__c = mandatId,
            Status_Code__c = res.getStatusCode(),
            Attempt__c = attempt,
            Response_Body__c = res.getBody().left(32000)
        );
    }
}
```

Der Endpunkt `callout:Claimondo_Webhook` ist eine **Named Credential** — dadurch ist die URL konfigurierbar (Staging/Prod) ohne Code-Change.

### 9.3 SF-Custom-Objects (Minimum-Datenmodell)

| Object | Felder (Auswahl) | Zweck |
|---|---|---|
| `Mandat__c` | `Claimondo_Fall_Nr__c` (**External ID, Unique**), `Mandat_Id__c`, `Vollmacht_Signiert_Am__c`, `Status__c`, `Kunde__c` (Lookup→Account) | Zentrale Mandat-Row — ein Record pro Claimondo-Fall |
| `Integration_Idempotency__c` | `Event_Id__c` (Unique), `Response_Body__c`, `Created_Date` (→ Scheduled-Job cleant >30 Tage alte) | Deduplizierung von Inbound-Webhooks |
| `Integration_Webhook_Log__c` | `Mandat__c` (Lookup), `Direction__c` (in/out), `Event_Type__c`, `Status_Code__c`, `Request_Body__c`, `Response_Body__c`, `Attempt__c`, `Signature_Valid__c` | Audit-Trail für beide Richtungen — debugging-Gold bei Support-Anfragen |

`Claimondo_Fall_Nr__c` als **External ID** zu kennzeichnen ist wichtig — dadurch können sie Upserts auf `Mandat__c` via Claimondo-Fall-Nr statt SF-Id machen.

### 9.4 Secret-Management in SF

**Niemals Secrets in Apex-Code**. SF bietet zwei saubere Wege:

- **Named Credentials + External Credentials** (moderner Weg, SF-Winter-23+) — Secrets sind im Platform verschlüsselt gespeichert, per `callout:NamedCred` in Apex adressiert. Rotation ohne Code-Deploy möglich.
- **Custom Metadata Types** — einfacher, aber Secret ist read-only für Admins sichtbar. Nur wenn External Credentials nicht verfügbar sind.

**Vermeiden:**
- `System.debug('Secret: ' + secret);` — Debug-Logs sind für alle SF-User mit Debug-Rechten readable
- Secrets in Custom Settings — read-only via Profil-Permissions, aber nicht verschlüsselt in der DB

### 9.5 Governor-Limits beachten

Salesforce-typische Fallen:

| Limit | Wert | Relevanz für Integration |
|---|---|---|
| Callouts pro Transaction | 100 | Bei Batch-Mandat-Anlage in einem Flow: async machen |
| Callout-Timeout | 120s | Wir geben Cold-Start-Spielraum, reicht dicke |
| Max Heap Size (sync) | 6 MB | Webhook-Body > 2 MB → problematisch. Unsere sind < 5 KB, OK |
| Inbound REST-Request-Size | 6 MB | Selbe Grenze andersrum |
| Future-Calls pro Transaction | 50 | Wenn Trigger mehrere Fälle batched anlegt: Queueable chained statt future-spray |

### 9.6 Testing

- **Sandbox** zeigt auf Claimondo-Staging-URL (`https://cmndo-staging.vercel.app/api/webhooks/lexdrive`)
- **Apex-Tests** mit `HttpCalloutMock` für Outbound, `Test.startTest()`/`Test.stopTest()` für Queueable-Assertions
- **End-to-End-Smoke-Test** durchlaufen:
  1. Claimondo-Staging sendet `POST /mandate` → SF-Sandbox legt `Mandat__c` an
  2. Manuell in SF-Sandbox `Vollmacht__c.Status = bestaetigt` setzen
  3. Prüfen: SF-Queueable feuert Webhook an Claimondo-Staging
  4. Prüfen: Claimondo-Staging-Fall hat Termin-Status `bestaetigt` + Reminder generiert

### 9.7 Wahrscheinliche Fragen des Kanzlei-Devs

| Frage | Antwort |
|---|---|
| „Muss ich `Lead` oder `Account` in SF anlegen?" | Kanzlei-Daten-Modell-Problem, nicht vom Contract vorgegeben — meistens Account + Contact für den Kunden, Custom-Object `Mandat__c` für das Mandat selbst |
| „Wie lange soll `mandat_id` gültig sein?" | Permanent, solange der Mandat existiert. Nie ändern nach Erst-Vergabe |
| „Können wir Salesforce-Outbound-Messages statt Apex-Callout nutzen?" | **Nein.** Outbound-Messages sind XML-only, kein HMAC-Header, kein konfigurierbarer Retry. Wir brauchen JSON + HMAC |
| „Welche SF-API-Version reicht?" | ≥ v50 (Platform Events + Queueable + Named Credentials vorausgesetzt) |
| „Was wenn SF-Callout timeout't?" | Queueable retry'd. Unser Webhook ist idempotent via `event_id` — Doppelsends werden auf unserer Seite deduped |
| „Brauche ich eine dedizierte SF-Lizenz für den Integrationsuser?" | Ja — Integration-User mit „API Enabled" + „Apex REST Services" Profil-Permission, getrennt vom normalen User-Login |
