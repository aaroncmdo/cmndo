# B2B-Partner-Community-Feed — Design-Spec

**Goal:** Eine Community-Sektion auf der Startseite für die B2B-Partner (Sachverständige, Makler, Werkstätten): redaktionelles/AI-Wissen + (Phase 2) gecrawlte Branchen-News + eigene Nutzer-Beiträge, mit Kommentaren, Threads und Likes. Angezeigter Name = Firma (Partner) / Username (Öffentlichkeit) / „Claimondo Redaktion" (Admin + News).

**Architektur:** Ein geteilter Feed mit Themen-Tags + Filter. Content aus DB (`wissen_artikel` für Redaktions-Wissen, neue `community_posts` für UGC). Kommentare polymorph über die bestehende `article_comments`. Likes neu. Rendering auf `claimondo.de` (Marketing), Moderation in der Haupt-App. Auth: eingeloggte Partner via geteiltem `.claimondo.de`-Cookie; Öffentlichkeit via Magic-Link (bestehend).

**Tech-Stack:** Next.js 16 (beide Apps), Supabase (untypisierte Clients), Wiederverwendung: `article_comments`/`community_profiles` (Kommentar-Feature), `wissen_artikel` (AI-Loop), Magic-Link-Auth, Moderations-Portal-Muster.

## Global Constraints

- **Moderation = „alles sofort + Report"** (Aaron-Entscheidung) — ABER mit Pflicht-Safeguards (s. §5): Rate-Limits, Link-Sperre für Untrusted, Auto-Hide ab Melde-Schwelle, Admin-Takedown. Der öffentliche Consumer-Kommentar auf `/wissen` bleibt **pre-moderiert** (unverändert) — nur der B2B-Feed ist immediate.
- **Identität:** Partner→`profiles.firma`, Public→`community_profiles.username`, Admin/News→„Claimondo Redaktion". Denormalisiert als `author_display` zum Post-Zeitpunkt gespeichert.
- **Umlaut-Pflicht** (UI-Texte). **DDL via Plugin** (Regel 2). **Server-Actions** `{ ok, error? }` + `requireRole`/`createAdminClient`-Muster.
- **DPIA-Erweiterung** vor Public-Launch — öffentliche UGC-*Posts* + öffentliche Firma = größeres Risiko als reine Kommentare.

## §1 — Datenmodell (via apply_migration)

**`community_posts`** (neu, UGC):
- `id uuid pk`, `author_id uuid` (→auth.users), `author_kind text` check(partner|public|admin), `author_display text` (Firma/Username/„Claimondo Redaktion", denormalisiert)
- `body text` check(1–5000), `tags text[]` default '{}'
- `status text` default `'sichtbar'` check(sichtbar|versteckt|geloescht), `report_count int default 0`
- `created_at`, `edited_at`, `moderated_von uuid`, `moderated_am timestamptz`
- RLS: `anon/authenticated select status='sichtbar'`; INSERT/UPDATE nur via service-role-Action (Rate-Limit/Link-Sperre dort erzwungen).

**`article_comments`** (erweitern → polymorph):
- `article_slug` → **nullable** machen; NEU `post_id uuid` (→community_posts, nullable), `target_kind text` check(wissen|post).
- Constraint: genau eines von (article_slug, post_id) gesetzt.
- Threads: `parent_id` (existiert). Report: `report_count` (existiert).
- **Moderations-Split:** Consumer-`/wissen`-Kommentar → `status='pending'` (bestehende RLS, pre-mod). B2B-Kommentar (target_kind=post ODER wissen mit audience=b2b) → via Action als `status='approved'` (immediate) + Rate-Limit/Link-Sperre in der Action.

**`community_likes`** (neu):
- `id uuid pk`, `user_id uuid`, `target_kind text` check(post|wissen|comment), `target_id uuid`, `created_at`
- `unique(user_id, target_kind, target_id)`. RLS: user liest/schreibt/löscht eigene; Aggregat-Count öffentlich lesbar.

**`wissen_artikel`** (erweitern):
- NEU `audience text` default `'consumer'` check(consumer|b2b), `quelle text` default `'redaktion'` check(redaktion|crawl), `tags text[]` default '{}'.
- B2B-Feed zeigt `audience='b2b'`. Bestehende Consumer-Artikel bleiben `'consumer'` (kein Sichtbarkeits-Change auf `/wissen`).

## §2 — Der Feed (Startseite, Marketing)

- Neue Sektion `CommunityFeedSection` auf `claimondo.de` (unter/neben dem Wissens-Widget) — Zielgruppe B2B.
- Zeigt interleaved (nach Datum desc): `wissen_artikel where audience='b2b' and status='veroeffentlicht'` (Badge **„Redaktion"**) + `community_posts where status='sichtbar'` (Autor = `author_display`).
- **Themen-Tags + Filter:** Chips aus einer festen Tag-Vokabular-Liste (`lib/community/tags.ts`); Auswahl filtert den Feed (Query-Param `?tag=`).
- Jedes Item: Content-Preview, Autor + Badge, **Like-Button (+Count)**, Kommentar-Count, Aufklappen → Kommentare/Threads.
- **Composer** „Beitrag verfassen" für eingeloggte Nutzer (Partner/Public-Magic-Link/Admin) — Tags wählbar.

## §3 — Identität + Badges

`resolveAuthorDisplay(user)`: Partner (hat `profiles.firma` + Partner-Rolle) → Firma · Public (`community_profiles.username`) → Username · Admin-Rolle → „Claimondo Redaktion". Zum Post-/Kommentar-Zeitpunkt in `author_display` denormalisiert. News (`wissen_artikel`) + Admin-Posts → **„Redaktion"-Badge**; User-Posts → kein Redaktions-Badge.

## §4 — Interaktion (Actions, Haupt-App)

- `createPost(body, tags)` — author_kind/-display aus dem User resolven; Rate-Limit (z.B. 10/Std) + Link-Sperre (untrusted); status='sichtbar'; via service-role.
- `createCommentB2B(target_kind, target_id, body, parent_id?)` — immediate `approved`; Rate-Limit/Link-Sperre.
- `toggleLike(target_kind, target_id)` — upsert/delete in community_likes.
- `reportPost` / `reportComment` — report_count++; **Auto-Hide ab Schwelle** (z.B. ≥3 → status='versteckt').
- Alle `{ ok, error? }`, `revalidatePath`.

## §5 — Moderation + Safeguards (Pflicht trotz „immediate")

- **Rate-Limits** (Posts + Kommentare pro User/Stunde). **Link-Sperre** für nicht-`trusted` Nutzer (reuse `containsLink`).
- **Auto-Hide** ab N Meldungen (report_count-Schwelle → `versteckt`, wartet auf Admin).
- **Admin-Takedown/-Portal:** `/admin/community` (oder Erweiterung `/admin/kommentare`) — gemeldete + versteckte Posts/Kommentare, Takedown/Löschen/User-Sperre.
- **Netiquette** (B2B-Version) + Melden-Button je Item.

## §6 — Recht (DPIA-Erweiterung, Launch-Gate)

Öffentliche UGC-**Posts** (nicht nur Kommentare) + öffentlich sichtbare **Firma** = höheres Risiko (Selbst-/Dritt-Offenbarung, Defamation gegen benannte Firmen, Wettbewerbsrecht zwischen Partnern). „Immediate publish" verschärft das. **Kern-Mitigationen** (§5) + DPIA-Update + Netiquette + DSB/Anwalt-Sign-off **vor** öffentlichem Launch. Bis dahin ggf. Soft-Launch (nur eingeloggte Partner, kein anonymer Public-Post).

## §7 — Bau-Phasen

- **Phase 1 (MVP, dieser Plan):** Datenmodell (§1) + Feed-Sektion (§2) + Identität (§3) + Post/Comment/Like/Report-Actions (§4) + Safeguards + Admin-Takedown (§5) + Tags/Filter. Kein Crawler.
- **Phase 2:** Gecrawlte-News-Ingestion (Quellen→Claude-Zusammenfassung→Redaktions-Freigabe→`wissen_artikel` quelle='crawl'); Notifications; Rich-Text; DPIA-Finalisierung; Gruppen-Segment-Feinschliff.

## §8 — YAGNI / Out of Scope (MVP)

Notifications, Rich-Text/Bilder in Posts, Follow/Feed-Personalisierung, verschachtelte Threads >1 Ebene (MVP = 1 Reply-Ebene), der Crawler (Phase 2), eigene Portale je Gruppe.

## §9 — Erfolgskriterien

Ein eingeloggter Partner sieht auf der Startseite den B2B-Feed (Redaktions-Wissen + Posts), kann filtern (Tags), einen Beitrag verfassen (erscheint sofort als seine Firma), liken, kommentieren + 1× antworten (Thread); Öffentlichkeit via Magic-Link ebenso; Admin kann takedownen; Rate-Limit/Link-Sperre/Auto-Hide greifen. tsc grün beide Apps, RLS-Smoke (anon sieht nur sichtbare/veröffentlichte), immediate-Insert nur via Action.
