import { domainKandidaten } from './domain-kandidaten'
import { extrahiere } from './impressum'
import { kernName } from './kern-name'
import { istErlaubt, parseRobots } from './robots'
import { emailSicherheit, websiteSicherheit } from './sicherheit'
import type { AnreicherungsFeld, Fund, WebsiteMethode } from './schreiben'

/** Die vier Pfade, die F-16 erlaubt. Kein Vollcrawl. */
export const IMPRESSUM_PFADE = ['/impressum', '/kontakt', '/imprint', '/legal-notice']

export const USER_AGENT =
  'SVLevelUp/1.0 (+https://sv-levelup.claimondo.de; Kontakt-Recherche, robots.txt-konform)'

export type Antwort = {
  status: number
  text: string
  /**
   * Reine Abrufdauer in Millisekunden — OHNE Drosselzeit.
   *
   * ⚠ Wer die Zeit um `hole()` herum selbst misst, misst die Drossel mit: vor
   * dem zweiten Abruf auf denselben Host wartet der Holer 2 Sekunden. Am
   * echten Lauf aufgefallen (18.08.): drei Websites „brauchten" 1532/2164/2058
   * ms und verloren alle denselben Punkt — gemessen wurde die Wartezeit.
   */
  dauerMs?: number
}

/**
 * Injizierbar, damit die Orchestrierung ohne echtes Netz testbar ist. Die
 * Produktions-Implementierung mit Drossel und Timeout steht in `netz.ts`.
 *
 * Ein Netzfehler ist KEINE Ausnahme, sondern `status: 0` — der Lauf soll an
 * einer unerreichbaren Domain nicht abbrechen.
 */
export type Holer = (url: string) => Promise<Antwort>

/** Entscheider je Host, damit robots.txt einmal je Lauf geholt wird. */
export type RobotsCache = Map<string, (pfad: string) => boolean>

export type Lead = {
  id: string
  firma: string | null
  name: string
  ort: string | null
  plz: string | null
  website_url: string | null
}

export type LeadBefund = {
  leadId: string
  website: string | null
  websiteSicherheit: number
  /** Warum kein Treffer — R-B: kein Treffer ist ein Ergebnis, keine Luecke. */
  grund: string | null
  kandidaten: string[]
  funde: Fund[]
}

function textEnthaelt(text: string, nadel: string | null): boolean {
  if (!nadel || nadel.trim().length < 2) return false
  return text.toLowerCase().includes(nadel.toLowerCase())
}

/**
 * Steckt ein Kernbegriff des Firmennamens im Hostnamen?
 *
 * ⚠ Der leere Kern MUSS false ergeben. `''.split(' ')` ist `['']`, und
 * `host.includes('')` ist immer true — ein Lead, dessen Name nur aus
 * Gattungswoertern besteht, haette sonst 40 Sicherheit geschenkt bekommen.
 */
export function kernStecktImHost(kern: string, host: string): boolean {
  const teile = kern.split(' ').filter((t) => t.length > 1)
  if (teile.length === 0) return false
  return teile.some((t) => host.includes(t))
}

/**
 * Prueft robots.txt fuer einen Host und merkt sich das Ergebnis fuer den
 * ganzen Lauf — eine Abfrage je Verzeichnis und Check (R-G).
 *
 * Fehlschlag-Semantik, die der Parser selbst nicht kennt:
 *   4xx              -> keine Regeln, also erlaubt (die Datei gibt es nicht)
 *   5xx / status 0   -> UNKLAR, wir fragen die Domain nicht ab
 *
 * Die 5xx-Haltung ist bewusst streng: "unklar" als "erlaubt" zu lesen waere
 * genau der Fall, in dem wir gegen ein Verbot crawlen, das wir nicht gesehen
 * haben.
 */
export async function robotsFuerHost(
  host: string,
  hole: Holer,
  cache: RobotsCache,
): Promise<(pfad: string) => boolean> {
  const vorhanden = cache.get(host)
  if (vorhanden) return vorhanden

  const antwort = await hole(`https://${host}/robots.txt`)
  let entscheider: (pfad: string) => boolean

  if (antwort.status === 0 || antwort.status >= 500) {
    entscheider = () => false
  } else if (antwort.status >= 400) {
    entscheider = () => true
  } else {
    const regeln = parseRobots(antwort.text)
    entscheider = (pfad: string) => istErlaubt(regeln, pfad)
  }

  cache.set(host, entscheider)
  return entscheider
}

function hostAus(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
}

/**
 * F-15 + F-16 fuer EINEN Lead: Website finden, Impressum lesen, Funde bilden.
 * Schreibt nichts — das macht `schreibeFunde`.
 */
export async function verarbeiteLead(
  lead: Lead,
  hole: Holer,
  robotsCache: RobotsCache,
): Promise<LeadBefund> {
  const firma = lead.firma ?? lead.name
  const kern = kernName(firma)

  // Eine bereits bekannte Website wird nicht geraten. Sie kam aus Google Places
  // oder aus einem frueheren Lauf — die Zuordnung ist gegeben, nicht erschlossen.
  const websiteBekannt = Boolean(lead.website_url?.trim())
  const kandidaten = websiteBekannt
    ? [hostAus(lead.website_url as string)]
    : domainKandidaten(firma, lead.ort)

  if (kandidaten.length === 0) {
    return {
      leadId: lead.id, website: null, websiteSicherheit: 0, kandidaten, funde: [],
      grund: kern
        ? 'keine Domain-Kandidaten bildbar'
        : 'Firmenname besteht nur aus Gattungswoertern — nicht ratbar',
    }
  }

  let bester: { host: string; sicherheit: number } | null = null

  for (const host of kandidaten) {
    const erlaubt = await robotsFuerHost(host, hole, robotsCache)
    if (!erlaubt('/')) continue

    const antwort = await hole(`https://${host}/`)
    if (antwort.status !== 200 || !antwort.text) continue

    // Bei bekannter Website ist die Zuordnung nicht geraten -> volle Sicherheit.
    const sicherheit = websiteBekannt
      ? 100
      : websiteSicherheit({
          kernImHost: kernStecktImHost(kern, host),
          firmaImText: textEnthaelt(antwort.text.replace(/<[^>]+>/g, ' '), firma),
          ortImText: textEnthaelt(antwort.text.replace(/<[^>]+>/g, ' '), lead.ort),
          plzImText: textEnthaelt(antwort.text.replace(/<[^>]+>/g, ' '), lead.plz),
        })

    if (!bester || sicherheit > bester.sicherheit) bester = { host, sicherheit }
    if (sicherheit >= 90) break   // sicher genug; weitere Abrufe waeren Last ohne Nutzen
  }

  if (!bester) {
    return {
      leadId: lead.id, website: null, websiteSicherheit: 0, kandidaten, funde: [],
      grund: websiteBekannt
        ? 'bekannte Website nicht erreichbar oder per robots.txt gesperrt'
        : 'kein Kandidat erreichbar oder alle per robots.txt gesperrt',
    }
  }

  const treffer = bester            // ab hier feststehend — spart die Non-Null-Assertion
  const website = `https://${treffer.host}`
  const funde: Fund[] = []
  const belegt = new Set<AnreicherungsFeld>()

  /**
   * Erster Fund je Feld gewinnt. Ohne das entstehen zwei Funde fuer dasselbe
   * Feld, wenn /impressum die Person nennt und /kontakt die Adresse — und damit
   * zwei Audit-Zeilen, von denen nur eine dem geschriebenen Wert entspricht.
   */
  const merke = (
    feld: AnreicherungsFeld, wert: string, quelleUrl: string, sicherheit: number,
    methode?: WebsiteMethode,
  ) => {
    if (belegt.has(feld)) return
    belegt.add(feld)
    // `zuordnung` ist immer die Website-Sicherheit — sie sagt, ob die Quelle zu
    // diesem Lead gehoert. `sicherheit` kann davon abweichen (Rollenadresse).
    funde.push({ feld, wert, quelleUrl, sicherheit, zuordnung: treffer.sicherheit, methode })
  }

  // Eine schon bekannte Website nicht als Fund melden — sie wuerde nur als
  // "bereits gefuellt" uebersprungen und das Protokoll aufblaehen.
  // Die Methode ist hier immer 'domain_raten': dieser Lauf erschliesst die
  // Domain aus dem Firmennamen. 'verzeichnis' kommt erst mit dem Scraper (P6).
  if (!websiteBekannt) merke('website_url', website, website, treffer.sicherheit, 'domain_raten')

  const erlaubt = await robotsFuerHost(treffer.host, hole, robotsCache)
  for (const pfad of IMPRESSUM_PFADE) {
    if (belegt.has('email') && belegt.has('telefon') && belegt.has('vorname')) break
    if (!erlaubt(pfad)) continue

    const antwort = await hole(`${website}${pfad}`)
    if (antwort.status !== 200 || !antwort.text) continue

    const befund = extrahiere(antwort.text)
    const quelle = `${website}${pfad}`

    if (befund.email) {
      merke('email', befund.email, quelle, emailSicherheit(befund.istRollenadresse, treffer.sicherheit))
    }
    if (befund.telefon) merke('telefon', befund.telefon, quelle, treffer.sicherheit)
    if (befund.person) {
      const teile = befund.person.split(/\s+/)
      if (teile.length >= 2) {
        merke('vorname', teile[0], quelle, treffer.sicherheit)
        merke('nachname', teile.slice(1).join(' '), quelle, treffer.sicherheit)
      }
    }
  }

  return {
    leadId: lead.id, website, websiteSicherheit: treffer.sicherheit,
    kandidaten, grund: null, funde,
  }
}
