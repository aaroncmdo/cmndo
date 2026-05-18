import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'

export const dynamic = 'force-dynamic'

// ─── WhatsApp Template Builder ─────────────────────────────────────────────

function buildKundeMorgenMsg(vorname: string, datum: string, uhrzeit: string, adresse: string, svName: string): string {
  return `Guten Morgen ${vorname}! Heute findet die Besichtigung deines Fahrzeugs statt. Termin: ${datum} ${uhrzeit} bei ${adresse}. Sachverständiger: ${svName}. Bitte stelle sicher, dass das Fahrzeug zugänglich ist.`
}

function buildKunde1hMsg(uhrzeit: string, adresse: string, svName: string): string {
  return `In einer Stunde ist deine Besichtigung! ${uhrzeit} bei ${adresse}. ${svName} ist gleich vor Ort. Viele Grüße von Claimondo!`
}

function buildSvRouteMsg(
  svVorname: string, uhrzeit: string, minutenBisTermin: number,
  adresse: string, fahrzeitMin: number, startpunkt: string,
  kundeName: string, kundeTelefon: string,
): string {
  return `Hi ${svVorname}! Naechster Termin um ${uhrzeit} (in ${minutenBisTermin} min). Adresse: ${adresse}. Fahrtzeit ca. ${fahrzeitMin} min ab ${startpunkt}. Kunde: ${kundeName}, Tel: ${kundeTelefon}.`
}

// ─── Cron Handler ──────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const fiveMinLater = new Date(now.getTime() + 5 * 60 * 1000).toISOString()

  // Pending Reminder laden die jetzt oder in den nächsten 5min fällig sind
  const { data: reminders, error: remErr } = await supabase
    .from('termin_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('geplant_fuer', fiveMinLater)

  if (remErr) {
    console.error('[send-reminders] Query-Fehler:', remErr.message)
    return NextResponse.json({ error: remErr.message }, { status: 500 })
  }

  if (!reminders?.length) {
    return NextResponse.json({ sent: 0, failed: 0, cancelled: 0, skipped: 0 })
  }

  let sent = 0, failed = 0, cancelled = 0, skipped = 0

  for (const reminder of reminders) {
    try {
      // Termin frisch laden — Status-Check
      const { data: termin } = await supabase
        .from('gutachter_termine')
        .select('id, sv_id, fall_id, lead_id, start_zeit, end_zeit, status')
        .eq('id', reminder.termin_id)
        .single()

      if (!termin || !['reserviert', 'bestaetigt'].includes(termin.status)) {
        await supabase
          .from('termin_reminders')
          .update({ status: 'cancelled' })
          .eq('id', reminder.id)
        cancelled++
        continue
      }

      const startZeit = new Date(termin.start_zeit)
      const datumStr = startZeit.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
      const uhrzeitStr = startZeit.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

      // Fall-Daten laden (Adresse)
      // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
      const { data: fall } = await supabase
        .from('faelle')
        .select('besichtigungsort_adresse, claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort)')
        .eq('id', termin.fall_id)
        .single()
      const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims

      const adresse = fall?.besichtigungsort_adresse
        || [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ')
        || 'Adresse nicht hinterlegt'

      // SV-Daten laden
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('id, profile_id, standort_lat, standort_lng')
        .eq('id', termin.sv_id)
        .single()

      let svVorname = '', svNachname = '', svTelefon: string | null = null
      if (sv?.profile_id) {
        const { data: svProfile } = await supabase
          .from('profiles')
          .select('vorname, nachname, telefon')
          .eq('id', sv.profile_id)
          .single()
        if (svProfile) {
          svVorname = svProfile.vorname || ''
          svNachname = svProfile.nachname || ''
          svTelefon = svProfile.telefon
        }
      }
      const svName = [svVorname, svNachname].filter(Boolean).join(' ') || 'Sachverständiger'

      // Kunde-Daten laden
      let kundeVorname = '', kundeNachname = '', kundeTelefon: string | null = null
      if (termin.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('vorname, nachname, telefon')
          .eq('id', termin.lead_id)
          .single()
        if (lead) {
          kundeVorname = lead.vorname || ''
          kundeNachname = lead.nachname || ''
          kundeTelefon = lead.telefon
        }
      }
      const kundeName = [kundeVorname, kundeNachname].filter(Boolean).join(' ') || 'Kunde'

      // Empfänger-Telefonnummer bestimmen
      let telefon: string | null = null
      if (reminder.empfaenger === 'kunde') {
        telefon = kundeTelefon
      } else {
        telefon = svTelefon
      }

      if (!telefon) {
        await supabase
          .from('termin_reminders')
          .update({ status: 'failed', fehler: 'Keine Telefonnummer' })
          .eq('id', reminder.id)
        failed++

        // Admin-Benachrichtigung
        await notifyAdmins(supabase, `Reminder fehlgeschlagen (${reminder.reminder_typ}): Keine Telefonnummer fuer ${reminder.empfaenger === 'kunde' ? kundeName : svName}. Termin ${termin.id}`)
        continue
      }

      // Nachricht bauen
      let message: string
      if (reminder.reminder_typ === 'kunde_morgen') {
        message = buildKundeMorgenMsg(kundeVorname || 'Kunde', datumStr, uhrzeitStr, adresse, svName)
      } else if (reminder.reminder_typ === 'kunde_1h') {
        message = buildKunde1hMsg(uhrzeitStr, adresse, svName)
      } else {
        // sv_route
        const minutenBis = Math.max(0, Math.round((startZeit.getTime() - now.getTime()) / 60_000))
        const geplantFuer = new Date(reminder.geplant_fuer)
        const fahrzeitMinApprox = Math.max(1, Math.round((startZeit.getTime() - geplantFuer.getTime()) / 60_000 - 10))

        // Startpunkt ermitteln (vorheriger Termin oder Büro)
        let startpunkt = 'Buero'
        const berlinDateStr = startZeit.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
        const { data: vorig } = await supabase
          .from('gutachter_termine')
          .select('id, fall_id')
          .eq('sv_id', termin.sv_id)
          .neq('id', termin.id)
          .in('status', ['reserviert', 'bestaetigt'])
          .gte('start_zeit', `${berlinDateStr}T00:00:00Z`)
          .lte('start_zeit', `${berlinDateStr}T23:59:59Z`)
          .lt('start_zeit', termin.start_zeit)
          .order('start_zeit', { ascending: false })
          .limit(1)

        if (vorig?.[0]) {
          // CMM-44 SP-A2 (Cluster 1): schadenort_adresse aus claims (SSoT).
          const { data: vorigFall } = await supabase
            .from('faelle')
            .select('besichtigungsort_adresse, claims:claim_id(schadenort_adresse)')
            .eq('id', vorig[0].fall_id)
            .single()
          const vorigClaim = Array.isArray(vorigFall?.claims) ? vorigFall.claims[0] : vorigFall?.claims
          startpunkt = vorigFall?.besichtigungsort_adresse || vorigClaim?.schadenort_adresse || 'vorheriger Termin'
        }

        message = buildSvRouteMsg(
          svVorname || 'SV', uhrzeitStr, minutenBis,
          adresse, fahrzeitMinApprox, startpunkt,
          kundeName, kundeTelefon || 'nicht hinterlegt',
        )
      }

      // WhatsApp senden
      const triggerName = reminder.reminder_typ === 'kunde_morgen' ? 'reminder_24h'
        : reminder.reminder_typ === 'kunde_1h' ? 'reminder_2h'
        : 'sv_tagesroute'
      await sendCommunication(triggerName, {
        telefon,
        vorname: reminder.empfaenger === 'kunde' ? kundeVorname : svVorname,
        '1': message,
      })
      const result = { success: true, error: undefined as string | undefined }

      if (result.success) {
        await supabase
          .from('termin_reminders')
          .update({ status: 'sent', versendet_am: new Date().toISOString() })
          .eq('id', reminder.id)
        sent++
      } else {
        const versuche = (reminder.versuche || 0) + 1
        const newStatus = versuche >= 5 ? 'failed' : 'pending'

        await supabase
          .from('termin_reminders')
          .update({ versuche, fehler: result.error || 'Unbekannter Fehler', status: newStatus })
          .eq('id', reminder.id)

        if (newStatus === 'failed') {
          failed++
          await notifyAdmins(supabase, `Reminder endgueltig fehlgeschlagen nach 5 Versuchen (${reminder.reminder_typ}): ${result.error}. Termin ${termin.id}, Empfaenger: ${telefon}`)
        } else {
          skipped++ // wird beim nächsten Cron-Lauf erneut versucht
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      console.error(`[send-reminders] Fehler bei Reminder ${reminder.id}:`, msg)

      const versuche = (reminder.versuche || 0) + 1
      await supabase
        .from('termin_reminders')
        .update({ versuche, fehler: msg, status: versuche >= 5 ? 'failed' : 'pending' })
        .eq('id', reminder.id)

      if (versuche >= 5) failed++
      else skipped++
    }
  }

  console.log(`[send-reminders] sent=${sent} failed=${failed} cancelled=${cancelled} skipped=${skipped}`)
  return NextResponse.json({ sent, failed, cancelled, skipped })
}

// ─── Admin Notification ────────────────────────────────────────────────────

async function notifyAdmins(supabase: ReturnType<typeof createAdminClient>, message: string) {
  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('telefon')
      .eq('rolle', 'admin')

    for (const admin of admins ?? []) {
      if (admin.telefon) {
        await sendCommunication('admin_backup_failed', {
          telefon: admin.telefon,
          '1': message,
        })
      }
    }
  } catch (err) {
    console.error('[send-reminders] Admin-Benachrichtigung fehlgeschlagen:', err)
  }
}
