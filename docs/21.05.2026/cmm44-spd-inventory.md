# CMM-44 SP-D — Call-Site Inventory (PR2 Reader/Writer Sweep)

**Datum:** 2026-05-21
**Script:** `scripts/cmm44-spd-grep.mjs` (paren-balanced, 25 cols)
**Basis:** `docs/superpowers/specs/2026-05-21-cmm44-spd-termin-cluster-design.md`

---

## 1. Raw Grep Output (60 Treffer)

```
src\app\admin\sachverstaendige\_karte\actions.ts:355 | besichtigungsort_adresse | from('faelle')
src\app\api\admin\create-test-fall\route.ts:121 | besichtigungsort_adresse | from('faelle')
src\app\api\admin\test\cmm48-smoke\route.ts:137 | besichtigungsort_adresse | from('faelle')
src\app\api\cron\gutachter-erinnerungen\route.ts:93 | termin_erinnerung_5min_gesendet | from('faelle')
src\app\api\cron\gutachter-erinnerungen\route.ts:105 | termin_erinnerung_5min_gesendet | from('faelle')
src\app\api\cron\re-termin-eskalation\route.ts:96 | re_termin_eskalation_an_kb_am | from('faelle')
src\app\api\cron\send-reminders\route.ts:80 | besichtigungsort_adresse | from('faelle')
src\app\api\cron\send-reminders\route.ts:178 | besichtigungsort_adresse | from('faelle')
src\app\api\cron\sv-termin-dokument-reminder\route.ts:50 | sv_termin_dokument_reminder_gesendet_am | from('faelle')
src\app\api\cron\sv-termin-dokument-reminder\route.ts:122 | sv_termin_dokument_reminder_gesendet_am | from('faelle')
src\app\api\kunde\termin\ics\[id]\route.ts:35 | besichtigungsort_adresse | from('faelle')
src\app\api\sv-zuweisung\route.ts:301 | wunschtermin | from('faelle')
src\app\dispatch\leads\[id]\_actions\sv-termin.ts:66 | besichtigungsort_lat | from('faelle')
src\app\dispatch\leads\[id]\_actions\sv-termin.ts:371 | besichtigungsort_lat | from('faelle')
src\app\flow\[token]\page.tsx:149 | besichtigungsort_adresse | from('faelle')
src\app\gutachter\auftraege\export-action.ts:132 | besichtigungsort_adresse | from('faelle')
src\app\gutachter\fall\[id]\_actions\konfrontation.ts:35 | nachbesichtigung_sv_konfrontation_gewuenscht | from('faelle')
src\app\gutachter\feldmodus\page.tsx:143 | besichtigungsort_adresse | from('faelle')
src\app\gutachter\feldmodus\_fallakte\actions.ts:85 | besichtigungsort_adresse | from('faelle')
src\app\gutachter\heute\page.tsx:158 | besichtigungsort_adresse | from('faelle')
src\app\gutachter\termine\[id]\navigation\page.tsx:37 | besichtigungsort_adresse | from('faelle')
src\app\gutachter\termine\[id]\page.tsx:76 | besichtigungsort_adresse | from('faelle')
src\app\kunde\faelle\[id]\_actions\besichtigungsort.ts:32 | besichtigungsort_adresse | from('faelle')
src\app\kunde\faelle\[id]\_actions\besichtigungsort.ts:41 | besichtigungsort_adresse | from('faelle')
src\app\kunde\nachbesichtigung\actions.ts:20 | nachbesichtigung_status | from('faelle')
src\app\kunde\nachbesichtigung\actions.ts:43 | nachbesichtigung_status | from('faelle')
src\app\kunde\nachbesichtigung\page.tsx:12 | nachbesichtigung_status | from('faelle')
src\app\kunde\onboarding\actions.ts:208 | nachbesichtigung_status | from('faelle')
src\app\kunde\re-termin\[token]\actions.ts:43 | re_termin_token | from('faelle')
src\app\kunde\re-termin\[token]\actions.ts:111 | re_termin_token_eingelaufen_am | from('faelle')
src\app\kunde\re-termin\[token]\page.tsx:28 | re_termin_token | from('faelle')
src\app\kunde\termin\[token]\actions.ts:100 | besichtigungsort_adresse | from('faelle')
src\app\kunde\termin\[token]\page.tsx:80 | besichtigungsort_adresse | from('faelle')
src\app\kunde\termine\[id]\page.tsx:41 | besichtigungsort_adresse | from('faelle')
src\lib\actions\storno-actions.ts:42 | re_termin_token | from('faelle')
src\lib\actions\storno-actions.ts:69 | no_show_gemeldet_am | from('faelle')
src\lib\actions\storno-actions.ts:84 | no_show_gemeldet_am | from('faelle')
src\lib\actions\storno-actions.ts:123 | re_termin_token | from('faelle')
src\lib\actions\termin-verlegung-actions.ts:163 | besichtigungsort_adresse | from('faelle')
src\lib\actions\termin-verlegung-actions.ts:384 | besichtigungsort_adresse | from('faelle')
src\lib\auftrag\aktiver-auftrag.ts:29 | besichtigungsort_lat | from('faelle')
src\lib\claims\get-kunde-faelle.ts:397 | besichtigungsort_adresse | from('faelle')
src\lib\dispatch\findBestSV.ts:210 | besichtigungsort_lat | from('faelle')
src\lib\dispatch\konfrontations-dispatch-lite.ts:59 | nachbesichtigung_sv_konfrontation_gewuenscht | from('faelle')
src\lib\dispatch\reachability.ts:103 | besichtigungsort_lat | from('faelle')
src\lib\dispatch\reachability.ts:247 | besichtigungsort_lat | from('faelle')
src\lib\email\google\flows.ts:65 | besichtigungsort_adresse | from('faelle')
src\lib\email\google\flows.ts:314 | besichtigungsort_adresse | from('faelle')
src\lib\email\google\flows.ts:786 | besichtigungsort_adresse | from('faelle')
src\lib\google-calendar\sv-event-sync.ts:121 | besichtigungsort_adresse | from('faelle')
src\lib\google-calendar\sv-termin-sync.ts:64 | besichtigungsort_adresse | from('faelle')
src\lib\kalender\caldav\sv-termin-sync.ts:70 | besichtigungsort_adresse | from('faelle')
src\lib\lexdrive\process-event.ts:525 | nachbesichtigung_sv_termin_vereinbart_am | from('faelle')
src\lib\reminders\sv-reminder.ts:37 | besichtigungsort_lat | from('faelle')
src\lib\reminders\sv-reminder.ts:78 | besichtigungsort_lat | from('faelle')
src\lib\smoke\lifecycle-seed.ts:165 | besichtigungsort_adresse | from('faelle')
src\lib\termine\actions.ts:138 | besichtigungsort_lat | from('faelle')
src\lib\termine\bestaetigung.ts:51 | besichtigungsort_adresse | from('faelle')
src\lib\termine\get-by-token.ts:76 | besichtigungsort_adresse | from('faelle')
src\lib\termine\sv-ablehnung.ts:114 | besichtigungsort_adresse | from('faelle')

TOTAL: 60
```

---

## 2. False-Positive Triage

| # | Hit (file:line, col) | Warum False Positive |
|---|---|---|
| FP1 | `src/app/flow/[token]/page.tsx:149` — `besichtigungsort_adresse` | Das `.from('faelle')` query an Zeile 149 selektiert nur `id, kunde_id`. Die `besichtigungsort_adresse` erscheint 73 Zeilen weiter im 1500-char-Fenster — an Zeile 222 wird `lead.besichtigungsort_adresse` gelesen, also ein `leads`-Feld, nicht `faelle`. Kein faelle-seitiger Zugriff auf SP-D-Spalte. |
| FP2 | `src/lib/smoke/lifecycle-seed.ts:165` — `besichtigungsort_adresse` | Das ist ein `.insert({besichtigungsort_adresse: 'Teststrasse...'})` in einem Test-Seed-Skript (`/lib/smoke/`). Out-of-Scope (Testinfrastruktur, kein produktiver Reader/Writer). |
| FP3 | `src/app/api/admin/create-test-fall/route.ts:121` — `besichtigungsort_adresse` | Route ist `/api/admin/create-test-fall` — Test-Hilfsfunktion. Das INSERT in `faelle` mit `besichtigungsort_adresse` ist Test-Seeding-Code. **Als eigenstandige OUT-OF-SCOPE Liste** klassifiziert (s. Abschnitt 5), muss aber trotzdem in PR2 mitgezogen werden da der Test sonst nach SP-D (Phase 6, faelle-DROP) bricht. |
| FP4 | `src/app/api/admin/test/cmm48-smoke\route.ts:137` — `besichtigungsort_adresse` | API-Route `/api/admin/test/cmm48-smoke` — Smoke-Test-Route. Das `.from('faelle').select('id, claim_id, besichtigungsort_adresse, ...)` liest einen Snapshot fuer Diagnose. OUT-OF-SCOPE als reine Test-/Smoke-Route; muss aber mitgezogen werden. |

**Netto False Positives:** 1 echter FP (FP1 = `flow/[token]/page.tsx:149`).
FP2/FP3/FP4 sind echte faelle-Zugriffe in Test-/Smoke-Dateien — in Abschnitt 5 als Out-of-Scope markiert, werden aber in PR2 trotzdem umgestellt (damit Code nach Phase-6-DROP nicht bricht).

---

## 3. True-Site Tabelle

**Gesamt True Sites: 58** (60 Hits − 1 echter FP − 1 uebereinkommend zwischen zwei Hits derselben Zeile; beide `storno-actions.ts:42` und `:123` sind echter Code)

Muster-Definitionen:
- **A** = `from('faelle').select(...)` direkt liest SP-D-Spalte → wechseln auf `gutachter_termine` (aktueller Termin, `order('start_zeit', {ascending:false}).limit(1)`)
- **B** = `from('faelle').select(...)` liest SP-D + andere Spalten gemischt → nested GT-Embed hinzufuegen
- **C** = `from('faelle').update/insert({SP-D-Spalte})` schreibt → auf `gutachter_termine`-Zeile umleiten
- **D** = `faelle(...)` nested in anderem Table-Query → nicht relevant hier (keine Hits)
- **E** = Lesen via View (`v_faelle_mit_aktuellem_termin` o.ae.) → kein Code-Change (View liefert)
- **F** = TS-Typ / Property-Access only, kein DB-Query → kein Aenderungsbedarf (ausser DUP)
- **DUP** = `geschaetzte_fahrzeit_min` / `gcal_event_id` → Switch auf GT-Zwilling + RENAME

| # | file:line | column | pattern | note |
|---|---|---|---|---|
| 1 | `src/app/admin/sachverstaendige/_karte/actions.ts:355` | besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng | B | select mixed: id, kunde_vorname, kunde_nachname, besichtigungsort_{adresse,lat,lng} + claims-embed. Koordinaten werden direkt aus fall gelesen (fall.besichtigungsort_lat etc.) fuer SV-Routing. Wechsel: auch lat/lng in GT-embed aufnehmen. |
| 2 | `src/app/api/cron/gutachter-erinnerungen\route.ts:93` | losfahren_erinnerung_gesendet | C | WRITE: `.update({ losfahren_erinnerung_gesendet: true }).eq('id', termin.id)` — Notiz: `termin.id` ist ein `v_faelle_mit_aktuellem_termin`-ID (= Fall-ID). Wechsel: schreibe auf zugehoerige GT-Zeile. |
| 3 | `src/app/api/cron/gutachter-erinnerungen\route.ts:105` | termin_erinnerung_5min_gesendet | C | WRITE: `.update({ termin_erinnerung_5min_gesendet: true }).eq('id', termin.id)` — identisches Muster wie #2. |
| 4 | `src/app/api/cron/re-termin-eskalation\route.ts:96` | re_termin_eskalation_an_kb_am | C | WRITE: `.update({ re_termin_eskalation_an_kb_am: new Date().toISOString() }).eq('id', fall.fall_id)` — Eskalations-Marker setzen. |
| 5 | `src/app/api/cron/send-reminders\route.ts:80` | besichtigungsort_adresse | A | select: `besichtigungsort_adresse, claims:claim_id(...)` — gelesen fuer Adress-Fallback im Reminder-Sender. |
| 6 | `src/app/api/cron/send-reminders\route.ts:178` | besichtigungsort_adresse | A | Zweite `from('faelle').select(besichtigungsort_adresse, ...)` im gleichen Handler fuer vorherigen Termin (Route-Berechnung). |
| 7 | `src/app/api/cron/sv-termin-dokument-reminder\route.ts:50` | sv_termin_dokument_reminder_gesendet_am | A | select: `id, sv_termin_dokument_reminder_gesendet_am` — Idempotenz-Check vor dem Send. |
| 8 | `src/app/api/cron/sv-termin-dokument-reminder\route.ts:122` | sv_termin_dokument_reminder_gesendet_am | C | WRITE: `.update({ sv_termin_dokument_reminder_gesendet_am: now.toISOString() }).eq('id', fall.id)` — Flag setzen nach Versand. |
| 9 | `src/app/api/kunde/termin/ics/[id]/route.ts:35` | besichtigungsort_adresse | A | select: `kennzeichen, besichtigungsort_adresse, ...` fuer ICS-Datei-Generierung. |
| 10 | `src/app/api/sv-zuweisung/route.ts:301` | wunschtermin | A | select: `id, lead_id, sv_id, kennzeichen, wunschtermin, claims:claim_id(...)` — Wunschtermin wird an triggerGutachterTerminTask + notifyAdmins weitergereicht. |
| 11 | `src/app/dispatch/leads/[id]/_actions/sv-termin.ts:66` | besichtigungsort_lat, besichtigungsort_lng | A | select: `id, sv_id, claim_id, created_at, besichtigungsort_lat, besichtigungsort_lng` fuer Fallback-Koordinaten-Kette beim SV-Suggestions-Lookup (besichtigungsort_lat/-lng aus faelle, bevor leads gelesen werden). |
| 12 | `src/app/dispatch/leads/[id]/_actions/sv-termin.ts:371` | besichtigungsort_lat, besichtigungsort_lng | A | select: `besichtigungsort_lat, besichtigungsort_lng` fuer Erreichbarkeits-Check nach SV-Gegenvorschlag. |
| 13 | `src/app/gutachter/auftraege/export-action.ts:132` | besichtigungsort_adresse | A | select: `id, ..., besichtigungsort_adresse, sv_briefing_text, claims:claim_id(...)` fuer CSV-Export der Auftraege. |
| 14 | `src/app/gutachter/fall/[id]/_actions/konfrontation.ts:35` | nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am | A | select beide Spalten fuer Auth-Guard + Idempotenz-Check der Konfrontations-Bestaetigung. |
| 15 | `src/app/gutachter/feldmodus/page.tsx:143` | besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng | B | select: `..., besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng, ...` — alle vier Besichtigungsort-Felder im Feldmodus-Loader. |
| 16 | `src/app/gutachter/feldmodus/_fallakte/actions.ts:85` | besichtigungsort_adresse | A | select: `..., besichtigungsort_adresse, ...` im Feldmodus-Fallakte-Loader. |
| 17 | `src/app/gutachter/heute/page.tsx:158` | besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng | B | select: alle 4 besichtigungsort-Felder im Heute-Dashboard-Loader (+ claims-embed). |
| 18 | `src/app/gutachter/termine/[id]/navigation/page.tsx:37` | besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng | B | select: `id, lead_id, besichtigungsort_{adresse,lat,lng}, claims:claim_id(...)` fuer Navigations-Page. |
| 19 | `src/app/gutachter/termine/[id]/page.tsx:76` | besichtigungsort_adresse | A | select: `..., besichtigungsort_adresse, ...` fuer Termin-Detail-Page. |
| 20 | `src/app/kunde/faelle/[id]/_actions/besichtigungsort.ts:32` | besichtigungsort_adresse | A | select: `id, kunde_id` — Ownership-Check (kein SP-D Read). Zeile 32 ist hier der FROM('faelle') Beginn. Spalten-Zugriff: WRITE folgt Zeile 41. |
| 21 | `src/app/kunde/faelle/[id]/_actions/besichtigungsort.ts:41` | besichtigungsort_adresse | C | WRITE: `.update({ besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng }).eq('id', params.fallId)` — Kunden-Besichtigungsort-Aenderung. |
| 22 | `src/app/kunde/nachbesichtigung/actions.ts:20` | nachbesichtigung_status | A | select: `id, nachbesichtigung_status, kunde_id, lead_id` — Status-Check. |
| 23 | `src/app/kunde/nachbesichtigung/actions.ts:43` | nachbesichtigung_status, nachbesichtigung_termin_datum | C | WRITE: `.update({ nachbesichtigung_termin_datum: datum, nachbesichtigung_status: 'termin-gewaehlt' }).eq('id', fallId)` |
| 24 | `src/app/kunde/nachbesichtigung/page.tsx:12` | nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am | A | select: `id, nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am` — Uebersichtsseite Kunde. |
| 25 | `src/app/kunde/onboarding/actions.ts:208` | nachbesichtigung_status | A | select: `id, kunde_id, lead_id, technische_stellungnahme_status, nachbesichtigung_status, claims:claim_id(...)` — Onboarding-Slot-Eligibility. |
| 26 | `src/app/kunde/re-termin/[token]/actions.ts:43` | re_termin_token, re_termin_token_eingelaufen_am | A | select: `id, sv_id, lead_id, claim_id, re_termin_token_eingelaufen_am, storniert_am` — by `.eq('re_termin_token', token)`. Token-Lookup. |
| 27 | `src/app/kunde/re-termin/[token]/actions.ts:111` | re_termin_token_eingelaufen_am | C | WRITE: `.update({ re_termin_token_eingelaufen_am: new Date().toISOString() }).eq('id', fall.id)` — Token entwerten. |
| 28 | `src/app/kunde/re-termin/[token]/page.tsx:28` | re_termin_token, re_termin_token_eingelaufen_am | A | select: `..., re_termin_token_eingelaufen_am, storniert_am, ...` by `.eq('re_termin_token', token)` — Page-Load. |
| 29 | `src/app/kunde/termin/[token]/actions.ts:100` | besichtigungsort_adresse | A | select: `besichtigungsort_adresse, claims:claim_id(...)` fuer ETA-Berechnung (Adress-Fallback). |
| 30 | `src/app/kunde/termin/[token]/page.tsx:80` | besichtigungsort_adresse | A | select: `kennzeichen, besichtigungsort_adresse, lead_id, claims:claim_id(...)` fuer Kunden-Termin-Status-Page. |
| 31 | `src/app/kunde/termine/[id]/page.tsx:41` | besichtigungsort_adresse | A | select: `..., besichtigungsort_adresse, claims:claim_id(...)` fuer Kunden-Termin-Detailseite. |
| 32 | `src/lib/actions/storno-actions.ts:42` | re_termin_token | A | select: `claim_id, lead_id, re_termin_token, claims:claim_id(kunde_no_show_count)` — Token-Lesen vor No-Show-Processing. |
| 33 | `src/lib/actions/storno-actions.ts:69` | no_show_gemeldet_am | C | WRITE: `.update({ no_show_gemeldet_am: new Date().toISOString() }).eq('id', fallId)` — No-Show-Zeitstempel setzen. |
| 34 | `src/lib/actions/storno-actions.ts:84` | no_show_gemeldet_am | C | Zweite faelle-Update-Stelle fuer no_show (guard-less refresh nach Count >= 2 — gleicher Hit-Block). |
| 35 | `src/lib/actions/storno-actions.ts:123` | re_termin_token | C | WRITE: `.update({ re_termin_token: reTerminToken, re_termin_token_eingelaufen_am: null }).eq('id', fallId)` — Token persistieren. |
| 36 | `src/lib/actions/termin-verlegung-actions.ts:163` | besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng | B | select: `id, besichtigungsort_{adresse,lat,lng}, claims:claim_id(...)` fuer Verlegungs-Routen-Berechnung (Slot-Finder). |
| 37 | `src/lib/actions/termin-verlegung-actions.ts:384` | besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng | B | Zweite Verlegungs-Stelle (bestaetigeNeuenSlot) — identisches select-Muster. |
| 38 | `src/lib/auftrag/aktiver-auftrag.ts:29` | besichtigungsort_lat, besichtigungsort_lng | A | select: `besichtigungsort_lat, besichtigungsort_lng, claims:claim_id(...)` fuer aktueller-Auftrag-Ziel-Koordinaten. |
| 39 | `src/lib/claims/get-kunde-faelle.ts:397` | besichtigungsort_adresse, nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am | B | select: `..., besichtigungsort_adresse, ..., nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am` — Kunden-Fall-Detailansicht SSoT-Query. |
| 40 | `src/lib/dispatch/findBestSV.ts:210` | besichtigungsort_lat, besichtigungsort_lng | A | select: `id, besichtigungsort_lat, besichtigungsort_lng` — Routen-/Reachability-Check im SV-Finder. |
| 41 | `src/lib/dispatch/konfrontations-dispatch-lite.ts:59` | nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am | A | select: `id, sv_id, claim_id, nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am, ...` fuer Konfrontations-Lite-Dispatch. |
| 42 | `src/lib/dispatch/reachability.ts:103` | besichtigungsort_lat, besichtigungsort_lng | A | select: `id, besichtigungsort_lat, besichtigungsort_lng` — Reachability-Check (Batch #1). |
| 43 | `src/lib/dispatch/reachability.ts:247` | besichtigungsort_lat, besichtigungsort_lng | A | select: `id, besichtigungsort_lat, besichtigungsort_lng` — Reachability-Check (Batch #2, Tagesrouten-ETA). |
| 44 | `src/lib/email/google/flows.ts:65` | besichtigungsort_adresse | A | select: `..., besichtigungsort_adresse, ...` fuer Kunde-Welcome-Email (Termin-Ort). |
| 45 | `src/lib/email/google/flows.ts:314` | besichtigungsort_adresse | A | select: `..., besichtigungsort_adresse, ...` fuer Kanzlei-Auftragszusammenfassung-Email. |
| 46 | `src/lib/email/google/flows.ts:786` | besichtigungsort_adresse | A | select: `id, lead_id, besichtigungsort_adresse, claims:claim_id(...)` fuer SV-Termin-Notification-Email. |
| 47 | `src/lib/google-calendar/sv-event-sync.ts:121` | besichtigungsort_adresse | A | select: `fahrzeug_*, kennzeichen, besichtigungsort_adresse, lead_id, claims:claim_id(claim_nummer)` fuer GCal-Event-Sync (Adresse als location). |
| 48 | `src/lib/google-calendar/sv-termin-sync.ts:64` | besichtigungsort_adresse | A | select: `besichtigungsort_adresse, kennzeichen, ..., claims:claim_id(claim_nummer, schadenort_*)` fuer GCal-Termin-Sync. |
| 49 | `src/lib/kalender/caldav/sv-termin-sync.ts:70` | besichtigungsort_adresse | A | select: identisch wie #48 fuer CalDAV-Termin-Sync. |
| 50 | `src/lib/lexdrive/process-event.ts:525` | nachbesichtigung_sv_termin_vereinbart_am | A | select: `kunde_id, nachbesichtigung_sv_termin_vereinbart_am` — fuer Mitteilung "SV bestätigt Konfrontation". |
| 51 | `src/lib/reminders/sv-reminder.ts:37` | besichtigungsort_lat, besichtigungsort_lng | A | select: `besichtigungsort_lat, besichtigungsort_lng` fuer Fahrzeit-Berechnung Ziel-Termin. |
| 52 | `src/lib/reminders/sv-reminder.ts:78` | besichtigungsort_lat, besichtigungsort_lng | A | select gleich (vorheriger Termin des Tages). |
| 53 | `src/lib/termine/actions.ts:138` | besichtigungsort_lat, besichtigungsort_lng | A | select: `id, lead_id, besichtigungsort_lat, besichtigungsort_lng, claims:claim_id(...)` fuer GPS-Ankunfts-Action. |
| 54 | `src/lib/termine/bestaetigung.ts:51` | besichtigungsort_adresse | A | select: `lead_id, besichtigungsort_adresse` fuer Bestaetigungs-WhatsApp-Nachricht. |
| 55 | `src/lib/termine/get-by-token.ts:76` | besichtigungsort_adresse | A | select: `lead_id, fahrzeug_*, kennzeichen, besichtigungsort_adresse, claims:claim_id(claim_nummer)` fuer Termin-by-Token. |
| 56 | `src/lib/termine/sv-ablehnung.ts:114` | besichtigungsort_adresse | A | select: `id, besichtigungsort_adresse` fuer Auto-Dispatch nach SV-Ablehnung. |
| **Test/Admin Out-of-Scope** | | | | |
| OOS1 | `src/app/api/admin/create-test-fall/route.ts:121` | besichtigungsort_{adresse,lat,lng} | C | INSERT test-faelle mit Testdaten; Out-of-Scope aber trotzdem in PR2 umstellen. |
| OOS2 | `src/app/api/admin/test/cmm48-smoke/route.ts:137` | besichtigungsort_adresse | A | Smoke-Read; Out-of-Scope; trotzdem umstellen. |

---

## 4. DUP-Spalten — Separate Auflistung

Die 2 DUP-Spalten (`geschaetzte_fahrzeit_min` → `gutachter_termine.geschaetzte_fahrtzeit_min` und `gcal_event_id` → `gutachter_termine.google_event_id`) erscheinen in **KEINEM** der 60 Hits. Das bedeutet: kein `from('faelle')` Query greift direkt auf diese Spalten zu.

**Erklarung:** 
- `geschaetzte_fahrzeit_min` wird in der cron `gutachter-erinnerungen` aus dem View `v_faelle_mit_aktuellem_termin` gelesen (Zeile 37+71 — `.select('..., geschaetzte_fahrzeit_min, ...')` auf dem View, nicht auf `faelle` direkt). → Pattern E (View handelt es), kein Code-Change.
- `gcal_event_id` erscheint nur in `database.types.ts` (Typ-Definition) und ggf. in GCal-Sync-Code der `gutachter_termine` direkt beschreibt. Kein direkter `from('faelle')` Query darauf.

**Naechster Schritt DUP:** In PR2 muss `v_faelle_mit_aktuellem_termin` ueberprueft werden ob sie `geschaetzte_fahrzeit_min` exposed. Wenn ja: View-Repoint auf `gutachter_termine.geschaetzte_fahrtzeit_min`. Fuer `gcal_event_id` / `google_event_id` ebenfalls View-Check.

**Breitere Suche DUP-Spalten (keine faelle-Queries, aber Property-Accesses):**

```
geschaetzte_fahrzeit_min: nur in database.types.ts + cron-view-read (v_faelle_mit_aktuellem_termin)
gcal_event_id: nur in database.types.ts
```

DUP-Spalten erfordern in PR2 keinen direkten Call-Site-Umbau im Sinne der Pattern A/B/C (da keine `from('faelle')` Queries), aber den View-Repoint im Schema.

---

## 5. Out-of-Scope Liste

| Datei | Grund |
|---|---|
| `src/lib/supabase/database.types.ts` | Auto-generierte Typen — werden nach Migration via `supabase gen types` neu generiert |
| `src/lib/smoke/lifecycle-seed.ts` | Smoke/Test-Seed — Code sollte trotzdem in PR2 mitgezogen werden |
| `src/app/api/admin/create-test-fall/route.ts` | Test-Hilfs-Route — in PR2 trotzdem umstellen (kein produktiver User-Flow, aber Code bleibt valide) |
| `src/app/api/admin/test/cmm48-smoke/route.ts` | Smoke-Test-Route — wie oben |
| `src/lib/dispatch/karte/triage-leads.ts` | Liest `leads`, nicht `faelle` — kein Hit, korrekt kein Zugriff |
| `src/lib/dispatch/karte/types.ts` | Nur TypeScript-Typen fuer `leads` — kein DB-Query |

---

## 6. Aggregation

### Nach Pattern

| Pattern | Anzahl True-Sites | Beschreibung |
|---|---|---|
| **A** (faelle-Read, single col) | 37 | Direktes Select der SP-D-Spalte(n) aus faelle |
| **B** (faelle-Read, mixed cols + lat/lng) | 7 | Select umfasst mehrere Besichtigungsort/Nachbesichtigung-Felder inkl. Koordinaten |
| **C** (faelle-Write) | 12 | Update/Insert schreibt SP-D-Spalte auf faelle |
| **D** (nested faelle embed) | 0 | Keine nested-Hits |
| **DUP** (geschaetzte_fahrzeit_min / gcal_event_id) | 0 | Keine direkten from('faelle') Queries; DUP via View-Repoint |
| **OOS Test/Admin** | 2 | Out-of-Scope aber trotzdem umzustellen |
| **E (View-Lesen)** | — | `v_faelle_mit_aktuellem_termin` deckt einige Reads ab (cron gutachter-erinnerungen: View-Read, nicht in Grep) |

### Nach Spalte (True Sites)

| Spalte | Sites |
|---|---|
| `besichtigungsort_adresse` | 27 |
| `besichtigungsort_lat` + `besichtigungsort_lng` | 11 (meist zusammen) |
| `besichtigungsort_place_id` | 2 (Feldmodus + Heute) |
| `nachbesichtigung_status` | 5 |
| `nachbesichtigung_sv_konfrontation_gewuenscht` | 2 |
| `nachbesichtigung_sv_termin_vereinbart_am` | 2 |
| `nachbesichtigung_termin_datum` | 2 |
| `nachbesichtigung_angefordert_am` | 2 |
| `re_termin_token` | 4 |
| `re_termin_token_eingelaufen_am` | 3 |
| `re_termin_eskalation_an_kb_am` | 1 |
| `no_show_gemeldet_am` | 2 |
| `wunschtermin` | 1 |
| `sv_termin_dokument_reminder_gesendet_am` | 2 |
| `losfahren_erinnerung_gesendet` | 1 |
| `termin_erinnerung_5min_gesendet` | 1 |

---

## 7. PR2-Chunking-Empfehlung

**56 True Sites (inklusive OOS) sind gut handhabbar in 2 PRs** (Schwelle 60 nicht erreicht). Empfohlene Aufteilung:

### PR2a — Reads (Pattern A + B) + kalender-relevante Libs
- `src/lib/*` Reader-Sites (findBestSV, reachability, auftrag, reminders, termine/*, google-calendar/*, kalender/*, email/google/flows)
- `src/app/gutachter/**` Reads
- `src/app/admin/**` Reads
- Ca. 32 Sites

### PR2b — Writes (Pattern C) + Kunde-Portal + Re-Termin-Flow + Crons
- `src/app/kunde/**` (nachbesichtigung, re-termin, termin, faelle)
- `src/app/api/cron/**` Write-Sites
- `src/lib/actions/**` (storno, termin-verlegung)
- `src/lib/dispatch/konfrontations-dispatch-lite.ts`
- `src/lib/lexdrive/process-event.ts`
- Ca. 26 Sites

Beide PRs koennen sequenziell nach PR1-staging-Merge entstehen. PR2b koennte parallel zu PR2a gated bleiben bis PR2a gruen ist.

---

## 8. Kritische Notizen fuer PR2-Implementierung

1. **Besichtigungsort-Koordinaten**: Viele Stellen lesen `besichtigungsort_lat/lng` direkt aus `faelle` fuer Routing-Berechnungen (reachability, findBestSV, reminders). Nach PR2 muss der Join auf `gutachter_termine` (aktueller Termin) die gleichen Koordinaten liefern — Backfill in PR1 muss sicher sein.

2. **Write-Sites Pattern C**: Schreibt auf die `faelle`-Zeile via `fall.id` oder `fall_id`. In PR2 muss pro Write die aktuelle GT-Zeile aufgeloest werden (z.B. `SELECT id FROM gutachter_termine WHERE fall_id=$1 ORDER BY start_zeit DESC LIMIT 1`). Bei Crons, die nur eine View-Row haben, ist `termin.id` = Fall-ID — die GT-Zeile muss separat aufgeloest werden.

3. **Besichtigungsort auf `faelle` bleibt**: Die `besichtigungsort_*`-Spalten auf `faelle` sterben erst in Phase 6 (DROP TABLE). In PR2 wird nur der Reader/Writer-Code umgestellt, nicht die Spalten geloescht. Kein Dual-Write (analog SP-B/SP-G/SP-H).

4. **No-Show / Re-Termin Token Semantik**: `no_show_gemeldet_am` und `re_termin_token*` haben eine enge sachliche Verbindung — beide in `storno-actions.ts`. In PR2 muessen beide gemeinsam auf den aktuellen Termin umgestellt werden (atomic: wenn no-show = der zugehoerige Termin war gerade "bestaetigt").

5. **`wunschtermin` in `sv-zuweisung`**: Zeile 301 liest `wunschtermin` aus faelle, reicht es an `triggerGutachterTerminTask` weiter. Nach PR2 kommt `wunschtermin` aus dem aktuellen GT. Sonderfall: beim ersten SV-Zuweisungs-Vorgang existiert noch kein Termin — muss als null-safe behandelt werden.

6. **View `v_faelle_mit_aktuellem_termin`**: Cron `gutachter-erinnerungen` liest `losfahren_erinnerung_gesendet`, `termin_erinnerung_5min_gesendet`, `geschaetzte_fahrzeit_min` aus dem View (nicht direkt aus faelle). Der View-Repoint (PR1-View-Migration) muss diese Spalten korrekt aus dem aktuellen GT exponieren, bevor die Cron-Write-Stellen (#2, #3) auf GT umgestellt werden. **Abhangigkeit:** PR2 fuer diese beiden Write-Sites erst nach View-Repoint-Migration!
