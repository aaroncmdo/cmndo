# CMM-44 MP-2 — `resolveSubphase` Re-Base auf die Owning-Sub-Entities (2026-05-27)

> Branch `kitta/cmm44-claim-phase-mp2` (off `kitta/cmm44-claim-phase-mp1`). Setzt §5 des
> MP-1-Handoffs um. Vorgeschaltet: `cmm44-subphasen-mapping.md` §8–§12 (autoritative Karte).

---

## 0 · Auftrag (aus MP-1-Handoff §5)

`resolveSubphase` (System B, 33 feine Ops-Subphasen) las ~50 Trigger-Felder aus der **sterbenden**
`v_faelle_mit_aktuellem_termin`-View (faelle). MP-2 = **Read-Swap** auf die §8-Owning-Sub-Entities,
**Treffermenge erhalten** (DE-1/DE-2), **TDD-Pflicht**. Gate zuerst: Live-DB-Population + §9.7-Writer-Sweep.

---

## 1 · Was gemacht wurde

- **Gate (read-only, kritisch)** vor jedem Code: Live-DB-Population + Writer-Sweep → kein blockierender
  Writer-Gap (Details §2).
- **Loader-SELECTs erweitert** (additiv, Felder optional getypt → keine Konstruktions-Site bricht):
  - `KanzleiFallRow` (`src/lib/kanzlei-fall/queries.ts`): 6 → 26 Felder (vs_reaktion_*, vs_kuerzungs_typ,
    kuerzungs_betrag, vs_kuerzung_grund, vs_quote_*, vs_frist_bis, ruege_*, anschlussschreiben_*,
    eskalation_tag_14/21/28_am, mandatsnummer, lexdrive_case_id).
  - `AuftragRow` (`src/lib/auftrag/queries.ts`): + filmcheck_ok/_am + technische_stellungnahme_*.
- **`resolveSubphase` re-based** (`src/lib/fall/subphase-resolver.ts`): Input von `fall: FallRow` →
  Sub-Entity-Trigger-Subsets (`claim`/`lead`/`kanzleiFall`/`auftraege`/`gutachten`/`gutachter_termine`/
  `webhook_events`). **Logik + Prioritäts-Kaskade (9→1) unverändert** — nur die Lese-Quelle pro Feld wandert
  auf die §8-Owning-Entity. Null-safe. Name-Mismatches (§8.6) aufgelöst:
  `gutachten_eingegangen_am`→`auftraege.gutachten_url`/`gutachten.pdf_uploaded_at`,
  `ocr_extrahiert_am`→`gutachten.ocr_status`, `cardentity_abfrage_am`→`leads.cardentity_enriched_at`,
  `fin_vin`→`leads.fin`, `nachbesichtigung_status`→`gutachter_termine.nachbesichtigung_status`.
- **Assembly-Loader** `src/lib/fall/subphase-resolver-input.ts`: `getSubphaseResolverInput(admin, {fallId,
  claimId, leadId})` — EINE Stelle für die Trigger-Feld-Assembly (analog `getClaimLifecycleForClaim` für
  System A), damit es nicht pro Portal driftet.
- **Caller** `src/app/faelle/[id]/page.tsx`: füttert den Resolver über den Assembly-Loader statt der
  faelle-View; die 2 resolver-only Promise.all-Loads (gutachter_termine/webhook_events) + 4 tote Typen
  entfernt.

**Owning-Quellen-Mapping** (Resolver-Phase → Entity):
`erfassung (1/2.x)` ← leads (zb1/fin/cardentity) + claims (sa/vollmacht/service_typ post-conversion) ·
`begutachtung (3/4)` ← auftraege (filmcheck/gutachten_url) + gutachten (ocr) + gutachter_termine ·
`regulierung (5/6/7)` ← kanzlei_faelle (vs_reaktion/ruege/anschlussschreiben/eskalation/quote) +
claims.kanzlei_uebergeben_am · `abschluss (8/9)` ← claims (abgeschlossen_am/google_review/provision).

---

## 2 · Gate-Befunde (Live-DB, read-only) — Re-Base ist datensicher

DB-Stand (Prod, 27.05.): faelle 65 · claims 66 · kanzlei_faelle 12 (alle `versicherungskontakt`) ·
auftraege 1 · gutachten 2 · claim_payments **0** · leads 322.

- **Kein gefährlicher Drift** (das Risiko, das die Strecke abbremst): jedes umstrittene Regulierungs-Feld
  (vs_reaktion_typ, vs_quote_*, ruege_counter, anschlussschreiben_*, eskalation_tag_*, kuerzungs_betrag,
  lexdrive_case_id) ist **0 auf faelle UND 0 auf kanzlei_faelle** — der Lifecycle hat die Regulierung
  schlicht noch nicht erreicht. Einziges befülltes umstrittenes Feld: `mandatsnummer` **12=12** (faelle =
  kanzlei_faelle, SP-I2-Backfill). → Es gibt **keinen** Fall „faelle befüllt, Owning leer".
- **Owning-Writer bestätigt** für die Felder mit Writer: ruege_counter/ruege_gesendet_am (prozess.ts),
  anschlussschreiben_* (dokumente.ts), eskalationsstufe/regulierung_am, mandatsnummer (upsertKanzleiFall).
- **Writer-lose Felder** (vs_reaktion_typ, vs_quote_*, eskalation_tag_*, lexdrive_case_id): leer, weil der
  VS-/Regulierungs-Flow **KB-manuelle Zukunfts-Arbeit** ist (B-15). Resolver liest die Owning-Entity
  (richtiges Ziel); der Writer muss bei Bau auf die Owning-Entity zielen (§9.7-Offene).
- **claims.status** trägt `dispatch_done:64 / in_bearbeitung:2` — **keine** terminalen Werte (B-15
  bestätigt). Abschluss-Substate via claims.status-terminal ist **MP-3**, nicht MP-2.
- **View-Parität** (`v_faelle_mit_aktuellem_termin`): regulierung_betrag / vs_reaktion_typ / abgeschlossen_am
  je **0 von 65** → Phase-8/6/9 feuern heute nicht; Re-Base dort inert (match-set-neutral).

**Parität view↔owning (DE-2 „vor/nach vergleichen") über alle 65 Fälle:** **64/65 identisch.** Einzige
Divergenz: 1 `nur_gutachter`-Fall mit `faelle.fin_vin` gesetzt, aber `leads.fin` null (Name-Mismatch-Feld
nicht backfilled) → minimaler Ops-Sub-Step 2.4 (FIN-Call) liest jetzt die korrekte (leere) Owning-Quelle.
Kein Logik-Regress; `leads.fin`-Backfill als Daten-Follow-up notiert.

---

## 3 · Verifikation

- **TDD** (Pflicht, §5.3): Test auf Sub-Entity-Inputs umgeschrieben → **30/30 RED** (alter Resolver liest
  `fall.szenario` → TypeError) → Resolver re-based → **30/30 GREEN**. Erwartete Subphasen-Outputs identisch
  zur AAR-538-Treffermenge (kein Eindampfen).
- **System A intakt:** `get-claim-lifecycle-for-claim.test.ts` weiter grün (gesamt 36/36).
- **`tsc --noEmit`:** 0 Fehler in MP-2-Dateien (einziger src-Treffer = bekanntes pdf-parse-Junction-Artefakt
  in `ocr-gutachten/route.ts`, CI grün — Handoff §7).
- **`npm run build` (lokal im Worktree): BLOCKIERT durch Environment-Artefakt, NICHT MP-2.** `next build`
  stirbt beim Laden von `next.config.ts` (unbedingter Sentry-Import → `@opentelemetry/instrumentation` →
  `Cannot find module 'require-in-the-middle'`) — **vor** jeder App-Kompilierung. Reproduziert 3×
  (Default, `SENTRY_AUTH_TOKEN=` ungesetzt, `NODE_OPTIONS=--preserve-symlinks`). Ursache: das
  **symlink-`node_modules`** des Worktrees + Next-TS-Config-Kompilierung lösen die transitive OTel-Dependency
  nicht auf (kein App-Code beteiligt; `require-in-the-middle` IST im Main-`node_modules` vorhanden).
  → **Lokaler Gate = `tsc --noEmit` (0 MP-2-Fehler) + vitest (36/36).** Der autoritative Full-Build läuft
  auf CI (frischer `npm ci`, kein Symlink) für den PR. Hinweis: never-Narrowing fängt `tsc` ab; die einzige
  Build-only-Validierung (Next-Route-Validatoren) greift hier nicht, weil der Caller-Change rein interne
  Server-Logik ist (keine Route-Export-/Boundary-/Metadata-Änderung).
- **SubphaseResult-Shape unverändert** (phase/subphase/label/szenario/trigger_fields/next_hint) →
  `PhaseTriggerList` + alle Consumer-Verträge intakt. **UI-Smoke** auf dem PR-Staging-Deploy empfohlen
  (Aaron-Test-Step); lokaler Browser-Smoke wegen Worktree-Build/Run-Constraints + Connection-Limit +
  doc38-Session-Kollision bewusst nicht erzwungen.

---

## 4 · Bekannte Follow-ups (NICHT MP-2, dokumentiert)

- **DE-4 / Phase-8:** `regulierung_betrag` (nur View) + `auszahlung_kunde_eingegangen_am` (nur faelle) haben
  keine saubere Owning-Quelle bis `claim_payments.empfaenger` existiert. Resolver liest sie aus `claim`
  (derzeit ungefüllt → Phase-8 inert, = View-Stand 0). Logik bleibt erhalten/testbar. Wiring an
  claim_payments + Migration = DE-4-Ticket (quer).
- **`leads.fin`-Backfill** aus `faelle.fin_vin` (1 Fall heute) — Teil des breiteren faelle→leads-Backfills
  vor Phase-6-Drop.
- **`vs_ablehnungsgrund`** existiert nirgends als Spalte (§8.6 gap 5) — 6c feuert via
  `vs_reaktion_typ='abgelehnt'`, der Grund ist nur Trigger-Detail. Spalte ergänzen falls gewünscht
  (SP-I-Nachzug).
- **§9.7 writer-lose Owning-Felder** (vs_reaktion_typ/vs_quote/eskalation_tag/lexdrive_case_id): beim Bau des
  KB-manuellen VS-/Regulierungs-Flows MUSS der Writer die Owning-Entity (kanzlei_faelle) treffen.
- **`onboarding_complete`** liest System B nicht (Backbone = System A); der P0-Loader liest es noch von
  faelle → Phase-6-Move (gap 1).

---

## 5 · 7-Punkte-Audit

- **Build:** `tsc --noEmit` 0 MP-2-Fehler + vitest 36/36; voller `next build` lokal env-blockiert (siehe §3),
  CI-Build autoritativ.
- **UI-Erreichbarkeit:** kein neuer Einstiegspunkt — `PhaseTriggerList` in der Fallakte unverändert,
  SubphaseResult-Shape gleich.
- **Redundanz:** kein Duplikat — bestehende Loader (`getAlleAuftraege`/`getKanzleiFall`) wiederverwendet +
  erweitert; ein Assembly-Loader analog System-A-`getClaimLifecycleForClaim`.
- **Dead-Code:** 4 obsolete Typen (FallRow/LeadRow/GutachterTerminRow/WebhookEventRow-Import) + 2
  resolver-only Promise.all-Loads im Caller entfernt.
- **Spec-Treue:** §5.1–5.4 in Reihenfolge: (1) Gate ✓ (2) Loader-SELECTs ✓ (3) Resolver-Re-Base TDD ✓
  (4) Audit+PR ✓. Abweichung dokumentiert: Phase-8/claim_payments DE-4-deferred (§4).
- **Inkonsistenz:** DB-Spalten live verifiziert (information_schema), nicht geraten; Error-Handling der
  Loader unverändert; keine UI-Strings geändert.
- **Regression:** einziger `resolveSubphase`-Caller (faelle/[id]) angepasst; System A grün; Parität 64/65.

---

## 6 · Dateien

- `src/lib/fall/subphase-resolver.ts` — re-based (Sub-Entity-Trigger-Inputs, Logik unverändert)
- `src/lib/fall/subphase-resolver.test.ts` — auf Owning-Inputs umgeschrieben (RED→GREEN)
- `src/lib/fall/subphase-resolver-input.ts` — **neu**, Assembly-Loader
- `src/lib/kanzlei-fall/queries.ts` — KanzleiFallRow + SELECT erweitert
- `src/lib/auftrag/queries.ts` — AuftragRow + SELECT erweitert
- `src/app/faelle/[id]/page.tsx` — Caller auf Assembly-Loader umgestellt
