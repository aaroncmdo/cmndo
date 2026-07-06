# Partner-Leads-Fundament (Sub-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein kanonisches `partner_leads`-Modell + `convertPartnerLead` + `anlegePartnerKern` + rollen-parametrisierte Aktivierungs-Policy als Fundament für das Partner-Vertriebsdashboard (SV/Werkstatt/Makler).

**Architecture:** Neue Tabelle `partner_leads` (rolle-Diskriminator + einheitliches Status-Enum + `rollen_details` JSONB) als Prospect-Schicht VOR den bestehenden Rollen-Tabellen. Eine Config-Tabelle `partner_rollen_policy` parametrisiert die Aktivierungs-Gates pro Rolle. `anlegePartnerKern` konsolidiert die 4-5× duplizierte Account-Anlage (createUser+profiles+Rollen-Row). `convertPartnerLead` spiegelt das bewährte `convert-lead-to-claim`-Muster (idempotent, cleanup-safe).

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + Auth, service_role admin-client), TypeScript, vitest. DDL via Supabase-Plugin (`apply_migration`).

## Global Constraints

- **Regel 2:** DDL AUSSCHLIESSLICH via `mcp__plugin_supabase_supabase__apply_migration` (project_id `paizkjajbuxxksdoycev`), dann `list_migrations` → getrackte Version <V> → File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == Version). `execute_sql` nur READ.
- **Additive Migration** darf vor Code-Merge auf prod appliziert werden (kein Drop → Regel 3 nicht verletzt).
- **Nach jedem `CREATE TABLE` in public:** `REVOKE ALL ON <table> FROM anon` + gezielte GRANTs (sonst anon-Leak + Release-Blocker via `check-claim-view-rls`).
- **Result-Object** `{ ok: true; ... } | { ok: false; error: string }`, kein throw (AGENTS §Server-Actions).
- **Keine Konstanten/Types aus `'use server'`-Files** exportieren (AAR-664) → Resolver + Typen in reine Lib-Files.
- **Werkstatt:** `self_signup_erlaubt=false` (bleibt admin+QR, Aaron 04.07.).
- **Branch:** `kitta/partner-leads-fundament` (off staging). **NICHT in Sub-1:** Vertriebsdashboard-UI, Self-Reg-UI, Onboarding-Norm, das Umschreiben der 5 Alt-Anlage-Sites (Boy-Scout-Follow-up).
- Spec: `docs/superpowers/specs/2026-07-04-partner-leads-fundament-design.md`.

---

## File Structure

- `supabase/migrations/<V>_partner_leads_fundament.sql` — Tabellen + RLS + Policy-Seed (Task 1).
- `supabase/migrations/<V>_partner_leads_backfill.sql` — Daten-Migration sv_leads + gutachter_waitlist (Task 5).
- `src/lib/partner/policy.ts` — Typen (`PartnerRolle`, `PartnerPolicy`) + pure Resolver + DB-Loader (Task 2).
- `src/lib/partner/__tests__/policy.test.ts` — Policy-Resolver-Tests (Task 2).
- `src/lib/partner/anlege-partner.ts` — `anlegePartnerKern` (Task 3).
- `src/lib/partner/convert-partner-lead.ts` — `convertPartnerLead` (Task 4).
- `src/lib/partner/__tests__/convert-partner-lead.test.ts` — Idempotenz-/Mapping-Tests (Task 4).
- `src/lib/supabase/database.types.ts` — +partner_leads +partner_rollen_policy (Task 2, manuell additiv).

---

### Task 1: Migration — partner_leads + partner_rollen_policy

**Files:**
- Create: `supabase/migrations/<V>_partner_leads_fundament.sql` (nach apply_migration, V=getrackte Version)

**Interfaces:**
- Produces: Tabellen `partner_leads`, `partner_rollen_policy` (Spalten s.u.); Policy-Seed (makler/sachverstaendiger/werkstatt).

- [ ] **Step 1: DDL via apply_migration** — `apply_migration({ project_id: "paizkjajbuxxksdoycev", name: "partner_leads_fundament", query: <DDL> })` mit:

```sql
CREATE TABLE public.partner_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolle text NOT NULL CHECK (rolle IN ('sachverstaendiger','werkstatt','makler')),
  status text NOT NULL DEFAULT 'neu'
    CHECK (status IN ('neu','kontaktiert','qualifiziert','onboarding','aktiv','abgelehnt','kein_interesse')),
  firma text,
  ansprechpartner_vorname text,
  ansprechpartner_nachname text,
  email text NOT NULL,
  telefon text,
  plz text,
  ort text,
  source_channel text NOT NULL DEFAULT 'admin'
    CHECK (source_channel IN ('self_signup','marketing_bewerbung','dat_import','admin','empfehlung')),
  rollen_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  zugewiesen_an uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  konvertiert_zu_user_id uuid,
  konvertiert_zu_partner_id uuid,
  konvertiert_am timestamptz,
  konvertiert_durch uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_leads_rolle_status ON public.partner_leads (rolle, status);
CREATE INDEX idx_partner_leads_email ON public.partner_leads (lower(email));
CREATE INDEX idx_partner_leads_zugewiesen ON public.partner_leads (zugewiesen_an);

ALTER TABLE public.partner_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_leads FROM anon;
CREATE POLICY partner_leads_staff_all ON public.partner_leads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle IN ('admin','dispatch','leadbearbeiter')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle IN ('admin','dispatch','leadbearbeiter')));

CREATE TABLE public.partner_rollen_policy (
  rolle text PRIMARY KEY CHECK (rolle IN ('sachverstaendiger','werkstatt','makler')),
  self_signup_erlaubt boolean NOT NULL DEFAULT false,
  braucht_review boolean NOT NULL DEFAULT true,
  braucht_zahlung boolean NOT NULL DEFAULT false,
  auto_konvertieren boolean NOT NULL DEFAULT false,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_rollen_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_rollen_policy FROM anon;
CREATE POLICY partner_policy_read ON public.partner_rollen_policy FOR SELECT TO authenticated USING (true);
CREATE POLICY partner_policy_admin_write ON public.partner_rollen_policy FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));

INSERT INTO public.partner_rollen_policy (rolle, self_signup_erlaubt, braucht_review, braucht_zahlung, auto_konvertieren) VALUES
  ('makler',            true,  false, false, true),
  ('sachverstaendiger', true,  true,  true,  false),
  ('werkstatt',         false, true,  false, false);
```

- [ ] **Step 2: getrackte Version ablesen** — `list_migrations({ project_id })` → jüngste Version <V> für `partner_leads_fundament`.
- [ ] **Step 3: Migration-File committen** als `supabase/migrations/<V>_partner_leads_fundament.sql` (exakt obiges DDL). `git add` + commit `feat(partner): partner_leads + partner_rollen_policy Fundament-Migration`.
- [ ] **Step 4: Verifizieren (READ)** — `execute_sql({ project_id, query: "SELECT rolle, self_signup_erlaubt, braucht_review, braucht_zahlung, auto_konvertieren FROM public.partner_rollen_policy ORDER BY rolle" })`. Expected: 3 Zeilen (makler auto=t, sachverstaendiger review+zahlung=t, werkstatt self_signup=f).

---

### Task 2: Policy-Resolver + Types

**Files:**
- Create: `src/lib/partner/policy.ts`
- Create: `src/lib/partner/__tests__/policy.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (manuell +partner_leads +partner_rollen_policy Row/Insert/Update — additiv, alphabetisch einsortiert)

**Interfaces:**
- Consumes: `partner_rollen_policy` (Task 1).
- Produces: `type PartnerRolle`, `type PartnerPolicy`, `sollAutoKonvertieren(p)`, `ladePartnerPolicy(db, rolle)`.

- [ ] **Step 1: Failing test** (`src/lib/partner/__tests__/policy.test.ts`):

```typescript
import { describe, it, expect } from 'vitest'
import { sollAutoKonvertieren, braucht Review, type PartnerPolicy } from '../policy'

const P = (o: Partial<PartnerPolicy>): PartnerPolicy => ({
  rolle: 'makler', self_signup_erlaubt: false, braucht_review: false, braucht_zahlung: false, auto_konvertieren: false, ...o,
})

describe('partner policy', () => {
  it('makler-Policy → auto-konvertieren', () => {
    expect(sollAutoKonvertieren(P({ rolle: 'makler', auto_konvertieren: true }))).toBe(true)
  })
  it('sachverstaendiger → kein auto, aber review', () => {
    const p = P({ rolle: 'sachverstaendiger', braucht_review: true, braucht_zahlung: true })
    expect(sollAutoKonvertieren(p)).toBe(false)
    expect(brauchtReview(p)).toBe(true)
  })
  it('werkstatt → kein self_signup', () => {
    expect(P({ rolle: 'werkstatt', self_signup_erlaubt: false }).self_signup_erlaubt).toBe(false)
  })
})
```
(Tippfehler `braucht Review` in Import oben absichtlich NICHT — schreibe `brauchtReview`.)

- [ ] **Step 2: Run → FAIL** `npx vitest run src/lib/partner/__tests__/policy.test.ts` (Cannot find module '../policy').

- [ ] **Step 3: Implement** `src/lib/partner/policy.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type PartnerRolle = 'sachverstaendiger' | 'werkstatt' | 'makler'

export type PartnerPolicy = {
  rolle: PartnerRolle
  self_signup_erlaubt: boolean
  braucht_review: boolean
  braucht_zahlung: boolean
  auto_konvertieren: boolean
}

/** Pure Gate-Entscheidungen aus einer Policy-Zeile. */
export function sollAutoKonvertieren(p: PartnerPolicy): boolean { return p.auto_konvertieren }
export function brauchtReview(p: PartnerPolicy): boolean { return p.braucht_review }
export function brauchtZahlung(p: PartnerPolicy): boolean { return p.braucht_zahlung }
export function selfSignupErlaubt(p: PartnerPolicy): boolean { return p.self_signup_erlaubt }

/** Laedt die Policy einer Rolle aus der DB (Fallback: konservativ = review, kein auto). */
export async function ladePartnerPolicy(db: SupabaseClient, rolle: PartnerRolle): Promise<PartnerPolicy> {
  const { data } = await db.from('partner_rollen_policy').select('*').eq('rolle', rolle).maybeSingle()
  if (!data) return { rolle, self_signup_erlaubt: false, braucht_review: true, braucht_zahlung: false, auto_konvertieren: false }
  return {
    rolle,
    self_signup_erlaubt: Boolean(data.self_signup_erlaubt),
    braucht_review: Boolean(data.braucht_review),
    braucht_zahlung: Boolean(data.braucht_zahlung),
    auto_konvertieren: Boolean(data.auto_konvertieren),
  }
}
```

- [ ] **Step 4: Run → PASS**. Fix den Test-Import (`brauchtReview` statt `braucht Review`).
- [ ] **Step 5: database.types.ts** — `partner_leads` + `partner_rollen_policy` Row/Insert/Update additiv einfügen (Spalten wie DDL; PK/NOT-NULL → Insert required/optional analog). tsc muss grün bleiben.
- [ ] **Step 6: Commit** `feat(partner): Policy-Resolver + Types`.

---

### Task 3: anlegePartnerKern — konsolidierte Account-Anlage

**Files:**
- Create: `src/lib/partner/anlege-partner.ts`

**Interfaces:**
- Consumes: `PartnerRolle` (Task 2), `createAdminClient`.
- Produces: `anlegePartnerKern(admin, rolle, input): Promise<{ ok: true; userId; partnerId } | { ok: false; error }>`.

- [ ] **Step 1: Implement** — spiegelt `src/lib/makler/anlege-makler.ts:anlegeMaklerKern` (createUser mit force_password_change → `profiles` insert mit `rolle` → Rollen-Row insert per `switch(rolle)` → Rollback-Cascade). `generatePassword` von dort kopieren (später als shared util extrahierbar). Rollen-Row-Inserts:
  - `makler` → `makler`-Row wie anlegeMaklerKern (firma, ansprechpartner_*, email, telefon, adresse_*, provision_betrag_*, provision_aktiv=true, status='aktiv', aktiviert_von, user_id) + Default-Promo-Code (`generatePromoCode`, non-fatal).
  - `sachverstaendiger` → `sachverstaendige`-Row (Insert-Felder aus `src/app/admin/sachverstaendige/anlegen/actions.ts:anlegeSv` bzw. `sv-basic/claim-actions.ts:registriereSvBasicNeu` übernehmen: name/firma, email, dat_nummer aus `input.rollenDetails`, `profile_id`/`user_id`, `onboarding_status='vom_admin_angelegt'` bzw. self, `ist_aktiv=false` bis Review/Zahlung).
  - `werkstatt` → `werkstaetten`-Row (Insert aus `src/app/admin/werkstaetten/actions.ts:createWerkstatt`: name, email, adresse, status='aktiv', user_id).
  Input-Typ:

```typescript
export type PartnerAnlageInput = {
  firma: string
  ansprechpartnerVorname: string
  ansprechpartnerNachname: string
  email: string // normalisiert
  telefon: string | null
  plz: string | null
  ort: string | null
  aktiviertVon: string | null
  rollenDetails: Record<string, unknown> // rollen-spezifisch (DAT-Nr, Marken, IHK ...)
}
export type PartnerAnlageResult =
  | { ok: true; userId: string; partnerId: string; password: string }
  | { ok: false; error: string }
```
  Signatur: `export async function anlegePartnerKern(admin: AdminClient, rolle: PartnerRolle, input: PartnerAnlageInput): Promise<PartnerAnlageResult>`.
  **Rollback-Cascade** identisch zu anlegeMaklerKern (bei Rollen-Row-Fehler: profiles delete + auth deleteUser).

- [ ] **Step 2: Verifikation** — `npx tsc --noEmit` grün (kein Runtime-Test in Sub-1; integrativ via convertPartnerLead-Smoke post-deploy). Optional: ein Integration-Test gegen eine lokale/Test-DB später.
- [ ] **Step 3: Commit** `feat(partner): anlegePartnerKern (konsolidierte Account-Anlage)`.

---

### Task 4: convertPartnerLead — idempotente Konvertierung

**Files:**
- Create: `src/lib/partner/convert-partner-lead.ts`
- Create: `src/lib/partner/__tests__/convert-partner-lead.test.ts`

**Interfaces:**
- Consumes: `anlegePartnerKern` (Task 3), `ladePartnerPolicy` (Task 2).
- Produces: `convertPartnerLead(partnerLeadId, opts?): Promise<{ ok: true; userId; partnerId } | { ok: false; error }>`; pure `mapLeadZuAnlageInput(lead)`.

- [ ] **Step 1: Failing test** (pure Mapping + Idempotenz-Guard-Logik). Teste `mapLeadZuAnlageInput` (partner_leads-Row → PartnerAnlageInput, rollen_details durchgereicht) + `istBereitsKonvertiert(lead)` (true wenn `konvertiert_zu_user_id` gesetzt):

```typescript
import { describe, it, expect } from 'vitest'
import { mapLeadZuAnlageInput, istBereitsKonvertiert } from '../convert-partner-lead'

const lead = {
  id: 'pl-1', rolle: 'makler', firma: 'X GmbH', ansprechpartner_vorname: 'A', ansprechpartner_nachname: 'B',
  email: 'a@x.de', telefon: null, plz: null, ort: null, rollen_details: { ihk: '123' }, konvertiert_zu_user_id: null,
}
describe('convert-partner-lead', () => {
  it('mappt Lead → Anlage-Input inkl. rollen_details', () => {
    const inp = mapLeadZuAnlageInput(lead as any)
    expect(inp.firma).toBe('X GmbH'); expect(inp.email).toBe('a@x.de'); expect(inp.rollenDetails).toEqual({ ihk: '123' })
  })
  it('erkennt bereits konvertierte Leads (Idempotenz)', () => {
    expect(istBereitsKonvertiert({ ...lead, konvertiert_zu_user_id: 'u-1' } as any)).toBe(true)
    expect(istBereitsKonvertiert(lead as any)).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `convert-partner-lead.ts`:
  - pure `mapLeadZuAnlageInput(lead)` + `istBereitsKonvertiert(lead)`.
  - `convertPartnerLead(partnerLeadId, opts)`: `admin=createAdminClient()` → Lead laden → wenn `istBereitsKonvertiert` → `{ ok: true, userId, partnerId }` (früh, idempotent) → `anlegePartnerKern(admin, lead.rolle, mapLeadZuAnlageInput(lead))` → bei Fehler `{ ok:false }` (anlegePartnerKern rollbackt seinen halben Account selbst) → `partner_leads` update `status='aktiv', konvertiert_zu_user_id/_partner_id/_am=now()/_durch=opts.durchUserId`. Result-Object, kein throw.
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** `feat(partner): convertPartnerLead (idempotent, policy-aware)`.

---

### Task 5: Daten-Migration sv_leads + gutachter_waitlist → partner_leads

**Files:**
- Create: `supabase/migrations/<V>_partner_leads_backfill.sql`

**Interfaces:**
- Consumes: `partner_leads` (Task 1), Bestand `sv_leads` + `gutachter_waitlist`.

- [ ] **Step 1: Mapping festlegen (READ zuerst)** — `execute_sql` die Spalten von `sv_leads` (`warteliste_status`, `claim_status`, `konvertiert_zu_sv_id`, Kontakt) + `gutachter_waitlist` (`status`, Kontakt) lesen. Status-Mapping: `gutachter_waitlist.status` (neu/kontaktiert/qualifiziert/onboarding/aktiv/abgelehnt/kein_interesse) → 1:1; `sv_leads.warteliste_status` (ausstehend→neu, kontaktiert→kontaktiert, aktiv→aktiv, abgelehnt→abgelehnt).
- [ ] **Step 2: DDL via apply_migration** `partner_leads_backfill` — `INSERT INTO partner_leads (rolle, status, firma, ansprechpartner_*, email, telefon, plz, ort, source_channel, rollen_details, konvertiert_zu_partner_id, erstellt_am) SELECT 'sachverstaendiger', <mapped_status>, ..., 'marketing_bewerbung'|'dat_import', jsonb_build_object(...), konvertiert_zu_sv_id, created_at FROM ...` — je eine INSERT-Query aus `gutachter_waitlist` (source `marketing_bewerbung`) und `sv_leads` (source `dat_import`). **Idempotent:** `WHERE NOT EXISTS (SELECT 1 FROM partner_leads pl WHERE pl.email = <src>.email AND pl.rolle='sachverstaendiger')` gegen Doppel-Backfill.
- [ ] **Step 3: Version ablesen + File committen** (`<V>_partner_leads_backfill.sql`).
- [ ] **Step 4: Verifizieren** — `execute_sql SELECT source_channel, count(*) FROM partner_leads GROUP BY 1`. Erwartet: Zeilen aus beiden Quellen. Alt-Tabellen bleiben read-only stehen (kein Drop).
- [ ] **Step 5: Commit** (Migration-File) `feat(partner): backfill sv_leads + gutachter_waitlist -> partner_leads`.

---

## Self-Review

**1. Spec coverage:** partner_leads (§3.1) → Task1 · partner_rollen_policy (§3.2) → Task1 · anlegePartnerKern (§4.1) → Task3 · convertPartnerLead (§4.2) → Task4 · Aktivierungs-Policy (§4.3) → Task1-Seed+Task2-Resolver · Migration Bestand (§5) → Task5. ✅ Alle Sub-1-Punkte abgedeckt. Nicht-Ziele (Dashboard/Self-Reg-UI/Onboarding/5-Sites-Rewrite) bewusst ausgelassen (§2).

**2. Placeholder-Scan:** Task 3 verweist für die sv/werkstatt-Insert-Felder auf die bestehenden anlege-Funktionen (file:line) statt sie zu duplizieren — bewusst, da der Implementer diese Files liest (die exakten Spalten dort sind die Quelle der Wahrheit; Raten wäre schlechter). Kein „TODO/TBD".

**3. Type-Konsistenz:** `PartnerRolle`/`PartnerPolicy`/`PartnerAnlageInput`/`PartnerAnlageResult` über Tasks 2-4 konsistent; `anlegePartnerKern`-Return (`{userId, partnerId}`) == was `convertPartnerLead` konsumiert. ✅

## Offene Punkte (nach Sub-1)
- Boy-Scout: die 5 Alt-Anlage-Sites nach und nach auf `anlegePartnerKern` umstellen.
- Sub-2 Vertriebsdashboard, Sub-3 Self-Reg (Werkstatt-Lücke), Sub-4 Onboarding-Norm.
