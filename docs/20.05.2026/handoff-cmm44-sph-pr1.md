# Handoff — CMM-44 SP-H (Auftrag-Lifecycle) · PR1-Zwischenstand

**Datum:** 2026-05-20
**Sub-Projekt:** CMM-44 SP-H — 18 Auftrag-Lifecycle-Spalten `faelle` → `auftraege`
**Status:** PR1 fertig + offen (#1520), Task 3-7 gated auf PR1-staging-Merge

---

## Was SP-H ist

CMM-44 = Claim-as-SSoT-Vollmigration, die `faelle` in **Phase 6 komplett droppt**. Spalten wandern vorher in `claims` (SSoT) + Sub-Tables. SP-H ist das Sub-Projekt für die **18 Auftrag-Lifecycle-Spalten**, die semantisch zum *Auftrag* (nicht zum Claim global) gehören → Ziel-Tabelle `auftraege` (1:N pro Claim).

**4 Cluster, 18 Spalten, 1:1 Namens-Mapping (kein Rename):**

| Cluster | Spalten |
|---|---|
| Filmcheck (3) | `filmcheck_ok`, `filmcheck_am`, `filmcheck_notizen` |
| Storno (3) | `storniert_am`, `storno_grund`, `storno_durch_user_id` |
| Besichtigung (1) | `besichtigung_gestartet_am` |
| SV-Briefing (6) | `sv_briefing_text`, `sv_briefing_generated_at`, `sv_briefing_model`, `sv_briefing_version`, `sv_briefing_struktur`, `sv_notizen_vor_ort` |
| TechStellungnahme (5) | `technische_stellungnahme_status`, `technische_stellungnahme_notiz_sv`, `technische_stellungnahme_beauftragt_am`, `technische_stellungnahme_hochgeladen_am`, `technische_stellungnahme_freigabe_am` |

**Architektur: rein additiv.** Kein per-Spalten-`DROP COLUMN`. `faelle` behält die Spalten bis Phase 6, der Drop passiert dort gesammelt. Gleiches Muster wie SP-B / SP-G.

**Spec/Plan:**
- `docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md`
- `docs/superpowers/plans/2026-05-20-cmm44-sph-auftrag-lc.md` (7 Tasks, Subagent-Driven mit 2-Stufen-Review)

---

## Erledigt (Task 0-2)

### Task 0 — Drift-Recheck
`scripts/cmm44-sph-measure.sql` gefahren: alle 18 Spalten fehlten auf `auftraege`, kein Parallel-Session-Drift. `faelle.rows=42`, `auftraege.rows=1`, `distinct_claims=1` — pre-launch ein einziger Auftrag.

### Task 1 — PR1-Migration + Audits geschrieben
- View-Audit (`scripts/cmm44-sph-views-audit.sql`): **22 Treffer in 3 Views**
- Trigger-Audit auf `auftraege`: 3 Trigger, **kein Side-Effect** (kein pg_notify/net.http) → kein DISABLE/ENABLE-Wrapper
- Function-Sweep (Spec §6, `pg_proc.prosrc`): `rows:[]` — keine standalone-Function referenziert SP-H-Spalten
- Migration `20260520214419_cmm44_sph_add_auftraege_columns.sql` geschrieben + Dry-Run grün
- Befunde dokumentiert in `docs/20.05.2026/cmm44-sph-views-audit.md`
- 2-Stufen-Review: Spec APPROVED, Quality APPROVED (+ 2 NIT-Fixes)

### Task 2 — PR1 appliziert + Push
- Migration via `db query --linked` appliziert + `migration repair --status applied 20260520214419`
- Verify: `sph_neu_auf_auftraege=18`, Backfill der einzigen auftraege-Row gegen faelle-Werte abgeglichen
- Types regeneriert (PowerShell-Pfad, kein stderr-Bleed), 3 Sample-Spalten in auftraege-Row/Insert/Update-Type bestätigt
- Build grün (225/225 pages, exit 0)
- **PR #1520** offen `--base staging`, Branch `kitta/cmm-44-sph-pr1-add-columns` @ `c3612db0`, MERGEABLE

---

## Was PR1 enthält (technisch)

1. **Block 1 — 18× ADD COLUMN** auf `auftraege`, Typen/Defaults 1:1 von `faelle` gespiegelt
2. **Block 2 — UPDATE-Backfill** (Option A): nur existierende auftraege-Rows, `UPDATE auftraege a … FROM faelle f WHERE a.claim_id = f.claim_id`. Keine neuen Aufträge erzeugt.
3. **Block 3 — 3 View-Repoints** via `CREATE OR REPLACE VIEW` mit `LEFT JOIN LATERAL (… ORDER BY reihenfolge DESC LIMIT 1)` auf den aktuellen Auftrag:
   - `faelle_sv_view` (4 TS-Spalten)
   - `v_claim_full` (storniert_am)
   - `v_faelle_mit_aktuellem_termin` (17 Spalten)

---

## Wichtige Befunde / Default-Korrekturen vs. Plan

Live-Messung korrigierte 3 Plan-Annahmen — stehen vollständig in Migration-Header + Audit-Doc:

| Spalte | Plan-Annahme | Live-Wahrheit | Konsequenz |
|---|---|---|---|
| `sv_briefing_version` | DEFAULT 1 | **DEFAULT 0**, NOT NULL | `COALESCE(f.sv_briefing_version, 0)` im Backfill |
| `technische_stellungnahme_status` | DEFAULT `'nicht_erforderlich'` | **DEFAULT `'nicht-angefordert'`** (Bindestrich) | korrigiert; Bindestrich-Convention konsistent mit State-Machine |
| `filmcheck_ok` | NOT NULL | **nullable** in faelle | auf auftraege ebenfalls nullable DEFAULT false |

**besichtigung_gestartet_am Sonderfall:** In `v_faelle_mit_aktuellem_termin` kommt der Wert aus `gutachter_termine.besichtigung_gestartet_am` (Termin-Alias `t.*`), NICHT aus `faelle`. Deshalb 17 statt 18 View-Treffer; die Spalte wird in Block 3 nicht repointet (View liest weiter aus dem Termin). **Achtung für Task 3:** Code-Stellen die direkt aus `faelle.besichtigung_gestartet_am` lesen haben KEINE View-E-Abdeckung — der Reader-Sweep muss sie explizit erfassen.

---

## Offen (Task 3-7) + Gates

| Task | Inhalt | Gate |
|---|---|---|
| **3** | PR2 Call-Site-Inventur (`scripts/cmm44-sph-grep.mjs`, paren-balanced) + `docs/20.05.2026/cmm44-sph-inventory.md` | **PR1 (#1520) auf staging gemergt** (Reader-Sweep braucht regen. Types) |
| **4** | PR2 Reader/Writer-Sweep (Pattern A/B/C, 1:N via `.order('reihenfolge desc').limit(1)`, Array-Normalisierung) + Build + Push | folgt auf Task 3 |
| **5** | PR2 Portal-Smoke (Admin/SV/Public/Dispatch/Kunde) | **PR2 auf staging gemergt** |
| **6** | PR3 idempotenter COALESCE-Catch-up-Backfill | **PR2 auf main released** (Squash-Inhaltscheck) |
| **7** | Abschluss: Phase-1-Mapping + Handoff + Memory | folgt auf Task 6 |

---

## Wiederaufnahme-Anleitung

1. **PR-Merge-Status prüfen:** `gh pr view 1520 --json state,baseRefName` — wenn `MERGED`, Gate offen für Task 3.
2. **Drift-Recheck (Pflicht, Memory `feedback_information_schema_check`):**
   ```bash
   npx supabase db query --linked --file scripts/cmm44-sph-measure.sql 2>&1 | grep -E '"zeile"' | sed 's/^ *"zeile": "//; s/",\?$//'
   ```
   Erwartung jetzt: 18 Spalten **mit** `✓ a.udt=…` (nach Apply existieren sie auf auftraege).
3. **Task 3 starten:** Branch `kitta/cmm-44-sph-pr2-sweep` frisch von `origin/staging`, dann Plan §Task 3 folgen.
4. **Subagent-Driven fortsetzen:** Implementer → Spec-Review → Quality-Review pro Task. PR erst nach beiden Reviews öffnen (Memory `feedback_kein_auto_merge` + `feedback_draft_pr_nicht_release_sicher`). Merge macht Aaron selbst.

---

## Lessons aus PR1

- **Live-Messung schlägt Plan-Annahme:** 3 von 18 Default-Annahmen waren falsch. `information_schema`-Messung in Task 1 Step 4 fängt das — niemals Defaults aus dem Plan ins SQL übernehmen ohne Live-Check.
- **View-Audit per information_schema findet nur direkt-definierte View-Spalten.** Werte die in einer View aus einem JOIN-Alias (hier `gutachter_termine`) kommen, tauchen nicht als faelle-Treffer auf → separat im Code-Sweep beachten.
- **1:N-Backfill via `WHERE a.claim_id = f.claim_id`** schreibt in ALLE Aufträge desselben Claims. Pre-launch unkritisch (1 Row), aber bei N>1 künftig anzupassen (dann „aktueller Auftrag"-Logik im Backfill).
- **LEFT JOIN LATERAL (nicht JOIN)** im View-Repoint — sonst fallen Claims ohne Auftrag aus der View.

---

## Andere offene CMM-44-PRs (Tracking)

- **SP-G PR1 #1518** + **SP-G PR2 #1519** — Gutachten-Sub-Table, offen
- **SP-G Task 6** — PR3 Catch-up, gated auf SP-G PR2 in main
- **SP-H PR1 #1520** — dieser Stand

Memory-Pointer: `project_cmm44_sph_status.md`.
