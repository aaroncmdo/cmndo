# Test-SV-Guard — interne/Test-Leads buchen & benachrichtigen nie echte Sachverstaendige

**Datum:** 2026-07-03
**Status:** implementiert (dieser PR)
**Branch:** `kitta/test-sv-guard`

## Problem / Vorfall

Der einzige echte, aktive, verifizierte Sachverstaendige der Plattform — **Gaith Hamed / UnfallSafe (Koeln)** — bekam laufend **Test-Termine + Nachrichten**. Ursache: interne/Test-Leads laufen durch die **echte** Matching-/Buchungs-Engine, die den naechsten echten buchbaren SV waehlt. In Koeln ist das immer Gaith. Es existierte **kein Testdaten-Filter** auf der SV-Seite — `sachverstaendige.ist_testaccount` war im Code **nirgends** ausgewertet.

Belegt: die Buchungen auf Gaith stammten aus Leads von `aaron.sprafke@claimondo.de` (mini_wizard), `info@claimondo.de` (Nicolas Kitta), `max.fresh@claimondo-test.de` ("Max Mustermann") — alle intern/Test, kein echter externer Kunde.

Sofort-Massnahmen (ausserhalb dieses PR, direkte DB-Ops):
1. Gaiths Test-Termin + Auftrag geloescht, 3 Test-Claims von ihm detacht (`sv_id=NULL`).
2. Gaith reversibel geparkt: `sachverstaendige.ist_aktiv=false` (raus aus allen Buchungs-Pfaden), `portal_zugang`/`verifiziert` unveraendert. Zuruecksetzen sobald dieser Guard live ist.

## Ziel

Test-/interne Buchungen duerfen **nie** einen echten SV erreichen (buchen ODER benachrichtigen) — und umgekehrt darf ein echter Kunde nie einen Test-SV buchen. Test<->Test (Smokes) und Echt<->Echt (Normalbetrieb) laufen unveraendert.

## Design

### 1. Pures Praedikat — `src/lib/testdaten/interne-identitaet.ts`
`istInterneIdentitaet(email, name?)` / `istInterneEmail(email)`. `true` bei:
- Domain ∈ `{claimondo.de, claimondo.test, claimondo-test.de}` (Firmendomain = intern; faengt die Gruender-Test-Leads — **Aaron-Entscheid 2026-07-03**), ODER
- begrenztem Test-Marker `/(^|[.+_-])(test|smoke|e2e)([.+_@-]|$)/i` (fremd-domain Test-Accounts, ohne FP wie `testarossa@`), ODER
- Platzhalter-Name (`Mustermann`).

Bewusst **getrennt** von `src/lib/start-link/pick-dispatcher.ts`: dort ist `dispatch@claimondo.de` ein ECHTER interner Dispatcher (kein Test). Hier geht es um die Identitaet eines LEADS — `@claimondo.de` = intern. Keine Zusammenfuehrung (unterschiedliche Semantik, dokumentiert).

### 2. Guard am Buchungs-Chokepoint — `src/lib/testdaten/test-sv-guard.ts`
- `entscheideTestSvGuard(leadIstIntern, svIstTest)` — reine Konsistenz-Matrix: blockt genau die beiden Mischungen (intern→echt, echt→Test); Test→Test und Echt→Echt laufen durch.
- `pruefeTestSvKonsistenz(db, svId, bezug)` — loest die Identitaet hinter dem `bezug` auf (lead direkt; claim/fall → `lead_id` → lead), liest `sachverstaendige.ist_testaccount`, entscheidet. **Fail-open**: kein `bezug` oder Lookup-Fehler → nie blockieren (ein Guard darf keine legitime Buchung brechen).

### 3. Einhaengung — `reserviere()` in `src/lib/termine/engine/writes.ts`
`reserviere` ist der **eine** Buchungs-Chokepoint (hat `assignee` + `bezug` + `db`). Vor dem Insert: bei `assignee.typ==='sachverstaendiger'` → `pruefeTestSvKonsistenz`; `blockieren` → `{ok:false, code:'test_guard'}`. Deckt alle Pfade (Finder-Slot-Pick, Dispatch, Direkt-Reserve) ohne Aenderung der kollisions-heissen Flow-Actions.
- `matching.ts` mappt bereits jeden non-`belegt`-Code → `'db'` → Match-Pfad bricht sauber ab.
- `plane-termin.ts` (FIX-Pfad) mappt `test_guard`→`'db'`; `PlaneTerminResult`-Union bleibt stabil (kein Kaskaden-Break). Der beschreibende Grund reist in `error`.

## Warum reserviere() (nicht Matching-Pool / Notification)
- **Pool-Filter** (echte Leads nur echte SVs): sauberer Root-Fix, aber die Anzeige-Pfade (`planeTerminOeffentlich` global) haben zur Anzeigezeit keine Lead-Identitaet — wuerde Flow-Action-Wiring in aar-956-heisser Zone erfordern. **Deferred** (Follow-up).
- **Notification-Suppression**: nur Symptom (Termin/Auftrag entstuenden trotzdem auf echtem SV). Der reserviere-Guard verhindert die Entstehung → keine Notification. Als defense-in-depth spaeter moeglich, hier **YAGNI**.

## Nicht-Bruch der Smokes
`src/lib/smoke/lifecycle-seed.ts` bucht per **direktem** `gutachter_termine`-Insert (umgeht `reserviere`) → unberuehrt. Zudem: Smoke-Lead (`@claimondo.de`) + Test-SV = intern→Test = konsistent = nie blockiert.

## Tests (TDD, 17)
- `interne-identitaet.test.ts` (8): Firmendomain, Test-Marker, echte Kunden, FP-Guards, leere Email, Platzhalter-Name.
- `test-sv-guard.test.ts` (9): Konsistenz-Matrix (4), bezug-Aufloesung lead/claim, kein-bezug, fail-open.

## Verifikation
- `tsc --noEmit`: 0 Fehler. Engine/Matching/Dispatch/Testdaten: 229/229 gruen. token-audit-Ratchets: gruen.

## Deferred / Follow-up
1. Matching-Pool-Filter (Anzeige-seitig test↔test / echt↔echt), sobald aar-956 abgekuehlt ist.
2. Notification-Safety-Net fuer etwaige Direkt-Insert-Buchungspfade.
3. Gaith `ist_aktiv=true` zuruecksetzen, wenn dieser Guard deployed ist.
4. Nihal Gueler / Andreas Kloss haben inerte (stornierte) Test-Termine — optional mitbereinigen.
