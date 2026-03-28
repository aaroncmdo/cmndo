import { createClient } from '@/lib/supabase/server'
import FlowWizard from './FlowWizard'

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  // Try to load existing lead data (admin-sent flow)
  const { data: lead } = await supabase
    .from('leads')
    .select('vorname, nachname, email, telefon')
    .eq('id', token)
    .maybeSingle()

  return (
    <FlowWizard
      token={token}
      initialData={lead ? {
        vorname: lead.vorname ?? '',
        nachname: lead.nachname ?? '',
        email: lead.email ?? '',
        telefon: lead.telefon ?? '',
      } : undefined}
    />
  )
}
