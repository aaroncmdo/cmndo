// AAR-103: Kunden-Faelle-Liste (Multi-Fall Trennung)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CarIcon, CalendarIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function KundeFaelleListe() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_datum, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sv_termin, created_at')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })

  // Auto-Redirect bei nur 1 Fall
  if (faelle && faelle.length === 1) redirect(`/kunde/faelle/${faelle[0].id}`)

  if (!faelle || faelle.length === 0) {
    return (
      <div className="p-5 max-w-2xl mx-auto space-y-3">
        <h1 className="text-xl font-bold text-[#0D1B3E]">Meine Faelle</h1>
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">Noch keine Faelle vorhanden.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Meine Faelle</h1>
        <p className="text-sm text-gray-500 mt-1">Sie haben {faelle.length} aktive Faelle bei uns.</p>
      </div>
      <div className="space-y-3">
        {faelle.map(f => {
          const fahrzeug = [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ')
          return (
            <Link key={f.id} href={`/kunde/faelle/${f.id}`}
              className="block bg-white rounded-2xl border border-gray-200 p-5 hover:border-[#4573A2] hover:shadow-md transition-all">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#0D1B3E]">{f.fall_nummer ?? f.id.slice(0, 8)}</p>
                  {fahrzeug && (
                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-1.5">
                      <CarIcon className="w-3.5 h-3.5 text-gray-400" />
                      {fahrzeug} {f.kennzeichen && `· ${f.kennzeichen}`}
                    </p>
                  )}
                  {f.schadens_datum && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                      <CalendarIcon className="w-3 h-3" />
                      Schaden: {new Date(f.schadens_datum).toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 flex-shrink-0">
                  {f.status ?? '—'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
