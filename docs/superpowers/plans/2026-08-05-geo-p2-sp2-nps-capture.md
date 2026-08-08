# GEO-P2 SP2 — NPS-Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Post-Abschluss-Kundenumfrage (NPS 0–10 + Kommentar) via idempotentem Cron + E-Mail-Magic-Link + anon Token-Response-Route → `kunde_feedback`.

**Architecture:** Neue Files only (kein Hot-File). Cron scannt abgeschlossene Claims → `upsert onConflict claim_id` (genau-einmal) → branded E-Mail mit Magic-Link → anon `/kunde-nps/[token]` → Service-Role-Action schreibt Rating.

**Tech Stack:** Supabase (apply_migration/Regel 2), Next 15 (async params, force-dynamic), react-email, vitest.

## Global Constraints (verbatim)

- **Spec:** `docs/superpowers/specs/2026-08-05-geo-p2-sp2-nps-capture-design.md`. Branch `kitta/geo-p2-nps-capture` (off origin/staging).
- **Regel 2:** DDL nur via apply_migration → recorded Version → File benennen → verify → Types regen+committen (neue Tabelle = echte neue Row-Typen).
- **Signaturen (verbatim):**
  - `assertCronAuth(request): boolean` (`@/lib/auth/cron-auth`) → `Authorization: Bearer ${process.env.CRON_SECRET}`.
  - `sendEmail({ to, subject, html, empfaengerTyp?, template?, listUnsubscribe?, fallId? }): Promise<{messageId}>` (`@/lib/email/google/client`); `html = await render(Template(props))` aus `@react-email/render`.
  - `resolveEmailBranding({ leadId }): Promise<EmailBrand|null>` (`@/lib/branding/token-theme`), `EmailBrand={primary,secondary,logoUrl,firmenname}`.
  - App-URL: `(process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')`.
  - Email-Template-Bausteine: `EmailShell, Hero, Card, Paragraph, Button` aus `../../components`; `email` tokens aus `../../tokens`; `APP_URL, EmailBrand` aus `./layout`. **Token-Audit-Skip-Header Pflicht.**
  - Next-15 Page: `params: Promise<{ token: string }>` → `const { token } = await params`.
- **Error-Handling:** neue Files nutzen `{ ok }`-Shape (nicht `{ success }`). Result-Object, kein throw. RLS-Write-Guard: `.select()` + Row-Check.
- **Opt-out:** per-Invite (`abgemeldet_am` auf der feedback-Zeile) + `listUnsubscribe`-Header. Opt-out-URL = `/kunde-nps/<token>?abmelden=1` (**nicht** `/abmelden/*` — Infra-301-Falle). Globale Cross-Claim-Suppression = dokumentierter Follow-up.
- **Umlaute** echt. **Kein** const-Export aus `'use server'`.

---

### Task 1: DDL-Migration `kunde_feedback` (Regel 2)

**Files:** Create `supabase/migrations/<V>_geo_p2_kunde_feedback.sql`; Modify `src/lib/supabase/database.types.ts`

- [ ] **Step 1:** `apply_migration({ name: 'geo_p2_kunde_feedback', query: <Spec Einheit 1 DDL> })`.
- [ ] **Step 2:** `list_migrations` bzw. `execute_sql` auf `schema_migrations` → recorded Version `<V>`.
- [ ] **Step 3:** DDL als `supabase/migrations/<V>_geo_p2_kunde_feedback.sql`.
- [ ] **Step 4:** `execute_sql` (READ): Tabelle + Policy + Grants da? (`\d`-Äquivalent via information_schema + pg_policies).
- [ ] **Step 5:** Types regen (CLI-Lese-Gen mit Token aus .env.local, oder MCP `generate_typescript_types`) → `kunde_feedback`-Row + Insert/Update-Typen. Committen. Falls Env fehlt: im PR vermerken (die neuen Files nutzen eigene Typen, nicht die generierten Row-Typen → tsc grün auch ohne Regen; Regen ist Sauberkeit).
- [ ] **Step 6:** Commit Migration + types.

### Task 2: Pure Helpers `src/lib/nps/nps.ts` — TDD

**Files:** Create `src/lib/nps/nps.ts`, `src/lib/nps/nps.test.ts`

**Produces:**
```ts
export function generateResponseToken(): string        // 64 hex (2× randomUUID ohne '-')
export function tokenExpiryFromNow(tageGueltig?: number): string  // ISO, default 30d
export function isTokenExpired(expiresAtIso: string | null): boolean
export function isRatingValid(rating: unknown): rating is number  // int 0..10
export function npsResponsePath(token: string): string  // '/kunde-nps/<token>'
```

- [ ] **Step 1:** Failing tests: token 64 hex + unique über 2 Calls; expiry >now; isTokenExpired(gestern)=true/(morgen)=false/(null)=true; isRatingValid 0/10=true, -1/11/5.5/'3'/NaN=false; path korrekt.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementieren. **Step 4:** Run → PASS. **Step 5:** Commit.

Note: `crypto.randomUUID()` (Node global). `Date.now()` in App-Runtime ok (nur im Workflow-Sandbox verboten).

### Task 3: E-Mail-Template `src/lib/email/google/templates/KundeNpsUmfrage.tsx`

**Files:** Create `KundeNpsUmfrage.tsx`

- [ ] **Step 1:** Nach `FlowLinkVersand.tsx`-Muster: Token-Audit-Skip-Header; Imports `EmailShell, Hero, Card, Paragraph, Button` aus `../../components`, `email` aus `../../tokens`, `APP_URL, EmailBrand` aus `./layout`. Props `{ vorname: string; claimNummer: string | null; npsUrl: string; brand?: EmailBrand }`. `export function subject(p)` = „Wie zufrieden waren Sie mit der Abwicklung?". Body: kurze Bitte um Service-Feedback (Umlaute), `<Button href={npsUrl} bg={brand?.primary}>Jetzt bewerten</Button>`, Framing „Service-Feedback, keine Werbung" + Abmelde-Zeile. German inline (locale-Erweiterung = Follow-up).
- [ ] **Step 2:** tsc des Files (im Task-6-Build). Commit.

### Task 4: Invite-Cron `src/app/api/cron/nps-invite/route.ts`

**Files:** Create `src/app/api/cron/nps-invite/route.ts`

- [ ] **Step 1:** `export const dynamic='force-dynamic'`; `GET(request)`: `if(!assertCronAuth(request)) return 401`. `const db=createAdminClient()`.
- [ ] **Step 2:** Kandidaten: `db.from('claims').select('id, lead_id, geschaedigter_user_id, claim_nummer').eq('operative_status','abgeschlossen').gt('abgeschlossen_am', new Date(Date.now()-3*864e5).toISOString())`.
- [ ] **Step 3:** Je Kandidat: `token=generateResponseToken()`; `const {data:ins}=await db.from('kunde_feedback').upsert({ claim_id, response_token: token, token_expires_at: tokenExpiryFromNow(), eingeladen_am: new Date().toISOString() }, { onConflict:'claim_id', ignoreDuplicates:true }).select('id')`. Wenn `ins?.length` (neu) → `await sendNpsInvite(db, { claimId, leadId, geschaedigterId, claimNummer, token })`.
- [ ] **Step 4:** Lokaler `async function sendNpsInvite(db, c)`: Kunde-Email auflösen (`leads.email` via `c.leadId`, Fallback `profiles.email` via `c.geschaedigterId` — **email-first Guard**); `vorname` mitnehmen; `brand=await resolveEmailBranding({ leadId: c.leadId })`; `npsUrl=base()+npsResponsePath(c.token)`; `optOutUrl=npsUrl+'?abmelden=1'`; `html=await render(KundeNpsUmfrageEmail({vorname, claimNummer:c.claimNummer, npsUrl, brand: brand ?? undefined}))`; `await sendEmail({ to: email, subject: subject({...}), html, empfaengerTyp:'kunde', template:'nps_umfrage', listUnsubscribe: optOutUrl })`. try/catch → console.error (non-critical; Zeile bleibt).
- [ ] **Step 5:** `return NextResponse.json({ ok:true, eingeladen, checked })`. Commit.

### Task 5: Response-Route `src/app/kunde-nps/[token]/`

**Files:** Create `page.tsx`, `actions.ts`, `NpsFormClient.tsx`

- [ ] **Step 1: `actions.ts`** (`'use server'`, `createAdminClient`): `loadFeedbackByToken(token)` (`.eq('response_token',token).maybeSingle()`, join claim_nummer via `v_claim_full` optional). `getNpsByToken(token): {feedback|null, error?}` (Expiry + `beantwortet_am`-Check → „schon beantwortet"). `submitNpsByToken(token, rating, kommentar?): {ok,error?}` — `isRatingValid` guard; `update({rating, kommentar: kommentar||null, beantwortet_am: now, token_expires_at: now}).eq('response_token',token).select('id')` + Row-Check. `abmeldenByToken(token): {ok,error?}` — `update({abgemeldet_am: now, token_expires_at: now})...`.
- [ ] **Step 2: `page.tsx`** (`dynamic='force-dynamic'`): `const {token}=await params`; `const {feedback,error}=await getNpsByToken(token)`; error → Danke/Ungültig-Card (Claimondo-fix, `bg-claimondo-*`); sonst `<NpsFormClient token={token} claimNummer={feedback.claim_nummer}/>`. Query `?abmelden=1` → direkt Opt-out-Ansicht (ruft `abmeldenByToken` beim Mount oder zeigt Bestätigen-Button).
- [ ] **Step 3: `NpsFormClient.tsx`** (`'use client'`, `useState`+`useTransition`): 0–10 (11 Buttons) + Kommentar-Textarea + Absenden (`submitNpsByToken`); Danke-Zustand; dezenter „Keine Umfragen mehr"-Link (`abmeldenByToken`). Tokens `rounded-ios-*`, `claimondo-*`, Umlaute echt.
- [ ] **Step 4:** Commit.

### Task 6: Build + PR + Smoke-Handoff

- [ ] **Step 1:** vitest `src/lib/nps/` grün.
- [ ] **Step 2:** `npm run build` (bzw. tsc) — neue Route+Action+Cron → Next-Validator. Ratchets (token-audit/component-set/rls-policies) lokal `--ratchet` EXIT 0. Sonst CI-Gate.
- [ ] **Step 3:** Push + `gh pr create --base staging` (Body: 4 Einheiten, DSGVO, Migration, Verifikation, Regel-4 + Scheduler-Handoff).
- [ ] **Step 4:** Marker + Regel-4-Smoke + **crontab-Eintrag** an Merge/Deploy-Session übergeben.

## Self-Review

**Coverage:** DDL→T1, Pure→T2, Template→T3, Cron→T4, Route→T5, Build/PR→T6. ✓
**Placeholder:** Signaturen verbatim aus Exploration; DDL aus Spec. Kein TBD.
**Typ-Konsistenz:** `generateResponseToken/tokenExpiryFromNow/isRatingValid` (T2) ↔ Cron (T4) ↔ Action (T5); `KundeNpsUmfrageEmail`-Props (T3) ↔ render-Call (T4).
