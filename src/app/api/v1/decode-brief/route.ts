// Beratungs-Tool (Baustein 10): entschluesselt ein Schreiben der gegnerischen
// Kfz-Haftpflichtversicherung — erkennt typische Kuerzungs-/Hinhalte-Formulierungen,
// erklaert was sie wirklich bedeuten + welches Recht dem Geschaedigten zusteht — und
// endet IMMER mit dem Funnel-Ziel: unabhaengiger Gutachter + Termin (sonst Rueckruf).
// Allgemeine Information zur Schadensregulierung, KEINE individuelle Rechtsberatung (RDG).
// Anonym, read-only, kein Auth. Quelle des Katalogs: claimondo-marketing/content/claimondo/decoder/*.
// POST /api/v1/decode-brief   body: { "text": "<Brief-Text>" }
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

type Decoder = { slug: string; phrase: string; trigger: string[]; bedeutet: string; recht: string; norm: string | null }

// Versicherer-Brief-Decoder. Jede Formulierung, mit der gegnerische Haftpflicht-
// Versicherer Ansprueche kuerzen/hinauszoegern, + was sie wirklich bedeutet + das
// tatsaechliche Recht des Geschaedigten. Destillat aus den decoder/*-Marketing-Inhalten.
const DECODER_KATALOG: Decoder[] = [
  {
    slug: 'wir-pruefen-sachverhalt',
    phrase: 'Wir prüfen den Sachverhalt, bitte um Geduld.',
    trigger: ['haftungslage', 'den sachverhalt', 'zu gegebener zeit', 'noch nicht abschließend', 'um geduld', 'prüfung dauert'],
    bedeutet:
      'Hinhalte-Taktik: der Versicherer gewinnt Zeit, ohne sich rechtlich zu binden — die Verjährung läuft, der Geschädigte wird passiv.',
    recht:
      'Bei klarer Haftung tritt nach ca. 4 Wochen Verzug ein (§ 286 BGB); ab dann sind Verzugszinsen (§ 288 BGB) und Anwaltskosten als Verzugsschaden erstattbar. Setzen Sie eine konkrete Frist.',
    norm: '§ 286 BGB, § 288 BGB, § 14 VVG',
  },
  {
    slug: 'mitverschulden-30-prozent',
    phrase: 'Wir sehen ein Mitverschulden von 30 %.',
    trigger: ['mitverschulden', 'mithaftung', 'haftungsquote', 'quotelung', 'anspruchskürzung', 'ihrerseits'],
    bedeutet:
      'Pauschale Quote ohne konkrete Tatsachen — die Beweislast wird faktisch auf Sie abgewälzt, obwohl sie beim Versicherer liegt.',
    recht:
      'Die Beweislast für ein Mitverschulden trägt der Versicherer (§ 254 BGB). Bei Auffahr-/Rotlicht-Konstellationen greift der Anscheinsbeweis zu Ihren Gunsten; pauschale Quoten ohne Begründung sind unzulässig.',
    norm: '§ 254 BGB, § 17 StVG',
  },
  {
    slug: 'reparatur-unwirtschaftlich',
    phrase: 'Eine Reparatur ist wirtschaftlich nicht sinnvoll (Totalschaden).',
    trigger: ['unwirtschaftlich', 'totalschaden', 'wiederbeschaffungswert', 'restwert', 'restwertbörse', ' 130'],
    bedeutet:
      'Niedrig angesetzter Wiederbeschaffungswert + hoch angesetzter Restwert drängen Sie zur Aufgabe des Fahrzeugs statt zur Reparatur.',
    recht:
      'Sie dürfen bis 130 % des Wiederbeschaffungswerts reparieren lassen, wenn Sie das Fahrzeug behalten und mind. 6 Monate weiternutzen (Integritätsinteresse, BGH VI ZR 132/00). Der Restwert muss regional realistisch erzielbar sein.',
    norm: '§ 249 BGB, BGH VI ZR 132/00',
  },
  {
    slug: 'schmerzensgeld-angemessen',
    phrase: 'Ein Schmerzensgeld von X € ist angemessen.',
    trigger: ['schmerzensgeld', 'angemessen', 'schmerzensgeldbetrag'],
    bedeutet:
      'Niedriges Anker-Erstangebot ohne individuelle Bemessung — Versicherer-Erstangebote liegen oft deutlich unter dem angemessenen Betrag.',
    recht:
      'Schmerzensgeld ist individuell nach Verletzungsschwere, Dauer, Intensität und Folgen zu bemessen (§ 253 BGB); die Schmerzensgeldtabellen (Hacks/Wellner) sind anerkannte Grundlage. Ein Erstangebot ist verhandelbar.',
    norm: '§ 253 BGB',
  },
  {
    slug: 'pauschal-abgeltung',
    phrase: 'Mit dieser Zahlung sind alle Ansprüche abgegolten.',
    trigger: ['abgegolten', 'abgefunden', 'abfindung', 'erledigung', 'sämtliche ansprüche', 'alle ansprüche', 'erledigungsvergleich'],
    bedeutet:
      'Eine Abgeltungsklausel ist ein bindender Vergleich (§ 779 BGB), der auch spätere Spätfolgen (z. B. chronische Schmerzen) erlöschen lässt — eine Anfechtung ist danach kaum möglich.',
    recht:
      'Unterschreiben Sie nicht ohne Prüfung. Abgeltungsklauseln werden streng nach Wortlaut ausgelegt — sichern Sie sich, wenn überhaupt, einen ausdrücklichen Spätfolgen-Vorbehalt im Vergleichstext.',
    norm: '§ 779 BGB',
  },
  {
    slug: 'unser-sachverstaendiger',
    phrase: 'Wir schicken Ihnen unseren (kostenlosen) Sachverständigen.',
    trigger: ['unseren sachverständigen', 'unser sachverständiger', 'vertrauens-sachverständigen', 'von uns beauftragt', 'unser gutachter', 'kostenfrei begutachten'],
    bedeutet:
      'Der Versicherer-Sachverständige ist strukturell nicht neutral — seine Bewertung tendiert zu niedrigerem Wiederbeschaffungswert, höherem Restwert und niedrigerer Wertminderung. Das Kosten-Argument ist falsch.',
    recht:
      'Sie haben freie Sachverständigen-Wahl. Die Kosten eines eigenen, unabhängigen Gutachters trägt bei unverschuldetem Unfall der gegnerische Haftpflichtversicherer zu 100 % (§ 249 BGB, BGH VI ZR 67/06).',
    norm: '§ 249 BGB, BGH VI ZR 67/06',
  },
  {
    slug: 'werkstatt-netz',
    phrase: 'Bitte nutzen Sie eine Werkstatt aus unserem Partner-Netz.',
    trigger: ['partnerwerkstatt', 'partner-netz', 'werkstattnetz', 'partnerbetrieb', 'referenzwerkstatt', 'empfohlene werkstatt'],
    bedeutet:
      'Werkstatt-Steuerung in Partnerbetriebe mit niedrigeren Stundensätzen und Identteilen — das senkt Ihre Erstattung und kann die Wertminderung erhöhen.',
    recht:
      'Sie haben freie Werkstattwahl. Bei jungen Fahrzeugen (< 3 Jahre) oder lückenloser Markenwerkstatt-Historie besteht Anspruch auf markengebundene Reparatur mit Originalteilen (BGH VI ZR 53/09); Mehrkosten sind erstattbar.',
    norm: '§ 249 BGB, BGH VI ZR 53/09',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/beilackierung.md
    // (veroeffentlicht, insurer_phrases + keyFacts). Nicht frei formuliert.
    slug: 'beilackierung-nicht-erforderlich',
    phrase: 'Die Beilackierung ist technisch nicht erforderlich.',
    trigger: ['beilackierung', 'farbtonangleichung', 'lackangleichung', 'mitlackierung', 'angrenzende teile'],
    bedeutet:
      'Kürzung aus dem Prüfbericht — fast immer nach Aktenlage, ohne dass jemand das Fahrzeug gesehen hat. Betroffen sind vor allem Metallic-, Perleffekt- und Mehrschichtlacke, bei denen ein einzeln lackiertes Teil sichtbar absticht.',
    recht:
      'Geschuldet ist der Zustand vor dem Unfall, nicht „irgendwie lackiert" (§ 249 Abs. 2 BGB). Der BGH hat die Erstattungsfähigkeit bei modernen Lacken bestätigt (VI ZR 174/24). Ob sie nötig war, beurteilt der Sachverständige am Fahrzeug — nicht der Prüfdienst am Schreibtisch. Auch bei fiktiver Abrechnung: ersetzt wird der objektiv erforderliche Aufwand, nicht der tatsächlich angefallene.',
    norm: '§ 249 Abs. 2 BGB, BGH VI ZR 174/24',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/adas-kalibrierung.md
    slug: 'adas-kalibrierung-nicht-erforderlich',
    phrase: 'Eine Kalibrierung der Assistenzsysteme ist nicht erforderlich.',
    trigger: ['kalibrierung', 'justage', 'assistenzsystem', 'fahrerassistenz', 'einmessung', 'adas'],
    bedeutet:
      'Eine sicherheitsrelevante Position wird als Pauschale abgetan („im Stundensatz enthalten") oder auf den Kameratausch verengt. Ausgelöst wird die Kalibrierung aber auch durch Scheibentausch sowie Stoßfänger-, Spiegel- und Fahrwerksarbeiten.',
    recht:
      'Erforderlich ist, was zur fachgerechten Instandsetzung gehört (§ 249 Abs. 2 BGB) — und das bestimmt die Herstellervorgabe, nicht die Kürzungsvorgabe des Versicherers. Die Werkstatt haftet für die Fachgerechtigkeit. Ein dejustierter Notbremsassistent bremst zu früh, zu spät oder gar nicht; lassen Sie die Kalibrierung dokumentieren.',
    norm: '§ 249 Abs. 2 BGB',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/ersatzteil-qualitaet.md
    slug: 'ersatzteil-qualitaet-gleichwertig',
    phrase: 'Gleichwertige Ersatzteile sind ausreichend — Originalteile nicht erforderlich.',
    trigger: ['identteil', 'gebrauchtteil', 'gleichwertige ersatzteile', 'original-ersatzteile', 'originalteile', 'teilequalität', 'gebrauchte ersatzteile'],
    bedeutet:
      'Der Kalkulationsposten wird auf ein billigeres Teil heruntergerechnet. Ein Identteil kommt zwar vom selben Zulieferer, aber ohne Herstellerlogo und ohne Freigabe; ein Gebrauchtteil hat keine Neuteil-Gewährleistung und eine meist unbekannte Historie.',
    recht:
      'Den Anspruch auf Original-Ersatzteile hat der BGH in VI ZR 302/08 behandelt; bei jungen, scheckheftgepflegten Fahrzeugen besteht zudem Anspruch auf die Markenwerkstatt (VI ZR 53/09). Die Teilequalität bestimmt die Reparatur — nicht die Kürzungsvorgabe. Lassen Sie die verbaute Teilequalität in der Rechnung ausweisen.',
    norm: '§ 249 Abs. 2 BGB, BGH VI ZR 302/08, BGH VI ZR 53/09',
  },
  {
    slug: 'wertminderung-nicht',
    phrase: 'Eine Wertminderung ist nicht angefallen.',
    trigger: ['wertminderung', 'merkantile', 'wertverlust'],
    bedeutet:
      'Pauschale Ablehnung mit Argumenten wie Fahrzeugalter oder „fachgerechte Reparatur". Die Faustregel „ab 5 Jahre keine Wertminderung" ist keine BGH-Linie, nur ein Orientierungswert.',
    recht:
      'Merkantile Wertminderung ist eine eigenständige Schadensposition (§ 249 BGB, BGH VI ZR 357/03): ein reparierter Unfallwagen erzielt am Markt weniger — auch bei sachgerechter Reparatur. Ein eigenes Gutachten beziffert sie.',
    norm: '§ 249 BGB, BGH VI ZR 357/03',
  },
  {
    slug: 'mietwagen-zu-hoch',
    phrase: 'Der Mietwagen-Tagessatz liegt über dem ortsüblichen Preis.',
    trigger: ['mietwagen', 'schwacke', 'fraunhofer', 'mietwagenklasse', 'klassentiefer', 'mietwagenkosten'],
    bedeutet:
      'Kürzung um 30–50 % mit Verweis auf die jeweils niedrigere Tabelle (Schwacke/Fraunhofer) und der Behauptung, ein günstigerer Tarif sei verfügbar gewesen.',
    recht:
      'Maßgeblich ist der ortsübliche Normaltarif — praktisch das Mittel aus Schwacke und Fraunhofer (BGH VI ZR 164/07). Eine Klasse unter dem eigenen Fahrzeug ist angemessen; war kein günstigerer Tarif verfügbar, ist der gezahlte Satz voll erstattbar.',
    norm: '§ 249 BGB, BGH VI ZR 164/07',
  },
  {
    slug: 'nutzungsausfall-nicht',
    phrase: 'Einen Nutzungsausfall können wir nicht erstatten.',
    trigger: ['nutzungsausfall', 'sanden-danner', 'zweitwagen', 'nutzungsentschädigung'],
    bedeutet:
      'Ablehnung mit Standard-Argumenten („nicht nachgewiesen", „Zweitwagen vorhanden"). Bei privaten Fahrzeugen greift jedoch die Eigennutzungs-Vermutung.',
    recht:
      'Konkrete Fahrten müssen Sie nicht nachweisen — eine eidesstattliche Versicherung zur typischen Nutzung reicht. Die Sanden-Danner-Tabelle ist anerkannte Schätzgrundlage (27–175 €/Tag). Ein Zweitwagen schließt den Anspruch nicht automatisch aus.',
    norm: '§ 249 BGB, BGH GSZ 1/86',
  },
  {
    slug: 'gutachterhonorar-nicht-ortsueblich',
    phrase: 'Das Sachverständigenhonorar ist nicht ortsüblich.',
    trigger: ['sachverständigenhonorar', 'gutachterhonorar', 'bvsk', 'honorarkürzung', 'nebenkosten überhöht', 'honorar nicht'],
    bedeutet:
      'Kürzung des SV-Honorars mit „nicht ortsüblich" und pauschalem Streichen von Nebenkosten — eine Taktik, kein rechtlich haltbarer Maßstab.',
    recht:
      'Die BVSK-Honorarbefragung ist zulässige Schätzgrundlage (BGH VI ZR 50/15); Sie tragen kein Preisermittlungsrisiko und dürfen auf das vereinbarte Honorar vertrauen. Foto-, Schreib- und Fahrtkosten sind eigenständig erstattbar; bei unverschuldetem Unfall trägt die Gegenseite das Honorar zu 100 % (§ 249 BGB).',
    norm: '§ 249 BGB, BGH VI ZR 50/15',
  },
]

const NAECHSTER_SCHRITT =
  'Antworten Sie auf ein solches Schreiben nicht ungeprüft. Die belastbare Grundlage gegen jede Kürzung ist ein eigenes, unabhängiges Gutachten. Gutachter + freie Termine in Ihrer Nähe: GET /api/v1/gutachter-termine?plz=[PLZ]. Termin reservieren + persönlichen FlowLink per WhatsApp: POST /api/v1/melde-schaden. Lieber telefonisch besprechen? Telefon-Rückruf in der Regel < 15 Min.'
const RDG_HINWEIS =
  'Allgemeine Information zur Schadensregulierung, keine individuelle Rechtsberatung. Im Zweifel einen Rechtsanwalt einschalten — die Kosten trägt bei unverschuldetem Unfall der gegnerische Versicherer.'

// Diacritic-insensitive (ü→u) + case-insensitive, damit Brief-Text mit/ohne Umlaute matcht.
// Regex aus ASCII-Escapes konstruiert (U+0300..U+036F = kombinierende Diakritika),
// damit keine literalen Combining-Marks im Quelltext stehen.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')
function strip(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '')
}

function decode(text: string) {
  const hay = strip(text)
  const befunde = DECODER_KATALOG.filter((d) => d.trigger.some((t) => hay.includes(strip(t)))).map((d) => ({
    phrase: d.phrase,
    bedeutet: d.bedeutet,
    recht: d.recht,
    norm: d.norm,
  }))
  const erkannt = befunde.length
  const einschaetzung =
    erkannt > 0
      ? `In diesem Schreiben stecken ${erkannt} typische Formulierung(en), mit denen Haftpflichtversicherer Ansprüche kürzen oder hinauszögern. Keine davon ist für Sie bindend — als unverschuldet Geschädigter haben Sie Anspruch auf vollständigen Schadensersatz.`
      : 'Keine der typischen Kürzungs-Formulierungen wurde eindeutig erkannt. Das heißt nicht, dass das Angebot fair ist — ein eigenes Gutachten ist die einzige belastbare Grundlage, um zu prüfen, ob Ihnen mehr zusteht.'
  return { erkannte_muster: erkannt, befunde, einschaetzung, naechster_schritt: NAECHSTER_SCHRITT, hinweis: RDG_HINWEIS }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)

  const body = (await req.json().catch(() => ({}))) as { text?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return json({ error: 'Feld "text" (der Brief-Text der Versicherung) fehlt oder ist leer.' }, 400)
  if (text.length > 20_000) return json({ error: 'Brief-Text zu lang (max. 20.000 Zeichen).' }, 400)

  return json(decode(text), 200)
}
