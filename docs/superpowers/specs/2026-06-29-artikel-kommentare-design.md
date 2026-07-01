# Artikel-Kommentare für die Claimondo-Wissensinhalte — Design

**Datum:** 2026-06-29 · **Status:** Design (Review pending) · **Branch:** `kitta/artikel-kommentare`
**Kontext:** Folge aus der GEO-Feed-Strecke (PR #3318, gemergt → staging). Verwandt: `marketing-strategy/research/mcp/geo-feeds-spec-2026-05-24.md`, Marker `COORDINATION-marketing-geo-feed-audit.md`.

## Problem / Ziel

Die Wissensinhalte (`/wissen`, Cornerstones, Haftpflicht-Spokes, Decoder, Sachverständige, Versicherer) sind statisch + redaktionell gepflegt. Der GEO-Feed ist nur so frisch wie der Content (H1: News-Top-Item zuletzt 32 Tage alt). **Kommentare unter den Artikeln** liefern:

1. dauerhaft nachwachsenden, crawlbaren **Fresh-Content** (löst H1 strukturell),
2. **Engagement / Community**,
3. **Long-Tail-Q&A** (Comment/DiscussionForumPosting-Schema → SEO/GEO).

**Jeder** darf kommentieren — aber mit **verifiziertem Nutzernamen** (Accountability) und **moderiert**.

## Nicht-Ziele (YAGNI)

- **Keine** user-generierten Artikel (bewusste Entscheidung: ein User-„Artikel" neben dem Rechts-Content macht Claimondo zum Publisher → RDG-/Host-Haftung). Nur Kommentare unter redaktionellem Content.
- Kein Voting/Reactions/Rich-Text in v1 (Plain-Text + Zeilenumbrüche).
- Kein Realtime (kein WebSocket); Reload/Revalidate reicht.
- Maximal **eine** Antwort-Ebene (kein tiefes Threading) in v1.

## Warum „Kommentare" rechtlich sauber ist (und User-Artikel nicht waren)

Ein Nutzername macht den Poster identifizierbar, verlagert aber die **Plattform-Haftung nicht** auf ihn (TMG §§7–10 / DSA). Kommentare unter redaktionellem Content sind der **Standard-Host-Fall**: Claimondo bleibt Host (nicht Publisher), solange (a) Inhalte nicht als eigene adoptiert werden und (b) bei Kenntnis gelöscht wird (Notice-and-Takedown). Damit entfällt das Artikel-Publisher-/RDG-Risiko. Es bleiben die **normalen, beherrschbaren** UGC-Pflichten (Moderation, Takedown, DSE, AGB) — siehe Recht-Sektion.

## Architektur-Überblick

```
Besucher (claimondo.de)                      App-Portal (app.claimondo.de)
  │  Username wählen (Magic-Link)               │  Moderation (admin/redaktion)
  │  Kommentar abschicken ─────────┐            │  approve / reject / hide / block
  ▼                                ▼            ▼
        Supabase  (community_profiles, article_comments)  — RLS-gated
                                   │
            approve ──► revalidatePath(artikel) + IndexNow-Ping
                                   ▼
            Artikel-Seite rendert approved Kommentare (server, crawlbar) + Comment-Schema
```

- **Identität:** Supabase Auth (Magic-Link, passwortlos) + leichtes Profil. Bestehende eingeloggte Claimondo-User kommentieren direkt.
- **Posten/Anzeige:** Marketing-App (claimondo.de, nutzt `@supabase/ssr` bereits).
- **Moderation:** App-Portal (hat Rollen/Auth).
- **Freshness-Loop:** Approve → on-demand `revalidate` + IndexNow-Ping (weckt die heute dormante `submitToIndexNow`).

## Datenmodell

DDL **ausschließlich über das Supabase-Plugin** (`apply_migration`, AGENTS Regel 2), getrackt + als `supabase/migrations/<V>_*.sql` committen. Vorschlag:

```sql
-- Leichter öffentlicher Identitäts-Layer auf auth.users
create table public.community_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,          -- 3–24 Zeichen, [a-z0-9_-], reservierte gesperrt (App + check-constraint)
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  is_blocked  boolean not null default false,
  trusted     boolean not null default false -- true nach N freigegebenen Kommentaren → Auto-Approve
);

create type comment_status as enum ('pending','approved','rejected','hidden');

create table public.article_comments (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.community_profiles(user_id) on delete cascade,
  article_slug  text not null,                 -- kanonischer Pfad ohne Domain, z.B. 'haftpflicht/wertminderung'
  body          text not null,                 -- plain text, 1–2000 Zeichen (check)
  status        comment_status not null default 'pending',
  parent_id     uuid references public.article_comments(id) on delete cascade, -- 1 Antwort-Ebene
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  moderated_by  uuid references auth.users(id),
  moderated_at  timestamptz
);
create index on public.article_comments (article_slug, status, created_at desc);
create index on public.article_comments (author_id);
```

**RLS (Pflicht — die Marketing-Seite liest via anon/ssr):**
- `community_profiles`: SELECT öffentlich (nur `username` relevant); INSERT/UPDATE eigene (`auth.uid() = user_id`); admin/redaktion alles.
- `article_comments`:
  - SELECT: `status = 'approved'` für alle (anon + authenticated) **oder** `author_id = auth.uid()` (eigene immer) **oder** admin/redaktion.
  - INSERT: `auth.uid() = author_id` AND Profil nicht `is_blocked` AND Body-Length ok. Rate-Limit zusätzlich App-/Function-Layer.
  - UPDATE: Autor darf eigenen `body` in kurzem Fenster editieren (setzt `edited_at`; bei untrusted ggf. zurück auf `pending`); admin/redaktion alles (Status).
  - DELETE: Autor eigene (Soft via `hidden` bevorzugt); admin/redaktion alles.

## Identitäts-/Auth-Flow

- Kommentar-Form, nicht eingeloggt → „Username + Email" → Magic-Link → bestätigt → `community_profiles`-Insert (Username unique-Check + reservierte Namen gesperrt) → Kommentar abschicken.
- Eingeloggte Claimondo-User ohne `community_profile` → einmalige Username-Wahl beim ersten Kommentar.
- **DSGVO-Consent** beim ersten Post (Checkbox: Netiquette + Datenverarbeitung) → `consent_at`.
- **Reservierte Usernames** (Impersonationsschutz): `claimondo`, `admin`, `team`, `support`, `mod`, `anwalt`, `kanzlei`, `gutachter`, … (zentrale Liste).

## Moderations-Flow

- Neuer/untrusted User: Kommentar → `status='pending'`. Mod approved → `approved`. Nach **N=2** freigegebenen Kommentaren → `trusted=true` → folgende Kommentare direkt `approved` (Post-Moderation bleibt via `hidden` möglich).
- **Mod-UI im App-Portal** (`admin`/`redaktion`): Queue (pending zuerst), Approve/Reject/Hide, Block-User.
- **Melden-Button** am Kommentar (öffentlich) → Flag → Mod-Queue (Notice-and-Takedown).

## Anti-Spam

- Rate-Limit: max. X Kommentare / Stunde / User **und** / IP-Hash (Server-Action-Check + DB-Funktion).
- Cloudflare **Turnstile** im Form (Fallback: Honeypot v1).
- Link-Limit: untrusted → keine/max. 1 Link.
- Body-Length 1–2000, Plain-Text (Escaping beim Render).

## Anzeige (Marketing)

- Komponente `ArticleComments` (Server, rendert approved Kommentare crawlbar) + `CommentForm` (Client, Posten).
- Kommentar-Zähler + „Kommentieren"-CTA, claimondo-Tokens + Komponenten-Set.
- **`Comment` / `DiscussionForumPosting`-JSON-LD** für approved Kommentare → SEO/GEO.
- Eingebunden unter `/wissen`-Artikeln + Cornerstones/Spokes/Decoder/SV/Versicherer (gemeinsame Render-Komponente der Content-Seiten).

## Freshness-Integration (löst H1)

- Bei Approve (auch Auto-Approve trusted):
  - `revalidatePath('/<article-slug>')` → Artikel-Seite zeigt neuen Kommentar (on-demand ISR).
  - **IndexNow-Ping** (`submitToIndexNow([artikelUrl])`) → Bing & Co. in Minuten benachrichtigt (weckt die dormante Funktion — schließt zugleich geo-feeds-spec §11).
- Approved Kommentare = dauerhaft nachwachsendes Freshness-Signal unter den Artikeln.

## Recht / DSGVO (LAUNCH-GATE, nicht Spec-/Build-Gate)

- **DSE-Update:** neuer Zweck (UGC-Kommentare); Datenarten (username, email, IP-Hash, Inhalt, Timestamp); Rechtsgrundlage (Einwilligung Art. 6(1)(a) + ggf. berechtigtes Interesse); Speicherdauer + Löschrecht; Empfänger (Supabase = AVV vorhanden).
- **Poster-Netiquette / Nutzungsbedingungen** (kein Rechtsrat/Beleidigung/Spam; Löschrecht von Claimondo).
- **Notice-and-Takedown:** Melde-Funktion + Kontakt + zügige Entfernung bei Kenntnis (Host-Privileg TMG/DSA).
- **Kennzeichnung:** „Kommentare geben die Meinung der Verfasser:innen wieder, nicht die von Claimondo."
- **DPIA-Kurzcheck** (öffentliche UGC + PII) via `dpia-sentinel`-Skill — **vor Launch**.

## Units / Komponenten

1. Migration: `community_profiles` + `article_comments` + `comment_status`-enum + RLS (Plugin).
2. Identität: Username-Wahl-Flow (Marketing) + reserved-name-guard + Consent.
3. Server-Actions (Marketing, Result-Object-Pattern): `submitComment`, `editOwnComment`, `deleteOwnComment`, `reportComment`.
4. Moderation (App-Portal): Queue-Page + `approveComment`/`rejectComment`/`hideComment`/`blockUser`.
5. Anzeige: `ArticleComments` (server) + `CommentForm` (client) + Comment-Schema.
6. Anti-Spam: Rate-Limit-Util + Turnstile.
7. Freshness-Hook: `revalidate` + IndexNow on approve.
8. Recht: DSE-Abschnitt, Netiquette-Page, Takedown-Pfad, Reserved-Names.

## Implementierungs-Reihenfolge (für writing-plans)

1. Migration (Tabellen + enum + RLS) — verifiziert via `execute_sql` (READ).
2. Identität/Username-Flow + Profil + reserved-names.
3. Kommentar-Posten (Server-Action + Form) + Anzeige der approved Kommentare.
4. Moderation (App-Portal-Queue + Actions).
5. Anti-Spam + Rate-Limit + Turnstile.
6. Freshness-Hook (revalidate + IndexNow).
7. Comment-Schema + DSE/Netiquette + Kennzeichnung.
8. Tests (vitest: Username-Validierung, Rate-Limit, Status-Logik; e2e: post → pending → approve → sichtbar).

## Akzeptanzkriterien

- [ ] Besucher kann nach verifizierter Username-Wahl einen Kommentar abschicken → erscheint nach Moderation.
- [ ] Anon + Crawler sehen nur `approved` Kommentare (server-rendered + Schema).
- [ ] Mod kann im Portal approve/reject/hide/block.
- [ ] Trusted-User-Kommentare werden auto-approved; Hide bleibt möglich.
- [ ] Rate-Limit + Turnstile greifen; reservierte Usernames gesperrt.
- [ ] Approve triggert `revalidate` + IndexNow-Ping.
- [ ] DSE-Abschnitt + Netiquette vorhanden; Melden/Takedown funktioniert.
- [ ] DPIA-Kurzcheck durchgeführt (Launch-Gate).

## Offene Entscheidungen (mit vorgeschlagenem Default)

- **Threading:** flach vs. 1 Antwort-Ebene → **Default: 1 Ebene** (`parent_id`).
- **Moderations-Schwelle:** **Default: erste 2 pre-moderiert, danach trusted/auto-approve.**
- **Captcha:** **Default: Turnstile** (Honeypot als Minimal-Fallback).
- **Edit-Fenster eigener Kommentare:** **Default: 15 Min, danach gesperrt.**
- **Wo lebt das community_profile-Insert:** Marketing-App (claimondo.de) via Server-Action; Moderation im App-Portal. Geteilte Supabase-Instanz.
