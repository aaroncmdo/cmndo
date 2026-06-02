# Unisone Termin-Engine — Phase 2.3c (sageAb + verlege) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (oder executing-plans). Steps mit Checkbox (`- [ ]`). **0 DDL** (reiner Code). Eigener Worktree off staging (`npm ci` für TDD/Verify). Branch frisch aus staging.

**Goal:** Die restlichen Status-Transitions der Termin-State-Machine als assignee-generische Engine-Primitive: `sageAb` (Termin absagen), `verlege` (Termin verschieben — alt→verlegt + neuer Slot, race-sicher), `entscheideVerlegung` (pending bestätigen/ablehnen). Konsolidiert die **DB-State-Transitions** der AAR-864-Verlegungs-Maschine; Auth/Notifications/Route-Vorschläge bleiben im Consumer (Phase-3-Repoint).

**Architecture:** Reiner Code, eigene Datei `engine/state-transitions.ts`. Drei Result-Object-Ops. `verlege` ist **race-sicher über den P2.2-Constraint** (neuer Slot: 23P01 → Rollback des alt-Status). Alle drei **idempotent** (status-gegate Updates, `.eq('status', erwartet)`). **Kein** Auth (Caller prüft), **keine** Notifications (Caller/emitEvent), **kein** Fall-Storno/Billing (das ist `stornoFall`/`transitionFallStatus` — sageAb cancelt NUR den Termin). Nicht verdrahtet (Phase 3).

**Tech Stack:** TypeScript/Next.js 16, Vitest (injizierte db-Stubs), tsx-Verify. Build-Gate `npx tsc --noEmit`. **Keine Migration.**

---

## ⚠️ Koordination

- **Regel 1** PR gegen staging · **Regel 3** kein Stash. **0 DDL** → Regel 2 n/a.
- **Branch:** `kitta/termin-engine-p2-3c`, frisch aus `origin/staging` (hat P2.1+P2.2+P2.3a+P2.3b — alle gemergt). `bestaetige`/`reserviere` sind da; verlege braucht sie nicht direkt.
- **Engine-Constraint-Abhängigkeit:** `verlege` verlässt sich auf `gutachter_termine_no_assignee_overlap` (P2.2, live) für die Race-Sicherheit des neuen Slots.
- 7-Punkte-Audit je Commit. **[[Write-Tool </content>-Artefakt]]** nach jedem Write scannen.

---

## Live-Grounding (02.06.2026, verifiziert)

**AAR-864-Verlegungs-State-Machine** (aus `src/lib/actions/termin-verlegung-actions.ts`, der zu konsolidierende Consumer):
- **SV schlägt vor** (`terminVerlegungVorschlagen`): alt `bestaetigt`→`verlegt` (`.eq('status','bestaetigt')` Idempotenz) + `verlegung_grund`; neuer Slot INSERT `status='verlegung_pending'`, `verlegung_quelle_id=alt.id`, `verlegung_kunde_benachrichtigt_an=now`, kopiert sv_id/fall_id/claim_id/kb_id/kanal/typ. Bei Insert-Fehler: alt zurück auf `bestaetigt` (Rollback).
- **Kunde ist König** (`kundeTerminVerlegungVorschlagen`): neuer Slot sofort `status='bestaetigt'` + `verlegung_initiator_kunde=true`; alt `bestaetigt`→`verschoben`. (Free-Busy-Check via `istSlotFrei` vorab; bei belegt → Alternativen.)
- **Bestätigen** (`terminVerlegungBestaetigen`): neu `verlegung_pending`→`bestaetigt`; alt `verlegt`→`verschoben`+`cancelled_at`. Rollback bei Fehler.
- **Ablehnen** (`terminVerlegungAblehnen`): neu `verlegung_pending`→`storniert`+`cancelled_at`+`verlegung_grund`; alt `verlegt`→`bestaetigt`. Rollback-of-Rollback bei Fehler.
- Jede Action: Auth (`assertDarfVerlegungEntscheiden`), `emitEvent(...)` (fire-and-forget), `revalidatePath`, `touchClaimRecency`. **→ bleibt im Consumer.**

**Storno** (`src/lib/actions/storno-actions.ts`): `stornoFall`/`adminStornoFall`/`meldeNoShow` arbeiten **fall-level** (`transitionFallStatus(fallId,'storniert')` + `revertCaseBilling`) — NICHT termin-level. → `sageAb` ist die fehlende termin-level Cancel-Primitive (orthogonal zum Fall-Storno).

**Status-CHECK** (gutachter_termine): aktive (Constraint-WHERE) = `bestaetigt/reserviert/verlegt/verlegung_pending`; terminal/nicht-blockierend = `abgesagt/storniert/abgelehnt/abgeschlossen/sv_gesucht/gegenvorschlag/verschoben`. **Grund-Felder:** kein generisches `storno_grund` auf gutachter_termine (das lebt auf `auftraege`); termin-seitig: `ablehnungsgrund`, `verlegung_grund`, `abgelehnt_grund`. `cancelled_at` timestamptz. Normalize-Trigger (P2.2) füllt assignee aus sv_id bei jedem INSERT → der neue verlege-Slot ist assignee-konsistent.

---

## Design-Entscheidungen

1. **Drei Primitive, DB-Transitions only.** `sageAb`, `verlege` (propose, beide Modi), `entscheideVerlegung` (bestätigen/ablehnen) = exakt die DB-State-Übergänge der AAR-864-Actions. Auth/Notifications/Route-Vorschläge/Fall-Billing **bleiben im Consumer** — die Engine ist die Transitions-Schicht, nicht die Orchestrierung.
2. **`sageAb` ≠ Fall-Storno.** Cancelt nur den Termin (status `abgesagt` + `cancelled_at` + `ablehnungsgrund`). Fall-Storno/Billing-Rückbuchung ist `stornoFall`/`transitionFallStatus` (separate Ebene). Default-Status `abgesagt`; via opts auch `storniert`/`abgelehnt` (alle non-aktiv → Slot frei).
3. **`verlege` race-sicher + zwei Modi.** Neuer Slot via Constraint (23P01 → Rollback alt). `opts.neuerStatus` default `'verlegung_pending'` (SV-Flow); `'bestaetigt'` + `opts.initiatorKunde` für Kunde-König (alt dann → `verschoben` statt `verlegt`). Idempotenz: alt-Update `.eq('status', <aktiv-erwartet>)`.
4. **Idempotenz + Rollback** wie im Bestand (status-gegate Updates, bei Fehler revert). Result-Object `{ok}` / `{ok:false, code}`.
5. **Dual-Write Legacy nicht nötig** — `verlege` kopiert die Legacy-FKs (sv_id etc.) vom alt-Termin (wie AAR-864), Normalize-Trigger füllt assignee. Konsistent.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/lib/termine/engine/state-transitions.ts` | `sageAb`, `verlege`, `entscheideVerlegung` (Result-Object) | Create |
| `src/lib/termine/engine/state-transitions.test.ts` | Vitest mit injiziertem db-Stub (Status-Gates, Rollback-Pfade, Modi) | Create |
| `src/lib/termine/engine/index.ts` | Ops + Typen exportieren | Modify |
| `scripts/verify-engine-p2-3c-transitions.mts` | Live: verlege(propose)→pending+verlegt, entscheide(bestätigen)→bestaetigt+verschoben, sageAb→abgesagt+cancelled_at, verlege-Konflikt→belegt+Rollback. Cleanup | Create |

---

## Task 1: `sageAb` (Code, Subagent + TDD)

**Files:** Create `engine/state-transitions.ts` + `.test.ts`

- [ ] **Step 1: Tests** (injizierter db-Stub) — sageAb setzt status='abgesagt'+cancelled_at, idempotent (nur wenn aktiv), Result-Object.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementieren:**
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

const AKTIV = ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending'] as const
export type AbsageStatus = 'abgesagt' | 'storniert' | 'abgelehnt'

/** Cancelt EINEN Termin (status -> terminal + cancelled_at + Grund). NICHT Fall-Storno/Billing
 *  (das ist stornoFall/transitionFallStatus). Idempotent: nur wenn der Termin noch aktiv ist. */
export async function sageAb(
  terminId: string,
  opts?: { grund?: string; status?: AbsageStatus; db?: SupabaseClient },
): Promise<{ ok: true; terminId: string } | { ok: false; error: string; code: 'nicht_aktiv' | 'db' }> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const status = opts?.status ?? 'abgesagt'
  const patch: Record<string, unknown> = { status, cancelled_at: new Date().toISOString() }
  if (opts?.grund) patch.ablehnungsgrund = opts.grund
  const { data, error } = await db.from('gutachter_termine')
    .update(patch).eq('id', terminId).in('status', AKTIV as unknown as string[])
    .select('id')
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!data || data.length === 0) return { ok: false, error: 'Termin nicht (mehr) aktiv', code: 'nicht_aktiv' }
  return { ok: true, terminId }
}
```
- [ ] **Step 4: GREEN + Commit.**

---

## Task 2: `verlege` (Code, Subagent + TDD)

**Files:** Modify `state-transitions.ts` + `.test.ts`

- [ ] **Step 1: Tests** — propose-Modus (alt→verlegt, neu pending), kunde-König (neu bestaetigt, alt verschoben), 23P01→Rollback alt, alt-nicht-aktiv→Fehler.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementieren:**
```typescript
export interface VerlegeInput {
  neuVon: string; neuBis: string
  neuerStatus?: 'verlegung_pending' | 'bestaetigt' // default verlegung_pending (SV-Flow)
  initiatorKunde?: boolean
  grund?: string
  db?: SupabaseClient
}
export type VerlegeResult =
  | { ok: true; neuerTerminId: string }
  | { ok: false; error: string; code: 'alt_nicht_aktiv' | 'belegt' | 'db' }

/** Verschiebt einen Termin: alt -> 'verlegt' (bzw. 'verschoben' bei Kunde-Sofort) + neuer Slot
 *  (race-sicher via Constraint; 23P01 -> Rollback alt). Spiegelt AAR-864 terminVerlegung*Vorschlagen
 *  als reine DB-Transition (Auth/Notify = Caller). */
export async function verlege(terminId: string, input: VerlegeInput): Promise<VerlegeResult> {
  const db = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const neuerStatus = input.neuerStatus ?? 'verlegung_pending'
  const altNeuStatus = neuerStatus === 'bestaetigt' ? 'verschoben' : 'verlegt'

  const { data: alt, error: ladeErr } = await db.from('gutachter_termine')
    .select('id, sv_id, sv_lead_id, fall_id, claim_id, kb_id, kanal, typ, status')
    .eq('id', terminId).maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message, code: 'db' }
  if (!alt || !(AKTIV as unknown as string[]).includes(alt.status as string))
    return { ok: false, error: 'Quell-Termin nicht aktiv', code: 'alt_nicht_aktiv' }

  // 1) alt umschalten (idempotenz-gegate)
  const { data: altUpd, error: altErr } = await db.from('gutachter_termine')
    .update({ status: altNeuStatus, verlegung_grund: input.grund ?? null,
              ...(input.initiatorKunde ? { verlegung_initiator_kunde: true } : {}) })
    .eq('id', alt.id).eq('status', alt.status as string).select('id')
  if (altErr) return { ok: false, error: altErr.message, code: 'db' }
  if (!altUpd || altUpd.length === 0) return { ok: false, error: 'Quell-Termin race', code: 'alt_nicht_aktiv' }

  // 2) neuen Slot anlegen (race-sicher via Constraint)
  const { data: neu, error: insErr } = await db.from('gutachter_termine').insert({
    sv_id: alt.sv_id, sv_lead_id: alt.sv_lead_id, fall_id: alt.fall_id, claim_id: alt.claim_id,
    kb_id: alt.kb_id, kanal: alt.kanal, typ: alt.typ ?? 'sv_begutachtung',
    start_zeit: input.neuVon, end_zeit: input.neuBis, status: neuerStatus,
    verlegung_quelle_id: alt.id, verlegung_grund: input.grund ?? null,
    ...(input.initiatorKunde ? { verlegung_initiator_kunde: true } : {}),
  }).select('id').single()
  if (insErr || !neu) {
    // Rollback alt
    await db.from('gutachter_termine').update({ status: alt.status as string, verlegung_grund: null }).eq('id', alt.id)
    if (insErr?.code === '23P01') return { ok: false, error: 'Neuer Slot belegt', code: 'belegt' }
    return { ok: false, error: insErr?.message ?? 'Insert fehlgeschlagen', code: 'db' }
  }
  return { ok: true, neuerTerminId: neu.id as string }
}
```
- [ ] **Step 4: GREEN + Commit.**

---

## Task 3: `entscheideVerlegung` (Code, Subagent + TDD)

**Files:** Modify `state-transitions.ts` + `.test.ts` + `index.ts`

- [ ] **Step 1: Tests** — bestätigen (pending→bestaetigt, alt verlegt→verschoben+cancelled_at), ablehnen (pending→storniert+cancelled_at, alt verlegt→bestaetigt), pending-Guard, Rollback.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementieren:**
```typescript
/** Entscheidet eine pending Verlegung. bestätigen: neu->bestaetigt, alt(verlegt)->verschoben+cancelled.
 *  ablehnen: neu->storniert+cancelled, alt(verlegt)->bestaetigt (Rollback). Spiegelt AAR-864
 *  terminVerlegungBestaetigen/Ablehnen (Auth = Caller). */
export async function entscheideVerlegung(
  neuerTerminId: string, entscheidung: 'bestaetigen' | 'ablehnen',
  opts?: { grund?: string; db?: SupabaseClient },
): Promise<{ ok: true } | { ok: false; error: string; code: 'nicht_pending' | 'db' }> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { data: neu, error: ladeErr } = await db.from('gutachter_termine')
    .select('id, status, verlegung_quelle_id').eq('id', neuerTerminId).maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message, code: 'db' }
  if (!neu || neu.status !== 'verlegung_pending' || !neu.verlegung_quelle_id)
    return { ok: false, error: 'Slot nicht im Status verlegung_pending', code: 'nicht_pending' }

  const now = new Date().toISOString()
  if (entscheidung === 'bestaetigen') {
    const { data: u1, error: e1 } = await db.from('gutachter_termine')
      .update({ status: 'bestaetigt' }).eq('id', neu.id).eq('status', 'verlegung_pending').select('id')
    if (e1) return { ok: false, error: e1.message, code: 'db' }
    if (!u1 || u1.length === 0) return { ok: false, error: 'race', code: 'nicht_pending' }
    const { error: e2 } = await db.from('gutachter_termine')
      .update({ status: 'verschoben', cancelled_at: now }).eq('id', neu.verlegung_quelle_id).eq('status', 'verlegt')
    if (e2) { await db.from('gutachter_termine').update({ status: 'verlegung_pending' }).eq('id', neu.id); return { ok: false, error: e2.message, code: 'db' } }
    return { ok: true }
  } else {
    const { data: u1, error: e1 } = await db.from('gutachter_termine')
      .update({ status: 'storniert', cancelled_at: now, verlegung_grund: opts?.grund ?? null })
      .eq('id', neu.id).eq('status', 'verlegung_pending').select('id')
    if (e1) return { ok: false, error: e1.message, code: 'db' }
    if (!u1 || u1.length === 0) return { ok: false, error: 'race', code: 'nicht_pending' }
    const { error: e2 } = await db.from('gutachter_termine')
      .update({ status: 'bestaetigt' }).eq('id', neu.verlegung_quelle_id).eq('status', 'verlegt')
    if (e2) { await db.from('gutachter_termine').update({ status: 'verlegung_pending', cancelled_at: null }).eq('id', neu.id); return { ok: false, error: e2.message, code: 'db' } }
    return { ok: true }
  }
}
```
- [ ] **Step 4: GREEN + tsc.** `index.ts`: `sageAb`/`verlege`/`entscheideVerlegung` + Typen (`AbsageStatus`,`VerlegeInput`,`VerlegeResult`) exportieren. **Commit.**

---

## Task 4: Live-Verify (Controller)

**Files:** Create `scripts/verify-engine-p2-3c-transitions.mts` (Muster verify-engine-belegung.mts)

- [ ] **Step 1: Script** — gegen Live-DB (real sv, dual-write assignee_id+sv_id im Insert für validate-Trigger):
  - insert alt `bestaetigt` (2099-Fenster) → `verlege(alt, {neuVon, neuBis})` → `{ok, neuerTerminId}`; DB: alt status='verlegt', neu status='verlegung_pending' + verlegung_quelle_id==alt.
  - `entscheideVerlegung(neu,'bestaetigen')` → DB: neu='bestaetigt', alt='verschoben'+cancelled_at.
  - `sageAb(neu)` → DB: neu='abgesagt'+cancelled_at.
  - **Konflikt-Test:** zwei bestaetigt-Termine A,B (verschiedene Fenster); `verlege(A, B-Fenster)` → `{ok:false, code:'belegt'}` (Constraint) + A bleibt 'bestaetigt' (Rollback).
  - Cleanup try/finally (alle terminIds). VERDICT GRUEN nur wenn alle Transitions + Rollback stimmen. **Fallback:** SQL-DO-Block wie P2.2/P2.3a, falls tsx-Infra hakt.
- [ ] **Step 2: Ausführen** → VERDICT GRUEN. **Commit.**

---

## Task 5: Build-Gate + PR

- [ ] `npm ci` + `npx tsc --noEmit` + `npx vitest run src/lib/termine/engine/` grün. git clean/stash leer. `git push -u origin kitta/termin-engine-p2-3c` + `gh pr create --base staging` (Body: Audit + Verify-VERDICT + „Primitive für AAR-864-Transitions; Auth/Notify bleiben Consumer; nicht verdrahtet").

---

## Self-Review

**Spec-Coverage (Handoff P2.3 — sageAb + verlege):** `sageAb` (Termin-Cancel) ✓; `verlege` (propose, beide Modi, race-sicher) ✓; `entscheideVerlegung` (bestätigen/ablehnen) ✓ = vollständige AAR-864-DB-State-Machine als Engine-Primitive. **Bewusst Consumer/Phase-3:** Auth (`assertDarfVerlegungEntscheiden`), Notifications (`emitEvent`), Route-Vorschläge (`findVerlegungsVorschlaege`), Fall-Storno/Billing (`stornoFall`/`revertCaseBilling`), `touchClaimRecency`, `revalidatePath`.

**Typ-Konsistenz:** Status-Werte == CHECK; AKTIV-Set == Constraint-WHERE; Transitions bit-gleich zu AAR-864 (alt verlegt/verschoben, neu pending/bestaetigt/storniert + cancelled_at). verlege kopiert Legacy-FKs → Normalize-Trigger füllt assignee.

**Risiko:** reiner Code, 0 DDL, 0 Consumer (nicht verdrahtet). verlege race-sicher via P2.2-Constraint + Rollback. Idempotenz via status-gegate Updates (wie Bestand). Kein Auth in der Engine — Caller MUSS weiter prüfen (im PR-Body + beim Phase-3-Repoint betonen, damit die Guards nicht verloren gehen — vgl. [[RLS-Function-Grants verlieren sich]]-Klasse Lesson).

---

## Roadmap (danach)
- **P2.4** `findeBestePerson` (Org-Dedup #2232 merged) · **P2.5** `syncTerminToExternalCalendar`.
- **Phase 3** Consumer-Repoint: termin-verlegung-actions.ts → verlege/entscheideVerlegung (Auth/Notify behalten!), storno → sageAb (+ Fall-Storno separat), bestaetigeTermin → bestaetige (+ Notifier), reserviereSlot → reserviere (fixt typ:'vor_ort'), cache-busy → v_belegung, dann sv_id/lead_id-Kompat-Drop + Normalize-Trigger weg.
