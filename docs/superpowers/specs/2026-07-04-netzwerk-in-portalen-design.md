# Spec: „Netzwerk" — B2B-Community-Feed in den Partner-Portalen (SV · Makler · Werkstatt)

- **Datum:** 2026-07-04
- **Branch:** `kitta/netzwerk-in-portalen` (off `origin/main`, HEAD `a1b26001c`)
- **Status:** Design — Review ausstehend
- **Verwandt:** #3457 (B2B-Community-Feed auf claimondo.de), #3476 (B2B-Content-Pipeline), KFZ-152 (SV-Leaderboard — Namens-Kollision)

## 1 · Ziel & Kontext

Der B2B-Community-Feed (Threads/Posts + AI/Redaktions-Artikel, Kommentare, Likes) existiert
heute **nur auf der öffentlichen Marketing-Seite `claimondo.de`** (Landing-Sektion „Aus der
Community" + `/wissen`). In den **eingeloggten Portalen** ist er nicht erreichbar.

Aaron will den Feed **nativ in die Partner-Portale SV, Makler und Werkstatt** bringen — inkl.
**Beitrag verfassen + kommentieren** aus dem Portal heraus, plus ein kompaktes **Dashboard-Widget**.

Warum in-App statt Link-out: Der Kern der Anforderung ist authentifiziertes **Posten/Kommentieren
im Portal-Kontext**. Ein Link auf `claimondo.de` würde den Nutzer aus dem (ggf. gebrandeten)
Portal werfen und auf die öffentliche Marketing-Startseite setzen. In-App ist der richtige Schnitt —
und weil der komplette **Write-Layer (RPCs) schon existiert und an `authenticated` granted ist**,
kostet es **null DB-Migration**.

## 2 · Ground Truth (verifiziert an Prod-DB `paizkjajbuxxksdoycev` + `origin/main`)

> Wichtige Reconciliation: Der aktuelle Arbeitsbranch `kitta/aar-956-*` ist von *staging*
> abgezweigt; #3457/#3476 sind **nicht auf staging**, aber **auf `main`+Prod**. Deshalb sehen
> naive Working-Tree-Scans das Feature als „nicht vorhanden". Alle folgenden Fakten sind gegen
> **`origin/main`** und die **Prod-DB** verifiziert.

### 2.1 Write-Layer — 100 % wiederverwendbar, `SECURITY DEFINER`, granted an `authenticated`

Verbatim aus Prod (`pg_get_functiondef`):

- `create_community_post(p_body text, p_tags text[] DEFAULT '{}')` → `uuid`
  - Body 1–5000 Zeichen; Rate-Limit **10/Std**; `status='sichtbar'`.
  - `v_public_posts_enabled := false` hardcoded → **nur Partner (trusted) dürfen posten**, „public"
    (anonyme community_profiles) werden geblockt. In-Portal = ausschließlich Partner → posten geht.
- `create_community_comment(p_target_kind text, p_target_id uuid, p_body text, p_parent_id uuid DEFAULT NULL)` → `uuid`
  - `p_target_kind IN ('post','wissen')`; Body 1–2000; Rate-Limit **20/Std**; `status='sichtbar'`.
  - **2-Ebenen-Regel DB-erzwungen:** wirft `Nur eine Antwort-Ebene erlaubt`, wenn `p_parent_id`
    selbst schon ein `parent_id` hat → exakt das YouTube-Modell, serverseitig garantiert.
- `toggle_like(p_target_kind text, p_target_id uuid)` → `boolean`
  - `p_target_kind IN ('post','wissen','comment')` → **Likes gehen auch auf Kommentare** ⇒
    „Top nach Likes" ist real (für Posts, Artikel, Kommentare und Antworten).
- `report_target(p_kind text, p_id uuid)` / `report_comment(p_comment_id uuid)` → Meldung + Auto-Hide.
- `_community_author() → (o_kind, o_display, o_trusted)` (intern, nur service_role):
  - `admin` → `('admin', 'Claimondo Redaktion', true)`
  - sonst coalesce `makler.firma` → `werkstaetten.name` → `personen.firma` → `profiles.firma` →
    `profiles.anzeigename` ⇒ `('partner', <Firma/Name>, true)`
  - **Alle 3 Zielrollen lösen zu `trusted` auf** (Makler=Firma, Werkstatt=Name, SV=Firma/Anzeigename).

**Konsequenz:** Jeder eingeloggte SV/Makler/Werkstatt-Nutzer (`auth.uid()` vorhanden) kann diese
RPCs direkt aufrufen; Identität wird serverseitig aus `auth.uid()` abgeleitet. **Kein Identitäts-,
kein DDL-Code nötig.**

### 2.2 Tabellen (Lesen)

- `community_posts`: `id, author_id, author_kind, author_display, body, tags[], status, report_count, created_at, edited_at, moderated_von, moderated_am`
- `community_comments`: `id, target_kind, target_id, author_id, author_kind, author_display, body, parent_id, status, report_count, created_at, edited_at, moderated_von, moderated_am`
- `community_likes`: `id, user_id, target_kind, target_id, created_at`
- `wissen_artikel`: u. a. `audience` (b2b), `quelle` (`redaktion`|`crawl`), `tags`, Status `veroeffentlicht`, Slug.
  - Aktuell live: 2 veröffentlichte b2b-Artikel (1× `redaktion`, 1× `crawl`).

RLS: sichtbare Posts/Kommentare öffentlich lesbar; Schreiben nur via RPC. App-SSR-Client liest
RLS-konform mit der Partner-Session.

### 2.3 Portale (auf `main`)

| Portal | Route-Group | Nav-Muster | Datei |
|---|---|---|---|
| SV/Gutachter | `src/app/gutachter/` | **hand-rolled** `GutachterShell` (`NavSection[]`) + separater `GutachterMobileTabBar` | `src/app/gutachter/GutachterShell.tsx` |
| Makler | `src/app/makler/(shell)/` | **shared** `PortalNav` (`MAKLER_NAV_ITEMS`) | `src/components/makler/MaklerShell.tsx` |
| Werkstatt | `src/app/werkstatt/(shell)/` | **shared** `PortalNav` (`WERKSTATT_NAV_ITEMS`) | `src/components/werkstatt/WerkstattShell.tsx` |

- **Kollision:** `src/app/gutachter/community/page.tsx` ist der **Einkaufsgemeinschaft-Leaderboard**
  (KFZ-152, gated auf `rolle_in_organisation='community_member'`). Der Social-Feed darf **nicht**
  `/gutachter/community` heißen → Route `netzwerk`.
- **GutachterShell-Bug (nicht Teil dieser Arbeit, nur Vorsicht):** der konditionale Block prüft eine
  Section `'Geschäft'`, die nach Umbenennung nicht mehr existiert → Team/Community/Verifizierung
  rendern im Desktop-Sidebar nicht. Wir hängen „Netzwerk" an eine **tatsächlich gerenderte** Section,
  nicht über diesen Block.

### 2.4 Cross-Domain-Auth

App (`app.claimondo.de`) und Marketing (`claimondo.de`) teilen die Supabase-Session-Cookies auf
`.claimondo.de` (nur `NODE_ENV=production`; lokal host-only). Für uns nur Hintergrund — der In-App-Pfad
braucht kein Cross-Domain-SSO. Server-Actions gaten via `@/lib/auth/guards` `requireRole([...])`.

### 2.5 Marketing-Referenz (Port-Vorlage, nicht importierbar — anderer Build)

`claimondo-marketing/lib/community/{community-queries,community-actions,tags,thread-loader}.ts` +
`claimondo-marketing/components/community/{CommunityFeedSection,CommunityFeedClient,PostCard,PostComposer,PostComments,LikeButton}.tsx`.
Logik wird nach `src/lib/community/*` + `src/components/shared/netzwerk/*` **portiert** (App-Client + App-Komponenten-Set).

## 3 · Entscheidungen (Aaron-approved)

1. **IA:** *ein vereinter Feed* — Posts + b2b-Artikel im selben Stream, Likes/Kommentare auf beidem.
2. **Name/Route:** **„Netzwerk"**, Slug `/{portal}/netzwerk`, einheitlich über alle 3 Portale.
3. **Kommentare:** präsent (fester Block, Composer offen) + **Top-Kommentare** default + **Top-Thread-Antworten** default, X-/YouTube-Stil, Sort „Top | Neueste".
4. **Widget:** kompaktes Dashboard-Widget zusätzlich zur Vollseite.
5. **Placement:** SV = nur Sidebar-Nav (Heute-Seite bleibt operativ) · Makler = **Widget + Nav** · Werkstatt = **Widget ersetzt** „So funktioniert die Vermittlung" + Nav.
6. **Werkstatt-Explainer** wird **nach `/werkstatt/promo` verschoben** (nicht gelöscht).
7. **Architektur:** ein geteiltes Modul, Bau im Worktree **off `main`**, **0 DB-Migration** (RPC-Reuse).

## 4 · Architektur

### 4.1 Module & Grenzen

**Datenschicht — `src/lib/community/`** (Server, RLS-aware App-Client, portiert aus Marketing):
- `feed.ts` — `getNetzwerkFeed({ tag?, limit?, sort? }): NetzwerkEntry[]`
  merged sichtbare `community_posts` + veröffentlichte b2b `wissen_artikel`, nach Aktualität;
  liefert je Eintrag Autor/Kind, Tags, `likeCount`, `commentCount`, **`topComments` (Preview)**.
- `threads.ts` — `getThread(kind, id): CommentTree` (volle 2-Ebenen-Struktur beim Aufklappen),
  `getTopCommentsForEntries(entries): Map<key, CommentPreview[]>` (Top-2 + je Top-Antwort, gebündelt).
- `likes.ts` — `getUserLikedKeys(entries): Set<string>` (Like-Hydration Posts/Artikel/Kommentare).
- `tags.ts` — Tag-Katalog + Filter (port).
- `actions.ts` (`'use server'`, **nur async Funktionen** — AAR-664): `postBeitrag`, `postKommentar`,
  `toggleGefaelltMir`, `melden` — dünne Wrapper über die RPCs, Rückgabe `{ ok, error }`,
  `revalidatePath` der betroffenen Portal-Routen. (Alt. Home `src/lib/actions/` existiert; wir bündeln
  Community-Code unter `src/lib/community/`.)

**UI — `src/components/shared/netzwerk/`** (Client, App-Komponenten-Set):
- `NetzwerkFeed.tsx` — Orchestrator (Vollseite): TagFilter + Sort + PostComposer + Feed-Liste.
- `NetzwerkWidget.tsx` — **Server-Component**, kompakt, `getNetzwerkFeed({ limit: 3 })`.
- `PostComposer.tsx` · `FeedCard.tsx` · `TopComments.tsx` · `CommentThread.tsx` · `CommentComposer.tsx` · `LikeButton.tsx` · `TagFilter.tsx`.

**Mounts:**
- `src/app/gutachter/netzwerk/page.tsx` — lädt Feed, rendert `<NetzwerkFeed portal="gutachter" .../>`.
- `src/app/makler/(shell)/netzwerk/page.tsx` — dito `portal="makler"`.
- `src/app/werkstatt/(shell)/netzwerk/page.tsx` — dito `portal="werkstatt"`.
- Nav-Eintrag „Netzwerk" in jeder der 3 Shells (Details §7).
- Widget-Mount: Makler-Dashboard + Werkstatt-Dashboard (§7).

Auth: die Portal-`layout.tsx` gaten bereits via `requirePortalAccess([...])`; die Seiten selbst
brauchen nur den Feed-Load. Server-Actions gaten zusätzlich `requireRole(['sachverstaendiger','makler','werkstatt'])`
(Defense-in-Depth; die RPCs prüfen ohnehin `auth.uid()` + leiten Identität ab).

### 4.2 Datenfluss (kein N+1)

1. Feed-Einträge: Union(visible posts, published b2b articles) → sort `created_at desc` → limit.
2. Für die Einträge gebündelt: Like-Counts + `getUserLikedKeys`.
3. Top-Kommentar-Preview gebündelt: Top-Level-Kommentare (`parent_id IS NULL`) der Einträge +
   deren Like-Counts → in-memory Top-2 je Eintrag; für diese Top-2 die Antworten (`parent_id IN (...)`)
   + Like-Counts → je Top-Antwort; plus `commentCount` je Eintrag. **Wenige Batch-Queries, keine neue
   Tabelle/View.**
4. Vollständiger Thread erst bei „Alle N Kommentare anzeigen" (`getThread`, lazy).

## 5 · Kommentar-Modell (X-/YouTube-Stil)

- **2 Ebenen (DB-garantiert):** Ebene 1 Top-Level-Kommentar am Post/Artikel · Ebene 2 Antwort auf einen
  Kommentar. Tiefer sperrt die RPC. „Antwort auf Antwort" ⇒ Client setzt `p_parent_id` = **Top-Kommentar**
  + `@Erwähnung` des Adressaten (YouTube-Flatten).
- **Default-Ansicht (präsent, ohne Klick):** je Eintrag **Top 2 Kommentare** (Sort „Top"=meiste Likes,
  Tiebreak neueste); je Kommentar **Top-Antwort**-Vorschau + „**N weitere Antworten**"; darunter
  „**Alle N Kommentare anzeigen**".
- **Interaktionszeile** je Kommentar/Antwort: ♥ Like+Zähler · „Antworten" · „Melden". Composer immer offen.
- **Sort-Umschalter „Top | Neueste"** (Top-Level).
- **Badges:** `author_kind='admin'` → „Redaktion" (offiziell) · `partner` → Firma/Name.

## 6 · UI / Komponenten-Set (AGENTS.md-konform, Ratchets grün)

- Card: `SectionCard` (`@/components/shared/SectionCard`) / `Card` (`@/components/primitives`).
- Composer/Textarea: `<textarea>` mit Token-Klassen (Muster: `gutachter/fall/.../StellungnahmeCard.tsx`)
  oder `@/components/onboarding/fields/TextareaField`; Submit via `Button` (`@/components/primitives`, `variant`, `loading`).
- Tag-Chips: `Chip` + `ChipRow` (`@/components/ui/Chip`).
- Avatar: `@/components/shared/Avatar`. Like: `Button size="icon"` + `HeartIcon` + Count `Badge`.
- Empty: `EmptyState` (`@/components/shared/EmptyState`).
- Tokens: `bg-claimondo-*`/`text-claimondo-*`, `rounded-ios-{sm,md,lg,xl}`, `text-body*`/`text-heading-*`,
  Status-Tokens `bg-success`/`-warning`/`-danger`/`-info`. Kein Inline-Hex, keine raw Farbskalen.

## 7 · Nav- & Widget-Integration je Portal

### SV (`GutachterShell.tsx`)
- Neuer `NavItem` `{ href: '/gutachter/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon }` in eine
  **gerenderte** Section von `NAV_SECTIONS_BASE` (z. B. neue Position in „Tagesgeschäft" oder eigene Section),
  **unbedingt** außerhalb des toten `'Geschäft'`-Konditionals; unconditional (alle SV-Partner).
  `/gutachter/community` (Leaderboard) bleibt unangetastet.
- Optional Mobile: Eintrag in `GutachterMobileTabBar` „Mehr"-Overflow. **Kein Dashboard-Widget** (Heute-Seite bleibt operativ).

### Makler (`MaklerShell.tsx` + `src/app/makler/(shell)/page.tsx`)
- `{ href: '/makler/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon }` an `MAKLER_NAV_ITEMS`
  (ans Ende → nicht im Mobile-`slice(0,4)`; falls Mobile gewünscht: innerhalb der ersten 4).
- Widget: `<NetzwerkWidget portal="makler" />` in `page.tsx` **unter** `<MaklerDashboard/>` (page-Ebene, nicht invasiv).

### Werkstatt (`WerkstattShell.tsx` + `src/app/werkstatt/(shell)/page.tsx`)
- `{ href: '/werkstatt/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon }` an `WERKSTATT_NAV_ITEMS`.
  (Achtung: `WERKSTATT_MOBILE_ITEMS = WERKSTATT_NAV_ITEMS` → erscheint auch mobil.)
- **Ersetzen:** die `<section>` „So funktioniert die Vermittlung" (aktuell Z. 81–107) durch
  `<NetzwerkWidget portal="werkstatt" />`.
- **Explainer-Umzug:** die 4-Schritt-`<ol>` (QR aushängen → Kunde scannt → Provision → Auszahlung nach Widerruf)
  nach `src/app/werkstatt/(shell)/promo/page.tsx` (QR-Code-Seite = natürlicher Ort). Provisions-Betrag dort
  ggf. aus vorhandener Query beziehen; sonst statischer Wortlaut ohne dynamischen Betrag.

### `NetzwerkWidget` (kompakt)
Titel „Aus dem Netzwerk"; 3 neueste Einträge einzeilig (Autor/Firma bzw. „Redaktion"-Badge, Snippet,
♥/💬-Counts); Footer „**Zum Netzwerk →**" → `/{portal}/netzwerk`. Gleiche Datenschicht wie die Vollseite.

## 8 · Moderation & Safeguards (bestehend, wiederverwendet)

Rate-Limits (in RPC), Link-Sperre für untrusted-public (In-Portal irrelevant, alle trusted), Auto-Hide ab
3 Meldungen (`report_count`), Admin-Moderation `/admin/community`. In-Portal-„Melden" → `report_target`/`report_comment`.

## 9 · Error-Handling (AGENTS.md Server-Actions)

Actions liefern `{ ok: boolean; error?: string }` (kein `throw`); Client zeigt Toast bei `!ok`. Jede
mutierende Action `revalidatePath('/gutachter/netzwerk' | '/makler/netzwerk' | '/werkstatt/netzwerk')`
(+ Dashboard-Routen, wo das Widget steht). Non-kritische Teiloperationen entfallen (keine WA/Email-Sends).

## 10 · Testing

- **Unit (vitest):** `feed.ts` Merge/Sort/Top-Kommentar-Auswahl (Top-2 + Top-Antwort-Ranking, Tiebreak);
  `tags.ts` Filter; `actions.ts` Wrapper (RPC mit korrekten Args, `{ ok, error }`-Mapping).
- **Build/Typecheck:** voller `npm run build` (neue Routen/Layouts → Next-Validator).
- **Ratchets:** `check:component-set`, `check:knip`, `check:token-audit` grün (0 neue Verstöße).
- **Prod-Smoke (JWT-Partner je Rolle):** Nav „Netzwerk" sichtbar → posten → Eintrag im Feed +
  Top-Kommentar-Preview → kommentieren → antworten (2-Ebenen) → liken (Post + Kommentar) → melden;
  Widget rendert 3 Einträge + „Zum Netzwerk"; Werkstatt-Dashboard zeigt Widget statt Explainer,
  Explainer auf `/werkstatt/promo`.

## 11 · Deployment / Risiken / Koordination

- **Basis:** Worktree `.claude/worktrees/netzwerk-in-portalen`, Branch `kitta/netzwerk-in-portalen` off `origin/main`.
- ✅ **Merge-Target = `staging`** (Aaron 2026-07-04): Regel-1-konform; die **Merge-Session** promotet
  staging→main→prod. Supabase-Preview ist ohnehin systemisch rot → kein Verlust. Feature ist auf **Prod
  sofort korrekt** (0 Migration; community-Tabellen dort via main live).
  - **Feature-Commits atomar halten** → Merge-Session übernimmt nur die Feature-Commits, nicht die main↔staging-Differenz.
  - **Graceful Guard:** `feed.ts` + Widget fangen „relation does not exist" (`42P01`) ab → Empty-State statt 500,
    falls einer noch-nicht-migrierten Staging-DB community-Tabellen fehlen.
  - **„Migrationen müssen funktionieren":** 0 neue Migration; bestehende community-Migrationsfiles reisen aus main
    mit und applien sauber (prod-verifiziert) — werden **nicht** angefasst (kein Twin-Drift, Regel 2).
- ⚠️ **Werkstatt-Koordination:** 2 Sessions arbeiten am Werkstatt-Portal (`werkstatt-qr-pool`,
  aar-956 „Aufträge/Vermittlungen-View"). Meine Änderungen: 1 Nav-Item (`WerkstattShell.tsx`),
  `page.tsx` (Widget-Swap), `promo/page.tsx` (Explainer-Umzug). Kleine Konfliktfläche → **Werkstatt zuletzt**,
  vor Push rebasen; Marker in `memory/` setzen.
- **SV `/gutachter/community`** (Leaderboard) wird nicht angefasst; der GutachterShell-`'Geschäft'`-Bug ist
  **out of scope** (nur umgehen).
- **0 DDL** → keine Regel-2-Migration, kein Twin-Drift-Risiko.

## 12 · Out of Scope / Future

- **Notifications** (Kommentar-Antwort → Benachrichtigung) = Phase 2 (wie Original-Spec #3457).
- **SV-Firmenname-Linkage** im Resolver (SV löst z. T. auf `anzeigename` statt Firma) — bekannter Follow-up;
  MVP-tauglich (Identität vorhanden).
- **Kunde-Portal** bewusst ausgeschlossen (B2B-Feed).
- **„Top | Neueste"-Toggle** ist im Scope (matcht X/YT); falls MVP-schlanker gewünscht: Default „Top" reicht.

## 13 · Offene Punkte

1. ✅ **Merge-Target = `staging`** (Aaron 2026-07-04, s. §11); Merge-Session promotet, Feature-Commits atomar,
   Graceful Guard gegen `42P01`. Erledigt.
2. Mobile-Reichweite SV (Overflow „Mehr") — nice-to-have, im Plan bestätigen.
