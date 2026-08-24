# DURCHSPRACHE · Pflichttermin vor dem ersten Mailversand

**Diese Datei ist Teil der Spezifikation, nicht ein Anhang dazu.**

Die Cold-Mail-Sequenz für Sachverständige wird gebaut, aber **nicht scharfgeschaltet**. Zwischen
„fertig implementiert" und „die erste Mail geht raus" steht ein Termin, an dem die Sequenz einmal
vollständig durchgegangen wird — Mail für Mail, Satz für Satz.

**Claude Code darf `cold_mail_sequenzen.aktiv` und `auto_enroll` nicht auf `true` setzen.**
Beide bleiben `false`. Das Umlegen ist ein Menschenklick nach diesem Termin. Ein Wellenabschluss,
der diese Schalter auf `true` findet, gilt als nicht bestanden.

---

## Warum ein eigener Termin

Drei Dinge lassen sich nicht aus einer Spec ableiten, weil sie unternehmerische Entscheidungen sind:

1. **Ob überhaupt gemailt wird.** § 7 Abs. 2 UWG untersagt werbliche E-Mail ohne vorherige
   ausdrückliche Einwilligung, auch zwischen Unternehmen. Die Ausnahme in § 7 Abs. 3 setzt eine
   bestehende Kundenbeziehung voraus — die es bei diesen 62 Kontakten nicht gibt. Das ist ein
   reales Abmahnrisiko. *Hinweis, keine Rechtsberatung.*
2. **Was drinsteht.** Der Ton entscheidet, ob ein Sachverständiger antwortet oder sich ärgert. Das
   ist kein Textbaustein, den ein Modell allein festlegen sollte.
3. **Wie hart gemessen wird.** Ein Befund über die Website eines Fremden, unaufgefordert
   zugeschickt, kann als Hilfe oder als Angriff ankommen. Der Unterschied liegt in der Formulierung.

---

## Tagesordnung

### 1 · Die rechtliche Grundentscheidung — zuerst, sonst ist der Rest gegenstandslos

| Zu klären | Möglichkeiten |
|---|---|
| Wird kalt gemailt? | ja mit bewusstem Risiko · nein · nur nach Erstkontakt über einen anderen Kanal |
| Anwaltlich geprüft? | wer, bis wann |
| Alternativer Erstkontakt? | Telefon, Post, Messe, Verband, Empfehlung |
| Herkunftsangabe nach Art. 14 DSGVO | Wortlaut festlegen |

**Wenn hier „nein" steht, endet der Termin.** Die Mechanik bleibt gebaut und ungenutzt, die
Anreicherung und der Massenlauf laufen trotzdem — sie sind unabhängig vom Versandweg.

### 2 · Der Absender

Festgelegt am 16.08.2026: **`aaron@sv-levelup.claimondo.de`**, Anzeigename **Aaron Sprafke**,
Antwortadresse identisch.

Zu bestätigen: Domain in Resend verifiziert, SPF, DKIM, DMARC gesetzt, Warmup geplant.
Zu klären: Wer liest die Antworten, und in welcher Frist wird geantwortet? Eine unbeantwortete
Antwort auf eine Kaltmail ist schlimmer als keine Kaltmail.

### 3 · Die vier Mails, Satz für Satz

Für jede Mail durchgehen:

- Betreff — und der Ersatzbetreff für Schritt 2
- Anrede: Person oder Firma? Bei den Leads ohne Vornamen: was steht dann da?
- Der eine Messwert, der genannt wird — **welcher, und wie belegt**
- Was **nicht** drinsteht: kein Score bei Teilbefund, keine Auftragsprognose, kein Wettbewerber
  mit Namen, kein Preis
- Die Herkunftsangabe: Wortlaut
- Der Abmeldelink: Position und Beschriftung
- Die Frage am Schluss — eine, nicht drei

### 4 · Was die Mail über den Befund sagen darf

**Der Kern des Termins.** Der Massenlauf misst nur fünf von dreizehn Modulen (CONTRACT F-17).
Zehn Module bleiben unerhoben, weil die Zugänge fehlen. Damit gilt:

| Erlaubt | Verboten |
|---|---|
| „Auf Ihrer Startseite steht § 249 BGB nicht." | „Ihr Sichtbarkeits-Score liegt bei 31 von 100." |
| „In drei von fünfzehn Verzeichnissen sind Sie nicht eingetragen." | „Sie sind schlechter als Ihre Wettbewerber." |
| „Ihre Seite braucht 4,2 Sekunden bis zum ersten Inhalt." | „Sie verlieren dadurch X Aufträge im Monat." |
| „Was wir nicht geprüft haben: Ihr Google-Profil." | Schweigen über das Ungeprüfte |

Regel A und Regel B gelten in einer Mail an einen Fremden **härter** als im Produkt, nicht
lockerer.

### 5 · Zeitplan und Menge

- Startmenge: wie viele in der ersten Woche? Vorschlag 10, nicht 62
- Versandfenster: werktags 9–17 Uhr, Europe/Berlin
- Abbruchschwelle: ab welcher Bounce- oder Beschwerdequote wird gestoppt?
- Wer schaut nach dem ersten Lauf drauf, und wann?

### 6 · Der Weg nach der Antwort

- Antwort kommt → Enrollment auf `geantwortet`, wer übernimmt?
- Wird der Präsentationslink mitgeschickt oder erst im Gespräch gezeigt?
- Ab wann wird aus dem Lead ein Termin, ab wann eine Konvertierung
  (`sv_leads.konvertiert_zu_sv_id`)?

---

## Abnahme

Der Termin gilt als erledigt, wenn:

- [ ] die rechtliche Grundentscheidung schriftlich festgehalten ist
- [ ] alle vier Vorlagen im Wortlaut freigegeben sind
- [ ] die Herkunftsangabe und der Abmeldelink in jeder Vorlage stehen
- [ ] die Startmenge und die Abbruchschwelle festgelegt sind
- [ ] benannt ist, wer Antworten liest
- [ ] jemand mit Namen `aktiv = true` gesetzt hat — nicht der Code

**Datum:** ____________  **Anwesend:** ____________
