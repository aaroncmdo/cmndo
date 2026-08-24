import type { Db } from '../anreicherung/schreiben'
import { DUBLETTEN_KM, nameAusQuelle } from './dubletten'
import { sucheTreffer } from './zuordnung'

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
 * Der Abgleich liegt in `zuordnung.ts` und laeuft ueber ZWEI Merkmale: die
 * Domain (hart, aber bei Ketten mehrdeutig) und Name plus Umkreis.
 *
 * ⚠ Bis zum 21.08. pruefte dieser Pfad NUR Name und Umkreis — und legte
 * dadurch eine Dublette an, die auf prod stand: „Bergk Sachverständige GmbH"
 * (Altenkirchen, Excel-Import Mai) bekam einen zweiten Datensatz in Münster,
 * weil ein Check ohne Firmennamen dort gemessen wurde. Beide Bedingungen des
 * Namensabgleichs versagten zugleich: ohne Firma ist der Namenskern leer, und
 * 150 km sind kein Umkreis. Der zweite Eintrag war `ist_aktiv=true` und damit
 * auf der oeffentlichen Karte sichtbar — ein Betrieb an einem Ort, an dem er
 * nicht sitzt.
 *
 * ⭐ Der Standort im Check ist der GESUCHTE Ort, nicht der Betriebssitz. Wer
 * beide gleichsetzt, legt fuer jeden Betrieb, der ausserhalb seiner Heimatstadt
 * prueft, einen neuen Datensatz an. Die Domain kennt diesen Unterschied nicht
 * und traegt deshalb weiter.
 *
 * ⚠ Sind die Kandidaten nicht lesbar, wird ABGEBROCHEN statt angelegt. Blind
 * anzulegen erzeugte genau die Dubletten, die diese Funktion verhindern soll —
 * und zwar unbemerkt.
 */
export async function findeOderLegeAn(db: Db, e: LeadEingabe): Promise<LeadErgebnis> {
  const gefunden = await sucheTreffer(db, {
    firmenname: e.firma,
    website_url: e.websiteUrl,
    lat: e.lat,
    lng: e.lng,
  })

  if (!gefunden.ok) return { ok: false, error: gefunden.error }

  if (gefunden.treffer) {
    const k = gefunden.treffer.lead
    return verknuepfe(db, {
      id: k.id, firma: k.firma, name: k.name, lat: k.lat, lng: k.lng,
      telefon: k.telefon ?? null, email: k.email ?? null, website_url: k.website_url,
    }, e)
  }

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
