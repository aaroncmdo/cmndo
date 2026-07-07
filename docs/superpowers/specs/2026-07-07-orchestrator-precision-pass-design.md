# Orchestrator Precision Pass (Phase 2.5) — Design

**Datum:** 2026-07-07
**Status:** Approved (Aaron, Brainstorming 07.07.)
**Branch:** `kitta/orchestrator-precision-pass`
**Vorgänger:** AI-Claim-Orchestrator Phase 1 (#3687, live) + Phase 2 Auto-Graduierung (#3766, in staging, dormant)

## Problem

Der Orchestrator läuft live (Cron täglich 06:00), produziert aber Vorschläge mit **8% Annahmequote**. Prod-Daten (13 Vorschläge, 1 Lauf, 6 Fälle, alle 07.07.):

- **1 angenommen / 12 verworfen**, `offen=0` (Admin reviewt alles → Engagement da, aber 92% Ablehnung).
- **Alle 6 Eskalationen abgelehnt (0/6)** — verbose Analyse-Absätze, keine Aktion.
- Tasks: 1/7 angenommen.

Root-Causes (Code + Daten verifiziert):

1. **Zustandslosigkeit.** `buildClaimContext` (`context.ts`) liest Claims/Timeline/Tasks — **nie** die eigenen früheren Vorschläge (`ai_claim_proposals` taucht in `context.ts` nicht auf). Der `dedupe_key`-Partial-Index blockt nur *offene* Dubletten; abgelehnte kommen wieder. → Der Cron erzeugt morgen auf denselben stagnanten Fällen dieselben abgelehnten Vorschläge → Dublettenspirale → Admin-Ermüdung.
2. **Müll-Kandidaten.** Ein Seed-/Test-Fall (`bbbb4444…`) bekam 2 Vorschläge; ein Fall mit **5 offenen Tasks** (aktiv bearbeitet, nicht stagnant) 2 weitere. 3 von 6 Fällen hatten bereits offene Tasks. Die Cron-Kandidaten-Query (`claims where ist_aktiv and abgeschlossen_am is null`) filtert weder Test-Daten noch aktiv-bearbeitete Fälle.
3. **Redundanz im Lauf.** Dasselbe Problem kam als Eskalation *und* Task.
4. **Toter Feedback-Loop.** 0/12 Ablehnungen haben einen Grund (`feedback`-Spalte existiert, leer). Die Reject-UI ruft `verwerfenVorschlag(id)` ohne Grund. Selbst mit Statefulness gäbe es kein „warum".

## Ziel

Annahmequote heben durch vier Fixes rein auf der **Generierungs-Seite**. Die Annahmequote ist die Währung: erst Präzision, dann skalieren (Phase 3) oder Auto-Graduierung aktivieren (P2c ist bei 8% korrekt geblockt).

## Nicht-Ziele

- Kein Phase 3 (Filmcheck-/QC-Konsolidierung), keine Auto-Aktivierung.
- Kein Claim-View-Surfacing / interaktiver Copilot — das ist die separate `claim-ai-konsole`-Session (doc-only, wartet auf Review). Disjunkt.
- **Kein Schema-Change.** Die `feedback`-Spalte existiert; alle `ai_claim_proposals`-Reads sind additiv. → keine Migration, Regel 2 nicht berührt.

## Architektur

Der Spine (`ai_claim_proposals`) und die deterministische Reminder-Engine bleiben unangetastet. Alle Änderungen sitzen in: `src/lib/orchestrator/{context,run,tools}.ts`, `src/app/api/cron/claim-orchestrator/route.ts`, `src/app/admin/ai-vorschlaege/{AiVorschlaegeClient.tsx,actions.ts}`. Safe-by-default: jeder Fix degradiert zum aktuellen Verhalten, wenn Daten fehlen (kein Vorschlags-Verlust, kein Crash).

## Komponenten

### ① Stateful Context *(größter Hebel)*

**`types.ts`** — `ClaimContext` bekommt ein Feld:
```ts
bereitsVorgeschlagen: Array<{
  typ: string            // task | escalation | next_step
  haupttext: string      // payload.titel ?? hinweis ?? grund
  status: string         // offen | angenommen | verworfen | bearbeitet
  feedback: string | null
}>
```

**`context.ts`** — `buildClaimContext` liest zusätzlich (service_role, Basis-Tabelle):
```
ai_claim_proposals where claim_id = <id> order by erstellt_am desc limit 8
```
gemappt auf `bereitsVorgeschlagen`. Null-safe (leeres Array bei keinem Verlauf).

**`summarizeClaimForPrompt`** — rendert eine neue Sektion, **nur wenn nicht leer**:
```
Bereits vorgeschlagen (NICHT wiederholen):
- [verworfen: schon erledigt] Fahrzeugdaten vervollständigen (task)
- [angenommen] Sicherungsabtretung prüfen (task)
```

**`run.ts` SYSTEM-Prompt** — Ergänzung: „Dir wird ggf. eine Liste bereits gemachter Vorschläge gezeigt. Wiederhole KEINEN davon — weder wörtlich noch inhaltlich gleich. Wenn zu diesem Fall bereits alles Sinnvolle vorgeschlagen wurde, mach KEINEN neuen Vorschlag (leere Antwort ist korrekt)."

### ② Kandidaten-Hygiene *(cron)*

**Befund (Prod, 27 aktive-offene Claims = Kandidaten-Pool):** ~41% (11) haben einen Test-SV (`ist_testaccount`), 5 tragen das Seed-Fixture-UUID-Muster. Der Pool ist zu rund der Hälfte Testdaten — ein großer Teil der 8% erklärt sich schlicht daraus, dass der Orchestrator Testfälle reviewt (die naturgemäß abgelehnt werden). Dieser Filter allein sollte die Quote auf echten Fällen deutlich heben und spart Anthropic-Calls.

Es gibt **kein** `ist_testaccount` auf `claims`/`profiles` (nur auf `sachverstaendige`). Ein Fall gilt als **Test/Seed**, wenn EINES zutrifft (reine, testbare Prädikate; reuse bestehender Konventionen):

- **Test-SV:** `claims.sv_id` → `sachverstaendige.ist_testaccount=true` (reuse `test-sv-guard`-Konvention). Deckt ~41% des Pools.
- **Test-Kunde:** `claims.geschaedigter_user_id`/`created_by_user_id` → `profiles.email` matcht die etablierte Test-Email-Regex `/test|smoke|@claimondo\.test/i` (reuse aus `src/lib/start-link/pick-dispatcher.ts`; als `istTestEmail` nach `src/lib/testdaten/` konsolidiert, pick-dispatcher als Boy-Scout nachgezogen).
- **Seed-Fixture:** `claims.id::text` matcht `%-0000-4000-8000-%` (fängt user-lose Fixtures wie `bbbb4444…`, die weder SV noch Kunde haben; ~0 False-Positives gegen random v4-UUIDs).

Plus, unabhängig vom Test-Status:

- **Aktiv bearbeitete Fälle raus.** Fälle mit **≥1 offenem Task** (`tasks where fall_id=<id> and status='offen'`) übersprungen — laufende Arbeit, nicht im relevanten Sinn stagnant. *(Bewusst offen: „offener Task ist überfällig → eigene Stagnation" — späteres Feature, YAGNI.)*

Umsetzung im Cron (JS-Client, **kein** raw SQL/RPC → kein DDL): Kandidaten-Query um `sv_id, geschaedigter_user_id, created_by_user_id` erweitern; Batch-Lookup der Test-SV-IDs + Test-Kunde-IDs (Email-Regex über die Kandidaten-Profile); reine Prädikate `istTestOderSeedFall(claim, sets)` und `hatAktiveOffeneTasks(count)` filtern **vor** dem Anthropic-Call.

### ③ Feedback-Loop *(reject-UI)*

**`AiVorschlaegeClient.tsx`** — „Verwerfen" öffnet inline 3 Grund-Chips statt sofort zu verwerfen:
- „Schon erledigt" · „Nicht relevant" · „Unpräzise/falsch"

Klick auf einen Chip → `verwerfenVorschlag(v.id, grund)`. Die `feedback?`-Signatur existiert bereits; `verwerfenVorschlag` reicht sie an `decideProposal` durch (bereits verdrahtet). Der Grund fließt via ① in den nächsten Kontext. *(Freitext-Grund bewusst später; 3 Chips = niedrige Friktion, strukturiert, prompt-tauglich.)* Kein DDL.

### ④ Eskalations-Gating — Schärfen

`flag_escalation` bleibt, wird aber härter gebart (Aaron-Entscheidung „Schärfen"):

- **`tools.ts`** — Description von „Markiere den Fall als eskalationsbedürftig" zu: „Nur für einen HARTEN, blockierenden Zustand, den eine Rolle SOFORT auflösen muss (z. B. verletzter SLA mit konkretem Owner). Kein Status-Bericht, keine Analyse. `grund` = die konkrete Aktion, nicht die Beschreibung. Im Zweifel `propose_task` statt Eskalation."
- **`run.ts` SYSTEM-Prompt** — Ergänzung: „Eskalationen sind selten. Nutze `flag_escalation` NUR für harte Blocker mit konkreter Sofort-Aktion; ein beschreibender Absatz ist keine Eskalation."

Keine Struktur-Änderung an `flag_escalation` (Payload bleibt `{grund}`), nur Bar-Schärfung.

## Datenfluss

```
Cron (06:00)
  → aktive Claims laden
  → HYGIENE: Test-Fälle raus, Fälle mit offenen Tasks raus        (②)
  → pro Rest-Fall: isStagnant?
  → buildClaimContext (inkl. bereitsVorgeschlagen der letzten 8)   (①)
  → reviewClaim (SYSTEM: keine Wiederholung, Eskalation nur hart)  (①④)
  → persist offene/auto proposals (unverändert)

Admin-Review
  → Verwerfen → Grund-Chip → verwerfenVorschlag(id, grund)         (③)
  → feedback gespeichert → beim nächsten Lauf Teil des Kontexts    (③→①)
```

## Testing (TDD)

Reine Funktionen, RED→GREEN, vitest:

- `summarizeClaimForPrompt` mit gefülltem/leerem `bereitsVorgeschlagen` (Sektion erscheint/fehlt korrekt).
- `istTestEmail(email)` — `test`/`smoke`/`@claimondo.test` → true; echte Email → false.
- `istSeedFixture(claimId)` — Seed-UUID-Muster → true; random v4 → false.
- `istTestOderSeedFall(claim, { testSvIds, testUserIds })` — irgendein Test-Signal → true.
- `hatAktiveOffeneTasks(count)` — ≥1 → skip.
- `validateToolCall` bleibt unverändert grün (Eskalations-Schema unangetastet).
- Reject-UI: Grund-Chip verdrahtet `verwerfenVorschlag(id, grund)` (Component-Test oder Element-Typ-Assertion).

`buildClaimContext`/`reviewClaim` bleiben integrationsnah (DB/Anthropic) — via reine Sub-Funktionen getestet, nicht End-to-End gemockt.

## Erfolgsmessung

Annahmequote über die nächsten Cron-Läufe steigt; Dubletten (gleicher Fall, gleicher abgelehnter Vorschlag) verschwinden. Beobachtbar über `ai_claim_proposals` (status-Verteilung pro Lauf).

## Kompatibilität & Sicherheit

- **Kein DDL**, keine Migration. `feedback`-Spalte + `ai_claim_proposals`-Reads additiv.
- Jeder Fix degradiert sauber: kein Verlauf → alte Prompt-Form; kein Test-User → kein Skip; kein offener Task → reviewt wie bisher.
- Phase-2-Auto-Pfad (`run.ts` Auto-Branch) bleibt unberührt und dormant.

## Koordination

- **File-Lane:** `src/lib/orchestrator/{context,run,tools,types}.ts`, `src/app/api/cron/claim-orchestrator/route.ts`, `src/app/admin/ai-vorschlaege/{AiVorschlaegeClient,actions}.ts`, neu `src/lib/testdaten/ist-test-email.ts` (+ 1-Zeilen-Reuse in `src/lib/start-link/pick-dispatcher.ts`).
- **`claim-ai-konsole`-Session:** doc-only, disjunkt (Surfacing/Executor vs. Generierung). Teilt nur den Spine.
- **Badge-PR #3799:** ändert `actions.ts` in anderer Region (`getOffeneVorschlaegeCount` vs. `verwerfenVorschlag`) → konfliktfrei mergebar.
