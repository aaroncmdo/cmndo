# Werkstatt-Onboarding-Aktivierungs-Drip (Ebene A) — Design

**Datum:** 2026-07-29
**Status:** Design freigegeben (Aaron), bereit für Implementierungs-Plan
**Quelle Content:** `Claimondo_Werkstatt_Onboarding_Mailsequenz_EbeneA.md` (6-Mail-Sequenz, Nicolas Kitta als Absender)

---

## 1. Ziel & Kontext

Frisch onboardete Werkstätten, die **noch keinen Fall geschickt haben**, sollen per zeitgetriggerter 6-Mail-Sequenz zur **Aktivierung** (erster Haftpflicht-Fall) geführt werden. Absender: **Nicolas Kitta persönlich, du-Form, warm.** Die Sequenz **stoppt**, sobald die Werkstatt ihren ersten Fall hat.

| Mail | Tag (Offset ab Onboarding) | Zweck | Kern-Baustein |
|------|-----|------|------|
| 1 | 0 | Willkommen / Reflex (Aufsteller steht) | Hero + Button |
| 2 | 3 | Werkstatt-Nutzen (4 Blöcke) | Card/Blocks |
| 3 | 6 | SV-Vorstellung (Region) | **BeraterCard** (dynamischer SV) |
| 4 | 9 | Kundenstory (Zitat) | Card/Hero |
| 5 | 13 | Starter-Bonus (200 €) | Hero/Button — **`aktiv=false` bis Legal grün** |
| 6 | 20 | Reaktivierung (3-Punkte-Einwand) | Card/Blocks |

## 2. Leitentscheidungen (verankert)

1. **Kein Hardcode** — Timing + Copy + Sequenz-Struktur leben in der **DB**, nicht im Code/Deploy-Zyklus. Marketing (Nicolas) iteriert ohne Deploy.
2. **react-email-Struktur + DB-Copy-Slots** — der Look/die Komposition (gebrandet, `BeraterCard`) bleibt Code; nur die editierbaren **Texte** (Betreff, Preheader, Copy-Slots, CTA-Label) liegen in der DB, validiert gegen ein pro-Template typisiertes zod-Schema.
3. **Werkstatt-spezifisch (YAGNI)** — **kein** generisch-polymorpher Lifecycle-Engine. Wenn SV-/Makler-Onboarding später denselben Bedarf hat, wird generalisiert (Refactor), nicht vorab.
4. **Dynamischer SV-Resolver** — Mail 3 zeigt den SV, den **Dispatch real der Region zuweisen würde** (`findeBestePerson`), **keine** hardcodierte Region→SV-Liste.
5. **NICHT die Cold-Mail-Engine** — bewusst verworfen: sie ist FK-fest an `partner_leads` (kalte Prospects) gekoppelt, sendet aus dem Outreach-Stream `partner@claimondo.de`, hat kein „erster-Fall"-Stop und kein SV/Region-Feld. Ein Lifecycle-Drip an einen **registrierten** Partner gehört auf den transaktionalen, gebrandeten `sendEmail`-Pfad. **Wiederverwendet** wird ihr *Design-Muster* (Step + Delay + Due-Scan-Cron + Advance-State), nicht ihre gekoppelten Tabellen.

## 3. Architektur-Überblick

```
Onboarding-Event (werkstaetten.status='aktiv')
        │  (idempotenter Trigger)
        ▼
werkstatt_onboarding_enrollments (werkstatt_id, aktueller_step, next_send_at, status)
        ▲                                   │
        │ täglicher Cron (assertCronAuth)   │ liest
        │  1. Stop-Check (erster Fall?)     ▼
        │  2. fälligen Step laden      werkstatt_onboarding_steps
        │  3. Copy+Merge auflösen      (position, offset_tage, template_key,
        │  4. render react-email        betreff, preheader, copy jsonb, aktiv)
        │  5. sendEmail (Nicolas)
        │  6. advance (next_send_at)
        ▼
sendEmail() ──► Resend/SMTP + email_log + List-Unsubscribe
   │
   └─ Merge-Resolver: {{werkstattName}}, {{tel}}, {{portalLink}},
        SV (Mail 3) via findeBestePerson → toOeffentlichesSvProfil → BeraterCard
```

## 4. Datenmodell

### 4.1 `werkstatt_onboarding_steps` (die DB-editierbare Sequenz)

Eine Zeile je Mail. Nicolas pflegt Timing + Copy hier.

| Spalte | Typ | Notiz |
|---|---|---|
| `id` | uuid PK | |
| `position` | int, unique, `> 0` | Reihenfolge (1..6) |
| `offset_tage` | int, `>= 0` | **absolut** ab `werkstaetten.aktiviert_am` (0/3/6/9/13/20) |
| `template_key` | text, CHECK-enum | `willkommen`/`nutzen`/`sv_vorstellung`/`kundenstory`/`bonus`/`reaktivierung` — mappt auf die react-email-Komponente |
| `betreff` | text | editierbar |
| `preheader` | text | editierbar |
| `copy` | jsonb | die Copy-Slots (siehe §5); validiert gegen das template-`copy`-zod-Schema |
| `aktiv` | boolean, default true | **Bonus-Step startet `false`** (Legal-Gate ohne Code) |
| `erstellt_am`/`aktualisiert_am` | timestamptz | |

- **CHECK** auf `template_key` = das feste Enum (neuer Wert zuerst per Migration in den CHECK → dann Snapshot; §flag-drift-Gate).
- **Seed:** 6 Zeilen mit den Texten aus dem Markdown (§9).

### 4.2 `werkstatt_onboarding_enrollments` (Fortschritt je Werkstatt)

| Spalte | Typ | Notiz |
|---|---|---|
| `id` | uuid PK | |
| `werkstatt_id` | uuid, **unique**, FK → `werkstaetten(id)` | ein Enrollment je Werkstatt (idempotent) |
| `aktueller_step` | int, default 0 | zuletzt gesendete `position` (0 = noch nichts) |
| `next_send_at` | timestamptz, null | wann der nächste aktive Step fällig ist; `null` = fertig/gestoppt |
| `status` | text, CHECK-enum | `aktiv`/`aktiviert`/`gestoppt`/`fertig` |
| `erstellt_am` | timestamptz | |

- **Status-Semantik:** `aktiv` = läuft · `aktiviert` = erster Fall kam → Ziel erreicht, Sequenz beendet · `gestoppt` = Opt-out/Suppression · `fertig` = alle Steps durch, kein Fall.
- **`status` in den flag-drift-Snapshot** aufnehmen (CHECK-Werte), sonst blockt das Gate spätere Writes nicht korrekt.

### 4.3 Wiederverwendet (keine neuen Tabellen)

- **`cold_mail_suppression`** (email PK, `grund in ('opt_out','bounce','beschwerde')`) — Opt-out-Gate; der Cron prüft vor jedem Send.
- **`email_log`** — jeder Send wird via `sendEmail` geloggt (Retry/Bounce-Sichtbarkeit).

### 4.4 RLS / Grants (default-closed)

Beide neuen Tabellen sind **intern** (nur Cron/Admin). Kein `anon`/`authenticated`-Werkstatt-Zugriff nötig.
- `service_role`: voll (der Cron nutzt `createAdminClient`).
- `admin`/`kundenbetreuer`-Lesen für die Admin-Edit-Seite (§7): explizite SELECT/UPDATE-Policy `TO authenticated USING (is_staff())` o.ä. — **nie `TO public`** (RLS-Policy-Gate).
- Default-Privilege-Wurzel (#4555): neue Tabellen granten `authenticated` **nichts** automatisch → explizite Grants nur für die benötigten Staff-Spalten. **Keine sensiblen Spalten** (das Modell hat keine) → Anon-Grant-Gate unkritisch, aber Tabelle bleibt anon-grant-frei.

## 5. Templates: react-email + Copy-Slots

Sechs react-email-Komponenten unter `src/lib/email/google/templates/aktivierung/` (gebrandet via `EmailShell`, Bausteine aus `@/lib/email/components`). Jede definiert:

1. **Eine typisierte Copy-Form** (zod), z. B.
   ```ts
   export const nutzenCopy = z.object({
     headline: z.string(),
     bloecke: z.array(z.object({ titel: z.string(), text: z.string() })).length(4),
     schluss: z.string(),
     cta_label: z.string(),
   })
   ```
2. **Die Komponente** `({ copy, merge }) => JSX` — rendert Struktur + Copy-Slots + Merge-Vars. Mail 3 nutzt `BeraterCard({ name, photoUrl, contact, label })` aus dem Merge-`sv`.
3. **`export function subject(copy, merge)`** — Betreff (kommt primär aus `steps.betreff`; die Funktion ist Fallback/Default).

**Registry:** `template_key → { Component, copySchema, defaultCopy }` in `templates/aktivierung/registry.ts`. Der Cron schlägt `template_key` nach, parst `steps.copy` gegen `copySchema` (bei Parse-Fehler: skip + Fehler-Log, **kein** kaputter Send), rendert via `render()` (`@react-email/render`).

**Warum so:** Copy in DB (kein Deploy für Text/Betreff-Änderung) **und** gebrandete react-email-Optik (kein Hand-HTML für Nicolas) **und** Typsicherheit (zod verhindert Schema-Bruch beim Edit).

## 6. Merge-Vars & dynamischer SV-Resolver

`buildWerkstattMergeVars(werkstatt, step)` liefert die Merge-Vars für den Render:

- **Statisch aus `werkstaetten`:** `werkstattName`, `ansprechpartner`, `portalLink` (Login-URL), `tel` (Nicolas' Nummer — aus Sequenz-/Env-Config, nicht pro-Werkstatt), Absender-Identität (Nicolas: `from_name`/`from_email`/`reply_to`).
- **SV (nur `sv_vorstellung`):** `findeBestePerson({ … Werkstatt-Standort … })` → Match → **`toOeffentlichesSvProfil`** (leak-sichere Whitelist: Name/Foto/Region/Kontakt) → `merge.sv`.
  - **Input-Adapter:** `findeBestePerson` erwartet einen Bezug/Standort-Input — beim Bau verifizieren, ob es aus `werkstaetten.lat/lng` (+ `adresse_ort/plz`) direkt gefüttert werden kann; sonst kleiner Adapter (Standort → Match-Input). **Kein** Termin wird geplant — nur der Match/Score gelesen.
  - **Fallback:** kein SV im Umkreis (`null`) → **Step `sv_vorstellung` überspringen** (advance auf den nächsten aktiven Step), **kein** Send einer SV-losen Karte.

## 7. Admin-Edit (Scope: MVP-minimal)

**MVP:** eine minimale Admin-Seite (Muster: bestehende `admin/vertrieb/_actions/cold-mail-sequenzen.ts`) — Liste der 6 Steps, je Step editierbar: `betreff`, `preheader`, `offset_tage`, `aktiv`-Toggle und die Copy-Slots (Formular aus dem zod-`copySchema` generiert). Das ist der konkrete „kein-Deploy"-Payoff für Nicolas.
- **Degradations-Pfad:** Falls das Admin-Formular den MVP sprengt, funktioniert die Engine auch mit **Studio-/SQL-Edit** der Zeilen (Copy als jsonb) — die Engine liest die DB so oder so. Das Formular ist dann Fast-Follow. Diese Entscheidung fällt im Implementierungs-Plan nach Aufwands-Schnitt.

## 8. Timing, State-Machine & Cron

### 8.1 Timing (absolut, driftfrei)

`next_send_at = werkstaetten.aktiviert_am + step.offset_tage` (**absolut** ab Onboarding). Robuster als das relative `delay_tage` der Cold-Mail-Engine: „Tag 6" bleibt Tag 6, auch wenn ein früherer Step verspätet ging. `advance.ts` (`planeNaechstenSchritt`/`zustandNachSend`) dient als **Referenzmuster** für Step-Skipping (inaktive Steps überspringen), die `next_send_at`-Formel selbst ist absolut (nicht 1:1 aus `advance.ts`).

### 8.2 Cron (`src/app/api/cron/werkstatt-onboarding-drip/route.ts`, täglich)

`assertCronAuth` → `createAdminClient` → Batch (`BATCH_CAP`, z. B. 100):

```
enrollments = SELECT status='aktiv' AND next_send_at <= now()   -- fällig
für jede enrollment:
  1. STOP-Check: hatErstenFall(werkstatt_id)?  → status='aktiviert', next_send_at=null; continue
  2. Opt-out-Check: email in cold_mail_suppression? → status='gestoppt'; continue
  3. step = nächster AKTIVER step (position > aktueller_step, aktiv=true, nach offset)
       → keiner mehr? status='fertig', next_send_at=null; continue
  4. merge = buildWerkstattMergeVars(werkstatt, step)
       → sv_vorstellung ohne SV-Match? step überspringen (goto 3 mit aktueller_step=step.position)
  5. copy = copySchema.parse(step.copy)   → Fehler? Error-Log, skip diese enrollment (kein Send)
  6. html = render(Component({copy, merge})); sendEmail({ ..., from: Nicolas, listUnsubscribe })
  7. aktueller_step = step.position; next_send_at = aktiviert_am + nextAktiverStep.offset_tage
       → kein weiterer aktiver Step? status='fertig', next_send_at=null
```

- **VPS-crontab-Eintrag** (Etc/UTC) — Muster `send-lead-reminders`. Idempotent/re-entrant (der `<= now()`-Scan + `aktueller_step`-Advance verhindert Doppel-Sends).
- **List-Unsubscribe** via `sendEmail`-Option; Unsubscribe-Route schreibt `cold_mail_suppression`.

## 9. Seed (die 6 Steps)

Als Daten-Migration (nach den DDL-Migrationen): 6 `werkstatt_onboarding_steps`-Zeilen mit `position/offset_tage/template_key` = (1,0,willkommen) (2,3,nutzen) (3,6,sv_vorstellung) (4,9,kundenstory) (5,13,bonus,`aktiv=false`) (6,20,reaktivierung); `betreff`/`preheader`/`copy` aus dem Markdown übernommen (Umlaute korrekt, du-Form). Merge-Platzhalter im Copy als `{{…}}` (Werkstattname/SV/Tel).

## 10. Enrollment-Trigger

Enrollment bei Onboarding anlegen (idempotent, `on conflict (werkstatt_id) do nothing`) an den 3 Freischalt-Punkten, wo `werkstaetten.status='aktiv', aktiviert_am=now()` gesetzt wird:
- `konvertierePartnerLead` (`admin/partner-leads/actions.ts`)
- Self-Register (`werkstatt/registrieren/actions.ts`)
- Admin-Anlage (`admin/werkstaetten/actions.ts`)

`next_send_at` initial = `aktiviert_am + step1.offset_tage` (= `aktiviert_am`, Mail 1 sofort fällig).

- **Mail-1-Timing (Default):** offset 0. Mail 1 ist **nicht** die transaktionale Login-Magic-Link-Mail (`WillkommenWerkstatt`, feuert bei Account-Anlage) — sie ist die **warme Aktivierungs-Willkommen** danach. In DB tunebar (offset 1), falls Kollisions-Gefühl.
- **Backfill (einmalig):** bestehende aktive Werkstätten ohne Fall optional per Skript enrollen (Offset ab `heute`, nicht ab altem `aktiviert_am`, sonst feuern alte Steps sofort). Entscheidung im Plan.

## 11. Stop-on-Aktivierung

`hatErstenFall(werkstattId)` (kanonisch, RLS-sauber):
```
EXISTS(SELECT 1 FROM partner_provisionen WHERE partner_typ='werkstatt' AND partner_id=$1)
  OR EXISTS(SELECT 1 FROM claims WHERE reparatur_werkstatt_id=$1)
```
`partner_provisionen` ist der kanonische Zählweg (UNIQUE je `(partner_typ, claim_id)`; `claims` hat keine Werkstatt-RLS). Treffer → `status='aktiviert'`. (Reine READ-Prüfung im service-role-Cron.)

## 12. Wiederverwendet vs. Neu

**Wiederverwendet (existiert):** `sendEmail()` (Resend/SMTP, email_log, List-Unsubscribe, Test-Isolation) · react-email-Kit (`EmailShell/Hero/Card/Button/Footer/BeraterCard/Blocks`) · `findeBestePerson`/`toOeffentlichesSvProfil` (Termin-Engine/`sv-matching-modul`) · `cold_mail_suppression` · `assertCronAuth` · VPS-crontab-Konvention · `advance.ts` (Referenzmuster).

**Neu zu bauen:** 2 Tabellen + Migration + Seed · 6 react-email-Templates + zod-Copy-Schemas + Registry · `buildWerkstattMergeVars` + SV-Adapter · `hatErstenFall`-Helper · der tägliche Cron + crontab-Eintrag · idempotenter Enrollment-Trigger an 3 Punkten · minimale Admin-Edit-Seite (oder Studio-Fallback).

## 13. Test-Plan

- **Unit (vitest):** je-Template `copySchema.parse` (valid/invalid) · `buildWerkstattMergeVars` (inkl. SV-Fallback=null → skip) · Offset-Berechnung + Step-Skipping (inaktiver Bonus) · `hatErstenFall`-Prädikat-Shape · Cron-Advance (kein Doppel-Send, fertig-Zustand).
- **Regel 4 (Prod-Smoke):** Test-Werkstatt (Test-Email, **kein** realer Empfänger) enrollen → Cron manuell triggern → Mail 1 in `email_log` + Rendering prüfen → Stop testen: Test-`partner_provisionen`/`reparatur_werkstatt_id`-Row setzen → Cron → `status='aktiviert'`, kein weiterer Send. SV-Mail 3: Test-Werkstatt mit Standort in einer SV-Region → `BeraterCard` zeigt den erwarteten SV; Standort ohne SV → Mail 3 übersprungen.

## 14. Non-Goals / offen

- **Verhaltens-Trigger** (Login-ohne-Fall, Fall-Abbruch) + laufende Nurture-Mails — **separat** (Markdown §„Nächste Bausteine").
- **Bonus-Mail-5-Framing** (RDG/BRAO: Aufwandsentschädigung, nicht Vermittlungsprämie) — **Aaron/Legal-Call**; blockt nichts, weil `aktiv=false` startet.
- **A/B der Betreffzeilen** (Markdown hat „Betreff (Alt)") — via zweitem `betreff`-Feld später; MVP nutzt eine Zeile.
- **Generischer Lifecycle-Engine** (SV-/Makler-Onboarding) — bewusst YAGNI, Refactor bei realem 2. Consumer.
