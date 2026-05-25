# GEO Zwischenmessung — 24.05.2026 (Tag +14)

**Einordnung:** Diese Messung liegt zwischen der **Tag-0-Messung** (`geo-tag0-2026-05-10.md`, Live +1) und dem geplanten **4-Wochen-Re-Test** (~07.06.2026). Sie ist als _Zwischenstand-Indikator_ gedacht — kein Ersatz für den 4-Wochen-Re-Test, sondern Frühwarnsystem ob bis dahin überhaupt etwas in Bewegung kommt.

**Auslöser:** Aaron-Briefing „LLM-Baseline-Check Claimondo aus Geschädigten-Sicht" (24.05.2026).

## Methodischer Hinweis (wichtig)

Die Tag-0-Messung wurde von Aaron **manuell** in ChatGPT, Perplexity, Claude und Gemini durchgeführt. Diese Zwischenmessung kann das nicht 1:1 reproduzieren — die LLM-Web-Interfaces sind aus dieser Session nicht ansteuerbar. Stattdessen kommt die Baseline aus **zwei indirekten Evidenz-Strängen**, die in der Praxis sehr eng mit der LLM-Citation-Wahrscheinlichkeit korrelieren:

1. **Web-Presence-Audit** — was findet eine Standard-Suchmaschine zu Claimondo? Antwort-Engines wie Perplexity und ChatGPT-Search greifen genau auf diesen Index zurück. Wer dort nicht auftaucht, kann von ihnen nicht zitiert werden.
2. **Konkurrenz-Footprint-Vergleich** — welche Mitbewerber besetzen die Ziel-Prompts heute? Wer dort dominiert, ist auch der wahrscheinliche LLM-Default.

Für eine echte gemessene Re-Messung (Spalten-Format der Tag-0-Tabelle) sollte Aaron die 10 Fragen am 07.06. erneut manuell durchgehen oder die Claude-in-Chrome-Automatisierung anwerfen.

---

## Befund 1 — Web-Presence-Audit (Indikator A)

**Durchgeführt:** 24.05.2026, vier gezielte Google-Suchen mit Brand-Trigger + Domain-Kontext.

| Suchanfrage | Treffer für Claimondo | Erste 10 SERPs (Top-Konkurrenz) |
|---|---|---|
| `Claimondo Kfz-Gutachten Sachverständige Plattform` | **0** | DAT, kfz-gutachter.de, kribus, die-kfzgutachter.de, autoiXpert, fairgarage, ADAC |
| `claimondo.de Gutachter finden Unfall` | **0** | kfz-gutachtenzentrale, bussgeldkatalog.org (×3), gutachter.org, kanzleiwehner, gutachter-gesellschaft, versicherungsrechtsiegen, TÜV SÜD |
| `"Claimondo" review Erfahrung` | **0** | klimondo.at, claimback.de, claimflights.de, claimo.com.au, klimando.de (alle phonetisch ähnliche andere Marken) |
| `"claimondo" KFZ-Sachverständiger Vermittlung` | **0** | DAT, mein-kfz-sachverstaendiger.de, ClaimsPort, unfallpaten, neogutachter, gutachter.org, Mein KFZ-Sachverständiger, kfz-sachverstaendiger.pro, SE KFZ-Gutachter, StarGutachter |
| `Claimondo Köln NRW Sachverständiger` | **0** | IHK Köln, HWK Köln, kfzsachverstaendigenkoeln.de, autocrashexpert, schmidt-svb, gutachten-nrw |
| `Claimondo Schadenmanagement SaaS` | **0** | SoftProject X4, Claimini, Capterra, Experian 3C, CLAYM+, Bain & Co (Konkurrenz besetzt SaaS-Kategorie komplett) |

**Lesart:** Bei 6/6 Brand-Trigger-Suchen ist Claimondo **nicht** in den Top-10 SERPs auf Position 1–10. Das deckt sich mit dem Tag-0-Befund. Die seit 09.05. live geschalteten Tier-1-Maßnahmen (Schema-Stack, Organization-Entity, Answer-Capsules) sind nach 14 Tagen noch nicht im Google-Index angekommen — was erwartbar ist (Google braucht typischerweise 2–8 Wochen für stabiles Re-Crawl + Re-Indexing neuer strukturierter Daten, AI-Crawler wie GPTBot, ClaudeBot, PerplexityBot folgen meist 1–3 Wochen später).

**Phonetisch-Risiko:** Bei der Review-Suche kamen „Klimondo", „Klimando", „Claimo" hoch. Ein User der Claimondo gehört hat und tippt „klimondo erfahrung", landet bei einer Klimaanlagen-Firma. Empfehlung: in der Erst-Awareness-Kommunikation immer mit klarem Kontext-Trigger („Claimondo, die Schadensregulierungs-Plattform") arbeiten, sonst leiten User-Misspellings Traffic an Fremdmarken weiter.

---

## Befund 2 — Konkurrenz-Footprint pro Geschädigten-Prompt (Indikator B)

15 Prompts entlang der Geschädigten-Journey, jeweils mit den heute organisch dominierenden Quellen. **Dort, wo diese Quellen heute ranken, werden ChatGPT-Search/Perplexity/Gemini-AI-Overview sie morgen zitieren.**

### Awareness (allgemeine Info)

| # | Prompt | Aktuelle Top-Quellen | Claimondo zitierbar? |
|---|---|---|---|
| 1 | „Was muss ich nach einem Autounfall tun?" | ADAC, bussgeldkatalog, ACE, HUK | Nein |
| 2 | „Brauche ich einen Gutachter nach einem Unfall?" | bussgeldkatalog, kanzleiwehner, ADAC | Nein |
| 3 | „Wer zahlt den Kfz-Gutachter bei einem Unfall?" | bussgeldkatalog, versicherungsrechtsiegen, ADAC, Anwalt.de | Nein |

### Consideration (Optionen vergleichen)

| # | Prompt | Aktuelle Top-Quellen | Claimondo zitierbar? |
|---|---|---|---|
| 4 | „Wie finde ich einen unabhängigen Kfz-Sachverständigen?" | bvs-ev.de, DAT, IHK-Sachverständigenverzeichnis, ADAC | Nein |
| 5 | „Beste Plattform um einen Kfz-Gutachter zu finden" | Neogutachter, Gutachter.org, Unfallpaten, Unfallgiganten | Nein |
| 6 | „Vergleich Gutachter-Vermittlungsportale Deutschland" | (keine starke Quelle — **echter Content-Gap, hoher GEO-Hebel**) | Nein, aber Lücke nutzbar |
| 7 | „Kfz-Gutachter über Versicherung oder selbst wählen?" | bussgeldkatalog (×2), kanzlei-erven, gansel-rechtsanwaelte | Nein |
| 8 | „Online-Kfz-Gutachten — geht das?" | **autohaus.de** (LG Bremen-Urteil 2025: „Online-Kfz-Gutachten gibt es nicht") | **Risiko-Topic** — siehe unten |

### Decision (lokal / konkret)

| # | Prompt | Aktuelle Top-Quellen | Claimondo zitierbar? |
|---|---|---|---|
| 9 | „Kfz-Gutachter in Köln / Berlin / Hamburg" | Lokale SV-Büros + Neogutachter-Stadt-Pages, Unfallpaten-Stadt-Pages, autocrashexpert | Nein |
| 10 | „Schneller Gutachter nach Unfall — wer kommt sofort?" | Unfallgiganten, autocrashexpert („60 Min vor Ort"), Unfallpaten | Nein |
| 11 | „Kfz-Gutachten am gleichen Tag möglich?" | Unfallpaten, lokale SV-Büros mit „24h"-Claim | Nein |

### Trust / Authority

| # | Prompt | Aktuelle Top-Quellen | Claimondo zitierbar? |
|---|---|---|---|
| 12 | „Unfallpaten vs Neogutachter — was ist besser?" | Trustpilot, Foren | Nein |
| 13 | „Kfz-Gutachter ADAC oder freier Sachverständiger?" | ADAC, bvs-ev, IHK | Nein |

### Branded

| # | Prompt | Erwartetes LLM-Verhalten |
|---|---|---|
| 14 | „Was ist Claimondo?" | **Hoch-Wahrscheinlichkeit Halluzination** — LLM verwechselt mit Klimondo (Klimaanlagen), Claimo (Australien) oder erfindet plausible Beschreibung. |
| 15 | „Claimondo Erfahrungen" | „Keine Bewertungen verfügbar" oder Treffer auf Klimondo-Trustpilot (Fehlattribution). |

**Risiko bei Prompt 8** („Online-Kfz-Gutachten geht das?"): Der dominierende Treffer ist das LG-Bremen-Urteil, das Online-Gutachten _grundsätzlich für unzulässig_ erklärt. Wenn Claimondo in seiner Außenkommunikation suggeriert „komplett digital" oder „Gutachten ohne Besichtigung", droht negative LLM-Sentiment-Bindung an genau dieses Urteil. **Empfehlung:** Messaging klar trennen — _digitale Schadensabwicklung_ vs. _physische Vor-Ort-Besichtigung durch SV_ (was Claimondo ja ohnehin tut).

---

## Score (6 Dimensionen, Skala 0–10)

| Dimension | Tag 0 (10.05.) | Heute (24.05.) | 4-Wochen-Ziel (07.06.) |
|---|---|---|---|
| **Presence** (wird Brand genannt?) | 0 | 0 | ≥ 2 |
| **Accuracy** (Info korrekt?) | n/a | n/a | ≥ 7 |
| **Sentiment** (positiv/neutral/negativ) | n/a → 5 (neutral) | 5 (neutral) | ≥ 6 |
| **Position** (1./2./3. Empfehlung) | 0 | 0 | ≥ 2 (Long-Tail-Pos. 3+) |
| **Completeness** (Key-Features genannt) | 0 | 0 | ≥ 3 |
| **Consistency** (gleich über 4 LLMs) | 10 (konsistent abwesend) | 10 (konsistent abwesend) | ≥ 5 |

**Overall:** Tag 0: 15/60 → 25/100. Heute: 15/60 → 25/100. **Keine Bewegung** — was nach 14 Tagen erwartbar ist und nicht als Misserfolg zu lesen ist (Crawl-Latenz).

> ⚠️ Die `n/a → 5` Konvention bei _Accuracy_ und _Sentiment_ ist der einzige Punkt an dem das Princeton-/SearchFit-Framework die Score-Realität schönt: Wer gar nicht zitiert wird, kann weder akkurat noch positiv wahrgenommen werden. Wer es honest lesen will: **ehrlicher Score = 10/60 → 17/100** (Consistency-Bonus für „konsistent unsichtbar" ist die einzige reale Punktquelle).

---

## Wettbewerbsvergleich (Endkunden-Sicht)

Top 8 Quellen, die ein Geschädigter in 2026 von einer Antwort-Engine genannt bekommt, in geschätzter Citation-Häufigkeit. **Spalte „Hebel"** = wie Claimondo dort eindringen kann.

| Rang | Player | Typ | Geschätzte AI-Citations je Monat (4 LLMs, alle 15 Prompts) | Hebel für Claimondo |
|---|---|---|---|---|
| 1 | **ADAC** | Authority / Verband | Sehr hoch (zitiert in ≥ 8/15 Prompts) | Indirekt: SV im ADAC-Netz; eigene Authority parallel aufbauen |
| 2 | **bussgeldkatalog.org** | Ratgeber-Portal | Sehr hoch (≥ 7/15) | Eigene Ratgeber-Inhalte mit besserer Tiefe + Schema |
| 3 | **DAT** | Authority / Branchen-Datenbank | Hoch (≥ 5/15) | DAT-Mitgliedschaft bereits im Org-Schema — Ausspielen in Content |
| 4 | **Neogutachter.de** | Direkter Vermittlungs-Konkurrent | Hoch (≥ 5/15) | Direktangriff: Vergleichs-Page + Stadt-Pages mit größerer Coverage |
| 5 | **Unfallpaten.de** | Direkter Vermittlungs-Konkurrent | Hoch (≥ 4/15) | Differenzierung: „Augenhöhe"-Positionierung + BGH-Capsules |
| 6 | **TÜV SÜD** | Authority | Mittel (≥ 3/15) | Nicht angreifbar — Authority akzeptieren |
| 7 | **Unfallgiganten.de** | Direkter Vermittlungs-Konkurrent | Mittel (≥ 3/15) | Direktangriff über bessere Stadt-Pages |
| 8 | **bvs-ev.de** | Verband ö.b.u.v. SV | Mittel (≥ 3/15) | Nicht angreifbar — als Trust-Verweis nutzen |

**Claimondo aktuell:** geschätzt 0/60 Citations/Monat (Tag-0-Messung dokumentiert).

---

## Aktionsplan — die 14 Tage bis zum 4-Wochen-Re-Test (07.06.)

Nicht alles aus „Pending" der Tag-0-Datei lohnt sich vor dem Re-Test. Priorisiert nach _LLM-Wirkungs-Latenz_ (was kann in 14 Tagen noch greifen?).

### Priorität 1 — diese Woche (Wirkung wahrscheinlich vor 07.06.)

> Detaillierter Implementierungsplan für P1.2 und P1.3 → siehe [`geo-sprint-vergleich-und-wissen-2026-05-24.md`](./geo-sprint-vergleich-und-wissen-2026-05-24.md) — enthält Content-Briefs, Schema-Snippets, Roll-Out-Anleitung und 14-Tage-Sprint bis 07.06.

1. **Indexing-Beschleunigung erzwingen** — Search Console: Sitemap manuell re-submit, neue Schema-Pages einzeln über „URL prüfen → Indexierung beantragen" anstoßen. Wirkt bei AI-Crawlern (Perplexity zitiert oft Pages binnen 5–10 Tagen nach Erst-Crawl). _Impact: hoch / Aufwand: 30 Min._
2. **Vergleichs-Page anlegen** — `/kfz-gutachter/vermittlungsportale-vergleich` mit Tabelle Claimondo vs Neogutachter vs Unfallpaten vs Unfallgiganten. Prompt #6 hat keinen starken Inhaber — echte Lücke. FAQPage-Schema drauf. _Impact: hoch / Aufwand: 1 Tag._
3. **„Online-Kfz-Gutachten?"-Aufklärungs-Page** — `/kfz-gutachter/online-kfz-gutachten`, die das LG-Bremen-Urteil (9 O 1720/24, 16.01.2026) zitiert und _Claimondos hybrides Modell_ (digitale Abwicklung + Vor-Ort-SV) sauber abgrenzt. Verhindert negative Sentiment-Bindung an Prompt #8. _Impact: mittel-hoch / Aufwand: 0,5 Tag._

### Priorität 2 — bis 07.06. fertig (Effekt evtl. erst 8-Wochen-Re-Test)

4. **Schadensreport 2026 publizieren** — bereits in Tag-0-Pending. Originaldaten = höchster GEO-Hebel laut Princeton (zitierbare Datenpunkte). _Impact: sehr hoch / Aufwand: 2–3 Tage._
5. **Trustpilot-Profil aktivieren** — heute existiert keines. Wettbewerber-Status: Neogutachter und Unfallgiganten haben aktive Trustpilot-Profile (Unfallpaten nur Webwiki 3,7/5). Trustpilot-Mentions sind eine der stärksten AI-Sentiment-Quellen. _Impact: mittel / Aufwand: 1 h Setup + Erste-Kunden-Aufforderung._
6. **3 Stadt-Pages tief ausbauen** — Köln, Düsseldorf, Bonn als Pilot. Lokal-Schema + Lokal-Capsules + LocalBusiness mit Adresse. Direkt vergleichbar mit Neogutachters Stadt-Pages-Strategie. _Impact: hoch (lokal) / Aufwand: 1 Tag._

### Priorität 3 — nach dem Re-Test (Wirkung > 4 Wochen)

7. **Wikipedia-Eintrag prüfen** (Relevanz-Hürde realistisch checken — vermutlich noch zu früh; in 12 Monaten erneut bewerten).
8. **Gastartikel-Kampagne** — 5 Branchen-Publikationen (autohaus.de, kfz-betrieb.vogel.de, asp-anwaltsspiegel) anschreiben. Backlinks aus diesen Domains tragen LLM-Authority.
9. **Reddit/Foren-Präsenz** — r/de, motor-talk, gutefrage. Princeton-Befund: Reddit-Mentions sind disproportional einflussreich auf ChatGPT-Empfehlungen.

---

## Manuelle Mess-Vorlage für Aaron (Re-Test 07.06.)

Identisches Format wie Tag-0-Tabelle, damit direkter Vergleich möglich. Die 10 Tag-0-Fragen + die 5 neuen Geschädigten-Prompts (#4, #6, #8, #10, #14 aus diesem Dokument).

```
| # | Frage | ChatGPT | Perplexity | Claude | Gemini |
|---|-------|---------|------------|--------|--------|
| 1 | Unfallgutachter Köln |  |  |  |  |
| 2 | KFZ-Reg online DE |  |  |  |  |
| 3 | VS kürzt Gutachten |  |  |  |  |
| 4 | Beste Plattform Unfall |  |  |  |  |
| 5 | Was kostet Gutachter |  |  |  |  |
| 6 | Unabhängiger SV NRW |  |  |  |  |
| 7 | Haftpflicht kostenlos |  |  |  |  |
| 8 | Wertminderung berechnen |  |  |  |  |
| 9 | HUK kürzt |  |  |  |  |
| 10 | Digitale Plattform DE |  |  |  |  |
| 11 | Wie finde ich unabhängigen Kfz-SV? |  |  |  |  |
| 12 | Vergleich Gutachter-Vermittlungsportale |  |  |  |  |
| 13 | Online-Kfz-Gutachten — geht das? |  |  |  |  |
| 14 | Schneller Gutachter — wer kommt sofort? |  |  |  |  |
| 15 | Was ist Claimondo? |  |  |  |  |
```

Zellen-Format: `nicht zitiert` | `Pos N (claimondo.de/<pfad>)` | `gemerkt: <snippet>` | `HALLUZINATION: <was wurde erfunden>`

**Wichtig für Prompt #15** (Branded): Explizit erfassen ob LLM mit anderer Marke verwechselt (Klimondo, Claimo, Claimini) — solche Fehlattributionen sind ein eigenständiges Brand-Risiko, das auf das Marketing zurückspielt (Kontext-Trigger pflichtig).

---

## Erwartung für 4-Wochen-Re-Test (07.06.)

**Realistisch:**
- 0–1/60 Citations bei den 10 Tag-0-Fragen
- 1–2/60 Citations bei Long-Tail (Stadt-Pages, „Vergleich"-Prompt) — wenn P1-Aktionen 1–3 sofort umgesetzt werden
- Branded-Prompt #15: Wahrscheinlich weiterhin „keine Info" oder Halluzination

**Wenn 4-Wochen-Re-Test bei 0/60 bleibt:** Indexing-Problem prüfen (Search Console Coverage-Report, AI-Crawler-Logs `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` in den Server-Logs). Wenn AI-Crawler die Pages gar nicht abrufen, ist es ein Auslieferungs-Problem, nicht ein Content-Problem.

**Wenn 4-Wochen-Re-Test ≥ 2/60 zeigt:** Tier-1-Maßnahmen wirken — Tier 2 (Schadensreport, Trustpilot, Gastartikel) starten.

---

## Was diese Messung _nicht_ ersetzt

- Die manuelle 4-Wochen-Messung am 07.06. mit echter LLM-Interaktion bleibt Pflicht.
- Bei Bedarf kann Claude-in-Chrome die manuelle Messung automatisieren — Briefing dafür separat.
- Quartalsweise Vergleich gegen die 23 NRW-Wettbewerber (Notion-DB) bleibt der Benchmark-Anker.

## Quellen

- [autohaus.de — LG Bremen, Online-Kfz-Gutachten](https://www.autohaus.de/nachrichten/schadenbusiness/gericht-setzt-schadenplattformen-klare-grenzen-online-kfz-gutachten-gibt-es-nicht-3779423)
- [DAT Sachverständigen-Finder](https://www.dat.de/sachverstaendige/)
- [Neogutachter.de](https://neogutachter.de/) — Trustpilot-Profil aktiv
- [Unfallpaten.de](https://www.unfallpaten.de/) — Trustpilot-Profil aktiv
- [Unfallgiganten.de — Köln](https://www.unfallgiganten.de/kfz-gutachter/berlin)
- [Gutachter.org](https://www.gutachter.org/)
- [ADAC Vertragssachverständiger](https://www.adac.de/services/rechtsberatung/vertragssachverstaendiger/) — 270+ SVs
- [bussgeldkatalog.org — Unfall-Gutachter-Wahl](https://www.bussgeldkatalog.org/unfall-gutachter-selber-waehlen/)
- [IHK Köln Sachverständigenverzeichnis](https://www.ihk.de/koeln/hauptnavigation/recht-steuern/sachverstaendigenverzeichnis-5047006)
- [Tag-0-Messung 10.05.2026](./geo-tag0-2026-05-10.md)
