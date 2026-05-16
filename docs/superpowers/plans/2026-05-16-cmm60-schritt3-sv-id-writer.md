# CMM-60 Schritt 3 — `sv_id`-Writer auf `claims` + Reverse-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die `faelle.sv_id`-Writer auf `claims.sv_id` umstellen und einen Reverse-Sync-Trigger `claims→faelle` ergänzen, sodass `claims` die SSoT der SV-Zuweisung wird.

**Architecture:** Neuer Trigger `trg_sync_claims_sv_id_to_faelle` (bidirektional zum bestehenden `faelle→claims`-Trigger, beide `pg_trigger_depth`-guarded). Ein Shared-Helper `setSvIdForFall` kapselt den `claims.sv_id`-Write (claim_id-Auflösung über fall_id). 3 UPDATE-Writer nutzen den Helper; die Lead-Konversion setzt `claims.sv_id` im Insert.

**Tech Stack:** PostgreSQL/Supabase (Targeted-Apply), Next.js 15 Route Handlers + Server-Actions, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-16-cmm60-schritt3-sv-id-writer-design.md`
**Branch:** `kitta/cmm-60-schritt3-sv-id-writer` (existiert, von `staging` mit 1/2/2b). Worktree: `wt-cmm60`.

---

## File Structure

- **Create:** `supabase/migrations/<ts>_cmm60_schritt3_reverse_sync_claims_sv_id.sql` — Reverse-Trigger.
- **Create:** `src/lib/faelle/sv-assignment.ts` — Shared-Helper `setSvIdForFall` (SSoT-Write von `claims.sv_id`).
- **Create:** `scripts/probe-cmm60-s3-trigger.sql` — Trigger-Smoke (bidirektional, loop-frei).
- **Modify:** `src/app/api/sv-zuweisung/route.ts` — `sv_id` aus faelle-Update → Helper.
- **Modify:** `src/app/api/termin/ablehnen/route.ts` — `sv_id: null` → Helper.
- **Modify:** `src/app/gutachter/fall/[id]/actions.ts` — `sv_id: null` → Helper.
- **Modify:** `src/lib/leads/convert-lead-to-claim.ts` — `sv_id` in `claimsInsert`.
- **Modify:** `src/lib/supabase/database.types.ts` — Regen.

---

## Task 1: Reverse-Sync-Trigger Migration

**Files:**
- Create: `supabase/migrations/<ts>_cmm60_schritt3_reverse_sync_claims_sv_id.sql`

- [ ] **Step 1: Migrationsdatei generieren**

Run (im Worktree `wt-cmm60`):
```bash
npx supabase migration new cmm60_schritt3_reverse_sync_claims_sv_id
```
Expected: neue leere Datei. `<ts>`-Dateinamen merken.

- [ ] **Step 2: Migration-SQL schreiben** (generierte Datei komplett ersetzen)

```sql
-- CMM-60 Schritt 3 — Reverse-Sync-Trigger claims.sv_id -> faelle.sv_id.
--
-- Schritt 1 hat faelle.sv_id -> claims.sv_id gespiegelt. Schritt 3 stellt die
-- Writer auf claims.sv_id um; dieser Reverse-Trigger haelt faelle.sv_id fuer
-- die noch faelle-lesenden Stellen synchron. Beide Trigger sind
-- pg_trigger_depth-guarded -> bidirektionale Sync ohne Loop. Der
-- faelle->claims-Trigger bleibt bis Phase 6 (faelle-Drop).
--
-- Spec: docs/superpowers/specs/2026-05-16-cmm60-schritt3-sv-id-writer-design.md

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_claims_sv_id_to_faelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.sv_id IS DISTINCT FROM OLD.sv_id THEN
    UPDATE public.faelle f
    SET sv_id = NEW.sv_id
    WHERE f.claim_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_claims_sv_id_to_faelle ON public.claims;
CREATE TRIGGER trg_sync_claims_sv_id_to_faelle
  AFTER INSERT OR UPDATE OF sv_id ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.sync_claims_sv_id_to_faelle();

COMMENT ON FUNCTION public.sync_claims_sv_id_to_faelle() IS
  'CMM-60 Schritt 3: spiegelt claims.sv_id -> faelle.sv_id. pg_trigger_depth-Guard gegen Loop mit trg_sync_faelle_sv_id_to_claims. Faellt mit dem faelle-Drop (Phase 6) weg.';

COMMIT;
```

Hinweis: Bei INSERT ist `OLD` NULL → `NEW.sv_id IS DISTINCT FROM OLD.sv_id` greift korrekt (true wenn `NEW.sv_id` not null).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_cmm60_schritt3_reverse_sync_claims_sv_id.sql
git commit -m "feat(CMM-60): Schritt-3 Migration — Reverse-Sync claims.sv_id -> faelle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
(Echte Umlaute im Commit — Pre-Commit-Hook blockt ASCII-Ersatz.)

---

## Task 2: Shared-Helper `setSvIdForFall`

**Files:**
- Create: `src/lib/faelle/sv-assignment.ts`

- [ ] **Step 1: Helper schreiben**

Inhalt von `src/lib/faelle/sv-assignment.ts`:

```ts
// CMM-60 Schritt 3: SSoT-Write der SV-Zuweisung.
//
// claims.sv_id ist seit CMM-60 die kanonische SV-Zuweisung. Dieser Helper
// kapselt den Write: Caller liefern die fall_id (die kennen sie), der Helper
// loest claim_id auf und schreibt claims.sv_id. Der DB-Trigger
// trg_sync_claims_sv_id_to_faelle spiegelt nach faelle.sv_id zurueck.
//
// Analog updateKbOnFallAndClaim aus kb-assignment.ts (CMM-48-Muster).

import type { SupabaseClient } from '@supabase/supabase-js'

// Generische Client-Signatur, damit Server-Action- und Admin-Client passen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

/**
 * Setzt die SV-Zuweisung des Falls auf der SSoT-Tabelle claims.
 * `svId = null` gibt die Zuweisung frei. faelle.sv_id wird per
 * Reverse-Trigger gespiegelt — der Caller muss faelle.sv_id NICHT schreiben.
 */
export async function setSvIdForFall(
  supabase: AnySupabase,
  fallId: string,
  svId: string | null,
): Promise<void> {
  const { data: fall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fall?.claim_id as string | null) ?? null
  if (!claimId) {
    console.error('[CMM-60] setSvIdForFall: kein claim_id fuer Fall', fallId)
    return
  }
  const { error } = await supabase.from('claims').update({ sv_id: svId }).eq('id', claimId)
  if (error) {
    console.error('[CMM-60] setSvIdForFall: claims-Update fehlgeschlagen:', error.message)
  }
}
```

- [ ] **Step 2: Typecheck der neuen Datei**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/faelle/sv-assignment.ts
git commit -m "feat(CMM-60): Schritt-3 Helper setSvIdForFall — claims.sv_id SSoT-Write

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Writer `sv-zuweisung/route.ts`

**Files:**
- Modify: `src/app/api/sv-zuweisung/route.ts`

- [ ] **Step 1: Helper-Import ergänzen**

Am Anfang der Datei zu den bestehenden Imports hinzufügen:
```ts
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
```

- [ ] **Step 2: `sv_id` aus dem faelle-Update entfernen + Helper aufrufen**

Suche den Block (ca. Z.222–235):
```ts
  const { error: updateErr } = await supabase
    .from('faelle')
    .update(orgPool ? {
      organisation_id: bestSv.organisation_id,
      sv_zugewiesen_am: null,
      status: 'sv-gesucht',
    } : {
      sv_id: bestSv.id,
      organisation_id: bestSv.organisation_id ?? null,
      sv_zugewiesen_am: now,
      status: 'sv-zugewiesen',
    })
    .eq('id', fallId)
```
Ersetze durch (sv_id raus aus dem faelle-Update):
```ts
  const { error: updateErr } = await supabase
    .from('faelle')
    .update(orgPool ? {
      organisation_id: bestSv.organisation_id,
      sv_zugewiesen_am: null,
      status: 'sv-gesucht',
    } : {
      organisation_id: bestSv.organisation_id ?? null,
      sv_zugewiesen_am: now,
      status: 'sv-zugewiesen',
    })
    .eq('id', fallId)

  // CMM-60 Schritt 3: SV-Zuweisung auf der SSoT claims.sv_id (Reverse-Trigger
  // spiegelt nach faelle.sv_id). Nur im Nicht-Org-Pool-Zweig — Org-Pool laesst
  // sv_id unveraendert (wie bisher).
  if (!orgPool) {
    await setSvIdForFall(supabase, fallId, bestSv.id)
  }
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sv-zuweisung/route.ts
git commit -m "feat(CMM-60): sv-zuweisung schreibt SV-Zuweisung auf claims.sv_id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Writer `termin/ablehnen` + `gutachter/fall/[id]/actions.ts`

**Files:**
- Modify: `src/app/api/termin/ablehnen/route.ts`
- Modify: `src/app/gutachter/fall/[id]/actions.ts`

- [ ] **Step 1: `termin/ablehnen/route.ts` — Helper-Import**

Zu den bestehenden Imports hinzufügen:
```ts
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
```

- [ ] **Step 2: `termin/ablehnen/route.ts` — sv_id-Freigabe auf claims**

Suche den Block (ca. Z.49–54):
```ts
  if (termin.fall_id) {
    await svc.from('faelle').update({
      sv_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', termin.fall_id)
```
Ersetze durch:
```ts
  if (termin.fall_id) {
    await svc.from('faelle').update({
      updated_at: new Date().toISOString(),
    }).eq('id', termin.fall_id)
    // CMM-60 Schritt 3: sv_id-Freigabe auf der SSoT claims.sv_id.
    await setSvIdForFall(svc, termin.fall_id, null)
```

- [ ] **Step 3: `gutachter/fall/[id]/actions.ts` — Helper-Import**

Zu den bestehenden Imports hinzufügen:
```ts
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
```

- [ ] **Step 4: `gutachter/fall/[id]/actions.ts` — sv_id-Freigabe auf claims**

Suche den Block (ca. Z.556–559):
```ts
  await supabase.from('faelle').update({
    sv_id: null,
    updated_at: new Date().toISOString(),
  }).eq('id', fallId)
```
Ersetze durch:
```ts
  await supabase.from('faelle').update({
    updated_at: new Date().toISOString(),
  }).eq('id', fallId)
  // CMM-60 Schritt 3: sv_id-Freigabe auf der SSoT claims.sv_id.
  await setSvIdForFall(supabase, fallId, null)
```

- [ ] **Step 5: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/termin/ablehnen/route.ts "src/app/gutachter/fall/[id]/actions.ts"
git commit -m "feat(CMM-60): sv_id-Freigabe (Termin-Ablehnung) auf claims.sv_id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Writer `convert-lead-to-claim.ts`

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts`

- [ ] **Step 1: `sv_id` in `claimsInsert` ergänzen**

Suche im `claimsInsert`-Objekt den Block der Welle-7-Defaults (ca. Z.235–248):
```ts
    // — Welle-7 Defaults
    phase: '1_neu',
    status: 'dispatch_done',
    kundenbetreuer_id: kundenbetreuerId,
```
Ergänze direkt darunter eine Zeile:
```ts
    // — Welle-7 Defaults
    phase: '1_neu',
    status: 'dispatch_done',
    kundenbetreuer_id: kundenbetreuerId,
    // CMM-60 Schritt 3: SV-Zuweisung claim-nativ. faelle bekommt sv_id
    // weiterhin ueber fallComputedFields (gleicher Wert) — Ordering-Schutz,
    // da der claims->faelle-Trigger beim Insert die faelle-Row noch nicht sieht.
    sv_id: input.svIdFromTermin ?? null,
```

Hinweis: `input.svIdFromTermin` ist im `convertLeadToClaim`-Input bereits vorhanden (wird ebenfalls an `buildFallInsertFromLead` durchgereicht). `ClaimInsert` hat `sv_id` (seit CMM-60 Schritt 1). `fallComputedFields.sv_id` bleibt unverändert.

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/leads/convert-lead-to-claim.ts
git commit -m "feat(CMM-60): convert-lead-to-claim setzt claims.sv_id im Insert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Migration applizieren + Trigger-Smoke

**Files:**
- Create: `scripts/probe-cmm60-s3-trigger.sql`

- [ ] **Step 1: Worktree-Supabase-Link sicherstellen**

```bash
cp -r "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/supabase/.temp/." supabase/.temp/
```

- [ ] **Step 2: Migration applizieren (Targeted-Apply)**

```bash
npx supabase db query --linked --agent yes --file supabase/migrations/<ts>_cmm60_schritt3_reverse_sync_claims_sv_id.sql
npx supabase migration repair --status applied <ts>
```
Expected: erste Query `"rows": []`; repair `Finished supabase migration repair.`

- [ ] **Step 3: Trigger-Smoke-Skript schreiben**

Inhalt von `scripts/probe-cmm60-s3-trigger.sql`:

```sql
-- CMM-60 Schritt-3 Trigger-Smoke: bidirektionale sv_id-Sync, loop-frei.
-- Transaktional mit ROLLBACK -> keine echte Datenaenderung.
BEGIN;

-- Einen Fall mit claim_id + sv_id waehlen, IDs in temp-Tabelle festhalten.
CREATE TEMP TABLE _smoke AS
  SELECT f.id AS faelle_id, f.claim_id, f.sv_id AS orig_sv
  FROM public.faelle f
  WHERE f.claim_id IS NOT NULL AND f.sv_id IS NOT NULL
  LIMIT 1;

-- 1. claims.sv_id -> NULL: Reverse-Trigger soll faelle.sv_id auf NULL spiegeln.
UPDATE public.claims SET sv_id = NULL
WHERE id = (SELECT claim_id FROM _smoke);

-- 2. claims.sv_id -> anderer SV: Reverse-Trigger zieht faelle mit.
UPDATE public.claims SET sv_id = (
  SELECT id FROM public.sachverstaendige
  WHERE id <> (SELECT orig_sv FROM _smoke) LIMIT 1
)
WHERE id = (SELECT claim_id FROM _smoke);

-- 3. faelle.sv_id -> NULL: Schritt-1-Trigger spiegelt zurueck nach claims.
UPDATE public.faelle SET sv_id = NULL
WHERE id = (SELECT faelle_id FROM _smoke);

SELECT chk, result FROM (
  SELECT 1 AS ord, 'claims->faelle gespiegelt (beide gleich nach Schritt 2/3)' AS chk,
    ((SELECT c.sv_id FROM public.claims c WHERE c.id = (SELECT claim_id FROM _smoke))
     IS NOT DISTINCT FROM
     (SELECT f.sv_id FROM public.faelle f WHERE f.id = (SELECT faelle_id FROM _smoke)))::text AS result
  UNION ALL
  SELECT 2, 'beide sv_id NULL nach faelle-NULL-Update (loop-frei, konsistent)',
    ((SELECT c.sv_id FROM public.claims c WHERE c.id = (SELECT claim_id FROM _smoke)) IS NULL
     AND (SELECT f.sv_id FROM public.faelle f WHERE f.id = (SELECT faelle_id FROM _smoke)) IS NULL)::text
) q ORDER BY ord;

ROLLBACK;
```

- [ ] **Step 4: Trigger-Smoke ausführen**

```bash
npx supabase db query --linked --agent yes --file scripts/probe-cmm60-s3-trigger.sql
```
Expected: beide Checks `"result": "true"` — bidirektionale Sync konsistent, kein Loop (Query terminiert).

- [ ] **Step 5: Commit Probe**

```bash
git add scripts/probe-cmm60-s3-trigger.sql
git commit -m "test(CMM-60): Schritt-3 Trigger-Smoke — bidirektionale sv_id-Sync

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Build + Types + Code-Smoke + PR

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Types regenerieren**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
Expected: Diff klein/leer (Trigger ändert Schema nicht; ggf. nur Funktions-Eintrag — additiv).

- [ ] **Step 2: Voller Build** (AGENTS.md §post-task-audit — Routen + Server-Actions berührt)

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```
Expected: Build grün, kein Validator-Fehler.

- [ ] **Step 3: Code-Smoke — SV-Zuweisung gegen staging**

```bash
printf "%s" "SELECT f.id AS faelle_id, f.claim_id, f.sv_id, f.status FROM public.faelle f WHERE f.claim_id IS NOT NULL ORDER BY f.erstellt_am DESC NULLS LAST LIMIT 3;" > scripts/_t.sql
npx supabase db query --linked --agent yes --file scripts/_t.sql
rm -f scripts/_t.sql
```
Manuell prüfen: ein Fall, der eine SV-Zuweisung durchläuft (oder via bestehendem Smoke-Skript `scripts/smoke-cmm60-s2-sv-portal.mjs`-Muster), zeigt nach Zuweisung `claims.sv_id == faelle.sv_id`. Falls kein Live-Trigger-Pfad bequem: der Trigger-Smoke (Task 6) deckt die Sync-Mechanik ab; dieser Step verifiziert nur, dass die Writer-Files gebaut sind.

- [ ] **Step 4: Commit Types (falls Diff)**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(CMM-60): Schritt-3 database.types regeneriert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" || echo "kein Types-Diff"
```

- [ ] **Step 5: Push + PR gegen staging**

```bash
git push -u origin kitta/cmm-60-schritt3-sv-id-writer
gh pr create --base staging --head kitta/cmm-60-schritt3-sv-id-writer \
  --title "feat(CMM-60): Schritt 3 — sv_id-Writer auf claims + Reverse-Sync" \
  --body "CMM-60 Schritt 3: sv_id-Writer schreiben claims.sv_id (SSoT); neuer Reverse-Trigger trg_sync_claims_sv_id_to_faelle spiegelt nach faelle. Bidirektional zum bestehenden faelle->claims-Trigger, beide pg_trigger_depth-guarded. Shared-Helper setSvIdForFall. 4 Writer umgestellt (sv-zuweisung, 2x sv_id-Freigabe, convert-lead-to-claim). Trigger-Smoke gruen (bidirektional, loop-frei), Build gruen. Closure + faelle->claims-Drop = Phase 4/6. Spec/Plan: docs/superpowers/specs|plans/2026-05-16-cmm60-schritt3-*"
```
Expected: PR-URL.

- [ ] **Step 6: Linear CMM-60 Kommentar**

Kommentar an CMM-60: Schritt 3 appliziert, Reverse-Trigger live, 4 Writer auf claims, PR-Link, Trigger-Smoke grün, faelle→claims-Drop = Phase 6.

---

## Verifikation gesamt

Plan erfüllt wenn:
- `trg_sync_claims_sv_id_to_faelle` existiert; `claims.sv_id`-UPDATE spiegelt nach `faelle.sv_id`.
- Trigger-Smoke grün: bidirektionale Sync konsistent, kein Loop.
- `sv-zuweisung`, `termin/ablehnen`, `gutachter/fall/[id]/actions.ts` schreiben `sv_id` via `setSvIdForFall` (claims); `convert-lead-to-claim` setzt `claims.sv_id` im Insert.
- `npm run build` grün.
- PR gegen `staging` offen, Linear aktualisiert.
