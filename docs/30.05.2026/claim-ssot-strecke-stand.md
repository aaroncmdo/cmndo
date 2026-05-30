# Claim-SSoT- / faelle-Drop-Strecke — Bestandsaufnahme & Anweisung nächste Session

**Datum:** 2026-05-30 (spät) · **Erstellt von:** CMM-50.3b-Session
**Methode:** Read-only Multi-Agent-Audit (Workflow `wf_d59a920e-a80`, 4 Achsen + Synthese, alles live gegen Prod-Schema `paizkjajbuxxksdoycev` gemessen, 30.05.)
**Anlass:** Revalidierung des Gesamtstands vs. Master-Plan `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` (2 Wochen alt, Zahlen stale).

---

## ⏭ ANWEISUNG NÄCHSTE SESSION — START HIER

**0. Orientieren (Pflicht, weil Schema in <1 Tag veraltet — `feedback_information_schema_check`):**
- Dieses Doc + Memory `project_cmm_phase_24_finishing` + `project_cmm50_vehicles_scoping` lesen.
- Zahlen unten **live gegen `information_schema` re-messen** bevor du irgendwas migrierst. Andere Sessions droppen/adden parallel.
- **Eigener Worktree** von `origin/staging` (`node scripts/new-session-worktree.mjs <slug> staging`) — die AAR-939-Sessions arbeiten an `claims`/Lifecycle, nicht trampeln.

**1. CMM-62 zuerst (klein, entsperrt):** Cardentity-Output (`api/cardentity/typ-a|typ-b`, `enrich-fahrzeug`) + Vorschäden-Cluster (~11 Spalten) — Heimat entscheiden: eigene `vorschaeden`-Tabelle (existiert NICHT) vs. `gutachten`-Erweiterung vs. `claims`. Reines Audit/Decision-Ticket. **Aaron-Input evtl. nötig** (Konsolidierung Cardentity↔Gutachten-Werte). Entsperrt CMM-64.

**2. Haupthebel — Phase 4.2 View-Re-Base (NEU als Ticket anlegen, Tracking-Lücke!):** Die **2 echt-lesenden Views `v_claim_full` + `v_claim_listing`** faelle-frei machen. Sie ziehen **78 View-Reads in 64 Files automatisch mit** — maximaler Hebel ohne Caller-Anfassung.
- **Inkrementell** (wie CMM-50): pro Spalte repointen, deren Heimat schon existiert (z.B. `f.sv_id` → `c.sv_id`, CMM-60 done), COALESCE-Fallback / faelle-Read lassen für noch-nicht-migrierte Spalten (vorschaden_/kunde_id/etc.).
- **Pattern:** server-seitiger `replace()`-Transform der Live-Viewdef ODER literal — Aaron-Präferenz „alles aus der DB" → **server-seitiger Transform** (siehe Migration `20260530205453` als Vorlage). **EXCEPT-Diff 0/0 vor Apply + Smoke** pro View.
- v_claim_full liest heute noch echt aus faelle: u.a. `f.sv_id`(→c.sv_id ready), `f.kunde_id`(→ noch nicht auf claims, s. Schritt 3), `f.organisation_id/dispatch_id`, `f.gegner_*`, `f.hat_vorschaeden/vorschaden_*`(→CMM-64), `f.cardentity_abfrage_am`. Repoint was ready, dokumentiere den Rest als Gap.

**3. Die 5 echten-Daten-faelle-only-Domänen additiv auf `claims` (klein-mittel):** `kunde_id` (70/74), `kunde_telefon`-Cluster (72/74), `source_channel` (70/74), `mandatsnummer` (12/74 — liegt evtl. schon auf `kanzlei_faelle`!), `fin_vin` (1/74 — Fahrzeug → `vehicles`, nicht claims!), `besichtigungsort_*` (1/74 — liegt schon auf `gutachter_termine`!). **Erst Diff-Mapping** (wo existiert die Spalte schon?), dann nur die echt fehlenden adden + backfillen. Speziell `kunde_id`: prüfen ob via `leads`/`claim_parties` schon kanonisch verknüpft → ggf. redundant statt migrieren.

**4. CMM-67 (klein):** Halter-Snapshot (`ist_fahrzeughalter`/`firma_name`/`ust_id`) faelle→`claim_parties` (Ziel-Spalten existieren schon dort) — Edit-Writer relocaten + Reader-Sweep.

**NICHT jetzt (Begründung in §8):** (1) `DROP TABLE faelle` (417 Zugriffe blockieren). (2) Die **41 FK-Re-Keys** starten — braucht erst Aarons Architektur-Entscheidung (§7.1). (3) Sync-Trigger droppen (claim_id-Ableitung noch nicht writer-getragen). (4) Lifecycle-Writer anfassen die mit AAR-939-Sessions kollidieren.

---

## 1 · Gesamtstand — Plan-Phasen 0–6 (live 30.05.)

| Phase | Status | Begründung |
|---|---|---|
| 0 Stabilisieren | ✅ done | Alle 74 faelle-Rows haben `claim_id` (saubere 1:1-Brücke); kein breiter Spalten-Mirror-Trigger. |
| 1 Audit (6 Teil-Audits) | 🟡 teilweise | 5/6 done (Mapping/Lifecycle/Rendering/RLS/Routen-Hygiene). **CMM-62** (Cardentity/Vorschäden-Heimat) offen, gated CMM-64. |
| 2 `gutachter_termine`→claim_id | ✅ done | `claim_id` writer-getragen (CMM-58/SP-G2). `fall_id` nur noch Legacy. |
| 3 Writer-Migration (CMM-48) | 🟡 teilweise | `splitOrKeepFaelleUpdate()` etabliert (~14 Writer). Aber 41/47 FK-Tabellen nur `fall_id`; ~59 Write-Sites teils faelle-nativ. |
| 4 Reader-Migration | 🟡 teilweise | Domänen-Reads fast tot (~9 echte); 78 View-Reads wandern auto; **96 Bridge-Reads** offen; 2 Views lesen noch echt aus faelle. Phase 4.2/4.3 **ungetrackt**. |
| 5 Sync-Trigger weg | 🔴 offen | Live aktiv: sv_id-Sync (1+1) + claim_id-Ableitung + 4 Workflow-Trigger ON faelle. |
| 6 `DROP TABLE faelle CASCADE` | 🔴 offen | CMM-49 nie begonnen. 47 FK + 5 Views + 6 Trigger + 417 Code-Zugriffe blockieren. |

## 2 · Zwei Korrekturen zur 16.05-Plan-Annahme

1. **faelle ist datenseitig fast leer.** 278 Spalten = 93 Sync-Dups + 185 faelle-only. Von den 185 haben **nur 7 echte Daten** (kunde_id, kunde_telefon, source_channel, mandatsnummer, sv_briefing_text, besichtigungsort_adresse, fin_vin). Alle großen Cluster (fahrzeug_/halter_/vs_/gutachten_/eskalation_/gegner_/ruege_/ki_/cardentity_/lexdrive_/zahlung_) = **0-Coverage Drop-Kandidaten** (SP-A..L hat sie auf Sub-Tables gespiegelt). ⚠️ **74-Row-Testset — vor Drop gegen echten Prod-Datensatz re-verifizieren.**
2. **Der dominante physische Block sind NICHT Spalten, sondern FKs:** **41 von 47 Tabellen** hängen noch ausschließlich an `faelle.id`/`fall_id` (tasks, timeline, nachrichten, pflichtdokumente, reklamationen, parteien, gutachter_abrechnungen …). Nur 6 haben schon `claim_id` (auftraege, fall_dokumente, gutachter_termine, kanzlei_faelle, phase_transitions, timeline). Re-Key = `claim_id` ADD + Backfill + FK-Swap × 41.
3. Die alte „2+2 breite Sync-Trigger"-Angst ist **falsch** — live syncen die Trigger nur noch `sv_id` (1+1). Master-Ticket-Annahme stale.

## 3 · Lifecycle-Modell
Konzeptionell **claims-zentrisch** (4 Hauptphasen / 16 Subphasen / 6 terminale Status; `v_claim_phase` + Terminal-Vokabular MP-6/MP-8 live). Praktisch noch **dreigeteilt**: SV-Portal-Resolver liest noch `faelle.status` (3 Phasen fall-getrieben), Dispatch nutzt `v_claim_phase` nicht, Fall-Status-Maschine (`lib/faelle/state-machine.ts`, 43 Stellen/17 Files) noch faelle-gekoppelt. **Offene Grundsatzfragen (s. §7.2) — werden parallel von den AAR-939-Sessions tangiert, nicht alleine entscheiden.**

## 4 · Linear-Stand
- **CMM-44** Master = In Progress (Urgent). **CMM-49** (faelle-DROP/SP-L) = Backlog, `startedAt=null`.
- CMM-49 blockedBy: **done** = CMM-61, CMM-63, CMM-65, CMM-66, CMM-50 (heute). **offen** = CMM-67 (Halter), CMM-64 (Vorschäden) + dessen Vorlauf CMM-62 (Cardentity-Audit).
- **Tracking-Lücke:** Phase 4.2/4.3 (4 schwere Views faelle-frei) hat **kein eigenes offenes Ticket** (CMM-66 = nur Teil 1, Done). → **In dieser Session neu angelegt:** siehe §unten / Linear.
- CMM-44-Description war stale (2+2-Trigger, kunde_id-61x) → **in dieser Session revalidiert**.

## 5 · Kritischer Pfad zu `DROP TABLE faelle`
1. **CMM-62** Cardentity/Vorschäden-Heimat entscheiden (klein, Audit) → entsperrt CMM-64.
2. **CMM-67** (Halter→claim_parties) + **CMM-64** (Vorschäden, `vorschaeden`-Tabelle anlegen+backfill) — letzte echte Spalten-Domänen.
3. **5 echte-Daten-Domänen** auf claims/Sub-Table (Diff-Mapping zuerst, viele liegen evtl. schon).
4. **Phase 4.2/4.3** — 4–5 Views (`v_claim_full`, `v_claim_listing`, + die 3 schon-fast-freien) faelle-frei (inkrementell, CMM-50-Pattern, EXCEPT-0/0 + Smoke). **Größter Reader-Hebel.**
5. **FK-Architektur-Entscheidung (§7.1)** treffen + ausführen: 41 fall_id-Tabellen re-keyen (Batch-Migration, Generator-Pattern). **Dominierender physischer Block.**
6. Restliche **96 Bridge-Reads** + ~9 Domänen-Reads + ~59 Write-Sites entkoppeln bis 0 Code `.from('faelle')` fasst.
7. `convert-lead-to-claim.ts` Vollinsert + `buildFallInsertFromLead` auf Assignment-Row reduzieren/abschaffen.
8. **Phase 5** — sv_id-Sync (1+1) + claim_id-Ableitung + 4 Workflow-Trigger droppen/umhängen.
9. **Phase 6** — `DROP TABLE faelle CASCADE` + Legacy (`leads.konvertiert_zu_fall_id` etc.). Voller Portal-Smoke.

## 6 · Größte Hebel
- **5 faelle-Views faelle-frei** → migriert 78 View-Reads in 64 Files automatisch (nur 2 lesen überhaupt noch echt aus faelle).
- **EINE Architektur-Entscheidung** für die 96 Bridge-Reads (fallId→claim_id Ziel-Anker) → Long-Tail wird mechanisch.
- **`splitOrKeepFaelleUpdate()`** (`lib/faelle/claim-duplicate-columns.ts`) auf die ~59 Writes ausrollen — Pattern existiert.
- **41 FK-Re-Keys als EINE Batch-Migration** mit Generator-Pattern statt 41 PRs.
- **178 0-Coverage-Spalten als Block im DROP-CASCADE** mitnehmen (nach Prod-Verify), nicht einzeln migrieren.

## 7 · Offene Entscheidungen (brauchen Aaron)
1. **FK-Architektur:** Die 41 `fall_id`-Tabellen — auf `claim_id` re-keyen (echter Drop, Master-Plan-Linie) ODER eine schlanke `faelle`-Assignment-Bridge behalten (alte verworfene Linie)? Der Master-Plan sagt `DROP CASCADE` — das zerstört die FKs. **Vor den 41 Re-Keys klären, sonst 41 Tabellen in die falsche Richtung gebaut.**
2. **Lifecycle:** Service-Typ = verkürzter Lifecycle (`nur_gutachter` ohne QC/Kanzlei)? 4 vs. 10 Phasen kanonisch? SV-Sicht eigenständig oder vereinheitlicht? Monika/embed-Leads als Lead-only ohne Claim? → tangiert AAR-939.

## 8 · Was NICHT jetzt
- **`DROP TABLE faelle`** — 417 Zugriffe + 41 FK + 6 Trigger + 5 Views; jeder Drop-Versuch crasht.
- **41 FK-Re-Keys** vor §7.1-Entscheidung.
- **Sync-Trigger droppen** solange claim_id-Ableitung nicht writer-getragen.
- **claims/Lifecycle-Writer** die mit AAR-939 (embed-to-lead/monika) kollidieren — Merge-Reihenfolge klären.

## 9 · Caveats
- Coverage-Zahlen = **74-Row-Testset** (Staging/Test). Auf Prod können mehr faelle-only-Spalten echte Daten halten → **0-Coverage-Inventur vor jedem Drop gegen echten Prod-Stand wiederholen.**
- Pro 0-Coverage-Cluster gegen Sub-Table-Schema (SP-A..L) abgleichen, dass die Daten wirklich woanders leben (kein Datenverlust).
- `v_claim_full` liest CMM-50-Fahrzeug schon aus `vehicles`, aber **noch `JOIN faelle`** für Nicht-Fahrzeug-Spalten — Reader sind erst „scheinbar" entkoppelt bis die View faelle-frei ist.

## 10 · Quellen
- Master-Plan: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` (Phasen-Skelett, Zahlen stale).
- Phase-1-Audits: `claim-rendering-vertikal-audit.md`, `claim-rls-audit.md`, `claim-routen-hygiene-audit.md`, `cmm-48-writer-stellen-audit.md` (alle 16.05.).
- CMM-50 (gerade fertig): PR #2077 + `docs/30.05.2026/cmm50-strecke-handoff.md` + Migration `20260530205453`.
- Audit-Workflow: `wf_d59a920e-a80` (5 Agenten, Befunde in der Session-Transcript).
- Memory: `project_cmm_phase_24_finishing` (Strecke-Status), `project_cmm50_vehicles_scoping`, `feedback_information_schema_check`, `feedback_migration_repair_twin_drift`.
