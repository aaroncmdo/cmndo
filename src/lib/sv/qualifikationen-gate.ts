// AAR-515 Welle 5: Rendering-Gate für Qualifikationen in Kundenkommunikation.
//
// Notion-SoT: https://www.notion.so/3461da4c91248159a1d1c2d6beef129e
//
// **Gate aktiv (extern, Claimondo-Marke):** Flow-Link, Kunden-Portal,
// E-Mail-Templates, WhatsApp-Templates, SEO-Landingpages.
//
// **Gate inaktiv (intern, SV-Eigen):** Dispatch-Matching, Admin-Portal,
// Auftragsbestätigung an SV, Gutachten-PDF, SV-Honorarrechnung.
//
// Konsumenten dieser Helper dürfen `sv.qualifikationen_neu` NICHT direkt
// rendern, sondern holen sich die Whitelist per `getSichtbareQualifikationen()`.
// Das stellt sicher, dass nur Qualis extern erscheinen, deren Nachweis der
// Admin freigegeben hat (Gruppe B) — plus die Selbstauskunft-Qualis
// (Gruppe A: akademische Titel + Meisterbriefe, immer sichtbar).

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Liefert die Whitelist der Qualifikationen, die in Kundenkommunikation
 * angezeigt werden dürfen. Nutzt die Postgres-Funktion
 * `get_sichtbare_qualifikationen(sv_id)` — Single-Source-of-Truth.
 *
 * Rückgabe: alphabetisch sortiertes Array. Leeres Array wenn keine
 * Qualifikation sichtbar ist — Rendering-Layer zeigt dann KEINEN
 * Qualifikations-Block (kein „keine Angabe"-Text).
 */
export async function getSichtbareQualifikationen(
  supabase: SupabaseClient,
  svId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_sichtbare_qualifikationen', {
    p_sv_id: svId,
  })
  if (error) {
    console.error('[qualifikationen-gate] get_sichtbare_qualifikationen:', error.message)
    return []
  }
  return (data as string[] | null) ?? []
}

/**
 * DAT-Badge-Gate. True wenn der SV als dat-gutachter angelegt ist UND der
 * `sv_dat_nachweis`-Slot 'geprueft' ist. `gutachter_typ` ist kein Element
 * von `qualifikationen_neu`, deshalb separat — nicht Teil des Strings-Arrays
 * aus `getSichtbareQualifikationen`.
 */
export async function isDatBadgeSichtbar(
  supabase: SupabaseClient,
  svId: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('is_dat_badge_sichtbar', {
    p_sv_id: svId,
  })
  if (error) {
    console.error('[qualifikationen-gate] is_dat_badge_sichtbar:', error.message)
    return false
  }
  return (data as boolean | null) ?? false
}

/**
 * Convenience: beide Gates in einem Roundtrip + formatierter String.
 * Rückgabe: `{ qualifikationen: string[], datBadge: boolean, joined: string }`
 * wobei `joined` mit Komma getrennt ist und `datBadge` angehängt wird wenn true.
 * Leere Rückgabe (`joined === ''`) signalisiert dem Rendering-Layer,
 * den ganzen Block auszublenden.
 */
export async function getSvQualifikationenFuerKunde(
  supabase: SupabaseClient,
  svId: string,
): Promise<{ qualifikationen: string[]; datBadge: boolean; joined: string }> {
  const [qualifikationen, datBadge] = await Promise.all([
    getSichtbareQualifikationen(supabase, svId),
    isDatBadgeSichtbar(supabase, svId),
  ])
  const parts = [...qualifikationen]
  if (datBadge) parts.push('DAT-Expert')
  return {
    qualifikationen,
    datBadge,
    joined: parts.join(', '),
  }
}
