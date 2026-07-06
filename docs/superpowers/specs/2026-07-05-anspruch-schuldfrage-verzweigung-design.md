# Anspruch: Schuldfrage-Verzweigung + "0 EUR Eigenkosten"-Botschaft — Design

**Datum:** 2026-07-05
**Tool:** `/embed/anspruch-pruefen` (KFZ-Foto-Ersteinschaetzung)
**Ziel:** Die Ersteinschaetzung nach Schuldfrage verzweigen, damit (a) jeder Fall
korrekt dargestellt wird (kein falsches "Gegnerversicherung" bei Kasko/Selbstverschulden)
und (b) der Claimondo-Kern-Pitch — "0 EUR Eigenkosten fuer Sie" im unverschuldeten Fall —
laut und klar transportiert wird.

## Kernentscheidung (Brainstorming, Aaron 2026-07-05)

**Tiefe der Verzweigung = Darstellung + Positionen, NICHT Betraege.**
Die Euro-Betraege bleiben der volle Anspruch. Die Schuldfrage steuert ausschliesslich
Framing, Labels, welche Positionen sichtbar/aktiv sind und die Kernbotschaft. Es wird
**keine** Selbstbeteiligungs- oder Quoten-Mathematik gerechnet (wir kennen die
Kasko-Details des Nutzers nicht sicher; das Tool ist bewusst eine unverbindliche
Ersteinschaetzung). Das ist korrekt, schlank und konform mit dem Unverbindlichkeits-Charakter.

## Weitere Entscheidungen

- **3 Optionen:** `unverschuldet` (die andere Person) · `teilschuld` (teils ich) · `selbst` (ich selbst).
- **Default:** `unverschuldet` — haeufigster Fall + der Pitch; wer es nicht sicher weiss,
  laesst es stehen, der Gutachter klaert die Schuld verbindlich.
- **Platzierung:** auf dem bestehenden **Angaben-Schritt** (`AnspruchEinschaetzungStep`),
  kein neuer Wizard-Screen — die 3-Schritt-Strecke (Fotos/Angaben/Ergebnis) bleibt.
- **Ersetzt** den aktuellen pauschalen Kasko-Hinweis durch die echte Verzweigung.

## Datenmodell

- **`Schuldform`** (neuer Type in `src/lib/anspruch/types.ts`): `'unverschuldet' | 'teilschuld' | 'selbst'`.
- **`SchaetzInput.schuld?: Schuldform`** — optional im Type (tsc-Gate; Test-Fixtures + bestehende
  Caller brechen sonst), Default in der Berechnung = `'unverschuldet'`.
- **`AnspruchSpanne.schuld: Schuldform`** — die Berechnung setzt die aufgeloeste Schuldform auf
  das Ergebnis, damit die Render-Schicht (Summary, TotalschadenWege, SV-Fallakte) nicht erneut
  raten muss.
- **`AnspruchPositionTyp`** += `'anwaltskosten'` — neue gegner-gedeckte Position (Betrag `null`,
  `gedecktDurchGegner: true`), analog zur bestehenden Gutachterkosten-Zeile.
- **DB (additiv):** `anspruch_schaetzungen.schuld text` (nullable) via `apply_migration`. Persistiert
  die Schuldform der Session, damit die SV-Fallakte-Vorschau dasselbe Framing zeigt. Kein CHECK-Constraint
  noetig (nur diese Codepfade schreiben; unbekannte Werte fallen im Renderer auf `unverschuldet` zurueck).

## Berechnung (`src/lib/anspruch/positionen.ts`)

`berechneAnspruchsSpanne(input)`:
- Loest `schuld = input.schuld ?? 'unverschuldet'` auf und setzt sie auf die zurueckgegebene `AnspruchSpanne`.
- Fuegt **nur bei `unverschuldet`** eine `anwaltskosten`-Position hinzu (Betrag `null`, `gedecktDurchGegner: true`,
  Label "Anwaltskosten"). Bei `teilschuld` ebenfalls (Gegner traegt anteilig die Anwaltskosten) — bei `selbst` NICHT.
- **Euro-Betraege aller anderen Positionen bleiben unveraendert** (Tiefe = Darstellung). Die Totalschaden-Zonen-Logik
  (A/B/C) ist schuld-unabhaengig und bleibt identisch.

## Darstellung je Schuldform

Zentrale Render-Schicht: `AnspruchPositionsListe` + `AnspruchTotalschadenWege` + `AnspruchSummaryStep`
(und gespiegelt `AnspruchVorschauCard` in der SV-Fallakte). Alle lesen `spanne.schuld`.

- **`unverschuldet`:**
  - Gegner-gedeckte Positionen bleiben gruen "Gegnerversicherung".
  - **Anwaltskosten**-Zeile sichtbar ("Gegnerversicherung").
  - Prominente Kernzeile **"Ihre Eigenkosten: 0 EUR"** (der Pitch) — visuell hervorgehoben, nicht als
    stille Fusszeile. Kurzer Beleg: "Bei unverschuldetem Unfall zahlt die gegnerische Haftpflicht — auch Anwalt und Gutachter (Paragraph 249 BGB)."

- **`selbst`:**
  - **Nur der Fahrzeugschaden** (Reparatur bzw. WBW minus Restwert) gilt als gedeckt und wird umgelabelt zu
    **"Fahrzeugschaden (ueber Ihre Vollkasko, abzueglich Selbstbeteiligung)"**.
  - Alle anderen Positionen (Nutzungsausfall, Wertminderung, Anwalt, Gutachter, Auslagenpauschale, Abschlepp)
    werden **ausgegraut** mit "ueber die Kasko meist nicht" und **aus der Summe genommen**.
  - Die Summenzeile heisst **"Fahrzeugschaden ueber Ihre Vollkasko"** und zeigt die Fahrzeugschaden-Spanne
    (nicht den vollen Anspruch — das waere irrefuehrend, da die Kasko die uebrigen Posten nicht traegt).
  - Hinweis: "Ohne Vollkasko tragen Sie den Schaden selbst." **Keine "Gegnerversicherung"-Zeile.**
  - **Keine** "0 EUR"-Botschaft.

- **`teilschuld`:**
  - Wie `unverschuldet` (inkl. Anwaltskosten), aber die "0 EUR"-Botschaft wird ersetzt durch
    Hinweis "Bei Mitverschulden wird anteilig gekuerzt — die genaue Quote klaert Ihr Gutachter/Anwalt."

Die `AnspruchTotalschadenWege`-Komponente (beide Wege) erbt dasselbe Framing automatisch, da sie
`AnspruchPositionsListe` je Weg nutzt und `schuld` durchreicht.

## Persistenz + SV-Fallakte

- `speicherePositionen(..., schuld)` schreibt `anspruch_schaetzungen.schuld`.
- `actions.ts` (`berechneAnspruch`) reicht `spanne.schuld` an `speicherePositionen` weiter.
- `get-anspruch-vorschau-fuer-fall.ts` selektiert `schuld` und spreadet sie in die zurueckgegebene `spanne`.
- `AnspruchVorschauCard` zeigt dasselbe verzweigte Framing (Korrektheit auch fuer den SV — kein falsches
  "Gegnerversicherung" bei Kasko/Selbst).

## Nicht im Scope (YAGNI)

- Keine SB-/Quoten-Rechnung (Kernentscheidung).
- Kein neuer Wizard-Step.
- Kein `schuld`-Flow auf Lead/Claim (nur Session) — spaeteres Enhancement, wenn Regulierung es braucht.
- Kein Kilometerstand-Input (Aaron hat #2 der Roadmap uebersprungen).

## Betroffene Dateien

- `src/lib/anspruch/types.ts` — Schuldform, SchaetzInput.schuld, AnspruchSpanne.schuld, AnspruchPositionTyp += anwaltskosten.
- `src/lib/anspruch/positionen.ts` — schuld aufloesen + setzen, Anwaltskosten-Position bedingt.
- `src/app/embed/anspruch-pruefen/_components/AnspruchEinschaetzungStep.tsx` — Schuldfrage-Button-Gruppe (Pflicht, default unverschuldet).
- `src/app/embed/anspruch-pruefen/_components/AnspruchSummaryStep.tsx` — Verzweigung der Kernbotschaft; ersetzt den pauschalen Kasko-Hinweis.
- `src/components/shared/AnspruchPositionsListe.tsx` — Label/Ausgrauen je schuld, Anwaltskosten-Zeile.
- `src/components/shared/AnspruchTotalschadenWege.tsx` — schuld durchreichen (meist automatisch).
- `src/lib/anspruch/session.ts` — speicherePositionen(schuld).
- `src/app/embed/anspruch-pruefen/actions.ts` — schuld aus der Spanne persistieren; Vision-Wiring unveraendert.
- `src/lib/anspruch/get-anspruch-vorschau-fuer-fall.ts` — schuld lesen + spreaden.
- `src/app/gutachter/fall/[id]/_components/AnspruchVorschauCard.tsx` — Framing spiegeln.
- `supabase/migrations/<version>_anspruch_schaetzungen_schuld.sql` — additive Spalte.

## Testing

- **vitest** (`src/lib/anspruch/`): `berechneAnspruchsSpanne` — Anwaltskosten-Position erscheint bei
  unverschuldet + teilschuld, fehlt bei selbst; `spanne.schuld` korrekt gesetzt; Euro-Betraege identisch
  ueber alle 3 Schuldformen (Beweis: Tiefe = Darstellung).
- **Build/tsc** gruen; Token-Audit + Component-Set + Status-Ratchets 0 neu.
- **Prod-Smoke** (Playwright, nur Test-Accounts): je Schuldform die richtige Kernbotschaft
  (unverschuldet -> "0 EUR"; selbst -> "Vollkasko/Selbstbeteiligung", kein "Gegnerversicherung";
  teilschuld -> "anteilig gekuerzt").

## Akzeptanzkriterien

1. Angaben-Step hat eine Pflicht-Schuldfrage mit 3 Optionen, default unverschuldet.
2. Unverschuldet zeigt "Ihre Eigenkosten: 0 EUR" prominent + Anwaltskosten-Zeile.
3. Selbst zeigt "Vollkasko abzgl. Selbstbeteiligung", graut Gegner-Positionen aus, zeigt KEINE "Gegnerversicherung"-Zeile.
4. Teilschuld zeigt den vollen Anspruch + "anteilig gekuerzt, Quote klaert der Gutachter".
5. Beide Totalschaden-Wege + die SV-Fallakte-Vorschau erben das korrekte Framing.
6. Die **per-Position berechneten** Euro-Betraege sind ueber alle Schuldformen identisch (keine SB-/Quoten-Mathematik).
   Verzweigt wird nur die Darstellung: bei `selbst` reduziert sich die *angezeigte* Summe auf den gedeckten
   Fahrzeugschaden (Auswahl welche Positionen zaehlen), ohne die Positionsbetraege neu zu rechnen.
