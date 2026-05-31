# CMM-49 FK-Re-Key Runway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede operative `faelle`-Kind-Tabelle bekommt eine korrekt befüllte, selbst-erhaltende `claim_id`-Spalte + FK auf `claims(id)` — additiv, reversibel, **ohne** Code-Writes anzufassen — als physische Vorstufe zum späteren `DROP TABLE faelle`.

**Architecture:** Pro Re-Key-Tisch: `claim_id` ADD (nullable) → Backfill aus `faelle.claim_id` über `fall_id` → FK auf `claims` (on_delete des alten `fall_id`-FK gespiegelt) → Index → **`claim_id`-Ableitungs-Trigger** (`BEFORE INSERT OR UPDATE OF fall_id`), der `claim_id` aus `fall_id` herleitet wenn nicht gesetzt. `fall_id` bleibt unangetastet (Write-Pfad + Reads laufen weiter). Das entkoppelt den DB-seitigen Re-Key vollständig von der Code-Writer-Migration und vom Drop.

**Tech Stack:** PostgreSQL 17 (Supabase, Projekt `paizkjajbuxxksdoycev`), DDL **ausschließlich** via Supabase-Plugin `apply_migration` (AGENTS.md Regel 2), Migration-Files in `supabase/migrations/`.

---

## Live-Stand (gemessen 2026-05-31, autoritativ)

- `faelle` 74 Rows, **74/74 mit `claim_id`** (0 Waisen), 278 Spalten · `claims` 75 Rows (1 Twin ohne faelle), 173 Spalten.
- **47 FKs → `faelle.id`**, dreigeteilt:
  - **37 operative Re-Key-Ziele** (`fall_id`, kein `claim_id`) → dieser Plan.
  - **6 halb-migriert** (`claim_id` vorhanden, FK hängt aber noch an faelle): `auftraege, fall_dokumente, gutachter_termine, kanzlei_faelle, phase_transitions, timeline` → Task 4 (nur Trigger-Absicherung + Coverage-Verify, **kein** FK-Drop).
  - **4 Legacy-Konversions-/Referenz-Pointer** (kein Ownership): `leads.konvertiert_zu_fall_id`, `gutachter_finder_anfragen.konvertiert_zu_fall_id`, `gutschriften.referenz_fall_id`, `whatsapp_inbound_messages.matched_fall_id` → **out of scope**, gehören in die Drop-/Legacy-Phase (CMM-49 §"Legacy-Spalten entfernen").

### on_delete der 37 Ziele (zu spiegeln)
- **CASCADE (20):** fall_read_state, fall_summaries, forderungspositionen, ki_gespraeche, kunde_gutachten_requests, makler_fall_consent, nachrichten*, notification_events*, parteien*, personenschaden_personen, pflichtdokumente, qc_checkliste, regulierungs_klassifizierung, reklamationen, schadenspositionen, sla_tracking, tasks*, termine, zahlungseingaenge, zahlungspositionen
- **SET NULL (10):** admin_termine, ai_usage_log, aircall_calls, calls, email_log, flow_links*, kanzlei_admin_termine, matelso_calls, sv_live_location, webhook_events
- **NO ACTION (7):** abrechnung_positionen, gutachter_abrechnungen, gutachter_abrechnungspositionen, gutachter_mitteilungen, kanzlei_abrechnung_positionen, makler_provisionen, technische_probleme

`*` = kollisions-sensibel (aktive AAR-939/CMM-67-Sessions) → **Batch C**, separat + koordiniert.

---

## Scope

**IN (dieser Plan, DB-only, additiv, reversibel):**
- Task 0: Shared Ableitungs-Funktion `derive_claim_id_from_fall()`.
- Task 1 (Batch A — Finanz + Comms-Logs, 15 Tische): claim_id ADD + Backfill + FK + Index + Trigger.
- Task 2 (Batch B — operative Misc, 17 Tische): dito.
- Task 3 (Batch C — 5 kollisions-sensible Tische): **GATED** auf Koordination mit AAR-939-Sessions.
- Task 4 (6 halb-migrierte): Coverage-Verify + Ableitungs-Trigger als Sicherheitsnetz (kein FK-Drop).

**OUT (explizit nachgelagert, NICHT in diesem Plan):**
- Code-Writer-Migration (claim_id direkt schreiben) — kollidiert mit AAR-939, separat.
- View-frei-machen (`v_claim_full`/`v_claim_listing`/…) — CMM-66/CMM-64-PR3-Workstream.
- Workflow-Trigger-Umzug auf claims (`on_filmcheck_done`, `on_gutachten_eingegangen`, `on_regulierung`, `trg_sa_bestaetigt_termin`) — Phase 5.
- `fall_id`-FK/-Spalte droppen, Sync-Trigger droppen — Cutover-Phase.
- **`DROP TABLE faelle CASCADE`** — Phase 6, **harter Aaron-Gate** (separate Session, Rücksprache Pflicht).

---

## Harte Gates (vor Ausführung)

1. **§7.1 Architektur bestätigt:** Re-Key der 37 Tische **auf `claims.id`** (= CMM-44 verbindlicher Endzustand „DROP TABLE faelle CASCADE, keine faelle-bleibt-operativ-Variante"). Das Strecke-Stand-Doc markierte das als offene Aaron-Entscheidung → **vor Batch A explizit bestätigen lassen.**
2. **Kollision:** Batch C (parteien/nachrichten/tasks/notification_events/flow_links) erst nach Abstimmung mit den AAR-939-Sessions.
3. **Regel 2 (jede Migration):** `apply_migration` → `list_migrations` (recorded Version `<V>` ablesen) → File committen als `supabase/migrations/<V>_<name>.sql` (Name == recorded Version, sonst Twin-Drift) → `execute_sql` READ-Verify.
4. **Post-Migration Portal-Smoke** (Kunde/SV/Admin) mit Screenshot (AGENTS.md `feedback_post_drop_smoke`).

---

## File Structure

- Create: `supabase/migrations/<V0>_cmm49_derive_claim_id_fn.sql` — Ableitungs-Funktion (Task 0).
- Create: `supabase/migrations/<V1>_cmm49_rekey_batch_a_finance_comms.sql` — Batch A (Task 1).
- Create: `supabase/migrations/<V2>_cmm49_rekey_batch_b_operational.sql` — Batch B (Task 2).
- Create: `supabase/migrations/<V3>_cmm49_rekey_batch_c_collision.sql` — Batch C (Task 3, gated).
- Create: `supabase/migrations/<V4>_cmm49_halfmigrated_trigger_safety.sql` — halb-migrierte (Task 4).
- Doc: dieses File.

Jede Migration ist **transaktional + idempotent** (`IF NOT EXISTS` / Catalog-Guards) — collision-safe gegen parallele Sessions.

---

## Task 0: Shared Ableitungs-Funktion

**Files:**
- Migration: `<V0>_cmm49_derive_claim_id_fn.sql`

- [ ] **Step 1: Funktion via Plugin anwenden**

`apply_migration({ name: "cmm49_derive_claim_id_fn", query: <SQL> })`:

```sql
CREATE OR REPLACE FUNCTION public.derive_claim_id_from_fall()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- claim_id aus fall_id herleiten: bei INSERT wenn leer, bei UPDATE wenn fall_id sich ändert.
  -- Setzt claim_id NIE auf NULL und überschreibt NIE eine explizit gesetzte claim_id beim INSERT.
  IF NEW.fall_id IS NOT NULL
     AND (NEW.claim_id IS NULL
          OR (TG_OP = 'UPDATE' AND NEW.fall_id IS DISTINCT FROM OLD.fall_id)) THEN
    SELECT f.claim_id INTO NEW.claim_id FROM public.faelle f WHERE f.id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.derive_claim_id_from_fall() IS
  'CMM-49 FK-Re-Key: hält claim_id aus fall_id synchron, bis Code claim_id nativ schreibt. Wird mit fall_id zusammen gedroppt.';
```

- [ ] **Step 2: Recorded Version ablesen + File benennen**

`list_migrations` → Version `<V0>` ablesen. File anlegen: `supabase/migrations/<V0>_cmm49_derive_claim_id_fn.sql` mit obigem SQL.

- [ ] **Step 3: Verify**

`execute_sql`: `SELECT proname FROM pg_proc WHERE proname = 'derive_claim_id_from_fall';`
Expected: 1 Row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<V0>_cmm49_derive_claim_id_fn.sql
git commit -m "feat(CMM-49): claim_id-Ableitungs-Funktion (FK-Re-Key Foundation)"
```

---

## Task 1: Batch A — Finanz + Comms-Logs (15 Tische, kollisionsfrei)

**Tische:** `abrechnung_positionen, forderungspositionen, schadenspositionen, zahlungseingaenge, zahlungspositionen, gutachter_abrechnungen, gutachter_abrechnungspositionen, kanzlei_abrechnung_positionen, makler_provisionen, email_log, calls, aircall_calls, matelso_calls, ai_usage_log, webhook_events`

**Files:** Migration `<V1>_cmm49_rekey_batch_a_finance_comms.sql`

- [ ] **Step 1: Migration via Plugin anwenden**

`apply_migration({ name: "cmm49_rekey_batch_a_finance_comms", query: <SQL> })`. Die `(tisch, on_delete)`-Paare spiegeln das bestehende `fall_id`-Verhalten:

```sql
DO $$
DECLARE
  rec record;
  pairs text[][] := ARRAY[
    ['abrechnung_positionen','NO ACTION'], ['forderungspositionen','CASCADE'],
    ['schadenspositionen','CASCADE'], ['zahlungseingaenge','CASCADE'],
    ['zahlungspositionen','CASCADE'], ['gutachter_abrechnungen','NO ACTION'],
    ['gutachter_abrechnungspositionen','NO ACTION'], ['kanzlei_abrechnung_positionen','NO ACTION'],
    ['makler_provisionen','NO ACTION'], ['email_log','SET NULL'],
    ['calls','SET NULL'], ['aircall_calls','SET NULL'],
    ['matelso_calls','SET NULL'], ['ai_usage_log','SET NULL'],
    ['webhook_events','SET NULL']
  ];
  t text; od text;
BEGIN
  FOR i IN 1 .. array_length(pairs,1) LOOP
    t := pairs[i][1]; od := pairs[i][2];
    -- 1) Spalte additiv
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claim_id uuid', t);
    -- 2) Backfill (nur leere)
    EXECUTE format('UPDATE public.%I x SET claim_id = f.claim_id FROM public.faelle f WHERE f.id = x.fall_id AND x.claim_id IS NULL', t);
    -- 3) Index spiegeln
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (claim_id)', t||'_claim_id_idx', t);
    -- 4) FK auf claims (on_delete gespiegelt), idempotent
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_claim_id_fkey' AND conrelid = ('public.'||t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE %s', t, t||'_claim_id_fkey', od);
    END IF;
    -- 5) Ableitungs-Trigger, idempotent
    EXECUTE format('DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_derive_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.derive_claim_id_from_fall()', t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Recorded Version ablesen + File benennen**

`list_migrations` → `<V1>`. File: `supabase/migrations/<V1>_cmm49_rekey_batch_a_finance_comms.sql`.

- [ ] **Step 3: Backfill-Lücke verifizieren (Expected: 0 in jeder Zeile)**

`execute_sql`:

```sql
SELECT 'abrechnung_positionen' t, count(*) gap FROM abrechnung_positionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'forderungspositionen', count(*) FROM forderungspositionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'schadenspositionen', count(*) FROM schadenspositionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'zahlungseingaenge', count(*) FROM zahlungseingaenge WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'zahlungspositionen', count(*) FROM zahlungspositionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'gutachter_abrechnungen', count(*) FROM gutachter_abrechnungen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'gutachter_abrechnungspositionen', count(*) FROM gutachter_abrechnungspositionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'kanzlei_abrechnung_positionen', count(*) FROM kanzlei_abrechnung_positionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'makler_provisionen', count(*) FROM makler_provisionen WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'email_log', count(*) FROM email_log WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'calls', count(*) FROM calls WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'aircall_calls', count(*) FROM aircall_calls WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'matelso_calls', count(*) FROM matelso_calls WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'ai_usage_log', count(*) FROM ai_usage_log WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'webhook_events', count(*) FROM webhook_events WHERE fall_id IS NOT NULL AND claim_id IS NULL;
```

Expected: alle `gap = 0`.

- [ ] **Step 4: Trigger-Smoke (Ableitung greift)**

`execute_sql` (in einer Transaktion, rollback — keine Daten-Mutation):

```sql
BEGIN;
INSERT INTO email_log (fall_id) VALUES ((SELECT id FROM faelle LIMIT 1)) RETURNING fall_id, claim_id;
ROLLBACK;
```

Expected: zurückgegebene `claim_id` ist NICHT NULL und == `faelle.claim_id` der gewählten Row. (Falls `email_log` NOT-NULL-Spalten ohne Default hat → minimal-Insert anpassen oder anderen Batch-A-Tisch mit nur `fall_id`-Pflicht nehmen.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<V1>_cmm49_rekey_batch_a_finance_comms.sql
git commit -m "feat(CMM-49): FK-Re-Key Batch A (Finanz+Comms, 15 Tische) — claim_id additiv + Ableitungs-Trigger"
```

---

## Task 2: Batch B — Operative Misc (17 Tische, kollisionsfrei)

**Tische:** `admin_termine, kanzlei_admin_termine, sv_live_location, technische_probleme, regulierungs_klassifizierung, qc_checkliste, reklamationen, sla_tracking, fall_read_state, fall_summaries, ki_gespraeche, pflichtdokumente, kunde_gutachten_requests, makler_fall_consent, personenschaden_personen, termine, gutachter_mitteilungen`

**Files:** Migration `<V2>_cmm49_rekey_batch_b_operational.sql`

- [ ] **Step 1: Migration via Plugin anwenden**

`apply_migration({ name: "cmm49_rekey_batch_b_operational", query: <SQL> })` — identisches DO-Block-Muster wie Task 1 Step 1, mit diesen `(tisch, on_delete)`-Paaren:

```sql
DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['admin_termine','SET NULL'], ['kanzlei_admin_termine','SET NULL'],
    ['sv_live_location','SET NULL'], ['technische_probleme','NO ACTION'],
    ['regulierungs_klassifizierung','CASCADE'], ['qc_checkliste','CASCADE'],
    ['reklamationen','CASCADE'], ['sla_tracking','CASCADE'],
    ['fall_read_state','CASCADE'], ['fall_summaries','CASCADE'],
    ['ki_gespraeche','CASCADE'], ['pflichtdokumente','CASCADE'],
    ['kunde_gutachten_requests','CASCADE'], ['makler_fall_consent','CASCADE'],
    ['personenschaden_personen','CASCADE'], ['termine','CASCADE'],
    ['gutachter_mitteilungen','NO ACTION']
  ];
  t text; od text;
BEGIN
  FOR i IN 1 .. array_length(pairs,1) LOOP
    t := pairs[i][1]; od := pairs[i][2];
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claim_id uuid', t);
    EXECUTE format('UPDATE public.%I x SET claim_id = f.claim_id FROM public.faelle f WHERE f.id = x.fall_id AND x.claim_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (claim_id)', t||'_claim_id_idx', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_claim_id_fkey' AND conrelid = ('public.'||t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE %s', t, t||'_claim_id_fkey', od);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_derive_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.derive_claim_id_from_fall()', t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Recorded Version + File** — `list_migrations` → `<V2>`, File `supabase/migrations/<V2>_cmm49_rekey_batch_b_operational.sql`.

- [ ] **Step 3: Backfill-Lücke verifizieren** — gleiche UNION-ALL-Form wie Task 1 Step 3, über die 17 Batch-B-Tische. Expected: alle `gap = 0`.

- [ ] **Step 4: Trigger-Smoke** — Rollback-Insert auf `sv_live_location` (nur `fall_id` Pflicht): `claim_id` muss befüllt zurückkommen.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<V2>_cmm49_rekey_batch_b_operational.sql
git commit -m "feat(CMM-49): FK-Re-Key Batch B (operativ, 17 Tische) — claim_id additiv + Ableitungs-Trigger"
```

---

## Task 3: Batch C — Kollisions-sensible Tische (5, GATED)

**Tische:** `parteien` (CASCADE, CMM-67-Halter-Überlapp), `nachrichten` (CASCADE, Inbox), `tasks` (CASCADE, Lifecycle), `notification_events` (CASCADE, Mitteilungs-Resolver), `flow_links` (SET NULL, Magic-Link/Embed).

**Pre-Condition:** Mit den aktiven AAR-939/CMM-67-Sessions abgestimmt, dass keine parallele Schema-Änderung auf diesen Tischen läuft. **Nicht ohne Abstimmung ausführen.**

**Files:** Migration `<V3>_cmm49_rekey_batch_c_collision.sql`

- [ ] **Step 1: Migration** — identisches DO-Block-Muster, Paare:

```sql
pairs := ARRAY[
  ['parteien','CASCADE'], ['nachrichten','CASCADE'], ['tasks','CASCADE'],
  ['notification_events','CASCADE'], ['flow_links','SET NULL']
];
```

- [ ] **Step 2: Recorded Version + File** — `<V3>`, `supabase/migrations/<V3>_cmm49_rekey_batch_c_collision.sql`.

- [ ] **Step 3: Backfill-Lücke verifizieren** — UNION-ALL über die 5 Tische, Expected `gap = 0`.

- [ ] **Step 4: Trigger-Smoke** — Rollback-Insert auf `tasks` (fall_id) → claim_id befüllt.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<V3>_cmm49_rekey_batch_c_collision.sql
git commit -m "feat(CMM-49): FK-Re-Key Batch C (kollisions-sensibel, 5 Tische) — koordiniert"
```

---

## Task 4: Halb-migrierte 6 — Coverage-Verify + Trigger-Sicherheitsnetz

**Tische:** `auftraege, fall_dokumente, gutachter_termine, kanzlei_faelle, phase_transitions, timeline` (haben `claim_id` bereits; FK auf faelle bleibt vorerst — **kein** Drop hier).

**Files:** Migration `<V4>_cmm49_halfmigrated_trigger_safety.sql`

- [ ] **Step 1: Coverage prüfen (READ, vor Migration)**

`execute_sql`:

```sql
SELECT 'auftraege' t, count(*) gap FROM auftraege WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'fall_dokumente', count(*) FROM fall_dokumente WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'gutachter_termine', count(*) FROM gutachter_termine WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'kanzlei_faelle', count(*) FROM kanzlei_faelle WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'phase_transitions', count(*) FROM phase_transitions WHERE fall_id IS NOT NULL AND claim_id IS NULL
UNION ALL SELECT 'timeline', count(*) FROM timeline WHERE fall_id IS NOT NULL AND claim_id IS NULL;
```

Expected: `gap = 0` (sind angeblich writer-getragen). **Wenn > 0:** der jeweilige Writer ist nicht writer-getragen → in der Migration mit-backfillen.

- [ ] **Step 2: Migration — Backfill (falls Lücke) + Ableitungs-Trigger als Netz**

`apply_migration({ name: "cmm49_halfmigrated_trigger_safety", query: <SQL> })`:

```sql
DO $$
DECLARE
  tables text[] := ARRAY['auftraege','fall_dokumente','gutachter_termine','kanzlei_faelle','phase_transitions','timeline'];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('UPDATE public.%I x SET claim_id = f.claim_id FROM public.faelle f WHERE f.id = x.fall_id AND x.claim_id IS NULL', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_derive_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.derive_claim_id_from_fall()', t);
  END LOOP;
END $$;
```

(Kein ADD COLUMN, kein neuer FK — die existieren schon. Nur Backfill-Lücke schließen + Trigger anhängen, damit `claim_id` auch bei nicht-writer-getragenen Inserts korrekt bleibt.)

- [ ] **Step 3: Recorded Version + File** — `<V4>`, `supabase/migrations/<V4>_cmm49_halfmigrated_trigger_safety.sql`.

- [ ] **Step 4: Re-Verify** — Step-1-Query erneut, Expected `gap = 0` überall.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<V4>_cmm49_halfmigrated_trigger_safety.sql
git commit -m "feat(CMM-49): halb-migrierte 6 — claim_id-Coverage + Ableitungs-Trigger-Netz"
```

---

## Abschluss-Verifikation (nach den ausgeführten Batches)

- [ ] **Gesamt-Coverage:** Re-run der gap-Queries über alle ausgeführten Tische → 0.
- [ ] **FK-Existenz:** `SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='public.claims'::regclass AND conname LIKE '%\_claim\_id\_fkey';` → == Anzahl re-gekeyter Tische.
- [ ] **Portal-Smoke (Pflicht):** app.staging.claimondo.de — Kunde-Fall-Detail, SV-Home, Admin-Fallakte/Kanban. Screenshots im selben Turn auswerten. Erwartung: **keine** Regression (additiv, fall_id unangetastet → nichts darf sich ändern).
- [ ] **PR gegen `staging`** (Regel 1), Audit-Block im Commit/PR-Body (7 Punkte), Memory-Update.

---

## Nachgelagert (NICHT dieser Plan — für Tracking)

1. **Code-Writer-Migration:** Reads/Writes inkrementell von `fall_id` auf `claim_id` umstellen (~59 Sites). Koordiniert mit AAR-939.
2. **View-frei-machen:** `v_claim_full`, `v_claim_listing`, `faelle_kunde_view`, `faelle_sv_view`, `v_claim_phase`, `v_faelle_mit_aktuellem_termin` (CMM-66/CMM-64-PR3).
3. **Workflow-Trigger umziehen:** die 4 AFTER-UPDATE-Benachrichtigungs-Trigger auf claims-Writes neu verankern (Phase 5).
4. **Cutover:** `fall_id`-FK + -Spalte droppen (pro Tisch, nach 0 fall_id-Reads/Writes), Ableitungs-Trigger droppen, Sync-Trigger droppen.
5. **Legacy-Pointer:** `leads.konvertiert_zu_fall_id` & 3 weitere → repoint/drop.
6. **`DROP TABLE faelle CASCADE`** — **harter Aaron-Gate, separate Session.**

---

## Self-Review

- **Spec-Coverage:** CMM-49 = „Phase 5+6". Dieser Plan deckt die *physische Vorstufe* (FK-Re-Key) ab, die CMM-49 als Voraussetzung (`nachdem alle FKs umgehängt sind`) nennt — Phase 5/6 selbst bleiben explizit out-of-scope + Aaron-gated. Alle 47 FKs sind einer Klasse zugeordnet (37 Re-Key / 6 halb / 4 Legacy) — keine Lücke.
- **Placeholder-Scan:** `<V0>..<V4>` sind die vom Plugin recorded Versionen (Regel 2, bewusst zur Laufzeit zu füllen — kein Code-Placeholder). SQL-Blöcke sind vollständig + ausführbar.
- **Typ-Konsistenz:** Trigger-Name überall `trg_derive_claim_id`; FK-Name `<t>_claim_id_fkey`; Index `<t>_claim_id_idx`; Funktion `derive_claim_id_from_fall()` — konsistent über alle Tasks.
- **Idempotenz/Kollision:** Alle DDL mit `IF NOT EXISTS`/Catalog-Guard + `DROP TRIGGER IF EXISTS` → re-runbar, collision-safe gegen parallele Sessions.

---

## Ausführungs-Log (2026-05-31)

Ausgeführt + verifiziert live (`paizkjajbuxxksdoycev`, DDL via Supabase-Plugin):
- **Task 0** `20260531102402_cmm49_derive_claim_id_fn` — Funktion **`SECURITY DEFINER` + `search_path=''`** (Korrektur ggü. Entwurf: sonst blockt die `faelle`-RLS das Lookup für authenticated-Writer → claim_id bliebe NULL). Verifiziert `prosecdef=true`.
- **Batch A** `20260531102525_cmm49_rekey_batch_a_finance_comms` — 15 Tische. Backfill gap=0, Struktur 15/15/15, Runtime-Trigger-Smoke (rolled-back) `MATCH=t`.
- **Batch B** `20260531102850_cmm49_rekey_batch_b_operational` — 17 Tische. gap=0, 17/17/17.
- **Task 4** `20260531103155_cmm49_halfmigrated_trigger_safety` — **5** Tische (`auftraege`/`fall_dokumente`/`kanzlei_faelle`/`phase_transitions`/`timeline`): hatten `claim_id`+FK bereits (gap=0, writer-getragen) → nur Trigger-Netz. Gesamt **37 derive-Trigger** live.

**Zurückgehalten (Kollision mit aktiven AAR-939-Sessions → koordinieren, eigene Migration später):**
- **Batch C** (5): `parteien`, `nachrichten`, `tasks`, `notification_events`, `flow_links`.
- **`gutachter_termine`** (halb-migriert, aber aktiv 939-hot Lead→Termin).

**Nachgelagert:** Code-Writer-Migration auf `claim_id` · `fall_id`-FK/-Spalte-Drop (Cutover-Phase) · Typen-Regen aufgeschoben (kein Consumer referenziert die neuen `claim_id`-Spalten).
