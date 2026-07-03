// SP2c: KB-Termin-Sync-Wrapper. Delegiert an die assignee-generische Engine
// (syncTerminToExternalCalendar / entferneTerminAusExternemKalender), waehlt Provider
// Meet-bewusst und ist fail-soft.
//
// Meet-Bewusstsein: bookKbTermin(video) erzeugt selbst ein Google-Meet-Event auf dem
// persoenlichen primary-Kalender des KB (conferenceData + Teilnehmer). Der Engine-
// googleProvider schreibt denselben Kalender; ein events.update ohne attendees wuerde
// die Teilnehmer strippen. Darum: liegt ein Meet-Video-Event vor (video_link =
// meet.google...), synct der Wrapper nur CalDAV und laesst Google dem Meet-Pfad.
// Fail-soft: ein Sync-Fehler darf den (teils kunde-/flow-facing) Termin-Write nie brechen.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  syncTerminToExternalCalendar,
  entferneTerminAusExternemKalender,
  caldavProvider,
} from './engine/kalender-sync'

/** true = Google-Meet-Link (Google gehoert dem Meet-Pfad). Jitsi/null/leer = false. Pure. */
export function istMeetVideo(videoLink: string | null | undefined): boolean {
  return !!videoLink && videoLink.includes('meet.google')
}

/** OUT-Sync eines KB-Termins. Meet-Video -> nur CalDAV; sonst beide Provider. Fail-soft. */
export async function syncKbTerminOut(terminId: string): Promise<void> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('gutachter_termine')
      .select('video_link')
      .eq('id', terminId)
      .maybeSingle()
    const meet = istMeetVideo((data?.video_link as string | null) ?? null)
    await syncTerminToExternalCalendar(terminId, meet ? { providers: [caldavProvider] } : undefined)
  } catch (err) {
    console.error('[kb-termin-sync] OUT fehlgeschlagen fuer', terminId, err instanceof Error ? err.message : err)
  }
}

/** Entfernt einen KB-Termin aus Google + CalDAV (Storno/Absage/Verschiebung). Fail-soft. */
export async function entferneKbTerminOut(terminId: string): Promise<void> {
  try {
    await entferneTerminAusExternemKalender(terminId)
  } catch (err) {
    console.error('[kb-termin-sync] REMOVE fehlgeschlagen fuer', terminId, err instanceof Error ? err.message : err)
  }
}
