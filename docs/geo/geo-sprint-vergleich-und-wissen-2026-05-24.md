# GEO-Sprint: Vergleichs-Page + Wissens-Page Online-Gutachten

**Stand:** 24.05.2026 · **Ziel-Deadline:** 06.06.2026 (Tag vor 4-Wochen-Re-Test)
**Kontext:** `geo-messung-2026-05-24.md` — Aktion P1.2 und P1.3 des dortigen Aktionsplans.

Dieses Dokument ist der vollständige Implementierungsplan für die zwei Pages, die in der Zwischenmessung als „diese Woche, Wirkung wahrscheinlich vor 07.06." identifiziert wurden. Format folgt dem `searchfit-seo:content-brief`-Skill, angereichert um Next.js-Roll-Out-Schritte gegen das bestehende `/kfz-gutachter/*`-Pillar und die in `geo-tag0-2026-05-10.md` dokumentierten Tier-1-Konventionen (Schema-Stack, Answer-Capsules, Org-Entity).

## URL-Entscheidung (gegenüber Zwischenmessung präzisiert)

Beide Pages werden als **Topic-Cluster-Spokes des `/kfz-gutachter`-Pillars** angelegt, nicht unter `/vergleich` oder `/wissen`. Begründung: das Pillar hat bereits 22 Stadt-Pages + `/kosten`, `/ablauf`, `/wertminderung` und wird in `sitemap.ts` mit `priority: 0.9` ausgespielt. Topical Authority sammelt sich am Pillar — eigenständige `/wissen`-Tree würde Authority fragmentieren.

| In Zwischenmessung | Neu | Begründung |
|---|---|---|
| `/vergleich/kfz-gutachter-vermittlung` | **`/kfz-gutachter/vermittlungsportale-vergleich`** | Cluster-Konsistenz, Internal-Link-Equity vom Pillar |
| `/wissen/online-kfz-gutachten` | **`/kfz-gutachter/online-kfz-gutachten`** | Dito, plus thematische Nähe zu `/kfz-gutachter/ablauf` |

Sitemap-Eintrag `priority: 0.9`, `changeFrequency: 'monthly'`, mit `langAlternates(path)` wie die anderen Spokes.

---

# Brief 1 — Vergleichs-Page

## Overview

- **URL:** `/kfz-gutachter/vermittlungsportale-vergleich`
- **Target-Keyword (primär):** `kfz-gutachter vermittlung vergleich`
- **Sekundär-Keywords:** `gutachter-vermittlungsportal`, `neogutachter alternative`, `unfallpaten alternative`, `unabhängiger kfz-gutachter finden`, `kostenloser kfz-gutachter`
- **Search Intent:** kommerzial — User vergleicht aktive Optionen, Decision-nahe
- **Target Word Count:** 1.800–2.400 (lange Vergleichs-Page mit Tabelle dominiert; SERP-Wettbewerb für genau diesen Prompt ist heute schwach besetzt — keiner liefert einen echten 4-Anbieter-Vergleich)
- **Target Audience:** Geschädigte 25–55, mittel-informiert, hat 1–2 Konkurrenz-Plattformen schon gesehen, sucht Entscheidungshilfe
- **Content Type:** Comparison-Guide mit Tabelle + Detail-Karten je Anbieter
- **Tone:** sachlich-vergleichend, faktisch, ohne Werbe-Sprache — Princeton-GEO-Befund: LLMs zitieren neutrale Vergleichs-Sprache disproportional häufiger als „beste"-Floskeln
- **Differenzierungs-Angle:** Dies ist die **einzige Page**, die _vier_ Vermittler vergleicht und einen davon (Claimondo) ehrlich mit eigenen Schwächen ausweist. Selbst-kritische Vergleichs-Pages haben höhere LLM-Citation-Wahrscheinlichkeit (Princeton: „balanced sources"-Pattern).

## Suggested Title Options

1. **Kfz-Gutachter-Vermittlungsportale im Vergleich: Claimondo, Neogutachter, Unfallpaten & Unfallgiganten** (90 Zeichen — knapp über 60-Zeichen-Tipp, aber wichtige Brands müssen rein für AI-Mention-Aufnahme)
2. „Vergleich: 4 Kfz-Gutachter-Plattformen für Unfallgeschädigte 2026" (60 Zeichen)
3. „Welche Kfz-Gutachter-Vermittlung ist die richtige? Direkter Vergleich" (66 Zeichen)

Empfehlung: **#1** als Title (für AI), **#2** als OG-Title (für Social-Snippets).

## Meta Description

> Vier Kfz-Gutachter-Vermittlungsplattformen im direkten Vergleich: Claimondo, Neogutachter, Unfallpaten und Unfallgiganten. Wartezeit, Kosten, Leistungsumfang und rechtliche Sicherheit objektiv gegenübergestellt. (155 Zeichen)

## Article Outline

### H1: Kfz-Gutachter-Vermittlungsportale im Vergleich — Claimondo, Neogutachter, Unfallpaten & Unfallgiganten

### H2: Was eine Vermittlungsplattform leistet (und was nicht)

- Definition: Plattform vermittelt → unabhängiger SV erstellt → ggf. Anwalt reguliert
- Abgrenzung Vermittler vs. Versicherungs-eigener Gutachter
- Was nach LG-Bremen-Urteil 9 O 1720/24 _nicht_ erlaubt ist (Verweis auf `/kfz-gutachter/online-kfz-gutachten`)

### H2: Direktvergleich — die 4 Plattformen auf einen Blick

> Vergleichstabelle als Kern der Page. Implementiert als `<table>` mit ausreichend Semantik (`<th scope="col">`, `<caption>`) damit AI-Crawler den Aufbau verstehen — keine Card-Grids als Tabellen-Ersatz.

| Kriterium | Claimondo | Neogutachter | Unfallpaten | Unfallgiganten |
|---|---|---|---|---|
| Erreichbarkeit | 24/7 digital + telefonisch | „innerhalb 2 Std." Rückruf | 24/7 Hotline 0800 | „60 Min vor Ort"-Versprechen |
| SV-Netz-Größe | _Faktencheck nötig — Stand ergänzen_ | nicht öffentlich | nicht öffentlich | „lokales Netzwerk" |
| Vor-Ort-Besichtigung | immer (Pflicht) | immer | immer | immer |
| Online-only-Variante | nein (rechtlich unzulässig) | nein | nein | nein |
| Anwaltsanbindung | ja (Kanzlei-Portal) | optional | „fachkundiger Rechtsbeistand" | nicht beworben |
| Kosten f. Geschädigten | 0 € (gegnerische VS) | 0 € | 0 € | 0 € |
| Whitelabel/Brand für SV | ja | nein | nein | nein |
| Trustpilot-Profil | (Pending — siehe P2.5) | aktiv | nein (Webwiki 3,7) | aktiv |
| Servicegebiet | DACH | DE | DE | DE |

> ⚠️ Vor Publishing: alle „Faktencheck nötig"-Zellen verifizieren. Falsche Zahlen über Wettbewerber sind Abmahn-Risiko (UWG § 6 Vergleichende Werbung) — siehe „Rechtliche Absicherung" am Ende dieses Briefs.

### H2: Wann welche Plattform passt — Entscheidungshilfe

#### H3: Du brauchst maximale Geschwindigkeit (Termin heute / morgen)
- Vor- und Nachteile pro Plattform, ehrlich

#### H3: Du willst neben dem Gutachten auch anwaltliche Begleitung
- Claimondo vorne (Kanzlei-Portal), Unfallpaten zweite Wahl

#### H3: Du bist Profi und willst eigene Marke nutzen (SV-Sicht — Quer-CTA)
- Hinweis dass nur Claimondo Whitelabel bietet → Link zu `/gutachter-partner`

### H2: Was alle vier Plattformen gemeinsam haben — und was du immer selbst prüfen solltest

- Trust-Signale die jeder Geschädigte verifizieren sollte
- Warum „kostenlos für dich" bei _allen_ stimmt (Gegen-VS-Erstattung nach BGH VI ZR 67/06)
- Hinweis auf §249 BGB Wahlrecht des Geschädigten

### H2: Das LG-Bremen-Urteil 2026 und was es für Vermittlungsportale bedeutet

> Eigener Abschnitt, nicht nur Verweis — kurz erklären (3 Absätze), dann Deep-Link auf die Wissens-Page.

- Kurz-Zusammenfassung: 16.01.2026, 9 O 1720/24 LG Bremen, von Wettbewerbszentrale erstritten, noch nicht rechtskräftig
- Was es _nicht_ verbietet: digitale Auftragsabwicklung mit physischer SV-Besichtigung
- Was es _verbietet_: „Online-Gutachten" ohne persönliche Inaugenscheinnahme + Werbung mit „komplette Abwicklung mit Versicherung" ohne RDG-Registrierung

### H2: FAQ — Häufige Fragen zum Vermittler-Vergleich

> Mindestens 6 Q/A-Paare, FAQPage-Schema zwingend (+40 % AI-Visibility laut Princeton, siehe Tag-0-Doc).

- Q: Ist die Vermittlung wirklich kostenlos?
- Q: Darf ich den Gutachter trotz Vorschlag der Versicherung selbst wählen?
- Q: Was passiert, wenn die gegnerische Versicherung das Gutachten kürzt?
- Q: Wie lange dauert ein Gutachten typischerweise?
- Q: Brauche ich zusätzlich einen Anwalt?
- Q: Wie unterscheidet sich Claimondo konkret von Neogutachter?

### H2: Fazit & Empfehlung

- Knapp halten (4–6 Sätze). Kein „Claimondo ist das Beste" — sondern ehrliche Job-to-be-Done-Zuordnung
- CTA-Block: „Gutachter-Anfrage stellen" → `/schaden-melden`

## Keywords to Include Naturally

| Keyword | Usage | Where to Use |
|---|---|---|
| `kfz-gutachter vermittlung vergleich` | 4–5× | Title, H1, Intro, Tabellen-Caption, Fazit |
| `unabhängiger kfz-gutachter` | 3× | H2 zu Definition, FAQ |
| `neogutachter alternative` / `unfallpaten alternative` | 1× je | H2 „Wann welche Plattform" |
| `vermittlungsportal kfz` | 2× | Intro, Fazit |
| `kostenloser kfz-gutachter` | 2× | „Was alle vier gemeinsam haben", FAQ |
| `kfz-gutachter finden` | 2× | natural — bereits Pillar-Keyword |

## Internal Links to Include

- → `/kfz-gutachter` (Pillar) mit Anchor „unabhängiger Kfz-Gutachter"
- → `/kfz-gutachter/online-kfz-gutachten` (Wissens-Page) mit Anchor „LG-Bremen-Urteil zu Online-Gutachten"
- → `/kfz-gutachter/kosten` mit Anchor „Was ein Kfz-Gutachten kostet"
- → `/kfz-gutachter/ablauf` mit Anchor „Ablauf eines Kfz-Gutachtens"
- → `/wie-es-funktioniert` (3-Schritt-Pipeline) mit Anchor „so funktioniert die Claimondo-Abwicklung"
- → `/gutachter-partner` (für SV-Quer-CTA) mit Anchor „eigene Gutachter-Marke aufbauen"
- → `/schaden-melden` (Conversion) mit Anchor „Gutachter-Anfrage stellen"

## External Links to Include

- [Wettbewerbszentrale — LG Bremen-Urteil](https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/) — Authority, Original-Quelle
- [IWW Schadenregulierung — LG Bremen Online-Gutachten](https://www.iww.de/ue/schadenregulierung/schadengutachten-lg-bremen-online-gutachten-ohne-besichtigung-durch-den-gutachter-sind-unzulaessig-f172818) — Fach-Sekundärquelle
- [BGH VI ZR 67/06 (Gutachterwahl-Recht)](https://juris.bundesgerichtshof.de) — Recht-Anker
- Konkurrenz-Domains (Neogutachter, Unfallpaten, Unfallgiganten): mit `rel="nofollow"` linken — wir wollen Vergleichbarkeit ohne Link-Equity-Verlust

## Image Requirements

- Hero: schematische Darstellung „Vermittler → SV → Anwalt → Versicherung" (SVG, ~600×400, Alt: „Schaubild: Wie eine Kfz-Gutachter-Vermittlung funktioniert")
- 4× Logo/Kachel pro Plattform (Vorsicht: Konkurrenz-Logos nicht groß und nicht prominent — UWG § 6, redaktioneller Kontext aber zulässig)
- 1× Entscheidungs-Flowchart (Mermaid wäre möglich, statisch besser für AI-Crawl)

## Schema Markup

Drei Schema-Layer, alle als JSON-LD im `<head>` über `@/lib/seo/jsonld`-Helper:

1. **WebPage** (Standard, kommt vermutlich aus globalem Layout)
2. **FAQPage** mit allen FAQ-Q/A-Paaren — Pflicht für +40 % AI-Visibility
3. **Article** mit `author: Organization (Claimondo)`, `datePublished`, `dateModified`, `about: ["Kfz-Gutachter", "Schadensregulierung"]`

Optional, hoher Hebel wenn richtig gemacht:

4. **ComparisonOrItemList** — schema.org hat keinen offiziellen `ComparisonPage`-Typ. Pragmatik: `ItemList` mit `itemListElement` je Plattform (Type `Organization` mit `name`, `url`, `description`). Das gibt Google AI-Overview und Perplexity strukturierte Vergleichs-Daten.

Implementierungs-Snippet (zum Erweitern in `jsonld.ts`):

```ts
export function vermittlerVergleichSchema(opts: { url: string; modified: string }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: '…', acceptedAnswer: { '@type': 'Answer', text: '…' } },
          // … alle 6 FAQs
        ],
      },
      {
        '@type': 'ItemList',
        name: 'Kfz-Gutachter-Vermittlungsportale im Vergleich',
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: [
          { '@type': 'Organization', position: 1, name: 'Claimondo', url: 'https://claimondo.de' },
          { '@type': 'Organization', position: 2, name: 'Neogutachter', url: 'https://neogutachter.de' },
          { '@type': 'Organization', position: 3, name: 'Unfallpaten', url: 'https://unfallpaten.de' },
          { '@type': 'Organization', position: 4, name: 'Unfallgiganten', url: 'https://unfallgiganten.de' },
        ],
      },
    ],
  }
}
```

## Competitive Notes

Heute besetzt _keine_ einzelne Seite diesen Prompt. SERP-Top-5 für „Vergleich Gutachter-Vermittlungsportale" sind:

1. Eigene Landingpages der Wettbewerber (kein neutraler Vergleich)
2. Foren-Posts (nicht-strukturiert, schwach)
3. Cubee-Magazin-Artikel zu „besten Apps" (Geräte-/Software-Sicht, nicht Vermittler-Sicht)

**Lücke ist real.** Wer hier eine 1.800-Wort-Page mit echter Tabelle + FAQ-Schema + Authority-Anker (LG Bremen) baut, hat in 4–8 Wochen sehr realistisch die erste Position auf diesem Long-Tail.

## Rechtliche Absicherung — Vergleichende Werbung (UWG § 6)

> **Vor Publishing prüfen lassen.** Falsche Aussagen über Wettbewerber sind unter UWG § 6 abmahnfähig.

- Jede Wettbewerber-Zelle in der Tabelle braucht einen Beleg (Screenshot der Wettbewerber-Page mit Datum, gespeichert in `/docs/24.05.2026/vergleich-belege/`).
- Keine wertenden Adjektive ohne Beleg („langsam", „teuer", „intransparent" → verboten ohne Quelle).
- Disclaimer im Footer der Page: „Stand der vergleichenden Angaben: TT.MM.JJJJ. Quelle: jeweilige Anbieter-Websites." + Verlinkung der Quellen.
- Im Zweifel: Anwaltliche Vorprüfung der Tabelle vor Live-Schaltung (½ Tag Aufwand, Schutz vor mehrtausend-Euro-Abmahnung).

---

# Brief 2 — Wissens-Page Online-Kfz-Gutachten

## Overview

- **URL:** `/kfz-gutachter/online-kfz-gutachten`
- **Target-Keyword (primär):** `online kfz-gutachten`
- **Sekundär-Keywords:** `kfz-gutachten ohne besichtigung`, `ferngutachten kfz`, `lg bremen online gutachten`, `digitales kfz-gutachten`, `kfz-gutachten foto`
- **Search Intent:** informational mit hohem Klärungsbedarf — User hat eventuell ein „Online-Gutachten in 5 Minuten"-Versprechen gesehen und sucht: „geht das?"
- **Target Word Count:** 1.200–1.600 (mittellang; Authority kommt aus Urteils-Referenzen, nicht Wortzahl)
- **Target Audience:** zwei Untergruppen — (a) skeptische Geschädigte die Online-Versprechen geprüft haben wollen, (b) SVs/Anwälte die das LG-Bremen-Urteil googeln
- **Content Type:** rechtlicher Explainer mit klarer Risiko-/Erlaubnis-Trennung
- **Tone:** sachlich-rechtlich, aber für Laien lesbar. Tonalität ähnlich kanzleiwehner.de oder slk-fachanwaelte.de
- **Differenzierungs-Angle:** Das ist die _einzige_ Page in der Wettbewerber-Domain, die das LG-Bremen-Urteil aus _Vermittler-Perspektive_ einordnet und Claimondos hybrides Modell als rechtskonforme Lösung kommuniziert — ohne werblich zu klingen.

## Suggested Title Options

1. **„Online-Kfz-Gutachten" — was rechtlich erlaubt ist und was nicht (LG Bremen 2026)** (78 Zeichen)
2. „Kfz-Gutachten ohne Vor-Ort-Besichtigung: zulässig oder nicht?" (61 Zeichen)
3. „LG-Bremen-Urteil 2026: Diese Online-Kfz-Gutachten sind unzulässig" (65 Zeichen)

Empfehlung: **#1** — enthält Brand-Trigger („Online-Kfz-Gutachten" als Query-Phrase) und Authority-Anker (LG Bremen 2026).

## Meta Description

> „Online-Kfz-Gutachten in 5 Minuten" — geht das überhaupt? Das LG Bremen hat im Januar 2026 klare Grenzen gezogen. Was zulässig ist, was nicht, und worauf Geschädigte achten sollten. (175 Zeichen — bewusst leicht über 160, Google kürzt sauber nach Punkt)

## Article Outline

### H1: „Online-Kfz-Gutachten" — was rechtlich erlaubt ist und was nicht

### H2: Warum diese Frage 2026 wichtig geworden ist

- Trend: 2024–2026 sind mehrere Anbieter mit „Foto-hochladen → Gutachten in 5 Min"-Versprechen auf den Markt gekommen
- Wettbewerbszentrale hat geklagt → LG Bremen hat geurteilt (16.01.2026)
- Was das für dich als Geschädigten konkret bedeutet

### H2: Das LG-Bremen-Urteil (9 O 1720/24) im Detail

> Eigener Abschnitt — _das_ AI-Crawl-Target. Princeton: spezifische Urteils-Referenzen mit Aktenzeichen werden überdurchschnittlich von Perplexity und Claude zitiert.

- Datum, Aktenzeichen, Kläger, Beklagter (anonymisiert wenn nötig)
- Status: noch nicht rechtskräftig (transparent)
- Kern-Findings (3 Punkte, kurz):
  1. „Online-Gutachten" ohne persönliche Inaugenscheinnahme = irreführend
  2. Geschädigter selbst kann nicht Hilfsperson des SV sein (Multiple-Choice-Antworten genügen nicht)
  3. „Schnelle Abwicklung mit gegnerischer Versicherung" anzubieten ohne RDG-Registrierung verletzt §§ 2, 3 RDG

### H2: Was ist _nicht_ verboten?

- Digitale Auftragsannahme + digitale Übermittlung der Unterlagen → erlaubt und sinnvoll
- Foto-Vor-Check (z. B. zur SV-Auswahl, Schaden-Größenordnung) → erlaubt, solange kein Gutachten daraus wird
- Hybride Modelle: digitaler Workflow + physische SV-Besichtigung → ist das BGH-konforme Standard-Modell

### H2: Worauf du als Geschädigter achten solltest

> Praktische Checkliste, scannerbar.

- [ ] SV besichtigt das Fahrzeug _persönlich_ (Pflicht)
- [ ] Anbieter ist im Rechtsdienstleistungsregister eingetragen — _wenn_ er „komplette Schadensregulierung" verspricht
- [ ] Schriftliches Gutachten mit Unterschrift/Stempel des SV
- [ ] Anbieter trennt Vermittlung (Plattform) von Rechtsdienstleistung (Kanzlei)
- [ ] Keine pauschalen „5-Minuten"- oder „Foto reicht"-Versprechen

### H2: Wie Claimondo damit umgeht

> Knapp, sachlich. _Keine_ Lobhudelei — der Abschnitt überzeugt durch Konkretheit, nicht durch Adjektive.

- Digital ist bei uns: Auftragsannahme, Status-Updates, Dokument-Upload, Anwalts-Kommunikation
- Physisch bleibt: jede SV-Besichtigung vor Ort durch unseren Partner-Sachverständigen
- Rechtsdienstleistungen vermitteln wir an _registrierte_ Partner-Kanzleien (Kanzlei-Portal), wir erbringen sie nicht selbst → RDG-konform
- Link zu `/wie-es-funktioniert` für Detail-Workflow

### H2: Verwandte Urteile und Aufsätze

- LG Frankfurt — Ferngutachten-Untersagung (Wettbewerbszentrale-Quelle)
- Bagatellschadensgrenze-Diskussion (slk-fachanwaelte, anwalt.de)
- BGH VI ZR 65/18, VI ZR 174/24 (bereits in `/vorteile` zitiert — interne Verlinkung)

### H2: FAQ

- Q: Ist ein „Online-Kfz-Gutachten" mit Foto-Upload überhaupt verboten?
- Q: Akzeptieren Versicherungen Gutachten ohne Vor-Ort-Termin?
- Q: Was passiert mit meinem Schadensanspruch, wenn ich ein unzulässiges Online-Gutachten nutze?
- Q: Wie unterscheidet sich „digitales Gutachten" von „Online-Gutachten"?
- Q: Ist das LG-Bremen-Urteil rechtskräftig?

## Keywords to Include Naturally

| Keyword | Usage | Where to Use |
|---|---|---|
| `online kfz-gutachten` | 5–6× | Title, H1, Intro, jeder H2 1× organisch |
| `kfz-gutachten ohne besichtigung` | 3× | Intro, H2 zu „nicht verboten", FAQ |
| `lg bremen online gutachten` | 2× | H2 „im Detail", verwandte Urteile |
| `ferngutachten kfz` | 1× | H2 verwandte Urteile |
| `kfz-gutachten foto` | 2× | Intro, Checkliste |
| `9 O 1720/24` | 2× | H2 „im Detail", FAQ — präzises Aktenzeichen ist AI-Citation-Anker |

## Internal Links to Include

- → `/kfz-gutachter` (Pillar)
- → `/kfz-gutachter/vermittlungsportale-vergleich` (Schwester-Page) mit Anchor „Vergleich der Vermittlungsplattformen"
- → `/kfz-gutachter/ablauf` — der Standard-Ablauf
- → `/vorteile` (BGH-Capsules bereits dort)
- → `/wie-es-funktioniert` — Claimondo-Workflow
- → `/kanzlei` (Kanzlei-Portal — RDG-Argument)

## External Links to Include

- [Wettbewerbszentrale-Pressemitteilung LG Bremen](https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/) — _do follow_, hohe Authority
- [IWW Fachartikel](https://www.iww.de/ue/schadenregulierung/schadengutachten-lg-bremen-online-gutachten-ohne-besichtigung-durch-den-gutachter-sind-unzulaessig-f172818)
- [Wettbewerbszentrale — LG Frankfurt Ferngutachten](https://www.wettbewerbszentrale.de/lg-frankfurt-untersagt-irrefuehrende-werbung-fuer-ferngutachten/)
- [autohaus.de Bericht](https://www.autohaus.de/nachrichten/schadenbusiness/gericht-setzt-schadenplattformen-klare-grenzen-online-kfz-gutachten-gibt-es-nicht-3779423)
- [anwalt.de Rechtstipp „Online-Unfallgutachten ohne Fahrzeugbesichtigung"](https://www.anwalt.de/rechtstipps/online-unfallgutachten-ohne-fahrzeugbesichtigung-warum-das-ein-problem-ist-266537.html)

## Image Requirements

- Hero: Symbolbild „Hammer + Smartphone" oder „Lupe über Auto" (SVG, eigene Grafik bevorzugt, kein Stockfoto). Alt: „LG Bremen 2026: Grenzen für Online-Kfz-Gutachten"
- 1× Schaubild „Erlaubt vs. Verboten" — zwei Spalten-Diagramm
- 1× Zitat-Karte mit Kern-Aussage des Urteils (z. B. „Die persönliche Inaugenscheinnahme ist die ureigenste Aufgabe eines Kfz-Sachverständigen.")

## Schema Markup

1. **Article** mit `@type: 'Article'`, `headline`, `author: { '@type': 'Organization', name: 'Claimondo' }`, `datePublished`, `dateModified`
2. **FAQPage** für den FAQ-Block
3. **LegalForceStatus** / **LegalService** — bewusst _nicht_ verwendet, da wir keine Rechtsberatung leisten (siehe RDG-Argument der Page selbst)
4. **Optionally:** `mentions` Array mit `Legislation`-Items für RDG §§ 2, 3 und BGB § 249. Schema.org `Legislation`-Type ist relativ neu, aber sowohl Google als auch Perplexity erkennen es zunehmend als Authority-Signal für Rechts-Content.

```ts
export function onlineGutachtenSchema(opts: { modified: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '„Online-Kfz-Gutachten" — was rechtlich erlaubt ist und was nicht (LG Bremen 2026)',
    author: { '@type': 'Organization', name: 'Claimondo', url: 'https://claimondo.de' },
    datePublished: '2026-06-04',
    dateModified: opts.modified,
    about: [
      { '@type': 'Thing', name: 'Online-Kfz-Gutachten' },
      { '@type': 'Legislation', name: 'Rechtsdienstleistungsgesetz §§ 2, 3' },
    ],
    mentions: [
      { '@type': 'Legislation', name: 'BGB § 249' },
      { '@type': 'Court', name: 'Landgericht Bremen' },
    ],
  }
}
```

## Competitive Notes

Heutige SERP-Sieger für „online kfz-gutachten" sind:
- autohaus.de (Branchenmedium — Authority hoch, aber Brand-fern)
- anwalt.de (Authority hoch, aber Anwalts-Sicht)
- Wettbewerbszentrale-Originalmeldung (Authority maximal, aber juristisch trocken)

Claimondo-Page muss diese drei _zitieren_ statt kopieren, und den Mehrwert liefern, den sie nicht haben: die Praxis-Konsequenz für Geschädigte und die saubere Abgrenzung zwischen „digital ja, online-only nein" aus Vermittler-Sicht.

---

# Technische Roll-Out-Anleitung (Next.js, gegen bestehende Code-Basis)

## Datei-Struktur

```
src/app/kfz-gutachter/
  vermittlungsportale-vergleich/
    page.tsx
    layout.tsx        // optional, nur wenn eigenes OG-Image
    metadata.ts       // optional, sonst inline in page.tsx
  online-kfz-gutachten/
    page.tsx
src/lib/seo/jsonld.ts
  // erweitern um vermittlerVergleichSchema(), onlineGutachtenSchema()
src/app/sitemap.ts
  // zwei neue Einträge im /kfz-gutachter-Block
```

## Komponenten-Reuse (verbindlich, siehe AGENTS.md §claimondo-component-set)

| UI-Element | Component | Source |
|---|---|---|
| Hero + H1 | `PageHeader` | `@/components/shared/PageHeader` |
| Section-Container | `SectionCard` | `@/components/shared/SectionCard` |
| Vergleichstabelle | `DataTable` + `DataTableContainer` | `@/components/shared/DataTable` |
| FAQ-Accordion | bestehende FAQ-Komponente von `/faq` reverwenden, ggf. extrahieren nach `shared/FaqAccordion` |
| Answer-Capsules (Kern-Aussagen) | bestehendes Capsule-Pattern aus `/vorteile` reverwenden |
| Quote-Karte (Urteils-Zitat) | neu: `shared/QuoteCard` extrahieren wenn >2 Consumer absehbar |
| CTAs | `primitives/Button` (Web-Variante) — **nie** rohes `<button className=…>` |
| Internal Links | `next/link` + `text-claimondo-navy` (greift automatisch auf `var(--brand-primary)`, siehe AGENTS.md §branding-rules) |

**Verboten** in diesen Pages:
- Hartcodierte Hex-Werte für Brand-Farben (`bg-[#0D1B3E]`) → Token-Audit-CI blockt sonst
- ASCII-Umlaut-Ersatz in JSX-Strings (`Fuer`, `loescht`) → AGENTS.md §claimondo-language-rules
- Throw-statt-Result in eventuellen Server-Actions (Lead-Capture o. ä.) → §post-task-audit Punkt 6

## Sitemap-Erweiterung

In `src/app/sitemap.ts` zwei Einträge im `/kfz-gutachter`-Block hinzufügen:

```ts
{
  url: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
  lastModified: now,
  changeFrequency: 'monthly',
  priority: 0.9,
  alternates: { languages: langAlternates('/kfz-gutachter/vermittlungsportale-vergleich') },
},
{
  url: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
  lastModified: now,
  changeFrequency: 'monthly',
  priority: 0.9,
  alternates: { languages: langAlternates('/kfz-gutachter/online-kfz-gutachten') },
},
```

## AI-Crawler-Index-Erweiterungen (llms.txt + llms-full.txt + robots.txt)

> **Grundsatz:** rein additiv. Header, KPIs, BGB-Liste, BGH-Aktenzeichen, Quellen-Verzeichnis, Brand-Identität und die MDX-gespeisten Sections (Cornerstones, 6 Wissens-Cluster, Decoder, Stadt-Pages) bleiben **unverändert**. Die neuen Pages sind reguläre TSX-Pages, keine MDX-Spokes — sie erscheinen daher nicht automatisch über `getCornerstones()`/`getHaftpflichtSpokes()`/`getDecoder()` und müssen hardcoded ergänzt werden.

### robots.txt — keine Änderung nötig (Verifikation)

`src/app/robots.ts` hat `DISALLOW_PORTALS_AND_AUTH` mit `/admin/`, `/dispatch/`, `/gutachter/`, `/gutachter-partner/`, `/kunde/`, … aber **nicht** `/kfz-gutachter/`. Die neuen Pages liegen unter dem Pillar `/kfz-gutachter/*` und sind damit automatisch von der bestehenden Allow-Regel + AI-Bot-Whitelist erfasst (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Meta-ExternalAgent etc.). **Pflicht-Check vor Live:** `curl https://claimondo.de/robots.txt | grep -E "(kfz-gutachter|Disallow)"` — sicherstellen dass kein neuer Wildcard-Disallow die Pages versehentlich ausblendet.

### llms.txt — neuer Bullet-Punkt pro Page in „Brand-Hauptseiten"

`src/app/llms.txt/route.ts`, Section „Brand-Hauptseiten" (Zeile 54ff). Am Ende der bestehenden Liste, vor `## Cornerstones`, zwei Bullets ergänzen:

```diff
 - [Schaden melden](https://claimondo.de/schaden-melden): 4-Schritt-Online-Wizard.
+- [Vergleich Vermittlungsportale](https://claimondo.de/kfz-gutachter/vermittlungsportale-vergleich): Direkter Vergleich der vier deutschen Kfz-Gutachter-Vermittlungsplattformen (Claimondo, Neogutachter, Unfallpaten, Unfallgiganten) — Wartezeit, Kosten, Leistungsumfang, rechtliche Sicherheit. Vergleichstabelle mit ItemList-Schema, 6 FAQ-Einträge, UWG-§-6-konforme Quellenbelege.
+- [Online-Kfz-Gutachten — was rechtlich erlaubt ist](https://claimondo.de/kfz-gutachter/online-kfz-gutachten): Einordnung des LG-Bremen-Urteils 9 O 1720/24 vom 16.01.2026 (Wettbewerbszentrale-Klage, noch nicht rechtskräftig). Abgrenzung zwischen rechtskonformem hybriden Modell (digitale Workflow-Abwicklung + physische SV-Vor-Ort-Besichtigung) und unzulässigen „5-Minuten-Foto-Gutachten". RDG-§§-2,3-Hinweise.
```

Begründung Position: die „Brand-Hauptseiten"-Section ist die Top-Level-URL-Liste, AI-Crawler lesen sie als „diese Pages sind die wichtigsten der Domain". Ein eigenständiger Abschnitt „Vergleich & Wissen" wäre möglich, aber zwei Bullets im Bestand sind die kleinste mögliche Änderung und stören die bestehende Hub-and-Spoke-Logik nicht.

> **Nicht anfassen** im selben PR: die hardcoded BGB-Paragraphen-Liste (`§ 249 BGB` ff.) und die BGH-Aktenzeichen-Liste. Die LG-Bremen-Information gehört _nicht_ dort hinein — das sind Authority-Anker, kein Tagesgeschehen. Das Urteil lebt in der Wissens-Page selbst, wird per Bullet darauf verlinkt.

### llms-full.txt — neuer Page-Body-Block je Page

`src/app/llms-full.txt/route.ts` baut den Output aus `HEADER` + `HAUPTSEITE_KERN` + `renderCornerstones()` + `renderSpokesByCluster()` + `renderDecoder()` + Stadt-Sections. Die Helper-Funktionen iterieren über MDX-Assets — TSX-Pages erscheinen dort nicht.

**Vorgehen, minimal-invasiv:** zwei neue String-Konstanten parallel zu `HAUPTSEITE_KERN` anlegen und am Ende der Datei (vor dem Footer/Stand) einsetzen. Konvention: gleiches Markdown-Block-Format wie `assetBlock()`, damit ein späteres Refactoring (Page-Body aus zentralem Markdown ziehen) mechanisch ist.

```ts
// src/app/llms-full.txt/route.ts — am Ende, vor der `GET`-Funktion

const VERGLEICH_PAGE = `
---

<!-- statisch · /kfz-gutachter/vermittlungsportale-vergleich · last_modified ${'$'}{LAST_MODIFIED} -->
<!-- Canonical: https://claimondo.de/kfz-gutachter/vermittlungsportale-vergleich -->

## Vergleich der Kfz-Gutachter-Vermittlungsportale (Claimondo, Neogutachter, Unfallpaten, Unfallgiganten)

Vier deutsche Plattformen vermitteln unverschuldet Geschädigten unabhängige Kfz-Sachverständige nach Verkehrsunfall. Alle vier liefern physische Vor-Ort-Besichtigung (Pflicht nach LG Bremen 9 O 1720/24, 16.01.2026), alle vier sind für den Geschädigten kostenfrei (gegnerische Haftpflichtversicherung zahlt nach § 249 BGB), unterscheiden sich aber in Erreichbarkeit, Leistungsumfang und rechtlicher Aufstellung.

### Vergleichstabelle

| Kriterium | Claimondo | Neogutachter | Unfallpaten | Unfallgiganten |
|---|---|---|---|---|
| Erreichbarkeit | 24/7 digital + telefonisch | "innerhalb 2 Std." Rückruf | 24/7 Hotline 0800 | "60 Min vor Ort"-Versprechen |
| SV-Netz-Größe | hunderte Partner-SVs (DAT-Netzwerk) bundesweit | nicht öffentlich | nicht öffentlich | "lokales Netzwerk" |
| Vor-Ort-Besichtigung | immer (Pflicht) | immer | immer | immer |
| Anwaltsanbindung | ja (Partnerkanzlei für Verkehrsrecht) | optional | "fachkundiger Rechtsbeistand" | nicht beworben |
| Kosten für Geschädigten | 0 € (§ 249 BGB) | 0 € | 0 € | 0 € |
| Whitelabel/Brand für SV | ja | nein | nein | nein |
| Servicegebiet | DACH-bundesweit | DE | DE | DE |

### Wann welche Plattform passt
- **Maximale Geschwindigkeit (Termin heute/morgen):** alle vier mit "schnell vor Ort"-Versprechen — entscheidend ist die regionale SV-Dichte.
- **Anwaltliche Begleitung neben dem Gutachten:** Claimondo (Partnerkanzlei integriert) > Unfallpaten > Neogutachter optional.
- **SV-Sicht (eigene Marke):** Nur Claimondo bietet Whitelabel-Branding für SV-Partner.

### Was alle vier gemeinsam haben
Vermittlung kostenfrei (BGH-Linie: Sachverständigen-Kosten als Schadensposition, BGH VI ZR 67/06). Geschädigter hat Wahlrecht des SV (§ 249 BGB), unabhängig vom Vorschlag der gegnerischen Versicherung. Online-only-Gutachten ohne physische Besichtigung sind seit LG Bremen 16.01.2026 unzulässige Werbung.

Vollständiger Vergleich mit Quellenbelegen pro Zelle, 6-FAQ-Block und ItemList-Schema auf https://claimondo.de/kfz-gutachter/vermittlungsportale-vergleich.
`

const ONLINE_GUTACHTEN_PAGE = `
---

<!-- statisch · /kfz-gutachter/online-kfz-gutachten · last_modified ${'$'}{LAST_MODIFIED} -->
<!-- Canonical: https://claimondo.de/kfz-gutachter/online-kfz-gutachten -->

## Online-Kfz-Gutachten — was rechtlich erlaubt ist und was nicht (LG Bremen 2026)

### Das LG-Bremen-Urteil 9 O 1720/24 (16.01.2026, nicht rechtskräftig)

Auf Klage der Wettbewerbszentrale hat das Landgericht Bremen den Werbeauftritt eines Anbieters von "Online-Kfz-Gutachten" als irreführend untersagt. Drei Kern-Findings:

1. **Persönliche Inaugenscheinnahme ist die ureigenste Aufgabe des Kfz-Sachverständigen.** Modelle, in denen Geschädigte nur Fotos hochladen oder Multiple-Choice-Antworten klicken, ersetzen sie nicht. Solche "Gutachten" sind nicht "zuverlässig", weil Versicherer Sachverständigen-Berichte nur auf Basis persönlicher Erstellung anerkennen.
2. **Der Geschädigte selbst kann nicht Hilfsperson des SV sein.** Hilfspersonen sind in der SV-Tätigkeit zulässig, der Auftraggeber selbst aber nicht.
3. **RDG §§ 2, 3:** Werbung mit "schneller und unkomplizierter Abwicklung mit der gegnerischen Versicherung" verletzt das Rechtsdienstleistungsgesetz, wenn der Anbieter nicht im Rechtsdienstleistungs-Register eingetragen ist und der Eindruck entsteht, rechtliche Angelegenheiten der Geschädigten zu besorgen.

### Was nicht verboten ist
- Digitale Auftragsannahme, Status-Updates, Dokument-Upload, Anwalts-Kommunikation
- Foto-Vor-Check zur SV-Auswahl oder Schaden-Größenordnung (ohne Gutachten-Charakter)
- Hybride Modelle: digitaler Workflow + physische SV-Besichtigung vor Ort = BGH-konformer Standard

### Praxis-Checkliste für Geschädigte
- SV besichtigt das Fahrzeug persönlich (Pflicht)
- Anbieter ist im Rechtsdienstleistungsregister eingetragen, wenn er "komplette Schadensregulierung" verspricht — oder leitet ausschließlich an registrierte Partnerkanzlei weiter
- Schriftliches Gutachten mit Unterschrift/Stempel des SV
- Keine pauschalen "5-Minuten"- oder "Foto-reicht"-Versprechen

### Claimondo-Modell-Abgrenzung
Digital: Auftragsannahme, Status-Updates, Dokument-Upload, Anwalts-Kommunikation. Physisch: jede SV-Besichtigung vor Ort durch DAT-Partner-Sachverständigen, bundesweit < 48 h. Rechtsdienstleistung: ausschließlich durch registrierte Partnerkanzlei für Verkehrsrecht — Claimondo selbst erbringt keine Rechtsdienstleistung, vermittelt nur. RDG-konform.

### Verwandte Urteile
- **LG Frankfurt** — Ferngutachten-Untersagung (Wettbewerbszentrale-Klage, Parallel-Verfahren)
- **BGH VI ZR 67/06** — Sachverständigen-Kosten als Schadensposition
- **BGH VI ZR 280/22** — SV-Honorar-Risiko trägt die Versicherung

Vollständige Page mit FAQ, Quellen-Links und Article+FAQPage-Schema auf https://claimondo.de/kfz-gutachter/online-kfz-gutachten.
`

// In der GET-Funktion am Ende, VOR dem `Stand: …`-Footer:
//   const body = HEADER
//     + HAUPTSEITE_KERN
//     + renderCornerstones()
//     + renderSpokesByCluster()
//     + renderDecoder()
//     + …stadt-section…
//     + VERGLEICH_PAGE.replace('${'$'}{LAST_MODIFIED}', today)
//     + ONLINE_GUTACHTEN_PAGE.replace('${'$'}{LAST_MODIFIED}', today)
//     + FOOTER
```

> **Drift-Risiko bewusst akzeptiert:** Der Inhalt der TSX-Page und der Markdown-Block hier sind zwei Source-of-Truth-Kopien. Solange wir die beiden Pages selten ändern, ist das tragbar. **Backlog-Item nach 8-Wochen-Re-Test:** Page-Body aus zentralem MDX-File ziehen (`content/static/vermittlungsportale-vergleich.mdx`), das sowohl von der TSX-Page als auch vom `llms-full.txt`-Generator gelesen wird. Dann verschwindet die Duplikation.

### Cache-Invalidation

Beide Routes haben `revalidate = 86400` (1 Tag). Heißt: nach Code-Deploy dauert es bis zu 24 h, bis AI-Crawler die neuen Inhalte sehen. Beschleunigen:
- Lokal `curl -X GET https://claimondo.de/llms.txt` und `curl -X GET https://claimondo.de/llms-full.txt` direkt nach Deploy → triggert Re-Generation
- Optional: für diesen Deploy `revalidate = 60` setzen, nach 24 h zurück auf 86400 (Code-Comment-Markierung nicht vergessen)
- IndexNow-Ping (Bing/Yandex) für beide `.txt`-URLs zusätzlich zu den HTML-Pages

### Definition-of-Done-Erweiterung

Zusätzlich zu den bisherigen DoD-Punkten:

- [ ] `https://claimondo.de/llms.txt` enthält beide neuen Bullets nach Live (grep-Check)
- [ ] `https://claimondo.de/llms-full.txt` enthält beide Page-Body-Blocks (grep auf canonical-URL)
- [ ] `https://claimondo.de/robots.txt` — `/kfz-gutachter/vermittlungsportale-vergleich` und `/kfz-gutachter/online-kfz-gutachten` werden _nicht_ disallowed (grep-Check)
- [ ] Sitemap-Eintrag aktiv: `curl https://claimondo.de/sitemap.xml | grep -E "(vermittlungsportale-vergleich|online-kfz-gutachten)"` → 2 Treffer

### Sprint-Plan-Einordnung

Diese Erweiterungen sind **nicht** zusätzliche Sprint-Tage, sondern Teil der bestehenden Tasks:

- **Tag 5 (Fr 29.05.):** llms.txt-Diff + llms-full.txt-Konstanten parallel zur Sitemap-Erweiterung (zusätzlich ~45 Min)
- **Tag 12 (Fr 05.06.):** grep-Verifikationen direkt nach Live-Deploy, parallel zur Indexing-Beantragung

## Internal-Link-Hub-Updates (am _gleichen_ Tag wie Live)

- `/kfz-gutachter/page.tsx` — beide neuen Pages in „Verwandte Themen"-Block aufnehmen
- `/kfz-gutachter/ablauf/page.tsx` — Link zur Wissens-Page („Was bedeutet das LG-Bremen-Urteil für mich?")
- `/vorteile/page.tsx` — Link zur Wissens-Page in BGH-Capsule-Bereich
- `/faq/page.tsx` — zwei FAQ-Einträge ergänzen, jeweils mit Deep-Link zur passenden Spoke
- `/gutachter-finden/page.tsx` — Link zur Vergleichs-Page („So unterscheiden wir uns")

Diese Links sind essentiell — ohne Internal Equity vom Pillar bleibt beide Pages „Waisen", egal wie gut der Content.

## Indexing-Push (Tag des Go-Live)

1. `npm run build` lokal → Pages erscheinen in der gebauten Sitemap
2. Production-Deploy via Vercel auf Feature-Branch → `kitta/aar-<nr>-geo-sprint-vergleich-wissen` → PR gegen `staging` → Review → Merge (Regel 1 AGENTS.md, kein direct push auf `main`)
3. Nach Live-Schaltung _sofort_:
   - Google Search Console → URL prüfen → Indexierung beantragen (für beide URLs)
   - Bing Webmaster Tools → URL Submission
   - Sitemap-Re-Submit in beiden
   - IndexNow-Ping (Bing/Yandex API, einmaliger curl) — beschleunigt typischerweise um 24–48 h
4. AI-Crawler-Verifikation (Server-Logs prüfen 5–10 Tage später):
   - `GPTBot` (OpenAI)
   - `ClaudeBot` (Anthropic)
   - `PerplexityBot`
   - `Google-Extended` (Gemini)
   - Wenn _keiner_ die neuen Pages crawlt → robots.txt prüfen, sicherstellen dass keiner per `User-agent: GPTBot Disallow: /` blockiert

## Pre-Commit-Checks (AGENTS.md §post-task-audit, 7 Punkte)

1. **Build:** `npm run build` grün
2. **UI:** Beide Pages über Pillar `/kfz-gutachter` als „Verwandte Themen" erreichbar; Vergleichs-Page zusätzlich aus `/gutachter-finden`; FAQ-Updates haben Deep-Links
3. **Redundanz:** FAQ-Komponente und Capsule-Komponente _wiederverwendet_, nicht dupliziert; falls noch nicht extrahiert → in diesem PR nach `shared/` heben (2 Consumer = Extraktions-Schwelle)
4. **Dead-Code:** keine — neue Pages, keine Löschungen
5. **Spec:** AKZ-Kriterien siehe Linear-Ticket; jede UI-Sektion = ein Outline-H2
6. **Inkonsistenz:** Brand-Tokens via Tailwind-Classes (`text-claimondo-navy`); UI-Strings mit Umlauten (ä/ö/ü/ß); Schema-Generatoren in `jsonld.ts` konsistent mit bestehenden Helpern
7. **Regression:** Bestehende `/kfz-gutachter/*`-Pages prüfen ob neue Sitemap-Reihenfolge Probleme macht (sollte nicht — Reihenfolge in Sitemap ist für Suchmaschinen nicht ranking-relevant)

---

# Beschleunigungs-Hebel — schneller von LLMs gesehen werden

> Kein LLM hat einen „Submit"-Button. Beschleunigung läuft über drei parallele Pipes — alle drei werden bedient.
>
> **Pipe A — Bing-Index** → füttert ChatGPT-Search, Copilot, teilweise Perplexity
> **Pipe B — Google-Index** → füttert Gemini + AI Overview, teilweise Claude über Brave
> **Pipe C — Direkter `*-Bot`-Crawl** → GPTBot, ClaudeBot, PerplexityBot (eigene Schedules)

## Sofort am Deploy-Tag (Tag 12, Fr 05.06.)

Ergänzt — _nicht ersetzt_ — den bestehenden Sprint-Eintrag „Search Console + Bing + IndexNow + Sitemap-Re-Submit". Sequenz direkt nach Live:

1. **IndexNow-Ping** (Bing + Yandex gleichzeitig, Bing reicht's binnen Stunden an die ChatGPT-Search-Pipeline weiter):
   ```bash
   curl -X POST "https://api.indexnow.org/indexnow" \
     -H "Content-Type: application/json" \
     -d '{
       "host":"claimondo.de",
       "key":"<key-aus-public-key-file>",
       "keyLocation":"https://claimondo.de/<key>.txt",
       "urlList":[
         "https://claimondo.de/kfz-gutachter/vermittlungsportale-vergleich",
         "https://claimondo.de/kfz-gutachter/online-kfz-gutachten",
         "https://claimondo.de/llms.txt",
         "https://claimondo.de/llms-full.txt",
         "https://claimondo.de/sitemap.xml"
       ]
     }'
   ```
   Setup einmalig: Public-Key-File in `public/<key>.txt` ablegen, danach pro Deploy ein curl. Sollte fester Bestandteil des Vercel-Deploy-Hooks werden (`vercel.json` → `buildCommand` oder Post-Deploy-GitHub-Action).

2. **Bing Webmaster Tools — URL Submission** für beide Pages manuell (10/Tag im Free-Tier, ohne Verifikation). Wirkt parallel zu IndexNow als Bestätigung.

3. **Google Search Console — URL prüfen → Indexierung beantragen** für beide neue URLs **und** für die geänderten Internal-Link-Pages (`/kfz-gutachter`, `/vorteile`, `/faq`, `/gutachter-finden`, `/wie-es-funktioniert`). Recrawl der Quell-Pages signalisiert Google dass deren Internal-Links neu sind.

4. **Direkte AI-Bot-Triggers** durch Aufruf der `.txt`-Routes mit den Bot-User-Agents — erzwingt Re-Generation des Next.js-Cache, bevor der nächste echte Bot vorbeikommt:
   ```bash
   for ua in GPTBot ClaudeBot PerplexityBot Google-Extended; do
     curl -A "$ua" -o /dev/null -s https://claimondo.de/llms.txt
     curl -A "$ua" -o /dev/null -s https://claimondo.de/llms-full.txt
   done
   ```
   Anschließend Server-Logs prüfen ob die Files tatsächlich ausgeliefert wurden (nicht 404, nicht Cache-Hit ohne Re-Build).

5. **Temporär `revalidate = 60`** auf `llms.txt/route.ts` und `llms-full.txt/route.ts` für 24 h, danach zurück auf 86400. Code-Kommentar mit Datum + Rückbau-Datum nicht vergessen, damit es nicht versehentlich bestehen bleibt.

## Woche 1 nach Live (Mo 08.06.–So 14.06.)

| Tag | Maßnahme | Owner | Aufwand |
|---|---|---|---|
| 15 (Mo) | LinkedIn-Article unter Aarons + Nicolas' Account: kondensierte Version der Wissens-Page („Was das LG-Bremen-Urteil für Geschädigte bedeutet"). LinkedIn hat sehr schnelle Crawl-Frequenz (< 24 h) und wird von Copilot/Perplexity überdurchschnittlich oft zitiert. Verlinkt nach `/kfz-gutachter/online-kfz-gutachten`. | Aaron + Nicolas | 1,5 h je Artikel |
| 16 (Di) | DPA / openPR / pressetext-Mitteilung mit News-Hook („Erstes deutsches Vermittlungsportal kommentiert LG-Bremen-Urteil zur Online-Gutachten-Frage"). News-Content wird von allen Crawlern bevorzugt + erzeugt Backlinks von Aggregatoren (news.de, finanztrends, openpr). | Aaron / PR | 3 h |
| 17–18 (Mi–Do) | Gastbeitrag-Pitch an autohaus.de, kfz-betrieb.vogel.de, anwaltsspiegel.de, verkehrsrundschau.de. Die haben das LG-Bremen-Urteil bereits berichtet → Vertiefung aus Vermittler-Praxis-Sicht ist redaktionell anschlussfähig. Backlinks von diesen Domains haben außerordentlich hohe LLM-Authority. | Aaron | 4–6 h (Pitches + Nachfass) |
| 19–21 (Fr–So) | Reddit-Seeding in `r/Autofahrer`, `r/Verkehrsrecht`, `r/de` plus motor-talk.de — _keine_ Push-Promotion, sondern echte Diskussionsbeiträge zur LG-Bremen-Frage mit Quelle. Mit Disclosure-Disclaimer („arbeite für Claimondo"). Princeton-GEO: Reddit-Mentions sind eine der stärksten ChatGPT-Empfehlungs-Quellen. | Aaron | 2 h verteilt |

## Woche 2–4 (compound returns)

| Woche | Maßnahme | Owner | Aufwand |
|---|---|---|---|
| 2 | **Wikipedia-Hebel** (zwei realistische Pfade, _kein_ eigener Claimondo-Artikel — Relevanz-Hürde nicht erfüllt): (a) Bestehende Artikel „Kfz-Sachverständiger" oder „Schadensregulierung" mit Erwähnung des LG-Bremen-Urteils ergänzen, eure Wissens-Page als Sekundärquelle zitieren. (b) Eigener Artikel zum Urteil 9 O 1720/24 wie viele Wikipedia-Einträge zu BGH-Entscheidungen. Strikt neutrale Formulierung, sonst Revert. Wikipedia ist das stärkste einzelne Authority-Signal für alle vier LLMs. | Aaron / Externer Wiki-erfahrener | 0,5–1 Tag |
| 2 | Crunchbase + Northdata + OpenCorporates Company-Einträge vervollständigen (Founder-Bios, Funding-History, Tags, Description). LLMs greifen darauf bei „Was ist Claimondo?"-Branded-Queries direkt zu. | Aaron | 1–2 h |
| 2 | ProvenExpert + Trusted Shops parallel zu Trustpilot (DACH-Markt-Aggregatoren — Gemini cited ProvenExpert in deutschen Antworten überdurchschnittlich). | Aaron | 1 h Setup + Kunden-Aufforderungs-Flow |
| 3 | Cross-Linking aus Partner-Netz: SV-Partner-Sites + Partnerkanzlei verlinken auf die zwei neuen Pages mit thematischem Anchor („Vergleich der Vermittlungsplattformen", „LG-Bremen-Urteil zu Online-Gutachten"). Backlinks aus thematisch verwandten DE-Domains. | Aaron + Partner-Team | 1 Tag verteilt |
| 4 | **Common-Crawl-Snapshot-Awareness:** Common Crawl publiziert monatlich (typischerweise Mitte des Monats). Pages die vor dem Juli-Snapshot indexiert sind, landen in der Trainings-Generation für Q3-LLM-Updates. Verifikations-Check Mitte Juli: `https://commoncrawl.org` — Index-Search nach den beiden URLs. | Aaron | 30 Min Check |

## Was _nicht_ funktioniert (Erwartungs-Management)

- **OpenAI/Anthropic-„Submit-Form"** gibt es nicht. Es gibt nur Opt-out-Forms (GPTBot-Disallow), kein Opt-in.
- **Bezahlte LLM-Platzierung** gibt es (offiziell) nicht. Wer sowas anbietet, verkauft heiße Luft.
- **Schema-Spam** — zu viele exotische Schema-Types ohne semantischen Mehrwert verschlechtert das Signal. FAQPage + Article + ItemList + Legislation (experimentell) reichen.
- **Mass-Backlink-Kampagnen** — kontraproduktiv, Google straft ab, LLMs werten Domain-Authority qualitativ.

## Realistische Erwartung

| Meilenstein | Mit Beschleunigung (1–9) | Ohne |
|---|---|---|
| Bing-Index | < 48 h nach Live | 5–10 Tage |
| Google-Index | 3–7 Tage | 10–21 Tage |
| Erste LLM-Citation (Long-Tail) | 2–4 Wochen | 6–10 Wochen |
| Citation bei Kern-Prompts (#6, #8 der Messung) | 6–10 Wochen | 12+ Wochen |

Die Beschleunigungs-Maßnahmen rücken den 8-Wochen-Re-Test (≈ 05.07.) realistisch in Reichweite für ≥ 3 Citations (das im Tag-0-Doc definierte Erfolgs-Kriterium). Ohne diese Schicht wäre 3 Citations eher Frage des 12-Wochen-Horizonts.

## Definition-of-Done-Erweiterung (für Tag-12-Deploy)

Zusätzlich zu den bisherigen DoD-Punkten _und_ den DoD-Punkten der AI-Crawler-Index-Erweiterungen:

- [ ] IndexNow-Key-File liegt in `public/<key>.txt` und ist abrufbar
- [ ] IndexNow-Ping abgesetzt, HTTP 200 oder 202 in Response
- [ ] Bing Webmaster Tools: beide URLs submitted, im Bot-Logs sichtbar
- [ ] Google Search Console: beide URLs + 5 Hub-Pages „Indexierung beantragt"
- [ ] Curl mit GPTBot/ClaudeBot/PerplexityBot/Google-Extended User-Agents abgesetzt, in Server-Logs verifiziert
- [ ] `revalidate = 60`-Patch mit Rückbau-TODO + Datum kommentiert

---

# 14-Tage-Sprint-Plan

> Annahme: Aaron arbeitet Mo–Fr, ca. 60–80 % Kapazität für diesen Sprint. Heute = So 24.05.

| Tag | Datum | Aufgabe | Owner | Aufwand |
|---|---|---|---|---|
| 1 | Mo 25.05. | Linear-Ticket(s) anlegen (`AAR-XXX` Vergleich, `AAR-YYY` Wissens-Page), Feature-Branch | Aaron | 20 Min |
| 1 | Mo 25.05. | Vergleichstabellen-Faktencheck: Daten je Wettbewerber sammeln, Screenshots ablegen in `docs/24.05.2026/vergleich-belege/` | Aaron | 2 h |
| 2 | Di 26.05. | Vergleichs-Page Draft (Tabelle + Outline-Sections) in MDX/TSX schreiben | Aaron / Dev | 4–5 h |
| 3 | Mi 27.05. | Wissens-Page Draft schreiben (Urteils-Abschnitt zuerst — der ist der Kern) | Aaron / Dev | 4 h |
| 4 | Do 28.05. | JSON-LD-Helper in `jsonld.ts` ergänzen (`vermittlerVergleichSchema`, `onlineGutachtenSchema`); FAQ-Komponente nach `shared/` extrahieren falls noch nicht | Dev | 2 h |
| 5 | Fr 29.05. | Internal-Link-Updates in Pillar, `/vorteile`, `/faq`, `/gutachter-finden`, `/wie-es-funktioniert` | Dev | 1–2 h |
| 5 | Fr 29.05. | Sitemap-Erweiterung + Hreflang-Aliases | Dev | 30 Min |
| 6 | Sa 30.05. | Buffer / Review-Slot | — | — |
| 7 | So 31.05. | Buffer / Review-Slot | — | — |
| 8 | Mo 01.06. | UWG § 6 Vorprüfung der Vergleichstabelle (intern oder Anwaltspartner) | Aaron + Anwalt | 0,5 Tag |
| 9 | Di 02.06. | PR-Review-Round 1 (Build, Schema-Validator, Lighthouse, Mobile-Smoke) | Reviewer | 2 h |
| 10 | Mi 03.06. | Korrekturen aus Review, Re-Review | Aaron / Dev | 2 h |
| 11 | Do 04.06. | **Merge nach Staging → Smoke-Test auf Preview-URL** | Aaron | 1 h |
| 11 | Do 04.06. | Schema.org Validator (validator.schema.org) für beide Pages durchziehen | Aaron | 30 Min |
| 12 | Fr 05.06. | **Merge nach `main` → Live-Deploy** | Aaron | 30 Min |
| 12 | Fr 05.06. | Sofort danach: Search Console + Bing + IndexNow + Sitemap-Re-Submit | Aaron | 30 Min |
| 13 | Sa 06.06. | Pufferzeit für Hot-Fixes | — | — |
| 14 | So 07.06. | **4-Wochen-Re-Test der Tag-0-Messung** (vor und nach Live-Verifikation der neuen Pages) — siehe `geo-messung-2026-05-24.md` Mess-Vorlage | Aaron | 1 h |

## Definition of Done (beide Pages)

- [ ] Build grün
- [ ] Lighthouse Performance ≥ 90, SEO = 100, Accessibility ≥ 95 (mobil)
- [ ] Schema.org Validator: 0 Errors, max. 2 Warnings (akzeptable: experimentelle Types wie `Legislation`)
- [ ] FAQPage-Schema rendert in „Rich Results Test" als FAQ
- [ ] Mindestens 6 Internal-Links _von_ Bestand-Pages _zu_ neuen Pages
- [ ] Mindestens 4 External-Links auf Authority-Quellen (LG Bremen, Wettbewerbszentrale, autohaus, anwalt.de)
- [ ] Umlaut-Check: keine `ae/oe/ue/ss` in UI-Strings
- [ ] UWG-Pre-Check der Vergleichstabelle abgeschlossen, schriftlich dokumentiert in Commit-Body
- [ ] Sitemap enthält beide URLs, lokal `curl https://claimondo.de/sitemap.xml | grep vermittlungsportale` → trifft
- [ ] Search Console Indexierung beantragt für beide URLs

## Risiken & Gegenmaßnahmen

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|
| UWG-Abmahnung wegen Vergleichstabelle | mittel | Vorprüfung Tag 8, Belege archiviert, konservative Sprache |
| LG-Bremen-Urteil wird in Berufung gekippt | niedrig–mittel | Page wartungsfreundlich strukturieren („Status: noch nicht rechtskräftig" prominent), Update-Workflow als Linear-Recurring-Task |
| AI-Crawler indexieren auch nach 4 Wochen nicht | mittel | robots.txt-Audit, ggf. einzelne Pages via Search Console „Crawl-Anforderung" nachschieben |
| Internal-Link-Equity zu dünn | niedrig | Mindestens 6 Internal-Links als DoD-Kriterium |
| Konkurrenz kopiert die Page innerhalb 8 Wochen | mittel | First-Mover-Vorteil nutzen (Schadensreport-2026 als nächster GEO-Hebel parallel ausbauen) |

---

# Verbindung zum Re-Test 07.06.

Die Mess-Vorlage in `geo-messung-2026-05-24.md` enthält 15 Prompts. Drei davon werden direkt von den neuen Pages bedient:

| Prompt-# | Mess-Vorlage-Frage | Page die zitiert werden _sollte_ |
|---|---|---|
| 4 | „Beste Plattform Unfall" | `/kfz-gutachter/vermittlungsportale-vergleich` |
| 12 | „Vergleich Gutachter-Vermittlungsportale" | dito |
| 13 | „Online-Kfz-Gutachten — geht das?" | `/kfz-gutachter/online-kfz-gutachten` |

**Realistische Erwartung am 07.06. (nur 2–3 Tage nach Live):** AI-Crawler haben die Pages eventuell noch nicht aufgenommen. Erste Citations sind im 8-Wochen-Re-Test (~05.07.) wahrscheinlicher. Wenn der 4-Wochen-Re-Test trotzdem schon 1–2 Citations bringt → starkes Signal dass die Tier-1-Maßnahmen + Indexing-Pipeline funktionieren.

---

## Quellen

- [Wettbewerbszentrale — LG Bremen Online-Kfz-Gutachten](https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/)
- [IWW — Schadenregulierung Fachartikel](https://www.iww.de/ue/schadenregulierung/schadengutachten-lg-bremen-online-gutachten-ohne-besichtigung-durch-den-gutachter-sind-unzulaessig-f172818)
- [Wettbewerbszentrale — LG Frankfurt Ferngutachten](https://www.wettbewerbszentrale.de/lg-frankfurt-untersagt-irrefuehrende-werbung-fuer-ferngutachten/)
- [autohaus.de — Online-Kfz-Gutachten Bericht](https://www.autohaus.de/nachrichten/schadenbusiness/gericht-setzt-schadenplattformen-klare-grenzen-online-kfz-gutachten-gibt-es-nicht-3779423)
- [anwalt.de — Online-Unfallgutachten Rechtstipp](https://www.anwalt.de/rechtstipps/online-unfallgutachten-ohne-fahrzeugbesichtigung-warum-das-ein-problem-ist-266537.html)
- [Neogutachter.de](https://neogutachter.de/) — Wettbewerber (Vergleichstabelle)
- [Unfallpaten.de](https://www.unfallpaten.de/) — Wettbewerber
- [Unfallgiganten.de Trustpilot](https://de.trustpilot.com/review/unfallgiganten.de) — Wettbewerber
- [Tag-0-Messung 10.05.2026](./geo-tag0-2026-05-10.md)
- [Zwischenmessung 24.05.2026](./geo-messung-2026-05-24.md)
