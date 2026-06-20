# Rückruf-Kanonisierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Rückruf-Entstehungswege auf eine kanonische DB-Quelle vereinheitlichen — ein RPC schreibt `admin_termine`, ein Trigger emittiert ein `notification_events`, die bestehende AAR-497-Pipeline fächert aus (Glocke/WA/Mail), eine View liest.

**Architecture:** DB-first. Schreiben = `rueckruf_upsert()` RPC (Dedup als partieller Unique-Index, Zuweisung in SQL). Benachrichtigen = AFTER-Trigger auf `admin_termine(typ='rueckruf')` → `INSERT notification_events` (+`pg_net`-Ping) → bestehender Worker `api/notifications/process`. Lesen = View `v_rueckrufe`. Die 8 TS-Writer werden inkrementell auf `.rpc()` umgehängt; ihre hand-geschriebenen `mitteilungen`/WA-Inserts entfallen dabei.

**Tech Stack:** Postgres (Supabase, plpgsql, partielle Unique-Indizes, `pg_net`, pgTAP), Next.js 16 Server-Actions/Route-Handlers, TypeScript, vitest.

## Global Constraints

- **DDL NUR über das Supabase-Plugin** (`mcp__plugin_supabase_supabase__apply_migration`) — nie CLI/raw-SQL. Nach jeder Migration: `list_migrations` → recorded Version `<V>` ablesen → Datei committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == getrackte Version). `execute_sql` nur für READ-Verifikation. (AGENTS.md Regel 2)
- **Nie auf `main` pushen.** Branch `kitta/rueckruf-kanonisierung` (existiert, ab `staging`), PR gegen `staging`. (Regel 1)
- **Frontend-Umlaute** echt (`ä/ö/ü/ß`) — gilt hier nur für `mitteilungen`-Titel/WA-Templates die User sehen.
- **Server-Actions liefern Result-Objekte** (`{ ok|success, error? }`), kein `throw`. Non-critical Sends in try/catch.
- **CI-Ratchets müssen grün bleiben:** `check:token-audit`, `check:component-set`, `check:knip`, `check:termin-engine-contract`. Nach Datei-Löschungen `check:knip -- --ratchet` lokal prüfen.
- **Branch ist KEIN Worktree-Auto-Setup** — diese Session läuft im Worktree `.claude/worktrees/aar-956-gf-2button` auf `kitta/rueckruf-kanonisierung`. Dateien IMMER unter dem Worktree-Pfad schreiben, nicht im Haupt-Checkout.
- **Koordination:** Phase B berührt das geteilte `lib/notifications/*`. Phase A/C berühren `lib/embed/reservierungs-rueckruf.ts` (Revier der `kitta/aar-956-embed-reservierung-rueckruf`-Linie). Vor Touch Memory-Marker schreiben + abgleichen.

---

## File Structure

**Neu (DB, via Migration-Files):**
- `supabase/migrations/<V>_rueckruf_admin_termine_anlass_spalten.sql` — Spalten `anlass`, `von_kunde`.
- `supabase/migrations/<V>_rueckruf_dedup_und_unique_index.sql` — Daten-Dedup + 2 partielle Unique-Indizes.
- `supabase/migrations/<V>_rueckruf_pick_dispatcher_und_upsert.sql` — SQL-Picker + RPC.
- `supabase/migrations/<V>_rueckruf_notify_trigger.sql` — Trigger-Funktion + Trigger.
- `supabase/migrations/<V>_v_rueckrufe.sql` — Read-View.

**Neu (TS):**
- `src/lib/notifications/__tests__/rueckruf-fan-out.test.ts` — vitest fan-out-Sonderfall.

**Modifiziert (TS, Phase B — Pipeline):**
- `src/lib/notifications/types.ts` — `Role += 'dispatch'`, `EventType += 'rueckruf.*'`, `EventPayloads`.
- `src/lib/notifications/channel-matrix.ts` — `EVENT_MATRIX['rueckruf.*']`.
- `src/lib/notifications/fan-out.ts` — `rueckruf.*`-Sonderfall.
- `src/lib/notifications/channels/whatsapp.ts` — Payload-Telefon-Zweig.
- `src/lib/notifications/channels/in-app.ts` — `rueckruf.*`-Mapping (Kategorie `anruf`).
- `src/lib/notifications/templates/whatsapp.ts` — Rückruf-Bestätigungs-Template.

**Modifiziert (TS, Phase C — Repoint, je 1 PR):**
- `src/app/dispatch/leads/[id]/_actions/rueckruf.ts` · `src/app/faelle/[id]/_sidebar/rueckruf-actions.ts` · `src/lib/actions/public-rueckruf.ts` · `src/app/embed/gutachter-finder/actions.ts` (+ `src/lib/embed/reservierungs-rueckruf.ts`) · `src/app/dispatch/rueckrufe/actions.ts` · `src/app/flow/[token]/self-service-actions.ts` · `src/components/shared/glass/BeratungModal.tsx` (Writer).
- Reader → `v_rueckrufe`: `src/app/dispatch/rueckrufe/page.tsx` u.a.

**Nicht angefasst:** `anruf_log`, `anruf_versuche`/`letzter_anruf_*`, `admin-termine-actions.ts` (generischer CRUD), `mitteilungen`-Tabelle/`createMitteilung`.

---

## Phase A — DDL-Fundament

> Alle Phase-A-Schritte sind **additiv** und ändern KEIN Verhalten der bestehenden Writer
> (der Trigger feuert nur, wenn `anlass IS NOT NULL` — das setzt ausschließlich die neue RPC).
> Reihenfolge der Migrationen ist strikt: A1 → A2 → A3 → A4 → A5.

### Task A1: Spalten `anlass`, `von_kunde` auf `admin_termine`

**Files:**
- Create: `supabase/migrations/<V>_rueckruf_admin_termine_anlass_spalten.sql`

**Interfaces:**
- Produces: `admin_termine.anlass text NULL`, `admin_termine.von_kunde boolean NULL` (von RPC gesetzt, vom Trigger als Guard gelesen).

- [ ] **Step 1: Live-Schema gegenprüfen** (Spalten existieren noch nicht)

Run (READ, via `execute_sql`):
```sql
select column_name from information_schema.columns
where table_name='admin_termine' and column_name in ('anlass','von_kunde');
```
Expected: 0 Zeilen.

- [ ] **Step 2: Migration anwenden**

`apply_migration({ name: "rueckruf_admin_termine_anlass_spalten", query: <SQL> })`:
```sql
ALTER TABLE public.admin_termine
  ADD COLUMN IF NOT EXISTS anlass text,
  ADD COLUMN IF NOT EXISTS von_kunde boolean;
COMMENT ON COLUMN public.admin_termine.anlass IS
  'Rueckruf-Entstehungsanlass (kunde_anfrage|dispatcher_plan|flow_abbruch|public_form|disposition_followup). NUR von rueckruf_upsert gesetzt; Guard fuer den notify-Trigger.';
```

- [ ] **Step 3: Recorded Version ablesen + Datei committen**

`list_migrations` → Version `<V>` der eben angewandten Migration ablesen.
Migration-File anlegen als `supabase/migrations/<V>_rueckruf_admin_termine_anlass_spalten.sql` mit exakt dem SQL aus Step 2.
```bash
git add supabase/migrations/<V>_rueckruf_admin_termine_anlass_spalten.sql
git commit -m "feat(rueckruf): admin_termine.anlass+von_kunde — RPC-Kontext + Trigger-Guard"
```

- [ ] **Step 4: Verifizieren**

Run (READ): `select column_name, data_type from information_schema.columns where table_name='admin_termine' and column_name in ('anlass','von_kunde');`
Expected: 2 Zeilen (`anlass`=text, `von_kunde`=boolean).

---

### Task A2: Daten-Dedup + partielle Unique-Indizes

**Files:**
- Create: `supabase/migrations/<V>_rueckruf_dedup_und_unique_index.sql`

**Interfaces:**
- Produces: Invariante „max. ein offener Rückruf pro `lead_id` bzw. `fall_id`" (DB-erzwungen) → ermöglicht `ON CONFLICT` in der RPC (A4).

- [ ] **Step 1: Bestehende Verletzer zählen** (READ)

Run:
```sql
select 'lead' k, count(*) FROM (
  select lead_id from admin_termine where typ='rueckruf' and status='offen' and lead_id is not null
  group by lead_id having count(*)>1) x
union all
select 'fall', count(*) FROM (
  select fall_id from admin_termine where typ='rueckruf' and status='offen' and fall_id is not null
  group by fall_id having count(*)>1) y;
```
Notiere die Zahlen (informativ — die Migration räumt sie auf).

- [ ] **Step 2: Migration anwenden** (Dedup ZUERST, dann Index — sonst schlägt der Index fehl)

`apply_migration({ name: "rueckruf_dedup_und_unique_index", query: <SQL> })`:
```sql
-- 1) Doppel-offene je lead_id: alle ausser dem neuesten auf 'abgesagt'
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY lead_id ORDER BY created_at DESC, id) AS rn
  FROM public.admin_termine
  WHERE typ='rueckruf' AND status='offen' AND lead_id IS NOT NULL
)
UPDATE public.admin_termine a SET status='abgesagt', updated_at=now()
FROM ranked r WHERE a.id=r.id AND r.rn>1;

-- 2) dito je fall_id
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY fall_id ORDER BY created_at DESC, id) AS rn
  FROM public.admin_termine
  WHERE typ='rueckruf' AND status='offen' AND fall_id IS NOT NULL
)
UPDATE public.admin_termine a SET status='abgesagt', updated_at=now()
FROM ranked r WHERE a.id=r.id AND r.rn>1;

-- 3) Partielle Unique-Indizes — ein offener pro Bezug
CREATE UNIQUE INDEX IF NOT EXISTS uniq_offener_rueckruf_lead
  ON public.admin_termine (lead_id)
  WHERE typ='rueckruf' AND status='offen' AND lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_offener_rueckruf_fall
  ON public.admin_termine (fall_id)
  WHERE typ='rueckruf' AND status='offen' AND fall_id IS NOT NULL;
```

- [ ] **Step 3: Recorded Version → Datei committen**

`list_migrations` → `<V>` → `supabase/migrations/<V>_rueckruf_dedup_und_unique_index.sql`.
```bash
git add supabase/migrations/<V>_rueckruf_dedup_und_unique_index.sql
git commit -m "feat(rueckruf): Dedup offener Rueckrufe + partielle Unique-Indizes (lead/fall)"
```

- [ ] **Step 4: Verifizieren** (READ)

Run: `select indexname from pg_indexes where tablename='admin_termine' and indexname like 'uniq_offener_rueckruf%';`
Expected: 2 Zeilen.

---

### Task A3: SQL-Dispatcher-Picker `rueckruf_pick_dispatcher`

**Files:**
- Create: `supabase/migrations/<V>_rueckruf_pick_dispatcher.sql`

**Interfaces:**
- Produces: `rueckruf_pick_dispatcher() RETURNS uuid` — least-loaded echter Dispatcher (Port von `lib/start-link/pick-dispatcher.ts`). Konsumiert von A4.

- [ ] **Step 1: Live-Annahmen prüfen** (READ — Spalten existieren)

Run: `select count(*) from profiles where rolle='dispatch';` und `select count(*) from information_schema.columns where table_name='leads' and column_name='zugewiesen_an';`
Expected: ≥1 bzw. 1.

- [ ] **Step 2: Migration anwenden**

`apply_migration({ name: "rueckruf_pick_dispatcher", query: <SQL> })`:
```sql
CREATE OR REPLACE FUNCTION public.rueckruf_pick_dispatcher()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.rolle = 'dispatch'
    AND COALESCE(p.email,'') !~* '(test|smoke|@claimondo\.test)'
  ORDER BY (
    SELECT count(*) FROM public.leads l
    WHERE l.zugewiesen_an = p.id
      AND l.status IN ('neu','rueckruf','quali-offen','flow-gesendet')
  ) ASC, p.created_at ASC NULLS LAST
  LIMIT 1
$$;
```

- [ ] **Step 3: Recorded Version → Datei committen**

`supabase/migrations/<V>_rueckruf_pick_dispatcher.sql`.
```bash
git add supabase/migrations/<V>_rueckruf_pick_dispatcher.sql
git commit -m "feat(rueckruf): SQL-Picker rueckruf_pick_dispatcher (least-loaded, Port pick-dispatcher.ts)"
```

- [ ] **Step 4: Verifizieren** (READ)

Run: `select public.rueckruf_pick_dispatcher();`
Expected: eine UUID (der echte Dispatcher) oder NULL falls keiner existiert.

---

### Task A4: RPC `rueckruf_upsert`

**Files:**
- Create: `supabase/migrations/<V>_rueckruf_upsert.sql`
- Test: pgTAP inline (Step 1)

**Interfaces:**
- Consumes: `rueckruf_pick_dispatcher()` (A3), Unique-Indizes (A2), Spalten (A1).
- Produces: `rueckruf_upsert(p_lead_id uuid, p_fall_id uuid, p_start timestamptz, p_anlass text, p_von_kunde boolean, p_zuweisen_an uuid DEFAULT NULL, p_notiz text DEFAULT NULL) RETURNS uuid` — der EINZIGE Rückruf-Schreibweg. Gibt `admin_termine.id` zurück.

- [ ] **Step 1: Failing pgTAP-Test schreiben** (Dedup-Invariante)

Run via `execute_sql` (pgTAP muss aktiv sein — falls nicht: `apply_migration({name:"enable_pgtap", query:"CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;"})` zuerst):
```sql
BEGIN;
SELECT plan(2);
-- Setup: ein Test-Lead mit Dispatcher
-- (nutze eine existierende lead_id aus: select id from leads limit 1)
SELECT lives_ok($$ SELECT rueckruf_upsert((select id from leads limit 1), NULL, now()+interval '1 day', 'dispatcher_plan', false) $$, 'erster upsert ok');
SELECT is(
  (SELECT count(*) FROM admin_termine WHERE typ='rueckruf' AND status='offen'
     AND lead_id=(select id from leads limit 1)),
  1::bigint, 'genau ein offener nach zweitem upsert');
SELECT lives_ok($$ SELECT rueckruf_upsert((select id from leads limit 1), NULL, now()+interval '2 day', 'kunde_anfrage', true) $$, 'zweiter upsert updated');
SELECT * FROM finish();
ROLLBACK;
```
Expected (vor A4): FAIL — `function rueckruf_upsert(...) does not exist`.

- [ ] **Step 2: Migration anwenden**

`apply_migration({ name: "rueckruf_upsert", query: <SQL> })`:
```sql
CREATE OR REPLACE FUNCTION public.rueckruf_upsert(
  p_lead_id uuid,
  p_fall_id uuid,
  p_start timestamptz,
  p_anlass text,
  p_von_kunde boolean,
  p_zuweisen_an uuid DEFAULT NULL,
  p_notiz text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_start timestamptz := COALESCE(p_start, now() + interval '5 minutes');
  v_name text;
  v_termin_id uuid;
BEGIN
  IF (p_lead_id IS NULL) = (p_fall_id IS NULL) THEN
    RAISE EXCEPTION 'rueckruf_upsert: genau einer von lead_id/fall_id muss gesetzt sein';
  END IF;

  -- Zuweisung: explizit > Bezug-Owner > Round-Robin
  v_owner := p_zuweisen_an;
  IF v_owner IS NULL AND p_lead_id IS NOT NULL THEN
    SELECT zugewiesen_an INTO v_owner FROM public.leads WHERE id = p_lead_id;
  END IF;
  IF v_owner IS NULL AND p_fall_id IS NOT NULL THEN
    SELECT c.kundenbetreuer_id INTO v_owner
    FROM public.claims c
    WHERE c.id = (SELECT claim_id FROM public.faelle WHERE id = p_fall_id);
  END IF;
  IF v_owner IS NULL THEN
    v_owner := public.rueckruf_pick_dispatcher();
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'rueckruf_upsert: kein Dispatcher verfuegbar';
  END IF;

  -- Titel-Name
  IF p_lead_id IS NOT NULL THEN
    SELECT NULLIF(trim(coalesce(vorname,'') || ' ' || coalesce(nachname,'')), '')
      INTO v_name FROM public.leads WHERE id = p_lead_id;
  ELSE
    SELECT 'Rückruf ' || coalesce(c.claim_nummer, left(p_fall_id::text, 8))
      INTO v_name FROM public.claims c
      WHERE c.id = (SELECT claim_id FROM public.faelle WHERE id = p_fall_id);
  END IF;
  v_name := COALESCE(v_name, 'Rückruf');

  IF p_lead_id IS NOT NULL THEN
    INSERT INTO public.admin_termine
      (typ, titel, start_zeit, end_zeit, status, lead_id, zugewiesen_an, erstellt_von,
       notizen, anlass, von_kunde, erinnerung_min_vorher)
    VALUES
      ('rueckruf', v_name, v_start, v_start + interval '30 minutes', 'offen', p_lead_id,
       v_owner, v_owner, p_notiz, p_anlass, p_von_kunde, 10)
    ON CONFLICT (lead_id) WHERE typ='rueckruf' AND status='offen' AND lead_id IS NOT NULL
    DO UPDATE SET
      titel = EXCLUDED.titel, start_zeit = EXCLUDED.start_zeit, end_zeit = EXCLUDED.end_zeit,
      zugewiesen_an = EXCLUDED.zugewiesen_an,
      notizen = COALESCE(EXCLUDED.notizen, public.admin_termine.notizen),
      anlass = EXCLUDED.anlass, von_kunde = EXCLUDED.von_kunde, updated_at = now()
    RETURNING id INTO v_termin_id;

    UPDATE public.leads
      SET qualifizierungs_phase = 'rueckruf', rueckruf_geplant_am = v_start, updated_at = now()
      WHERE id = p_lead_id;
  ELSE
    INSERT INTO public.admin_termine
      (typ, titel, start_zeit, end_zeit, status, fall_id, zugewiesen_an, erstellt_von,
       notizen, anlass, von_kunde, erinnerung_min_vorher)
    VALUES
      ('rueckruf', v_name, v_start, v_start + interval '30 minutes', 'offen', p_fall_id,
       v_owner, v_owner, p_notiz, p_anlass, p_von_kunde, 10)
    ON CONFLICT (fall_id) WHERE typ='rueckruf' AND status='offen' AND fall_id IS NOT NULL
    DO UPDATE SET
      titel = EXCLUDED.titel, start_zeit = EXCLUDED.start_zeit, end_zeit = EXCLUDED.end_zeit,
      zugewiesen_an = EXCLUDED.zugewiesen_an,
      notizen = COALESCE(EXCLUDED.notizen, public.admin_termine.notizen),
      anlass = EXCLUDED.anlass, von_kunde = EXCLUDED.von_kunde, updated_at = now()
    RETURNING id INTO v_termin_id;
  END IF;

  RETURN v_termin_id;
END;
$$;
```

> **Hinweis fall_id→claim:** Der Branch nutzt `faelle.claim_id`. Falls `faelle` zum Implementierungszeitpunkt bereits gedroppt ist (CMM-49-Drop), in Step 2 die Auflösung auf die dann gültige Bridge/`v_claim_full` umstellen — vorher per `execute_sql` prüfen: `select column_name from information_schema.columns where table_name='faelle' and column_name='claim_id';`

- [ ] **Step 3: pgTAP-Test erneut laufen lassen**

Run den Test aus Step 1 via `execute_sql`.
Expected: alle Assertions PASS (1 offener nach zweitem Upsert).

- [ ] **Step 4: Recorded Version → Datei committen**

`supabase/migrations/<V>_rueckruf_upsert.sql` (+ ggf. `<V>_enable_pgtap.sql`).
```bash
git add supabase/migrations/<V>_rueckruf_upsert.sql
git commit -m "feat(rueckruf): rueckruf_upsert RPC — einziger Schreibweg, Dedup via ON CONFLICT"
```

---

### Task A5: Notify-Trigger → `notification_events`

**Files:**
- Create: `supabase/migrations/<V>_rueckruf_notify_trigger.sql`

**Interfaces:**
- Consumes: `admin_termine.anlass` (Guard), RPC-geschriebene Rückrufe.
- Produces: bei jedem RPC-Rückruf-Insert/Update eine `notification_events`-Zeile (`event_type='rueckruf.erstellt'|'rueckruf.kunde_wunsch'`).

> **Sicherheits-Invariante:** Trigger feuert NUR `WHEN (NEW.typ='rueckruf' AND NEW.anlass IS NOT NULL)`.
> Bestehende hand-geschriebene Writer setzen `anlass` NICHT → kein Doppel-Notify während des
> inkrementellen Repoints (Phase C). Erst wenn ein Writer auf die RPC umgestellt ist (setzt `anlass`),
> emittiert er via Trigger — und sein hand-geschriebenes `mitteilungen`/WA wird im selben PR entfernt.

- [ ] **Step 1: Migration anwenden**

`apply_migration({ name: "rueckruf_notify_trigger", query: <SQL> })`:
```sql
CREATE OR REPLACE FUNCTION public.rueckruf_emit_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vorname text; v_nachname text; v_telefon text; v_name text;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT vorname, nachname, telefon INTO v_vorname, v_nachname, v_telefon
    FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  v_name := NULLIF(trim(coalesce(v_vorname,'') || ' ' || coalesce(v_nachname,'')), '');

  INSERT INTO public.notification_events (event_type, payload, status)
  VALUES (
    CASE WHEN NEW.von_kunde THEN 'rueckruf.kunde_wunsch' ELSE 'rueckruf.erstellt' END,
    jsonb_build_object(
      'leadId', NEW.lead_id, 'fallId', NEW.fall_id, 'terminId', NEW.id,
      'dispatcherUserId', NEW.zugewiesen_an,
      'kundeName', COALESCE(v_name,'Kunde'), 'kundeVorname', v_vorname,
      'kundeTelefon', v_telefon, 'vonKunde', NEW.von_kunde, 'startIso', NEW.start_zeit
    ),
    'pending'
  );

  -- Worker-Ping (instant); Cron-Fallback (*/5min) liefert ohnehin.
  -- Secret/URL aus DB-GUC (Plan-Detail: per ALTER DATABASE SET app.cron_secret=... / app.site_url=...).
  PERFORM net.http_post(
    url     := current_setting('app.site_url', true) || '/api/notifications/process',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-internal-token', current_setting('app.cron_secret', true)),
    body    := '{}'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Notify ist non-critical: ein pg_net/Setting-Fehler darf den Rueckruf-Write nie brechen.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rueckruf_emit_notification ON public.admin_termine;
CREATE TRIGGER trg_rueckruf_emit_notification
  AFTER INSERT OR UPDATE ON public.admin_termine
  FOR EACH ROW
  WHEN (NEW.typ = 'rueckruf' AND NEW.anlass IS NOT NULL)
  EXECUTE FUNCTION public.rueckruf_emit_notification();
```

> **GUC-Setup (einmalig, separate Migration ODER manuell durch Aaron):**
> `ALTER DATABASE postgres SET app.site_url = 'https://claimondo.de';`
> `ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET>';`
> Falls die GUCs fehlen, ist `current_setting(..., true)=NULL` → `net.http_post` no-op-t, der Cron
> liefert dennoch. Den Secret-Wert NICHT ins Migration-File schreiben (nur das `ALTER DATABASE` als
> Hinweis dokumentieren; Wert setzt Aaron). `pg_net` ist installiert (Schema `extensions`/`net`).

- [ ] **Step 2: Recorded Version → Datei committen** (Secret-Wert NICHT im File)
```bash
git add supabase/migrations/<V>_rueckruf_notify_trigger.sql
git commit -m "feat(rueckruf): notify-Trigger -> notification_events (Guard anlass IS NOT NULL, pg_net-Ping)"
```

- [ ] **Step 3: Verifizieren** (READ — Trigger feuert nur mit anlass)

Run via `execute_sql` (transaktional, rollback):
```sql
BEGIN;
SELECT rueckruf_upsert((select id from leads limit 1), NULL, now()+interval '1 day', 'dispatcher_plan', false);
SELECT count(*) AS events FROM notification_events
  WHERE event_type IN ('rueckruf.erstellt','rueckruf.kunde_wunsch') AND created_at > now()-interval '1 minute';
ROLLBACK;
```
Expected: `events`=1.

---

### Task A6: Read-View `v_rueckrufe`

**Files:**
- Create: `supabase/migrations/<V>_v_rueckrufe.sql`

**Interfaces:**
- Produces: View `v_rueckrufe` mit Spalten: `id, start_zeit, end_zeit, status, notizen, gesehen_am, lead_id, fall_id, zugewiesen_an, anlass, von_kunde, vorname, nachname, telefon, email, qualifizierungs_phase, anruf_versuche, letzter_anruf_am, letzter_anruf_status, ist_ueberfaellig`.

- [ ] **Step 1: Migration anwenden**

`apply_migration({ name: "v_rueckrufe", query: <SQL> })`:
```sql
CREATE OR REPLACE VIEW public.v_rueckrufe AS
SELECT
  t.id, t.start_zeit, t.end_zeit, t.status, t.notizen, t.gesehen_am,
  t.lead_id, t.fall_id, t.zugewiesen_an, t.anlass, t.von_kunde,
  l.vorname, l.nachname, l.telefon, l.email,
  l.qualifizierungs_phase, l.anruf_versuche, l.letzter_anruf_am, l.letzter_anruf_status,
  (t.start_zeit < now()) AS ist_ueberfaellig
FROM public.admin_termine t
LEFT JOIN public.leads l ON l.id = t.lead_id
WHERE t.typ = 'rueckruf';
```
> Fall-gebundene Rückrufe (`lead_id IS NULL, fall_id` gesetzt) liefern die Lead-Spalten NULL;
> Consumer der Fallakte (`FallRueckrufSection`) filtern ohnehin auf `fall_id`. Falls ein Fall-Name
> gebraucht wird: später per `LEFT JOIN claims` ergänzen (YAGNI bis ein Consumer es braucht).

- [ ] **Step 2: Recorded Version → Datei committen**
```bash
git add supabase/migrations/<V>_v_rueckrufe.sql
git commit -m "feat(rueckruf): View v_rueckrufe — kanonische Lesequelle"
```

- [ ] **Step 3: Verifizieren** (READ)

Run: `select count(*), count(*) filter (where ist_ueberfaellig) from v_rueckrufe where status='offen';`
Expected: Zahlen ohne Fehler (Spalten existieren).

- [ ] **Step 4: TS-Types regenerieren**

`generate_typescript_types` → das Ergebnis in `src/lib/supabase/database.types.ts` übernehmen.
```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(rueckruf): regen DB-Types (anlass/von_kunde/v_rueckrufe/RPC)"
```

---

## Phase B — Notification-Pipeline-Erweiterung (additiv)

> Diese Phase fügt der Pipeline `rueckruf.*` hinzu, ohne Claim-Events zu verändern. Bis Phase C
> emittiert noch kein Writer die Events — die Erweiterung liegt also „scharf, aber ungenutzt".

### Task B1: Types — `Role += 'dispatch'`, `EventType += 'rueckruf.*'`, Payloads

**Files:**
- Modify: `src/lib/notifications/types.ts`

**Interfaces:**
- Produces: `Role` mit `'dispatch'`; `EventType` mit `'rueckruf.erstellt' | 'rueckruf.kunde_wunsch'`; `EventPayloads['rueckruf.erstellt'|'rueckruf.kunde_wunsch']`.

- [ ] **Step 1: `Role` erweitern**

In `src/lib/notifications/types.ts:12` ersetzen:
```ts
export type Role = 'kunde' | 'sachverstaendiger' | 'makler' | 'kundenbetreuer' | 'admin' | 'dispatch'
```

- [ ] **Step 2: `EventType` erweitern** (am Ende der Union, vor dem Zeilenende von `'termin.verschoben_durch_kunde'`)

Nach `| 'termin.verschoben_durch_kunde'` ergänzen:
```ts
  // 5.19 Rueckruf (Rueckruf-Kanonisierung 2026-06-20)
  | 'rueckruf.erstellt'
  | 'rueckruf.kunde_wunsch'
```

- [ ] **Step 3: `EventPayloads` ergänzen** (im `EventPayloads`-Interface, vor der schließenden `}`)
```ts
  // 5.19 Rueckruf
  'rueckruf.erstellt': { leadId: string | null; fallId: string | null; terminId: string; dispatcherUserId: string | null; kundeName: string; kundeVorname: string | null; kundeTelefon: string | null; vonKunde: boolean; startIso: string }
  'rueckruf.kunde_wunsch': { leadId: string | null; fallId: string | null; terminId: string; dispatcherUserId: string | null; kundeName: string; kundeVorname: string | null; kundeTelefon: string | null; vonKunde: boolean; startIso: string }
```

- [ ] **Step 4: tsc grün**

Run: `npx tsc --noEmit`
Expected: PASS (EVENT_MATRIX wird in B2 vervollständigt — falls tsc hier über fehlende Matrix-Keys meckert, B2 direkt anschließen und gemeinsam committen).

- [ ] **Step 5: Commit**
```bash
git add src/lib/notifications/types.ts
git commit -m "feat(rueckruf): notification-Types — dispatch-Rolle + rueckruf.* Events"
```

---

### Task B2: `EVENT_MATRIX['rueckruf.*']`

**Files:**
- Modify: `src/lib/notifications/channel-matrix.ts`

**Interfaces:**
- Consumes: `EventType`, `Role` (B1).
- Produces: Channel-Policy für `rueckruf.*`.

- [ ] **Step 1: Matrix-Einträge ergänzen** (vor der schließenden `}` von `EVENT_MATRIX`)
```ts
  // 5.19 Rueckruf (Rueckruf-Kanonisierung)
  'rueckruf.erstellt': {
    priority: 'urgent',
    channels: { dispatch: ['in_app'], admin: ['in_app'] },
  },
  'rueckruf.kunde_wunsch': {
    priority: 'urgent',
    channels: { dispatch: ['in_app'], admin: ['in_app'], kunde: ['whatsapp'] },
  },
```

- [ ] **Step 2: tsc grün**

Run: `npx tsc --noEmit`
Expected: PASS (alle `EventType`-Keys jetzt in der Matrix).

- [ ] **Step 3: Commit**
```bash
git add src/lib/notifications/channel-matrix.ts
git commit -m "feat(rueckruf): EVENT_MATRIX rueckruf.* — Glocke an dispatch, Kunde-WA bei Wunsch"
```

---

### Task B3: fan-out-Sonderfall für `rueckruf.*`

**Files:**
- Modify: `src/lib/notifications/fan-out.ts`
- Test: `src/lib/notifications/__tests__/rueckruf-fan-out.test.ts`

**Interfaces:**
- Consumes: `computeRecipients(event)`, `EVENT_MATRIX`.
- Produces: für `rueckruf.*` Empfänger direkt aus Payload — `dispatcherUserId` (Rolle `dispatch`) + synthetischer Kunde-Empfänger (`userId = 'lead:' || leadId`, Rolle `kunde`) für die WA.

- [ ] **Step 1: Failing test schreiben**

Create `src/lib/notifications/__tests__/rueckruf-fan-out.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { computeRecipients } from '../fan-out'
import type { NotificationEvent } from '../types'

function ev(partial: Partial<NotificationEvent>): NotificationEvent {
  return { id: 'e1', event_type: 'rueckruf.kunde_wunsch', payload: {}, fall_id: null,
    triggered_by_user_id: null, created_at: '', processed_at: null, status: 'pending',
    error_message: null, retry_count: 0, next_retry_at: null, ...partial } as NotificationEvent
}

describe('rueckruf fan-out', () => {
  it('dispatcher bekommt in_app, kunde bekommt whatsapp', async () => {
    const r = await computeRecipients(ev({
      event_type: 'rueckruf.kunde_wunsch',
      payload: { leadId: 'L1', dispatcherUserId: 'D1', kundeTelefon: '+4915112345678' },
    }))
    const disp = r.find((x) => x.userId === 'D1')
    const kunde = r.find((x) => x.role === 'kunde')
    expect(disp?.channels).toContain('in_app')
    expect(kunde?.channels).toContain('whatsapp')
  })

  it('rueckruf.erstellt hat KEINEN kunde-empfaenger (keine WA)', async () => {
    const r = await computeRecipients(ev({
      event_type: 'rueckruf.erstellt',
      payload: { leadId: 'L1', dispatcherUserId: 'D1', kundeTelefon: '+4915112345678' },
    }))
    expect(r.find((x) => x.role === 'kunde')).toBeUndefined()
    expect(r.find((x) => x.userId === 'D1')?.channels).toContain('in_app')
  })
})
```

- [ ] **Step 2: Test laufen lassen — FAIL**

Run: `npx vitest run src/lib/notifications/__tests__/rueckruf-fan-out.test.ts`
Expected: FAIL (kein rueckruf-Branch → leere Empfängerliste).

- [ ] **Step 3: Sonderfall implementieren**

In `src/lib/notifications/fan-out.ts`, direkt nach dem `task.*`-Block (nach Zeile 139, vor dem `makler`-Block), einfügen:
```ts
  // 5.19 Rueckruf: Empfaenger direkt aus Payload (Lead-/extern, kein fall_id).
  if (event.event_type === 'rueckruf.erstellt' || event.event_type === 'rueckruf.kunde_wunsch') {
    const dispatcherUserId = typeof payload.dispatcherUserId === 'string' ? payload.dispatcherUserId : null
    if (dispatcherUserId && config.channels.dispatch?.length) {
      addRecipient(map, dispatcherUserId, 'dispatch', config.channels.dispatch)
    }
    // Kunde-WA nur wenn Matrix den kunde-Channel hat (= kunde_wunsch). Lead-Kunde = kein User →
    // synthetischer userId-Marker 'lead:<leadId>'; der WA-Handler liest die Nummer aus dem Payload.
    const leadId = typeof payload.leadId === 'string' ? payload.leadId : null
    if (leadId && config.channels.kunde?.length) {
      addRecipient(map, `lead:${leadId}`, 'kunde', config.channels.kunde)
    }
    // Admin-in_app (Protokoll), falls konfiguriert.
    return flatten(map, selfNotifyUserId(event))
  }
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run src/lib/notifications/__tests__/rueckruf-fan-out.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/notifications/fan-out.ts src/lib/notifications/__tests__/rueckruf-fan-out.test.ts
git commit -m "feat(rueckruf): fan-out-Sonderfall — dispatcher+kunde aus Payload (kein fall_id)"
```

---

### Task B4: WhatsApp-Handler — Payload-Telefon + Template

**Files:**
- Modify: `src/lib/notifications/channels/whatsapp.ts`
- Modify: `src/lib/notifications/templates/whatsapp.ts`

**Interfaces:**
- Consumes: `whatsappHandler(input)`, `resolveWhatsAppTemplate(...)`.
- Produces: WA an `payload.kundeTelefon` für `rueckruf.kunde_wunsch` (Empfänger `lead:<id>`).

- [ ] **Step 1: WA-Handler — Payload-Telefon-Zweig**

In `src/lib/notifications/channels/whatsapp.ts`, in `whatsappHandler`, die `lookupPhone`-Zeile (24-28) ersetzen durch:
```ts
  // Rueckruf-Kunde ist ein Lead (kein User) → Nummer aus dem Payload statt profiles-Lookup.
  const isLeadRecipient = input.recipientUserId.startsWith('lead:')
  const phone = isLeadRecipient
    ? ((input.payload.kundeTelefon as string | null) ?? null)
    : await lookupPhone(input.recipientUserId)
  if (!phone) {
    return { success: false, skipReason: 'no_phone_for_recipient' }
  }
```

- [ ] **Step 2: Template-Mapping für `rueckruf.kunde_wunsch`**

In `src/lib/notifications/templates/whatsapp.ts` (Datei zuerst lesen für die exakte Struktur von `resolveWhatsAppTemplate` + vorhandene Template-Namen) den `rueckruf.kunde_wunsch`-Fall ergänzen: Template „Beratungsgespräch vereinbart" mit Variablen `{vorname, zeit}`. Exakte Template-Registrierung dem Datei-Muster folgend (Baileys-Legacy-Text).

- [ ] **Step 3: tsc grün**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/lib/notifications/channels/whatsapp.ts src/lib/notifications/templates/whatsapp.ts
git commit -m "feat(rueckruf): WA-Handler nimmt Payload-Telefon fuer Lead-Kunde + Bestaetigungs-Template"
```

---

### Task B5: in-app-Handler — `rueckruf.*`-Mapping (Kategorie `anruf`)

**Files:**
- Modify: `src/lib/notifications/channels/in-app.ts`

**Interfaces:**
- Consumes: `mapEventToMitteilung(eventType, payload)`.
- Produces: Glocke „Rückruf: {Name}", `kategorie='anruf'`, `kontext_typ='lead'`, Route `/dispatch/rueckrufe`.

- [ ] **Step 1: `ROLE_MAP` um `dispatch` ergänzen**

In `src/lib/notifications/channels/in-app.ts:27-33` (`ROLE_MAP`) ergänzen:
```ts
  dispatch: 'dispatch',
```
> Vorbedingung: `mitteilungen.empfaenger_rolle` lässt `'dispatch'` zu (Weg 3 nutzt es heute) +
> `EmpfaengerRolle`-Type in `src/lib/mitteilungen/types.ts` enthält `'dispatch'`. Falls nicht:
> dort ergänzen (kein DB-Constraint laut Audit). Per `execute_sql` prüfen:
> `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='mitteilungen'::regclass and contype='c';`

- [ ] **Step 2: `rueckruf.*`-Cases im Switch** (in `mapEventToMitteilung`, vor `default:`)
```ts
    case 'rueckruf.erstellt':
    case 'rueckruf.kunde_wunsch': {
      const name = asString(payload.kundeName) ?? 'Kunde'
      const leadId = asString(payload.leadId)
      return {
        titel: `Rückruf: ${name}`,
        inhalt: asString(payload.kundeTelefon) ?? null,
        kategorie: 'anruf',
        kontext_typ: leadId ? 'lead' : null,
        kontext_id: leadId ?? null,
      }
    }
```
> `kategorie: 'anruf'` ist ein gültiger `MitteilungKategorie`-Wert (UpdatesNav-Tab existiert, war nur
> mangels Anruf-Events leer). Falls der Type es nicht kennt: in `src/lib/mitteilungen/types.ts` prüfen.

- [ ] **Step 3: tsc grün**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/lib/notifications/channels/in-app.ts
git commit -m "feat(rueckruf): in-app-Mapping -> mitteilungen (Kategorie anruf, Route /dispatch/rueckrufe)"
```

---

### Task B6: End-to-End-Smoke (Pipeline scharf)

**Files:** keine (Verifikation).

- [ ] **Step 1: Build grün**

Run: `npm run build`
Expected: PASS (Routen/Server-Actions validieren).

- [ ] **Step 2: Manueller DB-Smoke** (READ, transaktional)

Run via `execute_sql`:
```sql
BEGIN;
SELECT rueckruf_upsert((select id from leads where telefon is not null limit 1), NULL,
                       now()+interval '1 day', 'kunde_anfrage', true);
-- Worker simulieren: das Event existiert pending — Recipients prüfen wir im echten Worker-Lauf.
SELECT event_type, payload->>'dispatcherUserId' AS disp, payload->>'kundeTelefon' AS tel
FROM notification_events WHERE event_type LIKE 'rueckruf.%' AND created_at > now()-interval '1 min';
ROLLBACK;
```
Expected: 1 Event `rueckruf.kunde_wunsch` mit gesetztem `disp` + `tel`.

---

## Phase C — Writer-Repoint + Reader-Migration (je 1 PR)

> Jeder Repoint-PR: (1) Writer ruft `rueckruf_upsert` via `.rpc()`, (2) sein hand-geschriebenes
> `admin_termine`-Insert + `mitteilungen`/WA wird ENTFERNT, (3) Build + Smoke. Sobald `anlass`
> gesetzt wird, übernimmt der Trigger die Benachrichtigung — kein Doppel, keine Lücke.
> Reihenfolge nach Risiko: erst dispatcher-interne Wege (1,2,6), dann externe (3,5,7,8).

### Task C1: `saveRueckruf` (Weg 1) → RPC — Referenz-Muster

**Files:**
- Modify: `src/app/dispatch/leads/[id]/_actions/rueckruf.ts`

**Interfaces:**
- Consumes: `supabase.rpc('rueckruf_upsert', {...})`.

- [ ] **Step 1: `saveRueckruf` (Datum-gesetzt-Zweig) auf RPC umstellen**

In `saveRueckruf` den gesamten Block „existing finden → update/insert + leads-Update" (ca. Zeile 59-127) ersetzen durch:
```ts
  const { data: terminId, error } = await supabase.rpc('rueckruf_upsert', {
    p_lead_id: leadId,
    p_fall_id: null,
    p_start: datumIso,
    p_anlass: 'dispatcher_plan',
    p_von_kunde: false,
    p_zuweisen_an: user.id,
    p_notiz: notiz,
  })
  if (error) return { success: false, error: error.message }
```
GCal-Sync-Block (falls weiter gewünscht) auf `terminId` umstellen. Der `datumIso===null`-Zweig
(Absage) bleibt unverändert (setzt `status='abgesagt'`).

- [ ] **Step 2: Build + Lint grün**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Smoke** — Dispatcher plant Rückruf am Lead → erscheint in `/dispatch/rueckrufe`, Glocke beim Dispatcher.

- [ ] **Step 4: Commit**
```bash
git add src/app/dispatch/leads/[id]/_actions/rueckruf.ts
git commit -m "refactor(rueckruf): saveRueckruf -> rueckruf_upsert RPC (Glocke via Pipeline)"
```

### Task C2: `saveFallRueckruf` (Weg 2) → RPC
- Wie C1, in `src/app/faelle/[id]/_sidebar/rueckruf-actions.ts`. Aufruf:
  `rpc('rueckruf_upsert', { p_lead_id: null, p_fall_id: fallId, p_start: datumIso, p_anlass: 'dispatcher_plan', p_von_kunde: false, p_zuweisen_an: user.id, p_notiz: notiz })`.
  Hand-Insert (Zeile 48-83) entfernen. Commit `refactor(rueckruf): saveFallRueckruf -> RPC`.

### Task C3: `markRueckrufErledigtMitErgebnis` Folgetermin (Weg 6) → RPC
- In `src/app/dispatch/rueckrufe/actions.ts` den Folgetermin-Insert (Zeile 86-128) durch
  `rpc('rueckruf_upsert', { p_lead_id: leadId, p_fall_id: null, p_start: neuerTerminIso, p_anlass: 'disposition_followup', p_von_kunde: false, p_zuweisen_an: user.id, p_notiz: notiz })` ersetzen.
  `anruf_log` + `leads`-Updates bleiben. Commit `refactor(rueckruf): disposition-Folgetermin -> RPC`.

### Task C4: `erstelleOeffentlichenRueckruf` (Weg 3) → RPC
- In `src/lib/actions/public-rueckruf.ts`: `createLead` bleibt; den `admin_termine`-Insert (Zeile 85-95)
  + den `mitteilungen`-Insert (Zeile 109-119) ENTFERNEN, ersetzt durch
  `rpc('rueckruf_upsert', { p_lead_id: created.leadId, p_fall_id: null, p_start: input.startZeit ?? null, p_anlass: 'public_form', p_von_kunde: true, p_notiz: ... })`.
  `notifyNewLead` (Team) bleibt (Neulead). Die **Kunde-WA** (Zeile 139-154) entfernen — kommt jetzt
  via Pipeline (`rueckruf.kunde_wunsch` → kunde-whatsapp). Commit `refactor(rueckruf): public-rueckruf -> RPC, hand-Notify raus`.

### Task C5: Embed Weg 5 (`bucheRueckrufBeimDispatcher`) → RPC
- In `src/app/embed/gutachter-finder/actions.ts`: `upsertReservierungsRueckruf({vonKunde:true})`-Aufruf
  (Zeile 653) + den `mitteilungen`-Insert (Zeile 671-684) + die Kunde-WA (Zeile 686-698) ersetzen durch
  `rpc('rueckruf_upsert', { p_lead_id: leadId, p_fall_id: null, p_start: startIso, p_anlass: 'kunde_anfrage', p_von_kunde: true })`.
  **Koordination mit `embed-reservierung-rueckruf`-Linie** (Memory-Marker). Commit `refactor(rueckruf): embed Danke-Wunschzeit -> RPC`.

### Task C6: `aendereTerminFlow` (Weg 7) → RPC — Bugfix sichtbar
- In `src/app/flow/[token]/self-service-actions.ts` im `bestätigt`-Zweig (Zeile 250-258): NACH dem
  `leads.update({status:'rueckruf', notiz})` zusätzlich
  `rpc('rueckruf_upsert', { p_lead_id: leadId, p_fall_id: null, p_start: null, p_anlass: 'flow_abbruch', p_von_kunde: true, p_notiz: notiz })`.
  Damit erscheint der abgebrochene Termin als echter Rückruf in `/dispatch/rueckrufe`.
  Commit `fix(rueckruf): Flow-Termin-Abbruch erzeugt sichtbaren Rueckruf (Weg 7)`.

### Task C7: `BeratungModal` (Weg 8) → RPC
- `src/components/shared/glass/BeratungModal.tsx` + dessen Server-Action zuerst auditieren
  (`grep -n "admin_termine\|mitteilungen\|rueckruf" <Datei>`). Wenn es `erstelleOeffentlichenRueckruf`
  ruft → nach C4 automatisch sauber, nur verifizieren. Sonst eigenen Hand-Insert auf RPC umstellen.
  Commit `refactor(rueckruf): BeratungModal -> RPC`.

### Task C8: Embed Weg 4 — Auto-Rückruf abschalten (Handoff-Vorbereitung)
- In `src/app/embed/gutachter-finder/actions.ts` den Auto-`upsertReservierungsRueckruf({vonKunde:false})`
  (Zeile 320-330) ENTFERNEN (Weg 4 entfällt laut Spec §7). „Offene Reservierung bestätigen" wird WP-D
  (Embed-Linie) über `gutachter_termine.status='reserviert'` lösen. **Vor Entfernen mit der
  `embed-reservierung-rueckruf`-Linie abstimmen** (deren #2993-Code). Commit
  `refactor(rueckruf): Embed-Reservierung erzeugt keinen Auto-Rueckruf mehr (Weg 4 -> WP-D)`.

### Task C9: Reader → `v_rueckrufe`
- `src/app/dispatch/rueckrufe/page.tsx`: die `.from('admin_termine').select(...).eq('typ','rueckruf')`-
  Query (Zeile 43-52) ersetzen durch `.from('v_rueckrufe').select('*').eq('status','offen').not('lead_id','is',null).order('start_zeit')`.
  Felder kommen flach aus der View (kein nested-Join-Normalisieren mehr nötig). Analog die anderen
  Reader (`dashboard/page.tsx`, `mitarbeiter/page.tsx`, `NeueTermineBadge.tsx`, `FallRueckrufSection.tsx`)
  — je eigener Commit, je Build+Smoke. Commit-Muster `refactor(rueckruf): <reader> liest v_rueckrufe`.

- [ ] **Nach C9: `check:knip -- --ratchet` lokal laufen lassen** (gelöschte Hand-Notify-Pfade könnten
  Imports orphanen). Fix = löschen statt Baseline-Bump.

---

## Phase D — Reservierung ≠ Rückruf (Handoff)

**Nicht Teil dieses Plans** — Revier der `kitta/aar-956-embed-reservierung-rueckruf`-Linie.
Inhalt: „Offene Reservierungen bestätigen" als Dispatch-Sicht auf `gutachter_termine.status='reserviert'`
(Basis `v_lead_termin_gutachter` #2959). Übergabe via Memory-Marker
`COORDINATION-rueckruf-kanonisierung-WP-D.md`. Voraussetzung: C8 (Auto-Rückruf Weg 4 entfernt).

---

## Rollout & Koordination

1. **A1–A6 zuerst** (additiv, kein Verhalten geändert) — eigene Migrations-PRs, je Regel-2-Prozedur.
2. **GUC-Secrets** (`app.site_url`, `app.cron_secret`) durch Aaron setzen (oder pg_net-Ping akzeptiert
   ≤5min Cron-Latenz).
3. **B1–B6** (Pipeline scharf, ungenutzt).
4. **C1–C9** inkrementell, je 1 PR, Reihenfolge 1→2→6→3→5→7→8→4→Reader. Nach jedem PR Build + Smoke.
5. **Memory-Marker** vor C5/C8 (Embed-Revier) + vor B (Shared-Notifications) — andere Sessions abgleichen.
6. **Staging→main-Release** durch die Merge-Session; DROP/Col-Cleanup (keine in diesem Plan) n/a.

---

## Self-Review

**Spec-Coverage:** Work-Item-RPC (A4) ✓ · Dedup-Invariante (A2) ✓ · View (A6) ✓ · Zuweisung in SQL (A3+A4) ✓ · Trigger→notification_events (A5) ✓ · Pipeline-Erweiterung dispatch-Rolle/fan-out/WA/in-app (B1–B5) ✓ · EVENT_MATRIX (B2) ✓ · 8-Wege-Repoint inkl. Weg-7-Fix (C1–C8) ✓ · Reader→View (C9) ✓ · Reservierung-Trennung = Handoff (D) ✓ · Flag-Regel qualifizierungs_phase, status unangetastet (A4-RPC) ✓ · GCal-Channel = niedrig-prio, als WP-C-Nachzügler in C1/Rollout vermerkt ✓.

**Placeholder-Scan:** Migrations-Versionen `<V>` sind ABSICHTLICH Platzhalter (Regel 2: Version wird erst beim `apply_migration` vergeben). Template-Detail in B4-Step2 + Mitteilungs-Type-Check in B5 verweisen auf „Datei zuerst lesen" — das ist korrekte Vorsicht (exakte Struktur muss am Live-Code verifiziert werden, nicht erraten), kein fauler Platzhalter.

**Type-Consistency:** RPC-Signatur `rueckruf_upsert(p_lead_id,p_fall_id,p_start,p_anlass,p_von_kunde,p_zuweisen_an,p_notiz)` identisch in A4 + allen C-Aufrufen. `Role+'dispatch'` (B1) konsistent in EVENT_MATRIX (B2) + fan-out (B3) + ROLE_MAP (B5). Event-Keys `rueckruf.erstellt|kunde_wunsch` konsistent über A5/B1/B2/B3/B5. Payload-Felder (`dispatcherUserId`, `kundeTelefon`, `leadId`) identisch in Trigger (A5), Payload-Type (B1), fan-out (B3), WA-Handler (B4), in-app (B5).
