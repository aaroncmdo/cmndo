---
name: journey-verifikation
description: Use when a change touches product code and you need to know which COMPLETE user journey it affects — not just whether the new function works. Triggers on "welche Journey", "Journey-Bezug", "hat das Auswirkungen auf", "ganzer Lauf", "Regression durch Merge", "was kann das kaputtmachen", before opening a release drain, and whenever a smoke passed but the surrounding flow was not checked.
---

# Journey-Verifikation — prüfe den Lauf, nicht die Funktion

## Das Problem, das dieser Skill löst

> „Die Smokes decken nicht auf, was wirklich der Fehler ist. Sie fokussieren sich meistens
> nur darauf, dass diese eine kleine Funktion, die wir neu eingebaut haben, einzeln gecheckt
> wird — aber nicht, ob der gesamte Lauf, in dem wir eigentlich gerade arbeiten, dann auch
> wirklich funktioniert." *(Aaron, 23.08.2026)*

Ein Feature-Smoke beweist, dass dein Baustein funktioniert. Er beweist **nicht**, dass die
Kette, in der er sitzt, noch durchläuft. Genau dort entstehen die Regressionen, bei denen
„Merges Applikationsschritte löschen".

## Schritt 1 — welchen Lauf berührst du?

```bash
npm run check:journey-bezug
```

Liest deinen Diff gegen `origin/staging` und meldet die betroffenen Journeys samt der Specs,
die sie bewachen. Läuft auch in CI und schreibt das Ergebnis in die Job-Summary des
`build`-Jobs.

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

## Schritt 3 — wo wird gemessen?

| Wann | Was läuft | Blockiert? |
|---|---|---|
| Feature-PR | `build` + ~25 Ratchets + Journey-Bezug (informativ) | Ratchets ja, Journey nein |
| **Release-Drain → main** | **Journey-Gate: 8 Journeys + 2 DB-Teilschritte gegen staging** | **ja** |
| nightly 03:30 UTC | alle 10 Journeys gegen prod + `e2e-rest` (Sammel-Lauf) | nein, informativ |

Das Tor fährt gegen `app.staging.claimondo.de`, weil dort der Stand liegt, der nach main
soll. Auf prod läuft der alte — ein Lauf dagegen beweist nichts über den neuen.

**Bewusst nicht im Tor** (bleiben nightly): **J7 Storno/DSGVO** (irreversible Anonymisierung)
und **J9-`provisionen-lifecycle`** (schießt den echten globalen Release-Cron auf echte
Provisionen). Wer sie im Tor haben will, muss vorher das Datenrisiko klären.

## Schritt 4 — den Lauf selbst fahren

Manuell gegen staging:
```bash
rm -rf playwright/.auth
PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de \
STAGING_BASIC_AUTH_USER=… STAGING_BASIC_AUTH_PASS=… \
RUN_<GATE>=1 npx playwright test <spec> --project=chromium --reporter=line --retries=0
```

Oder das ganze Tor: `gh workflow run "Journey-Gate" --ref <branch>`.

⚠ **staging schreibt in die Produktionsdatenbank.** Beide Umgebungen teilen dieselbe
Supabase-Instanz — staging ist kein isoliertes Environment. Wegwerf-Konten und der
`reserviere()`-Guard bleiben Pflicht.

## Schritt 5 — Vorbedingungen scharf stellen

Ein Journey-Smoke, der seinen Ausgangszustand nicht prüft, misst unbemerkt etwas anderes.
Und: **derselbe Test zweimal hintereinander** findet beim zweiten Mal seinen Ausgangszustand
verbraucht — die Fixture-Prüfung kennt nur „Datei da/fehlt", nicht „Datei da, DB verbraucht".

## Bei rotem Journey-Gate

1. Journey reparieren und neu drainen — der Normalfall.
2. Oder **mit Aaron absprechen**: Label `journey-override` + Begründung als Kommentar.

Das Tor fährt mit `--retries=0`. Ein roter Lauf ist ein Befund, kein Anlass zum Wiederholen —
ein stiller Retry verwandelt eine echte Regression in Flakiness-Rauschen.

## Verwandt

- `regel4-smoke` — wie ein einzelner Smoke sauber gebaut und gefahren wird
- `release-drain` — der Weg von staging nach main
- Design: `docs/superpowers/specs/2026-08-23-journey-gate-release-tor-design.md`
