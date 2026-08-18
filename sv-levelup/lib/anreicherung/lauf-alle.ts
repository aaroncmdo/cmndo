import { verarbeiteLead, type Holer, type Lead, type RobotsCache } from './lauf'
import { schreibeFunde, type AnreicherungsFeld, type Db } from './schreiben'

export const ANREICHERBARE_FELDER: AnreicherungsFeld[] =
  ['website_url', 'email', 'telefon', 'vorname', 'nachname']

export type LaufBericht = {
  laufId: string
  dryRun: boolean
  betrachtet: number
  /** Wie viele Leads eine belastbare Website bekamen (Sicherheit >= 70). */
  websiteBelastbar: number
  /** Je Feld: wie oft es geschrieben wurde (im Trockenlauf: wuerde). */
  jeFeld: Record<string, number>
  sicherheit: { hoch: number; mittel: number; niedrig: number }
  /** Gruende fuer Nicht-Treffer, gruppiert — R-B: kein Treffer ist ein Ergebnis. */
  gruende: Record<string, number>
  fehler: { leadId: string; error: string }[]
}

function leerenBericht(laufId: string, dryRun: boolean): LaufBericht {
  return {
    laufId, dryRun, betrachtet: 0, websiteBelastbar: 0,
    jeFeld: {}, sicherheit: { hoch: 0, mittel: 0, niedrig: 0 },
    gruende: {}, fehler: [],
  }
}

/**
 * Faehrt F-15 + F-16 ueber die Arbeitsmenge: aktive, unbeanspruchte Leads mit
 * mindestens einer Leerstelle.
 *
 * Sequenziell, nicht parallel. Die Drossel in `netz.ts` gilt je Host; parallel
 * zu laufen wuerde sie nicht verletzen, aber der Nutzen waere gering (die
 * Kandidaten-Hosts sind ohnehin verschieden) und ein Abbruch mitten im Lauf
 * waere schwerer zu deuten.
 *
 * Ein Fehler bei EINEM Lead beendet den Lauf nicht — er wird gezaehlt und
 * berichtet. Sonst entscheidet ein einzelner kaputter Datensatz darueber, ob
 * die anderen 61 bearbeitet werden.
 */
export async function laufeAn(
  db: Db,
  opts: {
    laufId: string
    hole: Holer
    limit?: number
    dryRun?: boolean
    fortschritt?: (nr: number, gesamt: number, zeile: string) => void
  },
): Promise<{ ok: true; bericht: LaufBericht } | { ok: false; error: string }> {
  const dryRun = opts.dryRun ?? false
  const bericht = leerenBericht(opts.laufId, dryRun)

  let abfrage = db
    .from('sv_leads')
    .select('id,firma,name,ort,plz,website_url')
    .eq('ist_aktiv', true)
    .eq('claim_status', 'offen')
    .or('email.is.null,telefon.is.null,website_url.is.null,vorname.is.null')
    .order('erstellt_am', { ascending: true })
    // ⚠ Tiebreaker ist Pflicht, nicht Kosmetik: alle 62 Bestandsleads tragen
    // DENSELBEN erstellt_am (Excel-Import in einem Rutsch). Bei gleichen
    // Sortierwerten garantiert PostgreSQL keine Reihenfolge — zwei Laeufe mit
    // `--limit 5` trafen am 18.08. nachweislich verschiedene Leads. Ohne das
    // ist ein Teillauf nicht reproduzierbar und ein abgebrochener Massenlauf
    // (P6) nicht fortsetzbar.
    .order('id', { ascending: true })

  if (opts.limit) abfrage = abfrage.limit(opts.limit)

  const { data: leads, error } = await abfrage
  if (error) return { ok: false, error: `Leads nicht lesbar: ${error.message}` }
  if (!leads || leads.length === 0) return { ok: true, bericht }

  const robotsCache: RobotsCache = new Map()

  for (const [i, lead] of (leads as Lead[]).entries()) {
    bericht.betrachtet += 1
    const kennung = lead.firma ?? lead.name

    let befund
    try {
      befund = await verarbeiteLead(lead, opts.hole, robotsCache)
    } catch (err) {
      // Ein unerwarteter Fehler ist ein Befund, kein Abbruch.
      const text = err instanceof Error ? err.message : String(err)
      bericht.fehler.push({ leadId: lead.id, error: text })
      opts.fortschritt?.(i + 1, leads.length, `${kennung}: FEHLER ${text}`)
      continue
    }

    if (befund.grund) {
      bericht.gruende[befund.grund] = (bericht.gruende[befund.grund] ?? 0) + 1
      opts.fortschritt?.(i + 1, leads.length, `${kennung}: ${befund.grund}`)
      continue
    }

    if (befund.websiteSicherheit >= 90) bericht.sicherheit.hoch += 1
    else if (befund.websiteSicherheit >= 70) bericht.sicherheit.mittel += 1
    else bericht.sicherheit.niedrig += 1
    if (befund.websiteSicherheit >= 70) bericht.websiteBelastbar += 1

    const res = await schreibeFunde(db, lead.id, befund.funde, opts.laufId, { dryRun })
    if (!res.ok) {
      bericht.fehler.push({ leadId: lead.id, error: res.error })
      opts.fortschritt?.(i + 1, leads.length, `${kennung}: SCHREIBFEHLER ${res.error}`)
      continue
    }

    for (const feld of res.geschrieben) {
      bericht.jeFeld[feld] = (bericht.jeFeld[feld] ?? 0) + 1
    }
    opts.fortschritt?.(
      i + 1, leads.length,
      `${kennung}: ${befund.website} (${befund.websiteSicherheit}) -> ${res.geschrieben.join(', ') || 'nichts neu'}`,
    )
  }

  return { ok: true, bericht }
}
