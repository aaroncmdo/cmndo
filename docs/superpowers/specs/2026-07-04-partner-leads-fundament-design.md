# Partner-Leads-Fundament — Design-Spec

> **Sub-Projekt 1 von 4** des Partner-Vertriebsdashboards. **Build gated** auf „aktueller
> Makler-Stack live + prod-getestet" (Aaron 04.07.). Dieses Dokument ist die Design-Grundlage;
> die Task-Zerlegung folgt via superpowers:writing-plans, sobald der Gate offen ist.

## 1. Kontext & Vision

Claimondo soll ein **vollständiges Partner-Vertriebsdashboard** bekommen: eine normalisierte,
DB-getriebene Lead→Partner-Konvertierung für die Partner-Rollen **SV (Sachverständige)**,
**Werkstätten** und **Makler**, inklusive Self-Registration und Rollen-Onboardings
(self-service · durch Admins · DB-getrieben).

**Bestandsaufnahme (Survey 04.07.):** Es gibt heute **keine** kanonische Partner-Abstraktion —
drei Silos (`sachverstaendige`, `werkstaetten`, `makler`) mit eigener Account-Anlage
(4-5× duplizierter `createUser`+`profiles`+Rollen-Row-Code, `generatePassword()` 5×), eigenem
Status-Vokabular und inkonsistenter Aktivierung. SV hat zwei parallele Lead-Systeme
(`sv_leads` DAT-Import + `gutachter_waitlist` Bewerbung) ohne Brücke; Werkstatt und Makler haben
gar keine Lead-Phase. Das einzige ausgereifte Konvertierungs-Muster ist die **Kunden**-Pipeline
`leads` → `convert-lead-to-claim.ts` (typerzwungener Erzeuger + idempotente, cleanup-sichere
Konvertierung) — sie dient als strukturelles Vorbild, ist aber kunden-/schaden-geformt und nicht
wiederverwendbar.

**Die vier Sub-Projekte:**
1. **Fundament** (dieses Dokument): kanonisches `partner_leads`-Modell + `convertPartnerLead` + `anlegePartnerKern` + rollen-parametrisierte Aktivierungs-Policy.
2. **Vertriebsdashboard**: CRM-Queue/Stages/Filter über `partner_leads`.
3. **Self-Registration je Rolle**: SV/Makler vereinheitlichen (Werkstatt bleibt admin-getrieben, s.u.).
4. **Rollen-Onboardings normalisiert**: ein Status-Engine (self-service + admin + DB-getrieben) statt drei Mechanismen.

## 2. Ziel & Nicht-Ziele (nur Sub-1)

**Ziel:** Eine saubere, kanonische Datengrundlage + Kernfunktionen, auf denen Sub 2–4 aufsetzen —
ohne die drei Silos zu duplizieren.

**Nicht-Ziele (kommen in Sub 2–4):**
- Kein Vertriebsdashboard-UI (Sub-2).
- Keine neue Self-Registration-UI (Sub-3) — die bestehenden SV-/Makler-Signups bleiben vorerst, werden aber später auf das Fundament umgestellt.
- Keine Onboarding-Normalisierung (Sub-4).
- **Kein Big-Bang-Refactor** der 5 bestehenden Account-Anlage-Sites — `anlegePartnerKern` wird erstellt und von NEUEM Code genutzt; die Altsites migrieren per Boy-Scout.

## 3. Datenmodell

### 3.1 `partner_leads` (kanonisch, alle Partner-Rollen)

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK | |
| `rolle` | text CHECK IN ('sachverstaendiger','werkstatt','makler') | Rollen-Diskriminator (kein neuer Enum-Typ — CHECK ist einfacher + additiv erweiterbar) |
| `status` | text CHECK (s. Enum) | Pipeline-Stufe |
| `firma` | text | |
| `ansprechpartner_vorname` / `_nachname` | text | |
| `email` | text | für Konvertierung + Dedupe |
| `telefon` | text NULL | |
| `plz` / `ort` | text NULL | Geo (SV/Werkstatt-Matching) |
| `source_channel` | text | `self_signup` / `marketing_bewerbung` / `dat_import` / `admin` / `empfehlung` |
| `rollen_details` | jsonb | rollen-spezifisch: SV = DAT-Nr/Fachgebiete · Werkstatt = Marken/Kapazität · Makler = IHK |
| `zugewiesen_an` | uuid NULL → profiles | Vertriebler, der den Lead betreut |
| `konvertiert_zu_user_id` | uuid NULL → auth.users | Idempotenz-Anker + Verknüpfung |
| `konvertiert_zu_partner_id` | uuid NULL | die erzeugte `sachverstaendige`/`werkstaetten`/`makler`-Row |
| `konvertiert_am` | timestamptz NULL | |
| `konvertiert_durch` | uuid NULL → profiles | Admin/System |
| `notiz` | text NULL | Vertriebs-Notizen |
| `erstellt_am` / `aktualisiert_am` | timestamptz | |

**Status-Enum (vereinheitlicht aus `gutachter_waitlist.status`):**
`neu → kontaktiert → qualifiziert → onboarding → aktiv` · Seitenausgänge: `abgelehnt` · `kein_interesse`.

**RLS:** service_role (Konvertierung/Cron) + Admin/Vertrieb (`profiles.rolle IN ('admin','dispatch','leadbearbeiter')`) FOR ALL. Partner selbst sehen ihre eigene `partner_leads`-Row NICHT (interne Vertriebsdaten) — bewusst kein Self-Read.

### 3.2 `partner_rollen_policy` (Config, DB-getrieben)

Ein kleiner, geseedeter Config-Table (admin-editierbar → „datenbank getrieben") statt hartcodierter
Rollen-Weichen. Er entscheidet die Gates — **eine Pipeline, pro Rolle korrekter Gate.**

| `rolle` | `self_signup_erlaubt` | `braucht_review` | `braucht_zahlung` | `auto_konvertieren` |
|---|---|---|---|---|
| `makler` | true | false | false | **true** (self_signup ruft direkt convert → sofort aktiv, Aaron 30.06.) |
| `sachverstaendiger` | true | **true** | **true** | false (Vetting + Stripe-Gate) |
| `werkstatt` | **false** | true | false | false (**bleibt admin-getrieben + QR-Zuweisung, Aaron 04.07.**) |

Neue Rolle später = eine Config-Zeile, kein neuer Flow.

## 4. Kernfunktionen

### 4.1 `anlegePartnerKern(rolle, daten): Promise<{ ok: true; userId; partnerId } | { ok: false; error }>`

Die **EINE** Account-Anlage. Konsolidiert den 4-5× duplizierten Block:
`createUser` (email_confirm, force_password_change) → `profiles` (rolle) → Rollen-Tabelle
(`sachverstaendige` | `werkstaetten` | `makler` per `switch(rolle)`) → optional Promo-Code (Makler).
Ein Rollback-Cascade mit Orphan-Logging (statt fünf). `generatePassword` wandert hierher (zentral).

**Consumers:** neuer Self-Signup (Sub-3), Admin-Anlage (nach Migration), und `convertPartnerLead`.
Boy-Scout: die 5 Altsites (`sv-basic/claim-actions`, `admin/sachverstaendige/anlegen`,
`admin/werkstaetten`, `admin/makler`, `lib/makler/anlege-makler`) rufen nach und nach nur noch das.

### 4.2 `convertPartnerLead(partnerLeadId, { durchUserId? }): Promise<Result>`

Spiegelt `convert-lead-to-claim.ts` (service_role, Result-Object statt throw):
1. **Idempotenz-Guard:** `konvertiert_zu_user_id` gesetzt → früh raus (kein Doppel-Account).
2. Lead laden; `rollen_details` → rollen-spezifische Insert-Daten mappen.
3. `anlegePartnerKern(rolle, daten)`.
4. `partner_leads`: `status='aktiv'` + `konvertiert_zu_user_id/_partner_id/_am/_durch`.
5. **Cleanup-safe:** schlägt ein Schritt fehl, wird der halbe Account zurückgerollt (wie `cleanupAndFail`).
6. Policy-Konsultation: `braucht_zahlung` → Partner wird angelegt, aber `ist_aktiv/portal_zugang` bleibt bis Stripe-Webhook zu (SV); `auto_konvertieren` (Makler) → der Self-Signup ruft `convertPartnerLead` sofort.

## 5. Migration von Bestand

- `sv_leads` + `gutachter_waitlist` → `partner_leads` (rolle=`sachverstaendiger`): Felder + Status
  mappen (`warteliste_status`/`gutachter_waitlist.status` → neues Enum; `konvertiert_zu_sv_id` →
  `konvertiert_zu_partner_id`; source `dat_import` bzw. `marketing_bewerbung`).
- Alt-Tabellen bleiben zunächst **read-only** stehen (kein Drop — Regel 3), Consumer werden auf
  `partner_leads` umgezogen, Drop erst danach in einem Folge-PR.
- Makler/Werkstatt/SV **Partner-Rows** bleiben unverändert — `partner_leads` ist die neue
  Prospect-Schicht DAVOR, nicht ein Ersatz der Partner-Tabellen.

## 6. Fehlerbehandlung & Konventionen
- Alle neuen Funktionen: Result-Object (`{ ok, error? }`), kein throw (AGENTS §Server-Actions).
- DDL ausschließlich via Supabase-Plugin (Regel 2), additiv, File==getrackte Version.
- Konstanten/Types nie aus `'use server'`-Files exportieren (AAR-664) → Policy-Resolver + Typen in reine Lib-Files.

## 7. Testing-Strategie
- **Pure/Unit:** Policy-Resolver (rolle → Gates), Status-Übergangs-Validierung, `rollen_details`-Mapping je Rolle.
- **Integration (DB):** `convertPartnerLead`-Idempotenz (Doppelklick → 1 Account), `anlegePartnerKern` je Rolle (Rollback bei Teil-Fehler), Migration (sv_leads/waitlist → partner_leads Zählstände).
- **Prod-Smoke (post-Gate):** ein SV-Prospect via marketing_bewerbung → Vertriebs-Queue → convert → SV-Account + Stripe-Gate; ein Makler-Self-Signup → auto-convert → sofort aktiv.

## 8. Offene Design-Fragen (vor writing-plans klären)
- (a) `partner_rollen_policy` als Tabelle (admin-editierbar, „DB-getrieben") vs. versioniertes Code-Konstrukt — Empfehlung: **Tabelle** (passt zu Aarons „datenbank getrieben"), geseedet per Migration.
- (b) Erscheint der admin-angelegte Werkstatt-Partner zwecks Dashboard-Sichtbarkeit als auto-konvertierte `partner_leads`-Row, oder bleibt Werkstatt ganz außerhalb der Pipeline? (Aaron: Werkstatt-Flow „soll so bleiben erstmal" → minimal-invasiv; Vorschlag: optionale Schatten-Row nur für Dashboard, kein Flow-Change.)
- (c) Onboarding-Status (Sub-4): ein `onboarding_status` auf der **Partner**-Row (nach Konvertierung) vs. auf `partner_leads` (Stufe `onboarding`) — vermutlich beides (Prospect-Onboarding vs. Partner-Onboarding).

## 9. Koordination (andere Sessions)
- **`c613df86` / `kitta/kanonische-partner-abrechnung`**: baut die kanonische **Partner-Abrechnung** (Provisionen, netto/brutto 19%, Vorsteuerabzug-Abfrage). Das ist die **Geld-Hälfte** der Partner-Story, dieses Fundament die **Akquise-Hälfte** — beide zielen auf eine kanonische Partner-Abstraktion. **Distinkte Tabellen** (partner_leads vs. Abrechnung), keine File-Kollision erwartet. Eventuell später ein gemeinsames `v_partner`/Partner-Kern zusammenführen. Vor DDL abgleichen, dass keine konkurrierende `partner_*`-Migration entsteht.
- Werkstatt-Flows: `1069c2a2` (`kitta/werkstatt-unified-view`) arbeitet an der Werkstatt-Auftrags-/Vermittlungs-View — berührt nicht die Registrierung/Anlage, aber bei Werkstatt-Änderungen abgleichen.

## 10. Reihenfolge & Gate
Sub-1 (dieses) → Sub-2 (Dashboard) → Sub-3 (Self-Reg) → Sub-4 (Onboarding-Norm). Jeweils eigener
Spec→Plan→Build-Zyklus. **Kein Build vor dem Prod-Gate** (Makler-Stack #3529/#3566/#3572/#3575/#3582/#3594/#3599/#3608/#3615 gemerged, deployed, gesmoked).
