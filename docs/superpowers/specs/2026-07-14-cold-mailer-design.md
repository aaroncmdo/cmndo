# Cold-Mailer für Makler + Werkstätten — Design-Spec

**Datum:** 2026-07-14 · **Auftrag:** Aaron. **Ziel:** Ein konfigurierbarer Cold-Outreach-Sequencer im Vertrieb-Cockpit — KI-erstellte + editierbare Email-Vorlagen, pro Lead-Rolle einstellbare Sequenzen mit Verzweigung, zuverlässiger Versand über Resend, Opt-out, Tracking und ein vollständiger Verlauf der gesendeten Mails in der Lead-Akte.

## 1. Überblick / Scope

Der Cold-Mailer sitzt auf der bestehenden Partner-Leads-Datenbasis auf (`partner_leads` mit `ansprechpartner_*` + `email`, editierbar via #4228, auto-angereichert via #4240). Er versendet mehrstufige Email-Sequenzen an gescrapte/importierte Leads, respektiert Opt-outs, trackt Zustellung/Öffnung/Klick und zeigt alles pro Lead an.

**In Scope:** Resend-Versand · KI-Email-Editor + Vorlagen · Sequenzen pro Rolle mit Bedingungen · Enrollment (manuell/bulk + auto-on-scrape) · Opt-out/Suppression · Tracking (Webhooks) · gesendete-Mails-Verlauf in der Lead-Akte · stündlicher CRON-Advancer.

**Out of Scope (v2):** Volle visuelle Graph-Builder-UI (wir machen bedingte Steps statt Graph) · Inbound-Reply-Parsing (Reply-Detektion v1 approximiert, s. §11) · A/B-Betreff-Tests · Team-Zuweisung von Antworten.

## 2. Architektur

- **Versand: Resend** (`resend` npm-SDK). From-Domain **konfigurierbar via `COLD_MAIL_FROM_DOMAIN`** (Empfehlung + Default: **Subdomain** `mail.claimondo.de` — isoliert die Reputation von den transaktionalen `claimondo.de`-Mails). From z.B. `Claimondo Partnernetzwerk <partner@mail.claimondo.de>`.
- **Templates:** react-email (bestehende Infra) für das Wrapper-Layout (Header/Footer/Abmelde-Link); der Vorlagen-Body ist admin-editierbares HTML, in den Wrapper injiziert.
- **KI:** `@anthropic-ai/sdk` + `AI_MODELS` (neuer Key `cold_mail_compose`, Sonnet 4.6 — Qualität deutscher Vertriebstexte).
- **CRON:** VPS-crontab (wie der bestehende `send-lead-reminders`-Cron), stündlicher Hit auf eine geschützte Route `/api/cron/cold-mailer-advance`.
- **Env (Aaron richtet ein):** `RESEND_API_KEY`, `COLD_MAIL_FROM_DOMAIN`, `RESEND_WEBHOOK_SECRET`. Verifizierte Sende-Subdomain (SPF/DKIM/DMARC) bei Resend.

## 3. Datenmodell (DDL via Supabase-Plugin, Regel 2)

- **`cold_mail_vorlagen`** — KI-erstellte + editierte Templates.
  `id` uuid PK · `name` text · `rolle` text NULL (makler|werkstatt|sachverstaendiger|NULL=alle) · `betreff` text · `body_html` text · `erstellt_von` uuid FK auth.users · `erstellt_am`/`aktualisiert_am` timestamptz.
- **`cold_mail_sequenzen`** — eine/mehrere Sequenzen je Rolle.
  `id` uuid PK · `rolle` text (makler|werkstatt|sachverstaendiger) · `name` text · `aktiv` bool · `auto_enroll` bool (neue gescrapte Leads dieser Rolle automatisch aufnehmen) · `erstellt_am`. Constraint: max 1 `aktiv=true AND auto_enroll=true` je Rolle (partial unique).
- **`cold_mail_steps`** — Steps mit Bedingung (= Verzweigung).
  `id` uuid PK · `sequenz_id` FK · `position` int · `vorlage_id` FK cold_mail_vorlagen · `delay_tage` int (Wartezeit ab vorigem Send bzw. Enrollment) · `bedingung` text CHECK IN ('immer','wenn_nicht_geoeffnet','wenn_geoeffnet','wenn_keine_antwort'). UNIQUE(sequenz_id, position).
- **`cold_mail_enrollments`** — Lead ↔ Sequenz.
  `id` uuid PK · `lead_id` FK partner_leads · `sequenz_id` FK · `aktueller_step` int · `status` text CHECK IN ('aktiv','pausiert','fertig','opt_out','bounced','geantwortet') · `next_send_at` timestamptz · `erstellt_am`. UNIQUE(lead_id, sequenz_id).
- **`cold_mail_sends`** — jeder tatsächliche Versand (SSoT für den Lead-Verlauf + Tracking).
  `id` uuid PK · `enrollment_id` FK · `lead_id` FK · `step_id` FK · `vorlage_id` FK · `empfaenger_email` text · `betreff` text · `body_snapshot` text · `resend_message_id` text · `gesendet_am` timestamptz · `status` text CHECK IN ('gesendet','zugestellt','geoeffnet','geklickt','bounced','beschwerde') · `geoeffnet_am`/`geklickt_am` timestamptz NULL. Index(lead_id), Index(resend_message_id).
- **`cold_mail_suppression`** — Opt-out/Bounce-Liste, keyed by Email.
  `email` text PK · `grund` text CHECK IN ('opt_out','bounce','beschwerde') · `lead_id` uuid NULL · `erstellt_am` timestamptz.

RLS: alle admin/dispatch (staff) via `is_staff()`; `cold_mail_suppression`-Insert zusätzlich vom öffentlichen Abmelde-Endpunkt über Service-Client (kein RLS-Grant an anon).

## 4. Verzweigungs-Modell (bedingte Steps statt Graph)

Steps sind geordnet (position). Jeder Step hat eine `bedingung`, die beim Fälligwerden gegen den **letzten Send der Enrollment** ausgewertet wird:
- `immer` — nach `delay_tage` senden.
- `wenn_nicht_geoeffnet` — nur senden, wenn der vorige Send **nicht** `status IN (geoeffnet,geklickt)`.
- `wenn_geoeffnet` — nur senden, wenn der vorige Send geöffnet/geklickt wurde.
- `wenn_keine_antwort` — nur senden, wenn nicht `geantwortet` (v1: manuell gesetzt / approximiert, s. §11).

Trifft die Bedingung **nicht** zu, wird der Step übersprungen (advance zum nächsten, `next_send_at` neu). Das deckt echtes Cold-Outreach (Follow-up nur bei Nicht-Öffnern etc.) ohne einen komplexen Graph-Builder.

## 5. KI-Email-Editor + Vorlagen

- **Generieren:** Server-Action `generiereVorlageKi({rolle, ziel, tonalitaet})` → Claude (`AI_MODELS.cold_mail_compose`) → liefert `{betreff, body_html}`. Prompt injiziert das Claimondo-Wertversprechen je Rolle + verfügbare Merge-Vars.
- **Editieren:** Admin editiert Betreff + Body (Textarea/leichter Rich-Editor mit Merge-Var-Chips). Merge-Vars: `{Ansprechpartner}`, `{Firma}`, `{Ort}`, `{Vorname}`.
- **Speichern:** `speichereVorlage(...)` → `cold_mail_vorlagen`. Wiederverwendbar in Steps.
- Merge-Rendering beim Send: `{Var}` → Lead-Wert (Ansprechpartner aus `ansprechpartner_*`, Firma aus `firma`, …), fehlende Werte → sinnvoller Fallback.

## 6. Enrollment (beides)

- **Manuell/Bulk:** im Vertrieb-Cockpit-Roster (Lead-Modus) Leads einzeln oder gefiltert-bulk auswählen → „In Sequenz aufnehmen" → Enrollment(s) anlegen (`status=aktiv`, `next_send_at=now`+Step-1-delay). Suppression/Opt-out + fehlende Email werden übersprungen (Report).
- **Auto beim Scrape-Import:** `importScrapedLeads` prüft je importiertem Lead die `auto_enroll`-Sequenz seiner Rolle → legt Enrollment an (nur wenn Email vorhanden + nicht suppressed). Per Sequenz-Toggle abschaltbar.

## 7. Opt-out / Suppression (Pflicht)

- Jede Mail enthält einen **Abmelde-Link** `/abmelden/[token]` (token = signierter/gehashter Enrollment- oder Email-Identifier).
- Öffentliche Route (kein Login) → setzt `cold_mail_suppression(email, 'opt_out')` + `enrollment.status='opt_out'` (Service-Client, kein anon-RLS) → Bestätigungsseite.
- **Suppression-Check vor JEDEM Send** (CRON + manueller Send): `empfaenger_email` in `cold_mail_suppression` → skip + Enrollment `opt_out`.
- Resend-Bounce/Complaint-Webhooks schreiben ebenfalls in Suppression.

## 8. Tracking + Lead-Verlauf

- **Resend-Webhooks** → geschützte Route `/api/webhooks/resend` (verifiziert via `RESEND_WEBHOOK_SECRET`): `email.delivered/opened/clicked/bounced/complained` → matcht `resend_message_id` → updatet `cold_mail_sends.status` + `geoeffnet_am`/`geklickt_am`; bounce/complaint → Suppression.
- **Lead-Detail (LeadCockpit):** neue Sektion **„Cold-Mails"** — chronologische Liste aller `cold_mail_sends` des Leads: Betreff · gesendet_am · Sequenz/Step · Status-Badge (gesendet→zugestellt→geöffnet→geklickt) · Body-Vorschau (Snapshot). Zeigt die **effektiv gesendeten Mails**, nicht nur einen Status.

## 9. CRON-Advancer

Route `/api/cron/cold-mailer-advance` (geschützt via Cron-Secret), stündlich:
1. Enrollments `status='aktiv' AND next_send_at <= now()` laden.
2. Je Enrollment: Suppression-Check (→ opt_out/skip). Aktuellen Step + `bedingung` gegen letzten Send auswerten → senden ODER überspringen.
3. Senden: Vorlage rendern (Merge) → Resend `emails.send` (mit `tags`/`headers` fürs Webhook-Matching + Abmelde-Link) → `cold_mail_sends`-Row.
4. Advance: `aktueller_step++`, `next_send_at = now + nextStep.delay_tage`. Letzter Step → `status='fertig'`.
5. Rate-Limit/Batch-Cap pro Lauf (Deliverability-Schutz).

## 10. Bau-Slices

- **S0 — Fundament:** Resend-Client + From-Domain-Config + react-email-Wrapper + Opt-out-Route + Suppression-Tabelle + „eine Mail an einen Lead senden"-Action (manuell). DDL: `cold_mail_suppression`, `cold_mail_sends`.
- **S1 — Vorlagen + KI-Editor:** `cold_mail_vorlagen` + generieren/editieren/speichern-UI im Cockpit.
- **S2 — Sequenzen + Enrollment + CRON:** `cold_mail_sequenzen`+`cold_mail_steps`+`cold_mail_enrollments`, Bedingungs-Auswertung, manuelles/bulk + auto-on-scrape Enrollment, CRON-Advancer.
- **S3 — Tracking + Lead-Verlauf:** Resend-Webhook-Route + `cold_mail_sends`-Status-Update + „Cold-Mails"-Sektion in LeadCockpit.
- **S4 — Sequencer-Builder-UI:** pro-Rolle Sequenz-Editor (Steps mit Vorlage + Delay + Bedingung), Aktiv/Auto-Enroll-Toggle, Statistik-Kacheln.

Jede Slice = eigener PR gegen staging (wegen der schnellen Release-Sweeps kein langlebiger Branch).

## 11. Offene Punkte / Risiken

- **Reply-Detektion (`wenn_keine_antwort`, `status='geantwortet'`):** ohne Inbound-Parsing v1 nicht automatisch. **v1:** manueller „Geantwortet"-Toggle im Lead + optional Reply-To auf ein überwachtes Postfach (Follow-up). Bis dahin verhält sich `wenn_keine_antwort` wie `immer` mit manuellem Stop.
- **Deliverability:** Sende-Subdomain-Warmup + Rate-Limits (S2 Batch-Cap). Aaron: DNS (SPF/DKIM/DMARC) + Resend-Domain-Verify.
- **DSGVO/Recht:** B2B-Cold-Outreach an öffentliche Geschäfts-Emails; Pflicht-Abmeldelink + Impressum im Footer + Suppression decken die Kern-Anforderungen; finale rechtliche Freigabe = Aaron.
- **Merge-Fallbacks:** fehlender Ansprechpartner → generische Anrede.

## 12. Global Constraints (für den Plan)

DDL nur via Supabase-Plugin (Regel 2, File-Naming). Server-Actions Result-Object `{ok,error?}`, kein throw, kein const/type-Export aus 'use server' (AAR-664). requireRole(['admin','dispatch']) für alle Cockpit-Actions; Opt-out/Webhook-Routen über Service-Client + Secret-Verify, kein anon-RLS. Komponenten-Set (primitives/shared/DataTable). Umlaute in UI/Mail-Texten. Non-critical Sends in try/catch. Jede Slice: tsc + `next build` grün + eigener PR.
