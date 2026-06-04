'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { bestaetige } from '@/lib/termine/engine'
import { resolveTerminLeadId } from '@/lib/termine/resolve-lead-id'

/**
 * KFZ-192: Termin bestätigen.
 * Phase-3-Repoint: Status-Transition + **Geocoding-Garantie** + CMM-73-Auftrag + Timeline
 * laufen jetzt über die Engine (`bestaetige`). Hier bleiben nur die Notifications, die
 * `bestaetige` NICHT macht: SLA-Abschluss + WhatsApp T4 (Kunde) + Email S-E6 (SV).
 *
 * Geocoding-Garantie: ein Vor-Ort-Termin ohne auflösbares Ziel wird NICHT bestätigt
 * (`bestaetige` → code 'kein_ziel'); dann auch kein Notify. Remote (video/telefon) ausgenommen.
 * Signatur bleibt void (alle Caller ignorieren den Rückgabewert) — Fehler werden geloggt;
 * das UI-Surfacing von 'kein_ziel' ist ein bewusster Folge-Schritt.
 */
export async function bestaetigeTermin(terminId: string) {
  const db = createAdminClient()

  // 1. Engine: status='bestaetigt' + final_verbindlich_ab + Geocoding-Garantie + CMM-73-Auftrag + Timeline.
  const res = await bestaetige(terminId, { db })
  if (!res.ok) {
    console.error(`[bestaetigeTermin] bestaetige fehlgeschlagen (${res.code}): ${res.error}`)
    return
  }

  // 2. Termin + Fall für Benachrichtigungen laden (besichtigungsort_adresse ist jetzt von bestaetige gecacht).
  const { data: termin, error: terminErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, lead_id, sv_id, start_zeit, besichtigungsort_adresse')
    .eq('id', terminId)
    .single()
  if (terminErr || !termin || !termin.fall_id) return

  // AAR-85: SLA termin_bestaetigung abschliessen (macht bestaetige NICHT).
  try {
    const { completeSla } = await import('@/lib/sla/tracker')
    await completeSla(termin.fall_id, 'termin_bestaetigung')
  } catch (err) { console.error('[AAR-85] completeSla termin_bestaetigung:', err) }

  // 3. WhatsApp T4 an Kunden + Email S-E6 an SV (non-critical) — macht bestaetige NICHT.
  try {
    // CMM-49: lead_id faelle-frei aufloesen (termin.lead_id -> claims.lead_id), value-preserving.
    const leadId = await resolveTerminLeadId(db, termin)
    const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const uhrzeit = new Date(termin.start_zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

    // WhatsApp T4 an Kunden
    if (leadId) {
      const { data: lead } = await db.from('leads').select('telefon, vorname').eq('id', leadId).single()
      if (lead?.telefon) {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('termin_bestaetigt', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? 'Kunde',
          '1': lead.vorname ?? 'Kunde',
          '2': datum,
          '3': uhrzeit,
          '4': (termin.besichtigungsort_adresse as string | null) ?? '—',
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
              adresse: (termin.besichtigungsort_adresse as string | null) ?? '—',
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
