# CMM-44 — Vollständigkeits-Re-Validierung der Claim-SSoT-Strecke bis Phase 6

**Datum:** 2026-05-24 (max-effort) · **Frage (Aaron):** Ist der gesamte claims-as-SSoT-Plan bis Phase 6 vollständig abgearbeitet?
**Methode:** Live-Grep der gesamten `src/` (literal `from('faelle')`) + Live-PostgREST (faelle-Spalten + View-Existenz, service-role). CLI-`db query`-Introspektion (pg_catalog) aus dem Worktree blockiert (nicht supabase-linked, kein DB-PW) → Trigger/FK-Detail aus VALIDATED-Inventar 24.05 §V/§8 (seither unverändert). `origin/staging` = #1642 (4 Commits voraus seit Branch-Base, keiner berührt faelle/claims).

---

## 0 · Verdikt (Executive)

**NEIN — die Strecke ist NICHT Phase-6-reif. Sie steht im Kern am ANFANG von Phase 4 (Reader/Writer-Migration) für die Masse der Portale.** Die schema-additive Hälfte der „DONE"-Slices (SP-A/B/D/G/H/I/J) ist gelaufen (Daten liegen auf den Sub-Tabellen), aber der **Code liest/schreibt weiterhin überwiegend `faelle`**. Gemessen:

| Phase-6-Blocker (live 2026-05-24) | Stand |
|---|---:|
| **`from('faelle')` Code-Call-Sites (gesamt src/)** | **449** |
| davon **Writes** (`.update/.insert/.upsert`) | **85** |
| **faelle-basierte Views** (FROM faelle, sterben bei DROP CASCADE) | **6** (alle live HTTP 200) |
| **Code-Consumer dieser Views** | **44** |
| **`faelle` Spalten (Tabelle lebt)** | **278** |
| **Sync-Trigger** (Phase 5 zu droppen) | vorhanden (§8 24.05) |
| **FK-Dependents** (`*.fall_id → faelle`) | zahlreich (timeline/tasks/pflichtdokumente/fall_dokumente/matelso_calls …) |

Jede dieser 449 `from('faelle')`-Stellen ist ein echter Top-Level-Tabellenzugriff (kein False-Positive möglich auf `from('faelle')` selbst) und bricht bei `DROP TABLE faelle CASCADE`. **Gap zu Phase 6 = ~449 Code-Sites + 6 Views (+44 Consumer) + Sync-Trigger + FK-Repoints.**

> Nuance: Ein Teil der 449 ist **legitim transitional** (z.B. `fahrzeug_*`-Reads, wo faelle HEUTE noch SSoT ist weil SP-E offen — „korrekt heute, Breaker bei DROP"). Es sind also nicht 449 „Bugs", aber alle 449 müssen vor SP-L weg.

---

## 1 · Code-Surface nach Bereich (live)

| Bereich | `from('faelle')` | Writes | Haupt-Bucket / offenes Ticket |
|---|---:|---:|---|
| `src/lib` | **192** | 35 | querschnitt (kanzlei-wunsch 16, termin-actions 13, lexdrive 10, dispatch-fall 9, email/google 7, analytics/finance, dokumente, makler …) |
| `src/app/api` | **73** | 14 | crons/webhooks/ocr (ocr-fahrzeugschein/gutachten/trigger → vehicles+gutachten+cp; stripe-webhook provision; sv-zuweisung; seed) |
| `src/app/gutachter` (SV) | **48** | 4 | SV-Portal — vehicles (SP-E) + Termine + Fallakte |
| `src/app/faelle` (shared Admin/SV/KB-Fallakte) | **46** | 14 | querschnitt aller Domänen (core/stammdaten/prozess/kanzlei-paket/eskalation/filmcheck) |
| `src/app/kunde` | **36** | 6 | **CMM-63** (kunde_id/parteien) — 3 schon erledigt (39→36) |
| `src/app/admin` | **24** | 4 | abrechnungen/anlegen/sachverstaendige-karte + finance |
| `src/app/flow/[token]` | 12 | 1 | Magic-Link (kunde_id-Write bei Konversion) |
| `src/components` | 6 | 0 | VorOrtPanel u.a. |
| `src/app/dispatch` | 3 | 0 | — |
| `src/app/kanzlei` | 2 | 0 | — |

**Konzentration (Top-Files):** `lib/kanzlei-wunsch/actions.ts` 16 · `gutachter/fall/[id]/actions.ts` 14 · `lib/actions/termin-actions.ts` 13 · `flow/[token]/actions.ts` 12 · `lib/lexdrive/process-event.ts` 10 · `lib/actions/dispatch-fall-actions.ts` 9 · `kunde/onboarding/actions.ts` 9.

---

## 2 · Phasen-Status (Strategie §4)

| Phase | Inhalt | Stand |
|---|---|---|
| **0 Stabilisieren** | CMM-53/54/59/60 | ✅ done |
| **1 Audits (6)** | Mapping/Lifecycle/Rendering/RLS/Routen ✅ · **Cardentity (CMM-62)** | ⚠️ 5/6 — Cardentity OFFEN |
| **2 gutachter_termine.claim_id** | CMM-58 / SP-G2 | ✅ done |
| **3 Writer-Migration** | CMM-48 (41 Dup-Writer) ✅ · **Orphan-Writer (zahlungsweg/bank/honorar/provision/updated_at) CMM-65** | ⚠️ ~85 faelle-Writes verbleiben |
| **4 Reader-Migration** | pro Portal Reader-Sweep | ❌ **KERN-ARBEIT — ~364 Reads + 44 View-Consumer offen.** Nur SP-A/B/D/G/H/I/J schema-additiv + Teil-Sweeps. CMM-63 gestartet (3 Sites) |
| **5 Sync-Trigger drop** | trg_sync_faelle↔claims | ❌ nicht gestartet (Trigger leben) |
| **6 DROP TABLE faelle CASCADE** | SP-L / CMM-49 | ❌ blockiert auf 4+5 + 6 Views (CMM-66 T2) |

---

## 3 · Gap → offene Tickets (Bucket-Zuordnung der 449)

- **CMM-63 SP-C** (kunde_id/parteien): kunde 36 + kunde_id-Konsumenten in lib (whatsapp/notifications/termin-actions/crons) → IN ARBEIT (3 done).
- **CMM-50 SP-E** (vehicles `fahrzeug_*`): ~55 (gutachter, kunde/termine, ocr, components/VorOrtPanel) → PENDING (Tabelle existiert).
- **CMM-65** (Orphan Finanz/Timestamp/zahlungsweg): ~91 timestamps + honorar/provision/zahlungsweg → PENDING.
- **CMM-64 SP-F** (vorschäden): ~9 → BLOCKED auf CMM-62 (Cardentity-Heimat).
- **CMM-61** (DONE-Slice Reader-Nachzug): claims-business ~21, kanzlei 7, gutachten 2, gutachter_termine 5 → offen.
- **CMM-66 T2** (6 Views FROM faelle → claims re-basen): OFFEN (T1 mandatsnummer ✅).
- **Shared Fallakte `app/faelle` (46) + `lib` (192):** querschnitt über ALLE Domänen — größte Konzentration, hängt an mehreren Buckets gleichzeitig (Admin/SV/KB-Fallakte liest alles). Kein eigenes Ticket — verteilt.
- **Seed/Test** (~33, dev-only) + **flow/[token]** (12, Magic-Link) → niedrig/eigene Behandlung.

---

## 4 · Was sich seit der 24.05-Revalidierung (#1631/#1636) geändert hat

- **CMM-66 T1** (#1638): `v_claim_full.mandatsnummer` Spalten-Repoint (View bleibt FROM claims LEFT JOIN faelle).
- **CMM-63** (dieser Branch): 3 kunde-Ownership-Sites auf claim_parties-Helper → −3 `from('faelle')` (kunde 39→36).
- **Sonst:** keine Code-Surface-Reduktion. Die 6 Views, 278 faelle-Spalten, Sync-Trigger, FK-Dependents **unverändert** (live bestätigt: faelle 278 Spalten, alle 6 Views HTTP 200).

**Fazit:** Die 23.05-Kernaussage gilt unverändert und ist jetzt am literal-`from('faelle')`-Maß quantifiziert: **~449 Code-Sites + 6 Views + Sync-Trigger stehen zwischen heute und `DROP TABLE faelle`.** Die additive Schema-Arbeit ist weit, die Code-Umstellung (Phase 4) erst angefangen. Reihenfolge bleibt §5 der Revalidierung: DONE-Slice-Sweeps schließen → Orphan-Cluster (CMM-65) + SP-C/E/F → Views (CMM-66 T2) → Sync-Trigger (Phase 5) → SP-L DROP.
