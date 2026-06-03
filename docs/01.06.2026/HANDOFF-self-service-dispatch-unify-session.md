# HANDOFF — Self-Service (Gutachter-Finder) + Dispatch-Config-Unify

**Session:** 2026-06-01 · **Worktrees:** `aar-940-self-service` (Strecke A) + `dispatch-leads-config-unify` (Strecke B)

## 0. TL;DR — wo anfangen

Zwei Strecken in dieser Session:
- **A — Gutachter-Finder -> Self-Service (Y-Modell):** config-getriebener `beauftragung`-Wizard gebaut (P1a–P4 + Render), **e2e auf staging validiert (PASS)**, **PR #2172 -> staging GEMERGED**. Offen: P5/P6/P7/MIG.
- **B — Dispatch-Leads × Flowlink Config-Unify:** **designt (Spec) + P0-geplant** auf `kitta/dispatch-leads-config-unify`. Execution NICHT gestartet. Offen: P0 ausfuehren -> P1–P4.

**Nächster Schritt:** §1.5 (A-Reststrecke, P5/P6 = LIVE -> Aaron-Freigabe) ODER §2.4 (B P0-Plan ausfuehren — risikoarm, additiv, self-contained = sauberer Einstieg).

---

## 1. Strecke A — Gutachter-Finder -> Self-Service (Y-Modell)

**Branch:** `kitta/gutachter-finder-self-service` (Worktree `.claude/worktrees/aar-940-self-service`). **PR #2172 -> staging (MERGED).** Handoff-Vorlage: `docs/01.06.2026/HANDOFF-gutachter-finder-self-service-wizard.md`. Memory: `project_aar940_self_service.md`.

### 1.1 Gebaut (8 Commits)
- **P1a** `77d2855c1` — `speichereBeauftragungStep` (`src/app/anfrage/[token]/actions.ts`): token-validierter Per-Phase-Lead-Save, reuse `groupFelderByTarget` (allowedTables=leads).
- **P1b** `23b9da8c5` — 2 Migrationen: `leads.kanzlei_wunsch` (`20260601161252`) + `seed_beauftragung_flow` (`20260601161747`).
- **P1c** `75480901d` — WizardClient `beauftragung`-Pfad (`handleWeiterBeauftragung`), additiv `flowKey`-geguarded (GFA-Pfad byte-identisch).
- **P2** `b5976c67e` — Quali-Gate (schuldfrage=eigenverschulden -> Abbruch-Screen, reuse `speichereQuali`), „gegner" vorgewaehlt.
- **P3** `9e9dee6ca` — Completeness-Gate vor Finalize.
- **P4** `a5d751b41` — termin-Phase (`fields/TerminField.tsx`, Consumer `ladeMatching`/`bucheTermin`) + Migration `add_beauftragung_termin_phase` (`20260601172527`, inkl. typ-CHECK 'termin').
- **Render** `26445154b` — `?wizard=v2` -> `lade-beauftragung-phasen.ts` + `BeauftragungWizardStart.tsx` (promote client-side) -> WizardClient. Default = bespoke `AnfrageStartClient` (Live unveraendert).

### 1.2 Config (live DB, 5 Phasen)
service -> kanzlei (cond service_typ=komplett) -> schuldfrage (Gate) -> termin (35) -> sa. db_target=leads; SA -> Sentinel `_finalize`, termin -> Sentinel `_termin` (vom Save geskippt; Termin persistiert via `gutachter_termine.lead_id`). i18n 5 Sprachen.

### 1.3 SMOKE PASS (staging `/anfrage/{token}?wizard=v2`)
Voller e2e: alle 5 Phasen, Matching 3 leak-safe SVs (nur Vorname / „ca.X km" / Slots, KEIN firmenname), Booking, SA, Fall+Claim+Account. DB-verifiziert: lead.kanzlei_wunsch=partnerkanzlei / service_typ=komplett / schuldfrage=gegner, claim.sa_unterschrieben=true, **termin bestaetigt+claim_id-linked** (SP-G2 #2134 wirkt). Test-Daten FK-sauber gecleant. Script `scripts/smoke-beauftragung-v2-staging.py` (untracked; **utf-8-print-fix TODO** — der exit-1 war nur der `->`-Konsolen-Encoding-Crash NACH dem Erfolg, kein Flow-Fehler).

### 1.4 Koordination unisone-termin-engine (Session a6d8be48)
`termin` = reiner Consumer: KEIN `gutachter_termine`-Schema-Touch, KEIN Reservierungs-TTL-Guard (Engine ownt §7), `lead_id`/`sv_id` Phase-1-kompat, als Phase-3-Consumer in deren Spec gelistet. Slots aus #2165-Busy-Cache (live prod).

### 1.5 Offen (Reststrecke A)
- **P5** — `gutachter-finden`-Wizard trimmen (endet nach Termin+Kontakt) + `issueSelfServiceFlowLink` + Magic-Link; alte `konvertiereAnfrageZuFall`-Finalize raus + Slot-Carry-Conditional (`braucht_termin`-Flag -> termin-Phase conditional). **LIVE gutachter-finden = HARD-STOP, Aaron-Freigabe.**
- **P6** — Leak-Fix Matcher: `src/lib/onboarding/svMatching.ts` firmenname -> vorname (Wizard-SV-Banner). **LIVE.**
- **P7** — Promotion config-driven (GFA->Lead-Mapping ueber db_target/Konvention statt hardcoded).
- **MIG** — Cluster-LP `/anfrage` Default auf `WizardClient(beauftragung)` flippen (`?wizard=v2`-Gate entfernen) + **Matching/Booking-Phase conditional** (kein-Slot-Fall) + Re-Smoke (`scripts/smoke-aar940-staging.py`). **LIVE-Prod, zuletzt.**
- Kosmetik: Referenznummer leer im beauftragung-Erfolgsscreen (anfrageId null -> fallId zeigen ODER Block ausblenden).

---

## 2. Strecke B — Dispatch-Leads × Flowlink Config-Unify

**Branch:** `kitta/dispatch-leads-config-unify` (ab staging, Worktree `.claude/worktrees/dispatch-leads-config-unify`). Spec + P0-Plan committed+gepusht. **Execution NICHT gestartet.** Memory: `project_dispatch_config_unify.md`.

### 2.1 Problem & Entscheidung
Dispatcher-Detail (`/dispatch/leads/[id]`) ist hart an eine 6-Phasen-Sequenz gebunden (`page.tsx:initialPhase` / `_lib/qualification-engine` / `_actions/hard-gate` gaten + setzen `qualifizierungs_phase` automatisch) = Tagesgeschaeft-Mist (kein Gespraech laeuft gleich). **Aaron-Entscheidung: VOLL config-getrieben** — EINE `onboarding_felder`-Config + `audience` (kunde/dispatcher/beide) + `sektion`; zwei Renderer: Kunde gestuft (bestehender WizardClient, simpel); Dispatcher flach/frei (NEU `DispatchLeadForm`, alles sichtbar, Autosave/Feld, **kein Lock/Block**). Gates -> nicht-blockierende Flags. Onboarding+Flowlink ≈ Dispatch (1:1).

### 2.2 Spec (commits `0e7c5a7d7` + `983f005dc`)
`docs/superpowers/specs/2026-06-01-dispatch-leads-config-unify-design.md`:
- §3 Architektur (eine Config, zwei Renderer) · §4 Schema (audience/sektion + Feld-Inventar) · §5 Renderer · §6 Gates->Flags · §7 Flowlink-aus-Dispatch+Claim · §8 Migrations-Phasierung P0–P4.
- §8a Feld-Inventar nach Sektion (Kontakt/Schaden/Unfall/Fahrzeug/Schuld/Service/Termin/Vollmacht/Status, audience).
- **§8b OCR IMMER in die DB (Bug-Fix):** verifizierter Befund — `Zb1UploadField` schreibt die Extraktion via `uploadDokumentViaAnfrageToken('fahrzeugschein')` auf den Lead (H6, nur leere Felder), ABER `confirmZb1Korrekturen(fallId)`/`clearZb1Felder(fallId)` brauchen eine fallId, die im **Pre-Fall-Flowlink nicht existiert** -> No-op -> **Kunden-Korrekturen am OCR gehen verloren**. Soll: token-basiert persistieren.
- §8c Checkliste + Anforder-Buttons vor Flowlink-Versand (nicht-blockierend, `dokumente-anfordern`).
- §8d Unfallgegner-Kontakt + **simpler Gegner-Flow** (Gegner fuellt nur Hergang + Schuldeingestaendnis; Future-Ausbau; auch im Dispatch nutzbar).
- REIN: WhatsApp-Check (`whatsapp_verfuegbar`), Unfallskizze (Kunde+Dispatcher), Zeugen+Telefon/Email, Vorschaeden. RAUS: Bankdaten/Vorsteuer.

### 2.3 P0-Plan (committed `4b2c3ba0c`)
`docs/superpowers/plans/2026-06-01-dispatch-config-unify-p0-schema.md` — bite-sized TDD, 4 Tasks:
1. `src/lib/onboarding/filter-felder-by-audience.ts` (+ Test) — pure Helper (default 'beide').
2. `OnboardingFeld.audience`/`sektion` Types (`src/components/onboarding/types.ts`).
3. Migration `onboarding_felder.audience`(default 'beide', CHECK)/`sektion` (additiv, Plugin).
4. Kunden-Loader filtern (`load-needed-phases.ts` + `lade-beauftragung-phasen.ts`, `filterFelderByAudience(...,'kunde')`).
Invariante: alle Bestandsfelder default 'beide' -> Filter = No-op -> bestehende Flows unveraendert.

### 2.4 Offen (Strecke B)
- **P0 ausfuehren** (Plan oben) — Execution-Wahl steht aus (subagent-driven / inline / frische Session).
- **P1** Feld-Inventar-Seed — braucht exhaustive Read `_phases/*` + `hard-gate.ts` + `_actions/types.ts` + `qualification-engine.ts`; + WhatsApp/Skizze/Zeugen/Vorschaeden/Gegner-Kontakt-Felder.
- **P2** `DispatchLeadForm` (flach, audience=dispatcher/beide, sektion-Gruppen, Autosave/Feld, Flags) hinter `?v2` + OCR-Fix (token-basiert) + Checkliste.
- **P3** Cutover (`/dispatch/leads/[id]` default DispatchLeadForm; `DispatchShell`/`qualification-engine`/`initialPhase`/`_phases`-Gating raus nach gruenem Smoke).
- **P4** Re-Smoke beider Strecken + Disqualifikations-Reporting auf manuelles Flag umstellen.

---

## 3. Konstanten / Koordination

- **Harte Regeln:** DDL NUR via Plugin-`apply_migration` (Twin-Drift: committetes File == recorded version), PR `--base staging`, nie main, **nie selbst mergen** (die EINE Merge-Session mergt), 7-Punkt-Audit pro Commit, Umlaute in UI-Strings, Server-Actions = Result-Object (kein throw), neue UI nur `primitives.Button/Card`.
- **Worktree-tsc** lief diese Session sauber (`tsc --noEmit` 0 Fehler) — die Junction-TS2307-Sorge trat NICHT auf; trotzdem ist CI-`build` das autoritative Type-Gate.
- **Viele aktive Sessions** auf dispatch/leads/monika-embed -> Datei-/Migrations-Koordination; vor jeder Schema-Migration `information_schema` live pruefen.
- **Supabase** Projekt `paizkjajbuxxksdoycev`. **Staging-Smoke:** Basic-Auth `aaroncmdo` / `ClaimondoSuperuser123789!!`, `app.staging.claimondo.de`. Marketing (`/gutachter-finden`) liegt NICHT auf app.staging (eigener Deploy) -> dort 404.

## 4. Empfehlung naechster Schritt
**B-P0** als sauberer Einstieg (klein, rein additiv, self-contained, kein Live-Risk). Parallel **A-MIG** erst nach Aaron-Go (Live-Prod-Flip). A-P5/P6 fassen den LIVE `gutachter-finden` an -> Hard-Stop bis Freigabe.
