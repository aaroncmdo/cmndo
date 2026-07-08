// (3) Partner-Onboarding-Termine — reine Helper (Titel/Beschreibung/Endzeit/ICS/Anzeige).
// Impure Orchestrierung (Google Meet, Geocode, Mailversand) liegt in der Server-Action
// bzw. in flows.ts. Diese Datei bleibt pure/isomorphic (auch vom Client importierbar).
import { buildIcs } from '@/lib/ical'

export type OnboardingTerminKanal = 'online' | 'vor_ort'

export type OnboardingTerminInput = {
  startIso: string
  kanal: OnboardingTerminKanal
  treffpunktAdresse?: string | null
}

/** admin_termine-Zeile (typ='partner_onboarding') wie der Drawer sie anzeigt. */
export type PartnerOnboardingTerminRow = {
  id: string
  partner_lead_id: string
  start_zeit: string
  end_zeit: string | null
  kanal: OnboardingTerminKanal | null
  video_link: string | null
  treffpunkt_adresse: string | null
  status: string | null
  titel: string
}

export const ONBOARDING_TERMIN_DAUER_MIN = 30

export function berechneEndzeit(startIso: string, dauerMinuten = ONBOARDING_TERMIN_DAUER_MIN): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) throw new Error('Ungueltiges Startdatum')
  return new Date(start.getTime() + dauerMinuten * 60 * 1000).toISOString()
}

export function baueTerminTitel(firma: string | null): string {
  const name = (firma ?? '').trim()
  return name ? `Onboarding: ${name}` : 'Partner-Onboarding'
}

export function baueTerminBeschreibung(input: {
  kanal: OnboardingTerminKanal
  videoLink?: string | null
  treffpunktAdresse?: string | null
}): string {
  if (input.kanal === 'online') {
    return input.videoLink
      ? `Video-Onboarding via Google Meet: ${input.videoLink}`
      : 'Video-Onboarding (Google-Meet-Link folgt).'
  }
  return input.treffpunktAdresse
    ? `Onboarding vor Ort: ${input.treffpunktAdresse}`
    : 'Onboarding vor Ort.'
}

export function formatTerminZeitpunkt(startIso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(startIso))
}

export function baueTerminAktivitaetText(startIso: string, kanal: OnboardingTerminKanal): string {
  const wann = formatTerminZeitpunkt(startIso)
  const wie = kanal === 'online' ? 'Video' : 'vor Ort'
  return `Onboarding-Termin angelegt: ${wann} (${wie}).`
}

export function baueOnboardingIcs(input: {
  terminId: string
  firma: string | null
  kanal: OnboardingTerminKanal
  startIso: string
  endIso: string
  videoLink: string | null
  treffpunktAdresse: string | null
}): string {
  return buildIcs({
    uid: `partner-onboarding-${input.terminId}`,
    summary: baueTerminTitel(input.firma),
    description: baueTerminBeschreibung({
      kanal: input.kanal,
      videoLink: input.videoLink,
      treffpunktAdresse: input.treffpunktAdresse,
    }),
    location: input.kanal === 'online'
      ? (input.videoLink ?? undefined)
      : (input.treffpunktAdresse ?? undefined),
    startsAt: new Date(input.startIso),
    endsAt: new Date(input.endIso),
    organizerName: 'Claimondo',
    organizerEmail: 'no-reply@claimondo.de',
  })
}
