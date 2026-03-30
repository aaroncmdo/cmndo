import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// ─── Status pipeline for the progress bar ────────────────────────────────────

const STATUS_STEPS = [
  { key: 'ersterfassung', label: 'Erfasst' },
  { key: 'sv-zugewiesen', label: 'Gutachter' },
  { key: 'gutachten-eingegangen', label: 'Gutachten' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei' },
  { key: 'regulierung', label: 'Regulierung' },
  { key: 'abgeschlossen', label: 'Abgeschlossen' },
]

const STATUS_TO_STEP: Record<string, string> = {
  ersterfassung: 'ersterfassung',
  'sv-zugewiesen': 'sv-zugewiesen',
  'sv-termin': 'sv-zugewiesen',
  'gutachten-eingegangen': 'gutachten-eingegangen',
  filmcheck: 'gutachten-eingegangen',
  'kanzlei-uebergeben': 'kanzlei-uebergeben',
  anschlussschreiben: 'kanzlei-uebergeben',
  regulierung: 'regulierung',
  abgeschlossen: 'abgeschlossen',
  storniert: 'storniert',
}

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschadigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiss',
  sonstiges: 'Sonstiges',
}

function getStepIndex(status: string): number {
  const mapped = STATUS_TO_STEP[status] ?? status
  const idx = STATUS_STEPS.findIndex(s => s.key === mapped)
  return idx >= 0 ? idx : 0
}

export default async function KundeDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Primary: fetch case by kunde_id
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_ort, schadens_adresse, schadens_plz, onboarding_complete, sv_id, created_at, kundenbetreuer_id')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Redirect to onboarding if not completed
  if (fall && fall.onboarding_complete === false) {
    redirect(`/kunde/onboarding/${fall.id}`)
  }

  // Fallback: also check by lead email for backwards compatibility
  let faelle: NonNullable<typeof fall>[] = fall ? [fall] : []
  if (!fall) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('email', user.email!)
    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length) {
      const { data } = await supabase
        .from('faelle')
        .select('id, fall_nummer, status, schadens_ursache, schadens_ort, schadens_adresse, schadens_plz, onboarding_complete, sv_id, created_at, kundenbetreuer_id')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      faelle = data ?? []
    }
  }

  // If we have exactly one case, show detailed dashboard
  if (faelle.length === 1) {
    const singleFall = faelle[0]!
    return <SingleCaseDashboard fall={singleFall} supabase={supabase} />
  }

  // Multi-case list
  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white mb-1">Meine Falle</h1>
          <p className="text-zinc-500 text-sm">
            {faelle.length
              ? `${faelle.length} ${faelle.length === 1 ? 'Fall' : 'Falle'}`
              : 'Ubersicht Ihrer Schadensfalle'}
          </p>
        </div>

        {!faelle.length ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
            <div className="text-zinc-600 text-4xl mb-4">📋</div>
            <h3 className="text-white font-medium mb-1">Noch keine Falle</h3>
            <p className="text-zinc-500 text-sm">
              Sobald ein Schadensfall fur Sie angelegt wird, erscheint er hier.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {faelle.map(f => {
              const currentStep = getStepIndex(f.status)
              const isStorniert = f.status === 'storniert'
              return (
                <Link
                  key={f.id}
                  href={`/kunde/fall/${f.id}`}
                  className="block bg-zinc-900 rounded-2xl p-5 border border-zinc-800 hover:border-zinc-600 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-blue-400 font-mono text-xs group-hover:text-blue-300 transition-colors">
                        {f.fall_nummer ?? f.id.slice(0, 8)}
                      </span>
                      <p className="text-white font-medium text-sm mt-0.5">
                        {URSACHE_LABEL[f.schadens_ursache ?? ''] ?? 'Schadensfall'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {f.schadens_ort && <p className="text-zinc-500 text-xs">{f.schadens_ort}</p>}
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {new Date(f.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  {isStorniert ? (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-red-950" />
                      <span className="text-red-400 text-xs font-medium">Storniert</span>
                    </div>
                  ) : (
                    <ProgressBar currentStep={currentStep} />
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Single-case detailed dashboard ──────────────────────────────────────────

async function SingleCaseDashboard({ fall, supabase }: { fall: Record<string, unknown>; supabase: Awaited<ReturnType<typeof createClient>> }) {
  const fallId = fall.id as string
  const currentStep = getStepIndex(fall.status as string)
  const isStorniert = fall.status === 'storniert'

  // Fetch related data in parallel
  const [
    { data: dokumente },
    { data: nachrichten },
    betreuerResult,
  ] = await Promise.all([
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('timeline')
      .select('id, typ, titel, beschreibung, created_at')
      .eq('fall_id', fallId)
      .in('typ', ['kunde-nachricht', 'claimondo-antwort'])
      .order('created_at', { ascending: false })
      .limit(3),
    // Kundenbetreuer (NOT the SV / Leadbearbeiter)
    (fall as Record<string, unknown>).kundenbetreuer_id
      ? supabase
          .from('profiles')
          .select('vorname, nachname, email, telefon')
          .eq('id', (fall as Record<string, unknown>).kundenbetreuer_id as string)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const betreuer = betreuerResult.data as { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null } | null

  // Determine next steps based on status
  const nextSteps = getNextSteps(fall.status as string)

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Case header */}
        <div className="mb-2">
          <h1 className="text-2xl font-semibold text-white mb-1">
            {URSACHE_LABEL[(fall.schadens_ursache as string) ?? ''] ?? 'Mein Schadensfall'}
          </h1>
          <p className="text-zinc-500 text-sm">
            Fall {(fall.fall_nummer as string) ?? (fall.id as string).slice(0, 8)}
            {fall.schadens_ort ? ` · ${fall.schadens_ort}` : ''}
          </p>
        </div>

        {/* Storniert banner */}
        {isStorniert && (
          <div className="bg-red-950 border border-red-800 rounded-2xl p-5">
            <p className="text-red-300 font-medium text-sm">Dieser Fall wurde storniert.</p>
          </div>
        )}

        {/* Status progress bar */}
        {!isStorniert && (
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">Fallstatus</h3>
            <ProgressBar currentStep={currentStep} />
          </div>
        )}

        {/* Next steps */}
        {nextSteps.length > 0 && (
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Nachste Schritte</h3>
            <ul className="space-y-2">
              {nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-blue-400 text-xs font-bold">{i + 1}</span>
                  </div>
                  <span className="text-zinc-300 text-sm">{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Kundenbetreuer */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Ihr Ansprechpartner</h3>
          {betreuer ? (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 font-semibold text-sm">
                  {(betreuer.vorname?.[0] ?? '').toUpperCase()}{(betreuer.nachname?.[0] ?? '').toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  {[betreuer.vorname, betreuer.nachname].filter(Boolean).join(' ')}
                </p>
                <p className="text-zinc-500 text-xs">Kundenbetreuer</p>
                {betreuer.telefon && (
                  <a href={`tel:${betreuer.telefon}`} className="text-blue-400 hover:text-blue-300 text-xs">
                    {betreuer.telefon}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-zinc-500 text-sm">Ihr Kundenbetreuer wird Ihnen in Kurze zugewiesen.</p>
            </div>
          )}
        </div>

        {/* Recent documents */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Dokumente</h3>
            <Link href={`/kunde/fall/${fallId}`} className="text-blue-400 hover:text-blue-300 text-xs">
              Alle anzeigen
            </Link>
          </div>
          {!dokumente?.length ? (
            <p className="text-zinc-600 text-sm">Noch keine Dokumente vorhanden.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {dokumente.slice(0, 8).map(doc => (
                <a
                  key={doc.id}
                  href={doc.datei_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square rounded-xl overflow-hidden bg-zinc-800 hover:opacity-80 transition-opacity"
                >
                  {doc.typ.startsWith('foto') ? (
                    <img src={doc.datei_url} alt={doc.datei_name ?? 'Dokument'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-zinc-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-zinc-500 text-[10px] text-center truncate w-full">{doc.datei_name}</span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Recent messages */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Nachrichten</h3>
            <Link href={`/kunde/fall/${fallId}`} className="text-blue-400 hover:text-blue-300 text-xs">
              Alle anzeigen
            </Link>
          </div>
          {!nachrichten?.length ? (
            <p className="text-zinc-600 text-sm">Noch keine Nachrichten.</p>
          ) : (
            <div className="space-y-2">
              {nachrichten.map(msg => {
                const isKunde = msg.typ === 'kunde-nachricht'
                return (
                  <div key={msg.id} className={`flex ${isKunde ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      isKunde ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200'
                    }`}>
                      <p className="text-sm line-clamp-2">{msg.beschreibung}</p>
                      <p className={`text-[10px] mt-1 ${isKunde ? 'text-blue-200' : 'text-zinc-500'}`}>
                        {new Date(msg.created_at).toLocaleString('de-DE', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Link to full case detail */}
        <Link
          href={`/kunde/fall/${fallId}`}
          className="block w-full py-4 text-center bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-white text-sm font-medium transition-colors"
        >
          Alle Details anzeigen
        </Link>
      </div>
    </div>
  )
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div>
      <div className="flex items-center gap-0 mt-1">
        {STATUS_STEPS.map((step, i) => {
          const reached = i <= currentStep
          const isCurrent = i === currentStep
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div
                className={`w-3 h-3 rounded-full shrink-0 border-2 transition-colors ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-500'
                    : reached
                    ? 'border-blue-500/60 bg-blue-500/60'
                    : 'border-zinc-700 bg-zinc-800'
                }`}
              />
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 rounded-full ${
                    i < currentStep ? 'bg-blue-500/60' : 'bg-zinc-800'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex mt-1.5">
        {STATUS_STEPS.map((step, i) => {
          const isCurrent = i === currentStep
          return (
            <div key={step.key} className={`flex-1 last:flex-none ${i === STATUS_STEPS.length - 1 ? 'text-right' : ''}`}>
              <span className={`text-[10px] leading-tight ${
                isCurrent ? 'text-blue-400 font-medium' : i <= currentStep ? 'text-zinc-500' : 'text-zinc-700'
              }`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Next Steps Helper ───────────────────────────────────────────────────────

function getNextSteps(status: string): string[] {
  switch (status) {
    case 'ersterfassung':
      return [
        'Ihr Schadensfall wird gepruft.',
        'Ein Sachverstandiger wird Ihnen zugewiesen.',
        'Sie werden uber den Termin informiert.',
      ]
    case 'sv-zugewiesen':
    case 'sv-termin':
      return [
        'Der Sachverstandige wird Ihren Schaden begutachten.',
        'Nach dem Termin erhalten Sie das Gutachten.',
      ]
    case 'gutachten-eingegangen':
    case 'filmcheck':
      return [
        'Das Gutachten wird gepruft.',
        'Ihr Fall wird an die Partnerkanzlei ubergeben.',
      ]
    case 'kanzlei-uebergeben':
    case 'anschlussschreiben':
      return [
        'Die Kanzlei setzt Ihren Anspruch bei der Versicherung durch.',
        'Sie werden uber den Fortschritt informiert.',
      ]
    case 'regulierung':
      return [
        'Die Regulierung lauft. Sie erhalten in Kurze Ihre Auszahlung.',
      ]
    case 'abgeschlossen':
      return ['Ihr Fall wurde erfolgreich abgeschlossen.']
    default:
      return []
  }
}
