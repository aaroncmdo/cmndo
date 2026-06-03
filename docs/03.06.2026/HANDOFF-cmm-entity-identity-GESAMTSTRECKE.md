# HANDOFF — CMM Entity-Model + Identitäts-Auflösung — GESAMTSTRECKE

**Stand 2026-06-03 EOD. Einstiegspunkt für die nächste Session der GESAMTEN Strecke (nicht nur Identitäts-Merge).**
DB-Projekt: **`paizkjajbuxxksdoycev`** (prod+staging teilen die DB). DDL **nur** via Supabase-Plugin `apply_migration` (Regel 2).

---

## 0. North Star (eine Strecke, zwei Stränge)

**Der Claim ist das Rückgrat (SSoT). Alle „Dinge der Welt" = globale, eindeutige, claim-übergreifend wiederverwendbare Entitäten (Personen, Fahrzeuge, Versicherer, Werkstätten, Mietwagenunternehmen, SV). Der Claim ordnet pro Fall nur die ROLLE zu. Flache Dopplungen sterben.**

Treiber: **Der Schädiger von heute kann der Kunde von morgen sein** → Entitäten global eindeutig. Die **Identitäts-Auflösung** klärt das schwierigste Teilproblem: *wann sind zwei Auftritte derselbe Mensch — ohne zu leaken und ohne zu mismatchen.*

Zwei Stränge desselben Master-Plans:
- **Strang 1 — Entity-Model** (Ursprungsplan, Phasen 0–5): Entitäten befüllen + Reader umstellen + flache Felder droppen.
- **Strang 2 — Identitäts-Engine** (§12-Reihenfolge): Verified-Contact-Store → Match-Engine → Login-Tor → Hard-Merge.

---

## 1. PFLICHTLEKTÜRE (in dieser Reihenfolge, VOR jeder Arbeit)

| # | Datei | Inhalt | Branch / PR |
|---|---|---|---|
| 1 | `docs/03.06.2026/HANDOFF-cmm-entity-model.md` | **Ursprungsplan** Entity-Model (Phasen 0–5, Migs, 8 Erkenntnisse, TODOs) | `kitta/cmm-entity-personen` |
| 2 | `docs/03.06.2026/cmm-entity-model-target-spec.md` | Ziel-Datenmodell-Detail + Beschlüsse 1–7 (Aaron) | **#2348 MERGED** |
| 3 | `docs/superpowers/specs/2026-06-03-identitaets-aufloesung-design.md` | Identitäts-Design: Leak≠Dedup, Soft/Hard-Merge, Login-als-Tor, §4 Signal-Tiers, §10 Entscheidungen, **§13 Berater-Schärfungen (A–D)** | `kitta/cmm-identity-resolution-spec` (gepusht) |
| 4 | `docs/superpowers/specs/2026-06-03-verified-contact-store-design.md` | **Diese Session:** Store + Backfill + Match-Fn + Slice A, inkl. Scoring-Tabelle | **PR #2360** (offen) |
| 5 | `docs/superpowers/specs/2026-06-03-login-tor-slice-b-plan.md` | **Slice-B-Plan** (Confirm+Relink+Surface, §3-Entscheidung, Gates) | **PR #2360** (offen) |
| 6 | `docs/03.06.2026/cmm49-drop-execution-playbook.md` + `cmm49-faelle-column-dedup-decision.md` | CMM-49 (faelle-DROP) Parallel-Strecke + Pre-Drop-Verify-Lehre | div. cmm49-Worktrees |
| 7 | Memory: `project_cmm_entity_model`, `feedback_drop_verification_grep`, `feedback_dead_code_activation`, `feedback_use_server_konstanten`, `feedback_rls_function_grants` | Strang-Status + Incident-Lehren | — |

---

## 2. ERLEDIGT (verifiziert)

**Strang 1 — Entity-Model (alle auf staging gemergt):**
- Phase 0 (Dedup/Bridge/CMM-63): #2343/#2344/#2346.
- Phase 1 + 2a (Foundation `personen`/`mietwagenunternehmen`/Links/Rollen + personen-Backfill 73): **#2353**. Migs `20260603152823/153554/153612/154118`.
- Phase 2b: **No-Op** (Quelldaten leer, live verifiziert).
- Phase 3 `person_id`-Writer (`ensurePersonForData` + `relinkPartyPersonOnAccount`, verdrahtet in convert-lead/flow/airdrop): **#2355**.

**Strang 2 — Identitäts-Engine (PR #2360 OFFEN, `kitta/cmm-entity-verified-contacts`):**
- §12-1 `verified_contacts`-Tabelle + `record_verified_contact()` (SECURITY DEFINER, service_role-only) + RLS deny-all-to-clients. Mig `20260603175338`.
- §12-1b Backfill aus `auth.users.email_confirmed_at` → **70 Email-Belege**. Mig `20260603180048`.
- §12-2 `match_person_candidates()` read-only (HART verified 60 / STARK name+gebdat 35 / WEICH typed 15 / name_only 8, min_score 15), service_role-only. Mig `20260603180419`. **Live verifiziert** (score 75/tier hart/1 Kandidat).
- **Slice A** `findOrphanPersonMatchesForUser()` read-only Detection-Lib (`src/lib/personen/find-orphan-matches.ts`, **TDD 8 Tests**, tsc EXIT 0).
- Spec #2348 gemergt; §13-Schärfungen `b4f094819` auf Identity-Branch.

---

## 3. OFFEN (vollständig, klassifiziert)

**Legende:** 🔴 supervised (aar-939-Hotpath, ruhiges Fenster + Aaron) · 🟡 Aaron-Entscheidung nötig · ⏸ blockiert/deferred · 🟢 safe/autonom

### Strang 1 — Entity-Model (der große Brocken)
- 🟡🔴 **Phase 3-Reste:** Gegner-Fahrzeug-als-`vehicles` (blockiert durch `vehicles.fin` NOT NULL → FIN-/account-lose Gegner) · Halter-als-eigene-Person (kein passender `claim_parties.rolle`-Wert) → Modell-Entscheid.
- 🔴 **Phase 4 — Reader-Repoint** auf Entitäten/Views (Personen/Fahrzeug/Gegner/VS-Reader; Views `v_claim_full` etc. Parteien/Fahrzeuge als jsonb_agg). **Zentraler Blocker — gated Phase 5.**
- 🔴 **Phase 5 — Flat-Drop** (`claim_parties`-Personfelder, `parteien`-Tabelle, faelle-Personen/Fahrzeug/VS-Spalten). Pre-Drop-Verify **ungekappt** Pflicht. **§13-D: NICHT droppen, bevor `personen` die bestätigte Lese-Quelle der Match-Engine ist.**

### Strang 2 — Identitäts-Engine
- 🔴 **Slice B** (Confirm+Relink+Surface+Post-Login-Wiring) — Plan = Doc #5. §3-Entscheidung (Soft-Link `canonical_person_id` vs. direktes Re-Pointen) noch offen.
- 🔴 **Verified-Contact Writer-Wiring** (record bei OTP/Magic-Link/Airdrop/Signup → `record_verified_contact` via Service-Client).
- ⏸ **Login-Tor Auto-Assign** (volle §5-Matrix, gefährlichster Teil).
- ⏸ **FIN (§13-C) + airdrop (§13-B)** als Match-Signale (blockiert bis `vehicles`/Owner-Linkage populiert — akt. 1 FIN-Row).
- ⏸ **Hard-Merge + Provenance + Split** (§12-6, YAGNI bis echte Account-Dubletten).

### Aaron-Entscheidungen
- 🟡 Ansprechpartner-Verdrahtung (KB/Dispatcher/Makler/SV als Rolle; Kanzlei-AP rein; VS-Kontaktperson später).
- 🟡 Person-Dedup **Admin-Merge-Tool** (später).
- 🟡 **#8 Termin-Tabellen-Konsolidierung** (`termine`/`gutachter_termine`/`admin_termine`/`kanzlei_admin_termine`) — koordiniert mit `termine`-Strecke.
- 🟡 `repairs.claim_id` nullable („nur normale Reparatur" ohne Claim).

### Prozess
- **#2360 reviewen/mergen** (Scoring-Gewichte in Review tunebar) — entsperrt Slice B + baut darauf auf.

---

## 4. HARTE REGELN / CONSTRAINTS (nicht brechen)

- **DDL nur via `apply_migration`** (Regel 2); File == getrackte Version (Anti-Twin-Drift). `execute_sql` nur READ.
- **§2-Invariante:** keine RLS-Policy / kein Access-Check je auf `person_id`. Zugriff immer `user_id` / Party-Membership.
- **`verified_contacts` + beide Definer-Funktionen = service_role-only, deny-all-to-clients** — **NIE** eine anon/authenticated-Policy/Grant ergänzen (PII + Poisoning + §2).
- **Phase 3+/4/5 + Slice B + Writer-Wiring = SUPERVISED**, aar-939-Konversions-Hotpath → ruhiges Fenster + Aaron (Incident-Lehre 03.06.).
- **Pre-Drop-Verifikation ungekappt** (`from\(['"]<obj>['"]\)` ohne types.ts) + DB-Dependency + Post-Drop-Smoke ([[feedback_drop_verification_grep]]).
- **§13-D-Sequencing:** Match-Engine liest `name/gebdat/email/telefon` (heute auf `claim_parties`) → diese Felder erst droppen, wenn `personen` bestätigte Engine-Lesequelle ist.
- **Slice-B-Confirm-Authz:** Server-Action darf nur Orphans relinken, die `findOrphanPersonMatchesForUser(userId)` **für genau diesen User** liefert (sonst Claim-Hijack). Orphan **mit** `user_id` = Hard-Merge → ablehnen.
- **`faelle.id ≠ claims.id`** — Route-Key via `faelle_claim_bridge`.
- **Nie auf `main` pushen; PR gegen `staging`.** Nicht selbst mergen (außer benannte Merge-Session).
- **Worktree `node_modules` = Junction** zum Haupt-Checkout → **NIE `rm -rf`** (würde Haupt-`node_modules` nullen); Junction nur via `cmd rmdir`.

---

## 5. Empfohlene nächste Reihenfolge

1. **#2360 reviewen + mergen** (read-only Engine + Slice A; risikolos additiv). Scoring-Gewichte ggf. tunen.
2. **Größter Hebel = Phase 4 (Reader-Repoint)** in einem ruhigen aar-939-Fenster — entsperrt Phase 5 (faelle-Drop-Endspiel). Klassifizierer zum Re-Messen: `node scripts/cmm49-classify-faelle-reads.mjs`.
3. **Parallel/danach Slice B** (Identitäts-Confirm) auf gemergtem #2360 — Doc #5 ist entscheidungsreif; §3-Entscheidung mit Aaron klären.
4. **Decision-gated Reste** (Gegner-FIN, Halter-Person) mit Aaron auflösen.

---

## 6. Branches / Worktrees (Karte)

| Strang-Teil | Branch | Worktree |
|---|---|---|
| Identitäts-Engine + Slice A (**#2360**) | `kitta/cmm-entity-verified-contacts` | `.claude/worktrees/cmm-entity-verified-contacts` |
| Identitäts-Spec + §13 | `kitta/cmm-identity-resolution-spec` | `.claude/worktrees/kitta+cmm49-p0-halter-pilot` |
| Entity-Foundation (#2353) | `kitta/cmm-entity-personen` | — |
| Entity-Writer (#2355) | `kitta/cmm-entity-3-writers` | — |
| CMM-49 faelle-Drop | div. `cmm49-*` | div. `.claude/worktrees/cmm49-*` |
