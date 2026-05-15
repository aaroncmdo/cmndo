'use server'

// CMM-32 Walkthrough: Admin-Actions fuer die OCR-Auswertung des Gutachtens.
//   reRunGutachtenOcr(auftragId)        — Re-Trigger der Pipeline
//   updateGutachtenOcrFelder(claimId, patch) — manuelle Korrektur einzelner Werte

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { extractGutachtenAndSaveToClaim } from '@/lib/ai/gutachten-ocr'

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') return { ok: false, error: 'Nur Admins' }
  return { ok: true, userId: user.id }
}

export async function reRunGutachtenOcr(
  auftragId: string,
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const r = await extractGutachtenAndSaveToClaim(auftragId, { force: true })
  revalidatePath(`/faelle/${fallId}`)
  return r
}

// Whitelist der editierbaren Spalten — verhindert dass per Patch-Object
// fremde Spalten (z.B. status, claim_id) gesetzt werden.
const EDITABLE_COLUMNS = new Set<string>([
  // Kern
  'reparaturkosten_netto',
  'reparaturkosten_brutto',
  'minderwert',
  'restwert',
  'wiederbeschaffungswert',
  'wiederbeschaffungsdauer_tage',
  'nutzungsausfall_tage',
  'totalschaden',
  'gutachten_datum',
  // A
  'gutachten_fin',
  'gutachten_kennzeichen',
  'gutachten_erstzulassung',
  'gutachten_laufleistung_km',
  'gutachten_tuv_bis',
  'gutachten_fahrzeug_typ',
  'gutachten_farbe',
  'gutachten_farbcode',
  'gutachten_kraftstoff',
  // B
  'gutachten_vorschaeden_text',
  'gutachten_lackmesswert_max_my',
  'gutachten_karosseriezustand',
  // C
  'gutachten_zeit_ak_std',
  'gutachten_zeit_kar_std',
  'gutachten_zeit_lack_std',
  'gutachten_lohnsatz_ak_eur',
  'gutachten_lohnsatz_kar_eur',
  'gutachten_lohnsatz_lack_eur',
  'gutachten_materialkosten_eur',
  'gutachten_lackmaterial_eur',
  'gutachten_verbringung_eur',
  // D
  'gutachten_mietwagen_klasse',
  'gutachten_mietwagen_tagessatz_eur',
  'gutachten_nutzungsausfall_tagessatz_eur',
  // E
  'gutachten_sv_honorar_netto',
  'gutachten_sv_honorar_brutto',
  'gutachten_kalkulationssystem',
  'gutachten_seitenzahl',
])

export async function updateGutachtenOcrFelder(
  claimId: string,
  fallId: string,
  patch: Record<string, string | number | boolean | null>,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  // Whitelist filtern
  const cleaned: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(patch)) {
    if (!EDITABLE_COLUMNS.has(key)) continue
    cleaned[key] = val === '' ? null : val
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: 'Keine zulaessigen Felder im Patch' }
  }
  // Markiert den Claim als manuell-ueberschrieben damit der naechste
  // OCR-Re-Run die Werte nicht wieder mit Claude-Output ueberbuegelt.
  cleaned.gutachten_ocr_manuell_ueberschrieben = true

  const db = createAdminClient()
  // Cluster F+G PR-1: Write via RPC apply_gutachten_ocr (Dual-Write claims+gutachten)
  const { error } = await db.rpc('apply_gutachten_ocr', {
    p_claim_id: claimId,
    p_values: cleaned,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`)
  return { ok: true }
}
