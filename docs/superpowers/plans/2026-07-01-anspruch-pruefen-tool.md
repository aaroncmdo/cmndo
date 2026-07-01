# Anspruch prüfen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein anonymes Top-Funnel-Tool, das aus Schadenfotos eine KI-Schätzung + einen Anspruch mit Positions-Spannen erzeugt und den Interessenten nahtlos und DB-getrieben in den bestehenden Gutachter-Finder + die kanonische Strecke (FlowLink) übergibt.

**Architecture:** Neue anonyme Route `/embed/anspruch-pruefen` (Haupt-App, noindex). Drei neue Wizard-Phasen (Fotos → Einschätzung → Anspruch) laufen vor dem **unveränderten** Finder-Buchungs-Tail (`<FinderWizard>`). Eine anonyme, TTL-behaftete DB-Session (`anspruch_schaetzungen`) hält Fotos/Segment/Inputs/Schätzung ohne PII; beim Handoff (Finder-Kontaktschritt) reicht die bestehende `gfa → issueCanonicalFlowLinkForAnfrage`-Pipeline die Session-Daten additiv auf den entstehenden Lead durch. Rechenkern = reine Funktion + DB-Rate-Tabellen.

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, Supabase (Postgres + Storage), `@anthropic-ai/sdk` (Claude Sonnet-4-6 Vision), vitest.

## Global Constraints

- **Sprache:** Alle nutzersichtbaren Strings mit echten Umlauten `ä/ö/ü/ß`. Backend/Comments/Commits dürfen ASCII sein.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` bzw. `{ ok: true; ... } | { ok: false; error }`. Kein `throw`. Non-critical (Vision) in try/catch. `revalidatePath` bei Mutation wo relevant.
- **DDL nur via Supabase-Plugin** `apply_migration` (Regel 2). Danach `list_migrations` → recorded Version ablesen → File `supabase/migrations/<version>_<name>.sql` exakt so benennen → `execute_sql` (READ) verifizieren. Nie `execute_sql` mit DDL, nie CLI `db push`.
- **Nie auf `main`/`staging` pushen** (Regel 1). Arbeit auf `kitta/anspruch-pruefen-tool`, PR gegen `staging`.
- **Design-Tokens:** `bg-claimondo-*`/`text-claimondo-*`, Status via `bg-success`/`-soft`/`text-success-strong` (nicht roh `green/red/...`), `rounded-ios-*`, Typo-Tokens (`text-body`/`text-heading-*`/`text-caption`). Keine Inline-Hex. Komponenten aus `@/components/primitives/*` + `@/components/shared/*` (Button `onClick`/`variant`/`loading`).
- **Supabase-Clients:** `createAdminClient()` = **sync**, service-role, bypasst RLS (für die anonyme Session nutzen). `createClient()` = **async** (`await`), cookie/auth. `createServiceClient()` = sync, service-role.
- **Kein `Date.now()`/`new Date()` in reinen Funktionen** — `aktuellesJahr` wird injiziert; nur Server-Actions/Routes dürfen `new Date()`.
- **Storage-Bucket:** `'fall-dokumente'`. Anon-Prefix `anspruch/{session_token}/...`. URL via `getStorageUrl(supabase, 'fall-dokumente', path, opts)` (async).
- **Vision:** `getAnthropicVisionClient()` (`→ Anthropic | null`) + `buildImageBlocks(urls, limit)` aus `@/lib/ai/vision/client`; Modell `AI_MODELS.vision_lead` (`'claude-sonnet-4-6'`); jede Nutzung via `logAiUsage({ endpoint, model, fallId?, usage })`.

---

## File Structure

**Neu (greenfield):**
- `supabase/migrations/<v1>_anspruch_rate_config.sql` — Rate-/Config-Tabellen + Seeds
- `supabase/migrations/<v2>_anspruch_schaetzungen.sql` — anon Session-Tabelle + RLS + `gfa.schaetzung_session_id`-Spalte
- `src/lib/anspruch/types.ts` — geteilte Typen (Segment, Position, Spanne, Config)
- `src/lib/anspruch/positionen.ts` — reine Rechenfunktion `berechneAnspruchsSpanne`
- `src/lib/anspruch/positionen.test.ts` — Test-Matrix
- `src/lib/anspruch/rates.ts` — DB-Loader für Sätze/Faktoren/Config
- `src/lib/anspruch/session.ts` — anon Session CRUD + Foto-Upload + Promotion
- `src/app/embed/anspruch-pruefen/actions.ts` — Server-Actions (Session/Upload/Vision/Berechnung)
- `src/app/embed/anspruch-pruefen/page.tsx` — Server-Page (noindex) rendert Wizard
- `src/app/embed/anspruch-pruefen/_components/AnspruchWizard.tsx` — Orchestrator
- `src/app/embed/anspruch-pruefen/_components/AnspruchFotoStep.tsx`
- `src/app/embed/anspruch-pruefen/_components/AnspruchEinschaetzungStep.tsx`
- `src/app/embed/anspruch-pruefen/_components/AnspruchSummaryStep.tsx`
- `src/components/shared/AnspruchPositionsListe.tsx` — geteilter Positions-Renderer
- `src/app/api/cron/anspruch-session-cleanup/route.ts` — TTL-Cleanup

**Modifiziert (nur additiv — Koordination mit aar-956/Finder-Sessions):**
- `src/app/embed/gutachter-finder/actions.ts` — optionaler `schaetzungSessionId` an `starteEmbedBuchung` + `reserviereEmbedTermin`
- `src/lib/actions/gutachter-finder-actions.ts` — `schaetzung_session_id` in `GutachterFinderPayload` + gfa-Insert
- `src/app/embed/gutachter-finder/_components/FinderWizard.tsx` — optionaler Prop `schaetzungSessionId`, an `reserviereEmbedTermin` weiterreichen
- `src/lib/start-link/issue-canonical-flowlink.ts` — Carry-over-Promotion, wenn `gfa.schaetzung_session_id` gesetzt

---

## Task 1: Rate-/Config-Tabellen + Seeds (DB)

**Files:**
- Create: `supabase/migrations/<v1>_anspruch_rate_config.sql` (Version vom Plugin)

**Interfaces:**
- Produces: Tabellen `nutzungsausfall_segment_saetze(segment text pk, tagessatz_min_eur numeric, tagessatz_max_eur numeric)`, `wertminderung_alter_faktoren(alter_bis_jahre int pk, faktor_min numeric, faktor_max numeric)`, `anspruch_config(key text pk, wert numeric)`.

- [ ] **Step 1: DDL schreiben** (lokale Datei zunächst als Scratch, Inhalt exakt):

```sql
-- Anspruch-pruefen Tool: DB-getriebene Rate-/Config-Referenzdaten (jaehrlich pflegbar).
-- Werte sind ILLUSTRATIVE vereinfachte Baender (nicht 1:1 Sanden-Danner) -> vor Live legal/fachlich pruefen.
create table if not exists public.nutzungsausfall_segment_saetze (
  segment text primary key,
  tagessatz_min_eur numeric not null,
  tagessatz_max_eur numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wertminderung_alter_faktoren (
  alter_bis_jahre integer primary key,
  faktor_min numeric not null,
  faktor_max numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.anspruch_config (
  key text primary key,
  wert numeric not null,
  created_at timestamptz not null default now()
);

alter table public.nutzungsausfall_segment_saetze enable row level security;
alter table public.wertminderung_alter_faktoren enable row level security;
alter table public.anspruch_config enable row level security;

-- Referenzdaten: fuer alle lesbar (auch anon, da Pre-Auth-Tool); Schreiben nur service_role.
grant select on public.nutzungsausfall_segment_saetze to anon, authenticated;
grant select on public.wertminderung_alter_faktoren to anon, authenticated;
grant select on public.anspruch_config to anon, authenticated;

drop policy if exists nasaetze_read on public.nutzungsausfall_segment_saetze;
create policy nasaetze_read on public.nutzungsausfall_segment_saetze for select to anon, authenticated using (true);
drop policy if exists wmfaktoren_read on public.wertminderung_alter_faktoren;
create policy wmfaktoren_read on public.wertminderung_alter_faktoren for select to anon, authenticated using (true);
drop policy if exists anspruchconfig_read on public.anspruch_config;
create policy anspruchconfig_read on public.anspruch_config for select to anon, authenticated using (true);

insert into public.nutzungsausfall_segment_saetze (segment, tagessatz_min_eur, tagessatz_max_eur) values
  ('kleinwagen', 29, 35),
  ('kompakt', 38, 43),
  ('mittelklasse', 50, 59),
  ('oberklasse', 65, 79),
  ('suv', 59, 79),
  ('transporter', 50, 65)
on conflict (segment) do nothing;

insert into public.wertminderung_alter_faktoren (alter_bis_jahre, faktor_min, faktor_max) values
  (2, 0.15, 0.30),
  (5, 0.05, 0.15)
on conflict (alter_bis_jahre) do nothing;

insert into public.anspruch_config (key, wert) values
  ('kostenpauschale_eur', 30),
  ('wertminderung_min_reparatur_eur', 750),
  ('wertminderung_max_alter_jahre', 5),
  ('bagatelle_schwelle_eur', 750),
  ('abschlepp_min_eur', 150),
  ('abschlepp_max_eur', 350),
  ('dauer_leicht_min_tage', 2),
  ('dauer_leicht_max_tage', 4),
  ('dauer_mittel_min_tage', 5),
  ('dauer_mittel_max_tage', 9),
  ('dauer_schwer_min_tage', 10),
  ('dauer_schwer_max_tage', 21)
on conflict (key) do nothing;
```

- [ ] **Step 2: Via Plugin anwenden** — `apply_migration({ name: "anspruch_rate_config", query: "<DDL oben>" })`.

- [ ] **Step 3: Recorded Version ablesen** — `list_migrations` → die neueste Version `<v1>` notieren.

- [ ] **Step 4: File committen** unter `supabase/migrations/<v1>_anspruch_rate_config.sql` mit exakt dem DDL aus Step 1 (Dateiname == `<v1>`).

- [ ] **Step 5: Verifizieren (READ)** — `execute_sql`:

```sql
select
 (select count(*) from public.nutzungsausfall_segment_saetze) as saetze,
 (select count(*) from public.wertminderung_alter_faktoren) as faktoren,
 (select count(*) from public.anspruch_config) as config;
```
Expected: `saetze=6, faktoren=2, config=12`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<v1>_anspruch_rate_config.sql
git commit -m "feat(anspruch): DB rate/config tables + seeds (nutzungsausfall/wertminderung/config)"
```

---

## Task 2: Anon Session-Tabelle + gfa-Spalte (DB)

**Files:**
- Create: `supabase/migrations/<v2>_anspruch_schaetzungen.sql`

**Interfaces:**
- Produces: Tabelle `anspruch_schaetzungen` (siehe DDL); neue Spalte `gutachter_finder_anfragen.schaetzung_session_id uuid null`.

- [ ] **Step 1: DDL schreiben:**

```sql
-- Anonyme Schaetz-Session (KEINE PII bis Handoff). service_role-only (deny-all clients).
create table if not exists public.anspruch_schaetzungen (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  foto_pfade jsonb not null default '[]'::jsonb,
  erkanntes_segment text,
  schweregrad text,
  fahrbereit boolean,
  ez_jahr integer,
  vision_result jsonb,
  positionen jsonb,
  lead_id uuid references public.leads(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
create index if not exists idx_anspruch_schaetzungen_lead on public.anspruch_schaetzungen(lead_id);

alter table public.anspruch_schaetzungen enable row level security;
-- Kein grant an anon/authenticated: Zugriff ausschliesslich ueber service-role Server-Actions
-- (session_token = Capability). Keine Policy => deny-all fuer Clients.

alter table public.gutachter_finder_anfragen
  add column if not exists schaetzung_session_id uuid null references public.anspruch_schaetzungen(id) on delete set null;
```

- [ ] **Step 2: Via Plugin anwenden** — `apply_migration({ name: "anspruch_schaetzungen", query: "<DDL>" })`.

- [ ] **Step 3: Recorded Version ablesen** — `list_migrations` → `<v2>`.

- [ ] **Step 4: File committen** unter `supabase/migrations/<v2>_anspruch_schaetzungen.sql`.

- [ ] **Step 5: Verifizieren (READ):**

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='anspruch_schaetzungen' order by ordinal_position;
select 1 from information_schema.columns
where table_schema='public' and table_name='gutachter_finder_anfragen' and column_name='schaetzung_session_id';
```
Expected: 11 Spalten der Session-Tabelle; 1 Zeile für die gfa-Spalte.

- [ ] **Step 6: Types regen** — `generate_typescript_types` → `src/lib/supabase/database.types.ts` überschreiben.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/<v2>_anspruch_schaetzungen.sql src/lib/supabase/database.types.ts
git commit -m "feat(anspruch): anon schaetzungen session table + gfa.schaetzung_session_id + types"
```

---

## Task 3: Geteilte Typen

**Files:**
- Create: `src/lib/anspruch/types.ts`

**Interfaces:**
- Produces: `Segment`, `Schweregrad`, `AnspruchPositionTyp`, `AnspruchPosition`, `AnspruchSpanne`, `SchaetzInput`, `SegmentSatz`, `WertminderungFaktor`, `AnspruchConfig`, `VisionResult`.

- [ ] **Step 1: Datei schreiben:**

```ts
export type Segment =
  | 'kleinwagen' | 'kompakt' | 'mittelklasse' | 'oberklasse' | 'suv' | 'transporter'

export const SEGMENTE: readonly Segment[] = [
  'kleinwagen', 'kompakt', 'mittelklasse', 'oberklasse', 'suv', 'transporter',
] as const

export const SEGMENT_LABEL: Record<Segment, string> = {
  kleinwagen: 'Kleinwagen',
  kompakt: 'Kompaktklasse',
  mittelklasse: 'Mittelklasse',
  oberklasse: 'Oberklasse',
  suv: 'SUV / Geländewagen',
  transporter: 'Transporter',
}

export type Schweregrad = 'leicht' | 'mittel' | 'schwer'

export type VisionResult = {
  beschaedigte_teile: string[]
  schweregrad: Schweregrad
  segment: Segment
  geschaetzte_kosten_min: number
  geschaetzte_kosten_max: number
  beschreibung: string
}

export type AnspruchPositionTyp =
  | 'reparatur' | 'nutzungsausfall' | 'wertminderung'
  | 'gutachterkosten' | 'kostenpauschale' | 'abschleppkosten'

export type AnspruchPosition = {
  typ: AnspruchPositionTyp
  label: string
  minEur: number | null
  maxEur: number | null
  hinweis?: string
  gedecktDurchGegner?: boolean
}

export type AnspruchSpanne = {
  positionen: AnspruchPosition[]
  gesamtMinEur: number
  gesamtMaxEur: number
  hinweise: string[]
}

export type SchaetzInput = {
  reparaturMinEur: number
  reparaturMaxEur: number
  schweregrad: Schweregrad
  segment: Segment
  fahrbereit: boolean
  ezJahr: number | null
  aktuellesJahr: number
}

export type SegmentSatz = { tagessatzMinEur: number; tagessatzMaxEur: number }
export type WertminderungFaktor = { alterBisJahre: number; faktorMin: number; faktorMax: number }

export type AnspruchConfig = {
  kostenpauschaleEur: number
  wertminderungMinReparaturEur: number
  wertminderungMaxAlterJahre: number
  bagatelleSchwelleEur: number
  abschleppMinEur: number
  abschleppMaxEur: number
  dauerTage: Record<Schweregrad, { min: number; max: number }>
}
```

- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit`. Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/anspruch/types.ts
git commit -m "feat(anspruch): shared types for positions/estimate"
```

---

## Task 4: Rechenkern `berechneAnspruchsSpanne` (reine Funktion, TDD)

**Files:**
- Create: `src/lib/anspruch/positionen.ts`
- Test: `src/lib/anspruch/positionen.test.ts`

**Interfaces:**
- Consumes: alle Typen aus `./types`.
- Produces: `berechneAnspruchsSpanne(input: SchaetzInput, saetze: Record<Segment, SegmentSatz>, faktoren: WertminderungFaktor[], config: AnspruchConfig): AnspruchSpanne`.

- [ ] **Step 1: Failing Test schreiben** (`positionen.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { berechneAnspruchsSpanne } from './positionen'
import type { Segment, SegmentSatz, WertminderungFaktor, AnspruchConfig, SchaetzInput } from './types'

const SAETZE: Record<Segment, SegmentSatz> = {
  kleinwagen: { tagessatzMinEur: 29, tagessatzMaxEur: 35 },
  kompakt: { tagessatzMinEur: 38, tagessatzMaxEur: 43 },
  mittelklasse: { tagessatzMinEur: 50, tagessatzMaxEur: 59 },
  oberklasse: { tagessatzMinEur: 65, tagessatzMaxEur: 79 },
  suv: { tagessatzMinEur: 59, tagessatzMaxEur: 79 },
  transporter: { tagessatzMinEur: 50, tagessatzMaxEur: 65 },
}
const FAKTOREN: WertminderungFaktor[] = [
  { alterBisJahre: 2, faktorMin: 0.15, faktorMax: 0.30 },
  { alterBisJahre: 5, faktorMin: 0.05, faktorMax: 0.15 },
]
const CONFIG: AnspruchConfig = {
  kostenpauschaleEur: 30,
  wertminderungMinReparaturEur: 750,
  wertminderungMaxAlterJahre: 5,
  bagatelleSchwelleEur: 750,
  abschleppMinEur: 150,
  abschleppMaxEur: 350,
  dauerTage: { leicht: { min: 2, max: 4 }, mittel: { min: 5, max: 9 }, schwer: { min: 10, max: 21 } },
}
const base: SchaetzInput = {
  reparaturMinEur: 900, reparaturMaxEur: 1800, schweregrad: 'mittel',
  segment: 'mittelklasse', fahrbereit: true, ezJahr: null, aktuellesJahr: 2026,
}

function typen(r: ReturnType<typeof berechneAnspruchsSpanne>) {
  return r.positionen.map((p) => p.typ)
}

describe('berechneAnspruchsSpanne', () => {
  it('fahrbereit + kein EZ: nur reparatur + gutachterkosten + kostenpauschale', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toEqual(['reparatur', 'gutachterkosten', 'kostenpauschale'])
    // reparatur 900..1800 + pauschale 30..30 ; gutachterkosten zaehlt NICHT in Gesamt
    expect(r.gesamtMinEur).toBe(930)
    expect(r.gesamtMaxEur).toBe(1830)
  })

  it('nicht fahrbereit: nutzungsausfall (segment x dauer) + abschleppkosten kommen dazu', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: false }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toContain('nutzungsausfall')
    expect(typen(r)).toContain('abschleppkosten')
    const na = r.positionen.find((p) => p.typ === 'nutzungsausfall')!
    // mittelklasse 50..59 x dauer mittel 5..9 => 250..531
    expect(na.minEur).toBe(250)
    expect(na.maxEur).toBe(531)
  })

  it('fahrbereit unterdrueckt nutzungsausfall UND abschleppkosten', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: true }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).not.toContain('nutzungsausfall')
    expect(typen(r)).not.toContain('abschleppkosten')
  })

  it('junges Fzg (<=2J) + mittel + Reparatur>Schwelle: wertminderung mit Faktor 0.15..0.30 auf Mitte', () => {
    const r = berechneAnspruchsSpanne({ ...base, ezJahr: 2025 }, SAETZE, FAKTOREN, CONFIG)
    const wm = r.positionen.find((p) => p.typ === 'wertminderung')!
    // Mitte (900+1800)/2 = 1350 ; 0.15..0.30 => 202.5..405 -> gerundet 203..405
    expect(wm.minEur).toBe(203)
    expect(wm.maxEur).toBe(405)
  })

  it('altes Fzg (>5J): keine wertminderung', () => {
    const r = berechneAnspruchsSpanne({ ...base, ezJahr: 2015 }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).not.toContain('wertminderung')
  })

  it('leichter Schaden: keine wertminderung, Bagatelle-Hinweis', () => {
    const r = berechneAnspruchsSpanne(
      { ...base, ezJahr: 2025, schweregrad: 'leicht', reparaturMinEur: 300, reparaturMaxEur: 600 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(typen(r)).not.toContain('wertminderung')
    expect(r.hinweise.join(' ')).toMatch(/Bagatelle|gering/i)
  })

  it('gutachterkosten immer vorhanden + gedecktDurchGegner, minEur null', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG)
    const gk = r.positionen.find((p) => p.typ === 'gutachterkosten')!
    expect(gk.gedecktDurchGegner).toBe(true)
    expect(gk.minEur).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen — muss fehlschlagen** — Run: `npx vitest run src/lib/anspruch/positionen.test.ts`. Expected: FAIL („berechneAnspruchsSpanne is not a function"/module not found).

- [ ] **Step 3: Implementierung schreiben** (`positionen.ts`):

```ts
import type {
  AnspruchConfig, AnspruchPosition, AnspruchSpanne, Segment, SegmentSatz,
  SchaetzInput, WertminderungFaktor,
} from './types'

function runde(n: number): number {
  return Math.round(n)
}

function findeFaktor(alter: number, faktoren: WertminderungFaktor[]): WertminderungFaktor | null {
  const sortiert = [...faktoren].sort((a, b) => a.alterBisJahre - b.alterBisJahre)
  return sortiert.find((f) => alter <= f.alterBisJahre) ?? null
}

export function berechneAnspruchsSpanne(
  input: SchaetzInput,
  saetze: Record<Segment, SegmentSatz>,
  faktoren: WertminderungFaktor[],
  config: AnspruchConfig,
): AnspruchSpanne {
  const positionen: AnspruchPosition[] = []
  const hinweise: string[] = []
  const reparaturMitte = (input.reparaturMinEur + input.reparaturMaxEur) / 2

  // 1) Reparaturkosten — immer
  positionen.push({
    typ: 'reparatur',
    label: 'Reparaturkosten',
    minEur: runde(input.reparaturMinEur),
    maxEur: runde(input.reparaturMaxEur),
  })

  // 2) Nutzungsausfall — nur wenn nicht fahrbereit
  if (!input.fahrbereit) {
    const satz = saetze[input.segment]
    const dauer = config.dauerTage[input.schweregrad]
    positionen.push({
      typ: 'nutzungsausfall',
      label: 'Nutzungsausfall',
      minEur: runde(satz.tagessatzMinEur * dauer.min),
      maxEur: runde(satz.tagessatzMaxEur * dauer.max),
      hinweis: `${satz.tagessatzMinEur}–${satz.tagessatzMaxEur} €/Tag × ${dauer.min}–${dauer.max} Tage`,
    })
  }

  // 3) Wertminderung — nur jung + Substanz + ueber Schwelle
  const alter = input.ezJahr != null ? input.aktuellesJahr - input.ezJahr : null
  const wmAnwendbar =
    alter != null &&
    alter <= config.wertminderungMaxAlterJahre &&
    input.schweregrad !== 'leicht' &&
    reparaturMitte >= config.wertminderungMinReparaturEur
  if (wmAnwendbar) {
    const faktor = findeFaktor(alter, faktoren)
    if (faktor) {
      positionen.push({
        typ: 'wertminderung',
        label: 'Wertminderung',
        minEur: runde(faktor.faktorMin * reparaturMitte),
        maxEur: runde(faktor.faktorMax * reparaturMitte),
      })
    }
  } else if (reparaturMitte < config.bagatelleSchwelleEur || input.schweregrad === 'leicht') {
    hinweise.push('Bei rein kosmetischen Schäden (Bagatelle) ist die Wertminderung meist gering oder entfällt.')
  }

  // 4) Sachverstaendigenkosten — immer, getragen von Gegnerversicherung (nicht in Gesamt)
  positionen.push({
    typ: 'gutachterkosten',
    label: 'Sachverständigenkosten',
    minEur: null,
    maxEur: null,
    gedecktDurchGegner: true,
    hinweis: 'Bei klarer Haftung trägt die gegnerische Versicherung diese Kosten.',
  })

  // 5) Auslagenpauschale — immer
  positionen.push({
    typ: 'kostenpauschale',
    label: 'Auslagenpauschale',
    minEur: config.kostenpauschaleEur,
    maxEur: config.kostenpauschaleEur,
  })

  // 6) Abschleppkosten — nur wenn nicht fahrbereit
  if (!input.fahrbereit) {
    positionen.push({
      typ: 'abschleppkosten',
      label: 'Abschleppkosten',
      minEur: config.abschleppMinEur,
      maxEur: config.abschleppMaxEur,
    })
  }

  const summierbar = positionen.filter((p) => !p.gedecktDurchGegner && p.minEur != null && p.maxEur != null)
  const gesamtMinEur = runde(summierbar.reduce((s, p) => s + (p.minEur as number), 0))
  const gesamtMaxEur = runde(summierbar.reduce((s, p) => s + (p.maxEur as number), 0))

  return { positionen, gesamtMinEur, gesamtMaxEur, hinweise }
}
```

- [ ] **Step 4: Test laufen — muss grün sein** — Run: `npx vitest run src/lib/anspruch/positionen.test.ts`. Expected: PASS (7 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/anspruch/positionen.ts src/lib/anspruch/positionen.test.ts
git commit -m "feat(anspruch): pure berechneAnspruchsSpanne + test matrix (TDD)"
```

---

## Task 5: Rate-Loader `rates.ts`

**Files:**
- Create: `src/lib/anspruch/rates.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (sync), Typen aus `./types`.
- Produces: `ladeAnspruchRates(): Promise<{ saetze: Record<Segment, SegmentSatz>; faktoren: WertminderungFaktor[]; config: AnspruchConfig }>`.

- [ ] **Step 1: Datei schreiben:**

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { AnspruchConfig, Schweregrad, Segment, SegmentSatz, WertminderungFaktor } from './types'
import { SEGMENTE } from './types'

export type AnspruchRates = {
  saetze: Record<Segment, SegmentSatz>
  faktoren: WertminderungFaktor[]
  config: AnspruchConfig
}

function num(map: Record<string, number>, key: string, fallback: number): number {
  return typeof map[key] === 'number' ? map[key] : fallback
}

export async function ladeAnspruchRates(): Promise<AnspruchRates> {
  const db = createAdminClient()
  const [saetzeRes, faktorenRes, configRes] = await Promise.all([
    db.from('nutzungsausfall_segment_saetze').select('segment, tagessatz_min_eur, tagessatz_max_eur'),
    db.from('wertminderung_alter_faktoren').select('alter_bis_jahre, faktor_min, faktor_max'),
    db.from('anspruch_config').select('key, wert'),
  ])

  const saetze = {} as Record<Segment, SegmentSatz>
  for (const seg of SEGMENTE) saetze[seg] = { tagessatzMinEur: 0, tagessatzMaxEur: 0 }
  for (const row of saetzeRes.data ?? []) {
    if ((SEGMENTE as readonly string[]).includes(row.segment)) {
      saetze[row.segment as Segment] = {
        tagessatzMinEur: Number(row.tagessatz_min_eur),
        tagessatzMaxEur: Number(row.tagessatz_max_eur),
      }
    }
  }

  const faktoren: WertminderungFaktor[] = (faktorenRes.data ?? []).map((r) => ({
    alterBisJahre: Number(r.alter_bis_jahre),
    faktorMin: Number(r.faktor_min),
    faktorMax: Number(r.faktor_max),
  }))

  const cfg: Record<string, number> = {}
  for (const row of configRes.data ?? []) cfg[row.key] = Number(row.wert)

  const config: AnspruchConfig = {
    kostenpauschaleEur: num(cfg, 'kostenpauschale_eur', 30),
    wertminderungMinReparaturEur: num(cfg, 'wertminderung_min_reparatur_eur', 750),
    wertminderungMaxAlterJahre: num(cfg, 'wertminderung_max_alter_jahre', 5),
    bagatelleSchwelleEur: num(cfg, 'bagatelle_schwelle_eur', 750),
    abschleppMinEur: num(cfg, 'abschlepp_min_eur', 150),
    abschleppMaxEur: num(cfg, 'abschlepp_max_eur', 350),
    dauerTage: {
      leicht: { min: num(cfg, 'dauer_leicht_min_tage', 2), max: num(cfg, 'dauer_leicht_max_tage', 4) },
      mittel: { min: num(cfg, 'dauer_mittel_min_tage', 5), max: num(cfg, 'dauer_mittel_max_tage', 9) },
      schwer: { min: num(cfg, 'dauer_schwer_min_tage', 10), max: num(cfg, 'dauer_schwer_max_tage', 21) },
    } as Record<Schweregrad, { min: number; max: number }>,
  }

  return { saetze, faktoren, config }
}
```

- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit`. Expected: keine neuen Fehler (setzt Task-2-Types voraus).

- [ ] **Step 3: Commit**

```bash
git add src/lib/anspruch/rates.ts
git commit -m "feat(anspruch): DB rate/config loader"
```

---

## Task 6: Anon Session-Lib `session.ts`

**Files:**
- Create: `src/lib/anspruch/session.ts`

**Interfaces:**
- Consumes: `createAdminClient()`, `getStorageUrl`, Typen.
- Produces: `erstelleSession(): Promise<{ ok: true; sessionToken: string } | { ok: false; error: string }>`; `ladeFotoInSession(sessionToken: string, file: { bytes: ArrayBuffer; contentType: string; ext: string }): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }>`; `ladeFotoUrls(sessionToken: string): Promise<string[]>`; `speichereVisionResult(sessionToken, vision): Promise<void>`; `speicherePositionen(sessionToken, segment, schweregrad, fahrbereit, ezJahr, positionen): Promise<void>`; `promoteSessionAufLead(sessionToken: string, leadId: string): Promise<void>`.

- [ ] **Step 1: Datei schreiben:**

```ts
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorageUrl } from '@/lib/storage/url'
import type { AnspruchPosition, Schweregrad, Segment, VisionResult } from './types'

const BUCKET = 'fall-dokumente'
const MAX_FOTOS = 8

export async function erstelleSession(): Promise<
  { ok: true; sessionToken: string } | { ok: false; error: string }
> {
  const db = createAdminClient()
  const sessionToken = randomUUID()
  const { error } = await db.from('anspruch_schaetzungen').insert({ session_token: sessionToken })
  if (error) return { ok: false, error: error.message }
  return { ok: true, sessionToken }
}

async function ladeSession(db: ReturnType<typeof createAdminClient>, sessionToken: string) {
  const { data } = await db
    .from('anspruch_schaetzungen')
    .select('id, foto_pfade, lead_id')
    .eq('session_token', sessionToken)
    .maybeSingle()
  return data
}

export async function ladeFotoInSession(
  sessionToken: string,
  file: { bytes: ArrayBuffer; contentType: string; ext: string },
): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const db = createAdminClient()
  const row = await ladeSession(db, sessionToken)
  if (!row) return { ok: false, error: 'Session nicht gefunden' }
  const pfade = Array.isArray(row.foto_pfade) ? (row.foto_pfade as string[]) : []
  if (pfade.length >= MAX_FOTOS) return { ok: false, error: `Maximal ${MAX_FOTOS} Fotos` }

  const path = `anspruch/${sessionToken}/${randomUUID()}.${file.ext}`
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const neu = [...pfade, path]
  const { error: dbErr } = await db
    .from('anspruch_schaetzungen')
    .update({ foto_pfade: neu })
    .eq('session_token', sessionToken)
  if (dbErr) return { ok: false, error: dbErr.message }
  return { ok: true, anzahl: neu.length }
}

export async function ladeFotoUrls(sessionToken: string): Promise<string[]> {
  const db = createAdminClient()
  const row = await ladeSession(db, sessionToken)
  const pfade = Array.isArray(row?.foto_pfade) ? (row!.foto_pfade as string[]) : []
  const urls = await Promise.all(pfade.map((p) => getStorageUrl(db, BUCKET, p, { context: 'ui' })))
  return urls.filter((u): u is string => Boolean(u))
}

export async function speichereVisionResult(sessionToken: string, vision: VisionResult): Promise<void> {
  const db = createAdminClient()
  await db
    .from('anspruch_schaetzungen')
    .update({
      vision_result: vision,
      erkanntes_segment: vision.segment,
      schweregrad: vision.schweregrad,
    })
    .eq('session_token', sessionToken)
}

export async function speicherePositionen(
  sessionToken: string,
  segment: Segment,
  schweregrad: Schweregrad,
  fahrbereit: boolean,
  ezJahr: number | null,
  positionen: AnspruchPosition[],
): Promise<void> {
  const db = createAdminClient()
  await db
    .from('anspruch_schaetzungen')
    .update({ erkanntes_segment: segment, schweregrad, fahrbereit, ez_jahr: ezJahr, positionen })
    .eq('session_token', sessionToken)
}

export async function promoteSessionAufLead(sessionToken: string, leadId: string): Promise<void> {
  const db = createAdminClient()
  await db.from('anspruch_schaetzungen').update({ lead_id: leadId }).eq('session_token', sessionToken)
}
```

- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit`. Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/anspruch/session.ts
git commit -m "feat(anspruch): anonymous session lib (create/upload/vision/positions/promote)"
```

---

## Task 7: Server-Actions (Session / Upload / Vision / Berechnung)

**Files:**
- Create: `src/app/embed/anspruch-pruefen/actions.ts`

**Interfaces:**
- Consumes: `session.ts`, `rates.ts`, `positionen.ts`, `getAnthropicVisionClient`, `buildImageBlocks`, `logAiUsage`, `AI_MODELS`.
- Produces: `starteAnspruchSession()`, `ladeSchadenfoto(sessionToken, formData)`, `analysiereSchaden(sessionToken)`, `berechneAnspruch(sessionToken, { segment, fahrbereit, ezJahr })`.

- [ ] **Step 1: Datei schreiben:**

```ts
'use server'

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import { ladeAnspruchRates } from '@/lib/anspruch/rates'
import { berechneAnspruchsSpanne } from '@/lib/anspruch/positionen'
import {
  erstelleSession, ladeFotoInSession, ladeFotoUrls,
  speichereVisionResult, speicherePositionen,
} from '@/lib/anspruch/session'
import { SEGMENTE, type AnspruchSpanne, type Segment, type VisionResult } from '@/lib/anspruch/types'
import { createAdminClient } from '@/lib/supabase/admin'

const VISION_SYSTEM = `Du bist ein KFZ-Schadensexperte fuer den deutschen Markt. Antworte IMMER als valides JSON mit exakt diesem Schema, ohne weiteren Text:
{
  "beschaedigte_teile": ["string"],
  "schweregrad": "leicht" | "mittel" | "schwer",
  "segment": "kleinwagen" | "kompakt" | "mittelklasse" | "oberklasse" | "suv" | "transporter",
  "geschaetzte_kosten_min": number,
  "geschaetzte_kosten_max": number,
  "beschreibung": "string"
}
Schaetze Reparaturkosten als realistische BRUTTO-Spanne (deutsche Werkstattpreise). "segment" = Fahrzeugklasse aus dem sichtbaren Fahrzeug. Sei konservativ; bei Unsicherheit breitere Spanne.`

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

export async function starteAnspruchSession() {
  return erstelleSession()
}

export async function ladeSchadenfoto(
  sessionToken: string,
  formData: FormData,
): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const file = formData.get('foto')
  if (!(file instanceof File)) return { ok: false, error: 'Kein Foto' }
  if (!ALLOWED.has(file.type)) return { ok: false, error: 'Nur JPEG/PNG/WebP' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Foto zu groß (max. 10 MB)' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const bytes = await file.arrayBuffer()
  return ladeFotoInSession(sessionToken, { bytes, contentType: file.type, ext })
}

function parseVision(text: string): VisionResult | null {
  try {
    const o = JSON.parse(text)
    if (!(SEGMENTE as readonly string[]).includes(o.segment)) o.segment = 'mittelklasse'
    if (!['leicht', 'mittel', 'schwer'].includes(o.schweregrad)) o.schweregrad = 'mittel'
    if (typeof o.geschaetzte_kosten_min !== 'number' || typeof o.geschaetzte_kosten_max !== 'number') return null
    return o as VisionResult
  } catch {
    return null
  }
}

export async function analysiereSchaden(
  sessionToken: string,
): Promise<{ ok: true; vision: VisionResult } | { ok: false; error: string }> {
  const client = getAnthropicVisionClient()
  if (!client) return { ok: false, error: 'Analyse aktuell nicht verfügbar' }
  const urls = await ladeFotoUrls(sessionToken)
  if (urls.length === 0) return { ok: false, error: 'Bitte zuerst mindestens ein Foto hochladen' }

  try {
    const response = await client.messages.create({
      model: AI_MODELS.vision_lead,
      max_tokens: 1024,
      system: VISION_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          ...buildImageBlocks(urls, 8),
          { type: 'text' as const, text: 'Analysiere diese KFZ-Schadenfotos und gib das JSON zurück.' },
        ] as Anthropic.Messages.ContentBlockParam[],
      }],
    })
    void logAiUsage({ endpoint: 'anspruch-pruefen/analyse', model: AI_MODELS.vision_lead, usage: response.usage })
    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}'
    const vision = parseVision(text)
    if (!vision) return { ok: false, error: 'Analyse fehlgeschlagen' }
    await speichereVisionResult(sessionToken, vision)
    return { ok: true, vision }
  } catch (err) {
    console.error('[anspruch] vision error', err)
    return { ok: false, error: 'Analyse fehlgeschlagen' }
  }
}

export async function berechneAnspruch(
  sessionToken: string,
  eingabe: { segment: Segment; fahrbereit: boolean; ezJahr: number | null },
): Promise<{ ok: true; spanne: AnspruchSpanne } | { ok: false; error: string }> {
  const db = createAdminClient()
  const { data: row } = await db
    .from('anspruch_schaetzungen')
    .select('vision_result')
    .eq('session_token', sessionToken)
    .maybeSingle()
  const vision = row?.vision_result as VisionResult | null
  if (!vision) return { ok: false, error: 'Keine Analyse vorhanden' }

  const { saetze, faktoren, config } = await ladeAnspruchRates()
  const spanne = berechneAnspruchsSpanne(
    {
      reparaturMinEur: vision.geschaetzte_kosten_min,
      reparaturMaxEur: vision.geschaetzte_kosten_max,
      schweregrad: vision.schweregrad,
      segment: eingabe.segment,
      fahrbereit: eingabe.fahrbereit,
      ezJahr: eingabe.ezJahr,
      aktuellesJahr: new Date().getFullYear(),
    },
    saetze, faktoren, config,
  )
  await speicherePositionen(sessionToken, eingabe.segment, vision.schweregrad, eingabe.fahrbereit, eingabe.ezJahr, spanne.positionen)
  return { ok: true, spanne }
}
```

- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit`. Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/app/embed/anspruch-pruefen/actions.ts
git commit -m "feat(anspruch): server actions (session/upload/vision/berechnung)"
```

---

## Task 8: Geteilter Positions-Renderer `AnspruchPositionsListe`

**Files:**
- Create: `src/components/shared/AnspruchPositionsListe.tsx`

**Interfaces:**
- Consumes: `AnspruchSpanne` aus `@/lib/anspruch/types`.
- Produces: `export function AnspruchPositionsListe({ spanne }: { spanne: AnspruchSpanne })`.

- [ ] **Step 1: Datei schreiben** (token-konform, Umlaute; €-Formatierung de-DE):

```tsx
import type { AnspruchSpanne } from '@/lib/anspruch/types'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function AnspruchPositionsListe({ spanne }: { spanne: AnspruchSpanne }) {
  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-4">
      <ul className="divide-y divide-claimondo-border">
        {spanne.positionen.map((p) => (
          <li key={p.typ} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="text-body font-medium text-claimondo-navy">{p.label}</p>
              {p.hinweis ? <p className="text-caption text-claimondo-slate">{p.hinweis}</p> : null}
            </div>
            <div className="shrink-0 text-right text-body font-semibold text-claimondo-navy">
              {p.gedecktDurchGegner || p.minEur == null || p.maxEur == null ? (
                <span className="text-success-strong">Gegnerversicherung</span>
              ) : p.minEur === p.maxEur ? (
                eur(p.minEur)
              ) : (
                `${eur(p.minEur)} – ${eur(p.maxEur)}`
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between rounded-ios-md bg-claimondo-navy px-4 py-3">
        <span className="text-body font-medium text-white">Ihr möglicher Anspruch</span>
        <span className="text-heading-sm font-bold text-white">
          {eur(spanne.gesamtMinEur)} – {eur(spanne.gesamtMaxEur)}
        </span>
      </div>

      {spanne.hinweise.map((h) => (
        <p key={h} className="mt-2 text-caption text-claimondo-slate">{h}</p>
      ))}
      <p className="mt-2 text-caption text-claimondo-slate">
        Unverbindliche Ersteinschätzung anhand Ihrer Fotos. Den verbindlichen Anspruch ermittelt Ihr Gutachter.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Token-Audit + tsc** — Run: `npm run check:token-audit` und `npx tsc --noEmit`. Expected: 0 Violations, keine neuen tsc-Fehler. (Falls `text-claimondo-slate`/`-border` nicht existieren: gegen `src/lib/design-tokens.ts` verifizieren und passendes Token nutzen.)

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/AnspruchPositionsListe.tsx
git commit -m "feat(anspruch): shared AnspruchPositionsListe renderer"
```

---

## Task 9: Wizard-Phasen (Foto / Einschätzung / Summary)

**Files:**
- Create: `src/app/embed/anspruch-pruefen/_components/AnspruchFotoStep.tsx`
- Create: `src/app/embed/anspruch-pruefen/_components/AnspruchEinschaetzungStep.tsx`
- Create: `src/app/embed/anspruch-pruefen/_components/AnspruchSummaryStep.tsx`

**Interfaces:**
- Consumes: Actions aus `../actions`, Typen, `AnspruchPositionsListe`.
- Produces: `AnspruchFotoStep({ sessionToken, onWeiter })`, `AnspruchEinschaetzungStep({ sessionToken, vision, onFertig })`, `AnspruchSummaryStep({ spanne, onBeauftragen })`.

- [ ] **Step 1: `AnspruchFotoStep.tsx` schreiben** (Kamera mobil, 3–5 Winkel erbitten, dann Analyse):

```tsx
'use client'
import { useState } from 'react'
import { ladeSchadenfoto, analysiereSchaden } from '../actions'
import type { VisionResult } from '@/lib/anspruch/types'
import { Button } from '@/components/primitives/Button'

export function AnspruchFotoStep({
  sessionToken, onWeiter,
}: { sessionToken: string; onWeiter: (v: VisionResult) => void }) {
  const [anzahl, setAnzahl] = useState(0)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setFehler(null); setBusy(true)
    for (const f of files) {
      const fd = new FormData(); fd.set('foto', f)
      const r = await ladeSchadenfoto(sessionToken, fd)
      if (r.ok) setAnzahl(r.anzahl)
      else setFehler(r.error)
    }
    setBusy(false)
    e.target.value = ''
  }

  async function analysieren() {
    setBusy(true); setFehler(null)
    const r = await analysiereSchaden(sessionToken)
    setBusy(false)
    if (r.ok) onWeiter(r.vision)
    else setFehler(r.error)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Schaden fotografieren</h2>
        <p className="text-body-sm text-claimondo-slate">
          Am besten 3–5 Fotos: Gesamtansicht, Nahaufnahme des Schadens und angrenzende Teile.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-center rounded-ios-md border border-dashed border-claimondo-border bg-claimondo-bg px-4 py-8 text-body text-claimondo-navy">
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onFile} disabled={busy} />
        {anzahl > 0 ? `${anzahl} Foto(s) hinzugefügt — weitere hinzufügen` : 'Fotos aufnehmen oder auswählen'}
      </label>

      {fehler ? <p className="text-body-sm text-danger-strong">{fehler}</p> : null}

      <Button onClick={analysieren} loading={busy} disabled={anzahl === 0} className="w-full">
        Schaden analysieren
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: `AnspruchEinschaetzungStep.tsx` schreiben** (Segment-Chip korrigierbar, fahrbereit, EZ-Jahr):

```tsx
'use client'
import { useState } from 'react'
import { berechneAnspruch } from '../actions'
import { SEGMENTE, SEGMENT_LABEL, type AnspruchSpanne, type Segment, type VisionResult } from '@/lib/anspruch/types'
import { Button } from '@/components/primitives/Button'

export function AnspruchEinschaetzungStep({
  sessionToken, vision, onFertig,
}: { sessionToken: string; vision: VisionResult; onFertig: (s: AnspruchSpanne) => void }) {
  const [segment, setSegment] = useState<Segment>(vision.segment)
  const [fahrbereit, setFahrbereit] = useState<boolean | null>(null)
  const [ezJahr, setEzJahr] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function weiter() {
    if (fahrbereit === null) { setFehler('Bitte angeben, ob das Fahrzeug fahrbereit ist'); return }
    setBusy(true); setFehler(null)
    const jahr = ezJahr.trim() ? Number(ezJahr.trim()) : null
    const r = await berechneAnspruch(sessionToken, { segment, fahrbereit, ezJahr: Number.isFinite(jahr as number) ? jahr : null })
    setBusy(false)
    if (r.ok) onFertig(r.spanne)
    else setFehler(r.error)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Erkannt: {vision.beschaedigte_teile.join(', ')}</h2>
        <p className="text-body-sm text-claimondo-slate">{vision.beschreibung}</p>
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-claimondo-navy">Fahrzeugklasse</p>
        <div className="flex flex-wrap gap-2">
          {SEGMENTE.map((s) => (
            <button key={s} type="button" onClick={() => setSegment(s)}
              className={`rounded-ios-sm border px-3 py-1.5 text-body-sm ${segment === s ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>
              {SEGMENT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-claimondo-navy">Ist Ihr Fahrzeug noch fahrbereit?</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setFahrbereit(true)}
            className={`flex-1 rounded-ios-sm border px-3 py-2 text-body-sm ${fahrbereit === true ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>Ja, fahrbereit</button>
          <button type="button" onClick={() => setFahrbereit(false)}
            className={`flex-1 rounded-ios-sm border px-3 py-2 text-body-sm ${fahrbereit === false ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>Nein, nicht fahrbereit</button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-body-sm font-medium text-claimondo-navy">Erstzulassung (Jahr)</label>
        <input inputMode="numeric" value={ezJahr} onChange={(e) => setEzJahr(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="z. B. 2021"
          className="w-full rounded-ios-sm border border-claimondo-border px-3 py-2 text-body text-claimondo-navy" />
        <p className="mt-1 text-caption text-claimondo-slate">Für die Einschätzung der Wertminderung. Optional.</p>
      </div>

      {fehler ? <p className="text-body-sm text-danger-strong">{fehler}</p> : null}
      <Button onClick={weiter} loading={busy} className="w-full">Anspruch anzeigen</Button>
    </div>
  )
}
```

- [ ] **Step 3: `AnspruchSummaryStep.tsx` schreiben:**

```tsx
'use client'
import type { AnspruchSpanne } from '@/lib/anspruch/types'
import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import { Button } from '@/components/primitives/Button'

export function AnspruchSummaryStep({
  spanne, onBeauftragen,
}: { spanne: AnspruchSpanne; onBeauftragen: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Ihr möglicher Anspruch</h2>
        <p className="text-body-sm text-claimondo-slate">
          So machen Sie ihn verbindlich: ein Gutachter erstellt das offizielle Gutachten.
        </p>
      </div>
      <AnspruchPositionsListe spanne={spanne} />
      <Button onClick={onBeauftragen} className="w-full">Gutachter beauftragen</Button>
    </div>
  )
}
```

- [ ] **Step 4: tsc + Token-Audit** — Run: `npx tsc --noEmit` und `npm run check:token-audit`. Expected: keine neuen Fehler; 0 Violations. (Button-Prop-API `onClick`/`loading` gegen `@/components/primitives/Button` verifizieren; Import-Pfad ggf. an FinderWizard-Imports angleichen.)

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/anspruch-pruefen/_components/
git commit -m "feat(anspruch): wizard steps (foto/einschaetzung/summary)"
```

---

## Task 10: Handoff-Verdrahtung (additiv in Finder-Pipeline)

**Files:**
- Modify: `src/lib/actions/gutachter-finder-actions.ts` (Payload-Typ L51-75 + Insert L251-280)
- Modify: `src/app/embed/gutachter-finder/actions.ts` (`starteEmbedBuchung` L33-54, `reserviereEmbedTermin` L261-278)
- Modify: `src/lib/start-link/issue-canonical-flowlink.ts` (nach Lead-Create, ~L188)

**Interfaces:**
- Consumes: `promoteSessionAufLead` aus `@/lib/anspruch/session`; `anspruch_schaetzungen`-Spalten.
- Produces: `schaetzungSessionId` fließt Finder→gfa→Promoter; Fotos/fahrbereit/ez/beschreibung landen auf dem Lead.

- [ ] **Step 1: `GutachterFinderPayload` + gfa-Insert erweitern** — in `src/lib/actions/gutachter-finder-actions.ts`, im Payload-Typ (L51-75) ergänzen:

```ts
  schaetzung_session_id?: string | null
```
und im `.insert({...})`-Objekt (L251-280) ergänzen:

```ts
  schaetzung_session_id: payload.schaetzung_session_id ?? null,
```

- [ ] **Step 2: Embed-Actions durchreichen** — in `src/app/embed/gutachter-finder/actions.ts`:
  `EmbedBuchungInput` (L33-50) um `schaetzungSessionId?: string | null` erweitern; im Aufruf von `erstelleGutachterFinderAnfrage(...)` (innerhalb `starteEmbedBuchung`) `schaetzung_session_id: input.schaetzungSessionId ?? null` mitgeben. In `reserviereEmbedTermin` (L261-278) den Input-Typ um `schaetzungSessionId?: string | null` erweitern und beim internen `starteEmbedBuchung`-Aufruf durchreichen.

- [ ] **Step 3: Carry-over-Promotion im Promoter** — in `src/lib/start-link/issue-canonical-flowlink.ts`, unmittelbar **nach** erfolgreicher Lead-Erstellung und dem gfa-write-back (nach ~L194, wo `leadId` bekannt ist), additiv einfügen:

```ts
  // Anspruch-pruefen Carry-over: Fotos + Inputs + Schaetzung auf den Lead ziehen.
  if (gfa.schaetzung_session_id) {
    try {
      const { data: sess } = await admin
        .from('anspruch_schaetzungen')
        .select('foto_pfade, fahrbereit, ez_jahr, vision_result, session_token')
        .eq('id', gfa.schaetzung_session_id)
        .maybeSingle()
      if (sess) {
        const pfade = Array.isArray(sess.foto_pfade) ? (sess.foto_pfade as string[]) : []
        const vision = sess.vision_result as { beschreibung?: string } | null
        await admin.from('leads').update({
          schadensfoto_urls: pfade,
          fahrzeug_fahrbereit: sess.fahrbereit,
          erstzulassung: sess.ez_jahr ? String(sess.ez_jahr) : null,
          fahrzeugschaden_beschreibung: vision?.beschreibung ?? null,
          schaden_sichtbar: pfade.length > 0,
        }).eq('id', leadId)
        for (const p of pfade) {
          await admin.from('fall_dokumente').insert({
            fall_id: leadId, dokument_typ: 'schadensfotos', storage_path: p, uploaded_by_kunde: true,
          })
        }
        await admin.from('anspruch_schaetzungen').update({ lead_id: leadId }).eq('id', gfa.schaetzung_session_id)
      }
    } catch (err) {
      console.error('[anspruch] carry-over failed', err)
    }
  }
```
(Falls in dieser Datei die Service-Client-Variable nicht `admin` heißt: an die dort verwendete Variable angleichen — Datei vor dem Edit lesen. `fall_dokumente`-Spalten gegen `database.types.ts` prüfen; `fall_id` = `leadId`, da claim-first `fall_id == claim_id` erst später — hier bewusst Lead-scoped Foto-Referenz, das genügt für die Anzeige.)

- [ ] **Step 4: tsc** — Run: `npx tsc --noEmit`. Expected: keine neuen Fehler.

- [ ] **Step 5: RLS/Smoke (READ, JWT-simuliert wo relevant)** — via Plugin `execute_sql` in einer Transaktion prüfen, dass die gfa-Spalte schreibbar ist und der Promoter-Pfad kompiliert (manueller Insert-Test):

```sql
begin;
insert into public.anspruch_schaetzungen (session_token, foto_pfade, fahrbereit, ez_jahr)
values ('smoke-'||gen_random_uuid()::text, '["anspruch/x/y.jpg"]'::jsonb, false, 2021)
returning id;
rollback;
```
Expected: 1 Zeile zurück, rollback sauber.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/gutachter-finder-actions.ts src/app/embed/gutachter-finder/actions.ts src/lib/start-link/issue-canonical-flowlink.ts
git commit -m "feat(anspruch): thread schaetzung_session_id Finder->gfa->promoter + lead carry-over"
```

---

## Task 11: Orchestrator `AnspruchWizard` + Route/Page

**Files:**
- Create: `src/app/embed/anspruch-pruefen/_components/AnspruchWizard.tsx`
- Create: `src/app/embed/anspruch-pruefen/page.tsx`

**Interfaces:**
- Consumes: die 3 Step-Komponenten, `starteAnspruchSession`, `<FinderWizard>` (mit neuem Prop, Task 12).
- Produces: die gerenderte Wizard-Linie unter `/embed/anspruch-pruefen`.

- [ ] **Step 1: `AnspruchWizard.tsx` schreiben:**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { starteAnspruchSession } from '../actions'
import { AnspruchFotoStep } from './AnspruchFotoStep'
import { AnspruchEinschaetzungStep } from './AnspruchEinschaetzungStep'
import { AnspruchSummaryStep } from './AnspruchSummaryStep'
import { FinderWizard } from '@/app/embed/gutachter-finder/_components/FinderWizard'
import type { AnspruchSpanne, VisionResult } from '@/lib/anspruch/types'

type Phase = 'foto' | 'einschaetzung' | 'summary' | 'finder'

export function AnspruchWizard() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('foto')
  const [vision, setVision] = useState<VisionResult | null>(null)
  const [spanne, setSpanne] = useState<AnspruchSpanne | null>(null)

  useEffect(() => {
    let aktiv = true
    starteAnspruchSession().then((r) => { if (aktiv && r.ok) setSessionToken(r.sessionToken) })
    return () => { aktiv = false }
  }, [])

  if (!sessionToken) return <div className="p-6 text-center text-body-sm text-claimondo-slate">Wird geladen…</div>

  return (
    <div className="mx-auto max-w-md p-4">
      {phase === 'foto' && (
        <AnspruchFotoStep sessionToken={sessionToken} onWeiter={(v) => { setVision(v); setPhase('einschaetzung') }} />
      )}
      {phase === 'einschaetzung' && vision && (
        <AnspruchEinschaetzungStep sessionToken={sessionToken} vision={vision} onFertig={(s) => { setSpanne(s); setPhase('summary') }} />
      )}
      {phase === 'summary' && spanne && (
        <AnspruchSummaryStep spanne={spanne} onBeauftragen={() => setPhase('finder')} />
      )}
      {phase === 'finder' && (
        <div className="space-y-3">
          <p className="text-body-sm text-claimondo-slate">Schritt 2: Gutachter finden & Termin sichern.</p>
          <FinderWizard schaetzungSessionId={sessionToken} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `page.tsx` schreiben** (noindex Server-Page):

```tsx
import type { Metadata } from 'next'
import { AnspruchWizard } from './_components/AnspruchWizard'

export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Anspruch prüfen' }

export default function AnspruchPruefenPage() {
  return (
    <main className="min-h-screen bg-claimondo-bg">
      <AnspruchWizard />
    </main>
  )
}
```

- [ ] **Step 3: tsc** — Run: `npx tsc --noEmit`. Expected: schlägt noch fehl an `FinderWizard`-Prop `schaetzungSessionId` (kommt in Task 12) — sonst keine Fehler. Notiz für Executor: Task 11 + 12 zusammen grün.

- [ ] **Step 4: Commit**

```bash
git add src/app/embed/anspruch-pruefen/_components/AnspruchWizard.tsx src/app/embed/anspruch-pruefen/page.tsx
git commit -m "feat(anspruch): AnspruchWizard orchestrator + /embed/anspruch-pruefen page (noindex)"
```

---

## Task 12: FinderWizard-Prop `schaetzungSessionId`

**Files:**
- Modify: `src/app/embed/gutachter-finder/_components/FinderWizard.tsx` (Props L84-100; `reserviereEmbedTermin`-Aufruf)

**Interfaces:**
- Consumes: `reserviereEmbedTermin`-Input mit `schaetzungSessionId` (Task 10).
- Produces: `FinderWizard`-Prop `schaetzungSessionId?: string | null`, an die Buchungs-Action durchgereicht.

- [ ] **Step 1: Prop ergänzen** — in FinderWizard-Props (L84-100) hinzufügen: `schaetzungSessionId?: string | null` (und in der Destrukturierung `schaetzungSessionId`).

- [ ] **Step 2: Durchreichen** — im `reserviereEmbedTermin({ ... })`-Aufruf (im `kontaktAbsenden`/Buchungs-Handler) `schaetzungSessionId: schaetzungSessionId ?? null` ergänzen. Datei vor Edit lesen, exakte Aufrufstelle finden.

- [ ] **Step 3: Build** — Run: `npm run build`. Expected: grün (Route-/Server-Component-Validierung inkl. neuer Page). Falls Fehler an fehlenden Tokens/Imports: beheben.

- [ ] **Step 4: Commit**

```bash
git add src/app/embed/gutachter-finder/_components/FinderWizard.tsx
git commit -m "feat(anspruch): FinderWizard schaetzungSessionId prop -> reserviereEmbedTermin"
```

---

## Task 13: TTL-Cleanup-Cron

**Files:**
- Create: `src/app/api/cron/anspruch-session-cleanup/route.ts`

**Interfaces:**
- Consumes: `createAdminClient()`.
- Produces: `GET`-Route, die anonyme (lead_id null) Sessions > 30 Tage + deren Fotos löscht.

- [ ] **Step 1: Route schreiben** (Cron-Auth-Muster einer bestehenden Cron-Route spiegeln — vor Edit z. B. `src/app/api/cron/slot-ttl-cleanup/route.ts` lesen und dessen Header/Secret-Guard übernehmen):

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  const { data: alt } = await db
    .from('anspruch_schaetzungen')
    .select('id, session_token, foto_pfade')
    .is('lead_id', null)
    .lt('erstellt_am', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
  let geloescht = 0
  for (const row of alt ?? []) {
    const pfade = Array.isArray(row.foto_pfade) ? (row.foto_pfade as string[]) : []
    if (pfade.length) await db.storage.from('fall-dokumente').remove(pfade)
    await db.from('anspruch_schaetzungen').delete().eq('id', row.id)
    geloescht++
  }
  return NextResponse.json({ ok: true, geloescht })
}
```

- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit`. Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/anspruch-session-cleanup/route.ts
git commit -m "feat(anspruch): TTL cleanup cron for anonymous estimate sessions"
```

---

## Task 14: End-to-End-Verifikation + Abschluss

**Files:** keine neuen — Gesamtverifikation.

- [ ] **Step 1: Voller Build** — Run: `npm run build`. Expected: grün.
- [ ] **Step 2: Tests** — Run: `npx vitest run src/lib/anspruch/`. Expected: alle grün.
- [ ] **Step 3: Ratchets** — Run: `npm run check:token-audit` und `npm run check:component-set` und `npm run check:knip`. Expected: keine neuen Violations (lokal `--warn`).
- [ ] **Step 4: Manuelle Smoke (lokal `npm run dev`)** — `/embed/anspruch-pruefen` öffnen: Foto hochladen → „Schaden analysieren" → Segment-Chip + fahrbereit + EZ → „Anspruch anzeigen" → Summary mit Spannen → „Gutachter beauftragen" → FinderWizard erscheint → Ort/Slot/Kontakt → FlowLink. In Prod-DB (READ) prüfen, dass die Session `lead_id` gesetzt bekam und der Lead `schadensfoto_urls`/`fahrzeug_fahrbereit`/`erstzulassung` trägt.
- [ ] **Step 5: Abschluss-Checkliste** — `git status` clean, `git stash list` leer, alle Commits auf dem Branch. PR gegen `staging` erst nach Freigabe (Regel 1).

---

## Self-Review (durchgeführt)

- **Spec-Coverage:** Surface (Task 11) · durchgehende Linie (Task 11/12) · DB-getriebene Config (Task 1) · anon Session (Task 2/6) · Positions-Katalog + Anwendbarkeit (Task 4) · Vision first-class + Degradation (Task 7) · Carry-over (Task 10) · Spannen-Renderer (Task 8) · TTL-Cron (Task 13) · Test-Plan (Task 4/14). **Bewusste Abweichungen ggü. Spec:** (a) `ClaimSummary.AnspruchTab`-Revival entfällt — existiert in staging nicht → Renderer greenfield; (b) `convertLeadToClaim` wird NICHT angefasst (Security-Hot-File) → Estimate→`gutachten.ki_kalkulation` ist **Follow-up**, MVP hält Estimate auf der Lead-gebundenen Session; (c) Handoff via Server-Actions statt `/api/anspruch/schaetzung`-Route (idiomatischer, Finder nutzt Actions); (d) Reparaturdauer in `anspruch_config` je Schweregrad statt in der Segment-Tabelle (fachlich korrekter).
- **Placeholder-Scan:** keine TBD/TODO; alle Code-Steps mit vollständigem Code.
- **Typ-Konsistenz:** `berechneAnspruchsSpanne`-Signatur identisch in Task 4/7; `AnspruchSpanne`/`AnspruchPosition`/`VisionResult` durchgängig aus `types.ts`; `schaetzungSessionId` (camelCase UI/Action) ↔ `schaetzung_session_id` (snake_case DB/gfa) konsistent getrennt.

## Offene Punkte für den Executor
- Import-Pfad + Prop-API von `@/components/primitives/Button` gegen Bestand verifizieren (FinderWizard-Imports spiegeln).
- Token-Namen (`text-claimondo-slate`, `border-claimondo-border`, `bg-claimondo-bg`, `text-danger-strong`, `text-success-strong`) gegen `src/lib/design-tokens.ts`/`globals.css` prüfen, ggf. anpassen.
- `fall_dokumente`-Insert-Spalten (Task 10) gegen `database.types.ts` verifizieren (Pflichtspalten wie `mime_type`/`groesse_bytes` ggf. nullable?).
- Cron in VPS-Crontab eintragen (Aaron) — analog `slot-ttl-cleanup`.
