# HANDOFF — CMM-49 `DROP TABLE faelle` (Stand 03.06.2026, ~23:00)

**Für die nächste Session: 1:1 hier anknüpfen.** Single Source of Truth für den faelle-Drop ist
`docs/superpowers/plans/2026-06-03-faelle-drop-master.md` (Branch `kitta/cmm49-faelle-drop-master-plan`).

---

## 0 · TL;DR
- **Konsolidiert:** alle Drop-Arbeit ist gemergt, 0 offene Drop-PRs, 9 verstreute Worktrees entfernt, EIN Master-Plan ist die Wahrheit.
- **Strategie-Pivot:** per-Spalte-`fall_id`-Drops **GESTOPPT** (off-path, haben am 02.06. 2 Live-Breaks + 1 Replay-Inzident gemacht). Neuer Weg = **Full-Repoint** der Reader → `claims`/`v_claim_full`, dann FK-**Constraints** droppen (Spalten bleiben) + `DROP TABLE`.
- **Echte Größe ermittelt:** der Drop ist ein **Daten-Architektur-Projekt** — **~133 live-read faelle-eigene Spalten** müssen nach `claims`/`vehicles` (P0), dann 240 Reader (P1), 49 DB-Objekte (P2), 40 FK-Constraints + DROP (P3). Kein Quick-Win.
- **Inzident vom 02.06. ist behoben** (staging-Replay grün; main grün via rel2311).

---

## 1 · Was am 02.06. gemacht wurde (alles GEMERGT, live verifiziert)

### b″ (CMM-74) — Prereq DONE
- `#2233` `v_claim_phase` +5 operative sub_phase · `#2257` Engine-Cursor-Re-Base.
- **`faelle.status` eingefroren** — Engine schreibt `claims.operative_status`; 3 Views + 26 Status-Reader repointet. Status-Cursor lebt auf `claims`. **Konsistent mit dem Drop-Plan.**

### „b" Reader/Writer-Repoints (fall_id→claim_id, KEIN Drop, deploy-safe)
| Cluster | PR | Tabellen |
|---|---|---|
| Finance/Positionen | #2285 | schadenspositionen, forderungspositionen, zahlungspositionen, zahlungseingaenge |
| Call-Logs | #2290 | aircall_calls, calls, matelso_calls |
| email_log | #2294 | email_log (inkl. Dedup-Konsistenz: Writer+Dedup-Reader zusammen) |
| notification_events | #2297 | notification_events (emit.ts) |
| webhook_events | #2299 | webhook_events (+ subphase-resolver, phase-kritisch) |
Muster: interim `faelle.claim_id`-Lookup (P4-TODO threaden), **nil-uuid-Sentinel statt `''`** (empirisch `claim_id=''`→`22P02`).

### „a" fall_id-Drops (replay-safe, live verifiziert)
- `ki_gespraeche`, `fall_summaries` (#2270), `ai_usage_log` (#2284), `technische_probleme` (#2286), **Call-Logs** aircall_calls/calls/matelso_calls (#2303 + Hotfix **#2311**).
- Diese Tabellen haben **kein fall_id mehr** + claim_id; bleiben so.

### INZIDENT (02.06., behoben) — Lehrstück
1. **Live-Break:** der Call-Logs-Drop brach die Baseline-Funktion `link_lead_data_to_fall` (Lead→Fall-Konversion, `flow/[token]/actions.ts` + `convert-lead-to-fall.ts`) — sie machte `UPDATE calls SET fall_id`. **Sofort live gefixt** (Mig `20260602215635`, calls-Zeile → claim_id).
2. **Replay-Break:** `#2303` wurde **build-grün mit dem alten Commit früh-gemergt**, bevor mein Replay-Fix gepusht war → staging+main `20260602213715` ohne die 3 Policy-Repoints → Fresh-Replay scheitert (`DROP COLUMN calls.fall_id` blockt an 3 Baseline-RLS-Policies die `calls.fall_id` referenzieren: `calls.staff_fall_scoped` + `call_copilot_suggestions`/`call_transcription_utterances` `staff_fall_scoped`). **Hotfix `#2311`** (Policy-Repoints + Fn-Fix-File), via Fresh-Replay (#2308) **grün** validiert → auf staging; main via rel2311.

### Konsolidierung (heute Nacht)
- 9 gemergte cmm49-Worktrees entfernt (verbleibend, evtl. fremd: `cmm49-drop-readiness`, `cmm49-pc4-smoke-phasef-prep`, `cmm49-readersweep-sla`/handoff-eod, `cmm49-rls-claim-id`, + mein `cmm49-calls-replayfix`).
- Master-Plan = SSoT mit DONE-Stand + P0-Audit.

---

## 2 · Aktueller Schema-Stand (Wahrheit)
- **`claims` = SSoT** (operative_status + claim_id auf allen rekey'd Tabellen).
- **`faelle`:** 75 Rows · **278 Spalten** · **40 FK-Constraints** (child.fall_id→faelle.id) · 5 Views referenzieren es · 23 Funktionen · 21 Policies.
- **`v_claim_full`:** 120 Spalten — deckt nur **48/278** faelle-Spalten (das ist der P1-Blocker).
- Gedroppte fall_id-Spalten: ki_gespraeche, fall_summaries, ai_usage_log, technische_probleme, aircall_calls, calls, matelso_calls.

---

## 3 · Der Weg zum DROP — Plan + Audit-Zahlen
(Details: Master-Plan-File.)

- **P0 — Daten-Spalten-Migration (die echte Vorstufe):**
  - 230 Spalten fehlen in `v_claim_full`. Davon **86 schon auf claims(78)/vehicles(8)** → nur View erweitern (easy).
  - **144 faelle-only**, davon **~133 live-read** → **nach claims/vehicles migrieren + in v_claim_full** (der harte Kern, ~mehrere Sessions). **10 tot** (s. Plan-File-Liste) → ignorieren.
  - Cluster: halter_* (9), kunde_* (8), gegner_* (4), eskalation_tag_* (12), vs_*/vs_quote_* (~9), ruege_* (6), nachbesichtigung_* (10), sv_briefing_* (6), technische_stellungnahme_* (5), gutachten_*/anschlussschreiben_*/as_*/mietwagen_*/ki_*/fahrzeug_*/kennzeichen_*/source_*/zahlung_* + Einzelne.
- **P1 — 240 Reader** (`from('faelle')`, 189R/51W) → `v_claim_full`/`claims` (mechanisch ERST nach P0; deploy-safe, parallel-batchbar nach Domäne: api 49, gutachter 26, kunde 16, faelle 15, admin 15, lib/termine 12, lib/actions 10, lib/claims 8, …). 51 Writes → claims (Split-Logik `splitOrKeepFaelleUpdate` existiert).
- **P2 — 49 DB-Objekte faelle-frei:** 5 Views (faelle_kunde_view, faelle_sv_view, v_claim_full, v_claim_listing, v_faelle_mit_aktuellem_termin), 23 Funktionen (delete_fall_komplett claim-fähig; link_lead_data_to_fall Rest-Zeilen; Sync-Trigger entfallen), 21 Policies (`can_access_fall`→`can_access_claim`).
- **P3 — FK-Cutover + DROP:** 40 FK-Constraints droppen (`DROP CONSTRAINT`, Spalten bleiben verwaist) → letzte faelle-Refs → `DROP TABLE faelle` → **Post-Drop-Portal-Smoke** (Public/Admin/Kunde/SV) Pflicht.

---

## 4 · Harte Regeln / Lektionen (aus den Inzidenten — NICHT brechen)
1. **Drop-Migration NIE mergebar lassen ohne grünen Fresh-Replay.** Drop-PRs als **Draft** öffnen; erst nach grünem Preview auf **frischem** Branch (Edit-in-Place wird von der Preview geskippt!) auf „ready". `#2303` früh-gemergt = staging/main kaputt (#2261-Wiederholung).
2. **Baseline-Objekt-Dependency-Audit vor jedem faelle/Spalten-Touch:** nicht nur Objekte ON der Tabelle, sondern **cross-table-RLS-Policies** (`pg_policy` wo expr `\m<tbl>\M`) UND **Funktionen mit statischem SQL** (`pg_proc.prosrc`). `pol=0`-LIVE ≠ replay-safe (untracked Baseline-Repoints → Live-Drop geht, Replay scheitert).
3. **Typed-Client-Falle:** Files mit `SupabaseClient<Database>` type-checken Spaltennamen; `claim_id` fehlt in manchen generierten Types → `.eq('claim_id' as 'fall_id', …)` casten. bg-`tsc` kann Incremental-False-Green geben → bei Route/typed-Client-Änderungen `*.tsbuildinfo` löschen + clean tsc, oder CI vertrauen.
4. **Geteilte prod+staging-DB:** Schema-Drop trifft Prod sofort → erst Reader/DB-Objekte in **Prod (main)**, dann droppen.
5. **Fokussierte Session für P2+P3** (nicht zwischen Live-rel-Wellen). P0+P1 (deploy-safe) dürfen parallel laufen.

---

## 5 · 1:1 ANKNÜPFPUNKT (hier startet die nächste Session)
**Erster Schritt = P0, Cluster `halter_*` (9 Spalten) als Pilot:**
1. Prüfe je Spalte: existiert sie schon auf `claims` unter anderem Namen? (oft nicht → `ADD COLUMN`).
2. `ADD COLUMN` auf claims + Backfill aus faelle (`UPDATE claims c SET halter_x = f.halter_x FROM faelle f WHERE f.claim_id = c.id`) via Plugin-Migration.
3. Spalten in `v_claim_full` aufnehmen.
4. Die `from('faelle').select(... halter_* ...)`-Reader → `v_claim_full` (P1 für diesen Cluster).
5. tsc-Gate, PR gegen staging, **Drop NICHT** (kommt erst in P3).
→ Pilot validiert das P0→P1-Muster; dann die restlichen Cluster parallel via Subagenten.

**Branches/Files:**
- Plan: `kitta/cmm49-faelle-drop-master-plan` → `docs/superpowers/plans/2026-06-03-faelle-drop-master.md`
- Diese Handoff: `docs/03.06.2026/HANDOFF-cmm49-faelle-drop.md`
- Worktree zum Weiterarbeiten: neu off `origin/staging` (die alten sind aufgeräumt).

---

## 6 · Offene Fäden / Cleanup
- **rel2311** (Merge-Session) bringt den Hotfix nach main → **verifizieren dass main `213715` 3 Policy-Zeilen + `215635` hat** (war 22:25 noch unterwegs).
- Verbleibende cmm49-Worktrees (drop-readiness, pc4-smoke, readersweep-sla, rls-claim-id) — Ownership klären, ggf. entfernen.
- P4 (Kosmetik, optional, NICHT Pflicht): verwaiste child.fall_id-Spalten nach dem Table-Drop.

---

## 7 · Referenz — Migrationen (live appliziert)
`20260602125054` ki_gespraeche · `…133100` fall_summaries · `…144343` ai_usage_log · `…152928` technische_probleme · `…213715` call-logs-drop (+ Policy-Repoints) · `…215635` link_lead_data_to_fall-Fix.
