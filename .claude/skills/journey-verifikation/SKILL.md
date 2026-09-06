---
name: journey-verifikation
description: Use before merging any change that touches a customer, workshop, SV, dispatch or admin flow, and during every Regel-5 Abnahme. Triggers on "Journey", "Journey-Gate", "Lauf prüfen", "gesamter Lauf", "Nutzerstrom", "Abnahme", "welche Spec bewacht", "check:journey-bezug", and on any feature smoke that only proves the new function. Carries the rule that a green gate is only a proof for the state its seed creates.
---

# Journey-Verifikation — prüfe den Lauf, nicht die Funktion

## Das Problem, das dieser Skill löst

> „Die Smokes decken nicht auf, was wirklich der Fehler ist. Sie fokussieren sich meistens
> nur darauf, dass diese eine kleine Funktion, die wir neu eingebaut haben, einzeln gecheckt
> wird — aber nicht, ob der gesamte Lauf, in dem wir eigentlich gerade arbeiten, dann auch
> wirklich funktioniert." *(Aaron, 23.08.2026)*

> „Du musst dir überlegen, ob das Ziel, das ich initial hatte, erreicht wurde und das Ding für
> den Nutzerstrom optimiert und funktioniert ist … von allen Ecken und Enden." *(Aaron, 04.09.2026)*

Ein Feature-Smoke beweist, dass dein Baustein funktioniert. Er beweist **nicht**, dass die
Kette, in der er sitzt, noch durchläuft — und nicht, dass jeder Eingang und jede Rolle den
neuen Zustand sieht. Genau dort entstehen die Regressionen, bei denen „Merges
Applikationsschritte löschen", und die Lücken, bei denen der Kunde „dasteht wie der letzte Idiot".

## Schritt 1 — welchen Lauf berührst du?

```bash
npm run check:journey-bezug
```

Liest deinen Diff gegen `origin/staging` und meldet die betroffenen Journeys samt der Specs,
die sie bewachen. Läuft auch in CI und schreibt das Ergebnis in die Job-Summary des
`build`-Jobs.

⚠ **Im Feature-Worktree fahren, nicht im Haupt-Checkout auf `main`:** dort ist der Diff gegen
`origin/staging` der Inhalt des nächsten Releases — die falsche Richtung, es meldet fremde
Journeys.

Ergänzt du die Zuordnung, prüfe jedes neue Pfad-Muster:
```bash
node scripts/check-journey-bezug.mjs --pruefe-pfade
```
Kein `LEER` erlaubt — ein Muster ohne Treffer ist eine tote Zeile. **Pfade nachschlagen,
nicht ableiten:** `src/lib/reparatur/**` klingt richtig und existiert nicht; der
Reparatur-Code liegt in `src/lib/werkstatt/` (85 Dateien).

## Schritt 2 — welche Spec bewacht diesen Lauf?

`docs/fundament/journey-smokes.md` ist das Oracle: J1–J10 mit Bewacher-Spec, Abdeckung und
Lauf-Modus. Die Map in `scripts/journey-map.json` ist die maschinenlesbare Fassung davon.

## Schritt 2b — erzeugt die bewachende Spec deinen Zustand überhaupt?

**Ein grünes Gate ist nur ein Beweis für den Zustand, den sein Seed anlegt.** Lies den Seed der
bewachenden Spec (`scripts/smoke/<journey>-seed.mjs`) und prüfe, ob er die Konstellation deines
Features erzeugt. Am 04.09.: J10 (`werkstatt-finder-smoke`) war für die Kasko-Werkstattbindung
als Bewacher gelistet und lief grün — sein Seed legt aber `abrechnungsweg='selbstzahler'` an.
Die neue Tarif-Card erscheint nur bei `kasko`; das Gate hat sie **nie gerendert**. Grün ohne
Aussage.

Erzeugt kein Seed deinen Zustand: eigenen Driver schreiben oder den bestehenden um die
Variante erweitern (Kundenfunnel-Driver: Szenario D wählt jetzt die Tariffrage), Journey-Delta
im Soll-Dokument (`docs/fundament/journeys/j0N-…md`, Abschnitt „Varianten") und Eintrag in
`scripts/journey-map.json` + `docs/fundament/journey-smokes.md`.

## Schritt 2c — Eingänge × Rollen

Journeys sind **fluss**orientiert (J1 Haftpflicht, J4 Reparatur, J5 Weiche …). Ein Zustand
entsteht aber an mehreren Eingängen und wird von mehreren Rollen gelesen. Vor dem Lauf die
Matrix aus `regel4-smoke` (Schritt 2) füllen: anonym (Marketing, FlowLink, Embed im iframe,
QR/NFC, Anspruchsprüfung) × angemeldet (Kunde, Werkstatt, SV, Dispatch, Admin, KB, Makler,
Flotte, Kanzlei). Jede Zelle, in der der Zustand entstehen oder gelesen werden kann, ist ein
Test — auch der **Re-Visit** desselben Links und der **Override** durch eine interne Rolle,
der auf Lead **und** Claim **und** Kundensicht wirken muss.

## Schritt 2d — Sackgassen und irreversible Klicks

Auf jedem Endzustand des Laufs: Handlungen zählen. *„Kein Weiter-Button" ist kein Befund,
„nichts bewegt sich" ist einer* — aber ein Endzustand ohne Weg zurück nach einem
**irreversiblen** Klick ist einer: Die Tarif-Karte der Kasko-Werkstattbindung entschied beim
ersten Klick (Disqualifikation, Mail, Re-Visit-Gate), ohne Bestätigung; die Endseite bot nur
„Rückruf". Bei 408 teils gleichnamigen Tarifen („Classic" / „Classic SELECT") ist der Fehlklick
der Normalfall → Bestätigung + „Angaben korrigieren" + Re-Qualifikation (PR #5864).

Fragen je Endzustand: Kann der Nutzer eine Fehleingabe korrigieren? Sieht er, was als Nächstes
passiert und wer sich meldet? Stimmt der Fortschrittsindikator (ein Endzustand, der als
„Schritt 2 von 2" erscheint, verspricht ein Weiter)? Stimmt die Anrede innerhalb **eines**
Bildschirms (Card-Titel „Dein Kasko-Tarif" über einer Frage in Sie-Form)?

## Schritt 3 — wo wird gemessen?

| Wann | Was läuft | Blockiert? |
|---|---|---|
| Feature-PR | `build` + ~25 Ratchets + Journey-Bezug (informativ) | Ratchets ja, Journey nein |
| **Release-Drain → main** | **Journey-Gate: 8 Journeys + 2 DB-Teilschritte gegen staging** | **ja** |
| **Abnahme (Regel 5), nach Deploy** | **alle betroffenen Eingänge × Rollen gegen prod** (`regel4-smoke`) | **ja — ohne sie bleibt die Abnahme „offen"** |
| nightly 03:30 UTC | alle 10 Journeys gegen prod + `e2e-rest` (Sammel-Lauf) | nein, informativ |

Das Tor fährt gegen `app.staging.claimondo.de`, weil dort der Stand liegt, der nach main
soll. Auf prod läuft der alte — ein Lauf dagegen beweist nichts über den neuen. **Nach dem
Deploy dreht sich das um:** dann ist prod das Ziel, und das Gate von vorhin beweist nichts
über die deployte Instanz (Build-Env, `NEXT_PUBLIC_*` zur Build-Zeit, pm2-Restart).

**Bewusst nicht im Tor** (bleiben nightly): **J7 Storno/DSGVO** (irreversible Anonymisierung)
und **J9-`provisionen-lifecycle`** (schießt den echten globalen Release-Cron auf echte
Provisionen). Wer sie im Tor haben will, muss vorher das Datenrisiko klären.

## Schritt 4 — den Lauf selbst fahren

Manuell gegen staging:
```bash
rm -rf playwright/.auth/*.json
PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de \
STAGING_BASIC_AUTH_USER=… STAGING_BASIC_AUTH_PASS=… \
RUN_<GATE>=1 npx playwright test <spec> --project=chromium --reporter=line --retries=0
```

Oder das ganze Tor: `gh workflow run "Journey-Gate" --ref <branch>`.

Gegen prod nach dem Deploy: Kommando, Umgebung und Fallen in `regel4-smoke`
(Node `--env-file`, Junction, Secrets aus Memory).

⚠ **staging schreibt in die Produktionsdatenbank.** Beide Umgebungen teilen dieselbe
Supabase-Instanz — staging ist kein isoliertes Environment. Wegwerf-Konten und der
`reserviere()`-Guard bleiben Pflicht. Zwei Sessions, die gleichzeitig denselben Driver
fahren, racen den Seed — absprechen, wer prod und wer staging fährt.

## Schritt 5 — Vorbedingungen scharf stellen

Ein Journey-Smoke, der seinen Ausgangszustand nicht prüft, misst unbemerkt etwas anderes.
Und: **derselbe Test zweimal hintereinander** findet beim zweiten Mal seinen Ausgangszustand
verbraucht — die Fixture-Prüfung kennt nur „Datei da/fehlt", nicht „Datei da, DB verbraucht".

## Schritt 6 — Ergebnis in die Abnahme

Der Lauf gehört in `memory/abnahmen/<datum>-<slug>.md`: Abschnitt 6 (Matrix Eingänge × Rollen
mit „geprüft wie" und Ergebnis je Zelle), Abschnitt 7 (Nachweise mit Zahlen + Quelle), Abschnitt
10 (Checkliste). Zellen, die per Playwright nicht fahrbar sind (Gerät, echte Kunden-Comms,
DB-Trigger ohne UI-Weg), stehen dort ausdrücklich als „verdrahtet, nicht gelaufen" mit dem
DB-Read als Ersatz — nie als Häkchen.

## Bei rotem Journey-Gate

1. Journey reparieren und neu drainen — der Normalfall.
2. Oder **mit Aaron absprechen**: Label `journey-override` + Begründung als Kommentar.

Das Tor fährt mit `--retries=0`. Ein roter Lauf ist ein Befund, kein Anlass zum Wiederholen —
ein stiller Retry verwandelt eine echte Regression in Flakiness-Rauschen.

## Verwandt

- `regel4-smoke` — wie ein einzelner Smoke sauber gebaut und gefahren wird; Matrix Eingänge × Rollen
- `release-drain` — der Weg von staging nach main
- Abnahme-Ort: `memory/abnahmen/INDEX.md` (Regel 5, Aaron 04.09.2026)
- Design: `docs/superpowers/specs/2026-08-23-journey-gate-release-tor-design.md`
