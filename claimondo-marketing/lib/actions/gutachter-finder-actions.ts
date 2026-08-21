'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { alleSeiten } from '@/lib/db/alle-seiten'

// Privacy-by-default: nur Geokoordinaten + ID. Tier-3 sv_leads (Excel-Import,
// keine Pakete, keine Reviews) sind auf der Marketing-Karte komplett
// anonymisierte Dead-Pins — keine Firma, keine Adresse, keine Kontaktdaten,
// kein Vorname dürfen auf den anonymen Client.
export type SvLeadPublic = {
  id: string
  lat: number
  lng: number
}

// Tier-1 SVs (sachverstaendige). 2026-06-02 (Aaron "die Profile sollen public
// sein"): JEDER verifizierte, aktive SV (RLS-gegated auf verifiziert+map_ready)
// bekommt ein klickbares anonymes Profil-Popup (Sterne, Specs, Region, Initiale)
// — nicht mehr nur paket='standard'. `paket` bleibt im Typ für künftige
// Differenzierung. Felder werden für alle zurückgegebenen Zeilen befüllt.
export type AktiverSVPublic = {
  id: string
  standort_lat: number
  standort_lng: number
  isochrone_polygon: unknown
  paket: string
  vorname_initiale: string | null
  stadt: string | null
  spezifikationen_top3: string[]
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
}

// Extrahiert die Stadt aus einer typischen Adresse:
//   "Schützenstraße 68-70, 42853 Remscheid" → "Remscheid"
//   "Mediapark 5, 50670 Köln" → "Köln"
// Privacy-Note: Stadt ist anonym genug (Köln hat 200+ Gutachter). Straße +
// Hausnummer kämen NICHT zum Client — die liegen nur in der Server-Action.
function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  // Fallback: letzter Komma-Teil, PLZ-Prefix abschneiden
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : null
}

// Aaron-Smoke 14.05.2026: "Test Aaron Gutachter GmbH" + "Smoke SV" sind
// interne Demo-Accounts die NICHT auf der Marketing-Karte erscheinen sollen
// (Customer sieht sonst "Sachverständiger in Köln Test" o.ä. — peinlich +
// verfälscht den Marker-Count). Heuristik: Firmenname enthält Test/Smoke/Demo
// als Wort-Token. Kein DB-Flag (yet) — wenn ein echter SV namens "Testfeld
// Gutachter GmbH" reinkommt, müssen wir auf ist_test-Spalte upgraden.
function isTestAccount(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

export async function ladeSvLeads(): Promise<{ ok: true; data: SvLeadPublic[] } | { ok: false; error: string }> {
  // Privacy: sv_leads sind Tier-3 Excel-Importe ohne Pakete. Auf der Karte
  // erscheinen sie als Dead-Pins ohne Popup — wir reichen daher KEINE
  // identifizierenden Felder raus (kein name, firma, adresse, telefon, email).
  //
  // ⚠ SEITENWEISE. PostgREST deckelt ohne `range` bei 1.000 Zeilen, ohne Fehler.
  const supabase = await createClient()
  const gelesen = await alleSeiten<SvLeadPublic>((von, bis) =>
    supabase
      .from('sv_leads')
      .select('id,lat,lng')
      .eq('ist_aktiv', true)
      .order('id', { ascending: true })
      .range(von, bis),
  )
  if (!gelesen.ok) return { ok: false, error: gelesen.error }
  return { ok: true, data: gelesen.zeilen }
}

/**
 * Wie viele Dead-Pins es gibt — als ZAHL, ohne die Zeilen zu holen.
 *
 * ⭐ Der Anlass ist ein stiller Rechenfehler in einer WERBLICHEN Aussage: die
 * Netzgrösse auf `/kfz-gutachter/vermittlungsportale-vergleich` entstand aus
 * `ladeSvLeads().data.length`. Solange 62 Pins aktiv waren, stimmte das. Mit
 * über 7.000 entdeckten Betrieben hätte dieselbe Zeile **1.000** geliefert —
 * der Deckel von PostgREST, nicht die Wahrheit. Eine Zahl, die im Quelltext
 * ausdrücklich als „UWG-belegbar" bezeichnet wird, darf nicht an einem
 * unsichtbaren Limit hängen.
 *
 * `head: true` holt ausserdem KEINE Zeilen — 7.500 Datensätze für eine Zahl zu
 * übertragen wäre auch ohne den Fehler verschwenderisch.
 */
export async function zaehleSvLeads(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('sv_leads')
    .select('id', { count: 'exact', head: true })
    .eq('ist_aktiv', true)
  if (error) {
    console.error('[zaehleSvLeads]', error.message)
    return 0
  }
  return count ?? 0
}

export async function ladeAktiveSVs(): Promise<{ ok: true; data: AktiverSVPublic[] } | { ok: false; error: string }> {
  // Read 1 (anon-RLS): Geo + paket + spezifikationen + firmenname (NUR für
  // Test-Account-Filter — wird NICHT in den Public-Typ weitergereicht).
  //
  // KEIN .eq('ist_aktiv', true): `ist_aktiv` ist NICHT in den anon-Spalten-Grants
  // (anon-Leak-Fix granted nur 9 Map-Spalten). Ein Filter darauf wirft als anon
  // "permission denied for table sachverstaendige" und killt den GESAMTEN Read
  // → 0 SVs auf der Marketing-Karte (nur sv_lead-Dead-Pins). Die anon-RLS-Policy
  // `sachverstaendige_anon_select_map_ready` erzwingt ist_aktiv=true +
  // verifiziert=true + geloescht_am IS NULL ohnehin server-seitig — der App-Filter
  // war redundant. isochrone_polygon + standort_lat SIND granted → Filter ok.
  const supabase = await createClient()
  const { data: allRows, error } = await supabase
    .from('sachverstaendige')
    .select('id,paket,profile_id,firmenname,standort_lat,standort_lng,standort_adresse,spezifikationen,isochrone_polygon')
    .not('isochrone_polygon', 'is', null)
    .not('standort_lat', 'is', null)
  if (error) return { ok: false, error: error.message }
  // Test-Accounts ("Test Aaron Gutachter GmbH", "Smoke SV") server-side filtern
  // — firmenname verlässt diese Function nie.
  const rows = (allRows ?? []).filter((r) => !isTestAccount(r.firmenname as string | null))
  if (rows.length === 0) return { ok: true, data: [] }

  // Read 2 (Service-Role): Vorname-Initiale + Reviews für ALLE verifizierten SVs
  // (2026-06-02, Aaron: "die Profile sollen public sein" — nicht mehr nur
  // paket='standard'). profiles + google_bewertungen_cache sind anon-RLS-blocked
  // — wir lesen sie intern via Service-Role und reichen nur die anonymisierten
  // Aggregate raus (Vorname-Initiale, Review-Schnitt+Anzahl).
  const profilRows = rows.filter((r) => r.profile_id)
  const profileIds = Array.from(new Set(profilRows.map((r) => r.profile_id as string)))

  const vornameByProfileId = new Map<string, string | null>()
  const bewertungByProfileId = new Map<string, { durchschnitt: number; anzahl: number }>()

  if (profileIds.length > 0) {
    const admin = createAdminClient()
    const [profilesRes, bewRes] = await Promise.all([
      admin.from('profiles').select('id,vorname').in('id', profileIds),
      admin
        .from('google_bewertungen_cache')
        .select('profile_id,durchschnitt,anzahl_bewertungen')
        .in('profile_id', profileIds),
    ])
    if (profilesRes.data) {
      for (const p of profilesRes.data) vornameByProfileId.set(p.id, p.vorname)
    }
    if (bewRes.data) {
      for (const b of bewRes.data) {
        bewertungByProfileId.set(b.profile_id, {
          durchschnitt: Number(b.durchschnitt),
          anzahl: b.anzahl_bewertungen ?? 0,
        })
      }
    }
  }

  const mapped: AktiverSVPublic[] = rows.map((r) => {
    const profileId = r.profile_id as string | null
    const vorname = profileId ? vornameByProfileId.get(profileId) ?? null : null
    const bew = profileId ? bewertungByProfileId.get(profileId) : undefined
    const specsAll = Array.isArray(r.spezifikationen) ? (r.spezifikationen as string[]) : []
    return {
      id: r.id,
      standort_lat: Number(r.standort_lat),
      standort_lng: Number(r.standort_lng),
      isochrone_polygon: r.isochrone_polygon,
      paket: r.paket,
      vorname_initiale: firstInitial(vorname),
      stadt: extractStadt(r.standort_adresse as string | null),
      spezifikationen_top3: specsAll.slice(0, 3),
      bewertungs_durchschnitt: bew ? bew.durchschnitt : null,
      bewertungs_anzahl: bew ? bew.anzahl : null,
    }
  })

  return { ok: true, data: mapped }
}
