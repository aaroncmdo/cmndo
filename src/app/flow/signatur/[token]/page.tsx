import { createServiceClient } from '@/lib/supabase/server'
import { resolveFlowLocale } from '@/lib/i18n/resolve-flow-locale'
import { loadMessages } from '@/i18n/load-messages'
import { NextIntlClientProvider } from 'next-intl'
import SignaturPage from './SignaturPage'
import { resolveBrandingFromFallId } from '@/lib/branding/token-theme'
import { generateCssVars } from '@/lib/branding/css-vars'

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // token ist eine faelle.id (UUID) — CMM-49: sprache via v_claim_full (lead_id, faelle-frei) -> leads.
  const svc = createServiceClient()
  const { data: fall } = await svc
    .from('v_claim_full')
    .select('lead_id')
    .eq('fall_id', token)
    .maybeSingle()
  let sprache: string | null = null
  if (fall?.lead_id) {
    const { data: leadRow } = await svc.from('leads').select('sprache').eq('id', fall.lead_id).maybeSingle()
    sprache = (leadRow?.sprache as string | null) ?? null
  }

  const flowLocale = resolveFlowLocale(null, sprache)
  const flowMessages = await loadMessages(flowLocale)

  // Whitelabel: Signatur-Route brandet jetzt wie /flow + /upload/* (Token = faelle.id).
  // Legal-Texte bleiben "Claimondo GmbH" (Abtretungs-Empfaenger) — nur Farb-Chrome brandet.
  const branding = await resolveBrandingFromFallId(token)
  const brandStyle = branding.useBrand ? generateCssVars(branding.theme, 'full') : undefined

  return (
    <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <SignaturPage fallId={token} />
      </NextIntlClientProvider>
    </div>
  )
}
