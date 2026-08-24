import { PlacesFehler, type Betrieb } from '../../places'
import { istClientseitig, sichtbarerText, textIn } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`zuweiser: 10`). */
export const ZUWEISER_PUNKTE = 10
export const UMKREIS_KM = 25

/**
 * Punktverteilung — BESCHLUSS.
 *
 * ⭐ Das Marktbild bekommt NULL Punkte. Wie viele Werkstaetten und Kanzleien
 * im Umkreis sitzen, ist eine Eigenschaft des Gebiets, keine Leistung des
 * Sachverstaendigen — es gehoert in den Befund, nicht in die Wertung.
 * Gewertet wird, ob die Website diese Gruppen ueberhaupt anspricht.
 */
export const GEWICHTE = { potenzial: 0, werkstatt: 4, anwalt: 3, partnerseite: 3 }

const LABEL: Record<keyof typeof GEWICHTE, string> = {
  potenzial: 'Zuweiser im 25-km-Umkreis',
  werkstatt: 'Werkstätten werden angesprochen',
  anwalt: 'Rechtsanwälte werden angesprochen',
  partnerseite: 'Eigener Bereich für Kooperationen',
}

const SCHLUESSEL = Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[]

const WORTFELD = {
  werkstatt: /werkstatt|werkstätten|karosserie|autohaus|autohäuser|lackier|kfz-betrieb/i,
  anwalt: /rechtsanwalt|rechtsanwält|kanzlei|anwaltskanzlei|anwält/i,
  partner: /partner|kooperation|zusammenarbeit|für werkstätten|für kanzleien|netzwerk/i,
}

/**
 * Modul `zuweiser` — spricht die Website die Zuweiser an?
 *
 * Ein Sachverstaendiger lebt von Zuweisern: Werkstaetten, Anwaelte,
 * Autohaeuser. Ob die Website sie anspricht, ist die guenstigste Stellschraube
 * ueberhaupt — ein Absatz, kein Budget.
 */
export async function messeZuweiser(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'zuweiser',
        grund: 'Für diesen Check ist keine Website hinterlegt — ohne sie lässt sich nicht prüfen, wen sie anspricht.',
      }],
    }
  }

  const quelle = `${url} · Umkreis über Google Places`
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
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · Marktbild — zwei Abfragen, aber ein Fehlschlag darf die Wertung nicht
  // aufhalten: die drei Kriterien darunter brauchen nur die Website.
  if (!k.standort) {
    befunde.push(nichtErhoben(
      'potenzial', LABEL.potenzial, 0,
      'Ohne Standort ist kein Umkreis bestimmbar.', quelle, erhoben,
    ))
  } else {
    try {
      const umkreis = { ...k.standort, km: UMKREIS_KM }
      const [werkstaetten, kanzleien] = await Promise.all([
        k.places.suchUmkreis('Kfz-Werkstatt', umkreis),
        k.places.suchUmkreis('Rechtsanwalt Verkehrsrecht', umkreis),
      ])
      const gesamt = zaehleEindeutig(werkstaetten, kanzleien)
      befunde.push(befund(
        'potenzial', LABEL.potenzial, gesamt, 0, 0, quelle, erhoben,
        `${werkstaetten.length} Werkstätten und ${kanzleien.length} Kanzleien im Umkreis von ${UMKREIS_KM} km. ` +
        'Jede davon ist ein möglicher Zuweiser — die Kartensuche zeigt höchstens 60 je Abfrage, die Zahl ist also eine Untergrenze.',
      ))
    } catch (err) {
      const t = err instanceof PlacesFehler ? err.status : (err as Error).message
      befunde.push(nichtErhoben(
        'potenzial', LABEL.potenzial, 0,
        `Die Kartensuche antwortete nicht verwertbar (${t}) — das Umfeld wurde nicht erhoben.`,
        quelle, erhoben,
      ))
    }
  }

  // 2-4 · Was die Website sagt
  //
  // ⚠ Eine Anwendung liefert ihren Text erst im Browser aus — „spricht keine
  // Werkstaetten an" waere dort eine Behauptung ueber ungelesenen Text (R-B).
  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf — wen sie anspricht, ist ohne Browser nicht feststellbar.'
    for (const s of ['werkstatt', 'anwalt', 'partnerseite'] as const) {
      befunde.push(nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben))
    }
    return { befunde, fehlstellen }
  }

  const text = sichtbarerText(html)
  const ueberschriften = [...textIn(html, 'h1'), ...textIn(html, 'h2'), ...textIn(html, 'h3')].join(' ')

  const werkstatt = WORTFELD.werkstatt.test(text)
  befunde.push(befund(
    'werkstatt', LABEL.werkstatt, werkstatt,
    werkstatt ? GEWICHTE.werkstatt : 0, GEWICHTE.werkstatt, quelle, erhoben,
    werkstatt
      ? 'Werkstätten kommen im Text vor.'
      : 'Kein Wort über Werkstätten. Sie sind die häufigste Quelle für Aufträge — ein eigener Absatz kostet nichts.',
  ))

  const anwalt = WORTFELD.anwalt.test(text)
  befunde.push(befund(
    'anwalt', LABEL.anwalt, anwalt,
    anwalt ? GEWICHTE.anwalt : 0, GEWICHTE.anwalt, quelle, erhoben,
    anwalt
      ? 'Rechtsanwälte kommen im Text vor.'
      : 'Kanzleien werden nicht angesprochen. Wer regelmäßig Verkehrsrecht macht, sucht einen festen Sachverständigen.',
  ))

  // Ein eigener BEREICH, nicht nur ein Wort: das Wortfeld muss in einer
  // Ueberschrift oder in einem Link stehen.
  const linkTexte = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => sichtbarerText(m[1])).join(' ')
  const partner = WORTFELD.partner.test(ueberschriften) || WORTFELD.partner.test(linkTexte)
  befunde.push(befund(
    'partnerseite', LABEL.partnerseite, partner,
    partner ? GEWICHTE.partnerseite : 0, GEWICHTE.partnerseite, quelle, erhoben,
    partner
      ? 'Ein eigener Bereich für Kooperationen ist verlinkt oder überschrieben.'
      : 'Kein eigener Bereich für Kooperationen. Eine Seite „Für Werkstätten" ist der Ort, auf den Sie im Gespräch verweisen können.',
  ))

  return { befunde, fehlstellen }
}

/** Dieselbe Adresse taucht in beiden Abfragen auf — nach placeId zaehlen. */
function zaehleEindeutig(...listen: Betrieb[][]): number {
  const ids = new Set<string>()
  for (const l of listen) for (const b of l) ids.add(b.placeId)
  return ids.size
}
