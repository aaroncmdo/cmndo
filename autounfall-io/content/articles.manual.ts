import type { Article } from '@/lib/article-types'

// Manuell gepflegte Artikel (NICHT aus dem Prototyp-Port). Werden in
// content/articles/index.ts zu allArticles gemerged. Quelle: CREATE-Inbox
// _CONTENT-INBOX-au-io/A1-kba-schluesselnummer.md (Brief-02 C1, freigegeben).
// FAQ bewusst nur in faq[] (FaqAccordion + FAQPage-Schema), nicht zusaetzlich
// im body — vermeidet die FAQ-Doppelung der port-generierten Artikel.
export const manualArticles: Article[] = [
  {
    slug: 'kba-schluesselnummer',
    title: 'KBA-Nummer (Schlüsselnummer): HSN & TSN einfach erklärt',
    h1: 'KBA-Nummer: HSN und TSN im Fahrzeugschein einfach erklärt',
    description:
      'KBA-Nummer im Fahrzeugschein finden und verstehen: Was HSN und TSN bedeuten, wo sie stehen (Feld 2.1 & 2.2) und wofür Sie sie nach einem Unfall brauchen.',
    eyebrow: 'Fahrzeug-Identifikation · 6 Min Lesezeit · Aktualisiert 11.06.2026',
    pillar: { name: 'Gutachter-Ratgeber', slug: 'gutachter-ratgeber' },
    datePublished: '2026-06-11',
    dateModified: '2026-06-11',
    author: 'aaron-sprafke',
    quickAnswer: [
      `Die KBA-Nummer ist die amtliche Schlüsselnummer Ihres Fahrzeugs und besteht aus zwei Teilen: der **HSN** (Herstellerschlüsselnummer, 4-stellig) und der **TSN** (Typschlüsselnummer, alphanumerisch). Sie steht in der Zulassungsbescheinigung Teil I in den Feldern **2.1** und **2.2** und identifiziert Ihr Fahrzeug eindeutig — wichtig für Versicherung, Ersatzteile, Hauptuntersuchung und für die Schadenabwicklung nach einem Unfall.`,
    ],
    body: `Das Kürzel KBA steht für das **Kraftfahrt-Bundesamt** in Flensburg. Diese Behörde vergibt die Schlüsselnummern für jeden in Deutschland zugelassenen Fahrzeugtyp und führt sie in einer zentralen Datenbank.

## Wo finde ich die KBA-Nummer im Fahrzeugschein?

Antwort zuerst: Sie finden die KBA-Nummer in der **Zulassungsbescheinigung Teil I** — das ist das Dokument, das Sie im Auto mitführen müssen. Suchen Sie nach den Feldern mit den Kennziffern **2.1** und **2.2**.

- **Feld 2.1 — HSN (Herstellerschlüsselnummer):** eine vierstellige Zahl, die den Hersteller verschlüsselt (z. B. steht eine bestimmte Nummer für Volkswagen, eine andere für BMW).
- **Feld 2.2 — TSN (Typschlüsselnummer):** eine Kombination aus Buchstaben und Ziffern, die den genauen Fahrzeugtyp, die Variante und die Ausführung beschreibt.

In alten Fahrzeugscheinen (vor Oktober 2005) finden Sie die Angaben an anderer Stelle: Die HSN stand damals unter „zu 2" und die TSN unter „zu 3".

Wichtig: In der Zulassungsbescheinigung Teil II (früher Fahrzeugbrief) stehen die Schlüsselnummern in der Regel ebenfalls, aber dieses Dokument bewahren Sie zu Hause auf und führen es nicht mit.

## Was bedeuten HSN und TSN genau?

Antwort zuerst: HSN und TSN sind zusammen wie ein Fingerabdruck Ihres Fahrzeugmodells. Die HSN sagt, **wer** das Fahrzeug gebaut hat, die TSN sagt, **was genau** es für ein Modell mit welcher Motorisierung und Ausstattungslinie ist.

Erst die Kombination beider Nummern ist eindeutig. Zwei Fahrzeuge desselben Herstellers haben dieselbe HSN, unterscheiden sich aber über die TSN — etwa ein Kombi mit Dieselmotor gegenüber einer Limousine mit Benziner. Genau diese Genauigkeit ist der Grund, warum Versicherer, Werkstätten und Kfz-Sachverständige mit der Schlüsselnummer arbeiten statt nur mit dem Modellnamen.

Die TSN war früher dreistellig; bei moderneren Fahrzeugen kann sie länger und alphanumerisch sein, um die wachsende Zahl an Varianten abzubilden.

## Wofür brauche ich die KBA-Nummer?

Antwort zuerst: Sie brauchen die Schlüsselnummer immer dann, wenn Ihr Fahrzeug **technisch eindeutig** bestimmt werden muss. Die häufigsten Fälle:

- **Kfz-Versicherung:** Über HSN und TSN ermittelt der Versicherer die Typklasse und damit den Beitrag. Beim Wechsel oder Abschluss einer Versicherung werden beide Nummern abgefragt.
- **Ersatzteile bestellen:** Werkstätten und Teilehändler identifizieren über die Schlüsselnummer das passende Teil — vom Bremsbelag bis zum Stoßfänger.
- **Hauptuntersuchung (TÜV/DEKRA):** Die Prüforganisation gleicht die Fahrzeugdaten über die Schlüsselnummer ab.
- **Reifenfreigabe:** Welche Reifengrößen für Ihr Fahrzeug zulässig sind, hängt vom über die Schlüsselnummer bestimmten Typ ab.
- **Schadenabwicklung nach einem Unfall:** Der Kfz-Sachverständige nutzt HSN/TSN zur korrekten Fahrzeugidentifikation, zur Bewertung von [Wiederbeschaffungswert](/wiederbeschaffungswert) und [Restwert](/wbw-restwert-streit) und zur Kalkulation der Reparaturkosten.

Gerade nach einem unverschuldeten Unfall ist die saubere Fahrzeugidentifikation die Grundlage für ein belastbares Gutachten. Wenn der Fahrzeugtyp falsch zugeordnet wird, stimmen am Ende auch Wiederbeschaffungswert und Schadenhöhe nicht.

## KBA-Nummer ohne Fahrzeugschein herausfinden

Antwort zuerst: Ohne die Zulassungsbescheinigung ist es schwieriger, aber nicht unmöglich. Die zuverlässigste Quelle bleibt das Dokument selbst. Falls es nicht greifbar ist, helfen folgende Wege:

- **Versicherungsunterlagen:** In Ihrer Police oder im Online-Kundenkonto sind HSN und TSN oft hinterlegt.
- **Zulassungsstelle:** Die für Sie zuständige Kfz-Zulassungsbehörde kann anhand des Kennzeichens und Ihres Ausweises Auskunft geben.
- **Hersteller/Werkstatt:** Über die Fahrzeug-Identifizierungsnummer (FIN) kann eine Vertragswerkstatt das Modell bestimmen.

Von kostenpflichtigen Online-Diensten, die angeblich „jede" Schlüsselnummer liefern, raten wir ab, solange Sie die Daten kostenlos aus Ihren eigenen Unterlagen bekommen.

## KBA-Nummer und HIS-Datenbank — kein Zusammenhang

Antwort zuerst: Die KBA-Schlüsselnummer hat nichts mit dem **Hinweis- und Informationssystem (HIS)** der Versicherungswirtschaft zu tun. Die Schlüsselnummer beschreibt den Fahrzeugtyp; das HIS speichert auffällige Vorgänge wie gehäufte Schadenmeldungen. Wer nach einem Unfall recherchiert, verwechselt beides leicht — es sind aber zwei völlig getrennte Systeme.

## KBA-Schlüsselnummer und FIN: zwei verschiedene Kennungen

Antwort zuerst: Die Schlüsselnummer (HSN/TSN) beschreibt den **Fahrzeugtyp**, die Fahrzeug-Identifizierungsnummer (FIN) identifiziert dagegen **genau Ihr einzelnes Fahrzeug**. Beide werden leicht verwechselt, erfüllen aber unterschiedliche Aufgaben.

Die FIN (international: VIN) ist eine 17-stellige Kennung, die jedes Fahrzeug weltweit eindeutig macht — vergleichbar mit einer Seriennummer. Sie steht ebenfalls in der Zulassungsbescheinigung (Feld E) und ist zusätzlich am Fahrzeug selbst eingeprägt. Während HSN/TSN sagen, *welcher Typ* das Auto ist, sagt die FIN, *welches konkrete Exemplar*. Für die Schadenabwicklung sind beide nützlich: Die Schlüsselnummer ordnet das Modell ein, die FIN sichert die Identität genau Ihres Fahrzeugs.

## Warum die richtige Fahrzeugidentifikation nach einem Unfall zählt

Antwort zuerst: Stimmt die Typzuordnung nicht, stimmen auch Wiederbeschaffungswert, Restwert und Reparaturkalkulation nicht — und damit Ihr Schadenersatz.

Ein Kfz-Sachverständiger bewertet nach einem Unfall den Wert Ihres Fahrzeugs und die Reparaturkosten. Grundlage ist die exakte Fahrzeugbestimmung über HSN/TSN und FIN. Wird Ihr Auto einem schwächer ausgestatteten oder älteren Typ zugeordnet, fällt der ermittelte Wert zu niedrig aus — zu Ihrem Nachteil. Achten Sie deshalb darauf, dass dem Gutachter vollständige und korrekte Fahrzeugpapiere vorliegen.`,
    faq: [
      {
        q: 'Was ist die KBA-Nummer beim Auto?',
        a: `Die KBA-Nummer ist die amtliche Schlüsselnummer Ihres Fahrzeugs, vergeben vom Kraftfahrt-Bundesamt. Sie besteht aus der Herstellerschlüsselnummer (HSN) und der Typschlüsselnummer (TSN) und identifiziert den Fahrzeugtyp eindeutig. Sie steht in der Zulassungsbescheinigung Teil I in den Feldern 2.1 und 2.2.`,
      },
      {
        q: 'Wo steht die HSN und TSN im Fahrzeugschein?',
        a: `Die HSN steht in Feld 2.1, die TSN in Feld 2.2 der Zulassungsbescheinigung Teil I. In Fahrzeugscheinen, die vor der Dokumentenumstellung ausgestellt wurden, finden Sie die HSN unter „zu 2" und die TSN unter „zu 3".`,
      },
      {
        q: 'Was ist der Unterschied zwischen HSN und TSN?',
        a: `Die HSN ist eine vierstellige Zahl und verschlüsselt den Hersteller. Die TSN ist alphanumerisch und beschreibt den genauen Typ inklusive Variante und Ausführung. Erst beide Nummern zusammen bestimmen das Fahrzeug eindeutig; die HSN allein reicht nicht.`,
      },
      {
        q: 'Brauche ich die KBA-Nummer nach einem Unfall?',
        a: `Indirekt ja. Der Kfz-Sachverständige nutzt HSN und TSN, um Ihr Fahrzeug korrekt zu identifizieren und Wiederbeschaffungswert, Restwert und Reparaturkosten richtig zu bewerten. Sie selbst müssen die Nummer meist nicht heraussuchen — sie steht in Ihren Fahrzeugpapieren, die der Gutachter ohnehin einsieht.`,
      },
      {
        q: 'Kann ich die KBA-Nummer online herausfinden?',
        a: `Am sichersten finden Sie die Nummer in der Zulassungsbescheinigung oder in Ihren Versicherungsunterlagen. Über die FIN kann eine Werkstatt oder die Zulassungsstelle das Modell bestimmen. Kostenpflichtige Online-Dienste sind in der Regel unnötig.`,
      },
      {
        q: 'Ändert sich die KBA-Nummer bei Umbauten?',
        a: `Eintragungspflichtige Änderungen am Fahrzeug können dazu führen, dass sich Einträge in den Papieren ändern. Die grundlegende Typzuordnung über HSN/TSN bleibt aber an den ursprünglichen Fahrzeugtyp gebunden.`,
      },
    ],
    sources: [
      'Kraftfahrt-Bundesamt (KBA), Flensburg — Vergabe der Schlüsselnummern',
      'Zulassungsbescheinigung Teil I, Felder 2.1 / 2.2 — Fahrzeug-Zulassungsverordnung (FZV)',
      'Format und Stellenanzahl von HSN & TSN',
    ],
  },
  {
    slug: 'stundenverrechnungssatz',
    title: 'Stundenverrechnungssatz nach Unfall: welcher Satz erstattungsfähig ist',
    h1: 'Stundenverrechnungssatz: welcher Werkstatt-Satz nach dem Unfall zählt',
    description:
      'Stundenverrechnungssatz nach unverschuldetem Unfall: warum die Marken-Fachwerkstatt zählt und wann die Versicherung nicht auf freie Werkstätten verweisen darf (BGH VI ZR 53/09).',
    eyebrow: 'Reparaturkosten · § 249 BGB · 7 Min Lesezeit · Aktualisiert 12.06.2026',
    pillar: { name: 'Reparatur', slug: 'reparatur' },
    datePublished: '2026-06-12',
    dateModified: '2026-06-12',
    author: 'nicolas-kitta',
    quickAnswer: [
      `Der **Stundenverrechnungssatz** ist der Stundensatz, den eine Werkstatt für ihre Arbeitsleistung berechnet — getrennt nach Mechanik, Karosserie und Lackierung. Nach einem unverschuldeten Unfall sind grundsätzlich die **ortsüblichen Sätze einer markengebundenen Fachwerkstatt** erstattungsfähig (§ 249 BGB). Die gegnerische Versicherung darf Sie nur unter engen Voraussetzungen auf eine günstigere freie Werkstatt verweisen (BGH VI ZR 53/09).`,
    ],
    body: `Der Stundenverrechnungssatz (auch Arbeitsverrechnungssatz) ist neben Ersatzteilen und Lackmaterial der zweite große Kostenblock jeder Reparaturrechnung. Nach einem unverschuldeten Unfall trägt diese Kosten die gegnerische Haftpflichtversicherung — strittig ist meist nur, **welcher** Satz angesetzt werden darf.

## Was ist der Stundenverrechnungssatz?

Antwort zuerst: Der Stundenverrechnungssatz ist der Preis pro Arbeitsstunde, den eine Werkstatt für ihre Leistung berechnet. Er wird in der Regel getrennt ausgewiesen — für **Mechanik/Elektrik, Karosserie/Richtarbeiten und Lackierung** —, weil diese Arbeiten unterschiedliche Qualifikation und Ausstattung erfordern.

Der Satz deckt nicht nur den Lohn des Monteurs ab, sondern die gesamten Betriebskosten der Werkstatt: Personal, Hebebühnen und Spezialwerkzeug, Diagnosegeräte, Miete, Versicherung und einen Gewinnanteil. Wie hoch er ausfällt, hängt von Region und Werkstatt-Typ ab: Markengebundene Fachwerkstätten verlangen üblicherweise mehr als freie Werkstätten.

## Welcher Stundensatz ist nach einem Unfall erstattungsfähig?

Antwort zuerst: Erstattungsfähig sind grundsätzlich die **ortsüblichen Stundensätze einer markengebundenen Fachwerkstatt**. Als unverschuldet Geschädigter dürfen Sie Ihr Fahrzeug fachgerecht in einer qualifizierten Fachwerkstatt instand setzen lassen — auf Kosten der gegnerischen Versicherung (§ 249 BGB).

Maßgeblich ist Ihr Wiederherstellungsinteresse: Sie sollen so gestellt werden, wie Sie ohne den Unfall stünden. Das Sachverständigengutachten weist die ortsüblichen Marken-Stundensätze aus und ist die Grundlage Ihrer Forderung — ob Sie nun konkret reparieren lassen oder auf Gutachtenbasis [fiktiv abrechnen](/fiktive-abrechnung). Bei der fiktiven Abrechnung wird genau an dieser Stelle am häufigsten gekürzt.

## Wann darf die Versicherung auf eine freie Werkstatt verweisen?

Antwort zuerst: Nur unter engen Voraussetzungen. Nach dem BGH-Grundsatzurteil **VI ZR 53/09** darf die Versicherung Sie auf eine günstigere freie Fachwerkstatt verweisen, wenn deren Reparatur **technisch gleichwertig** und für Sie **zumutbar** ist — und die Versicherung das konkret darlegt.

Nicht zumutbar — und damit der Marken-Satz erstattungsfähig — ist die Verweisung typischerweise, wenn:

- Ihr Fahrzeug **jünger als drei Jahre** ist,
- Sie es bisher **scheckheftgepflegt** in einer Marken-Fachwerkstatt warten oder reparieren ließen, oder
- die benannte freie Werkstatt den Qualitätsstandard (Herstellervorgaben, Originalteile) nicht nachweislich einhält.

Die **Darlegungs- und Beweislast für die Gleichwertigkeit trägt die Versicherung.** Ein pauschaler Verweis auf einen abstrakt „günstigeren" Mittelwert genügt nicht — sie muss eine konkrete, für Sie ohne Weiteres zugängliche Werkstatt benennen.

## Marken-Fachwerkstatt oder freie Werkstatt?

Antwort zuerst: Die Wahl liegt bei Ihnen. Lassen Sie konkret reparieren, können Sie die Werkstatt frei wählen; bei Reparatur in der Marken-Fachwerkstatt sind deren ortsübliche Sätze bei berechtigtem Interesse zu erstatten.

Rechnen Sie fiktiv auf Gutachtenbasis ab, bemisst sich der Anspruch nach den im Gutachten ausgewiesenen Marken-Stundensätzen — solange die Versicherung keine zulässige Verweisung darlegt. Wichtig ist in beiden Fällen ein vollständiges Gutachten, das die ortsüblichen Sätze sauber dokumentiert.

## Stundensatz gekürzt — was können Sie tun?

Antwort zuerst: Wenn die Versicherung den Stundenverrechnungssatz kürzt, prüfen Sie die Begründung Position für Position und widersprechen Sie schriftlich. Eine pauschale Kürzung auf einen „mittleren" Satz ohne konkrete, gleichwertige Vergleichswerkstatt ist nach der BGH-Linie meist nicht haltbar.

Wie Sie auf eine konkrete Kürzung reagieren — mit Textbausteinen und Fristen —, zeigt der [Decoder „Stundensatz gekürzt"](/versicherer-decoder/stundensatz-gekuerzt). Grundlage Ihres Widerspruchs ist immer das Sachverständigengutachten mit den ortsüblichen Marken-Sätzen.`,
    faq: [
      {
        q: 'Was ist ein Stundenverrechnungssatz?',
        a: `Der Stundenverrechnungssatz ist der Preis pro Arbeitsstunde, den eine Werkstatt für ihre Leistung berechnet — meist getrennt nach Mechanik, Karosserie und Lackierung. Er deckt die gesamten Betriebskosten der Werkstatt ab, nicht nur den Lohn, und fällt bei markengebundenen Fachwerkstätten in der Regel höher aus als bei freien Werkstätten.`,
      },
      {
        q: 'Welcher Stundensatz wird nach einem unverschuldeten Unfall bezahlt?',
        a: `Grundsätzlich die ortsüblichen Stundensätze einer markengebundenen Fachwerkstatt. Als Geschädigter dürfen Sie Ihr Fahrzeug fachgerecht instand setzen lassen; die gegnerische Haftpflicht trägt die Kosten nach § 249 BGB. Das Sachverständigengutachten weist die maßgeblichen Sätze aus.`,
      },
      {
        q: 'Darf die Versicherung den Stundensatz auf eine freie Werkstatt kürzen?',
        a: `Nur unter engen Voraussetzungen. Die Versicherung muss eine konkrete, technisch gleichwertige und für Sie zumutbare freie Werkstatt benennen und deren Gleichwertigkeit darlegen. Bei Fahrzeugen unter drei Jahren oder durchgehender Scheckheftpflege in der Marken-Fachwerkstatt ist eine Verweisung in der Regel unzulässig.`,
      },
      {
        q: 'Was besagt das BGH-Urteil VI ZR 53/09 zum Stundensatz?',
        a: `Der BGH hat entschieden, dass der Geschädigte grundsätzlich die Stundensätze einer markengebundenen Fachwerkstatt verlangen kann. Eine Verweisung auf eine günstigere freie Werkstatt ist nur zulässig, wenn diese gleichwertig und zumutbar ist — und die Darlegungs- und Beweislast dafür trägt die Versicherung.`,
      },
      {
        q: 'Was kann ich tun, wenn der Stundensatz gekürzt wurde?',
        a: `Prüfen Sie die Kürzungsbegründung und widersprechen Sie schriftlich, gestützt auf das Gutachten mit den ortsüblichen Marken-Sätzen. Eine pauschale Kürzung ohne konkrete, gleichwertige Vergleichswerkstatt ist nach der BGH-Rechtsprechung meist nicht haltbar.`,
      },
    ],
    sources: [
      '§ 249 BGB — Schadensersatz / Naturalrestitution (Wiederherstellungsinteresse)',
      '§ 254 Abs. 2 BGB — Schadensminderungspflicht (dogmatische Basis der Verweisung)',
      'BGH, Urteil vom 20.10.2009, Az. VI ZR 53/09 — Verweisung auf freie Fachwerkstatt (VW-Urteil)',
      'BGH, Urteil vom 23.02.2010, Az. VI ZR 91/09 — Gleichwertigkeit/Zumutbarkeit, 3-Jahres-/Scheckheft-Regel (BMW-Urteil)',
    ],
  },
]
