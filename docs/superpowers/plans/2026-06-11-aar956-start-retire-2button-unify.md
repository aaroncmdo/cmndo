# `/start`-Retirement + 2-Knopf-Funnel-Vereinheitlichung — Spec & Migrationsplan

> **Status:** DESIGN-REVIEW (Aaron). Noch NICHT bauen — cross-revier (Monika-Embed / Marketing / Dispatcher), braucht Koordination + Aaron-Go. Execution-Plan (bite-sized TDD) folgt pro Phase nach Approval, durch die jeweilige Owning-Session.

**Goal:** `/start` (+ HMAC-Signing) abschaffen und ALLE Anfrage-Formulare (gutachter-finder, Monika-Embed, Cluster-LP) auf EIN Modell bringen: Formular = Anfrage in DB → 2 Knöpfe (**„Anfrage senden"** = FlowLink versenden + Dispatcher kontaktiert manuell · **„Direkt weitermachen"** = sofort in `/flow`, Self-Onboarding) — beide über die EINE kanonische Issuance `issueCanonicalFlowLinkForAnfrage`.

**Architecture:** Eine Intake-API (`POST /api/anfrage-from-lp`, embed-JWT-authed) bedient alle Flächen. Der Knopf-Modus (`senden`|`direkt`) entscheidet: senden → Versand (WA→SMS→Email) + Versand-State persistieren; direkt → Token zurück → Client-Redirect auf `/flow/[token]`. Der Versand-State (gesendet? wann? Kanal?) lebt auf `flow_links`, damit der Dispatcher ihn sieht und **aktiv** über Re-Send entscheidet. `/start`/`verify-sig`/`buildSignedStartUrl`/`START_LINK_HMAC_SECRET` entfallen — die Cross-App-Brücke wird durch den bestehenden embed-JWT-Intake ersetzt (der gibt den Token im embed-B-Modus schon heute zurück).

**Tech Stack:** Next 16 App Router · Supabase (DDL nur via Plugin-`apply_migration`, Regel 2) · embed-JWT (`src/lib/embed/jwt.ts`) · React-Email/WA-Baileys/SMS-Twilio (Versand) · Vitest.

---

## Warum `/start` heute existiert (Ausgangslage, verifiziert 11.06.)

- Die Marketing-App (`claimondo-marketing/`, separates Deployment) schreibt die `gutachter_finder_anfragen`-Zeile selbst (`createAdminClient`), kann aber die **kanonische Issuance** NICHT fahren — `issueCanonicalFlowLinkForAnfrage` (Lead + Dispatcher-Round-Robin + flow_link + Versand) liegt nur in der Hauptapp (`src/lib/start-link/`).
- `starteLiveBuchung` (`claimondo-marketing/lib/actions/gutachter-finder-actions.ts:356`) baut daher einen **HMAC-signierten `/start/[anfrageId]?exp=&sig=`-Link** (`buildSignedStartUrl:345`) → Client-Redirect dorthin → `src/app/start/[anfrageId]/route.ts` verifiziert (`src/lib/start-link/verify-sig.ts`) + ruft `issueCanonicalFlowLinkForAnfrage` + `307 → /flow/[token]`.
- **Das ist die „tausend Links"-Komplexität** (signierte Per-Anfrage-URLs), die weg soll.
- Der Monika-Embed-Pfad nutzt dagegen schon den sauberen Weg: `POST /api/anfrage-from-lp` (embed-JWT) → `issueCanonicalFlowLinkForAnfrage` → gibt im `funnel_modus='flowlink'`-Branch `{ ok, kanal, token }` zurück (`src/app/api/anfrage-from-lp/route.ts:157`). **Die Token-Rückgabe für „Direkt" existiert also bereits.**

## Aaron-Entscheidungen (11.06., verbindlich)

1. **gutachter-finder = generell ein Embed** (embed-JWT → `anfrage-from-lp`), zusätzlich auf eigener Domain deploybar. (Stoppt die Marketing-Server-Action-baut-`/start`-Mechanik.)
2. **2 Knöpfe auf ALLEN Flächen** (gutachter-finder, Monika-Embed, Cluster-LP).
3. **„Direkt weitermachen" = NUR Redirect** (kein Backup-Versand).
4. **Versand-State persistieren** (gesendet? wann? Kanal?) → Dispatcher sieht es + **entscheidet aktiv** über (erneutes) Senden. Kein Auto-Resend.

---

## Schema-Änderung (Phase 1) — Versand-State auf `flow_links`

`flow_links` hat heute KEINE Versand-Spalten (verifiziert: nur `abgeschlossen_am, claim_id, erstellt_am, expires_at, fall_id, geoeffnet_am, id, lead_id, service_typ, sprache, status, token`).

**DDL** (via `apply_migration`, Regel 2 — name z.B. `aar956_flow_links_versand_state`):

```sql
ALTER TABLE public.flow_links
  ADD COLUMN gesendet_am     timestamptz,
  ADD COLUMN gesendet_kanal  text,
  ADD COLUMN gesendet_anzahl integer NOT NULL DEFAULT 0;

ALTER TABLE public.flow_links
  ADD CONSTRAINT flow_links_gesendet_kanal_check
    CHECK (gesendet_kanal IS NULL OR gesendet_kanal = ANY (ARRAY['whatsapp','sms','email']));
```

Semantik:
- `gesendet_am IS NULL` → noch nie versandt (z.B. „Direkt"-Pfad) → Dispatcher-UI zeigt „noch nicht gesendet" + Senden-Button.
- Bei jedem erfolgreichen Versand: `gesendet_am = now(), gesendet_kanal = <kanal>, gesendet_anzahl = gesendet_anzahl + 1`.
- Migration additiv, **0 Code-/Runtime-Impact** bis ein Writer/Reader sie nutzt.

---

## File-Change-Map (exakte Pfade)

**Hauptapp (`src/`):**
- Modify `src/lib/start-link/issue-canonical-flowlink.ts` — `issueCanonicalFlowLinkForAnfrage(anfrageId, opts?: { send?: boolean })`. `send=false` (Direkt) → `sendeInitialLink` skippen. Bei `send=true` (oder default) → nach erfolgreichem Send `flow_links.gesendet_*` persistieren (neue Helper-UPDATE).
- Modify `src/app/api/anfrage-from-lp/route.ts` — Request-Feld `aktion?: 'senden' | 'direkt'`. `senden` → `issueCanonical(…, {send:true})` → `{ ok, modus:'gesendet', kanal }`. `direkt` → `issueCanonical(…, {send:false})` → `{ ok, modus:'direkt', token }`. Ersetzt den `funnel_modus`-A/B-Branch + den `SELF_SERVICE_AUTO_ISSUE`-Gate (→ Decision D3).
- Modify `src/app/dispatch/leads/[id]/_v2/DispatchFlowlinkPanel.tsx` — Versand-State anzeigen (`gesendet_am`/`-kanal`/`-anzahl`) + „FlowLink (erneut) senden"-Button.
- Modify `src/app/dispatch/leads/[id]/_actions/flowlink.ts` — Manual-Send-Action persistiert `flow_links.gesendet_*` (gemeinsamer Persist-Helper mit issueCanonical).
- Modify `src/app/dispatch/leads/[id]/page.tsx` — `flow_links`-Select um `gesendet_am, gesendet_kanal, gesendet_anzahl` erweitern (fürs Panel).
- (Optional Phase 7) Monika-Embed-Widget (`src/embed/monika/*`, `public/embed/monika.js`) + Cluster-LP-Intake auf 2-Knopf alignen.

**Marketing (`claimondo-marketing/`):**
- Modify `claimondo-marketing/app/[locale]/gutachter-finden/GutachterFinderAnfrageWizard.tsx` — 2 Knöpfe; POST an `app.claimondo.de/api/anfrage-from-lp` (embed-JWT, `aktion`) statt `starteLiveBuchung`→`/start`. Bei `modus:'direkt'` → `window.location = ${PORTAL}/flow/${token}`.
- Modify `claimondo-marketing/lib/actions/gutachter-finder-actions.ts` — `starteLiveBuchung` + `buildSignedStartUrl` entfernen (oder auf den Intake-POST umbauen). gutachter-finder bekommt eine embed_site (Slug + erlaubte_domains inkl. eigene Domain) + signiertes Site-Token (`signSiteToken`).

**DB:**
- Create `supabase/migrations/<V>_aar956_flow_links_versand_state.sql` (recorded Version == Dateiname, Regel 2 Step 3+4).
- Seed: 1 `embed_sites`-Row für den gutachter-finder (`funnel_modus` wird durch den 2-Knopf obsolet → Decision D3).

**Löschen (Phase 6):**
- Delete `src/app/start/[anfrageId]/route.ts`
- Delete `src/lib/start-link/verify-sig.ts`
- Delete `buildSignedStartUrl` (claimondo-marketing)
- Remove `START_LINK_HMAC_SECRET` aus `/etc/claimondo/.env.local` (main) + Marketing-ENV (Aaron, VPS)

---

## Phasierte Migration (geordnet — jede Phase einzeln shippbar, nichts bricht)

### Phase 1 — Schema (additiv)
`flow_links.gesendet_*` via `apply_migration` + Migration-File. **0 Impact.** Smoke: `execute_sql` READ Spalten da.

### Phase 2 — Issuance trackt Versand + `send`-Option
`issueCanonicalFlowLinkForAnfrage(…, {send})` + Persist `gesendet_*` nach Send. `/start` + `anfrage-from-lp` funktionieren unverändert (default `send:true`), aber der State wird jetzt geschrieben. Vitest: send→persist, no-send→NULL.

### Phase 3 — Intake `aktion: senden|direkt`
`anfrage-from-lp` akzeptiert den Knopf-Modus; `direkt` gibt `{token}` zurück, `senden` versendet. Backward-kompatibel (ohne `aktion` = heutiges Verhalten). Vitest + function-level: beide Modi.

### Phase 4 — Dispatcher: State + aktiver Re-Send
`DispatchFlowlinkPanel` zeigt `gesendet_am/-kanal/-anzahl`; „erneut senden" → persistiert. Staging-Smoke (Dispatcher-Lead-View).

### Phase 5 — gutachter-finder → Embed (2 Knopf), parallel zu `/start`
Wizard POSTet an `anfrage-from-lp` (embed-JWT); 2 Knöpfe; `direkt`→Redirect. embed_site + eigene Domain konfigurieren. **`/start` bleibt vorerst** (paralleler Pfad) → kein Risiko. Browser-Walk (wie 11.06.-Staging-Walk): beide Knöpfe.

### Phase 6 — `/start` killen
Wenn Phase 5 live + verifiziert (kein Consumer baut mehr `/start`-URLs — `git grep buildSignedStartUrl|/start/` = 0 außerhalb Tests): Route + `verify-sig` + `buildSignedStartUrl` löschen; `START_LINK_HMAC_SECRET` aus ENV (Aaron). `next.config` 410/redirect für alte `/start`-Bookmarks (Safety). Post-Smoke: voller Funnel-Walk.

### Phase 7 (optional) — Monika-Embed + Cluster-LP 2-Knopf
Monika-Widget + Cluster-LP auf denselben 2-Knopf + `aktion`. (Heute: Monika `funnel_modus`, Cluster `SELF_SERVICE_AUTO_ISSUE` — durch das 2-Knopf-Modell abgelöst.)

---

## Was stirbt (Kill-Liste)
`src/app/start/[anfrageId]/route.ts` · `src/lib/start-link/verify-sig.ts` · `buildSignedStartUrl` (Marketing) · `START_LINK_HMAC_SECRET` (ENV main+marketing) · `starteLiveBuchung`-`/start`-Pfad. — `issueCanonicalFlowLinkForAnfrage`, `ensure-flowlink-for-lead`, `/api/anfrage-from-lp` **bleiben** (der kanonische Kern).

## Koordination (Pflicht — cross-revier)
- **Monika-Embed-Sessions** (`kitta/aar-939-monika-embed`): besitzen `src/embed/monika/*`, `anfrage-from-lp`-Response-Shape, `embed_sites`. Der `aktion`-Param + die Response-Form sind geteilt → vor Phase 3/5/7 abstimmen.
- **Marketing/Cluster-Sessions**: besitzen `claimondo-marketing/` + die LPs. Phase 5 fasst den gutachter-finder-Wizard an.
- **Termin-Engine-Contract-Ratchet** (ab96fed4): unberührt (kein gutachter_termine-Direktfilter hier).

## Offene Entscheidungen (D)
- **D1 — Versand-Identität:** `gesendet_*` auf `flow_links` (vorgeschlagen, 1 Lead = 1 Link) ODER separate `flow_link_versand`-Logtabelle (falls Versand-Historie/Audit pro Kanal gewünscht)? Vorschlag: Spalten reichen (anzahl deckt Re-Sends).
- **D2 — „Direkt" + Idempotenz:** Wenn der Kunde „Direkt" wählt aber abbricht, dann später per Dispatcher-Send denselben Link kriegt — `ensureCanonicalFlowLinkForLead` ist idempotent (gleicher Token) → konsistent. (Kein Handlungsbedarf, nur bestätigen.)
- **D3 — `funnel_modus` + `SELF_SERVICE_AUTO_ISSUE`:** durch den Per-Request-`aktion` abgelöst → deprecaten/entfernen, oder als coarse Enable behalten? Vorschlag: deprecaten (das 2-Knopf-Modell ist die Quelle).
- **D4 — gutachter-finder eigene Domain:** welche Domain + nginx/Deploy (analog Cluster-LPs)? Tangiert die Deploy-Topologie (Marketing :3006 vs eigener Prozess).

## Self-Review (Spec-Coverage)
Aaron-Entscheidungen 1-4 alle abgedeckt: gutachter-finder=Embed (P5) ✓ · 2-Knopf überall (P3/P5/P7) ✓ · Direkt=nur-Redirect (P3 `direkt`→Token, kein Send) ✓ · Versand-State+aktiver-Re-Send (P1/P2/P4) ✓ · `/start` stirbt (P6) ✓. Kein Code-Pfad bricht (P1-5 additiv/parallel, Delete erst nach 0-Consumer).
