# Handoff — CMM-44 SP-G abgeschlossen (Stand 2026-05-20)

**Master:** CMM-44 (`faelle` wird in Phase 6 abgeschafft, `claims` ist SSoT, `gutachten` ist Sub-Table)
**Memory:** [[project_cmm44_spg_status]], [[project_cmm44_faelle_dekomposition]],
[[project_cmm44_spb_status]], [[project_cmm44_spa3_status]]

---

## 1 · Was SP-G erledigt hat

Die **19 Gutachten-bezogenen `faelle`-Spalten** (Phase-1-Verdikt MOVE → `gutachten` für 16 davon + 3 Reader-Umstellungen ohne MOVE) sind auf die `gutachten`-Sub-Table migriert. `gutachten` ist 1:1 pro Claim (UNIQUE-Constraint auf `claim_id`).

**Architektur — rein additiv (analog SP-B):** kein per-Spalten-`DROP COLUMN faelle.*`. Die 19 Spalten bleiben in `faelle` stehen und sterben gesammelt mit `DROP TABLE faelle CASCADE` in Phase 6 (Master-Strategie §4 „claims-first, faelle stirbt zuletzt").

| PR | Inhalt | Stand |
|---|---|---|
| **#1518** PR1 | 5× `ADD COLUMN` auf `gutachten` (4 ki_* + `positionen jsonb`) + UPSERT-Backfill der 16 MOVE-Spalten via `ON CONFLICT (claim_id) DO UPDATE SET COALESCE(...)` + Repoint aller 3 betroffenen Views (`faelle_sv_view`, `v_claim_full`, `v_faelle_mit_aktuellem_termin`) auf `gutachten` als Quelle. Migration `20260520095539`. | offen, wartet auf Aaron-Merge |
| **#1519** PR2 | 14 Reader/Writer-Sites migriert (Pattern A 11 reads, Pattern B 3 writes, Pattern D 1 nested, Pattern F 3 Klasse-C). Tabellen-Wechsel `faelle` → `gutachten` + Spalten-Rename (`gutachten_betrag` → `gesamt_schadensbetrag` usw.). 5 Spec-Review-Befunde + 2 Code-Quality-Befunde in 4 Iterationen abgearbeitet. | offen, wartet auf Aaron-Merge (gated nach #1518) |
| Smoke-Branch | `scripts/smoke-cmm44-spg.mjs` für 5-Portal-Smoke nach staging-Deploy vorbereitet. | gepusht auf `kitta/cmm-44-spg-smoke`, PR-Öffnung nach PR2-Merge |

Spec/Plan: `docs/superpowers/specs|plans/2026-05-20-cmm44-spg-gutachten-rest*.md`.

## 2 · Verifikation

- **DB-Schema:** 5 neue Spalten auf `gutachten` live (`scripts/cmm44-spg-verify.sql` → `spg_neu_auf_gutachten = 5`). Backfill-Effekt: 1 neuer `gutachten`-Row angelegt + 1 existierender per COALESCE aktualisiert (pre-launch DB-Stand).
- **Views:** `pg_get_viewdef` bestätigt: alle 19 SP-G-Spalten in `v_faelle_mit_aktuellem_termin` jetzt aus `g.<col>` (gutachten-Alias), 12 in `v_claim_full`, 1 in `faelle_sv_view`. Klasse-C-Mappings sauber: `(g.id IS NOT NULL) AS gutachten_vorhanden`, `NULL::numeric(10,2) AS gutachten_stundensatz`, `(g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage)::numeric(10,2) AS nutzungsausfall_gesamt`.
- **Kontext-sicherer paren-balanced Re-Grep:** 0 live `from('faelle')`-Selects/Updates/Inserts und 0 nested `faelle(...)`-Selects referenzieren noch eine der 19 SP-G-Spalten. 12 verbleibende Hits in `scripts/cmm44-spg-grep.mjs` sind alle false-positives (Kommentare, OOS-Test-Fixtures, View-E-Reads, Mock-Objects, später-im-Window-Selects aus anderen Tabellen — alle audit-bestätigt).
- **CI-Build:** PR1 + PR2 + jeder Fix-Commit grün (`npm run build` mit 8 GB Heap, `tsc --noEmit` 0 Fehler).
- **Migration recorded:** `npx supabase migration list` zeigt `20260520095539` als applied.

## 3 · Lessons für die nächsten Sub-Projekte (SP-C / SP-G2 / SP-H / SP-J / …)

Aus den 4 Review-Iterationen + den Pre-Apply-Dry-Runs:

### a) Sub-Table-Backfill: NOT-NULL-Spalten der Sub-Table mitziehen

Die `gutachten`-Tabelle hat `sv_id NOT NULL` ohne Default. Mein erster Backfill-Versuch warf bei jedem `INSERT` einen NOT-NULL-Verstoß. Lösung: `sv_id` aus `faelle.sv_id` ins INSERT übernommen + WHERE-Filter `AND sv_id IS NOT NULL`. Vor jedem Sub-Table-Backfill mit Tabellen-Wechsel: `information_schema.columns WHERE table_name='<ziel>' AND is_nullable='NO'` checken und jede NOT-NULL-Spalte ohne Default explizit handhaben.

### b) `CREATE OR REPLACE VIEW` braucht stabile Spalten-Typen — Precision-Casts!

Mein erster View-Repoint warf `42P16: cannot change data type of view column "gutachten_betrag" from numeric(10,2) to numeric(12,2)`. Ursache: Source-Column auf `gutachten` ist breiter typisiert als das View-Output-Schema. `CREATE OR REPLACE VIEW` erlaubt keine Typ-Änderung der Output-Spalten — Lösung: Precision-Cast im Body (`g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag`). Pro View-Repoint-Mapping: `information_schema.columns`-Vergleich beider Seiten + Cast wo nötig.

### c) Klasse-C-Mappings (kein direktes Spalten-Ziel) im View formulieren

3 SP-G-Spalten haben kein 1:1-Ziel: `gutachten_vorhanden` (abgeleitet aus Existenz), `gutachten_stundensatz` (DROP-pre-launch-0-cov), `nutzungsausfall_gesamt` (calc `tagessatz × tage`). Lösung im View-Body als `(g.id IS NOT NULL)`, `NULL::numeric(10,2)`, `(<calc>)::numeric(10,2)` — Output-Name + Typ unverändert, Reader-Code muss nichts wissen.

### d) Comment-False-Positives im paren-balanced Re-Grep akzeptieren

Mein Re-Grep nutzt ein 1500-char-Window nach `.from('faelle')`. Dass innerhalb dieses Windows ein **Kommentar** mit dem alten Spaltennamen steht („CMM-44 SP-G PR2: gutachten_betrag → gutachten.gesamt_schadensbetrag"), erzeugt einen Hit, obwohl der Select selbst die Spalte nicht enthält. Bei der finalen Verifikation pro Hit den Kontext aufschlagen — Kommentar-Hits sind keine Defekte. Alternativ: Re-Grep-Script um Kommentar-Stripping erweitern (Aufwand-Nutzen-Trade-off; pre-launch toleriert).

### e) `select('*')`-Lesezugriffe sind keine Defekte aber Bandwidth-Waste

`api/pdf/kanzlei-paket/[id]/route.tsx:21` hat `.from('faelle').select('*, ...claims:claim_id(gutachten(...))')`. Das `*` selektiert weiter alle faelle-Spalten inkl. der SP-G-Werte — aber der Code liest sie nirgends mehr. Pre-launch tolerierbar, in Phase 6 sterben sie ohnehin mit. Für Sub-Projekte ohne dringende Performance-Probleme nicht-blockierend.

### f) Pattern-B-Writer: gutachten-only, kein Dual-Write — UND nullable-sv_id-Guard

PR2's erster Wurf hatte 2 Writer (`uploadGutachten`, `schadenkalkulation/route.ts`), die `sv_id` im gutachten-Upsert nicht setzten — bei einem neuen Fall ohne existierende gutachten-Row hätte das einen 500er erzeugt. Korrekt: `sv_id` aus dem voraufgehenden faelle-Select mitziehen + Guard `if (fallRow?.claim_id && fallRow?.sv_id)` (statt `as string`-Cast). Defensiver: gutachten-Row nur erzeugen, wenn ein SV zugewiesen ist; sonst skippen.

### g) View-Repoints sind in PR1 obligatorisch (nicht erst PR2)

Wenn eine View vor PR2 noch `f.<col>` exponierte aber PR2 die Code-Writer auf `gutachten` umstellt, lesen View-Konsumenten stale faelle-Werte (`faelle` wird ja nicht mehr geschrieben). Lösung: PR1 Block 3 alle Views via `CREATE OR REPLACE` repointen — Output-Spalten-Name + -Typ via AS-Alias + Precision-Cast unverändert für Backward-Compat. PR2 kann dann View-Reads als Pattern-E (no-op) klassifizieren.

## 4 · Lose Enden

- **PR1 #1518 + PR2 #1519** offen, warten auf staging→main-Release durch Aaron. Memory `feedback_kein_auto_merge` + `feedback_staging_auto_merge_widerrufen` → Aaron mergt selbst, beide Targets.
- **Smoke-PR** noch nicht geöffnet (`scripts/smoke-cmm44-spg.mjs` auf `kitta/cmm-44-spg-smoke`). Öffne ich nach PR2-Merge auf staging — dann ist der Branch-Base sauber.
- **PR3 Catch-up-Backfill** (Plan Task 6) wartet auf PR1+PR2 auf `main` — analog zu SP-B PR3 ein idempotenter Re-UPSERT mit COALESCE-Pattern, fängt mögliche Writes aus dem Fenster zwischen PR1-Apply (heute Nachmittag) und PR2-`main`-Release.
- **Portal-Smoke** noch nicht gefahren (script vorbereitet). Nach staging-Deploy:
  ```
  node --env-file=.env.local scripts/smoke-cmm44-spg.mjs
  ```
- **Linear-Issues** für CMM-44-Master + Sub-Tickets nicht in dieser Session getouched.
- **`MaklerAkteDetail.tsx` + `copilot-prompt.ts`** (3 Klasse-C-Sites) wurden als no-op klassifiziert, weil ihr Upstream-Loader (`getMaklerFallDetail` aus `lib/makler/queries.ts`) `v_faelle_mit_aktuellem_termin` liest — PR1 hat die View repointet, also fließt der berechnete `nutzungsausfall_gesamt`-Wert (`tagessatz × tage`) korrekt durch. Empirisch bestätigt vom Spec-Reviewer.

## 5 · Nächster CMM-44-Schritt

Aus `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md §4` und dem SP-B-Handoff:

- **SP-C** — 33 Parteien-Snapshots (`kunde_*`, `halter_*`, `gegner_*`) → `claim_parties`. Abhängigkeitsfrei. Komplexer als SP-G weil 1:N (mehrere Parteien pro Claim) statt 1:1.
- **SP-G2** — `gutachter_termine.claim_id`-FK nachziehen. Entsperrt SP-D (Termin-Cluster 25 Spalten). Hohes Risiko (RLS-Policies, View-Repoints, Daten-FK-Umzug) — strategisch wichtig.
- **SP-H** — 18 Auftrag-LC-Spalten → `auftraege`. Mittel-komplex.
- **SP-J** — 12 Abrechnungs-Spalten → `abrechnungen`. Mittel-komplex.

**Bewährtes Vorgehen (aus SP-A2/A3/B/G):** Live-DB messen → brainstorming → spec → plan → subagent-driven-development mit 2-stufiger Review (Spec + Code-Quality). Lessons §3 oben in den Implementer-Prompt einbauen — vor allem (a) NOT-NULL-Sub-Table-Spalten, (b) Precision-Casts in View-Repoints, (f) Pattern-B-Writer-Guards.

## 6 · Worktree

`.claude/worktrees/cmm-44-spb` enthält die SP-G-Branches:
- `kitta/cmm-44-spg` (Spec + Plan)
- `kitta/cmm-44-spg-pr1-add-columns` (Migration + Backfill + View-Repoints)
- `kitta/cmm-44-spg-pr2-sweep` (14-Sites Reader/Writer-Sweep)
- `kitta/cmm-44-spg-smoke` (Smoke-Script)
- `kitta/cmm-44-spg-handoff` (dieses Doc)

Nach Merge aller PRs: `git worktree remove .claude/worktrees/cmm-44-spb` möglich (der Worktree wird gemeinsam für CMM-44-Arbeit reused — siehe SP-B-Handoff).

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
