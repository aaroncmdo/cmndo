# Decision-Review — Digest 2026-08-08 (Fundament D2, erster Pflege-Zyklus)

> **Zweck:** Alle offenen `Review: offen (Aaron)`-Einträge aus `DECISIONS.md` auf einen Blick, damit der
> erste Decision-Review in Minuten statt Stunden läuft. Gruppiert nach **empfohlener Aktion**, nicht
> chronologisch. Pro Eintrag: 1-Satz-Entscheidung + Empfehlung. Aaron hakt ab; der bestätigte/revidierte
> Status wird danach in `DECISIONS.md` (Review-Zeile) nachgezogen — das ist der D2-Pflege-Rhythmus (FUNDAMENT §8.1).
>
> **Stand:** 24 Einträge, davon 23 `offen`. Referenz-Nachweis für die B-Suite: post-merge-`e2e`-Lauf
> **31260565130** (08.08.) — alle 10 Journey-Steps grün gegen prod.

---

## A · Schnell bestätigbar — durch Bau + Prod-Bewährung gedeckt (14)

Diese Entscheidungen sind umgesetzt, gemergt und (wo zutreffend) prod-verifiziert. Empfehlung: **als Gruppe bestätigen**, Review-Zeilen auf `bestätigt (Aaron, 08.08.)` setzen.

**B-Journey-Suite (9)** — die ganze Suite ist prod-grün (Lauf 31260565130); jede dieser Design-Entscheidungen ist im laufenden CI-Wächter bewährt:
- `2026-08-03` J9-Provisions-Smokes in CI (verrechnung+staffel) — ✅ läuft grün.
- `2026-08-03` T2: J8-2FA-Enroll in CI — ✅ läuft grün.
- `2026-08-04` Kurskorrektur „keine Skips" (alle Journeys → CI-Steps) — ✅ vollständig umgesetzt (10/10).
- `2026-08-04` J10 Werkstatt-Finder als CI-Step (2 Bugs) — ✅ + Nachsorge #5053 (Leichen-Clean).
- `2026-08-04` J3 SA/Vollmacht als CI-Step (anon Canvas) — ✅ grün.
- `2026-08-04` J6 Kanzlei-Übergabe als CI-Step — ✅ grün.
- `2026-08-04` J7 Storno/DSGVO als CI-Step (+ Prod-Fix RPC-Drift Mig `20260804193646`) — ✅ grün.
- `2026-08-05` J2 Meldung alle Kanäle — ✅ Suite 10/10 code-komplett, grün.
- `2026-08-05` J9-`lifecycle` via Geld-Guard — bereits `entschieden durch Aaron` (05.08.); nur CI-Nachweis-Zeile nachziehen.

**Fundament-Kern-Architektur (5)** — gebaut + auf prod:
- `2026-07-29` C1: Event-Log = `phase_transitions` (kein neues `claim_events`) — ✅ C1a gebaut+prod (#4935).
- `2026-07-29` C1/FG1-Partition (Matrix-Funnel vs Terminal-Sync) — ✅ Partition gelebt, C1a-Ratchet aktiv.
- `2026-08-04` C2: FlowLink IMMER + garantierter Kunde-Kanal — ✅ C2a gebaut+prod (#4992).
- `2026-08-04` C2: /flow bleibt Konvergenzpunkt (kein Rewire in C2a) — ✅ umgesetzt.
- `2026-08-05` C3: Outbox liegt DAVOR + REGISTRY bleibt Template-Layer — ✅ C3a gebaut+prod (#5011).

---

## B · Überholt / durch spätere Entscheidung revidiert (2)

Diese widersprechen dem heutigen Stand — Empfehlung: **`revidiert → superseded`** markieren (nicht bestätigen), damit die DECISIONS-Historie nicht in sich widersprüchlich bleibt.

- `2026-08-03` „J10 = begründeter Skip; §9-Punkt-2 erfüllt" — **überholt** durch die 04.08.-Kurskorrektur „keine Skips" + die tatsächlich gebaute J10-CI-Integration. §9-#2 ist jetzt via **echtem** CI-Grün erfüllt, nicht via Skip.
- `2026-08-03` „J9-`lifecycle` bleibt opt-in" — **überholt** durch den 05.08.-Entscheid (lifecycle IN CI via Geld-Guard).

---

## C · Echter offener Produkt-/Design-Entscheid — braucht Aaron (7)

Hier lohnt die inhaltliche Durchsicht; sie sind NICHT durch Bau gedeckt.

- `2026-07-28` **SV-Org-Lane retiren** (`/gutachter/team` toter Pfad, Schema bleibt) — Empfehlung: bestätigen (off-roadmap, reversibel). _Nur formal, inhaltlich risikoarm._
- `2026-07-28` **Bug3: onboarding-details kanonisch** für eingeloggte Kunden — Regel-4-Smoke lief (264a7df6); 2 dokumentierte dormant Nebenbefunde (felderlose sa-Phase = toter Fallakte-Redirect; Wizard-localStorage-Cross-Fall). Empfehlung: bestätigen + die 2 Nebenbefunde als eigene Tickets.
- `2026-07-29` **C1c Abschluss-Pfad Option B** — Richtung bestätigt; **offenes Detail:** was genau „Schlussabrechnung" ist (Dokument-Typ / KB-Bestätigung / `abrechnungen`-Anbindung). Echter Design-Entscheid vor C1c-Bau.
- `2026-08-04` **C2b: Gegner-Pflichtdok im Kern** + **C2c: Marketing-Mini-Wizard** (16. Meldeweg?) — §7#2 baureif (C2b), §7#3 echte Scope-Frage (eigener Build). Braucht Go vor C2b/C2c.
- `2026-08-05` **C3: `gutachten_fertig`-Doppel-Send-Verifikation → C3b** — Verifikation gegen aktuellen Code offen (C3b teils gebaut #5017/#5044/#5059 — Status gegen diese PRs prüfen).
- `2026-08-05` **C3: FM/Kanzlei-Kanäle** (WA/Email statt nur In-App?) — reine Produkt-Entscheidung.
- `2026-07-30` **P4 (Netzwerk): sa_unterschrieben-Gate + SV-Flow-Nebenschauplatz** — Lane-extern (Netzwerk `bf27ae57`); Status dort verifizieren, nicht hier bestätigen.

---

## D · Frisch (heute, noch kein Review fällig)

- `2026-08-08` **C5 doc-close** (Zugriffs-Doktrin verankert, §9-#8) — PR #5084 offen; Review nach Merge.
- `2026-08-08` **D2** (dieser Review-Rhythmus) — dieses Dokument ist der Deliverable.

---

### Nach dem Review (D2-Rhythmus)
1. Aaron geht A/B/C durch → Entscheidung je Zeile.
2. Die `Review:`-Zeilen in `DECISIONS.md` werden auf `bestätigt (Aaron, <datum>)` / `revidiert → <Folge>` gesetzt.
3. Neue Folge-Tickets (z.B. Bug3-Nebenbefunde, C1c-Schlussabrechnung-Definition) anlegen.
4. Dieses Digest-File wird beim nächsten Zyklus durch ein neues `DECISION-REVIEW-<datum>.md` ersetzt (nur offene Einträge).
