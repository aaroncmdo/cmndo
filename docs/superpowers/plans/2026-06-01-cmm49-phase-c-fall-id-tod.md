# CMM-49 Phase C — fall_id-Tod (Decomposition + Sequencing Plan)

> **For agentic workers:** Dies ist ein **Master-Decomposition-Plan**, kein Solo-Execution-Plan. Phase C ist Cross-Lane + kontestiert (Fallakte-Route/Chat/Parteien = 939-Lane). Jedes Sub-Projekt (PC-x) wird **einzeln** geplant + koordiniert. PC-1 ist hier bite-sized ausgearbeitet (der Keystone-Enabler). Steps nutzen Checkbox-Syntax.

**Goal:** `faelle.id` als Identitäts-Key (`fall_id`) eliminieren, sodass `DROP TABLE faelle CASCADE` möglich wird, ohne Routen/Joins/Views/RPCs zu brechen — und die App stattdessen auf `claim_id` (= `claims.id`) keyt.

**Architecture:** Inkrementell + accept-both. Das **bewährte CMM-63-Kunde-Route-Muster** (Route akzeptiert claim_id ODER faelle.id, kanonisiert per 308-Redirect auf claim_id) wird auf alle Detail-Routen + Identity-Outputs übertragen. Sub-Entity-Joins (`.eq('fall_id', x)`) wandern per-Domäne auf `claim_id`, sobald die Quell-Coverage es erlaubt.

**Tech Stack:** Next.js 16 (App Router), Supabase/PostgREST, TypeScript. DB-Änderungen nur via Supabase-Plugin (`apply_migration`).

---

## 0. Kontext + verbindliche Referenzen

| Doc | Was |
|---|---|
| North-Star `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` (#2118) | Datenmodell-SSoT |
| Master-Plan `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md` (#2118) | Phasen A–G; Phase C = fall_id-Tod (= Master-Plan Phase E) |
| Drop-Runway-Handoff `docs/01.06.2026/HANDOFF-cmm49-drop-runway.md` (#2188, Branch kitta/cmm49-handoff) | Reader-Sweep-Pattern §4, Lane-Koordination §7 |
| Reader-Sweep-Marker `…/memory/project_cmm49_readersweep_sla.md` | Reader-Sweep-Triage + Coverage-Befund |

**Stand-Quellen (live, 01.06.2026, `paizkjajbuxxksdoycev`):** siehe §2.

---

## 1. Die ZWEI Layer von „fall_id-Tod" (kritische Klärung)

Phase C konflatiert in der Alltagssprache zwei Dinge, die **unterschiedlich DROP-kritisch** sind:

### Layer A — DROP-brechend (MUSS vor `DROP TABLE faelle` weg)
- **`.from('faelle')`-Reads** → der Reader-Sweep (Phase D, läuft separat; SLA #2195, send-reminders #2200 erledigt).
- **Views, die `faelle` JOINen** (Bucket 5): `v_claim_listing`, `faelle_kunde_view`, `faelle_sv_view`, `v_claim_full`, `v_faelle_mit_aktuellem_termin` → CMM-66.
- **RPCs/Functions, die `faelle` referenzieren** (Bucket 4): `delete_fall_komplett`, `link_lead_data_to_fall`.
- **FK-Constraints** `faelle.id ← <table>.fall_id` → werden von `DROP … CASCADE` mitgedroppt.

### Layer B — NICHT DROP-brechend, aber Cleanliness/SSoT (kann teils NACH dem Drop)
- **Sub-Entity-Filter `.eq('fall_id', x)`** (Bucket 2, ~250 Sites): filtern `<table>.fall_id == x`. **Die `fall_id`-Spalte überlebt `DROP TABLE faelle CASCADE`** (CASCADE droppt nur die FK-Constraint, nicht die uuid-Spalte). Diese Queries laufen also **auch nach dem Drop weiter** — solange die `fall_id`-Spalte + ihre Werte stehen bleiben.
- **Identity-Outputs** (Bucket 3, ~90 Sites): `/faelle/${fallId}`-Links, `fall_id:`-Inserts, Component-Props. Brechen NICHT am Drop (fall_id-Werte bleiben), aber die Route muss claim_id verstehen (PC-1).

> **Konsequenz:** Der **kritische Pfad zum Drop** ist schmaler als „250 Sites": **Views (CMM-66) + RPCs + Reader-Sweep**. Die ~250 Sub-Entity-Filter + ~90 Outputs sind **Cleanliness** und können gestaffelt/nach dem Drop migriert werden, **außer** sie hängen an einer der DROP-brechenden Sachen (z.B. eine View, die fall_id exponiert, die ein Filter dann nutzt).

**Was Phase C (dieser Plan) ownt:** Layer-B-Migration (Route-Key-Switch + Sub-Entity-Joins + Identity-Outputs) **plus** die Layer-A-Teile, die identitäts-gekoppelt sind (RPCs, v_claim_listing.fall_id). Der reine Reader-Sweep (Phase D) + die Spalten-Home-Views (CMM-66) laufen als eigene Strecken.

---

## 2. Evidenz-Inventar (live + Code-Sweep 01.06.)

### Routen (Bucket 1)
| Route | Key-Status |
|---|---|
| `src/app/kunde/faelle/[id]/page.tsx` | **✅ accept-both + canonicalize** (CMM-63/CMM-28, `getKundeFallDetailRecord`, Redirect auf claim_id) |
| `src/app/faelle/[id]/page.tsx` (Admin/KB) | ❌ **faelle.id-only** (`getFallById(id)`, alle Sub-Queries `.eq('fall_id', id)`) → **PC-1** |
| `src/app/kunde/nachbesichtigung/[fall_id]/page.tsx` | ❌ Param heißt `fall_id`, `.eq('id', fall_id)` auf `faelle_kunde_view` → PC-1b |

### Sub-Entity-Tische mit `claim_id` (Bucket 2) — ALLE 18 geprüft haben `claim_id` additiv
`tasks, gutachter_termine, timeline, nachrichten, pflichtdokumente, fall_dokumente, auftraege, parteien, email_log, qc_checkliste, gutachter_abrechnungen, kanzlei_abrechnungen, sla_tracking, reklamationen, termin_reminders, zahlungseingaenge, ai_usage_log, fall_read_state, forderungspositionen` — **alle `claim_id,fall_id`**; `vs_korrespondenz` hat **nur `claim_id`** (bereits migriert).

### claim_id-Coverage (live) — bestimmt JOIN-Migrations-Reihenfolge
| Tabelle | rows | claim_id gesetzt | fall_id-set-but-claim_id-null | sweepbar? |
|---|---|---|---|---|
| sla_tracking | 26 | 26 (100%) | 0 | ✅ |
| kanzlei_faelle | 12 | 12 (100%) | 0 | ✅ |
| auftraege | 2 | 2 (100%) | 0 | ✅ |
| nachrichten | 11 | 9 (82%) | **prüfen** | ⚠️ |
| tasks | 88 | 38 (43%) | **0** (Rest = Orphans ohne fall_id) | ✅* |
| gutachter_termine | 19 | 7 (37%) | **0** (Rest = Orphans) | ✅* |
| pflichtdokumente | 9 | 0 (0%) | **0** (alle Orphans) | ✅* |

> **\*Coverage-%-Falle (verifiziert):** Die unbefüllten Rows sind **Orphans OHNE fall_id** — kein Backfill möglich/nötig. Ein fall-gekeyter Filter `.eq('fall_id', X)` ist sicher auf `claim_id` umstellbar, **gdw. die Tabelle 0 Rows mit `fall_id`-gesetzt-aber-`claim_id`-null hat** (dann Source-`claim_id` threaden, Orphans verhalten sich identisch). **Pro Tabelle vor der JOIN-Migration neu messen** (`count(*) where fall_id is not null and claim_id is null` MUSS 0 sein; sonst Backfill `update <t> set claim_id=f.claim_id from faelle f where f.id=<t>.fall_id and <t>.claim_id is null` via apply_migration).

### Identity-Outputs (Bucket 3): ~90 Sites
`/faelle/${id}`-Links (admin/dispatch/kanzlei Kanban, Widgets, Kalender, Statistiken, Emails, revalidatePath), `fall_id:`-Inserts (timeline, tasks, nachrichten, auftraege, pflichtdokumente, qc_checkliste, mitteilungen, vs_korrespondenz, email_log, ai_usage_log, zahlungseingaenge), Component-Props (`MultiChannelChat`, `ChatTimelineView`, Makler/Kunde-Chat, …).

### RPCs (Bucket 4): 2
- `delete_fall_komplett(p_fall_id)` — `src/app/faelle/[id]/_actions/core.ts:31`
- `link_lead_data_to_fall(p_lead_id, p_fall_id)` — `src/app/flow/[token]/actions.ts:842`

### Views/Kanban (Bucket 5): `v_claim_listing` (`.from('v_claim_listing')` in `src/app/faelle/page.tsx:79`, `src/lib/claims/get-claim-for-role.ts:236`) exponiert `id`(=fall_id)+`claim_id`; Kanban-Komponenten linken via `fall.id`.

---

## 3. Decomposition + Dependency-Graph

```
PC-1  Admin-Route /faelle/[id] accept-both + canonicalize   ── Keystone-Enabler (939-koordiniert)
        │  (entsperrt: alle Identity-Output-Migrationen, weil Links dann claim_id tragen dürfen)
        ├─► PC-3  Identity-Output-Sweep (Links → claim_id)   ── per Portal-Domäne, NICHT-Fallakte zuerst
        └─► PC-1b Nachbesichtigung-Route + Restrouten
PC-2  Sub-Entity-JOIN-Migration .eq('fall_id') → .eq('claim_id')  ── per Tabelle/Domäne, je nach Coverage
        │  (Layer B; NICHT drop-brechend, aber Voraussetzung für fall_id-Spalten-Drop)
PC-4  RPC-Varianten delete_fall_komplett/link_lead_data → claim_id   ── isolierbar
PC-5  v_claim_listing faelle-frei (Koordination mit CMM-66)   ── Layer A (drop-brechend)
PC-6  Insert-Writer fall_id → claim_id (Sub-Entity-Inserts)   ── Layer B, parallel zu PC-2
PC-7  fall_id-Spalten droppen (nach PC-2+PC-6 je Tabelle)     ── DDL, ganz am Ende
```

**Reihenfolge zum DROP (kritischer Pfad):** Reader-Sweep (Phase D) **∥** CMM-66-Views **∥** PC-4-RPCs **∥** PC-5 → dann ist `DROP TABLE faelle CASCADE` möglich (die fall_id-Spalten der Sub-Entities bleiben + funktionieren weiter). PC-1/2/3/6/7 sind **Cleanliness** und dürfen den Drop überdauern (Boy-Scout danach), **außer** Aaron will saubere claim_id-URLs vor dem Drop (dann PC-1 vorziehen).

---

## 4. Koordinations-Map (welche Lane ownt was)

| Sub-Projekt | Terrain | Lane / Sign-off |
|---|---|---|
| **PC-1** Admin-Fallakte-Route + Tabs | `src/app/faelle/[id]/**` | **939-/Fallakte-Lane** — Pflicht-Abstimmung vor Touch (Handoff §7). Chat-Tab + Parteien = 939. |
| PC-2 nachrichten/Chat-Joins | `nachrichten`, `ChatChannel`, `MultiChannelChat` | **939-/Chat-Inbox-Lane** (`chat-inbox-ssot`-Worktree aktiv) — abstimmen |
| PC-2 parteien-Joins | `parteien` | **939-Lane** (CMM-63/CMM-67 Parteien-Umbau) |
| PC-2 termin-Joins | `gutachter_termine`, `termin_reminders` | **Termin-Engine-Lane** (`unisone-termin-engine`) — v_claim_phase/Termine sind ihre |
| PC-2 dokumente/tasks/sla/auftrag/finance | `pflichtdokumente`, `fall_dokumente`, `tasks`, `sla_tracking`, `auftraege`, `gutachter_abrechnungen` | **Reader-Sweep-Lane (diese)** — relativ frei, je Coverage |
| PC-4 RPCs | DB-Functions | DDL-Lane (Plugin) — isoliert |
| PC-5 v_claim_listing | View | **CMM-66-Lane** (`cmm-66-view-rebase`-Worktree) — koordinieren |

> **Regel (Handoff §7):** Vor jedem Touch von Fallakte-Route / Chat / Parteien / v_claim_phase / state-machine.ts: Kollisions-Check + Abstimmung über Aaron (SendMessage an Peers unzuverlässig). Marker unter `…/memory`.

---

## 5. PC-1 (Detailliert) — Admin-Route `/faelle/[id]` accept-both + canonicalize

**Architektur:** 1:1-Übertragung des CMM-63-Kunde-Musters auf die Admin/KB-Route. `getFallById` bekommt eine accept-both-Auflösung (routeId = claim_id ODER faelle.id → resolved faelle-Record mit `.claim_id`). Danach `const id = fall.id` → **alle ~10 Sub-Queries bleiben unverändert** (fall_id-keyed, intern korrekt). Canonicalize-Redirect auf claim_id-URL.

**Warum sicher:** Die Kunde-Route macht exakt das produktiv (`src/app/kunde/faelle/[id]/page.tsx:76-85`). `faelle.claim_id` ist seit AAR-816 NOT NULL → Canonicalize feuert immer. Alt-Bookmarks (`/faelle/<fallId>`) → 308 → `/faelle/<claimId>`.

**⚠️ 939-Koordination ZWINGEND** vor Start (Fallakte-Route-Terrain). Dieser Plan = Vorlage; Ausführung erst nach Sign-off.

**Files:**
- Modify: `src/lib/fall/queries.ts` (`getFallById` → accept-both, oder neuer `getFallByIdOrClaimId`)
- Modify: `src/app/faelle/[id]/page.tsx:65-72` (routeId + canonicalize-Redirect)
- Smoke: Staging `/faelle/<fallId>` (→308→claimId) + `/faelle/<claimId>` (200), Screenshot

- [ ] **Step 1 — Loader accept-both schreiben.** In `src/lib/fall/queries.ts`: `getFallById(supabase, routeId)` so erweitern, dass es zuerst `.from('faelle').eq('id', routeId)` versucht und bei Miss `.from('faelle').eq('claim_id', routeId).maybeSingle()` (claim_id ist NOT NULL + unique-genug pre-launch). Rückgabe inkl. `claim_id`. Pattern-Vorlage: `getKundeFallDetailRecord` (claim-zentriert, accept-both).

```ts
// src/lib/fall/queries.ts — getFallById accept-both (CMM-28/Phase-C PC-1)
export async function getFallById(supabase: SupabaseClient, routeId: string) {
  // 1) Alt-Bookmark: routeId == faelle.id
  let { data } = await supabase.from('faelle').select(FALL_SELECT).eq('id', routeId).maybeSingle()
  // 2) Neuer Key: routeId == claim_id
  if (!data) ({ data } = await supabase.from('faelle').select(FALL_SELECT).eq('claim_id', routeId).maybeSingle())
  return data
}
```

- [ ] **Step 2 — tsc grün.** `npx tsc --noEmit` → exit 0. (`FALL_SELECT` muss `claim_id` enthalten.)

- [ ] **Step 3 — Canonicalize in der Route.** `src/app/faelle/[id]/page.tsx` nach `const fall = await getFallById(supabase, id)` (Z.71):

```ts
const claimId = (fall as Record<string, unknown>).claim_id as string | null
if (claimId && id !== claimId) redirect(`/faelle/${claimId}`)
const id_resolved = fall.id as string // alle Sub-Queries nutzen weiter die faelle.id
```
(Variablen-Namen an Bestand anpassen; die ~10 `.eq('fall_id', id)`-Queries bleiben — `id` = resolved faelle.id.)

- [ ] **Step 4 — Daten-Äquivalenz live.** `execute_sql`: für 3 reale Fälle prüfen, dass `getFallById(faelle.id)` und `getFallById(claim_id)` denselben Record liefern (claim_id ↔ faelle.id eindeutig, 0 mismatch).

- [ ] **Step 5 — Build + Smoke.** `npx tsc --noEmit` grün; Staging-Smoke: `/faelle/<fallId>` → 308 → `/faelle/<claimId>` (200, Fallakte rendert identisch), Screenshot im selben Turn auswerten. Alt-Bookmark + neuer Key beide funktional.

- [ ] **Step 6 — Commit** (Branch `kitta/cmm49-pc1-admin-route-accept-both`, PR gegen staging, 7-Punkte-Audit im Body, 939-Sign-off referenzieren).

---

## 6. PC-2..PC-7 (Sub-Projekt-Stubs — je einzeln planen)

- **PC-1b** Nachbesichtigung-Route `[fall_id]`→accept-both (kleiner; nach PC-1).
- **PC-2** JOIN-Migration per Tabelle: Reihenfolge nach Coverage = sla_tracking✅/kanzlei_faelle✅/auftraege✅ zuerst, dann tasks/gutachter_termine/pflichtdokumente (Orphan-sicher), nachrichten (Coverage prüfen, **939-Chat-Lane**). Pattern: Source-`claim_id` threaden, `.eq('fall_id', x)` → `.eq('claim_id', cid)`; pro Tabelle EXCEPT-0/0 + tsc. **Pro Tabelle vorher `count(*) where fall_id is not null and claim_id is null` = 0 verifizieren.**
- **PC-3** Identity-Output-Sweep: NACH PC-1. Links `/faelle/${fallId}` → `/faelle/${claimId}` per Portal-Domäne (admin Kanban/Widgets/Kalender/Finance/Statistiken zuerst — NICHT-Fallakte). Quelle muss claim_id liefern (v_claim_listing exponiert beides).
- **PC-4** RPC-Varianten: `delete_fall_komplett` + `link_lead_data_to_fall` claim_id-fähig machen (DDL via Plugin; `delete_fall_komplett` = Fallakte-Löschung, 939). Drop-brechend → vor Drop.
- **PC-5** `v_claim_listing` faelle-frei → **CMM-66**. Drop-brechend.
- **PC-6** Insert-Writer `fall_id:` → zusätzlich/statt `claim_id:` (Layer B; additiv first, Boy-Scout).
- **PC-7** `ALTER TABLE <t> DROP COLUMN fall_id` je Tabelle — **ganz am Ende**, nachdem PC-2+PC-6 für die Tabelle durch sind. DDL via Plugin.

---

## 7. Risiken / Fallen

- **Coverage-%-Falle:** Niedrige claim_id-Coverage ≠ ungated. Maßgeblich ist `fall_id-set-but-claim_id-null = 0` (Orphans egal). Pro Tabelle frisch messen.
- **claims.lead_id ≠ faelle.lead_id** (2/76, #2187): lead_id-Identity-Reads sind NICHT 1:1 äquivalent (send-lead-reminders-Befund). Bei lead-gekeyten Skip/Dedup-Logiken EXCEPT prüfen.
- **DROP CASCADE droppt FK, nicht Spalte:** Sub-Entity-`fall_id`-Filter überleben den Drop → nicht panisch alle 250 vor dem Drop migrieren. Kritischer Pfad = Views+RPCs+Reader.
- **Multi-Lane-Trampeln:** Fallakte/Chat/Parteien/Termine/v_claim_listing sind fremd-besetzt. Kollisions-Check + Aaron-Abstimmung Pflicht.
- **Geteilte prod+staging-DB:** Backfills nur additiv, via `apply_migration`, EXCEPT-0/0 (AGENTS Regel 2).
- **Redirect-Loop-Gefahr (PC-1):** Canonicalize nur feuern wenn `claimId && id !== claimId` (sonst Endlos-308). Kunde-Route macht's korrekt — kopieren.

---

## 8. Self-Review (gegen das Inventar)

- ✅ Bucket 1 (Routen) → PC-1 + PC-1b.
- ✅ Bucket 2 (~250 Joins/18 Tische) → PC-2 (Coverage-gestaffelt) + Koordinations-Map.
- ✅ Bucket 3 (~90 Outputs) → PC-3 (gated auf PC-1).
- ✅ Bucket 4 (2 RPCs) → PC-4.
- ✅ Bucket 5 (v_claim_listing/Kanban) → PC-5 (CMM-66).
- ✅ Layer-A/B-Klärung verhindert „alle 250 vor Drop"-Übereifer.
- ⚠️ Offene Entscheidung für Aaron: Will er **saubere claim_id-URLs VOR dem Drop** (dann PC-1+PC-3 vorziehen) oder **Drop-first, Cleanliness danach** (dann nur Reader-Sweep + CMM-66 + PC-4 + PC-5 kritisch)?
