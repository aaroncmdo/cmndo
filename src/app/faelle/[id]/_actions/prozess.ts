'use server'

// AAR-167 / W4-Trigger: Prozess-Actions für ProzessTab.
// - requestTechnischeStellungnahme: KB markiert Stellungnahme als beauftragt,
//   Status='beauftragt', beauftragt_am=now, Timeline + WA an SV
// - freigebeTechnischeStellungnahme: KB-Freigabe nach SV-Upload
// - startRuege: erhöht ruege_counter (max 2), setzt ruege_gesendet_am
// - uebergebeFallKlage: Fall auf Status 'klage' + geschlossen_grund

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import type { FallakteRolle } from '@/lib/fall/field-permissions'

// CMM-44 SP-H PR2: schreibt SP-H-Auftrag-Lifecycle-Spalten auf den aktuellen
// Auftrag des Claims (ORDER BY reihenfolge DESC LIMIT 1). Liefert eine
// Fehlermeldung (string) zurueck, wenn der Auftrag-Write fehlschlaegt, sonst
// null. Kein Auftrag/claim_id (Legacy) -> warn + skip (kein Fehler).
async function writeAuftragSpH(
  db: ReturnType<typeof createAdminClient>,
  claimId: string | null,
  update: Record<string, unknown>,
): Promise<string | null> {
  if (!claimId) {
    console.warn(`[CMM-44 SP-H] kein claim_id — ${Object.keys(update).join(',')} skip`)
    return null
  }
  const { data: aktAuftrag } = await db
    .from('auftraege')
    .select('id')
    .eq('claim_id', claimId)
    .order('reihenfolge', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!aktAuftrag) {
    console.warn(`[CMM-44 SP-H] kein Auftrag fuer claim ${claimId} — ${Object.keys(update).join(',')} skip`)
    return null
  }
  const { error } = await db.from('auftraege').update(update).eq('id', aktAuftrag.id)
  return error ? error.message : null
}

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
  // CMM-44 SP-H PR2: technische_stellungnahme_status/_beauftragt_am sind auf die
  // auftraege-Sub-Tabelle gewandert (Reader lesen sie von auftraege).
  // CMM-65: claim_id nur noch LESEN; der updated_at-Bump wandert von faelle
  // (stirbt mit Phase-6-DROP TABLE faelle) auf claims (SSoT) — s.u. Der
  // faelle->claims-Sync-Trigger feuert NICHT bei einem reinen updated_at-Write
  // (updated_at ist nicht in dessen UPDATE OF-Spaltenliste), daher expliziter
  // claims-Bump statt Drop.
  const claimId = await resolveClaimId(db, fallId)

  const stellungnahmeErr = await writeAuftragSpH(db, claimId, {
    technische_stellungnahme_status: 'beauftragt',
    technische_stellungnahme_beauftragt_am: now,
  })
  if (stellungnahmeErr) return { success: false, error: stellungnahmeErr }

  // CMM-65: updated_at auf claims (SSoT) bumpen. moddatetime-Trigger
  // trg_claims_updated_at setzt updated_at ohnehin; der explizite Wert ist
  // Fallback und macht die Intent sichtbar. Non-critical (best-effort).
  if (claimId) await db.from('claims').update({ updated_at: now }).eq('id', claimId)

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
  // CMM-44 SP-H PR2: technische_stellungnahme_status/_freigabe_am leben jetzt auf
  // auftraege.
  // CMM-65: claim_id nur noch LESEN; updated_at-Bump wandert von faelle auf
  // claims (SSoT) — siehe requestTechnischeStellungnahme.
  const claimId = await resolveClaimId(db, fallId)

  const freigabeErr = await writeAuftragSpH(db, claimId, {
    technische_stellungnahme_status: 'freigegeben',
    technische_stellungnahme_freigabe_am: now,
  })
  if (freigabeErr) return { success: false, error: freigabeErr }

  // CMM-65: updated_at auf claims (SSoT) bumpen. Non-critical (best-effort).
  if (claimId) await db.from('claims').update({ updated_at: now }).eq('id', claimId)

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
  // CMM-44 SP-I5: ruege_counter + ruege_gesendet_am leben auf kanzlei_faelle (1:1 per Claim).
  // CMM-49 (faelle-Drop + #2688-REVERSE-Embed-Fix): der frühere faelle.kanzlei_faelle(...)-Embed
  // lief über die kanzlei_faelle.fall_id->faelle-FK, die #2688 auf die Bridge repointete -> PGRST200
  // (Action war broken). claim_id via Bridge, ruege_counter direkt aus kanzlei_faelle (claim_id-keyed).
  const { data: bridgeRow } = await db
    .from('faelle_claim_bridge')
    .select('claim_id')
    .eq('fall_id', fallId)
    .maybeSingle()
  const ruegeClaimId = (bridgeRow as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!ruegeClaimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
  const { data: ruegeKf } = await db
    .from('kanzlei_faelle')
    .select('ruege_counter')
    .eq('claim_id', ruegeClaimId)
    .maybeSingle()

  const prevCounter = Number((ruegeKf as { ruege_counter?: number | null } | null)?.ruege_counter ?? 0)
  if (prevCounter >= 2) {
    return {
      success: false,
      error: 'Maximale Rüge-Runden erreicht — nächster Schritt ist Klage-Entscheidung',
    }
  }

  const nextCounter = prevCounter + 1
  const now = new Date().toISOString()
  const kfRes = await upsertKanzleiFall(db, ruegeClaimId, { ruege_counter: nextCounter, ruege_gesendet_am: now })
  if (!kfRes.ok) return { success: false, error: kfRes.error ?? 'kanzlei_faelle Update fehlgeschlagen' }
  // CMM-65: updated_at-Bump von faelle (stirbt mit Phase-6-DROP) auf claims (SSoT)
  // gezogen. ruegeClaimId ist hier garantiert non-null (oben geguarded).
  await db.from('claims').update({ updated_at: now }).eq('id', ruegeClaimId)

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
  // CMM-65: transitionFallStatus() hat den Status (inkl. claims-Write) bereits
  // gesetzt; wir setzen geschlossen_grund + updated_at auf claims (SSoT). Der
  // fruehere faelle.updated_at-Write stirbt mit dem Phase-6-DROP und entfaellt —
  // dieser claims-Write bumpt claims.updated_at (moddatetime + expliziter Wert).
  const fallClaimId = await resolveClaimId(db, fallId)
  if (fallClaimId) {
    await db.from('claims').update({
      geschlossen_grund: grund ?? 'Klage-Übergabe an LexDrive',
      updated_at: now,
    }).eq('id', fallClaimId)
  }

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
  // CMM-44 SP-I3: vs_eskalationsstufe lebt auf kanzlei_faelle (1:1 per Claim). Manuelle
  // Eskalation -> upsertKanzleiFall via Admin-Client. Claim-lose Legacy-Faelle: skip.
  const eskClaimId = await resolveClaimId(supabase, fallId)
  if (eskClaimId) {
    const kfRes = await upsertKanzleiFall(createAdminClient(), eskClaimId, { vs_eskalationsstufe: stufeKey })
    if (!kfRes.ok) return { success: false, error: kfRes.error ?? 'kanzlei_faelle Update fehlgeschlagen' }
  }

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
