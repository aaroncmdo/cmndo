# HANDOFF — CMM-49 faelle-Drop (Session-EOD, 02.06.2026)

> **Für die nächste Session.** Diese Session hat (a) den pure-value Reader-Sweep weitergeführt, (b) PC-4 (RPCs drop-safe) gebaut, (c) den Phase-C-Plan + die **Drop-first-Entscheidung** verankert und (d) die Cross-Lane-Koordination aufgesetzt. Hier steht **alles** + **alle offenen Aufgaben** + die verbindlichen Docs (verlinkt + inhaltlich zusammengefasst).

---

## 0. Verbindliche Referenzen (IMMER zuerst lesen — verlinkt + Kern drin)

| Doc | Pfad / PR | Kern-Inhalt |
|---|---|---|
| **North-Star** (Datenmodell-SSoT) | `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` (#2118) | claims = God-Table-Dekomposition; Lifecycle = `claims.status` (Terminals) + Sub-Entity-State + **`v_claim_phase`** (abgeleitete main/sub_phase); EINE Engine; text+CHECK statt Enums; `can_access_claim`. `PHASE_VISIBLE_SECTIONS` = „letzter Live-fall.status-Consumer". |
| **Master-Plan** (faelle-Komplett-Removal) | `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md` (#2118) | Reststrecke **Phasen A–G**: A Heimat → B 5 Views → C Reader (~338) → D Writer (~40) → E fall_id-Tod + Route → F Trigger/Fn/29 RLS → **G DROP** (Aaron-gated). |
| **Phase-C-Plan** (fall_id-Tod, Drop-first) | `docs/superpowers/plans/2026-06-01-cmm49-phase-c-fall-id-tod.md` (#2204) | **2 Layer:** DROP-brechend (`.from('faelle')`-Reads + Views + RPCs) vs. Cleanliness (~250 fall_id-Filter + ~90 Links **überleben** den Drop, CASCADE droppt nur die FK, nicht die uuid-Spalte). PC-1..PC-7-Decomposition + Koordinations-Map. **Drop-first entschieden (§8).** |
| **Drop-Runway Live-Revalidierung** | `docs/01.06.2026/faelle-drop-runway-live-revalidation.md` (#2184) | de-drifteter Live-Stand: 75 Rows / 47 FKs / 5 Views / 421 `.from('faelle')`. |
| **Vorgänger-Handoff** (Runway) | `docs/01.06.2026/HANDOFF-cmm49-drop-runway.md` (#2188, Branch `kitta/cmm49-handoff`) | Reader-Sweep-4-Schritt-Verify-Pattern §4, Lane-Map §7. |
| **b″-Entscheidung** | `docs/01.06.2026/T1.2-b-cutover-decision.md` (#2176) | Warum b″ in den Drop gefaltet ist + Engine-Cursor-Re-Base-Design. |
| **Operative-States-Plan** (§D3) | `docs/superpowers/plans/2026-05-31-track1-2-operative-states-rehoming.md` | b″/CMM-74 Engine-Umbau-Design. |
| **b″-Contract** (diese Session) | Linear-Kommentar auf **CMM-74** (02.06.) | Die 5 sub_phase die die Termin-Engine-Lane liefern muss + Reader-Tail + Writer-Target-Zeilen. |

**Reader-Sweep-Pattern (VERBINDLICH, pro Brick):** 1) Kollisions-Check (`git log --all --since` + offene Branches), 2) Daten-Äquivalenz live (`execute_sql`, EXCEPT-0/0 — Achtung Spalten-Diskrepanzen, s. §5), 3) PostgREST-Embed-FK adversarial (`pg_constraint`), 4) `npx tsc --noEmit`. Branch `kitta/cmm49-readersweep-<bereich>` **off origin/staging**, PR gegen staging.

---

## 1. Aaron-Entscheidung 01.06.: **DROP-FIRST**

Kritischer Pfad zum `DROP TABLE faelle CASCADE` ist **schmal**:
```
DROP  ⇠  {Reader-Sweep komplett: 0 .from('faelle')}  ∥  {CMM-66: 5 Views faelle-frei}
         ∥  {PC-4: 2 RPCs drop-safe}  ∥  {v_claim_listing faelle-frei}
```
Die **~250 Sub-Entity-`fall_id`-Filter + ~90 Identity-Links fallen RAUS** (überleben den Drop; CASCADE droppt nur die FK-Constraint, nicht die uuid-Spalte) → Boy-Scout NACH dem Drop. **ABER** der Reader-Sweep-Tail ist selbst teils gegated (s. §3d).

---

## 2. Was diese Session geliefert hat (4 PRs offen gegen staging — NICHT gemerged)

| PR | Inhalt | Verify |
|---|---|---|
| **#2195** | Reader-Sweep: SLA (`tracker`/`blocker-detection`/`kanzlei-breach`) off faelle→claims | tsc · EXCEPT 0/0 · PostgREST-Embed-Smoke |
| **#2200** | Reader-Sweep: `send-reminders`-Cron (schadenort via `termin.claim_id`) | tsc · EXCEPT 0/0 |
| **#2210** | **PC-4** RPCs drop-safe: `delete_fall_komplett` 2-arg + claim-löschend + **Security-Hotfix** (anon/authenticated REVOKE); `link_lead_data_to_fall` schon safe | tsc · ACL service_role-only · Funktions-Smoke (random-UUID) |
| **#2204** | Phase-C-Decomposition-Plan + Drop-first | docs |

**Migrationen (Plugin, applied+getrackt auf der geteilten DB):** `20260601224517` (delete_fall_komplett 2-arg) + `20260601224557` (Revoke anon/auth). Files == recorded version (kein Twin-Drift).

**Koordination:** Drop-Dependency in **CMM-74/CMM-66/CMM-63** verankert; **b″-Contract** auf CMM-74; Session-Kollisions-Map an Aaron.

---

## 3. ⚠️ ALLE OFFENEN AUFGABEN

### 3a. Kritischer Pfad zum DROP (must-do VOR dem DROP)
1. **Reader-Sweep komplett** — 0 `.from('faelle')`-Reads. Pure-value ✅ (#2195/#2200); Tail offen (§3d).
2. **CMM-66** — die 5 Views faelle-frei (inkl. `v_claim_listing`). *In Progress.*
3. **PC-4 RPCs** — ✅ (#2210). **Offen:** destruktiver Smoke (§3e).
4. **CMM-74 / b″** — Engine-Write-Stopp. *Backlog, gated.* (§3b)
5. **Phase F** (Master-Plan) — 47 FKs entfernen + 29 RLS-Policies + tote Trigger (`trg_sync_*`).
6. **Phase G / CMM-49** — `DROP TABLE faelle CASCADE` + Legacy-Spalten (`leads.konvertiert_zu_fall_id` etc.). **Aaron-gated**, voller Portal-Smoke (Kunde/SV/KB/Admin/Kanzlei).

### 3b. CMM-44 offene Tickets (live-Status 02.06.)
| Ticket | Was | Status | Gate |
|---|---|---|---|
| **CMM-49** | SP-L Phase 5+6: Sync-Trigger-Drop + DROP TABLE faelle | In Progress | = der Master |
| **CMM-74** | b″ Engine `faelle.status`-Write-Stopp (state-machine.ts) | **Backlog** | **Termin-Engine sub_phase** (Contract auf CMM-74) |
| **CMM-66** | 5 Views faelle-frei (Teil 2) | **In Progress** | teils CMM-64 (done) — jetzt baubar |
| **CMM-67** | SP-C3 Halter-Snapshot `faelle`→`claim_parties` (`ist_fahrzeughalter`/`firma_name`/`ust_id`) | **Backlog** | Daten sparse |
| **CMM-51** | gutachten Sub-Table fertigstellen (30+8 Felder) | **In Progress** | andere Session (`aar-cluster-fg-gutachten`) |
| *Done:* | CMM-46/47/48/50/52/61/62/63/64/65/69/70/71/72/73 | Done | — |
| *Canceled:* | CMM-45 (fall_typ-Drop — Spalten aktiv) | Canceled | — |

### 3c. Phase-C (fall_id-Tod) PC-Decomposition (Plan #2204)
| PC | Was | Status |
|---|---|---|
| **PC-1** | Admin-Route `/faelle/[id]` accept-both + canonicalize (1:1 vom Kunde-CMM-63-Muster) | offen, **939-koordiniert**; bite-sized im Plan. = CMM-28-nah |
| **PC-1b** | `/kunde/nachbesichtigung/[fall_id]` accept-both | offen |
| **PC-2** | ~250 Sub-Entity-`.eq('fall_id')`→`claim_id` (per Tabelle, coverage-gestaffelt) | **Cleanliness, post-drop OK** |
| **PC-3** | ~90 Identity-Links `/faelle/${fallId}`→`claimId` | offen, **gated auf PC-1**, post-drop OK |
| **PC-4** | 2 RPCs drop-safe | ✅ #2210 (Smoke offen) |
| **PC-5** | `v_claim_listing` faelle-frei | = CMM-66 |
| **PC-6** | Insert-Writer `fall_id:`→`claim_id:` (additiv) | Cleanliness |
| **PC-7** | `ALTER TABLE <t> DROP COLUMN fall_id` je Tabelle + **das 1-arg `delete_fall_komplett` entfernen** | ganz am Ende |

### 3d. Reader-Sweep-Tail (die verbliebenen `.from('faelle')`-Reads, nach Gate)
- **kunde_id-Reader** → Home = `claims.geschaedigter_user_id`/`claim_parties` (CMM-63-Core done). **Caveat: 1-Row-Mismatch** faelle.kunde_id ≠ geschaedigter_user_id (nicht 0-äquivalent — pro Read prüfen). Files: `notifications/fan-out.ts`, `sla/kanzlei-mahnungen.ts` (`sendKundenReminderWegenKanzlei`), `kunde/termin/*` (absagen/verschieben/ics/weiterleiten), termin-Crons `kb-termin-reminder(-1h)`/`termin-erinnerungen`/`termin-morgen-erinnerung`. **Achtung: termin-Crons = Termin-Engine-Fläche.**
- **status-Reader** → gated auf **CMM-74/b″** (sub_phase). Files: `cron/case-billing-batch`, `cron/release-makler-provisionen`, `api/email/send`, `api/gutachter/search` (×3), `sla/completion-signals.ts`.
- **identity-Reader** (geben `faelle.id` als fall_id aus) → gated auf **PC-1**. Files: `analytics/conversion|finance|sv-performance`, `finance/abrechnungen-generator`, `chat/fall-lookup`, `chat/inbox-threads`, `gutachter/search`. **analytics komplett deferred** (Drill-Down-Links `/faelle/[id]`).
- **embed-B-Crons** (`re-termin-eskalation`, `embed-b-termin-resolution`) → **939-embed-B-Kollision** (Session aktiv) → gemieden.
- **pflichtdokumente-reminder** → Source `v_claim_full` (exponiert fall_id), entangled → später.
- **Lektion:** „clean aussehende" Reads scheitern oft am Verify (claims.lead_id 2/76-Delta, kunde_id 1-Delta, Kardinalität 75-vs-76). Immer EXCEPT messen.

### 3e. Merge + Smoke (offen)
- **4 PRs mergen** (Merge-Session): #2195, #2200, #2210, #2204.
- **PC-4 destruktiver Smoke:** seed-Test-Fall auf **Staging** löschen + verifizieren (alle Sub-Entities + Claim weg, keine Fremd-Rows) — **NICHT blind Prod** (geteilte DB). Nach #2210-Merge.

---

## 4. Koordinations-Map (Lanes — welche Session ownt was)
| Geteilte Fläche | Owner-Lane / Branch | Relevanz |
|---|---|---|
| **`v_claim_phase` + termine** (b″-Prereq: 5 sub_phase) | **Termin-Engine** `kitta/unisone-termin-engine(-p2-1b)` (aktiv, P2.1b) | 🔴 b″-Blocker |
| **`state-machine.ts`** (b″ Engine-Cutover, ⚠️SM Single-Toucher) | **Track-1** `kitta/track1-2-operative-rehoming` (b′ #2151) | 🔴 b″-Owner |
| **nachrichten / Chat** (PC-2) | **Chat-Inbox** `kitta/chat-inbox-threads` (#2179) | 🟡 |
| **Fallakte-Route + parteien** (PC-1, CMM-67) | **939-Monika** `kitta/aar-939-monika-embed` | 🟡 |
| **embed-Crons** | **939-embed-B** `kitta/aar-939-embed-b-cascade-6b` | 🟡 |
| **5 Views** (PC-5) | **CMM-66** `kitta/cmm-66-view-rebase` | 🟢 (Ticket-verankert) |
| **gutachten Sub-Table** (CMM-51) | `kitta/aar-cluster-fg-gutachten` | 🟢 |
**Regel:** vor Touch geteilter Flächen (v_claim_phase, state-machine.ts, Fallakte-Route, parteien, nachrichten) Kollisions-Check + Abstimmung über Aaron. Marker unter `…/.claude/projects/…/memory/project_cmm49_readersweep_sla.md`.

---

## 5. Verbindliche Lektionen (diese Session)
- **DROP CASCADE droppt FK, nicht Spalte** → ~250 fall_id-Filter überleben → Drop-first-Hebel.
- **Coverage-%-Falle:** niedrige claim_id-Coverage ≠ gated; maßgeblich `fall_id-set-but-claim_id-null = 0` (Orphans egal). Pro Tabelle messen.
- **claims.lead_id (2/76) + kunde_id (1/76) ≠ faelle** → lead/kunde-Identity-Reads NICHT 0-äquivalent; EXCEPT prüfen.
- **SECDEF-Funktionen:** neue Funktionen bekommen via Supabase-Default-Privileges `EXECUTE` für anon+authenticated; `REVOKE FROM PUBLIC` reicht NICHT → immer explizit `REVOKE … FROM anon, authenticated`. ([[feedback_rls_function_grants]])
- **faelle.claim_id ist ON DELETE RESTRICT** → bei Lösch-Logik faelle VOR claim löschen.
- **Write-Tool-Pfad-Falle:** Write schrieb docs/Migrationen in den HAUPT-Checkout statt Worktree → immer Worktree-Absolutpfad (`…/.claude/worktrees/<wt>/…`) + nach Write `ls` prüfen. ([[feedback_write_tool_content_artifact]])

---

## 6. Einstieg (TL;DR — was du JETZT tust)
1. North-Star + Master-Plan + Phase-C-Plan (#2204) + CMM-74-b″-Contract lesen; **live** prüfen (Labels lügen).
2. **Wenn Termin-Engine die 5 sub_phase geliefert hat → b″/CMM-74** (1 koordinierter PR, Cursor-Re-Base + Reader-Tail-status + Write-Stopp; Prod-Breaker-Klasse, voller SLA/Notification-Smoke).
3. **Parallel sweepbar (deine Lane, ohne Trampeln):** weitere pure-value Reader (Source mit `fall_id-set-but-claim_id-null = 0`, EXCEPT-0/0) — aber die meisten verbleibenden sind gated (§3d).
4. **CMM-66 Views** (eigene Lane) + **PC-1** (939) + **CMM-67 Halter** koordiniert.
5. **DROP = Aaron-Go.** Davor: Phase F (FKs/RLS/Trigger) + voller Portal-Smoke.
6. Nichts Geteiltes ohne Kollisions-Check + Abstimmung (§4).
