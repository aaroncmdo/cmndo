# Claim-Read-View-Kanonisierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Entity-Sourcing der zwei Claim-Read-Views genau 1× definieren (`v_claim_base`) und `v_claim_full` + `v_faelle_mit_aktuellem_termin` als dünne Layer darauf neu aufsetzen — ohne Änderung der Output-Spalten (0 Consumer-Rewrites).

**Architecture:** Neue Basis-View `v_claim_base` macht alle ~13 Entity-LATERALs einmal (kanonische Namen + kanonische Defaults). Beide öffentlichen Views werden `SELECT … FROM v_claim_base` (vcf: + JSONB-Aggregate; vfmat: + Legacy-Aliase + NULL-Platzhalter). Verifikation per Shadow-View + Äquivalenz-Harness gegen die Live-View, dann atomarer `CREATE OR REPLACE`-Swap.

**Tech Stack:** PostgreSQL Views (Supabase), DDL **ausschließlich** via `mcp__plugin_supabase_supabase__apply_migration`. Verifikation via `execute_sql` (READ). Projekt `paizkjajbuxxksdoycev`.

**Spec:** `docs/superpowers/specs/2026-06-26-claim-read-view-canonicalization-design.md`

## Global Constraints

- **Regel 2:** DDL NUR via `apply_migration` (nie raw `execute_sql`-DDL, nie CLI). Nach jeder Migration: `list_migrations` → getrackte Version `<V>` ablesen → File als `supabase/migrations/<V>_<name>.sql` committen (File == getrackte Version).
- **Shadow-then-swap:** Niemals an der LIVE-View testen. Neue Definition zuerst als Shadow-View (`*_canon_shadow`) anlegen, Harness grün, DANN `CREATE OR REPLACE` der echten View mit derselben Definition, dann Shadow droppen.
- **Output-Invariante:** Jede öffentliche View behält EXAKT ihre heutigen Output-Spalten (Name + Typ + Anzahl). Nur Werte der §5-Felder (Termin-Wahl, geschädigter-Ordering) dürfen sich ändern.
- **Kanonische Defaults:** (a) aktueller Termin = `get_aktueller_gt_termin_id(c.id)`; (b) Party-Ordering = `reihenfolge, created_at` (alle Party-LATERALs).
- **Harness-Gate:** Vor jedem Swap muss der Äquivalenz-Harness (Task 2) über ALLE Rows grün sein, außer den dokumentierten §5-Exempt-Spalten — deren Delta wird gelistet + manuell als „gewollt" abgenommen.
- **Koordination:** CMM-49-Hot-Infra. Vor Task 3/5 (DDL) Marker prüfen (keine aktive Session an vcf/vfmat/Entities); in ruhiges Fenster legen.
- **Reversibilität:** Alte View-Defs sind in git (`pg_get_viewdef` Snapshots in Task 1) — Rückfall = alte Def re-applien.

---

### Task 1: Baseline-Snapshot + Koordinations-Gate + Termin-Funktion klären

**Files:**
- Create: `docs/superpowers/plans/_artifacts/view-canon-baseline.sql` (Snapshot der 2 Live-Defs, für Reversibilität + Mapping-Ableitung)

**Interfaces:**
- Produces: `view-canon-baseline.sql` (die 2 alten DDLs verbatim), Verständnis von `get_aktueller_gt_termin_id`.

- [ ] **Step 1: Live-View-Defs snapshotten** (Reversal-Referenz + Mapping-Quelle)

Run (execute_sql, READ):
```sql
select 'v_claim_full' as v, pg_get_viewdef('v_claim_full'::regclass, true) as def
union all
select 'v_faelle_mit_aktuellem_termin', pg_get_viewdef('v_faelle_mit_aktuellem_termin'::regclass, true);
```
Beide Defs in `view-canon-baseline.sql` speichern (Header-Kommentar: „Snapshot vor Kanonisierung — Reversal-Referenz").

- [ ] **Step 2: `get_aktueller_gt_termin_id` lesen + fachlich bestätigen**

Run:
```sql
select pg_get_functiondef('get_aktueller_gt_termin_id'::regproc);
```
Expected: eine Funktion, die pro `claim_id` die EINE „aktive" `gutachter_termine.id` liefert (NULL wenn keiner). Bestätigen, dass das die gewünschte „aktueller Termin"-Definition ist (Decision a). Falls die Logik überrascht (z.B. nur 'bestaetigt'): hier STOPPEN und mit Aaron klären, bevor weitergebaut wird.

- [ ] **Step 3: Koordinations-Gate**

Marker unter `memory/` prüfen: läuft eine Session an `v_claim_full`/`v_faelle_mit_aktuellem_termin`/CMM-49-Entities? Falls ja → in dieser Session keinen Swap (Task 3/5), nur die Shadow-Bau-Arbeit (read-only) machen; Swap ins ruhige Fenster verschieben + im Marker ankündigen.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/_artifacts/view-canon-baseline.sql
git commit -m "docs(view-canon): baseline snapshot der 2 Live-View-Defs + termin-fn check"
```

---

### Task 2: Äquivalenz-Harness (das „Test"-Werkzeug)

**Files:**
- Create: `docs/superpowers/plans/_artifacts/view-canon-harness.sql` (wiederverwendbare Diff-Queries)

**Interfaces:**
- Produces: 3 parametrisierbare Harness-Queries (Shape-Diff, Row-Diff- exempt-aware, Spalten-Drilldown). Konsumiert von Task 3 + 5.

- [ ] **Step 1: Shape-Diff-Query schreiben** (Spalten-Menge alt == neu)

```sql
-- ersetze <OLD>/<NEW> durch die View-Namen. Erwartung: 0 Rows.
with a as (select column_name, data_type from information_schema.columns where table_name='<OLD>'),
     b as (select column_name, data_type from information_schema.columns where table_name='<NEW>')
select 'only_old' src, column_name, data_type from (select * from a except select * from b) x
union all
select 'only_new', column_name, data_type from (select * from b except select * from a) y;
```

- [ ] **Step 2: Row-Äquivalenz-Query schreiben (exempt-aware)** — Kern-Gate

```sql
-- to_jsonb(row) minus Exempt-Keys vergleichen. Erwartung: 0 Rows (außer §5-Delta).
-- EXEMPT_VCF  = ['besichtigungsort_adresse','besichtigungsort_lat','besichtigungsort_lng',
--                'besichtigungsort_notiz','besichtigungsort_place_id','no_show_gemeldet_am',
--                're_termin_token','re_termin_token_eingelaufen_am','re_termin_eskalation_an_kb_am']
--                (Decision a: termin-abgeleitete Felder)
-- EXEMPT_VFMAT= ['kunde_vorname','kunde_nachname','kunde_telefon','kunde_email',
--                'kunde_strasse','kunde_plz','kunde_stadt','kunde_adresse','ist_fahrzeughalter']
--                (Decision b: geschädigter-Party-Ordering) — final beim Bau gegen die echte
--                Spaltenliste verifizieren.
select o.id
from <OLD> o join <NEW> n on n.id = o.id
where (to_jsonb(o.*) - ARRAY[<EXEMPT>]) is distinct from (to_jsonb(n.*) - ARRAY[<EXEMPT>]);
```

- [ ] **Step 3: Spalten-Drilldown-Query schreiben** (welche Spalte je Claim differiert)

```sql
-- zeigt für die differierenden Rows EXAKT welche Keys abweichen (auch die exempt — zum Review).
select o.id, k.key, k.old_val, k.new_val
from <OLD> o join <NEW> n on n.id = o.id
cross join lateral (
  select key, oj.value as old_val, nj.value as new_val
  from jsonb_each(to_jsonb(o.*)) oj join jsonb_each(to_jsonb(n.*)) nj using (key)
  where oj.value is distinct from nj.value
) k
order by o.id, k.key;
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/_artifacts/view-canon-harness.sql
git commit -m "docs(view-canon): equivalence harness (shape + exempt-aware row-diff + drilldown)"
```

---

### Task 3: `v_claim_base` bauen + `v_claim_full` als Layer (Phase 1)

**Files:**
- Migration: `supabase/migrations/<V1>_create_v_claim_base.sql`
- Migration: `supabase/migrations/<V2>_v_claim_full_on_base.sql`

**Interfaces:**
- Consumes: baseline-Defs (Task 1), Harness (Task 2).
- Produces: `v_claim_base` (kanonische flache Spalten), `v_claim_full` neu (= base-Layer + Aggregate).

**`v_claim_base` FROM-Clause (kanonischer Merge beider Views — verbatim zu nutzen):**
```sql
FROM claims c
  LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id
  LEFT JOIN vehicles veh           ON veh.id = c.vehicle_id
  LEFT JOIN gutachten g            ON g.claim_id = c.id
  LEFT JOIN kanzlei_faelle kf      ON kf.claim_id = c.id
  LEFT JOIN v_claim_phase vcp      ON vcp.claim_id = c.id
  LEFT JOIN versicherungen gv      ON gv.id = c.gegner_versicherung_id
  LEFT JOIN claim_recency cr       ON cr.claim_id = c.id
  -- geschädigter-Party (Decision b: reihenfolge, created_at)
  LEFT JOIN LATERAL (
    SELECT cp.ist_halter, p.vorname, p.nachname, p.email,
           COALESCE(p.telefon, p.mobil) AS telefon,
           p.adresse_strasse, p.adresse_plz, p.adresse_ort, kfi.name AS firma_name
    FROM claim_parties cp
      LEFT JOIN personen p ON p.id = cp.person_id
      LEFT JOIN firmen kfi ON kfi.id = cp.firma_id
    WHERE cp.claim_id = c.id AND cp.rolle = 'geschaedigter'
    ORDER BY cp.reihenfolge, cp.created_at LIMIT 1
  ) geschaedigter_p ON true
  -- halter-Party (reihenfolge, created_at)
  LEFT JOIN LATERAL (
    SELECT pe.vorname, pe.nachname, pe.adresse_strasse, pe.adresse_plz, pe.adresse_ort,
           pe.telefon, pe.email, pe.geburtsdatum
    FROM claim_parties hp LEFT JOIN personen pe ON pe.id = hp.person_id
    WHERE hp.claim_id = c.id AND hp.ist_halter = true
    ORDER BY hp.reihenfolge, hp.created_at LIMIT 1
  ) halter_p ON true
  -- verursacher-Party (reihenfolge, created_at)
  LEFT JOIN LATERAL (
    SELECT vp.firma_id, vp.person_id, vp.vehicle_id, vp.kennzeichen,
           vp.versicherungsnummer, vp.versicherungs_aktenzeichen,
           vp.versicherung_klartext, vp.fahrzeugtyp_klartext
    FROM claim_parties vp
    WHERE vp.claim_id = c.id AND vp.rolle = 'verursacher'
    ORDER BY vp.reihenfolge, vp.created_at LIMIT 1
  ) verursacher_p ON true
  LEFT JOIN firmen gf    ON gf.id = verursacher_p.firma_id
  LEFT JOIN personen gpp ON gpp.id = verursacher_p.person_id
  LEFT JOIN vehicles gveh ON gveh.id = verursacher_p.vehicle_id
  -- Vorschäden
  LEFT JOIN LATERAL (
    SELECT NULLIF(count(*),0)::int AS anzahl, max(vv0.schaden_datum) AS letzter_datum
    FROM vehicle_vorschaeden vv0 WHERE vv0.vehicle_id = c.vehicle_id
  ) vorschaeden ON true
  -- aktueller Termin (Decision a: get_aktueller_gt_termin_id) — volle gt-Zeile
  LEFT JOIN LATERAL (
    SELECT gt.* FROM gutachter_termine gt WHERE gt.id = get_aktueller_gt_termin_id(c.id)
  ) t ON true
  -- aktueller Auftrag (neuester per reihenfolge) — relevante Spalten
  LEFT JOIN LATERAL (
    SELECT a.storniert_am, a.storno_grund, a.storno_durch_user_id,
           a.filmcheck_ok, a.filmcheck_am, a.filmcheck_notizen,
           a.sv_briefing_text, a.sv_briefing_generated_at, a.sv_briefing_model,
           a.sv_briefing_version, a.sv_briefing_struktur, a.sv_notizen_vor_ort,
           a.technische_stellungnahme_status, a.technische_stellungnahme_notiz_sv,
           a.technische_stellungnahme_beauftragt_am, a.technische_stellungnahme_hochgeladen_am,
           a.technische_stellungnahme_freigabe_am
    FROM auftraege a WHERE a.claim_id = c.id ORDER BY a.reihenfolge DESC LIMIT 1
  ) cur_auftrag ON true
```

**`v_claim_base` SELECT:** Spalten = Vereinigung aller flachen (nicht-JSONB, nicht-NULL-Platzhalter) Output-Spalten beider Views, unter kanonischem Naming (claim-native). Quelle jeder Spalte 1:1 aus den baseline-Defs (Task 1) ableiten. `c.id AS claim_id`, `fcb.fall_id`, `t.* `-Felder als `aktueller_termin_*` + die heutigen `sv_termin`/`gutachter_termin_*`-Ableitungen, `veh.*`-Mappings, party-Felder etc. **Aggregate + NULL-Platzhalter NICHT** in die Basis.

- [ ] **Step 1: `v_claim_base` anlegen (apply_migration)** — `CREATE VIEW v_claim_base AS SELECT <kanonische Spalten> <FROM-Clause oben>`.
- [ ] **Step 2: Base verifiziert** (execute_sql): `SELECT count(*) FROM v_claim_base` == `SELECT count(*) FROM claims` (89); Spot-Check 3 Claims gegen `v_claim_full` (kennzeichen, kunde_nachname, gegner_name).
- [ ] **Step 3: Shadow `v_claim_full_canon_shadow` anlegen** = `SELECT <vcf-Output-Spalten aus base + Aggregate> FROM v_claim_base b`. (apply_migration; Aggregate-Subqueries 1:1 aus baseline-vcf-Def kopiert, nur `c`→`b`/`claim_id`.)
- [ ] **Step 4: Harness gegen Live** (execute_sql, Task-2-Queries mit OLD=`v_claim_full`, NEW=`v_claim_full_canon_shadow`, EXEMPT=EXEMPT_VCF): Shape-Diff = 0; Row-Diff = 0 außer EXEMPT_VCF. Drilldown der EXEMPT-Deltas listen + als „gewollt (Decision a)" notieren. Bei NICHT-exempt-Diff: Shadow-Def fixen + re-applien, bis grün.
- [ ] **Step 5: Swap** (apply_migration): `CREATE OR REPLACE VIEW v_claim_full AS <verifizierte Shadow-Def>`; danach `DROP VIEW v_claim_full_canon_shadow`.
- [ ] **Step 6: Re-Harness** gegen die JETZT-Live `v_claim_full` ist trivially grün (identische Def) — Sanity: `SELECT count(*)` unverändert.
- [ ] **Step 7: Migration-Files benennen + committen** — `list_migrations` → `<V1>`/`<V2>` ablesen → Files exakt so benennen → commit.

---

### Task 4: tsc/build nach Phase 1

- [ ] **Step 1:** `npx tsc --noEmit` — 0 Fehler (v_claim_full-Consumer-Typen unverändert, da Spalten gleich).
- [ ] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` — grün (Server-Component-Reader von v_claim_full). Bei `require-in-the-middle`-Race (geteilter Store): retry / CI als Gate.
- [ ] **Step 3:** Falls `database.types.ts` v_claim_full-Spalten trägt: `generate_typescript_types` → diff sollte leer/neutral sein. Commit falls nötig.

---

### Task 5: `v_faelle_mit_aktuellem_termin` als Layer (Phase 2)

**Files:**
- Migration: `supabase/migrations/<V3>_vfmat_on_base.sql`

**Interfaces:**
- Consumes: `v_claim_base` (Task 3), Harness (Task 2).
- Produces: `vfmat` neu (= base-Layer + Legacy-Aliase + NULL-Platzhalter + operative Passthrough).

- [ ] **Step 1: Koordinations-Gate re-check** (Marker; ruhiges Fenster).
- [ ] **Step 2: Shadow `vfmat_canon_shadow` anlegen** = `SELECT <vfmat-Output-Spalten: base-Spalten + Legacy-Aliase (schadens_*/unfall* per §4-Mapping) + NULL::type-Platzhalter (1:1 aus baseline-vfmat: ust_id/bank_name/dispatch_id/organisation_id/zahlung_*/auszahlung_kunde_*/gegner_versicherung_anfrage_datum/source_channel/source_domain/firma_name/gutachten_stundensatz/zahlung_erwartet_am/zahlung_betrag) + operative Passthrough> FROM v_claim_base b`. `id = b.fall_id`.
- [ ] **Step 3: Harness gegen Live** (OLD=`v_faelle_mit_aktuellem_termin`, NEW=`vfmat_canon_shadow`, EXEMPT=EXEMPT_VFMAT): Shape-Diff=0; Row-Diff=0 außer EXEMPT_VFMAT. Drilldown listen + „gewollt (Decision b)". Bei NICHT-exempt-Diff: fixen + re-applien bis grün. (Erwartung: viele Aliase → sorgfältig; der Harness fängt jede vergessene Spalte.)
- [ ] **Step 4: EXPLAIN-Gate** (execute_sql): `EXPLAIN ANALYZE SELECT * FROM vfmat_canon_shadow WHERE id = '<claim>'` vs. dieselbe auf der Live-vfmat — keine grobe Plan-Regression (gleiche LATERAL-Anzahl). Bei Regression: Layer-Select verschlanken / Base evaluieren.
- [ ] **Step 5: Swap** (apply_migration): `CREATE OR REPLACE VIEW v_faelle_mit_aktuellem_termin AS <verifizierte Shadow-Def>`; `DROP VIEW vfmat_canon_shadow`.
- [ ] **Step 6: tsc + build** (vfmat hat viele Consumer — Admin/SV/AI/Finance). `tsc --noEmit` 0; `npm run build` grün.
- [ ] **Step 7: Migration-File benennen + committen** (`list_migrations` → `<V3>`).

---

### Task 6: Abschluss

- [ ] **Step 1:** Drift-Smoke: für 3 Claims `v_claim_full` vs `v_faelle_mit_aktuellem_termin` für die geteilten Konzepte (kunde_nachname, gegner_name, aktueller Termin) — jetzt IDENTISCH (vorher konnten sie driften). Beweist die Kanonisierung.
- [ ] **Step 2:** Marker `COORDINATION-claims-onboarding-canon-audit` updaten (View-Konvergenz erledigt) + MEMORY-Index.
- [ ] **Step 3:** PR gegen `staging` (alle Migration-Files + Artefakte), Body mit Harness-Ergebnis + §5-Delta-Review-Tabelle. finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** §3 Architektur → Task 3 (base+vcf) + Task 5 (vfmat). §4 Naming → Task 5 Step 2 (Aliase). §5 Decisions → FROM-Clause (Task 3) + Harness-Exempts (Task 2/3/5). §6 Performance → Task 5 Step 4 (EXPLAIN). §7 Verifikation → Task 2 + Harness-Gates. §8 Rollout/Phasen → Task 3 (Phase 1) + Task 5 (Phase 2), je apply_migration + benannte Files. §9 Koordination → Task 1 Step 3 + Task 5 Step 1. Alle Spec-Abschnitte abgedeckt.

**Placeholder scan:** Die Base-SELECT-Spaltenliste + die Layer-SELECTs sind als „1:1 aus den baseline-Defs ableiten" spezifiziert statt verbatim ausgeschrieben — bewusst: die exakte Quelle JEDER Spalte steht in den Task-1-Snapshots (die echten DDLs), und der Harness (Task 2) ist das harte Gate, das jede Abweichung pro Spalte fängt. Das ist kein „TODO", sondern der einzige verlässliche Weg für eine ~500-Spalten-View-Migration (blind-handgeschriebenes SQL wäre fehleranfälliger als derive+harness). FROM-Clause + Harness + Exempts + Phasing sind vollständig/verbatim.

**Type consistency:** View-Output-Spalten bleiben namensgleich → Consumer-Typen unverändert (Task 4/5 tsc-Gate bestätigt).
