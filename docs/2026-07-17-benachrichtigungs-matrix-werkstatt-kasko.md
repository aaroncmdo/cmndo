# Benachrichtigungs-Matrix — Werkstatt-/Kasko-Strecke: Code-IST vs. echte Sends (Audit 17.07.2026)

**Auftrag:** Handoff-Task #22 der werkstatt-embed-Lane („Benachrichtigungs-Matrix gegen echte
Sends verifizieren"). **Methode:** (1) Code-IST — alle Send-/Notification-Punkte der Strecke
Embed → Lead → Flow → convert → Werkstatt-Loop per Code-Read; (2) prod-Empirie READ-only —
was hat der reale Full-E2E vom 16.07. (Fixture `SMOKE-E2E-1607`, Lead `69e8d3da`, Claim
`39734007`) in `email_log` + `mitteilungen` tatsaechlich ausgeloest; (3) Soll-Abgleich gegen
die DB-Szenario-Matrix (`flow_szenario_steps`). Kein neuer Send-Traffic erzeugt.

## 1 · IST-Matrix

| Ereignis | Kunde | Werkstatt | Staff (Dispatch/KB/Admin) | Beleg |
|---|---|---|---|---|
| Embed-Submit (Lead + FlowLink-Mint) | — (nur Redirect in /flow; `ensureCanonicalFlowLinkForLead` mintet, sendet nicht) | — | — | Code `embed/werkstatt-finder/actions.ts:312` + prod: 0 Zeilen |
| FlowLink geoeffnet | — | — | admin-Mitteilung „Kunde hat FlowLink geoeffnet" | prod 16.07. 20:14 ✓ |
| convert (`erzeugeSelbstzahlerClaim`) | **NICHTS** (kein Send, kein Account) | — | Dispatch-Mitteilung „Neuer Kasko-Fall" (non-fatal try/catch) | Code + prod 20:17 ✓ |
| Auto-KB-Beratungstermin (DB-Trigger `create_auto_beratungstermin`) | Flow-Anzeige (kein Send) | — | **NICHTS an den KB** | prod: Termin 16.07. angelegt, 0 KB-Mitteilungen in der Stunde |
| Werkstatt-Vermittlung (`vermittlung-server.ts:notifyAfterAssign`) | WA + Email (`notifyKundeWerkstattVermittlung`, :272) | Email „Neuer Auftrag" (`notifyWerkstattNeuerAuftrag`, :305) | — | Code ✓ (beidseitig verdrahtet) |
| Reparaturtermin-Loop (werkstatt_vorschlag / bestaetigt / erledigt …) | Email + In-App (`notifyKundeReparaturtermin`, 6 Call-Sites in `werkstatt/(shell)/auftraege/*`) | Kundenreaktion → Werkstatt (`notify-werkstatt-kundenreaktion`) | — | Code ✓ |
| Lead-Nurture (Cron `send-lead-reminders`) | Email mit Resume-Link, bis zu 4 Stufen (`reminder_1..4_sent_at`) — Scope: `status='neu'`, nicht disqualifiziert, source NOT IN (makler-anfrage, manuell) → **werkstatt_finder ist drin** ✓ | — | Dispatch-Sammel-Mitteilung bei Timeout-Disqualifikation | Code + prod: r1=3, r2=1 gesetzt → **läuft** |

## 2 · Befunde

### N1 (P1) — Kasko-/Selbstzahler-Kunde nach convert: keinerlei Send, kein Account, kein Zugang
Die Szenario-Matrix SIEHT einen `account`-Step vor (kasko/selbstzahler: `zusammenfassung >
feststellung > ort_fahrzeug > werkstatt > account`) — real wird er nicht erreicht: convert
feuert am Feststellungs-Ende („Geschafft"-Screen), `createKundeAccount` (flow/actions.ts:313,
verschickt die Welcome-Mail + Magic-Link) wird auf dieser Strecke nie gerufen.
**Prod-Empirie:** 0 `werkstatt_finder`-Leads mit `kunde_id`, kein auth-User zur Smoke-Email,
0 Kunde-Emails auf der gesamten E2E-Strecke. Zusammen: **Tab zu = Fall-Zugang weg** — und der
Nurture-Cron greift nach convert nicht mehr (status='konvertiert' faellt aus dem Scope).
**Wechselwirkung:** Der ZB1-Skip-Bug (Befund 1 → #4469, Fix noch nicht deployed) beendete die
Feststellung vorzeitig — nach dem Deploy re-checken, ob der account-Step dann erreicht wird.
Unabhaengig davon fehlt ein Send-Netz: **Fall-Bestaetigungs-Email mit Flow-Link beim convert**
(non-critical try/catch, Muster der Dispatch-Mitteilung daneben) waere das Minimal-Netz.
**Heimat: aar-956-Lane** (convert/Feststellung = deren aktive Zone; Kollisionsvermeidung).

### N2 (P1) — Auto-KB-Beratungstermin ohne KB-Benachrichtigung
Der Trigger legt `gutachter_termine` (typ=`kb_beratung`, kanal=`telefon`) an — der KB erfaehrt
davon **nur durch Kalender-Blick**. Prod-belegt am Smoke: Termin fuer Fr 17.07. 10:00 bei
„Maik" angelegt, null Mitteilung/Email an den KB. Ein echter Kunde haette auf einen Anruf
gewartet, von dem der Berater nichts wusste (Berater-No-Show ab Werk).
**Fix-Idee:** Mitteilung (+ ggf. Email) an `kb_id` beim Auto-Booking — App-seitig oder als
Trigger-Nachgang. **Heimat: aar-956** (deren Trigger, frisch gehaertet in Mig `20260716222723`).

### N3 (P1) — Lead-Nurture verlinkt ins 404: `/schaden-melden/fortsetzen/<token>` existiert nicht
`sendLeadReminderEmail` baut `resumeUrl()` auf `/schaden-melden/fortsetzen/<reminder_token>`
(`src/lib/email/lead-reminders.ts:41`) — die Route existiert **weder im App- noch im
Marketing-Build** (Voll-Grep beide Baeume). Der Cron LÄUFT (prod: `reminder_1_sent_at`=3,
`reminder_2_sent_at`=1) → es sind bereits echte Nurture-Mails mit totem Link raus.
(Nebenbefund: die Sends erscheinen nicht in `email_log` — Logging-Luecke des Reminder-Pfads.)
⚠ **Nicht von dieser Lane fixen:** `send-lead-reminders/route.ts` ist im Haupt-Checkout
aktuell uncommitted modifiziert — dort arbeitet eine Lane aktiv; Befund per Marker dorthin.
Fix-Optionen: Route bauen (resume → kanonischer FlowLink-Redirect waere fuer flow-basierte
Leads die richtige Semantik) ODER resumeUrl auf `/flow/<flow_token>` umstellen (Token-Join).

### Positiv (kein Handlungsbedarf)
Der Werkstatt-Loop ist vollstaendig benachrichtigt (Vermittlung beidseitig Kunde+Werkstatt,
Termin-Loop 6 Ereignisse, Kundenreaktion→Werkstatt); Dispatch-Transparenz (FlowLink-Open,
neuer Fall) prod-belegt; Nurture-Scope deckt werkstatt_finder-Leads ab.

## 3 · Wer macht was

| Befund | Lane | Aufwand |
|---|---|---|
| N1 Bestaetigungs-Mail beim convert + account-Step-Recheck nach #4469-Deploy | aar-956 (Marker) | S |
| N2 KB-Benachrichtigung beim Auto-Booking | aar-956 (Marker) | XS–S |
| N3 Reminder-404 + email_log-Logging | Reminder-Lane (Haupt-Checkout, uncommitted WIP) / Aaron-Routing | S |

Rueckfragen: werkstatt-embed-Lane (Session 8750c452), [[coordination-werkstatt-embed-rebuild]].
