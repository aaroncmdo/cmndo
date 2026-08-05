// SPIEGEL von src/lib/partner/notify-team-signup.ts (Haupt-App) — die Marketing-App
// ist ein eigener Build ohne Zugriff auf src/. Aenderungen in beiden Files nachziehen.
//
// Team-WhatsApp bei neuer Partner-Registrierung aus dem Marketing-Funnel
// (hier: der LP-embedded SV-Claim-Flow auf claimondo.de/gutachter-partner).
// Aaron-Direktive 2026-08-05 — analog zum Lead-Notify (Direktive 2026-05-20).
//
// Non-throwing + fire-and-forget: die Funktion wirft NIE — Caller brauchen KEIN
// eigenes try/catch. Interne/Test-Identitaeten (@claimondo.de, example.*,
// test/smoke/e2e-Marker) loesen KEINE Team-WA aus (interne-identitaet.ts).

import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import { istInterneIdentitaet } from '@/lib/testdaten/interne-identitaet'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export type PartnerSignupTyp = 'werkstatt' | 'makler' | 'gutachter'

const TYP_EMOJI: Record<PartnerSignupTyp, string> = {
  werkstatt: '🔧',
  makler: '🤝',
  gutachter: '📋',
}

const TYP_LABEL: Record<PartnerSignupTyp, string> = {
  werkstatt: 'Werkstatt',
  makler: 'Makler',
  gutachter: 'Gutachter',
}

export interface NotifyTeamPartnerSignupOpts {
  typ: PartnerSignupTyp
  /** 'registrierung' = aktiver Account entstanden · 'anfrage' = Interesse-Prospect (partner_leads). */
  art: 'registrierung' | 'anfrage'
  /** Human-readable Quelle, z.B. "claimondo.de/gutachter-partner (LP-Karten-Claim)". */
  quelle: string
  firma?: string | null
  /** Ansprechpartner "Vorname Nachname". */
  name?: string | null
  email?: string | null
  telefon?: string | null
  /** "PLZ Ort" — oder was vorhanden ist. */
  ort?: string | null
  /** Admin-Pfad fuer den Link am Ende, z.B. "/admin/sachverstaendige/basic-freigaben". */
  adminPfad: string
  /** Zusatzzeilen ("• Label: Wert"); leere Werte werden gefiltert. */
  extraFields?: { label: string; value: string | null | undefined }[]
}

export async function notifyTeamPartnerSignup(opts: NotifyTeamPartnerSignupOpts): Promise<void> {
  try {
    if (istInterneIdentitaet(opts.email, opts.name ?? opts.firma)) {
      console.log(
        `[notify-team-signup] interne/Test-Identitaet (${opts.email ?? opts.firma}) — Team-WA unterdrueckt`,
      )
      return
    }
    const artLabel = opts.art === 'anfrage' ? 'Partner-Anfrage' : 'Registrierung'
    const extras = (opts.extraFields ?? []).filter(
      (f) => f.value != null && String(f.value).trim() !== '',
    )
    const lines = [
      `🆕 Neue ${TYP_LABEL[opts.typ]}-${artLabel}`,
      `Quelle: ${opts.quelle}`,
      ``,
      opts.firma ? `${TYP_EMOJI[opts.typ]} ${opts.firma}` : null,
      opts.name ? `👤 ${opts.name}` : null,
      opts.telefon ? `📞 ${opts.telefon}` : null,
      opts.email ? `✉️ ${opts.email}` : null,
      opts.ort ? `📍 ${opts.ort}` : null,
      ...extras.map((f) => `• ${f.label}: ${String(f.value).trim()}`),
      ``,
      `${APP_BASE_URL}${opts.adminPfad}`,
    ].filter((l): l is string => l !== null)
    await notifyTeamWhatsApp(lines.join('\n'))
  } catch (err) {
    console.error('[notify-team-signup] Team-WA fehlgeschlagen (non-critical):', (err as Error).message)
  }
}
