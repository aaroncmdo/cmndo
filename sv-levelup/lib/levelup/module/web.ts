import { istErlaubt, parseRobots } from '../../anreicherung/robots'
import { istClientseitig } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`web: 12`). */
export const WEB_PUNKTE = 12

/**
 * Punktverteilung — BESCHLUSS, nicht aus der Uebergabe-Spec uebernommen.
 *
 * ⚠ Die ausformulierte Messvorschrift (`references/scoring-modell.md` im Skill
 * `gutachter-sichtbarkeits-check`) ist nicht auffindbar — weder unter
 * ~/.claude noch in den Uebergabe-Specs noch im Repo. Diese Verteilung ist
 * deshalb hergeleitet, nicht zitiert:
 *
 *   Impressum 3 + Datenschutz 3  = 6  → Saeule 7 „Vertrauen & Rechtssicherheit"
 *   HTTPS 3 + Zeit 2 + Mobil 1   = 6  → Saeule 6 „Technik & Ladezeit"
 *
 * Die beiden Rechtspflichten wiegen am schwersten, weil ihr Fehlen abmahnfaehig
 * ist (§ 5 TMG, Art. 13 DSGVO) — das ist kein Geschmacksurteil. HTTPS gleichauf:
 * ohne markieren Browser die Seite sichtbar als „nicht sicher".
 *
 * Sobald die Messvorschrift auftaucht, ist SIE massgeblich.
 */
export const GEWICHTE = { https: 3, impressum: 3, datenschutz: 3, antwortzeit: 2, mobil: 1 }

/** Schwellen fuer die Antwortzeit in Millisekunden. */
const ZEIT_GUT = 800
const ZEIT_MITTEL = 2500

const IMPRESSUM_MUSTER = /impressum|imprint|legal[-\s]?notice|anbieterkennzeichnung/i
const DATENSCHUTZ_MUSTER = /datenschutz|privacy|dsgvo|gdpr/i

/**
 * Modul `web` — Website: Technik und Recht.
 *
 * Prueft die Startseite. Kein Vollcrawl: die fuenf Kriterien sind alle von dort
 * aus feststellbar, und jeder weitere Abruf waere Last auf einem fremden Server
 * ohne zusaetzliche Aussage.
 */
export async function messeWeb(k: Messkontext): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'web',
        grund: 'Für diesen Check ist keine Website hinterlegt — nichts zu prüfen.',
      }],
    }
  }

  // R-G: robots.txt zuerst, und eine Sperre ist ein Grund, kein Nullwert.
  const host = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const schema = url.startsWith('http://') ? 'http' : 'https'
  const robotsAntwort = await k.hole(`${schema}://${host}/robots.txt`)

  if (robotsAntwort.status === 200) {
    const regeln = parseRobots(robotsAntwort.text)
    if (!istErlaubt(regeln, '/')) {
      return {
        befunde: [],
        fehlstellen: [{
          schluessel: 'web',
          grund: `Die Website schließt automatische Abrufe per robots.txt aus (${host}) — nicht geprüft.`,
        }],
      }
    }
  }

  const antwort = await k.hole(url)
  // ⚠ NICHT selbst um hole() herum stoppen: davor liegt die Drossel des
  // Holers (2 s je Host). Am echten Lauf gemessen wurden dadurch 1532/2164/2058
  // ms fuer drei Seiten — die Wartezeit, nicht die Website.
  const dauerMs = antwort.dauerMs ?? null

  if (antwort.status !== 200 || !antwort.text) {
    // ⚠ NICHT „0 Punkte in allen Kriterien": gemessen wurde nichts (R-B).
    const grund = antwort.status === 0
      ? `${url} war nicht erreichbar.`
      : `${url} antwortete mit Status ${antwort.status}.`
    return {
      befunde: [],
      fehlstellen: (Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[])
        .map((s) => ({ schluessel: s, grund })),
    }
  }

  const html = antwort.text
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · HTTPS
  const hatHttps = url.startsWith('https://')
  befunde.push(befund(
    'https', 'Verschlüsselte Verbindung', hatHttps,
    hatHttps ? GEWICHTE.https : 0, GEWICHTE.https, url, erhoben,
    hatHttps ? undefined : 'Ohne HTTPS markieren Browser die Seite sichtbar als „nicht sicher".',
  ))

  // 2 + 3 · Impressum (§ 5 TMG) und Datenschutzerklärung (Art. 13 DSGVO)
  //
  // ⚠ Nur wenn die Seite ihren Inhalt SERVERSEITIG ausliefert. Bei einer
  // clientseitig gerenderten Seite steht im HTML kein einziger Link — daraus
  // „kein Impressum" zu folgern, wirft dem Betrieb einen abmahnfähigen Verstoß
  // vor, den es nicht gibt. Der schädlichste Fehler, den dieses Produkt machen
  // kann. Nicht feststellbar ≠ nicht vorhanden (R-B).
  if (istClientseitig(html)) {
    const grund =
      'Die Seite lädt ihre Inhalte per JavaScript nach — ob Impressum und ' +
      'Datenschutzerklärung verlinkt sind, ist ohne Browser nicht feststellbar.'
    befunde.push(nichtErhoben('impressum', 'Impressum verlinkt', GEWICHTE.impressum, grund, url, erhoben))
    befunde.push(nichtErhoben('datenschutz', 'Datenschutzerklärung verlinkt', GEWICHTE.datenschutz, grund, url, erhoben))
  } else {
    const hatImpressum = IMPRESSUM_MUSTER.test(html)
    befunde.push(befund(
      'impressum', 'Impressum verlinkt', hatImpressum,
      hatImpressum ? GEWICHTE.impressum : 0, GEWICHTE.impressum, url, erhoben,
      hatImpressum ? undefined : 'Für geschäftsmäßige Websites nach § 5 TMG verpflichtend; Fehlen ist abmahnfähig.',
    ))

    const hatDatenschutz = DATENSCHUTZ_MUSTER.test(html)
    befunde.push(befund(
      'datenschutz', 'Datenschutzerklärung verlinkt', hatDatenschutz,
      hatDatenschutz ? GEWICHTE.datenschutz : 0, GEWICHTE.datenschutz, url, erhoben,
      hatDatenschutz ? undefined : 'Nach Art. 13 DSGVO verpflichtend, sobald personenbezogene Daten verarbeitet werden.',
    ))
  }

  // 4 · Antwortzeit
  //
  // ⚠ Die Prüfung auf null steht VOR dem Vergleich: `null <= 800` ist in
  // JavaScript true, eine fehlende Messung bekäme sonst die volle Punktzahl.
  if (dauerMs === null) {
    befunde.push(nichtErhoben(
      'antwortzeit', 'Antwortzeit der Startseite', GEWICHTE.antwortzeit,
      'Der Abruf lieferte keine verwertbare Zeitmessung.', url, erhoben,
    ))
  } else {
    const zeitPunkte = dauerMs <= ZEIT_GUT ? GEWICHTE.antwortzeit
      : dauerMs <= ZEIT_MITTEL ? 1
      : 0
    befunde.push(befund(
      'antwortzeit', 'Antwortzeit der Startseite', dauerMs,
      zeitPunkte, GEWICHTE.antwortzeit, url, erhoben,
      `Gemessen wurde die reine Abrufdauer ohne Wartezeiten. Unter ${ZEIT_GUT} ms gilt als gut, über ${ZEIT_MITTEL} ms als zu langsam.`,
    ))
  }

  // 5 · Mobile Darstellung
  const hatViewport = /<meta[^>]+name=["']?viewport/i.test(html)
  befunde.push(befund(
    'mobil', 'Für Mobilgeräte ausgelegt', hatViewport,
    hatViewport ? GEWICHTE.mobil : 0, GEWICHTE.mobil, url, erhoben,
    hatViewport ? undefined : 'Ohne Viewport-Angabe zeigen Mobilgeräte die Desktop-Fassung verkleinert.',
  ))

  return { befunde, fehlstellen }
}

/** Nur fuer den Fall, dass ein Aufrufer die Nicht-Erhoben-Form braucht. */
export function webNichtErhoben(grund: string, erhoben: string): Befund[] {
  return (Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[])
    .map((s) => nichtErhoben(s, s, GEWICHTE[s], grund, 'kein Abruf', erhoben))
}
