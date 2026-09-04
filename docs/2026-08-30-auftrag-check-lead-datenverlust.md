# Auftrag: Anspruchsprüfung verliert die Qualifizierung — vier Befunde, prod-belegt

**Gefunden am 30.08.2026** an einem echten Lead (Ernest Sefa, Osnabrück, `claimondo-check`).
Alle Angaben sind auf prod gemessen, nicht hergeleitet. Referenz-IDs stehen dabei, damit du
jeden Befund selbst nachziehen kannst.

> ⚠ Es geht um **echte Kundendaten**. Nichts an diesem Lead ändern, ohne dass Aaron es sagt.
> Die Zuweisung ist bereits korrigiert (siehe unten) — der Rest ist strukturell.

---

## Operatives Soll (zuerst lesen, vor dem Code)

Ein Interessent füllt die Anspruchsprüfung aus: drei Fragen (Schuld, Frist, Gutachten-Status)
plus Name, Telefon, Stadt. Danach **soll** gelten:

1. Der Vorgang trägt **alles**, was der Kunde geantwortet hat — die Haftungsweiche
   (`schuldfrage`) ist die wichtigste einzelne Angabe im ganzen Geschäft.
2. Wer den Vorgang öffnet, sieht **welche Nachrichten an ihn rausgingen**.
3. Der Vorgang liegt bei jemandem, der ihn **auch bearbeitet**.

Heute erfüllt keiner der drei Punkte.

---

## Befund 1 — `convert_anfrage_zu_lead` liest den `payload` nie *(der Kern)*

Die Server-Action schreibt korrekt **alles** nach `anfragen`:

```jsonc
// anfragen 3612682f-1529-47a9-ad10-afce92c92e98
kontakt_plz_oder_stadt: "Osnabrück"
payload: { "check": { "schuld": "gegner", "gutachten": "versicherung", "unfall_her": "bis_monat" } }
```

Die DB-Funktion `public.convert_anfrage_zu_lead(uuid)` überträgt daraus aber **exakt sechs
Felder**:

```sql
INSERT INTO public.leads (vorname, nachname, telefon, email, kunde_plz, source_channel, status)
VALUES (…, v_anfrage.kontakt_plz_oder_stadt, v_anfrage.quelle, 'neu')
```

`v_anfrage.payload` kommt in der ganzen Funktion **nur in auskommentierten Blöcken** vor
(`gutachter-finder-termin`, `makler-partner-form` — beide deaktiviert). Für
`claimondo-check` gibt es keinen payload-Transfer.

**Ergebnis am echten Lead** (`5c39b0ac-914c-4662-9543-d7f524bdb581`):

| in `anfragen` | im Lead |
|---|---|
| `schuld: "gegner"` | `schuldfrage` = **NULL** |
| `gutachten: "versicherung"` | — existiert nirgends |
| `unfall_her: "bis_monat"` | `unfalldatum` = **NULL** |

⭐ **Warum das teuer ist:** `schuld = gegner` + `gutachten = versicherung` heißt „Haftpflichtfall,
und die gegnerische Versicherung will ihren eigenen Gutachter schicken". Das ist der wertvollste
**und** zeitkritischste Fall — und genau diese Einordnung fehlt im Vorgang.

**Zu klären, bevor du baust:** Die Zielfelder sind nicht 1:1 offensichtlich.
`schuld → leads.schuldfrage` ist klar (CHECK-Werte vorher gegen die DB prüfen — `gegner`/`teils`/
`unklar`/`selbst` müssen zum Constraint passen, sonst **stiller** Reject). Für `unfall_her`
(Zeitraum, kein Datum) und `gutachten` gibt es womöglich noch kein passendes Feld — dann ist die
ehrliche Lösung ein Feld anzulegen oder den Wert strukturiert abzulegen, **nicht** ihn in einen
Freitext zu quetschen.

⚠ **Regel 2:** Das ist eine DB-Funktion → Änderung nur per
`mcp__plugin_supabase_supabase__apply_migration`, danach `list_migrations`, und das committete
File **exakt** nach der getrackten Version benennen.

⚠ **Reichweite prüfen:** `convert_anfrage_zu_lead` bedient **alle** Quellen, die über `anfragen`
laufen — nicht nur `/check`. Ein Fix wirkt überall; entsprechend breiter testen.

---

## Befund 2 — die Stadt landet in `kunde_plz`, nicht am Unfallort

`kontakt_plz_oder_stadt: "Osnabrück"` → `leads.kunde_plz = "Osnabrück"`.
`unfallort`, `unfallort_ort`, `unfallort_plz` bleiben **NULL**.

Zwei Fragen, die du **vor** dem Fix beantworten musst — die Antwort ist nicht selbstverständlich:

* Fragt die Anspruchsprüfung nach dem **Unfallort** oder nach dem **Wohnort** des Kunden? Der
  Label-Text im Formular entscheidet das, nicht die Spalte.
* `kunde_plz` bekommt hier einen **Stadtnamen**, keine PLZ. Verträgt das jeder Konsument dieser
  Spalte? (Verwandter Vorfall: ein Feldname ist kein Formatvertrag.)

Wenn es der Unfallort ist, gehört er zusätzlich in `unfallort_ort` — sonst greift die
SV-Umkreissuche nicht.

---

## Befund 3 — Team-Benachrichtigungen tragen die `lead_id` des **Empfängers**

Um 20:12 gingen drei WhatsApps raus (alle `zugestellt`):

```
20:12:44 → 491775799941   (Kunde)  "Hier dein sicherer Login-Link …"   lead_id = NULL
20:12:45 → 4917620289514  (Team)   "🔔 Neuer Lead … Ernest Sefa …"     lead_id = 159eac57…
20:12:46 → 491633628571   (Team)   dieselbe Nachricht                  lead_id = f34c09ce…
```

Ernests Lead ist `5c39b0ac…`. Die beiden anderen IDs sind nachgeschlagen:

* `159eac57…` = Lead „Trst Namewn", Telefon **+4917620289514** — die Nummer des Empfängers
* `f34c09ce…` = Lead „Aaron Sprafke", Telefon **+491633628571** — ebenfalls der Empfänger

Das Muster ist eindeutig: die Notification schreibt den Lead **des Empfängers** statt den Lead,
über den sie informiert. Vermutlich wird der Empfänger über seine Telefonnummer aufgelöst und
dabei dessen Lead-Zuordnung mitgenommen.

**Wirkung:** Am Vorgang selbst sind **0 Nachrichten** protokolliert, obwohl drei rausgingen. Wer
den Lead öffnet, sieht keine Kommunikationsspur — und an zwei **fremden** Vorgängen hängen
Nachrichten, die nicht zu ihnen gehören.

Startpunkte: `claimondo-marketing/lib/leads/notify-new-lead.ts`, `src/lib/leads/notify-team-lead.ts`.

---

## Befund 4 — `flow_links.gesendet_am` wird nicht gesetzt, obwohl versendet wurde

```
flow_links f1c601218b63867a78f5b2c6001845e7
  gesendet_am     NULL       gesendet_kanal  NULL      gesendet_anzahl  0
  geoeffnet_am    20:13:13   status          geoeffnet
```

Die WhatsApp mit genau diesem Link ging um **20:12:44** raus und ist `zugestellt`. Die
Buchhaltung im FlowLink stimmt also nicht.

⭐ **Das ist kein Schönheitsfehler.** Ich bin bei der Diagnose selbst darauf hereingefallen und
habe zunächst „der Link wurde nie versendet" gemeldet — falsch. Wer künftig Zustellprobleme über
`gesendet_am` sucht, bekommt systematisch falsche Antworten. Auch der Reminder-/Nachfass-Pfad
dürfte auf dieses Feld schauen.

Startpunkt: `erzeugeUndSendeFlowLink` (`claimondo-marketing/lib/leads/flowlink-fuer-lead.ts`) —
der Aufruf ist non-fatal in `try/catch`, ein Fehler beim Setzen des Feldes bliebe still.

---

## Was bereits erledigt ist (nicht nochmal machen)

* Lead `5c39b0ac…` ist von `test-kb@claimondo.de` auf **Aaron Sprafke**
  (`d77310ab-cb6e-4553-98e9-5dffd42f2881`, `lupus.674music@gmail.com`) umgehängt — verifiziert.
* Der **Rückruf-Termin** (`4e1e0e1f-3515-4911-9983-83838940d817`, 31.08. 08:00 UTC = 10:00 Berlin)
  hängt **weiterhin am Testkonto**. Ein Umhängen auf Aaron scheitert am Trigger
  `gutachter_termine_validate_assignee`: bei `assignee_typ='kundenbetreuer'` muss das Zielprofil
  die Rolle `kundenbetreuer` haben, Aaron ist `admin`. **Der Trigger hat recht — nicht umgehen.**
  Das ist eine Entscheidung für Aaron, kein Code-Fix.

---

## Zwei Beobachtungen, die kein Code-Fix sind (Aaron vorlegen, nicht selbst entscheiden)

**A · Es gibt keinen aktiven Kundenbetreuer.** Auf prod existieren genau drei KB-Profile:

| Konto | Name | letzter Login |
|---|---|---|
| `test-kb@claimondo.de` | Test Kundenbetreuer | 30.08. |
| `aaron.sprafke+kb@claimondo.de` | Maik Neumann | 14.07. |
| `kb@claimondo.de` (ID `aa000001-0000-0000-0000-000000000001`) | Anna Weber | **nie** |

Eines ist ein Testkonto, eines läuft über Aarons Alias, eines ist an der ID erkennbar ein
Seed-Platzhalter. Dass ein Rückruf beim Testkonto landet, ist unter diesen Umständen kein
Zufallsfehler. ⚠ Ob die Zuweisung `aktiv`/`ist_aktiv` überhaupt filtert, ist noch **nicht**
geprüft — `pickRoundRobinDispatcher` tut es (Rolle `dispatch`, `aktiv=true`), aber der
KB-Termin entsteht auf einem anderen Pfad, den ich nicht gefunden habe. **Das ist die erste
offene Frage, wenn jemand hier weitermacht.**

**B · Osnabrück ist nicht abgedeckt.** Kein einziger Sachverständiger erreicht die Stadt mit
seinem Umkreis:

```
nächster SV überhaupt:   48157 Münster,  40 km — ist_aktiv = FALSE, Umkreis 25 km
nächster AKTIVER SV:     42853 Remscheid, 133 km, Umkreis 30 km
```

Der Lead ist also fachlich nicht bedienbar. Das ist eine Vertriebs-/Netzfrage, kein Bug.

---

## Reihenfolge

1. **Befund 1** — der einzige mit direktem Geschäftsverlust (die Haftungsweiche geht verloren).
2. **Befund 3** — ohne Kommunikationsspur am Vorgang ist jede Nachverfolgung blind, und zwei
   fremde Leads tragen falsche Nachrichten.
3. **Befund 4** — klein, aber er erzeugt Fehldiagnosen bei allen künftigen Zustellfragen.
4. **Befund 2** — erst nachdem die Semantik-Frage (Unfallort vs. Wohnort) geklärt ist.

## Nachweis (Regel 4)

Der Weg ist per Playwright **mit echter Eingabe** fahrbar: `claimondo.de/check` aufrufen, die
drei Fragen klicken, Name/Telefon/Stadt tippen, absenden — und danach in der DB prüfen, ob
`leads.schuldfrage` den geklickten Wert trägt.

⚠ **Das erzeugt einen echten Lead und löst echte WhatsApps aus** (Kunde + Team). Also mit einer
Test-Telefonnummer arbeiten und den entstandenen Lead hinterher wieder aufräumen — oder den
Nachweis vorher mit Aaron abstimmen.

⚠ **Zurücklesen dort, wo der Konsument liest.** Ein `HTTP 200` beweist nichts, und ein Blick in
`anfragen` beweist ebenfalls nichts — die Daten stehen dort ja bereits heute. Der Beweis ist der
Wert in **`leads`**.
