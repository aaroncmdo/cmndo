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
