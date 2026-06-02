# CMM-74 b″ — Variante B: Engine-Cursor aus Derivat + Validierungs-Verschlankung — Handoff-Plan

> **Für die ausführende Session.** Dieser Plan ist die **North-Star-Endstufe** von b″ und baut auf **Variante A** auf (PR-Kette `kitta/cmm-74-b2-engine-variant-a`: `claims.operative_status` als gespeicherter Cursor). Variante B **retiret** den gespeicherten `operative_status` und **deriviert** den Engine-Cursor live aus `v_claim_phase` + `claims.status` + Sub-Entity-State — damit es KEINEN gespeicherten Operativ-Status mehr gibt (God-Table-Dekomposition vollständig).
>
> **REQUIRED SUB-SKILL:** superpowers:executing-plans (oder subagent-driven-development). Checkbox-Syntax.
>
> ⚠️ **PROD-BREAKER² (`state-machine.ts` = Single-Toucher ⚠️SM, ownt von Track-1-Lane).** Größer als A: berührt Dispatch-Flows. **GATE: Track-1 + Aaron müssen das neue Validierungs-Modell (§2) + das Dispatch-Re-Home-Ziel (§3 GATE B1) freigeben, BEVOR Code entsteht.** 939-Single-Toucher-Re-Check + SendMessage (über Aaron) vor jedem `state-machine.ts`-Commit.

**Goal:** `transitionFallStatus` liest seinen Transition-Cursor live aus dem Derivat (`v_claim_phase`/`claims.status`/Sub-Entities) statt aus einer gespeicherten Spalte; das 19-Enum `FALL_STATUS_TRANSITIONS` wird durch eine schlanke phasen-/sub-entity-basierte Validierung ersetzt; `claims.operative_status` (Variante A) + `faelle.status` werden retired.

**Architecture:** Drei Bausteine: (1) **Cursor-Derivation** — `getCurrentOperativeState(claimId)` leitet den Ist-Zustand aus `v_claim_phase` (main/sub_phase, post-#2233 mit den 5 operativen sub_phase) + `claims.status` (Terminals) ab. (2) **Schlanke Validierung** — Übergänge werden gegen eine Phasen-Achse (erfassung→begutachtung→regulierung→abschluss) + Sub-Entity-Vorbedingungen geprüft statt gegen 19 Enum-Knoten. (3) **Dispatch-Re-Home** — die Feinstati `sv-gesucht`/`sv-zugewiesen`/`sv-termin` (vor jedem Auftrag, im Derivat NICHT unterscheidbar) wandern aus dem Engine-Cursor in den Dispatch-/`work_state`-Layer.

**Tech Stack:** Next.js 16 Server-Actions, Supabase admin-client, TS, vitest.

**Vorgelesen (PFLICHT zuerst):** `src/lib/faelle/state-machine.ts` (Z.18-47 Graph, 49-455 Engine), `src/lib/claims/lifecycle.ts` (`getClaimLifecycle` + `ClaimSubPhase`), `docs/01.06.2026/T1.2-b-cutover-decision.md` (§„Engine-Cursor-Re-Base-Design"), `docs/superpowers/plans/2026-06-02-cmm74-b2-engine-cursor-rebase.md` (Variante A), CMM-74. Live: `v_claim_phase`-Definition (Migration `20260602083708`).

---

## §0 — Pre-Flight

- [ ] **Variante A ist gemergt + live** (`claims.operative_status` Cursor, Reader-Tail repointet, `faelle.status`-Write gestoppt). B baut darauf auf.
- [ ] **939-Single-Toucher-Re-Check** = 0 (Skript in Variante-A-Plan §0). Aaron brokert SendMessage an 939-Lane.
- [ ] **GATE A (§2): Validierungs-Modell** von Track-1 + Aaron freigegeben.
- [ ] **GATE B1 (§3): Dispatch-Feinstatus-Home** von Track-1 + Aaron freigegeben.

---

## §1 — Das Lossy-Problem (warum B nicht-trivial ist) — MUSS verstanden sein

Die Engine hat **13 aktive `faelle.status`-Werte, die `claims.status=null` mappen** (Decision-Doc): `ersterfassung`/`onboarding`/`sv-gesucht`/`sv-zugewiesen`/`sv-termin`/`besichtigung`/`begutachtung-laeuft`/`gutachten-eingegangen`/`filmcheck`/`qc-pruefung`/`kanzlei-uebergeben`/`anschlussschreiben`/`vs-kuerzt`/`nachbesichtigung-laeuft`. Davon sind nach #2233 im `v_claim_phase`-sub_phase **derivierbar**: besichtigung, gutachten(→termin/besichtigung/gutachten), filmcheck, qc-pruefung, kanzlei_uebergabe, anschlussschreiben, vs-kuerzt, nachbesichtigung-laeuft.

**NICHT derivierbar aus dem Derivat** (= der harte Kern von B): `sv-gesucht`/`sv-zugewiesen`/`sv-termin`/`begutachtung-laeuft`/`gutachten-eingegangen` — die existieren **vor/während Auftrag-Anlage**; `v_claim_phase` zeigt dort `erfassung/*` bzw. den rohen `auftraege.erstgutachten.status`. Diese Feinstati müssen entweder (a) aus Sub-Entity-State abgeleitet werden (Auftrag-Existenz/-Status, `sv_leads`, `lead.zugewiesen_an`) oder (b) als Engine-Cursor-Knoten **aufgegeben** werden (Dispatch-Layer-Concern). → **GATE B1 (§3).**

---

## §2 — GATE A: Schlankes Validierungs-Modell (Track-1 + Aaron)

Statt `FALL_STATUS_TRANSITIONS[currentStatus].includes(newStatus)` (19-Enum) prüft die Engine Übergänge gegen:
1. **Phasen-Monotonie:** `getMainPhaseIndex(newPhase) >= getMainPhaseIndex(currentPhase) - tolerance` (Rückwärts nur für definierte Reopen-Pfade: storno aus jeder Phase, sv-Ablehnung begutachtung→erfassung).
2. **Terminal-Achse:** `claims.status`-Terminals (reguliert_vollstaendig/storniert/klage/verjaehrt/abgelehnt_final/an_externe_kanzlei/termin_durchgefuehrt) sind End-Knoten — kein Übergang heraus außer durch explizite Reopen-Action.
3. **Sub-Entity-Vorbedingungen:** z.B. `→ kanzlei-uebergeben` erfordert `gutachten_final_freigegeben`; `→ regulierung` erfordert `kanzlei_faelle.lexdrive_case_id`; `→ zahlung-eingegangen` erfordert Zahlungsnachweis. (Liste = die Sub-Entity-Bedingungen, die heute IMPLIZIT im 19-Graph stecken — beim Bau aus dem Graph extrahieren.)

**Empfohlene Form:** eine Funktion `validateTransition(current: OperativeState, next: string, ctx: SubEntityCtx): {ok:true} | {ok:false, reason}`. **Track-1 reviewt die extrahierten Sub-Entity-Vorbedingungen gegen den alten Graph (Z.18-47) — kein impliziter Guard darf verloren gehen.**

---

## §3 — GATE B1: Dispatch-Feinstatus-Re-Home (Track-1 + Aaron)

`sv-gesucht`/`sv-zugewiesen`/`sv-termin` sind heute Engine-Cursor-Knoten, aber **Dispatch-Concern** (welche SV-Suche-Stufe). Optionen:
- **B1-α (empfohlen):** `claims.work_state` (existiert, T1.1a) trägt die Dispatch-Stufe (`dispatch_offen`/`sv_zugewiesen`/`termin_reserviert`). Engine-Cursor in der erfassung-Phase liest `work_state`; Dispatch-Actions setzen `work_state` direkt (nicht über `transitionFallStatus`).
- **B1-β:** `sv_leads`/`lead.zugewiesen_an` + `gutachter_termine`-Existenz leiten die Stufe ab (rein derivativ, kein Speicher).

→ **Track-1 + Aaron wählen.** Davon hängt die Cursor-Derivation (§4) für die erfassung-Phase ab.

---

## §4 — Task: `getCurrentOperativeState(claimId)` — Cursor-Derivation

**Files:** Create `src/lib/faelle/operative-state.ts`; Test `src/lib/faelle/operative-state.test.ts`.

- [ ] **Step 1: Failing-Test** — pro Phase 1 Szenario (erfassung via §3-Wahl / begutachtung via v_claim_phase sub_phase / regulierung via sub_phase / abschluss via claims.status). Beispiel begutachtung:
```typescript
it('derives filmcheck from v_claim_phase sub_phase', async () => {
  // seed claim mit erstgutachten gutachten_url gesetzt -> v_claim_phase.sub_phase='filmcheck'
  expect(await getCurrentOperativeState(claimId)).toBe('filmcheck')
})
```
- [ ] **Step 2: Implementieren** — Liest `v_claim_phase` (main/sub_phase) + `claims.status` + (§3-Quelle für Dispatch-Feinstatus). Mappt (main_phase, sub_phase, status, dispatch-stufe) → den `faelle.status`-Vokabular-Wert (das Interface bleibt — Caller kennen die Strings). Mapping-Tabelle = Umkehrung des `v_claim_phase`-CASE + die §3-Dispatch-Stufen.
- [ ] **Step 3: Parity-Probe (rollback-tx, gegen staging):** für jeden der 76 Live-Claims `getCurrentOperativeState(claim.id)` == altem `claims.operative_status` (aus Variante A). EXCEPT-0 erwartet. **Das ist das harte Gate — bei Mismatch ist die Derivation lossy/falsch.**
- [ ] **Step 4: Commit.**

> **WICHTIG:** Wenn Step 3 für die Dispatch-Feinstati (sv-gesucht etc.) Mismatches zeigt (weil nicht derivierbar), MUSS §3 (Re-Home) zuerst gebaut sein — sonst ist B blockiert. Reihenfolge: §3-Re-Home → §4-Derivation.

---

## §5 — Task: Engine auf Derivation + schlanke Validierung umstellen

**Files:** Modify `src/lib/faelle/state-machine.ts` (Z.61-81 Cursor+Validierung, Z.164-169 operative_status-Write entfernen).

- [ ] **Step 1:** `currentStatus = await getCurrentOperativeState(claimId)` (statt `claims.operative_status`-Read).
- [ ] **Step 2:** `FALL_STATUS_TRANSITIONS`-Validierung (Z.76-81) durch `validateTransition()` (§2) ersetzen.
- [ ] **Step 3:** `claimsUpdate.operative_status = newStatus` (Variante-A-Write) **entfernen** — der Cursor wird jetzt deriviert, nicht gespeichert.
- [ ] **Step 4:** Alle `newStatus`-getriggerten Side-Effects (SLA/Billing/Notifications/Auto-Task/Webhook) bleiben **unverändert** (keyen auf `newStatus`, nicht auf dem Cursor).
- [ ] **Step 5: tsc + build.**
- [ ] **Step 6:** Synthetic Engine-Smoke (Node-Probe gegen staging, wie Variante A): seed pro Phase, `transitionFallStatus` je Übergang, prüfe `validateTransition` akzeptiert/lehnt korrekt ab + Side-Effects feuern. Cleanup via `delete_fall_komplett`.
- [ ] **Step 7: Commit** (nach §0-Gates + 939-SendMessage).

---

## §6 — Task: Dispatch-Feinstatus-Actions re-homen (§3-abhängig)

**Files:** `grep -rn "transitionFallStatus(.*'sv-gesucht'\|'sv-zugewiesen'\|'sv-termin'" src/` — jede Dispatch-Action, die heute über die Engine diese Feinstati setzt.

- [ ] **Step 1:** Pro Call-Site: statt `transitionFallStatus(fall, 'sv-zugewiesen')` die §3-Quelle setzen (B1-α: `claims.work_state='sv_zugewiesen'`; B1-β: nichts — derivativ). Side-Effects, die an diesen Übergängen hingen (SLA `gutachter_zuweisung` Z.312-314), an die neue Quelle hängen.
- [ ] **Step 2: tsc + build + Dispatch-Smoke** (Lead→SV-Suche→Zuweisung→Termin im Dispatch-Portal, Screenshot).
- [ ] **Step 3: Commit.**

---

## §7 — Task: `claims.operative_status` + `faelle.status` retiren

- [ ] **Step 1:** Reader-Tail (Variante A repointete auf `operative_status`) auf `getCurrentOperativeState`/`v_claim_phase` umstellen — `case-billing-batch`, `release-makler-provisionen`, `api/email/send`, `api/gutachter/search`, `completion-signals.ts`. Pro File: lesen jetzt die Derivation.
- [ ] **Step 2:** `DROP COLUMN claims.operative_status` (Plugin-Migration, nach Reader-Repoint). `faelle.status`-Drop = Teil des faelle-Table-Drops (CMM-49 Phase G, separat).
- [ ] **Step 3: Full-Portal-Smoke** (§8).
- [ ] **Step 4: Commit + Migration-File (Twin-Drift §3+4).**

---

## §8 — Smoke-Matrix (PFLICHT vor Merge, Screenshot je Portal)

- [ ] **Validierung:** je gültiger Übergang akzeptiert, je ungültiger (z.B. erfassung→regulierung-Sprung) abgelehnt mit klarer Meldung.
- [ ] **Dispatch:** Lead→sv-gesucht→sv-zugewiesen→sv-termin über die neuen Actions; SLA `gutachter_zuweisung` feuert.
- [ ] **Begutachtung/Regulierung:** gutachten-eingegangen→filmcheck→qc→kanzlei-uebergeben→anschlussschreiben→vs-kuerzt→regulierung→zahlung→abgeschlossen; Kürzungs-SLA + LexDrive-Email + Billing feuern.
- [ ] **Parity:** `getCurrentOperativeState` == (vor dem operative_status-Drop) für alle Live-Claims.
- [ ] **Portale:** Admin/SV/Kunde/Kanzlei zeigen korrekte Phase.

---

## §9 — Coordination + Reihenfolge-Zusammenfassung

1. GATE A (§2 Validierungs-Modell) + GATE B1 (§3 Dispatch-Home) → Track-1 + Aaron.
2. §3 Dispatch-Re-Home → §4 Cursor-Derivation (Parity-Gate!) → §5 Engine-Umstellung → §6 Dispatch-Actions → §7 Retire.
3. Jeder `state-machine.ts`-Commit: 939-Re-Check + SendMessage (Aaron).
4. Geteilte prod+staging-DB: alle DB-Schritte additiv + EXCEPT-0/Parity-grün + rollback-tx-Smoke.

## Self-Review
- **Lossy-Problem (§1) adressiert:** GATE B1 (§3) + §4-Parity-Gate fangen es. ✅
- **Side-Effect-Erhalt:** §5 Step 4 (keyen auf newStatus). ✅
- **Type-Konsistenz:** `getCurrentOperativeState` liefert `faelle.status`-Vokabular-String (Interface stabil); `validateTransition`-Signatur in §2 = in §5 genutzt. ✅
- **Offene Design-Entscheidungen:** GATE A (Validierungs-Modell) + GATE B1 (Dispatch-Home) — beide explizit Track-1+Aaron, vor Code.
- **Abhängigkeit:** baut auf Variante A (gemergt). Ohne A kein `operative_status`-Parity-Anker für §4 Step 3.
