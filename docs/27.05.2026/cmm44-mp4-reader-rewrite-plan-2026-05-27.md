# CMM-44 MP-4 — Reader-Rewrite Plan (Phasen-Anzeige aufs 4-Phasen-Modell)

> Branch `kitta/cmm44-claim-phase-mp4` (off staging, enthält MP-2+MP-3). Review-Doc VOR Umsetzung
> (Aaron: „erst Plan-Doc, dann Umsetzung"). Erbt DE-1…4 + B-1…15. Vorgelagert: MP-2 (resolveSubphase
> re-based), MP-3 (`v_claim_phase`/`getClaimLifecycle` = lexdrive-regulierung + claims.status-abschluss).

---

## 0 · Auftrag (§12-MP-4)

„Reader-Rewrite: **KEINE Klage-Hauptphase** (B-1); **abschluss-Substate-Anzeige**; **Side-Quests parallel**."
= Die Phasen-**Anzeige** in allen Portalen auf das **4-Phasen-Modell** (`getClaimLifecycle` Detail /
`v_claim_phase` Listen, beide aus MP-3) umstellen. Die 52-Substate-**Rollen-Visibility 1:1** ist explizit
**MP-5** (DE-2) — NICHT MP-4.

---

## 1 · Der Befund: 3 Vokabulare gleichzeitig (die Wurzel der Arbeit)

Die Phasen-Anzeige läuft heute über **drei nebeneinander existierende Vokabulare**:

1. **52-Subphasen-Matrix** `SUBPHASE_VISIBILITY` (`src/lib/fall/subphase-visibility.ts`, AAR-565/566):
   10 Pipeline-Buckets × 52 snake_case-Subphasen × 5 Rollen (mit DE-Labels + Visibility). **Enthält eine
   „Phase 7 Ablehnung & Klage" als Hauptphase** (verstößt gegen B-1). Gekeyt auf das ALTE
   `aktuelle_phase`-52-Vokabular.
2. **resolveSubphase** (System B, `subphase-resolver.ts`, MP-2-rebased): Phase 1–9 + feine Subphasen
   (6a/7.1/…). Liefert `phase_nummer`.
3. **getClaimLifecycle / v_claim_phase** (System A, MP-3): 4 Hauptphasen + `ClaimSubPhase` (13 Werte inkl.
   `kanzlei_uebergabe` + terminale Substates). **Das Ziel-Modell.**

**Der Bruch:** Seit SP-A2-Repoint ist `aktuelle_phase` = `claims.phase` (11-Code), das die 52-Matrix-Keys
NICHT matcht → `buildPhasePipelineData` fällt auf `phase_nummer` (resolveSubphase) zurück. Die reiche
Pipeline-Anzeige läuft also schon halb-kaputt. MP-4 räumt das auf, indem die Anzeige aufs konsistente
4-Phasen-Modell zeigt.

---

## 2 · Reader-Inventar (wer zeigt Phase wie)

| # | Reader (Portal) | Quelle heute | Anzeige-Mechanik | Ziel MP-4 |
|---|---|---|---|---|
| 1 | `FallakteShell` (Admin/KB) | `fall.aktuelle_phase` + `subphase.phase` | `FallPhasenPanel`→`buildPhasePipelineData` (52-Matrix) | 4-Phasen aus `getClaimLifecycle` |
| 2 | `gutachter/fall/[id]` FallDetailClient/FallHeader (SV) | `fall.aktuelle_phase` | `FallPhasenPanel` (idem) | idem |
| 3 | `kunde/faelle/[id]/page.tsx` (Kunde) | `aktuelle_phase` **+ lädt schon `getClaimLifecycleForClaim`** | `FallPhasenPanel` (alt) **+ ClaimStepper (neu, MP-3 ✓)** | FallPhasenPanel raus / auf 4-Phasen; ClaimStepper bleibt |
| 4 | `admin/faelle/(hub)/FaelleKanban` | `mapStatus(status, aktuelle_phase)` (Spalten) + `buildPhasePipelineData` (Card) | Kanban-Gruppierung + Pipeline | 4-Phasen-Spalten + 4-Phasen-Card |
| 5 | `admin/faelle/(hub)/page.tsx` | `claims.phase` → `aktuelle_phase` | Loader für #4 | `v_claim_phase` laden |
| 6 | `kanzlei/kanban/page.tsx` | `phaseFromStatus(status)` / erste Ziffer von aktuelle_phase | Kanban-Gruppierung (Ziffer) | 4-Phasen / regulierung-fokussiert |
| 7 | `kanzlei/mandate/page.tsx` | `claims.phase`→aktuelle_phase | Liste | `v_claim_phase`/lifecycle |
| 8 | `makler/queries.ts` + `MaklerAktenList`/`MaklerAkteDetail` | `[status, aktuelle_phase]` | Chip/Text (`aktuelle_phase ?? status`) | 4-Phasen-Label |
| 9 | `kunde/FallStatusCard` | `fall.aktuelle_phase` (Feindetails) | Status-Card | 4-Phasen + Substate-Label |
| 10 | `FallActionBar` → `ManualPhaseOverrideModal` | `aktuelle_phase` (52) | Override-Modal (**disabled**, MP-1-Stopgap) | **NICHT MP-4** → MP-8 (Override-Redesign) |
| 11 | Cron `pflichtdokumente-reminder` | `aktuelle_phase` + szenario | Pflicht-Vokabular (B-14) | **NICHT MP-4** → B-14 eigenes Ticket (nur „nicht brechen") |
| 12 | `statusLabels.ts` | aktuelle_phase-Labels | Label-Util | ggf. 4-Phasen-Labels ergänzen |
| 13 | `components/shared/claims/*` (PhasePipeline/ClaimPhaseBadge/phase-mappings) | 11-Code, **0 Consumer** | — | **Dead-Code → löschen** |
| 14 | `app/dev/phases` | Mock | Dev-Preview | mitziehen oder belassen |

**Kern-Mechaniken zum Umbau:** (A) `buildPhasePipelineData`/`FallPhasenPanel` (Fallakte ×4 + Kanban-Card),
(B) `mapStatus`/`phaseFromStatus` (Kanban-Gruppierung Admin/Kanzlei), (C) Direkt-Display (Makler,
FallStatusCard).

---

## 3 · Ziel-Modell (woraus die Anzeige künftig liest)

- **Detail (1 Akte):** `getClaimLifecycleForClaim(admin, fallId)` → `{ mainPhase, subPhase, aktiveSideQuests }`.
  `MAIN_PHASE_LABEL` (4) + `SUBPHASE_LABEL` (13) aus `lifecycle.ts`.
- **Listen/Kanban (N):** `v_claim_phase` (`claim_id, main_phase, sub_phase`) — kein N+1.
- **4 Hauptphasen:** erfassung → begutachtung → regulierung → abschluss. **Keine Klage-Hauptphase** — Klage =
  `abschluss`-Substate `klage_rechtsstreit` (B-1/B-5).
- **abschluss-Substates:** erfolgreich_reguliert / storniert / klage_rechtsstreit / verjaehrt (B-11).
- **Side-Quests:** `aktiveSideQuests` (Nachbesichtigung/Stellungnahme) parallel — `ClaimStepper` macht das
  schon vor (MP-3); für die anderen Portale übernehmen.

---

## 4 · MP-4 vs MP-5-Grenze (wichtig)

- **MP-4 = Hauptphasen-STRUKTUR der Anzeige:** 4 Phasen statt 10/52, keine Klage-Hauptphase,
  abschluss-Substate sichtbar, Side-Quests parallel. Pro Portal auf `getClaimLifecycle`/`v_claim_phase`.
- **MP-5 = 52-Substate-Rollen-VISIBILITY 1:1 (DE-2):** welche feine Subphase welche Rolle mit welchem Label
  sieht (die `SUBPHASE_VISIBILITY`-rollen-Matrix). Treffermenge vor/nach vergleichen, gebrandetes
  Kunde-Portal smoken. **Bleibt MP-5.**

→ In MP-4 wird `buildPhasePipelineData` so umgebaut, dass es die **4 Hauptphasen + den aktiven
`ClaimSubPhase`-Substate** rendert (statt der 52-Matrix). Die feine Rollen-Substate-Sichtbarkeit (MP-5)
setzt darauf auf.

---

## 5 · Increment-Plan (portal-weise, je eigener PR `--base staging`)

> Reihenfolge = niedriges Risiko + Muster-Etablierung zuerst, größter shared-Umbau in der Mitte.

- **MP-4a — Dead-Code + Labels (Aufwärmer, risikolos):** `components/shared/claims/*` (0 Consumer) löschen;
  `statusLabels.ts` um 4-Phasen-Labels ergänzen. Build/tsc grün.
- **MP-4b — shared `fall-phases`-Lib auf 4-Phasen** (DER Kern): `buildPhasePipelineData` (oder ein neuer
  `buildClaimPhasePipeline(lifecycle)`) rendert die 4 Hauptphasen + aktiven Substate aus `getClaimLifecycle`;
  `FallPhasenPanel` nimmt `lifecycle` statt `aktuelle_phase`. **Klage-Hauptphase raus.** Consumer #1/#2/#3
  (Fallakte Admin/SV/Kunde) ziehen mit. TDD auf der Pipeline-Build-Funktion + Smoke je Portal.
- **MP-4c — Admin-Kanban** (#4/#5): Spalten-Gruppierung auf `v_claim_phase.main_phase` (4 Buckets, +
  abschluss-Substate-Chips); Card-Pipeline via MP-4b. Hub-Loader lädt `v_claim_phase`.
- **MP-4d — Kanzlei** (#6/#7): kanban + mandate auf `v_claim_phase` (regulierung-fokussiert: versicherungs-
  kontakt/auszahlung + abschluss-Substates).
- **MP-4e — Makler + FallStatusCard** (#8/#9): Direkt-Display auf 4-Phasen-Label + Substate.
- (Kunde-`ClaimStepper` = bereits MP-3 ✓; `dev/phases` in 4-Phasen-Demo mitziehen.)

**Nicht MP-4:** #10 ManualPhaseOverride (disabled → MP-8), #11 pflichtdok-Cron (B-14-Ticket; in MP-4 nur
„nicht brechen" prüfen), `aktuelle_phase`-View-Spalten-Drop (DE-3-Cleanup, nach allen Readern).

---

## 6 · Offene Entscheidungen (bitte bestätigen)

1. **`SUBPHASE_VISIBILITY`-Matrix-Fate:** MP-4 rendert 4 Hauptphasen + aktiven `ClaimSubPhase`-Substate
   (Matrix-Rendering raus). Die 52-Subphasen-Rollen-Visibility wandert als MP-5 in eine neue, aufs 4-Phasen-
   Modell gemappte Visibility-Schicht. **OK so?** (Alternative: 52-Matrix behalten + re-keyen — mehr
   Erhalt, mehr Surgery, verschwimmt mit MP-5.)
2. **Kanban-Spalten:** Admin/Kanzlei-Kanban künftig **4 Hauptphasen-Spalten** (erfassung/begutachtung/
   regulierung/abschluss)? Heute mehr/feinere Spalten. 4-Spalten = konsistent mit dem Modell, aber sichtbare
   Layout-Änderung.
3. **Klage-Anzeige:** Klage als `abschluss`-Substate-Badge (`klage_rechtsstreit`) — kein eigener Schritt.
   Bestätigt B-1.
4. **Reihenfolge:** MP-4a→b→c→d→e ok, oder anderes Portal zuerst (z.B. Kunde-facing vor internen Tools)?

---

## 7 · Verifikation pro Increment

- TDD wo Logik (Pipeline-Build-Funktion: `getClaimLifecycle`-Input → `PhaseStepData[]`).
- **Voller `npm run build` + smoke** je Portal (Worktree-Env ist via `npm ci` repariert — tsc/vitest/build
  laufen lokal wieder; node_modules nicht mehr symlink).
- Parity bleibt MP-3-stabil (keine View-Änderung in MP-4 außer evtl. Spalten-Reads).
- PR `--base staging`, NICHT self-mergen (sync-watcher).

---

## 8 · Artefakte / Anker

- Ziel-Modell: `src/lib/claims/lifecycle.ts` (MAIN_PHASE_LABEL/SUBPHASE_LABEL/getClaimLifecycle) ·
  `src/lib/claims/get-claim-lifecycle-for-claim.ts` · `v_claim_phase` (Migration 20260527075024).
- Umzubauen: `src/lib/fall/subphase-visibility.ts` (buildPhasePipelineData) ·
  `src/components/shared/fall-phases/*` · `FaelleKanban`/(hub)/page · `kanzlei/kanban`+`mandate` ·
  `makler/*` · `kunde/FallStatusCard` · `statusLabels.ts`.
- Löschen: `src/components/shared/claims/*` (0 Consumer).
- Erbt: `docs/27.05.2026/cmm44-subphasen-mapping.md` §8–§12 + `cmm44-mp3-v-claim-phase-2026-05-27.md`.
