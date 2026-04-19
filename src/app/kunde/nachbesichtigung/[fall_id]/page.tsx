// AAR-558 (C9): Nachbesichtigungs-Picker mit fall-spezifischer Route.
// Target der WA-Template T-Nachbesichtigung; ersetzt die alte flache Route
// (die nur 1 Datum akzeptierte) durch den neuen 1-3-Slot-Picker inkl.
// SV-Konfrontations-Radio. RLS-Check via faelle_kunde_view (security_invoker).

import { createClient } from '@/lib/supabase/server'
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
      'id, fall_nummer, status, nachbesichtigung_status, nachbesichtigung_kunde_termin_vorschlaege, nachbesichtigung_kunde_termin_eingereicht_am, nachbesichtigung_sv_konfrontation_gewuenscht',
    )
    .eq('id', fall_id)
    .maybeSingle()

  if (!fall) notFound()

  const bereitsEingereicht = !!fall.nachbesichtigung_kunde_termin_eingereicht_am

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <p className="text-xs text-gray-400 mb-1">Fall {fall.fall_nummer ?? fall_id.slice(0, 8)}</p>
          <h1 className="text-2xl font-bold text-[#0D1B3E]">Nachbesichtigungs-Termin wählen</h1>
          <p className="text-sm text-gray-600 mt-2">
            Die Versicherung hat eine Nachbesichtigung angefordert. Bitte schlagen Sie 1–3 Termine vor,
            zu denen unser Sachverständiger erneut vor Ort sein kann.
          </p>
        </div>

        {bereitsEingereicht ? (
          <div className="bg-white rounded-xl border border-emerald-200 p-5 space-y-2">
            <p className="text-sm font-semibold text-emerald-900">Termine bereits eingereicht</p>
            <p className="text-xs text-gray-600">
              Ihre Vorschläge sind eingegangen. Wir melden uns, sobald ein Termin mit dem
              Sachverständigen abgestimmt ist.
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
