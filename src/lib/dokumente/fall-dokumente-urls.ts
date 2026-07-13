'use server'

// Storage-RLS-Rest: signierte Download-URLs fuer fall_dokumente.
//
// Warum eine Server-Action und nicht getStorageUrl im Browser?
// Alle Doc-Buckets sind privat. `createSignedUrl` braucht SELECT auf dem
// Objekt — das hat der User-Client nicht (nur INSERT). Im Browser signiert
// er deshalb `null` und Download-Links rendern still nicht. Der Service-
// Client darf signieren, gehoert aber NIE in den Browser.
//
// SICHERHEITS-INVARIANTE (nicht aufweichen):
//   Der Row-Lookup laeuft auf dem USER-Client -> RLS bleibt das Autorisierungs-
//   Gate, inklusive aller Feinheiten (z.B. limitiert Migration 20260421151144
//   die Rolle `kanzlei` auf service_typ='komplett'). Der Admin-Client wird
//   AUSSCHLIESSLICH zum Signieren eines Pfades benutzt, den eine RLS-genehmigte
//   Query bereits herausgegeben hat. Wuerde man mit dem Admin-Client *abfragen*,
//   faellt genau diese Einschraenkung weg.
//
// Deshalb nimmt die Action auch eine fallId und KEINEN storage_path: ein Pfad
// vom Client waere eine user-manipulierbare Objekt-Referenz (OWASP A01/IDOR).
// Die fallId ist unkritisch — RLS prueft sie.

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { getStorageUrl, getStorageUrlBulk } from '@/lib/storage/url'

export type FallDokumentMitUrl = {
  id: string
  dokument_typ: string | null
  kategorie: string | null
  storage_path: string | null
  original_filename: string | null
  mime_type: string | null
  groesse_bytes: number | null
  hochgeladen_am: string | null
  beschreibung: string | null
  /** Signierte URL (TTL 1h) — null wenn kein storage_path oder Signing fehlschlaegt. */
  url: string | null
}

export type ListFallDokumenteResult =
  | { ok: true; dokumente: FallDokumentMitUrl[] }
  | { ok: false; error: string }

/**
 * Laedt die Dokumente eines Falls inkl. signierter Download-URLs.
 *
 * Auth-Gate: `requireRole` auf die vier internen Rollen (spiegelt
 * `src/app/faelle/layout.tsx:47`) + RLS auf `fall_dokumente` fuer den
 * konkreten Fall. Beides, nicht nur eines: die Rolle allein wuerde jedem
 * Kanzlei-User jeden Fall oeffnen, RLS allein wuerde die Action fuer
 * Kunde/SV/Werkstatt offen lassen (Server-Actions sind eigenstaendige
 * POST-Endpunkte — ein Layout-Guard schuetzt sie NICHT).
 */
export async function listFallDokumenteMitUrls(
  fallId: string,
): Promise<ListFallDokumenteResult> {
  if (!fallId) return { ok: false, error: 'Fall-ID fehlt' }

  const guard = await requireRole(['admin', 'kundenbetreuer', 'kanzlei', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error }

  // RLS-gescopter Read auf dem User-Client — das ist das Autorisierungs-Gate.
  const { data, error } = await guard.supabase
    .from('fall_dokumente')
    .select(
      'id, dokument_typ, kategorie, storage_path, original_filename, mime_type, groesse_bytes, hochgeladen_am, beschreibung',
    )
    .eq('fall_id', fallId)
    .is('geloescht_am', null)
    // CMM-32e: KB-abgelehnte Iterationen sind nur intern fuer Audit relevant.
    .is('abgelehnt_am', null)
    .order('hochgeladen_am', { ascending: false })

  if (error) return { ok: false, error: error.message }

  const rows = data ?? []

  // Nur das Signieren laeuft auf dem Service-Client — auf Pfaden, die die
  // RLS-Query oben bereits freigegeben hat.
  //
  // TTL = Default `ui` (1h), NICHT `download` (5min): die Links werden eager
  // beim Oeffnen des Drawers gerendert, nicht erst beim Klick erzeugt. Bei
  // 5min waere ein Link tot, sobald der Drawer ein paar Minuten offen liegt.
  // (Gleiche Wahl wie die Seiten-Signierung in faelle/[id]/page.tsx.)
  const admin = createAdminClient()
  const urls = await getStorageUrlBulk(
    admin,
    rows.map((r) => ({ bucket: 'fall-dokumente', path: r.storage_path })),
  )

  return {
    ok: true,
    dokumente: rows.map((r, i) => ({ ...r, url: urls[i] })),
  }
}

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Signierte URL des zuletzt hochgeladenen Anschlussschreibens eines Falls.
 *
 * Wird lazy beim Klick geholt statt beim Seiten-Render: die signierte URL ist
 * kurzlebig (5min Download-TTL), und `kanzlei_faelle.anschlussschreiben_url`
 * haelt seit dem Upload-Refactor den storage_path, keine fertige URL mehr.
 *
 * Gleiche Invariante wie oben: Read auf dem User-Client (RLS), Signieren auf
 * dem Service-Client. Der Pfad kommt aus der DB, nie vom Caller.
 */
export async function getAnschlussschreibenUrl(fallId: string): Promise<SignedUrlResult> {
  if (!fallId) return { ok: false, error: 'Fall-ID fehlt' }

  const guard = await requireRole(['admin', 'kundenbetreuer', 'kanzlei', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error }

  const { data, error } = await guard.supabase
    .from('fall_dokumente')
    .select('storage_path')
    .eq('fall_id', fallId)
    .eq('dokument_typ', 'anschlussschreiben')
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  const path = data?.storage_path as string | null | undefined
  if (!path) return { ok: false, error: 'Kein Anschlussschreiben hinterlegt' }

  const admin = createAdminClient()
  const url = await getStorageUrl(admin, 'fall-dokumente', path, { context: 'download' })
  if (!url) return { ok: false, error: 'URL-Generierung fehlgeschlagen' }
  return { ok: true, url }
}
