import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { sendCommunication } from '@/lib/communications/send'
import { triggerSV02 } from '@/lib/gutachterTasking'

export async function GET(req: NextRequest) {
  // CRON_SECRET check
  if (!assertCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  // KANONISCH (2026-07-07 Phase 1b): heutige SV-Termine direkt aus gutachter_termine (assignee_id) —
  // NICHT aus der stale v_faelle_mit_aktuellem_termin. Die View ist DEFINER-row-gated (service-role
  // 0 Zeilen, MCP-verifiziert) UND ihr sv_termin ist claim-scoped (claim_id meist NULL) -> die
  // Losfahren-/5-Min-Erinnerungen feuerten faktisch nie. start_zeit, besichtigungsort_adresse und die
  // Dedup-Flags (losfahren_erinnerung_gesendet/termin_erinnerung_5min_gesendet) liegen auf dem Termin.
  const { data: termine } = await svc
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, lead_id, assignee_id, start_zeit, status, besichtigungsort_adresse, losfahren_erinnerung_gesendet, termin_erinnerung_5min_gesendet')
    .eq('assignee_typ', 'sachverstaendiger')
    .not('assignee_id', 'is', null)
    .gte('start_zeit', todayStart)
    .lt('start_zeit', todayEnd)
    .not('status', 'in', '("abgeschlossen","storniert","abgelehnt")')

  if (!termine?.length) return NextResponse.json({ sent: 0 })

  // Enrichment (ungated Tabellen, service-role-sichtbar): schadenort aus claims als addr-Fallback
  // (die besichtigungsort_adresse auf dem Termin hat Vorrang).
  const claimIds = [...new Set(termine.map((t) => t.claim_id).filter(Boolean) as string[])]
  const schadenortMap = new Map<string, string>()
  if (claimIds.length) {
    const { data: claimsRows } = await svc
      .from('claims')
      .select('id, schadenort_adresse, schadenort_plz, schadenort_ort')
      .in('id', claimIds)
    for (const c of (claimsRows ?? []) as Array<{ id: string; schadenort_adresse: string | null; schadenort_plz: string | null; schadenort_ort: string | null }>) {
      schadenortMap.set(c.id, [c.schadenort_adresse, c.schadenort_plz, c.schadenort_ort].filter(Boolean).join(', '))
    }
  }

  let sent = 0

  for (const termin of termine) {
    const terminTime = new Date(termin.start_zeit)
    const minutesUntil = Math.round((terminTime.getTime() - now.getTime()) / 60000)

    // Get SV info (assignee_id = sachverstaendige.id)
    const { data: sv } = await svc.from('sachverstaendige').select('id, profile_id, standort_lat, standort_lng').eq('id', termin.assignee_id).single()
    if (!sv?.profile_id) continue

    const { data: svProfile } = await svc.from('profiles').select('vorname, nachname, telefon').eq('id', sv.profile_id).single()
    if (!svProfile?.telefon) continue
    const svName = [svProfile.vorname, svProfile.nachname].filter(Boolean).join(' ')

    // Get Kunde name (Termin traegt lead_id fuer Pre-FlowLink-/Lead-Termine)
    let kundeName = 'Kunde'
    if (termin.lead_id) {
      const { data: lead } = await svc.from('leads').select('vorname, nachname').eq('id', termin.lead_id).single()
      if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Kunde'
    }

    // Ziel-Adresse: besichtigungsort (auf dem Termin) hat Vorrang, sonst schadenort aus claims.
    const addr = (termin.besichtigungsort_adresse as string | null) ?? (termin.claim_id ? schadenortMap.get(termin.claim_id) ?? '' : '')
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`

    // geschaetzte_fahrzeit_min existiert nicht auf gutachter_termine -> Default 30min (wie bisher).
    const fahrzeitMin = 30
    const losfahrenUm = new Date(terminTime.getTime() - fahrzeitMin * 60000 - 15 * 60000) // fahrzeit + 15min puffer

    // LOSFAHREN Erinnerung
    if (!termin.losfahren_erinnerung_gesendet && now >= losfahrenUm && minutesUntil > 5) {
      const minBisLos = Math.max(5, Math.round((terminTime.getTime() - now.getTime()) / 60000 - fahrzeitMin))
      await sendCommunication('sv_tagesroute', {
        telefon: svProfile.telefon,
        vorname: svName,
        '1': String(minBisLos),
        '2': terminTime.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
        '3': kundeName,
        '4': addr,
        '5': String(fahrzeitMin),
        '6': mapsLink,
      })
      // Dedup-Flag direkt auf dem Termin (SSoT).
      // DEDUP-FLAG nach dem Versand. Bleibt es ungesetzt, schickt der naechste
      // Cron-Lauf dieselbe Losfahr-Erinnerung erneut an den SV.
      const { error: losfahrFlagFehler } = await svc
        .from('gutachter_termine')
        .update({ losfahren_erinnerung_gesendet: true })
        .eq('id', termin.id)
      if (losfahrFlagFehler) {
        console.error(`[gutachter-erinnerungen] Losfahr-Dedup-Flag nicht gesetzt (${termin.id}) — Doppel-Send moeglich:`, losfahrFlagFehler.message)
      }
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
      // DEDUP-FLAG, siehe oben. Das 5-Minuten-Fenster ist 15 Minuten breit
      // (minutesUntil <= 5 && >= -10) — ohne Flag trifft der Cron es mehrfach.
      const { error: min5FlagFehler } = await svc
        .from('gutachter_termine')
        .update({ termin_erinnerung_5min_gesendet: true })
        .eq('id', termin.id)
      if (min5FlagFehler) {
        console.error(`[gutachter-erinnerungen] 5min-Dedup-Flag nicht gesetzt (${termin.id}) — Doppel-Send moeglich:`, min5FlagFehler.message)
      }
      sent++
    }
  }

  // AAR-89: SV-02 Task triggern fuer bestaetigte SV-Termine <24h (kanonisch aus gutachter_termine
  // statt fall-status 'sv-termin' auf der stale View — ein bestaetigter Termin in 24h ist genau
  // der 'sv-termin'-Zustand, den die alte Abfrage meinte).
  let sv02Created = 0
  try {
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const { data: sv02Termine } = await svc
      .from('gutachter_termine')
      .select('id, fall_id, assignee_id, start_zeit')
      .eq('assignee_typ', 'sachverstaendiger')
      .eq('status', 'bestaetigt')
      .not('assignee_id', 'is', null)
      .not('fall_id', 'is', null)
      .gte('start_zeit', now.toISOString())
      .lte('start_zeit', in24h)

    for (const t of sv02Termine ?? []) {
      // Schon vorhandenen SV-02 Task? -> skip
      const { data: existing } = await svc.from('tasks')
        .select('id')
        .eq('fall_id', t.fall_id)
        .eq('task_code', 'SV-02')
        .limit(1)
        .maybeSingle()
      if (existing) continue

      const { data: svRec } = await svc.from('sachverstaendige').select('profile_id').eq('id', t.assignee_id).single()
      if (!svRec?.profile_id) continue
      try {
        await triggerSV02(t.fall_id as string, svRec.profile_id, new Date(t.start_zeit))
        sv02Created++
      } catch (err) { console.error('[AAR-89] triggerSV02:', err) }
    }
  } catch (err) { console.error('[AAR-89] SV-02 generation:', err) }

  return NextResponse.json({ sent, checked: termine.length, sv02Created })
}
