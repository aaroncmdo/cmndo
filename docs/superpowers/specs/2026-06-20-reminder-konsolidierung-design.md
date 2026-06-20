# Termin-Reminder-Konsolidierung — über die notification_events-Pipeline

**Datum:** 2026-06-20
**Status:** Design (Spec) — Review offen
**Kontext:** Folge aus dem Notification+Cron-Audit 2026-06-20 (Cron-Redundanz #3).
**Leitprinzip (Aaron):** Eine kanonische Quelle, kein Funktions-/Cron-Herumgefuchtel.

---

## 1. Kontext & Problem

Kunden-Termin-Erinnerungen werden heute von **3–4 parallelen Crons** verschickt, jeder mit eigenem
Mechanismus, eigenem Dedup und **an der `notification_events`-Pipeline vorbei**:

| Cron | Schedule | Sendet | Mechanismus / Dedup | Send-Pfad |
|---|---|---|---|---|
| `termin-erinnerungen` | stündlich | Kunde 24h + 2h + 48h-Docs | scan `gutachter_termine`, Flag/`nachrichten`-LIKE | `sendFallCommunication` |
| `termin-morgen-erinnerung` | tägl. 07:00 | Kunde „heute Termin" | scan, Flag `erinnerung_morgen_gesendet` | `sendNachricht` |
| `send-reminders` | */5 | Kunde-Morgen + Kunde-1h + SV-Route | **queue** `termin_reminders` (status) | `sendCommunication` |
| ~~`whatsapp-erinnerungen`~~ | — | ~~Kunde 24h+2h~~ | — | **bereits retired** (#3056) |

**Probleme:**
- **Inhalts-Duplikat:** `termin-morgen-erinnerung` (Scan) ≡ `send-reminders` „Kunde-Morgen" (Queue) —
  dieselbe „heute-Termin"-WA aus zwei Mechanismen → Doppel-Risiko.
- **Drei Dedup-Strategien** (Flag-Spalten / `nachrichten`-LIKE-Textmatch / Queue-Status) — keiner sieht
  die Sends des anderen → die #3056-Lücke existiert latent weiter.
- **Pipeline-Bypass:** alle nutzen `sendFallCommunication`/`sendNachricht`/`sendCommunication` statt
  `emitEvent` → keine Preferences, kein in_app, kein web_push, keine Delivery-Telemetrie.
- **Toter EventType:** `termin.erinnerung` ist in `types.ts` + `EVENT_MATRIX` definiert
  (`{ fallId, terminId, offset_hours: 24|2 }`, kunde→whatsapp/web_push) — aber **wird nie emittiert**
  (Audit-Befund: 22 tote EventTypes). Die Pipeline-Strecke für Reminder ist also schon gebaut, nur
  ungenutzt.

---

## 2. Ziele / Nicht-Ziele

**Ziele**
- **Ein** Kunden-Termin-Reminder-Mechanismus, **queue-basiert**, der über `emitEvent('termin.erinnerung')`
  → die bestehende Pipeline läuft (revived den toten EventType).
- **Ein** Dedup (Queue-Status + `notification_deliveries`), kein LIKE-Textmatch mehr.
- Die 3 Kunden-Reminder-Crons → **ein** Drain-Cron.

**Nicht-Ziele (bewusst draußen)**
- **SV-operative Reminder** (`gutachter-erinnerungen` SV-Losfahren/Route, `send-reminders` SV-Route-Teil)
  — das ist Logistik (ETA/Fahrzeit/Route), kein Kunden-Notification-Event. Bleibt vorerst wie es ist;
  separate Folge-Strecke (eigene SV-Event-Typen).
- **KB-Termin-Reminder** (`kb-termin-reminder` + `-1h`) — anderes Termin-Objekt (`admin_termine`),
  separate Mini-Konsolidierung.
- Die `notification_events`-Pipeline selbst (die ist nach dem P0-Fix #3050 + Worker-Härtung #3052 ok).
- 48h-Pflichtdokumente-Check aus `termin-erinnerungen` — das ist ein `dokument.fehlt`-Event, kein
  Termin-Reminder; separat halten (existiert als EventType).

---

## 3. Architektur

```
  Termin bestätigt          Drain-Cron (*/5 ODER stündlich)        notification_events-Pipeline
  ────────────────          ──────────────────────────────        ───────────────────────────
  signSAandCreateFall /     enqueueTerminReminders(terminId):      emitEvent('termin.erinnerung',
  bucheTerminFlow / ...  ─►  INSERT termin_reminders                 {fallId, terminId, offset})
                              (offset ∈ morgen|24h|2h|1h,           ─► fan-out (kunde) ─► whatsapp
                               geplant_fuer, status=pending)            + web_push + in_app
                                      │                                  + Preferences + Retry +
                                      ▼                                  Delivery-Telemetrie
                            Drain: termin_reminders WHERE
                            status=pending AND geplant_fuer<=now
                            → emitEvent(...) → status=sent
```

- **Enqueue:** Bei Termin-Bestätigung werden die Reminder-Zeilen für den Termin in `termin_reminders`
  vorberechnet (offset-basiert: morgen-07:00, 24h, 2h, 1h vor `start_zeit`). Bei Termin-Verlegung/
  Storno: pending-Zeilen löschen/neu rechnen. (Ein Backfill-Lauf erzeugt sie initial für bestehende
  bestätigte Termine.)
- **Drain-Cron:** EIN Cron (`termin-reminder-drain`) liest fällige `termin_reminders` (status=pending,
  geplant_fuer<=now), ruft `emitEvent('termin.erinnerung', {fallId, terminId, offset_hours})`, setzt
  `status=sent`. Ersetzt `termin-erinnerungen` + `termin-morgen-erinnerung` + `send-reminders`
  (Kunden-Teil).
- **Versand:** macht die Pipeline (kunde→whatsapp/web_push laut `EVENT_MATRIX`). Dedup = Queue-Status
  (eine pending→sent-Transition pro Reminder) + `notification_deliveries` (eine Zeile pro event×kanal).

---

## 4. Entscheidungen (für Review)

- **E1 — Queue statt Scan:** kanonisch wird die **Queue** (`termin_reminders`, wie `send-reminders`),
  nicht der stündliche Scan. *Begründung:* explizite, idempotente Reminder-Zeile pro (Termin, Offset);
  Dedup ist strukturell (Status), kein Textmatch; übersteht Termin-Verlegung sauber (Zeilen neu rechnen).
- **E2 — `termin.erinnerung` reviven** statt neuer EventType: existiert schon in `types.ts` +
  `EVENT_MATRIX`. `offset_hours`-Payload ggf. um `'morgen'`/`1` erweitern (heute nur `24|2`).
- **E3 — `offset_hours`-Erweiterung:** Type ist `24 | 2` → erweitern auf `'morgen' | 24 | 2 | 1`
  (oder ein `offset: string`-Feld). Der in-app/WA-Template-Mapper unterscheidet die Texte.
- **E4 — SV-Route raus aus dem Scope:** `send-reminders` wird NICHT komplett gelöscht, solange sein
  SV-Route-Teil nicht migriert ist. Variante: SV-Route-Teil in `gutachter-erinnerungen` ziehen (dort
  lebt SV-Logistik eh), dann `send-reminders` löschen. → eigener Schritt.

---

## 5. Migration (Cron-Kollaps)

| Alt-Cron | Schicksal |
|---|---|
| `termin-erinnerungen` | 24h/2h → Drain; 48h-Docs → eigener `dokument.fehlt`-Pfad behalten; dann Route schlanker/löschen |
| `termin-morgen-erinnerung` | „morgen"-Offset → Drain; Route löschen |
| `send-reminders` (Kunde-Morgen/1h) | → Drain; SV-Route-Teil zuerst nach `gutachter-erinnerungen` (E4), dann Route löschen |
| **neu** `termin-reminder-drain` | EIN Cron, ersetzt obige (Kunden-Teil) |

VPS-Crontab entsprechend umstellen (3 Zeilen raus, 1 rein) + `docs/vps-crontab.md` nachziehen.

---

## 6. Testing
- **vitest:** `enqueueTerminReminders` (richtige Offsets/geplant_fuer aus start_zeit, Verlegung→Neuberechnung);
  Drain-Idempotenz (pending→sent, kein Doppel-Emit).
- **Integration:** ein bestätigter Termin → 4 termin_reminders → zu den Offsets je 1 `termin.erinnerung`-
  Event → je 1 WA-Delivery; kein Doppel über mehrere Drain-Läufe.
- **Regression:** Kunde bekommt weiterhin alle Erinnerungen (morgen/24h/2h/1h), nur einmal je.

---

## 7. Risiken
- **Enqueue-Vollständigkeit:** jeder Termin-Bestätigungs-Pfad muss enqueuen (sonst stiller Reminder-
  Verlust). Backfill für bestehende Termine + Verdrahtung an ALLEN Bestätigungs-Stellen (Audit:
  `signSAandCreateFall`, `bucheTerminFlow`, Dispatch-Bestätigung). Sicherer Fallback: ein nightly
  „Reconcile"-Lauf, der fehlende Reminder-Zeilen für bestätigte Termine nachzieht.
- **Pipeline-Abhängigkeit:** Reminder hängen jetzt an der `notification_events`-Pipeline — die muss
  gesund sein (P0 #3050 + Worker #3052 sind Vorbedingung; beide offen/staging).
- **offset_hours-Type-Change** berührt den bestehenden (toten) EventType — additive Erweiterung, keine
  Consumer brechen (es gibt keine).
- **Übergang:** Während der Migration NICHT alt+neu parallel senden (Doppel). Pro Offset sauber
  umschalten (alt-Cron-Zeile raus, sobald der Drain den Offset abdeckt).

---

## 8. Definition of Done
- Ein `termin-reminder-drain`-Cron; `termin-erinnerungen`/`termin-morgen-erinnerung`/`send-reminders`
  (Kunden-Teil) entfernt.
- Kunden-Termin-Reminder laufen über `emitEvent('termin.erinnerung')` → Pipeline (WA + web_push +
  in_app + Preferences + Telemetrie).
- Ein Dedup (Queue-Status), kein LIKE-Textmatch.
- `termin.erinnerung` ist kein toter EventType mehr; vitest + Build grün; VPS-Crontab + Doc nachgezogen.
