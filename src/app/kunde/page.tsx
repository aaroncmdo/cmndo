import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// ─── Phase Mapping ──────────────────────────────────────────────────────────

const PHASES = [
  { key: 'kontakt', label: 'Kontakt', pct: 5 },
  { key: 'sa', label: 'SA unterschrieben', pct: 10 },
  { key: 'sv-zugewiesen', label: 'Gutachter', pct: 15 },
  { key: 'termin', label: 'Termin', pct: 20 },
  { key: 'besichtigung', label: 'Besichtigung', pct: 30 },
  { key: 'gutachten-erstellt', label: 'Gutachten', pct: 50 },
  { key: 'gutachten-fertig', label: 'Fertig', pct: 55 },
  { key: 'kanzlei', label: 'Kanzlei', pct: 65 },
  { key: 'ansprueche', label: 'Ansprueche', pct: 75 },
  { key: 'regulierung', label: 'Regulierung', pct: 85 },
  { key: 'abgeschlossen', label: 'Auszahlung', pct: 100 },
]

function getProgress(fall: Record<string, unknown>): { pct: number; label: string; next: string } {
  const status = (fall.status as string) ?? 'ersterfassung'
  const sa = fall.sa_unterschrieben === true
  const svId = fall.sv_id as string | null
  const svTermin = fall.sv_termin as string | null
  const gutachtenAm = fall.gutachten_eingegangen_am as string | null

  if (status === 'abgeschlossen') return { pct: 100, label: 'Abgeschlossen', next: 'Ihr Schadensfall wurde erfolgreich abgeschlossen!' }
  if (status === 'regulierung') return { pct: 85, label: 'Regulierung', next: 'Die Versicherung bearbeitet Ihren Schaden.' }
  if (status === 'anschlussschreiben') return { pct: 75, label: 'Ansprueche eingereicht', next: 'Die Kanzlei hat Ihre Ansprueche geltend gemacht.' }
  if (status === 'kanzlei-uebergeben') return { pct: 65, label: 'Kanzlei', next: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.' }
  if (status === 'filmcheck' || status === 'qc-pruefung') return { pct: 55, label: 'Gutachten fertig', next: 'Ihr Gutachten wird geprueft.' }
  if (gutachtenAm || status === 'gutachten-eingegangen') return { pct: 55, label: 'Gutachten fertig', next: 'Ihr Gutachten ist fertig.' }
  if (status === 'besichtigung') return { pct: 30, label: 'Besichtigung', next: 'Der Gutachter besichtigt Ihr Fahrzeug.' }
  if (svTermin) return { pct: 20, label: 'Termin vereinbart', next: `Besichtigungstermin: ${new Date(svTermin).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` }
  if (svId) return { pct: 15, label: 'Gutachter zugewiesen', next: 'Ihr Gutachter meldet sich fuer einen Termin.' }
  if (sa) return { pct: 10, label: 'SA unterschrieben', next: 'Ein Gutachter wird Ihnen zugewiesen.' }
  return { pct: 5, label: 'Kontakt aufgenommen', next: 'Ihr Fall wird geprueft.' }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function KundeDashboard() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()

  // Alle Faelle des Kunden laden
  const { data: directFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, onboarding_complete, created_at')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })

  let faelle = directFaelle ?? []

  // Fallback: ueber Lead-Email
  if (faelle.length === 0) {
    const { data: leads } = await supabase.from('leads').select('id').eq('email', user.email!)
    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length) {
      const { data } = await supabase
        .from('faelle')
        .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, onboarding_complete, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      faelle = data ?? []
    }
  }

  // Onboarding-Redirect fuer ersten unvollstaendigen Fall
  const needsOnboarding = faelle.find(f => f.onboarding_complete === false)
  if (needsOnboarding) redirect(`/kunde/onboarding/${needsOnboarding.id}`)

  const vorname = profile?.vorname ?? user.email?.split('@')[0] ?? 'Kunde'

  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto">
      {/* Greeting */}
      <h1 className="text-xl font-bold text-[#0D1B3E] mb-1">Hallo {vorname}</h1>
      <p className="text-sm text-gray-500 mb-6">Hier sehen Sie den Stand Ihrer Faelle.</p>

      {faelle.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-[#0D1B3E] font-semibold">Noch kein Schadensfall</p>
          <p className="text-sm text-gray-500 mt-1">Sobald ein Fall fuer Sie angelegt wird, erscheint er hier.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {faelle.map(fall => {
            const { pct, label, next } = getProgress(fall as Record<string, unknown>)
            const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')
            return (
              <Link key={fall.id} href={`/kunde/fall/${fall.id}`}
                className="block bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow active:scale-[0.99]">
                {/* Kennzeichen + Fahrzeug */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[#0D1B3E] font-semibold text-base">{fall.kennzeichen || fall.fall_nummer || 'Fall'}</p>
                    {fahrzeug && <p className="text-sm text-gray-500">{fahrzeug}</p>}
                  </div>
                  <span className="text-sm font-bold text-[#4573A2]">{pct}%</span>
                </div>

                {/* Fortschrittsbalken */}
                <div className="w-full h-2 bg-gray-100 rounded-full mb-3">
                  <div className="h-full bg-[#4573A2] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>

                {/* Status + Naechster Schritt */}
                <p className="text-sm font-medium text-[#0D1B3E] mb-1">{label}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{next}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
