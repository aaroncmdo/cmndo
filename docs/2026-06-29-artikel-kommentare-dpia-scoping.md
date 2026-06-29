# DPIA-Scoping — Öffentliche Artikel-Kommentare (claimondo.de)

**Stand:** 2026-06-29 · **Status:** Scoping-Entwurf (Pre-Processing, Art. 35(1) DSGVO) · **Feature:** Plan 5 Launch-Gate

> **Wichtiger Hinweis:** Strukturierte Art-35-DSGVO-Orientierung nach EDPB WP 248 rev.01 + DSK (Deutschland). **Keine Rechtsberatung.** Finale Bewertung durch DSB (Art. 35(2)) + qualifizierten Anwalt. Diese DPIA ist **vor Inbetriebnahme** zu finalisieren (Art. 35(1) ist eine Vorab-Pflicht — Schema steht, es werden noch KEINE echten Nutzerdaten erhoben).

## 1 — Beschreibung der Verarbeitung

- **Zweck:** Nutzer-Kommentare unter den Wissens-Artikeln (Kfz-Schadenregulierung) — Engagement, Q&A, frischer Content.
- **Verantwortlicher:** Claimondo GmbH (DE). **Auftragsverarbeiter:** Supabase (EU-Region, AVV vorhanden).
- **Betroffene:** unbestimmte Öffentlichkeit; **darunter potenziell vulnerable Unfallgeschädigte und ggf. Minderjährige.**
- **Datenarten:** E-Mail (Magic-Link-Auth), öffentlicher Nutzername, Freitext-Kommentar, Status, IP-Hash (geplant, pseudonym), Zeitstempel, Consent-Zeitpunkt.
- **Ablauf:** E-Mail-Magic-Link → Nutzername setzen (+ Consent) → Kommentar posten (`pending`) → **Pre-Moderation durch Admin** → öffentlich nur `approved`.
- **Rechtsgrundlage:** Art. 6(1)(a) Einwilligung (Consent-Checkbox) + ggf. berechtigtes Interesse (Art. 6(1)(f), Community-Betrieb).

## 2 — Threshold-Bewertung (Art. 35)

**Art. 35(3) Pflicht-Trigger:** (a) kein systematisches automatisiertes Profiling mit Rechtswirkung — nein. (b) Large-scale Art-9/Art-10 — **nicht intendiert**, aber Freitext auf einer Unfall-Domain provoziert *inzidentelle* Gesundheitsdaten (Verletzungen) → kein klarer 35(3)(b)-Trigger, aber Risiko (s. R1). (c) Systematische Überwachung öffentlicher Bereiche — nein. → **Kein zwingender 35(3)-Trigger.**

**EDPB 9 Kriterien (WP 248):**

| # | Kriterium | Trifft zu? |
|---|---|---|
| 4 | Sensible / **hochpersönliche** Daten | **JA** — Freitext zu Unfall/Verletzung/Finanz-/Rechtsstreit; potenzielle Art-9-Inferenz (Gesundheit) |
| 7 | **Vulnerable** Betroffene | **JA** — Unfallgeschädigte (ggf. traumatisiert), evtl. Minderjährige; Einwilligung als Basis fragil |
| 3 | Systematische Beobachtung | schwach (IP-Hash + Inhalt+Identität) — eher nein |
| 5 | Large scale | bei Launch nein; bei Wachstum neu prüfen |
| 1,2,6,8,9 | Scoring/ADM/Matching/Innovativ/Rechtsausschluss | nein |

**→ 2 Kriterien klar erfüllt (#4 + #7) = starke Vermutung nach WP 248 S. 11: DPIA erforderlich.**

**DSK-Blacklist (DE, Art. 35(4)):** Kein 12-Eintrag matcht das Kommentar-Feature direkt (Entry #1 §203-Berufsgeheimnis betrifft Claimondos *Mandantendaten*, nicht öffentliche User-Kommentare). Blacklist ist **additiv, nicht abschließend** — die 2-Kriterien-Vermutung bleibt.

**VERDIKT: DPIA erforderlich (mind. dringend empfohlen).** Begründung: hochpersönliche Freitext-UGC + vulnerable Betroffene + **irreversible öffentliche Publikation + Suchmaschinen-Indexierung**. „Im Zweifel durchführen" (Kosten gering vs. Art. 83(4) bis 10 Mio €/2 %).

## 3 — Notwendigkeit & Verhältnismäßigkeit

Datenminimierung gegeben (nur Username + E-Mail + Kommentar). E-Mail-Verifikation = Zurechenbarkeit. **Pre-Moderation** ist die zentrale verhältnismäßige Maßnahme (kein Auto-Publish). Einwilligung als Basis bei Vulnerablen fragil → zusätzlich berechtigtes Interesse + starke Safeguards dokumentieren.

## 4 — Risiko-Register (Sicht der Betroffenen, L×S 1–5)

| ID | Risiko | Rechte-Kategorie | L | S | Score | Level |
|---|---|---|---|---|---|---|
| R1 | Nutzer offenbart **Gesundheits-/Finanz-/Rechtsdaten** über sich im öffentlichen Kommentar → indexiert/permanent | Art. 9 / hochpersönlich | 3 | 5 | 15 | **Hoch** |
| R2 | **Dritt-PII / Üble Nachrede** (Werkstatt/Gutachter/Versicherer/Person namentlich) | Persönlichkeitsrecht Dritter | 3 | 4 | 12 | **Hoch** |
| R3 | **Minderjährige** posten (öffentlich, keine Altersprüfung) | Kinder, Art. 8 | 2 | 4 | 8 | Mittel |
| R4 | **Vulnerable** Unfallgeschädigte — fragile Einwilligung, emotionale Exposition | Vulnerable | 3 | 3 | 9 | Mittel |
| R5 | **Kein/erschwertes Löschrecht** — Kommentar bleibt, ist indexiert | Art. 17 | 2 | 3 | 6 | Mittel |
| R6 | **Datenpanne** (E-Mail/IP-Hash/Inhalt) bei AV/DB | Vertraulichkeit | 2 | 4 | 8 | Mittel |
| R7 | **Impersonation** (Username als „Claimondo Team"/Anwalt) | Identität/Täuschung | 1 | 3 | 3 | Niedrig |

## 5 — Maßnahmen (✅ = gebaut, ⬜ = offen)

- ✅ **Pre-Moderation** (kein Auto-Publish) → R1/R2/R3 — *die* Kernmaßnahme; Mod prüft VOR Veröffentlichung.
- ✅ **Eindeutiger, verifizierter Username** + gesperrte Reservierungen (`claimondo`/`admin`/`anwalt`…) → R7.
- ✅ **RLS** (Insert erzwingt `pending`, kein Self-Approve), **Block-User**, **Hide/Takedown** → R1/R2.
- ✅ **Löschrecht** (Autor löscht eigene via RLS; Admin löscht) → R5. ✅ **IP-Hash** statt Roh-IP (Pseudonymisierung, EDPB 01/2025) → R6.
- ✅ **Datenminimierung** + **Consent-Checkbox** beim Username-Setzen.
- ⬜ **DSE-Update** (neuer Zweck UGC, Datenarten, Rechtsgrundlage, Speicherdauer, Empfänger=Supabase-AVV, Löschrecht) — **Pflicht, Aaron/Anwalt.**
- ⬜ **Netiquette/Posting-Regeln** (keine Gesundheits-/Rechts-/Dritt-Daten, kein Rechtsrat, Meldefunktion) + Link aus dem Formular.
- ⬜ **Moderations-Leitfaden**: pending-Kommentare mit Gesundheits-/Dritt-Daten **ablehnen** (operationalisiert R1/R2).
- ⬜ **Speicherdauer/Retention** (z.B. `rejected` nach 30 Tagen löschen).
- ⬜ **Meldefunktion** am Kommentar (Notice-and-Takedown, DSA/TMG).
- ⬜ Prüfen: `noindex` auf Kommentar-Sektion vs. SEO-Wunsch (Indexierung erhöht R1/R2-Severity).

## 6 — Restrisiko & Art. 36

Mit Pre-Moderation + Lösch-/Melde-Pfad + Netiquette + DSE + Moderations-Leitfaden sinkt R1/R2 von **Hoch → Mittel** (Moderation reduziert Likelihood; Severity bleibt durch Publikations-Irreversibilität). **Restrisiko: Mittel → „akzeptabel mit Auflagen".** **Art. 36 Vorab-Konsultation: voraussichtlich NICHT erforderlich**, sofern die Moderation robust operationalisiert ist — finale Entscheidung DSB/Anwalt.

## 7 — Empfehlungen / nächste Schritte

1. **DSB einbinden** (Art. 35(2)) + diese DPIA finalisieren **vor** Launch.
2. **DSE-Update** (Aaron/Anwalt) — Blocker für Inbetriebnahme.
3. **Netiquette-Seite** + **Moderations-Leitfaden** (Gesundheits-/Dritt-Daten ablehnen) — operationalisiert R1/R2.
4. **Retention** + **Meldefunktion** ergänzen.
5. **Re-Assessment bei Wachstum** (Kriterium #5 large-scale) und falls **AI-Artikel** (Option 2) kommt (Kriterium #8 innovativ + EDPB Opinion 28/2024 → eigene DPIA-Phase).
6. Klären: Indexierung der Kommentare (SEO vs. R1/R2).
