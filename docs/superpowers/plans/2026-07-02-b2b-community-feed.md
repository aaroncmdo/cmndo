# B2B-Community-Feed — Implementierungs-Plan (Phase 1 / MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps nutzen `- [ ]`.

**Goal:** Ein geteilter B2B-Community-Feed auf der Startseite: Redaktions-Wissen (`wissen_artikel audience='b2b'`) + Nutzer-Posts (`community_posts`), mit Themen-Tags/Filter, Kommentaren+Threads (1 Ebene), Likes; Identität Firma/Username/Redaktion; Moderation „sofort + Report" mit Safeguards.

**Architektur:** Feed + Write-Path = **Marketing-App** (`claimondo-marketing/`, wie das Kommentar-Feature). Immediate-Inserts + Identitäts-Resolve + Safeguards = **SECURITY-DEFINER-RPCs** (nicht per Direct-API umgehbar). Admin-Moderation = **Haupt-App** (`src/`). Spec: `docs/superpowers/specs/2026-07-02-b2b-community-feed-design.md`.

**Tech-Stack:** Next.js 16, Supabase (untypisiert), Reuse: `article_comments`/`community_profiles` (Kommentar-Feature), `wissen_artikel`, `is_admin()`-RPC, Magic-Link-Auth, `containsLink` (spam.ts).

## Global Constraints

- **Moderation-Flag:** `create_community_post`/`_comment` inserten sofort `sichtbar`/`approved`. **Soft-Launch-Schalter:** eine Konstante `PUBLIC_POST_ENABLED` — false = nur Partner/Admin posten (Public liest+kommentiert), true = auch Public postet. Default **false** (Soft-Launch) bis DSB-OK.
- **Consumer-`/wissen`-Kommentare bleiben pre-moderiert** (unverändert). Nur B2B-Feed = immediate.
- DDL nur via Plugin (Regel 2), File==Version. Server-Actions `{ ok, error? }`. Umlaut-Pflicht (UI). Untypisierte Clients → kein Types-Regen.
- Marketing-tsc-Baseline ~8 ENV-Noise-Fehler; nur NEUE in eigenen Files zählen.

## File Structure

**DB:** 2 Migrationen (Tabellen/RLS · RPCs).
**Marketing (`claimondo-marketing/`):** `lib/community/tags.ts` · `lib/community/community-actions.ts` (Wrapper) · `lib/community/community-queries.ts` (Feed/Threads) · `components/community/CommunityFeed.tsx` + `PostComposer.tsx` + `PostCard.tsx` + `LikeButton.tsx` + `PostComments.tsx` · Einhängen in die Startseite (`components/landing/LandingPage.tsx` o.ä.) · `app/[locale]/community-regeln/page.tsx`.
**Haupt-App (`src/`):** `app/admin/community/` (page + actions + client) · `app/admin/_components/AdminNav.tsx` (EDIT).

---

### Task 1: DB-Foundation (Tabellen + polymorphe Kommentare + wissen-Spalten + RLS)

**Files:** Create `supabase/migrations/<V>_b2b_community_foundation.sql`

- [ ] **Step 1: DDL via apply_migration** (name `b2b_community_foundation`):

```sql
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_kind text not null check (author_kind in ('partner','public','admin')),
  author_display text not null,
  body text not null check (char_length(body) between 1 and 5000),
  tags text[] not null default '{}',
  status text not null default 'sichtbar' check (status in ('sichtbar','versteckt','geloescht')),
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  moderated_von uuid, moderated_am timestamptz
);
create index community_posts_status_created_idx on public.community_posts(status, created_at desc);
create index community_posts_tags_idx on public.community_posts using gin(tags);

create table public.community_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('post','wissen','comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_kind, target_id)
);
create index community_likes_target_idx on public.community_likes(target_kind, target_id);

-- article_comments polymorph: Ziel = wissen ODER post
alter table public.article_comments alter column article_slug drop not null;
alter table public.article_comments add column post_id uuid references public.community_posts(id) on delete cascade;
alter table public.article_comments add column target_kind text not null default 'wissen' check (target_kind in ('wissen','post'));
alter table public.article_comments add constraint article_comments_target_chk
  check ((target_kind='wissen' and article_slug is not null and post_id is null)
      or (target_kind='post'   and post_id is not null and article_slug is null));

-- wissen_artikel: B2B-Audience + Quelle + Tags
alter table public.wissen_artikel add column audience text not null default 'consumer' check (audience in ('consumer','b2b'));
alter table public.wissen_artikel add column quelle text not null default 'redaktion' check (quelle in ('redaktion','crawl'));
alter table public.wissen_artikel add column tags text[] not null default '{}';

alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
grant select on public.community_posts to anon, authenticated;
grant select, insert, delete on public.community_likes to authenticated;
-- Posts: nur sichtbare oeffentlich lesbar; Insert/Update NUR via RPC (Task 2) -> keine Insert-Policy.
create policy community_posts_public_read on public.community_posts for select to anon, authenticated using (status='sichtbar');
-- Likes: jeder liest (fuer Counts), user schreibt/loescht eigene.
create policy community_likes_read on public.community_likes for select to anon, authenticated using (true);
create policy community_likes_own_insert on public.community_likes for insert to authenticated with check (user_id = auth.uid());
create policy community_likes_own_delete on public.community_likes for delete to authenticated using (user_id = auth.uid());
```

- [ ] **Step 2:** `list_migrations` → Version `<V>` ablesen, File als `<V>_b2b_community_foundation.sql` committen (Twin-Drift).
- [ ] **Step 3: RLS-Smoke** (transaktional, `set local role authenticated` + JWT): sichtbarer Post sichtbar (1), versteckter unsichtbar (0); like insert/delete als user ok; anon insert post → verweigert (keine Policy). Erwartungen als `should_be_*`-Spalten.
- [ ] **Step 4: Commit** `feat(community): DB-Foundation posts+likes+polymorphe Kommentare+RLS`.

---

### Task 2: Write-RPCs (Identität + Safeguards + Immediate-Insert)

**Files:** Create `supabase/migrations/<V>_community_write_rpcs.sql`

**Interfaces — Produces:** `create_community_post(body,tags)→uuid` · `create_community_comment(target_kind,target_id,body,parent_id)→uuid` · `toggle_like(target_kind,target_id)→bool` · `report_target(kind,id)→void`. Alle SECURITY DEFINER, `set search_path=public`, grant authenticated.

- [ ] **Step 1: DDL via apply_migration** (name `community_write_rpcs`). Kern — `create_community_post` (die anderen analog):

```sql
create or replace function public.create_community_post(p_body text, p_tags text[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_kind text; v_display text; v_trusted bool := false; v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if char_length(coalesce(p_body,'')) not between 1 and 5000 then raise exception 'body-laenge'; end if;
  -- Rate-Limit: max 10 Posts/Stunde
  if (select count(*) from community_posts where author_id=auth.uid() and created_at > now()-interval '1 hour') >= 10
     then raise exception 'zu viele Beitraege - bitte spaeter'; end if;
  -- Identitaet aufloesen: admin -> partner(firma) -> public(username)
  if public.is_admin(auth.uid()) then v_kind:='admin'; v_display:='Claimondo Redaktion';
  else
    select nullif(trim(firma),'') into v_display from profiles where id=auth.uid();
    if v_display is not null then v_kind:='partner';
    else
      select username into v_display from community_profiles where user_id=auth.uid();
      select trusted into v_trusted from community_profiles where user_id=auth.uid();
      if v_display is null then raise exception 'kein Profil - bitte Nutzername setzen'; end if;
      v_kind:='public';
    end if;
  end if;
  -- Link-Sperre fuer untrusted public
  if v_kind='public' and not coalesce(v_trusted,false) and p_body ~* '(https?://|www\.)'
     then raise exception 'Links erst nach Freischaltung moeglich'; end if;
  insert into community_posts(author_id,author_kind,author_display,body,tags,status)
    values (auth.uid(), v_kind, v_display, p_body, coalesce(p_tags,'{}'), 'sichtbar')
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_community_post(text,text[]) from public, anon;
grant execute on function public.create_community_post(text,text[]) to authenticated;
```

`create_community_comment`: gleiche Identitaets-/Rate-/Link-Logik, insert in `article_comments` als `status='approved'` (immediate), `target_kind`/`post_id` bzw. `article_slug`, `parent_id` (nur 1 Ebene: raise wenn parent selbst schon parent_id hat). `toggle_like`: insert-or-delete in community_likes (auth.uid()). `report_target`: report_count++ auf post/comment; **Auto-Hide ab 3** → status='versteckt'/'hidden'.

- [ ] **Step 2:** Version → File committen.
- [ ] **Step 3: RPC-Smoke** (JWT-simuliert): create_community_post als authenticated → Post sichtbar; Rate-Limit ab 11.; Link-Sperre untrusted; toggle_like 0↔1; report ×3 → versteckt. Grant authenticated=true/anon=false.
- [ ] **Step 4: Commit** `feat(community): Write-RPCs (Identitaet+Safeguards+immediate)`.

---

### Task 3: Tags-Vokabular (Marketing, pure) + Test

**Files:** Create `claimondo-marketing/lib/community/tags.ts` + `tags.test.ts`
- [ ] Exportiere `B2B_TAGS` (feste Liste, z.B. `['Schadenregulierung','Recht & Urteile','Gutachten','Werkstatt','Versicherer','Markt & News','Tools']`) + `isValidTag(t)`. vitest: bekannte Tags valid, Unbekannte nicht.
- [ ] **Commit** `feat(community): Tag-Vokabular + vitest`.

---

### Task 4: Marketing Write-Actions (Wrapper)

**Files:** Create `claimondo-marketing/lib/community/community-actions.ts` (`'use server'`)
Muster **wie `lib/community/actions.ts`** (Kommentar-Feature). Dünne Wrapper: `getUser()`-Gate → `supabase.rpc('create_community_post',{p_body,p_tags})` etc. → `{ ok, error? }` (RPC-Exception-Message mappen), `revalidatePath('/')`. `PUBLIC_POST_ENABLED`-Check (Soft-Launch): wenn false und User ist public → `{ ok:false, error:'Beitraege aktuell nur fuer Partner' }`.
- [ ] tsc (eigene Files). **Commit** `feat(community): Marketing-Write-Actions (RPC-Wrapper)`.

---

### Task 5: Marketing Feed-Queries + Mapping + Test

**Files:** Create `claimondo-marketing/lib/community/community-queries.ts` + `.test.ts`
- [ ] `getCommunityFeed(tag?)`: `wissen_artikel where audience='b2b' and status='veroeffentlicht'` + `community_posts where status='sichtbar'`, optional Tag-Filter, gemappt auf `FeedEntry` (kind:'artikel'|'post', title/body, author_display, badge, tags, created_at, like_count, comment_count), gemerged + nach Datum sortiert (pure `mergeFeed(...)` + Test). `getPostThread(postId)`: approved Kommentare + 1 Reply-Ebene. `getLikeState(userId, targets)`. Anon-Client (cookie-los, wie `db-articles.ts`).
- [ ] vitest auf `mergeFeed` (Sortierung/kind). **Commit** `feat(community): Feed-Queries + Mapping + vitest`.

---

### Task 6: Marketing-UI — CommunityFeed-Sektion + Composer + Interaktion

**Files:** Create `components/community/CommunityFeed.tsx` (server) + `PostComposer.tsx` + `PostCard.tsx` + `LikeButton.tsx` + `PostComments.tsx` (client); EDIT Startseite (Sektion einhängen).
Muster: `WissensRatgeberSection` (Startseiten-Sektion) + `CommentForm`/`ArticleComments` (Interaktion, Magic-Link). Enthält: Tag-Filter-Chips (`B2B_TAGS`, `?tag=`), Feed-Liste (`PostCard`: Autor+`Redaktion`-Badge, Body/Preview, `LikeButton`+Count, Kommentar-Count, Aufklappen→`PostComments` mit 1 Reply-Ebene), `PostComposer` („Beitrag verfassen", Tags wählbar, für eingeloggte; Public via Magic-Link wie Kommentare). Umlaute, claimondo-Tokens.
- [ ] `next build`/tsc (Route+Sektion). **Commit** `feat(community): Startseiten-Feed + Composer + Likes + Threads`.

---

### Task 7: Admin-Moderation (Haupt-App)

**Files:** Create `src/app/admin/community/{page.tsx,actions.ts,ModActions.tsx}`; EDIT `src/app/admin/_components/AdminNav.tsx`
Muster **wie `/admin/kommentare`**: gemeldete + versteckte `community_posts` und `article_comments (target_kind='post')`; Actions `hidePost`/`deletePost`/`hideComment`/`blockUser` (`requireRole(['admin'])`+`createAdminClient`, setzt status + moderated_*); Nav-Item „Community".
- [ ] Main-App-tsc/build. **Commit** `feat(community): Admin-Moderation /admin/community + Nav`.

---

### Task 8: Netiquette-B2B + Verlinkung

**Files:** Create `claimondo-marketing/app/[locale]/community-regeln/page.tsx`; verlinken aus Composer + Feed-Footer.
Muster **wie `/kommentar-regeln`**, B2B-Ton (fachlich, keine Schmähung benannter Firmen/Wettbewerber, kein Rechtsrat, keine Dritt-Daten; Firma öffentlich sichtbar). Melden-Hinweis.
- [ ] tsc. **Commit** `feat(community): B2B-Netiquette + Verlinkung`.

---

## Nach Phase 1
E2E-Smoke (nach Deploy): Partner postet → sofort sichtbar als Firma → liken/kommentieren/1×antworten → Tag-Filter → Report ×3 → versteckt → Admin-Takedown. **Phase 2:** Crawler-Ingestion (`quelle='crawl'`), Notifications, Rich-Text, DPIA-Finalisierung, Gruppen-Segmente. **DPIA-Erweiterung** (öffentliche UGC-Posts + Firma) vor Public-Post-Launch (`PUBLIC_POST_ENABLED=true`).

## Self-Review-Notiz
Spec-Abdeckung: §1→T1, RPCs/Safeguards→T2, Tags→T3, Actions→T4, Feed→T5, UI→T6, Moderation→T7, Netiquette→T8. Write-Path in Marketing (Korrektur ggü. Spec-§4). Immediate robust via RPC (nicht API-umgehbar). Soft-Launch als 1 Konstante. Consumer-Kommentare unberührt.
