# TICKET — Lead→Claim Erfassungs-Felder-Sync (CMM-44 Phase-3-Slice)

**Status:** OFFEN — **nächster Schritt NACH MP-8b** (claims-zentrischer Phasen-Read-Path).
**Eltern:** CMM-44 (Claim-as-SSoT) · Phase 3 (Writer-Migration) · verwandt MP-8b.
**Erstellt:** 2026-05-29.

## Kontext

MP-8b baut `v_claim_phase` claims-zentrisch (`FROM claims c`, Key `claims.id`). Für die **Erfassungs-Subphase** (`sa_offen → vollmacht_offen → onboarding_offen`) braucht die View die Felder `sa_unterschrieben` / `vollmacht_signiert_am` / `onboarding_complete`.

**Befund 2026-05-29:** `claims` hat diese Spalten (Lead-Konversion legt sie an), aber sie sind **NICHT aus `leads` gesynct** — 5/74 Claims haben `claims.sa_unterschrieben` stale/false während `leads.sa_unterschrieben=true`. Eine View, die `claims`' eigene Kopien liest, regressiert diese 5 (`sa_offen` statt `vollmacht_offen`).

**MP-8b-Workaround:** Die View liest diese 3 Felder via `leads` über `claims.lead_id` (autoritativ) — faelle-frei, parity-sauber (74/74). `leads` wird NICHT gedroppt, also legitim. ABER: solange `claims` die Felder nicht selbst hält, hängt der Erfassungs-Teil des Phasen-Modells an einem `leads`-Join.

## Scope dieses Tickets

1. **Backfill** `claims.{sa_unterschrieben, vollmacht_signiert_am, onboarding_complete}` aus `leads` (über `claims.lead_id`) — die 5 Gap-Claims + alle künftigen.
2. **Sync sicherstellen:** Lead-Konversion (`convert-lead-to-claim`) + laufende SA/Vollmacht/Onboarding-Writer schreiben diese Felder auf `claims` (nicht nur `leads`). Ggf. Sync-Trigger leads→claims für diese 3 Felder (analog der bestehenden CMM-44-Sync-Trigger) bis die Writer claims-nativ schreiben.
3. **Dann:** `v_claim_phase` (+ `getClaimLifecycleForClaim`) von `leads`-via-`claims.lead_id` auf **`claims`' eigene Felder** umstellen → `leads`-Join im Phasen-Read-Path entfällt → ein Stück weniger faelle-/leads-Kopplung vor Phase 6.

## Akzeptanz

- `SELECT count(*) FROM claims c JOIN leads l ON l.id=c.lead_id WHERE c.sa_unterschrieben IS DISTINCT FROM l.sa_unterschrieben OR c.vollmacht_signiert_am IS DISTINCT FROM l.vollmacht_signiert_am` = 0 (Sync gap geschlossen).
- `v_claim_phase` + `getClaimLifecycleForClaim` lesen die Erfassungs-Felder aus `claims` (kein `leads`-Join mehr); Parity-Probe 0 Divergenzen.
- Build/tsc/vitest grün; Smoke Kunde-Stepper (Erfassungs-Substates korrekt).

## Abhängigkeit / Reihenfolge

**Blocked-by MP-8b** (`kitta/cmm44-mp8b-claims-centric-phase`) — erst wenn die View claims-zentrisch + `leads`-via-`claims.lead_id` live ist, ist der Umstieg auf claims-eigene Felder ein sauberer, isolierter Schritt. Danach. NICHT vorher (sonst regressieren die 5 Gap-Claims).

Referenz: MP-8b-Spec `docs/29.05.2026/cmm44-mp8b-claims-centric-phase-readpath-spec.md` §4.
