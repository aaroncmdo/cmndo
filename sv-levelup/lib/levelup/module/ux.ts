import { istClientseitig, obererBereich, sichtbarerText } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`ux: 12`). */
export const UX_PUNKTE = 12

/**
 * Punktverteilung — BESCHLUSS (die Messvorschrift `references/scoring-modell.md`
 * ist nicht auffindbar, wie bei den uebrigen Modulen).
 *
 * ⭐ Gemessen wird nicht „schoen", sondern: Findet ein Unfallgeschaedigter am
 * Handy in zehn Sekunden die Telefonnummer? Deshalb wiegt der `tel:`-Link am
 * schwersten — eine nicht verlinkte Nummer muss abgeschrieben werden, genau
 * in dem Moment, in dem jemand am Unfallort steht und eine Hand am Lenkrad
 * hat.
 */
export const GEWICHTE = { telefonLink: 4, kontaktweg: 3, oben: 2, zeiten: 2, notfall: 1 }

const LABEL: Record<keyof typeof GEWICHTE, string> = {
  telefonLink: 'Telefonnummer anklickbar',
  kontaktweg: 'Zweiter Kontaktweg',
  oben: 'Nummer im oberen Bereich',
  zeiten: 'Erreichbarkeit genannt',
  notfall: 'Kurzfristige Erreichbarkeit',
}

const SCHLUESSEL = Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[]

/**
 * So viel SICHTBARER Text gilt als „oben" — etwa zwei Bildschirmhöhen.
 *
 * ⚠ Bewusst am sichtbaren Text gemessen, nicht am Markup: eine
 * Baukasten-Seite mit 1 MB eingebettetem CSS hat in den ersten 2500
 * Markup-Zeichen 50 Zeichen Text. Siehe `obererBereich` in `html.ts`.
 */
const OBEN_TEXTZEICHEN = 600

/** Eine deutsche Festnetz- oder Mobilnummer im Fliesstext. */
const NUMMER = /\b0\d{2,5}[\s/-]?\d{3,}/
const TEL_LINK = /href\s*=\s*["']tel:/i

export async function messeUx(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'ux',
        grund: 'Für diesen Check ist keine Website hinterlegt — es gibt keinen Weg, den man prüfen könnte.',
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
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const html = antwort.text

  // ⚠ Eine Anwendung baut ihre Kontaktdaten erst im Browser auf. Der Vorwurf
  // „keine Telefonnummer" waere dann schlicht falsch — und ausgerechnet bei
  // diesem Modul besonders schaedlich, weil er dem Betrieb unterstellt, fuer
  // Kunden unerreichbar zu sein (R-B).
  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf — welche Kontaktwege ein Leser sieht, ist ohne ' +
      'Browser nicht feststellbar.'
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const text = sichtbarerText(html)
  const rumpf = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · Anklickbare Telefonnummer
  //
  // Die sichtbare Nummer wird SEPARAT erkannt, damit der Befund den
  // Unterschied benennen kann: „steht da, aber nicht verlinkt" ist eine andere
  // Aussage als „fehlt ganz" — und eine, der ein Sachverstaendiger glaubt.
  const telLink = TEL_LINK.test(html)
  const nummerSichtbar = NUMMER.test(text)
  befunde.push(befund(
    'telefonLink', LABEL.telefonLink, telLink,
    telLink ? GEWICHTE.telefonLink : 0, GEWICHTE.telefonLink, quelle, erhoben,
    telLink
      ? 'Ein Fingertipp wählt die Nummer.'
      : nummerSichtbar
        ? 'Die Nummer steht auf der Seite, ist aber nicht verlinkt — am Handy muss sie abgeschrieben werden, genau am Unfallort.'
        : 'Keine Telefonnummer gefunden. Am Handy führt damit kein Weg zum Anruf.',
  ))

  // 2 · Zweiter Weg
  const formular = /<form\b/i.test(html)
  const mailLink = /href\s*=\s*["']mailto:/i.test(html)
  befunde.push(befund(
    'kontaktweg', LABEL.kontaktweg, formular || mailLink,
    formular || mailLink ? GEWICHTE.kontaktweg : 0, GEWICHTE.kontaktweg, quelle, erhoben,
    formular
      ? 'Kontaktformular vorhanden.'
      : mailLink
        ? 'E-Mail-Adresse verlinkt.'
        : 'Weder Formular noch E-Mail-Link — wer nicht anrufen mag oder außerhalb der Zeiten schreibt, hat keinen Weg.',
  ))

  // 3 · Steht die Nummer oben?
  const obenRoh = obererBereich(rumpf, OBEN_TEXTZEICHEN)
  const obenNummer = TEL_LINK.test(obenRoh) || NUMMER.test(sichtbarerText(obenRoh))
  befunde.push(befund(
    'oben', LABEL.oben, obenNummer,
    obenNummer ? GEWICHTE.oben : 0, GEWICHTE.oben, quelle, erhoben,
    obenNummer
      ? 'Im oberen Bereich sichtbar.'
      : 'Erst weiter unten auf der Seite — wer es eilig hat, scrollt nicht.',
  ))

  // 4 · Erreichbarkeit
  const zeiten = /\d{1,2}[:.]\d{2}\s*(–|-|bis)\s*\d{1,2}[:.]\d{2}/.test(text) ||
    /(montag|mo\.?)\s*(–|-|bis)\s*(freitag|fr\.?)/i.test(text)
  befunde.push(befund(
    'zeiten', LABEL.zeiten, zeiten,
    zeiten ? GEWICHTE.zeiten : 0, GEWICHTE.zeiten, quelle, erhoben,
    zeiten
      ? 'Erreichbarkeit steht auf der Seite.'
      : 'Keine Zeiten genannt — es bleibt unklar, wann überhaupt jemand rangeht.',
  ))

  // 5 · Kurzfristigkeit
  const notfall = /(24\s*(h|stunden)|rund um die uhr|notfall|kurzfristig|noch heute|sofort|schnellstmöglich)/i.test(text)
  befunde.push(befund(
    'notfall', LABEL.notfall, notfall,
    notfall ? GEWICHTE.notfall : 0, GEWICHTE.notfall, quelle, erhoben,
    notfall
      ? 'Kurzfristige Erreichbarkeit wird zugesagt.'
      : 'Kein Hinweis auf kurzfristige Termine — nach einem Unfall zählt genau das.',
  ))

  return { befunde, fehlstellen }
}
