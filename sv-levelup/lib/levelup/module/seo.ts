import { istClientseitig, metaInhalt, sichtbarerText, textIn } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`seo: 12`). */
export const SEO_PUNKTE = 12

/**
 * Punktverteilung — BESCHLUSS (die Messvorschrift `references/scoring-modell.md`
 * ist nicht auffindbar, wie bei `web`, `wett` und `gbp`).
 *
 * ⭐ Der Ortsbezug ist das Herz und steckt gleich zweimal drin (im Titel und
 * im Text): Ein Sachverstaendiger wird OERTLICH gesucht — „Kfz Gutachter
 * Muenster", nicht „Kfz Gutachter". Eine Seite ohne Ortsnamen kann diese
 * Suche nicht gewinnen, egal wie gut alles andere ist.
 */
export const GEWICHTE = { titel: 3, beschreibung: 3, h1: 2, ortsbezug: 2, daten: 2 }

const LABEL: Record<keyof typeof GEWICHTE, string> = {
  titel: 'Seitentitel',
  beschreibung: 'Beschreibung für die Trefferliste',
  h1: 'Hauptüberschrift',
  ortsbezug: 'Ortsbezug im Text',
  daten: 'Strukturierte Daten',
}

const SCHLUESSEL = Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[]

/** Laengen, bei denen Google in der Trefferliste nicht abschneidet. */
const TITEL_MIN = 30
const TITEL_MAX = 65
const BESCHR_MIN = 70
const BESCHR_MAX = 160

/** Nennt der Text den Ort oder die Postleitzahl? */
function nenntOrt(text: string, ort: string | null, plz: string | null): boolean {
  const t = text.toLowerCase()
  if (ort && ort.length >= 3 && t.includes(ort.toLowerCase())) return true
  if (plz && plz.length >= 4 && t.includes(plz)) return true
  return false
}

/**
 * Modul `seo` — wird die Website gefunden?
 *
 * Prueft die Startseite, wie `web`. Kein Vollcrawl: Titel, Beschreibung,
 * Ueberschrift und Ortsbezug entscheiden sich dort, und jeder weitere Abruf
 * waere Last auf einem fremden Server ohne zusaetzliche Aussage.
 */
export async function messeSeo(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'seo',
        grund: 'Für diesen Check ist keine Website hinterlegt — es gibt keine Seite, die gefunden werden könnte.',
      }],
    }
  }

  const quelle = url
  const antwort = await k.hole(url)

  if (antwort.status !== 200 || !antwort.text) {
    // ⚠ NICHT „0 Punkte in allen Kriterien": gemessen wurde nichts (R-B).
    const grund = antwort.status === 0
      ? `${url} war nicht erreichbar.`
      : `${url} antwortete mit Status ${antwort.status}.`
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const html = antwort.text
  const ort = k.standort?.ort ?? null
  const plz = k.standort?.plz ?? null
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · Titel — steht im Kopf und wird auch von einer Anwendung ausgeliefert
  const titel = textIn(html, 'title')[0] ?? ''
  const titelOrt = nenntOrt(titel, ort, plz)
  const titelLaenge = titel.length >= TITEL_MIN && titel.length <= TITEL_MAX
  befunde.push(befund(
    'titel', LABEL.titel, titel || '(kein Titel)',
    (titel ? 1 : 0) + (titelOrt ? 1 : 0) + (titelLaenge ? 1 : 0), GEWICHTE.titel, quelle, erhoben,
    !titel
      ? 'Kein Titel gesetzt — in der Trefferliste steht dann der Domainname.'
      : !titelOrt
        ? `Ohne Ortsnamen. Wer „Kfz Gutachter ${ort ?? 'Ort'}" sucht, findet diese Seite deutlich schwerer.`
        : titelLaenge
          ? 'Länge und Ortsbezug passen.'
          : `${titel.length} Zeichen — zwischen ${TITEL_MIN} und ${TITEL_MAX} wird der Titel nicht abgeschnitten.`,
  ))

  // 2 · Beschreibung
  const beschreibung = metaInhalt(html, 'description') ?? ''
  const beschrLaenge = beschreibung.length >= BESCHR_MIN && beschreibung.length <= BESCHR_MAX
  befunde.push(befund(
    'beschreibung', LABEL.beschreibung, beschreibung || '(keine Beschreibung)',
    (beschreibung ? 2 : 0) + (beschrLaenge ? 1 : 0), GEWICHTE.beschreibung, quelle, erhoben,
    !beschreibung
      ? 'Nicht gesetzt — Google schneidet sich dann selbst einen Satz aus der Seite, oft einen unpassenden.'
      : beschrLaenge
        ? 'Länge passt.'
        : `${beschreibung.length} Zeichen — zwischen ${BESCHR_MIN} und ${BESCHR_MAX} wird sie vollständig angezeigt.`,
  ))

  // 3 + 4 · Ueberschrift und Ortsbezug leben im Rumpf
  //
  // ⚠ Bei einer Anwendung ist der Rumpf leer, OBWOHL der Browser Inhalte
  // zeigt. Hier nichts vorwerfen — dieselbe Regel wie bei Impressum und
  // Datenschutz in `web` (R-B).
  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf. Was ein Leser sieht, steht nicht im ausgelieferten ' +
      'Text — ohne Browser ist das nicht feststellbar.'
    befunde.push(nichtErhoben('h1', LABEL.h1, GEWICHTE.h1, grund, quelle, erhoben))
    befunde.push(nichtErhoben('ortsbezug', LABEL.ortsbezug, GEWICHTE.ortsbezug, grund, quelle, erhoben))
  } else {
    const h1 = textIn(html, 'h1')
    befunde.push(befund(
      'h1', LABEL.h1, h1.length,
      h1.length === 1 ? GEWICHTE.h1 : 0, GEWICHTE.h1, quelle, erhoben,
      h1.length === 0
        ? 'Keine Hauptüberschrift — die Seite sagt nicht, worum es geht.'
        : h1.length === 1
          ? `„${h1[0]}"`
          : `${h1.length} Hauptüberschriften. Genau eine sollte sagen, worum es auf der Seite geht.`,
    ))

    const text = sichtbarerText(html)
    const hatOrt = nenntOrt(text, ort, plz)
    befunde.push(befund(
      'ortsbezug', LABEL.ortsbezug, hatOrt,
      hatOrt ? GEWICHTE.ortsbezug : 0, GEWICHTE.ortsbezug, quelle, erhoben,
      hatOrt
        ? `„${ort ?? 'Der Ort'}" kommt im Text vor.`
        : `Weder „${ort ?? 'der Ort'}" noch die Postleitzahl stehen im Text. Gutachter werden örtlich gesucht.`,
    ))
  }

  // 5 · Strukturierte Daten — stehen als Skriptblock im Quelltext und sind
  // deshalb auch bei einer Anwendung messbar.
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  const hatLocalBusiness = jsonLd.some((m) =>
    /localbusiness|autorepair|professionalservice|"@type"\s*:\s*"organization"/i.test(m[1]))
  befunde.push(befund(
    'daten', LABEL.daten, hatLocalBusiness,
    hatLocalBusiness ? GEWICHTE.daten : 0, GEWICHTE.daten, quelle, erhoben,
    hatLocalBusiness
      ? 'Vorhanden — Google kann Adresse und Öffnungszeiten direkt auslesen.'
      : 'Nicht hinterlegt. Ohne sie erkennt Google Adresse, Zeiten und Bewertungen nicht als solche.',
  ))

  return { befunde, fehlstellen }
}
