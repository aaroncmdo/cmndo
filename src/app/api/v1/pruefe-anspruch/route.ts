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
const RDG_HINWEIS = 'Allgemeine Information zur Schadensregulierung, keine individuelle Rechtsberatung.'

function resolve(schuldfrage: string, schadenart?: string) {
  const base = { schuldfrage, schadenart: schadenart ?? null, naechster_schritt: NAECHSTER_SCHRITT, hinweis: RDG_HINWEIS }
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
    return {
      ...base,
      anspruchslage: 'keine_gegen_gegner',
      eigenkosten: 'Gegenüber dem Unfallgegner bestehen keine Ansprüche; Reparatur ggf. über die eigene Vollkasko (mit Selbstbeteiligung).',
      ansprueche: [],
      empfehlung:
        'Bei selbst verschuldetem Unfall greift ggf. die eigene Vollkasko. Ein Gutachten hilft trotzdem, die Schadenhöhe gegenüber der eigenen Versicherung korrekt zu belegen.',
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

  return json(resolve(schuldfrage, schadenart), 200)
}
