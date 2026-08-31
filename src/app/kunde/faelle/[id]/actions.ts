'use server'

// CMM-29 (Phase 1b): Schreibpfade nutzen den zentralen Ownership-Helper
// `assertKundeOwnsFall` (claim_parties → faelle.kunde_id → leads.email).
// Vorher: jede Action hatte ihren eigenen `fall.kunde_id !== user.id`-Check,
// der den claim-Pfad + Lead-Email-Fallback nicht kannte.
//
// Bankdaten (iban/bic/kontoinhaber/bankdaten_hinterlegt_am) schreiben auf claims
// (CMM-44 Phase 3, SSoT) — wie zahlungsweg (CMM-65 Part B). Restliche faelle-Writes
// bleiben bis Phase 6.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import { bestaetigeTermin } from '@/lib/termine/bestaetigung'
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'
import { getStorageUrl } from '@/lib/storage/url'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { touchClaimRecency } from '@/lib/claims/touch-recency'
import { setzeAuszahlungsart } from '@/lib/claims/auszahlungsart'
// KFZ-206: Bankdaten für Auszahlung
export async function saveBankdaten(
  fallId: string,
  iban: string,
  bic: string,
  kontoinhaber: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const ownership = await assertKundeOwnsFall(admin, user.id, user.email ?? null, fallId)
  if (!ownership.ok) return { success: false, error: 'Nicht autorisiert' }

  // CMM-44 Phase 3: Auszahlungs-Bankdaten leben auf claims (SSoT, 1:1) — via
  // ownership.claimId schreiben statt faelle (stirbt in Phase 6).
  if (!ownership.claimId) return { success: false, error: 'Fall hat keinen verknüpften Claim' }
  const { error } = await admin.from('claims').update({
    iban, bic: bic || null, kontoinhaber,
    bankdaten_hinterlegt_am: new Date().toISOString(),
  }).eq('id', ownership.claimId)
  if (error) return { success: false, error: error.message }

  await supabase.from('timeline').insert({
    fall_id: fallId, typ: 'system', titel: 'Bankdaten hinterlegt',
    beschreibung: `IBAN: ${iban.slice(0, 4)}****${iban.slice(-4)}, Kontoinhaber: ${kontoinhaber}`,
    erstellt_von: user.id,
  })
  // K5: Route ist claimId-kanonisch — den claimId-Pfad revalidieren (fallId zeigt auf niemanden).
  revalidatePath(`/kunde/faelle/${ownership.claimId ?? fallId}`)
  return { success: true }
}

/**
 * KFZ-192: Kunde wählt einen der vom SV vorgeschlagenen Slots aus.
 * Setzt den Termin auf den gewählten Slot, bestätigt den Termin, und
 * aktualisiert Fall + Lead.
 */
export async function waehleGegenvorschlagSlot(
  fallId: string,
  terminId: string,
  slot: { datum: string; uhrzeit: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    const admin = createAdminClient()
    const ownership = await assertKundeOwnsFall(admin, user.id, user.email ?? null, fallId)
    if (!ownership.ok) return { success: false, error: 'Nicht autorisiert' }

    // IDOR-Fix: assertKundeOwnsFall prueft nur fallId — der uebergebene terminId MUSS
    // zusaetzlich zum eigenen Fall gehoeren. Sonst kann ein Kunde mit gueltigem eigenem
    // fallId einen FREMDEN terminId umbuchen + via bestaetigeTermin bestaetigen (Admin-
    // Client umgeht RLS -> keine DB-Absicherung). NULL-sicher: fall_id ODER claim_id ODER
    // lead_id muss matchen — KEINE Spalte ist universell gesetzt (prod: 24/61 Termine sind
    // lead-only mit fall_id+claim_id NULL). Der lead_id-Zweig verhindert, dass der Guard den
    // EIGENEN lead-gekeyten Termin des Kunden faelschlich ablehnt; ownership.leadId stammt aus
    // dem verifizierten Fall (nicht client-steuerbar) -> kein neuer IDOR-Vektor.
    const { data: terminOwner } = await admin
      .from('gutachter_termine')
      .select('fall_id, claim_id, lead_id')
      .eq('id', terminId)
      .maybeSingle()
    const gehoertZumFall =
      !!terminOwner &&
      (terminOwner.fall_id === fallId ||
        (!!ownership.claimId && terminOwner.claim_id === ownership.claimId) ||
        (!!ownership.leadId && terminOwner.lead_id === ownership.leadId))
    if (!gehoertZumFall) return { success: false, error: 'Nicht autorisiert' }

    // Termin neu setzen — AAR-956 TZ: slot ist Berlin-Wall-Clock -> echter UTC-Instant.
    const startZeit = berlinWallClockToUtc(`${slot.datum}T${slot.uhrzeit}:00`)
    const endZeit = new Date(new Date(startZeit).getTime() + 90 * 60 * 1000).toISOString()

    const { error: updateErr } = await admin
      .from('gutachter_termine')
      .update({
        start_zeit: startZeit,
        end_zeit: endZeit,
        sv_vorgeschlagene_slots: null,
        // status wird durch bestaetigeTermin auf 'bestaetigt' gesetzt
      })
      .eq('id', terminId)

    if (updateErr) return { success: false, error: updateErr.message }

    // Termin bestätigen (setzt status='bestaetigt' + final_verbindlich_ab)
    await bestaetigeTermin(terminId)

    // Fall touchen (CMM-65: Recency auf claims, SSoT) + Lead-Termin updaten
    await touchClaimRecency(admin, ownership.claimId)

    if (ownership.leadId) {
      const { error: terminSpiegelFehler } = await admin.from('leads')
        .update({ gutachter_termin: startZeit, updated_at: new Date().toISOString() })
        .eq('id', ownership.leadId)
      if (terminSpiegelFehler) {
        console.error(`[kunde/faelle] Termin nicht auf den Lead gespiegelt (${ownership.leadId}):`, terminSpiegelFehler.message)
      }
    }

    // KFZ-136: Reminder generieren
    try {
      const { generateReminderForTermin } = await import('@/lib/reminders/generate')
      await generateReminderForTermin(terminId)
    } catch (err) { console.error('[KFZ-136] Reminder-Gen Gegenvorschlag:', err) }

    // K5: claimId-Pfad revalidieren (Route ist claimId-kanonisch).
    revalidatePath(`/kunde/faelle/${ownership.claimId ?? fallId}`)
    return { success: true }
  } catch (err) {
    console.error('[waehleGegenvorschlagSlot]', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// KFZ-206: Zahlungsweg-Auswahl durch Kunden
export async function updateZahlungsweg(
  fallId: string,
  zahlungsweg: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const ownership = await assertKundeOwnsFall(admin, user.id, user.email ?? null, fallId)
  if (!ownership.ok) return { success: false, error: 'Nicht autorisiert' }

  // CMM-65 Part B: zahlungsweg ({kundenkonto,werkstatt_direkt} = Auszahlungs-ZIEL
  // des Kunden) lebt jetzt claims-nativ — NICHT claim_payments.zahlungsweg
  // ({ueberweisung,scheck,bar,verrechnung} = Zahlungs-METHODE; gleicher Name,
  // andere Semantik + CHECK-Domain). assertKundeOwnsFall liefert die claimId
  // (alle faelle haben claim_id NOT NULL).
  // K3 (b0e963b6 22.07.): Write-Fehler NICHT mehr verschlucken — sonst meldet die UI
  // faelschlich "gespeichert", waehrend das Auszahlungsziel still falsch bleibt.
  if (ownership.claimId) {
    const { error } = await admin.from('claims').update({ zahlungsweg }).eq('id', ownership.claimId)
    if (error) return { success: false, error: error.message }
  }
  // Timeline ist non-critical (best-effort) — ein Insert-Fail darf den Zahlungsweg-Save nicht kippen.
  try {
    await admin.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: `Zahlungsweg gewählt: ${zahlungsweg === 'kundenkonto' ? 'Kundenkonto' : 'Werkstatt direkt'}`,
    })
  } catch (err) {
    console.error('[updateZahlungsweg] timeline insert', err)
  }

  // K5: Route ist claimId-kanonisch — den claimId-Pfad revalidieren (fallId zeigt auf niemanden).
  revalidatePath(`/kunde/faelle/${ownership.claimId ?? fallId}`)
  return { success: true }
}

/**
 * Auszahlungsart aendern (Aaron 30.08.): Der Kunde darf sie umstellen — es ist seine
 * Geldentscheidung, und sie kann sich aendern, solange das Gutachten nicht vorliegt.
 * Mit dessen Fertigstellung ist sie final; die Sperre liegt in setzeAuszahlungsart, damit
 * sie fuer Kunde UND Sachverstaendigen dieselbe ist.
 */
export async function aendereAuszahlungsartAlsKunde(
  fallId: string,
  wert: string,
): Promise<{ success: boolean; error?: string; gesperrt?: boolean }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const ownership = await assertKundeOwnsFall(admin, user.id, user.email ?? null, fallId)
  if (!ownership.ok) return { success: false, error: 'Nicht autorisiert' }
  if (!ownership.claimId) return { success: false, error: 'Fall hat keinen verknüpften Claim' }

  const res = await setzeAuszahlungsart(admin, ownership.claimId, wert, {
    fallId,
    userId: user.id,
    akteur: 'den Kunden',
  })
  if (!res.ok) return { success: false, error: res.error, gesperrt: res.gesperrt }

  revalidatePath(`/kunde/faelle/${ownership.claimId}`)
  revalidatePath(`/gutachter/fall/${ownership.claimId}`)
  revalidatePath(`/werkstatt/auftraege/${ownership.claimId}`)
  return { success: true }
}
