# Faktencheck — Vergleichstabelle Kfz-Gutachter-Vermittlungsportale

**Ticket:** AAR-938 (GEO-Sprint Tag 1) · **Erstellt:** 25.05.2026 · **Abruf der Quellen:** 25.05.2026, ~22:00 Uhr MESZ
**Plan-Referenz:** `docs/geo/geo-sprint-vergleich-und-wissen-2026-05-24.md` (Brief 1, Vergleichstabelle Zeile 53–63)
**Ziel-Page:** `/kfz-gutachter/vermittlungsportale-vergleich`

> Spec-Pfad-Hinweis: Der Plan nennt als Ablage `docs/24.05.2026/vergleich-belege/`. Tatsächliches Arbeitsdatum ist der 25.05. → Ablage hier unter `docs/25.05.2026/vergleich-belege/` (Konvention „Datum = Arbeitstag"). Die Page-Implementierung (Tag 2) referenziert diesen Pfad.

## Methodik

Die Tag-0/Zwischenmessung-Tabelle enthielt mehrere unverifizierte Zellen (`_Faktencheck nötig_`) und Annahmen. Dieser Check verifiziert **jede Wettbewerber-Zelle** mit wörtlichem Zitat + Quelle + Abrufdatum (UWG-§6-Pflicht: jede vergleichende Aussage braucht einen Beleg).

- **Konkurrenz-Seiten + Trustpilot:** blockten `WebFetch` mit HTTP 403 (Bot-Schutz). Abruf daher mit echtem Chromium (Playwright 1.59.1, de-DE-Context) via `scripts/probe-vergleich-belege.cjs`. Sichtbarer Text extrahiert + datierte Viewport-Screenshots abgelegt (siehe Belege-Index unten).
- **Claimondo-eigene Fakten:** aus dem Repo verifiziert (`src/app/**`, `llms-full.txt`), nicht „aus dem Marketing geraten".

---

## Verifizierte Vergleichstabelle (Stand 25.05.2026)

| Kriterium | Claimondo | Neogutachter | Unfallpaten | Unfallgiganten |
|---|---|---|---|---|
| **Geschäftsmodell** | Gemanagte Full-Service-Regulierung (Gutachten → Partnerkanzlei → Auszahlung, ein Fall-Hub) | Gutachter-Vermittlung (Online-Anfrage → passender SV) | Schadenabwicklung „aus einer Hand" (Gutachter + Rechtsbeistand) | Unfall-Experten-**Verzeichnis** mit Umkreis-Suche (SV / Werkstatt / Anwalt / Abschleppdienst), Profil-Listings |
| **Erreichbarkeit** | Digitale Meldung jederzeit, Reaktion „unter 15 Minuten"; Tel. Team Köln | „rund um die Uhr und deutschlandweit", Anfrage „in 30 Sekunden"; Tel. 0160/4873888 | „24h Kfz Gutachter Soforthilfe", Hotline 0800 505 50 50 | „Sofort-Vermittlung" + Umkreis-Suche (25–300 km); keine 24/7-Plattform-Zusage |
| **SV-Netz-Größe (öffentl. Angabe)** | „hunderte" DAT-Partner, Schwerpunkt NRW — **keine harte Zahl** (s. offene Punkte) | nicht öffentlich beziffert | „bundesweites Netzwerk" — keine Zahl | **„Über 250 geprüfte Kfz Gutachter"** (Such-Counter zeigt 329) |
| **Vor-Ort-Besichtigung** | immer Pflicht | Standard („Vor Ort Schadensaufnahme") | „direkt vor Ort" | vermittelt Vor-Ort-SV |
| **Online-only-Gutachten ohne Besichtigung** | nein | nein | nein (nicht beworben) | nein (nicht beworben) |
| **Anwaltsanbindung** | ja — **integrierte feste Partnerkanzlei** | ja (Reviews: Gutachter + Anwalt) | ja — „fachkundiger Rechtsbeistand" | ja — Rechtsanwalt als eine von vier Partnerkategorien |
| **Kosten f. Geschädigten** | 0 € (§249 BGB, vorbehaltlich Anerkenntnis) | „unverbindlich & kostenlos" | 0 € (haftende Versicherung zahlt) | „Kostenlos für Geschädigte" |
| **Whitelabel/Brand für SV** | **ja (einzige der vier)** | nein | nein | nein (aber kostenpflichtige „Premium Member"-Listings) |
| **Trustpilot (Stand 25.05.2026)** | kein Profil | 4,6 · 133 Bewertungen | kein Profil (extern Webwiki 3,7) | 4,5 · 14 Bewertungen |
| **Servicegebiet** | bundesweit (DE), Schwerpunkt NRW | deutschlandweit (DE) | deutschlandweit (DE) | deutschlandweit (DE) |

---

## Korrekturen gegenüber dem Plan-Entwurf (wichtig)

Der Tabellen-Entwurf im Plan enthielt **fünf belegbar falsche/unbelegte Zellen**. Vor Publish zwingend übernehmen — sonst UWG-§6-Risiko (falsche Tatsachenbehauptung über Wettbewerber bzw. über sich selbst).

| # | Zelle | Plan-Entwurf | Verifiziert | Konsequenz |
|---|---|---|---|---|
| 1 | **Claimondo Servicegebiet** | „DACH" | „bundesweit (DE)" — keine einzige Österreich/Schweiz-Aussage im gesamten Repo; durchgängig „bundesweit"/„deutschlandweit"/„in Deutschland" | **Falsch-Selbstaussage**, korrigieren. „DACH" wäre irreführend (§5 UWG). |
| 2 | **Unfallgiganten Erreichbarkeit** | „‚60 Min vor Ort'-Versprechen" | **Kein** „60-Minuten"-Versprechen auffindbar. Tatsächlich: „Sofort-Vermittlung", Umkreis-Suche | Plan-Annahme widerlegt — Aussage **streichen**, sonst falsche Zuschreibung. |
| 3 | **Neogutachter Erreichbarkeit** | „‚innerhalb 2 Std.' Rückruf" | **Kein** „2-Std"-Claim. Tatsächlich: „rund um die Uhr und deutschlandweit", Anfrage „in 30 Sekunden" | korrigieren auf belegten Wortlaut. |
| 4 | **Unfallgiganten SV-Netz** | „lokales Netzwerk" (vage) | publiziert **harte Zahl**: „Über 250 geprüfte Kfz Gutachter" (Counter 329) | präzisieren. |
| 5 | **Unfallgiganten Anwalt** | „nicht beworben" | **doch beworben**: „Rechtsanwalt" ist eine von vier Partnerkategorien; Reviews bestätigen Anwalts-Vermittlung | korrigieren auf „ja". |

**Folge für den Differenzierungs-Angle:** Der Plan suggerierte, Anwaltsanbindung sei ein Claimondo-Alleinstellungsmerkmal. Tatsächlich bieten **alle vier** eine Form von Anwaltsanbindung, und **alle vier** sind für Geschädigte kostenlos, Vor-Ort-Pflicht und ohne Online-only-Gutachten. Die belastbaren Claimondo-Differenzierer sind:

1. **Whitelabel-Branding für SV-Partner** — als einzige der vier (AGENTS §branding-rules; Beleg: Feature existiert produktiv).
2. **Integrierte, gemanagte End-to-End-Regulierung mit fester Partnerkanzlei** (ein Fall-Hub, Gutachten → Kanzlei → Auszahlung) — vs. Neogutachter = reine Lead-Vermittlung zu einem einzelnen SV, Unfallgiganten = Verzeichnis/Marktplatz mit Premium-Listings, Unfallpaten = am nächsten dran („aus einer Hand").
3. **Modell-Transparenz statt „Geschwindigkeits-Marketing"** — keine unhaltbaren Minuten-Versprechen.

Der ehrliche Vergleichs-Angle ist also **Geschäftsmodell-Tiefe** (gemanagt vs. Vermittlung vs. Verzeichnis), nicht „wir sind das einzige mit Anwalt". Das ist gleichzeitig UWG-sicherer.

---

## Belege je Wettbewerber (wörtliche Zitate)

### Neogutachter — https://neogutachter.de/ (HTTP 200, abgerufen 25.05.2026)
- Erreichbarkeit: „**Schnell und stressfrei zu einem erfahrenen Kfz-Gutachter — rund um die Uhr und deutschlandweit**" · „**In 30 Sekunden zum besten Kfz-Gutachter.**" · Telefon „0160/4873888"
- Vor-Ort: „**Vor Ort Schadensaufnahme & Gutachtenerstellung**" (Schritt 3)
- Kosten: „**Unverbindlich & kostenlos**"
- Anwalt: Trustpilot-Reviews mehrfach „**der Gutachter und der Anwalt — allesamt ultraschnell**" → Anwalts-Einbindung real
- Whitelabel: nicht auffindbar
- Beleg: `neogutachter-home-2026-05-25.png`

### Unfallpaten — https://www.unfallpaten.de/ (HTTP 200, abgerufen 25.05.2026)
- Erreichbarkeit: „**24h Kfz Gutachter Soforthilfe**" · Hotline „**0800 505 50 50**"
- Vor-Ort: „**Kfz Gutachter für Unfallgutachten – direkt vor Ort**"
- Netz: „**langjährige Erfahrung mit bundesweitem Netzwerk**" (keine Zahl)
- Kosten: „**Als Geschädigter übernimmt die haftende Versicherung die Kosten für dein Unfallgutachten**" · „weder finanziell in Vorleistung … noch werden dir die Kosten später … abgezogen"
- Anwalt: „**fachkundiger Rechtsbeistand**" · „Wir stellen dir Fachexperten zur Seite …"
- Servicegebiet: „**Unabhängige Kfz Gutachter Deutschlandweit**"
- Whitelabel: nicht auffindbar
- Beleg: `unfallpaten-home-2026-05-25.png`

### Unfallgiganten — https://www.unfallgiganten.de/ + /kfz-gutachter (HTTP 200, abgerufen 25.05.2026)
- Positionierung: „**Kfz Gutachter finden: Deutschlands Nr.1 Plattform für unabhängige Sachverständige**" · „**Die Plattform für Kfz Gutachter und Unfallexperten in Ihrer Umgebung**"
- SV-Netz: „**Über 250 geprüfte Kfz Gutachter ⭐ Sofort-Vermittlung ⭐ Kostenlos für Geschädigte**" · Such-Counter „**329 KFZ Gutachter in Ihrer Umgebung gefunden**"
- Modell: Umkreis-Suche (Distanz „+25/+50/+75/+100/+200/+300 km"); Kategorien „KFZ Gutachter / Werkstatt / Rechtsanwalt / Abschleppdienst"; „Über 10.000+ Autofahrer vertrauen auf Unfallgiganten"; SV-Akquise „**Sie sind Kfz Gutachter? Jetzt mitmachen!**" + „Premium Member"
- Anwalt: „Rechtsanwalt" als Partnerkategorie; Trustpilot-Review „**Die Möglichkeit einen Anwalt direkt mit ins Boot zu holen hat sich ausbezahlt.**"
- **Kein** „60-Minuten"/Minuten-Versprechen auffindbar
- Adresse: Lennestraße 3, 58507 Lüdenscheid · info@unfallgiganten.de
- Belege: `unfallgiganten-home-2026-05-25.png`, `unfallgiganten-kfz-gutachter-2026-05-25.png`

---

## Trustpilot-Status (de.trustpilot.com, abgerufen 25.05.2026)

| Domain | HTTP | Profil | Score · Bewertungen | Beleg |
|---|---|---|---|---|
| neogutachter.de | 403¹ | aktiv | **4,6 · 133** | `trustpilot-neogutachter-2026-05-25.png` |
| unfallgiganten.de | 200 | aktiv („Profil beansprucht") | **4,5 · 14** | `trustpilot-unfallgiganten-2026-05-25.png` |
| unfallpaten.de | 404 | **kein Profil** | — (extern Webwiki 3,7²) | `trustpilot-unfallpaten-2026-05-25.png` |
| claimondo.de | 404 | **kein Profil** | — | `trustpilot-claimondo-2026-05-25.png` |

¹ Hauptdokument lieferte HTTP 403, der Profil-Inhalt wurde dennoch gerendert (Score + 133 Bewertungen + benannte Reviewer mit Feb-2026-Daten im Screenshot sichtbar). Vor Publish optional manuell gegenchecken.
² „Webwiki 3,7/5" stammt aus der Tag-0-Messung (10.05.) und wurde in diesem Check **nicht** erneut abgerufen — vor Publish verifizieren oder als „extern" kennzeichnen.

> Trustpilot-Werte sind zeitvariabel → Page braucht Disclaimer „Stand der Angaben: 25.05.2026" (deckt sich mit der UWG-Footer-Pflicht aus dem Plan).

---

## Claimondo-eigene Fakten (aus dem Repo verifiziert)

- **Servicegebiet bundesweit (DE), Schwerpunkt NRW** — `src/app/layout.tsx`, `page.tsx`, `ueber-uns/page.tsx`, `kfz-gutachter/page.tsx`, `llms-full.txt`. Kein DACH.
- **SV-Netz „hunderte" DAT-Partner** — `llms-full.txt`: „Hunderte zertifizierte Partner-Sachverständige in ganz Deutschland", „hunderte DAT-Partner-Sachverständige bundesweit". Quelle = öffentliches DAT-Verzeichnis.
- **Erreichbarkeit** — „Antwort unter 15 Minuten" (`page.tsx`); „direkter Draht zum Team in Köln", „keine Bandansagen, kein Callcenter" (`ueber-uns`). Tel. +49 221 25906530.
- **Vor-Ort-Pflicht** — „besichtigt das Fahrzeug vor Ort innerhalb von 48 Stunden".
- **Partnerkanzlei integriert** — „Unsere Partnerkanzlei setzt anschließend … direkt gegen die gegnerische Versicherung durch".
- **0 € §249 BGB**, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer (Disclaimer steht bereits auf Bestand-Pages).
- **Whitelabel** — AGENTS §branding-rules: verifizierter SV mit `use_custom_branding` brandet Portal + Kundensicht.

---

## Offene Punkte für Aaron (vor Tag-8-UWG-Vorprüfung)

1. **Claimondo SV-Netz-Zahl:** Gibt es eine **belegbare** aktive Partnerzahl (DAT-Verzeichnis / aktive SV)? Unfallgiganten beziffert öffentlich „über 250". Empfehlung: in der Tabelle qualitativ bleiben („DAT-Partner-Netzwerk, bundesweit, Schwerpunkt NRW") **oder** eine belegte Zahl setzen — keine ungestützte „hunderte"-Behauptung in einer §6-Tabelle.
2. **„24/7 telefonisch":** Der Plan-Entwurf schrieb Claimondo „24/7 digital + telefonisch" zu. Verifiziert ist nur „digitale Meldung jederzeit + Reaktion < 15 Min"; das Telefon ist ein Team in Köln (keine 24/7-Telefon-Zusage auf der Seite). → Tabelle entsprechend ehrlich halten (so oben bereits umgesetzt).
3. **Unfallpaten „Webwiki 3,7":** vor Publish aktuell gegenchecken oder als „extern (Webwiki)" kennzeichnen.
4. **Neogutachter-Trustpilot 403-Quirk:** Score 4,6/133 ist durch Text + Screenshot belegt; bei Bedarf manuell im Browser bestätigen.
5. **Disclaimer-Pflicht:** Footer „Stand der vergleichenden Angaben: 25.05.2026"; Konkurrenz-Domains mit `rel="nofollow"` (Plan).

---

## Belege-Index (`docs/25.05.2026/vergleich-belege/`)

| Datei | Inhalt |
|---|---|
| `neogutachter-home-2026-05-25.png` | Neogutachter Startseite |
| `unfallpaten-home-2026-05-25.png` | Unfallpaten Startseite |
| `unfallgiganten-home-2026-05-25.png` | Unfallgiganten Startseite |
| `unfallgiganten-kfz-gutachter-2026-05-25.png` | Unfallgiganten /kfz-gutachter (Netz-Zahl) |
| `trustpilot-neogutachter-2026-05-25.png` | Trustpilot 4,6 · 133 |
| `trustpilot-unfallgiganten-2026-05-25.png` | Trustpilot 4,5 · 14 |
| `trustpilot-unfallpaten-2026-05-25.png` | Trustpilot 404 (kein Profil) |
| `trustpilot-claimondo-2026-05-25.png` | Trustpilot 404 (kein Profil) |

Reproduzierbar via `scripts/probe-vergleich-belege.cjs` (NODE_PATH = node_modules des Haupt-Repos).
