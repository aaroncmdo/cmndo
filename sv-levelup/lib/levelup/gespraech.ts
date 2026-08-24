import type { ModulErgebnis } from './messmaschine'
import type { Massnahme } from './massnahmen'
import type { Befund } from './modul-vertrag'

/**
 * Der Gesprächsleitfaden — Zahlen aus dem Befund, Worte aus dem Mockup.
 *
 * Der Minutenplan (0–3 Ankommen · 3–8 Die Lage · 8–18 Drei Zahlen · 18–25 Nur
 * Phase 1 · 25–30 Die Entscheidung) steht ausformuliert in
 * `mockup-levelup-auswertung.html` und wird uebernommen. Hier entsteht nur,
 * was sich je Betrieb unterscheidet.
 *
 * ⭐ Der Leitsatz des Mockups: „Jede Zahl, die Sie sagen, ist gemessen — und
 * Sie koennen sagen, woher sie kommt. Das ist der ganze Unterschied zu einem
 * Verkaufsgespraech."
 */

export type WichtigeZahl = {
  schluessel: string
  label: string
  wert: string
  /** Was fehlt bis zum Maximum — die Groesse, ueber die gesprochen wird. */
  luecke: number
  maximum: number
  einordnung?: string
  quelle: string
  einwand: string
  antwort: string
}

export type Gespraech = {
  module: number
  zahlenMitQuelle: number
  lage: string
  dreiZahlen: WichtigeZahl[]
  phase1: Massnahme[]
  phase1Punkte: number
  phase1Dauer: string
}

/**
 * Je Kriterium der wahrscheinliche Einwand — und die Antwort darauf.
 *
 * ⚠ BESCHLUSS, nicht zitiert (wie die Massnahmen-Vorlagen). Die Regel des
 * Mockups: „Jede Antwort steht auf einer gemessenen Zahl aus diesem Befund —
 * nicht auf einer Meinung." Wo eine Antwort doch nur eine Behauptung waere,
 * sagt sie das lieber.
 *
 * ⚠ Aaron liest diese Texte gegen, bevor sie in einem Gespraech benutzt werden.
 */
export const EINWAENDE: Record<string, { einwand: string; antwort: string }> = {
  // ── web ────────────────────────────────────────────────────────────────
  impressum: {
    einwand: '„Das Impressum ist doch da, ganz unten."',
    antwort: 'Möglich — messbar war es nicht. Wir haben die Startseite abgerufen und keinen Link gefunden. Wenn er da ist, aber nur im Menü einer Unterseite, findet ihn eine Abmahnkanzlei trotzdem nicht schnell genug, um Sie zu verschonen.',
  },
  datenschutz: {
    einwand: '„Ich verarbeite doch gar keine Daten."',
    antwort: 'Server-Protokolle und ein Kontaktformular reichen bereits. Art. 13 DSGVO greift ab der ersten IP-Adresse im Log — und die schreibt jeder Webserver mit.',
  },
  https: {
    einwand: '„Meine Seite läuft doch seit Jahren so."',
    antwort: 'Seitdem hat sich der Browser geändert, nicht Ihre Seite. Chrome zeigt heute „Nicht sicher" in der Adressleiste. Ein Zertifikat ist bei jedem Anbieter enthalten und in einer Stunde eingerichtet.',
  },
  antwortzeit: {
    einwand: '„Bei mir lädt die Seite sofort."',
    antwort: 'Bei Ihnen ist sie im Zwischenspeicher. Wir haben von außen gemessen, einmal, ohne Zwischenspeicher — das ist die Zeit, die ein neuer Besucher erlebt.',
  },
  mobil: {
    einwand: '„Meine Kunden rufen sowieso an."',
    antwort: 'Genau deshalb: Sie rufen vom Handy an, nachdem sie die Seite auf dem Handy gesehen haben. Ist sie dort verkleinert, ist die Nummer zu klein zum Tippen.',
  },

  // ── wett ───────────────────────────────────────────────────────────────
  sichtbar: {
    einwand: '„Ich lebe von Empfehlungen, nicht von Google."',
    antwort: 'Das eine schließt das andere nicht aus. Wer Sie empfohlen bekommt, sucht Ihren Namen — und findet in der Kartensuche zuerst die Büros, die dort gepflegt sind.',
  },
  rang: {
    einwand: '„Ich habe genug zu tun."',
    antwort: 'Dann ist heute der richtige Zeitpunkt. Wer erst anfängt, wenn es ruhiger wird, baut Sichtbarkeit in dem Moment auf, in dem er sie schon bräuchte — und Bewertungen brauchen Monate, keine Wochen.',
  },
  median: {
    einwand: '„Bewertungen kann man doch kaufen."',
    antwort: 'Kann man, und Google erkennt es zunehmend. Der Unterschied zwischen Ihnen und dem mittleren Betrieb im Umkreis ist eine zweistellige Zahl — die holen Sie mit echten Kunden in einem halben Jahr auf.',
  },
  dynamik: {
    einwand: '„Ich sammle doch schon Bewertungen."',
    antwort: 'Dann sehen wir das beim nächsten Check: gewertet wird die Rate, nicht der Bestand. Fünf neue im Quartal heben Sie, auch von unten — zwanzig auf einen Schlag fallen dagegen auf.',
  },

  // ── gbp ────────────────────────────────────────────────────────────────
  fotos: {
    einwand: '„Ich bin Gutachter, kein Fotograf."',
    antwort: 'Es geht nicht um schöne Bilder, sondern um Vorhandensein. Zehn Aufnahmen mit dem Telefon reichen — Büro, Messplatz, ein Fahrzeug in Begutachtung. Was zählt, ist, dass jemand sieht, wohin er kommt.',
  },
  oeffnungszeiten: {
    einwand: '„Ich bin sowieso flexibel erreichbar."',
    antwort: 'Das weiß nur, wer anruft. In der Kartensuche steht ohne Zeiten kein „jetzt geöffnet" — und wer nachts nach einem Unfall sucht, wählt die Nummer, bei der es steht.',
  },
  bewertungszahl: {
    einwand: '„Meine Kunden bewerten nicht."',
    antwort: 'Sie werden nicht gefragt. Wer bei der Gutachten-Übergabe einen QR-Code auf dem Blatt hat, bekommt Rückläufe — das ist der einzige Unterschied zwischen Büros mit fünf und mit fünfzig Bewertungen.',
  },
  bewertungsschnitt: {
    einwand: '„Ein Schnitt von 4,7 ist doch gut."',
    antwort: 'Absolut ja, im Vergleich nein. Wir haben Ihr Umfeld gemessen: die Mehrheit dort steht bei glatten 5,0. Ein guter Schnitt ist hier die Regel — deshalb zählt die Anzahl mehr.',
  },
  telefon: {
    einwand: '„Die Nummer steht doch auf meiner Website."',
    antwort: 'Im Profil steht sie nicht. Wer Sie in der Kartensuche findet, sieht dann keinen Anrufknopf — und der Weg über die Website kostet zwei Klicks, die nicht jeder geht.',
  },
  website: {
    einwand: '„Wer mich sucht, findet mich auch so."',
    antwort: 'Bis dahin endet der Weg beim Profil. Der Link ist kostenlos und in einer Minute eingetragen — es gibt keinen Grund, ihn wegzulassen.',
  },

  // ── seo ────────────────────────────────────────────────────────────────
  titel: {
    einwand: '„Da steht doch mein Firmenname."',
    antwort: 'Für alle, die den Namen kennen, ist das richtig. Wer „Kfz-Gutachter" plus Ort sucht — und so suchen Geschädigte —, sieht Ihren Namen gar nicht erst.',
  },
  beschreibung: {
    einwand: '„Das liest doch niemand."',
    antwort: 'Gelesen wird es in dem Moment, in dem jemand zwischen zehn Treffern wählt. Fehlt sie, schneidet Google sich selbst einen Satz aus Ihrer Seite — meist einen, den Sie nicht gewählt hätten.',
  },
  h1: {
    einwand: '„Die Überschrift steht doch groß da."',
    antwort: 'Sichtbar ja, technisch nein. Viele Baukästen setzen formatierten Text statt einer Überschrift — für den Leser identisch, für die Suchmaschine nicht vorhanden.',
  },
  ortsbezug: {
    einwand: '„Ich arbeite im ganzen Bundesgebiet."',
    antwort: 'Gesucht wird trotzdem örtlich. Wer nach einem Unfall einen Gutachter braucht, tippt seinen Ort dazu — ohne Ortsnamen auf der Seite kann sie diese Anfrage nicht gewinnen.',
  },
  daten: {
    einwand: '„Das ist mir zu technisch."',
    antwort: 'Das macht Ihr Webbetreuer in einer Stunde. Es ist ein kleiner Datenblock, der Google sagt: das hier ist eine Adresse, das sind Öffnungszeiten. Ohne ihn steht beides nur als Text da.',
  },

  // ── ux ─────────────────────────────────────────────────────────────────
  telefonLink: {
    einwand: '„Die Nummer steht doch da."',
    antwort: 'Sie steht da, aber sie wählt nicht. Am Unfallort, mit einer Hand am Lenkrad, ist der Unterschied zwischen Antippen und Abschreiben genau der Anruf, den Sie bekommen oder nicht.',
  },
  kontaktweg: {
    einwand: '„Anrufen ist doch am schnellsten."',
    antwort: 'Für Sie ja. Ein Teil der Leute schreibt lieber, gerade abends. Ohne Formular oder E-Mail-Link warten die bis morgen — und rufen bis dahin jemand anderen an.',
  },
  oben: {
    einwand: '„Man muss doch nur einmal scrollen."',
    antwort: 'Nach einem Unfall scrollt niemand. Die Nummer gehört in den Kopfbereich, sichtbar ohne eine einzige Bewegung.',
  },
  zeiten: {
    einwand: '„Ich gehe eigentlich immer ran."',
    antwort: 'Das weiß der Anrufer nicht. Ein Satz — wann Sie erreichbar sind und wie schnell Sie zurückrufen — nimmt genau die Unsicherheit, die zum nächsten Treffer führt.',
  },
  notfall: {
    einwand: '„Das verspreche ich lieber nicht."',
    antwort: 'Dann versprechen Sie, was Sie halten. „In der Regel binnen 48 Stunden" ist besser als gar keine Angabe — nach einem Unfall ist Geschwindigkeit das Erste, wonach gefragt wird.',
  },

  // ── verz ───────────────────────────────────────────────────────────────
  adresseDa: {
    einwand: '„Die Adresse steht im Impressum."',
    antwort: 'Dort sucht sie niemand. Sie gehört in den Fußbereich jeder Seite — als Text, nicht als Bild, damit auch Suchmaschinen sie lesen.',
  },
  adresseGleich: {
    einwand: '„Das ist doch dieselbe Firma."',
    antwort: 'Für Sie ja. Google kann zwei Anschriften nicht zu einem Betrieb zusammenführen — die Signale verteilen sich auf zwei Einträge, und keiner davon rankt gut.',
  },
  telefonGleich: {
    einwand: '„Beide Nummern gehen zu mir."',
    antwort: 'Anrufer landen dann je nach Weg woanders, und die örtliche Auffindbarkeit leidet zusätzlich. Eine Nummer, überall dieselbe — das ist der ganze Aufwand.',
  },
  nameGleich: {
    einwand: '„Der Zusatz im Profil hilft doch beim Finden."',
    antwort: 'Er verstößt gegen Googles Richtlinien und kann zur Sperrung des Profils führen. Der Firmenname gehört ins Namensfeld, alles andere in die Beschreibung.',
  },

  // ── zuweiser ───────────────────────────────────────────────────────────
  werkstatt: {
    einwand: '„Mit Werkstätten arbeite ich längst zusammen."',
    antwort: 'Auf Ihrer Website steht davon nichts. Wer neu auf Sie stößt — eine Werkstatt, die einen Gutachter sucht —, sieht keinen Anknüpfungspunkt.',
  },
  anwalt: {
    einwand: '„Anwälte suchen sich ihre Gutachter selbst."',
    antwort: 'Genau. Und sie suchen im Netz nach jemandem, dessen Gutachten vor Gericht halten. Ein Absatz zu Ihrer Qualifikation ist das, wonach sie schauen.',
  },
  partnerseite: {
    einwand: '„Dafür ist meine Seite zu klein."',
    antwort: 'Es ist eine Unterseite. Ihr Wert liegt weniger im Auffinden als im Gespräch: Sie können darauf verweisen, statt jedem dasselbe zu erklären.',
  },

  // ── nach ───────────────────────────────────────────────────────────────
  kosten: {
    einwand: '„Das erkläre ich am Telefon."',
    antwort: 'Dann muss erst jemand anrufen. Wer „wer zahlt das Gutachten" googelt, landet bei dem, der es aufgeschrieben hat — und ruft dort an.',
  },
  wertminderung: {
    einwand: '„Das steht doch im Gutachten."',
    antwort: 'Das liest er, nachdem er Sie beauftragt hat. Vorher sucht er den Begriff — und findet einen anderen Gutachter, der ihn erklärt.',
  },
  nutzungsausfall: {
    einwand: '„Darum kümmert sich der Anwalt."',
    antwort: 'Wenn schon einer da ist. Viele Geschädigte suchen zuerst selbst, und wer ihnen die Wahl zwischen Mietwagen und Entschädigung erklärt, hat den ersten Kontakt.',
  },
  restwert: {
    einwand: '„Das ist Fachsprache."',
    antwort: 'Und genau deshalb wird sie gesucht. Wer sie erklärt, wird gefunden — und wirkt zugleich kundig.',
  },
  ablauf: {
    einwand: '„Das ist doch jedes Mal anders."',
    antwort: 'Der Rahmen nicht: Anruf, Besichtigung, Gutachten binnen soundso viel Tagen. Drei Sätze nehmen die Unsicherheit, die sonst zum nächsten Treffer führt.',
  },
  freieWahl: {
    einwand: '„Das wissen die Leute doch."',
    antwort: 'Die meisten nicht. Viele glauben, die Versicherung des Gegners bestimme den Gutachter. Dieser eine Hinweis ist Aufklärung und Ihr stärkstes Argument zugleich.',
  },
  totalschaden: {
    einwand: '„Das entscheidet die Rechnung, nicht die Website."',
    antwort: 'Richtig — gesucht wird es trotzdem. „130 Prozent" ist einer der häufigsten Begriffe nach einem Unfall, und wer ihn erklärt, wird dabei gefunden.',
  },
  kasko: {
    einwand: '„Kaskoschäden rechnen sich kaum."',
    antwort: 'Dann lassen Sie es bewusst weg — das ist eine Entscheidung, keine Lücke. Nur sollte sie eine Entscheidung sein und kein Versehen.',
  },
}

/** Fallback, wenn ein Kriterium noch keinen Einwand hat. */
const OHNE_EINWAND = {
  einwand: '(zu diesem Punkt ist kein typischer Einwand hinterlegt)',
  antwort: 'Bleiben Sie bei der gemessenen Zahl und fragen Sie, wie er sie einschätzt.',
}

/**
 * Die drei Befunde mit dem groessten Abstand zum Maximum.
 *
 * ⚠ NICHT ERHOBENE Befunde bleiben draussen. Sie haetten rechnerisch den
 * groesstmoeglichen Abstand und stuenden damit ganz oben — Aaron nennte im
 * Gespraech eine Schwaeche, die niemand gemessen hat (R-B).
 */
export function dreiWichtigste(befunde: Record<string, ModulErgebnis>): Befund[] {
  const alle: Befund[] = []
  for (const modul of Object.values(befunde)) {
    for (const b of modul.befunde ?? []) {
      if (b.wert === null) continue
      if (b.maximum <= 0) continue
      if (b.punkte >= b.maximum) continue
      alle.push(b)
    }
  }
  return alle
    .sort((a, b) => {
      const abstand = (b.maximum - b.punkte) - (a.maximum - a.punkte)
      if (abstand !== 0) return abstand
      // ⚠ Bei gleichem Abstand entschiede sonst die Reihenfolge im Objekt —
      // also Zufall. Dann gewinnt das schwerere Kriterium: sechs von sechs
      // fehlenden Punkten wiegen weniger als sechs von acht, weil das
      // Kriterium selbst mehr zum Gesamtbild beitraegt.
      if (b.maximum !== a.maximum) return b.maximum - a.maximum
      return a.schluessel.localeCompare(b.schluessel)
    })
    .slice(0, 3)
}

/** Minuten aus der Aufwandsangabe („45 min", „1,5 h") zurueckrechnen. */
function minutenAus(aufwand: string): number {
  const zahl = Number(aufwand.replace(/[^\d,.]/g, '').replace(',', '.'))
  if (!Number.isFinite(zahl)) return 0
  return /h/i.test(aufwand) ? zahl * 60 : zahl
}

function alsWochen(minuten: number): string {
  if (minuten <= 0) return 'wenigen Tagen'
  // Zwei Stunden Arbeit je Woche ist die Annahme fuer einen laufenden Betrieb —
  // niemand nimmt sich fuer so etwas einen ganzen Tag.
  const wochen = Math.max(1, Math.round(minuten / 120))
  return wochen === 1 ? 'einer Woche' : `${wochen} Wochen`
}

/** Der Lage-Satz aus den Wettbewerbszahlen. */
function baueLage(befunde: Record<string, ModulErgebnis>): string {
  const wett = befunde.wett?.befunde ?? []
  const finde = (s: string) => wett.find((b) => b.schluessel === s)

  const markt = finde('marktgroesse')
  const rang = finde('rang')
  const median = finde('median')

  if (!markt || markt.wert === null) {
    return 'Das Wettbewerbsumfeld wurde bei diesem Check nicht erhoben — nennen Sie keine Umkreiszahlen, die Sie nicht belegen können.'
  }

  const teile = [`In Ihrem Umkreis sind ${markt.wert} Büros in der Kartensuche sichtbar.`]

  // ⚠ Die Einordnung des Befunds NICHT roh uebernehmen. Sie ist als Beisatz
  // unter einer Ueberschrift geschrieben („Unter dem Median (100) — 5
  // Bewertungen fehlen dorthin") und steht hier ohne Bezug: wem fehlen sie?
  // Im Gespraech gesprochen ergibt das keinen Satz. Deshalb aus dem WERT
  // („95 von 100") ein eigener.
  if (median && typeof median.wert === 'string') {
    const [eigen, mitte] = median.wert.split(' von ')
    if (eigen && mitte) {
      teile.push(`Der mittlere Betrieb dort hat ${mitte} Bewertungen, Sie haben ${eigen}.`)
    }
  }

  if (rang && rang.wert !== null) {
    teile.push(`Damit stehen Sie auf ${rang.wert}.`)
  }
  return teile.join(' ')
}

export function baueGespraech(
  befunde: Record<string, ModulErgebnis>,
  massnahmen: Massnahme[],
): Gespraech {
  const drei = dreiWichtigste(befunde)

  let zahlen = 0
  for (const modul of Object.values(befunde)) {
    for (const b of modul.befunde ?? []) if (b.wert !== null) zahlen++
  }

  const phase1 = massnahmen.filter((m) => m.ph === 1)
  const minuten = phase1.reduce((s, m) => s + minutenAus(m.a), 0)

  return {
    module: Object.keys(befunde).length,
    zahlenMitQuelle: zahlen,
    lage: baueLage(befunde),
    dreiZahlen: drei.map((b) => {
      const e = EINWAENDE[b.schluessel] ?? OHNE_EINWAND
      return {
        schluessel: b.schluessel,
        label: b.label,
        wert: String(b.wert),
        luecke: b.maximum - b.punkte,
        maximum: b.maximum,
        einordnung: b.einordnung,
        quelle: b.quelle,
        einwand: e.einwand,
        antwort: e.antwort,
      }
    }),
    phase1,
    phase1Punkte: phase1.reduce((s, m) => s + m.p, 0),
    phase1Dauer: alsWochen(minuten),
  }
}
