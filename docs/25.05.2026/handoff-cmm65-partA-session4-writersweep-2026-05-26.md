# CMM-65 Part A — Session-4 Handoff: Reads KOMPLETT, Writer-Sweep recon'd (2026-05-26)

**Teil von:** CMM-44 (Claim-as-SSoT). **Vorgänger-Handoffs:** `handoff-cmm65-partA-continuation-2026-05-25.md` (#1706) · `handoff-cmm65-partA-session3-2026-05-25.md` (#1714).
**Kanonischer Live-Status:** Memory `project_cmm65_timestamp_sweep.md` (Pattern + Lessons + diese Writer-Klassifizierung).
**Worktree:** `.claude/worktrees/cmm65-impl` (eigene, NICHT `cmm65-ts`). Pro Slice ein frischer Branch off `origin/staging`.

---

## 1 · ✅ READ-SEITE KOMPLETT — alle `faelle.created_at`-Reader auf claims (SSoT)

6 PRs, alle gegen staging gemergt (+ in Release-PR #1726 staging→main gebündelt). Pattern 1, je `tsc` + voller `next build` grün.

| PR | Domain | Inhalt |
|---|---|---|
| #1708 | gutachter | abrechnung/posteingang/reklamationen/team |
| #1711 | analytics + branding | conversion/sv-performance/kunden-theme/token-theme |
| #1713 | inbound | match-fall + baileys + twilio ×2 |
| #1718 | **kanzlei** | kanban/mandate → `claims.created_at` (Aaron-Entscheidung Option 2) |
| #1719 | kunde | get-kunde-faelle + chat + onboarding + OffeneDatenBanner |
| #1725 | sonstige | communication-timeline (Anker) + kb-assignment (sticky) + faelle/[id]/page |
| #1714 | (docs) | Session-3-Handoff |

**Verifizierte Mechanik (für alle Reads genutzt):**
- **Filter** (`.gte/.lte`): `from('faelle')` bleibt, Embed → `claims:claim_id!inner(created_at)`, Filter → `.gte/.lte('claims.created_at', …)`.
- **Order** (`.order('created_at')`): supabase-js kann den Parent NICHT nach einer eingebetteten to-one-Spalte ordnen → `claims.created_at` flachziehen + **clientseitig** sortieren/slicen (`.order`/`.limit` raus). Mengen gebounded.
- **Verlustfrei:** `faelle.claim_id` NOT NULL (live 0) → `!inner` droppt 0 Zeilen. `faelle`=53 == `!inner`=53; `claims.created_at IS NULL`=0. `claims.created_at ≈ faelle.created_at` (~150 ms, gleiche gte/lte-Boundaries; im finance-Slice #1686 an 4 Boundaries verifiziert).

### kanzlei-Entscheidung (Aaron, Option 2) + WICHTIGE LESSON
kanban/mandate sortieren+zeigen `claims.created_at` statt `faelle.updated_at`. Grund (empirisch, 28 komplett-Fälle live): `claims.updated_at` = **1 distinkter Wert** (`2026-05-22`, durch CMM-44-SP-Backfill-`UPDATE`s via moddatetime-Trigger geclobbert) vs `faelle.updated_at` = 6 distinkt.
> **LESSON: `claims.updated_at` ist während der laufenden Migration NICHT verlässlich für Ordering/Recency** — jede SP-Additiv-Backfill-Migration setzt es neu. Betrifft jede updated_at-basierte Logik. Wenn echte „zuletzt bearbeitet"-Semantik gebraucht wird → dedizierter, backfill-resistenter Aktivitäts-Timestamp nötig (eigenes Ticket).

---

## 2 · WRITER-SWEEP — Recon fertig, Implementierung = NÄCHSTER SCHRITT

> Re-Grep (multiline `from('faelle')[…]update({[…]updated_at`) auf staging-tip `3cf1f620`: **14 Sites in 13 Files**. **PFLICHT: vor Implementierung neu re-greppen** (staging bewegt sich) + Sync-Trigger live prüfen (s.u.).

### 2.1 · KORREKTUR zum alten Snapshot (#1706 §5)
- `lib/actions/termin-actions.ts` ×4 (:207/:377/:675/:850) sind **`from('faelle')`** — NICHT gutachter_termine (Snapshot hat falsch geraten). **In scope.**
- `faelle/[id]/_actions/core.ts` (im Snapshot als :76/:112 gelistet) ist im aktuellen Re-Grep **NICHT** aufgetaucht → existiert nicht mehr / kein faelle-updated_at-Write. Beim Re-Grep verifizieren.
- `kunde/faelle/[id]/actions.ts`: Re-Grep fand **eine** Stelle (:213-214); der Snapshot nannte :214+:219 — beim Re-Grep prüfen ob 1 oder 2.

### 2.2 · Mechanik (etabliert von prozess #1697)
Sync-Trigger `trg_sync_faelle_to_claims` (Migration `supabase/migrations/20260505134954_cmm_phase_1_5a_claims_faelle_sync_triggers.sql`) ist `AFTER UPDATE OF <~40 Daten-Spalten>` und **EXCLUDIERT `updated_at`** → ein reiner `faelle.update({updated_at})` propagiert **nichts** auf claims. `claims` hat moddatetime `trg_claims_updated_at` (BEFORE UPDATE all-cols) → **jeder** claims-Write bumpt `claims.updated_at`.
**Pro Site:**
- **DROP** wenn in derselben Action ein Sibling-claims-Write existiert (`setSvIdForFall`, `transitionFallStatus`, explizites `claims.update(...)`, `upsertClaim...`) der claims.updated_at ohnehin bumpt.
- sonst **MOVE** = `await <client>.from('claims').update({ updated_at: now }).eq('id', claimId)` (Wert ist Fallback+Intent; moddatetime überschreibt auf server-now). **Achtung: `upsertKanzleiFall` schreibt `kanzlei_faelle` (Sub-Table), NICHT claims → bumpt claims.updated_at NICHT → das ist ein MOVE, kein DROP.**

### 2.3 · Klassifizierung der 14 Sites (Session-4-Recon)

| Site | Klasse | Aktion | claimId-Quelle | Begründung / Notiz |
|---|---|---|---|---|
| `gutachter/fall/[id]/actions.ts:574` | **DROP** | updated_at raus | — | `setSvIdForFall(supabase, fallId, null)` (:578) schreibt claims.sv_id → bumpt claims.updated_at |
| `lib/faelle/kb-assignment.ts:71` | **DROP** | updated_at raus | — | `claims.update({kundenbetreuer_id,…})` (:76) im selben Helper bumpt claims.updated_at |
| `lib/kanzlei/push-mandat.ts:229` | **MOVE** | `claims.update({updated_at}).eq('id',claimId)` | `fall.claim_id` (oben geladen) | davor nur `upsertKanzleiFall` (=kanzlei_faelle, kein claims-Bump) |
| `app/faelle/[id]/_actions/dokumente.ts:311` | **MOVE** | dito | `claimIdForAs` (:306) | dito (upsertKanzleiFall davor) |
| `lib/ai/briefing.ts:144` | **MOVE** | dito | aus `fallRow` (claim_id verifizieren) | sv_briefing_* leben auf auftraege (Sub-Table) → kein claims-Bump |
| `lib/ai/briefing-structured.ts:141` | **MOVE** | dito | aus fallRow (verifizieren) | analog briefing.ts |
| `app/api/termin/ablehnen/route.ts:53` | MOVE? | lesen | fallId→claim_id-Lookup | pure updated_at; Sibling prüfen |
| `app/kunde/faelle/[id]/actions.ts:213` | MOVE? | lesen | prüfen | pure updated_at; Sibling prüfen |
| `app/api/twilio/inbound-kb-whatsapp/route.ts:128` | **MOVE** | dito | fallId→claim_id-Lookup | davor nur nachrichten-insert; kein claims-Bump |
| `lib/actions/termin-verlegung-actions.ts:330` | MOVE? | lesen | prüfen | pure updated_at; Sibling prüfen |
| `lib/actions/termin-actions.ts:377` | MOVE? | lesen | prüfen | pure updated_at |
| `lib/actions/termin-actions.ts:675` | MOVE? | lesen | prüfen | pure updated_at |
| `lib/actions/termin-actions.ts:850` | MOVE? | lesen | prüfen | pure updated_at |
| `lib/actions/termin-actions.ts:207` | **⚠️ MIXED** | Trigger zuerst! | — | schreibt `sv_id: null` + updated_at |
| `app/flow/[token]/actions.ts:1201` | **⚠️ MIXED** | Trigger zuerst! | — | schreibt `sv_id` + updated_at |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts:69` | **⚠️ MIXED** | Trigger zuerst! | — | schreibt `besichtigungsort_*` + updated_at |

### 2.4 · ⚠️ Die 3 MIXED-Writes — Sync-Trigger ZUERST verifizieren (nicht raten!)
Diese schreiben ein **echtes faelle-Feld** + updated_at in einem Call. Entscheidung hängt am Trigger:
- **Trigger live prüfen** (Spaltenliste von `trg_sync_faelle_to_claims` aus Migration `20260505134954` bzw. `pg_get_triggerdef` / `information_schema`): Steht `sv_id` / `besichtigungsort_*` noch in der `AFTER UPDATE OF (…)`-Liste?
  - **Wenn JA** (Feld wird gesynct): der Trigger schreibt das Feld auf claims → bumpt claims.updated_at automatisch → in diesen Updates `updated_at` einfach **droppen** (das echte Feld bleibt, der Trigger erledigt den Bump).
  - **Wenn NEIN** (CMM-60 hat `sv_id` evtl. aus der Sync-Liste entfernt; SP-D hat `besichtigungsort_*` nach gutachter_termine verlagert): dann ist der claims.updated_at-Bump Verantwortung der jeweiligen Spalten-Migration (CMM-60 / SP-D), NICHT CMM-65 → entweder dort lösen oder hier expliziten `claims.update({updated_at})` ergänzen (mit Sibling-Check).
- **NICHT raten.** Diese 3 sind Kern-Workflow (Termin-Ablehnung/Verlegung, Flow-SV-Zuweisung, Besichtigungsort) — ein falscher Drop lässt claims.updated_at nicht advancen.

### 2.5 · Empfohlenes Vorgehen
1. **Re-Grep** (Liste oben ist Snapshot von `3cf1f620`).
2. **Sync-Trigger-Spaltenliste live abfragen** (klärt die 3 MIXED).
3. **Pure Sites:** DROP/MOVE wie klassifiziert. Für MOVE den claimId beschaffen (oft `fall.claim_id` schon geladen, sonst `from('faelle').select('claim_id').eq('id', fallId)`-Lookup — claim_id ist NOT NULL).
4. **Error-Handling:** der explizite `claims.update({updated_at})` ist non-critical → wie die Sibling-Writes behandeln (kein Abbruch der Action bei Fehler; ggf. `console.error`).
5. **Eine PR** (oder 2: „pure updated_at writers" + „mixed"), `--base staging`, `tsc` + **voller** `next build`.
6. **Smoke:** nach einem Writer (z.B. push-mandat oder ablehnen) `claims.updated_at` advance prüfen (`curl -4` service-role, vorher/nachher).
7. Konsument der Semantik beachten: cron `pflichtdokumente-reminder` + `faelle/[id]/_actions/briefing` **lesen** `fall_updated_at`/`faelle.updated_at` (Cache/Gating) → nach Phase-6 lesen die `claims.updated_at`; deshalb müssen die MOVEs claims.updated_at tatsächlich bumpen.

---

## 3 · DANACH: Part B (DDL) + CMM-66 — separate Risikoklasse, nur auf explizites Go
- **CMM-66:** View `v_faelle_mit_aktuellem_termin` auf `claims.created_at` repointen (mehrere Reads lesen created_at aus dieser View statt Code, z.B. `kunde/onboarding/page:97`, `cron/abrechnung-erstellen`, `reissue-abrechnung`). Kein Code-Change, reiner View-Repoint.
- **Part B (DDL, nur via supabase-CLI — Regel 2, `information_schema` live davor):** `claims` ADD `marketing_provision`/`marketing_quelle` (+Backfill) + `zahlungsweg` (all-null) + Top-Level-Finanz-Reads. CMM-61: `kanzlei_faelle` provision/honorar + Vollmacht-Übergabe.

---

## 4 · Env / Tooling-Lessons (dieser Env)
- **Worktree:** `.claude/worktrees/cmm65-impl` off `origin/staging`; `node_modules`-Junction → main, `.env.local` kopiert. Pro PR frischer Branch off `origin/staging` (Squash-Merges → alte Branch nicht mehr Ancestor).
- **DB-Probe:** node `fetch`/supabase-js **hängt** auf Supabase → `curl -4` + service-role (Keys aus `.env.local`, nie loggen). 522/Timeout = DB-Pool durch Parallel-Sessions erschöpft (transient).
- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `rm -rf .next` davor. **Exit-Code NICHT über `; echo` maskieren** — Build-Exit in eine Log-Datei schreiben und die `BUILD_EXIT=`-Zeile prüfen (die Task-Notification zeigt den maskierten echo-Exit, nicht den Build-Exit). `/gutachter-partner` SSG kann lokal >60s timeouten (build-time `sv_leads`-Query am gesättigten Pool) → change-unabhängiger Flake; CI-`build` (sauberer Pool) ist das Gate.
- **Merge:** NICHT die Merge-Session — PR `--base staging` + berichten. Offener non-draft staging-PR mit grünem `build` wird vom `sync-watcher` gemergt.
