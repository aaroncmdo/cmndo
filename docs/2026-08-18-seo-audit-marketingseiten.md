# SEO-Audit — alle Marketing-Properties (18.08.2026)

**Methode:** Live-Crawl der ausgelieferten HTML-Antworten (nicht Code-Analyse). Eigener Crawler
über die jeweilige `sitemap.xml`, Extraktion von Title/Description/Canonical/robots-meta/H1/
hreflang/JSON-LD/og/alt/Wortzahl. **661 URLs über 7 Domains**, alle HTTP 200.

**Limitation:** Der Ahrefs-MCP ist auf allen Ebenen plan-gesperrt (`Insufficient plan`, auch
`subscription-info`). Es liegen daher **keine** Ranking-, Backlink- oder GSC-Daten vor. Alle
Aussagen unten stammen aus dem Live-Crawl + einer Stichprobe der Google-SERPs. Für Sichtbarkeits-
und Wettbewerbsdaten braucht es einen Ahrefs-Plan-Upgrade oder GSC-Zugang.

## Property-Landkarte

| Domain | Rolle | Sitemap-URLs | Port |
|---|---|---|---|
| `claimondo.de` | Haupt-Marketing, 6 Sprachen | 343 (+3 fremd) | 3006 |
| `autounfall.io` | Standalone-Ratgeber, kein Claimondo-Bezug | 254 | 3002 |
| `kfz-unfallgutachter-{koeln,aachen,bonn,duesseldorf,wuppertal}.de` | 5 Cluster-LPs | 9–12 | 3007 ff. |
| `gutachter.claimondo.de`, `makler.claimondo.de` | Recruiting-Subdomains | 343 (Spiegel!) | 3006 |
| `app.claimondo.de` | Portal — korrekt per robots.txt gesperrt | — | — |

## Was gut ist (nicht anfassen)

- **JSON-LD flächendeckend und außergewöhnlich reich.** `Organization`/`WebSite`/`LegalService`
  auf allen 343 Seiten, `BreadcrumbList` 332×, **`FAQPage` 317×**, `HowTo` 161×, `Article` 157×.
  0 Seiten ohne JSON-LD. FAQPage ist der stärkste dokumentierte GEO-Hebel (+40 % AI-Zitierung) —
  der ist hier bereits gezogen.
- **AI-Bot-Allowlist vorbildlich**: 25 Bots explizit erlaubt (GPTBot, ClaudeBot, PerplexityBot,
  OAI-SearchBot, Google-Extended …), zusätzlich zum `*`-Eintrag.
- **0 tote Links in allen Sitemaps** (661/661 HTTP 200), 0 fehlende Titles, 0 fehlende
  Descriptions, 0 fehlende Canonicals, **0 Bilder ohne alt-Attribut**.
- **hreflang korrekt** wo gesetzt: 198 Seiten mit vollständigem 7er-Set inkl. `x-default`.
- **TTFB 0,21–0,49 s** über alle geprüften Seiten.
- **Cluster-LPs technisch tadellos**: Titles 40–50 Zeichen, alle Canonicals korrekt, JSON-LD komplett.

---

## P0 — kritisch

### 1. Doppelter Brand im Title auf 318 von 343 Seiten — live in Google sichtbar

Die SERP zeigt heute wörtlich:
`4-Wochen-Regulierungsfrist nach Verkehrsunfall · Claimondo | Claimondo`

**Ursache (zwei Schichten, beide nötig):**
- `app/[locale]/layout.tsx:51` — `title: { template: '%s | Claimondo' }`
- 8 Call-Sites hängen **zusätzlich** `· Claimondo` an:
  `decoder/[slug]`, `haftpflicht/[slug]`, `kfz-gutachter/[stadt]`, `kfz-haftpflicht-schaden`,
  `ratgeber`, `sachverstaendige/[slug]`, `versicherer`, `versicherer/[slug]`

**Zahlen:** 337/343 Titles > 60 Zeichen, **Median 86**, Maximum 117.

**Wichtig — der Einzeiler reicht nicht.** Durchgerechnet:

| Variante | Titles > 60 | Median |
|---|---|---|
| Ist-Zustand | 337 / 343 | 86 |
| `· Claimondo` entfernt (8 Call-Sites) | 317 / 343 | 74 |
| ganz ohne Brand-Suffix | 212 / 343 | 62 |

Der Doppel-Brand ist der schnelle Teilfix; die **Basis-Titles sind unabhängig davon zu lang**.
Redaktionell nachzuziehen sind vor allem `/kfz-gutachter/*` (160), `/wissen/*` (59),
`/haftpflicht/*` (47), `/decoder/*` (12), `/versicherer/*` (12), `/sachverstaendige/*` (9).

**Schaden:** Primär CTR — Google kürzt bei ~60 Zeichen. Der eigentliche Treiber ist aber, dass
doppelte Brand-Nennung ein bekannter Auslöser für **Google-Title-Rewriting** ist: Google ersetzt
den Titel dann durch eigenen Text, und die Keyword-Kontrolle geht verloren.

### 2. Vier Rechtsseiten canonicalisieren auf die Startseite → werden de-indexiert

`/impressum`, `/datenschutz`, `/agb`, `/nutzungsbedingungen` liefern alle
`<link rel="canonical" href="https://claimondo.de">`.

**Ursache:** `app/[locale]/layout.tsx:59-62` setzt `alternates: { canonical: SITE_URL }` als
Layout-Default. Next.js vererbt das an jede Seite, die kein eigenes `alternates.canonical` setzt.
Die vier Legal-Pages setzen keines (verifiziert: 0 Treffer für `alternates|canonical` in allen
vier `page.tsx`).

**Widerspruch:** Alle vier stehen **explizit in der Sitemap** (`sitemap.ts:192-215`) — die Sitemap
sagt „indexiere mich", das Canonical sagt „ich bin die Startseite". Google folgt dem Canonical.

**Relevanz über SEO hinaus:** Impressum und Datenschutzerklärung sind nach § 5 DDG / Art. 13 DSGVO
auffindbar zu halten. Ein Canonical, das sie aus dem Index nimmt, ist auch aus Compliance-Sicht
unschön (die Seiten sind erreichbar und verlinkt — das trägt; aber die Indexierbarkeit
wegzuwerfen ist unnötig).

**Fix:** Im Root-Layout `alternates.canonical` entfernen (bzw. nur auf der Startseite setzen) und
in den vier Legal-Pages je ein eigenes Canonical setzen. Achtung Regressionsrisiko: 338 Seiten
setzen ihr Canonical bereits selbst — die sind vom Fix nicht betroffen.

---

## P1 — wichtig

### 3. 154 Seiten mit zwei H1-Elementen
Betrifft durchgängig die MDX-Cluster (`/haftpflicht`, `/decoder`, `/sachverstaendige`, `/wissen`).
Jeweils exakt 2× H1. Vermutlich Layout-H1 + Artikel-H1. Eine davon zu H2 (oder `sr-only`-Wrapper
prüfen).

### 4. `/schaden-melden`: `noindex` — steht aber mit priority 0.9 in der Sitemap
Live-Header: `robots: noindex, nofollow`. In `sitemap.ts:66-70` mit `priority: 0.9` gelistet.
Entweder aus der Sitemap nehmen oder indexierbar machen — der Widerspruch kostet Crawl-Budget und
erzeugt GSC-Warnungen („Durch noindex ausgeschlossen, in Sitemap eingereicht").

### 5. `/gutachter-finden` hat 31 Wörter indexierbaren Text — bei sitemap-priority 0.95
Die H1 ist `class="sr-only"`, der gesamte Inhalt kommt clientseitig aus
`GutachterFindenSection` (Map). 337 KB HTML, davon ~0 lesbarer Fließtext. Für Suchanfragen wie
„kfz gutachter in der nähe" hat diese Seite praktisch keine Substanz — obwohl sie als
zweitwichtigste Seite der Sitemap deklariert ist. **Empfehlung:** serverseitig gerenderter
Einleitungs- und Regionen-Text unter der Karte (die 158 Stadtseiten liefern das Material bereits).

### 6. 145 Seiten ohne hreflang bei 6-Sprachen-Setup
Betroffen: `/haftpflicht` (57), `/wissen` (64), `/versicherer` (13), `/sachverstaendige` (8),
`/ratgeber`, `/kfz-haftpflicht-schaden`, `/autor`. Bei `/versicherer` ist das laut Kommentar in
`sitemap.ts:356-358` **bewusst** (de-only). Für `/haftpflicht` und `/wissen` ist es vermutlich
eine Lücke — die MDX-Route setzt keine `languageAlternates`.

### 7. 167 Seiten ohne `og:image`
Fast die Hälfte des Contents teilt sich ohne Vorschaubild — schwächt Social-CTR und
Link-Wahrscheinlichkeit. Betroffen: `/wissen` (64), `/haftpflicht` (58), `/versicherer` (13),
`/decoder` (12), `/sachverstaendige` (9). Ein statisches Cluster-Default-Bild pro MDX-Route
genügt; `twitter:card` ist überall gesetzt (0 Lücken).

### 8. HTML-Seitengröße: Median 461 KB, 157 Seiten > 500 KB, Startseite 850 KB
Bei 5.176 Wörtern auf der Startseite entspricht der Textanteil ~35 KB — der Rest ist Markup und
inline-Payload. TTFB ist gut (0,49 s), aber das Transfervolumen belastet LCP auf Mobilgeräten.
Größte: `/` 850 KB, `/kfz-gutachter` 770 KB, `/kfz-gutachter/koeln` 606 KB.

### 9. Doorway-Risiko: 89 % Textidentität zwischen den Cluster-LPs
Gemessen über normalisierte Satzmengen (Stadtname maskiert):

| Vergleich | identische Sätze | Overlap |
|---|---|---|
| Köln ∩ Bonn | 158 | **89 %** |
| Köln ∩ Aachen | 162 | **78 %** |

Die fünf `page.tsx` sind **byte-identisch** (`diff` = 0 Zeilen); die Differenzierung kommt
ausschließlich aus `lib/site.ts`.

**Fair eingeordnet:** Das `AutomotiveBusiness`-Schema ist **korrekt und ehrlich** — alle fünf
nennen die echte Adresse (Hansaring 10, Köln) und differenzieren sauber über `areaServed`
(Aachen-Domain listet Düren/Alsdorf/Würselen …). Es wird **keine** falsche lokale Präsenz
behauptet. Das Risiko liegt allein in der Textidentität: fünf Exact-Match-Domains mit ~85 %
gleichem Inhalt und einer Telefonnummer ist das Muster, das Googles Spam-Richtlinie unter
„Doorway Pages" beschreibt (*„multiple domain names targeted at specific regions that funnel
users to one page"*).

**Empfehlung:** Pro Stadt 30–40 % genuin lokalen Text (Werkstätten, Gerichtsstand, lokale
Unfallschwerpunkte, regionale Fristen-Praxis) — das Material der 158 Stadtseiten existiert bereits.
Ohne Differenzierung ist der Cluster jederzeit abwertbar.

---

## P2 — empfohlen

| # | Befund | Umfang |
|---|---|---|
| 10 | 3 Legal-Pages teilen sich dieselbe Meta-Description | `/agb`, `/impressum`, `/nutzungsbedingungen` |
| 11 | `gutachter.` + `makler.`-Subdomain spiegeln die **komplette** Site (343 URLs, identische Sitemap). Canonical zeigt korrekt auf `claimondo.de` — kein Duplicate-Schaden, aber unnötiges Crawl-Budget. Sauberer: 301 auf den kanonischen Host außerhalb der eigenen LP. | 2 Hosts × 343 URLs |
| 12 | 28 Descriptions > 160 Zeichen (max 269) | claimondo.de |
| 13 | `/ratgeber` canonicalisiert auf `/unfall-was-tun-als-geschaedigter` (bewusst), steht aber in der Sitemap | 1 URL |
| 14 | Thin Content: `/check` (234 W), `/agb` (187 W), `/nutzungsbedingungen` (179 W), `/impressum` (56 W) | 4 URLs — bei Legal-Pages unkritisch |

### autounfall.io (eigene Baustelle, technisch sauberer)
0 H1-Fehler, 0 Canonical-Fehler, 0 robots-Widersprüche, Median 611 Wörter. Offen:
- 174 / 254 Titles > 60 (Median 67, max 81) — **kein** Doppel-Brand, nur zu lang
- 44 Descriptions > 160
- **204 / 254 ohne `og:image`** (80 %)
- `LocalBusiness`-Schema auf 100 Seiten — prüfen, ob das zum „STANDALONE, kein Claimondo-Bezug"-
  Entity-Lock passt (welche Adresse wird dort behauptet?)

---

## Empfohlene Reihenfolge

1. **Canonical-Bug** (P0 #2) — kleinster Eingriff, verhindert laufende De-Indexierung. 1 Layout-Zeile + 4 Pages.
2. **Doppel-Brand entfernen** (P0 #1, Teil 1) — 8 Call-Sites, mechanisch, sofort SERP-wirksam.
3. **Sitemap-Widersprüche** (#4, #13) — `/schaden-melden` + `/ratgeber` raus.
4. **H1-Duplikate** (#3) — ein Layout-Fix deckt 154 Seiten.
5. **Title-Kürzung redaktionell** (P0 #1, Teil 2) — der große Brocken, 300+ Titles.
6. **`/gutachter-finden` SSR-Text** (#5) — höchster Traffic-Hebel der Liste.
7. **Cluster-Differenzierung** (#9) — strategisch, verhindert Abwertung des ganzen Clusters.

## Nicht geprüft (fehlender Zugang)

- Rankings, Sichtbarkeitsindex, Backlink-Profil, Wettbewerbsvergleich (Ahrefs plan-gesperrt)
- Google-Search-Console-Daten (Impressionen, CTR, Indexierungsabdeckung, Core Web Vitals Feld-Daten)
- Tatsächliche Core Web Vitals (LCP/INP/CLS) — hier nur TTFB und Transfervolumen gemessen
- Indexierungsabdeckung: nur SERP-Stichprobe, keine vollständige `site:`-Zählung
