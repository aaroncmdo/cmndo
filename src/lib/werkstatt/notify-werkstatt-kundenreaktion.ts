// In-App-Notification Kunde -> Werkstatt: der Kunde hat einen Werkstatt-Vorschlag
// angenommen (bestaetigt) oder um Rueckruf gebeten (rueckruf_erbeten). Loest die
// werkstatt.user_id via Service-Role auf (Kunde-/Action-Kontext kann werkstaetten
// je nach RLS nicht lesen). Non-fatal by design.
import { createNotification } from '@/lib/notifications'
import type { SupabaseClient } from '@supabase/supabase-js'

export type WerkstattReaktionEreignis = 'bestaetigt' | 'rueckruf_erbeten' | 'kva_abgelehnt'
export type NotifyWerkstattDeps = { createNotification: typeof createNotification }
const defaultDeps: NotifyWerkstattDeps = { createNotification }

const BERLIN = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
})

export async function notifyWerkstattKundenreaktion(
  args: { werkstattId: string; ereignis: WerkstattReaktionEreignis; rueckrufWunschzeit?: string | null; grund?: string | null; svc: SupabaseClient },
  deps: NotifyWerkstattDeps = defaultDeps,
): Promise<{ inApp: boolean }> {
  const { data: w } = await args.svc.from('werkstaetten').select('user_id').eq('id', args.werkstattId).maybeSingle()
  const userId = (w as { user_id: string | null } | null)?.user_id
  if (!userId) return { inApp: false }

  const { titel, text } =
    args.ereignis === 'bestaetigt'
      ? { titel: 'Termin vom Kunden bestätigt', text: 'Der Kunde hat Ihren Terminvorschlag bestätigt.' }
      : args.ereignis === 'kva_abgelehnt'
        ? {
            titel: 'Kostenvoranschlag abgelehnt',
            text: args.grund
              ? `Der Kunde hat Ihren Kostenvoranschlag abgelehnt: ${args.grund}`
              : 'Der Kunde hat Ihren Kostenvoranschlag abgelehnt — bitte überarbeiten.',
          }
        : {
            titel: 'Kunde bittet um Rückruf',
            text: args.rueckrufWunschzeit
              ? `Der Kunde möchte zurückgerufen werden (Wunschzeit: ${BERLIN.format(new Date(args.rueckrufWunschzeit))} Uhr).`
              : 'Der Kunde möchte den Reparaturtermin telefonisch klären.',
          }

  try {
    await deps.createNotification(userId, 'reparatur_termin', titel, text, '/werkstatt/auftraege')
    return { inApp: true }
  } catch (err) {
    console.warn('[notifyWerkstattKundenreaktion] In-App fehlgeschlagen (non-fatal):', err)
    return { inApp: false }
  }
}
