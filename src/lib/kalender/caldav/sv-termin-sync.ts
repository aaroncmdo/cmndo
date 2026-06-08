// AAR-716 / P2.5 Phase-3-Repoint (Termin-Engine-Unifikation):
// Thin-Wrapper — Spiegel von src/lib/google-calendar/sv-termin-sync.ts. Die SV-
// CalDAV-Kalender-Sync-Logik lebt jetzt in der assignee-generischen Engine-Op
// `syncTerminToExternalCalendar` (caldavProvider), faelle-frei via
// resolveTerminKontext. Das auth_failed-Handling (Verbindung mit last_error
// markieren, damit der SV im Profil "App-Passwort pruefen" sieht) ist in den
// caldavProvider portiert → Parity mit dem alten Pfad. Signatur unveraendert,
// fallId optional/ungenutzt (Kontext = Termin-bezug/claim_id).

import {
  syncTerminToExternalCalendar,
  entferneTerminAusExternemKalender,
  caldavProvider,
} from '@/lib/termine/engine/kalender-sync'

/**
 * Synct einen gutachter_termine-Eintrag in den CalDAV-Kalender des SVs.
 * Delegiert an die Engine-Op (nur CalDAV-Provider). Fail-soft (wirft nicht).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Signatur-Kompat: Consumer rufen (terminId, fallId); Kontext kommt jetzt aus dem Termin-bezug
export async function syncSvTerminToCalDav(terminId: string, _fallId?: string): Promise<void> {
  await syncTerminToExternalCalendar(terminId, { providers: [caldavProvider] })
}

/**
 * Loescht das CalDAV-Event eines gutachter_termine-Eintrags
 * (Storno / Ablehnung / Verlegung-Quelle). Delegiert an die Engine-Op. Fail-soft.
 */
export async function deleteSvTerminFromCalDav(terminId: string): Promise<void> {
  await entferneTerminAusExternemKalender(terminId, { providers: [caldavProvider] })
}
