import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNachricht } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'

/**
 * Kunden-Morgen-Erinnerung — läuft täglich 07:00 Berliner Zeit (05:00 UTC Sommer).
 *
 * Sendet eine WA an alle Kunden mit einem bestätigten Termin HEUTE:
 * "Heute ist dein Gutachtertermin um X Uhr — Fahrzeug bereitstellen."
 *
 * Dedup via erinnerung_morgen_gesendet-Flag auf gutachter_termine.
 * Baileys-first via sendNachricht (entity=lead), Twilio-Fallback automatisch.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  // Heutigen Tag in Berliner Lokalzeit bestimmen
  const berlinFormatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = berlinFormatter.formatToParts(now)
  const day = parts.find(p => p.type === 'day')?.value ?? ''
  const month = parts.find(p => p.type === 'month')?.value ?? ''
  const year = parts.find(p => p.type === 'year')?.value ?? ''
  // UTC-Fenster für "heute in Berlin" — großzügig (UTC-1h bis UTC+26h deckt jeden TZ-Fall)
  const tagesStart = new Date(`${year}-${month}-${day}T00:00:00+02:00`).toISOString()
  const tagesEnde = new Date(`${year}-${month}-${day}T23:59:59+02:00`).toISOString()

  const { data: termine } = await db
    .from('gutachter_termine')
    .select(`
      id, fall_id, lead_id, start_zeit, erinnerung_morgen_gesendet,
      sachverstaendige (
        profiles!sachverstaendige_profile_id_fkey ( vorname, nachname )
      )
    `)
    .gte('start_zeit', tagesStart)
    .lte('start_zeit', tagesEnde)
    .eq('status', 'bestaetigt')
    .eq('erinnerung_morgen_gesendet', false)

  if (!termine?.length) {
    return NextResponse.json({ ok: true, sent: 0, checked: 0 })
  }

  let sent = 0
  let skipped = 0

  for (const termin of termine) {
    const fallId = termin.fall_id as string | null
    const leadId = termin.lead_id as string | null

    // Kunden-Kontakt laden — erst Lead, dann Fall
    let kundeVorname = ''
    let kundeTelefon: string | null = null
    let kundeEntityId: string | null = null

    if (leadId) {
      const { data: lead } = await db
        .from('leads')
        .select('vorname, telefon')
        .eq('id', leadId)
        .maybeSingle()
      if (lead) {
        kundeVorname = lead.vorname ?? ''
        kundeTelefon = lead.telefon
        kundeEntityId = leadId
      }
    }

    if (!kundeTelefon && fallId) {
      const { data: fall } = await db
        .from('faelle')
        .select('lead_id, kunde_id')
        .eq('id', fallId)
        .maybeSingle()
      if (fall?.lead_id && fall.lead_id !== leadId) {
        const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).maybeSingle()
        if (lead) { kundeVorname = lead.vorname ?? ''; kundeTelefon = lead.telefon; kundeEntityId = fall.lead_id }
      }
    }

    if (!kundeTelefon || !kundeEntityId) {
      skipped++
      // Flag trotzdem setzen damit wir nicht ewig wiederholen
      await db.from('gutachter_termine').update({ erinnerung_morgen_gesendet: true }).eq('id', termin.id)
      continue
    }

    // SV-Name aus der Relation holen
    const svRel = termin.sachverstaendige as unknown as { profiles: { vorname: string | null; nachname: string | null } | null } | null
    const svProfile = Array.isArray(svRel) ? (svRel as { profiles: { vorname: string | null; nachname: string | null } | null }[])[0]?.profiles : svRel?.profiles
    const svName = [svProfile?.vorname, svProfile?.nachname].filter(Boolean).join(' ') || 'Ihrem Gutachter'

    // Termin-Uhrzeit in Berliner Zeit
    const terminZeit = new Date(termin.start_zeit as string)
    const uhrzeit = terminZeit.toLocaleTimeString('de-DE', {
      timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
    })

    // Adresse — aus Fall wenn vorhanden
    let adresse = ''
    if (fallId) {
      const { data: fallAddr } = await db
        .from('faelle')
        .select('schadens_adresse, schadens_plz, schadens_ort')
        .eq('id', fallId)
        .maybeSingle()
      adresse = [fallAddr?.schadens_adresse, fallAddr?.schadens_plz, fallAddr?.schadens_ort]
        .filter(Boolean).join(', ')
    }

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
    const portalLink = fallId ? `${appUrl}/kunde/faelle/${fallId}` : `${appUrl}/kunde`

    const text = [
      `Hallo ${kundeVorname || 'Kunde'}, heute ist dein Gutachtertermin! 🚗`,
      '',
      `Uhrzeit: ${uhrzeit} Uhr`,
      `Gutachter: ${svName}`,
      adresse ? `Adresse: ${adresse}` : null,
      '',
      `Bitte halte dein Fahrzeug bereit und stelle sicher, dass es zugänglich ist.`,
      `Bei Rückfragen: ${portalLink}`,
    ].filter((l) => l !== null).join('\n')

    await sendNachricht({
      entity: 'lead',
      entityId: kundeEntityId,
      phone: kundeTelefon,
      text,
      fallId: fallId ?? null,
      templateKey: 'termin_morgen_erinnerung',
      empfaengerRolle: 'kunde',
    })

    await db
      .from('gutachter_termine')
      .update({ erinnerung_morgen_gesendet: true })
      .eq('id', termin.id)

    sent++
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    checked: termine.length,
    checked_at: now.toISOString(),
  })
}
