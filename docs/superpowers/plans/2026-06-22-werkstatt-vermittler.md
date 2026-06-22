# Werkstatt-Vermittler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Werkstätten vermitteln Claims via gedruckten QR-Code → FlowLink; jeder Claim trägt die `werkstatt_id` und löst eine 150-€-Provision aus; Werkstätten haben eine eigene Rolle, ein Portal (QR-Abruf + Provisions-Übersicht) und werden vom Admin angelegt.

**Architecture:** Neue Vermittler-Entität durch additive Erweiterung der bestehenden (leeren) `werkstaetten`-Tabelle + neue Rolle `werkstatt`. Eine `werkstatt_id` fließt kanonisch **gfa → lead → claim** (neue Kette, Präzedenz `werkstatt_seit_datum`). Provision via DB-Trigger auf `claims`-INSERT (DB-nativ, garantiert). Werkstatt-QR mountet den bestehenden Gutachter-Finder-Wizard (location-first) mit vorgesetzter `werkstatt_id`. Makler-**Muster** für Anlage/Portal/Provisions-Cron gespiegelt (nie Tabelle/Code geteilt — Makler ist eine eigene Rolle).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Postgres (DDL via Plugin `apply_migration`), TypeScript, Tailwind v4 + Claimondo-Tokens, `qrcode` v1.5.4, Mapbox Isochrone, vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-werkstatt-vermittler-design.md`.

## Global Constraints

- **Regel 1:** Branch `kitta/werkstatt-vermittler` (existiert), PR gegen `staging`, nie direkt `main`.
- **Regel 2 (DDL):** Schema-Änderungen NUR via `mcp__plugin_supabase_supabase__apply_migration`. Ablauf je Migration: `apply_migration({name, query})` → `list_migrations` (recorded Version `<V>` ablesen) → File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == `<V>`). `execute_sql` nur READ. project_id = `paizkjajbuxxksdoycev`.
- **Regel 3:** Kein unbegleiteter Stash am Session-Ende.
- **CMM-49-Koordination (Marker `COORDINATION-werkstatt-cmm49.md`):** `werkstatt_id` NUR auf Survivor (claims/leads/gfa), NIE auf `faelle` (wird gedroppt). Vor jedem Touch von `convert-lead-to-claim.ts` (CMM-49-Hot-File): merge-base-Diff gegen die CMM-49-Lane, nicht blind `git diff origin/staging`.
- **7-Punkte-Audit** in JEDER Commit-Message (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression), über `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (nicht `throw`); `revalidatePath` bei jedem Write; non-critical Sub-Sends (WA/Email) in lokalem try/catch.
- **Frontend-Umlaute:** ALLE nutzersichtbaren Strings mit echten `ä/ö/ü/ß` (Buttons, Labels, Toasts, Email/WA-Templates).
- **Komponenten:** `primitives.Button`/`primitives.Card`/`shared/*` statt handgerolltem Tailwind; Tokens (`bg-claimondo-*`, `rounded-ios-*`, `text-body`/`text-heading-*`), kein Inline-Hex. Net-New-Gates erst NACH `git add` laufen lassen.
- **Build-Gate:** `npm run build` grün vor jedem Commit an Routen/Server-Actions (Next 16 findet Validator-Fehler nur im vollen Build). Plus `npm run check:token-audit`/`check:component-set`/`check:knip` (Ratchets).

## Reconciliations (während der Recherche gegen DB/Code gefunden — von der Spec leicht abweichend, mit Grund)

1. **`werkstatt_provisionen` spiegelt das ECHTE `makler_provisionen`-Schema** (statt des einfacheren Spec-Schemas): Spalten `betrag_netto_eur`, Status `pending|freigegeben|storniert|ausgezahlt`, `hold_until`, `trigger_event`, `trigger_at`, `fall_id`, `claim_id`, `erstellt_am`. Grund: der `release-werkstatt-provisionen`-Cron + die Portal-Provisions-Query können dann 1:1 die Makler-Muster spiegeln (Konsistenz app-weit). „Fällig bei Claim-Erstellung" (Aaron) = der Trigger legt die Zeile bei Claim-INSERT mit `status='pending'`, `trigger_event='claim_created'`, `trigger_at=now()` an; `hold_until=now()+7d` (Clawback-Fenster, Aaron-tunbar) → Release-Cron flippt `pending→freigegeben`.
2. **Provisions-ERZEUGUNG ist neu (DB-Trigger).** Makler hat GAR KEINEN Erzeugungspunkt (kein Insert/Trigger — Lücke). Werkstatt füllt sie korrekt per DB-Trigger.
3. **Werkstatt-QR ist statisch + nicht-signiert.** Anders als `/start/[anfrageId]` (HMAC schützt eine bestehende anfrageId) trägt der Werkstatt-QR nur eine opake, nicht-geheime `werkstatt_id`. Der Einstieg validiert sie gegen `werkstaetten` (existiert + `status='aktiv'`); kein HMAC nötig.
4. **Auto-Beratungs-Rückruf ist im Embed-Pfad bereits gebaut** (`reserviereEmbedTermin` → `upsertReservierungsRueckruf`). Werkstatt erbt das, weil es denselben FinderWizard nutzt — keine separate Arbeit hier (die generelle „immer beraten"-Strecke = Schwester-Spec).

---

## File Structure

**Neu:**
- `supabase/migrations/<V1>_werkstatt_role.sql` — `ALTER TYPE user_role ADD VALUE 'werkstatt'` (eigene Migration, nicht-transaktional).
- `supabase/migrations/<V2>_werkstatt_entity.sql` — werkstaetten-Erweiterung + werkstatt_id auf gfa/leads/claims + werkstatt_provisionen + RLS + Indizes.
- `supabase/migrations/<V3>_werkstatt_provision_trigger.sql` — Trigger-Funktion + Trigger auf claims.
- `src/app/admin/werkstaetten/page.tsx` + `WerkstaettenClient.tsx` + `actions.ts` — Admin-Liste + Anlage.
- `src/app/start/werkstatt/[werkstattId]/page.tsx` — QR-Einstieg (validiert + mountet FinderWizard).
- `src/app/api/cron/release-werkstatt-provisionen/route.ts` — Provisions-Release (Muster Makler).
- `src/app/werkstatt/(shell)/layout.tsx` + `page.tsx` (Dashboard) + `promo/page.tsx` (QR) + `abrechnungen/page.tsx` (Provisionen).
- `src/components/werkstatt/WerkstattShell.tsx` + `WerkstattPromo.tsx`.
- `src/lib/werkstatt/queries.ts` — Portal-Reads (leak-sicher).
- `src/lib/start-link/werkstatt-start-url.ts` — Start-URL-Builder.

**Geändert:**
- `src/lib/actions/gutachter-finder-actions.ts` — `GutachterFinderPayload.werkstatt_id` + gfa-Insert.
- `src/app/embed/gutachter-finder/actions.ts` — `EmbedBuchungInput.werkstatt_id` + `reserviereEmbedTermin`-Input + Durchreichung.
- `src/lib/start-link/issue-canonical-flowlink.ts` — gfa→lead-Mapping um `werkstatt_id`.
- `src/lib/leads/convert-lead-to-claim.ts:363` — `werkstatt_id` im claimsInsert.
- `src/app/embed/gutachter-finder/_components/FinderWizard.tsx` — `werkstattId`-Prop + „Auto bei Werkstatt?"-Location-Step.
- `src/app/flow/[token]/self-service-actions.ts` — `ladeMatchingFlow` werkstatt-Geo-Auflösung (Safety-Net).
- `src/lib/auth/portal-guard.ts` (+ `roleToPath`) + der `UserRolle`-Typ — `'werkstatt'` ergänzen.

---

## WP-A — Datenbank-Fundament

### Task 1: Migration — Rolle `werkstatt`

**Files:**
- Create: `supabase/migrations/<V1>_werkstatt_role.sql` (Name nach recorded Version)

**Interfaces:**
- Produces: enum-Wert `'werkstatt'` in `user_role` (Consumer: profiles.rolle, portal-guard).

- [ ] **Step 1: DDL via Plugin anwenden**

`ALTER TYPE user_role ADD VALUE` ist NICHT transaktional rückrollbar und darf nicht im selben Tx wie eine Nutzung stehen → eigene Migration, zuerst.
```
apply_migration({
  name: "werkstatt_role",
  query: "ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'werkstatt';"
})
```

- [ ] **Step 2: Recorded Version ablesen + verifizieren**

Run: `list_migrations` → die vom Plugin vergebene Version `<V1>` notieren.
Run (READ): `execute_sql("select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='werkstatt'")` → Expected: 1 Zeile.

- [ ] **Step 3: Migration-File committen (Dateiname == `<V1>`)**

Schreibe `supabase/migrations/<V1>_werkstatt_role.sql` mit exakt dem applizierten DDL.
```bash
git add supabase/migrations/<V1>_werkstatt_role.sql
git commit -m "feat(werkstatt): Rolle 'werkstatt' im user_role-enum (Migration)"
```

### Task 2: Migration — werkstaetten-Erweiterung + werkstatt_id-Spalten + werkstatt_provisionen

**Files:**
- Create: `supabase/migrations/<V2>_werkstatt_entity.sql`

**Interfaces:**
- Produces: `werkstaetten.{user_id, provision_betrag_netto, provision_aktiv, status, aktiviert_am, aktiviert_von, gesperrt_am, gesperrt_grund, bank_iban, bank_bic, bank_kontoinhaber}`; `werkstatt_id uuid` auf `gutachter_finder_anfragen`/`leads`/`claims`; Tabelle `werkstatt_provisionen`.

- [ ] **Step 1: DDL via Plugin anwenden**

```
apply_migration({
  name: "werkstatt_entity",
  query: `
-- werkstaetten zur Vermittler-Entitaet erweitern (additiv; Tabelle ist leer)
ALTER TABLE public.werkstaetten
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provision_betrag_netto numeric(10,2) NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS provision_aktiv boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aktiv',
  ADD COLUMN IF NOT EXISTS aktiviert_am timestamptz,
  ADD COLUMN IF NOT EXISTS aktiviert_von uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS gesperrt_am timestamptz,
  ADD COLUMN IF NOT EXISTS gesperrt_grund text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_bic text,
  ADD COLUMN IF NOT EXISTS bank_kontoinhaber text;
ALTER TABLE public.werkstaetten
  ADD CONSTRAINT werkstaetten_status_check CHECK (status IN ('aktiv','gesperrt'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_werkstaetten_user_id ON public.werkstaetten(user_id) WHERE user_id IS NOT NULL;

-- werkstatt_id auf die Survivor-Tabellen (NIE faelle — wird gedroppt)
ALTER TABLE public.gutachter_finder_anfragen ADD COLUMN IF NOT EXISTS werkstatt_id uuid REFERENCES public.werkstaetten(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS werkstatt_id uuid REFERENCES public.werkstaetten(id);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS werkstatt_id uuid REFERENCES public.werkstaetten(id);
CREATE INDEX IF NOT EXISTS idx_claims_werkstatt_id ON public.claims(werkstatt_id) WHERE werkstatt_id IS NOT NULL;

-- Provisionen (Schema gespiegelt nach makler_provisionen)
CREATE TABLE IF NOT EXISTS public.werkstatt_provisionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  fall_id uuid,
  betrag_netto_eur numeric(10,2) NOT NULL,
  trigger_event text NOT NULL DEFAULT 'claim_created',
  trigger_at timestamptz NOT NULL DEFAULT now(),
  hold_until timestamptz,
  status text NOT NULL DEFAULT 'pending',
  storniert_am timestamptz,
  storno_grund text,
  ausgezahlt_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT werkstatt_provisionen_status_check CHECK (status IN ('pending','freigegeben','storniert','ausgezahlt'))
);
-- ein Claim = eine Werkstatt = eine Provision
CREATE UNIQUE INDEX IF NOT EXISTS idx_werkstatt_provisionen_claim ON public.werkstatt_provisionen(claim_id);
CREATE INDEX IF NOT EXISTS idx_werkstatt_provisionen_werkstatt_status ON public.werkstatt_provisionen(werkstatt_id, status);
CREATE INDEX IF NOT EXISTS idx_werkstatt_provisionen_pending_release ON public.werkstatt_provisionen(hold_until) WHERE status='pending';

-- RLS: Werkstatt liest nur ihre eigenen Provisionen; Admin alles
ALTER TABLE public.werkstatt_provisionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY wp_admin_all ON public.werkstatt_provisionen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));
CREATE POLICY wp_werkstatt_read ON public.werkstatt_provisionen FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.werkstaetten w WHERE w.id = werkstatt_provisionen.werkstatt_id AND w.user_id = auth.uid()));
`
})
```

- [ ] **Step 2: Recorded Version ablesen + verifizieren**

Run: `list_migrations` → `<V2>` notieren.
Run (READ):
```
execute_sql("select count(*) filter (where table_name='claims' and column_name='werkstatt_id') as claims_wid,
  count(*) filter (where table_name='werkstaetten' and column_name='provision_betrag_netto') as w_prov
  from information_schema.columns where table_schema='public'")
```
Expected: `claims_wid=1`, `w_prov=1`. Plus `execute_sql("select to_regclass('public.werkstatt_provisionen')")` → not null.

- [ ] **Step 3: Migration-File committen (Dateiname == `<V2>`)**

```bash
git add supabase/migrations/<V2>_werkstatt_entity.sql
git commit -m "feat(werkstatt): werkstaetten-Erweiterung + werkstatt_id (gfa/leads/claims) + werkstatt_provisionen (Migration)"
```

### Task 3: Migration — Provisions-Trigger (fällig bei Claim-Erstellung)

**Files:**
- Create: `supabase/migrations/<V3>_werkstatt_provision_trigger.sql`

**Interfaces:**
- Consumes: `claims.werkstatt_id`, `werkstaetten.provision_betrag_netto`/`provision_aktiv`, Tabelle `werkstatt_provisionen` (Task 2).
- Produces: Trigger `trg_werkstatt_provision_on_claim` (AFTER INSERT ON claims).

- [ ] **Step 1: DDL via Plugin anwenden**

```
apply_migration({
  name: "werkstatt_provision_trigger",
  query: `
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  IF NEW.werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  INSERT INTO public.werkstatt_provisionen
    (werkstatt_id, claim_id, fall_id, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    (NEW.werkstatt_id, NEW.id, NEW.id, COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (claim_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_werkstatt_provision_on_claim
  AFTER INSERT ON public.claims
  FOR EACH ROW WHEN (NEW.werkstatt_id IS NOT NULL)
  EXECUTE FUNCTION public.create_werkstatt_provision();
`
})
```
Hinweis: `fall_id := NEW.id` (post-CMM-49-D2 ist `fall_id == claim_id`). `hold_until = now()+7d` ist das Clawback-Fenster — Aaron-tunbar.

- [ ] **Step 2: Recorded Version ablesen + Trigger-Smoke (READ-only Verifikation der Definition)**

Run: `list_migrations` → `<V3>`.
Run (READ): `execute_sql("select tgname from pg_trigger where tgrelid='public.claims'::regclass and tgname='trg_werkstatt_provision_on_claim'")` → 1 Zeile.

- [ ] **Step 3: Funktionaler Smoke (READ-Insert in Transaktion, danach rollback)**

Da `execute_sql` nur READ-Konvention hat, den End-to-End-Trigger-Test im vitest/Integration (Task 11) gegen die echte DB fahren, NICHT hier per execute_sql-Write. Hier nur Definition verifizieren (Step 2).

- [ ] **Step 4: Migration-File committen (Dateiname == `<V3>`)**

```bash
git add supabase/migrations/<V3>_werkstatt_provision_trigger.sql
git commit -m "feat(werkstatt): Provisions-Trigger auf claims-INSERT (faellig bei Erstellung)"
```

---

## WP-C — werkstatt_id-Threading (gfa → lead → claim)

### Task 4: werkstatt_id durch die Anfrage-Erzeugung + gfa→lead-Mapping fädeln

**Files:**
- Modify: `src/lib/actions/gutachter-finder-actions.ts` (Payload-Typ ~Z.51-72; Insert ~Z.248-277)
- Modify: `src/lib/start-link/issue-canonical-flowlink.ts` (createLead-extra ~Z.138-174)
- Modify: `src/app/embed/gutachter-finder/actions.ts` (`EmbedBuchungInput` Z.33-49; `starteEmbedBuchung` Z.55-69; `reserviereEmbedTermin`-Input Z.259-270 + Call Z.287-299)
- Modify: `src/lib/leads/convert-lead-to-claim.ts:363` (claimsInsert)

**Interfaces:**
- Consumes: `gutachter_finder_anfragen.werkstatt_id`, `leads.werkstatt_id`, `claims.werkstatt_id` (WP-A Task 2).
- Produces: `werkstatt_id` fließt `reserviereEmbedTermin`/`starteEmbedBuchung` → gfa → lead → claim.

> Reine Wiring-Task (additive 1-Zeiler über bekannte Seams; `createLead`/`claimsInsert` reichen die Felder 1:1 durch). Verifikation = `tsc` + der End-to-End-Smoke in Task 11 Step 5 (Werkstatt-Anlage → QR → Anfrage → `gfa.werkstatt_id` → Lead → Claim mit `werkstatt_id`). Kein isolierter Unit-Test, weil der Pfad DB-/Mock-schwer ist und der E2E-Smoke ihn echt deckt.

- [ ] **Step 1: gfa-Insert + Payload erweitern**

In `src/lib/actions/gutachter-finder-actions.ts` — `GutachterFinderPayload` um `werkstatt_id?: string | null` ergänzen; im `.from('gutachter_finder_anfragen').insert({...})`:
```ts
werkstatt_id: payload.werkstatt_id ?? null,
```

- [ ] **Step 2: gfa→lead-Mapping erweitern**

In `src/lib/start-link/issue-canonical-flowlink.ts`, im `createLead(admin, {...}, { ...extra })`-Aufruf (Z.~172, neben `ga_client_id`):
```ts
werkstatt_id: (gfa.werkstatt_id as string | null) ?? null,
```
(`createLead`/`src/lib/leads/create-lead.ts` reicht beliebige extra-Felder 1:1 auf `leads` durch — keine Signatur-Änderung nötig.)

- [ ] **Step 3: Embed-Eingang durchreichen**

In `src/app/embed/gutachter-finder/actions.ts`:
- `EmbedBuchungInput` + `werkstatt_id?: string | null`.
- `starteEmbedBuchung` → im `erstelleGutachterFinderAnfrage({...})`-Call: `werkstatt_id: input.werkstatt_id ?? undefined,`.
- `reserviereEmbedTermin`-Input + `werkstatt_id?: string | null`; im `starteEmbedBuchung({...})`-Call: `werkstatt_id: input.werkstatt_id ?? null,`.

- [ ] **Step 4: lead→claim-Mapping (1 Zeile, CMM-49-Hot-File)**

ZUERST merge-base-Diff gegen die CMM-49-Lane prüfen (`convert-lead-to-claim.ts` ist deren Kern — nicht blind `git diff origin/staging`). Dann in `src/lib/leads/convert-lead-to-claim.ts` im `claimsInsert`, **direkt neben Z.363** `werkstatt_seit_datum:`:
```ts
werkstatt_id: (lead.werkstatt_id as string | null) ?? null,
```
(`ClaimInsert`-Typ ggf. um `werkstatt_id?: string | null` ergänzen, falls die generierten Types die Spalte noch nicht kennen → Record-Cast wie bei `operative_status` im selben File, Z.417.)

- [ ] **Step 5: tsc + Commit**

Run: `npx tsc --noEmit` → grün. (Voller `npm run build` folgt in Task 7, wenn die Route hinzukommt.)
```bash
git add src/lib/actions/gutachter-finder-actions.ts src/lib/start-link/issue-canonical-flowlink.ts src/app/embed/gutachter-finder/actions.ts src/lib/leads/convert-lead-to-claim.ts
git commit -m "feat(werkstatt): werkstatt_id-Threading gfa->lead->claim"
```

---

## WP-B — Admin-Anlage

### Task 5: `createWerkstatt`-Server-Action (Anlage + Geo + Portal-User)

**Files:**
- Create: `src/app/admin/werkstaetten/actions.ts`
- Test: `src/app/admin/werkstaetten/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`-Muster (`src/app/admin/team/actions.ts:19`), `calculateIsochrone` (`src/lib/isochrone/calculate-isochrone.ts:35`), `generatePassword`, `admin.auth.admin.createUser`.
- Produces: `createWerkstatt(formData: FormData): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Failing test — createWerkstatt validiert Pflichtfelder**

`src/app/admin/werkstaetten/__tests__/actions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
// Mock supabase-admin + auth; assert: fehlt name/adresse -> { ok:false }; happy path -> werkstaetten.insert mit rolle-user.
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx vitest run src/app/admin/werkstaetten/__tests__/actions.test.ts` → FAIL.

- [ ] **Step 3: Action implementieren (Muster `createMakler` + SV-Isochrone)**

`src/app/admin/werkstaetten/actions.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? user : null
}

export async function createWerkstatt(
  formData: FormData,
): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins' }

  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const adresse_strasse = String(formData.get('adresse_strasse') ?? '').trim()
  const adresse_plz = String(formData.get('adresse_plz') ?? '').trim()
  const adresse_ort = String(formData.get('adresse_ort') ?? '').trim()
  const lat = Number(formData.get('lat')); const lng = Number(formData.get('lng'))   // aus GooglePlaceAutocomplete
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const provision = Number(formData.get('provision_betrag_netto') ?? 150) || 150
  if (!name || !email || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Name, E-Mail und Standort sind Pflicht.' }
  }

  const admin = createAdminClient()
  const password = Math.random().toString(36).slice(-12) + 'A1!'   // generatePassword-Muster; Helper falls vorhanden nutzen
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { force_password_change: true },
  })
  if (authErr || !authUser?.user) return { ok: false, error: authErr?.message ?? 'User-Anlage fehlgeschlagen' }

  const { error: profErr } = await admin.from('profiles').insert({
    id: authUser.user.id, email, rolle: 'werkstatt', vorname: name,
    force_password_change: true, twofa_aktiviert: false, twofa_email_aktiviert: false,
  })
  if (profErr) return { ok: false, error: profErr.message }

  const normalized_name = name.toLowerCase().replace(/\s+/g, ' ').trim()
  const { data: w, error: wErr } = await admin.from('werkstaetten').insert({
    name, normalized_name, adresse_strasse, adresse_plz, adresse_ort, telefon, email,
    lat, lng, partner: true, user_id: authUser.user.id,
    provision_betrag_netto: provision, provision_aktiv: true,
    status: 'aktiv', aktiviert_am: new Date().toISOString(), aktiviert_von: adminUser.id,
  }).select('id').single()
  if (wErr || !w) return { ok: false, error: wErr?.message ?? 'Werkstatt-Anlage fehlgeschlagen' }

  // Isochrone defensiv (Muster anlegeSv) — werkstaetten.isochrone (jsonb, GeoJSON Polygon)
  try {
    const points = await calculateIsochrone(lat, lng, 30)
    const ring = points.map((p) => [p.lng, p.lat])
    const f = ring[0], l = ring[ring.length - 1]
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
    await admin.from('werkstaetten').update({ isochrone: { type: 'Polygon', coordinates: [ring] } }).eq('id', w.id)
  } catch (err) { console.error('[werkstatt] Isochrone fehlgeschlagen (non-fatal):', err) }

  revalidatePath('/admin/werkstaetten')
  return { ok: true, email, password }
}
```

- [ ] **Step 4: Run test → PASS**

Run: `npx vitest run src/app/admin/werkstaetten/__tests__/actions.test.ts` → PASS.

- [ ] **Step 5: Build + Commit**

Run: `npm run build` (Server-Action → voller Build).
```bash
git add src/app/admin/werkstaetten/
git commit -m "feat(werkstatt): Admin createWerkstatt (Geo+Isochrone+Portal-User)"
```

### Task 6: Admin-UI — Werkstatt-Liste + Anlage-Dialog

**Files:**
- Create: `src/app/admin/werkstaetten/page.tsx` (Server Component, admin-gated)
- Create: `src/app/admin/werkstaetten/WerkstaettenClient.tsx` (Liste + „Neue Werkstatt"-Dialog)
- Modify: das Admin-Nav (z.B. `src/components/admin/*Nav*` oder `src/app/admin/layout.tsx`) — Link „Werkstätten"

**Interfaces:**
- Consumes: `createWerkstatt` (Task 5), `GooglePlaceAutocomplete` (für lat/lng), `shared/DataTable`, `primitives.Button`/`primitives.Card`.

- [ ] **Step 1: Server-Page (admin-gate + Liste laden)**

`page.tsx`: redirect bei `rolle !== 'admin'`; lädt `werkstaetten` (id, name, adresse_ort, status, provision_betrag_netto, aktiviert_am) → an `WerkstaettenClient`.

- [ ] **Step 2: Client — DataTable + Dialog**

`WerkstaettenClient.tsx`: `shared/DataTable` für die Liste; „Neue Werkstatt"-`primitives.Button` öffnet ein `primitives`-Modal mit Form (Name, E-Mail, Telefon, `GooglePlaceAutocomplete` → hidden lat/lng/strasse/plz/ort, Provision default 150). Submit → `createWerkstatt(formData)`; bei `ok` Passwort + E-Mail anzeigen (einmalig, zum Weitergeben), Toast; bei `!ok` `toast.error`. Alle Strings mit Umlauten.

- [ ] **Step 3: Nav-Eintrag**

„Werkstätten"-Link in der Admin-Navigation (sichtbar nur für admin) → `/admin/werkstaetten`.

- [ ] **Step 4: Build + Gates + Commit**

Run: `git add` (Net-New erst nach add sichtbar für Ratchets) → `npm run build` → `npm run check:component-set -- --ratchet` → `npm run check:token-audit`.
```bash
git commit -m "feat(werkstatt): Admin-Liste + Anlage-Dialog + Nav"
```

---

## WP-C2 — QR-Einstieg

### Task 7: Werkstatt-Start-URL + QR-Einstiegs-Route

**Files:**
- Create: `src/lib/start-link/werkstatt-start-url.ts`
- Create: `src/app/start/werkstatt/[werkstattId]/page.tsx`
- Modify: `src/app/embed/gutachter-finder/_components/FinderWizard.tsx` (optionaler `werkstattId`-Prop, an `reserviereEmbedTermin` durchreichen)

**Interfaces:**
- Consumes: FinderWizard, `werkstaetten` (Validierung).
- Produces: `werkstattStartUrl(werkstattId, appUrl): string`; Route `/start/werkstatt/[werkstattId]`.

- [ ] **Step 1: Start-URL-Builder**

`werkstatt-start-url.ts`:
```ts
export function werkstattStartUrl(werkstattId: string, appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de') {
  return `${appUrl}/start/werkstatt/${werkstattId}`
}
```

- [ ] **Step 2: Einstiegs-Page (validiert werkstatt, mountet Wizard)**

`src/app/start/werkstatt/[werkstattId]/page.tsx` (Server Component): lädt `werkstaetten` (id, name, status, lat, lng, adresse_*) via admin-client; bei nicht gefunden ODER `status!=='aktiv'` → `redirect('/gutachter-finden')` (sauberer Fallback, kein Fehler). Sonst rendert `<FinderWizard werkstattId={id} werkstattName={name} werkstattGeo={{lat,lng,adresse}} />`. KEIN HMAC (statischer, nicht-geheimer Identifier — s. Reconciliation 3).

- [ ] **Step 3: FinderWizard nimmt werkstattId entgegen**

`FinderWizard.tsx`: optionale Props `werkstattId?: string`, `werkstattName?: string`, `werkstattGeo?: { lat:number; lng:number; adresse:string }`. Im finalen `reserviereEmbedTermin({...})`-Call: `werkstatt_id: werkstattId ?? null`. (Die „Auto bei Werkstatt?"-UI kommt in WP-E Task 10.)

- [ ] **Step 4: Build + Commit**

Run: `npm run build` (Route + Client) → grün.
```bash
git add src/lib/start-link/werkstatt-start-url.ts src/app/start/werkstatt/ src/app/embed/gutachter-finder/_components/FinderWizard.tsx
git commit -m "feat(werkstatt): QR-Einstieg /start/werkstatt/[id] mountet FinderWizard"
```

---

## WP-D — Provisions-Auszahlung

### Task 8: `release-werkstatt-provisionen`-Cron (Muster Makler)

**Files:**
- Create: `src/app/api/cron/release-werkstatt-provisionen/route.ts`
- Modify: `docs/vps-crontab.md` (Eintrag dokumentieren) + Aaron-Hinweis: VPS-crontab-Zeile ergänzen

**Interfaces:**
- Consumes: `werkstatt_provisionen`, `claims.operative_status` (Storno-Erkennung), `CRON_SECRET`.
- Produces: GET-Route, die `pending`→`freigegeben` flippt (nach `hold_until`) + Storno-Pass.

- [ ] **Step 1: Cron implementieren (spiegelt `release-makler-provisionen/route.ts`)**

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 })
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // 1) Storno-Pass: Claims, deren Provision pending ist + die storniert wurden
  const { data: pendings } = await admin
    .from('werkstatt_provisionen')
    .select('id, claim_id')
    .eq('status', 'pending')
  let storniert = 0, released = 0
  for (const p of pendings ?? []) {
    const { data: claim } = await admin.from('claims').select('operative_status').eq('id', p.claim_id).maybeSingle()
    const st = (claim?.operative_status as string | null) ?? null
    if (st === 'storniert' || st === 'abgelehnt') {
      await admin.from('werkstatt_provisionen').update({ status: 'storniert', storno_grund: 'fall_storniert', storniert_am: nowIso }).eq('id', p.id)
      storniert++
    }
  }
  // 2) Release-Pass: pending + hold_until <= now → freigegeben
  const { data: faellig } = await admin
    .from('werkstatt_provisionen')
    .select('id')
    .eq('status', 'pending')
    .lte('hold_until', nowIso)
  for (const f of faellig ?? []) {
    await admin.from('werkstatt_provisionen').update({ status: 'freigegeben' }).eq('id', f.id)
    released++
  }
  return NextResponse.json({ ok: true, storniert, released, timestamp: nowIso })
}
```

- [ ] **Step 2: Build + Commit**

Run: `npm run build` → grün.
```bash
git add src/app/api/cron/release-werkstatt-provisionen/ docs/vps-crontab.md
git commit -m "feat(werkstatt): release-werkstatt-provisionen Cron (pending->freigegeben + Storno-Pass)"
```

- [ ] **Step 3: VPS-Crontab (Aaron, manuell)**

`docs/vps-crontab.md` ergänzen + Aaron triggert `crontab -e` auf dem VPS: `0 2 * * * cron-call.sh /api/cron/release-werkstatt-provisionen` (analog Makler 02:00). Plan-Schritt = Doku; das Setzen ist eine VPS-Operation (Aaron).

---

## WP-F — Werkstatt-Portal

### Task 9: Rolle in den Portal-Guard + `/werkstatt`-Shell + Provisions-/QR-Seiten

**Files:**
- Modify: `src/lib/auth/portal-guard.ts` (+ `UserRolle`-Typ + `roleToPath`)
- Create: `src/app/werkstatt/(shell)/layout.tsx`, `page.tsx` (Dashboard), `promo/page.tsx` (QR), `abrechnungen/page.tsx`
- Create: `src/components/werkstatt/WerkstattShell.tsx`, `WerkstattPromo.tsx`
- Create: `src/lib/werkstatt/queries.ts`

**Interfaces:**
- Consumes: `requirePortalAccess(['werkstatt'])`, `generateQrCodeSvg` (`src/lib/kanzlei/qr-code.ts`), `werkstattStartUrl` (Task 7), `werkstatt_provisionen` + `claims` (leak-sichere Reads).
- Produces: Portal unter `/werkstatt`.

- [ ] **Step 1: Rolle bekannt machen**

`UserRolle`-Typ (wo definiert, z.B. `src/lib/auth/types` o.ä.) um `'werkstatt'` ergänzen; `roleToPath` in `portal-guard.ts` → `werkstatt: '/werkstatt'`.

- [ ] **Step 2: Shell-Layout (Muster makler `(shell)/layout.tsx`)**

`layout.tsx`: `const { user } = await requirePortalAccess(['werkstatt'])`; lädt die `werkstaetten`-Row via `eq('user_id', user.id)`; bei `status!=='aktiv'` → redirect Sperr-Hinweis. Rendert `<WerkstattShell werkstatt={...}>{children}</WerkstattShell>`.

- [ ] **Step 3: Nav + Dashboard**

`WerkstattShell.tsx` (Muster `MaklerShell`): Nav-Items `Übersicht` (`/werkstatt`), `QR-Code` (`/werkstatt/promo`), `Provisionen` (`/werkstatt/abrechnungen`), `Konto`. `page.tsx`: kurze Übersicht (Anzahl vermittelte Claims, offene/freigegebene Provisionssumme) via `src/lib/werkstatt/queries.ts`.

- [ ] **Step 4: QR-Seite**

`promo/page.tsx`: lädt die Werkstatt, baut `werkstattStartUrl(w.id)`, `const qrSvg = await generateQrCodeSvg(url, 240)`; `<WerkstattPromo qrSvg={qrSvg} url={url} />` mit Download/Druck (Muster `MaklerPromo`). Strings mit Umlauten („Hängen Sie diesen QR-Code in Ihrem Betrieb aus.").

- [ ] **Step 5: Provisionen-Seite (leak-sicher)**

`abrechnungen/page.tsx` + `queries.ts`: `getWerkstattProvisionen(werkstattId)` liest `werkstatt_provisionen` (betrag_netto_eur, status, trigger_at, claim_id) gefiltert `eq('werkstatt_id', werkstattId)` (RLS deckt zusätzlich ab) + join `claims`→`claim_nummer` (nur Nummer, keine PII). Anzeige: Datum, Claim-Nr, Betrag, Status (fällig/freigegeben/ausgezahlt/storniert). `shared/DataTable`.

- [ ] **Step 6: Build + Gates + Commit**

Run: `git add` → `npm run build` → `check:component-set`/`token-audit`/`knip` Ratchets.
```bash
git commit -m "feat(werkstatt): Portal /werkstatt (Shell + QR + Provisionen)"
```

---

## WP-E — Besichtigungsort „Auto bei Werkstatt?"

### Task 10: FinderWizard — „Steht das Fahrzeug bei [Werkstatt]?"-Location-Step

**Files:**
- Modify: `src/app/embed/gutachter-finder/_components/FinderWizard.tsx`
- Test: `src/app/embed/gutachter-finder/_components/__tests__/FinderWizard.werkstatt.test.tsx` (oder Logik in einen pure Helper auslagern + den testen)

**Interfaces:**
- Consumes: `werkstattId`/`werkstattGeo` (Task 7).
- Produces: Wenn `werkstattId` gesetzt, führt der Location-Step mit „Auto bei Werkstatt?" (Ja → `ort = werkstattGeo`; Nein → bestehender `GooglePlaceAutocomplete`/Map).

- [ ] **Step 1: Failing test — Ja setzt werkstatt-Geo als Ort**

Pure Helper `resolveWerkstattOrt(antwort, werkstattGeo, eingabe)` extrahieren und testen: `'ja'` → werkstattGeo; `'nein'` → eingabe.

- [ ] **Step 2: Run → FAIL**, dann Helper implementieren, **Run → PASS**.

- [ ] **Step 3: UI im Wizard**

Im Location-Step: wenn `werkstattId` gesetzt, ZUERST die Frage „Steht das Fahrzeug noch bei **{werkstattName}**?" mit zwei `primitives.Button` („Ja, in der Werkstatt" / „Nein, woanders"). „Ja" → `setOrt(werkstattGeo)` + weiter zum Matching (`ladeEmbedMatching`/`empfehleSvFuerOrt` mit der Werkstatt-Geo); „Nein" → bestehende Orts-Eingabe. Umlaute zwingend.

- [ ] **Step 4: Build + Commit**

Run: `npm run build` → grün.
```bash
git add src/app/embed/gutachter-finder/_components/
git commit -m "feat(werkstatt): FinderWizard 'Auto bei Werkstatt?'-Schritt (werkstatt-Geo als Besichtigungsort)"
```

### Task 11: ladeMatchingFlow — Werkstatt-Geo-Safety-Net (für /flow-Resume) + End-to-End-Smoke

**Files:**
- Modify: `src/app/flow/[token]/self-service-actions.ts` (`ladeMatchingFlow` ~Z.98-170)
- Test: `src/app/flow/[token]/__tests__/ladeMatchingFlow.werkstatt.test.ts`

**Interfaces:**
- Consumes: `leads.werkstatt_id`, `werkstaetten.lat/lng/adresse`.
- Produces: ein werkstatt-Lead ohne Coords erbt die Werkstatt-Geo (statt `ort_abfragen`), wenn das Auto dort steht — Resume-Sicherheitsnetz.

- [ ] **Step 1: Failing test**

`ladeMatchingFlow.werkstatt.test.ts`: Lead mit `werkstatt_id` gesetzt, ohne Coords → erwartet, dass die Werkstatt-Geo als Besichtigungsort genutzt/persistiert wird (oder, falls Produktentscheid „immer fragen": `ortFehlt=true` + werkstatt-Kontext). Default-Verhalten = Werkstatt-Geo als sinnvollster Resume-Fallback NACH dem Geocode-Fallback (#3064), VOR `ort_abfragen`.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Kette erweitern**

In `ladeMatchingFlow`: das `select` um `werkstatt_id` ergänzen; nach dem Geocode-Fallback (#3064) und wenn `lat/lng` weiterhin null + `lead.werkstatt_id` gesetzt: Werkstatt laden (`werkstaetten.lat/lng/adresse_*`), `lat/lng` setzen + auf `leads.besichtigungsort_*` persistieren (analog #3064-Cache). Nur als Resume-Safety-Net — der Hauptpfad (FinderWizard, Task 10) setzt den Ort schon vor Anlage.

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: End-to-End-Integration-Smoke (echte DB, manuell/CI)**

Manuell gegen staging-DB nach Deploy: Werkstatt anlegen → QR-URL → Wizard „Auto bei Werkstatt?"=Ja → Anfrage → `gfa.werkstatt_id` gesetzt → Lead `werkstatt_id` → Termin/Reservierung → Claim → genau eine `werkstatt_provisionen`-Zeile `pending`. Plus: Claim `operative_status='storniert'` setzen → Release-Cron → Provision `storniert`. (Trigger-Verifikation, die in Task 3 ausgespart wurde.)

- [ ] **Step 6: Build + Commit**

Run: `npm run build` → grün.
```bash
git add src/app/flow/[token]/
git commit -m "feat(werkstatt): ladeMatchingFlow Werkstatt-Geo-Safety-Net (Resume)"
```

---

## Reihenfolge & Abhängigkeiten

```
A (Task 1→2→3)  ──►  C (Task 4)  ──►  B (Task 5→6)  ──►  C2 (Task 7)  ──►  D (Task 8)  ──►  F (Task 9)  ──►  E (Task 10→11)
```
- Task 4 (Threading) braucht A2 (Spalten). Task 5/6 (Admin) braucht A2 (werkstaetten-Cols). Task 7 (QR) braucht 5/6 (Werkstätten existieren) + 4 (Threading). Task 8 (Cron) braucht A2/A3. Task 9 (Portal) braucht A2 + 7 (QR-URL). Task 10/11 (Besichtigungsort) braucht 7.
- **Jede Task = eigener Commit + grüner Build/Gate.** PRs gegen `staging` (klein, reviewbar) — z.B. WP-A als ein PR, dann WP-C, etc.

## Test-Strategie

- **vitest:** Threading-Mapping (Task 4), createWerkstatt-Validierung (Task 5), Besichtigungsort-Helper (Task 10), ladeMatchingFlow-Werkstatt (Task 11).
- **DB-Integration (Task 11 Step 5):** Trigger (Claim-Insert → genau eine pending-Provision; Storno → storniert) gegen die echte DB — NICHT per `execute_sql`-Write (Regel 2 READ-only), sondern als Post-Deploy-Smoke auf staging.
- **Build:** voller `npm run build` bei jedem Routen-/Server-Action-/Layout-Touch.

## Offene Aaron-Entscheidungen (im PR-Body markieren)

1. **Hold-Fenster** `now()+7d` (Clawback) vs. sofort `freigegeben` — Default 7d, leicht änderbar.
2. **`ausgezahlt`-Übergang:** wie Makler endet die Automatik bei `freigegeben` (Banküberweisung manuell). Falls echte Auto-Auszahlung gewünscht → Folge-Ticket.
3. **Provisions-Betrag pro Werkstatt** editierbar (`provision_betrag_netto`, Default 150) — Admin-UI-Feld vorhanden.
