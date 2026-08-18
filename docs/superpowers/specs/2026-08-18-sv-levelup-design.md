# SV-LevelUp — Beschluss- und Korrektur-Spec

**Stand 18.08.2026** · Supabase-Projekt `paizkjajbuxxksdoycev` (prod)

Diese Spec **ersetzt die Übergabe-Specs nicht**, sie legt darüber:

1. die am 18.08. getroffenen Entscheidungen,
2. die Korrekturen, die aus der Prüfung gegen Live-DB und Repo folgen,
3. die neuen Teile, die in keiner Übergabe-Spec stehen.

Grundlage bleiben `CONTEXT.md`, `CONTRACT.md`, `TESTDATA.json`, `CHECKLIST.md`,
`WELLEN_PLAN.md`, `DURCHSPRACHE.md` (SV-LevelUp-Specs.zip), `GESAMTSPEC-Sichtbarkeitscheck-v2.md`,
die beiden Mockups und der Skill `gutachter-sichtbarkeits-check`.

**Bei Widerspruch gilt diese Datei.**

---

## 1 · Entscheidungen vom 18.08.2026

| # | Frage | Entscheidung |
|---|---|---|
| E-1 | Scoring | **Modulpunkte sind die Rechengrundlage.** Die sieben Säulen bleiben als Diagramm in der Auswertung, zeigen aber `ist/soll` der zugeordneten Module — kein zweiter normierter Wert. |
| E-2 | Teilbefund-Schwelle | **Relativ: `kein_score = punkte_erhebbar < 50 % der Gesamtpunkte`.** Wächst mit der Modulzahl mit. |
| E-3 | Places-Key | Vorhanden (`GOOGLE_PLACES_API_KEY`, prod). **Restriction muss erweitert werden** — siehe §8. |
| E-4 | Deployment | **Eigenes Next.js-Projekt** auf `sv-levelup.claimondo.de`, eigener PM2-Port, eigener Release-Zyklus. Design-Tokens aus `mockup-levelup-v2.html`. |
| E-5 | Vertriebsanbindung | Check läuft standalone. **Leads werden als `tasks`-Zeile gespiegelt** — der Vertrieb sieht sie in seiner gewohnten Liste. Dazu ein **interner Auswertungslink**, nur für Staff. |
| E-6 | Zielzustand | **Der Lead ist zu Partner konvertierbar.** Konvertierung läuft über den bestehenden Claim-Flow, nicht über einen neuen Pfad. |
| E-7 | Neue Module | Alle vier: `zuweiser`, Bewertungs-Dynamik, `gsc`, `gebiet` + `ortsseiten`. |
| E-8 | Modulauswahl | Bleibt beim SV (Zustand 2). Bei 17 Modulen **in vier Gruppen** gefasst. |

---

## 2 · Korrekturen an den Übergabe-Specs

Gemessen am 18.08.2026 gegen prod. Jede Zeile ist ein Punkt, an dem die Übergabe-Spec beim
Bau in die Irre führen würde.

### 2.1 Falsche Zahlen (Regressionstests wären sofort rot)

| Behauptung | Wo | Tatsächlich |
|---|---|---|
| `leads` = 75 | CONTEXT §2 | **78** |
| `leads` = 165 | WELLEN_PLAN Welle 1, CHECKLIST | **78** |
| `partner_leads` = 125 | WELLEN_PLAN Welle 7, CHECKLIST | **126** |

**Konsequenz:** Regressionstests prüfen `count(*) vorher == count(*) nachher`, nie einen
absoluten Wert. Beide Tabellen sind in Bewegung.

### 2.2 Die Modul-Registry im Check-Mockup ist veraltet

`CONTEXT.md` §7 weist an, Registry und Sperrlogik aus `mockup-levelup-v2.html` zu übernehmen.
**Das ist falsch.** Dieses Mockup kennt nur **11 Module** — `kwg` und `kwm` fehlen vollständig —
und führt ein drittes Punktesystem (Summe 165), das weder zur GESAMTSPEC noch zu den Testdaten passt.

Maßgeblich ist **`mockup-levelup-auswertung.html`** (13 Module, Summe 124) in Übereinstimmung
mit `GESAMTSPEC-Sichtbarkeitscheck-v2.md` §5. Belegt durch T-03 (124), T-04 (10) und alle fünf
Maximalwerte in T-16.

Die **Sperrlogik** aus dem Check-Mockup bleibt gültig und wird übernommen
(`istGesperrt`: Modus-Zugehörigkeit, URL-Bedarf, Profil-Bedarf) — nur die Registry nicht.

### 2.3 Zwei Rechenfehler in TESTDATA.json

| Fall | erwartet | korrekt (Registry 124) |
|---|---|---|
| T-01 Weg A ohne Website | `punkteErhebbar: 60` | **68** |
| T-28 Massenlauf | `punkteErhebbar: 45` | **48** |

Beide Fälle behalten ihre Aussage (T-01 Score, T-28 Teilbefund); nur der Zahlenwert wird korrigiert.
Mit der neuen Registry (§3) verschieben sie sich erneut — die Sollwerte stehen dort.

### 2.4 Säulen und Module sind nicht ineinander umrechenbar

`GESAMTSPEC` §6 und `scoring-modell.md` beschreiben **sieben Säulen zu 100 Punkten** mit
vollständigen Vergaberegeln. `CONTRACT` F-05 rechnet auf **Modulpunkten (124)**. Die
Zuordnung geht nicht auf:

| Säule | Punkte | speisende Module | Modulpunkte |
|---|---|---|---|
| 3 · Auffindbarkeit | 16 | `wett` + `kwm` + `ads` | **34** |
| 4 · SEO & Keywords | 20 | `seo` + `kwg` + `nach` | **34** |
| 6+7 · Technik + Vertrauen | 20 | `web` | **12** |

Das Auswertungs-Mockup klebt beide Systeme zusammen und rechnet die Säulenbalken faktisch mit
Modulsummen — seine eigene `SAEULEN`-Tabelle wird nie verwendet (`baueAuswertung()` nutzt nur
den Namen, nie das Maximum).

**Beschluss (E-1):** Modulpunkte rechnen. Die Säule zeigt `Σ ist / Σ soll` **ihrer Module** —
also bei Säule 3 „12 von 34", nicht „12 von 16". Das Säulen-Maximum aus `scoring-modell.md`
wird nicht mehr verwendet. Die dortigen **Vergabekriterien** bleiben vollständig gültig und
sind die Messvorschrift je Modul (§3.3).

### 2.5 Die Massenlauf-Tabelle in CONTRACT F-17 ist unvollständig

Sie listet 10 der 13 Module; `nach`, `markt` und `nische` fehlen. Zusätzlich ist die Begründung
bei `volumen` („Autocomplete-Abfrage") vertauscht — Autocomplete ist `nach`, `volumen` rechnet
aus Einwohner- und Bestandsdaten. Die vollständige Tabelle steht in §3.4.

### 2.6 Welle 7 Schritt A ist bereits beantwortet

`WELLEN_PLAN` Welle 7 verlangt als Abbruchkriterium die Prüfung, ob eine öffentliche Ansicht
`sv_leads` mit `ist_aktiv = true` über den anon-Key liest.

**Geprüft am 18.08.2026: nein.** Alle elf Lesestellen laufen über `createAdminClient()` bzw.
`createServiceClient()` — beide umgehen RLS:

```
src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts   createAdminClient, createServiceClient
src/lib/actions/gutachter-finder-actions.ts                 createAdminClient
src/lib/onboarding/svMatching.ts                            createAdminClient
src/lib/sv-basic/claim-actions.ts                           createAdminClient
src/lib/sv-matching-modul/lade-deadpin-fallback.ts          createAdminClient
claimondo-marketing/app/api/kfzgutachter-lp/…/route.ts      createAdminClient, createServiceClient
claimondo-marketing/app/[locale]/gutachter-partner/{page,actions}.ts   createAdminClient
claimondo-marketing/lib/actions/gutachter-finder-actions.ts createAdminClient
claimondo-marketing/lib/sv-basic/claim-actions.ts           createAdminClient
autounfall-io/lib/finder/pins.ts                            createServiceClient
```

Die Policy-Verschärfung ist damit gefahrlos. Sie bleibt trotzdem **der erste Schritt vor jeder
Anreicherung** — ab dem Moment, in dem `email` und `telefon` gefüllt sind, stünde sonst eine
fertige Wettbewerber-Kontaktliste offen im Netz.

### 2.7 Der Stack-Abschnitt der GESAMTSPEC ist überholt

`GESAMTSPEC` §3 nennt „Vanilla JS, kein Build" und „Express.js, öffentliche Endpoints ohne JWT".
`CONTEXT` §1 widerspricht dem ausdrücklich und ist neuer. Es gilt: **Next.js App Router,
Server Actions, Supabase, RLS.** Kein Express, keine neue API-Schicht.

---

## 3 · Modul-Registry (verbindlich)

### 3.1 Die 17 Module

Modul-Ids sind Vertragsbestandteil und stehen so in `module_gewaehlt`, `befunde` und `massnahmen`.

| # | Id | Modul | Punkte | Modus | Braucht | Säule |
|---|---|---|---|---|---|---|
| 1 | `gbp` | Google-Unternehmensprofil | **22** | B | Places | 1 |
| 2 | `web` | Website — Technik & Recht | 12 | A·B | URL | 6+7 |
| 3 | `seo` | SEO & Inhalte | 12 | A·B | URL | 4 |
| 4 | `ux` | Nutzererlebnis | 12 | B | URL | 5 |
| 5 | `wett` | Wettbewerber im 50-km-Umkreis | **18** | A·B | Places | 3 |
| 6 | `verz` | Branchenverzeichnisse & NAP | 12 | A·B | — | 2 |
| 7 | `kwg` | Google-Keyword-Planer · 20 km | 14 | A·B | Ads-Konto | 4 |
| 8 | `kwm` | Meta-Reichweite · 20 km | 8 | A·B | Meta-Konto | 3 |
| 9 | `nach` | Longtail-Recherche | 8 | A·B | — | 4 |
| 10 | `ads` | Anzeigen im Transparenzcenter | 10 | A·B | Browser (R-F2) | 3 |
| 11 | `zuweiser` | **Zuweiser-Netzwerk · 25 km** | **10** | A·B | Places + eigenes Netz | 3 |
| 12 | `gsc` | **Search Console** | **12** | B | OAuth-Freigabe | 4 |
| 13 | `markt` | Marktbewertung im Vergleich | 0 | A·B | Places | — |
| 14 | `nische` | Nischen & Positionierung | 0 | A·B | — | — |
| 15 | `volumen` | Marktvolumen-Rechnung | 0 | A·B | — | — |
| 16 | `gebiet` | **Gebietswahl** | 0 | **A** | `nach` + `wett` | — |
| 17 | `ortsseiten` | **Ortsseiten-Abgleich** | 0 | A·B | URL + `nach` | — |

**Summe: 150 Punkte.** Fett = neu oder geändert gegenüber der Übergabe-Spec.

Die Änderung bei `gbp` (20 → 22) und `wett` (16 → 18) ist die Bewertungs-Dynamik: je zwei Punkte
für die **Rate** statt nur den Bestand (§3.5).

### 3.2 Score und Teilbefund

```
punkte_erhebbar = Σ Punkte der akzeptierten UND messbaren Module
score           = round(ist_punkte / punkte_erhebbar * 100)
kein_score      = punkte_erhebbar < 75          -- 50 % von 150 (E-2)
```

Ein Modul, das gewählt, aber nicht messbar ist (kein Ads-Konto, keine GSC-Freigabe, gesperrte
robots.txt), fällt **aus dem Nenner** — es wird nie mit 0 bewertet (R-B).

Prüfszenarien:

| Szenario | erhebbar | Ergebnis |
|---|---|---|
| Weg B voll, ohne Ads-/Meta-Konto, ohne GSC | 116 | Score |
| Weg A ohne Website | 92 | Score |
| Massenlauf (`web`,`seo`,`ux`,`verz`,`volumen`,`ortsseiten`) | 48 | **Teilbefund** |
| T-04 (`markt`,`nische`,`volumen`,`ads`) | 10 | **Teilbefund** |

### 3.3 Woher die Punkte kommen

Die Vergabekriterien stehen **vollständig** im Skill `gutachter-sichtbarkeits-check` und werden
unverändert übernommen — sie sind die einzige ausformulierte Messvorschrift im gesamten Material:

| Modul | Quelle | Beispiel |
|---|---|---|
| `gbp` | `scoring-modell.md` §2 | Bewertungen 0–7, Sterne 0–6 (gedeckelt auf 2 bei `< 5` Bewertungen), Vollständigkeit 0–7 |
| `verz` | `branchenverzeichnisse.md` | Abdeckung 6, NAP-Konsistenz 6 |
| `wett` | `scoring-modell.md` §3 | Rang im Umkreis 0–6; bei `< 8` Wettbewerbern keine Rangeinteilung |
| `seo` | `seo-pruefung.md` + `keyword-analyse.md` | On-Page 12, Keyword-Abdeckung 8 |
| `ux` | `ux-pruefung.md` | Browser-Messung 7, Screenshot-Beurteilung 5 |
| `web` | `scoring-modell.md` §6+§7 | Lighthouse 0–4, CWV 0–4, Impressum/Datenschutz/Nachweise |
| `kwg`,`kwm`,`nach` | `keyword-analyse.md`, `keyword-potenzial.md` | 20-km-Radius, Google und Meta getrennt (R-L) |
| `ads` | `google-ads-auswertung.md` | Anzeigenzahl je Domain, Conversion-Messung |
| `zuweiser`,`gsc`,`gebiet`,`ortsseiten` | **§4 dieser Spec** | neu |

Die Punktzahlen im Skill sind auf das 100er-Säulenmodell geeicht. Beim Übertragen auf die
Modulpunkte gilt: **Kriterien und Schwellen bleiben, das Modulmaximum ist der neue Nenner.**
Wo ein Modul mehr Punkte hat als seine Säule (z. B. `gbp` 22 statt 20), werden die zusätzlichen
Punkte durch das neue Kriterium vergeben, nicht durch Streckung der alten.

### 3.4 Massenlauf — vollständige Tabelle

Ersetzt die Tabelle in `CONTRACT` F-17.

| Modul | im Massenlauf | Grund |
|---|---|---|
| `web`, `seo`, `ux` | **ja** | eigener Crawl, robots.txt-konform |
| `verz` | **ja** | robots.txt-konform |
| `nach`, `nische` | **ja** | Autocomplete, frei abfragbar |
| `volumen` | **ja** | lokale Statistikdaten, kein externer Abruf |
| `ortsseiten` | **ja** | leitet sich aus `nach` + Crawl ab |
| `gbp`, `wett`, `markt`, `zuweiser` | **ja, sobald Places-Restriction erweitert ist** (§8) — bis dahin nein | Places API |
| `kwg` | nein | braucht Google-Ads-Konto |
| `kwm` | nein | braucht Meta-Business-Konto |
| `ads` | nein | nur über den Browser auslösbar (R-F2) |
| `gsc` | nein | braucht OAuth-Freigabe des SV |

Solange die Restriction nicht erweitert ist, bleibt jeder Massenlauf-Check ein **Teilbefund**
(48 von 150). **Die Mailvorlagen dürfen dann keinen Score nennen** — nur, was tatsächlich
gemessen wurde (`DURCHSPRACHE` §4).

### 3.5 Bewertungs-Dynamik (+2 auf `gbp`, +2 auf `wett`)

Place Details liefert Bewertungen **mit Datum**. Daraus ohne einen einzigen Zusatz-Call:

- `gbp` (+2): eigene Rate in Bewertungen/Monat über die letzten 12 Monate.
  0 → 0 · unter 0,3 → 1 · ab 0,3 → 2.
- `wett` (+2): Rate im Verhältnis zum Feld. unter Median → 0 · um den Median → 1 · über dem
  oberen Viertel → 2.

**Warum das zählt:** Der Bestandswert („191 gegen Ihre 24") ist für einen Neueinsteiger
entmutigend und praktisch nicht aufholbar. Die Rate ist beeinflussbar und macht das Feld
angreifbar: „Der Marktführer sammelt 0,4 im Monat, das obere Viertel 1,8 — bei zwei pro Woche
überholen Sie 60 Büros in einem Jahr." Zusätzlich ist es der ehrlichere Befund: 191 Bewertungen
aus fünf Jahren sind etwas anderes als 50 aus diesem.

Für die Wiederholmessung (F-14) ist die Rate die aussagekräftigste Vergleichsgröße überhaupt.

### 3.6 Gruppierung der Auswahl (Zustand 2)

17 Kacheln in einer Liste sind unbedienbar. Vier Gruppen, je 4–5 Module:

| Gruppe | Module | Gruppentext |
|---|---|---|
| **Ihr Auftritt** | `gbp`, `web`, `seo`, `ux`, `gsc` | „Was Sie selbst in der Hand haben." |
| **Ihr Umfeld** | `wett`, `verz`, `zuweiser`, `ads` | „Wer sonst noch da ist — und wer Ihnen Aufträge schicken könnte." |
| **Ihre Nachfrage** | `kwg`, `kwm`, `nach`, `ortsseiten` | „Wonach in Ihrem Gebiet gesucht wird." |
| **Ihr Markt** | `markt`, `nische`, `volumen`, `gebiet` | „Diese Gruppe bewertet den Markt, nicht Sie — deshalb ohne Punkte." |

Gruppe 4 ist vollständig punktlos; der Gruppentext erklärt das einmal, statt es an jeder Kachel
zu wiederholen. Die Bilanzleiste (Module · Prüfpunkte · Dauer) bleibt wie im Mockup.

Voreinstellungen: **Weg A** alles außer den URL- und profilgebundenen Modulen (`gbp`, `web`,
`seo`, `ux`, `gsc`, `ortsseiten`). **Weg B** alles außer `gebiet` (nur Weg A) und `gsc` (opt-in,
weil es eine Freigabe verlangt).

Der Wunsch des Nutzers wird getrennt vom Messbaren gespeichert: Wer ein Modul wählt und die URL
nachträgt, bekommt es zurück (T-02).

---

## 4 · Die neuen Module

### 4.1 `zuweiser` — Zuweiser-Netzwerk im 25-km-Umkreis (10 Punkte)

**Frage:** Wer im Nahbereich kann mir Aufträge schicken — und mit wem arbeite ich schon?

Der zweite Auftragskanal neben der Suche. `GESAMTSPEC` 13.6 nennt ihn als Erweiterungspunkt, das
Marktmodul setzt ihn implizit voraus („bei schmaler Nachfragebreite kommen die Aufträge nicht
allein über die Suche"), gemessen wird er nirgends.

**Datenquellen — die zweite ist unser Alleinstellungsmerkmal:**

| Quelle | Liefert |
|---|---|
| Places Text Search, 25 km | freie Werkstätten, Autohäuser, Rechtsanwälte mit Verkehrsrecht |
| **eigener Bestand** (`partner_leads`, `netzwerk_verbindungen`, Kanzlei-Rolle) | wer davon bereits im Claimondo-Netzwerk ist |

**Punktvergabe:**

| Kriterium | Punkte |
|---|---|
| Werkstätten im 25-km-Umkreis erfasst und nach Nähe sortiert | 0 (Erhebung) |
| Anteil mit erkennbarer SV-Bindung (Website nennt einen Gutachter) | 0–3 |
| Verkehrsrechtskanzleien im Umkreis erfasst | 0–2 |
| eigene Nennung als Partner auf mindestens einer Zuweiser-Website | 0–5 |

**Ausgabe:** Zahl der Zuweiser je Typ, Entfernung, wie viele davon bereits mit Claimondo
arbeiten. **Ohne Namensnennung einzelner Wettbewerber** — die Regel gilt auch hier.

**Was das für Claimondo bedeutet:** Dieses Modul ist der natürliche Übergang ins Produkt. Ein SV,
der sieht, dass in seinem Umkreis vier Werkstätten bereits über Claimondo vermitteln, hat einen
konkreten Grund, Partner zu werden — das ist derselbe Befund, der ihm als Sichtbarkeitslücke dient.

### 4.2 `gsc` — Search Console (12 Punkte, nur Weg B, nur nach Freigabe)

**Frage:** Was passiert tatsächlich, statt was wir ableiten?

Alles im SEO-Block ist heute abgeleitet; die Klickraten in `scoring-modell.md` §9 sind
ausdrücklich Branchendurchschnitte (R-C). Mit Freigabe werden daraus Messwerte.

**Erhoben:** Impressionen, Klicks, mittlere Position und CTR je Suchbegriff (letzte 90 Tage);
Seiten ohne jede Impression; Suchbegriffe mit hoher Impression und niedriger CTR.

**Punktvergabe:**

| Kriterium | Punkte |
|---|---|
| Property verbunden und Daten vorhanden | 0–2 |
| Klicks im Verhältnis zu Impressionen (CTR gegen Positionserwartung) | 0–4 |
| Abdeckung: indexierte Seiten mit mindestens einer Impression | 0–3 |
| Ortsseiten mit messbarer Impression (gegen die Ortsliste aus `nach`) | 0–3 |

**Wichtig fürs Produkt:** `gsc` ist im öffentlichen Check nie erhebbar und fällt dort aus dem
Nenner. Es ist das Modul für **Wiederholmessung und Bestandskunde** — und ersetzt beim zweiten
Termin die Schätzung durch den Beweis. Die Freigabe einzuholen ist selbst eine Phase-1-Maßnahme.

### 4.3 `gebiet` — Gebietswahl (ohne Punktwertung, nur Weg A)

**Frage:** Wo ist das Verhältnis von Nachfrage zu Wettbewerb am günstigsten?

Rein rechnerisch aus bereits erhobenen Daten — kein zusätzlicher Abruf:

```
nachfrage_je_buero(ort) = autocomplete_treffer(ort) / bueros_im_umkreis(ort)
```

Beide Größen liefern `nach` und `wett` bereits; sie werden nur nie gegeneinander gerechnet.

**Ausgabe:** Die Orte im 30-km-Umkreis, sortiert nach Nachfrage je Büro, mit den absoluten Zahlen
daneben. Keine Empfehlung, keine Wertung — der SV entscheidet.

**Warum ohne Punkte:** Es bewertet den Markt, nicht den Sachverständigen (wie `markt`, `nische`,
`volumen`). Für einen echten Neugründer ist es trotzdem der wertvollste Satz im ganzen Bericht.

### 4.4 `ortsseiten` — Ortsseiten-Abgleich (ohne Punktwertung)

**Frage:** Für welche Orte lohnt sich eine Seite — und für welche nicht?

Steckt heute in `seo` (Keyword-Abdeckung) und `nach` (Ortsnachfrage) und geht dort unter. Der
Münsterland-Fund war zwölf Orte mit und sechs ohne messbare Nachfrage — und die sechs standen auf
der Redaktionsliste.

**Ausgabe:** Drei Listen — Orte mit Nachfrage und Seite (nichts zu tun) · Orte mit Nachfrage ohne
Seite (**schreiben**) · Orte ohne messbare Nachfrage (**nicht schreiben, Begründung**).

**Warum ohne Punkte:** Die Bewertung der Seiten selbst passiert in `seo`. Hier steht die
Handlungsliste. Sechs nicht geschriebene Seiten sind sechs gesparte Arbeitstage — das ist
der konkreteste Nutzen des gesamten Berichts und verdient einen eigenen Block.

---

## 5 · Architektur

### 5.1 Aufteilung

```
sv-levelup.claimondo.de          eigenes Next.js-Projekt, eigener PM2-Port
├── /                            Einstieg: Modus + optionale URL
├── /check/[token]               die sieben Zustände, öffentlich
├── /plan/[token]                Präsentationslink für den SV     (F-19/F-20)
└── /auswertung/[token]          interner Auswertungslink, Staff  (NEU, §5.3)

Claimondo-Hauptportal            unverändert
└── tasks                        Lead erscheint in der Vertriebsliste (§5.2)

Supabase paizkjajbuxxksdoycev    eine Datenbank für beides
├── levelup_*                    neu
├── sv_leads                     + Spalten
└── sachverstaendige             Ziel der Konvertierung (§5.4)
```

**Warum ein eigenes Projekt:** eigener Release-Zyklus und eigene Marke, ohne das Hauptportal zu
berühren. Vorbild `claimondo-marketing` (:3006). NGINX-vhost + certbot wie bei
`gutachter.claimondo.de`.

**Was geteilt wird:** die Datenbank, die Supabase-Clients (kopiert wie in `claimondo-marketing`),
die Cookie-Domain `.claimondo.de` für das Staff-Gate auf `/auswertung/[token]`.

**Design:** Tokens aus `mockup-levelup-v2.html` — `--nacht #0a121c`, `--signal #ff4d1c`,
Archivo kursiv in Versalien, Rennstreifen, schräge Plakette. **Nicht** das Claimondo-Schema; das
ist eine eigene Marke. Die Diagrammfarben bleiben davon getrennt (`GESAMTSPEC` §11.2:
Signalorange trägt die Marke, nie eine Datenaussage).

### 5.2 Lead-Spiegelung in die Vertriebsliste

Sobald F-06 einen Lead erzeugt, entsteht zusätzlich eine `tasks`-Zeile. Vorbild ist
`sv_basic_claim_review` (13 Zeilen in prod) — dasselbe Muster, damit der Vertrieb nichts Neues lernen muss:

```ts
{
  typ: 'levelup_lead',
  titel: `SV-LevelUp: ${firma} (${ort})`,
  beschreibung: `Score ${score ?? 'Teilbefund'} · Termin ${slot}\nAuswertung: ${auswertungsUrl}`,
  empfaenger_rolle: 'admin',
  entity_type: 'levelup_check',
  entity_id: checkId,
  prioritaet: 'hoch',
  faellig_am: slotStart,
  auto_erstellt: true,
}
```

> **Falle:** `tasks.lead_id` zeigt auf `public.leads` — das sind **Schadenfälle von Endkunden**,
> nicht SV-Leads. Das Feld bleibt `NULL`. Der Bezug läuft ausschließlich über
> `entity_type`/`entity_id`. Dies ist dieselbe Verwechslung, vor der `CONTEXT` §2 warnt.

`typ` ist `NOT NULL` ohne Vorgabewert. `task_typ` bleibt leer — im Dispatch ist es die Ausnahme,
nicht die Regel; eine Auswertung darüber meldet fälschlich null.

### 5.3 Der interne Auswertungslink

```sql
create table public.levelup_auswertungslinks (
  id            uuid primary key default gen_random_uuid(),
  check_id      uuid not null references public.levelup_checks(id) on delete cascade,
  token         text not null unique,        -- 32 Zeichen, crypto.randomBytes
  erstellt_von  uuid references public.profiles(id),
  erstellt_am   timestamptz not null default now(),
  letzter_aufruf timestamptz,
  aufrufe       integer not null default 0
);
```

**Route** `/auswertung/[token]` mit **zwei Schranken**: der Token muss aufgehen **und**
`is_staff()` muss für die Sitzung wahr sein. Der Token allein genügt nicht — der Link enthält
den vollständigen Maßnahmenplan und den Gesprächsleitfaden.

**Inhalt:** die drei Ansichten aus `mockup-levelup-auswertung.html` (Gesamtauswertung ·
Maßnahmenplan · Verkaufsgespräch), Modulleiste filtert alle drei gleichzeitig, plus:

- **Anreicherungs-Historie** (woher stammt welche Kontaktangabe)
- **Mailverlauf**
- **Knopf „Zu Partner konvertieren"** (§5.4)

**Abgrenzung zu `/plan/[token]`:** Der Präsentationslink zeigt dem **Sachverständigen** den
Maßnahmenplan — ohne Gesprächsleitfaden, ohne Einwandbehandlung, ohne Konvertierung. Zwei
getrennte Tabellen, zwei getrennte Tokens; aus dem einen lässt sich der andere nicht ableiten.

**Verhältnis zu Regel E:** unberührt. R-E verbietet, dass Maßnahmen **automatisch** in einer
öffentlichen Antwort erscheinen. Beide Links sind bewusst erzeugt, an Personen gebunden und
widerrufbar. T-07 bleibt unverändert scharf: auf `/check/[token]` im Zustand `fertig` darf das
Wort `massnahmen` im Antwortkörper nicht vorkommen.

### 5.4 Konvertierung Lead → Partner

**Nicht neu bauen.** Der Weg existiert vollständig und gehärtet in
`claimondo-marketing/lib/sv-basic/claim-actions.ts` (`beanspracheSvLead`):

```
Eligibility (claim_status='offen' AND konvertiert_zu_sv_id IS NULL)
  → E-Mail-Dedupe gegen profiles
  → auth.admin.createUser (force_password_change, 2FA aus)
  → profiles (rolle='sachverstaendiger')
  → sachverstaendige (buildSvInsertAusLead)
  → sv_leads.konvertiert_zu_sv_id + konvertiert_am + claim_status='beansprucht_pending'
     mit optimistischem Lock .eq('claim_status','offen') gegen Doppel-Claim
  → Rollback-Kette über alle vier Schritte
  → tasks: sv_basic_claim_review für die 48-h-Freigabe
```

Der Ablauf umgeht bewusst den Tier-2-Verifizierungs-Cron (kein `verifizierung_frist_bis`) und
lässt die Cold-Pin auf der Karte aktiv, damit kein Kartenloch entsteht. **Beides ist beim
Andocken zu erhalten.**

SV-LevelUp braucht davon nur eine **vertriebsgetriebene Variante**: Der bestehende Pfad ist
Self-Service (der SV beansprucht selbst), hier löst ein Admin nach dem Gespräch aus. Zwei
Möglichkeiten, beide ohne zweite Wahrheit:

1. **Admin löst aus** — dieselbe Funktion, Auslöser ist `is_staff()` statt Rate-Limit + IP.
   E-Mail und Telefon kommen aus dem Lead statt aus einem Formular.
2. **Admin schickt den Claim-Link** — der SV geht durch den bestehenden Self-Service.
   Kein Code, aber ein Medienbruch im Gespräch.

**Empfehlung: (1)**, weil das Gespräch der Moment ist, in dem der SV zusagt. Zu klären ist,
wer das Anfangspasswort übermittelt — dieselbe Frage beantwortet der Self-Service heute mit
`force_password_change` plus Zustellung per Mail.

`sv_leads.claim_status` ist bei allen 62 Bestandsleads `'offen'` — sie sind alle konvertierbar.

---

## 6 · Datenmodell — Änderungen gegenüber CONTEXT §3

Alles aus `CONTEXT` §3.3, §10.1, §10.2, §11.1, §11.2 und §12 bleibt. Dazu:

```sql
-- Der interne Auswertungslink (§5.3)
create table public.levelup_auswertungslinks (…);

-- Neue Modulbefunde brauchen keine eigenen Tabellen; sie leben in befunde jsonb.
-- Aber: die Zuweiser-Zuordnung wird denormalisiert, weil sie aus zwei Quellen kommt
alter table public.levelup_checks
  add column zuweiser_treffer jsonb not null default '[]';
  -- [{typ, name, entfernung_km, im_netzwerk: bool, quelle}]

-- GSC-Freigabe (Modul gsc)
alter table public.levelup_checks
  add column gsc_property text,
  add column gsc_freigabe_am timestamptz;
```

**RLS** wie in `CONTEXT` §3.4: Lesen für `admin`, `dispatch`, `leadbearbeiter`, `kundenbetreuer`;
Schreiben ausschließlich `service_role` über Server Actions. `levelup_auswertungslinks`
zusätzlich `is_staff()` zum Schreiben, kein `anon`.

> `is_staff()` enthält `admin`, `kundenbetreuer`, `dispatch` — **nicht `leadbearbeiter`**
> (geprüft 18.08.). Wo `leadbearbeiter` Zugriff haben soll, muss die Rolle ausgeschrieben werden.

---

## 7 · Was ein Check kostet

Google Maps Platform, Stufe 0–100 k/Monat, Stand 18.08.2026.

| Posten | SKU | Calls | $/1000 | $ |
|---|---|---|---|---|
| `wett` — 50-km-Raster | Text Search Pro | ~20 | 32,00 | 0,64 |
| `markt` — 6 Vergleichsmärkte | Text Search Pro | ~12 | 32,00 | 0,38 |
| `zuweiser` — 25 km, drei Typen | Text Search Pro | ~6 | 32,00 | 0,19 |
| `gbp` — Profil finden | Text Search Pro | 1 | 32,00 | 0,03 |
| `gbp` — Profildaten | Place Details Pro | 1 | 17,00 | 0,02 |
| Standort | — | — | — | 0 (aus `plz_geo`) |
| **Summe** | | **~40** | | **~1,26 $ ≈ 1,16 €** |

> **Text Search, nicht Nearby Search.** Nearby Search filtert über `includedTypes`, und für
> „Kfz-Sachverständiger" existiert kein Places-Typ. `wett`, `markt` und der Kanzlei-Teil von
> `zuweiser` brauchen Freitext und laufen deshalb über Text Search. Nur der Werkstatt-Teil von
> `zuweiser` könnte `car_repair` per Nearby Search nutzen — gleicher Preis, daher ohne Gewinn.
> Beide SKUs sind derzeit gesperrt (A-1).

Alle übrigen dreizehn Module: **0 €** (eigener Crawl, PageSpeed, SSL Labs, Verzeichnisse,
Autocomplete, Ads-API, Meta-API, GSC-API, lokale Statistik) — nur Serverzeit, ~3–5 min CPU.

**Der Free Tier trägt den Regelbetrieb:** 5.000 Pro-Calls **je SKU** und Monat. Text Search ist
mit ~39 Calls je Vollcheck der Engpass; Place Details (1 Call) reicht für 5.000 Checks:

- **bis ~128 Checks im Monat: 0 €**
- mit Markt-Cache (die sechs Vergleichsmärkte sind je Region identisch — einmal monatlich statt
  je Check): ~27 Calls → **bis ~185 Checks gratis**, danach ~0,88 €
- **Massenlauf über die 62 Bestandsleads: 0 €**, solange die Places-Module ausgeschlossen sind

**Optional**, falls Befundtexte generiert statt getemplatet werden (~15 k Input, ~6 k Output je
Check): Haiku 4.5 ≈ 0,04 € · Sonnet 5 ≈ 0,08 € · Opus 5 ≈ 0,21 €. Der Maßnahmenplan selbst wird
**abgeleitet, nicht generiert** (F-11) — ein Modell wäre nur für die Formulierung der Einordnungen
nötig.

**Der eigentliche Kostenblock ist Menschenzeit:**

| | ohne erweiterte Restriction | mit |
|---|---|---|
| `wett` + `markt` + `zuweiser` (Kartenausschnitte, R-F2) | 30–45 min | 0 |
| `ads` (Transparenzcenter, nur Browser) | 10–15 min | 10–15 min |
| **je Check bei 60 €/h** | **45–60 €** | **10–15 €** |

Dazu das Gespräch (30 min plus Vor- und Nachbereitung ≈ 45 €), das unvermeidbar ist und den
Zweck des Ganzen darstellt.

> Die Erweiterung der Key-Restriction kostet nichts und spart 35–45 € Menschenzeit je Check.

---

## 8 · Aufgaben außerhalb des Codes

| # | Aufgabe | Wer | Blockiert |
|---|---|---|---|
| A-1 | **Places-Key-Restriction erweitern** um „Places API (New) → Text Search + Nearby Search" (Projekt `67468726375`). Aktuell: `403 API_KEY_SERVICE_BLOCKED` auf beiden Methoden. | Aaron | `gbp`, `wett`, `markt`, `zuweiser` — und damit Weg A insgesamt |
| A-2 | **VPS-root-Passwort rotieren** — es wurde am 18.08. im Klartext übermittelt. | Aaron | — |
| A-3 | DNS + NGINX-vhost + certbot für `sv-levelup.claimondo.de` | Aaron | Deployment |
| A-4 | Resend: Domain `sv-levelup.claimondo.de` verifizieren, SPF, DKIM, DMARC (`p=none` mit `rua`), Warmup | Aaron | Welle 10 (Versand) |
| A-5 | **Durchsprache nach `DURCHSPRACHE.md`** — rechtliche Grundentscheidung nach § 7 Abs. 2 UWG, die vier Vorlagen im Wortlaut, Startmenge, Abbruchschwelle, wer Antworten liest | Aaron + Anwalt | Scharfschalten der Sequenz |
| A-6 | Google-Ads-Konto (für `kwg`) und Meta-Business-Konto (für `kwm`) | Aaron | 22 der 150 Punkte |
| A-7 | Entscheidung: Wer übermittelt bei der Admin-Konvertierung das Anfangspasswort? | Aaron | §5.4 Variante (1) |

**A-5 bleibt ein Menschenklick.** `cold_mail_sequenzen.aktiv` und `auto_enroll` werden vom Code
nie auf `true` gesetzt — auch nicht zum Testen.

---

## 9 · Wellenschnitt

Die zehn Wellen aus `WELLEN_PLAN.md` bleiben in Reihenfolge und Zuschnitt. Änderungen:

| Welle | Änderung |
|---|---|
| 1 | zusätzlich `levelup_auswertungslinks`, `zuweiser_treffer`, `gsc_*`; Registry mit 17 Modulen und 150 Punkten |
| 2 | Registry aus §3.1 statt aus dem Check-Mockup; Auswahl in vier Gruppen (§3.6) |
| 3 | Teilbefund-Schwelle relativ (`< 75`); Säulendiagramm zeigt `ist/soll` der Module |
| 4 | zusätzlich Lead-Spiegelung nach `tasks` (§5.2) |
| 5 | wandert in das eigene Projekt als `/auswertung/[token]` mit Staff-Gate; zusätzlich Konvertierungs-Knopf (§5.4) |
| 6 | unverändert |
| 7 | Schritt A ist erledigt (§2.6) — Policy-Verschärfung direkt, dann Anreicherung |
| 8 | Massenlauf-Tabelle aus §3.4 |
| 9 | unverändert (Präsentationslink bleibt vom Auswertungslink getrennt) |
| 10 | unverändert — endet vor dem ersten Versand |

**Empfohlener Einstieg:** Welle 1 und 7 zusammen. Ohne E-Mail-Adressen ist keiner der 62 Leads
erreichbar; die Anreicherung ist die Voraussetzung für alles Weitere, und das offene Leseleck
gehört vorher geschlossen. Beides ist unabhängig von A-1 baubar.

---

## 10 · Was diese Spec nicht entscheidet

- **Die Textinhalte der vier Mailvorlagen.** Gegenstand von A-5.
- **Die Formulierung der Befund-Einordnungen.** Die Bausteine in `scoring-modell.md` §10 sind
  ausdrücklich Ausgangspunkt, nicht Wortlaut.
- **Ob `ads` langfristig automatisierbar wird.** Solange R-F1 gilt, bleibt es Handarbeit.
- **Die Preisgestaltung dessen, was nach der Konvertierung verkauft wird.** Der Check nennt
  nie einen Preis (R-D); was ein Partner-Abo kostet, ist eine andere Entscheidung.
