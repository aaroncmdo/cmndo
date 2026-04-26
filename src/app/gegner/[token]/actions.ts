'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAirdropToken } from '@/lib/airdrop/token'

export interface GegnerDaten {
  vorname: string
  nachname: string
  geburtsdatum?: string
  telefon?: string
  email?: string
  adresse_strasse?: string
  adresse_plz?: string
  adresse_ort?: string
  versicherung_name?: string
  versicherungsnummer?: string
  kennzeichen?: string
  kommentar?: string
}

type LookupResult =
  | {
      ok: true
      invitation_id: string
      claim_id: string
      party_id: string | null
      claim: {
        claim_nummer: string
        schadentag: string
        schadenort_adresse: string | null
        schadenort_ort: string | null
        schadenart: string
        status: string
        phase: string
      }
      already_responded: boolean
    }
  | { ok: false; error: 'UNGUELTIG' | 'ABGELAUFEN' | 'WIDERRUFEN' | 'BEREITS_KONVERTIERT' }

/**
 * Token validieren und Claim-Daten laden (öffentlich, kein Auth erforderlich).
 * Markiert die Einladung als 'geoeffnet' beim ersten Aufruf.
 */
export async function validateAirdropToken(tokenKlartext: string): Promise<LookupResult> {
  if (!tokenKlartext || tokenKlartext.length < 8) {
    return { ok: false, error: 'UNGUELTIG' }
  }

  const admin = createAdminClient()
  const lookup_prefix = tokenKlartext.slice(0, 8)

  const { data: invitation, error } = await admin
    .from('airdrop_invitations')
    .select(
      'id, claim_id, token_hash, status, expires_at, resulting_party_id, responded_at'
    )
    .eq('token_lookup_prefix', lookup_prefix)
    .in('status', ['offen', 'geoeffnet', 'daten_eingegeben'])
    .maybeSingle()

  if (error || !invitation) return { ok: false, error: 'UNGUELTIG' }

  if (!verifyAirdropToken(tokenKlartext, invitation.token_hash as string)) {
    return { ok: false, error: 'UNGUELTIG' }
  }

  if (invitation.status === 'widerrufen') return { ok: false, error: 'WIDERRUFEN' }
  if (invitation.status === 'konvertiert') return { ok: false, error: 'BEREITS_KONVERTIERT' }

  if (new Date(invitation.expires_at as string) < new Date()) {
    await admin
      .from('airdrop_invitations')
      .update({ status: 'abgelaufen' })
      .eq('id', invitation.id)
    return { ok: false, error: 'ABGELAUFEN' }
  }

  // Beim ersten Öffnen: Status → 'geoeffnet' (Trigger setzt opened_at automatisch)
  if (invitation.status === 'offen') {
    await admin
      .from('airdrop_invitations')
      .update({ status: 'geoeffnet' })
      .eq('id', invitation.id)
  }

  // Claim-Daten laden (limitierte Felder für Gast)
  const { data: claim } = await admin
    .from('claims')
    .select('claim_nummer, schadentag, schadenort_adresse, schadenort_ort, schadenart, status, phase')
    .eq('id', invitation.claim_id as string)
    .single()

  if (!claim) return { ok: false, error: 'UNGUELTIG' }

  return {
    ok: true,
    invitation_id: invitation.id as string,
    claim_id: invitation.claim_id as string,
    party_id: (invitation.resulting_party_id as string | null) ?? null,
    claim: {
      claim_nummer: claim.claim_nummer as string,
      schadentag: claim.schadentag as string,
      schadenort_adresse: claim.schadenort_adresse as string | null,
      schadenort_ort: claim.schadenort_ort as string | null,
      schadenart: claim.schadenart as string,
      status: claim.status as string,
      phase: claim.phase as string,
    },
    already_responded: !!invitation.responded_at,
  }
}

type SubmitResult = { ok: true } | { ok: false; error: string }

/**
 * Gegner-Daten einreichen und Einladung als 'daten_eingegeben' markieren.
 * Erstellt oder aktualisiert den claim_party-Eintrag für den Gegner.
 */
export async function submitGegnerDaten(
  invitationId: string,
  tokenKlartext: string,
  daten: GegnerDaten,
): Promise<SubmitResult> {
  if (!daten.vorname?.trim() || !daten.nachname?.trim()) {
    return { ok: false, error: 'Vor- und Nachname sind Pflichtfelder.' }
  }

  const admin = createAdminClient()

  // Token nochmals verifizieren (Schutz vor direkten Action-Aufrufen)
  const { data: invitation } = await admin
    .from('airdrop_invitations')
    .select('id, claim_id, token_hash, status, resulting_party_id, expires_at')
    .eq('id', invitationId)
    .single()

  if (!invitation) return { ok: false, error: 'Einladung nicht gefunden.' }
  if (!verifyAirdropToken(tokenKlartext, invitation.token_hash as string)) {
    return { ok: false, error: 'Ungültiger Token.' }
  }
  if (['widerrufen', 'abgelaufen', 'konvertiert'].includes(invitation.status as string)) {
    return { ok: false, error: 'Einladung nicht mehr gültig.' }
  }
  if (new Date(invitation.expires_at as string) < new Date()) {
    return { ok: false, error: 'Der Einladungslink ist abgelaufen.' }
  }

  const claim_id = invitation.claim_id as string

  // claim_party anlegen oder aktualisieren
  const existingPartyId = invitation.resulting_party_id as string | null

  if (existingPartyId) {
    await admin
      .from('claim_parties')
      .update({
        vorname: daten.vorname.trim(),
        nachname: daten.nachname.trim(),
        geburtsdatum: daten.geburtsdatum ?? null,
        telefon: daten.telefon?.trim() ?? null,
        email: daten.email?.trim() ?? null,
        adresse_strasse: daten.adresse_strasse?.trim() ?? null,
        adresse_plz: daten.adresse_plz?.trim() ?? null,
        adresse_ort: daten.adresse_ort?.trim() ?? null,
        versicherungsnummer: daten.versicherungsnummer?.trim() ?? null,
        kennzeichen: daten.kennzeichen?.trim() ?? null,
        notiz: daten.kommentar?.trim() ?? null,
      })
      .eq('id', existingPartyId)
  } else {
    const { data: newParty, error: partyErr } = await admin
      .from('claim_parties')
      .insert({
        claim_id,
        rolle: 'gegner_airdrop',
        reihenfolge: 2,
        vorname: daten.vorname.trim(),
        nachname: daten.nachname.trim(),
        geburtsdatum: daten.geburtsdatum ?? null,
        telefon: daten.telefon?.trim() ?? null,
        email: daten.email?.trim() ?? null,
        adresse_strasse: daten.adresse_strasse?.trim() ?? null,
        adresse_plz: daten.adresse_plz?.trim() ?? null,
        adresse_ort: daten.adresse_ort?.trim() ?? null,
        versicherungsnummer: daten.versicherungsnummer?.trim() ?? null,
        kennzeichen: daten.kennzeichen?.trim() ?? null,
        notiz: daten.kommentar?.trim() ?? null,
        quelle: 'airdrop_selbstauskunft',
      })
      .select('id')
      .single()

    if (partyErr || !newParty) {
      return { ok: false, error: 'Datenspeicherung fehlgeschlagen. Bitte erneut versuchen.' }
    }

    // Einladung mit resulting_party_id verknüpfen
    await admin
      .from('airdrop_invitations')
      .update({ resulting_party_id: newParty.id })
      .eq('id', invitationId)
  }

  // Status → 'daten_eingegeben' (Trigger setzt responded_at automatisch)
  await admin
    .from('airdrop_invitations')
    .update({ status: 'daten_eingegeben' })
    .eq('id', invitationId)

  return { ok: true }
}
