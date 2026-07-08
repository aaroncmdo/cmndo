import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Cleanup-Cron fuer anonyme Anspruch-Schaetzungs-Sessions aelter als 30 Tage.
 *
 * Findet alle Zeilen in anspruch_schaetzungen mit lead_id=null und erstellt_am
 * mehr als 30 Tage in der Vergangenheit, loescht deren Fotos aus dem
 * fall-dokumente Storage und dann die Zeilen selbst.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Berechne den Zeitpunkt vor 30 Tagen
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  // Finde alle anonymen Sessions (lead_id is null) die aelter als 30 Tage sind
  const { data: alteSessions, error: selectError } = await db
    .from('anspruch_schaetzungen')
    .select('id, session_token, foto_pfade')
    .is('lead_id', null)
    .lt('erstellt_am', thirtyDaysAgo)

  if (selectError) {
    return NextResponse.json(
      { ok: false, error: `Fehler beim Abrufen der Sessions: ${selectError.message}` },
      { status: 500 },
    )
  }

  let geloescht = 0
  const fehlerDaten = []

  // Loeschen der Fotos und dann der Zeilen
  for (const row of alteSessions ?? []) {
    try {
      // Loeschen der Fotos aus dem Storage
      const pfade = Array.isArray(row.foto_pfade) ? (row.foto_pfade as string[]) : []
      if (pfade.length > 0) {
        const { error: storageError } = await db.storage.from('fall-dokumente').remove(pfade)
        if (storageError) {
          fehlerDaten.push({
            sessionId: row.id,
            fehler: `Storage-Fehler: ${storageError.message}`,
          })
          continue
        }
      }

      // Loeschen der Zeile
      const { error: deleteError } = await db
        .from('anspruch_schaetzungen')
        .delete()
        .eq('id', row.id)

      if (deleteError) {
        fehlerDaten.push({
          sessionId: row.id,
          fehler: `DB-Fehler: ${deleteError.message}`,
        })
        continue
      }

      geloescht++
    } catch (err) {
      fehlerDaten.push({
        sessionId: row.id,
        fehler: `Unerwarteter Fehler: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  const response: Record<string, unknown> = {
    ok: fehlerDaten.length === 0,
    geloescht,
  }

  if (fehlerDaten.length > 0) {
    response.fehler = fehlerDaten
  }

  return NextResponse.json(response, { status: fehlerDaten.length === 0 ? 200 : 206 })
}
