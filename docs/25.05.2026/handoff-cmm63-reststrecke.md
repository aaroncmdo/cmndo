# CMM-63 (SP-C `kunde_id`-Ownership) — Reststrecke-Handoff

**Stand:** 2026-05-25 · **Master:** CMM-44 (Claim-as-SSoT-Vollmigration) · **Für:** die nächste Session, die CMM-63 weiterführt.

---

## 0 · TL;DR (6 Sätze)

1. **Der kunde-Portal-Ownership-Strang ist KOMPLETT** — Routing + Layout + Sub-Routes lesen Ownership jetzt über `claim_parties(geschaedigter)`/`claims` statt `faelle.kunde_id`.
2. Geliefert in **4 PRs**: #1658 + #1662 + #1666 **gemergt**, **#1673 offen** (mergeable, Merge-Watcher zieht ihn).
3. **Offen in CMM-63:** **PR4** (peripher — Notify/Cron/Calendar/Comms) + **onboarding/page** (gehört zu CMM-66 View-Rebase).
4. **PR4 ist groß + sensibel** (~27 Files / 15+ Notify-Recipient-Resolution-Sites) und **low-urgency** (die Reads funktionieren bis zum faelle-Drop) — siehe §3.
5. **Gates fürs faelle-Drop (SP-L / CMM-49):** CMM-50 (vehicles), CMM-65 (timestamps), CMM-66 (Views), CMM-61, CMM-64 — erst danach sind die letzten kunde-Reads faelle-frei.
6. **Verifizierte Invariante (Basis aller Rebases):** `claim_parties(geschaedigter).user_id == faelle.kunde_id` (45/45 sauber) → alle Rebases sind **behavior-preserving**.

---

## 1 · Querverweise (Lese-Reihenfolge)

| Was | Pfad |
|---|---|
| **Master-Plan** (Ziel-Architektur, Phasen 0–6) | `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` |
| CMM-44 Reststrecke-Handoff (Gesamt-Strecke, Bucket-Worklist) | `docs/24.05.2026/handoff-cmm44-reststrecke.md` |
| **CMM-63 Slice-Plan** (PR0–PR5, Surface, Gates) | `docs/24.05.2026/cmm63-kunde-portal-rebase-plan.md` |
| VALIDATED Breaker-Inventar (genuine Breaker nach Bucket) | `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` |
| Memory: CMM-63 Voll-Status + Test-Fixture-Rezept + Build-Flakes | `project_cmm44_spc_kunde_ownership.md` |
| Memory: SP-C Daten-Migration (SP-C1/C2/C3, Mapping) | `project_cmm44_spc_status.md` |
| Memory: notFound-Deny-Falle + force-dynamic-Streaming | `feedback_notfound_trycatch_swallow.md` |
| Memory: information_schema live prüfen vor Migration | `feedback_information_schema_check.md` |

---

## 2 · Geliefert diese Session (CMM-63 PR1–PR3b)

| PR | Inhalt | Branch | Commit | Status |
|---|---|---|---|---|
| **#1658** | Ownership-Konsolidierung (11 inline-Checks → `assertKundeOwnsFall`) + accept-both-Foundation (`assertKundeOwnsClaim`, `getKundeFallDetailRecord`) + **Deny-notFound-Fix** | `kitta/cmm63-spc1-kunde-ownership` | `eaa03202` | ✅ gemergt |
| **#1662** | **Route-Key-Flip** `faelle.id → claim_id` (Links + Detail-Page claim-id-safe + 308-Canonicalize) | `kitta/cmm63-route-key-flip` | `9d8ec94f` | ✅ gemergt |
| **#1666** | **layout-Reader-Rebase** (5 `faelle.kunde_id`-Reads → navFaelle/claims) | `kitta/cmm63-pr3-reader-rebase` | `b61167c1` | ✅ gemergt |
| **#1673** | **sub-route-Reader-Rebase** (5 Reads + `getOwnedClaimIds`-Helper) | `kitta/cmm63-pr3b-subroute-reads` | `5e531704` | 🟢 offen |

### Zentrale neue/geänderte Bausteine
- **`src/lib/claims/owned-claims.ts` → `getOwnedClaimIds(admin, userId, email)`** — userId → owned `claim_id[]` (claim_parties-primär, `faelle.kunde_id` + `lead.email` als Transitions-Fallback). Das Ownership-Primitiv für kunde-Reads.
- **`src/lib/claims/kunde-ownership.ts`** — `assertKundeOwnsFall` (3-stufig) + `assertKundeOwnsClaim` (claim-nativ). `claims.geschaedigter_user_id` ist **nur Fallback** (1 Test-Drift, NICHT als alleiniger Ownership-Filter).
- **`src/lib/claims/get-kunde-faelle.ts`** — `getKundeFaelle` (Liste) + `getKundeFallDetailRecord` (accept-both Detail-Loader). **`.id` bleibt faelle.id** (kein claim_id!) — Consumer wie chat hängen daran (`nachrichten.fall_id` = faelle.id, nicht migriert).
- **`src/app/kunde/faelle/[id]/page.tsx`** — Route-Param `routeId` (accept-both), intern `const id = fall.id`, 308-Canonicalize faelle.id→claim_id; Deny via `isHTTPAccessFallbackError`-Re-Throw.
- **Smoke-Spec:** `tests/e2e/cmm63-kunde-ownership.spec.ts` (5 Tests).

### Architektur-Entscheidungen (für PR4 relevant)
1. **Link-Source statt `getKundeFaelle.id = claim_id`** — `.id` bleibt faelle.id; nur Link-Quellen emittieren `claim_id ?? id`. Grund: `fallOptionsForChat.id` → `nachrichten.fall_id` keyt auf faelle.id.
2. **Admin-Client + explizite Ownership-Auflösung** (statt User-RLS auf `faelle.kunde_id`) ist das etablierte Pattern für kunde-Reads.
3. **Detail-Page deny:** `force-dynamic` streamt die Layout-Shell (HTTP 200) BEVOR `notFound()` rendert → Deny-Status ist **nicht** 404, sondern 200 mit Not-Found-UI. Smoke daher **content-based** (Not-Found-UI sichtbar, kein Daten-Leak). Siehe `feedback_notfound_trycatch_swallow`.

---

## 3 · Offen — PR4 (peripher) · **NÄCHSTER CMM-63-SLICE**

**Pattern:** `fall.kunde_id` → `profiles.telefon/email`, um **den Kunden zu benachrichtigen**. ~**27 Files / 15+ Sites** in sensiblen Pfaden. **Inverser** Lookup zu getOwnedClaimIds (claim → kunde, nicht user → claims).

### Benötigter Helper (neu)
```ts
// src/lib/claims/owned-claims.ts (oder kunde-ownership.ts)
getKundeUserIdForClaim(admin, claimId): Promise<string | null>
//   claim_parties(rolle=geschaedigter, claim_id).user_id  (primär)
//   → Fallback faelle.kunde_id (Transition bis SP-L)
```

### Betroffene Files (re-greppen vor jedem Edit — Inventar ist stale)
- `src/lib/notifications/fan-out.ts` (`kundeUserId: fall.kunde_id`)
- `src/lib/whatsapp.ts` (telefon-Fallback via kunde_id)
- `src/lib/actions/termin-actions.ts` (~6 Notify-Recipient-Sites)
- `src/lib/actions/termin-verlegung-actions.ts`
- `src/lib/communications/send-fall.ts`
- `src/lib/aircall/bridge.ts`
- `src/lib/email/google/flows.ts`
- `src/lib/google-calendar/sv-termin-sync.ts` · `src/lib/kalender/caldav/sv-termin-sync.ts`
- `src/lib/kanzlei/email-fallback.ts` · `src/lib/kanzlei/push-mandat.ts`
- `src/lib/sla/kanzlei-mahnungen.ts` · `src/lib/termine/kb-booking.ts`
- `src/app/api/cron/kb-termin-reminder/route.ts` (+ `-1h`) · `…/termin-morgen-erinnerung/route.ts` · `…/termin-erinnerungen/route.ts`
- **Re-grep:** `grep -rlnE "select\('[^']*kunde_id" src/lib src/app/api src/app/gutachter` (~27 Treffer; davon Writes + admin/dispatch-Reads + `claims.geschaedigter_user_id` ausklammern — nur die **kunde-Recipient-Resolution** rebasen).

### Warum NICHT im Marathon-Tail gegrindet (Entscheidung 2026-05-25)
- **Sensibel:** Fehlerhafte Empfänger-Auflösung = WhatsApp/Email an falsche Person/niemanden.
- **Schwer smoke-bar:** Verifikation braucht Cron/Notify/Calendar-Trigger (kein Portal-Smoke).
- **Low-urgency:** Reads funktionieren (faelle.kunde_id ist befüllt); Entkopplung ist Vorarbeit fürs faelle-Drop (SP-L), das weit weg + gated ist.

### Wie verifizieren (PR4)
- **Daten-Layer-Smoke** (kein Notify-Trigger nötig): für reale faelle `claim_parties(geschaedigter).user_id == faelle.kunde_id` prüfen (Muster: `scripts/smoke-cmm63-ownership.mjs`). Rebase ist behavior-preserving wenn Invariante hält.
- Build grün + `getKundeUserIdForClaim` an allen Sites (statisches Re-Grep auf `\.kunde_id` in den Files = 0 Recipient-Reads übrig).

---

## 4 · Weiter offen (CMM-63-nah)

- **`src/app/kunde/onboarding/page.tsx`** — liest die **View** `v_faelle_mit_aktuellem_termin` mit `.eq('kunde_id', user.id)`. View-Rebase gehört zu **CMM-66** (dort den View-`kunde_id`/`claim_id`-Repoint mit-erledigen + diesen Reader auf `claim_id` ziehen).
- **`getOwnedClaimIds`-Fallback** (`faelle.kunde_id` + `lead.email`) + die **faelle-RLS-Policy** (`kunde_id = auth.uid()`) bleiben bis SP-L bzw. einer separaten RLS-Migration — beim faelle-Drop abräumen.

---

## 5 · Aufsetzen für die nächste Session (Rezept)

### Branch-Strategie
- **Frische Branch off `origin/staging`** (PRs werden squash-gemergt → alte Branches sind NICHT mehr Ancestor; nicht re-pushen). PR4 berührt peripher, **nicht** kunde-Portal → kein Konflikt mit #1673.

### Test-Fixture (kunde owned-fall, prod) — `test-kunde@claimondo.de` / `Test1234!` (`113aebe5-0630-4753-809a-6756df5ba432`) besitzt NICHTS, also anlegen:
- `claims{ status: 'dispatch_done'` (claims_status_check — **NICHT 'neu'**!)`, geschaedigter_user_id, schadentag, onboarding_complete: true }` ← **onboarding_complete=true Pflicht**, sonst leitet das layout ALLE `/kunde/*` auf `/kunde/onboarding` um und maskiert den Smoke.
- `claim_parties{ rolle: 'geschaedigter', user_id, quelle: 'lead_konvertierung'` (NOT NULL!)`, vorname, nachname }`
- `faelle{ claim_id, kunde_id, status: 'ersterfassung'` (fall_status-enum — **NICHT 'neu'**!)`}`
- **Cleanup danach:** DELETE `nachrichten`/`timeline`/`tasks`/`gutachter_termine` by `fall_id`, dann `faelle`/`claim_parties`/`claims`.

### Build / Smoke — Windows-Flakes (wiederkehrend)
- `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (4 GB OOMt am TS-Worker).
- **Nicht** `npm run build … ; echo $?` — das `; echo` maskiert den Exit-Code. Als `run_in_background` ohne `; echo` laufen lassen → Task-Exit = npm-Exit.
- **EBUSY** beim `output:standalone`-copyfile → `rm -rf .next` + Rebuild.
- Playwright **`--workers=1`** + warmer Server: Node-24 wirft sonst `controller[kState].transformAlgorithm is not a function` (Response-Streaming-Flake bei Parallel/Cold-Start; Routen liefern trotzdem 200).
- **supabase-js node-Client hängt** in dieser Env → Reads/Writes via `fetch`+`AbortController` bzw. `curl` (service-role).
- Smoke-Spec env: `TEST_KUNDE_EMAIL`/`TEST_KUNDE_PASSWORD`/`CMM63_CLAIM_ID`/`CMM63_FALL_ID`/`CMM63_FOREIGN_CLAIM_ID`.

---

## 6 · Harte Regeln (AGENTS.md — immer)

- PR **gegen `staging`**, NIE direkt `main`.
- DDL nur via supabase-CLI, NIE Management-API.
- **Du bist NICHT die Merge-Session** (das ist die benannte `sync-watcher`-Session, die offene NICHT-Draft-staging-PRs mit grünem Build autonom squash-mergt) → PR öffnen + berichten, nicht selbst mergen. Ein offener staging-PR **wird** gemergt — also erst öffnen, wenn Smoke grün.
- 7-Punkt-Audit im Commit-Body.
- Vor Start: Branch + Task melden, andere aktive Sessions checken (Branch-Kollision).

---

## 7 · Verifizierte Fakten / Gotchas (nicht neu herausfinden)

- `claim_parties(geschaedigter).user_id == faelle.kunde_id` — 45/45 sauber → Rebases behavior-preserving.
- `claims.geschaedigter_user_id` hat **1 Test-Drift** (CLM-2026-00115) → **NICHT** als Ownership-Filter.
- `getKundeFaelle.id` MUSS `faelle.id` bleiben (Chat `nachrichten.fall_id`).
- Detail-Page-Sub-Queries keyen auf `fall.id` (faelle.id) — der Route-Param ist claim_id (accept-both im Loader auflösen, NICHT direkt als fall_id verwenden).
- `.in('claim_id', [])` (leeres owned-Array) liefert sauber leeres Ergebnis (kein owned claim).
