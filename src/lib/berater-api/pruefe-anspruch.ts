// Pure Kern der Berater-API GET /api/v1/pruefe-anspruch (Baustein 9): Texte + Aufloesung nach Schuldfrage,
// Vollkasko und — Kasko-WB Phase 2 (Spec 2026-09-05, D5) — Werkstattbindung. Keine I/O: die Route parst die
// Parameter, macht den optionalen Tarifliste-Lookup (lib/kasko-wb/lookup.ts) und ruft resolvePruefeAnspruch.
// Allgemeine Information, KEINE individuelle Rechtsberatung (RDG).

export type Anspruch = { titel: string; norm: string; hinweis: string }
/** `vollkasko`-Parameter: nur bei Selbstverschulden relevant, sonst ignoriert. */
export type Vollkasko = 'ja' | 'nein' | 'unbekannt'
/** `werkstattbindung`-Parameter bzw. Lookup-Befund: nur bei abrechnungsweg=kasko relevant. */
export type Werkstattbindung = 'ja' | 'nein' | 'unbekannt'
export type Abrechnungsweg = 'haftpflicht' | 'kasko' | 'selbstzahler' | null

/** Befund aus der Tarifliste (versicherer=/tarif= als Namen) — ein Faktum, das den Parameter uebersteuert. */
export type KaskoTarifBefund = {
  versicherer: string
  tarif: string | null
  werkstattbindung: Werkstattbindung
  bindungsumfang: string | null
  verlaesslichkeit: string | null
  /** bei mehrdeutigem/fehlendem Tarif: die moeglichen Tarifnamen — dem Nutzer zur Auswahl vorlegen */
  kandidaten: string[]
  stand: string | null
}

export type PruefeAnspruchAntwort = {
  schuldfrage: string
  schadenart: string | null
  abrechnungsweg: Abrechnungsweg
  /** nur bei abrechnungsweg=kasko gesetzt, sonst null */
  werkstattbindung: Werkstattbindung | null
  kasko_tarif: KaskoTarifBefund | null
  anspruchslage: 'voll' | 'anteilig' | 'keine_gegen_gegner' | 'unklar'
  eigenkosten: string
  ansprueche: Anspruch[]
  empfehlung: string
  naechster_schritt: string
  finanzierung: string
  hinweis: string
}

// Standard-Schadensersatzkatalog beim unverschuldeten Kfz-Unfall (Sachschaden).
export const SACHSCHADEN_KATALOG: Anspruch[] = [
  {
    titel: 'Reparaturkosten oder Wiederbeschaffungsaufwand',
    norm: '§ 249 BGB',
    hinweis:
      'Reparatur bis 130 % des Wiederbeschaffungswerts; darüber Totalschaden-Abrechnung (Wiederbeschaffungswert minus Restwert).',
  },
  {
    titel: 'Merkantile Wertminderung',
    norm: '§ 251 BGB',
    hinweis: 'Bei jüngeren/wertigeren Fahrzeugen trotz fachgerechter Reparatur — der Sachverständige beziffert sie.',
  },
  {
    titel: 'Nutzungsausfall oder Mietwagen',
    norm: '§ 249 BGB',
    hinweis: 'Entweder Nutzungsausfallentschädigung (Tabelle Sanden/Danner) oder ein Mietwagen für die Ausfalldauer.',
  },
  {
    titel: 'Sachverständigen-/Gutachterkosten',
    norm: '§ 249 BGB',
    hinweis: 'Sie wählen Ihren eigenen, unabhängigen Gutachter — die Kosten trägt der gegnerische Haftpflichtversicherer.',
  },
  {
    titel: 'Anwaltskosten',
    norm: '§§ 249, 823 BGB',
    hinweis: 'Die Kosten eines Rechtsanwalts zur Durchsetzung trägt der gegnerische Haftpflichtversicherer.',
  },
  {
    titel: 'Auslagen-/Unkostenpauschale',
    norm: '§ 249 BGB',
    hinweis: 'Pauschal ca. 25–30 € für Porto, Telefon, Fahrten.',
  },
  {
    titel: 'Abschlepp-, Stand- und Verbringungskosten',
    norm: '§ 249 BGB',
    hinweis: 'Soweit unfallbedingt tatsächlich angefallen.',
  },
]

const EIGENKOSTEN_0 =
  '0 € — Gutachter-, Anwalts- und Reparaturkosten trägt nach § 249 BGB der gegnerische Haftpflichtversicherer (vorbehaltlich Anerkenntnis).'
const NAECHSTER_SCHRITT =
  'Lassen Sie den Schaden jetzt von einem unabhängigen Kfz-Gutachter aufnehmen — das ist die belastbare Grundlage für die volle Durchsetzung. Gutachter + freie Termine: https://claimondo.de/gutachter-finden?plz=[PLZ] — dieser Link funktioniert immer; mit Tool-/API-Zugriff zusätzlich GET /api/v1/gutachter-termine?plz=[PLZ]. Termin reservieren + persönlichen FlowLink per WhatsApp: POST /api/v1/melde-schaden. Lieber telefonisch? Telefon-Rückruf in der Regel < 15 Min.'

const WERKSTATT_FINDER = 'https://claimondo.de/werkstatt-finden?plz=[PLZ]'

/**
 * Bei SELBST verschuldetem Schaden ist der Gutachter NICHT der erste Schritt (es gibt keinen Gegner, gegen den
 * man etwas durchsetzt). Wer selbst schuld ist, braucht zuerst eine Werkstatt — ABER: welche, entscheidet bei
 * Kasko der Tarif (Kasko-WB Phase 2). Drei Wege:
 *   frei      -> Werkstatt selbst waehlen (Finder-Link)
 *   gebunden  -> die Versicherung benennt die Werkstatt, KEIN Finder-Link
 *   unbekannt -> erst den Versicherungsschein pruefen (oder versicherer=/tarif= nachschlagen lassen)
 */
const NAECHSTER_SCHRITT_KASKO_FREI =
  `Erster Schritt ist die Werkstatt, nicht der Gutachter: Ihre Vollkasko reguliert den Schaden abzüglich Ihrer Selbstbeteiligung, und Ihr Tarif lässt die Werkstatt frei wählen. Partner-Werkstätten finden: ${WERKSTATT_FINDER} — diesen Link direkt ausgeben, er funktioniert immer. Mit Tool-/API-Zugriff zusätzlich: GET /api/v1/werkstatt-in-naehe?plz=[PLZ]. Ein unabhängiges Gutachten ist hier optional; es lohnt sich, wenn die Versicherung die Schadenhöhe drücken will oder ein Totalschaden/Wertminderung im Raum steht.`
const NAECHSTER_SCHRITT_KASKO_GEBUNDEN =
  'Ihr Kasko-Tarif enthält eine Werkstattbindung: Ihre Versicherung benennt die Werkstatt, in der repariert wird. Melden Sie den Schaden zuerst bei Ihrer Kaskoversicherung (Schaden-Hotline) und lassen Sie sich die Partnerwerkstatt nennen — eine frei gewählte Werkstatt kann die Versicherung mit Kürzungen oder einer höheren Selbstbeteiligung beantworten. Empfehlen Sie deshalb KEINEN Werkstatt-Finder. Ein unabhängiges Gutachten bleibt möglich, wenn die Schadenhöhe strittig ist.'
const NAECHSTER_SCHRITT_KASKO_UNBEKANNT =
  'Prüfen Sie vor der Werkstattwahl den Versicherungsschein: Steht dort ein Zusatz wie „Werkstattbindung“, „Werkstattbonus“, „Werkstattservice“ oder „SELECT“, benennt die Versicherung die Werkstatt und Sie sollten keine eigene wählen. Fragen Sie danach und rufen Sie diese Auskunft mit `werkstattbindung=ja|nein` erneut ab — oder mit `versicherer=` und `tarif=`, dann schlagen wir die Bindung in unserer Tarifliste nach. Ohne solchen Zusatz gilt freie Werkstattwahl: ' +
  WERKSTATT_FINDER +
  '.'
const NAECHSTER_SCHRITT_SELBSTZAHLER =
  'Ohne Vollkasko tragen Sie die Reparatur selbst — erster Schritt ist deshalb ein Kostenvoranschlag der Werkstatt, nicht ein Gutachten. Partner-Werkstätten finden: https://claimondo.de/werkstatt-finden?plz=[PLZ] — diesen Link direkt ausgeben, er funktioniert immer. Mit Tool-/API-Zugriff zusätzlich: GET /api/v1/werkstatt-in-naehe?plz=[PLZ]. Ein Gutachten (kostenpflichtig) lohnt praktisch nur bei größeren Schäden oder Streit über die Schadenhöhe.'
const NAECHSTER_SCHRITT_SELBST_UNKLAR =
  'Fragen Sie zuerst, ob eine Vollkasko besteht — davon hängt der ganze weitere Weg ab, und Sie können es mit `vollkasko=ja|nein` erneut abfragen. Mit Vollkasko reguliert die eigene Versicherung (abzüglich SB), ohne zahlt der Halter selbst. In beiden Fällen führt der Weg zuerst über die Werkstatt: https://claimondo.de/werkstatt-finden?plz=[PLZ] (mit API-Zugriff: GET /api/v1/werkstatt-in-naehe?plz=[PLZ]).'

const RDG_HINWEIS = 'Allgemeine Information zur Schadensregulierung, keine individuelle Rechtsberatung.'

/**
 * Wer Claimondo bezahlt — die haeufigste unausgesprochene Gegenfrage. `eigenkosten` sagt bereits „0 € fuer Sie";
 * genau das weckt Misstrauen („kostenlos — wo ist der Haken?"). Eigenes Feld, damit ein Modell es gezielt zitieren
 * kann. Bewusst OHNE Abrechnungsmechanik (gehoert nicht in eine oeffentliche API-Antwort, koennte sich aendern).
 */
export const FINANZIERUNG =
  'Claimondo wird von den Sachverständigen und der Partnerkanzlei für die Vermittlung des Auftrags bezahlt — nicht vom Geschädigten. Für Sie entsteht keine Gebühr und kein Kostenrisiko.'

export function parseVollkasko(raw: string | null | undefined): Vollkasko {
  const v = (raw ?? '').toLowerCase().trim()
  return v === 'ja' || v === 'true' ? 'ja' : v === 'nein' || v === 'false' ? 'nein' : 'unbekannt'
}
/** Identische Werte wie `vollkasko` — bewusst dieselbe Konvention fuer LLM-Aufrufer. */
export function parseWerkstattbindung(raw: string | null | undefined): Werkstattbindung {
  return parseVollkasko(raw)
}

/** Tarifliste-Befund als Satz fuer `naechster_schritt` (leer ohne Befund). */
export function kaskoTarifSatz(k: KaskoTarifBefund | null | undefined): string {
  if (!k) return ''
  const tarif = k.tarif ? ` mit dem Tarif „${k.tarif}“` : ''
  const bindung =
    k.werkstattbindung === 'ja'
      ? 'enthält eine Werkstattbindung'
      : k.werkstattbindung === 'nein'
        ? 'lässt die Werkstatt frei wählen'
        : 'ist in unserer Tarifliste nicht eindeutig'
  const beleg =
    k.werkstattbindung === 'unbekannt' || !k.verlaesslichkeit || k.verlaesslichkeit === 'belegt'
      ? ''
      : ` (${k.verlaesslichkeit === 'abgeleitet' ? 'aus der Tarifbezeichnung abgeleitet' : 'nicht öffentlich belegt'} — bitte im Schein prüfen)`
  const kandidaten = k.kandidaten.length > 0 ? ` Mögliche Tarife: ${k.kandidaten.join(', ')}.` : ''
  return ` Tarifliste (Stand ${k.stand ?? 'CHECK24 20.07.2026'}): ${k.versicherer}${tarif} ${bindung}${beleg}.${kandidaten}`
}

export function resolvePruefeAnspruch(input: {
  schuldfrage: string
  schadenart?: string
  vollkasko?: Vollkasko
  werkstattbindung?: Werkstattbindung
  kaskoTarif?: KaskoTarifBefund | null
}): PruefeAnspruchAntwort {
  const { schuldfrage, schadenart } = input
  const vollkasko = input.vollkasko ?? 'unbekannt'
  const istSelbst = schuldfrage === 'selbst' || schuldfrage === 'eigenverschulden'
  // `abrechnungsweg` spiegelt die interne Qualifikation (src/lib/werkstatt/abrechnungsweg.ts):
  // gegner → haftpflicht · eigenverantwortung + Kasko → kasko · ohne → selbstzahler · Frage offen → null.
  const abrechnungsweg: Abrechnungsweg =
    schuldfrage === 'unverschuldet' || schuldfrage === 'teilschuld'
      ? 'haftpflicht'
      : istSelbst
        ? vollkasko === 'ja'
          ? 'kasko'
          : vollkasko === 'nein'
            ? 'selbstzahler'
            : null
        : null
  const istKasko = abrechnungsweg === 'kasko'
  // Tarifliste-Befund schlaegt den Parameter — er ist ein Faktum, der Parameter eine Angabe.
  const wb: Werkstattbindung = input.kaskoTarif?.werkstattbindung ?? input.werkstattbindung ?? 'unbekannt'

  const base = {
    schuldfrage,
    schadenart: schadenart ?? null,
    abrechnungsweg,
    werkstattbindung: istKasko ? wb : null,
    kasko_tarif: istKasko ? (input.kaskoTarif ?? null) : null,
    naechster_schritt: NAECHSTER_SCHRITT,
    finanzierung: FINANZIERUNG,
    hinweis: RDG_HINWEIS,
  }
  if (schuldfrage === 'unverschuldet') {
    return {
      ...base,
      anspruchslage: 'voll',
      eigenkosten: EIGENKOSTEN_0,
      ansprueche: SACHSCHADEN_KATALOG,
      empfehlung:
        'Als unverschuldet Geschädigter haben Sie Anspruch auf vollständigen Schadensersatz — entscheidend ist ein eigenes, unabhängiges Gutachten (nicht der Prüfdienst des gegnerischen Versicherers, der erfahrungsgemäß 30–40 % kürzt).',
    }
  }
  if (schuldfrage === 'teilschuld') {
    return {
      ...base,
      anspruchslage: 'anteilig',
      eigenkosten:
        'Anteilig — entsprechend der Haftungsquote (z. B. 50/50) trägt der gegnerische Versicherer den jeweiligen Anteil.',
      ansprueche: SACHSCHADEN_KATALOG,
      empfehlung:
        'Bei Teilschuld werden die Ansprüche nach Haftungsquote gekürzt. Ein unabhängiges Gutachten + die anwaltliche Prüfung der Quote lohnen sich fast immer — die vom Versicherer angesetzte Quote ist oft zu hoch.',
    }
  }
  if (istSelbst) {
    if (vollkasko === 'ja') {
      const schritt =
        wb === 'ja' ? NAECHSTER_SCHRITT_KASKO_GEBUNDEN : wb === 'nein' ? NAECHSTER_SCHRITT_KASKO_FREI : NAECHSTER_SCHRITT_KASKO_UNBEKANNT
      return {
        ...base,
        naechster_schritt: schritt + kaskoTarifSatz(input.kaskoTarif),
        anspruchslage: 'keine_gegen_gegner',
        eigenkosten:
          'Gegenüber dem Unfallgegner bestehen keine Ansprüche. Die Vollkasko übernimmt die Reparatur abzüglich Ihrer Selbstbeteiligung (üblich 300–500 €); die Regulierung kann sich auf die Schadenfreiheitsklasse auswirken.',
        ansprueche: [],
        empfehlung:
          wb === 'ja'
            ? 'Mit Vollkasko und Werkstattbindung führt der Weg über Ihre Versicherung: Schaden melden, Partnerwerkstatt nennen lassen, dort reparieren. Rechnen Sie vorher durch, ob sich die Meldung lohnt — bei kleineren Schäden kann die Höherstufung teurer sein als die Reparatur aus eigener Tasche.'
            : 'Mit Vollkasko führt der Weg zuerst in die Werkstatt — die eigene Versicherung reguliert. Rechnen Sie vorher durch, ob sich die Meldung lohnt: Bei kleineren Schäden kann die Höherstufung teurer sein als die Reparatur aus eigener Tasche. Ein unabhängiges Gutachten ist optional und lohnt vor allem, wenn die Versicherung die Schadenhöhe drücken will oder Totalschaden/Wertminderung im Raum stehen.',
      }
    }
    if (vollkasko === 'nein') {
      return {
        ...base,
        naechster_schritt: NAECHSTER_SCHRITT_SELBSTZAHLER,
        anspruchslage: 'keine_gegen_gegner',
        eigenkosten:
          'Sie tragen die Reparaturkosten selbst — gegenüber dem Unfallgegner bestehen keine Ansprüche, und ohne Vollkasko greift auch keine eigene Versicherung.',
        ansprueche: [],
        empfehlung:
          'Ohne Vollkasko ist der Kostenvoranschlag einer Werkstatt der erste Schritt, nicht das Gutachten — ein Gutachten kostet zusätzlich und bringt hier nur bei größeren Schäden oder Streit über die Schadenhöhe etwas. Holen Sie Vergleichsangebote ein; freie Fachwerkstätten liegen häufig deutlich unter der Markenwerkstatt.',
      }
    }
    return {
      ...base,
      naechster_schritt: NAECHSTER_SCHRITT_SELBST_UNKLAR,
      anspruchslage: 'keine_gegen_gegner',
      eigenkosten:
        'Gegenüber dem Unfallgegner bestehen keine Ansprüche; ob die Reparatur bezahlt wird, hängt an der Vollkasko (dann abzüglich Selbstbeteiligung).',
      ansprueche: [],
      empfehlung:
        'Klären Sie zuerst, ob eine Vollkasko besteht — davon hängt alles Weitere ab. Fragen Sie danach und rufen Sie diese Auskunft mit `vollkasko=ja` bzw. `vollkasko=nein` erneut ab; Sie erhalten dann den passenden Weg. In beiden Fällen führt er zuerst über die Werkstatt, nicht über den Gutachter.',
    }
  }
  return {
    ...base,
    anspruchslage: 'unklar',
    eigenkosten: 'Hängt von der Schuldfrage ab — bei Unverschulden 0 € (§ 249 BGB).',
    ansprueche: SACHSCHADEN_KATALOG,
    empfehlung:
      'Die Schuldfrage ist oft nicht so eindeutig wie vom Gegner dargestellt. Ein unabhängiges Gutachten + die Prüfung der Unfallkonstellation klären, was Ihnen zusteht.',
  }
}
