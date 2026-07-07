# Nutzungsausfall im Reparaturfall — A–L-Klassentabelle + Altersabschlag

**Datum:** 2026-07-08 · **Status:** approved (Aaron) · **Scope:** Anspruchsprüfer (`/embed/anspruch-pruefen`)

## Ziel

Im Reparaturfall (kein wirtschaftlicher Totalschaden) kann der Kunde die **Nutzungsausfallentschädigung**
über die Reparaturdauer geltend machen — rückwirkend, nachdem das Fahrzeug nachweislich repariert wurde,
sofern er keinen Mietwagen nimmt. Die Entschädigung folgt der amtlichen **Nutzungsausfalltabelle A–L**
(fester Tagessatz je Klasse) mit **Altersabschlag**.

## Ausgangslage (Code)

- Nutzungsausfall existiert bereits (`src/lib/anspruch/positionen.ts` → `ersatzfahrzeugPosition`), aber:
  - wird **nur bei nicht-fahrbereitem** Fahrzeug berechnet (`if (!input.fahrbereit)`),
  - nutzt ein grobes **6er-Segment** mit Min/Max-Tagessatz (`nutzungsausfall_segment_saetze`),
  - kennt **keinen Altersabschlag** (Alter treibt heute nur die Wertminderung).
- Totalschaden-Erkennung ist da: WBW-Verhältnis ≥ 90 % → Totalschaden-Zone. Reparaturfall = **kein** Totalschaden.

## Entscheidungen (Aaron)

1. **Klassenbestimmung:** aus dem bestehenden KI-Segment ableiten (kein Vision-/Prompt-Umbau).
2. **Umfang:** reine Anzeige in der Einschätzung (kein Post-Reparatur-Antrags-Workflow).

## Tabelle (Tagessatz je Klasse, EUR/Tag)

A 23 · B 29 · C 35 · D 38 · E 43 · F 50 · G 59 · H 65 · J 79 · K 119 · L 175
(„I" wird wie in der amtlichen Tabelle ausgelassen.)

## Segment → Basisklasse

| Segment | Klasse | | Segment | Klasse |
|--|--|--|--|--|
| kleinwagen | B | | oberklasse | G |
| kompakt | C | | suv | J |
| mittelklasse | E | | transporter | G |

## Altersabschlag (geordnete Reihe A→L, Schritt Richtung A)

- Alter = aktuelles Jahr − Erstzulassung
- **> 5 Jahre → 1 Klasse runter**, **> 10 Jahre → 2 Klassen runter** (kumulativ, Minimum A)
- Bsp: Mittelklasse E → 6 J = D (38 €) → 12 J = C (35 €)

## Berechnung

- **Nutzungsausfall = Klassensatz(nach Abschlag) × Reparaturdauer[min,max]** (Dauer aus Schweregrad).
- **Entkoppelt von „fahrbereit"**: erscheint im Reparaturfall immer, wenn der Kunde „Nutzungsausfall" wählt.
  `fahrbereit` gated künftig nur noch die **Abschleppkosten**.
- **Mietwagen** bleibt segment-basiert (die Tabelle ist die NA-Entschädigung, nicht Mietwagen).
- Totalschaden-Weg: Wiederbeschaffungs-Nutzungsausfall ebenfalls klassenbasiert (Konsistenz).

## Datenmodell

- Neue Tabelle `nutzungsausfall_klasse_saetze (klasse text PK, euro_pro_tag numeric, bezeichnung, beispiele)`
  — via `apply_migration` (Regel 2), geseedet mit den 11 Sätzen. DB übersteuert die Code-Konstante.
- Kanonische Sätze + Mapping + Abschlagsregel als getypte Code-Konstanten in
  `src/lib/anspruch/nutzungsausfall-klasse.ts` (reine Logik, unit-getestet).

## UI

`AnspruchEinschaetzungStep`: Ersatzfahrzeug-Auswahl (Nutzungsausfall/Mietwagen/keins) wird **immer**
gezeigt (bisher nur bei „nicht fahrbereit"), Default „Nutzungsausfall".

## Rechtlicher Hinweis an der Position

„Klasse E · 43 €/Tag × 5–9 Tage. Rückwirkend nach nachgewiesener Reparatur geltend zu machen, sofern kein
Mietwagen genommen wird." + bei Abschlag „Fahrzeugalter berücksichtigt: Rückstufung um 1 Klasse."

## Nicht geändert

Vision-Prompt/Schema, Mietwagen-Reservierungs-Modul, Totalschaden-Zonen A/B/C, Darstellungs-Komponenten
(rendern Positionen generisch).

## Tests

Reine Logik (`nutzungsausfall-klasse.test.ts`): Mapping, Altersabschlag, Clamp bei A, „I"-Skip, DB-Override.
`positionen.test.ts`: NA-Satz je Klasse, NA auch bei fahrbereit, `keins` unterdrückt, Altersabschlag im Betrag,
Totalschaden-Weg-NA klassenbasiert. Bestehende Erwartungen entsprechend nachgezogen.
