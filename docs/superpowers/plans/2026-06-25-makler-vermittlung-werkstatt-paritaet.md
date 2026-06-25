# Makler-Vermittlung Werkstatt-Parität — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Makler-Vermittlung auf funktionale Werkstatt-Parität — Admin-Anlage + Entry-QR + Claim-Propagation + Provisions-Trigger; promo-native (reuse `promotion_code_id`).

**Architecture:** Spiegel des Werkstatt-4-Teilers. Attribution = `lead.promotion_code_id` (kein neuer Spalten-Bedarf). `claims.makler_id` existiert schon (nur nie geschrieben).

**Tech Stack:** Next.js 16, Supabase (service-role), DB-Trigger (plpgsql), vitest.

## Global Constraints
- **DDL nur via `apply_migration`** (Regel 2): 1 Migration (Trigger + partial-unique-Index). Danach `list_migrations` → File `supabase/migrations/<recorded>_<name>.sql` exakt benannt committen.
- **Server-Actions** → `{ ok; error? }` (createMakler darf wie createWerkstatt `{ ok:true; email; password } | { ok:false; error }` liefern — Erfolg trägt Daten).
- **Aus `'use server'` keine Typen/Konstanten exportieren** (AAR-664).
- **Umlaute** in UI-Strings. **primitives.Button** / Token-Klassen für neue UI.
- **Maximal additiv** in `embed/gutachter-finder/actions.ts` + `FinderWizard.tsx` (Kollision vs. embed-rueckruf-Session) — neuer `promotion_code_id`-Param NEBEN `werkstatt_id`, nichts umstrukturieren.
- **Build:** voller `npm run build` + `tsc` (Routen + Server-Actions). OOM → `NODE_OPTIONS=--max-old-space-size=8192`.
- DB-Fakten verifiziert: `claims.{service_typ,makler_id,lead_id}` + `leads.promotion_code_id` existieren; `makler_provisionen` hat **kein** unique(claim_id) → Migration ergänzt es.

## File Structure
- **Create** `supabase/migrations/<V>_makler_provision_trigger.sql`
- **Create** `src/app/admin/makler/actions.ts` (`createMakler`), `page.tsx`, `MaklerAdminClient.tsx`, `__tests__/actions.test.ts`
- **Create** `src/app/start/makler/[maklerId]/page.tsx`
- **Modify** `src/app/embed/gutachter-finder/actions.ts` (`reserviereEmbedTermin`: +`promotion_code_id`-Param + Post-Lead-Update)
- **Modify** `src/app/embed/gutachter-finder/_components/FinderWizard.tsx` (+`promotionCodeId`-Prop, additiv durchgereicht)
- **Modify** `src/app/makler/(shell)/promo/page.tsx` (landingUrl → `/start/makler/[id]`)
- **Modify** `src/lib/leads/convert-lead-to-claim.ts` (makler_id-Propagation) + `__tests__`

---

## Task 1: DB-Migration — Provisions-Trigger (Controller, Regel 2)

**Files:** Create `supabase/migrations/<V>_makler_provision_trigger.sql`

SQL (spiegelt `create_werkstatt_provision`, dual-rate via service_typ; partial-unique für ON CONFLICT):
```sql
-- Makler-Vermittlung: Provisions-Trigger (Werkstatt-Paritaet).
-- AFTER INSERT ON claims WHEN makler_id NOT NULL -> genau eine makler_provisionen-Zeile.
-- dual-rate: claim.service_typ 'komplett' -> provision_betrag_komplett_netto, sonst _nur_gutachter_netto.
ALTER TABLE public.makler_provisionen
  DROP CONSTRAINT IF EXISTS makler_provisionen_claim_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS makler_provisionen_claim_id_uniq
  ON public.makler_provisionen (claim_id) WHERE claim_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_makler_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
BEGIN
  IF NEW.makler_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv
    FROM public.makler WHERE id = NEW.makler_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE
    WHEN lower(COALESCE(NEW.service_typ, '')) LIKE '%komplett%' THEN COALESCE(v_komplett, 100)
    ELSE COALESCE(v_gutachter, 50)
  END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = NEW.lead_id;
  INSERT INTO public.makler_provisionen
    (makler_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    (NEW.makler_id, NEW.id, NEW.id, NEW.lead_id, v_promo, v_betrag, NEW.service_typ,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_makler_provision_on_claim ON public.claims;
CREATE TRIGGER trg_makler_provision_on_claim
  AFTER INSERT ON public.claims
  FOR EACH ROW WHEN (NEW.makler_id IS NOT NULL)
  EXECUTE FUNCTION public.create_makler_provision();
```

- [ ] **Step 1:** `apply_migration({ name: 'makler_provision_trigger', query: <SQL> })`.
- [ ] **Step 2:** `list_migrations` → recorded Version `<V>` ablesen. File committen als `supabase/migrations/<V>_makler_provision_trigger.sql` (Name == `<V>`).
- [ ] **Step 3 (verify, READ):** `execute_sql` — Trigger existiert (`pg_trigger`), Index existiert. Auto-Rollback-Probe: Test-claims-INSERT mit makler_id (eines der 2 makler) → erzeugt 1 makler_provisionen-Row mit korrektem Betrag → RAISE-Rollback. + Gate (makler_id NULL → 0 Rows).
- [ ] **Step 4:** Commit migration file.

---

## Task 2: Admin-Anlage `/admin/makler`

**Files:** Create `src/app/admin/makler/{actions.ts,page.tsx,MaklerAdminClient.tsx,__tests__/actions.test.ts}`
**Interfaces:** Produces `createMakler(formData): Promise<{ok:true;email;password}|{ok:false;error}>`

`actions.ts` spiegelt `src/app/admin/werkstaetten/actions.ts` (gleiche `generatePassword`/`requireAdmin`-Helper — kopieren). `createMakler`:
- requireAdmin → generatePassword → `admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{force_password_change:true}})`
- `profiles.insert({id:userId, email, rolle:'makler', vorname:firma, force_password_change:true, twofa_aktiviert:false, twofa_email_aktiviert:false})` → Rollback `deleteUser` bei Fehler
- `makler.insert({firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, adresse_strasse, adresse_plz, adresse_ort, provision_betrag_komplett_netto:<form|100>, provision_betrag_nur_gutachter_netto:<form|50>, provision_aktiv:true, status:'aktiv', aktiviert_am:now, aktiviert_von:adminUser.id, user_id:userId}).select('id').single()` → Rollback `delete profile + deleteUser`
- **Default Promo-Code:** `promotion_codes.insert({makler_id:m.id, code:'MK-'+<8 crypto-alnum, upper>, aktiv:true})` (Retry bei unique-Kollision, max 3) → non-fatal (Makler steht; Promo-Code kann Admin nachziehen) ABER loggen
- `revalidatePath('/admin/makler')` → return `{ok:true, email, password}`
- **KEIN** Isochrone.

`page.tsx` (Server): requireAdmin-Gate (Admin-Layout greift) + `makler`-Liste laden (id, firma, email, status, provision_*) → `<MaklerAdminClient maklers={...} />`.
`MaklerAdminClient.tsx` (Client) spiegelt `WerkstaettenClient.tsx` (Liste + Anlage-Formular + Credentials-Anzeige nach Erfolg). **`handleCreate` MIT `try/catch`** (WerkstaettenClient hat dort Silent-Swallow-Bug — NICHT spiegeln; stattdessen `catch (e) { toast.error(...) }` + `finally { setLoading(false) }`). Felder: firma, ansprechpartner_vorname/nachname, email, telefon, adresse_*, provision_komplett (default 100), provision_gutachter (default 50). primitives.Button, Umlaute.

- [ ] **Step 1:** `actions.ts` (createMakler) schreiben.
- [ ] **Step 2:** Failing test `__tests__/actions.test.ts` — mock admin-client (createUser/insert), assert: Anlage-Reihenfolge (user→profile→makler→promo), Rollback bei profile-Fehler (deleteUser called), Rollback bei makler-Fehler (delete profile + deleteUser), Promo-Fehler non-fatal (return ok:true). Mock `@/lib/supabase/server` (requireAdmin → admin) + `@/lib/supabase/admin`.
- [ ] **Step 3:** Test grün (`npx vitest run src/app/admin/makler/__tests__/actions.test.ts`).
- [ ] **Step 4:** `page.tsx` + `MaklerAdminClient.tsx`.
- [ ] **Step 5:** Nav-Eintrag: prüfen wie `/admin/werkstaetten` im Admin-Nav verlinkt ist (`grep -rn "admin/werkstaetten" src/app/admin`) → analogen `/admin/makler`-Link ergänzen (UI-Erreichbarkeit).
- [ ] **Step 6:** tsc grün. Commit.

---

## Task 3: Entry — `/start/makler/[maklerId]` + reserviereEmbedTermin-Param

**Files:** Create `src/app/start/makler/[maklerId]/page.tsx`; Modify `embed/gutachter-finder/actions.ts`, `FinderWizard.tsx`, `makler/(shell)/promo/page.tsx`

### 3a. reserviereEmbedTermin (additiv)
- [ ] In `input`-Typ (bei Zeile 269, neben `werkstatt_id?`): `promotion_code_id?: string | null` ergänzen.
- [ ] Nach der leadId-Auflösung (nach Zeile 318, vor/neben dem Auto-Rückruf-Block): additiv:
```typescript
// Makler-Vermittlung: Promo-Code des vermittelnden Maklers auf den Lead (Attribution).
// convert-lead-to-claim loest spaeter promotion_code_id -> makler_id -> claims.makler_id (DB-Trigger -> Provision).
if (leadId && input.promotion_code_id) {
  try {
    await createAdminClient().from('leads').update({ promotion_code_id: input.promotion_code_id }).eq('id', leadId)
  } catch (err) {
    console.error('[reserviereEmbedTermin] promotion_code_id setzen fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }
}
```

### 3b. FinderWizard (additiv)
- [ ] `promotionCodeId?: string | null`-Prop ergänzen (neben `werkstattId`). An der Stelle, wo `reserviereEmbedTermin({... werkstatt_id ...})` aufgerufen wird (grep `reserviereEmbedTermin` in FinderWizard), `promotion_code_id: promotionCodeId ?? null` additiv mitgeben. Sonst nichts ändern (keine Geo/„Auto bei Werkstatt"-UI für Makler).

### 3c. /start/makler/[maklerId]/page.tsx (spiegelt /start/werkstatt, OHNE Geo)
```typescript
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMaklerPrimaryPromoCode } from '@/lib/makler/queries'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { FinderMap } from '@/app/embed/gutachter-finder/_components/FinderMap'
import { FinderWizard } from '@/app/embed/gutachter-finder/_components/FinderWizard'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function MaklerStartPage({ params }: { params: Promise<{ maklerId: string }> }) {
  const { maklerId } = await params
  const supabase = createAdminClient()
  const { data: makler } = await supabase.from('makler').select('id, status').eq('id', maklerId).maybeSingle()
  if (!makler || makler.status !== 'aktiv') redirect('/gutachter-finden')

  const promo = await getMaklerPrimaryPromoCode(makler.id) // {id, code} | null
  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const svs = aktiveRes.ok ? aktiveRes.data : []
  const leadPins = leadsRes.ok ? leadsRes.data : []

  return (
    <FinderMap svLeads={leadPins} aktiveSVs={svs} height="100dvh" initialCenter={null} initialZoom={6} forceFallback={false}
      wizardSlot={<FinderWizard forceFallback={false} promotionCodeId={promo?.id ?? null} />} />
  )
}
```
(Verify `getMaklerPrimaryPromoCode`-Return-Shape in `lib/makler/queries.ts:144` — `{id, code}` o.ä. Falls kein aktiver Code: Lead läuft ohne Attribution — kein Hard-Fail.)

### 3d. /promo landingUrl
- [ ] `makler/(shell)/promo/page.tsx` Zeile 42: `const landingUrl = \`${landingBase()}/start/makler/${makler.id}\`` (statt `/?p=${code}`). QR + Stats bleiben.

- [ ] **Steps:** 3a→3d umsetzen, tsc grün, voller Build grün. Commit.

---

## Task 4: Propagation — convert-lead-to-claim makler_id

**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts`; Test `__tests__`
- [ ] **Verify:** die `lead`-Selektion in convert-lead-to-claim enthält `promotion_code_id` (grep im File; falls nicht → zur lead-select ergänzen).
- [ ] Direkt nach der `werkstatt_id`-Zeile (422) additiv:
```typescript
// Makler-Vermittlung: promotion_code_id -> promotion_codes.makler_id -> claims.makler_id.
// DB-Trigger trg_makler_provision_on_claim legt dann die makler_provisionen-Provision an.
let maklerId: string | null = null
if (lead.promotion_code_id) {
  const { data: pc } = await admin.from('promotion_codes').select('makler_id').eq('id', lead.promotion_code_id as string).maybeSingle()
  maklerId = (pc?.makler_id as string | null) ?? null
}
;(claimsInsert as Record<string, unknown>).makler_id = maklerId
```
- [ ] **Test:** convert-lead-to-claim-Test erweitern/ergänzen — Lead mit promotion_code_id → claims-Insert bekommt makler_id (gemockter promotion_codes-Lookup). Idiom: bestehender `convert-lead-to-claim.test.ts` queue-Mock.
- [ ] **Steps:** umsetzen, Test grün, tsc grün. Commit.

---

## Final: Live-Smoke + Whole-Branch-Review
- Auto-Rollback-DB-Probe der End-to-End-Kette (Lead mit promotion_code_id → convertLeadToClaim → claims.makler_id gesetzt → Trigger → makler_provisionen-Row), Rollback.
- Whole-Branch-Review (Ownership: createMakler nur Admin; reserviereEmbedTermin-Param leak-safe; Trigger SECURITY DEFINER ok).

## Self-Review (Controller)
- Spec-Coverage: Admin-Anlage (T2) · Entry (T3) · Propagation (T4) · Trigger (T1) · reuse (kein Task) — alle da.
- Typ-Konsistenz: `promotion_code_id`-Param-Kette FinderWizard→reserviereEmbedTermin konsistent; `makler_id` via Record-Cast (wie werkstatt_id).
- Placeholder: „verify"-Punkte (getMaklerPrimaryPromoCode-Shape, lead-select promotion_code_id, FinderWizard-Call-Site, Admin-Nav) sind gezielte Implementer-Checks, keine offenen Specs.
