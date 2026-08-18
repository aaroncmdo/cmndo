import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

/**
 * Cron-Route: Termin-Pflichtdokumente-Check (stuendlich)
 * - 48h vorher: Pflichtdokumente-Check, Erinnerung wenn Docs fehlen
 *
 * Reminder-Konsolidierung (2026-07-03): Die 24h- + 2h-Kunden-WhatsApp-Reminder
 * wurden hier ENTFERNT — sie liefen doppelt zur queue-basierten send-reminders
 * (termin_reminders: kunde_24h/kunde_morgen/kunde_1h) mit divergentem Dedup.
 * send-reminders ist jetzt alleiniger Sender aller Kunden-/SV-Termin-Reminder;
 * diese Route macht nur noch den 48h-Pflichtdokumente-Check.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
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
      // CMM-49: lead_id + kunde_id faelle-frei via claims (resolveClaimId; kunde_id == geschaedigter_user_id).
      const claimId = termin.fall_id ? await resolveClaimId(supabase, termin.fall_id) : null
      const { data: claim } = claimId
        ? await supabase.from('claims').select('lead_id, geschaedigter_user_id').eq('id', claimId).maybeSingle()
        : { data: null }
      const fall = claim ? { lead_id: claim.lead_id, kunde_id: claim.geschaedigter_user_id } : null

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

    // DEDUP-FLAG nach dem Versand — ohne ihn mahnt der naechste Lauf erneut.
    const { error: docs48hFehler } = await supabase
      .from('gutachter_termine')
      .update({ erinnerung_48h_docs_gesendet: true })
      .eq('id', termin.id)
    if (docs48hFehler) {
      console.error(`[termin-erinnerungen] 48h-Docs-Flag nicht gesetzt (${termin.id}) — Doppel-Send moeglich:`, docs48hFehler.message)
    }

    sent48hDocs++
  }

  return NextResponse.json({
    ok: true,
    sent_48h_docs: sent48hDocs,
    checked_at: now.toISOString(),
  })
}
