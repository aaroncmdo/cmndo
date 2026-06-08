// AAR-716 / P2.5 Phase-3-Repoint (Termin-Engine-Unifikation):
// Diese Datei ist seit der Engine-Unifikation ein Thin-Wrapper. Die eigentliche
// SV-Google-Kalender-Sync-Logik lebt jetzt in der assignee-generischen Engine-Op
// `syncTerminToExternalCalendar` (src/lib/termine/engine/kalender-sync.ts) — EINE
// Implementierung fuer Google + CalDAV, faelle-frei: der Event-Kontext kommt aus
// `resolveTerminKontext` (Termin-bezug / claim_id) statt aus dem alten
// getFallContext/`from('faelle')`-Reader. Die Signatur bleibt unveraendert, damit
// die Consumer (Dispatch-Gegenvorschlag, SV-Kalender-Eigeneintrag, Kunde-Re-Termin,
// resync-Script) die Engine transparent erben — kein Doppel-Send, kein Caller-Change.
//
// Der `fallId`-Parameter wird nicht mehr gebraucht (Kontext = Termin-bezug/claim_id),
// bleibt aber als optionaler 2. Parameter fuer Signatur-Kompatibilitaet erhalten.

import {
  syncTerminToExternalCalendar,
  entferneTerminAusExternemKalender,
  googleProvider,
} from '@/lib/termine/engine/kalender-sync'

/**
 * Synct einen gutachter_termine-Eintrag mit dem Google-Kalender des SVs.
 * Delegiert an die Engine-Op (nur Google-Provider). Fail-soft (wirft nicht).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Signatur-Kompat: Consumer rufen (terminId, fallId); Kontext kommt jetzt aus dem Termin-bezug
export async function syncSvTerminToGoogle(terminId: string, _fallId?: string): Promise<void> {
  await syncTerminToExternalCalendar(terminId, { providers: [googleProvider] })
}

/**
 * Loescht den Google-Calendar-Event eines gutachter_termine-Eintrags
 * (Storno / Ablehnung / Verlegung-Quelle). Delegiert an die Engine-Op. Fail-soft.
 */
export async function deleteSvTerminFromGoogle(terminId: string): Promise<void> {
  await entferneTerminAusExternemKalender(terminId, { providers: [googleProvider] })
}
