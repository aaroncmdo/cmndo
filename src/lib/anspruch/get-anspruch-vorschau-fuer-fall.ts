import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { AnspruchPosition, AnspruchSpanne, Schuldform, Schweregrad, TotalschadenInfo } from './types'

function normalisiereSchuld(roh: unknown): Schuldform {
  return roh === 'selbst' || roh === 'teilschuld' ? roh : 'unverschuldet'
}

/**
 * KI-Vorschaetzung (aus dem Anspruch-pruefen-Tool) fuer die SV-Fallakte laden.
 * `admin` MUSS der service-role-Client sein (anspruch_schaetzungen ist RLS-deny-all) und
 * darf NUR aufgerufen werden, NACHDEM die SV<->Fall-Ownership geprueft wurde (getFallForSv).
 * Pfad: claimId -> claims.lead_id -> anspruch_schaetzungen.lead_id (neueste Schaetzung).
 */
export type AnspruchVorschau = {
  spanne: AnspruchSpanne
  beschaedigteTeile: string[]
  schweregrad: Schweregrad | null
  segment: string | null
  beschreibung: string | null
  fahrbereit: boolean | null
  ezJahr: number | null
}

export async function getAnspruchVorschauFuerFall(
  admin: SupabaseClient<Database>,
  claimId: string,
): Promise<AnspruchVorschau | null> {
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id')
    .eq('id', claimId)
    .maybeSingle()
  const leadId = claim?.lead_id
  if (!leadId) return null

  // select('*') statt expliziter Spaltenliste: die schuld-Spalte (Migration 20260706085339) fehlt noch
  // in den generierten Typen; '*' umgeht die Select-String-Typpruefung, schuld wird unten defensiv gelesen.
  //
  // NICHT limit(1): der Foto-Check legt bei JEDEM Mount eine neue Session an (AnspruchWizard,
  // useEffect mit leerem dep-array). Seit die Sessions ueber ?lead= mit dem Lead verknuepft
  // werden, haengen an einem Lead also mehrere — und ein blosser Reload macht eine LEERE zur
  // neuesten. Mit limit(1) haette sie die ausgefuellte verdeckt und die Vorschau waere wieder
  // null gewesen, also genau der Zustand, den die Verknuepfung beheben soll.
  // Daher: die neueste Session MIT Positionen gewinnt.
  const { data: sessions } = await admin
    .from('anspruch_schaetzungen')
    .select('*')
    .eq('lead_id', leadId)
    .order('erstellt_am', { ascending: false })
    .limit(20)
  const sess = (sessions ?? []).find(
    (s) => Array.isArray(s.positionen) && (s.positionen as unknown[]).length > 0,
  )
  if (!sess) return null

  const positionen = sess.positionen as unknown as AnspruchPosition[]

  const summierbar = positionen.filter(
    (p) => !p.gedecktDurchGegner && p.minEur != null && p.maxEur != null,
  )
  const gesamtMinEur = Math.round(summierbar.reduce((s, p) => s + (p.minEur as number), 0))
  const gesamtMaxEur = Math.round(summierbar.reduce((s, p) => s + (p.maxEur as number), 0))

  const vision = (sess.vision_result ?? {}) as { beschaedigte_teile?: unknown; beschreibung?: unknown }
  const beschaedigteTeile = Array.isArray(vision.beschaedigte_teile)
    ? vision.beschaedigte_teile.filter((t): t is string => typeof t === 'string')
    : []

  return {
    spanne: {
      positionen,
      gesamtMinEur,
      gesamtMaxEur,
      hinweise: [],
      schuld: normalisiereSchuld((sess as { schuld?: string | null }).schuld),
      ...(sess.totalschaden ? { totalschaden: sess.totalschaden as unknown as TotalschadenInfo } : {}),
    },
    beschaedigteTeile,
    schweregrad: (sess.schweregrad as Schweregrad | null) ?? null,
    segment: sess.erkanntes_segment ?? null,
    beschreibung: typeof vision.beschreibung === 'string' ? vision.beschreibung : null,
    fahrbereit: sess.fahrbereit,
    ezJahr: sess.ez_jahr,
  }
}
