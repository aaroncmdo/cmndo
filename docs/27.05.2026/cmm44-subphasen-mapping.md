# CMM-44 — System-B-Subphasen-Mapping (MP-1)

> **Status: DRAFT für DE-1/2/3-Review (Aaron).** Reine Analyse, kein Code.
> **Datum:** 2026-05-27 · **Branch:** `kitta/cmm44-claim-phase-mp1` (off staging) ·
> **Vorgaenger:** P0 #1809 (`v_claim_phase` + Loader) + Override-Stopgap #1818, beide auf staging.
> **Plan:** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md` (MP-1) ·
> **Spec:** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md` ·
> **Memory:** `project_claim_phasen_ssot_architektur`.

---

## 0 · Zweck & Methode

MP-1 ist die System-B-Inventur vor dem Re-Base (MP-2). Drei Deliverables:
1. **§3** — die 52 `SUBPHASE_VISIBILITY`-Keys klassifizieren: **{a}** deckt eine der 9 abgeleiteten
   Subphasen · **{b}** Termin-Overlay (orthogonal) · **{c}** bleibt feine Ops-Subphase (re-based auf
   Sub-Entities) · **{d}** retire.
2. **§4** — `resolveSubphase`-Input-Inventur: welche Felder liest es heute, woher kaemen sie aus den
   Sub-Entities.
3. **§2.2** — System-B-Consumer-Karte (file:zeile).

Gelesen: `lifecycle.ts`, `get-claim-lifecycle-for-claim.ts`, `20260526202512_v_claim_phase_view.sql`,
`subphase-visibility.ts`, `subphase-resolver.ts`, `next-step-hints.ts`, `fall-phases/*`, die Consumer
(grep). Kein DB-Probe noetig (statische Code-Analyse).

---

## 1 · Ziel-Vokabular: die 9 abgeleiteten Subphasen

`getClaimLifecycle` (`src/lib/claims/lifecycle.ts`) + SQL-Spiegel `v_claim_phase` liefern **4 Hauptphasen
+ 9 Subphasen**. Die Subphase ist **kein eigenes Enum**, sondern der **Status der treibenden Sub-Entity**:

| Hauptphase | Subphase | Quelle (Sub-Entity) |
|---|---|---|
| **erfassung** | `sa_offen` / `vollmacht_offen` / `onboarding_offen` | **Lead** (sa_unterschrieben · vollmacht_signiert_am · onboarding_complete) |
| **begutachtung** | `termin` / `besichtigung` / `gutachten` | **Auftrag** (erstgutachten).status, 1:1 |
| **regulierung** | `versicherungskontakt` / `auszahlung` | **Kanzleifall**.status |
| **abschluss** | `abgeschlossen` | Kanzleifall ausgezahlt **+** alle Auftraege abgeschlossen |

Prioritaet top-down: `abschluss > regulierung > begutachtung > erfassung`. Side-Quests
(Nachbesichtigung/Stellungnahme = eigene Auftraege) laufen sichtbar in `regulierung`, **aendern die
Hauptphase nicht** (`lifecycle.ts:94-96, 116-124`).

**Das ist gewollt grob.** Die feinen Ops-States (QC, Ruege, Quote, Eskalation) bildet das 9-Modell
*nicht* ab — genau dafuer ist die {c}-Klasse in §3 da.

---

## 2 · Befund: DREI divergierende Subphasen-Vokabulare

### 2.1 Die drei Systeme nebeneinander

| Sys | Quelle | Vokabular | Inputs | Treibt (Render) |
|---|---|---|---|---|
| **C** ✅ kanonisch | `getClaimLifecycle` / `v_claim_phase` | 4 Phasen + **9** Subphasen (`sa_offen`, `termin`, `versicherungskontakt`, …) | Lead · Auftrag · Kanzleifall | Kunde-`ClaimStepper` (CMM-32) |
| **B-vis** | `SUBPHASE_VISIBILITY` (`subphase-visibility.ts`) | **52** snake_case-Keys (`sv_unterwegs`, `ruege_1_versandt`) in 10 `PHASE_META`-Buckets | liest `fall.aktuelle_phase` **direkt** | `buildPhasePipelineData` → `FallPhasenPanel`/`PhasePipeline` (Kunde+Admin+SV+Kanban) |
| **B-res** | `resolveSubphase` (`subphase-resolver.ts`) | **gepunktete Codes** (`2.1`, `6f.1`, `7.5b`, `9.3`) + phase 1–9 | ~50 `faelle`-Trigger-Felder **+** `gutachter_termine` + `lead` + `webhook_events` | nur Admin `PhaseTriggerList` |

**Kernbefund:** B-vis und B-res sind **zwei NICHT-verbundene Vokabulare**. `buildPhasePipelineData` liest
`fall.aktuelle_phase` (snake_case) — es konsumiert **NICHT** den Output von `resolveSubphase` (gepunktet).
Der Kommentar in `subphase-visibility.ts:9-11` ("Der Phase-Resolver schreibt weiter fall.aktuelle_phase")
ist **stale**: der Resolver gibt gepunktete Codes zurueck, und es gibt keinen Writer, der die in den
snake_case-CHECK schreibt. → System B ist auf Datenebene faktisch **verwaist**.

### 2.2 Runtime-Consumer-Karte (System B) — MP-1c

**`buildPhasePipelineData(fall, rolle)`** (52-Key-Pfad, liest `fall.aktuelle_phase`):
- `src/components/shared/fall-phases/FallPhasenPanel.tsx:55` — der Shared-Wrapper. Gemountet in:
  - `src/app/kunde/faelle/[id]/page.tsx:851` — Kunde `progress-card` (**whitelabel/gebrandet**)
  - `src/app/faelle/[id]/FallakteShell.tsx:168` — Admin+SV `aside`
  - `src/app/gutachter/fall/[id]/_components/FallHeader.tsx` + `FallDetailClient.tsx:236` — SV `header-strip`
- `src/app/admin/faelle/(hub)/FaelleKanban.tsx:255` + `<PhasePipeline …>` :420 — Admin-Kanban-Hover
- `src/app/dev/phases/page.tsx:101` — Dev-Playground (egal)

**`resolveSubphase(input)`** (gepunktete Codes) — **genau 1 Laufzeit-Caller:**
- `src/app/faelle/[id]/page.tsx:780` → uebergibt als `subphase`-Prop an `FallakteShell` → durchgereicht an
  `src/components/admin/fallakte/FallActionBar.tsx:117` → `<PhaseTriggerList fields={result.trigger_fields} />`
  (`PhaseTriggerList.tsx:44` — listet nur die Trigger-Felder + `next_hint`). **Nur Admin/KB sichtbar.**

**`SUBPHASE_VISIBILITY` / `PHASE_META` direkt:**
- `src/components/admin/fallakte/ManualPhaseOverrideModal.tsx:19,60,87,105` — Override-Modal,
  **stopgap-deaktiviert** (#1818), Re-Build = MP-8.

**`aktuelle_phase`-Alias-Reader** (alle bekommen heute `claims.phase` 11-Code via SP-D-View-Alias):
- `src/lib/claims/get-kunde-faelle.ts:583` — `aktuelle_phase: c.phase` (Kunde)
- `src/app/admin/faelle/(hub)/page.tsx:269` — `aktuelle_phase: suppClaim?.phase` (Admin-Hub)
- `src/app/admin/faelle/(hub)/FaelleKanban.tsx:58` `mapStatus()` — liest substrings (`sv_unterwegs`,
  `gutachten`, `qc_bestanden`, `termin_bestaetigt`) → matcht 11-Code NICHT → faellt auf `status`
- `src/app/kanzlei/kanban/page.tsx` — extrahiert Ziffern-Prefix (bricht bei `erfassung` ohne Ziffer!)
- `src/app/kanzlei/mandate/page.tsx:32`, `src/lib/makler/queries.ts:330,559,592`,
  `src/components/makler/MaklerAktenList.tsx:282`, `MaklerAkteDetail.tsx:159`,
  `src/components/kunde/FallStatusCard.tsx:121`, `FallActionBar.tsx:58`,
  `src/app/faelle/[id]/FallakteShell.tsx:153`, `src/app/kunde/faelle/[id]/page.tsx:386`,
  `src/app/gutachter/fall/[id]/FallDetailClient.tsx:238`, `src/lib/fall/queries.ts:39` (`FALL_SELECT_KUNDE`)

**False Friends (NICHT als System-B-Subphase anfassen — anderes Vokabular):**
- `src/app/api/cron/pflichtdokumente-reminder/route.ts:33,46` — liest `aktuelle_phase as Phase` +
  `dokumente_vollstaendig_fuer_phase` (**Pflichtdokument-Vokabular**, nicht die 52 Subphasen) → **TODO
  MP-1: separat verifizieren**, ob dieser Cron durch den View-Alias-Repoint (MP-3) bricht.
- `KritischeUpdatesWidget` = `tasks.phase`; cron `kanzlei-sla-check` = `sla_tracking.phase`.

### 2.3 Der Bruch (Ist-Zustand auf staging)

`faelle.aktuelle_phase` ist gedroppt (SP-A2, `20260517141457`). SP-D (`20260521154558`) hat den View-Alias
`aktuelle_phase` auf `c.phase` (11-Code System A) repointet. → `buildPhasePipelineData` bekommt 11-Code,
`SUBPHASE_VISIBILITY[11-Code]` = `undefined` → **alle Subphasen rendern als `upcoming`/Fallback**, Kanban
faellt auf `status`. Der reiche PhasePipeline ist **schon jetzt** funktional tot — der promotete
Live-Lifecycle-Value ist aktuell nicht sichtbar. (Das ist die Geschaeftskritikalitaet hinter MP-1..MP-5.)

---

## 3 · Klassifikation der 52 `SUBPHASE_VISIBILITY`-Keys — MP-1a

**Legende:** `{a}` = deckt eine der 9 abgeleiteten Subphasen (grobe Milestone, kein Mehrwert ueber die 9)
· `{b}` = Termin-Overlay (orthogonale Termin-Achse, KEIN Phasen-Step) · `{c}` = feine Ops-Subphase,
**bleibt** (re-based auf die genannte Sub-Entity) · `{d}` = retire (redundant/vage/tot).
Spalte "Soll-Quelle" = woher der State nach dem Re-Base (MP-2) kommt. "K?" = Kunde sieht es heute.

### Bucket 1 — Ersterfassung & Termin
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `fallakte_wird_angelegt` | **a** → erfassung/`sa_offen` | Lead angelegt | ✓ |
| `fallakte_angelegt` | **a** → erfassung/`sa_offen` | Lead (dedup mit ↑) | ✓ |
| `termin_bestaetigt` | **b** Termin: bestaetigt | `gutachter_termine.status` | ✓ |
| `sv_abgelehnt_ersatz_gesucht` | **b** Termin/Dispatch: SV-Ausfall→Re-Match | `gutachter_termine` + Dispatch (MP-8) | – |
| `sv_gegenvorschlag_wartet` | **b** Termin: Verlegung/Gegenvorschlag | `gutachter_termine.status=verlegung_*` (AAR-864) | ✓ |

### Bucket 2 — Begutachtung
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `sv_unterwegs` | **b** Termin: unterwegs | `gutachter_termine.sv_unterwegs_seit` | ✓ |
| `sv_vor_ort` | **b** Termin: vor Ort | `gutachter_termine.sv_angekommen_am` | ✓ |
| `begutachtung_abgeschlossen` | **a** → begutachtung/`gutachten` | `auftrag` (besichtigung→gutachten, Trigger `termin.durchgefuehrt_am`) | ✓ |

### Bucket 3 — Gutachten & QC  (alle innerhalb begutachtung/`gutachten`, auftrag.status='gutachten')
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `gutachten_wird_erstellt` | **a** → begutachtung/`gutachten` | `auftrag.status='gutachten'` | ✓ |
| `gutachten_erstellt` | **c** Ops: Upload erfolgt | `auftrag` (gutachten_eingegangen) | ✓ |
| `filmcheck_laeuft` | **c** Ops: KB-QC laeuft | `auftrag` QC (`auftrag/qc.ts`, filmcheck) | ✓ |
| `qc_bestanden` | **c** Ops: QC ok → Handoff | `auftrag.status→abgeschlossen` + Kanzlei-Handoff | ✓ |
| `qc_nicht_bestanden` | **c** Ops: QC-Fail | `auftrag` QC-Fail | – |

### Bucket 4 — Kanzlei-Uebergabe  (Eintritt regulierung/`versicherungskontakt`)
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `fallakte_wird_uebergeben` | **a** → regulierung/`versicherungskontakt` | Kanzleifall wird angelegt | ✓ |
| `kanzlei_fallakte_wird_angelegt` | **a** → regulierung/`versicherungskontakt` | Kanzleifall (dedup) | ✓ |
| `kanzlei_fallakte_angelegt` | **a** → regulierung/`versicherungskontakt` | Kanzleifall (dedup) | ✓ |
| `anschlussschreiben_in_vorbereitung` | **c** Ops | `kanzlei_faelle` (mandatsnummer gesetzt, AS noch null) | ✓ |

### Bucket 5 — Anschlussschreiben + Eskalation  (regulierung/`versicherungskontakt`)
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `anschlussschreiben_versendet` | **c** Ops | `kanzlei_faelle.anschlussschreiben_sendedatum` | ✓ |
| `warten_auf_vs` | **c** Ops | `kanzlei_faelle` (AS raus, keine VS-Reaktion) | ✓ |
| `vs_kontakt_laeuft` | **c** Ops: Eskalation T14/21/28 | `kanzlei_faelle.eskalation_tag_*` | – |
| `vs_kontakt_ergebnis_eingetragen` | **c** Ops | `kanzlei_faelle.eskalation_tag_*_ergebnis` | ✓ |

### Bucket 6 — VS-Reaktion & Verhandlung  (regulierung)
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `vollregulierung_angekuendigt` | **c** Ops | `kanzlei_faelle`/`vs_reaktion_typ='voll_reguliert'` | ✓ |
| `kuerzung_geprueft_wird` | **c** Ops | `vs_reaktion_typ='gekuerzt'` + `vs_kuerzungs_typ` | ✓ |
| `technische_stellungnahme_angefordert` | **c** Ops: **Side-Quest** | `auftrag` typ=stellungnahme | – |
| `technische_stellungnahme_hochgeladen` | **c** Ops: Side-Quest | `auftrag` typ=stellungnahme | – |
| `technische_stellungnahme_versandt` | **c** Ops: Side-Quest | `auftrag` typ=stellungnahme | – |
| `ruege_1_in_vorbereitung` | **c** Ops | `kanzlei_faelle.ruege_*` | ✓ |
| `ruege_1_versandt` | **c** Ops | `kanzlei_faelle.ruege_*` | ✓ |
| `warten_auf_ruege_1_antwort` | **c** Ops | `kanzlei_faelle.ruege_*` | ✓ |
| `ruege_2_in_vorbereitung` | **c** Ops | `kanzlei_faelle.ruege_*` | ✓ |
| `ruege_2_versandt` | **c** Ops | `kanzlei_faelle.ruege_*` | ✓ |
| `warten_auf_ruege_2_antwort` | **c** Ops | `kanzlei_faelle.ruege_*` | ✓ |
| `quotierung_eingegangen` | **c** Ops | `kanzlei_faelle.vs_quote_*` | ✓ |
| `quotierung_wird_verhandelt` | **c** Ops | `kanzlei_faelle.vs_quote_*` | ✓ |

### Bucket 7 — Ablehnung & Klage  (regulierung; Klage-Felder = SP-I Kanzleifall)
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `ablehnung_kanzlei_prueft` | **c** Ops | `vs_reaktion_typ='abgelehnt'` + `vs_ablehnungsgrund` | ✓ |
| `klage_entscheidung_ausstehend` | **c** Ops | `kanzlei_faelle` (Klage, SP-I) | ✓ |
| `klage_eingereicht` | **c** Ops | `kanzlei_faelle` (Klage, SP-I) | ✓ |
| `fall_akzeptiert_storniert` | **a** → abschluss/`abgeschlossen` (terminal: storniert) | Claim terminal | ✓ |

### Bucket 8 — Nachbesichtigung  (Side-Quest auftrag typ=nachbesichtigung, parallel zu regulierung)
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `nachbesichtigung_gefordert` | **c** Ops: Side-Quest | `auftrag` typ=nachbesichtigung | ✓ |
| `nachbesichtigung_terminkoordinierung` | **b** Termin-Overlay (NB-Termin) | `gutachter_termine` (NB-auftrag) | ✓ |
| `nachbesichtigung_mit_sv_dispatch` | **c** Ops: Side-Quest (Dispatch-Lite) | `auftrag` NB + Dispatch | ✓ |
| `nachbesichtigung_ohne_sv_direkt` | **c** Ops: Side-Quest | `auftrag` NB | ✓ |
| `nachbesichtigung_sv_termin_bestaetigt` | **b** Termin-Overlay | `gutachter_termine` (NB) | ✓ |
| `nachbesichtigung_durchgefuehrt` | **c** Ops: Side-Quest | `auftrag` NB abgeschlossen | ✓ |
| `warten_auf_gegnerisches_gutachten` | **c** Ops | `kanzlei_faelle` | ✓ |
| `regulierungsphase_klaeren_mit_kanzlei` | **d** retire? (vage Catch-all, sv hidden) | — | ✓ |

### Bucket 9 — Regulierung & Zahlung  (regulierung/`auszahlung`)
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `regulierung_angekuendigt` | **c** Ops: → auszahlung | `kanzlei_faelle` (vs_reaktion → Auszahlung) | ✓ |
| `zahlung_wird_verbucht` | **a** → regulierung/`auszahlung` | `kanzlei_faelle.status='auszahlung'` | ✓ |
| `zahlung_verzoegert` | **c** Ops | `kanzlei_faelle` (auszahlung, verzoegert) | ✓ |
| `teilzahlung_eingegangen` | **c** Ops | `claim_payments`/`kanzlei_faelle` (Teilzahlung) | ✓ |
| `vollzahlung_eingegangen` | **a** → regulierung/`auszahlung` (→ abschluss) | `kanzlei_faelle` ausgezahlt | ✓ |

### Bucket 10 — Auszahlung & Abschluss
| Key | Klasse | Soll-Quelle | K? |
|---|---|---|---|
| `auszahlungen_verteilt` | **a** → abschluss/`abgeschlossen` | Kanzleifall ausgezahlt + Auftraege abgeschl. | ✓ |

### Zusammenfassung der Klassifikation
| Klasse | Anzahl | Bedeutung |
|---|---|---|
| **a** (deckt 9er-Subphase) | **11** | grobe Milestones — kollabieren in die 9 abgeleiteten |
| **b** (Termin-Overlay) | **7** | orthogonale Termin-Achse — KEIN Phasen-Step (Stepper-Termin-Card) |
| **c** (feine Ops, re-based) | **33** | bleiben erhalten, re-based auf Auftrag/Kanzleifall/Side-Quest |
| **d** (retire) | **1** | `regulierungsphase_klaeren_mit_kanzlei` (+ Dedup-Kandidaten in a) |

→ **Kein massives Eindampfen.** 33 von 52 Ops-States bleiben (Spec §3/§6-konform). Die 11 {a}-Milestones
sind redundant zur 9er-Subphase. Die 7 {b} wandern auf die Termin-Achse.

---

## 4 · `resolveSubphase`-Input-Inventur — MP-1b

`resolveSubphase(input)` nimmt bereits `lead` + `gutachter_termine` + `webhook_events` als **eigene**
Inputs (= schon Sub-Entity-sourced ✓). Der Rest kommt aus `fall: FallRow` — und genau diese
`faelle`-Felder hat CMM-44 groesstenteils schon **relokiert**. MP-2 swappt die `fall.X`-Reads gegen die
Sub-Entity-Reads:

| Heute (`fall.*` = faelle) | Treibt Subphase | Soll-Quelle (Sub-Entity) | CMM-44-Status |
|---|---|---|---|
| `abgeschlossen_am`, `google_review_gesendet`, `kanzlei_provision_status` | 9.1–9.3 | **claims** / `kanzlei_faelle` | SP-B/SP-I relokiert |
| `regulierung_betrag`, `auszahlung_kunde_*`, `auszahlung_gutachter_*` | 8.1–8.3 | **claim_payments** / `kanzlei_faelle` | SP-J |
| `ruege_counter`, `ruege_gesendet_am`, `vs_reaktion_am` | 7.3–7.6 | **kanzlei_faelle** | SP-I |
| `technische_stellungnahme_status/_*_am` | 7.1/7.2 | **auftrag** typ=stellungnahme (Side-Quest) | SP-H |
| `vs_reaktion_typ`, `vs_quote_*`, `kuerzungs_betrag`, `vs_kuerzungs_typ`, `vs_ablehnungsgrund` | 6a–6f | **kanzlei_faelle** | SP-I |
| `nachbesichtigung_status/_*` | 6e | **auftrag** typ=nachbesichtigung (Side-Quest) | SP-H |
| `kanzlei_uebergeben_am`, `mandatsnummer`, `anschlussschreiben_*`, `eskalation_tag_*`, `vs_frist_bis` | 5.1–5.5 | **kanzlei_faelle** | SP-I relokiert |
| `kb_filmcheck_bestanden` (webhook), `filmcheck_ok`, `ocr_extrahiert_am`, `gutachten_eingegangen_am` | 4.1–4.5 | **auftrag** (erstgutachten) + QC | SP-G/SP-H |
| `gutachter_termine.*` (durchgefuehrt/sv_angekommen/sv_unterwegs/status) | 3.1/3.2/2.7 | **gutachter_termine** (bereits Input ✓) | SP-D/G2 |
| `sv_termin`, `termin_erinnerung_5min_gesendet` | 2.6 | **gutachter_termine** | SP-D |
| `dokumente_reminder_whatsapp_letzte_sendung` | 2.5 | **claims**/Lead-Reminder | prüfen |
| `fin_vin`, `cardentity_abfrage_am` | 2.4 | **claims**/Fahrzeug | SP-? prüfen |
| `lead.zb1_status` | 2.3 | **lead** (bereits Input ✓) | — |
| `vollmacht_status`, `vollmacht_geprueft_am`, `sa_unterschrieben_am`, `service_typ` | 2.1/2.2 | **lead** (sa_unterschrieben, vollmacht_signiert_am) | — |

**Konsequenz:** Der MP-2-Re-Base ist primaer ein **Read-Swap** auf bereits relokierte Felder, kein
Neudenken der Logik. Risiko-Hotspot bleibt die **Treffermenge** (kein Eindampfen der Ops-States) →
Treffermengen-Test Pflicht (Plan-Risiko).

**TODO MP-2 (live verifizieren, nicht raten):** pro Feld `information_schema.columns` checken, wohin es
relokiert wurde (Memory-Snapshots sind stale; SP-B/C/G/H/I/J liefen parallel). Lesson
`information_schema-Check vor Cluster-Refactor`.

---

## 5 · Die orthogonale Termin-Achse (7 × {b})

`termin_bestaetigt`, `sv_abgelehnt_ersatz_gesucht`, `sv_gegenvorschlag_wartet`, `sv_unterwegs`,
`sv_vor_ort`, `nachbesichtigung_terminkoordinierung`, `nachbesichtigung_sv_termin_bestaetigt` sind
**kein Phasen-Step** — sie sind der Live-Status des `gutachter_termine`-Lifecycles
(reserviert → bestaetigt → [unterwegs → vor Ort → durchgefuehrt], + Verlegungs-Loop AAR-864). Im neuen
Modell bleibt der **Step** `begutachtung/termin` (bzw. der NB-Side-Quest), und der Termin-Detail liegt
als **Overlay** darueber (Stepper-Termin-Card). `resolveSubphase` liest `gutachter_termine` bereits
korrekt (`subphase-resolver.ts:181-183, 331-350`) — die Achse ist also schon getrennt verfuegbar.

---

## 6 · Entscheidungen — DE-1 / DE-2 / DE-3

> **BESTÄTIGT (Aaron, 2026-05-27):**
> - **DE-1 → volle Granularität (§3 1:1).** Die 33 feinen Ops bleiben als *abgeleitete*
>   Präsentationsschicht (D1: nie gespeichert), Backbone = die 9. 11 {a} kollabieren, 7 {b} → Termin-Achse,
>   1 {d} raus. Begründung: der promotete Live-Lifecycle IST die Granularität; Ops aus Sub-Entities ableitbar.
> - **DE-2 → 1:1 erhalten + nur Quelle wechseln.** Kunde/SV-Sichtbarkeit + Labels bleiben wie heute,
>   Treffermenge vor/nach vergleichen (MP-5-DoD); bewusste Korrektur nur falls beim Vergleich gefunden.
> - **DE-3 → systematisch + vollständig.** Übergangs-Alias als Mechanismus, MP-3+MP-4 portal-weise
>   gekoppelt, dann Alias komplett weg (MP-6) + Drift-Gate (MP-9) gegen Rückfall.
> - **DE-4 → `claim_payments` + `empfaenger`-Spalte.** Auszahlungs-Split Kunde/SV via neue
>   `empfaenger`-Dimension (kunde|sv) auf `claim_payments` (kleine Migration); ein Payment-Row pro
>   Empfänger, skaliert auf Teilzahlungen pro Partei.

### DE-1 — Subphasen-Vokabular (9 vs 52)
**Vorschlag:** §3 als Default annehmen — **9 abgeleitete Subphasen als Backbone** + **33 {c}-Ops-Subphasen
(re-based)** als Feindetail darunter; **11 {a} kollabieren**, **7 {b}** → Termin-Achse, **1 {d}** weg.
→ **Frage:** Klassifikation 1:1 übernehmen, oder einzelne Keys umklassifizieren (z. B. `qc_bestanden`
{c}→{a}, oder `regulierungsphase_klaeren_mit_kanzlei` doch behalten)?

### DE-2 — Visibility-Matrix-Rebase (**whitelabel-kritisch**)
`SUBPHASE_VISIBILITY` steuert pro Rolle, was Kunde/SV/Makler sieht (auch im **gebrandeten** Kunde-Portal).
Heute keyed auf die 52 alten Werte. Nach Re-Base: Keys = die re-based {c}-Ops-Subphasen.
→ **Frage:** Kunde-Sichtbarkeit **erhalten wie heute** (Spalte K? in §3) und nur die Quelle wechseln —
oder bei der Gelegenheit bewusst korrigieren (z. B. mehr/weniger Ops-Detail für den Kunden)? Treffermenge
vor/nach wird verglichen (Pflicht).

### DE-3 — `aktuelle_phase`-Alias entkoppeln (3 Views)
`v_faelle_mit_aktuellem_termin`, `v_claim_full`, `v_claim_listing` liefern `aktuelle_phase = c.phase`.
**Vorschlag:** zwei explizite Felder `main_phase` + `sub_phase` aus `v_claim_phase` exponieren;
`aktuelle_phase` nur als Übergangs-Alias auf `sub_phase`, bis alle Reader (§2.2) weg sind, dann löschen.
→ **Frage:** Alias-Übergang ok, oder Reader sofort alle auf `sub_phase` umstellen (härter, ein PR mehr)?

---

## 7 · Konsequenzen für MP-2..MP-5 (Vorschau, nicht Teil von MP-1)
- **MP-2:** `resolveSubphase` Read-Swap (§4) — Treffermengen-Test Pflicht. **Vorab:** `information_schema`
  pro Feld.
- **MP-3+MP-4 (gekoppelt, pro Portal):** View-Alias-Repoint + die 52-Key-Render-Logik
  (`buildPhasePipelineData`/`SUBPHASE_VISIBILITY`) auf die {a/b/c}-Struktur + EIN `ClaimPhaseStepper`
  (Kunde grob, Admin fein) umschreiben.
- **MP-5:** `SUBPHASE_VISIBILITY` auf die re-based Keys (DE-2). Gebrandetes Kunde-Portal smoken.

**DoD MP-1:** dieses Doc (§3 Mapping + §2.2 Consumer-Karte + §4 Input-Inventur) + bestätigte DE-1/2/3.
Kein Merge — reine Analyse.

---

## 8 · Subphasen-Einfluss-Karte — wodurch wird jede Subphase getrieben (MP-2-Fundament)

> Verifiziert gegen `database.types.ts` (staging). **„Owning"** = die Sub-Entity, aus der der re-based
> Resolver lesen SOLL. Die additive CMM-44-Migration hat viele Felder mehrfach (faelle = sterbend Phase 6,
> claims = SP-B-Mirror, kanzlei_faelle = SP-I) → Resolver liest die **owning** Sub-Entity. Verfeinert §4.

### 8.1 ERFASSUNG — getrieben von `leads`
- **Backbone-Subphase:** `leads.sa_unterschrieben` → `leads.vollmacht_signiert_am` → `onboarding_complete`.
- **Ops-Detail (2.x):** `leads.zb1_status`, `leads.fin` (FIN-Call), `leads.cardentity_enriched_at`,
  `claims.dokumente_reminder_whatsapp_letzte_sendung`, `gutachter_termine.termin_erinnerung_5min_gesendet`.
- **⚠ GAP:** `onboarding_complete` liegt auf **faelle** (so liest es der P0-Loader) → Phase-6-Move auf claims;
  `cardentity_abfrage_am` → leads heißt `cardentity_enriched_at` (Name-Mismatch).

### 8.2 BEGUTACHTUNG — getrieben von `auftraege` (typ=erstgutachten)  ← „was zu Aufträgen gehört"
- **Backbone-Subphase = `auftraege.status`** (termin → besichtigung → gutachten → abgeschlossen), 1:1.
- **Ops-Detail (QC), auf `auftraege` + Sub-Table `gutachten`:**
  - `auftraege.filmcheck_ok` / `filmcheck_am` / `filmcheck_notizen` → QC/Filmcheck
  - `auftraege.gutachten_url` / `gutachten_final_freigegeben` → hochgeladen / freigegeben
  - `auftraege.zurueckweisung_grund` / `zurueckgewiesen_am` → QC-Fail
  - `gutachten.ocr_status` / `pdf_uploaded_at` / `fertiggestellt_am` / `unterschrieben_am` → OCR/Erstellung
- **Termin-Overlay (orthogonal):** `gutachter_termine` (§8.5) — NICHT Teil der Auftrags-Phase.
- **⚠ GAP:** `gutachten_eingegangen_am` (4.2) → auf `auftraege.gutachten_url IS NOT NULL` /
  `gutachten.pdf_uploaded_at` mappen; `ocr_extrahiert_am` (4.3) → `gutachten.ocr_status`/`ocr_finished_at`.

### 8.3 REGULIERUNG — getrieben von `kanzlei_faelle` (+ Side-Quest-Auftraege)
- **Backbone-Subphase = `kanzlei_faelle.status`** (versicherungskontakt / auszahlung).
- **Ops-Detail (5.x/6.x/7.x), alle auf `kanzlei_faelle`** (verifiziert 7231-7287): `anschlussschreiben_*`,
  `as_*`, `eskalation_tag_14/21/28_*`, `vs_reaktion_typ`/`vs_reaktion_am`, `vs_kuerzungs_typ`,
  `kuerzungs_betrag`/`vs_kuerzung_grund`, `vs_quote_*`, `ruege_counter/_gesendet_am/_grund/_betrag/...`,
  `mandatsnummer`, `vs_frist_bis`, `klage_uebergeben_am`, `lexdrive_*`, `regulierung_*`.
- **Claim-global:** `kanzlei_uebergeben_am` liegt auf **`claims`** (2180), nicht kanzlei_faelle.
- **Side-Quests (auf `auftraege`):** Stellungnahme = `auftraege.technische_stellungnahme_status/_beauftragt_am/`
  `_hochgeladen_am/_freigabe_am` (988-992); Nachbesichtigung = `auftraege` typ=nachbesichtigung +
  `gutachter_termine.nachbesichtigung_*` (6209-6217).
- **⚠ GAP:** `vs_ablehnungsgrund` (6c) — kein Treffer auf kanzlei_faelle/claims-Row (grep Top-60) →
  **live verifizieren**, ggf. Spalte ergänzen (sonst ist VS-Ablehnung quellenlos).

### 8.4 ABSCHLUSS / Auszahlung — `kanzlei_faelle` + `claim_payments` + `claims`
- **Backbone:** kanzlei_faelle.status=auszahlung + `ausgezahlt_am` + alle auftraege abgeschlossen.
- **Zahlungs-Ops (8.x):** `claim_payments` (`forderungsbetrag`, `erhaltener_betrag`, `differenz_betrag`,
  `zahlungseingang_am`, `status`). (`regulierung_betrag` existiert nur noch in Views → claim_payments ersetzt es.)
- **Abschluss-Ops (9.x) auf `claims`:** `abgeschlossen_am`, `google_review_gesendet`, `kanzlei_provision_status`.
- **⚠ GAP (Entscheidung nötig):** Der Auszahlungs-**Split Kunde/SV** (8.2a/8.2b) hat keine saubere Quelle:
  `claim_payments` kennt keine Kunde-vs-SV-Dimension; `auszahlung_kunde_eingegangen_am` nur auf **faelle**
  (3244, sterbend), `auszahlung_gutachter_eingegangen_am` auf **claims** (2112). → claim_payments um
  `empfaenger`-Dimension erweitern. **= ENTSCHIEDEN (DE-4, Aaron): `claim_payments.empfaenger` (kunde|sv) ergänzen, ein Payment-Row pro Empfänger.**

### 8.5 TERMIN-ACHSE (orthogonal) — getrieben von `gutachter_termine`
- **Live-Status:** `status` (reserviert/bestaetigt/verlegung_pending/verschoben/storniert) +
  `sv_unterwegs_seit` → `sv_angekommen_am` → `durchgefuehrt_am`.
- **Verlegung/Gegenvorschlag (AAR-864):** `verlegung_*`, `gegenvorschlag_*`, `sv_vorgeschlagene_slots`.
- **SV-Ausfall → Re-Dispatch:** `sv_ablehnung_am`/`sv_ablehnung_grund` + `re_termin_*`.
- **Sync-Punkt:** `durchgefuehrt_am` → treibt `auftraege.status` (besichtigung→gutachten) + Dispatcher→KB.

### 8.6 Gap-Liste (= „wo noch Felder fehlen") — Eingang für MP-2
| Resolver-Input (heute faelle) | Soll-Owning | Befund | Aktion MP-2 |
|---|---|---|---|
| `onboarding_complete` | claims | nur faelle | Phase-6-Move (v_claim_phase liest es schon korrekt) |
| `gutachten_eingegangen_am` | auftraege/gutachten | Name-Mismatch | → `gutachten_url`/`pdf_uploaded_at` |
| `ocr_extrahiert_am` | gutachten | Name-Mismatch | → `gutachten.ocr_status`/`ocr_finished_am` |
| `cardentity_abfrage_am` | leads | Name-Mismatch | → `leads.cardentity_enriched_at` |
| `vs_ablehnungsgrund` | kanzlei_faelle | **kein Treffer (verify)** | Spalte ergänzen (SP-I-Nachzug) falls bestätigt |
| Auszahlung Kunde/SV-Split | claim_payments | **kein Split** | **DE-4:** empfaenger-Dim oder konsolidieren |

**Konsequenz für MP-2:** Der Re-Base ist primär ein Read-Swap auf die Owning-Sub-Entity (oft via die
P0-Loader `getAlleAuftraege`/`getKanzleiFall`, deren SELECTs erweitert werden müssen — z.B. `KanzleiFallRow`
hat heute nur status/vs_kontakt_am/ausgezahlt_am). Die 6 Gaps oben sind die einzigen Stellen, die mehr als
ein Read-Swap brauchen.

---

## 9 · Event-Dependency-Katalog — die klaren Events (= Stepper-Transitionen) + Writer + Folge

> Aaron 2026-05-27: „Die klaren Events kennen wir durch den Stepper." Jede Stepper-Transition = **ein
> Domain-Event**. Die Kette beginnt bei der **Anfrage (Lead)** + den **Pflichtdokumenten** — nicht erst
> bei der SA. Pro Event: **Trigger-Feld → Writer (Action/Route, auf welcher Entity) → bedingt/schaltet frei
> → Auflösung → Folge** (`emitEvent` → Task/Mitteilung/Nachricht via Mitteilungs-Resolver AAR-764
> `event-to-task-map.ts`). Read-Seite = Resolver-Cascade (§1/§8); hier die **Write-Seite**.
> ✅ = Writer im Code verifiziert · ⓥ = Writer noch zu verifizieren.

### 9.0 Wurzel — Anfrage + Pflichtdokumente (Quergate über erfassung/begutachtung)
- **Anfrage/Lead angelegt** → `leads` INSERT → Writer: Lead-Form / Mini-Wizard / Call-Intake ⓥ. Startet erfassung.
- **Schadenkonstellation** ([[project_mandantenfragebogen]]) bestimmt die **dynamischen Pflichtdokumente/-felder**
  (Step 1 = Konstellation → Pflichtfelder).
- **Pflichtdokumente-Gate:** Doc-Vollständigkeit (`dokumente_vollstaendig_fuer_phase` + vorhandene Uploads)
  **bedingt**, ob die Phase weiterrücken darf. **Folge:** Cron `pflichtdokumente-reminder`
  (`route.ts:33/46`) leitet die WhatsApp-Reminder-Task ab → `dokumente_reminder_whatsapp_letzte_sendung`.
- **⚠ False-Friend:** dieser Cron liest heute `aktuelle_phase` (Pflicht-Vokabular ≠ die 52 Subphasen) →
  beim MP-3-Alias-Repoint mit-prüfen, sonst bricht der Reminder.

### 9.1 ERFASSUNG (leads)
| Event | Trigger-Feld | Writer | bedingt → | Folge |
|---|---|---|---|---|
| SA unterschrieben | `leads.sa_unterschrieben` | `flow/[token]/actions.ts` (Signatur) ✅ | vollmacht_offen | Vollmacht-Anforderung (Task/WA) |
| Vollmacht signiert | `leads.vollmacht_signiert_am` | `flow/[token]` Vollmacht ✅ | onboarding_offen | Onboarding-Einladung |
| Onboarding complete | `onboarding_complete` (faelle→claims-Gap) | `kunde/onboarding/actions.ts` ⓥ | erfassung fertig → Termin möglich | — |
| (Doc-Ops) ZB1 / FIN | `leads.zb1_status` / `leads.fin` / `cardentity_enriched_at` | Upload-Flow / CarDentity-Webhook ⓥ | FIN-Call / Begutachtungs-Freigabe | Reminder |

### 9.2 TERMIN-Achse (gutachter_termine) — orthogonal, treibt Auftrag nur am Sync-Punkt
| Event | Trigger-Feld | Writer | bedingt / Auflösung | Folge (emitEvent) |
|---|---|---|---|---|
| Termin reserviert | `status='reserviert'` | Dispatch ⓥ | begutachtung/termin | — |
| Termin **bestätigt** | `status='bestaetigt'` | **SA-Unterschrift** (nicht SV) ⓥ | Auflösung „reserviert" | Termin-Bestätigung |
| SV unterwegs | `sv_unterwegs_seit` | Feldmodus/Tracking ⓥ | Overlay | „Gutachter unterwegs"-Nachricht |
| SV vor Ort | `sv_angekommen_am` | `VorOrtPanel`/Geofence ✅ | Overlay | — |
| Termin **durchgeführt** | `durchgefuehrt_am` | `VorOrtPanel`/Feldmodus ✅ | **Sync: Auftrag besichtigung→gutachten + Dispatcher→KB** | — |
| **Verlegung** (SV/Kunde/KB) | `status='verlegt'`/`'verlegung_pending'`/`'verschoben'` + `verlegung_*` | `termin-verlegung-actions.ts` ✅ | SV→pending (braucht Bestätigung); Kunde→sofort | `emitEvent('termin.verlegung_vorgeschlagen' / 'termin.verschoben_durch_kunde')` ✅ |
| SV-Ausfall → Re-Dispatch | `sv_ablehnung_am`/`re_termin_*` | Dispatch ⓥ | neuer Match | Re-Dispatch-Task |

### 9.3 BEGUTACHTUNG (auftraege + Sub-Table gutachten)
| Event | Trigger-Feld | Writer | bedingt → | Folge |
|---|---|---|---|---|
| Besichtigung gestartet | `auftraege.status='besichtigung'` | `VorOrtPanel.tsx:62` ✅ | — | — |
| Gutachten hochgeladen | `auftraege.status='gutachten'` + `gutachten_url` | `api/sv/upload-gutachten:82` ✅ | OCR/QC | KB-QC-Task |
| OCR extrahiert | `gutachten.ocr_status` | OCR-Pipeline ⓥ | QC | — |
| QC/Filmcheck bestanden | `auftraege.filmcheck_ok` + `status='abgeschlossen'` | `lib/auftrag/qc.ts:67` ✅ | **→ Kanzlei-Übergabe (qc.ts:85)** | Kanzlei-Übergabe-Event |
| QC-Fail | `auftraege.zurueckweisung_grund`/`zurueckgewiesen_am` | `qc.ts` (Reject) ✅ | SV nachbessern | SV-Nachbesserungs-Task |

### 9.4 REGULIERUNG (kanzlei_faelle) + Side-Quests
| Event | Trigger-Feld | Writer | bedingt / schaltet frei | Folge |
|---|---|---|---|---|
| An Kanzlei übergeben | `kanzlei_faelle` INSERT `status='versicherungskontakt'` | `upsert-kanzlei-fall.ts:55` / `kanzlei-wunsch/actions.ts:157` ✅ (getriggert von `qc.ts:85`) | → regulierung | Kanzlei-Mitteilung |
| AS versendet | `kanzlei_faelle.anschlussschreiben_sendedatum` | `_actions/dokumente.ts:346` ✅ | warten_auf_vs | VS-Frist-Timer |
| Eskalation T14/21/28 | `eskalation_tag_*_am` | Cron `kanzlei-sla-check` ⓥ | Eskalationsstufe | Mahnungs-Task |
| VS-Reaktion | `vs_reaktion_typ` (voll/gekürzt/abgelehnt/quotiert) + `vs_reaktion_am` | VS-Regulierungs-Flow (`VsKorrespondenzCard`) ⓥ | 6a–6f | je nach Typ |
| **Stellungnahme beauftragt** (freischaltet!) | `auftraege.technische_stellungnahme_status='beauftragt'` | `_actions/prozess.ts:85` (KB) ✅ | **schaltet SV-Upload-Page frei** (`gutachter/.../stellungnahme/page.tsx` gated) + `side-quest.ts` legt Auftrag an | SV-Aufforderung |
| Stellungnahme hochgeladen | `…status='hochgeladen'` | `gutachter/.../stellungnahme/actions.ts` ✅ | → KB-Review | KB-Mitteilung via Event ✅ |
| Stellungnahme freigegeben | `…status='freigegeben'` | `_actions/prozess.ts:129` (KB) ✅ | → an Kanzlei | — |
| Rüge 1/2 | `kanzlei_faelle.ruege_counter` + `ruege_gesendet_am` | `_actions/prozess.ts:181` → `upsertKanzleiFall` ✅ | 7.3–7.6 + SLA | Rüge-Frist-Timer |
| Quotierung | `kanzlei_faelle.vs_quote_*` | VS-Flow ⓥ | 6f | Quote-Verhandlungs-Task |

### 9.5 NACHBESICHTIGUNG (Side-Quest-Auftrag, parallel zu regulierung)
| Event | Trigger-Feld | Writer | bedingt → | Folge |
|---|---|---|---|---|
| Nachbesichtigung gefordert | `vs_reaktion_typ='nachbesichtigung'` / `nachbesichtigung_angefordert_am` + Auftrag `typ=nachbesichtigung` | `side-quest.ts` ✅ | Side-Quest sichtbar | `emitEvent('nachbesichtigung_beauftragt')` ✅ |
| Kunde wählt Termin | `gutachter_termine.nachbesichtigung_status='termin-gewaehlt'` | `kunde/nachbesichtigung/actions.ts:58` ✅ | NB-Termin | Termin-Koordination |
| Nachbesichtigung durchgeführt | NB-Auftrag `status='abgeschlossen'` | Feldmodus ⓥ | zurück zu regulierung | — |

### 9.6 ABSCHLUSS (kanzlei_faelle + claim_payments + claims)
| Event | Trigger-Feld | Writer | bedingt → | Folge |
|---|---|---|---|---|
| VS zahlt aus | `kanzlei_faelle.status='auszahlung'` + `ausgezahlt_am` | `kanzlei-fall/actions.ts:92` ✅ | → auszahlung | Auszahlungs-Task |
| Zahlung verbucht (Teil/Voll) | `claim_payments` (`erhaltener_betrag`/`zahlungseingang_am`/`status`) + **DE-4 `empfaenger`** | KB-Zahlungs-Action ⓥ | 8.x | Auszahlungs-Mitteilung |
| Abgeschlossen | `claims.abgeschlossen_am` (+ alle Auftraege abgeschlossen) | Abschluss-Action ⓥ | abschluss (terminal) | Google-Review-Task |

### 9.7 Writer-Lücken — „wo fehlt der Eintragende auf der Owning-Entity" (MP-2-Risiko)
Jedes Trigger-Feld braucht einen Writer, der die **Owning-Sub-Entity** setzt (nicht die sterbende `faelle`):
1. **ⓥ-Zeilen oben** live verifizieren (VS-Reaktion-Flow, Quote, Dispatch-Termin-Writer, claim_payments,
   Abschluss-Action, Onboarding, OCR-Pipeline).
2. **Doppel-Writer-Check:** schreibt ein Writer noch die `faelle`-Kopie statt/zusätzlich zur Owning-Entity?
   (z.B. `vs_reaktion_typ`, `ruege_counter`, `anschlussschreiben_sendedatum` existieren auf faelle UND
   kanzlei_faelle — der Writer MUSS kanzlei_faelle treffen, sonst rückt die abgeleitete Phase nie.)
   → Grep-Sweep `from('faelle').update({…<phase-feld>…})` ist Pflicht-Schritt vor MP-2-Code.
3. **claim_payments.empfaenger** (DE-4) existiert noch nicht → Migration + Writer-Anpassung.

**DoD-Erweiterung MP-1:** §8 (Einfluss/Reader) + §9 (Events/Writer/Folge) = die vollständige
**Wert → Writer → Phase → Folge**-Karte. MP-2 = Read-Swap (§8) **gegen** verifizierte Writer (§9.7).

---

## 10 · Architektur-Klarstellungen (Aaron 2026-05-27) — das Fundament

1. **Lead + Claim = getrennte Tabellen, EINE abgeleitete Lifecycle ab der Anfrage.** Der Lead ist die
   erfassung-Sub-Entity (`sa_offen → vollmacht_offen → onboarding_offen`, gelesen via `claims.lead_id`,
   auch post-conversion). Getrennt bleiben: Lead konvertiert evtl. **nie** (disqualifiziert/Dublette) →
   würde claims verschmutzen; andere RLS/Ownership (Lead = Dispatch-Funnel, Claim = Multi-Party);
   Konversion = echtes Event in erfassung; Merge wäre Re-Arch, out-of-scope.

2. **Trigger-Felder ≠ Payload-Properties.** Nur ~15 Lifecycle-Milestones (sa/vollmacht/onboarding/termin/
   gutachten/kanzlei-übergabe/vs-reaktion/auszahlung) treiben Phasen → §9. Fahrzeug/Gegner/Halter/Schaden
   (~150 Lead-Props) = **Payload**, triggern KEINE Phase, gehören NICHT in den Event-Katalog. Wo Payload
   lebt (Lead pre-conversion / Claim post-conversion / Duplikation) = CMM-44-Daten-Cluster + Phase-6,
   **separates Thema** vom Phasen-Modell.

3. **Komplett abgeleitet „in diesem Moment" (D1).** Keine gespeicherte Phase. Zur Read-Zeit:
   - **Detail** (1 Akte): `getClaimLifecycleForClaim` lädt Lead+Auftrag+Kanzleifall+Termin+Payments →
     Resolver-Cascade → Phase+Subphase + Next-Hint / fehlende Pflichtdokumente / offene Tasks.
   - **Listen** (N Akten): SQL-Spiegel `v_claim_phase` (kein N+1). Parität Loader↔View = MP-9-CI-Gate.
   - → Der Loader MUSS **alle** Trigger-Felder der Owning-Entities laden (= SELECT-Erweiterungen §8),
     sonst ist die Ableitung „in diesem Moment" unvollständig.

4. **Bidirektional — Felder ⇄ Phase (die Kern-Einsicht).** Fast jedes Feld hat einen eigenen Zustand;
   die Beziehung läuft in BEIDE Richtungen:
   - **bottom-up (Ableitung):** die Trigger-Feld-Zustände → *ergeben* die Phase (§8/§9, Resolver).
   - **top-down (Gating):** die Phase *bedingt*, **OB** ein Feld gerade gebraucht/Pflicht ist und **WANN**
     es als abgeschlossen gilt. = die existierende Pflicht-Schicht: `dokumente_vollstaendig_fuer_phase`
     (Pflichtdokumente pro Phase, je Schadenkonstellation), `section-visibility.ts` (welche
     Felder/Sektionen pro Phase sichtbar), `jetzt-zu-tun` (was der Kunde jetzt tun muss).
   - **Kein Zirkel:** die **Backbone-Trigger** (Lead/Auftrag/Kanzlei-Status) bestimmen die Phase; die Phase
     gated dann die **Pflicht-/Payload-Felder** (Relevanz + Abschluss-Kriterium). Geschichtet, nicht zirkulär.

**Fundament-Satz:** Triggers → Phase (abgeleitet, in diesem Moment) → Phase gated Pflicht-/Payload-Felder
(Relevanz + Done) → Transitionen emittieren Events → Tasks/Mitteilungen/Nachrichten. Lead + Claim getrennt
gespeichert, aber eine durchgehende abgeleitete Lifecycle ab der Anfrage.

---

## 11 · Business-Logic-Entscheidungen (Aaron 2026-05-27) — gilt vor Code

> Ab hier business-logic-first. Bei Unklarheit / Feld-ohne-Dependenz: fragen, nicht raten.

### Backbone
- **B-1 · 4 Hauptphasen, KEINE Klage-Phase.** `erfassung → begutachtung → regulierung → abschluss`.
  Klage/Rechtsstreit **managen wir nicht** → terminaler **abschluss-Substate**, kein 5. Schritt.
- **B-2 · begutachtung-Start = Auftrag-Anlage** (erstgutachten existiert, `status=termin`) — nicht erst ab
  Termin durchgeführt.
- **B-3 · regulierung** enthält die VS-Verhandlung inkl. **erster Ablehnung** (Kanzlei rügt/verhandelt → bleibt regulierung).

### Ablehnung & Abschluss
- **B-4 · finale Ablehnung → immer terminaler abschluss-Status.** Nach gescheiterter Verhandlung
  entscheidet der **Endkunde**: Ablehnung akzeptieren **oder** klagen — **beide** terminal (Klage von uns
  nicht weiterverfolgt).
- **B-5 · abschluss = EIN terminaler Backbone-Punkt + Substate/Grund:** `erfolgreich_reguliert` ·
  `storniert` (Ablehnung akzeptiert / disqualifiziert / Abbruch) · `klage_rechtsstreit` (an Klage übergeben).
- **B-6 · Abschluss-Signal = explizit von KB/Kanzlei gesetzt** (perspektivisch ggf. Kunde) — **nicht** von
  uns aus `claim_payments` auto-berechnet. Zahlungsbeträge (`claim_payments` + empfaenger DE-4)
  **informieren**, KB/Kanzlei **bestätigt**. Phase bleibt abgeleitet aus dem (human-gesetzten) Owning-Feld;
  Writer = KB/Kanzlei-Action. Grund: Regulierungs-Abwicklung ist nicht Claimondos Kerngebiet.

### Konsequenz fürs Mapping (§3)
- Alte System-B-„Phase 7 Ablehnung & Klage" **kollabiert**: VS-Verhandlung → regulierung-Ops;
  `klage_eingereicht` / `fall_akzeptiert_storniert` → **abschluss-Substates** (B-5).
