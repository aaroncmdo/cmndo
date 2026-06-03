# HANDOFF — CMM Entity-Model + Identitäts-Engine — Stand NACH Slice B

**2026-06-03 EOD. Einstiegspunkt für die nächste Session der GESAMTEN Strecke.**
Supersedet den vorigen GESAMTSTRECKE-Handoff (der lag nur auf dem alten Branch `kitta/cmm-entity-verified-contacts` und erreichte staging nie — siehe §7 Drift). DB-Projekt **`paizkjajbuxxksdoycev`** (prod+staging teilen die DB). DDL **nur** via Supabase-Plugin `apply_migration` (Regel 2).

---

## 0. North Star (eine Strecke, zwei Stränge)

**Der Claim ist das Rückgrat (SSoT). Alle „Dinge der Welt" = globale, eindeutige, claim-übergreifend wiederverwendbare Entitäten (Personen, Fahrzeuge, Versicherer, Werkstätten, Mietwagenunternehmen, SV). Der Claim ordnet pro Fall nur die ROLLE zu. Flache Dopplungen sterben.**

Treiber: *Der Schädiger von heute kann der Kunde von morgen sein* → Entitäten global eindeutig. Die **Identitäts-Auflösung** klärt das schwierigste Teilproblem: wann sind zwei Auftritte derselbe Mensch — ohne zu leaken, ohne zu mismatchen.

- **Strang 1 — Entity-Model** (Phasen 0–5): Entitäten befüllen + Reader umstellen + flache Felder droppen.
- **Strang 2 — Identitäts-Engine** (§12): Verified-Contact-Store → Match-Engine → Login-Tor (Slice A Detection → **Slice B Self-Confirm ✅ NEU**) → Auto-Assign → Hard-Merge.

---

## 1. PFLICHTLEKTÜRE (vor jeder Arbeit, in dieser Reihenfolge)

| # | Datei | Inhalt | Ort (Branch/PR) |
|---|---|---|---|
| 1 | `docs/03.06.2026/cmm-entity-model-target-spec.md` | Ziel-Datenmodell + Beschlüsse 1–7 (Aaron) | **#2348 MERGED** (staging) |
| 2 | `docs/03.06.2026/HANDOFF-cmm-entity-model.md` | Ursprungsplan Entity (Phasen 0–5, 8 Erkenntnisse) | Branch `kitta/cmm-entity-personen` (#2353) |
| 3 | `docs/superpowers/specs/2026-06-03-identitaets-aufloesung-design.md` | Identitäts-Design: Leak≠Dedup, Soft/Hard-Merge, Login-als-Tor, §4 Signal-Tiers, §5 Auto-Matrix, §13 Berater-Schärfungen | Branch `kitta/cmm-identity-resolution-spec` (gepusht, review-gated) |
| 4 | `docs/superpowers/specs/2026-06-03-verified-contact-store-design.md` | Store + Backfill + Match-Fn (§12-1/1b/2) + Scoring-Tabelle | Branch `kitta/cmm-entity-verified-contacts` (Teil #2360) |
| 5 | `docs/superpowers/specs/2026-06-03-login-tor-slice-b-plan.md` | Slice-B-Plan (Confirm+Relink+Surface) | Branch `kitta/cmm-entity-verified-contacts` |
| 6 | `docs/03.06.2026/cmm49-drop-execution-playbook.md` + `cmm49-faelle-column-dedup-decision.md` | CMM-49 (faelle-DROP) Parallel-Strecke + Pre-Drop-Verify-Lehre | div. `cmm49-*` |
| 7 | Memory: `project_cmm_entity_model`, `feedback_drop_verification_grep`, `feedback_dead_code_activation`, `feedback_use_server_konstanten`, `feedback_rls_function_grants`, `feedback_pr_state_nicht_production_stand` | Strang-Status + Incident-Lehren | — |

> Viele Specs (3/4/5) liegen auf **noch nicht gemergten Branches**. GitHub-Blob: `github.com/aaroncmdo/cmndo/blob/<branch>/<pfad>`.

---

## 2. ERLEDIGT (verifiziert)

**Strang 1 — Entity (auf staging):**
- Phase 0 (Dedup/Bridge/CMM-63): #2343/#2344/#2346.
- Phase 1+2a (Foundation `personen`/`mietwagenunternehmen`/Links/Rollen + personen-Backfill **73**): **#2353**. Migs `20260603152823/153554/153612/154118`.
- Phase 2b: **No-Op** (Quelldaten leer, live verifiziert).
- Phase 3 `person_id`-Writer (`ensurePersonForData` + `relinkPartyPersonOnAccount`): **#2355**.

**Strang 2 — Identitäts-Engine:**
- §12-1 `verified_contacts` + `record_verified_contact()` (SECDEF, service_role-only, deny-all-to-clients). **#2360 MERGED** (Mig `20260603175338`).
- §12-1b Backfill (**70** Email-Belege) + §12-2 `match_person_candidates()` (read-only, service_role-only, HART 60/STARK 35/WEICH 15/8, min 15) + **Slice A** `findOrphanPersonMatchesForUser` (read-only, TDD 8): **alle auf Branch `kitta/cmm-entity-verified-contacts`, kamen aber NICHT mit #2360 auf staging** (Drift §7) → **in #2368 nachgetragen**. Migs `…180048` / `…180419`.
- **Slice B — Login-Tor Self-Confirm: PR #2368 (offen, Aaron grünes Licht zum Mergen).** Details §7.

---

## 3. OFFEN (klassifiziert)

**Legende:** 🔴 supervised (aar-939-Hotpath + Aaron) · 🟡 Aaron-Entscheidung · ⏸ blockiert/deferred · 🟢 safe

### Strang 2 — Identitäts-Engine (nächster logischer Schritt)
- 🔴 **Verified-Contact Writer-Wiring** — `record_verified_contact` via Service-Client an den realen Belegstellen: OTP-Verify, Magic-Link-Klick, Airdrop-Accept, Signup/email_confirmed. Macht den Store „scharf" → künftige Matches werden HART (verified) statt nur STARK (name+gebdat). Sitzt im aar-939-Konversions-Hotpath → supervised.
- 🔴 **§5 Login-Tor Auto-Assign** — der gefährlichste Teil: bei Login + sehr starkem Match OHNE Confirm automatisch zuordnen. **Setzt `claim_parties.user_id` = ACCESS-GRANT** (anders als Slice B = dedup-only). **⚠️ AARON-GATE: will die `user_id`-Schreibstelle explizit reviewen — der eine Punkt, wo ein Fehler echt leakt.** Volle §5-Matrix aus Design-Doc #3. Eigene supervised Session.
- ⏸ **FIN (§13-C) + airdrop_token (§13-B) als Match-Signale** — `match_person_candidates` um `p_fin`/`p_airdrop_token`-Parameter + Score-Zeilen erweitern. Blockiert bis `vehicles`/Owner-Linkage populiert (aktuell 1 FIN-Row).
- ⏸ **Hard-Merge + Provenance + Split** (§12-6, YAGNI bis echte Account-Dubletten).

### Strang 1 — Entity-Model (der große Brocken)
- 🟡🔴 **Phase 3-Reste:** Gegner-Fahrzeug-als-`vehicles` (blockiert durch `vehicles.fin` NOT NULL → FIN-/account-lose Gegner) · Halter-als-eigene-Person (kein passender `claim_parties.rolle`-Wert) → Modell-Entscheid.
- 🔴 **Phase 4 — Reader-Repoint** auf Entitäten/Views (Personen/Fahrzeug/Gegner/VS-Reader; Views `v_claim_full` etc.). **Zentraler Blocker, gated Phase 5.** Klassifizierer: `node scripts/cmm49-classify-faelle-reads.mjs`.
- 🔴 **Phase 5 — Flat-Drop** (`claim_parties`-Personfelder, `parteien`-Tabelle, faelle-Spalten). Pre-Drop-Verify **ungekappt** Pflicht. **§13-D: NICHT droppen, bevor `personen` die bestätigte Lese-Quelle der Match-Engine ist.**

### Aaron-Entscheidungen
- 🟡 Ansprechpartner-Verdrahtung (KB/Dispatcher/Makler/SV als Rolle; Kanzlei-AP rein; VS-Kontaktperson später).
- 🟡 Person-Dedup **Admin-Merge-Tool** (später).
- 🟡 **#8 Termin-Tabellen-Konsolidierung** (`termine`/`gutachter_termine`/`admin_termine`/`kanzlei_admin_termine`).
- 🟡 `repairs.claim_id` nullable („nur normale Reparatur").

---

## 4. HARTE REGELN / CONSTRAINTS

- **DDL nur via `apply_migration`** (Regel 2); File == getrackte Version (Anti-Twin-Drift). `execute_sql` nur READ.
- **§2-Invariante:** keine RLS-Policy / kein Access-Check je auf `person_id`. Zugriff immer `user_id` / Party-Membership. **Slice B = dedup-only (person_id); Access-Grant (user_id) erst in §5 Auto-Assign, gegated.**
- **`verified_contacts` + beide Definer-Funktionen = service_role-only, deny-all-to-clients** — NIE eine anon/authenticated-Policy/Grant ergänzen (PII + Poisoning + §2).
- **Writer-Wiring + §5 + Phase 3+/4/5 = SUPERVISED** (aar-939-Konversions-Hotpath, Incident-Lehre 03.06.).
- **Pre-Drop-Verifikation ungekappt** (`from\(['"]<obj>['"]\)` ohne types.ts) + DB-Dependency + Post-Drop-Smoke.
- **`faelle.id ≠ claims.id`** — Route-Key via `faelle_claim_bridge`.
- **Nie auf `main`; PR gegen `staging`; nicht selbst mergen** (außer benannte Merge-Session).
- **Worktree `node_modules` = Junction** → NIE `rm -rf`; Worktree-Build OOMt in der TS-Phase → `NODE_OPTIONS=--max-old-space-size=8192 npm run build` oder `tsc --noEmit`.

---

## 5. EMPFOHLENE NÄCHSTE REIHENFOLGE

1. **#2368 mergen lassen** (Merge-Session) → Slice B + die nachgetragene §12-1b/§12-2/Slice-A-Foundation landen auf staging (löst die Drift §7).
2. **Verified-Contact Writer-Wiring** (supervised) — macht Matches HART. Kleinster Hebel mit großem Konfidenz-Gewinn, baut auf gemergtem #2368.
3. **§5 Login-Tor Auto-Assign** (supervised, **Aaron-Gate auf der `user_id`-Schreibstelle**) — erst nachdem Writer-Wiring HART-Signale liefert (Auto-Assign braucht sehr starke Konfidenz).
4. **Entity Phase 4 (Reader-Repoint)** in einem ruhigen aar-939-Fenster → entsperrt Phase 5 (faelle-Drop-Endspiel).
5. **Decision-gated Reste** (Gegner-FIN, Halter-Person, FIN/airdrop-Signale) mit Aaron.

---

## 6. BRANCHES / WORKTREES

| Teil | Branch | Worktree |
|---|---|---|
| **Slice B (#2368)** | `kitta/cmm-identity-slice-b` | `.claude/worktrees/cmm-entity-verified-contacts` (umgewidmet) |
| Identitäts-Engine + Slice A (#2360, §12-1 gemergt) | `kitta/cmm-entity-verified-contacts` | — |
| Identitäts-Spec + §13 | `kitta/cmm-identity-resolution-spec` | — |
| Entity-Foundation (#2353) | `kitta/cmm-entity-personen` | — |
| Entity-Writer (#2355) | `kitta/cmm-entity-3-writers` | — |
| CMM-49 faelle-Drop | div. `cmm49-*` | div. |

---

## 7. SLICE B — DETAIL (gerade fertig, PR #2368)

**Was:** Nach Login findet Slice A Orphan-Shell-Personen (hart/stark), die wahrscheinlich der eingeloggte User sind. Slice B = User-first-Self-Confirm: „Ja, das bin ich" → Re-Point der Orphan-`claim_parties` → Account-Person + Tombstone + Per-Partei-Provenance.

**§3-Mechanik (Aaron-Kompromiss):** Re-Point (Reads unverändert) + `personen.canonical_person_id`-Tombstone (reversibel/Provenance). Migs `20260603191628` (Spalten `canonical_person_id` + `previous_person_id` + partial idx + COMMENTs) / `…191740` (match-fn-Filter `canonical_person_id is null`).

**§2 (Aaron-bestätigt):** **dedup-only, setzt NIE `claim_parties.user_id`.** Sichtbarer Effekt = Identität verknüpft, NICHT „neue Fälle sichtbar". Access-Grant = §5 (separat, gegated).

**Aaron-Schärfungen umgesetzt:** (1) `match_person_candidates` schließt canonical'd aus (Single Source → `findOrphanPersonMatchesForUser` erbt). (2) `claim_parties.previous_person_id` = Per-Partei-Reverse-Provenance für späteren Split.

**Files:** `src/lib/personen/confirm-orphan-match.ts` (TDD 9), `src/app/kunde/actions.ts` (`confirmOrphanMatchAction`, Authz-Re-Check = Kandidat-Membership, Service-Client), `src/components/kunde/OrphanMatchBanner(.Client).tsx` (Kunde-Layout, §13-A minimal-PII, primitives.Button), `…/__tests__/confirm-orphan-match.integration.test.ts` (gated `RUN_DB_INTEGRATION`).

**Verifikation:** voller build grün · tsc grün · 24 unit + 3 integration grün · Integrationstest gegen echte DB 3/3 (re-point + previous_person_id + tombstone + **user_id unverändert** + match-excludes), Residue-0 · Advisors keine neuen Issues · Banner data-inert (0 reale Matches).

**Fast-Follows ✅ erledigt (in #2368):** (a) **Cookie-Gate nach Dismiss** — `cmndo_orphan_checked` (7d), Server überspringt den Match-RPC danach (Perf/Anti-Nag); Confirm setzt es bewusst NICHT. (b) **Multi-Match** — `key={orphanPersonId}` am Client → nach Confirm+`router.refresh()` remountet der nächste Orphan frisch (kein „kleben am Danke-State").

**Drift-Fund (#2360):** #2360 wurde squash-merged, als der Branch nur §12-1 hatte; §12-1b/§12-2/Slice A wurden post-merge gepusht → erreichten staging NIE (DB hatte sie appliziert). **#2368 trägt die 4 Files chirurgisch nach (1. Commit).** Lehre: PR-Status ≠ Production-Stand (`feedback_pr_state_nicht_production_stand`).

---

## 8. KOORDINATION (Stand 03.06. EOD)
- `src/app/kunde/layout.tsx` +4 Zeilen additiv (Mount des Banners) — überlappt mit `portal-i18n-kunde-switcher`-Session (separate Worktrees, kein Trample; Merge trivial). Marker: `memory/coordination-slice-b-kunde-layout.md`.
- Mehrere aktive Sessions 03.06. → Writer-Wiring/§5 erst in ruhigem Fenster + mit Aaron.
