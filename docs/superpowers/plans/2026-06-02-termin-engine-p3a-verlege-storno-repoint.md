# Phase 3a — Verlegungs-Repoint + storno-cancelt-Termin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 4 Verlegungs-Server-Actions auf die Engine-Primitive `verlege`/`entscheideVerlegung` repointen (DB-Transitions wandern in die Engine, Auth/Notifications/Vorschläge/revalidate BLEIBEN), und das neue Verhalten „Fall-Storno cancelt den offenen Termin" via `sageAb` ergänzen.

**Architecture:** Reiner Consumer-Repoint — die Engine-Funktionen (P2.3c, gemerged) ersetzen handgeschriebene `gutachter_termine`-State-Transitions in `termin-verlegung-actions.ts`. Jede Action behält ihren Auth-Guard, ihre `emitEvent`-Notifications, `touchClaimRecency`, Free-Busy/Alternativen-Vorabcheck und `revalidatePath` — nur die DB-Transition wird durch den Engine-Aufruf ersetzt. Parität ist Pflicht (RLS-Client, `verlegung_kunde_benachrichtigt_an`, tighter Status-Gates bleiben). Plus: ein kleiner Helper cancelt bei Fall-Storno die offenen Termine (`sageAb`), non-critical.

**Tech Stack:** TypeScript, Next.js Server Actions, Supabase (RLS + Admin-Client), Engine `@/lib/termine/engine` (`verlege`/`entscheideVerlegung`/`sageAb`), Vitest (Helper), Playwright/manuelle Staging-Smoke.

**Scope-Entscheidungen (Aaron, brainstorming 02.06.):**
- **Verlegungs-Repoint** (4 Actions) — parity-careful.
- **NEU: storno-cancelt-Termin** — `stornoFall` + `adminStornoFall` canceln nach dem Fall-Storno die offenen `gutachter_termine` des Falls via `sageAb` (schließt die dangling-Termin-Lücke). `transitionFallStatus`/`revertCaseBilling` bleibt unverändert.

**Parity-Pflicht (sonst Regression):**
1. **RLS vs Admin:** `terminVerlegungVorschlagen` (SV) schreibt heute via RLS-`supabase` — der Auth-Schutz IST die RLS (kein expliziter SV-owns-Guard). → `verlege(..., { db: supabase })` (NICHT admin). Kunde-/Bestätigen-/Ablehnen-Actions nutzen `admin` + expliziten `assertDarfVerlegungEntscheiden` → `verlege/entscheideVerlegung(..., { db: admin })`.
2. **`verlegung_kunde_benachrichtigt_an`:** setzt der SV-Flow heute auf dem neuen Slot → nach `verlege` gezielt nachziehen.
3. **Tighter Status-Gate:** Consumer erlaubt Verlegung nur aus `bestaetigt` → den `alt.status !== 'bestaetigt'`-Check VOR `verlege` behalten (Engine erlaubt alle AKTIV-Status, Consumer gatet enger).
4. **Free-Busy/Alternativen** (Kunde) bleiben Vorabcheck; bei Engine-`belegt` (Race) auch Alternativen.
5. **Notifications:** alle 4 `emitEvent`-Calls + Payloads (aus `alt`/`neu`) unverändert.

**Engine-Signaturen (P2.3c, `@/lib/termine/engine`):**
- `verlege(terminId, { neuVon, neuBis, neuerStatus?, initiatorKunde?, grund?, db? }) → { ok:true, neuerTerminId } | { ok:false, code:'alt_nicht_aktiv'|'belegt'|'db', error }`
- `entscheideVerlegung(neuerTerminId, 'bestaetigen'|'ablehnen', { grund?, db? }) → { ok:true } | { ok:false, code:'nicht_pending'|'db', error }`
- `sageAb(terminId, { grund?, status?, db? }) → { ok:true, terminId } | { ok:false, code:'nicht_aktiv'|'db', error }`

---

## File Structure

- **Create** `src/lib/termine/cancel-offene-termine.ts` — `cancelOffeneTermineFuerFall(db, fallId, grund)` (Helper, nutzt engine `sageAb`; non-critical). Plain lib (kein `'use server'`) → testbar + importierbar.
- **Modify** `src/lib/actions/termin-verlegung-actions.ts` — 4 Actions repointen (+ Imports).
- **Modify** `src/lib/actions/storno-actions.ts` — `stornoFall` + `adminStornoFall` rufen den Helper (+ Import).
- **Create** `src/lib/termine/__tests__/cancel-offene-termine.test.ts` — Vitest (Stub-db: N aktive Termine → sageAb N×).

**Pre-flight:** `npm ci` im Worktree-Root.

---

## Task 1: Repoint `terminVerlegungVorschlagen` (SV) → `verlege`

**Files:** Modify `src/lib/actions/termin-verlegung-actions.ts`

- [ ] **Step 1: Pre-flight + Import ergänzen**

Run (Worktree-Root): `npm ci`

Edit `src/lib/actions/termin-verlegung-actions.ts` — Import-Zeile nach `import { touchClaimRecency } ...` ergänzen:

```ts
import { verlege, entscheideVerlegung } from '@/lib/termine/engine'
```

- [ ] **Step 2: DB-Transition durch Engine-Call ersetzen**

In `terminVerlegungVorschlagen` den Block „1) Alten Termin auf 'verlegt' setzen" bis Ende „2) Neuen Slot anlegen" (inkl. Rollback) ersetzen.

**ALT (entfernen):**
```ts
  // 1) Alten Termin auf 'verlegt' setzen
  const { error: updErr } = await supabase
    .from('gutachter_termine')
    .update({
      status: 'verlegt',
      verlegung_grund: input.grund?.trim() || null,
    })
    .eq('id', alt.id)
    .eq('status', 'bestaetigt') // Idempotenz: nur wenn noch bestaetigt
  if (updErr) {
    return { ok: false, error: `Verlegung fehlgeschlagen: ${updErr.message}` }
  }

  // 2) Neuen Slot anlegen
  const { data: neu, error: insErr } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id: alt.sv_id,
      fall_id: alt.fall_id,
      claim_id: alt.claim_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: input.neuesStartIso,
      end_zeit: input.neuesEndeIso,
      status: 'verlegung_pending',
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund?.trim() || null,
      verlegung_kunde_benachrichtigt_an: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr || !neu) {
    // Rollback: alter Termin zurück auf bestaetigt
    await supabase
      .from('gutachter_termine')
      .update({ status: 'bestaetigt', verlegung_grund: null })
      .eq('id', alt.id)
    return { ok: false, error: `Pending-Slot anlegen fehlgeschlagen: ${insErr?.message ?? 'unbekannt'}` }
  }
```

**NEU (einfügen):**
```ts
  // P3a: DB-Transition via Engine verlege (race-sicher; RLS-Client beibehalten = Auth-Schutz,
  // da diese Action keinen expliziten SV-owns-Guard hat). alt.status==='bestaetigt' ist oben gegatet.
  const verlegeRes = await verlege(input.terminId, {
    neuVon: input.neuesStartIso,
    neuBis: input.neuesEndeIso,
    neuerStatus: 'verlegung_pending',
    grund: input.grund?.trim() || undefined,
    db: supabase,
  })
  if (!verlegeRes.ok) {
    const msg =
      verlegeRes.code === 'belegt'
        ? 'Der neue Slot ist belegt.'
        : verlegeRes.code === 'alt_nicht_aktiv'
          ? 'Termin ist nicht mehr verlegbar.'
          : `Verlegung fehlgeschlagen: ${verlegeRes.error}`
    return { ok: false, error: msg }
  }
  const neu = { id: verlegeRes.neuerTerminId }
  // Parität: SV-Flow markiert den neuen Slot als kunde-benachrichtigt.
  await supabase
    .from('gutachter_termine')
    .update({ verlegung_kunde_benachrichtigt_an: new Date().toISOString() })
    .eq('id', neu.id)
```

(Der nachfolgende Code — `if (alt.fall_id) { revalidatePath… touchClaimRecency }`, `emitEvent('termin.verlegung_vorgeschlagen', { … terminId: neu.id … })`, `return { ok: true, neuerTerminId: neu.id }` — bleibt **unverändert**; `neu.id` ist weiter gültig.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 4: `</content>`-Scan + Commit**

```bash
git add src/lib/actions/termin-verlegung-actions.ts
git commit -m "refactor(termin-engine): P3a — terminVerlegungVorschlagen (SV) auf engine verlege repointen (RLS-Client + benachrichtigt-Parity)"
```

---

## Task 2: Repoint `kundeTerminVerlegungVorschlagen` → `verlege`

**Files:** Modify `src/lib/actions/termin-verlegung-actions.ts`

- [ ] **Step 1: DB-Transition durch Engine-Call ersetzen**

In `kundeTerminVerlegungVorschlagen` den Block „1) Neuen Slot anlegen" bis „2) Alter Termin auf 'verschoben'" (inkl. Rollback) ersetzen. Der `istSlotFrei`-Vorabcheck + Alternativen DAVOR bleiben unverändert.

**ALT (entfernen):**
```ts
  // 1) Neuen Slot anlegen — sofort 'bestaetigt', Initiator=Kunde
  const { data: neu, error: insErr } = await admin
    .from('gutachter_termine')
    .insert({
      sv_id: alt.sv_id,
      fall_id: alt.fall_id,
      claim_id: alt.claim_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: wunschStart.toISOString(),
      end_zeit: wunschEnde.toISOString(),
      status: 'bestaetigt',
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund?.trim() || null,
      verlegung_initiator_kunde: true,
    })
    .select('id')
    .single()

  if (insErr || !neu) {
    return {
      ok: false,
      error: `Neuer Slot anlegen fehlgeschlagen: ${insErr?.message ?? 'unbekannt'}`,
    }
  }

  // 2) Alter Termin auf 'verschoben' (terminal — Kunde hat entschieden)
  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'verschoben',
      verlegung_grund: input.grund?.trim() || null,
      verlegung_initiator_kunde: true,
    })
    .eq('id', alt.id)
    .eq('status', 'bestaetigt')
  if (updErr) {
    // Rollback neuer Termin
    await admin.from('gutachter_termine').delete().eq('id', neu.id)
    return { ok: false, error: `Alter Termin lässt sich nicht abschließen: ${updErr.message}` }
  }
```

**NEU (einfügen):**
```ts
  // P3a: DB-Transition via Engine verlege (neuerStatus 'bestaetigt' => alt -> 'verschoben',
  // initiatorKunde; race-sicher via Constraint). Admin-Client (Auth via assertDarfVerlegungEntscheiden oben).
  const verlegeRes = await verlege(input.terminId, {
    neuVon: wunschStart.toISOString(),
    neuBis: wunschEnde.toISOString(),
    neuerStatus: 'bestaetigt',
    initiatorKunde: true,
    grund: input.grund?.trim() || undefined,
    db: admin,
  })
  if (!verlegeRes.ok) {
    if (verlegeRes.code === 'belegt') {
      const alternatives = await findAlternativenZuWunschslot(
        admin,
        alt.sv_id as string,
        input.neuesStartIso,
        slotDauerMin,
        alt.id as string,
      )
      return { ok: false, error: 'Der gewünschte Termin ist beim Gutachter belegt.', alternatives }
    }
    return { ok: false, error: `Verlegung fehlgeschlagen: ${verlegeRes.error}` }
  }
  const neu = { id: verlegeRes.neuerTerminId }
```

(Der nachfolgende Code — `revalidateFallPaths(alt.fall_id …)`, `emitEvent('termin.verschoben_durch_kunde', { … terminId: neu.id … })`, `return { ok: true, neuerTerminId: neu.id }` — bleibt **unverändert**.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/termin-verlegung-actions.ts
git commit -m "refactor(termin-engine): P3a — kundeTerminVerlegungVorschlagen auf engine verlege (Free-Busy/Alternativen bleiben Vorabcheck)"
```

---

## Task 3: Repoint `terminVerlegungBestaetigen` + `terminVerlegungAblehnen` → `entscheideVerlegung`

**Files:** Modify `src/lib/actions/termin-verlegung-actions.ts`

- [ ] **Step 1: `terminVerlegungBestaetigen` — DB-Transition ersetzen**

Den Block „1) Neuer Slot → bestaetigt" bis Ende „2) Alter Termin → verschoben" (inkl. Rollback) ersetzen. Load `neu` + alle Checks + `assertDarfVerlegungEntscheiden` DAVOR bleiben (für Auth + emit-Payload).

**ALT (entfernen):**
```ts
  // 1) Neuer Slot → bestaetigt (Admin-Client, weil Kunde nur SELECT hat)
  const { error: bestErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (bestErr) return { ok: false, error: `Bestätigen fehlgeschlagen: ${bestErr.message}` }

  // 2) Alter Termin → verschoben (terminal)
  const { error: altErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'verschoben',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (altErr) {
    // Rollback: neuer Slot zurück auf pending
    await admin
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending' })
      .eq('id', neu.id)
    return { ok: false, error: `Alten Termin schließen fehlgeschlagen: ${altErr.message}` }
  }
```

**NEU (einfügen):**
```ts
  // P3a: DB-Transition via Engine entscheideVerlegung (neu -> bestaetigt, alt(verlegt) -> verschoben+cancelled).
  const entRes = await entscheideVerlegung(input.neuerTerminId, 'bestaetigen', { db: admin })
  if (!entRes.ok) {
    return {
      ok: false,
      error: entRes.code === 'nicht_pending'
        ? "Slot ist nicht im Status 'verlegung_pending'."
        : `Bestätigen fehlgeschlagen: ${entRes.error}`,
    }
  }
```

- [ ] **Step 2: `terminVerlegungAblehnen` — DB-Transition ersetzen**

Den Block „1) Neuer Slot → storniert" bis Ende „2) Alter Termin → bestaetigt (Rollback)" ersetzen.

**ALT (entfernen):**
```ts
  // 1) Neuer Slot → storniert (Admin-Client)
  const { error: stoErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'storniert',
      cancelled_at: new Date().toISOString(),
      verlegung_grund: input.grund?.trim() || null,
    })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (stoErr) return { ok: false, error: `Stornieren fehlgeschlagen: ${stoErr.message}` }

  // 2) Alter Termin → bestaetigt (Rollback)
  const { error: rbErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (rbErr) {
    // Rollback des Rollbacks: neuer Slot zurück auf pending
    await admin
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending', cancelled_at: null })
      .eq('id', neu.id)
    return { ok: false, error: `Alter Termin Rollback fehlgeschlagen: ${rbErr.message}` }
  }
```

**NEU (einfügen):**
```ts
  // P3a: DB-Transition via Engine entscheideVerlegung (neu -> storniert+cancelled+grund, alt(verlegt) -> bestaetigt).
  const entRes = await entscheideVerlegung(input.neuerTerminId, 'ablehnen', {
    grund: input.grund?.trim() || undefined,
    db: admin,
  })
  if (!entRes.ok) {
    return {
      ok: false,
      error: entRes.code === 'nicht_pending'
        ? "Slot ist nicht im Status 'verlegung_pending'."
        : `Ablehnen fehlgeschlagen: ${entRes.error}`,
    }
  }
```

- [ ] **Step 3: Typecheck + Commit**

Run: `npx tsc --noEmit` → 0 Fehler.

```bash
git add src/lib/actions/termin-verlegung-actions.ts
git commit -m "refactor(termin-engine): P3a — terminVerlegungBestaetigen/Ablehnen auf engine entscheideVerlegung"
```

---

## Task 4: NEU — `sageAb` bei Fall-Storno (dangling-Termin-Fix)

**Files:**
- Create `src/lib/termine/cancel-offene-termine.ts`
- Create `src/lib/termine/__tests__/cancel-offene-termine.test.ts`
- Modify `src/lib/actions/storno-actions.ts`

- [ ] **Step 1: Failing test**

Create `src/lib/termine/__tests__/cancel-offene-termine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelOffeneTermineFuerFall } from '../cancel-offene-termine'

// Stub-db: select aktive Termine (eq.in) -> Liste; update (eq.in.select) -> {data:[{id}]} (sageAb-Erfolg).
function stubDb(aktive: { id: string }[]): { db: SupabaseClient; updates: string[] } {
  const updates: string[] = []
  const db = {
    from: () => ({
      select: () => ({
        eq: function () { return this },
        in: async () => ({ data: aktive, error: null }),
      }),
      update: () => ({
        eq: (_c: string, id: string) => ({
          in: () => ({
            select: async () => { updates.push(id); return { data: [{ id }], error: null } },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { db, updates }
}

describe('cancelOffeneTermineFuerFall', () => {
  it('cancelt jeden aktiven Termin (sageAb pro Termin)', async () => {
    const { db, updates } = stubDb([{ id: 't1' }, { id: 't2' }])
    await cancelOffeneTermineFuerFall(db, 'f1', 'storno_test')
    expect(updates.sort()).toEqual(['t1', 't2'])
  })
  it('kein aktiver Termin -> no-op (kein Throw)', async () => {
    const { db, updates } = stubDb([])
    await cancelOffeneTermineFuerFall(db, 'f1', 'storno_test')
    expect(updates).toEqual([])
  })
})
```

- [ ] **Step 2: Run test (fail)**

Run: `npx vitest run src/lib/termine/__tests__/cancel-offene-termine.test.ts`
Expected: FAIL — „Cannot find module '../cancel-offene-termine'".

- [ ] **Step 3: Helper implementieren**

Create `src/lib/termine/cancel-offene-termine.ts`:

```ts
// P3a: Bei Fall-Storno die offenen Termine des Falls canceln (engine sageAb).
// Non-critical: ein fehlgeschlagener Termin-Cancel darf den Fall-Storno nicht brechen.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sageAb } from '@/lib/termine/engine'

const AKTIV = ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending']

/** Cancelt alle aktiven gutachter_termine eines Falls (status -> storniert + cancelled_at). */
export async function cancelOffeneTermineFuerFall(
  db: SupabaseClient,
  fallId: string,
  grund: string,
): Promise<void> {
  try {
    const { data: termine } = await db
      .from('gutachter_termine')
      .select('id')
      .eq('fall_id', fallId)
      .in('status', AKTIV)
    for (const t of (termine ?? []) as { id: string }[]) {
      const r = await sageAb(t.id, { status: 'storniert', grund, db })
      if (!r.ok) console.error(`[storno] sageAb(${t.id}) fehlgeschlagen (non-critical): ${r.error}`)
    }
  } catch (err) {
    console.error('[storno] cancelOffeneTermineFuerFall fehlgeschlagen (non-critical):', err)
  }
}
```

- [ ] **Step 4: Run test (pass)**

Run: `npx vitest run src/lib/termine/__tests__/cancel-offene-termine.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: In `stornoFall` + `adminStornoFall` verdrahten**

Edit `src/lib/actions/storno-actions.ts` — Import nach `import { transitionFallStatus } ...`:

```ts
import { cancelOffeneTermineFuerFall } from '@/lib/termine/cancel-offene-termine'
```

In `stornoFall`, **beide** Branches: nach `await transitionFallStatus(...)` (und vor `revalidatePath`) ergänzen:
- 24h-Branch (nach `await revertCaseBilling(...)`):
```ts
    await cancelOffeneTermineFuerFall(db, fallId, `storno_sv_24h: ${grund}`)
```
- Spät-Branch (nach dem `auftraege`-storno_durch_user_id-Block, vor `revalidatePath`):
```ts
    await cancelOffeneTermineFuerFall(db, fallId, `storno_sv_spaet: ${grund}`)
```

In `adminStornoFall`, nach `await revertCaseBilling(...)` (vor `revalidatePath`):
```ts
  await cancelOffeneTermineFuerFall(db, fallId, `storno_admin: ${grund}`)
```

- [ ] **Step 6: Typecheck + `</content>`-Scan + Commit**

Run: `npx tsc --noEmit` → 0 Fehler. Scan beide neuen Files auf `</content>`.

```bash
git add src/lib/termine/cancel-offene-termine.ts src/lib/termine/__tests__/cancel-offene-termine.test.ts src/lib/actions/storno-actions.ts
git commit -m "feat(termin-engine): P3a — Fall-Storno cancelt offene Termine via engine sageAb (dangling-Termin-Fix)"
```

---

## Task 5: Build-Gate + Staging-Smoke (Screenshot-Pflicht)

**Files:** keine Code-Änderung.

- [ ] **Step 1: Voller Build-Gate**

Server-Actions geändert → `npx tsc --noEmit` (Pflicht). `next build` OOMt lokal (Memory) → CI-`build` gatet den PR; tsc ist der lokale Gate.
Run: `npx tsc --noEmit` → 0 Fehler.

- [ ] **Step 2: Staging-Smoke Verlegung (Browser, Screenshots)**

Gegen `app.staging.claimondo.de` (Test-User mit 2FA-aus, Basic-Auth aaroncmdo). Pro Schritt Screenshot:
1. **SV schlägt vor:** SV-Portal → Auftrag mit bestätigtem Termin → „Verlegen" → Slot wählen → Submit. Erwartet: alter Termin `verlegt`, neuer `verlegung_pending` (DB-Check via Supabase-MCP execute_sql READ + UI zeigt Pending).
2. **Kunde bestätigt:** Kunde-Portal → Verlegungs-Request → „Bestätigen". Erwartet: neuer `bestaetigt`, alter `verschoben`+cancelled_at.
3. **Kunde lehnt ab** (zweiter Fall): → „Ablehnen". Erwartet: neuer `storniert`, alter zurück `bestaetigt` (Rollback).
4. **Kunde schlägt selbst vor:** Kunde-Verlegung mit freiem Wunschslot → neuer `bestaetigt` (initiatorKunde), alter `verschoben`. Mit belegtem Slot → Alternativen-Modal.

- [ ] **Step 3: Staging-Smoke Storno-cancelt-Termin**

SV-Portal → Fall mit aktivem Termin → „Stornieren". Erwartet (DB-Check): Fall `storniert` **UND** der zuvor aktive `gutachter_termine` jetzt `storniert` + `cancelled_at` gesetzt. Screenshot + execute_sql-READ-Beleg.

- [ ] **Step 4: Smoke-Doc**

`docs/02.06.2026/smoke-p3a-verlege-storno/` mit Screenshots + kurzer Befund-MD (Memory: Smoke = Screenshot + Analyse im selben Schritt).

---

## Task 6: 7-Punkte-Audit + PR gegen `staging`

- [ ] **Step 1: Regression-/Konsumenten-Beleg**

- `verlege`/`entscheideVerlegung`/`sageAb` sind P2.3c-Engine (vitest + Live-Verify bewiesen). Repoint ersetzt nur die DB-Transition; Auth/Notify/Vorschläge/revalidate unverändert.
- Grep: `git -C . grep -n "terminVerlegungVorschlagen\|terminVerlegungBestaetigen\|terminVerlegungAblehnen\|kundeTerminVerlegungVorschlagen\|stornoFall\|adminStornoFall" src/ | cat` → Aufrufer-Liste prüfen (UI-Komponenten) — Signaturen UNVERÄNDERT → keine Caller-Anpassung nötig.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin kitta/termin-engine-p3a-verlege-storno
gh pr create --base staging --title "refactor(termin-engine): P3a — Verlegungs-Actions auf Engine + storno-cancelt-Termin" --body "<Audit-Body>"
```

PR-Body Audit:
```
Audit:
- Build: grün (npx tsc --noEmit); Staging-Smoke (Verlegung SV/Kunde + Storno) mit Screenshots
- UI: keine neuen Einstiegspunkte; Action-Signaturen unverändert -> Caller intakt
- Redundanz: handgeschriebene gutachter_termine-Transitions durch Engine ersetzt (verlege/entscheideVerlegung/sageAb)
- Dead-Code: nichts gelöscht; storno-cancel additiv
- Spec: Verlegungs-Repoint (parity: RLS-Client, verlegung_kunde_benachrichtigt_an, Status-Gate, Free-Busy/Alternativen) + neues storno-cancelt-Termin (Aaron 02.06.)
- Inkonsistenz: Auth (assertDarfVerlegungEntscheiden + RLS) + emitEvent (4 Events) + touchClaimRecency + revalidatePath BEHALTEN
- Regression: Engine-Primitive vorab bewiesen; Staging-Smoke deckt alle Transitions; storno-cancel non-critical (bricht Fall-Storno nicht)
```

- [ ] **Step 3: NICHT mergen** — nicht die Merge-Session; PR offen lassen.

---

## Self-Review (Plan gegen Scope)

**Spec-Coverage:** Verlegung-SV (T1) · Verlegung-Kunde (T2) · Bestätigen/Ablehnen (T3) · storno-cancelt-Termin (T4) · Smoke (T5) · PR (T6). ✓
**Parity:** RLS-Client (T1 `db:supabase`, T2/T3 `db:admin`) ✓ · `verlegung_kunde_benachrichtigt_an` (T1 Step 2) ✓ · Status-Gate `bestaetigt` bleibt (nicht entfernt) ✓ · Free-Busy/Alternativen (T2) ✓ · alle 4 `emitEvent` + `touchClaimRecency` + `revalidatePath` unangetastet ✓.
**Placeholder-Scan:** kein TBD; jeder Edit als exaktes ALT→NEU. ✓
**Typ-Konsistenz:** `verlege`/`entscheideVerlegung`/`sageAb`-Signaturen == Engine (P2.3c); `verlegeRes.code`/`entRes.code` Diskriminanten konsistent. ✓
**Bewusste Grenzen:** Verlegungs-Repoint = Verhaltens-Parität (kein neuer Test außer storno-Helper; Beweis = Engine-vorab + Staging-Smoke, Strecke-Konvention). storno-cancel nur in `stornoFall`/`adminStornoFall` (nicht meldeNoShow-Auto-Storno/Reklamation — die laufen über `transitionFallStatus`; falls gewünscht, Folgeschritt). Termin-Query per `fall_id` (gutachter_termine.fall_id; claim-SSoT-Variante = Folge falls nötig).
