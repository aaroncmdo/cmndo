# B2C-Sichtbarkeit — Plan (28.08.2026)

**Ziel (Aaron):** B2C-Leads über KI-Assistenten. „Wir wollen als stärkste Macht auftauchen."

---

## Der Befund, der die Strategie umdreht

Fünf ChatGPT-Tests am 25.08. ergaben bei jeder lokalen Gutachtersuche: **kein Claimondo**,
stattdessen 13–14 Betriebe aus einem lokalen Branchenindex. Die naheliegende Lesart war
„wir sind in Google Maps nicht vertreten, dagegen kommen wir nicht an".

**Die Lesart war falsch.** Der Abgleich der genannten Namen mit unserer Partnerliste:

| In ChatGPTs Antwort genannt | Unser Partner? | Google-Profil |
|---|---|---|
| Sachverständigenbüro **Gall** | **ja** | 5,0★ · 24 Bewertungen |
| **UnfallSafe** Köln Ehrenfeld | **ja** | 5,0★ · 119 Bewertungen |
| **UnfallSafe** Köln Mülheim | **ja** | (dasselbe Profil) |

⭐⭐ **ChatGPT empfiehlt bereits unsere eigenen Partner — nur nicht über uns.**
Wir verlieren nicht gegen Fremde, sondern gegen unser eigenes Netz. Der Lead entsteht,
er läuft nur am Vermittler vorbei. Genau das, was Aaron ausgeschlossen haben will:
„der lead soll ja über uns passieren".

Das verschiebt die Aufgabe: **nicht** „in Maps hineinkommen" (wir haben keine Ladenadresse
je Stadt und sollten auch keine erfinden), sondern **an den Profilen sichtbar werden, die
schon gewinnen.**

## Ist-Stand, gemessen

**Partner-Google-Präsenz** (28.08., nach Abzug der Test-/Smoke-Konten):

| | Zahl |
|---|---|
| SV-Profile gesamt (ohne Smoke-/Test-Mails) | 19 |
| mit `profiles.google_place_id` | **7** — davon 1 internes Konto, alle mit Bewertungen im Cache |
| ohne, **aber echte Aufgabe** | **3** — Sahin, Burak, Luis (siehe P1.1) |
| ohne, **keine Aufgabe** | 9 — 6× `pending`, 1× `frist_ueberschritten`, 2 Testkonten |
| stärkstes Profil | A. Kloss GmbH — 5,0★ / **359** Bewertungen |

⚠ Die Zahlen „12 aktive / 6 ohne" der ersten Fassung waren zu grob: sie zählten
Onboarding-Karteileichen als Partner mit. Korrigiert am 28.08. beim Aufbereiten der
Arbeitsliste — Begründung und Namensliste unter P1.1.

⚠⚠ **KORREKTUR EINER EIGENEN FEHLMESSUNG.** Zuerst hatte ich
`sachverstaendige.standort_place_id` gemessen und „nur 3 von 16" gemeldet. Falsches Feld:
der Bewertungs-Cron (`api/cron/google-bewertungen`) liest **`profiles.google_place_id`**.
Die beiden bedeuten Verschiedenes:

```
profiles.google_place_id        ChIJu2k6Cw6vwEcRsiVQzuvtKUU     Google-Business-Profil
sachverstaendige.standort_…     address.3571743007138268        Mapbox-Adresse  (Fronius)
                                EiJXZWcgMTAsIDI3NTgw…           Google-ADRESSE  (Brandt)
                                ChIJvcNuozfDsUcRJemxlOvYEcM     ChIJ-Format     (Dirk)
```

Nur bei Fronius sind beide gesetzt — und sie sind **nicht identisch**. Das eine ist das
Geschäftsprofil, das andere der Standort-Geocode. **Kopieren ist keine Option.**

⛔ **Und automatisch matchen erst recht nicht.** Ein falsch verknüpftes Profil zeigt
**fremde Sterne** auf unserer Stadtseite — mit dem Namen unseres Partners darunter. Die
Zuordnung muss ein Mensch bestätigen; sie ist eine Aussage über ein fremdes Unternehmen.

**GEO-Signale auf den eigenen Seiten** (Sitemap-Vollmessung, 383 URLs):

| Hebel (arXiv 2311.09735) | Stand |
|---|---|
| Expertenzitate **+41 %** | fehlen fast überall — **stärkster ungenutzter Hebel** |
| Statistiken +31 % | ✓ vorhanden |
| Quellenangaben +27 % | ✓ vorhanden (§§/BGH) |
| Autorenschaft (E-E-A-T) | fehlte auf 184/187 → mit #5688 auf 313 Seiten behoben |

⚠ Die `ai-seo`-Skill gibt die Studie **falsch** wieder (Quellen +40 % statt Zitate +41 %).
Am Original nachgerechnet, siehe `memory/REFERENCE-geo-studie-zahlen-und-shopify-llmstxt.md`.
Wichtig für die Erwartung: GEO wirkt **+115 % bei Rang 5, aber −30 % bei Rang 1** — für
uns, die gar nicht auftauchen, ist es der richtige Hebel; für einen Marktführer wäre es schädlich.

---

## Die Arbeitspakete

Sortiert nach *belegtem* Hebel, nicht nach Aufwand.

### P1 · Partner-Profile mit Claimondo verbinden ⭐ größter Hebel

Die Profile gewinnen bereits. Fehlt: der Weg von dort zu uns.

- **P1.1** `profiles.google_place_id` nachpflegen. Ohne sie liefert der Bewertungs-Cron
  nichts — die Stadtseite zeigt dann keine Sterne, obwohl der Partner welche hat.

  ⚠⚠ **KORREKTUR (28.08., zweite Messung).** Die erste Fassung nannte „6 Partner:
  Luis, Burak, Sahin, **Brandt**, Dirk, einer ohne Namen". Beim Aufbereiten der
  Arbeitsliste zeigte der Join über `sachverstaendige.profile_id` ein anderes Bild:

  | | |
  |---|---|
  | SV-Profile gesamt (ohne Smoke/Test-Mails) | 19 |
  | **mit** `google_place_id` | 7 — davon 1 internes Konto |
  | **ohne** | 12 — aber **9 davon sind keine offene Aufgabe** |

  Von den 12 ohne ID sind **6 `onboarding_status = pending`** (nie fertig onboardet,
  also gar keine aktiven Partner), einer ist `frist_ueberschritten`, und zwei sind
  Testkonten (`aarondat`, „Onboarding Audit-SV"). Ein „Brandt" kommt in den Daten
  **nicht vor** — der Name stammte aus der früheren Fehlmessung über
  `sachverstaendige.standort_place_id` (dort hatte Brandt eine Google-ADRESS-ID, keine
  Profil-ID; siehe die Tabelle oben).

  **Die echte Arbeitsliste sind drei Partner** — verifiziert, Onboarding abgeschlossen:

  | Partner | Standort |
  |---|---|
  | Sahin Daskiran | Mannesmannstr. 41, 47259 |
  | Burak Yesil | St.-Florian-Str. 5, 50181 Bedburg |
  | Luis Klug | Gründau, 63584 |

  Grenzfälle, erst nach Klärung: **Dirk Petersen** (21394, `verifizierung ausstehend`,
  zusätzlich als Dublette angelegt) und **Fabius Thewalt** (50827, `frist_ueberschritten`).

  **Weg:** je Partner das Profil einmal von Hand bestätigen (der Partner weiß, welches
  seins ist), dann die ID eintragen — im SV-Portal über `GoogleBusinessFeld` (verknüpft
  und holt die Bewertungen sofort) oder in `admin/sachverstaendige/[id]`. Drei Vorgänge,
  keine Automatik.

  ⛔ **Nicht** per Namens-/Adress-Match automatisch auflösen — ein falscher Treffer
  zeigt fremde Bewertungen unter dem Namen unseres Partners.
  ⛔ **Nicht** massenhaft über die Places-API — dieselbe API kostete am 24.08. an einem
  Tag **2.798 €** (`INCIDENT-google-places-2798-euro-an-einem-tag.md`).
- **P1.2** Im Google-Profil jedes Partners das Website-Feld auf **seine Claimondo-
  Stadtseite** zeigen lassen (statt Startseite/Fremddomain). Das ist der direkte Pfad
  von der Maps-Antwort in unseren Funnel. Erfordert Partner-Mitwirkung → Kommunikations-
  aufgabe, kein Code.
- **P1.3** Bewertungs-Nachfrage systematisieren. `claims.google_review_gesendet` und
  `google_review_prompt_gezeigt_am` existieren bereits — Ist-Quote messen, dann entscheiden.

### P2 · Expertenzitate — der stärkste GEO-Hebel (+41 %)

Auf den Fachseiten stehen Zahlen und Paragraphen, aber **kein Mensch sagt etwas**.

- **P2.1** Zitat-Komponente bauen (sichtbarer Text + `Person`-Schema, wie ReviewerByline).
- **P2.2** ⚠ **Inhalte müssen von echten Personen kommen.** Erfundene Zitate mit Namen
  sind keine Option — dieselbe Grenze wie bei „fachlich geprüft" (siehe #5688). Quellen:
  die Partner-Sachverständigen (7 mit belegter Reputation), die Partnerkanzlei.
- **P2.3** Ausrollen auf die Seiten, die KI-Crawler laut Log wirklich lesen.
  **→ gemessen am 29.08. (nginx, 14 Tage).** Die Frage ist damit beantwortet:

  | Seite | KI-Crawler-Zugriffe |
  |---|---|
  | `/gutachter-finden` | **458** |
  | `/werkstatt-finden` | 135 |
  | `/decoder/kfz-gutachter-kosten-tabelle` | 103 |
  | `/schadensreport-2026` | 93 |
  | `/haftpflicht/wertminderung` | 84 |
  | `/haftpflicht/4-wochen-frist` | 77 |
  | `/kfz-gutachter/koeln` | 58 |

  ⭐⭐ **Die Größenordnung war unbekannt und ändert die Gewichtung des ganzen Plans:**

  | Crawler | Zugriffe / 14 Tage |
  |---|---|
  | ChatGPT-User | **5.129** |
  | ClaudeBot | 4.313 |
  | OAI-SearchBot | 3.252 |
  | PerplexityBot | 2.340 |
  | GPTBot | 2.142 |
  | Google-Extended | 891 |
  | **Summe** | **≈ 18.400** |

  Zum Vergleich: **Googlebot** crawlt im selben Zeitraum **2.073** HTML-Seiten.
  **Die KI-Crawler sind rund 9× aktiver als Google.** Das ist die empirische
  Stütze für Aarons Priorisierung („B2C-Leads über KI-Assistenten") — sie war
  bisher plausibel, jetzt ist sie belegt.

  ✅ **Die von KI genutzte Schnittstelle antwortet sauber:**
  `/api/v1/gutachter-termine` — 57 Aufrufe von KI-Crawlern, **57× HTTP 200**.
  Dort geht kein Lead verloren.

  ⚠ **Nebenbefunde derselben Messung** (keiner davon dringend):
  * **Bytespider ignoriert die robots.txt** — `Disallow: /` steht korrekt drin,
    trotzdem 191 HTML-Zugriffe. Bekanntes ByteDance-Verhalten; wirksam wäre nur
    ein nginx-Block. Geringe Menge, bewusst nicht angefasst.
  * **3.942 × HTTP 429** auf `/api/v1/gutachter-termine` sehen nach einem
    Nutzerproblem aus, sind aber **self-inflicted**: 3.836 davon von
    `212.132.119.110` (dem Server selbst, UA „node"), Peak am 27.08. = ein
    Bau-Tag. Echte Nutzer sind nicht betroffen. ⚠ Offen bleibt, ob SSR-Läufe
    dadurch je Seiten *ohne* Termine rendern — nicht gemessen, nur möglich.
  * `/fetch` + `/proxy` (302 + 89 Zugriffe) sind **SSRF-Scans** auf den
    AWS-Metadaten-Endpoint (`169.254.169.254/…/iam/security-credentials`).
    Sie prallen mit 404 ab — Internet-Hintergrundrauschen, kein Handlungsbedarf.
  * `/og-default.png` (823 × 404) ist **Alt-Traffic**: der Fix #5723 wirkt, alle
    geprüften Seiten liefern heute ein existierendes `og:image` (HTTP 200).
  * `/robots.txt` (272 × 404) stammt **nicht** von claimondo.de — beide eigenen
    Domains liefern 200; die Logs bündeln alle vhosts der IP.

### P3 · Restliche Seiten GEO-fähig nachziehen — ✅ erledigt (#5698)

Nachgemessen an der ausgelieferten Sitemap statt am Dateisystem: **352 von 371
Inhaltsseiten** tragen die Byline. Von den 19 Resten waren nur **5 echte Lücken**
(`kfz-gutachter/ablauf`, `autoschaden-soforthilfe`, `gutachten-service`,
`sachverstaendiger-vs-gutachter`, `kfz-haftpflicht-schaden`) — nachgezogen.

Die übrigen 14 brauchen keine: Übersichtslisten (`/wissen`, `/decoder`, `/versicherer`,
`/sachverstaendige`, `/community`) sind Verzeichnisse, keine Artikel; dazu Startseiten
samt Subdomains, `/llms.txt` (keine HTML-Seite) und `/autor/aaron-sprafke` (die
Autorenseite selbst). Die frühere Auflistung („/decoder 12, /versicherer 13,
/sachverstaendige 9") zählte die DETAIL-Seiten dieser Rubriken — die haben ihre Byline
längst; nur die Rubrik-Startseite hat keine, und das ist richtig so.

Ein Prod-Wächter sichert das jetzt ab (`tests/e2e/flows/autorenschaft-byline-smoke.spec.ts`,
3/3 grün): er prüft die Byline in `page.content()` **und** in `innerText` — im HTML stehen
und für Menschen sichtbar sein sind zwei verschiedene Aussagen.

### P6 · Klassische Suchsichtbarkeit — gemessen 28./29.08.

Der Plan oben zielt auf **KI-Assistenten**. Parallel gemessen wurde der Google-Kanal;
er ist die zweite Hälfte derselben Frage und war bisher unbeziffert.

**Search Console, 50 Queries, 3 Monate:**

| | Queries | Impressionen | Klicks | CTR |
|---|---|---|---|---|
| B2B | 22 | 1.012 | 11 | 1,1 % |
| **B2C** | 28 | **884** | **2** | **0,2 %** |

⭐⭐ **Der Kanal hat noch NIE einen echten B2C-Lead erzeugt.** Alle 37 Anfragen in
`gutachter_finder_anfragen` vor dem 09.08. und alle 6 danach sind eigene Tests
(Aaron in `+kunde…`-Varianten, Nicolas, „Test/Tet Namen", SMOKE…). Die als
„Zufluss-Ausfall seit 09.08." dokumentierte Kurve misst die **Testaktivität**, nicht
den Zufluss — Details in `memory/BROADCAST-zeitreihe-aus-testdaten-sieht-aus-wie-ausfall.md`.
→ Das Problem sitzt **oben im Trichter** (Sichtbarkeit), nicht unten bei Formular oder
Conversion. Das Formular ist nachweislich intakt (Regel-4-Smoke 23.08.).

**Wo die Impressionen landen:**

| Seite | Impr. | Klicks | Position |
|---|---|---|---|
| `/decoder/kfz-gutachter-kosten-tabelle` | 709 | 8 | 5–9 — **97 % BVSK-Suchen = B2B** |
| `/` (Startseite) | 356 | 2 | 6,3 |
| `/kfz-gutachter/online-kfz-gutachten` | 267 | **0** | 11–18 |
| Stadtseiten (4 von 173+) | ~120 | **0** | 10–16 |

⭐ **Die stärkste Seite bedient den falschen Markt:** 687 der 709 Impressionen sind
BVSK-Begriffe (Sachverständige/Versicherer). Der eine B2C-Begriff darauf steht auf
Position 14,7.

#### ✅ Erledigt — auf prod, Regel 4 grün (28.08.)

| PR | Befund | Fix |
|---|---|---|
| #5710 | Zwei Seiten zielten auf „nutzungsausfall berechnen"; der Kopfbegriff **„nutzungsausfallentschädigung" (5.000/Mon.)** stand weder in Titel noch H1 | Zielbegriffe getrennt: Erklärseite → Kopfbegriff, Rechner → „berechnen". **Kein Canonical** — die zweite Seite ist ein funktionierender Rechner, kein Duplikat |
| #5716 | Startseite rankt auf Pos. 6 für „kfz sachverständiger köln" & Co. — **188 Impressionen, 0 Klicks**, weil das gesuchte Wort im Titel fehlte | Titel → „Kfz-Sachverständiger nach Unfall – digital, 0 €" |
| #5721 | `/kfz-gutachter/online-kfz-gutachten`: **267 Impr., 0 Klicks**. Kein fehlendes Wort, sondern **Intentions-Mismatch** — wer „gutachten online" sucht, will eines beauftragen und bekam „was rechtlich erlaubt ist" | Titel → „Kfz-Gutachten online beauftragen, Termin vor Ort". ⚖ Bewusst so formuliert: beschreibt den *Auftragsweg*, nicht das vom **LG Bremen (9 O 1720/24)** untersagte Produkt, und nennt die Vor-Ort-Pflicht im Titel |

#### 🔵 Gebaut, Deploy offen

**#5729** — `/haftpflicht/gegnerische-versicherung-ermitteln` (neu). Aus dem Abgleich
der Keyword-Nachfrage (123 Begriffe, 24.150 Suchen/Mon.) gegen den Bestand: „gegnerische
versicherung herausfinden" (500/Mon., Wettbewerb niedrig) hatte keine Seite, und der
**Zentralruf der Autoversicherer** kam im ganzen Marketing-Baum **nie** vor. Fakten an
der Primärquelle verifiziert (0800 250 260 0; Kennzeichen + Schadentag + Unfallland).
Gemergt nach `staging` am 29.08., auf prod noch **404** → Regel 4 offen bis zum Release.

#### 🔴 Offen — Kannibalisierung bei „Gutachtenkosten" (braucht eine Entscheidung)

Drei Seiten zum selben Thema, zwei davon inhaltliche Dubletten:

| Seite | Wörter | H2 | Suchbesucher/14 T. |
|---|---|---|---|
| `/kfz-gutachter/kosten` | 939 | 8 | **1** |
| `/kosten-kfz-gutachten` | 647 | 5 | **0** |
| `/decoder/…kosten-tabelle` (B2B) | — | — | **105** |

Beide B2C-Seiten behandeln dasselbe (was kostet es · BVSK-Honorartabelle · wer zahlt),
sind selbst-canonical, stammen aus **demselben Commit** und haben keinen erkennbaren
Sonderzweck. Zielvolumen: „kfz gutachten kosten" + „…tabelle" + „…kostenlos" =
**1.500 Suchen/Mon.**

⚠ **Nicht im Vorbeigehen zu lösen.** Ein geändertes Canonical bei erhaltenen
hreflang-Alternates erzeugt widersprüchliche Signale; ein Redirect (das etablierte
Projekt-Muster) vernichtet 647 Wörter, von denen der Abschnitt *„Das Honorar ist
überhöht — was die Versicherung kürzt"* auf der Zielseite fehlen könnte.
**Sauber wäre:** diesen Abschnitt in `/kfz-gutachter/kosten` übernehmen, dann
`/kosten-kfz-gutachten` per 301 auflösen. Risiko gering (0 Suchbesucher), aber es ist
eine Entscheidung über eine URL → **Aaron**.

#### Was das NICHT löst

Die Titel-Fixes heben die **CTR**, nicht die **Position**. 884 B2C-Impressionen im
Quartal bleiben wenig gegenüber 24.150 Suchen/Monat im Markt — wir sehen **1,2 %**.
Für mehr Impressionen braucht es Rankings, und dafür Autorität. Externe Verweise mit
Traffic sind kaum vorhanden (die größten sind eigene Cluster-Domains, dazu 29
KI-Verweise/14 T. von ChatGPT + Copilot). ⚠ Referrer-Klicks sind allerdings ein
**schwacher Ersatz** für eine Backlink-Analyse — Ahrefs ist gesperrt, deshalb bleibt
das eine begründete Hypothese, kein Befund.

### P4 · Messbarkeit

- **P4.1** Local Falcon ist als MCP installiert, aber **nicht authentifiziert** — es liefert
  Maps-Rank-Grids je Standort. Ohne Freigabe durch Aaron nicht nutzbar.
- **P4.2** Wöchentliche Messung: Wer wird bei „Kfz-Gutachter \<Stadt\>" genannt, und ist
  ein Partner darunter? Bisher einmalig manuell gemacht — der Befund oben stammt daraus.

### P5 · Der Deeplink-Pfad — ✅ erledigt (#5698), Deploy offen

`&schuldfrage=gegner|unklar` gebaut. Der Nutzen entsteht ohne Änderung am FlowLink:
`FlowWizardKfz` rechnet `qualiPending = istIncomplete && !lead.disqualifiziert &&
!initialSchuldfrage` — ein gesetzter Wert nimmt den Quali-Schritt aus dem Wizard.

⭐⭐ **Dabei aufgefallen: `&schadenart=` kam seit dem 25.08. nie im Embed an.** Die
Marketing-Seite reicht nur eine feste Allowlist an den iframe durch, und `schadenart`
fehlte darin — während `llms.txt` KI-Assistenten ausdrücklich anwies, ihn anzuhängen.
Auf prod gemessen: `adresse` JA (Gegenprobe), `schadenart` NEIN. Die drei bestehenden
Smokes waren grün, **weil keiner den Parameter je an eine URL hängte**. Beides gefixt;
der neue Test war gegen prod rot und wird nach dem Deploy grün.

Dazu Aliase für das Vokabular der eigenen Berater-API (`/pruefe-anspruch` nimmt
`unverschuldet`, der Deeplink `gegner`) — sonst verliert eine KI, die beides nacheinander
nutzt, den Wert an der Wertprüfung statt an der Allowlist.

**Offen:** Release nach `main` (prod deployt nur von dort), danach der Regel-4-Nachweis
mit echter Buchung.

---

## Was ich NICHT vorschlage

- **Kein eigenes Google-Profil je Stadt.** Ohne echte Ladenadresse ist das gegen Googles
  Richtlinien und riskiert die Löschung aller Einträge.
- **Keine erfundenen Expertenzitate.** Siehe P2.2.
- **Keine Massen-Auflösung über die Places-API.** Siehe P1.1.

## Reihenfolge

P1.1 (Datenlücke schließen, sonst blind) → ~~P3~~ ✅ → P2 (größter Hebel, braucht aber
Zulieferung) → P1.2/P1.3 (Partner-Kommunikation) → P4.

## Stand 28.08.2026

| Paket | Stand |
|---|---|
| P1.1 Place-IDs | offen — **3 Partner**, braucht Aarons Bestätigung je Profil |
| P1.2 Website-Feld im Google-Profil | offen — Partner-Kommunikation |
| P1.3 Bewertungs-Nachfrage | offen — erst Ist-Quote messen |
| P2 Expertenzitate | zurückgestellt (Aaron: Consent zu aufwendig) |
| P3 Autorenschaft | ✅ 352/371, Wächter grün |
| P4 Messbarkeit | offen — Local Falcon braucht OAuth-Freigabe |
| P5 Deeplink-Parameter | ✅ gebaut, Release nach `main` offen |
| **P6 Suchsichtbarkeit** | ✅ 3 Titel-/Intent-Fixes live + Regel 4 grün (#5710/#5716/#5721) · 🔵 #5729 gemergt, Deploy offen · 🔴 **Kosten-Kannibalisierung braucht Aarons Entscheidung** |

## Erfolgsmessung P6 (Search Console, ~4 Wochen nach Deploy)

| Was | heute |
|---|---|
| CTR Startseite auf „kfz sachverständiger*" | **0** von 188 Impressionen |
| Klicks `/kfz-gutachter/online-kfz-gutachten` | **0** von 267 |
| Position „digitales gutachten" | 10,8 (Seite 1?) |
| Impressionen „nutzungsausfallentschädigung" (5.000/Mon.) | 0 auf Pos. 5–20 |
| Impressionen „gegnerische versicherung herausfinden" | 0 (Seite noch nicht live) |

⚠ Die vier PRs betreffen **verschiedene** Seiten und überlagern sich in der Messung
nicht. Deshalb wurde die Nutzungsausfall-Seite bewusst **nicht** ein zweites Mal
angefasst (Vokabular-Ergänzungen wären möglich, würden aber den Titel-Effekt
unmessbar machen — „eine Änderung pro Messung").
