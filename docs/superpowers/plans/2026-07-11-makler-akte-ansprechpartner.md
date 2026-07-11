# Makler-Akte Ansprechpartner + Detail-Feld-Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Der Makler sieht oben im Chat-Tab seiner Akte die Ansprechpartner (Kundenbetreuer + Sachverständiger + Kanzlei); zusätzlich wird die Kunden-Identität der Detail-View robust aufgelöst (Lead-Fallback).

**Architecture:** Reuse der shared `FallKontakteCard` (`rolle="makler"`). Datenauflösung in `getMaklerFallDetail` (Service-Role, consent-gated, wie schon beim Kunden). Pure Mapping-Logik in neuem `src/lib/makler/kontakte.ts` (unit-getestet), DB-Orchestrierung bleibt in `queries.ts`. UI-Komposition in `MaklerAkteDetail.tsx`; `MaklerChatTab` unberührt.

**Tech Stack:** Next.js 15 (Server Components), Supabase (RLS-Client + Service-Role), vitest, Tailwind (Claimondo-Tokens).

## Global Constraints
- **Kein Direct-Push auf main.** Branch `kitta/makler-akte-ansprechpartner`, PR gegen `staging`.
- **Keine DDL** — nur Reads; alle Spalten existieren (2026-07-11 via Supabase-MCP verifiziert).
- **Umlaute** in allen nutzersichtbaren Strings (Makler-Portal = Deutsch).
- **Design-Tokens** (`claimondo-*`, `rounded-ios-*`), keine raw Hex/Tailwind-Defaults.
- **Nested-FK** immer mit `Array.isArray(x) ? x[0] : x` normalisieren.
- **Server-Query-Modul** (`queries.ts`) ist kein `'use server'` — Helper-Exports erlaubt.
- **`MaklerChatTab.tsx` nicht anfassen** (parallele Chat-Sessions laufen).

**Verifizierte DB-Fakten:**
- `v_faelle_mit_aktuellem_termin` exponiert: `sv_id`, `kundenbetreuer_id`, `kanzlei_ansprechpartner_{name,email,telefon}` (+ alle Detail-Felder).
- `claims`: `geschaedigter_user_id`, `lead_id`. `sachverstaendige`: `profile_id`, `verifiziert`. `profiles`: `vorname, nachname, email, telefon, adresse, plz, ort, anzeigename`.
- View-Mappings: `unfalldatum←schadentag`, `unfallort←schadenort_adresse`, `unfallhergang←hergang_kunde_text`, `fahrzeug_hersteller←fahrzeug_hersteller_raw` (alle korrekt, keine toten Passthroughs).

---

## Task 1: Pure Mapping-Modul `kontakte.ts` (+ Unit-Tests)

**Files:**
- Create: `src/lib/makler/kontakte.ts`
- Test: `src/lib/makler/__tests__/kontakte.test.ts`

**Interfaces:**
- Produces:
  - `type FallKontaktPerson = { vorname: string|null; nachname: string|null; email: string|null; telefon: string|null }`
  - `type MaklerFallKontakte = { kundenbetreuer: FallKontaktPerson|null; sv: (FallKontaktPerson & { verifiziert?: boolean })|null; kanzlei: FallKontaktPerson|null }`
  - `type KundeIdentity = { id: string|null; vorname; nachname; email; telefon; adresse; plz; ort: string|null }`
  - `pickSingle<T>(x): T|null`
  - `buildKanzleiKontakt(name, email, telefon): FallKontaktPerson|null`
  - `svDisplayName(p): { vorname: string|null; nachname: string|null }`
  - `mergeKundeIdentity(profil, lead, full): KundeIdentity|null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/makler/__tests__/kontakte.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  pickSingle,
  buildKanzleiKontakt,
  svDisplayName,
  mergeKundeIdentity,
} from '../kontakte'

describe('pickSingle', () => {
  it('array -> first element', () => expect(pickSingle([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 }))
  it('object -> itself', () => expect(pickSingle({ a: 1 })).toEqual({ a: 1 }))
  it('null/undefined -> null', () => {
    expect(pickSingle(null)).toBeNull()
    expect(pickSingle(undefined)).toBeNull()
  })
  it('empty array -> null', () => expect(pickSingle([])).toBeNull())
})

describe('buildKanzleiKontakt', () => {
  it('name present -> person, name in vorname', () => {
    expect(buildKanzleiKontakt('Kanzlei Meier', 'k@m.de', '0221')).toEqual({
      vorname: 'Kanzlei Meier', nachname: null, email: 'k@m.de', telefon: '0221',
    })
  })
  it('empty/whitespace/null name -> null', () => {
    expect(buildKanzleiKontakt('', 'x', 'y')).toBeNull()
    expect(buildKanzleiKontakt('   ', null, null)).toBeNull()
    expect(buildKanzleiKontakt(null, 'x', 'y')).toBeNull()
  })
})

describe('svDisplayName', () => {
  it('anzeigename wins', () =>
    expect(svDisplayName({ anzeigename: 'Kfz Rheinufer', vorname: 'A', nachname: 'B' }))
      .toEqual({ vorname: 'Kfz Rheinufer', nachname: null }))
  it('falls back to vorname/nachname', () =>
    expect(svDisplayName({ anzeigename: null, vorname: 'Dr.', nachname: 'Klein' }))
      .toEqual({ vorname: 'Dr.', nachname: 'Klein' }))
  it('null -> nulls', () => expect(svDisplayName(null)).toEqual({ vorname: null, nachname: null }))
})

describe('mergeKundeIdentity', () => {
  const profil = { id: 'p1', vorname: 'Max', nachname: 'Muster', email: 'max@x.de', telefon: '0221', adresse: 'Weg 1', plz: '50667', ort: 'Köln' }
  const lead = { vorname: 'Lead', nachname: 'Name', telefon: '0170', email: 'lead@x.de' }

  it('full profil + vollzugriff -> full contact', () => {
    expect(mergeKundeIdentity(profil, null, true)).toEqual(profil)
  })
  it('profil ohne Name -> Lead-Name (Enrichment)', () => {
    const noName = { id: 'p1', vorname: null, nachname: null, email: null, telefon: null, adresse: null, plz: null, ort: null }
    const r = mergeKundeIdentity(noName, lead, true)
    expect(r?.vorname).toBe('Lead')
    expect(r?.nachname).toBe('Name')
    expect(r?.id).toBe('p1')
  })
  it('kein Profil + Lead -> Lead-Identitaet, id null', () => {
    const r = mergeKundeIdentity(null, lead, true)
    expect(r).toEqual({ id: null, vorname: 'Lead', nachname: 'Name', email: 'lead@x.de', telefon: '0170', adresse: null, plz: null, ort: null })
  })
  it('minimal (full=false) -> nur Name, Kontakt genullt', () => {
    const r = mergeKundeIdentity(profil, null, false)
    expect(r).toEqual({ id: 'p1', vorname: 'Max', nachname: 'Muster', email: null, telefon: null, adresse: null, plz: null, ort: null })
  })
  it('beide null -> null', () => expect(mergeKundeIdentity(null, null, true)).toBeNull())
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/makler/__tests__/kontakte.test.ts`
Expected: FAIL (`Cannot find module '../kontakte'`).

- [ ] **Step 3: Implement `kontakte.ts`**

Create `src/lib/makler/kontakte.ts`:

```ts
// Pure Mapping-Helpers fuer die Makler-Akte-Ansprechpartner (FallKontakteCard-Props)
// + robuste Kunden-Identitaet (Lead-Fallback). Ausgelagert aus queries.ts fuer
// Unit-Testbarkeit ohne Supabase-Mock.

export type FallKontaktPerson = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
}

export type MaklerFallKontakte = {
  kundenbetreuer: FallKontaktPerson | null
  sv: (FallKontaktPerson & { verifiziert?: boolean }) | null
  kanzlei: FallKontaktPerson | null
}

export type KundeIdentity = {
  id: string | null
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  adresse: string | null
  plz: string | null
  ort: string | null
}

/** Supabase Nested-Embed kann Array oder Objekt liefern (Cardinality) -> Single. */
export function pickSingle<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

/** Kanzlei-Kontakt aus den claims/View-Feldern (Name-only -> vorname). Null wenn kein Name. */
export function buildKanzleiKontakt(
  name: string | null | undefined,
  email: string | null | undefined,
  telefon: string | null | undefined,
): FallKontaktPerson | null {
  const n = (name ?? '').trim()
  if (!n) return null
  return { vorname: n, nachname: null, email: email ?? null, telefon: telefon ?? null }
}

/** SV-Anzeigename: anzeigename hat Vorrang (Firmen-SV ohne vorname/nachname). */
export function svDisplayName(
  p: { anzeigename?: string | null; vorname?: string | null; nachname?: string | null } | null,
): { vorname: string | null; nachname: string | null } {
  if (!p) return { vorname: null, nachname: null }
  const anzeige = (p.anzeigename ?? '').trim()
  if (anzeige) return { vorname: anzeige, nachname: null }
  return { vorname: p.vorname ?? null, nachname: p.nachname ?? null }
}

/**
 * Kunden-Identitaet robust: bevorzugt das geschaedigter-Profil, faellt auf den Lead
 * zurueck (Name + Kontakt), wenn geschaedigter_user_id null ist oder das Profil keinen
 * Namen traegt. `full` = vollzugriff-Consent -> Kontaktfelder; sonst nur Name
 * (Datenminimierung, wie bisher die profiles-only-Variante).
 */
export function mergeKundeIdentity(
  profil: Partial<KundeIdentity> | null,
  lead: { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null,
  full: boolean,
): KundeIdentity | null {
  if (!profil && !lead) return null
  const vorname = profil?.vorname ?? lead?.vorname ?? null
  const nachname = profil?.nachname ?? lead?.nachname ?? null
  if (!vorname && !nachname && !profil?.id) return null
  const email = profil?.email ?? lead?.email ?? null
  const telefon = profil?.telefon ?? lead?.telefon ?? null
  return {
    id: profil?.id ?? null,
    vorname,
    nachname,
    email: full ? email : null,
    telefon: full ? telefon : null,
    adresse: full ? (profil?.adresse ?? null) : null,
    plz: full ? (profil?.plz ?? null) : null,
    ort: full ? (profil?.ort ?? null) : null,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/makler/__tests__/kontakte.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/makler/kontakte.ts src/lib/makler/__tests__/kontakte.test.ts
git commit -m "feat(makler): pure kontakte-mapping (kanzlei/sv-name/kunde-lead-fallback) + tests"
```

---

## Task 2: Wire contacts + Kunde-Lead-Fallback into `getMaklerFallDetail`

**Files:**
- Modify: `src/lib/makler/queries.ts` (`FallDetail` type + `getMaklerFallDetail`)

**Interfaces:**
- Consumes: `MaklerFallKontakte`, `KundeIdentity`, `pickSingle`, `buildKanzleiKontakt`, `svDisplayName`, `mergeKundeIdentity` (Task 1).
- Produces: `FallDetail.kontakte: MaklerFallKontakte`; `FallDetailKunde` becomes alias of `KundeIdentity`.

- [ ] **Step 1: Add import + type wiring**

At the top of `queries.ts`, add to the imports:

```ts
import {
  type MaklerFallKontakte,
  type KundeIdentity,
  pickSingle,
  buildKanzleiKontakt,
  svDisplayName,
  mergeKundeIdentity,
} from './kontakte'
```

Replace the `FallDetailKunde` type definition with an alias, and add `kontakte` to `FallDetail`:

```ts
export type FallDetailKunde = KundeIdentity
```

In the `FallDetail` type, add after `kunde: FallDetailKunde | null`:

```ts
  kontakte: MaklerFallKontakte
```

- [ ] **Step 2: Extend the view select**

In `getMaklerFallDetail`, add the contact keys to the `v_faelle_mit_aktuellem_termin` select (after `gegner_versicherung, zeugen_kontakte,`):

```ts
      sv_id, kundenbetreuer_id,
      kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon,
```

- [ ] **Step 3: Extend the admin claims read + resolve contacts**

Replace the current Kunde-resolution block (the `if (detailClaimId) { const admin = ... }` block) with:

```ts
  const fallRow = fall as Record<string, unknown>
  const full = consent.consent_scope === 'vollzugriff'

  let kunde: FallDetailKunde | null = null
  let kontakte: MaklerFallKontakte = { kundenbetreuer: null, sv: null, kanzlei: null }

  if (detailClaimId) {
    const admin = createAdminClient()

    // claims traegt geschaedigter_user_id + lead_id (View exponiert geschaedigter nicht).
    const { data: claimRow } = await admin
      .from('claims')
      .select('geschaedigter_user_id, lead_id')
      .eq('id', detailClaimId)
      .maybeSingle()
    const geschaedigterId = (claimRow?.geschaedigter_user_id as string | null) ?? null
    const leadId = (claimRow?.lead_id as string | null) ?? null

    const kbId = (fallRow.kundenbetreuer_id as string | null) ?? null
    const svId = (fallRow.sv_id as string | null) ?? null

    // Parallel: Kunde-Profil, Lead (Fallback), KB-Profil, SV-Row.
    const [kProfilRes, leadRes, kbRes, svRowRes] = await Promise.all([
      geschaedigterId
        ? admin.from('profiles').select('id, vorname, nachname, email, telefon, adresse, plz, ort').eq('id', geschaedigterId).maybeSingle()
        : Promise.resolve({ data: null }),
      leadId
        ? admin.from('leads').select('vorname, nachname, telefon, email').eq('id', leadId).maybeSingle()
        : Promise.resolve({ data: null }),
      kbId
        ? admin.from('profiles').select('vorname, nachname, email, telefon').eq('id', kbId).maybeSingle()
        : Promise.resolve({ data: null }),
      svId
        ? admin.from('sachverstaendige').select('profile_id, verifiziert').eq('id', svId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    // Kunde: Profil bevorzugt, Lead-Fallback (Feld-Audit-Fix). full = vollzugriff -> Kontakt.
    kunde = mergeKundeIdentity(
      (kProfilRes.data as Partial<KundeIdentity> | null) ?? null,
      (leadRes.data as { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null) ?? null,
      full,
    )

    // KB-Kontakt.
    const kb = kbRes.data as { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null } | null
    const kundenbetreuer = kb ? { vorname: kb.vorname ?? null, nachname: kb.nachname ?? null, email: kb.email ?? null, telefon: kb.telefon ?? null } : null

    // SV-Kontakt: sachverstaendige -> profiles (+ verifiziert, anzeigename-Vorrang).
    let sv: MaklerFallKontakte['sv'] = null
    const svRow = svRowRes.data as { profile_id: string | null; verifiziert: boolean | null } | null
    if (svRow?.profile_id) {
      const { data: svProfil } = await admin
        .from('profiles')
        .select('vorname, nachname, email, telefon, anzeigename')
        .eq('id', svRow.profile_id)
        .maybeSingle()
      if (svProfil) {
        const { vorname, nachname } = svDisplayName(svProfil as { anzeigename?: string | null; vorname?: string | null; nachname?: string | null })
        sv = {
          vorname, nachname,
          email: (svProfil.email as string | null) ?? null,
          telefon: (svProfil.telefon as string | null) ?? null,
          verifiziert: Boolean(svRow.verifiziert),
        }
      }
    }

    // Kanzlei-Kontakt: direkt aus den View-Feldern (Name-only).
    const kanzlei = buildKanzleiKontakt(
      fallRow.kanzlei_ansprechpartner_name as string | null,
      fallRow.kanzlei_ansprechpartner_email as string | null,
      fallRow.kanzlei_ansprechpartner_telefon as string | null,
    )

    kontakte = { kundenbetreuer, sv, kanzlei }
  }
```

(Note: `pickSingle` is imported for parity with other nested reads; the `.maybeSingle()` reads above already return single objects, so it is not needed in this block — remove the `pickSingle` import if `npm run build` flags it as unused, or keep only the imports actually used.)

- [ ] **Step 4: Add `kontakte` to the return**

In the `return { ... }` of `getMaklerFallDetail`, add after `kunde,`:

```ts
    kontakte,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/makler/queries.ts`. (Fix any unused-import error by trimming the `kontakte` import list to what is used.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/makler/queries.ts
git commit -m "feat(makler): resolve KB/SV/Kanzlei kontakte + kunde lead-fallback in getMaklerFallDetail"
```

---

## Task 3: Render `FallKontakteCard` atop the chat tab + empty state

**Files:**
- Modify: `src/components/makler/akte-detail/MaklerAkteDetail.tsx`

**Interfaces:**
- Consumes: `FallDetail.kontakte` (Task 2); shared `FallKontakteCard` (`rolle="makler"`).

- [ ] **Step 1: Add the import**

After the existing `EmptyState` import in `MaklerAkteDetail.tsx`:

```ts
import { FallKontakteCard } from '@/components/shared/fall-kontakte'
```

- [ ] **Step 2: Render contacts above the chat**

Replace the chat panel block:

```tsx
      {tab === 'chat' ? (
        <MaklerChatTab
          fallId={fall.id}
          currentUserId={currentUserId}
          initialMessages={initialChatMessages}
        />
      ) : null}
```

with:

```tsx
      {tab === 'chat' ? (
        <div className="space-y-4">
          <MaklerKontakte kontakte={detail.kontakte} />
          <MaklerChatTab
            fallId={fall.id}
            currentUserId={currentUserId}
            initialMessages={initialChatMessages}
          />
        </div>
      ) : null}
```

- [ ] **Step 3: Add the `MaklerKontakte` component**

Add near the other local components (e.g. after `TimelinePanel`):

```tsx
// Ansprechpartner-Karte oben im Chat-Tab (shared FallKontakteCard, rolle="makler").
// Leerer Zustand: dezenter Hinweis statt Luecke.
function MaklerKontakte({ kontakte }: { kontakte: FallDetail['kontakte'] }) {
  const hasAny = !!(kontakte.kundenbetreuer || kontakte.sv || kontakte.kanzlei)
  if (!hasAny) {
    return (
      <section className="bg-white rounded-ios-md border border-claimondo-border p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo">
          Ansprechpartner
        </h3>
        <p className="text-sm text-claimondo-ondo mt-2">
          Ansprechpartner werden zugewiesen, sobald Betreuer oder Gutachter feststehen.
        </p>
      </section>
    )
  }
  return (
    <FallKontakteCard
      rolle="makler"
      kundenbetreuer={kontakte.kundenbetreuer}
      sv={kontakte.sv}
      kanzlei={kontakte.kanzlei}
    />
  )
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/makler/akte-detail/MaklerAkteDetail.tsx
git commit -m "feat(makler): Ansprechpartner-Karte oben im Chat-Tab der Akte"
```

---

## Task 4: Field-audit sign-off + full build + ratchets

**Files:** none (verification), unless the audit surfaces an additional fix.

- [ ] **Step 1: Re-confirm the field audit**

Walk `OverviewPanel` in `MaklerAkteDetail.tsx` against the verified view mappings (Global Constraints). Confirm:
- Kunde-Card (Name/Email/Telefon/Anschrift) now benefits from the Lead-Fallback (Task 2).
- Fall/Fahrzeug/Gegenseite/Gutachten fields map 1:1 to populated view columns (no dead passthrough).
Document the result in the commit body / final report. (No further code change expected; "Ort = schadenort_adresse" is intentionally kept.)

- [ ] **Step 2: Full build (routes/server query changed)**

Run: `npm run build`
Expected: green.

- [ ] **Step 3: Drift-ratchets**

Run: `npm run check:token-audit && npm run check:component-set && npm run check:knip`
Expected: 0 new violations (feature reuses shared card + tokens; new file is imported).

- [ ] **Step 4: Full test run**

Run: `npx vitest run src/lib/makler`
Expected: PASS (new + existing makler tests).

- [ ] **Step 5: Commit any audit note / fixes**

```bash
git add -A
git commit -m "chore(makler): field-audit sign-off (kunde lead-fallback verified; view mappings 1:1)"
```

---

## Self-Review
- **Spec coverage:** Feature (Task 1–3) + audit fix (Task 2 lead-fallback) + audit sign-off (Task 4). ✓
- **Placeholders:** none — all code shown. ✓
- **Type consistency:** `MaklerFallKontakte`/`KundeIdentity`/helper signatures identical across Task 1→2→3. `FallDetail.kontakte` produced in Task 2, consumed in Task 3. ✓
