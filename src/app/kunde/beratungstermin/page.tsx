import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAvailableKbSlots } from '@/lib/termine/kb-slots'
import BeratungsterminClient from './BeratungsterminClient'

export default async function BeratungsterminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load fall for current user
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, kundenbetreuer_id, fall_nummer')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  const fall = faelle?.[0] ?? null

  if (!fall || !fall.kundenbetreuer_id) {
    return (
      <div className="w-full px-4 md:px-8 py-6 max-w-xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-[#0D1B3E] font-semibold">Kein Fall gefunden</p>
          <p className="text-sm text-gray-500 mt-1">Es ist noch kein Kundenbetreuer zugewiesen.</p>
        </div>
      </div>
    )
  }

  // Load KB profile
  const { data: kbProfile } = await supabase
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', fall.kundenbetreuer_id)
    .single()

  // Load available slots
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  const slots = await getAvailableKbSlots(fall.kundenbetreuer_id)

  // Check existing open kb_beratung termin
  const { data: existingTermine } = await db
    .from('gutachter_termine')
    .select('id, start_zeit, kanal, video_link, notiz_kunde, status')
    .eq('fall_id', fall.id)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .is('cancelled_at', null)
    .order('start_zeit', { ascending: true })
    .limit(1)

  const existingTermin = existingTermine?.[0] ?? null

  return (
    <BeratungsterminClient
      fallId={fall.id}
      kbVorname={kbProfile?.vorname ?? 'Ihrem Berater'}
      slots={slots}
      existingTermin={existingTermin}
    />
  )
}
