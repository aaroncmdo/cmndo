# Handoff — CMM-60 abgeschlossen, Phase 6 (`faelle`-Drop) offen

**Stand:** 2026-05-16 (spätabends) · **Vorige Session:** CMM-60 Schritt 1–4 komplett appliziert + gemerged.
**Master:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` · **Linear:** CMM-60 (Done nach Phase 4), CMM-44 (Master Finishing-Strecke).

---

## 1 · Was erledigt ist — CMM-60 (`claims.sv_id`)

`sv_id` ist jetzt eine native, kanonische `claims`-Eigenschaft. Fünf Schritte, alle appliziert + gemerged:

| Schritt | Inhalt | Migration | PR |
|---|---|---|---|
| 1 | `claims.sv_id` (FK→sachverstaendige, Index) + Backfill (21) + Übergangs-Trigger `faelle→claims` | `20260516174112` | #1391 |
| 2 | `is_sv_for_claim` liest `claims.sv_id` statt `faelle`-Join; GRANT idempotent; Trigger auf INSERT+UPDATE; `cp_sv_assigned_insert` | `20260516180053` | #1393 |
| 2b | `v_claim_sv` — spalten-gescopete SV-Projektion (61-Spalten-Whitelist) | `20260516190354` | #1395 |
| 3 | `sv_id`-Writer auf `claims.sv_id`; Reverse-Trigger `claims→faelle`; Helper `setSvIdForFall` | `20260516192003` | #1398 |
| 4 | SV-`claims`-Closure: `v_claim_sv`→`security_definer`; `is_sv_for_claim` aus claims-SELECT-Policy | `20260516193332` | #1399 |

**Architektur-Endstand CMM-60:**
- `claims.sv_id` = SSoT. Writer (`sv-zuweisung`, `termin/ablehnen`, `gutachter/fall/[id]/actions`, `convert-lead-to-claim`) schreiben `claims.sv_id` über Helper `src/lib/faelle/sv-assignment.ts:setSvIdForFall`.
- **Bidirektionale Sync:** `trg_sync_faelle_sv_id_to_claims` + `trg_sync_claims_sv_id_to_faelle`, beide `pg_trigger_depth`-guarded. `faelle.sv_id` bleibt für faelle-Reader konsistent.
- Der SV liest Claims **nur** über `v_claim_sv` (`security_definer`, Owner postgres, `WHERE is_sv_for_claim`, 61-Spalten-Whitelist ohne Kanzleifall-LC/Regulierung). Direkter `claims`-Tabellen-Zugriff des SV ist entzogen — Lifecycle-Leck zu.
- `is_sv_for_claim`-**Funktion** lebt weiter (genutzt von `claim_parties.cp_select_consolidated`).

Specs/Pläne: `docs/superpowers/specs|plans/2026-05-16-cmm60-schritt2b-*`, `-schritt3-*`, `-phase4-*`. Apply-Docs `docs/16.05.2026/cmm60-*`.

---

## 2 · Phase 6 — `faelle`-Drop (offen, die große Strecke)

Phase 6 ist **nicht** ein CMM-60-Schritt — es ist die komplette `faelle`-Tabellen-Elimination = die CMM-Finishing-Strecke (Master **CMM-44**, Subs CMM-45..52). Größenordnung (Strategie-Doc + Memory `project_cmm_phase_24_finishing`): `faelle` ~341 Spalten, ~226 davon faelle-only noch zu klassifizieren, **506 faelle-Reads + 54 faelle-Writes** umzustellen, ~7–10 Tage.

**Das ist kein Ein-Spec-Brainstorm.** Vor dem ersten Spec: Dekomposition in Sub-Projekte.

### Empfohlene Dekomposition (Domänen-Cluster, Strategie §3.1a)
Die ~226 faelle-only-Spalten bilden fachliche Domänen — jede mit Heimat-Tabelle. Pro Cluster ein Sub-Projekt (Spec → Plan → Execution):

1. **Fahrzeug-Spec** (~24 Spalten `fahrzeug_*`, `kennzeichen*`, `fin_vin`, …) → `vehicles` (via `vehicle_id`).
2. **Gutachten/OCR-Rest** (~11) → `gutachten`-Sub-Table.
3. **Abrechnung** (~6) → `abrechnungen` / `kanzlei_faelle`.
4. **Halter/Parteien** (~9 `halter_*`) → `claim_parties` / `vehicles.current_owner_id`.
5. **claim-spezifische Schaden-/Workflow-Spalten** → `claims` direkt.
6. **Duplikate** (Spalten die schon beidseitig existieren) → ersatzlos `faelle`-seitig droppen.
7. **Reader-Migration:** die 506 faelle-Reads pro Cluster auf die neue Heimat / `v_claim_sv` / Domänen-Views umstellen.
8. **Sync-Trigger-Abbau + `faelle` DROP** als allerletzter Schritt.

Reihenfolge: erst Spalten-Cluster verschieben + Reader umstellen, **dann** Trigger droppen, **zuletzt** `faelle` DROP. Jeder Cluster ist eigenständig mergebar.

### Was beim `faelle`-Drop konkret aus CMM-60 mitfällt
- `trg_sync_faelle_sv_id_to_claims` + `trg_sync_claims_sv_id_to_faelle` (bidirektionale sv_id-Sync) — beide entfernen.
- `fallComputedFields.sv_id` in `src/lib/lead-fall-mapping.ts` — der faelle-INSERT-Pfad fällt mit `faelle` weg; `claims.sv_id` (in `claimsInsert`) bleibt die Quelle.
- Alle SV-`faelle`-Reader (`/gutachter/fall/[id]/page.tsx`, `gutachter/kalender`, `v_faelle_mit_aktuellem_termin`-Konsumenten) ziehen auf `v_claim_sv` + Domänen-Views um — **das** ist die eigentliche SV-Reader-Migration (Phase 4 hat sie bewusst nicht gemacht, weil sie ohne `faelle`-Wegfall keinen Sinn ergibt).

---

## 3 · Watch-outs

- **DB-Drift / Targeted-Apply:** Eine Fremd-Migration `20260515020338_aar_fix_isochrone_polygon_format.sql` hängt lokal-only. Jeder Migrations-Push braucht Targeted-Apply statt blankem `db push`:
  ```
  npx supabase db query --linked --agent yes --file <migration.sql>
  npx supabase migration repair --status applied <version>
  ```
- **`db query` gibt nur das letzte Result-Set zurück** — Mehrfach-Checks via `UNION ALL` in ein SELECT packen. `check` ist reserviert → Alias `chk`.
- **Worktree-Supabase-Link:** frische Worktrees sind nicht ge-`link`t. Vor `db query --linked`: `cp -r <haupt-repo>/supabase/.temp/. <worktree>/supabase/.temp/`.
- **Umlaut-Hook:** `.claude/hooks/check-umlauts.mjs` blockt ASCII-Ersatz in **Commit-Messages** (`ue`/`ae`/`oe`/`ss`) — echte Umlaute nutzen. (Migrations-Datei-Kommentare nutzen im Repo bewusst ASCII — der Hook prüft nur Commit-Messages.)
- **Eigener Worktree:** mehrere Sessions liefen durchgehend parallel auf `kitta/aar-leads-audit-session`. Phase-6-Arbeit in eigenem Worktree + eigenem Branch (`wt-cmm60` ist von der CMM-60-Strecke übrig, kann wiederverwendet oder frisch geklont werden).
- **RLS-Smoke-Muster:** `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', json_build_object('sub', <profile_id>, 'role','authenticated')::text, true)` in einer `BEGIN…ROLLBACK`-Transaktion — bewährt für RLS-Impersonation ohne echte Daten-Änderung. Achtung: ein Vergleich gegen die RLS-geschützte Basis-Tabelle ist im Impersonations-Kontext selbst geblockt — Baseline aus dem Service-Kontext zählen.
- **`v_claim_sv` ist `security_definer`** (Phase 4) — der Supabase-Advisor flaggt das als `security_definer_view`; bewusst & dokumentiert (das `WHERE is_sv_for_claim` ersetzt das RLS-Scoping). Bei künftigen Lint-Audits nicht „fixen".

---

## 4 · Git-/Linear-Stand

- `origin/staging` enthält CMM-60 Schritt 1–4 (PRs #1391/#1393/#1395/#1398/#1399 alle gemerged).
- Linear: CMM-60 = Done (nach Phase 4). Master CMM-44 + Subs CMM-45..52 = Phase-6-Strecke.
- `staging→main` macht Aaron / die Release-Session.

## 5 · Empfohlene Reihenfolge nächste Session

1. **Dekomposition** (1–2 h): die ~226 faelle-only-Spalten gegen den Live-Stand (`information_schema.columns`) klassifizieren, Domänen-Cluster + Abhängigkeiten festhalten, Sub-Projekt-Reihenfolge. Ergebnis: ein Dekompositions-Doc, kein Code.
2. **Erstes Sub-Projekt** brainstormen (Empfehlung: ein kleiner, abhängigkeitsarmer Cluster zuerst — z.B. Duplikat-Drops oder Fahrzeug-Spec) → Spec → Plan → Execution.
3. Cluster für Cluster, jeweils Reader-Migration mitnehmen.
4. **Zuletzt:** Sync-Trigger droppen + `faelle` DROP.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
