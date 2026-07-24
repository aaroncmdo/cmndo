// Nach der Besichtigung: den Kunden aktiv bitten, DEN SACHVERSTAENDIGEN bei Google
// zu bewerten (nicht Claimondos Firmenprofil). Push-Pendant zum passiven In-Portal-
// GoogleReviewPrompt (CMM-43). Kanaele: WhatsApp (unmittelbar, ein Tap auf den
// Review-Deep-Link) + In-App-Benachrichtigung. Beide non-fatal, Sender injizierbar.
//
// Gate: der SV braucht eine profiles.google_place_id (das Bewertungsziel). Ohne ->
// kein Nudge (skip). Aufgerufen aus den beiden „durchgefuehrt"-Aktionen der Termin-
// Engine (completeBegutachtung + markTerminDurchgefuehrt), die transition-guarded
// sind -> feuert genau einmal je Termin.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendNachricht } from '@/lib/whatsapp/send'
import { getSvKontakt } from '@/lib/kunde/get-kontakt'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

// ─────────────────────────────────────────────────────────────────────────────
// Reine Builder (testbar)
// ─────────────────────────────────────────────────────────────────────────────

/** Google-Review-Deep-Link auf das EIGENE Business-Profil des SV (ein Tap = Bewertung). */
export function buildSvReviewUrl(googlePlaceId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(googlePlaceId)}`
}

/** WhatsApp-Text (nutzersichtbar — echte Umlaute). */
export function buildSvBewertungWaText(args: {
  kundeVorname?: string | null
  svName: string
  reviewUrl: string
}): string {
  const anrede = args.kundeVorname?.trim() ? `Hallo ${args.kundeVorname.trim()}` : 'Hallo'
  return [
    `${anrede}, wir hoffen, die Besichtigung mit ${args.svName} war für Sie angenehm!`,
    `Wenn Sie zufrieden waren, würden wir uns sehr über eine kurze Google-Bewertung für ${args.svName} freuen — das dauert nur einen Moment:`,
    args.reviewUrl,
    `Vielen Dank und beste Grüße\nIhr Claimondo-Team`,
  ].join('\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Kunde-Kontakt-Resolver (fall_id -> Claim -> geschaedigter_user_id/lead)
// ─────────────────────────────────────────────────────────────────────────────

export type KundeReviewKontakt = {
  userId: string | null
  vorname: string | null
  telefon: string | null
  leadId: string | null
}

/**
 * Loest den Kunden-Kontakt fuer den Review-Nudge auf: Claim (via resolveClaimId,
 * bridge-sicher) -> geschaedigter_user_id + lead_id, dann profiles (vorname/telefon)
 * mit Lead-Fallback. Service-Role-Client noetig (claims ist nicht kunde-RLS-lesbar
 * aus diesem Kontext). Gibt null zurueck, wenn kein Claim aufloesbar.
 */
export async function resolveKundeReviewKontakt(
  svc: SupabaseClient,
  fallId: string,
): Promise<KundeReviewKontakt | null> {
  const claimId = await resolveClaimId(svc, fallId)
  if (!claimId) return null

  const { data: claim } = await svc
    .from('claims')
    .select('geschaedigter_user_id, lead_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return null

  const userId = (claim.geschaedigter_user_id as string | null) ?? null
  const leadId = (claim.lead_id as string | null) ?? null
  let vorname: string | null = null
  let telefon: string | null = null

  if (userId) {
    const { data: p } = await svc
      .from('profiles')
      .select('vorname, telefon')
      .eq('id', userId)
      .maybeSingle()
    vorname = (p?.vorname as string | null) ?? null
    telefon = (p?.telefon as string | null) ?? null
  }

  // Lead-Fallback fuer accountlose Kunden bzw. fehlende Profil-Telefonnummer.
  if ((!telefon || !vorname) && leadId) {
    const { data: lead } = await svc
      .from('leads')
      .select('vorname, telefon')
      .eq('id', leadId)
      .maybeSingle()
    if (!vorname) vorname = (lead?.vorname as string | null) ?? null
    if (!telefon) telefon = (lead?.telefon as string | null) ?? null
  }

  return { userId, vorname, telefon, leadId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Notify
// ─────────────────────────────────────────────────────────────────────────────

export type NotifyKundeSvBewertenDeps = {
  getSvKontakt: typeof getSvKontakt
  resolveKundeReviewKontakt: typeof resolveKundeReviewKontakt
  sendNachricht: typeof sendNachricht
  createNotification: typeof createNotification
}

const defaultDeps: NotifyKundeSvBewertenDeps = {
  getSvKontakt,
  resolveKundeReviewKontakt,
  sendNachricht,
  createNotification,
}

export type NotifyKundeSvBewertenResult = {
  wa: boolean
  inApp: boolean
  skipped?: 'no_sv' | 'no_place_id' | 'no_kontakt'
}

/**
 * @param args.svId    sachverstaendige.id (= gutachter_termine.assignee_id bei assignee_typ='sachverstaendiger')
 * @param args.fallId  Fall des Termins
 * @param args.svc     Service-Role-Client (claims/profiles/leads-Read + Sends)
 */
export async function notifyKundeSvBewerten(
  args: { svId: string; fallId: string; svc: SupabaseClient },
  deps: NotifyKundeSvBewertenDeps = defaultDeps,
): Promise<NotifyKundeSvBewertenResult> {
  const result: NotifyKundeSvBewertenResult = { wa: false, inApp: false }

  // SV + Bewertungsziel (profiles.google_place_id via sachverstaendige.profile_id)
  const sv = await deps.getSvKontakt(args.svc as unknown as Parameters<typeof getSvKontakt>[0], args.svId)
  if (!sv) return { ...result, skipped: 'no_sv' }
  if (!sv.googlePlaceId) return { ...result, skipped: 'no_place_id' } // ohne place_id kein Ziel
  const svName = sv.name ?? 'Ihren Sachverständigen'
  const reviewUrl = buildSvReviewUrl(sv.googlePlaceId)

  const kunde = await deps.resolveKundeReviewKontakt(args.svc, args.fallId)
  if (!kunde) return { ...result, skipped: 'no_kontakt' }

  // WhatsApp — nur mit Telefon + lead-Entity (die WA-Verfuegbarkeit haengt am Lead). Non-fatal.
  if (kunde.telefon && kunde.leadId) {
    try {
      const res = await deps.sendNachricht({
        entity: 'lead',
        entityId: kunde.leadId,
        phone: kunde.telefon,
        text: buildSvBewertungWaText({ kundeVorname: kunde.vorname, svName, reviewUrl }),
        fallId: args.fallId,
        templateKey: 'sv_bewertung_kunde',
        empfaengerRolle: 'kunde',
      })
      result.wa = res.ok
    } catch (err) {
      console.warn('[notifyKundeSvBewerten] WhatsApp fehlgeschlagen (non-fatal):', err)
    }
  }

  // In-App — nur registrierter Kunde. Link fuehrt in die Fallakte (dort greift auch
  // der In-Portal-GoogleReviewPrompt). Non-fatal.
  if (kunde.userId) {
    try {
      await deps.createNotification(
        kunde.userId,
        'sv_bewertung',
        'Wie war Ihre Besichtigung?',
        `Bewerten Sie ${svName} bei Google — Ihre Rückmeldung hilft anderen Unfallgeschädigten sehr.`,
        `/kunde/faelle/${args.fallId}`,
      )
      result.inApp = true
    } catch (err) {
      console.warn('[notifyKundeSvBewerten] In-App fehlgeschlagen (non-fatal):', err)
    }
  }

  return result
}
