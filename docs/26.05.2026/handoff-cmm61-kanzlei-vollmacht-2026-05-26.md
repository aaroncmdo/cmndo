# CMM-61 — Kanzlei-Provision + Vollmacht / Claims-as-SSoT — Handoff (2026-05-26)

**Für die nächste Session.** CMM-61 ist abgeschlossen. Danach ist als einzige CMM-44-Reststrecke **Phase 6** (`DROP TABLE faelle CASCADE`) offen — **Aaron will VOR Phase 6 nochmal gefragt werden.**

**Kanonischer Live-Status:** Memory `project_cmm65_timestamp_sweep.md`.
**Vorgänger-Handoff:** `docs/26.05.2026/handoff-cmm65-partb-finanz-2026-05-26.md`.

---

## 0 · TL;DR

| Teil | Stand |
|---|---|
| **Teil 1 — Kanzlei-Provision (3 Spalten → claims)** | **PR #1783** (--base staging, sync-watcher merged bei grünem build). Migration `20260526162724` appliziert + DB-verifiziert. |
| **Teil 2 — Vollmacht-Konsolidierung (7 Duplikat-Spalten)** | **Bereits erledigt** durch frühere Slices (SP-B PR2b + unterschrift-upload + View-Repoints). Empirisch verifiziert: 0 direkte `faelle.vollmacht_*`-Reads/Writes. **Kein PR nötig.** |

---

## 1 · Aaron-Entscheidung: Ziel = `claims` (nicht `kanzlei_faelle`)

Die 3 Kanzlei-Provisionsspalten ziehen auf **`claims`**, weil:
- `claims` ist 1:1 mit `faelle` (60 ≥ 59) → jeder Fall hat eine Heimat. `kanzlei_faelle` hat nur **12 Rows** → die ~47 faelle ohne Kanzlei-Fall hätten dort keine.
- `kanzlei_honorar` wird im selben Finance-Aggregat wie `marketing_provision` gelesen (`fall-finanzen` / `analytics/finance`) — das CMM-65 Part B gerade nach claims gezogen hat → Co-Location.

**Live dormant → provably value-neutral:** `kanzlei_honorar` 0/59, `kanzlei_provision_ausgezahlt_am` 0/59, `kanzlei_provision_status` 59/59 = ausschließlich der Spalten-Default `'offen'` (1 distinct value, `column_default = 'offen'::text`).

`gutachter_honorar` (SV-Honorar, OCR-geschrieben, 1 echter Wert) ist **out-of-scope** (Aaron: separate Slice). Nur in `faelle_sv_view` projiziert.

---

## 2 · Teil 1 — Migration + Code (PR #1783)

**Migration `20260526162724` (db push/Pooler, kein Plugin-Override nötig):**
- ADD `claims.kanzlei_honorar numeric(10,2)` / `kanzlei_provision_status text DEFAULT 'offen'` / `kanzlei_provision_ausgezahlt_am timestamptz` (= faelle-Quelltypen).
- Backfill: honorar/ausgezahlt_am IS-NULL-guarded (0 Zeilen); status divergenz-guarded (`f.status <> 'offen' AND c.status = 'offen'`, da der ADD-Default 'offen' alle Rows füllt → IS-NULL-Guard würde nie greifen).
- View-Repoint `v_faelle_mit_aktuellem_termin`: `f.kanzlei_*` → `c.*` (einzige projizierende View; `faelle_sv_view` matchte nur über `gutachter_honorar` = out-of-scope). Server-seitig `pg_get_viewdef`+`replace`+RAISE-Guard+`security_invoker`-Preserve.
- **Verify:** claims 60/60 `status='offen'`, `divergent_rows=0`, View 59 rows SELECT-bar, `security_invoker=false` erhalten.

**Code-Sweep:**
- `analytics/finance.ts`: Kanzlei-Aggregat `from('faelle')` → `from('claims')` (claim-global, `created_at` direkt) — wie der `marketing_provision`-Aggregat daneben.
- `fall-finanzen.ts`: `kanzlei_honorar` aus faelle-Select raus, in den bestehenden claims-Read (kein neuer Round-Trip).
- `erstelle-abrechnung.ts`: `kanzlei_honorar` in den claims-Embed (`!inner`), `'berechtigt'`-Filter via `claims.kanzlei_provision_status`; Write `'abgerechnet'` + `kanzlei_abrechnung_id` in EINEM `claims.update` gebündelt (`fallIds`-Var entfällt).
- `stripe/webhook/route.ts`: `'ausgezahlt'`-Write → claims. `kanzlei_abrechnung_positionen` trägt nur `fall_id` → `claim_id` via `faelle` gemappt.
- `database.types.ts`: 3 Spalten in den claims-Row/Insert/Update-Typ (manuell, alphabetisch zwischen `kanzlei_ansprechpartner_telefon` und `kanzlei_uebergeben_am`).
- **KEIN Code-Change:** `subphase-resolver` + `abrechnungen-generator` lesen über `v_faelle_mit_aktuellem_termin` (`*` / FALL_SELECT) → PR1-Repoint liefert claims-Werte automatisch.

---

## 3 · Teil 2 — Vollmacht-Konsolidierung war bereits fertig

Die 7 `vollmacht_*`-Duplikat-Spalten (`status`, `pruefung_status`, `geprueft_am`, `geprueft_von`, `pdf`, `pruefung_begruendung`, `signiert_am`) sind **vollständig auf claims (SSoT) konsolidiert** — durch frühere Slices (SP-B PR2b, `unterschrift-upload` schreibt `claims.vollmacht_pdf`, View-Repoints). Empirisch verifiziert (2026-05-26):
- `v_faelle_mit_aktuellem_termin` projiziert alle 7 aus `c.*`; `v_claim_full.vollmacht_signiert_am` = `c.vollmacht_signiert_am`.
- Direkte Reads laufen über `claims:claim_id(vollmacht_*)`-Embeds (`sv-event-sync`, `blocker-detection`, `kanzlei-wunsch`).
- Writes gehen an `claims.update({vollmacht_*})` (`unterschrift-upload`, `flow/[token]`).
- **0 direkte `faelle.vollmacht_*`-Reads/Writes der 7 Spalten** → `faelle`-Kopien sind stale, sterben in Phase 6.

**Achtung Phase-6-Detail:** `faelle.vollmacht_datum` (NICHT im 7-Duplikat-Set, leads-typisierte Spalte, faelle-only) wird in `flow/[token]/actions.ts:1420` via untyped admin-client geschrieben. `leads.vollmacht_signiert_am` ist ebenfalls eine eigene Lead-Spalte (kein Duplikat). Beide separat im Phase-6-faelle-Reader/Writer-Sweep prüfen.

---

## 4 · Reststrecke — Phase 6 (CMM-49 / SP-L)

**`DROP TABLE faelle CASCADE`** — die einzige verbliebene CMM-44-Arbeit.
- **Aaron-Anweisung 2026-05-26: VOR Phase 6 nochmal Bescheid sagen.**
- Vor dem Drop: alle verbliebenen `faelle`-Reader/Writer sweepen (Master-Strategie: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`). Insbesondere: `from('faelle').select('*')`-Stellen, `faelle.vollmacht_datum`-Writer (s.o.), restliche faelle-native Spalten.
- **Post-Drop-Smoke aller Portale Pflicht** (Public + Admin + Kunde + SV) mit Screenshots — Memory `feedback_post_drop_smoke`.

---

## 5 · Verify-Rezept + Env

- **Live-State empirisch** (`information_schema.columns` / `pg_get_viewdef` via Supabase-MCP `execute_sql`; bei Pool-Timeout retrien — am 26.05. abends mehrfach 522/Connection-timeout unter 7+ Parallel-Sessions).
- **DDL:** Rule 2 = `npx supabase db push`. Frischer Worktree → `supabase/.temp`-Link-State (`project-ref`+`pooler-url`+`linked-project.json`) aus Haupt-Checkout kopieren, dann push (Pooler 6543). Version = Datei = `schema_migrations` (kein Drift).
- **Projekt-ID Supabase:** `paizkjajbuxxksdoycev`. Worktree: `node scripts/new-session-worktree.mjs <slug> staging` + `.env.local` kopieren + node_modules-Junction → main.
- **Build-Gate:** lokal tsc grün für eigene Files; 11 pre-existing missing-native-dep errors (`@react-pdf/renderer`/`sharp`/`pdf-parse`) in nicht-angefassten Files = CI/Linux ist Gate. `token-audit` grün.
- **Merge:** NICHT die Merge-Session — PR `--base staging`; `sync-watcher` merged non-draft staging-PRs bei grünem build.
