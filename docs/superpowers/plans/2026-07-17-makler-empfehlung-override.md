# Makler-Empfehlungsstruktur + 10-EUR-Override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Makler teilt einen persönlichen Empfehlungs-Link; wer sich darüber registriert wird seine Downline, und er verdient 10 EUR netto pro vermitteltem Gutachten seiner direkt geworbenen Makler — plus: Rechtsform wird auch im Admin-Anlage-Pfad Pflicht.

**Architecture:** Reitet die bestehende offene Self-Registrierung (`/makler/registrieren` → `anlegeMaklerKern`) und die unifizierte Provisions-Sink `partner_provisionen`. Ein `sponsor_makler_id`-Zeiger auf `makler` + ein Override-Block in der bestehenden Trigger-Funktion `create_makler_provision()` (neuer `partner_typ='makler_empfehlung'`) erzeugen die 10-EUR-Zeile. Struktur-Sicht über eine SECURITY-DEFINER-RPC (kein RLS-Rekursions-/Leak-Risiko). Share = Copy/WhatsApp/E-Mail rein client-seitig (`wa.me`/`mailto:`).

**Tech Stack:** Next.js 15 (App Router, RSC + Server-Actions), Supabase Postgres (RLS, Trigger, SECURITY DEFINER RPC), TypeScript, Tailwind (Claimondo-Tokens), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-makler-empfehlung-override-design.md`

## Global Constraints

- **Regel 1:** Kein Direct-Push auf `main`. Arbeit auf `kitta/makler-empfehlung-override`, PR gegen `staging`/`main`, Merge nach Review.
- **Regel 2 (DDL):** Schema-Änderungen NUR via `mcp__plugin_supabase_supabase__apply_migration`. Ablauf je Migration: DDL schreiben → `apply_migration({name, query})` → `list_migrations` (recorded Version `<V>` ablesen) → File `supabase/migrations/<V>_<name>.sql` committen (Name == recorded Version, sonst Twin-Drift) → `execute_sql` (READ) verifizieren. `execute_sql` NUR für READ. Prod-Ref = `paizkjajbuxxksdoycev`.
- **Regel 2 (Types):** Nach den Migrationen `src/lib/supabase/database.types.ts` regenerieren + committen (nicht aufschieben). CLI-Lesegenerierung: `SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public`.
- **Regel 4:** Nach Prod-Deploy vollständiger Playwright-Prod-Smoke der betroffenen Flows (Test-Accounts, `telefon=NULL`). Task 19.
- **UI-Sprache:** Alle nutzersichtbaren Strings Deutsch mit echten Umlauten (`ä/ö/ü/ß`). Backend/Kommentare/Commits ASCII erlaubt.
- **Komponenten-Set:** `primitives/*` (Button etc.), `shared/*` (DataTable, forms/SelectField, StatCard, PageHeader). Kein handgerolltes Button/Card/Table-Markup.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (kein `throw`). Non-critical Sends in try/catch. Mutationen → `revalidatePath`.
- **RLS-Policy-Gate:** Jede `CREATE POLICY` mit expliziter `TO <rolle>` (nie weglassen, nie `TO public`).
- **Branding/Token-Ratchets:** `bg-claimondo-*`/`text-claimondo-*` + `rounded-ios-*` + Status-Tokens (`text-danger-strong` etc.). Keine raw Hex/Tailwind-Default-Radien/-Status-Scales.
- **Override-Betrag:** 10 EUR netto, Konstante `MAKLER_EMPFEHLUNG_OVERRIDE_NETTO`.

---

## File Structure

**DB (Regel-2-Migrationen):**
- `supabase/migrations/<V>_makler_sponsor_makler_id.sql` — Spalte + CHECK + Index + `guard_makler_privilegien`-Update
- `supabase/migrations/<V>_partner_provisionen_typ_add_makler_empfehlung.sql` — CHECK erweitern
- `supabase/migrations/<V>_create_makler_provision_empfehlung_override.sql` — Trigger-Funktion `CREATE OR REPLACE`
- `supabase/migrations/<V>_partner_provisionen_sel_makler_empfehlung.sql` — SELECT-Policy neu
- `supabase/migrations/<V>_get_makler_empfehlung_uebersicht.sql` — RPC
- `src/lib/supabase/database.types.ts` — regeneriert

**App — Referral-Signup:**
- `src/lib/finance/constants.ts` — Konstante (MOD)
- `src/lib/makler/anlege-makler.ts` — `sponsorMaklerId`-Param (MOD)
- `src/app/makler/registrieren/actions.ts` — Werber-Auflösung + geerbte Sätze (MOD)
- `src/app/makler/registrieren/page.tsx` — `searchParams.werber` (MOD)
- `src/app/makler/registrieren/MaklerRegistrierenClient.tsx` — hidden `werber` + Trust-Hinweis (MOD)

**App — Empfehlungen-Portal:**
- `src/lib/makler/share-snippets.ts` — `buildMaklerReferralSnippets` (MOD)
- `src/lib/makler/empfehlung.ts` — RPC-Wrapper + Typen (NEU)
- `src/components/makler/EmpfehlungShareCard.tsx` — Client-Share (NEU)
- `src/app/makler/(shell)/empfehlungen/page.tsx` — Server-Seite (NEU)
- `src/components/makler/MaklerShell.tsx` — Nav-Item (MOD)

**App — Rechtsform im Admin:**
- `src/lib/partner/anlege-partner.ts` — makler-Case rechtsform/kleinunternehmer (MOD)
- `src/app/admin/makler/actions.ts` — `createMakler` parsen + validieren (MOD)
- `src/app/admin/makler/MaklerAnlegenForm.tsx` — Rechtsform-SelectField + Kleinunternehmer-Checkbox (MOD)

**Tests:**
- `src/lib/makler/__tests__/share-snippets.test.ts` (NEU, Teil bestehend?) — Referral-Snippets
- `src/app/makler/registrieren/__tests__/actions.test.ts` — Werber-Auflösung (MOD)
- `src/app/admin/makler/__tests__/actions.test.ts` — Rechtsform-Pflicht (MOD)

---

## Phase 1 — DB-Fundament (Migrationen)

> Alle Phase-1-Tasks folgen dem Regel-2-Flow. `apply_migration` und `execute_sql` sind MCP-Tools (`mcp__plugin_supabase_supabase__*`), KEIN `npx supabase db push`.

### Task 1: Spalte `makler.sponsor_makler_id` + Guard-Härtung

**Files:**
- Create: `supabase/migrations/<V>_makler_sponsor_makler_id.sql`

**Interfaces:**
- Produces: Spalte `makler.sponsor_makler_id uuid`; `guard_makler_privilegien()` schützt sie.

- [ ] **Step 1: DDL via apply_migration anwenden**

`apply_migration({ name: "makler_sponsor_makler_id", query: <SQL> })` mit:

```sql
ALTER TABLE public.makler
  ADD COLUMN sponsor_makler_id uuid REFERENCES public.makler(id),
  ADD CONSTRAINT makler_sponsor_not_self
    CHECK (sponsor_makler_id IS NULL OR sponsor_makler_id <> id);

CREATE INDEX idx_makler_sponsor
  ON public.makler(sponsor_makler_id) WHERE sponsor_makler_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_makler_privilegien()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.status := 'pending';
      NEW.provision_betrag_komplett_netto := 0;
      NEW.provision_betrag_nur_gutachter_netto := 0;
      NEW.provision_aktiv := false;
      NEW.sponsor_makler_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT privileged AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provision_betrag_komplett_netto IS DISTINCT FROM OLD.provision_betrag_komplett_netto
    OR NEW.provision_betrag_nur_gutachter_netto IS DISTINCT FROM OLD.provision_betrag_nur_gutachter_netto
    OR NEW.provision_aktiv IS DISTINCT FROM OLD.provision_aktiv
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.sponsor_makler_id IS DISTINCT FROM OLD.sponsor_makler_id
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role duerfen Provisions-/Status-/user_id-/sponsor-Felder aendern (versucht an makler.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $function$;
```

- [ ] **Step 2: Recorded Version ablesen**

`list_migrations` → die Version `<V>` der eben getrackten Migration `makler_sponsor_makler_id` notieren.

- [ ] **Step 3: Migration-File committen (Name == recorded Version)**

`supabase/migrations/<V>_makler_sponsor_makler_id.sql` mit exakt dem SQL aus Step 1 anlegen.

- [ ] **Step 4: READ-Verify**

`execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='makler' AND column_name='sponsor_makler_id';
```
Erwartet: 1 Zeile. Zusätzlich Guard prüfen:
```sql
SELECT pg_get_functiondef('public.guard_makler_privilegien'::regproc) ILIKE '%sponsor_makler_id%' AS ok;
```
Erwartet: `ok = true`.

**Grant-Coverage prüfen** (Lektion aus `COORDINATION-AN-claims-column-grants-blocker`: Grant IMMER in derselben Migration wie das Column-Add):
```sql
SELECT has_column_privilege('authenticated','public.makler','sponsor_makler_id','SELECT') AS auth_select;
```
Erwartet: `true` (makler hat einen **table-level** authenticated-SELECT-Grant → neue Spalten sind automatisch abgedeckt; verifiziert 2026-07-17). **Falls wider Erwarten `false`** → in DIESE Migration ergänzen (Regel 2, neu applyen) und File neu benennen:
```sql
GRANT SELECT (sponsor_makler_id) ON public.makler TO authenticated;
```
(`sponsor_makler_id` ist ein nicht-sensibler FK; RLS beschränkt makler-SELECT ohnehin auf die eigene Row → kein Leak. Anon hat keinen makler-Grant.)

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/<V>_makler_sponsor_makler_id.sql
git commit -m "feat(makler): sponsor_makler_id + guard-haertung (empfehlung mig 1/5)"
```

---

### Task 2: `partner_typ`-CHECK um `makler_empfehlung` erweitern

**Files:**
- Create: `supabase/migrations/<V>_partner_provisionen_typ_add_makler_empfehlung.sql`

**Interfaces:**
- Produces: `partner_provisionen.partner_typ` akzeptiert `'makler_empfehlung'`.

- [ ] **Step 1: apply_migration**

`apply_migration({ name: "partner_provisionen_typ_add_makler_empfehlung", query: <SQL> })`:
```sql
ALTER TABLE public.partner_provisionen DROP CONSTRAINT partner_provisionen_partner_typ_check;
ALTER TABLE public.partner_provisionen ADD CONSTRAINT partner_provisionen_partner_typ_check
  CHECK (partner_typ = ANY (ARRAY['makler','werkstatt','firmen_flotte','makler_empfehlung']));
```

- [ ] **Step 2: Recorded Version ablesen** — `list_migrations` → `<V>`.

- [ ] **Step 3: File committen** — `supabase/migrations/<V>_partner_provisionen_typ_add_makler_empfehlung.sql`.

- [ ] **Step 4: READ-Verify**
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.partner_provisionen'::regclass AND conname='partner_provisionen_partner_typ_check';
```
Erwartet: enthält `makler_empfehlung`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/<V>_partner_provisionen_typ_add_makler_empfehlung.sql
git commit -m "feat(makler): partner_typ makler_empfehlung erlaubt (empfehlung mig 2/5)"
```

---

### Task 3: Override-Block in `create_makler_provision()`

**Files:**
- Create: `supabase/migrations/<V>_create_makler_provision_empfehlung_override.sql`

**Interfaces:**
- Consumes: `makler.sponsor_makler_id` (Task 1), `partner_typ='makler_empfehlung'` (Task 2).
- Produces: Beim Bridging eines makler-attribuierten Claims entsteht zusätzlich eine 10-EUR-`makler_empfehlung`-Zeile für den Sponsor.

- [ ] **Step 1: apply_migration** — `apply_migration({ name: "create_makler_provision_empfehlung_override", query: <SQL> })`:
```sql
CREATE OR REPLACE FUNCTION public.create_makler_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
  v_vermittler_typ text;
  v_sponsor uuid;
BEGIN
  SELECT makler_id, service_typ, lead_id, vermittler_typ
    INTO v_makler, v_service, v_lead, v_vermittler_typ
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
  VALUES (NEW.fall_id, NEW.claim_id, v_makler, 'vollzugriff', now())
  ON CONFLICT (fall_id, makler_id) DO NOTHING;

  IF v_vermittler_typ IS NOT NULL AND v_vermittler_typ IS DISTINCT FROM 'makler' THEN
    RETURN NEW;
  END IF;

  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv FROM public.makler WHERE id = v_makler;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE WHEN lower(COALESCE(v_service, '')) LIKE '%komplett%'
                   THEN COALESCE(v_komplett, 100) ELSE COALESCE(v_gutachter, 50) END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = v_lead;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    ('makler', v_makler, NEW.claim_id, NEW.fall_id, v_lead, v_promo, v_betrag, v_service,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;

  -- Empfehlungs-Override (Single-Level): 10 EUR an den direkten Werber, wenn dieser aktiv provisioniert.
  SELECT sponsor_makler_id INTO v_sponsor FROM public.makler WHERE id = v_makler;
  IF v_sponsor IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.makler WHERE id = v_sponsor AND provision_aktiv) THEN
    INSERT INTO public.partner_provisionen
      (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
       trigger_event, trigger_at, hold_until, status)
    VALUES
      ('makler_empfehlung', v_sponsor, NEW.claim_id, NEW.fall_id, v_lead, v_promo, 10, v_service,
       'empfehlung_override', now(), now() + interval '7 days', 'pending')
    ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END; $function$;
```

- [ ] **Step 2: Recorded Version ablesen** — `list_migrations` → `<V>`.

- [ ] **Step 3: File committen** — `supabase/migrations/<V>_create_makler_provision_empfehlung_override.sql`.

- [ ] **Step 4: READ-Verify**
```sql
SELECT pg_get_functiondef('public.create_makler_provision'::regproc) ILIKE '%makler_empfehlung%' AS ok;
```
Erwartet: `ok = true`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/<V>_create_makler_provision_empfehlung_override.sql
git commit -m "feat(makler): 10-EUR empfehlung-override im provision-trigger (empfehlung mig 3/5)"
```

---

### Task 4: SELECT-Policy `partner_provisionen__b1sel` erweitern

**Files:**
- Create: `supabase/migrations/<V>_partner_provisionen_sel_makler_empfehlung.sql`

**Interfaces:**
- Produces: Ein Makler sieht seine `makler_empfehlung`-Override-Zeilen (RLS).

- [ ] **Step 1: apply_migration** — `apply_migration({ name: "partner_provisionen_sel_makler_empfehlung", query: <SQL> })`:
```sql
DROP POLICY IF EXISTS partner_provisionen__b1sel ON public.partner_provisionen;
CREATE POLICY partner_provisionen__b1sel ON public.partner_provisionen
  FOR SELECT TO authenticated
  USING (
    ((partner_typ IN ('makler','makler_empfehlung')) AND EXISTS (
        SELECT 1 FROM public.makler m
        WHERE m.id = partner_provisionen.partner_id AND m.user_id = (SELECT auth.uid())))
    OR ((partner_typ = 'werkstatt') AND EXISTS (
        SELECT 1 FROM public.werkstaetten w
        WHERE w.id = partner_provisionen.partner_id AND w.user_id = (SELECT auth.uid())))
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND (p.rolle = 'admin'::user_role
               OR (p.rolle = 'kundenbetreuer'::user_role
                   AND partner_provisionen.partner_typ IN ('makler','makler_empfehlung'))))
  );
```
(Spiegelt die bestehende Policy 1:1; nur die beiden Makler-`partner_typ`-Checks um `makler_empfehlung` erweitert; `TO authenticated` — der tote anon-Zweig entfällt.)

- [ ] **Step 2: Recorded Version ablesen** — `list_migrations` → `<V>`.

- [ ] **Step 3: File committen** — `supabase/migrations/<V>_partner_provisionen_sel_makler_empfehlung.sql`.

- [ ] **Step 4: READ-Verify**
```sql
SELECT qual FROM pg_policies
WHERE schemaname='public' AND tablename='partner_provisionen' AND policyname='partner_provisionen__b1sel';
```
Erwartet: `qual` enthält `makler_empfehlung`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/<V>_partner_provisionen_sel_makler_empfehlung.sql
git commit -m "feat(makler): RLS SELECT deckt makler_empfehlung (empfehlung mig 4/5)"
```

---

### Task 5: RPC `get_makler_empfehlung_uebersicht`

**Files:**
- Create: `supabase/migrations/<V>_get_makler_empfehlung_uebersicht.sql`

**Interfaces:**
- Produces: `get_makler_empfehlung_uebersicht(p_makler_id uuid) RETURNS jsonb` mit `{ upline, downline[], totals }`. Nur eigener Makler/Admin (auth.uid()-Guard). EXECUTE für `authenticated`.

- [ ] **Step 1: apply_migration** — `apply_migration({ name: "get_makler_empfehlung_uebersicht", query: <SQL> })`:
```sql
CREATE OR REPLACE FUNCTION public.get_makler_empfehlung_uebersicht(p_makler_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_upline jsonb;
  v_sponsor uuid;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.makler WHERE id = p_makler_id AND user_id = auth.uid())
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT sponsor_makler_id INTO v_sponsor FROM public.makler WHERE id = p_makler_id;
  IF v_sponsor IS NOT NULL THEN
    SELECT jsonb_build_object('makler_id', m.id, 'firma', m.firma,
                              'ansprechpartner_vorname', m.ansprechpartner_vorname)
      INTO v_upline FROM public.makler m WHERE m.id = v_sponsor;
  ELSE
    v_upline := NULL;
  END IF;

  WITH dl AS (
    SELECT d.id, d.firma, d.ansprechpartner_vorname, d.status,
      (SELECT count(*) FROM public.partner_provisionen pp
         WHERE pp.partner_typ = 'makler' AND pp.partner_id = d.id) AS gutachten_count,
      COALESCE((SELECT sum(o.betrag_netto_eur) FROM public.partner_provisionen o
         JOIN public.claims c ON c.id = o.claim_id
         WHERE o.partner_typ = 'makler_empfehlung' AND o.partner_id = p_makler_id
           AND c.makler_id = d.id), 0) AS override_netto_summe,
      COALESCE((SELECT sum(o.betrag_netto_eur) FROM public.partner_provisionen o
         JOIN public.claims c ON c.id = o.claim_id
         WHERE o.partner_typ = 'makler_empfehlung' AND o.partner_id = p_makler_id
           AND c.makler_id = d.id AND o.status = 'pending'), 0) AS override_pending_netto
    FROM public.makler d
    WHERE d.sponsor_makler_id = p_makler_id
    ORDER BY d.erstellt_am DESC
  )
  SELECT jsonb_build_object(
    'upline', v_upline,
    'downline', COALESCE(jsonb_agg(jsonb_build_object(
        'makler_id', dl.id, 'firma', dl.firma, 'ansprechpartner_vorname', dl.ansprechpartner_vorname,
        'status', dl.status, 'gutachten_count', dl.gutachten_count,
        'override_netto_summe', dl.override_netto_summe, 'override_pending_netto', dl.override_pending_netto)), '[]'::jsonb),
    'totals', jsonb_build_object(
        'downline_count', (SELECT count(*) FROM public.makler WHERE sponsor_makler_id = p_makler_id),
        'override_netto_gesamt', COALESCE((SELECT sum(betrag_netto_eur) FROM public.partner_provisionen
            WHERE partner_typ='makler_empfehlung' AND partner_id=p_makler_id), 0),
        'override_pending', COALESCE((SELECT sum(betrag_netto_eur) FROM public.partner_provisionen
            WHERE partner_typ='makler_empfehlung' AND partner_id=p_makler_id AND status='pending'), 0),
        'override_freigegeben', COALESCE((SELECT sum(betrag_netto_eur) FROM public.partner_provisionen
            WHERE partner_typ='makler_empfehlung' AND partner_id=p_makler_id AND status='freigegeben'), 0))
  ) INTO v_result FROM dl;

  RETURN v_result;
END; $function$;

REVOKE ALL ON FUNCTION public.get_makler_empfehlung_uebersicht(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_makler_empfehlung_uebersicht(uuid) TO authenticated;
```

- [ ] **Step 2: Recorded Version ablesen** — `list_migrations` → `<V>`.

- [ ] **Step 3: File committen** — `supabase/migrations/<V>_get_makler_empfehlung_uebersicht.sql`.

- [ ] **Step 4: READ-Verify** — mit einem existierenden Makler (`SELECT id FROM makler LIMIT 1`):
```sql
SELECT public.get_makler_empfehlung_uebersicht('<eine-makler-id>');
```
Erwartet: JSON mit Keys `upline`, `downline`, `totals` (downline evtl. `[]`).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/<V>_get_makler_empfehlung_uebersicht.sql
git commit -m "feat(makler): RPC get_makler_empfehlung_uebersicht (empfehlung mig 5/5)"
```

---

### Task 6: TypeScript-Typen regenerieren + committen

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Typen generieren** (Lesegenerierung, kein DDL — `.env.local` liefert `SUPABASE_ACCESS_TOKEN`)
```bash
SUPABASE_ACCESS_TOKEN=$(grep -m1 SUPABASE_ACCESS_TOKEN .env.local | cut -d= -f2) \
  npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
```

- [ ] **Step 2: Verify** — `sponsor_makler_id` + RPC vorhanden:
```bash
grep -c "sponsor_makler_id" src/lib/supabase/database.types.ts
grep -c "get_makler_empfehlung_uebersicht" src/lib/supabase/database.types.ts
```
Erwartet: beide > 0.

- [ ] **Step 3: tsc**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```
Erwartet: grün (keine neuen Fehler).

- [ ] **Step 4: Commit**
```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): regen nach empfehlung-migrationen (Regel 2)"
```

---

## Phase 2 — Referral-Signup (Sponsor-Attribution)

### Task 7: Finance-Konstante

**Files:**
- Modify: `src/lib/finance/constants.ts`

- [ ] **Step 1: Konstante ergänzen** — im `FINANCE`-Objekt (vor der schließenden `}`), nach `ANZAHLUNG_PRO_KONTINGENT`:
```ts
  /** Empfehlungs-Override an den direkten Werber pro vermitteltem Gutachten (netto).
   *  Muss synchron zum Literal 10 im DB-Trigger create_makler_provision() bleiben. */
  MAKLER_EMPFEHLUNG_OVERRIDE_NETTO: 10,
```

- [ ] **Step 2: tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün.

- [ ] **Step 3: Commit**
```bash
git add src/lib/finance/constants.ts
git commit -m "feat(makler): MAKLER_EMPFEHLUNG_OVERRIDE_NETTO konstante"
```

---

### Task 8: `anlegeMaklerKern` um `sponsorMaklerId` erweitern

**Files:**
- Modify: `src/lib/makler/anlege-makler.ts`

**Interfaces:**
- Produces: `MaklerAnlageInput` hat optional `sponsorMaklerId?: string | null`; wird als `makler.sponsor_makler_id` gesetzt.

- [ ] **Step 1: Typ erweitern** — in `MaklerAnlageInput` (nach `istKleinunternehmer?`):
```ts
  /** Direkter Werber (Empfehlungsstruktur) — nur beim Referral-Signup gesetzt. */
  sponsorMaklerId?: string | null
```

- [ ] **Step 2: Insert-Feld setzen** — im `makler`-Insert-Objekt (nach `ist_kleinunternehmer: input.istKleinunternehmer ?? null,`):
```ts
      sponsor_makler_id: input.sponsorMaklerId ?? null,
```

- [ ] **Step 3: tsc** — grün.

- [ ] **Step 4: Commit**
```bash
git add src/lib/makler/anlege-makler.ts
git commit -m "feat(makler): anlegeMaklerKern setzt sponsor_makler_id"
```

---

### Task 9: `registriereMaklerSelf` — Werber-Auflösung + geerbte Sätze

**Files:**
- Modify: `src/app/makler/registrieren/actions.ts`
- Test: `src/app/makler/registrieren/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `anlegeMaklerKern` mit `sponsorMaklerId` (Task 8).
- Produces: Bei `formData.werber = <promo_code eines aktiven Maklers>` wird `anlegeMaklerKern` mit `sponsorMaklerId` + geerbten Sätzen aufgerufen; sonst Default 100/50 ohne Sponsor.

- [ ] **Step 1: Failing Test schreiben** — im bestehenden Test-File (Mock-Harness dieses Files nutzen: `anlegeMock` für `anlegeMaklerKern`, gemockter `createAdminClient`). Ergänze:
```ts
it('werber = aktiver Promo-Code -> anlegeMaklerKern mit sponsorMaklerId + geerbten Saetzen', async () => {
  // Admin-Mock: promotion_codes.code -> makler_id; makler -> aktiver Sponsor mit Saetzen 120/70
  // (an das from()-Routing des vorhandenen Mocks anpassen).
  mockPromoLookup({ code: 'MK-WERB', makler_id: 'sponsor-1' })
  mockMaklerLookup('sponsor-1', {
    id: 'sponsor-1', provision_betrag_komplett_netto: 120,
    provision_betrag_nur_gutachter_netto: 70, provision_aktiv: true, status: 'aktiv',
  })
  anlegeMock.mockResolvedValue({ ok: true, userId: 'u2', maklerId: 'm2', password: 'x' })

  const fd = baseValidFormData() // firma/vorname/nachname/email/telefon/rechtsform/einwilligung gesetzt
  fd.set('werber', 'MK-WERB')
  const res = await registriereMaklerSelf(fd)

  expect(res.ok).toBe(true)
  expect(anlegeMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ sponsorMaklerId: 'sponsor-1', provisionKomplett: 120, provisionGutachter: 70 }),
  )
})

it('werber unbekannt -> kein Sponsor, Default-Saetze 100/50', async () => {
  mockPromoLookup(null)
  anlegeMock.mockResolvedValue({ ok: true, userId: 'u3', maklerId: 'm3', password: 'x' })
  const fd = baseValidFormData()
  fd.set('werber', 'UNBEKANNT')
  const res = await registriereMaklerSelf(fd)
  expect(res.ok).toBe(true)
  expect(anlegeMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ sponsorMaklerId: null, provisionKomplett: 100, provisionGutachter: 50 }),
  )
})
```
(Die `mockPromoLookup`/`mockMaklerLookup`-Helfer an das im File bereits vorhandene `createAdminClient`-`from()`-Mock-Muster anpassen — nicht neu erfinden.)

- [ ] **Step 2: Run test → FAIL**
```bash
npx vitest run src/app/makler/registrieren/__tests__/actions.test.ts
```
Erwartet: FAIL (werber wird noch nicht verarbeitet; `sponsorMaklerId` fehlt im Call).

- [ ] **Step 3: Implementieren** — in `registriereMaklerSelf`:

(a) Werber parsen — bei den anderen `formData.get`-Zeilen (nach `const rechtsform = …`):
```ts
  const werber = String(formData.get('werber') ?? '').trim() || null
```
(b) Nach `const admin = createAdminClient()` und dem Email-Dedupe-Block, VOR dem `anlegeMaklerKern`-Call, Sponsor auflösen:
```ts
  // Werber-Auflösung (Empfehlungsstruktur): Promo-Code -> aktiver Sponsor -> Sätze erben.
  let sponsorMaklerId: string | null = null
  let provisionKomplett = 100
  let provisionGutachter = 50
  if (werber) {
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('makler_id')
      .eq('code', werber)
      .eq('aktiv', true)
      .maybeSingle()
    if (pc?.makler_id) {
      const { data: sponsor } = await admin
        .from('makler')
        .select('id, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv, status')
        .eq('id', pc.makler_id)
        .maybeSingle()
      if (sponsor && sponsor.provision_aktiv && sponsor.status === 'aktiv') {
        sponsorMaklerId = sponsor.id as string
        provisionKomplett = Number(sponsor.provision_betrag_komplett_netto ?? 100)
        provisionGutachter = Number(sponsor.provision_betrag_nur_gutachter_netto ?? 50)
      }
    }
  }
```
(c) Im `anlegeMaklerKern`-Call die Zeilen `provisionKomplett: 100,` / `provisionGutachter: 50,` ersetzen durch:
```ts
    provisionKomplett,
    provisionGutachter,
    sponsorMaklerId,
```

- [ ] **Step 4: Run test → PASS**
```bash
npx vitest run src/app/makler/registrieren/__tests__/actions.test.ts
```
Erwartet: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/makler/registrieren/actions.ts src/app/makler/registrieren/__tests__/actions.test.ts
git commit -m "feat(makler): registriereMaklerSelf loest werber auf + erbt saetze"
```

---

### Task 10: `registrieren`-Page + Client — `werber` verdrahten

**Files:**
- Modify: `src/app/makler/registrieren/page.tsx`
- Modify: `src/app/makler/registrieren/MaklerRegistrierenClient.tsx`

**Interfaces:**
- Consumes: `registriereMaklerSelf` liest `formData.werber` (Task 9).
- Produces: `?werber=<code>` wird als hidden Field mitgesendet; optionaler „Eingeladen von <Firma>"-Hinweis.

- [ ] **Step 1: Page — searchParams lesen + Sponsor-Firma auflösen** — `page.tsx` ersetzen:
```tsx
import type { Metadata } from 'next'
import { MaklerRegistrierenClient } from './MaklerRegistrierenClient'
import { getGesellschaftOptions } from '@/lib/makler/gesellschaft'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Makler-Partner werden | Claimondo',
  description:
    'Registrieren Sie sich kostenlos als Makler-Partner bei Claimondo. ' +
    'Sofort startklar mit Ihrer eigenen Empfehlungs-Landeseite für Ihre Kunden.',
}

export default async function MaklerRegistrierenPage({
  searchParams,
}: {
  searchParams: Promise<{ werber?: string }>
}) {
  const { werber } = await searchParams
  const werberCode = (werber ?? '').trim() || null

  // Optionaler Trust-Hinweis: Firma des Werbers server-seitig auflösen (non-fatal).
  let werberFirma: string | null = null
  if (werberCode) {
    try {
      const admin = createAdminClient()
      const { data: pc } = await admin
        .from('promotion_codes')
        .select('makler:makler_id(firma, status, provision_aktiv)')
        .eq('code', werberCode)
        .eq('aktiv', true)
        .maybeSingle()
      const m = Array.isArray(pc?.makler) ? pc?.makler[0] : pc?.makler
      if (m && m.status === 'aktiv' && m.provision_aktiv) werberFirma = (m.firma as string) ?? null
    } catch {
      /* non-fatal */
    }
  }

  const { versicherungen, maklerpools } = await getGesellschaftOptions()
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo">
            Makler-Partnerprogramm
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Makler-Partner werden
          </h1>
          <p className="mt-3 text-sm text-claimondo-shield">
            Kostenlos registrieren — sofort startklar mit Ihrer eigenen Empfehlungs-Landeseite.
          </p>
        </div>
        <MaklerRegistrierenClient
          versicherungen={versicherungen}
          maklerpools={maklerpools}
          werber={werberCode}
          werberFirma={werberFirma}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Client — Props + hidden Field + Trust-Banner** — in `MaklerRegistrierenClient.tsx`:

(a) Props erweitern:
```tsx
export function MaklerRegistrierenClient({
  versicherungen,
  maklerpools,
  werber = null,
  werberFirma = null,
}: {
  versicherungen: GesellschaftOption[]
  maklerpools: GesellschaftOption[]
  werber?: string | null
  werberFirma?: string | null
}) {
```
(b) In `submit()` nach den anderen `fd.set(...)`-Zeilen:
```tsx
    if (werber) fd.set('werber', werber)
```
(c) Trust-Banner — direkt nach dem öffnenden `<div className="rounded-ios-lg border border-claimondo-border bg-white p-6 sm:p-8">` des Formulars (nicht im Success-Zweig):
```tsx
      {werberFirma ? (
        <div className="mb-4 rounded-ios-md bg-claimondo-bg px-4 py-3 text-sm text-claimondo-navy">
          Eingeladen von <span className="font-semibold">{werberFirma}</span>
        </div>
      ) : null}
```

- [ ] **Step 3: Build** (Route + Server-Action → voller Build, Audit-Punkt 1)
```bash
npm run build
```
Erwartet: grün.

- [ ] **Step 4: Commit**
```bash
git add src/app/makler/registrieren/page.tsx src/app/makler/registrieren/MaklerRegistrierenClient.tsx
git commit -m "feat(makler): registrieren nimmt werber-param (hidden field + trust-hinweis)"
```

---

## Phase 3 — Empfehlungen-Portal

### Task 11: `buildMaklerReferralSnippets` (Referral-Link-Snippets)

**Files:**
- Modify: `src/lib/makler/share-snippets.ts`
- Test: `src/lib/makler/__tests__/share-snippets.test.ts` (falls nicht vorhanden: neu)

**Interfaces:**
- Produces: `buildMaklerReferralSnippets(code, firma, base): { url, whatsappHref, mailtoHref }` — URL = `<base>/makler/registrieren?werber=<code>`.

- [ ] **Step 1: Failing Test**
```ts
import { describe, it, expect } from 'vitest'
import { buildMaklerReferralSnippets } from '@/lib/makler/share-snippets'

describe('buildMaklerReferralSnippets', () => {
  it('baut Referral-URL, wa.me und mailto', () => {
    const s = buildMaklerReferralSnippets('MK-ABC', 'Muster GmbH', 'https://claimondo.de/')
    expect(s.url).toBe('https://claimondo.de/makler/registrieren?werber=MK-ABC')
    expect(s.whatsappHref).toContain('https://wa.me/?text=')
    expect(decodeURIComponent(s.whatsappHref)).toContain(s.url)
    expect(s.mailtoHref).toContain('mailto:?subject=')
    expect(decodeURIComponent(s.mailtoHref)).toContain(s.url)
  })
})
```

- [ ] **Step 2: Run → FAIL**
```bash
npx vitest run src/lib/makler/__tests__/share-snippets.test.ts
```
Erwartet: FAIL („buildMaklerReferralSnippets is not a function").

- [ ] **Step 3: Implementieren** — an `share-snippets.ts` anhängen:
```ts
export type MaklerReferralSnippets = {
  url: string
  whatsappHref: string
  mailtoHref: string
}

/** Snippets zum Werben WEITERER Makler (Empfehlungsstruktur) — anders als buildShareSnippets
 *  (Kunden-Landeseite /m/<code>): Ziel ist die Makler-Registrierung mit Werber-Bezug. */
export function buildMaklerReferralSnippets(code: string, firma: string, base: string): MaklerReferralSnippets {
  const cleanBase = base.replace(/\/+$/, '')
  const url = `${cleanBase}/makler/registrieren?werber=${encodeURIComponent(code)}`
  const waText = `${firma} lädt Sie zum Claimondo Makler-Partnerprogramm ein — kostenlos registrieren und pro vermitteltem Gutachten verdienen: ${url}`
  const mailSubject = 'Einladung zum Claimondo Makler-Partnerprogramm'
  const mailBody = `Hallo,\n\n${firma} lädt Sie ein, Makler-Partner bei Claimondo zu werden.\nKostenlos registrieren: ${url}\n\nViele Grüße`
  return {
    url,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(waText)}`,
    mailtoHref: `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`,
  }
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/lib/makler/__tests__/share-snippets.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/makler/share-snippets.ts src/lib/makler/__tests__/share-snippets.test.ts
git commit -m "feat(makler): buildMaklerReferralSnippets (werber-link/wa.me/mailto)"
```

---

### Task 12: RPC-Wrapper `getMaklerEmpfehlungUebersicht`

**Files:**
- Create: `src/lib/makler/empfehlung.ts`

**Interfaces:**
- Consumes: RPC `get_makler_empfehlung_uebersicht` (Task 5), Typen aus Task 6.
- Produces: `getMaklerEmpfehlungUebersicht(maklerId): Promise<EmpfehlungUebersicht | null>` + Typen `EmpfehlungUebersicht`, `EmpfehlungDownline`.

- [ ] **Step 1: Datei anlegen**
```ts
import { createClient } from '@/lib/supabase/server'

export type EmpfehlungDownline = {
  makler_id: string
  firma: string
  ansprechpartner_vorname: string
  status: string
  gutachten_count: number
  override_netto_summe: number
  override_pending_netto: number
}

export type EmpfehlungUpline = {
  makler_id: string
  firma: string
  ansprechpartner_vorname: string
}

export type EmpfehlungUebersicht = {
  upline: EmpfehlungUpline | null
  downline: EmpfehlungDownline[]
  totals: {
    downline_count: number
    override_netto_gesamt: number
    override_pending: number
    override_freigegeben: number
  }
}

/** Downline/Upline + Override-Stats des Maklers (SECURITY-DEFINER-RPC, auth.uid()-gated). */
export async function getMaklerEmpfehlungUebersicht(
  maklerId: string,
): Promise<EmpfehlungUebersicht | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_makler_empfehlung_uebersicht', {
    p_makler_id: maklerId,
  })
  if (error) {
    console.error('[getMaklerEmpfehlungUebersicht]', error.message)
    return null
  }
  return (data as unknown as EmpfehlungUebersicht | null) ?? null
}
```

- [ ] **Step 2: tsc** — grün (RPC ist nach Task 6 typisiert; `p_makler_id` muss der generierte Args-Name sein — bei Abweichung an `database.types.ts` anpassen).

- [ ] **Step 3: Commit**
```bash
git add src/lib/makler/empfehlung.ts
git commit -m "feat(makler): getMaklerEmpfehlungUebersicht RPC-wrapper"
```

---

### Task 13: `EmpfehlungShareCard` (Client-Share)

**Files:**
- Create: `src/components/makler/EmpfehlungShareCard.tsx`

**Interfaces:**
- Consumes: nichts (reine Props).
- Produces: `<EmpfehlungShareCard referralUrl whatsappHref mailtoHref />` — Copy + WhatsApp + E-Mail.

- [ ] **Step 1: Komponente anlegen**
```tsx
'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check, Mail } from 'lucide-react'
import { Button } from '@/components/primitives'

export function EmpfehlungShareCard({
  referralUrl,
  whatsappHref,
  mailtoHref,
}: {
  referralUrl: string
  whatsappHref: string
  mailtoHref: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(referralUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = referralUrl
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* noop */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-claimondo-ondo">
        Ihr persönlicher Empfehlungs-Link
      </p>
      <p className="mt-1 break-all text-sm font-medium text-claimondo-navy">{referralUrl}</p>
      <p className="mt-2 text-xs text-claimondo-shield">
        Wer sich über Ihren Link registriert, wird Ihr Partner. Sie erhalten 10&nbsp;€ pro
        vermitteltem Gutachten Ihrer geworbenen Makler.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-ios-lg bg-claimondo-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Per WhatsApp einladen
        </a>
        <a
          href={mailtoHref}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-ios-lg border border-claimondo-border px-5 py-3 text-sm font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-bg"
        >
          <Mail className="h-4 w-4" aria-hidden />
          Per E-Mail einladen
        </a>
        <Button variant="ghost" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> Kopiert!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> Link kopieren
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc** — grün.

- [ ] **Step 3: Commit**
```bash
git add src/components/makler/EmpfehlungShareCard.tsx
git commit -m "feat(makler): EmpfehlungShareCard (copy/whatsapp/mail)"
```

---

### Task 14: Seite `/makler/empfehlungen`

**Files:**
- Create: `src/app/makler/(shell)/empfehlungen/page.tsx`

**Interfaces:**
- Consumes: `getCurrentMakler`, `getMaklerPrimaryPromoCode` (`@/lib/makler/queries`), `getMaklerEmpfehlungUebersicht` (Task 12), `buildMaklerReferralSnippets` (Task 11), `EmpfehlungShareCard` (Task 13), `StatCard`/`DataTable` (`@/components/shared/*`).

- [ ] **Step 1: Seite anlegen**
```tsx
import { redirect } from 'next/navigation'
import { getCurrentMakler, getMaklerPrimaryPromoCode } from '@/lib/makler/queries'
import { getMaklerEmpfehlungUebersicht } from '@/lib/makler/empfehlung'
import { buildMaklerReferralSnippets } from '@/lib/makler/share-snippets'
import { EmpfehlungShareCard } from '@/components/makler/EmpfehlungShareCard'
import { StatCard } from '@/components/shared/StatCard'
import { DataTable, DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export default async function EmpfehlungenPage() {
  const makler = await getCurrentMakler()
  if (!makler) redirect('/makler')

  const [promo, uebersicht] = await Promise.all([
    getMaklerPrimaryPromoCode(makler.id),
    getMaklerEmpfehlungUebersicht(makler.id),
  ])

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  const snippets = promo ? buildMaklerReferralSnippets(promo.code, makler.firma, base) : null
  const t = uebersicht?.totals
  const downline = uebersicht?.downline ?? []

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-claimondo-navy">Empfehlungen</h1>
      <p className="mt-1 text-sm text-claimondo-shield">
        Laden Sie weitere Makler ein und verdienen Sie 10&nbsp;€ pro vermitteltem Gutachten Ihrer
        geworbenen Partner.
      </p>

      {snippets ? (
        <div className="mt-6">
          <EmpfehlungShareCard
            referralUrl={snippets.url}
            whatsappHref={snippets.whatsappHref}
            mailtoHref={snippets.mailtoHref}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-ios-lg border border-claimondo-border bg-white p-5 text-sm text-claimondo-shield">
          Ihr Empfehlungs-Link wird gerade vorbereitet. Bitte laden Sie die Seite in Kürze erneut.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Geworbene Makler" value={String(t?.downline_count ?? 0)} />
        <StatCard label="Override gesamt" value={eur(t?.override_netto_gesamt ?? 0)} />
        <StatCard label="davon offen" value={eur(t?.override_pending ?? 0)} />
      </div>

      {uebersicht?.upline ? (
        <div className="mt-6 rounded-ios-md bg-claimondo-bg px-4 py-3 text-sm text-claimondo-navy">
          Ihr Werber: <span className="font-semibold">{uebersicht.upline.firma}</span>
        </div>
      ) : null}

      <h2 className="mt-8 text-lg font-semibold text-claimondo-navy">Meine geworbenen Makler</h2>
      {downline.length === 0 ? (
        <p className="mt-2 text-sm text-claimondo-shield">
          Noch keine geworbenen Makler. Teilen Sie Ihren Link oben.
        </p>
      ) : (
        <DataTableContainer className="mt-3">
          <DataTable>
            <Table>
              <Thead>
                <Tr>
                  <Th>Firma</Th>
                  <Th>Ansprechpartner</Th>
                  <Th>Status</Th>
                  <Th>Gutachten</Th>
                  <Th>Override verdient</Th>
                </Tr>
              </Thead>
              <Tbody>
                {downline.map((d) => (
                  <Tr key={d.makler_id}>
                    <Td>{d.firma}</Td>
                    <Td>{d.ansprechpartner_vorname}</Td>
                    <Td>{d.status}</Td>
                    <Td>{d.gutachten_count}</Td>
                    <Td>{eur(d.override_netto_summe)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTable>
        </DataTableContainer>
      )}
    </div>
  )
}
```

> **Verify-Hinweis:** Import-Pfade/Exports von `StatCard` und dem `DataTable`-Set gegen die tatsächlichen Exporte in `@/components/shared/*` prüfen (Barrel `@/components/shared/DataTable`); bei Abweichung Named-Imports anpassen. `getMaklerPrimaryPromoCode`/`getCurrentMakler` existieren in `@/lib/makler/queries`.

- [ ] **Step 2: Build** (neue Route → voller Build)
```bash
npm run build
```
Erwartet: grün.

- [ ] **Step 3: Commit**
```bash
git add "src/app/makler/(shell)/empfehlungen/page.tsx"
git commit -m "feat(makler): /makler/empfehlungen seite (link/stats/downline)"
```

---

### Task 15: Nav-Item „Empfehlungen"

**Files:**
- Modify: `src/components/makler/MaklerShell.tsx`

- [ ] **Step 1: Icon-Import ergänzen** — in der `lucide-react`-Import-Gruppe `Share2Icon` hinzufügen:
```tsx
  QrCodeIcon,
  Share2Icon,
  SettingsIcon,
```

- [ ] **Step 2: Nav-Item einfügen** — in `MAKLER_NAV_ITEMS`, nach dem `promo`-Eintrag, vor `einstellungen`:
```tsx
  { href: '/makler/empfehlungen', label: 'Empfehlungen', icon: Share2Icon },
```

- [ ] **Step 3: Build** — `npm run build` → grün. Erreichbarkeit (Audit-Punkt 2): Nav-Item sichtbar in der Makler-Sidebar.

- [ ] **Step 4: Commit**
```bash
git add src/components/makler/MaklerShell.tsx
git commit -m "feat(makler): nav-item Empfehlungen"
```

---

## Phase 4 — Rechtsform-Pflicht im Admin-Anlage-Pfad

### Task 16: `anlegePartnerKern` — makler `rechtsform`/`ist_kleinunternehmer` durchreichen

**Files:**
- Modify: `src/lib/partner/anlege-partner.ts`
- Test: `src/lib/partner/__tests__/anlege-partner.test.ts` (falls nicht vorhanden: neu, sonst ergänzen)

**Interfaces:**
- Produces: `anlegePartnerKern('makler', { rollenDetails: { rechtsform, ist_kleinunternehmer } })` schreibt beide Felder auf die `makler`-Row.

- [ ] **Step 1: Failing Test** — Insert-Payload-Capture (Admin-Mock wie in `src/lib/auth/partner-phone-enroll.test.ts`: `from()` liefert ein Objekt, dessen `insert` das Payload festhält). Assertion:
```ts
it('makler-Case schreibt rechtsform + ist_kleinunternehmer aus rollenDetails', async () => {
  const { admin, captured } = makeAdminMock() // insert-Payload je Tabelle festhalten
  await anlegeMaklerKernOrPartner(admin) // anlegePartnerKern(admin, 'makler', {... rollenDetails:{ rechtsform:'GmbH', ist_kleinunternehmer:true }})
  expect(captured.makler).toMatchObject({ rechtsform: 'GmbH', ist_kleinunternehmer: true })
})
```
(An das im Repo vorhandene Admin-Mock-Muster anpassen; `makeAdminMock` steht stellvertretend für den dort genutzten Fake mit `auth.admin.createUser` + `from()`-Kette.)

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/partner/__tests__/anlege-partner.test.ts` → FAIL (Felder fehlen im Payload).

- [ ] **Step 3: Implementieren** — im `case 'makler':`-Block, nach den bestehenden `maklerInsert`-Zuweisungen (nach `provision_betrag_nur_gutachter_netto`):
```ts
      const maklerRechtsform = detailString(input.rollenDetails, 'rechtsform')
      if (maklerRechtsform) maklerInsert.rechtsform = maklerRechtsform
      const maklerKleinunternehmer = detailBoolean(input.rollenDetails, 'ist_kleinunternehmer')
      if (maklerKleinunternehmer !== null) maklerInsert.ist_kleinunternehmer = maklerKleinunternehmer
```

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**
```bash
git add src/lib/partner/anlege-partner.ts src/lib/partner/__tests__/anlege-partner.test.ts
git commit -m "feat(makler): anlegePartnerKern reicht rechtsform/kleinunternehmer durch (makler)"
```

---

### Task 17: Admin-`createMakler` — Rechtsform Pflicht + Kleinunternehmer

**Files:**
- Modify: `src/app/admin/makler/actions.ts`
- Test: `src/app/admin/makler/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `anlegePartnerKern` mit rechtsform/kleinunternehmer (Task 16), `istErlaubteRechtsform` (`@/lib/rechtsformen`).
- Produces: `createMakler` verlangt gültige Rechtsform; reicht `rechtsform` + `ist_kleinunternehmer` via `rollenDetails` durch.

- [ ] **Step 1: Failing Test** (Harness des Files nutzen; `anlegePartnerKern` mocken):
```ts
it('ohne rechtsform -> Fehler, keine Anlage', async () => {
  const fd = adminValidFormData() // firma/email/vorname/nachname gesetzt, KEINE rechtsform
  const res = await createMakler(fd)
  expect(res.ok).toBe(false)
  expect(anlegePartnerMock).not.toHaveBeenCalled()
})

it('mit rechtsform -> an anlegePartnerKern via rollenDetails', async () => {
  anlegePartnerMock.mockResolvedValue({ ok: true, userId: 'u', partnerId: 'm', password: 'x' })
  const fd = adminValidFormData()
  fd.set('rechtsform', 'GmbH')
  fd.set('kleinunternehmer', 'on')
  const res = await createMakler(fd)
  expect(res.ok).toBe(true)
  expect(anlegePartnerMock).toHaveBeenCalledWith(
    expect.anything(), 'makler',
    expect.objectContaining({
      rollenDetails: expect.objectContaining({ rechtsform: 'GmbH', ist_kleinunternehmer: true }),
    }),
  )
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/app/admin/makler/__tests__/actions.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — in `createMakler`:

(a) Import ergänzen (oben):
```ts
import { istErlaubteRechtsform } from '@/lib/rechtsformen'
```
(b) Nach den bestehenden `formData.get`-Zeilen (nach `maklerpool_id`):
```ts
  const rechtsform = String(formData.get('rechtsform') ?? '').trim()
  const istKleinunternehmer =
    formData.get('kleinunternehmer') === 'on' || formData.get('kleinunternehmer') === 'true'
```
(c) Nach dem bestehenden Pflichtfeld-Check ergänzen:
```ts
  if (!rechtsform || !istErlaubteRechtsform(rechtsform)) {
    return { ok: false, error: 'Bitte wählen Sie eine gültige Rechtsform.' }
  }
```
(d) Im `anlegePartnerKern`-Call das `rollenDetails`-Objekt um zwei Felder erweitern:
```ts
    rollenDetails: {
      adresse_strasse,
      provision_betrag_komplett_netto: provKomplett,
      provision_betrag_nur_gutachter_netto: provGutachter,
      versicherung_id,
      maklerpool_id,
      rechtsform,
      ist_kleinunternehmer: istKleinunternehmer,
    },
```

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/makler/actions.ts src/app/admin/makler/__tests__/actions.test.ts
git commit -m "feat(makler): admin createMakler verlangt rechtsform (+kleinunternehmer)"
```

---

### Task 18: Admin-Formular — Rechtsform-SelectField + Kleinunternehmer-Checkbox

**Files:**
- Modify: `src/app/admin/makler/MaklerAnlegenForm.tsx`

**Interfaces:**
- Consumes: `SelectField` (`@/components/shared/forms/SelectField`), `RECHTSFORM_OPTIONEN` (`@/lib/rechtsformen`).

- [ ] **Step 1: Imports ergänzen** (oben):
```tsx
import { SelectField } from '@/components/shared/forms/SelectField'
import { RECHTSFORM_OPTIONEN } from '@/lib/rechtsformen'
```

- [ ] **Step 2: Rechtsform-Feld + Checkbox im Formular** — direkt nach dem `<TextField ... name="firma" .../>` (vor dem E-Mail-Feld), Rechtsform als Pflicht:
```tsx
        <SelectField
          label="Rechtsform *"
          name="rechtsform"
          required
          defaultValue=""
          options={RECHTSFORM_OPTIONEN.map((o) => ({ value: o, label: o || '— wählen —' }))}
        />
```
und nach dem Gesellschaft-Block (vor der Button-Reihe) die Kleinunternehmer-Checkbox:
```tsx
        <label className="flex items-start gap-2 text-sm text-claimondo-shield">
          <input type="checkbox" name="kleinunternehmer" className="mt-0.5 h-4 w-4 rounded border-claimondo-border" />
          <span>Kleinunternehmer nach §19 UStG (Provisionsgutschrift ohne Umsatzsteuer)</span>
        </label>
```

- [ ] **Step 3: Build** — `npm run build` → grün. Erreichbarkeit: Feld sichtbar im Admin-Makler-Anlage-Formular (`/admin/makler`).

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/makler/MaklerAnlegenForm.tsx
git commit -m "feat(makler): admin-formular rechtsform-select + kleinunternehmer-checkbox"
```

---

## Phase 5 — Abschluss-Verifikation

### Task 19: Voll-Build, Ratchets & Regel-4-Prod-Smoke

**Files:** keine (Verifikation)

- [ ] **Step 1: Voller Build + tsc**
```bash
npm run build
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```
Erwartet: beide grün.

- [ ] **Step 2: Relevante Ratchets** (lokal `--warn`, aber prüfen)
```bash
npm run check:component-set -- --ratchet
npm run check:token-audit
npm run check:rls-policies -- --ratchet
npm run check:query-drift
```
Erwartet: keine NEUEN Verletzer durch diese Änderung.

- [ ] **Step 3: PR eröffnen** (Regel 1 — gegen `staging`/`main`, nicht `main` pushen)
```bash
git push -u origin kitta/makler-empfehlung-override
gh pr create --base main --head kitta/makler-empfehlung-override \
  --title "feat(makler): Empfehlungsstruktur + 10-EUR-Override + Rechtsform-Pflicht Admin" \
  --body "Siehe docs/superpowers/specs/2026-07-17-makler-empfehlung-override-design.md. 5 Migrationen (sponsor_makler_id+guard, partner_typ-CHECK, create_makler_provision-override, RLS-SELECT, RPC) + Referral-Signup (werber-link) + Empfehlungen-Portal + Rechtsform-Pflicht im Admin. Regel-4-Smoke nach Deploy (Task 19 Step 4)."
```

- [ ] **Step 4: Regel-4-Prod-Smoke** (nach Prod-Deploy, Playwright, Test-Accounts `telefon=NULL`) — Flows aus Spec §12:
  1. Als Test-Werber **W** → `/makler/empfehlungen`: Link + WhatsApp/E-Mail/Kopieren sichtbar; `wa.me`-Link öffnet mit Text.
  2. `…/makler/registrieren?werber=<W-code>` → registrieren (Rechtsform pflicht). DB-Verify: neuer Makler `status='aktiv'`, `sponsor_makler_id=W`, geerbte Sätze, `rechtsform` gesetzt.
  3. Claim X-attribuiert → bridge. DB-Verify `partner_provisionen`: `(makler,X,…,pending)` **und** `(makler_empfehlung,W,10,pending)`.
  4. `/makler/empfehlungen` als W → X in Downline (1 Gutachten / 10 €).
  5. `/admin/makler` Anlage ohne Rechtsform → Fehler; mit Rechtsform → Makler mit gesetzter `rechtsform`.
- Ergebnis (grün/rot + Assertions) im PR/Marker dokumentieren. Rot → Fix-PR; Task bleibt offen bis grün.

- [ ] **Step 5: Session-Abschluss** (Regel 3) — `git status` clean, `git stash list` leer, alle Commits gepusht.

---

## Notizen für Executor

- **Provisions-Release/Storno** ist geteilte, aktuell **nicht verdrahtete** Infra (`partner_provisionen`). Override sitzt wie die Basis auf `pending` — **keinen** Parallel-Cron bauen (Spec §9). Separat an Aaron flaggen.
- **Portal-Read-Drift** (`makler/queries.ts` liest die gedroppte `makler_provisionen`) NICHT in dieser Lane fixen.
- **E-Mail-Share** ist bewusst `mailto:` (client), nicht Server-Send — vereinfacht die Spec-Erwähnung „Server-Action" und vermeidet einen Spam-Vektor.
- Bei RPC-Args-Namen (`p_makler_id`) und `shared/*`-Export-Namen (StatCard/DataTable) immer gegen den regenerierten `database.types.ts` bzw. die tatsächlichen Barrel-Exporte prüfen.
- **CI-Awareness `check:claims-column-grants`** (siehe `COORDINATION-AN-claims-column-grants-blocker`): Der Guard prüft den **prod-Zustand** aller `claims`-Spalten-Grants und läuft bei **jedem** SQL-Diff-PR — also auch bei meinem (5 Migrationen). Diese Lane **fügt keine `claims`-Spalte hinzu** (RPC liest claims nur SECURITY DEFINER), trippt den Guard also nicht selbst. Stand 2026-07-17 ist der Guard **grün** (alle 6 reparatur/kva-Spalten gegated). Sollte mein PR-CI daran rot sein, ist das eine **fremde** ungegatete claims-Spalte (nicht meine) → mit der verursachenden Lane koordinieren, nicht selbst granten.
