# HANDOFF — embed-B = nur_gutachter Light-Claim (AAR-939, Option B)

**Session:** e00ee6d8 · **Datum:** 30.05.2026 (Abend) · **Für:** die nächste Session, die die Claim-Mechanik fertigbaut.
**TL;DR:** embed-B (Monika Variante B, bezahlt) wird als bestehender **`nur_gutachter`-Claim** modelliert. Lead + Bridge + KB-Skip + Terminal-Status sind **gebaut + verifiziert** (PR #2072 merged, PR #2076 offen). Offen: dynamischer Stepper (3b) + Auto-Close auf **Termin-durchgeführt** (3c). **Wichtigste Klärung:** der SV lädt KEIN Gutachten hoch (off-platform) → Abschluss hängt an `durchgefuehrt_am`, nicht an einem Upload.

---

## Das Modell (Aarons Entscheidungen, chronologisch geklärt)

embed-B ist im Grunde **Lead → Auftrag**, ein **kürzerer Claim-Weg** (98044b6b-Marker: „es ist schon ein claim aber ein kürzerer weg"):

- **= `nur_gutachter`-Claim** (kein Neu-Konzept). Die Achse `service_typ='nur_gutachter'` existiert (45 native live).
- **Kein Kanzlei-/Regulierungs-Service**, **kein Kundenbetreuer**, **kein QC/Gutachtencheck**.
- **WIR holen die SA ein** (Variante B) → Termin **verbindlich** schon bei SA (keine Vollmacht nötig — `nur_gutachter` gatet das schon).
- **Es ist ein Auftrag für den SV** — er verdient daran, deshalb committed nach SA.
- **Billing-Matrix (98044b6b):** SA eingeholt + Termin verbindlich → SV zahlt 70 € bei *durchgeführt* ODER *SV-Ablehnung*; **Kunde-Storno → kein Charge**. (Storno/Ablehnung-Felder noch zu modellieren.)
- **Der SV macht das Gutachten off-platform** (sein Geschäft) — wird **NICHT** zum Upload gebeten. → Abschluss-Signal = **Termin durchgeführt**, nicht Upload.

### Kunde-Sicht (zentrale Erkenntnis aus dem Map-Workflow wf_d85a5f93)
Das Kunde-Portal verzweigt **nicht** auf `service_typ` — es ist **daten-präsenz-getrieben**. Ein nur_gutachter-Claim hat nie eine Kanzlei → **alle Kanzlei-/Regulierungs-Sektionen blenden sich automatisch aus** (`KanzleiPfadCard`/`MeineKanzleiCard` self-hide). Kein UI-Umbau der Sektionen nötig. Der Kunde sieht: Erfassung → Begutachtung/Termin → Abschluss.

---

## Was GEBAUT + VERIFIZIERT ist

| Teil | PR | Status |
|---|---|---|
| **Lead + SV-Zuweisung** | **#2072 MERGED** | embed-B-Anfrage → Lead (`source_channel='monika_embed'`, `zugewiesen_an`=SV-Profil, `service_typ` kam in #2076). 3 Migrationen (Trigger + schadentyp-Map + SV-Assign), zero-persistence verifiziert. |
| **(1) Bridge `service_typ`** | **#2076 OFFEN** | Trigger setzt `leads.service_typ='nur_gutachter'` (Migration 20260530205230). convert-lead-to-claim liest `lead.service_typ` → Claim wird nur_gutachter. Verifiziert. |
| **(2) KB-Skip** | **#2076** | `convert-lead-to-claim.ts:145` — kein Kundenbetreuer für embed-B. **Gegate auf `source_channel='monika_embed'`** (NICHT service_typ → native nur_gutachter behalten KB). Verhindert auch SV-als-KB (zugewiesen_an=SV). tsc grün. |
| **(3a) Terminal `gutachten_abgeschlossen`** | **#2076** | Migration 20260530210242: `claims_status_check` + `v_claim_phase` (→ Phase `abschluss`). TS-Parity: `lifecycle.ts` ClaimSubPhase + SUBPHASE_LABEL + ABSCHLUSS_SUBSTATE; `endzustand-actions.ts` ENDZUSTAENDE-Guard. Verifiziert: lifecycle-Unit-Test 31/31, tsc 0. Fixt nebenbei native nur_gutachter (hingen bisher ohne Terminal). |

**Branch:** `kitta/aar-939-embed-b-nur-gutachter` (= #2076, off staging mit #2072).

---

## OFFEN — was die nächste Session baut

### 3b · Dynamischer ClaimStepper
`src/components/kunde/ClaimStepper.tsx` rendert **4 fixe Phasen** (`MAIN_PHASES`, Z.18-23) inkl. „Regulierung". Für `nur_gutachter` (keine Kanzlei) ist Regulierung leer → muss **weggelassen** werden: **Erfassung → Begutachtung → Abschluss**.
- Kein Logik-Risiko: der Claim läuft eh **nie** in `regulierung` (braucht `lexdrive_case_id` oder VS-Status, den nur_gutachter nie bekommt).
- Stepper braucht `service_typ` (kommt aus `getKundeFallDetailRecord`, claims.service_typ wird schon geladen). Helper `getVisiblePhases(serviceTyp)`.

### 3b-Zusatz · Kunden-Re-Ask unterdrücken (Verifikations-Befund)
Der Re-Ask „wie weiter? (Komplettservice / eigene Kanzlei / selbst einreichen)" feuert **NACH QC** — `KanzleiPfadCard` (Z.76-79) self-hided für unentschieden/nicht_gefragt; die Frage lebt im Stepper-Banner gegated auf **`gutachten_final_freigegeben`** (= QC durch; `page.tsx:527/635/783`). **Native nur_gutachter** bekommen den Re-Ask als Upsell (gewollt). **embed-B** darf ihn NICHT bekommen (Kunde hat über SV-Seite gewählt + wir haben die SA) → **unterdrücken, gegate auf `source_channel='monika_embed'`** (analog KB-Skip).

### 3c · Auto-Close — auf TERMIN DURCHGEFÜHRT (nicht Upload!)
**Kernklärung (Aaron):** Der SV lädt KEIN Gutachten hoch (off-platform). Also:
- **Trigger = `gutachter_termine.durchgefuehrt_am`** (via `markTerminDurchgefuehrt`), NICHT ein Auftrag-Gutachten-Upload.
- **Dasselbe Event treibt 98044b6bs Billing** (`gfa.status='abgeschlossen'` → 70 €) — Auto-Close + Billing hängen am selben Signal. **Mit 98044b6b koordinieren**, dass beim durchgeführten embed-B-Termin gesetzt wird: gfa.status='abgeschlossen' (deren Billing) **+** claims.status='gutachten_abgeschlossen' (mein Terminal).
- **Der fehlende Upload ist egal:** der Terminal-Status **überschreibt** die Begutachtungs-Phase in v_claim_phase → Claim schließt sauber, ohne auf einen Auftrag-Status zu warten, der nie 'gutachten'/'abgeschlossen' wird.
- **Kunde-View:** Gutachten-Upload/Download-Sektion für embed-B unterdrücken.
- Implementierung: DB-Trigger auf `gutachter_termine` AFTER UPDATE OF `durchgefuehrt_am` (für nur_gutachter/embed-B-Claims) ODER in `markTerminDurchgefuehrt` mit-setzen. **ACHTUNG Kollision** mit 98044b6bs Billing-Trigger auf gfa — abstimmen wer was am durchgeführt-Event setzt.

### Naming-Reconsideration
`gutachten_abgeschlossen` ist leicht schief (kein Platform-Gutachten). Evtl. `vermittlung_abgeschlossen` / `termin_durchgefuehrt`. End-State-Semantik stimmt; Rename = Migration + lifecycle + v_claim_phase + tsc. Vor weiterem Bau mit Aaron entscheiden.

---

## Koordination
- **98044b6b** (`kitta/aar-939-monika-billing`): baut **SA-Einholung + Billing** (Storno/Ablehnung-Matrix). Schnittstelle zu meinem Lead im #2072-Kommentar dokumentiert (`leads.source_channel='monika_embed'`). Das **durchgeführt-Event** ist der gemeinsame Hook (Billing + Terminal) — eng abstimmen.
- **c31ae7a0** prüft gerade die **Claims-as-SSoT-Strecke + Lifecycle-Modell** (Aaron: „lies den claims-as-ssot plan nochmal durch") — das embed-B/nur_gutachter-Terminal `gutachten_abgeschlossen` ist Teil dieses Lifecycle-Vokabulars (CMM-44 MP-8). Gegenchecken, dass der neue Terminal in v_claim_phase/lifecycle/Statistiken konsistent ist.
- **CMM-44-Kernfiles** (lifecycle.ts, v_claim_phase, convert-lead-to-claim, endzustand-actions) sind contended (MP-8 + CMM-50) — Edits klein + gegate halten, auf aktuellem staging bauen.

## Referenzen
- Map-Workflow (nur_gutachten-Pfad / Kunde-View / Lifecycle / Auftrag): Run wf_d85a5f93, 4 Subsysteme.
- Bestehende Endzustand-Writer-Vorlage: `src/lib/claims/endzustand-actions.ts` (6 Terminals, ENDZUSTAENDE-Guard, setEndzustandFields).
- Parity-Gate: `scripts/probe-claim-phase-parity.mjs` (braucht `.env.local` — im Worktree nicht vorhanden; tsc-`Record<ClaimSubPhase>` ist der Ersatz-Check).
- Memory: `project_aar939_stream3b_sv_portal.md`.

*Erstellt von Session e00ee6d8 (30.05.2026). Lead-Foundation #2072 merged, Claim-Mechanik #2076 offen.*
