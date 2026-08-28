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

**Partner-Google-Präsenz** (`sachverstaendige` + `google_bewertungen_cache`, 28.08.):

| | Zahl |
|---|---|
| aktive Sachverständige | 16 |
| davon mit Bewertungen im Cache | 7 |
| davon mit `standort_place_id` | **3** |
| stärkstes Profil | A. Kloss GmbH — 5,0★ / **359** Bewertungen |

⚠ 13 von 16 tragen keine `standort_place_id`. Der Bewertungs-Cache füllt sich über
`profile_id`, nicht über dieses Feld — die Verknüpfung Partner ↔ Google-Profil ist also
nur teilweise gepflegt. Ohne sie lässt sich weder messen noch steuern, wo ein Partner steht.

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

- **P1.1** `standort_place_id` für die 13 Partner ohne Eintrag nachpflegen.
  Ohne sie ist keine Messung möglich. ⚠ **Nicht** über die Places-API massenhaft
  auflösen — dieselbe API kostete am 24.08. an einem Tag **2.798 €**
  (`INCIDENT-google-places-2798-euro-an-einem-tag.md`). Manuell oder in kleiner,
  gedeckelter Charge.
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

### P3 · Restliche Seiten GEO-fähig nachziehen

Aus #5688 offen: `/decoder` (12 — kein `SpokeCtaBand`-Anker), `/versicherer` (13),
`/sachverstaendige` (9), ~15 Einzelseiten (`/`, `/vorteile`, `/wie-es-funktioniert`, …).

### P4 · Messbarkeit

- **P4.1** Local Falcon ist als MCP installiert, aber **nicht authentifiziert** — es liefert
  Maps-Rank-Grids je Standort. Ohne Freigabe durch Aaron nicht nutzbar.
- **P4.2** Wöchentliche Messung: Wer wird bei „Kfz-Gutachter \<Stadt\>" genannt, und ist
  ein Partner darunter? Bisher einmalig manuell gemacht — der Befund oben stammt daraus.

### P5 · Der Deeplink-Pfad (läuft, teils live)

`schadenart=`/`adresse=` sind gebaut; **Schuldfrage** als nächster Parameter offen
(spart einen Wizard-Schritt und verbessert die Datenqualität).

---

## Was ich NICHT vorschlage

- **Kein eigenes Google-Profil je Stadt.** Ohne echte Ladenadresse ist das gegen Googles
  Richtlinien und riskiert die Löschung aller Einträge.
- **Keine erfundenen Expertenzitate.** Siehe P2.2.
- **Keine Massen-Auflösung über die Places-API.** Siehe P1.1.

## Reihenfolge

P1.1 (Datenlücke schließen, sonst blind) → P3 (fertig machen, was begonnen ist) →
P2 (größter Hebel, braucht aber Zulieferung) → P1.2/P1.3 (Partner-Kommunikation) → P4.
