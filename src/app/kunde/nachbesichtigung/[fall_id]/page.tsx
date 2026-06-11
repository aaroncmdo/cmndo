// AAR-558 (C9): Nachbesichtigungs-Picker mit fall-spezifischer Route.
// Target der WA-Template T-Nachbesichtigung; ersetzt die alte flache Route
// (die nur 1 Datum akzeptierte) durch den neuen 1-3-Slot-Picker inkl.
// SV-Konfrontations-Radio. RLS-Check via faelle_kunde_view (security_invoker).

import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import NachbesichtigungPickerClient from './NachbesichtigungPickerClient'

export default async function NachbesichtigungPickerPage({
  params,
}: {
  params: Promise<{ fall_id: string }>
}) {
  const { fall_id } = await params

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect(`/login?redirect=/kunde/nachbesichtigung/${fall_id}`)

  // faelle_kunde_view nutzt security_invoker → erbt faelle-RLS
  const { data: fall } = await supabase
    .from('faelle_kunde_view')
    .select(
      'id, claim_nummer, status, nachbesichtigung_status, nachbesichtigung_kunde_termin_vorschlaege, nachbesichtigung_kunde_termin_eingereicht_am, nachbesichtigung_sv_konfrontation_gewuenscht',
    )
    .eq('id', fall_id)
    .maybeSingle()

  if (!fall) notFound()

  const t = await getTranslations('kunde.settings')
  const bereitsEingereicht = !!fall.nachbesichtigung_kunde_termin_eingereicht_am

  return (
    <div className="min-h-screen bg-claimondo-bg py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <p className="text-xs text-claimondo-ondo/70 mb-1">{t('nachbesichtigungPicker.fallLabel', { nummer: fall.claim_nummer ?? fall_id.slice(0, 8) })}</p>
          <h1 className="text-2xl font-bold text-claimondo-navy">{t('nachbesichtigungPicker.title')}</h1>
          <p className="text-sm text-claimondo-ondo mt-2">
            {t('nachbesichtigungPicker.intro')}
          </p>
        </div>

        {bereitsEingereicht ? (
          <div className="bg-white rounded-ios-xl border border-success/30 p-5 space-y-2">
            <p className="text-sm font-semibold text-success-strong">{t('nachbesichtigungPicker.bereitsTitle')}</p>
            <p className="text-xs text-claimondo-ondo">
              {t('nachbesichtigungPicker.bereitsBody')}
            </p>
          </div>
        ) : (
          <NachbesichtigungPickerClient
            fallId={fall.id as string}
            initialKonfrontation={
              typeof fall.nachbesichtigung_sv_konfrontation_gewuenscht === 'boolean'
                ? fall.nachbesichtigung_sv_konfrontation_gewuenscht
                : null
            }
          />
        )}
      </div>
    </div>
  )
}
