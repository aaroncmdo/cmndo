# Netzwerk-Ökosystem P5 (Freemium-Billing, alles via Stripe) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das zahlende „Netzwerkpartner"-Abo scharf schalten — Stripe-Subscription (recurring, Greenfield) **+** einmalige Einrichtungsgebühr, beide via Stripe, config-getriebene Preise, Live-Webhook-Handler die die P0-Subscription-Row (`sv_netzwerk_abonnements`) service-role schreiben, DB-getriebene §14-Rechnung für die Setup-Fee, Dunning-Cron, Grandfather-Backfill (comped) und die Freemium-UI (Onboarding-Ask + In-App-Upgrade + Registrierung-Audit).

**Architecture:** Reuse-first auf der bestehenden Stripe-Einmal-Infra (`@/lib/stripe/client`, `sv-checkout.ts`-Muster, `stripe_events`-Idempotenz, `createOnboardingRechnung`→`getAktuelleRechnungsKonfig`-Config-Pfad, `sv_payment_reminders`, `pg_cron`+Vault wie `release_provisionen`). **Net-new = genau das Recurring-Delta:** ein Subscription-Checkout (`mode:'subscription'` mit Setup-Fee als `add_invoice_items` der ersten Rechnung), 4 neue Webhook-Event-Handler (`invoice.payment_{succeeded,failed}` + `customer.subscription.{updated,deleted}`), ein Dunning-Cron und die Freemium-UI. Der **Entitlement-Zustand** ist die P0-Row `sv_netzwerk_abonnements` (derive-at-read via `istAktivesAbo`, K1) — der Webhook ist der einzige (service-role) Writer; `paket` wird NIE angefasst (K3).

**Tech Stack:** Next.js 15 (App Router, Route-Handler), Stripe SDK `^22.0.1` (`@/lib/stripe/client`-Singleton), Supabase Postgres (DDL via MCP-Plugin `apply_migration`; `pg_cron`+Vault), TypeScript + `@supabase/supabase-js` (Admin-Client), `@react-pdf/renderer`, vitest.

---

## Global Constraints

Jede Task erbt diese Constraints implizit.

- **DDL NUR via Supabase-Plugin `apply_migration`** (AGENTS.md Regel 2). Ablauf je Migration: apply → `list_migrations` (getrackte Version `<V>` ablesen) → File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == `<V>`, Twin-Drift vermeiden) → `execute_sql` (READ) verifizieren → Typen regenerieren + committen (`src/lib/supabase/database.types.ts`). **Nie** raw `execute_sql` mit DDL, **nie** `supabase db push`.
- **Preise NUR aus `rechnungs_konfiguration`** (versioniert), **NIE** hardcoded `price_…`/`prod_…`-IDs im Code oder in ENV (Spec §9/§11, Stripe-Best-Practice). Checkout nutzt **inline `price_data`** (Betrag aus Config) mit `product_data.name` (kein `prod_`-Objekt).
- **Entitlement service-role-only schreibbar** (K1): `sv_netzwerk_abonnements`-Writes ausschließlich über `createAdminClient()` (Webhook, Dunning-Cron, Backfill). **Kein** authenticated-Write. **`paket` NIE überschreiben** (K3) — Entitlement ist eine separate Achse; Comping = eine Abo-Row mit `status='comped'`, nie `paket='netzwerk'`.
- **Stripe-Integration:** den bestehenden Singleton `@/lib/stripe/client` (`export const stripe`) wiederverwenden — **kein** SDK-Bump in diesem Plan (Subscription-APIs existieren in `stripe@22`; ein SDK-Upgrade ist ein separates Ticket). `mode:'subscription'`. **NIEMALS `payment_method_types` übergeben** (Dynamic Payment Methods — Stripe-Best-Practice). Kein deprecated `plan`-Objekt (nur Prices/`price_data`). **Keine manuellen Renewal-Loops** — Stripe treibt Retry/Renewal, unser Cron macht nur Reminder + finalen Cancel.
- **Idempotenz:** alle Webhook-Handler laufen durch den bestehenden `stripe_events`-Claim-Insert (`UNIQUE(stripe_event_id)`, gate auf `verarbeitet`). Handler-Writes sind idempotent (upsert auf `sv_id`, Rechnung per Unique-Index gegen Doppel-Ausstellung).
- **flag-drift-Ratchet:** ein NEUER enum-Wert (`sv_onboarding_rechnungen.typ='netzwerk_einrichtung'`) MUSS **zuerst** per Migration in den CHECK **und** in den Snapshot (`scripts/lib/status-check-constraints.json`), **dann** darf Code ihn schreiben. Alle Ratchets 0-neu grün: `check:flag-drift`, `check:token-audit`, `check:component-set`, `check:knip`, `check:rls-policies`, `check:rls-grants`, `check:status-registry`, `check:vitest`.
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB **und** `.env.local` → **LIVE-Stripe** mit staging). Verifikation via `execute_sql` READ-only. **Kein Zahl-Smoke off-prod, nie eine echte Charge** (K15) — Billing wird verifiziert via **comped-Pfad** + **synthetischen Webhook-Fixtures** (Unit) + **Stripe-Test-Mode/Test-Clock**.
- **Umlaute** in allen nutzersichtbaren Strings (JSX, Email-Templates, PDF-Strings): echte `ä/ö/ü/ß`. Backend/Commits/Comments dürfen ASCII sein.
- **Server-Actions** liefern `{ ok: boolean; error?: string }` (kein `throw`-Mix); jede mutierende Action ruft `revalidatePath`.
- **Nie auf `main` pushen.** Branch `kitta/aar-<nr>-netzwerk-p5-billing`, PR gegen `staging`, **nicht selbst mergen**.
- **Pflichtlektüre vor Start:** `docs/superpowers/specs/2026-07-25-angebotsstruktur-sv-freemium-netzwerk-entitlement-design.md` (§13b, §14), `…-2026-07-27-{netzwerk-oekosystem-epic-overview,hardening-und-koordination-vor-plaenen,implementierungs-roadmap-phasen}.md` (K7/K14/K15, P5), `docs/superpowers/plans/2026-07-28-netzwerk-p0-fundament.md`, `docs/fundament/FUNDAMENT.md` §1+§2, Marker `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]` + `[[coordination-stripe-golive-cutover-runbook]]`.

---

## Voraussetzungen — HARTE Blocker (VOR Merge/Go-Live, nicht vor dem Schreiben von Code)

### Abhängigkeit: P0 muss gemergt sein
`sv_netzwerk_abonnements` + `src/lib/netzwerk/entitlement.ts` (`istAktivesAbo`, `ladeZahlendeSvSet`, `istZahlenderNetzwerkPartner`) sind **P0-Deliverables** und existieren zum Planungszeitpunkt **noch nicht** (frisch verifiziert 28.07.: `select … table_name in ('sv_netzwerk_abonnements','netzwerk_verbindungen')` → 0 Zeilen). P5 dockt darauf. **T0 verifiziert P0-Merge**; ohne P0 blockt der Merge (Code/Tests sind schreibbar, aber die Migrationen/Webhook-Writes laufen erst nach P0).

### Aaron-Blocker (Prä-Go-Live, klar als Voraussetzung markiert)
| # | Blocker | Betrifft | Fallback bis dahin |
|---|---|---|---|
| **AB1** | **Live-Webhook-Endpoint um die 4 Events erweitern** (`invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`) im Stripe-**Live**-Dashboard; `whsec_…` bleibt der bestehende Live-Secret (`STRIPE_WEBHOOK_SECRET`). K14: der Live-Endpoint hat heute **0** subscription/invoice-Events → ohne diese Erweiterung landet Dunning/Entitlement im Nichts. | T4, T6 | Handler laufen, aber Prod liefert die Events nicht aus → **kein** Live-Entitlement. Test-Mode-`stripe trigger` deckt die Handler-Logik ab. |
| **AB2** | **Finale Preise bestätigen** — `netzwerk_monat_cent` / `netzwerk_setup_cent`. Spec-Platzhalter **29,99 € (2999) / 39,90 € (3990)** sind TBD. | T1 (Seed), T2, T3 | Placeholder 2999/3990 werden geseedet; Aaron ändert nur die **Config-Row** (kein Code-Change). |
| **AB3** | **Echte IBAN/USt in `rechnungs_konfiguration`** — die §14-Rechnungsdaten auf prod sind Dummies (Epic §6 Landmine). | T5 (Setup-Fee-Rechnung) | Rechnung generiert korrekt, trägt aber Dummy-Steuerdaten → **nicht** an echte Kunden versenden, bis real. |
| **AB4** | **Custom-SMTP live** (Dunning-/Beleg-Mails). | T6, T9 | Reminder werden erzeugt (DB-Row + Task), Mail-Send ist try/catch-gewrappt (kein atomarer Bruch). |
| **AB5** | **Go-Live-Freigabe für den comped-Backfill** (Prod-Daten-Mutation auf shared DB). | T7 | Backfill-Migration ist geschrieben + idempotent, wird aber **erst nach Freigabe appliziert**. |

### Koordinations-Gates (blocken Merge, nicht das Schreiben)
- **UG-`rechnungssteller`-CHECK-Kollision (K14): RESOLVED.** Frisch verifiziert 28.07.: sowohl `rechnungs_konfiguration_rechnungssteller_check` als auch `sv_onboarding_rechnungen_rechnungssteller_check` enthalten bereits `kitta_sprafke_ug` (`['claimondo_gmbh_igr','claimondo_gmbh','gbr','kitta_sprafke_ug']`). → **Diesen CHECK NICHT erneut editieren.** T1 fasst nur den `.typ`-CHECK an (disjunkt).
- **Stripe-Go-Live-Cutover ist live** (Marker `[[coordination-stripe-golive-cutover-runbook]]`, seit 27.07. Live-Konto `acct_1TxkQiPc8vBRSrlm`). Webhook-Endpoint-Erweiterung (AB1) im **Live**-Dashboard, nicht Test.

---

## File Structure

**Net-new:**
- `supabase/migrations/<V>_netzwerk_preise_config.sql` — `rechnungs_konfiguration` += 3 Preis-Spalten + Seed (T1).
- `supabase/migrations/<V>_netzwerk_einrichtung_rechnungstyp.sql` — `sv_onboarding_rechnungen.typ`-CHECK += `netzwerk_einrichtung` (T1).
- `supabase/migrations/<V>_netzwerk_abo_comped_backfill.sql` — Grandfather-Backfill (T7).
- `supabase/migrations/<V>_arm_netzwerk_abo_dunning_cron.sql` — pg_cron-Arm (T6).
- `src/lib/billing/netzwerk-preise.ts` (+ `__tests__/netzwerk-preise.test.ts`) — Config-Preis-Accessor (T2).
- `src/lib/stripe/netzwerk-abo-checkout.ts` (+ `__tests__/netzwerk-abo-checkout.test.ts`) — Subscription-Checkout-Params + Session-/Portal-Creator (T3).
- `src/lib/netzwerk/abo-webhook.ts` (+ `__tests__/abo-webhook.test.ts`) — pure Reducer `deriveAboStatusFromStripe` + `applyNetzwerkAboEvent` (T4).
- `src/app/api/cron/netzwerk-abo-dunning/route.ts` — Dunning-Cron-Route (T6).
- `src/components/netzwerk/NetzwerkpartnerCta.tsx` — geteilte Upgrade-CTA/Status-Card (Onboarding + Einstellungen, T8/T9).
- `src/app/gutachter/einstellungen/netzwerk-abo/actions.ts` — Server-Actions (Checkout-Session, Portal-Session) (T9).

**Modify:**
- `src/app/api/stripe/webhook/route.ts` — 4 Event-`case`s + `netzwerk_abo`-Zweig in `checkout.session.completed` (T4).
- `src/lib/billing/create-onboarding-rechnung.ts` — `typ`-Union += `netzwerk_einrichtung` (T5).
- `src/lib/pdf/onboarding-rechnung.tsx` — `typ`-Union + `beschreibung`-Zweig (T5).
- `src/app/gutachter/willkommen/WillkommenClient.tsx` + `SvBasicOnboardingClient.tsx` — skippbarer Abo-Ask-Step (T8).
- `src/app/gutachter/einstellungen/_components/EinstellungenSettings.tsx` — Netzwerkpartner-Sektion (T9).
- `src/app/sv/registrieren/SvRegistrierenClient.tsx` — Freemium-/Netzwerkpartner-Framing (T10).
- `src/lib/supabase/database.types.ts` — regen (T1, T7).
- `scripts/lib/status-check-constraints.json` — flag-drift-Snapshot-Regen (T1).

**Reuse (nicht ändern, nur konsumieren):**
- `src/lib/stripe/client.ts` (`stripe`), `src/lib/stripe/sv-checkout.ts` (`getOrCreateStripeCustomer`), `src/lib/billing/get-rechnungs-konfig.ts` (`getAktuelleRechnungsKonfig`), `src/lib/abrechnung/descriptors/onboarding.ts` (`ONBOARDING_DESCRIPTOR`, generischer `typ`-Passthrough), `src/lib/auth/cron-auth.ts` (`assertCronAuth`), `src/lib/netzwerk/entitlement.ts` (P0), `src/lib/tasks/create-task.ts` (`createLinkedTask`).

---

## Task 0: Worktree + Pre-Plan-Gate Re-Verifikation (kein Merge-Deliverable)

**Files:** keine (Verifikation).

- [ ] **Schritt 1:** Frischen Worktree off `staging`: `node scripts/new-session-worktree.mjs aar-<nr>-netzwerk-p5-billing staging`; `git log -1 origin/staging` == HEAD verifizieren.
- [ ] **Schritt 2: P0-Merge bestätigen** (`execute_sql`, prod-Ref):
```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name='sv_netzwerk_abonnements';
select conname, pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.sv_netzwerk_abonnements'::regclass and contype='c';
```
Erwartet: Tabelle existiert; `status`-CHECK = `('inaktiv','aktiv','ueberfaellig','gekuendigt','comped')`. **Fehlt sie → STOP**, P0 ist noch nicht gemergt (Merge-Blocker; Code/Tests dürfen trotzdem geschrieben werden).
- [ ] **Schritt 3: Reuse-Anker frisch verifizieren** (Namen können driften):
```sql
-- Preis-Spalten noch NICHT da (T1 fügt sie an):
select column_name from information_schema.columns where table_schema='public'
  and table_name='rechnungs_konfiguration' and column_name like 'netzwerk%';
-- typ-CHECK noch OHNE netzwerk_einrichtung:
select pg_get_constraintdef(oid) from pg_constraint
  where conname='sv_onboarding_rechnungen_typ_check';
-- rechnungssteller-CHECK schon MIT kitta_sprafke_ug (Kollision resolved):
select pg_get_constraintdef(oid) from pg_constraint
  where conname='rechnungs_konfiguration_rechnungssteller_check';
```
Erwartet: 0 Preis-Spalten; `typ`-CHECK = `('solo','buero','akademie')`; `rechnungssteller`-CHECK enthält `kitta_sprafke_ug`. Abweichung → Task-DDL anpassen.
- [ ] **Schritt 4: Stripe-Ist frisch bestätigen** — `src/app/api/stripe/webhook/route.ts` hat **keinen** `invoice.*`/`customer.subscription.*`-`case` (grep); `git grep -n "billingPortal\|subscriptions\.create" src/` = leer (Greenfield, K7). Ergebnis im PR-Marker notieren.
- [ ] **Schritt 5: Aaron-Blocker-Status** (AB1–AB5) im PR-Marker als Checkliste anlegen. Die Aufgabe bleibt **offen** bis der grüne Prod-Smoke (Regel 4, DoD J8/J9) dokumentiert ist.

---

## Task 1: DDL — Preis-Config-Spalten + `netzwerk_einrichtung`-Rechnungstyp + flag-drift-Snapshot

**Files:**
- Create: `supabase/migrations/<V1>_netzwerk_preise_config.sql`, `supabase/migrations/<V2>_netzwerk_einrichtung_rechnungstyp.sql`
- Modify: `src/lib/supabase/database.types.ts` (regen), `scripts/lib/status-check-constraints.json` (Snapshot-Regen)

**Interfaces:**
- Produces: `rechnungs_konfiguration.netzwerk_monat_cent` (int, nullable), `netzwerk_setup_cent` (int), `werkstatt_setup_cent` (int); `sv_onboarding_rechnungen.typ`-CHECK erlaubt zusätzlich `'netzwerk_einrichtung'`. Konsumiert von T2/T3/T5.

- [ ] **Schritt 1: Verifikation (erwartet leer/alt)** — die T0-Schritt-3-Queries erneut; Preis-Spalten fehlen, `typ`-CHECK ohne netzwerk.

- [ ] **Schritt 2: Migration A anwenden** (`apply_migration`, name `netzwerk_preise_config`):
```sql
alter table public.rechnungs_konfiguration
  add column netzwerk_monat_cent   integer,
  add column netzwerk_setup_cent   integer,
  add column werkstatt_setup_cent  integer;
comment on column public.rechnungs_konfiguration.netzwerk_monat_cent is
  'Netzwerkpartner Monats-Flatrate in Cent (config-getrieben, versioniert). TBD-Aaron: 2999 Platzhalter.';
comment on column public.rechnungs_konfiguration.netzwerk_setup_cent is
  'Netzwerkpartner einmalige Einrichtungsgebuehr in Cent. TBD-Aaron: 3990 Platzhalter.';
-- AB2: Platzhalter in die AKTUELL gueltige Config-Row (gueltig_bis IS NULL) seeden.
-- Aaron bestaetigt final via reiner Config-UPDATE (kein Code-Change).
update public.rechnungs_konfiguration
   set netzwerk_monat_cent = coalesce(netzwerk_monat_cent, 2999),
       netzwerk_setup_cent = coalesce(netzwerk_setup_cent, 3990)
 where gueltig_bis is null;
```
(Keine neuen Grants — `rechnungs_konfiguration` wird nur via service-role (`createAdminClient`) gelesen; **kein** anon/authenticated-Grant ausweiten.)

- [ ] **Schritt 3: Migration B anwenden** (`apply_migration`, name `netzwerk_einrichtung_rechnungstyp`):
```sql
alter table public.sv_onboarding_rechnungen
  drop constraint sv_onboarding_rechnungen_typ_check,
  add  constraint sv_onboarding_rechnungen_typ_check
       check (typ in ('solo','buero','akademie','netzwerk_einrichtung'));
```

- [ ] **Schritt 4: Versionen ablesen + Files committen** — `list_migrations` → `<V1>`/`<V2>`; beide Files exakt nach getrackter Version benennen (kein Twin-Drift).

- [ ] **Schritt 5: Verifizieren** (`execute_sql` READ):
```sql
select column_name from information_schema.columns where table_schema='public'
  and table_name='rechnungs_konfiguration' and column_name like 'netzwerk%' or column_name='werkstatt_setup_cent';
select netzwerk_monat_cent, netzwerk_setup_cent from public.rechnungs_konfiguration where gueltig_bis is null;
select pg_get_constraintdef(oid) from pg_constraint where conname='sv_onboarding_rechnungen_typ_check';
```
Erwartet: 3 Spalten da; aktuelle Row hat 2999/3990; `typ`-CHECK enthält `netzwerk_einrichtung`.

- [ ] **Schritt 6: flag-drift-Snapshot regenerieren + Ratchet grün**
```bash
node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs
npm run check:flag-drift -- --ratchet
```
Erwartet: exit 0 (der neue `typ`-Wert ist im Snapshot bekannt).

- [ ] **Schritt 7: Typen regen + Commit**
```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
git add supabase/migrations src/lib/supabase/database.types.ts scripts/lib/status-check-constraints.json
git commit -m "feat(netzwerk): preis-config-spalten + netzwerk_einrichtung rechnungstyp + flag-drift snapshot (P5 T1)"
```

---

## Task 2: Config-Preis-Accessor `ladeNetzwerkPreise`

**Files:**
- Create: `src/lib/billing/netzwerk-preise.ts`
- Test: `src/lib/billing/__tests__/netzwerk-preise.test.ts`

**Interfaces:**
- Consumes: `getAktuelleRechnungsKonfig` (bestehend), `rechnungs_konfiguration.netzwerk_{monat,setup}_cent` (T1).
- Produces: `type NetzwerkPreise = { monatCent: number; setupCent: number; konfigId: string; konfigVersion: number }`; `ladeNetzwerkPreise(stichtag?: Date): Promise<NetzwerkPreise>` (wirft, wenn Config-Werte fehlen — Fail-Loud, kein stiller 0-Preis). Konsumiert von T3/T5/T8/T9.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../get-rechnungs-konfig', () => ({
  getAktuelleRechnungsKonfig: vi.fn(),
}))
import { getAktuelleRechnungsKonfig } from '../get-rechnungs-konfig'
import { ladeNetzwerkPreise } from '../netzwerk-preise'

const baseKonfig = { id: 'k1', version: 3 } as never

describe('ladeNetzwerkPreise', () => {
  it('liefert Cent-Betraege + Config-Version aus der aktuellen Konfig', async () => {
    ;(getAktuelleRechnungsKonfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseKonfig, netzwerk_monat_cent: 2999, netzwerk_setup_cent: 3990,
    })
    const p = await ladeNetzwerkPreise()
    expect(p).toEqual({ monatCent: 2999, setupCent: 3990, konfigId: 'k1', konfigVersion: 3 })
  })
  it('wirft wenn Preis-Werte fehlen (kein stiller 0-Preis)', async () => {
    ;(getAktuelleRechnungsKonfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseKonfig, netzwerk_monat_cent: null, netzwerk_setup_cent: null,
    })
    await expect(ladeNetzwerkPreise()).rejects.toThrow(/netzwerk_monat_cent/)
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/billing/__tests__/netzwerk-preise.test.ts` → FAIL („ladeNetzwerkPreise is not a function").

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/billing/netzwerk-preise.ts
import { getAktuelleRechnungsKonfig } from './get-rechnungs-konfig'

export type NetzwerkPreise = {
  monatCent: number
  setupCent: number
  konfigId: string
  konfigVersion: number
}

/**
 * SSoT fuer die Netzwerkpartner-Preise (config-getrieben, versioniert).
 * Fail-loud: fehlende Config-Werte werfen — nie ein stiller 0-Preis-Checkout.
 */
export async function ladeNetzwerkPreise(stichtag: Date = new Date()): Promise<NetzwerkPreise> {
  const konfig = await getAktuelleRechnungsKonfig(stichtag) as unknown as {
    id: string; version: number
    netzwerk_monat_cent: number | null; netzwerk_setup_cent: number | null
  }
  if (konfig.netzwerk_monat_cent == null || konfig.netzwerk_monat_cent <= 0) {
    throw new Error(`[netzwerk-preise] netzwerk_monat_cent fehlt/<=0 in rechnungs_konfiguration (Version ${konfig.version})`)
  }
  if (konfig.netzwerk_setup_cent == null || konfig.netzwerk_setup_cent < 0) {
    throw new Error(`[netzwerk-preise] netzwerk_setup_cent fehlt in rechnungs_konfiguration (Version ${konfig.version})`)
  }
  return {
    monatCent: konfig.netzwerk_monat_cent,
    setupCent: konfig.netzwerk_setup_cent,
    konfigId: konfig.id,
    konfigVersion: konfig.version,
  }
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/billing/__tests__/netzwerk-preise.test.ts` → PASS.

- [ ] **Schritt 5: Commit** — `git add src/lib/billing/netzwerk-preise.ts src/lib/billing/__tests__ && git commit -m "feat(netzwerk): config-getriebener netzwerk-preis-accessor (P5 T2)"`.

---

## Task 3: Subscription-Checkout — Params-Builder + Session-/Portal-Creator

**Files:**
- Create: `src/lib/stripe/netzwerk-abo-checkout.ts`
- Test: `src/lib/stripe/__tests__/netzwerk-abo-checkout.test.ts`

**Interfaces:**
- Consumes: `stripe` (`@/lib/stripe/client`), `getOrCreateStripeCustomer` (`@/lib/stripe/sv-checkout`), `ladeNetzwerkPreise` (T2), `sachverstaendige.id/profile_id/stripe_customer_id`.
- Produces:
  - `buildNetzwerkAboCheckoutParams(args: { customerId: string; svId: string; monatCent: number; setupCent: number; returnUrl: string }): Stripe.Checkout.SessionCreateParams` (**pure**, getestet).
  - `createNetzwerkAboCheckoutSession(svId: string): Promise<{ ok: true; clientSecret: string; sessionId: string } | { ok: false; error: string }>`.
  - `createNetzwerkAboPortalSession(svId: string, returnUrl: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>`.
  Konsumiert von T8/T9.

- [ ] **Schritt 1: Failing Test schreiben** (pure Params-Builder — der einzige netzfreie Teil, deshalb TDD-Anker)
```ts
import { describe, it, expect } from 'vitest'
import { buildNetzwerkAboCheckoutParams } from '../netzwerk-abo-checkout'

describe('buildNetzwerkAboCheckoutParams', () => {
  const p = buildNetzwerkAboCheckoutParams({
    customerId: 'cus_1', svId: 'sv-uuid', monatCent: 2999, setupCent: 3990,
    returnUrl: 'https://app.claimondo.de/gutachter/einstellungen?netzwerk_abo=success&session_id={CHECKOUT_SESSION_ID}',
  })
  it('mode=subscription, kein payment_method_types (Dynamic PM)', () => {
    expect(p.mode).toBe('subscription')
    expect('payment_method_types' in p).toBe(false)
  })
  it('recurring monatlich via inline price_data (kein price_-Objekt)', () => {
    const li = p.line_items![0] as { price_data: { unit_amount: number; recurring: { interval: string }; currency: string } }
    expect(li.price_data.unit_amount).toBe(2999)
    expect(li.price_data.currency).toBe('eur')
    expect(li.price_data.recurring.interval).toBe('month')
  })
  it('Setup-Fee als add_invoice_items der ERSTEN Rechnung (config-cent, inline)', () => {
    const aii = (p.subscription_data!.add_invoice_items as Array<{ price_data: { unit_amount: number } }>)[0]
    expect(aii.price_data.unit_amount).toBe(3990)
  })
  it('sv_id in subscription_data.metadata UND session.metadata (Resolver-Anker)', () => {
    expect(p.subscription_data!.metadata!.sv_id).toBe('sv-uuid')
    expect(p.subscription_data!.metadata!.typ).toBe('netzwerk_abo')
    expect(p.metadata!.sv_id).toBe('sv-uuid')
    expect(p.metadata!.typ).toBe('netzwerk_abo')
  })
  it('setupCent=0 => KEINE add_invoice_items (Waiver/Sonderfall)', () => {
    const p0 = buildNetzwerkAboCheckoutParams({ customerId: 'c', svId: 's', monatCent: 2999, setupCent: 0, returnUrl: 'x' })
    expect(p0.subscription_data!.add_invoice_items ?? []).toHaveLength(0)
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/stripe/__tests__/netzwerk-abo-checkout.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/stripe/netzwerk-abo-checkout.ts
import type Stripe from 'stripe'
import { stripe } from './client'
import { getOrCreateStripeCustomer } from './sv-checkout'
import { ladeNetzwerkPreise } from '@/lib/billing/netzwerk-preise'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

/**
 * Pure Params-Builder: Subscription-Checkout mit Setup-Fee als add_invoice_items
 * der ERSTEN Rechnung (Stripe-kanonisch fuer "Setup-Fee + Abo"). Preise inline
 * aus Config -> KEINE price_/prod_-IDs. KEIN payment_method_types (Dynamic PM).
 */
export function buildNetzwerkAboCheckoutParams(args: {
  customerId: string; svId: string; monatCent: number; setupCent: number; returnUrl: string
}): Stripe.Checkout.SessionCreateParams {
  const meta = { sv_id: args.svId, typ: 'netzwerk_abo' }
  const params: Stripe.Checkout.SessionCreateParams = {
    customer: args.customerId,
    mode: 'subscription',
    // KFZ-156-Muster: embedded Checkout inline im Portal.
    ui_mode: 'embedded_page' as unknown as Stripe.Checkout.SessionCreateParams['ui_mode'],
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: args.monatCent,
        recurring: { interval: 'month' },
        product_data: { name: 'Claimondo Netzwerkpartner (Monatsbeitrag)' },
      },
      quantity: 1,
    }],
    subscription_data: {
      metadata: meta,
      ...(args.setupCent > 0
        ? {
            add_invoice_items: [{
              price_data: {
                currency: 'eur',
                unit_amount: args.setupCent,
                product_data: { name: 'Claimondo Netzwerkpartner — einmalige Einrichtungsgebühr' },
              },
              quantity: 1,
            }],
          }
        : {}),
    } as Stripe.Checkout.SessionCreateParams['subscription_data'],
    metadata: meta,
    return_url: args.returnUrl,
  }
  return params
}

export async function createNetzwerkAboCheckoutSession(
  svId: string,
): Promise<{ ok: true; clientSecret: string; sessionId: string } | { ok: false; error: string }> {
  try {
    const preise = await ladeNetzwerkPreise()
    const customerId = await getOrCreateStripeCustomer(svId)
    const params = buildNetzwerkAboCheckoutParams({
      customerId, svId, monatCent: preise.monatCent, setupCent: preise.setupCent,
      returnUrl: `${APP_URL}/gutachter/einstellungen?netzwerk_abo=success&session_id={CHECKOUT_SESSION_ID}`,
    })
    const session = await stripe.checkout.sessions.create(params)
    if (!session.client_secret) return { ok: false, error: 'Stripe lieferte keinen client_secret' }
    return { ok: true, clientSecret: session.client_secret, sessionId: session.id }
  } catch (err) {
    console.error('[netzwerk-abo-checkout]', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Checkout fehlgeschlagen' }
  }
}

/** Self-Service Abo-Management (Kuendigung/Zahlmethode) via Stripe Customer Portal. */
export async function createNetzwerkAboPortalSession(
  svId: string, returnUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const db = createAdminClient()
    const { data: sv } = await db.from('sachverstaendige').select('stripe_customer_id').eq('id', svId).single()
    if (!sv?.stripe_customer_id) return { ok: false, error: 'Kein Stripe-Kunde hinterlegt' }
    const portal = await stripe.billingPortal.sessions.create({
      customer: sv.stripe_customer_id, return_url: returnUrl,
    })
    return { ok: true, url: portal.url }
  } catch (err) {
    console.error('[netzwerk-abo-portal]', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Portal-Session fehlgeschlagen' }
  }
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/stripe/__tests__/netzwerk-abo-checkout.test.ts` → PASS. Falls die installierten `stripe@22`-Types `add_invoice_items[].price_data` **nicht** listen (analog dem bereits genutzten `ui_mode`-Cast): denselben `as unknown as …`-Cast auf das `add_invoice_items`-Literal setzen — die API akzeptiert `price_data` dort; **nicht** auf pre-erstellte `price_`-IDs ausweichen (verletzt „keine hardcoded IDs").

- [ ] **Schritt 5: Commit** — `git add src/lib/stripe/netzwerk-abo-checkout.ts src/lib/stripe/__tests__ && git commit -m "feat(netzwerk): subscription-checkout mit setup-fee als first-invoice-item + customer-portal (P5 T3)"`.

---

## Task 4: Webhook — Reducer `deriveAboStatusFromStripe` + `applyNetzwerkAboEvent` + 4 Event-Handler

**Files:**
- Create: `src/lib/netzwerk/abo-webhook.ts`
- Test: `src/lib/netzwerk/__tests__/abo-webhook.test.ts`
- Modify: `src/app/api/stripe/webhook/route.ts`

**Interfaces:**
- Consumes: `sv_netzwerk_abonnements` (P0, service-role-write), `sachverstaendige.stripe_customer_id`, `stripe.subscriptions.retrieve`, `istAktivesAbo`-Semantik (P0).
- Produces:
  - `type AboStatus = 'inaktiv'|'aktiv'|'ueberfaellig'|'gekuendigt'|'comped'`.
  - `deriveAboStatusFromStripe(eventType: string, subStatus?: string | null): AboStatus | null` (**pure**, getestet; `null` = No-op-Event).
  - `applyNetzwerkAboEvent(db: SupabaseClient, event: StripeEventLike): Promise<{ acted: boolean; svId: string | null }>` — resolved sv, upsert Abo-Row (service-role), mint Setup-Rechnung (T5) bei `billing_reason='subscription_create'`.

- [ ] **Schritt 1: Failing Test schreiben** (pure Reducer — der kritische Logikkern)
```ts
import { describe, it, expect } from 'vitest'
import { deriveAboStatusFromStripe } from '../abo-webhook'

describe('deriveAboStatusFromStripe', () => {
  it('checkout.session.completed + invoice.payment_succeeded => aktiv', () => {
    expect(deriveAboStatusFromStripe('checkout.session.completed')).toBe('aktiv')
    expect(deriveAboStatusFromStripe('invoice.payment_succeeded')).toBe('aktiv')
  })
  it('invoice.payment_failed => ueberfaellig', () => {
    expect(deriveAboStatusFromStripe('invoice.payment_failed')).toBe('ueberfaellig')
  })
  it('customer.subscription.deleted => gekuendigt', () => {
    expect(deriveAboStatusFromStripe('customer.subscription.deleted')).toBe('gekuendigt')
  })
  it('subscription.updated mappt den Stripe-Sub-Status', () => {
    // cancel_at_period_end laesst subStatus=active -> Boost bleibt bis Perioden-Ende (aktiv),
    // erst customer.subscription.deleted (Perioden-Ende) => gekuendigt.
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'active')).toBe('aktiv')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'trialing')).toBe('aktiv')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'past_due')).toBe('ueberfaellig')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'unpaid')).toBe('ueberfaellig')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'canceled')).toBe('gekuendigt')
  })
  it('unbekannt / irrelevant => null (No-op)', () => {
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'incomplete')).toBeNull()
    expect(deriveAboStatusFromStripe('charge.refunded')).toBeNull()
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/abo-webhook.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/netzwerk/abo-webhook.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type AboStatus = 'inaktiv' | 'aktiv' | 'ueberfaellig' | 'gekuendigt' | 'comped'

type StripeEventLike = {
  type: string
  data: { object: Record<string, unknown> }
}

/**
 * Reine Ableitung Stripe-Event -> Abo-Status. null = irrelevant/No-op.
 * WICHTIG: cancel_at_period_end haelt den Sub Stripe-'active' bis Perioden-Ende
 * -> wir bleiben 'aktiv' (Boost bleibt); erst 'customer.subscription.deleted'
 * (Perioden-Ende) setzt 'gekuendigt'. Das deckt Spec 2 §7.2 ("wirkt zum
 * Perioden-Ende") ohne einen 'gekuendigt-aber-noch-gueltig'-Sonderfall ab und
 * ist konsistent mit P0 istAktivesAbo (gekuendigt => false, unabhaengig gueltig_bis).
 */
export function deriveAboStatusFromStripe(eventType: string, subStatus?: string | null): AboStatus | null {
  switch (eventType) {
    case 'checkout.session.completed':
    case 'invoice.payment_succeeded':
      return 'aktiv'
    case 'invoice.payment_failed':
      return 'ueberfaellig'
    case 'customer.subscription.deleted':
      return 'gekuendigt'
    case 'customer.subscription.updated':
      switch (subStatus) {
        case 'active':
        case 'trialing':
          return 'aktiv'
        case 'past_due':
        case 'unpaid':
          return 'ueberfaellig'
        case 'canceled':
        case 'incomplete_expired':
          return 'gekuendigt'
        default:
          return null
      }
    default:
      return null
  }
}

/** Resolved die sv_id aus subscription-metadata ODER Fallback ueber stripe_customer_id/subscription_id. */
async function resolveSvId(
  db: SupabaseClient, obj: Record<string, unknown>,
): Promise<{ svId: string | null; subscriptionId: string | null }> {
  const meta = (obj.metadata ?? {}) as Record<string, string>
  const subscriptionId =
    typeof obj.subscription === 'string' ? obj.subscription
    : obj.object === 'subscription' && typeof obj.id === 'string' ? obj.id
    : null
  if (meta.sv_id) return { svId: meta.sv_id, subscriptionId }
  // Fallback A: bestehende Abo-Row per subscription_id.
  if (subscriptionId) {
    const { data } = await db.from('sv_netzwerk_abonnements')
      .select('sv_id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
    if (data?.sv_id) return { svId: data.sv_id, subscriptionId }
  }
  // Fallback B: ueber den Stripe-Customer.
  const customerId = typeof obj.customer === 'string' ? obj.customer : null
  if (customerId) {
    const { data } = await db.from('sachverstaendige')
      .select('id').eq('stripe_customer_id', customerId).maybeSingle()
    if (data?.id) return { svId: data.id, subscriptionId }
  }
  return { svId: null, subscriptionId }
}

/**
 * Wendet ein Subscription-/Invoice-Event auf die Abo-Row an (service-role, K1).
 * Idempotent: upsert onConflict sv_id. Setzt gueltig_bis = subscription.current_period_end.
 */
export async function applyNetzwerkAboEvent(
  db: SupabaseClient, event: StripeEventLike,
): Promise<{ acted: boolean; svId: string | null }> {
  const obj = event.data.object
  const subStatus = typeof obj.status === 'string' ? obj.status : null
  const neuStatus = deriveAboStatusFromStripe(event.type, subStatus)
  if (!neuStatus) return { acted: false, svId: null }

  const { svId, subscriptionId } = await resolveSvId(db, obj)
  if (!svId) { console.error('[abo-webhook] sv_id unaufloesbar', event.type); return { acted: false, svId: null } }

  // gueltig_bis aus der Subscription (ein retrieve, kein Hot-Path).
  let gueltigBis: string | null = null
  let subId = subscriptionId
  try {
    if (!subId && typeof obj.subscription === 'string') subId = obj.subscription
    if (subId) {
      const { stripe } = await import('@/lib/stripe/client')
      const sub = await stripe.subscriptions.retrieve(subId)
      // current_period_end lag in aelteren API-Versionen top-level (stripe@22-Default),
      // in neueren wanderte es auf die items. Robust beide lesen; tsc/Build zeigt, welcher
      // Zugriff die installierten Types haben (dann den anderen Cast entfernen).
      const cpe = (sub.current_period_end as number | undefined)
        ?? ((sub as { items?: { data?: Array<{ current_period_end?: number }> } }).items?.data?.[0]?.current_period_end)
      if (cpe) gueltigBis = new Date(cpe * 1000).toISOString()
    }
  } catch (err) { console.error('[abo-webhook] subscription retrieve', err) }

  // K3: paket NIE anfassen. Nur die Abo-Row.
  const row: Record<string, unknown> = {
    sv_id: svId,
    status: neuStatus,
    stripe_subscription_id: subId,
    aktualisiert_am: new Date().toISOString(),
  }
  if (gueltigBis) row.gueltig_bis = gueltigBis
  const { error } = await db.from('sv_netzwerk_abonnements').upsert(row, { onConflict: 'sv_id' })
  if (error) { console.error('[abo-webhook] upsert', error.message); return { acted: false, svId } }

  // Setup-Fee-§14-Rechnung nur bei der ERSTEN Rechnung (subscription_create) — T5.
  if (event.type === 'invoice.payment_succeeded' && obj.billing_reason === 'subscription_create') {
    try {
      const { mintNetzwerkEinrichtungsRechnung } = await import('@/lib/netzwerk/abo-rechnung')
      await mintNetzwerkEinrichtungsRechnung(svId)
    } catch (err) { console.error('[abo-webhook] setup-rechnung', err) }
  }
  return { acted: true, svId }
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/abo-webhook.test.ts` → PASS.

- [ ] **Schritt 5: In `route.ts` verdrahten** — im bestehenden `switch (event.type)` vier `case`s ergänzen (die Idempotenz/`stripe_events`-Logik oben bleibt unverändert; `db` ist der vorhandene `createAdminClient()`):
```ts
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const { applyNetzwerkAboEvent } = await import('@/lib/netzwerk/abo-webhook')
        await applyNetzwerkAboEvent(db, event)
        break
      }
```
Und im bestehenden `case 'checkout.session.completed'` einen `netzwerk_abo`-Zweig **vor** dem `break` ergänzen (analog den anderen `meta.typ`-Zweigen):
```ts
        if (meta.typ === 'netzwerk_abo' && meta.sv_id) {
          const { applyNetzwerkAboEvent } = await import('@/lib/netzwerk/abo-webhook')
          await applyNetzwerkAboEvent(db, event)
          break
        }
```
**Hinweis:** `payment_intent.succeeded` bleibt unberührt (Einzugs-PIs); die Subscription-Zahlungen kommen als `invoice.*`. `invoice.payment_succeeded` existiert im Switch noch nicht — der neue `case` ist additiv (kein bestehender Handler wird verändert).

- [ ] **Schritt 6: Regressions-Check** — `git grep -n "case 'invoice.payment_succeeded'" src/app/api/stripe/webhook/route.ts` = genau 1 Treffer; `npx tsc --noEmit` grün (mit `NODE_OPTIONS=--max-old-space-size=8192`).

- [ ] **Schritt 7: Commit** — `git add src/lib/netzwerk/abo-webhook.ts src/lib/netzwerk/__tests__ src/app/api/stripe/webhook/route.ts && git commit -m "feat(netzwerk): stripe subscription/invoice webhook -> abo-row (service-role) (P5 T4)"`.

---

## Task 5: Setup-Fee §14-DB-Rechnung (`netzwerk_einrichtung`) — DB-getriebener Config-Pfad

**Files:**
- Modify: `src/lib/billing/create-onboarding-rechnung.ts`, `src/lib/pdf/onboarding-rechnung.tsx`
- Create: `src/lib/netzwerk/abo-rechnung.ts`, `src/lib/netzwerk/__tests__/abo-rechnung.test.ts`

**Interfaces:**
- Consumes: `createOnboardingRechnung` (bestehend, DB-getrieben via `createAbrechnung`+`getAktuelleRechnungsKonfig` — **NICHT** die Legacy-PDF-Generatoren mit hardcoded Rechnungssteller, K14), `ladeNetzwerkPreise` (T2), `sachverstaendige.stripe_customer_id`.
- Produces: `mintNetzwerkEinrichtungsRechnung(svId: string): Promise<{ ok: boolean; error?: string }>` (idempotent — nutzt den bestehenden Unique-Index-Schutz gegen Doppel-Ausstellung). Konsumiert von T4.

- [ ] **Schritt 1: `typ`-Union erweitern (Test-freier Typ-Change zuerst)** — in `create-onboarding-rechnung.ts` `OnboardingRechnungContext.typ` und in `onboarding-rechnung.tsx` `OnboardingRechnungData.typ` jeweils `| 'netzwerk_einrichtung'` ergänzen.

- [ ] **Schritt 2: PDF-`beschreibung`-Zweig** — in `onboarding-rechnung.tsx` `OnboardingRechnungPDF` die `beschreibung`-Ableitung verzweigen (Umlaute Pflicht):
```tsx
  const beschreibung =
    data.typ === 'netzwerk_einrichtung'
      ? 'Netzwerkpartner — einmalige Einrichtungsgebühr (§4 Kooperationsvertrag)'
      : `Onboarding-Anzahlung Paket ${paket} — Werbebudget-Vorauszahlung für ${data.kontingent} Fälle`
```
(Der Rest des PDFs — Absender/Zahlungsempfänger/USt aus `konfig` — bleibt: das IST der config-getriebene §14-Pfad.)

- [ ] **Schritt 3: Failing Test schreiben** (`abo-rechnung.ts` — Kontext-Bau)
```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { profile_id: 'p1' } }) }) }) }),
}) }))
vi.mock('@/lib/billing/netzwerk-preise', () => ({ ladeNetzwerkPreise: async () => ({ monatCent: 2999, setupCent: 3990, konfigId: 'k', konfigVersion: 1 }) }))
const createOnboardingRechnung = vi.fn(async () => ({ success: true, rechnung_id: 'r', rechnungs_nr: 'CM-ONB-2026-00001', pdf_buffer: Buffer.from(''), brutto_cent: 4748 }))
vi.mock('@/lib/billing/create-onboarding-rechnung', () => ({ createOnboardingRechnung }))
import { mintNetzwerkEinrichtungsRechnung } from '../abo-rechnung'

describe('mintNetzwerkEinrichtungsRechnung', () => {
  it('ruft createOnboardingRechnung mit typ=netzwerk_einrichtung + setup-netto aus Config', async () => {
    const res = await mintNetzwerkEinrichtungsRechnung('sv-1')
    expect(res.ok).toBe(true)
    const ctx = createOnboardingRechnung.mock.calls[0][0]
    expect(ctx.typ).toBe('netzwerk_einrichtung')
    expect(ctx.sv_id).toBe('sv-1')
    expect(ctx.netto_euro).toBe(39.9)  // 3990 cent
    expect(ctx.paket).toBeNull()
    expect(ctx.kontingent).toBe(0)
  })
  it('setupCent=0 => keine Rechnung (Waiver)', async () => {
    // via re-mock siehe Testdatei-Kommentar; erwartet ok:true, kein createOnboardingRechnung-Call
  })
})
```

- [ ] **Schritt 4: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/abo-rechnung.test.ts` → FAIL.

- [ ] **Schritt 5: Implementieren**
```ts
// src/lib/netzwerk/abo-rechnung.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeNetzwerkPreise } from '@/lib/billing/netzwerk-preise'
import { createOnboardingRechnung } from '@/lib/billing/create-onboarding-rechnung'

/**
 * Mintet die §14-Rechnung fuer die einmalige Netzwerkpartner-Einrichtungsgebuehr
 * ueber den DB-getriebenen Config-Pfad (createOnboardingRechnung -> createAbrechnung
 * -> getAktuelleRechnungsKonfig; honoriert rechnungssteller). NIE ein Legacy-PDF-
 * Generator (K14). Betrag = netzwerk_setup_cent aus Config. Idempotenz erbt der
 * bestehende Unique-Index-Schutz von createOnboardingRechnung.
 */
export async function mintNetzwerkEinrichtungsRechnung(svId: string): Promise<{ ok: boolean; error?: string }> {
  const preise = await ladeNetzwerkPreise()
  if (preise.setupCent <= 0) return { ok: true }  // Waiver: keine Einrichtungsgebuehr
  const res = await createOnboardingRechnung({
    typ: 'netzwerk_einrichtung',
    sv_id: svId,
    netto_euro: preise.setupCent / 100,
    paket: null,
    kontingent: 0,
    bezahlt_am: new Date(),
  })
  if (!res.success) return { ok: false, error: res.error }
  // Beleg-Mail: bestehendes send-onboarding-rechnung-email reusen (try/catch -> non-fatal).
  try {
    const db = createAdminClient()
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', svId).single()
    const { data: p } = sv?.profile_id
      ? await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
      : { data: null }
    if (p?.email) {
      const { sendOnboardingRechnungEmail } = await import('@/lib/billing/send-onboarding-rechnung-email')
      await sendOnboardingRechnungEmail({
        rechnung_id: res.rechnung_id, rechnungs_nr: res.rechnungs_nr, rechnungs_pdf: res.pdf_buffer,
        empfaenger_email: p.email, vorname: p.vorname ?? null, typ: 'solo',
        paket: null, brutto_cent: res.brutto_cent, sv_id: svId,
      })
    }
  } catch (err) { console.error('[abo-rechnung] mail', err) }
  return { ok: true }
}
```
(Falls `sendOnboardingRechnungEmail`s `typ`-Param `'netzwerk_einrichtung'` nicht kennt: `typ:'solo'` genügt für die Mail-Hülle — der Beleg-Inhalt kommt aus dem PDF; ODER die Mail-Signatur analog erweitern.)

- [ ] **Schritt 6: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/abo-rechnung.test.ts` → PASS.

- [ ] **Schritt 7: Scope-Notiz** — im Commit-Body dokumentieren: **P5 mintet die §14-DB-Rechnung nur für die einmalige Einrichtungsgebühr** (`netzwerk_einrichtung`, Spec §7.1). Die **wiederkehrenden Monatsrechnungen** dokumentiert Stripe nativ (Customer-Portal, T9). Nummerierte monatliche §14-DB-PDFs = **bewusst deferred** (Aaron-Entscheid; kein K-Punkt fordert sie).

- [ ] **Schritt 8: Commit** — `git add src/lib/billing/create-onboarding-rechnung.ts src/lib/pdf/onboarding-rechnung.tsx src/lib/netzwerk/abo-rechnung.ts src/lib/netzwerk/__tests__/abo-rechnung.test.ts && git commit -m "feat(netzwerk): §14-setup-fee-rechnung ueber DB-config-pfad (P5 T5)"`.

---

## Task 6: Dunning-Cron — Route + pg_cron-Arm (Vault) + Deaktivierung/Cancel

**Files:**
- Create: `src/app/api/cron/netzwerk-abo-dunning/route.ts`, `supabase/migrations/<V>_arm_netzwerk_abo_dunning_cron.sql`

**Interfaces:**
- Consumes: `assertCronAuth` (bestehend), `sv_netzwerk_abonnements` (status='ueberfaellig'), `sv_payment_reminders` (Reminder-Idempotenz — **kein** CHECK auf `reminder_typ`, frisch verifiziert → keine Enum-DDL nötig), `stripe.subscriptions.cancel`, `createLinkedTask`.
- Produces: gestaffelte Dunning-Reminder + finaler Cancel (`status='gekuendigt'` + Stripe-Sub-Cancel) nach Karenz. pg_cron-Job (nächste freie jobid = 25) `0 8 * * *`.

- [ ] **Schritt 1: Route implementieren** (Muster `sv-payment-reminders/route.ts`)
```ts
// src/app/api/cron/netzwerk-abo-dunning/route.ts
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const REMINDER_STUFEN = [
  { tage: 1, typ: 'netzwerk_abo_ueberfaellig_1d' },
  { tage: 5, typ: 'netzwerk_abo_ueberfaellig_5d' },
  { tage: 10, typ: 'netzwerk_abo_ueberfaellig_10d' },
] as const
const KARENZ_TAGE = 14  // danach: Cancel + gekuendigt

export async function GET(request: Request) {
  if (!assertCronAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()

  const { data: abos } = await db.from('sv_netzwerk_abonnements')
    .select('sv_id, status, gueltig_bis, stripe_subscription_id, aktualisiert_am')
    .eq('status', 'ueberfaellig')
  if (!abos?.length) return NextResponse.json({ ok: true, count: 0 })

  let acted = 0
  for (const abo of abos) {
    // Tage seit ueberfaellig (aktualisiert_am wurde vom payment_failed-Webhook gesetzt).
    const seit = new Date(abo.aktualisiert_am as string)
    const tage = Math.floor((Date.now() - seit.getTime()) / 86_400_000)

    for (const stufe of REMINDER_STUFEN) {
      if (tage < stufe.tage) continue
      const { data: existing } = await db.from('sv_payment_reminders')
        .select('id').eq('sv_id', abo.sv_id).eq('reminder_typ', stufe.typ).limit(1).maybeSingle()
      if (existing) continue
      // Mail (try/catch, non-fatal — AB4 Custom-SMTP).
      try {
        const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', abo.sv_id).single()
        const { data: p } = sv?.profile_id
          ? await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single() : { data: null }
        if (p?.email) {
          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('sv_monatsabrechnung', {
            email: p.email, vorname: p.vorname ?? 'Partner',
            subject: 'Zahlung Netzwerkpartner-Abo ausstehend',
            html: `<p>Hallo ${p.vorname ?? 'Partner'},</p><p>deine Netzwerkpartner-Zahlung ist noch offen. Bitte aktualisiere deine Zahlungsmethode im Portal, damit dein Netzwerk-Vorteil aktiv bleibt.</p>`,
          })
        }
      } catch (err) { console.error('[netzwerk-dunning] mail', err) }
      await db.from('sv_payment_reminders').insert({ sv_id: abo.sv_id, reminder_typ: stufe.typ })
      acted++
    }

    // Karenz abgelaufen -> Stripe-Sub canceln + status=gekuendigt (der subscription.deleted-
    // Webhook bestaetigt idempotent; hier ist der aktive Schnitt).
    if (tage >= KARENZ_TAGE && abo.stripe_subscription_id) {
      try {
        const { stripe } = await import('@/lib/stripe/client')
        await stripe.subscriptions.cancel(abo.stripe_subscription_id as string)
      } catch (err) { console.error('[netzwerk-dunning] cancel', err) }
      await db.from('sv_netzwerk_abonnements')
        .update({ status: 'gekuendigt', aktualisiert_am: new Date().toISOString() })
        .eq('sv_id', abo.sv_id)
      acted++
    }
  }
  return NextResponse.json({ ok: true, count: acted })
}
```

- [ ] **Schritt 2: pg_cron-Arm-Migration** (`apply_migration`, name `arm_netzwerk_abo_dunning_cron`; Muster `20260719132941_arm_release_provisionen_cron.sql`, **Vault-`cron_secret` reuse**, Preview-Replay-Guard Pflicht):
```sql
CREATE OR REPLACE FUNCTION public.cron_trigger_netzwerk_abo_dunning()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_secret TEXT; v_response_id BIGINT;
  v_url TEXT := 'https://app.claimondo.de/api/cron/netzwerk-abo-dunning';
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    PERFORM public.log_cron_job_run('netzwerk_abo_dunning', 'success', 0, 'cron_secret fehlt im Vault - dormant bis seed');
    RETURN;
  END IF;
  SELECT net.http_get(url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'x-source', 'pg_cron')) INTO v_response_id;
  PERFORM public.log_cron_job_run('netzwerk_abo_dunning', 'success', NULL, NULL, jsonb_build_object('response_id', v_response_id));
EXCEPTION WHEN OTHERS THEN PERFORM public.log_cron_job_run('netzwerk_abo_dunning', 'error', NULL, SQLERRM);
END $fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'netzwerk_abo_dunning') THEN
      PERFORM cron.unschedule('netzwerk_abo_dunning');
    END IF;
    PERFORM cron.schedule('netzwerk_abo_dunning', '0 8 * * *', $cron$SELECT public.cron_trigger_netzwerk_abo_dunning()$cron$);
  ELSE
    RAISE NOTICE 'pg_cron nicht installiert - Cron netzwerk_abo_dunning uebersprungen (Preview/lokal)';
  END IF;
END $$;
```

- [ ] **Schritt 3: Version ablesen + File committen** (Dateiname == getrackte Version).

- [ ] **Schritt 4: Verifizieren** (`execute_sql` READ):
```sql
select jobid, jobname, schedule from cron.job where jobname='netzwerk_abo_dunning';
```
Erwartet: 1 Zeile, `0 8 * * *`. (Der `cron_secret` ist bereits im Vault geseedet — `release_provisionen` nutzt ihn; kein neuer Seed nötig.)

- [ ] **Schritt 5: Commit** — `git add src/app/api/cron/netzwerk-abo-dunning supabase/migrations && git commit -m "feat(netzwerk): dunning-cron (pg_cron+vault) + reminder/cancel (P5 T6)"`.

---

## Task 7: Grandfather-Backfill — aktive SVs → `sv_netzwerk_abonnements` status='comped'

**⚠ Aaron-Blocker AB5:** appliziert Prod-Daten auf der shared DB → **erst nach Go-Live-Freigabe** applizieren. Datei + Verifikation vorbereiten; Merge-/Apply-Timing im Marker an die Go-Live-Session übergeben.

**Files:**
- Create: `supabase/migrations/<V>_netzwerk_abo_comped_backfill.sql`

**Interfaces:**
- Produces: je aktivem SV eine `sv_netzwerk_abonnements`-Row `status='comped'` (idempotent). **`paket` unangetastet** (K3) — Bestand behält sein `paket`-Fulfillment (§13b).

- [ ] **Schritt 1: Zielmenge zählen** (`execute_sql` READ, VOR Apply):
```sql
select count(*) from public.sachverstaendige where ist_aktiv = true and geloescht_am is null;
select count(*) from public.sv_netzwerk_abonnements;  -- Ausgangs-Bestand (P0: 0)
```

- [ ] **Schritt 2: Backfill-Migration** (`apply_migration`, name `netzwerk_abo_comped_backfill`):
```sql
-- Grandfather: alle aktiven, nicht-geloeschten SVs werden comped Netzwerkpartner.
-- comped = dauerhaft aktiv ohne gueltig_bis (P0 istAktivesAbo: comped => true).
-- Idempotent: ON CONFLICT (sv_id) DO NOTHING (P0 sv_netzwerk_abo_sv_uniq).
-- K3: paket wird NICHT angefasst.
insert into public.sv_netzwerk_abonnements (sv_id, status)
select id, 'comped'
  from public.sachverstaendige
 where ist_aktiv = true and geloescht_am is null
on conflict (sv_id) do nothing;
```

- [ ] **Schritt 3: Version ablesen + File committen** (Dateiname == getrackte Version).

- [ ] **Schritt 4: Verifizieren** (`execute_sql` READ):
```sql
select status, count(*) from public.sv_netzwerk_abonnements group by status;         -- comped == Zielmenge aus Schritt 1
select count(*) from public.sachverstaendige s
  join public.sv_netzwerk_abonnements a on a.sv_id = s.id
 where a.status='comped' and s.paket is distinct from 'netzwerk';                    -- paket unveraendert (0 auf 'netzwerk')
```
Erwartet: `comped`-Count == aktive SVs; **kein** `paket='netzwerk'` (K3 gehalten).

- [ ] **Schritt 5: Commit** — `git add supabase/migrations && git commit -m "feat(netzwerk): grandfather-backfill comped fuer aktive SVs (P5 T7) [apply erst nach AB5]"`.

---

## Task 8: Onboarding Abo-Ask (skippbar) — `WillkommenClient` + `SvBasicOnboardingClient`

**Files:**
- Create: `src/components/netzwerk/NetzwerkpartnerCta.tsx`
- Modify: `src/app/gutachter/willkommen/WillkommenClient.tsx`, `src/app/gutachter/willkommen/SvBasicOnboardingClient.tsx`

**Interfaces:**
- Consumes: `createNetzwerkAboCheckoutSession` (T3, via Server-Action aus T9), `ladeNetzwerkPreise` (T2, server-seitig für die Preis-Anzeige).
- Produces: `NetzwerkpartnerCta` (geteilte Sektion: Preis-Anzeige aus Config, „Netzwerkpartner werden"-Button → embedded Checkout, **„Später"-Skip**). Der Skip lässt den SV Free/Basic (kein Write).

- [ ] **Schritt 1: `NetzwerkpartnerCta`-Komponente** — Primitives (`Button`/`Card` aus `@/components/primitives`, kein handgerolltes Markup — Component-Set-Ratchet), Umlaute Pflicht. Props: `{ monatEuro: string; setupEuro: string; onUpgrade: () => void; onSkip: () => void; loading?: boolean }`. Zeigt Nutzen („Deine Partner-Werkstätten erscheinen oben im Netzwerk deiner Kunden"), Monats- + Einrichtungspreis (aus Config, nie hardcoded), zwei Aktionen.

- [ ] **Schritt 2: In `WillkommenClient` einhängen** — nach dem bestehenden letzten Onboarding-Step einen optionalen Step `netzwerk_abo` einfügen; Preise server-seitig via `ladeNetzwerkPreise()` in `willkommen/page.tsx` laden und als Props durchreichen (Client-Component bekommt formatierte Strings). Upgrade → mountet `<EmbeddedCheckout>` mit dem `clientSecret` aus der Server-Action (T9). Skip → schließt das Onboarding unverändert ab.

- [ ] **Schritt 3: In `SvBasicOnboardingClient` einhängen** — dieselbe `NetzwerkpartnerCta` (DRY) als optionaler Abschluss-Ask für Basic-SVs.

- [ ] **Schritt 4: UI-Erreichbarkeit prüfen** — Trigger sichtbar für die richtige Rolle (SV-Onboarding), Skip immer möglich. `npm run build` grün (Route-Change → voller Build, nicht nur tsc).

- [ ] **Schritt 5: Commit** — `git add src/components/netzwerk/NetzwerkpartnerCta.tsx src/app/gutachter/willkommen && git commit -m "feat(netzwerk): skippbarer abo-ask im SV-onboarding (P5 T8)"`.

---

## Task 9: In-App-Upgrade + Abo-Management (reuse SV-Konto) + Server-Actions

**Files:**
- Create: `src/app/gutachter/einstellungen/netzwerk-abo/actions.ts`
- Modify: `src/app/gutachter/einstellungen/_components/EinstellungenSettings.tsx`, `src/app/gutachter/einstellungen/page.tsx`

**Interfaces:**
- Consumes: `createNetzwerkAboCheckoutSession` / `createNetzwerkAboPortalSession` (T3), `sv_netzwerk_abonnements` (Status-Read), `istAktivesAbo` (P0, für die Anzeige).
- Produces:
  - Server-Actions (`'use server'`): `starteNetzwerkAboCheckout(): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }>`; `oeffneAboPortal(): Promise<{ ok: true; url: string } | { ok: false; error: string }>` (Auth-Guard: der eingeloggte SV; **kein** authenticated-Write auf die Abo-Row — nur Stripe-Aufrufe).
  - Einstellungen-Sektion „Netzwerkpartner": Free → Upgrade-CTA (`NetzwerkpartnerCta`, embedded Checkout); zahlend → Status (`aktiv`/`ueberfaellig`/`gekuendigt`, nächstes Abbuchungsdatum aus `gueltig_bis`) + „Abo verwalten" → Customer-Portal.

- [ ] **Schritt 1: Server-Actions** — Result-Objekt-Pattern (kein throw), Auth-Guard **exakt** nach dem Bestandsmuster von `gutachter/einstellungen/verfuegbarkeit/actions.ts` (`createClient()` aus `@/lib/supabase/server` → `auth.getUser()` → SV **explizit** über `profile_id = user.id` auflösen, nie einen client-gelieferten `sv_id` vertrauen). Es gibt **keinen** `getEingeloggterSvId`-Helper (verifiziert) → inline auflösen:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createNetzwerkAboCheckoutSession, createNetzwerkAboPortalSession } from '@/lib/stripe/netzwerk-abo-checkout'

async function eingeloggterSvId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: sv } = await supabase.from('sachverstaendige').select('id').eq('profile_id', user.id).maybeSingle()
  return sv?.id ?? null
}

export async function starteNetzwerkAboCheckout(): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const svId = await eingeloggterSvId()
  if (!svId) return { ok: false, error: 'Nicht angemeldet' }
  const res = await createNetzwerkAboCheckoutSession(svId)
  return res.ok ? { ok: true, clientSecret: res.clientSecret } : { ok: false, error: res.error }
}

export async function oeffneAboPortal(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const svId = await eingeloggterSvId()
  if (!svId) return { ok: false, error: 'Nicht angemeldet' }
  return createNetzwerkAboPortalSession(svId, 'https://app.claimondo.de/gutachter/einstellungen')
}
```
(`eingeloggterSvId` ist eine nicht-exportierte async-Helper im selben `'use server'`-File — AAR-664: aus `'use server'`-Files nur async Funktionen exportieren.)

- [ ] **Schritt 2: Status server-seitig laden** — in `einstellungen/page.tsx` die Abo-Row des SV lesen (`sv_netzwerk_abonnements` where `sv_id`), `istAktivesAbo` anwenden, formatierte Props (Status-Label via Status-Registry `@/lib/status`, **keine** inline Farb-Map — Status-Registry-Ratchet) an die Client-Sektion geben.

- [ ] **Schritt 3: Sektion in `EinstellungenSettings.tsx`** — `NetzwerkpartnerCta` (Free) bzw. Status-Card (zahlend) einhängen; `return_url`-Query `?netzwerk_abo=success` zeigt einen Erfolgs-Toast. Umlaute Pflicht.

- [ ] **Schritt 4: UI-Erreichbarkeit + Build** — Sektion für SV sichtbar; alte Bookmarks intakt; `npm run build` grün.

- [ ] **Schritt 5: Commit** — `git add src/app/gutachter/einstellungen && git commit -m "feat(netzwerk): in-app-upgrade + abo-management via customer-portal (P5 T9)"`.

---

## Task 10: Registrierung-Umbau (WS F) — DAT-Audit (minimal) + Netzwerkpartner-Framing

**Files:**
- Modify: `src/app/sv/registrieren/SvRegistrierenClient.tsx`

**Interfaces:**
- Consumes: `BASIC_PAKET`/`PAKETE` (`@/lib/pakete`), `getSvStatus` (`@/lib/sv-status`), bestehende Actions `registriereSvBasicNeu`/`beanspracheSvLead` (`@/lib/sv-basic/claim-actions`).
- Produces: DAT-Audit-Nachweis (kein Hard-Gate zu entfernen — frisch verifiziert: DAT-Nr. ist bereits optional, `hint`-only) + Netzwerkpartner-Framing im Paket-Picker.

- [ ] **Schritt 1: DAT-Audit (nur bestätigen, NICHT entfernen)** — `git grep -n "credDatPartner\|dat_partner\|DAT" src/lib/**/matching*.ts src/lib/**/projection*.ts src/app/sv/registrieren` ausführen; verifizieren:
  1. Die Registrierung blockt **nicht** ohne DAT-Nr. (bestätigt: `datNr` ist `optional`, Feld-`hint` only, `registriereSvBasicNeu` fordert es nicht).
  2. `credDatPartner`-Rang-Bonus + DAT-Badge bleiben **unangetastet** (die Task entfernt sie NICHT — nur das Gating-Narrativ ändert sich). Ergebnis im Commit-Body dokumentieren.

- [ ] **Schritt 2: Framing** — den `PaketPicker`-Kontext auf das Freemium-Modell (§13b) trimmen: „kostenlose Registrierung ODER direkt Netzwerkpartner". Konkret: der bestehende `paket !== 'basic'`-Hinweis („Vertrag + Anzahlung schließt du nach der Registrierung ab") um einen Satz ergänzen, dass der **Netzwerkpartner-Vorteil** (Boost) optional im Portal aktivierbar ist (verlinkt konzeptionell auf T8/T9; kein neuer Billing-Pfad hier — Registrierung bleibt frei/Basic-first, das Abo läuft über Onboarding/Einstellungen). Umlaute Pflicht.

- [ ] **Schritt 3: Verifizierungs-Freigabe (48h) unverändert** — bestätigen, dass die bestehende „Nach unserer Prüfung (innerhalb von 48 Stunden) schalten wir dein Profil frei"-Copy + der `wartet_auf_freigabe`-`getSvStatus`-Pfad **bleiben** (WS F: DAT-Gating raus, Verifizierungs-Freigabe bleibt). Kein Code-Change am Freigabe-Flow.

- [ ] **Schritt 4: Build + Commit** — `npm run build` grün; `git add src/app/sv/registrieren && git commit -m "feat(netzwerk): WS-F registrierung freemium-framing + DAT-audit (kein hard-gate, rang/badge behalten) (P5 T10)"`.

---

## Task 11: Ratchet-Grün-Abschluss + PR

**Files:** keine neuen (Verifikation + PR).

- [ ] **Schritt 1: Voller Gate-Durchlauf**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run build
npm run check:flag-drift -- --ratchet
npm run check:token-audit
npm run check:component-set -- --ratchet
npm run check:status-registry -- --ratchet
npm run check:knip -- --ratchet
npm run check:rls-policies -- --ratchet && npm run check:rls-grants
npm run check:vitest -- --ratchet
```
Erwartet: alle grün / 0-neu. Bei rotem `check:knip` (neue Files) → Konsumenten sind verdrahtet (Webhook/Route/UI) → sollte grün sein; sonst Boy-Scout klären, **nicht** Baseline aufblähen.

- [ ] **Schritt 2: 7-Punkte-Audit** je Commit dokumentieren (AGENTS.md). Besonders: **Redundanz** (Checkout/Idempotenz/Rechnung/Cron alle reused), **Inkonsistenz** (Result-Object statt throw; `revalidatePath` in Actions; Status-Registry statt inline Map; Umlaute), **Regression** (`route.ts`-Switch: bestehende Handler unverändert; `createOnboardingRechnung`-Bestandsaufrufer solo/buero/akademie unberührt).

- [ ] **Schritt 3: PR gegen `staging`** öffnen (`gh pr create --base staging`), Body mit: Aaron-Blocker-Checkliste (AB1–AB5), P0-Merge-Abhängigkeit, T7-Apply-Timing (nach AB5), Regel-4-Smoke-Plan (J8/J9, s. DoD), Scope-Notiz (monatliche §14-PDFs deferred). **Nicht selbst mergen.**

---

## Definition of Done (P5)

**Code/DB:**
- Migrationen appliziert + Files getrackt (Dateiname == getrackte Version, kein Twin-Drift); `database.types.ts` regeneriert + committed. `execute_sql`-Nachweis: Preis-Spalten + `netzwerk_einrichtung`-CHECK da; comped-Backfill == aktive SVs; **`paket` unverändert** (K3); Dunning-Cronjob gescheduled.
- vitest grün (`netzwerk-preise`, `netzwerk-abo-checkout`, `abo-webhook`, `abo-rechnung`); tsc + build grün; **alle Ratchets 0-neu**.
- Webhook: bestehende Handler unverändert; 4 neue Events + `netzwerk_abo`-Checkout-Zweig; Abo-Row ausschließlich service-role geschrieben; **kein** hardcoded `price_`/`prod_` (grep-Nachweis: `git grep -nE "price_[A-Za-z0-9]{6,}|prod_[A-Za-z0-9]{6,}" src/` = 0).

**Regel-4 Prod-Smoke — Journey J8/J9 (in diesem Plan definiert; K15-konform, NIE eine echte Charge):**
- **J8 — Free → Netzwerkpartner-Upgrade (comped-Pfad + Test-Mode):**
  1. **comped-Pfad (prod, ohne Geld):** Wegwerf-SV seeden (`scripts/smoke/throwaway-account.mjs`, `telefon=NULL`), via Admin/service-role eine `sv_netzwerk_abonnements`-Row `status='comped'` setzen → `istZahlenderNetzwerkPartner` = true → Netzwerkpartner-**Badge/Boost aktiv** (Read-Surface + Admin-JWT-Sim für Claim-Views, K15). Beweist Entitlement end-to-end **ohne** Stripe-Charge.
  2. **Checkout-UI (prod):** eingeloggter Wegwerf-SV → `/gutachter/einstellungen` → „Netzwerkpartner werden" → embedded Checkout **mountet** (client_secret da), Preise == Config. **Abbrechen vor Zahlung** (LIVE-Keys → keine echte Zahlung auslösen).
  3. **Webhook-Logik (Stripe Test-Mode, off-prod):** gegen einen **Test-Mode**-Endpoint `stripe trigger invoice.payment_succeeded` / `customer.subscription.deleted` (oder Test-Clock-Subscription) → `applyNetzwerkAboEvent` schreibt/aktualisiert die Abo-Row korrekt (`aktiv`/`gekuendigt`), Setup-§14-Rechnung wird bei `subscription_create` gemintet. Zusätzlich durch die `abo-webhook`-Unit-Fixtures abgesichert.
- **J9 — Dunning → Deaktivierung:** synthetisch `invoice.payment_failed` → Abo `ueberfaellig` → `istAktivesAbo`=false → **Boost/Badge aus**; Dunning-Cron (manuell getriggert, Test-Daten) erzeugt gestaffelte `sv_payment_reminders` + nach Karenz `status='gekuendigt'` + Stripe-Sub-Cancel. Reminder-Idempotenz (kein Doppel-Insert) verifiziert.
- **Ergebnis** (grün/rot + Assertions/Screenshots) im PR/Marker dokumentieren. Solange J8/J9 rot **oder** ein Aaron-Blocker (AB1–AB5) offen → Aufgabe **offen**; Smoke-Pflicht ggf. explizit an die Go-Live/Merge-Session übergeben.

**Koordination:**
- PR gegen `staging`, P0-Merge-abhängig, T7-Apply nach AB5, nicht selbst gemergt. UG-`rechnungssteller`-CHECK **nicht** erneut angefasst (bereits resolved).

---

## Self-Review (durchgeführt beim Schreiben)

**1. Spec-Coverage (Roadmap P5 + Task-Scope):**
- Stripe-Recurring + Setup-Fee beide via Stripe, Single-Subscription-Checkout mit Setup-Fee als Erst-Rechnungs-Item → **T3** (`buildNetzwerkAboCheckoutParams`, `add_invoice_items`). ✓
- Config-getriebene Preise, nie hardcoded `price_`/`prod_` → **T1** (Config-Spalten) + **T2** (Accessor) + **T3** (inline `price_data`). ✓
- K14 Live-Webhook += `invoice.payment_{succeeded,failed}` + `customer.subscription.{updated,deleted}` + Handler schreibt `sv_netzwerk_abonnements` (service-role) → **T4**; Live-Endpoint-Config = **AB1**. ✓
- Rechnungen über DB-getriebenen `rechnungs_konfiguration`-Pfad, nie Legacy-PDF → **T5** (`createOnboardingRechnung`→`getAktuelleRechnungsKonfig`, explizit). ✓
- Dunning-Cron via pg_cron + Vault (wie `release_provisionen`) → **T6** (Muster 1:1, `cron_secret` reuse, Replay-Guard). ✓
- UG-`rechnungssteller`-CHECK-Kollision → **frisch verifiziert RESOLVED**, T1 fasst nur `.typ` an. ✓
- `sv_onboarding_rechnungen.typ`-CHECK für `netzwerk_einrichtung` → **T1** (verifiziert: fehlte, wird ergänzt + Snapshot). ✓
- Grandfather-Backfill comped, `paket` nie überschreiben (K3) → **T7**. ✓
- Registrierung-Umbau (WS F): DAT-Gating raus (minimal, `credDatPartner`/Badge behalten), 48h-Freigabe bleibt → **T10**. ✓
- Onboarding-Abo-Ask (skippbar) + In-App-Upgrade (reuse SV-Konto) → **T8/T9**. ✓
- K15 Verifikations-/Aaron-Blocker (Wegwerf-Seed, kein Zahl-Smoke off-prod, Admin-JWT, live whsec, IBAN/USt, SMTP) → **DoD J8/J9 + AB1–AB5**. ✓
- K1 (derive-at-read, service-role-write) → T4 nutzt `createAdminClient`, kein authenticated-Write; Cancel-Semantik konsistent mit P0 `istAktivesAbo`. ✓

**2. Placeholder-Scan:** keine TBD/„handle edge cases" im Code — alle DDL/TS/Tests konkret. Die einzigen bewusst offenen Werte sind die **Preise** (Config-Row, AB2) und **§14-Stammdaten** (AB3) — beides reine Config-/Daten-Entscheide Aarons, kein Code-Placeholder; als Aaron-Blocker markiert.

**3. Typ-Konsistenz:** `NetzwerkPreise{monatCent,setupCent,konfigId,konfigVersion}` (T2) → `buildNetzwerkAboCheckoutParams` (T3) → `applyNetzwerkAboEvent`/`AboStatus` (T4) → `mintNetzwerkEinrichtungsRechnung` (T5). `AboStatus`-Enum identisch zum P0-CHECK (`inaktiv/aktiv/ueberfaellig/gekuendigt/comped`). Server-Action-Result durchgängig `{ ok; error? }`. `createOnboardingRechnung`-`typ`-Union in beiden Files (`.ts` + `.tsx`) gleich erweitert.

**4. Bewusste Scope-Grenzen (dokumentiert, nicht vergessen):**
- Monatliche §14-DB-PDFs = deferred (Stripe-native Invoices + Customer-Portal decken die laufende Dokumentation); nur die Setup-Fee bekommt eine CM-ONB-Nummer (Spec §7.1). 
- Werkstatt-Setup-Fee selbst (E7) = spätere Phase; `werkstatt_setup_cent` wird in T1 nur **angelegt**, nicht scharf.
- Boost/Badge-Verdrahtung selbst ist **P2** — P5 liefert nur den Entitlement-Zustand; J8 verifiziert den Boost über den comped-Pfad, sofern P2 bereits live ist (sonst nur die Abo-Row-Assertion).
