'use server'

// AAR-872: Server-Action fuer das „Stop hinzufuegen"-Sheet auf der Heute-
// Page. Liefert heutige private Events des SV aus GCal + CalDAV. Filter:
// Events, die bereits zu einem `gutachter_termine` matchen (Start innerhalb
// von 5 min Toleranz), werden mit `bereitsTermin: true` markiert — Caller
// rendert sie ausgegraut, damit der SV sie nicht versehentlich addet.

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import {
  listPrivateEventsForDate,
  type PrivateCalendarEvent,
} from '@/lib/private-events/list-events-for-date'

export type PrivatEventEntry = PrivateCalendarEvent & {
  /** True wenn der Event zeitlich mit einem bestehenden gutachter_termin matcht. */
  bereitsTermin: boolean
}

const MATCH_TOLERANZ_MS = 5 * 60 * 1000

export async function listPrivateEventsToday(): Promise<PrivatEventEntry[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return []
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return []

  const todayIso = new Date().toISOString().slice(0, 10)
  const dayStart = new Date(`${todayIso}T00:00:00`).toISOString()
  const dayEnd = new Date(`${todayIso}T23:59:59`).toISOString()

  const [events, { data: termine }] = await Promise.all([
    listPrivateEventsForDate(user.id, todayIso),
    supabase
      .from('gutachter_termine')
      .select('start_zeit')
      .eq('sv_id', sv.id)
      .gte('start_zeit', dayStart)
      .lt('start_zeit', dayEnd),
  ])

  const terminTimes = ((termine ?? []) as Array<{ start_zeit: string }>).map(
    (t) => new Date(t.start_zeit).getTime(),
  )

  return events.map<PrivatEventEntry>((e) => {
    const evMs = new Date(e.start_zeit).getTime()
    const bereitsTermin = terminTimes.some(
      (t) => Math.abs(t - evMs) <= MATCH_TOLERANZ_MS,
    )
    return { ...e, bereitsTermin }
  })
}
