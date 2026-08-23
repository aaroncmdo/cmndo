# Gewinnspiel — operatives Soll (Regel 4, Schritt 1)

**Datum:** 2026-08-23
**Status:** ⚠ **Wartet auf Aaron-Abstimmung.** Erst danach wird der Smoke geschrieben.
**Branch:** `kitta/gewinnspiel-tankgutschein`

---

## Wozu dieses Dokument

Regel 4 verlangt das Soll **vor** dem Smoke, und zwar **aus der Fachlogik
hergeleitet, nicht aus dem Code gelesen**. Ein Smoke, der nur nachfährt, was der
Code ohnehin tut, bestätigt „Code tut, was Code tut" — eine Tautologie. Er würde
genau die Lücke verdecken, um die es geht: zwischen dem, was gebaut wurde, und
dem, was Geschäft und Nutzer brauchen.

Deshalb ist unten beschrieben, wie das Gewinnspiel **ablaufen soll**. Jede
Abweichung des Codes davon ist ein **Befund**, keine Seed-Hürde, um die man
herumbaut.

---

## Das Soll in Prosa

### A · Vorbereitung durch den Betreiber

1. Ein Admin legt eine Kampagne an: Name, Startdatum, wie viele Preise es pro
   Tag gibt und was ein Preis wert ist. Er aktiviert sie. **Es kann immer nur
   eine Kampagne aktiv sein** — sonst wäre unklar, an welchem Gewinnspiel jemand
   teilnimmt.
2. Er trägt mindestens zwei Gutschein-Arten in den Prämien-Katalog ein, damit
   Teilnehmer etwas zu wählen haben.
3. Solange keine Kampagne aktiv ist, passiert **nichts**: keine Teilnahmen, kein
   Hinweis in den Formularen, keine Werbung. Ein abgelaufenes oder pausiertes
   Gewinnspiel darf sich nirgends mehr zeigen.

### B · Ein Interessent nimmt teil

4. Jemand mit einem unverschuldeten Unfall kommt auf die Gewinnspielseite, sieht
   den Betrag und die wählbaren Gutscheine, trägt Namen und Mobilnummer ein,
   wählt einen Gutschein, bestätigt, dass der Unfall unverschuldet war, und
   erlaubt ausdrücklich den Rückruf. Er sendet ab.
5. **Er ist damit zweierlei:** ein Teilnehmer *und* ein regulärer Lead. Das Team
   sieht ihn in der Dispatch-Queue wie jeden anderen Interessenten und ruft an.
   Das Gewinnspiel ändert am Schadenprozess nichts.
6. Wer über einen **anderen** Weg meldet (Mini-Wizard, Gutachter-Finder) und
   dabei einen unverschuldeten Unfall und eine Mobilnummer angibt, nimmt
   **ebenfalls automatisch** teil — und wird an dieser Stelle sichtbar darauf
   hingewiesen.
7. **Wer nicht teilnimmt:** wer keine Mobilnummer hinterlässt (ohne sie ist
   weder Verifikation noch Benachrichtigung möglich), wer den Unfall selbst
   verursacht hat, und wer über ein SV-Embed kommt (die bleiben in Phase 1
   außen vor).
8. Dieselbe Person nimmt pro Kampagne **einmal** teil. Ein zweiter Kontakt mit
   derselben Nummer erzeugt keine zweite Chance.

### C · Bestätigung der Nummer

9. Der Betreiber stößt den Versand der Willkommens-Nachrichten an. Jeder neue
   Teilnehmer bekommt **genau eine** WhatsApp.
10. Erst wenn der Teilnehmer darauf antwortet, gilt seine Nummer als bestätigt
    und er ist **im Lostopf**. Eine eingetragene, aber nie bestätigte Nummer
    nimmt nicht an der Ziehung teil — sonst könnte jemand mit einer fremden
    Nummer gewinnen.

### D · Die tägliche Ziehung

11. Einmal täglich zieht der Betreiber. Gezogen wird **nur** aus den bestätigten
    Teilnahmen.
12. Es werden **bis zu** so viele Gewinner gezogen, wie die Kampagne Preise
    vorsieht. Sind weniger Teilnehmer da, gibt es entsprechend weniger Gewinner.
    Das ist der Normalfall, nicht die Ausnahme.
13. Ein zweiter Klick zieht dieselben Leute nicht noch einmal.
14. Niemand kann zweimal gewinnen, solange sein erster Gewinn nicht abgeschlossen
    ist.

### E · Gewinn einlösen

15. Der Gewinner wird über seine Mobilnummer benachrichtigt und bekommt einen
    persönlichen Link.
16. Dort lädt er einen Beleg für seinen unverschuldeten Unfallschaden hoch. Hat
    er bei der Teilnahme keinen Gutschein gewählt, holt er das hier nach.
17. Der Link funktioniert **einmal**. Wer ihn erneut öffnet, nachdem der Fall
    entschieden ist, sieht das und kein Formular mehr.

### F · Prüfung und Auszahlung

18. Der Betreiber sieht die offenen Nachweise in einer Liste, öffnet den Beleg
    und entscheidet.
19. **Bestätigt** er, trägt er den Gutschein-Code ein; der Gewinn gilt als
    versendet.
20. **Lehnt** er ab (kein Beleg, offensichtlich unpassend, Frist verstrichen),
    verfällt der Anspruch und es kann nachgezogen werden.
21. Jede Entscheidung ist nachvollziehbar: wer sie wann getroffen hat, und wie
    groß der Lostopf bei der Ziehung war.

---

## Was der Smoke daraus prüfen muss

| # | Schritt | Über welche Oberfläche |
|---|---|---|
| S1 | Kampagne anlegen und aktivieren | Admin-UI |
| S2 | Zwei Prämien anlegen | Admin-UI |
| S3 | Teilnahme über die LP mit Prämienwahl absenden | Landingpage |
| S4 | Teilnehmer erscheint als Lead **und** in den Kennzahlen | Dispatch + Admin-UI |
| S5 | Teilnahme ohne Telefonnummer entsteht **nicht** | Negativprobe |
| S6 | Teilnahme bei Eigenverschulden entsteht **nicht** | Negativprobe |
| S7 | Zweite Teilnahme mit derselben Nummer wird abgewiesen | Negativprobe |
| S8 | Ziehung bei leerem Lostopf meldet das ehrlich | Admin-UI |
| S9 | Ziehung mit bestätigter Teilnahme erzeugt Gewinner + Link | Admin-UI |
| S10 | Gewinner lädt Nachweis hoch | Gewinner-Seite |
| S11 | Bestätigen mit Code setzt den Status | Admin-UI |
| S12 | Ablehnen setzt den Status und gibt den Platz frei | Admin-UI |
| S13 | Nach Pausieren der Kampagne entstehen keine Teilnahmen mehr | Negativprobe |

**Alles per UI**, echte Klicks, keine per DB geseedeten Zustandsübergänge. Der
Seed ist nur für den Ausgangszustand erlaubt.

⚠ **Test-Konten mit `telefon = NULL`**, sonst gehen echte WhatsApp-Nachrichten
raus. Für S9/S10 braucht es eine Testnummer, die niemandem gehört — der
WhatsApp-Versand ist der einzige Schritt mit echtem Außenkontakt.

⚠ Die Ziehung schreibt auf **Prod**. Nach dem Smoke müssen die Testteilnahmen
entfernt werden; Smoke-Residue in Arbeitslisten ist hier ein bekanntes,
wiederkehrendes Problem.

---

## Offene Fragen an Aaron

1. **Punkt 14** („niemand gewinnt zweimal") ist meine Herleitung, keine
   festgelegte Regel. Soll ein bestätigter Gewinner in derselben Kampagne
   erneut in den Lostopf, oder ist er raus?
2. **Punkt 20:** Nach welcher Frist gilt ein Nachweis als nicht erbracht? Die
   Teilnahmebedingungen nennen aktuell **sieben Tage**.
3. **Punkt 12:** Nicht vergebene Preise — verfallen sie, oder wandern sie in den
   nächsten Tag?
