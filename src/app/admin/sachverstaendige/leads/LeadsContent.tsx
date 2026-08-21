// Aaron 07.07.: SV-Leads-Verwaltung in die Sachverstaendige-Sektion geholt.
// F2b: dieser Content ist jetzt kanonisch unter /admin/vertrieb/sachverstaendige/leads
// (Re-Export); /admin/sachverstaendige/leads ist ein 308-Redirect dorthin. Der fruehere
// Legacy-@drawer/(.)leads wurde entfernt (tot, da die Liste wegredirectet). Reused
// getSvLeads + SvLeadsClient (unveraendert; Actions/Types bleiben unter /admin/sv-leads).
//
// 21.08.2026: Der Filter kommt aus der URL, nicht aus dem Client-Zustand. Damit
// bleibt eine gefilterte Ansicht teilbar und ueber den Zurueck-Knopf erreichbar
// — und die Suche laeuft in der Datenbank statt im Browser. Bei 4.644 Leads ist
// das kein Feinschliff: alles zu laden und clientseitig zu filtern hiesse, 4.644
// Datensaetze mit Telefonnummern und Adressen in jeden Browser zu schicken.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSvLeads, zaehleSvLeads } from '@/app/admin/sv-leads/actions'
import SvLeadsClient from '@/app/admin/sv-leads/SvLeadsClient'
import { leseFilter } from '@/lib/sv-leads/liste-filter'

export const dynamic = 'force-dynamic'

export default async function SachverstaendigeLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const filter = leseFilter(await searchParams)
  const [seite, zaehlung] = await Promise.all([getSvLeads(filter), zaehleSvLeads()])

  return <SvLeadsClient seite={seite} filter={filter} zaehlung={zaehlung} />
}
