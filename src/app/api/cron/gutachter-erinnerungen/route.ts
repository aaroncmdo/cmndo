import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendCommunication } from '@/lib/communications/send'

async function getOsrmDuration(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<{ minutes: number; km: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) return null
    return {
      minutes: Math.ceil(data.routes[0].duration / 60),
      km: Math.round(data.routes[0].distance / 100) / 10,
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  // CRON_SECRET check
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  // Get today's SV termine
  const { data: termine } = await svc
    .from('faelle')
    .select('id, sv_id, sv_termin, schadens_adresse, schadens_plz, schadens_ort, losfahren_erinnerung_gesendet, termin_erinnerung_5min_gesendet, geschaetzte_fahrzeit_min, lead_id')
    .not('sv_id', 'is', null)
    .not('sv_termin', 'is', null)
    .gte('sv_termin', todayStart)
    .lt('sv_termin', todayEnd)
    .not('status', 'in', '("abgeschlossen","storniert")')

  if (!termine?.length) return NextResponse.json({ sent: 0 })

  let sent = 0

  for (const termin of termine) {
    const terminTime = new Date(termin.sv_termin!)
    const minutesUntil = Math.round((terminTime.getTime() - now.getTime()) / 60000)

    // Get SV info
    const { data: sv } = await svc.from('sachverstaendige').select('id, profile_id, standort_lat, standort_lng').eq('id', termin.sv_id).single()
    if (!sv?.profile_id) continue

    const { data: svProfile } = await svc.from('profiles').select('vorname, nachname, telefon').eq('id', sv.profile_id).single()
    if (!svProfile?.telefon) continue
    const svName = [svProfile.vorname, svProfile.nachname].filter(Boolean).join(' ')

    // Get Kunde name
    let kundeName = 'Kunde'
    if (termin.lead_id) {
      const { data: lead } = await svc.from('leads').select('vorname, nachname, telefon, kennzeichen, schadenfall_typ').eq('id', termin.lead_id).single()
      if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Kunde'
    }

    const addr = [termin.schadens_adresse, termin.schadens_plz, termin.schadens_ort].filter(Boolean).join(', ')
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`

    // Calculate drive time if not cached
    let fahrzeitMin = termin.geschaetzte_fahrzeit_min
    if (!fahrzeitMin && sv.standort_lat && sv.standort_lng && termin.schadens_adresse) {
      // Geocode destination would be needed, use OSRM with approximate coords
      // For now use a default of 30 min
      fahrzeitMin = 30
    }

    const losfahrenUm = new Date(terminTime.getTime() - (fahrzeitMin ?? 30) * 60000 - 15 * 60000) // fahrzeit + 15min puffer

    // LOSFAHREN Erinnerung
    if (!termin.losfahren_erinnerung_gesendet && now >= losfahrenUm && minutesUntil > 5) {
      const minBisLos = Math.max(5, Math.round((terminTime.getTime() - now.getTime()) / 60000 - (fahrzeitMin ?? 30)))
      await sendCommunication('sv_tagesroute', {
        telefon: svProfile.telefon,
        vorname: svName,
        '1': String(minBisLos),
        '2': terminTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        '3': kundeName,
        '4': addr,
        '5': String(fahrzeitMin ?? 30),
        '6': mapsLink,
      })
      await svc.from('faelle').update({ losfahren_erinnerung_gesendet: true }).eq('id', termin.id)
      sent++
    }

    // 5-MIN Erinnerung
    if (!termin.termin_erinnerung_5min_gesendet && minutesUntil <= 5 && minutesUntil >= -10) {
      await sendCommunication('sv_tagesroute', {
        telefon: svProfile.telefon,
        vorname: svName,
        '1': kundeName,
        '2': addr,
      })
      await svc.from('faelle').update({ termin_erinnerung_5min_gesendet: true }).eq('id', termin.id)
      sent++
    }
  }

  return NextResponse.json({ sent, checked: termine.length })
}
