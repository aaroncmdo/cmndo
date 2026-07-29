# HANDOFF — Netzwerk-Ökosystem (Session 2026-07-29)

> **Für die nächste Session.** Alles was gelaufen ist, alles was offen ist, wie du aufsetzt, und wo die Minen liegen. Das Epic ist zu **~3½ von 7 Phasen** gebaut, alles reviewed/verifiziert, auf **einer mergeable PR**.

---

## 0 · TL;DR (30-Sekunden-Orientierung)

- **Was:** Claimondo Netzwerk-Ökosystem — Freundschaftsgraph zwischen Profis (SV/Werkstatt/Flotte) + zahlungs-gated Ranking-Boost + SV-Freemium (Netzwerkpartner-Abo = Haupt-Preismodell) + Kunde-fahrzeug-zentrisch + Netzwerkkarte.
- **Branch:** `kitta/netzwerk-verbindungen-freundschaft` · **PR #4862** (gegen `staging`, **MERGEABLE/CLEAN**) · **26 Commits ahead** · working tree clean, alles gepusht.
- **Prod-Ref:** `paizkjajbuxxksdoycev` (DDL via Supabase-MCP-Plugin `apply_migration`, Regel 2).
- **Fertig:** P0 (Fundament) · P1 (Verbindungs-Netzwerk) · P2 (Boost+Badge) · P3-Seed · Fleet-CI-Breaker-Fix — **alle reviewed + tsc/vitest-grün**.
- **Offen:** P3-Rest (**Provisions-Gate = money-kritisch** + T6/T7 relationale Partition) · P4 (Vermittlungs-Flow) · P5 (Billing, **Aaron-blockiert**) · P6 (Fahrzeug-zentrisch + Netzwerkkarte).
- **Ledger (durabler Fortschritt):** `.superpowers/sdd/progress.md` (git-ignored Scratch im Worktree).

---

## 1 · Resume-Protokoll (so setzt du auf)

1. **Frischer Worktree off `origin/staging`** (Script-HEAD-Falle: `new-session-worktree.mjs` zweigt per Default vom aktuellen Checkout ab — `staging` explizit angeben). ODER auf `kitta/netzwerk-verbindungen-freundschaft` weiterarbeiten (hat P0-Substrat, das P3+ braucht).
2. **`.env.local` fehlt in frischen Worktrees** → aus dem Haupt-Checkout kopieren (`cp ../../../.env.local .env.local`). Brauchst du für Type-Regen (CLI) + lokale Ratchets (`SUPABASE_SERVICE_ROLE_KEY`).
3. **`npm ci`** (node_modules fehlt in frischen Worktrees).
4. **Ledger lesen:** `.superpowers/sdd/progress.md` — der autoritative Fortschritt (überlebt Kompaktierung; git-log > Erinnerung).
5. **Frischer Kollisions-Check VOR jedem heißen File** (siehe §8). Insb. `convert-lead-to-claim.ts` (aar-956-Lanes) + die Finder-Engine-Files.
6. **Pre-Plan-Gate** (Aaron-Pflicht vor neuen Plänen): Hardening + Reuse-Reality + Kollisions-Scan gegen den dann-aktuellen Code neu fahren.
7. **Operatives Soll VOR Smoke, alles per UI** (Aaron-Regel): erst wie es funktionieren SOLL (unabhängig vom Code) → per echter UI dagegen smoken → mit Aaron absprechen. **Bei money-/dispatch-verändernden Swaps: Entscheidung mit Aaron VOR dem Bauen** (so lief P2s comped-Backfill).

---

## 2 · Status-Matrix

| Phase | Status | Kern | Commits |
|---|---|---|---|
| **Design** | ✅ | 7 Specs + 7 Pläne (P0–P6) | `a360c12ee`…`cb58c8e4d` |
| **P0** Fundament | ✅ reviewed+gehärtet | Graph + Entitlement + Bindungs-Spalten + Prädikat/Batch | `304400224` `b9bda5e29` `1c523b609` `c8e1472b5` |
| **P1** Verbindungs-Netzwerk | ✅ reviewed+gefixt | Tabs/Verzeichnis-RPC/Kalt-Einladung | `c7c8e4a7e` `4ad810c15` `dce8dc977` `66470b394` `ba83cdefe` `3d07ac3ff` |
| **P2** Boost + Badge | ✅ verifiziert | Comped-Backfill + Global-Boost (2 Engines) + Badge | `7c83c0db4` `74e2846bb` `90aff0c7b` |
| **P3** Bindung-Seed | ✅ (Seed-Teil) | claims + kunde-First-Touch `netzwerk_owner_id` | `fd8631c21` |
| **Fleet-Fix** | ✅ | CI-Breaker (claims.netzwerk_owner_id intern deklariert) | `581b4c5e7` |
| **P3** Provisions-Gate + T6/T7 | ⏳ OFFEN | **money-kritisch** + relationale Partition | — |
| **P4** Vermittlungs-Flow | ⏳ OFFEN | Sofort-Claim + sign-into-existing | — |
| **P5** Freemium-Billing | ⛔ Aaron-blockiert | Stripe (Live-Secrets nötig) | — |
| **P6** Fahrzeug-zentrisch + Netzwerkkarte | ⏳ OFFEN | Kunde /fahrzeuge + Karten-Rebrand | — |

---

## 3 · ERLEDIGT — Detail (was gebaut + verifiziert wurde)

### P0 — Fundament (additiv, inert)
- **`304400224`** DDL: `netzwerk_verbindungen` (Freund-Graph profiles↔profiles) + View `v_netzwerk_freunde` (**Definer-View, service_role-only** = Leak-Schutz); `sv_netzwerk_abonnements` (Entitlement, derive-at-read, **authenticated SELECT-only**, Writes nur service_role); `claims.netzwerk_owner_id` + `profiles.netzwerk_owner_id`/`_seit`.
- **`b9bda5e29`** `src/lib/netzwerk/{entitlement,freunde}.ts`: `istAktivesAbo`/`ladeZahlendeSvSet` (Batch, K10)/`istZahlenderNetzwerkPartner`; `ZIELROLLE_TO_ENTITY`/`ladeFreundKandidatIds` (Batch).
- **`1c523b609`** flag-drift-Snapshot += die 2 neuen CHECK-Enums.
- **`c8e1472b5`** ⚠ **Security-Hardening aus dem Phasen-Review** (2 echte Bugs): (1) `profiles.netzwerk_owner_*` war von jedem authenticated User selbst überschreibbar → **`guard_profiles_netzwerk_owner`-Trigger** (nur service_role/admin, K6). (2) `netzwerk_verbindungen` erlaubte **Self-Accept ohne Konsens** → UPDATE-Policy **Empfänger-only** + **`guard_netzwerk_verbindung_update`-Trigger** (Paar immutable, Status nur aus `offen`).
- Gates: tsc 0, build „Compiled successfully", vitest, alle Ratchets 0-neu.

### P1 — Verbindungs-Netzwerk (UI live)
- **`c7c8e4a7e`** T1 Domain: 5 Server-Actions (senden/annehmen/ablehnen/entfernen/blockieren) + DELETE-Policy + Mitteilung via `createMitteilung` (echte Glocke, **nicht** `emitEvent`=claim-scoped).
- **`4ad810c15`** T2 Queries + Anzeige-Auflösung.
- **`dce8dc977`** T3 Verzeichnis-Such-RPC (**SECURITY-DEFINER + Selbst-Gate**, projiziert nur name/ort/avatar — kein email/telefon-Leak; `anon:EXECUTE` ist codebase-normal + self-gate-safe).
- **`66470b394`** T4 Kalt-Einladung (`netzwerk_einladungen`, Airdrop-Token, Auto-Kante bei Registrierung).
- **`ba83cdefe`** T5+T6 UI: Tabs Feed/Verbindungen/Anfragen auf gutachter/werkstatt/flotte (**Makler feed-only, v1 LOCKED**) + `/flotte/netzwerk` + `/api/netzwerk/verzeichnis` + Werkstatt-Kalt-Einladung-Redemption-Wiring.
- **`3d07ac3ff`** ⚠ **P1-Review-Fixes** (1 Critical + 1 Important + 2 Minor): „Blockieren" war tot (P0-Trigger erlaubt nur `offen→X`) → aus VerbindungenTab entfernt, in AnfragenTab (funktional); Flotte-Firmenname (`firmen_flotten_konten→firmen`) in Anzeige+RPC; Kalt-Mail „Hallo ," → „Hallo zusammen,"; toter Makler-Filter raus.
- Gates: tsc 0, build „Compiled successfully in 57s", vitest 22/22, alle Ratchets 0-neu.

### P2 — Boost + Badge (verifiziert, non-regressiv)
- ⭐ **Aaron-Entscheid (operatives Soll):** paket→abo-Swap wäre ohne Comping eine **Live-Dispatch-Regression** → „Bestand comped + P2 bauen".
- **`7c83c0db4`** T0/T1: **Comped-Backfill** (Mig `20260729144004`, 9 Bestands-Top-Partner `pro/standard` → `status='comped'`; `basic` bleibt non-partner) macht den Swap non-regressiv; `applyNetzwerkPraeferenz` (pure Partition).
- **`74e2846bb`** T2-T4: **Global-Boost in BEIDEN Engines** — `matching-score.ts` (`paketPrio·W_PAKET` → `istNetzwerkpartner·W_NETZWERK`), `matching.ts` `findeBestePerson` (batch `ladeZahlendeSvSet`, K10), `api/sv-zuweisung/route.ts` (pure `sortiereMitNetzwerk`, K4). tsc 0, **vitest 167/167**.
- **`90aff0c7b`** T5 Badge: `istTopPartner` = Abo-Prädikat (statt paket≠basic), 3 Projektions-Call-Sites gekoppelt, „Netzwerkpartner"-Chip. vitest 42/42.
- **K3 gewahrt:** `paket` nie überschrieben, `istKontingentBlockiert` bleibt Billing-Achse.

### P3 — Seed (`fd8631c21`)
- `claims.netzwerk_owner_id` (in `convert-lead-to-claim.ts`): `resolveVermittlerOwnerProfil` (INBOUND vermittler → profiles.id; werkstatt→user_id, firmen_flotte→konto.user_id; **makler v1→null**; NIE outbound sv_id). Write-once, additiv.
- `profiles.netzwerk_owner_id` First-Touch (in `kunde/onboarding/actions.ts` `completeOnboarding`, **nicht** finalizeKundeSetup, K6): aus Origin-Claim, **Admin-Client** (wg. guard-Trigger), IS-NULL sticky, non-fatal.
- Module: `src/lib/netzwerk/{owner-resolution,bindung}.ts`. tsc 0, vitest 50/50.

### Fleet-CI-Breaker-Fix (`581b4c5e7`)
- **Problem:** meine P0-Mig `20260729102640` fügte `claims.netzwerk_owner_id` hinzu, ohne sie im `check-claims-column-grants` (build-Job, liest live prod via RPC `audit_claims_column_grants`) zu deklarieren → Befund **NEUE_SPALTE** → **build ROT auf JEDEM Fleet-PR** → e2e geskippt → 8c6de199s Fundament-B1-Gate blockiert.
- **Fix:** `netzwerk_owner_id` in die RPC-`v_intern`-Liste (intern deklariert, kein Grant — kein User-Client liest sie) + Column-Revoke (Mig `20260729171407`). **Live grün verifiziert** (0 Befunde). Marker `coordination-an-332d22f1-netzwerk-owner-id-ci-breaker-fix` als RESOLVED aktualisiert.

---

## 4 · OFFEN — die nächsten Aufgaben (detailliert)

### P3-REST (nächste Session — **money-kritisch, mit Sorgfalt + eigenem Review**)
Plan: `docs/superpowers/plans/2026-07-28-netzwerk-p3-bindung-provisions-gate.md`.

**T3 — Provisions-Release-Suppression (⚠ MONEY):**
- **DDL-FREI** (der P3-Plan-Agent verifizierte: `partner_provisionen.status` hat KEINEN CHECK → neuer Terminal-Status `'unterdrueckt'` braucht keine Migration).
- Suppression an **RELEASE-Zeit** (nicht am Inbound-INSERT-Trigger — da sind sv_id/Werkstatt noch NULL): in `src/lib/provisionen/completion-release-gate.ts` bzw. `runProvisionsRelease` (`release-runner.ts`). Prüfe via `ladeFreundKandidatIds`: Inbound-Partner ↔ zugewiesener Gegenpart befreundet → nur den `partner_provisionen`-Zweig unterdrücken. **Makler = extern → feuert immer** (`makler_fall_consent` behalten).
- ⚠ Der **Legacy-Cron `release-werkstatt-provisionen`** ruft `runProvisionsRelease` ohne Hook → Gate in **beide** Crons.
- ⚠ „inbound-Haftpflicht-only" ist im Code NICHT enforced (`create_werkstatt_provision` ohne abrechnungsweg-Gate) → **offener Aaron-Entscheid** (im PR markieren, nicht raten).
- Trigger-Topologie frisch via `pg_get_functiondef` (nicht auf alte Marker-Bodies bauen). Koordination: claims-RLS/Provisionen-Lane.

**T6/T7 — relationale „Dein Netzwerk"-Partition (aus P2 verschoben, jetzt live-able mit dem Seed):**
- `src/lib/netzwerk/resolve-netzwerk-owner.ts` (Finder-READ-Resolver: claim → owner-profil; **anders** als das Seed-`owner-resolution.ts`!) + Test.
- `applyNetzwerkPraeferenz` als **allerletzter** Schritt in die Werkstatt-Finder: `lade-vorschlaege.ts` (NACH `rankeWerkstattVorschlaege`) + `vermittlung-server.ts` (NACH `qualifiziereWerkstaetten` #4101/#4125). K10 (1 Batch/Call), K12.
- Owner durchreichen in `werkstatt-finder-actions.ts` (Surface 2: claim.netzwerk_owner) + `werkstatt-empfehlung.ts` (Surface 1: SV-Owner wenn zahlend).
- T7 anon-Seam: `gutachter-finder-actions.ts` Owner-Injektion (Makler-Attribution, v1 inert).
- Jetzt **scharf** (der Seed füllt `claims.netzwerk_owner_id`) → end-to-end testbar.

**Follow-ups P3:** matching.ts-Integrationstest (DB-Mock, aus P2-T3 offen) · INSERT-Rollen-Gate auf `netzwerk_verbindungen` (kunde soll keine Verbindung anlegen, P0-Review-Minor).

### P4 — SV-Vermittlungs-Flow
Plan: `…-netzwerk-p4-sv-vermittlungs-flow.md`. **DDL-frei** (Enums erlauben Werte schon). Sofort-Claim via Direkt-INSERT (bypasst Engine — sanktioniert, Ratchet gatet nur `.update`); Mid-Funnel-Reader auf `sa_unterschrieben` gaten (inert für Alt-Traffic, nicht `onboarding_complete`); sign-into-existing-claim; echter Frühzünder = `case-billing-batch`-Cron. ⚠ hot: `convert-lead-to-claim.ts` + FlowLink-Lane `b0e963b6`.

### P5 — Freemium-Billing (⛔ Aaron-blockiert)
Plan: `…-netzwerk-p5-freemium-billing-stripe.md`. Stripe recurring + Setup-Fee (beide Stripe), 4 Webhook-Events zum LIVE-Endpoint, DAT-Gating-Audit-Entfernung, Dunning-Cron. **Aaron-Blocker AB1–AB5:** Live-`whsec`, echte IBAN/USt (K&S UG), Custom-SMTP, finale Preise, Go-live-Approval für den comped-Backfill. Verifikation via comped/test-clock, **nie Live-Charge** (prod+staging teilen LIVE-Stripe).

### P6 — Fahrzeug-zentrisch + Netzwerkkarte
Plan: `…-netzwerk-p6-fahrzeug-zentrisch-netzwerkkarte.md`. WS H: Kunde `/kunde/fahrzeuge` (reuse `getClaimDetail`/C4-Dock), `vehicles.current_owner_id`-Writer+Backfill (0/14, K8), two-vehicles-per-car. WS E: Netzwerkkarte-Rebrand (SKT-Token `karten_token` — nicht qr_pool; token-basiert nicht NFC; ON-DELETE-Zombie-Trigger, K9). Koordination: Claims-Programm + Schadenkarte-Lane `63fe43f9`.

---

## 5 · Migrationen auf prod (10, alle getrackt, Dateiname == Version)

| Version | Name | Phase |
|---|---|---|
| `20260729102515` | netzwerk_verbindungen (+ v_netzwerk_freunde) | P0 |
| `20260729102606` | sv_netzwerk_abonnements | P0 |
| `20260729102640` | netzwerk_owner_bindung (claims+profiles) | P0 |
| `20260729110049` | netzwerk_p0_security_hardening (2 Trigger) | P0 |
| `20260729110653` | netzwerk_verbindungen_delete_policy | P1 |
| `20260729112220` | netzwerk_verzeichnis_suche (DEFINER-RPC) | P1 |
| `20260729113213` | netzwerk_einladungen | P1 |
| `20260729132934` | netzwerk_verzeichnis_suche_flotte (RPC-Replace) | P1-Fix |
| `20260729144004` | netzwerk_comped_backfill_bestand (9 SVs) | P2 |
| `20260729171407` | claims_netzwerk_owner_id_intern_declare | Fleet-Fix |

**P3-Seed, P2-Boost, P2-Badge = DDL-frei** (reiner Consumer-Code).

---

## 6 · Die 7 Pläne + 7 Specs (Referenzen)

**Pläne** (`docs/superpowers/plans/2026-07-28-netzwerk-p{0..6}-*.md`): P0 Fundament · P1 Verbindungen-UI+Invite · P2 Boost+Badge · P3 Bindung+Provisions-Gate · P4 Vermittlungs-Flow · P5 Freemium-Billing · P6 Fahrzeug-zentrisch+Netzwerkkarte. Jeder Plan ist bite-sized TDD, frisch code/DB-verifiziert, mit „⚠ C-Migration"-Notizen zum Fundament-Ziel.

**Specs** (`docs/superpowers/specs/`): `2026-07-21-…verbindungen-freundschaft` (Graph) · `2026-07-25-angebotsstruktur-sv-freemium…` (Freemium/Entitlement/Provisionen §13b LOCKED) · `2026-07-27-{netzwerk-oekosystem-epic-overview, sv-vermittlungs-flow-claim-lifecycle, hardening-und-koordination-vor-plaenen (K1-K15), implementierungs-roadmap-phasen}`.

**Master-Marker:** `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]` (voller File-Touch-Index + Phasen-Status).

---

## 7 · Operative Entscheidungen (Aaron — LOCKED)

- **Netzwerkpartner-Abo = Haupt-Preismodell** (Monats-Flat + einmalige Einrichtungsgebühr, **BEIDE via Stripe**). Per-Fall-`paket`/Paketfälle retired (Bestand behält Fulfillment + comped). DAT-Gating raus.
- **Bestand comped** (P2-Entscheid): Bestands-SVs → Netzwerkpartner, sonst wäre der Boost-Swap eine Live-Regression.
- **Bindung per-Claim** (`claims.netzwerk_owner_id`) + Kunden-Default. Gate immer am SV; Werkstatt/Flotte = freie Verbindungsknoten.
- **Provisionen rein operativ:** intra-Netzwerk (befreundet) = KEINE Provision (Abo deckt); nur was ins Netzwerk reinsteuert (Makler-inbound, Werkstatt→SV außerhalb Netzwerk) wird verprovisioniert.
- **Makler = v1 kein Graph-Knoten** (später ohne DDL zuschaltbar). Kunde bleibt im Netzwerk, mischt nicht aktiv mit.

---

## 8 · Koordination — modifizierte Bestands-Files (⚠ hot multi-lane)

**Diese Files hat die Netzwerk-Lane angefasst — bei Merge/Weiterbau prüfen:**
- `src/lib/leads/convert-lead-to-claim.ts` — **HOT** (aar-956-Lanes `reservierung-rueckruf`). Nur minimaler additiver Seed daneben.
- `src/app/kunde/onboarding/actions.ts` (First-Touch).
- Finder-Engine: `src/lib/termine/engine/{matching-score,matching}.ts` · `src/app/api/sv-zuweisung/route.ts` · `src/lib/sv-matching-modul/{projection,types,plane-termin-oeffentlich}.ts` · `src/lib/actions/gutachter-finder-actions.ts` · `src/app/embed/gutachter-finder/_components/SvProfilePopup.tsx`.
- Registrierung: `src/app/werkstatt/registrieren/{actions,page,WerkstattRegistrierenClient}.tsx` — ⚠ **Lane `3e9c5297` (werkstatt-onboarding-drip)** → Marker `[[coordination-an-3e9c5297-werkstatt-registrieren-einladung-touch]]`.
- Portale/Shell: `src/app/{gutachter,werkstatt/(shell)}/netzwerk/page.tsx` · `src/components/shared/netzwerk/types.ts` · `src/components/flotte/FlotteManagerShell.tsx`.

**Kollisions-Check-Protokoll (vor heißem File):** `git fetch` + `git log --oneline HEAD..origin/staging -- <file>` (staging-Änderung? → rebase). Additive Edits halten die Multi-Lane-Merges sauber.

---

## 9 · GOTCHAS / Lektionen (nicht nochmal reinlaufen)

1. **Neue `claims`-Spalte = Fleet-CI-Breaker.** `check-claims-column-grants` (build-Job) flaggt jede claims-Spalte, die weder gegrantet noch in `audit_claims_column_grants().v_intern` deklariert ist → **build ROT auf ALLEN Fleet-PRs**. Bei neuer claims-Spalte: sofort intern deklarieren (RPC-`v_intern` + Column-Revoke) ODER granten (`GRANT SELECT (col) … TO authenticated` + RLS). Muster: Mig `20260729171407`.
2. **`profiles.netzwerk_owner_*`-Writes brauchen service-role.** `guard_profiles_netzwerk_owner_upd` (P0-Hardening) wirft `insufficient_privilege` für authenticated → immer Admin-Client.
3. **`sv_netzwerk_abonnements` ist per-User-RLS** → `ladeZahlendeSvSet` IMMER mit `createAdminClient` (Staff-`db` sähe 0 Zeilen).
4. **`v_netzwerk_freunde` ist service-role-only** (Definer-View) → `ladeFreundKandidatIds` nur Admin-Client.
5. **Build-Contention:** bei vielen Parallel-Sessions killt `npm run build` sich gegenseitig (Timeout/OOM). tsc + „✓ Compiled successfully" (Zeile im Log, VOR dem Kill) sind der Beleg; der autoritative Vollbuild läuft in **CI beim PR**. Nicht in einer Retry-Schleife bauen.
6. **Subagenten-Reports können abbrechen** (an Build-Contention hängenbleiben) — dann `git status`/`git diff` selbst prüfen, die Arbeit ist meist da + korrekt. Immer verifizieren, nicht dem Report blind vertrauen.
7. **Gekoppelte atomare Units:** `matching-score.ts`-Feld-Swap zwingt ALLE Caller (tsc fängt's) → zusammen landen; `projection.ts`-Badge-Swap zwingt alle 3 Projektions-Call-Sites. Nie halb committen (tsc-rot).
8. **Notifications:** `createMitteilung` (echte Glocke), NICHT `emitEvent` (claim-scoped, verwirft No-Claim still) und NICHT `benachrichtigungen` (tote Tabelle).
9. **Nested-FK** (`firmen(name)`): je nach Cardinality Objekt ODER Array → `Array.isArray(x)?x[0]:x`.

---

## 10 · Handoffs / offene Verifikationen

- **Regel-4-Prod-Smokes** (deploy-gated): P0 inert (kein Smoke). P1 (Tabs/Verzeichnis/Kalt-Einladung) + P2 (Boost/Badge im Finder) brauchen nach Deploy einen Playwright-Journey-Smoke gegen prod mit **Wegwerf-Konten** (`telefon=NULL`). Smoke-Plan im PR-Body #4862. **Nicht selbst mergen** (Regel 1).
- **matching.ts-Integrationstest** (P2-T3): schwerer DB-Mock, als Follow-up offen (Boost-Logik ist pure getestet).
- **P5 Aaron-Blocker:** Live-`whsec`, IBAN/USt, SMTP, Preise, Backfill-Approval.
- **3e9c5297** (werkstatt-onboarding-drip): Marker raus wg. `werkstatt/registrieren`-Touch.

---

**Kurz: du kannst nahtlos bei P3-Provisions-Gate aufsetzen (money-kritisch → Sorgfalt + Review), dann T6/T7, dann P4/P6; P5 wartet auf Aarons Stripe-Secrets. Alles liegt reviewed + verifiziert auf #4862.**
