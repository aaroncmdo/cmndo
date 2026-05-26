# CMM-65 Part B / Claims-as-SSoT — Finanz-ADDs-Handoff (2026-05-26)

**Für die nächste Session.** Einstiegspunkt nach Abschluss von **CMM-65 Part B** (Finanz-Relocation faelle → claims). Teil der CMM-44-Vollmigration (Claim-as-SSoT, `faelle` → Phase-6-DROP).

**Kanonischer Live-Status (immer zuerst lesen):** Memory `project_cmm65_timestamp_sweep.md`.
**Vorgänger-Handoff:** `docs/26.05.2026/handoff-cmm66-reststrecke-2026-05-26.md`.

---

## 0 · TL;DR — was JETZT fertig ist

**Part B = DONE.** 4 `faelle`-Finanzspalten additiv auf `claims` relocatet. Alle vier live **cov=0** (0/59 non-null) → **provably value-neutral**.

| Slice | PR | Stand |
|---|---|---|
| **PR1** — claims-ADD (4 Spalten) + IS-NULL-Backfill + View-Repoint `v_faelle_mit_aktuellem_termin` | **#1770** | **MERGED → staging**, Migration `20260526153450` appliziert (`db push`) |
| **PR2** — Code-Sweep (Reader/Writer faelle→claims) | **#1773** | **offen gegen staging** (sync-watcher merged bei grünem build) |

Die 4 Spalten: `marketing_provision` numeric(10,2), `marketing_provision_status` text, `marketing_quelle` text, `zahlungsweg` text.

**SPEC-ERWEITERUNG:** Der CMM-66-Handoff nannte nur `marketing_provision` + `marketing_quelle` + `zahlungsweg`. `marketing_provision_status` wurde **mitgenommen**, weil es (a) untrennbar zum Provisions-Konzept gehört, (b) cov=0 + null Code-Referenzen = dormant, (c) in `v_faelle_mit_aktuellem_termin` projiziert wird → bliebe es auf faelle, wäre die View nach dem Phase-6-DROP kaputt.

---

## 1 · Das mentale Modell: DREI `zahlungsweg`-Spalten (NICHT verwechseln!)

Gleicher Wortstamm, drei distinkte Spalten + Semantiken:

| Spalte | Tabelle | Semantik | Domain | Status |
|---|---|---|---|---|
| `zahlungsweg` | **claims** (Part B) | Kunden-Auszahlungs-**ZIEL** | `{kundenkonto, werkstatt_direkt}` | NEU claims-nativ (war faelle) |
| `zahlungsweg` | **claim_payments** | Zahlungs-**METHODE** | `{ueberweisung, scheck, bar, verrechnung}` | seit SP-J |
| `auszahlung_zahlungsweg` | **claims** | Auszahlungs-Split-Weg | (Bucket B) | seit SP-J |

`faelle_kunde_view` referenziert **nur** `c.auszahlung_zahlungsweg` (NICHT unser `zahlungsweg`) → brauchte **keinen** Repoint.

---

## 2 · Architektur PR1 + PR2

**PR1 (#1770, DDL):**
- `ALTER TABLE claims ADD COLUMN IF NOT EXISTS` × 4 (Typen = faelle-Quelle, nullable).
- IS-NULL-guarded Backfill faelle→claims (heute 0 Zeilen, idempotent). `leads` hat KEINE marketing-Quellspalte (nur `source_channel`/`source_domain`, andere Semantik) → Backfill-Quelle nur faelle.
- View-Repoint `v_faelle_mit_aktuellem_termin`: `f.marketing_provision/_status/_quelle` → `c.*` (claims joint bereits als `c ON c.id=f.claim_id`, alle faelle haben claim_id NOT NULL → kein NULL-Regress). `NULL::text AS zahlungsweg`-Stub → `c.zahlungsweg`. Technik wie CMM-66 PR2b (server-side `pg_get_viewdef`+`replace()`+RAISE-no-op-Guard+`security_invoker`-Preserve).

**PR2 (#1773, Code):**
- **Reader → claims:** `analytics/finance.ts` (`from('claims')`, claim-globaler Finanz-Aggregat, nur Summe genutzt), `fall-finanzen.ts` + `get-kunde-faelle.ts` (Spalte in den **bestehenden** claims-Read ergänzt — kein neuer Round-Trip), Dead-Selects `marketing_quelle` (fall-finanzen + abrechnungen-generator) entfernt.
- **Writer → claims:** `kunde/.../actions.ts updateZahlungsweg` (`claims.update` via `ownership.claimId`), `claim-duplicate-columns.ts` (`zahlungsweg` in `CLAIM_OWNED_DUPLICATE_COLUMNS` → `splitOrKeepFaelleUpdate` routet `lexdrive/process-event`-Write automatisch), Test angepasst.
- **KEIN Code-Change nötig:** View-basierte Reader (`fall/queries.ts` FALL_SELECT, `_prozess/Sections.tsx`, kunde `page.tsx:837` via `getKundeFallDetailRecord`, `SaeuleMeinGeld`) — der PR1-View-Repoint liefert claims-Werte automatisch.

---

## 3 · Reststrecke — was als NÄCHSTES ansteht

### CMM-61 — kanzlei honorar/provision + Vollmacht (NÄCHSTE SLICE) — Pre-Discovery 2026-05-26

**Linear:** CMM-61 (Kind von CMM-44). Teil-Scope überschneidet sich mit CMM-65 (das Ticket listet `kanzlei_honorar`/`kanzlei_provision_*` auch).

**Spalten-Landschaft (live verifiziert 2026-05-26):**

| Spalte | Tabellen | Coverage (faelle/claims) | Einschätzung |
|---|---|---|---|
| `kanzlei_honorar` numeric | faelle-only | 0/59 | **dormant** → wie Part B (additiv, easy) |
| `kanzlei_provision_ausgezahlt_am` timestamptz | faelle-only | 0/59 | **dormant** |
| `kanzlei_provision_status` text | faelle-only | **59/59** | **ACTIVE** — wahrscheinlich Default ('offen'?) auf allen; **erst prüfen** ob echte Daten oder bedeutungsloser Default, dann Backfill |
| `gutachter_honorar` numeric | faelle-only | 0/59 | SV-Honorar (NICHT kanzlei) — evtl. eigene Slice/claims, scope klären |
| `vollmacht_status`/`vollmacht_pruefung_status`/`vollmacht_geprueft_am`/`vollmacht_geprueft_von`/`vollmacht_pdf`/`vollmacht_pruefung_begruendung`/`vollmacht_signiert_am` | **faelle + claims (Duplikat!)** | vollmacht_status 59/60, signiert 0/0 | **claims = SSoT-Superset** (60≥59). get-kunde-faelle liest vollmacht_signiert_am/status SCHON aus claims → Reader/Writer-Sweep finishen, dann faelle-Kopien droppen (Phase 6) |
| `mandatsnummer` text | faelle + kanzlei_faelle | — | SP-I2 hat kanzlei_faelle gemacht; `faelle.mandatsnummer` = Residual (Phase-6-Drop) |

**⚠️ DESIGN-ENTSCHEIDUNG (vor Impl. klären):** `kanzlei_faelle` hat nur **12 Rows** (nicht alle 60 Claims haben einen Kanzlei-Fall), `faelle` hat 59. Wenn `kanzlei_honorar`/`provision` auf `kanzlei_faelle` ziehen → die ~47 faelle OHNE kanzlei_faelle-Row hätten keine Heimat (oder kanzlei_faelle-Rows müssten angelegt werden). **Alternative: → `claims` (1:1 mit faelle, alle 60).** Der Handoff sagte „kanzlei_faelle provision/honorar", aber die 12-vs-59-Lücke spricht eher für claims (oder das Provisions-Konzept gilt nur für die 12 Kanzlei-Fälle — dann ist `kanzlei_provision_status` 59/59 ein bedeutungsloser Default). **Aaron fragen / `kanzlei_provision_status`-Werteverteilung prüfen** bevor das Ziel festgelegt wird.

**Mechanik (wie Part B):** live cov + Werteverteilung prüfen → ADD auf Ziel-Tabelle + Backfill (kanzlei_provision_status hat Daten!) + Reader/Writer-Sweep + View-Repoint falls `v_faelle_mit_aktuellem_termin`/`faelle_kunde_view` die Spalten projizieren. Vollmacht-Teil = Duplikat-Konsolidierung (claims=SSoT), kein neues ADD nötig — nur Reader/Writer auf claims + faelle-Kopie-Drop in Phase 6.

**Auch noch in CMM-65 offen (laut Ticket, zu verifizieren):** `status`, `sv_termin`, `kanzlei_wunsch_*`, `abrechnung_id`, `*_erinnerung_gesendet` — information_schema live prüfen ob claims-Heimat existiert.

### Phase 6 — `DROP TABLE faelle CASCADE` (CMM-49 / SP-L)
- **Erst nach** Part B (= jetzt erfüllt) + CMM-66 (erfüllt) + CMM-61.
- Vor dem Drop: alle verbliebenen `faelle`-Reader/Writer sweepen (Master-Strategie: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`).
- **Post-Drop-Smoke aller Portale Pflicht** (Public + Admin + Kunde + SV) mit Screenshots — Memory `feedback_post_drop_smoke`.

---

## 4 · Lessons / Gotchas (diese Session)

1. **`db push` ging diese Session SAUBER** (Rule 2, KEIN Plugin-Override nötig). Trick: der frische Worktree war nicht `supabase link`ed → `db push` schlug fehl mit „Cannot find project ref". Fix: `supabase/.temp/{project-ref,pooler-url,linked-project.json}` aus dem Haupt-Checkout in den Worktree kopiert → `db push` lief über den **Pooler** (Port 6543, auch wenn 5432 mal blockiert ist). Version = Datei = `schema_migrations` (kein Drift).
2. **View-Repoint macht View-basierte Reader gratis:** `v_faelle_mit_aktuellem_termin` + `getFallForAdmin/Sv/Kunde` (über `fall/queries.ts`) lesen die Spalten über die View → ein PR1-View-Repoint erspart den halben Code-Sweep. Nur **Direkt-Tabellen-Reads** (`from('faelle').select(...)`) brauchen Code-Änderungen.
3. **Dead-Selects:** `marketing_quelle` wurde an 2 Stellen selektiert aber **nie benutzt** (fall-finanzen + abrechnungen-generator) → ersatzlos entfernt statt repointet. Vor dem Repoint prüfen: wird der Wert überhaupt gelesen?
4. **node_modules-Junction + Windows-Native-Deps:** `sharp` + `@react-pdf/renderer` sind lokal/Windows NICHT installiert → `tsc`/`build` werfen pre-existing `Cannot find module`-Errors in pdf/sharp/ocr-Files (NICHT die eigenen Änderungen). **CI/Linux ist das Build-Gate.** Eigene Files isoliert prüfen (kein Error in den 9 geänderten Files = grün).
5. **`marketing_provision_status`** (text, cov=0, null Code-Refs) war im Snapshot nicht genannt, aber via `v_faelle_mit_aktuellem_termin` projiziert → mitnehmen, sonst Phase-6-View-Breaker.

---

## 5 · Verify-Rezept + Env

- **Live-State empirisch prüfen** (`information_schema.columns` / `pg_get_viewdef` via Supabase-MCP `execute_sql`; bei Pool-Timeout retrien).
- **DDL:** Rule 2 = `npx supabase db push`. Frischer Worktree → `.temp`-Link-State aus Haupt-Checkout kopieren, dann push (Pooler).
- **Projekt-ID Supabase:** `paizkjajbuxxksdoycev`. Worktree pro Slice off `origin/staging`: `node scripts/new-session-worktree.mjs <slug> staging` (+ `.env.local` kopieren + node_modules-Junction → main).
- **Merge:** NICHT die Merge-Session — PR `--base staging`; `sync-watcher` merged non-draft staging-PRs bei grünem build.
