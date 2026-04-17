// AAR-381: Platzhalter-Route für den Fokus-Modus.
// Die vollständige Shell (Mapbox 3D + Next-Stop-Panel + Swipe-Gesten) wird in
// AAR-382 implementiert. Dieser Stub verhindert 404s aus der „Tagesroute
// starten"-Aktion auf dem Heute-Tab und hält die Session-Logik (AAR-380)
// intakt — die Session wird bereits beim Start angelegt und kann jederzeit
// aus dem Heute-Tab fortgesetzt werden.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeftIcon, ConstructionIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { getTagesSession } from '@/lib/sv/tages-session'

export const dynamic = 'force-dynamic'

export default async function FeldmodusPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const session = await getTagesSession(sv.id, today)

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link
        href="/gutachter/heute"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--brand-primary,#4573A2)] hover:text-[#0D1B3E] mb-6"
      >
        <ArrowLeftIcon className="w-4 h-4" /> Zurück zum Heute-Tab
      </Link>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <ConstructionIcon className="w-5 h-5 text-amber-700" />
          <h1 className="text-lg font-semibold text-amber-900">
            Fokus-Modus in Arbeit
          </h1>
        </div>
        <p className="text-sm text-amber-900 mb-3">
          Die Fokus-Modus-Shell (Mapbox 3D, Next-Stop-Panel, Swipe-Gesten,
          Losfahren/Ankommen/Abschluss) wird in AAR-382 implementiert.
        </p>
        {session ? (
          <p className="text-xs text-amber-800">
            Deine Tages-Session ({session.status}) ist bereits angelegt und
            bleibt beim nächsten Start bestehen.
          </p>
        ) : (
          <p className="text-xs text-amber-800">
            Aktuell läuft keine Tages-Session.
          </p>
        )}
      </div>
    </div>
  )
}
