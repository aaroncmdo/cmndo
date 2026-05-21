# CMM-44 SP-H — Auftrag-Lifecycle (18 `faelle`-Spalten → `auftraege`)

**Datum:** 2026-05-20 · **Status:** Design — abgestimmt
**Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Dekomposition:** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (Sub-Projekt SP-H)
**Vorgänger:** SP-G (`docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md`) — Sub-Table-Pattern
**Branch:** `kitta/cmm-44-sph` (Worktree `.claude/worktrees/cmm-44-spb`)
**Live-Messung:** `scripts/cmm44-sph-measure.sql` (Prod-DB, 2026-05-20)

---

## 1 · Ziel & Scope

SP-H bringt die **18 Auftrag-Lifecycle-Spalten** aus `faelle` auf die `auftraege`-Sub-Table und stellt alle Reader/Writer um. Phase-1-Verdikt MOVE → `auftraege` für alle 18.

**Strategie-Konsistenz mit SP-B/G:** SP-H ist **rein additiv** — kein per-Spalten-`DROP COLUMN faelle.*`. Die 18 Spalten bleiben in `faelle` stehen und sterben gesammelt mit `DROP TABLE faelle CASCADE` in Phase 6.

**Schlüssel-Unterschied zu SP-G:** SP-H ist **1:N pro Claim** (mehrere Aufträge möglich: Erstgutachten, Nachgutachten, Storno-Ersatz — diskriminiert via `auftraege.typ` + `auftraege.reihenfolge`). Kein UNIQUE-Constraint auf `claim_id`. Das ändert sowohl Backfill-Strategie als auch Reader-Pattern gegenüber SP-G.

### Die 18 Spalten (4 Cluster)

Live gemessen 2026-05-20 (`scripts/cmm44-sph-measure.sql`). `auftraege` hat **17 Spalten, 1 Row, 1 distinct claim_id** — pre-launch hat genau 1 Claim einen Auftrag, die anderen 41 nicht. Spaltennamen 1:1 (kein Rename) — alle 18 fehlen auf `auftraege` und müssen per `ADD COLUMN` angelegt werden.

#### Cluster 1 — Filmcheck (3 Spalten)

| `faelle.<col>` | Typ | Cov |
|---|---|--:|
| `filmcheck_ok` | bool | 0/42 (alle Default `false`) |
| `filmcheck_am` | timestamptz | 0/42 |
| `filmcheck_notizen` | text | 0/42 |

QC-Schritt vor Auftrag-Freigabe. Pre-launch nicht live.

#### Cluster 2 — Storno (3 Spalten)

| `faelle.<col>` | Typ | Cov |
|---|---|--:|
| `storniert_am` | timestamptz | 0/42 |
| `storno_grund` | text | 0/42 |
| `storno_durch_user_id` | uuid | 0/42 |

Auftrags-Storno (kein Lebenslauf erfolgt). 0-cov pre-launch.

#### Cluster 3 — Besichtigung-Start (1 Spalte)

| `faelle.<col>` | Typ | Cov |
|---|---|--:|
| `besichtigung_gestartet_am` | timestamptz | 1/42 |

Markiert, wann der SV beim Termin angefangen hat.

#### Cluster 4 — SV-Briefing (6 Spalten)

| `faelle.<col>` | Typ | Cov |
|---|---|--:|
| `sv_briefing_text` | text | 6/42 |
| `sv_briefing_generated_at` | timestamptz | 6/42 |
| `sv_briefing_model` | text | 6/42 |
| `sv_briefing_version` | int4 | 42/42 (Default ≠ 0) |
| `sv_briefing_struktur` | jsonb | 0/42 |
| `sv_notizen_vor_ort` | text | 0/42 |

AI-generiertes Briefing pro Auftrag + Vor-Ort-Notizen des SV. Schon 6 Test-Briefings vorhanden, aber kein einzelnes davon auf `auftraege` — alle hängen an `faelle.id`.

#### Cluster 5 — Technische Stellungnahme (5 Spalten)

| `faelle.<col>` | Typ | Cov |
|---|---|--:|
| `technische_stellungnahme_status` | text | 42/42 (Default `nicht_erforderlich`) |
| `technische_stellungnahme_notiz_sv` | text | 0/42 |
| `technische_stellungnahme_beauftragt_am` | timestamptz | 0/42 |
| `technische_stellungnahme_hochgeladen_am` | timestamptz | 0/42 |
| `technische_stellungnahme_freigabe_am` | timestamptz | 0/42 |

TS-Workflow (claims-globaler Status, der vom SV bearbeitet wird).

### Nicht in Scope

- **Per-Spalten-`DROP COLUMN faelle.*`** — bewusst nicht, faelle-Drop in Phase 6 / SP-L.
- **SV-Auszahlungs-Spalten** (`auszahlung_gutachter_*`, `sv_nachzahlung_netto`) — gehören semantisch zu SP-J3, nicht SP-H. Bleibt bei SP-J (oder dort separat geklärt).
- **`auftraege` 1:N-Architektur-Refactor** — SP-H nutzt das bestehende 1:N-Modell pre-launch wie vorgefunden, keine UNIQUE-Constraint-Änderung.

## 2 · Ausgangslage (Live-DB, 2026-05-20)

Gemessen mit `scripts/cmm44-sph-measure.sql`:

- `faelle` = 42 Rows, `auftraege` = 17 Spalten, **1 Row, 1 distinct claim_id**.
- **Alle 18 Spalten fehlen auf `auftraege`** — PR1 fügt alle per `ADD COLUMN` hinzu.
- **`auftraege.claim_id` ist NOT NULL**, ebenso `fall_id NOT NULL`, `sv_id NOT NULL`, `typ NOT NULL`, `reihenfolge NOT NULL int4`. Diese Constraints sind beim Backfill keine Bremse, weil wir keine neuen Rows einfügen (Option A).
- **Kein UNIQUE-Constraint auf `claim_id`** — 1:N pro Claim erlaubt. Pre-launch hat aber nur 1 Auftrag pro Claim (1 Row total).
- **Bestehende `auftraege`-Trigger:** zum Zeitpunkt der Messung nicht inspiziert — PR1 macht das vor Apply (analog SP-G `trg_gutachten_benachrichtigung`-Audit).

## 3 · Architektur

Drei Aaron-Entscheidungen aus dem Brainstorm (2026-05-20):
1. **Backfill = Option A (UPDATE-only):** Nur existierende `auftraege`-Rows mit `faelle`-Werten füllen. Die 41 claims ohne Auftrag bleiben ohne — Reader müssen null tolerieren.
2. **Reader-Pattern = „aktueller Auftrag" via `.order('reihenfolge', { ascending: false }).limit(1)`:** PostgREST liefert ein Array mit ≤1 Element, `auftraege[0]?.<col>` ist der Wert. Klare Semantik: der jeweils letzte (= aktuelle) Auftrag pro Claim hält die SP-H-Werte.
3. **Architektur additiv (kein per-Spalten-DROP, analog SP-B/G).**

### PR-Struktur (3 PRs — analog SP-B/G)

#### PR1 — Schema + Backfill + View-Repoint

Eine CLI-Migration (`npx supabase migration new cmm44_sph_add_auftraege_columns`), `BEGIN/COMMIT`:

1. **18× `ALTER TABLE public.auftraege ADD COLUMN`** — Typ + Default + NOT-NULL exakt von `faelle` gespiegelt. Defaults (z.B. `technische_stellungnahme_status` `'nicht_erforderlich'`, `sv_briefing_version` `1`, `filmcheck_ok` `false`) übernehmen, damit Bestands-Aufträge konsistent gefüllt sind.
2. **Backfill — UPDATE der existierenden `auftraege`-Rows:**
   ```sql
   UPDATE public.auftraege a SET
     filmcheck_ok            = f.filmcheck_ok,
     filmcheck_am            = f.filmcheck_am,
     filmcheck_notizen       = f.filmcheck_notizen,
     -- …17 weitere
     sv_briefing_struktur    = f.sv_briefing_struktur
   FROM public.faelle f
   WHERE a.claim_id = f.claim_id;
   ```
   Bei 1:N (mehrere Aufträge pro Claim) schreibt das die Werte in **alle** Auftrags-Rows desselben Claims. Pre-launch ist das jeweils max. 1 Row, also problemlos. Mit Wachstum auf N>1 müsste die WHERE-Klausel auf `auftraege.typ='erstgutachten'` o.ä. eingeschränkt werden — pre-launch nicht relevant, im Spec dokumentiert als zukünftige Anpassung.
3. **View-Audit + Repoint (konditional, analog SP-G PR1 Block 3):** PR1 läuft den View-Audit-Schritt durch (`scripts/cmm44-sph-views-audit.sql`). Falls eine View die 18 SP-H-Spalten aus `f.<col>` exponiert (vermutlich `v_faelle_mit_aktuellem_termin`), wird sie via `CREATE OR REPLACE VIEW` repointed: SP-H-Spalten via LATERAL JOIN auf den aktuellen Auftrag pro Claim (`(SELECT a.<col> FROM public.auftraege a WHERE a.claim_id = c.id ORDER BY a.reihenfolge DESC LIMIT 1)`), Output-Spalten-Namen via AS-Aliase unverändert für Backward-Compat.
4. **Types-Regen** nach PR1 — `auftraege`-Typ in `database.types.ts` trägt jetzt 18 zusätzliche Felder.

PR1 ist additiv (kein DROP, kein Spalten-Rename) → jederzeit applizierbar. Apply via `db query --linked` + `migration repair`.

#### PR2 — Reader/Writer-Sweep (code-only)

Kein DDL. Alle `faelle`-seitigen Reads UND Writes der 18 Spalten → `auftraege`. **1:1 Namens-Mapping** (kein Rename — anders als SP-G).

**Transform-Regelwerk (analog SP-G, mit 1:N-Anpassung):**

| Muster | Erkennung | Transform |
|---|---|---|
| **A** — Direkt-Select aus `faelle`, nur SP-H-Spalten | `from('faelle').select('id, claim_id, sv_briefing_text')` | Switch source: `from('auftraege').select('sv_briefing_text').eq('claim_id', claimId).order('reihenfolge', { ascending: false }).limit(1).maybeSingle()`. Namen unverändert. |
| **B** — Direkt-Select aus `faelle`, gemischt | `from('faelle').select('…, sv_briefing_text, …')` | Pull SP-H-Spalten in nested-Embed `claims:claim_id(auftraege(<SP-H-cols>))` mit `order('reihenfolge', {ascending:false}).limit(1)`. **Array-Normalisierung Pflicht** — `Array.isArray(x.claims.auftraege) ? x.claims.auftraege[0] : x.claims.auftraege` (1:N → immer Array, auch wenn limit(1)). |
| **C** — Write auf `faelle` (SP-H-col) | `from('faelle').update({ sv_briefing_text: …, status: 'erstellt' })` | SP-H-Werte aus dem faelle-Update **entfernen**, separater `from('auftraege').update({ sv_briefing_text: … }).eq('claim_id', claimId)` — am **aktuellen** Auftrag updaten. Falls 0 existierende Aufträge: skip mit warn-log (Datenkonsistenz nicht-blockierend pre-launch). Non-SP-H-Spalten bleiben im faelle-Update. Guarded. **NICHT** Dual-Write. |
| **D** — Nested `faelle(...)`-Select | `from('<x>').select('…, faelle(sv_briefing_text)')` | SP-H-Spalte in nested `claims:claim_id(auftraege(<col>))`-Block ziehen mit `order(...).limit(1)`. |
| **E** — View-Read | Read aus `v_*` exponiert die Spalte | PR1 hat die View repointet via LATERAL JOIN — **kein Code-Change**. |
| **F** — TS-Typ / JSX / Property | `interface`, `obj.<col>`, JSX | **Kein Change** — Spaltenname identisch. |

**Verify-Endzustand:** kontext-sicherer paren-balanced Re-Grep (`scripts/cmm44-sph-grep.mjs`, analog SP-G) zeigt 0 live `from('faelle')`-Selects/Updates/Inserts und 0 nested `faelle(...)`-Selects der 18 Spalten. Build grün.

#### PR3 — Catch-up-Backfill (additive Migration)

Idempotenter Re-`UPDATE` (gleiche WHERE-Klausel wie PR1 Block 2). Fängt `faelle`-Writes, die im Fenster zwischen PR1-Backfill und PR2-Deploy noch auf `faelle` liefen. Mit COALESCE-Pattern (`SET <col> = COALESCE(a.<col>, f.<col>)`) — bestehende `auftraege`-Werte gewinnen, fall fills nulls — analog SP-G PR3.

### Sequencing

PR1 (additiv) jederzeit applizierbar. PR2 → `staging` → `main`-Release. PR3 nach PR2-`main`-Release. Kein destruktives DDL.

## 4 · Migrations-Vorgehen (bewährt aus SP-A2/A3/B/G)

1. Vor jeder Migration Live-DB messen (`information_schema`).
2. Migrationen in `BEGIN/COMMIT`; vor dem Apply Dry-Run (`BEGIN; … ROLLBACK;`).
3. Apply via `npx supabase db query --linked --file <sql>` + `npx supabase migration repair --status applied <version>` — **kein** `db push`.
4. `types regen` nach PR1 (PowerShell `2>$null`, nicht Bash `2>&1`).
5. AGENTS.md Regel 2 (DDL nur CLI) + Regel 3 (kein unbegleiteter Stash). **Memory `feedback_kein_auto_merge`:** PRs erst nach beiden Reviews öffnen, Aaron mergt selbst.

## 5 · Tests & Erfolgskriterium

Portal-Smoke 5 Portale (Public / Admin / Dispatch / SV / Kunde) mit Screenshots nach PR2 und PR3. Test-Pfade (SP-H-Touch-Sites):
- **SV** (`/gutachter/auftraege/[id]`, `/gutachter/fall/[id]`): SV-Briefing-Anzeige, Filmcheck-Status, TS-Workflow.
- **Admin** (`/faelle/[id]`): Auftrag-LC-Übersicht (Briefing, TS-Status, Storno-Daten).
- Public + Dispatch + Kunde: Sanity-Check (kein 5xx / TypeError).

**Erfolg, wenn:**
- `information_schema.columns` zeigt alle 18 Spalten auf `auftraege`.
- `git grep` aller 18 Spaltennamen: 0 `faelle`-seitige Reads/Writes in `src/` (pro Name einzeln, kontext-sicher).
- `npm run build` grün (8 GB heap).
- Portal-Smoke 0 Hard-Fails.

## 6 · Risiken

| Risiko | Mitigation |
|---|---|
| 1:N-Cardinality: PR1-Backfill schreibt SP-H-Werte in **alle** Aufträge desselben Claims (nicht nur den aktuellen) | Pre-launch nur 1 Auftrag pro Claim → kein Konflikt. Im Spec dokumentiert als Future-Constraint (WHERE `typ='erstgutachten'` falls N>1). |
| Pattern-C Writer findet keinen aktuellen Auftrag (keine Auftrags-Row existiert) | Skip-mit-warn-log statt 500. Pre-launch realistisch für die 41 noch-nicht-zugewiesenen Claims. Datenkonsistenz unkritisch (faelle behält Wert bis Phase 6). |
| 1:N-Embed-Reader bricht weil PostgREST Array statt Object liefert | Pattern-B Transform-Regelwerk schreibt `Array.isArray(x) ? x[0] : x` Pflicht. Re-Grep verifiziert pro Site. |
| Dynamische `fall[feld]`-Reads, die `grep` nicht fängt | Portal-Smoke auf allen 5 Portalen + paren-balanced Re-Grep (SP-G-Lesson) |
| Funktions-Body referenziert SP-H-Spalte (kein `pg_depend`-Eintrag) | `pg_proc.prosrc`-Text-Sweep in PR1 Step 5 — bereits SP-A-Lektion |
| View-Repoint via LATERAL JOIN bricht Output-Typ | Precision-Casts in `CREATE OR REPLACE VIEW` (SP-G-Lesson) — pro Spalten-Typ-Vergleich vor Apply |
| Trigger auf `auftraege` feuert beim Backfill Notifications | PR1 Step 5: Trigger-Body-Audit (`pg_get_functiondef`); bei Notification-Side-Effects `DISABLE/ENABLE TRIGGER`-Wrapper im Backfill-Block (SP-G-Pattern) |
| `auftraege.typ` Default beim Backfill nicht gesetzt | Kein Problem — Backfill ist UPDATE, kein INSERT. Bestehende Aufträge haben ihren Typ bereits. |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
