# Session-Handoff 2026-05-25 — CMM-44 Claim-SSoT (CMM-63 fertig · CMM-65 gescoped)

**Zentraler Einstiegspunkt** für die nächste Session. Verweist auf die zwei Detail-Docs + Memory.
**Master-Ziel:** `claims` = voller SSoT, `faelle` → `DROP TABLE CASCADE` (SP-L / CMM-49).

---

## 0 · TL;DR

1. **CMM-63 (`kunde_id`-Ownership):** kunde-Portal-Strang **KOMPLETT** — 4 PRs (Routing + Layout + Sub-Routes lesen Ownership über `claim_parties`/`claims` statt `faelle.kunde_id`). Rest: PR4 (peripher) + onboarding/page (→ CMM-66).
2. **CMM-65 (Timestamps + Finanz):** **de-risked + voll gescoped**, alle Entscheidungen getroffen. Timestamp-Kern (~91 Sites) verifiziert behavior-preserving → **sofort startbar**.
3. **Architektur entschieden:** Vollmacht auf **beide** Ebenen (claims = Signatur/Claim-Flow, kanzlei_faelle = Übergabe/Provision) → Vorgabe für **CMM-61**.

---

## 1 · Querverweise (Lese-Reihenfolge)

| Doc | Pfad | Inhalt |
|---|---|---|
| **CMM-63-Reststrecke-Handoff** | `docs/25.05.2026/handoff-cmm63-reststrecke.md` (PR #1677) | PR4-Scope (~27 Files/15+ Sites), Test-Fixture-Rezept, Windows-Build/Smoke-Flakes, Gotchas |
| **CMM-65-Slice-Plan** | `docs/25.05.2026/cmm65-timestamps-slice-plan.md` (Branch `kitta/cmm65-timestamps`) | Timestamp-Sweep + Finanz/Vollmacht-Entscheidungen (§3/§3a) |
| Master-Plan (Ziel-Architektur, Phasen) | `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` | — |
| CMM-44 Reststrecke-Handoff (Gesamt) | `docs/24.05.2026/handoff-cmm44-reststrecke.md` | Bucket-Worklist, Reihenfolge |
| VALIDATED Breaker-Inventar | `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` | §V.TS (~91 TS-Sites), Finanz-§§ |
| Memory (Voll-Status + Rezepte + Flakes) | `project_cmm44_spc_kunde_ownership.md` | CMM-63+65+Vollmacht, Test-Fixture, Build-Flakes |
| Memory (Lesson) | `feedback_notfound_trycatch_swallow.md` | notFound-Deny + force-dynamic-Streaming |

---

## 2 · Was diese Session lieferte

### CMM-63 — 4 PRs (kunde-Portal-Ownership-Strang)
| PR | Inhalt | Branch | Status |
|---|---|---|---|
| #1658 | Ownership-Konsolidierung + accept-both-Foundation + Deny-notFound-Fix | `kitta/cmm63-spc1-kunde-ownership` | ✅ gemergt |
| #1662 | Route-Key-Flip `faelle.id → claim_id` (+308-Canonicalize) | `kitta/cmm63-route-key-flip` | ✅ gemergt |
| #1666 | layout-Reader-Rebase (5 Reads) | `kitta/cmm63-pr3-reader-rebase` | ✅ gemergt |
| #1673 | sub-route-Reader-Rebase (5 Reads + `getOwnedClaimIds`) | `kitta/cmm63-pr3b-subroute-reads` | 🟢 offen |

Bausteine: `src/lib/claims/owned-claims.ts` (`getOwnedClaimIds`), `kunde-ownership.ts` (`assertKundeOwnsFall/Claim`), `get-kunde-faelle.ts` (accept-both, `.id` bleibt **faelle.id** wg Chat), Detail-Page claim-id-safe + Deny-Fix (`isHTTPAccessFallbackError`). Smoke-Spec: `tests/e2e/cmm63-kunde-ownership.spec.ts` (5 Tests).

### CMM-65 — Scoping + Architektur (siehe Slice-Plan)
- **Verifiziert live:** `claims.created_at`/`updated_at` existieren+befüllt (kein Schema-Migration); `claims.created_at ≈ faelle.created_at` (52/53 ≤1s) → Timestamp-Sweep behavior-preserving.
- **Entscheidungen (Aaron 2026-05-25):**

| Item | Heimat | Ticket |
|---|---|---|
| `marketing_provision`/`marketing_quelle` | claims ADD + Backfill | CMM-65 |
| `faelle.zahlungsweg` (Kunde-Auszahlungsziel `{kundenkonto,werkstatt_direkt}`) | claims ADD (all-null, kein Backfill) | CMM-65 |
| `claim_payments.zahlungsweg` (Methode) | bleibt draußen ✓ | SP-J (done) |
| `kanzlei_provision_status`/`honorar`/`ausgezahlt_am` | kanzlei_faelle | **CMM-61** |
| **Vollmacht-Übergabe** `vollmacht_uebergeben_am`+Doc-Ref | kanzlei_faelle (Provisions-Trigger) | **CMM-61** |
| `claims.vollmacht_signiert_am` (Signatur) | claims bleibt — Claim-Flow-Gate (Kundenkonto/Flowlink + Komplettpaket → Marge) | — |

---

## 3 · Nächste Schritte (priorisiert)

1. **CMM-65 Timestamp-Sweep** (startbar, behavior-preserving, Per-Domänen-PRs: finance/prozess/admin-dispatch/cron) → `faelle.created_at/updated_at` Reads/Writes auf `claims`. Daten-Layer-Smoke: `claims.created_at == faelle.created_at`.
2. **CMM-65 Finanz-ADDs:** `claims` ADD `marketing_provision`/`marketing_quelle` (+Backfill) + `zahlungsweg` (all-null) + Reader-Sweep der Top-Level-faelle-Reads.
3. **CMM-61** (kanzlei_faelle): `kanzlei_provision_*`/`kanzlei_honorar` → kanzlei_faelle + **Vollmacht-Übergabe-Architektur** (`vollmacht_uebergeben_am`+Doc-Ref); `stripe/webhook:338` latent-buggy → `upsertKanzleiFall`. (Detail: `claims.kanzlei_uebergeben_am` vs neues `vollmacht_uebergeben_am` reconcilen.)
4. **CMM-63-Tail:** PR4 (peripher ~27 Files, sensibel, low-urgency — Daten-Layer-smoken, nicht Notify-triggern) + onboarding/page (→ CMM-66 View-Rebase).
5. **CMM-50** (vehicles, `vehicle_id`-Backfill zuerst) + **CMM-66** (Views Teil 2) + **CMM-62→64** → dann **SP-L / CMM-49** (`DROP TABLE faelle CASCADE`).

---

## 4 · Aufsetz-Rezept (Kurz — Details in den Detail-Docs)

- **Branch off `origin/staging`** (PRs squash-gemergt → alte Branch nicht mehr Ancestor; nicht re-pushen, frische Branch).
- **Test-Fixture (kunde owned-fall)** + **Windows-Build/Smoke-Flakes** (EBUSY→`rm .next`; `--workers=1`; kein `; echo`; `NODE_OPTIONS=8192`): siehe `handoff-cmm63-reststrecke.md §5` + Memory.
- **supabase-js node hängt** → `fetch`+`AbortController`/`curl` (service-role).
- **DB-Reads/Migration:** `information_schema` live vor Migration; DDL nur via CLI (Regel 2).
- **Nicht Merge-Session** (das ist `sync-watcher`): PR gegen `staging` + berichten, nicht selbst mergen. Offener nicht-Draft staging-PR **wird** gemergt → erst öffnen wenn grün.

---

## 5 · Verifizierte Fakten (nicht neu herausfinden)

- `claim_parties(geschaedigter).user_id == faelle.kunde_id` (45/45) → Ownership-Rebases behavior-preserving.
- `claims.created_at ≈ faelle.created_at` (52/53 ≤1s) → Timestamp-Sweep value-neutral.
- `faelle.zahlungsweg` = Kunde-Auszahlungsziel `{kundenkonto,werkstatt_direkt}` ≠ `claim_payments.zahlungsweg`-Methode.
- `getKundeFaelle.id` MUSS `faelle.id` bleiben (Chat `nachrichten.fall_id`).
- `claims.geschaedigter_user_id` hat 1 Test-Drift → NICHT als Ownership-Filter.
- Detail-Page deny: `force-dynamic` streamt 200 vor `notFound()` → Deny **content-based** smoken (Not-Found-UI, kein Leak), nicht auf 404.

---

## 6 · Offene PRs (Merge-Watcher zieht sie)

- **#1673** — CMM-63 PR3b (sub-route reads).
- **#1677** — CMM-63 Reststrecke-Handoff.
- **`kitta/cmm65-timestamps`** — CMM-65-Slice-Plan (gepusht; PR folgt mit dem Sweep oder separat).
- **`kitta/cmm44-session-handoff-2026-05-25`** — dieses Doc.
