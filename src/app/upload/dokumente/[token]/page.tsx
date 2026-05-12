// AAR-352: Server-Component für /upload/dokumente/[token].
// Validiert Token + Status — entweder Multi-Slot-Upload-UI oder Status-Screen.
// AAR-branding-rest (2026-05-12): SV-Branding über den Token resolven und als
// 27-Var-Wrapper drumherum legen — der Kunde sieht im Upload-Link das Branding
// seines (verifizierten) SVs, nicht mehr immer Claimondo.

import { getDokumenteAnfrageStatus } from './actions'
import MultiSlotUploadClient from './MultiSlotUploadClient'
import { resolveBrandingFromUploadToken } from '@/lib/branding/token-theme'
import { generateCssVars } from '@/lib/branding/css-vars'

export default async function DokumenteUploadPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [status, branding] = await Promise.all([
    getDokumenteAnfrageStatus(token),
    resolveBrandingFromUploadToken(token),
  ])
  const brandStyle = branding.useBrand ? generateCssVars(branding.theme, 'full') : undefined

  if (!status.ok) {
    // AAR-706: Bei `already_complete` zeigen wir eine schlichte
    // Bestätigungs-Page statt einer Warn-Box mit „Bitte kontaktieren
    // Sie Ihren Ansprechpartner". Der Kunde hat seinen Job gemacht —
    // ein freundliches Danke ist die richtige Antwort.
    if (status.reason === 'already_complete') {
      return (
        <div style={brandStyle} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
          <div className="bg-white rounded-[36px] shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)] max-w-md w-full p-10 text-center space-y-4 animate-[sheetIn_.42s_cubic-bezier(.16,1,.3,1)_both]">
            <div className="text-5xl">✓</div>
            <h1 className="text-xl font-semibold text-claimondo-navy">Vielen Dank!</h1>
          </div>
        </div>
      )
    }

    const cfg =
      status.reason === 'expired'
        ? { title: 'Link abgelaufen', text: 'Dieser Upload-Link ist nicht mehr gültig. Bitte kontaktieren Sie Ihren Ansprechpartner für einen neuen Link.' }
        : { title: 'Link nicht gültig', text: 'Dieser Upload-Link ist ungültig. Bitte prüfen Sie die URL oder kontaktieren Sie Ihren Ansprechpartner.' }
    return (
      <div style={brandStyle} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-[36px] shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)] max-w-md w-full p-8 text-center space-y-3 animate-[sheetIn_.42s_cubic-bezier(.16,1,.3,1)_both]">
          <div className="text-3xl">⚠</div>
          <h1 className="text-lg font-semibold text-claimondo-navy">{cfg.title}</h1>
          <p className="text-sm text-claimondo-ondo">{cfg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={brandStyle}>
      <MultiSlotUploadClient
        token={token}
        vorname={status.vorname ?? ''}
        slots={status.slots}
      />
    </div>
  )
}
