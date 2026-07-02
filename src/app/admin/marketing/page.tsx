import Link from 'next/link'
import { SectionCard } from '@/components/shared/SectionCard'

export default function MarketingPage() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-bold text-claimondo-navy">Marketing</h1>
          <p className="mt-0.5 text-body-sm text-claimondo-ondo">Automatisierte Kanäle &amp; Freigaben</p>
        </div>
      </div>
      <Link href="/admin/marketing/linkedin" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">LinkedIn Auto-Posting</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            Entwürfe aus dem Wissens-Feed prüfen und auf die Company-Page freigeben.
          </p>
        </SectionCard>
      </Link>
    </div>
  )
}
