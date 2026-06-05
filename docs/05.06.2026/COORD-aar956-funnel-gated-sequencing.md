# AAR-956 Funnel — Gated-Tasks: Sequenzierung & Cross-Session-Koordination

**Datum:** 2026-06-05 · **Owner:** aar-956 (753d8096, Funnel/FlowLink) · **Zweck:** Master-Reihenfolge der 3 gated Threads nach dem Funnel-Body, damit sich die Sessions weder trampeln noch deadlocken.

Der mine-alone /flow-Funnel-Body ist durch (Tasks 1-5, Parts 1-2, i18n, Termin-non-blocking, service_typ-Config, Flag-on-Smoke). Es bleiben **3 gated Threads**, jeder kreuzt eine andere Session.

## GATE 0 — ✅ DURCH (05.06.)
**#2474 (i18n, merged 12:09) + #2489 (Termin non-blocking, merged 14:26) sind auf `staging`.**
Wirkung: **T2** frei (FlowSlotStep settled → planeTermin-Repoint möglich) + **T1** frei (Entry-Cutover). **T1e (939 embed-B) war NIE auf GATE 0 geblockt** — der Helper `issueCanonicalFlowLinkForAnfrage` ist live auf staging. Damit sind alle Threads entsperrt (es bleiben nur die Cross-Deps: T3→T1.1b + die route.ts-Edit-Reihenfolge 939-zuerst + planeTermin-ready für T2).

## Die 3 Threads (Hot-Files sind DISJUNKT → parallelisierbar)
| # | Thread | Owner | Gegen-Session | Hot-Files (exklusiv) |
|---|---|---|---|---|
| **T1** | Entry-Cutover | aar-956 | Entity (konvertiere-Ersatz) | `/anfrage`-Route, `konvertiere-anfrage-zu-fall`, `self_service_token`-Spalten |
| **T1e** | Embed-B-Wiring | aar-939 | aar-956 (liefert Helper) | `/api/anfrage-from-lp`, `lib/embed/*`, Embed-Config, Widget |
| **T2** | planeTermin-Repoint | Termin-Engine (ab96fed4) + aar-956 | — | `FlowSlotStep`, `bucheTerminFlow`, `actions.ts:1250` |
| **T3** | convertLeadToClaim-Hardening | Entity (5fcd7084) + aar-956 (Lead-Contract §6) | CMM-49 | `convert-lead-to-claim` |

**Verifiziert + korrigiert (05.06., 939-Reply):** `/api/anfrage-from-lp/route.ts` ist **SHARED**, aber distinkte Regionen:
- **T1e (939):** `after()`-`notifyAnfrage` + neuer **sv_embed-A/B-Zweig** (B: `issueCanonicalFlowLinkForAnfrage` **inline awaiten** vor `return` → token/kanal in die Response; A: notify in `after()`; degraded ok:false/kanal:'none' → „wir melden uns" + gfa/Lead-Queue als Safety-Net). KEINE SV-WhatsApp in B (SV via Lead-Prenote `konvertiert_zu_lead_id`→/flow + Dispatcher-Queue).
- **T1 (ich):** gated **Cluster-LP-Legacy-Call** (Z.156-162, in `after()`: `SELF_SERVICE_AUTO_ISSUE && source='kfz_gutachter_lp'` → `issueSelfServiceFlowLink`, dormant/env-OFF) → swap auf `issueCanonicalFlowLinkForAnfrage`.
- **Edit-Fenster: 939 ZUERST** (A/B-Refactor ändert Haupt-Flow + Response-Shape); ich ziehe den 1-Zeilen-Swap danach nach (rebased, dormant → kein Live-Impact). **B ist NICHT auf meine Funnel-PRs geblockt** (Helper ist live + gibt `{ ok, token, leadId, kanal, wiederverwendet }`).
- Sonst T1/T1e/T2/T3 disjunkt; einzige inhaltliche Sequenz = T3→T1.1b.
- Config-Flag = `embed_sites.funnel_modus` ('callback'|'flowlink', default 'callback', additiv) — 939-Migration.

## Sequenz (nach GATE 0)
**T1 Entry-Cutover (aar-956), Sub-Schritte:**
- **1a** `/anfrage`-Self-Service-Route retire + Consumer (`finalizeAnfrage`/`WizardClient`) auf den kanonischen Lead→/flow-Pfad. (sofort nach GATE 0)
- **1b** `konvertiere-anfrage-zu-fall` killen (Anfrage→Fall-Anti-Pattern). **← GATED auf T3** (Ersatz = `convertLeadToClaim`). (nach 1a + T3)
- **1c** `self_service_token`-Spalten droppen (6 Files) + Post-Drop-Smoke. (LAST, nach 1b + 0-Consumer-Verify, apply_migration)

**T1e Embed-B-Wiring (aar-939, PARALLEL zu T1 — disjunkte Files):** per-SV-Config-Flag + A/B-Branch in `/api/anfrage-from-lp` (B ruft `issueCanonicalFlowLinkForAnfrage` + retired dabei den `issueSelfServiceFlowLink`-Call; A = gfa + SV-WhatsApp + Portal) + Widget-Danke. Ich liefere nur den Helper.

**T2 planeTermin-Repoint (Termin-Engine + aar-956):** `matchAndSlots`/`findSvsForLocation` → `planeTermin` (3-Slot/2-SV-Verteilung) in `FlowSlotStep`+`bucheTerminFlow`+`actions.ts:1250`. (nach GATE 0 + planeTermin ready; Termin-Engine pingt. PARALLEL zu T1 — disjunkte Files.)

**T3 convertLeadToClaim-Hardening (Entity + aar-956):** Entity Plan-3 Writer-Wiring populiert Entitäten in `convert-lead-to-claim`; Lead-§6-Felder (`gegner_ist_firma`/`firma_ustid`) liefere ich mit T1. (nach CMM-49, Entity-supervised. Feeds T1.1c.)

## Cross-Deps (die einzigen echten Reihenfolge-Zwänge)
1. **GATE 0 → alles.**
2. **T3 (convertLeadToClaim solide) → T1.1b (konvertiere-retire).** Sonst bricht der Anfrage→Fall-Ersatz.
3. Sonst alles parallel (Hot-Files verifiziert disjunkt: T1=`/anfrage`+`konvertiere`+`self_service_token`, T1e=`anfrage-from-lp`/embed, T2=`FlowSlotStep`/booking, T3=`convert-lead-to-claim`).

## Trigger (wer pingt wen)
- **Merge-Session:** GATE 0 done → Ping aar-956 + aar-939 + Termin-Engine.
- **aar-956:** GATE 0 done → startet T1.1a; aar-939 startet T1e embed-B (parallel).
- **Entity:** T3-convertLeadToClaim-Hardening done → Ping aar-956 → T1.1b + 1c.
- **Termin-Engine:** planeTermin ready → Ping aar-956 → T2 zusammen.

## Koordinations-Kanäle (Stand 05.06.)
- Entity: PR #2429 (Gate A/B/C beantwortet).
- aar-939: per-SV-A/B-Relay (über Aaron).
- Termin-Engine: PR #2493 (a/b/c beantwortet).
- Master-Sequenz: dieses Dokument.
