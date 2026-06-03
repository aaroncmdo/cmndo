# CMM-44 Phase 4.1 — Light-Views Re-Base (`v_claim_timeline` + `v_claim_listing`)

**Master:** CMM-44 (faelle-Drop / Claim-SSoT-Vollmigration) · **Position:** Phase 4.1 (kleinste View-Re-Base, Pilot fuer Phase 4.2)
**Vorlage:** `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` §R.5/§R.6 (Phase-4-Vorlage current, revalidiert 30.05.)
**Worktree:** `.claude/worktrees/cmm44-phase-41-light-views` · **Branch:** `kitta/cmm44-phase-41-light-views` (ex `origin/staging`)
**Live-Audit:** Consumer-Audit-Workflow `wf_a84d8fde-5a6` (4 Finder, 400k tokens) + Live-Schema-Probe (PostgREST, 30.05.)

---

## 1 · Ziel

Zwei der 6 Phase-6-Blocker-Views auf claims-zentrische Quellen umstellen, **ohne nutzersichtbare Verhaltensaenderung** (1 dokumentierte Mini-Ausnahme, s. §5). Primaer: `v_claim_timeline` **vollstaendig faelle-frei** machen (= 1 echter Blocker eliminiert) und damit das **SECURITY-DEFINER-Restore-Template + Pre/Post-Parity-Verify-Pattern** fuer die 4 schweren Views (Phase 4.2) etablieren. Sekundaer: `v_claim_listing` kosmetisch entkoppeln (`sv_id` von claims), wo es ohne Reader-Migration geht.

---

## 2 · Audit-Befund (kehrt die Handoff-Annahme um)

Das MP-8c-Handoff §5 nannte `v_claim_listing` den "kleinsten Fix" und `v_claim_timeline` "kniffliger". **Der Live-Consumer-Audit zeigt das Gegenteil:**

### 2.1 `v_claim_listing` — `fall_id` ist load-bearing (NICHT isoliert abloesbar)

Live-Definition (MP-6c `20260528192402`, 18 Spalten, SECURITY DEFINER): faelle nur fuer `f.id AS fall_id` + `f.sv_id`.

| Consumer | liest `fall_id`? | Konsequenz bei NULL `fall_id` |
|---|---|---|
| `src/app/admin/faelle/(hub)/page.tsx` | **JA — blockierend** | `.filter((r) => r.fall_id)` (Z.243) wirft Karte aus dem Kanban; `fall_id` ist Detail-Link-Ziel + Join-Key fuer **5 Supplemental-Queries** (faelle, nachrichten, fall_read_state, mitteilungen, count_unread_updates-RPC). NULL ⇒ Karte verschwindet + alle Badges weg. |
| `src/app/faelle/page.tsx` | JA (NULL-safe via `?? claim_id`) | aber `/faelle/[id]` ist **faelle.id-gekeyed** → claim_id-Fallback misroutet in `notFound()`. |
| `getClaimListing` (`lib/claims/get-claim-for-role.ts`) | nein (`select('*')`, Typ lässt fall_id weg, **0 Caller**) | inert. |

`/faelle/[id]` ist live faelle.id-gekeyed (`getFallById` → `v_faelle_mit_aktuellem_termin.eq('id', fallId)`, kein `resolveClaimId`/accept-both). ⇒ `fall_id` kann erst weg, wenn (a) admin/faelle hub auf claim_id-basierte Supplemental-Reads migriert ist (Phase 4.3 Admin-Sweep) **und** (b) CMM-28 `/faelle/[id]` auf claim_id re-keyed. **Beides ausserhalb Phase 4.1.**

→ **Phase-4.1-Aktion v_claim_listing:** nur `f.sv_id` → `c.sv_id` (CMM-60 SSoT). `LEFT JOIN faelle` **bleibt** fuer `fall_id`. View bleibt formal Phase-6-Blocker (dokumentiert als Phase-4.3-Restschuld). Kein struktureller Voll-Abbau — bewusste Teil-Massnahme.

### 2.2 `v_claim_timeline` — Consumer sauber, aber Foundation noetig

Live-Definition (SP-G2 `20260521093039`, 12 Spalten, SECURITY DEFINER; von MP-6c **nicht** angefasst). Faelle in 2 Rollen:

1. **Kosmetik (gefahrlos kappbar):** `fall_id`-Output via korrelierte `SELECT f.id FROM faelle`-Subqueries (~9 Branches) + `detail_url_path = '/faelle/<faelle.id>'` (nur die 2 gutachten-Branches). **Kein einziger Consumer liest `fall_id`** (reine Passenger-Spalte; `timeline-queries.ts` filtert auf `claim_id`). `detail_url_path` nur in `TimelineEventCard.tsx` (null-guarded `<a>`).
2. **Harter Blocker:** `claim_id`-Ableitung in 2 Branches via `JOIN faelle`:
   - `phase.geaendert`: `phase_transitions pt JOIN faelle f ON f.id = pt.fall_id` → `claim_id = f.claim_id`
   - `manuell.notiz`: `timeline tl JOIN faelle f ON f.id = tl.fall_id` → `claim_id = f.claim_id`

   **Live-Schema-Probe bestaetigt:** `phase_transitions.claim_id` = **NEIN**, `timeline.claim_id` = **NEIN**. Beide haben nur `fall_id`. ⇒ ohne faelle kein Weg von `fall_id` → `claim_id`. **Foundation noetig:** `claim_id` additiv auf beiden Tabellen + Backfill + Population-on-Insert.

Row-Counts (Backfill-Aufwand, live 30.05.): `phase_transitions` = **1**, `timeline` = **225** (davon **147 mit `fall_id IS NULL`** → schon heute via INNER JOIN faelle aus der View ausgeschlossen; nur 78 sichtbar). Trivial.

---

## 3 · Scope-Entscheidung (Aaron, 30.05.)

| Frage | Entscheidung |
|---|---|
| Welche View(s)? | **Beide** — `v_claim_timeline` voll faelle-frei + `v_claim_listing` cosmetic `sv_id`→`c.sv_id`. |
| `detail_url_path` / faelle-Detail-Links? | **Voll kappen (NULL)** — `v_claim_timeline` wird 100% faelle-frei. Kosten: gutachten-Timeline-Events verlieren den `Details ansehen →`-Link bis CMM-28 die Route auf claim_id umstellt. |

**Writer-Population-Strategie (vom Spec-Autor, reviewbar):** statt die ~80 Call-Sites des `logFallEvent`-Funnels + die phase_transitions-Writer in Phase 4.1 zu threaden (gross + fehleranfaellig — ein vergessener Writer = stiller Event-Verlust), ein **transitionaler `BEFORE INSERT`-Trigger** auf beiden Tabellen, der `claim_id` aus `faelle.claim_id` (via `fall_id`) fuellt, wenn NULL. Etabliertes Pattern hier (vgl. CMM-60 reverse-sync). Die App-Writer-Migration (claim_id direkt setzen) + Trigger-Drop sind explizit **Phase 5/6** (Writer-Phase).

---

## 4 · Akzeptanzkriterien

1. **`phase_transitions.claim_id`** + **`timeline.claim_id`** existieren live (uuid, FK→claims, nullable), indexiert.
2. **Backfill** komplett: jede Zeile mit aufloesbarem `fall_id` hat `claim_id` gesetzt; `claim_id`-Verteilung matcht `faelle.claim_id` (0 Mismatches fuer non-null fall_id).
3. **Transitionaler Trigger** auf beiden Tabellen: neue Inserts ohne `claim_id` bekommen es aus `faelle.claim_id` (verifiziert via Test-Insert oder Logik-Review).
4. **`v_claim_timeline` ist faelle-frei**: `pg_views.definition` enthaelt **0×** `faelle` / `FROM faelle` / `JOIN faelle`. 12-Spalten-Output-Shape unveraendert. SECURITY DEFINER (`security_invoker=false`) explizit gesetzt. Grants an `anon, authenticated, service_role` erhalten.
5. **`v_claim_timeline` Pre/Post-Parity**: Zeilenzahl gesamt **und** pro `event_typ` ist vor/nach der Migration identisch (beweist, dass der claim_id-Rewrite keine Events droppt/dupliziert).
6. **`v_claim_listing`**: `sv_id` kommt aus `c.sv_id`; Output-Shape (18 Spalten) + `fall_id` (aus `f.id`) + SECURITY DEFINER + Grants unveraendert. `sv_id`-Werte identisch zu vorher (0 Mismatches `c.sv_id` vs `f.sv_id`).
7. **Kein `src/`-Code-Change** in Phase 4.1 (DDL-only). Type-Regen **deferred** (kein Consumer referenziert `phase_transitions.claim_id`/`timeline.claim_id` in TS; View-Shapes unveraendert).
8. **Consumer-Smoke gruen** (staging): admin/faelle Kanban (Karten verteilt, Detail-Link OK), `/faelle`-Liste, Fallakte `verlauf`-Tab (Timeline-Events inkl. `phase.geaendert` + `manuell.notiz` sichtbar).
9. **Migration getrackt** (Regel 2): via `apply_migration`; File-Name == recorded version (kein Twin-Drift).
10. **Phase-6-Buchhaltung**: der neue faelle-lesende Trigger + die 2 neuen `claim_id`-Spalten/FKs werden in der Audit-Doc §R.6 als neue Phase-5/6-Cleanup-Items ergaenzt.

---

## 5 · Bewusste Verhaltensaenderung (1)

`v_claim_timeline.detail_url_path` ist nach der Migration **immer NULL** (vorher nur in den 2 gutachten-Branches gesetzt). Effekt: der `Details ansehen →`-Link auf `gutachten.beauftragt` + `gutachten.fertig`-Timeline-Events (im Fallakte-`verlauf`-Tab) verschwindet. Begruendung: der Link zeigte auf `/faelle/<faelle.id>` (faelle-gekeyte Route, wird mit CMM-28 abgeloest); ihn jetzt zu kappen ist konsistent mit dem Voll-Abbau. CMM-28 stellt ihn als `/faelle/<claim_id>` wieder her. `TimelineEventCard.tsx` ist bereits null-guarded → kein Crash, nur Link weg.

---

## 6 · Nicht-Ziele (explizit ausserhalb Phase 4.1)

- `v_claim_listing` voll faelle-frei (haengt an admin-Reader-Sweep + CMM-28) → **Phase 4.3**.
- App-Writer auf `claim_id`-direkt umstellen (state-machine, writeAudit, logFallEvent-Funnel, side-quest, qc) → **Phase 5**.
- Trigger droppen → **Phase 6** (mit faelle-Drop).
- `v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view` → **Phase 4.2** (nutzen dieses Pilot-Template).
- `notification_events.claim_id` (auch NEIN live) — betrifft Crons, nicht diese Views → spaeter.

---

## 7 · Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| claim_id-Rewrite droppt/dupliziert Timeline-Events | AK#5 Pre/Post-Parity pro `event_typ` (Hard-Gate vor PR). |
| `CREATE OR REPLACE VIEW` schlaegt fehl (Shape-Mismatch) | Spalten-Namen/Typen/Reihenfolge **byte-identisch** halten (nur Expressions/FROM aendern); `NULL::uuid`/`NULL::text` mit exakten Casts. |
| Neuer faelle-lesender Trigger = neuer Phase-6-Breaker | Bewusst transitional; AK#10 traegt ihn in die Phase-6-Liste ein; Drop-Bedingung dokumentiert. |
| `sv_id` von `c.sv_id` weicht von `f.sv_id` ab | AK#6 Mismatch-Check (0 erwartet; >0 = latenter Bug, den der Switch FIXT — dann melden). |
| Shared DB, 18 Parallel-Sessions, Drift | Live-Catalog-Query unmittelbar vor `apply_migration` (Spalten-Existenz, FK-ondelete des fall_id-FK zum Matchen); `IF NOT EXISTS` auf ADD COLUMN. |
| MCP disconnected | Re-Auth-URL bereits an Aaron; READs via PostgREST-Probe parallel moeglich. |
| Twin-Drift | Regel-2-Ablauf: `list_migrations` → recorded version ablesen → File exakt so benennen. |

---

## 8 · Quellen

- Audit-Doc §R.5/§R.6: `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md`
- MP-8c-Handoff §5: `docs/30.05.2026/cmm44-mp8c-handoff.md` (Phase-4.1-Empfehlung — hier korrigiert)
- Live-Definitionen: `supabase/migrations/20260528192402_cmm44_mp6c_drop_claims_phase.sql` (v_claim_listing) + `20260521093039_cmm44_spg2_rewire_claim_id.sql` (v_claim_timeline)
- Consumer-Audit: Workflow `wf_a84d8fde-5a6` · Live-Schema-Probe: `scripts/probe-phase41-schema.mjs`
- Memory: `feedback_information_schema_check`, `project_cmm44_mp8c_complete`, `feedback_migration_repair_twin_drift`
