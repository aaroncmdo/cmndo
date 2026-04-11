'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-192: Termin bestätigen — setzt status='bestaetigt' + final_verbindlich_ab (24h ab jetzt).
 * Erstellt Timeline-Eintrag und sendet WhatsApp T4 an Kunden (non-critical).
 */
export async function bestaetigeTermin(terminId: string) {
  const db = createAdminClient()

  // 1. Update termin status + final_verbindlich_ab
  const finalVerbindlichAb = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { error: updateErr } = await db
    .from('gutachter_termine')
    .update({
      status: 'bestaetigt',
      final_verbindlich_ab: finalVerbindlichAb,
    })
    .eq('id', terminId)

  if (updateErr) throw new Error(`Termin-Update fehlgeschlagen: ${updateErr.message}`)

  // 2. Termin + Fall für Benachrichtigungen laden
  const { data: termin, error: terminErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit')
    .eq('id', terminId)
    .single()

  if (terminErr || !termin) return

  // 3. Timeline-Eintrag
  const { error: tlErr } = await db.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'Termin bestätigt',
    beschreibung: `Termin am ${new Date(termin.start_zeit).toLocaleDateString('de-DE')} wurde bestätigt. Verbindlich ab: ${new Date(finalVerbindlichAb).toLocaleString('de-DE')}.`,
  })

  if (tlErr) console.error('[bestaetigeTermin] Timeline-Insert:', tlErr.message)

  // 4. WhatsApp T4 an Kunden + Email S-E6 an SV (non-critical)
  try {
    const { data: fall } = await db.from('faelle').select('lead_id, besichtigungsort_adresse').eq('id', termin.fall_id).single()
    const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const uhrzeit = new Date(termin.start_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

    // WhatsApp T4 an Kunden
    if (fall?.lead_id) {
      const { data: lead } = await db.from('leads').select('telefon, vorname').eq('id', fall.lead_id).single()
      if (lead?.telefon) {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('termin_bestaetigt', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? 'Kunde',
          '1': lead.vorname ?? 'Kunde',
          '2': datum,
          '3': uhrzeit,
          '4': fall?.besichtigungsort_adresse ?? '—',
        })
      }

      // Email S-E6 an SV
      if (termin.sv_id) {
        const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
        if (sv?.profile_id) {
          const { data: svProfile } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
          if (svProfile?.email) {
            const { sendCommunication } = await import('@/lib/communications/send')
            const { render } = await import('@react-email/render')
            const { SvTerminBestaetigungEmail, subject } = await import('@/lib/email/google/templates/SvTerminBestaetigung')
            const kundenName = lead ? `${lead.vorname ?? ''}`.trim() || 'Kunde' : 'Kunde'
            const props = {
              svVorname: svProfile.vorname ?? 'Partner',
              fallNummer: termin.fall_id.slice(0, 8),
              terminDatum: datum,
              terminUhrzeit: uhrzeit,
              kundenName,
              adresse: fall?.besichtigungsort_adresse ?? '—',
            }
            const html = await render(SvTerminBestaetigungEmail(props))
            await sendCommunication('sv_termin_bestaetigung', {
              email: svProfile.email,
              vorname: svProfile.vorname ?? 'Partner',
              subject: subject(props),
              html,
            })
          }
        }
      }
    }
  } catch { /* non-critical */ }
}
