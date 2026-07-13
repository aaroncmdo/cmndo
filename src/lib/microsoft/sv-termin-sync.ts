// SP5b: Thin-Wrapper — Outlook-Pendant zu google-calendar/sv-termin-sync +
// caldav/sv-termin-sync. Delegiert an die assignee-generische Engine (nur outlookProvider).
// Env-gated/dormant: skippt ohne MS-Token. fallId optional/ungenutzt (Kontext = Termin-bezug).
import {
  syncTerminToExternalCalendar,
  entferneTerminAusExternemKalender,
  outlookProvider,
} from '@/lib/termine/engine/kalender-sync'

/** Synct einen gutachter_termine-Eintrag in den Outlook-Kalender des SVs. Fail-soft. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Signatur-Kompat mit google/caldav-Wrapper
export async function syncSvTerminToOutlook(terminId: string, _fallId?: string): Promise<void> {
  await syncTerminToExternalCalendar(terminId, { providers: [outlookProvider] })
}

/** Loescht das Outlook-Event eines gutachter_termine-Eintrags. Fail-soft. */
export async function deleteSvTerminFromOutlook(terminId: string): Promise<void> {
  await entferneTerminAusExternemKalender(terminId, { providers: [outlookProvider] })
}
