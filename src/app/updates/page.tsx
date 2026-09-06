import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUpdates } from '@/lib/updates/get-updates'
import { splitUpdates, routeForKontext } from '@/lib/updates/split'
import { roleToPath } from '@/lib/auth/role-redirect'
import { isOperativeUpdatesRole } from '@/lib/updates/updates-page-access'
import { UpdatesWorklist } from './UpdatesWorklist'

// Phase 5 Teil D: /updates-Vollseite (Worklist) fuer operative Rollen
// (dispatch/SV/KB/kanzlei/werkstatt/admin). Kunde/makler -> Popover reicht ->
// Redirect auf ihr Portal. Datenquelle = bestehendes DB-getriebenes getUpdates.
export default async function UpdatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  const rolle = (profile?.rolle as string) ?? ''
  if (!isOperativeUpdatesRole(rolle)) redirect(roleToPath(rolle))

  const raw = await getUpdates(supabase, user.id, rolle)
  // Action-Items kommen ohne routeUrl (die Derive-RPC kennt die Rolle nicht) ->
  // rollen-bewusst aus dem Kontext aufloesen (spiegelt useUpdates).
  const items = raw.map((i) =>
    i.routeUrl ? i : { ...i, routeUrl: routeForKontext(i.kontextTyp, i.kontextId, rolle) },
  )
  const { actionItems, infoItems } = splitUpdates(items, null)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-heading-md font-bold text-claimondo-navy mb-1">Updates</h1>
      <p className="text-sm text-claimondo-ondo mb-4">
        Ihre offene Worklist („Braucht Sie") und der Verlauf — filterbar nach Typ.
      </p>
      <UpdatesWorklist actionItems={actionItems} infoItems={infoItems} />
    </div>
  )
}
