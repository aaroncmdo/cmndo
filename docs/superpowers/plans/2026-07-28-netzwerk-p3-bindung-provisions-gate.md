# Netzwerk-Ökosystem P3 (Bindung-Seed + Provisions-Freundes-Graph-Gate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Netzwerk-Bindung an Claims/Kunden seeden (per-Claim + First-Touch-Default) und die pro-Fall Provisions-Suppression bei intra-Freundesnetzwerk an der **Release-Zeit** scharf schalten — ohne die Inbound-Provisions-Trigger und ohne neue DDL.

**Architecture:** Reines TypeScript auf dem P0-Substrat. (1) **Seed:** `claims.netzwerk_owner_id` beim Claim-Create aus dem INBOUND-Vermittler (`deriveVermittler` → Profil); `profiles.netzwerk_owner_id` First-Touch in `finalizeKundeSetup` aus dem Origin-Claim. (2) **Suppression:** ein Freundes-Graph-Gate im generischen Release-Runner (`runProvisionsRelease`) — release-berechtigte `partner_provisionen`-Rows, deren Inbound-Partner mit dem zugewiesenen Gegenpart (`sv_id` / `reparatur_werkstatt_id`) befreundet ist, werden auf `status='unterdrueckt'` gesetzt statt freigegeben. Makler/`makler_empfehlung` = extern → nie unterdrückt. Die drei Inbound-Trigger + `makler_fall_consent` bleiben **unverändert**.

**Tech Stack:** TypeScript + `@supabase/supabase-js` (Admin-/service_role-Client), vitest. **Kein** `apply_migration` (P3 ist DDL-frei — s. Global Constraints).

---

## Global Constraints

- **P3 hat KEINE DDL.** Alle Spalten/View (`claims.netzwerk_owner_id`, `profiles.netzwerk_owner_id`+`netzwerk_owner_seit`, `v_netzwerk_freunde`) und die Helfer (`ladeFreundKandidatIds`) stammen aus **P0** (`docs/superpowers/plans/2026-07-28-netzwerk-p0-fundament.md`). **⚠ C-Migration (P0):** P3 ist **blockiert bis P0 gemergt** ist — Task 0 verifiziert das gegen prod, **STOP** falls fehlend.
- **Neuer Terminal-Status `'unterdrueckt'` braucht KEINE Migration.** `partner_provisionen.status` trägt **keinen** CHECK-Constraint (verifiziert 28.07.: einziger CHECK = `partner_provisionen_partner_typ_check`). Der `check:flag-drift`-Ratchet scannt nur CHECK-Spalten → `.update({ status: 'unterdrueckt' })` wird **nicht** geflaggt, **kein** Snapshot-Regen nötig.
- **Graph-Reads nur service_role.** `v_netzwerk_freunde` ist P0-seitig **nur** an `service_role` gegrantet. Alle Suppression-Reads laufen über `createAdminClient()` (service_role). Nie einen authenticated-Client für den Graph nutzen.
- **Inbound-Provisions-Trigger unangetastet.** `create_werkstatt_provision` / `create_makler_provision` / `create_firmen_flotte_provision` + `makler_fall_consent`-Insert bleiben **exakt** wie sie sind. Provision wird weiter zur Claim-Anlage **gemintet** (`status='pending'`); P3 gatet nur die **Freigabe**. Provisions-Neutralität des Boosts (Spec 1 §9) bleibt gewahrt.
- **Nur `partner_provisionen`.** Alt-Provisions-Tabellen sind gedroppt; `provisionen_maik`/`marketing_partner` gedroppt (#4545). Kein neuer SV-seitiger Provisions-Typ.
- **Server-Action-/Fehler-Pattern:** Seeds sind **non-critical** und in `try/catch` (`console.warn`) gekapselt — ein Bindungs-Fehler darf Claim-Anlage/Account-Setup **nie** brechen (Atomarität). Der Release-Runner behält sein `{ ok: boolean; error?: string }`-Result.
- **Sprache/Umlaute:** Backend-Code (lib/actions/cron) — ASCII in Kommentaren/Commits ok. **Ausnahme:** falls ein nutzersichtbares Status-**Label** für `'unterdrueckt'` gesetzt wird (Task 6), MUSS es korrekte Umlaute tragen (`"Netzwerk-intern (nicht vergütet)"`).
- **Nie auf `main` pushen.** Branch `kitta/aar-<nr>-netzwerk-p3-bindung-provisions-gate`, PR gegen `staging`, **nicht** selbst mergen.
- **Ratchets grün (0-neu):** `check:flag-drift`, `check:knip` (neue Files werden von convert/finalize/cron importiert → nicht „unused"), `check:token-audit`, `check:component-set` (kein UI), `check:vitest` (neue Tests grün).
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB mit staging). Verifikation via `execute_sql` READ-only; nie echte Partner-/Kunden-Rows mutieren.

## Koordinations-Gates (blockieren den MERGE, nicht das Schreiben)

- **⚠ C-Migration (P0) — HARTER Vorläufer:** P3 landet **auf** dem gemergten P0-Branch (rebasen). Ohne P0-Spalten/View/Helfer kompiliert P3 nicht.
- **⚠ Lane `a6c863e2` / #4789 (Provisionen):** besitzt `release-runner.ts` + arbeitet an `partner_provisionen` (`hold_until`-DROP pending, `release-runner` completion+7d). Task 5 modifiziert `release-runner.ts` → **nach deren Merge rebasen**, Trigger-/Runner-Stand frisch prüfen. Die Trigger-Bodies in diesem Plan sind gegen prod verifiziert (28.07., `pg_get_functiondef`) — **nicht** auf alte Marker-Bodies bauen.
- Seed-Tasks (2/3) berühren `convert-lead-to-claim.ts` (Hot-File, aar-956-Lane) + `flow/[token]/actions.ts` (`finalizeKundeSetup`, aar-956-Hot-File) → **minimal-invasiv** (je 1 Aufruf), vor Merge an die Lane broadcasten.

## File Structure

- **Create** `src/lib/netzwerk/owner-resolution.ts` — Entity→Profil-Resolver (geteilt von Seed + Suppression). Ein Verantwortungsbereich: „welches `profiles.id` gehört zu diesem Vermittler/Provisions-Partner".
- **Create** `src/lib/netzwerk/bindung.ts` — `seedeKundenBindungFirstTouch` (profiles First-Touch aus Origin-Claim).
- **Create** `src/lib/netzwerk/provisions-suppression.ts` — `istIntraNetzwerk` (pure) + `bestimmeIntraNetzwerkProvisionen` (Batch-Gate).
- **Modify** `src/lib/leads/convert-lead-to-claim.ts` — Seed `claims.netzwerk_owner_id` (1 Aufruf nach `deriveVermittler`).
- **Modify** `src/app/flow/[token]/actions.ts` — Seed `profiles.netzwerk_owner_id` (1 Aufruf in `finalizeKundeSetup`).
- **Modify** `src/lib/provisionen/release-runner.ts` — Suppression-Pass + `unterdrueckt`-Zähler.
- **Modify** `src/app/api/cron/release-provisionen/route.ts` + `src/app/api/cron/release-werkstatt-provisionen/route.ts` — Gate verdrahten.
- **Tests** neben jedem neuen Modul (`__tests__/*.test.ts`) + Erweiterung `src/lib/provisionen/__tests__/release-runner.test.ts`.

---

## Task 0: Preflight — P0-Merge + Frische verifizieren (kein Merge-Deliverable)

**Files:** keine (Verifikation).

- [ ] **Schritt 1:** Frischen Worktree off `staging` (bzw. off dem gemergten P0-Branch): `node scripts/new-session-worktree.mjs aar-<nr>-netzwerk-p3-bindung-provisions-gate staging`.
- [ ] **Schritt 2:** P0-Substrat gegen prod bestätigen (via Plugin `execute_sql`, Ref `paizkjajbuxxksdoycev`):
```sql
select 'claims.netzwerk_owner_id'   as obj, count(*) as present from information_schema.columns where table_schema='public' and table_name='claims'   and column_name='netzwerk_owner_id'
union all select 'profiles.netzwerk_owner_id',   count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='netzwerk_owner_id'
union all select 'profiles.netzwerk_owner_seit',  count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='netzwerk_owner_seit'
union all select 'v_netzwerk_freunde',            count(*) from information_schema.views   where table_schema='public' and table_name='v_netzwerk_freunde';
```
Erwartet: **alle 4 = 1**. Ist irgendeines **0** → **STOP**: P0 ist noch nicht gemergt; P3 kann nicht landen. (Stand 28.07. beim Plan-Schreiben: alle 0 = P0 offen.)
- [ ] **Schritt 3:** P0-Helfer im Code bestätigen (die Suppression konsumiert sie):
```
grep -n "export async function ladeFreundKandidatIds" src/lib/netzwerk/freunde.ts
grep -n "export type Zielrolle" src/lib/netzwerk/freunde.ts
```
Erwartet: `ladeFreundKandidatIds(admin, ownerProfilId, zielRolle: Zielrolle): Promise<Set<string>>`, `Zielrolle = 'werkstatt' | 'gutachter'`. Abweichung → Task 4 an die reale Signatur anpassen.
- [ ] **Schritt 4:** `partner_provisionen`-Realität bestätigen (Suppression-Grundannahmen):
```sql
select con.conname from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname='partner_provisionen' and con.contype='c';   -- erwartet NUR partner_typ_check (kein status-CHECK)
select conname, pg_get_constraintdef(con.oid) from pg_constraint con join pg_class c on c.oid=con.conrelid
 where c.relname='partner_provisionen' and conname like '%partner_typ%';   -- erwartet: makler, werkstatt, firmen_flotte, makler_empfehlung
```
Erwartet: **kein** `status`-CHECK (→ `'unterdrueckt'` ist migrationsfrei); partner_typ-Menge wie oben. Abweichung → Global-Constraint neu bewerten.

---

## Task 1: Entity→Profil-Resolver (`owner-resolution.ts`)

**Files:**
- Create: `src/lib/netzwerk/owner-resolution.ts`
- Test: `src/lib/netzwerk/__tests__/owner-resolution.test.ts`

**Interfaces:**
- Consumes: prod-Identitäts-Spalten (`werkstaetten.user_id`, `firmen_flotten_konten.user_id`+`firma_id`+`status`).
- Produces:
  - `resolveVermittlerOwnerProfil(admin, vermittlerTyp: string | null, vermittlerId: string | null): Promise<string | null>` — **Seed-Seite** (`vermittlerId` = konto.id für firmen_flotte). Konsumiert von Task 2.
  - `resolveProvisionPartnerProfil(admin, partnerTyp: string, partnerId: string): Promise<string | null>` — **Suppression-Seite** (`partnerId` = **firma_id** für firmen_flotte, s. Trigger). Konsumiert von Task 4.
  - Beide: `makler`/`makler_empfehlung`/unbekannt/NULL → `null`. Werkstatt → `werkstaetten.user_id`. Firmen-Flotte → `firmen_flotten_konten.user_id`.

**Kontext (verifiziert 28.07. gegen prod):**
- `deriveVermittler` liefert `vermittlerId` = für werkstatt `werkstaetten.id`, für firmen_flotte `firmen_flotten_konten.id` (das Konto).
- `create_firmen_flotte_provision` schreibt hingegen `partner_provisionen.partner_id = firma_id` (im Trigger aus dem Fahrzeug aufgelöst) — **nicht** die konto.id. Deshalb zwei Resolver mit **unterschiedlichem Flotten-Lookup-Key**.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/netzwerk/__tests__/owner-resolution.test.ts
import { describe, it, expect } from 'vitest'
import { resolveVermittlerOwnerProfil, resolveProvisionPartnerProfil } from '../owner-resolution'

// Minimaler chainable Fake: from(t).select().eq()[.eq().limit()].maybeSingle() -> { data, error }
function fakeDb(rowByTable: Record<string, unknown>) {
  const make = (table: string) => {
    const c: any = {}
    c.select = () => c; c.eq = () => c; c.limit = () => c
    c.maybeSingle = () => Promise.resolve({ data: rowByTable[table] ?? null, error: null })
    return c
  }
  return { from: (t: string) => make(t) } as any
}

describe('resolveVermittlerOwnerProfil (Seed-Seite)', () => {
  it('makler -> null (v1 kein Graph-Knoten)', async () => {
    expect(await resolveVermittlerOwnerProfil(fakeDb({}), 'makler', 'm1')).toBeNull()
  })
  it('null typ -> null', async () => {
    expect(await resolveVermittlerOwnerProfil(fakeDb({}), null, null)).toBeNull()
  })
  it('werkstatt -> werkstaetten.user_id', async () => {
    const db = fakeDb({ werkstaetten: { user_id: 'prof-w' } })
    expect(await resolveVermittlerOwnerProfil(db, 'werkstatt', 'w1')).toBe('prof-w')
  })
  it('firmen_flotte -> firmen_flotten_konten.user_id (via konto.id)', async () => {
    const db = fakeDb({ firmen_flotten_konten: { user_id: 'prof-f' } })
    expect(await resolveVermittlerOwnerProfil(db, 'firmen_flotte', 'konto1')).toBe('prof-f')
  })
})

describe('resolveProvisionPartnerProfil (Suppression-Seite)', () => {
  it('makler/makler_empfehlung -> null (extern)', async () => {
    expect(await resolveProvisionPartnerProfil(fakeDb({}), 'makler', 'm1')).toBeNull()
    expect(await resolveProvisionPartnerProfil(fakeDb({}), 'makler_empfehlung', 's1')).toBeNull()
  })
  it('werkstatt -> werkstaetten.user_id', async () => {
    const db = fakeDb({ werkstaetten: { user_id: 'prof-w' } })
    expect(await resolveProvisionPartnerProfil(db, 'werkstatt', 'w1')).toBe('prof-w')
  })
  it('firmen_flotte -> firmen_flotten_konten.user_id (via firma_id, aktiv)', async () => {
    const db = fakeDb({ firmen_flotten_konten: { user_id: 'prof-f' } })
    expect(await resolveProvisionPartnerProfil(db, 'firmen_flotte', 'firma1')).toBe('prof-f')
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/owner-resolution.test.ts` → FAIL („resolveVermittlerOwnerProfil is not a function").

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/netzwerk/owner-resolution.ts
//
// Entity->Profil-Aufloesung fuer die Netzwerk-Bindung (Spec 1 §5.1) + Provisions-Suppression (§13b).
// Zwei Resolver, weil der Flotten-Key differiert:
//   - Seed:       deriveVermittler.vermittlerId = firmen_flotten_konten.id (Konto)
//   - Suppression: partner_provisionen.partner_id = firma_id (im Trigger aufgeloest)
// service_role-Client (untyped admin) reicht — nur Identitaets-Spalten.

import type { SupabaseClient } from '@supabase/supabase-js'

/** werkstaetten.id -> profiles.id (werkstaetten.user_id). */
async function werkstattUserId(admin: SupabaseClient, werkstattId: string): Promise<string | null> {
  const { data } = await admin.from('werkstaetten').select('user_id').eq('id', werkstattId).maybeSingle()
  return (data?.user_id as string | null) ?? null
}

/** firmen_flotten_konten.id (Konto) -> profiles.id (Konto.user_id). */
async function flottenKontoUserIdByKontoId(admin: SupabaseClient, kontoId: string): Promise<string | null> {
  const { data } = await admin.from('firmen_flotten_konten').select('user_id').eq('id', kontoId).maybeSingle()
  return (data?.user_id as string | null) ?? null
}

/** firma_id -> profiles.id (aktives firmen_flotten_konten.user_id). Spiegelt den Trigger-Join. */
async function flottenKontoUserIdByFirmaId(admin: SupabaseClient, firmaId: string): Promise<string | null> {
  const { data } = await admin
    .from('firmen_flotten_konten').select('user_id')
    .eq('firma_id', firmaId).eq('status', 'aktiv').limit(1).maybeSingle()
  return (data?.user_id as string | null) ?? null
}

/**
 * SEED-Seite: der INBOUND-Vermittler eines Claims als Owner-Profil (Spec 1 §8).
 * makler = v1 kein Graph-Knoten -> null. NIE outbound (sv_id) — der Caller uebergibt nur den Vermittler.
 */
export async function resolveVermittlerOwnerProfil(
  admin: SupabaseClient, vermittlerTyp: string | null, vermittlerId: string | null,
): Promise<string | null> {
  if (!vermittlerTyp || !vermittlerId) return null
  if (vermittlerTyp === 'werkstatt') return werkstattUserId(admin, vermittlerId)
  if (vermittlerTyp === 'firmen_flotte') return flottenKontoUserIdByKontoId(admin, vermittlerId)
  return null // makler (v1 kein Knoten) / unbekannt
}

/** Externe Provisions-Typen: kein Graph-Knoten v1 -> nie unterdrueckt. */
export const EXTERNE_PARTNER_TYPEN: ReadonlySet<string> = new Set(['makler', 'makler_empfehlung'])

/**
 * SUPPRESSION-Seite: der Inbound-Partner einer partner_provisionen-Row als Owner-Profil.
 * partner_id: werkstatt=werkstaetten.id, firmen_flotte=FIRMA_id (Trigger-Realitaet). makler*=extern->null.
 */
export async function resolveProvisionPartnerProfil(
  admin: SupabaseClient, partnerTyp: string, partnerId: string,
): Promise<string | null> {
  if (EXTERNE_PARTNER_TYPEN.has(partnerTyp)) return null
  if (partnerTyp === 'werkstatt') return werkstattUserId(admin, partnerId)
  if (partnerTyp === 'firmen_flotte') return flottenKontoUserIdByFirmaId(admin, partnerId)
  return null
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/owner-resolution.test.ts` → PASS.

- [ ] **Schritt 5: Commit**
```bash
git add src/lib/netzwerk/owner-resolution.ts src/lib/netzwerk/__tests__/owner-resolution.test.ts
git commit -m "feat(netzwerk): entity->profil resolver fuer seed + provisions-suppression (P3 T1)"
```

---

## Task 2: Seed `claims.netzwerk_owner_id` beim Claim-Create

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (nach `deriveVermittler`, ~Zeile 500–506)

**Interfaces:**
- Consumes: `resolveVermittlerOwnerProfil` (Task 1), `vermittlerTyp`/`vermittlerId` (bereits im File via `deriveVermittler`).
- Produces: `claims.netzwerk_owner_id` gesetzt bei Anlage (werkstatt/flotte-Inbound → Profil; makler/kein Vermittler → NULL).

**Warum Glue statt eigenem Monolith-Test:** `convertLeadToClaim` ist eine 1000-Zeilen-Funktion mit queue-basiertem Mock (`convert-lead-to-claim.test.ts`). Die **Logik** unter Test lebt im Resolver (Task 1, voll getestet); hier ist nur eine deterministische Zuweisung. Verifikation = Resolver-Unit (T1) + `tsc`/Build (Schritt 3) + Prod-Smoke (Task 7). Kein re-driven des Monolith-Mocks (Queue-Fragilität = FP-Risiko).

- [ ] **Schritt 1: Anker finden**
```
grep -n "claimsInsert as Record<string, unknown>).vermittler_id = vermittlerId" src/lib/leads/convert-lead-to-claim.ts
```
Erwartet: genau 1 Treffer (aktuell Zeile ~506). Direkt darunter einfügen.

- [ ] **Schritt 2: Import ergänzen** (bei den `@/lib/...`-Imports oben):
```ts
import { resolveVermittlerOwnerProfil } from '@/lib/netzwerk/owner-resolution'
```

- [ ] **Schritt 3: Seed-Zuweisung einfügen** (unmittelbar nach der `vermittler_id`-Zuweisung):
```ts
  // Netzwerk-Bindung (Spec 1 §8, K6): per-Claim Owner-Attribution aus dem INBOUND-Vermittler.
  // Makler = v1 kein Graph-Knoten -> null (keine Bindung, wird aktiv sobald Makler Knoten werden).
  // NIE aus sv_id/svIdFromTermin (OUTBOUND) seeden. Sticky: der Wert wird nur bei Anlage gesetzt,
  // spaeter nie ueberschrieben (write-once). Record-Cast wie die uebrigen type-lagged Convert-Mappings.
  ;(claimsInsert as Record<string, unknown>).netzwerk_owner_id =
    await resolveVermittlerOwnerProfil(admin, vermittlerTyp, vermittlerId)
```

- [ ] **Schritt 4: Build/Typecheck grün**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```
Erwartet: 0 Fehler (`netzwerk_owner_id` ist nach P0-Types-Regen bekannt; Record-Cast trägt ohnehin).

- [ ] **Schritt 5: Bestehende Convert-Tests grün** — `npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts` → PASS (der neue `admin.from('werkstaetten'|'firmen_flotten_konten')`-Read liegt hinter `resolveVermittlerOwnerProfil`; bei fehlender Mock-Response liefert der Fake `null` → Seed = NULL, kein Bruch. Falls ein Test die Read-Reihenfolge streng zählt: die Response-Queue um die entsprechenden `null`-Antworten ergänzen — der Test schlägt sonst sichtbar fehl, kein Silent-Skip).

- [ ] **Schritt 6: Commit**
```bash
git add src/lib/leads/convert-lead-to-claim.ts
git commit -m "feat(netzwerk): seed claims.netzwerk_owner_id aus inbound-vermittler (P3 T2)"
```

---

## Task 3: Seed `profiles.netzwerk_owner_id` First-Touch in `finalizeKundeSetup`

**Files:**
- Create: `src/lib/netzwerk/bindung.ts`
- Test: `src/lib/netzwerk/__tests__/bindung.test.ts`
- Modify: `src/app/flow/[token]/actions.ts` (`finalizeKundeSetup`, im `if (claimId) {`-Block, ~Zeile 499–503)

**Interfaces:**
- Consumes: `claims.netzwerk_owner_id` (P0/Task 2), `profiles.netzwerk_owner_id`+`netzwerk_owner_seit` (P0).
- Produces: `seedeKundenBindungFirstTouch(admin, kundeUserId: string, originClaimId: string): Promise<void>` — First-Touch (IS-NULL-geguardet), non-fatal.

**K6:** Der Kunden-Profil entsteht **hier** (nicht beim Sofort-Claim). `profiles.entstanden_via`/`entstanden_aus_claim_id` haben **NULL-Writer** → **nicht** als Anker. Anker = der Origin-Claim (`claimId`, via `resolveClaimId` bereits im Block aufgelöst).

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/netzwerk/__tests__/bindung.test.ts
import { describe, it, expect } from 'vitest'
import { seedeKundenBindungFirstTouch } from '../bindung'

// Fake: from('claims').select().eq().maybeSingle() -> claimRow; from('profiles').update().eq().is() erfasst.
function fakeDb(claimRow: unknown) {
  const updates: { table: string; patch: any; filters: [string, unknown][] }[] = []
  const make = (table: string) => {
    const c: any = {}; let patch: any = null; const filters: [string, unknown][] = []
    c.select = () => c
    c.eq = (col: string, val: unknown) => { filters.push([col, val]); return c }
    c.is = (col: string, val: unknown) => { filters.push([`is:${col}`, val]); return c }
    c.maybeSingle = () => Promise.resolve({ data: claimRow, error: null })
    c.update = (p: any) => { patch = p; return c }
    c.then = (res: (v: unknown) => unknown) => { if (patch) updates.push({ table, patch, filters }); return Promise.resolve({ error: null }).then(res) }
    return c
  }
  return { _updates: updates, from: (t: string) => make(t) } as any
}

describe('seedeKundenBindungFirstTouch', () => {
  it('Owner am Claim -> profiles First-Touch-Update mit IS-NULL-Guard', async () => {
    const db = fakeDb({ netzwerk_owner_id: 'owner-1' })
    await seedeKundenBindungFirstTouch(db, 'kunde-1', 'claim-1')
    expect(db._updates).toHaveLength(1)
    const u = db._updates[0]
    expect(u.table).toBe('profiles')
    expect(u.patch.netzwerk_owner_id).toBe('owner-1')
    expect(u.patch.netzwerk_owner_seit).toBeTruthy()
    expect(u.filters).toContainEqual(['id', 'kunde-1'])
    expect(u.filters).toContainEqual(['is:netzwerk_owner_id', null]) // First-Touch: nie ueberschreiben
  })
  it('Kein Owner am Claim -> kein Update (No-op)', async () => {
    const db = fakeDb({ netzwerk_owner_id: null })
    await seedeKundenBindungFirstTouch(db, 'kunde-1', 'claim-1')
    expect(db._updates).toHaveLength(0)
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/bindung.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/netzwerk/bindung.ts
//
// Kunden-Bindung First-Touch (Spec 1 §8, K6). Der Kunden-Profil entsteht in finalizeKundeSetup
// (nicht beim Sofort-Claim); der Origin-Claim traegt bereits netzwerk_owner_id (Task 2). Wir kopieren
// ihn per First-Touch (IS-NULL-Guard) auf den Kunden-Default. entstanden_via/-aus_claim_id sind
// KEINE Anker (NULL-Writer). Non-fatal: darf Account-Setup nie brechen.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function seedeKundenBindungFirstTouch(
  admin: SupabaseClient, kundeUserId: string, originClaimId: string,
): Promise<void> {
  try {
    const { data: claim } = await admin
      .from('claims').select('netzwerk_owner_id').eq('id', originClaimId).maybeSingle()
    const ownerProfilId = (claim?.netzwerk_owner_id as string | null) ?? null
    if (!ownerProfilId) return
    await admin
      .from('profiles')
      .update({ netzwerk_owner_id: ownerProfilId, netzwerk_owner_seit: new Date().toISOString() })
      .eq('id', kundeUserId)
      .is('netzwerk_owner_id', null) // First-Touch: sticky, nie ueberschreiben (mehrere Faelle aus versch. Netzwerken)
  } catch (err) {
    console.warn('[netzwerk] seedeKundenBindungFirstTouch non-fatal:', err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/bindung.test.ts` → PASS.

- [ ] **Schritt 5: In `finalizeKundeSetup` verdrahten.** Anker:
```
grep -n "const claimId = await resolveClaimId(admin, fallId)" src/app/flow/[token]/actions.ts
```
Import ergänzen (bei den `@/lib/...`-Imports der Datei):
```ts
import { seedeKundenBindungFirstTouch } from '@/lib/netzwerk/bindung'
```
Im `if (claimId) {`-Block, **direkt nach** dem `.update({ geschaedigter_user_id: userId }).eq('id', claimId)`-Aufruf, einfügen:
```ts
      // Netzwerk-Bindung First-Touch (Spec 1 §8, K6): profiles.netzwerk_owner_id aus dem Origin-Claim
      // (claimId ist der Anker; entstanden_via/-aus_claim_id haben NULL-Writer). Non-fatal.
      await seedeKundenBindungFirstTouch(admin, userId, claimId)
```

- [ ] **Schritt 6: Build grün** (Route/Server-Action → **voller** Build, nicht nur tsc):
```bash
npm run build
```
Erwartet: grün.

- [ ] **Schritt 7: Commit**
```bash
git add src/lib/netzwerk/bindung.ts src/lib/netzwerk/__tests__/bindung.test.ts "src/app/flow/[token]/actions.ts"
git commit -m "feat(netzwerk): profiles.netzwerk_owner_id first-touch in finalizeKundeSetup (P3 T3)"
```

---

## Task 4: Freundes-Graph-Gate (`provisions-suppression.ts`)

**Files:**
- Create: `src/lib/netzwerk/provisions-suppression.ts`
- Test: `src/lib/netzwerk/__tests__/provisions-suppression.test.ts`

**Interfaces:**
- Consumes: `ladeFreundKandidatIds` (P0, `@/lib/netzwerk/freunde`), `resolveProvisionPartnerProfil`+`EXTERNE_PARTNER_TYPEN` (Task 1).
- Produces:
  - `istIntraNetzwerk(claim: { svId: string|null; reparaturWerkstattId: string|null }, freunde: { svIds: ReadonlySet<string>; werkstattIds: ReadonlySet<string> }): boolean` — **pure**.
  - `bestimmeIntraNetzwerkProvisionen(admin, rows: { id, partner_typ, partner_id, claim_id }[]): Promise<Set<string>>` — die Provisions-Ids, die unterdrückt werden. **Wirft nie** (per-Row-Fehler → nicht unterdrückt = Status quo freigeben). Konsumiert von Task 5.

**Semantik (Spec 1 §13b LOCKED, K2/K13):** Inbound-Partner ↔ zugewiesener Gegenpart **befreundet** → Provision **unterdrückt** (intra-Netzwerk). `svId`→`sachverstaendige.id` (`ladeFreundKandidatIds(...,'gutachter')`), `reparaturWerkstattId`→`werkstaetten.id` (`...,'werkstatt'`) — id-Räume verifiziert (FK 28.07.). Makler/`makler_empfehlung` = extern → nie im Set.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/netzwerk/__tests__/provisions-suppression.test.ts
import { describe, it, expect, vi } from 'vitest'
import { istIntraNetzwerk } from '../provisions-suppression'

describe('istIntraNetzwerk (pure)', () => {
  const freunde = { svIds: new Set(['sv-freund']), werkstattIds: new Set(['w-freund']) }
  it('zugewiesener SV ist Freund -> intra', () => {
    expect(istIntraNetzwerk({ svId: 'sv-freund', reparaturWerkstattId: null }, freunde)).toBe(true)
  })
  it('zugewiesene Reparatur-Werkstatt ist Freund -> intra', () => {
    expect(istIntraNetzwerk({ svId: null, reparaturWerkstattId: 'w-freund' }, freunde)).toBe(true)
  })
  it('weder SV noch Werkstatt befreundet -> cross-network (nicht intra)', () => {
    expect(istIntraNetzwerk({ svId: 'sv-fremd', reparaturWerkstattId: 'w-fremd' }, freunde)).toBe(false)
  })
  it('beide null -> nicht intra', () => {
    expect(istIntraNetzwerk({ svId: null, reparaturWerkstattId: null }, freunde)).toBe(false)
  })
})

// Batch-Gate mit gemockten P0-/T1-Abhaengigkeiten.
vi.mock('../freunde', () => ({
  ladeFreundKandidatIds: vi.fn(async (_admin: unknown, owner: string, rolle: string) => {
    if (owner !== 'prof-werkstatt') return new Set<string>()
    return rolle === 'gutachter' ? new Set(['sv-freund']) : new Set(['w-freund'])
  }),
}))
vi.mock('../owner-resolution', async (orig) => ({
  ...(await orig() as object),
  resolveProvisionPartnerProfil: vi.fn(async (_admin: unknown, typ: string, _id: string) =>
    typ === 'werkstatt' ? 'prof-werkstatt' : null),
}))

import { bestimmeIntraNetzwerkProvisionen } from '../provisions-suppression'

function fakeAdmin(claims: Record<string, { sv_id: string | null; reparatur_werkstatt_id: string | null }>) {
  const make = () => {
    const c: any = {}; let ids: string[] = []
    c.select = () => c
    c.in = (_col: string, v: string[]) => { ids = v; return c }
    c.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: ids.map((id) => ({ id, ...claims[id] })), error: null }).then(res)
    return c
  }
  return { from: () => make() } as any
}

describe('bestimmeIntraNetzwerkProvisionen (Batch)', () => {
  it('werkstatt-inbound + befreundeter zugewiesener SV -> unterdrueckt', async () => {
    const admin = fakeAdmin({ c1: { sv_id: 'sv-freund', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p1', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: 'c1' },
    ])
    expect(set.has('p1')).toBe(true)
  })
  it('werkstatt-inbound + FREMDER zugewiesener SV -> cross-network (nicht im Set)', async () => {
    const admin = fakeAdmin({ c1: { sv_id: 'sv-fremd', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p1', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: 'c1' },
    ])
    expect(set.has('p1')).toBe(false)
  })
  it('makler = extern -> nie im Set (kein Resolve/Graph-Read)', async () => {
    const admin = fakeAdmin({ c1: { sv_id: 'sv-freund', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'pm', partner_typ: 'makler', partner_id: 'm1', claim_id: 'c1' },
    ])
    expect(set.size).toBe(0)
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/provisions-suppression.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/netzwerk/provisions-suppression.ts
//
// Freundes-Graph-Gate der Provisions-Suppression (Spec 1 §13b LOCKED, K2/K13). NICHT an den
// Inbound-Triggern (dort sind sv_id/reparatur_werkstatt_id NOCH NULL) — sondern an der RELEASE-Zeit
// (completion+7d), wo alle Zuweisungen stehen. Provision unterdrueckt, wenn der Inbound-Partner mit
// dem zugewiesenen Gegenpart (SV oder Reparatur-Werkstatt) befreundet ist. Makler/makler_empfehlung
// = extern (kein Graph-Knoten v1) -> nie unterdrueckt. service_role (v_netzwerk_freunde Definer-only).

import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'
import { resolveProvisionPartnerProfil, EXTERNE_PARTNER_TYPEN } from '@/lib/netzwerk/owner-resolution'

export type SuppressionClaim = { svId: string | null; reparaturWerkstattId: string | null }
export type SuppressionFreunde = { svIds: ReadonlySet<string>; werkstattIds: ReadonlySet<string> }

/** Pure: ist ein zugewiesener Gegenpart im Freundes-Set des Inbound-Partners? */
export function istIntraNetzwerk(claim: SuppressionClaim, freunde: SuppressionFreunde): boolean {
  if (claim.svId && freunde.svIds.has(claim.svId)) return true
  if (claim.reparaturWerkstattId && freunde.werkstattIds.has(claim.reparaturWerkstattId)) return true
  return false
}

export type SuppressionRow = { id: string; partner_typ: string; partner_id: string; claim_id: string | null }

/**
 * Batch-Gate: liefert die Provisions-Ids, die intra-Freundesnetzwerk sind (-> unterdruecken).
 * Robust: wirft NIE. Ein per-Row-Fehler (unaufloesbarer Partner/Claim) => Row NICHT im Set =>
 * Status quo (freigeben). Der claims-Read ist gebatcht; die Freund-Reads laufen pro graph-relevanter
 * Row — akzeptabel (Release ist ein taeglicher Low-Freq-Cron; K10s Batch-Mandat gilt dem Ranking-
 * Hot-Path, nicht diesem Cron).
 */
export async function bestimmeIntraNetzwerkProvisionen(
  admin: SupabaseClient, rows: SuppressionRow[],
): Promise<Set<string>> {
  const out = new Set<string>()
  const graphRows = rows.filter((r) => !EXTERNE_PARTNER_TYPEN.has(r.partner_typ) && r.claim_id)
  if (graphRows.length === 0) return out

  // Batch: sv_id + reparatur_werkstatt_id fuer alle betroffenen Claims.
  const claimIds = Array.from(new Set(graphRows.map((r) => r.claim_id as string)))
  const claimMap = new Map<string, SuppressionClaim>()
  const { data: claims } = await admin
    .from('claims').select('id, sv_id, reparatur_werkstatt_id').in('id', claimIds)
  for (const c of (claims ?? []) as Record<string, unknown>[]) {
    claimMap.set(c.id as string, {
      svId: (c.sv_id as string | null) ?? null,
      reparaturWerkstattId: (c.reparatur_werkstatt_id as string | null) ?? null,
    })
  }

  for (const r of graphRows) {
    try {
      const claim = claimMap.get(r.claim_id as string)
      if (!claim) continue
      // Kein zugewiesener Gegenpart -> nichts zu unterdruecken (spart die Graph-Reads).
      if (!claim.svId && !claim.reparaturWerkstattId) continue
      const ownerProfil = await resolveProvisionPartnerProfil(admin, r.partner_typ, r.partner_id)
      if (!ownerProfil) continue // extern/unaufloesbar -> Status quo (freigeben)
      const [svIds, werkstattIds] = await Promise.all([
        ladeFreundKandidatIds(admin, ownerProfil, 'gutachter'),
        ladeFreundKandidatIds(admin, ownerProfil, 'werkstatt'),
      ])
      if (istIntraNetzwerk(claim, { svIds, werkstattIds })) out.add(r.id)
    } catch (err) {
      console.error('[provisions-suppression] Row uebersprungen (bleibt freigebbar):', r.id, err instanceof Error ? err.message : err)
    }
  }
  return out
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/provisions-suppression.test.ts` → PASS.

- [ ] **Schritt 5: Commit**
```bash
git add src/lib/netzwerk/provisions-suppression.ts src/lib/netzwerk/__tests__/provisions-suppression.test.ts
git commit -m "feat(netzwerk): freundes-graph-gate fuer provisions-suppression (P3 T4)"
```

---

## Task 5: Suppression-Pass in `runProvisionsRelease`

**⚠ MERGE-GATE:** `release-runner.ts` gehört Lane `a6c863e2`/#4789 — nach deren Merge rebasen, Runner-Stand frisch prüfen (dieser Patch dockt an die verifizierte 28.07.-Struktur).

**Files:**
- Modify: `src/lib/provisionen/release-runner.ts`
- Test: `src/lib/provisionen/__tests__/release-runner.test.ts` (erweitern)

**Interfaces:**
- Consumes: injizierter Hook (von Task 6 mit `bestimmeIntraNetzwerkProvisionen` verdrahtet).
- Produces:
  - `RunProvisionsReleaseOpts.bestimmeUnterdrueckteProvisionen?: (releaseBerechtigt: ReleasePendingRow[]) => Promise<Set<string>>`
  - `ReleaseErgebnis` (Erfolg) += `unterdrueckt: number`.
  - Rows im Set → `.update({ status: 'unterdrueckt', storno_grund: 'intra_netzwerk' })`, **kein** `onStatusChange` (K13: still).

- [ ] **Schritt 1: Failing Test schreiben** (an `release-runner.test.ts` anhängen — nutzt die vorhandene `fakeDb`/`pendingRow`/`abgeschlossenerClaim`-Harness):
```ts
  it('Suppression-Gate: intra-Row -> unterdrueckt (nicht freigegeben, kein notify); cross-Row -> freigegeben', async () => {
    const gesehen: [string, string][] = []
    const db = fakeDb({
      pending: [
        pendingRow({ id: 'p-intra', partner_typ: 'werkstatt', partner_id: 'w1' }),
        pendingRow({ id: 'p-cross', partner_typ: 'werkstatt', partner_id: 'w2' }),
      ],
      claims: [abgeschlossenerClaim()],
    })

    const r = await runProvisionsRelease(db, {
      partnerTypen: RELEASE_PARTNER_TYPEN,
      now: NOW,
      onStatusChange: async (row, status) => { gesehen.push([row.id, status]); return false },
      bestimmeUnterdrueckteProvisionen: async () => new Set(['p-intra']),
    })

    if (!r.ok) throw new Error(r.error)
    expect(r.unterdrueckt).toBe(1)
    expect(r.released).toBe(1)
    expect(db._updates).toContainEqual({
      table: 'partner_provisionen',
      patch: { status: 'unterdrueckt', storno_grund: 'intra_netzwerk' },
      ids: ['p-intra'],
    })
    expect(db._updates).toContainEqual({
      table: 'partner_provisionen',
      patch: { status: 'freigegeben' },
      ids: ['p-cross'],
    })
    // K13 „still": die unterdrueckte Row wird NICHT benachrichtigt.
    expect(gesehen).toEqual([['p-cross', 'freigegeben']])
  })

  it('ohne bestimmeUnterdrueckteProvisionen: Verhalten unveraendert (alles freigegeben)', async () => {
    const db = fakeDb({ pending: [pendingRow({ id: 'p1', partner_typ: 'werkstatt' })], claims: [abgeschlossenerClaim()] })
    const r = await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })
    if (!r.ok) throw new Error(r.error)
    expect(r.released).toBe(1)
    expect(r.unterdrueckt).toBe(0)
  })
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/provisionen/__tests__/release-runner.test.ts` → FAIL (`r.unterdrueckt` undefined / kein unterdrueckt-Update).

- [ ] **Schritt 3: Implementieren** — drei Edits in `release-runner.ts`:

**(a) `ReleaseErgebnis` (Erfolg) um `unterdrueckt` erweitern:**
```ts
export type ReleaseErgebnis =
  | { ok: true; checked: number; storniert: number; released: number; unterdrueckt: number; notifsEmitted: number }
  | { ok: false; error: string }
```

**(b) Opt hinzufügen** (in `RunProvisionsReleaseOpts`, nach `onStatusChange`):
```ts
  /**
   * Freundes-Graph-Gate (K2/K13). Erhaelt die release-BERECHTIGTEN Rows und liefert die Teilmenge der
   * Provisions-Ids, die intra-Freundesnetzwerk sind -> werden auf 'unterdrueckt' gesetzt statt freigegeben
   * (still, ohne onStatusChange). makler/makler_empfehlung sind extern -> nie im Set. Wirft der Hook,
   * degradiert der Lauf fail-open zu Status quo (alles freigeben) mit lautem Log.
   */
  bestimmeUnterdrueckteProvisionen?: (releaseBerechtigt: ReleasePendingRow[]) => Promise<Set<string>>
```

**(c) Early-Return + Release-Pass patchen.** Den Empty-Pending-Return um `unterdrueckt: 0` ergänzen:
```ts
  if (pending.length === 0) {
    return { ok: true, checked: 0, storniert: 0, released: 0, unterdrueckt: 0, notifsEmitted: 0 }
  }
```
Den Release-Pass (nach der Berechnung von `releaseRows`, VOR dem Freigabe-Update) ersetzen:
```ts
  // NEU (P3): Freundes-Graph-Gate — intra-Netzwerk-Provisionen werden unterdrueckt statt freigegeben.
  let unterdruecktSet = new Set<string>()
  if (opts.bestimmeUnterdrueckteProvisionen && releaseRows.length > 0) {
    try {
      unterdruecktSet = await opts.bestimmeUnterdrueckteProvisionen(releaseRows)
    } catch (err) {
      console.error('[release-runner] Suppression-Gate warf — fail-open zu Status quo (freigeben):', err)
      unterdruecktSet = new Set()
    }
  }
  const unterdrueckteRows = releaseRows.filter((p) => unterdruecktSet.has(p.id))
  const freizugebendeRows = releaseRows.filter((p) => !unterdruecktSet.has(p.id))

  let unterdrueckt = 0
  if (unterdrueckteRows.length > 0) {
    const { error } = await db
      .from('partner_provisionen')
      .update({ status: 'unterdrueckt', storno_grund: 'intra_netzwerk' })
      .in('id', unterdrueckteRows.map((p) => p.id))
    if (error) return { ok: false, error: error.message }
    unterdrueckt = unterdrueckteRows.length
    // K13 „still": KEIN notify.
  }

  let released = 0
  if (freizugebendeRows.length > 0) {
    const { error } = await db
      .from('partner_provisionen')
      .update({ status: 'freigegeben' })
      .in('id', freizugebendeRows.map((p) => p.id))
    if (error) return { ok: false, error: error.message }
    released = freizugebendeRows.length
    for (const p of freizugebendeRows) await notify(p, 'freigegeben')
  }

  return { ok: true, checked: pending.length, storniert, released, unterdrueckt, notifsEmitted }
```
> Ersetzt den bisherigen `releaseRows`-Freigabe-Block (der `.update({ status: 'freigegeben' })` auf `releaseRows` + `notify` machte). `stornoRows`/`stornoSet`/`releaseRows`-Berechnung darüber bleibt unverändert.

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/provisionen/__tests__/release-runner.test.ts` → PASS (neue + bestehende Tests; die alten prüfen feldspezifisch `r.released`/`r.storniert` → das additive `unterdrueckt`-Feld bricht sie nicht).

- [ ] **Schritt 5: Commit**
```bash
git add src/lib/provisionen/release-runner.ts src/lib/provisionen/__tests__/release-runner.test.ts
git commit -m "feat(netzwerk): suppression-pass im release-runner (unterdrueckt-status) (P3 T5)"
```

---

## Task 6: Gate in die Release-Crons verdrahten + Reader-Label

**Files:**
- Modify: `src/app/api/cron/release-provisionen/route.ts` (primär, alle Typen)
- Modify: `src/app/api/cron/release-werkstatt-provisionen/route.ts` (Defense-in-Depth: Legacy-Cron ruft `runProvisionsRelease` **ohne** Hook → würde `werkstatt`-Suppression bypassen, solange der VPS-crontab noch darauf zeigt)
- Modify: 1 Status-Label-Map (Reader-Audit, s. Schritt 3)

**Interfaces:**
- Consumes: `bestimmeIntraNetzwerkProvisionen` (Task 4), `runProvisionsRelease` (Task 5).

> `release-makler-provisionen/route.ts` bleibt **unangetastet** — `partnerTypen: ['makler']` ist extern, wird nie unterdrückt.

- [ ] **Schritt 1: `release-provisionen/route.ts` verdrahten.** `admin` benennen + Hook + Output:
```ts
import { runProvisionsRelease, RELEASE_PARTNER_TYPEN } from '@/lib/provisionen/release-runner'
import { notifyMaklerProvisionStatus } from '@/lib/provisionen/notify-makler-provision'
import { bestimmeIntraNetzwerkProvisionen } from '@/lib/netzwerk/provisions-suppression'
// ...
  const now = new Date().toISOString()
  const admin = createAdminClient()
  const result = await runProvisionsRelease(admin, {
    partnerTypen: RELEASE_PARTNER_TYPEN,
    now,
    onStatusChange: notifyMaklerProvisionStatus,
    bestimmeUnterdrueckteProvisionen: (rows) => bestimmeIntraNetzwerkProvisionen(admin, rows),
  })
  // ...
  return NextResponse.json({
    ok: true, partner_typen: RELEASE_PARTNER_TYPEN,
    checked: result.checked, storniert: result.storniert, released: result.released,
    unterdrueckt: result.unterdrueckt, notifs_emitted: result.notifsEmitted, timestamp: now,
  })
```

- [ ] **Schritt 2: `release-werkstatt-provisionen/route.ts` verdrahten** (identisches Muster, `partnerTypen: ['werkstatt']`):
```ts
import { bestimmeIntraNetzwerkProvisionen } from '@/lib/netzwerk/provisions-suppression'
// ...
  const admin = createAdminClient()
  const result = await runProvisionsRelease(admin, {
    partnerTypen: ['werkstatt'],
    now,
    bestimmeUnterdrueckteProvisionen: (rows) => bestimmeIntraNetzwerkProvisionen(admin, rows),
  })
  // ...
  return NextResponse.json({
    ok: true, checked: result.checked, storniert: result.storniert,
    released: result.released, unterdrueckt: result.unterdrueckt, timestamp: now,
  })
```

- [ ] **Schritt 3: Reader-Label-Audit für `'unterdrueckt'`.** Der neue Terminal-Status ist money-sicher (Finance-Reader filtern auf bekannte Werte `pending`/`freigegeben`/`ausgezahlt`/`storniert` → `unterdrueckt` fällt aus allen Payout-/Storno-Listen = korrekt; `money-integrity-checks.ts` keyt nur auf `ausgezahlt_am` → unberührt). **Nur** falls ein nutzersichtbares Status-**Label** existiert, den Wert ergänzen. Prüfen:
```
grep -rn "freigegeben\|ausgezahlt\|storniert" src/lib/finance/partner-tabellen.ts src/lib/finance/ledger-tabellen.ts src/lib/analytics/finance.ts
grep -rln "provision" src/app/**/(shell)/**/  # Partner-Portal-Badges
```
Wenn eine `Record<status,label>`-Map (human-facing) gefunden wird: `unterdrueckt: 'Netzwerk-intern (nicht vergütet)'` ergänzen (Umlaut korrekt). Wird kein human-Label gefunden (Status roh/gefiltert) → in der Commit-Message „Reader-Label: n/a (kein human-facing Status-Label)" vermerken.

- [ ] **Schritt 4: Build grün** (Routen → voller Build):
```bash
npm run build
```
Erwartet: grün. Danach `npm run check:knip -- --ratchet` (die 3 neuen `src/lib/netzwerk/*.ts` sind von convert/finalize/cron importiert → nicht „unused").

- [ ] **Schritt 5: Commit**
```bash
git add src/app/api/cron/release-provisionen/route.ts src/app/api/cron/release-werkstatt-provisionen/route.ts
# ggf. + die Label-Map-Datei
git commit -m "feat(netzwerk): freundes-graph-gate in release-crons verdrahten (P3 T6)"
```

---

## Task 7: Voller Gate-Durchlauf + offener Aaron-Entscheid + Prod-Smoke (Regel 4)

**Files:** keine (Verifikation + Doku).

- [ ] **Schritt 1: Volle CI-Gates lokal**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run build
npx vitest run src/lib/netzwerk src/lib/provisionen
npm run check:flag-drift -- --ratchet   # erwartet grün: partner_provisionen.status hat KEINEN CHECK -> 'unterdrueckt' wird nicht geflaggt
npm run check:knip -- --ratchet && npm run check:component-set -- --ratchet && npm run check:token-audit
```
Erwartet: alles grün / 0-neu.

- [ ] **Schritt 2: Offenen Aaron-Entscheid im PR markieren (K13).** **„inbound-Haftpflicht-only" ist im Code NICHT enforced:** `create_werkstatt_provision` (verifiziert 28.07.) hat **kein** abrechnungsweg-Gate und mintet `COALESCE(provision_betrag_netto,150)€` bei **jedem** `werkstatt_id` mit `provision_aktiv` — auch Selbstzahler/Kasko-Inbound. Die P3-Suppression ändert das **nicht** (sie gatet nur befreundet-vs-fremd, nicht den Abrechnungsweg). **PR-Body-Vermerk:** „Offen (Aaron-Entscheid): Soll `create_werkstatt_provision` zusätzlich auf `abrechnungsweg='haftpflicht'` gaten? Separate Trigger-Migration, nicht Teil von P3." Nicht ohne Entscheid ändern.

- [ ] **Schritt 3: Prod-Smoke (Regel 4) — Provisions-Suppression-Journey (J9).** Der Release ist ein **täglicher Backend-Cron** (kein UI-Trigger) mit completion+7d — daher DB-getriebener Smoke gegen prod (`paizkjajbuxxksdoycev`), **kein** echter Kunden-/Partner-Impact:
  1. **Wegwerf-Setup** (Test-Konten, `telefon=NULL`): eine Wegwerf-Werkstatt (`provision_aktiv=true`) als **Inbound**-Vermittler + eine Wegwerf-SV. Zwei Wegwerf-Claims (completion vor >7d, `operative_status='abgeschlossen'`, `abgeschlossen_am` = vor 8 Tagen):
     - **Intra:** `netzwerk_verbindungen(status='angenommen')` zwischen Werkstatt-Profil ↔ SV-Profil; Claim mit dieser Werkstatt inbound (`partner_provisionen.partner_typ='werkstatt'`) **und** `sv_id` = die befreundete SV.
     - **Cross (Kontrolle):** gleicher Aufbau, aber **keine** Kante (SV ist fremd).
  2. **Cron feuern** (prod, mit `CRON_SECRET`): `GET /api/cron/release-provisionen` (Bearer). Antwort prüfen: `unterdrueckt >= 1`, `released >= 1`.
  3. **DB-Assertion** (`execute_sql`, Admin/JWT-Sim, da Views service-role=0):
     ```sql
     select id, partner_typ, status, storno_grund from public.partner_provisionen where id in ('<intra-p>','<cross-p>');
     ```
     Erwartet: intra → `status='unterdrueckt'`, `storno_grund='intra_netzwerk'`; cross → `status='freigegeben'`.
  4. **Cleanup:** die Wegwerf-Rows entfernen. **Nie** echte Partner-/Kunden-Provisionen anfassen.
- [ ] **Schritt 4:** Falls in dieser Session **nicht** auf prod deployed → Smoke-Pflicht **explizit im Marker/PR** an die Merge-/Deploy-Session übergeben (Flow-Liste + Wegwerf-Konten). Aufgabe bleibt **offen** bis grüner Prod-Smoke.

---

## Definition of Done (P3)

- **Seed:** `claims.netzwerk_owner_id` wird beim Claim-Create aus dem Inbound-Vermittler gesetzt (werkstatt/flotte → Profil; makler/kein Vermittler → NULL); `profiles.netzwerk_owner_id` wird in `finalizeKundeSetup` First-Touch geseedet.
- **Idempotenz-Test (Seed):** `bindung.test.ts` beweist den **First-Touch-Guard** (`.is('netzwerk_owner_id', null)` → nie überschrieben) + No-op ohne Owner. Der Claim-Owner ist **write-once** (nur im Insert; convert ist bei bereits-konvertiertem Lead früh-idempotent, Zeile ~98) — kein Re-Seed bei Re-Run.
- **Provisions-Suppression-Test (intra vs cross-network):** `provisions-suppression.test.ts` (intra → im Set, cross → nicht, makler → nie) + `release-runner.test.ts` (intra → `status='unterdrueckt'`+`storno_grund='intra_netzwerk'`, **kein** notify; cross → `freigegeben`).
- **Journey J9 (Provisions-Suppression intra-Netzwerk):** Prod-Smoke grün (intra unterdrückt, cross freigegeben) oder explizit an die Deploy-Session übergeben.
- **Invarianten:** Inbound-Trigger + `makler_fall_consent` unverändert (Provision weiter gemintet, nur Freigabe gegated); Makler/`makler_empfehlung` feuern immer (extern); nur `partner_provisionen` betroffen.
- **Gates:** tsc + build grün; vitest grün; `check:flag-drift`/`knip`/`component-set`/`token-audit` 0-neu; **keine DDL** (P3 ist migrationsfrei).
- **Koordination:** PR gegen `staging`, auf P0 rebased, mit `a6c863e2`/#4789 (release-runner/partner_provisionen) abgestimmt; offener Aaron-Entscheid (abrechnungsweg-Gate) im PR vermerkt; nicht selbst gemergt.

---

## Self-Review (durchgeführt beim Schreiben)

1. **Spec-Coverage:** Roadmap-P3 = „Seed claims/profiles.netzwerk_owner_id" → **T2/T3** ✓ · „Freundes-Graph-Suppression an Release-Zeit" → **T4/T5/T6** ✓. **K2/K13** (Release-Zeit, `completion-release-gate`/`release-runner`, **nicht** Inbound-INSERT/`hold_until`; nur `partner_provisionen`, `makler_fall_consent` behalten) → T4/T5 dockt am `runProvisionsRelease`-Release-Pass an; Trigger unangetastet → Consent bleibt. **K6** (profiles erst in `finalizeKundeSetup`; `entstanden_via`/`_aus_claim_id` NULL-Writer) → T3 nutzt den Origin-Claim als Anker. **„Makler = extern → feuert immer"** → `EXTERNE_PARTNER_TYPEN` (T1/T4). **„abrechnungsweg nicht enforced"** → T7 Schritt 2 als offener Aaron-Entscheid.
2. **Placeholder-Scan:** keine TBD/„handle edge cases" — DDL-frei (verifiziert: kein status-CHECK), alle Resolver/Pure-Logik/Batch/Seed-Hooks + Tests konkret; Anker per `grep` benannt.
3. **Typ-Konsistenz:** `resolveVermittlerOwnerProfil`/`resolveProvisionPartnerProfil`/`EXTERNE_PARTNER_TYPEN` (T1) ↔ `bestimmeIntraNetzwerkProvisionen`/`istIntraNetzwerk` (T4) ↔ `bestimmeUnterdrueckteProvisionen`/`unterdrueckt`/`ReleaseErgebnis` (T5) ↔ Cron-Wiring (T6) durchgängig; `ladeFreundKandidatIds(admin, ownerProfilId, 'gutachter'|'werkstatt')` = P0-Signatur; id-Räume (`sv_id`→`sachverstaendige.id`, `reparatur_werkstatt_id`→`werkstaetten.id`) FK-verifiziert 28.07.
4. **Verifiziert gegen prod (28.07., Ref `paizkjajbuxxksdoycev`):** Trigger-Bodies frisch (`pg_get_functiondef`), Trigger-Tabellen (werkstatt→`claims`, makler/flotte→`faelle_claim_bridge`), `partner_provisionen`-Struktur + **kein** status-CHECK, `firmen_flotte.partner_id = firma_id`, `create_werkstatt_provision` ohne abrechnungsweg-Gate, P0-Interfaces **noch nicht** vorhanden (→ T0-STOP-Gate).
- **Bewusst NICHT in P3** (andere Phasen): Boost-Verdrahtung/Badge (P2), SV-Vermittlungs-Flow/`sign-into-existing`/SV-Origin-Seed am Sofort-Claim-Pfad (P4), Stripe-Recurring/Grandfather (P5), fahrzeug-zentrisch/Netzwerkkarte (P6), abrechnungsweg-Gate am Werkstatt-Trigger (offener Aaron-Entscheid).
