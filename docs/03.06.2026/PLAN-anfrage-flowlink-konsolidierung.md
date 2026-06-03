# Plan — Anfrage→Lead→FlowLink Kanonik + Cleanup (eine Strecke, Parallel-Pfade WEG)

**Stand:** 2026-06-03 · **Quelle:** Aaron-Direktive „Kanonik + Cleanup" + Spec §1a.
**Ziel:** EIN Prozess — alle Wizards → `gutachter_finder_anfragen` → (Submit) `/start/[anfrageId]`
→ `issueCanonicalFlowLinkForAnfrage` (idempotent, 1 flow_links/Lead) → `/flow/[token]` (dynamisch,
fragt nur Fehlendes ab) → Signatur NUR im FlowLink. Versand WA→SMS→Email (Fallback PR #2377 gemergt).
**Eine Matching-Quelle bleibt `matchAndSlots`/`findBestSV`.**

> ⚠️ Diese Konsolidierung ist groß + kreuzt fremde Hot-Paths (Monika-Embed/gutachter-finder via
> `WizardClient`/`anfrage-actions`/`TerminField`) + enthält einen DB-Spalten-Drop. **Eigener Branch,
> sequenziert, mit den aar-939/embed-Sessions koordiniert — nicht blind, nicht in den Resolver-Branch.**

---

## Kanonischer Ziel-Pfad (existiert schon — Basis)
- `app/start/[anfrageId]/route.ts` (HMAC, anon) → `lib/start-link/issue-canonical-flowlink.ts`
  `issueCanonicalFlowLinkForAnfrage(anfrageId)` (Z.117): gfa → createLead → **EIN** flow_links → Versand.

## Consumer-Map (grep 03.06., VOR jedem Delete)

| Parallel-Pfad (WEG) | Consumer(s) → Aktion |
|---|---|
| `lib/self-service/issue-flowlink.ts` (`issueSelfServiceFlowLink`, self_service_token, baut `/anfrage/${token}`) | **1:** `app/api/anfrage-from-lp/route.ts:16` → auf `/start`-Mechanik (issueCanonicalFlowLink) umlenken, dann Datei löschen |
| `lib/actions/konvertiere-anfrage-zu-fall.ts` (eigener flow_links-Insert Z.413) | **1:** `components/onboarding/finalizeAnfrage.ts:19` → auf issueCanonicalFlowLink umlenken, dann Datei löschen (Comment-Refs in notify-new-lead/track-conversion mitziehen) |
| `app/anfrage/[token]/*` (page + `BeauftragungWizardStart` + actions) | Einstieg = Magic-Link aus `issue-flowlink.ts:146` (`/anfrage/${token}`). Nach issue-flowlink-Cutover tot → Route löschen + `middleware.ts:178`-Whitelist + `lade-beauftragung-phasen.ts` prüfen |
| `lib/self-service/anfrage-actions.ts` (`ladeMatching`/`bucheTermin`/`speichereQuali`/`unterschreibeUndErstelleFall`) | **3:** `app/anfrage/[token]/actions.ts`, `components/onboarding/WizardClient.tsx:9`, `components/onboarding/fields/TerminField.tsx:15` → **⚠️ WizardClient/TerminField = Monika-Embed/gutachter-finder-Hotpath (andere Sessions)**. Auf die kanonischen /flow-Actions (self-service-actions.ts) + `resolveFlowTerminState` heben (Task 6), NICHT einfach löschen |

## self_service_token-Spalten-Drop (DDL, zuletzt)
6 Files referenzieren `self_service_token`: `issue-flowlink.ts`, `anfrage-actions.ts`, `WizardClient.tsx`,
`start/[anfrageId]/route.ts`, `issue-canonical-flowlink.ts`, `flow/[token]/self-service-actions.ts` (Comment).
**Erst alle 6 migrieren, DANN** Spalten droppen — via `apply_migration` (Regel 2), **Drop-Verifikation
nicht per Trunc-Grep** (Memory), **danach volle Portal-Smoke** (Public+Kunde+SV+Dispatch, Memory).

## Dispatcher-Frage (Aaron): `dispatch/leads/[id]/_actions/flowlink.ts`
**Befund:** macht einen **eigenen** `flow_links.insert` (Z.37) — also ein DRITTER Issuing-Mechanismus,
**lead-gekeyt** (nicht anfrage-gekeyt wie der Canonical).
**Empfehlung: Einstieg SEPARAT lassen (Default ja)** — Dispatcher-kuratierte Leads ≠ anon Marketing-Submit,
das ist ein legitimer Portal-Trigger. **ABER:** den **Issuing-Kern teilen** — `issueCanonicalFlowLink…`
um einen lead-gekeyten idempotenten Core ergänzen (`ensureCanonicalFlowLinkForLead(leadId)`), den BEIDE
nutzen (Anfrage-Submit + Dispatcher-Versand) → kein eigener Insert mehr im Dispatcher, „1 flow_links/Lead"
gilt global. So bleibt der Trigger getrennt, aber es gibt nur EINEN flow_links-Schreibweg.

## Sequenz (sicher, je Schritt build+smoke)
1. **Issuing-Kern vereinheitlichen:** lead-gekeyten idempotenten Core extrahieren; Canonical + (später) Dispatcher darauf.
2. **Entry-Cutover (klein, wenig Kollision):** `anfrage-from-lp` + `finalizeAnfrage` → issueCanonicalFlowLink; alte Aufrufe raus.
3. **issue-flowlink.ts + konvertiere-anfrage-zu-fall.ts löschen** (0 Consumer nach 2).
4. **/anfrage-Route + BeauftragungWizardStart löschen** (tot nach 3), middleware-Whitelist + lade-beauftragung-phasen aufräumen.
5. **anfrage-actions-Consumer (WizardClient/TerminField) auf /flow-Actions heben** = Task 6, **mit Embed/Monika-Sessions koordiniert**.
6. **self_service_token-Spalten droppen** (apply_migration) + Drop-Verify (ungekappt `.from`) + volle Portal-Smoke.

## Verhältnis zum Resolver-Branch
`kitta/aar-956-flow-resolver` (PR #2374) = die **dynamische /flow-Seite** (Tasks 1-6: nur Fehlendes abfragen).
Diese **Konsolidierung** = die **Funnel-/Cleanup-Seite** (Punkte 1-2 + WEG). Eigener Branch, eigener PR;
Task 6 (Schritt 5) ist die Naht zwischen beiden und MUSS mit den aar-939/embed-Sessions abgestimmt werden.
