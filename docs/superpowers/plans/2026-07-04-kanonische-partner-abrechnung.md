# Kanonische Partner-Abrechnungs-Übersicht (P1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein admin-only Abrechnungs-Cockpit über alle Partner-Rollen (SV/Kanzlei/Makler/Werkstatt/Maik) — pro Partner + Aggregat, mit Geld-Aktionen und korrekter USt-Behandlung je Partner-Steuerstatus.

**Architecture:** Additive DB-View `v_partner_billing` normalisiert 8 Billing-Quellen in eine Zeilenform (Richtung forderung/auszahlung). Ein TS-Loader liest sie, ein kanonisches Action-Modul dispatcht Geld-Aktionen nach `quelle_tabelle` (wiederverwendet bestehende Actions), eine Shared-Component `PartnerBillingPanel` rendert zentral (`/admin/finance/partner-abrechnungen`) und eingebettet pro Rolle. USt auf Auszahlungen: `ist_kleinunternehmer`-abhängig, beim Auszahlen eingefroren.

**Tech Stack:** Next.js 16, Supabase (Postgres View + RLS), TypeScript, vitest, Tailwind v4 + `@/components/shared/DataTable` + `StatusBadge`.

**Spec:** `docs/superpowers/specs/2026-07-04-kanonische-partner-abrechnung-uebersicht-design.md`

## Global Constraints

- **Branch:** `kitta/kanonische-partner-abrechnung` (off staging). Nie auf main pushen (Regel 1). PR gegen `staging`.
- **DDL nur über Supabase-Plugin** `apply_migration` (Regel 2): apply → `list_migrations` (getrackte Version <V> ablesen) → File `supabase/migrations/<V>_<name>.sql` exakt nach <V> benennen → `execute_sql`-READ verifizieren. `execute_sql` nur READ. Migrationen sind **additiv** → dürfen VOR Code-Merge appliziert werden (Regel-3-Verbot gilt nur für DROPs).
- **Server-Actions liefern `{ ok: boolean; error?: string }`** (neue Files), nie `throw`. Bestehende `abrechnungen/actions.ts` liefern `{ success }` — beim Wrappen auf `{ ok }` mappen.
- **Frontend-Umlaute Pflicht** (ä/ö/ü/ß) in allen nutzersichtbaren Strings.
- **Komponenten-Set:** Buttons/Cards/Badges/Tabellen aus `primitives/*` bzw. `shared/*` (DataTable, StatusBadge) — kein handgerolltes Button/Card-Markup. Design-Tokens (`claimondo-*`, `rounded-ios-*`), keine Inline-Hex, keine raw Status-Scales.
- **Admin-Gate:** Jede Cockpit-Route mit Inline-Guard `profile.rolle === 'admin'` → `redirect`. Reads via `createAdminClient()` hinter dem Guard (etabliertes Muster makler/werkstatt/SV-Detail).
- **Gates vor jedem Commit:** `npx tsc --noEmit`; bei Routen/Actions `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `npm run check:knip -- --ratchet`; `npm run check:token-audit`; `npm run check:component-set -- --ratchet`; `npx vitest run <betroffene>`.

---

## File Structure

**Neu:**
- `supabase/migrations/<V1>_partner_ust_status.sql` — `ist_kleinunternehmer` auf makler+werkstaetten.
- `supabase/migrations/<V2>_marketing_partner.sql` — Tabelle + Seed + FK.
- `supabase/migrations/<V3>_provision_ust_freeze_cols.sql` — Freeze-Spalten.
- `supabase/migrations/<V4>_v_partner_billing.sql` — die View.
- `src/lib/finance/partner-billing-ust.ts` — `computeProvisionUst` (pure).
- `src/lib/finance/partner-billing-ust.test.ts` — vitest.
- `src/lib/finance/provision-status.ts` — `freigebenProvision`/`storniereProvision`/`auszahlenProvision` (shared mutators).
- `src/lib/finance/provision-status.test.ts` — vitest.
- `src/lib/finance/partner-billing.ts` — `getPartnerBilling` loader + Aggregat.
- `src/lib/finance/partner-billing-actions.ts` — `'use server'` Action-Modul.
- `src/components/shared/finance/PartnerBillingPanel.tsx` — Panel (client).
- `src/components/shared/finance/PartnerBillingPanel.types.ts` — Props/Row-Types.
- `src/app/admin/finance/(hub)/partner-abrechnungen/page.tsx` — zentraler Tab.
- `src/app/admin/sachverstaendige/[id]/AbrechnungsTab.tsx` — SV-Tab.

**Modifiziert:**
- `src/app/admin/finance/(hub)/FinanceHubTabs.tsx` — Tab anhängen.
- `src/app/admin/sachverstaendige/[id]/page.tsx` — `?tab=abrechnungen` verdrahten.
- `src/app/admin/makler/MaklerAdminClient.tsx` + `actions.ts` — Billing-Drawer + USt-Toggle.
- `src/app/admin/werkstaetten/WerkstaettenClient.tsx` + `actions.ts` — Billing-Drawer + USt-Toggle.
- `src/app/admin/finance/(hub)/kanzlei/…` bzw. `/admin/kanzlei-abrechnungen` — per-Kanzlei-Drill.
- `src/lib/supabase/database.types.ts` — regeneriert nach Migrationen.

---

## Task 1: Additive Migrationen — Partner-USt-Feld + marketing_partner + Freeze-Spalten

**Files:**
- Create: `supabase/migrations/<V1>_partner_ust_status.sql`, `<V2>_marketing_partner.sql`, `<V3>_provision_ust_freeze_cols.sql`

**Interfaces:**
- Produces (Spalten für spätere Tasks): `makler.ist_kleinunternehmer boolean`, `werkstaetten.ist_kleinunternehmer boolean`; Tabelle `marketing_partner(id uuid, name text, email text, ist_kleinunternehmer boolean, erstellt_am timestamptz)` + `provisionen_maik.marketing_partner_id uuid`; auf `makler_provisionen`/`werkstatt_provisionen`/`provisionen_maik`/`makler_staffel_bonus`/`werkstatt_staffel_bonus` je `ust_satz numeric`, `ust_betrag numeric`, `betrag_brutto numeric`.

- [ ] **Step 1: Migration V1 anwenden** — `apply_migration({ name: 'partner_ust_status', query: <SQL> })`:
```sql
ALTER TABLE public.makler ADD COLUMN IF NOT EXISTS ist_kleinunternehmer boolean;
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ist_kleinunternehmer boolean;
COMMENT ON COLUMN public.makler.ist_kleinunternehmer IS 'NULL=noch nicht erfragt; true=§19 UStG (keine USt auf Provision); false=regelbesteuert (19%). Blockt Auszahlung bei NULL.';
COMMENT ON COLUMN public.werkstaetten.ist_kleinunternehmer IS 'analog makler.ist_kleinunternehmer';
```
- [ ] **Step 2: Migration V2 anwenden** — `apply_migration({ name: 'marketing_partner', query: <SQL> })`:
```sql
CREATE TABLE IF NOT EXISTS public.marketing_partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  ist_kleinunternehmer boolean,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_partner ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_partner_admin_all ON public.marketing_partner
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.marketing_partner (name, email) VALUES ('Maik (Marketing)', NULL)
  ON CONFLICT DO NOTHING;
ALTER TABLE public.provisionen_maik ADD COLUMN IF NOT EXISTS marketing_partner_id uuid REFERENCES public.marketing_partner(id);
```
- [ ] **Step 3: Migration V3 anwenden** — `apply_migration({ name: 'provision_ust_freeze_cols', query: <SQL> })`:
```sql
ALTER TABLE public.makler_provisionen     ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.werkstatt_provisionen  ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.provisionen_maik       ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.makler_staffel_bonus   ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
ALTER TABLE public.werkstatt_staffel_bonus ADD COLUMN IF NOT EXISTS ust_satz numeric, ADD COLUMN IF NOT EXISTS ust_betrag numeric, ADD COLUMN IF NOT EXISTS betrag_brutto numeric;
```
- [ ] **Step 4: Getrackte Versionen ablesen** — `list_migrations`; die drei Versionen <V1>/<V2>/<V3> notieren.
- [ ] **Step 5: Migration-Files committen** — je File `supabase/migrations/<V>_<name>.sql` exakt nach getrackter Version benennen (Twin-Drift vermeiden), Inhalt = die drei SQLs.
- [ ] **Step 6: Verifizieren (READ)** — `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='makler_provisionen' AND column_name IN ('ust_satz','ust_betrag','betrag_brutto');
SELECT count(*) FROM marketing_partner;
```
Expected: 3 Spalten, 1 marketing_partner-Zeile.
- [ ] **Step 7: Commit** — `git add supabase/migrations/<V1>_* <V2>_* <V3>_* && git commit -m "feat(finance): additive schema for partner billing (ust status, marketing_partner, freeze cols)"`

---

## Task 2: View `v_partner_billing` + Typen

**Files:**
- Create: `supabase/migrations/<V4>_v_partner_billing.sql`
- Modify: `src/lib/supabase/database.types.ts` (regeneriert)

**Interfaces:**
- Produces: View `public.v_partner_billing` mit Spalten `quelle_tabelle, quelle_id, partner_typ, partner_id, partner_name, richtung, dokument_typ, referenz_nr, betrag_netto, ust_satz, ust_betrag, betrag_brutto, ust_status_bekannt, status_norm, status_roh, datum, faellig_am, erledigt_am, claim_id, fall_id`.

- [ ] **Step 1: View-Migration anwenden** — `apply_migration({ name: 'v_partner_billing', query: <SQL unten> })`. `security_invoker=true` (respektiert Base-RLS; Cockpit liest via Admin-Client hinter dem Guard).

```sql
CREATE OR REPLACE VIEW public.v_partner_billing WITH (security_invoker = true) AS
-- FORDERUNG: SV-Monatsrechnungen (nur empfaenger_typ='sv')
SELECT 'abrechnungen'::text AS quelle_tabelle, a.id AS quelle_id,
  'sv'::text AS partner_typ, a.empfaenger_id AS partner_id, a.empfaenger_name AS partner_name,
  'forderung'::text AS richtung, 'rechnung'::text AS dokument_typ, a.abrechnungs_nr AS referenz_nr,
  a.summe_netto AS betrag_netto, a.ust_satz, a.ust_betrag, a.summe_brutto AS betrag_brutto,
  true AS ust_status_bekannt,
  CASE WHEN a.status='storniert' THEN 'storniert'
       WHEN a.status='fehlgeschlagen' THEN 'fehlgeschlagen'
       WHEN a.status='bezahlt' THEN 'erledigt'
       WHEN a.status='entwurf' THEN 'entwurf'
       WHEN a.faellig_am IS NOT NULL AND a.faellig_am < current_date AND a.bezahlt_am IS NULL THEN 'faellig'
       ELSE 'offen' END AS status_norm,
  a.status AS status_roh, a.versand_datum AS datum, a.faellig_am, a.bezahlt_am AS erledigt_am,
  NULL::uuid AS claim_id, NULL::uuid AS fall_id
FROM public.abrechnungen a WHERE a.empfaenger_typ = 'sv'
UNION ALL
-- FORDERUNG: Kanzlei
SELECT 'kanzlei_abrechnungen', k.id, 'kanzlei', k.kanzlei_id, kz.name,
  'forderung', 'rechnung', k.rechnungsnummer,
  k.endbetrag_netto, NULL::numeric, k.mwst_betrag, k.endbetrag_brutto, true,
  CASE WHEN k.status='bezahlt' THEN 'erledigt'
       WHEN k.fehlgeschlagen_am IS NOT NULL THEN 'fehlgeschlagen'
       WHEN k.faelligkeitsdatum IS NOT NULL AND k.faelligkeitsdatum < current_date AND k.bezahlt_am IS NULL THEN 'faellig'
       ELSE 'offen' END,
  k.status, k.versendet_am, k.faelligkeitsdatum, k.bezahlt_am, NULL, NULL
FROM public.kanzlei_abrechnungen k LEFT JOIN public.kanzleien kz ON kz.id = k.kanzlei_id
UNION ALL
-- FORDERUNG: SV-Onboarding (Cent → EUR)
SELECT 'sv_onboarding_rechnungen', o.id, 'sv', o.sv_id, NULL,
  'forderung', 'onboarding', o.rechnungs_nr,
  o.netto_cent/100.0, o.ust_satz_pct, o.ust_cent/100.0, o.brutto_cent/100.0, true,
  CASE WHEN o.stripe_payment_intent_id IS NOT NULL THEN 'erledigt'
       WHEN o.versendet_am IS NOT NULL THEN 'offen' ELSE 'entwurf' END,
  NULL, o.rechnungs_datum::timestamptz, NULL::date, o.versendet_am, NULL, NULL
FROM public.sv_onboarding_rechnungen o
UNION ALL
-- AUSZAHLUNG: Makler-Provisionen (USt live COALESCE frozen, kleinunternehmer→0)
SELECT 'makler_provisionen', mp.id, 'makler', mp.makler_id, m.firma,
  'auszahlung', 'provision', NULL,
  mp.betrag_netto_eur,
  COALESCE(mp.ust_satz, CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(mp.ust_betrag, mp.betrag_netto_eur * CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(mp.betrag_brutto, mp.betrag_netto_eur * CASE WHEN m.ist_kleinunternehmer THEN 1 WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (mp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN mp.status='storniert' THEN 'storniert'
       WHEN mp.status='freigegeben' AND mp.abrechnung_id IS NOT NULL THEN 'erledigt'
       WHEN mp.status='freigegeben' THEN 'freigegeben'
       WHEN mp.status='pending' THEN 'gehalten' ELSE mp.status END,
  mp.status, mp.erstellt_am, NULL::date,
  CASE WHEN mp.abrechnung_id IS NOT NULL THEN mp.erstellt_am ELSE mp.storniert_am END,
  mp.claim_id, mp.fall_id
FROM public.makler_provisionen mp LEFT JOIN public.makler m ON m.id = mp.makler_id
UNION ALL
-- AUSZAHLUNG: Werkstatt-Provisionen
SELECT 'werkstatt_provisionen', wp.id, 'werkstatt', wp.werkstatt_id, w.name,
  'auszahlung', 'provision', NULL,
  wp.betrag_netto_eur,
  COALESCE(wp.ust_satz, CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(wp.ust_betrag, wp.betrag_netto_eur * CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(wp.betrag_brutto, wp.betrag_netto_eur * CASE WHEN w.ist_kleinunternehmer THEN 1 WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (wp.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN wp.status='storniert' THEN 'storniert'
       WHEN wp.ausgezahlt_am IS NOT NULL THEN 'erledigt'
       WHEN wp.status='freigegeben' THEN 'freigegeben'
       WHEN wp.status='pending' THEN 'gehalten' ELSE wp.status END,
  wp.status, wp.erstellt_am, NULL::date, COALESCE(wp.ausgezahlt_am, wp.storniert_am),
  wp.claim_id, wp.fall_id
FROM public.werkstatt_provisionen wp LEFT JOIN public.werkstaetten w ON w.id = wp.werkstatt_id
UNION ALL
-- AUSZAHLUNG: Maik
SELECT 'provisionen_maik', pm.id, 'marketing', pm.marketing_partner_id, mkp.name,
  'auszahlung', 'provision', NULL,
  pm.netto_provision,
  COALESCE(pm.ust_satz, CASE WHEN mkp.ist_kleinunternehmer THEN 0 WHEN mkp.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(pm.ust_betrag, pm.netto_provision * CASE WHEN mkp.ist_kleinunternehmer THEN 0 WHEN mkp.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(pm.betrag_brutto, pm.netto_provision * CASE WHEN mkp.ist_kleinunternehmer THEN 1 WHEN mkp.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (pm.ust_satz IS NOT NULL OR mkp.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN pm.status='reversed' THEN 'storniert'
       WHEN pm.status='paid' THEN 'erledigt'
       WHEN pm.status='confirmed' THEN 'freigegeben'
       WHEN pm.status='pending' THEN 'gehalten' ELSE pm.status END,
  pm.status, COALESCE(pm.paid_at, pm.erstellt_am), NULL::date, pm.paid_at,
  NULL, NULL
FROM public.provisionen_maik pm LEFT JOIN public.marketing_partner mkp ON mkp.id = pm.marketing_partner_id
UNION ALL
-- AUSZAHLUNG: Makler-Staffel-Boni
SELECT 'makler_staffel_bonus', mb.id, 'makler', mb.makler_id, m.firma,
  'auszahlung', 'bonus', NULL,
  mb.bonus_betrag_netto,
  COALESCE(mb.ust_satz, CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(mb.ust_betrag, mb.bonus_betrag_netto * CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(mb.betrag_brutto, mb.bonus_betrag_netto * CASE WHEN m.ist_kleinunternehmer THEN 1 WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (mb.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN mb.status='ausgezahlt' THEN 'erledigt' WHEN mb.status='freigegeben' THEN 'freigegeben' ELSE mb.status END,
  mb.status, mb.erstellt_am, NULL::date, NULL::timestamptz, NULL, NULL
FROM public.makler_staffel_bonus mb LEFT JOIN public.makler m ON m.id = mb.makler_id
UNION ALL
-- AUSZAHLUNG: Werkstatt-Staffel-Boni
SELECT 'werkstatt_staffel_bonus', wb.id, 'werkstatt', wb.werkstatt_id, w.name,
  'auszahlung', 'bonus', NULL,
  wb.bonus_betrag_netto,
  COALESCE(wb.ust_satz, CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(wb.ust_betrag, wb.bonus_betrag_netto * CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(wb.betrag_brutto, wb.bonus_betrag_netto * CASE WHEN w.ist_kleinunternehmer THEN 1 WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (wb.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN wb.status='ausgezahlt' THEN 'erledigt' WHEN wb.status='freigegeben' THEN 'freigegeben' ELSE wb.status END,
  wb.status, wb.erstellt_am, NULL::date, NULL::timestamptz, NULL, NULL
FROM public.werkstatt_staffel_bonus wb LEFT JOIN public.werkstaetten w ON w.id = wb.werkstatt_id;

GRANT SELECT ON public.v_partner_billing TO authenticated, service_role;
```

- [ ] **Step 2: Version ablesen + File committen** — `list_migrations` → <V4>; File `supabase/migrations/<V4>_v_partner_billing.sql`.
- [ ] **Step 3: View verifizieren (READ)** — `execute_sql`:
```sql
SELECT quelle_tabelle, richtung, status_norm, count(*) FROM v_partner_billing GROUP BY 1,2,3 ORDER BY 1;
SELECT partner_typ, partner_name, betrag_netto, ust_satz, betrag_brutto, ust_status_bekannt, status_norm FROM v_partner_billing WHERE richtung='auszahlung' LIMIT 10;
```
Expected: makler(2)+werkstatt(6) Auszahlungs-Zeilen, `ust_status_bekannt=false` (weil `ist_kleinunternehmer` noch NULL), `betrag_brutto=NULL`. Forderungs-Quellen 0 (Tabellen leer). **Kein `abrechnungen[kanzlei|marketing]` in der Ausgabe.**
- [ ] **Step 4: Typen regenerieren** — `generate_typescript_types` → in `src/lib/supabase/database.types.ts` einspielen.
- [ ] **Step 5: `tsc --noEmit`** → grün.
- [ ] **Step 6: Commit** — `git add supabase/migrations/<V4>_* src/lib/supabase/database.types.ts && git commit -m "feat(finance): v_partner_billing canonical read view over all billing sources"`

---

## Task 3: Pure Helper `computeProvisionUst` (TDD)

**Files:**
- Create: `src/lib/finance/partner-billing-ust.ts`, `src/lib/finance/partner-billing-ust.test.ts`

**Interfaces:**
- Produces: `computeProvisionUst(nettoEur: number, istKleinunternehmer: boolean | null): { ustSatz: number|null; ustBetrag: number|null; brutto: number|null; bekannt: boolean }` — für Task 4 (Auszahl-Freeze).

- [ ] **Step 1: Failing test schreiben** — `partner-billing-ust.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeProvisionUst } from './partner-billing-ust'

describe('computeProvisionUst', () => {
  it('regelbesteuert -> 19% Aufschlag', () => {
    expect(computeProvisionUst(100, false)).toEqual({ ustSatz: 19, ustBetrag: 19, brutto: 119, bekannt: true })
  })
  it('Kleinunternehmer -> keine USt', () => {
    expect(computeProvisionUst(100, true)).toEqual({ ustSatz: 0, ustBetrag: 0, brutto: 100, bekannt: true })
  })
  it('unbekannt (null) -> nichts berechnet, bekannt=false', () => {
    expect(computeProvisionUst(100, null)).toEqual({ ustSatz: null, ustBetrag: null, brutto: null, bekannt: false })
  })
  it('rundet auf 2 Nachkommastellen', () => {
    expect(computeProvisionUst(33.33, false)).toEqual({ ustSatz: 19, ustBetrag: 6.33, brutto: 39.66, bekannt: true })
  })
})
```
- [ ] **Step 2: Test → FAIL** — `npx vitest run src/lib/finance/partner-billing-ust.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implementieren** — `partner-billing-ust.ts`:
```ts
/** USt auf Partner-Provisionen (Auszahlung). Kleinunternehmer (§19) -> keine USt. */
export function computeProvisionUst(
  nettoEur: number,
  istKleinunternehmer: boolean | null,
): { ustSatz: number | null; ustBetrag: number | null; brutto: number | null; bekannt: boolean } {
  if (istKleinunternehmer === null || istKleinunternehmer === undefined) {
    return { ustSatz: null, ustBetrag: null, brutto: null, bekannt: false }
  }
  const ustSatz = istKleinunternehmer ? 0 : 19
  const round2 = (n: number) => Math.round(n * 100) / 100
  const ustBetrag = round2((nettoEur * ustSatz) / 100)
  const brutto = round2(nettoEur + ustBetrag)
  return { ustSatz, ustBetrag, brutto, bekannt: true }
}
```
- [ ] **Step 4: Test → PASS** — `npx vitest run src/lib/finance/partner-billing-ust.test.ts` → PASS (4/4).
- [ ] **Step 5: Commit** — `git commit -m "feat(finance): computeProvisionUst helper (Kleinunternehmer-aware)"`

> **Spec-Abweichung (dokumentiert):** Der in der Spec genannte TS-Helper `normalizeStatus` entfällt (YAGNI/DRY) — `status_norm` wird ausschließlich in der View (SQL CASE) berechnet; kein Consumer normalisiert Status in TS.

---

## Task 4: Shared Provision-Mutatoren `provision-status.ts` (TDD)

**Files:**
- Create: `src/lib/finance/provision-status.ts`, `src/lib/finance/provision-status.test.ts`

**Interfaces:**
- Consumes: `computeProvisionUst` (Task 3).
- Produces (für Task 5):
  - `PROVISION_TABELLEN = ['makler_provisionen','werkstatt_provisionen','provisionen_maik','makler_staffel_bonus','werkstatt_staffel_bonus'] as const`
  - `freigebenProvision(db, tabelle, id): Promise<{ ok: boolean; error?: string }>`
  - `storniereProvision(db, tabelle, id, grund): Promise<{ ok: boolean; error?: string }>`
  - `auszahlenProvision(db, tabelle, id): Promise<{ ok: boolean; error?: string }>` — liest netto + Partner-`ist_kleinunternehmer`, **blockt wenn unbekannt**, friert USt via `computeProvisionUst` ein, setzt Status auf ausgezahlt/erledigt.
  - `db` = `SupabaseClient` (admin). Betrag-Spalte je Tabelle: provisionen `betrag_netto_eur`/maik `netto_provision`/boni `bonus_betrag_netto`; Partner-Join-Spalte je Tabelle.

- [ ] **Step 1: Failing test** (mit Fake-DB-Stub, der `.from().update().eq()` + `.select().single()` mockt) — `provision-status.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { auszahlenProvision } from './provision-status'
function fakeDb(row: Record<string, unknown>) {
  const upd = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  return {
    _upd: upd,
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (patch: unknown) => { upd(patch); return { eq: () => Promise.resolve({ error: null }) } },
    }),
  } as any
}
describe('auszahlenProvision', () => {
  it('blockt bei unbekanntem USt-Status', async () => {
    const db = fakeDb({ betrag_netto_eur: 100, makler: { ist_kleinunternehmer: null } })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/USt-Status/)
  })
  it('friert USt ein (regelbesteuert)', async () => {
    const db = fakeDb({ betrag_netto_eur: 100, makler: { ist_kleinunternehmer: false } })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(true)
    expect(db._upd).toHaveBeenCalledWith(expect.objectContaining({ ust_satz: 19, ust_betrag: 19, betrag_brutto: 119 }))
  })
})
```
- [ ] **Step 2: Test → FAIL.**
- [ ] **Step 3: Implementieren** — `provision-status.ts` (Tabellen-Metadaten-Map für Betrag-/Partner-Spalte; `freigeben`/`storniere` = simple Status-Updates analog der Cron-Logik `release-*-provisionen`; `auszahlen` = read → computeProvisionUst → block-if-!bekannt → update status+freeze). Betrag/Partner-Mapping:
```ts
const META = {
  makler_provisionen:      { betrag: 'betrag_netto_eur', partner: 'makler',       fk: 'makler_id',    partnerFlag: 'ist_kleinunternehmer', paidStatus: 'ausgezahlt' },
  werkstatt_provisionen:   { betrag: 'betrag_netto_eur', partner: 'werkstaetten',  fk: 'werkstatt_id', partnerFlag: 'ist_kleinunternehmer', paidStatus: 'ausgezahlt', paidCol: 'ausgezahlt_am' },
  provisionen_maik:        { betrag: 'netto_provision',  partner: 'marketing_partner', fk: 'marketing_partner_id', partnerFlag: 'ist_kleinunternehmer', paidStatus: 'paid', paidCol: 'paid_at' },
  makler_staffel_bonus:    { betrag: 'bonus_betrag_netto', partner: 'makler',      fk: 'makler_id',    partnerFlag: 'ist_kleinunternehmer', paidStatus: 'ausgezahlt' },
  werkstatt_staffel_bonus: { betrag: 'bonus_betrag_netto', partner: 'werkstaetten', fk: 'werkstatt_id', partnerFlag: 'ist_kleinunternehmer', paidStatus: 'ausgezahlt' },
} as const
```
(`auszahlen` liest `select('<betrag>, <partner>(<partnerFlag>)')`; normalisiert Join Array/Objekt via `Array.isArray(x)?x[0]:x`; berechnet via `computeProvisionUst`; `update({ status: paidStatus, [paidCol||'status']:…, ust_satz, ust_betrag, betrag_brutto })`. Fehler → `{ ok:false, error }`.)
- [ ] **Step 4: Test → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(finance): shared provision mutators with ust freeze + unknown-status block"`

---

## Task 5: Action-Modul `partner-billing-actions.ts`

**Files:**
- Create: `src/lib/finance/partner-billing-actions.ts` (`'use server'`)

**Interfaces:**
- Consumes: `markBezahlt`, `retryEinzug`, `stornoAbrechnung` aus `@/app/admin/abrechnungen/actions` (liefern `{success}`); `freigebenProvision`/`storniereProvision`/`auszahlenProvision` (Task 4).
- Produces (für Panel/Task 7): alle liefern `{ ok: boolean; error?: string }`:
  - `markiereAlsBezahlt(quelle: string, id: string)` — nur Forderungs-Rechnungen (`abrechnungen`).
  - `loeseEinzugErneutAus(quelle: string, id: string)` — nur `abrechnungen`.
  - `gebeProvisionFrei(quelle: string, id: string)` — Provisions-/Bonus-Tabellen.
  - `zahleProvisionAus(quelle: string, id: string)` — Provisions-/Bonus-Tabellen (Freeze+Block).
  - `storniere(quelle: string, id: string, grund: string)` — Rechnungen → `stornoAbrechnung`, Provisionen → `storniereProvision`.
  - `setzePartnerUstStatus(partnerTyp: 'makler'|'werkstatt'|'marketing', partnerId: string, istKleinunternehmer: boolean)`.

- [ ] **Step 1: Modul schreiben** — Admin-Guard (Inline: `createClient` → `getUser` → `profiles.rolle==='admin'` → sonst `{ ok:false, error:'Nicht autorisiert' }`). Dispatch nach `quelle`. Wrapper mappt `{success}`→`{ok}`: `const r = await markBezahlt(id); return r.success ? { ok:true } : { ok:false, error:r.error }`. `setzePartnerUstStatus` schreibt `ist_kleinunternehmer` auf makler/werkstaetten/marketing_partner. Alle mit `revalidatePath('/admin/finance/partner-abrechnungen')` + rollen-spezifischer Route.
- [ ] **Step 2: `tsc --noEmit`** → grün.
- [ ] **Step 3: Commit** — `git commit -m "feat(finance): canonical partner-billing action module"`

---

## Task 6: Loader `getPartnerBilling`

**Files:**
- Create: `src/lib/finance/partner-billing.ts`

**Interfaces:**
- Produces: `type PartnerBillingRow` (= View-Zeile), `type PartnerBillingAggregat` (Summen je richtung×status_norm + je partner_typ), `getPartnerBilling(opts?: { partnerTyp?: string; partnerId?: string }): Promise<{ rows: PartnerBillingRow[]; aggregat: PartnerBillingAggregat }>` (liest via `createAdminClient()`).

- [ ] **Step 1: Implementieren** — `createAdminClient().from('v_partner_billing').select('*')` mit optionalen `.eq('partner_typ',…)`/`.eq('partner_id',…)`, `order('datum', {ascending:false})`. Aggregat in JS: Summen `betrag_netto`/`betrag_brutto` je `(richtung,status_norm)` + je `partner_typ`; Flag `hat_unbekannten_ust_status` = irgendeine Auszahlungs-Zeile mit `ust_status_bekannt=false`.
- [ ] **Step 2: `tsc --noEmit`** → grün.
- [ ] **Step 3: Commit** — `git commit -m "feat(finance): getPartnerBilling loader + aggregate"`

---

## Task 7: Shared `PartnerBillingPanel`

**Files:**
- Create: `src/components/shared/finance/PartnerBillingPanel.tsx` (`'use client'`), `PartnerBillingPanel.types.ts`

**Interfaces:**
- Consumes: `PartnerBillingRow`/`PartnerBillingAggregat` (Task 6), Action-Modul (Task 5), `@/components/shared/DataTable`, `@/components/shared/StatusBadge`.
- Produces: `PartnerBillingPanel({ rows, aggregat, showPartnerColumn, ustToggle? })`.

- [ ] **Step 1: Types** — `PartnerBillingPanel.types.ts`: Props inkl. `rows`, `aggregat`, `showPartnerColumn?: boolean`, `ustToggle?: { partnerTyp; partnerId; current: boolean|null }`.
- [ ] **Step 2: Panel** — Summary-Cards (Forderungen offen/fällig/erledigt; Auszahlungen gehalten/freigegeben/erledigt — `SectionCard`/token-basiert), USt-offen-Warnbanner (`bg-warning-soft`) wenn `aggregat.hat_unbekannten_ust_status`, `DataTableContainer`+`Table` (Spalten: referenz_nr, datum, [partner], netto, USt, brutto, `StatusBadge` mit tone-Map `{offen:'info',faellig:'warning',erledigt:'success',storniert:'neutral',fehlgeschlagen:'danger',gehalten:'neutral',freigegeben:'info',entwurf:'neutral'}`, Aktions-Buttons je richtung/status via `primitives.Button` + `startTransition` → Action-Modul). USt-Toggle (falls prop) → `setzePartnerUstStatus`. Alle Strings mit Umlauten.
- [ ] **Step 3: `tsc --noEmit` + `check:component-set`/`check:token-audit`** → grün.
- [ ] **Step 4: Commit** — `git commit -m "feat(finance): PartnerBillingPanel shared component"`

---

## Task 8: Zentraler Tab `/admin/finance/partner-abrechnungen`

**Files:**
- Modify: `src/app/admin/finance/(hub)/FinanceHubTabs.tsx` (TABS-Array)
- Create: `src/app/admin/finance/(hub)/partner-abrechnungen/page.tsx`

- [ ] **Step 1: Tab anhängen** — in `TABS`: `{ href: '/admin/finance/partner-abrechnungen', label: 'Partner-Abr.' }`.
- [ ] **Step 2: Page** — `export const dynamic='force-dynamic'`; Inline-Admin-Guard (Muster per-sv-balance); `getPartnerBilling()` (alle); `<PageHeader/>` + Aggregat-Breakdown je `partner_typ` (StatCards) + `<PartnerBillingPanel rows aggregat showPartnerColumn />`.
- [ ] **Step 3: `npm run build`** (Route!) → grün.
- [ ] **Step 4: Commit** — `git commit -m "feat(finance): central partner-abrechnungen hub tab"`

---

## Task 9: SV-Abrechnungs-Tab

**Files:**
- Modify: `src/app/admin/sachverstaendige/[id]/page.tsx`
- Create: `src/app/admin/sachverstaendige/[id]/AbrechnungsTab.tsx`

- [ ] **Step 1:** `activeTab`-Union um `'abrechnungen'` erweitern; dritten `<Link href={\`…?tab=abrechnungen\`}>` mit gleichem Klassen-Muster; Content-Branch `activeTab==='abrechnungen'` → `<AbrechnungsTab svId={id} />`; Daten-Load im `if (activeTab==='abrechnungen')`-Block via `getPartnerBilling({ partnerTyp:'sv', partnerId:id })`.
- [ ] **Step 2:** `AbrechnungsTab.tsx` rendert `<PartnerBillingPanel rows aggregat />` (kein partner-column).
- [ ] **Step 3: `npm run build`** → grün.
- [ ] **Step 4: Commit** — `git commit -m "feat(finance): SV detail Abrechnungs-Tab"`

---

## Task 10: Makler- & Werkstatt-Admin — Billing-Drawer + USt-Toggle

**Files:**
- Modify: `src/app/admin/makler/MaklerAdminClient.tsx`, `src/app/admin/makler/page.tsx`, `src/app/admin/werkstaetten/WerkstaettenClient.tsx`, `src/app/admin/werkstaetten/page.tsx`

**Interfaces:** Consumes `getPartnerBilling` (server, in page) + `PartnerBillingPanel` + `setzePartnerUstStatus`.

- [ ] **Step 1:** In `page.tsx` je Partner die Billing-Daten vorladen ODER (besser für Listen) einen Drawer, der on-demand lädt — hier: pro Zeile `ist_kleinunternehmer` mitladen; Klick „Abrechnung" öffnet Drawer (`primitives` Sheet/Drawer) mit `<PartnerBillingPanel rows aggregat ustToggle={{partnerTyp:'makler',partnerId,current:ist_kleinunternehmer}} />`. Drawer-Daten via kleine Server-Action `getPartnerBillingForDrawer(partnerTyp,partnerId)` (wrapper um Loader).
- [ ] **Step 2:** analog Werkstatt.
- [ ] **Step 3: `npm run build`** → grün.
- [ ] **Step 4: Commit** — `git commit -m "feat(finance): makler+werkstatt admin billing drawer + ust toggle"`

---

## Task 11: Kanzlei-Drill + Marketing/Maik-USt

**Files:**
- Modify: `src/app/admin/finance/(hub)/kanzlei/page.tsx` (bzw. `/admin/kanzlei-abrechnungen`) — pro-Kanzlei-Filter/Drill via `PartnerBillingPanel`.
- Modify/Erweitern: Marketing-Section (in `/admin/finance` Übersicht bzw. `provisionen`) — USt-Toggle für `marketing_partner` (Maik) via `setzePartnerUstStatus('marketing', maikId, …)`.

- [ ] **Step 1:** Kanzlei-Liste: Zeile-Klick → Drawer `PartnerBillingPanel rows aggregat` gefiltert `partnerTyp:'kanzlei', partnerId`.
- [ ] **Step 2:** Marketing: USt-Toggle für die Maik-`marketing_partner`-Zeile.
- [ ] **Step 3: `npm run build`** → grün.
- [ ] **Step 4: Commit** — `git commit -m "feat(finance): kanzlei drill + marketing ust toggle"`

---

## Task 12: Volle Gates + PR

- [ ] **Step 1: Alle Gates** — `npx tsc --noEmit`; `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `npm run check:knip -- --ratchet`; `npm run check:token-audit`; `npm run check:component-set -- --ratchet`; `npx vitest run src/lib/finance`. Alle grün.
- [ ] **Step 2: 7-Punkte-Audit** dokumentieren (Build/UI-Erreichbarkeit/Redundanz/Dead-Code/Spec-Treue/Inkonsistenz/Regression).
- [ ] **Step 3: Prod-Verifikation (READ)** — `execute_sql` gegen `v_partner_billing` (Zeilen erscheinen korrekt normalisiert; makler/werkstatt Auszahlungen).
- [ ] **Step 4: PR** — `gh pr create --base staging --body-file <datei>` (Beschreibung + Gates + Ops-Hinweis: USt-Status je Partner erfassen bevor ausgezahlt wird; VPS-Crontab unberührt).

---

## Self-Review

**Spec-Coverage:** §3 View → Task 2; §4 USt (Feld/Freeze/Block) → Task 1+3+4; §5 Actions → Task 5; §6 UI zentral+eingebettet → Task 7–11; §7 Migrationen → Task 1+2; §9 RLS/admin → Task 1 (marketing_partner-Policy) + Inline-Guards; §10 Tests → Task 3+4 (+ Gates Task 12). Alle Anforderungen haben Tasks.

**Abweichungen (dokumentiert):** `normalizeStatus`-TS-Helper entfällt (View ist SSoT für `status_norm`). makler/werkstatt haben keine `[id]`-Detailseite → Billing als **Drawer** in der Liste statt Detail-Tab (SV hat als Einzige einen echten Tab).

**Verify-at-execution (echte DB, keine Rate-Werte):** In Task 2 gegen die real leeren Forderungs-Tabellen — die genauen Datum-Spalten (`abrechnungen` hat kein `erstellt_am` → `versand_datum` genutzt; falls `datum` zu oft NULL, im Panel `COALESCE` im Sort beachten). `makler_provisionen.fall_id`/`claim_id` beide vorhanden (bestätigt). Boni haben kein `ausgezahlt_am` → `erledigt_am=NULL`, Status aus `status`.

## Execution Handoff
Nach Freigabe: `superpowers:subagent-driven-development` (empfohlen) — frischer Subagent pro Task + Review dazwischen.
