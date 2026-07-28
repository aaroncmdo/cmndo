# A3 · Notification-Matrix

> Fundament-Paket **A3** (`docs/fundament/FUNDAMENT.md` §3). Matrix **Event × Rolle × Kanal → Template**,
> plus **LÜCKE**-Zellen (P1/P2) und **Dedup**-Spalte je Sende-Pfad. Die LÜCKEN (§5) sind der Arbeitsvorrat
> für **C3 (Notification-Outbox — Eine Outbox für alles Ausgehende, mit Dedup)**.
>
> **Erhebung:** 28.07.2026, Session 8c6de199, gegen `origin/staging` im frischen Worktree. Belege = `file:line`.
> **Scope-Zaun (§0.2):** nur registrieren, **keine Sends bauen/ändern** — Funde sind LÜCKE + Notiz, Fix ist C3.

## Rollen & Kanäle
**7 Rollen:** kunde · sachverstaendiger · makler · kundenbetreuer · admin · flottenmanager · kanzlei.
**5 Kanäle:** whatsapp · email · web_push · native_push · in_app. **3 Prioritäten:** low · normal · urgent.
Legende: ✓ vorhanden · ✗ fehlt/LÜCKE · ~ teilweise.

---

## 1 · Drei überlappende Sende-Welten (zentrale Erkenntnis)

Für dieselben Fall-Anlässe existieren **drei parallele Sende-Systeme**. Welche Rolle eine Nachricht bekommt —
und ob dedupliziert wird — hängt davon ab, **welches System der Code am jeweiligen Anlass ruft**:

| System | Kern | Achse | Empfänger | Dedup | Cron-Fallback | Preferences |
|---|---|---|---|---|---|---|
| **1 · Kanonisch** | `emitEvent` (`lib/notifications/emit.ts`) → `notification_events` → `fan-out.ts` → `EVENT_MATRIX` (`channel-matrix.ts`) → `channels/*` | **Event** (58 Typen) | **alle** Fall-Beteiligten (fan-out mit Gates) | ✓ `notification_deliveries` | ✓ Worker `*/5min` | ✓ (N5) |
| **2 · Fall-Templates** | `sendFallCommunication` (`lib/communications/send-fall.ts`) → `COMMUNICATION_REGISTRY` (`registry.ts`) → `send.ts` | **Trigger** (~50 Namen) | **EIN** Empfänger (kunde/sv/kb) | ✗ **keiner** | ✗ fire-and-forget | ✗ |
| **3 · Direkt-Helper** | `notifyNewLead` / `notifyFlottenmanager*` / `notifyNeuerFall` / `createNotification`→`benachrichtigungen` / `createGutachterMitteilung`→`mitteilungen` / direkte Inserts | **ad-hoc** je Call-Site | je Call-Site (Team/dispatch/admin/…) | ✗ (Ausnahme: `erstelleVsDispatchTask`) | ✗ | ✗ |

**System 1 ist die „richtige" Infrastruktur** — event-getrieben, fan-out an alle Rollen, mit Dedup + Cron-Fallback +
Preferences, und die 17.07.-Multi-Rollen-Fixes (Flotte/Kanzlei/KB, s. §2) leben darin. **Es ist aktiv** (emitEvent
in 21 Files + DB-Crons). **Aber System 2 und 3 laufen parallel daran vorbei** — ohne Dedup, ohne Cron-Fallback, teils
Kunde-only. Genau das ist die C3-Rechtfertigung: alle Sends durch **eine** Outbox mit Dedup leiten.

**Zwei In-App-Tabellen (Fragmentierung):** das kanonische fan-out schreibt In-App in **`mitteilungen`**
(`channels/in-app.ts:258`). Daneben lebt die Legacy-Tabelle **`benachrichtigungen`** (`createNotification`
`lib/notifications.ts:3`, ~28 Files). Dieselbe Sache kann in zwei getrennten Bells landen — oder, je nach
UI-Reader, in einer verpasst werden.

---

## 2 · System 1 — die kanonische Event-Matrix (EVENT_MATRIX)

Vollständig in `src/lib/notifications/channel-matrix.ts` (`EVENT_MATRIX`, 58 Events × Rolle → Kanäle + Priorität) +
`fan-out.ts` (Empfänger-Auflösung). **Hier die Struktur + die Gates + der Live-Status (wird das Event tatsächlich emittiert?).**

**Empfänger-Gates (`fan-out.ts` `loadClaimParticipants`):**
- kunde/sv/kb: direkt aus `claims` (`geschaedigter_user_id`/`sv_id`/`kundenbetreuer_id`).
- **makler:** nur bei aktivem `makler_fall_consent` (`:48`) — kein Consent = stumm.
- **flottenmanager:** via `claims.vehicle_id → flotten_fahrzeuge → firmen_flotten_konten(aktiv)` (`:71`).
- **kanzlei:** nur bei `kanzlei_faelle`-Row (`:96`) + ALLE `rolle='kanzlei'`-Profile — **⚠ keine User↔Kanzlei-Brücke** (Single-Kanzlei-Realität; Multi-Kanzlei = TODO im Code).
- Sonderfälle: `task.*`/`makler.*`/`gast.conversion_reminder` = Payload-`userId` (nicht claim-basiert).

**Live emittiert** (emitEvent-Call-Sites, verifiziert):
- **Status-Engine** `state-machine.ts:342-360` → `fall.storniert`, `kanzlei.uebergabe`, `fall.status_changed` (×2)
- **Endzustände** `endzustand-actions.ts:175-470` → `claim.in_kommunikation_vs`, `reguliert`, `abgelehnt`, `storniert`, `an_externe_kanzlei_uebergeben`, `klage_rechtsstreit`, `verjaehrt`
- **Termine** `termin-actions.ts` → `sv_abgelehnt`, `sv_gegenvorschlag`, `sv_bestaetigt`; `termine/actions.ts` → `sv_unterwegs`, `sv_angekommen`, `sv_abgeschlossen`; `termin-verlegung-actions.ts` → alle `verlegung_*` + `verschoben_durch_kunde`
- **Dokumente** `ad-hoc-anforderung.ts` → `dokument.fehlt`; **Chat** `send-chat.ts` + `twilio/inbound-kb-whatsapp` → `nachricht.received`
- **Mietwagen** `mietwagen/cron.ts` → `ueber_limit`/`abgabe_naht`/`rechnung_ausstehend`
- **Kanzlei** `kanzlei/actions.ts` → `claim.kanzlei_paket_versendet`; **Makler** `notify-makler-provision.ts` → `provision_status`; `convert-lead-to-claim.ts` → `lead_eingegangen`
- **Flow** `flow/actions.ts:1554` → `fall.created`, `sa.signed`; **Tasks** `create-task.ts` → `task.created`
- **DB-Crons** (schreiben `notification_events` direkt, mit Existenz-Dedup `SELECT 1 FROM notification_events`): `cron_vs_frist_reminder`, `cron_verjaehrungs_warner`, salesforce-sync (`baseline_public_schema.sql:1071/1268/1627`)

**Die 17.07.-Multi-Rollen-Fixes (im EVENT_MATRIX):** `fall.created`+flottenmanager (P1.1); KB-Rückport auf `fall.sv_assigned`/`status_changed`/`storniert`/`termin.*` (P1.3); kanzlei auf `claim.reguliert`/`an_externe_kanzlei_uebergeben`/`kanzlei_paket_versendet` (P1.2); `claim.kanzlei_re_frage_due`+KB/Admin (P0.5). **Diese Fixes wirken NUR, wo das Event tatsächlich emittiert wird** — s. Redundanz-Risiko §5.

**⚠ Kanal-Lücke in der Matrix selbst:** **flottenmanager ist überall nur `['in_app']`** (6 Einträge: `channel-matrix.ts:25,47,59,340,353,363`) — nie WhatsApp/Email. Der einzige WA-Draht zu FM ist System 3 (§4, `notifyFlottenmanager`).

---

## 3 · System 2 — Fall-Templates (COMMUNICATION_REGISTRY)

`src/lib/communications/registry.ts` — ~50 Trigger. `sendFallCommunication(fallId, triggerName)` lädt **einen**
Empfänger (kunde/sv/kb, `send-fall.ts:52-113`) und sendet WA/Email. **Kein Dedup, kein Cron-Fallback** (try/catch →
`{sent, reason}`, fire-and-forget im Caller).

**Trigger-Familien:** Kunde-WA (T1–T30: `flowlink_versand`, `fall_eroeffnet`, `termin_bestaetigt`, `reminder_24h/2h`,
`gutachten_fertig`, `kanzlei_uebergabe`, `as_gesendet`, `zahlung_eingegangen`, `eskalation_tag14/21/28`,
`sv_losgefahren/angekommen/verspaetet`, `no_show_kunde`, `nachbesichtigung_*` …) · SV-WA (`sv_tagesroute`,
`stellungnahme_beauftragt`, `sv_konfrontation_anfrage`) · Email (`welcome_*`, `sv_monatsabrechnung`,
`kanzlei_monatsabrechnung`, `sv_verifizierung_reminder_*`, `admin_*_failed`).

**Call-Sites** (`sendFallCommunication`, ~18): `dispatch-fall-actions.ts` (×9: sv_losgefahren, termin_bestaetigt,
regulierung_angekuendigt, fall_abgeschlossen, kanzlei_uebergabe, as_gesendet, zahlung_eingegangen, termin_storniert,
chat_fallback_kunde), `kanzlei-paket.ts` (as_gesendet, zahlung_eingegangen ×2), `gutachter/fall/actions.ts`
(gutachten_fertig), `filmcheck.ts` (kanzlei_uebergabe), `termine.ts` (kb_termin_bestaetigt),
`konditional-tasks.ts` (dokumente_nachreichen), `nachbesichtigung/actions.ts`, `sv-zuweisung/route.ts`.

**Überschneidung mit System 1** (dieselben Anlässe, zwei Systeme):

| Anlass | System 2 (Trigger) | System 1 (Event) | Risiko |
|---|---|---|---|
| Fall eröffnet | `fall_eroeffnet` (Kunde-WA) | `fall.created` (kunde+makler+admin+FM) | System 2 im `convertLeadToFall`-Wrapper (A4), `fall.created`-emit im `/flow` — **je Meldeweg unterschiedlich** ⇒ Rollen-Inkonsistenz |
| Termin bestätigt | `termin_bestaetigt` (`dispatch-fall-actions.ts:116`, Kunde) | `termin.sv_bestaetigt` (`termin-actions.ts:783`, kunde+sv+kb+…) | **beide Call-Sites existieren** → potenzieller Doppel-Send / je nach Pfad nur einer |
| Gutachten fertig | `gutachten_fertig` (`gutachter/fall/actions.ts:225`) | `gutachten.fertig` (`:231` selbe Datei!) | **beide in derselben Action** — Doppel-Send-Verdacht (verifizieren) |
| Kanzlei-Übergabe | `kanzlei_uebergabe` | `kanzlei.uebergabe` (Engine) | zwei Pfade |
| AS gesendet | `as_gesendet` | `kanzlei.as_gesendet` | zwei Pfade |
| Dok. nachreichen | `dokumente_nachreichen` | `dokument.fehlt` | zwei Pfade |

→ Die Kohärenz **je Anlass** (feuert beides = Doppel-WA / feuert nur System 2 = Rollen-taub) ist die Detail-Achse
für C3; die obigen sind die belegten Kollisionspunkte.

---

## 4 · System 3 — Direkt-Helper (am emit vorbei)

| Helper | file:line | Anlass | Empfänger | Kanal | Dedup |
|---|---|---|---|---|---|
| `notifyNewLead` | `lib/leads/notify-new-lead.ts:49` | jede public Lead-Anlage | **Team** (hardcoded `info@` + 2 WA-Nummern) | Email+WA | ✗ |
| `notifyFlottenmanagerSchadenGemeldet` | `lib/flotte/fm-schaden-notif.ts:43` | Schadenkarte-Meldung | flottenmanager | **WA** | ✗ |
| `notifyNeuerFall` | `flow/[token]/actions.ts:200` | neuer Fall aus Flow | alle admin | Email | ✗ |
| `createNotification` → `benachrichtigungen` (Legacy) | `lib/notifications.ts:3` | vielfältig (~28 Files) | je Call-Site (SV/KB/dispatch/admin/kunde) | In-App (Legacy-Bell) | ✗ |
| `createGutachterMitteilung` → `mitteilungen` | `lib/mitteilungen.ts:55` | SV-Ereignisse (~13 Call-Sites) | sachverstaendiger | In-App (kanonische Tabelle, aber am emit vorbei) | ✗ (nur `classify`-`drop`-Ventil) |
| `erstelleVsDispatchTask` → `tasks` | `lib/vs-meldung/dispatch-task.ts:61` | VS-Meldung-Fehler | dispatch | Task-Board | ✅ `task_code`+Existenz-Check |
| direkte `benachrichtigungen.insert` (×6) | gutachter-waitlist/werkstatt-/makler-registrieren/chat/twilio | Self-Signups, Chat | admin/kunde/KB/SV | In-App | ✗ |
| direkte `mitteilungen.insert` (×4) | public-rueckruf/gutachter-finder/embed/makler-anfrage | Rückruf/Buchung/Send-Fail | dispatch | In-App | ✗ |

**Einziger Pfad mit Dedup: `erstelleVsDispatchTask`** (`task_code = vs_meldung_<grund>:<claimId>` + Status-Existenz-Check).

---

## 5 · LÜCKEN-Matrix — C3-Priorisierung

**P1 — stille Fehler / Datenschaden:**
1. **Dedup fehlt in System 2 + fast ganz System 3** — jeder Aufruf = neuer Send. Die drei bekannten Dedup-Incidents
   (SA-signed, Schlussrechnung #4799, Nudge-30d) sind Symptome **dieser Klasse**. C3-Outbox mit `dedup_key UNIQUE` löst sie strukturell.
2. **Kein Cron-Fallback / stilles Sterben in System 2 + 3** — `sendFallCommunication` + alle Direkt-Helper sind
   fire-and-forget; ein Twilio-/Resend-Fehlschlag verschwindet im Log, erzeugt **keinen** sichtbaren Task (Verfassung §8).
3. **System 1 ↔ 2/3 Redundanz/Inkonsistenz** — mehrere Anlässe (termin_bestaetigt, gutachten_fertig, kanzlei_uebergabe,
   as_gesendet) haben Call-Sites in **beiden** Systemen → entweder Doppel-Notif (Kunde bekommt 2 WA) oder, wenn nur
   System 2 feuert, laufen die Multi-Rollen-Matrix-Fixes (§2) **ins Leere** (Makler/Flotte/Kanzlei bleiben taub, obwohl die Matrix sie listet).

   **🔴 Konkreter Beleg — der SA-Konversionsmoment (`signSAandCreateFall`, `flow/[token]/actions.ts`):** bei EINER
   Unterschrift feuern **6 Kunden-WhatsApp ohne gemeinsamen Dedup** — 4 direkte (`:750` Willkommen, `:1306`
   fall_eroeffnet, `:1312` info_nach_sa, `:1421` termin_bestaetigt) **plus** die kanonischen `fall.created` + `sa.signed`
   (`:1554-1555`). Keine davon Preference-gated. Dazu SV-seitig 3 direkte Sends (`:891` Email, `:928` WA, `:1348`
   `sv_tagesroute`) statt `termin.sv_bestaetigt`/`fall.sv_assigned` über emit, und ein Admin-**Email**-Loop (`:223`,
   obwohl die Matrix Admin=`in_app` sagt). **Fall-Event-direkt-statt-emit** (Redundanz-Klasse, alle ohne
   zentralen Dedup): A3/A5/A6/A7/A9/A10/A11 (`flow/actions.ts`), B1 (`self-service-actions.ts:291`, Selbstzahler/Kasko —
   emittiert nie, Ad-hoc-HTML), E2 (`fm-schaden-notif.ts:66` — FM-WA statt Matrix-in_app). C3 muss diese Sends
   auf das Event-System heben ODER durch die Outbox deduplizieren.

**P2 — Rollen-Kanal-Lücken:**
4. **flottenmanager WhatsApp/Email-taub im kanonischen System** — Matrix hat FM nur `['in_app']`; der einzige
   WA-Draht (`notifyFlottenmanager`) hängt an **einem** Call-Site (Schadenkarte) ohne Fallback.
5. **kanzlei ohne Direkt-Netz** — nur kanonisch bedient (kein Direkt-Helper); fällt das fan-out aus, kein Fallback.
   Zusätzlich: keine User↔Kanzlei-Brücke (alle `rolle='kanzlei'` bekommen ALLES — Multi-Kanzlei-Problem latent).
6. **Zwei In-App-Bells** (`mitteilungen` kanonisch vs. `benachrichtigungen` Legacy) — dieselbe Notif fragmentiert;
   Konsolidierung auf eine Surface ist C3/C4-nah.

**Abgrenzung für C3 (nicht jeder Direkt-Send ist eine Lücke):** legitim **off-taxonomy** und daher NICHT über die
Event-Matrix zu zwingen sind die **pre-claim-/Nicht-Fall-Sends** — FlowLink-Initial-Versand (`issue-canonical-flowlink.ts`,
`send-flowlink-multichannel.ts`), Credential-/Welcome-Mails (Account-Onboarding), Gegner-Airdrop (externe Partei,
**vorbildlich gededupt** via `findRecentGegnerLead`+Compare-and-Swap), interne Ops-Team-Alerts (`notifyTeamWhatsApp`,
feste Nummern), externe Kanzlei-B2B-Integration (remote-Dedup). Diese gehören trotzdem in die **Outbox** (Dedup +
sichtbarer Fehler-Task), aber NICHT in den claim-basierten fan-out. Die echte C3-Arbeit ist die **(b)-Klasse** (§5.3):
Fall-Events, die direkt gesendet werden, statt über emit → die gehören auf das Event-System gehoben.

---

## 6 · Offene Fragen an Aaron (max. 5)
1. **Doppel-Send verifizieren:** feuern für `termin bestätigt` / `gutachten fertig` **beide** Systeme (System-1-Event
   UND System-2-Trigger) → bekommt der Kunde 2 WhatsApp? (C3 muss das entweder deduplizieren oder ein System retiren.)
2. **System 2 (COMMUNICATION_REGISTRY) — Ziel:** in C3 komplett auf das Event-System (emit→Outbox) heben, oder als
   Template-Layer UNTER der Outbox behalten? (Es trägt die ~50 WA-Templates, die System 1 nicht dupliziert.)
3. **flottenmanager/kanzlei-Kanäle:** sollen FM/Kanzlei über In-App hinaus WA/Email im kanonischen fan-out bekommen
   (Matrix-Erweiterung), oder bleibt In-App bewusst?

## 7 · Nicht-Ziele (A3)
Keine Sends bauen/ändern (das ist C3). Keine neuen Templates/Events. Reine Ist-Aufnahme. Die Event-Achse ist mit dem
parallelen **A2 (State-Machine)** abzugleichen — die `fall.status_changed`/Endzustand-Events sind der Berührungspunkt.
