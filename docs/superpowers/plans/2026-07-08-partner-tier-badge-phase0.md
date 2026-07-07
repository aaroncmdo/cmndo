# Partner-Tier-Badge — Phase 0 (Fundament) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baue die Rang-Berechnungs-Pipeline: eine `partner_rang`-Tabelle, eine reine `computePartnerStrength`-Funktion (Volumen + Credentials + Rating, Qualitäts-Gate), Signal-Reader aus der DB, einen Rang-Reader und einen nächtlichen Cron — so dass jeder gate-konforme Partner einen berechneten, gecachten Rang (bronze/silber/gold) + einen komponenten-ehrlichen Sinnsatz hat. **Keine UI in Phase 0.**

**Architecture:** Reiner Kern (`compute.ts`, keine DB, voll TDD) + dünne DB-Reader (`signals.ts`) + Cron-Orchestrierung, die liest → rechnet → `partner_rang` upsertet. Cache-Tabelle, damit Finder/Badge (Phase 1) ohne Live-Recompute lesen. Spec: `docs/superpowers/specs/2026-07-08-partner-tier-badge-design.md`.

**Tech Stack:** Next.js 15 (App Router, Route Handler), TypeScript, Supabase (Postgres, service-role Admin-Client), vitest.

## Global Constraints

- **DDL nur über das Supabase-Plugin** (`apply_migration`), danach `list_migrations` → getrackte Version ablesen → Migration-File `supabase/migrations/<V>_partner_rang.sql` **exakt** danach benennen (Twin-Drift vermeiden). NIE `execute_sql` mit DDL, NIE CLI. (AGENTS.md Regel 2)
- **Kein Push auf `main`.** Arbeit bleibt auf `kitta/partner-tier-badge`, PR gegen `staging`. (Regel 1)
- **Cron-Auth-Konvention:** `Authorization: Bearer ${process.env.CRON_SECRET}` → sonst 401. Service-role via `createAdminClient()` aus `@/lib/supabase/admin`. `export const dynamic = 'force-dynamic'`.
- **Server-Actions/Reader:** Result-Objekt-Pattern, kein `throw` in normalen Pfaden. KEINE Konstanten/Types aus `'use server'`-Files exportieren.
- **Testaccounts ausschließen:** `sachverstaendige.ist_testaccount = true` (6/14!) + gelöschte/gesperrte immer aus Compute filtern.
- **Sinnsatz ist kundenöffentlich (UI-Text) → echte Umlaute** (`ä/ö/ü/ß`), und **nie eine nackte Fallzahl** — nur qualitativ („vielfach begutachtet").
- **Namen kanonisch** (aus Spec): Tabelle `partner_rang`; `computePartnerStrength`, `deriveTier`, `getPartnerRang`, Typen `PartnerTyp`/`Tier`/`PartnerSignals`/`PartnerStrength`.

---

## File Structure

- Create: `supabase/migrations/<V>_partner_rang.sql` — Tabelle + RLS (public-read der öffentlichen Ränge).
- Create: `src/lib/partner-rang/types.ts` — `PartnerTyp`, `Tier`, `PartnerSignals`, `PartnerStrength`.
- Create: `src/lib/partner-rang/config.ts` — Gewichte, Caps, Schwellen (tunbar).
- Create: `src/lib/partner-rang/compute.ts` — **reine** `computePartnerStrength` + `deriveTier` + `buildSinnsatz` + `tierOrdinal`.
- Create: `src/lib/partner-rang/__tests__/compute.test.ts` — vitest.
- Create: `src/lib/partner-rang/signals.ts` — `ladeSvKandidaten`, `ladeMaklerKandidaten` (DB → `{id, signals}[]`).
- Create: `src/lib/partner-rang/__tests__/signals.test.ts` — vitest (Supabase-Stub).
- Create: `src/lib/partner-rang/get.ts` — `getPartnerRang(typ, id)` (liest `partner_rang`).
- Create: `src/app/api/cron/compute-partner-rang/route.ts` — Cron-Orchestrierung.
- Create: `src/app/api/cron/compute-partner-rang/__tests__/route.test.ts` — Auth-Guard-Test.
- Modify: `vercel.json` — Cron-Registrierung (falls dort Crons stehen; sonst VPS-Crontab-Follow-up notieren).

---

## Task 1: `partner_rang`-Tabelle (Migration via Plugin)

**Files:**
- Create: `supabase/migrations/<V>_partner_rang.sql`

**Interfaces:**
- Produces: Tabelle `public.partner_rang (id, partner_typ, partner_id, volumen, score, credential_score, rating_score, gate_ok, gate_cap, rang, sinnsatz, stand)` mit `unique(partner_typ, partner_id)`; public-read-RLS für `gate_ok = true AND rang IS NOT NULL`.

- [ ] **Step 1: Migration anwenden (Plugin)**

Rufe `apply_migration` mit `name: "partner_rang"` und dieser Query:

```sql
create table if not exists public.partner_rang (
  id uuid primary key default gen_random_uuid(),
  partner_typ text not null check (partner_typ in ('sachverstaendiger','makler','werkstatt')),
  partner_id uuid not null,
  volumen integer not null default 0,
  score numeric not null default 0,
  credential_score numeric not null default 0,
  rating_score numeric not null default 0,
  gate_ok boolean not null default false,
  gate_cap text check (gate_cap in ('bronze','silber','gold')),
  rang text check (rang in ('bronze','silber','gold')),
  sinnsatz text,
  stand timestamptz not null default now(),
  unique (partner_typ, partner_id)
);

alter table public.partner_rang enable row level security;

-- Der Rang IST ein oeffentlicher Badge: jeder (inkl. anon) darf gate-konforme Raenge lesen.
create policy "partner_rang_public_read" on public.partner_rang
  for select using (gate_ok = true and rang is not null);

-- Kein Write-Policy => INSERT/UPDATE/DELETE nur ueber service-role (Cron, bypasst RLS).

comment on table public.partner_rang is 'Berechneter Partner-Tier-Rang (Bronze/Silber/Gold) je Partner. Befuellt vom Cron compute-partner-rang. Spec 2026-07-08-partner-tier-badge.';
```

- [ ] **Step 2: Getrackte Version ablesen**

Rufe `list_migrations`. Lies die soeben vergebene Version `<V>` (Plugin setzt einen eigenen Timestamp) für den Datei-Namen ab.

- [ ] **Step 3: Migration-File committen (Datei-Name == getrackte Version)**

Schreibe die identische DDL nach `supabase/migrations/<V>_partner_rang.sql`.

```bash
git -C "<worktree>" add supabase/migrations/<V>_partner_rang.sql
git -C "<worktree>" commit -m "feat(partner-rang): partner_rang Tabelle + public-read RLS (Phase 0 T1)"
```

- [ ] **Step 4: Verifizieren (READ)**

Rufe `execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='partner_rang' order by ordinal_position;
```
Expected: 12 Spalten wie oben; `partner_rang` existiert.

---

## Task 2: Reiner Rang-Kern (`compute.ts`) — TDD

**Files:**
- Create: `src/lib/partner-rang/types.ts`
- Create: `src/lib/partner-rang/config.ts`
- Create: `src/lib/partner-rang/compute.ts`
- Test: `src/lib/partner-rang/__tests__/compute.test.ts`

**Interfaces:**
- Produces:
  - `type PartnerTyp = 'sachverstaendiger' | 'makler' | 'werkstatt'`
  - `type Tier = 'bronze' | 'silber' | 'gold'`
  - `interface PartnerSignals { typ; volumen; oeffentlichBestellt; zertifikate; partnerSeitJahre; ratingDurchschnitt; ratingAnzahl; aktiv; offeneReklamationen; noShowQuote; ablehnungen30d }`
  - `interface PartnerStrength { score; volumenScore; credentialScore; ratingScore; gateOk; gateCap; tier: Tier | null; sinnsatz: string }`
  - `computePartnerStrength(s: PartnerSignals): PartnerStrength`
  - `deriveTier(score: number): Tier`
  - `tierOrdinal(t: Tier): number`

- [ ] **Step 1: Typen anlegen (`types.ts`)**

```ts
// src/lib/partner-rang/types.ts
export type PartnerTyp = 'sachverstaendiger' | 'makler' | 'werkstatt'
export type Tier = 'bronze' | 'silber' | 'gold'

/** Eingangssignale fuer die Rang-Berechnung (typ-agnostisch; fehlende Signale = neutral). */
export interface PartnerSignals {
  typ: PartnerTyp
  /** Kumulierte abgeschlossene Faelle. */
  volumen: number
  // --- Credentials (gedeckelt) ---
  oeffentlichBestellt: boolean
  /** Anzahl vorhandener Zertifikatsnummern (BVSK/DAT/IHK/OEBUV). */
  zertifikate: number
  /** Tenure in Jahren (partner_seit). */
  partnerSeitJahre: number
  // --- Rating (gedeckelt) ---
  ratingDurchschnitt: number | null
  ratingAnzahl: number
  // --- Gates ---
  /** verifiziert (SV) bzw. status=aktiv (Makler/Werkstatt). Voraussetzung fuer JEDEN Rang. */
  aktiv: boolean
  offeneReklamationen: number
  /** 0..1 */
  noShowQuote: number
  ablehnungen30d: number
}

export interface PartnerStrength {
  score: number
  volumenScore: number
  credentialScore: number
  ratingScore: number
  gateOk: boolean
  /** Hoechster gate-konformer Tier. */
  gateCap: Tier
  /** Finaler Rang; null = kein Badge (nicht aktiv). */
  tier: Tier | null
  sinnsatz: string
}
```

- [ ] **Step 2: Config anlegen (`config.ts`)**

```ts
// src/lib/partner-rang/config.ts
// Tunbare Gewichte/Caps/Schwellen. Startwerte fuer Cold-Start (niedrig), spaeter an reale Verteilung anpassen.
export const RANG_CONFIG = {
  // Volumen: sqrt-skaliert -> waechst, mit abnehmendem Grenzertrag.
  VOLUMEN_FAKTOR: 8, // ~ sqrt(volumen)*8: 4 Faelle=16, 25=40, 100=80
  // Credentials (gedeckelt, gesamt ~40)
  CRED_OEFFENTLICH_BESTELLT: 20,
  CRED_PRO_ZERTIFIKAT: 6,
  CRED_ZERTIFIKAT_CAP: 12,
  CRED_PRO_JAHR: 3,
  CRED_TENURE_CAP: 8,
  // Rating (gedeckelt ~30): (durchschnitt-3)/2 -> [0..1] * CAP, nur ab MIN Bewertungen.
  RATING_MIN_BEWERTUNGEN: 5,
  RATING_CAP: 30,
  // Gates
  MAX_NO_SHOW_QUOTE_GOLD: 0.08,
  MAX_NO_SHOW_QUOTE_SILBER: 0.15,
  MAX_ABLEHNUNGEN_30D: 8,
  // Tier-Schwellen auf score (absolut, getunt — nicht Perzentil)
  SCHWELLE_SILBER: 35,
  SCHWELLE_GOLD: 60,
  // Sinnsatz-Volumen-Qualifizierer (nie nackte Zahl)
  VOLUMEN_VIELFACH: 50,
  VOLUMEN_ERFAHREN: 15,
} as const
```

- [ ] **Step 3: Failing test schreiben (`__tests__/compute.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { computePartnerStrength, deriveTier, tierOrdinal } from '../compute'
import type { PartnerSignals } from '../types'

const base: PartnerSignals = {
  typ: 'sachverstaendiger',
  volumen: 0, oeffentlichBestellt: false, zertifikate: 0, partnerSeitJahre: 0,
  ratingDurchschnitt: null, ratingAnzahl: 0,
  aktiv: true, offeneReklamationen: 0, noShowQuote: 0, ablehnungen30d: 0,
}

describe('deriveTier', () => {
  it('schwellen', () => {
    expect(deriveTier(0)).toBe('bronze')
    expect(deriveTier(34)).toBe('bronze')
    expect(deriveTier(35)).toBe('silber')
    expect(deriveTier(60)).toBe('gold')
  })
})

describe('computePartnerStrength', () => {
  it('neuer verifizierter SV ohne alles -> bronze', () => {
    expect(computePartnerStrength(base).tier).toBe('bronze')
  })

  it('nicht aktiv -> kein Rang (tier null, gateOk false)', () => {
    const r = computePartnerStrength({ ...base, aktiv: false })
    expect(r.tier).toBeNull()
    expect(r.gateOk).toBe(false)
  })

  it('COLD-START: etabliert + top-bewertet -> gold OHNE Volumen', () => {
    const r = computePartnerStrength({
      ...base, oeffentlichBestellt: true, zertifikate: 2, partnerSeitJahre: 3,
      ratingDurchschnitt: 4.9, ratingAnzahl: 40,
    })
    // 20 + min(12,12) + min(9,8)=8  = 40 credentials; rating (4.9-3)/2=0.95*30=28.5 -> ~68.5
    expect(r.tier).toBe('gold')
  })

  it('reines Volumen treibt hoch (100 Faelle -> gold)', () => {
    expect(computePartnerStrength({ ...base, volumen: 100 }).tier).toBe('gold')
  })

  it('offene Reklamation deckelt auf bronze trotz hohem Score', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, offeneReklamationen: 1 })
    expect(r.tier).toBe('bronze')
    expect(r.gateCap).toBe('bronze')
  })

  it('hohe No-Show-Quote deckelt auf silber', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, noShowQuote: 0.12 })
    expect(r.tier).toBe('silber')
  })

  it('Credentials sind gedeckelt (viele Zertifikate ueberschreiten Cap nicht)', () => {
    const r = computePartnerStrength({ ...base, zertifikate: 9 })
    expect(r.credentialScore).toBe(12) // CRED_ZERTIFIKAT_CAP
  })

  it('Rating unter Mindest-Bewertungszahl wird ignoriert', () => {
    const r = computePartnerStrength({ ...base, ratingDurchschnitt: 5, ratingAnzahl: 2 })
    expect(r.ratingScore).toBe(0)
  })

  it('Sinnsatz enthaelt NIE eine nackte Zahl', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, oeffentlichBestellt: true, ratingDurchschnitt: 4.7, ratingAnzahl: 30 })
    expect(r.sinnsatz).not.toMatch(/[0-9]/)
    expect(r.sinnsatz.toLowerCase()).toContain('begutachtet')
  })
})

describe('tierOrdinal', () => {
  it('bronze<silber<gold', () => {
    expect(tierOrdinal('bronze')).toBeLessThan(tierOrdinal('silber'))
    expect(tierOrdinal('silber')).toBeLessThan(tierOrdinal('gold'))
  })
})
```

- [ ] **Step 4: Test ausführen — muss fehlschlagen**

Run: `npx vitest run src/lib/partner-rang/__tests__/compute.test.ts`
Expected: FAIL („Cannot find module '../compute'").

- [ ] **Step 5: `compute.ts` implementieren**

```ts
// src/lib/partner-rang/compute.ts
import { RANG_CONFIG as C } from './config'
import type { PartnerSignals, PartnerStrength, Tier } from './types'

const TIER_ORDER: Tier[] = ['bronze', 'silber', 'gold']
export function tierOrdinal(t: Tier): number { return TIER_ORDER.indexOf(t) }
function minTier(a: Tier, b: Tier): Tier { return tierOrdinal(a) <= tierOrdinal(b) ? a : b }

export function deriveTier(score: number): Tier {
  if (score >= C.SCHWELLE_GOLD) return 'gold'
  if (score >= C.SCHWELLE_SILBER) return 'silber'
  return 'bronze'
}

function credentialScore(s: PartnerSignals): number {
  const bestellt = s.oeffentlichBestellt ? C.CRED_OEFFENTLICH_BESTELLT : 0
  const zert = Math.min(s.zertifikate * C.CRED_PRO_ZERTIFIKAT, C.CRED_ZERTIFIKAT_CAP)
  const tenure = Math.min(s.partnerSeitJahre * C.CRED_PRO_JAHR, C.CRED_TENURE_CAP)
  return bestellt + zert + tenure
}

function ratingScore(s: PartnerSignals): number {
  if (s.ratingDurchschnitt == null || s.ratingAnzahl < C.RATING_MIN_BEWERTUNGEN) return 0
  const norm = Math.max(0, Math.min(1, (s.ratingDurchschnitt - 3) / 2))
  return Math.round(norm * C.RATING_CAP * 10) / 10
}

/** Hoechster gate-konformer Tier (Qualitaets-Tuersteher). */
function gateCap(s: PartnerSignals): Tier {
  let cap: Tier = 'gold'
  if (s.noShowQuote > C.MAX_NO_SHOW_QUOTE_GOLD) cap = minTier(cap, 'silber')
  if (s.noShowQuote > C.MAX_NO_SHOW_QUOTE_SILBER) cap = minTier(cap, 'bronze')
  if (s.ablehnungen30d > C.MAX_ABLEHNUNGEN_30D) cap = minTier(cap, 'bronze')
  if (s.offeneReklamationen > 0) cap = minTier(cap, 'bronze')
  return cap
}

function buildSinnsatz(s: PartnerSignals, tier: Tier): string {
  const teile: string[] = []
  if (s.volumen >= C.VOLUMEN_VIELFACH) teile.push('vielfach begutachtet')
  else if (s.volumen >= C.VOLUMEN_ERFAHREN) teile.push('erfahrener Partner')
  if (s.oeffentlichBestellt) teile.push('öffentlich bestellt & vereidigt')
  if (s.ratingDurchschnitt != null && s.ratingAnzahl >= C.RATING_MIN_BEWERTUNGEN && s.ratingDurchschnitt >= 4.3) {
    teile.push('top bewertet')
  }
  teile.push('verifiziert')
  const label = tier === 'gold' ? 'Gold-Partner' : tier === 'silber' ? 'Silber-Partner' : 'Bronze-Partner'
  return [label, ...teile.slice(0, 3)].join(' · ')
}

export function computePartnerStrength(s: PartnerSignals): PartnerStrength {
  const volumenScore = Math.sqrt(Math.max(0, s.volumen)) * C.VOLUMEN_FAKTOR
  const cScore = credentialScore(s)
  const rScore = ratingScore(s)
  const score = Math.round((volumenScore + cScore + rScore) * 10) / 10

  const gateOk = s.aktiv
  if (!gateOk) {
    return { score, volumenScore, credentialScore: cScore, ratingScore: rScore, gateOk: false, gateCap: 'bronze', tier: null, sinnsatz: '' }
  }
  const cap = gateCap(s)
  const tier = minTier(deriveTier(score), cap)
  return { score, volumenScore, credentialScore: cScore, ratingScore: rScore, gateOk: true, gateCap: cap, tier, sinnsatz: buildSinnsatz(s, tier) }
}
```

- [ ] **Step 6: Test ausführen — muss bestehen**

Run: `npx vitest run src/lib/partner-rang/__tests__/compute.test.ts`
Expected: PASS (alle Cases).

- [ ] **Step 7: Commit**

```bash
git -C "<worktree>" add src/lib/partner-rang/types.ts src/lib/partner-rang/config.ts src/lib/partner-rang/compute.ts src/lib/partner-rang/__tests__/compute.test.ts
git -C "<worktree>" commit -m "feat(partner-rang): reiner Rang-Kern computePartnerStrength + TDD (Phase 0 T2)"
```

---

## Task 3: Signal-Reader (`signals.ts`) — DB → `{id, signals}[]`

**Files:**
- Create: `src/lib/partner-rang/signals.ts`
- Test: `src/lib/partner-rang/__tests__/signals.test.ts`

**Interfaces:**
- Consumes: `PartnerSignals` (Task 2), Supabase-Admin-Client.
- Produces:
  - `type Kandidat = { id: string; signals: PartnerSignals }`
  - `ladeSvKandidaten(supabase): Promise<Kandidat[]>`
  - `ladeMaklerKandidaten(supabase): Promise<Kandidat[]>`
  - `zaehleZertifikate(row): number` (rein, exportiert für Test)

Bestätigte Spalten: `sachverstaendige(id, profile_id, verifiziert, partner_seit, ablehnungen_30_tage, oeffentlich_bestellt, bvsk_mitgliedsnummer, dat_nummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer, ist_testaccount, geloescht_am, gesperrt_seit)` · `gutachter_termine(assignee_id, assignee_typ, status, sv_no_show_am)` · `google_bewertungen_cache(profile_id, durchschnitt, anzahl_bewertungen)` · `reklamationen(sv_id, bearbeitet_am)` · `makler(id, status, aktiviert_am, gesperrt_am)` · `makler_provisionen(makler_id, status)`.

- [ ] **Step 1: Failing test (`__tests__/signals.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { zaehleZertifikate, ladeSvKandidaten } from '../signals'

describe('zaehleZertifikate', () => {
  it('zaehlt nur vorhandene Nummern', () => {
    expect(zaehleZertifikate({ bvsk_mitgliedsnummer: 'X', dat_nummer: null, ihk_zertifikat_nummer: '', oebuv_bestellungsnummer: 'Y' })).toBe(2)
  })
})

describe('ladeSvKandidaten', () => {
  it('schliesst Testaccounts aus (Filter-Kette wird angewandt)', async () => {
    const calls: Record<string, unknown> = {}
    const svQuery = {
      select: function () { return this },
      is: function (col: string, val: unknown) { calls[`is:${col}`] = val; return this },
      eq: function (col: string, val: unknown) { calls[`eq:${col}`] = val; return this },
      not: function (col: string) { calls[`not:${col}`] = true; return this },
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    }
    const supabase = { from: () => svQuery } as unknown as Parameters<typeof ladeSvKandidaten>[0]
    const r = await ladeSvKandidaten(supabase)
    expect(r).toEqual([])
    expect(calls['eq:ist_testaccount']).toBe(false)
    expect(calls['is:geloescht_am']).toBeNull()
  })
})
```

- [ ] **Step 2: Test ausführen — FAIL**

Run: `npx vitest run src/lib/partner-rang/__tests__/signals.test.ts`
Expected: FAIL („Cannot find module '../signals'").

- [ ] **Step 3: `signals.ts` implementieren**

```ts
// src/lib/partner-rang/signals.ts
import type { PartnerSignals } from './types'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export type Kandidat = { id: string; signals: PartnerSignals }

const JAHR_MS = 365.25 * 24 * 60 * 60 * 1000
function jahreSeit(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / JAHR_MS)
}

export function zaehleZertifikate(row: {
  bvsk_mitgliedsnummer?: string | null; dat_nummer?: string | null
  ihk_zertifikat_nummer?: string | null; oebuv_bestellungsnummer?: string | null
}): number {
  return [row.bvsk_mitgliedsnummer, row.dat_nummer, row.ihk_zertifikat_nummer, row.oebuv_bestellungsnummer]
    .filter((x) => typeof x === 'string' && x.trim().length > 0).length
}

/** Alle echten (nicht-Test/geloescht) SVs mit aggregierten Signalen. */
export async function ladeSvKandidaten(supabase: Sb): Promise<Kandidat[]> {
  const { data: svs, error } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, verifiziert, partner_seit, ablehnungen_30_tage, oeffentlich_bestellt, bvsk_mitgliedsnummer, dat_nummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer')
    .eq('ist_testaccount', false)
    .is('geloescht_am', null)
  if (error || !svs || svs.length === 0) return []

  const ids: string[] = svs.map((s: { id: string }) => s.id)
  const profileIds: string[] = svs.map((s: { profile_id: string | null }) => s.profile_id).filter(Boolean)

  // Termine (Volumen + No-Show) je assignee_id.
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('assignee_id, status, sv_no_show_am')
    .eq('assignee_typ', 'sachverstaendiger')
    .in('assignee_id', ids)
  // Ratings je profile_id.
  const { data: ratings } = await supabase
    .from('google_bewertungen_cache')
    .select('profile_id, durchschnitt, anzahl_bewertungen')
    .in('profile_id', profileIds)
  // Offene Reklamationen (bearbeitet_am IS NULL) je sv_id.
  const { data: rekl } = await supabase
    .from('reklamationen')
    .select('sv_id, bearbeitet_am')
    .in('sv_id', ids)
    .is('bearbeitet_am', null)

  const volumen = new Map<string, number>()
  const noShow = new Map<string, number>()
  const terminGesamt = new Map<string, number>()
  for (const t of (termine ?? []) as { assignee_id: string; status: string | null; sv_no_show_am: string | null }[]) {
    terminGesamt.set(t.assignee_id, (terminGesamt.get(t.assignee_id) ?? 0) + 1)
    if (t.status === 'abgeschlossen') volumen.set(t.assignee_id, (volumen.get(t.assignee_id) ?? 0) + 1)
    if (t.sv_no_show_am) noShow.set(t.assignee_id, (noShow.get(t.assignee_id) ?? 0) + 1)
  }
  const ratingByProfile = new Map<string, { d: number | null; n: number }>()
  for (const r of (ratings ?? []) as { profile_id: string; durchschnitt: number | null; anzahl_bewertungen: number | null }[]) {
    ratingByProfile.set(r.profile_id, { d: r.durchschnitt, n: r.anzahl_bewertungen ?? 0 })
  }
  const offeneRekl = new Map<string, number>()
  for (const r of (rekl ?? []) as { sv_id: string }[]) {
    offeneRekl.set(r.sv_id, (offeneRekl.get(r.sv_id) ?? 0) + 1)
  }

  return svs.map((sv: {
    id: string; profile_id: string | null; verifiziert: boolean | null; partner_seit: string | null
    ablehnungen_30_tage: number | null; oeffentlich_bestellt: boolean | null
    bvsk_mitgliedsnummer: string | null; dat_nummer: string | null
    ihk_zertifikat_nummer: string | null; oebuv_bestellungsnummer: string | null
  }): Kandidat => {
    const gesamt = terminGesamt.get(sv.id) ?? 0
    const rating = sv.profile_id ? ratingByProfile.get(sv.profile_id) : undefined
    const signals: PartnerSignals = {
      typ: 'sachverstaendiger',
      volumen: volumen.get(sv.id) ?? 0,
      oeffentlichBestellt: sv.oeffentlich_bestellt === true,
      zertifikate: zaehleZertifikate(sv),
      partnerSeitJahre: jahreSeit(sv.partner_seit),
      ratingDurchschnitt: rating?.d ?? null,
      ratingAnzahl: rating?.n ?? 0,
      aktiv: sv.verifiziert === true,
      offeneReklamationen: offeneRekl.get(sv.id) ?? 0,
      noShowQuote: gesamt > 0 ? (noShow.get(sv.id) ?? 0) / gesamt : 0,
      ablehnungen30d: sv.ablehnungen_30_tage ?? 0,
    }
    return { id: sv.id, signals }
  })
}

/** Makler: volumen-gefuehrt (duenne Qualitaetsdaten). */
export async function ladeMaklerKandidaten(supabase: Sb): Promise<Kandidat[]> {
  const { data: makler, error } = await supabase
    .from('makler')
    .select('id, status, aktiviert_am, gesperrt_am')
    .is('gesperrt_am', null)
  if (error || !makler || makler.length === 0) return []
  const ids: string[] = makler.map((m: { id: string }) => m.id)
  const { data: prov } = await supabase
    .from('makler_provisionen')
    .select('makler_id, status')
    .in('makler_id', ids)
  const volumen = new Map<string, number>()
  for (const p of (prov ?? []) as { makler_id: string; status: string | null }[]) {
    if (p.status === 'freigegeben' || p.status === 'ausgezahlt') {
      volumen.set(p.makler_id, (volumen.get(p.makler_id) ?? 0) + 1)
    }
  }
  return makler.map((m: { id: string; status: string | null; aktiviert_am: string | null }): Kandidat => ({
    id: m.id,
    signals: {
      typ: 'makler',
      volumen: volumen.get(m.id) ?? 0,
      oeffentlichBestellt: false, zertifikate: 0, partnerSeitJahre: jahreSeit(m.aktiviert_am),
      ratingDurchschnitt: null, ratingAnzahl: 0,
      aktiv: m.status === 'aktiv',
      offeneReklamationen: 0, noShowQuote: 0, ablehnungen30d: 0,
    },
  }))
}
```

- [ ] **Step 4: Test ausführen — PASS**

Run: `npx vitest run src/lib/partner-rang/__tests__/signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "<worktree>" add src/lib/partner-rang/signals.ts src/lib/partner-rang/__tests__/signals.test.ts
git -C "<worktree>" commit -m "feat(partner-rang): Signal-Reader SV+Makler (Testaccount-Ausschluss) (Phase 0 T3)"
```

---

## Task 4: Rang-Reader (`get.ts`)

**Files:**
- Create: `src/lib/partner-rang/get.ts`
- Test: `src/lib/partner-rang/__tests__/get.test.ts`

**Interfaces:**
- Consumes: `PartnerTyp`, `Tier` (Task 2), Supabase-Client.
- Produces:
  - `type PartnerRangRow = { tier: Tier; sinnsatz: string; volumen: number; stand: string }`
  - `getPartnerRang(supabase, typ: PartnerTyp, id: string): Promise<PartnerRangRow | null>`
  - `getPartnerRangBatch(supabase, typ: PartnerTyp, ids: string[]): Promise<Map<string, PartnerRangRow>>`

- [ ] **Step 1: Failing test (`__tests__/get.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { getPartnerRang } from '../get'

describe('getPartnerRang', () => {
  it('null wenn kein Eintrag', async () => {
    const q = {
      select: function () { return this }, eq: function () { return this },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }
    const supabase = { from: () => q } as unknown as Parameters<typeof getPartnerRang>[0]
    expect(await getPartnerRang(supabase, 'sachverstaendiger', 'x')).toBeNull()
  })

  it('mappt Zeile auf PartnerRangRow', async () => {
    const q = {
      select: function () { return this }, eq: function () { return this },
      maybeSingle: () => Promise.resolve({ data: { rang: 'gold', sinnsatz: 'Gold-Partner · verifiziert', volumen: 12, stand: '2026-07-08T00:00:00Z' }, error: null }),
    }
    const supabase = { from: () => q } as unknown as Parameters<typeof getPartnerRang>[0]
    const r = await getPartnerRang(supabase, 'sachverstaendiger', 'x')
    expect(r).toEqual({ tier: 'gold', sinnsatz: 'Gold-Partner · verifiziert', volumen: 12, stand: '2026-07-08T00:00:00Z' })
  })
})
```

- [ ] **Step 2: Test ausführen — FAIL**

Run: `npx vitest run src/lib/partner-rang/__tests__/get.test.ts`
Expected: FAIL.

- [ ] **Step 3: `get.ts` implementieren**

```ts
// src/lib/partner-rang/get.ts
import type { PartnerTyp, Tier } from './types'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export type PartnerRangRow = { tier: Tier; sinnsatz: string; volumen: number; stand: string }

function mapRow(row: { rang: string | null; sinnsatz: string | null; volumen: number | null; stand: string } | null): PartnerRangRow | null {
  if (!row || !row.rang) return null
  return { tier: row.rang as Tier, sinnsatz: row.sinnsatz ?? '', volumen: row.volumen ?? 0, stand: row.stand }
}

export async function getPartnerRang(supabase: Sb, typ: PartnerTyp, id: string): Promise<PartnerRangRow | null> {
  const { data } = await supabase
    .from('partner_rang')
    .select('rang, sinnsatz, volumen, stand')
    .eq('partner_typ', typ)
    .eq('partner_id', id)
    .maybeSingle()
  return mapRow(data)
}

export async function getPartnerRangBatch(supabase: Sb, typ: PartnerTyp, ids: string[]): Promise<Map<string, PartnerRangRow>> {
  const out = new Map<string, PartnerRangRow>()
  if (ids.length === 0) return out
  const { data } = await supabase
    .from('partner_rang')
    .select('partner_id, rang, sinnsatz, volumen, stand')
    .eq('partner_typ', typ)
    .in('partner_id', ids)
  for (const row of (data ?? []) as { partner_id: string; rang: string | null; sinnsatz: string | null; volumen: number | null; stand: string }[]) {
    const mapped = mapRow(row)
    if (mapped) out.set(row.partner_id, mapped)
  }
  return out
}
```

- [ ] **Step 4: Test ausführen — PASS**

Run: `npx vitest run src/lib/partner-rang/__tests__/get.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "<worktree>" add src/lib/partner-rang/get.ts src/lib/partner-rang/__tests__/get.test.ts
git -C "<worktree>" commit -m "feat(partner-rang): getPartnerRang Reader (single+batch) (Phase 0 T4)"
```

---

## Task 5: Cron-Route (`compute-partner-rang`)

**Files:**
- Create: `src/app/api/cron/compute-partner-rang/route.ts`
- Test: `src/app/api/cron/compute-partner-rang/__tests__/route.test.ts`
- Modify: `vercel.json` (Cron-Eintrag; falls VPS-Crontab das Deployment-Modell ist → als Deploy-Follow-up notieren, HTTP 404 bis Crontab-Zeile existiert)

**Interfaces:**
- Consumes: `ladeSvKandidaten`, `ladeMaklerKandidaten` (Task 3), `computePartnerStrength` (Task 2), `createAdminClient`.
- Produces: `GET(request)` → `NextResponse.json({ ok, computed, updated })`.

- [ ] **Step 1: Failing test (Auth-Guard, `__tests__/route.test.ts`)**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { GET } from '../route'

describe('compute-partner-rang Auth', () => {
  beforeEach(() => { process.env.CRON_SECRET = 'test-secret' })
  it('401 ohne Bearer', async () => {
    const res = await GET(new Request('http://x/api/cron/compute-partner-rang'))
    expect(res.status).toBe(401)
  })
  it('401 bei falschem Secret', async () => {
    const res = await GET(new Request('http://x', { headers: { authorization: 'Bearer wrong' } }))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Test ausführen — FAIL**

Run: `npx vitest run src/app/api/cron/compute-partner-rang/__tests__/route.test.ts`
Expected: FAIL („Cannot find module '../route'").

- [ ] **Step 3: `route.ts` implementieren**

```ts
// src/app/api/cron/compute-partner-rang/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeSvKandidaten, ladeMaklerKandidaten, type Kandidat } from '@/lib/partner-rang/signals'
import { computePartnerStrength } from '@/lib/partner-rang/compute'

// Nächtlicher Cron: berechnet Partner-Rang (Bronze/Silber/Gold) je SV + Makler
// und upsertet in partner_rang. Werkstatt dormant (kein Volumen).
// Auth: Bearer ${CRON_SECRET} (Projekt-Konvention).

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const [svs, makler] = await Promise.all([ladeSvKandidaten(supabase), ladeMaklerKandidaten(supabase)])
  const alle: Kandidat[] = [...svs, ...makler]

  const rows = alle.map((k) => {
    const r = computePartnerStrength(k.signals)
    return {
      partner_typ: k.signals.typ,
      partner_id: k.id,
      volumen: k.signals.volumen,
      score: r.score,
      credential_score: r.credentialScore,
      rating_score: r.ratingScore,
      gate_ok: r.gateOk,
      gate_cap: r.gateCap,
      rang: r.tier,
      sinnsatz: r.sinnsatz,
      stand: new Date().toISOString(),
    }
  })

  let updated = 0
  if (rows.length > 0) {
    const { error } = await supabase
      .from('partner_rang')
      .upsert(rows, { onConflict: 'partner_typ,partner_id' })
    if (error) {
      console.error('[partner-rang] upsert fehlgeschlagen:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    updated = rows.length
  }

  return NextResponse.json({ ok: true, computed: alle.length, updated })
}
```

- [ ] **Step 4: Test ausführen — PASS**

Run: `npx vitest run src/app/api/cron/compute-partner-rang/__tests__/route.test.ts`
Expected: PASS (Auth-Guard greift; DB wird ohne gültiges Secret nie erreicht).

- [ ] **Step 5: Cron registrieren**

Prüfe `vercel.json` auf `"crons"`. Falls vorhanden, ergänze:
```json
{ "path": "/api/cron/compute-partner-rang", "schedule": "0 3 * * *" }
```
Falls Crons per **VPS-Crontab** laufen (siehe andere Crons): notiere im Commit-Body, dass die Crontab-Zeile (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/compute-partner-rang`) beim Deploy nachgetragen werden muss — bis dahin liefert die Route 404/läuft nicht scharf.

- [ ] **Step 6: Commit**

```bash
git -C "<worktree>" add src/app/api/cron/compute-partner-rang/ vercel.json
git -C "<worktree>" commit -m "feat(partner-rang): naechtlicher Compute-Cron SV+Makler -> partner_rang upsert (Phase 0 T5)"
```

---

## Task 6: Verifikation & Post-Task-Audit

- [ ] **Step 1: Voller Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 2: Alle Phase-0-Tests**

Run: `npx vitest run src/lib/partner-rang src/app/api/cron/compute-partner-rang`
Expected: PASS.

- [ ] **Step 3: Ratchets (keine neuen Verstöße)**

Run: `npm run check:token-audit ; npm run check:component-set ; npm run check:knip`
Expected: keine NEUEN Verstöße (Phase 0 ist backend-only, keine UI/Tokens/Farben).

- [ ] **Step 4: Cron-Smoke gegen Prod-DB (READ-Effekt prüfen)**

Nach Deploy: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/compute-partner-rang` → `{ ok: true, computed: N, updated: N }`. Danach `execute_sql`: `select partner_typ, rang, count(*) from partner_rang group by 1,2;` → erwartete Verteilung (die 8 echten verifizierten SVs bekommen mind. bronze; Testaccounts fehlen).

- [ ] **Step 5: Audit-Commit-Note**

Post-Task-Audit im finalen Commit-Body dokumentieren (7 Punkte, UI=n/a für Phase 0).

---

## Self-Review (gegen Spec)

- **Spec §3.1/§4 (Modell + Signale):** Task 2 (compute) + Task 3 (signals) — Volumen (sqrt), Credentials (gedeckelt), Rating (gedeckelt, Mindest-Bewertungen), Gates (verifiziert/reklamationen/no-show/ablehnungen). ✓
- **Spec §3.2 (absolute getunte Schwellen):** `config.ts` SCHWELLE_SILBER/GOLD. ✓
- **Spec §3.3 (nur Rang, nie Zahl):** `buildSinnsatz` + Test „Sinnsatz enthaelt NIE eine nackte Zahl". ✓
- **Spec §4.4 (Testaccount-Ausschluss):** `ladeSvKandidaten` `.eq('ist_testaccount', false)` + Test. ✓
- **Spec §8 (Tabelle + Cron):** Task 1 + Task 5. ✓
- **Cold-Start (F):** Test „etabliert + top-bewertet -> gold OHNE Volumen". ✓
- **Nicht in Phase 0 (bewusst):** `PartnerRangBadge`, Finder-Reihung, `istTopPartner`-Ablöse, Community, `MaklerEmpfehlungBadge`-Tier, community_leaderboard-Befüllung, Werkstatt → **Phase 1+**.
- **Typen-Konsistenz:** `PartnerSignals`/`PartnerStrength`/`Tier` in Task 2 definiert, in Task 3/4/5 identisch konsumiert. `rang` (DB-Spalte) ↔ `tier` (TS) Mapping in `get.ts`/Cron konsistent. ✓
- **Platzhalter:** keine — jeder Step trägt vollständigen Code/Command. (Migrations-Version `<V>` wird zur Laufzeit vom Plugin vergeben — Step 2 liest sie ab; das ist kein Platzhalter, sondern der vorgeschriebene Ablauf.)
