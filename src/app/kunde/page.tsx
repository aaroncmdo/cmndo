import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { berechneProgress, SZENARIO_PHASEN } from '@/components/kunde/stepperConfig'

export default async function KundeStartseite() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  try {
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()

  // Alle Faelle des Kunden
  let faelle: Record<string, unknown>[] = []

  const { data: directFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, gutachter_termin_status, regulierung_am, szenario, onboarding_complete, kunde_id, created_at')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })

  faelle = directFaelle ?? []

  // Fallback via Lead-Email
  if (faelle.length === 0) {
    const { data: leads } = await supabase.from('leads').select('id').eq('email', user.email!)
    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length) {
      const { data } = await supabase
        .from('faelle')
        .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, gutachter_termin_status, regulierung_am, szenario, onboarding_complete, kunde_id, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      faelle = data ?? []
    }
  }

  // Onboarding-Redirect
  // BUG-63: Redirect auf Fall-Detail statt /kunde/onboarding (Route existiert nicht)
  const needsOnboarding = faelle.find(f => f.onboarding_complete === false)
  if (needsOnboarding) redirect(`/kunde/faelle/${needsOnboarding.id}`)

  // KFZ-128: Ungelesene Nachrichten pro Fall zaehlen (non-critical)
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const faelleWithUnread = await Promise.all(faelle.map(async (f) => {
      const { count } = await admin
        .from('nachrichten')
        .select('id', { count: 'exact', head: true })
        .eq('fall_id', f.id as string)
        .eq('gelesen', false)
        .neq('sender_id', user.id)
      return { ...f, ungelesene_nachrichten: count ?? 0 }
    }))
    // Sortierung: Faelle mit ungelesenen Nachrichten OBEN
    faelleWithUnread.sort((a, b) => b.ungelesene_nachrichten - a.ungelesene_nachrichten)
    faelle = faelleWithUnread
  } catch (e) {
    console.error('[KundeStartseite] Ungelesene Nachrichten Fehler:', e)
    // Seite funktioniert trotzdem — ohne Badges
  }

  const vorname = profile?.vorname ?? user.email?.split('@')[0] ?? 'Kunde'

  return (
    <div className="w-full px-4 md:px-8 py-6 max-w-xl md:max-w-none mx-auto">
      <h1 className="text-xl font-bold text-[#0D1B3E] mb-1">Hallo {vorname}</h1>
      <p className="text-sm text-gray-500 mb-6">Hier sehen Sie den Stand Ihrer Fälle.</p>

      {faelle.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-[#0D1B3E] font-semibold">Noch kein Schadensfall</p>
          <p className="text-sm text-gray-500 mt-1">Sobald ein Fall für Sie angelegt wird, erscheint er hier.</p>
        </div>
      ) : (
        <div className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">
          {faelle.map(fall => {
            const szenario = ((fall.szenario as string) ?? 'normalfall') as keyof typeof SZENARIO_PHASEN
            const phasen = SZENARIO_PHASEN[szenario] ?? SZENARIO_PHASEN.normalfall
            const progress = berechneProgress(fall, phasen)
            const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
            const currentPhase = phasen[progress.phase]

            return (
              <Link key={fall.id as string} href={`/kunde/faelle/${fall.id}`}
                className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow active:scale-[0.99]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[#0D1B3E] font-semibold text-base">{(fall.kennzeichen as string) || (fall.fall_nummer as string) || 'Fall'}</p>
                    {fahrzeug && <p className="text-sm text-gray-500">{fahrzeug}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {((fall as Record<string, unknown>).ungelesene_nachrichten as number) > 0 && (
                      <span className="inline-flex items-center gap-0.5 bg-[#4573A2] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        💬 {(fall as Record<string, unknown>).ungelesene_nachrichten as number}
                      </span>
                    )}
                    <span className="text-sm font-bold text-[#4573A2]">{progress.pct}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full mb-3">
                  <div className="h-full bg-[#4573A2] rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="text-sm font-medium text-[#0D1B3E]">{currentPhase?.label ?? 'In Bearbeitung'}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
  } catch (err) {
    console.error('[KundeStartseite] Error:', err)
    return (
      <div className="w-full px-4 md:px-8 py-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-[#0D1B3E] font-semibold">Fehler beim Laden</p>
          <p className="text-sm text-gray-500 mt-1">Bitte versuchen Sie es erneut.</p>
        </div>
      </div>
    )
  }
}
