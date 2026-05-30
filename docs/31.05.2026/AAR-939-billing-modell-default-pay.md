# AAR-939 — Billing-Modell „Default-Pay" (Aaron-Entscheidung 31.05.2026)

**Status:** ENTSCHIEDEN von Aaron. Ersetzt das „3-Pay-Auslöser"-Modell aus dem Billing-Contract (kitta/aar-939-monika-billing, rev 00:15). Betrifft beide Strecken: Lifecycle (af25a50f / Session embed-b-3c) **und** Billing (98044b6b). Vor Umbau gegenlesen.

## Kern-Entscheidung

> **Termin durch (SA + verbindlicher Termin existierte) → €70 by default.**
> **Einzige Ausnahme: der SV meldet „Kunde war nicht da / hat vor Ort abgesagt" → Team-Review (kein Auto-Void).**

Begründung (Aaron): Fürs Billing muss man gar nicht unterscheiden, ob durchgeführt / SV-No-Show / SV-Absage — die zahlen laut Matrix **alle €70**. Die einzige Nicht-Zahl-Situation ist „Kunde war der Grund", und die kann nur der SV melden. Also kein fragiles No-Show-Detektieren nötig.

| Fall | €70? | Wie erkannt |
|---|---|---|
| SV hat begutachtet | JA | Default (SV klickt „durchgeführt" → schliesst Claim) |
| SV nicht erschienen | JA | **Default** — keine Erkennung nötig (zahlt eh) |
| SV-Absage nach Commit | JA | Default |
| **Kunde war nicht da / Kunde-Absage** | **NEIN** | **SV meldet → Team-Review** (`markBillingReviewPending('kunde_absage')`) |

**Anti-Gaming:** SV-Meldung „Kunde war nicht da" wird **nicht auto-storniert** (sonst Schlupfloch: SV redet sich aus den €70 raus / stiftet Kunde an). Sie erzeugt eine **Team-Review** (`billing_review_status='pending'`); Team (rolle=admin) entscheidet final. Deckt sich mit Schnittstelle B des bestehenden Contracts.

## Konsequenz für die Strecken

### Billing (98044b6b) — Contract-Änderung
- **Trigger wird ZEITBASIERT**, nicht event-basiert auf 3 Feldern. Cron: Termine wo Datum (+ Karenz) vorbei, SA+Termin existierten, kein offener Kunde-Grund-Review → `abrechnungs_relevant=true` + €70 + sv_id-Freeze. Reverse-Lookup zur gfa wie gehabt (`konvertiert_zu_lead_id = COALESCE(gt.lead_id, faelle.lead_id)`).
- `durchgefuehrt_am` / `sv_no_show_am` / `sv_ablehnung_am` sind **keine Pay-Auslöser mehr** (alle drei → €70 = Default). Bleiben höchstens als Claim-/Records-Signale.
- Schnittstelle B (`markBillingReviewPending`) wird der **einzige** Lifecycle→Billing-Eingriff: nur bei Kunde-Grund-Meldung.

### Lifecycle (diese Session) — was bleibt / was kommt
- **BLEIBT gültig (PR #2081):** Terminal-Rename `termin_durchgefuehrt`; `markNurGutachterTerminDurchgefuehrt` + SV-„Begutachtung durchgeführt"-Button → schliesst den Claim (Claim-Auflösung, weiterhin sinnvoll als positives „es ist passiert"-Signal).
- **SEMANTIK verschiebt sich:** `gutachter_termine.sv_no_show_am` + `markSvNoShowEmbedB` sind **nicht mehr billing-relevant** (SV-No-Show zahlt per Default). Werden zum reinen **Claim-/SV-Records-Signal** (Dispatcher hält fest, dass der SV nicht da war → Verlegung/Records). Code-Kommentare + Migration-COMMENT entsprechend nachziehen, wenn PR #2081 nach dieser Abstimmung revidiert wird.
- **NEU zu bauen (gated auf 98044b6bs `markBillingReviewPending`):** SV-Aktion „Kunde war nicht da / hat abgesagt" → ruft `markBillingReviewPending(grund='kunde_absage')`. Plus Claim-Folge (Verlegung/Storno).

## Claim-Auflösungs-Kaskade (entkoppelt vom Billing, reine UX/Claim-Hygiene)
Diese Kaskade klärt NUR, ob der Termin lief (Claim schliessen) bzw. verlegt/storniert wird — sie ist **nicht** mehr billing-kritisch:
1. **Geo-Automatik** (für SVs die die App-Navi nutzen) + SV-„durchgeführt"-Klick → Claim schliesst (`termin_durchgefuehrt`).
2. Bleibt offen → **WhatsApp** an Kunde „Kam dein Gutachter?" **+ Portal-Banner** (`/kunde/faelle/[id]`).
3. **Dispatcher-Fallback** für Schweigen/Konflikt.

## Offen (Aaron / Cross-Session)
- 98044b6b: Trigger-Umbau auf zeitbasiert + `markBillingReviewPending` bauen (entsperrt die Lifecycle-SV-Meldung).
- Lifecycle: SV-„Kunde war nicht da"-Aktion + Claim-Auflösungs-Kaskade (WhatsApp/Banner/Dispatcher) bauen, sobald `markBillingReviewPending` existiert.
- Billing-Session-Frage (offen): passiert die Lead-Qualifizierung über Dispatch oder self-service? (eigene Klärung, nicht Teil dieses Docs).
