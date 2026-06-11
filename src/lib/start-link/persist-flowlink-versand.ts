import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * AAR-956 P2: persistiert den FlowLink-Versand-State auf flow_links nach
 * erfolgreichem Send. gesendet_am/-kanal aktualisieren, gesendet_anzahl +1.
 * Geteilt von issueCanonicalFlowLinkForAnfrage (Initial-Send) + dem Dispatcher-
 * Manual-(Re-)Send — eine Quelle fuer den Versand-State. Read-modify-write fuers
 * anzahl-Increment: Sends auf EINEN Link sind nicht nebenlaeufig (1 Lead = 1 Link),
 * der Race ist vernachlaessigbar.
 */
export async function persistFlowLinkVersand(
  admin: SupabaseClient,
  token: string,
  kanal: 'whatsapp' | 'sms' | 'email',
): Promise<void> {
  const { data: fl } = await admin
    .from('flow_links')
    .select('gesendet_anzahl')
    .eq('token', token)
    .maybeSingle()
  await admin
    .from('flow_links')
    .update({
      gesendet_am: new Date().toISOString(),
      gesendet_kanal: kanal,
      gesendet_anzahl: ((fl?.gesendet_anzahl as number | null) ?? 0) + 1,
    })
    .eq('token', token)
}
