// Beratungs-Tool (Baustein 9): prueft die Schadensersatz-Ansprueche eines Kfz-Unfall-
// Geschaedigten — strukturiert nach Schuldfrage — und endet IMMER mit dem Funnel-Ziel:
// Gutachter + Termin (sonst Telefon-Rueckruf). Allgemeine Information, KEINE individuelle
// Rechtsberatung (RDG). Anonym, read-only, kein Auth.
// GET /api/v1/pruefe-anspruch?schuldfrage=unverschuldet&schadenart=auffahrunfall
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
const ipHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  ipHits.set(ip, hits)
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(k)
  }
  return hits.length > RATE_MAX
}
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS })
}

type Anspruch = { titel: string; norm: string; hinweis: string }

// Standard-Schadensersatzkatalog beim unverschuldeten Kfz-Unfall (Sachschaden).
const SACHSCHADEN_KATALOG: Anspruch[] = [
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
  'Lassen Sie den Schaden jetzt von einem unabhängigen Kfz-Gutachter aufnehmen — das ist die belastbare Grundlage für die volle Durchsetzung. Gutachter + freie Termine: GET /api/v1/gutachter-termine?plz=[PLZ]. Termin reservieren + persönlichen FlowLink per WhatsApp: POST /api/v1/melde-schaden. Lieber telefonisch? Telefon-Rückruf in der Regel < 15 Min.'

/**
 * Bei SELBST verschuldetem Schaden ist der Gutachter NICHT der erste Schritt.
 *
 * Vorher endete jede Antwort — auch die für Selbstverschulden — bei NAECHSTER_SCHRITT
 * („lassen Sie ein Gutachten machen, um es DURCHZUSETZEN"). Gegenüber wem? Es gibt keinen
 * Gegner. Wer selbst schuld ist, braucht zuerst eine **Werkstatt**: bei Vollkasko reguliert
 * die eigene Versicherung (abzüglich SB), ohne Kasko zahlt er selbst und will einen
 * Kostenvoranschlag. Das Gutachten ist dort ein *optionaler* Beleg, kein Ausgangspunkt.
 */
const NAECHSTER_SCHRITT_KASKO =
  'Erster Schritt ist die Werkstatt, nicht der Gutachter: Ihre Vollkasko reguliert den Schaden abzüglich Ihrer Selbstbeteiligung. Partner-Werkstätten in Ihrer Nähe: GET /api/v1/werkstatt-in-naehe?plz=[PLZ] — oder direkt der Werkstatt-Finder https://claimondo.de/werkstatt-finden?plz=[PLZ]. Ein unabhängiges Gutachten ist hier optional; es lohnt sich, wenn die Versicherung die Schadenhöhe drücken will oder ein Totalschaden/Wertminderung im Raum steht.'
const NAECHSTER_SCHRITT_SELBSTZAHLER =
  'Ohne Vollkasko tragen Sie die Reparatur selbst — erster Schritt ist deshalb ein Kostenvoranschlag der Werkstatt, nicht ein Gutachten. Partner-Werkstätten in Ihrer Nähe: GET /api/v1/werkstatt-in-naehe?plz=[PLZ] — oder direkt https://claimondo.de/werkstatt-finden?plz=[PLZ]. Ein Gutachten (kostenpflichtig) lohnt praktisch nur bei größeren Schäden oder Streit über die Schadenhöhe.'
const NAECHSTER_SCHRITT_SELBST_UNKLAR =
  'Fragen Sie zuerst, ob eine Vollkasko besteht — davon hängt der ganze weitere Weg ab, und Sie können es mit `vollkasko=ja|nein` erneut abfragen. Mit Vollkasko reguliert die eigene Versicherung (abzüglich SB), ohne zahlt der Halter selbst. In beiden Fällen führt der Weg zuerst über die Werkstatt: GET /api/v1/werkstatt-in-naehe?plz=[PLZ].'

const RDG_HINWEIS = 'Allgemeine Information zur Schadensregulierung, keine individuelle Rechtsberatung.'

/** `vollkasko`-Parameter: nur bei Selbstverschulden relevant, sonst ignoriert. */
type Vollkasko = 'ja' | 'nein' | 'unbekannt'

function resolve(schuldfrage: string, schadenart?: string, vollkasko: Vollkasko = 'unbekannt') {
  // `abrechnungsweg` spiegelt die interne Qualifikation (src/lib/werkstatt/abrechnungsweg.ts):
  // gegner → haftpflicht · eigenverantwortung + Kasko → kasko · ohne → selbstzahler.
  // Sie ist das Feld, an dem ein KI-Assistent erkennt, WELCHEN Weg er anbieten muss —
  // vorher war das aus der Antwort nicht ableitbar, und jede Antwort endete beim Gutachter.
  const abrechnungsweg =
    schuldfrage === 'unverschuldet' || schuldfrage === 'teilschuld'
      ? 'haftpflicht'
      : schuldfrage === 'selbst' || schuldfrage === 'eigenverschulden'
        ? vollkasko === 'ja'
          ? 'kasko'
          : vollkasko === 'nein'
            ? 'selbstzahler'
            : null // Kasko-Frage offen → der Assistent muss nachfragen
        : null
  const base = {
    schuldfrage,
    schadenart: schadenart ?? null,
    abrechnungsweg,
    naechster_schritt: NAECHSTER_SCHRITT,
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
  if (schuldfrage === 'selbst' || schuldfrage === 'eigenverschulden') {
    if (vollkasko === 'ja') {
      return {
        ...base,
        naechster_schritt: NAECHSTER_SCHRITT_KASKO,
        anspruchslage: 'keine_gegen_gegner',
        eigenkosten:
          'Gegenüber dem Unfallgegner bestehen keine Ansprüche. Die Vollkasko übernimmt die Reparatur abzüglich Ihrer Selbstbeteiligung (üblich 300–500 €); die Regulierung kann sich auf die Schadenfreiheitsklasse auswirken.',
        ansprueche: [],
        empfehlung:
          'Mit Vollkasko führt der Weg zuerst in die Werkstatt — die eigene Versicherung reguliert. Rechnen Sie vorher durch, ob sich die Meldung lohnt: Bei kleineren Schäden kann die Höherstufung teurer sein als die Reparatur aus eigener Tasche. Ein unabhängiges Gutachten ist optional und lohnt vor allem, wenn die Versicherung die Schadenhöhe drücken will oder Totalschaden/Wertminderung im Raum stehen.',
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)

  const url = new URL(req.url)
  const schuldfrage = (url.searchParams.get('schuldfrage') || 'unklar').toLowerCase().trim()
  const schadenart = url.searchParams.get('schadenart')?.trim() || undefined
  // Nur bei Selbstverschulden ausgewertet: mit Vollkasko reguliert die eigene Versicherung
  // (→ kasko), ohne zahlt der Halter selbst (→ selbstzahler). Unbekannt = der Assistent
  // muss nachfragen; wir raten hier NICHT, weil beide Wege unterschiedlich teuer sind.
  const vollkaskoRoh = (url.searchParams.get('vollkasko') || '').toLowerCase().trim()
  const vollkasko: Vollkasko =
    vollkaskoRoh === 'ja' || vollkaskoRoh === 'true'
      ? 'ja'
      : vollkaskoRoh === 'nein' || vollkaskoRoh === 'false'
        ? 'nein'
        : 'unbekannt'

  return json(resolve(schuldfrage, schadenart, vollkasko), 200)
}
