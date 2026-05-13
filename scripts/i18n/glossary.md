# i18n-Übersetzungs-Glossar (für Anthropic Claude Pipeline)

**Wird in jedem Translation-Call als System-Context mitgeschickt.** Sorgt für Konsistenz über alle Sprachen + Pages.

## Ton (alle Sprachen)

- **Vertrauensvoll** wie bei einem Anwalt der dir auf Augenhöhe erklärt — nicht herablassend, nicht marketing-overdone
- **Technisch-präzise** — Fachbegriffe nicht verwässern
- **Direkt** — keine deutschen Worthülsen wie „synergetisch", „optimieren". Klar sagen was Sache ist
- **Du-Form vermeiden in EN** — höfliches „you" reicht. In TR/RU/PL/AR formal/höflich (Sie-Equivalent)

## Fachbegriffe — IMMER deutsch beibehalten (in allen Sprachen)

Diese Begriffe sind juristisch/branchen-spezifisch und werden in deutschen Originalen referenziert. Übersetzung würde Bedeutung verfälschen.

- **§249 BGB** — niemals übersetzen, niemals umformulieren. Bleibt wörtlich.
- **BGH** + Aktenzeichen wie „VI ZR 65/18" — bleibt
- **BVSK-Honorartabelle** — bleibt (Eigenname)
- **Sicherungsabtretung** + **§164 BGB** — bleibt
- **DAT-Expert / DAT-Sachverständige** — bleibt
- **HSN/TSN** — bleibt
- **FIN / VIN** — beide ok, je nach Sprachkontext (FIN deutsch, VIN englisch)
- **HUK / AXA / LVM / Allianz / ERGO** — Versicherer-Eigennamen, bleiben
- **ControlExpert / K-Expert / DEKRA** — Eigennamen, bleiben
- **§-Verweise allgemein** — IMMER mit deutschem § beibehalten, auch in nicht-deutschen Sprachen
- **GmbH / Hansaring 10 / Köln / 50670** — Adresse + Rechtsform bleibt deutsch

## Begriffs-Konsistenz pro Sprache

| Deutsch | Englisch | Türkisch | Polnisch | Russisch | Arabisch |
|---|---|---|---|---|---|
| Schaden(sregulierung) | claim (settlement) | hasar (tazminatı) | szkoda (likwidacja) | возмещение ущерба | تسوية الأضرار |
| Gutachter / Sachverständiger | expert / appraiser | bilirkişi | rzeczoznawca | эксперт-оценщик | خبير |
| Gutachten | expert report | bilirkişi raporu | ekspertyza | заключение | تقرير الخبير |
| Versicherung (gegnerische) | (counterparty) insurance | sigorta | ubezpieczenie | страховая | شركة التأمين |
| Wertminderung | diminished value | değer kaybı | utrata wartości | потеря стоимости | فقدان القيمة |
| Nutzungsausfall | loss of use | kullanım kaybı | utrata możliwości użytkowania | потеря пользования | فقدان الاستخدام |
| Mietwagen | rental car | kiralık araç | wynajem auta | арендованное авто | سيارة بديلة |
| Anwalt / Fachanwalt | lawyer / specialist lawyer | avukat / uzman avukat | adwokat / specjalista | юрист | محامي |
| Gegnerische Versicherung | opposing insurance | karşı tarafın sigortası | ubezpieczenie sprawcy | страховая виновника | تأمين الطرف الآخر |
| Verursacher | at-fault party | hatalı taraf | sprawca | виновник | الطرف المتسبب |
| Geschädigter | injured party | mağdur | poszkodowany | потерпевший | المتضرر |

## UI-Übersetzungs-Regeln

- **Kürzer ist besser** — Buttons + Pills gleich lang halten wenn möglich (Layout-Brüche vermeiden)
- **Numerische Formate** — Zahlen + Währungen behalten DE-Format wenn explizit als Wert ausgedrückt („2.000+"), aber Tausender-Trennzeichen sprachgerecht (EN: 2,000+ / DE: 2.000+)
- **Datum** — wenn als String („10.05.2026") behalten wir das DE-Format weil rechtlicher Bezug. Wenn dynamisch gerendert: per `useFormatter()` mit Locale.
- **Email/Telefon** — bleibt wie ist (Aaron@claimondo.de, +49…)

## GEO (Generative Engine Optimization) — Übersetzungs-Regeln

Marketing-Pages sollen in allen Sprachen von KI-Suchmaschinen (ChatGPT, Perplexity, Gemini, Copilot, Claude) zitiert werden können. Diese Regeln entstammen den Princeton-GEO-Studien — beim Übersetzen NICHT verwässern:

- **Zitate & Quellen erhalten** (+40 % AI-Citation-Boost): Jeder §-Verweis, jedes BGH-Aktenzeichen, jede Statistik-Quelle muss 1:1 stehen bleiben. Niemals umformulieren wie „nach deutschem Recht" — immer „§249 BGB" konkret.
- **Statistiken & Zahlen erhalten** (+37 %): „über 2.000 Fälle", „98 % Erfolgsquote", Datumsangaben — exakte Zahlen behalten, Tausender-Trennzeichen sprachgerecht (DE 2.000 / EN 2,000 / FR 2 000).
- **Autoritativer Ton** (+25 %): keine relativierenden Füllwörter („vielleicht", „könnte"). Direkter Aussage-Stil. Auf Englisch: "We enforce", nicht "We help you to maybe enforce".
- **Fachbegriffe behalten** (+18 %): Liste oben — niemals weichspülen. Lieber Klammer-Erklärung als „normalisierter" Ersatzbegriff.
- **Entity-Konsistenz:** „Claimondo GmbH", „Hansaring 10, 50670 Köln" — Eigenname + Adresse bleiben in allen Sprachen identisch, auch in Arabisch (ggf. transliterieren in Klammern, aber Original beibehalten). Die Marke wird so von LLMs als kanonische Entity erkannt.
- **Keine Keyword-Stuffing** (-10 % bei Verstoß): Niemals „Gutachter Gutachten Sachverständiger" aneinanderreihen wenn das Original es nicht tut. Natürlicher Satzfluss schlägt Keyword-Dichte.
- **Antwort-zuerst-Struktur:** Hero-Headlines + FAQ-Antworten beginnen mit der Aussage, nicht mit einer Einleitung. „Wir setzen Ihre Ansprüche durch — auch gegen widerstrebende Versicherer." nicht „Es gibt viele Gründe warum…"

## Wenn unklar

Bei Zweifel den Original-deutschen-Begriff in der Übersetzung als (Klammer-Hinweis) ergänzen. Beispiel:

> EN: „We enforce all claims under §249 BGB (German Civil Code on damage compensation)"

Sicherheit > Eleganz.
