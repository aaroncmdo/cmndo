// AAR-296 W1: Server-Component für /upload/zb1/[token].
// Validiert Token + Status — entweder Upload-UI oder Status-Screen.

import { getZb1TokenStatus } from './actions'
import Zb1UploadClient from './Zb1UploadClient'
// AAR-branding-rest: SV-Branding über den ZB1-Token resolven → 27-Var-Wrapper
import { resolveBrandingFromZb1Token } from '@/lib/branding/token-theme'
import { generateCssVars } from '@/lib/branding/css-vars'

export default async function Zb1UploadPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [status, branding] = await Promise.all([
    getZb1TokenStatus(token),
    resolveBrandingFromZb1Token(token),
  ])
  const brandStyle = branding.useBrand ? generateCssVars(branding.theme, 'full') : undefined

  if (!status.ok) {
    const cfg =
      status.reason === 'expired'
        ? { title: 'Link abgelaufen', text: 'Dieser Upload-Link ist nicht mehr gültig. Bitte kontaktieren Sie Ihren Ansprechpartner für einen neuen Link.' }
        : status.reason === 'already_uploaded'
          ? { title: 'Foto bereits empfangen', text: 'Wir haben Ihren Fahrzeugschein bereits erhalten. Falls Sie ein neues Foto schicken möchten, kontaktieren Sie bitte Ihren Ansprechpartner.' }
          : { title: 'Link nicht gültig', text: 'Dieser Upload-Link ist ungültig. Bitte prüfen Sie die URL oder kontaktieren Sie Ihren Ansprechpartner.' }
    return (
      <div style={brandStyle} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border max-w-md w-full p-8 text-center space-y-3">
          <div className="text-3xl">⚠</div>
          <h1 className="text-lg font-semibold text-claimondo-navy">{cfg.title}</h1>
          <p className="text-sm text-claimondo-ondo">{cfg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={brandStyle}>
      <Zb1UploadClient token={token} vorname={status.vorname ?? ''} />
    </div>
  )
}
