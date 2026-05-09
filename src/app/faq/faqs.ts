// Faq-Inhalte extrahiert für gleichzeitige Nutzung in:
// - FaqClient (UI mit Akkordeon)
// - page.tsx (Server-Component für JSON-LD FAQPage Schema)
//
// Princeton GEO Research: FAQPage Schema = +40% AI-Visibility.
// Statistik + Citations (BGH-Urteile, §249 BGB) = zusätzlicher GEO-Boost.

export type FaqEintrag = { frage: string; antwort: string }
export type FaqGruppe = { gruppe: string; fragen: FaqEintrag[] }

export const FAQ_GRUPPEN: FaqGruppe[] = [
  {
    gruppe: 'Kosten & wer zahlt was',
    fragen: [
      {
        frage: 'Was kostet Claimondo — wirklich?',
        antwort:
          'Für Sie als unverschuldet Betroffenen: 0 €. Gutachterhonorar, Anwaltskosten, Abschleppkosten — alles trägt die gegnerische Haftpflichtversicherung. Das ist gesetzlich verankert (§249 BGB). Claimondo finanziert sich ausschließlich aus diesen Positionen.',
      },
      {
        frage: 'Was verliere ich, wenn ich einfach "Geld nehme" ohne Gutachter?',
        antwort:
          'Im Schnitt 33 % Ihres Anspruchs. Ein reales Beispiel aus der Praxis: Gutachtenwert 11.900 € → nach Versicherer-Kürzungen bleiben nur 8.000 € übrig. Verloren gehen: Mehrwertsteuer (§249 Abs. 2 BGB), UPE-Aufschläge, Verbringungskosten, Beilackierung — und häufig die komplette Wertminderung. Dazu das HIS-Risiko: Wer ohne Reparaturrechnung kassiert und später wieder einen Schaden hat, riskiert die vollständige Ablehnung durch den Versicherer.',
      },
      {
        frage: 'Muss ich in Vorleistung gehen?',
        antwort:
          'Nein. Weder für das Gutachten noch für den Anwalt. Beides läuft direkt über die Gegenseite. Sie müssen nichts auslegen.',
      },
      {
        frage: 'Was, wenn die Versicherung die Kosten ablehnt?',
        antwort:
          'Unsere Partnerkanzlei schreibt zurück — mit den passenden BGH-Urteilen. Kürzt die Versicherung trotzdem, geht der Anwalt notfalls gerichtlich vor. Auch die Prozesskosten trägt bei Erfolg die Gegenseite. Bei tatsächlicher Mitschuld informieren wir Sie vorab und ehrlich.',
      },
    ],
  },
  {
    gruppe: 'Warum kürzt die Versicherung?',
    fragen: [
      {
        frage: 'Warum zahlt die Versicherung nie den vollen Gutachtenbetrag?',
        antwort:
          'Weil sie es kann — solange niemand widerspricht. Versicherer beauftragen ControlExpert, K-Expert oder DEKRA mit automatisierten Prüfberichten, die ohne Fahrzeugbesichtigung Positionen streichen. NDR-Reportage: Versicherungs-Gutachter 2.000 € → unabhängiges Gutachten nach Demontage: 9.000 €. BGH-Urteile stehen dagegen (VI ZR 65/18, VI ZR 174/24) — aber nur wer widerspricht, bekommt sein Recht.',
      },
      {
        frage: 'Was streichen Versicherungen am häufigsten?',
        antwort:
          '1. Stundenverrechnungssätze (Verweis auf billigere Werkstatt), 2. UPE-Aufschläge (trotz BGH VI ZR 65/18 erstattungsfähig), 3. Verbringungskosten (trotz BGH-Recht), 4. Beilackierungskosten (BGH VI ZR 174/24 aus 2025 gilt), 5. Sachverständigenkosten ("überhöht"), 6. Wertminderung (wird oft komplett ignoriert). Unser Anwalt kennt alle diese Positionen und fordert sie zurück.',
      },
      {
        frage: 'HUK, LVM, AXA — macht das einen Unterschied?',
        antwort:
          'Ja. HUK-COBURG erklärt Gutachten systematisch als "unbrauchbar" und verweigert SV-Kosten. LVM geht gegen KI-gestützte Gutachten vor. AXA nutzt überregionale Restwertbörsen um den Restwert hochzurechnen (dagegen: BGH VI ZR 119/04 — regionaler Markt gilt). Unser Anwalt kennt die versicherungsspezifischen Taktiken und reagiert entsprechend.',
      },
    ],
  },
  {
    gruppe: 'Gutachter & Werkstatt',
    fragen: [
      {
        frage: 'Warum brauche ich einen unabhängigen Gutachter?',
        antwort:
          'Ein Versicherungs-Gutachter arbeitet für die Versicherung. Ein Beispiel: Opel Karl, von außen nur Kratzer sichtbar — nach Demontage: Rahmenlängsträger verschoben, Totalschaden. 7.000 € wären ohne unabhängiges Gutachten einfach verloren gegangen. Nur ein unabhängiger Gutachter berechnet auch Wertminderung — eine Werkstatt macht das nicht.',
      },
      {
        frage: 'Ich habe ein Tesla oder E-Auto. Gibt es Besonderheiten?',
        antwort:
          'Ja — und die sind erheblich. Standardprogramme (DAT/Audatex) enthalten oft keine korrekten Verbundzeiten für US-Fahrzeuge. Reales Beispiel: Deutsches Standard-Gutachten 22.000 € → mit Tesla-Originaldaten: 48.000 €. Steuergeräte unter Schwellerblenden werden oft erst Monate später zum Problem. Bei Tesla und E-Autos: immer Spezialgutachter.',
      },
      {
        frage: 'Was ist die 130%-Regel?',
        antwort:
          'Wenn die Reparaturkosten den Wiederbeschaffungswert um maximal 30% überschreiten, können Sie Ihr Fahrzeug trotzdem reparieren lassen. Beispiel: WBW 10.000 € → Reparatur bis 13.000 € möglich. Bedingung: fachgerechte Reparatur nach Gutachten, Fahrzeug 6 Monate weiter genutzt. BGH VI ZR 67/91.',
      },
      {
        frage: 'Was ist das Werkstattrisiko und was bringt es mir?',
        antwort:
          'BGH-Urteile vom 16.01.2024 (VI ZR 38/22 u.a.): Wenn Ihre Werkstatt teurer wird als kalkuliert oder Arbeiten nicht ordnungsgemäß ausführt, trägt die gegnerische Versicherung das Risiko — nicht Sie. Sie müssen Reparaturkosten nicht selbst prüfen. Ein weiterer Grund, warum ein unabhängiges Gutachten und ein Anwalt schützen.',
      },
    ],
  },
  {
    gruppe: 'Wertminderung & Nutzungsausfall',
    fragen: [
      {
        frage: 'Was ist Wertminderung und bekomme ich die immer?',
        antwort:
          'Auch nach perfekter Reparatur sinkt der Marktwert eines Unfallfahrzeugs — und diese Differenz muss die Gegenseite zahlen. Faustregel: 1. Jahr = 25% der Reparaturkosten, 2. Jahr = 20%, 3. Jahr = 15%, 4. Jahr = 10%. Keine starre Altersgrenze (BGH VI ZR 357/03) — OLG Oldenburg anerkannte Wertminderung sogar bei 200.000 km. Nur ein Gutachter berechnet sie, eine Werkstatt nicht.',
      },
      {
        frage: 'Mietwagen oder Nutzungsausfall — was ist besser für mich?',
        antwort:
          'Hängt von Ihrer Situation ab. Pendler, die täglich auf das Auto angewiesen sind: Mietwagen. Zweitwagen vorhanden oder unklare Schuldfrage: Nutzungsausfall (Sanden/Danner-Tabelle, Gruppe A bis L, ~23 € bis 175 € pro Tag). Bei langer Reparaturdauer ist Nutzungsausfall oft günstiger. Wir beraten Sie dazu konkret.',
      },
    ],
  },
  {
    gruppe: 'Typische Fehler nach dem Unfall',
    fragen: [
      {
        frage: 'Was sind die häufigsten Fehler nach einem Unfall?',
        antwort:
          '1. Sich auf das "Schadenmanagement" der gegnerischen Versicherung einlassen. 2. Deren Gutachter akzeptieren. 3. Voreilig Abfindungserklärungen unterschreiben — damit erlöschen ALLE zukünftigen Ansprüche (auch Spätfolgen). 4. Sich auf "Da ist nichts dran" verlassen (Polizisten sind keine Techniker). 5. Ohne Gutachten reparieren — Wertminderung verloren. 6. Videobeweise nicht sichern — Überschreibungsfrist liegt oft bei 3–4 Wochen.',
      },
      {
        frage: 'Die Versicherung sagt mir: "Wir kümmern uns um alles." Was bedeutet das?',
        antwort:
          'Schadensteuerung. Die Versicherung schickt Ihnen ihren Gutachter, verweist auf eine Partnerwerkstatt und spart damit erheblich. Ihre Antwort: "Vielen Dank, aber ich nehme meinen Recht auf einen unabhängigen Sachverständigen und Fachanwalt meiner Wahl wahr." Genau dafür ist Claimondo da.',
      },
      {
        frage: 'Ich habe Personenschäden. Was ist zu beachten?',
        antwort:
          'Sofort zum Arzt — auch wenn Sie sich "eigentlich gut fühlen". HWS-Verletzungen zeigen sich oft verzögert. MdE (Minderung der Erwerbsfähigkeit) dokumentieren lassen. Unterschreiben Sie keine Abfindungserklärung — damit erlöschen alle Ansprüche auf Spätfolgen. Schmerzensgeld: HWS-Verletzung 200 – 70.000 €, Armfrakturen 1.600 – 65.000 €.',
      },
      {
        frage: 'Was bei Fahrerflucht?',
        antwort:
          'Die Verkehrsopferhilfe e.V. (VOH) springt ein — aber KFZ-Sachschäden werden leider NICHT ersetzt, dafür brauchen Sie eine Vollkasko. Schmerzensgeld gibt es nur bei "besonders schwerer Verletzung". Verjährungsfrist: 3 Jahre. Wichtig: Videobeweise von Tankstellen, Parkplätzen etc. sofort sichern, Dashcam-Material aufheben.',
      },
    ],
  },
  {
    gruppe: 'Ablauf & Zeitrahmen',
    fragen: [
      {
        frage: 'Wie schnell bekomme ich einen Termin mit dem Gutachter?',
        antwort:
          'Bei Claimondo in der Regel unter 48 Stunden, bei Akutschäden auch am gleichen Tag möglich. Der Sachverständige kommt zu Ihnen — Werkstatt, Wohnort oder Arbeitsplatz, je nachdem was Ihnen passt. Sie müssen das Fahrzeug nicht selbst irgendwohin bringen. Bei großen Schäden (Totalschaden, Verbringung notwendig) kann der Termin länger dauern, aber wir koordinieren auch das.',
      },
      {
        frage: 'Wie lange dauert das Gutachten selbst?',
        antwort:
          'Die Vor-Ort-Besichtigung dauert je nach Schadenumfang 30–90 Minuten. Der schriftliche Gutachten-Bericht liegt bei Standard-Schäden innerhalb von 48 Stunden vor, bei Tesla/E-Fahrzeugen oder Totalschäden mit Demontage 3–5 Werktage. Ohne Bericht kann der Anwalt nicht regulieren — Tempo ist hier kritisch und genau deshalb arbeiten wir mit DAT-Expert-zertifizierten SVs.',
      },
      {
        frage: 'Wann bekomme ich mein Geld?',
        antwort:
          'Die Reparaturkosten zahlt die Versicherung in der Regel 4–8 Wochen nach Gutachten-Eingang. Wertminderung, Mietwagen und Nutzungsausfall folgen meist innerhalb derselben Frist. Bei Verzögerung oder Kürzung schreibt unser Anwalt — kürzt die Versicherung trotzdem, Klage. Bundesweiter Durchschnitt: 6–8 Wochen vom Unfall bis zur vollständigen Auszahlung.',
      },
      {
        frage: 'Muss ich mein Auto vor der Begutachtung waschen oder reparieren?',
        antwort:
          'Nein — im Gegenteil. Lassen Sie das Fahrzeug genau im Zustand wie nach dem Unfall. Schmutz, Glassplitter, hängende Teile sind alles Beweise für den Schaden. Auch nicht selbst Demontage versuchen — manche Schäden zeigen sich erst beim Öffnen durch den Gutachter (z.B. Rahmenlängsträger, Steuergeräte).',
      },
    ],
  },
  {
    gruppe: 'Sachverständige & Zertifizierung',
    fragen: [
      {
        frage: 'Was ist DAT-Expert und warum ist das wichtig?',
        antwort:
          'DAT (Deutsche Automobil Treuhand) ist die führende deutsche Bewertungs-Datenbank für Fahrzeuge. DAT-Expert-Zertifizierte Sachverständige nutzen das DAT-Kalkulationssystem — Versicherungen akzeptieren diese Gutachten ohne Diskussion über die zugrundeliegenden Daten. Andere Programme (z.B. Audatex) sind ebenfalls anerkannt, DAT ist aber Marktführer und unsere Standard-Wahl.',
      },
      {
        frage: 'Was unterscheidet einen Claimondo-Gutachter von einer DEKRA?',
        antwort:
          'DEKRA und TÜV sind klassische Prüforganisationen — sie machen v.a. HU/AU. Unfall-Gutachten machen sie auch, aber DEKRA wird oft von Versicherungen direkt beauftragt und ist dadurch nicht unabhängig. Unsere Partner sind freiberufliche, DAT-zertifizierte SVs, die nur für den Geschädigten arbeiten — keine Versicherungs-Mandate parallel.',
      },
      {
        frage: 'Können Sie auch bei Tesla, Polestar oder anderen E-Autos helfen?',
        antwort:
          'Ja, aber Tesla- und E-Fahrzeug-Gutachten brauchen Spezial-Know-how. Wir routen solche Fälle gezielt an Sachverständige mit Tesla-/Polestar-Diagnose-Zugang. Wichtig: bei Tesla NICHT das Standard-DAT-Kalkulationsschema akzeptieren — die Verbundzeiten und Original-Teile-Preise müssen über Tesla Service Plus gerechnet werden, sonst entgehen Ihnen 20.000 € und mehr.',
      },
      {
        frage: 'Mein Auto ist älter als 10 Jahre — bekomme ich noch ein Gutachten?',
        antwort:
          'Ja. Auch ältere Fahrzeuge haben Restwert, oft mehr als der Werkstatt-Eindruck vermuten lässt. Bei Oldtimern (über 30 Jahre) kommt zusätzlich der Sammlerwert ins Spiel — den berechnen Standard-Gutachter oft falsch. Wir vermitteln in solchen Fällen Spezial-SVs mit Oldtimer-Erfahrung. BGH-Linie: keine starre Altersgrenze für Wertminderung (VI ZR 357/03).',
      },
    ],
  },
  {
    gruppe: 'Anwalt & Rechtsweg',
    fragen: [
      {
        frage: 'Brauche ich wirklich einen Anwalt? Geht das nicht direkt mit der Versicherung?',
        antwort:
          'Sie können direkt mit der Versicherung reden — verlieren dabei aber im Schnitt 33% Ihres Anspruchs. Versicherungen kürzen Wertminderung, UPE-Aufschläge, Verbringungskosten und mehr. Ein Anwalt kennt diese Taktiken. Da die Anwaltskosten bei Fremdverschulden vollständig die Gegenseite trägt, ist die Rechnung einfach: 0 € Risiko, 33% mehr Auszahlung. Ein Anwalt lohnt sich praktisch immer.',
      },
      {
        frage: 'Was kostet mich der Anwalt?',
        antwort:
          'Bei Fremdverschulden 0 €. Die Anwaltskosten sind Bestandteil des Schadens nach §249 BGB und werden vollständig von der gegnerischen Haftpflichtversicherung übernommen — RVG-Gebühren in voller Höhe. Auch bei Klage trägt die Gegenseite Gerichts- und Anwaltskosten bei Erfolg. Bei Mitschuld werden die Kosten anteilig aufgeteilt — wir informieren Sie vorab und ehrlich.',
      },
      {
        frage: 'Was ist eine Sicherungsabtretung — und ist sie sicher?',
        antwort:
          'Bei der Sicherungsabtretung (§164 BGB) treten Sie Ihren Anspruch gegen die Versicherung in Höhe des Gutachterhonorars an den Sachverständigen ab. Sie unterzeichnen einmal — der Gutachter rechnet danach direkt mit der Versicherung ab. Sie haben kein Insolvenzrisiko, kein Vorleistungsrisiko. Standardpraxis in der gesamten Branche, BGH-bestätigt.',
      },
      {
        frage: 'Wie lange habe ich Zeit, Ansprüche geltend zu machen?',
        antwort:
          'Verjährung der Schadensersatz-Ansprüche aus Verkehrsunfällen: 3 Jahre (§195 BGB), Beginn ab Kenntnis des Schadens. Schmerzensgeld bei Spätfolgen kann später nachgefordert werden. Wichtig: nichts unterschreiben, was als "Abfindung" oder "Generalvergleich" deklariert ist — damit erlöschen ALLE Ansprüche, auch die unbekannten Spätfolgen. Im Zweifel: erst zu uns, dann unterschreiben.',
      },
    ],
  },
  {
    gruppe: 'Datenschutz & Sicherheit',
    fragen: [
      {
        frage: 'Was passiert mit meinen Daten?',
        antwort:
          'Alle Daten werden DSGVO-konform in Deutschland verarbeitet (Server in Frankfurt, Supabase EU). Weitergabe nur an: zuständigen Sachverständigen (für die Begutachtung), Partner-Anwaltskanzlei (für die Regulierung) und gegnerische Versicherung (für die Auszahlung). Keine Werbe-Datenweitergabe, keine Verkäufe an Dritte. Volle Auskunft + Löschung jederzeit per E-Mail an datenschutz@claimondo.de.',
      },
      {
        frage: 'Sind Fotos und Dokumente sicher hochgeladen?',
        antwort:
          'Ja — verschlüsselte HTTPS-Verbindung, Speicherung in Supabase Storage mit Row-Level-Security. Nur der zuständige Sachverständige + Anwalt + Sie selbst sehen die Dokumente. Polizeiprotokolle, Personalausweis-Kopien und Zulassungsbescheinigung bleiben in dem geschützten Fall — nichts wird öffentlich oder an unbefugte Dritte weitergegeben.',
      },
      {
        frage: 'Werde ich in der HIS-Datei (Hinweis- und Informationssystem der Versicherer) gespeichert?',
        antwort:
          'Bei einem unverschuldeten Unfall: nein — dort werden nur Geschädigte gespeichert, die selbst eine Versicherungsleistung beantragen. Sie machen aber Schadenersatz gegen den Verursacher geltend, das ist nicht HIS-relevant. Anders wenn Sie ohne Reparatur fiktiv abrechnen und später wieder Schaden haben — dann kann HIS Ihre Auszahlung blockieren. Reparieren Sie also lieber tatsächlich.',
      },
    ],
  },
  {
    gruppe: 'Spezielle Schadenfälle',
    fragen: [
      {
        frage: 'Mein Fahrzeug ist Totalschaden — was jetzt?',
        antwort:
          'Bei Totalschaden bekommen Sie den Wiederbeschaffungswert minus Restwert. Der Restwert wird auf dem regionalen Markt ermittelt (BGH VI ZR 119/04, NICHT Restwertbörse 200 km weit weg). Die 130%-Regel: Wenn Reparatur bis 30% über Wiederbeschaffungswert kostet, dürfen Sie trotzdem reparieren lassen — Voraussetzung: fachgerechte Reparatur + Fahrzeug 6 Monate weitergenutzt. Praktisches Beispiel: WBW 8.000 € → Reparatur bis 10.400 € möglich.',
      },
      {
        frage: 'Was ist mit Mietwagen während der Reparatur?',
        antwort:
          'Anspruch auf gleichwertigen Mietwagen für die gesamte Reparaturdauer (BGH-Linie: Klassentiefer ist OK gegen Eigenanteil-Erstattung). Alternativ: Nutzungsausfall-Pauschale nach Sanden/Danner-Tabelle (Gruppe A bis L, ca. 23 € bis 175 €/Tag). Bei Pendlern fast immer Mietwagen sinnvoller. Wir beraten zur konkreten Situation — Versicherer kürzen hier oft auf "vergleichbare Klasse" was nicht immer gerechtfertigt ist.',
      },
      {
        frage: 'Ich habe einen Schaden mit einem Firmenfahrzeug. Geht das auch?',
        antwort:
          'Ja. Die Schadensregulierung läuft analog — Halter ist die Firma, Vollmacht der Geschäftsführung erforderlich. Wichtig: Vorsteuerabzugsberechtigte Firmen rechnen NETTO ab (kein MwSt-Anspruch nach §249 Abs. 2 BGB). Privatpersonen rechnen brutto. Nutzungsausfall ist auch für Firmenfahrzeuge möglich — die Sanden/Danner-Sätze gelten gleichermaßen.',
      },
      {
        frage: 'Was wenn die Schuldfrage unklar ist?',
        antwort:
          'Bei unklarer Schuldfrage prüfen wir die Beweislage — Polizeibericht, Zeugen, Dashcam, Verkehrsskizze. Bei 50:50-Quotelung trägt jede Seite 50% des eigenen Schadens. Häufige Konstellation: Auffahrunfall ist meist 100:0 (Auffahrender haftet voll), Spurwechsel mit Gegenverkehr oft 70:30. Wir geben eine ehrliche Einschätzung — keine Versprechen, die wir nicht halten.',
      },
    ],
  },
]
