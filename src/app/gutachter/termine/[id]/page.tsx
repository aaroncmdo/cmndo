import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TerminDetailActions from './TerminDetailActions'
import PolizeiberichtUpload from './PolizeiberichtUpload'
import PhoneButton from '@/components/shared/PhoneButton'

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

  // AAR-133: lead_id mitlesen — Termin kann pre-FlowLink sein (lead_id ohne fall_id)
  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, sv_id, start_zeit, end_zeit, status, navigation_started_at, sv_angekommen_am, durchgefuehrt_am, sv_eta_minuten, sv_unterwegs_seit')
    .eq('id', id)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) redirect('/gutachter/termine')

  // AAR-133: zwei Code-Pfade — Fall-Termin (klassisch) vs. Pre-FlowLink-Reservierung
  type FallRow = {
    id: string
    fall_nummer: string | null
    lead_id: string | null
    besichtigungsort_adresse: string | null
    schadens_adresse: string | null
    schadens_plz: string | null
    schadens_ort: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    kennzeichen: string | null
    polizei_vor_ort: boolean | null
    polizei_aktenzeichen: string | null
  }
  type LeadRow = {
    vorname: string | null
    nachname: string | null
    telefon: string | null
    email: string | null
    kunde_strasse?: string | null
    kunde_plz?: string | null
    unfallort?: string | null
    fahrzeug_hersteller?: string | null
    fahrzeug_modell?: string | null
    kennzeichen?: string | null
  }

  let fall: FallRow | null = null
  let lead: LeadRow | null = null
  const istVorreservierung = !termin.fall_id && !!termin.lead_id

  if (termin.fall_id) {
    const { data: f } = await db
      .from('faelle')
      .select('id, fall_nummer, lead_id, besichtigungsort_adresse, schadens_adresse, schadens_plz, schadens_ort, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, polizei_vor_ort, polizei_aktenzeichen')
      .eq('id', termin.fall_id)
      .single()
    fall = f
    if (f?.lead_id) {
      const { data: l } = await db
        .from('leads')
        .select('vorname, nachname, telefon, email')
        .eq('id', f.lead_id)
        .single()
      lead = l
    }
  } else if (termin.lead_id) {
    // Pre-FlowLink: nur Lead, kein Fall
    const { data: l } = await db
      .from('leads')
      .select('vorname, nachname, telefon, email, kunde_strasse, kunde_plz, unfallort, fahrzeug_hersteller, fahrzeug_modell, kennzeichen')
      .eq('id', termin.lead_id)
      .single()
    lead = l
  }

  // AAR-126: Polizeibericht-Status nur prüfen wenn Fall existiert
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

  // Adresse-Fallback-Kette: Fall-Adresse → Lead-Adresse → "—"
  // joinNonEmpty: leeres Array → undefined statt '' damit ?? korrekt fällt.
  const joinNonEmpty = (parts: (string | null | undefined)[]) => {
    const s = parts.filter(Boolean).join(', ')
    return s || undefined
  }
  const adresse =
    fall?.besichtigungsort_adresse ??
    (fall ? joinNonEmpty([fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]) : undefined) ??
    (lead ? lead.unfallort ?? joinNonEmpty([lead.kunde_strasse, lead.kunde_plz]) : undefined) ??
    '—'

  // Fahrzeug-Info kann auch vom Lead kommen
  const fahrzeugHersteller = fall?.fahrzeug_hersteller ?? lead?.fahrzeug_hersteller ?? null
  const fahrzeugModell = fall?.fahrzeug_modell ?? lead?.fahrzeug_modell ?? null
  const kennzeichen = fall?.kennzeichen ?? lead?.kennzeichen ?? null
  const referenzLabel = fall?.fall_nummer
    ? `Fall ${fall.fall_nummer}`
    : termin.lead_id
      ? `Lead ${termin.lead_id.slice(0, 8)}`
      : id.slice(0, 8)

  const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const uhrzeit = new Date(termin.start_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/gutachter/termine" className="text-sm text-[var(--brand-secondary)] hover:underline">← Alle Termine</Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900">
        {datum} · {uhrzeit}
      </h1>
      <p className="text-sm text-gray-500 -mt-3">{referenzLabel}</p>

      {/* AAR-133: Vorreservierung-Badge wenn Pre-FlowLink (kein Fall) */}
      {istVorreservierung && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-3">
          <p className="text-sm font-semibold text-amber-900">Vorreservierung</p>
          <p className="text-xs text-amber-700 mt-1">
            Der Kunde hat die Sicherungsabtretung noch nicht unterschrieben. Bitte warten bis der Termin
            offiziell bestätigt wird — du erhältst dann eine zweite Mail. Bis dahin: nicht anfahren.
          </p>
        </div>
      )}

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
              <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} className="!font-medium !text-[var(--brand-secondary)] hover:!underline" />
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
          {(fahrzeugHersteller || fahrzeugModell) && (
            <div>
              <p className="text-xs text-gray-400">Fahrzeug</p>
              <p className="font-medium text-gray-900">
                {[fahrzeugHersteller, fahrzeugModell].filter(Boolean).join(' ')}
                {kennzeichen ? ` · ${kennzeichen}` : ''}
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

      {/* Navigation / Vor-Ort Actions + AAR-134 Ablehnen/Gegenvorschlag */}
      <TerminDetailActions
        terminId={id}
        navigationStartedAt={termin.navigation_started_at ?? null}
        svAngekommen={!!termin.sv_angekommen_am}
        durchgefuehrt={!!termin.durchgefuehrt_am}
        adresse={adresse}
        status={termin.status}
      />

    </div>
  )
}
