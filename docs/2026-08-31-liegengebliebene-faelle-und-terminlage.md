# Liegengebliebene Fälle + Terminlage (Stand 31.08.2026)

Ergebnis der Priorisierungs-Frage „was ist operativ das sinnvollste?". Alle Zahlen sind
prod-Messungen vom 31.08., **nach** Abzug von Testdaten (siehe unten — das war der
schwierigste Teil).

## ⚠ Vorbemerkung: warum die Zahlen dreimal gekippt sind

| Schritt | hängende Komplettservice-Fälle | was ihn kippte |
|---|---|---|
| Rohzählung | 21 | — |
| Testfilter über Lead-Email | 15 | 6 Smoke-Leads |
| `JOIN` → `LEFT JOIN` korrigiert | 5 mit Lead / 10 ohne | **eigener Fehler:** `NULL` aus dem LEFT JOIN heißt „kein Lead", nicht „Wert ist false" |
| Zeit-Signatur der Waisen | **~5 echte** | 11 Claims aus dem Ops-Test vom 11.08. |

Ursache: `claims_lead_id_fkey` steht auf **ON DELETE SET NULL**. Ein Smoke-Cleanup löscht
seinen Test-Lead, der Claim bleibt zurück — und mit dem Lead verschwindet der einzige
Testmarker. Behoben durch `claims.ist_testfall` (Mig `20260831222740`).

## 🔴 Die fünf echten liegengebliebenen Fälle

Alle fünf haben einen Kundenbetreuer — es lag **nicht** an fehlender Zuständigkeit.
Kontaktdaten stehen im Admin-Portal; hier nur die Diagnose.

| Claim | Tage | Diagnose | nächster Schritt |
|---|---|---|---|
| `CLM-2026-00927` | 45 | SV zugewiesen, **nie ein Termin entstanden**. Flow abgeschlossen, Kunde per Telefon + Mail erreichbar. | SV nachfassen oder neu zuweisen |
| `CLM-2026-00935` | 43 | Termin **bestätigt für 27.07.** — ohne jeden Assignee, ersatzlos verstrichen. ⚠ Kunde hat **weder Telefon noch Email** hinterlegt. | nicht erreichbar — Fall bewerten/schließen |
| `CLM-2026-00950` | 40 | Kunde hat den Flow **geöffnet, aber nicht beendet**. Kein Termin, kein SV. Erreichbar. | anrufen, Erfassung gemeinsam beenden |
| `CLM-2026-00977` | 35 | Termin am 28.07. **storniert, nie neu vereinbart**. Erreichbar. | anrufen, neuen Termin setzen |
| `CLM-2026-01005` | 33 | Termin **bestätigt für 30.07.**, Assignee war ein *Kundenbetreuer*, kein SV — verstrichen. **Kunde hat Portalzugang und wartet aktiv.** | höchste Priorität |

## 🔴 Der dahinterliegende Systembefund: verstrichene Termine fallen durch jedes Raster

Ein Termin kann auf `bestaetigt` stehen, seine Zeit verstreichen — und **nichts** passiert:
kein Statuswechsel, kein Alarm, keine Aufgabe für den Kundenbetreuer.

Terminlage gesamt (90 Termine):

| Status | Termine | davon in der Vergangenheit |
|---|---|---|
| `storniert` | 76 | 63 |
| `bestaetigt` | **5** | **5 (alle)** |
| `verschoben` / `verlegt` / `verlegung_pending` | 7 | 4 |
| `abgeschlossen` | **1** | 1 |
| `sv_gesucht` | 1 | 1 |

**Es existiert kein einziger zukünftiger bestätigter Termin.** Und über die gesamte
Historie ist genau **ein** Termin als `abgeschlossen` verbucht.

⚠ **Zwei Einschränkungen, die dazugehören:**

1. **Wie viele der 76 Stornos Smoke-Reste sind, ist nicht feststellbar** — dieselbe
   Unmessbarkeit wie bei den Claims. Die Terminzahlen sind daher eine Obergrenze, keine
   Diagnose.
2. **Eigener Fehlbefund unterwegs:** Ich hatte zunächst „5 von 5 Terminen nie begonnen"
   gemessen — über `besichtigung_gestartet_am`. Dieses Feld ist über **alle 90 Termine**
   leer, es wird nirgends geschrieben. Die Zahl maß ein totes Instrument, nicht die
   Wirklichkeit. Belastbar sind nur `status` und `start_zeit`.
   (`sv_unterwegs_seit` = 2, `sv_angekommen_am` = 1, `abschluss_zeit` = 0 — die
   Termin-Telemetrie ist insgesamt fast unbenutzt.)

## 📊 Attribution — geschlossen für die Zukunft, verloren für den Bestand

`leads.source_channel` ist gut gepflegt (15 Kanäle über 90 Tage), aber `claims` hatte
**keine** Herkunftsspalte. Behoben (Mig `20260831225458`), Bestand nachgezogen:
**45 von 84 Claims** tragen jetzt eine Herkunft.

Erste Auswertung — Fälle je Eintrittskanal:

| Kanal | Fälle |
|---|---|
| `self_service` | 23 |
| `schaden-karte` | 7 |
| `werkstatt_finder` | 4 |
| `kunde_portal` | 3 |
| `mini_wizard` | 3 |
| `flotte-manuell` | 2 |
| `gutachter-vermittlung` | 1 |
| **`chatgpt.com`** | **1** |

Die restlichen 39 Claims haben keinen Lead mehr — ihre Herkunft ist **unwiederbringlich
verloren**. Genau das verhindert die Migration ab jetzt.

Bemerkenswert aus der Lead-Seite: `mcp` (8 Leads), `claimondo-check` (2) und
`makler-anfrage-flowlink` (2) haben **null** Konversion zum Fall.

## Offene Entscheidungen

1. **Backfill der Waisen** (`scripts/backfill-ist-testfall.mjs --fenster=…`): Für die
   ~12 Claims vom 11.08. 16:32–17:04 gibt es nur das Indiz der Häufung, keinen Beweis.
   Lief an dem Nachmittag ein Ops-Test?
2. **Filter in den Listen:** Das Flag ist bislang rein buchhalterisch — keine Liste
   filtert darauf (260 Lesestellen in 143 Dateien). Harter Filter oder ein
   „Testfälle einblenden"-Umschalter?
3. **Wächter für verstrichene Termine** — bislang gibt es keinen.
