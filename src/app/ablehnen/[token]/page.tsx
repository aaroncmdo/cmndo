// AAR-134 Phase 5: Public Route für SV-Termin-Ablehnung via Email-Link.
// KEIN Login nötig — der Token IST die Auth.
import { createAdminClient } from '@/lib/supabase/admin'
import { ablehneFromForm } from './_actions'

export const dynamic = 'force-dynamic'

export default async function AblehnenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error: errorParam } = await searchParams

  const adminDb = createAdminClient()
  const { data: termin } = await adminDb
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, ablehnen_token_expires_at, sv_id, fall_id, lead_id')
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) {
    return <ErrorBox title="Link ungültig" message="Der Link existiert nicht oder ist nicht mehr gültig." />
  }
  const expired =
    termin.ablehnen_token_expires_at &&
    new Date(termin.ablehnen_token_expires_at).getTime() < Date.now()
  if (expired) {
    return (
      <ErrorBox
        title="Link abgelaufen"
        message="Bitte loggen Sie sich ins Portal ein und lehnen Sie den Termin dort ab."
      />
    )
  }
  if (!['reserviert', 'bestaetigt'].includes(termin.status)) {
    return (
      <ErrorBox
        title="Termin nicht änderbar"
        message={`Der Termin ist bereits im Status "${termin.status}". Keine Aktion mehr möglich.`}
      />
    )
  }

  // Kontext-Info
  let svVorname = 'Sachverständiger'
  if (termin.sv_id) {
    const { data: sv } = await adminDb.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
    if (sv?.profile_id) {
      const { data: p } = await adminDb.from('profiles').select('vorname').eq('id', sv.profile_id).single()
      if (p?.vorname) svVorname = p.vorname
    }
  }
  let kundenName = '—'
  if (termin.fall_id) {
    const { data: f } = await adminDb.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
    if (f?.lead_id) {
      const { data: l } = await adminDb.from('leads').select('vorname, nachname').eq('id', f.lead_id).single()
      if (l) kundenName = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
    }
  } else if (termin.lead_id) {
    const { data: l } = await adminDb.from('leads').select('vorname, nachname').eq('id', termin.lead_id).single()
    if (l) kundenName = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
  }

  const tDate = new Date(termin.start_zeit)
  const datum = tDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const uhrzeit = tDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Termin ablehnen</h1>
        <p className="text-sm text-gray-600 mb-4">
          Hallo {svVorname}, du kannst diesen Termin mit einem Klick ablehnen — der Dispatcher wird sofort informiert.
        </p>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm space-y-1">
          <p><span className="text-gray-500">Datum:</span> <strong className="text-gray-900">{datum}</strong></p>
          <p><span className="text-gray-500">Uhrzeit:</span> <strong className="text-gray-900">{uhrzeit} Uhr</strong></p>
          <p><span className="text-gray-500">Kunde:</span> <strong className="text-gray-900">{kundenName}</strong></p>
        </div>

        {errorParam && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
            {errorParam}
          </div>
        )}

        <form action={ablehneFromForm} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <textarea
            name="grund"
            placeholder="Grund für die Ablehnung (min. 10 Zeichen)..."
            rows={4}
            required
            minLength={10}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#4573A2]"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white"
          >
            Termin ablehnen
          </button>
          <p className="text-[10px] text-gray-500 text-center">
            Du erhältst keine weitere Bestätigung — der Dispatcher übernimmt ab hier.
          </p>
        </form>
      </div>
    </div>
  )
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}
