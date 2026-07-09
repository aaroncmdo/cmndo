# Kunde-Claim-Detail-View — Ground-up-Rebuild (Zonen-Architektur) — Design

**Datum:** 2026-07-09
**Status:** Approved-in-Konzept (Aaron „das passt", 09.07.)
**Bau-Branch:** NEU `kitta/kunde-claim-detail-rebuild`, off `staging` **NACH #3985-Merge** (Dependency, s. §7)

## 1 · Ziel & Kontext
Aaron: die Kunde-Claim-Detail-View (`src/app/kunde/faelle/[id]`) „von Grund auf neu und sauber,
tokenkonsistent, voll funktional, vollständig datenbankgetrieben." Entscheid: **visuelles Redesign
+ Struktur** (nicht nur Cleanup). Die aktuelle View ist organisch gewachsen: **968-Zeilen page.tsx,
24+ verstreute Loader, 23 Cards/Sections**, mehrere Token-Sünder (inline-color `KundeSvLiveBanner`,
3 inline-Alerts VS-Kürzung/Ablehnung/Klage, ad-hoc-Badges) + ad-hoc-Gates (Rügefall,
Nachbesichtigung, Auszahlung, Google-Review) die die Lifecycle-Logik duplizieren.

## 2 · Design-Entscheidungen (Aaron, 09.07.)
- **Leitprinzip:** ausgewogenes Dashboard mit klaren Zonen, **mobile-first**.
- **Mobile-Reihenfolge (Scroll):** Kompakt-Status → Aufgaben → Team → Geld → Doks & Termine.
- **Adaptivität:** **phasen-adaptiv** — jede Zone erscheint nur, wenn im aktuellen Lifecycle-Zustand
  relevant (keine leeren Zonen), alles aus `getClaimLifecycle` abgeleitet.
- **Ansatz:** **Zonen-Architektur** (dünne page.tsx + ein Loader + eine reine derive-Funktion +
  Zone-Komponenten; gute Bestands-Cards wiederverwenden, Token-Sünder neu).

## 3 · Architektur & Datenfluss
- **`page.tsx` (dünn, ~80 Z.):** Auth/Ownership/Canonical-Redirect bleiben (`getKundeFallDetailRecord`
  — accept-both claim_id/faelle.id, 308-Redirect). Ruft **einen** Loader → rendert
  `<KundeClaimView vm={viewModel} />`.
- **`getKundeClaimView(admin, user, claimId)` (neu, `src/lib/claims/kunde-claim-view.ts`):** EIN
  konsolidierter Server-Loader — bündelt die heute 24 verstreuten Queries in ~8-10 parallele
  Reads → liefert ein typisiertes `KundeClaimViewModel`. Nutzt intern die geteilte Phasen-SSoT
  `getClaimLifecycleForClaim` (lifecycle.ts) + die kunde-only-Loader (get-kunde-faelle, Termine,
  Dokumente, SV/KB-Kontakt, Auszahlung, Gutachten-Werte).
- **`deriveKundeZonen(vm)` (neu, PURE, `src/lib/claims/kunde-zonen.ts`):** aus dem ViewModel →
  geordnetes Array sichtbarer Zonen + je Zone der Content-Slice. **Hier lebt die „vollständig
  DB-getrieben"-Logik** — keine ad-hoc-Gates in der JSX. Unit-getestet.
- **`deriveKundeAufgaben(vm)` (neu, PURE):** sammelt die offenen Kunde-To-dos aus dem Zustand
  (s. §4 AufgabenZone). Unit-getestet.

## 4 · Die 5 Zonen + Sichtbarkeits-Regeln (phasen-adaptiv)

| Zone | Sichtbar wenn | Inhalt |
|---|---|---|
| **StatusZone** | immer | Kompakter Streifen: Phase (`lifecycle.mainPhase/subPhase` → `MAIN_PHASE_LABEL`/`SUBPHASE_LABEL`) + „was passiert als Nächstes" + wer dran ist; SV-Live-Status (unterwegs/da, aus gutachter_termine realtime) integriert. Ersetzt Hero + inline-color-`KundeSvLiveBanner`. |
| **AufgabenZone** | `deriveKundeAufgaben(vm).length > 0` | CTA-Zeilen: Bankdaten (status∈SHOW_STATUSES & !hinterlegt), KVA-Freigabe/Reparaturauftrag-Unterschrift (reparatur-route & !freigegeben), Pflichtdok-Nachreichung (offene Pflichtdoks), Termin bestätigen (offener Terminwunsch), SA/Vollmacht (offen). |
| **TeamZone** | KB ODER SV existiert | KB + SV (Avatar/Name/Rolle/Chat/Anruf), token-sauber (KundeBetreuerStrip neu). |
| **GeldZone** | `mainPhase∈{regulierung,abschluss}` ODER Forderung/Auszahlung/KVA-Betrag existiert | SaeuleMeinGeld + AuszahlungCard + KostenvoranschlagCard (reparatur) + Nutzungsausfall/Mietwagen (KundeAusfallEntschaedigungCard), konsolidiert. |
| **DoksTermineZone** | immer | Pflichtdokumente (PflichtdokumenteSection) + Termine (TerminSectionCard) + Gutachten-Download (GutachtenPdfButton/Weiterleitung) + FallDetailSections (Dokumente/Chat-Tabs). |

**Alert-Zustände** (VS-Kürzung/Ablehnung/Klage/Nachbesichtigung): als **ein `<KundeAlert tone=…>`**
(shared, status-registry-basiert) in der StatusZone bzw. GeldZone gerendert — NICHT mehr 3 inline-Blöcke.

## 5 · Token-Konsistenz & Wiederverwendung
- **Wiederverwendet (in Zonen gewrappt, evtl. Token-Politur):** SaeuleMeinGeld, SaeuleMeinBetreuer,
  AuszahlungCard, ClaimStepper (→ kompakte StatusZone-Variante), PflichtdokumenteSection,
  FallDetailSections, BankdatenBanner, KostenvoranschlagCard, GutachtenPdfButton, TerminSectionCard,
  MeineKanzleiCard, KanzleiPfadCard, KundeAusfallEntschaedigungCard, KundeAbschlussCard,
  FallPhasenPanel (kunde-Variante).
- **Neu/sauber (Token-Sünder ersetzt):** StatusZone (statt `KundeSvLiveBanner` inline-colors),
  `<KundeAlert>` (statt 3 inline VS-/Klage-Alerts, lines 793-827), alle Badges → `StatusBadge` /
  `src/lib/status`-Registry. Kein inline-Hex/-color, keine handgerollten Cards (primitives `Card`).
- **Ratchets:** component-set + token-audit + status-registry 0-neu (Boy-Scout: die berührten
  Bestands-Sünder senken die Baseline).

## 6 · 470d55c9-Koordination (claim-detail-ops-rebuild)
- **Phasen-SSoT:** Kunde-View bleibt auf `getClaimLifecycle`/`getClaimLifecycleForClaim`
  (lifecycle.ts, v_claim_phase-paritär, kunde-erprobt). 470d55c9 baut `v_claim_workstate` /
  `deriveClaimWorkflowState` für Ops (Admin/KB/Dispatch — andere Achse: Kanban/Rollup). **Kein
  Doppelbau.** Falls 470d55c9 `v_claim_workstate` als gemeinsame Claim-SSoT etabliert → spätere
  Migration per Interface-Abstimmung (Marker), nicht in diesem Rebuild.
- **`FallPhasenPanel`:** kunde-Variante nutzen, kein Neubau (geteilte Komponente, Rollen-Varianten).
- **Kunde-only-Cards** (§5-Liste): frei baubar, kein Overlap.
- **Geteilte Reads (nur lesen):** v_claim_phase, v_gutachten_werte, Auftrag-/KanzleiFall-Loader.

## 7 · Dependency & Bau-Sequencing
Der Rebuild verwendet AV6/7/8-Kunde-Arbeit (GutachtenPdfButton, `reparaturdauer_tage_kva`,
Reparaturauftrag-Signatur-Card, `istWerkstattReparaturWeg`), die aktuell nur auf **#3985**
(`kitta/werkstatt-flow-enrichment`) liegt, noch nicht auf staging. **Daher:** Spec + Plan jetzt;
**Bau auf frischem Branch `kitta/kunde-claim-detail-rebuild` off staging NACH #3985-Merge** (dann
trägt staging die Deps). Verhindert Doppel-Arbeit + hält #3985 schlank.

## 8 · Fehler & Testing
- `deriveKundeZonen` + `deriveKundeAufgaben`: **pure, vitest** — Test-Matrix (4 Phasen ×
  abrechnungsweg × Kern-Flags). Der DB-Getriebenheits-Kern.
- Zone-Komponenten: leichte Render-Smokes (Sichtbarkeit + Empty-Fallbacks).
- `npm run build` (page = Route → Next-Validator) + **Prod-Smoke** (test-kunde, echte Claims über
  alle Phasen — Erfassung/Begutachtung/Regulierung/Abschluss + Reparatur-Route).

## 9 · Phasen-Plan (jede Phase PR-fähig)
- **P0 — Fundament:** `getKundeClaimView`-Loader + `KundeClaimViewModel`-Type + `deriveKundeZonen` +
  `deriveKundeAufgaben` (pure + vitest). Kein UI-Switch (page.tsx unverändert).
- **P1 — Shell + Status/Aufgaben:** dünne `<KundeClaimView>` + StatusZone + AufgabenZone +
  `<KundeAlert>`; page.tsx auf den neuen Baum umstellen (hinter den bestehenden Loadern).
- **P2 — Team + Geld:** TeamZone + GeldZone (Cards wrappen + Token-Politur).
- **P3 — Doks & Termine + Cleanup:** DoksTermineZone + Alt-page.tsx-Reste + tote Cards entfernen
  (Dead-Code-Gate) + Ratchet-Baseline senken.

## 10 · Datei-Übersicht (Bau)
| Datei | Art |
|---|---|
| `src/lib/claims/kunde-claim-view.ts` | neu (Loader + ViewModel-Type) |
| `src/lib/claims/kunde-zonen.ts` (+ `.test.ts`) | neu (deriveKundeZonen/-Aufgaben, pure) |
| `src/components/kunde/claim-view/KundeClaimView.tsx` | neu (Shell) |
| `src/components/kunde/claim-view/StatusZone.tsx` … `DoksTermineZone.tsx` | neu (5 Zonen) |
| `src/components/shared/KundeAlert.tsx` (o. shared/) | neu (status-registry-Alert) |
| `src/app/kunde/faelle/[id]/page.tsx` | umbauen (dünn) |
| diverse `src/components/kunde/*` | Token-Politur beim Wrappen |
