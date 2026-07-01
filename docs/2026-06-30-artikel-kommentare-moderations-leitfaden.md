# Moderations-Leitfaden — Artikel-Kommentare

**Stand:** 2026-06-30 · **Status:** Entwurf (final: Aaron/Anwalt) · **Bezug:** DPIA-Scoping `docs/2026-06-29-artikel-kommentare-dpia-scoping.md` (operationalisiert R1/R2/R7)

> Praktische Handreichung für die Moderation. **Keine Rechtsberatung** — unklare Rechtsfälle an Aaron/Anwalt eskalieren.

## Wo & womit

Moderiert wird unter **`/admin/kommentare`**. Zwei Sektionen:
- **Ausstehend** (`pending`) — vor Veröffentlichung. Nichts ist öffentlich, bis du freigibst.
- **Gemeldet** — bereits öffentliche Kommentare, die Nutzer über „Melden" markiert haben (`report_count > 0`, nach Anzahl sortiert).

Vier Aktionen:

| Aktion | Wirkung |
|---|---|
| **Freigeben** | Kommentar wird öffentlich (`approved`). |
| **Ablehnen** | Bleibt unsichtbar (`rejected`), verlässt die Queue. |
| **Verstecken** | Nimmt einen **bereits öffentlichen** Kommentar offline (`hidden`) — schnellster Takedown. |
| **Sperren** | Konto kann nicht mehr posten (`is_blocked`). |

Jede Moderation setzt `report_count` auf 0 zurück → erledigte Meldung verlässt die „Gemeldet"-Sektion.

## Grundsatz

Pre-Moderation heißt: **wir entscheiden, was öffentlich wird.** Inhalte sind nach Freigabe öffentlich, werden von Suchmaschinen indexiert und sind schwer zurückzuholen. **Im Zweifel ablehnen** — lieber konservativ.

## Immer ablehnen (Hard-Reject)

1. **Gesundheits-/Verletzungsdaten** (Art. 9 DSGVO) — über den Verfasser *oder* Dritte. Beispiele: „nach meinem Schleudertrauma…", „der Fahrer war betrunken". **Höchstes Risiko** (DPIA R1).
2. **Personenbezogene Daten Dritter** — Klarnamen, Kennzeichen, Adressen, Telefonnummern in Kombination mit identifizierenden Angaben.
3. **Namentliche Anschuldigungen / Schmähkritik** gegen Werkstatt, Gutachter, Versicherer oder einzelne Mitarbeitende (z. B. „Firma X betrügt"). Üble Nachrede / Persönlichkeitsrecht (DPIA R2).
4. **Konkreter Rechtsrat an Dritte** („du musst klagen", „lehne das Gutachten ab"). RDG-Risiko.
5. **Beleidigung, Hetze, Diskriminierung, Bedrohung,** strafbare Inhalte.
6. **Spam, Werbung, Affiliate;** Links von nicht freigeschalteten Konten (automatisch gesperrt — trotzdem prüfen).
7. **Identitätstäuschung** — Nutzername gibt Claimondo, einen Anwalt oder eine Behörde vor → ablehnen **und** Konto sperren (DPIA R7).

## Freigeben, wenn

Sachlich, respektvoll, kein Punkt der Hard-Reject-Liste. Eigene Erfahrung **ohne** Identifikation Dritter und **ohne** sensible Selbst-Daten; allgemeine Fragen; hilfreiche Hinweise.

## Grauzonen

- **Versicherer-/Werkstatt-Kritik:** sachlich-allgemein („die Regulierung hat lange gedauert") = ok. Konkrete Schmähung oder Tatsachenbehauptung gegen eine *benannte* Person/Firma = ablehnen.
- **Eigene Schadendetails:** vage („hatte einen Unfall") = ok. Medizinische oder finanzielle Details = ablehnen.
- **Anonyme Dritt-Erfahrung** ohne identifizierende Merkmale = meist ok.

## Gemeldete Kommentare (Notice-and-Takedown)

Bereits öffentlich → **priorisiert und zeitnah** prüfen (DSA/TMG: unverzüglich nach Kenntnis). Bei Verstoß **Verstecken** (sofort offline) oder **Ablehnen**. `report_count` zeigt die Anzahl Meldungen = Priorität (sagt nichts über die Berechtigung — selbst beurteilen).

## Sperren & trusted

- **Sperren** bei wiederholten oder groben Verstößen.
- Das **`trusted`-Flag** (erlaubt Links) nur an langjährig saubere Nutzer vergeben — sparsam.

## Betroffenenrechte / Datenschutz

- **Löschanfrage** eines Verfassers → Kommentar löschen.
- **Retention:** abgelehnte/alte Kommentare nach Frist löschen (Frist = Aaron/DSE; automatischer Cleanup geplant).
- Entscheidungen sind getrackt (`moderated_at` / `moderated_by`).

## Eskalation

Unklare Rechtsfälle (Persönlichkeitsrecht, mögliche Straftat, Presserecht) → **Aaron/Anwalt**, nicht selbst entscheiden.
