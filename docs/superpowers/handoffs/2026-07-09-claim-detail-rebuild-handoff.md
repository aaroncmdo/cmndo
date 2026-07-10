# Claim-Detail-View Rebuild — Handoff für eine frische Session

**Datum:** 2026-07-09 · **Vorgänger-Session:** 470d55c9 · **Branch:** `kitta/claim-detail-ops-rebuild`

> **TL;DR.** Aaron will die Claim-Detail-Ansicht (Fallakte) „von Grund auf neu, sauber" — EINE geteilte Datenschicht für alle Rollen, getrennte Layouts. **Erledigt + verifiziert + review-gated:** die Lifecycle/Status-SSoT-Härtung (A+B), der geteilte Loader **`getClaimDetail`** (rollen-aware Facade), und die Migration von **Kunde** + **SV** darauf. Alles committed + gepusht, aber **noch in KEINEM offenen PR** (PR #3955 hat nur Spec+A1 squash-gemergt). **Zwei klare Aufgaben unten:** (A) C landen (neuer PR → CI → Prod-Smoke), (B) die Admin/KB-Fallakte migrieren (eigener großer Effort). Fang mit A an.

---

## 1 · Setup — WO du arbeitest (ZUERST lesen, sonst trampelst du andere Sessions)

- **Arbeite im Worktree:** `C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\.claude\worktrees\status-badge-registry`
- **Branch:** `kitta/claim-detail-ops-rebuild`. Verify: `git -C <worktree> branch --show-current` muss `kitta/claim-detail-ops-rebuild` zeigen.
- **⚠ Der Haupt-Checkout** (`…/claimondo-v2`) steht auf `kitta/aar-956-…` = Kollisionszone (viele Sessions). **Read/Write/Edit-Tools defaulten dorthin** — immer den absoluten Worktree-Pfad angeben.
- **Working tree ist clean, kein Stash, alles gepusht** (Stand Übergabe).
- **Test-Secrets** liegen im Haupt-Checkout `…/claimondo-v2/.env.local` (nicht im Worktree). CRLF-sichere Extraktion siehe §8.
- **Voller `npm run build` geht im Worktree NICHT** (fehlende optionale Module `@react-pdf/renderer`/`sharp`/`jsqr`/`@turf/*` → 17 tsc-Fehler, das ist Worktree-Rauschen, NICHT dein Code). Route-Changes gaten über den **CI-Build** (Next-15-Validator). Lokal: `tsc --noEmit` (8GB-Heap, §8) + die Ratchets + der opt-in Integration-Test.

---

## 2 · Die Mission (Aaron, wörtlich)

„die claim ansicht von grund auf neu denken. sauber" + „für kb und admin muss der ganze claim verfügbar sein mit ops" + „die lifecycle modelle (SV hat Aufträge + Kanzleifälle) müssen sauber integriert bleiben — die kannst du vorher auditen" + **„für alle Rollen"**. Später die Schlüssel-Korrektur: **„das ist ja auch eine detail view aus der claim base bzw claim view"** — die drei Detail-Views sind alle Projektionen derselben Claim-View (`v_claim_full`); genau darauf baut die Facade.

Scope-Entscheidung: **alle 3 Rollen (EINE geteilte Datenschicht, getrennte Layouts)** + **Voll-Cleanup inkl. Status-Spalten**.

---

## 3 · Stand — was DONE ist (nicht neu bauen) & Merge-Status

**Alle 15 Commits liegen auf `origin/kitta/claim-detail-ops-rebuild`, sind aber NICHT in `origin/staging`** (verifiziert `git log origin/staging..HEAD`). PR #3955 ("Design-Spec + A1 Parity-Gate") wurde **squash-gemergt** → dieser Inhalt IST in staging; ein neuer PR gegen staging zeigt daher nur den echten Delta (B-Guard + Facade + Migrationen + Fixes).

| Baustein | Commit(s) | Status |
|---|---|---|
| Design-Spec (A–D) | `b0e6a043a` | Inhalt in staging (squash #3955) |
| **A1** Parity `getClaimLifecycle ≡ v_claim_phase` (33/33) | `3f8f64da7` | Inhalt in staging (squash #3955) |
| **A2** = war schon erledigt (Kette `v_claim_full→v_claim_base→v_claim_phase`, 0 Mismatches/32) | — | verifiziert, kein DDL nötig |
| **B0** Status-Achsen-Audit (3-Achsen-Modell clean) | `db992a9fe`, `76e508879` | unmerged |
| **B** Invariante-Guard (operative-terminal ⇒ status-terminal, 0/32) | `64caf9a11` | unmerged |
| C-Plan + Architektur-Incorporation | `bd28c3adc`, `974e7ea08`, `58d03dd5e` | unmerged |
| **C** `getClaimDetail` Facade (rollen-aware) + Sub-Entity-Fix | `fb5847737`, `d6e6436a7`, `9a9d41239` | unmerged |
| **C** Kunde-Migration (3 Loader → 1) | `f5fc599e5` | unmerged |
| **C** SV Facade-Support + Page-Migration | `ae15c8742`, `8b3321dcd` | unmerged |
| **Review-Fixes** C1 (Datenverlust) + I1 (SV-Doppel-Load) + Guard | `46d6f400f` | unmerged |

**Whole-Branch-Review (Opus) ist gelaufen** und fand 1 Critical (C1) + 1 Important (I1), beide gefixt + geguarded — siehe §7.

**Neue Dateien (die Facade):**
- `src/lib/claims/detail/types.ts` — `ClaimDetail` (rollen-diskriminierte Union)
- `src/lib/claims/detail/get-claim-detail.ts` — der Loader + `fallIdOf`-Helper
- `src/lib/claims/detail/__tests__/get-claim-detail.test.ts` — opt-in Integration-Test + C1-Guard

**Migrierte Pages:** `src/app/kunde/faelle/[id]/page.tsx`, `src/app/gutachter/fall/[id]/page.tsx`.
**Guard-Tests (A+B):** `src/lib/claims/__tests__/claim-phase-parity.test.ts`, `…/claim-status-invariant.test.ts`.

---

## 4 · Mentales Modell — wie `getClaimDetail` funktioniert

```ts
getClaimDetail(supabase, claimId, rolle, ctx?) : Promise<ClaimDetail | null>
// Overloads (typsicher, kein manuelles Narrowing nötig):
//   'kunde' → ctx {userId, email}   (Pflicht)
//   'sv'    → ctx {svId}            (Pflicht)
//   'kb'|'admin'|'kanzlei' → kein ctx
```

**Es ist eine Facade** über die *bereits existierenden, live* Rollen-Loader (alle `v_claim_full`-geerdet — Aarons „claim base"-Punkt). 0 neue DB-Reads:

| Rolle | Core-Loader (das Zugriffs-Gate) | Core-Shape |
|---|---|---|
| **kunde** | `getKundeFallDetailRecord(admin, userId, email, id)` (Ownership: claim_parties/kunde_id/lead.email) | flaches `Record` |
| **sv** | `getFallForSv(supabase, id, svId)` (sv_id-Defense-in-Depth) | flaches `Record` |
| **kb/admin/kanzlei** | `getClaimForRole(supabase, id, rolle)` (RLS auf `v_claim_full`; `*` für admin/kb) | `ClaimFull` |

Dazu das **Bundle** (rollen-unabhängig, via `getClaimLifecycleForClaim(admin, id)` + `getPflichtdokumenteForFall`):
`lifecycle` (A1-kanonische Phase) · `auftraege` · `kanzleiFall` · `pflichtDokumente`.

**Kern-Prinzipien:**
- **Gate-first:** der Core-Loader gibt `null` → die Facade gibt `null` (→ Page `notFound()`). Post-Gate laufen Lifecycle/Dokumente via `createAdminClient()` (das Gate hat den Zugriff schon geprüft).
- **Loader-Konvention:** liefert `ClaimDetail | null`, KEIN `{ok,error}` (ist kein `'use server'`). Niemals Non-Async-Consts aus 'use server' exportieren (n/a hier).
- **Sub-Entities = eigene Claim-Daten** → an alle autorisierten Rollen (kein Gating; ein früher Über-Vorsichts-Gate zerschoss kunde-auftraege → gefixt).
- **`fallIdOf(core, claimId)`** (der C1-Fix): reicht die **faelle.id** (`core.id`) an fall_id-gekeyte Reads, NICHT den claim_id. **Kritisch** — siehe §7-C1.

---

## 5 · AUFGABE A (empfohlen ZUERST): C landen — PR + CI + Prod-Smoke

Die Facade + Kunde/SV-Migrationen sind fertig + review-gated. Banke den Wert, BEVOR du den großen Admin-Effort startest — und es entblockt die kunde-card-rebuild-Session (die kann dann auf gemergtes C rebasen).

1. **Neuen PR öffnen** gegen `staging` für `kitta/claim-detail-ops-rebuild`.
   `gh pr create --base staging --head kitta/claim-detail-ops-rebuild --title "Claim-Detail Facade (getClaimDetail) + Kunde/SV-Migration" --body "…"`.
   Der squash-gemergte Spec/A1-Inhalt taucht im PR-Diff nicht auf (identisch) → der PR zeigt sauber nur B-Guard + Facade + Migrationen + Fixes.
2. **CI-Build grün abwarten** — das ist der autoritative Next-15-Route-Validator (lokal nicht baubar, §1). Bekannte Fremd-Blocker die NICHT dein Code sind: `Supabase Preview` (halter-repoint, [[broadcast-supabase-preview-halter-repoint-blocker]]) + evtl. `v_claim_workstate`-RLS-Check — nur der `build`-Step zählt.
3. **Merge-Koordination Kunde-Page:** die **kunde-detail-rebuild-Session** baut die Kunde-*Cards* im selben File `kunde/faelle/[id]/page.tsx` um (ich nur die Loader-Zeilen am Datei-Kopf). Wer zuletzt merged, rebased — mein Diff ist ~10 lokale Zeilen. Siehe [[broadcast-getclaimdetail-shared-datalayer-response]]. Sag ihnen: **`getClaimDetail` IST die geteilte Datenschicht die ihr Card-Rebuild konsumieren soll** (kein Parallel-Loader).
4. **Prod-Smoke nach Deploy** (frischer SW-freier Browser, nur Test-Accounts):
   - **Kunde-Fallakte** öffnen → rendert identisch (Parteien/Phase/Stepper/Dokumente/Geld/Kanzlei). **Besonders die Pflichtdokumente-Section prüfen** (das war der C1-Bug — hochgeladene Dokumente müssen sichtbar sein, v.a. auf einem OLD-Claim wo faelle.id≠claim_id).
   - **SV-Fallakte** öffnen (test-sv, Login-PWs siehe [[reference-internal-test-account-logins]]) → identisch; erstgutachten-Anzeige/Upload da.

---

## 6 · AUFGABE B (der große Rest): Admin/KB-Fallakte auf `getClaimDetail` migrieren

**Eigener fokussierter Effort — subagent-driven, eigener PR, Prod-Smoke. NICHT nebenbei.**

**Die Datei:** `src/app/faelle/[id]/page.tsx` — **1130 Zeilen**, kb+admin teilen sie via `userRolle`-Branches. ~25 Datenquellen.

**Core-Loader-Realität (live verifiziert):** die Page nutzt **`getFallById(supabase, id)`** (Zeile 78) → **`Record<string,unknown>` aus `v_faelle_mit_aktuellem_termin`** — eine **FLACHE Shape, NICHT `ClaimFull`**. Sie konsumiert `fall.xxx` in ~40 Child-Prop-Contracts.

**→ Approach (a) (stark empfohlen, spiegelt kunde/sv):** ändere den **staff-Branch der Facade**, sodass er `getFallById` (flach) statt `getClaimForRole` (`ClaimFull`) nutzt → `detail.core === getFallById-Output`, dann ist `const fall = detail.core` ein **1:1 behavior-preserving Swap** ohne 40-Prop-Remap. **Sicher, weil aktuell KEIN Consumer den staff-`ClaimFull`-Pfad nutzt** (er war spekulativ). Die Union-Member-Shape für kb/admin/kanzlei wird dann flaches `Record` (wie kunde/sv). ⚠ Prüfe vorher: braucht irgendein *künftiger* staff-Consumer die `ClaimFull`-Sub-Entity-Arrays (parties/payments/…)? Wenn ja → getFallById-Select entsprechend erweitern ODER Variante behalten. (Approach (b) = 40 Props von flach→ClaimFull remappen = teuer, vermeiden.)

**Wichtige Details, die die Migration lösen muss:**
- Die Monolith-Loader die die Facade ersetzt: `getFallById` (78), `getClaimLifecycleForClaim` (970), `getPflichtdokumenteForFall` (1088), evtl. `getAlleAuftraege` (756). Der **SV-„safe-partial"-Trick greift NICHT** (die Facade lädt IMMER den Core → ein Teil-Ersatz addierte einen Redundant-Core-Read). Also **all-in** (a).
- **🔴 staff-pflicht C1-TODO:** im aktuellen Facade-staff-Branch wird `getPflichtdokumenteForFall(supabase, claimId, rolle)` mit **claimId** aufgerufen — aber staff `core.id = claims.id` (claim_id) ≠ faelle.id, und `getPflichtdokumenteForFall` filtert per `fall_id` (=faelle.id!). **Vor dem Konsumieren von `detail.pflichtDokumente` im Admin-Monolith MUSST du faelle.id auflösen** (Bridge `faelle_claim_bridge`, oder `fallIdOf` nach getFallById-Umstellung, dann ist core.id die faelle.id). Sonst wiederholst du C1 für staff. Der Kommentar im staff-Branch von `get-claim-detail.ts` markiert das.
- **~20 Staff-only Side-Concerns BLEIBEN** und hängen an C (NICHT umbauen): QC/Vollständigkeits-Card · VS-Korrespondenz · Kanzlei-Paket+QR · Gutachten-OCR · Belege-Review · Ad-hoc-Anforderungen · KB-Phase-Audit · Regulierung-Card · WerkstattVermittlungPanel · **ClaimAiPanel** (⚠ Lane 876a45e8/ad4c0df0 — NICHT restrukturieren, nur importieren) · other-open-faelle-Banner. **Jeden defensiven `.catch()` (AAR-650) + das admin-after-gate-Muster erhalten.**
- Obendrauf (Aarons „mit ops"): Next-Best-Action + Inline-Edit (`canEditField` aus `@/lib/permissions`) + Stepper. **Reuse** (nicht neu bauen): `WorkItemCard`/`updateClaimField`/`overrideClaimPhase` (Phase-2, LIVE), Status-Registry (`src/lib/status`, `FallStatusBadge`/`FallPhaseBadge`), `FallakteShell`+Tabs.
- **FallPhasenPanel:** per Varianten-Flag erweitern, **NICHT forken** (kunde-detail-rebuild-Session teilt es).
- Wenn du einen Alert brauchst: die **shared `<KundeAlert>`** (kunde-detail-rebuild-Session) mitnutzen, kein Zweitbau.

**Plan-Doc mit mehr Detail:** `docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md` (Phase-D-Abschnitt).

---

## 7 · Hart erkämpfte Lektionen / Gotchas

- **🔴 C1 (id-Keying, war ein Kunde-Datenverlust-Bug):** `getPflichtdokumenteForFall` + andere `fall_dokumente`/`pflichtdokumente`-Reads filtern per **`fall_id` = faelle.id**. `claims.id != faelle.id` (MP-8b) für **OLD-Claims**; für NEW-Claims (post-faelle-drop) gilt `fall_id == claim_id`. Wenn du claim_id statt faelle.id durchreichst, verschwinden auf OLD-Claims die Dokumente lautlos. **Immer die faelle.id (`core.id`/`fallIdOf`) an fall_id-gekeyte Reads.**
- **Service-role-Tests fangen id-Keying-Bugs NICHT** ohne Parity-gegen-bekannte-Daten: `expect(Array.isArray(x))` ist grün auf `[]`. Der C1-Guard löst das: unabhängige faelle.id via Bridge ableiten, Facade-Output gegen `direct(faelle.id)` vergleichen, **bevorzugt einen OLD-Claim** (`claim_id != fall_id`), wo der Bug sichtbar ist. Nutze dieses Muster für alle Facade-Erweiterungen.
- **Ratchets erst NACH `git add`** laufen lassen (die Scanner sehen nur getrackte Files). Sonst false-greens.
- **`getClaimLifecycleForClaim` + `getPflichtdokumenteForFall` rufen intern je `resolveClaimId`** auf einer evtl. schon-resolvten id (2 indexed-PK-Lookups/Call) — harmlos, aber bei Per-Render-Consumern (Admin) im Blick behalten.
- **A2 war schon erledigt** — die Kette `v_claim_full → v_claim_base → v_claim_phase` ist live kanonisch. Fass `v_claim_*`/`claims`-Status NICHT an; halte die A1+B-Guard-Tests grün.
- **`v_claim_base` ist NICHT `authenticated`-granted** (89f501f6-Fund) — SV/User-Consumer lesen NICHT direkt aus `v_claim_base`, sondern über granted Views (`v_faelle_mit_aktuellem_termin`) bzw. die `claims`-Tabelle (SV-Policy `claims_sv_own_select`). Die Facade respektiert das (getFallForSv/getKundeFallDetailRecord).

---

## 8 · Verifikations-Rezept (exakte Kommandos, im Worktree)

```bash
WT="C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/status-badge-registry"
cd "$WT"
# Secrets aus dem HAUPT-Checkout ziehen (CRLF-sicher):
ENVFILE="C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local"
export NEXT_PUBLIC_SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ENVFILE" | head -1 | sed -E 's/\r$//; s/^[^=]+=//; s/^"(.*)"$/\1/')
export SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVFILE" | head -1 | sed -E 's/\r$//; s/^[^=]+=//; s/^"(.*)"$/\1/')

# Opt-in Integration-Test (prod, read-only). Erwartung: 1 passed, c1PflichtParity>=0.
RUN_PARITY=1 npx vitest run src/lib/claims/detail/__tests__/get-claim-detail.test.ts

# tsc (8GB-Heap). Erwartung: 0 Fehler in claims/detail; ~17 pre-existing Worktree-Rausch-Fehler (fehlende @react-pdf/sharp/jsqr/turf) sind KEIN echter Fehler.
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit

# Ratchets (nach git add). Erwartung: alle 0-neu.
npm run check:component-set -- --ratchet
npm run check:knip
npm run check:token-audit
npm run check:status-registry -- --ratchet
npm run check:redirect-stubs -- --ratchet

# A+B-Guards (halten die contested-core-Sauberkeit):
RUN_PARITY=1 npx vitest run src/lib/claims/__tests__/claim-phase-parity.test.ts src/lib/claims/__tests__/claim-status-invariant.test.ts
```

---

## 9 · Koordinations-Karte (Lanes — nicht trampeln)

- **kunde-detail-rebuild-Session** — baut Kunde-*Cards* (teilt `kunde/faelle/[id]/page.tsx` mit dir; du = Loader, sie = Cards). `getClaimDetail` = die geteilte Datenschicht. FallPhasenPanel via Varianten-Flag, `<KundeAlert>` shared. [[broadcast-getclaimdetail-shared-datalayer-response]]
- **89f501f6** (`sv-stellungnahme-revert-vclaimbase`) — macht den faelle-Drop/Bridge-Cleanup. Berührt `v_claim_*`-Views NICHT. Deine Facade konsumiert die Bridge nur via `resolveClaimId` (sanktioniert) → erbe ihren Cleanup, dupliziere nicht.
- **876a45e8 / ad4c0df0** — Claim-AI (`ClaimAiPanel`, orchestrator, ki-aufsicht). Der Admin-Monolith rendert `ClaimAiPanel` → bei Aufgabe B nur importieren, NICHT restrukturieren.
- **Lane-Trennung (Broadcast):** kunde-Cards = ihre, ops = deine, geteilte Reads nur lesen.

**Volles Kontext-Marker (Memory):** [[coordination-claim-detail-ops-rebuild]] · Spec: `docs/superpowers/specs/2026-07-08-claim-detail-ops-rebuild-lifecycle-cleanup-design.md` · Plan: `docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md`.
