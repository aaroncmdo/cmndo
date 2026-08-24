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
    trigger: ['unwirtschaftlich', 'totalschaden', 'wiederbeschaffungswert', 'restwert', 'restwertbörse', ' 130', 'vergleichbare fahrzeuge', 'wiederbeschaffung in', 'wiederbeschaffungsdauer'],
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
    trigger: ['abgegolten', 'abgefunden', 'abfindung', 'erledigung', 'sämtliche ansprüche', 'alle ansprüche', 'erledigungsvergleich', 'dem grunde nach', 'vergleichsweise einigung', 'vergleichsweise erledigung'],
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
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/reparaturkosten.md
    slug: 'reparaturkosten-gekuerzt',
    phrase: 'Die Reparaturkosten sind überhöht — Stundensatz und UPE-Aufschlag werden gekürzt.',
    trigger: ['upe-aufschlag', 'upe aufschlag', 'stundensatz', 'stundenverrechnungssatz', 'verbringungskosten', 'reparaturkosten überhöht', 'kalkulation gekürzt'],
    bedeutet:
      'Die Kalkulation des Sachverständigen wird Position für Position heruntergerechnet — meist am Schreibtisch, ohne Besichtigung. Betroffen sind vor allem Stundenverrechnungssätze, die Aufschläge auf Ersatzteile (UPE) und die Verbringung zur Lackiererei.',
    recht:
      'Geschuldet ist der zur Wiederherstellung erforderliche Betrag (§ 249 Abs. 2 BGB). UPE-Aufschläge von 10–20 % sind vom BGH anerkannt; bei Fahrzeugen unter drei Jahren besteht Anspruch auf die Stundensätze der Markenwerkstatt (BGH VI ZR 53/09). Sie wählen frei zwischen fiktiver Abrechnung (ohne MwSt) und konkreter Abrechnung (mit MwSt) — bis zur 130-%-Grenze des Wiederbeschaffungswerts (BGH VI ZR 70/04).',
    norm: '§ 249 Abs. 2 BGB, BGH VI ZR 53/09, BGH VI ZR 70/04',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/reparaturbestaetigung.md
    slug: 'reparaturnachweis-gefordert',
    phrase: 'Ohne Rechnung keine Zahlung — der Reparaturweg ist nicht nachgewiesen.',
    trigger: ['ohne rechnung', 'nachweis der reparatur', 'reparaturnachweis', 'reparaturbestätigung', 'reparaturweg', 'reparatur nicht nachgewiesen'],
    bedeutet:
      'Eine Position wird an eine Werkstattrechnung geknüpft, die es in diesem Abrechnungsweg gar nicht gibt — etwa bei Eigenreparatur, bei Nutzungsausfall nach fiktiver Abrechnung oder bei der 130-%-Weiterbenutzung.',
    recht:
      'Hängt ein Anspruch an der tatsächlichen Reparatur, genügt eine Reparaturbestätigung des Sachverständigen — eine kurze Nachbesichtigung, kein zweites Vollgutachten. Fotos allein ersetzen sie nicht: beurteilt wird die Fachgerechtigkeit, nicht die Optik. Ihre Kosten sind als Teil der Rechtsverfolgung dem Grunde nach erstattungsfähig.',
    norm: '§ 249 BGB',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/verzug-bgb286.md
    slug: 'verzug-bestritten',
    phrase: 'Wir sind nicht in Verzug — eine Mahnung haben wir nicht erhalten.',
    trigger: ['in verzug', 'keine mahnung', 'mahnung erhalten', 'verzögerung war unverschuldet', 'nicht in verzug', 'verzugszinsen'],
    bedeutet:
      'Der Verzug wird an eine förmliche Mahnung geknüpft, um Zinsen und Anwaltskosten abzuwehren — und um weiter Zeit zu gewinnen.',
    recht:
      'Verzug tritt auch ohne Mahnung ein: bei ernsthafter und endgültiger Leistungsverweigerung sofort (§ 286 Abs. 2 Nr. 3 BGB), sonst nach angemessener Prüffrist. Ab Verzug schuldet der Versicherer 5 Prozentpunkte über Basiszinssatz (§ 288 BGB); Anwaltskosten sind eigenständiger Verzugsschaden (BGH VI ZR 235/13), ebenso alle weiteren Schäden aus der Verzögerung (§ 280 BGB). Setzen Sie eine konkrete Frist.',
    norm: '§ 286 BGB, § 288 BGB, § 280 BGB, BGH VI ZR 235/13',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/anwaltskosten-erstattung.md
    slug: 'anwalt-nicht-erforderlich',
    phrase: 'Eine anwaltliche Vertretung ist nicht erforderlich.',
    trigger: ['anwaltskosten', 'anwaltliche vertretung', 'rechtsanwaltskosten', 'geschäftsgebühr', 'anwalt ist nicht erforderlich', 'ohne anwalt'],
    bedeutet:
      'Sie sollen ohne rechtlichen Beistand mit einer Abteilung verhandeln, die genau das täglich tut. Die Variante „nur bei tatsächlicher Beauftragung" ist dabei kein Gegenargument, sondern eine Selbstverständlichkeit.',
    recht:
      'Bei klarer Haftung sind die Anwaltskosten des Geschädigten erstattungsfähiger Schaden; die Erforderlichkeit ist nach BGH weit auszulegen (§ 249 BGB, BGH VI ZR 235/13). Die Regel-Geschäftsgebühr beträgt 1,3 nach RVG — bei Personenschäden mit Spätfolgen bis 2,3. Ein Mitverschulden kürzt nur anteilig.',
    norm: '§ 249 BGB, RVG, BGH VI ZR 235/13',
  },
  {
    // Quelle: claimondo-marketing/content/claimondo/haftpflicht/abschlepp-bergung.md
    slug: 'abschlepp-standkosten-gekuerzt',
    phrase: 'Die Abschleppkosten sind überhöht, Standkosten sind nicht erforderlich.',
    trigger: ['abschleppkosten', 'bergungskosten', 'standkosten', 'standgeld', 'abschleppen überhöht', 'notdienst-aufschlag'],
    bedeutet:
      'Zwei Positionen, die unmittelbar nach dem Unfall entstehen und die niemand in Ruhe vergleichen konnte, werden nachträglich am Markt gemessen — als hätte man in der Notlage Angebote einholen können.',
    recht:
      'Geschuldet ist die volle Naturalrestitution (§ 249 BGB). Maßstab ist der ortsübliche Tarif, nicht der günstigste denkbare; Notdienst-Aufschläge sind wegen der unfallbedingten Notlage erstattbar. Standkosten laufen berechtigt weiter, solange das Gutachten oder die Freigabe des Versicherers aussteht — diese Zeit haben Sie nicht zu vertreten.',
    norm: '§ 249 BGB',
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
    trigger: ['sachverständigenhonorar', 'gutachterhonorar', 'bvsk', 'honorarkürzung', 'nebenkosten überhöht', 'honorar nicht', 'sv-kosten', 'gutachterkosten überhöht'],
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
