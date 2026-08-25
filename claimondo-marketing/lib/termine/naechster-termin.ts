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
  /** „Montag, 25.08." — Berlin-Zeit, nicht UTC. Kurzform fuer den Staedte-Streifen. */
  label: string
  /** „11:00" — Berlin-Zeit. Eigenes Feld, weil der Streifen die Kurzform braucht,
   *  die Stadtseite aber die vollstaendige Terminangabe zeigen muss. */
  uhrzeit: string
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
    // ⚠ Die UHRZEIT fehlte — und damit die halbe Terminangabe.
    //
    // Die Seite nannte nur „Dienstag, 25.08.". Ein Termin ohne Uhrzeit ist keiner: der
    // Kunde weiss nicht, ob er sich den Vormittag freihalten muss, und ein Modell kann
    // sie nicht nennen. Genau das war am 25.08.2026 in ChatGPTs Antwort zu sehen — es
    // gab „Dienstag, 25.08.2026" aus, weil mehr nicht dastand.
    //
    // Bewusst ein EIGENES Feld statt `label` zu verlaengern: der Uebersichts-Streifen
    // listet bis zu 12 Staedte nebeneinander und braucht die Kurzform.
    const uhrzeit = new Date(fruehester.zeit).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    })
    return {
      label,
      uhrzeit,
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
export async function ladeEinsatzStaedte(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('sachverstaendige')
      .select('standort_lat, standort_lng, paket_umkreis_km')
      .eq('ist_aktiv', true)
      .eq('verifiziert', true)
      .eq('ist_testaccount', false)
      // Admin-Toggle: ein SV kann intern arbeiten, ohne oeffentlich als buchbar genannt
      // zu werden. Default true — bestehende SVs bleiben sichtbar.
      .eq('ki_sichtbar', true)
      .not('isochrone_polygon', 'is', null)
      .not('standort_lat', 'is', null)
      .not('standort_lng', 'is', null)
    const svs = (data ?? []) as Array<{
      standort_lat: number | null
      standort_lng: number | null
      paket_umkreis_km: number | null
    }>
    if (svs.length === 0) return []

    // JE SV die naechstgelegene Stadt — nicht "die ersten N Staedte mit einem SV im Umkreis".
    //
    // ⚠ Der erste Entwurf lief ueber STAEDTE und brach nach MAX_UEBERSICHT Treffern ab.
    // Das Array beginnt mit NRW, also waren die Plaetze voll, bevor Bremerhaven ueberhaupt
    // geprueft wurde — obwohl dort ein SV sitzt. Am 24.08. auf prod gesehen: der Streifen
    // zeigte Koeln, Duesseldorf, Duisburg, Wuppertal und Bremerhaven NICHT. Die Grenze
    // kappte nach Array-POSITION statt nach Relevanz.
    //
    // Jetzt bestimmt jeder SV genau einen Eintrag: seine naechste Stadt. Damit ist jeder
    // Standort des Netzes vertreten, die Liste waechst mit den Partnern statt mit der
    // Laenge einer Handliste, und Dubletten (zwei Koelner SVs) fallen zusammen.
    const gesehen = new Set<string>()
    const treffer: string[] = []
    for (const sv of svs) {
      // ⚠ JE SV SEIN GEBUCHTER UMKREIS, nicht pauschal 30 km.
      //
      // Gemessen am 25.08.2026 lag der feste Wert in BEIDE Richtungen daneben:
      // Nihal (Duesseldorf) und Andreas (Erkelenz) haben 40 km — ihre Randstaedte
      // fielen heraus, obwohl sie dort arbeiten. Kelvin und Shakib haben 15 km —
      // fuer sie wurden Staedte als abgedeckt gezeigt, in die sie gar nicht fahren.
      // Beides kostet: einmal ein verlorener Lead, einmal ein Klick, der ins Leere
      // fuehrt (der Kunde landet im Finder und findet keinen Termin).
      //
      // `paket_umkreis_km` ist der gebuchte, also geschaeftlich verbindliche Wert.
      // Die Isochrone waere noch genauer (Fahrzeit statt Luftlinie), kostet aber
      // Punkt-in-Polygon gegen ~10k Vertices je SV — fuer eine Uebersichtsliste
      // unverhaeltnismaessig. Fehlt der Wert, bleibt es beim bisherigen Default.
      const radius = typeof sv.paket_umkreis_km === 'number' && sv.paket_umkreis_km > 0
        ? sv.paket_umkreis_km
        : 30
      let beste: { name: string; km: number } | null = null
      for (const stadt of STAEDTE) {
        const km = distanzKm(Number(sv.standort_lat), Number(sv.standort_lng), stadt.lat, stadt.lng)
        if (km <= radius && (!beste || km < beste.km)) beste = { name: stadt.name, km }
      }
      if (beste && !gesehen.has(beste.name)) {
        gesehen.add(beste.name)
        treffer.push(beste.name)
      }
    }
    // Reihenfolge = die von STAEDTE (dort stehen die grossen NRW-Staedte vorn, wo das Netz
    // dicht ist). Ohne das haenge die Anzeige an der SV-Sortierung — eine Kleinstadt stuende
    // dann vor Koeln, nur weil ihr Gutachter alphabetisch frueher kommt.
    const rang = new Map(STAEDTE.map((s, i) => [s.name, i]))
    treffer.sort((a, b) => (rang.get(a) ?? 9999) - (rang.get(b) ?? 9999))
    return treffer.slice(0, MAX_UEBERSICHT)
  } catch {
    return []
  }
}

/**
 * Obergrenze der Uebersicht.
 *
 * ⚠ Sie war auf 6 — und hat damit AUSGERECHNET die Standorte gekappt, die neu dazukamen.
 * Am 24.08. auf prod: das Netz arbeitet an neun Orten, der Streifen zeigte vier, und
 * Bremerhaven fehlte trotz frisch freigeschaltetem SV. Eine Grenze unterhalb der Zahl
 * echter Standorte ist keine Sparmassnahme, sondern eine Zufallsauswahl.
 *
 * 12 deckt das Netz mit Luft nach oben. Der Preis ist vertretbar: acht parallele
 * Abfragen kosten warm 0,44 s (kalt 4,28 s), und BEIDE Konsumenten des Streifens
 * (Startseite, Pillar-Seite) liegen in `<Suspense>` — der Kaltstart blockiert also
 * keinen TTFB mehr. Die Stadtseiten fragen ohnehin nur ihre eine Stadt ab.
 */
const MAX_UEBERSICHT = 12

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
