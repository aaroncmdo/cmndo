# Payment-Ledger-Normalisierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die claim-native Geld-Schicht in einen kanonischen `claim_payments`-Ledger (1 Zeile pro `(claim_id, partei)`, partei vs/kunde/sv) normalisieren; Views leiten Aggregate ab; Alt-Spalten uebergangsweise synced Caches -> grep-gegated Drop.

**Architecture:** Additive Schema-Foundation -> ein `upsertClaimPayment(partei)`-Write-Seam (Ledger) parallel zu den bestehenden Cache-Writes (Dual-Write auf System-Ebene) -> Pivot-View + Reader-Switch (snapshot-verifiziert) -> Cache-Drop. Jede Phase = 1 PR gegen `staging`, byte-genaue Golden-Abrechnungstests durchgehend gruen.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + supabase-js), TypeScript, Vitest. Prod-DB `paizkjajbuxxksdoycev`.

## Global Constraints

- **Regel 2 (DDL):** Schema-Aenderungen NUR via `mcp__plugin_supabase_supabase__apply_migration`. NIE CLI `db push` / raw `execute_sql` mit DDL. `execute_sql` nur READ. Nach jeder Migration: `list_migrations` -> die getrackte Version `<V>` ablesen -> Migration-File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == getrackte Version). Types via `generate_typescript_types` regen (oder aufschieben bis ein Consumer die Spalte nutzt).
- **Regel 3 (Drop):** Cache-Spalten droppen nur nach grep-verifizierter Reader-Migration (0 direkte Reader). Kein unbegleiteter Stash am Session-Ende. Jede Phase eigener PR gegen `staging`, nie direkt auf `main`.
- **Golden-Tests durchgehend gruen:** `descriptors/*.golden.test.ts`, `process-case-billing.test.ts`, `eligibility.test.ts`, `subphase-resolver.test.ts` — die fakturierten Betraege muessen byte-identisch bleiben (einzige gewollte Ausnahme: `auszahlung_kunde_*` NULL->echt in Phase 2).
- **Build:** `npx tsc --noEmit` lokal OOM (shared node_modules, viele Sessions) -> CI ist autoritativ. Vitest je Datei laeuft lokal.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, kein `throw` (Ausnahme: `upsertCurrentClaimPayment`-Caller in state-machine wirft heute -> Muster beibehalten wo vorhanden).
- **Umlaute:** nur Frontend-Strings; Backend/Comments/SQL ASCII erlaubt.
- **Seam ist reine Funktion** (kein `'use server'`), importierbar von state-machine / process-event / server-actions.

---

## File Structure

- `supabase/migrations/<V>_claim_payments_partei_richtung.sql` — Phase 0 Schema (neu)
- `src/lib/faelle/claim-payments.ts` — Seam: neu `upsertClaimPayment(partei)`, spaeter `getClaimPayments`; `upsertCurrentClaimPayment` bleibt bis alle Caller migriert (modifizieren)
- `src/lib/faelle/claim-payments.test.ts` — Seam-Tests (neu)
- `src/lib/faelle/state-machine.ts:244-249` — cp-Write auf Seam (modifizieren)
- `src/app/faelle/[id]/_actions/kanzlei-paket.ts` — `erfasseZahlungseingang` cp-Write auf Seam (modifizieren)
- `src/lib/lexdrive/process-event.ts` — cp-Writes (VS + auszahlung_split kunde/sv) auf Seam (modifizieren)
- `src/lib/claims/endzustand-actions.ts` — `markClaimAsReguliert` vs-Ledger-Write ergaenzen (modifizieren)
- `src/app/faelle/[id]/_actions/stammdaten.ts` — `updateFallField`-Routing `auszahlung_kunde_*`/`auszahlung_gutachter_*` -> Seam (modifizieren)
- Phase 2: neue View `v_claim_payments` + Haupt-Views (via apply_migration), `getClaimPayments`-Read-Seam, subphase-resolver + finance-Reader
- Phase 3: Cache-Drop-Migration + Entfernen der Caller-Cache-Writes

---

## PHASE 0 — Schema-Foundation (rein additiv, 0 Verhalten)

### Task 0.1: `partei` + `richtung` + Unique-Index auf `claim_payments`

**Files:**
- Create: `supabase/migrations/<V>_claim_payments_partei_richtung.sql`

**Interfaces:**
- Produces: Spalten `claim_payments.partei` (`'vs'|'kunde'|'sv'`, NOT NULL DEFAULT `'vs'`), `claim_payments.richtung` (`'eingang'|'auszahlung'`, NOT NULL DEFAULT `'eingang'`), Unique-Index `(claim_id, partei)`.

- [ ] **Step 1: Pre-Check — 0 Duplikate `(claim_id, empfaenger)`**

`execute_sql` (READ):
```sql
select claim_id, count(*) from claim_payments group by claim_id having count(*) > 1;
```
Expected: 0 Zeilen (pre-launch 1 Row total). Falls Zeilen: STOP, erst dedupen (nicht Teil dieses Plans -> zurueck an Aaron).

- [ ] **Step 2: Migration anwenden via Plugin**

`apply_migration({ name: "claim_payments_partei_richtung", query: <DDL> })` mit:
```sql
ALTER TABLE public.claim_payments
  ADD COLUMN partei text NOT NULL DEFAULT 'vs'
    CHECK (partei IN ('vs','kunde','sv')),
  ADD COLUMN richtung text NOT NULL DEFAULT 'eingang'
    CHECK (richtung IN ('eingang','auszahlung'));

-- Bestehende Rows sind VS-Eingaenge (COMMENT: "Zahlungseingaenge vom Versicherer").
-- ADD COLUMN NOT NULL DEFAULT setzt sie bereits auf vs/eingang; UPDATE nur zur Klarheit no-op.

CREATE UNIQUE INDEX claim_payments_claim_partei_uidx
  ON public.claim_payments (claim_id, partei);

COMMENT ON COLUMN public.claim_payments.partei IS
  'Geldbewegungs-Partei: vs (VS-Eingang) | kunde (Auszahlung) | sv (Honorar-Auszahlung). Ersetzt das tote empfaenger-Split-Schema.';
```
Hinweis: ADD COLUMN mit konstantem DEFAULT = metadata-only (kein Rewrite), 1 Row -> instant.

- [ ] **Step 3: Getrackte Version ablesen**

`list_migrations` -> die vom Plugin vergebene Version `<V>` notieren (eigener Timestamp).

- [ ] **Step 4: Migration-File committen (Name == getrackte Version)**

Datei `supabase/migrations/<V>_claim_payments_partei_richtung.sql` mit exakt dem DDL aus Step 2 anlegen.
```bash
git add supabase/migrations/<V>_claim_payments_partei_richtung.sql
git commit -m "feat(payment): Phase 0 — claim_payments.partei/richtung + unique(claim_id,partei)"
```

- [ ] **Step 5: Verifizieren (READ)**

`execute_sql`:
```sql
select column_name, is_nullable, column_default from information_schema.columns
where table_schema='public' and table_name='claim_payments' and column_name in ('partei','richtung');
select partei, richtung, count(*) from claim_payments group by 1,2;
```
Expected: partei/richtung NOT NULL mit Defaults; alle Rows partei='vs', richtung='eingang'.

- [ ] **Step 6: Types regen**

`generate_typescript_types` -> `src/lib/supabase/database.types.ts` aktualisieren. (ACHTUNG: geteilte Datei mit anderen Sessions — nur den `claim_payments`-Diff uebernehmen, nicht fremde Aenderungen ueberschreiben; Konflikt-Hook beachtet.)
```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(payment): regen types nach claim_payments.partei/richtung"
```

**Phase-0-Ende:** Rein additiv, kein Code-Pfad geaendert. Golden unberuehrt (kein Consumer). Alter `upsertCurrentClaimPayment` inserted weiter ohne partei -> faellt auf DEFAULT 'vs' (korrekt, alle heutigen Caller sind VS-Eingaenge). PR gegen `staging`.

---

## PHASE 1 — Write-Seam `upsertClaimPayment(partei)` + Ledger-Fuellung (verhaltensneutral)

**Ansatz (Refinement der Spec):** Supabase-JS kann keine Multi-Table-Transaktion. Daher: der Seam schreibt NUR die Ledger-Zeile. Die bestehenden Cache-Writes der Caller (`claims.regulierungs_betrag`, `claims.auszahlung_gutachter_*`) bleiben in Phase 1 UNVERAENDERT — der Ledger wird PARALLEL gefuellt. Reader lesen weiter Caches -> verhaltensneutral. Der „Collapse" (Caller-Cache-Writes entfernen) passiert in Phase 3 mit dem Drop.

### Task 1.1: Seam `upsertClaimPayment` (TDD)

**Files:**
- Modify: `src/lib/faelle/claim-payments.ts`
- Test: `src/lib/faelle/claim-payments.test.ts` (neu)

**Interfaces:**
- Produces:
  ```ts
  export type Partei = 'vs' | 'kunde' | 'sv'
  export type ClaimPaymentFields = {
    forderungsbetrag?: number | null
    erhaltener_betrag?: number | null
    zahlungseingang_am?: string | null
    zahlungsweg?: string | null
    status?: 'ausstehend' | 'teilweise' | 'erhalten' | 'final' | 'abgelehnt'
  }
  export async function upsertClaimPayment(
    db: DbClient, claimId: string, partei: Partei,
    fields: ClaimPaymentFields, createdByUserId?: string | null,
  ): Promise<{ ok: boolean; error?: string }>
  ```

- [ ] **Step 1: Failing Test schreiben**

`src/lib/faelle/claim-payments.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { upsertClaimPayment } from './claim-payments'

// Minimaler Fake-Supabase-Client, der die Aufrufe aufzeichnet.
function fakeDb(existingId: string | null) {
  const calls: any = { inserted: null, updated: null, selectedEq: {} as Record<string, unknown> }
  const builder: any = {
    select() { return builder },
    eq(col: string, val: unknown) { calls.selectedEq[col] = val; return builder },
    maybeSingle() { return Promise.resolve({ data: existingId ? { id: existingId } : null, error: null }) },
    update(patch: unknown) { calls.updated = patch; return { eq() { return Promise.resolve({ error: null }) } } },
    insert(row: unknown) { calls.inserted = row; return Promise.resolve({ error: null }) },
  }
  return { from: () => builder, _calls: calls } as any
}

describe('upsertClaimPayment', () => {
  it('inserts a new sv-row with richtung=auszahlung + partei filter on select', async () => {
    const db = fakeDb(null)
    const res = await upsertClaimPayment(db, 'claim-1', 'sv',
      { erhaltener_betrag: 300, zahlungseingang_am: '2026-07-07' }, 'user-1')
    expect(res.ok).toBe(true)
    expect(db._calls.selectedEq.claim_id).toBe('claim-1')
    expect(db._calls.selectedEq.partei).toBe('sv')
    expect(db._calls.inserted).toMatchObject({
      claim_id: 'claim-1', partei: 'sv', richtung: 'auszahlung',
      erhaltener_betrag: 300, zahlungseingang_am: '2026-07-07', created_by_user_id: 'user-1',
    })
  })

  it('updates the existing (claim,partei) row instead of inserting, sets richtung=eingang for vs', async () => {
    const db = fakeDb('row-9')
    const res = await upsertClaimPayment(db, 'claim-1', 'vs', { erhaltener_betrag: 5000 })
    expect(res.ok).toBe(true)
    expect(db._calls.inserted).toBeNull()
    expect(db._calls.updated).toMatchObject({ erhaltener_betrag: 5000, richtung: 'eingang' })
  })
})
```

- [ ] **Step 2: Test laufen — muss FAILen**

Run: `npx vitest run src/lib/faelle/claim-payments.test.ts`
Expected: FAIL — `upsertClaimPayment is not a function` / not exported.

- [ ] **Step 3: Seam implementieren**

In `src/lib/faelle/claim-payments.ts` ergaenzen (nach `upsertCurrentClaimPayment`, das vorerst bleibt):
```ts
export type Partei = 'vs' | 'kunde' | 'sv'
export type ClaimPaymentFields = {
  forderungsbetrag?: number | null
  erhaltener_betrag?: number | null
  zahlungseingang_am?: string | null
  zahlungsweg?: string | null
  status?: 'ausstehend' | 'teilweise' | 'erhalten' | 'final' | 'abgelehnt'
}

/**
 * Kanonischer Write-Seam: schreibt die (claim_id, partei)-Ledger-Zeile (create-or-update
 * via unique(claim_id,partei)). richtung wird aus partei abgeleitet. Ersetzt schrittweise
 * upsertCurrentClaimPayment (das newest-row-blind + empfaenger-agnostisch war).
 */
export async function upsertClaimPayment(
  db: DbClient,
  claimId: string,
  partei: Partei,
  fields: ClaimPaymentFields,
  createdByUserId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const richtung = partei === 'vs' ? 'eingang' : 'auszahlung'
  const { data: current, error: selErr } = await db
    .from('claim_payments')
    .select('id')
    .eq('claim_id', claimId)
    .eq('partei', partei)
    .maybeSingle()
  if (selErr) return { ok: false, error: selErr.message }

  if (current?.id) {
    const { error } = await db.from('claim_payments').update({ ...fields, richtung }).eq('id', current.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await db
      .from('claim_payments')
      .insert({ claim_id: claimId, partei, richtung, ...fields, created_by_user_id: createdByUserId ?? null })
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Test laufen — muss PASSen**

Run: `npx vitest run src/lib/faelle/claim-payments.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/faelle/claim-payments.ts src/lib/faelle/claim-payments.test.ts
git commit -m "feat(payment): Phase 1 — upsertClaimPayment(partei) Ledger-Seam (TDD)"
```

### Task 1.2: VS-Eingang-Writer auf den Seam (state-machine + process-event + kanzlei-paket)

**Files:**
- Modify: `src/lib/faelle/state-machine.ts:244-249`
- Modify: `src/lib/lexdrive/process-event.ts` (die `upsertCurrentClaimPayment`-Calls, Survey: ~915/931)
- Modify: `src/app/faelle/[id]/_actions/kanzlei-paket.ts` (`erfasseZahlungseingang`, cp-Write Survey :387)

**Interfaces:**
- Consumes: `upsertClaimPayment` (Task 1.1).

- [ ] **Step 1: state-machine.ts — Swap auf Seam**

In `src/lib/faelle/state-machine.ts` den Block bei `newStatus === 'zahlung-eingegangen'` (Z.244-249): `upsertCurrentClaimPayment(db, claimId, cpFields, ...)` ersetzen durch:
```ts
    const cpResult = await upsertClaimPayment(db, claimId, 'vs', cpFields, metadata?.user_id ?? null)
```
Import oben von `upsertCurrentClaimPayment` auf `upsertClaimPayment` umstellen (Typ `ClaimPaymentRerouteFields` -> `ClaimPaymentFields`, feldgleich). Der Caller-Cache (`claims.regulierungs_betrag`, in `recordZahlung` gesetzt) bleibt unberuehrt.

- [ ] **Step 2: process-event.ts — Swap der VS-cp-Writes auf Seam**

Jeden `upsertCurrentClaimPayment(...)`-Call, der einen VS-Zahlungseingang schreibt, auf `upsertClaimPayment(db, claimId, 'vs', <selbe fields>, <userId>)` umstellen. (Zuerst den aktuellen Block lesen — Survey nennt ~915/931 — und die exakten `fields` uebernehmen.)

- [ ] **Step 3: kanzlei-paket.ts `erfasseZahlungseingang` — cp-Write auf Seam**

Den `upsertCurrentClaimPayment`-Call in `erfasseZahlungseingang` (Survey :387, schreibt nur `zahlungseingang_am`+`status`) auf `upsertClaimPayment(db, claimId, 'vs', { zahlungseingang_am, status }, userId)` umstellen. `zahlungseingaenge`/`zahlungspositionen`-Write + `claims.regulierungs_betrag` bleiben unveraendert.

- [ ] **Step 4: Build/Typecheck (CI-autoritativ) + betroffene Vitest**

Run: `npx vitest run src/lib/faelle` (+ ggf. process-event/kanzlei-paket-Tests falls vorhanden). Expected: gruen. Lokaler tsc kann OOMen -> CI.

- [ ] **Step 5: Commit**
```bash
git add src/lib/faelle/state-machine.ts src/lib/lexdrive/process-event.ts "src/app/faelle/[id]/_actions/kanzlei-paket.ts"
git commit -m "feat(payment): Phase 1 — VS-Eingang-Writer auf upsertClaimPayment('vs')"
```

### Task 1.3: Auszahlungs-Writer auf den Seam (Kunde + SV)

**Files:**
- Modify: `src/lib/lexdrive/process-event.ts` (auszahlung_split, Survey :304-315)
- Modify: `src/app/faelle/[id]/_actions/stammdaten.ts` (`updateFallField`-Routing fuer `auszahlung_kunde_*` / `auszahlung_gutachter_*`)

**Interfaces:**
- Consumes: `upsertClaimPayment` (Task 1.1).

- [ ] **Step 1: process-event auszahlung_split — Kunde+SV Ledger-Writes ergaenzen**

Im `auszahlung_split_eingegangen`-Handler (Survey :304-315): NACH den bestehenden Writes (`auszahlung_gutachter_*` Cache auf claims bleibt; `auszahlung_kunde_*` war tot) ergaenzen:
```ts
  // Ledger (Phase 1): Kunde-Auszahlung bekommt endlich einen echten Home; SV parallel zum Cache.
  if (claimIdForUpdates && kundeBetragOderDatum) {
    await upsertClaimPayment(db, claimIdForUpdates, 'kunde',
      { erhaltener_betrag: <kundeBetrag>, zahlungseingang_am: <kundeDatum> }, <userId>)
  }
  if (claimIdForUpdates && svDatum) {
    await upsertClaimPayment(db, claimIdForUpdates, 'sv',
      { erhaltener_betrag: <svBetrag>, zahlungseingang_am: <svDatum> }, <userId>)
  }
```
(Die exakten Feldnamen aus dem aktuellen Handler-Block uebernehmen.)

- [ ] **Step 2: updateFallField-Routing — auszahlung_kunde_* / auszahlung_gutachter_* -> Seam**

In `src/app/faelle/[id]/_actions/stammdaten.ts` im `updateFallField`-Routing einen Zweig ergaenzen, der `auszahlung_kunde_betrag`/`auszahlung_kunde_eingegangen_am` -> `upsertClaimPayment(db, claimId, 'kunde', {...})` und `auszahlung_gutachter_betrag`/`_eingegangen_am` -> `upsertClaimPayment(db, claimId, 'sv', {...})` schreibt. Das `auszahlung_gutachter_*`-Cache-Write auf `claims` bleibt (bis Phase 3); `auszahlung_kunde_*` hatte kein Ziel -> jetzt Ledger.

- [ ] **Step 3: Vitest fuer betroffene Bereiche**

Run: `npx vitest run src/lib/lexdrive` (+ stammdaten-Tests falls vorhanden). Expected: gruen.

- [ ] **Step 4: Commit**
```bash
git add src/lib/lexdrive/process-event.ts "src/app/faelle/[id]/_actions/stammdaten.ts"
git commit -m "feat(payment): Phase 1 — Auszahlungs-Writer (kunde/sv) auf upsertClaimPayment"
```

### Task 1.4: `markClaimAsReguliert` VS-Ledger-Write ergaenzen

**Files:**
- Modify: `src/lib/claims/endzustand-actions.ts` (`markClaimAsReguliert`, ~176-228)

- [ ] **Step 1:** Nach dem erfolgreichen `setEndzustandFields(... regulierungs_betrag ...)` in `markClaimAsReguliert` ergaenzen:
```ts
  await upsertClaimPayment(createAdminClient(), input.claim_id, 'vs',
    { forderungsbetrag: input.regulierungs_betrag }, auth.user.id)
```
Der bestehende `regulierungs_betrag`-Cache-Write (in `setEndzustandFields`) bleibt.

- [ ] **Step 2: Commit**
```bash
git add src/lib/claims/endzustand-actions.ts
git commit -m "feat(payment): Phase 1 — markClaimAsReguliert schreibt vs-Ledger (forderungsbetrag)"
```

### Task 1.5: Dual-Write-Reconciliation verifizieren

- [ ] **Step 1:** Nach einem Test-Flow (Test-Claim durch zahlung-eingegangen) `execute_sql` (READ):
```sql
select c.id, c.regulierungs_betrag as cache_soll,
       p.erhaltener_betrag as ledger_vs_ist, p.forderungsbetrag as ledger_vs_soll
from claims c
join claim_payments p on p.claim_id = c.id and p.partei='vs'
where c.regulierungs_betrag is not null
limit 20;
```
Expected: Ledger-vs-Zeile existiert fuer jeden Claim mit `regulierungs_betrag`; Betraege konsistent. Diskrepanzen dokumentieren (nicht droppen — Phase 3 haengt daran).

**Phase-1-Ende:** Ledger wird parallel gefuellt, Reader lesen weiter Caches -> verhaltensneutral. Golden unberuehrt. PR gegen `staging`. (Grosse Phase, aber jeder Task isoliert testbar.)

---

## PHASE 2 — Pivot-View + Reader-Switch (Meilenstein, snapshot-verifiziert)

**Ziel:** Reader lesen Payment-Felder aus dem Ledger statt aus Cache/`NULL`. `auszahlung_kunde_*` wird echt.

Kern-Schritte:
1. **`apply_migration` `v_claim_payments`** — Pivot-View: pro `claim_id` die Spalten `vs_soll/vs_ist/vs_am`, `kunde_soll/kunde_ist/kunde_am`, `sv_soll/sv_ist/sv_am` + Status (via `MAX(CASE WHEN partei=... THEN ... END)` gruppiert).
2. **Baseline-Snapshot (READ, VOR den View-Aenderungen):** die Payment-Spalten der Haupt-Views fuer eine Sample-Menge Claims dumpen (JSON), als Vergleichsbasis.
3. **`apply_migration` Haupt-Views** (`v_claim_base`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`): die Payment-Felder per LATERAL-Join auf `v_claim_payments` ableiten statt aus Cache-Spalten / hardcoded `NULL`. Role-Gates (`rolle_sieht_regulierung`/`_margen`) + partei-Gating (`faelle_kunde_view` nur kunde) beibehalten. Migration-File == getrackte Version (Regel 2).
4. **After-Snapshot + Assert:** dieselben Sample-Claims; byte-Gleichheit ggue. Baseline ASSERTEN — Ausnahme nur `auszahlung_kunde_*` (NULL->echt). Diskrepanz = STOP.
5. **Read-Seam `getClaimPayments(db, claimId) -> {vs, kunde, sv}`** (TDD) + Migration der Reader `src/lib/finance/fall-finanzen.ts`, `autoPhase`, `abrechnung/kanzlei/eligibility.ts` auf per-partei.
6. **subphase-resolver Phase 8** (`src/lib/fall/subphase-resolver.ts:226-239`) auf die neuen View-Felder — der Kunde-Trigger wird aktiv (gewollt) -> `subphase-resolver.test.ts` anpassen (RED->GREEN).
7. **UI-Reader** (`AuszahlungCard`, `SvHonorarCard`, `Sections.tsx` AuszahlungSection) lesen die jetzt echten View-Felder — meist 0-diff.
8. **Golden-Tests** je Schritt gruen. Types regen. PR gegen `staging`.

---

## PHASE 3 — Cache-Drop (Meilenstein, grep-gegated · Regel 3)

1. **Grep-Gate:** `grep -rn "regulierungs_betrag\|auszahlung_gutachter_betrag\|auszahlung_gutachter_eingegangen_am" src/` -> nur noch Seam + Views + Caller-Cache-Writes (die jetzt entfallen). 0 echte Reader.
2. **Caller-Cache-Writes entfernen:** in `recordZahlung`/`erfasseZahlungseingang`/`markClaimAsReguliert`/process-event die direkten `claims.regulierungs_betrag` / `claims.auszahlung_gutachter_*`-Writes streichen (der Seam ist jetzt alleiniger Payment-Writer -> „4-fach-Write kollabiert" final).
3. **`apply_migration`:** Cache-Spalten `claims.regulierungs_betrag`, `claims.auszahlung_gutachter_betrag`, `claims.auszahlung_gutachter_eingegangen_am` droppen; Views referenzieren sie nicht mehr. Migration-File == getrackte Version.
4. **Golden-Tests gruen** (Werte weiter Ledger-abgeleitet, gleich). Types regen. PR gegen `staging`.

---

## PHASE 4 — Cleanup (Meilenstein, optional)

1. `regulierung_betrag`-Alias-Dedup (der role-gated View-Alias auf die jetzt Ledger-abgeleitete Quelle vereinheitlichen; Code-Reader auf einen Namen).
2. Totes `empfaenger`-Split-Schema entfernen (`claim_payments.empfaenger` + `claim_payments_empfaenger_check` droppen; `upsertCurrentClaimPayment` loeschen wenn 0 Consumer).
3. Doku/Kommentare aktualisieren (SP-J-Reroute-Kommentare -> Ledger-Modell).

---

## Self-Review

**Spec-Coverage:** Modell (Task 0.1 + 1.1), Read-Pfad/Pivot-View (Phase 2), Write-Seam/4-fach-Collapse (Phase 1 fuellt, Phase 3 collapsed), Migration-Phasen (0-4 abgebildet), Golden-Tests (Global Constraints + je Phase), Scope-Grenzen (Phase-4 nur empfaenger, Provisions-Ledger unberuehrt). Kein Spec-Abschnitt ohne Task.

**Placeholder-Scan:** Phase 0 + Task 1.1 vollstaendig (DDL + Code + Tests konkret). Phase 1.2/1.3 nennen exakte file:line + die Ziel-`upsertClaimPayment`-Signatur; die `<...>`-Felder sind bewusste Verweise auf den aktuellen Handler-Block (der Implementer liest die exakten Feldnamen dort) — kein erfundener Typ. Phasen 2-4 sind bewusst Meilensteine (Aaron-Vorgabe „gröbere Meilensteine"), werden vor Ausfuehrung je in einen eigenen Bite-Sized-Plan aufgeloest.

**Typ-Konsistenz:** `upsertClaimPayment(db, claimId, partei, fields, userId)` + `Partei`/`ClaimPaymentFields` einheitlich ueber alle Tasks. `ClaimPaymentFields` ist feldgleich zum bestehenden `ClaimPaymentRerouteFields` (forderungsbetrag/erhaltener_betrag/zahlungseingang_am/zahlungsweg/status) -> Swap in state-machine bruchfrei.
