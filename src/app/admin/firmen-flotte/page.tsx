// Firmen-Flotten-Konten: Admin-Liste + Anlage. Muster: admin/makler/page.tsx.
// firmen_flotten_konten ist noch nicht in database.types (Regel-2-Lag) -> AnyDb-Queries.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import FirmenFlotteAdminClient, { type FlottenKontoRow } from './FirmenFlotteAdminClient'

export const dynamic = 'force-dynamic'

export default async function FirmenFlotteAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (p?.rolle !== 'admin') redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: rawKonten } = await admin
    .from('firmen_flotten_konten')
    .select('user_id, firma_id, status, erstellt_am')
    .order('erstellt_am', { ascending: false })

  const kontenList: FlottenKontoRow[] = []
  if (Array.isArray(rawKonten)) {
    for (const k of rawKonten as Array<{
      user_id: string
      firma_id: string
      status: string | null
      erstellt_am: string | null
    }>) {
      const { data: prof } = await admin
        .from('profiles')
        .select('email, vorname, telefon')
        .eq('id', k.user_id)
        .maybeSingle()
      const { data: firma } = await admin
        .from('firmen')
        .select('name')
        .eq('id', k.firma_id)
        .maybeSingle()

      kontenList.push({
        user_id: k.user_id,
        firma_id: k.firma_id,
        firma_name: (firma?.name as string | null) ?? null,
        email: (prof?.email as string | null) ?? null,
        vorname: (prof?.vorname as string | null) ?? null,
        telefon: (prof?.telefon as string | null) ?? null,
        status: k.status,
        erstellt_am: k.erstellt_am,
      })
    }
  }

  return <FirmenFlotteAdminClient konten={kontenList} />
}
