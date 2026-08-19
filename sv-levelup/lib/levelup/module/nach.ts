import { istClientseitig, sichtbarerText, textIn } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`nach: 8`). */
export const NACH_PUNKTE = 8

/**
 * Die acht Fragen, die Unfallgeschaedigte tatsaechlich eintippen.
 *
 * ⭐ Longtail heisst: Menschen suchen in ganzen Saetzen. „Wer zahlt das
 * Gutachten bei unverschuldetem Unfall", „was ist eine Wertminderung", „wie
 * lange dauert ein Gutachten". Wer diese Fragen auf seiner Seite beantwortet,
 * wird zu ihnen gefunden — ohne einen Cent Werbebudget.
 *
 * Ein Keyword-Werkzeug braucht es dafuer nicht (das waere `kwg`, gesperrt bis
 * A-6). Gemessen wird, WELCHE der acht wiederkehrenden Themen die Seite
 * abdeckt.
 */
export const THEMEN = [
  {
    id: 'kosten',
    titel: 'Wer die Kosten trägt',
    woerter: [/wer zahlt/i, /kostenlos/i, /haftpflicht/i, /kostenübernahme/i, /auf kosten der/i],
  },
  {
    id: 'wertminderung',
    titel: 'Wertminderung',
    woerter: [/wertminderung/i, /merkantile/i, /minderwert/i],
  },
  {
    id: 'nutzungsausfall',
    titel: 'Nutzungsausfall und Mietwagen',
    woerter: [/nutzungsausfall/i, /mietwagen/i, /ersatzwagen/i, /ausfallentschädigung/i],
  },
  {
    id: 'restwert',
    titel: 'Restwert und Wiederbeschaffung',
    woerter: [/restwert/i, /wiederbeschaffungswert/i, /wiederbeschaffung/i],
  },
  {
    id: 'ablauf',
    titel: 'Ablauf und Dauer',
    woerter: [/wie lange/i, /ablauf/i, /innerhalb von/i, /dauert/i, /in der regel \d/i],
  },
  {
    id: 'freieWahl',
    titel: 'Freie Wahl des Sachverständigen',
    woerter: [/freie wahl/i, /sie bestimmen/i, /versicherung darf/i, /selbst wählen/i, /unabhängig/i],
  },
  {
    id: 'totalschaden',
    titel: 'Reparatur oder Totalschaden',
    woerter: [/totalschaden/i, /130\s*%/i, /reparaturkosten/i, /wirtschaftlicher totalschaden/i],
  },
  {
    id: 'kasko',
    titel: 'Kaskoschaden',
    woerter: [/teilkasko/i, /vollkasko/i, /kaskoschaden/i, /kaskoversicherung/i],
  },
] as const

/** Ein Punkt je Thema — acht Themen, acht Punkte. */
export const PUNKT_JE_THEMA = 1

/**
 * Ein Thema gilt als behandelt, wenn ZWEI seiner Begriffe vorkommen — oder
 * einer in einer Ueberschrift steht.
 *
 * ⚠ Ein einzelnes Wort im Fliesstext ist keine Antwort auf eine Frage. Ohne
 * diese Huerde zaehlte „Kasko" in einer Aufzaehlung als behandeltes Thema, und
 * der Befund lobte eine Seite fuer Inhalte, die sie nicht hat.
 */
export function themaBehandelt(
  text: string,
  ueberschriften: string,
  woerter: readonly RegExp[],
): boolean {
  if (woerter.some((w) => w.test(ueberschriften))) return true
  return woerter.filter((w) => w.test(text)).length >= 2
}

export async function messeNach(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'nach',
        grund: 'Für diesen Check ist keine Website hinterlegt — es gibt keine Inhalte, die Fragen beantworten könnten.',
      }],
    }
  }

  const quelle = url
  const antwort = await k.hole(url)

  if (antwort.status !== 200 || !antwort.text) {
    const grund = antwort.status === 0
      ? `${url} war nicht erreichbar.`
      : `${url} antwortete mit Status ${antwort.status}.`
    return {
      befunde: THEMEN.map((t) => nichtErhoben(t.id, t.titel, PUNKT_JE_THEMA, grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const html = antwort.text

  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf — welche Themen sie behandelt, ist ohne Browser nicht feststellbar.'
    return {
      befunde: THEMEN.map((t) => nichtErhoben(t.id, t.titel, PUNKT_JE_THEMA, grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const text = sichtbarerText(html)
  const ueberschriften = [...textIn(html, 'h1'), ...textIn(html, 'h2'), ...textIn(html, 'h3')].join(' ')
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  const behandelt = THEMEN.filter((t) => themaBehandelt(text, ueberschriften, t.woerter))
  const anzahl = behandelt.length

  for (const t of THEMEN) {
    const ja = behandelt.some((b) => b.id === t.id)
    befunde.push(befund(
      t.id, t.titel, ja,
      ja ? PUNKT_JE_THEMA : 0, PUNKT_JE_THEMA, quelle, erhoben,
      ja
        ? `Wird auf der Seite behandelt (${anzahl} von ${THEMEN.length} Themen insgesamt).`
        : `Kommt auf der Seite nicht vor. Wer danach sucht, landet bei jemand anderem.`,
    ))
  }

  return { befunde, fehlstellen }
}
