'use server'

// Werkstatt-QR-Pool — Admin-Actions: Batch-Generierung + Zuweisung.
// Rein intern (requireAdmin). Die Inbound-Resolution laeuft in
// /start/werkstatt-qr/[token] server-seitig (nicht hier).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateQrPoolToken } from '@/lib/werkstatt/qr-pool-token'
import { revalidatePath } from 'next/cache'

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

const MAX_BATCH = 200

/** Erzeugt N freie Pool-Tokens (crypto-random, UNIQUE). Admin-only. */
export async function generateQrPoolBatch(
  anzahl: number,
  charge?: string,
): Promise<{ ok: true; tokens: string[] } | { ok: false; error: string }> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'Nur Admins dürfen QR-Codes erzeugen.' }
  const n = Math.floor(Number(anzahl))
  if (!Number.isFinite(n) || n < 1 || n > MAX_BATCH) {
    return { ok: false, error: `Anzahl muss zwischen 1 und ${MAX_BATCH} liegen.` }
  }
  const db = createAdminClient()
  const chargeVal = charge?.trim() || null
  const tokens: string[] = []
  for (let i = 0; i < n; i++) {
    let inserted = false
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const token = generateQrPoolToken()
      const { error } = await db
        .from('werkstatt_qr_pool')
        .insert({ token, status: 'frei', charge: chargeVal, created_by: admin.id })
      if (!error) {
        tokens.push(token)
        inserted = true
      } else {
        const msg = error.message.toLowerCase()
        // UNIQUE-Kollision → neuer Token; anderer Fehler → abbrechen.
        if (!msg.includes('duplicate') && !msg.includes('unique')) {
          return { ok: false, error: error.message }
        }
      }
    }
    if (!inserted) return { ok: false, error: 'Token-Generierung fehlgeschlagen (zu viele Kollisionen).' }
  }
  revalidatePath('/admin/vertrieb/werkstaetten/qr-pool')
  return { ok: true, tokens }
}

/** Weist einen freien Pool-Token einer Werkstatt zu. Admin-only. */
export async function weiseQrPoolCodeZu(
  werkstattId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'Nur Admins dürfen QR-Codes zuweisen.' }
  const t = (token ?? '').trim().toUpperCase()
  if (!werkstattId || !t) return { ok: false, error: 'Werkstatt und Code sind erforderlich.' }

  const db = createAdminClient()
  const { data: pool } = await db
    .from('werkstatt_qr_pool')
    .select('id, status')
    .eq('token', t)
    .maybeSingle()
  const row = pool as { id: string; status: string } | null
  if (!row) return { ok: false, error: 'Unbekannter Code.' }
  if (row.status !== 'frei') {
    return { ok: false, error: 'Dieser Code ist bereits vergeben oder gesperrt.' }
  }

  // Update mit status='frei'-Guard gegen Race (zwei Admins, selber Sticker).
  const { data: updated, error } = await db
    .from('werkstatt_qr_pool')
    .update({
      werkstatt_id: werkstattId,
      status: 'zugewiesen',
      zugewiesen_am: new Date().toISOString(),
      zugewiesen_von: admin.id,
    })
    .eq('id', row.id)
    .eq('status', 'frei')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!updated) return { ok: false, error: 'Code wurde zwischenzeitlich vergeben.' }

  revalidatePath('/admin/werkstaetten')
  revalidatePath('/admin/vertrieb/werkstaetten/qr-pool')
  return { ok: true }
}
