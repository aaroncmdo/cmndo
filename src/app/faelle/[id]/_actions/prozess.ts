'use server'

// AAR-167 / W4-Trigger: Prozess-Actions für ProzessTab.
// - requestTechnischeStellungnahme: KB markiert Stellungnahme als beauftragt,
//   Status='beauftragt', beauftragt_am=now, Timeline + WA an SV
// - freigebeTechnischeStellungnahme: KB-Freigabe nach SV-Upload
// - startRuege: erhöht ruege_counter (max 2), setzt ruege_gesendet_am
// - uebergebeFallKlage: Fall auf Status 'klage' + geschlossen_grund

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import type { FallakteRolle } from '@/lib/fall/field-permissions'

async function requireKb(supabase: Awaited<ReturnType<typeof createClient>>) {
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = (profile?.rolle as FallakteRolle | undefined) ?? 'kunde'
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { error: 'Nur KB/Admin dürfen Prozess-Actions triggern' as const }
  }
  return { user, rolle }
}

export async function requestTechnischeStellungnahme(
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireKb(supabase)
  if ('error' in auth) return { success: false, error: auth.error }

  const db = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await db
    .from('faelle')
    .update({
      technische_stellungnahme_status: 'beauftragt',
      technische_stellungnahme_beauftragt_am: now,
      updated_at: now,
    })
    .eq('id', fallId)
  if (error) return { success: false, error: error.message }

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'prozess',
    titel: 'Technische Stellungnahme angefordert',
    beschreibung: 'KB hat SV beauftragt — SLA 72h / 3 WT',
    erstellt_von: auth.user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

export async function freigebeTechnischeStellungnahme(
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireKb(supabase)
  if ('error' in auth) return { success: false, error: auth.error }

  const db = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await db
    .from('faelle')
    .update({
      technische_stellungnahme_status: 'freigegeben',
      technische_stellungnahme_freigabe_am: now,
      updated_at: now,
    })
    .eq('id', fallId)
  if (error) return { success: false, error: error.message }

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'prozess',
    titel: 'Technische Stellungnahme freigegeben',
    beschreibung: 'KB hat Plausibilitäts-Check bestanden — Kanzlei kann Rüge vorbereiten',
    erstellt_von: auth.user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

export async function startRuege(
  fallId: string,
): Promise<{ success: boolean; runde?: number; error?: string }> {
  const supabase = await createClient()
  const auth = await requireKb(supabase)
  if ('error' in auth) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('ruege_counter')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const prevCounter = Number(fall.ruege_counter ?? 0)
  if (prevCounter >= 2) {
    return {
      success: false,
      error: 'Maximale Rüge-Runden erreicht — nächster Schritt ist Klage-Entscheidung',
    }
  }

  const nextCounter = prevCounter + 1
  const now = new Date().toISOString()
  const { error } = await db
    .from('faelle')
    .update({
      ruege_counter: nextCounter,
      ruege_gesendet_am: now,
      updated_at: now,
    })
    .eq('id', fallId)
  if (error) return { success: false, error: error.message }

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'prozess',
    titel: `Rüge ${nextCounter} gestartet`,
    beschreibung: 'KB hat Rüge-Prozess initiiert — Kanzlei versendet',
    erstellt_von: auth.user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, runde: nextCounter }
}

export async function uebergebeFallKlage(
  fallId: string,
  grund?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireKb(supabase)
  if ('error' in auth) return { success: false, error: auth.error }

  const db = createAdminClient()
  const now = new Date().toISOString()

  // Status-Transition über State-Machine (validiert Übergang)
  try {
    await transitionFallStatus(fallId, 'klage', { grund })
  } catch (e) {
    // Ungültige Transition — fallback direkter Update nicht, sondern Fehler zurückgeben
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Status-Transition fehlgeschlagen',
    }
  }

  // CMM-44 SP-B PR2a: geschlossen_grund lebt auf claims (SSoT).
  // transitionFallStatus() hat den Status bereits gesetzt; wir setzen
  // geschlossen_grund explizit auf claims und nur updated_at auf faelle.
  const { data: fallRow } = await db.from('faelle').select('claim_id').eq('id', fallId).maybeSingle()
  const fallClaimId = (fallRow as { claim_id?: string | null } | null)?.claim_id ?? null
  if (fallClaimId) {
    await db.from('claims').update({
      geschlossen_grund: grund ?? 'Klage-Übergabe an LexDrive',
    }).eq('id', fallClaimId)
  }
  const { error } = await db
    .from('faelle')
    .update({ updated_at: now })
    .eq('id', fallId)
  if (error) return { success: false, error: error.message }

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'prozess',
    titel: 'Fall an LexDrive für Klage übergeben',
    beschreibung: grund ?? 'KB hat Klage-Entscheidung getroffen — Fall für Claimondo abgeschlossen',
    erstellt_von: auth.user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

// AAR-684 Phase 2: Eskalation — setzt vs_eskalationsstufe + Timeline.
export async function eskalation(
  fallId: string,
  stufe: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const stufeKey = stufe.toLowerCase()
  await supabase
    .from('faelle')
    .update({ vs_eskalationsstufe: stufeKey })
    .eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `Eskalation ${stufe}`,
    beschreibung: `Eskalationsstufe ${stufe} manuell eingeleitet.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}
