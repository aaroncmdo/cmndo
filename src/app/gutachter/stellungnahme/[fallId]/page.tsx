import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import StellungnahmeUpload from './StellungnahmeUpload'

export default async function StellungnahmePage({ params }: { params: Promise<{ fallId: string }> }) {
  const { fallId } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter')

  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, technische_stellungnahme_status, kuerzungs_betrag, vs_reaktion_typ, versicherung_name')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) notFound()

  if (fall.technische_stellungnahme_status !== 'beauftragt') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">
          {fall.technische_stellungnahme_status === 'hochgeladen'
            ? 'Stellungnahme bereits hochgeladen — KB-Freigabe ausstehend.'
            : fall.technische_stellungnahme_status === 'freigegeben'
            ? 'Stellungnahme wurde freigegeben.'
            : 'Keine offene Stellungnahme-Anforderung.'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Technische Stellungnahme</h1>
        <p className="text-sm text-gray-500 mt-1">Fall {fall.fall_nummer ?? fallId.slice(0, 8)}</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-800">Versicherung hat gekürzt</p>
        {fall.versicherung_name && <p className="text-xs text-amber-600">VS: {fall.versicherung_name}</p>}
        {fall.kuerzungs_betrag && (
          <p className="text-xs text-amber-700">
            Kürzungsbetrag: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(fall.kuerzungs_betrag))}
          </p>
        )}
        <p className="text-xs text-amber-600 mt-2">
          Bitte erstellen Sie eine technische Gegendarstellung zu den Einwänden der Versicherung
          (Beilackierung, UPE-Aufschläge, Kalkulation etc.)
        </p>
      </div>

      <StellungnahmeUpload fallId={fallId} />
    </div>
  )
}
