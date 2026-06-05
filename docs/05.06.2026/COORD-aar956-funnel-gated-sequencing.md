# AAR-956 Funnel — Gated-Tasks: Sequenzierung & Cross-Session-Koordination

**Datum:** 2026-06-05 · **Owner:** aar-956 (753d8096, Funnel/FlowLink) · **Zweck:** Master-Reihenfolge der 3 gated Threads nach dem Funnel-Body, damit sich die Sessions weder trampeln noch deadlocken.

Der mine-alone /flow-Funnel-Body ist durch (Tasks 1-5, Parts 1-2, i18n, Termin-non-blocking, service_typ-Config, Flag-on-Smoke). Es bleiben **3 gated Threads**, jeder kreuzt eine andere Session.

## GATE 0 — blockt ALLES
**#2474 (i18n) + #2489 (Termin non-blocking) müssen auf `staging` gemergt sein.** [Merge-Session.]
Grund: beide settlen den Funnel-Body + `FlowSlotStep`. Kein gated-Task startet vor GATE 0.

## Die 3 Threads (Hot-Files sind DISJUNKT → parallelisierbar)
| # | Thread | Owner | Gegen-Session | Hot-Files (exklusiv) |
|---|---|---|---|---|
| **T1** | Entry-Cutover | aar-956 | aar-939 (embed-B), Entity (konvertiere-Ersatz) | `anfrage-from-lp`, `/anfrage`, `issue-flowlink`, `self_service_token`, `anfrage-actions` |
| **T2** | planeTermin-Repoint | Termin-Engine (ab96fed4) + aar-956 | — | `FlowSlotStep`, `bucheTerminFlow`, `actions.ts:1250` |
| **T3** | convertLeadToClaim-Hardening | Entity (5fcd7084) + aar-956 (Lead-Contract §6) | CMM-49 | `convert-lead-to-claim` |

## Sequenz (nach GATE 0)
**T1 Entry-Cutover (aar-956), Sub-Schritte:**
- **1a** Claimondo-eigene Marketing-LPs → canonical-B: `anfrage-from-lp` ruft `issueCanonicalFlowLinkForAnfrage` statt `issueSelfServiceFlowLink`. (sofort nach GATE 0)
- **1b** `/anfrage`-Route + `issue-flowlink.ts` retire (Consumer auf canonical). (nach 1a)
- **1c** `konvertiere-anfrage-zu-fall` killen (Anfrage→Fall-Anti-Pattern). **← GATED auf T3** (Ersatz = `convertLeadToClaim`). (nach 1b + T3)
- **1d** `self_service_token`-Spalten droppen (6 Files) + Post-Drop-Smoke. (LAST, nach 1c + 0-Consumer-Verify, apply_migration)
- **embed-B (aar-939, PARALLEL):** per-SV-Config-Flag + B-Branch in `/api/anfrage-from-lp` ruft `issueCanonicalFlowLinkForAnfrage`. Disjunkte Files → parallel zu 1a-1d.

**T2 planeTermin-Repoint (Termin-Engine + aar-956):** `matchAndSlots`/`findSvsForLocation` → `planeTermin` (3-Slot/2-SV-Verteilung) in `FlowSlotStep`+`bucheTerminFlow`+`actions.ts:1250`. (nach GATE 0 + planeTermin ready; Termin-Engine pingt. PARALLEL zu T1 — disjunkte Files.)

**T3 convertLeadToClaim-Hardening (Entity + aar-956):** Entity Plan-3 Writer-Wiring populiert Entitäten in `convert-lead-to-claim`; Lead-§6-Felder (`gegner_ist_firma`/`firma_ustid`) liefere ich mit T1. (nach CMM-49, Entity-supervised. Feeds T1.1c.)

## Cross-Deps (die einzigen echten Reihenfolge-Zwänge)
1. **GATE 0 → alles.**
2. **T3 (convertLeadToClaim solide) → T1.1c (konvertiere-retire).** Sonst bricht der Anfrage→Fall-Ersatz.
3. Sonst alles parallel (Hot-Files disjunkt — verifiziert: T1=anfrage/lead-Erzeugung, T2=FlowSlotStep/booking, T3=convert-lead-to-claim).

## Trigger (wer pingt wen)
- **Merge-Session:** GATE 0 done → Ping aar-956 + aar-939 + Termin-Engine.
- **aar-956:** GATE 0 done → startet T1.1a/1b; aar-939 startet embed-B (parallel).
- **Entity:** T3-convertLeadToClaim-Hardening done → Ping aar-956 → T1.1c + 1d.
- **Termin-Engine:** planeTermin ready → Ping aar-956 → T2 zusammen.

## Koordinations-Kanäle (Stand 05.06.)
- Entity: PR #2429 (Gate A/B/C beantwortet).
- aar-939: per-SV-A/B-Relay (über Aaron).
- Termin-Engine: PR #2493 (a/b/c beantwortet).
- Master-Sequenz: dieses Dokument.
