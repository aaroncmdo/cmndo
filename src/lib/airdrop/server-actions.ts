'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAirdropToken } from '@/lib/airdrop/token'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createHash } from 'crypto'

export type AirdropChannel =
  | 'qr_code' | 'airdrop' | 'whatsapp' | 'sms' | 'email' | 'manual_link' | 'telegram' | 'signal'

export interface InviteGegnerArgs {
  claim_id: string
  invited_via: AirdropChannel
  party_data_hint?: {
    nachname?: string
    firma?: string
    kennzeichen?: string
    telefon?: string
    email?: string
  }
  gegner_telefon?: string
  custom_message?: string
}

export interface InviteGegnerResult {
  invitation_id: string
  party_id: string
  /** Klartext-Magic-Link — nur im Response, nicht persistiert */
  magic_link_url: string
  share_payload: {
    qr_code_url: string
    whatsapp_url: string
    sms_url?: string
    email_subject: string
    email_body: string
    airdrop_text: string
  }
  expires_at: string
}

export async function inviteGegnerViaAirdrop(
  args: InviteGegnerArgs,
): Promise<{ ok: true } & InviteGegnerResult | { ok: false; error: string }> {
  const supabase = await createClient()
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { ok: false, error: 'NICHT_AUTHENTIFIZIERT' }

  const { data: claim } = await supabase
    .from('claims')
    .select('id, geschaedigter_user_id, status, schadentag')
    .eq('id', args.claim_id)
    .maybeSingle()

  if (!claim) return { ok: false, error: 'CLAIM_NICHT_GEFUNDEN' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const istStaff = !!profile?.rolle && ['admin', 'dispatch', 'kundenbetreuer'].includes(profile.rolle)
  const istGeschaedigter = claim.geschaedigter_user_id === user.id

  if (!istStaff && !istGeschaedigter) {
    return { ok: false, error: 'KEINE_BERECHTIGUNG_FUER_EINLADUNG' }
  }

  if (['storniert', 'reguliert', 'abgelehnt', 'an_externe_kanzlei_uebergeben'].includes(claim.status ?? '')) {
    return { ok: false, error: 'CLAIM_NICHT_MEHR_OFFEN' }
  }

  // Rate-Limits
  const rateLimitErr = await enforceRateLimits(supabase, args.claim_id, user.id, ip)
  if (rateLimitErr) return { ok: false, error: rateLimitErr }

  const admin = createAdminClient()
  const token = generateAirdropToken()

  // Existierende Verursacher-Party wiederverwenden oder neue anlegen
  const { data: existingVerursacher } = await admin
    .from('claim_parties')
    .select('id')
    .eq('claim_id', args.claim_id)
    .eq('rolle', 'verursacher')
    .eq('ist_aktiv', true)
    .maybeSingle()

  let party_id: string

  if (existingVerursacher) {
    await admin
      .from('claim_parties')
      .update({
        ist_eingeladen_via_airdrop: true,
        airdrop_token: token.hash,
        airdrop_eingeladen_am: new Date().toISOString(),
        ...(args.party_data_hint?.nachname ? { nachname: args.party_data_hint.nachname } : {}),
        ...(args.party_data_hint?.firma ? { firma: args.party_data_hint.firma } : {}),
        ...(args.party_data_hint?.kennzeichen ? { kennzeichen: args.party_data_hint.kennzeichen } : {}),
      })
      .eq('id', existingVerursacher.id)
    party_id = existingVerursacher.id
  } else {
    const { data: newParty, error: insErr } = await admin
      .from('claim_parties')
      .insert({
        claim_id: args.claim_id,
        rolle: 'gegner_airdrop',
        reihenfolge: 2,
        nachname: args.party_data_hint?.nachname ?? null,
        firma: args.party_data_hint?.firma ?? null,
        kennzeichen: args.party_data_hint?.kennzeichen ?? null,
        telefon: args.party_data_hint?.telefon ?? args.gegner_telefon ?? null,
        email: args.party_data_hint?.email ?? null,
        ist_gewerbe: !!args.party_data_hint?.firma,
        ist_eingeladen_via_airdrop: true,
        airdrop_token: token.hash,
        airdrop_eingeladen_am: new Date().toISOString(),
        quelle: 'manuell_kb',
        created_by_user_id: user.id,
      })
      .select('id')
      .single()

    if (insErr || !newParty) {
      return { ok: false, error: `party_insert_failed: ${insErr?.message ?? 'unbekannt'}` }
    }
    party_id = newParty.id
  }

  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // Einlader-Party-ID ermitteln (falls Geschädigter)
  let invited_by_party_id: string | null = null
  if (istGeschaedigter) {
    const { data: selfParty } = await admin
      .from('claim_parties')
      .select('id')
      .eq('claim_id', args.claim_id)
      .eq('user_id', user.id)
      .maybeSingle()
    invited_by_party_id = selfParty?.id ?? null
  }

  const { data: invitation, error: invErr } = await admin
    .from('airdrop_invitations')
    .insert({
      claim_id: args.claim_id,
      invited_by_user_id: user.id,
      invited_by_party_id,
      token_hash: token.hash,
      token_lookup_prefix: token.lookup_prefix,
      invited_via: args.invited_via,
      expires_at: expires_at.toISOString(),
      status: 'offen',
      resulting_party_id: party_id,
    })
    .select('id')
    .single()

  if (invErr || !invitation) {
    return { ok: false, error: `invitation_insert_failed: ${invErr?.message ?? 'unbekannt'}` }
  }

  const base_url = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const magic_link_url = `${base_url}/gegner/${token.klartext}`

  const standard_message = args.custom_message ?? buildStandardMessage(claim.schadentag)
  const gegner_phone = args.gegner_telefon ?? args.party_data_hint?.telefon

  const share_payload: InviteGegnerResult['share_payload'] = {
    qr_code_url: magic_link_url,
    whatsapp_url: gegner_phone
      ? `https://wa.me/${cleanPhone(gegner_phone)}?text=${encodeURIComponent(standard_message + '\n\n' + magic_link_url)}`
      : `https://wa.me/?text=${encodeURIComponent(standard_message + '\n\n' + magic_link_url)}`,
    sms_url: gegner_phone
      ? `sms:${gegner_phone}?body=${encodeURIComponent(standard_message + '\n\n' + magic_link_url)}`
      : undefined,
    email_subject: 'Datenerfassung zum Schadensereignis vom ' + formatDate(claim.schadentag),
    email_body: standard_message + '\n\n' + magic_link_url,
    airdrop_text: standard_message + '\n\n' + magic_link_url,
  }

  // Notification fire-and-forget
  try {
    const { emitEvent } = await import('@/lib/notifications/emit')
    await emitEvent('claim.gegner_eingeladen', {
      claimId: args.claim_id,
      invitationId: invitation.id,
      invitedVia: args.invited_via,
      expiresAt: expires_at.toISOString(),
    }, { triggeredBy: user.id })
  } catch (err) { console.error('[AAR-814] emitEvent claim.gegner_eingeladen:', err) }

  revalidatePath(`/faelle/${args.claim_id}`)

  return {
    ok: true,
    invitation_id: invitation.id,
    party_id,
    magic_link_url,
    share_payload,
    expires_at: expires_at.toISOString(),
  }
}

// ── acceptAirdropInvitation ────────────────────────────────────────────────

export type AcceptError =
  | 'TOKEN_INVALID' | 'TOKEN_ABGELAUFEN' | 'TOKEN_WIDERRUFEN' | 'TOKEN_BEREITS_KONVERTIERT'

export interface AcceptResult {
  ok: true
  guest_user_id: string
  claim_id: string
  party_id: string
  redirect_url: string
}

export async function acceptAirdropInvitation(
  token_klartext: string,
): Promise<AcceptResult | { ok: false; reason: AcceptError; message: string }> {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  const ua = headersList.get('user-agent') ?? 'unknown'

  if (!token_klartext.match(/^[A-Za-z0-9_-]{40,50}$/)) {
    return { ok: false, reason: 'TOKEN_INVALID', message: 'Der Link ist ungültig.' }
  }

  const lookup_prefix = token_klartext.slice(0, 8)
  const expected_hash = createHash('sha256').update(token_klartext).digest('hex')

  const admin = createAdminClient()

  const { data: invitation } = await admin
    .from('airdrop_invitations')
    .select('*')
    .eq('token_lookup_prefix', lookup_prefix)
    .eq('token_hash', expected_hash)
    .maybeSingle()

  if (!invitation) {
    return { ok: false, reason: 'TOKEN_INVALID', message: 'Der Link ist ungültig.' }
  }

  if (invitation.status === 'widerrufen') {
    return { ok: false, reason: 'TOKEN_WIDERRUFEN', message: 'Diese Einladung wurde zurückgezogen.' }
  }

  if (invitation.status === 'abgelaufen' || new Date(invitation.expires_at) < new Date()) {
    if (invitation.status !== 'abgelaufen') {
      await admin.from('airdrop_invitations').update({ status: 'abgelaufen' }).eq('id', invitation.id)
    }
    return { ok: false, reason: 'TOKEN_ABGELAUFEN', message: 'Der Link ist abgelaufen. Bitte fordern Sie einen neuen Link an.' }
  }

  if (invitation.status === 'konvertiert') {
    return {
      ok: false,
      reason: 'TOKEN_BEREITS_KONVERTIERT',
      message: 'Sie haben bereits einen Account. Bitte loggen Sie sich normal ein.',
    }
  }

  // Gast-Account anlegen oder existierenden wiederverwenden
  let guest_user_id: string
  const isFirstOpen = invitation.resulting_user_id === null

  if (invitation.resulting_user_id) {
    guest_user_id = invitation.resulting_user_id
  } else {
    const syntheticEmail = `gast+${invitation.id}@airdrop.claimondo.internal`

    const { data: newAuthUser, error: authErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      app_metadata: {
        account_typ: 'gast',
        airdrop_invitation_id: invitation.id,
        claim_id: invitation.claim_id,
      },
    })

    if (authErr || !newAuthUser.user) {
      console.error('[AAR-814] createUser failed:', authErr?.message)
      return { ok: false, reason: 'TOKEN_INVALID', message: 'Konto-Anlage fehlgeschlagen.' }
    }

    guest_user_id = newAuthUser.user.id

    await admin.from('profiles').upsert({
      id: guest_user_id,
      email: syntheticEmail,
      rolle: 'kunde',
      account_typ: 'gast',
      entstanden_via: 'airdrop',
      entstanden_aus_claim_id: invitation.claim_id,
      entstanden_aus_airdrop_id: invitation.id,
    }, { onConflict: 'id' })
  }

  // claim_parties mit Gast-Account verknüpfen
  if (invitation.resulting_party_id) {
    await admin
      .from('claim_parties')
      .update({
        user_id: guest_user_id,
        airdrop_response_am: new Date().toISOString(),
      })
      .eq('id', invitation.resulting_party_id)
  }

  // Invitation status updaten (Trigger setzt opened_at automatisch)
  await admin
    .from('airdrop_invitations')
    .update({
      status: invitation.status === 'offen' ? 'geoeffnet' : invitation.status,
      resulting_user_id: guest_user_id,
      ...(isFirstOpen ? { ip_address_open: ip, user_agent_open: ua } : {}),
    })
    .eq('id', invitation.id)

  // Notification an Einlader (fire-and-forget)
  if (isFirstOpen && invitation.invited_by_user_id) {
    try {
      const { emitEvent } = await import('@/lib/notifications/emit')
      await emitEvent('claim.gegner_hat_geoeffnet', {
        claimId: invitation.claim_id,
        invitationId: invitation.id,
        openedAt: new Date().toISOString(),
      }, { triggeredBy: guest_user_id })
    } catch (err) { console.error('[AAR-814] emitEvent claim.gegner_hat_geoeffnet:', err) }
  }

  return {
    ok: true,
    guest_user_id,
    claim_id: invitation.claim_id,
    party_id: invitation.resulting_party_id ?? '',
    redirect_url: `/gegner/${token_klartext}/start`,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function enforceRateLimits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claim_id: string,
  user_id: string,
  _ip: string,
): Promise<string | null> {
  const { count: claimCount } = await supabase
    .from('airdrop_invitations')
    .select('*', { count: 'exact', head: true })
    .eq('claim_id', claim_id)
    .in('status', ['offen', 'geoeffnet', 'daten_eingegeben'])

  if ((claimCount ?? 0) >= 5) return 'RATE_LIMIT_5_PRO_CLAIM'

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: userCount } = await supabase
    .from('airdrop_invitations')
    .select('*', { count: 'exact', head: true })
    .eq('invited_by_user_id', user_id)
    .gt('invited_at', yesterday)

  if ((userCount ?? 0) >= 20) return 'RATE_LIMIT_20_PRO_USER_PRO_TAG'

  return null
}

function buildStandardMessage(schadentag: string | null): string {
  const dateStr = schadentag ? formatDate(schadentag) : 'dem kürzlichen Datum'
  return `Guten Tag,

Sie waren am ${dateStr} an einem Verkehrsunfall beteiligt. Damit Ihre Sicht des Geschehens und Ihre Daten korrekt dokumentiert werden können, möchten wir Ihnen die Möglichkeit geben, diese direkt über uns zu erfassen.

Über den folgenden Link können Sie:
• Ihre Versicherungsdaten hinterlegen
• Ihren Schadenshergang aus Ihrer Sicht schildern
• Fotos und Dokumente hochladen

Der Link ist 7 Tage lang gültig. Es entstehen Ihnen keine Kosten.

Mit freundlichen Grüßen,
Ihr Claimondo-Team`
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '').replace(/^00/, '+').replace(/^\+/, '')
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso }
}
