# CONTEXT · SV-LevelUp Vertriebsbereich

**Feature:** `sv-levelup.claimondo.de` — öffentlicher Sichtbarkeits-Check für Sachverständige,
Lead-Speicherung und Vertriebsansicht im bestehenden Claimondo-System.
**Fassung 3.0 · Stand:** 16. August 2026 · **Supabase-Projekt:** `paizkjajbuxxksdoycev` (Claimondo-v2, eu-west-2)

> **Was sich gegenüber Fassung 2.0 geändert hat:** Der Bestand wurde am 16.08.2026 erneut gegen die
> Live-Datenbank geprüft. Vier Annahmen aus Fassung 2.0 waren falsch oder überholt. Dazu kommen vier
> neue Bausteine: Anreicherung der Bestandsleads, Massenlauf, eigene Cold-Mail-Sequenz mit eigenem
> Absender, und der Präsentationslink für den Maßnahmenplan. Siehe Kapitel 9 bis 13.

---

## 0 · Die Architekturentscheidung — und warum sie so fällt

**Kein eigener Login-Bereich. Kein zweites Produkt. Eine Subdomain im bestehenden System.**

Das Vorbild steht schon im Projekt: `gutachter.claimondo.de` schreibt in `public.gutachter_waitlist`,
läuft auf derselben Datenbank, derselben Anmeldung, derselben Rollenlogik. SV-LevelUp macht es
genauso.

| Frage | Antwort | Begründung |
|---|---|---|
| Eigene Datenbank? | **Nein** | `sv_leads` existiert bereits vollständig modelliert (36 Spalten, RLS aktiv, **62 Zeilen** aus `excel_import_2026-05-11`). Ein zweiter Lead-Topf erzeugt Dubletten und zwei Wahrheiten. |
| Eigenes Mailsystem? | **Nein** | `cold_mail_sequenzen`, `-steps`, `-vorlagen`, `-enrollments`, `-sends`, `-suppression` existieren bereits und laufen über Resend. SV-LevelUp bekommt eine **Sequenz** darin, kein zweites System. |
| Eigene Anmeldung? | **Nein** | `profiles.rolle` (Enum `user_role`) hat bereits `admin`, `dispatch`, `leadbearbeiter`, `kundenbetreuer`. Cookie-Domain `.claimondo.de` teilt die Sitzung über Subdomains. |
| Eigene Subdomain? | **Ja** | Eigenes Deployment, eigenes Design (SV-LevelUp-Marke), eigener Release-Zyklus — ohne das Hauptportal zu berühren. |
| Öffentlicher Teil ohne Login? | **Ja** | Der Check läuft über einen Token in der URL, wie `flow_links` es für `/flow/[token]` schon macht. |

**Konsequenz:** Wenn die Entscheidung später doch auf ein eigenständiges Produkt fällt, wandert nur
das Deployment. Datenmodell und Rollen bleiben. Der Rückweg kostet nichts.

---

## 1 · Tech-Stack — WICHTIG: Abweichung von der alten Konvention

> **Achtung, Claude Code:** Die generische Claimondo-Konvention nennt Express.js, JWT im
> `localStorage` unter `cl_token` und Vanilla-JS-SPAs. **Das ist für dieses Projekt veraltet.**
> Der tatsächliche Stand laut Datenbank-Kommentaren (`/faelle/[id]/actions.ts`,
> `createAdminClient`, RLS-Policies, `flow_links` als „Token-Resolution ausschließlich
> server-side") ist:

```
Frontend + Backend: Next.js (App Router), Server Actions
Datenbank:          Supabase PostgreSQL 17.6, RLS auf allen Tabellen
Auth:               Supabase Auth, Rolle in public.profiles.rolle (Enum user_role)
Service-Zugriff:    createAdminClient() — nur server-side, nie im Client
Öffentliche Flows:  Token-Tabelle + server-side Resolution (Vorbild: flow_links)
Mail:               bestehender Versand des Projekts
Benachrichtigungen: notification_events → notification_deliveries (Outbox-Muster)
```

**Vor dem ersten Code:** Prüfe im Repo, ob Next.js- oder Express-Struktur vorliegt, und richte dich
nach dem, was du vorfindest. Wenn beides existiert, frag nach. Baue **keine** neue API-Schicht.

---

## 2 · Dateien — was angefasst werden darf

### Darf neu angelegt werden

```
app/(levelup)/                       gesamter neuer Routen-Baum
  check/[token]/page.tsx             öffentlicher Check
  check/[token]/actions.ts           Server Actions des Checks
  vertrieb/page.tsx                  Lead-Liste (Login nötig)
  vertrieb/[checkId]/page.tsx        Auswertung · Plan · Gespräch
  vertrieb/actions.ts                Server Actions Vertrieb
lib/levelup/                         Modul-Registry, Scoring, Plan-Ableitung
supabase/migrations/YYYYMMDD_levelup_*.sql
```

### Darf gelesen, aber NICHT geändert werden

```
public.sv_leads                      bestehendes Schema — nur zwei Spalten ergänzen (siehe 3.2)
public.profiles                      Rollen und Anmeldung
public.gutachter_waitlist            Vorbild, nicht anfassen
public.consent_records               Einwilligungen
public.notification_events/-deliveries
lib/supabase/*                       bestehende Client-Fabriken
```

### Darf unter keinen Umständen angefasst werden

```
public.leads                         das ist der Schaden-Lead, NICHT der SV-Lead. Verwechslungsgefahr!
public.faelle, claims, gutachten     Kerngeschäft
public.anfragen                      Eingangs-Inbox anderer Kanäle
alles unter app/(portal)/, app/admin/, app/faelle/
```

> **Die häufigste Verwechslung in diesem Projekt:** `public.leads` (75 Zeilen, Stand 16.08.2026) sind
> **Schadenfälle von Endkunden**. `public.sv_leads` (62 Zeilen) sind **Sachverständige als
> Vertriebskontakte**. SV-LevelUp schreibt ausschließlich in `sv_leads` und die neuen
> `levelup_*`-Tabellen.
>
> **Zweite Verwechslung, neu in Fassung 3.0:** Das bestehende Cold-Mail-System hängt über
> Fremdschlüssel an **`partner_leads`** (125 Zeilen, Rolle Werkstatt), nicht an `sv_leads`.
> `cold_mail_enrollments.lead_id`, `cold_mail_sends.lead_id` und `cold_mail_suppression.lead_id`
> zeigen alle auf `partner_leads(id)`. Ein SV-Lead passt dort heute **nicht hinein**. Kapitel 11
> beschreibt die Erweiterung.

---

## 3 · Datenmodell

### 3.1 Bestehende Tabellen, die genutzt werden

**`public.sv_leads`** — der Sachverständige als Vertriebskontakt. Bereits vorhanden:

```
id uuid, name text!, firma, adresse text!, plz, ort, lat!, lng!, telefon, email,
dat_id, dat_url, quelle text!, ist_aktiv bool!, vorname, nachname,
qualifikationen text[], dat_expert_nr, bvsk_nr, ihk_zertifikat bool, oebuv_nr,
jahre_erfahrung int, auftraege_monat int, fachschwerpunkte, radius_km,
warteliste_status text!, warteliste_am, isochrone_polygon jsonb, paket_umkreis_km,
konvertiert_zu_sv_id uuid, konvertiert_am, claim_status text!, normalized_name, notizen,
erstellt_am!, aktualisiert_am!
```

RLS ist aktiv mit vier Policies (`sv_leads__b1sel/ins/upd/del`). **Achtung, drei Korrekturen
gegenüber Fassung 2.0** (gemessen am 16.08.2026):

1. Schreiben (`ins`/`upd`/`del`) erlaubt **nur `rolle = 'admin'`** — nicht `dispatch`,
   nicht `leadbearbeiter`, nicht `kundenbetreuer`. Wer die Anreicherung bauen will, muss das wissen.
2. Lesen erlaubt `admin` **oder `ist_aktiv = true`** — und die Policy gilt für die Rollen
   `authenticated` **und `anon`**. Alle 62 Zeilen haben `ist_aktiv = true`. Siehe Kapitel 9,
   das ist ein Befund, kein Detail.
3. Die Tabelle hat **36 Spalten**, nicht 38, und **kein Feld für die Website**.

**Belegter Füllstand der 62 Zeilen** (Stand 16.08.2026):

| Feld | gefüllt | Feld | gefüllt |
|---|---|---|---|
| `firma` | 62 / 62 | `email` | **0 / 62** |
| `plz` | 62 / 62 | `telefon` | **0 / 62** |
| `adresse`, `lat`, `lng` | 62 / 62 | `vorname` | **0 / 62** |
| `normalized_name` | 62 / 62 | `dat_url` | **0 / 62** |

Alle 62 stammen aus `quelle = 'excel_import_2026-05-11'`, `warteliste_status = 'aktiv'`,
`claim_status = 'offen'`.

> **Die Konsequenz, die alles andere bestimmt:** Kein einziger dieser Leads ist heute per Mail
> erreichbar. Die Anreicherung ist damit keine Kür, sondern die Voraussetzung dafür, dass
> überhaupt eine Sequenz laufen kann. Reihenfolge: **Anreicherung → Check → Mail.** Nicht anders.

**`public.cold_mail_*`** — das bestehende Versandsystem, sechs Tabellen, RLS aktiv,
je eine Policy `is_staff()` für `authenticated` und `anon`:

```
cold_mail_sequenzen    rolle!(makler|werkstatt|sachverstaendiger), name!, aktiv! (default false),
                       auto_enroll! (default false)
cold_mail_steps        sequenz_id!, position!, vorlage_id!, delay_tage! (>=0),
                       bedingung!(immer|wenn_nicht_geoeffnet|wenn_geoeffnet|wenn_keine_antwort)
cold_mail_vorlagen     name!, rolle, betreff!, body_html!, erstellt_von
cold_mail_enrollments  lead_id!→partner_leads, sequenz_id!, aktueller_step!, next_send_at,
                       status!(aktiv|pausiert|fertig|opt_out|bounced|geantwortet)
cold_mail_sends        lead_id!→partner_leads, enrollment_id, step_id, vorlage_id,
                       empfaenger_email!, betreff!, body_snapshot, resend_message_id,
                       status!(gesendet|zugestellt|geoeffnet|geklickt|bounced|beschwerde),
                       gesendet_am!, geoeffnet_am, geklickt_am
cold_mail_suppression  email!, grund!(opt_out|bounce|beschwerde), lead_id→partner_leads
```

Versanddienst ist **Resend** (`resend_message_id`). Inhalt heute: eine Sequenz „SMOKE Demo Sequenz"
(Rolle `werkstatt`, `aktiv = false`, `auto_enroll = false`), eine Vorlage, zwei Steps, ein
Enrollment, drei Sends. **Alles Testdaten.** `rolle = 'sachverstaendiger'` ist im Check-Constraint
bereits erlaubt — die neue Sequenz braucht dafür keine Schemaänderung.

**`public.is_staff()`** — `SECURITY DEFINER`, liefert true für `admin`, `kundenbetreuer`, `dispatch`.
**`leadbearbeiter` ist darin nicht enthalten.** Die neuen `levelup_*`-Tabellen benutzen diese
Funktion, statt die Rollenliste erneut auszuschreiben.

**`public.profiles`** — `id uuid`, `rolle user_role`, `vorname`, `nachname`, `email`.
Enum `user_role`: `admin`, `dispatch`, `flottenmanager`, `kanzlei`, `kunde`, `kundenbetreuer`,
`leadbearbeiter`, `makler`, `sachverstaendiger`, `werkstatt`.

**`public.consent_records`** — für die Einwilligung zur Datenverarbeitung im Funnel.
**`public.dsgvo_loeschauftraege`** — Löschanträge nach Art. 17.
**`public.vertrieb_mail_vorlagen`** — `typ`, `betreff`, `body`, `aktiv`.
**`public.conversion_events`** — `flow_key`, `phase_key`, `event_type`, `session_id`. Service-Role-only.

### 3.2 Zwei neue Spalten auf `sv_leads`

```sql
alter table public.sv_leads
  add column levelup_letzter_check_id uuid references public.levelup_checks(id) on delete set null,
  add column levelup_letzter_score smallint;
comment on column public.sv_leads.levelup_letzter_check_id is
  'Denormalisiert für die Vertriebsliste. Wahrheit steht in levelup_checks.';
```

Mehr nicht. Alles Weitere hängt an `levelup_checks.sv_lead_id`.

### 3.3 Neue Tabellen

```sql
-- Ein durchgeführter Check
create table public.levelup_checks (
  id                    uuid primary key default gen_random_uuid(),
  token                 text not null unique,          -- URL-Token, 32 Zeichen, [A-Za-z0-9_-]
  sv_lead_id            uuid references public.sv_leads(id) on delete set null,
  modus                 text not null check (modus in ('aufbau','bestand')),
  website_url           text,
  standort_ort          text,
  standort_plz          text,
  standort_lat          double precision,
  standort_lng          double precision,
  radius_wettbewerb_km  smallint not null default 50,
  radius_keywords_km    smallint not null default 20,
  module_gewaehlt       text[] not null default '{}',
  status                text not null default 'neu'
                        check (status in ('neu','laeuft','fertig','fehler','abgelaufen')),
  score                 smallint,                      -- NULL bei Teilbefund
  kein_score            boolean not null default false,
  punkte_erhebbar       smallint,
  befunde               jsonb not null default '{}',   -- je Modul: Befunde + Fehlstellen
  massnahmen            jsonb not null default '[]',   -- abgeleiteter Plan
  fehlstellen           jsonb not null default '[]',   -- was nicht erhebbar war, mit Grund
  erhoben_am            timestamptz,
  fehler_text           text,
  quelle                text not null default 'sv-levelup.claimondo.de',
  ip_hash               text,                          -- SHA-256, nie Klartext
  user_agent            text,
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now(),
  gueltig_bis           timestamptz not null default now() + interval '90 days'
);
create index levelup_checks_status_idx on public.levelup_checks (status, erstellt_am desc);
create index levelup_checks_lead_idx   on public.levelup_checks (sv_lead_id);

-- Die drei Funnel-Antworten
create table public.levelup_funnel (
  check_id           uuid primary key references public.levelup_checks(id) on delete cascade,
  jahre_erfahrung    text check (jahre_erfahrung in ('start','unter2','2bis10','ueber10')),
  ki_nutzung         text check (ki_nutzung in ('taeglich','gelegentlich','nein','unklar')),
  marketing_partner  text check (marketing_partner in ('agentur','nebenbei','selbst','niemand')),
  beantwortet_am     timestamptz not null default now()
);

-- Terminwunsch aus der Paywall
create table public.levelup_termine (
  id            uuid primary key default gen_random_uuid(),
  check_id      uuid not null references public.levelup_checks(id) on delete cascade,
  slot_start    timestamptz not null,
  telefon       text not null,
  status        text not null default 'gewuenscht'
                check (status in ('gewuenscht','bestaetigt','stattgefunden','abgesagt','nicht_erschienen')),
  betreuer_id   uuid references public.profiles(id),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);

-- Trichter- und Audit-Ereignisse
create table public.levelup_events (
  id          bigserial primary key,
  check_id    uuid references public.levelup_checks(id) on delete cascade,
  typ         text not null,     -- 'seite_geoeffnet','modus_gewaehlt','umfang_bestaetigt',
                                 -- 'messung_gestartet','messung_fertig','tresor_gesehen',
                                 -- 'termin_gewaehlt','funnel_fertig','plan_gesendet'
  payload     jsonb not null default '{}',
  ts          timestamptz not null default now()
);
create index levelup_events_check_idx on public.levelup_events (check_id, ts);
```

### 3.4 RLS — verbindlich

```sql
alter table public.levelup_checks  enable row level security;
alter table public.levelup_funnel  enable row level security;
alter table public.levelup_termine enable row level security;
alter table public.levelup_events  enable row level security;

-- Lesen nur für Vertriebsrollen
create policy levelup_checks_vertrieb_sel on public.levelup_checks for select
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid()
                   and p.rolle in ('admin','dispatch','leadbearbeiter','kundenbetreuer')));
create policy levelup_checks_vertrieb_upd on public.levelup_checks for update
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.rolle in ('admin','dispatch','leadbearbeiter')));
-- Schreiben aus dem öffentlichen Flow: ausschließlich service_role (kein INSERT-Policy für anon)
```

**Der öffentliche Check schreibt nie direkt.** Jede Schreiboperation läuft über eine Server Action
mit `createAdminClient()`, die den Token auflöst — genau wie `flow_links` es dokumentiert:
„Token-Resolution ausschließlich server-side".

**`levelup_events` und `levelup_funnel`: kein Client-Lesezugriff.** Nur `service_role` und
Vertriebsrollen über Server Actions.

---

## 4 · Wann aus einem Check ein Lead wird

**Das ist die wichtigste Regel des Features und zugleich die DSGVO-Regel.**

| Zustand | `sv_leads`-Eintrag? | Personenbezug |
|---|---|---|
| Check gestartet, Modus gewählt | **nein** | keiner — nur URL, IP-Hash |
| Umfang gewählt, Messung läuft | **nein** | keiner |
| Befund angezeigt | **nein** | keiner |
| Tresor gesehen, kein Termin | **nein** | keiner |
| **Termin gewählt + Telefonnummer eingegeben** | **ja, jetzt** | Telefon, ggf. Firma aus URL |
| Funnel beantwortet | ja (Ergänzung) | Erfahrung, KI, Partner |

**Ableitung:** `levelup_checks.sv_lead_id` bleibt `NULL`, bis eine Kontaktangabe vorliegt. Erst dann
wird `sv_leads` angelegt oder — bei Dublettentreffer über `normalized_name` + `plz` — der
bestehende Datensatz verknüpft.

**Einwilligung:** Vor dem Absenden der Telefonnummer wird ein `consent_records`-Eintrag geschrieben.
Ohne Einwilligung kein Lead. Rechtliche Hinweise sind Hinweise, keine Rechtsberatung.

**Aufbewahrung:** `levelup_checks.gueltig_bis` = 90 Tage. Ein Cron räumt abgelaufene Checks **ohne**
`sv_lead_id` vollständig weg (inklusive `befunde`), Checks **mit** Lead bleiben als Vorgangshistorie.

---

## 5 · Dublettenerkennung

Vor jedem `sv_leads`-Insert:

1. `normalized_name` bilden: Kleinschreibung, Umlaute auflösen (`ö→oe`), Gattungswörter entfernen
   (`kfz`, `sachverständigenbüro`, `gutachter`, `gmbh`, `ingenieurbüro`), Sonderzeichen weg.
2. Suche `sv_leads` mit gleichem `normalized_name` **und** `plz` innerhalb 10 km.
3. Treffer → verknüpfen statt anlegen, `notizen` ergänzen, `aktualisiert_am` setzen.
4. Kein Treffer → anlegen mit `quelle = 'sv-levelup'`, `warteliste_status = 'neu'`.

---

## 6 · Namenskonventionen

| Ebene | Form | Beispiel |
|---|---|---|
| Datenbank | snake_case, deutsch | `module_gewaehlt`, `kein_score` |
| TypeScript | camelCase, deutsch | `moduleGewaehlt`, `keinScore` |
| Modul-Ids | kebab-lose Kurzform | `gbp`, `web`, `seo`, `ux`, `wett`, `verz`, `kwg`, `kwm`, `nach`, `ads`, `markt`, `nische`, `volumen` |
| Routen | deutsch | `/check/[token]`, `/vertrieb` |
| CSS | wie im Mockup | `.modus`, `.mod`, `.mp`, `.baustein` |

**Die Modul-Ids sind Vertragsbestandteil.** Sie stehen so in `module_gewaehlt`, in `befunde`,
in `massnahmen` und in den Mockups. Nicht umbenennen.

---

## 7 · Vorlagen, die bereits existieren

| Datei | Was daraus übernommen wird |
|---|---|
| `mockup-levelup-v2.html` | die sieben Zustände des öffentlichen Checks, Modulkacheln, Sperrlogik |
| `mockup-levelup-auswertung.html` | die drei Vertriebsansichten, Modulleiste, Plan-Erzeugung, Gesprächsleitfaden |
| `GESAMTSPEC-Sichtbarkeitscheck-v2.md` | Modul-Definitionen, Scoring, eiserne Regeln R-A bis R-L |
| `gutachter-sichtbarkeits-check.skill` | die Messmaschine, wird als Worker aufgerufen |

Die Mockups sind **funktionsfähiges HTML mit echter Logik**, kein Bildmaterial. Die Modul-Registry,
die Sperrlogik und die Plan-Ableitung können direkt übernommen werden.

---

## 8 · Die eisernen Regeln, die im Code durchgesetzt werden müssen

| Regel | Durchsetzung im Code |
|---|---|
| **R-A** Quelle und Datum an jeder Zahl | `befunde`-Einträge ohne `quelle` und `erhoben` werden vom Validator abgelehnt |
| **R-B** fehlt ≠ 0 | `wert: null` + `grund` — nie `0` als Platzhalter |
| **R-E** Lösungen nie im Zustand `fertig` ausliefern | `massnahmen` wird erst nach `levelup_termine`-Eintrag in die Antwort gemappt |
| **R-G** robots.txt vor Verzeichnisabfrage | im Worker, nicht in der Route |
| **R-K** Bewertungen aufbauen, nicht kaufen | Textbaustein, nie eine Kauf-Maßnahme erzeugen |
| **R-L** Google und Meta nie zu einer Kennzahl | getrennte Felder in `befunde.kwg` und `befunde.kwm` |

**R-E ist die einzige Regel, die einen Sicherheitsfehler erzeugt, wenn man sie bricht.** Die
Maßnahmen dürfen im Zustand `fertig` **nicht im Netzwerk-Antwortkörper vorkommen** — nicht leer,
nicht `null`, nicht unscharf. Das Feld wird nicht erzeugt.

---

## 9 · BEFUND · Die 62 Leads sind heute für `anon` lesbar

Gemessen am 16.08.2026 gegen die Live-Datenbank:

```sql
-- Policy sv_leads__b1sel, gilt für die Rollen {authenticated, anon}
USING ( EXISTS (select 1 from profiles
                where id = auth.uid() and rolle = 'admin') OR ist_aktiv = true )

-- select count(*) filter (where ist_aktiv) from sv_leads  →  62 von 62
```

Die Lesepolicy gilt auch für `anon`, und das zweite Oder-Glied hängt an keiner Anmeldung. Wer den
öffentlichen Publishable Key hat — der steht per Definition im Browser jeder Claimondo-Seite — kann
**alle 62 Zeilen vollständig lesen**. Heute sind das Firmenname, Adresse, PLZ, Ort, Koordinaten.
Geschäftsdaten, unschön, aber nicht dramatisch.

**Das ändert sich mit der Anreicherung.** Ab dem Moment, in dem `email` und `telefon` gefüllt
sind, steht eine fertige Kontaktliste der Wettbewerber offen im Netz — von uns zusammengetragen,
über unseren Key abrufbar.

**Deshalb ist die Reihenfolge nicht verhandelbar:**

```sql
-- Welle 7, erster Schritt, VOR jedem Anreicherungslauf
drop policy sv_leads__b1sel on public.sv_leads;
create policy sv_leads__b1sel on public.sv_leads
  for select to authenticated
  using ( is_staff() or exists (select 1 from profiles
            where id = auth.uid() and rolle = 'admin') );
```

**Vorher prüfen:** Ob eine öffentliche Ansicht (Gutachtersuche, Kartenansicht) heute auf
`sv_leads` mit `ist_aktiv = true` liest. Wenn ja, braucht diese Ansicht eine eigene View mit
genau den Spalten, die öffentlich sein dürfen — **niemals `email`, `telefon`, `notizen`**.
Findet Claude Code eine solche Stelle, ist das ein Abbruchgrund nach CHECKLIST: melden, nicht raten.

---

## 10 · Anreicherung der Bestandsleads

**Entscheidung Aaron, 16.08.2026:** Gefundene Kontaktdaten werden **direkt in `sv_leads`
geschrieben**, ohne manuelle Freigabestufe. Kein Prüf-Zwischenschritt.

Das ist bewusst so gewählt — 62 Leads, Tempo vor Kontrolle. Damit die Entscheidung umkehrbar
bleibt, wird jede Änderung mitgeschrieben. Das ist keine Freigabe, sondern ein Rückwärtsgang.

### 10.1 Neue Spalten auf `sv_leads`

```sql
alter table public.sv_leads
  add column website_url        text,
  add column website_gefunden   text,     -- 'impressum'|'domain_raten'|'verzeichnis'|'manuell'
  add column website_sicherheit smallint,  -- 0..100, wie sicher ist die Zuordnung
  add column kontakt_quelle     text,     -- Fundstelle, z.B. 'https://…/impressum'
  add column angereichert_am    timestamptz;

comment on column public.sv_leads.website_sicherheit is
  'Unter 70 gilt die Zuordnung als unsicher. Der Vertrieb sieht das als Warnung in der Liste.';
```

### 10.2 Der Rückwärtsgang

```sql
create table public.levelup_anreicherung (
  id            bigserial primary key,
  sv_lead_id    uuid not null references public.sv_leads(id) on delete cascade,
  feld          text not null,          -- 'email','telefon','website_url','vorname',…
  wert_vorher   text,
  wert_nachher  text,
  quelle_url    text not null,          -- wo es gefunden wurde
  sicherheit    smallint not null,      -- 0..100
  lauf_id       uuid not null,          -- alle Änderungen eines Laufs teilen diese Id
  ts            timestamptz not null default now()
);
create index levelup_anreicherung_lead_idx on public.levelup_anreicherung (sv_lead_id, ts desc);
create index levelup_anreicherung_lauf_idx on public.levelup_anreicherung (lauf_id);
```

Append-only. Ein kompletter Lauf lässt sich damit Feld für Feld zurückdrehen. Das ist die
Versicherung dafür, dass direkt geschrieben wird.

### 10.3 Was gesucht wird und wo

| Schritt | Quelle | Regel |
|---|---|---|
| Website finden | Domainraten aus `firma` + `ort`, Verzeichnistreffer | robots.txt gilt (R-G) |
| Impressum lesen | `/impressum`, `/kontakt`, `/imprint` | nur diese Pfade, kein Vollcrawl |
| E-Mail ziehen | `mailto:` und Klartext im Impressum | Rollenadressen (`info@`, `kontakt@`) sind zulässig, werden aber mit `sicherheit ≤ 60` markiert |
| Telefon ziehen | Impressum | Normalisierung auf E.164 |
| Name ziehen | „Inhaber", „Geschäftsführer", „vertreten durch" | nur wenn eindeutig eine Person |

**Nicht gesucht wird:** alles, was hinter einer Anmeldung, einem Captcha oder einer
robots.txt-Sperre liegt. Kein Verzeichnis-Scraping gegen die Nutzungsbedingungen, keine
Proxy-Netze, keine gekauften Adresslisten.

---

## 11 · Cold-Mail für Sachverständige

### 11.1 Das Problem, das zuerst gelöst werden muss

Alle drei Fremdschlüssel des Versandsystems zeigen auf `partner_leads`. Ein `sv_leads.id` lässt
sich dort heute nicht eintragen — der Insert scheitert am Fremdschlüssel.

**Lösung: zweite Spalte statt Aufweichen des Fremdschlüssels.**

```sql
alter table public.cold_mail_enrollments
  add column sv_lead_id uuid references public.sv_leads(id) on delete cascade,
  alter column lead_id drop not null,
  add constraint cold_mail_enrollments_genau_ein_lead
    check (num_nonnulls(lead_id, sv_lead_id) = 1);

alter table public.cold_mail_sends
  add column sv_lead_id uuid references public.sv_leads(id) on delete set null,
  alter column lead_id drop not null,
  add constraint cold_mail_sends_genau_ein_lead
    check (num_nonnulls(lead_id, sv_lead_id) = 1);

alter table public.cold_mail_suppression
  add column sv_lead_id uuid references public.sv_leads(id) on delete set null;
```

`num_nonnulls(...) = 1` erzwingt: entweder Partner-Lead oder SV-Lead, nie beides, nie keines. Die
referenzielle Integrität bleibt auf beiden Seiten erhalten — kein polymorpher Schlüssel ohne
Fremdschlüssel, der später niemandem mehr auffällt.

**Risiko dieser Migration:** gering und belegbar. In den drei Tabellen stehen zusammen ein
Enrollment und drei Sends, alle aus der SMOKE-Demo. Trotzdem gilt: erst auf einem Branch einspielen,
`num_nonnulls`-Constraint gegen die Bestandszeilen prüfen, dann erst produktiv.

### 11.2 Eigener Absender

```sql
alter table public.cold_mail_sequenzen
  add column absender_name  text,
  add column absender_email text,
  add column antwort_an     text;
```

**Festlegung Aaron, 16.08.2026:** `aaron@sv-levelup.claimondo.de`, Anzeigename `Aaron Sprafke`,
`antwort_an` identisch.

Der Absender hängt an der **Sequenz**, nicht global am Dienst. Damit läuft SV-LevelUp über die
eigene Subdomain, während Werkstatt- und Maklersequenzen unverändert über ihren bisherigen Absender
gehen.

**Was in Resend eingerichtet sein muss, bevor die erste Mail rausgeht:**

| Eintrag | Zweck |
|---|---|
| Domain `sv-levelup.claimondo.de` verifiziert | sonst wird nicht zugestellt |
| SPF | Absenderberechtigung |
| DKIM | Signatur |
| DMARC mindestens `p=none` mit `rua` | Rückmeldung über Zustellprobleme |
| Warmup | die ersten Tage kleine Mengen, nicht 62 auf einmal |

Der Reputationsschaden einer schlecht laufenden Kampagne bleibt damit auf der Subdomain und trifft
nicht den Mailverkehr von `claimondo.de` mit Kunden und Fällen.

### 11.3 Die Sequenz

Ein Datensatz in `cold_mail_sequenzen` mit `rolle = 'sachverstaendiger'`, `name = 'SV-LevelUp
Sichtbarkeit'`. **`aktiv = false` und `auto_enroll = false`** — beides bleibt so, bis die
Durchsprache aus `DURCHSPRACHE.md` stattgefunden hat.

Die Datenbank hat diese beiden Schalter bereits, mit `default false`. Das Feature muss nichts
erfinden, es muss die Schalter nur respektieren.

Vier Schritte, Inhalte **noch nicht festgelegt** — sie sind Gegenstand der Durchsprache:

| Position | `delay_tage` | `bedingung` | Zweck |
|---|---|---|---|
| 1 | 0 | `immer` | Erstansprache mit dem gemessenen Befund |
| 2 | 4 | `wenn_nicht_geoeffnet` | anderer Betreff, gleicher Inhalt |
| 3 | 7 | `wenn_keine_antwort` | ein einzelner Messwert als Aufhänger |
| 4 | 14 | `wenn_keine_antwort` | Abschluss, Tür bleibt offen |

### 11.4 Was jede Vorlage tragen muss

Die Adressen stammen nicht von den Empfängern selbst, sondern aus öffentlichen Impressen. Daraus
folgen zwei Pflichtbestandteile in **jeder** Vorlage der Sequenz:

1. **Herkunftsangabe und Widerspruchsrecht** (Art. 14 DSGVO): woher die Adresse stammt, wozu sie
   verarbeitet wird, wer verantwortlich ist, und der Hinweis auf das Widerspruchsrecht.
2. **Ein-Klick-Abmeldung**, die ohne Rückfrage in `cold_mail_suppression` schreibt.

Der Versand prüft `cold_mail_suppression` **vor jedem einzelnen Send**, nicht nur beim Enrollment.

> **Rechtlicher Hinweis, kein Rechtsrat.** Werbliche E-Mail ohne vorherige ausdrückliche
> Einwilligung ist nach § 7 Abs. 2 UWG grundsätzlich unzulässig — auch zwischen Unternehmen. Die
> Ausnahme in § 7 Abs. 3 UWG setzt eine bestehende Kundenbeziehung voraus, die bei diesen 62
> Kontakten nicht besteht. Das ist ein reales Abmahnrisiko und keine Formalie. Wie damit umgegangen
> wird — anderer Kanal, Einwilligung vorschalten, oder das Risiko bewusst tragen — ist eine
> unternehmerische und anwaltliche Entscheidung, keine technische. Sie gehört auf die Tagesordnung
> der Durchsprache und sollte vor dem Scharfschalten mit einem Anwalt geklärt sein. Claude Code
> baut die Mechanik; das Scharfschalten ist ein Menschenklick.

---

## 12 · Der Präsentationslink

Der Maßnahmenplan soll auch außerhalb des Vertriebsbereichs zeigbar sein — als eigene Seite im
SV-LevelUp-Design, erreichbar nur über einen Link, den wir bewusst erzeugen.

```sql
create table public.levelup_praesentationen (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.levelup_checks(id) on delete cascade,
  token          text not null unique,        -- 32 Zeichen, kryptografisch zufällig
  erstellt_von   uuid not null references public.profiles(id),
  gueltig_bis    timestamptz not null default now() + interval '30 days',
  widerrufen_am  timestamptz,
  aufrufe        integer not null default 0,
  letzter_aufruf timestamptz,
  erstellt_am    timestamptz not null default now()
);
create index levelup_praes_check_idx on public.levelup_praesentationen (check_id);
```

| Eigenschaft | Festlegung |
|---|---|
| Route | `/plan/[token]`, kein Login |
| Auffindbarkeit | `noindex, nofollow`, kein Sitemap-Eintrag, keine Verzeichnisansicht |
| Gültigkeit | 30 Tage, danach eine sachliche Ablaufseite — keine Fehlermeldung |
| Widerruf | jederzeit aus dem Lead-Detail, wirkt sofort |
| Zählung | jeder Aufruf erhöht `aufrufe` — im Vertrieb sichtbar, das ist ein Kaufsignal |
| Inhalt | Maßnahmenplan, Herkunft je Maßnahme, Aufwand in Stunden |
| Nicht enthalten | Preise, Umsatzprognosen, Vergleich mit namentlich genannten Wettbewerbern |

### Das Verhältnis zu Regel E

Regel E verbietet, dass Maßnahmen **automatisch** in einer öffentlichen Antwort auftauchen. Der
Präsentationslink ist kein automatischer Weg: Ein angemeldeter Mitarbeiter erzeugt ihn bewusst,
für genau einen Check, widerrufbar und mit Ablauf.

**Damit die Grenze im Code scharf bleibt:**

- Der Token kommt aus `levelup_praesentationen`, **nie** aus `levelup_checks.token`.
- Aus dem Check-Token lässt sich kein Plan-Token ableiten und umgekehrt.
- Der Test T-07 bleibt unverändert scharf: auf `/check/[token]` im Zustand `fertig` darf das Wort
  `massnahmen` im Antwortkörper nicht vorkommen. Der Präsentationslink wird davon nicht berührt,
  weil er eine andere Route mit einer anderen Tabelle ist.

---

## 13 · Neue eiserne Regeln

| Regel | Durchsetzung im Code |
|---|---|
| **R-M** Anreicherung schreibt nur in `sv_leads` und `levelup_anreicherung` | jeder Schreibpfad ist auf diese zwei Tabellen begrenzt; `partner_leads` und `leads` sind für den Anreicherer nicht erreichbar |
| **R-N** Kein Versand ohne Herkunftsangabe und Abmeldelink | Validator prüft beide Bausteine in `body_html`, sonst wird der Send verworfen und protokolliert |
| **R-O** Kein Versand an eine Adresse in `cold_mail_suppression` | Prüfung vor **jedem** Send, nicht nur beim Enrollment |
| **R-P** Jeder Präsentationslink hat ein Ablaufdatum | `gueltig_bis` ist `not null` mit Vorgabewert; ein Link ohne Ablauf kann nicht entstehen |

**R-N und R-O sind Sicherheitstests, keine Stilfragen.** Sie laufen im Testlauf mit.
