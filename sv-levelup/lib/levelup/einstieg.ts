import type { Db } from '../anreicherung/schreiben'
import { darfNoch, vermerkeVersuch } from './ratelimit'
import { loeseStandortAuf } from './standort'
import { erzeugeToken } from './token'

export const GUELTIG_TAGE = 90

export type EinstiegEingabe = {
  modus: 'aufbau' | 'bestand'
  /** Optional. Ohne ihn findet `wett` den eigenen Eintrag in der Kartensuche nicht. */
  firmenname?: string
  websiteUrl?: string
  ort?: string
  plz?: string
  ipHash: string
  userAgent?: string
}

/**
 * Normalisiert eine Nutzereingabe zu einer URL — oder zu `null`.
 *
 * F-01: "Bei ungueltiger URL: Feld bleibt leer, kein Fehler — Weg A
 * funktioniert ohne Website." Wer nur `meyer-gutachten.de` tippt, meint
 * `https://meyer-gutachten.de`; wer Unsinn tippt, bekommt kein Modul, das eine
 * URL braucht — aber auch keine Fehlermeldung, die ihn aufhaelt.
 */
export function deuteUrl(roh: string | undefined): string | null {
  const s = roh?.trim()
  if (!s) return null

  const mitSchema = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(mitSchema)
    // Ein Host ohne Punkt ist keine oeffentliche Adresse ("localhost", Tippfehler)
    if (!u.hostname.includes('.')) return null
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return null
  }
}

/**
 * F-01 · Check anlegen.
 *
 * Reihenfolge ist Teil der Zusage: erst Rate-Limit, dann Standort, dann
 * schreiben. Ein abgewiesener Versuch soll keine Zeile hinterlassen.
 */
export async function legeCheckAn(
  db: Db,
  e: EinstiegEingabe,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!(await darfNoch(db, e.ipHash))) return { ok: false, error: 'rate_limit' }

  const standort = await loeseStandortAuf(db, { plz: e.plz, ort: e.ort })
  if (!standort) return { ok: false, error: 'standort_unbekannt' }

  const token = erzeugeToken()
  const gueltigBis = new Date(Date.now() + GUELTIG_TAGE * 86_400_000).toISOString()

  const { data, error } = await db
    .from('levelup_checks')
    .insert({
      token,
      modus: e.modus,
      firmenname: e.firmenname?.trim() || null,
      website_url: deuteUrl(e.websiteUrl),
      standort_ort: standort.ort,
      standort_plz: standort.plz,
      standort_lat: standort.lat,
      standort_lng: standort.lng,
      module_gewaehlt: [],
      module_gewuenscht: [],
      status: 'neu',
      quelle: 'levelup',
      ip_hash: e.ipHash,
      user_agent: e.userAgent ?? null,
      gueltig_bis: gueltigBis,
    })
    .select()
    .single()

  if (error || !data) {
    return { ok: false, error: `Check nicht anlegbar: ${error?.message ?? 'kein Ergebnis'}` }
  }

  await vermerkeVersuch(db, e.ipHash)

  // Nicht kritisch: ein fehlendes Ereignis darf den Check nicht verhindern.
  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: (data as { id: string }).id,
    typ: 'modus_gewaehlt',
    payload: { modus: e.modus, mitUrl: Boolean(deuteUrl(e.websiteUrl)) },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return { ok: true, token }
}
