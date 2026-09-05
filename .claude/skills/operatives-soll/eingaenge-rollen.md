# Eingänge × Rollen — die Liste, die man nicht aus dem Kopf aufstellt

Quelle der Wahrheit: `docs/fundament/entry-points.md` (A4-Register, alle Schaden-Meldewege mit den sechs
Pflicht-Nachwirkungen) und `docs/fundament/entry-points-flowlink.md` (14 FlowLink-Eingänge). Diese Datei
ist die Kurzform zum Abhaken — bei Widerspruch gilt das Register. Wer einen Eingang neu baut, trägt ihn
**dort** ein, nicht nur hier.

## Die drei Fragen je Eingang

1. **Entsteht** der Zustand hier? (die eigene Frage wird gestellt, der Wert geschrieben)
2. Kommt er hier **schon vorbelegt** an? (ein vorgelagerter Kanal hat ihn gesetzt — dann muss diese
   Stelle ihn respektieren, nicht neu fragen und nicht ignorieren)
3. Gibt es einen **Re-Visit**? (derselbe Link, zweiter Besuch — muss das Ergebnis zeigen, nicht die Frage)

Jede Ja-Antwort ist eine Zeile in Abschnitt 6 der Abnahme-Datei.

## Eingänge (anonym / token-basiert)

| Kürzel | Eingang | Muster | Typische Falle |
|---|---|---|---|
| A-1 | Kunde-Wizard `/kunde/schaden-melden` (angemeldet) | Direkt-Claim über Wrapper | Doppel-Submit = 2 Claims (kein Lead-Check) |
| A-3 | Gegner-Flow / Schadenkarte NFC `/schaden/[token]` | Direkt-Claim, Kern direkt | Gegner ist **nicht** der Kunde — kein FlowLink für ihn |
| B-1 | Embed Gutachter-Finder `/embed/gutachter-finder` | lead-first, im **iframe** | Messung im äußeren Dokument sieht 0 Felder |
| B-2 | Embed Werkstatt-Finder `/embed/werkstatt-finder` | lead-first, im **iframe** | einziger Eingang ohne Erstnotification |
| B-3 | Public-API `POST /api/v1/melde-schaden` (MCP-Tool) | lead-first | Team bekommt nichts (bewusst) |
| B-4 | Öffentlicher Rückruf (Marketing-Formulare) | Lead + `admin_termine` | kein Dedup → Doppel-Rückrufe |
| C-1 | FlowLink `/flow/[token]` | **Konvergenzpunkt**, Claim entsteht am Ende | Zustand kommt oft **vorbelegt** an (Quali schon im Lead) |
| C-x | 14 FlowLink-Eingänge (Issuance/Delivery) | siehe `entry-points-flowlink.md` | ein neuer Token-Pfad braucht `publicPaths` |
| M | Makler `makler/erstelle-anfrage` | Lead über Makler | Makler-Notif, Kunde nicht |
| F | Flotte `flotte/schaden-fortsetzung` | Lead/Claim je Fahrzeug | Firmen-Flotte ist LIVE — Vorsicht bei Smokes |
| D | Dispatch-Anlage `dispatch/leads`, `dispatch/kalender/spontan` | interne Anlage, Zustand **vorbelegt** | Dispatcher-Override muss Lead **und** Claim **und** Kundensicht treffen |
| AD | Admin `admin/faelle/anlegen` | interne Anlage | 0 Leads auf prod — kein gemessener Nutzen |
| W | Webhooks: Aircall, matelso, LexDrive `process-event` | schreibt ohne UI | `manual_status_override` ist bewusst validierungsfrei |
| Q | QR/NFC-Werkstattkarte → Claim-Trigger | DB-Trigger, kein UI-Weg | nur per DB-Read nachweisbar — als „verdrahtet, nicht gelaufen" ausweisen |
| K | Anspruchsprüfung `/check` (Marketing) | Lead ohne Flow | Antwort landet im **Lead**, gelesen wird der **Claim** |
| CR | Crons (reminder-sender, task-eskalation, notification_worker, release_provisionen …) | schreibt ohne UI | 25/26 Jobs unversioniert; `task-eskalation` eskalierte nie |
| RV | Re-Visit jedes obigen Links | zweiter Besuch | zeigt die Frage statt des Ergebnisses |

## Rollen (angemeldet), die lesen oder ändern

| Rolle (DB-Wert) | Portal | Testkonto (Login-Daten nur aus `reference-internal-test-account-logins`) |
|---|---|---|
| `kunde` | `/kunde/*`, Fallakte | `smoke-kunde@` |
| `werkstatt` | `/werkstatt/*` | **keins stehend** (Stand 05.09.) — Smokes legen Wegwerf-Werkstätten an; Aaron-Go für ein Konto offen |
| `sachverstaendiger` | `/gutachter/*` | `test-sv@` (CI-TOTP-Faktor) |
| `dispatch` | `/dispatch/*` | `test-dispatch@` |
| `admin` | `/admin/*` | `test-admin@` |
| `kundenbetreuer` | `/faelle/*` | `test-kb@` (⚠ unzugewiesene Fälle: `can_view_claim`, #5773) |
| `makler` | `/makler/*` | `test-makler@` |
| `flottenmanager` | `/flotte/*` | `flotte.test@` |
| `kanzlei` | `/kanzlei/*` | `test-kanzlei@` |
| `gegner` | `/schaden/[token]` | kein Konto — Token |
| anonym | Marketing, Embed, FlowLink, `/check` | keiner |
| **nicht-berechtigt** | jede Rolle, der der Fall **nicht** gehört | `test-rls-nobody@` — **Pflichtzelle** |

Stabile Fixture-IDs: `scripts/test-fixtures/ids.ts`. Passwörter **nie** ins Repo (öffentlich).

## Zeilenform für Abschnitt 6

```
| Eingang / Rolle | betroffen? | Sicht (muss / darf ändern / darf nicht) | DB-Voraussetzung (geprüft wie, wann) | geprüft wie (UI-Klick, Playwright, Konto) | Ergebnis |
```

Beispiel Kasko-Werkstattbindung (04.09., nach der Abnahme 11 Zellen): FlowLink gebunden / frei / unklar /
Freitext · FlowLink **vorbelegt** (Lead kommt schon als Kasko an, ohne Quali) · Re-Visit · Embed gebunden
mit / ohne Telefon · Dispatch-Override (Lead + Claim + Kundensicht) · Kunde-Portal „Schaden melden" ·
Admin-Wissensbasis · Marketing-Einbettung · QR-Trigger (DB-Read).
