import { createServiceClient } from '@/lib/supabase/server'
import { resolveFlowLocale } from '@/lib/i18n/resolve-flow-locale'
import { loadMessages } from '@/i18n/load-messages'
import { NextIntlClientProvider } from 'next-intl'
import SignaturPage from './SignaturPage'

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // token ist eine faelle.id (UUID) — sprache via faelle -> leads holen
  const svc = createServiceClient()
  const { data: fall } = await svc
    .from('faelle')
    .select('lead_id, leads!faelle_lead_id_fkey(sprache)')
    .eq('id', token)
    .maybeSingle()

  const leadsJoin = fall?.leads as unknown
  const leadsRow = Array.isArray(leadsJoin) ? leadsJoin[0] : leadsJoin
  const sprache = (leadsRow as { sprache: string | null } | null)?.sprache ?? null

  const flowLocale = resolveFlowLocale(null, sprache)
  const flowMessages = await loadMessages(flowLocale)

  return (
    <div dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <SignaturPage fallId={token} />
      </NextIntlClientProvider>
    </div>
  )
}
