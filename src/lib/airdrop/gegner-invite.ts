// Slice 2c — Schritt 1: Nach dem Claim bekommt der Unfallgegner per SMS einen Magic-Link.
// Tippt er ihn an und bestaetigt, gilt seine Handynummer als verifiziert (Besitz-Nachweis)
// und die Unfallmeldung geht an seine Haftpflicht (siehe vs-meldung/sende-unfallmeldung).
//
// Kein 'use server' — das ist eine Lib, kein Action-Modul (Konstanten-Export waere sonst
// im Client-Bundle undefined, s. AGENTS.md/AAR-664).
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeE164, sendPlainSms } from '@/lib/whatsapp/send-sms-plain'
import { generateAirdropToken } from './token'

export const INVITE_TTL_STUNDEN = 72

type InviteResult = { ok: true; inviteId: string; smsSent: boolean } | { ok: false; error: string }

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

export function buildBestaetigungsLink(token: string): string {
  return `${baseUrl()}/unfallmeldung/${token}`
}

/**
 * Legt die airdrop_invitations-Zeile an und schickt den Magic-Link per SMS.
 *
 * Reihenfolge ist bewusst DB-zuerst: ohne persistierte Zeile darf keine SMS rausgehen
 * (sonst haette der Gegner einen Link, den niemand aufloesen kann). Scheitert dagegen nur
 * die SMS, bleibt der Invite gueltig und der Nachfass-Cron eskaliert ihn an Dispatch —
 * deshalb ok:true mit smsSent:false statt eines harten Fehlers.
 */
export async function inviteGegnerViaAirdrop(
  claimId: string,
  telefon: string,
  opts?: { partyId?: string | null },
): Promise<InviteResult> {
  const tel = telefon?.trim()
  if (!tel) return { ok: false, error: 'Keine Telefonnummer' }

  const { token, tokenHash, lookupPrefix } = generateAirdropToken()
  const jetzt = Date.now()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('airdrop_invitations')
    .insert({
      claim_id: claimId,
      token_hash: tokenHash,
      token_lookup_prefix: lookupPrefix,
      invited_via: 'sms',
      status: 'offen',
      invited_at: new Date(jetzt).toISOString(),
      expires_at: new Date(jetzt + INVITE_TTL_STUNDEN * 60 * 60_000).toISOString(),
      invited_by_party_id: opts?.partyId ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[airdrop] Invite-Insert fehlgeschlagen:', error?.message)
    return { ok: false, error: error?.message ?? 'Invite konnte nicht angelegt werden' }
  }

  const empfaenger = normalizeE164(tel)
  const body = `Ihre Unfallmeldung bei Claimondo: Bitte bestätigen Sie kurz Ihre Angaben, damit wir den Schaden Ihrer Haftpflichtversicherung melden können: ${buildBestaetigungsLink(token)}`

  let smsSent = false
  try {
    const res = await sendPlainSms(empfaenger, body)
    smsSent = res.success
    if (!res.success) console.error('[airdrop] SMS-Versand fehlgeschlagen:', res.error)
  } catch (err) {
    console.error('[airdrop] SMS-Versand warf:', err)
  }

  return { ok: true, inviteId: data.id as string, smsSent }
}
