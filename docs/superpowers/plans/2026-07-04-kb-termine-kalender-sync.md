# SP2c — KB-Beratungstermine Kalender-Sync — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).

**Goal:** KB-Beratungstermine syncen bidirektional — OUT (8 Call-Sites → Engine, Meet-bewusst) + IN (`kb-slots`→`v_belegung`).

**Architecture:** Meet-bewusster fail-soft Wrapper `kb-termin-sync.ts` (Provider-Wahl via `video_link`) → an 8 Call-Sites verdrahten → `kb-slots` externe-Belegung-Filter via `ladeBelegung`.

**Tech Stack:** Next.js 16, Supabase, vitest.

## Global Constraints
- Regel 1: Branch `kitta/kb-termine-kalender-sync` (erstellt, stacked auf SP2b), PR gegen SP2b-Branch.
- Keine DB-/Migration-Änderung. Fail-soft (Sync-Fehler bricht Termin-Write nie). G/H nur `typ='kb_beratung'` (SV nicht anfassen).
- 7-Punkte-Audit vor jedem Commit. Umlaute in evtl. UI-Strings.
- Engine bereits KB-generisch (SP1). `syncTerminToExternalCalendar(id, {providers?})` / `entferneTerminAusExternemKalender(id, {providers?})` / `caldavProvider` aus `@/lib/termine/engine/kalender-sync`.

## File Structure
- **Create:** `src/lib/termine/kb-termin-sync.ts` (+ `__tests__/kb-termin-sync.test.ts`).
- **Modify (OUT create/update):** `lib/termine/kb-booking.ts`, `app/faelle/[id]/_actions/termine.ts`, `app/mitarbeiter/konsultation/[terminId]/actions.ts`, `app/flow/[token]/self-service-actions.ts`.
- **Modify (remove):** `lib/termine/kb-booking.ts`, `app/api/kunde/termin/verschieben/route.ts`, `app/api/kunde/termin/absagen/route.ts`.
- **Modify (IN):** `src/lib/termine/kb-slots.ts`.

---

### Task 1: Meet-bewusster Wrapper + Test (TDD)

**Files:** Create `src/lib/termine/kb-termin-sync.ts`, `src/lib/termine/__tests__/kb-termin-sync.test.ts`.

**Interfaces:** Produces `istMeetVideo(videoLink)`, `syncKbTerminOut(terminId)`, `entferneKbTerminOut(terminId)`.

- [ ] **Step 1: Failing test** (`kb-termin-sync.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { istMeetVideo } from '../kb-termin-sync'
describe('istMeetVideo', () => {
  it('Google-Meet-Link → true', () => { expect(istMeetVideo('https://meet.google.com/abc-defg-hij')).toBe(true) })
  it('Jitsi-Link → false', () => { expect(istMeetVideo('https://meet.jit.si/claimondo-xyz')).toBe(false) })
  it('null/leer → false', () => { expect(istMeetVideo(null)).toBe(false); expect(istMeetVideo(undefined)).toBe(false); expect(istMeetVideo('')).toBe(false) })
})
```
- [ ] **Step 2: Run → fail** (`npx vitest run src/lib/termine/__tests__/kb-termin-sync.test.ts`), Modul fehlt.
- [ ] **Step 3: Implement** `kb-termin-sync.ts`:
```ts
// KB-Termin-Sync-Wrapper. Delegiert an die assignee-generische Engine, waehlt
// Provider Meet-bewusst (ein Meet-Video-Event liegt schon auf dem KB-primary-Google-
// Kalender -> nur CalDAV ergaenzen, um Meet-Link/Teilnehmer nicht zu beschaedigen),
// und ist fail-soft (Sync-Fehler darf den Termin-Write nicht brechen).
import { createAdminClient } from '@/lib/supabase/admin'
import {
  syncTerminToExternalCalendar,
  entferneTerminAusExternemKalender,
  caldavProvider,
} from './engine/kalender-sync'

/** true = Google-Meet-Link (Google gehoert dem Meet-Pfad). Jitsi/null/leer = false. Pure. */
export function istMeetVideo(videoLink: string | null | undefined): boolean {
  return !!videoLink && videoLink.includes('meet.google')
}

/** OUT-Sync eines KB-Termins. Meet-Video -> nur CalDAV; sonst beide Provider. Fail-soft. */
export async function syncKbTerminOut(terminId: string): Promise<void> {
  try {
    const db = createAdminClient()
    const { data } = await db.from('gutachter_termine').select('video_link').eq('id', terminId).maybeSingle()
    const meet = istMeetVideo((data?.video_link as string | null) ?? null)
    await syncTerminToExternalCalendar(terminId, meet ? { providers: [caldavProvider] } : undefined)
  } catch (err) {
    console.error('[kb-termin-sync] OUT fehlgeschlagen fuer', terminId, err instanceof Error ? err.message : err)
  }
}

/** Entfernt einen KB-Termin aus Google + CalDAV (Storno/Absage/Verschiebung). Fail-soft. */
export async function entferneKbTerminOut(terminId: string): Promise<void> {
  try {
    await entferneTerminAusExternemKalender(terminId)
  } catch (err) {
    console.error('[kb-termin-sync] REMOVE fehlgeschlagen fuer', terminId, err instanceof Error ? err.message : err)
  }
}
```
- [ ] **Step 4: Run → pass.** **Step 5: tsc (0).** **Step 6: Commit** (`feat(kb-termine): Task 1 — Meet-bewusster KB-Termin-Sync-Wrapper`).

---

### Task 2: OUT-Sync an create/update-Sites verdrahten (A, C, D, E, F)

**Files:** `lib/termine/kb-booking.ts` (A), `app/faelle/[id]/_actions/termine.ts` (C), `app/mitarbeiter/konsultation/[terminId]/actions.ts` (D), `app/flow/[token]/self-service-actions.ts` (E, F).

Muster je Site: **nach** dem erfolgreichen `gutachter_termine`-Insert/Update (terminId bekannt) `await syncKbTerminOut(terminId)` einfügen. Fail-soft ist im Wrapper → kein try/catch am Call-Site nötig. Import `import { syncKbTerminOut } from '@/lib/termine/kb-termin-sync'` (bzw. relativer Pfad in `lib/termine/*`).

- [ ] **Step 1: A — `bookKbTermin` (`kb-booking.ts`).** Nach dem Insert (der die neue `terminId` liefert; die Funktion kennt die id des angelegten Termins) `await syncKbTerminOut(<terminId>)`. Die id aus dem Insert-`.select('id').single()`-Return nutzen (prüfen wie der Insert die id zurückgibt).
- [ ] **Step 2: C — `createKbVideoterminByKb` (`termine.ts`).** Nach dem Insert `await syncKbTerminOut(<terminId>)`.
- [ ] **Step 3: D — `protokolliereKonsultation` (`konsultation/actions.ts`).** Nur im `disposition==='verschoben'`-Zweig (Zeitänderung), nach dem Update `await syncKbTerminOut(terminId)` (terminId = Route-Param).
- [ ] **Step 4: E — `bestaetigeBeratungsterminFlow` (`self-service-actions.ts`).** Nach dem Update→`bestaetigt` `await syncKbTerminOut(<terminId>)`.
- [ ] **Step 5: F — `verschiebeBeratungsterminFlow` (`self-service-actions.ts`).** Nach dem Zeit-Update `await syncKbTerminOut(<terminId>)`.
- [ ] **Step 6: tsc (0).** **Step 7: Commit** (`feat(kb-termine): Task 2 — OUT-Sync an create/update-Call-Sites (A/C/D/E/F)`).

---

### Task 3: Remove-Sync an Storno-Sites verdrahten (B, G, H)

**Files:** `lib/termine/kb-booking.ts` (B), `app/api/kunde/termin/verschieben/route.ts` (G), `app/api/kunde/termin/absagen/route.ts` (H).

- [ ] **Step 1: B — `cancelKbTermin` (`kb-booking.ts`).** Nach dem Storno-Update `await entferneKbTerminOut(<terminId>)`.
- [ ] **Step 2: G — `/api/kunde/termin/verschieben`.** Im bestehenden `typ==='kb_beratung'`-Zweig, nach dem Update→`verschoben`, `await entferneKbTerminOut(<terminId>)`. (Status `verschoben` ∉ AKTIV_STATUS → Upsert würde eh skippen; entferne räumt das Event.)
- [ ] **Step 3: H — `/api/kunde/termin/absagen`.** Im `typ==='kb_beratung'`-Zweig, nach dem Update→`abgesagt`, `await entferneKbTerminOut(<terminId>)`.
- [ ] **Step 4: tsc (0) + Full-Build** (Routen/Server-Actions betroffen).
- [ ] **Step 5: Commit** (`feat(kb-termine): Task 3 — Remove-Sync an Storno-Sites (B/G/H, gegated kb_beratung)`).

---

### Task 4: IN-Sync — `kb-slots.ts` externe-Belegung-Filter

**Files:** `src/lib/termine/kb-slots.ts`.

- [ ] **Step 1: `ladeBelegung`-Signatur prüfen** (`src/lib/termine/engine/belegung.ts:30-36` lesen — Argumente `(assignee, vonIso, bisIso, db?)`, Feld `belegungTyp`, `start`/`end`).
- [ ] **Step 2: Laden** — an der Stelle des entfernten No-Op-Blocks (`kb-slots.ts:~102-107`, nach `adminBlockedRanges`, vor `const slots`):
```ts
const { ladeBelegung } = await import('@/lib/termine/engine/belegung')
const externFenster = await ladeBelegung({ typ: 'kundenbetreuer', id: kbId }, windowStart, windowEnd, db)
const externBlockedRanges = externFenster
  .filter((f) => f.belegungTyp === 'extern')
  .map((f) => ({ start: new Date(f.start).getTime(), end: new Date(f.end).getTime() }))
```
(Feldnamen an die tatsächliche `ladeBelegung`-Rückgabe aus Step 1 anpassen.)
- [ ] **Step 3: Filter** — in der Slot-Schleife (`~:141-144`), wo `adminOverlap` geprüft wird, ergänzen:
```ts
const externOverlap = externBlockedRanges.some((b) => slotStart < b.end && slotEnd > b.start)
if (!adminOverlap && !externOverlap) { /* … slots.push … */ }
```
(exakte Variablennamen `slotStart`/`slotEnd`/`adminOverlap` aus dem Bestandscode übernehmen.)
- [ ] **Step 4: tsc (0) + Full-Build.**
- [ ] **Step 5: Commit** (`feat(kb-termine): Task 4 — kb-slots externe-Belegung-Filter (IN-Sync)`).

---

### Task 5: Verifikation + PR

- [ ] **Step 1:** tsc 0 · Full-Build 0 · vitest (kb-termin-sync + Domain, kein Regress) · 3 Ratchets 0 neue.
- [ ] **Step 2: Prod-Smoke (READ):** für einen echten KB `select … from v_belegung where assignee_typ='kundenbetreuer' and assignee_id=<kbId> and belegung_typ='extern'` (aktuell 0 → Filter no-op, kein Crash); Call-Sites kompilieren + fail-soft.
- [ ] **Step 3: 7-Punkte-Audit** + Session-Abschluss-Check.
- [ ] **Step 4: Push + PR** gegen `kitta/kalender-connect-mitarbeiter` (SP2b-Branch, stacked).
- [ ] **Step 5: Marker** + MEMORY.md aktualisieren (SP2c gebaut).

## Self-Review
- Spec-Coverage: Wrapper (T1), OUT create/update (T2), remove (T3), IN (T4), Verify (T5).
- Platzhalter: `<terminId>` je Site = die im Site-Code vorhandene id-Variable (beim Ausführen gelesen) — kein TBD, die Auflösung ist mechanisch (die Sites haben die id bereits).
- Typ-Konsistenz: `syncKbTerminOut`/`entferneKbTerminOut(terminId: string)` überall; `istMeetVideo` pure.
- Risiko: fail-soft überall; Meet-Schutz zentral; G/H kb_beratung-gegated; kein DB-Change.
