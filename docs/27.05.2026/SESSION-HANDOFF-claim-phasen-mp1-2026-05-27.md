# Session-Handoff — Claim-Phasen-SSoT: MP-1 KOMPLETT + Business-Logic (2026-05-27, Session 2)

> **Für die nächste Session reicht:** dieses Doc + `docs/27.05.2026/cmm44-subphasen-mapping.md` **§8–§12**
> lesen, dann bei **§5 (MP-2)** einsteigen. Memory-Leitstern: `project_claim_phasen_ssot_architektur`.
> **Branch:** `kitta/cmm44-claim-phase-mp1` (off staging, **KEIN PR** — reine Analyse).

---

## 0 · Der Auftrag, der reinkam

Vom Vorgänger-Handoff (`SESSION-HANDOFF-claim-phasen-2026-05-27.md`, PR #1821): *„MP-1 (System-B-Inventur,
kein Code) + DE-1/2/3 mit Aaron klären, nachdem #1809 auf staging ist."*

**Erledigt + weit darüber hinaus:** MP-1 vollständig **plus** die komplette Business-Logic des Phasen-
Systems mit Aaron durchgesprochen und gelockt (DE-1…4 **+ B-1…15**), Plan an die Entscheidungen angeglichen
(§12). Kein Code geschrieben — MP-2 ist bewusst der nächste, frische Block (Aaron: heikler Re-Base →
sauberer Kontext).

---

## 1 · Was diese Session erreicht hat

- **Isolierter Worktree** `kitta/cmm44-claim-phase-mp1` (off `origin/staging` @ `847e5bac`, inkl. P0 #1809 +
  Override-Stopgap #1818). `doc38`-Branch-Kollision damit umgangen.
- **MP-1 komplett** im Doc `docs/27.05.2026/cmm44-subphasen-mapping.md`:
  - §2.2 System-B-Consumer-Karte (file:zeile) · §3 52-Key-Klassifikation `{a:11 / b:7 / c:33 / d:1}` ·
    §4 `resolveSubphase`-Input-Inventur · **§8 Einfluss-Karte** (Owning-Sub-Entity pro Phase, verifiziert
    gg. `database.types.ts`) · **§9 Event-/Writer-Katalog** (Stepper-Transition → Trigger → Writer → Folge).
- **§10** Architektur-Klarstellungen · **§11** Business-Logic B-1…15 · **§12** Plan-Angleichung (MP-Delta).
- **Memory-Leitstern aktualisiert** (`project_claim_phasen_ssot_architektur` → Block „DELIVERABLES 2026-05-27
  Session 2").
- **Worktree code-bereit:** node_modules-Junction + `.env.local` + `supabase/.temp` eingerichtet.
- **Commits** `a7dcedec … 6e4e6f2d` auf dem Branch gepusht. **KEIN PR** (sync-watcher würde auto-mergen; das
  ist Analyse, kein Merge-Kandidat — bei Bedarf später als Doc-PR).

---

## 2 · Die Entscheidungen (Referenz — Details in §11 des Mapping-Docs)

**DE-1** volle Granularität: die 33 feinen Ops-Subphasen bleiben (re-based, **abgeleitet**), Backbone = 9
abgeleitete Subphasen · **DE-2** Visibility 1:1 erhalten (Treffermenge vor/nach vergleichen) · **DE-3**
`aktuelle_phase`-Alias systematisch+vollständig (Übergangs-Alias → portal-weise weg → Drift-Gate) ·
**DE-4** `claim_payments.empfaenger` (kunde|sv) für Auszahlungs-Split.

**B-1** 4 Hauptphasen, **KEINE Klage-Phase** (Klage/Rechtsstreit = abschluss-Substate, managen wir nicht) ·
**B-2** begutachtung ab Auftrag-Anlage · **B-3** regulierung inkl. *erster* Ablehnung ·
**B-4** *finale* Ablehnung → immer terminaler abschluss (Endkunde: akzeptieren=storniert / klagen=klage) ·
**B-5** abschluss = 1 terminaler Punkt + Substate `erfolgreich_reguliert / storniert / klage_rechtsstreit /
verjaehrt` · **B-6** Abschluss-Signal explizit von KB/Kanzlei (nicht aus claim_payments auto-berechnet) ·
**B-7** Abbruch = sofort terminal `storniert` · **B-8** No-show = expliziter `storno-actions`-Event +
Counter (N× → auto-storno) · **B-9** QC-Truth = `auftraege` (`filmcheck_ok` / `gutachten_final_freigegeben`) ·
**B-10** regulierung-Eintritt = `kanzlei_faelle.lexdrive_case_id` (nicht bloße Existenz) ·
**B-11** abschluss-Substate-Quelle = `claims.status` (reguliert_vollstaendig/storniert/klage_rechtsstreit/
verjaehrt) · **B-12** Auszahlung ≠ Abschluss (kanzlei.status + claim_payments = regulierung-intern/
informativ, keine Kollision) · **B-13** Pflichtdokumente = **advisory** (kein Hard-Block, auch ZB1 nicht) ·
**B-14** Pflichtdok-Matrix-Vokabular (8 Phasen + 6 Szenarien) re-mappen = **eigenes späteres Ticket** ·
**B-15** Regulierung + Abschluss heute **KB-manuell** (Admin 2. Instanz; keine LexDrive/Kanzlei-Anbindung).

---

## 3 · Das Modell in einem Satz

> Trigger-Felder (Owning-Sub-Entities, **ab der Anfrage**) → **4 Hauptphasen abgeleitet** (erfassung→
> begutachtung→regulierung→abschluss) → Phase **gated** Pflicht-/Payload-Felder (Relevanz + Done) →
> Transitionen = **Events** → Tasks/Mitteilungen/Nachrichten. Lead+Claim getrennt gespeichert, eine
> durchgehende Lifecycle. Termin orthogonal (`gutachter_termine`). Abschluss = `claims.status`-terminal
> (KB/Kanzlei-Urteil); Auszahlung informativ.
>
> **Quellen:** erfassung←`leads` · begutachtung←`auftraege` (+ Sub-Table `gutachten` für QC) ·
> regulierung←`kanzlei_faelle` (+ Side-Quest-`auftraege`) · abschluss←`claims.status` · Termin←`gutachter_termine`.

---

## 4 · Aktueller Stand

- ✅ **Analyse + Spec komplett** (Doc §0–§12). Business-Logic gelockt.
- ❌ **Kein Code**: `resolveSubphase` liest noch `faelle`-Trigger-Felder; `v_claim_phase` nutzt noch die
  alten regulierung/abschluss-Bedingungen (kf-Existenz / payment-basiert); Loader-SELECTs noch schmal
  (`KanzleiFallRow` = nur status/vs_kontakt_am/ausgezahlt_am).
- ⚠️ **Offene Verifikation** (siehe §5 Schritt 1): ob die Owning-Felder (`kanzlei_faelle.vs_reaktion_typ`,
  `claim_payments`, `claims.status`-terminal) überhaupt **befüllt** werden, ist per Code-Grep NICHT
  bestätigt — Live-DB-Check ist der erste MP-2-Schritt.

---

## 5 · NÄCHSTER SCHRITT — MP-2 (hier einsteigen)

**Ziel:** `resolveSubphase` von `faelle`-Trigger-Feldern auf die Owning-Sub-Entities umstellen (Read-Swap,
§8), Treffermenge erhalten. **TDD-Pflicht** (Treffermengen-Test ZUERST, dann Re-Base).

1. **Live-DB-Writer/Populations-Check (KRITISCH — zuerst, read-only).** Für die §9.7-ⓥ-Felder prüfen, ob die
   **Owning-Entity** befüllt wird (nicht nur die sterbende `faelle`-Kopie):
   - `SELECT count(*) FILTER (WHERE vs_reaktion_typ IS NOT NULL)` auf `kanzlei_faelle` **vs** `faelle`
   - `claim_payments`: row count + wer schreibt (writer suchen — Grep fand keinen `from('claim_payments').insert`)
   - `claims.status`-Verteilung: trägt es real `reguliert_vollstaendig/storniert/verjaehrt`, oder hängt es
     (Spec sagte „dispatch_done")? Wer schreibt die terminalen Werte?
   - `kanzlei_faelle.lexdrive_case_id`: befüllt? (B-10/B-15 — heute KB-manuell, evtl. fast leer)
   - **Wenn ein Owning-Feld leer ist, aber faelle befüllt:** der **Writer** muss zuerst auf die Owning-Entity
     umgestellt werden (sonst liest der re-basete Resolver ins Leere → Phase hängt). Das ist der eigentliche
     Risiko-Hotspot dieser ganzen Strecke (Aarons „jedes Feld braucht einen Eintragenden").
   - Tooling: MCP `execute_sql` (project_id aus `.env.local` `SUPABASE_URL`); Fallback `curl -4` gegen
     PostgREST / `npx supabase db query --linked` (MCP-443-Reads timeouten unter Pool-Last; `db push` 5432
     funktioniert trotzdem).
2. **Loader-SELECTs erweitern:** `src/lib/kanzlei-fall/queries.ts` (`KanzleiFallRow` ~3 → ~25 Felder:
   vs_reaktion_typ/_am, vs_kuerzungs_typ, kuerzungs_betrag, vs_quote_*, ruege_*, anschlussschreiben_*,
   eskalation_tag_*, mandatsnummer, vs_frist_bis, klage_uebergeben_am, lexdrive_case_id, regulierung_*).
   Ggf. `auftraege` (QC: filmcheck_ok/gutachten_final_freigegeben + technische_stellungnahme_*) +
   `gutachten` (ocr_status/pdf_uploaded_at) + `claim_payments`.
3. **`resolveSubphase` re-basen** (`src/lib/fall/subphase-resolver.ts`): Input von `fall: FallRow` auf die
   Sub-Entities (`kanzleiFall`/`auftraege`/`gutachten`/`lead`/`gutachter_termine`/`claim_payments`).
   `lead` + `gutachter_termine` sind **bereits** Inputs ✓. Mapping-Tabelle = §8.6 (inkl. Name-Mismatches:
   `gutachten_eingegangen_am`→`gutachten_url`, `ocr_extrahiert_am`→`gutachten.ocr_status`,
   `cardentity_abfrage_am`→`leads.cardentity_enriched_at`).
   - **TDD:** `subphase-resolver.test.ts` zuerst auf die neuen Sub-Entity-Inputs umschreiben, **Treffermenge
     erhalten** (kein Eindampfen der Ops-Subphasen) — Test rot sehen, dann re-basen, grün.
   - Caller anpassen: `src/app/faelle/[id]/page.tsx:780` (übergibt heute `fall` → künftig die Sub-Entities;
     `kanzlei_faelle` wird dort schon geladen ~Z.764, `auftraege` via `getAlleAuftraege`).
4. **Audit + PR `--base staging`** (voller `npm run build` — never-Narrowing!; vitest grün; Smoke Admin/SV-
   Fallakte `PhaseTriggerList`). NICHT self-mergen (sync-watcher).

**Danach (eigene PRs, §12):** MP-3 `v_claim_phase` (regulierung-Eintritt → `lexdrive_case_id` B-10;
abschluss → `claims.status`-terminal B-11/B-12) — gekoppelt mit MP-4 (Reader portal-weise). MP-5 Visibility.
MP-6 System-A-Drop. MP-7 `faelle.status` + no-show/storno-Pfad → claims. MP-8 Dispatch/Override.
MP-9 Drift-Gate. Quer: `claim_payments.empfaenger`-Migration (DE-4, DDL via CLI Regel 2), `vs_ablehnungsgrund`
live-verify (§8.6), Pflichtdok-Matrix-Re-Map (B-14, eigenes Ticket).

---

## 6 · Artefakte + Verweise

- **DIESES Handoff:** `docs/27.05.2026/SESSION-HANDOFF-claim-phasen-mp1-2026-05-27.md`
- **Spec/Analyse (ALLES):** `docs/27.05.2026/cmm44-subphasen-mapping.md` (§0–§12) — die autoritative Karte.
- **Memory:** `project_claim_phasen_ssot_architektur` (Block „DELIVERABLES 2026-05-27 Session 2").
- **Vorgänger:** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md` (Ur-Plan MP-0..9, PR #1821) ·
  `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md` (Spec, approved).
- **Code-Anker:** `src/lib/claims/lifecycle.ts` (`getClaimLifecycle`, 4 Phasen + 9 Subphasen) ·
  `src/lib/claims/get-claim-lifecycle-for-claim.ts` (P0-Loader) ·
  `supabase/migrations/20260526202512_v_claim_phase_view.sql` (P0-View) ·
  `src/lib/fall/subphase-resolver.ts` + `subphase-visibility.ts` (System B, MP-2-Ziel) ·
  `src/lib/dokumente/pflicht-dokumente.ts` (Pflichtdok-Matrix, B-13/B-14) ·
  `src/lib/actions/storno-actions.ts` (No-show/Storno-Writer, B-7/B-8) ·
  `src/lib/notifications/emit.ts` + Mitteilungs-Resolver `event-to-task-map.ts` (AAR-764, die „Folge").
- **Branch/Commits:** `kitta/cmm44-claim-phase-mp1`, `a7dcedec … 6e4e6f2d`. **Worktree:**
  `.claude\worktrees\cmm44-claim-phase-mp1` (Env steht).

---

## 7 · Gotchas / Lessons (nicht nochmal reinlaufen)

- **Worktree-Pfad-Disziplin:** ALLE File-Ops mit dem **Worktree**-Pfad (`…\.claude\worktrees\cmm44-claim-
  phase-mp1\…`), NICHT dem Main-Repo-Pfad. (Diese Session: 2× ins Main-Repo geschrieben → musste verschoben
  werden. Main-Repo ist auf `doc38` mit 3 anderen Sessions — nicht trampeln.)
- **Env ist gesetzt** (Junction/.env.local/.temp) — aber node_modules ist eine **Junction** aufs Main-Repo;
  lokales `tsc` zeigt evtl. Junction-Artefakte (sharp/@react-pdf/pdf-parse) = KEINE echten Fehler, CI grün.
- **Writer-Population ist die offene Kernfrage** (§5 Schritt 1): re-base NIE blind — erst prüfen ob die
  Owning-Entity befüllt wird. Sonst hängt die abgeleitete Phase.
- **`v_claim_phase` ändert sich in MP-3** gegenüber P0: regulierung-Eintritt `kf.fall_id IS NOT NULL` →
  `kf.lexdrive_case_id IS NOT NULL` (B-10); abschluss payment-basiert → `claims.status`-terminal (B-11/B-12).
  Die P0-Parity-Probe (`scripts/probe-claim-phase-parity.mjs`) muss entsprechend mitgezogen werden.
- **Trigger ≠ Payload:** nur ~15 Lifecycle-Milestones treiben Phasen; die ~150 Lead-Properties (fahrzeug/
  gegner/halter) sind Payload — gehören NICHT ins Phasen-Modell.
- **Pflichtdokumente = advisory** (B-13): kein Hard-Block. Was blocken muss (SA/Vollmacht/Onboarding) ist eh
  Lifecycle-Trigger. Pflichtdok-Matrix-Vokabular-Re-Map ist B-14 = eigenes späteres Ticket.
- **False Friends** (NICHT als claims.phase/Subphase behandeln): `KritischeUpdatesWidget`=`tasks.phase`;
  cron `kanzlei-sla-check`=`sla_tracking.phase`; cron `pflichtdokumente-reminder`=Pflicht-Vokabular (aber
  liest `aktuelle_phase` → beim MP-3-Alias-Repoint mit-prüfen!).
- **PR `--base staging`, NIE self-mergen** (sync-watcher merged build-grüne PRs autonom + löscht Branch).
- **Migrationen nur via CLI** (`npx supabase db push`, Regel 2), im ruhigen Pool-Slot.
