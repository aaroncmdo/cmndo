// AAR-296 W1: Server-Component für /upload/zb1/[token].
// Validiert Token + Status — entweder Upload-UI oder Status-Screen.

import { getZb1TokenStatus } from './actions'
import Zb1UploadClient from './Zb1UploadClient'
// AAR-branding-rest: SV-Branding über den ZB1-Token resolven → 27-Var-Wrapper
import { resolveBrandingFromZb1Token } from '@/lib/branding/token-theme'
import { generateCssVars } from '@/lib/branding/css-vars'
import { NextIntlClientProvider } from 'next-intl'
import { resolveFlowLocale } from '@/lib/i18n/resolve-flow-locale'
import { loadMessages } from '@/i18n/load-messages'
import { getTranslations } from 'next-intl/server'

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

  // Sprache aus dem Token-Lookup auflösen (kein flow_links-Token hier)
  const flowLocale = resolveFlowLocale(null, status.sprache ?? null)
  const flowMessages = await loadMessages(flowLocale)
  const t = await getTranslations({ locale: flowLocale, namespace: 'upload.zb1' })

  if (!status.ok) {
    const cfg =
      status.reason === 'expired'
        ? { title: t('errorExpiredTitle'), text: t('errorExpiredBody') }
        : status.reason === 'already_uploaded'
          ? { title: t('errorAlreadyTitle'), text: t('errorAlreadyBody') }
          : { title: t('errorInvalidTitle'), text: t('errorInvalidBody') }
    return (
      <div style={brandStyle} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-ios-md shadow-sm border border-claimondo-border max-w-md w-full p-8 text-center space-y-3">
          <div className="text-3xl">⚠</div>
          <h1 className="text-lg font-semibold text-claimondo-navy">{cfg.title}</h1>
          <p className="text-sm text-claimondo-ondo">{cfg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <Zb1UploadClient token={token} vorname={status.vorname ?? ''} />
      </NextIntlClientProvider>
    </div>
  )
}
