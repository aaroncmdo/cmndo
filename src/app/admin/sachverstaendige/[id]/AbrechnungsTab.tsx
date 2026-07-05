import { PartnerBillingPanel } from '@/components/shared/finance/PartnerBillingPanel'
import type { PartnerBillingRow, PartnerBillingAggregat } from '@/lib/finance/partner-billing'

interface AbrechnungsTabProps {
  rows: PartnerBillingRow[]
  aggregat: PartnerBillingAggregat
}

export default function AbrechnungsTab({ rows, aggregat }: AbrechnungsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-claimondo-bg/30">
      <div className="max-w-4xl mx-auto">
        <PartnerBillingPanel rows={rows} aggregat={aggregat} />
      </div>
    </div>
  )
}
