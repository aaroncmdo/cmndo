# §A7 — `fall_status` → claims-Quelle (AAR-939-Slice des faelle-Removal-Master-Plans)

**Datum:** 31.05.2026 · **Owner:** AAR-939 · **Branch:** `kitta/aar-939-a7-lifecycle-spec`
**Erfüllt:** Master-Plan `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md` **§A7** (+ §1-Heimat „Lifecycle → `claims`", §D3 `state-machine.ts → claims.status`).
**Input:** DB-Lifecycle-Audit (PR #2124) §3 (Freeze-Vorlage) + D1-lifecycle-drift + die `embed-b-wa-inbound`-Reader-Sweep-Findung.
**Status:** Review-/Ratify-Artefakt. Der **clean Teil ist gelockt**; **EINE Aaron-Entscheidung** (Teil 3) gated den Modell-Freeze.

> **Scope-Klarstellung:** §A7 ist ein **Phase-A-Design-Slice** — er *definiert die Quelle*, ändert KEINE Views/Reader/Writer (das sind B1/C/D3, später, von der CMM-49-Strecke implementiert). Ich (939) fasse `state-machine.ts`/`v_claim_phase`/Views NICHT an. Dieser Spec = der Input, gegen den B1/C/D3 bauen.

---

## 0 · Kern-Empfehlung in einem Satz

**`fall_status` wird NICHT als claims-CASE reproduziert — es wird aufgelöst:** „aktiv-vs-terminal" (16/17 Reader) → `v_claim_phase.main_phase`; die Regulierungs-Granularität (1 Reader + die Writer-Side-Effects) → **`kanzlei_faelle`** (das die VS-Felder schon trägt); danach kann `v_claim_full.fall_status` ersatzlos entfallen. Ein optionaler Fallback-CASE (Teil 4) existiert, falls ein literaler `fall_status`-Wert gewünscht ist — **nicht** empfohlen.

---

## 1 · Grounding (live PROD, 31.05.; alles re-queryt)

- `claims.status` = **12-CHECK** (`dispatch_done, in_bearbeitung, in_kommunikation_vs, reguliert, abgelehnt, an_externe_kanzlei_uebergeben, storniert, reguliert_vollstaendig, klage_rechtsstreit, verjaehrt, abgelehnt_final, termin_durchgefuehrt`), live nur `dispatch_done`:72 / `in_bearbeitung`:3.
- `faelle.status` = Enum **`fall_status`** (19 Werte), live `sv-termin`:61 / `ersterfassung`:12 / `gutachten-eingegangen`:1.
- **`v_claim_phase` ist faelle-frei** (`claims` + `kanzlei_faelle` + `leads` + `auftraege.erstgutachten`); `main_phase='abschluss'` ⇔ `claims.status ∈ {reguliert_vollstaendig, storniert, klage_rechtsstreit, verjaehrt, abgelehnt_final, an_externe_kanzlei_uebergeben, termin_durchgefuehrt}`.
- **Nur `v_claim_full` aliast `f.status AS fall_status`** (Passthrough). Reader-Sweep: **17 Files, 0 Control-Flow, 13 Filter** (fast alle `NOT IN ('abgeschlossen','storniert')`), **4 Display**, **1 granular** (`vs-korrespondenz-review`).
- **Re-Home-Heimaten existieren bereits** (live geprüft):
  - `kanzlei_faelle` trägt `status` (live `versicherungskontakt`:12), `vs_reaktion_typ`, `vs_kuerzung_grund`, `vs_kuerzungs_typ`, `kuerzungs_betrag`, `vs_eskalationsstufe`, `vs_frist_bis`, `vs_kontakt_am`, `anschlussschreiben_am`. → **die natürliche VS-/Regulierungs-Heimat.**
  - `claims` trägt `vs_ablehnungs_grund`, `regulierungs_betrag`. `claim_payments` (CMM-44 SP-J) = Zahlungseingang. `gutachten` existiert (QC-Heimat).
  - **`nachbesichtigungen`-Tabelle existiert NICHT** → `nachbesichtigung-laeuft` ist der einzige State ohne fertige Heimat.

---

## 2 · Teil 1 — Reader-Dissolution-Map (was B1/Phase-C tun)

| Reader-Klasse (Sweep) | heute | → claims-native Quelle |
|---|---|---|
| **13 Filter** (mitarbeiter/performance, mitarbeiter/page, isochrone, faelle, admin/team[/id]/leaderboard/statistiken, 5 Crons: vs-timer, vollmacht-/sa-/pflichtdokumente-reminder) | `fall_status NOT IN ('abgeschlossen','storniert')` | **`v_claim_phase.main_phase <> 'abschluss'`** |
| **4 Display** (mitarbeiter/page:200, faelle:49, faelle/[id]/ai-actions, admin/statistiken) | roher Enum-String in UI/JSON | **`v_claim_phase.sub_phase`-Label** (KUNDE_SUBSTATE_LABEL / lifecycle.ts) |
| **1 granular** (`api/cron/vs-korrespondenz-review`) | `IN ('regulierung-laeuft','anschlussschreiben','vs-kuerzt','nachbesichtigung-laeuft')` | **`kanzlei_faelle` direkt** (`status='versicherungskontakt'` + `vs_reaktion_typ` + `anschlussschreiben_am`) + nachbesichtigung-Signal (Teil 3) |

**Konkreter Nebeneffekt = Bugfix:** Heute zählen die 13 Filter geschlossene **embed-B-Claims** (`claims.status='termin_durchgefuehrt'`, aber `faelle.status='sv-termin'`) fälschlich als „aktiv". `main_phase='abschluss'` (das `termin_durchgefuehrt` enthält) **fixt** das im selben Schritt — die gewollte „Stale-Korrektur" aus der CMM-49-Lane-Split.

---

## 3 · Teil 2 — Per-19-Enum Re-Homing-Tabelle (Quelle nach faelle-Tod)

| `fall_status` (19) | claims-native Quelle | Heimat |
|---|---|---|
| ersterfassung, onboarding, sv-gesucht, sv-zugewiesen | `v_claim_phase.main_phase='erfassung'` (lead/SA-abgeleitet) | ✅ derived |
| sv-termin, besichtigung, begutachtung-laeuft | `main_phase='begutachtung'` (gutachter_termine/auftraege) | ✅ derived |
| gutachten-eingegangen | `auftraege.status='gutachten'`/erstgutachten-Eingang | ✅ Sub-Entity |
| **filmcheck, qc-pruefung** | QC-Gate → `gutachten.status` / `auftraege.status` | ⚠️ Sub-Entity-Status muss QC tragen (gutachten existiert) |
| kanzlei-uebergeben | `kanzlei_faelle.claim_id IS NOT NULL` (`v_claim_phase`-sub `kanzlei_uebergabe`) | ✅ derived |
| **anschlussschreiben** | `kanzlei_faelle.anschlussschreiben_am` (liegt schon dort, SP-I2) | ✅ re-homed |
| regulierung, regulierung-laeuft | `kanzlei_faelle.status='versicherungskontakt'` / `claims.status='in_kommunikation_vs'` | ✅ |
| **vs-kuerzt** | `kanzlei_faelle.vs_reaktion_typ='gekuerzt'` + `vs_kuerzung_grund` (+ **live SLA** `kanzlei_kuerzung_antwort`) | ✅ re-homed (Felder schon da) |
| **vs-abgelehnt** | `claims.status='abgelehnt'` / `claims.vs_ablehnungs_grund` | ✅ |
| **nachbesichtigung-laeuft** | faelle.nachbesichtigung_status (**stirbt**) → `auftraege.typ='nachbesichtigung'` ODER `claims`-Flag | 🔴 **ENTSCHEIDUNG** (keine fertige Heimat) |
| zahlung-eingegangen | `claim_payments.status='erhalten'` (SP-J) | ✅ |
| abgeschlossen (terminal) | `claims.status` Terminal-Set (`main_phase='abschluss'`) | ✅ |
| storniert (terminal) | `claims.status='storniert'` | ✅ |

**Befund:** 18 von 19 Werten haben eine claims-seitige Heimat (großteils schon vorhanden). **Einziger echter Gap: `nachbesichtigung-laeuft`.**

---

## 4 · Teil 3 — HARD-GATE: die 5 Operativ-Zustände (AARON-ENTSCHEIDUNG = Modell-Freeze)

Das Audit (§3.1) markiert `vs-kuerzt`, `nachbesichtigung-laeuft`, `filmcheck`, `qc-pruefung`, `anschlussschreiben` als info-verlust-kritisch — `vs-kuerzt` treibt eine **live Kürzungs-SLA**. **Der Drop darf nicht passieren, bevor diese re-beheimatet (oder bewusst abgenommen) sind.**

**Entscheidung A (EMPFOHLEN) — keep + re-home:** Die Granularität bleibt, verteilt auf die existierenden Sub-Entity-Heimaten:
- `vs-kuerzt`, `vs-abgelehnt`, `anschlussschreiben`, `regulierung-laeuft` → **`kanzlei_faelle`** (Felder + SLA liegen dort bereits — **billiger als gedacht**).
- `filmcheck`, `qc-pruefung` → **`gutachten.status`/`auftraege.status`** (QC-Gate).
- `nachbesichtigung-laeuft` → **`auftraege.typ='nachbesichtigung'`** (einzige Neu-Verdrahtung) **oder** `claims.nachbesichtigung_laeuft`-Flag.

**Entscheidung B — bewusster Verlust:** Einzelne Operativ-Zustände (z.B. `filmcheck`/`qc-pruefung` rein intern) als „nicht mehr granular abgebildet" abnehmen. **Nicht für `vs-kuerzt`** (SLA-Bruch) und nicht für `vs-korrespondenz-review`s 4 States (Cron-Stillbreaker).

**Pflicht-Caveats für die Umsetzung (§D3), egal welche Entscheidung:**
1. **Side-Effects erhalten:** `vs_kuerzung_grund`, `vs_reaktion_typ`, `anschlussschreiben_am`, die Kürzungs-SLA (`state-machine.ts:322`) + Billing/Notification-Hooks müssen an der neuen Heimat hängen.
2. **Webhook-Writer mit abdecken:** `vs-kuerzt`/`vs-abgelehnt` werden auch von LexDrive/VS-Webhooks direkt geschrieben (nicht nur `state-machine.ts`) — beide Writer-Welten re-homen.
3. **`enumsortorder` (fraktional: 1.5/1.75/8.625…)** = implizite monotone Phasen-Reihenfolge. Vor Drop `grep "ORDER BY status"` auf faelle-Reader → in eine `sub_phase`-Sortmap portieren.

---

## 5 · Teil 4 — Optionaler Fallback-CASE (NICHT empfohlen)

Falls `v_claim_full` einen literalen `fall_status`-kompatiblen Wert behalten soll (statt Reader zu repointen), wäre die claims-native Quelle:

```sql
-- Ersetzt "f.status AS fall_status" in v_claim_full — claims-nativ.
-- NICHT empfohlen: bindet die sterbende Enum-Sprache fort. Bevorzugt: Reader auf
-- main_phase/kanzlei_faelle repointen (Teil 1) + fall_status-Output ersatzlos droppen.
CASE
  WHEN c.status = 'storniert'                                            THEN 'storniert'
  WHEN cphase.main_phase = 'abschluss'                                   THEN 'abgeschlossen'
  WHEN kf.vs_reaktion_typ = 'gekuerzt'                                   THEN 'vs-kuerzt'
  WHEN c.status = 'abgelehnt' OR kf.vs_reaktion_typ = 'abgelehnt'        THEN 'vs-abgelehnt'
  WHEN kf.anschlussschreiben_am IS NOT NULL                             THEN 'anschlussschreiben'
  WHEN kf.status = 'versicherungskontakt'                                THEN 'regulierung-laeuft'
  WHEN kf.claim_id IS NOT NULL                                          THEN 'kanzlei-uebergeben'
  WHEN cphase.main_phase = 'begutachtung'                               THEN 'sv-termin'   -- grob aktiv
  ELSE 'ersterfassung'
END
```

(`nachbesichtigung-laeuft`/`filmcheck`/`qc-pruefung` fehlen hier bewusst — sie sind genau die Teil-3-Entscheidung.)

---

## 6 · Teil 5 — Konsequenzen für die CMM-49-Phasen

- **§B1 `v_claim_full`:** `fall_status`-Output bleibt bis Reader umgestellt; dann **ersatzlos droppen** (Teil 1) — kein CASE nötig, wenn Entscheidung A die Heimaten setzt.
- **§C (Reader-Sweeps):** 13 → `main_phase`, 4 → `sub_phase`-Label, 1 (`vs-korrespondenz-review`) → `kanzlei_faelle`. Pro Portal 1 PR + Smoke.
- **§D3 `state-machine.ts`:** hört auf, `faelle.status` zu schreiben; schreibt `claims.status` (Terminals) + die Sub-Entity-Status (`kanzlei_faelle`/`gutachten`/`auftraege`/`claim_payments`). Der 19-Schritt-`FALL_STATUS_TRANSITIONS`-Graph löst sich in die Sub-Entity-State-Machines auf bzw. wird zu einer schlanken claims-Terminal-Validierung. **`checkFallAutoPhase` (nur 2 fire-and-forget-Caller) mit-retiren**, Task-Trigger auf die Sub-Entity-Writer umhängen.
- **Hard-Sync:** Andere 939-Owner schreiben claims-Lifecycle teils schon direkt (embed-B `closeNurGutachter` → `termin_durchgefuehrt`; dispatch). Diese bleiben kanonisch; `state-machine.ts` (komplett-Flow) wird in §D3 dazu konsistent gemacht. **Niemand fasst `state-machine.ts` parallel an** (single coordinated PR).

---

## 7 · Offene Entscheidung (gated den Freeze)

**An Aaron:** Entscheidung A (keep + re-home, empfohlen — Heimaten existieren großteils, `vs-kuerzt`-SLA verlangt es) **oder** B (selektiver Info-Verlust)? Und für den einzigen echten Gap `nachbesichtigung-laeuft`: `auftraege.typ='nachbesichtigung'` oder `claims`-Flag?

Sobald entschieden: diese Tabelle wird gelockt → CMM-49 baut B1/C/D3 dagegen.

Lane-Split: [[project_aar939_embed_b_claim_mechanik]] · Master-Plan: CMM-49 #2118 · Audit-Freeze-Vorlage: PR #2124 §3.
