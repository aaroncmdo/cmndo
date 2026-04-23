# Klärung: Vollmacht-Bestätigung — Outbound-Endpoints

**An:** Aaron Sprafke (Claimondo)
**Von:** LexDrive (Kanzlei, Salesforce-Seite)
**Datum:** 2026-04-23
**Betrifft:** ausschließlich den Outbound-Flow für die Vollmacht-Bestätigung — alles andere (Mandat-Inbound, weitere Events) bitte außen vor lassen.

---

## 1. Ausgangslage

In eurem Handoff-Dokument **„LexDrive → Claimondo Webhook — Entwickler-Handoff (Version 2026-04-23)"** finden wir im Kontext Vollmacht-Bestätigung **zwei** Endpoints:

### Call A — `/api/webhooks/lexdrive` (Haupt-Webhook)

Erscheint in:

- §1 (Endpoints) als Haupt-URL
- §5 (Event-Register) mit dem MVP-Event `vollmacht_bestaetigt`
- §8 (Test-Checkliste) als Ziel für die Kunden-Signatur-Simulation

Payload gemäß §3 + §5:

```json
{
  "event_type": "vollmacht_bestaetigt",
  "event_id":   "ld-evt-<uuid>",
  "fall_nr":    "<claimondo_fall_nr>",
  "datum":      "2026-04-23T14:27:08.153Z"
}
```

### Call B — `/api/lexdrive/vollmacht-confirm`

Erscheint in:

- §1 als Nebensatz („Zusätzlich ein separater Endpoint nur für die Kanzlei-interne Vollmachts-Prüfung — nicht für die Kunden-Unterschrift")
- §7 als eigener Abschnitt

Payload gemäß §7:

```json
{
  "fall_nr":      "<claimondo_fall_nr>",
  "status":       "akzeptiert",   // "akzeptiert" | "abgelehnt" | "nachfrage"
  "geprueft_am":  "2026-04-23T14:27:08.153Z",
  "geprueft_von": "Vorname Nachname der prüfenden Person",
  "begruendung":  "optional, bei abgelehnt/nachfrage empfohlen"
}
```

---

## 2. Was wir aktuell implementiert haben

### ✅ Call A ist gebaut und produktiv-tauglich

| Punkt | Umsetzung |
|---|---|
| Endpoint | `https://cmndo-staging.vercel.app/api/webhooks/lexdrive` (Staging, via Custom Metadata konfiguriert — Prod-URL wird einfach umgeschrieben, kein Code-Change) |
| HTTP-Method | `POST` |
| Content-Type | `application/json` |
| Auth | HMAC-SHA256, Header `X-Lexdrive-Signature: sha256=<hex>` |
| Event-Auslöser | Opportunity-Trigger: wenn `RecordType=Vollmacht`, `Type=Vollmacht`, `Stage='Mandatierung erfolgt'`, `CloseDate` gesetzt und `Account.CMID__c` (= eure `claimondo_fall_nr`) befüllt |
| Retry | 3× bei 5xx, Queueable-Chain; bei 4xx kein Retry |
| Idempotenz | `event_id` als UUID v4 wird **vor dem ersten Callout** erzeugt und bei Retries unverändert mitgereicht |
| Payload | exakt wie in §5 spezifiziert: `event_type`, `event_id`, `fall_nr`, `datum` |

**Beispiel eines echten Requests aus unserem End-to-End-Test** (gegen webhook.site abgefangen, HMAC lokal verifiziert → **MATCH**):

```http
POST /api/webhooks/lexdrive HTTP/1.1
Content-Type: application/json
X-Lexdrive-Signature: sha256=bccaab484dac1a0318c3e94d3fd552d83e5a36814cbe4704121e62872ccab7e7

{"event_type":"vollmacht_bestaetigt","event_id":"ld-evt-<uuidv4>","fall_nr":"CLM-E2E-1776855344","datum":"2026-04-22T00:00:00.000Z"}
```

### ❌ Call B ist bewusst **nicht** gebaut

Grund: Der Endpoint `/api/lexdrive/vollmacht-confirm` beschreibt einen **Kanzlei-internen Review-Schritt**, für den auf unserer Seite aktuell **kein expliziter Prozess in Salesforce existiert**. Bei uns gilt ein Mandat als bestätigt, sobald der Kunde seine Unterschrift (WhatsApp-TAN) geleistet hat. Einen getrennten, danach stattfindenden „Mitarbeiter prüft die PDF und markiert sie als akzeptiert/abgelehnt/Rückfrage"-Schritt haben wir **nicht systematisch**.

---

## 3. Unser Klärungsbedarf an euch

### Frage 1 — Ist Call B wirklich benötigt?

Für den klassischen Fluss (Kunde signiert → ihr bucht den Termin final) sollte **Call A (`vollmacht_bestaetigt`) allein ausreichen**. Den internen Review-Schritt machen bei uns bisher weder systematisch noch in einer SF-Oberfläche.

Bitte bestätigt eines der beiden Szenarien:

**Szenario ①:** Call B ist **verpflichtend**, ohne kann Claimondo den Fall nicht abschließen.
→ Wir müssten bei uns einen expliziten Review-Schritt in SF einführen (neues Feld / neues Objekt / eigene Stage) und dort einen zweiten Outbound-Trigger anhängen. Bitte spezifiziert dann auch:
- Was passiert auf eurer Seite bei `"status": "akzeptiert"` vs. `"status": "abgelehnt"` vs. `"status": "nachfrage"`?
- Darf Call B überhaupt erst gefeuert werden, **nachdem** Call A bereits gesendet wurde?
- Gibt es eine Frist, in der Call B auf Call A folgen muss?

**Szenario ②:** Call B ist **optional** und nur für Kanzleien relevant, die ein eigenes Nachkontroll-Regime haben.
→ Dann lassen wir Call B weg und ihr dürft den Endpoint für uns aus eurer Doku / Implementierungsliste streichen (oder auf „nur falls die Kanzlei es braucht" setzen). Call A wäre damit der einzige Vollmacht-bezogene Outbound.

### Frage 2 — Können wir `/api/lexdrive/vollmacht-confirm` für unseren Integrations-Account **deaktivieren**?

Falls Szenario ② zutrifft: Könnt ihr bitte auf eurer Seite dokumentieren (oder per Feature-Flag konfigurieren), dass dieser Endpoint für LexDrive **nicht** erwartet wird? Damit vermeiden wir, dass uns später ein Compliance-Check oder Go-Live-Checklist auf die Füße fällt, weil „Endpoint nicht angebunden".

### Frage 3 — Payloads unterscheiden sich klar, richtig?

Nur zur doppelten Bestätigung, weil in einer Zwischenfrage intern bei uns die Vermutung aufkam, die beiden Endpoints könnten dasselbe sein:

- Call A erwartet: `event_type`, `event_id`, `fall_nr`, `datum`
- Call B erwartet: `fall_nr`, `status`, `geprueft_am`, `geprueft_von`, `begruendung`

Das sind zwei **strukturell verschiedene Payloads**, ja?

---

## 4. Unser Vorschlag

Solange nicht anders gesagt, gehen wir davon aus, dass **Szenario ②** zutrifft und nur Call A gebaut bleibt. Sobald ihr Frage 1 beantwortet:

- **Wenn ①:** Wir definieren mit euch das Auslöse-Ereignis in SF (Feld/Status/Objekt) und bauen Call B analog zu Call A — sollte ca. 1 Tag Arbeit sein, da die komplette Infrastruktur (HMAC, Queueable, Retry, Config, Error-Mail) bereits steht und wiederverwendet wird.
- **Wenn ②:** Keine Änderung bei uns. Wir bitten nur um kurze Bestätigung, dass wir Call B sicher ignorieren können.

---

## 5. Noch offen auf Secret-Ebene

Unser aktueller Staging-Secret (`HMAC_Secret__c` in unserem Custom Metadata) ist der, den wir zuletzt ausgetauscht haben. Sobald ihr den Endpoint scharf schaltet, bitte einmal gegenprüfen, dass er auf eurer Seite identisch in `LEXDRIVE_WEBHOOK_SECRET` hinterlegt ist — sonst bekommen wir garantiert **HTTP 401**.

---

**Kontakt für technische Rückfragen auf unserer Seite:**
Sertac Emir — `Sertac.Emir@lex-drive.com`

---

## 6. Antworten — Claimondo, 2026-04-23

### Antwort auf Frage 1 — Ist Call B verpflichtend?

**Szenario ② trifft zu.** Call B (`/api/lexdrive/vollmacht-confirm`) ist für LexDrive **nicht verpflichtend** und wird von uns auch nicht erwartet.

Begründung: In eurem Flow ist die WhatsApp-TAN-Signatur des Kunden der rechtlich verbindliche Bestätigungs-Schritt. Ein zweiter, kanzlei-interner „Mitarbeiter prüft die PDF und markiert akzeptiert/abgelehnt/Rückfrage"-Schritt existiert bei euch nicht — und er ist für uns **nicht** Voraussetzung, um den Fall weiterlaufen zu lassen.

Call A (`vollmacht_bestaetigt` an `/api/webhooks/lexdrive`) ist damit **der einzige** Vollmacht-bezogene Outbound, den wir von LexDrive erwarten. Sobald der eintrifft, laufen bei uns automatisch:

- `faelle.vollmacht_unterschrieben_am` gesetzt
- Besichtigungs-Termin auf `bestaetigt`
- `final_verbindlich_ab` gesetzt
- Reminder-Kette ausgelöst

Ein Nachlauf-Review-Schritt ist **nicht Teil** des Geschäftsflusses zwischen uns.

### Antwort auf Frage 2 — Kann `/api/lexdrive/vollmacht-confirm` für LexDrive deaktiviert werden?

**Ja, bestätigt.** Bitte nehmt den Endpoint bei euch aus der Implementierungs- und Go-Live-Checkliste für den LexDrive-Integrations-Account heraus. Es gibt **keinen** Compliance-Check, der euch zwingt, ihn zu bedienen.

Auf unserer Seite bleibt der Route-Handler im Code bestehen, weil er für potenzielle zukünftige Kanzlei-Partner mit explizitem Review-Regime reserviert ist (z. B. manuelle Handschriften-Prüfung). Für eure Integration ist er stillgelegt — kein Feature-Flag nötig, wir rufen ihn nicht aktiv an, und wir alarmieren nicht, wenn er ausbleibt.

Falls es euch hilft, können wir in einem späteren Release eine expliziete Partner-Config (`kanzlei_partner.vollmacht_review_required` o. ä.) einführen — aktuell aber overkill für ein Single-Partner-Setup.

### Antwort auf Frage 3 — Payloads strukturell verschieden?

**Ja, bestätigt.** Die beiden Endpoints haben zwei **disjunkte** Payload-Shapes:

| Feld | Call A (`vollmacht_bestaetigt`) | Call B (`vollmacht-confirm`) |
|---|---|---|
| `event_type` | **ja**, fix `"vollmacht_bestaetigt"` | nein |
| `event_id` | **ja**, UUID, idempotent | nein |
| `fall_nr` | **ja** (= `claimondo_fall_nr`) | **ja** (= `claimondo_fall_nr`) |
| `datum` | ja, ISO-8601, optional | nein |
| `status` | nein | **ja**, `"akzeptiert" \| "abgelehnt" \| "nachfrage"` |
| `geprueft_am` | nein | ja, ISO-8601 |
| `geprueft_von` | nein | ja, Freitext (Mitarbeitername) |
| `begruendung` | nein | ja, optional |

Die Handler liegen physisch in zwei verschiedenen Routes (`src/app/api/webhooks/lexdrive/route.ts` vs. `src/app/api/lexdrive/vollmacht-confirm/route.ts`) und haben auch unterschiedliche Folge-Logik bei uns — die teilen sich nichts außer dem gemeinsamen HMAC-Secret.

### Ergänzung — `fall_nr`-Format

Nur zur Klarstellung zu eurem E2E-Test-Beispiel (`CLM-E2E-1776855344`): Wir erwarten **keine** spezielle Präfix- oder Längen-Konvention. `fall_nr` im Webhook muss schlicht **bytegleich** mit der `claimondo_fall_nr` übereinstimmen, die wir euch im ursprünglichen Mandat-Push geschickt haben. Euer Test-Format ist vollkommen ok — Hauptsache ihr spiegelt es 1:1 zurück.

Produktiv-Format auf unserer Seite ist typischerweise `KFZ-YYYY-NNNNNN` (z. B. `KFZ-2026-000123`), aber wir verlassen uns ausschließlich auf den Echo-Match, nicht auf Pattern-Parsing. Alles was ihr als `claimondo_fall_nr` bekommt → unverändert in `fall_nr` zurück, dann matcht es.

### Antwort zu Abschnitt 5 — Shared Secret

**Neuer Staging-Secret ist gerade gesetzt:**

```
LEXDRIVE_WEBHOOK_SECRET = <64-Zeichen Hex, via separatem 1Password-Link>
```

(32 Bytes Entropie, per `crypto.randomBytes(32)` erzeugt.)

Status bei uns:
- ✅ In `.env.local` gesetzt (lokal)
- ⏳ In Vercel Environment Variables (Production / Preview / Development) — wird heute noch nachgezogen

Bitte den String 1:1 in euer Custom Metadata `HMAC_Secret__c` übernehmen und bestätigen, dass er dort landet — danach ist Staging scharf. Übermittlung des Strings selbst erfolgt per separatem, sicherem Kanal (1Password-Link oder verschlüsselte Mail), **nicht** über diese Doku.

Falls ihr wollt, dass wir einen **separaten** Prod-Secret pflegen (Rotation später einfacher, Staging-Kompromittierung betrifft Prod nicht), sagt Bescheid — dann generieren wir einen zweiten String, den ihr vor Go-Live eintragt.

### Vorschlag für den E2E-Staging-Test

1. Ihr stellt euren Outbound-Trigger auf unsere Staging-URL um: `https://<STAGING-PREVIEW>.vercel.app/api/webhooks/lexdrive` (genaue URL schicke ich dir, Sertac, separat per Mail).
2. Wir legen bei uns einen Test-Fall mit `service_typ='komplett'` an → unser Outbound-Push geht an eure Partial2-Sandbox (ist bestätigt funktionsfähig, 201-Response + `mandat_id` erhalten, Test lief am 2026-04-23).
3. Ihr simuliert die Kunden-WA-Signatur und feuert `vollmacht_bestaetigt` zurück.
4. Ich verifiziere bei uns in der Fallakte + `webhook_events`-Tabelle, dass alles durchgerutscht ist.
5. Wenn das sauber läuft, gehen wir gemeinsam auf Prod.

### Zusammenfassung für eure Umsetzungs-Checkliste

- ✅ Call A bauen und scharf schalten — **einziger Outbound, den wir brauchen**
- ❌ Call B **streichen** — nicht verpflichtend, nicht gebaut, nicht erwartet
- 🔑 Neuen Staging-HMAC-Secret (s. o.) in `HMAC_Secret__c` einpflegen, Kurzbestätigung an uns
- 🧪 E2E-Test-Window absprechen (vorzugsweise KW nach Secret-Rotation)

