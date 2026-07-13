# Werkstatt-FlowLink-Haftpflicht — Kohärenz + Reparaturtermin-Verhandlung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die vorhandene Reparaturtermin-/Werkstatt-Maschinerie um eine Kunde-Wunsch↔Werkstatt-final-Verhandlung erweitern und für Haftpflicht (Reparatur erst nach Gutachten) db-driven kohärent machen.

**Architecture:** Neuer `reparatur_termine`-Status `werkstatt_vorschlag` (Werkstatt schlägt abweichenden Termin vor → Kunde bestätigt „Passt" / reagiert „Passt nicht" via Anruf oder Rückrufbuchung). Ein reiner Ableitungs-Helper `reparaturPhaseErreicht` gated die Werkstatt-Wahl (Haftpflicht: erst nach `gutachten.fertiggestellt_am`, nie bei Totalschaden). Bugs A/B (Vermittler-Zuordnung) sind bereits korrekt → nur Regressionstests + empirische Prod-Verifikation.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase Postgres (RLS, SECURITY-DEFINER-Views), React + Tailwind (Claimondo Design-Tokens), vitest, TypeScript. DDL ausschließlich über das Supabase-Plugin (`apply_migration`).

**Vorbedingungen (Kontext für den Executor):**
- Branch/Worktree mit dem committeten Spec: `kitta/werkstatt-flowlink-haftpflicht` (off `staging`). Spec: `docs/superpowers/specs/2026-07-10-werkstatt-flowlink-haftpflicht-kohaerenz-design.md`. **Bau auf DIESEM Branch** (er enthält Spec + Plan); NICHT auf dem stale `aar-956`-Branch.
- Das Supabase-Plugin (`apply_migration`, `list_migrations`, `execute_sql`) muss verbunden sein (Task 2 + 8 brauchen es). Projekt-Ref: `paizkjajbuxxksdoycev`.
- Bestehende, verifizierte Fakten stehen im Spec §1.2. `reparatur_termine`-Status heute: `angefragt, bestaetigt, anruf_erbeten, abgelehnt, erledigt, storniert`. Kunde-RLS: SELECT (owner) + INSERT (`status='angefragt'`, owner, `werkstatt_id==claims.reparatur_werkstatt_id`); **kein Kunde-UPDATE**.

## Global Constraints

Jede Task erbt diese Regeln (verbatim aus Spec §6 + AGENTS.md):
- **DDL nur via Supabase-Plugin** `apply_migration`. Ablauf: DDL schreiben → `apply_migration({name, query})` → `list_migrations` (getrackte Version `<V>` ablesen) → Migration-File committen als `supabase/migrations/<V>_<name>.sql` → `execute_sql` (READ) zum Verifizieren. **Nie** raw `execute_sql` mit DDL, **nie** CLI `db push`.
- **Server-Actions** liefern `{ ok: boolean; error?: string }` (kein throw). Non-fatal Sub-Ops (Email/In-App-Notify) in lokalem `try/catch`. Jede mutierende Action ruft `revalidatePath` der betroffenen Routen.
- **Konstanten/Types NIE aus `'use server'`-Files exportieren** (Client-Bundle macht `undefined` daraus) — reine Helper/Types in eigene Nicht-`'use server'`-Module.
- **Komponenten-Set:** `@/components/primitives` (`Button`, `Card`, `Modal`), `@/components/shared/*` (`StatusBadge`, `SectionCard`, `PhoneButton`). Kein handgerolltes Button-/Card-Markup.
- **Status-Badges:** Farbe über `ton` (`neutral|info|success|warning`) + `TON_TO_BADGE_TONE` → `StatusBadge`. Keine neue Inline-Farb-Map (Status-Registry-Ratchet).
- **Umlaute:** alle nutzersichtbaren Strings (UI, Notify-Texte, Email-Betreff/Body, Toasts) mit echten `ä/ö/ü/ß`. (Code-Kommentare/Logs dürfen ASCII sein.)
- **7-Punkt-Audit** vor jedem Commit (Build grün, UI erreichbar, Redundanz, Dead-Code, Spec-Treue, Inkonsistenz, Regression). Commit-Body enthält den Audit-Block.
- **Auth-Muster reparatur_termine:** Kunde-Writes laufen über die auth-aware `createClient()` + RLS-Policy. Werkstatt-Writes, die eine Zeile ANLEGEN können (kein Werkstatt-INSERT in RLS), laufen über `createAdminClient()` **nach** einem Ownership-Gate via `getWerkstattAuftrag(claimId)` (RLS-gegatete View) — Muster wie `erstelleKvaFuerAuftrag`.

**Tests:** `npx vitest run <pfad>` für einzelne Files. Voller Typecheck: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`. Bei Routen/Server-Action-Änderungen zusätzlich `npm run build`.

---

## File Structure

**Neu:**
- `src/lib/werkstatt/reparatur-phase-erreicht.ts` — reiner Gate-Helper (Haftpflicht post-Gutachten / Kasko+Selbstzahler sofort / Totalschaden = aus).
- `src/lib/werkstatt/reparatur-phase-erreicht.test.ts`
- `src/lib/werkstatt/notify-werkstatt-kundenreaktion.ts` — In-App-Notify Kunde→Werkstatt (Passt / Rückrufbitte).
- `src/lib/werkstatt/__tests__/reparatur-termin-phase.werkstatt-vorschlag.test.ts`
- `src/lib/werkstatt/__tests__/vermittlung-core.regression.test.ts` — nagelt `buildZuweisungPatch` fest (Bug A).
- `src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.regression.test.ts` — nagelt Rollen-Segmentierung fest (Bug B).
- `supabase/migrations/<V>_reparatur_termine_werkstatt_vorschlag.sql` — Status + `rueckruf_wunschzeit` + Kunde-UPDATE-Policy.
- `supabase/migrations/<V2>_v_werkstatt_auftrag_rueckruf_wunschzeit.sql` — View um `rueckruf_wunschzeit` erweitern.
- `src/app/flow/[token]/FlowWerkstattHinweisHaftpflicht.tsx` — leichter Haftpflicht-Flow-Touch (Task 10).

**Modifiziert:**
- `src/lib/werkstatt/reparatur-termin-phase.ts` — Status `werkstatt_vorschlag` (Typ + MAP).
- `src/app/werkstatt/(shell)/auftraege/actions.ts` — neu `schlageWerkstattTerminVor`; `erstelleKvaFuerAuftrag` KVA-Termin → `werkstatt_vorschlag`; lokaler Helper `upsertWerkstattVorschlag`.
- `src/lib/werkstatt/notify-kunde-reparaturtermin.ts` — Ereignis `werkstatt_vorschlag`.
- `src/app/kunde/faelle/[id]/reparatur-termin-actions.ts` — neu `akzeptiereWerkstattTermin`, `werkstattTerminPasstNicht`.
- `src/components/kunde/WerkstattCard.tsx` — Reaktions-Block (Passt / Passt nicht → Anruf + Rückruf).
- `src/components/werkstatt/WerkstattAuftragDetail.tsx` — „Anderen Termin vorschlagen" + Rückrufzeit-Anzeige.
- `src/lib/werkstatt/queries.ts` — `WerkstattAuftrag`-Type + `AUFTRAG_SELECT` um `reparatur_rueckruf_wunschzeit`.
- `src/app/kunde/faelle/[id]/page.tsx` — `WerkstattFinderCard`-Gate + `reparaturPhaseErreicht`.
- Staff-Reminder-Gate (`WerkstattVermittelnCard`-Renderstellen in `faelle/[id]/page.tsx` + `gutachter/fall/[id]`).

---

## Task 1: Regressionstests für Bug A/B (Zuordnung festnageln)

**Warum zuerst:** Sichert die „muss richtig zugeordnet"-Anforderung (Spec §4) BEVOR der Lifecycle erweitert wird. Reine Logik, kein DB-/Prod-Risiko.

**Files:**
- Create: `src/lib/werkstatt/__tests__/vermittlung-core.regression.test.ts`
- Create: `src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.regression.test.ts`
- Read (nicht ändern): `src/lib/werkstatt/vermittlung-core.ts`, `src/lib/werkstatt/werkstatt-auftrag-segment.ts`

**Interfaces:**
- Consumes: `buildZuweisungPatch(werkstattId, userId, quelle)` → `Record<string,unknown>` mit 5 Feldern; `brauchtWerkstattVermittlung(row)` → boolean; `werkstattAuftragSegment(a)` → `'reparatur' | 'vermittlung'`.
- Produces: nichts (nur Tests).

- [ ] **Step 1: Öffne `src/lib/werkstatt/werkstatt-auftrag-segment.ts` und notiere die exakte `werkstattAuftragSegment`-Signatur/Logik** (die Regressionstests müssen das IST-Verhalten spiegeln, nicht raten).

- [ ] **Step 2: Schreibe die Regressionstests für `buildZuweisungPatch` (Bug A — alle 5 Felder atomar)**

```ts
// src/lib/werkstatt/__tests__/vermittlung-core.regression.test.ts
import { describe, it, expect } from 'vitest'
import { buildZuweisungPatch, brauchtWerkstattVermittlung } from '../vermittlung-core'

describe('buildZuweisungPatch — Bug-A-Regression: setzt IMMER alle 5 Felder', () => {
  it('setzt id + audit + quelle + status atomar', () => {
    const patch = buildZuweisungPatch('ws-1', 'user-1', 'dispatcher')
    expect(patch.reparatur_werkstatt_id).toBe('ws-1')
    expect(patch.reparatur_werkstatt_zugewiesen_von).toBe('user-1')
    expect(patch.reparatur_werkstatt_quelle).toBe('dispatcher')
    expect(patch.reparatur_vermittlung_status).toBe('vermittelt')
    expect(typeof patch.reparatur_werkstatt_zugewiesen_am).toBe('string')
    expect(Object.keys(patch).sort()).toEqual([
      'reparatur_vermittlung_status',
      'reparatur_werkstatt_id',
      'reparatur_werkstatt_quelle',
      'reparatur_werkstatt_zugewiesen_am',
      'reparatur_werkstatt_zugewiesen_von',
    ])
  })

  it('accountloser Kunde (userId null) → zugewiesen_von = null, NIE leerer String', () => {
    const patch = buildZuweisungPatch('ws-1', null, 'kunde')
    expect(patch.reparatur_werkstatt_zugewiesen_von).toBeNull()
  })
})

describe('brauchtWerkstattVermittlung — Gate-Invarianten', () => {
  it('true nur wenn Reparatur/fiktiv gewünscht, keine Werkstatt, status offen', () => {
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur' })).toBe(true)
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'fiktiv' })).toBe(true)
  })
  it('false sobald eine Werkstatt gesetzt ist (reparatur ODER vermittler)', () => {
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur', reparatur_werkstatt_id: 'x' })).toBe(false)
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur', werkstatt_id: 'x' })).toBe(false)
  })
  it('false wenn bereits vermittelt', () => {
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur', reparatur_vermittlung_status: 'vermittelt' })).toBe(false)
  })
})
```

- [ ] **Step 3: Schreibe die Regressionstests für `werkstattAuftragSegment` (Bug B — Rollen-Trennung)**

```ts
// src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.regression.test.ts
import { describe, it, expect } from 'vitest'
import { werkstattAuftragSegment } from '../werkstatt-auftrag-segment'

describe('werkstattAuftragSegment — Bug-B-Regression: Rollen sauber getrennt', () => {
  it('reparateur → reparatur-Tab', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'reparateur', reparatur_werkstatt_id: 'x' })).toBe('reparatur')
  })
  it('beide → reparatur-Tab', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'beide', reparatur_werkstatt_id: 'x' })).toBe('reparatur')
  })
  it('vermittler → vermittlung-Tab (NICHT reparatur)', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'vermittler', reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
})
```

- [ ] **Step 4: Passe die Test-Objekte an die reale `SegmentInput`-Signatur an** (aus Step 1). Falls `werkstattAuftragSegment` weitere Pflichtfelder erwartet, ergänze sie minimal (`as SegmentInput`-Cast erlaubt).

- [ ] **Step 5: Tests laufen lassen — müssen GRÜN sein (sie spiegeln IST-Verhalten)**

Run: `npx vitest run src/lib/werkstatt/__tests__/vermittlung-core.regression.test.ts src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.regression.test.ts`
Expected: PASS. Falls ROT → das IST-Verhalten weicht ab → im Marker dokumentieren + mit Aaron klären (echter Bug), NICHT den Test „passend biegen".

- [ ] **Step 6: Dokumentiere die manuelle Prod-Verifikation (READ-only, wenn MCP verbunden)** — hänge als Kommentar oben in `vermittlung-core.regression.test.ts` an:

```
// PROD-VERIFIKATION (execute_sql, READ-only) — vor Merge einmal laufen:
//  (a) Werkstatt sieht Fremdes?
//      SELECT c.id, c.werkstatt_id, c.reparatur_werkstatt_id FROM claims c
//      WHERE c.werkstatt_id IS NOT NULL AND c.reparatur_werkstatt_id IS NOT NULL
//        AND c.werkstatt_id <> c.reparatur_werkstatt_id;   -- erwartet: bewusste Vermittler/Reparateur-Splits
//  (b) reparatur_werkstatt_id gesetzt, aber vermittlung_status != 'vermittelt'?  (Inkonsistenz-Leak)
//      SELECT id FROM claims WHERE reparatur_werkstatt_id IS NOT NULL AND reparatur_vermittlung_status IS DISTINCT FROM 'vermittelt';
//  Finding != leer/plausibel → im Marker melden.
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/werkstatt/__tests__/vermittlung-core.regression.test.ts src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.regression.test.ts
git commit -m "test(werkstatt): Bug-A/B-Regression — Vermittler-Zuordnung + Tab-Segmentierung festnageln"
```

---

## Task 2: DDL — Status `werkstatt_vorschlag` + `rueckruf_wunschzeit` + Kunde-UPDATE-Policy

**Files:**
- Create: `supabase/migrations/<V>_reparatur_termine_werkstatt_vorschlag.sql` (Name nach getrackter Version, s. Global Constraints)

**Interfaces:**
- Produces: `reparatur_termine.status` erlaubt zusätzlich `'werkstatt_vorschlag'`; Spalte `reparatur_termine.rueckruf_wunschzeit timestamptz`; Policy `reparatur_termine_kunde_update`.

- [ ] **Step 1: DDL schreiben** (in Zwischendatei oder direkt als `query`):

```sql
-- Reparaturtermin-Verhandlung: Werkstatt schlaegt abweichenden Termin vor (werkstatt_vorschlag);
-- Kunde reagiert (Passt -> bestaetigt / Passt nicht -> anruf_erbeten + rueckruf_wunschzeit).
ALTER TABLE public.reparatur_termine DROP CONSTRAINT reparatur_termine_status_check;
ALTER TABLE public.reparatur_termine ADD CONSTRAINT reparatur_termine_status_check
  CHECK (status IN ('angefragt','werkstatt_vorschlag','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert'));

ALTER TABLE public.reparatur_termine ADD COLUMN IF NOT EXISTS rueckruf_wunschzeit timestamptz;
COMMENT ON COLUMN public.reparatur_termine.rueckruf_wunschzeit IS
  'Vom Kunden gewuenschte Rueckrufzeit (UTC), gesetzt bei "Passt nicht" -> die Werkstatt ruft zurueck.';

-- Kunde darf einen Werkstatt-Vorschlag annehmen (-> bestaetigt) oder ablehnen (-> anruf_erbeten).
-- USING gated die ALTE Zeile (nur werkstatt_vorschlag, nur eigener Claim),
-- WITH CHECK die NEUE Zeile (nur bestaetigt|anruf_erbeten). Owner-Praedikat woertlich
-- aus reparatur_termine_kunde_select (geschaedigter ODER claim_party).
CREATE POLICY reparatur_termine_kunde_update ON public.reparatur_termine
  FOR UPDATE TO authenticated
  USING (
    status = 'werkstatt_vorschlag'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  )
  WITH CHECK (
    status IN ('bestaetigt','anruf_erbeten')
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );
```

- [ ] **Step 2: Anwenden** — `apply_migration({ name: "reparatur_termine_werkstatt_vorschlag", query: "<obiges DDL>" })`

- [ ] **Step 3: Getrackte Version ablesen** — `list_migrations` → jüngste Version `<V>` notieren.

- [ ] **Step 4: Migration-File committen** als `supabase/migrations/<V>_reparatur_termine_werkstatt_vorschlag.sql` mit **exakt** dem angewandten DDL.

- [ ] **Step 5: Verifizieren (READ)** — `execute_sql`:

```sql
SELECT pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class r ON r.oid=con.conrelid
WHERE r.relname='reparatur_termine' AND con.conname='reparatur_termine_status_check';
SELECT polname FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid WHERE c.relname='reparatur_termine' AND polname='reparatur_termine_kunde_update';
```
Expected: CHECK enthält `werkstatt_vorschlag`; Policy existiert.

- [ ] **Step 6: `audit_ungated_definer_views()` bleibt 0** — `execute_sql`: `SELECT * FROM audit_ungated_definer_views();` Expected: 0 Zeilen (keine ungegateten Definer-Views durch die Änderung).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/<V>_reparatur_termine_werkstatt_vorschlag.sql
git commit -m "feat(db): reparatur_termine werkstatt_vorschlag-Status + rueckruf_wunschzeit + Kunde-UPDATE-RLS"
```

---

## Task 3: `reparaturTerminPhase` — Status `werkstatt_vorschlag`

**Files:**
- Modify: `src/lib/werkstatt/reparatur-termin-phase.ts`
- Create: `src/lib/werkstatt/__tests__/reparatur-termin-phase.werkstatt-vorschlag.test.ts`

**Interfaces:**
- Produces: `ReparaturTerminStatus` enthält `'werkstatt_vorschlag'`; `reparaturTerminPhase('werkstatt_vorschlag')` → `{ key:'werkstatt_vorschlag', label:'Werkstatt schlägt Termin vor', ton:'info' }`.
- Consumes: nichts.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/werkstatt/__tests__/reparatur-termin-phase.werkstatt-vorschlag.test.ts
import { describe, it, expect } from 'vitest'
import { reparaturTerminPhase } from '../reparatur-termin-phase'

describe('reparaturTerminPhase — werkstatt_vorschlag', () => {
  it('mappt werkstatt_vorschlag auf ein info-Label', () => {
    const p = reparaturTerminPhase('werkstatt_vorschlag')
    expect(p.key).toBe('werkstatt_vorschlag')
    expect(p.ton).toBe('info')
    expect(p.label).toBe('Werkstatt schlägt Termin vor')
  })
})
```

- [ ] **Step 2: Test läuft → FAIL** — Run: `npx vitest run src/lib/werkstatt/__tests__/reparatur-termin-phase.werkstatt-vorschlag.test.ts` — Expected: FAIL (Typ kennt `werkstatt_vorschlag` nicht / MAP-Zugriff `undefined`).

- [ ] **Step 3: `reparatur-termin-phase.ts` erweitern** — Union-Typ + MAP-Eintrag:

```ts
export type ReparaturTerminStatus =
  | 'angefragt' | 'werkstatt_vorschlag' | 'bestaetigt' | 'anruf_erbeten' | 'abgelehnt' | 'erledigt' | 'storniert'
```
und im `MAP` (nach `angefragt`) ergänzen:
```ts
  werkstatt_vorschlag: { key: 'werkstatt_vorschlag', label: 'Werkstatt schlägt Termin vor', ton: 'info' },
```

- [ ] **Step 4: Test läuft → PASS** — Run: `npx vitest run src/lib/werkstatt/__tests__/reparatur-termin-phase.werkstatt-vorschlag.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/werkstatt/reparatur-termin-phase.ts src/lib/werkstatt/__tests__/reparatur-termin-phase.werkstatt-vorschlag.test.ts
git commit -m "feat(werkstatt): reparaturTerminPhase kennt werkstatt_vorschlag"
```

---

## Task 4: Gate-Helper `reparaturPhaseErreicht` (Haftpflicht post-Gutachten)

**Files:**
- Create: `src/lib/werkstatt/reparatur-phase-erreicht.ts`
- Create: `src/lib/werkstatt/reparatur-phase-erreicht.test.ts`

**Interfaces:**
- Produces: `reparaturPhaseErreicht(claim: { abrechnungsweg: string | null }, gutachten: { fertiggestellt_am: string | null; totalschaden: boolean | null } | null): boolean`
- Consumes: nichts (client-safe, kein `'use server'`).

- [ ] **Step 1: Failing tests schreiben**

```ts
// src/lib/werkstatt/reparatur-phase-erreicht.test.ts
import { describe, it, expect } from 'vitest'
import { reparaturPhaseErreicht } from './reparatur-phase-erreicht'

describe('reparaturPhaseErreicht', () => {
  it('Selbstzahler: sofort true (kein Gutachten nötig)', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'selbstzahler' }, null)).toBe(true)
  })
  it('Kasko: sofort true', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'kasko' }, null)).toBe(true)
  })
  it('Haftpflicht ohne Gutachten: false (Reparatur erst nach Gutachten)', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, null)).toBe(false)
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, { fertiggestellt_am: null, totalschaden: null })).toBe(false)
  })
  it('Haftpflicht mit fertigem Gutachten, kein Totalschaden: true', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, { fertiggestellt_am: '2026-07-01T00:00:00Z', totalschaden: false })).toBe(true)
  })
  it('Haftpflicht Totalschaden: false (keine Reparatur)', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, { fertiggestellt_am: '2026-07-01T00:00:00Z', totalschaden: true })).toBe(false)
  })
  it('unbekannter/null Abrechnungsweg: konservativ false', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: null }, null)).toBe(false)
  })
})
```

- [ ] **Step 2: Test läuft → FAIL** — Run: `npx vitest run src/lib/werkstatt/reparatur-phase-erreicht.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

```ts
// src/lib/werkstatt/reparatur-phase-erreicht.ts
// Reine Ableitung (client-safe): Ist die Reparatur-Phase erreicht, sodass dem Kunden
// die Werkstatt-Wahl / der Reparaturtermin angezeigt werden darf?
//  - Selbstzahler/Kasko: sofort (kein SV-Gutachten in der Strecke).
//  - Haftpflicht: erst NACH dem SV-Gutachten (fertiggestellt_am gesetzt) und NUR ohne Totalschaden.

export interface ReparaturPhaseClaim {
  abrechnungsweg: string | null
}
export interface ReparaturPhaseGutachten {
  fertiggestellt_am: string | null
  totalschaden: boolean | null
}

export function reparaturPhaseErreicht(
  claim: ReparaturPhaseClaim,
  gutachten: ReparaturPhaseGutachten | null,
): boolean {
  if (claim.abrechnungsweg === 'selbstzahler' || claim.abrechnungsweg === 'kasko') return true
  if (claim.abrechnungsweg === 'haftpflicht') {
    return gutachten?.fertiggestellt_am != null && gutachten?.totalschaden !== true
  }
  return false
}
```

- [ ] **Step 4: Test läuft → PASS** — Run: `npx vitest run src/lib/werkstatt/reparatur-phase-erreicht.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/werkstatt/reparatur-phase-erreicht.ts src/lib/werkstatt/reparatur-phase-erreicht.test.ts
git commit -m "feat(werkstatt): reparaturPhaseErreicht — db-driven Gate (Haftpflicht post-Gutachten, kein Totalschaden)"
```

---

## Task 5: Kunde-Notify um `werkstatt_vorschlag` erweitern

**Files:**
- Modify: `src/lib/werkstatt/notify-kunde-reparaturtermin.ts`
- Create: `src/lib/werkstatt/__tests__/notify-kunde-reparaturtermin.werkstatt-vorschlag.test.ts`

**Interfaces:**
- Produces: `ReparaturterminEreignis` enthält `'werkstatt_vorschlag'`; `buildKundeReparaturterminEmailHtml({ ereignis:'werkstatt_vorschlag', bestaetigterTermin })` liefert Betreff „Die Werkstatt hat einen Termin vorgeschlagen".
- Consumes: bestehende `buildKundeReparaturterminEmailHtml`, `notifyKundeReparaturtermin`.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/werkstatt/__tests__/notify-kunde-reparaturtermin.werkstatt-vorschlag.test.ts
import { describe, it, expect } from 'vitest'
import { buildKundeReparaturterminEmailHtml } from '../notify-kunde-reparaturtermin'

describe('buildKundeReparaturterminEmailHtml — werkstatt_vorschlag', () => {
  it('nennt den vorgeschlagenen Termin und fordert zur Bestätigung auf', () => {
    const { html, betreff } = buildKundeReparaturterminEmailHtml({
      vorname: 'Max',
      ereignis: 'werkstatt_vorschlag',
      bestaetigterTermin: '2026-07-15T09:00:00Z',
    })
    expect(betreff).toContain('vorgeschlagen')
    expect(html).toContain('bestätigen')
  })
})
```

- [ ] **Step 2: Test läuft → FAIL** — Run: `npx vitest run src/lib/werkstatt/__tests__/notify-kunde-reparaturtermin.werkstatt-vorschlag.test.ts` — Expected: FAIL (Typ kennt Ereignis nicht).

- [ ] **Step 3: `notify-kunde-reparaturtermin.ts` erweitern**

Typ ergänzen:
```ts
export type ReparaturterminEreignis = 'werkstatt_vorschlag' | 'bestaetigt' | 'anruf_erbeten' | 'abgelehnt'
```
`INAPP_TEXT` um Eintrag ergänzen:
```ts
  werkstatt_vorschlag: {
    titel: 'Terminvorschlag der Werkstatt',
    text: 'Deine Werkstatt hat einen Reparaturtermin vorgeschlagen — bitte bestätigen.',
  },
```
In `buildKundeReparaturterminEmailHtml` einen `else if`-Zweig VOR dem bestehenden `bestaetigt`-Zweig einfügen:
```ts
  if (args.ereignis === 'werkstatt_vorschlag') {
    const terminZeile = args.bestaetigterTermin?.trim()
      ? `<p style="margin:0 0 16px;font-size:15px;">Vorgeschlagener Termin: <strong>${escapeHtml(fmtTermin(args.bestaetigterTermin.trim()))}</strong></p>`
      : ''
    betreff = 'Die Werkstatt hat einen Termin vorgeschlagen'
    inhalt = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">die Werkstatt hat einen Reparaturtermin für Sie vorgeschlagen.</p>
      ${terminZeile}
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Bitte bestätigen Sie den Termin in Ihrem Claimondo-Portal. Passt er nicht, können Sie die Werkstatt direkt anrufen oder einen Rückruf vereinbaren.</p>`
  } else if (args.ereignis === 'bestaetigt') {
    // ... bestehender Code unverändert
```
(Die `if/else if`-Kette so umbauen, dass `werkstatt_vorschlag` der erste Zweig ist; `bestaetigt`/`anruf_erbeten`/`abgelehnt` bleiben inhaltlich unverändert.)

- [ ] **Step 4: Test läuft → PASS** — Run: `npx vitest run src/lib/werkstatt/__tests__/notify-kunde-reparaturtermin.werkstatt-vorschlag.test.ts` — Expected: PASS.

- [ ] **Step 5: Regression — bestehende Notify-Tests grün** — Run: `npx vitest run src/lib/werkstatt` — Expected: alle PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/werkstatt/notify-kunde-reparaturtermin.ts src/lib/werkstatt/__tests__/notify-kunde-reparaturtermin.werkstatt-vorschlag.test.ts
git commit -m "feat(werkstatt): Kunde-Notify Ereignis werkstatt_vorschlag (Email + In-App)"
```

---

## Task 6: Werkstatt-Notify bei Kundenreaktion (Passt / Rückrufbitte)

**Files:**
- Create: `src/lib/werkstatt/notify-werkstatt-kundenreaktion.ts`
- Create: `src/lib/werkstatt/__tests__/notify-werkstatt-kundenreaktion.test.ts`

**Interfaces:**
- Produces: `notifyWerkstattKundenreaktion({ werkstattId, ereignis: 'bestaetigt' | 'rueckruf_erbeten', rueckrufWunschzeit?, svc }): Promise<{ inApp: boolean }>` — löst `werkstaetten.user_id` via Service-Client auf und schickt In-App-Notification an die Werkstatt.
- Consumes: `createNotification` aus `@/lib/notifications`.

- [ ] **Step 1: Failing test schreiben** (Deps-injizierbar, ohne echten Versand)

```ts
// src/lib/werkstatt/__tests__/notify-werkstatt-kundenreaktion.test.ts
import { describe, it, expect, vi } from 'vitest'
import { notifyWerkstattKundenreaktion } from '../notify-werkstatt-kundenreaktion'

function fakeSvc(userId: string | null) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: userId ? { user_id: userId } : null }) }) }) }),
  } as never
}

describe('notifyWerkstattKundenreaktion', () => {
  it('schickt In-App an die Werkstatt bei bestaetigt', async () => {
    const createNotification = vi.fn(async () => {})
    const res = await notifyWerkstattKundenreaktion(
      { werkstattId: 'ws-1', ereignis: 'bestaetigt', svc: fakeSvc('user-ws') },
      { createNotification },
    )
    expect(res.inApp).toBe(true)
    expect(createNotification).toHaveBeenCalledOnce()
  })
  it('kein user_id → kein Notify, kein Fehler', async () => {
    const createNotification = vi.fn(async () => {})
    const res = await notifyWerkstattKundenreaktion(
      { werkstattId: 'ws-x', ereignis: 'rueckruf_erbeten', rueckrufWunschzeit: '2026-07-15T09:00:00Z', svc: fakeSvc(null) },
      { createNotification },
    )
    expect(res.inApp).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test läuft → FAIL** — Run: `npx vitest run src/lib/werkstatt/__tests__/notify-werkstatt-kundenreaktion.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

```ts
// src/lib/werkstatt/notify-werkstatt-kundenreaktion.ts
// In-App-Notification Kunde -> Werkstatt: der Kunde hat einen Werkstatt-Vorschlag
// angenommen (bestaetigt) oder um Rueckruf gebeten (rueckruf_erbeten). Loest die
// werkstatt.user_id via Service-Role auf (Kunde-/Action-Kontext kann werkstaetten
// je nach RLS nicht lesen). Non-fatal by design.
import { createNotification } from '@/lib/notifications'
import type { SupabaseClient } from '@supabase/supabase-js'

export type WerkstattReaktionEreignis = 'bestaetigt' | 'rueckruf_erbeten'
export type NotifyWerkstattDeps = { createNotification: typeof createNotification }
const defaultDeps: NotifyWerkstattDeps = { createNotification }

const BERLIN = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
})

export async function notifyWerkstattKundenreaktion(
  args: { werkstattId: string; ereignis: WerkstattReaktionEreignis; rueckrufWunschzeit?: string | null; svc: SupabaseClient },
  deps: NotifyWerkstattDeps = defaultDeps,
): Promise<{ inApp: boolean }> {
  const { data: w } = await args.svc.from('werkstaetten').select('user_id').eq('id', args.werkstattId).maybeSingle()
  const userId = (w as { user_id: string | null } | null)?.user_id
  if (!userId) return { inApp: false }

  const { titel, text } =
    args.ereignis === 'bestaetigt'
      ? { titel: 'Termin vom Kunden bestätigt', text: 'Der Kunde hat deinen Terminvorschlag bestätigt.' }
      : {
          titel: 'Kunde bittet um Rückruf',
          text: args.rueckrufWunschzeit
            ? `Der Kunde möchte zurückgerufen werden (Wunschzeit: ${BERLIN.format(new Date(args.rueckrufWunschzeit))} Uhr).`
            : 'Der Kunde möchte den Reparaturtermin telefonisch klären.',
        }

  try {
    await deps.createNotification(userId, 'reparatur_termin', titel, text, '/werkstatt/auftraege')
    return { inApp: true }
  } catch (err) {
    console.warn('[notifyWerkstattKundenreaktion] In-App fehlgeschlagen (non-fatal):', err)
    return { inApp: false }
  }
}
```

- [ ] **Step 4: Test läuft → PASS** — Run: `npx vitest run src/lib/werkstatt/__tests__/notify-werkstatt-kundenreaktion.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/werkstatt/notify-werkstatt-kundenreaktion.ts src/lib/werkstatt/__tests__/notify-werkstatt-kundenreaktion.test.ts
git commit -m "feat(werkstatt): notifyWerkstattKundenreaktion (Kunde bestaetigt / bittet um Rueckruf)"
```

---

## Task 7: Werkstatt-Action `schlageWerkstattTerminVor` + KVA-Pfad-Bereinigung

**Files:**
- Modify: `src/app/werkstatt/(shell)/auftraege/actions.ts`

**Interfaces:**
- Consumes: `getWerkstattAuftrag(claimId)` (RLS-View-Ownership-Gate), `createAdminClient`, `createClient`, `resolveWunschterminIso`, `notifyKundeReparaturtermin`.
- Produces (neue exportierte Server-Action):
  `schlageWerkstattTerminVor(claimId: string, terminLokal: string): Promise<{ ok: boolean; error?: string }>` — legt/aktualisiert die aktive `reparatur_termine`-Zeile auf `status='werkstatt_vorschlag'`, `bestaetigter_termin=<utc>`.
- Produces (modul-lokaler Helper, NICHT exportiert): `upsertWerkstattVorschlag(admin, claimId, werkstattId, terminUtc)`.

- [ ] **Step 1: Modul-lokalen Helper `upsertWerkstattVorschlag` in `auftraege/actions.ts` ergänzen** (unterhalb der Imports, oberhalb der ersten Action). Reuse für `schlageWerkstattTerminVor` UND den KVA-Pfad:

```ts
// Legt einen Werkstatt-Terminvorschlag an oder hebt einen bestehenden aktiven Termin
// darauf. status='werkstatt_vorschlag' -> der Kunde muss bestaetigen (bzw. reagiert).
// Admin-Client, weil die Werkstatt in reparatur_termine nur UPDATE (RLS) darf, aber ggf.
// INSERT noetig ist (kein aktiver Termin). Ownership ist VOR dem Aufruf via
// getWerkstattAuftrag geprueft.
async function upsertWerkstattVorschlag(
  admin: ReturnType<typeof createAdminClient>,
  claimId: string,
  werkstattId: string,
  terminUtc: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: aktiv } = await admin
    .from('reparatur_termine')
    .select('id')
    .eq('claim_id', claimId)
    .in('status', ['angefragt', 'werkstatt_vorschlag', 'anruf_erbeten'])
    .order('created_at', { ascending: false })
    .limit(1)
  const bestehend = (aktiv as { id: string }[] | null)?.[0]?.id ?? null

  if (bestehend) {
    const { error } = await admin
      .from('reparatur_termine')
      .update({ status: 'werkstatt_vorschlag', bestaetigter_termin: terminUtc, updated_at: new Date().toISOString() } as never)
      .eq('id', bestehend)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await admin.from('reparatur_termine').insert({
    claim_id: claimId,
    werkstatt_id: werkstattId,
    // kein Kunde-Wunsch -> wunschtermin auf den Werkstatt-Termin setzen (NOT NULL-Spalte),
    // bestaetigter_termin traegt den Vorschlag.
    wunschtermin: terminUtc,
    bestaetigter_termin: terminUtc,
    status: 'werkstatt_vorschlag',
  } as never)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

> Hinweis: `reparatur_termine.wunschtermin` ist `NOT NULL`. Wenn kein Kunde-Wunsch existiert, setzen wir `wunschtermin = terminUtc` (semantisch: „vom Prozess gesetzt"), der Vorschlag lebt in `bestaetigter_termin`. Bei bestehendem Kunde-Wunsch bleibt `wunschtermin` unangetastet.

- [ ] **Step 2: `schlageWerkstattTerminVor` als neue Action ergänzen**

```ts
/**
 * Werkstatt schlaegt (jederzeit, entkoppelt vom KVA) einen Reparaturtermin vor.
 * Weicht er vom Kunde-Wunsch ab bzw. gibt es keinen Wunsch -> status='werkstatt_vorschlag',
 * der Kunde bestaetigt ("Passt") oder reagiert ("Passt nicht").
 * @param terminLokal Berlin-Wandzeit "YYYY-MM-DDTHH:mm" (WunschterminPicker).
 */
export async function schlageWerkstattTerminVor(
  claimId: string,
  terminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!claimId || !terminLokal) return { ok: false, error: 'Auftrag und Termin sind erforderlich.' }

  // Ownership-Gate via RLS-View (Werkstatt sieht nur ihre eigenen Auftraege).
  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) return { ok: false, error: 'Kein Zugriff auf diesen Auftrag.' }
  const werkstattId = auftrag.reparatur_werkstatt_id
  if (!werkstattId) return { ok: false, error: 'Keine Reparatur-Werkstatt gesetzt.' }

  const utc = resolveWunschterminIso(terminLokal)
  if (!utc) return { ok: false, error: 'Ungültiger Termin.' }

  const admin = createAdminClient()
  const res = await upsertWerkstattVorschlag(admin, claimId, werkstattId, utc)
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath(`/werkstatt/auftraege/${claimId}`)
  revalidatePath('/werkstatt/auftraege')

  // Kunde informieren (non-fatal) — bitte um Bestaetigung.
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({ claimId, ereignis: 'werkstatt_vorschlag', bestaetigterTermin: utc, svc })
  } catch (err) {
    console.warn('[schlageWerkstattTerminVor] Kunden-Notify (non-fatal):', err)
  }
  return { ok: true }
}
```

- [ ] **Step 3: KVA-Pfad in `erstelleKvaFuerAuftrag` umstellen** — den bestehenden Block (`if (input.reparaturWunschterminLokal) { ... insert status:'angefragt' ... }`, ~Zeile 354-379) ersetzen durch:

```ts
  // Die Werkstatt schlaegt beim KVA-Upload einen Reparaturtermin vor (non-fatal).
  // Neu: als werkstatt_vorschlag (der Kunde bestaetigt), nicht mehr als Kunde-Wunsch 'angefragt'.
  if (input.reparaturWunschterminLokal) {
    try {
      const utc = resolveWunschterminIso(input.reparaturWunschterminLokal)
      const werkstattId = auftrag.reparatur_werkstatt_id
      if (utc && werkstattId) {
        const res = await upsertWerkstattVorschlag(admin, claimId, werkstattId, utc)
        if (res.ok) {
          const svc = createServiceClient()
          await notifyKundeReparaturtermin({ claimId, ereignis: 'werkstatt_vorschlag', bestaetigterTermin: utc, svc })
        }
      }
    } catch (e) {
      console.error('[werkstatt-auftrag-kva] Reparaturtermin-Vorschlag (nicht kritisch):', e)
    }
  }
```
(`admin` ist in `erstelleKvaFuerAuftrag` bereits vorhanden.)

- [ ] **Step 4: Typecheck** — Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` — Expected: keine neuen Fehler in `auftraege/actions.ts`. (Types der neuen Spalten liegen ggf. hinterher → `as never`-Cast auf den Insert/Update-Objekten ist bereits gesetzt, wie im Bestandscode.)

- [ ] **Step 5: Build (Server-Actions-Route)** — Run: `npm run build` — Expected: grün (Next.js validiert Server-Actions build-time).

- [ ] **Step 6: Commit**

```bash
git add "src/app/werkstatt/(shell)/auftraege/actions.ts"
git commit -m "feat(werkstatt): schlageWerkstattTerminVor (KVA-entkoppelt) + KVA-Termin -> werkstatt_vorschlag"
```

---

## Task 8: Kunde-Actions `akzeptiereWerkstattTermin` + `werkstattTerminPasstNicht`

**Files:**
- Modify: `src/app/kunde/faelle/[id]/reparatur-termin-actions.ts`

**Interfaces:**
- Consumes: `createClient`, `createServiceClient`, `resolveWunschterminIso`, `notifyWerkstattKundenreaktion` (Task 6), Kunde-UPDATE-RLS (Task 2).
- Produces:
  - `akzeptiereWerkstattTermin(terminId: string): Promise<{ ok: boolean; error?: string }>` — `werkstatt_vorschlag → bestaetigt`.
  - `werkstattTerminPasstNicht(terminId: string, rueckrufWunschzeitLokal?: string): Promise<{ ok: boolean; error?: string }>` — `werkstatt_vorschlag → anruf_erbeten` + `rueckruf_wunschzeit`.

- [ ] **Step 1: Beide Actions ans Ende von `reparatur-termin-actions.ts` anfügen** (gleiche Datei, gleiches Muster: auth-aware Client + RLS-Policy trägt die Autorisierung):

```ts
/**
 * Kunde nimmt den Werkstatt-Terminvorschlag an: werkstatt_vorschlag -> bestaetigt.
 * RLS-Policy reparatur_termine_kunde_update erzwingt Owner + Ausgangsstatus.
 */
export async function akzeptiereWerkstattTermin(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!terminId) return { ok: false, error: 'Kein Termin.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ status: 'bestaetigt', updated_at: new Date().toISOString() } as never)
    .eq('id', terminId)
    .eq('status', 'werkstatt_vorschlag')
    .select('claim_id, werkstatt_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder nicht mehr offen.' }

  const row = data as unknown as { claim_id: string; werkstatt_id: string }
  revalidatePath(`/kunde/faelle/${row.claim_id}`)
  try {
    const svc = createServiceClient()
    await notifyWerkstattKundenreaktion({ werkstattId: row.werkstatt_id, ereignis: 'bestaetigt', svc })
  } catch (err) {
    console.error('[akzeptiereWerkstattTermin] Werkstatt-Notify (non-fatal):', err)
  }
  return { ok: true }
}

/**
 * Kunde: der Werkstatt-Vorschlag passt nicht -> anruf_erbeten + optionale Wunsch-Rueckrufzeit.
 * Die Werkstatt ruft zurueck (sie hat den Kalender).
 * @param rueckrufWunschzeitLokal Berlin-Wandzeit "YYYY-MM-DDTHH:mm" (optional).
 */
export async function werkstattTerminPasstNicht(
  terminId: string,
  rueckrufWunschzeitLokal?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!terminId) return { ok: false, error: 'Kein Termin.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const rueckrufUtc = rueckrufWunschzeitLokal ? resolveWunschterminIso(rueckrufWunschzeitLokal) : null

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ status: 'anruf_erbeten', rueckruf_wunschzeit: rueckrufUtc, updated_at: new Date().toISOString() } as never)
    .eq('id', terminId)
    .eq('status', 'werkstatt_vorschlag')
    .select('claim_id, werkstatt_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder nicht mehr offen.' }

  const row = data as unknown as { claim_id: string; werkstatt_id: string }
  revalidatePath(`/kunde/faelle/${row.claim_id}`)
  try {
    const svc = createServiceClient()
    await notifyWerkstattKundenreaktion({ werkstattId: row.werkstatt_id, ereignis: 'rueckruf_erbeten', rueckrufWunschzeit: rueckrufUtc, svc })
  } catch (err) {
    console.error('[werkstattTerminPasstNicht] Werkstatt-Notify (non-fatal):', err)
  }
  return { ok: true }
}
```

- [ ] **Step 2: Import ergänzen** — oben in der Datei: `import { notifyWerkstattKundenreaktion } from '@/lib/werkstatt/notify-werkstatt-kundenreaktion'`. (`createServiceClient` + `resolveWunschterminIso` sind bereits importiert.)

- [ ] **Step 3: Typecheck + Build** — Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` und `npm run build` — Expected: grün.

- [ ] **Step 4: Manuelle RLS-Verifikation dokumentieren** (In-Code-Kommentar oder Marker): Kunde-Session kann `werkstatt_vorschlag → bestaetigt|anruf_erbeten` updaten, aber NICHT `angefragt`/`bestaetigt`-Zeilen (USING gated Ausgangsstatus). Wird durch die `.eq('status','werkstatt_vorschlag')`-Klausel + RLS doppelt abgesichert.

- [ ] **Step 5: Commit**

```bash
git add "src/app/kunde/faelle/[id]/reparatur-termin-actions.ts"
git commit -m "feat(kunde): akzeptiereWerkstattTermin + werkstattTerminPasstNicht (Rueckruf-Wunschzeit)"
```

---

## Task 9: Kunde-UI — `WerkstattCard` Reaktions-Block

**Files:**
- Modify: `src/components/kunde/WerkstattCard.tsx`

**Interfaces:**
- Consumes: `akzeptiereWerkstattTermin`, `werkstattTerminPasstNicht` (Task 8), `PhoneButton`, `WunschterminPicker`, `Button`.
- Produces: nichts (UI).

- [ ] **Step 1: Imports ergänzen** in `WerkstattCard.tsx`:
```ts
import { schlageReparaturTerminVorPortal, akzeptiereWerkstattTermin, werkstattTerminPasstNicht } from '@/app/kunde/faelle/[id]/reparatur-termin-actions'
```
(bestehenden `schlageReparaturTerminVorPortal`-Import damit ersetzen.)

- [ ] **Step 2: Reaktions-Komponente `WerkstattVorschlagReaktion` in der Datei ergänzen** (oberhalb der Haupt-Komponente, unterhalb `VorschlagsUI`):

```tsx
function WerkstattVorschlagReaktion({
  terminId,
  telefon,
}: {
  terminId: string
  telefon: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [passtNichtOffen, setPasstNichtOffen] = useState(false)
  const [rueckrufzeit, setRueckrufzeit] = useState('')
  const [busy, setBusy] = useState(false)

  async function handlePasst() {
    setBusy(true)
    const res = await akzeptiereWerkstattTermin(terminId)
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
    toast.success('Termin bestätigt.')
    startTransition(() => router.refresh())
  }

  async function handleRueckruf() {
    setBusy(true)
    const res = await werkstattTerminPasstNicht(terminId, rueckrufzeit || undefined)
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
    toast.success('Die Werkstatt ruft dich zurück.')
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap gap-2">
        <Button variant="navy" size="sm" loading={busy || isPending} onClick={handlePasst}>
          Passt
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPasstNichtOffen((v) => !v)}>
          Passt nicht
        </Button>
      </div>

      {passtNichtOffen && (
        <div className="space-y-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
          <p className="text-body-sm text-claimondo-ondo">
            Kläre den Termin direkt mit der Werkstatt — sie hat den Kalender im Blick.
          </p>
          {telefon && <PhoneButton nummer={telefon} variant="card" label="Werkstatt anrufen" />}
          <div className="space-y-2">
            <p className="text-body-xs font-medium text-claimondo-navy">Oder Rückruf vereinbaren (optional Wunschzeit):</p>
            <WunschterminPicker value={rueckrufzeit} onChange={setRueckrufzeit} />
            <Button variant="ghost" size="sm" loading={busy || isPending} onClick={handleRueckruf}>
              Rückruf buchen
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: In der Haupt-Komponente den Vorschlag-Zustand rendern** — den bestehenden „Termin-Zustand"-Block (`{termin && termin.status !== 'abgelehnt' && (...)}`) so anpassen, dass bei `status === 'werkstatt_vorschlag'` die Reaktion erscheint. Direkt NACH dem `terminAnzeige`-`<p>` innerhalb dieses Blocks einfügen:

```tsx
            {termin.status === 'werkstatt_vorschlag' && (
              <WerkstattVorschlagReaktion terminId={termin.id} telefon={werkstatt.telefon} />
            )}
```
(Die Zeitanzeige-Zeile schon vorhanden: für `werkstatt_vorschlag` zeigt `terminIso = bestaetigter_termin` den vorgeschlagenen Termin, Label „Wunschtermin: " → ändere die Label-Logik zu:)
```tsx
                {termin.status === 'bestaetigt'
                  ? 'Bestätigt: '
                  : termin.status === 'werkstatt_vorschlag'
                    ? 'Vorschlag der Werkstatt: '
                    : 'Wunschtermin: '}
```

- [ ] **Step 4: Typecheck + Build** — Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` und `npm run build` — Expected: grün.

- [ ] **Step 5: UI-Erreichbarkeit prüfen (7-Punkt-Audit §2)** — Der Reaktions-Block ist erreichbar, sobald `termin.status === 'werkstatt_vorschlag'` (Kunde-Fallakte). Notiere das im Commit-Body.

- [ ] **Step 6: Commit**

```bash
git add src/components/kunde/WerkstattCard.tsx
git commit -m "feat(kunde): WerkstattCard — Passt/Passt-nicht + Werkstatt-Anruf + Rueckrufbuchung"
```

---

## Task 10: DDL — `v_werkstatt_auftrag` um `rueckruf_wunschzeit` + Werkstatt-UI

**Files:**
- Create: `supabase/migrations/<V2>_v_werkstatt_auftrag_rueckruf_wunschzeit.sql`
- Modify: `src/lib/werkstatt/queries.ts` (`WerkstattAuftrag`-Type + `AUFTRAG_SELECT`)
- Modify: `src/components/werkstatt/WerkstattAuftragDetail.tsx`

**Interfaces:**
- Produces: `v_werkstatt_auftrag.reparatur_rueckruf_wunschzeit`; `WerkstattAuftrag.reparatur_rueckruf_wunschzeit: string | null`.
- Consumes: `schlageWerkstattTerminVor` (Task 7), `WunschterminPicker`, `resolveWunschterminIso` (nur zur Anzeige nicht nötig).

- [ ] **Step 1: View-Migration schreiben** — `CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS <bestehende Definition>` mit der zusätzlichen Select-Spalte im `rt`-LATERAL-Block. Hole die aktuelle Definition via `execute_sql`:
```sql
SELECT pg_get_viewdef('public.v_werkstatt_auftrag'::regclass, true);
```
Dann im `LEFT JOIN LATERAL (... FROM reparatur_termine rt_inner ...)` `rt_inner.rueckruf_wunschzeit` ergänzen und im äußeren SELECT `rt.rueckruf_wunschzeit AS reparatur_rueckruf_wunschzeit` hinzufügen. **Wichtig:** Definition 1:1 übernehmen, nur additiv erweitern (keine Spalte/Join entfernen).

- [ ] **Step 2: `apply_migration` → `list_migrations` → File committen** als `supabase/migrations/<V2>_v_werkstatt_auftrag_rueckruf_wunschzeit.sql`.

- [ ] **Step 3: Definer-View-Gate prüfen** — `execute_sql`: `SELECT * FROM audit_ungated_definer_views();` Expected: 0 Zeilen (die View behält ihr `is_staff() OR is_werkstatt_for_claim`-Gate).

- [ ] **Step 4: `WerkstattAuftrag`-Type + `AUFTRAG_SELECT` in `queries.ts` erweitern** — Feld `reparatur_rueckruf_wunschzeit: string | null` zum Type; `reparatur_rueckruf_wunschzeit` in die `AUFTRAG_SELECT`-Spaltenliste (bei den anderen `reparatur_*`-Feldern).

- [ ] **Step 5: `WerkstattAuftragDetail.tsx` — „Anderen Termin vorschlagen" + Rückrufzeit-Anzeige** in `ReparaturterminSektion`:

Imports ergänzen:
```ts
import { bestaetigeReparaturtermin, erbitteRueckruf, lehneReparaturterminAb, oeffneGutachtenPdf, schlageWerkstattTerminVor } from '@/app/werkstatt/(shell)/auftraege/actions'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
```
State + Handler in `ReparaturterminSektion` ergänzen:
```ts
  const [vorschlagOffen, setVorschlagOffen] = useState(false)
  const [neuerTermin, setNeuerTermin] = useState('')
  const [vorschlagLaden, setVorschlagLaden] = useState(false)

  async function handleVorschlag() {
    if (!neuerTermin) return
    setVorschlagLaden(true)
    const result = await schlageWerkstattTerminVor(auftrag.claim_id, neuerTermin)
    setVorschlagLaden(false)
    if (!result.ok) { toast.error(result.error ?? 'Vorschlag fehlgeschlagen'); return }
    setVorschlagOffen(false)
    setNeuerTermin('')
    toast.success('Terminvorschlag gesendet – der Kunde bestätigt ihn.')
    startTransition(() => router.refresh())
  }
```
Rückrufzeit-Anzeige (nach dem Status-Badge-Block, wenn gesetzt):
```tsx
          {auftrag.reparatur_rueckruf_wunschzeit && (
            <p className="text-body-sm text-warning-strong">
              Kunde bittet um Rückruf (Wunschzeit:{' '}
              {formatBerlin(auftrag.reparatur_rueckruf_wunschzeit, {
                weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}{' '}Uhr)
            </p>
          )}
```
Im `aktionOffen`-Button-Block (`status === 'angefragt' || 'anruf_erbeten'`) einen weiteren Button + Inline-Picker ergänzen:
```tsx
              <Button variant="ghost" size="sm" disabled={bestätigenLaden || anrufLaden || ablehnenLaden} onClick={() => setVorschlagOffen((v) => !v)}>
                Anderen Termin vorschlagen
              </Button>
```
und unterhalb der Button-Reihe:
```tsx
          {vorschlagOffen && (
            <div className="space-y-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
              <WunschterminPicker value={neuerTermin} onChange={setNeuerTermin} />
              <Button variant="navy" size="sm" disabled={!neuerTermin} loading={vorschlagLaden} onClick={handleVorschlag}>
                Vorschlag senden
              </Button>
            </div>
          )}
```

- [ ] **Step 6: `aktionOffen` um `werkstatt_vorschlag` erweitern** — damit die Werkstatt einen bereits gesendeten Vorschlag ggf. ändern kann:
```ts
  const aktionOffen = status === 'angefragt' || status === 'anruf_erbeten' || status === 'werkstatt_vorschlag'
```

- [ ] **Step 7: Typecheck + Build** — Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` und `npm run build` — Expected: grün.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/<V2>_v_werkstatt_auftrag_rueckruf_wunschzeit.sql src/lib/werkstatt/queries.ts "src/components/werkstatt/WerkstattAuftragDetail.tsx"
git commit -m "feat(werkstatt): Auftrag-UI Termin vorschlagen + Rueckrufzeit anzeigen (v_werkstatt_auftrag additiv)"
```

---

## Task 11: Portal-Gate + Staff-Reminder db-driven (`reparaturPhaseErreicht`)

**Files:**
- Modify: `src/app/kunde/faelle/[id]/page.tsx`
- Modify: die Render-Stelle(n) von `WerkstattVermittelnCard` (`src/app/gutachter/fall/[id]/...` + ggf. `faelle/[id]/page.tsx`)

**Interfaces:**
- Consumes: `reparaturPhaseErreicht` (Task 4), `brauchtWerkstattVermittlung` (bestehend).

- [ ] **Step 1: In `kunde/faelle/[id]/page.tsx` die Gutachten-Daten für das Gate bereitstellen** — prüfe, ob `claimExtra` bereits `abrechnungsweg`, `totalschaden` (aus `v_gutachten_werte`, ~Zeile 375) und ein „Gutachten fertig"-Signal enthält. Falls `fertiggestellt_am` fehlt, ergänze es aus dem bereits geladenen Gutachten-Read (bzw. nutze `fall.gutachten_eingegangen_am` als Fertig-Signal). Baue ein `gutachtenGate = { fertiggestellt_am: <iso|null>, totalschaden: <bool|null> }`.

- [ ] **Step 2: `WerkstattFinderCard`-Gate erweitern** — die bestehende Bedingung (`brauchtWerkstattVermittlung(claimExtra)`, ~Zeile 1040):
```tsx
{claimExtra && brauchtWerkstattVermittlung(claimExtra) && reparaturPhaseErreicht(claimExtra, gutachtenGate) && (
  <WerkstattFinderCard claimId={fall.claim_id} />
)}
```
Import ergänzen: `import { reparaturPhaseErreicht } from '@/lib/werkstatt/reparatur-phase-erreicht'`.

- [ ] **Step 3: Staff-Reminder (`WerkstattVermittelnCard`) analog gaten** — überall wo `WerkstattVermittelnCard` gerendert wird (KB/Dispatch in `faelle/[id]`, SV in `gutachter/fall/[id]`), die Sichtbarkeit zusätzlich an `reparaturPhaseErreicht(claim, gutachtenGate)` binden, damit Staff bei Haftpflicht nicht vor dem Gutachten zum Vermitteln aufgefordert wird. Wenn die Render-Stelle die Gutachten-Felder nicht lädt, sie additiv nachladen (`abrechnungsweg`, `gutachten.fertiggestellt_am`, `totalschaden`).

- [ ] **Step 4: Typecheck + Build** — Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` und `npm run build` — Expected: grün.

- [ ] **Step 5: Regression prüfen (7-Punkt §7)** — Selbstzahler/Kasko: `reparaturPhaseErreicht` = true → Verhalten unverändert. Haftpflicht vor Gutachten: Finder/Reminder verschwinden (gewollt). Notiere im Commit-Body.

- [ ] **Step 6: Commit**

```bash
git add "src/app/kunde/faelle/[id]/page.tsx" "src/app/gutachter/fall/[id]"
git commit -m "feat(werkstatt): Portal-Werkstattwahl + Staff-Reminder db-driven (Haftpflicht post-Gutachten)"
```

---

## Task 12: Haftpflicht-Flow-Touch (leicht) — mitgegebene Werkstatt zeigen / Vermittlungs-Intent

**Files:**
- Create: `src/app/flow/[token]/FlowWerkstattHinweisHaftpflicht.tsx`
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (Einbindung — additiv, STEPS-Array möglichst unberührt)

> **Vor dem Bau:** In der Spec §3.4 als Review-Item markiert (genaue Platzierung). **Erst mit Aaron bestätigen**, wo der Touch sitzt (read-only Zeile in der Flow-Zusammenfassung vs. eigener Mini-Hinweis vor dem SA-Schritt). Diese Task erst starten, wenn die Platzierung bestätigt ist. Hot-File-Kollision (`flow/[token]/*`): vor+nach `git grep` gegen parallele Sessions.

**Interfaces:**
- Consumes: die im Flow bereits geladenen Lead-Felder (`reparatur_werkstatt_id` → Werkstatt-Name/Ort, `reparatur_werkstatt_extern`, `abrechnungsweg`).
- Produces: reine Anzeige-Komponente (kein neuer Write-Pfad; Skip = nichts tun → `reparatur_vermittlung_status` bleibt `'offen'` → Post-Conversion-Reminder).

- [ ] **Step 1: Read-only Komponente bauen**

```tsx
'use client'
// Leichter Haftpflicht-Flow-Touch: zeigt eine mitgegebene Werkstatt an bzw. weist darauf
// hin, dass wir nach dem Gutachten vermitteln. KEIN Wunschtermin (Reparatur erst nach Gutachten).
export function FlowWerkstattHinweisHaftpflicht({
  werkstattName,
}: {
  werkstattName: string | null
}) {
  return (
    <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
      <h3 className="text-body-sm font-semibold text-claimondo-navy">Reparaturwerkstatt</h3>
      {werkstattName ? (
        <p className="text-body-sm text-claimondo-ondo mt-1">
          Deine Werkstatt: <strong className="text-claimondo-navy">{werkstattName}</strong>. Wir
          koordinieren die Reparatur nach dem Gutachten.
        </p>
      ) : (
        <p className="text-body-sm text-claimondo-ondo mt-1">
          Nach dem Gutachten vermitteln wir dir eine passende Werkstatt in deiner Nähe – oder du
          nennst uns deine eigene.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Einbinden** an der mit Aaron bestätigten Stelle (nur bei `abrechnungsweg === 'haftpflicht'`), Werkstatt-Name aus der bereits im Flow geladenen Werkstatt-Auflösung (bzw. `reparatur_werkstatt_extern`).

- [ ] **Step 3: Typecheck + Build** — Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` und `npm run build` — Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add "src/app/flow/[token]/FlowWerkstattHinweisHaftpflicht.tsx" "src/app/flow/[token]/FlowWizardKfz.tsx"
git commit -m "feat(flow): leichter Haftpflicht-Werkstatt-Hinweis (mitgegebene zeigen / Vermittlung nach Gutachten)"
```

---

## Task 13: E2E-Prod-Smoke (Haftpflicht-Verhandlung)

**Files:**
- Nutze/erweitere `scripts/smoke/werkstatt-finder-seed.mjs` + `tests/e2e/flows/werkstatt-finder-smoke.spec.ts` (bestehend). `telefon=NULL`-Isolation, `--clean`.

- [ ] **Step 1: Szenario definieren** — Haftpflicht-Claim mit fertigem Gutachten (kein Totalschaden), gesetzte Test-Werkstatt (`badecb82`), Smoke-SV.

- [ ] **Step 2: Ablauf smoken** (gegen Prod nach Deploy):
  1. Kunde-Portal: Werkstatt-Wahl erscheint (Gutachten fertig) → Werkstatt wählen → Wunschtermin vorschlagen.
  2. Werkstatt-Portal: Auftrag → „Anderen Termin vorschlagen" (abweichend) → `werkstatt_vorschlag`.
  3. Kunde-Portal: „Werkstatt schlägt Termin vor" → „Passt nicht" → Rückruf buchen (Wunschzeit).
  4. Werkstatt-Portal: „Kunde bittet um Rückruf (Wunschzeit …)" sichtbar.
  5. Alternativ: Kunde „Passt" → `bestaetigt` → Werkstatt-In-App „Termin bestätigt".

- [ ] **Step 3: Aufräumen** — `--clean` entfernt die Test-Daten; verifizieren dass alles weg ist.

- [ ] **Step 4: Ergebnis im Marker dokumentieren** (`COORDINATION-werkstatt-flowlink-haftpflicht-codesign`).

---

## Self-Review (gegen Spec)

**Spec-Coverage:**
- §2 Lifecycle `werkstatt_vorschlag` → Task 2 (DDL) + 3 (Phase) + 7 (Werkstatt-Action) + 8 (Kunde-Actions). ✓
- §2 Anruf + Rückrufbuchung (Werkstatt ruft zurück) → Task 2 (`rueckruf_wunschzeit`) + 8 (`werkstattTerminPasstNicht`) + 6 (Werkstatt-Notify) + 9 (UI PhoneButton + Picker) + 10 (Anzeige). ✓
- §2 KVA-Entkopplung → Task 7 (`schlageWerkstattTerminVor` + KVA-Pfad → `werkstatt_vorschlag`). ✓
- §3 db-driven Gate → Task 4 (`reparaturPhaseErreicht`) + 11 (Verdrahtung Portal + Staff-Reminder). ✓
- §3 Flow-Touch leicht → Task 12. ✓
- §4 Bug A/B Verifikation + Tests → Task 1 (+ Prod-Verifikations-Queries). ✓
- Anf. 2 Finder nahe Besichtigungsort → bestehend, im Portal via Task 11 nach Gutachten sichtbar. ✓
- Anf. 4 Skip → Reminder → Task 11 (Gate) + 12 (Skip lässt `status='offen'`). ✓

**Placeholder-Scan:** Kein „TBD/TODO" in Code-Steps. Task 12 hat eine bewusste Review-Vorbedingung (Platzierung) — kein Platzhalter, sondern ein Gate. Task 11 Step 1 verlangt Feld-Verifikation in `page.tsx` (der Executor hat die Datei).

**Typ-Konsistenz:** `reparaturPhaseErreicht(claim, gutachten)` Signatur identisch in Task 4/11. `ReparaturterminEreignis` erweitert (Task 5) wird von Task 7 (`werkstatt_vorschlag`) konsumiert. `schlageWerkstattTerminVor(claimId, terminLokal)` in Task 7 = Aufruf in Task 10. `akzeptiereWerkstattTermin`/`werkstattTerminPasstNicht` in Task 8 = Aufruf in Task 9. `reparatur_rueckruf_wunschzeit` in Task 10 (View+Type) = Anzeige in Task 10 Step 5. ✓

**Reihenfolge/Abhängigkeiten:** 1 (Tests) → 2 (DDL) → 3,4,5,6 (reine Helper, parallelisierbar) → 7 (nutzt 2,5) → 8 (nutzt 2,6) → 9 (nutzt 8) → 10 (nutzt 7, DDL-View) → 11 (nutzt 4) → 12 (Review-gated) → 13 (Smoke, nach Deploy).

---

## Execution Handoff

Diese Session (Co-Design) **stoppt hier** (Aaron: „6c630247 übernimmt"). Der ausführende Worker:
- Baut auf `kitta/werkstatt-flowlink-haftpflicht` (enthält Spec + diesen Plan) — Branch ist gepusht.
- Nutzt **subagent-driven-development** (frischer Subagent pro Task, Review dazwischen) ODER **executing-plans** (inline mit Checkpoints).
- Braucht das **Supabase-Plugin verbunden** für Task 2/10 (`apply_migration`).
- Beachtet die **Kunden-Outbound-Regel**: neuer `werkstatt_vorschlag`-Notify an den Kunden → vor dem Prod-Release Aaron fragen (Merge-Session-Regel).
- Merge-Session `35660476` released grüne staging-PRs automatisch.
