# SV-LevelUp P1 — Fundament (Datenmodell, Projekt, Registry)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Datenmodell für SV-LevelUp steht auf prod, das eigene Next.js-Projekt startet und liest die Datenbank, und die 17-Modul-Registry mit Score- und Teilbefund-Logik ist implementiert und getestet.

**Architecture:** Neue `levelup_*`-Tabellen in der bestehenden Supabase-Datenbank (`paizkjajbuxxksdoycev`), RLS von Anfang an geschlossen — Schreiben ausschließlich über `service_role` in Server Actions. Das Frontend wird ein eigenständiger Next.js-Build als Monorepo-Unterordner `sv-levelup/`, nach dem Muster von `claimondo-marketing/` (eigenes `package.json`, eigener Deploy-Workflow, host-geroutet auf `sv-levelup.claimondo.de`). Die Modul-Registry ist reiner, testbarer TypeScript-Code ohne DB-Abhängigkeit.

**Tech Stack:** Next.js 16.2.1 (App Router, Server Actions) · TypeScript · Supabase (PostgreSQL 17.6, RLS) · Vitest · Tailwind

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-18-sv-levelup-design.md` — sie gewinnt bei jedem Widerspruch zu den Übergabe-Specs in `~/Downloads/SV-LevelUp-Specs.zip`.
- **DDL ausschließlich über das Supabase-Plugin** (`mcp__plugin_supabase_supabase__apply_migration`). Nie `npx supabase db push`, nie DDL über `execute_sql`. Nach jedem `apply_migration`: `list_migrations` aufrufen, die vom Plugin vergebene Version ablesen und das committete File **exakt so** benennen — sonst Twin-Drift. (AGENTS.md Regel 2)
- **`execute_sql` nur für READ.**
- **Niemals anfassen:** `public.leads` (Schadenfälle von Endkunden, 78 Zeilen), `faelle`, `claims`, `gutachten`, `partner_leads`, `anfragen`.
- **Modul-Ids sind Vertragsbestandteil** und werden nicht umbenannt: `gbp`, `web`, `seo`, `ux`, `gsc`, `wett`, `verz`, `zuweiser`, `ads`, `kwg`, `kwm`, `nach`, `ortsseiten`, `markt`, `nische`, `volumen`, `gebiet`.
- **Gesamtpunkte = 150. Teilbefund-Schwelle = `punkte_erhebbar < 75`** (50 % der Gesamtpunkte).
- **Frontend-Texte auf Deutsch mit echten Umlauten** (`ä`, `ö`, `ü`, `ß`) — nie `ae`/`oe`/`ue`/`ss`. Gilt für alle JSX-String-Literale. Commit-Messages und Code-Kommentare sind davon frei.
- **Next.js 16.2.1 ist nicht die Version aus dem Training.** Vor dem Schreiben von Routen, Layouts oder Server Actions den passenden Guide in `node_modules/next/dist/docs/` lesen. (AGENTS.md)
- **Kein Preis, keine Umsatzprognose** in irgendeiner Ausgabe (R-D).
- **Branch:** `kitta/sv-levelup-spec` im Worktree `.claude/worktrees/sv-levelup-spec`. Absolute Pfade **immer mit** dem `worktrees`-Segment schreiben — sonst landen Änderungen im Haupt-Checkout.

## Was dieser Plan NICHT enthält

Bewusst in Folgepläne verschoben, damit jeder Plan für sich lauffähig bleibt:

| Plan | Inhalt | blockiert durch |
|---|---|---|
| **P2** | RLS-Leck schließen (View `sv_leads_map_pins`) + Anreicherung der 62 Leads | **A-8** (Freigabe Bestandscode) |
| **P3** | Öffentlicher Check, Zustände 1–4 (F-01 bis F-05) | — |
| **P4** | Termin, Lead, Funnel, Lead-Spiegelung nach `tasks` (F-06 bis F-09) | — |
| **P5** | Auswertungslink, Plan-Erzeugung, Gesprächsleitfaden, Konvertierung | — |
| **P6** | Lead-Scraper Deutschland (Welle 7b) | **A-1** (Places-Restriction) |
| **P7** | Massenlauf + Lead-Detail (F-17, F-18) | **A-1** |
| **P8** | Präsentationslink (F-19, F-20) | — |
| **P9** | Cold-Mail-Mechanik (F-21 bis F-23) — endet vor dem ersten Versand | **A-5** (Durchsprache) |

**P1 ist von keiner offenen Aaron-Aufgabe blockiert** und kann sofort laufen.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `supabase/migrations/<V>_levelup_basis.sql` | Die sieben `levelup_*`-Tabellen + RLS + Indizes |
| `supabase/migrations/<V>_sv_leads_levelup_spalten.sql` | Zehn additive Spalten auf `sv_leads` |
| `sv-levelup/package.json`, `next.config.ts`, `tsconfig.json` | Eigenständiger Build |
| `sv-levelup/app/globals.css` | Design-Tokens aus dem Mockup (SV-LevelUp-Marke) |
| `sv-levelup/app/layout.tsx`, `app/page.tsx` | Grundgerüst + Einstiegsseite |
| `sv-levelup/lib/supabase/{server,admin}.ts` | Client-Fabriken (Muster: `claimondo-marketing/lib/supabase/`) |
| `sv-levelup/lib/levelup/registry.ts` | Die 17 Module — Punkte, Modi, Abhängigkeiten, Gruppen, Säulen |
| `sv-levelup/lib/levelup/sperrlogik.ts` | Welches Modul ist unter welchen Bedingungen wählbar |
| `sv-levelup/lib/levelup/messwert.ts` | Messwert-Union + Validator (R-A, R-B) |
| `sv-levelup/lib/levelup/score.ts` | Score, `punkte_erhebbar`, Teilbefund-Regel |
| `sv-levelup/lib/levelup/__tests__/*.test.ts` | Vitest-Tests je Modul |

---

### Task 1: Migration — die sieben levelup-Tabellen mit RLS

**Files:**
- Create: `supabase/migrations/<vom Plugin vergebene Version>_levelup_basis.sql`

**Interfaces:**
- Produces: Tabellen `levelup_checks`, `levelup_funnel`, `levelup_termine`, `levelup_events`, `levelup_praesentationen`, `levelup_auswertungslinks`, `levelup_anreicherung` — alle mit aktivem RLS und ohne jede `anon`-Policy.

- [ ] **Step 1: DDL über das Plugin anwenden**

Rufe `mcp__plugin_supabase_supabase__apply_migration` mit `project_id: "paizkjajbuxxksdoycev"`, `name: "levelup_basis"` und exakt dieser Query auf:

```sql
create table public.levelup_checks (
  id                    uuid primary key default gen_random_uuid(),
  token                 text not null unique,
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
  module_gewuenscht     text[] not null default '{}',
  status                text not null default 'neu'
                        check (status in ('neu','laeuft','fertig','fehler','abgelaufen')),
  score                 smallint,
  kein_score            boolean not null default false,
  punkte_erhebbar       smallint,
  befunde               jsonb not null default '{}',
  massnahmen            jsonb not null default '[]',
  fehlstellen           jsonb not null default '[]',
  zuweiser_treffer      jsonb not null default '[]',
  gsc_property          text,
  gsc_freigabe_am       timestamptz,
  erhoben_am            timestamptz,
  fehler_text           text,
  quelle                text not null default 'sv-levelup.claimondo.de',
  ip_hash               text,
  user_agent            text,
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now(),
  gueltig_bis           timestamptz not null default now() + interval '90 days'
);
comment on column public.levelup_checks.module_gewuenscht is
  'Wunsch des Nutzers, getrennt vom Messbaren. Wer eine URL nachtraegt, bekommt das Modul zurueck (T-02).';
comment on column public.levelup_checks.massnahmen is
  'Bleibt leer bis F-09. Regel R-E: im Zustand fertig nie ausliefern.';

create index levelup_checks_status_idx on public.levelup_checks (status, erstellt_am desc);
create index levelup_checks_lead_idx   on public.levelup_checks (sv_lead_id);

create table public.levelup_funnel (
  check_id           uuid primary key references public.levelup_checks(id) on delete cascade,
  jahre_erfahrung    text check (jahre_erfahrung in ('start','unter2','2bis10','ueber10')),
  ki_nutzung         text check (ki_nutzung in ('taeglich','gelegentlich','nein','unklar')),
  marketing_partner  text check (marketing_partner in ('agentur','nebenbei','selbst','niemand')),
  beantwortet_am     timestamptz not null default now()
);

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
create index levelup_termine_check_idx on public.levelup_termine (check_id);

create table public.levelup_events (
  id          bigserial primary key,
  check_id    uuid references public.levelup_checks(id) on delete cascade,
  typ         text not null,
  payload     jsonb not null default '{}',
  ts          timestamptz not null default now()
);
create index levelup_events_check_idx on public.levelup_events (check_id, ts);

create table public.levelup_praesentationen (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.levelup_checks(id) on delete cascade,
  token          text not null unique,
  erstellt_von   uuid not null references public.profiles(id),
  gueltig_bis    timestamptz not null default now() + interval '30 days',
  widerrufen_am  timestamptz,
  aufrufe        integer not null default 0,
  letzter_aufruf timestamptz,
  erstellt_am    timestamptz not null default now()
);
create index levelup_praes_check_idx on public.levelup_praesentationen (check_id);

create table public.levelup_auswertungslinks (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.levelup_checks(id) on delete cascade,
  token          text not null unique,
  erstellt_von   uuid references public.profiles(id),
  erstellt_am    timestamptz not null default now(),
  letzter_aufruf timestamptz,
  aufrufe        integer not null default 0
);
create index levelup_ausw_check_idx on public.levelup_auswertungslinks (check_id);

create table public.levelup_anreicherung (
  id            bigserial primary key,
  sv_lead_id    uuid not null references public.sv_leads(id) on delete cascade,
  feld          text not null,
  wert_vorher   text,
  wert_nachher  text,
  quelle_url    text not null,
  sicherheit    smallint not null,
  lauf_id       uuid not null,
  ts            timestamptz not null default now()
);
create index levelup_anreicherung_lead_idx on public.levelup_anreicherung (sv_lead_id, ts desc);
create index levelup_anreicherung_lauf_idx on public.levelup_anreicherung (lauf_id);

alter table public.levelup_checks            enable row level security;
alter table public.levelup_funnel            enable row level security;
alter table public.levelup_termine           enable row level security;
alter table public.levelup_events            enable row level security;
alter table public.levelup_praesentationen   enable row level security;
alter table public.levelup_auswertungslinks  enable row level security;
alter table public.levelup_anreicherung      enable row level security;

-- Lesen: Vertriebsrollen. leadbearbeiter ist NICHT in is_staff() enthalten und
-- wird deshalb ausgeschrieben. Kein anon, nirgends.
create policy levelup_checks_vertrieb_sel on public.levelup_checks for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter','kundenbetreuer')));
create policy levelup_checks_vertrieb_upd on public.levelup_checks for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter')));

create policy levelup_termine_vertrieb_sel on public.levelup_termine for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter','kundenbetreuer')));
create policy levelup_termine_vertrieb_upd on public.levelup_termine for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter')));

create policy levelup_praes_staff_sel on public.levelup_praesentationen for select to authenticated
  using (public.is_staff());
create policy levelup_ausw_staff_sel on public.levelup_auswertungslinks for select to authenticated
  using (public.is_staff());
create policy levelup_anreicherung_staff_sel on public.levelup_anreicherung for select to authenticated
  using (public.is_staff());

-- levelup_funnel und levelup_events bekommen bewusst KEINE Lese-Policy:
-- Zugriff ausschliesslich ueber service_role in Server Actions (CONTEXT §3.4).
```

- [ ] **Step 2: Getrackte Version ablesen**

Rufe `mcp__plugin_supabase_supabase__list_migrations` auf. Notiere die Version der obersten (neuesten) Zeile mit Namen `levelup_basis` — z. B. `20260818161500`. **Das Plugin vergibt einen eigenen Zeitstempel; er ist nicht vorhersagbar.**

- [ ] **Step 3: Verifizieren, dass alles steht**

Rufe `mcp__plugin_supabase_supabase__execute_sql` mit dieser Query auf:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name like 'levelup%')                as tabellen,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
     where c.relname like 'levelup%')                                           as policies,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
     where c.relname like 'levelup%'
       and 'anon' = any(select rolname from pg_roles where oid = any(p.polroles))) as anon_policies,
  (select count(*) from public.leads)                                           as leads_unveraendert;
```

Erwartet: `tabellen = 7`, `policies = 7`, **`anon_policies = 0`**, `leads_unveraendert = 78`.

Bricht eine dieser Zahlen aus, **nicht weitermachen** — melden.

- [ ] **Step 4: Migration-File mit exakt der getrackten Version committen**

Schreibe das DDL aus Step 1 unverändert nach `supabase/migrations/<Version aus Step 2>_levelup_basis.sql`.

```bash
git add supabase/migrations/*_levelup_basis.sql
git commit -m "feat(sv-levelup): levelup-Basistabellen + RLS

Sieben Tabellen fuer SV-LevelUp, RLS von Anfang an geschlossen:
keine anon-Policy, Schreiben ausschliesslich ueber service_role.
levelup_funnel und levelup_events ohne Lese-Policy (CONTEXT §3.4).
leadbearbeiter ist nicht in is_staff() -> ausgeschrieben.

Audit:
- Build: n/a (nur DDL)
- UI: n/a
- Redundanz: is_staff() genutzt statt Rollenliste zu wiederholen
- Dead-Code: nichts geloescht
- Spec: CONTEXT §3.3/§3.4 + Design-Spec §6
- Inkonsistenz: File-Name == getrackte Version (kein Twin-Drift)
- Regression: leads unveraendert bei 78 verifiziert"
```

---

### Task 2: Migration — zehn additive Spalten auf sv_leads

**Files:**
- Create: `supabase/migrations/<Version>_sv_leads_levelup_spalten.sql`

**Interfaces:**
- Consumes: `levelup_checks` aus Task 1 (Fremdschlüssel-Ziel).
- Produces: `sv_leads.levelup_letzter_check_id`, `levelup_letzter_score`, `website_url`, `website_gefunden`, `website_sicherheit`, `kontakt_quelle`, `angereichert_am`, `google_place_id`, `entdeckt_am`, `entdeckt_lauf`.

**Warum getrennt von Task 1:** `sv_leads` enthält 62 echte Vertriebsdatensätze. Eine eigene Migration hält den Rollback klein und die Zeilenzahl-Gegenprobe eindeutig.

- [ ] **Step 1: Zeilenzahl VOR der Änderung festhalten**

`execute_sql`: `select count(*) as vorher from public.sv_leads;` — Erwartet: **62**. Notiere den Wert.

- [ ] **Step 2: DDL über das Plugin anwenden**

`apply_migration` mit `name: "sv_leads_levelup_spalten"`:

```sql
alter table public.sv_leads
  add column levelup_letzter_check_id uuid references public.levelup_checks(id) on delete set null,
  add column levelup_letzter_score    smallint,
  add column website_url              text,
  add column website_gefunden         text,
  add column website_sicherheit       smallint,
  add column kontakt_quelle           text,
  add column angereichert_am          timestamptz,
  add column google_place_id          text,
  add column entdeckt_am              timestamptz,
  add column entdeckt_lauf            uuid;

create unique index sv_leads_google_place_id_uidx
  on public.sv_leads (google_place_id) where google_place_id is not null;

comment on column public.sv_leads.levelup_letzter_check_id is
  'Denormalisiert fuer die Vertriebsliste. Wahrheit steht in levelup_checks.';
comment on column public.sv_leads.website_sicherheit is
  'Unter 70 gilt die Zuordnung als unsicher. Der Vertrieb sieht das als Warnung in der Liste.';
comment on column public.sv_leads.google_place_id is
  'Haertester Dedup-Schluessel der Discovery. Stabil, waehrend Namen variieren.';
```

Alle Spalten sind nullable und ohne Default — kein Tabellen-Rewrite, kein Lock über die Dauer.

- [ ] **Step 3: Version ablesen und gegenprüfen**

`list_migrations` → Version notieren. Dann `execute_sql`:

```sql
select
  (select count(*) from public.sv_leads)                                     as nachher,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='sv_leads')                  as spalten,
  (select count(*) from public.sv_leads where google_place_id is not null)   as mit_place_id;
```

Erwartet: `nachher = 62` (**identisch zu Step 1**), `spalten = 46` (36 + 10), `mit_place_id = 0`.

- [ ] **Step 4: File committen**

```bash
git add supabase/migrations/*_sv_leads_levelup_spalten.sql
git commit -m "feat(sv-levelup): zehn additive Spalten auf sv_leads

Alle nullable ohne Default -> kein Rewrite. Partieller Unique-Index auf
google_place_id (Dedup-Schluessel der Discovery, Welle 7b).

Audit:
- Build: n/a (nur DDL)
- UI: n/a
- Redundanz: keine
- Dead-Code: nichts geloescht
- Spec: Design-Spec §6 + §5.5.2
- Inkonsistenz: File-Name == getrackte Version
- Regression: sv_leads 62 Zeilen vorher == nachher verifiziert"
```

---

### Task 3: Projektgerüst sv-levelup/

**Files:**
- Create: `sv-levelup/package.json`, `sv-levelup/next.config.ts`, `sv-levelup/tsconfig.json`
- Create: `sv-levelup/app/layout.tsx`, `sv-levelup/app/page.tsx`, `sv-levelup/app/globals.css`
- Create: `sv-levelup/lib/supabase/server.ts`, `sv-levelup/lib/supabase/admin.ts`
- Create: `sv-levelup/.env.example`

**Interfaces:**
- Produces: `createClient()` (Server-Client mit User-Session, RLS greift) und `createAdminClient()` (Service-Role, umgeht RLS) aus `@/lib/supabase/*`.

- [ ] **Step 1: Next.js-16-Doku lesen**

Lies `node_modules/next/dist/docs/` — mindestens die Abschnitte zu App Router, Server Actions und `next.config`. Version ist **16.2.1**, nicht 15; Konventionen können von bekannten Mustern abweichen. Nimm `claimondo-marketing/next.config.ts` als Referenz für das, was in diesem Repo tatsächlich funktioniert.

- [ ] **Step 2: Gerüst anlegen**

`sv-levelup/package.json` — Muster ist `claimondo-marketing/package.json`, Versionen daraus übernehmen:

```json
{
  "name": "sv-levelup",
  "version": "0.1.0",
  "private": true,
  "description": "sv-levelup.claimondo.de — Sichtbarkeits-Check fuer Kfz-Sachverstaendige (STANDALONE-Build, eigener Release-Zyklus).",
  "scripts": {
    "dev": "next dev -p 3011",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Dependencies mit den **exakt gleichen Versionen** wie `claimondo-marketing` übernehmen (`next` 16.2.1, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `tailwindcss`, `typescript`, `vitest`). Abweichende Versionen im selben Monorepo erzeugen Auflösungskonflikte.

`next.config.ts` mit `output: 'standalone'` (Deploy-Voraussetzung, siehe `deploy-vps-marketing.yml`).

- [ ] **Step 3: Supabase-Clients kopieren und anpassen**

Kopiere `claimondo-marketing/lib/supabase/server.ts` und `admin.ts` nach `sv-levelup/lib/supabase/`. Passe nur Import-Pfade an; die Logik bleibt unverändert.

> `createAdminClient()` ist im Projekt ungetypt — `tsc` prüft `select`-Strings dort **nicht**. Spaltennamen bei jedem Query gegen das echte Schema verifizieren, nicht raten.

- [ ] **Step 4: Design-Tokens setzen**

`sv-levelup/app/globals.css` — Tokens wörtlich aus `~/Downloads/mockup-levelup-v2_1.html` (Zeilen 10–24):

```css
:root{
  --nacht:#0a121c; --asphalt:#111c29; --chrom:#e6ebf2;
  --signal:#ff4d1c; --signal-tief:#e03c0f; --blau:#1668d6;
  --flaeche:#ffffff; --flaeche-2:#f4f7fa; --flaeche-3:#e9eff5;
  --ink:#0a121c; --text:#3c4b5d; --muted:#78899d;
  --linie:#dfe7ef; --linie-stark:#c3cfdc;
  --good:#0ca30c; --warning:#fab219; --serious:#ec835a; --critical:#d03b3b;
  --r:12px; --r-gross:20px;
  --takt:cubic-bezier(.2,.8,.25,1);
}
```

> Das ist eine **eigene Marke**, nicht das Claimondo-Schema — die `claimondo-*`-Tokens und der Token-Audit-Ratchet gelten hier nicht, weil `check:token-audit` ausschließlich `src/**` scannt. Datenreihen bekommen später eine eigene Palette; Signalorange trägt die Marke, nie eine Datenaussage.

- [ ] **Step 5: Typecheck und Start prüfen**

```bash
cd sv-levelup && npm install --no-audit --no-fund && npm run typecheck && npm run build
```

Erwartet: `typecheck` ohne Fehler, `build` erzeugt `.next/standalone`.

- [ ] **Step 6: Commit**

```bash
git add sv-levelup/
git commit -m "feat(sv-levelup): Projektgeruest (Next 16.2.1, standalone)

Eigenstaendiger Build als Monorepo-Unterordner nach dem Muster von
claimondo-marketing. Design-Tokens aus mockup-levelup-v2.html — eigene
Marke, nicht das Claimondo-Schema.

Audit:
- Build: gruen (typecheck + build)
- UI: Einstiegsseite rendert
- Redundanz: Supabase-Clients aus claimondo-marketing uebernommen
- Dead-Code: nichts geloescht
- Spec: Design-Spec §5.1 (E-4)
- Inkonsistenz: Dependency-Versionen identisch zu claimondo-marketing
- Regression: kein Bestandsprojekt angefasst"
```

---

### Task 4: Modul-Registry

**Files:**
- Create: `sv-levelup/lib/levelup/registry.ts`
- Create: `sv-levelup/lib/levelup/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `MODULE: Modul[]`, `GESAMTPUNKTE: number`, `TEILBEFUND_SCHWELLE: number`, `modulNachId(id: ModulId): Modul | undefined`, Typen `ModulId`, `Modus`, `Braucht`, `Gruppe`.

- [ ] **Step 1: Den Test zuerst schreiben**

`sv-levelup/lib/levelup/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GESAMTPUNKTE, MODULE, TEILBEFUND_SCHWELLE, modulNachId } from '../registry'

describe('Modul-Registry', () => {
  it('enthaelt genau 17 Module', () => {
    expect(MODULE).toHaveLength(17)
  })

  it('summiert auf 150 Punkte', () => {
    expect(MODULE.reduce((s, m) => s + m.punkte, 0)).toBe(150)
    expect(GESAMTPUNKTE).toBe(150)
  })

  it('setzt die Teilbefund-Schwelle auf 50 Prozent', () => {
    expect(TEILBEFUND_SCHWELLE).toBe(75)
  })

  it('haelt die Modul-Ids aus der Spec ein', () => {
    expect(MODULE.map((m) => m.id).sort()).toEqual(
      ['ads','gbp','gebiet','gsc','kwg','kwm','markt','nach','nische','ortsseiten',
       'seo','ux','verz','volumen','web','wett','zuweiser'],
    )
  })

  it('vergibt keine doppelten Ids', () => {
    expect(new Set(MODULE.map((m) => m.id)).size).toBe(MODULE.length)
  })

  it('kennt gbp mit 22 Punkten nur im Bestand-Modus', () => {
    const gbp = modulNachId('gbp')
    expect(gbp?.punkte).toBe(22)
    expect(gbp?.modi).toEqual(['bestand'])
  })

  it('fuehrt markt, nische, volumen, gebiet und ortsseiten ohne Punktwertung', () => {
    const ohnePunkte = MODULE.filter((m) => m.punkte === 0).map((m) => m.id).sort()
    expect(ohnePunkte).toEqual(['gebiet','markt','nische','ortsseiten','volumen'])
  })

  it('legt gebiet nur auf den Aufbau-Weg', () => {
    expect(modulNachId('gebiet')?.modi).toEqual(['aufbau'])
  })
})
```

- [ ] **Step 2: Test laufen lassen — er muss fehlschlagen**

```bash
cd sv-levelup && npx vitest run lib/levelup/__tests__/registry.test.ts
```

Erwartet: FAIL mit „Cannot find module '../registry'".

- [ ] **Step 3: Registry implementieren**

`sv-levelup/lib/levelup/registry.ts`:

```ts
export type ModulId =
  | 'gbp' | 'web' | 'seo' | 'ux' | 'gsc'
  | 'wett' | 'verz' | 'zuweiser' | 'ads'
  | 'kwg' | 'kwm' | 'nach' | 'ortsseiten'
  | 'markt' | 'nische' | 'volumen' | 'gebiet'

export type Modus = 'aufbau' | 'bestand'
export type Braucht = 'url' | 'profil' | 'places' | 'browser' | 'ads_konto' | 'meta_konto' | 'gsc' | null
export type Gruppe = 'auftritt' | 'umfeld' | 'nachfrage' | 'markt'

export type Modul = {
  id: ModulId
  titel: string
  punkte: number
  dauerMin: number
  modi: Modus[]
  braucht: Braucht
  gruppe: Gruppe
  /** Säule fuer das Diagramm in der Auswertung. null = ohne Punktwertung. */
  saeule: string | null
}

/**
 * Verbindlich nach Design-Spec §3.1. Die Ids sind Vertragsbestandteil und
 * stehen so in module_gewaehlt, befunde und massnahmen — nie umbenennen.
 *
 * gbp 22 statt 20 und wett 18 statt 16: die je zwei Zusatzpunkte vergibt die
 * Bewertungs-Dynamik (Rate statt Bestand, Design-Spec §3.5).
 */
export const MODULE: Modul[] = [
  { id: 'gbp',        titel: 'Google-Unternehmensprofil',     punkte: 22, dauerMin: 1, modi: ['bestand'],           braucht: 'profil',     gruppe: 'auftritt',  saeule: 'Google-Unternehmensprofil' },
  { id: 'web',        titel: 'Website — Technik & Recht',     punkte: 12, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'auftritt',  saeule: 'Technik & Ladezeit' },
  { id: 'seo',        titel: 'SEO & Inhalte',                 punkte: 12, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'auftritt',  saeule: 'SEO — On-Page & Keywords' },
  { id: 'ux',         titel: 'Nutzererlebnis',                punkte: 12, dauerMin: 2, modi: ['bestand'],           braucht: 'url',        gruppe: 'auftritt',  saeule: 'Nutzererlebnis' },
  { id: 'gsc',        titel: 'Search Console',                punkte: 12, dauerMin: 2, modi: ['bestand'],           braucht: 'gsc',        gruppe: 'auftritt',  saeule: 'SEO — On-Page & Keywords' },
  { id: 'wett',       titel: 'Wettbewerber im 50-km-Umkreis', punkte: 18, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: 'places',     gruppe: 'umfeld',    saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'verz',       titel: 'Branchenverzeichnisse & NAP',   punkte: 12, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'umfeld',    saeule: 'Branchenverzeichnisse & NAP' },
  { id: 'zuweiser',   titel: 'Zuweiser-Netzwerk · 25 km',     punkte: 10, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'places',     gruppe: 'umfeld',    saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'ads',        titel: 'Anzeigen im Transparenzcenter', punkte: 10, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'browser',    gruppe: 'umfeld',    saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'kwg',        titel: 'Google-Keyword-Planer · 20 km', punkte: 14, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: 'ads_konto',  gruppe: 'nachfrage', saeule: 'SEO — On-Page & Keywords' },
  { id: 'kwm',        titel: 'Meta-Reichweite · 20 km',       punkte:  8, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'meta_konto', gruppe: 'nachfrage', saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'nach',       titel: 'Longtail-Recherche',            punkte:  8, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'nachfrage', saeule: 'SEO — On-Page & Keywords' },
  { id: 'ortsseiten', titel: 'Ortsseiten-Abgleich',           punkte:  0, dauerMin: 1, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'nachfrage', saeule: null },
  { id: 'markt',      titel: 'Marktbewertung im Vergleich',   punkte:  0, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: 'places',     gruppe: 'markt',     saeule: null },
  { id: 'nische',     titel: 'Nischen & Positionierung',      punkte:  0, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'markt',     saeule: null },
  { id: 'volumen',    titel: 'Marktvolumen-Rechnung',         punkte:  0, dauerMin: 1, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'markt',     saeule: null },
  { id: 'gebiet',     titel: 'Gebietswahl',                   punkte:  0, dauerMin: 2, modi: ['aufbau'],            braucht: null,         gruppe: 'markt',     saeule: null },
]

export const GESAMTPUNKTE = MODULE.reduce((s, m) => s + m.punkte, 0)

/** Design-Spec §3.2 (E-2): relativ, damit die Schwelle mit der Modulzahl mitwaechst. */
export const TEILBEFUND_SCHWELLE = GESAMTPUNKTE / 2

export function modulNachId(id: ModulId): Modul | undefined {
  return MODULE.find((m) => m.id === id)
}
```

- [ ] **Step 4: Test laufen lassen — er muss durchlaufen**

```bash
cd sv-levelup && npx vitest run lib/levelup/__tests__/registry.test.ts
```

Erwartet: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
git add sv-levelup/lib/levelup/registry.ts sv-levelup/lib/levelup/__tests__/registry.test.ts
git commit -m "feat(sv-levelup): Modul-Registry (17 Module, 150 Punkte)

Nach Design-Spec §3.1. Die Registry aus mockup-levelup-v2.html ist
VERALTET (nur 11 Module, kwg/kwm fehlen) — maszgeblich ist das
Auswertungs-Mockup + GESAMTSPEC §5, ergaenzt um vier neue Module.

Audit:
- Build: gruen (vitest 7/7)
- UI: n/a
- Redundanz: eine Registry, keine Zweitliste
- Dead-Code: nichts geloescht
- Spec: Design-Spec §3.1/§3.2/§3.5
- Inkonsistenz: Summe 150 und Schwelle 75 per Test festgenagelt
- Regression: neues File, keine Konsumenten"
```

---

### Task 5: Sperrlogik

**Files:**
- Create: `sv-levelup/lib/levelup/sperrlogik.ts`
- Create: `sv-levelup/lib/levelup/__tests__/sperrlogik.test.ts`

**Interfaces:**
- Consumes: `MODULE`, `Modul`, `ModulId`, `Modus` aus `./registry`.
- Produces: `type Kontext = { modus: Modus; hatUrl: boolean; hatPlacesZugang: boolean; hatAdsKonto: boolean; hatMetaKonto: boolean; hatGscFreigabe: boolean }`, `sperrgrund(modul: Modul, ctx: Kontext): string | null`, `bereinigeAuswahl(gewuenscht: ModulId[], ctx: Kontext): { akzeptiert: ModulId[]; verworfen: { id: ModulId; grund: string }[]; punkteErhebbar: number }`.

**Warum eigenes Modul:** Die Sperrlogik wird an zwei Stellen gebraucht — im Client zum Ausgrauen der Kacheln und serverseitig in F-02, wo sie verbindlich ist. Eine Quelle, zwei Aufrufer.

- [ ] **Step 1: Den Test zuerst schreiben**

`sv-levelup/lib/levelup/__tests__/sperrlogik.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bereinigeAuswahl, sperrgrund, type Kontext } from '../sperrlogik'
import { modulNachId } from '../registry'

const voll: Kontext = {
  modus: 'bestand', hatUrl: true, hatPlacesZugang: true,
  hatAdsKonto: true, hatMetaKonto: true, hatGscFreigabe: true,
}

describe('Sperrlogik', () => {
  it('sperrt ux im Aufbau-Modus', () => {
    expect(sperrgrund(modulNachId('ux')!, { ...voll, modus: 'aufbau' }))
      .toBe('für diesen Weg nicht vorgesehen')
  })

  it('sperrt web ohne URL', () => {
    expect(sperrgrund(modulNachId('web')!, { ...voll, hatUrl: false }))
      .toBe('braucht eine Website-Adresse')
  })

  it('gibt web frei, sobald eine URL vorliegt', () => {
    expect(sperrgrund(modulNachId('web')!, voll)).toBeNull()
  })

  it('sperrt wett ohne Places-Zugang', () => {
    expect(sperrgrund(modulNachId('wett')!, { ...voll, hatPlacesZugang: false }))
      .toBe('Zugang zur Kartensuche fehlt')
  })

  // T-06: der Client ist nicht vertrauenswuerdig
  it('verwirft serverseitig, was der Client trotz Sperre mitschickt', () => {
    const ctx: Kontext = { ...voll, modus: 'aufbau', hatUrl: false }
    const r = bereinigeAuswahl(['web', 'seo', 'gbp', 'wett'], ctx)
    expect(r.akzeptiert).toEqual(['wett'])
    expect(r.verworfen.map((v) => v.id).sort()).toEqual(['gbp', 'seo', 'web'])
  })

  // T-02: der Wunsch bleibt erhalten, die URL bringt die Module zurueck
  it('gibt Module zurueck, wenn die URL nachgetragen wird', () => {
    const wunsch = ['web', 'seo', 'wett'] as const
    const ohne = bereinigeAuswahl([...wunsch], { ...voll, modus: 'aufbau', hatUrl: false })
    const mit  = bereinigeAuswahl([...wunsch], { ...voll, modus: 'aufbau', hatUrl: true })
    expect(ohne.akzeptiert).toEqual(['wett'])
    expect(mit.akzeptiert.sort()).toEqual(['seo', 'web', 'wett'])
  })

  it('rechnet punkteErhebbar aus den akzeptierten Modulen', () => {
    // markt/nische/volumen tragen 0, ads tragen 10 -> T-04 erwartet 10
    const r = bereinigeAuswahl(['markt', 'nische', 'volumen', 'ads'], voll)
    expect(r.punkteErhebbar).toBe(10)
  })

  it('rechnet den Weg-A-Vollumfang auf 80 Punkte', () => {
    // 150 minus gbp(22), web(12), seo(12), ux(12), gsc(12) = 80.
    // gbp/ux/gsc fallen ueber den Modus weg, web/seo ueber die fehlende URL.
    const ctx: Kontext = { ...voll, modus: 'aufbau', hatUrl: false }
    const alle = ['wett','verz','zuweiser','ads','kwg','kwm','nach','markt','nische','volumen','gebiet'] as const
    expect(bereinigeAuswahl([...alle], ctx).punkteErhebbar).toBe(80)
  })
})
```

- [ ] **Step 2: Test laufen lassen — er muss fehlschlagen**

```bash
cd sv-levelup && npx vitest run lib/levelup/__tests__/sperrlogik.test.ts
```

Erwartet: FAIL mit „Cannot find module '../sperrlogik'".

- [ ] **Step 3: Sperrlogik implementieren**

`sv-levelup/lib/levelup/sperrlogik.ts`:

```ts
import { MODULE, type Modul, type ModulId, type Modus, modulNachId } from './registry'

export type Kontext = {
  modus: Modus
  hatUrl: boolean
  hatPlacesZugang: boolean
  hatAdsKonto: boolean
  hatMetaKonto: boolean
  hatGscFreigabe: boolean
}

/**
 * Liefert den Sperrgrund im Klartext oder null, wenn das Modul messbar ist.
 * Die Gruende erscheinen woertlich auf der Modulkachel — nie nur ausgrauen.
 */
export function sperrgrund(modul: Modul, ctx: Kontext): string | null {
  if (!modul.modi.includes(ctx.modus)) return 'für diesen Weg nicht vorgesehen'

  switch (modul.braucht) {
    case 'url':        return ctx.hatUrl ? null : 'braucht eine Website-Adresse'
    case 'profil':     return ctx.hatPlacesZugang ? null : 'Zugang zur Kartensuche fehlt'
    case 'places':     return ctx.hatPlacesZugang ? null : 'Zugang zur Kartensuche fehlt'
    case 'ads_konto':  return ctx.hatAdsKonto ? null : 'braucht ein Google-Ads-Konto'
    case 'meta_konto': return ctx.hatMetaKonto ? null : 'braucht ein Meta-Business-Konto'
    case 'gsc':        return ctx.hatGscFreigabe ? null : 'braucht Ihre Freigabe für die Search Console'
    case 'browser':    return null // wird vom Menschen ausgeloest (R-F2), nie automatisch gesperrt
    case null:         return null
  }
}

/**
 * Serverseitige Bereinigung. F-02 ruft das auf — der Client ist nicht
 * vertrauenswuerdig (T-06). Der Wunsch des Nutzers wird getrennt gespeichert,
 * damit ein nachgetragenes Feld die Module zurueckbringt (T-02).
 */
export function bereinigeAuswahl(
  gewuenscht: ModulId[],
  ctx: Kontext,
): { akzeptiert: ModulId[]; verworfen: { id: ModulId; grund: string }[]; punkteErhebbar: number } {
  const akzeptiert: ModulId[] = []
  const verworfen: { id: ModulId; grund: string }[] = []

  for (const id of gewuenscht) {
    const modul = modulNachId(id)
    if (!modul) {
      verworfen.push({ id, grund: 'unbekanntes Modul' })
      continue
    }
    const grund = sperrgrund(modul, ctx)
    if (grund) verworfen.push({ id, grund })
    else akzeptiert.push(id)
  }

  const punkteErhebbar = akzeptiert.reduce((s, id) => s + (modulNachId(id)?.punkte ?? 0), 0)
  return { akzeptiert, verworfen, punkteErhebbar }
}

/** Voreinstellung je Weg — alles, was in diesem Modus ueberhaupt messbar ist. */
export function vorauswahl(ctx: Kontext): ModulId[] {
  return MODULE.filter((m) => sperrgrund(m, ctx) === null)
    .filter((m) => m.id !== 'gsc') // opt-in: verlangt eine Freigabe des Nutzers
    .map((m) => m.id)
}
```

- [ ] **Step 4: Test laufen lassen — er muss durchlaufen**

```bash
cd sv-levelup && npx vitest run lib/levelup/__tests__/sperrlogik.test.ts
```

Erwartet: PASS, 8 Tests.

- [ ] **Step 5: Commit**

```bash
git add sv-levelup/lib/levelup/sperrlogik.ts sv-levelup/lib/levelup/__tests__/sperrlogik.test.ts
git commit -m "feat(sv-levelup): Sperrlogik mit serverseitiger Bereinigung

Eine Quelle fuer Client-Ausgrauung und die verbindliche Pruefung in F-02.
Deckt T-02 (Modul kommt zurueck, wenn die URL nachgetragen wird) und
T-06 (Client schickt gesperrtes Modul mit) ab.

Audit:
- Build: gruen (vitest 8/8)
- UI: n/a — liefert die Sperrgruende im Klartext fuer die Kachel
- Redundanz: Sperrlogik existiert genau einmal
- Dead-Code: nichts geloescht
- Spec: CONTRACT F-02 + Design-Spec §3.6
- Inkonsistenz: Umlaute in allen nutzersichtbaren Gruenden
- Regression: neues File, keine Konsumenten"
```

---

### Task 6: Messwert-Union, Validator und Score

**Files:**
- Create: `sv-levelup/lib/levelup/messwert.ts`
- Create: `sv-levelup/lib/levelup/score.ts`
- Create: `sv-levelup/lib/levelup/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `GESAMTPUNKTE`, `TEILBEFUND_SCHWELLE`, `modulNachId` aus `./registry`.
- Produces: `type Messwert<T>`, `istGueltig(m: unknown): boolean`, `pruefeBefund(...)`, `berechneScore(istPunkte: number, punkteErhebbar: number): { score: number | null; keinScore: boolean }`.

- [ ] **Step 1: Den Test zuerst schreiben**

`sv-levelup/lib/levelup/__tests__/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { berechneScore } from '../score'
import { istGueltig } from '../messwert'

describe('Score und Teilbefund', () => {
  it('rechnet den Score auf die erhebbaren Punkte, nicht auf die Gesamtpunkte', () => {
    expect(berechneScore(58, 116)).toEqual({ score: 50, keinScore: false })
  })

  it('gibt bei Weg B ohne Ads-/Meta-Konto und ohne GSC einen Score aus', () => {
    // 150 - 14 (kwg) - 8 (kwm) - 12 (gsc) = 116
    expect(berechneScore(40, 116).keinScore).toBe(false)
  })

  it('gibt bei Weg A ohne Website einen Score aus', () => {
    // 80 erhebbar, knapp ueber der Schwelle von 75
    expect(berechneScore(30, 80).keinScore).toBe(false)
  })

  it('verweigert den Score beim Massenlauf-Teilbefund', () => {
    // web 12 + seo 12 + ux 12 + verz 12 = 48 -> unter 75
    expect(berechneScore(20, 48)).toEqual({ score: null, keinScore: true })
  })

  it('verweigert den Score bei vier Modulen mit 10 Punkten (T-04)', () => {
    expect(berechneScore(4, 10)).toEqual({ score: null, keinScore: true })
  })

  it('gibt bei genau der Schwelle noch einen Score aus', () => {
    expect(berechneScore(50, 75).keinScore).toBe(false)
  })

  it('faengt punkteErhebbar = 0 ab, statt durch null zu teilen', () => {
    expect(berechneScore(0, 0)).toEqual({ score: null, keinScore: true })
  })
})

describe('Messwert-Validator (R-A, R-B)', () => {
  it('nimmt einen Befund mit Quelle und Erhebungsdatum an', () => {
    expect(istGueltig({ status: 'ok', wert: 154, quelle: 'Google Maps', erhoben: '2026-08-12' })).toBe(true)
  })

  it('verwirft einen Befund ohne Quelle (T-08)', () => {
    expect(istGueltig({ status: 'ok', wert: 154, erhoben: '2026-08-12' })).toBe(false)
  })

  it('verwirft einen Befund ohne Erhebungsdatum', () => {
    expect(istGueltig({ status: 'ok', wert: 154, quelle: 'Google Maps' })).toBe(false)
  })

  it('verlangt bei nicht_erhebbar einen Grund (T-09)', () => {
    expect(istGueltig({ status: 'nicht_erhebbar', wert: null, quelle: 'Keyword-Planer', erhoben: null })).toBe(false)
    expect(istGueltig({ status: 'nicht_erhebbar', wert: null, grund: 'Google-Ads-Konto fehlt', quelle: 'Keyword-Planer', erhoben: null })).toBe(true)
  })

  it('verwirft wert 0 im Zustand nicht_erhebbar — fehlt ist nicht null', () => {
    expect(istGueltig({ status: 'nicht_erhebbar', wert: 0, grund: 'x', quelle: 'y', erhoben: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — er muss fehlschlagen**

```bash
cd sv-levelup && npx vitest run lib/levelup/__tests__/score.test.ts
```

Erwartet: FAIL mit „Cannot find module '../score'".

- [ ] **Step 3: Messwert und Validator implementieren**

`sv-levelup/lib/levelup/messwert.ts`:

```ts
/**
 * Diskriminierte Union. Sie deckt R-A (Quelle + Datum an jeder Zahl) und
 * R-B (fehlt ist nicht null) auf Typebene ab — der Validator faengt zur
 * Laufzeit ab, was aus JSON kommt und deshalb ungetypt ist.
 */
export type Messwert<T> = {
  quelle: string
  erhoben: string | null
} & (
  | { status: 'ok'; wert: T }
  | { status: 'nicht_erhebbar'; wert: null; grund: string }
)

export function istGueltig(m: unknown): boolean {
  if (typeof m !== 'object' || m === null) return false
  const o = m as Record<string, unknown>

  // R-A: ohne Quelle kein Befund.
  if (typeof o.quelle !== 'string' || o.quelle.length === 0) return false

  if (o.status === 'ok') {
    // R-A: ein erhobener Wert traegt immer sein Datum.
    if (typeof o.erhoben !== 'string' || o.erhoben.length === 0) return false
    return o.wert !== null && o.wert !== undefined
  }

  if (o.status === 'nicht_erhebbar') {
    // R-B: "nicht erhoben" braucht einen Grund und ist NIE 0.
    if (typeof o.grund !== 'string' || o.grund.length === 0) return false
    return o.wert === null
  }

  return false
}
```

`sv-levelup/lib/levelup/score.ts`:

```ts
import { TEILBEFUND_SCHWELLE } from './registry'

/**
 * Design-Spec §3.2. Der Nenner sind die tatsaechlich ERHEBBAREN Punkte,
 * nicht die Gesamtpunkte — ein Modul ohne Zugang faellt heraus, statt mit
 * 0 bewertet zu werden (R-B).
 */
export function berechneScore(
  istPunkte: number,
  punkteErhebbar: number,
): { score: number | null; keinScore: boolean } {
  if (punkteErhebbar <= 0) return { score: null, keinScore: true }
  if (punkteErhebbar < TEILBEFUND_SCHWELLE) return { score: null, keinScore: true }
  return { score: Math.round((istPunkte / punkteErhebbar) * 100), keinScore: false }
}
```

- [ ] **Step 4: Test laufen lassen — er muss durchlaufen**

```bash
cd sv-levelup && npx vitest run
```

Erwartet: PASS über alle drei Test-Dateien (7 + 8 + 12 Tests).

- [ ] **Step 5: Commit**

```bash
git add sv-levelup/lib/levelup/messwert.ts sv-levelup/lib/levelup/score.ts sv-levelup/lib/levelup/__tests__/score.test.ts
git commit -m "feat(sv-levelup): Messwert-Union, Validator und Score

Union deckt R-A und R-B auf Typebene ab, der Validator faengt ab, was aus
JSON kommt. Score rechnet auf punkteErhebbar (nicht Gesamtpunkte) — ein
Modul ohne Zugang faellt aus dem Nenner statt mit 0 zu zaehlen.
Teilbefund unter 75 von 150.

Audit:
- Build: gruen (vitest 27/27)
- UI: n/a
- Redundanz: Schwelle kommt aus der Registry, nicht als Literal
- Dead-Code: nichts geloescht
- Spec: CONTRACT F-05 + Design-Spec §3.2, Testfaelle T-04/T-08/T-09
- Inkonsistenz: Division durch null abgefangen
- Regression: neue Files, keine Konsumenten"
```

---

## Abnahme P1

- [ ] Sieben `levelup_*`-Tabellen existieren, RLS aktiv, **null anon-Policies**
- [ ] `sv_leads` hat 46 Spalten und weiterhin genau 62 Zeilen
- [ ] `public.leads` unverändert bei 78 Zeilen
- [ ] Beide Migration-Files heißen exakt wie die getrackte Version (kein Twin-Drift)
- [ ] `cd sv-levelup && npm run typecheck && npm run build` grün
- [ ] `cd sv-levelup && npm run test` grün, 27 Tests
- [ ] Registry summiert auf 150, Schwelle bei 75 — beides per Test festgenagelt

**Danach:** P2 (RLS-Leck + Anreicherung) braucht **A-8**. P3 (öffentlicher Check) ist unblockiert und kann direkt folgen.
