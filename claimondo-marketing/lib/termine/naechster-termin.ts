// Naechster buchbarer Vor-Ort-Termin einer Stadt — server-seitig, fuer das HTML.
//
// WARUM DAS EXISTIERT: Unsere buchbare Realitaet (welcher Gutachter, welcher Termin)
// lebte bisher ausschliesslich in zwei Kanaelen, die ein browsendes LLM nicht liest:
// der JSON-API und dem cross-origin-iframe des Finders. Gemessen am 24.08.2026 lieferte
// `/gutachter-finden` 232 KB HTML mit **null** Gutachtern und **null** Terminen — fuer
// GPTBot, PerplexityBot und ClaudeBot gleichermassen (alle drei sind per robots.txt
// ausdruecklich erlaubt, sie fanden nur nichts vor). Ein LLM kann uns also empfehlen,
// aber keinen Termin nennen. Diese Datei bringt dieselbe Wahrheit ins HTML.
//
// KEIN Cloaking: ausgeliefert wird fuer alle dasselbe Markup — Crawler wie Menschen.

import { createAdminClient } from '@/lib/supabase/admin'
import { STAEDTE } from '@/lib/kfz-gutachter/staedte'

/** Was die Stadtseite anzeigt. `null` = nichts anzeigen (kein Termin, API stumm). */
export type NaechsterTermin = {
  /** „Montag, 25.08." — Berlin-Zeit, nicht UTC. */
  label: string
  /** Deeplink MIT `sv` + `slot`: oeffnet den Finder mit Gutachter UND Termin vorgewaehlt. */
  buchungsUrl: string
  /**
   * WER den Termin anbietet — Vorname, Bewertung, Entfernung.
   *
   * Warum das dazugehoert: ohne diese Angaben konnte ein LLM zwar sagen „Montag ist frei",
   * aber nicht WEM man begegnet. Eine Empfehlung ohne Person ist schwaecher als eine mit
   * („Gaith, 5,0★ aus 119 Bewertungen, ca. 5 km"). Nur Vorname + oeffentliche Kennzahlen —
   * exakt die anon-sichere Projektion, die die oeffentliche API ohnehin ausgibt (kein
   * Nachname, keine Adresse, keine Telefonnummer: der Lead laeuft weiter ueber uns).
   */
  vorname: string | null
  bewertungSchnitt: number | null
  bewertungAnzahl: number | null
  entfernung: string | null
}

const APP_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

/**
 * Wie lange ein Ergebnis wiederverwendet wird.
 *
 * Die Stadtseiten sind voll dynamisch (`headers()` im [locale]-Layout verhindert SSG) —
 * ohne diesen Data-Cache wuerde JEDER Seitenaufruf die Termin-Engine anwerfen, und die
 * ist DB-schwer (findBestSV + parallele Slot-Abfragen). 5 Minuten sind fuer eine Angabe
 * auf TAGES-Ebene reichlich genau und deckeln die Last auf ~12 Abfragen/Stunde je Stadt.
 */
const CACHE_SEKUNDEN = 300

/**
 * Nach dieser Zeit ist uns die Angabe die Wartezeit nicht wert — die Seite gewinnt.
 *
 * Gemessen am 24.08.2026 gegen prod: warm 0,14–0,18 s, Kaltstart einer nie abgefragten
 * Stadt 0,66–0,69 s, ein einzelner Ausreisser bei 2,14 s. Ein erster Entwurf mit 2500 ms
 * lief bei genau diesem Ausreisser in den Abort — und weil ein abgebrochener Fetch nichts
 * cacht, waere der Block DAUERHAFT unsichtbar geblieben statt einmal langsam zu sein.
 * 4000 ms liegt komfortabel ueber dem gemessenen Maximum; getragen wird die Wartezeit
 * ohnehin nur beim Cache-Miss (alle 5 Minuten je Stadt).
 */
const TIMEOUT_MS = 4000

type ApiSlot = { start?: string; buchungs_url?: string }
type ApiGutachter = {
  termine?: ApiSlot[]
  vorname?: string
  bewertung_schnitt?: number | null
  bewertung_anzahl?: number | null
  entfernung?: string
}

/**
 * Frueheste freie Zeit in `stadt` + der Deeplink dorthin.
 *
 * Faellt IMMER weich aus: Timeout, HTTP-Fehler, kaputtes JSON, keine Termine → `null`,
 * und die Stadtseite rendert diesen Block einfach nicht. Eine Marketingseite darf nie
 * an einer Terminabfrage haengen.
 */
export async function ladeNaechstenTermin(stadt: string): Promise<NaechsterTermin | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    // `ort=` statt `plz=`: STAEDTE fuehrt nur ein PLZ-PRAEFIX ("50–51"), keine echte
    // 5-stellige PLZ. Die API geocodet Freitext-Orte ohnehin selbst.
    const url = `${APP_ORIGIN}/api/v1/gutachter-termine?ort=${encodeURIComponent(stadt)}`
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: CACHE_SEKUNDEN } })
    if (!res.ok) return null
    const daten = (await res.json()) as { gutachter?: ApiGutachter[] }

    // Frühesten Slot über ALLE Gutachter suchen — die API sortiert nach Entfernung,
    // nicht nach Zeit. Der bestgerankte Gutachter hat also nicht zwingend den
    // frühesten Termin, und genau der ist hier die Aussage.
    let fruehester: { zeit: number; url: string; g: ApiGutachter } | null = null
    for (const g of daten.gutachter ?? []) {
      for (const s of g.termine ?? []) {
        if (!s.start || !s.buchungs_url) continue
        const zeit = Date.parse(s.start)
        if (!Number.isFinite(zeit)) continue
        if (!fruehester || zeit < fruehester.zeit) fruehester = { zeit, url: s.buchungs_url, g }
      }
    }
    if (!fruehester) return null

    // Berlin-Zeit, nicht UTC: ein Slot um 22:30 UTC ist in Deutschland schon der
    // Folgetag — ohne timeZone stuende auf der Seite das falsche Datum.
    const label = new Date(fruehester.zeit).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Europe/Berlin',
    })
    return {
      label,
      buchungsUrl: fruehester.url,
      vorname: fruehester.g.vorname ?? null,
      bewertungSchnitt: fruehester.g.bewertung_schnitt ?? null,
      bewertungAnzahl: fruehester.g.bewertung_anzahl ?? null,
      entfernung: fruehester.g.entfernung ?? null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Eine Stadt mit ihrem naechsten freien Termin — fuer die Uebersicht auf /gutachter-finden. */
export type StadtTermin = NaechsterTermin & { stadt: string }

/**
 * WO das Netz gerade arbeitet — abgeleitet aus den aktiven Sachverstaendigen, NICHT
 * aus einer Handliste.
 *
 * Vorher standen hier fuenf feste NRW-Staedte. Ein ChatGPT-Lauf am 24.08.2026 hat den
 * Konstruktionsfehler offengelegt: kurz zuvor war ein SV in BREMERHAVEN freigeschaltet
 * worden, seine Stadtseite trug den Termin sofort — die Uebersicht aber nicht, und das
 * Modell bemerkte es woertlich („zeigt Termine fuer Koeln, Duesseldorf und Duisburg,
 * fuer Bremerhaven aber nicht"). Eine Handliste veraltet mit jedem neuen Partner.
 *
 * Jetzt: SV-Standorte laden, jede der 173 gepflegten Staedte auf Naehe pruefen, die
 * Treffer nehmen. Ein neuer Partner erscheint damit ueberall automatisch.
 */
async function ladeEinsatzStaedte(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('sachverstaendige')
      .select('standort_lat, standort_lng')
      .eq('ist_aktiv', true)
      .eq('verifiziert', true)
      .eq('ist_testaccount', false)
      .not('isochrone_polygon', 'is', null)
      .not('standort_lat', 'is', null)
      .not('standort_lng', 'is', null)
    const svs = (data ?? []) as Array<{ standort_lat: number | null; standort_lng: number | null }>
    if (svs.length === 0) return []

    // Eine Stadt zaehlt als Einsatzgebiet, wenn ein SV im Umkreis sitzt. 30 km ist die
    // Distanz, mit der auch das Matching arbeitet.
    const treffer: string[] = []
    for (const stadt of STAEDTE) {
      const nah = svs.some(
        (sv) => distanzKm(Number(sv.standort_lat), Number(sv.standort_lng), stadt.lat, stadt.lng) <= 30,
      )
      if (nah) treffer.push(stadt.name)
      if (treffer.length >= MAX_UEBERSICHT) break
    }
    return treffer
  } catch {
    return []
  }
}

/** Obergrenze: jede Stadt kostet eine API-Abfrage. Gemessen 24.08. — acht parallel im
 *  kalten Zustand 4,28 s, fuenf rund die Haelfte. Mehr als sechs waere den TTFB nicht wert. */
const MAX_UEBERSICHT = 6

/** Haversine in km — genau genug fuer eine 30-km-Entscheidung, ohne PostGIS-Roundtrip. */
function distanzKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export async function ladeUebersichtsTermine(): Promise<StadtTermin[]> {
  const staedte = await ladeEinsatzStaedte()
  if (staedte.length === 0) return []
  const ergebnisse = await Promise.all(
    staedte.map(async (stadt) => {
      const t = await ladeNaechstenTermin(stadt)
      return t ? { ...t, stadt } : null
    }),
  )
  return ergebnisse.filter((x): x is StadtTermin => x !== null)
}
