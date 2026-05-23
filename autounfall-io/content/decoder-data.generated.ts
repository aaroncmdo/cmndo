import type { Decoder } from '@/lib/decoder-types'

// AUTO-GENERIERT (WP-3) aus decoder_content.py via scripts/port-decoders.py.
// HTML-Felder = kontrollierter Content (dangerouslySetInnerHTML), hrefs umgeschrieben.

export const decoders: Decoder[] = [
  {
    "slug": "130-prozent-verweigert",
    "cluster": "Wertminderung & Co.",
    "crumbLast": "130-%-Reparatur verweigert",
    "title": "Reparatur trotz Totalschaden — 130-%-Regel verweigert",
    "headline": "„Wirtschaftlicher Totalschaden“ — wenn die 130-%-Reparatur verweigert wird",
    "metaDesc": "Die Versicherung will abrechnen statt reparieren? Bis 130 % des Wiederbeschaffungswerts dürfen Sie reparieren und Ihr Auto behalten. Die Voraussetzungen.",
    "h1": "„Wirtschaftlicher Totalschaden — wir rechnen ab“ — die 130-%-Regel",
    "lede": "Sie wollen Ihr Auto behalten und reparieren, die Versicherung will nur den Restwert zahlen. Der Integritätszuschlag gibt Ihnen Spielraum.",
    "tldr": "Liegen die Reparaturkosten bis zu <strong>130 % des Wiederbeschaffungswerts</strong>, dürfen Sie reparieren und Ihr Fahrzeug behalten (Integritätszuschlag) — statt Sie auf die Totalschaden-Abrechnung verweisen zu lassen. Voraussetzung: <strong>fachgerechte Reparatur</strong> nach Gutachten und <strong>Weiternutzung mind. 6 Monate</strong>. Pauschale Verweigerung ist angreifbar.",
    "brief": "„Da die Reparatur unwirtschaftlich ist, rechnen wir auf Totalschadenbasis ab.“ — obwohl Sie unter 130 % liegen.",
    "sections": [
      {
        "h2": "Der Integritätszuschlag",
        "html": "<p>Die Rechtsprechung erkennt Ihr Interesse an, das vertraute Fahrzeug zu behalten. Deshalb dürfen Sie bis zu 130 % des Wiederbeschaffungswerts reparieren lassen, auch wenn das über dem reinen Wiederbeschaffungsaufwand liegt. Über 130 % ist Schluss — dann gilt die Totalschaden-Abrechnung.</p>"
      },
      {
        "h2": "Die Voraussetzungen",
        "html": "<p>Zwei Bedingungen müssen erfüllt sein: Die Reparatur erfolgt <strong>fachgerecht und vollständig nach Gutachten</strong> (keine Billig-Teilreparatur), und Sie <strong>nutzt das Fahrzeug mindestens sechs Monate weiter</strong>. Sind beide erfüllt, kann die Versicherung Sie nicht auf die Abrechnung verweisen.</p>"
      }
    ],
    "table": {
      "cols": [
        "Reparaturkosten",
        "Folge"
      ],
      "rows": [
        [
          "bis 100 % WBW",
          "normal reparieren"
        ],
        [
          "100–130 % WBW",
          "Reparatur mit Integritätszuschlag möglich"
        ],
        [
          "über 130 % WBW",
          "Totalschaden-Abrechnung"
        ]
      ]
    },
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-totalschaden-130-prozent-regel.html",
          "label": "130-%-Regel im Detail"
        },
        {
          "href": "ARTICLE-wbw-130-prozent-grenze.html",
          "label": "WBW & 130-%-Grenze"
        }
      ]
    },
    "cta": {
      "h": "130-%-Fall prüfen lassen",
      "p": "Der Totalschaden-Rechner zeigt, ob Sie unter 130 % liegen; ein Gutachten sichert die Basis.",
      "ctas": [
        "lex",
        "gutachter"
      ]
    },
    "faq": [
      {
        "q": "Darf ich immer bis 130 % reparieren?",
        "a": "Ja, sofern die Reparatur fachgerecht nach Gutachten erfolgt und Sie das Fahrzeug mindestens sechs Monate weiternutzt."
      },
      {
        "q": "Was passiert über 130 %?",
        "a": "Dann ist nur die Totalschaden-Abrechnung möglich: Wiederbeschaffungswert minus Restwert."
      },
      {
        "q": "Reicht eine Teilreparatur?",
        "a": "Nein. Für den Integritätszuschlag muss fachgerecht und vollständig nach Gutachten repariert werden."
      }
    ],
    "about": [
      "130-Prozent-Regel",
      "Integritätszuschlag",
      "Totalschaden",
      "§249 BGB"
    ],
    "sources": "§249 BGB; BGH-Rechtsprechung zum Integritätszuschlag (130-%-Grenze) — gesetze-im-internet.de."
  },
  {
    "slug": "controlexpert-kuerzung",
    "cluster": "Gutachter aufdrängen",
    "crumbLast": "Prüfbericht hat gekürzt",
    "title": "ControlExpert / Prüfdienst hat gekürzt — was tun?",
    "headline": "Ein Prüfdienst hat Ihre Rechnung gekürzt — was dahintersteckt",
    "metaDesc": "ControlExpert & Co. prüfen im Auftrag der Versicherung und kürzen Gutachten oder Rechnung. Warum die Kürzung oft angreifbar ist und wie Sie reagieren.",
    "h1": "„Nach Prüfung durch unseren Dienstleister …“ — die Prüfbericht-Kürzung",
    "lede": "Plötzlich liegt ein „Prüfbericht“ vor, der Ihr Gutachten oder Ihre Werkstattrechnung kleinrechnet. Das ist kein neutrales Gegengutachten.",
    "tldr": "Prüfdienste wie ControlExpert arbeiten <strong>im Auftrag der Versicherung</strong> und kürzen typischerweise Stundensätze, UPE-Aufschläge, Verbringung oder Verrechnungssätze. Maßgeblich ist aber Ihr <strong>qualifiziertes Gutachten</strong>, nicht der Prüfbericht. Bei konkreter Reparatur greift zudem das <strong>Werkstattrisiko</strong> (BGH VI ZR 38/22 ff.) — viele Kürzungen sind angreifbar.",
    "brief": "„Nach Prüfung durch unseren Sachverständigendienst ergeben sich folgende Korrekturen … Wir regulieren auf dieser Basis.“",
    "sections": [
      {
        "h2": "Was ein Prüfbericht ist — und was nicht",
        "html": "<p>Ein Prüfbericht ist eine Schreibtisch-Bewertung im Auftrag der Versicherung, oft ohne eigene Besichtigung. Er ersetzt kein qualifiziertes Schadengutachten. Gekürzt werden gern dieselben Posten: Verrechnungssätze, UPE-Aufschläge, Verbringungskosten, Nutzungsausfalldauer.</p>"
      },
      {
        "h2": "Warum die Kürzung oft nicht hält",
        "html": "<p>Haben Sie fachgerecht reparieren lassen, trägt die Versicherung das <strong>Werkstattrisiko</strong>: Mehrkosten, die Sie als Laie nicht erkennen konnten, gehen nicht zu Ihren Lasten (BGH VI ZR 38/22 ff.). Und bei konkreter Abrechnung sind UPE-Aufschläge und Verbringung erstattungsfähig, soweit sie regional anfallen. Der Prüfbericht ist damit häufig nur ein Verhandlungs-Einstieg.</p>"
      }
    ],
    "muster": {
      "h2": "Musterbrief: Prüfbericht-Kürzung zurückweisen (zum Kopieren)",
      "intro": "Wenn die Regulierung allein auf einem Prüfbericht beruht.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] kürzen Sie unter Verweis auf einen Prüfbericht. Maßgeblich ist mein qualifiziertes Gutachten bzw. die tatsächlich angefallene Reparaturrechnung.<br><br>Ich fordere die <strong>vollständige Regulierung gemäß Gutachten/Rechnung binnen 14 Tagen</strong>. Bei fachgerechter Reparatur trägt die Versicherung das Werkstattrisiko (BGH VI ZR 38/22 ff.).<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Passende Detail-Artikel:",
      "links": [
        {
          "href": "ARTICLE-controlexpert-versicherer-pruefdienst.html",
          "label": "ControlExpert erklärt"
        },
        {
          "href": "ARTICLE-werkstattrisiko-bgh-2024.html",
          "label": "Werkstattrisiko (BGH)"
        }
      ]
    },
    "cta": {
      "h": "Prüfbericht-Kürzung anfechten",
      "p": "Der Kürzungs-Checker zeigt, welche Posten Sie zurückholen können — bei Bedarf vermitteln wir Gutachter und Kanzlei.",
      "ctas": [
        "lex",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Ist ein Prüfbericht ein Gegengutachten?",
        "a": "Nein. Er ist eine Bewertung im Auftrag der Versicherung, meist ohne eigene Besichtigung, und ersetzt kein qualifiziertes Schadengutachten."
      },
      {
        "q": "Was ist das Werkstattrisiko?",
        "a": "Mehrkosten der Reparatur, die Sie als Laie nicht erkennen oder beeinflussen konnten, gehen zulasten der Versicherung (BGH VI ZR 38/22 ff.), nicht zu Ihren."
      },
      {
        "q": "Lohnt sich Widerspruch bei kleinen Kürzungen?",
        "a": "Häufig ja — die Summen aus Verbringung, UPE und Verrechnungssätzen addieren sich. Der Kürzungs-Checker gibt eine schnelle Einordnung."
      }
    ],
    "about": [
      "Prüfdienst",
      "ControlExpert",
      "Werkstattrisiko",
      "BGH VI ZR 38/22 ff.",
      "§249 BGB"
    ],
    "sources": "§249 BGB; BGH VI ZR 38/22 ff. (Werkstattrisiko) — gesetze-im-internet.de, bundesgerichtshof.de."
  },
  {
    "slug": "eigenen-gutachter-schicken",
    "cluster": "Gutachter aufdrängen",
    "crumbLast": "Wir schicken einen Gutachter",
    "title": "„Wir schicken Ihnen einen Gutachter“ — müssen Sie das zulassen?",
    "headline": "Wir schicken Ihnen einen Gutachter — warum das nicht Ihr Gutachter ist",
    "metaDesc": "Die gegnerische Versicherung will einen eigenen Gutachter schicken? Sie haben bei Fremdverschulden das Recht auf einen unabhängigen Sachverständigen Ihrer Wahl.",
    "h1": "„Wir beauftragen einen Gutachter für Sie“ — Ihr Wahlrecht",
    "lede": "Klingt nach Service, ist aber Steuerung: Wer den Gutachter stellt, bestimmt die Zahlen. Bei Fremdverschulden wählen Sie selbst.",
    "tldr": "Der von der Gegenseite geschickte Gutachter arbeitet im Auftrag der Versicherung — nicht für Sie. Bei unverschuldetem Unfall haben Sie das <strong>Recht auf einen unabhängigen Sachverständigen Ihrer Wahl</strong>; die Kosten trägt die gegnerische Haftpflicht nach §249 BGB. Sie müssen den VS-Gutachter <strong>nicht</strong> akzeptieren.",
    "brief": "„Zur Schadenfeststellung beauftragen wir einen Sachverständigen. Bitte vereinbaren Sie einen Besichtigungstermin.“",
    "sections": [
      {
        "h2": "Wer zahlt, bestimmt die Richtung",
        "html": "<p>Ein von der Versicherung beauftragter Gutachter ist nicht neutral aufgestellt — er wird von der Partei bezahlt, die möglichst wenig zahlen will. Tendenziell fallen Schadenhöhe, Wertminderung und Reparaturweg dann zu Ihren Ungunsten aus. Das ist legal, aber eben nicht in Ihrem Interesse.</p>"
      },
      {
        "h2": "Ihr Wahlrecht bei Fremdverschulden",
        "html": "<p>Bei klarer Haftung der Gegenseite dürfen Sie einen <strong>eigenen, unabhängigen Sachverständigen</strong> beauftragen. Die Kosten gehören zum erstattungsfähigen Schaden (§249 BGB) und werden von der gegnerischen Haftpflicht übernommen — nur bei reinen Bagatellschäden (etwa unter ~750 €) gilt das nicht. Sie müssen dem VS-Gutachter keinen Termin geben, bevor Sie das geklärt haben.</p>"
      }
    ],
    "table": {
      "cols": [
        "Gutachter",
        "Im Auftrag von"
      ],
      "rows": [
        [
          "VS-Gutachter / Prüfdienst",
          "der gegnerischen Versicherung"
        ],
        [
          "Ihr Gutachter",
          "Ihnen — unabhängig, BVSK-orientiert"
        ],
        [
          "Kostenträger (Fremdverschulden)",
          "gegnerische Haftpflicht (§249 BGB)"
        ]
      ]
    },
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-gutachter-versicherungs-pruefdienst.html",
          "label": "VS-Prüfdienst vs. eigener Gutachter"
        },
        {
          "href": "ARTICLE-gutachter-wer-beauftragt.html",
          "label": "Wer beauftragt den Gutachter?"
        }
      ]
    },
    "cta": {
      "h": "Eigenen Gutachter statt VS-Gutachter",
      "p": "Wir vermitteln einen unabhängigen, BVSK-orientierten Sachverständigen — bei Fremdverschulden kostenfrei für Sie.",
      "ctas": [
        "gutachter",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Muss ich den Gutachter der Versicherung akzeptieren?",
        "a": "Bei Fremdverschulden nein. Sie haben das Recht auf einen eigenen unabhängigen Sachverständigen; dessen Kosten trägt die gegnerische Haftpflicht."
      },
      {
        "q": "Was, wenn der VS-Gutachter schon da war?",
        "a": "Sie können trotzdem einen eigenen Gutachter beauftragen. Sein Gutachten ist die Grundlage, um Abweichungen des VS-Gutachtens anzugreifen."
      },
      {
        "q": "Gilt das auch bei Teilschuld?",
        "a": "Dann werden die Kosten anteilig nach der Haftungsquote getragen. Ein eigenes Gutachten bleibt trotzdem sinnvoll."
      }
    ],
    "about": [
      "Sachverständigen-Wahlrecht",
      "§249 BGB",
      "Kfz-Gutachten",
      "Schadensregulierung"
    ],
    "sources": "§249 BGB; BGH zur Erstattungsfähigkeit der Sachverständigenkosten — gesetze-im-internet.de."
  },
  {
    "slug": "gutachten-nicht-noetig",
    "cluster": "Gutachter aufdrängen",
    "crumbLast": "Gutachten nicht nötig",
    "title": "„Ein Gutachten ist nicht nötig“ — sagt die Versicherung. Stimmt das?",
    "headline": "Ein Gutachten ist nicht nötig — warum das die Versicherung gern sagt",
    "metaDesc": "Die Versicherung rät vom Gutachten ab? Über der Bagatellgrenze haben Sie bei Fremdverschulden das Recht darauf — und es schützt vor Kürzungen.",
    "h1": "„Ein Gutachten ist nicht erforderlich“ — der Rat, der der Versicherung nützt",
    "lede": "Wer abrät, hat ein Interesse. Ohne unabhängiges Gutachten bestimmt die Versicherung die Zahlen — und das ist genau der Punkt.",
    "tldr": "„Nicht nötig“ heißt aus VS-Sicht: <strong>keine unabhängige Beweisgrundlage</strong>, die später gegen eine Kürzung steht. Bei Fremdverschulden über der Bagatellgrenze ist ein Gutachten Ihr Recht und erstattungsfähig (§249 BGB). Es dokumentiert Wertminderung, Reparaturweg und verdeckte Schäden — und macht spätere Kürzungen angreifbar.",
    "brief": "„Bei diesem überschaubaren Schaden ist ein Gutachten aus unserer Sicht nicht erforderlich. Wir regulieren auch so zügig.“",
    "sections": [
      {
        "h2": "Warum die Empfehlung interessengeleitet ist",
        "html": "<p>Ohne Gutachten gibt es keine neutrale Dokumentation des Schadens. Die Versicherung kann dann Höhe, Wertminderung und Reparaturweg selbst bestimmen — und nach unten korrigieren, ohne dass Sie etwas dagegenhalten können. „Nicht erforderlich“ schützt vor allem die Auszahlungssumme der Gegenseite.</p>"
      },
      {
        "h2": "Was das Gutachten Ihnen sichert",
        "html": "<p>Ein unabhängiges Gutachten ist Ihre Beweisgrundlage: Es hält den Zustand fest, beziffert die Wertminderung und deckt verdeckte Schäden auf. Kürzt die Versicherung später, haben Sie eine belastbare Basis — und bei klarer Haftung trägt sie die Gutachterkosten ohnehin.</p>"
      }
    ],
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-gutachter-lohnt-sich.html",
          "label": "Wann sich ein Gutachter lohnt"
        },
        {
          "href": "ARTICLE-bagatellschaden.html",
          "label": "Bagatellschaden — die Grenze"
        }
      ]
    },
    "cta": {
      "h": "Beweisgrundlage sichern",
      "p": "Wir vermitteln Ihnen einen unabhängigen Gutachter — bevor die Versicherung die Zahlen allein bestimmt.",
      "ctas": [
        "gutachter",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Wann ist ein Gutachten wirklich verzichtbar?",
        "a": "Nur bei echten Bagatellschäden unter rund 750 €. Darüber ist es die sichere Grundlage gegen Kürzungen."
      },
      {
        "q": "Schadet ein Gutachten der zügigen Regulierung?",
        "a": "Nein. Ein unabhängiger Gutachter ist meist binnen weniger Tage vor Ort; die Regulierung wird dadurch belastbarer, nicht langsamer."
      },
      {
        "q": "Was, wenn ich schon zugestimmt habe?",
        "a": "Solange keine Abfindungserklärung unterschrieben ist, können Sie in der Regel noch ein Gutachten beauftragen und nachfordern."
      }
    ],
    "about": [
      "Kfz-Gutachten",
      "Beweissicherung",
      "§249 BGB",
      "Schadensregulierung"
    ],
    "sources": "§249 BGB; Bagatellgrenze nach BGH-Rechtsprechung — gesetze-im-internet.de."
  },
  {
    "slug": "hws-nicht-anerkannt",
    "cluster": "Wertminderung & Co.",
    "crumbLast": "HWS nicht anerkannt",
    "title": "HWS / Schleudertrauma nicht anerkannt — was gilt?",
    "headline": "HWS-Schleudertrauma nicht anerkannt — die „Harmlosigkeitsgrenze“ gibt es nicht",
    "metaDesc": "Die Versicherung erkennt das Schleudertrauma wegen geringer Kollisionsgeschwindigkeit nicht an? Eine starre Harmlosigkeitsgrenze lehnt der BGH ab.",
    "h1": "„Bei der geringen Aufprallgeschwindigkeit ist eine HWS-Verletzung ausgeschlossen“ — so nicht",
    "lede": "Das Standard-Argument gegen Schleudertraumata: zu langsam, also keine Verletzung. Eine feste Grenze dafür gibt es rechtlich nicht.",
    "tldr": "Die Versicherung beruft sich gern auf eine <strong>„Harmlosigkeitsgrenze“</strong> (z. B. unter 10 km/h keine HWS-Verletzung). Eine solche starre Grenze hat der <strong>BGH abgelehnt</strong> (VI ZR 139/02): Entscheidend ist der <strong>Einzelfall</strong> mit ärztlicher Dokumentation, nicht allein die Kollisionsgeschwindigkeit. Zeitnahe Diagnose und lückenlose Befunde sind der Schlüssel.",
    "brief": "„Aufgrund der geringen kollisionsbedingten Geschwindigkeitsänderung ist eine unfallbedingte HWS-Verletzung auszuschließen.“",
    "sections": [
      {
        "h2": "Das Argument — und warum es wackelt",
        "html": "<p>Versicherungen verweisen auf biomechanische Schwellenwerte: Unterhalb einer bestimmten Geschwindigkeitsänderung sei eine HWS-Verletzung „ausgeschlossen“. Der BGH hat eine solche pauschale <strong>Harmlosigkeitsgrenze</strong> ausdrücklich verworfen — sie ersetzt nicht die Prüfung des konkreten Falls.</p>"
      },
      {
        "h2": "Was wirklich zählt",
        "html": "<p>Maßgeblich ist, ob die Beschwerden im Einzelfall unfallbedingt sind — belegt durch <strong>zeitnahe ärztliche Diagnose</strong>, dokumentierten Verlauf und ggf. fachärztliche Befunde. Wer früh zum Arzt geht und alles dokumentiert, hat die deutlich bessere Position. Pauschale Ablehnung allein wegen der Geschwindigkeit genügt nicht.</p>"
      }
    ],
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-hws-schleudertrauma.html",
          "label": "HWS-Schleudertrauma"
        },
        {
          "href": "ARTICLE-schmerzensgeld-hws-schleudertrauma.html",
          "label": "Schmerzensgeld bei HWS"
        }
      ]
    },
    "cta": {
      "h": "HWS-Fall anwaltlich prüfen",
      "p": "Bei abgelehntem Personenschaden ist anwaltliche Begleitung sinnvoll — wir vermitteln die Partnerkanzlei.",
      "ctas": [
        "lex"
      ]
    },
    "faq": [
      {
        "q": "Gibt es eine feste Geschwindigkeit, unter der HWS ausgeschlossen ist?",
        "a": "Nein. Der BGH hat eine starre Harmlosigkeitsgrenze abgelehnt (VI ZR 139/02). Entscheidend ist der Einzelfall."
      },
      {
        "q": "Was ist der wichtigste Schritt nach dem Unfall?",
        "a": "Zeitnah zum Arzt und alle Beschwerden dokumentieren lassen — das ist die Beweisgrundlage."
      },
      {
        "q": "Lohnt sich ein Anwalt bei HWS-Streit?",
        "a": "Bei abgelehntem Personenschaden in der Regel ja; die Kosten trägt bei klarer Haftung die Gegenseite."
      }
    ],
    "about": [
      "HWS-Schleudertrauma",
      "Harmlosigkeitsgrenze",
      "BGH VI ZR 139/02",
      "Schmerzensgeld"
    ],
    "sources": "§253 BGB; BGH VI ZR 139/02 (keine starre Harmlosigkeitsgrenze) — gesetze-im-internet.de, bundesgerichtshof.de."
  },
  {
    "slug": "immer-neue-unterlagen",
    "cluster": "Verzögerung",
    "crumbLast": "Immer neue Unterlagen",
    "title": "Versicherung fordert immer neue Unterlagen — was steckt dahinter?",
    "headline": "Immer neue Unterlagen — die Nachforderungs-Schleife der Versicherung",
    "metaDesc": "Die Versicherung fordert ständig neue Nachweise nach? Wann das berechtigt ist, wann es Hinhaltetaktik ist und wie Sie die Schleife durchbrechen.",
    "h1": "„Bitte reichen Sie noch … nach“ — die endlose Nachforderungs-Schleife",
    "lede": "Kaum ist ein Nachweis da, kommt die nächste Bitte. Jede Nachforderung setzt die Uhr scheinbar neu — das ist oft genau der Zweck.",
    "tldr": "Berechtigt sind Nachforderungen nur, wenn die Unterlage für die Schadenhöhe wirklich nötig ist. Wird immer wieder Neues verlangt, obwohl die Akte vollständig ist, ist das oft <strong>Verzögerung</strong>. Bündele alles in <strong>einer datierten Sendung</strong>, fordere eine konkrete Restliste an und setze danach eine Frist — sonst läuft die Schleife endlos.",
    "brief": "„Zur abschließenden Prüfung benötigen wir noch … Bitte um Übersendung.“ Drei Wochen später: die nächste „letzte“ Unterlage.",
    "sections": [
      {
        "h2": "Berechtigt oder Taktik?",
        "html": "<p>Manche Nachfrage ist legitim — etwa eine Reparaturrechnung bei konkreter Abrechnung oder der Fahrzeugschein. Verdächtig wird es, wenn dieselbe Akte mehrfach „fast vollständig“ ist und immer eine neue Kleinigkeit fehlt. Diese Salami-Taktik hält Sie beschäftigt und die Auszahlung offen.</p>"
      },
      {
        "h2": "So durchbrechen Sie die Schleife",
        "html": "<p>Verlange <strong>eine vollständige Liste aller noch benötigten Unterlagen auf einmal</strong>, mit der Zusage, dass nach deren Eingang reguliert wird. Reiche alles gebündelt und datiert ein. Kommt danach erneut eine Nachforderung, die nicht wirklich schadensrelevant ist, ist die angemessene Prüffrist regelmäßig überschritten — Sie können Verzug auslösen.</p>"
      }
    ],
    "table": {
      "cols": [
        "Nachforderung",
        "Einordnung"
      ],
      "rows": [
        [
          "Gutachten / Reparaturrechnung",
          "meist berechtigt"
        ],
        [
          "Fahrzeugschein, Kontoverbindung",
          "berechtigt"
        ],
        [
          "mehrfach „eine letzte Kleinigkeit“",
          "Verzögerungs-Indiz"
        ]
      ]
    },
    "muster": {
      "h2": "Musterbrief: Restliste anfordern + Frist (zum Kopieren)",
      "intro": "Bündelt die Nachforderungen und setzt eine klare Grenze.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] habe ich Ihre Nachforderungen jeweils zeitnah beantwortet. Bitte teilen Sie mir <strong>abschließend und vollständig</strong> mit, welche Unterlagen Sie noch benötigen.<br><br>Nach deren Eingang erwarte ich die Regulierung <strong>binnen 14 Tagen</strong>. Weitere, nicht schadensrelevante Nachforderungen werte ich als Verzögerung; ab Verzug mache ich Verzugszinsen (§288 BGB) geltend.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Mehr zur Verzögerungs-Masche:",
      "links": [
        {
          "href": "/versicherer-decoder/DECODER-wir-pruefen-sachverhalt.html",
          "label": "„Wir prüfen den Sachverhalt“"
        },
        {
          "href": "/versicherer-decoder/zahlung-dauert",
          "label": "Zahlung dauert ewig"
        }
      ]
    },
    "cta": {
      "h": "Die Schleife reißt nicht ab?",
      "p": "Eine anwaltliche Aufforderung beendet das Spiel meist schnell — bei klarer Haftung ohne Kostenrisiko.",
      "ctas": [
        "lex",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Muss ich jede Nachforderung erfüllen?",
        "a": "Nur, soweit die Unterlage für die Schadenhöhe oder Haftung wirklich relevant ist. Unnötige Nachforderungen müssen die Regulierung nicht weiter aufhalten."
      },
      {
        "q": "Startet jede Nachforderung die Frist neu?",
        "a": "Nein. Nur eine berechtigte, schadensrelevante Nachforderung kann die angemessene Prüffrist verlängern — nicht wiederholte Kleinst-Nachfragen."
      },
      {
        "q": "Wie beweise ich, dass ich geliefert habe?",
        "a": "Sende Unterlagen datiert und nachweisbar (E-Mail mit Lesebestätigung, Einschreiben) und halte fest, wann die Akte vollständig war."
      }
    ],
    "about": [
      "Schadensregulierung",
      "Verzug",
      "Nachforderung",
      "§286 BGB",
      "Kfz-Haftpflicht"
    ],
    "sources": "§286 BGB, §288 BGB, §249 BGB — gesetze-im-internet.de."
  },
  {
    "slug": "kostenvoranschlag-reicht",
    "cluster": "Gutachter aufdrängen",
    "crumbLast": "Ein Kostenvoranschlag reicht",
    "title": "„Ein Kostenvoranschlag reicht“ — stimmt das?",
    "headline": "Ein Kostenvoranschlag reicht — warum das selten in Ihrem Interesse ist",
    "metaDesc": "Die Versicherung sagt, ein Werkstatt-Kostenvoranschlag genüge? Über der Bagatellgrenze haben Sie Anspruch auf ein unabhängiges Gutachten — mit mehr Posten.",
    "h1": "„Ein Kostenvoranschlag genügt uns“ — was dabei untergeht",
    "lede": "Der KVA ist schnell und billig — für die Versicherung. Für Sie fehlen darin oft genau die Posten, die Geld bringen.",
    "tldr": "Über der Bagatellgrenze (~750 €) haben Sie bei Fremdverschulden Anspruch auf ein <strong>unabhängiges Gutachten</strong> — die Kosten trägt die Gegenseite (§249 BGB). Ein Werkstatt-Kostenvoranschlag erfasst meist <strong>weder Wertminderung noch Nutzungsausfall, Restwert oder verdeckte Schäden</strong>. Die Differenz liegt oft bei 1.000–2.000 €.",
    "brief": "„Für die Schadenshöhe genügt uns ein Kostenvoranschlag Ihrer Werkstatt. Ein Gutachten ist nicht erforderlich.“",
    "sections": [
      {
        "h2": "Was im KVA fehlt",
        "html": "<p>Ein Kostenvoranschlag listet Reparaturpositionen — mehr nicht. Er bewertet keine <strong>merkantile Wertminderung</strong>, keinen <strong>Nutzungsausfall</strong>, keinen Restwert und erkennt keine verdeckten Schäden. Genau diese Posten machen einen erheblichen Teil Ihres Anspruchs aus und fehlen, wenn nur der KVA zählt.</p>"
      },
      {
        "h2": "Wann das Gutachten Ihnen zusteht",
        "html": "<p>Bei Fremdverschulden und einem Schaden oberhalb der Bagatellgrenze (Richtwert ~750 €) ist ein unabhängiges Gutachten die saubere Grundlage — und erstattungsfähig nach §249 BGB. Nur bei echten Bagatellschäden ist ein KVA angemessen.</p>"
      }
    ],
    "table": {
      "cols": [
        "Posten",
        "Im KVA",
        "Im Gutachten"
      ],
      "rows": [
        [
          "Reparaturkosten",
          "ja",
          "ja"
        ],
        [
          "Wertminderung",
          "nein",
          "ja"
        ],
        [
          "Nutzungsausfall / Restwert",
          "nein",
          "ja"
        ]
      ]
    },
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-gutachten-oder-kostenvoranschlag.html",
          "label": "Gutachten oder KVA?"
        },
        {
          "href": "ARTICLE-gutachter-lohnt-sich.html",
          "label": "Wann sich ein Gutachter lohnt"
        }
      ]
    },
    "cta": {
      "h": "Lieber ein vollständiges Gutachten",
      "p": "Wir vermitteln einen unabhängigen Sachverständigen, der alle Posten erfasst — bei Fremdverschulden kostenfrei.",
      "ctas": [
        "gutachter"
      ]
    },
    "faq": [
      {
        "q": "Reicht ein KVA wirklich nie?",
        "a": "Bei echten Bagatellschäden (Richtwert unter ~750 €) ja. Darüber ist ein Gutachten meist die bessere und erstattungsfähige Grundlage."
      },
      {
        "q": "Wer zahlt das Gutachten?",
        "a": "Bei Fremdverschulden die gegnerische Haftpflicht (§249 BGB), sofern kein Bagatellschaden vorliegt."
      },
      {
        "q": "Was bringt das Gutachten konkret mehr?",
        "a": "Es erfasst Wertminderung, Nutzungsausfall, Restwert und verdeckte Schäden — Posten, die im KVA fehlen und schnell vierstellig werden."
      }
    ],
    "about": [
      "Kostenvoranschlag",
      "Kfz-Gutachten",
      "Wertminderung",
      "§249 BGB"
    ],
    "sources": "§249 BGB; Bagatellgrenze nach BGH-Rechtsprechung — gesetze-im-internet.de."
  },
  {
    "slug": "mietwagen-gekuerzt",
    "cluster": "Kürzungen",
    "crumbLast": "Mietwagenkosten gekürzt",
    "title": "Mietwagenkosten gekürzt — was ist erstattungsfähig?",
    "headline": "Mietwagenkosten gekürzt — Normaltarif, Klasse und Eigenersparnis",
    "metaDesc": "Die Versicherung kürzt die Mietwagenkosten? Was der Normaltarif ist, welche Fahrzeugklasse zusteht und wann die Kürzung berechtigt ist.",
    "h1": "„Die Mietwagenkosten sind überhöht“ — was wirklich zusteht",
    "lede": "Mietwagen ja, aber zu welchem Preis und welcher Klasse? Hier trennen sich berechtigte Einwände von Standard-Kürzungen.",
    "tldr": "Erstattungsfähig ist der <strong>erforderliche Mietwagen</strong> in vergleichbarer Fahrzeugklasse zum <strong>Normaltarif</strong> für die Ausfalldauer. Abgezogen wird eine <strong>Eigenersparnis</strong> (meist ~3–10 %) für ersparte eigene Betriebskosten. Kürzt die Versicherung darüber hinaus pauschal oder verweist auf einen unrealistischen Tarif, ist das angreifbar — alternativ kann Nutzungsausfall die bessere Wahl sein.",
    "brief": "„Der gewählte Mietwagentarif ist nicht erforderlich; wir erstatten nur einen reduzierten Betrag.“",
    "sections": [
      {
        "h2": "Was berechtigt ist — und was nicht",
        "html": "<p>Berechtigt sind Einwände, wenn Sie eine zu große Fahrzeugklasse gewählt oder einen überteuerten Unfallersatztarif genommen haben. Nicht berechtigt ist die pauschale Kürzung auf einen praktisch nicht verfügbaren Billigtarif. Maßstab ist der <strong>Normaltarif</strong> für eine vergleichbare Klasse.</p>"
      },
      {
        "h2": "Eigenersparnis und Alternative",
        "html": "<p>Weil Sie Ihr eigenes Auto in der Zeit nicht nutzt, wird eine kleine Eigenersparnis abgezogen. Wer wenig fährt, fährt mit <strong>Nutzungsausfall</strong> statt Mietwagen oft besser — der Rechner unten hilft beim Vergleich der Ausfalltage.</p>"
      }
    ],
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-mietwagen-anspruch.html",
          "label": "Mietwagen-Anspruch"
        },
        {
          "href": "ARTICLE-nutzungsausfall-vs-mietwagen.html",
          "label": "Mietwagen oder Nutzungsausfall?"
        }
      ]
    },
    "cta": {
      "h": "Mietwagen-Kürzung prüfen",
      "p": "Der Kürzungs-Checker ordnet ein, was berechtigt ist — bei Bedarf vermitteln wir die Kanzlei.",
      "ctas": [
        "lex",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Welche Fahrzeugklasse steht mir zu?",
        "a": "Grundsätzlich eine vergleichbare Klasse zu Ihrem eigenen Fahrzeug. Eine deutlich größere Klasse kann gekürzt werden."
      },
      {
        "q": "Was ist der Normaltarif?",
        "a": "Der marktübliche Mietpreis ohne Unfallersatz-Aufschläge. An ihm misst sich die Erstattungshöhe."
      },
      {
        "q": "Lohnt sich Nutzungsausfall statt Mietwagen?",
        "a": "Bei geringer Fahrleistung oft ja. Der Rechner vergleicht die Ausfalltage und den Tagessatz."
      }
    ],
    "about": [
      "Mietwagen",
      "Normaltarif",
      "Nutzungsausfall",
      "§249 BGB"
    ],
    "sources": "§249 BGB; BGH-Rechtsprechung zum Normaltarif und zur Eigenersparnis — gesetze-im-internet.de."
  },
  {
    "slug": "nutzungsausfall-gestrichen",
    "cluster": "Kürzungen",
    "crumbLast": "Nutzungsausfall gestrichen",
    "title": "Nutzungsausfall gestrichen — was steht Ihnen zu?",
    "headline": "Nutzungsausfall gestrichen — wann er Ihnen trotzdem zusteht",
    "metaDesc": "Die Versicherung streicht den Nutzungsausfall? Wann er zusteht, wie er nach der Tabelle berechnet wird und wie Sie ihn zurückfordern.",
    "h1": "„Nutzungsausfall können wir nicht erstatten“ — meist doch",
    "lede": "Wer kein Auto hatte, hat einen Schaden — auch ohne Mietwagen. Die pauschale Streichung hält selten stand.",
    "tldr": "Hatten Sie keinen Ersatzwagen und einen <strong>Nutzungswillen</strong> (Sie wären gefahren), steht Ihnen <strong>Nutzungsausfall-Entschädigung</strong> für die Ausfalltage zu — auch ohne Mietwagen. Die Höhe richtet sich nach der <strong>Sanden/Danner-Tabelle</strong> (Fahrzeuggruppe × Tage). Eine pauschale Streichung ist meist angreifbar.",
    "brief": "„Eine Nutzungsausfallentschädigung sehen wir nicht vor, da kein Mietwagen angefallen ist.“",
    "sections": [
      {
        "h2": "Mietwagen ist nicht Voraussetzung",
        "html": "<p>Nutzungsausfall entschädigt den <strong>entgangenen Gebrauch</strong> Ihres Fahrzeugs — unabhängig davon, ob Sie einen Mietwagen genommen haben. Voraussetzung sind ein Nutzungswille und die Nutzungsmöglichkeit (Sie hätten fahren können und wollen). Die fehlende Mietwagenrechnung ist kein Grund zur Streichung.</p>"
      },
      {
        "h2": "So wird gerechnet",
        "html": "<p>Die Entschädigung ergibt sich aus der <strong>Sanden/Danner-Tabelle</strong>: Jedes Fahrzeug ist einer Gruppe mit Tagessatz zugeordnet. Multipliziert mit den nachgewiesenen Ausfalltagen (Reparaturdauer bzw. Wiederbeschaffungsdauer laut Gutachten) ergibt sich der Betrag. Der Rechner unten gibt einen Richtwert.</p>"
      }
    ],
    "muster": {
      "h2": "Musterbrief: Nutzungsausfall nachfordern (zum Kopieren)",
      "intro": "Wenn der Nutzungsausfall pauschal gestrichen wurde.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] haben Sie den Nutzungsausfall nicht berücksichtigt. Mir stand das Fahrzeug für [Anzahl] Tage nicht zur Verfügung; Nutzungswille und -möglichkeit lagen vor. Ein Mietwagen ist keine Voraussetzung.<br><br>Ich fordere die Nutzungsausfallentschädigung nach der Sanden/Danner-Tabelle (Gruppe [X], [Tagessatz] €/Tag) für [Anzahl] Tage = [Betrag] € <strong>binnen 14 Tagen</strong>.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "HUB-nutzungsausfall.html",
          "label": "Nutzungsausfall-Hub"
        },
        {
          "href": "ARTICLE-nutzungsausfall-vs-mietwagen.html",
          "label": "Nutzungsausfall vs. Mietwagen"
        }
      ]
    },
    "cta": {
      "h": "Nutzungsausfall zurückholen",
      "p": "Der Kürzungs-Checker zeigt Ihre Posten; bei Bedarf vermitteln wir Gutachter und Kanzlei.",
      "ctas": [
        "checker",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Brauche ich einen Mietwagen für Nutzungsausfall?",
        "a": "Nein. Nutzungsausfall entschädigt den entgangenen Gebrauch und setzt nur Nutzungswille und -möglichkeit voraus."
      },
      {
        "q": "Wie viele Tage werden erstattet?",
        "a": "Die nachgewiesene Ausfallzeit — bei Reparatur die Reparaturdauer, beim Totalschaden die Wiederbeschaffungsdauer laut Gutachten."
      },
      {
        "q": "Woher kommt der Tagessatz?",
        "a": "Aus der Sanden/Danner-Tabelle, die Fahrzeuge in Gruppen mit festen Tagessätzen einordnet."
      }
    ],
    "about": [
      "Nutzungsausfall",
      "Sanden/Danner",
      "§249 BGB",
      "Schadensregulierung"
    ],
    "sources": "§249 BGB; Sanden/Danner/Küppersbusch-Tabelle — st. Rechtsprechung."
  },
  {
    "slug": "partnerwerkstatt",
    "cluster": "Gutachter aufdrängen",
    "crumbLast": "Bitte unsere Partnerwerkstatt",
    "title": "Versicherung verweist auf Partnerwerkstatt — müssen Sie hin?",
    "headline": "Bitte nutzen Sie unsere Partnerwerkstatt — müssen Sie das?",
    "metaDesc": "Die Versicherung will Sie in ihre Partnerwerkstatt lenken? Sie haben grundsätzlich das Recht auf freie Werkstattwahl. Was gilt und worauf Sie achten.",
    "h1": "„Wir empfehlen unsere Partnerwerkstatt“ — Ihre freie Werkstattwahl",
    "lede": "Ein Anruf, ein „kostenloser Hol- und Bringservice“, eine Partnerwerkstatt — bequem klingt es. Steuerung ist es trotzdem.",
    "tldr": "Bei Fremdverschulden haben Sie grundsätzlich die <strong>freie Wahl der Werkstatt</strong>. Die Versicherung darf Sie auf eine günstigere Werkstatt nur unter engen Voraussetzungen verweisen (gleichwertig, ohne weiteres erreichbar). Sie müssen die Partnerwerkstatt <strong>nicht</strong> nutzen und behalten Anspruch auf Abrechnung zu den ortsüblichen Sätzen einer markengebundenen Fachwerkstatt.",
    "brief": "„Über unsere Partnerwerkstatt erfolgt die Reparatur schneller und ohne Aufwand für Sie. Soll wir einen Termin vereinbaren?“",
    "sections": [
      {
        "h2": "Warum die Partnerwerkstatt empfohlen wird",
        "html": "<p>Partnerwerkstätten rechnen mit der Versicherung zu vereinbarten, niedrigeren Konditionen ab. Für Sie heißt das: tendenziell günstigere Verrechnungssätze, weniger Spielraum bei Originalteilen — und die Schadensumme, die später in Wertminderung und Nutzungsausfall einfließt, fällt kleiner aus.</p>"
      },
      {
        "h2": "Was die Rechtsprechung sagt",
        "html": "<p>Grundsätzlich dürfen Sie die Werkstatt frei wählen und nach den Sätzen einer markengebundenen Fachwerkstatt abrechnen. Eine <strong>Verweisung</strong> auf eine günstigere Werkstatt ist der Versicherung nur unter engen Bedingungen erlaubt (u. a. gleichwertige Qualität, mühelose Erreichbarkeit) — und bei fiktiver Abrechnung anders zu beurteilen als bei konkreter Reparatur. Im Zweifel gilt Ihre freie Wahl.</p>"
      }
    ],
    "next": {
      "text": "Vertiefung:",
      "links": [
        {
          "href": "ARTICLE-werkstattwahl-recht.html",
          "label": "Freie Werkstattwahl"
        },
        {
          "href": "ARTICLE-verweisrecht-versicherung.html",
          "label": "Verweisung auf günstigere Werkstatt"
        }
      ]
    },
    "cta": {
      "h": "Eigene Werkstatt, eigener Gutachter",
      "p": "Wir vermitteln einen unabhängigen Gutachter, der den Schaden vollständig erfasst — Basis für die freie Werkstattwahl.",
      "ctas": [
        "gutachter"
      ]
    },
    "faq": [
      {
        "q": "Muss ich in die Partnerwerkstatt?",
        "a": "Nein. Bei Fremdverschulden gilt grundsätzlich die freie Werkstattwahl; Sie können zu den Sätzen einer markengebundenen Fachwerkstatt abrechnen."
      },
      {
        "q": "Was ist eine Verweisung?",
        "a": "Der Versuch der Versicherung, Sie auf eine günstigere, gleichwertige Werkstatt zu verweisen. Das ist nur unter engen Voraussetzungen zulässig."
      },
      {
        "q": "Verliere ich Ansprüche, wenn ich die Partnerwerkstatt nehme?",
        "a": "Nicht automatisch, aber die Abrechnung orientiert sich dann an deren Konditionen. Mit eigenem Gutachten und freier Wahl behalten Sie mehr Kontrolle."
      }
    ],
    "about": [
      "Werkstattwahl",
      "Verweisung",
      "§249 BGB",
      "Schadensregulierung"
    ],
    "sources": "§249 BGB; BGH-Rechtsprechung zur Werkstattwahl und Verweisung — gesetze-im-internet.de."
  },
  {
    "slug": "restwert-zu-hoch",
    "cluster": "Kürzungen",
    "crumbLast": "Restwert zu hoch angesetzt",
    "title": "Versicherung setzt Restwert zu hoch an — was tun?",
    "headline": "Restwert zu hoch angesetzt — der Trick mit der Restwertbörse",
    "metaDesc": "Beim Totalschaden setzt die Versicherung einen hohen Restwert aus einer Online-Börse an und kürzt so Ihre Auszahlung. Was Sie dagegen tun können.",
    "h1": "„Wir haben ein höheres Restwertangebot“ — der Restwertbörsen-Trick",
    "lede": "Beim Totalschaden gilt: Auszahlung = Wiederbeschaffungswert minus Restwert. Ein künstlich hoher Restwert kürzt genau Ihre Auszahlung.",
    "tldr": "Beim Totalschaden zahlt die Versicherung Wiederbeschaffungswert <strong>minus Restwert</strong>. Setzt sie einen hohen Restwert aus einer überregionalen <strong>Online-Restwertbörse</strong> an, sinkt Ihre Auszahlung. Sie dürfen Sie aber am <strong>regionalen Markt</strong> orientieren und müssen überregionale Spezialaufkäufer-Angebote in der Regel nicht abwarten — maßgeblich ist der Restwert Ihres Gutachtens.",
    "brief": "„Uns liegt ein verbindliches Restwertangebot über [hoher Betrag] € vor; diesen Restwert legen wir der Abrechnung zugrunde.“",
    "sections": [
      {
        "h2": "Warum ein hoher Restwert Sie Geld kostet",
        "html": "<p>Ihre Auszahlung ist Wiederbeschaffungswert minus Restwert. Je höher der Restwert, desto weniger Geld. Versicherungen holen über bundesweite Online-Börsen gezielt hohe Restwertgebote von Spezialaufkäufern ein — die für Sie praktisch oft nicht realisierbar sind.</p>"
      },
      {
        "h2": "Worauf Sie sich stützen dürfen",
        "html": "<p>Maßgeblich ist grundsätzlich der Restwert auf Ihrem <strong>regionalen Markt</strong>, wie ihn Ihr Gutachten ermittelt. Sie müssen nicht aktiv nach dem höchsten überregionalen Gebot suchen oder darauf warten. Verkaufen Sie auf Basis Ihres Gutachtens, ist das in der Regel gedeckt — der „bessere“ Restwert der Versicherung bindet Sie nicht automatisch.</p>"
      }
    ],
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-wbw-restwert-streit.html",
          "label": "Restwert-Streit"
        },
        {
          "href": "ARTICLE-totalschaden-130-prozent-regel.html",
          "label": "Totalschaden & 130 %"
        }
      ]
    },
    "cta": {
      "h": "Restwert-Ansatz prüfen",
      "p": "Der Totalschaden-Rechner zeigt Ihre Auszahlung; der Kürzungs-Checker ordnet den Restwert-Streit ein.",
      "ctas": [
        "lex",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Muss ich das hohe Restwertangebot der Versicherung annehmen?",
        "a": "In der Regel nicht. Maßgeblich ist der Restwert Ihres Gutachtens auf dem regionalen Markt; überregionale Spezialgebote müssen Sie meist nicht abwarten."
      },
      {
        "q": "Wann sollte ich nicht voreilig verkaufen?",
        "a": "Verkaufe das Wrack nicht, bevor der Restwert sauber gutachterlich ermittelt ist — sonst entsteht Streit über die Höhe."
      },
      {
        "q": "Was, wenn ich repariere statt verkaufe?",
        "a": "Dann gelten andere Regeln (u. a. die 130-%-Grenze). Der Restwert spielt vor allem bei der Totalschaden-Abrechnung eine Rolle."
      }
    ],
    "about": [
      "Restwert",
      "Totalschaden",
      "Wiederbeschaffungswert",
      "§249 BGB"
    ],
    "sources": "§249 BGB; BGH-Rechtsprechung zum regionalen Restwertmarkt — gesetze-im-internet.de."
  },
  {
    "slug": "schmerzensgeld-zu-niedrig",
    "cluster": "Wertminderung & Co.",
    "crumbLast": "Schmerzensgeld zu niedrig",
    "title": "Schmerzensgeld zu niedrig angeboten — was ist angemessen?",
    "headline": "Schmerzensgeld zu niedrig — woran sich die Höhe wirklich orientiert",
    "metaDesc": "Die Versicherung bietet ein niedriges Schmerzensgeld? Woran sich die Höhe orientiert, warum Tabellen nur Anhaltspunkte sind und wie Sie reagieren.",
    "h1": "„Wir bieten Ihnen ein Schmerzensgeld von …“ — meist der Einstieg, nicht das Ende",
    "lede": "Das erste Schmerzensgeld-Angebot ist fast immer niedrig. Maßgeblich sind Ihr Verletzungsbild und der Verlauf — nicht der Wunsch der Versicherung.",
    "tldr": "Schmerzensgeld (§253 BGB) richtet sich nach <strong>Art, Schwere und Dauer</strong> der Verletzungen, Behandlung und Folgen. <strong>Schmerzensgeld-Tabellen</strong> liefern nur Anhaltspunkte aus vergleichbaren Fällen — das erste Angebot ist meist der untere Rand. Vollständige ärztliche Dokumentation ist der Hebel; bei Dauerfolgen liegt der Betrag deutlich höher.",
    "brief": "„Für die erlittenen Beeinträchtigungen bieten wir ein Schmerzensgeld von [niedriger Betrag] € als Abgeltung an.“",
    "sections": [
      {
        "h2": "Woran sich die Höhe bemisst",
        "html": "<p>Entscheidend sind Art und Schwere der Verletzung, die Behandlungsdauer (ambulant/stationär, OPs), Schmerzen, psychische Folgen und vor allem <strong>Dauerschäden</strong>. Auch der Heilungsverlauf zählt. Zwei oberflächlich ähnliche Fälle können sehr unterschiedlich bewertet werden.</p>"
      },
      {
        "h2": "Warum Tabellen nur Anhaltspunkte sind",
        "html": "<p>Schmerzensgeld-Tabellen sammeln frühere Urteile. Sie helfen bei der Einordnung, sind aber keine Obergrenze. Das erste Angebot der Versicherung liegt regelmäßig am unteren Rand. Eine <strong>lückenlose ärztliche Dokumentation</strong> und die Berücksichtigung von Spätfolgen heben den angemessenen Betrag oft deutlich.</p>"
      }
    ],
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-schmerzensgeld-hoehe-tabelle.html",
          "label": "Schmerzensgeld-Tabelle"
        },
        {
          "href": "ARTICLE-schmerzensgeld-versicherung-verweigert.html",
          "label": "Wenn die VS verweigert"
        }
      ]
    },
    "cta": {
      "h": "Schmerzensgeld einschätzen lassen",
      "p": "Der Rechner gibt einen Richtwert; bei Personenschaden ist anwaltliche Begleitung sinnvoll — wir vermitteln.",
      "ctas": [
        "lex"
      ]
    },
    "faq": [
      {
        "q": "Ist das erste Angebot verbindlich?",
        "a": "Nein. Es ist meist der untere Rand. Solange Sie keine Abfindung unterschreiben, können Sie nachverhandeln."
      },
      {
        "q": "Sind Tabellenwerte eine Obergrenze?",
        "a": "Nein. Tabellen sind Anhaltspunkte aus früheren Urteilen, keine Deckelung. Dauerfolgen können deutlich höhere Beträge rechtfertigen."
      },
      {
        "q": "Was ist der wichtigste Hebel?",
        "a": "Eine vollständige, zeitnahe ärztliche Dokumentation aller Beschwerden und Folgen."
      }
    ],
    "about": [
      "Schmerzensgeld",
      "§253 BGB",
      "Personenschaden",
      "Schmerzensgeld-Tabelle"
    ],
    "sources": "§253 BGB; Schmerzensgeld-Tabellen (z. B. Hacks/Wellner/Häcker) — gesetze-im-internet.de."
  },
  {
    "slug": "schneller-vergleich",
    "cluster": "Verzögerung",
    "crumbLast": "Schnelles Vergleichsangebot",
    "title": "Versicherung bietet schnellen Vergleich — annehmen?",
    "headline": "Schnelles Vergleichsangebot der Versicherung — Vorsicht vor der Abfindung",
    "metaDesc": "Ein zügiges Abfindungsangebot klingt fair, ist aber oft zu niedrig. Was eine Abfindungserklärung bedeutet und worauf Sie vor der Unterschrift achten.",
    "h1": "„Wir bieten Ihnen zur schnellen Erledigung …“ — das Vergleichsangebot",
    "lede": "Nach Wochen des Wartens kommt plötzlich ein Angebot „zur zügigen Erledigung“. Genau dieser Kontrast ist Teil der Methode.",
    "tldr": "Ein schnelles Pauschalangebot ist oft <strong>niedriger als der volle Anspruch</strong> und meist mit einer <strong>Abfindungserklärung</strong> verknüpft: Mit der Unterschrift sind weitere Forderungen ausgeschlossen — auch Spätschäden. Rechne den Anspruch vorher selbst durch (Gutachten, Nutzungsausfall, Wertminderung) und unterschreibe <strong>keine Abfindung</strong>, bevor alles erfasst ist.",
    "brief": "„Zur zügigen und unbürokratischen Erledigung bieten wir Ihnen einen Betrag von [X] € an. Beiliegend die Abfindungserklärung.“",
    "sections": [
      {
        "h2": "Warum gerade jetzt das Angebot kommt",
        "html": "<p>Das Angebot folgt oft auf eine bewusste Wartephase: Wer länger auf Geld wartet, greift eher zu. Die genannte Summe ist regelmäßig ein <strong>Verhandlungs-Einstieg</strong>, nicht der volle Schaden. Posten wie Wertminderung, Nutzungsausfall oder Verbringungskosten fehlen häufig.</p>"
      },
      {
        "h2": "Die Abfindungserklärung ist der Haken",
        "html": "<p>Eine Abfindungs- oder Ausgleichsquittung bedeutet: Mit der Unterschrift sind <strong>alle weiteren Ansprüche erledigt</strong> — auch solche, die Sie heute noch nicht kennen (z. B. später auftretende HWS-Beschwerden oder verdeckte Schäden). Unterschreibe sie erst, wenn der Schaden vollständig durch ein Gutachten erfasst und alle Posten berücksichtigt sind.</p>"
      }
    ],
    "table": {
      "cols": [
        "Posten",
        "Im Schnellangebot oft …"
      ],
      "rows": [
        [
          "Reparatur / WBW",
          "enthalten"
        ],
        [
          "Wertminderung",
          "fehlt häufig"
        ],
        [
          "Nutzungsausfall / Mietwagen",
          "fehlt häufig"
        ],
        [
          "Spätschäden",
          "durch Abfindung ausgeschlossen"
        ]
      ]
    },
    "next": {
      "text": "Rechne Ihre Posten gegen:",
      "links": [
        {
          "href": "/kuerzungs-checker",
          "label": "Kürzungs-Checker"
        },
        {
          "href": "ARTICLE-schuldanerkenntnis-vermeiden.html",
          "label": "Abfindungsquittung vermeiden"
        }
      ]
    },
    "cta": {
      "h": "Vor der Unterschrift prüfen lassen",
      "p": "Lass den vollen Anspruch ermitteln, bevor Sie eine Abfindung unterschreiben — Gutachter vermitteln wir, die Kanzlei verhandelt.",
      "ctas": [
        "lex",
        "gutachter"
      ]
    },
    "faq": [
      {
        "q": "Ist ein Vergleich immer schlecht?",
        "a": "Nein, aber das erste Angebot ist selten der volle Anspruch. Prüfe alle Posten, bevor Sie zustimmen."
      },
      {
        "q": "Was passiert mit Spätschäden nach einer Abfindung?",
        "a": "Eine umfassende Abfindungserklärung schließt spätere Forderungen in der Regel aus — auch für erst später erkennbare Schäden. Deshalb vor Unterschrift vollständig erfassen."
      },
      {
        "q": "Kann ich nach dem Angebot noch ein Gutachten machen?",
        "a": "Ja. Solange Sie nichts unterschrieben haben, können Sie einen unabhängigen Sachverständigen beauftragen — die Kosten trägt bei Fremdverschulden die Gegenseite."
      }
    ],
    "about": [
      "Abfindungserklärung",
      "Vergleich",
      "Schadensregulierung",
      "§249 BGB",
      "Schmerzensgeld"
    ],
    "sources": "§249 BGB, §253 BGB; Grundsätze zur Abfindungserklärung — gesetze-im-internet.de."
  },
  {
    "slug": "stundensatz-gekuerzt",
    "cluster": "Kürzungen",
    "crumbLast": "Stundensatz gekürzt",
    "title": "Stundenverrechnungssatz gekürzt — Verweis auf freie Werkstatt",
    "headline": "Stundensatz gekürzt — die Verweisung auf die günstige Werkstatt",
    "metaDesc": "Die Versicherung rechnet mit niedrigeren Stundensätzen einer freien Werkstatt? Wann die Verweisung zulässig ist und wann Sie die Fachwerkstatt-Sätze behalten.",
    "h1": "„Wir legen die Sätze einer freien Werkstatt zugrunde“ — die Verweisung",
    "lede": "Statt Ihrer Markenwerkstatt rechnet die Versicherung mit den günstigeren Sätzen einer freien Werkstatt. Das ist nur unter Bedingungen erlaubt.",
    "tldr": "Die Versicherung darf Sie auf eine günstigere <strong>freie Werkstatt</strong> nur unter engen Voraussetzungen verweisen: gleichwertige Qualität, ohne weiteres erreichbar — und bei jüngeren/scheckheftgepflegten Fahrzeugen ist die Verweisung oft unzulässig. Dann behalten Sie die <strong>Stundensätze einer markengebundenen Fachwerkstatt</strong> (§249 BGB).",
    "brief": "„Die Reparaturkosten kürzen wir auf die ortsüblichen Sätze einer mühelos erreichbaren Fachwerkstatt.“",
    "sections": [
      {
        "h2": "Was die Verweisung ist",
        "html": "<p>Bei fiktiver Abrechnung versucht die Versicherung, statt der Markenwerkstatt-Sätze die niedrigeren Sätze einer freien Werkstatt anzusetzen. Das kann den Betrag spürbar drücken. Zulässig ist das nur, wenn die Alternativwerkstatt gleichwertig und für Sie ohne weiteres zugänglich ist.</p>"
      },
      {
        "h2": "Wann Sie die Fachwerkstatt-Sätze behalten",
        "html": "<p>Bei <strong>jüngeren Fahrzeugen</strong> (Richtwert bis ~3 Jahre) und durchgehender Scheckheftpflege ist die Verweisung regelmäßig unzulässig — Sie dürfen nach Markenwerkstatt abrechnen. Auch sonst muss die Versicherung die Gleichwertigkeit und Erreichbarkeit konkret darlegen; pauschale Kürzungen reichen nicht.</p>"
      }
    ],
    "muster": {
      "h2": "Musterbrief: Verweisung zurückweisen (zum Kopieren)",
      "intro": "Wenn die Versicherung auf eine freie Werkstatt verweist.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] verweisen Sie auf die Sätze einer freien Werkstatt. Mein Fahrzeug ist [Alter/Scheckheft]; eine gleichwertige, ohne weiteres erreichbare Alternativwerkstatt haben Sie nicht konkret benannt.<br><br>Ich fordere die Abrechnung zu den Stundensätzen einer markengebundenen Fachwerkstatt <strong>binnen 14 Tagen</strong>.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-verweisrecht-versicherung.html",
          "label": "Verweisrecht erklärt"
        },
        {
          "href": "ARTICLE-fiktive-abrechnung.html",
          "label": "Fiktive Abrechnung"
        }
      ]
    },
    "cta": {
      "h": "Verweisung prüfen lassen",
      "p": "Der Kürzungs-Checker ordnet ein, ob die Verweisung in Ihrem Fall zulässig ist.",
      "ctas": [
        "lex",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Darf die Versicherung immer auf eine freie Werkstatt verweisen?",
        "a": "Nein. Nur bei gleichwertiger, ohne weiteres erreichbarer Alternative — und bei jüngeren, scheckheftgepflegten Fahrzeugen oft gar nicht."
      },
      {
        "q": "Was gilt bei konkreter Reparatur?",
        "a": "Reparieren Sie tatsächlich in der Markenwerkstatt, sind deren Sätze maßgeblich; die Verweisung läuft dann ins Leere."
      },
      {
        "q": "Wie viel macht das aus?",
        "a": "Die Differenz der Stundensätze summiert sich schnell auf mehrere hundert Euro je nach Reparaturumfang."
      }
    ],
    "about": [
      "Stundenverrechnungssatz",
      "Verweisung",
      "fiktive Abrechnung",
      "§249 BGB"
    ],
    "sources": "§249 BGB; BGH-Rechtsprechung zur Verweisung auf freie Werkstätten — gesetze-im-internet.de."
  },
  {
    "slug": "totalschaden-trick",
    "cluster": "Wertminderung & Co.",
    "crumbLast": "Totalschaden-Abrechnung",
    "title": "Totalschaden-Abrechnung zu niedrig — Wiederbeschaffungswert prüfen",
    "headline": "Totalschaden abgerechnet — wenn Wiederbeschaffungswert und Restwert nicht stimmen",
    "metaDesc": "Bei der Totalschaden-Abrechnung zählt Wiederbeschaffungswert minus Restwert. Wie Versicherungen beide Werte zu Ihren Ungunsten ansetzen — und was hilft.",
    "h1": "„Wir rechnen auf Totalschadenbasis ab“ — wo die Zahlen kippen",
    "lede": "Bei der Totalschaden-Abrechnung hängt alles an zwei Zahlen: Wiederbeschaffungswert und Restwert. Beide lassen sich zu Ihren Ungunsten ansetzen.",
    "tldr": "Die Auszahlung beim Totalschaden ist <strong>Wiederbeschaffungswert (WBW) minus Restwert</strong>. Versicherungen drücken die Auszahlung, indem sie den <strong>WBW zu niedrig</strong> und den <strong>Restwert zu hoch</strong> ansetzen. Maßgeblich sind die Werte Ihres Gutachtens auf dem regionalen Markt — beide Zahlen lohnt es zu prüfen.",
    "brief": "„Wiederbeschaffungswert [niedrig] € abzüglich Restwert [hoch] € ergibt eine Entschädigung von [wenig] €.“",
    "sections": [
      {
        "h2": "Die zwei Stellschrauben",
        "html": "<p>Ein zu niedriger Wiederbeschaffungswert unterstellt, Ihr Auto sei weniger wert gewesen, als ein vergleichbares Ersatzfahrzeug kostet. Ein zu hoher Restwert (oft aus überregionalen Börsen) zieht zusätzlich ab. Beides zusammen drückt die Auszahlung doppelt.</p>"
      },
      {
        "h2": "Was Sie prüfen sollten",
        "html": "<p>Vergleiche den angesetzten <strong>Wiederbeschaffungswert</strong> mit realen Angeboten für ein gleichwertiges Fahrzeug auf dem regionalen Markt. Prüfe, ob der <strong>Restwert</strong> auf einem realistischen regionalen Gebot beruht. Ihr Gutachten ist die Referenz — Abweichungen der Versicherung sind angreifbar. Mehrwertsteuer wird nur erstattet, wenn sie tatsächlich anfällt.</p>"
      }
    ],
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-wbw-vs-zeitwert.html",
          "label": "Wiederbeschaffungswert vs. Zeitwert"
        },
        {
          "href": "/versicherer-decoder/restwert-zu-hoch",
          "label": "Restwert zu hoch angesetzt"
        }
      ]
    },
    "cta": {
      "h": "Totalschaden-Abrechnung prüfen",
      "p": "Der Rechner zeigt die Auszahlungslogik; ein Gutachten liefert belastbare Werte. Wir vermitteln bei Bedarf die Kanzlei.",
      "ctas": [
        "gutachter",
        "checker"
      ]
    },
    "faq": [
      {
        "q": "Wie wird die Entschädigung beim Totalschaden berechnet?",
        "a": "Wiederbeschaffungswert minus Restwert. Mehrwertsteuer nur, wenn sie beim Ersatzkauf tatsächlich anfällt."
      },
      {
        "q": "Woran erkenne ich einen zu niedrigen WBW?",
        "a": "Wenn vergleichbare Fahrzeuge auf dem regionalen Markt deutlich mehr kosten als der angesetzte Wert."
      },
      {
        "q": "Kann ich trotzdem reparieren?",
        "a": "Bis 130 % des WBW ja (Integritätszuschlag) — das ist eine eigene Konstellation mit eigenen Voraussetzungen."
      }
    ],
    "about": [
      "Totalschaden",
      "Wiederbeschaffungswert",
      "Restwert",
      "§249 BGB"
    ],
    "sources": "§249 BGB; BGH-Rechtsprechung zu WBW, Restwert und MwSt. — gesetze-im-internet.de."
  },
  {
    "slug": "upe-gestrichen",
    "cluster": "Kürzungen",
    "crumbLast": "UPE-Aufschläge gestrichen",
    "title": "UPE-Aufschläge gestrichen — was gilt?",
    "headline": "UPE-Aufschläge gestrichen — wann sie erstattungsfähig sind",
    "metaDesc": "Die Versicherung streicht UPE-Aufschläge auf Ersatzteile? Bei konkreter Reparatur sind sie regelmäßig zu erstatten. So reagieren Sie.",
    "h1": "„UPE-Aufschläge erkennen wir nicht an“ — bei Reparatur meist doch",
    "lede": "Markenwerkstätten schlagen auf Ersatzteile einen Zuschlag auf. Real angefallen, ist er Teil Ihres Schadens.",
    "tldr": "UPE-Aufschläge (Aufschläge auf die unverbindliche Preisempfehlung für Ersatzteile) fallen in markengebundenen Fachwerkstätten real an. Bei <strong>konkreter Reparatur</strong> sind sie regelmäßig erstattungsfähig (§249 BGB), typisch <strong>10–20 %</strong> auf Teile. Die pauschale Streichung ist angreifbar, wenn die Aufschläge tatsächlich berechnet wurden.",
    "brief": "„UPE-Aufschläge sind nicht erstattungsfähig.“ — pauschal, ohne Blick auf die konkrete Rechnung.",
    "sections": [
      {
        "h2": "Was UPE-Aufschläge sind",
        "html": "<p>Markenwerkstätten kalkulieren auf Originalteile einen Aufschlag auf die unverbindliche Preisempfehlung — etwa für Lagerhaltung und Beschaffung. Reparieren Sie in einer solchen Werkstatt, fällt der Aufschlag real an und gehört zum Schaden.</p>"
      },
      {
        "h2": "Wann die Erstattung greift",
        "html": "<p>Bei konkreter Reparatur mit entsprechender Rechnung sind UPE-Aufschläge regelmäßig erstattungsfähig. Bei fiktiver Abrechnung ist es strittiger und regional unterschiedlich. Maßgeblich ist, ob die Aufschläge ortsüblich tatsächlich anfallen.</p>"
      }
    ],
    "muster": {
      "h2": "Musterbrief: UPE-Aufschläge nachfordern (zum Kopieren)",
      "intro": "Wenn die Aufschläge trotz Reparatur gestrichen wurden.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] haben Sie die UPE-Aufschläge ([Betrag] €) abgesetzt. Die Reparatur erfolgte konkret in einer markengebundenen Fachwerkstatt; die Aufschläge sind in Gutachten/Rechnung ausgewiesen.<br><br>Ich fordere deren Erstattung <strong>binnen 14 Tagen</strong>.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Verwandte Kürzungen:",
      "links": [
        {
          "href": "HUB-upe-aufschlaege.html",
          "label": "UPE-Aufschläge-Hub"
        },
        {
          "href": "/versicherer-decoder/verbringungskosten-abgelehnt",
          "label": "Verbringungskosten abgelehnt"
        }
      ]
    },
    "cta": {
      "h": "UPE-Aufschläge zurückholen",
      "p": "Der Kürzungs-Checker zeigt alle gestrichenen Posten auf einen Blick.",
      "ctas": [
        "checker",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Was bedeutet UPE?",
        "a": "Unverbindliche Preisempfehlung. Markenwerkstätten schlagen darauf einen Zuschlag für Beschaffung und Lagerhaltung auf."
      },
      {
        "q": "Wie hoch sind UPE-Aufschläge?",
        "a": "Typisch 10–20 % auf die Ersatzteile, je nach Region und Werkstatt."
      },
      {
        "q": "Erstattung auch bei fiktiver Abrechnung?",
        "a": "Strittiger. Bei konkreter Reparatur sind sie regelmäßig erstattungsfähig; fiktiv kommt es auf die regionale Üblichkeit an."
      }
    ],
    "about": [
      "UPE-Aufschläge",
      "Ersatzteile",
      "§249 BGB",
      "Reparaturkosten"
    ],
    "sources": "§249 BGB; Rechtsprechung zur konkreten Reparaturabrechnung — gesetze-im-internet.de."
  },
  {
    "slug": "verbringungskosten-abgelehnt",
    "cluster": "Kürzungen",
    "crumbLast": "Verbringungskosten abgelehnt",
    "title": "Verbringungskosten abgelehnt — sind sie erstattungsfähig?",
    "headline": "Verbringungskosten abgelehnt — wann die Versicherung sie zahlen muss",
    "metaDesc": "Verbringungskosten zur Lackiererei gestrichen? Bei konkreter Reparatur sind sie regelmäßig erstattungsfähig. So fordern Sie sie zurück.",
    "h1": "„Verbringungskosten erstatten wir nicht“ — bei Reparatur meist doch",
    "lede": "Nicht jede Werkstatt lackiert selbst. Der Transport zur Lackiererei ist ein realer Schadenposten — kein Extra.",
    "tldr": "Wenn Ihre Werkstatt das Fahrzeug zum Lackieren zu einem Fachbetrieb bringen muss, sind die <strong>Verbringungskosten</strong> bei konkreter Reparatur Teil des erstattungsfähigen Schadens (§249 BGB). Typisch <strong>80–180 €</strong>. Eine pauschale Ablehnung ist angreifbar, sofern die Kosten tatsächlich anfallen.",
    "brief": "„Verbringungskosten zählen wir nicht an, da nicht ortsüblich.“ — obwohl die Werkstatt nachweislich extern lackiert.",
    "sections": [
      {
        "h2": "Was Verbringungskosten sind",
        "html": "<p>Viele Karosseriebetriebe haben keine eigene Lackierkabine und geben Fahrzeuge dafür an einen Fachbetrieb. Der Transport hin und zurück kostet — das sind die Verbringungskosten. Sie entstehen real und gehören bei konkreter Reparatur zum Schaden.</p>"
      },
      {
        "h2": "Wann sie erstattet werden",
        "html": "<p>Bei <strong>konkreter Reparatur</strong> mit nachgewiesener Verbringung sind die Kosten regelmäßig erstattungsfähig. Bei fiktiver Abrechnung ist die Lage strittiger und hängt von der regionalen Üblichkeit ab. Stehen sie im Gutachten oder auf der Rechnung, ist die pauschale Ablehnung meist nicht haltbar.</p>"
      }
    ],
    "muster": {
      "h2": "Musterbrief: Verbringungskosten nachfordern (zum Kopieren)",
      "intro": "Wenn die Verbringung trotz Reparatur gestrichen wurde.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] haben Sie die Verbringungskosten ([Betrag] €) abgesetzt. Die Reparatur erfolgte konkret; meine Werkstatt lackiert extern, die Verbringung ist nachgewiesen (Gutachten/Rechnung).<br><br>Ich fordere die Erstattung der Verbringungskosten <strong>binnen 14 Tagen</strong>.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Verwandte Kürzungen:",
      "links": [
        {
          "href": "HUB-verbringungskosten.html",
          "label": "Verbringungskosten-Hub"
        },
        {
          "href": "/versicherer-decoder/upe-gestrichen",
          "label": "UPE-Aufschläge gestrichen"
        }
      ]
    },
    "cta": {
      "h": "Verbringung zurückholen",
      "p": "Der Kürzungs-Checker bündelt Ihre gestrichenen Posten — wir vermitteln bei Bedarf Gutachter und Kanzlei.",
      "ctas": [
        "checker",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Sind Verbringungskosten immer erstattungsfähig?",
        "a": "Bei konkreter Reparatur mit nachgewiesener Verbringung regelmäßig ja. Bei fiktiver Abrechnung kommt es auf die regionale Üblichkeit an."
      },
      {
        "q": "Wie hoch sind sie typisch?",
        "a": "Meist rund 80–180 €, je nach Entfernung zur Lackiererei."
      },
      {
        "q": "Woher weiß ich, ob sie anfielen?",
        "a": "Aus dem Gutachten oder der Werkstattrechnung — dort sind Verbringung und Lackierung separat ausgewiesen."
      }
    ],
    "about": [
      "Verbringungskosten",
      "Reparaturkosten",
      "§249 BGB",
      "Schadensregulierung"
    ],
    "sources": "§249 BGB; Rechtsprechung zur konkreten Reparaturabrechnung — gesetze-im-internet.de."
  },
  {
    "slug": "wertminderung-abgelehnt",
    "cluster": "Wertminderung & Co.",
    "crumbLast": "Wertminderung abgelehnt",
    "title": "Merkantile Wertminderung abgelehnt — was steht zu?",
    "headline": "Wertminderung abgelehnt — wann sie Ihnen trotzdem zusteht",
    "metaDesc": "Die Versicherung lehnt die merkantile Wertminderung ab? Wann sie zusteht, wie sie geschätzt wird und wie Sie sie zurückfordern.",
    "h1": "„Eine Wertminderung sehen wir nicht“ — oft zu Unrecht",
    "lede": "Ein repariertes Unfallauto ist weniger wert als ein unfallfreies — auch wenn man nichts mehr sieht. Genau das ist die merkantile Wertminderung.",
    "tldr": "Die <strong>merkantile Wertminderung</strong> entschädigt den Minderwert, den ein Fahrzeug trotz fachgerechter Reparatur als Unfallwagen behält. Sie steht typisch bei Fahrzeugen bis ~5 Jahre / unter ~100.000 km und nicht ganz geringem Schaden zu. Eine pauschale Ablehnung ist oft angreifbar — der Betrag wird gutachterlich geschätzt (Richtwert 5–15 % der Reparaturkosten).",
    "brief": "„Eine merkantile Wertminderung kommt bei diesem Fahrzeug nicht in Betracht.“ — ohne nähere Begründung.",
    "sections": [
      {
        "h2": "Was die merkantile Wertminderung ist",
        "html": "<p>Auch nach perfekter Reparatur bleibt ein Auto ein <strong>Unfallwagen</strong> — und erzielt beim Verkauf weniger. Diesen Marktnachteil gleicht die merkantile Wertminderung aus. Sie ist ein eigener Schadenposten, unabhängig davon, ob Sie verkaufen.</p>"
      },
      {
        "h2": "Wann sie zusteht",
        "html": "<p>Faustregeln: Fahrzeugalter bis etwa 5 Jahre, Laufleistung unter rund 100.000 km, und ein nicht ganz unerheblicher Schaden. Die Höhe schätzt der Gutachter (gängige Methoden wie Ruhkopf/Sahm oder BVSK) — der Rechner unten gibt einen groben Richtwert.</p>"
      }
    ],
    "muster": {
      "h2": "Musterbrief: Wertminderung nachfordern (zum Kopieren)",
      "intro": "Wenn die Wertminderung pauschal abgelehnt wurde.",
      "body": "Sehr geehrte Damen und Herren,<br><br>zum Schaden [Aktenzeichen] haben Sie die merkantile Wertminderung abgelehnt. Mein Gutachten weist sie mit [Betrag] € aus; Fahrzeugalter und Laufleistung liegen im einschlägigen Bereich.<br><br>Ich fordere die Erstattung der Wertminderung <strong>binnen 14 Tagen</strong>.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Mehr dazu:",
      "links": [
        {
          "href": "ARTICLE-merkantile-wertminderung.html",
          "label": "Merkantile Wertminderung"
        },
        {
          "href": "ARTICLE-wertminderung-249-bgb.html",
          "label": "Wertminderung & §249 BGB"
        }
      ]
    },
    "cta": {
      "h": "Wertminderung zurückholen",
      "p": "Der Rechner gibt einen Richtwert; ein Gutachten beziffert sie belastbar. Wir vermitteln Gutachter und Kanzlei.",
      "ctas": [
        "gutachter",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Bekomme ich Wertminderung nur, wenn ich verkaufe?",
        "a": "Nein. Sie ist ein eigener Schadenposten und steht unabhängig vom Verkauf zu."
      },
      {
        "q": "Bei welchen Fahrzeugen entfällt sie?",
        "a": "Bei sehr alten oder sehr hochlaufigen Fahrzeugen sowie bei Bagatellschäden ist sie meist gering oder entfällt."
      },
      {
        "q": "Wie wird die Höhe ermittelt?",
        "a": "Gutachterlich, etwa nach Ruhkopf/Sahm oder der BVSK-Methode — als Richtwert oft 5–15 % der Reparaturkosten."
      }
    ],
    "about": [
      "merkantile Wertminderung",
      "§249 BGB",
      "Kfz-Gutachten",
      "Reparaturkosten"
    ],
    "sources": "§249 BGB; BGH VI ZR 357/03 (merkantile Wertminderung, 23.11.2004); Ruhkopf/Sahm, BVSK — gesetze-im-internet.de."
  },
  {
    "slug": "wir-pruefen-noch",
    "cluster": "Verzögerung",
    "crumbLast": "Wir sind noch in der Prüfung",
    "title": "„Wir sind noch in der Prüfung“ — was die Versicherung meint",
    "headline": "Wir sind noch in der Prüfung — was die Versicherung damit meint",
    "metaDesc": "„Die Bearbeitung läuft noch“ heißt bei klarer Haftung oft: hinhalten. Welche Prüfzeit zulässig ist und wie Sie mit einer Frist Verzug auslöst.",
    "h1": "„Die Bearbeitung läuft noch“ — was die Versicherung damit wirklich sagt",
    "lede": "Die zweite Standard-Floskel nach „wir prüfen den Sachverhalt“. Sie soll Bewegung signalisieren, wo oft keine ist.",
    "tldr": "„Die Bearbeitung läuft“ ist meist ein Platzhalter ohne Selbstbindung. Bei eindeutiger Haftung gilt eine angemessene Prüfzeit von rund <strong>4–6 Wochen ab vollständiger Vorlage</strong>. Wer den Eingang seiner Unterlagen datiert festhält und nach Ablauf <strong>schriftlich eine Frist</strong> setzt, löst Verzug nach §286 BGB aus — ab dann laufen Verzugszinsen (§288 BGB).",
    "brief": "„Ihr Vorgang befindet sich in Bearbeitung. Wir kommen unaufgefordert auf Sie zu.“ Dann: Funkstille.",
    "sections": [
      {
        "h2": "Was dahintersteckt",
        "html": "<p>„In Bearbeitung“ klingt aktiv, bindet die Versicherung aber zu nichts. Solange nichts ausgezahlt ist, bleibt das Geld bei ihr — und mit jeder Woche steigt die Wahrscheinlichkeit, dass Sie ein niedrigeres Angebot akzeptieren, nur um die Sache abzuschließen. Bei klarer Schuldlage ist die „Bearbeitung“ selten ein echtes Sachproblem, sondern eine Frage der Reihenfolge: erst zahlen, wenn es sein muss.</p>"
      },
      {
        "h2": "Was rechtlich gilt",
        "html": "<p>Auch eine laufende Bearbeitung darf nicht beliebig dauern. Liegen alle Unterlagen vollständig vor, ist die Versicherung gehalten, innerhalb einer angemessenen Frist zu regulieren. Nach Fristablauf oder einer Mahnung tritt Verzug ein. Ab da schuldet die Gegenseite Verzugszinsen, und bei klarer Haftung gehören die Kosten anwaltlicher Vertretung zum erstattungsfähigen Schaden.</p>"
      },
      {
        "h2": "Was Sie konkret tun können",
        "html": "<p>Notiere das Datum, an dem Ihre Unterlagen vollständig vorlagen. Reagiert die Versicherung nach rund vier Wochen nicht inhaltlich, setze schriftlich eine Frist von 14 Tagen und kündige Verzugszinsen an. Eine reine „Bearbeitungs“-Auskunft ist keine Regulierung — sie stoppt die Frist nicht.</p>"
      }
    ],
    "table": {
      "cols": [
        "Begriff",
        "Was er bedeutet"
      ],
      "rows": [
        [
          "Prüffrist",
          "~4–6 Wochen ab vollständiger Vorlage (bei klarer Haftung)"
        ],
        [
          "Verzug (§286 BGB)",
          "nach Fristablauf bzw. Mahnung"
        ],
        [
          "Verzugszinsen (§288 BGB)",
          "5 Prozentpunkte über dem Basiszinssatz"
        ]
      ]
    },
    "muster": {
      "h2": "Musterbrief: Frist setzen (zum Kopieren)",
      "intro": "Nach rund vier Wochen ohne inhaltliche Reaktion — am besten per E-Mail mit Lesebestätigung oder Einschreiben.",
      "body": "Sehr geehrte Damen und Herren,<br><br>ich beziehe mich auf den Schaden [Aktenzeichen]. Meine vollständigen Unterlagen liegen Ihnen seit dem [Datum] vor. Ein Hinweis auf „laufende Bearbeitung“ ist keine Regulierung.<br><br>Ich fordere Sie auf, den Schaden <strong>binnen 14 Tagen</strong> zu regulieren. Nach Ablauf befinden Sie sich in Verzug; ich mache dann Verzugszinsen (§288 BGB) sowie die Kosten anwaltlicher Vertretung geltend.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Wenn die Versicherung am Ende kleinrechnet:",
      "links": [
        {
          "href": "/kuerzungs-checker",
          "label": "Kürzungs-Checker"
        },
        {
          "href": "/versicherer-decoder/DECODER-wir-pruefen-sachverhalt.html",
          "label": "„Wir prüfen den Sachverhalt“"
        }
      ]
    },
    "cta": {
      "h": "Frist abgelaufen und nichts passiert?",
      "p": "Wir bringen Sie zu unserer Partnerkanzlei — bei klarer Haftung ohne Kostenrisiko für Sie.",
      "ctas": [
        "lex",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Ist „in Bearbeitung“ schon Verzug?",
        "a": "Nein. Verzug tritt erst nach Ablauf einer angemessenen Frist oder nach einer Mahnung ein. Eine reine Bearbeitungs-Auskunft genügt dafür nicht."
      },
      {
        "q": "Wie lange ist „angemessen“?",
        "a": "Bei klarer Haftung in der Regel 4–6 Wochen ab vollständiger Vorlage der Unterlagen."
      },
      {
        "q": "Was kostet mich der Anwalt?",
        "a": "Bei eindeutiger Haftung der Gegenseite gehören die Anwaltskosten zum erstattungsfähigen Schaden und werden von der gegnerischen Haftpflicht getragen."
      }
    ],
    "about": [
      "Schadensregulierung",
      "Verzug",
      "§286 BGB",
      "§288 BGB",
      "Kfz-Haftpflicht"
    ],
    "sources": "§286 BGB (Verzug), §288 BGB (Verzugszinsen), §249 BGB — gesetze-im-internet.de."
  },
  {
    "slug": "zahlung-dauert",
    "cluster": "Verzögerung",
    "crumbLast": "Zahlung dauert ewig",
    "title": "Versicherung zahlt nicht — wie lange ist normal?",
    "headline": "Die Versicherung zahlt nicht — wie lange ist normal und was tun?",
    "metaDesc": "Reguliert ist anerkannt, aber das Geld kommt nicht? Welche Auszahlungsfrist gilt und wie Sie nach Anerkenntnis schnell an Ihr Geld kommen.",
    "h1": "Anerkannt, aber kein Geld — wenn die Auszahlung sich zieht",
    "lede": "Die Haftung ist dem Grunde nach anerkannt, die Höhe steht — und trotzdem bleibt das Konto leer. Auch jetzt gibt es klare Hebel.",
    "tldr": "Ist die Forderung anerkannt oder unstreitig, gibt es <strong>keinen Grund mehr zu warten</strong>. Eine Auszahlung sollte dann zeitnah erfolgen. Bleibt sie aus, setzt Sie eine kurze Frist; ab Verzug schuldet die Versicherung <strong>Verzugszinsen (§288 BGB)</strong>. Tipp: lass Ihnen ein <strong>Teil-Anerkenntnis</strong> oder einen Vorschuss auf den unstrittigen Betrag auszahlen.",
    "brief": "„Wir haben Ihren Anspruch dem Grunde nach anerkannt. Die Anweisung erfolgt in Kürze.“ Und „in Kürze“ wird zu Wochen.",
    "sections": [
      {
        "h2": "Anerkannt heißt zahlungsreif",
        "html": "<p>Sobald die Versicherung die Haftung anerkennt und die Höhe unstrittig ist, gibt es sachlich keinen Grund mehr für Verzögerung. „In Kürze“ ist keine verbindliche Frist. Eine konkrete, kurze Zahlungsfrist von Ihrer Seite schafft Klarheit und den Hebel für Verzugszinsen.</p>"
      },
      {
        "h2": "Teilzahlung erzwingen",
        "html": "<p>Ist nur ein Teil strittig (etwa die Wertminderung), können Sie auf <strong>sofortige Auszahlung des unstrittigen Betrags</strong> bestehen. Die Versicherung darf nicht den ganzen Betrag zurückhalten, nur weil ein kleiner Posten noch geklärt wird.</p>"
      }
    ],
    "table": {
      "cols": [
        "Situation",
        "Hebel"
      ],
      "rows": [
        [
          "Höhe anerkannt, kein Geld",
          "kurze Zahlungsfrist + Verzugszinsen"
        ],
        [
          "Teil strittig",
          "Auszahlung des unstrittigen Teils fordern"
        ],
        [
          "gar keine Reaktion",
          "Mahnung → Verzug → Anwalt"
        ]
      ]
    },
    "muster": {
      "h2": "Musterbrief: Zahlungsfrist nach Anerkenntnis (zum Kopieren)",
      "intro": "Wenn der Anspruch anerkannt ist, aber das Geld fehlt.",
      "body": "Sehr geehrte Damen und Herren,<br><br>Sie haben den Schaden [Aktenzeichen] dem Grunde nach anerkannt. Eine Auszahlung ist bislang nicht erfolgt.<br><br>Ich fordere Sie auf, den unstrittigen Betrag von [Betrag] € <strong>binnen 10 Tagen</strong> anzuweisen. Nach Ablauf befinden Sie sich in Verzug; ich mache Verzugszinsen (§288 BGB) geltend.<br><br>Mit freundlichen Grüßen<br>[Name]"
    },
    "next": {
      "text": "Wenn ein Posten strittig ist:",
      "links": [
        {
          "href": "/kuerzungs-checker",
          "label": "Kürzungs-Checker"
        },
        {
          "href": "/versicherer-decoder/DECODER-wir-pruefen-sachverhalt.html",
          "label": "„Wir prüfen den Sachverhalt“"
        }
      ]
    },
    "cta": {
      "h": "Anerkannt, aber das Geld kommt nicht?",
      "p": "Unsere Partnerkanzlei holt die Auszahlung samt Verzugszinsen — bei klarer Haftung ohne Kostenrisiko.",
      "ctas": [
        "lex",
        "musterbrief"
      ]
    },
    "faq": [
      {
        "q": "Wie schnell muss nach Anerkenntnis gezahlt werden?",
        "a": "Zeitnah. Ein konkretes „in Kürze“ ohne Datum bindet nicht; eine kurze gesetzte Frist schafft den Verzugshebel."
      },
      {
        "q": "Darf die Versicherung alles zurückhalten, wenn ein Posten strittig ist?",
        "a": "Nein. Den unstrittigen Teil können Sie sofort verlangen; nur der wirklich strittige Posten darf offen bleiben."
      },
      {
        "q": "Bekomme ich Zinsen auf die verspätete Zahlung?",
        "a": "Ab Verzug ja: 5 Prozentpunkte über dem Basiszinssatz (§288 BGB), gerechnet auf den offenen Betrag."
      }
    ],
    "about": [
      "Schadensregulierung",
      "Auszahlung",
      "Verzug",
      "§288 BGB",
      "Anerkenntnis"
    ],
    "sources": "§286 BGB, §288 BGB, §249 BGB — gesetze-im-internet.de."
  }
]
