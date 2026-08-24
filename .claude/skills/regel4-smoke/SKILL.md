---
name: regel4-smoke
description: Use when running the Regel-4 prod smoke after a PR, or whenever a Playwright smoke is written or debugged against app.claimondo.de / app.staging.claimondo.de. Triggers on "Regel 4", "Prod-Smoke", "Smoke fahren", "smoke gegen prod", "Playwright gegen prod", "Regel-4-Nachweis", and on any red/skipped smoke that needs diagnosing. Carries the failure modes that cost this project multiple days.
---

# Regel-4-Smoke — operatives Soll zuerst, dann messen

## Schritt 1 ist NICHT der Test

Bevor irgendetwas gefahren wird: **formuliere das operative Soll** — wie sollte das Feature
aus Nutzer-/Geschäftssicht ablaufen, **unabhängig davon, was gebaut ist**. Aus der Fachlogik
hergeleitet, nicht aus dem Code gelesen.

Ein Smoke, der die Implementierung nachfährt („seede den Zustand, den der Code erwartet,
treibe den Pfad, den der Code nimmt"), bestätigt nur *„Code tut, was Code tut"* — eine
Tautologie. Weicht der Code vom Soll ab, ist das ein **Befund**, keine Seed-Hürde, um die
man herum-baut.

**Alles per UI.** Jeder Zustandsübergang, der zum getesteten Soll gehört, ist ein echter
Klick über echte Logins, über alle beteiligten Rollen. DB-Seed ist nur für den
*Ausgangszustand* erlaubt, den ein vorgelagerter Schritt erzeugt hätte.

## Vor dem Lauf: die zwei Zeilen, die drei Tage gekostet haben

```bash
rm -rf playwright/.auth          # sonst fährst du mit fremden Cookies
rm -rf .next/dev                 # sonst bricht der nächste Production-Build
```

`playwright/.auth/<rolle>.json` trägt den Host **nicht im Namen**. Ein gecachter
localhost-Login lässt einen prod-Lauf als flächendeckenden Produktfehler erscheinen —
gemessen: 4/4 Wege rot, „0 Links" überall, darunter eine Liste, die niemand angefasst hatte.

Gegenprobe, wenn etwas nicht stimmt:
```bash
node -e "const s=require('./playwright/.auth/admin.json'); console.log([...new Set((s.cookies||[]).map(c=>c.domain))])"
```

## Zeigt der Lauf wirklich dorthin, wo du denkst?

Die teuerste Fehlerklasse dieses Projekts: **eine Bedingung hängt an einem Stellvertreter
statt am Ziel.** Drei Fälle an einem Tag (#5512, #5526, #5543) — jedes Mal fand der
vorgeschriebene Prod-Lauf nicht statt, und jedes Mal sah der Lauf normal aus.

> **Prüfsatz:** „Wenn ich das ZIEL wechsle (localhost ⇄ staging ⇄ prod) — ändert sich diese
> Bedingung mit?" Lautet die Antwort nein, hängt sie am falschen Wert.

Hängt eine Bedingung an `CI` oder `!IS_LOCAL` statt an der URL, ist sie falsch. In CI fällt
das nie auf, weil dort Stellvertreter und Ziel zufällig übereinstimmen.

**Die Gegenprobe ist nicht der Test-Output, sondern das Zugriffslog der Instanz, die du zu
testen glaubst.** (Ein Dev-Server-Log, das bei 758 Bytes steht, hat null Requests gesehen —
der Lauf ging in Wahrheit scharf gegen prod.)

Zentrale Stelle für Ziel + Basic-Auth: `tests/e2e/lib/ziel.ts`. Nur staging liegt hinter
nginx-Basic-Auth.

## Assertions: die vier Fallen

**Am DB-Zustand messen, nicht am Toast.** `sonner`-Toasts sind beim Auslesen oft schon weg.
`expect.poll` auf Zeilenzahl/Status; Text höchstens als Zusatz.

**`has-text` matcht Substring UND case-insensitiv.** Die gefährlichste, weil sie nicht in
einen Timeout läuft, sondern **plausibel den falschen Pfad nimmt**: `button:has-text("Ich")`
traf „Die Schuldfrage ist noch n·**ich**·t eindeutig geklärt" statt „Ich selbst" — und die
Schlussfolgerung wäre „der Fix ist kaputt" gewesen, bei korrektem Code. Nimm den vollen
Optionstitel oder `getByRole('button', { name: /^Ich selbst/ })`.

**`button[type="submit"]`.first() klickt ABMELDEN.** Der Logout in der Portal-Navigation ist
ein Server-Action-Form und steht im DOM **vor** dem Seiteninhalt. Gilt für jedes Portal mit
Nav. Richtig: `.filter({ hasText: 'Schaden melden' })` — und danach `count()` loggen.

**Body-Text-Polls treffen die Navigation.** Ein Poll auf „Kostenvoranschlag" war sofort
erfüllt, weil das ein Nav-Eintrag ist — er meldete Erfolg, bevor geklickt wurde.

## Vorbedingungen scharf stellen

Jeder Smoke prüft **zuerst** seinen Ausgangszustand. Ohne das prüft er unbemerkt etwas
anderes: ein bereits freigegebener Auftrag ist ohnehin offen → grün ohne Aussage.

## Cleanup gehört in `afterEach`, nicht in `finally`

Bei Test-Timeout bricht Playwright den Test-Body ab — ein `finally { cleanup() }` läuft
**nicht** mehr. Real passiert: der Lead eines geflakten Laufs blieb auf prod stehen, obwohl
die Spec „0 Residue" versprach.

## Ein grünes Ergebnis ist nicht automatisch ein Nachweis

`0 passed / N skipped` ist **kein** erbrachter Lauf, sondern ein stiller Skip. Die Zeile
`N passed` muss dastehen. Ebenso: `cancelled` ist kein Erfolg, und ein `✓` mit einem Hinweis
darin ist ein halber Befund.

## Selektoren gegen prod

Prod deployt von `main`; viele `data-testid` liegen nur auf `staging`. **Rollenbasiert
schreiben** (`getByRole`), nicht per Testid. Und „ist X auf prod?" nie per
`git branch --contains` prüfen — staging→main läuft über Squash-Commits, der Test liefert
massenhaft falsche Negative. Inhaltlich prüfen:
```bash
git cat-file blob origin/main:<pfad> | grep -c '<marker>'
```

## Verwandt

- `journey-verifikation` — prüft den ganzen Lauf, nicht nur die neue Funktion
- `docs/fundament/journey-smokes.md` — welche Spec bewacht welche Journey
- Test-Konten: `scripts/test-fixtures/ids.ts` (stabile IDs immer von dort)
