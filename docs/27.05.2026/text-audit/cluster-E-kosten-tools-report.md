# Text-Audit Cluster E — Kosten / Tools / Report / Ratgeber

Durchgeführt: 2026-05-27 · Prüfer: Claude-Sonnet-Audit-Agent
Scope: `/kosten-kfz-gutachten`, `/schadensreport-2026`, `/decoder` (Hub + ausgewählte Slugs), `/ersteinschaetzung`, `/unfallskizze`, `/ratgeber`

---

## /kosten-kfz-gutachten

`src/app/kosten-kfz-gutachten/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | Zeile 216, `SpokeCtaBand headline` | „Gutachten kostet **dich** 0 €." — Du-Form, während die Seite durchgängig „Sie" verwendet (FAQs Z. 58, 63, 73 etc.). Inkonsistenter Anredefall. | Ändern auf „Gutachten kostet **Sie** 0 €." — oder als Designentscheidung die `SpokeCtaBand`-Headlines seitenübergreifend auf einen Anredefall vereinheitlichen. |
| Important | BGH-Az. | Zeile 40 (OG-Description), Z. 63, Z. 114, Z. 163 | In `openGraph.description` und im Body-Text wird `BGH VI ZR 67/06` für die Erstattbarkeit der SV-Kosten als Schadensposition zitiert. Kanon nennt für SV-Honorar `BGH VI ZR 357/13` (§ 287 ZPO als Schätzgrundlage) und `BGH VI ZR 357/03` (Wertminderung). `VI ZR 67/06` ist ein anderes Urteil (Subjektbezogener Schaden). Es wird zwar auch korrekt eingesetzt (SV-Kosten als Schadensposition), aber **nicht im Kanon aufgeführt** — es fehlt eine Validierung ob das Az. tatsächlich VI ZR 67/06 lautet oder ob es sich um ein Verwechslungs-Risiko handelt. Ggf. auch `VI ZR 280/22` ergänzen (Sachverständigen-Risiko bei Versicherung). | Kanon um `BGH VI ZR 67/06` ergänzen oder Aktenzeichen juristisch verifizieren lassen. Parallel `VI ZR 280/22` auf dieser Seite ergänzen (passt inhaltlich zu Z. 196–199). |
| Minor | Stil | Zeile 216 | `SpokeCtaBand` im Fließtext auf einer ansonsten sachlich-informativen Kostenübersicht wirkt am Ende leicht abrupt mit dem Du-Form-Anruf zum Handeln. | Überschrift auf Seiten-ToV abstimmen (Details s. o.). |

**Keine Fakten/Zahlenfehler, keine Umlaut-Fehler.**

---

## /schadensreport-2026

`src/app/schadensreport-2026/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Critical | Fakten | Z. 218–219 (BVSK_HONORARSPANNEN-Tabelle) | Tabelle 3 zeigt bei „bis 2.000 €" Schaden ein Honorar von „~ 580 €" und bei „> 25.000 €" ein Honorar von „> 2.400 €". Die `/kosten-kfz-gutachten`-Seite listet für HB I (bis 750 €) „ca. 200–280 €" und HB V (über 15.000 €) „individuell, oft 1.000–2.500 €". Die Schadensreport-Tabelle beginnt erst bei „bis 2.000 €" und weist dort 580 € aus — das liegt am oberen Ende von HB II. Beide Tabellen beanspruchen dieselbe Quelle (BVSK-Honorartabelle 2025/2026), haben aber unterschiedliche Schadensgrenzen und Honorarkorridore. Für „bis 2.000 €" → 580 € ist nicht sichtbar inkonsistent, aber die Strukturierung unterscheidet sich deutlich. Schwerwiегender: die untere Schranke fehlt in Tabelle 3 (kein Wert für Schäden unter 750 €/1.000 €). | Cross-Page-Konsistenz herstellen: entweder beide Tabellen auf dasselbe Stufenraster bringen oder explizit anmerken, dass Tabelle 3 Mittelwerte zeigt, Tabelle auf `/kosten-kfz-gutachten` Korridore. |
| Important | ToV/Anrede | Z. 578, 591 (CTA-Sektion) | Im CTA-Abschnitt „Was du gegen Kürzungen tun kannst" und Link-Text „deine Rechte im Überblick" wechselt die Seite von durchgängigem „Sie" (Hero, Trust-Strip, Body-Text) plötzlich zu „du". Anrede-Wechsel auf derselben Seite. | Auf einheitliche Anrede bringen. Da der Report eine datengetriebene, tendenziell B2B-nahe Seite ist, sollte „Sie" verwendet werden: „Was Sie gegen Kürzungen tun können" und „Ihre Rechte im Überblick". |
| Important | Fakten | Z. 218–219 (BVSK_HONORARSPANNEN, Trust-Strip Z. 218) | Trust-Strip zeigt Spanne „550–2.600 €" für BVSK-Honorar. Tabelle 3 zeigt 580 € (~ bis 2.000 €) bis > 2.400 € (> 25.000 €). Der im Trust-Strip genannte Unterwert „550 €" findet sich nicht in der Tabelle (dort kleinster Wert 580 €) — leichte numerische Inkonsistenz. | Trust-Strip-Wert auf den Tabellen-Korridor abstimmen: entweder „~ 580–2.400 €+" oder einen einheitlichen Korridor nennen. |
| Minor | Fakten | Z. 88–89 (KUERZUNGEN_DATA, Position „Sachverständigenhonorar") | BGH-Az. `VI ZR 50/15` für Sachverständigenhonorar. Kanon gibt für diese Position `VI ZR 357/13` an (BVSK als Schätzgrundlage §287 ZPO). `VI ZR 50/15` ist ein anderes Urteil (Honorarkritik). Beide sind inhaltlich zutreffend, aber `VI ZR 357/13` ist das einschlägigere und gehört laut Kanon zwingend rein. | `VI ZR 357/13` in der Tabelle ergänzen oder statt `VI ZR 50/15` einsetzen. |

---

## /decoder (Hub)

`src/app/decoder/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | Z. 85, `SpokeCtaBand headline` | „Genau diesen Brief bekommen? Wir antworten **kostenfrei für dich**." — Du-Form, während der Hub-Text (Z. 54–61) durchgängig „Sie" verwendet. Inkonsistenter Anredefall. | Auf „… kostenfrei **für Sie**." anpassen, oder ToV-Entscheidung dokumentieren (Decoder-Cluster: informal du vs. formal Sie). |
| Minor | Stil | Dynamische Zählung Z. 65 | „Die {decoder.length} häufigsten Versicherer-Schreiben" — korrekt und zeitstabil, kein Problem. | — |

**Keine Faktenfehler, keine Umlaut-Fehler im Hub.**

---

## /decoder/[slug] — Ausgewählte Decoder-Artikel

### decoder/unser-sachverstaendiger

`src/content/claimondo/decoder/unser-sachverstaendiger.md`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | Fakten | Frontmatter `keyFacts` + Body Z. 69, 104 | „Versicherer-SV-Gutachten liegt typisch 15–40 % unter unabhängiger Bewertung" — diese Zahl wird mehrfach wiederholt. Sie ist nicht mit einer Primärquelle belegt (kein BGH-Az., keine Studie). In der Quellenliste am Ende des Artikels fehlt eine Quelle für diese Behauptung. | Entweder Quelle nachliefern (z. B. BVSK-Erhebung, Urteilsauswertung) oder die Formulierung mit „nach Einschätzung unserer Partner-Sachverständigen" kennzeichnen. |
| Minor | ToV | Z. 103 (Body, Emojis) | Emoji-Einsatz im Body (`💡`, `🛠`) ist nicht konform mit dem Brand-Design-Regelwerk (keine Emojis in UI/Frontend-Strings lt. AGENTS.md §emojis). Ratgeber/Decoder-MDX ist nutzersichtbar. | Emojis durch Text-Labels ersetzen: „**Wichtigste Regel**", „**Vier Schritte**". |

### decoder/wertminderung-nicht

`src/content/claimondo/decoder/wertminderung-nicht.md`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Minor | ToV | Body Z. 103–104 (Emojis) | Gleicher Emoji-Befund wie oben (`💡`, `🛠`). | Wie oben. |
| Minor | Fakten | Frontmatter `keyFacts`, Body Z. 78 | Bagatell-Schwelle „500–1.500 €" — laut Kanon gibt es keine explizite Kanon-Zahl für die Bagatell-Schwelle, diese Angabe ist intern konsistent. Korrekt im Sinne gängiger Rechtsprechung. | Kein Handlungsbedarf, nur zur Dokumentation. |

### decoder/nutzungsausfall-nicht

`src/content/claimondo/decoder/nutzungsausfall-nicht.md`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | Fakten/Cross-Page | Frontmatter `keyFacts` Z. 15: `F15` in brand-fakten-library | `brand-fakten-library.ts` F15 gibt Sanden/Danner-Liste 2025 mit „23 € (Klasse A)" als Untergrenze an. Der Decoder-Frontmatter nennt „27–175 €/Tag je nach Fahrzeugklasse" als gerichtsfestes Spektrum. 23 € vs. 27 € Untergrenze: die Fakten-Library und der Decoder-Text sind nicht aufeinander abgestimmt. | Einheitlichen Quell-Korridor festlegen: wenn F15 die kanonische Zahl ist, muss der Decoder-Text ebenfalls 23 € (oder den aktuellen Tabellenwert) nennen. |

---

## /ersteinschaetzung

`src/app/ersteinschaetzung/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Minor | Fakten | Z. 187–190 (AnswerCapsule) + Z. 267–276 | „ab ca. 750 € Schaden haben Sie nach §249 BGB Anspruch darauf [auf ein unabhängiges Gutachten]" — die 750-€-Grenze wird als Gutachten-Anspruch nach §249 BGB formuliert. §249 BGB nennt keine starre Grenze; die 750 € sind eine Praxis-Daumenregel aus BGH-Rechtsprechung. Die Formulierung ist als Annäherung vertretbar, aber der §249-Verweis ist in dieser Präzision nicht korrekt; besser wäre ein Verweis auf BGH-Rechtsprechung oder die etwas vorsichtigere Formulierung „nach ständiger BGH-Rechtsprechung". | Anpassen auf: „ab ca. 750 € Schadenshöhe ist ein unabhängiges Gutachten nach ständiger BGH-Rechtsprechung anerkannt (§ 287 ZPO als Schätzgrundlage)." |
| Minor | Stil | Seite allgemein | Seite ist korrekt in „Sie"-Anrede. Keine Umlaut-Fehler. | — |

---

## /unfallskizze

`src/app/unfallskizze/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | Z. 231, `SpokeCtaBand headline` | „Wir regulieren **deinen** Schaden — 0 €." — Du-Form, Seite ansonsten vollständig in „Sie"-Anrede (FAQs, Body-Texte). Inkonsistenter Anredefall. | Ändern auf „Wir regulieren **Ihren** Schaden — 0 €." |
| Minor | Stil/Rechtschreibung | Z. 74 | „Nur Beobachtetes festhalten — am Unfallort kein Schuld­eingeständnis abgeben." — Soft-Hyphen (`­`) im Wort „Schuld­eingeständnis" ist technisch korrekt, aber im MDX/TSX-Quelltext ungewöhnlich. Kein Fehler. | — |

**Keine Fakten- oder Umlaut-Fehler.**

---

## /ratgeber

`src/content/claimondo/cornerstones/ratgeber.md`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | Gesamter Artikel | Der Ratgeber ist durchgängig in **Du-Form** verfasst: „Du bist Geschädigte:r", „Was du als nächstes tust" etc. Das ist explizit als Persona-orientierter Ratgeber konzipiert (warm, empathisch), aber die anderen Cluster-E-Seiten und Kanon-Texte nutzen „Sie". Wenn die Du-Form für diesen Artikel Designentscheidung ist, muss das dokumentiert werden, damit andere Autoren die Ausnahme kennen. | ToV-Ausnahme für `/ratgeber` explizit in AGENTS.md oder einer Content-Guideline dokumentieren. Der Artikel selbst ist sprachlich stimmig und die Du-Form passt zur Persona-Situation — inhaltlich vertretbar, aber dokumentationspflichtig. |
| Important | Fakten | Frontmatter `keyFacts` + Z. 163 | Hinterbliebenengeld: „5.000–15.000 € pro nahem Angehörigen (seit 2017)" — entspricht dem Kanon-Wert. `brand-fakten-library.ts` F44 nennt hingegen „10.000 € bis 15.000 €" (höherer Unterwert). Leichte Inkonsistenz beim Unterwert: 5.000 € (Ratgeber) vs. 10.000 € (F44). | Einheitliche Spanne in der Brand-Fakten-Library und im Ratgeber festlegen. Wenn der BGH-Standard 5.000–15.000 € ist (§ 844 Abs. 3 BGB), sollte F44 korrigiert werden. Wenn aktuelle Rechtsprechung 10.000–15.000 € ergibt, Ratgeber-Text anpassen. |
| Important | Fakten | Frontmatter `keyFacts` Z. 12 | Anwaltskosten-Az.: `BGH VI ZR 235/13`. Das Kanon-Dokument nennt keine explizite Az. für Anwaltskosten, aber die brand-fakten-library.ts F21 und F2 zitieren `VI ZR 235/13` übereinstimmend. Intern konsistent. | Kein Handlungsbedarf — nur Dokumentation. |
| Minor | Schmerzensgeld-Spanne | Z. 118, 385 | HWS Grad I: „250–1.500 €", Grad II: „800–3.500 €", Grad III: „3.000–10.000 €". `brand-fakten-library.ts` F43 nennt „500 € und 5.000 €" als allgemeine HWS-Spanne ohne Gradunterteilung. Die gradierte Tabelle im Ratgeber ist detaillierter und laut „Hacks/Wellner-Tabelle" vertretbar — F43 ist eine vereinfachte Zusammenfassung. Kein Fehler, aber Unschärfe. | F43 entweder präzisieren oder als bewusste Vereinfachung kommentieren. |
| Minor | Stil/Umlaute | Z. 24, 29, 50 (etc.) | Alle Umlaute korrekt: „Geschädigte", „Ansprüche", „zulässig", „ärztlich" etc. | — |
| Minor | Vollständigkeit | Z. 562 | „Letzte fachliche Überprüfung: **pending**" — Artikel ist als live markiert (`publish_status: live`), aber rechtliche Prüfung steht noch aus. | Prüfung anstoßen oder Hinweis-Disclaimer prominenter im Published-Content platzieren. Gilt auch für alle Decoder-Artikel (gleiches `pending`-Muster). |

---

## /decoder (Cross-Artikel, allgemeiner Befund)

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV/Anrede | Alle 10 Decoder-Artikel | Alle Decoder-Artikel verwenden **Du-Form** im Body (z. B. „was du jetzt machst", „deine Antwort"). Das ist konsistent innerhalb der Decoder-Artikel-Gruppe, aber inkonsistent zur `/kosten-kfz-gutachten`-Seite (Sie-Form) und `/schadensreport-2026` (überwiegend Sie). | ToV-Regelung für Cluster seitenübergreifend entscheiden und dokumentieren: Cornerstone/Ratgeber/Decoder = informal du; Konversions-Hubs/Report = formal Sie. Dann konsequent durchziehen. |
| Important | Vollständigkeit | Alle Decoder `.md` Frontmatter | `last_legal_review: pending` in allen Decoder-Artikeln — sie sind alle `publish_status: live`. | Rechtliche Prüfung priorisieren oder mit Datum-Hinweis auf der Seite kommunizieren. |

---

## Extrahierte Fakten/Zahlen/Claims

| Seite | Wert/Claim | Quelle im Code |
|---|---|---|
| `/kosten-kfz-gutachten` | SV-Honorar typisch 300–1.200 € | BVSK-Stufen HB I–IV |
| `/kosten-kfz-gutachten` | HB I: bis 750 € Schaden → ca. 200–280 € | `BVSK_STUFEN` |
| `/kosten-kfz-gutachten` | HB V: über 15.000 € → individuell, oft 1.000–2.500 € | `BVSK_STUFEN` |
| `/kosten-kfz-gutachten` | 0 € für Geschädigte (§ 249 BGB, BGH VI ZR 67/06) | FAQ + Hero |
| `/schadensreport-2026` | 30–40 % Kürzungs-Quote (NDR 2022, Verbraucherzentrale, BGH VI ZR 38/22 ff.) | Trust-Strip + Body |
| `/schadensreport-2026` | BVSK-Honorar „~ 580 €" bei bis 2.000 € Schaden | `BVSK_HONORARSPANNEN` |
| `/schadensreport-2026` | BVSK-Honorar „> 2.400 €" bei > 25.000 € Schaden | `BVSK_HONORARSPANNEN` |
| `/schadensreport-2026` | Trust-Strip: BVSK-Spanne 550–2.600 € | Z. 218 |
| `/schadensreport-2026` | Marktführer unfallpaten.de: −30 % Traffic seit Jan 2025, 1.668 Visits/Mo | Markt-Block |
| `/decoder/unser-sachverstaendiger` | Versicherer-SV-Gutachten 15–40 % unter unabhängiger Bewertung | Frontmatter + Body |
| `/decoder/nutzungsausfall-nicht` | Nutzungsausfall 27–175 €/Tag (Sanden-Danner) | Frontmatter/Body |
| `/brand-fakten-library.ts` | Sanden/Danner-Liste 2025: 23 € (Klasse A) bis 175 € (Klasse F) | F15 |
| `/brand-fakten-library.ts` | Über 8 Millionen Euro Schadensersatz (Stand 14.05.2026) | F54 |
| `/brand-fakten-library.ts` | Hinterbliebenengeld 10.000–15.000 € (F44) vs. Ratgeber-Text 5.000–15.000 € | F44 vs. ratgeber.md Z. 163 |
| `/ersteinschaetzung` | Ab ca. 750 € Gutachten-Anspruch (§ 249 BGB — Formulierung ungenau) | AnswerCapsule + Info-Box |
| `/ratgeber` | Hinterbliebenengeld 5.000–15.000 € (§ 844 Abs. 3 BGB, seit 2017) | Z. 163 |
| `/ratgeber` | HWS Grad I 250–1.500 €, Grad II 800–3.500 €, Grad III 3.000–10.000 € | Z. 118, 385 |
