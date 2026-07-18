# Werkstatt-Finder für Gutachter (Empfehlungs-Delta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Gutachter empfiehlt (nach Gutachten-Upload) 1–3 Partner-Werkstätten; der Kunde wählt eine per WhatsApp/Email-Magic-Link selbst aus; die bestehende Zuweisungs-/Auftragskette feuert erst nach der Kundenwahl.

**Architecture:** Reiner Aufbau auf dem bestehenden Werkstatt-Stack (origin/main, „Spec B" 14.07.). NEU sind nur: 2 additive service-role-only-Tabellen (Empfehlungs-Batch + Kandidaten), eine SV-Empfehlen-Action + Card (Mehrfachauswahl statt Direkt-Assign), eine Kunde-Magic-Link-Route (adaptierter `WerkstattFinder`), eine Confirm-Action (ruft das bestehende `assignReparaturWerkstatt`), und ein Benachrichtigungs-Trigger. Matching, Zuweisung, Werkstatt-Portal, Gutachten-PDF, Provision = unverändert wiederverwendet.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Supabase (Postgres + RLS + service-role), vitest, Playwright (Prod-Smoke), Tailwind v4 + `@/components/primitives`/`shared`.

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/werkstatt-finder-fuer-gutachter` (bereits Worktree), PR gegen `staging`/`main`, nie Direct-Push auf `main`.
- **Regel 2 (DDL):** Schema NUR über `mcp__plugin_supabase_supabase__apply_migration`. Danach `list_migrations` → getrackte Version `<V>` ablesen → File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == `<V>`). `execute_sql` nur READ. Types regenerieren via CLI `SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public` → `src/lib/supabase/database.types.ts` **mitcommitten** + `npm run check:query-drift -- --update-baseline` falls Baseline schrumpft.
- **Regel 4:** Nach Prod-Deploy vollständiger Playwright-Smoke gegen `https://app.claimondo.de` mit Test-Konten (`telefon=NULL` → keine echten Sends). Aufgabe bleibt offen bis grüner Prod-Smoke.
- **prod project_id:** `paizkjajbuxxksdoycev` (echtes Prod — nie Preview-Ref).
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (nicht `throw`). Non-critical Sends (WA/Email/Mitteilung) in lokalem `try/catch`. Jede mutierende Action `revalidatePath` der betroffenen Route.
- **Provision:** ausschließlich über bestehende `assignReparaturWerkstatt`-Kette (inbound Haftpflicht, Trigger). Keine eigene Provisions-Logik.
- **Datensparsamkeit:** `gutachten_sv_honorar_*` + interne Notizen NIE an Kunde/Werkstatt.
- **Neue Tabellen:** `revoke all … from anon, authenticated` (service-role-only, Muster `whatsapp_inbound_messages`) + fail-closed Verify. Kein anon-Grant (Wurzel-Regel).
- **UI-Texte:** Deutsch mit echten Umlauten (ä/ö/ü/ß). Komponenten aus `@/components/primitives`/`shared` (kein handgerolltes Button/Card-Markup). Farben nur Claimondo-Tokens (kein raw hex / raw Tailwind-Status-Scales).
- **Ungetypter Admin-Client:** `createAdminClient()` ist ungetypt → select/insert-Strings gegen die Live-DB verifizieren (READ), ein falscher Spaltenname ist ein stiller PostgREST-400.

---

## Task 0: Migration — Empfehlungs-Tabellen (service-role-only)

**Files:**
- Create: `supabase/migrations/<V>_werkstatt_empfehlungen.sql` (Name nach `list_migrations`)
- Modify: `src/lib/supabase/database.types.ts` (Regen)

**Interfaces:**
- Produces: Tabellen `werkstatt_empfehlung_batches` (`id, claim_id, fall_id, empfohlen_von, token unique, status, gewaehlte_werkstatt_id, expires_at, entschieden_am, created_at, updated_at`) + `werkstatt_empfehlungen` (`id, batch_id, werkstatt_id, rang, distanz_km, match_snapshot, created_at`). Zugriff nur via service-role.

- [ ] **Step 1: DDL via apply_migration anwenden**

`mcp__plugin_supabase_supabase__apply_migration({ name: "werkstatt_empfehlungen", query: <DDL> })` mit:

```sql
create table public.werkstatt_empfehlung_batches (
  id                     uuid primary key default gen_random_uuid(),
  claim_id               uuid not null references public.claims(id) on delete cascade,
  fall_id                uuid references public.faelle(id) on delete set null,
  empfohlen_von          uuid not null,
  token                  text not null unique,
  status                 text not null default 'offen'
                         check (status in ('offen','entschieden','zurueckgezogen','abgelaufen')),
  gewaehlte_werkstatt_id uuid references public.werkstaetten(id),
  expires_at             timestamptz not null,
  entschieden_am         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index werkstatt_empfehlung_batches_claim_idx on public.werkstatt_empfehlung_batches (claim_id);

create table public.werkstatt_empfehlungen (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.werkstatt_empfehlung_batches(id) on delete cascade,
  werkstatt_id   uuid not null references public.werkstaetten(id),
  rang           smallint not null default 1,
  distanz_km     numeric,
  match_snapshot jsonb,
  created_at     timestamptz not null default now()
);
create index werkstatt_empfehlungen_batch_idx on public.werkstatt_empfehlungen (batch_id);

-- Service-role-only: kein direkter anon/authenticated-Zugriff (Wurzel-Regel anon-Grants).
revoke all on public.werkstatt_empfehlung_batches from anon, authenticated;
revoke all on public.werkstatt_empfehlungen from anon, authenticated;
alter table public.werkstatt_empfehlung_batches enable row level security;
alter table public.werkstatt_empfehlungen enable row level security;
comment on table public.werkstatt_empfehlung_batches is 'SV-Werkstatt-Empfehlung (1-3, Magic-Link). Service-Role-only, Zugriff nur via Server-Actions.';
comment on table public.werkstatt_empfehlungen is 'Kandidaten eines Empfehlungs-Batches + Match-Snapshot. Service-Role-only.';
```

- [ ] **Step 2: getrackte Version ablesen + File committen**

`mcp__plugin_supabase_supabase__list_migrations` → jüngste Version `<V>` ablesen. Dann das DDL wortgleich in `supabase/migrations/<V>_werkstatt_empfehlungen.sql` schreiben.

- [ ] **Step 3: Verify (READ) — fail-closed anon/authenticated**

`mcp__plugin_supabase_supabase__execute_sql` (prod):
```sql
select has_table_privilege('anon','public.werkstatt_empfehlung_batches','select') as anon_b,
       has_table_privilege('authenticated','public.werkstatt_empfehlungen','select') as auth_e;
```
Expected: beide `false`.

- [ ] **Step 4: Types regenerieren + committen**

Run: `SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts`
Expected: Diff enthält `werkstatt_empfehlung_batches` + `werkstatt_empfehlungen`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ src/lib/supabase/database.types.ts
git commit -m "feat(werkstatt-finder-sv): migration werkstatt_empfehlungen (service-role-only)"
```

---

## Task 1: Pure Helper — buildEmpfehlungRows (Snapshot-Mapping)

**Files:**
- Create: `src/lib/werkstatt/empfehlung/build-rows.ts`
- Test: `src/lib/werkstatt/empfehlung/__tests__/build-rows.test.ts`

**Interfaces:**
- Consumes: `WerkstattVorschlag` aus `@/lib/werkstatt/matching/rank-vorschlaege`.
- Produces: `buildEmpfehlungRows(vorschlaege: WerkstattVorschlag[], selectedIds: string[]): EmpfehlungRow[]` mit `EmpfehlungRow = { werkstatt_id: string; rang: number; distanz_km: number | null; match_snapshot: { gruende: {typ:string;text:string}[] } }`. Rang = Reihenfolge in `selectedIds`; nur IDs, die in `vorschlaege` vorkommen; max 3.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildEmpfehlungRows } from '../build-rows'

const v = (id: string, dist: number) => ({
  id, name: id, adresse_strasse: null, adresse_plz: null, adresse_ort: null, telefon: null,
  lat: 1, lng: 1, status: 'aktiv', faehigkeiten: null, verifiziert: true, marken: null,
  ist_freie_werkstatt: null, fahrzeug_gruppen: null, distanz_km: dist, markenMatch: 'unbekannt',
  gewerkeFit: 'unbekannt', gruppenFit: 'unbekannt', passt: false,
  gruende: [{ typ: 'distanz', text: `${dist} km` }],
}) as unknown as import('@/lib/werkstatt/matching/rank-vorschlaege').WerkstattVorschlag

describe('buildEmpfehlungRows', () => {
  it('mapt selektierte Vorschlaege auf Rows mit Rang = Auswahlreihenfolge', () => {
    const rows = buildEmpfehlungRows([v('a', 3), v('b', 5), v('c', 9)], ['c', 'a'])
    expect(rows).toEqual([
      { werkstatt_id: 'c', rang: 1, distanz_km: 9, match_snapshot: { gruende: [{ typ: 'distanz', text: '9 km' }] } },
      { werkstatt_id: 'a', rang: 2, distanz_km: 3, match_snapshot: { gruende: [{ typ: 'distanz', text: '3 km' }] } },
    ])
  })
  it('ignoriert unbekannte IDs, cappt bei 3, Infinity -> null', () => {
    const inf = v('x', Infinity)
    const rows = buildEmpfehlungRows([inf, v('a', 1), v('b', 2), v('c', 3), v('d', 4)], ['x', 'a', 'b', 'c', 'zzz'])
    expect(rows.map((r) => r.werkstatt_id)).toEqual(['x', 'a', 'b'])
    expect(rows[0].distanz_km).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/werkstatt/empfehlung/__tests__/build-rows.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

export type EmpfehlungRow = {
  werkstatt_id: string
  rang: number
  distanz_km: number | null
  match_snapshot: { gruende: { typ: string; text: string }[] }
}

/** Mapt die vom SV gewaehlten Vorschlaege (max 3) auf persistierbare Rows.
 *  Rang = Position in selectedIds. Nur IDs, die in vorschlaege existieren. */
export function buildEmpfehlungRows(
  vorschlaege: WerkstattVorschlag[],
  selectedIds: string[],
): EmpfehlungRow[] {
  const byId = new Map(vorschlaege.map((v) => [v.id, v]))
  const rows: EmpfehlungRow[] = []
  for (const id of selectedIds) {
    const v = byId.get(id)
    if (!v) continue
    rows.push({
      werkstatt_id: v.id,
      rang: rows.length + 1,
      distanz_km: Number.isFinite(v.distanz_km) ? v.distanz_km : null,
      match_snapshot: { gruende: v.gruende.map((g) => ({ typ: g.typ, text: g.text })) },
    })
    if (rows.length >= 3) break
  }
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes** — same command → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/werkstatt/empfehlung && git commit -m "feat(werkstatt-finder-sv): buildEmpfehlungRows snapshot-mapper + test"`

---

## Task 2: SV-Empfehlen-Action + Benachrichtigungs-Trigger

**Files:**
- Create: `src/app/gutachter/fall/[id]/_actions/werkstatt-empfehlung.ts`
- Modify: `src/lib/communications/registry.ts` (neuer Trigger `werkstatt_empfehlung`), `src/lib/notifications/templates/whatsapp.ts` (WA-Text), Email-Template (react-email) analog bestehender Kunde-Templates.

**Interfaces:**
- Consumes: `getGutachterForUser`, `resolveClaimId`, `findWerkstattVorschlaegeFuer`, `buildEmpfehlungRows`, `sendFallCommunication`.
- Produces: `empfehleWerkstaettenAlsGutachter(input: { fallId: string; werkstattIds: string[] }): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Registry-Shape lesen** — Read `src/lib/communications/registry.ts` + einen bestehenden `recipient: 'kunde'`-Trigger, um Feld-Shape (recipient, Kanäle WA/Email, Template-Keys) zu matchen. Notiere die exakte Struktur.

- [ ] **Step 2: Trigger + Templates hinzufügen**

In `COMMUNICATION_REGISTRY` einen Eintrag `werkstatt_empfehlung` (recipient `'kunde'`, Kanäle WhatsApp **und** Email) nach dem Muster eines bestehenden Kunde-Triggers. WA-Text (Umlaute!), Platzhalter `{{1}}` = Vorname, `{{link}}`:
```
Hallo {{1}}, Ihr Kfz-Gutachter hat passende Partner-Werkstätten für Ihre Reparatur ausgewählt. Wählen Sie hier Ihre Werkstatt: {{link}}
```
Email-Template (react-email) analog `src/lib/email` bestehender Kunde-Mails, Betreff „Ihre Werkstatt-Auswahl", CTA-Button → `{{link}}`. Umlaute Pflicht.

- [ ] **Step 3: Action implementieren**

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { findWerkstattVorschlaegeFuer } from '@/lib/werkstatt/matching/lade-vorschlaege'
import { buildEmpfehlungRows } from '@/lib/werkstatt/empfehlung/build-rows'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { revalidatePath } from 'next/cache'

const EMPFEHLUNG_TTL_MS = 14 * 24 * 3600e3 // 14 Tage

export async function empfehleWerkstaettenAlsGutachter(
  input: { fallId: string; werkstattIds: string[] },
): Promise<{ ok: boolean; error?: string }> {
  if (input.werkstattIds.length < 1 || input.werkstattIds.length > 3)
    return { ok: false, error: 'Bitte 1 bis 3 Werkstätten auswählen.' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein Sachverständigen-Profil gefunden' }

  const claimId = await resolveClaimId(supabase, input.fallId)
  const { data: claim } = claimId
    ? await supabase.from('claims').select('id').eq('id', claimId).eq('sv_id', (sv as { id: string }).id).maybeSingle()
    : { data: null }
  if (!claim || !claimId) return { ok: false, error: 'Fall nicht gefunden oder kein Zugriff.' }

  // Server-autoritativer Snapshot: Finder erneut fahren, nur die selektierten IDs mappen.
  const vorschlaege = await findWerkstattVorschlaegeFuer({ target: 'claim', id: claimId, nurEchte: true }, 20)
  const rows = buildEmpfehlungRows(vorschlaege, input.werkstattIds)
  if (rows.length === 0) return { ok: false, error: 'Keine gültige Werkstatt in der Auswahl.' }

  const admin = createAdminClient()
  const token = `wemp-${crypto.randomUUID()}`
  const { data: batch, error: bErr } = await admin
    .from('werkstatt_empfehlung_batches')
    .insert({
      claim_id: claimId, fall_id: input.fallId, empfohlen_von: user.id, token,
      expires_at: new Date(Date.now() + EMPFEHLUNG_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (bErr || !batch) return { ok: false, error: bErr?.message ?? 'Empfehlung konnte nicht angelegt werden.' }

  const { error: rErr } = await admin
    .from('werkstatt_empfehlungen')
    .insert(rows.map((r) => ({ ...r, batch_id: (batch as { id: string }).id })))
  if (rErr) return { ok: false, error: rErr.message }

  // Non-critical: WhatsApp + Email an den Kunden mit dem Magic-Link.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
    await sendFallCommunication(input.fallId, 'werkstatt_empfehlung', { link: `${appUrl}/werkstatt-empfehlung/${token}` })
  } catch (err) { console.error('[werkstatt-empfehlung] notify:', err) }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  return { ok: true }
}
```

- [ ] **Step 4: Verify select-Strings gegen prod (READ)** — `execute_sql`: `select column_name from information_schema.columns where table_name='werkstatt_empfehlung_batches'` → bestätige `token, expires_at, claim_id, fall_id, empfohlen_von`.
- [ ] **Step 5: Build green** — `npx tsc --noEmit` (Server-Action → auch `npm run build`). Expected: 0 Fehler.
- [ ] **Step 6: Commit** — `git commit -m "feat(werkstatt-finder-sv): empfehle-Action + WA/Email-Trigger werkstatt_empfehlung"`

---

## Task 3: SV-Card auf Mehrfachauswahl umstellen (rename WerkstattVermittelnCard → WerkstattEmpfehlenCard)

**Files:**
- Rename+Modify: `src/app/gutachter/fall/[id]/_components/WerkstattVermittelnCard.tsx` → `WerkstattEmpfehlenCard.tsx` (`git mv`)
- Modify: `src/app/gutachter/fall/[id]/page.tsx` (Import + Render-Tag tauschen)
- Check/Cleanup: `vermittleWerkstattAlsGutachter` in `actions.ts` — nach dem Umbau ungenutzt? (grep) → falls ja, entfernen (Dead-Code-Gate).

**Interfaces:**
- Consumes: `WerkstattFinder` (Reuse), `empfehleWerkstaettenAlsGutachter`.
- Produces: `<WerkstattEmpfehlenCard fallId werkstaetten />` — Mehrfach-Auswahl-State (max 3), „Empfehlung senden".

- [ ] **Step 1: `git mv` + Card auf Multi-Select umbauen**

`git mv src/app/gutachter/fall/[id]/_components/WerkstattVermittelnCard.tsx src/app/gutachter/fall/[id]/_components/WerkstattEmpfehlenCard.tsx`, dann Inhalt:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { empfehleWerkstaettenAlsGutachter } from '../_actions/werkstatt-empfehlung'

type Props = { fallId: string; werkstaetten: WerkstattFinderRow[] }

export function WerkstattEmpfehlenCard({ fallId, werkstaetten }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]))
  }
  function senden() {
    startTransition(async () => {
      const res = await empfehleWerkstaettenAlsGutachter({ fallId, werkstattIds: selected })
      if (!res.ok) { toast.error(res.error ?? 'Empfehlung fehlgeschlagen'); return }
      toast.success('Empfehlung gesendet — der Kunde wählt jetzt selbst per WhatsApp/E-Mail.')
      setSelected([])
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-claimondo-navy">Werkstatt für den Kunden empfehlen</p>
        <p className="text-xs text-claimondo-ondo mt-1">
          Wählen Sie bis zu 3 passende Partner-Werkstätten aus. Der Kunde erhält sie per WhatsApp und E-Mail
          und wählt selbst eine aus.
        </p>
      </div>
      {/* WerkstattFinder.onSelect = Toggle; selectedId zeigt die zuletzt getippte Karte an. */}
      <WerkstattFinder
        werkstaetten={werkstaetten}
        onSelect={toggle}
        selectedId={selected[selected.length - 1] ?? null}
        loading={false}
      />
      <Button variant="navy" size="sm" onClick={senden} loading={pending} disabled={selected.length === 0}>
        {selected.length > 0 ? `${selected.length} Werkstatt${selected.length > 1 ? 'en' : ''} empfehlen` : 'Werkstatt auswählen'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: page.tsx umstellen** — Import `WerkstattVermittelnCard` → `WerkstattEmpfehlenCard`; im Render `{werkstattVermittlung && (<WerkstattEmpfehlenCard fallId={werkstattVermittlung.fallId} werkstaetten={werkstattVermittlung.werkstaetten} />)}`.

- [ ] **Step 3: Dead-Code prüfen** — Run: `grep -rn "vermittleWerkstattAlsGutachter\|WerkstattVermittelnCard" src/`. Falls `vermittleWerkstattAlsGutachter` keine Consumer mehr hat → aus `actions.ts` entfernen; sonst belassen (Grund im Commit). Erwartung dokumentieren.

- [ ] **Step 4: Build green** — `npm run build` (Route-Change → voller Build). Expected: 0 Fehler.

- [ ] **Step 5: Commit** — `git commit -m "feat(werkstatt-finder-sv): SV-Card Mehrfach-Empfehlung (rename WerkstattEmpfehlenCard)"`

---

## Task 4: Kunde-Route Loader + Confirm-Action

**Files:**
- Create: `src/app/werkstatt-empfehlung/[token]/actions.ts`

**Interfaces:**
- Produces:
  - `getWerkstattEmpfehlungByToken(token): Promise<{ ok: true; data: EmpfehlungView } | { ok: false; error: string }>` mit `EmpfehlungView = { status: string; werkstaetten: (WerkstattFinderRow & { gruende?: MatchGrund[] })[]; gutachter: { name: string; firma: string | null; avatarUrl: string | null; ratingDurchschnitt: number | null; ratingAnzahl: number | null }; gutachten: { schadenshoeheBrutto: number | null; reparaturkosten_brutto: number | null } }`.
  - `waehleWerkstattAusEmpfehlung(token: string, werkstattId: string): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Loader implementieren (service-role, Token-validiert)**

```ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankWerkstaetten, type WerkstattFinderRow } from '@/lib/werkstatt/finder'

export async function getWerkstattEmpfehlungByToken(token: string) {
  const admin = createAdminClient()
  const { data: batch } = await admin
    .from('werkstatt_empfehlung_batches')
    .select('id, claim_id, status, expires_at, empfohlen_von, gewaehlte_werkstatt_id')
    .eq('token', token)
    .maybeSingle()
  if (!batch) return { ok: false as const, error: 'Dieser Link ist ungültig.' }
  const b = batch as { id: string; claim_id: string; status: string; expires_at: string; empfohlen_von: string; gewaehlte_werkstatt_id: string | null }
  if (new Date(b.expires_at).getTime() < Date.now()) return { ok: false as const, error: 'Dieser Link ist abgelaufen.' }

  const { data: rows } = await admin
    .from('werkstatt_empfehlungen')
    .select('werkstatt_id, rang, distanz_km, match_snapshot')
    .eq('batch_id', b.id)
    .order('rang')
  const wIds = (rows ?? []).map((r) => (r as { werkstatt_id: string }).werkstatt_id)

  // Werkstatt-Stammdaten (nur Anzeige-Felder — kein email/user_id an den Client).
  const { data: wRows } = await admin
    .from('werkstaetten')
    .select('id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert')
    .in('id', wIds.length ? wIds : ['00000000-0000-0000-0000-000000000000'])
  const werkstaetten = (rows ?? []).map((r) => {
    const rr = r as { werkstatt_id: string; distanz_km: number | null; match_snapshot: { gruende?: { typ: string; text: string }[] } | null }
    const w = (wRows ?? []).find((x) => (x as { id: string }).id === rr.werkstatt_id) as unknown as Omit<WerkstattFinderRow,'distanz_km'|'passt'> | undefined
    return w ? { ...w, verifiziert: w.verifiziert ?? false, distanz_km: rr.distanz_km ?? Infinity, passt: true, gruende: rr.match_snapshot?.gruende ?? [] } : null
  }).filter(Boolean) as (WerkstattFinderRow & { gruende: { typ: string; text: string }[] })[]

  // Gutachter-Profil (Name/Firma/Avatar/Google) via claim.sv_id -> sachverstaendige + profiles + google_bewertungen_cache.
  const { data: claim } = await admin.from('claims').select('sv_id').eq('id', b.claim_id).maybeSingle()
  let gutachter = { name: 'Ihr Gutachter', firma: null as string | null, avatarUrl: null as string | null, ratingDurchschnitt: null as number | null, ratingAnzahl: null as number | null }
  const svId = (claim as { sv_id: string | null } | null)?.sv_id ?? null
  if (svId) {
    const { data: sv } = await admin.from('sachverstaendige').select('firmenname, profile_id').eq('id', svId).maybeSingle()
    const svRow = sv as { firmenname: string | null; profile_id: string | null } | null
    if (svRow?.profile_id) {
      const { data: p } = await admin.from('profiles').select('vorname, nachname, avatar_url').eq('id', svRow.profile_id).maybeSingle()
      const pr = p as { vorname: string | null; nachname: string | null; avatar_url: string | null } | null
      const { data: g } = await admin.from('google_bewertungen_cache').select('durchschnitt, anzahl_bewertungen').eq('profile_id', svRow.profile_id).maybeSingle()
      const gr = g as { durchschnitt: number | null; anzahl_bewertungen: number | null } | null
      gutachter = {
        name: [pr?.vorname, pr?.nachname].filter(Boolean).join(' ') || 'Ihr Gutachter',
        firma: svRow.firmenname, avatarUrl: pr?.avatar_url ?? null,
        ratingDurchschnitt: gr?.durchschnitt != null ? Number(gr.durchschnitt) : null,
        ratingAnzahl: gr?.anzahl_bewertungen ?? null,
      }
    }
  }

  // Gutachten-Kurzfassung (kuratiert — KEIN sv_honorar) via v_gutachten_werte.
  const { data: gw } = await admin.from('v_gutachten_werte')
    .select('reparaturkosten_brutto').eq('claim_id', b.claim_id).maybeSingle()
  const gwR = gw as { reparaturkosten_brutto: number | null } | null

  return { ok: true as const, data: {
    status: b.status,
    werkstaetten,
    gutachter,
    gutachten: { schadenshoeheBrutto: gwR?.reparaturkosten_brutto != null ? Number(gwR.reparaturkosten_brutto) : null, reparaturkosten_brutto: gwR?.reparaturkosten_brutto != null ? Number(gwR.reparaturkosten_brutto) : null },
  } }
}
```
(`rankWerkstaetten`-Import ggf. entfernen falls ungenutzt — hier nur Projektion. tsc weist es aus.)

- [ ] **Step 2: Verify select-Strings gegen prod (READ)** — `execute_sql`: prüfe `sachverstaendige.firmenname`, `profiles.avatar_url`, `google_bewertungen_cache.durchschnitt/anzahl_bewertungen`, `v_gutachten_werte.reparaturkosten_brutto`. Falsche Namen → korrigieren (ungetypter Admin-Client).

- [ ] **Step 3: Confirm-Action implementieren**

```ts
import { assignReparaturWerkstatt } from '@/lib/werkstatt/vermittlung-server'
import { revalidatePath } from 'next/cache'

export async function waehleWerkstattAusEmpfehlung(
  token: string, werkstattId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: batch } = await admin
    .from('werkstatt_empfehlung_batches')
    .select('id, claim_id, status, expires_at')
    .eq('token', token).maybeSingle()
  const b = batch as { id: string; claim_id: string; status: string; expires_at: string } | null
  if (!b) return { ok: false, error: 'Ungültiger Link.' }
  if (b.status === 'entschieden') return { ok: true } // idempotent: bereits gewählt
  if (b.status !== 'offen' || new Date(b.expires_at).getTime() < Date.now())
    return { ok: false, error: 'Diese Empfehlung ist nicht mehr aktiv.' }

  // werkstattId muss zum Batch gehören.
  const { data: cand } = await admin
    .from('werkstatt_empfehlungen').select('id').eq('batch_id', b.id).eq('werkstatt_id', werkstattId).maybeSingle()
  if (!cand) return { ok: false, error: 'Diese Werkstatt gehört nicht zur Empfehlung.' }

  // Batch schließen (bevor Assign: verhindert Doppel-Assign bei Reload).
  const { error: uErr } = await admin
    .from('werkstatt_empfehlung_batches')
    .update({ status: 'entschieden', gewaehlte_werkstatt_id: werkstattId, entschieden_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', b.id).eq('status', 'offen')
  if (uErr) return { ok: false, error: uErr.message }

  // BESTAND: setzt reparatur_werkstatt_*, benachrichtigt Kunde + Werkstatt, Provisions-Trigger.
  const res = await assignReparaturWerkstatt({ target: 'claim', id: b.claim_id, werkstattId, quelle: 'gutachter', actorUserId: null })
  if (!res.ok) return res
  revalidatePath(`/werkstatt-empfehlung/${token}`)
  return { ok: true }
}
```

- [ ] **Step 4: Build green** — `npm run build`. Expected: 0 Fehler.
- [ ] **Step 5: Commit** — `git commit -m "feat(werkstatt-finder-sv): Kunde-Route Loader + Confirm (feuert assignReparaturWerkstatt)"`

---

## Task 5: Kunde-Route Page + Client (adaptierter Finder)

**Files:**
- Create: `src/app/werkstatt-empfehlung/[token]/page.tsx`, `src/app/werkstatt-empfehlung/[token]/WerkstattEmpfehlungClient.tsx`

**Interfaces:**
- Consumes: `getWerkstattEmpfehlungByToken`, `waehleWerkstattAusEmpfehlung`, `WerkstattFinder`, `GoogleBewertungBadge`.

- [ ] **Step 1: page.tsx (Mirror `/kunde-termin/[token]`)**

```tsx
import { getWerkstattEmpfehlungByToken } from './actions'
import { WerkstattEmpfehlungClient } from './WerkstattEmpfehlungClient'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const res = await getWerkstattEmpfehlungByToken(token)
  if (!res.ok) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-ios-lg p-8 text-center shadow-claimondo-lg shadow-black/10">
          <h1 className="text-xl font-semibold text-claimondo-navy mb-2">Link nicht mehr gültig</h1>
          <p className="text-sm text-claimondo-ondo">{res.error}</p>
        </div>
      </div>
    )
  }
  return <WerkstattEmpfehlungClient token={token} data={res.data} />
}
```

- [ ] **Step 2: Client — Gutachter-Header + Gutachten-Kurzfassung + `WerkstattFinder`**

Client-Komponente rendert:
- Kopf: „Ihr Gutachter {firma||name} empfiehlt" + Avatar + `GoogleBewertungBadge` (falls Rating) — Reuse `@/components/shared/GoogleBewertungBadge`.
- Gutachten-Kurzfassung: Schadenshöhe (`Intl.NumberFormat('de-DE', {style:'currency',currency:'EUR'})`), falls vorhanden.
- `WerkstattFinder` mit `data.werkstaetten`; `onSelect={(id) => waehlen(id)}` → ruft `waehleWerkstattAusEmpfehlung(token, id)`; bei `ok` Erfolgs-Screen: „Vielen Dank — Ihre Werkstatt ist gewählt. Melden Sie sich in Ihrem Portal an, um alles zu verfolgen." + Login-Link `/login`.
- Wenn `data.status === 'entschieden'`: direkt den Erfolgs-Screen zeigen (schon gewählt).
- Optional „weitere Werkstätten anzeigen": Button (P-later; in v1 nur die 1–3). Umlaute Pflicht, Farben = Claimondo-Tokens, Button/Card aus `primitives`.

- [ ] **Step 3: Build green** — `npm run build`. Expected: 0 Fehler + Route `/werkstatt-empfehlung/[token]` im Build-Output.
- [ ] **Step 4: Commit** — `git commit -m "feat(werkstatt-finder-sv): Kunde-Magic-Link-Route (adaptierter WerkstattFinder + Gutachter-Profil)"`

---

## Task 6: Verifikation Portal/Werkstatt (Reqs 5/6/8) — prüfen, nur Lücken schließen

**Files (read):** `src/components/werkstatt/WerkstattAuftragDetail.tsx`, `src/app/werkstatt/(shell)/auftraege/[claimId]/page.tsx`, `src/app/werkstatt/(shell)/auftraege/__tests__/gutachten-pdf.test.ts`, `src/lib/werkstatt/vermittlung-server.ts` (notify).

- [ ] **Step 1: Bestand prüfen** — Zeigt der Werkstatt-Auftrag Gutachten-PDF + extrahierte Werte + Gutachter (`gutachter_firmenname`)? Wird die Werkstatt bei Assign per Email mit Gutachten/Link benachrichtigt (`notifyWerkstattNeuerAuftrag` — vorhanden)? Ergebnis dokumentieren.
- [ ] **Step 2: Nur falls Lücke** — z. B. Gutachten-PDF fehlt im Werkstatt-Auftrag oder das Gutachter-Profil wird der Werkstatt nicht gezeigt → minimal ergänzen (kuratierter Wert-Subset, **kein** `gutachten_sv_honorar_*`). Falls alles vorhanden: „n/a, Bestand deckt Reqs 5/6/8" im Commit/Marker.
- [ ] **Step 3: Commit (falls Änderung)** — `git commit -m "feat(werkstatt-finder-sv): Werkstatt-Briefing-Luecken geschlossen (Gutachten/Profil)"` bzw. Ergebnis im Marker.

---

## Task 7: Prod-Smoke (Regel 4) — SV → Kunde → Werkstatt

**Files:**
- Create: `scripts/smoke/werkstatt-empfehlung-seed.mjs` (Muster `scripts/smoke/werkstatt-finder-seed.mjs`: Smoke-Kunde `telefon=NULL`, Smoke-Werkstatt, Claim mit `sv_id` = Smoke-SV, auf Smoke-Werkstatt-Koordinaten)
- Create: `tests/e2e/flows/werkstatt-empfehlung-smoke.spec.ts`

- [ ] **Step 1: Seed-Script** — isolierte Testdaten: Claim mit `sv_id`=Smoke-SV + `reparaturwunsch='reparatur'` + Gutachten-Row (Bedarf) + Smoke-Werkstatt (distanz 0). Kunde `telefon=NULL` → kein echter Send. Ausgabe: claimId/fallId + Smoke-Werkstatt-ID.
- [ ] **Step 2: Spec** — (1) SV-Login → `/gutachter/fall/[fallId]` → Empfehlen-Card sichtbar → Smoke-Werkstatt antippen → „empfehlen" → DB-Verify: Batch `offen` + 1 Empfehlung. (2) Batch-Token lesen → `/werkstatt-empfehlung/[token]` (kein Login) → Smoke-Werkstatt wählen → DB-Verify: `claims.reparatur_werkstatt_id` = Smoke-Werkstatt + `quelle='gutachter'` + Batch `entschieden`. (3) Werkstatt-Login → `/werkstatt/auftraege` → Auftrag sichtbar. NUR die Smoke-Werkstatt anklicken.
- [ ] **Step 3: Nach Prod-Deploy fahren** — `CI=1 RUN_WEMP_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test werkstatt-empfehlung-smoke --project=chromium --reporter=line`. Ergebnis (grün/rot + Screenshots) im PR/Marker. Rot → Fix-PR; nicht als erledigt markieren, solange rot.
- [ ] **Step 4: Commit** — `git commit -m "test(werkstatt-finder-sv): Prod-Smoke SV-Empfehlung -> Kunde-Wahl -> Werkstatt"`

---

## Self-Review (Spec-Coverage)

- Req #1 Autorität (empfehlen 1–3): Task 2+3. #2 Kunde-Zugang WA+Email: Task 2 (Trigger) + Task 5 (Route). #3 OCR→Info: Bestand (`ermittle-bedarf`) + Task 6 verify. #4 Werkstatt-Termin: Bestand (Werkstatt-Portal). #5 Dokumente/Werte: Task 6 verify. #6 Gutachten-Email: Bestand (`notifyWerkstattNeuerAuftrag`) + Task 6 verify. #7 Werte→Suche: Bestand (`ermittle-bedarf`). #8 Gutachter-Profil: Task 5 (Kunde) + Task 6 (Werkstatt).
- Provision: unverändert über `assignReparaturWerkstatt` (Task 4). Sicherheit: Task 0 (revoke), kein Honorar-Leak (Task 5/6). Prod-Smoke: Task 7.
