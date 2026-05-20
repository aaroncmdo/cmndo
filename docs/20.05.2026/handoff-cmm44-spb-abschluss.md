# Handoff — CMM-44 SP-B abgeschlossen (Stand 2026-05-20)

**Master:** CMM-44 (`faelle`-Tabelle wird in Phase 6 abgeschafft, `claims` ist SSoT)
**Memory:** [[project_cmm44_spb_status]], [[project_cmm44_faelle_dekomposition]],
[[project_cmm44_spa3_status]], [[project_cmm44_spa2_status]]

---

## 1 · Was SP-B erledigt hat

Die **64 claim-globalen Spalten** (Phase-1-Verdikt `CLAIMS`) sind auf `claims` angelegt,
backfilled und alle Reader/Writer von `faelle` auf `claims` migriert.

**Architektur-Entscheidung (gegenüber dem ursprünglichen Brainstorm-Ansatz):** SP-B ist
**rein additiv** — kein per-Spalten-`DROP COLUMN faelle`. Die 64 `faelle`-Spalten bleiben
stehen und sterben gesammelt mit `DROP TABLE faelle CASCADE` in Phase 6 (SP-L), wie die
Master-Strategie §4 es vorsieht („claims-first, faelle stirbt zuletzt … einmal, ganz, am
Ende"). SP-A/A2/A3 mussten droppen, weil DUP-Spalten nach dem Sync-Trigger-Drop
entkoppelte Dubletten waren — ein Sonderfall der DUP-Klasse. SP-Bs Spalten sind keine
Duplikate, sondern Single-Source, daher additiv.

| PR | Inhalt | Commit-Range (auf main) |
|---|---|---|
| **#1441** PR1 | ADD COLUMN ×64 (Typ/Default/NOT-NULL von `faelle` gespiegelt) + Initial-Backfill + 3 View-Repoints (`v_claim_full`, `v_claim_listing`, `v_faelle_mit_aktuellem_termin`) + Types-Regen. Migration `20260518015652`. | `b6f2d9bc` |
| **#1442** PR2a | Cluster a (Workflow/Zuweisung, 27 Spalten): Reader/Writer-Sweep `faelle`→`claims`, zentrales `CLAIM_OWNED_DUPLICATE_COLUMNS`-Routing erweitert. Kein DB-Change. 4 Spec-Review-Runden, 3 Code-Quality-Befunde gefixt. | `b6f2d9bc` |
| **#1445** PR2b | Cluster b (Dokumente/SA/Vollmacht, 13 Spalten): Reader/Writer-Sweep. Wichtige Lektion: Pattern C = MOVE (claims-only), kein Dual-Write — der erste Wurf war dual-write und wurde korrigiert. | `4289456e` |
| **#1448** PR2c | Cluster c (Mietwagen/Unfall-Rest, 24 Spalten): Reader/Writer-Sweep. 3 selbst gefundene `faelle`-Writer in INSERT-Pfaden (`lead-fall-mapping`, `convert-lead-to-fall`, `lifecycle-seed`) zusätzlich migriert. | `0a5512a6` |
| **#1471** PR2c-Nachzug | 3 nach dem PR2c-Merge gefundene Reader: `fall-finanzen.ts` + `get-kunde-faelle.ts` (`schadens_hoehe_netto` aus `faelle` → aus `claims`); `dispatch-fall-actions.ts` `triggerStatusEmail()` (toter `schadens_ursache`-Select entfernt). | offen / staging |
| **#1473** PR3 | Catch-up-Backfill: 64 IS-NULL-guarded `UPDATE`s (SP-A2-Pattern statt naked UPDATE — sicher gegen claims-seitig neuere Werte). Migration `20260520083100` appliziert + repair-recorded. | offen / staging |

Spec/Plan: `docs/superpowers/specs|plans/2026-05-18-cmm44-spb-claims-native-add*.md`.

## 2 · Verifikation

- **DB-Schema:** `scripts/cmm44-spb-verify.sql` → `spb_spalten_auf_claims = 64` (live geprüft nach jedem Apply).
- **Views:** Alle 13 Cluster-b- und 24 Cluster-c-Spalten in `v_faelle_mit_aktuellem_termin` sourcen aus `c.<col>` (claims-Alias) — live per `pg_get_viewdef` verifiziert.
- **CI-Build:** PR1, PR2a, PR2b, PR2c jeweils grün gemergt. PR2c-Nachzug + PR3 builden zum Zeitpunkt dieses Handoffs (Stand 2026-05-20 09:30 Uhr).
- **Kontext-sicherer Re-Grep (alle 64 Spalten, alle 24 Cluster-c-Spalten als finale Stichprobe):** 0 live `from('faelle')`-Selects/Updates/Inserts und 0 live nested `faelle(...)`-Selects der SP-B-Spalten. Reste:
  - das tote `getMaklerFaelle` (`makler/queries.ts`, 0 Consumer — dokumentiert)
  - der `leads`-`service_typ` in `flow/[token]/actions.ts:426` (leads-eigene Spalte, nicht faelle)
  - claimlose Test-Fixtures `create-test-fall`/`seed-testdata` (out-of-scope per Spec)

## 3 · Lessons für die nächsten Sub-Projekte (SP-C..L)

Aus den 4+ Review-Runden auf PR2a:

### a) Kontext-sicherer Re-Grep ist Pflicht

Mehrere Cluster-a-Sites schlüpften durch zwei naive Re-Greps, weil das `.from('faelle')` und der SP-B-Spaltenname auf **verschiedenen Zeilen** standen. Doppelt-genestete `faelle(...)`-Embeds (`leads → faelle → ...`) sind ein weiterer Blindspot. Lösung (in den Subagent-Prompts ab PR2b verankert): einen paren-balanced Parser nutzen, der für jedes `.from('faelle')`-Auftreten den vollständigen Query-Block analysiert und nested `embed:tbl(...)`-Subscope ausstrippt. SP-A2-/A3-`grep -A`-Pattern reicht nicht.

### b) Pattern C = MOVE, niemals Dual-Write

PR2b's erster Wurf schrieb SP-B-Spalten in `faelle` UND `claims` (das schien wie der vorsichtige Schritt). Das ist genau der Zwitter-Zustand, den CMM-44 abschafft — und bricht, sobald `faelle` in Phase 6 gedroppt wird. Korrekt: SP-B-Spalten aus dem `faelle`-Write **entfernen**, claims-only. Non-SP-B-Spalten im selben Objekt dürfen auf `faelle` bleiben (Split, kein Dual-Write). Der zentrale Hebel war `CLAIM_OWNED_DUPLICATE_COLUMNS` + `splitOrKeepFaelleUpdate` — Spalten in die Liste eintragen, alle Helper-Consumer routen automatisch.

### c) Views sind nach PR1 repointed — keine zusätzlichen claims-Embeds

PR2b fügte irrtümlich `claims:claim_id(...)`-Embeds auf Selects aus `v_faelle_mit_aktuellem_termin` hinzu — doppelter Fetch und zerstörte einen DB-Filter (`.eq('sa_unterschrieben', true)` wurde durch App-Code-`filter()` ersetzt). PR1 hat die View bereits auf `c.<col>` repointed; die Spalte ist flach in der View. Pattern E heißt **kein Code-Change**, kein Embed. Filter müssen DB-Pushdown bleiben.

### d) Claims-Writes immer fehlergeguarded

Vor PR2b waren mehrere `claims`-Writes ungeguarded (`await ... .update(...)` ohne `{ error }`-Destructure). Bei stillem Fehlschlag wurde die Funktion mit `ok: true` zurückkehrt, während `claims` aktuell-deaktivierten/eskaliert-an-admin-id-Status NICHT bekam → faelle↔claims-Diskrepanz. Pattern: jeden `claims`-Write `{ error: claimErr }` destructuren, bei Fehler entweder Result-Object `{ ok: false }` (Server-Action) oder `console.error` (non-critical sub-op).

### e) Catch-up-Backfill: IS-NULL-Guard statt naked UPDATE

Plan Task 6 empfahl „identischer Backfill wie PR1 Block 2" (naked `SET <col> = f.<col>`). Das war für PR1 sicher (`claims.<col>` war frisch hinzugefügt, nie befüllt). Für PR3 *nach* PR2a/b/c-Deploy gilt das nicht mehr: ein naked UPDATE würde neuere claims-Werte (PR2-Writer haben sie geschrieben) mit älteren faelle-Werten überschreiben. PR3 nutzt daher das SP-A2-Muster `AND c.<col> IS NULL AND f.<col> IS NOT NULL` — kollisionsfrei und semantisch ein echter Catch-up.

### f) Release-Automation merged PRs vor dem Review-Gate

PR #1448 (PR2c) wurde von der staging→main-Release-Automation vorzeitig gemergt, **bevor** mein Spec-Review griff. Der Spec-Review fand danach 3 übersehene Reader — sie sind im Nachzug-PR #1471 nachgezogen. Lesson: für die nächsten Sub-Projekte den PR-Body als „Draft" / „blocked, do not merge" markieren oder den PR erst nach bestandenem Review öffnen (Branch pushen reicht für lokale Audit-Loops).

## 4 · Lose Enden

- **PR2c-Nachzug #1471** und **PR3 #1473** warten auf `staging`-Merge. Beide Builds laufen zum Zeitpunkt dieses Handoffs — bei grün squash-mergen (Session-Auto-Merge ist freigegeben). PR3 ist bereits live (Migration appliziert + repair-recorded); der PR-Merge ist nur Repo-Hygiene.
- **Portal-Smoke** (5 Portale, Plan Task 6 Step 6) ist nicht gefahren — staging-Auto-Merge der PR2-Strecke geschah ohne explizite Smoke-Pause. Empfehlung: einmaliger 5-Portal-Klick-Walk nach dem PR3-Merge zum Sanity-Check (Fallakte-Header, Mietwagen-Block, SA/Vollmacht, Eskalation).
- **Test-Fixtures** (`create-test-fall/route.ts`, `seed-testdata/route.ts`) inserten SP-B-Spalten weiterhin in `faelle` — claimlose Fixtures, vom Spec-Review 4× als out-of-scope akzeptiert. Können in einem späteren Sub-Projekt entweder modernisiert werden (claim-INSERT hinzufügen) oder gelöscht.
- **Linear Master CMM-44 + Sub-Tickets** sind nicht in dieser Session aktualisiert (kein Linear-Zugriff geprüft) — Aaron-Hand.

## 5 · Nächster CMM-44-Schritt

Aus `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md §4`:

- **SP-C** — 33 Parteien-Snapshots (`kunde_*`, `halter_*`, `gegner_*`) → `claim_parties` (Risiko mittel; abhängigkeitsarm).
- **SP-G2** — `gutachter_termine.claim_id`-FK nachziehen → entsperrt SP-D (Termin-Cluster, 25 Spalten).
- **SP-G** — 19 Gutachten-Rest-Spalten → `gutachten`-Sub-Table (kleinster, niedrigstes Risiko).
- **SP-H** — 18 Auftrag-LC-Spalten → `auftraege`.
- **SP-J** — 12 Abrechnungs-Spalten → `abrechnungen`.

Bewährtes Vorgehen (SP-A2/A3/B): Live-DB messen → brainstorming → spec → plan → subagent-Execution mit zweistufiger Review (Spec + Code-Quality). Lessons §3 oben in den Implementer-Prompt einbauen.

## 6 · Worktree

`.claude/worktrees/cmm-44-spb` auf Branch `kitta/cmm-44-spb-handoff` (dieser Handoff-Commit).
Die Implementations-Branches (`kitta/cmm-44-spb-pr1-add-columns`, `…-pr2a-workflow`,
`…-pr2b-dokumente`, `…-pr2c-mietwagen-rest`, `…-pr2c-nachzug-v2`, `…-pr3-catchup-backfill`)
können nach den finalen Merges via `git branch -d` aufgeräumt werden. Der Worktree
selbst kann nach SP-B-Abschluss mit `git worktree remove` entfernt werden.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
