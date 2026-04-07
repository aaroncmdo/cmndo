import { createClient } from '@/lib/supabase/server'
import VersicherungenClient from './VersicherungenClient'

export default async function VersicherungenPage() {
  const supabase = await createClient()

  const { data: versicherungen } = await supabase
    .from('versicherungen')
    .select('*')
    .order('name', { ascending: true })

  return <VersicherungenClient versicherungen={versicherungen ?? []} />
}
