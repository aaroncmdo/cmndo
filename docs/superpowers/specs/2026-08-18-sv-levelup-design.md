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

### 2.6 Welle 7 Schritt A — und warum das Leck trotzdem nicht existiert

> **Korrektur vom 18.08.2026, nach Messung mit dem echten anon-Key.** Der
> Abschnitt unten stand zunächst als „Abbruchkriterium getroffen". Der
> öffentliche Lesepfad ist real — aber das **Leck** ist es nicht:
>
> ```
> View sv_leads_map_pins  → 62 Zeilen                              (anon-Key)
> sv_leads.email,telefon  → permission denied for table sv_leads    (anon-Key)
> sv_leads.id,lat,lng     → funktioniert
> ```
>
> anon besitzt auf `sv_leads` **nur Spalten-GRANTs** auf `id`, `lat`, `lng`,
> `ist_aktiv` — Ergebnis des Anon-Grant-Gates. `name`, `firma`, `adresse`,
> `telefon`, `email`, `vorname`, `notizen` und auch die zehn heute ergänzten
> Spalten sind für anon gesperrt; neue Spalten erben von sich aus keinen Grant
> (Default-Privileges).
>
> **Damit fällt die Prämisse von `CONTEXT` §9:** „Ab dem Moment, in dem `email`
> und `telefon` gefüllt sind, steht eine fertige Kontaktliste offen im Netz" ist
> falsch. **Die Anreicherung ist nicht blockiert** und braucht keine Vorarbeit.
>
> **Der Fehlschluss:** Aus der RLS-Policy (`OR ist_aktiv = true`, gilt für
> `anon`) wurde auf Lesbarkeit geschlossen. Eine Policy entscheidet, **welche
> Zeilen** sichtbar sind — ein GRANT entscheidet, **ob überhaupt** und welche
> Spalten. Beide Ebenen müssen zusammen gemessen werden, und zwar mit dem
> Key der betroffenen Rolle: `execute_sql` läuft als `postgres` und beweist
> über Views und Grants nichts.
>
> **Was bleibt:** Die View `sv_leads_map_pins` (Migration
> `20260818163928`) ist gebaut und liefert für anon dieselben Pins. Sie ist
> **Härtung, kein Fix** — sie entkoppelt den Finder von der Policy-Klausel,
> sodass diese später entfernt werden *könnte*, ohne die Dead-Pins zu löschen.
> Die Code-Umstellung von `ladeSvLeads()` und die Policy-Verschärfung sind damit
> **optional und nicht dringend**, nicht mehr Voraussetzung für Welle 7.

Der ursprüngliche Befund zum Lesepfad bleibt als Bestandsaufnahme gültig:

`WELLEN_PLAN` Welle 7 verlangt als Abbruchkriterium die Prüfung, ob eine öffentliche Ansicht
`sv_leads` mit `ist_aktiv = true` über den anon-Key liest.

**Geprüft am 18.08.2026: ja, zwei Stellen.** `ladeSvLeads()` in
`src/lib/actions/gutachter-finder-actions.ts` (und die Zwillingsdatei unter
`claimondo-marketing/lib/`) liest über den **anon-Client mit RLS**:

```ts
export async function ladeSvLeads() {
  // Privacy: sv_leads sind Tier-3 Excel-Importe ohne Pakete. Auf der Karte
  // erscheinen sie als Dead-Pins ohne Popup — wir reichen daher KEINE
  // identifizierenden Felder raus (kein name, firma, adresse, telefon, email).
  const supabase = await createClient()        // ← nicht createAdminClient
  const { data, error } = await supabase
    .from('sv_leads')
    .select('id,lat,lng')                      // ← nur diese drei Spalten
    .eq('ist_aktiv', true)                     // ← genau die Policy-Bedingung
```

Die Nachbarfunktion `ladeAktiveSVs()` kommentiert sich selbst mit „Read 1 (anon-RLS)" — der
anon-Pfad ist hier Absicht, nicht Versehen.

**Öffentliche Consumer:**

| Consumer | öffentlich? |
|---|---|
| `src/app/embed/gutachter-finder/page.tsx` | ja — **läuft als Embed auf fremden Websites** |
| `claimondo-marketing/app/[locale]/kfz-gutachter/vermittlungsportale-vergleich/page.tsx` | ja — Marketing-Seite ohne Login |

`FinderMap.tsx` rendert die 62 Leads als **Dead-Pins** (Kommentar dort: „Aaron 12.06.: die
Dead-Pins müssen …") — sie sind eine bewusste Produktentscheidung, kein Altlast-Zufall.

> **Konsequenz:** Die in `CONTEXT` §9 vorgeschlagene Policy-Verschärfung würde beide Karten
> leeren. Sie darf **nicht** so ausgeführt werden, wie sie dort steht.

**Der Lösungsweg steht bereits in `CONTEXT` §9** („braucht diese Ansicht eine eigene View mit
genau den Spalten, die öffentlich sein dürfen") und passt hier exakt, weil die Action ohnehin
nur drei Spalten zieht:

```sql
-- 1. View mit genau den Spalten, die öffentlich sein dürfen.
--    security_invoker AUS ist hier gewollt: die View liest mit Owner-Rechten,
--    anon bekommt Zugriff auf die View, nie auf die Tabelle.
create view public.sv_leads_map_pins with (security_invoker = off) as
  select id, lat, lng from public.sv_leads where ist_aktiv = true;

-- 2. Grant ist Pflicht — neue public-Objekte granten anon von sich aus nichts.
grant select on public.sv_leads_map_pins to anon, authenticated;

-- 3. ERST DANACH die Basistabelle schließen.
drop policy sv_leads__b1sel on public.sv_leads;
create policy sv_leads__b1sel on public.sv_leads
  for select to authenticated
  using (is_staff() or exists (
    select 1 from profiles where id = auth.uid() and rolle = 'admin'));
```

**Die Reihenfolge ist nicht verhandelbar:** View + Grant + beide `ladeSvLeads()` auf die View
umstellen + **deployen**, und erst dann die Policy. Wer die Policy zuerst setzt, hat zwischen
Migration und Deploy eine leere Karte im Embed auf Kundenseiten.

Damit bleibt die eigentliche Absicht erhalten: Ab dem Moment, in dem `email` und `telefon`
gefüllt sind, darf `sv_leads` nicht mehr offen lesbar sein — eine fertige
Wettbewerber-Kontaktliste, von uns zusammengetragen. Die View gibt weiterhin nur `id`, `lat`,
`lng` heraus und wächst nicht mit der Anreicherung mit.

**Diese Änderung fasst Bestandscode an** (`gutachter-finder-actions.ts` in beiden Bäumen) und
liegt damit außerhalb der in `CONTEXT` §2 erlaubten Dateiliste. Sie gehört als eigener,
abgenommener Schritt in Welle 7 — nicht als Nebenwirkung der Anreicherung.

> **Wie der Fehlschluss entstand** (damit er sich nicht wiederholt): Eine erste Prüfung listete
> je Datei auf, *welche* Supabase-Clients darin vorkommen — nicht, *welcher Client zu welchem
> Query* gehört. `gutachter-finder-actions.ts` enthält beide, und die Datei galt damit
> fälschlich als Admin-Client-Leser. Die Zuordnung muss pro Query geprüft werden, nicht pro Datei.

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
| Weg A ohne Website (ohne `gbp`, `web`, `seo`, `ux`, `gsc`) | 80 | Score |
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

**Was die Eigenständigkeit kostet — und was dagegen zu tun ist.** Ein eigener Top-Level-Build
liegt außerhalb *aller* Schutzmechanismen des Hauptprojekts. Nachgeprüft am 18.08.2026:

| Mechanismus | Reichweite | Folge für `sv-levelup/` |
|---|---|---|
| Root-`tsconfig.json` | `include: **/*.ts` | **zog `sv-levelup/` mit hinein** → korrigiert: in `exclude` aufgenommen |
| Root-`eslint.config.mjs` | alles außer `autounfall-io/**` | **griff durch** → korrigiert: `sv-levelup/**` ignoriert, eigene Config angelegt |
| Root-`vitest.config.ts` | `include: src/**` | sieht die Tests nicht |
| `knip.json` | `project: src/**` | sieht die Dateien nicht |
| alle ~20 Ratchets | `git ls-files "src/**"` | greifen nicht |

Die ersten beiden Zeilen waren echte Fehler und sind behoben. Die übrigen drei sind richtig so —
aber zusammen bedeuten sie: **die 140 Unit-Tests liefen nirgends automatisch.** Das ist exakt
die Lücke, die beim Schwesterprojekt `claimondo-marketing` erst am 17.08.2026 auffiel, nachdem
seine 23 Test-Files monatelang in keiner Pipeline liefen. Deshalb steht im `vitest`-Job der
CI drei Schritte für `sv-levelup` (Deps, Typecheck, Unit-Tests) — ohne Ratchet und ohne
Baseline, weil der Bestand vollständig grün ist und es keine Schuld zu grandfathern gibt.

Der Typecheck gehört zwingend dazu: der Anreicherungs-Schreibpfad arbeitet gegen einen
**ungetypten** Supabase-Client (`createClient` ohne `Database`-Generic). `tsc` prüft
Spaltennamen dort nicht — eine falsche Spalte fängt nur die Testsuite.

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

### 5.5 Die Kette: vom Scrape zur Konvertierung

Cold Mail ist keine Welle am Ende, sondern der Vertriebsweg, für den alles andere gebaut wird.
Die Übergabe-Specs decken die Glieder 2 bis 6 ab. **Glied 1 fehlt vollständig** — und ohne
Glied 1 ist die Strategie nach einmaligem Durchlauf zu Ende.

```
① GEWINNEN    Places-Discovery über DE          → sv_leads       ← FEHLT in allen Specs
② ANREICHERN  Website finden, Impressum lesen   → email, telefon   F-15/F-16
③ MESSEN      Massenlauf, Teilbefund je Lead    → levelup_checks   F-17
④ ANSPRECHEN  Sequenz mit dem echten Befund     → cold_mail_*      F-21/F-22
⑤ ANTWORTEN   Enrollment auf 'geantwortet'      → tasks            F-22
⑥ GESPRÄCH    Auswertungslink, Plan, Leitfaden  → /auswertung      §5.3
⑦ KONVERTIEREN Lead wird Partner-SV             → sachverstaendige §5.4
```

#### 5.5.1 Warum 62 Leads keine Strategie sind

Alle 62 stammen aus `quelle = 'excel_import_2026-05-11'`. Es gibt **keinen Zufluss** — kein
Formular, kein Scraper, kein wiederkehrender Import. Die Liste ist endlich und einmalig.

Der Markt dahinter: Der BVSK schätzt **rund 10.000 Kfz-Sachverständige** in Deutschland, davon
**5.000 bis 6.000 freie und unabhängige Gutachter** — das ist die Zielgruppe, weil an
Prüforganisationen gebundene SVs ihre Aufträge über die Organisation beziehen. Eine
Firmendatenbank zählt 5.471 Einträge (Stand 29.07.2026), 84,6 % davon Kleingewerbe oder
Freiberuf, allein 1.564 in Nordrhein-Westfalen.

**Die 62 sind gut 1 % des adressierbaren Marktes.** Bei realistischen Kaltmail-Quoten ergeben
sie zwei bis fünf Antworten — einmalig. Dieselbe Mechanik auf 2.000 anschreibbare Leads
angewendet ergibt eine laufende Pipeline.

#### 5.5.2 Lead-Gewinnung — das Muster existiert bereits

`docs/superpowers/specs/2026-08-01-apotheken-scraper-design.md` beschreibt exakt diese Aufgabe
für Apotheken, ist von Aaron abgenommen und in wesentlichen Teilen übertragbar:

| Stufe | Apotheken-Scraper | für SV-Leads |
|---|---|---|
| ① Discovery | Quadtree über DE, Text Search, `place_id`-Dedup, Verfeinerung bei 60-Treffer-Cap | identisch, `textQuery="Kfz-Sachverständiger"` / `"Kfz-Gutachter"` |
| ② Fetch | Startseite + Impressum, robots.txt, ≥2 s je Host, HTML-Cache | identisch — **ist F-15/F-16** |
| ③ Extract | Regex für E-Mail, Telefon, Inhaber (~70–80 % gratis) | identisch |
| ④ Enrich | Haiku nur für unsichere Felder | identisch |
| ⑤ Classify | Größen-Tier aus `userRatingCount` | Sichtbarkeits-Bedarf statt Größe (§5.5.4) |
| ⑥ Export | XLSX/CSV | **entfällt** — Ziel ist `sv_leads`, nicht eine Datei |

**Der wesentliche Unterschied:** Der Apotheken-Scraper ist ein eigenes Repo mit SQLite und
Datei-Export. Für SV-Leads ist das Ziel die Produktionstabelle `sv_leads`, also läuft die
Pipeline gegen Supabase und respektiert die Dublettenerkennung aus `CONTEXT` §5
(`normalized_name` + PLZ innerhalb 10 km). `place_id` kommt als zusätzlicher, härterer
Dedup-Schlüssel dazu — er ist stabil, während Namen variieren.

```sql
alter table public.sv_leads
  add column google_place_id text unique,     -- härtester Dedup-Schlüssel
  add column entdeckt_am     timestamptz,
  add column entdeckt_lauf   uuid;            -- welcher Discovery-Lauf
```

`quelle` bleibt das Textfeld und bekommt den Wert `'places_discovery'` statt
`'excel_import_2026-05-11'`.

#### 5.5.3 Das Nebenprodukt, das nichts kostet

Jeder `wett`-Lauf ruft die Sachverständigenbüros im 50-km-Umkreis ab — in Münster 154 Stück.
Diese Daten sind bereits abgerufen und bezahlt. **Sie in `sv_leads` zu schreiben ist ein
zusätzlicher Schreibpfad, kein zusätzlicher Abruf.**

Damit füttert jeder durchgeführte Check die Lead-Datenbank. Bei 25 Checks im Monat sind das
mehrere tausend Büro-Sichtungen, die über `place_id` sauber dedupliziert werden. Der
Deutschland-Scrape aus §5.5.2 ist der Grundstock, dieser Pfad hält ihn aktuell.

**Regel:** Der Schreibpfad läuft nur über `service_role` in einer Server Action, schreibt
ausschließlich Stammdaten (Name, Adresse, PLZ, Ort, Koordinaten, `place_id`) und **nie** in
`partner_leads` oder `leads` (R-M).

#### 5.5.3a Was die Anreicherung am echten Bestand leistet — gemessen, nicht geschätzt

Zwei vollständige Trockenläufe über alle 62 Leads am 18.08.2026, jeweils ohne Schreibzugriff.
Ausgangslage: **alle 62 Leads haben 0 E-Mail-Adressen, 0 Telefonnummern, 0 Websites.** Die
Cold-Mail-Strategie hat ohne diesen Schritt buchstäblich keine Adresse.

| | Websites | davon belastbar (≥ 70) | E-Mail | Telefon | Person |
|---|---|---|---|---|---|
| **Lauf 1** (naive Kandidaten) | 43 (69 %) | **16 (26 %)** | 19 (31 %) | 22 (35 %) | 7 (11 %) |
| **Lauf 2** (korrigiert) | 49 (79 %) | **24 (39 %)** | 22 (35 %) | 22 (35 %) | 11 (18 %) |

**Jede Zahl ist besser, obwohl Lauf 2 die strengere Regel fährt.** Die Kandidaten-Korrekturen
erschließen mehr echte Treffer, als die Kontakt-Schwelle an falschen entfernt. Ohne Treffer
blieben 13 Leads statt 19; belastbare Zuordnungen stiegen von 15 auf 23.

**27 der 43 Treffer lagen unter Sicherheit 70** — also bei bloßer Namensähnlichkeit. Die
Ursache war nicht Pech, sondern eine Klasse: der Domain-Kern wurde aus Gattungswörtern,
Titeln und Vornamen gebildet.

| Lead | geratene Domain | was das ist |
|---|---|---|
| `Ing.-Büro Urbach KG` | `sv-ing.de` | „Ing." = Abkürzung für Ingenieur |
| `Dipl.-Ing. W. Lütz GmbH` | `dipl.de` | akademischer Titel |
| `Michael Schneider GmbH` | `michael.de` | Vorname |
| `Sachverständigenbüro Tobias Busse` | `tobias.de` | Vorname |
| `KFZ-Sachverständigenbüro AL Inh. Tarkan Al` | `al.de` | zwei Buchstaben |
| `Brockmann Ingenieure GmbH` | `brockmann.de` | häufiger Familienname |

Der letzte Fall zeigt den Schaden am deutlichsten: aus `brockmann.de` wurden **E-Mail, Telefon,
Vorname und Nachname** übernommen — eine vollständige fremde Identität im Lead. Daraus folgen
die drei Korrekturen, die Lauf 2 zugrunde liegen:

1. **Gattungswörter, Titel und Füllwörter streichen** (`ing`, `inh`, `dipl`, `dr`, `für`,
   `fahrzeugtechnik`, `pruefstelle`, …) — `kern-name.ts`.
2. **Auch aus dem letzten Kernwort Kandidaten bilden.** Bei „Inh. Harald Lange" ist der
   Nachname das letzte Wort; wer nur das erste nimmt, rät `harald.de` statt `sv-lange.de`.
3. **Kontaktdaten erst ab Sicherheit 70** — die Verschärfung gegenüber `CONTEXT` §5, begründet
   in §5.5.3b.

Nebenbefund: die Filialstruktur (§5.5.6 Punkt 3) führte dazu, dass dieselbe Website bis zu
viermal abgerufen wurde. Ein Seiten-Cache über die Laufzeit behebt das — weniger Last auf
fremden Servern bei identischem Ergebnis.

#### Der Austausch im Detail — warum eine Firma weniger ein Gewinn ist

Auf Lead-Ebene stiegen die E-Mail-Treffer von 19 auf 22. Auf **Firmen**-Ebene sanken sie von 15
auf 14. Beides stimmt, und die Differenz ist die eigentliche Aussage: die Zugewinne fallen bei
Filialen derselben Firma an (Lütz allein bringt vier Lead-Zeilen), während auf Firmenebene
tatsächlich getauscht wurde.

| | Firma | Lauf 1 | Lauf 2 |
|---|---|---|---|
| **raus** | Sachverständigenbüro Marc Limburg | `marc.de` (40) | verworfen |
| | Brockmann Ingenieure GmbH | `brockmann.de` (40) | verworfen |
| | Ingenieurbüro Schuppert & Tenne | `schuppert.de` (40) | verworfen |
| | Lange & Brandenburg Ingenieurbüro | `sv-lange.de` (40) | verworfen |
| | Kfz Gutachtenzentrum Rheinland | `gutachtenzentrum.de` (40) | verworfen |
| **rein** | Ing.-Büro Urbach KG | `sv-ing.de` (40) | `kfz-gutachter-urbach.de` (90) |
| | Dipl.-Ing. W. Lütz GmbH | `dipl.de` (40) | `luetz.de` (90) |
| | Ingenieurbüro Dipl.-Ing. Dirk Zager | *kein Treffer* | `sv-zager.de` (90) |
| | Sachverständigenbüro Tobias Busse | `tobias.de` (40) | `sv-busse.de` (100) |

Fünf Zuordnungen bei bloßer Namensähnlichkeit fielen weg, vier belegte kamen hinzu. **Netto eine
Firma weniger — aber vorher waren 15 Adressen zu einem unbekannten Teil fremd, jetzt sind 14
belegt.** Für eine Kaltansprache ist das kein Verlust, sondern der Unterschied zwischen einer
Liste, der man trauen kann, und einer, der man nicht trauen kann.

#### Vier Fehler, die erst der scharfe Lauf zeigte

Die 140 Unit-Tests waren grün, beide Trockenläufe vollständig, die Trefferquoten plausibel.
Trotzdem lieferte der **erste Schreibzugriff auf fünf echte Leads** vier Befunde, die kein Test
gefunden hätte — weil sie alle in der Form „Wert vorhanden, Wert unbrauchbar" auftreten:

| # | Was in der Datenbank stand | Ursache | Folge |
|---|---|---|---|
| 1 | `email = &#105;&#x6e;&#102;…` | Die Seite kodiert die Adresse als HTML-Entities gegen Spam-Ernter; der `mailto:`-Wert wurde roh übernommen | Eine unbrauchbare Adresse, die **gefüllt aussieht**. Der Versand wäre hart gescheitert |
| 2 | `vorname = "Herr"`, `nachname = "Patrick"` | „Geschäftsführer: **Herr** Patrick Brandenburg" — die Anrede rutschte in den Vornamen, der echte Nachname fiel hinten heraus | Eine Kaltmail hätte „Sehr geehrter Herr Patrick" geschrieben |
| 3 | `website_sicherheit = 90` neben `website_url = null` | Der Rückwärtsgang drehte nur die fünf Audit-Felder zurück; die Begleitspalten stehen nicht im Audit | Eine Sicherheitsangabe zu einer Website, die es nicht mehr gibt |
| 4 | `--limit 5` traf zweimal **verschiedene** Leads | Alle 62 tragen denselben `erstellt_am` (ein Import); ohne Tiebreaker gibt PostgreSQL keine Reihenfolge | Teilläufe nicht reproduzierbar, abgebrochener Massenlauf nicht fortsetzbar (**P6**) |

Alle vier sind behoben, jeder mit einem zuerst roten Test. Zwei davon haben zusätzlich einen
**Auffangschutz** bekommen, der auch die Varianten fängt, die hier nicht vorhergesehen sind:
eine E-Mail muss nach dem Deuten die Form einer Adresse haben, ein Name muss aus zwei Teilen
bestehen — sonst gibt es keinen Wert. R-B in seiner härtesten Lesart: **lieber kein Wert als
einer, der gefüllt aussieht.**

Die Lehre gehört in den Plan für P6: Ein Massenlauf über tausende Betriebe darf nicht als erster
Schreibzugriff auf echte Daten stattfinden. Ein scharfer Lauf über wenige Datensätze mit
anschließender Sichtprüfung **jedes einzelnen Feldes** ist der Schritt, der diese Klasse findet —
Trockenläufe zeigen sie nicht, weil dort niemand die Werte anschaut.

#### Was das für die Strategie heißt

**Von 45 Firmen sind nach der Anreicherung 14 per E-Mail oder Telefon erreichbar (31 %).** Ohne
die Anreicherung wären es null — insofern trägt der Schritt. Für eine Kampagne sind 14 Firmen
aber keine Grundlage. Das bestätigt §5.5.1 mit gemessenen Zahlen statt einer Vermutung: **der
Hebel ist die Lead-Gewinnung (§5.5.2), nicht die Aufbereitung des Bestands.** Die 62 Zeilen sind
nach dieser Runde ausgereizt; der Deutschland-Scrape ist es, der den Trichter füllt.

#### 5.5.3b Warum Kontaktdaten eine höhere Schwelle brauchen als Websites

`CONTEXT` §5 sieht vor, Funde unter Sicherheit 70 zu schreiben und in der Vertriebsliste als
unsicher zu markieren. Für die **Website** ist das richtig: sie ist ein Rechercheanhaltspunkt,
und zwischen Eintrag und Nutzung steht ein Mensch, der beim Draufschauen korrigiert.

Für **Kontaktdaten** trägt dieselbe Regel nicht, weil zwischen Markierung und Versand kein
Mensch mehr steht. Eine E-Mail-Adresse mit Sicherheit 40 ist kein Hinweis, sondern ein Kanal:
die Sequenz versendet automatisiert. Der Empfänger wäre ein Unbeteiligter, der nicht einmal
zur Zielgruppe gehört — § 7 Abs. 2 UWG gegenüber einem Dritten, plus Schaden an der
Absender-Reputation, der die gesamte Kampagne trifft.

**Verbindlich:** `email`, `telefon`, `vorname`, `nachname` werden nur ab
`KONTAKT_MINDESTSICHERHEIT = 70` geschrieben; darunter erscheinen sie mit Grund in
`uebersprungen`. `website_url` wird weiterhin auch darunter geschrieben — mit
`website_sicherheit` als Warnung, wie die Übergabe-Spec es vorsieht.

**Die Schwelle prüft die Zuordnung der Quelle, nicht die Belastbarkeit des Werts.** Das ist
keine Feinheit, sondern der Unterschied zwischen einer funktionierenden und einer nutzlosen
Regel. Ein Fund trägt zwei verschiedene Zahlen:

| Feld | Bedeutung | Beispiel `zentrale@sv-wester.de` |
|---|---|---|
| `zuordnung` | Gehört die Quelle zu **diesem** Lead? | 100 — Firmenname, Ort und PLZ stimmen |
| `sicherheit` | Wie belastbar ist **dieser Wert**? | 60 — Rollenadresse, keine benennbare Person (T-25) |

Die erste Fassung dieser Regel prüfte `sicherheit` — und verwarf damit **jede** Rollenadresse,
weil T-25 sie auf 60 kappt. Bei Kfz-Sachverständigen ist `info@` / `kontakt@` / `zentrale@` die
mit Abstand häufigste Impressumsadresse; die Regel hätte die Cold-Mail-Basis fast vollständig
zerstört, während sie vorgab, sie zu schützen. Aufgefallen ist es nur, weil ein Lead im
Nachher-Lauf eine E-Mail verlor, die er im Vorher-Lauf hatte. Die Kappung auf 60 bleibt
erhalten — sie steht im Audit und sagt der Ansprache, dass keine persönliche Anrede möglich ist.

Folge für die Erwartung: **die gemessene Trefferquote bei Kontaktdaten sinkt durch diese Regel.**
Das ist der Zweck. Eine E-Mail-Quote von 31 %, bei der zwei Drittel fremde Adressen sind, ist
für eine Kaltansprache schlechter als eine Quote von 12 % aus belastbaren Zuordnungen.

#### 5.5.4 Zwei Preisstufen für zwei Zwecke

Die Feldwahl entscheidet über die SKU-Stufe — und damit über den Preis (§7):

| Zweck | Felder | Stufe | Gratis/Monat |
|---|---|---|---|
| **Lead-Discovery** | `id`, `displayName`, `formattedAddress`, `addressComponents`, `location` | **Pro** | 5.000 |
| **Messung** (`wett`, `markt`, `gbp`) | zusätzlich `rating`, `userRatingCount`, `websiteUri` | **Enterprise** | 1.000 |

Für die Lead-Gewinnung reichen die Pro-Felder: Kontaktdaten kommen ohnehin aus dem Impressum
(F-16), die Website wird per Domainraten gefunden (F-15). **Der Deutschland-weite Scrape läuft
damit vollständig im Gratiskontingent** (§7).

Bewertungszahlen sind für die **Lead-Priorisierung** trotzdem wertvoll — und zwar umgekehrt zur
Intuition: Ein Büro mit null Bewertungen hat den größten Sichtbarkeits-Bedarf und ist damit der
beste Kandidat für SV-LevelUp, nicht der schlechteste. Diese Abfrage lohnt sich aber erst für
die Leads, die tatsächlich in eine Kampagne gehen — gezielt und in Enterprise, statt pauschal
für 5.500 Datensätze.

#### 5.5.5 Trichter und Kapazität

| Stufe | Menge | Grundlage |
|---|---|---|
| freie Kfz-SV in DE | ~5.500 | BVSK-Schätzung, Firmendatenbank 5.471 (29.07.2026) |
| davon per Discovery gefunden | 90 % ≈ 5.000 | Erfolgskriterium analog Apotheken-Scraper |
| davon mit Website | **40–70 %** ≈ 2.000–3.500 | **Annahme, der erste Lauf misst sie** |
| davon E-Mail im Impressum | ~60 % ≈ 1.200–2.100 | Erfolgskriterium Apotheken-Scraper |
| **anschreibbar** | **grob 1.500–2.000** | |

Die Website-Quote ist bewusst als Spanne angegeben. Die Münsterland-Erhebung prüfte 42 Domains
bei 154 Büros — ob das die Zahl der vorhandenen Websites war oder die Deckelung des
Breitenschnitts (`seiten_check.py`: „bis zu 50 Domains"), ist aus den Unterlagen nicht
entscheidbar. **Der erste Discovery-Lauf beantwortet das und ist die Grundlage jeder weiteren
Planung.** Bis dahin wird nicht hochgerechnet (R-B).

**Versandkapazität** nach `CONTRACT` F-22: höchstens 20 Mails je Lauf, 40 am Tag, werktags 9–17 Uhr.
Das sind 800 im Monat. Bei 2.000 anschreibbaren Leads und einer Sequenz aus vier Schritten
dauert eine vollständige Welle **vier bis sechs Monate** — inklusive Warmup, der in der ersten
Woche bei etwa zehn Mails am Tag beginnt.

Diese Zahl ist die eigentliche Planungsgröße: Nicht die Zahl der Leads begrenzt die Strategie,
sondern die Zustellrate einer neuen Absenderdomain.

#### 5.5.6 Was auf dem Weg zur Mail entschieden sein muss

Die Mechanik ist in `CONTRACT` F-21 bis F-23 und `CONTEXT` §11 vollständig beschrieben und wird
unverändert übernommen: `sv_lead_id` auf den drei `cold_mail_*`-Tabellen mit
`num_nonnulls(...) = 1`, eigener Absender je Sequenz, Validator R-N (Herkunftsangabe und
Abmeldelink in jeder Vorlage), Suppression-Prüfung R-O vor **jedem** Send, Ein-Klick-Abmeldung
ohne Rückfrage.

Drei Dinge, die dort nicht stehen und ohne die eine Kampagne nicht laufen darf:

1. **Der Befund in der Mail ist ein Teilbefund.** Der Massenlauf misst höchstens sechs von
   siebzehn Modulen (§3.4). Es gilt `kein_score = true`. **Die Vorlagen dürfen deshalb keinen
   Score nennen** — nur einzelne gemessene Werte, jeder mit Quelle und Datum, plus die
   ausdrückliche Nennung dessen, was nicht geprüft wurde (`DURCHSPRACHE` §4). Ein „Ihr
   Sichtbarkeits-Score liegt bei 31" in einer Mail an einen Fremden verletzt R-A und R-B
   gleichzeitig.
2. **Wer die Antworten liest, und in welcher Frist.** `DURCHSPRACHE` §2 stellt die Frage, die
   Übergabe-Spec beantwortet sie nicht. Eine unbeantwortete Antwort auf eine Kaltmail ist
   schlechter als keine Kaltmail. Vorschlag: Das Enrollment geht bei einer Antwort auf
   `geantwortet`, und derselbe `tasks`-Mechanismus wie bei einem Terminwunsch (§5.2) legt eine
   Aufgabe mit Frist an — mit `typ = 'levelup_antwort'`.
3. **Der Adressat ist die Firma, nicht der Lead.** Am Bestand gemessen (18.08.): die 62 Leads
   sind **45 Firmen**; 9 davon haben mehrere Standorte, zusammen 17 Filialzeilen. Die
   `Dipl.-Ing. W. Lütz GmbH` steht viermal drin (Overath, Waldbröl, Rösrath, Bergisch Gladbach),
   `Ing.-Büro Urbach KG` dreimal. Ein Versand je `sv_lead_id` schickt derselben Firma vier
   Mails — das ist der kürzeste Weg von einem Interessenten zu einer Beschwerde nach § 7 UWG.
   **Vor jedem Send muss auf Firmenebene entdoppelt werden**; der belastbarste Schlüssel ist die
   gefundene Domain (eine Firma hat eine Website), ersatzweise `kernName(firma)`. Für den
   *Sichtbarkeits-Check* bleibt dagegen die Filiale die richtige Einheit — jeder Standort hat
   eigene lokale Sichtbarkeit. Die beiden Einheiten sind verschieden und dürfen nicht
   vermischt werden.

**Rechtlich getrennt zu betrachten** — der Apotheken-Scraper hält es genauso:

- **Erhebung** aus Impressen ist als berechtigtes Interesse nach Art. 6 Abs. 1 lit. f DSGVO im
  B2B-Kontext tragbar. Art. 14 verlangt die Information der Betroffenen innerhalb eines Monats —
  die Herkunftsangabe in jeder Mail erfüllt das, für nicht angeschriebene Leads bleibt es offen.
- **Werbliche Ansprache** fällt unter § 7 Abs. 2 UWG und braucht eine eigene Grundlage. Die
  Ausnahme in § 7 Abs. 3 setzt eine bestehende Kundenbeziehung voraus, die hier nicht besteht.
- **Google-Places-Nutzungsbedingungen** beschränken die dauerhafte Speicherung von Places-Inhalten.
  `place_id` darf unbegrenzt gespeichert werden; selbst erhobene Anreicherungsdaten sind
  unkritisch. Als internes Vertriebswerkzeug in dieser Größenordnung ist das Risiko gering,
  gehört aber auf die Tagesordnung.

Das Scrapen ist damit **unabhängig vom Versand baubar und nutzbar** — die angereicherte Basis
trägt Telefonakquise, Messeansprache und Postweg genauso. Fällt die Entscheidung in A-5 gegen
Cold Mail, bleibt die Arbeit aus ① bis ③ vollständig werthaltig.

> *Hinweise, keine Rechtsberatung.*

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

### 7.1 Ein Vollcheck

| Posten | SKU | Calls | $/1000 | $ |
|---|---|---|---|---|
| `wett` — 50-km-Raster | Text Search **Enterprise** | ~20 | 35,00 | 0,70 |
| `markt` — 6 Vergleichsmärkte | Text Search **Enterprise** | ~12 | 35,00 | 0,42 |
| `zuweiser` — 25 km, drei Typen | Text Search **Enterprise** | ~6 | 35,00 | 0,21 |
| `gbp` — Profil finden | Text Search **Enterprise** | 1 | 35,00 | 0,04 |
| `gbp` — Profildaten | Place Details **Enterprise** | 1 | 20,00 | 0,02 |
| Standort | — | — | — | 0 (aus `plz_geo`) |
| **Summe** | | **~40** | | **~1,39 $ ≈ 1,27 €** |

> **Enterprise, nicht Pro — das ist der teure Teil.** Die Stufe richtet sich nach den
> angeforderten Feldern, und **`rating`, `userRatingCount` und `websiteUri` sind
> Enterprise-Felder** (geprüft 18.08.2026). Genau die tragen `wett` (Rang nach Bewertungszahl),
> `markt` (Median und 90.-Perzentil) und `zuweiser` (nennt die Werkstatt einen Gutachter?).
> Der Gratis-Anteil ist bei Enterprise **1.000 Calls im Monat**, nicht 5.000.

> **Text Search, nicht Nearby Search.** Nearby Search filtert über `includedTypes`, und für
> „Kfz-Sachverständiger" existiert kein Places-Typ. Freitext ist Pflicht. Nur der Werkstatt-Teil
> von `zuweiser` könnte `car_repair` per Nearby Search abfragen — gleicher Preis, gleiche Stufe,
> daher ohne Gewinn. Beide SKUs sind derzeit gesperrt (A-1).

Alle übrigen dreizehn Module: **0 €** (eigener Crawl, PageSpeed, SSL Labs, Verzeichnisse,
Autocomplete, Ads-API, Meta-API, GSC-API, lokale Statistik) — nur Serverzeit, ~3–5 min CPU.

**Gratiskontingent:** 1.000 Enterprise-Calls im Monat, bei ~39 Calls je Vollcheck:

- **bis ~25 Checks im Monat: 0 €**, danach ~1,27 € je Check
- mit Markt-Cache (die sechs Vergleichsmärkte sind je Region identisch — einmal monatlich statt
  je Check): ~27 Calls → **bis ~37 Checks gratis**, danach ~0,89 €
- **Massenlauf über die 62 Bestandsleads: 0 €**, solange die Places-Module ausgeschlossen sind

### 7.2 Der Deutschland-weite Lead-Scrape

Hier greift die Trennung aus §5.5.4: Discovery braucht keine Enterprise-Felder.

| Posten | SKU | Calls | $/1000 | $ |
|---|---|---|---|---|
| Quadtree über DE, ~5.500 SV bei 20 je Seite | Text Search **Pro** | 800–2.000 | 32,00 | 26–64 |
| Website + Impressum je Lead | eigener Crawl | — | — | 0 |
| Extraktion (Regex, ~70–80 %) | — | — | — | 0 |
| Extraktion (Haiku-Fallback für den Rest) | Haiku 4.5 | ~1.500 × 2k Token | — | ~2 |

**Gratiskontingent Pro: 5.000 Calls im Monat.** Ein Discovery-Lauf über ganz Deutschland passt
vollständig hinein — **einmalig 0 €**, wenn er in einem Kalendermonat gefahren wird. Selbst die
obere Schätzung von 2.000 Calls lässt 3.000 Calls Luft für laufende Nachläufe.

> Die Lead-Basis für die gesamte Cold-Mail-Strategie kostet damit praktisch nichts. Der
> Kostenblock liegt bei den **Checks**, nicht bei den Leads.

### 7.3 Sprachmodell, optional

Falls Befundtexte generiert statt getemplatet werden (~15 k Input, ~6 k Output je Check):
Haiku 4.5 ≈ 0,04 € · Sonnet 5 ≈ 0,08 € · Opus 5 ≈ 0,21 €. Der Maßnahmenplan selbst wird
**abgeleitet, nicht generiert** (F-11) — ein Modell wäre nur für die Formulierung der
Einordnungen nötig. Im Scraper übernimmt Haiku den Fallback für Impressum-Felder, die der
Regex-Layer nicht sicher trifft (§7.2).

### 7.6 Legacy oder New? — die Entscheidung, die vor dem ersten Places-Modul fällt

Gemessen am 18.08.2026 mit dem vorhandenen Key: die **Legacy Places API läuft, die New ist
gesperrt**. Beide sind gangbar, und sie unterscheiden sich nicht nur im Preis.

| | Legacy (`maps.googleapis.com/maps/api/place/*`) | New (`places.googleapis.com/v1/*`) |
|---|---|---|
| Zugang heute | **läuft** | 403, braucht einen Klick in der Console |
| Freitext + Radius | **Nearby Search mit `keyword`** — genau was `wett`/`zuweiser` brauchen | nur `includedTypes`; für „Kfz-Sachverständiger" existiert **kein Typ** → nur Text Search mit `locationBias` |
| Treffer je Anfrage | 20, mit `next_page_token` bis **60** | 20, **kein Paging** bei Nearby |
| Feld-/Preisstufen | Basic / Contact / Atmosphere Data | Essentials / Pro / Enterprise |
| Zukunft | für neue Kunden geschlossen; Bestandsprojekte laufen weiter, **ohne Zusage** | die Variante, die Google weiterentwickelt |

**Empfehlung:** Die Restriction um „Places API (New)" erweitern und **auf New bauen** — das
Kostenmodell in §7.1/§7.2 ist darauf gerechnet, und Legacy ist ein Auslaufpfad, auf dem man
keine Strecke aufbauen will, die vier bis sechs Monate laufen soll.

**Aber:** Legacy ist der bessere Sofort-Start und für den Deutschland-Scrape sogar bequemer
(Freitext-`keyword` mit Radius und 60 statt 20 Treffern je Kachel spart Quadtree-Ebenen). Wer
zuerst Legacy baut, sollte die Abfrageschicht **hinter einem Adapter** kapseln, damit der Wechsel
ein Modultausch bleibt und nicht die Module berührt.

> **Offen, wenn Legacy gewählt wird:** Die Kostenrechnung in §7.1/§7.2 gilt für die New-API-SKUs.
> Legacy hat eigene SKUs und ein eigenes Gratis-Kontingent — das ist vor dem ersten Massenlauf
> gegen die aktuelle Preisseite zu prüfen, nicht zu schätzen.

### 7.4 Menschenzeit — der eigentliche Kostenblock

| | ohne erweiterte Restriction | mit |
|---|---|---|
| `wett` + `markt` + `zuweiser` (Kartenausschnitte, R-F2) | 30–45 min | 0 |
| `ads` (Transparenzcenter, nur Browser) | 10–15 min | 10–15 min |
| **je Check bei 60 €/h** | **45–60 €** | **10–15 €** |

Dazu das Gespräch (30 min plus Vor- und Nachbereitung ≈ 45 €), das unvermeidbar ist und den
Zweck des Ganzen darstellt.

> Die Erweiterung der Key-Restriction kostet nichts und spart 35–45 € Menschenzeit je Check.
> Ohne sie ist der Deutschland-Scrape ebenso blockiert wie Weg A — beide brauchen Text Search.

### 7.5 Was die Strategie insgesamt kostet

| Posten | einmalig | laufend |
|---|---|---|
| Lead-Scrape über DE (Discovery Pro, im Gratiskontingent) | **0 €** | 0 € |
| Anreicherung 5.000 Leads (Crawl + Haiku-Fallback) | ~2 € | — |
| Massenlauf-Checks ohne Places-Module | 0 € | 0 € |
| Cold-Mail-Versand (Resend) | — | ~0,40 € je 1.000 |
| Vollchecks für Gesprächskandidaten | — | 0 € bis 25/Monat, danach 1,27 € |

Der Sachkostenblock der gesamten Kette liegt damit im **einstelligen Eurobereich pro Monat**,
solange die Vollchecks im Gratiskontingent bleiben. Was die Strategie wirklich kostet, ist die
Zeit für Gespräche — und genau die soll der Befund vorqualifizieren.

---

## 8 · Aufgaben außerhalb des Codes

| # | Aufgabe | Wer | Blockiert |
|---|---|---|---|
| A-1 | **„Places API (New)" zur Key-Restriction hinzufügen** (Projekt `67468726375`, Key in `GOOGLE_PLACES_API_KEY`). In der Console sind „Places API" und „Places API (New)" **zwei getrennte Einträge**; der Key hat nur die alte. Messung 18.08.: Legacy `maps.googleapis.com/maps/api/place/*` **funktioniert** (Nearby Search: 17 Treffer, Text Search mit `next_page_token`), New `places.googleapis.com/v1/*` gibt **403 `API_KEY_SERVICE_BLOCKED`**. **Kein Blocker mehr** — siehe §7.6 zur Wahl zwischen beiden APIs. | Aaron | nichts hart; New API wäre die zukunftssichere Variante |
| A-1b | **Enterprise-Kontingent im Auge behalten.** Nur 1.000 Gratis-Calls im Monat (§7.1); ein eigener Key oder Budget-Guard für die Discovery verhindert, dass ein Scrape-Lauf das Kontingent der Checks aufbraucht. Getrennte Keys für Discovery (Pro) und Messung (Enterprise) sind der einfachste Schnitt. | Aaron | Kostenkontrolle |
| A-2 | **VPS-root-Passwort rotieren** — es wurde am 18.08. im Klartext übermittelt. | Aaron | — |
| A-3 | DNS + NGINX-vhost + certbot für `sv-levelup.claimondo.de` | Aaron | Deployment |
| A-4 | Resend: Domain `sv-levelup.claimondo.de` verifizieren, SPF, DKIM, DMARC (`p=none` mit `rua`), Warmup | Aaron | Welle 10 (Versand) |
| A-5 | **Durchsprache nach `DURCHSPRACHE.md`** — rechtliche Grundentscheidung nach § 7 Abs. 2 UWG, die vier Vorlagen im Wortlaut, Startmenge, Abbruchschwelle, wer Antworten liest | Aaron + Anwalt | Scharfschalten der Sequenz |
| A-6 | Google-Ads-Konto (für `kwg`) und Meta-Business-Konto (für `kwm`) | Aaron | 22 der 150 Punkte |
| A-7 | Entscheidung: Wer übermittelt bei der Admin-Konvertierung das Anfangspasswort? | Aaron | §5.4 Variante (1) |
| ~~A-8~~ | ~~Freigabe für den Eingriff in Bestandscode~~ — **entfallen.** Am 18.08. mit dem anon-Key gemessen: das Leck existiert nicht, die Anreicherung ist nicht blockiert (§2.6). Die Code-Umstellung auf `sv_leads_map_pins` bleibt als **optionale Härtung** offen, ohne Dringlichkeit und ohne Blockerwirkung. | — | nichts |

**A-5 bleibt ein Menschenklick.** `cold_mail_sequenzen.aktiv` und `auto_enroll` werden vom Code
nie auf `true` gesetzt — auch nicht zum Testen.

---

## 9 · Wellenschnitt

Die zehn Wellen aus `WELLEN_PLAN.md` bleiben in Reihenfolge und Zuschnitt. Änderungen:

| Welle | Änderung |
|---|---|
| 1 | zusätzlich `levelup_auswertungslinks`, `zuweiser_treffer`, `gsc_*`, `google_place_id`; Registry mit 17 Modulen und 150 Punkten |
| 2 | Registry aus §3.1 statt aus dem Check-Mockup; Auswahl in vier Gruppen (§3.6) |
| 3 | Teilbefund-Schwelle relativ (`< 75`); Säulendiagramm zeigt `ist/soll` der Module |
| 4 | zusätzlich Lead-Spiegelung nach `tasks` (§5.2) |
| 5 | wandert in das eigene Projekt als `/auswertung/[token]` mit Staff-Gate; zusätzlich Konvertierungs-Knopf (§5.4) |
| 6 | unverändert |
| 7 | **Schritt A hat das Abbruchkriterium getroffen** (§2.6): zwei öffentliche Karten lesen `sv_leads` als anon. Reihenfolge zwingend — View `sv_leads_map_pins` + Grant, beide `ladeSvLeads()` umstellen, **deployen**, erst dann die Policy. Danach Anreicherung der 62. |
| **7b** | **NEU · Lead-Gewinnung** (§5.5.2): Quadtree-Discovery über DE nach dem Muster des apo-scrapers, Ziel `sv_leads`, Dedup über `google_place_id` + `normalized_name`/PLZ. Dazu der Nebenprodukt-Schreibpfad aus `wett` (§5.5.3). |
| 8 | Massenlauf-Tabelle aus §3.4 |
| 9 | unverändert (Präsentationslink bleibt vom Auswertungslink getrennt) |
| 10 | unverändert in der Mechanik; zusätzlich `typ='levelup_antwort'`-Aufgabe beim Enrollment-Wechsel auf `geantwortet` (§5.5.6) — endet weiterhin vor dem ersten Versand |

**Warum 7b nach 7 und nicht davor:** Die Anreicherungs-Pipeline (F-15/F-16) wird an den 62
Bestandsleads erprobt, wo Fehler überschaubar bleiben und die Trefferquote messbar ist. Erst
danach läuft dieselbe Pipeline über mehrere tausend Datensätze. Wer umgekehrt vorgeht,
debuggt an 5.000 Zeilen.

**Empfohlener Einstieg:** Welle 1 und 7 zusammen. Ohne E-Mail-Adressen ist keiner der 62 Leads
erreichbar; die Anreicherung ist die Voraussetzung für alles Weitere, und das offene Leseleck
gehört vorher geschlossen. Beides ist unabhängig von A-1 baubar — **7b nicht**, die Discovery
braucht Text Search.

---

## 10 · Was diese Spec nicht entscheidet

- **Die Textinhalte der vier Mailvorlagen.** Gegenstand von A-5.
- **Ob der Lead-Scraper ein eigenes Repo wird.** Der apo-scraper ist eines, weil er fachlich
  unabhängig ist und nach XLSX exportiert. Der SV-Scraper schreibt in `sv_leads` und teilt die
  Anreicherungslogik mit F-15/F-16 — das spricht für einen Platz im `sv-levelup`-Projekt.
  Entscheidung gehört in den Implementierungsplan, nicht hierher.
- **Die tatsächliche Website-Quote unter Kfz-Sachverständigen.** Aus den Unterlagen nicht
  entscheidbar (§5.5.5); der erste Discovery-Lauf misst sie. Bis dahin wird nicht hochgerechnet.
- **Die Formulierung der Befund-Einordnungen.** Die Bausteine in `scoring-modell.md` §10 sind
  ausdrücklich Ausgangspunkt, nicht Wortlaut.
- **Ob `ads` langfristig automatisierbar wird.** Solange R-F1 gilt, bleibt es Handarbeit.
- **Die Preisgestaltung dessen, was nach der Konvertierung verkauft wird.** Der Check nennt
  nie einen Preis (R-D); was ein Partner-Abo kostet, ist eine andere Entscheidung.
