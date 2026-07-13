# DPIA — NFC-Schadenkarte: Gegner-Flow (Layer 2)
## Datenschutz-Folgenabschätzung gemäß Art. 35 DSGVO

**Status:** ENTWURF — Zur Prüfung durch den Datenschutzbeauftragten (DSB)
**Erstellungsdatum:** 2026-07-11
**Referenz-Spec:** `docs/superpowers/specs/2026-07-11-firmen-flotte-nfc-schadenkarte-design.md`
**Verantwortlicher:** Claimondo GmbH, Deutschland
**Erstellt durch:** DPIA-Sentinel (KI-gestützte Voranalyse)
**DSB-Prüfung aussteht:** Ja — dieses Dokument ersetzt keine rechtsberatliche oder datenschutzrechtliche Prüfung
**Launch-Gate:** Plan 3 + Plan 4 (Gegner-Flow + Claim-Erstellung) dürfen erst nach abgeschlossener DPIA gestartet werden

---

> **HAFTUNGSAUSSCHLUSS:** Dieses Dokument ist eine strukturierte Voranalyse gemäß DSGVO Art. 35,
> erstellt mit KI-Unterstützung auf Basis von EDPB-Leitlinien WP 248 rev.01, DSK-Blacklist und dem
> projektinternen Risikokatalog. Es stellt **keine Rechtsberatung** dar. Vor dem Launch muss ein
> qualifizierter Datenschutzbeauftragter (DSB) und/oder datenschutzrechtlicher Rechtsbeistand das
> Dokument prüfen, ergänzen und freigeben (Art. 35(2) DSGVO).

---

## Inhaltsverzeichnis

1. Threshold-Verdict (Schwellenwertprüfung)
2. Beschreibung der Verarbeitungstätigkeit
3. Notwendigkeit und Verhältnismäßigkeit
4. Risikoregister
5. Maßnahmen (Mitigationen)
6. Residualrisiko-Übersicht
7. Art. 36-Prüfung (Vorabkonsultation)
8. Monitoring und Überprüfung

---

## 1. Threshold-Verdict: Ist eine DPIA erforderlich?

### 1.1 Art. 35(3) DSGVO — Obligatorische Trigger (Pflichtprüfung)

Art. 35(3) DSGVO nennt drei Fallgruppen, bei deren Vorliegen eine DPIA zwingend durchzuführen ist.

| Trigger | Tatbestand | Bewertung |
|---------|-----------|-----------|
| **(a) Umfangreiche systematische Bewertung** auf Basis automatisierter Verarbeitung mit erheblichen Auswirkungen | Keine scoring-basierte Profilierung mit Rechtswirkung im Gegner-Flow; Claim-Erstellung ist kein Scoring-Mechanismus. | **Nicht einschlägig** |
| **(b) Umfangreiche Verarbeitung besonderer Datenkategorien** (Art. 9 DSGVO) | Fotos werden ausdrücklich auf Sachschaden gescoped (kein Personenschaden, keine Gesundheitsdaten im MVP). Standortdaten (geo_lat/geo_lng) sind keine Art.-9-Daten. Keine biometrischen Daten zur eindeutigen Identifizierung. | **Nicht einschlägig (MVP-Scoping hält)** |
| **(c) Systematische Beobachtung öffentlicher Bereiche im großen Maßstab** | Kein Überwachungssystem; keine kontinuierliche Beobachtung; Einzelereignis am Unfallort. | **Nicht einschlägig** |

**Ergebnis Art. 35(3):** Kein obligatorischer Trigger ausgelöst. Die DPIA ist dennoch erforderlich — Begründung folgt.

### 1.2 EDPB Neun-Kriterien-Analyse (WP 248 rev.01)

| # | Kriterium | Bewertung für den Gegner-Flow | Einschlägig? |
|---|-----------|-------------------------------|:---:|
| 1 | **Bewertung oder Scoring** | Kein Scoring des Gegners. Claim-Erstellung ist eine administrative Aktion, kein Risikobewertungsvorgang. | Nein |
| 2 | **Automatisierte Entscheidung mit erheblichen Auswirkungen** | Automatische Claim-Erstellung und Unfallmeldung an die Haftpflichtversicherung des Gegners. Der Gegner hat (über seine Versicherung) erhebliche finanzielle Auswirkungen zu erwarten. Allerdings: kein vollautomatischer Entscheid ohne Versicherungsprüfung; Versicherung reguliert eigenständig. Kriterium ist grenzwertig erfüllt. | **Teilweise** |
| 3 | **Systematische Überwachung** | Keine kontinuierliche Überwachung. Einmaliger, ereignisgetriebener Dateneingang beim Unfall. | Nein |
| 4 | **Sensible Daten oder Daten mit hochpersönlichem Charakter** | Versicherungsdaten (Policennummer, Versicherer), Unfallhergang mit rechtlichen Implikationen, Standortdaten (Unfallort), ggf. Kfz-Daten des Gegners. Diese Daten sind zwar nicht Art.-9-Daten, haben aber hochpersönlichen Charakter — sie beschreiben eine rechtlich und finanziell bedeutsame Situation des Betroffenen. Geographische Positionsdaten (geo_lat/geo_lng). | **Ja** |
| 5 | **Daten im großen Maßstab** | Im MVP: Claimondo startet B2B mit einem überschaubaren Flottenkundenstamm. Langfristig bei bundesweitem Roll-out potenziell Tausende Unfälle/Jahr. Zum MVP-Zeitpunkt: noch nicht "großer Maßstab", aber Skalierungspfad vorhanden. Faktor: Die Einzelperson (der Gegner) ist bei jedem Unfall eine neue betroffene Person, die nie zuvor Kontakt mit Claimondo hatte. | **Grenzwertig** |
| 6 | **Abgleich oder Kombination von Datensätzen** | Verbindung von: Karten-Token → Fahrzeug → Firma (bestehende Daten) + Gegner-Eingabe (Stammdaten, Versicherung) + Fotos + Geo + IP-Hash + SMS-Verifikation + Unfallbericht. Mehrere Quellen zu einem Profil kombiniert. | **Ja** |
| 7 | **Daten bezüglich schutzbedürftiger Betroffener** | Der Gegner ist ein **Nicht-User**, wird am Unfallort überrumpelt (Stress, Schock), hat keine Vertragsbeziehung zu Claimondo, kennt Claimondo möglicherweise nicht und kann der Verarbeitung in dieser Situation nur schwer widersprechen (Machtasymmetrie: Flottenfahrzeug-NFC vs. Einzelperson). Erhebliche Vulnerabilität durch Stresssituation. | **Ja** |
| 8 | **Innovative Nutzung neuer Technologien** | NFC-gestützte Dateneingabe durch Dritte in Echtzeit am Unfallort zur rechtlichen Schadenserfassung ist ein neuartiger Anwendungsfall. Die soziale und rechtliche Wirkung dieser Technik (digitale Unterschrift unter Druck, automatische Versicherungsmeldung) ist in dieser Form nicht breit erprobt. | **Ja** |
| 9 | **Verweigerung von Rechten oder Dienstleistungen** | Die Daten des Gegners bewirken mittelbar eine Schadensersatzforderung gegen dessen Versicherung. Das ist kein Ausschluss von Diensten, aber die **finanzielle Folgewirkung** für den Gegner (höhere Prämie, Regulierung) ist relevant. | **Grenzwertig** |

**Zählung einschlägiger Kriterien:** 4 klar (Kriterien 4, 6, 7, 8) + 2 grenzwertig (2, 9) = **mindestens 4 Kriterien erfüllt.**

**Regel:** 2+ Kriterien begründen eine starke Vermutung der DPIA-Pflicht (WP 248 rev.01, S. 11). Mit 4 klar erfüllten Kriterien ist die Vermutung nicht widerlegbar.

### 1.3 DSK-Blacklist — Art. 35(4) DSGVO (Deutschland)

| DSK-Eintrag | Relevanz für den Gegner-Flow |
|-------------|------------------------------|
| **#3 — Großmaßstäbliche Verarbeitung von Standort-/Bewegungsdaten zur Profilierung oder Bewertung** | Geo-Daten (Unfallort) werden erfasst. Im MVP kein Profiling daraus; die Daten sind Beweismittel, keine Profiling-Basis. Blacklist-Tatbestand setzt Profiling oder Bewertung voraus — **nicht direkt einschlägig**, aber zu monitoren bei Scale-up. |
| **#6 — Fuhrparkmanagement / GPS-Tracking von Mitarbeitern** | Betrifft Flottenfahrer als potenzielle Betroffene (wenn Fahrzeug-Tracking eingeführt würde). Layer 0/1 (Flottenverwaltung) betroffen; Layer 2 (Gegner-Flow) nur mittelbar. **Nicht direkt einschlägig** für den Gegner-Flow. |

Kein DSK-Blacklist-Eintrag ist für den Gegner-Flow (Layer 2) direkt anwendbar. Die DPIA-Pflicht ergibt sich aus den EDPB-Kriterien, nicht aus der DSK-Blacklist.

### 1.4 THRESHOLD-VERDICT

> **DPIA ERFORDERLICH** — Nicht nach Art. 35(3), aber aufgrund von 4 erfüllten EDPB-Kriterien
> (darunter schutzbedürftige Betroffene in Stresssituation + innovative Technologie) ist die
> DPIA-Pflicht nach Art. 35(1) DSGVO eindeutig begründet. Launch von Plan 3 und Plan 4 ist
> **ohne abgeschlossene und DSB-freigegebene DPIA nicht zulässig.**

---

## 2. Beschreibung der Verarbeitungstätigkeit

### 2.1 Zweck und Kontext

Die NFC-Schadenkarte ist ein physisches Gerät (NFC-Chip mit NDEF-URL), das an Flottenfahrzeugen befestigt ist. Im Fall eines Haftpflichtschadens (Gegner schuld) hält der Flottenfahrer die Karte an das Smartphone des Unfallgegners. Das Smartphone des Gegners öffnet automatisch eine Webseite (`https://claimondo.de/schaden/{karten_token}`), auf der der Gegner seine Daten eingibt und den digitalen Unfallbericht (Europäischer Unfallbericht) ausfüllt.

**Zweck der Verarbeitung:**
- Dokumentation des Unfallhergangs und der Schadensbeteiligten (Beweissicherung)
- Erfassung der Haftpflichtversicherung des Gegners für die Schadensregulierung
- Automatische Erstellung eines Schadensfalls (Claim) auf der Claimondo-Plattform
- Automatische Unfallmeldung an die Haftpflichtversicherung des Gegners
- Schutz des Flottenunternehmens vor Identitätsverlust/Datenverlust am Unfallort

### 2.2 Verarbeitete Datenkategorien

| Datenkategorie | Konkrete Daten | Betroffene |
|----------------|----------------|-----------|
| **Identifikationsdaten des Gegners** | Vorname, Nachname, Anschrift | Gegner (Nicht-User) |
| **Fahrzeugdaten des Gegners** | Kfz-Kennzeichen, Marke/Modell | Gegner (Nicht-User) |
| **Versicherungsdaten des Gegners** | Haftpflichtversicherer (aus `versicherungen`-Registry), Policennummer/Versicherungsschein-Nr. | Gegner (Nicht-User) |
| **Unfallhergang** | Strukturierte Tatsachen (Europäischer Unfallbericht-Schema), Unfallskizze (Canvas-Zeichnung) | Beide Parteien |
| **Biometrische Signatur** | Canvas-Unterschrift des Gegners (keine eindeutige biometrische Identifikation) | Gegner (Nicht-User) |
| **Standortdaten** | GPS-Koordinaten (geo_lat, geo_lng) des Unfallortes | Beide Parteien |
| **Fotodokumente** | Fotos der Sachschäden (Fahrzeuge, Unfallstelle) — ausdrücklich kein Personenschaden | Beide Parteien |
| **Kommunikationsdaten** | Telefonnummer des Gegners (für SMS-Verifizierung, optional) | Gegner (Nicht-User) |
| **Technische Metadaten** | IP-Hash (nicht Roh-IP), Zeitstempel der Signatur, verwendete Erklärungs-Version | Gegner (Nicht-User) |
| **Flottenfahrer-Daten** | Person-ID (nachträglich im Portal ergänzt, authentifiziert), ggf. interner Name | Flottenfahrer (User) |
| **Firmendaten** | Firmenname, Fahrzeugdaten — aus Karten-Token-Auflösung, keine neue Eingabe | Flottenunternehmen |

**Art.-9-Daten:** Keine im MVP-Design (Fotos auf Sachschaden gescoped, keine Gesundheitsdaten). Dieses Scoping muss technisch erzwungen und im UI klar kommuniziert werden.

### 2.3 Betroffene Personen

| Gruppe | Charakter | Schutzbedürftigkeit |
|--------|-----------|---------------------|
| **Unfallgegner** | Nicht-User; kein Vertragsverhältnis mit Claimondo; tritt unter Stressbedingungen am Unfallort auf | Hoch: Stresssituation, Machtasymmetrie, kein vorheriges Bewusstsein für Claimondo-Verarbeitung |
| **Flottenfahrer** | User des Flottenunternehmens (authentifiziert im Nachgang); indirekt betroffene Person am Unfallort | Mittel: Vertragsverhältnis vorhanden; Daten erst nachträglich über Portal ergänzt |

### 2.4 Datenflüsse und Empfänger

```
Gegner-Smartphone
  → Claimondo /schaden/{token} (Next.js, Vercel/Server)
    → Supabase (Postgres) — claims, claim_parties, unfallberichte, personen, fall_dokumente
    → Supabase Storage — Unfallfotos, Skizze-URL, Signatur-URLs
    → Versicherungs-E-Mail (versicherungen.schaden_email) — Unfallmitteilung
    → SMS-Provider (Twilio) — Verifizierungs-SMS (optional)
    → Gegner-E-Mail — Kopie des Unfallberichts (optional)
```

**Auftragsverarbeiter:**
- Supabase Inc. (USA) — Datenbankhosting; Rechtsgrundlage für Drittlandübermittlung: EU-US DPF + SCCs
- Vercel Inc. (USA) — Next.js-Hosting; Rechtsgrundlage: EU-US DPF + SCCs
- Twilio Inc. (USA) — SMS-Versand; Rechtsgrundlage: SCCs

### 2.5 Aufbewahrungsfristen (Entwurf)

| Datenkategorie | Vorgeschlagene Frist | Begründung |
|----------------|---------------------|-----------|
| Unfallbericht + claim-Daten | 10 Jahre nach Abschluss | Verjährungsfristen Kfz-Haftpflicht (§195, §197 BGB); VVG §12 |
| Unfallfotos (Sachschaden) | 10 Jahre nach Abschluss | Wie oben |
| IP-Hash | 90 Tage nach Claim-Erstellung | Anti-Fraud; kein Personenbezug nach Ablauf (Hash ohne Inverse-Lookup nach 90d nicht mehr verwertbar) |
| SMS-Verifizierungsdaten | 30 Tage nach Abschluss | Beweissicherung für Telefon-Verifikation |
| Gegner-Telefonnummer | 10 Jahre (wenn für Claim-Kommunikation genutzt) / 90 Tage (wenn nur Verifikation) | Je nach Nutzungszweck; zu definieren |

**Anmerkung:** Aufbewahrungsfristen müssen durch Rechtsberatung validiert werden, insbesondere hinsichtlich Verjährungsunterbrechung und versicherungsrechtlicher Anforderungen.

### 2.6 Rechtsgrundlagen

| Verarbeitungsvorgang | Rechtsgrundlage | Begründung |
|---------------------|-----------------|-----------|
| Erfassung Gegner-Daten (Identifikation, Fahrzeug, Versicherung) | Art. 6(1)(f) DSGVO — berechtigte Interessen | Berechtigtes Interesse: Schadenserfassung, Durchsetzung von Haftpflichtansprüchen. Interessenabwägung: Interesse des Flottenunternehmens an Beweissicherung überwiegt; Gegner ist gesetzlich zur Mitwirkung verpflichtet (§142 StGB Unfallflucht). |
| Unfallbericht (Tatsachenfeststellung) | Art. 6(1)(f) + Art. 6(1)(b) (vorvertragliche Maßnahmen gegenüber Gegner-Versicherung) | Rechtliche Notwendigkeit der Schadensabwicklung |
| Übermittlung an Gegner-Versicherung | Art. 6(1)(f) + Haftpflichtrecht | Schadensanmeldung ist rechtlich notwendig |
| SMS-Verifizierung | Art. 6(1)(f) | Fraud-Prevention, Datenqualitätssicherung |
| Fotodokumentation (Sachschaden) | Art. 6(1)(f) | Beweissicherung für Haftpflichtanspruch |

**Interessenabwägung Art. 6(1)(f) — Vertiefung:**
Die Interessenabwägung muss die Stresssituation des Betroffenen einbeziehen. Gemildert wird die Eingriffstiefe durch: (a) gesetzliche Offenlegungspflicht des Unfallbeteiligten nach §142 StGB i.V.m. §34 StVO; (b) Datenminimierung (nur unfallrelevante Daten); (c) Transparenz-Screen mit Widerspruchshinweis; (d) klare Abgrenzung zu einem Schuldeingeständnis (Unfallbericht = Tatsachen, kein Schuldanerkenntnis). Diese Faktoren sprechen dafür, dass das berechtigte Interesse des Flottenunternehmens das schutzwürdige Interesse des Betroffenen an Nichtverarbeitung überwiegt — allerdings nur bei vollständiger Umsetzung der vorgesehenen Schutzmaßnahmen.

---

## 3. Notwendigkeit und Verhältnismäßigkeit

### 3.1 Notwendigkeit der Verarbeitungszwecke

| Zweck | Erforderlich? | Alternative geprüft? |
|-------|:---:|----------------------|
| Identifikation des Gegners (Name, Anschrift) | Ja | Kein milderes Mittel: Personalausweis-Scan wäre invasiver; Telefonnotiz wäre fehleranfälliger und unstrukturierter |
| Kennzeichen und Fahrzeugdaten | Ja | Bereits öffentlich sichtbar am Unfallort; digitale Erfassung strukturiert nur das Offensichtliche |
| Versicherungsdaten (Versicherer + Policennummer) | Ja | Kern des Use Cases: ohne diese Daten ist kein Haftpflichtanspruch stellbar |
| Standortdaten (GPS) | Ja, mit Einschränkung | Beweisfunktion (Unfallort nachweisbar). Zu prüfen: Ob Pflichtfeld oder optional mit manueller Eingabe als Fallback |
| Foto-Dokumentation (Sachschaden) | Ja | Beweismittel für Versicherungsregulierung; explizit auf Sachschaden beschränkt (Art. 9-Vermeidung) |
| IP-Hash | Ja, mit Hash-Schutz | Anti-Fraud; Roh-IP wäre unverhältnismäßig; Hash-Ansatz ist bereits proportional |
| SMS-Verifizierung | Empfohlen, nicht Pflicht | Datenqualität und Fraud-Prevention; muss optional bleiben (kein Zwang zur Telefonnummer) |
| Canvas-Signatur | Ja | Rechtliche Verbindlichkeit der Tatsachenfeststellung; keine biometrische Identifikation |

### 3.2 Datenminimierung (Art. 5(1)(c) DSGVO)

**Positiv-Befunde:**
- IP wird nur als Hash gespeichert (nicht roh)
- Fotos auf Sachschaden gescoped (keine Gesundheitsdaten)
- Kein obligatorischer Account für den Gegner
- Kein Klartext-Token in der Datenbank (Hash + Lookup-Prefix)
- Optionales, klar getrenntes Haftungsanerkennungsfeld

**Offene Punkte (für DSB zu klären):**
- Sind Vorname und Nachname als Pflichtfelder verhältnismäßig, oder reicht der Name des Fahrzeughalters (aus Kennzeichen)? Praxis: nach §142 StGB muss der Unfallbeteiligte Personalien angeben — Pflichtfeld ist vertretbar.
- Muss der genaue GPS-Standort erfasst werden, oder reicht eine manuelle Adresseingabe (weniger präzise, aber für die meisten Fälle ausreichend)? Empfehlung: GPS optional, manuelle Eingabe als Fallback.
- Skizze (Canvas-Zeichnung): Speicherung als URL im Storage — Format und Löschfristen prüfen.

### 3.3 Zweckbindung (Art. 5(1)(b) DSGVO)

Die erfassten Daten dienen ausschließlich:
1. Dokumentation des Unfallhergangs
2. Geltendmachung des Haftpflichtanspruchs
3. Versicherungskommunikation

**Risiko Zweckentfremdung:** Die Daten dürfen nicht für:
- Profiling der Gegner
- Marketing gegenüber dem Gegner
- Scoring oder Risikobewertung der Gegner-Versicherung durch Claimondo
- Weitergabe an andere Claimondo-Kunden (andere Flottenunternehmen) verwendet werden.

**Technische Sicherung der Zweckbindung:** RLS auf `unfallberichte`, `claim_parties`, `claims` muss sicherstellen, dass nur das betroffene Flottenunternehmen (firma) Zugriff auf "ihre" Gegner-Daten hat; keine Cross-firma-Sichtbarkeit.

### 3.4 Verhältnismäßigkeit der Karte als Mittel

Der Einsatz eines NFC-Chips zur Aktivierung eines Dateneingabe-Flows ist verhältnismäßig, weil:
- Alternative: handgeschriebener Europäischer Unfallbericht (papierbasiert) — fehleranfälliger, keine strukturierte Datenhaltung, gleiches Datenprofil
- Die NFC-Karte senkt die Hürde für den Gegner (kein Download einer App, kein Account erforderlich)
- Die Verarbeitung startet erst mit aktivem Tap durch den Gegner (keine passive Überwachung)

**Verhältnismäßigkeitsgrenze:** Die Karte darf keine Daten ohne aktive Aktion erfassen. NFC-Chips in "passivem" Auslesemodus (kontaktlos auslesbar ohne Tap-Intent) wären unverhältnismäßig. Das NDEF-Muster (Tap → URL-Öffnung) ist ausreichend aktiv.

---

## 4. Risikoregister

Bewertung aus Sicht der betroffenen Personen (Recital 75 DSGVO). Likelihood und Severity nach DPIA-Scoring-Referenz (1-5). Score = Likelihood × Severity.

### PRE-MITIGATION-SCORES

| Risk-ID | Beschreibung | Rechte-Kategorie | Likelihood (1-5) | Severity (1-5) | Score | Level |
|---------|-------------|------------------|:---:|:---:|:---:|:---:|
| **R-01** | **Manipulation unter Druck:** Gegner wird am Unfallort unter Stress oder psychologischem Druck (Flottenfahrer, Machtsituation) dazu gebracht, mehr Daten preiszugeben als erforderlich oder die optionale Haftungsanerkennung zu bestätigen, obwohl er nicht sicher ist | MANP-02, CTRL-01 | 4 | 4 | **16** | **Very High** |
| **R-02** | **Falsche Identitätserfassung / Datenfehler mit finanziellen Konsequenzen:** Gegner gibt unter Stress fehlerhafte Daten ein (falscher Versicherer, falsche Policennummer) → Haftpflichtmeldung scheitert → Gegner steht schlechter da als bei papierbasiertem Ablauf | FINL-01, REPD-02 | 3 | 3 | **9** | **High** |
| **R-03** | **Datenpanne — Unbefugter Zugriff auf Gegner-Daten:** Sicherheitslücke in Supabase/Vercel führt zu Offenlegung von Gegner-Identität, Versicherungsdaten, Unfallhergang gegenüber Dritten | CONF-02, IDTH-01 | 3 | 4 | **12** | **High** |
| **R-04** | **Karten-Token-Missbrauch:** Kompromittierter oder geleakter `karten_token` ermöglicht es Dritten, einen Fake-Schaden-Flow zu öffnen und Gegner-Daten unter falschem Vorwand zu sammeln (Phishing-Angriff via NFC) | IDTH-01, CTRL-03, MANP-01 | 3 | 4 | **12** | **High** |
| **R-05** | **Verlust der Kontrolle durch Nicht-User-Status:** Gegner weiß nicht, wer Claimondo ist, kennt seine Rechte (Auskunft, Löschung, Widerspruch) nicht und kann sie in der Akutsituation nicht ausüben | CTRL-01, CTRL-02 | 4 | 3 | **12** | **High** |
| **R-06** | **Zweckentfremdung — Profiling des Gegners:** Gegner-Daten (Name, Versicherer, Hergang) werden ohne Wissen des Gegners für andere Claimondo-Zwecke genutzt (z.B. Scoring, Marketing, Weitergabe an andere Flottenunternehmen) | CTRL-03, DISC-03 | 2 | 4 | **8** | **High** |
| **R-07** | **Drittlandübermittlung (Supabase/Vercel USA):** Personenbezogene Daten des Gegners (auch IP-Hash, Versicherungsdaten) werden auf US-Servern verarbeitet; CLOUD Act/Foreign Access-Risiko | CONF-03, CTRL-03 | 2 | 3 | **6** | **Medium** |
| **R-08** | **Fotos enthalten unbeabsichtigt Art.-9-Daten:** Gegner/Fahrer macht Fotos des Sachschadens, erfasst dabei unbeabsichtigt sichtbare Verletzungen oder andere Personen (Passanten, Kinder) → ungewollte Gesundheitsdaten/Biometrie | CONF-02, CTRL-03 | 3 | 4 | **12** | **High** |
| **R-09** | **GPS-Tracking-Ableitbarkeit:** Aus kombinierten Unfallort-Daten (geo_lat/geo_lng + Zeitstempel + Fahrzeug) ließen sich bei Aggregation Bewegungsprofile des Gegners erstellen (falls dieser in mehrere Unfälle verwickelt ist) | CTRL-03, CHIL-01 | 2 | 3 | **6** | **Medium** |
| **R-10** | **SMS-Spoofing / Telefonnummer nicht verifizierbar:** Gegner gibt fremde Telefonnummer an → SMS-Verifizierung schlägt fehl oder bestätigt falsche Identität → Fraud | IDTH-01, FINL-01 | 3 | 3 | **9** | **High** |
| **R-11** | **Unfallbericht als Beweismittel gegen den Gegner — ohne angemessene rechtliche Aufklärung:** Gegner unterschreibt Tatsachen, ohne zu verstehen, dass dies ein rechtlich verwertbares Dokument ist | MANP-01, CTRL-01 | 4 | 4 | **16** | **Very High** |
| **R-12** | **Haftungsanerkennungsfeld — unzulässige Einwilligung unter Druck:** Das optionale Häkchen "Ich erkenne meine Haftung an" könnte unter Stress als "Standard" wahrgenommen oder durch den Flottenfahrer sozial erzwungen werden | MANP-02, CTRL-01 | 3 | 4 | **12** | **High** |

### Begründungen der Pre-Mitigation-Scores

**R-01 (L:4, S:4 = 16):** Stresssituation am Unfallort ist dokumentierter Risikofaktor für psychologische Beeinflussung. Machtgefälle zwischen professionellem Flottenfahrer (mit Anleitung durch Arbeitgeber) und unvorbereiteter Einzelperson. Severity 4: Finanzielle Konsequenzen durch ungewollte Haftungsanerkennung sind schwer rückgängig zu machen.

**R-11 (L:4, S:4 = 16):** Europäischer Unfallbericht hat Beweiswert vor Gericht und gegenüber Versicherungen. Gegner unterschreibt unter Druck ohne Möglichkeit, Rechtsberatung hinzuzuziehen. Severity 4: Rechtliche Konsequenzen (Haftpflicht-Regulierung, ggf. Schadensersatz) können erheblich und langfristig sein.

**R-08 (L:3, S:4 = 12):** Unbeabsichtigte Erfassung von Gesundheitsdaten (Verletzungen) in Unfallfotos ist ein realistisches Szenario, da Gegner in Stress-Situationen nicht selektiv fotografieren. Art.-9-Daten wären dann ohne Rechtsgrundlage verarbeitet.

---

## 5. Maßnahmen (Mitigationen)

### M-01 — Transparenz-Screen (Pflicht, adressiert R-05, R-11, R-01)
Bevor der Gegner irgendwelche Daten eingibt, muss ein dedizierter Transparenz-Screen erscheinen:
- Wer ist Claimondo? (Controller-Identität + Kontakt)
- Warum werden diese Daten verarbeitet? (Rechtsgrundlage Art. 6(1)(f))
- Welche Daten werden erfasst und zu welchem Zweck?
- Wird ein rechtlich verbindliches Dokument erstellt? (ja, klare Warnung)
- Betroffenenrechte (Auskunft, Löschung, Widerspruch) mit konkretem Kontakt (datenschutz@claimondo.de)
- Hinweis: Kein Account erforderlich, Daten können auf Antrag gelöscht werden

**Technische Umsetzung:** Screen muss VOLLSTÄNDIG durchgescrollt sein oder ein aktives "Ich habe die Information gelesen"-Klick erfolgen, bevor der Formular-Flow beginnt. Kein Pre-Check. Kein Opt-Out-Zwang (Gegner kann Flow abbrechen und seinen Namen mündlich mitteilen).

### M-02 — Haftungsanerkennungsfeld UI-Design (adressiert R-12, R-01)
Das optionale `haftung_vom_gegner_anerkannt`-Feld:
- Muss als eigener, deutlich abgesetzter Schritt am Ende des Flows erscheinen (kein Inline-Checkbox im Formular)
- Muss mit einer klaren Warnung versehen sein: "Dies ist kein Teil des Unfallberichts. Wenn Sie dieses Feld ankreuzen, erklären Sie freiwillig Ihre Haftung. Sie sind nicht verpflichtet, dies zu tun."
- Darf unter keinen Umständen vorausgefüllt (pre-checked) sein
- Muss einen Exit-Pfad ("Weiter ohne Haftungsanerkennung") prominent anbieten

### M-03 — Foto-Scoping-Enforcement (adressiert R-08)
- UI-Text vor Foto-Upload: "Bitte fotografieren Sie nur den Sachschaden an den Fahrzeugen. Keine Personen, keine Verletzungen."
- Technisch: Prüfung ob möglich (heuristische Content-Detection). Falls nicht: klarer Disclaimer + Post-Upload-Hinweis an firmen-Admin zur manuellen Prüfung vor Weitergabe an Versicherung
- Richtlinie: Fotos mit sichtbaren Personen (erkennbar) werden vor Übermittlung an die Versicherung durch Claimondo-Mitarbeiter (oder automatische Blurring-Logik) bereinigt

### M-04 — Token-Sicherheit (adressiert R-04)
- `karten_token` nur als Hash in DB (analog `airdrop_invitations`)
- Token hat Ablaufzeit: Karte ist nur "aktiv" (nicht "gesperrt"/"ersetzt")
- Rate-Limiting auf `/schaden/{token}`-Route (max. X Requests/Stunde per IP)
- Logging aller Token-Auflösungen mit IP-Hash (für Anomalie-Erkennung)
- Gesperrte Karten leiten sofort auf Fehlermeldung um (kein Flow)

### M-05 — Pseudonymisierung IP (adressiert R-03, R-09)
- IP wird ausschließlich als kryptographischer Hash (SHA-256 mit täglichem Salt) gespeichert
- Kein Roh-IP in Datenbank oder Logs
- Salt-Rotation nach 90 Tagen (nach dieser Zeit ist IP-Hash nicht mehr zur Identifikation verwertbar)
- Dieser Ansatz ist bereits im Design vorgesehen (`ip_hash`-Spalte in `unfallberichte`)

### M-06 — Rechtliche Klarheit des Unfallberichts (adressiert R-11, R-01)
- Der versionierte Text (`erklaerung_version` in `unfallberichte`) muss juristische Prüfung durchlaufen
- Der Text muss explizit beinhalten: "Dieser Bericht dokumentiert den Unfallhergang aus Sicht beider Beteiligten. Er stellt kein Schuldanerkenntnis dar."
- Rechtsberatung zur Formulierung vor Launch (Pflicht)
- PDF-Kopie an Gegner-E-Mail (falls angegeben) oder SMS nach Abschluss

### M-07 — Betroffenenrechte-Implementierung (adressiert R-05, CTRL-02)
- Eigene Löschseite für Gegner (ohne Account): Über E-Mail + Claim-Referenz kann Gegner Löschantrag stellen
- Auskunftsprozess für Gegner: datenschutz@claimondo.de + 30-Tage-Bearbeitungsfrist
- Widerspruchsrecht gegen Art. 6(1)(f)-Verarbeitung: Muss technisch verarbeitbar sein (Flow-Stop, Claim-Prüfung)
- Einschränkung der Verarbeitung: Wenn Gegner widerspricht, Daten müssen eingefroren werden können

### M-08 — Auftragsverarbeiter-Management (adressiert R-07)
- Supabase: AV-Vertrag (Art. 28 DSGVO) + SCCs (EU-US DPF prüfen)
- Vercel: AV-Vertrag + SCCs (EU-US DPF prüfen)
- Twilio: AV-Vertrag + SCCs
- Transfer-Impact-Assessment (TIA) für US-Transfers prüfen (EDPB Empfehlung 01/2020)

### M-09 — RLS und Datenisolation (adressiert R-06, CONF-02)
- `unfallberichte`, `claim_parties`, `claims`: RLS-Policy sicherstellt, dass ausschließlich die betroffene `firma` Zugriff auf "ihre" Gegner-Datensätze hat
- Claimondo-Admin: Zugriff nur für Regulierungs- und Support-Zwecke mit Audit-Log
- Keine Cross-firma-Sichtbarkeit auf Gegner-Daten
- Service-Role für Token-Auflösung: Scope auf minimal notwendige Tabellen/Spalten beschränken

### M-10 — Offline-Daten-Handling (Sicherheit)
- IndexedDB (Client-seitige Pufferung bei Funkloch): Daten verschlüsselt im Browser-Storage (Web Crypto API)
- Keine Persistenz nach erfolgreichem Submit
- Automatisches Löschen des IndexedDB-Eintrags nach 48h ohne Submit (Schutz bei abgebrochenem Flow)

---

## 6. Residualrisiko-Übersicht

### Post-Mitigation-Scores

| Risk-ID | Pre-Score | Pre-Level | Mitigationen | Post-Likelihood | Post-Severity | Post-Score | Post-Level |
|---------|:---:|:---:|--------------|:---:|:---:|:---:|:---:|
| R-01 | 16 | Very High | M-01, M-02 | 2 | 3 | **6** | Medium |
| R-02 | 9 | High | M-06 (Versicherer-Picker statt Freitext), M-01 | 2 | 3 | **6** | Medium |
| R-03 | 12 | High | M-05, M-09 | 2 | 4 | **8** | High |
| R-04 | 12 | High | M-04 | 2 | 3 | **6** | Medium |
| R-05 | 12 | High | M-01, M-07 | 2 | 2 | **4** | Medium |
| R-06 | 8 | High | M-09 | 1 | 4 | **4** | Medium |
| R-07 | 6 | Medium | M-08 | 2 | 2 | **4** | Medium |
| R-08 | 12 | High | M-03 | 2 | 3 | **6** | Medium |
| R-09 | 6 | Medium | M-05 | 1 | 3 | **3** | Low |
| R-10 | 9 | High | M-04 (Rate-Limiting), SMS-Verifizierung | 2 | 2 | **4** | Medium |
| R-11 | 16 | Very High | M-01, M-06 | 2 | 3 | **6** | Medium |
| R-12 | 12 | High | M-02 | 2 | 3 | **6** | Medium |

### Zusammenfassung vor und nach Mitigation

| Risk-Level | Pre-Mitigation | Post-Mitigation |
|------------|:--------------:|:---------------:|
| Very High (13-25) | 2 | 0 |
| High (7-12) | 8 | 1 |
| Medium (4-6) | 1 | 10 |
| Low (1-3) | 1 | 1 |

### Verbleibendes High-Residualrisiko

**R-03 (Post: 8 — High):** Datenpanne bei Drittanbietern (Supabase/Vercel) mit Offenlegung von Versicherungs- und Identitätsdaten des Gegners. Severity bleibt 4 (Identitätsdiebstahl, finanzielle Schäden, Reputationsschäden für Betroffene). Likelihood auf 2 gesenkt durch: starke Verschlüsselung at rest + in transit, RLS, Audit-Logging, AV-Verträge. Eine weitere Senkung der Likelihood wäre möglich durch: (a) Datensparsamkeit beim Gegner-Profil (minimale Speicherung), (b) regelmäßige Penetration-Tests. Residualrisiko-Level High ist dokumentiert und akzeptiert; kein Art.-36-Trigger (kein Very High nach Mitigation).

### Gesamtbewertung

**Residualrisiko-Position: Akzeptabel mit Auflagen**

Voraussetzungen für "Akzeptabel":
1. Alle 10 Maßnahmen (M-01 bis M-10) müssen vor Launch von Plan 3/4 implementiert und verifiziert sein
2. AV-Verträge mit Supabase, Vercel, Twilio vor Launch abgeschlossen
3. Rechtliche Prüfung des `erklaerung_version`-Textes durch Anwalt vor Launch
4. DSB-Freigabe dieses DPIA-Dokuments
5. Fotos: Foto-Scoping-Richtlinie dokumentiert und technisch soweit möglich erzwungen

---

## 7. Art. 36-Prüfung (Vorabkonsultation bei der Datenschutzaufsichtsbehörde)

### Prüfmaßstab
Art. 36 DSGVO verlangt Vorabkonsultation bei der zuständigen Aufsichtsbehörde, wenn nach dem DPIA ein **hohes Restrisiko** verbleibt, das der Verantwortliche nicht durch Maßnahmen mindern kann.

### Bewertung

**Ist eine Vorabkonsultation erforderlich?**

Nach vollständiger Umsetzung der Maßnahmen M-01 bis M-10 verbleibt kein "Very High"-Risiko. Das verbleibende High-Risiko R-03 ist ein allgemeines Datensicherheitsrisiko bei Web-Anwendungen, das durch technische und organisatorische Maßnahmen (Supabase-AV-Vertrag, Verschlüsselung, RLS) auf ein Niveau gesenkt wird, das in der Branche als managebar gilt.

**Ergebnis: Art. 36-Vorabkonsultation ist nach vollständiger Umsetzung der Maßnahmen NICHT zwingend erforderlich.**

**ABER — Empfehlung des DPIA-Sentinel:**
Aufgrund der besonderen Kombination aus (1) Nicht-User-Betroffenen in Stresssituation + (2) neuartiger NFC-gestützter Rechtserfassung + (3) automatischer Versicherungsmeldung **empfehlen wir, die Aufsichtsbehörde informell zu kontaktieren** (als "Regulatory Engagement", nicht als Pflicht-Konsultation). Dies schafft Rechtssicherheit und schützt Claimondo bei einem späteren Enforcement-Verfahren.

**Zuständige Aufsichtsbehörde:** Claimondo mit Sitz in Deutschland → Zuständige Landesbehörde gemäß DSGVO Art. 55 (je nach Bundesland des Unternehmenssitzes, alternativ BfDI falls bundesweite Relevanz). Im One-Stop-Shop-Kontext (Art. 56): Claimondo hat nur DE-Niederlassung → kein One-Stop-Shop.

---

## 8. Monitoring und Überprüfung

### Laufendes Monitoring

| Maßnahme | Frequenz | Verantwortlich |
|---------|---------|---------------|
| Überprüfung Aufbewahrungsfristen (automatische Löschläufe) | Quartalsweise | Technik + DSB |
| Penetration-Test der `/schaden/{token}`-Route | Jährlich / bei größeren Releases | Security-Beauftragter |
| Überprüfung der AV-Verträge (Supabase, Vercel, Twilio) | Bei Anbieter-Updates oder Jährlich | Rechtsberatung |
| Audit der RLS-Policies (Cross-firma-Isolation) | Bei Schema-Änderungen | Technik |
| Review Foto-Inhalte (Stichproben auf Art.-9-Daten) | Monatlich (erste 3 Monate nach Launch) | Ops-Team |
| Überprüfung `erklaerung_version` (rechtliche Aktualität) | Jährlich oder bei Gesetzesänderungen | Rechtsberatung |
| DPIA-Review | 12 Monate nach Launch, dann alle 2 Jahre oder bei wesentlicher Änderung | DSB |

### Auslöser für DPIA-Überarbeitung

- Erweiterung auf Personenschaden-Erfassung (neuer Art.-9-Scope)
- Einführung von Profiling aus Unfalldaten
- Phase-2-Feature: Zentralruf GDV-Abgleich (neue Datenquelle)
- Erweiterung auf Firma-gegen-Firma-Unfälle
- Signifikante Skalierung (Tausende Gegner/Monat → Großmaßstab-Prüfung)
- Datenpanne mit Gegner-Daten
- Änderung der Rechtsgrundlage oder des Auftragsverarbeiters

---

## Anhang A — Checkliste vor Launch (Plan 3/4)

- [ ] M-01 Transparenz-Screen implementiert und UX-geprüft
- [ ] M-02 Haftungsanerkennungsfeld separat, nie vorausgefüllt, klare Warnung
- [ ] M-03 Foto-Scoping-Text implementiert; Richtlinie dokumentiert
- [ ] M-04 Token Rate-Limiting + Ablauf-Logik implementiert
- [ ] M-05 IP-Hash (SHA-256 + täglicher Salt) implementiert; kein Roh-IP
- [ ] M-06 `erklaerung_version`-Text von Rechtsanwalt freigegeben
- [ ] M-07 Lösch- und Auskunftsprozess für Gegner (ohne Account) dokumentiert und technisch funktionsfähig
- [ ] M-08 AV-Verträge Supabase + Vercel + Twilio abgeschlossen
- [ ] M-09 RLS auf `unfallberichte`, `claim_parties`, `claims` auditiert (Cross-firma-Isolation verifiziert)
- [ ] M-10 Offline-IndexedDB-Verschlüsselung implementiert
- [ ] DSB hat dieses DPIA-Dokument geprüft und freigegeben
- [ ] Datenschutzerklärung auf claimondo.de um Gegner-Flow-Verarbeitung ergänzt

---

## Anhang B — Nicht in Scope dieser DPIA

Diese DPIA deckt Layer 2 (Gegner-Flow) ab. **Separate DPIAs** oder DPIA-Erweiterungen sind erforderlich für:

- **Layer 0/1 (Flottenverwaltung, Schadenkarte):** Verarbeitung von Flotten-Mitarbeiterdaten, GPS-Tracking-Features falls eingeführt (DSK-Eintrag #6 wäre dann direkt einschlägig)
- **Personenschaden-Erweiterung (Phase 2):** Fotos mit Verletzungen = Art. 9(1)(h)-Gesundheitsdaten → eigene Art.-35(3)(b)-Analyse, separate DPIA zwingend
- **GDV-Zentralruf-Abgleich (Phase 2):** Neuer Datenaustausch mit externem Anbieter → eigene Verarbeitungsbeschreibung und Risikobewertung
- **Firma-als-Gegner (Phase 2):** Wenn Gegner eine Firma ist → eigene Sachverhaltsanalyse (DSGVO gilt nur für natürliche Personen; aber Firmenvertreter als natürliche Personen relevant)

---

*ENTWURF — Nicht zur Verwendung als abgeschlossene DPIA. Freigabe durch DSB erforderlich.*
*Erstellt: 2026-07-11. Nächste planmäßige Überprüfung: 12 Monate nach Launch oder bei wesentlicher Änderung.*
