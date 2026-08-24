# SV-LevelUp P3c — die Umfeld-Module (verz, zuweiser, nach)

> **Für agentische Arbeiter:** PFLICHT-SUB-SKILL: `superpowers:executing-plans`.

**Ziel:** Der Check kommt über die Teilbefund-Schwelle. Heute sind 74 Punkte erhebbar, nötig sind 75 — jeder Nutzer sieht deshalb „Teilbefund" statt eines Gesamtwerts. Mit diesen drei Modulen sind es 104.

**Aufbau:** Drei Messmodule nach dem etablierten Vertrag. Keine neuen Fremdzugriffe: alle drei messen aus der Website und dem bereits geholten Places-Profil.

## Weltweite Vorgaben

Wie in P3b — R-A (Quelle + Zeitpunkt), R-B (`nichtErhoben` statt 0), R-F1/F2 (keine Google-SERP), R-G (robots.txt über `hole`), Ampel über `ampelFuer`, Umlaute in allen nutzersichtbaren Texten, Punktzahl == Registry (`verz: 12`, `zuweiser: 10`, `nach: 8`), Anwendungsschutz über `istClientseitig`.

## Der Ausgangsbefund

Gemessen am 19.08. im Durchlauf gegen einen echten Betrieb:

| | erhebbar | Schwelle |
|---|---|---|
| heute (5 Module) | **74** | 75 → **kein Gesamtwert** |
| mit P3c (8 Module) | **104** | 75 → Gesamtwert erscheint |

⚠ Die 74 sind kein Zufall: `wett.dynamik` (2 P) ist beim Erstcheck nie messbar, und ohne Website fallen weitere 36 weg. Die Schwelle ist bewusst hoch (Aaron-Beschluss: die Hälfte der 150) — ein Score auf halber Datenbasis sieht aus wie eine Messung und ist keine. Der Weg darüber führt über mehr messbare Module, nicht über eine niedrigere Schwelle.

---

### Aufgabe 1: Modul `verz` — Firmendaten stimmen überein (12 Punkte)

**Was es misst.** Nicht „steht der Betrieb in Verzeichnissen" — das ließe sich nur durch Abfragen fremder Portale klären, und dafür fehlt jede API. Stattdessen die Wurzel, aus der Verzeichniseinträge entstehen: **Stimmen Name, Adresse und Telefonnummer auf der Website mit dem Google-Profil überein?**

Widersprüchliche Firmendaten sind der häufigste Grund, warum ein Betrieb in der örtlichen Suche schlechter läuft, als er sollte — Google kann zwei Adressen nicht zu einem Betrieb zusammenführen. Das ist messbar, ohne einen fremden Server anzufassen.

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/module/verz.ts`
- Ändern: `sv-levelup/lib/levelup/module/index.ts`, `massnahmen.ts`
- Test: `sv-levelup/lib/levelup/module/__tests__/verz.test.ts`

**Punktverteilung — BESCHLUSS:**
```
adresse_da        3   Adresse überhaupt auf der Website auffindbar
adresse_gleich    4   stimmt mit dem Google-Profil überein (Straße + PLZ)
telefon_gleich    3   Nummer stimmt überein (auf Ziffern normalisiert)
name_gleich       2   Firmenname stimmt im Kern überein
                 ---
                 12
```

⚠ `verz` steht in der Registry mit `braucht: null`, misst aber gegen das Places-Profil. Das ist kein Widerspruch: ohne Profil (kein Firmenname, Betrieb nicht auffindbar) bleiben die drei Vergleichskriterien `nichtErhoben` mit Grund, und `adresse_da` misst weiter. Die Registry ist Vertrag und wird nicht geändert.

- [ ] **Schritt 1: Test schreiben** — Fälle: alles stimmt (12/12) · Adresse weicht ab · Telefon in anderer Schreibweise (`0251/30179898` vs `0251 30179898` → gilt als gleich) · kein Profil (drei Fehlstellen, `adresse_da` misst) · Anwendung (alles nicht erhoben) · keine Website (Modul-Fehlstelle)

- [ ] **Schritt 2: Rot bestätigen** — `npx vitest run lib/levelup/module/__tests__/verz.test.ts`

- [ ] **Schritt 3: Umsetzen.** Kernstücke:

```ts
/** Nur Ziffern — „0251/30 17 98" und „+49 251 30179898" sind dieselbe Nummer. */
export function nurZiffern(s: string): string {
  const z = s.replace(/\D/g, '')
  // Landesvorwahl auf die nationale Form bringen, sonst vergleicht man 49… mit 0…
  return z.startsWith('49') ? `0${z.slice(2)}` : z
}

/** Vergleicht die letzten Stellen — Durchwahlen und Schreibweisen weichen oft ab. */
function gleicheNummer(a: string, b: string): boolean {
  const x = nurZiffern(a), y = nurZiffern(b)
  if (x.length < 6 || y.length < 6) return false
  return x === y || x.endsWith(y) || y.endsWith(x)
}

/** Straße und Postleitzahl aus einer Adresszeile. */
export function adressTeile(s: string): { plz: string | null; strasse: string | null } {
  const plz = s.match(/\b(\d{5})\b/)?.[1] ?? null
  const strasse = s.match(/([A-Za-zÄÖÜäöüß.\- ]{3,40}(?:straße|strasse|str\.|weg|platz|allee|ring|damm|gasse))\s*(\d+\s*[a-zA-Z]?)/i)
  return { plz, strasse: strasse ? `${strasse[1].trim()} ${strasse[2].trim()}` : null }
}
```

Die Website-Adresse kommt aus `sichtbarerText(html)`, die Profil-Adresse aus `Profil.adresse`. Verglichen wird auf normalisierten Teilen, nie auf ganzen Zeichenketten.

- [ ] **Schritt 4: Grün + Registry + Vorlagen** — vier neue Einträge in `VORLAGEN`; der Vorlagen-Test verlangt sie ohnehin.

- [ ] **Schritt 5: Gegen echte Seiten messen** und die Ausgabe lesen. Erwartung bei `stanoksei.de`: Adresse steht im Impressum, sollte übereinstimmen. Weicht etwas ab, erst prüfen, ob der Befund stimmt, bevor er als Mangel gilt.

- [ ] **Schritt 6: Festschreiben**

---

### Aufgabe 2: Modul `zuweiser` — spricht die Website Zuweiser an? (10 Punkte)

**Was es misst.** Ein Sachverständiger lebt von Zuweisern: Werkstätten, Anwälte, Autohäuser. Wie viele es im Umkreis gibt, ist Marktbild (0 Punkte, nur Einordnung) — eine Marktgröße ist keine Leistung. Gewertet wird, ob die Website diese Gruppen **überhaupt anspricht**.

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/module/zuweiser.ts`
- Ändern: `index.ts`, `massnahmen.ts`
- Test: `__tests__/zuweiser.test.ts`

**Punktverteilung — BESCHLUSS:**
```
potenzial      0   Zahl der Werkstätten/Anwälte im 25-km-Umkreis (nur Einordnung)
werkstatt      4   Website spricht Werkstätten an
anwalt         3   Website spricht Rechtsanwälte an
partnerseite   3   eigene Seite/Abschnitt für Kooperationen
              ---
              10
```

Erkennung über Wortfelder im sichtbaren Text (`werkstatt`, `karosseriebau`, `autohaus` / `rechtsanwalt`, `kanzlei`, `anwaltskanzlei` / `partner`, `kooperation`, `für werkstätten`, `zusammenarbeit`).

⚠ Das Marktbild braucht **zwei** Places-Abfragen (`suchUmkreis` für Werkstätten und für Anwaltskanzleien). Beide zusammen in einem `try` — schlägt eine fehl, ist das Marktbild eine Fehlstelle, die drei Wertungen laufen weiter, weil sie nur die Website brauchen.

- [ ] **Schritt 1: Test schreiben** — volle Punktzahl · Website ohne Zuweiser-Ansprache · Places-Fehler (Marktbild fehlt, Rest misst) · Anwendung · keine Website
- [ ] **Schritt 2: Rot bestätigen**
- [ ] **Schritt 3: Umsetzen**
- [ ] **Schritt 4: Grün + Registry + Vorlagen**
- [ ] **Schritt 5: Gegen echte Seiten messen**
- [ ] **Schritt 6: Festschreiben**

---

### Aufgabe 3: Modul `nach` — beantwortet die Website die Fragen der Geschädigten? (8 Punkte)

**Was es misst.** Longtail heißt: Menschen tippen ganze Fragen. „Wer zahlt das Gutachten bei unverschuldetem Unfall", „Was ist eine Wertminderung", „Wie lange dauert ein Gutachten". Wer diese Fragen auf seiner Seite beantwortet, wird zu ihnen gefunden — ohne ein einziges Werbebudget.

Ein Keyword-Tool braucht es dafür nicht (das wäre `kwg`, gesperrt bis A-6). Gemessen wird, **welche der acht wiederkehrenden Themen** die Seite abdeckt.

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/module/nach.ts`
- Ändern: `index.ts`, `massnahmen.ts`
- Test: `__tests__/nach.test.ts`

**Punktverteilung — BESCHLUSS: acht Themen zu je einem Punkt.**

| Thema | Wortfeld |
|---|---|
| Kostenübernahme | „wer zahlt", „kostenlos", „Haftpflicht des Unfallgegners" |
| Wertminderung | „Wertminderung", „merkantile" |
| Nutzungsausfall | „Nutzungsausfall", „Mietwagen" |
| Restwert | „Restwert", „Wiederbeschaffungswert" |
| Ablauf/Dauer | „Ablauf", „wie lange", „innerhalb von" |
| Freie Wahl | „freie Wahl", „Sie bestimmen", „Versicherung darf nicht" |
| Reparatur vs. Totalschaden | „Totalschaden", „130 %", „Reparaturkosten" |
| Kaskoschaden | „Kasko", „Teilkasko", „Vollkasko" |

⚠ Ein Thema gilt als abgedeckt, wenn **mindestens zwei** Begriffe seines Feldes vorkommen oder einer davon in einer Überschrift steht. Ein einzelnes Wort im Fließtext ist keine Antwort auf eine Frage — sonst zählt „Kasko" in einer Aufzählung als behandeltes Thema.

- [ ] **Schritt 1: Test schreiben** — inklusive des Falls „einzelnes Wort zählt nicht"
- [ ] **Schritt 2: Rot bestätigen**
- [ ] **Schritt 3: Umsetzen**
- [ ] **Schritt 4: Grün + Registry + Vorlagen** (eine Vorlage je Thema wäre zu kleinteilig — **eine** Vorlage „Fehlende Themen ergänzen" mit der Liste der fehlenden im Text)
- [ ] **Schritt 5: Gegen echte Seiten messen**
- [ ] **Schritt 6: Festschreiben**

---

### Aufgabe 4: Durchlauf über die ganze Kette

- [ ] **Schritt 1: Bauen und Standalone starten** (`node .next/standalone/server.js` — `next start` arbeitet nicht mit `output: standalone`; erst den alten Prozess auf dem Port beenden, sonst blockiert er `.next` und der Build bricht mit einer Dateisperre ab, die wie ein Codefehler aussieht)
- [ ] **Schritt 2: Kette über die Oberfläche** — Weg „bestand", echter Betrieb, alle Module
- [ ] **Schritt 3: Den Befund lesen, nicht zählen.** Jede Aussage gegen die echte Seite prüfen. Was die Seite sichtbar hat und das Modul bestreitet, ist ein Fehler des Moduls.
- [ ] **Schritt 4: Erhebbare Punkte prüfen** — müssen jetzt über 75 liegen, also erscheint ein Gesamtwert statt „Teilbefund".
- [ ] **Schritt 5:** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

---

## Selbstprüfung des Plans

**Deckung:** Die drei letzten Module, die ohne Aarons Konten messbar sind. Danach sind 106 der 150 Punkte gebaut; die verbleibenden 44 (`gsc` 12, `ads` 10, `kwg` 14, `kwm` 8) hängen an A-6 bzw. an einer Search-Console-Freigabe des Sachverständigen. Die sechs Module ohne Punktwertung (`ortsseiten`, `markt`, `nische`, `volumen`, `gebiet`) liefern Einordnung statt Punkten und gehören in einen eigenen Block.

**Platzhalter:** Die Aufgaben 2 und 3 führen die Schritte knapper als P3b, weil das Muster steht (Test → rot → bauen → Registry → echte Messung → Commit). Punktverteilung, Wortfelder und Fallunterscheidungen sind vollständig ausgeschrieben.

**Typen:** alle drei liefern `Messergebnis`; `verz` und `zuweiser` nehmen zusätzlich `firmenname`, weil sie das eigene Profil brauchen — dieselbe Signatur wie `gbp` und `wett`.

**Was dieser Plan bewusst NICHT tut:** fremde Branchenverzeichnisse abfragen. Ohne API bliebe nur Auslesen der Portalseiten, und dafür gibt weder deren robots.txt noch R-G Deckung. Der Befund misst deshalb die Datenbasis, aus der Verzeichniseinträge entstehen — und sagt das im Modultitel.
