import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import KalenderEinstellungenClient from './KalenderEinstellungenClient'

// AAR-717: Settings-Page für die Kalender-Verbindungen im SV-Portal.
// Nutzbar nach abgeschlossenem Onboarding — der Willkommen-Wizard leitet
// sowieso ins Dashboard um sobald alle Onboarding-Gates durch sind, und
// dann braucht's eine dedizierte Stelle zum Nachträglich-Verbinden oder
// zum Wechseln des Providers.

export const dynamic = 'force-dynamic'

export default async function KalenderEinstellungenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    gcal_connected: boolean | null
  }>(supabase, user.id, 'id, gcal_connected')
  if (!sv) redirect('/gutachter/willkommen')

  // AAR-717: Google-Email steht auf profiles (google_email aus OAuth-
  // Callback-Flow AAR-242), nicht auf sachverstaendige.
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: caldavRow } = await supabase
    .from('sv_kalender_verbindungen')
    .select('id, provider_label, username, calendar_display_name, connected_at, last_sync_at, last_error, last_error_at')
    .eq('sv_id', sv.id)
    .eq('provider', 'caldav')
    .maybeSingle()

  return (
    <KalenderEinstellungenClient
      svId={sv.id}
      googleConnected={!!sv.gcal_connected}
      googleEmail={(profile?.google_email as string | null) ?? null}
      caldav={
        caldavRow
          ? {
              id: caldavRow.id as string,
              providerLabel: (caldavRow.provider_label as string | null) ?? 'CalDAV',
              username: caldavRow.username as string,
              calendarDisplayName: caldavRow.calendar_display_name as string | null,
              connectedAt: caldavRow.connected_at as string,
              lastSyncAt: caldavRow.last_sync_at as string | null,
              lastError: caldavRow.last_error as string | null,
              lastErrorAt: caldavRow.last_error_at as string | null,
            }
          : null
      }
    />
  )
}
