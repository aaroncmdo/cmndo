import { istAgentErlaubt } from '../../anreicherung/robots'
import { istClientseitig } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`ki: 10`). */
export const KI_PUNKTE = 10

/**
 * Punktverteilung — BESCHLUSS.
 *
 *   Zugang 4   → ob die Antwortmaschinen die Seite ueberhaupt lesen duerfen
 *   Im HTML 3  → ob sie beim Lesen etwas vorfinden
 *   Antworten 3 → ob das Vorgefundene eine Frage beantwortet
 *
 * Die Reihenfolge ist die Wirkkette, und der Zugang wiegt am schwersten, weil
 * er alles andere wertlos macht: eine perfekt aufgebaute Seite, die `GPTBot`
 * aussperrt, ist in ChatGPT nicht vorhanden.
 *
 * ⚠ ABGRENZUNG ZU `seo`: Dieses Modul prueft NICHT, ob LocalBusiness-Daten
 * vorhanden sind — das misst `seo.daten` bereits (2 Punkte). Doppelt bewertet
 * waere es doppelt gewichtet. Geprueft wird hier ausschliesslich, was fuer
 * Antwortmaschinen gilt und sonst nirgends geprueft wird.
 */
export const GEWICHTE = { zugang: 4, im_html: 3, antworten: 3 }

/**
 * Die Agenten, die ueber die Sichtbarkeit in Antwortmaschinen entscheiden.
 *
 * ⚠ `GPTBot` und `ChatGPT-User` sind NICHT dasselbe und muessen getrennt
 * geprueft werden: der erste baut den Index auf, der zweite holt die Seite
 * LIVE, waehrend jemand fragt. Wer nur den ersten sperrt, verschwindet aus dem
 * Index; wer nur den zweiten sperrt, wird bei aktuellen Fragen nicht zitiert.
 * In unseren eigenen Zugriffslogs ist `ChatGPT-User` der weitaus haeufigere.
 */
const KI_AGENTEN = [
  { name: 'GPTBot', dienst: 'ChatGPT (Index)' },
  { name: 'ChatGPT-User', dienst: 'ChatGPT (Live-Abruf)' },
  { name: 'PerplexityBot', dienst: 'Perplexity' },
  { name: 'ClaudeBot', dienst: 'Claude' },
  { name: 'Google-Extended', dienst: 'Google (KI-Übersichten)' },
] as const

/**
 * Fragewoerter am Anfang einer Ueberschrift.
 *
 * Bewusst mit Wortgrenze und nur am Zeilenanfang der Ueberschrift: „Was kostet
 * ein Gutachten?" zaehlt, „Etwas ueber uns" nicht.
 */
const FRAGEWORT = /^\s*(wie|was|wer|wann|warum|weshalb|wo|welche[rsnm]?|wieviel|wie viel|muss|darf|kann|braucht|lohnt|zahlt|uebernimmt|übernimmt)\b/i

/** Ueberschriften der Ebenen 2 und 3 — dort steht die Gliederung eines Textes. */
function ueberschriften(html: string): string[] {
  return [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function hatFaqSchema(html: string): boolean {
  return [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .some((m) => /"@type"\s*:\s*"(faqpage|question)"/i.test(m[1]))
}

/**
 * Modul `ki` — Sichtbarkeit in KI-Antworten.
 *
 * Misst die drei Bedingungen, unter denen ein Betrieb in einer KI-Antwort
 * auftauchen KANN. Es misst NICHT, ob er es tatsaechlich tut: dafuer muesste
 * man die Antwortmaschinen befragen, und das kostet je Frage Geld. Diese
 * Grenze steht so auch im Befundtext — ein Werkzeug, das Bedingungen misst und
 * Ergebnisse behauptet, waere unehrlich.
 */
export async function messeKi(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'ki',
        grund: 'Für diesen Check ist keine Website hinterlegt — nichts zu prüfen.',
      }],
    }
  }

  const host = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const schema = url.startsWith('http://') ? 'http' : 'https'

  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · Zugang fuer Antwortmaschinen
  //
  // ⚠ Fehlt die robots.txt (404), gilt KEINE Sperre — das ist der Normalfall
  // und muss die volle Punktzahl geben. Nur ein Abruffehler ist eine Fehlstelle.
  const robotsAntwort = await k.hole(`${schema}://${host}/robots.txt`)

  if (robotsAntwort.status !== 200 && robotsAntwort.status !== 404) {
    befunde.push(nichtErhoben(
      'zugang', 'Zugang für Antwortmaschinen', GEWICHTE.zugang,
      `Die robots.txt von ${host} war nicht abrufbar (Status ${robotsAntwort.status}).`,
      `${host}/robots.txt`, erhoben,
    ))
  } else {
    const txt = robotsAntwort.status === 200 ? robotsAntwort.text : ''
    const gesperrt = KI_AGENTEN.filter((a) => !istAgentErlaubt(txt, a.name, '/'))
    const offen = KI_AGENTEN.length - gesperrt.length

    // Anteilig, aber ohne Aufrundung: wer vier von fuenf aussperrt, soll nicht
    // fast die volle Punktzahl bekommen.
    const punkte = Math.floor((offen / KI_AGENTEN.length) * GEWICHTE.zugang)

    befunde.push(befund(
      'zugang', 'Zugang für Antwortmaschinen', `${offen} von ${KI_AGENTEN.length}`,
      punkte, GEWICHTE.zugang, `${host}/robots.txt`, erhoben,
      gesperrt.length === 0
        ? 'Alle geprüften Dienste dürfen die Seite lesen — ChatGPT, Perplexity, Claude und Googles KI-Übersichten.'
        : `Ausgesperrt: ${gesperrt.map((a) => `${a.name} (${a.dienst})`).join(', ')}. `
          + 'Wer hier gesperrt ist, kann in den Antworten dieses Dienstes nicht vorkommen — '
          + 'unabhängig davon, wie gut die Seite sonst ist.',
    ))
  }

  // Startseite EINMAL holen — die beiden folgenden Kriterien lesen dasselbe HTML.
  const antwort = await k.hole(url)

  if (antwort.status !== 200 || !antwort.text) {
    const grund = antwort.status === 0
      ? `${url} war nicht erreichbar.`
      : `${url} antwortete mit Status ${antwort.status}.`
    befunde.push(nichtErhoben('im_html', 'Inhalte im Quelltext', GEWICHTE.im_html, grund, url, erhoben))
    befunde.push(nichtErhoben('antworten', 'Beantwortet gestellte Fragen', GEWICHTE.antworten, grund, url, erhoben))
    return { befunde, fehlstellen }
  }

  const html = antwort.text

  // 2 · Inhalte im Quelltext
  //
  // ⚠ DER GRUND, WARUM DAS HIER STEHT: Antwortmaschinen fuehren kein
  // JavaScript aus. Eine Seite, die ihren Text erst im Browser zusammensetzt,
  // ist fuer sie leer — nicht schlecht, sondern LEER. Wir haben das am eigenen
  // Auftritt gemessen: die Terminfenster standen nur im JavaScript, und die
  // Antwortmaschinen sahen null verfuegbare Termine.
  const clientseitig = istClientseitig(html)
  befunde.push(befund(
    'im_html', 'Inhalte im Quelltext', !clientseitig,
    clientseitig ? 0 : GEWICHTE.im_html, GEWICHTE.im_html, url, erhoben,
    clientseitig
      ? 'Die Seite setzt ihren Text erst im Browser zusammen. Antwortmaschinen führen kein '
        + 'JavaScript aus — sie sehen eine leere Seite, egal wie gut der Inhalt ist.'
      : 'Der Text steht im ausgelieferten Quelltext und ist damit für Antwortmaschinen lesbar.',
  ))

  // 3 · Beantwortet gestellte Fragen
  //
  // Antwortmaschinen zitieren Passagen, die eine Frage direkt beantworten.
  // Ein FAQ-Datenblock ist der ausdrueckliche Weg; Frage-Ueberschriften sind
  // der gaengigere. Beides zaehlt, der Datenblock hoeher.
  const fragen = ueberschriften(html).filter((t) => t.includes('?') || FRAGEWORT.test(t))
  const faqSchema = hatFaqSchema(html)

  const antwortPunkte = faqSchema
    ? GEWICHTE.antworten
    : fragen.length >= 3 ? 2
    : fragen.length >= 1 ? 1
    : 0

  befunde.push(befund(
    'antworten', 'Beantwortet gestellte Fragen',
    faqSchema ? 'FAQ-Datenblock vorhanden' : `${fragen.length} Frage-Überschriften`,
    antwortPunkte, GEWICHTE.antworten, url, erhoben,
    faqSchema
      ? 'Die Seite kennzeichnet Fragen und Antworten maschinenlesbar — der direkteste Weg, zitiert zu werden.'
      : fragen.length > 0
        ? `Gefunden: „${fragen[0]}". Als FAQ-Datenblock ausgezeichnet, wäre die Passage für `
          + 'Antwortmaschinen eindeutig einer Frage zugeordnet.'
        : 'Keine Überschrift stellt eine Frage. Antwortmaschinen zitieren Passagen, die eine '
          + 'Frage direkt beantworten — etwa „Was kostet ein Gutachten?" oder „Wer zahlt den Gutachter?".',
  ))

  return { befunde, fehlstellen }
}

/** Nur fuer den Fall, dass ein Aufrufer die Nicht-Erhoben-Form braucht. */
export function kiNichtErhoben(grund: string, erhoben: string): Befund[] {
  return (Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[])
    .map((s) => nichtErhoben(s, s, GEWICHTE[s], grund, 'kein Abruf', erhoben))
}
