# CMM-44 SP-G2 — Smoke (PRE-MERGE Baseline), 2026-05-21

**Target:** `https://app.staging.claimondo.de` (Basic-Auth, Test-User `Test1234!`)
**Script:** `scripts/smoke-cmm44-spg2.mjs` (read-only; Re-Run-Harness fuer nach dem staging-Merge)
**Stand:** PR1 #1521 **noch nicht** auf staging gemergt → dieser Lauf testet den **Ist-Zustand
(alter Code)** als Baseline. Der eigentliche PR1-Write-Pfad (Buchung setzt claim_id ueber den
neuen Writer-Code) wird beim Re-Run **nach** dem staging-Merge geprueft.

## Warum schon jetzt
- Baseline der Oberflaechen, die SP-G2 beruehrt — Vergleichsstand vor PR1 (Writer) und vor PR2
  (View-Re-Key `v_faelle_mit_aktuellem_termin` + `v_claim_timeline`).
- Validiert Harness (Basic-Auth, Login, Service-Role-DB) fuer die Re-Runs.

## Ergebnis: 5 OK / 1 HARD (Befund: pre-existing, kein SP-G2-Bezug)

| Surface | Status | Befund |
|---|---|---|
| DB-Invariante `gutachter_termine` | **OK** | `fall_id` gesetzt & `claim_id` NULL = **0** (Live-Service-Role). Die Invariante, die PR1 writer-getragen aufrechterhaelt, gilt. |
| SV `/gutachter/kalender` | **OK** | Wochenansicht + „OHNE TERMIN (23)"-Liste + Kalender(2)-Badge rendern (get-sv-tagesplan liest `gutachter_termine`). Screenshot `002`. |
| SV `/gutachter` | **OK** | Redirect → `/gutachter/heute`, rendert. `003`. |
| Dispatch `/dispatch` | **OK** | → `/dispatch/dashboard`, rendert. `005`. |
| Dispatch `/faelle/[id]` (Fallakte, **v_claim_timeline**-Consumer) | **HARD→benign** | Seite rendert **vollstaendig + korrekt** (Phasen, SV-Briefing, Kundendaten, „Termin vereinbart" / „Videotermin buchen", Kommend/Vergangen). `pageerror: React #418` = **Hydration-Recovery, pre-existing auf staging** (PR1 nicht gemergt → kann nicht SP-G2 sein). Screenshot-Analyse `006` zeigt gesunde UI. |
| Kunde `/kunde` | **OK** | Dashboard rendert. `008`. |

Beispiel-Termin live: `fall_id=0fa542a5…` → `claim_id=0f19efb3…` (gesetzt, wie erwartet).

## Bewertung
Alle SP-G2-relevanten Oberflaechen sind auf dem aktuellen staging-Stand gesund. Der einzige
HARD-Hit ist ein **bestehender, harmloser React-#418-Hydration-Hinweis** auf der Fallakte
(Seite rendert korrekt — per Screenshot bestaetigt, [[feedback_smoke_screenshot_pflicht]]) und
ist **nicht** SP-G2-verursacht (PR1 nicht deployed). Er ist als bestehender staging-Zustand
notiert; der Re-Run nach PR1-Merge muss zeigen, dass PR1 ihn **nicht verschlimmert**.

## Re-Run nach staging-Merge (das eigentliche PR1-Gate)
1. `node scripts/smoke-cmm44-spg2.mjs` erneut → gleiche Surfaces gruen, #418 nicht schlimmer.
2. **Zusaetzlich Write-Flow** (dann sinnvoll): KB-/Re-Termin buchen → Service-Role-Assert
   `gutachter_termine.claim_id` ist gesetzt (jetzt vom Writer-Code, nicht nur vom Trigger).
3. Nach **PR2** (View-Re-Key) erneut: Fallakte-Timeline + Admin/Kalender-Termin-Anzeige
   unveraendert.
