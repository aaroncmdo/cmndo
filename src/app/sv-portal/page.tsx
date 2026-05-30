// AAR-939 · Monika-Embed · Stream 6 — SV-Portal Landing.
// Kein reiner redirect()-Stub (RSC-Redirect-Anti-Pattern, React #310/#418) —
// stattdessen eine schlanke Landing mit 2 Einstiegen.

import Link from 'next/link'
import { Code2Icon, InboxIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'

export const dynamic = 'force-dynamic'

export default function SVPortalIndex() {
  return (
    <div className="py-6 space-y-4">
      <PageHeader
        title="SV-Portal"
        description="Verwalte deine Embed-Sites und sieh deine eingehenden Anfragen."
        size="lg"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/sv-portal/embed-sites" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo rounded-ios-lg">
          <SectionCard title="Embed-Sites" icon={<Code2Icon style={{ width: 18, height: 18 }} />}>
            <p className="text-sm text-claimondo-ondo">
              Lege Widget-Sites an, wähle Variante A oder B und kopiere dein Einbinde-Snippet.
            </p>
          </SectionCard>
        </Link>
        <Link href="/sv-portal/anfragen" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo rounded-ios-lg">
          <SectionCard title="Anfragen" icon={<InboxIcon style={{ width: 18, height: 18 }} />}>
            <p className="text-sm text-claimondo-ondo">
              Deine über das Widget eingegangenen Anfragen — inkl. Status und Termin.
            </p>
          </SectionCard>
        </Link>
      </div>
    </div>
  )
}
