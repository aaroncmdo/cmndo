# Kasko-Werkstattbindung, Phase 2: Die Anspruchsprüfung kennt die Bindung

**Status:** Entschieden von Aaron am 05.09.2026, 15:30 Uhr (im Gespräch): **D1 = A + C** (ehrlich sagen, im FlowLink fragen, API ausbauen) · **D2 ja** (durchreichen + Dispatch) · **D3 ja** (Quiz-Texte, 6 Sprachen) · **D4 ja** (Foto-Check-CTA bei Kasko) · **D5 = alles drei** (Parameter, Namens-Lookup, eigener Endpunkt) · **D6 ja** (Widerspruch + Hinweis) · **D7 = Phase 2** für die API-Doku. Zusätzlich beschlossen: eine Abnahme-Mailbox `abnahme@claimondo.de` für den Nachweis von Kunden-Mails (eigener PR, Infrastruktur für alle Lanes). Umsetzung nach Plan `docs/superpowers/plans/2026-09-05-kasko-wb-phase2-anspruchspruefung.md`.
**Grundlage:** Phase 1 (#5857 auf prod, Nachbesserung #5864), Aarons Auftrag („Die Information soll auch die Anspruchsprüfung berücksichtigen", Entscheidung E4: Phase 2 = Anspruchsprüfung), zwei Code-Scans vom 05.09. (Check-Quiz + Konversion; Berater-API + Foto-Tool) und Prod-Reads.
**Vorgänger:** `docs/superpowers/specs/2026-09-04-werkstattbindung-kasko-tarife-design.md` (Datenmodell, Ableitung, Entscheidungen E1–E7).

---

## 1 · Ausgangslage: drei Anspruchsprüfungen, ein blinder Fleck

Claimondo prüft den Anspruch an drei Stellen. Alle drei kennen „Ich war schuld", keine kennt die Werkstattbindung.

| Oberfläche | Eingang | Was heute bei Eigenverschulden passiert | Lücke |
|---|---|---|---|
| **`/check`-Quiz** (Marketing, 6 Sprachen) | anonym, 3 Fragen | `schuld=selbst` → Tier `kasko` → Ergebnistext „Koordination mit der **Partnerwerkstatt**, Reparatur in Ihrem Sinne" (`de.json:90`, in allen 6 Locales). Lead-Formular → `anfragen` → RPC `convert_anfrage_zu_lead`. | Verspricht jedem Kasko-Klicker eine Werkstatt. **Befund 4, live bestätigt:** die Whitelist der Konversion kennt `selbst` nicht → `leads.schuldfrage` bleibt **NULL** (1 von 1 `selbst`-Einreichung auf prod). Der Lead kommt als „Schuld offen" in die App, nicht als Kasko-Lead. Das Tier steht nur in `auswertung_unverbindlich`, einer Spalte mit **0 Code-Lesern**, die den Claim nicht erreicht (obwohl ihr Kommentar es behauptet). |
| **Berater-API** `GET /api/v1/pruefe-anspruch` (LLMs, GEO) | anonym, statisch | `schuldfrage=selbst` + `vollkasko=ja` → `abrechnungsweg=kasko` + Text `NAECHSTER_SCHRITT_KASKO`: „Erster Schritt ist die Werkstatt … **Partner-Werkstätten finden**: https://claimondo.de/werkstatt-finden" | `vollkasko` ist binär, es gibt keinen Parameter für Versicherer, Tarif oder Bindung. Der Text empfiehlt die Partnerwerkstatt **vorbehaltlos**, auch für gebundene Tarife. Kein Test des Kasko-Zweigs. |
| **Foto-Tool** `/embed/anspruch-pruefen` | anonym, aus dem Quiz (`?schuld=`) oder direkt | `selbst` → Positionen „über Ihre Vollkasko", Botschaft „Regulierung über Ihre Kasko" | Keine Frage nach Versicherer oder Tarif. **Zwei Texte widersprechen sich im selben Render:** `darstellung.ts:47` setzt Vollkasko voraus, `:83` verneint sie. Kasko-Daten hätten **keinen Transportweg** zum Lead (Handoff-Allowlist, Finder-Anfrage und FlowLink-Carry-over übertragen weder Schuld noch Kasko). `promoteSessionAufLead` ist toter Code. |
| **GEO** `llms.txt` / `llms-full.txt` | LLM-Crawler | Stellt die Vollkasko-Rückfrage bereits bedingt, nennt „Werkstatt vor Gutachter". | Der Begriff **Werkstattbindung** kommt nicht vor. Nebenbefunde: Zeile 227 verspricht Werkstatt**namen**, die die Route bewusst nicht liefert; Zeile 490 nennt „6 Endpunkte" bei 9 dokumentierten Pfaden. |

**Mengengerüst (prod, 05.09.):** `anfragen` mit Quelle `claimondo-check`: **2 Zeilen** (gegner 1, selbst 1). Das Quiz ist heute kein Volumenkanal. API-Aufrufe und Foto-Tool-Sitzungen sind nicht gemessen (kein Log-Consumer, siehe Abschnitt 9). Das begrenzt, wie viel Bau sich lohnt.

## 2 · Operatives Soll (vor dem Bau, Regel 4/5)

Wer über eine Anspruchsprüfung mit „Ich war schuld" hereinkommt, soll

1. **keine Werkstatt-Zusage** bekommen, die sein Tarif verbietet, sondern die ehrliche Aussage: ob wir eine Werkstatt vermitteln dürfen, hängt vom Tarif ab, und wir prüfen das mit ihm;
2. die **Tariffrage genau einmal** gestellt bekommen, dort, wo er sie beantworten kann, und nicht in einem anonymen Drei-Fragen-Quiz zwischen Tür und Angel;
3. als **Kasko-Lead** in der App ankommen (`schuldfrage=eigenverantwortung`), so dass die Phase-1-Strecke greift: Versicherungsfrage, Tariffrage, Gate für gebundene Kunden, Dispatch-Badges, Korrektur durch den Dispatcher.

Ein LLM, das die Berater-API fragt, soll die Bindung **als Faktum** bekommen (wenn Versicherer und Tarif bekannt sind) oder **die Rückfrage** (wenn nicht), nie eine Partnerwerkstatt als Standardempfehlung für gebundene Tarife.

**Matrix Eingänge × Rollen für die Abnahme** (Regel 5): Quiz anonym → Lead → Dispatch-Liste → FlowLink des Kunden (Tariffrage, Gate) → Dispatcher-Korrektur; API als LLM (frei / gebunden / unbekannt / mit Versicherer+Tarif); Foto-Tool → Summary → Gutachter-Finder-Handoff; jeweils bis zum Folgezustand in `leads`/`claims` und in der Nachbar-Sicht (Dispatch).

## 3 · Grundsatzentscheidung: Wo wird nach dem Tarif gefragt?

**Option A: „Ehrlich sagen, im FlowLink fragen."** Die Anspruchsprüfungen kennen die Bindung als Möglichkeit und sagen das, stellen die Tariffrage aber nicht selbst. Sie liefern den Lead **korrekt** in die Phase-1-Strecke, wo die Frage schon gebaut, getestet und auf prod abgenommen ist. Keine neue UI-Komponente im Marketing-Build, kein neuer Datenfluss.
Aufwand: klein. Risiko: die Aussage im Quiz bleibt allgemein („hängt vom Tarif ab").

**Option B: „Tariffrage überall."** Das Quiz bekommt bedingte Folgefragen (Versicherer, Tarif, Marker) hinter `selbst`; das Foto-Tool ebenso. Nötig: eine Combobox im Marketing-Build (existiert dort nicht, nur `GooglePlaceAutocomplete` und drei native `<select>`), Lesezugriff auf die Wissensbasis (anon reicht, Policy + Grant sind gesetzt), sechs Locales, `payload.check` erweitern, die Konversion schreibt Marke/Tarif/Bindung, der Lead kommt **vorbelegt** gebunden an und landet im Gate. Für das Foto-Tool zusätzlich vier Transportstellen plus eine Spalte auf `anspruch_schaetzungen`.
Aufwand: groß. Nutzen bei einer Einreichung pro Monat: nicht belegbar. Bindende Entscheidung hinter drei Klicks in einem Quiz, das keinen Zurück-Pfad für Folgefragen kennt: genau der Fehlklick, gegen den Phase 1 den Bestätigungsschritt gebraucht hat.

**Option C: „API-first."** Wie A, plus: die Berater-API nimmt `versicherer` und `tarif` als Namen an, schlägt sie in der Wissensbasis nach und antwortet mit der Bindung; ein eigener Lookup-Endpunkt macht die Wissensbasis für LLMs abfragbar. Das ist der Kanal, in dem ein Kunde die Frage ohnehin stellt („mein Tarif heißt X, darf ich zu meiner Werkstatt?").

**Empfehlung: A + C.** B bleibt als Phase 2b möglich, wenn das Quiz Volumen bekommt (Abschnitt 9).

## 4 · Bausteine bei A + C

### 4.1 Konversion reparieren (DB, Migration über das Plugin)

`convert_anfrage_zu_lead` mappt `selbst` → `eigenverantwortung` (bisher `ELSE NULL`). Wirkung: `leads.schuldfrage` ist korrekt; im FlowLink ist `quali_offen` wahr (Versicherungsfrage fehlt) → Versicherungsfrage → Szenario `kasko` oder `selbstzahler` → Tariffrage bzw. Werkstatt-Strecke. Zusätzlich eine Notiz wie beim Teilschuld-Fall („Anspruchsprüfung: Eigenverschulden angegeben, Tier Kasko"), damit der Dispatcher den Ursprung sieht.
Wirkt **sofort** nach dem Applizieren, unabhängig vom Deploy (Config-Migration-Regel). Harmlos: mehr korrekte Leads, kein Code-Pfad ändert sich.
Nachweis: `execute_sql`-Read der Funktion vorher/nachher; Prod-Smoke `/check` mit `selbst` → Lead trägt `eigenverantwortung`; FlowLink des Leads zeigt die Versicherungsfrage.

### 4.2 `auswertung_unverbindlich` (Entscheidung D2)

(a) **Durchreichen und lesen:** im Konverter `claimsInsert.auswertung_unverbindlich = lead.auswertung_unverbindlich` (der Kommentar der Spalte verspricht es), im Dispatch-Lead-Detail ein kleiner Block „Anspruchsprüfung: Tier kasko, Antworten: Schuld selbst, Unfall unter einer Woche, Gutachten nein". Der Dispatcher sieht, was der Kunde vorher angegeben hat.
(b) **Audit-only deklarieren:** Kommentar korrigieren, keine Anzeige.
Empfehlung: (a), klein und macht die Spalte ehrlich.

### 4.3 Quiz-Texte für Tier `kasko` (6 Locales, Entscheidung D3)

Vorschlag (deutsch; die fünf Übersetzungen ziehe ich nach):

| Key | heute | Vorschlag |
|---|---|---|
| `result_kasko_sub` | „Gegen den Gegner besteht kein Anspruch – aber über Ihre Kaskoversicherung regeln wir Gutachten, Werkstatt und Abwicklung für Sie." | „Gegen einen Gegner besteht kein Anspruch. Über Ihre Kaskoversicherung regeln wir die Abwicklung mit Ihnen – welche Werkstatt reparieren darf, hängt von Ihrem Tarif ab." |
| `ent_kasko_werkstatt_d` | „Koordination mit der Partnerwerkstatt, Reparatur in Ihrem Sinne" | „Wir prüfen mit Ihnen, ob Ihr Tarif eine Werkstatt vorschreibt (Werkstattbindung). Wenn nicht, reparieren Sie, wo Sie wollen." |
| neu `insight_kasko_werkstattbindung` | – | „Tarife mit Werkstattbindung sind günstiger, dafür benennt die Versicherung die Werkstatt. Ob Ihr Tarif dazugehört, steht auf dem Versicherungsschein – wir schauen mit Ihnen nach." |

Der Foto-Check-CTA wird auch im Kasko-Fall gezeigt (Entscheidung D4): das Gate `showRanges` bleibt für die Euro-Spannen, der CTA bekommt ein eigenes Kriterium. Das Ziel-Tool versteht `?schuld=selbst` schon heute.

### 4.4 Berater-API (Entscheidung D5)

1. **Parameter `werkstattbindung=ja|nein|unbekannt`** (analog `vollkasko`, nur bei Selbstverschulden ausgewertet) → Antwortfeld `werkstattbindung`, drei Textvarianten:
   * gebunden: „Ihr Tarif enthält eine Werkstattbindung: Ihre Versicherung benennt die Werkstatt. Schaden bei der Kasko melden und die Partnerwerkstatt der Versicherung nutzen. Keinen Werkstatt-Finder-Link ausgeben."
   * unbekannt: „Vor der Werkstattwahl den Versicherungsschein prüfen: Zusätze wie ‚Werkstattbindung', ‚Werkstattbonus', ‚Werkstattservice' oder ‚SELECT' bedeuten, dass die Versicherung die Werkstatt benennt. Ohne solchen Zusatz: freie Werkstattwahl."
   * frei: bisheriger Text.
2. **Optional `versicherer=` und `tarif=` als Namen** → Nachschlagen in der Wissensbasis (neue reine Funktion `findeKaskoTarifNachName`: Marke über `slug`/`marke`, Tarif über `anzeigename`, tolerant gegen Groß-/Kleinschreibung und Bindestriche) → `leiteWerkstattbindungAb` (existiert) → Antwort mit `werkstattbindung`, `bindungsumfang`, `verlaesslichkeit`, `sanktion` (Konditionen) und Hotline des Versicherers.
3. **Neuer Endpunkt `GET /api/v1/kasko-werkstattbindung?versicherer=&tarif=`** nach dem Muster `sv-in-naehe`/`werkstatt-in-naehe`: Admin-Client, Rate-Limit 60/min, CORS, `Cache-Control: public, max-age=3600`, `_meta` mit Quelle und Stand (CHECK24 20.07.2026), `nutzungshinweis` für LLMs. Projektion: Marke, Tarif, Bindung, Umfang, Verlässlichkeit, Sanktionstext, Hotline. Keine Kundendaten, keine Konditionen-Interna.
4. OpenAPI (`openapi.json`) und `llms.txt`/`llms-full.txt` nachziehen: Parameter, Endpunkt, ein Absatz „Werkstattbindung"; die zwei Nebenbefunde (Werkstattnamen, „6 Endpunkte") korrigieren.
Tests: Unit-Tests für den Namens-Lookup (Treffer, kein Treffer, Mehrdeutigkeit) und die Textwahl; Prod-Nachweis per Playwright `request.get` (API hat keine UI, das wird im Marker so ausgewiesen). GEO-Baseline vorher/nachher messen: Textänderungen der API verändern LLM-Antworten.

### 4.5 Foto-Tool (Entscheidung D6)

1. **Textwiderspruch beheben** (Bugfix, unabhängig von D6): `schuldBotschaft` für `selbst` sagt „Ohne Vollkasko tragen Sie den Schaden selbst", die Positionen darüber setzen die Vollkasko voraus. Vorschlag: eine Botschaft, die beides trägt: „Mit Vollkasko reguliert Ihre Versicherung abzüglich Selbstbeteiligung; ohne tragen Sie den Schaden selbst. Nutzungsausfall, Anwalt und Gutachter übernimmt die Kasko in der Regel nicht."
2. **Hinweis im Summary bei `selbst`** (Muster aus `AbrechnungStep`, Variante „unbekannt"): „Bitte prüfen Sie vor der Reparatur Ihren Versicherungsschein auf einen Werkstattbindungs-Zusatz. Steht dort einer, benennt Ihre Versicherung die Werkstatt." Der Handoff in den Gutachter-Finder bleibt.
3. **Kein** Transport von Kasko-Daten zum Lead in Phase 2 (nur mit Option B sinnvoll).
4. `promoteSessionAufLead` löschen (toter Code, knip-Baseline sinkt).

### 4.6 Nicht in Phase 2 (YAGNI)

Tariffrage im Quiz oder Foto-Tool (Option B), Combobox im Marketing-Build, Schein-OCR, Marketing-Ratgeber und Stadtseiten-Texte (Phase 3), Änderung der `gutachter_finder_anfragen`-Schuldwerte.

## 5 · Entscheidungspunkte für Aaron

| # | Frage | Optionen | Empfehlung | Warum |
|---|---|---|---|---|
| **D1** | Wo wird nach dem Tarif gefragt? | A ehrlich sagen, im FlowLink fragen · B Tariffrage überall · C API-first | **A + C** | Die Frage ist in Phase 1 gebaut und abgenommen; das Quiz hat 2 Einreichungen; eine bindende Entscheidung gehört nicht in ein anonymes Quiz ohne Rückweg. |
| **D2** | `auswertung_unverbindlich`? | (a) durchreichen + im Dispatch zeigen · (b) Audit-only | **(a)** | Eine Zeile im Konverter, ein Block im Dispatch; die Spalte tut dann, was ihr Kommentar verspricht. |
| **D3** | Quiz-Texte (Abschnitt 4.3) freigeben? | ja, so · ja, mit Änderungen · nein | **ja** | Der heutige Text verspricht die Partnerwerkstatt jedem Kasko-Klicker. |
| **D4** | Foto-Check-CTA auch bei Kasko zeigen? | ja · nein | **ja** | Das Ziel-Tool versteht `selbst`; der Kunde bekommt eine Schadenschätzung statt einer Sackgasse. |
| **D5** | API: Parameter + Namens-Lookup + eigener Endpunkt? | nur Parameter · Parameter + Lookup in `pruefe-anspruch` · alles drei | **alles drei** | LLMs stellen genau diese Frage; die Wissensbasis ist öffentlich lesbar; das Muster existiert. |
| **D6** | Foto-Tool: Hinweis bei `selbst`? | nur Textwiderspruch beheben · Widerspruch + Hinweis | **Widerspruch + Hinweis** | Zwei Sätze, keine neue Frage, kein neuer Datenfluss. |
| **D7** | GEO-Doku (`llms.txt`) in Phase 2 oder 3? | Phase 2 · Phase 3 | **Phase 2 für die API-Doku**, Ratgeber-Content Phase 3 | Die API-Beschreibung gehört zur API und muss mit ihr live gehen. |

## 6 · Umsetzungsreihenfolge (bei A + C)

1. Konversion (`selbst` → `eigenverantwortung`, Notiz) als Migration über das Plugin; Prod-Read vorher/nachher; Prod-Smoke `/check` → Lead → FlowLink zeigt die Versicherungsfrage.
2. Foto-Tool: Textwiderspruch + Hinweis; Unit-Tests `darstellung.test.ts`; toter Code raus.
3. Quiz-Texte (6 Locales) + CTA-Kriterium; `result-model.test.ts` und `client-namespaces.test.ts` anpassen.
4. Berater-API: Parameter + Namens-Lookup (reine Funktion mit Tests) + Textvarianten; Kasko-Zweig in den Prod-Smoke der API aufnehmen.
5. Lookup-Endpunkt + OpenAPI + `llms.txt`-Absatz + Nebenbefunde.
6. `auswertung_unverbindlich` durchreichen + Dispatch-Block.
7. Abnahme nach Regel 5: Matrix aus Abschnitt 2, HTML-Bericht, Datei in `memory/abnahmen/`.

Alles auf einem Branch von `origin/staging`, PR gegen `staging`, Regel-4-Smoke nach Deploy, Abnahme durch eine zweite Session.

## 7 · Risiken

* **Sechs Sprachen:** jede Textänderung an Kasko-Keys ist eine sechsfache Änderung; der `check`-Namespace geht komplett an den Browser. Übersetzungen werden von mir gemacht und im PR nebeneinander gezeigt.
* **LLM-Antworten ändern sich** mit den API-Texten. Vorher die GEO-Baseline (`scripts/geo-baseline.mjs`) sichern, nachher messen.
* **Die Konversion wirkt sofort** nach dem Applizieren. Sie ändert nur die Whitelist; der einzige Effekt ist ein korrekt gesetztes Feld.
* **Namens-Lookup ist unscharf:** „Classic" vs. „Classic SELECT". Bei mehreren Treffern antwortet die API mit der Liste und `werkstattbindung: 'unbekannt'`, nie mit einer geratenen Bindung.

## 8 · Was diese Spec nicht löst

Die Anspruchsprüfung bleibt drei getrennte Implementierungen ohne gemeinsames Regelwerk (Scan-Befund aus Phase 1). Eine Zusammenführung wäre ein eigener Auftrag; Phase 2 macht sie nur in einem Punkt konsistent: keine Werkstatt-Zusage ohne Tarifkenntnis.

## 9 · Offene Fakten, vor Phase 2b zu messen

| Größe | Quelle | Stand |
|---|---|---|
| Check-Einreichungen | `anfragen` mit `quelle='claimondo-check'` | 2 (gegner 1, selbst 1) |
| Berater-API-Aufrufe je Tag, Anteil `schuldfrage=selbst` | nginx-Log auf dem VPS | nicht gemessen |
| Foto-Tool-Sitzungen je Monat, Anteil `selbst` | `anspruch_schaetzungen` | nicht gemessen |
| Anteil gebundener Tarife unter Kasko-Leads | `leads` mit `freie_werkstattwahl=false` | Phase 1 läuft seit 04.09., noch kein Bestand |

Erst wenn Quiz oder Foto-Tool nennenswert Kasko-Fälle liefern, lohnt Option B.
