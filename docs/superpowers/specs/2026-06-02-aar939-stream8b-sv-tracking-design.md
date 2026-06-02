# AAR-939 Stream 8b — SV-Tracking-Integration (Design)

**Datum:** 2026-06-02 · **Branch:** `kitta/aar-939-stream8b-sv-tracking` (von `origin/staging`)
**Skill:** `superpowers:brainstorming` → `superpowers:writing-plans`
**Status:** Design freigegeben (Aaron 2026-06-02). Spec → Plan → Implementierung.

---

## 1 · Kontext & Scope

Letzter offener baubarer Stream des Monika-Embed-Epics (AAR-939). Streams 0–8 + embed-B-Kaskade
sind gemergt; Stream 7 (Inbox) ist gebaut (Daten-Smoke data-gated), Stream 9 (Cluster-LP) ist
verdrahtet + infra-gated. **8b** liefert die SV-seitige Tracking-Integration.

**Drei Ebenen (Plan-Begriff), Realitäts-Stand:**

| Ebene | Was | Stand |
|---|---|---|
| 1 — Client-dataLayer | Widget pusht `monika_*`-Events in `window.dataLayer` | **existiert** (`src/embed/monika/tracking.ts`) |
| 2 — Server-Webhook | HMAC-signierter Outbound-POST an SV-eigenen Endpoint bei Status-Übergängen | **dieser Stream** |
| 3 — Direkte Google-Ads-API | Offline-Conversions per Google Ads Conversion API | **Phase 2 (out of scope)** |

**In Scope (8b.1–8b.6, voller Plan):** Server-Webhook-Sender (HMAC + Retry), Wizard-Konfiguration,
Test-Button, Doku-Page (3 Tabs), Monitoring-Kachel.

**Non-Goals:** Direkte Google-Ads-/GA4-API-Integration (Ebene 3). Volle Webhook-Send-Historie
(nur „letzter Send"-Status). Änderungen an der bestehenden Client-Tracking-Schicht (Ebene 1).

---

## 2 · Datenrealität (gegen Live-Schema + staging-Code verifiziert)

- Monika-Anfragen leben in **`gutachter_finder_anfragen`** (gfa), Diskriminator `source ∈
  {'kfz_gutachter_lp','sv_embed'}`, `variante ∈ {'A','B',NULL}`. Status `embed_free` (A) / `neu` (B).
- `embed_sites` hat **bereits** (live verifiziert): `tracking_webhook_url`, `tracking_webhook_secret`,
  `tracking_ga4_measurement_id`, `tracking_gads_customer_id` (alle `text`, nullable). → 8b.1-Spalten ✓.
- Attribution liegt auf der gfa-Zeile: `gclid`, `utm_source/medium/campaign/term/content`, `ga_client_id`.
- Billing: AUTO-FÄLLIG-Cron bucht 70 € nach Terminzeit (`src/lib/embed/billing-actions.ts` +
  `api/cron/embed-abrechnung-erstellen`). `embed_sites.einzelpreis_eur` = Default 70.00.
- `EmbedSiteFormData` (`src/lib/embed/site-write.ts`) kennt die `tracking_*`-Felder **noch nicht**;
  `buildRow` (`actions.ts`) schreibt sie nicht. → Write-Pfad muss erweitert werden.
- `/api/anfrage-from-lp` nutzt bereits `after()` für non-blocking Post-Processing (`notifyAnfrage`).

---

## 3 · Architektur

### 3.1 Schema (1 Migration, Supabase-Plugin — AGENTS.md Regel 2)

Vorhandene `tracking_*`-Spalten: kein Change. Neu auf `public.embed_sites` für Monitoring (8b.6):

```sql
ALTER TABLE public.embed_sites
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_status text,
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_at     timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_error  text;
```

`tracking_webhook_last_status` = HTTP-Status als Text (`"200"`) bzw. `"timeout"`/`"error"`.
RLS: `embed_sites` hat bereits SELECT-Policy für SV-eigene Sites (`inhaber_profile_id = auth.uid()`);
neue Spalten erben sie. Writes nur via `service_role` (Sender). **Entscheidung 1 (bestätigt):**
schlanke `last_*`-Spalten statt `tracking_webhook_log`-Tabelle — „letzter Status" genügt für die
Kachel, spart Tabelle + RLS + Retention-Cron. Volle Historie = späteres Upgrade.

> Ablauf strikt nach Regel 2: `apply_migration` → `list_migrations` (getrackte Version `<V>` ablesen)
> → File committen als `supabase/migrations/<V>_aar939_embed_tracking_webhook_monitoring.sql`
> → `execute_sql` (READ) verifizieren. Typen-Regen aufgeschoben bis Consumer die Spalten nutzt
> (Sender castet lokal `any`, wie billing-actions es für noch-nicht-regenerierte Spalten tut).

### 3.2 Sender — `src/lib/embed/tracking-webhook.ts` (server-only) + `tracking-webhook-core.ts` (pure)

**Pure Kern** (`tracking-webhook-core.ts`, kein `server-only` → vitest-importierbar):

```ts
export type TrackingEvent = 'anfrage_eingegangen' | 'termin_vereinbart' | 'termin_durchgefuehrt' | 'test'

export interface TrackingPayload {
  event: TrackingEvent
  anfrage_id: string
  embed_site_slug: string
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  ga_client_id: string | null
  value_eur: number | null   // 70 bei termin_durchgefuehrt, sonst null
  ts: string                 // ISO-8601
}

export function buildTrackingPayload(event, gfaRow, site, valueEur): TrackingPayload
export function signPayload(body: string, secret: string): string  // "sha256=" + HMAC-SHA256(body, secret) hex
```

**Orchestrator** (`tracking-webhook.ts`, `server-only`):

```ts
export async function fireTrackingWebhook(args: {
  event: Exclude<TrackingEvent, 'test'>
  anfrageId: string
  valueEur?: number | null
}): Promise<{ ok: boolean; status?: number; skipped?: boolean; error?: string }>
```

Ablauf:
1. gfa-Zeile laden (id, embed_site_id, Attribution) via `createAdminClient`.
2. embed_site laden (slug, `tracking_webhook_url`, `tracking_webhook_secret`).
3. **No-op** wenn kein `embed_site_id` (Cluster-LP/native) oder keine `tracking_webhook_url` →
   `{ ok: true, skipped: true }`.
4. Payload bauen + signieren. POST `Content-Type: application/json`,
   Header `X-Claimondo-Signature: sha256=…` über den Roh-Body.
5. **Retry 3×** (Versuche bei 0 / 1s / 4s; `AbortController` 8s/Versuch). Erfolg = 2xx.
6. `embed_sites.tracking_webhook_last_*` schreiben (best-effort, eigener try/catch).
7. Bei finalem Fehlschlag: `Sentry.captureMessage(level='warning')` + `console.error`.

**Shape-Vorbild:** `src/lib/kanzlei/push-mandat.ts` (fire-and-forget, Result-Object, Logging) —
aber HMAC (`node:crypto` `createHmac`) statt OAuth. **Jeder Aufruf wird vom Caller in try/catch
gewrappt (non-fatal)** — ein Webhook-Fail darf nie Anfrage-Insert / Status-Update / Cron brechen
(AGENTS.md §server-actions, Non-Critical-Sub-Ops).

### 3.3 Feuer-Punkte

| Event | Ort | Variante | value_eur |
|---|---|---|---|
| `anfrage_eingegangen` | in `notifyAnfrage()` (`src/lib/embed/anfrage.ts`), läuft im `after()` | A + B | — |
| `termin_vereinbart` | embed-B Termin-Buchung — Ziel `src/lib/termine/embed-b-dispatcher-actions.ts` | B | — |
| `termin_durchgefuehrt` | AUTO-FÄLLIG-Cron `api/cron/embed-abrechnung-erstellen` bei Position-Anlage | B | `einzelpreis_eur` (70) |

A-Sites haben keinen Termin-/Billing-Lifecycle → nur Event 1. Exakte Funktion/Zeile für
`termin_vereinbart` + `termin_durchgefuehrt` wird im Implementation-Plan gepinnt (Kandidaten oben;
gegen `docs/30.05.2026/AAR-939-billing-lifecycle-contract.md` abgleichen).

### 3.4 Write-Pfad + Secret (8b.2)

- `EmbedSiteFormData` (`site-write.ts`) erweitern: `tracking_webhook_url: string`,
  `tracking_ga4_measurement_id: string`. (`gads_customer_id` = Phase 2, nicht im Formular.)
- `emptyEmbedSiteForm()` + die Vorbefüllung der Edit-Page um die Felder ergänzen.
- Validierung (`site-write.ts` + serverseitig in `actions.ts`): wenn `tracking_webhook_url` gesetzt →
  muss `https://` sein. GA4-ID optional (loses Format `G-XXXXXXX`, nur Trim).
- **Secret-Generierung serverseitig** (`actions.ts`, nicht im sync `buildRow`):
  - `createEmbedSite`: wenn URL gesetzt → `randomBytes(32).toString('hex')` als Secret.
  - `updateEmbedSite`: bestehenden Secret laden; nur generieren wenn URL gesetzt **und** Secret noch
    NULL. URL-Entfernung lässt den Secret stehen (Re-Aktivierung ohne Secret-Wechsel).
  - Secret wird **nie** aus dem Client übernommen (Mass-Assignment-Schutz, wie `einzelpreis_eur`).

### 3.5 Wizard (8b.2) — 3-Step → 4-Step

`EmbedSiteWizard.tsx`: `STEPS = ['Basis & Domains', 'Variante & Branding', 'Tracking', 'Zusammenfassung']`.
Neuer **optionaler** Step `Tracking` (keine Pflichtfelder → `next()` blockt nie):
- Webhook-URL (optional, Hinweis „muss mit https:// beginnen").
- GA4-Measurement-ID (optional, Hinweis „für Client-seitiges Tracking — Anleitung →").
- **Edit-Modus** (`mode==='edit'`, `siteId` vorhanden) zusätzlich: Secret read-only + Copy-Button,
  **Test-Button** (8b.4), Monitoring-Status (8b.6), Link zur Doku-Page.
- **Create-Modus:** Secret/Test/Monitoring ausgeblendet + Hinweis „Secret & Test verfügbar nach dem
  Anlegen". Zusammenfassungs-Step zeigt Webhook-URL (falls gesetzt).

### 3.6 Test-Button (8b.4)

Server-Action `sendTestTrackingWebhook(siteId)` in `actions.ts` (Ownership-Check `inhaber_profile_id`):
lädt Site, baut `event:'test'`-Payload, signiert mit gespeichertem Secret, **1× POST (kein Retry)**,
schreibt `last_*`, gibt `{ ok, status?, error? }` zurück → Client-Toast. Fehlt URL/Secret →
`{ ok:false, error:'Keine Webhook-URL konfiguriert' }`.

### 3.7 Doku-Page (8b.5) — `src/app/sv-portal/embed-sites/[id]/tracking-anleitung/page.tsx`

Server-Component, lädt Site (Ownership), 3 Tabs (`@/components/ui/tabs`):
- **GA4:** Client-Events `monika_*` (aus `tracking.ts`) in GA4 als Events/Conversions — Klick-Pfad + GTM-Snippet.
- **Google Ads:** Conversions aus den Events + Offline-Conversions via Webhook → Make.com → Google Ads.
- **Webhook:** JSON-Payload-Schema (Abschnitt 3.2) + HMAC-Verify-Beispiel (`sha256` über Roh-Body
  mit Secret) + Make.com/Zapier-Beispiel-Szenario.

> **Einschränkung (bestätigt):** Produkt-Screenshots von GA4/Google Ads kann ich nicht erzeugen —
> die Doku liefert **präzise Klick-Pfade + Code-Snippets** als Text. Screenshot-Plätze als
> Kommentar-Platzhalter markiert; Design/Aaron kann später echte Screenshots einsetzen.

### 3.8 Monitoring-Kachel (8b.6)

Edit-Tracking-Bereich: Status-Indikator aus `tracking_webhook_last_*` (✓ `200` / ✗ `<status>`/`timeout` /
„— noch kein Send") + relativer Zeitpunkt + ggf. `last_error`. Kleines Status-Badge auch in der
Sites-Liste (`EmbedSitesList`) pro Site mit konfigurierter Webhook-URL.

---

## 4 · Tests (TDD-first)

`src/lib/embed/__tests__/tracking-webhook-core.test.ts` (vitest):
- `signPayload`: Known-Vector (fixer Body + Secret → erwarteter `sha256=`-Hash).
- `buildTrackingPayload`: Feld-Mapping inkl. null-Attribution + `value_eur` nur bei `termin_durchgefuehrt`.
- Retry-Verhalten: mock `fetch` — (a) erster Versuch 200, (b) 500-dann-200, (c) 3× 500 → finaler Fail.

Pure Kern ist deterministisch testbar; der Orchestrator (DB/Sentry) wird über die Feuer-Punkt-Smokes
auf staging verifiziert (Test-Button gegen einen webhook.site-Endpoint).

---

## 5 · Constraints (alle honored)

- **Regel 1:** Feature-Branch, PR gegen `staging`, nie `main`.
- **Regel 2:** Migration nur via Supabase-Plugin `apply_migration`; File-Name == getrackte Version.
- **Regel 3:** kein unbegleiteter Stash am Session-Ende.
- Server-Actions: Result-Object (`{ ok, error? }`), kein `throw`-Mix; `revalidatePath` bei Writes.
- Non-Critical-Sends (Webhook) in try/catch — atomare Status-Updates.
- Komponenten-Set: `primitives`/`shared`/`ui` (kein handgerolltes Button/Card-Markup).
- Branding/Token-Audit: `bg-claimondo-*`-Klassen, keine Inline-Hex.
- Umlaute in allen UI-Strings.
- knip-Gate: neue Files müssen verdrahtet sein (kein toter Code).

---

## 6 · PR-Schnitt

- **PR1 — Sender + Schema + Wiring + Tests:** Migration (`last_*`-Spalten), `tracking-webhook-core.ts` +
  `tracking-webhook.ts`, Feuer-Punkte (anfrage_eingegangen / termin_vereinbart / termin_durchgefuehrt),
  vitest. Backend-only, kein UI.
- **PR2 — Portal-UX:** `EmbedSiteFormData`/`actions.ts`-Erweiterung + Secret-Gen, Wizard-Step,
  Test-Button, Doku-Page, Monitoring-Kachel.

Beide gegen `staging`, build-gated (`npm run build` / `tsc --noEmit`), 7-Punkte-Audit im Commit-Body.

---

## 7 · Im Implementation-Plan zu pinnen

1. Exakte Funktion/Zeile für `termin_vereinbart` (embed-B-Termin-Buchung) + `termin_durchgefuehrt`
   (Cron-Position-Anlage) — gegen `billing-lifecycle-contract.md`.
2. `Sentry`-Import-Pfad im Projekt (Server-Kontext).
3. ENV-Name für einen optionalen Test-Default-Endpoint (oder rein DB-getrieben).
4. Ob die Sites-Liste (`EmbedSitesList`) das Monitoring-Badge wirklich braucht oder nur die Edit-Seite.
