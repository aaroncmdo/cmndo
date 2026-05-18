# Handoff — CMM-44 `faelle`-Drop, Strecke SP-B..L (nach SP-A)

**Datum:** 2026-05-17 · **Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Vorige Session:** Phase-1 Dekomposition + Sub-Projekt SP-A komplett.
**Memory:** [[project_cmm44_faelle_dekomposition]] ist auf Stand — zuerst lesen.

---

## 1 · Wo CMM-44 steht

`faelle` soll vollständig wegfallen, `claims` ist SSoT. Phase 1 (Audit) + das erste
Sub-Projekt SP-A sind durch. `faelle` hat statt 341 jetzt **307 Spalten** (die 34
sync-getriggerten Duplikate sind weg).

### Erledigt (gemergt in staging)

| PR | Inhalt |
|---|---|
| #1403 | Phase-1 Dekomposition — vollständiges 341-Spalten-Mapping (`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`) |
| #1406 | SP-A PR1 — Reader/Writer-Sweep: alle `faelle`-seitigen Reads/Writes der 34 DUP-Spalten auf `claims` umgestellt (44 Files) |
| #1412 | SP-A PR2 — Migration `20260517012837`: Backfill + 3 View-Repoints + Sync-Trigger-Paar-Drop + Step 3b (1 Trigger-Umzug, 4 RLS-Policies, 3 Funktionen) + 34× `DROP COLUMN`. **Auf DB appliziert + verifiziert.** |
| #1413 | SP-A Spec + Plan + Docs-Trail |

**DB-Stand:** Migration `20260517012837` ist appliziert + via `migration repair` als
`applied` recorded. DB-Verify grün, Portal-Smoke (5 Portale) 0 Hard-Fail.

### ⚠ Einziger offener Punkt aus SP-A

`main`/prod hat noch die **unvollständige** Migrationsdatei (642 Z., ohne Step 3b — aus
dem voreiligen #1410-Release). #1412 hat die Datei auf staging korrigiert (938 Z. =
applizierter Stand). **Der nächste staging→main-Release zieht die Korrektur nach.**
Keine Live-Gefahr (`db push` skippt die recordete Migration), nur `db reset`-Hygiene.
Falls noch nicht released: nach dem nächsten Release verifizieren, dass
`git show origin/main:supabase/migrations/20260517012837_*.sql | grep -c "Step 3b"` > 0.

---

## 2 · Was als nächstes zu tun ist — SP-B..L

Die ~11 verbleibenden Sub-Projekte. Quelle: `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`
§4 (Abhängigkeits-Graph + Tabelle SP-A..L). Jedes ist ein eigener
Brainstorm→Spec→Plan→Execution-Zyklus, eigenständig mergebar.

### Abhängigkeitsfreie Kandidaten (sofort startbar)

| Sub-Projekt | Inhalt | Größe |
|---|---|---|
| **SP-A2** | Die 30 **semantik-gleichen** DUP-Spalten (`schadens_datum`→`schadentag`, `unfallort`→`schadenort_adresse` etc.) — anders als SP-A: brauchen **Reader-Rename** auf den claims-Namen + claims-Side-Backfill-Verifikation, dann Drop. | mittel |
| **SP-B** | 64 CLAIMS-Spalten — claim-globale Eigenschaften, die noch nicht auf `claims` existieren → ADD auf claims + Writer/Reader migrieren | mittel |
| **SP-C** | 33 Parteien-Snapshot-Spalten (`kunde_*`, `halter_*`, `gegner_*`) → `claim_parties` | mittel |
| **SP-G** | 19 Gutachten-Rest-Spalten → `gutachten`-Sub-Table (schließt die F+G-Cluster-Arbeit ab) | niedrig |
| **SP-G2** | `gutachter_termine.claim_id`-FK (Tabelle hängt noch an `faelle.id`) — **entsperrt SP-D** | hoch |
| **SP-H** | 18 Auftrag-LC-Spalten → `auftraege` | mittel |
| **SP-J** | 12 Abrechnungs-Spalten → `abrechnungen` | mittel |

### Blockierte Sub-Projekte

| Sub-Projekt | Blocker |
|---|---|
| **SP-D** (Termin, 25 Spalten → `gutachter_termine`) | wartet auf SP-G2 |
| **SP-E** (Fahrzeug-Spec, 18 → `vehicles`) | `vehicle_id`-Backfill (AAR-810/Cluster-H unfertig) |
| **SP-F** (Vorschäden/Cardentity, 11) | Cardentity-Audit §3.1c |
| **SP-I** (Kanzleifall-LC, 56 → `kanzlei_faelle`) | groß + riskant — spät, wenn Mechanik steht |
| **SP-K / SP-L** | Reader-Sweep pro Portal → Sync-Trigger-Drop → `DROP TABLE faelle` (allerletzt) |

### Offene Phase-1-Teil-Audits (parallel erledigbar, entsperren Sub-Projekte)

1. **Cardentity-Audit (§3.1c)** — was schreibt die Cardentity-Extraction, Konsolidierung
   mit Gutachten-Werten → entsperrt SP-F.
2. **Lifecycle-Tabellen-Audit (§3.2)** — spaltengenaues Writer-/Reader-Audit von
   `auftraege` / `kanzlei_faelle` / `gutachter_termine` → schärft SP-D/G2/H/I.

**Empfehlung:** Mit **SP-A2** oder **SP-G** anfangen (klein, abhängigkeitsarm). SP-G2
früh ziehen, weil es SP-D entsperrt. SP-I (größtes Cluster) zuletzt.

---

## 3 · Bewährter Workflow (aus SP-A)

SP-A lief sauber mit dieser Kette — für jedes Sub-Projekt wiederholen:

1. **Live-DB-Stand messen** — `information_schema.columns` für die Tabelle, *bevor* der
   Spec geschrieben wird ([[feedback_information_schema_check]] — andere Sessions
   droppen parallel; Memory-Snapshots sind stale).
2. **brainstorming-Skill** → Design abstimmen → **writing-plans-Skill** → Plan.
3. **subagent-driven-development** — pro Task ein Implementer-Subagent, danach
   2-stufiges Review (Spec-Compliance, dann Code-Quality), Fix-Loop bis ✅.
4. Bei Migrationen: **dedizierter RLS-/Security-Review** des Migration-Diffs gegen die
   Live-DB (siehe Lektion unten).
5. Targeted-Apply (`db query --linked --agent yes --file` + `migration repair --status
   applied`), **kein** blankes `db push`.
6. `types regen` + Build (TS-Fehler nach Type-Regen = übersehener Reader).
7. Portal-Smoke 5 Portale + Screenshots nach jedem Schema-Drop
   ([[feedback_post_drop_smoke]]).

---

## 4 · Kritische Lektionen aus SP-A (nicht wiederholen)

### a) Dependency-Audit muss ALLE Objekt-Typen decken

SP-A's erster Apply scheiterte am `DROP COLUMN`, weil der Audit nur **Views** prüfte.
Eine Spalte hat aber auch Abhängige als **Trigger**, **RLS-Policies** und —
am gefährlichsten — **Funktions-Bodies**. `pg_depend` trackt Funktions-Bodies
**nicht**: eine SECURITY-DEFINER-Funktion (`can_access_fall`, speiste 19 RLS-Policies)
las eine zu droppende Spalte → hätte einen prod-weiten RLS-Lockout verursacht, ohne
den `DROP COLUMN` zu blockieren. **Vor jedem Spalten-Drop:** `pg_depend`-Audit für
Views/Trigger/Policies/Constraints **plus** ein Text-Sweep über `pg_proc.prosrc` nach
Funktionen, die die Spalte im Body referenzieren. Muster siehe Migration
`20260517012837` Step 3b.

### b) Draft-PRs sind nicht release-sicher

Die Release-Automation hat SP-A's PR2 als **Draft** gemergt, bevor er fertig war →
git↔DB-Drift, Recovery-PR nötig. [[feedback_draft_pr_nicht_release_sicher]]: was
nicht gemergt werden soll, **gar nicht erst als PR öffnen** — Branch pushen reicht.

### c) Squash-Releases — Erkennung inhaltsbasiert

`staging→main` läuft als Squash; `git merge-base --is-ancestor` funktioniert danach
**nicht** zur „ist X auf prod"-Erkennung (neue SHA). Stattdessen inhaltsbasiert:
`git diff origin/main origin/staging -- <files>`. [[feedback_staging_main_commit_divergenz]]

### d) Sequencing prod-Sicherheit

Eine gemeinsame Supabase-DB für prod+staging. Eine `DROP COLUMN`-Migration darf erst
appliziert werden, wenn der zugehörige Code-PR auf **main/prod** ist — sonst
prod-Breaker (AAR-599-Muster). Reihenfolge pro Sub-Projekt mit Schema-Drop:
Code-PR → staging → **main-Release** → dann Migration applizieren.

---

## 5 · Referenzen

- `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` — **das 341-Spalten-Mapping** (SP-A..L-Definition, Abhängigkeits-Graph)
- `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` — Master-Strategie (Phasen 0-6, §3.1 Domänen-Cluster)
- `docs/superpowers/specs|plans/2026-05-16-cmm44-spa-duplikat-drops*` — SP-A Spec + Plan (Vorlage für die nächsten Sub-Projekte)
- `supabase/migrations/20260517012837_cmm44_spa_drop_34_dup_columns.sql` — SP-A-Migration (Vorlage: Backfill + View-Repoint + Trigger/Policy/Funktions-Repoint + DROP COLUMN)
- Memory: `project_cmm44_faelle_dekomposition`, `feedback_information_schema_check`, `feedback_draft_pr_nicht_release_sicher`, `feedback_post_drop_smoke`, `feedback_migration_repair_twin_drift`

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
