# Makler-Portal — Bestandsaufnahme, Reconciliation & v12-Plan

**Stand:** 12.05.2026
**Zweck:** Planungs-Grundlage VOR Implementierung. Klärt: was ist schon da, wie passt das MVP-Konzept (`MAKLER-PORTAL-MVP.md`) zum Bestand, wie wird das aufs v12-Design-System (Liquid-Glass, `claimondo-*`-Tokens, shadcn-`ui/*`, `shared/*`) angepasst, und in welcher Reihenfolge gebaut wird.
**Quellen:** vollständiger Code-Audit `src/app/makler/*` + `src/components/makler/*` + `src/lib/makler/*` + `database.types.ts` (12.05.2026) · `MAKLER-PORTAL-MVP.md` (Konzept) · April-Hi-Fi-Prototyp (`MAKLER MVP/Makler Portal Claimondo (3)/`).

---

## 0 · Kern-Entscheidung

**Bestehenden `src/app/makler/(shell)/`-Portal ERWEITERN, nicht neu bauen.** Es liegen ~3.000 Zeilen lauffähiger, RLS-aware Code mit ECHTEN Supabase-Queries vor (Dashboard, Leads-/Akten-Listen mit Consent-Gating, Akte-Detail mit 5 Tabs inkl. Realtime-Chat + Claude-Copilot, Abrechnungen mit Monats-Navigator, Promo/QR mit echtem QR-Generator + Tracking, Einstellungen mit 7 Sektionen, `release-makler-provisionen`-Cron, Email-Templates, Zod-validierte Server-Actions). Die fehlenden MVP-Stücke (Self-Sign-up, Magic-Link-Onboarding, Variante-A-Schnellanlage, Variante-B-WA-Link, Empfehlungs-Tools-Ausbau) sind **additiv** — sie hängen sich neben den Bestand, ohne ihn zu brechen. Kein Konflikt rechtfertigt einen Rewrite (kein falsches Datenmodell, keine toten Annahmen). Das Konzept ist die **Anforderungs-Spec**; die Route-/Datei-Struktur richtet sich am Bestand aus (Konzept-MD wird wo nötig nachgezogen).

**Konsequenz:** Das Konzept-Kapitel 8 („Empfohlene Datei- und Routenstruktur" mit `src/app/(makler)/...`) ist **nicht** maßgeblich — maßgeblich ist `src/app/makler/(shell)/...` (existiert). Das Konzept-Kapitel 7 („UI-Komponenten" mit `kpi-card`/`case-row`/`pill-amber`/`field`/`alert-info`/`btn-default`/`tabs-toolbar`) beschreibt **Prototyp-Klassen, die im echten Code nicht existieren** — Mapping siehe Teil 3.

---

## 1 · Bestandsaufnahme (was es schon gibt)

### 1.1 Routen unter `/makler/*`

| Route | Komponente | Daten | Auth |
|---|---|---|---|
| `/makler` (Dashboard) | `MaklerDashboard` | **ECHT** — `getMaklerDashboardData` | `(shell)/layout.tsx`: User + Rolle `makler` + `makler.status === 'aktiv'`, sonst → `/makler/pending`; keine `makler`-Row → `/makler/onboarding` |
| `/makler/leads` | `MaklerLeadsTable` (+`PageHeader`) | **ECHT** — `getMaklerLeadsWithConsent` | via Layout |
| `/makler/akten` | `MaklerAktenList` (+`PageHeader`) | **ECHT** — `getMaklerFaelleList`/`-Counts`, `?filter=aktiv\|abgeschlossen\|storniert` | via Layout |
| `/makler/akten/[id]` | `MaklerAkteDetail` | **ECHT** — `getMaklerFallDetail`/`getDocumentSignedUrls`/`getFallChat`, `?tab=overview\|timeline\|documents\|chat\|copilot` | Layout + **Consent-Gate** (`consent_scope !== 'vollzugriff'` → redirect zurück zur Liste) |
| `/makler/abrechnungen` | `MaklerAbrechnungen` | **ECHT** — `getMaklerAbrechnungsData`, `?month=` | via Layout |
| `/makler/promo` | `MaklerPromo` / `MaklerPromoEmpty` | **ECHT** — `getMaklerPrimaryPromoCode`/`getPromoStats`, QR serverseitig (`qrcode`-Lib) | via Layout |
| `/makler/einstellungen` | `MaklerSettings` | **ECHT** — `getMaklerFullProfile`/`getMaklerAktiveConsents`/`getMyNotificationPreferences` | via Layout |
| `/makler/onboarding` | statische Fallback-Seite | — | eigener Guard; **kein Onboarding-Flow** — nur Fehler-Fallback wenn keine `makler`-Row |
| `/makler/pending` | statische Warte-Seite | — | eigener Guard; `makler.status != 'aktiv'` |
| `/makler/partner-werden` | Public-SEO-Landing (jetzt B2B-Sales, PR #821) | statisch + JSON-LD | **kein Guard** — öffentlich, auf `makler.claimondo.de` gespiegelt |
| `/makler/error.tsx`, `not-found.tsx`, `loading.tsx` | `ErrorState`/`EmptyState`/`LoadingSkeleton` | — | — |

### 1.2 Komponenten (`src/components/makler/`)

`MaklerShell` (Client; 240px-Sidebar Navy + Mobile-Bottom-Nav, Logo, `TasksPill`, `UpdatesNav`, `SupportButton`, Logout) · `MaklerDashboard` (Greeting, 4 StatCards [Offene Leads / Aktive Akten / Provisionen pending+freigegeben / Konversion %], Activity-Feed, 3 QuickActions, „Tipp des Monats") · `MaklerAktenList` (Filter-Chips, Tabelle+Cards, Consent-aware Click → Detail oder MiniDrawer, `PhasePill` mit 22 Phase-Mappings) · `MaklerLeadsTable` (Filter-Chips client-side, Tabelle+Cards, `ConsentBadge`, MiniDrawer) · `MaklerAbrechnungen` (4 SummaryCards, Monats-Navigator, Provisions-Tabelle mit Status-Badges + Hold-Countdown, CSV-Export client-Blob) · `MaklerSettings` (7 Card-Sections: Profil, Bank, Passwort, aktive Consents+Widerruf, Email-Flags, `NotificationPreferencesForm` [Quiet-Hours/Channels], Logout, Account-Löschen via `mailto:`) · `MaklerPromo` (Code+Copy, Landing-URL `?p=`, QR SVG/PNG-Download, Stats, Share WA/Email/LinkedIn, Landing-`<iframe>`) · `MaklerPromoEmpty` · `MaklerAkteDetail` (Breadcrumb, Navy-Gradient-Header-Card, 4 QuickStats, 5 Tabs: Übersicht/Timeline/Dokumente/Chat/Copilot) · `MaklerChatTab` (Supabase-Realtime-Gruppenchat, optimistic send) · `MaklerCopilotTab` (Claude-Streaming via `/api/makler/copilot`, 4 Suggestion-Chips, ReactMarkdown).

### 1.3 Backend / Daten

- `src/lib/makler/queries.ts` — alle Read-Queries (gegen `makler`, `promotion_codes`, `leads`(+nested `faelle`), `makler_fall_consent`, `v_faelle_mit_aktuellem_termin`, `faelle`, `makler_provisionen`(+nested `fall`), `fall_dokumente`, `nachrichten`, `promo_clicks`, Storage `fall-dokumente`).
- `src/lib/actions/makler-settings.ts` — UPDATE `makler` (Profil/Bank/notification_preferences), `makler_fall_consent` (Widerruf), `auth.updateUser` (Passwort). Result-Shape `{ success; error? }` (alt — AGENTS will `{ ok }`).
- `src/lib/actions/makler-send-message.ts` — INSERT `nachrichten` (`kanal='gruppenchat'`, `sender_rolle='makler'`), Consent-Gate-Read.
- `src/lib/email/makler-notifications.ts` — Email-Templates (u.a. `ProvisionReleased`).
- `src/app/api/makler/copilot/route.ts` — Claude-Streaming + `copilot-prompt.ts` (lädt `faelle`/`timeline`/`nachrichten` via Admin-Client).
- `src/app/api/cron/release-makler-provisionen/route.ts` — täglich: Storno-Pass (`fall.status='storniert'` → Provision `storniert`), Release-Pass (`hold_until <= now()` → `freigegeben`), Email.
- `src/lib/auth/role-redirect.ts` + `(shell)/layout.tsx` — `makler` → `/makler`. `src/lib/permissions/matrix.ts` — `PERMISSION_MATRIX.makler` (`scope: 'makler_kunden'`, fall/stammdaten/dokumente/abrechnung/prozess `read`, chat `write`, tasks `none`).

### 1.4 DB-Schema (Stand `database.types.ts`)

- **`makler`** — `id, user_id, firma, ansprechpartner_vorname/_nachname, email, telefon, ihk_nummer, adresse_strasse/_plz/_ort, bank_iban/_bic/_kontoinhaber, status (string, Default 'pending'), provision_aktiv, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, notification_preferences (Json), aktiviert_am/_von, gesperrt_am/_grund, erstellt_am, aktualisiert_am`. → **fehlt:** `onboarding_completed_at`, `consent_to_dsgvo_template_version`.
- **`makler_fall_consent`** — `id, fall_id (NOT NULL — kein lead_id!), makler_id, consent_scope (string; 'minimal'/'vollzugriff'), consent_gegeben_am, widerrufen_am/_von`. → **fehlt:** `lead_id` (zum Anlage-Zeitpunkt existiert nur ein Lead). `fall_id` muss nullable werden ODER `lead_id` als Alternative dazu.
- **`makler_provisionen`** — `id, makler_id, fall_id (nullable), lead_id (nullable — existiert!), promotion_code_id, abrechnung_id (FK→abrechnungen), betrag_netto_eur, service_typ (string; 'komplett'/'nur_gutachter'), trigger_event (string; 'lead_konvertiert'/'fall_reguliert'), status (string; 'pending'/'freigegeben'/'storniert'/'ausgezahlt'), hold_until (NOT NULL), trigger_at (NOT NULL), storniert_am/_grund, erstellt_am`. → vollständig genug für Variante A/B (mit `lead_id`).
- **`flow_links`** — `id, lead_id (NOT NULL), fall_id (nullable), token (Default gen_random_bytes, kein Hash gespeichert), expires_at, geoeffnet_am, abgeschlossen_am, status (string), service_typ, sprache, erstellt_am`. → **fehlt:** `makler_id` (für Variante B + Dashboard-Filter „Einladungen unterwegs"). Token-Sicherheit vs. `airdrop_invitations` (das hasht den Token in DB) — Konsistenz prüfen.
- **`leads`** — `kennzeichen (string, nullable)` + `kennzeichen_buchstaben/_kreis/_suffix/_zahl` **existiert** (Konzept-Migration „`leads.kfz_kennzeichen`" ist also schon abgedeckt — Mapping auf `kennzeichen`, NICHT neu anlegen). `source_channel (string, nullable, freier String)` — `'makler_schnellanlage'`/`'makler_wa_einladung'` gehen. `promotion_code_id`, `flow_link_geoeffnet`, `flow_link_abgeschlossen`, `konvertiert_zu_fall_id`/`_claim_id`. `status` ist Enum **`lead_status`: `neu | rueckruf | quali-offen | flow-gesendet | umgewandelt | umgewandelt-sv | disqualifiziert | kalt`** — die Konzept-Werte `'qualifiziert'`/`'konvertiert'`/`'neu_eingeladen'`/`'erstellt'` **existieren nicht** (siehe Bug + Reconciliation unten).
- **`promotion_codes`** — `id, code, makler_id (NOT NULL, FK→makler), aktiv, erstellt_am`. Kein `service_typ`-Default, kein 1:1-Constraint pro Makler. **`promo_clicks`** — `id, promotion_code_id, clicked_at, ip_hash, referer, user_agent`.
- **Vorhanden, vom Makler-Code noch nicht genutzt aber Konzept-relevant:** `email_otp_codes` (Magic-Link-OTP, AAR-494, 5-Min-TTL, 3/h), `auth_remember_tokens`, `notification_events`/`_deliveries`/`_preferences` (Fan-out-Worker), `timeline`/`phase_transitions` (echte Fall-History — Akte-Detail liest sie heute NICHT), `vertragsvorlagen` (PDF-Templates), `dsgvo_loeschauftraege`, `settings`, `airdrop_invitations`, `whatsapp_inbound_messages`, `abrechnungen`. `faelle.makler_id` (FK→makler, vom Code nicht als Scope genutzt — Scope läuft über `makler_fall_consent`+`promotion_codes`), `faelle.betreuer_user_id` (für die „Ansprechpartner-Card").

---

## 2 · Reconciliation: Konzept ↔ Bestand

### 2.1 Lücken-Matrix

| MVP-Block (Konzept) | Bestand | Aktion |
|---|---|---|
| **Auth & Onboarding** — `/makler/einladung-anfordern`, `/makler/anmelden`(+`/gesendet`), `/makler/onboarding/1..3`, idempotent via `makler.onboarding_completed_at` | **FEHLT.** Login = generisches `/login` → `roleToPath('makler')→/makler`. `/makler/onboarding` ist nur Fehler-Fallback. `/makler/pending` existiert. Nur `mailto:`-CTA auf `/makler/partner-werden`. | **NEU bauen** (3+1 Routen + 1 API + 1 Migration). |
| **Variante A — Schnellanlage** — `/makler/fall-anlegen` (3 Pflichtfelder + Consent-Checkbox + Detail-Collapse), `leads`-Insert + `makler_fall_consent`-Insert + `notification_event`, 5 States, Auto-Redirect | **FEHLT KOMPLETT** (Route, API, Form, `ConsentCheckbox`). | **NEU bauen** (1 Route + 1 API + `ConsentCheckbox`-Component + Dashboard-„+Fall"-Button + Migration `makler_fall_consent.lead_id`). |
| **Variante B — WA-Magic-Link** — Toggle, `flow_links`-Insert (+`makler_id`), Twilio-WA-Template, „Einladungen unterwegs"-Sektion, 24h/6h-Reminder | **FEHLT KOMPLETT.** `flow_links` existiert, wird aber nicht aus Makler-Kontext erzeugt. Kein WA-Template, kein `flow_links`-Reminder-Cron (`send-lead-reminders` ist explizit nur für `source_channel='self_service'`). | **NEU bauen** (Toggle in `/makler/fall-anlegen` + API + Migration `flow_links.makler_id` + Meta-WA-Template-Approval [2–5 Tage Vorlauf!] + Reminder-Cron + Dashboard-Sektion + Token-Hashing prüfen). |
| **Dashboard** — `/makler/dashboard`, Vorname+Monat+„+Fall anlegen", 4 KPI-Kacheln (Aktive Fälle / Fälle Monat / Provision Monat / Forecast Monat), „Fälle in Bearbeitung"-Card (4 Status-Pills), Empfehlungs-Tools-Block, „Einladungen unterwegs" | **TEILWEISE.** Route `/makler` (Index). 4 KPI-Kacheln da, aber andere Metriken (Offene Leads / Aktive Akten / Provisionen pending+freigegeben / Konversion%). Kein „+Fall"-Button (keine Route). Activity-Feed statt „Fälle in Bearbeitung"-Card. Kein Empfehlungs-Block, keine „Einladungen unterwegs". „Tipp des Monats" ist neu (nicht im Konzept — behalten). | **ERWEITERN.** KPI-Set ans Konzept angleichen (oder Mischung — siehe offene Frage). „+Fall"-Button + „Fälle in Bearbeitung"-Card mit Status-Pills + „Einladungen unterwegs" hinzufügen. Optional Route-Move `/makler` → `/makler/dashboard` (mit Index-Redirect). |
| **Fall-Detail** — `/makler/faelle/[id]` (+`/f/[token]` Magic-Link, +Banner), Header-Card, Timeline aus `timeline`+`phase_transitions`, Ansprechpartner-Card (`betreuer_user_id`) | **TEILWEISE / über Konzept hinaus.** Route `/makler/akten/[id]`. 5 Tabs inkl. Chat + Copilot (Konzept: Chat/Copilot waren M6/M7 separat — Code ist ambitionierter). Timeline aus `faelle`-Datumsfeldern, NICHT aus `timeline`-Tabelle (TODO im Code). Kein Magic-Link-Banner / `/f/[token]`. Ansprechpartner-Card fehlt. Dokumente-Tab existiert (hinter Vollzugriff-Gate). | **ERWEITERN (klein).** Ansprechpartner-Card ergänzen. Timeline-Quelle auf `timeline`-Tabelle umstellen (Hygiene). `/f/[token]`-Login-freier Einstieg: Post-MVP außer es wird Pilot-relevant (Magic-Link-Mail an Makler). Route-Naming `akten` vs. `faelle`: bei `akten` bleiben, Konzept nachziehen. |
| **Provisionen** — `/makler/provisionen`(+`/[yyyymm]`), Monatswähler, Summen-Banner, Tabelle (Datum/Mandant/Service/Trigger/Betrag/Status/Hold), PDF-Footer (`abrechnungen`-Row+Mail), Link „Provisionsvereinbarung" aus `vertragsvorlagen` | **TEILWEISE.** Route `/makler/abrechnungen` (`?month=`). 4 SummaryCards + Monats-Navigator + Tabelle (Datum/Fall/Kunde/Service/Betrag/Status) da. Fehlt: Spalten „Trigger-Event"+„Hold bis" (Hold nur im Badge), PDF-Export (heute CSV-Blob), `abrechnungen`-Row-Generierung, PDF-Mail, Link zur Provisionsvereinbarung (`vertragsvorlagen` ungenutzt). | **ERWEITERN.** Trigger-Spalte + Hold-Spalte ergänzen, PDF-Generator (Worker → `abrechnungen`-Row + Mail) statt/zusätzlich CSV, `vertragsvorlagen`-PDF-Link. Route-Naming `abrechnungen` vs. `provisionen`: bei `abrechnungen` bleiben, Konzept nachziehen. |
| **Einstellungen** — 4 Sub-Tabs (Kanzlei/Person/Bank/Benachrichtigungen), Footer (Provisionsvereinbarung-PDF / DSGVO-Auskunft-Magic-Link / Konto löschen → `dsgvo_loeschauftraege`) | **TEILWEISE / über Konzept hinaus.** Single-Page mit 7 Sektionen (Profil, Bank, **Passwort**, **aktive Consents+Widerruf**, Email-Flags, `NotificationPreferencesForm`, Logout, Account-Löschen). Account-Löschung → `mailto:` (+ ungenutzte Action die `admin_tasks` schreibt), NICHT `dsgvo_loeschauftraege`. Kein Provisionsvereinbarungs-PDF-Footer, keine DSGVO-Auskunft-Magic-Link. | **ERWEITERN (klein).** Konto-Löschen → echter `dsgvo_loeschauftraege`-Insert + ungenutzte `admin_tasks`-Action entfernen. Provisionsvereinbarungs-PDF-Link + DSGVO-Auskunft ergänzen. Single-Page vs. 4-Sub-Tabs: Single-Page behalten (besser als Konzept) oder auf Sub-Tabs umbauen — Stil-Entscheidung, kein Blocker. |
| **Empfehlungs-Tools** — Dashboard-Block + `/makler/empfehlungs-tools`: QR-Visitenkarte (PDF mit `?p=`), Mandanten-Mail-Vorlage (Copy+Outlook), Mandanten-WA-Vorlage, Schulungsvideo (Loom) | **TEILWEISE.** `/makler/promo` deckt die QR-Visitenkarte ab (SVG/PNG-Download, Code-Copy, Landing-URL, Share, Stats, Landing-Preview). Fehlt: PDF-Visitenkarte, separate Mail-/WA-Textbaustein-Vorlage, Schulungsvideo, Dashboard-Block, Vorlagen-Verwendungs-Tracking, Route `/makler/empfehlungs-tools`. | **ERWEITERN.** `/makler/promo` zu `/makler/empfehlungs-tools` ausbauen ODER zweiten Tab; Mail-/WA-Vorlage + Schulungsvideo + PDF-Visitenkarte + Dashboard-Block ergänzen. Route-Naming: `promo` zu `empfehlungs-tools` umbenennen (mit Redirect) ist sinnvoll. |

### 2.2 Routen-/Naming-Reconciliation (Entscheidung)

| Konzept | Code-Bestand | Empfehlung |
|---|---|---|
| `src/app/(makler)/...` Group | `src/app/makler/(shell)/...` | **Bestand behalten.** Konzept-Kapitel 8 ignorieren. |
| `/makler/dashboard` | `/makler` (Index) | Move auf `/makler/dashboard` + `/makler` redirectet — trivial, macht den „+Fall"-Button-Kontext sauberer. Oder bei `/makler` bleiben. **Aaron entscheidet.** |
| `/makler/faelle/[id]` | `/makler/akten/[id]` | **Bei `akten` bleiben** (eingeführter Begriff, Permission-Matrix nutzt ihn). Konzept-MD nachziehen. |
| `/makler/provisionen` | `/makler/abrechnungen` | **Bei `abrechnungen` bleiben.** Konzept-MD nachziehen. (Alternativ: `provisionen` ist makler-freundlicher als `abrechnungen` — Stil-Frage.) |
| `/makler/empfehlungs-tools` | `/makler/promo` | **Umbenennen zu `/makler/empfehlungs-tools`** mit Legacy-Redirect — der Bestand ist nur ein Teil davon, der neue Name passt besser zum erweiterten Umfang. |
| `/makler/leads` (Code-Tab, nicht im Konzept) | existiert | **Behalten.** Nützlich (Lead-Stage vor Konversion). Konzept-MD ergänzen. |
| `/makler/fall-anlegen`, `/makler/onboarding/1..3`, `/makler/anmelden`(+`/gesendet`), `/makler/einladung-anfordern` | fehlen | **Neu unter `src/app/makler/...`** (`einladung-anfordern` + `anmelden` außerhalb der `(shell)`-Group, weil kein Auth-Layout; `onboarding/1..3` + `fall-anlegen` innerhalb). |
| `/f/[token]`, `/m/[promo_code]` | fehlen | **Post-MVP** (außer `/f/[token]` wird Pilot-relevant). |

### 2.3 DB-Schema-Reconciliation

**Migrationen (via supabase-CLI, AGENTS-Regel 2 — `npx supabase migration new …` + `db push`):**
1. `makler.onboarding_completed_at TIMESTAMPTZ NULL` — Idempotenz des Onboarding-Flows.
2. `makler_fall_consent`: `lead_id UUID NULL REFERENCES leads(id)` hinzufügen **und `fall_id` nullable machen** (zum Anlage-Zeitpunkt nur Lead; beim Lead→Fall-Promote setzt ein Trigger `fall_id`). CHECK: `fall_id IS NOT NULL OR lead_id IS NOT NULL`.
3. `flow_links.makler_id UUID NULL REFERENCES makler(id)` — Variante-B-Urheber + Dashboard-Filter.
4. *(optional)* `makler.consent_to_dsgvo_template_version TEXT NULL` — welche Provisionsvereinbarungs-/DSGVO-Version der Makler unterschrieben hat.

**NICHT neu anlegen:** `leads.kfz_kennzeichen` (es gibt `leads.kennzeichen` — darauf mappen). `makler_provisionen.lead_id` (existiert).

**Enum-/Wert-Reconciliation:**
- Variante A → `leads.status='neu'`, `qualifizierungs_phase='erstkontakt'` (Konzept-Konsistenz), `source_channel='makler_schnellanlage'`. (Konzept schreibt `status='neu'` — passt.)
- Variante B → `leads.status='flow-gesendet'` (dieser Enum-Wert existiert und passt semantisch — Konzept-Wunsch `'neu_eingeladen'` gibt's nicht), `source_channel='makler_wa_einladung'`, `flow_links`-Row mit `makler_id` + `expires_at=now()+72h` + `service_typ='komplett'`.
- **Pflicht-Bugfix vor allem anderen:** `getMaklerDashboardData` filtert `.in('status', ['neu','qualifiziert'])` — `'qualifiziert'` ist kein gültiger `lead_status` → ändern auf die echten offenen Stati (`['neu','rueckruf','quali-offen']`). `MaklerLeadsTable.StatusPill` mappt `'qualifiziert'`/`'konvertiert'` → auf `'umgewandelt'`/`'umgewandelt-sv'`/`'rueckruf'`/`'quali-offen'`/`'flow-gesendet'`/`'kalt'` korrigieren.

---

## 3 · v12-Design-Adaption

**v12 = das aktuelle Claimondo-Design-System:** `claimondo-*`-Color-Tokens (`navy #0D1B3E`, `ondo #4573A2`, `shield #1E3A5F`, `light-blue #7BA3CC`, `bg #f8f9fb`, `card #ffffff`, `border #e4e7ef`), `--radius-ios-sm/md/lg/xl` (12/18/24/32px), Navy-Tint-Shadows (`--shadow-claimondo-*` / `--shadow-ios-*`), das Liquid-Glass-Layer (`--glass-bg` via `color-mix()` Brand-Wash, `glass-card`-Klasse, `GlassPanel`, `src/components/shared/glass/*`), Montserrat-Headings + Noto-Sans-Body, shadcn-Primitive `@/components/ui/*`, shared `@/components/shared/*`.

### 3.1 Befund: aktueller Stand der Makler-Komponenten

Konsistent „Claimondo-Vintage" (Stand ~AAR-483..493, April 2026): alle nutzen die `claimondo-*`-CI-Tokens korrekt, **kein** Tailwind-Default-Grau (`gray-*`/`slate-*`). **Aber nicht auf v12-Stand:** shadcn-`ui/*` (`<Button>`, `<Card>`, `<Table>`, `<Tabs>`, `<Sheet>`, `<Checkbox>`) wird **nirgends** verwendet (handgerollte `<button>`/`<div>`); `shared/*` nur sparsam (`PageHeader` in 4 Files, `LoadingSkeleton`/`ErrorState`/`EmptyState` in Boilerplate, `DokumenteDownloadListe` im Akte-Detail); `StatusBadge`/`GlassPanel`/`FallStatusBadge`/`VersichererSelect` ungenutzt. 4× dupliziertes `StatCard`/`Pill`/`MiniDrawer` über `MaklerDashboard`/`MaklerAktenList`/`MaklerLeadsTable`/`MaklerAbrechnungen`/`MaklerPromo`. Amber-vs-Orange-Inkonsistenz (Dashboard amber, Abrechnungen/Promo orange). Hard-Hex `#f2f3f7` (`MaklerShell`-BG-Style), `#1E3A5F` (`MaklerAkteDetail`/`MaklerCopilotTab`-Gradients). `violet` für Kanzlei-Phasen (`MaklerAktenList`). `MaklerChatTab`: Realtime-Channel-Name `fall-chat-${fallId}` ohne `useId()` (Crash-Risiko bei Mehrfach-Mount — vgl. Memory „Supabase-Realtime Channel-IDs") + ASCII-Umlaut-Verstöße in Kommentaren. Server-Actions: Result-Shape `{ success }` statt `{ ok }` (AGENTS).

### 3.2 Mapping Prototyp-/Konzept-Klassen → echtes v12

| Konzept (Kap. 7) / Prototyp | v12-Umsetzung |
|---|---|
| `btn-default` (Navy), `btn-lg` | `<Button>` aus `@/components/ui/button` (Variant `default`, Size `lg`) |
| `btn-outline` | `<Button variant="outline">` |
| `btn-ghost` | `<Button variant="ghost">` |
| `pill-amber/blue/green/gray/destructive` (Status) | `<StatusBadge>` aus `@/components/shared/StatusBadge` (oder `<Badge>` aus `ui/badge` mit Semantic-Tint `amber-100/700`, `emerald-100/700`, `claimondo-ondo/10`, `rose-100/800`, `claimondo-border`) — **eine** geteilte `MaklerStatusPill` |
| `card` | `<Card>` aus `@/components/ui/card` **oder** `GlassPanel` (für die Glass-Optik der Marketing-/Portal-Cards) — eine Linie wählen, dann durchziehen |
| `alert-info` (Light-Blue), `alert-success`, `alert-destructive` | Glass-Info-Block: `<div class="rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.06] …">` bzw. `emerald-`/`rose-`-Tint — als kleine Shared-Component `MaklerAlert` |
| `field` (Label oben, 32px, Focus-Ring 3px Ondo) | `<Label>` + `<Input>` aus `@/components/ui` (bzw. `@/components/shared/glass/GlassInput` für die Glass-Variante) |
| `kpi-card` (4px Akzentbalken links + `--accent-*`) | Eine geteilte `MaklerKpiCard` auf `GlassPanel`-Basis mit `border-l-4 border-l-claimondo-ondo` (bzw. navy/emerald/amber pro KPI) |
| `case-row` (border-left in Status-Farbe) | Eine geteilte `MaklerCaseRow` (ersetzt das Duplikat in `MaklerAktenList`/`MaklerLeadsTable`) |
| `nav-item-active` (Navy-BG, weiße Schrift) | `MaklerShell`-Nav: `bg-claimondo-navy text-white` (Bug fixen: aktuell `bg-claimondo-shield text-white` — Shield ist zu hell; und das Label-Badge `text-claimondo-shield bg-claimondo-shield` = unsichtbar) — ggf. `@/components/shared/portal-nav/*` evaluieren als Ersatz |
| Variante-A/B-Tab-Toggle (Konzept ⚠️) | `<Tabs>` aus `@/components/ui/tabs` — existiert, kein neuer Component nötig |
| Provisions-Tabelle (Konzept ⚠️) | `<Table>` aus `@/components/ui/table` — existiert |
| Magic-Link-Banner (`alert-info` 36px, schließbar) | kleine `MaklerMagicLinkBanner` (Glass-Info-Block + X-Button), nur wenn `/f/[token]`-Flow gebaut wird |
| Consent-Sidesheet („Was bedeutet das?") | `<Sheet>` aus `@/components/ui/sheet` — existiert |
| Gegnerversicherung-Dropdown (aus `versicherungen`) | `<VersichererSelect>` aus `@/components/shared/VersichererSelect` — existiert |
| QR-Visitenkarte / QR allgemein | bestehender `qrcode`-Server-Code in `MaklerPromo` wiederverwenden |
| Typo Montserrat / JetBrains Mono für Codes/IDs/Kennzeichen | Headings: Montserrat (via `style={{fontFamily:'Montserrat,…'}}` wie etabliert oder `font-heading` falls als Klasse vorhanden); Codes/Kennzeichen/Datum: `font-mono` (`--font-mono`) |

### 3.3 Refactor-Backlog (Hygiene — NICHT Pilot-blockierend, vor breitem Rollout)

1. **`@/components/makler/_shared/`** anlegen: `MaklerKpiCard`, `MaklerCaseRow`, `MaklerStatusPill`, `MaklerAlert`, `MaklerMiniDrawer` — die 4–5 Duplikate konsolidieren.
2. Handgerollte Buttons/Cards schrittweise auf `<Button>`/`<Card>`/`GlassPanel` migrieren (pro Komponente, bei Anfassen).
3. Amber-vs-Orange vereinheitlichen (auf `amber`, das ist der Semantic-Token), `violet` → eine Claimondo-Variante für Kanzlei-Phasen, Hard-Hex (`#f2f3f7`, `#1E3A5F`) → Token.
4. `MaklerChatTab`: Realtime-Channel-Name mit `useId()` (Crash-Hardening), ASCII-Umlaute in Kommentaren fixen.
5. Server-Action-Result-Shape `{ success }` → `{ ok }` (AGENTS-Konvention) in `makler-settings.ts`/`makler-send-message.ts`.
6. Akte-Detail-Timeline aus `timeline`/`phase_transitions` statt aus `faelle`-Datumsfeldern.
7. `MaklerPromo`-`<iframe>` der eigenen Landing-Page evaluieren (Performance/CSP) — ggf. durch statisches Preview-Bild ersetzen.

### 3.4 Neue Komponenten (für die MVP-Lücken) — alle v12-konform von Anfang an

`ConsentCheckbox` (Pflicht-Checkbox + `<Sheet>` mit DSGVO-Volltext, Version aus `settings`), `SchnellanlageForm` (`<Tabs>` Variante A/B, `<Input>`/`<Label>`/`<VersichererSelect>`, 5 States), `WAEinladungForm` (Variante B), `EinladungUnterwegsCard` (Dashboard-Sektion), `FaelleInBearbeitungCard` (Dashboard, 4 `MaklerStatusPill`s), `EmpfehlungsToolsBlock` (Dashboard), `MaklerOnboardingStep` (Wrapper für die 3 OB-Screens), `SelfSignupForm` (`/makler/einladung-anfordern`), `MagicLinkLoginForm` (`/makler/anmelden`).

---

## 4 · Phasen-Plan (zur Abstimmung — danach detaillierter Implementierungsplan pro Phase)

| Phase | Inhalt | Abhängigkeiten / Blocker |
|---|---|---|
| **P0 — Bugfix + Migrationen** | Lead-Status-Bug fixen (`getMaklerDashboardData` + `MaklerLeadsTable.StatusPill`). Migrationen 1–3 (+4 optional) via supabase-CLI. | Vorher: Enum-/Default-Werte fixieren (DSGVO-Template-Version-Format, `hold_until`-Default falls noch nicht im Schema). Schnell, kein externer Blocker. |
| **P1 — Auth & Onboarding** | `/makler/einladung-anfordern` (Self-Sign-up → `makler.status='pending'` + Admin-Notification) · `/makler/anmelden` + `/gesendet` (Magic-Link via `email_otp_codes`, `makler.email`-Lookup, Status-Weiche pending/gesperrt) · `/makler/onboarding/1..3` (echte Daten: Vorname aus `makler.ansprechpartner_vorname`, Provisions-Beträge aus `makler.provision_betrag_*`) · `onboarding_completed_at`-Idempotenz · `/makler/partner-werden` → Link auf `/makler/einladung-anfordern` statt nur `mailto:`. | Self-Sign-up-Genehmigungs-Workflow (wer wird benachrichtigt — Nicolas/Slack/Admin-Dashboard?). |
| **P2 — Variante A (Schnellanlage)** | `/makler/fall-anlegen` (3 Pflichtfelder + `ConsentCheckbox` + Detail-Collapse mit `VersichererSelect`) · `/api/makler/fall-anlegen` (Insert `leads` + `makler_fall_consent` mit `lead_id` + `notification_event` `makler.lead_eingegangen`) · 5 States · Dashboard-„+Fall"-Button. | DSGVO-Checkbox-Wording (Anwalt!) — Text kann als Platzhalter starten, finalisiert vor Live-Schnellanlage. DSGVO-Text-Versionierung in `settings`. |
| **P3 — Variante B (WA-Magic-Link)** | Toggle in `/makler/fall-anlegen` · `/api/makler/fall-einladen-wa` (Insert `leads` `status='flow-gesendet'` + `flow_links` mit `makler_id` + `notification_event` `lead.wa_einladung`) · Twilio-WA-Template · `/schaden-melden?t=`-Token-Flow vorbefüllt + Makler-Branding-Banner + bei Abschluss `makler_provisionen`-Insert · `flow_links`-Reminder-Cron (24h „nicht geöffnet", 6h „abgebrochen") · Dashboard-„Einladungen unterwegs"-Sektion · Token-Hashing (Konsistenz mit `airdrop_invitations`). | **WhatsApp-Business-Sender-Number aktiv + Meta-Template-Approval (2–5 Tage Vorlauf — der Pacing-Engpass).** `flow_links.service_typ='komplett'`-Default vs. „nur Gutachter" → Provisions-Höhe-Entscheidung (Nicolas). DSGVO Variante B (AV mit Twilio). |
| **P4 — Dashboard-Ausbau** | KPI-Set ans Konzept angleichen (Aktive Fälle / Fälle Monat / Provision Monat / Forecast Monat — oder Mischung mit den bestehenden) · „Fälle in Bearbeitung"-Card mit 4 Status-Pills (Status-Mapping gegen `faelle.aktuelle_phase`/`phase_transitions` final klären) · „Einladungen unterwegs"-Sektion (aus P3) · Empfehlungs-Tools-Block · optional Route-Move `/makler` → `/makler/dashboard`. | „Forecast Monat"-Wording (Tooltip „forecast ≠ garantiert"), `hold_until`-Dauer (14/30 Tage). |
| **P5 — Provisionen + Einstellungen + Empfehlungs-Tools** | Provisionen: Trigger-/Hold-Spalten, PDF-Generator (Worker → `abrechnungen`-Row + Mail), `vertragsvorlagen`-PDF-Link. Einstellungen: Konto-Löschen → `dsgvo_loeschauftraege`, Provisionsvereinbarungs-PDF + DSGVO-Auskunft, ungenutzte `admin_tasks`-Action raus. Empfehlungs-Tools: `/makler/promo` → `/makler/empfehlungs-tools` (mit Redirect), Mandanten-Mail-Vorlage + WA-Vorlage + Schulungsvideo + PDF-Visitenkarte + Dashboard-Block + Verwendungs-Tracking. | Provisionsvereinbarungs-PDF muss in `vertragsvorlagen` liegen (Nicolas). Schulungsvideo (Loom) muss existieren. |
| **P6 — Hygiene / Refactor-Backlog** | `_shared/`-Konsolidierung, shadcn-Migration, Farb-Vereinheitlichung, Hard-Hex→Token, `useId()`-Hardening, ASCII-Umlaute, Action-Result-Shape, Timeline-Quelle, `<iframe>`-Ersatz. | Kein Pilot-Blocker — vor breitem Rollout. |

**Pacing-Engpass:** Das Meta-WhatsApp-Template-Approval (P3) braucht 2–5 Werktage — sollte direkt zu Beginn eingereicht werden, parallel zu P0/P1, damit P3 nicht darauf wartet.

---

## 5 · Offene Punkte vor Implementierung (zu klären — siehe auch `MAKLER-PORTAL-MVP.md` Kap. 4 + 9)

**Aaron entscheidet (Code/Architektur):**
- Route-Move `/makler` → `/makler/dashboard`? (sonst bleibt's bei Index)
- `/makler/promo` → `/makler/empfehlungs-tools` umbenennen (mit Redirect)? — Empfehlung: ja
- Einstellungen: Single-Page (7 Sektionen, Bestand) behalten oder auf 4 Sub-Tabs (Konzept) umbauen? — Empfehlung: behalten
- KPI-Set Dashboard: Konzept-4 (Aktive Fälle/Fälle Monat/Provision Monat/Forecast Monat) übernehmen, die Bestands-4 behalten, oder mischen?
- Card-Linie: `<Card>` (shadcn, schlicht) oder `GlassPanel` (Glass-Optik) als Standard fürs Portal?
- Token-Hashing für `flow_links.token` (Konsistenz mit `airdrop_invitations`)?
- `/f/[token]`-Login-freier Fall-Detail-Einstieg: MVP oder Post-MVP?

**Nicolas / Anwalt / extern (nicht-Code-Blocker):**
- DSGVO-Checkbox-Wording (Schnellanlage) + DSGVO bei Variante B (AV-Vertrag Twilio) + Muster-AV Makler↔Claimondo — **Anwalt**
- `hold_until`-Dauer (14/30 Tage), `flow_links.service_typ`-Default vs. „nur Gutachter"-Provisionshöhe, Provisionsbeträge variabel pro Makler? — **Nicolas/Maik**
- Provisionsvereinbarungs-PDF in `vertragsvorlagen` hinterlegen — **Nicolas**
- WhatsApp-Business-Sender-Number aktiv? Sandbox-Fallback OK für Pilot? — **Aaron/Nicolas** — **+ Meta-Template einreichen (Vorlauf!)**
- Self-Sign-up-Genehmigungs-Workflow (wer wird benachrichtigt) — **Nicolas**
- Pilot-/Webinar-Datum (mit Sedelmeier-DAT-Rollout?) — **Nicolas**
- „Forecast"-vs-„Provision"-Wording — **Nicolas**

---

*Diese Datei ist die Planungs-Grundlage. Nach Abstimmung der offenen Punkte folgt pro Phase ein detaillierter Implementierungsplan (`writing-plans`). Das Konzept-MD (`MAKLER-PORTAL-MVP.md`) bleibt die Feature-Spec; wo Bestand abweicht (Routen-Naming, Single-Page-Einstellungen, Chat/Copilot-Tabs), wird das Konzept-MD nachgezogen statt der Code geändert.*
