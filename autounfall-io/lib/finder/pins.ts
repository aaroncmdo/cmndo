import { createServiceClient } from '@/lib/supabase/server'
import { alleSeiten } from '@/lib/db/alle-seiten'

// Native, footprint-safe Finder-Pins fuer autounfall.io. Liest server-seitig aus
// der GETEILTEN Supabase (wie submitAutounfallLead) — NUR anonyme Felder gehen an
// den Client (kein Firmenname/Adresse/Kontakt/PII). Repliziert die anon-sichere
// Logik aus claimondo-v2 src/lib/actions/gutachter-finder-actions.ts, ABER mit dem
// Service-Client (bypassed RLS) + EXPLIZITEM map_ready-Filter — den die anon-RLS-
// Policy `sachverstaendige_anon_select_map_ready` sonst server-seitig erzwingt:
//   verifiziert=true AND ist_aktiv=true AND geloescht_am IS NULL
//   AND standort_lat/lng IS NOT NULL AND isochrone_polygon IS NOT NULL.
// OHNE diesen Filter wuerde der Service-Client unverifizierte/inaktive SVs leaken.
//
// KEIN claimondo.de-Ref (Entity-Lock): Daten kommen aus supabase.co (server-only),
// genau wie das bestehende Lead-Formular.

export type DeadPin = { id: string; lat: number; lng: number }

export type AktiverSVPin = {
  id: string
  lat: number
  lng: number
  vorname_initiale: string | null
  stadt: string | null
  spezifikationen_top3: string[]
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
  mitgliedschaften: string[]
  gutachter_typ: string | null
}

export type FinderPins = { deadPins: DeadPin[]; aktiveSVs: AktiverSVPin[] }

// "Schuetzenstrasse 68-70, 42853 Remscheid" -> "Remscheid" (Stadt ist anonym genug;
// Strasse/Hausnummer verlassen diese Function nie).
function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const t = name.trim()
  return t.length > 0 ? t.charAt(0).toUpperCase() : null
}

// Interne Demo-/Test-Accounts ("Test Aaron Gutachter GmbH", "Smoke SV") raus —
// firmenname verlaesst diese Function nie.
function isTestAccount(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

export async function ladeFinderPins(): Promise<FinderPins> {
  const sb = createServiceClient()

  // Tier-3 Dead-Pins (sv_leads, Excel-Import): nur id/lat/lng, kein Popup, anonym.
  //
  // ⚠ SEITENWEISE. PostgREST deckelt ohne `range` bei 1.000 Zeilen — ohne
  // Fehler, ohne Log. Solange 62 Dead-Pins aktiv waren, fiel das nicht auf; mit
  // den über 7.000 entdeckten Betrieben (Lead-Discovery, 21.08.) zeigte diese
  // Karte stillschweigend 1.000 von 7.500.
  const gelesen = await alleSeiten<{ id: string; lat: number | null; lng: number | null }>((von, bis) =>
    sb.from('sv_leads').select('id,lat,lng').eq('ist_aktiv', true)
      .order('id', { ascending: true })
      .range(von, bis),
  )
  const deadPins: DeadPin[] = (gelesen.ok ? gelesen.zeilen : [])
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({ id: l.id, lat: Number(l.lat), lng: Number(l.lng) }))

  // Tier-1 SVs (sachverstaendige) — EXPLIZITER map_ready-Filter (Service bypassed RLS!).
  const { data: svRows } = await sb
    .from('sachverstaendige')
    .select('id,profile_id,firmenname,standort_lat,standort_lng,standort_adresse,spezifikationen,gutachter_typ')
    .eq('verifiziert', true)
    .eq('ist_aktiv', true)
    .is('geloescht_am', null)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
    .not('isochrone_polygon', 'is', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((svRows ?? []) as any[]).filter((r) => !isTestAccount(r.firmenname))
  if (rows.length === 0) return { deadPins, aktiveSVs: [] }

  const profileIds = Array.from(new Set(rows.map((r) => r.profile_id).filter(Boolean) as string[]))
  const svIds = rows.map((r) => r.id as string)

  // Read 2 (Service-Role): Vorname-Initiale + Google-Reviews + Credential-Presence.
  // profiles + google_bewertungen_cache sind anon-RLS-blocked -> brauchen Service.
  // Wir projizieren NUR anonyme Trust-Signale (kein Name/Adresse/Kammer-Nummer).
  const [profRes, bewRes, credRes] = await Promise.all([
    sb.from('profiles').select('id,vorname').in('id', profileIds),
    sb.from('google_bewertungen_cache').select('profile_id,durchschnitt,anzahl_bewertungen').in('profile_id', profileIds),
    sb
      .from('sachverstaendige')
      .select('id,bvsk_mitgliedsnummer,ihk_zertifikat_nummer,oebuv_bestellungsnummer,dat_nummer')
      .in('id', svIds),
  ])

  const vornameByProfile = new Map<string, string | null>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (profRes.data ?? []) as any[]) vornameByProfile.set(p.id, p.vorname)

  const bewByProfile = new Map<string, { d: number; n: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bewRes.data ?? []) as any[]) {
    bewByProfile.set(b.profile_id, { d: Number(b.durchschnitt), n: b.anzahl_bewertungen ?? 0 })
  }

  const mitglBySv = new Map<string, string[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (credRes.data ?? []) as any[]) {
    const m: string[] = []
    if (e.bvsk_mitgliedsnummer) m.push('BVSK')
    if (e.ihk_zertifikat_nummer) m.push('IHK')
    if (e.oebuv_bestellungsnummer) m.push('öbuv')
    if (e.dat_nummer) m.push('DAT')
    mitglBySv.set(e.id, m)
  }

  const aktiveSVs: AktiverSVPin[] = rows.map((r) => {
    const pid = (r.profile_id as string | null) ?? null
    const vorname = pid ? vornameByProfile.get(pid) ?? null : null
    const bew = pid ? bewByProfile.get(pid) : undefined
    const specs = Array.isArray(r.spezifikationen) ? (r.spezifikationen as string[]) : []
    return {
      id: r.id as string,
      lat: Number(r.standort_lat),
      lng: Number(r.standort_lng),
      vorname_initiale: firstInitial(vorname),
      stadt: extractStadt(r.standort_adresse as string | null),
      spezifikationen_top3: specs.slice(0, 3),
      bewertungs_durchschnitt: bew ? bew.d : null,
      bewertungs_anzahl: bew ? bew.n : null,
      mitgliedschaften: mitglBySv.get(r.id as string) ?? [],
      gutachter_typ: (r.gutachter_typ as string | null) ?? null,
    }
  })

  return { deadPins, aktiveSVs }
}
