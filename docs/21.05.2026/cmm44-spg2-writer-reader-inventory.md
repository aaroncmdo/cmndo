# CMM-44 SP-G2 — Writer/Reader Inventory (PR1 basis)

**Datum:** 2026-05-21
**Branch:** kitta/cmm-44-spg2-pr1-writer-reader
**Methode:** paren-balanced grep via `scripts/cmm44-spg2-writers-grep.mjs` + manuelles File-Lesen

---

## 1 · Grep-Rohausgabe (vollstaendig)

```
src\app\api\admin\create-test-fall\route.ts:163 | insert | claim_id:NO
src\app\api\seed-testdata\route.ts:617 | insert | claim_id:NO
src\app\api\webhooks\twilio\inbound\route.ts:164 | insert | claim_id:NO
src\app\dispatch\leads\[id]\_actions\sv-termin.ts:198 | insert | claim_id:NO
src\app\dispatch\leads\[id]\_actions\sv-termin.ts:204 | insert | claim_id:NO
src\app\faelle\[id]\_actions\termine.ts:76 | insert | claim_id:NO
src\app\gutachter\kalender\actions.ts:48 | insert | claim_id:NO
src\app\gutachter\kalender\actions.ts:55 | insert | claim_id:NO
src\app\kunde\re-termin\[token]\actions.ts:69 | insert | claim_id:NO
src\lib\actions\termin-verlegung-actions.ts:267 | insert | claim_id:NO
src\lib\actions\termin-verlegung-actions.ts:280 | insert | claim_id:NO
src\lib\actions\termin-verlegung-actions.ts:519 | insert | claim_id:NO
src\lib\auftrag\create.ts:26 | insert | claim_id:NO
src\lib\dispatch\konfrontations-dispatch-lite.ts:104 | insert | claim_id:NO
src\lib\dispatch\konfrontations-dispatch-lite.ts:120 | insert | claim_id:NO
src\lib\google-calendar\sv-event-sync.ts:190 | insert | claim_id:NO
src\lib\onboarding\slots.ts:289 | insert | claim_id:NO
src\lib\smoke\lifecycle-seed.ts:277 | insert | claim_id:NO
src\lib\termine\bestaetigung.ts:15 | insert | claim_id:NO
src\lib\termine\bestaetigung.ts:26 | insert | claim_id:NO
src\lib\termine\kb-booking.ts:152 | insert | claim_id:NO
src\lib\termine\kb-booking.ts:261 | insert | claim_id:NO
src\lib\termine\sv-ablehnung.ts:60 | insert | claim_id:NO
src\lib\termine\sv-gegenvorschlag.ts:36 | insert | claim_id:NO

TOTAL INSERT/UPSERT SITES: 24
MISSING claim_id: 24
```

---

## 2 · False-Positive-Triage

The paren-balanced script matches `.from('gutachter_termine')` then scans 600 chars ahead for
`.insert(`. Several hits find an `.insert` that belongs to a *different* table (timeline, tasks,
auftraege, Google Calendar API). After manual inspection:

| Grep hit | Why false positive |
|---|---|
| `twilio/inbound/route.ts:164` | `.update({status:'bestaetigt'})` on GT; the `.insert` 600 chars later is for `timeline` |
| `auftrag/create.ts:26` | `.update({auftrag_id})` on GT; the `.insert` 600 chars later is `auftraege.insert` |
| `sv-event-sync.ts:190` | `.update({google_event_synced_at})` on GT; the `.insert` 600 chars later is `calendar.events.insert` (Google API, not Supabase) |
| `bestaetigung.ts:15` | `.update({status:'bestaetigt',...})` on GT; insert is for `timeline` |
| `bestaetigung.ts:26` | `.select('id, fall_id, sv_id, start_zeit')` on GT; insert is for `timeline` |
| `sv-ablehnung.ts:60` | `.select('*',{count:'exact'})` on GT; insert is for `tasks` |
| `sv-gegenvorschlag.ts:36` | `.update({status:'gegenvorschlag'})` on GT; insert is for `timeline` |
| `kb-booking.ts:261` | `.update({status:'kunde_storniert'})` on GT; insert is for `timeline` |
| `dispatch/leads/sv-termin.ts:198` | `.update({status:'storniert'})` on GT; the 600-char window extends into the real insert at line 204 — duplicate hit of the same insert |
| `gutachter/kalender/actions.ts:48` | `.select('id, created_at')` on GT (conflict-list fetch); 600-char window reaches the real insert at line 56 |
| `konfrontations-dispatch-lite.ts:104` | `.select('id')` on GT (idempotency check); 600-char window reaches the real insert at line 120 |
| `termin-verlegung-actions.ts:267` | `.update({status:'verlegt'})` on GT; 600-char window reaches the next `.insert` at line 281 (same function) |
| `termin-verlegung-actions.ts:280` | Real `.from('gutachter_termine').insert(...)` — duplicate of the `.from` just before the insert at line 281 |

**True insert sites: 11 (see Section 3)**

Note: `termin-verlegung-actions.ts:280` and `:267` both point to the same insert block at lines
279-294. Line 280 is the canonical hit. Similarly `sv-termin.ts:198` and `:204` point to the same
insert (lines 203-214); line 204 is the canonical hit.

---

## 3 · Writer Table — True INSERT Sites

| file:line | op | claim_id in payload? | pattern | claim_id source var / notes |
|---|---|---|---|---|
| `src/app/api/admin/create-test-fall/route.ts:163` | insert | NO | W-A | `fall` select returns only `id`; extend to include `claim_id` directly. Test/seed route. |
| `src/app/api/seed-testdata/route.ts:617` | insert | NO | W-A | `fallIds[]` are IDs only; extend loop to carry `claimIds[]` alongside. Seed route. |
| `src/app/dispatch/leads/[id]/_actions/sv-termin.ts:204` | insert | NO | W-D | Pre-fall, lead-phase only (`lead_id` set, `fall_id` intentionally absent per file comment: "Pre-FlowLink SV-Auswahl"). No fall/claim in scope. Leave NULL. |
| `src/app/faelle/[id]/_actions/termine.ts:76` | insert | NO | W-A | `fall` loaded via `.select('id, kunde_id, lead_id, claims:claim_id(kundenbetreuer_id)')`. `claim_id` is embedded as `fall.claims.claim_id` (not top-level). Extend fall select to `'...claim_id, claims:claim_id(...)'` → `claim_id: fall.claim_id`. |
| `src/app/gutachter/kalender/actions.ts:56` | insert | NO | W-A | `fall` loaded via `.select('id')` only (auth check then insert). Extend to include `claim_id`. |
| `src/app/kunde/re-termin/[token]/actions.ts:69` | insert | NO | W-A | `fall` loaded via `.select('id, sv_id, lead_id, re_termin_token_eingelaufen_am, storniert_am')`. Extend to include `claim_id`. `claim_id: fall.claim_id`. |
| `src/lib/actions/termin-verlegung-actions.ts:281` | insert | NO | W-C | `alt` is a `gutachter_termine` row (has `claim_id` set post-CMM-58). Extend `alt` select from `'..., fall_id, kb_id, kanal, typ, status, start_zeit'` to include `claim_id` → `claim_id: alt.claim_id`. |
| `src/lib/actions/termin-verlegung-actions.ts:519` | insert | NO | W-C | Same pattern: `alt` = existing GT row. Extend select to include `claim_id` → `claim_id: alt.claim_id`. |
| `src/lib/dispatch/konfrontations-dispatch-lite.ts:120` | insert | NO | W-A | `fall` loaded via `.select('id, sv_id, ..., claims:claim_id(claim_nummer)')`. `claim_id` is embedded. Extend fall select to also include top-level `claim_id` → `claim_id: fall.claim_id`. |
| `src/lib/onboarding/slots.ts:289` | insert | NO | W-D | GFA (Gutachter-Finder-Anfragen) pre-lead slot reservation. No `fall_id` set — claim-less by design. Leave NULL. |
| `src/lib/smoke/lifecycle-seed.ts:277` | insert | NO | W-A | `fall` created in same function (has `fallId`). Extend fall select / seed logic to carry `claim_id`. Smoke/test only. |
| `src/lib/termine/kb-booking.ts:152` | insert | NO | W-A | `fall` loaded via `.select('id, kunde_id, lead_id, claims:claim_id(kundenbetreuer_id)')`. `claim_id` embedded but not top-level. Extend to include top-level `claim_id` → `claim_id: fall.claim_id`. Prod prod writer. |

### Pattern key

| Pattern | Meaning |
|---|---|
| W-A | `fall`/row already loaded in scope → extend select to include top-level `claim_id`, add `claim_id: <var>.claim_id` to insert |
| W-C | Copy from source termin: `claim_id: quellTermin.claim_id` |
| W-D | Genuinely claim-less (no fall/claim, `fall_id` not set) → leave NULL, no change needed |

### Prod vs. test breakdown

- **Prod writers (need Task 2 changes):** 9 sites  
  - W-A (6): `faelle/_actions/termine.ts:76`, `gutachter/kalender/actions.ts:56`, `kunde/re-termin/[token]/actions.ts:69`, `konfrontations-dispatch-lite.ts:120`, `kb-booking.ts:152`, `lifecycle-seed.ts:277` (smoke only, but fix for correctness)
  - W-C (2): `termin-verlegung-actions.ts:281`, `termin-verlegung-actions.ts:519`
  - W-D (2): `dispatch/leads/sv-termin.ts:204` (lead-phase, no fall), `onboarding/slots.ts:289` (GFA, no fall)

- **Test/seed writers (fix for clean seeds, not prod-critical):** 2 sites  
  - W-A: `create-test-fall/route.ts:163`, `seed-testdata/route.ts:617`

---

## 4 · Reader Classification

### 4.1 Already correct

`src/lib/termine/get-sv-tagesplan.ts` reads via `faelle!gutachter_termine_fall_id_fkey` with embedded
`claims:claim_id(...)` — uses `fall_id` FK join for address data, not claim resolution. Not R-A but
also already passing `claim_id` correctly for the specific field it needs.

### 4.2 R-A — Switch to gt.claim_id in Task 2

These read a termin, then navigate `gt.fall_id` → `faelle.claim_id` or `faelle.claims:claim_id(...)`
**purely** (or primarily) to resolve the claim identity. After PR1+PR2, `gt.claim_id` is SSoT.

**None found in the strict definition.**

Investigation notes:
- `src/app/kunde-termin/[token]/actions.ts:60` — loads `faelle.select('lead_id, claims:claim_id(claim_nummer)').eq('id', termin.fall_id)` to get `claim_nummer`. Also uses `fall.lead_id` as fallback for customer name. Because it needs `lead_id` from `faelle` too, this is R-B (conservative). Post-Phase-6 this would be a clean R-A candidate.
- `src/app/api/termin/ablehnen/route.ts:76` — loads `faelle.select('lead_id, claims:claim_id(claim_nummer)').eq('id', termin.fall_id)`. Also needs `lead_id`. R-B (conservative).
- `src/app/api/kunde/termin/absagen/route.ts:49` — loads `faelle.select('id, kunde_id, lead_id, claims:claim_id(kundenbetreuer_id, claim_nummer)').eq('id', termin.fall_id)`. Ownership check (kunde_id) + claim data. R-B.
- `src/app/api/kunde/termin/verschieben/route.ts:50` — same pattern: needs kunde_id for auth. R-B.
- `src/app/api/kunde/termin/ics/[id]/route.ts:36` — needs kunde_id + lead_id + vehicle fields from faelle. R-B.

**Conclusion:** No pure R-A readers found. All `termin.fall_id → faelle` readers in the termin/API paths
also need other `faelle` columns (kunde_id, lead_id, vehicle), making them R-B until Phase 6.

### 4.3 R-B — Keep as-is (fall_id stays until Phase 6)

| file | purpose | why keep |
|---|---|---|
| `src/lib/termine/actions.ts:66,71,93,264,459,...` | Timeline inserts, status transitions, notifications | `timeline.fall_id`, `transitionFallStatus(termin.fall_id, ...)`, `lead_id` from `faelle` |
| `src/lib/termine/bestaetigung.ts:51` | WhatsApp + Email send after confirmation | Needs `lead_id` + `besichtigungsort_adresse` from `faelle` |
| `src/lib/termine/notify-kunde-angekommen.ts:20` | Customer arrival notification | Needs `lead_id` from `faelle` |
| `src/lib/termine/get-by-token.ts:74,78,92` | Token-based termin page load | Needs vehicle data, parteien FK, lead context all from `faelle` |
| `src/lib/termine/trigger-losgefahren.ts:43,47` | SV "on the way" trigger | Needs `schadenort_*` from claims embed + `lead_id` |
| `src/lib/termine/baseline-fahrtzeit.ts:57,60` | Route/ETA baseline calculation | Needs `schadenort_*` from claims embed via faelle.claim_id |
| `src/lib/termine/kb-booking.ts:245` (cancelKbTermin) | Ownership guard | Needs `kunde_id` from `faelle` |
| `src/lib/termine/get-sv-tagesplan.ts:34-58` | SV day plan | Address data from faelle + claims embed via fall_id FK |
| `src/app/api/termin/ablehnen/route.ts:54,76,99` | SV token-based rejection | Needs `lead_id` + `setSvIdForFall` (faelle FK) + ownership; also R-B |
| `src/app/api/kunde/termin/absagen/route.ts:49` | Customer cancel | Needs `kunde_id` + `lead_id` for auth |
| `src/app/api/kunde/termin/verschieben/route.ts:50` | Customer reschedule | Needs `kunde_id` auth |
| `src/app/api/kunde/termin/ics/[id]/route.ts:36` | ICS calendar file | Needs vehicle + customer data from faelle |
| `src/app/kunde-termin/[token]/actions.ts:60` | Token termin display page | Needs `lead_id` fallback + claim_nummer |
| `src/app/mitarbeiter/kundentermine/page.tsx:50` | KB termin list | Joins via `faelle!gutachter_termine_fall_id_fkey` for KB ownership filter |
| `src/app/mitarbeiter/page.tsx:77` | Mitarbeiter dashboard | Same join pattern |
| `src/app/mitarbeiter/termine/page.tsx:60` | Mitarbeiter termine page | Same join pattern |
| `src/app/dispatch/leads/[id]/_actions/sv-termin.ts` `(acceptGegenvorschlag:369-384)` | Reachability check: loads fall/lead for coordinates | Needs besichtigungsort from faelle/leads |

---

## 5 · Out-of-scope notes

- **Test/seed files** (`create-test-fall`, `seed-testdata`, `lifecycle-seed`) appear in the
  writer inventory. Setting `claim_id` in these seeds makes them cleaner but they are not
  production-critical paths for the CMM-58 trigger replacement.
- The spec (Section 3.2) says Views (`v_faelle_mit_aktuellem_termin`, `v_claim_timeline`) are PR2
  work, not PR1.
- `src/lib/termine/sv-gegenvorschlag.ts` does **not** insert into `gutachter_termine` — it only
  `.update({status:'gegenvorschlag', sv_vorgeschlagene_slots: slots})`. Not a writer site.
- `src/app/dispatch/kalender/_actions/spontan.ts` does **not** insert — only a `.select` for
  conflict detection. Not a writer site.
- `src/lib/termine/kb-slots.ts` and `src/lib/termine/slot-grid.ts` — confirmed no GT inserts.

---

## 6 · Task 2 work items (concise)

1. `kb-booking.ts:152` — extend `fall.select(...)` to include top-level `claim_id`; add `claim_id: fall.claim_id` to insert payload.
2. `faelle/_actions/termine.ts:76` — extend `fall.select(...)` to include `claim_id`; add to insert.
3. `gutachter/kalender/actions.ts:56` — extend `fall.select('id')` to `'id, claim_id'`; add to insert.
4. `kunde/re-termin/[token]/actions.ts:69` — extend `fall.select(...)` to include `claim_id`; add to insert.
5. `termin-verlegung-actions.ts:281` — extend `alt.select(...)` to include `claim_id`; copy `claim_id: alt.claim_id`.
6. `termin-verlegung-actions.ts:519` — same as above for `kundeTerminVerlegungVorschlagen`.
7. `konfrontations-dispatch-lite.ts:120` — extend `fall.select(...)` to include top-level `claim_id` (currently has `claims:claim_id(claim_nummer)` embed only); add `claim_id: fall.claim_id` to insert.
8. `lifecycle-seed.ts:277` — extend fall/seed logic to carry `claim_id` (smoke correctness).
9. `dispatch/leads/sv-termin.ts:204` — **no change** (W-D: pre-fall, lead-only phase).
10. `onboarding/slots.ts:289` — **no change** (W-D: GFA, no claim context).
11. `create-test-fall/route.ts:163` — extend `fall.select('id')` to `'id, claim_id'`; add to insert (test route).
12. `seed-testdata/route.ts:617` — carry `claim_id` alongside `fall_id` in seed loop (seed route).
