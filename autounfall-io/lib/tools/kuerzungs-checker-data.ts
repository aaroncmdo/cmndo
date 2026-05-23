// Kuerzungs-Checker Decision-Tree — 1:1 portiert aus assets-autounfall/
// kuerzungs-checker-data.json. Nur die im Widget gerenderten Felder uebernommen
// (positions: id/label/typicalEur/bgh · situations: id/label/tone/headline/body/
// valueAdd/ctaPrimary/ctaSecondary). Nicht gerendert im Quell-Widget und daher
// weggelassen: positions.linkHub, situations.icon, situations.subOptions.
//
// hrefs auf Next-Routen umgeschrieben (STANDALONE, kein Claimondo, keine .html):
//   SACHVERSTAENDIGE-FINDEN.html?... → /gutachter-finden?...   (Lead-Form, WP-6)
//   ARTICLE-<slug>.html              → /<slug>                  (flache Artikel, WP-2)
//   MONIKA-FAKTEN-PAKET.md           → /ratgeber/bgh-argumente-spickzettel (Leadmagnet, WP-7)
//   https://lex-drive.com            → unveraendert (Partnerkanzlei)
// /gutachter-finden + /ratgeber/* existieren erst ab WP-6/WP-7 (transienter 404,
// bewusst — wie WP-2/3-Cross-Links).

export type KCheckTone = 'rescue' | 'fight' | 'split' | 'perfect'

export type KCheckPosition = {
  id: string
  label: string
  /** Typischer Differenzbetrag in € (Erfahrungswert). */
  typicalEur: number
  bgh: string
}

export type KCheckCta = { label: string; href: string }

export type KCheckSituation = {
  id: string
  label: string
  tone: KCheckTone
  headline: string
  /** Enthaelt kontrolliertes <strong>-Markup → via dangerouslySetInnerHTML. */
  body: string
  valueAdd: { financial: string; time: string; emotional: string }
  ctaPrimary: KCheckCta
  ctaSecondary: KCheckCta
}

export const KCHECK_POSITIONS: KCheckPosition[] = [
  { id: 'verbringung', label: 'Verbringungskosten', typicalEur: 130, bgh: 'VI ZR 174/24' },
  { id: 'upe', label: 'UPE-Aufschläge', typicalEur: 280, bgh: 'VI ZR 234/16' },
  { id: 'wertminderung', label: 'Wertminderung', typicalEur: 800, bgh: 'VI ZR 174/24' },
  { id: 'nutzungsausfall', label: 'Nutzungsausfall', typicalEur: 500, bgh: 'Sanden/Danner' },
  { id: 'sv-kosten', label: 'Sachverständigen-Kosten', typicalEur: 900, bgh: 'VI ZR 65/18' },
  { id: 'mietwagen', label: 'Mietwagenkosten', typicalEur: 400, bgh: 'VI ZR 211/15' },
]

export const KCHECK_SITUATIONS: KCheckSituation[] = [
  {
    id: 'A',
    label: 'Nur Kostenvoranschlag (KVA)',
    tone: 'rescue',
    headline: 'Es ist noch nicht zu spät',
    body: 'Sie haben bisher nur einen Kostenvoranschlag der Werkstatt — kein unabhängiges Gutachten. <strong>Sie können jetzt noch ein Gutachten beauftragen.</strong> Die Differenz zwischen KVA und Gutachten liegt typisch bei 1.000–2.000 €, weil der KVA Wertminderung, Nutzungsausfall, Verbringung und UPE-Aufschläge meist nicht enthält.',
    ctaPrimary: { label: 'Kostenlosen Gutachter anfordern', href: '/gutachter-finden?ref=kuerzungs-checker&situation=A' },
    ctaSecondary: { label: 'Was rechnet ein Gutachten anders?', href: '/gutachter-lohnt-sich' },
    valueAdd: {
      financial: '1.000–2.000 € typische Differenz',
      time: 'Gutachter vor Ort innerhalb 48 h',
      emotional: 'Klare Beweislage statt Werkstatt-Schätzung',
    },
  },
  {
    id: 'B',
    label: 'Versicherungs-Gutachter war da',
    tone: 'rescue',
    headline: 'Das war NICHT IHR Gutachter',
    body: 'Der von der gegnerischen Versicherung beauftragte Gutachter ist nicht neutral — er arbeitet im Auftrag der VS. Sie haben nach <strong>BGH VI ZR 65/18</strong> das Recht auf einen eigenen unabhängigen Sachverständigen. Die Kosten trägt die gegnerische Haftpflicht.',
    ctaPrimary: { label: 'Eigenen Gutachter anfordern', href: '/gutachter-finden?ref=kuerzungs-checker&situation=B' },
    ctaSecondary: { label: 'Warum eigener Gutachter wichtig ist', href: '/gutachter-versicherungs-pruefdienst' },
    valueAdd: {
      financial: '800–1.500 € typische Differenz',
      time: 'Eigener Gutachter ortet die Lücken im VS-Gutachten',
      emotional: 'Neutrale Beweissicherung statt VS-Sicht',
    },
  },
  {
    id: 'C',
    label: 'Eigenes Gutachten · VS kürzt trotzdem',
    tone: 'fight',
    headline: 'Die Versicherung muss zahlen',
    body: 'Wenn Sie bereits ein unabhängiges Gutachten haben und die VS kürzt trotzdem, ist das fast immer ein angreifbarer Bescheid. Mit dem Gutachten als Beleg und der BGH-Linie als Argument lassen sich die gestrichenen Positionen in der Regel nachfordern. Eine anwaltliche Begleitung erhöht die Erfolgsquote deutlich.',
    ctaPrimary: { label: 'LexDrive Erstberatung kostenlos', href: 'https://lex-drive.com' },
    ctaSecondary: { label: 'BGH-Argumente parat haben', href: '/ratgeber/bgh-argumente-spickzettel' },
    valueAdd: {
      financial: 'Volle Differenz zwischen VS-Auszahlung und Gutachten-Forderung',
      time: '15 min Erstberatung · binnen 48 h Schreiben an VS',
      emotional: 'Kanzlei verhandelt — Sie nicht',
    },
  },
  {
    id: 'D',
    label: 'Geld schon bekommen',
    tone: 'split',
    headline: 'Was Sie unterschrieben haben, entscheidet',
    body: 'Bei bereits ausgezahltem Geld ist die Frage: <strong>haben Sie eine Ausgleichsquittung unterschrieben?</strong> Wenn ja, ist eine Nachforderung schwieriger (aber nicht unmöglich). Wenn nein, ist die Nachforderung in der Regel offen. Eine kurze anwaltliche Prüfung klärt das in wenigen Minuten.',
    ctaPrimary: { label: 'Anwalt soll prüfen', href: 'https://lex-drive.com' },
    ctaSecondary: { label: 'Was ist eine Ausgleichsquittung?', href: '/schuldanerkenntnis-vermeiden' },
    valueAdd: {
      financial: 'Je nach Quittungs-Status 0–100 % nachfordbar',
      time: '15 min Anwaltsprüfung der Quittung',
      emotional: 'Klarheit, was noch geht und was nicht',
    },
  },
  {
    id: 'E',
    label: 'Noch gar nichts gemacht',
    tone: 'perfect',
    headline: 'Perfekt · richtige Reihenfolge',
    body: 'Sie sind noch am Anfang — und das ist die beste Position. Die richtige Reihenfolge: <strong>Erst Gutachten, dann Versicherung anschreiben.</strong> Mit einem unabhängigen Gutachten als Basis ist die VS gezwungen, alle Positionen anzuerkennen. Wenn Sie zuerst die VS anrufen, schreibt sie das Skript.',
    ctaPrimary: { label: 'Sachverständigen anfragen', href: '/gutachter-finden?ref=kuerzungs-checker&situation=E' },
    ctaSecondary: { label: 'Was Sie der VS sagen sollten (und nicht)', href: '/versicherungs-anruf-was-sagen' },
    valueAdd: {
      financial: 'Volle Schadenssumme nach §249 BGB · keine Kürzungen vorprogrammiert',
      time: '48 h bis Gutachter da · Schreiben an VS folgt',
      emotional: 'Sie führen den Prozess, nicht die VS',
    },
  },
]
