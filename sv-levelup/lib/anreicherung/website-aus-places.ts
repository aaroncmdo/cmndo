import type { PlacesAdapter } from '../places'
import { PlacesFehler } from '../places'
import { alleSeiten } from '../db/alle-seiten'
import { schreibeFunde, type Db, type Fund } from './schreiben'

/**
 * Websites für entdeckte Betriebe — aus dem Google-Unternehmensprofil.
 *
 * ⭐ Der Grund, warum es diesen Weg BRAUCHT: Die Discovery legt Betriebe mit
 * Name, Anschrift, Koordinaten und Place-Kennung an — aber ohne Website. Die
 * Text-Suche liefert sie nicht mit. Und ohne Website kann die
 * Impressum-Anreicherung nichts tun: sie hat keine Seite zum Lesen. Am
 * 21.08.2026 gemessen: **7.485 entdeckte Leads, davon 0 mit Website, 0 mit
 * E-Mail, 0 mit Telefon.** Die ganze Kette hing an diesem einen fehlenden Feld.
 *
 * ⭐ Der geratene Weg (`domainKandidaten`) ist hier der falsche. Er baut
 * Domains aus dem Firmennamen und prüft sie — das trägt bei einem gepflegten
 * Bestand mit klaren Firmennamen, aber nicht bei „089 Zwez" oder „.SBG -
 * Sachverständigen Büro Grieger". Google kennt die Website, weil der Betrieb
 * sie selbst in sein Profil eingetragen hat.
 *
 * ⚠ NUR EIN FELD wird angefragt (`fields=website`). Die Preisstufe eines
 * Details-Abrufs richtet sich nach der Feldauswahl — wer Grunddaten mitbestellt
 * und wegwirft, zahlt die höhere Stufe für nichts.
 */

export type PlacesWebsiteBericht = {
  laufId: string
  dryRun: boolean
  betrachtet: number
  gefunden: number
  ohneWebsite: number
  geschrieben: number
  /** Die letzte verarbeitete Kennung — damit ein Abbruch fortsetzbar ist. */
  letzteId: string | null
  fehler: { leadId: string; error: string }[]
  /** Stichprobe der Funde — zum HINSEHEN, nicht nur Zählen. */
  proben: string[]
}

type LeadZeile = { id: string; firma: string | null; name: string; ort: string | null; google_place_id: string }

const PROBEN_JE = 15

/**
 * Pause zwischen zwei Abrufen.
 *
 * ⚠ Der Discovery-Lauf kann parallel laufen und nutzt denselben Schlüssel. Ohne
 * Drossel addieren sich beide Raten — genau die Konstellation, in der am 20.08.
 * 80 % der Abrufe mit „fetch failed" ausfielen, während der Lauf gesund aussah.
 */
export const PAUSE_MS = 200

/** Der offizielle Verweis auf einen Place — als Herkunftsnachweis am Lead. */
export function placeQuelleUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`
}

/**
 * Wie belastbar eine Website aus dem Google-Profil ist.
 *
 * `zuordnung: 100` — die Place-Kennung IST der Betrieb; hier gibt es keinen
 * Zweifel, wem die Angabe gehört (anders als beim Domain-Raten, wo genau dieser
 * Zweifel die Kernfrage ist).
 *
 * `sicherheit: 95` — der Wert selbst stammt aus der Selbstauskunft des Betriebs
 * und ist damit sehr verlässlich, aber er kann veraltet sein. Nicht 100: das
 * bleibt der Angabe vorbehalten, die auf der Seite selbst steht (Impressum).
 */
export const PLACES_SICHERHEIT = 95
export const PLACES_ZUORDNUNG = 100

export function baueFund(placeId: string, website: string): Fund {
  return {
    feld: 'website_url',
    wert: website,
    quelleUrl: placeQuelleUrl(placeId),
    sicherheit: PLACES_SICHERHEIT,
    zuordnung: PLACES_ZUORDNUNG,
    // Google Maps IST ein Verzeichnis — der vorhandene Wert passt genau, es
    // braucht keinen neuen Methodennamen (und keine Migration).
    methode: 'verzeichnis',
  }
}

export type PlacesWebsiteOpts = {
  db: Db
  places: PlacesAdapter
  laufId: string
  dryRun: boolean
  /** Nur Leads dieser Herkunft — sonst liefe der Lauf über den gepflegten Bestand. */
  quelle?: string
  limit?: number
  /** Fortsetzen: erst ab dieser Kennung (ausschliesslich). */
  abId?: string
  warte?: (ms: number) => Promise<void>
  fortschritt?: (nr: number, gesamt: number, zeile: string) => void
  /**
   * Wird nach JEDEM Lead gerufen — mit der zuletzt verarbeiteten Kennung.
   *
   * ⚠ Der Filter „ohne Website" schliesst die ERFOLGREICHEN von einem Neustart
   * aus, aber nicht die, bei denen Google keine Website kennt (rund 15 %). Ohne
   * diesen Haken würden sie bei jedem Neustart erneut abgefragt und erneut
   * bezahlt.
   */
  sichere?: (letzteId: string) => void
}

export async function holeWebsitesAusPlaces(
  o: PlacesWebsiteOpts,
): Promise<{ ok: true; bericht: PlacesWebsiteBericht } | { ok: false; error: string }> {
  const warte = o.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const bericht: PlacesWebsiteBericht = {
    laufId: o.laufId, dryRun: o.dryRun,
    betrachtet: 0, gefunden: 0, ohneWebsite: 0, geschrieben: 0,
    letzteId: null, fehler: [], proben: [],
  }

  // ⚠ Seitenweise. Bei 7.485 Kandidaten lieferte ein einfaches `.select()`
  // 1.000 — und der Lauf meldete das als Vollzug.
  const baue = (von: number, bis: number) => {
    let q = o.db
      .from('sv_leads')
      .select('id,firma,name,ort,google_place_id')
      .not('google_place_id', 'is', null)
      .is('website_url', null)
    if (o.quelle) q = q.eq('quelle', o.quelle)
    if (o.abId) q = q.gt('id', o.abId)
    return q.order('id', { ascending: true }).range(von, bis)
  }

  const gelesen = o.limit
    ? await (async () => {
        const { data, error } = await baue(0, o.limit! - 1)
        return error
          ? { ok: false as const, error: error.message }
          : { ok: true as const, zeilen: (data ?? []) as unknown as LeadZeile[] }
      })()
    : await alleSeiten<LeadZeile>(baue)

  if (!gelesen.ok) return { ok: false, error: `Kandidaten nicht lesbar: ${gelesen.error}` }
  const leads = gelesen.zeilen
  if (leads.length === 0) return { ok: true, bericht }

  for (const [i, lead] of leads.entries()) {
    if (i > 0) await warte(PAUSE_MS)

    bericht.betrachtet += 1
    bericht.letzteId = lead.id
    o.sichere?.(lead.id)
    const kennung = `${lead.firma ?? lead.name} (${lead.ort ?? 'ohne Ort'})`

    let website: string | null
    try {
      website = await o.places.websiteVon(lead.google_place_id)
    } catch (err) {
      // ⚠ Ein Ausfall beendet den Lauf NICHT — sonst entscheidet ein einzelner
      // fremder Fehler über siebentausend Abrufe.
      const text = err instanceof PlacesFehler ? err.status : (err as Error).message
      bericht.fehler.push({ leadId: lead.id, error: text })
      o.fortschritt?.(i + 1, leads.length, `${kennung}: FEHLER ${text}`)
      continue
    }

    if (!website) {
      // ⚠ „Google kennt keine Website" ist ein ERGEBNIS, kein Fehler. Viele
      // kleine Büros haben schlicht keine — und genau das ist ein Befund, den
      // der Vertrieb braucht.
      bericht.ohneWebsite += 1
      o.fortschritt?.(i + 1, leads.length, `${kennung}: keine Website im Profil`)
      continue
    }

    bericht.gefunden += 1
    if (bericht.proben.length < PROBEN_JE) bericht.proben.push(`${kennung} → ${website}`)

    const r = await schreibeFunde(o.db, lead.id, [baueFund(lead.google_place_id, website)], o.laufId, {
      dryRun: o.dryRun,
    })

    if (!r.ok) {
      bericht.fehler.push({ leadId: lead.id, error: r.error })
      o.fortschritt?.(i + 1, leads.length, `${kennung}: SCHREIBFEHLER ${r.error}`)
      continue
    }

    if (r.geschrieben.length > 0) bericht.geschrieben += 1
    o.fortschritt?.(i + 1, leads.length, `${kennung} → ${website}`)
  }

  return { ok: true, bericht }
}
