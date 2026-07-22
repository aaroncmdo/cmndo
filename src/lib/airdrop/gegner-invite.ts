// Slice 2c — Schritt 1: Nach dem Claim bekommt der Unfallgegner einen Magic-Link —
// bevorzugt per WhatsApp, sonst SMS, sonst Email (T3 operativer-schaden-flow).
// Tippt er ihn an und bestaetigt, gilt seine Handynummer als verifiziert (Besitz-Nachweis)
// und die Unfallmeldung geht an seine Haftpflicht (siehe vs-meldung/sende-unfallmeldung).
//
// Kein 'use server' — das ist eine Lib, kein Action-Modul (Konstanten-Export waere sonst
// im Client-Bundle undefined, s. AGENTS.md/AAR-664).
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeE164, sendPlainSms } from '@/lib/whatsapp/send-sms-plain'
import { isOnWhatsApp, sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendGegnerBestaetigungLink } from '@/lib/email/google/flows'
import { airdropLookupPrefix, generateAirdropToken, hashAirdropToken } from './token'

export const INVITE_TTL_STUNDEN = 72

export type GegnerKanal = 'whatsapp' | 'sms' | 'email' | 'none'
type InviteResult =
  | { ok: true; inviteId: string; kanal: GegnerKanal; sent: boolean }
  | { ok: false; error: string }

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

export function buildBestaetigungsLink(token: string): string {
  return `${baseUrl()}/unfallmeldung/${token}`
}

function buildGegnerBody(name: string | null, link: string): string {
  const greet = name ? `Hallo ${name}, ` : ''
  return `${greet}Ihre Unfallmeldung bei Claimondo: Bitte bestätigen Sie kurz Ihre Angaben, damit wir den Schaden Ihrer Haftpflichtversicherung melden können: ${link}`
}

/**
 * WA-first -> SMS -> Email-Kaskade fuer den Unfallgegner. Gibt den TATSAECHLICH
 * genutzten Kanal zurueck. "Bounce" = WA-Lookup negativ ODER WA-Send-Fehler ->
 * synchroner Fallback (kein async-Webhook). Email nur, wenn der Gegner eine angab.
 */
async function sendeGegnerEinladung(opts: {
  telefon: string
  email: string | null
  name: string | null
  link: string
}): Promise<GegnerKanal> {
  const { telefon, email, name, link } = opts
  const body = buildGegnerBody(name, link)

  // 1. WhatsApp bevorzugt — nur wenn der Lookup die Nummer als WA-faehig bestaetigt.
  if (telefon.trim().length >= 6) {
    try {
      const lookup = await isOnWhatsApp(telefon)
      if (lookup.ok && lookup.onWhatsApp) {
        const sent = await sendWhatsAppText(telefon, body)
        if (sent.ok) return 'whatsapp'
        console.error('[airdrop] WA-Send fehlgeschlagen:', sent.error)
      }
    } catch (err) {
      console.error('[airdrop] WA-Send warf:', err)
    }
  }

  // 2. SMS-Fallback (Twilio).
  if (telefon.trim().length >= 6) {
    try {
      const sms = await sendPlainSms(telefon, body)
      if (sms.success) return 'sms'
      console.error('[airdrop] SMS-Send fehlgeschlagen:', sms.error)
    } catch (err) {
      console.error('[airdrop] SMS-Send warf:', err)
    }
  }

  // 3. Email-Fallback (react-email) — nur wenn eine Gegner-Email vorliegt.
  if (email && email.includes('@')) {
    try {
      const r = await sendGegnerBestaetigungLink({ email, link, name })
      if (r.success) return 'email'
      console.error('[airdrop] Email-Send fehlgeschlagen:', r.error)
    } catch (err) {
      console.error('[airdrop] Email-Send warf:', err)
    }
  }

  return 'none'
}

/**
 * Legt die airdrop_invitations-Zeile an und schickt den Magic-Link — bevorzugt per
 * WhatsApp, sonst SMS, sonst Email.
 *
 * Reihenfolge ist bewusst DB-zuerst: ohne persistierte Zeile darf kein Link rausgehen
 * (sonst haette der Gegner einen Link, den niemand aufloesen kann). invited_via startet
 * provisorisch als 'airdrop' (der Tap-Mechanismus) und wird nach dem Versand auf den
 * tatsaechlichen Kanal gehoben. Scheitert jeder Kanal, bleibt der Invite gueltig und der
 * Nachfass-Cron eskaliert ihn an Dispatch — deshalb ok:true mit sent:false statt Fehler.
 */
export async function inviteGegnerViaAirdrop(
  claimId: string,
  telefon: string,
  opts?: { partyId?: string | null; email?: string | null; name?: string | null },
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
      invited_via: 'airdrop',
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
  const link = buildBestaetigungsLink(token)
  const kanal = await sendeGegnerEinladung({
    telefon: empfaenger,
    email: opts?.email ?? null,
    name: opts?.name ?? null,
    link,
  })

  // invited_via auf den tatsaechlichen Kanal heben (best-effort). Kanal 'none' -> 'airdrop' bleibt.
  if (kanal !== 'none') {
    const { error: upErr } = await admin
      .from('airdrop_invitations')
      .update({ invited_via: kanal })
      .eq('id', data.id as string)
    if (upErr) console.error('[airdrop] invited_via-Update fehlgeschlagen:', upErr.message)
  }

  return { ok: true, inviteId: data.id as string, kanal, sent: kanal !== 'none' }
}

export type InviteKontext = {
  inviteId: string
  claimId: string
  status: string
  abgelaufen: boolean
  bereitsBestaetigt: boolean
}

function hashGleich(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Loest den Klartext-Token aus der SMS auf: Lookup ueber den Prefix, Verifikation ueber den Hash. */
export async function resolveInviteToken(token: string): Promise<InviteKontext | null> {
  const t = token?.trim()
  if (!t) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('airdrop_invitations')
    .select('id, claim_id, status, responded_at, expires_at, token_hash')
    .eq('token_lookup_prefix', airdropLookupPrefix(t))
    .maybeSingle()

  if (error || !data) return null
  if (!hashGleich(data.token_hash as string, hashAirdropToken(t))) return null

  return {
    inviteId: data.id as string,
    claimId: data.claim_id as string,
    status: data.status as string,
    abgelaufen: new Date(data.expires_at as string).getTime() < Date.now(),
    bereitsBestaetigt: data.responded_at !== null,
  }
}

/** opened_at nur beim ERSTEN Oeffnen setzen (chk_airdrop_responded_after_opened). */
export async function markiereInviteGeoeffnet(inviteId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('airdrop_invitations')
    .update({ status: 'geoeffnet', opened_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('opened_at', null)
}

/**
 * Compare-and-Swap: setzt responded_at NUR, wenn es noch NULL ist. Genau ein Aufrufer
 * gewinnt — er (und nur er) loest die Unfallmeldung an die Versicherung aus. Doppelklick,
 * erneutes Oeffnen des Links oder ein Retry koennen die Meldung damit nicht doppelt
 * verschicken; eine zweite Mail an einen Versicherer waere nicht zurueckholbar.
 */
export async function bestaetigeInvite(inviteId: string): Promise<{ gewonnen: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('airdrop_invitations')
    .update({ responded_at: new Date().toISOString(), status: 'daten_eingegeben' })
    .eq('id', inviteId)
    .is('responded_at', null)
    .select('id')

  if (error) {
    console.error('[airdrop] Bestaetigung fehlgeschlagen:', error.message)
    return { gewonnen: false }
  }
  return { gewonnen: (data?.length ?? 0) > 0 }
}
