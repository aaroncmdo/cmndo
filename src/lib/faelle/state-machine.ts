import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-202: Zentrale State-Machine fuer faelle.status.
 * Validiert alle Uebergaenge, setzt Timestamps, schreibt Timeline.
 */

export const FALL_STATUS_TRANSITIONS: Record<string, string[]> = {
  'ersterfassung': ['sv-gesucht', 'sv-zugewiesen', 'sv-termin', 'storniert'],
  'onboarding': ['ersterfassung', 'storniert'],
  'sv-gesucht': ['sv-zugewiesen', 'sv-termin', 'storniert'],
  'sv-zugewiesen': ['sv-termin', 'storniert'],
  'sv-termin': ['besichtigung', 'begutachtung-laeuft', 'storniert'],
  'besichtigung': ['begutachtung-laeuft', 'gutachten-eingegangen', 'storniert'],
  'begutachtung-laeuft': ['gutachten-eingegangen', 'storniert'],
  'gutachten-eingegangen': ['filmcheck', 'gutachten-eingegangen', 'storniert'],
  'filmcheck': ['kanzlei-uebergeben', 'gutachten-eingegangen', 'storniert'],
  'qc-pruefung': ['kanzlei-uebergeben', 'gutachten-eingegangen', 'storniert'],
  'kanzlei-uebergeben': ['anschlussschreiben', 'storniert'],
  'anschlussschreiben': ['regulierung-laeuft', 'vs-abgelehnt', 'regulierung', 'storniert'],
  'regulierung': ['zahlung-eingegangen', 'abgeschlossen', 'storniert'],
  'regulierung-laeuft': ['zahlung-eingegangen', 'vs-abgelehnt', 'storniert'],
  'vs-abgelehnt': ['storniert'],
  'zahlung-eingegangen': ['abgeschlossen'],
  'abgeschlossen': [],
  'storniert': [],
}

export async function transitionFallStatus(
  fallId: string,
  newStatus: string,
  metadata?: {
    vs_reaktion_typ?: string
    betrag?: number
    grund?: string
    user_id?: string
  },
): Promise<void> {
  const db = createAdminClient()

  const { data: fall, error: fetchErr } = await db
    .from('faelle')
    .select('id, status')
    .eq('id', fallId)
    .single()

  if (fetchErr || !fall) throw new Error(`Fall ${fallId} nicht gefunden`)

  const currentStatus = fall.status as string

  // Validate transition
  const allowed = FALL_STATUS_TRANSITIONS[currentStatus]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Ungueltiger Status-Uebergang: ${currentStatus} → ${newStatus}. Erlaubt: ${allowed?.join(', ') ?? 'keine'}`,
    )
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: newStatus,
    status_changed_at: now,
    updated_at: now,
  }

  // Status-specific timestamp fields
  if (newStatus === 'storniert') {
    update.storniert_am = now
    if (metadata?.grund) update.storno_grund = metadata.grund
  }
  if (newStatus === 'abgeschlossen') {
    update.abgeschlossen_am = now
  }
  if (newStatus === 'kanzlei-uebergeben') {
    update.kanzlei_uebergeben_am = now
  }
  if (newStatus === 'anschlussschreiben') {
    update.anschlussschreiben_am = now
  }
  if (newStatus === 'zahlung-eingegangen') {
    update.zahlung_eingegangen_am = now
    if (metadata?.betrag) update.zahlung_betrag = metadata.betrag
  }
  if (newStatus === 'regulierung' || newStatus === 'regulierung-laeuft') {
    update.regulierung_am = now
    update.regulierung_angekuendigt_am = now
  }
  if (newStatus === 'vs-abgelehnt') {
    update.vs_reaktion_typ = 'abgelehnt'
    update.vs_reaktion_am = now
    if (metadata?.grund) update.vs_ablehnungsgrund = metadata.grund
  }

  const { error: updateErr } = await db
    .from('faelle')
    .update(update)
    .eq('id', fallId)

  if (updateErr) throw new Error(updateErr.message)

  // Timeline entry
  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: `Status: ${currentStatus} → ${newStatus}`,
    beschreibung: metadata?.grund ?? null,
    erstellt_von: metadata?.user_id ?? null,
  })
}
