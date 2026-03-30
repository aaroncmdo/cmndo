import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendStatusWhatsApp } from '@/lib/whatsapp'

/**
 * Cron-Route: Termin-Erinnerungen (stuendlich)
 * - 24h vorher: WhatsApp an Kunden
 * - 2h vorher: WhatsApp an Kunden
 * - 48h vorher: Pflichtdokumente-Check, Erinnerung wenn Docs fehlen
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  let sent24h = 0
  let sent2h = 0
  let sent48hDocs = 0

  // ─── 48h Pflichtdokumente-Check ────────────────────────────────────────
  const in47h = new Date(now.getTime() + 47 * 60 * 60 * 1000).toISOString()
  const in49h = new Date(now.getTime() + 49 * 60 * 60 * 1000).toISOString()

  const { data: termine48h } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit')
    .gte('start_zeit', in47h)
    .lte('start_zeit', in49h)
    .eq('status', 'bestaetigt')
    .eq('erinnerung_48h_docs_gesendet', false)

  for (const termin of termine48h ?? []) {
    if (!termin.fall_id) continue

    // Check for missing Pflichtdokumente
    const { data: fehlend } = await supabase
      .from('pflichtdokumente')
      .select('id, dokument_typ')
      .eq('fall_id', termin.fall_id)
      .eq('pflicht', true)
      .eq('status', 'ausstehend')

    if (fehlend && fehlend.length > 0) {
      const dokListe = fehlend.map(d => d.dokument_typ).join(', ')

      // Load fall context for WhatsApp
      const { data: fall } = await supabase
        .from('faelle')
        .select('id, fall_nummer, lead_id, kunde_id')
        .eq('id', termin.fall_id)
        .single()

      if (fall) {
        let vorname = ''
        let nachname = ''

        if (fall.lead_id) {
          const { data: lead } = await supabase
            .from('leads')
            .select('vorname, nachname')
            .eq('id', fall.lead_id)
            .single()
          if (lead) { vorname = lead.vorname ?? ''; nachname = lead.nachname ?? '' }
        }

        if (!vorname && fall.kunde_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('vorname, nachname')
            .eq('id', fall.kunde_id)
            .single()
          if (profile) { vorname = profile.vorname ?? ''; nachname = profile.nachname ?? '' }
        }

        const name = [vorname, nachname].filter(Boolean).join(' ') || 'Kunde'
        const nachricht = `Hallo ${name}, Ihr Gutachtertermin ist in weniger als 48 Stunden. Bitte laden Sie noch folgende Dokumente hoch: ${dokListe}. Sie koennen diese ueber Ihr Kundenportal hochladen.`

        await supabase.from('nachrichten').insert({
          fall_id: termin.fall_id,
          kanal: 'whatsapp',
          sender_id: null,
          sender_rolle: 'system',
          nachricht,
          hat_anhang: false,
        })

        await supabase.from('timeline').insert({
          fall_id: termin.fall_id,
          typ: 'whatsapp',
          titel: 'WhatsApp: Fehlende Dokumente (48h vor Termin)',
          beschreibung: `${fehlend.length} Pflichtdokument(e) ausstehend: ${dokListe}`,
        })
      }
    }

    await supabase
      .from('gutachter_termine')
      .update({ erinnerung_48h_docs_gesendet: true })
      .eq('id', termin.id)

    sent48hDocs++
  }

  // ─── 24h Erinnerung ────────────────────────────────────────────────────
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  const { data: termine24h } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit')
    .gte('start_zeit', in23h)
    .lte('start_zeit', in25h)
    .eq('status', 'bestaetigt')
    .eq('erinnerung_24h_gesendet', false)

  for (const termin of termine24h ?? []) {
    if (!termin.fall_id) continue

    const startZeit = new Date(termin.start_zeit)
    await sendStatusWhatsApp(termin.fall_id, 'erinnerung_24h', {
      termin_uhrzeit: startZeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    })

    await supabase
      .from('gutachter_termine')
      .update({ erinnerung_24h_gesendet: true })
      .eq('id', termin.id)

    sent24h++
  }

  // ─── 2h Erinnerung ─────────────────────────────────────────────────────
  const in90min = new Date(now.getTime() + 90 * 60 * 1000).toISOString()
  const in150min = new Date(now.getTime() + 150 * 60 * 1000).toISOString()

  const { data: termine2h } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit')
    .gte('start_zeit', in90min)
    .lte('start_zeit', in150min)
    .eq('status', 'bestaetigt')
    .eq('erinnerung_2h_gesendet', false)

  for (const termin of termine2h ?? []) {
    if (!termin.fall_id) continue

    await sendStatusWhatsApp(termin.fall_id, 'erinnerung_2h')

    await supabase
      .from('gutachter_termine')
      .update({ erinnerung_2h_gesendet: true })
      .eq('id', termin.id)

    sent2h++
  }

  return NextResponse.json({
    ok: true,
    sent_48h_docs: sent48hDocs,
    sent_24h: sent24h,
    sent_2h: sent2h,
    checked_at: now.toISOString(),
  })
}
