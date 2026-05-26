# CMM-65 Part A — Writer-Sweep + Realtime-Subscription auf claims (2026-05-26)

**Teil von:** CMM-44 (Claim-as-SSoT). **Vorgänger:** `handoff-cmm65-partA-session4-writersweep-2026-05-26.md` (#1727, Recon/Klassifizierung der Writer).
**Branch:** `kitta/cmm65-ts-writer-sweep` (eigener Worktree off `origin/staging`). **PR:** gegen `staging`.
**Status:** Reads KOMPLETT (6 PRs, Session 1-4). **Diese Session: alle 16 `faelle.updated_at`-Writer auf claims migriert + die `faelle`-Realtime-Subscription auf `claims` umgestellt** (Aaron-Entscheidung „Voll inkl. Subscription").

---

## 0 · Die entscheidende Live-Befund-Korrektur (vor jeder Implementierung geprüft)

Der Snapshot/Vorgänger ging vom 40-Spalten-Sync-Trigger `trg_sync_faelle_to_claims` aus. **Der ist live WEG.** Aktuelle Trigger (live `pg_trigger` 2026-05-26):
- `claims`: `trg_claims_updated_at` = **BEFORE UPDATE (all cols)** → jeder claims-Write bumpt `claims.updated_at`.
- `faelle`: `update_faelle_updated_at` = **BEFORE UPDATE (all cols)** → jeder faelle-Write bumpt `faelle.updated_at` (der explizite `updated_at:`-Payload war immer redundant).
- `faelle`: `trg_sync_faelle_sv_id_to_claims` = `AFTER UPDATE OF sv_id` → `sync_faelle_sv_id_to_claims()` macht `UPDATE claims SET sv_id=NEW.sv_id WHERE id=claim_id` **nur wenn sv_id DISTINCT** → bumpt claims.updated_at.
- `claims`: `trg_sync_claims_sv_id_to_faelle` = `AFTER UPDATE OF sv_id` → spiegelt claims.sv_id zurück nach faelle.sv_id.
- **Kein** allgemeiner faelle→claims-Datensync mehr (nur sv_id). Ein reiner `faelle.update({updated_at})` propagiert NICHTS auf claims.

**Daraus folgt die Klassifizierung:** ein Writer ist **DROP** wenn in derselben Aktion ein Sibling-Write claims.updated_at ohnehin bumpt (sv_id-Write → sv_id-Sync-Trigger, oder `setSvIdForFall`, oder ein `claims.update(...)`), sonst **MOVE** = expliziter `claims.update({updated_at}).eq('id', claimId)`.

---

## 1 · ⚠️ DISCOVERY: faelle-Realtime-Kopplung (der Handoff #1727 hatte sie nicht)

`FallRealtimeRefresh` (+ Feldmodus `SvFallakteView`) abonnierten `postgres_changes UPDATE` auf **`table:'faelle'`** (`id=eq.fallId`), gemountet auf **allen drei** Fall-Seiten (Kunde/SV/Admin) + Feldmodus. Mehrere `faelle.update({updated_at})`-„Touches" existierten **genau dafür** (z.B. `termin-verlegung-actions` Kommentar: „faelle.updated_at berühren damit FallRealtimeRefresh feuert"). Ein reiner MOVE auf claims hätte den Live-Refresh stumm gebrochen.

**Aaron-Entscheidung: „Voll inkl. Subscription"** → Writer auf claims UND Subscription auf claims. **Kein DDL nötig** — `claims` ist bereits in `supabase_realtime` (Migration `20260502004338`) mit `REPLICA IDENTITY FULL`; live verifiziert. RLS: `claims_kunde_via_party_select` (Kunde via `auth.uid()`+claim_parties), `is_sv_for_claim` (SV), `is_admin()` (Admin) — alle realtime-fähig.

---

## 2 · Realtime-Subscription-Migration (Code, kein DDL)

- `components/fall/FallRealtimeRefresh.tsx`: neuer **`claimId: string | null`**-Prop; der dritte Leg ist von `table:'faelle' id=eq.fallId` auf `table:'claims' id=eq.claimId` umgestellt (guard auf claimId). Die `gutachter_termine`- + `auftraege`-Legs (fall_id) bleiben unverändert.
- Caller: `FallakteShell` (hat `claimId`-Prop), `FallDetailClient` + `kunde/faelle/[id]/page` (`fall.claim_id`).
- `gutachter/feldmodus/SvFallakteView.tsx` + `_fallakte/actions.ts`: `FeldmodusFallakteFall` um `claim_id` erweitert; der faelle-Leg ist analog auf claims umgestellt (re-subscribe sobald `claim_id` geladen).

**Realtime-Smoke (DB-Ebene, live verifiziert):** claims in Publication + REPLICA IDENTITY FULL ✅. Von 55 kunde-eigenen faelle haben **54** `claims.geschaedigter_user_id = kunde_id` → Kunde-Realtime via der **einfachen** `auth.uid()`-Gleichheit (realtime-erprobt, identisch zu faelle's `kunde_id=auth.uid()`); die 1 Restzeile ist durch eine aktive `claim_parties`-Row gedeckt. **Offen (auf staging nach Deploy):** Browser-Cross-Session-Refresh auf den 3 Portalen empirisch bestätigen (Kunde am wichtigsten — sein einziger Termin-Refresh-Leg war faelle).

---

## 3 · Writer-Sweep — 16 Sites (Re-Grep auf staging-tip, alle bestätigt)

**DROP (5)** — Sibling bumpt claims.updated_at (+ hält faelle-Realtime über sv_id-Write am Leben):
| Site | Sibling |
|---|---|
| `gutachter/fall/[id]/actions.ts:574` | `setSvIdForFall` (claims.sv_id) |
| `app/api/termin/ablehnen/route.ts:52` | `setSvIdForFall` |
| `lib/faelle/kb-assignment.ts:71` | `claims.update({kundenbetreuer_*})` |
| `lib/actions/termin-actions.ts:207` | `sv_id:null`-Write → sv_id-Sync-Trigger (updated_at gedroppt, sv_id bleibt) |
| `app/flow/[token]/actions.ts:1220` | `sv_id`-Write → sv_id-Sync-Trigger (updated_at gedroppt, sv_id bleibt) |

**MOVE (11)** → `claims.update({updated_at})` via neuem Shared-Helper `lib/claims/touch-recency.ts` (`touchClaimRecency(client, claimId)` / `touchClaimRecencyByFall(client, fallId)`), non-critical (console.error, kein throw):
- `lib/ai/briefing.ts` + `briefing-structured.ts` (inline-critical beibehalten — Verhalten erhalten; claimId aus fallRow).
- `termin-actions.ts:377/675/850` (gegenvorschlag/annehmen/buchen) — `byFall`.
- `termin-verlegung-actions.ts:330` (`alt.claim_id`).
- `kunde/faelle/[id]/actions.ts:213` (`ownership.claimId`).
- `faelle/[id]/_actions/dokumente.ts:311` (`claimIdForAs`).
- `lib/kanzlei/push-mandat.ts:229` (`fall.claim_id`).
- `api/twilio/inbound-kb-whatsapp/route.ts:128` — `byFall`.
- `kunde/faelle/[id]/_actions/besichtigungsort.ts:69` — besichtigungsort_* bleibt auf faelle (SP-D/CMM-63-Thema), nur der Recency-Bump geht auf claims; nur im Fallback-Branch (Primärpfad schreibt gutachter_termine, hat nie claims.updated_at gebumpt).

Re-Grep nach dem Sweep: **0** `faelle.update({...updated_at})`-Writer übrig (nur `prozess.ts` False-Positive: liest faelle.claim_id, schreibt claims — schon PR #1697).

---

## 4 · Consumer-Kopplung (faelle.updated_at-LESER) — geprüft

| Consumer | Quelle | Status |
|---|---|---|
| `faelle/[id]/_actions/briefing.ts` Rate-Limit (10min) | las `faelle.updated_at` | **GEFIXT → `claims.updated_at`** (Generator bumpt jetzt claims) |
| `v_claim_listing.updated_at` (claim-Listing-Order) | = `claims.updated_at` | bereits SSoT — mein Change macht's responsiver, **kein Gap** |
| `v_claim_full.fall_updated_at` → `pflichtdokumente-reminder` (Idle-Gating) | = `faelle.updated_at` | **CMM-66**: View-Repoint nötig, sonst sehen die moved-Writer-Events das Idle-Gating nicht (minor: ggf. verfrühte Doc-Reminder; deduped + phase-gated) |
| `v_faelle_mit_aktuellem_termin.updated_at` → makler-Akten-Order | = `faelle.updated_at` | **CMM-66**: View-Repoint; Akten bubbeln nicht auf moved-Writer-Events (minor Ordering) |

**LESSON / CMM-66-Caveat:** `claims.updated_at` ist während der laufenden SP-Migration **backfill-clobbered** (jede SP-Backfill-`UPDATE` setzt es neu → 1 distinct value beobachtet). Ein naiver View-Repoint `fall_updated_at → claims.updated_at` tauscht „faelle-stale für moved-writer" gegen „claims-clobbered für alle". CMM-66 sollte einen **dedizierten, backfill-resistenten Aktivitäts-Timestamp** erwägen (eigenes Ticket) statt blind auf claims.updated_at zu zeigen — oder `GREATEST(faelle.updated_at, claims.updated_at)` als Interim.

---

## 5 · Gates
- `tsc --noEmit`: grün (2×, nach dem Rate-Limit-Fix erneut).
- `next build`: grün (`BUILD_EXIT=0`, voll, kein `/gutachter-partner`-SSG-Flake).
- Re-Grep: 0 faelle.updated_at-Writer übrig.
- Realtime: DB-Preconditions live verifiziert; Browser-Smoke auf staging empfohlen.

## 6 · Reststrecke (nach diesem PR)
1. **CMM-66** (View-Repoint, DDL via supabase-CLI): `v_claim_full.fall_updated_at` + `v_faelle_mit_aktuellem_termin.updated_at` + `v_faelle_mit_aktuellem_termin.created_at` auf claims — **mit** Activity-Timestamp-Design (Backfill-Clobber-Caveat oben).
2. **Part B** (DDL): claims ADD `marketing_provision`/`marketing_quelle` (+Backfill) + `zahlungsweg` + Top-Level-Finanz-Reads. CMM-61 (kanzlei_faelle provision/Vollmacht).
3. Dann Phase-6 (`DROP TABLE faelle CASCADE`, CMM-49/SP-L) entsperrt.

**Nicht die Merge-Session** — PR `--base staging`, `sync-watcher` merged bei grünem build.
