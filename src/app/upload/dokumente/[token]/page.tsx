// AAR-352: Server-Component für /upload/dokumente/[token].
// Validiert Token + Status — entweder Multi-Slot-Upload-UI oder Status-Screen.
// AAR-branding-rest (2026-05-12): SV-Branding über den Token resolven und als
// 27-Var-Wrapper drumherum legen — der Kunde sieht im Upload-Link das Branding
// seines (verifizierten) SVs, nicht mehr immer Claimondo.

import { getDokumenteAnfrageStatus } from './actions'
import MultiSlotUploadClient from './MultiSlotUploadClient'
import { resolveBrandingFromUploadToken } from '@/lib/branding/token-theme'
import { generateCssVars } from '@/lib/branding/css-vars'
import { SheetCard } from '@/components/shared/SheetCard'
import { NextIntlClientProvider } from 'next-intl'
import { resolveFlowLocale } from '@/lib/i18n/resolve-flow-locale'
import { loadMessages } from '@/i18n/load-messages'
import { getTranslations } from 'next-intl/server'

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

  // Sprache aus dem Token-Lookup auflösen (kein flow_links-Token hier)
  const flowLocale = resolveFlowLocale(null, status.sprache ?? null)
  const flowMessages = await loadMessages(flowLocale)
  const t = await getTranslations({ locale: flowLocale, namespace: 'upload.dokumente' })

  if (!status.ok) {
    // AAR-706: Bei `already_complete` zeigen wir eine schlichte
    // Bestätigungs-Page statt einer Warn-Box mit „Bitte kontaktieren
    // Sie Ihren Ansprechpartner". Der Kunde hat seinen Job gemacht —
    // ein freundliches Danke ist die richtige Antwort.
    if (status.reason === 'already_complete') {
      return (
        <div style={brandStyle} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
          <SheetCard className="text-center space-y-4">
            <div className="text-5xl">✓</div>
            <h1 className="text-xl font-semibold text-claimondo-navy">{t('alreadyCompleteTitle')}</h1>
          </SheetCard>
        </div>
      )
    }

    const cfg =
      status.reason === 'expired'
        ? { title: t('errorExpiredTitle'), text: t('errorExpiredBody') }
        : { title: t('errorInvalidTitle'), text: t('errorInvalidBody') }
    return (
      <div style={brandStyle} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
        <SheetCard padding="md" className="text-center space-y-3">
          <div className="text-3xl">⚠</div>
          <h1 className="text-lg font-semibold text-claimondo-navy">{cfg.title}</h1>
          <p className="text-sm text-claimondo-ondo">{cfg.text}</p>
        </SheetCard>
      </div>
    )
  }

  return (
    <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <MultiSlotUploadClient
          token={token}
          vorname={status.vorname ?? ''}
          slots={status.slots}
        />
      </NextIntlClientProvider>
    </div>
  )
}
