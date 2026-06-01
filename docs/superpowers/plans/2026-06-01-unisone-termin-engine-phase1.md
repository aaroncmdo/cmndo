# Unisone Termin-Engine — Phase 1 (Datenmodell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das assignee-generische Daten-Fundament der Termin-Engine additiv anlegen — `gutachter_termine` um `assignee_typ`/`assignee_id` (+ Backfill + Integritäts-Trigger) erweitern, die externe Belegung permanent machen, und die EINE Lese-Quelle `v_belegung` (Claimondo-Buchungen ∪ externe Belegung, mit Büro-Fallback) bauen.

**Architecture:** Rein **additiv** — keine bestehende Spalte/kein Consumer wird geändert, keine Buchungs-/Slot-Logik umgehängt. `v_belegung` entsteht als neue Read-Only-View ohne Phase-1-Consumer (die Engine in Phase 2 liest sie). Damit ist Phase 1 verhaltensneutral und einzeln smoke-bar.

**Tech Stack:** PostgreSQL/Supabase (DDL **nur** via `mcp__plugin_supabase_supabase__apply_migration` — AGENTS.md Regel 2), Next.js 16 (Cron-Route), TypeScript. Verifikation per `execute_sql` (READ) + `tsx`-Scripts (Muster: `scripts/verify-busy.mts`).

---

## ⚠️ Koordination (vor JEDER Migration lesen)

`gutachter_termine` **und** `v_claim_phase` sind **geteilte Kern-Objekte** mit vielen aktiven Sessions (AAR-939, CMM-44/49/50/69/72/73). Auf **geteilter prod+staging-DB** (`paizkjajbuxxksdoycev`).

- **Vor jeder Migration:** `git fetch` + kurz mit aktiven `gutachter_termine`-Sessions abstimmen (Branch-Kollisions-Hook). Live-Schema **erneut** per `execute_sql` gegen `information_schema` prüfen — Snapshots in diesem Plan sind vom 01.06. und können durch Parallel-Sessions veraltet sein ([[information_schema-Check vor Cluster-Refactor]]).
- **Regel 1:** PR gegen `staging`, nie `main`. **Regel 2:** DDL nur via Plugin → dann `list_migrations` → Migration-File exakt nach getrackter Version benennen (Twin-Drift-Schutz). **Regel 3:** kein unbegleiteter Stash am Ende.
- **7-Punkte-Audit** (AGENTS.md) in jeder Commit-Message.

---

## Abweichungen vom Spec (grounding-getrieben, 01.06. — von Aaron abnicken lassen)

Beim Live-Schema-Grounding sind vier Spec-Annahmen widerlegt worden. Diese Plan-Entscheidungen weichen bewusst ab:

1. **Keine neuen `standort_*`-Spalten.** `gutachter_termine` hat bereits `besichtigungsort_lat/lng/adresse/place_id/notiz` (aus dem AAR-599-Rename). Der Termin-Ort wird **wiederverwendet**, nicht neu angelegt. (Spec §4a hatte `standort_*` vorgesehen.)
2. **`assignee_id` bleibt nullable.** Status `sv_gesucht` ist ein legaler Zustand (Termin ohne zugewiesenen SV) → blanket `NOT NULL` (Spec §4a) würde künftige `sv_gesucht`-Inserts brechen. Der Integritäts-Guard wird „**wenn gesetzt, dann referenziell gültig**" (Trigger), nicht `NOT NULL`. (Aktuell haben alle 19 Zeilen einen SV — aber der Guard muss zukunftssicher sein.)
3. **Reader-Repoint (`cache-busy.ts` → `v_belegung`) ist NICHT Phase 1, sondern Phase 3.** `cache-busy.ts` liefert heute **nur externe** Busy-Fenster; `v_belegung` unioniert **extern ∪ eigene Buchungen**. Ein Repoint jetzt würde eigene Termine **doppelt** zählen (Caller lesen `belegte` separat). Der Repoint gehört in die Consumer-Migration, wo der separate `belegte`-Read entfällt. (Spec §8 hatte ihn in Phase 1 — korrigiert.)
4. **Kein Tabellen-Rename in Phase 1.** `sv_kalender_events_cache` hat bereits exakt die `externe_belegung`-Form. Da `v_belegung` die öffentliche Lese-Schnittstelle wird, ist der physische Tabellenname ein Implementierungsdetail — der Rename auf `externe_belegung` ist kosmetisch und wird nach Phase 1 nachgezogen (vermeidet Churn auf dem frisch geshippten #2165-Pfad). `quelle`, `bezug_typ`/`bezug_id` und die **Exclusion-Constraint-Generalisierung** werden ebenfalls auf Phase 2 verschoben (Writer/Engine-Zeitpunkt — kein Phase-1-Consumer).
5. **`v_belegung` leitet `assignee` live aus den Legacy-FKs ab** (`COALESCE(assignee_id, sv_id, sv_lead_id, kb_id)` + CASE für den Typ), statt nur auf den einmaligen Backfill (Task 2) zu vertrauen. Grund: Writer setzen bis zur Phase-3-Migration weiter **nur** `sv_id`/`sv_lead_id`/`kb_id`, nicht die neuen assignee-Spalten. **Live-Befund 01.06.:** die Tabelle wuchs 19→20 **während** der Migration durch eine Parallel-Session — neue Zeilen hätten `assignee_id=NULL`. Die Live-Ableitung hält `v_belegung` über die ganze Transition korrekt, **ohne** den Write-Pfad anderer Sessions zu verändern (additiv/neutral). Der validate-only-Trigger (Task 3) bleibt wie geplant.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `supabase/migrations/<V1>_termine_add_assignee_columns.sql` | assignee-Spalten + CHECK + Index | Create |
| `supabase/migrations/<V2>_termine_backfill_assignee.sql` | Backfill assignee aus sv_id/sv_lead_id/kb_id | Create |
| `supabase/migrations/<V3>_termine_assignee_integrity_trigger.sql` | Validierungs-Trigger (assignee referenziell gültig wenn gesetzt) | Create |
| `supabase/migrations/<V4>_v_belegung_view.sql` | View `v_belegung` (Buchungen ∪ extern, Büro-Fallback) | Create |
| `supabase/migrations/<V5>_externe_belegung_permanent.sql` | (optional) Retention-Index für permanente externe Belegung | Create |
| `src/lib/kalender/sync-to-cache.ts:173-179` | Prune-Fenster `now` → Retention `now - 90d` | Modify |
| `src/types/database.ts` (o.ä. generierter Typ) | regenerierte Typen (assignee-Spalten, v_belegung) | Modify |
| `scripts/verify-v-belegung.mts` | tsx-Verifikation der View gegen Prod-DB | Create |

`<Vn>` = die vom Plugin vergebene getrackte Version (Regel 2, Schritt 3) — **nicht** raten.

---

## Task 1: assignee-Spalten additiv anlegen

**Files:**
- Create: `supabase/migrations/<V1>_termine_add_assignee_columns.sql`

- [ ] **Step 1: RED — Verifikations-Query, die jetzt fehlschlägt**

Run via `execute_sql` (READ):
```sql
SELECT count(*) FROM public.gutachter_termine WHERE assignee_typ = 'sachverstaendiger';
```
Expected: **FEHLER** `column "assignee_typ" does not exist`.

- [ ] **Step 2: Live-Schema gegenprüfen (Koordination)**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_termine'
  AND column_name IN ('assignee_typ','assignee_id','besichtigungsort_lat','sv_id','sv_lead_id','kb_id');
```
Expected: `besichtigungsort_lat`, `sv_id`, `sv_lead_id`, `kb_id` vorhanden; `assignee_typ`/`assignee_id` **fehlen** (sonst hat eine andere Session sie schon angelegt → stop + abstimmen).

- [ ] **Step 3: Migration anwenden (Plugin, Regel 2)**

`apply_migration({ name: "termine_add_assignee_columns", query: <DDL> })`:
```sql
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS assignee_typ text,
  ADD COLUMN IF NOT EXISTS assignee_id  uuid;

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_assignee_typ_check
  CHECK (assignee_typ IS NULL OR assignee_typ = ANY (ARRAY['sachverstaendiger','sv_lead','kundenbetreuer','kanzlei']));

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_assignee
  ON public.gutachter_termine (assignee_typ, assignee_id, start_zeit);
```

- [ ] **Step 4: GREEN — Verifikation**

```sql
SELECT count(*) AS n, count(assignee_typ) AS befuellt FROM public.gutachter_termine;
```
Expected: `n=19, befuellt=0` (Spalte existiert, noch leer — Backfill ist Task 2).

- [ ] **Step 5: getrackte Version ablesen + Migration-File committen**

`list_migrations` → Version `<V1>` ablesen. Datei `supabase/migrations/<V1>_termine_add_assignee_columns.sql` mit obigem DDL anlegen.
```bash
git add supabase/migrations/<V1>_termine_add_assignee_columns.sql
git commit  # 7-Punkt-Audit im Body, Co-Authored-By
```

---

## Task 2: Backfill assignee aus den Legacy-FK-Spalten

**Files:**
- Create: `supabase/migrations/<V2>_termine_backfill_assignee.sql`

- [ ] **Step 1: RED — aktuell ist nichts befüllt**

```sql
SELECT assignee_typ, count(*) FROM public.gutachter_termine GROUP BY assignee_typ;
```
Expected: eine Zeile `{assignee_typ: null, count: 19}`.

- [ ] **Step 2: Backfill anwenden (Plugin)**

`apply_migration({ name: "termine_backfill_assignee", query: <DML> })`:
```sql
UPDATE public.gutachter_termine
SET assignee_typ = CASE
      WHEN sv_id      IS NOT NULL THEN 'sachverstaendiger'
      WHEN sv_lead_id IS NOT NULL THEN 'sv_lead'
      WHEN kb_id      IS NOT NULL THEN 'kundenbetreuer'
    END,
    assignee_id = COALESCE(sv_id, sv_lead_id, kb_id)
WHERE assignee_id IS NULL
  AND (sv_id IS NOT NULL OR sv_lead_id IS NOT NULL OR kb_id IS NOT NULL);
```
> Hinweis: `kb_beratung`-Termine (sv_id NULL, kb_id gesetzt) werden korrekt `kundenbetreuer`. Termine ganz ohne Assignee (Status `sv_gesucht`) bleiben bewusst NULL.

- [ ] **Step 3: GREEN — Verteilung prüfen**

```sql
SELECT assignee_typ, count(*) FROM public.gutachter_termine GROUP BY assignee_typ ORDER BY 2 DESC;
SELECT count(*) AS inkonsistent FROM public.gutachter_termine
WHERE assignee_typ = 'sachverstaendiger' AND assignee_id <> sv_id;
```
Expected (Stand 01.06.): `{sachverstaendiger: 19}`; `inkonsistent = 0`. (Falls eine Session inzwischen kb/sv_lead-Termine angelegt hat, erscheinen diese Buckets — kein Fehler.)

- [ ] **Step 4: Version ablesen + committen**

`list_migrations` → `<V2>`. File `supabase/migrations/<V2>_termine_backfill_assignee.sql` anlegen + committen (Audit im Body).

---

## Task 3: Assignee-Integritäts-Trigger (validate-when-set)

**Files:**
- Create: `supabase/migrations/<V3>_termine_assignee_integrity_trigger.sql`

Lehre aus dem Personal-Audit: `abrechnungen.empfaenger` ist polymorph **ohne FK** → 2/3 Zeilen `empfaenger_id=NULL`/unabbuchbar. Hier verhindert ein BEFORE-Trigger eine assignee_id, die in der typ-passenden Tabelle nicht existiert. (Ein einzelner FK geht nicht über 4 Zieltabellen.)

- [ ] **Step 1: RED — Trigger existiert noch nicht**

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid='public.gutachter_termine'::regclass
  AND tgname='trg_gutachter_termine_validate_assignee';
```
Expected: 0 Zeilen.

- [ ] **Step 2: Funktion + Trigger anwenden (Plugin)**

`apply_migration({ name: "termine_assignee_integrity_trigger", query: <DDL> })`:
```sql
CREATE OR REPLACE FUNCTION public.gutachter_termine_validate_assignee()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;  -- unassigned (z.B. status sv_gesucht) erlaubt
  END IF;
  IF NEW.assignee_typ = 'sachverstaendiger' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sachverstaendige WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in sachverstaendige', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'sv_lead' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sv_leads WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in sv_leads', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'kundenbetreuer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in profiles', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'kanzlei' THEN
    IF NOT EXISTS (SELECT 1 FROM public.kanzleien WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in kanzleien', NEW.assignee_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'assignee_id gesetzt, assignee_typ % ungueltig', NEW.assignee_typ;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_gutachter_termine_validate_assignee
  BEFORE INSERT OR UPDATE OF assignee_typ, assignee_id ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_validate_assignee();
```
> Der Trigger feuert nur bei INSERT oder UPDATE **der assignee-Spalten** → bestehende Writer (Status-Updates etc.) bleiben unberührt.

- [ ] **Step 3: GREEN — Trigger akzeptiert Gültiges, blockt Ungültiges**

```sql
-- gültig (vorhandener SV) → ok, 0 rows changed (no-op self-update auf eine echte Zeile)
UPDATE public.gutachter_termine SET assignee_typ='sachverstaendiger', assignee_id=sv_id
  WHERE id = (SELECT id FROM public.gutachter_termine WHERE sv_id IS NOT NULL LIMIT 1);
-- ungültig → muss EXCEPTION werfen:
DO $$ BEGIN
  UPDATE public.gutachter_termine
    SET assignee_typ='kanzlei', assignee_id='00000000-0000-0000-0000-000000000000'
    WHERE id = (SELECT id FROM public.gutachter_termine LIMIT 1);
  RAISE EXCEPTION 'TRIGGER HAT NICHT GEBLOCKT';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE '%nicht in kanzleien%' THEN RAISE NOTICE 'OK: Trigger blockt';
  ELSE RAISE; END IF;
END $$;
```
Expected: erstes UPDATE ok; zweiter Block `NOTICE: OK: Trigger blockt`. (Beide laufen in derselben Transaktion-losen Session; das ungültige UPDATE wird vom Trigger zurückgewiesen — keine Daten geändert.)

- [ ] **Step 4: Version ablesen + committen**

`list_migrations` → `<V3>`. File anlegen + committen.

---

## Task 4: `v_belegung` — die EINE Lese-Quelle

**Files:**
- Create: `supabase/migrations/<V4>_v_belegung_view.sql`
- Create: `scripts/verify-v-belegung.mts`

- [ ] **Step 1: RED — View existiert nicht**

```sql
SELECT to_regclass('public.v_belegung') AS exists;
```
Expected: `{exists: null}`.

- [ ] **Step 2: View anwenden (Plugin)**

`apply_migration({ name: "v_belegung_view", query: <DDL> })`:
```sql
CREATE OR REPLACE VIEW public.v_belegung AS
-- Claimondo-Buchungen (aktive Termine; Status-Set == Exclusion-Constraint)
SELECT
  -- assignee live aus Legacy-FKs ableiten (Writer setzen bis Phase 3 nur sv_id/...)
  COALESCE(gt.assignee_typ,
    CASE WHEN gt.sv_id      IS NOT NULL THEN 'sachverstaendiger'
         WHEN gt.sv_lead_id IS NOT NULL THEN 'sv_lead'
         WHEN gt.kb_id      IS NOT NULL THEN 'kundenbetreuer' END) AS assignee_typ,
  COALESCE(gt.assignee_id, gt.sv_id, gt.sv_lead_id, gt.kb_id)      AS assignee_id,
  gt.start_zeit,
  gt.end_zeit,
  'buchung'::text AS belegung_typ,
  gt.status,
  gt.typ          AS termin_typ,
  CASE WHEN gt.claim_id IS NOT NULL THEN 'claim'
       WHEN gt.fall_id  IS NOT NULL THEN 'fall'
       WHEN gt.lead_id  IS NOT NULL THEN 'lead' END AS bezug_typ,
  COALESCE(gt.claim_id, gt.fall_id, gt.lead_id)       AS bezug_id,
  COALESCE(gt.besichtigungsort_lat, sv.standort_lat)  AS standort_lat,  -- Büro-Fallback §6
  COALESCE(gt.besichtigungsort_lng, sv.standort_lng)  AS standort_lng,
  gt.id AS quelle_id
FROM public.gutachter_termine gt
LEFT JOIN public.sachverstaendige sv
  ON sv.id = COALESCE(gt.assignee_id, gt.sv_id)
WHERE gt.cancelled_at IS NULL
  AND gt.status = ANY (ARRAY['reserviert','bestaetigt','verlegt','verlegung_pending'])
UNION ALL
-- Externe Belegung (Cache; immer Büro, extern hat nie Ort)
SELECT
  'sachverstaendiger'::text AS assignee_typ,
  c.sv_id                   AS assignee_id,
  c.start_zeit,
  c.end_zeit,
  'extern'::text AS belegung_typ,
  NULL::text AS status,
  NULL::text AS termin_typ,
  NULL::text AS bezug_typ,
  NULL::uuid AS bezug_id,
  sv.standort_lat,
  sv.standort_lng,
  c.id AS quelle_id
FROM public.sv_kalender_events_cache c
LEFT JOIN public.sachverstaendige sv ON sv.id = c.sv_id;

-- Sicherheit: NICHT an anon exponieren (Audit-Lehre: keine SV-Spalten an anon).
REVOKE ALL ON public.v_belegung FROM anon;
```
> Status-Set bewusst identisch zur Exclusion-Constraint `gutachter_termine_no_sv_overlap` (`bestaetigt/reserviert/verlegt/verlegung_pending`). KB/Kanzlei-Büro-Join folgt in Phase 2 (heute keine Nicht-SV-Buchungen).

- [ ] **Step 3: GREEN — View liefert plausible Belegung**

```sql
SELECT belegung_typ, count(*) FROM public.v_belegung GROUP BY belegung_typ;
-- Erwartung 01.06.: buchung = (aktive Termine, ~12 von 19), extern = 3.
SELECT count(*) AS buchungen_mit_standort FROM public.v_belegung
  WHERE belegung_typ='buchung' AND standort_lat IS NOT NULL;
```
Expected: `buchung`-Zeilen = Anzahl aktiver Termine (Status im Set, cancelled_at NULL); `extern = 3`; Büro-Fallback greift (standort_lat aus besichtigungsort **oder** sachverstaendige).

- [ ] **Step 4: tsx-Verifikation gegen die Reader-Semantik schreiben**

Create `scripts/verify-v-belegung.mts` (Muster `verify-busy.mts`): liest `v_belegung` für einen Test-SV im 35-Tage-Fenster via `createAdminClient`, vergleicht die `extern`-Zeilen mit `getCachedBusyWindows(svId)` (müssen deckungsgleich sein) und prüft, dass aktive Buchungen zusätzlich erscheinen.
```ts
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()
const { createAdminClient } = await import('@/lib/supabase/admin')
const { getCachedBusyWindows } = await import('@/lib/kalender/cache-busy')
const db = createAdminClient()
const { data: sv } = await db.from('sv_kalender_events_cache').select('sv_id').limit(1).maybeSingle()
const svId = sv?.sv_id as string
const { data: vb } = await db.from('v_belegung').select('belegung_typ,start_zeit,end_zeit').eq('assignee_id', svId)
const extern = (vb ?? []).filter(r => r.belegung_typ === 'extern')
const cache = await getCachedBusyWindows(svId, '2000-01-01T00:00:00Z', '2999-01-01T00:00:00Z')
console.log(JSON.stringify({
  svId,
  v_belegung_extern: extern.length,
  cache_rows: cache.length,
  deckungsgleich: extern.length === cache.length,
  buchungen: (vb ?? []).filter(r => r.belegung_typ === 'buchung').length,
}, null, 2))
```

- [ ] **Step 5: tsx ausführen + Cleanup-Hinweis**

```bash
cd <worktree> && cp <main>/.env.local .env.local
npx tsx scripts/verify-v-belegung.mts   # erwartet deckungsgleich:true
rm -f .env.local                          # .env.local NICHT committen
```
Expected: `deckungsgleich: true`. (Nach `</content>`-Artefakt im neu geschriebenen `.mts` scannen — [[Write-Tool </content>-Artefakt]].)

- [ ] **Step 6: Version ablesen + committen**

`list_migrations` → `<V4>`. File + Script committen (Audit im Body).

---

## Task 5: Externe Belegung permanent (Retention statt Prune-alles-Past)

**Files:**
- Modify: `src/lib/kalender/sync-to-cache.ts:173-179`
- Create: `supabase/migrations/<V5>_externe_belegung_retention_index.sql` (Index für Retention-Scans)

Aaron-Vision „externe Termine als **permanente** Records": der Cron löscht aktuell alle Vergangenheits-Events (`start_zeit < now`, Z.173-179) → die SV-Kalender-UI kann keine jüngst-vergangenen externen Termine zeigen. Retention-Fenster (90 Tage) statt Hard-Prune.

- [ ] **Step 1: RED — Test, der das aktuelle Hard-Prune-Verhalten zeigt**

Create `scripts/verify-retention.mts`: injiziert für einen Test-SV zwei `caldav`-Events — eines `now-10d`, eines `now-120d` — ruft `syncAllExternalCalendars()` (oder den Prune-Pfad) und prüft, welche überleben.
```ts
// ... loadEnv wie oben ...
const { createAdminClient } = await import('@/lib/supabase/admin')
const db = createAdminClient()
const { data: sv } = await db.from('sv_kalender_events_cache').select('sv_id').limit(1).maybeSingle()
const svId = sv?.sv_id as string
const mk = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString() }
await db.from('sv_kalender_events_cache').upsert([
  { sv_id: svId, source: 'caldav', external_event_id: 'RET_10d',  start_zeit: mk(10),  end_zeit: mk(10),  titel: 'ret-10d' },
  { sv_id: svId, source: 'caldav', external_event_id: 'RET_120d', start_zeit: mk(120), end_zeit: mk(120), titel: 'ret-120d' },
], { onConflict: 'sv_id,source,external_event_id' })
const { syncAllExternalCalendars } = await import('@/lib/kalender/sync-to-cache')
await syncAllExternalCalendars()
const { data: after } = await db.from('sv_kalender_events_cache').select('external_event_id')
  .eq('sv_id', svId).in('external_event_id', ['RET_10d','RET_120d'])
const ids = (after ?? []).map(r => r.external_event_id)
console.log(JSON.stringify({ behaelt_10d: ids.includes('RET_10d'), behaelt_120d: ids.includes('RET_120d') }))
// cleanup
await db.from('sv_kalender_events_cache').delete().eq('sv_id', svId).in('external_event_id', ['RET_10d','RET_120d'])
```
Run: `npx tsx scripts/verify-retention.mts`
Expected **vor** dem Fix: `{behaelt_10d:false, behaelt_120d:false}` (Hard-Prune löscht beide).

- [ ] **Step 2: Prune-Fenster auf Retention ändern**

In `src/lib/kalender/sync-to-cache.ts`, im `diffAndApply` (Z.173-179), `fromIso` im finalen Delete durch ein Retention-Datum ersetzen:
```ts
  // Sehr alte Events ausserhalb des Retention-Fensters loeschen (permanent = 90d Historie)
  const retentionIso = new Date(now.getTime() - 90 * 86400_000).toISOString()
  await db
    .from('sv_kalender_events_cache')
    .delete()
    .eq('sv_id', svId)
    .eq('source', source)
    .lt('start_zeit', retentionIso)
```
> Die Diff-Logik (Z.137-171) bleibt unverändert: sie diff't weiterhin nur Zukunfts-Events (`gte start_zeit now`), löscht also keine jüngst-vergangenen — die fallen nur noch nach 90d raus.

- [ ] **Step 3: GREEN — Retention greift**

Run: `npx tsx scripts/verify-retention.mts`
Expected **nach** dem Fix: `{behaelt_10d:true, behaelt_120d:false}`.

- [ ] **Step 4: Retention-Index — ÜBERSPRUNGEN (Live-Befund 01.06.)**

Der existierende Index `idx_sv_kalender_events_sv_zeit (sv_id, start_zeit)` deckt Prune + Reader bereits ab → ein `(sv_id, source, start_zeit)`-Index wäre redundant. Per Index-Hygiene (Repo droppt Dup-Indizes) **keine** neue Migration.

- [ ] **Step 5: Build + committen**

```bash
npx tsc --noEmit        # gruen (Routen/Lib geaendert)
list_migrations         # -> <V5>, File anlegen
git add src/lib/kalender/sync-to-cache.ts scripts/verify-retention.mts supabase/migrations/<V5>_externe_belegung_retention_index.sql
git commit              # 7-Punkt-Audit
```

---

## Task 6: Typen regenerieren + Abschluss-Verifikation

**Files:**
- Modify: generierter DB-Typ (`src/types/database.ts` o.ä.)

- [ ] **Step 1: Typen regenerieren — AUFGESCHOBEN (Regel 2 §6)**

Kein Phase-1-Code referenziert die neuen assignee-Spalten oder `v_belegung` (View hat 0 Consumer, Reader nicht repointet) → Typen dürfen der DB hinterherhinken. Regen erfolgt in Phase 2, wenn die Engine `v_belegung` konsumiert — vermeidet einen riesigen, mit Parallel-Sessions kollidierenden Typ-Diff.

- [ ] **Step 2: Build grün**

Run: `npx tsc --noEmit`
Expected: PASS (kein Consumer referenziert die neuen Spalten in Phase 1 → keine Typ-Brüche).

- [ ] **Step 3: RLS-/Security-Gegencheck auf `v_belegung`**

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name='v_belegung';
```
Expected: nur `postgres`/`service_role` (kein anon/authenticated). **Befund 01.06.:** `anon` sauber, aber Supabase-Default gab `authenticated` SELECT — da Default-Views RLS **umgehen**, ist das ein Leak (eingeloggte Nutzer sähen alle SV-Belegungen + bezug_ids). **Nachgezogen** (Migration `v_belegung_security_invoker_lock`, Version 20260601181218): `ALTER VIEW … SET (security_invoker=true)` + `REVOKE ALL FROM anon, authenticated`. Engine liest via service_role → unberührt. Re-Verify: grants = nur postgres/service_role, `reloptions=security_invoker=true`. ✓

- [ ] **Step 4: Smoke (Post-Deploy, staging)**

Nach PR-Merge auf `staging`: Dispatch-Matcher + Self-Service-Slot-Strecke smoken (Screenshots, [[Smoke = immer Screenshot + Analyse]]) → **keine** Verhaltensänderung erwartet (Phase 1 ist additiv; `v_belegung` hat noch keinen Consumer). Bestätigt, dass die additive DDL nichts gebrochen hat.

- [ ] **Step 5: Commit + PR**

```bash
git add <typ-file>
git commit              # Audit
git push -u origin <branch>
gh pr create --base staging --title "feat(termin-engine): Phase 1 — assignee-Datenmodell + v_belegung" --body <...>
```

---

## Self-Review (durchgeführt 01.06.)

- **Spec-Coverage:** §4a assignee-Spalten ✓ (Task 1/2), Integritäts-Guard ✓ (Task 3), §4b externe Permanenz ✓ (Task 5), §4c `v_belegung` ✓ (Task 4), §6 Büro-Fallback ✓ (COALESCE in Task 4). **Bewusst verschoben** (mit Begründung oben): §4a `quelle`/`bezug_typ`/`bezug_id` (Phase 2), §6c `verfuegbarkeits_ausnahmen` (Phase 2), §7 Exclusion-Generalisierung (Phase 2), Reader-Repoint (Phase 3).
- **Placeholder-Scan:** keine TBD/TODO; alle Migrationen mit vollständigem DDL, alle Verify-Steps mit konkreter Query + Erwartung.
- **Typ-Konsistenz:** Spaltennamen `assignee_typ`/`assignee_id`, View-Spalten `belegung_typ`/`bezug_typ`/`standort_lat` über alle Tasks identisch. `getCachedBusyWindows` (Task 4 tsx) == Signatur in `cache-busy.ts`.

---

## Roadmap — Folge-Pläne (je eigener Spec→Plan→Build-Zyklus nach Landung des Vorgängers)

> Diese Phasen bekommen **eigene** Pläne, sobald Phase 1 auf `staging` gelandet ist — ihre Schritte brauchen das real existierende Phase-1-Schema + (Phase 3) einen Reader-Sweep, der ohne Phase 2 nicht non-placeholder spezifizierbar ist.

**Phase 2 — Engine (`lib/termine/engine/`):**
- `quelle` + `bezug_typ`/`bezug_id` additiv ergänzen; Exclusion-Constraint von `sv_id` auf `(assignee_typ, assignee_id)` generalisieren (DROP `gutachter_termine_no_sv_overlap` → ADD assignee-basiert; btree_gist ist aktiv; 19 Zeilen → instant lock; Vorab-Check: alle aktiven Zeilen haben assignee_id).
- `verfuegbarkeits_ausnahmen`-Tabelle (urlaub/krank/sperre) + Einfluss auf `v_belegung`/`freieSlots`.
- Ops: `pruefeBelegung`/`freieSlots`/`reserviere`/`bestaetige`/`sageAb`/`verlege`/`syncTerminToExternalCalendar`/`findeBestePerson` — konsolidieren `freebusy.ts`/`busy-slots.ts`/`slots.ts`/`kb-*`. Reservierungs-TTL (`reserviert_bis`) + Geister-Hold-Cleanup zentral in der Engine (P4 baut keinen Interim-Guard).

**Phase 3 — Consumer-Migration (einer nach dem anderen, je Smoke):**
- Dispatch (`findBestSV`, `sv-termin`) → Self-Service (`slots.ts` + Beauftragungs-Wizard P4) → KB (`kb-*`) → Kanzlei.
- **Hier** der `cache-busy.ts`-Repoint auf `v_belegung` (voll, extern ∪ eigene) **plus** Entfernen des separaten `belegte`-Reads pro Caller (sonst Doppelzählung). `sv_id`/`lead_id`-Kompat erst danach droppen.

**Phase 3b — Lifecycle-Korrektheit (CMM-73, Low, 1 Live-Fall):**
- Sobald die Engine die Termin-Anlage ownt: **bevorzugt Daten-Fix** — `bestaetige`/`reserviere` legt verlässlich den `erstgutachten`-Auftrag an → `v_claim_phase` derivt schon heute korrekt (kein parity-gegateter View-Umbau). Vorab Handoff-Query re-checken (`docs/01.06.2026/HANDOFF-cmm73-...`). Nur falls „Termin ohne Auftrag" gewollt → Derivation-Fix (getClaimLifecycle **+** v_claim_phase bit-gleich, North-Star-Test). **`v_claim_phase` = geteilte Kern-View → mit CMM-50/69/72 abstimmen.**

**Org-Dedup (vor Org-Level-Buchung):** nach Aaron-Entscheidung (`organisationen` empfohlen) das Verlierer-System droppen (beide 0 Zeilen → billig), `findeBestePerson` an die Sieger-Quelle binden.

**Optional-Cleanup (jederzeit, eigener Mini-PR):** Tabelle `sv_kalender_events_cache` → `externe_belegung` umbenennen; tote Exports `checkFreeBusy`/`listCalendarEvents` in `caldav/client.ts` entfernen.
