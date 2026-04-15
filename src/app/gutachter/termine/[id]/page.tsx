import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TerminDetailActions from './TerminDetailActions'
import PolizeiberichtUpload from './PolizeiberichtUpload'

// KFZ-200: Termin-Detail-Seite mit "Navigation starten"-Button.
// AAR-126: Vor-Ort-Polizeibericht-Upload wenn polizei_vor_ort=true und Bericht fehlt.

export const dynamic = 'force-dynamic'

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  const db = (await import('@/lib/supabase/admin')).createAdminClient()

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit, end_zeit, status, navigation_started_at, sv_angekommen_am, durchgefuehrt_am, sv_eta_minuten, sv_unterwegs_seit')
    .eq('id', id)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) redirect('/gutachter/termine')

  // Fall + Lead laden — AAR-126: polizei_vor_ort + polizei_aktenzeichen mitladen
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, lead_id, besichtigungsort_adresse, schadens_adresse, schadens_plz, schadens_ort, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, polizei_vor_ort, polizei_aktenzeichen')
    .eq('id', termin.fall_id)
    .single()

  // AAR-126: Polizeibericht-Status prüfen
  let polizeiberichtHochgeladen = false
  if (fall?.polizei_vor_ort === true) {
    const { data: docs } = await db
      .from('pflichtdokumente')
      .select('dokument_url')
      .eq('fall_id', fall.id)
      .eq('dokument_typ', 'polizeibericht')
      .limit(1)
    polizeiberichtHochgeladen = !!docs?.[0]?.dokument_url
  }

  let lead: { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null = null
  if (fall?.lead_id) {
    const { data: l } = await db
      .from('leads')
      .select('vorname, nachname, telefon, email')
      .eq('id', fall.lead_id)
      .single()
    lead = l
  }

  const adresse = fall?.besichtigungsort_adresse
    ?? [fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort].filter(Boolean).join(', ')
    ?? '—'

  const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const uhrzeit = new Date(termin.start_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/gutachter/termine" className="text-sm text-[#4573A2] hover:underline">← Alle Termine</Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900">
        {datum} · {uhrzeit}
      </h1>
      <p className="text-sm text-gray-500 -mt-3">Fall {fall?.fall_nummer ?? id.slice(0, 8)}</p>

      {/* Kunden-Info-Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide text-[11px]">Kunden-Infos</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Name</p>
            <p className="font-medium text-gray-900">
              {[lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || '—'}
            </p>
          </div>
          {lead?.telefon && (
            <div>
              <p className="text-xs text-gray-400">Telefon</p>
              <a href={`tel:${lead.telefon}`} className="font-medium text-[#4573A2] hover:underline">{lead.telefon}</a>
            </div>
          )}
          {lead?.email && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400">E-Mail</p>
              <p className="font-medium text-gray-900">{lead.email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Vorab-Infos-Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide text-[11px]">Vorab-Infos</h2>
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-gray-400">Adresse</p>
            <p className="font-medium text-gray-900">{adresse}</p>
          </div>
          {(fall?.fahrzeug_hersteller || fall?.fahrzeug_modell) && (
            <div>
              <p className="text-xs text-gray-400">Fahrzeug</p>
              <p className="font-medium text-gray-900">
                {[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')}
                {fall.kennzeichen ? ` · ${fall.kennzeichen}` : ''}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Termin-Status</p>
            <p className="font-medium text-gray-900 capitalize">{termin.status}</p>
          </div>
        </div>
      </div>

      {/* AAR-126: Vor-Ort einzuholen — Polizeibericht wenn polizei_vor_ort=true und Kunde noch nicht hochgeladen */}
      {fall?.polizei_vor_ort === true && !polizeiberichtHochgeladen && (
        <PolizeiberichtUpload
          fallId={fall.id}
          bereitsBekanntesAktenzeichen={fall.polizei_aktenzeichen ?? null}
        />
      )}

      {/* Navigation / Vor-Ort Actions */}
      <TerminDetailActions
        terminId={id}
        navigationStartedAt={termin.navigation_started_at ?? null}
        svAngekommen={!!termin.sv_angekommen_am}
        durchgefuehrt={!!termin.durchgefuehrt_am}
        adresse={adresse}
      />

    </div>
  )
}
