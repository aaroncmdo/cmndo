import type { Db } from '../anreicherung/schreiben'
import { DUBLETTEN_KM, istDublette, nameAusQuelle } from './dubletten'

/**
 * Der Status eines frisch entstandenen Leads.
 *
 * ⚠ NICHT 'neu', obwohl CONTRACT F-06 Schritt 4 das so schreibt: der
 * CHECK `sv_leads_warteliste_status_check` erlaubt ausschliesslich
 * `ausstehend | kontaktiert | aktiv | abgelehnt` (geprueft 19.08.). Mit 'neu'
 * haette Postgres JEDEN ersten Lead abgewiesen. 'ausstehend' ist laut
 * Spaltenkommentar genau das Gemeinte: „neu eingetragen".
 */
export const WARTELISTE_NEU = 'ausstehend'

/** Grobfilter fuer die Kandidaten — ~0,15° sind rund 15 km, also mehr als DUBLETTEN_KM. */
const BOX_GRAD = 0.15

export type LeadEingabe = {
  firma: string | null
  plz: string | null
  ort: string | null
  lat: number
  lng: number
  telefon: string | null
  websiteUrl: string | null
}

export type LeadErgebnis =
  | { ok: true; leadId: string; neu: boolean }
  | { ok: false; error: string }

type Kandidat = {
  id: string
  firma: string | null
  name: string
  lat: number
  lng: number
  telefon: string | null
  email: string | null
  website_url: string | null
}

/**
 * Verknuepft einen bestehenden `sv_leads`-Datensatz oder legt einen neuen an.
 *
 * Der Abgleich laeuft in ZWEI Stufen: ein grober Rechteck-Filter in SQL (damit
 * nicht alle Leads geladen werden) und der eigentliche Vergleich in
 * TypeScript. Warum nicht alles in SQL: der Namensabgleich braucht
 * `kernName()`, und die entsprechende DB-Spalte leistet das nicht (siehe
 * `dubletten.ts`).
 *
 * ⚠ Sind die Kandidaten nicht lesbar, wird ABGEBROCHEN statt angelegt. Blind
 * anzulegen erzeugte genau die Dubletten, die diese Funktion verhindern soll —
 * und zwar unbemerkt.
 */
export async function findeOderLegeAn(db: Db, e: LeadEingabe): Promise<LeadErgebnis> {
  const { data, error } = await db
    .from('sv_leads')
    .select('id,firma,name,lat,lng,telefon,email,website_url')
    .gte('lat', e.lat - BOX_GRAD)
    .lte('lat', e.lat + BOX_GRAD)
    .gte('lng', e.lng - BOX_GRAD)
    .lte('lng', e.lng + BOX_GRAD)

  if (error) {
    return { ok: false, error: `Bestandsleads nicht lesbar: ${error.message}` }
  }

  const treffer = ((data ?? []) as Kandidat[]).find((k) =>
    istDublette(
      { firma: e.firma, lat: e.lat, lng: e.lng },
      { firma: k.firma ?? k.name, lat: k.lat, lng: k.lng },
    ),
  )

  if (treffer) return verknuepfe(db, treffer, e)

  const { data: neu, error: insertFehler } = await db
    .from('sv_leads')
    .insert({
      name: nameAusQuelle(e.firma, e.websiteUrl, e.ort),
      firma: e.firma,
      adresse: [e.plz, e.ort].filter(Boolean).join(' ') || 'ohne Angabe',
      plz: e.plz,
      ort: e.ort,
      lat: e.lat,
      lng: e.lng,
      telefon: e.telefon,
      website_url: e.websiteUrl,
      quelle: 'sv-levelup',
      ist_aktiv: true,
      warteliste_status: WARTELISTE_NEU,
    })
    .select()
    .single()

  if (insertFehler || !neu) {
    return { ok: false, error: `Lead nicht anlegbar: ${insertFehler?.message ?? 'kein Ergebnis'}` }
  }

  return { ok: true, leadId: (neu as { id: string }).id, neu: true }
}

/**
 * Ergaenzt nur LEERSTELLEN — dieselbe Regel wie in der Anreicherung (T-24).
 * Ein bestehender Wert ist erhoben worden; ein neuer ist nicht deshalb besser,
 * weil er neuer ist.
 */
async function verknuepfe(db: Db, treffer: Kandidat, e: LeadEingabe): Promise<LeadErgebnis> {
  const werte: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() }

  if (!treffer.telefon?.trim() && e.telefon) werte.telefon = e.telefon
  if (!treffer.website_url?.trim() && e.websiteUrl) werte.website_url = e.websiteUrl
  if (!treffer.firma?.trim() && e.firma) werte.firma = e.firma

  const { data, error } = await db
    .from('sv_leads')
    .update(werte)
    .eq('id', treffer.id)
    .select()

  if (error) return { ok: false, error: `Lead nicht ergaenzbar: ${error.message}` }
  if (!data || data.length === 0) {
    return { ok: false, error: `Ergaenzung traf 0 Zeilen fuer Lead ${treffer.id}` }
  }

  return { ok: true, leadId: treffer.id, neu: false }
}

export { DUBLETTEN_KM }
