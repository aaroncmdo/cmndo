# Flow Wizard i18n Key Map — Analyse 2026-05-26

Quelldatei: `src/app/flow/[token]/FlowWizardKfz.tsx` (Funnel v3, 819 Zeilen)
i18n-Namespace: `src/i18n/messages/de.json` → `flow.*`

**Zweck:** Dieses Dokument ist das Implementierungs-Worksheet für das mechanische Verdrahten der
`next-intl`-Translations. Jeder nutzersichtbare String im Wizard ist erfasst und klassifiziert.

---

## Wizard-Struktur (aktuell)

Der Wizard hat **4 Schritte** mit fester `StepId`-Enumeration:

| Index | StepId | Label im Code |
|---|---|---|
| 0 | `zusammenfassung` | `Zusammenfassung` |
| 1 | `gutachter` | `Ihr Gutachter` |
| 2 | `sa` | `Beauftragung` |
| 3 | `account` | `Konto` |

i18n-Namespace-Struktur (`de.json`): `common`, `progress`, `step0`, `step1`, `step2a`, `step2b`,
`step2c`, `step3`, `step4`, `abort`

---

## Schritt 0 — Zusammenfassung (`currentStep.id === 'zusammenfassung'`)

### StepHeader

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Hallo ${editVorname \|\| 'dort'}!` | NEW | `flow.step_summary.heading` | Dynamisch: `{name}` ICU-Interpolation. Kein existierender Key passt — `step0.heading` lautet „Was ist passiert?" |
| `Bitte prüfen und korrigieren Sie Ihre Daten.` | NEW | `flow.step_summary.sub` | Kein passender Key im Namespace |

### Editable-Input Labels (EditableInput-Komponente)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Vorname` | NEW | `flow.step_summary.fields.vorname` | Kein passender Key |
| `Nachname` | NEW | `flow.step_summary.fields.nachname` | Kein passender Key |
| `Telefon` | NEW | `flow.step_summary.fields.telefon` | Kein passender Key |
| `E-Mail` | NEW | `flow.step_summary.fields.email` | Kein passender Key |

### SummaryRow Labels (readonly, aus Dispatch-Daten)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Standort` | NEW | `flow.step_summary.labels.standort` | — |
| `Fahrzeug` | NEW | `flow.step_summary.labels.fahrzeug` | — |
| `Schadentyp` | NEW | `flow.step_summary.labels.schadentyp` | — |
| `Art des Unfalls` | NEW | `flow.step_summary.labels.art_des_unfalls` | — |
| `Unfallgegner` | NEW | `flow.step_summary.labels.unfallgegner` | — |
| `Fahrzeugtyp Gegner` | NEW | `flow.step_summary.labels.fahrzeugtyp_gegner` | — |
| `Anzahl Beteiligte` | NEW | `flow.step_summary.labels.anzahl_beteiligte` | — |
| `Unfallhergang` | NEW | `flow.step_summary.labels.unfallhergang` | — |

### SCHADENTYP_LABELS (Label-Map-Konstante)

| Wert (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Spurwechsel-Unfall` | NEW | `flow.step_summary.schadentyp.spurwechsel` | — |
| `Auffahrunfall` | PARTIAL `flow.step1.hergang_options.auffahrunfall` | Wert identisch: `"Auffahrunfall"` | Ist `hergang_options`-Key, nicht `schadentyp`. Eigener Key empfohlen für semantische Klarheit |
| `Vorfahrtsverletzung` | NEW | `flow.step_summary.schadentyp.vorfahrtsverletzung` | `step1.hergang_options.vorfahrt` = „Vorfahrt missachtet" — anderer Wortlaut |
| `Parkplatz-Schaden` | NEW | `flow.step_summary.schadentyp.parkplatz` | `step1.hergang_options.parken` = „Beim Parken / Rangieren" — anderer Wortlaut |
| `Sonstiger Verkehrsunfall` | NEW | `flow.step_summary.schadentyp.sonstiges` | `step1.hergang_options.sonstiges` = „Sonstiges" — anderer Wortlaut |

### UNFALL_KONSTELLATION_LABELS (Label-Map-Konstante)

| Wert (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Auffahrunfall` | PARTIAL `flow.step1.hergang_options.auffahrunfall` | Identischer Wert, falscher semantischer Kontext | Eigener Key unter `step_summary.unfall_konstellation.*` empfohlen |
| `Spurwechsel` | PARTIAL `flow.step1.hergang_options.spurwechsel` | Identischer Wert, falscher Kontext | |
| `Parkschaden` | NEW | `flow.step_summary.unfall_konstellation.parkschaden` | `hergang_options.parken` = „Beim Parken / Rangieren" — anderer Wortlaut |
| `Vorfahrt` | NEW | `flow.step_summary.unfall_konstellation.vorfahrt` | `hergang_options.vorfahrt` = „Vorfahrt missachtet" — anderer Wortlaut |
| `Türöffnung` | NEW | `flow.step_summary.unfall_konstellation.tueroeffnung` | Kein passender Key |
| `Wildunfall` | PARTIAL `flow.step1.hergang_options.wildunfall` | Identischer Wert (`"Wildunfall"`), falscher Kontext | |
| `Glatteis` | NEW | `flow.step_summary.unfall_konstellation.glatteis` | Kein passender Key |
| `Sonstiges` | PARTIAL `flow.step1.hergang_options.sonstiges` | `"Sonstiges"` — identisch, aber anderer Kontext | |

### GEGNER_FAHRZEUGTYP_LABELS (Label-Map-Konstante)

| Wert (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `PKW` | NEW | `flow.step_summary.gegner_fahrzeugtyp.pkw` | Kein passender Key |
| `LKW` | NEW | `flow.step_summary.gegner_fahrzeugtyp.lkw` | — |
| `Transporter` | NEW | `flow.step_summary.gegner_fahrzeugtyp.transporter` | — |
| `Motorrad` | NEW | `flow.step_summary.gegner_fahrzeugtyp.motorrad` | — |
| `Fahrrad` | NEW | `flow.step_summary.gegner_fahrzeugtyp.fahrrad` | — |
| `Bus` | NEW | `flow.step_summary.gegner_fahrzeugtyp.bus` | — |
| `Sonstiges` | PARTIAL `flow.step1.hergang_options.sonstiges` | Identischer Wert, anderer Kontext | Eigener Key empfohlen |

### Datenschutz-Checkbox

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ich habe die` … `Datenschutzerklärung` … `gelesen und stimme der Verarbeitung meiner Daten zu.` | PARTIAL `flow.step4.datenschutz_label` | Wortlaut abweichend: existierender Key = „Ich habe die Datenschutzerklärung gelesen und stimme zu." — aktueller String ist länger | Entweder REUSE (Wortlaut in de.json anpassen) oder NEW |
| `Datenschutzerklärung` (Popover-Link-Text) | NEW | `flow.step_summary.datenschutz_link` | Link-Text separat als Key für Popover |

### Navigation

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Weiter` | REUSE `flow.common.weiter` | Exakt: `"Weiter"` | |

---

## Schritt 1 — Gutachter-Anzeige (`currentStep.id === 'gutachter'`)

### StepHeader

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ihr persönlicher Gutachter` | NEW | `flow.step_gutachter.heading` | Kein passender Key — `step1` dreht sich um Unfallhergang |
| `Dieser Sachverständige wird Ihren Schaden begutachten.` | NEW | `flow.step_gutachter.sub` | — |

### Gutachter-Karte (wenn `gutachter` vorhanden)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ihr Sachverständiger` | NEW | `flow.step_gutachter.sv_label` | Uppercase-Label über dem Namen |
| `Wird sich bei Ihnen melden` | NEW | `flow.step_gutachter.kontakt_hinweis` | — |
| `Termin reserviert` | NEW | `flow.step_gutachter.termin_label` | — |
| `Besichtigungsort` | NEW | `flow.step_gutachter.besichtigungsort_label` | — |
| `Treffpunkt: {value}` | NEW | `flow.step_gutachter.treffpunkt_label` | Dynamisch: Prefix + Wert-Interpolation `{treffpunkt}` |

### Fallback (kein Gutachter)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Wir suchen gerade einen passenden Sachverständigen für Sie. Sie erhalten in Kürze eine Bestätigung.` | NEW | `flow.step_gutachter.kein_gutachter` | — |

### Navigation

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Weiter` | REUSE `flow.common.weiter` | Exakt: `"Weiter"` | |
| `Zurück` | REUSE `flow.common.zurueck` | Exakt: `"Zurück"` | |

---

## Schritt 2 — SA unterzeichnen (`currentStep.id === 'sa'`)

### StepHeader

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Beauftragung unterzeichnen` | NEW | `flow.step_sa.heading` | — |
| `Mit Ihrer Unterschrift beauftragen Sie Claimondo mit der kostenlosen Abwicklung Ihres Schadens.` | NEW | `flow.step_sa.sub` | — |

### SA-Zusammenfassung (Info-Box)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Zusammenfassung:` | NEW | `flow.step_sa.summary_label` | Fett-Label |
| `Ich beauftrage die Claimondo GmbH mit der Koordination meines KFZ-Schadens. Mir entstehen keine Kosten. Die Gutachterkosten werden im Rahmen der Sicherungsabtretung an den Sachverständigen abgetreten und von der gegnerischen Versicherung getragen.` | NEW | `flow.step_sa.summary_text` | Langer Fließtext; `keine Kosten` ist `<strong>` — für i18n ggf. Rich-Text nötig |

### SA-Volltext-Link und Popover

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Vollständige Sicherungsabtretung lesen` | NEW | `flow.step_sa.volltext_link` | — |
| `Sicherungsabtretung` (Popover-Titel / `<h2>`) | NEW | `flow.step_sa.popover_titel` | — |

### SA-Volltext-Inhalt (Popover-Body — rechtlicher Text)

Hinweis: Rechtliche Vertragstexte werden in der Praxis oft **nicht** i18n-isiert (oder in separaten
Rechts-Dokumenten gepflegt). Falls doch, sind neue Keys nötig:

| Deutscher String (aktuell) | Verdict | Key |
|---|---|---|
| `1. Abtretungserklärung` | NEW | `flow.step_sa.volltext.s1_titel` |
| `Hiermit trete ich sämtliche …` (Fließtext §1) | NEW | `flow.step_sa.volltext.s1_text` |
| Liste: `Sachschadenersatzansprüche` | NEW | `flow.step_sa.volltext.s1_li1` |
| Liste: `Anspruch auf Erstattung der Gutachtervergütung` | NEW | `flow.step_sa.volltext.s1_li2` |
| Liste: `Nebenkosten (Auslagenpauschale …)` | NEW | `flow.step_sa.volltext.s1_li3` |
| Liste: `Anspruch auf Erstattung vorgerichtlicher Rechtsanwaltskosten` | NEW | `flow.step_sa.volltext.s1_li4` |
| `2. Kostenfreiheit` | NEW | `flow.step_sa.volltext.s2_titel` |
| Fließtext §2 | NEW | `flow.step_sa.volltext.s2_text` |
| `3. Vollmacht` | NEW | `flow.step_sa.volltext.s3_titel` |
| Intro §3 | NEW | `flow.step_sa.volltext.s3_intro` |
| Liste §3 (4 Punkte) | NEW | `flow.step_sa.volltext.s3_li1` … `s3_li4` |
| `4. Widerrufsbelehrung` | NEW | `flow.step_sa.volltext.s4_titel` |
| Fließtext §4 | NEW | `flow.step_sa.volltext.s4_text` |
| `5. Datenschutz` | NEW | `flow.step_sa.volltext.s5_titel` |
| Fließtext §5 | NEW | `flow.step_sa.volltext.s5_text` |
| `Claimondo GmbH · Die rechtlich bindende Fassung …` (Footer-Note) | NEW | `flow.step_sa.volltext.footer_note` |
| `Akzeptieren und weiter` (Popover-CTA) | NEW | `flow.step_sa.volltext.cta_accept` |

### Unterschrift-Canvas

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ihre Unterschrift` (Label über Canvas) | NEW | `flow.step_sa.unterschrift_label` | |
| `Hier unterschreiben` (Platzhalter im Canvas) | NEW | `flow.step_sa.unterschrift_placeholder` | |
| `Unterschrift löschen` | NEW | `flow.step_sa.unterschrift_loeschen` | |

### SA-Checkbox

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ja, ich möchte den kostenlosen Service nutzen. Alle Kosten trägt die gegnerische Versicherung. Ich stimme den` … `AGB` … `und der Widerrufsbelehrung zu.` | PARTIAL `flow.step4.agb_label` | Existierender Key = „Ich akzeptiere die Allgemeinen Geschäftsbedingungen." — komplett anderer Wortlaut | NEW empfohlen |
| `AGB` (Popover-Link-Text) | NEW | `flow.step_sa.agb_link` | — |
| `Widerrufsbelehrung` (Text im Checkbox-Label) | NEW | `flow.step_sa.widerruf_link` | — |

### Buttons & Fehlermeldung

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Wird verarbeitet ...` | NEW | `flow.step_sa.submitting` | — |
| `SA unterzeichnen` | NEW | `flow.step_sa.cta_sign` | — |
| `{error}` (dynamischer Fehlertext) | — | Laufzeit-Fehlerstring aus Server-Action | Kein Key nötig — String kommt vom Server |
| `Zurück` | REUSE `flow.common.zurueck` | Exakt: `"Zurück"` | |

---

## Schritt 3 — Account / Abschluss (`currentStep.id === 'account'`)

### StepHeader

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Geschafft!` | NEW | `flow.step_account.heading` | `step4.heading` = „Account erstellen" — komplett anderer Kontext |
| `Ihr Fall wurde erfolgreich erstellt.` | NEW | `flow.step_account.sub` | — |

### Erfolgs-Banner

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ihr Fall wurde erfolgreich erstellt! Der Gutachter wurde bereits informiert.` | NEW | `flow.step_account.success_text` | — |

### LexDrive-Visitenkarte (conditional: `service_typ === 'komplett'`)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Ihr juristischer Ansprechpartner` | NEW | `flow.step_account.lexdrive.label` | — |
| `LexDrive` | — | Eigenname, kein i18n nötig | — |
| `Unsere Partnerkanzlei. Sie wird sich in den nächsten Werktagen direkt bei Ihnen melden.` | NEW | `flow.step_account.lexdrive.hinweis` | — |

### Lade-Spinner (Auto-Account-Anlage)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Wir richten Ihr Portal ein …` | NEW | `flow.step_account.creating` | Angezeigt während `creatingAccount === true` |
| `Sie werden eingeloggt …` | NEW | `flow.step_account.logging_in` | Angezeigt wenn `accountCreated && !error` |

### Fallback (Auto-Login fehlgeschlagen, `accountCreated && error`)

| Deutscher String (aktuell) | Verdict | Key | Anmerkung |
|---|---|---|---|
| `Wir haben Ihnen die Zugangsdaten an` … `gesendet.` | NEW | `flow.step_account.fallback_email_hint` | Dynamisch: `{email}` ICU-Interpolation |
| `Zu meinem Portal` | NEW | `flow.step_account.fallback_cta` | — |

---

## Step-Label-Strings (STEPS-Konstante — Progress-Indicator)

Diese Strings erscheinen als Text im Sticky-Header (Step-Bubble-Labels). Der aktuelle Code zeigt nur
Nummern im Step-Indicator, keine Label-Texte — die `label`-Werte der `STEPS`-Konstante sind im
gerenderten HTML **nicht sichtbar** (nur `i + 1` wird gerendert). Kein i18n nötig.

| STEPS-Label | Sichtbar? | Verdict |
|---|---|---|
| `Zusammenfassung` | Nein (kein Render) | N/A |
| `Ihr Gutachter` | Nein | N/A |
| `Beauftragung` | Nein | N/A |
| `Konto` | Nein | N/A |

---

## Orphan Keys — Existierende `flow.*`-Keys ohne Entsprechung im Wizard

Diese Keys existieren in `de.json` aber haben **keinen** korrespondierenden String im aktuellen
Wizard. Sie beschreiben einen **anderen/älteren** Wizard-Flow (Multi-Step mit Foto-Upload, OCR-ZB1,
Voice-Input, Account-Formular).

| Orphan Key | Wert (de.json) | Warum kein Match |
|---|---|---|
| `flow.progress.aria_label` | `"Fortschritt im Schaden-Melden-Flow"` | Kein `aria-label` am Progress-Bar im aktuellen Code |
| `flow.progress.step1..step4` | `"Hergang"`, `"Fotos"`, `"ZB1"`, `"Account"` | Andere Step-Benennung als im Wizard |
| `flow.step0.*` (5 Keys) | „Was ist passiert?", „Beantworten Sie …", „Jetzt starten", „Dauert ca. 3 Minuten" | Kein Step0-Intro-Screen im Wizard |
| `flow.step1.*` (alle ~60 Keys) | Hergang-Formular mit Voice-Input, Datum, Ort, Marke, Schuldfrage | Wizard zeigt kein Hergang-Formular — diese Daten kommen aus dem Dispatch-Lead |
| `flow.step2a.*` (alle ~15 Keys) | Foto-Upload mit Bereich-Selektor | Step 'weitere-angaben' wurde in CMM-14 entfernt |
| `flow.step2b.*` (alle ~13 Keys) | KI-Analyse Lade-Screen + DAT-Ergebnis-Screen | Kein KI-Analyse-Step im Wizard |
| `flow.step2c.*` (alle ~14 Keys) | Unfallgegner-Daten-Formular | Diese Daten kommen bereits aus dem Dispatch-Lead (readonly) |
| `flow.step3.*` (alle ~15 Keys) | ZB1-Scan / OCR-Screen | Kein ZB1-Step im Wizard |
| `flow.step4.heading` | `"Account erstellen"` | Wizard-Schritt heißt „Geschafft!" — anderer Kontext |
| `flow.step4.sub` | `"Zum Schluss brauchen wir noch Ihren Zugang …"` | Kein manuelles Account-Formular mehr (CMM-14: Auto-Anlage) |
| `flow.step4.email_label` | `"E-Mail-Adresse"` | Kein E-Mail-Input im Account-Step |
| `flow.step4.email_placeholder` | `"max.mustermann@example.com"` | — |
| `flow.step4.email_exists_hint` | `"Diese E-Mail ist bereits …"` | — |
| `flow.step4.password_label` | `"Passwort"` | — |
| `flow.step4.password_hint` | `"Mindestens 8 Zeichen …"` | — |
| `flow.step4.password_confirm_label` | `"Passwort wiederholen"` | — |
| `flow.step4.agb_label` | `"Ich akzeptiere die Allgemeinen Geschäftsbedingungen."` | Wizard hat eigene SA-Checkbox mit anderem Wortlaut |
| `flow.step4.datenschutz_label` | `"Ich habe die Datenschutzerklärung gelesen und stimme zu."` | Im Wizard (step_summary) etwas anderer Wortlaut; PARTIAL-Match |
| `flow.step4.submit` | `"Account erstellen und Fall absenden"` | Kein Submit-Button im Account-Step |
| `flow.step4.submit_loading` | `"Account wird erstellt …"` | Wortlaut `"Wir richten Ihr Portal ein …"` — nicht identisch |
| `flow.step4.makler_intro` | `"Ihr Fall wird von {maklerName} betreut …"` | Kein Makler-Block im Wizard |
| `flow.step4.makler_explanation` | `"Wählen Sie, welche …"` | — |
| `flow.step4.consent_minimal_title` | `"Nur Statusmeldungen"` | — |
| `flow.step4.consent_minimal_desc` | — | — |
| `flow.step4.consent_full_title` | `"Volle Einsicht"` | — |
| `flow.step4.consent_full_desc` | — | — |
| `flow.step4.errors.*` (7 Keys) | E-Mail/Passwort-Validierungsfehler | Kein Account-Formular im Wizard |
| `flow.abort.*` (7 Keys) | Selbstverschulden-Abort-Screen | Kein Abort-Screen im Wizard |

**Schätzung Orphan Keys: ~120 von ~130 existierenden `flow.*`-Keys sind Orphans.**

---

## Dynamsiche Strings / ICU-Interpolation

Strings die Laufzeitwerte einbetten und daher ICU-Syntax (`{variable}`) brauchen:

| String im Wizard | Empfohlener next-intl-Key | ICU-Syntax |
|---|---|---|
| `` `Hallo ${editVorname \|\| 'dort'}!` `` | `flow.step_summary.heading` | `"Hallo {name}!"` — Fallback `'dort'` als Defaultwert im Code |
| `{gutachter.vorname}` im Avatar-Alt-Text | — | Kein i18n-String, nur Prop-Wert |
| `Treffpunkt: {gutachter.svTreffpunkt}` | `flow.step_gutachter.treffpunkt_label` | `"Treffpunkt: {treffpunkt}"` |
| Terminanzeige: `toLocaleDateString('de-DE', …)` + `toLocaleTimeString('de-DE', …)` | — | Kein String-Key; `next-intl` `useFormatter().dateTime()` mit `format: 'full'` nutzen |
| `` `${fahrzeug}${lead.kennzeichen ? ` (${lead.kennzeichen})` : ''}` `` | `flow.step_summary.labels.fahrzeug_mit_kz` | `"{fahrzeug} ({kennzeichen})"` — oder im Code bauen |
| `` `${lead.gegner_name}${lead.gegner_versicherung ? ` — ${lead.gegner_versicherung}` : ''}` `` | `flow.step_summary.labels.gegner_mit_vs` | `"{name} — {versicherung}"` — oder im Code bauen |
| `Wir haben Ihnen die Zugangsdaten an {email} gesendet.` | `flow.step_account.fallback_email_hint` | `"Wir haben Ihnen die Zugangsdaten an {email} gesendet."` |
| `step4.makler_intro` (Orphan) | `"Ihr Fall wird von {maklerName} betreut …"` | bereits ICU in de.json — aber Orphan |
| `step4.makler_explanation` (Orphan) | `"Wählen Sie, welche Informationen {maklerName} …"` | bereits ICU — aber Orphan |
| `step2a.min_hint` (Orphan) | `"Noch {count} Foto(s) bis zum nächsten Schritt"` | bereits ICU — aber Orphan |

---

## Strings die kein i18n-Key brauchen

| String | Grund |
|---|---|
| Dynamischer `{error}`-State (Server-Action-Fehler) | Laufzeitstring vom Server, nicht lokalisierbar ohne dediziertes Error-Code-System |
| `Claimondo GmbH` (Eigenname) | Eigenname |
| `LexDrive` (Eigenname) | Eigenname |
| `AGB` (als Link) | Ist Titel des Dokuments, nicht UI-String — kommt aus `legalDocs.agb.titel` |
| `Datenschutzerklärung` (als Link) | Kommt aus `legalDocs.datenschutz.titel` |
| `Uhr` (Suffix nach Uhrzeit) | Wird via `toLocaleTimeString('de-DE')` erzeugt, kein separater Key nötig |

---

## Zusammenfassung Zählungen

| Kategorie | Anzahl |
|---|---|
| User-visible strings total | ~68 |
| REUSE (exakter Match) | 2 (`flow.common.weiter`, `flow.common.zurueck`) |
| PARTIAL (ähnlicher Key, abweichender Wortlaut) | ~6 |
| NEW (kein passender Key) | ~60 |
| Orphan Keys (existieren, aber kein Wizard-String) | ~120 von ~130 |

---

## Empfehlung für die Implementierung

Da die `flow.*`-Keys für einen **anderen Wizard-Flow** (Foto-Upload + OCR + Voice + Account-Formular)
authored wurden und der aktuelle FlowWizardKfz eine **Post-CMM-14-Architektur** mit Auto-Account-Anlage
und Dispatch-Lead-Readonly-Daten darstellt, ist ein **Restrukturierung-Ansatz** nötig:

1. **`flow.common.*`** wiederverwenden (2 Keys: `weiter`, `zurueck`). `abbrechen`, `laden`, `speichern`
   bleiben verfügbar für spätere Steps.
2. **Neuen Namespace-Block** `flow.step_summary`, `flow.step_gutachter`, `flow.step_sa`,
   `flow.step_account` anlegen (40–50 neue Keys).
3. **Orphan-Keys behalten** (nicht löschen) bis der neue `/flow/[token]`-Wizard abgelöst ist —
   sie werden möglicherweise im neuen `/kunde/onboarding-details`-DynamicWizard wiederverwendet.
4. Den SA-Volltext (Popover-Body, §1–§5) als Block-String oder separate Rechts-Dokument-Quelle
   behandeln, nicht als Flat-Key-Array — das reduziert die Key-Anzahl erheblich.
