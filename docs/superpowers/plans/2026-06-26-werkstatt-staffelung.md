# Werkstatt-Staffelung (Meilenstein-Boni) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro Werkstatt konfigurierbare Meilenstein-Boni (Schwelle freigegebener Vermittlungen → Einmal-Bonus), Admin-konfigurierbar, mit Fortschrittsbalken + erreichbaren Beträgen im Werkstatt-Portal.

**Architecture:** 2 neue Tabellen (`werkstatt_staffel_stufen` Konfig + `werkstatt_staffel_bonus` vergeben, snapshot/idempotent) + SQL-Vergabe-Funktion + Trigger auf `werkstatt_provisionen` (status→freigegeben). Admin-CRUD via Server-Actions + Modal in `/admin/werkstaetten`. Werkstatt-Anzeige via Dashboard-Karte (pure Fortschritts-Helper) + Bonus-Summe in „Provisionen".

**Tech Stack:** Supabase (Postgres, RLS, plpgsql Trigger/Funktion, via Plugin `apply_migration`), Next.js Server Actions + Server Components, React, vitest, `@/components/primitives` + `@/components/shared`.

## Global Constraints

- **DDL nur via Supabase-Plugin** `apply_migration`; Migration-File-Name == getrackte Version (Regel 2, Twin-Drift vermeiden). `execute_sql` nur READ.
- Metrik = `werkstatt_provisionen` mit `status IN ('freigegeben','ausgezahlt')` (settled), NICHT pending.
- Snapshot `schwelle`+`bonus_betrag_netto` auf Bonus-Zeile; Idempotenz `UNIQUE(werkstatt_id, schwelle)`; Bonus sofort `freigegeben`; kein Auto-Widerruf.
- UI-Strings Deutsch mit echten Umlauten. `Button`/`Modal` aus `primitives`, `DataTable`/`StatCard`/`SectionCard` aus `shared`. Token-Audit (keine raw hex/scales; `rounded-ios-*`, `text-body*`/`text-heading-*`).
- Server-Actions Result-Object (kein throw); **kein `type`/`const`-Export aus `'use server'`** (AAR-664). admin-gated.
- Amount-Spalte auf `werkstatt_provisionen` heißt `betrag_netto_eur`. Provision-RLS: `wp_werkstatt_read` (werkstatt_id=auth.uid()-Werkstatt).
- 7-Punkte-Audit. Base `staging`, PR gegen `staging`. Additive Migration → safe vor Merge.

---

### Task 1: DB-Schema (Tabellen + RLS + Vergabe-Funktion + Trigger)

**Vorgehen:** EINE Migration via `apply_migration({ name: 'werkstatt_staffelung', query: <DDL> })`. Danach `list_migrations` → getrackte Version `<V>` ablesen → File `supabase/migrations/<V>_werkstatt_staffelung.sql` mit identischem DDL committen. Dann `get_advisors({ type: 'security' })` + `execute_sql` (READ) Smoke.

- [ ] **Step 1: DDL via apply_migration anwenden**

```sql
-- werkstatt_staffel_stufen: per-Werkstatt Meilenstein-Konfiguration
CREATE TABLE IF NOT EXISTS public.werkstatt_staffel_stufen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id) ON DELETE CASCADE,
  schwelle integer NOT NULL CHECK (schwelle > 0),
  bonus_betrag_netto numeric(10,2) NOT NULL CHECK (bonus_betrag_netto >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT werkstatt_staffel_stufen_werkstatt_schwelle_uq UNIQUE (werkstatt_id, schwelle)
);
CREATE INDEX IF NOT EXISTS idx_werkstatt_staffel_stufen_werkstatt
  ON public.werkstatt_staffel_stufen(werkstatt_id);

ALTER TABLE public.werkstatt_staffel_stufen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wss_admin_all ON public.werkstatt_staffel_stufen;
CREATE POLICY wss_admin_all ON public.werkstatt_staffel_stufen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));
DROP POLICY IF EXISTS wss_werkstatt_read ON public.werkstatt_staffel_stufen;
CREATE POLICY wss_werkstatt_read ON public.werkstatt_staffel_stufen FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.werkstaetten w
                 WHERE w.id = werkstatt_staffel_stufen.werkstatt_id AND w.user_id = auth.uid()));

-- werkstatt_staffel_bonus: vergebene Boni (snapshot schwelle+betrag)
CREATE TABLE IF NOT EXISTS public.werkstatt_staffel_bonus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id) ON DELETE CASCADE,
  stufe_id uuid REFERENCES public.werkstatt_staffel_stufen(id) ON DELETE SET NULL,
  schwelle integer NOT NULL,
  bonus_betrag_netto numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'freigegeben'
    CHECK (status IN ('freigegeben','ausgezahlt','storniert')),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT werkstatt_staffel_bonus_werkstatt_schwelle_uq UNIQUE (werkstatt_id, schwelle)
);
CREATE INDEX IF NOT EXISTS idx_werkstatt_staffel_bonus_werkstatt
  ON public.werkstatt_staffel_bonus(werkstatt_id);

ALTER TABLE public.werkstatt_staffel_bonus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsb_admin_all ON public.werkstatt_staffel_bonus;
CREATE POLICY wsb_admin_all ON public.werkstatt_staffel_bonus FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));
DROP POLICY IF EXISTS wsb_werkstatt_read ON public.werkstatt_staffel_bonus;
CREATE POLICY wsb_werkstatt_read ON public.werkstatt_staffel_bonus FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.werkstaetten w
                 WHERE w.id = werkstatt_staffel_bonus.werkstatt_id AND w.user_id = auth.uid()));

-- Vergabe-Funktion: settled-count -> erreichte Stufen idempotent vergeben
CREATE OR REPLACE FUNCTION public.award_werkstatt_staffel_boni(p_werkstatt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_werkstatt_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.werkstatt_provisionen
   WHERE werkstatt_id = p_werkstatt_id AND status IN ('freigegeben','ausgezahlt');
  INSERT INTO public.werkstatt_staffel_bonus
    (werkstatt_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT s.werkstatt_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
    FROM public.werkstatt_staffel_stufen s
   WHERE s.werkstatt_id = p_werkstatt_id AND s.schwelle <= v_count
  ON CONFLICT (werkstatt_id, schwelle) DO NOTHING;
END; $$;

-- Trigger-Funktion + Trigger (feuert beim Release-Cron-UPDATE pending->freigegeben)
CREATE OR REPLACE FUNCTION public.trg_award_werkstatt_staffel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_werkstatt_staffel_boni(NEW.werkstatt_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_staffel ON public.werkstatt_provisionen;
CREATE TRIGGER trg_award_staffel
  AFTER INSERT OR UPDATE OF status ON public.werkstatt_provisionen
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_werkstatt_staffel();

-- RPC nur fuer service_role (Admin-Action ruft via createAdminClient); NICHT authenticated
REVOKE ALL ON FUNCTION public.award_werkstatt_staffel_boni(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_werkstatt_staffel_boni(uuid) TO service_role;
```

- [ ] **Step 2:** `list_migrations` → Version `<V>` ablesen. `supabase/migrations/<V>_werkstatt_staffelung.sql` mit obigem DDL anlegen + committen (`git add` + commit).
- [ ] **Step 3:** `get_advisors({ type: 'security' })` — keine neuen RLS-/SECURITY-DEFINER-Warnungen für die 2 Tabellen/Funktionen (search_path gesetzt → ok).
- [ ] **Step 4 (Smoke, execute_sql READ):**
```sql
-- Tabellen + RLS da?
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('werkstatt_staffel_stufen','werkstatt_staffel_bonus');
-- Trigger da?
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.werkstatt_provisionen'::regclass AND tgname = 'trg_award_staffel';
```
Expected: 2 Tabellen mit `relrowsecurity=true`, Trigger vorhanden.

- [ ] **Step 5: Commit** (Migration-File). Audit-Body.

---

### Task 2: TypeScript-Typen (surgisch)

**Files:** Modify `src/lib/database.types.ts`

Surgisch die 2 Tabellen in `Database['public']['Tables']` ergänzen (additiv, kleiner Diff statt voller Regen → kein Konflikt mit Parallel-Sessions). Pro Tabelle `Row`/`Insert`/`Update`/`Relationships`.

- [ ] **Step 1:** Im `Tables`-Block (alphabetisch bei `werkstatt_*`) einfügen:

```typescript
      werkstatt_staffel_stufen: {
        Row: { id: string; werkstatt_id: string; schwelle: number; bonus_betrag_netto: number; created_at: string }
        Insert: { id?: string; werkstatt_id: string; schwelle: number; bonus_betrag_netto: number; created_at?: string }
        Update: { id?: string; werkstatt_id?: string; schwelle?: number; bonus_betrag_netto?: number; created_at?: string }
        Relationships: []
      }
      werkstatt_staffel_bonus: {
        Row: { id: string; werkstatt_id: string; stufe_id: string | null; schwelle: number; bonus_betrag_netto: number; status: string; erstellt_am: string }
        Insert: { id?: string; werkstatt_id: string; stufe_id?: string | null; schwelle: number; bonus_betrag_netto: number; status?: string; erstellt_am?: string }
        Update: { id?: string; werkstatt_id?: string; stufe_id?: string | null; schwelle?: number; bonus_betrag_netto?: number; status?: string; erstellt_am?: string }
        Relationships: []
      }
```
(Relationships leer halten — wie bei anderen surgisch ergänzten Tabellen; FK-Typing nicht nötig für unsere Queries.)

- [ ] **Step 2:** `npx tsc --noEmit` → keine NEUEN Fehler in unseren Files (bekannte env-dep-Fehler ignorieren).
- [ ] **Step 3: Commit.**

---

### Task 3: Query-Helper

**Files:** Modify `src/lib/werkstatt/queries.ts`

**Interfaces — Produces:**
- `getWerkstattVermittlungsCount(werkstattId: string): Promise<{ settled: number; pending: number }>`
- `getWerkstattStaffelStufen(werkstattId: string): Promise<{ schwelle: number; bonus_betrag_netto: number }[]>`
- `getWerkstattStaffelBoni(werkstattId: string): Promise<{ schwelle: number; bonus_betrag_netto: number; status: string; erstellt_am: string }[]>`

- [ ] **Step 1:** Ans Ende von `queries.ts` anhängen:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Staffelung (Meilenstein-Boni)
// ─────────────────────────────────────────────────────────────────────────────

/** settled = freigegeben+ausgezahlt (zaehlt fuer Meilensteine), pending = Hinweis. */
export async function getWerkstattVermittlungsCount(
  werkstattId: string,
): Promise<{ settled: number; pending: number }> {
  const supabase = await createClient()
  const [settledRes, pendingRes] = await Promise.all([
    supabase.from('werkstatt_provisionen').select('id', { count: 'exact', head: true })
      .eq('werkstatt_id', werkstattId).in('status', ['freigegeben', 'ausgezahlt']),
    supabase.from('werkstatt_provisionen').select('id', { count: 'exact', head: true })
      .eq('werkstatt_id', werkstattId).eq('status', 'pending'),
  ])
  return { settled: settledRes.count ?? 0, pending: pendingRes.count ?? 0 }
}

export async function getWerkstattStaffelStufen(
  werkstattId: string,
): Promise<{ schwelle: number; bonus_betrag_netto: number }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('werkstatt_staffel_stufen')
    .select('schwelle, bonus_betrag_netto').eq('werkstatt_id', werkstattId)
    .order('schwelle', { ascending: true })
  return (data ?? []).map((r) => ({
    schwelle: Number((r as unknown as { schwelle: number }).schwelle),
    bonus_betrag_netto: Number((r as unknown as { bonus_betrag_netto: number }).bonus_betrag_netto),
  }))
}

export async function getWerkstattStaffelBoni(
  werkstattId: string,
): Promise<{ schwelle: number; bonus_betrag_netto: number; status: string; erstellt_am: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('werkstatt_staffel_bonus')
    .select('schwelle, bonus_betrag_netto, status, erstellt_am').eq('werkstatt_id', werkstattId)
    .order('schwelle', { ascending: true })
  return (data ?? []).map((r) => ({
    schwelle: Number((r as unknown as { schwelle: number }).schwelle),
    bonus_betrag_netto: Number((r as unknown as { bonus_betrag_netto: number }).bonus_betrag_netto),
    status: (r as unknown as { status: string }).status,
    erstellt_am: (r as unknown as { erstellt_am: string }).erstellt_am,
  }))
}
```

- [ ] **Step 2:** `npx tsc --noEmit` (unsere Files clean). **Step 3: Commit.**

---

### Task 4: Pure Fortschritts-Helper + Test

**Files:** Create `src/lib/werkstatt/staffel.ts`, Test `src/lib/werkstatt/__tests__/staffel.test.ts`

**Interfaces — Produces:**
- type `StaffelStufe = { schwelle: number; bonus_betrag_netto: number }`
- type `StaffelFortschritt = { naechste: StaffelStufe | null; prozent: number; alleErreicht: boolean; erreichteSchwellen: number[] }`
- `berechneStaffelFortschritt(settledCount: number, stufen: StaffelStufe[], vergebeneSchwellen: number[]): StaffelFortschritt`

- [ ] **Step 1: Test schreiben:**

```typescript
import { describe, it, expect } from 'vitest'
import { berechneStaffelFortschritt } from '../staffel'

const stufen = [
  { schwelle: 10, bonus_betrag_netto: 500 },
  { schwelle: 25, bonus_betrag_netto: 1500 },
]

describe('berechneStaffelFortschritt', () => {
  it('waehlt die naechste nicht erreichte Stufe + Prozent', () => {
    const r = berechneStaffelFortschritt(4, stufen, [])
    expect(r.naechste?.schwelle).toBe(10)
    expect(r.prozent).toBe(40)
    expect(r.alleErreicht).toBe(false)
  })
  it('springt zur naechsten Stufe wenn die erste erreicht ist', () => {
    const r = berechneStaffelFortschritt(12, stufen, [10])
    expect(r.naechste?.schwelle).toBe(25)
    // Prozent relativ zwischen 10 und 25: (12-10)/(25-10) = 13.33%
    expect(Math.round(r.prozent)).toBe(13)
    expect(r.erreichteSchwellen).toContain(10)
  })
  it('alleErreicht wenn ueber der hoechsten Schwelle', () => {
    const r = berechneStaffelFortschritt(30, stufen, [10, 25])
    expect(r.naechste).toBeNull()
    expect(r.alleErreicht).toBe(true)
    expect(r.prozent).toBe(100)
  })
  it('leere Stufen -> alleErreicht=false, naechste=null, 0%', () => {
    const r = berechneStaffelFortschritt(5, [], [])
    expect(r.naechste).toBeNull()
    expect(r.alleErreicht).toBe(false)
    expect(r.prozent).toBe(0)
  })
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/werkstatt/__tests__/staffel.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementierung:**

```typescript
// Pure Helper fuer den Staffel-Fortschritt im Werkstatt-Portal. Keine I/O.

export type StaffelStufe = { schwelle: number; bonus_betrag_netto: number }
export type StaffelFortschritt = {
  naechste: StaffelStufe | null
  prozent: number
  alleErreicht: boolean
  erreichteSchwellen: number[]
}

export function berechneStaffelFortschritt(
  settledCount: number,
  stufen: StaffelStufe[],
  vergebeneSchwellen: number[],
): StaffelFortschritt {
  const sorted = [...stufen].sort((a, b) => a.schwelle - b.schwelle)
  const erreichteSchwellen = sorted.filter((s) => settledCount >= s.schwelle).map((s) => s.schwelle)
  const naechste = sorted.find((s) => settledCount < s.schwelle) ?? null

  if (sorted.length === 0) {
    return { naechste: null, prozent: 0, alleErreicht: false, erreichteSchwellen }
  }
  if (!naechste) {
    return { naechste: null, prozent: 100, alleErreicht: true, erreichteSchwellen }
  }
  // Basis = hoechste bereits erreichte Schwelle (oder 0), Fortschritt relativ zur naechsten
  const basis = erreichteSchwellen.length > 0 ? Math.max(...erreichteSchwellen) : 0
  const spanne = naechste.schwelle - basis
  const prozent = spanne <= 0 ? 0 : Math.min(100, Math.max(0, ((settledCount - basis) / spanne) * 100))
  return { naechste, prozent, alleErreicht: false, erreichteSchwellen }
}
```
(`vergebeneSchwellen` ist Teil der Signatur für künftige „bereits ausgezahlt"-Markierung in der UI; wird hier nicht für die Prozent-Logik gebraucht — die Anzeige nutzt es separat.)

- [ ] **Step 4:** `npx vitest run …/staffel.test.ts` → 4 passed. **Step 5: Commit.**

---

### Task 5: Werkstatt-Dashboard-Karte

**Files:** Create `src/components/werkstatt/WerkstattStaffelCard.tsx`, Modify `src/app/werkstatt/(shell)/page.tsx`

**Interfaces — Consumes:** `berechneStaffelFortschritt` (T4), `getWerkstattVermittlungsCount`/`getWerkstattStaffelStufen`/`getWerkstattStaffelBoni` (T3).

- [ ] **Step 1: Komponente** `WerkstattStaffelCard.tsx` (Client; rendert nur, wenn `stufen.length > 0`):

```tsx
'use client'

// Staffel-Fortschritt im Werkstatt-Dashboard: Balken zur naechsten Meilenstein-
// Schwelle + erreichbare Bonus-Betraege. Reine Anzeige.

import { TrophyIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { berechneStaffelFortschritt, type StaffelStufe } from '@/lib/werkstatt/staffel'

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

type Props = {
  settledCount: number
  pendingCount: number
  stufen: StaffelStufe[]
  vergebeneSchwellen: number[]
}

export function WerkstattStaffelCard({ settledCount, pendingCount, stufen, vergebeneSchwellen }: Props) {
  if (stufen.length === 0) return null
  const f = berechneStaffelFortschritt(settledCount, stufen, vergebeneSchwellen)

  return (
    <SectionCard icon={<TrophyIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Ihre Staffelung">
      {f.alleErreicht ? (
        <p className="text-body text-claimondo-navy font-semibold">
          Alle Meilensteine erreicht — stark! 🎉
        </p>
      ) : f.naechste ? (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-body-sm text-claimondo-ondo">
              Nächster Meilenstein: <strong className="text-claimondo-navy">{f.naechste.schwelle} Kunden</strong>
            </span>
            <span className="text-body font-semibold text-claimondo-navy">
              +{EUR.format(f.naechste.bonus_betrag_netto)}
            </span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-ios-sm bg-claimondo-bg border border-claimondo-border">
            <div className="h-full rounded-ios-sm bg-claimondo-ondo transition-all" style={{ width: `${f.prozent}%` }} />
          </div>
          <p className="mt-1 text-caption text-claimondo-ondo/70">
            {settledCount} von {f.naechste.schwelle} freigegebenen Vermittlungen
            {pendingCount > 0 ? ` · ${pendingCount} in Prüfung` : ''}
          </p>
        </div>
      ) : null}

      <ul className="mt-4 space-y-1.5">
        {stufen.map((s) => {
          const erreicht = f.erreichteSchwellen.includes(s.schwelle)
          return (
            <li key={s.schwelle} className="flex items-center justify-between text-body-sm">
              <span className={erreicht ? 'text-success-strong font-medium' : 'text-claimondo-ondo'}>
                {erreicht ? '✓' : '○'} {s.schwelle} Kunden
              </span>
              <span className={erreicht ? 'text-success-strong font-semibold' : 'text-claimondo-navy'}>
                {EUR.format(s.bonus_betrag_netto)}
              </span>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
```
(Falls `SectionCard`-Props abweichen: an die tatsächliche Signatur anpassen — beim Implementieren `SectionCard` kurz lesen. Balken: token-konform, kein raw hex.)

- [ ] **Step 2: Dashboard verdrahten** (`page.tsx`): nach `getWerkstattOverview` die Staffel-Daten laden + Karte rendern (oberhalb der „So funktioniert"-Section):

```tsx
import { getWerkstattByUserId, getWerkstattOverview, getWerkstattVermittlungsCount, getWerkstattStaffelStufen, getWerkstattStaffelBoni } from '@/lib/werkstatt/queries'
import { WerkstattStaffelCard } from '@/components/werkstatt/WerkstattStaffelCard'
// ...
  const [overview, vermittlung, stufen, boni] = await Promise.all([
    getWerkstattOverview(werkstatt.id),
    getWerkstattVermittlungsCount(werkstatt.id),
    getWerkstattStaffelStufen(werkstatt.id),
    getWerkstattStaffelBoni(werkstatt.id),
  ])
  const vergebeneSchwellen = boni.map((b) => b.schwelle)
// ... im JSX vor der <section> "So funktioniert":
        <WerkstattStaffelCard
          settledCount={vermittlung.settled}
          pendingCount={vermittlung.pending}
          stufen={stufen}
          vergebeneSchwellen={vergebeneSchwellen}
        />
```

- [ ] **Step 3:** `npx tsc --noEmit` clean. **Step 4: Commit.**

---

### Task 6: Admin-Server-Actions + Test

**Files:** Create `src/app/admin/werkstaetten/staffel-actions.ts`, Test `src/app/admin/werkstaetten/__tests__/staffel-actions.test.ts`

**Interfaces — Produces:**
- `getWerkstattStaffel(werkstattId: string): Promise<{ ok: true; stufen: { schwelle: number; bonus_betrag_netto: number }[] } | { ok: false; error: string }>`
- `setWerkstattStaffel(werkstattId: string, stufen: { schwelle: number; bonus_betrag_netto: number }[]): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Action implementieren** (admin-gated; service-role-Client für CRUD + RPC):

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  return p?.rolle === 'admin'
}

export async function getWerkstattStaffel(
  werkstattId: string,
): Promise<{ ok: true; stufen: { schwelle: number; bonus_betrag_netto: number }[] } | { ok: false; error: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('werkstatt_staffel_stufen')
    .select('schwelle, bonus_betrag_netto').eq('werkstatt_id', werkstattId)
    .order('schwelle', { ascending: true })
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    stufen: (data ?? []).map((r) => ({
      schwelle: Number((r as unknown as { schwelle: number }).schwelle),
      bonus_betrag_netto: Number((r as unknown as { bonus_betrag_netto: number }).bonus_betrag_netto),
    })),
  }
}

export async function setWerkstattStaffel(
  werkstattId: string,
  stufen: { schwelle: number; bonus_betrag_netto: number }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen die Staffelung ändern.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }

  // Validierung
  const clean: { schwelle: number; bonus_betrag_netto: number }[] = []
  const seen = new Set<number>()
  for (const s of stufen) {
    const schwelle = Math.trunc(Number(s.schwelle))
    const betrag = Number(s.bonus_betrag_netto)
    if (!Number.isFinite(schwelle) || schwelle <= 0) return { ok: false, error: 'Schwelle muss eine positive ganze Zahl sein.' }
    if (!Number.isFinite(betrag) || betrag < 0) return { ok: false, error: 'Bonus-Betrag muss >= 0 sein.' }
    if (seen.has(schwelle)) return { ok: false, error: `Schwelle ${schwelle} ist doppelt.` }
    seen.add(schwelle)
    clean.push({ schwelle, bonus_betrag_netto: betrag })
  }

  const admin = createAdminClient()
  // Replace-Semantik: alle Stufen der Werkstatt loeschen + neu einfuegen.
  // Vergebene Boni bleiben (snapshot + ON DELETE SET NULL auf stufe_id).
  const { error: delErr } = await admin.from('werkstatt_staffel_stufen').delete().eq('werkstatt_id', werkstattId)
  if (delErr) return { ok: false, error: delErr.message }
  if (clean.length > 0) {
    const { error: insErr } = await admin.from('werkstatt_staffel_stufen')
      .insert(clean.map((c) => ({ werkstatt_id: werkstattId, schwelle: c.schwelle, bonus_betrag_netto: c.bonus_betrag_netto })))
    if (insErr) return { ok: false, error: insErr.message }
  }
  // Bereits ueberschrittene neue Stufen sofort vergeben
  await admin.rpc('award_werkstatt_staffel_boni', { p_werkstatt_id: werkstattId })

  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
```

- [ ] **Step 2: Test** (`staffel-actions.test.ts`) — Mock-Setup wie `werkstaetten/__tests__/actions.test.ts` (mock `@/lib/supabase/server` + `@/lib/supabase/admin` + `next/cache`). Tests: (a) non-admin → `setWerkstattStaffel` `ok:false`; (b) admin + doppelte Schwelle → `ok:false` „doppelt"; (c) admin + negative schwelle → `ok:false`. (Happy-Path-DB-Pfad = manueller Smoke.)

- [ ] **Step 3:** `npx vitest run src/app/admin/werkstaetten/__tests__/staffel-actions.test.ts` → grün. **Step 4: Commit.**

---

### Task 7: Admin-UI — „Staffelung"-Aktion + Modal

**Files:** Modify `src/app/admin/werkstaetten/WerkstaettenClient.tsx`

- [ ] **Step 1:** Imports: lucide `Layers3Icon`, `PlusIcon` (vorhanden), `Trash2Icon`; `getWerkstattStaffel`, `setWerkstattStaffel` from `'./staffel-actions'`.
- [ ] **Step 2:** State: `staffelFor: Werkstatt | null`, `staffelRows: { schwelle: string; bonus: string }[]`, `staffelLoading: boolean`, `staffelSaving: boolean`. Handler `openStaffel(w)` lädt via `getWerkstattStaffel(w.id)` → rows (als Strings für die Inputs); `addRow`/`removeRow(i)`/`updateRow(i, field, val)`; `saveStaffel()` → `setWerkstattStaffel(w.id, rows.map(num))` → toast + close.
- [ ] **Step 3:** Neue Spalte „Staffelung" (analog QR-Spalte): `<Button size="sm" variant="ghost" loading={staffelLoading && staffelFor?.id===w.id} onClick={() => openStaffel(w)} iconLeft={<Layers3Icon className="w-4 h-4" />}>Staffel</Button>`. Empty-state `colSpan` +1.
- [ ] **Step 4:** Modal (`open={staffelFor !== null}`, maxWidth ~480): Titel „Staffelung — {staffelFor?.name}", editierbare Zeilen-Liste (zwei `TextField`/`input`: „ab X Kunden" + „Bonus €") mit `Trash2Icon`-Remove, „+ Stufe"-Button, „Speichern" (`loading={staffelSaving}`) + „Abbrechen". Umlaute, primitives `Button`/`Modal`.
- [ ] **Step 5:** `npx tsc --noEmit` clean. **Step 6: Commit.**

---

### Task 8: „Boni"-Summe in der Provisionen-Seite

**Files:** Modify `src/components/werkstatt/WerkstattAbrechnungen.tsx`, `src/app/werkstatt/(shell)/abrechnungen/page.tsx`

- [ ] **Step 1:** `abrechnungen/page.tsx`: zusätzlich `getWerkstattStaffelBoni(werkstatt.id)` laden, `boniSumme` = Summe (status freigegeben+ausgezahlt) berechnen, als Prop `boniSumme` an `WerkstattAbrechnungen` reichen.
- [ ] **Step 2:** `WerkstattAbrechnungen.tsx`: Prop `boniSumme?: number` ergänzen; in der Summen-Karten-Grid eine 4. Karte „Meilenstein-Boni" (`EUR.format(boniSumme ?? 0)`, `text-success-strong`). Grid `grid-cols-3` → `grid-cols-2 md:grid-cols-4` o.ä.
- [ ] **Step 3:** `npx tsc --noEmit` clean. **Step 4: Commit.**

---

### Task 9: Gates + Audit + PR

- [ ] **Step 1:** `npx vitest run src/lib/werkstatt src/app/admin/werkstaetten` (alle neuen + Nachbar-Tests grün).
- [ ] **Step 2:** Voller Build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Server-Actions + Routen + Layout → Next.js-Validator). Falls shared-node_modules-Env-Lücken: `npm install` im Worktree, dann erneut.
- [ ] **Step 3:** `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet` — 0 neue.
- [ ] **Step 4:** 7-Punkte-Audit, push, PR gegen `staging` (Audit-Body + DB-Smoke-Doku).

## Self-Review (gegen Spec)

1. **Spec coverage:** Tabellen+RLS+Funktion+Trigger (T1) ✓, Typen (T2) ✓, Queries inkl. settled/pending (T3) ✓, Fortschritts-Helper (T4) ✓, Dashboard-Balken (T5) ✓, Admin-CRUD+award-RPC (T6) ✓, Admin-Modal (T7) ✓, Boni-Summe Provisionen (T8) ✓, Gates (T9) ✓. Metrik=settled, Snapshot, Idempotenz, sofort-freigegeben, kein-Auto-Revoke alle abgebildet.
2. **Placeholder scan:** Code-Blöcke vollständig; einzige „beim Implementieren prüfen"-Hinweise sind SectionCard-/Modal-Prop-Signaturen (kurz lesen) — kein Logik-Placeholder.
3. **Type consistency:** `{ schwelle, bonus_betrag_netto }` durchgängig; `getWerkstattVermittlungsCount → { settled, pending }` in T3 def + T5 consume identisch; `berechneStaffelFortschritt(settledCount, stufen, vergebeneSchwellen)` in T4 def + T5 call identisch; RPC-Name `award_werkstatt_staffel_boni` in T1 (DDL) + T6 (rpc) identisch.
