'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { checkAndCacheAvailability } from '@/lib/whatsapp/availability'

// Privacy-by-default: nur Geokoordinaten + ID. Tier-3 sv_leads (Excel-Import,
// keine Pakete, keine Reviews) sind auf der Marketing-Karte komplett
// anonymisierte Dead-Pins — keine Firma, keine Adresse, keine Kontaktdaten,
// kein Vorname dürfen auf den anonymen Client.
export type SvLeadPublic = {
  id: string
  lat: number
  lng: number
}

// Tier-1 SVs (sachverstaendige). Klickbarkeit + Popup-Inhalt richten sich
// nach `paket`: paket='standard' → klickbares Profil-Popup mit Sterne, Specs,
// Region, Initiale. Alle anderen Pakete → Dead-Pin wie Tier-3.
// Felder *NUR* gesetzt wenn paket='standard'.
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

export type GutachterFinderPayload = {
  vorname: string
  nachname: string
  email: string
  telefon?: string
  kennzeichen?: string
  fahrzeug_beschreibung?: string
  schadentyp: string
  schadenort?: string
  schadenort_lat?: number
  schadenort_lng?: number
  wunschtermin?: string
  zugeordneter_sv_id?: string
  zugeordneter_sv_lead_id?: string
  matching_typ?: string
  sa_signatur_data_url?: string
  // Z35-Wahl: vollstaendig (Anwalt + alle Positionen) vs. nur_gutachten (Selbst-Regulierung)
  regulierungs_modus?: 'vollstaendig' | 'nur_gutachten'
  // Aaron 10.05.: Vor-Ort-Routing am Funnel-Anfang. JA-Pfad fuehrt in Foto-Wizard
  // statt klassischer Termin-Buchung.
  am_unfallort_flag?: boolean
  aufnahme_fotos?: string[] // Base64-Data-URLs aus dem Foto-Wizard
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sv_leads')
    .select('id,lat,lng')
    .eq('ist_aktiv', true)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as SvLeadPublic[] }
}

export async function ladeAktiveSVs(): Promise<{ ok: true; data: AktiverSVPublic[] } | { ok: false; error: string }> {
  // Read 1 (anon-RLS): Geo + paket + spezifikationen + firmenname (NUR für
  // Test-Account-Filter — wird NICHT in den Public-Typ weitergereicht)
  const supabase = await createClient()
  const { data: allRows, error } = await supabase
    .from('sachverstaendige')
    .select('id,paket,profile_id,firmenname,standort_lat,standort_lng,standort_adresse,spezifikationen,isochrone_polygon')
    .eq('ist_aktiv', true)
    .not('isochrone_polygon', 'is', null)
    .not('standort_lat', 'is', null)
  if (error) return { ok: false, error: error.message }
  // Test-Accounts ("Test Aaron Gutachter GmbH", "Smoke SV") server-side filtern
  // — firmenname verlässt diese Function nie.
  const rows = (allRows ?? []).filter((r) => !isTestAccount(r.firmenname as string | null))
  if (rows.length === 0) return { ok: true, data: [] }

  // Read 2 (Service-Role): Vorname-Initiale + Reviews nur für paket='standard'.
  // profiles + google_bewertungen_cache sind anon-RLS-blocked — wir lesen sie
  // intern und reichen nur die anonymisierten Aggregate raus.
  const standardRows = rows.filter((r) => r.paket === 'standard' && r.profile_id)
  const profileIds = Array.from(new Set(standardRows.map((r) => r.profile_id as string)))

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
    const isStandard = r.paket === 'standard'
    const profileId = r.profile_id as string | null
    const vorname = isStandard && profileId ? vornameByProfileId.get(profileId) ?? null : null
    const bew = isStandard && profileId ? bewertungByProfileId.get(profileId) : undefined
    const specsAll = Array.isArray(r.spezifikationen) ? (r.spezifikationen as string[]) : []
    return {
      id: r.id,
      standort_lat: Number(r.standort_lat),
      standort_lng: Number(r.standort_lng),
      isochrone_polygon: r.isochrone_polygon,
      paket: r.paket,
      vorname_initiale: isStandard ? firstInitial(vorname) : null,
      stadt: isStandard ? extractStadt(r.standort_adresse as string | null) : null,
      spezifikationen_top3: isStandard ? specsAll.slice(0, 3) : [],
      bewertungs_durchschnitt: isStandard && bew ? bew.durchschnitt : null,
      bewertungs_anzahl: isStandard && bew ? bew.anzahl : null,
    }
  })

  return { ok: true, data: mapped }
}

export async function erstelleGutachterFinderAnfrage(
  payload: GutachterFinderPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('gutachter_finder_anfragen')
    .insert({
      vorname: payload.vorname,
      nachname: payload.nachname,
      email: payload.email,
      telefon: payload.telefon ?? null,
      kennzeichen: payload.kennzeichen ?? null,
      fahrzeug_beschreibung: payload.fahrzeug_beschreibung ?? null,
      schadentyp: payload.schadentyp,
      schadenort: payload.schadenort ?? null,
      schadenort_lat: payload.schadenort_lat ?? null,
      schadenort_lng: payload.schadenort_lng ?? null,
      wunschtermin: payload.wunschtermin ?? null,
      zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null,
      zugeordneter_sv_lead_id: payload.zugeordneter_sv_lead_id ?? null,
      matching_typ: payload.matching_typ ?? null,
      sa_signatur_data_url: payload.sa_signatur_data_url ?? null,
      sa_unterzeichnet_am: payload.sa_signatur_data_url ? new Date().toISOString() : null,
      regulierungs_modus: payload.regulierungs_modus ?? null,
      am_unfallort_flag: payload.am_unfallort_flag ?? false,
      aufnahme_fotos: payload.aufnahme_fotos && payload.aufnahme_fotos.length > 0
        ? payload.aufnahme_fotos
        : null,
      aufgenommen_am: payload.aufnahme_fotos && payload.aufnahme_fotos.length > 0
        ? new Date().toISOString()
        : null,
      status: 'neu',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  const anfrageId = data.id

  // WhatsApp-Verfügbarkeit prüfen + cachen (fire-and-forget — VPS-PM2,
  // kein Vercel-Cold-Kill-Risiko). Ergebnis landet in
  // gutachter_finder_anfragen.whatsapp_* — Dispatch sieht im Detail-View
  // ob WA-Send möglich ist bevor er den SV anruft.
  if (payload.telefon) {
    void checkAndCacheAvailability('gfa', anfrageId, payload.telefon).catch((err) => {
      console.error('[whatsapp-check] gfa failed:', err)
    })
  }

  // Dispatch-Task: alle dispatch/admin-User informieren dass ein SV angerufen werden muss
  try {
    const admin = createAdminClient()

    // SV-Name ermitteln für den Task-Text
    let svName = 'Unbekannt'
    let svTelefon: string | null = null

    if (payload.zugeordneter_sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('firmenname, profiles(anzeigename, telefon)')
        .eq('id', payload.zugeordneter_sv_id)
        .single()
      if (sv) {
        const profil = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
        svName = sv.firmenname ?? (profil as { anzeigename?: string } | null)?.anzeigename ?? 'SV'
        svTelefon = (profil as { telefon?: string } | null)?.telefon ?? null
      }
    } else if (payload.zugeordneter_sv_lead_id) {
      const { data: lead } = await admin
        .from('sv_leads')
        .select('name, telefon')
        .eq('id', payload.zugeordneter_sv_lead_id)
        .single()
      if (lead) {
        svName = lead.name
        svTelefon = lead.telefon
      }
    }

    const wunschterminText = payload.wunschtermin
      ? new Date(payload.wunschtermin).toLocaleString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : 'kein Termin'

    const taskInhalt = [
      `Kunde: ${payload.vorname} ${payload.nachname}`,
      `Schaden: ${payload.schadentyp}`,
      `Wunschtermin: ${wunschterminText}`,
      svTelefon ? `SV-Tel.: ${svTelefon}` : null,
      payload.sa_signatur_data_url ? '✓ SA unterzeichnet' : '⚠ SA noch nicht unterzeichnet',
    ]
      .filter(Boolean)
      .join(' · ')

    // Alle Dispatch-User laden und Task-Mitteilung senden
    const { data: dispatchUser } = await admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'dispatch')

    const mitteilungen = (dispatchUser ?? []).map((u: { id: string }) => ({
      empfaenger_id: u.id,
      empfaenger_rolle: 'dispatch' as const,
      kategorie: 'anruf' as const,
      titel: `SV anrufen: ${svName} — Gutachter-Finder Buchung`,
      inhalt: taskInhalt,
      kontext_typ: null,
      kontext_id: null,
      route_url: `/dispatch/gutachter-finder/${anfrageId}`,
      prioritaet: 'hoch' as const,
      icon: '📞',
    }))

    if (mitteilungen.length > 0) {
      await admin.from('mitteilungen').insert(mitteilungen)
    }
  } catch (taskErr) {
    console.error('[GutachterFinder] Dispatch-Task fehlgeschlagen:', taskErr)
  }

  revalidatePath('/admin/faelle')
  revalidatePath('/dispatch/dashboard')
  return { ok: true, id: anfrageId }
}
