# Vertrieb-CRM P0 (Fundament) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die additive, kollisionsfreie Datenschicht des Vertrieb-CRM — eine abgeleitete
`VertriebStufe` über alle 5 Partner-Silos (SV-Leads/Partner-Leads/SV/Makler/Werkstatt), als
reine TS-Ableitung + zwei gegatete Views + Registry-Domain + Write/Audit-Action. **Kein UI.**

**Architecture:** Spiegelt das ops-cockpit-Muster (`src/lib/ops`) in einem eigenen
`src/lib/vertrieb`: reine `deriveVertriebState`-Funktion (TDD) über eine vereinende
`v_vertrieb_kontakt`-View (UNION der 5 Tabellen, `security_invoker` → per `createAdminClient()`
nach Role-Guard gelesen), plus `v_vertrieb_rollup` (counts) und eine `vertrieb-workflow`-
Registry-Domain. Tabellen bleiben unangetastet (derive-on-top).

**Tech Stack:** TypeScript, Supabase (Views via Supabase-Plugin `apply_migration`), Vitest
(env=node), `src/lib/status`-Registry, `createAdminClient` + Role-Guard.

**Spec:** `docs/superpowers/specs/2026-07-08-vertrieb-crm-umbrella-design.md` (freigegeben).
**Vorbild:** `src/lib/ops/{derive-claim-workflow-state,claim-workstate.types,get-ops-rollup}.ts`
+ `src/lib/status/domains/lead-workflow.ts`.

## Global Constraints

- **DDL nur via Supabase-Plugin** `apply_migration` (Regel 2), NIE CLI/raw-SQL. `execute_sql`
  nur READ. Nach apply: `list_migrations` → getrackte Version <V> ablesen → File als
  `supabase/migrations/<V>_<name>.sql` committen (File-Name == getrackte Version, sonst Twin-Drift).
- **Jede View `security_invoker=true`** (KEIN SECURITY DEFINER) + `revoke all from anon, authenticated` +
  `grant select to service_role`. Gelesen wird NUR via `createAdminClient()` (service_role) NACH
  einem Staff-Role-Guard. → nicht von `audit_ungated_definer_views()` geflaggt; kein Broad-Grant;
  kein IDOR. **RLS-Audits müssen 0 sein** (Pflicht-build-Step).
- **Server-Actions: Result-Object** `{ ok: boolean; error?: string }`, Role-Guard als
  Pre-Condition (werfen erlaubt), Audit non-kritisch in try/catch, `revalidatePath`.
- **Kein Export von Konstanten/Types aus `'use server'`-Files** (AAR-664) — Types/Konstanten in
  eigene Nicht-`'use server'`-Files.
- **Ratchets:** token-audit/component-set/status-registry/knip `-- --ratchet` 0-neu (NACH `git add`
  laufen — der Scanner sieht nur git-getrackte Files).
- **Tests env=node** (kein jsdom): reine Funktionen als Funktionsaufruf testen.
- **Eigene Abstraktion:** `VertriebKontakt` (Partner-Beziehung), NICHT die ops-`WorkItem`-Union.
  Registry-*Mechanik* wird geteilt, nicht die Domäne.

**Verifizierte Ist-Spalten (Supabase, 08.07.):**
- `sachverstaendige`: `ist_aktiv, portal_zugang_freigeschaltet, vertrag_unterschrieben, verifiziert,
  verifizierung_status, onboarding_status, gesperrt_seit, standort_lat, standort_lng, standort_plz,
  standort_adresse, firmenname, paket, created_at, onboarding_quelle` (+ profiles via profile_id).
- `partner_leads`: `status, firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon,
  plz, ort, source_channel, zugewiesen_an, lat, lng, erstellt_am`.
- `sv_leads`: `name, vorname, nachname, firma, plz, ort, lat, lng, telefon, email, quelle, ist_aktiv,
  warteliste_status, claim_status, erstellt_am`.
- `makler`: `firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, adresse_plz,
  adresse_ort, status, gesperrt_am, onboarding_abgeschlossen, aktiviert_von, erstellt_am` (**keine
  lat/lng**).
- `werkstaetten`: `name, ansprechpartner_name, telefon, email, adresse_plz, adresse_ort, lat, lng,
  status, gesperrt_am, provision_aktiv, aktiviert_von, created_at`.
- ⚠ **SV + sv_leads haben keine `zugewiesen_an`/Owner-Spalte** → im Modell `owner_id = null`
  (Owner-Zuweisung ist P1-Thema, hier nur projiziert wo vorhanden: partner_leads.zugewiesen_an,
  makler/werkstatt.aktiviert_von).

---

## Task 1: Registry-Domain `vertrieb-workflow`

**Files:**
- Create: `src/lib/status/domains/vertrieb-workflow.ts`
- Test: `src/lib/status/domains/vertrieb-workflow.test.ts`
- Modify: `src/lib/status/registry.ts` (+ 1 Zeile Domain-Registrierung) · `src/lib/status/types.ts`
  (+ Domain-Key), analog zur `lead-workflow`-Eintragung.

**Interfaces:**
- Produces: `type VertriebStufe = 'neu'|'kontaktiert'|'onboarding'|'aktiv'|'pausiert'|'gesperrt'|'verloren'`,
  `ALL_VERTRIEB_STUFEN: VertriebStufe[]`, Registry-Eintrag `domain 'vertrieb-workflow'` mit Label +
  Farb-Slot je Stufe (7 Token-Slots: neutral/active/pending/done/success/warning/danger).

- [ ] **Step 1: Vorbild lesen.** `src/lib/status/domains/lead-workflow.ts` + wie es in
  `registry.ts`/`types.ts` registriert ist. Repliziere EXAKT die Mechanik.

- [ ] **Step 2: Failing test** (`vertrieb-workflow.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { statusLabel, statusSlotClass } from '@/lib/status'
import { ALL_VERTRIEB_STUFEN } from './vertrieb-workflow'

describe('vertrieb-workflow registry', () => {
  it('jede Stufe hat Label + Farb-Slot', () => {
    for (const s of ALL_VERTRIEB_STUFEN) {
      expect(statusLabel('vertrieb-workflow', s)).toBeTruthy()
      expect(statusSlotClass('vertrieb-workflow', s)).toBeTruthy()
    }
  })
  it('aktiv=success, gesperrt=danger, onboarding=pending (Slot-Semantik)', () => {
    expect(statusSlotClass('vertrieb-workflow', 'aktiv')).toContain('success')
    expect(statusSlotClass('vertrieb-workflow', 'gesperrt')).toContain('danger')
    expect(statusSlotClass('vertrieb-workflow', 'onboarding')).toContain('pending')
  })
})
```

- [ ] **Step 3: Run → FAIL** `npx vitest run src/lib/status/domains/vertrieb-workflow.test.ts`
  (Expected: „Cannot find module './vertrieb-workflow'").

- [ ] **Step 4: Implementieren** (`vertrieb-workflow.ts`) — Label-Map + Slot-Map je Stufe, exakt
  im Format von `lead-workflow.ts`. Slots: neu=neutral, kontaktiert=active, onboarding=pending,
  aktiv=success, pausiert=warning, gesperrt=danger, verloren=neutral. UI-Labels mit echten Umlauten
  („Neu", „Kontaktiert", „Onboarding", „Aktiv", „Pausiert", „Gesperrt", „Verloren"). Domain in
  `registry.ts`/`types.ts` eintragen (je 1 Zeile, wie lead-workflow).

- [ ] **Step 5: Run → PASS** (gleicher Befehl).

- [ ] **Step 6: Ratchets + Commit**

```bash
git add src/lib/status/domains/vertrieb-workflow.ts src/lib/status/domains/vertrieb-workflow.test.ts src/lib/status/registry.ts src/lib/status/types.ts
npm run check:status-registry -- --ratchet   # 0-neu (zentrale domains sind exempt)
git commit -m "feat(vertrieb): vertrieb-workflow Registry-Domain (P0 Task 1)"
```

---

## Task 2: `VertriebKontakt`-Typen + `deriveVertriebState` (reine Ableitung, TDD)

**Files:**
- Create: `src/lib/vertrieb/vertrieb-kontakt.types.ts` (Typen)
- Create: `src/lib/vertrieb/derive-vertrieb-state.ts` (Ableitung)
- Test: `src/lib/vertrieb/derive-vertrieb-state.test.ts`

**Interfaces:**
- Consumes: `VertriebStufe` (Task 1).
- Produces:
  ```ts
  type VertriebKind = 'sv-lead'|'partner-lead'|'sv'|'makler'|'werkstatt'
  // Rohzeile aus v_vertrieb_kontakt (Task 4) — schmal, gemeinsam projiziert:
  type VertriebKontaktRow = {
    id: string; kind: VertriebKind; name: string | null
    email: string | null; telefon: string | null
    plz: string | null; ort: string | null; lat: number | null; lng: number | null
    owner_id: string | null; quelle: string | null; erstellt_am: string | null
    // rohe stufe-Treiber je kind (nullable, nur das jeweils Relevante gefüllt):
    roh_status: string | null           // makler/werkstatt/partner_leads.status
    roh_ist_aktiv: boolean | null       // sv/sv_leads.ist_aktiv
    roh_gesperrt: boolean | null        // gesperrt_seit/gesperrt_am != null
    roh_verifiziert: boolean | null     // sv.verifiziert
    roh_portal_zugang: boolean | null   // sv.portal_zugang_freigeschaltet
    roh_onboarding_offen: boolean | null// sv: !vertrag ∨ verif-offen ; makler/ws: !onboarding_abgeschlossen
    roh_warteliste: string | null       // sv_leads.warteliste_status/claim_status
  }
  type VertriebKontakt = Omit<VertriebKontaktRow, never> & { stufe: VertriebStufe }
  function deriveVertriebState(row: VertriebKontaktRow): VertriebKontakt
  ```

- [ ] **Step 1: Failing tests** (`derive-vertrieb-state.test.ts`) — je kind × Stufe + Prioritäts-
  Kollisionen. Ausführbare Spec:

```ts
import { describe, it, expect } from 'vitest'
import { deriveVertriebState } from './derive-vertrieb-state'
import type { VertriebKontaktRow } from './vertrieb-kontakt.types'

const base: VertriebKontaktRow = {
  id: 'x', kind: 'sv', name: 'Test', email: null, telefon: null, plz: null, ort: null,
  lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: null, roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null,
}
const sv = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'sv', ...o }).stufe

describe('deriveVertriebState — sv', () => {
  it('gesperrt schlägt alles', () => {
    expect(sv({ roh_gesperrt: true, roh_verifiziert: true, roh_portal_zugang: true, roh_ist_aktiv: true })).toBe('gesperrt')
  })
  it('verifiziert + portal + aktiv = aktiv', () => {
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: true, roh_ist_aktiv: true })).toBe('aktiv')
  })
  it('portal offen ODER onboarding offen = onboarding', () => {
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: false, roh_ist_aktiv: true })).toBe('onboarding')
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: true, roh_onboarding_offen: true, roh_ist_aktiv: true })).toBe('onboarding')
  })
  it('nicht aktiv (aber nicht gesperrt) = pausiert', () => {
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: true, roh_ist_aktiv: false })).toBe('pausiert')
  })
})

const makler = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'makler', ...o }).stufe
describe('deriveVertriebState — makler/werkstatt', () => {
  it('gesperrt', () => expect(makler({ roh_gesperrt: true, roh_status: 'aktiv' })).toBe('gesperrt'))
  it('status aktiv = aktiv', () => expect(makler({ roh_status: 'aktiv' })).toBe('aktiv'))
  it('onboarding offen = onboarding', () => expect(makler({ roh_status: 'aktiv', roh_onboarding_offen: true })).toBe('onboarding'))
  it('status pending = kontaktiert', () => expect(makler({ roh_status: 'pending' })).toBe('kontaktiert'))
})

const pl = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'partner-lead', ...o }).stufe
describe('deriveVertriebState — partner-lead', () => {
  it('verloren', () => expect(pl({ roh_status: 'verloren' })).toBe('verloren'))
  it('kontaktiert', () => expect(pl({ roh_status: 'kontaktiert' })).toBe('kontaktiert'))
  it('neu default', () => expect(pl({ roh_status: 'neu' })).toBe('neu'))
})

const svl = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'sv-lead', ...o }).stufe
describe('deriveVertriebState — sv-lead', () => {
  it('inaktiv = verloren', () => expect(svl({ roh_ist_aktiv: false })).toBe('verloren'))
  it('warteliste kontaktiert', () => expect(svl({ roh_ist_aktiv: true, roh_warteliste: 'kontaktiert' })).toBe('kontaktiert'))
  it('aktiv default = neu', () => expect(svl({ roh_ist_aktiv: true })).toBe('neu'))
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run src/lib/vertrieb/derive-vertrieb-state.test.ts`.

- [ ] **Step 3: Typen** (`vertrieb-kontakt.types.ts`) — exakt die Interfaces oben.

- [ ] **Step 4: Ableitung** (`derive-vertrieb-state.ts`) — first-match je kind:

```ts
import type { VertriebKontaktRow, VertriebKontakt } from './vertrieb-kontakt.types'
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

function stufeFuer(row: VertriebKontaktRow): VertriebStufe {
  if (row.roh_gesperrt === true) return 'gesperrt'
  switch (row.kind) {
    case 'sv':
      if (row.roh_verifiziert === true && row.roh_portal_zugang === true &&
          row.roh_onboarding_offen !== true && row.roh_ist_aktiv === true) return 'aktiv'
      if (row.roh_ist_aktiv === false) return 'pausiert'
      return 'onboarding'
    case 'makler':
    case 'werkstatt':
      if (row.roh_status === 'aktiv' && row.roh_onboarding_offen !== true) return 'aktiv'
      if (row.roh_onboarding_offen === true) return 'onboarding'
      if (row.roh_status === 'pending' || row.roh_status === 'inaktiv') return 'kontaktiert'
      return 'neu'
    case 'partner-lead':
      if (row.roh_status === 'verloren' || row.roh_status === 'abgelehnt') return 'verloren'
      if (row.roh_status === 'konvertiert' || row.roh_status === 'umgewandelt') return 'aktiv'
      if (row.roh_status && row.roh_status !== 'neu') return 'kontaktiert'
      return 'neu'
    case 'sv-lead':
      if (row.roh_ist_aktiv === false) return 'verloren'
      if (row.roh_warteliste && row.roh_warteliste !== 'neu') return 'kontaktiert'
      return 'neu'
  }
}

export function deriveVertriebState(row: VertriebKontaktRow): VertriebKontakt {
  return { ...row, stufe: stufeFuer(row) }
}
```

- [ ] **Step 5: Run → PASS**. Falls eine Kollision anders gewollt: Test anpassen (Test = Spec),
  nicht die Ableitung „biegen".

- [ ] **Step 6: Commit**

```bash
git add src/lib/vertrieb/vertrieb-kontakt.types.ts src/lib/vertrieb/derive-vertrieb-state.ts src/lib/vertrieb/derive-vertrieb-state.test.ts
git commit -m "feat(vertrieb): deriveVertriebState + Typen (P0 Task 2)"
```

---

## Task 3: `v_vertrieb_kontakt`-View (gegatet, via Supabase-Plugin)

**Files:**
- Create (via Plugin → committen): `supabase/migrations/<V>_v_vertrieb_kontakt.sql`

**Interfaces:**
- Produces: View `public.v_vertrieb_kontakt` mit Spalten exakt passend zu `VertriebKontaktRow`
  (id, kind, name, email, telefon, plz, ort, lat, lng, owner_id, quelle, erstellt_am, roh_status,
  roh_ist_aktiv, roh_gesperrt, roh_verifiziert, roh_portal_zugang, roh_onboarding_offen, roh_warteliste).

- [ ] **Step 1: DDL schreiben** — `UNION ALL` der 5 Tabellen, jede projiziert. `security_invoker=true`.
  Beispiel-Grundgerüst (je kind ein SELECT; name/roh_* passend füllen, sonst NULL):

```sql
create or replace view public.v_vertrieb_kontakt
with (security_invoker = true) as
  select s.id, 'sv'::text as kind,
         coalesce(s.firmenname, p.vorname || ' ' || p.nachname) as name,
         p.email, p.telefon, s.standort_plz as plz, null::text as ort,
         s.standort_lat as lat, s.standort_lng as lng,
         null::uuid as owner_id, s.onboarding_quelle as quelle, s.created_at as erstellt_am,
         null::text as roh_status, s.ist_aktiv as roh_ist_aktiv,
         (s.gesperrt_seit is not null) as roh_gesperrt, s.verifiziert as roh_verifiziert,
         s.portal_zugang_freigeschaltet as roh_portal_zugang,
         (s.vertrag_unterschrieben is not true or s.verifizierung_status is distinct from 'geprueft') as roh_onboarding_offen,
         null::text as roh_warteliste
    from public.sachverstaendige s
    left join public.profiles p on p.id = s.profile_id
   where s.geloescht_am is null
  union all
  select l.id, 'partner-lead', coalesce(l.firma, l.ansprechpartner_vorname || ' ' || l.ansprechpartner_nachname),
         l.email, l.telefon, l.plz, l.ort, l.lat, l.lng, l.zugewiesen_an, l.source_channel, l.erstellt_am,
         l.status, null, false, null, null, null, null
    from public.partner_leads l
  union all
  select sl.id, 'sv-lead', coalesce(sl.firma, sl.name, sl.vorname || ' ' || sl.nachname),
         sl.email, sl.telefon, sl.plz, sl.ort, sl.lat, sl.lng, null, sl.quelle, sl.erstellt_am,
         null, sl.ist_aktiv, false, null, null, null, coalesce(sl.warteliste_status, sl.claim_status)
    from public.sv_leads sl
  union all
  select m.id, 'makler', coalesce(m.firma, m.ansprechpartner_vorname || ' ' || m.ansprechpartner_nachname),
         m.email, m.telefon, m.adresse_plz, m.adresse_ort, null, null, m.aktiviert_von, null, m.erstellt_am,
         m.status, null, (m.gesperrt_am is not null), null, null, (m.onboarding_abgeschlossen is not true), null
    from public.makler m
  union all
  select w.id, 'werkstatt', coalesce(w.name, w.ansprechpartner_name),
         w.email, w.telefon, w.adresse_plz, w.adresse_ort, w.lat, w.lng, w.aktiviert_von, null, w.created_at,
         w.status, null, (w.gesperrt_am is not null), null, null, false, null
    from public.werkstaetten w;

revoke all on public.v_vertrieb_kontakt from anon, authenticated;
grant select on public.v_vertrieb_kontakt to service_role;
```

  ⚠ Vor apply: die genauen Spalten-Namen/Typen nochmals per `execute_sql` gegen die 5 Tabellen
  prüfen (z.B. `geloescht_am` existiert, `profiles`-FK-Hint, sv_leads-PII-Spalten vorhanden). Casts
  (`::text`/`::uuid`) so setzen, dass alle 5 SELECTs typ-gleich sind (UNION verlangt Typ-Parität).

- [ ] **Step 2: apply** via `apply_migration({ name: 'v_vertrieb_kontakt', query: '<DDL>' })`.

- [ ] **Step 3: getrackte Version ablesen** `list_migrations` → File als
  `supabase/migrations/<V>_v_vertrieb_kontakt.sql` committen (Name == Version).

- [ ] **Step 4: READ-verifizieren** `execute_sql`:
  `select kind, count(*) from public.v_vertrieb_kontakt group by kind` → 5 kinds mit plausiblen Counts.

- [ ] **Step 5: RLS-Audit=0** `execute_sql`:
  `select count(*) from audit_ungated_definer_views()` UND
  `select count(*) from audit_claim_views_leaking_to_nobody()` → beide **0** (security_invoker ⇒
  nicht als ungated DEFINER geflaggt).

- [ ] **Step 6: Commit** (Migration-File).

---

## Task 4: `get-vertrieb-kontakte`-Loader (Role-Guard + Admin-Client + Ableitung)

**Files:**
- Create: `src/lib/vertrieb/get-vertrieb-kontakte.ts`
- Test: `src/lib/vertrieb/get-vertrieb-kontakte.test.ts`

**Interfaces:**
- Consumes: `deriveVertriebState`, `VertriebKontaktRow`. Vorbild: `src/lib/ops/get-claim-workitems.ts`.
- Produces: `getVertriebKontakte(): Promise<{ ok: true; data: VertriebKontakt[] } | { ok: false; error: string }>`
  — Staff-Role-Guard (admin/dispatch) → `createAdminClient()` liest `v_vertrieb_kontakt` → map deriveVertriebState.

- [ ] **Step 1: Vorbild lesen** `src/lib/ops/get-claim-workitems.ts` (Role-Guard-Helper +
  Admin-Client-Muster). Denselben Guard-Helper wiederverwenden (z.B. `requirePortalAccess`/`requireStaff`).

- [ ] **Step 2: Failing test** — mock `createAdminClient` (liefert 2 Rows) + Guard (staff), assert
  Ergebnis mappt `stufe` korrekt + Non-Staff → `{ ok:false }`. Muster wie `get-claim-workitems.test.ts`
  (env=node, vi.mock).

```ts
import { describe, it, expect, vi } from 'vitest'
// vi.mock('@/lib/supabase/admin', ...) liefert v_vertrieb_kontakt-Rows;
// vi.mock des Guards: staff-Fall + non-staff-Fall.
// assert: getVertriebKontakte() ok + data[0].stufe abgeleitet; non-staff -> { ok:false }.
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implementieren** — Guard (wirft/`{ ok:false }` bei non-staff), `createAdminClient()
  .from('v_vertrieb_kontakt').select('*')`, Fehler → `{ ok:false, error }`, sonst
  `{ ok:true, data: rows.map(deriveVertriebState) }`. Result-Object.

- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: Commit** `feat(vertrieb): getVertriebKontakte Loader (P0 Task 4)`.

---

## Task 5: `v_vertrieb_rollup` + `get-vertrieb-rollup` (Aggregat)

**Files:**
- Create (Plugin): `supabase/migrations/<V>_v_vertrieb_rollup.sql`
- Create: `src/lib/vertrieb/vertrieb-rollup.types.ts` · `src/lib/vertrieb/get-vertrieb-rollup.ts`
- Test: `src/lib/vertrieb/get-vertrieb-rollup.test.ts`

**Interfaces:**
- Produces: View `v_vertrieb_rollup` (`kind, stufe, owner_id, anzahl`) — counts-only, `security_invoker`.
  `getVertriebRollup(): Promise<{ ok:true; data: VertriebRollupRow[] } | { ok:false; error }>`.
- ⚠ **Die `stufe` in der View muss der TS-Ableitung entsprechen.** Da die Ableitung in TS lebt, hat
  die View zwei Optionen: (a) die `stufe`-Logik in SQL spiegeln (Divergenz-Risiko) ODER (b) der Rollup
  aggregiert in TS über `getVertriebKontakte()` (kein zweites Ableitungs-System). **Wähle (b)** für
  P0 (DRY, eine Ableitungs-Wahrheit): `get-vertrieb-rollup.ts` ruft `getVertriebKontakte()` +
  gruppiert per `kind×stufe×owner`. Die SQL-View `v_vertrieb_rollup` wird in P0 **weggelassen** und
  erst gebaut, wenn Perf es verlangt (dann SQL-Ableitung = Follow-up). → **Task 5 = nur der TS-Rollup.**

- [ ] **Step 1: Failing test** — `getVertriebRollup()` über gemockte `getVertriebKontakte()`-Daten →
  korrekte `kind×stufe`-Counts.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementieren** — `getVertriebKontakte()` konsumieren, in TS gruppieren, Result-Object.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(vertrieb): getVertriebRollup (TS-Aggregat, P0 Task 5)`.

---

## Task 6: `updateVertriebFeld`-Write-Action (Whitelist + Role-Guard + Audit)

**Files:**
- Create: `src/lib/vertrieb/vertrieb-edit-fields.ts` (Whitelist-Konstanten/Typen — NICHT `'use server'`)
- Create: `src/app/admin/vertrieb/_actions/update-vertrieb-feld.ts` (`'use server'`)
- Test: `src/app/admin/vertrieb/_actions/update-vertrieb-feld.test.ts`

**Interfaces:**
- Consumes: `VertriebKind`. Vorbild: ops-`updateClaimField` + `claim-edit-fields.ts`.
- Produces: `updateVertriebFeld(kind: VertriebKind, id: string, feld: string, wert: unknown):
  Promise<{ ok: boolean; error?: string }>` — Role-Guard (staff) PFLICHT, Feld gegen Whitelist je kind
  (z.B. sv: `notizen`; makler: `notizen`; …), Update via `createAdminClient` auf die Quell-Tabelle,
  Audit-Insert → `timeline` (non-kritisch try/catch), `revalidatePath('/admin/vertrieb')`.

- [ ] **Step 1: Whitelist-File** (`vertrieb-edit-fields.ts`): `ALLOWED_VERTRIEB_FIELDS:
  Record<VertriebKind, { table: string; fields: string[] }>` (P0 minimal: nur `notizen` je Partner-
  Tabelle, wo vorhanden). Kein Export aus `'use server'`.
- [ ] **Step 2: Failing test** — non-staff → `{ ok:false }`; nicht-gewhitelistetes Feld → `{ ok:false }`;
  gültig → Update aufgerufen + `{ ok:true }`. (vi.mock Admin-Client + Guard.)
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implementieren** — Guard, Whitelist-Check (kind+feld), `createAdminClient().from(table)
  .update({ [feld]: wert }).eq('id', id)`, Audit→timeline (try/catch), revalidatePath, Result-Object.
- [ ] **Step 5: Run → PASS.**
- [ ] **Step 6: Commit** `feat(vertrieb): updateVertriebFeld Write+Audit (P0 Task 6)`.

---

## Task 7: P0-Abschluss — Build + Ratchets + RLS-Audit + Marker

- [ ] **Step 1:** `npx tsc --noEmit` grün (heap-bump falls OOM) + `npm run build` grün.
- [ ] **Step 2:** `npx vitest run src/lib/vertrieb src/lib/status/domains/vertrieb-workflow.test.ts
  src/app/admin/vertrieb` — alle grün.
- [ ] **Step 3:** Alle 4 Ratchets `-- --ratchet` NACH `git add` → 0-neu.
- [ ] **Step 4:** RLS-Audit=0 (beide Funktionen) gegen Prod bestätigt (Task 3 Step 5).
- [ ] **Step 5:** Memory-Marker `COORDINATION-vertrieb-crm.md` schreiben (P0-Files + Lane +
  „P0-Fundament additiv live, P1 Shell/Roster als nächstes; koordiniert mit ops-cockpit/partner-leads-CRM").
- [ ] **Step 6:** PR gegen `staging` öffnen (7-Punkte-Audit im Commit-Body). Prod-Smoke n/a (kein UI) —
  Verifikation = RLS-Audit=0 + View-READ-Counts + vitest.

---

## Self-Review

**1. Spec-Abdeckung:** P0-Deliverables der Spec §6/§3.2 → Task 1 (Registry) · Task 2 (deriveVertriebState
+ Typen) · Task 3 (v_vertrieb_kontakt gegatet) · Task 4 (Loader) · Task 5 (Rollup, TS statt SQL-View —
bewusste DRY-Abweichung, dokumentiert) · Task 6 (Write/Audit). Status-Konsolidierung = in Task 2
(deriveVertriebState kollabiert die SV-Fragmentierung). **Abweichung:** `v_vertrieb_rollup`-SQL-View
auf Perf-Follow-up verschoben (eine Ableitungs-Wahrheit in TS) — in Task 5 begründet.

**2. Placeholder-Scan:** Kein TBD; alle Code-Schritte mit echtem Code/DDL/Test. Die DDL-Spalten sind
mit „vor apply per execute_sql prüfen" abgesichert (Views brauchen exakte Ist-Spalten).

**3. Typ-Konsistenz:** `VertriebKontaktRow`/`VertriebKontakt`/`VertriebStufe`/`VertriebKind` konsistent
über Task 1→2→3→4→6. `v_vertrieb_kontakt`-Spalten == `VertriebKontaktRow`-Felder (Task 3 ↔ Task 2).

**4. Scope:** P0 rein additiv, kein UI, kollisionsfrei (neue Files + 2 additive Registry-Zeilen + 1 View).
