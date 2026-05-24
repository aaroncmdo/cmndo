import type { Decoder } from '@/lib/decoder-types'

// WP-7-Nachzügler: der 21. Versicherer-Decoder. In WP-3 quellen-treu ausgelassen,
// weil er in decoder_content.py fehlte (WP-3-Quelle). Hier aus dem Prototyp-HTML
// DECODER-wir-pruefen-sachverhalt.html portiert (Canonical-Slug = den-sachverhalt).
// Separater File → die 20 WP-3-Decoder bleiben unberührt; der Loader konkateniert.
// hrefs auf Routen umgeschrieben (next.links → /<artikel-slug>, NICHT .html).
export const decodersExtra: Decoder[] = [
  {
    slug: 'wir-pruefen-den-sachverhalt',
    cluster: 'Verzögerung',
    crumbLast: '„Wir prüfen den Sachverhalt"',
    title: '„Wir prüfen den Sachverhalt" — was die Versicherung damit meint',
    headline: '„Wir prüfen den Sachverhalt" — was die Versicherung damit wirklich meint',
    metaDesc:
      '„Wir prüfen den Sachverhalt" heißt meist: Zeit gewinnen. Was der Satz bedeutet, wie lange die Versicherung wirklich prüfen darf (4–6 Wochen) und wie Sie Verzug auslösen — mit Verzugszinsen-Rechner.',
    h1: '„Wir prüfen den Sachverhalt" — was die Versicherung damit wirklich meint',
    lede: 'Dieser Satz steht in fast jedem ersten Schreiben der gegnerischen Haftpflicht. Klingt nach Sorgfalt — ist aber meist eine Formulierung, um Zeit zu gewinnen.',
    tldr: '„Wir prüfen den Sachverhalt" bedeutet bei klarer Schuld meist: <strong>verzögern, ohne sich zu binden</strong>. Bei eindeutiger Haftung hat die Versicherung aber nur eine angemessene Prüfzeit von <strong>4–6 Wochen ab vollständiger Vorlage</strong>. Danach können Sie mit einer Frist Verzug auslösen — ab dann gibt es Verzugszinsen (5 % über Basiszins, § 288 BGB), und die Anwaltskosten trägt die Gegenseite.',
    brief:
      '„Wir prüfen den Sachverhalt und kommen unaufgefordert auf Sie zu." — ohne Termin, ohne Zusage, ohne Frist.',
    sections: [
      {
        h2: 'Was die Versicherung damit bezweckt',
        html: '<p>Hinter dem Satz steckt bei eindeutiger Schuld selten echte Unklarheit — meist ist längst alles klar. Für die Versicherung zählt etwas anderes: Solange nicht ausgezahlt ist, bleibt das Geld auf ihrer Seite. Und je länger sich die Sache zieht, desto eher geben Sie sich am Ende mit einem niedrigeren Angebot zufrieden. „Wir prüfen den Sachverhalt" <strong>hält Sie vor allem hin</strong> — und bindet die Versicherung zu nichts.</p>',
      },
      {
        h2: 'Was rechtlich gilt',
        html: '<p>Bei klarer Haftung der Gegenseite darf die Prüfung nicht beliebig dauern. Die Rechtsprechung geht von einer <strong>angemessenen Regulierungsfrist von etwa 4 bis 6 Wochen</strong> ab dem Tag aus, an dem alle Unterlagen vollständig vorliegen (Schadensmeldung, Gutachten, ggf. Reparaturrechnung). Läuft diese Frist ab, kann <strong>Verzug</strong> eintreten.</p>',
      },
      {
        h2: 'Was Sie konkret tun können',
        html: '<p>Halten Sie den Tag fest, an dem Sie alle Unterlagen eingereicht haben — ab da läuft die Frist. Reagiert die Versicherung nach rund vier Wochen nicht, setzen Sie <strong>schriftlich eine Frist</strong> (z. B. 14 Tage) und kündigen Verzugszinsen an. Kommt danach nichts, lohnt sich anwaltliche Hilfe — die Kosten trägt bei klarer Haftung ohnehin die Gegenseite.</p><p>Eine grobe Orientierung, welche Verzugszinsen sich aufbauen, gibt der <a href="/rechner">Verzugszinsen-Rechner</a>.</p>',
      },
    ],
    table: {
      cols: ['Begriff', 'Was er bedeutet'],
      rows: [
        ['Prüffrist', '~4–6 Wochen ab vollständiger Vorlage (bei klarer Haftung)'],
        ['Verzug (§ 286 BGB)', 'tritt nach Fristablauf bzw. Mahnung ein'],
        ['Verzugszinsen (§ 288 BGB)', '5 Prozentpunkte über dem Basiszinssatz, ab Verzug'],
        ['Anwaltskosten', 'bei klarer Haftung Teil des erstattungsfähigen Schadens'],
      ],
    },
    muster: {
      h2: 'Musterbrief: Frist setzen (zum Kopieren)',
      intro:
        'Schicken Sie das nach rund vier Wochen ohne Reaktion — am besten per E-Mail mit Lesebestätigung oder per Einschreiben. Es macht den Verzug eindeutig.',
      body:
        'Sehr geehrte Damen und Herren,<br><br>ich beziehe mich auf den Schaden [Aktenzeichen] vom [Datum]. Meine vollständigen Unterlagen liegen Ihnen seit dem [Datum] vor. Eine Regulierung ist bislang nicht erfolgt.<br><br>Ich fordere Sie auf, den Schaden <strong>binnen 14 Tagen</strong> zu regulieren. Nach Ablauf befinden Sie sich in Verzug; ich werde dann Verzugszinsen (5 Prozentpunkte über dem Basiszinssatz, § 288 BGB) sowie die Kosten anwaltlicher Vertretung geltend machen.<br><br>Mit freundlichen Grüßen<br>[Name]',
    },
    next: {
      text: 'So geht es weiter:',
      links: [
        { href: '/werkstattrisiko-bgh-2024', label: 'Werkstattrisiko (BGH 2024)' },
        { href: '/verweisrecht-versicherung', label: 'Verweisung auf günstigere Werkstatt' },
      ],
    },
    cta: {
      h: 'Frist abgelaufen und nichts passiert?',
      p: 'Wir bringen Sie zu unserer Partnerkanzlei — bei klarer Haftung ohne Kostenrisiko für Sie. Und falls Sie noch kein Gutachten haben: einen unabhängigen Gutachter vermitteln wir gleich mit.',
      ctas: ['lex', 'gutachter'],
    },
    faq: [
      {
        q: 'Wie lange darf die Versicherung wirklich prüfen?',
        a: 'Bei klarer Haftung gilt eine angemessene Prüfungsfrist von in der Regel 4 bis 6 Wochen ab vollständiger Vorlage der Unterlagen. Danach kann Verzug eintreten.',
      },
      {
        q: 'Muss ich eine Frist setzen, damit Verzug eintritt?',
        a: 'Eine schriftliche Mahnung mit Frist macht den Verzug eindeutig nachweisbar und beschleunigt die Regulierung. Ab Verzug fallen Verzugszinsen von 5 Prozentpunkten über dem Basiszinssatz an (§ 288 BGB).',
      },
      {
        q: 'Was bringt mir der Verzug konkret?',
        a: 'Ab Verzug schuldet die Versicherung Verzugszinsen; bei klarer Haftung gehören außerdem die Kosten anwaltlicher Vertretung zum erstattungsfähigen Schaden.',
      },
    ],
    about: [
      'Redaktion autounfall.io — in Partnerschaft mit der Verkehrsrechts-Kanzlei LexDrive UG. autounfall.io ist ein redaktionelles Ratgeber-Angebot; im konkreten Fall ersetzt es keine individuelle Rechtsberatung.',
    ],
    sources:
      '§ 286 BGB (Verzug), § 288 BGB (Verzugszinsen), § 249 BGB (Schadensersatz) — gesetze-im-internet.de; BGH-Rechtsprechung zur Regulierungsfrist. Stand: Mai 2026.',
  },
]
