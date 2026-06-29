# LinkedIn Auto-Posting (Company-Page) — Design-Spec

**Datum:** 2026-06-29
**Branch:** `kitta/linkedin-auto-posting` (off `origin/staging`)
**Status:** Approved (Brainstorming) → bereit für Implementation-Plan

---

## 1. Ziel

Die Claimondo-**Company-Page** auf LinkedIn (`linkedin.com/company/claimondo`) automatisch
mit Content bespielen. Quelle ist der bereits existierende GEO-Wissens-Feed der
Marketing-Site. Ein Cron erzeugt zu festen Zeiten einen **Entwurf**, ein Admin gibt ihn im
Admin-Portal frei, dann wird er als Beitrag auf der Company-Page veröffentlicht.

**Kernprinzip:** Die App-Side (Cron → Compose → Queue → Admin-Freigabe) ist vollständig in
`src/` und **unabhängig vom LinkedIn-Approval baubar**. Nur der letzte Publish-Schritt ruft
die LinkedIn-API; er sitzt hinter einem `LinkedInPublisher`-Interface, damit ein Vendor-
Adapter (Make/Buffer) als Fallback einsteigen kann, falls das Org-Posting-Approval sich zieht.

## 2. Entscheidungen (aus dem Brainstorming)

| Dimension | Entscheidung |
|---|---|
| Content-Quelle | GEO-Wissens-Seiten aus dem bestehenden Feed (`feed.json`) |
| Kanal | Company-Page (`urn:li:organization:<id>`) — Personen-Author nicht im MVP |
| Trigger | Cron-Drip, **neuestes un-gepostetes** Item zuerst, dann Bestand rückwärts |
| Kadenz | 3×/Woche (Mo/Mi/Fr), in VPS-Crontab gesetzt — konfigurierbar |
| Freigabe | Auto-Entwurf → Queue im **Admin-Portal ▸ Marketing** → Mensch gibt frei → publish |
| Compose | Claude (LinkedIn-nativer Text) + deterministisches Template als Fallback |
| Publish | Offizielle LinkedIn Posts API, hinter `LinkedInPublisher`-Interface |
| Token | Supabase-Store + Refresh-Flow (Pattern wie Google-Calendar-OAuth-Tokens) |

## 3. Non-Goals (YAGNI)

- **Keine** LinkedIn-Artikel (Langform) — die haben keine brauchbare Publish-API; reguläre
  Beiträge sind die unterstützte Fläche.
- **Kein** Personen-Author im MVP (Aaron/Nicolas, `w_member_social`) — Interface lässt es zu,
  aktiviert wird nur die Company-Page.
- **Kein** Vendor-Adapter gebaut im MVP — nur als Interface-Fallback dokumentiert.
- **Keine** Engagement-Automation (Kommentare/Likes/DMs), kein Multi-Image/Video, kein
  A/B-Testing, keine Analytics-Rückspielung. Alles spätere Folgen.

## 4. Architektur & Datenfluss

```
Cron (Mo/Mi/Fr früh, VPS-Crontab → /api/cron/linkedin-drip)
  → GET https://claimondo.de/feed.json            (öffentlich, JSON Feed v1.1)
  → nächstes Item dessen guid NICHT im Ledger      (newest-unposted-first)
  → compose(item)  → Claude → Post-Text            (Template-Fallback bei LLM-Fehler)
  → INSERT linkedin_posts (status='entwurf')
        ⇣
  [Admin-Portal ▸ Marketing ▸ LinkedIn]
  → Admin sieht Entwurf, editiert ggf., klickt „Freigeben & posten"
  → Server-Action freigebenUndPosten(id)
  → getValidLinkedInToken()  (refresh falls abgelaufen)
  → PostsApiPublisher.publish({ authorUrn, text, link, title, description })
  → POST https://api.linkedin.com/rest/posts       (LinkedIn rendert OG-Card)
  → store linkedin_post_urn, status='veroeffentlicht', freigegeben_von/-am
  Fehler → status='fehlgeschlagen' + fehler + Admin-Alert (createMitteilung)
```

**App-Grenze / Vertrag:** Der Content liegt in der separaten `claimondo-marketing`-App. Wir
koppeln **nicht** an deren Code, sondern konsumieren die öffentliche `feed.json`
(JSON Feed v1.1). Solange diese Shape stabil bleibt, sind wir entkoppelt — auch von
parallelen Änderungen an den Feed-Internas (s. §13 Koordination).

## 5. Datenbank (DDL via Supabase-MCP-Plugin `apply_migration` — Regel 2)

### 5.1 `linkedin_posts` (Ledger + Freigabe-Queue)

| Spalte | Typ | Notiz |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `feed_guid` | `text` **UNIQUE NOT NULL** | Dedup-Schlüssel + „next unposted" |
| `feed_url` | `text NOT NULL` | Canonical-Link der Wissens-Seite |
| `title` | `text NOT NULL` | aus Feed-Item |
| `excerpt` | `text` | aus Feed-Item; speist `content.article.description` beim Publish |
| `composed_text` | `text NOT NULL` | LinkedIn-Post-Text, editierbar |
| `status` | `text NOT NULL default 'entwurf'` | `entwurf` \| `veroeffentlicht` \| `fehlgeschlagen` \| `uebersprungen` |
| `author_urn` | `text NOT NULL` | `urn:li:organization:<id>` (zukunftssicher für Person) |
| `linkedin_post_urn` | `text` | von der API zurück nach Publish |
| `scheduled_for` | `timestamptz` | Zeitpunkt des Entwurfs |
| `published_at` | `timestamptz` | |
| `freigegeben_von` | `uuid` → `profiles.id` | Admin |
| `freigegeben_am` | `timestamptz` | |
| `fehler` | `text` | letzter Publish-Fehler |
| `erstellt_am` | `timestamptz NOT NULL default now()` | |

- **Status-Set bewusst klein.** `freigegeben` als Zwischenstatus entfällt — Freigabe und
  Publish sind eine atomare Server-Action; bei Erfolg direkt `veroeffentlicht`, bei Fehler
  `fehlgeschlagen` (re-triggerbar).
- **RLS:** SELECT/UPDATE nur `admin`; INSERT/Schreibzugriff des Cron über service-role
  (`createAdminClient`). Policy-Pattern von bestehenden admin-only Tabellen übernehmen.
- **Index:** `feed_guid` (unique impliziert), zusätzlich `status` für die Queue-Abfrage.

### 5.2 `linkedin_oauth_tokens` (Secret-Store)

| Spalte | Typ | Notiz |
|---|---|---|
| `id` | `uuid` PK | Singleton-artig (eine Org), aber generisch |
| `organization_urn` | `text NOT NULL` | `urn:li:organization:<id>` |
| `access_token` | `text NOT NULL` | ~60 Tage gültig |
| `refresh_token` | `text` | bis ~12 Monate; rotiert bei Refresh |
| `expires_at` | `timestamptz NOT NULL` | für Refresh-Entscheidung |
| `scope` | `text` | erteilte Scopes |
| `connected_by` | `uuid` → `profiles.id` | welcher Admin verbunden hat |
| `erstellt_am` / `aktualisiert_am` | `timestamptz` | |

- **RLS: deny-all** — Zugriff ausschließlich service-role. Das sind Secrets; kein Client liest
  sie je. (Token-Refresh + Publish laufen server-seitig mit `createAdminClient`.)
- Optional härter: `pgcrypto`-Verschlüsselung der Token-Spalten. MVP: deny-all RLS + service-
  role genügt (gleiches Sicherheitsniveau wie die bestehenden gcal-Tokens). Verschlüsselung =
  dokumentiertes Folge-Hardening.

## 6. OAuth-Flow (einmalige Verbindung)

1. **Admin-Action „LinkedIn verbinden"** (Button in `/admin/marketing/linkedin`) baut die
   Authorize-URL:
   `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=…&redirect_uri=…&state=<csrf>&scope=openid%20profile%20email%20r_organization_social%20w_organization_social`
2. Admin gibt Consent (nur ein Page-Admin kann `w_organization_social` für die Org erteilen).
3. **Callback** `src/app/api/auth/linkedin/callback/route.ts`:
   - tauscht `code` gegen Token: `POST https://www.linkedin.com/oauth/v2/accessToken`
     (`grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`).
   - ermittelt die Org-URN: `GET https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR`
     → die vom Admin verwaltete(n) Org(s); Claimondo-Org auswählen (gegen `LINKEDIN_ORG_ID`
     abgleichen, wenn gesetzt).
   - speichert in `linkedin_oauth_tokens` (service-role).
4. **`getValidLinkedInToken()`** (`src/lib/linkedin/token.ts`): lädt Token; wenn
   `expires_at` < jetzt+Puffer → Refresh via
   `POST /oauth/v2/accessToken` (`grant_type=refresh_token`) → persistiert neuen
   access_token + rotierten refresh_token + neues expires_at. Liefert gültigen Bearer.
   - Schlägt Refresh fehl (refresh_token abgelaufen) → strukturierter Fehler → Admin-Alert
     „LinkedIn neu verbinden".

> **Hinweis Token-Lebensdauer:** Access-Token ~60 Tage, Refresh-Token bis ~12 Monate. Bei
> 3 Posts/Woche reicht on-demand-Refresh in `getValidLinkedInToken()`; kein eigener Refresh-
> Cron nötig. Ein Healthcheck-Alert „Token läuft in 7 Tagen ab" ist optionales Folge-Hardening.

## 7. Composer (`src/lib/linkedin/compose.ts`)

Reine, testbare Funktion. Input: ein Feed-Item (`title`, `summary`/`excerpt`,
`keyFacts`, `url`, `tags`). Output: `{ text: string }`.

- **Primär — Claude:** Prompt baut aus Titel + Excerpt + keyFacts einen LinkedIn-nativen
  Beitrag: Hook-Zeile, 2–3 prägnante Sätze / Key-Facts als Mehrwert, weicher CTA, dann die
  URL in eigener Zeile (LinkedIn zieht daraus bzw. aus dem `content.article`-Block die
  Preview-Card). Ton: sachlich-kompetent, deutsch, korrekte Umlaute, **keine** reißerische
  Werbesprache (Rechts-Content). Hard-Limit ~3.000 Zeichen Commentary → wir zielen auf
  ~600–1.000.
- **Fallback — deterministisches Template** (wenn LLM-Call fehlschlägt oder leer):
  `"<title>\n\n<excerpt gekürzt>\n\n• <keyFact1>\n• <keyFact2>\n• <keyFact3>\n\nMehr: <url>\n\n<hashtags>"`.
  So failt der Cron **nie hart**.
- **Hashtags:** kleine kuratierte Map je `assetType`/Cluster
  (z.B. `#KfzGutachten #Schadensregulierung #Verkehrsrecht`), 3–5 Stück.
- Der LLM-Aufruf sitzt hinter einem schmalen Interface (`composeWithLLM`), damit Unit-Tests
  mit Stub laufen und der Template-Pfad isoliert getestet wird.

## 8. Publisher (`src/lib/linkedin/publisher.ts`)

```ts
export interface LinkedInPublishInput {
  authorUrn: string          // urn:li:organization:<id>
  text: string               // commentary
  link: string               // canonical URL
  title: string
  description: string        // excerpt → article card description
}
export interface LinkedInPublisher {
  publish(input: LinkedInPublishInput):
    Promise<{ ok: true; postUrn: string } | { ok: false; error: string }>
}
```

**`PostsApiPublisher`:**
- `POST https://api.linkedin.com/rest/posts`
- Header: `Authorization: Bearer <token>`, `LinkedIn-Version: <aktuelle YYYYMM, z.B. 202505>`,
  `X-Restli-Protocol-Version: 2.0.0`, `Content-Type: application/json`.
- Body:
  ```json
  {
    "author": "urn:li:organization:<id>",
    "commentary": "<text>",
    "visibility": "PUBLIC",
    "distribution": { "feedDistribution": "MAIN_FEED",
      "targetEntities": [], "thirdPartyDistributionChannels": [] },
    "content": { "article": { "source": "<link>",
      "title": "<title>", "description": "<description>" } },
    "lifecycleState": "PUBLISHED",
    "isReshareDisabledByAuthor": false
  }
  ```
- Erfolg: Post-URN aus Response-Header `x-restli-id` lesen → `{ ok: true, postUrn }`.
- Fehler: Status/Body in `{ ok: false, error }` mappen (kein throw).

**`VendorWebhookPublisher` (nur dokumentiert, nicht gebaut):** POST an einen Make/Buffer-
Webhook mit `{ text, link }`. Drop-in falls Org-Approval sich zieht. Interface identisch.

## 9. Cron-Drip (`src/app/api/cron/linkedin-drip/route.ts`)

- `GET(request)` mit `authorization: Bearer ${CRON_SECRET}` (bestehendes Pattern, vgl.
  `cron/google-bewertungen`). `createAdminClient()`.
- Ablauf:
  1. `fetchFeedItems()` (`src/lib/linkedin/feed-source.ts`) holt + parst `feed.json`.
  2. lade alle `feed_guid` aus `linkedin_posts` (egal welcher Status → bereits gesehen).
  3. wähle das **neueste** Item (höchstes `date_published`), dessen `guid` nicht im Ledger.
     Keins → `{ ok: true, drafted: null }` (Backlog leer/alles gesehen).
  4. `compose(item)` → INSERT `linkedin_posts` (status `entwurf`, author_urn = Org,
     scheduled_for = now).
  5. `{ ok: true, drafted: guid }`.
- **Idempotent:** ein Entwurf pro Lauf. Kadenz = Crontab-Frequenz. `feed_guid UNIQUE` fängt
  Doppel-Inserts ab.
- Feed-URL aus ENV (`MARKETING_FEED_URL`, default `https://claimondo.de/feed.json`).

## 10. Admin-UI (`src/app/admin/marketing/`)

- **Neuer Admin-Bereich „Marketing"** + Nav-Eintrag in `AdminNav`
  (`src/app/admin/_components/AdminNav`). LinkedIn-Queue ist das erste Feature; Bereich ist
  erweiterbar (künftig weitere Marketing-Tools).
- `src/app/admin/marketing/page.tsx` — Landing/Übersicht (zunächst Redirect/Link auf LinkedIn).
- `src/app/admin/marketing/linkedin/page.tsx` (Server Component):
  - **Verbindungsstatus** (verbunden? Org-URN? Token-Ablauf) + „LinkedIn verbinden / neu
    verbinden".
  - **Entwürfe** (status `entwurf`): je Karte Titel, editierbares `composed_text`
    (`forms/TextField`/Textarea), Link-Vorschau (Titel + URL), Buttons „Freigeben & posten"
    + „Überspringen".
  - **Verlauf**: veröffentlichte + fehlgeschlagene Posts (mit Link zum LinkedIn-Post bzw.
    Fehlertext + „Erneut versuchen").
  - Komponenten aus `primitives/*` + `shared/*` (Button, SectionCard, StatusBadge, DataTable,
    forms/*). Status-Tokens (`bg-success`/`text-success-strong`/`bg-danger-soft` …), **kein**
    rohes Tailwind-Status-Scale. Umlaute in allen UI-Strings.
- `src/app/admin/marketing/linkedin/actions.ts` (`'use server'`), Result-Pattern
  `{ ok, error }` + `revalidatePath('/admin/marketing/linkedin')`:
  - `freigebenUndPosten(id)` → lädt Row + Token → `PostsApiPublisher.publish` → bei Erfolg
    `veroeffentlicht` + URN + `freigegeben_von/-am`; bei Fehler `fehlgeschlagen` + `fehler` +
    Admin-Alert (`createMitteilung`, vgl. kanzlei push-mandat Alert-Pattern).
  - `entwurfBearbeiten(id, text)` → update `composed_text`.
  - `ueberspringen(id)` → status `uebersprungen` (bleibt im Ledger → nicht neu gezogen).
  - `linkedInTrennen()` → Token löschen (für sauberes Re-Connect).
  - Auth-Guard: `requirePortalAccess(['admin'])` (Layout deckt es bereits; Actions
    zusätzlich absichern).

## 11. Error-Handling & Alerts

- Server-Actions: Result-Object, kein throw (AGENTS.md §Server-Actions).
- Publish-Fehler → `fehlgeschlagen` + `fehler` gespeichert + `createMitteilung` an Admins
  („LinkedIn-Post fehlgeschlagen: <titel>"). Non-critical (Alert) in try/catch, damit der
  Status-Update atomar bleibt.
- Token-Refresh-Fehler → Alert „LinkedIn-Verbindung erneuern".
- Cron Compose-Fehler → Template-Fallback; Route failt nie hart. Feed-Fetch-Fehler → `{ ok:
  false }` + 200/500 mit Log, kein Crash.

## 12. Tests (vitest)

- **compose:** Template-Fallback-Output (Snapshot), Hashtag-Map je assetType, Längen-Cap,
  Umlaut-Erhalt; LLM-Pfad mit Stub (deterministisch).
- **next-unposted-Selektion:** gegeben Feed + Ledger → richtige guid; ignoriert bereits
  gesehene (alle Status); newest-first; leeres Ergebnis wenn alles gesehen.
- **PostsApiPublisher:** `fetch` gemockt → korrekte URL/Header/Body-Shape (author-URN,
  Version-Header, article-content); URN aus `x-restli-id`; Fehler-Mapping → `{ ok:false }`.
- **token:** Refresh-Entscheidung (expiry+Puffer) mit gestubbter Zeit; Persist-Aufruf.

## 13. ENV & Setup

**ENV (neu):** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ORG_ID`
(`urn:li:organization:<id>` oder nur die Zahl), `LINKEDIN_REDIRECT_URI`,
`MARKETING_FEED_URL` (default gesetzt). Bestehend: `CRON_SECRET`, `ANTHROPIC_API_KEY`.

**Aaron — einmalige LinkedIn-Developer-Portal-Schritte (als Page-Admin):**
1. `developer.linkedin.com` → App anlegen, mit Claimondo-Company-Page verknüpfen.
2. App über die Page **verifizieren** (Admin-Klick).
3. Products: „Sign In with LinkedIn (OpenID Connect)" **+** „Community Management API"
   (`w_organization_social`) anfragen.
4. Freigegeben → in `/admin/marketing/linkedin` „LinkedIn verbinden" → Consent → Token sitzt.

**Aaron — Crontab (VPS):** Zeile für `/api/cron/linkedin-drip` mit
`Authorization: Bearer $CRON_SECRET`, 3×/Woche (z.B. `0 7 * * 1,3,5`).

## 14. Koordination (parallele Sessions)

- Branch: **`kitta/linkedin-auto-posting`** (eigener Worktree
  `.claude/worktrees/linkedin-auto-posting`, off `origin/staging`).
- **Alle Code-Files sind NEU** (`src/lib/linkedin/*`, `src/app/admin/marketing/*`,
  `src/app/api/cron/linkedin-drip/*`, `src/app/api/auth/linkedin/callback/*`) →
  Kollisionsrisiko minimal.
- **Geteilte Berührungspunkte:**
  - `src/app/admin/_components/AdminNav` — **additiver** Nav-Eintrag „Marketing".
  - `claimondo-marketing` Feed — **nur Read über HTTP** (`feed.json`), kein Code-Touch.
    Session `kitta/marketing-feed-audit-fixes` (89f501f6) bearbeitet die Feed-Internas;
    unser Vertrag ist die öffentliche JSON-Feed-v1.1-Shape → entkoppelt, solange diese
    Felder (`id`, `url`, `title`, `content_text`, `summary`, `date_published`,
    `_claimondo.keyFacts`) stabil bleiben.
- DDL ausschließlich via `apply_migration`; File `supabase/migrations/<recorded>_…sql` nach
  getrackter Version benennen (Regel 2). Kein Stash am Session-Ende (Regel 3).

## 15. Offene Punkte / Folgen

- **Org-Approval-Timeline** (extern, Aaron). Bis dahin: App-Side + Queue laufen, Publish
  wartet — oder Vendor-Adapter als Notnagel.
- Personen-Author (Aaron/Nicolas, `w_member_social`) als zusätzlicher Kanal — Interface
  ist vorbereitet.
- Token-Verschlüsselung (pgcrypto), Token-Ablauf-Healthcheck-Alert.
- Posting-Analytics (Impressionen/Klicks via `r_organization_social`) zurück ins Admin.
