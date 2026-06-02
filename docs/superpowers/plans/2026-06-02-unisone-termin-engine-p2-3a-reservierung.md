# Unisone Termin-Engine — Phase 2.3a (Reservierungs-Kern) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). **DDL fährt der Controller selbst (Regel 2), Code + 2-stufiges Review via Subagent.** Verify-RUN braucht volle node_modules (frischer Worktree → `npm ci`) ODER SQL-DO-Block-Beweis (wie P2.2).

**Goal:** Die race-sichere **Reservierung** als erste Engine-Write-Op bauen: `reserviere(...)` legt einen `reserviert`-Termin mit `reserviert_bis`-TTL an, **physisch konfliktfrei** über den P2.2-Exclusion-Constraint (catch `23P01`), plus eine **fail-closed** Belegungs-Prüfung für Write-Gates und die zentrale **TTL-Expiry**. Fundament für `bestaetige` (P2.3b) und entsperrt die Self-Service-/P4-Session (die erwartet, dass die Engine die TTL ownt).

**Architecture:** Additiv, fast reiner Code. Neue Datei `engine/writes.ts` mit `reserviere` (constraint-gated, dual-write `assignee_*` + Legacy-FK für Phase-3-Lesbarkeit). Neue **fail-closed** Lese-Varianten `ladeBelegungStrict`/`pruefeBelegungStrict` (Result-Object) **neben** den bestehenden fail-open (die `freieSlots`/#2219 bewusst braucht) — kein Verhalten der gemergten P2.1a-Reader ändern. Eine **DDL**: die bestehende Cron-Funktion `expire_geblockte_termine_ohne_sa()` (CMM-25, läuft alle 5 Min) wird per `CREATE OR REPLACE` um eine `reserviert_bis < now()`-Klausel erweitert (DRY — **kein** zweiter Cron). `reserviere` ist NICHT verdrahtet (Consumer-Repoint = Phase 3).

**Tech Stack:** TypeScript/Next.js 16, PostgreSQL/Supabase (DDL **nur** via `apply_migration`, Regel 2), tsx-Verify (Muster `verify-engine-belegung.mts`). Build-Gate `npx tsc --noEmit`.

---

## ⚠️ Koordination

- **DDL auf geteilter prod+staging-DB** (`paizkjajbuxxksdoycev`). Vor der Migration Live-Recheck. Die EINZIGE DDL hier (`CREATE OR REPLACE FUNCTION expire_geblockte_termine_ohne_sa`) ist additiv (erweitert die WHERE), low-risk.
- **Regel 1** PR gegen staging · **Regel 2** apply_migration → File == getrackte Version · **Regel 3** kein Stash am Ende.
- **Branch:** `kitta/termin-engine-p2-3a`, frisch aus `origin/staging` (Worktree angelegt). Hängt logisch an P2.2 (Spalten `reserviert_bis`/`quelle`/`bezug_*` + Constraint sind **live in der DB**; Migration-Files in PR #2231). Types werden hier aus der Live-DB regeneriert (P2.2 schob den Regen auf — jetzt ist `reserviere` der erste Consumer).
- **Self-Service-Session koordinieren:** `reserviereSlot` (`src/lib/onboarding/slots.ts:298`) ist **kaputt** — es inserted `typ:'vor_ort'` (CHECK erlaubt nur `sv_begutachtung/kb_beratung/konfrontation`) UND `status:'pre_flowlink_reserviert'` (nicht im status-CHECK); der Call ist fire-and-forget mit geschlucktem Error (`WizardClient.tsx:354`) → Reservierungen scheitern **still**. NICHT hier unilateral fixen (fremder Flow) — die Engine-`reserviere` ist der korrekte Ersatz (Phase-3-Repoint fixt es). Im PR-Body notieren.
- 7-Punkte-Audit je Commit. **[[Write-Tool </content>-Artefakt]]** nach jedem Write scannen.

---

## Live-Grounding (02.06.2026, verifiziert)

- **P2.2 live:** Spalten `reserviert_bis`/`quelle`/`bezug_typ`/`bezug_id` da; Exclusion-Constraint `gutachter_termine_no_assignee_overlap` aktiv (EXCLUDE auf `assignee_typ`/`assignee_id`/`tstzrange`, WHERE `status-aktiv AND cancelled_at IS NULL`); Normalize-Trigger füllt `assignee_*` aus Legacy-FKs.
- **status-CHECK:** `reserviert, bestaetigt, abgelehnt, abgesagt, storniert, abgeschlossen, sv_gesucht, gegenvorschlag, verschoben, verlegt, verlegung_pending`. **typ-CHECK:** `sv_begutachtung, kb_beratung, konfrontation`.
- **Bestehende TTL (CMM-25):** Cron `cmm25-expire-geblockte-termine` (`*/5 * * * *`) ruft `public.expire_geblockte_termine_ohne_sa()` (SECURITY DEFINER, `search_path=public`): flippt `status='reserviert' AND fall_id IS NULL AND created_at < now()-interval '1 hour'` → `'storniert'`. **Grob (created_at, 1h, nur fall_id-NULL).** Wird hier um die feine `reserviert_bis`-Regel erweitert.
- **Konstanten:** `TERMIN_DAUER_MIN=45`/`TERMIN_PUFFER_MIN=60` in `src/lib/dispatch/termin-konstanten.ts`; `KB_BERATUNG_DURATION_MIN=30` in `src/lib/termine/constants.ts`.
- **Engine heute:** `engine/index.ts` exportiert types + `rowToFenster`/`ladeBelegung`/`pruefeBelegung` (P2.1a, fail-open). `pruefeBelegung` JSDoc warnt bereits vor fail-open im Write-Pfad.
- **Geocoding/auftraege = P2.3b** (nicht hier). `reserviere` setzt KEIN bezug-Legacy (claim_id/fall_id/lead_id) → vermeidet den `validate_gutachter_termine_claim_id`-Trigger (wirft wenn fall_id ohne claim_id); nur die neuen `bezug_typ`/`bezug_id` optional.

---

## Design-Entscheidungen (begründet)

1. **`reserviere` ist constraint-gated, nicht prüf-gated.** Der P2.2-Exclusion-Constraint ist die **atomare** Race-Safe-Garantie: INSERT mit `status='reserviert'` → bei Konflikt `23P01` → `{ok:false, code:'belegt'}`. Kein Check-then-act-Race. `pruefeBelegungStrict` ist nur ein **vorgelagerter** Höflichkeits-Check (saubere Fehlermeldung + spart den Insert-Versuch).
2. **fail-closed NUR als neue Varianten** (`ladeBelegungStrict`/`pruefeBelegungStrict`, Result-Object). Die bestehenden fail-open `ladeBelegung`/`pruefeBelegung` bleiben **unverändert** — `freieSlots` (P2.1c/#2219) braucht fail-open (DB-Fehler → Slots trotzdem zeigen, degradiert). Write-Pfade nutzen die strict-Variante (DB-Fehler → NICHT buchen).
3. **Dual-Write `assignee_*` + Legacy-FK.** `reserviere` setzt `assignee_typ`/`assignee_id` (kanonisch) **und** die passende Legacy-Spalte (`sachverstaendiger→sv_id`, `sv_lead→sv_lead_id`, `kundenbetreuer→kb_id`; `kanzlei` hat keine) → von P2.2-Normalize-Trigger unabhängig sichtbar für ALTE Reader (dispatch etc.), bis Phase 3 sie repointet. Vorwärtskompatibel.
4. **TTL = bestehende Cron-Funktion erweitern, kein zweiter Cron** (DRY, Redundanz-Check). `reserviert_bis`-Regel ergänzt die grobe CMM-25-Regel; beide Pfade flippen → `'storniert'` (fällt aus Constraint-WHERE + v_belegung). 5-Min-Granularität ⇒ Slot frei ≤5 Min nach TTL-Ablauf (ok für 15-Min-Reservierungen). Lazy-Expiry-in-reserviere = YAGNI (Cron reicht).
5. **`reserviert_bis` = now()+`RESERVIERUNG_TTL_MIN` (15).** Neue Konstante `RESERVIERUNG_TTL_MIN` in `engine/constants.ts`. `Date.now()` ist in normalem Engine-Code erlaubt (nur Workflow-Skripte verbieten es).
6. **Valides `typ`** default `sv_begutachtung` (Live-Realität; `vor_ort` ist der reserviereSlot-Bug). bezug optional, nur `bezug_typ`/`bezug_id` (neu), kein Legacy-bezug (Trigger-Falle).

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/lib/termine/engine/constants.ts` | `RESERVIERUNG_TTL_MIN = 15` (+ re-export TERMIN_DAUER_MIN für die Engine) | Create |
| `src/lib/termine/engine/belegung.ts` | `ladeBelegungStrict`/`pruefeBelegungStrict` (Result-Object) neben den fail-open | Modify |
| `src/lib/termine/engine/writes.ts` | `reserviere(input): Result` — constraint-gated, dual-write, TTL | Create |
| `src/lib/termine/engine/writes.test.ts` | Vitest: assignee→Legacy-Mapping (pure) + TTL-Berechnung (pure Helper) | Create |
| `src/lib/termine/engine/index.ts` | `reserviere` + strict-Reader + RESERVIERUNG_TTL_MIN exportieren | Modify |
| `supabase/migrations/<V>_expire_reservierung_ttl.sql` | `CREATE OR REPLACE expire_geblockte_termine_ohne_sa()` + `reserviert_bis`-Klausel | Create (Controller-DDL) |
| `scripts/verify-engine-p2-3a-reservierung.mts` | Live-Verify: reserviere ok → 2. überlappend `belegt` (23P01) → fail-closed bei DB-Fehler → TTL-Expiry flippt → Cleanup | Create |
| `src/lib/database.types.ts` (o.ä.) | Typen-Regen aus Live-DB (reserviert_bis/quelle/bezug_* jetzt konsumiert) | Modify (generate_typescript_types) |

`<V>` = getrackte Version (`list_migrations` ablesen).

---

## Task 1: Engine-Konstante + fail-closed Lese-Varianten (Code, Subagent + TDD)

**Files:** Create `engine/constants.ts`; Modify `engine/belegung.ts`, `engine/index.ts`

- [ ] **Step 1: `engine/constants.ts`**

```typescript
// Reservierungs-TTL: wie lange ein 'reserviert'-Hold gilt, bevor die zentrale
// Expiry (Cron expire_geblockte_termine_ohne_sa) ihn auf 'storniert' flippt.
export const RESERVIERUNG_TTL_MIN = 15
```

- [ ] **Step 2: Failing-Test** in `belegung.test.ts` — `pruefeBelegungStrict` liefert bei DB-Fehler `{ok:false}` (nicht 'frei'):

```typescript
it('pruefeBelegungStrict ist fail-closed: DB-Fehler → ok:false', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ lt: () => ({ gt: () => ({ order: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) }) }) } as never
  const r = await pruefeBelegungStrict({ typ: 'sachverstaendiger', id: 'sv-1' }, '2099-01-01T00:00:00Z', '2099-01-01T01:00:00Z', db)
  expect(r.ok).toBe(false)
})
```

- [ ] **Step 3: RED** — `npx vitest run src/lib/termine/engine/belegung.test.ts` → FAIL (pruefeBelegungStrict undefined).

- [ ] **Step 4: Implementieren** in `belegung.ts` (neben den bestehenden, fail-open lassen):

```typescript
export type BelegungStrict =
  | { ok: true; fenster: BelegungsFenster[] }
  | { ok: false; error: string }

/** Fail-CLOSED Variante von ladeBelegung: DB-Fehler → {ok:false} statt []. Für Write-Gates. */
export async function ladeBelegungStrict(
  assignee: Assignee, vonIso: string, bisIso: string, db?: SupabaseClient,
): Promise<BelegungStrict> {
  const client: SupabaseClient = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { data, error } = await client
    .from('v_belegung').select('*')
    .eq('assignee_typ', assignee.typ).eq('assignee_id', assignee.id)
    .lt('start_zeit', bisIso).gt('end_zeit', vonIso)
    .order('start_zeit', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((r) => r.start_zeit != null && r.end_zeit != null)
  return { ok: true, fenster: (rows as unknown as VBelegungRow[]).map(rowToFenster) }
}

/** Fail-CLOSED Belegungs-Prüfung. {ok:false} bei DB-Fehler → Caller bucht NICHT blind. */
export async function pruefeBelegungStrict(
  assignee: Assignee, vonIso: string, bisIso: string, db?: SupabaseClient,
): Promise<{ ok: true; frei: boolean } | { ok: false; error: string }> {
  const r = await ladeBelegungStrict(assignee, vonIso, bisIso, db)
  if (!r.ok) return r
  return { ok: true, frei: r.fenster.length === 0 }
}
```

- [ ] **Step 5: GREEN** — `npx vitest run …/belegung.test.ts` → PASS. `index.ts`: `ladeBelegungStrict`/`pruefeBelegungStrict`/`BelegungStrict` exportieren.

- [ ] **Step 6: Commit** (7-Punkt-Audit).

---

## Task 2: `reserviere` — constraint-gated Write-Op (Code, Subagent + TDD)

**Files:** Create `engine/writes.ts`, `engine/writes.test.ts`; Modify `engine/index.ts`

- [ ] **Step 1: Pure-Helper-Tests** (`writes.test.ts`) — assignee→Legacy-Spalten-Mapping + TTL-ISO sind testbar ohne DB:

```typescript
import { describe, it, expect } from 'vitest'
import { assigneeLegacyPatch } from './writes'

describe('assigneeLegacyPatch', () => {
  it('sachverstaendiger → sv_id', () => expect(assigneeLegacyPatch({ typ: 'sachverstaendiger', id: 'a' })).toEqual({ sv_id: 'a' }))
  it('sv_lead → sv_lead_id', () => expect(assigneeLegacyPatch({ typ: 'sv_lead', id: 'b' })).toEqual({ sv_lead_id: 'b' }))
  it('kundenbetreuer → kb_id', () => expect(assigneeLegacyPatch({ typ: 'kundenbetreuer', id: 'c' })).toEqual({ kb_id: 'c' }))
  it('kanzlei → {} (keine Legacy-Spalte)', () => expect(assigneeLegacyPatch({ typ: 'kanzlei', id: 'd' })).toEqual({}))
})
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/termine/engine/writes.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** `engine/writes.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BezugTyp } from './types'
import { pruefeBelegungStrict } from './belegung'
import { RESERVIERUNG_TTL_MIN } from './constants'

export type TerminTyp = 'sv_begutachtung' | 'kb_beratung' | 'konfrontation'
export type Quelle = 'dispatch' | 'self_service' | 'manuell'

export interface ReserviereInput {
  assignee: Assignee
  von: string // ISO start
  bis: string // ISO end
  quelle: Quelle
  typ?: TerminTyp // default sv_begutachtung
  bezug?: { typ: BezugTyp; id: string }
  ttlMin?: number // default RESERVIERUNG_TTL_MIN
  db?: SupabaseClient
}
export type ReserviereResult =
  | { ok: true; terminId: string; reserviertBis: string }
  | { ok: false; error: string; code: 'belegt' | 'db' }

/** assignee → passende Legacy-FK-Spalte (Dual-Write für Phase-3-Lesbarkeit). kanzlei = keine. */
export function assigneeLegacyPatch(a: Assignee): Record<string, string> {
  switch (a.typ) {
    case 'sachverstaendiger': return { sv_id: a.id }
    case 'sv_lead': return { sv_lead_id: a.id }
    case 'kundenbetreuer': return { kb_id: a.id }
    default: return {}
  }
}

/**
 * Reserviert einen Slot (status='reserviert' + reserviert_bis-TTL). Race-sicher über den
 * Exclusion-Constraint gutachter_termine_no_assignee_overlap: bei Überlappung wirft der
 * INSERT 23P01 → {ok:false, code:'belegt'}. pruefeBelegungStrict ist nur Vor-Check (fail-closed).
 * Dual-Write assignee_* + Legacy-FK. KEIN Legacy-bezug (claim_id/fall_id) → validate-Trigger-Falle.
 */
export async function reserviere(input: ReserviereInput): Promise<ReserviereResult> {
  const { assignee, von, bis, quelle, typ = 'sv_begutachtung', bezug, ttlMin = RESERVIERUNG_TTL_MIN } = input
  const db: SupabaseClient = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()

  const pre = await pruefeBelegungStrict(assignee, von, bis, db)
  if (!pre.ok) return { ok: false, error: pre.error, code: 'db' }
  if (!pre.frei) return { ok: false, error: 'Slot belegt', code: 'belegt' }

  const reserviertBis = new Date(Date.now() + ttlMin * 60_000).toISOString()
  const row: Record<string, unknown> = {
    assignee_typ: assignee.typ,
    assignee_id: assignee.id,
    ...assigneeLegacyPatch(assignee),
    start_zeit: von,
    end_zeit: bis,
    status: 'reserviert',
    reserviert_bis: reserviertBis,
    quelle,
    typ,
    ...(bezug ? { bezug_typ: bezug.typ, bezug_id: bezug.id } : {}),
  }
  const { data, error } = await db.from('gutachter_termine').insert(row).select('id').single()
  if (error) {
    if (error.code === '23P01') return { ok: false, error: 'Slot belegt', code: 'belegt' }
    return { ok: false, error: error.message, code: 'db' }
  }
  return { ok: true, terminId: data!.id as string, reserviertBis }
}
```

- [ ] **Step 4: GREEN + tsc** — `npx vitest run …/writes.test.ts` (4/4) + `npx tsc --noEmit`. `index.ts`: `reserviere` + Typen exportieren.

- [ ] **Step 5: Commit** (7-Punkt-Audit).

---

## Task 3: TTL-Expiry erweitern (Controller-DDL, Regel 2)

**Files:** Create `supabase/migrations/<V>_expire_reservierung_ttl.sql`

- [ ] **Step 1: RED + Live-Recheck** — `execute_sql` (READ): bestätige die aktuelle Funktion + dass keine `reserviert_bis`-Klausel drin ist:
```sql
SELECT pg_get_functiondef('public.expire_geblockte_termine_ohne_sa'::regproc) AS def;
```
Expected: enthält `created_at < now() - interval '1 hour'`, **kein** `reserviert_bis`.

- [ ] **Step 2: Migration anwenden (Plugin)** — `apply_migration({ name: "expire_reservierung_ttl", query: <DDL> })`:
```sql
-- P2.3a: zentrale Reservierungs-Expiry. Erweitert die CMM-25-Funktion (genutzt vom Cron
-- cmm25-expire-geblockte-termine, */5) um die FEINE reserviert_bis-TTL der Engine — DRY,
-- kein zweiter Cron. Bestehende grobe Regel (fall_id NULL + created_at>1h) bleibt als
-- Fallback für Reservierungen OHNE reserviert_bis (Legacy). Beide flippen -> 'storniert'.
CREATE OR REPLACE FUNCTION public.expire_geblockte_termine_ohne_sa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.gutachter_termine
       SET status = 'storniert', updated_at = now()
     WHERE status = 'reserviert'
       AND (
         (reserviert_bis IS NOT NULL AND reserviert_bis < now())               -- feine Engine-TTL
         OR (reserviert_bis IS NULL AND fall_id IS NULL                          -- grobe Legacy-Regel
             AND created_at < now() - interval '1 hour')
       )
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;
```

- [ ] **Step 3: GREEN** — `execute_sql` (READ): Funktion enthält jetzt `reserviert_bis`; transaktionaler Beweis (zurückgerollt, kein Reststaat), dass eine abgelaufene Reservierung geflippt würde:
```sql
SELECT pg_get_functiondef('public.expire_geblockte_termine_ohne_sa'::regproc) LIKE '%reserviert_bis%' AS hat_klausel;
DO $$
DECLARE v_sv uuid; v_id uuid; v_status_vorher text; v_status_nachher text;
BEGIN
  SELECT id INTO v_sv FROM public.sachverstaendige LIMIT 1;
  INSERT INTO public.gutachter_termine (assignee_typ, assignee_id, sv_id, typ, start_zeit, end_zeit, status, reserviert_bis, notiz_intern)
    VALUES ('sachverstaendiger', v_sv, v_sv, 'sv_begutachtung', '2099-04-01T09:00:00Z','2099-04-01T10:00:00Z','reserviert', now() - interval '1 minute','VERIFY-P23A-DO')
    RETURNING id, status INTO v_id, v_status_vorher;
  PERFORM public.expire_geblockte_termine_ohne_sa();
  SELECT status INTO v_status_nachher FROM public.gutachter_termine WHERE id = v_id;
  RAISE EXCEPTION 'TTL_PROOF vorher=% nachher=%', v_status_vorher, v_status_nachher;  -- Rollback
END $$;
```
Expected: `hat_klausel=t`; Fehler `TTL_PROOF vorher=reserviert nachher=storniert` (= abgelaufene Reservierung wird geflippt; Insert via RAISE zurückgerollt). Gegenprobe `notiz_intern='VERIFY-P23A-DO'` → 0.

- [ ] **Step 4: Version ablesen + File committen** — `list_migrations` → `<V>`, File anlegen, `</content>`-Scan, committen.

---

## Task 4: Typen-Regen + Live-Verify (Controller)

**Files:** Modify generierte DB-Typen; Create `scripts/verify-engine-p2-3a-reservierung.mts`

- [ ] **Step 1: Typen-Regen** — `generate_typescript_types` (jetzt ist `reserviere` Consumer von reserviert_bis/quelle/bezug_*). In die richtige Datei schreiben (prüfe wo die generierten Typen liegen), committen. tsc grün halten.

- [ ] **Step 2: Verify-Script** (Muster `verify-engine-belegung.mts`): nutzt `reserviere` aus der Engine + `createAdminClient`:
  - reserviere(sv, far-future-Fenster) → `{ok:true, terminId, reserviertBis}`; DB-Row hat `assignee_id`==sv UND `sv_id`==sv (Dual-Write), `status='reserviert'`, `reserviert_bis` gesetzt.
  - reserviere(sv, überlappendes Fenster) → `{ok:false, code:'belegt'}` (Constraint greift).
  - reserviere(sv, separates Fenster) → ok.
  - **Cleanup** try/finally (id-Liste + `notiz_intern`-Marker). (Hinweis: `reserviere` setzt notiz_intern NICHT — Verify taggt die Test-Rows per direktem Update nach Insert ODER löscht per terminId-Liste. Sauberer: Cleanup rein über die zurückgegebenen terminIds.)
  - VERDICT GRUEN nur wenn: ok1 && dualwrite_ok && belegt2 && ok3.
  - **Run:** voller node_modules nötig → `npm ci` im Worktree, dann `cp <main>/.env.local .env.local && npx tsx … && rm -f .env.local`. **Fallback (wie P2.2):** wenn tsx-Infra hakt, SQL-DO-Block-Beweis (reserviere-Logik als INSERT nachstellen + 23P01 + Rollback).

- [ ] **Step 3: Ausführen** → VERDICT GRUEN. Commit.

---

## Task 5: Build-Gate + PR

- [ ] **Step 1:** `npm ci` (frischer Worktree) + `npx tsc --noEmit` → grün. `npx vitest run src/lib/termine/engine/` → grün.
- [ ] **Step 2:** `git status` clean, `git stash list` leer (Regel 3).
- [ ] **Step 3:** `git push -u origin kitta/termin-engine-p2-3a` + `gh pr create --base staging` (Body: Audit + Verify-VERDICT + die eine DDL + **Hinweis reserviereSlot-Bug** (typ:'vor_ort'/pre_flowlink_reserviert scheitert still → Engine-reserviere ersetzt es in Phase 3, Self-Service-Session koordinieren) + „reserviere ist gebaut, NICHT verdrahtet").
- [ ] **Step 4:** Post-Merge: Verify gegen staging.

---

## Self-Review

**Spec-Coverage (Handoff §2 P2.3 — Reservierungs-Teil):** `reserviere` als Engine-Op ✓ (constraint-gated, race-safe). Reservierungs-TTL zentral in der Engine ✓ (CMM-25-Funktion erweitert, kein Doppelbau — die Self-Service/P4-Session baut KEINEN eigenen Interim-Guard). fail-closed `pruefeBelegung` vor Write-Gate ✓ (strict-Variante; fail-open bleibt für freieSlots). **Bewusst P2.3b/c:** `bestaetige`+Geocoding-Garantie+CMM-73 (b), `sageAb`/`verlege` (c) — eigene Pläne.

**Placeholder-Scan:** keine TBD; Code/DDL/Verify vollständig. `<V>`/`<main>` = Laufzeit-Platzhalter.

**Typ-Konsistenz:** `TerminTyp`/`Quelle`/`BezugTyp` == DB-CHECKs; `assigneeLegacyPatch`-Keys == FK-Spalten (sv_id/sv_lead_id/kb_id); status `reserviert`→TTL→`storniert` ∈ status-CHECK; `reserviert_bis`-Klausel-WHERE == Engine-TTL-Semantik.

**Risiko:** reine Code-Adds (0 Consumer von writes.ts/strict-Reader) + EINE additive Funktions-Erweiterung (Cron-Funktion, Verhalten erweitert nicht ersetzt). `reserviere` nicht verdrahtet → kein Live-Flow betroffen. Dual-Write hält Legacy-Reader konsistent. Constraint ist die harte Garantie (P2.2).

---

## Roadmap (danach)
- **P2.3b — `bestaetige` + GEOCODING-GARANTIE + CMM-73:** Ziel-Auflösungs-Kette (Termin `besichtigungsort_*` → Lead/Fall `besichtigungsort`→`fahrzeug_standort`→`kunde_adresse`→Claim `schadenort_*`) + Geocoding (mapbox `geocodeAdresse` bevorzugt = Routing-Konsistenz, Fallback google `geocodeAddress`) → cache auf `gutachter_termine.besichtigungsort_lat/lng`; **ohne geocodebares Ziel kein `bestätigt`** (Remote `kanal IN (video,telefon)` ausgenommen). `bestaetige` legt `auftraege(typ='erstgutachten', status='termin')` an = **CMM-73-Daten-Fix** (KEIN v_claim_phase-Umbau, KEINE View-Koordination — die View liest auftraege schon). Superset von `bestaetigeTermin` (status + final_verbindlich_ab + Timeline + SLA + WA/Email).
- **P2.3c — `sageAb` + `verlege`** (konsolidiert storno-actions + AAR-864-Verlegungs-State-Machine). · **P2.4** findeBestePerson (Org-Dedup #2232 ist schon merged) · **P2.5** syncTerminToExternalCalendar · **Phase 3** Consumer-Repoint (inkl. reserviereSlot-Bug-Fix + freieSlots-Repoint + cache-busy→v_belegung + sv_id-Kompat-Drop + Normalize-Trigger entfernen).
